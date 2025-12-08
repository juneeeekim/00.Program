/**
 * ============================================================================
 * BackupManager.js - Firebase 데이터 백업/복원 관리자
 * ============================================================================
 * 
 * @description Firebase Spark 무료 요금제에서 작동하는 클라이언트 사이드 백업 시스템
 * @version 1.0.0
 * @author 시니어 개발자, 주니어 개발자
 * @date 2025-12-08
 * 
 * ============================================================================
 * 주요 기능:
 * - exportAllData(): 모든 컬렉션 데이터 수집
 * - downloadBackup(): JSON 파일 다운로드
 * - (Phase 2) importData(): 백업 파일 읽기 및 파싱
 * - (Phase 2) validateBackup(): 백업 데이터 유효성 검증
 * - (Phase 2) restoreData(): Firestore에 데이터 복원
 * ============================================================================
 */

class BackupManager {
  // ============================================================================
  // 상수 정의
  // ============================================================================
  static BACKUP_VERSION = '1.0';
  static APP_NAME = 'prompt_text';

  // ============================================================================
  // 생성자 및 초기화
  // ============================================================================
  
  /**
   * BackupManager 생성자
   * @param {Object} db - Firestore 데이터베이스 인스턴스
   * @param {Object} auth - Firebase Auth 인스턴스
   * @throws {Error} db 또는 auth가 없을 경우 에러 발생
   */
  constructor(db, auth) {
    if (!db || !auth) {
      throw new Error('BackupManager: db와 auth는 필수 파라미터입니다.');
    }
    this.db = db;
    this.auth = auth;
    this.currentUser = null;
  }

  /**
   * 현재 사용자 설정
   * @param {Object} user - Firebase 사용자 객체
   */
  setCurrentUser(user) {
    this.currentUser = user;
  }

  // ============================================================================
  // 백업 기능 (Export)
  // ============================================================================

  /**
   * 모든 데이터를 수집하여 백업 객체 생성
   * @returns {Object} 백업 데이터 객체 (meta + data)
   * @throws {Error} 로그인되지 않았거나 데이터 수집 실패 시
   */
  async exportAllData() {
    try {
      // 로그인 확인
      if (!this.currentUser) {
        throw new Error('로그인이 필요합니다.');
      }

      console.log('📦 백업 데이터 수집 시작...');

      // 모든 컬렉션 데이터를 병렬로 수집 (성능 최적화)
      const [prompts, versions, executionHistory] = await Promise.all([
        this._getPrompts(),
        this._getVersions(),
        this._getExecutionHistory()
      ]);

      // 백업 데이터 구조 생성
      const backupData = {
        meta: {
          version: BackupManager.BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          appName: BackupManager.APP_NAME,
          userId: this.currentUser.uid,
          userEmail: this.currentUser.email,
          collections: {
            prompts: prompts.length,
            versions: versions.length,
            executionHistory: executionHistory.length
          }
        },
        data: {
          prompts,
          versions,
          executionHistory
        }
      };

      console.log('✅ 백업 데이터 수집 완료:', backupData.meta);
      return backupData;

    } catch (error) {
      console.error('❌ 백업 데이터 수집 실패:', error);
      throw new Error(`백업 데이터 수집에 실패했습니다: ${error.message}`);
    }
  }

  /**
   * 백업 데이터를 JSON 파일로 다운로드
   * @returns {Object} 백업 메타데이터
   * @throws {Error} 백업 생성 또는 다운로드 실패 시
   */
  async downloadBackup() {
    try {
      // 백업 데이터 생성
      const backupData = await this.exportAllData();
      
      // JSON 문자열로 변환 (가독성을 위해 들여쓰기 적용)
      const jsonString = JSON.stringify(backupData, null, 2);
      
      // Blob 생성 및 다운로드 URL 생성
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // 파일명 생성 (prompt_hub_backup_YYYYMMDD.json)
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `prompt_hub_backup_${date}.json`;

      // 다운로드 트리거
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 메모리 해제
      URL.revokeObjectURL(url);

      console.log('✅ 백업 다운로드 완료:', filename);
      return backupData.meta;

    } catch (error) {
      console.error('❌ 백업 다운로드 실패:', error);
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods - 데이터 수집
  // ============================================================================

  /**
   * 모든 프롬프트 데이터 가져오기
   * @returns {Array} 프롬프트 데이터 배열
   * @private
   */
  async _getPrompts() {
    try {
      const snapshot = await this.db
        .collection(`users/${this.currentUser.uid}/prompts`)
        .get();
      return snapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error('❌ 프롬프트 데이터 수집 실패:', error);
      throw error;
    }
  }

  /**
   * 모든 버전 데이터 가져오기
   * @returns {Array} 버전 데이터 배열 (promptId 포함)
   * @private
   * 
   * 주의: 각 프롬프트별로 서브컬렉션을 조회하는 방식
   * 데이터가 많아지면 비효율적일 수 있음 - 추후 최적화 필요
   */
  async _getVersions() {
    try {
      // 프롬프트 ID 목록 가져오기
      const promptsSnapshot = await this.db
        .collection(`users/${this.currentUser.uid}/prompts`)
        .get();
      const promptIds = promptsSnapshot.docs.map((doc) => doc.id);

      let allVersions = [];

      // 병렬 처리로 각 프롬프트의 버전 수집
      const versionPromises = promptIds.map(async (promptId) => {
        const versionsSnapshot = await this.db
          .collection(`users/${this.currentUser.uid}/prompts/${promptId}/versions`)
          .get();
        return versionsSnapshot.docs.map((doc) => {
          const data = doc.data();
          data.promptId = promptId; // 복원 시 필요한 부모 프롬프트 ID 포함
          return data;
        });
      });

      const results = await Promise.all(versionPromises);
      results.forEach((versions) => {
        allVersions = allVersions.concat(versions);
      });

      return allVersions;

    } catch (error) {
      console.error('❌ 버전 데이터 수집 실패:', error);
      throw error;
    }
  }

  /**
   * 모든 실행 이력 데이터 가져오기
   * @returns {Array} 실행 이력 데이터 배열
   * @private
   */
  async _getExecutionHistory() {
    try {
      const snapshot = await this.db
        .collection(`users/${this.currentUser.uid}/executionHistory`)
        .get();
      return snapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error('❌ 실행 이력 데이터 수집 실패:', error);
      throw error;
    }
  }

  // ============================================================================
  // 복원 기능 (Import) - Phase 2
  // ============================================================================

  /**
   * JSON 백업 파일 읽기 및 파싱
   * @param {File} file - 사용자가 선택한 백업 파일
   * @returns {Promise<Object>} 파싱된 백업 데이터
   * @throws {Error} 파일 읽기 또는 파싱 실패 시
   */
  async importData(file) {
    try {
      if (!file) {
        throw new Error('백업 파일을 선택해주세요.');
      }

      // 파일 확장자 확인
      if (!file.name.endsWith('.json')) {
        throw new Error('JSON 형식의 백업 파일만 지원합니다.');
      }

      console.log('📥 백업 파일 읽기 시작:', file.name);

      // FileReader를 사용하여 파일 읽기
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
          try {
            const jsonString = event.target.result;
            const backupData = JSON.parse(jsonString);
            console.log('✅ 백업 파일 파싱 완료');
            resolve(backupData);
          } catch (parseError) {
            console.error('❌ JSON 파싱 실패:', parseError);
            reject(new Error('백업 파일 형식이 올바르지 않습니다. 손상된 파일일 수 있습니다.'));
          }
        };

        reader.onerror = () => {
          console.error('❌ 파일 읽기 실패');
          reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
        };

        reader.readAsText(file);
      });

    } catch (error) {
      console.error('❌ 백업 파일 가져오기 실패:', error);
      throw error;
    }
  }

  /**
   * 백업 데이터 유효성 검증
   * @param {Object} data - 파싱된 백업 데이터
   * @returns {Object} 검증 결과 { isValid: boolean, errors: string[], warnings: string[] }
   */
  validateBackup(data) {
    const errors = [];
    const warnings = [];

    console.log('🔍 백업 데이터 유효성 검증 시작...');

    // 1. 메타데이터 존재 확인
    if (!data || !data.meta) {
      errors.push('메타데이터가 없습니다. 올바른 백업 파일이 아닙니다.');
      return { isValid: false, errors, warnings };
    }

    // 2. 앱 이름 확인 (다른 앱 백업 파일 거부)
    if (data.meta.appName !== BackupManager.APP_NAME) {
      errors.push(`다른 앱의 백업 파일입니다. (예상: ${BackupManager.APP_NAME}, 실제: ${data.meta.appName})`);
    }

    // 3. 버전 호환성 확인
    if (!data.meta.version) {
      warnings.push('버전 정보가 없습니다. 호환성 문제가 발생할 수 있습니다.');
    } else if (data.meta.version !== BackupManager.BACKUP_VERSION) {
      warnings.push(`백업 버전이 다릅니다. (현재: ${BackupManager.BACKUP_VERSION}, 파일: ${data.meta.version})`);
    }

    // 4. 필수 데이터 컬렉션 존재 확인
    if (!data.data) {
      errors.push('데이터 섹션이 없습니다.');
      return { isValid: false, errors, warnings };
    }

    // 5. 각 컬렉션 배열 형태 확인
    if (!Array.isArray(data.data.prompts)) {
      errors.push('prompts 데이터가 올바른 형식이 아닙니다.');
    }
    if (!Array.isArray(data.data.versions)) {
      errors.push('versions 데이터가 올바른 형식이 아닙니다.');
    }
    if (!Array.isArray(data.data.executionHistory)) {
      errors.push('executionHistory 데이터가 올바른 형식이 아닙니다.');
    }

    // 6. 데이터 개수 확인 (경고 수준)
    const totalItems = 
      (data.data.prompts?.length || 0) + 
      (data.data.versions?.length || 0) + 
      (data.data.executionHistory?.length || 0);
    
    if (totalItems === 0) {
      warnings.push('백업 파일에 데이터가 없습니다.');
    }

    const isValid = errors.length === 0;
    
    if (isValid) {
      console.log('✅ 백업 데이터 유효성 검증 통과');
    } else {
      console.error('❌ 백업 데이터 유효성 검증 실패:', errors);
    }

    return { isValid, errors, warnings };
  }

  /**
   * 복원 전 현재 데이터 자동 백업
   * @returns {Promise<Object>} 자동 백업 메타데이터
   */
  async createAutoBackup() {
    try {
      console.log('🔄 복원 전 자동 백업 생성 중...');
      
      // 기존 downloadBackup 메서드 활용
      const meta = await this.downloadBackup();
      
      console.log('✅ 자동 백업 완료');
      return meta;

    } catch (error) {
      console.error('❌ 자동 백업 생성 실패:', error);
      throw new Error(`자동 백업 생성에 실패했습니다: ${error.message}`);
    }
  }

  /**
   * 백업 데이터를 Firestore에 복원
   * @param {Object} data - 검증된 백업 데이터
   * @param {Function} onProgress - 진행률 콜백 (optional)
   * @returns {Promise<Object>} 복원 결과 { success: boolean, restored: Object }
   */
  async restoreData(data, onProgress = null) {
    try {
      if (!this.currentUser) {
        throw new Error('로그인이 필요합니다.');
      }

      // 유효성 검증
      const validation = this.validateBackup(data);
      if (!validation.isValid) {
        throw new Error(`백업 데이터 검증 실패: ${validation.errors.join(', ')}`);
      }

      console.log('📥 데이터 복원 시작...');

      // 진행률 초기화
      const totalItems = 
        data.data.prompts.length + 
        data.data.versions.length + 
        data.data.executionHistory.length;
      let processedItems = 0;

      // 진행률 업데이트 헬퍼 함수
      const updateProgress = () => {
        processedItems++;
        if (onProgress && typeof onProgress === 'function') {
          const percent = Math.round((processedItems / totalItems) * 100);
          onProgress(percent, processedItems, totalItems);
        }
      };

      // 1. 프롬프트 복원
      const promptsRestored = await this._restorePrompts(data.data.prompts, updateProgress);
      
      // 2. 버전 복원
      const versionsRestored = await this._restoreVersions(data.data.versions, updateProgress);
      
      // 3. 실행 이력 복원
      const historyRestored = await this._restoreExecutionHistory(data.data.executionHistory, updateProgress);

      const result = {
        success: true,
        restored: {
          prompts: promptsRestored,
          versions: versionsRestored,
          executionHistory: historyRestored
        }
      };

      console.log('✅ 데이터 복원 완료:', result.restored);
      return result;

    } catch (error) {
      console.error('❌ 데이터 복원 실패:', error);
      throw new Error(`데이터 복원에 실패했습니다: ${error.message}`);
    }
  }

  // ============================================================================
  // Private Helper Methods - 데이터 복원
  // ============================================================================

  /**
   * 프롬프트 데이터 복원
   * @param {Array} prompts - 복원할 프롬프트 배열
   * @param {Function} onItemComplete - 항목 완료 콜백
   * @returns {Promise<number>} 복원된 프롬프트 수
   * @private
   */
  async _restorePrompts(prompts, onItemComplete) {
    try {
      let restoredCount = 0;
      
      // 배치 처리로 성능 최적화 (Firestore 배치 쓰기)
      const batch = this.db.batch();
      
      for (const prompt of prompts) {
        if (!prompt.id) {
          console.warn('⚠️ ID가 없는 프롬프트 스킵:', prompt);
          continue;
        }

        const promptRef = this.db
          .collection(`users/${this.currentUser.uid}/prompts`)
          .doc(prompt.id);
        
        batch.set(promptRef, prompt, { merge: true });
        restoredCount++;
        
        if (onItemComplete) onItemComplete();
      }

      // 배치 커밋
      await batch.commit();
      console.log(`✅ 프롬프트 ${restoredCount}개 복원 완료`);
      
      return restoredCount;

    } catch (error) {
      console.error('❌ 프롬프트 복원 실패:', error);
      throw error;
    }
  }

  /**
   * 버전 데이터 복원
   * @param {Array} versions - 복원할 버전 배열
   * @param {Function} onItemComplete - 항목 완료 콜백
   * @returns {Promise<number>} 복원된 버전 수
   * @private
   */
  async _restoreVersions(versions, onItemComplete) {
    try {
      let restoredCount = 0;

      // 프롬프트별로 그룹화
      const versionsByPrompt = {};
      for (const version of versions) {
        if (!version.promptId || !version.id) {
          console.warn('⚠️ promptId 또는 id가 없는 버전 스킵:', version);
          continue;
        }
        if (!versionsByPrompt[version.promptId]) {
          versionsByPrompt[version.promptId] = [];
        }
        versionsByPrompt[version.promptId].push(version);
      }

      // 각 프롬프트별로 배치 처리
      for (const promptId of Object.keys(versionsByPrompt)) {
        const batch = this.db.batch();
        
        for (const version of versionsByPrompt[promptId]) {
          const versionRef = this.db
            .collection(`users/${this.currentUser.uid}/prompts/${promptId}/versions`)
            .doc(version.id);
          
          // promptId는 복원 시에만 사용하므로 저장 시 제거
          const versionData = { ...version };
          delete versionData.promptId;
          
          batch.set(versionRef, versionData, { merge: true });
          restoredCount++;
          
          if (onItemComplete) onItemComplete();
        }

        await batch.commit();
      }

      console.log(`✅ 버전 ${restoredCount}개 복원 완료`);
      return restoredCount;

    } catch (error) {
      console.error('❌ 버전 복원 실패:', error);
      throw error;
    }
  }

  /**
   * 실행 이력 데이터 복원
   * @param {Array} histories - 복원할 실행 이력 배열
   * @param {Function} onItemComplete - 항목 완료 콜백
   * @returns {Promise<number>} 복원된 이력 수
   * @private
   */
  async _restoreExecutionHistory(histories, onItemComplete) {
    try {
      let restoredCount = 0;
      
      // 배치 처리
      const batch = this.db.batch();
      
      for (const history of histories) {
        if (!history.id) {
          console.warn('⚠️ ID가 없는 실행 이력 스킵:', history);
          continue;
        }

        const historyRef = this.db
          .collection(`users/${this.currentUser.uid}/executionHistory`)
          .doc(history.id);
        
        batch.set(historyRef, history, { merge: true });
        restoredCount++;
        
        if (onItemComplete) onItemComplete();
      }

      // 배치 커밋
      await batch.commit();
      console.log(`✅ 실행 이력 ${restoredCount}개 복원 완료`);
      
      return restoredCount;

    } catch (error) {
      console.error('❌ 실행 이력 복원 실패:', error);
      throw error;
    }
  }
}

// ============================================================================
// 모듈 내보내기
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackupManager;
} else {
  window.BackupManager = BackupManager;
}
