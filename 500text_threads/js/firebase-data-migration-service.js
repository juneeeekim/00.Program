/**
 * DataMigrationService 클래스 (Firebase 통합용)
 * 
 * 로컬 스토리지 데이터를 Firestore로 마이그레이션하는 서비스
 * 
 * 주요 기능:
 * - 로컬 스토리지 데이터 감지
 * - Firestore 업로드
 * - 마이그레이션 확인 다이얼로그
 * - 백업 및 롤백
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

class DataMigrationService {
    constructor(firebaseManager, logger = null) {
        this.firebaseManager = firebaseManager;
        this.logger = logger;
        this.backupData = null;
        this.migrationLog = [];
    }
    
    /**
     * 로컬 스토리지 데이터 감지
     * Requirements: 8.1
     */
    detectLocalData(userId) {
        try {
            console.log('🔍 로컬 데이터 감지 시작:', userId);
            
            // 사용자별 로컬 스토리지 키 확인
            const savedTextsKey = `dualTextWriter_savedTexts_${userId}`;
            const tempSaveKey = `dualTextWriter_tempSave_${userId}`;
            
            // 저장된 글 확인
            const savedTextsData = localStorage.getItem(savedTextsKey);
            const savedTexts = savedTextsData ? JSON.parse(savedTextsData) : [];
            
            // 임시 저장 데이터 확인
            const tempSaveData = localStorage.getItem(tempSaveKey);
            const tempSave = tempSaveData ? JSON.parse(tempSaveData) : null;
            
            const hasData = savedTexts.length > 0 || tempSave !== null;
            
            if (hasData) {
                console.log(`✅ 로컬 데이터 발견: 저장된 글 ${savedTexts.length}개, 임시 저장 ${tempSave ? '있음' : '없음'}`);
            } else {
                console.log('ℹ️ 로컬 데이터 없음');
            }
            
            return {
                hasData,
                savedTexts,
                tempSave,
                dataCount: savedTexts.length,
                estimatedSize: this.calculateDataSize({ savedTexts, tempSave })
            };
        } catch (error) {
            console.error('❌ 로컬 데이터 감지 실패:', error);
            return {
                hasData: false,
                savedTexts: [],
                tempSave: null,
                dataCount: 0,
                estimatedSize: { bytes: 0, readable: '0 B' }
            };
        }
    }
    
    /**
     * 데이터 크기 계산
     */
    calculateDataSize(data) {
        try {
            const dataString = JSON.stringify(data);
            const bytes = new Blob([dataString]).size;
            return {
                bytes,
                readable: this.formatBytes(bytes)
            };
        } catch (error) {
            return { bytes: 0, readable: '0 B' };
        }
    }
    
    /**
     * 바이트를 읽기 쉬운 형태로 변환
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 마이그레이션 확인 다이얼로그
     * Requirements: 8.1, 8.2
     */
    async confirmMigration(localData, userEmail) {
        const message = `
🔄 로컬 데이터를 클라우드로 이전하시겠습니까?

📊 마이그레이션 정보:
• Google 계정: ${userEmail}
• 저장된 글: ${localData.dataCount}개
• 임시 저장: ${localData.tempSave ? '있음' : '없음'}
• 데이터 크기: ${localData.estimatedSize.readable}

✅ 이전하면:
- 기존 데이터가 클라우드에 안전하게 보관됩니다
- 모든 기기에서 데이터에 접근할 수 있습니다
- 브라우저 캐시를 지워도 데이터가 유지됩니다

❌ 이전하지 않으면:
- 로컬 데이터는 그대로 유지됩니다
- 클라우드는 새로 시작됩니다
        `.trim();
        
        return confirm(message);
    }
    
    /**
     * 백업 생성
     * Requirements: 8.3
     */
    createBackup(userId, localData) {
        try {
            console.log('💾 백업 생성 시작...');
            
            const backup = {
                timestamp: Date.now(),
                userId,
                data: {
                    savedTexts: [...localData.savedTexts],
                    tempSave: localData.tempSave ? { ...localData.tempSave } : null
                },
                checksum: this.generateChecksum(localData)
            };
            
            // 백업 데이터 저장
            const backupKey = `dualTextWriter_firebase_migration_backup_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify(backup));
            this.backupData = { ...backup, backupKey };
            
            this.addMigrationLog('backup_created', '백업 생성 완료', { backupKey, checksum: backup.checksum });
            
            console.log('✅ 백업 생성 완료:', backupKey);
            
            return this.backupData;
        } catch (error) {
            console.error('❌ 백업 생성 실패:', error);
            throw new Error('백업 생성에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 체크섬 생성
     */
    generateChecksum(data) {
        try {
            const dataString = JSON.stringify(data, Object.keys(data).sort());
            let hash = 0;
            for (let i = 0; i < dataString.length; i++) {
                const char = dataString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
        } catch (error) {
            return 'checksum_error';
        }
    }
    
    /**
     * Firestore 업로드 메서드
     * Requirements: 8.2, 8.3, 8.4
     */
    async uploadToFirestore(localData, progressCallback = null) {
        try {
            console.log('☁️ Firestore 업로드 시작...');
            
            const results = {
                success: [],
                failed: [],
                total: localData.savedTexts.length
            };
            
            // 저장된 글 업로드
            for (let i = 0; i < localData.savedTexts.length; i++) {
                const item = localData.savedTexts[i];
                
                try {
                    // 진행 상태 콜백
                    if (progressCallback) {
                        progressCallback({
                            current: i + 1,
                            total: results.total,
                            percentage: Math.round(((i + 1) / results.total) * 100)
                        });
                    }
                    
                    // Firestore에 저장
                    const textData = {
                        content: item.content,
                        characterCount: item.characterCount || item.content.length,
                        type: item.type || 'edit',
                        // 원본 생성 날짜 보존 (가능한 경우)
                        originalDate: item.date || new Date().toLocaleString('ko-KR'),
                        migratedFrom: 'localStorage',
                        migratedAt: new Date().toISOString()
                    };
                    
                    await this.firebaseManager.saveText(textData);
                    
                    results.success.push(item.id);
                    
                    console.log(`✅ 업로드 완료 (${i + 1}/${results.total}):`, item.id);
                } catch (error) {
                    console.error(`❌ 업로드 실패 (${i + 1}/${results.total}):`, error);
                    results.failed.push({ id: item.id, error: error.message });
                }
                
                // 과도한 요청 방지를 위한 짧은 지연
                if (i < localData.savedTexts.length - 1) {
                    await this.delay(100);
                }
            }
            
            console.log(`✅ Firestore 업로드 완료: 성공 ${results.success.length}개, 실패 ${results.failed.length}개`);
            
            return results;
        } catch (error) {
            console.error('❌ Firestore 업로드 실패:', error);
            throw error;
        }
    }
    
    /**
     * 지연 함수
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 마이그레이션 프로세스 실행
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     */
    async performMigration(userId, userEmail, progressCallback = null) {
        try {
            console.log('🚀 마이그레이션 시작:', userId);
            this.addMigrationLog('migration_start', '마이그레이션 시작', { userId, userEmail });
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('firebase_migration_start', '데이터 마이그레이션 시작', {
                    userId,
                    userEmail,
                    timestamp: Date.now()
                });
            }
            
            // 1. 로컬 데이터 감지
            const localData = this.detectLocalData(userId);
            
            if (!localData.hasData) {
                console.log('ℹ️ 마이그레이션할 데이터가 없습니다.');
                return {
                    success: true,
                    skipped: true,
                    message: '마이그레이션할 데이터가 없습니다.'
                };
            }
            
            // 2. 백업 생성
            const backup = this.createBackup(userId, localData);
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_backup_created', '백업 생성 완료', {
                    userId,
                    backupKey: backup.backupKey,
                    checksum: backup.checksum,
                    dataCount: localData.dataCount
                });
            }
            
            // 3. Firestore 업로드
            const uploadResults = await this.uploadToFirestore(localData, progressCallback);
            
            // 4. 업로드 결과 확인
            if (uploadResults.failed.length > 0) {
                console.warn(`⚠️ 일부 데이터 업로드 실패: ${uploadResults.failed.length}개`);
                
                // 실패한 항목이 있으면 사용자에게 알림
                const continueAnyway = confirm(
                    `${uploadResults.failed.length}개의 항목 업로드에 실패했습니다.\n` +
                    `성공: ${uploadResults.success.length}개\n\n` +
                    `계속 진행하시겠습니까? (로컬 데이터는 백업되어 있습니다)`
                );
                
                if (!continueAnyway) {
                    throw new Error('사용자가 마이그레이션을 취소했습니다.');
                }
            }
            
            // 5. 마이그레이션 기록 저장
            const migrationRecord = {
                userId,
                userEmail,
                migratedAt: Date.now(),
                dataCount: localData.dataCount,
                successCount: uploadResults.success.length,
                failedCount: uploadResults.failed.length,
                tempSaveExists: !!localData.tempSave,
                backupKey: backup.backupKey,
                backupChecksum: backup.checksum,
                migrationId: this.generateMigrationId()
            };
            
            localStorage.setItem('dualTextWriter_firebase_migrationRecord', JSON.stringify(migrationRecord));
            
            this.addMigrationLog('migration_complete', '마이그레이션 완료', migrationRecord);
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_complete', '데이터 마이그레이션 완료', migrationRecord);
            }
            
            console.log('✅ 마이그레이션 완료:', migrationRecord);
            
            return {
                success: true,
                migrationRecord,
                backup,
                uploadResults,
                log: this.migrationLog
            };
        } catch (error) {
            console.error('❌ 마이그레이션 실패:', error);
            this.addMigrationLog('migration_error', error.message, { error: error.toString() });
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_error', '데이터 마이그레이션 실패', {
                    userId,
                    userEmail,
                    error: error.message || error.toString(),
                    stack: error.stack
                });
            }
            
            // 실패 시 롤백 시도
            await this.rollbackMigration();
            
            throw error;
        }
    }
    
    /**
     * 로컬 데이터 정리
     * Requirements: 8.5
     */
    cleanupLocalData(userId) {
        try {
            console.log('🧹 로컬 데이터 정리 시작:', userId);
            
            const savedTextsKey = `dualTextWriter_savedTexts_${userId}`;
            const tempSaveKey = `dualTextWriter_tempSave_${userId}`;
            
            // 로컬 스토리지에서 제거
            localStorage.removeItem(savedTextsKey);
            localStorage.removeItem(tempSaveKey);
            
            this.addMigrationLog('cleanup_complete', '로컬 데이터 정리 완료');
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_cleanup', '로컬 데이터 정리 완료', { userId });
            }
            
            console.log('✅ 로컬 데이터 정리 완료');
            
            return true;
        } catch (error) {
            console.error('❌ 로컬 데이터 정리 실패:', error);
            return false;
        }
    }
    
    /**
     * 마이그레이션 롤백
     * Requirements: 8.3
     */
    async rollbackMigration() {
        try {
            if (!this.backupData) {
                console.warn('⚠️ 롤백할 백업 데이터가 없습니다.');
                return false;
            }
            
            console.log('🔄 롤백 시작...');
            this.addMigrationLog('rollback_start', '롤백 시작');
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_rollback_start', '마이그레이션 롤백 시작', {
                    userId: this.backupData.userId,
                    backupKey: this.backupData.backupKey
                });
            }
            
            const { userId, data } = this.backupData;
            
            // 백업 데이터 복원
            if (data.savedTexts.length > 0) {
                const savedTextsKey = `dualTextWriter_savedTexts_${userId}`;
                localStorage.setItem(savedTextsKey, JSON.stringify(data.savedTexts));
            }
            
            if (data.tempSave) {
                const tempSaveKey = `dualTextWriter_tempSave_${userId}`;
                localStorage.setItem(tempSaveKey, JSON.stringify(data.tempSave));
            }
            
            this.addMigrationLog('rollback_complete', '롤백 완료');
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_rollback_complete', '마이그레이션 롤백 완료', {
                    userId: this.backupData.userId,
                    restoredItemCount: data.savedTexts.length,
                    tempSaveRestored: !!data.tempSave
                });
            }
            
            console.log('✅ 롤백 완료');
            
            return true;
        } catch (error) {
            console.error('❌ 롤백 실패:', error);
            this.addMigrationLog('rollback_error', error.message);
            
            if (this.logger) {
                this.logger.logAction('firebase_migration_rollback_error', '마이그레이션 롤백 실패', {
                    error: error.message || error.toString(),
                    stack: error.stack
                });
            }
            
            return false;
        }
    }
    
    /**
     * 마이그레이션 ID 생성
     */
    generateMigrationId() {
        return 'firebase_migration_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 마이그레이션 로그 추가
     */
    addMigrationLog(type, message, data = null) {
        const logEntry = {
            timestamp: Date.now(),
            type,
            message,
            data
        };
        
        this.migrationLog.push(logEntry);
        console.log(`📋 [Firebase Migration] ${message}`, data || '');
    }
    
    /**
     * 마이그레이션 기록 조회
     */
    getMigrationRecord() {
        try {
            const record = localStorage.getItem('dualTextWriter_firebase_migrationRecord');
            return record ? JSON.parse(record) : null;
        } catch (error) {
            console.error('❌ 마이그레이션 기록 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * 백업 데이터 조회
     */
    getBackupData(backupKey) {
        try {
            const backup = localStorage.getItem(backupKey);
            return backup ? JSON.parse(backup) : null;
        } catch (error) {
            console.error('❌ 백업 데이터 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * 마이그레이션 상태 확인
     */
    getMigrationStatus() {
        const record = this.getMigrationRecord();
        
        return {
            hasMigrationRecord: !!record,
            migrationRecord: record,
            log: this.migrationLog
        };
    }
    
    /**
     * 오래된 백업 정리
     */
    cleanupOldBackups() {
        try {
            console.log('🧹 오래된 백업 정리 시작...');
            
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            let cleanedCount = 0;
            
            // 모든 로컬 스토리지 키 확인
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                if (key && key.startsWith('dualTextWriter_firebase_migration_backup_')) {
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
                console.log('ℹ️ 정리할 오래된 백업이 없습니다.');
            }
            
            return cleanedCount;
        } catch (error) {
            console.error('❌ 백업 정리 실패:', error);
            return 0;
        }
    }
}

// 전역 인스턴스 생성
if (typeof window !== 'undefined') {
    window.DataMigrationService = DataMigrationService;
}
