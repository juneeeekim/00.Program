// Google OAuth 2.0 인증 매니저
class GoogleAuthManager {
    constructor(config) {
        this.config = config;
        this.googleAuth = null;
        this.isInitialized = false;
        this.tokenCheckInterval = null;
        this.currentUser = null;
    }

    // Google OAuth 초기화
    async initialize() {
        try {
            // Google API 스크립트 로드
            await this.loadGoogleAPI();
            
            // Google Identity Services 초기화
            await this.initializeGoogleIdentity();
            
            this.isInitialized = true;
            this.startTokenMonitoring();
            
            console.log('Google OAuth 초기화 완료');
            return true;
            
        } catch (error) {
            console.warn('Google OAuth 초기화 실패:', error);
            this.isInitialized = false;
            return false;
        }
    }

    // Google API 스크립트 동적 로드
    loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                // Google Identity Services가 로드될 때까지 대기
                const checkGoogleReady = () => {
                    if (window.google && window.google.accounts) {
                        resolve();
                    } else {
                        setTimeout(checkGoogleReady, 100);
                    }
                };
                checkGoogleReady();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Google Identity Services 초기화
    async initializeGoogleIdentity() {
        if (this.config.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
            throw new Error('Google Client ID가 설정되지 않았습니다.');
        }

        // Google Identity Services 초기화
        google.accounts.id.initialize({
            client_id: this.config.GOOGLE_CLIENT_ID,
            callback: this.handleCredentialResponse.bind(this),
            auto_select: false,
            cancel_on_tap_outside: true
        });

        // OAuth 2.0 초기화
        this.googleAuth = google.accounts.oauth2.initTokenClient({
            client_id: this.config.GOOGLE_CLIENT_ID,
            scope: this.config.OAUTH_SCOPES.join(' '),
            callback: this.handleTokenResponse.bind(this)
        });
    }

    // 자격 증명 응답 처리 (ID 토큰)
    async handleCredentialResponse(response) {
        try {
            const credential = this.parseJWT(response.credential);
            
            const userData = {
                id: credential.sub,
                email: credential.email,
                name: credential.name,
                picture: credential.picture,
                provider: this.config.GOOGLE_AUTH_PROVIDER,
                loginTime: Date.now(),
                idToken: response.credential
            };

            this.currentUser = userData;
            
            // 사용자 데이터 저장
            this.saveUserData(userData);
            
            // 커스텀 이벤트 발생
            this.dispatchAuthEvent('google-login-success', userData);
            
        } catch (error) {
            console.error('Google 자격 증명 처리 실패:', error);
            this.dispatchAuthEvent('google-login-failed', { error });
        }
    }

    // 토큰 응답 처리 (액세스 토큰)
    handleTokenResponse(response) {
        if (response.error) {
            console.error('Google 토큰 오류:', response.error);
            this.dispatchAuthEvent('google-token-failed', { error: response.error });
            return;
        }

        if (this.currentUser) {
            this.currentUser.accessToken = response.access_token;
            this.currentUser.tokenExpiry = Date.now() + (response.expires_in * 1000);
            this.saveUserData(this.currentUser);
        }
    }

    // JWT 토큰 파싱
    parseJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            return JSON.parse(jsonPayload);
        } catch (error) {
            throw new Error('JWT 토큰 파싱 실패: ' + error.message);
        }
    }

    // Google 로그인 시작
    async signIn() {
        if (!this.isInitialized) {
            throw new Error('Google OAuth가 초기화되지 않았습니다.');
        }

        try {
            // One Tap 로그인 시도
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    // One Tap이 실패하면 팝업 로그인으로 폴백
                    this.showPopupLogin();
                }
            });
            
        } catch (error) {
            console.error('Google 로그인 시작 실패:', error);
            throw error;
        }
    }

    // 팝업 로그인 표시
    showPopupLogin() {
        // 로그인 버튼 렌더링
        const loginButton = document.getElementById('google-login-btn');
        if (loginButton) {
            google.accounts.id.renderButton(loginButton, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left'
            });
        }
    }

    // Google 로그아웃
    async signOut() {
        try {
            if (this.currentUser && this.currentUser.idToken) {
                // Google 세션 무효화
                google.accounts.id.disableAutoSelect();
                
                // 로컬 사용자 데이터 정리
                this.currentUser = null;
                this.clearUserData();
                
                this.dispatchAuthEvent('google-logout-success');
            }
        } catch (error) {
            console.error('Google 로그아웃 실패:', error);
            throw error;
        }
    }

    // 토큰 유효성 검증
    isTokenValid() {
        if (!this.currentUser || !this.currentUser.tokenExpiry) {
            return false;
        }
        
        return Date.now() < this.currentUser.tokenExpiry - this.config.TOKEN_REFRESH_THRESHOLD;
    }

    // 토큰 갱신
    async refreshToken() {
        if (!this.googleAuth) {
            throw new Error('Google OAuth 클라이언트가 초기화되지 않았습니다.');
        }

        try {
            // 새 액세스 토큰 요청
            this.googleAuth.requestAccessToken();
        } catch (error) {
            console.error('토큰 갱신 실패:', error);
            throw error;
        }
    }

    // 토큰 모니터링 시작
    startTokenMonitoring() {
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
        }

        this.tokenCheckInterval = setInterval(() => {
            if (this.currentUser && !this.isTokenValid()) {
                this.refreshToken().catch(error => {
                    console.warn('자동 토큰 갱신 실패:', error);
                    this.dispatchAuthEvent('token-refresh-failed', { error });
                });
            }
        }, this.config.TOKEN_CHECK_INTERVAL);
    }

    // 토큰 모니터링 중지
    stopTokenMonitoring() {
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
            this.tokenCheckInterval = null;
        }
    }

    // 사용자 데이터 저장
    saveUserData(userData) {
        const secureData = {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
            provider: userData.provider,
            loginTime: userData.loginTime
        };

        localStorage.setItem(this.config.STORAGE_KEYS.CURRENT_USER, userData.email);
        localStorage.setItem(this.config.STORAGE_KEYS.USER_DATA, JSON.stringify(secureData));
        localStorage.setItem(this.config.STORAGE_KEYS.AUTH_PROVIDER, userData.provider);
    }

    // 사용자 데이터 정리
    clearUserData() {
        localStorage.removeItem(this.config.STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(this.config.STORAGE_KEYS.USER_DATA);
        localStorage.removeItem(this.config.STORAGE_KEYS.AUTH_PROVIDER);
    }

    // 저장된 사용자 데이터 로드
    loadUserData() {
        try {
            const currentUser = localStorage.getItem(this.config.STORAGE_KEYS.CURRENT_USER);
            const userData = localStorage.getItem(this.config.STORAGE_KEYS.USER_DATA);
            const authProvider = localStorage.getItem(this.config.STORAGE_KEYS.AUTH_PROVIDER);

            if (currentUser && userData && authProvider === this.config.GOOGLE_AUTH_PROVIDER) {
                this.currentUser = JSON.parse(userData);
                return this.currentUser;
            }
        } catch (error) {
            console.error('사용자 데이터 로드 실패:', error);
        }
        
        return null;
    }

    // 현재 사용자 정보 반환
    getCurrentUser() {
        return this.currentUser;
    }

    // 인증 상태 확인
    isAuthenticated() {
        return this.currentUser !== null && this.isTokenValid();
    }

    // 커스텀 이벤트 발생
    dispatchAuthEvent(eventType, data = {}) {
        const event = new CustomEvent(eventType, {
            detail: data,
            bubbles: true
        });
        document.dispatchEvent(event);
    }

    // 정리 작업
    cleanup() {
        this.stopTokenMonitoring();
        this.currentUser = null;
    }
}