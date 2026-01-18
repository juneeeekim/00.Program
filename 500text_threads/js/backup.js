/**
 * ==================== BackupManager ====================
 * 데이터 백업 및 복원 관리 모듈
 *
 * [역할]
 * - Firebase Firestore 데이터를 JSON으로 내보내기
 * - JSON 파일에서 데이터 복원 (가져오기)
 * - texts, posts, urlLinks 컬렉션 지원
 *
 * [컬렉션 구조]
 * - users/{userId}/texts - 저장된 글
 * - users/{userId}/posts - 트래킹 포스트
 * - users/{userId}/urlLinks - URL 바로가기
 *
 * [생성일] 2026-01-18
 */

import { logger } from './logger.js';

/**
 * 백업 관리 클래스
 */
export class BackupManager {
    /**
     * @param {object} mainApp - DualTextWriter 인스턴스 참조
     */
    constructor(mainApp) {
        this.mainApp = mainApp;
        this.isExporting = false;
        this.isImporting = false;
        this.selectedFile = null;

        // DOM 요소 캐싱
        this.exportBtn = null;
        this.importBtn = null;
        this.fileSelectBtn = null;
        this.fileInput = null;
        this.fileNameDisplay = null;
        this.exportStatus = null;
        this.importStatus = null;
    }

    /**
     * 초기화 - DOM 요소 캐싱 및 이벤트 바인딩
     * @returns {boolean} 초기화 성공 여부
     */
    init() {
        logger.log('[BackupManager] 초기화 시작');

        if (!this._cacheDOM()) {
            logger.warn('[BackupManager] DOM 요소를 찾을 수 없습니다');
            return false;
        }

        this._bindEvents();
        logger.log('[BackupManager] 초기화 완료');
        return true;
    }

    /**
     * DOM 요소 캐싱
     * @returns {boolean} 캐싱 성공 여부
     */
    _cacheDOM() {
        this.exportBtn = document.getElementById('backup-export-btn');
        this.importBtn = document.getElementById('backup-import-btn');
        this.fileSelectBtn = document.getElementById('backup-file-select-btn');
        this.fileInput = document.getElementById('backup-file-input');
        this.fileNameDisplay = document.getElementById('backup-file-name');
        this.exportStatus = document.getElementById('backup-export-status');
        this.importStatus = document.getElementById('backup-import-status');

        // 필수 요소 체크
        if (!this.exportBtn || !this.importBtn || !this.fileInput) {
            return false;
        }
        return true;
    }

    /**
     * 이벤트 바인딩
     */
    _bindEvents() {
        // 내보내기 버튼
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportAllData());
        }

        // 파일 선택 버튼
        if (this.fileSelectBtn) {
            this.fileSelectBtn.addEventListener('click', () => {
                this.fileInput.click();
            });
        }

        // 파일 선택 시
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        }

        // 가져오기 버튼
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.importAllData());
        }

        logger.log('[BackupManager] 이벤트 바인딩 완료');
    }

    /**
     * 파일 선택 처리
     * @param {Event} e - 이벤트 객체
     */
    _handleFileSelect(e) {
        const file = e.target.files[0];
        
        if (!file) {
            this.selectedFile = null;
            this.fileNameDisplay.textContent = '선택된 파일 없음';
            this.importBtn.disabled = true;
            return;
        }

        // JSON 파일만 허용
        if (!file.name.endsWith('.json')) {
            this._showStatus('import', 'error', '❌ JSON 파일만 선택할 수 있습니다.');
            this.selectedFile = null;
            this.fileNameDisplay.textContent = '선택된 파일 없음';
            this.importBtn.disabled = true;
            return;
        }

        this.selectedFile = file;
        this.fileNameDisplay.textContent = file.name;
        this.importBtn.disabled = false;
        this._showStatus('import', 'ready', '✅ 파일이 선택되었습니다. "데이터 복원하기" 버튼을 클릭하세요.');
    }

    // ========================================================================
    // 내보내기 (Export)
    // ========================================================================

    /**
     * 모든 데이터 내보내기
     */
    async exportAllData() {
        // 인증 상태 확인
        if (!this.mainApp.currentUser) {
            this._showStatus('export', 'error', '❌ 로그인이 필요합니다.');
            return;
        }

        if (this.isExporting) {
            logger.warn('[BackupManager] 이미 내보내기 진행 중');
            return;
        }

        this.isExporting = true;
        this.exportBtn.disabled = true;
        this._showStatus('export', 'loading', '⏳ 데이터를 수집하는 중...');

        try {
            const userId = this.mainApp.currentUser.uid;
            const db = this.mainApp.db;

            if (!db) {
                throw new Error('Firestore 연결이 없습니다.');
            }

            // 각 컬렉션에서 데이터 로드 (Firestore 컬렉션명: texts, posts, urlLinks)
            const [textsData, trackingPostsData, urlLinksData] = await Promise.all([
                this._fetchCollection(db, userId, 'texts'),
                this._fetchCollection(db, userId, 'posts'),  // Firestore에서는 'posts' 컬렉션
                this._fetchCollection(db, userId, 'urlLinks')
            ]);

            // 백업 데이터 구조 생성
            const backupData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                userId: userId,
                userEmail: this.mainApp.currentUser.email || 'unknown',
                data: {
                    texts: textsData,
                    trackingPosts: trackingPostsData,
                    urlLinks: urlLinksData
                },
                counts: {
                    texts: textsData.length,
                    trackingPosts: trackingPostsData.length,
                    urlLinks: urlLinksData.length
                }
            };

            // JSON 파일로 다운로드
            this._downloadJson(backupData);

            const totalCount = textsData.length + trackingPostsData.length + urlLinksData.length;
            this._showStatus('export', 'success', 
                `✅ 백업 완료! (총 ${totalCount}개: 저장글 ${textsData.length}, 트래킹 ${trackingPostsData.length}, URL ${urlLinksData.length})`
            );

            logger.log(`[BackupManager] 내보내기 완료: ${totalCount}개 항목`);

        } catch (error) {
            logger.error('[BackupManager] 내보내기 실패:', error);
            this._showStatus('export', 'error', `❌ 내보내기 실패: ${error.message}`);
        } finally {
            this.isExporting = false;
            this.exportBtn.disabled = false;
        }
    }

    /**
     * Firestore 컬렉션에서 데이터 가져오기
     * @param {object} db - Firestore 인스턴스
     * @param {string} userId - 사용자 ID
     * @param {string} collectionName - 컬렉션 이름
     * @returns {Promise<Array>} 문서 배열
     */
    async _fetchCollection(db, userId, collectionName) {
        try {
            // Firebase v9 modular API 사용 (window.firebase 호환)
            const collectionRef = db.collection('users').doc(userId).collection(collectionName);
            const snapshot = await collectionRef.get();

            const documents = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                documents.push({
                    id: doc.id,
                    ...this._serializeData(data)
                });
            });

            logger.log(`[BackupManager] ${collectionName}: ${documents.length}개 로드`);
            return documents;

        } catch (error) {
            logger.warn(`[BackupManager] ${collectionName} 로드 실패:`, error);
            return [];
        }
    }

    /**
     * Firestore 데이터를 JSON 직렬화 가능하도록 변환
     * @param {object} data - Firestore 문서 데이터
     * @returns {object} 직렬화된 데이터
     */
    _serializeData(data) {
        const serialized = {};

        for (const [key, value] of Object.entries(data)) {
            if (value === null || value === undefined) {
                serialized[key] = null;
            } else if (value.toDate && typeof value.toDate === 'function') {
                // Firestore Timestamp를 ISO 문자열로 변환
                serialized[key] = value.toDate().toISOString();
            } else if (value instanceof Date) {
                serialized[key] = value.toISOString();
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                // 중첩 객체 재귀 처리
                serialized[key] = this._serializeData(value);
            } else {
                serialized[key] = value;
            }
        }

        return serialized;
    }

    /**
     * JSON 파일 다운로드
     * @param {object} data - 백업 데이터
     */
    _downloadJson(data) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // 파일명 생성: 500text_backup_YYYYMMDD_HHMMSS.json
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
        const filename = `500text_backup_${dateStr}_${timeStr}.json`;

        // 다운로드 링크 생성 및 클릭
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // URL 해제
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        logger.log(`[BackupManager] 파일 다운로드: ${filename}`);
    }

    // ========================================================================
    // 가져오기 (Import)
    // ========================================================================

    /**
     * 모든 데이터 가져오기
     */
    async importAllData() {
        // 인증 상태 확인
        if (!this.mainApp.currentUser) {
            this._showStatus('import', 'error', '❌ 로그인이 필요합니다.');
            return;
        }

        if (!this.selectedFile) {
            this._showStatus('import', 'error', '❌ 먼저 JSON 파일을 선택하세요.');
            return;
        }

        if (this.isImporting) {
            logger.warn('[BackupManager] 이미 가져오기 진행 중');
            return;
        }

        // 확인 대화상자
        const confirmed = confirm(
            '⚠️ 주의: 가져오기를 진행하면 동일한 ID의 기존 데이터가 덮어쓰여집니다.\n\n' +
            '계속하시겠습니까?'
        );

        if (!confirmed) {
            return;
        }

        this.isImporting = true;
        this.importBtn.disabled = true;
        this._showStatus('import', 'loading', '⏳ 파일을 읽는 중...');

        try {
            // 파일 읽기
            const fileContent = await this._readFile(this.selectedFile);
            const backupData = JSON.parse(fileContent);

            // 백업 데이터 유효성 검사
            if (!this._validateBackupData(backupData)) {
                throw new Error('유효하지 않은 백업 파일 형식입니다.');
            }

            this._showStatus('import', 'loading', '⏳ 데이터를 복원하는 중...');

            const userId = this.mainApp.currentUser.uid;
            const db = this.mainApp.db;

            // 각 컬렉션에 데이터 저장 (Firestore 컬렉션명: texts, posts, urlLinks)
            const results = await Promise.all([
                this._importCollection(db, userId, 'texts', backupData.data.texts || []),
                this._importCollection(db, userId, 'posts', backupData.data.trackingPosts || []),  // Firestore에서는 'posts' 컬렉션
                this._importCollection(db, userId, 'urlLinks', backupData.data.urlLinks || [])
            ]);

            const totalImported = results.reduce((sum, r) => sum + r.success, 0);
            const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

            this._showStatus('import', 'success', 
                `✅ 복원 완료! (성공: ${totalImported}개, 실패: ${totalFailed}개)`
            );

            // UI 새로고침
            if (typeof this.mainApp.refreshAllData === 'function') {
                await this.mainApp.refreshAllData();
            }

            logger.log(`[BackupManager] 가져오기 완료: 성공 ${totalImported}, 실패 ${totalFailed}`);

            // 파일 입력 초기화
            this._resetFileInput();

        } catch (error) {
            logger.error('[BackupManager] 가져오기 실패:', error);
            this._showStatus('import', 'error', `❌ 가져오기 실패: ${error.message}`);
        } finally {
            this.isImporting = false;
            this.importBtn.disabled = false;
        }
    }

    /**
     * 파일 읽기
     * @param {File} file - 파일 객체
     * @returns {Promise<string>} 파일 내용
     */
    _readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('파일 읽기 실패'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * 백업 데이터 유효성 검사
     * @param {object} data - 백업 데이터
     * @returns {boolean} 유효 여부
     */
    _validateBackupData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        // 필수 필드 확인
        if (!data.data || typeof data.data !== 'object') {
            return false;
        }

        // data 내부에 최소 하나의 배열이 있어야 함
        const hasValidData = 
            Array.isArray(data.data.texts) ||
            Array.isArray(data.data.trackingPosts) ||
            Array.isArray(data.data.urlLinks);

        return hasValidData;
    }

    /**
     * 컬렉션에 데이터 가져오기
     * @param {object} db - Firestore 인스턴스
     * @param {string} userId - 사용자 ID
     * @param {string} collectionName - 컬렉션 이름
     * @param {Array} documents - 저장할 문서 배열
     * @returns {Promise<object>} 결과 { success, failed }
     */
    async _importCollection(db, userId, collectionName, documents) {
        const result = { success: 0, failed: 0 };

        if (!documents || documents.length === 0) {
            return result;
        }

        const collectionRef = db.collection('users').doc(userId).collection(collectionName);

        for (const doc of documents) {
            try {
                const { id, ...data } = doc;
                const docData = this._deserializeData(data);

                if (id) {
                    // ID가 있으면 해당 ID로 저장 (덮어쓰기)
                    await collectionRef.doc(id).set(docData, { merge: true });
                } else {
                    // ID가 없으면 새로 생성
                    await collectionRef.add(docData);
                }
                result.success++;
            } catch (error) {
                logger.warn(`[BackupManager] ${collectionName} 문서 저장 실패:`, error);
                result.failed++;
            }
        }

        logger.log(`[BackupManager] ${collectionName}: 성공 ${result.success}, 실패 ${result.failed}`);
        return result;
    }

    /**
     * JSON 데이터를 Firestore 저장용으로 변환
     * @param {object} data - JSON 데이터
     * @returns {object} Firestore 저장용 데이터
     */
    _deserializeData(data) {
        const deserialized = {};

        for (const [key, value] of Object.entries(data)) {
            if (value === null || value === undefined) {
                deserialized[key] = null;
            } else if (typeof value === 'string' && this._isISODateString(value)) {
                // ISO 문자열을 Date로 변환 (Firestore가 자동으로 Timestamp로 변환)
                deserialized[key] = new Date(value);
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                // 중첩 객체 재귀 처리
                deserialized[key] = this._deserializeData(value);
            } else {
                deserialized[key] = value;
            }
        }

        return deserialized;
    }

    /**
     * ISO 날짜 문자열 여부 확인
     * @param {string} str - 문자열
     * @returns {boolean} ISO 날짜 여부
     */
    _isISODateString(str) {
        // 기본 ISO 8601 형식 체크
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        return isoRegex.test(str);
    }

    /**
     * 파일 입력 초기화
     */
    _resetFileInput() {
        this.selectedFile = null;
        if (this.fileInput) {
            this.fileInput.value = '';
        }
        if (this.fileNameDisplay) {
            this.fileNameDisplay.textContent = '선택된 파일 없음';
        }
        if (this.importBtn) {
            this.importBtn.disabled = true;
        }
    }

    // ========================================================================
    // 상태 표시
    // ========================================================================

    /**
     * 상태 메시지 표시
     * @param {string} type - 'export' 또는 'import'
     * @param {string} status - 'loading', 'success', 'error', 'ready'
     * @param {string} message - 표시할 메시지
     */
    _showStatus(type, status, message) {
        const statusEl = type === 'export' ? this.exportStatus : this.importStatus;

        if (!statusEl) return;

        // 기존 클래스 제거
        statusEl.classList.remove('loading', 'success', 'error', 'ready');
        
        // 새 클래스 추가
        statusEl.classList.add(status);
        statusEl.textContent = message;
        statusEl.style.display = 'block';

        // 성공/에러 메시지는 5초 후 자동 숨김
        if (status === 'success' || status === 'error') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }
}
