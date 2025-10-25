// Google OAuth 관리 클래스
class GoogleAuthManager {
    constructor(config) {
        this.config = config;
        this.googleAuth = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.currentUser = null;
        this.tokenRefreshTimer = null;
        this.tokenMonitoringInterval = null;
        this.tokenRefreshRetries = 0;
        this.maxTokenRefreshRetries = 3;
        
        // 이벤트 리스너
        this.onSignInSuccess = null;
        this.onSignInError = null;
        this.onSignOutSuccess = null;
        this.onTokenRefresh = null;
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
                    type: 'configuration',
                    error: 'config_validation_failed',
                    message: validationError ? validationError.message : '설정 검증 실패',
                    details: validationError
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
            
            this.handleAuthError({
                type: 'initialization',
                error: 'init_failed',
                message: 'Google OAuth 초기화에 실패했습니다.',
                details: error
            });
            
            this.isInitialized = false;
            this.isInitializing = false;
            return false;
        }
    }
    
    // Google API 스크립트 로드 (향상된 버전)
    loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            // 이미 로드된 경우
            if (window.gapi) {
                console.log('📦 Google API 스크립트 이미 로드됨');
                resolve();
                return;
            }
            
            // 네트워크 연결 확인
            if (!navigator.onLine) {
                reject(new Error('네트워크 연결이 없습니다.'));
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.async = true;
            script.defer = true;
            
            script.onload = () => {
                console.log('📦 Google API 스크립트 로드 완료');
                resolve();
            };
            
            script.onerror = (error) => {
                console.error('❌ Google API 스크립트 로드 실패');
                reject(new Error('Google API 스크립트를 로드할 수 없습니다. 네트워크 연결을 확인해주세요.'));
            };
            
            document.head.appendChild(script);
        });
    }
    
    // Google Auth 초기화 (향상된 버전)
    initializeGoogleAuth() {
        return new Promise((resolve, reject) => {
            if (!window.gapi) {
                reject(new Error('Google API가 로드되지 않았습니다.'));
                return;
            }
            
            gapi.load('auth2', async () => {
                try {
                    // 이미 초기화된 경우 기존 인스턴스 사용
                    if (gapi.auth2.getAuthInstance()) {
                        this.googleAuth = gapi.auth2.getAuthInstance();
                        console.log('🔐 기존 Google Auth 인스턴스 사용');
                        resolve();
                        return;
                    }
                    
                    // 새로운 인스턴스 초기화
                    this.googleAuth = await gapi.auth2.init({
                        client_id: this.config.GOOGLE_CLIENT_ID,
                        scope: this.config.OAUTH_SCOPES.join(' '),
                        fetch_basic_profile: true,
                        ux_mode: 'popup'
                    });
                    
                    console.log('🔐 Google Auth 초기화 완료');
                    resolve();
                    
                } catch (error) {
                    console.error('❌ Google Auth 초기화 실패:', error);
                    reject(error);
                }
            });
        });
    }
    
    // 기존 세션 복원 및 토큰 검증
    async restoreExistingSession() {
        try {
            if (!this.googleAuth) {
                return;
            }
            
            // 기존 로그인 상태 확인
            if (this.googleAuth.isSignedIn.get()) {
                this.currentUser = this.googleAuth.currentUser.get();
                
                // 토큰 유효성 검증
                const isValid = this.validateToken();
                
                if (isValid) {
                    console.log('✅ 기존 세션 복원 완료');
                    this.startTokenMonitoring();
                } else {
                    console.warn('⚠️ 기존 토큰이 만료되었습니다.');
                    await this.clearInvalidTokens();
                }
            }
        } catch (error) {
            console.error('기존 세션 복원 실패:', error);
            await this.clearInvalidTokens();
        }
    }
    
    // 포괄적인 오류 처리 시스템
    handleAuthError(errorInfo) {
        const { type, error, message, details } = errorInfo;
        
        // 상세한 콘솔 로깅 (디버깅용)
        console.group('🔴 Google OAuth 오류');
        console.error('오류 유형:', type);
        console.error('오류 코드:', error);
        console.error('오류 메시지:', message);
        if (details) {
            console.error('상세 정보:', details);
        }
        console.groupEnd();
        
        // 사용자 친화적 메시지 생성
        const userMessage = this.getUserFriendlyErrorMessage(type, error);
        
        // 오류 콜백 호출
        if (this.onSignInError) {
            this.onSignInError({
                type,
                error,
                message: userMessage,
                technicalDetails: details
            });
        }
        
        return userMessage;
    }
    
    // 사용자 친화적 오류 메시지 생성
    getUserFriendlyErrorMessage(type, error) {
        const errorMessages = {
            // 설정 오류
            configuration: {
                'config_validation_failed': 'Google 로그인 설정이 완료되지 않았습니다. 기존 방식으로 로그인해주세요.',
                'invalid_client_id': 'Google Client ID가 올바르지 않습니다.',
                'https_required': '보안을 위해 HTTPS 연결이 필요합니다.'
            },
            
            // 네트워크 오류
            network: {
                'network_error': '네트워크 연결을 확인해주세요.',
                'timeout': '요청 시간이 초과되었습니다. 다시 시도해주세요.',
                'service_unavailable': 'Google 서비스에 일시적으로 접속할 수 없습니다.'
            },
            
            // 인증 오류
            authentication: {
                'popup_closed_by_user': '로그인이 취소되었습니다.',
                'popup_blocked': '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.',
                'access_denied': '로그인 권한이 거부되었습니다.',
                'invalid_grant': '인증 정보가 유효하지 않습니다. 다시 로그인해주세요.'
            },
            
            // 토큰 오류
            token: {
                'token_expired': '로그인 세션이 만료되었습니다. 다시 로그인해주세요.',
                'token_refresh_failed': '세션 갱신에 실패했습니다. 다시 로그인해주세요.',
                'invalid_token': '인증 토큰이 유효하지 않습니다.'
            },
            
            // 초기화 오류
            initialization: {
                'init_failed': 'Google 로그인을 초기화할 수 없습니다. 기존 방식으로 로그인해주세요.',
                'script_load_failed': 'Google 서비스를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.'
            }
        };
        
        // 오류 메시지 조회
        if (errorMessages[type] && errorMessages[type][error]) {
            return errorMessages[type][error];
        }
        
        // 기본 메시지
        return 'Google 로그인 중 오류가 발생했습니다. 기존 방식으로 로그인해주세요.';
    }
    
    // 오류 분류 및 처리
    categorizeError(error) {
        // 네트워크 오류
        if (!navigator.onLine) {
            return {
                type: 'network',
                error: 'network_error',
                message: '네트워크 연결이 없습니다.'
            };
        }
        
        // Google API 오류 코드 분석
        if (error.error) {
            const errorCode = error.error;
            
            // 사용자 취소
            if (errorCode === 'popup_closed_by_user' || errorCode === 'access_denied') {
                return {
                    type: 'authentication',
                    error: errorCode,
                    message: '사용자가 로그인을 취소했습니다.'
                };
            }
            
            // 팝업 차단
            if (errorCode === 'popup_blocked_by_browser') {
                return {
                    type: 'authentication',
                    error: 'popup_blocked',
                    message: '팝업이 차단되었습니다.'
                };
            }
            
            // 토큰 오류
            if (errorCode === 'invalid_grant' || errorCode === 'token_expired') {
                return {
                    type: 'token',
                    error: errorCode,
                    message: '인증 토큰이 유효하지 않습니다.'
                };
            }
        }
        
        // 기타 오류
        return {
            type: 'unknown',
            error: 'unknown_error',
            message: error.message || '알 수 없는 오류가 발생했습니다.'
        };
    }
    
    // Google 로그인 (향상된 오류 처리)
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
        
        try {
            console.log('🔐 Google 로그인 시도 중...');
            
            const googleUser = await this.googleAuth.signIn({
                prompt: 'select_account'
            });
            
            this.currentUser = googleUser;
            
            // 사용자 정보 추출
            const profile = googleUser.getBasicProfile();
            const authResponse = googleUser.getAuthResponse();
            
            const userData = {
                id: profile.getId(),
                name: profile.getName(),
                email: profile.getEmail(),
                picture: profile.getImageUrl(),
                provider: 'google',
                accessToken: authResponse.access_token,
                expiresAt: authResponse.expires_at * 1000,
                loginTime: Date.now()
            };
            
            // 토큰 모니터링 시작
            this.startTokenMonitoring();
            
            // 성공 콜백 호출
            if (this.onSignInSuccess) {
                this.onSignInSuccess(userData);
            }
            
            console.log('✅ Google 로그인 성공:', userData.email);
            return userData;
            
        } catch (error) {
            console.error('❌ Google 로그인 실패:', error);
            
            // 오류 분류 및 처리
            const categorizedError = this.categorizeError(error);
            this.handleAuthError(categorizedError);
            
            throw error;
        }
    }
    
    // Google 로그아웃 (향상된 버전 - 토큰 정리 포함)
    async signOut() {
        if (!this.isInitialized) {
            console.warn('⚠️ Google OAuth가 초기화되지 않았습니다.');
            return;
        }
        
        try {
            console.log('🚪 Google 로그아웃 처리 중...');
            
            // 1단계: 토큰 모니터링 정지
            this.stopTokenMonitoring();
            
            // 2단계: Google Auth 로그아웃
            if (this.googleAuth && this.googleAuth.isSignedIn.get()) {
                await this.googleAuth.signOut();
            }
            
            // 3단계: 현재 사용자 정보 초기화
            this.currentUser = null;
            
            // 4단계: 로컬 스토리지 정리
            this.clearAuthStorage();
            
            // 5단계: 재시도 카운터 리셋
            this.tokenRefreshRetries = 0;
            
            // 성공 콜백 호출
            if (this.onSignOutSuccess) {
                this.onSignOutSuccess();
            }
            
            console.log('✅ Google 로그아웃 완료');
            
        } catch (error) {
            console.error('❌ Google 로그아웃 실패:', error);
            
            // 오류가 발생해도 로컬 상태는 정리
            this.currentUser = null;
            this.stopTokenMonitoring();
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
    
    // 토큰 모니터링 시작 (5분 임계값)
    startTokenMonitoring() {
        this.stopTokenMonitoring();
        
        console.log('🔄 토큰 모니터링 시작');
        
        // 1분마다 토큰 상태 확인
        this.tokenMonitoringInterval = setInterval(async () => {
            await this.checkTokenExpiry();
        }, 60000); // 1분
        
        // 즉시 한 번 확인
        this.checkTokenExpiry();
    }
    
    // 토큰 모니터링 정지
    stopTokenMonitoring() {
        if (this.tokenMonitoringInterval) {
            clearInterval(this.tokenMonitoringInterval);
            this.tokenMonitoringInterval = null;
            console.log('⏹️ 토큰 모니터링 정지');
        }
    }
    
    // 토큰 만료 확인 및 자동 갱신
    async checkTokenExpiry() {
        if (!this.currentUser) {
            return;
        }
        
        try {
            const authResponse = this.currentUser.getAuthResponse();
            const now = Date.now();
            const expiresAt = authResponse.expires_at * 1000;
            const timeUntilExpiry = expiresAt - now;
            
            // 5분 임계값
            const refreshThreshold = 5 * 60 * 1000;
            
            // 이미 만료된 경우
            if (timeUntilExpiry <= 0) {
                console.warn('⚠️ 토큰이 이미 만료되었습니다.');
                await this.clearInvalidTokens();
                return;
            }
            
            // 5분 이내 만료 예정인 경우 자동 갱신
            if (timeUntilExpiry < refreshThreshold && timeUntilExpiry > 0) {
                const minutesLeft = Math.floor(timeUntilExpiry / 60000);
                console.log(`🔄 토큰이 ${minutesLeft}분 후 만료됩니다. 자동 갱신 시도...`);
                await this.refreshTokenIfNeeded();
            }
            
        } catch (error) {
            console.error('토큰 만료 확인 중 오류:', error);
        }
    }
    
    // 토큰 갱신 (재시도 로직 포함)
    async refreshTokenIfNeeded() {
        if (!this.currentUser) {
            return null;
        }
        
        try {
            const authResponse = await this.currentUser.reloadAuthResponse();
            
            const tokenData = {
                accessToken: authResponse.access_token,
                expiresAt: authResponse.expires_at * 1000,
                refreshTime: Date.now()
            };
            
            // 재시도 카운터 리셋
            this.tokenRefreshRetries = 0;
            
            // 갱신 콜백 호출
            if (this.onTokenRefresh) {
                this.onTokenRefresh(tokenData);
            }
            
            console.log('✅ 토큰 갱신 완료');
            return tokenData;
            
        } catch (error) {
            console.error('❌ 토큰 갱신 실패:', error);
            
            // 재시도 로직
            this.tokenRefreshRetries++;
            
            if (this.tokenRefreshRetries < this.maxTokenRefreshRetries) {
                console.log(`🔄 토큰 갱신 재시도 (${this.tokenRefreshRetries}/${this.maxTokenRefreshRetries})...`);
                
                // 지수 백오프: 2초, 4초, 8초
                const retryDelay = Math.pow(2, this.tokenRefreshRetries) * 1000;
                
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await this.refreshTokenIfNeeded();
                
            } else {
                console.error('❌ 토큰 갱신 최대 재시도 횟수 초과');
                
                // 오류 처리
                const errorInfo = {
                    type: 'token',
                    error: 'token_refresh_failed',
                    message: '토큰 갱신에 실패했습니다.',
                    details: error
                };
                this.handleAuthError(errorInfo);
                
                // 토큰 정리 및 로그아웃
                await this.clearInvalidTokens();
                
                throw error;
            }
        }
    }
    
    // 애플리케이션 시작 시 토큰 검증
    validateToken() {
        if (!this.currentUser) {
            return false;
        }
        
        try {
            const authResponse = this.currentUser.getAuthResponse();
            
            if (!authResponse || !authResponse.access_token) {
                console.warn('⚠️ 토큰 정보가 없습니다.');
                return false;
            }
            
            const now = Date.now();
            const expiresAt = authResponse.expires_at * 1000;
            
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
            // 토큰 모니터링 정지
            this.stopTokenMonitoring();
            
            // 현재 사용자 정보 초기화
            this.currentUser = null;
            
            // Google Auth 로그아웃 (조용히)
            if (this.googleAuth && this.googleAuth.isSignedIn.get()) {
                await this.googleAuth.signOut();
            }
            
            // 로컬 스토리지 정리
            localStorage.removeItem('dualTextWriter_userData');
            localStorage.removeItem('dualTextWriter_authProvider');
            
            console.log('✅ 토큰 정리 완료');
            
        } catch (error) {
            console.error('토큰 정리 중 오류:', error);
        }
    }
    
    // 현재 사용자 정보 반환 (향상된 버전)
    getCurrentUser() {
        if (!this.currentUser) {
            return null;
        }
        
        try {
            const profile = this.currentUser.getBasicProfile();
            const authResponse = this.currentUser.getAuthResponse();
            
            return {
                id: profile.getId(),
                name: profile.getName(),
                email: profile.getEmail(),
                picture: profile.getImageUrl(),
                provider: 'google',
                accessToken: authResponse.access_token,
                expiresAt: authResponse.expires_at * 1000,
                isValid: this.validateToken(),
                loginTime: Date.now()
            };
        } catch (error) {
            console.error('사용자 정보 조회 실패:', error);
            return null;
        }
    }
    
    // 로그인 상태 확인 (향상된 버전)
    isSignedIn() {
        try {
            return this.isInitialized && 
                   this.googleAuth && 
                   this.googleAuth.isSignedIn.get() && 
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
    
    // 정리 작업 (향상된 버전)
    cleanup() {
        console.log('🧹 GoogleAuthManager 정리 중...');
        
        // 토큰 모니터링 정지
        this.stopTokenMonitoring();
        
        // 상태 초기화
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