/**
 * MigrationManager
 * 
 * 하이브리드 인증 시스템의 데이터 마이그레이션 관리자
 * Username 계정에서 Google 계정으로 (또는 그 반대로) 데이터 이전
 * 
 * 주요 기능:
 * - 데이터 분석 및 예상 시간 계산
 * - 배치 처리를 통한 대용량 데이터 마이그레이션
 * - 백업 및 롤백
 * - 데이터 무결성 검증
 * - 마이그레이션 기록 관리
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

class MigrationManager {
    constructor(logger) {
        // 의존성
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 설정
        this.batchSize = 100; // 배치당 처리 항목 수
        this.batchDelay = 10; // 배치 간 지연 시간 (ms)
        this.maxRetries = 3; // 최대 재시도 횟수
        
        // 상태
        this.currentMigration = null;
        this.backupData = null;
        
        // 저장 키
        this.MIGRATION_RECORD_KEY = 'dualTextWriter_migrationRecord';
        this.BACKUP_KEY_PREFIX = 'dualTextWriter_migration_backup_';
    }
    
    /**
     * 데이터 분석 - 항목 수 및 예상 시간 계산
     * @param {string} sourceUser - 원본 사용자 ID
     * @returns {Object} 분석 결과
     * Requirements: 5.1, 5.2
     */
    async analyzeData(sourceUser) {
        try {
            console.log('🔍 데이터 분석 시작:', sourceUser);
            
            // 원본 데이터 로드
            const sourceKey = `dualTextWriter_savedTexts_${sourceUser}`;
            const sourceData = localStorage.getItem(sourceKey);
            
            if (!sourceData) {
                return {
                    sourceUser: sourceUser,
                    itemCount: 0,
                    totalSize: 0,
                    estimatedTime: 0,
                    batchCount: 0,
                    hasData: false
                };
            }
            
            const items = JSON.parse(sourceData);
            const itemCount = items.length;
            const totalSize = new Blob([sourceData]).size;
            
            // 배치 수 계산
            const batchCount = Math.ceil(itemCount / this.batchSize);
            
            // 예상 시간 계산 (배치당 0.1초 + 배치 간 지연)
            const estimatedTime = (batchCount * 0.1) + (batchCount * this.batchDelay / 1000);
            
            const analysis = {
                sourceUser: sourceUser,
                itemCount: itemCount,
                totalSize: totalSize,
                totalSizeReadable: this.formatBytes(totalSize),
                estimatedTime: Math.ceil(estimatedTime),
                batchCount: batchCount,
                hasData: itemCount > 0
            };
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_analysis', '데이터 분석 완료', analysis);
            }
            
            console.log('✅ 데이터 분석 완료:', analysis);
            
            return analysis;
            
        } catch (error) {
            console.error('❌ 데이터 분석 실패:', error);
            
            if (this.logger) {
                this.logger.logAction('migration_analysis_failed', '데이터 분석 실패', {
                    error: error.message
                });
            }
            
            throw new Error('데이터 분석에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 진행률 콜백과 함께 마이그레이션 수행
     * @param {string} sourceUser - 원본 사용자 ID
     * @param {string} targetUser - 대상 사용자 ID
     * @param {Function} onProgress - 진행률 콜백 (progress: {current, total, percentage, step})
     * @returns {Promise<Object>} 마이그레이션 결과
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
     */
    async migrateWithProgress(sourceUser, targetUser, onProgress) {
        const migrationId = this.generateMigrationId();
        const startTime = Date.now();
        
        try {
            console.log('🚀 마이그레이션 시작:', sourceUser, '->', targetUser);
            
            // 현재 마이그레이션 설정
            this.currentMigration = {
                id: migrationId,
                sourceUser: sourceUser,
                targetUser: targetUser,
                startTime: startTime,
                status: 'in_progress'
            };
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_start', '마이그레이션 시작', {
                    migrationId: migrationId,
                    sourceUser: sourceUser,
                    targetUser: targetUser
                });
            }
            
            // 1단계: 백업 생성
            if (onProgress) {
                onProgress({
                    current: 0,
                    total: 100,
                    percentage: 0,
                    step: 'backup',
                    stepName: '백업 생성 중...'
                });
            }
            
            const backup = await this.createBackup(sourceUser);
            
            if (!backup) {
                throw new Error('백업 생성에 실패했습니다');
            }
            
            // 2단계: 데이터 이전 (배치 처리)
            if (onProgress) {
                onProgress({
                    current: 10,
                    total: 100,
                    percentage: 10,
                    step: 'transfer',
                    stepName: '데이터 이전 중...'
                });
            }
            
            const sourceKey = `dualTextWriter_savedTexts_${sourceUser}`;
            const targetKey = `dualTextWriter_savedTexts_${targetUser}`;
            const sourceData = JSON.parse(localStorage.getItem(sourceKey) || '[]');
            
            if (sourceData.length === 0) {
                throw new Error('이전할 데이터가 없습니다');
            }
            
            // 배치 처리
            const batchCount = Math.ceil(sourceData.length / this.batchSize);
            let processedCount = 0;
            
            for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
                const startIdx = batchIndex * this.batchSize;
                const endIdx = Math.min(startIdx + this.batchSize, sourceData.length);
                const batch = sourceData.slice(startIdx, endIdx);
                
                // 배치 처리
                await this.processBatch(batch, targetKey, batchIndex);
                
                processedCount += batch.length;
                
                // 진행률 업데이트 (10% ~ 80%)
                const transferProgress = 10 + Math.floor((processedCount / sourceData.length) * 70);
                
                if (onProgress) {
                    onProgress({
                        current: processedCount,
                        total: sourceData.length,
                        percentage: transferProgress,
                        step: 'transfer',
                        stepName: `데이터 이전 중... (${processedCount}/${sourceData.length})`
                    });
                }
                
                // 배치 간 지연 (UI 응답성 유지)
                if (batchIndex < batchCount - 1) {
                    await this.delay(this.batchDelay);
                }
            }
            
            // 3단계: 데이터 검증
            if (onProgress) {
                onProgress({
                    current: 80,
                    total: 100,
                    percentage: 80,
                    step: 'verify',
                    stepName: '데이터 검증 중...'
                });
            }
            
            const isValid = await this.verifyMigration(sourceKey, targetKey);
            
            if (!isValid) {
                throw new Error('데이터 검증에 실패했습니다');
            }
            
            // 4단계: 마이그레이션 기록 생성
            if (onProgress) {
                onProgress({
                    current: 90,
                    total: 100,
                    percentage: 90,
                    step: 'finalize',
                    stepName: '마이그레이션 완료 중...'
                });
            }
            
            const duration = Date.now() - startTime;
            
            const migrationRecord = this.createMigrationRecord({
                migrationId: migrationId,
                sourceUser: sourceUser,
                targetUser: targetUser,
                itemCount: sourceData.length,
                duration: duration,
                backupKey: backup.key,
                status: 'completed',
                timestamp: Date.now()
            });
            
            // 완료
            if (onProgress) {
                onProgress({
                    current: 100,
                    total: 100,
                    percentage: 100,
                    step: 'complete',
                    stepName: '완료!'
                });
            }
            
            // 현재 마이그레이션 상태 업데이트
            this.currentMigration.status = 'completed';
            this.currentMigration.endTime = Date.now();
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_complete', '마이그레이션 완료', {
                    migrationId: migrationId,
                    sourceUser: sourceUser,
                    targetUser: targetUser,
                    itemCount: sourceData.length,
                    duration: duration
                });
            }
            
            console.log('✅ 마이그레이션 완료:', migrationRecord);
            
            return {
                success: true,
                migratedCount: sourceData.length,
                failedCount: 0,
                duration: duration,
                migrationId: migrationId,
                backupKey: backup.key,
                migrationRecord: migrationRecord
            };
            
        } catch (error) {
            console.error('❌ 마이그레이션 실패:', error);
            
            // 현재 마이그레이션 상태 업데이트
            if (this.currentMigration) {
                this.currentMigration.status = 'failed';
                this.currentMigration.error = error.message;
            }
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_failed', '마이그레이션 실패', {
                    migrationId: migrationId,
                    sourceUser: sourceUser,
                    targetUser: targetUser,
                    error: error.message
                });
            }
            
            // 자동 롤백
            if (this.backupData) {
                console.log('🔄 자동 롤백 시작...');
                await this.rollback(this.backupData.key);
            }
            
            throw error;
        }
    }
    
    /**
     * 배치 처리 - 100개 항목씩 처리
     * @param {Array} batch - 처리할 항목 배치
     * @param {string} targetKey - 대상 localStorage 키
     * @param {number} batchIndex - 배치 인덱스
     * @returns {Promise<Object>} 배치 처리 결과
     * Requirements: 5.5
     */
    async processBatch(batch, targetKey, batchIndex) {
        try {
            console.log(`📦 배치 ${batchIndex + 1} 처리 중... (${batch.length}개 항목)`);
            
            // 기존 대상 데이터 로드
            const existingData = JSON.parse(localStorage.getItem(targetKey) || '[]');
            
            // 배치 데이터 추가
            existingData.push(...batch);
            
            // 저장
            localStorage.setItem(targetKey, JSON.stringify(existingData));
            
            console.log(`✅ 배치 ${batchIndex + 1} 처리 완료`);
            
            return {
                success: true,
                batchIndex: batchIndex,
                itemCount: batch.length
            };
            
        } catch (error) {
            console.error(`❌ 배치 ${batchIndex + 1} 처리 실패:`, error);
            
            // 재시도 로직
            if (error.name === 'QuotaExceededError') {
                throw new Error('저장 공간이 부족합니다. 브라우저 데이터를 정리해주세요.');
            }
            
            throw error;
        }
    }
    
    /**
     * 데이터 무결성 검증
     * @param {string} sourceKey - 원본 localStorage 키
     * @param {string} targetKey - 대상 localStorage 키
     * @returns {Promise<boolean>} 검증 결과
     * Requirements: 5.6
     */
    async verifyMigration(sourceKey, targetKey) {
        try {
            console.log('🔍 데이터 검증 시작...');
            
            const sourceData = JSON.parse(localStorage.getItem(sourceKey) || '[]');
            const targetData = JSON.parse(localStorage.getItem(targetKey) || '[]');
            
            // 1. 항목 수 확인
            if (sourceData.length !== targetData.length) {
                console.error(`❌ 항목 수 불일치: 원본 ${sourceData.length}, 대상 ${targetData.length}`);
                return false;
            }
            
            // 2. 체크섬 확인
            const sourceChecksum = this.calculateChecksum(sourceData);
            const targetChecksum = this.calculateChecksum(targetData);
            
            if (sourceChecksum !== targetChecksum) {
                console.error(`❌ 체크섬 불일치: 원본 ${sourceChecksum}, 대상 ${targetChecksum}`);
                return false;
            }
            
            console.log('✅ 데이터 검증 완료: 모든 데이터가 정확히 이전되었습니다');
            
            return true;
            
        } catch (error) {
            console.error('❌ 데이터 검증 실패:', error);
            return false;
        }
    }
    
    /**
     * 백업 생성
     * @param {string} username - 백업할 사용자명
     * @returns {Promise<Object>} 백업 정보
     * Requirements: 5.3
     */
    async createBackup(username) {
        try {
            console.log('💾 백업 생성 시작:', username);
            
            const key = `dualTextWriter_savedTexts_${username}`;
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            
            if (data.length === 0) {
                console.warn('⚠️ 백업할 데이터가 없습니다');
                return null;
            }
            
            const backupKey = this.BACKUP_KEY_PREFIX + Date.now();
            const backup = {
                username: username,
                data: data,
                timestamp: Date.now(),
                checksum: this.calculateChecksum(data)
            };
            
            // 백업 저장
            localStorage.setItem(backupKey, JSON.stringify(backup));
            
            // 백업 데이터 참조 저장
            this.backupData = {
                key: backupKey,
                ...backup
            };
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('backup_created', '백업 생성 완료', {
                    backupKey: backupKey,
                    username: username,
                    itemCount: data.length,
                    checksum: backup.checksum
                });
            }
            
            console.log('✅ 백업 생성 완료:', backupKey);
            
            return this.backupData;
            
        } catch (error) {
            console.error('❌ 백업 생성 실패:', error);
            
            if (this.logger) {
                this.logger.logAction('backup_failed', '백업 생성 실패', {
                    error: error.message
                });
            }
            
            throw new Error('백업 생성에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 롤백 - 백업에서 복원
     * @param {string} backupKey - 백업 키
     * @returns {Promise<boolean>} 롤백 성공 여부
     * Requirements: 5.7
     */
    async rollback(backupKey) {
        try {
            console.log('🔄 롤백 시작:', backupKey);
            
            // 백업 데이터 로드
            const backupData = localStorage.getItem(backupKey);
            
            if (!backupData) {
                throw new Error('백업 데이터를 찾을 수 없습니다');
            }
            
            const backup = JSON.parse(backupData);
            
            // 원본 키로 복원
            const restoreKey = `dualTextWriter_savedTexts_${backup.username}`;
            localStorage.setItem(restoreKey, JSON.stringify(backup.data));
            
            // 검증
            const restoredData = JSON.parse(localStorage.getItem(restoreKey));
            const restoredChecksum = this.calculateChecksum(restoredData);
            
            if (restoredChecksum !== backup.checksum) {
                throw new Error('복원된 데이터의 체크섬이 일치하지 않습니다');
            }
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('rollback_complete', '롤백 완료', {
                    backupKey: backupKey,
                    username: backup.username,
                    itemCount: backup.data.length
                });
            }
            
            console.log('✅ 롤백 완료: 원본 데이터가 복원되었습니다');
            
            return true;
            
        } catch (error) {
            console.error('❌ 롤백 실패:', error);
            
            if (this.logger) {
                this.logger.logAction('rollback_failed', '롤백 실패', {
                    error: error.message
                });
            }
            
            throw new Error('롤백에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 마이그레이션 기록 생성
     * @param {Object} migration - 마이그레이션 정보
     * @returns {Object} 마이그레이션 기록
     * Requirements: 5.8
     */
    createMigrationRecord(migration) {
        try {
            const record = {
                id: migration.migrationId,
                sourceUser: migration.sourceUser,
                targetUser: migration.targetUser,
                timestamp: migration.timestamp,
                status: migration.status,
                itemCount: migration.itemCount,
                duration: migration.duration,
                backupKey: migration.backupKey
            };
            
            // 기존 기록 로드
            const existingRecords = this.getMigrationRecords();
            
            // 새 기록 추가
            existingRecords.push(record);
            
            // 최근 10개만 유지
            if (existingRecords.length > 10) {
                existingRecords.shift();
            }
            
            // 저장
            localStorage.setItem(this.MIGRATION_RECORD_KEY, JSON.stringify(existingRecords));
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_record_created', '마이그레이션 기록 생성', record);
            }
            
            console.log('📝 마이그레이션 기록 생성:', record);
            
            return record;
            
        } catch (error) {
            console.error('❌ 마이그레이션 기록 생성 실패:', error);
            return null;
        }
    }
    
    /**
     * 마이그레이션 기록 조회
     * @returns {Array} 마이그레이션 기록 배열
     */
    getMigrationRecords() {
        try {
            const records = localStorage.getItem(this.MIGRATION_RECORD_KEY);
            return records ? JSON.parse(records) : [];
        } catch (error) {
            console.error('❌ 마이그레이션 기록 조회 실패:', error);
            return [];
        }
    }
    
    /**
     * 최근 마이그레이션 기록 조회
     * @returns {Object|null}
     */
    getLatestMigrationRecord() {
        const records = this.getMigrationRecords();
        return records.length > 0 ? records[records.length - 1] : null;
    }
    
    /**
     * 체크섬 계산
     * @param {Array} data - 데이터 배열
     * @returns {string} 체크섬
     */
    calculateChecksum(data) {
        try {
            const dataString = JSON.stringify(data, Object.keys(data).sort());
            let hash = 0;
            
            for (let i = 0; i < dataString.length; i++) {
                const char = dataString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            return hash.toString(16);
        } catch (error) {
            return 'checksum_error';
        }
    }
    
    /**
     * 마이그레이션 ID 생성
     * @returns {string}
     */
    generateMigrationId() {
        return 'mig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 바이트를 읽기 쉬운 형태로 변환
     * @param {number} bytes
     * @returns {string}
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 지연 함수
     * @param {number} ms - 지연 시간 (밀리초)
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 현재 마이그레이션 상태 조회
     * @returns {Object|null}
     */
    getCurrentMigration() {
        return this.currentMigration;
    }
    
    /**
     * 오래된 백업 정리 (30일 이상)
     * @returns {number} 정리된 백업 수
     */
    cleanupOldBackups() {
        try {
            console.log('🧹 오래된 백업 정리 시작...');
            
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            let cleanedCount = 0;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                if (key && key.startsWith(this.BACKUP_KEY_PREFIX)) {
                    try {
                        const backup = JSON.parse(localStorage.getItem(key));
                        
                        if (backup.timestamp < thirtyDaysAgo) {
                            localStorage.removeItem(key);
                            cleanedCount++;
                            console.log(`🗑️ 오래된 백업 삭제: ${key}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ 백업 파싱 실패: ${key}`, error);
                    }
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`✅ 오래된 백업 ${cleanedCount}개 정리 완료`);
            } else {
                console.log('ℹ️ 정리할 오래된 백업이 없습니다');
            }
            
            return cleanedCount;
            
        } catch (error) {
            console.error('❌ 백업 정리 실패:', error);
            return 0;
        }
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.MigrationManager = MigrationManager;
}
