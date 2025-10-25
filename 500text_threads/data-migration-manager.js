// 데이터 마이그레이션 매니저
class DataMigrationManager {
    constructor(config) {
        this.config = config;
    }

    // 마이그레이션 필요 여부 확인
    async checkMigrationNeeded(googleUserData) {
        const existingUser = localStorage.getItem(this.config.STORAGE_KEYS.CURRENT_USER);
        const authProvider = localStorage.getItem(this.config.STORAGE_KEYS.AUTH_PROVIDER);
        
        // 기존 사용자명 기반 사용자가 있고, Google 사용자가 아닌 경우
        if (existingUser && authProvider !== this.config.GOOGLE_AUTH_PROVIDER) {
            const existingData = this.getExistingUserData(existingUser);
            
            if (existingData.hasData) {
                return {
                    needed: true,
                    oldUsername: existingUser,
                    newEmail: googleUserData.email,
                    dataCount: existingData.dataCount,
                    dataTypes: existingData.dataTypes
                };
            }
        }
        
        return { needed: false };
    }

    // 기존 사용자 데이터 조회
    getExistingUserData(username) {
        try {
            const savedTextsKey = this.config.STORAGE_KEYS.SAVED_TEXTS + username;
            const tempSaveKey = this.config.STORAGE_KEYS.TEMP_SAVE + username;
            
            const savedTexts = localStorage.getItem(savedTextsKey);
            const tempSave = localStorage.getItem(tempSaveKey);
            
            const dataTypes = [];
            let dataCount = 0;
            
            if (savedTexts) {
                const texts = JSON.parse(savedTexts);
                dataCount += texts.length;
                dataTypes.push('저장된 글');
            }
            
            if (tempSave) {
                dataTypes.push('임시 저장');
            }
            
            return {
                hasData: dataCount > 0 || tempSave !== null,
                dataCount,
                dataTypes,
                savedTexts,
                tempSave
            };
            
        } catch (error) {
            console.error('기존 사용자 데이터 조회 실패:', error);
            return { hasData: false, dataCount: 0, dataTypes: [] };
        }
    }

    // 마이그레이션 확인 대화상자 표시
    async promptMigration(migrationInfo) {
        const message = `기존 사용자명 "${migrationInfo.oldUsername}"의 데이터가 있습니다.\n\n` +
                       `발견된 데이터:\n` +
                       `- ${migrationInfo.dataTypes.join('\n- ')}\n` +
                       `- 총 ${migrationInfo.dataCount}개의 저장된 글\n\n` +
                       `Google 계정 "${migrationInfo.newEmail}"으로 데이터를 이전하시겠습니까?\n\n` +
                       `이전하면 기존 데이터는 Google 계정으로 안전하게 보관됩니다.`;
        
        return confirm(message);
    }

    // 데이터 마이그레이션 수행
    async performMigration(oldUsername, newEmail) {
        try {
            // 1. 백업 생성
            const backup = await this.createBackup(oldUsername);
            
            // 2. 데이터 이전
            const migrationResult = await this.migrateUserData(oldUsername, newEmail);
            
            // 3. 마이그레이션 기록 저장
            await this.saveMigrationRecord(oldUsername, newEmail, migrationResult);
            
            // 4. 기존 데이터 정리 (백업 후)
            await this.cleanupOldData(oldUsername);
            
            return {
                success: true,
                migratedItems: migrationResult.migratedItems,
                backup: backup
            };
            
        } catch (error) {
            console.error('데이터 마이그레이션 실패:', error);
            
            // 실패 시 롤백 시도
            await this.rollbackMigration(oldUsername, newEmail);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 백업 생성
    async createBackup(username) {
        try {
            const timestamp = new Date().toISOString();
            const backupData = {
                username: username,
                timestamp: timestamp,
                data: {}
            };
            
            // 저장된 글 백업
            const savedTextsKey = this.config.STORAGE_KEYS.SAVED_TEXTS + username;
            const savedTexts = localStorage.getItem(savedTextsKey);
            if (savedTexts) {
                backupData.data.savedTexts = savedTexts;
            }
            
            // 임시 저장 백업
            const tempSaveKey = this.config.STORAGE_KEYS.TEMP_SAVE + username;
            const tempSave = localStorage.getItem(tempSaveKey);
            if (tempSave) {
                backupData.data.tempSave = tempSave;
            }
            
            // 백업 저장
            const backupKey = `${this.config.MIGRATION_BACKUP_KEY}_${username}_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify(backupData));
            
            return {
                backupKey: backupKey,
                timestamp: timestamp,
                itemCount: Object.keys(backupData.data).length
            };
            
        } catch (error) {
            console.error('백업 생성 실패:', error);
            throw new Error('백업 생성에 실패했습니다: ' + error.message);
        }
    }

    // 사용자 데이터 마이그레이션
    async migrateUserData(oldUsername, newEmail) {
        const migratedItems = [];
        
        try {
            // 저장된 글 마이그레이션
            const oldSavedTextsKey = this.config.STORAGE_KEYS.SAVED_TEXTS + oldUsername;
            const newSavedTextsKey = this.config.STORAGE_KEYS.SAVED_TEXTS + newEmail;
            
            const savedTexts = localStorage.getItem(oldSavedTextsKey);
            if (savedTexts) {
                localStorage.setItem(newSavedTextsKey, savedTexts);
                migratedItems.push('저장된 글');
            }
            
            // 임시 저장 마이그레이션
            const oldTempSaveKey = this.config.STORAGE_KEYS.TEMP_SAVE + oldUsername;
            const newTempSaveKey = this.config.STORAGE_KEYS.TEMP_SAVE + newEmail;
            
            const tempSave = localStorage.getItem(oldTempSaveKey);
            if (tempSave) {
                localStorage.setItem(newTempSaveKey, tempSave);
                migratedItems.push('임시 저장');
            }
            
            return {
                migratedItems: migratedItems,
                itemCount: migratedItems.length
            };
            
        } catch (error) {
            console.error('데이터 마이그레이션 실패:', error);
            throw new Error('데이터 마이그레이션에 실패했습니다: ' + error.message);
        }
    }

    // 마이그레이션 기록 저장
    async saveMigrationRecord(oldUsername, newEmail, migrationResult) {
        try {
            const migrationRecord = {
                oldUsername: oldUsername,
                newEmail: newEmail,
                migratedAt: Date.now(),
                migratedItems: migrationResult.migratedItems,
                itemCount: migrationResult.itemCount,
                version: '1.0'
            };
            
            localStorage.setItem(this.config.STORAGE_KEYS.MIGRATION_RECORD, JSON.stringify(migrationRecord));
            
        } catch (error) {
            console.error('마이그레이션 기록 저장 실패:', error);
        }
    }

    // 기존 데이터 정리
    async cleanupOldData(username) {
        try {
            // 기존 사용자 데이터 삭제
            const keysToRemove = [
                this.config.STORAGE_KEYS.SAVED_TEXTS + username,
                this.config.STORAGE_KEYS.TEMP_SAVE + username
            ];
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });
            
        } catch (error) {
            console.error('기존 데이터 정리 실패:', error);
        }
    }

    // 마이그레이션 롤백
    async rollbackMigration(oldUsername, newEmail) {
        try {
            // 새로 생성된 데이터 삭제
            const newKeysToRemove = [
                this.config.STORAGE_KEYS.SAVED_TEXTS + newEmail,
                this.config.STORAGE_KEYS.TEMP_SAVE + newEmail
            ];
            
            newKeysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });
            
            console.log('마이그레이션 롤백 완료');
            
        } catch (error) {
            console.error('마이그레이션 롤백 실패:', error);
        }
    }

    // 백업에서 데이터 복원
    async restoreFromBackup(backupKey) {
        try {
            const backupData = localStorage.getItem(backupKey);
            if (!backupData) {
                throw new Error('백업 데이터를 찾을 수 없습니다.');
            }
            
            const backup = JSON.parse(backupData);
            const username = backup.username;
            
            // 백업 데이터 복원
            if (backup.data.savedTexts) {
                const savedTextsKey = this.config.STORAGE_KEYS.SAVED_TEXTS + username;
                localStorage.setItem(savedTextsKey, backup.data.savedTexts);
            }
            
            if (backup.data.tempSave) {
                const tempSaveKey = this.config.STORAGE_KEYS.TEMP_SAVE + username;
                localStorage.setItem(tempSaveKey, backup.data.tempSave);
            }
            
            return {
                success: true,
                restoredUsername: username,
                timestamp: backup.timestamp
            };
            
        } catch (error) {
            console.error('백업 복원 실패:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 마이그레이션 기록 조회
    getMigrationRecord() {
        try {
            const record = localStorage.getItem(this.config.STORAGE_KEYS.MIGRATION_RECORD);
            return record ? JSON.parse(record) : null;
        } catch (error) {
            console.error('마이그레이션 기록 조회 실패:', error);
            return null;
        }
    }

    // 백업 목록 조회
    getBackupList() {
        try {
            const backups = [];
            const backupPrefix = this.config.MIGRATION_BACKUP_KEY + '_';
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(backupPrefix)) {
                    const backupData = JSON.parse(localStorage.getItem(key));
                    backups.push({
                        key: key,
                        username: backupData.username,
                        timestamp: backupData.timestamp,
                        itemCount: Object.keys(backupData.data).length
                    });
                }
            }
            
            return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        } catch (error) {
            console.error('백업 목록 조회 실패:', error);
            return [];
        }
    }

    // 오래된 백업 정리
    cleanupOldBackups(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30일
        try {
            const now = Date.now();
            const backups = this.getBackupList();
            
            backups.forEach(backup => {
                const backupAge = now - new Date(backup.timestamp).getTime();
                if (backupAge > maxAge) {
                    localStorage.removeItem(backup.key);
                }
            });
            
        } catch (error) {
            console.error('백업 정리 실패:', error);
        }
    }
}