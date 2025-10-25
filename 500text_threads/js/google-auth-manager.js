// Google OAuth 관리 클래스
class GoogleAuthManager {
    constructor(config, logger = null) {
        this.config = config;
        this.googleAuth = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.currentUser = null;
        this.tokenData = null; // Access Token 메모리 저장 (보안)
        this.tokenRefreshTimer = null;
        this.tokenRefreshTimeout = null; // setTimeout ID for token refresh
        this.tokenMonitoringInterval = null;
        this.tokenRefreshRetries = 0;
        this.maxTokenRefreshRetries = 3;
        
        // 에러 핸들러 초기화
        this.errorHandler = new ErrorHandler(logger);
        this.logger = logger;
        
        // 이벤트 리스너
        this.onSignInSuccess = null;
        this.onSignInError = null;
        this.onSignOutSuccess = null;
        this.onTokenRefresh = null;
        this.onTokenRefreshError = null; // 토큰 갱신 실패 콜백
        this.showMessage = null; // UI 메시지 표시 콜백
        this.showSetupInstructions = null; // 설정 안내 표시 콜백
        this.enableFallback = null; // 폴백 활성화 콜백
    }
    
    // Google OAuth 초기화 (향상된 버전)
    async initialize() {
        // 중복 초기화 방지
        if (this.isInitialized) {
            console.log('✅ Google OAuth는 이미 초기화되었습니다.');
            return true;
        }
        
        if (this.isInitializing) {
            console.log('⏳ Google OAuth 초기화가 진행 중입니다...');
            return false;
        }
        
        this.isInitializing = true;
        
        try {
            // 1단계: 설정 검증
            if (!this.config.validateGoogleConfig()) {
                const validationError = this.config.getValidationError();
                console.warn('⚠️ Google OAuth 설정 검증 실패');
                console.warn(this.config.getSetupInstructions());
                
                this.handleAuthError({
                    error: 'config_validation_failed',
                    message: validationError ? validationError.message : '설정 검증 실패'
                });
                
                this.isInitializing = false;
                return false;
            }
            
            // 2단계: Google API 스크립트 로드
            console.log('📦 Google API 스크립트 로드 중...');
            await this.loadGoogleAPI();
            
            // 3단계: Google 서비스 사용 가능 여부 확인
            if (!window.gapi) {
                throw new Error('Google API 스크립트를 로드할 수 없습니다.');
            }
            
            // 4단계: Google Auth 초기화
            console.log('🔐 Google Auth 초기화 중...');
            await this.initializeGoogleAuth();
            
            // 5단계: 기존 세션 복원 및 토큰 검증
            await this.restoreExistingSession();
            
            this.isInitialized = true;
            this.isInitializing = false;
            console.log('✅ Google OAuth 초기화 완료');
            return true;
            
        } catch (error) {
            console.error('❌ Google OAuth 초기화 실패:', error);
            
            this.handleAuthError(error);
            
            this.isInitialized = false;
            this.isInitializing = false;
            return false;
        }
    }
    
    // Google Identity Services 스크립트 지연 로딩 (새로운 API)
    loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            // 이미 로드된 경우
            if (window.google?.accounts) {
                console.log('📦 Google Identity Services 이미 로드됨');
                resolve();
                return;
            }
            
            // 네트워크 연결 확인
            if (!navigator.onLine) {
                reject(new Error('네트워크 연결이 없습니다.'));
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            
            script.onload = () => {
                console.log('📦 Google Identity Services 스크립트 로드 완료');
                resolve();
            };
            
            script.onerror = (error) => {
                console.error('❌ Google Identity Services 스크립트 로드 실패');
                reject(new Error('Google Identity Services를 로드할 수 없습니다. 네트워크 연결을 확인해주세요.'));
            };
            
            document.head.appendChild(script);
        });
    }
    
    // Google Identity Services 초기화 (새로운 API)
    initializeGoogleAuth() {
        return new Promise((resolve, reject) => {
            if (!window.google?.accounts) {
                reject(new Error('Google Identity Services가 로드되지 않았습니다.'));
                return;
            }
            
            try {
                // Google Identity Services는 별도의 초기화가 필요 없음
                // 토큰 클라이언트는 signIn 시점에 생성됨
                this.googleAuth = window.google.accounts.oauth2;
                
                console.log('🔐 Google Identity Services 초기화 완료');
                resolve();
                
            } catch (error) {
                console.error('❌ Google Identity Services 초기화 실패:', error);
                reject(error);
            }
        });
    }
    
    // 기존 세션 복원 및 토큰 검증 (Google Identity Services용)
    async restoreExistingSession() {
        try {
            // 로컬 스토리지에서 저장된 인증 상태 확인
            const authState = this.restoreAuthState();
            
            if (authState && authState.provider === 'google') {
                // 토큰 데이터가 메모리에 없으므로 재로그인 필요
                console.log('ℹ️ Google 사용자 세션 발견, 토큰 갱신 필요');
                // 토큰 모니터링은 시작하지 않음 (토큰이 없으므로)
            }
        } catch (error) {
            console.error('기존 세션 복원 실패:', error);
            await this.clearInvalidTokens();
        }
    }
    
    // 통합 에러 처리 시스템 (ErrorHandler 사용)
    handleAuthError(error) {
        // ErrorHandler를 통한 에러 처리
        const result = this.errorHandler.handleError(error, {
            // 사용자 메시지 표시 콜백
            showMessage: (message, type) => {
                if (this.showMessage) {
                    this.showMessage(message, type);
                }
            },
            
            // 설정 안내 표시 콜백
            showSetupInstructions: () => {
                if (this.showSetupInstructions) {
                    this.showSetupInstructions();
                }
            },
            
            // 폴백 활성화 콜백
            enableFallback: () => {
                if (this.enableFallback) {
                    this.enableFallback();
                }
            },
            
            // 토큰 자동 갱신 콜백
            autoRefreshToken: () => {
                this.refreshToken();
            },
            
            // 재로그인 프롬프트 콜백
            promptRelogin: () => {
                if (this.showMessage) {
                    this.showMessage('다시 로그인해주세요.', 'warning');
                }
            },
            
            // 재시도 옵션 제공 콜백
            offerRetry: () => {
                if (this.showMessage) {
                    this.showMessage('네트워크 연결을 확인한 후 다시 시도해주세요.', 'warning');
                }
            }
        });
        
        // 오류 콜백 호출 (기존 호환성 유지)
        if (this.onSignInError) {
            this.onSignInError({
                category: result.category,
                code: result.code,
                error: result.code,
                message: result.userMessage,
                action: result.action,
                handled: result.handled
            });
        }
        
        return result;
    }
    
    // Google 로그인 (Google Identity Services OAuth 2.0)
    async signIn() {
        if (!this.isInitialized) {
            const errorInfo = {
                type: 'initialization',
                error: 'not_initialized',
                message: 'Google OAuth가 초기화되지 않았습니다.'
            };
            this.handleAuthError(errorInfo);
            throw new Error(errorInfo.message);
        }
        
        // 로그인 시도 로깅
        if (this.logger) {
            this.logger.logAction('auth_login_attempt', 'Google 로그인 시도', {
                provider: 'google',
                timestamp: Date.now()
            });
        }
        
        return new Promise((resolve, reject) => {
            try {
                console.log('🔐 Google 로그인 시도 중...');
                
                // OAuth 2.0 토큰 클라이언트 설정
                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.config.GOOGLE_CLIENT_ID,
                    scope: this.config.OAUTH_SCOPES.join(' '),
                    callback: async (tokenResponse) => {
                        try {
                            if (tokenResponse.error) {
                                throw tokenResponse;
                            }
                            
                            // Access Token 메모리 저장
                            this.tokenData = {
                                accessToken: tokenResponse.access_token,
                                expiresIn: tokenResponse.expires_in,
                                expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                                tokenType: tokenResponse.token_type,
                                scope: tokenResponse.scope
                            };
                            
                            // 사용자 정보 가져오기 (Google People API)
                            const userInfo = await this.fetchUserInfo(this.tokenData.accessToken);
                            
                            const userData = {
                                id: userInfo.id,
                                name: userInfo.name,
                                email: userInfo.email,
                                picture: userInfo.picture,
                                provider: 'google',
                                accessToken: this.tokenData.accessToken,
                                expiresAt: this.tokenData.expiresAt,
                                loginTime: Date.now()
                            };
                            
                            this.currentUser = userData;
                            
                            // 로그인 성공 로깅
                            if (this.logger) {
                                this.logger.logAction('auth_login_success', 'Google 로그인 성공', {
                                    userId: userData.email,
                                    userName: userData.name,
                                    provider: 'google',
                                    loginTime: userData.loginTime,
                                    expiresAt: this.tokenData.expiresAt
                                });
                            }
                            
                            // 토큰 자동 갱신 스케줄링
                            this.scheduleTokenRefresh(this.tokenData.expiresAt);
                            
                            // 성공 콜백 호출
                            if (this.onSignInSuccess) {
                                this.onSignInSuccess(userData);
                            }
                            
                            console.log('✅ Google 로그인 성공:', userData.email);
                            resolve(userData);
                            
                        } catch (error) {
                            console.error('❌ 사용자 정보 가져오기 실패:', error);
                            
                            // 로그인 실패 로깅
                            if (this.logger) {
                                this.logger.logAction('auth_login_error', 'Google 로그인 실패', {
                                    error: error.message || error.toString(),
                                    errorType: error.error || 'unknown'
                                });
                            }
                            
                            this.handleAuthError(error);
                            reject(error);
                        }
                    },
                    error_callback: (error) => {
                        console.error('❌ Google 로그인 실패:', error);
                        
                        // 로그인 실패 로깅
                        if (this.logger) {
                            this.logger.logAction('auth_login_error', 'Google 로그인 실패', {
                                error: error.message || error.toString(),
                                errorType: error.error || 'unknown'
                            });
                        }
                        
                        this.handleAuthError(error);
                        reject(error);
                    }
                });
                
                // 토큰 요청 (팝업 표시)
                tokenClient.requestAccessToken({ prompt: 'select_account' });
                
            } catch (error) {
                console.error('❌ Google 로그인 초기화 실패:', error);
                
                // 로그인 실패 로깅
                if (this.logger) {
                    this.logger.logAction('auth_login_error', 'Google 로그인 초기화 실패', {
                        error: error.message || error.toString()
                    });
                }
                
                this.handleAuthError(error);
                reject(error);
            }
        });
    }
    
    // 사용자 정보 가져오기 (Google People API)
    async fetchUserInfo(accessToken) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`사용자 정보 가져오기 실패: ${response.status}`);
            }
            
            const userInfo = await response.json();
            
            // 이메일 검증 (보안 강화)
            if (!userInfo.email) {
                throw new Error('사용자 이메일 정보가 없습니다.');
            }
            
            // SecurityUtils를 사용한 이메일 형식 검증
            const securityUtils = new SecurityUtils();
            if (!securityUtils.isValidEmail(userInfo.email)) {
                console.error('❌ 유효하지 않은 이메일 형식:', userInfo.email);
                throw new Error('유효하지 않은 이메일 형식입니다.');
            }
            
            return userInfo;
            
        } catch (error) {
            console.error('사용자 정보 가져오기 오류:', error);
            throw error;
        }
    }
    
    // Google 로그아웃 (토큰 및 타이머 정리)
    async signOut() {
        if (!this.isInitialized) {
            console.warn('⚠️ Google OAuth가 초기화되지 않았습니다.');
            return;
        }
        
        try {
            console.log('🚪 Google 로그아웃 처리 중...');
            
            // 로그아웃 전 사용자 정보 저장 (로깅용)
            const logoutUserId = this.currentUser?.email || 'unknown';
            
            // 1단계: 타이머 정리 (tokenRefreshTimeout)
            if (this.tokenRefreshTimeout) {
                clearTimeout(this.tokenRefreshTimeout);
                this.tokenRefreshTimeout = null;
                console.log('⏹️ 토큰 갱신 타이머 정리 완료');
            }
            
            // 2단계: 메모리 토큰 데이터 삭제
            this.tokenData = null;
            console.log('🧹 메모리 토큰 데이터 삭제 완료');
            
            // 3단계: 현재 사용자 정보 초기화
            this.currentUser = null;
            
            // 4단계: 로컬 스토리지 사용자 정보 삭제
            this.clearAuthStorage();
            
            // 5단계: Google 자동 선택 비활성화
            if (window.google?.accounts?.id) {
                google.accounts.id.disableAutoSelect();
                console.log('🔒 Google 자동 선택 비활성화 완료');
            }
            
            // 6단계: 재시도 카운터 리셋
            this.tokenRefreshRetries = 0;
            
            // 로그아웃 성공 로깅
            if (this.logger) {
                this.logger.logAction('auth_logout_success', 'Google 로그아웃 성공', {
                    userId: logoutUserId,
                    provider: 'google',
                    logoutTime: Date.now()
                });
            }
            
            // 성공 콜백 호출
            if (this.onSignOutSuccess) {
                this.onSignOutSuccess();
            }
            
            console.log('✅ Google 로그아웃 완료');
            
        } catch (error) {
            console.error('❌ Google 로그아웃 실패:', error);
            
            // 로그아웃 실패 로깅
            if (this.logger) {
                this.logger.logAction('auth_logout_error', 'Google 로그아웃 실패', {
                    error: error.message || error.toString()
                });
            }
            
            // 오류가 발생해도 로컬 상태는 정리
            this.tokenData = null;
            this.currentUser = null;
            if (this.tokenRefreshTimeout) {
                clearTimeout(this.tokenRefreshTimeout);
                this.tokenRefreshTimeout = null;
            }
            this.clearAuthStorage();
            
            throw error;
        }
    }
    
    // 인증 관련 로컬 스토리지 정리
    clearAuthStorage() {
        try {
            localStorage.removeItem('dualTextWriter_userData');
            localStorage.removeItem('dualTextWriter_authProvider');
            console.log('🧹 인증 스토리지 정리 완료');
        } catch (error) {
            console.error('스토리지 정리 중 오류:', error);
        }
    }
    
    // 브라우저 세션 간 인증 상태 지속성
    saveAuthState(userData) {
        try {
            const authState = {
                userId: userData.id,
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                provider: 'google',
                loginTime: userData.loginTime,
                lastActivity: Date.now()
            };
            
            localStorage.setItem('dualTextWriter_authState', JSON.stringify(authState));
            console.log('💾 인증 상태 저장 완료');
            
        } catch (error) {
            console.error('인증 상태 저장 실패:', error);
        }
    }
    
    // 저장된 인증 상태 복원
    restoreAuthState() {
        try {
            const authStateStr = localStorage.getItem('dualTextWriter_authState');
            
            if (!authStateStr) {
                return null;
            }
            
            const authState = JSON.parse(authStateStr);
            
            // 세션 타임아웃 확인 (24시간)
            const sessionTimeout = 24 * 60 * 60 * 1000;
            const timeSinceLastActivity = Date.now() - authState.lastActivity;
            
            if (timeSinceLastActivity > sessionTimeout) {
                console.warn('⚠️ 세션이 만료되었습니다.');
                localStorage.removeItem('dualTextWriter_authState');
                return null;
            }
            
            console.log('✅ 인증 상태 복원 완료');
            return authState;
            
        } catch (error) {
            console.error('인증 상태 복원 실패:', error);
            return null;
        }
    }
    
    // 마지막 활동 시간 업데이트
    updateLastActivity() {
        try {
            const authStateStr = localStorage.getItem('dualTextWriter_authState');
            
            if (authStateStr) {
                const authState = JSON.parse(authStateStr);
                authState.lastActivity = Date.now();
                localStorage.setItem('dualTextWriter_authState', JSON.stringify(authState));
            }
        } catch (error) {
            console.error('활동 시간 업데이트 실패:', error);
        }
    }
    
    // 토큰 자동 갱신 스케줄링 (setTimeout 기반)
    scheduleTokenRefresh(expiresAt) {
        // 기존 타이머 정리
        if (this.tokenRefreshTimeout) {
            clearTimeout(this.tokenRefreshTimeout);
            this.tokenRefreshTimeout = null;
        }
        
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;
        
        // 만료 5분 전에 갱신
        const refreshThreshold = 5 * 60 * 1000; // 5분
        const refreshTime = timeUntilExpiry - refreshThreshold;
        
        if (refreshTime > 0) {
            const minutesUntilRefresh = Math.floor(refreshTime / 60000);
            console.log(`🔄 토큰 자동 갱신 예약: ${minutesUntilRefresh}분 후`);
            
            this.tokenRefreshTimeout = setTimeout(async () => {
                console.log('🔄 토큰 자동 갱신 시작...');
                await this.refreshToken();
            }, refreshTime);
        } else if (timeUntilExpiry > 0) {
            // 이미 5분 이내인 경우 즉시 갱신
            console.log('🔄 토큰이 곧 만료됩니다. 즉시 갱신 시도...');
            setTimeout(() => this.refreshToken(), 1000);
        } else {
            console.warn('⚠️ 토큰이 이미 만료되었습니다.');
        }
    }
    
    // 토큰 갱신 (재시도 로직 포함)
    async refreshToken() {
        if (!this.tokenData || !this.currentUser) {
            console.warn('⚠️ 갱신할 토큰 정보가 없습니다.');
            return null;
        }
        
        return new Promise((resolve, reject) => {
            try {
                // OAuth 2.0 토큰 클라이언트로 토큰 갱신
                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.config.GOOGLE_CLIENT_ID,
                    scope: this.config.OAUTH_SCOPES.join(' '),
                    callback: (tokenResponse) => {
                        try {
                            if (tokenResponse.error) {
                                throw tokenResponse;
                            }
                            
                            // 새 토큰 데이터 저장 (메모리)
                            this.tokenData = {
                                accessToken: tokenResponse.access_token,
                                expiresIn: tokenResponse.expires_in,
                                expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                                tokenType: tokenResponse.token_type,
                                scope: tokenResponse.scope
                            };
                            
                            // 사용자 데이터 업데이트
                            if (this.currentUser) {
                                this.currentUser.accessToken = this.tokenData.accessToken;
                                this.currentUser.expiresAt = this.tokenData.expiresAt;
                            }
                            
                            // 재시도 카운터 리셋
                            this.tokenRefreshRetries = 0;
                            
                            // 다음 갱신 스케줄링
                            this.scheduleTokenRefresh(this.tokenData.expiresAt);
                            
                            // 토큰 갱신 성공 로깅
                            if (this.logger) {
                                this.logger.logAction('token_refresh_success', '토큰 자동 갱신 성공', {
                                    userId: this.currentUser?.email || 'unknown',
                                    expiresAt: this.tokenData.expiresAt,
                                    refreshTime: Date.now(),
                                    expiresIn: this.tokenData.expiresIn
                                });
                            }
                            
                            // 갱신 콜백 호출
                            if (this.onTokenRefresh) {
                                this.onTokenRefresh({
                                    accessToken: this.tokenData.accessToken,
                                    expiresAt: this.tokenData.expiresAt,
                                    refreshTime: Date.now()
                                });
                            }
                            
                            console.log('✅ 토큰 갱신 완료');
                            resolve(this.tokenData);
                            
                        } catch (error) {
                            this.handleTokenRefreshError(error, reject);
                        }
                    },
                    error_callback: (error) => {
                        this.handleTokenRefreshError(error, reject);
                    }
                });
                
                // 토큰 갱신 요청 (prompt 없이)
                tokenClient.requestAccessToken({ prompt: '' });
                
            } catch (error) {
                this.handleTokenRefreshError(error, reject);
            }
        });
    }
    
    // 토큰 갱신 실패 처리 (재시도 로직)
    async handleTokenRefreshError(error, reject) {
        console.error('❌ 토큰 갱신 실패:', error);
        
        // 토큰 갱신 실패 로깅
        if (this.logger) {
            this.logger.logAction('token_refresh_error', '토큰 갱신 실패', {
                userId: this.currentUser?.email || 'unknown',
                error: error.message || error.toString(),
                errorType: error.error || 'unknown',
                retryCount: this.tokenRefreshRetries
            });
        }
        
        this.tokenRefreshRetries++;
        
        if (this.tokenRefreshRetries <= 1) {
            // 1회 재시도 (30초 후)
            console.log(`🔄 토큰 갱신 재시도 (${this.tokenRefreshRetries}/1) - 30초 후...`);
            
            // 재시도 로깅
            if (this.logger) {
                this.logger.logAction('token_refresh_retry', '토큰 갱신 재시도 예약', {
                    userId: this.currentUser?.email || 'unknown',
                    retryCount: this.tokenRefreshRetries,
                    retryDelay: 30000
                });
            }
            
            setTimeout(async () => {
                try {
                    const result = await this.refreshToken();
                    if (reject) {
                        // 이미 reject된 경우가 아니면 resolve
                        // Promise는 한 번만 resolve/reject 가능
                    }
                } catch (retryError) {
                    console.error('❌ 토큰 갱신 재시도 실패:', retryError);
                    
                    // 오류 처리
                    this.handleAuthError({
                        error: 'token_refresh_failed',
                        message: '토큰 갱신에 실패했습니다. 다시 로그인해주세요.'
                    });
                    
                    // 토큰 갱신 실패 콜백 호출
                    if (this.onTokenRefreshError) {
                        this.onTokenRefreshError(retryError);
                    }
                    
                    if (reject) {
                        reject(retryError);
                    }
                }
            }, 30000); // 30초
            
        } else {
            console.error('❌ 토큰 갱신 최대 재시도 횟수 초과');
            
            // 최대 재시도 초과 로깅
            if (this.logger) {
                this.logger.logAction('token_refresh_max_retries', '토큰 갱신 최대 재시도 횟수 초과', {
                    userId: this.currentUser?.email || 'unknown',
                    maxRetries: 1,
                    totalAttempts: this.tokenRefreshRetries
                });
            }
            
            // 오류 처리
            this.handleAuthError({
                error: 'token_refresh_failed',
                message: '토큰 갱신에 실패했습니다. 다시 로그인해주세요.'
            });
            
            // 토큰 갱신 실패 콜백 호출
            if (this.onTokenRefreshError) {
                this.onTokenRefreshError(error);
            }
            
            // 토큰 정리
            await this.clearInvalidTokens();
            
            if (reject) {
                reject(error);
            }
        }
    }
    
    // 애플리케이션 시작 시 토큰 검증
    validateToken() {
        if (!this.tokenData) {
            return false;
        }
        
        try {
            if (!this.tokenData.accessToken) {
                console.warn('⚠️ 토큰 정보가 없습니다.');
                return false;
            }
            
            const now = Date.now();
            const expiresAt = this.tokenData.expiresAt;
            
            const isValid = expiresAt > now;
            
            if (!isValid) {
                console.warn('⚠️ 토큰이 만료되었습니다.');
            }
            
            return isValid;
            
        } catch (error) {
            console.error('토큰 검증 중 오류:', error);
            return false;
        }
    }
    
    // 유효하지 않거나 만료된 토큰 정리
    async clearInvalidTokens() {
        console.log('🧹 유효하지 않은 토큰 정리 중...');
        
        try {
            // 타이머 정리
            if (this.tokenRefreshTimeout) {
                clearTimeout(this.tokenRefreshTimeout);
                this.tokenRefreshTimeout = null;
            }
            
            // 메모리 토큰 데이터 삭제
            this.tokenData = null;
            
            // 현재 사용자 정보 초기화
            this.currentUser = null;
            
            // 로컬 스토리지 정리
            localStorage.removeItem('dualTextWriter_userData');
            localStorage.removeItem('dualTextWriter_authProvider');
            localStorage.removeItem('dualTextWriter_authState');
            
            console.log('✅ 토큰 정리 완료');
            
        } catch (error) {
            console.error('토큰 정리 중 오류:', error);
        }
    }
    
    // 현재 사용자 정보 반환
    getCurrentUser() {
        if (!this.currentUser) {
            return null;
        }
        
        try {
            return {
                id: this.currentUser.id,
                name: this.currentUser.name,
                email: this.currentUser.email,
                picture: this.currentUser.picture,
                provider: 'google',
                accessToken: this.tokenData?.accessToken || this.currentUser.accessToken,
                expiresAt: this.tokenData?.expiresAt || this.currentUser.expiresAt,
                isValid: this.validateToken(),
                loginTime: this.currentUser.loginTime
            };
        } catch (error) {
            console.error('사용자 정보 조회 실패:', error);
            return null;
        }
    }
    
    // 로그인 상태 확인
    isSignedIn() {
        try {
            return this.isInitialized && 
                   this.currentUser !== null && 
                   this.tokenData !== null &&
                   this.validateToken();
        } catch (error) {
            console.error('로그인 상태 확인 실패:', error);
            return false;
        }
    }
    
    // 인증 상태 정보 반환 (디버깅용)
    getAuthStatus() {
        return {
            isInitialized: this.isInitialized,
            isInitializing: this.isInitializing,
            hasCurrentUser: !!this.currentUser,
            isSignedIn: this.isSignedIn(),
            tokenValid: this.validateToken(),
            tokenRefreshRetries: this.tokenRefreshRetries,
            monitoringActive: !!this.tokenMonitoringInterval
        };
    }
    
    // 정리 작업
    cleanup() {
        console.log('🧹 GoogleAuthManager 정리 중...');
        
        // 타이머 정리
        if (this.tokenRefreshTimeout) {
            clearTimeout(this.tokenRefreshTimeout);
            this.tokenRefreshTimeout = null;
        }
        
        // 상태 초기화
        this.tokenData = null;
        this.currentUser = null;
        this.googleAuth = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.tokenRefreshRetries = 0;
        
        console.log('✅ GoogleAuthManager 정리 완료');
    }
}

// 전역 인스턴스 생성
window.GoogleAuthManager = GoogleAuthManager;