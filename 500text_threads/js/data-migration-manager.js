// 데이터 마이그레이션 관리 클래스
class DataMigrationManager {
    constructor(config, logger = null) {
        this.config = config;
        this.logger = logger;
        this.backupData = null;
        this.migrationLog = [];
    }
    
    // 마이그레이션 필요성 확인
    checkMigrationNeeded(googleUserData) {
        const existingUser = localStorage.getItem('dualTextWriter_currentUser');
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        
        // 기존 사용자명 기반 사용자가 있고, Google 사용자가 아닌 경우
        if (existingUser && authProvider !== 'google') {
            const existingData = this.getExistingUserData(existingUser);
            
            return {
                needed: true,
                oldUsername: existingUser,
                newEmail: googleUserData.email,
                dataCount: existingData.savedTexts.length,
                tempSaveExists: existingData.tempSave !== null,
                estimatedSize: this.calculateDataSize(existingData)
            };
        }
        
        return { needed: false };
    }
    
    // 기존 사용자 데이터 조회
    getExistingUserData(username) {
        try {
            const savedTexts = JSON.parse(
                localStorage.getItem(`dualTextWriter_savedTexts_${username}`) || '[]'
            );
            const tempSave = localStorage.getItem(`dualTextWriter_tempSave_${username}`);
            
            return {
                savedTexts,
                tempSave: tempSave ? JSON.parse(tempSave) : null,
                username
            };
        } catch (error) {
            console.error('기존 사용자 데이터 조회 실패:', error);
            return {
                savedTexts: [],
                tempSave: null,
                username
            };
        }
    }
    
    // 데이터 크기 계산
    calculateDataSize(userData) {
        try {
            const dataString = JSON.stringify(userData);
            return {
                bytes: new Blob([dataString]).size,
                readable: this.formatBytes(new Blob([dataString]).size)
            };
        } catch (error) {
            return { bytes: 0, readable: '0 B' };
        }
    }
    
    // 바이트를 읽기 쉬운 형태로 변환
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 마이그레이션 확인 대화상자
    async confirmMigration(migrationInfo) {
        const message = `
기존 사용자 데이터를 발견했습니다!

📊 마이그레이션 정보:
• 기존 사용자명: "${migrationInfo.oldUsername}"
• Google 계정: "${migrationInfo.newEmail}"
• 저장된 글: ${migrationInfo.dataCount}개
• 임시 저장: ${migrationInfo.tempSaveExists ? '있음' : '없음'}
• 데이터 크기: ${migrationInfo.estimatedSize.readable}

Google 계정으로 데이터를 안전하게 이전하시겠습니까?

✅ 이전하면:
- 기존 데이터가 Google 계정으로 보관됩니다
- 더 안전한 로그인이 가능합니다
- 데이터 손실 위험이 줄어듭니다

❌ 이전하지 않으면:
- 기존 데이터는 그대로 유지됩니다
- Google 계정은 새로 시작됩니다
        `.trim();
        
        return confirm(message);
    }
    
    // 데이터 백업 생성
    createBackup(userData) {
        try {
            const backup = {
                timestamp: Date.now(),
                username: userData.username,
                data: {
                    savedTexts: [...userData.savedTexts],
                    tempSave: userData.tempSave ? { ...userData.tempSave } : null
                },
                checksum: this.generateChecksum(userData)
            };
            
            // 백업 데이터 저장
            localStorage.setItem(this.config.MIGRATION_BACKUP_KEY, JSON.stringify(backup));
            this.backupData = backup;
            
            this.addMigrationLog('backup_created', '데이터 백업 생성 완료', backup);
            return backup;
            
        } catch (error) {
            console.error('데이터 백업 생성 실패:', error);
            throw new Error('데이터 백업 생성에 실패했습니다.');
        }
    }
    
    // 체크섬 생성
    generateChecksum(userData) {
        try {
            const dataString = JSON.stringify(userData, Object.keys(userData).sort());
            let hash = 0;
            for (let i = 0; i < dataString.length; i++) {
                const char = dataString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // 32비트 정수로 변환
            }
            return hash.toString(16);
        } catch (error) {
            return 'checksum_error';
        }
    }
    
    // 마이그레이션 실행
    async performMigration(oldUsername, newEmail) {
        try {
            this.addMigrationLog('migration_start', '마이그레이션 시작', { oldUsername, newEmail });
            
            // 마이그레이션 시작 로깅
            if (this.logger) {
                this.logger.logAction('migration_start', '데이터 마이그레이션 시작', {
                    oldUsername,
                    newEmail,
                    timestamp: Date.now()
                });
            }
            
            // 1. 기존 데이터 조회
            const existingData = this.getExistingUserData(oldUsername);
            if (existingData.savedTexts.length === 0 && !existingData.tempSave) {
                throw new Error('마이그레이션할 데이터가 없습니다.');
            }
            
            // 2. 백업 생성
            const backup = this.createBackup(existingData);
            
            // 백업 생성 로깅
            if (this.logger) {
                this.logger.logAction('migration_backup_created', '마이그레이션 백업 생성', {
                    oldUsername,
                    backupTimestamp: backup.timestamp,
                    backupChecksum: backup.checksum,
                    dataCount: existingData.savedTexts.length
                });
            }
            
            // 3. 새 키로 데이터 이전
            if (existingData.savedTexts.length > 0) {
                localStorage.setItem(
                    `dualTextWriter_savedTexts_${newEmail}`, 
                    JSON.stringify(existingData.savedTexts)
                );
                this.addMigrationLog('saved_texts_migrated', `저장된 글 ${existingData.savedTexts.length}개 이전 완료`);
                
                // 데이터 이전 로깅
                if (this.logger) {
                    this.logger.logAction('migration_data_transferred', '저장된 글 이전 완료', {
                        oldUsername,
                        newEmail,
                        itemCount: existingData.savedTexts.length
                    });
                }
            }
            
            if (existingData.tempSave) {
                localStorage.setItem(
                    `dualTextWriter_tempSave_${newEmail}`, 
                    JSON.stringify(existingData.tempSave)
                );
                this.addMigrationLog('temp_save_migrated', '임시 저장 데이터 이전 완료');
                
                // 임시 저장 이전 로깅
                if (this.logger) {
                    this.logger.logAction('migration_temp_save_transferred', '임시 저장 데이터 이전 완료', {
                        oldUsername,
                        newEmail
                    });
                }
            }
            
            // 4. 마이그레이션 기록 저장
            const migrationRecord = {
                oldUsername,
                newEmail,
                migratedAt: Date.now(),
                dataCount: existingData.savedTexts.length,
                tempSaveExists: !!existingData.tempSave,
                backupChecksum: backup.checksum,
                migrationId: this.generateMigrationId()
            };
            
            localStorage.setItem('dualTextWriter_migrationRecord', JSON.stringify(migrationRecord));
            
            // 5. 기존 데이터 삭제 (백업 후)
            localStorage.removeItem(`dualTextWriter_savedTexts_${oldUsername}`);
            localStorage.removeItem(`dualTextWriter_tempSave_${oldUsername}`);
            
            this.addMigrationLog('migration_complete', '마이그레이션 완료', migrationRecord);
            
            // 마이그레이션 완료 로깅
            if (this.logger) {
                this.logger.logAction('migration_complete', '데이터 마이그레이션 완료', {
                    oldUsername,
                    newEmail,
                    migrationId: migrationRecord.migrationId,
                    dataCount: migrationRecord.dataCount,
                    tempSaveExists: migrationRecord.tempSaveExists,
                    migratedAt: migrationRecord.migratedAt
                });
            }
            
            return {
                success: true,
                migrationRecord,
                backup,
                log: this.migrationLog
            };
            
        } catch (error) {
            console.error('마이그레이션 실패:', error);
            this.addMigrationLog('migration_error', error.message, { error: error.toString() });
            
            // 마이그레이션 실패 로깅
            if (this.logger) {
                this.logger.logAction('migration_error', '데이터 마이그레이션 실패', {
                    oldUsername,
                    newEmail,
                    error: error.message || error.toString(),
                    stack: error.stack
                });
            }
            
            // 실패 시 롤백 시도
            await this.rollbackMigration();
            
            throw error;
        }
    }
    
    // 마이그레이션 롤백
    async rollbackMigration() {
        try {
            if (!this.backupData) {
                console.warn('롤백할 백업 데이터가 없습니다.');
                return false;
            }
            
            this.addMigrationLog('rollback_start', '롤백 시작');
            
            // 롤백 시작 로깅
            if (this.logger) {
                this.logger.logAction('migration_rollback_start', '마이그레이션 롤백 시작', {
                    username: this.backupData.username,
                    backupTimestamp: this.backupData.timestamp
                });
            }
            
            const { username, data } = this.backupData;
            
            // 백업 데이터 복원
            if (data.savedTexts.length > 0) {
                localStorage.setItem(
                    `dualTextWriter_savedTexts_${username}`, 
                    JSON.stringify(data.savedTexts)
                );
            }
            
            if (data.tempSave) {
                localStorage.setItem(
                    `dualTextWriter_tempSave_${username}`, 
                    JSON.stringify(data.tempSave)
                );
            }
            
            this.addMigrationLog('rollback_complete', '롤백 완료');
            
            // 롤백 완료 로깅
            if (this.logger) {
                this.logger.logAction('migration_rollback_complete', '마이그레이션 롤백 완료', {
                    username: this.backupData.username,
                    restoredItemCount: data.savedTexts.length,
                    tempSaveRestored: !!data.tempSave
                });
            }
            
            return true;
            
        } catch (error) {
            console.error('롤백 실패:', error);
            this.addMigrationLog('rollback_error', error.message);
            
            // 롤백 실패 로깅
            if (this.logger) {
                this.logger.logAction('migration_rollback_error', '마이그레이션 롤백 실패', {
                    error: error.message || error.toString(),
                    stack: error.stack
                });
            }
            
            return false;
        }
    }
    
    // 마이그레이션 ID 생성
    generateMigrationId() {
        return 'migration_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // 마이그레이션 로그 추가
    addMigrationLog(type, message, data = null) {
        const logEntry = {
            timestamp: Date.now(),
            type,
            message,
            data
        };
        
        this.migrationLog.push(logEntry);
        console.log(`📋 [Migration] ${message}`, data || '');
    }
    
    // 마이그레이션 기록 조회
    getMigrationRecord() {
        try {
            const record = localStorage.getItem('dualTextWriter_migrationRecord');
            return record ? JSON.parse(record) : null;
        } catch (error) {
            console.error('마이그레이션 기록 조회 실패:', error);
            return null;
        }
    }
    
    // 백업 데이터 조회
    getBackupData() {
        try {
            const backup = localStorage.getItem(this.config.MIGRATION_BACKUP_KEY);
            return backup ? JSON.parse(backup) : null;
        } catch (error) {
            console.error('백업 데이터 조회 실패:', error);
            return null;
        }
    }
    
    // 마이그레이션 상태 확인
    getMigrationStatus() {
        const record = this.getMigrationRecord();
        const backup = this.getBackupData();
        
        return {
            hasMigrationRecord: !!record,
            hasBackup: !!backup,
            migrationRecord: record,
            backupData: backup,
            log: this.migrationLog
        };
    }
    
    // 정리 작업
    cleanup() {
        // 30일 이상 된 백업 데이터 정리
        const backup = this.getBackupData();
        if (backup) {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            if (backup.timestamp < thirtyDaysAgo) {
                localStorage.removeItem(this.config.MIGRATION_BACKUP_KEY);
                console.log('🧹 오래된 백업 데이터 정리 완료');
            }
        }
    }
}

// 전역 인스턴스 생성
window.DataMigrationManager = DataMigrationManager;