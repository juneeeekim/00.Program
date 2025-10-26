/**
 * UsernameAuthProvider
 * 
 * 사용자명 기반 인증 제공자
 * - 사용자명 로그인 처리
 * - 로그아웃 및 데이터 정리
 * - 세션 관리 (localStorage)
 * - 사용자 친화적 에러 처리
 * 
 * Requirements: 1.3, 1.6
 */

class UsernameAuthProvider {
    constructor(validator, logger, securityManager) {
        // 의존성
        this.validator = validator || new UsernameValidator();
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        this.securityManager = securityManager || null;
        
        // 현재 사용자
        this.currentUser = null;
        
        // 세션 키
        this.SESSION_KEY = 'dualTextWriter_currentUser';
        this.AUTH_PROVIDER_KEY = 'dualTextWriter_authProvider';
        this.SESSION_DATA_KEY = 'dualTextWriter_usernameSession';
        
        // 에러 메시지
        this.errorMessages = {
            validationFailed: '사용자명이 올바르지 않습니다.',
            loginFailed: '로그인에 실패했습니다. 다시 시도해주세요.',
            sessionExpired: '세션이 만료되었습니다. 다시 로그인해주세요.',
            storageFull: '저장 공간이 부족합니다. 브라우저 데이터를 정리해주세요.'
        };
    }
    
    /**
     * 사용자명으로 로그인
     * @param {string} username - 로그인할 사용자명
     * @returns {Promise<Object>} 사용자 세션 정보
     */
    async login(username) {
        try {
            // 1. 사용자명 검증
            const validationResult = this.validator.validate(username);
            
            if (!validationResult.valid) {
                const error = new Error(validationResult.errors[0] || this.errorMessages.validationFailed);
                error.code = 'VALIDATION_FAILED';
                error.details = validationResult.errors;
                throw error;
            }
            
            // 2. 사용자명 정제
            const sanitizedUsername = this.validator.sanitize(username);
            
            // 3. 기기 유형 확인 (SecurityManager가 있는 경우)
            let deviceType = 'personal';
            if (this.securityManager) {
                // 첫 로그인 시에만 물어봄
                const isFirstLogin = !localStorage.getItem('dualTextWriter_deviceType');
                if (isFirstLogin) {
                    deviceType = await this.securityManager.askDeviceType();
                } else {
                    deviceType = this.securityManager.getDeviceType() || 'personal';
                }
            }
            
            // 4. 세션 생성
            const session = this.createSession(sanitizedUsername, deviceType);
            
            // 5. 세션 저장
            this.saveSession(session);
            
            // 6. 현재 사용자 설정
            this.currentUser = sanitizedUsername;
            
            // 7. 로깅
            if (this.logger) {
                this.logger.setUserId(sanitizedUsername);
                this.logger.logAction('username_login_success', '사용자명 로그인 성공', {
                    username: sanitizedUsername,
                    deviceType: deviceType,
                    timestamp: session.loginTime
                });
            }
            
            console.log('✅ 사용자명 로그인 성공:', sanitizedUsername, '기기 유형:', deviceType);
            
            return session;
            
        } catch (error) {
            // 에러 로깅
            if (this.logger) {
                this.logger.logAction('username_login_failed', '사용자명 로그인 실패', {
                    error: error.message,
                    code: error.code
                });
            }
            
            console.error('❌ 사용자명 로그인 실패:', error);
            
            // 사용자 친화적 에러 메시지
            throw this.createUserFriendlyError(error);
        }
    }
    
    /**
     * 로그아웃 및 데이터 정리
     * @param {boolean} clearData - 데이터 완전 삭제 여부 (공용 모드용)
     * @returns {Promise<void>}
     */
    async logout(clearData = false) {
        try {
            const username = this.currentUser;
            
            // 1. 세션 정리
            this.clearSession();
            
            // 2. 데이터 정리 (공용 모드인 경우)
            if (clearData) {
                this.clearAllUserData(username);
            }
            
            // 3. 현재 사용자 초기화
            this.currentUser = null;
            
            // 4. 로깅
            if (this.logger) {
                this.logger.logAction('username_logout', '사용자명 로그아웃', {
                    username: username,
                    dataCleared: clearData
                });
            }
            
            console.log('✅ 로그아웃 완료:', username);
            
        } catch (error) {
            console.error('❌ 로그아웃 중 오류:', error);
            
            // 로그아웃은 실패해도 세션은 정리
            this.clearSession();
            this.currentUser = null;
            
            throw error;
        }
    }
    
    /**
     * 세션 생성
     * @param {string} username
     * @param {string} deviceType - 'personal' | 'public'
     * @returns {Object}
     */
    createSession(username, deviceType = 'personal') {
        return {
            userId: username,
            authProvider: 'username',
            loginTime: Date.now(),
            deviceType: deviceType,
            sessionId: this.generateSessionId()
        };
    }
    
    /**
     * 세션 저장
     * @param {Object} session
     */
    saveSession(session) {
        try {
            // 현재 사용자 저장
            localStorage.setItem(this.SESSION_KEY, session.userId);
            
            // 인증 제공자 저장
            localStorage.setItem(this.AUTH_PROVIDER_KEY, 'username');
            
            // 세션 데이터 저장
            localStorage.setItem(this.SESSION_DATA_KEY, JSON.stringify(session));
            
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                const storageError = new Error(this.errorMessages.storageFull);
                storageError.code = 'STORAGE_FULL';
                throw storageError;
            }
            throw error;
        }
    }
    
    /**
     * 세션 복원
     * @returns {Object|null}
     */
    restoreSession() {
        try {
            const userId = localStorage.getItem(this.SESSION_KEY);
            const authProvider = localStorage.getItem(this.AUTH_PROVIDER_KEY);
            const sessionData = localStorage.getItem(this.SESSION_DATA_KEY);
            
            // 사용자명 인증이 아니면 null 반환
            if (authProvider !== 'username' || !userId) {
                return null;
            }
            
            // 세션 데이터 파싱
            let session = null;
            if (sessionData) {
                session = JSON.parse(sessionData);
            } else {
                // 레거시 세션 (세션 데이터 없음)
                session = {
                    userId: userId,
                    authProvider: 'username',
                    loginTime: Date.now(),
                    deviceType: 'personal',
                    sessionId: this.generateSessionId()
                };
            }
            
            // 현재 사용자 설정
            this.currentUser = userId;
            
            // 로깅
            if (this.logger) {
                this.logger.setUserId(userId);
                this.logger.logAction('session_restored', '세션 복원', {
                    username: userId
                });
            }
            
            return session;
            
        } catch (error) {
            console.error('세션 복원 실패:', error);
            return null;
        }
    }
    
    /**
     * 세션 정리
     */
    clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.AUTH_PROVIDER_KEY);
        localStorage.removeItem(this.SESSION_DATA_KEY);
    }
    
    /**
     * 사용자 데이터 완전 삭제 (공용 모드용)
     * @param {string} username
     */
    clearAllUserData(username) {
        if (!username) return;
        
        try {
            // 저장된 글 삭제
            const savedTextsKey = `dualTextWriter_savedTexts_${username}`;
            localStorage.removeItem(savedTextsKey);
            
            // 임시 저장 데이터 삭제
            const tempSaveKey = `dualTextWriter_tempSave_${username}`;
            localStorage.removeItem(tempSaveKey);
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('user_data_cleared', '사용자 데이터 삭제', {
                    username: username
                });
            }
            
            console.log('✅ 사용자 데이터 삭제 완료:', username);
            
        } catch (error) {
            console.error('❌ 사용자 데이터 삭제 실패:', error);
        }
    }
    
    /**
     * 현재 사용자 가져오기
     * @returns {string|null}
     */
    getCurrentUser() {
        return this.currentUser;
    }
    
    /**
     * 로그인 상태 확인
     * @returns {boolean}
     */
    isLoggedIn() {
        return this.currentUser !== null;
    }
    
    /**
     * 세션 ID 생성
     * @returns {string}
     */
    generateSessionId() {
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 사용자 친화적 에러 생성
     * @param {Error} error
     * @returns {Error}
     */
    createUserFriendlyError(error) {
        const userError = new Error();
        userError.originalError = error;
        
        switch (error.code) {
            case 'VALIDATION_FAILED':
                userError.message = error.message;
                userError.userMessage = error.message;
                break;
                
            case 'STORAGE_FULL':
                userError.message = this.errorMessages.storageFull;
                userError.userMessage = this.errorMessages.storageFull;
                userError.action = 'SHOW_STORAGE_MANAGEMENT';
                break;
                
            default:
                userError.message = this.errorMessages.loginFailed;
                userError.userMessage = this.errorMessages.loginFailed;
                break;
        }
        
        return userError;
    }
    
    /**
     * 에러 메시지 가져오기
     * @param {Error} error
     * @returns {string}
     */
    getErrorMessage(error) {
        if (error.userMessage) {
            return error.userMessage;
        }
        
        if (error.code === 'VALIDATION_FAILED' && error.details) {
            return error.details[0] || this.errorMessages.validationFailed;
        }
        
        return error.message || this.errorMessages.loginFailed;
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.UsernameAuthProvider = UsernameAuthProvider;
}
