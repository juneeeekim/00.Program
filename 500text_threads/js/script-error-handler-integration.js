// Script.js 통합 패치
// DualTextWriter 생성자에서 GoogleAuthManager 초기화 시 logger 전달

// 기존 코드:
// this.googleAuthManager = new GoogleAuthManager(this.config);

// 새 코드:
// this.googleAuthManager = new GoogleAuthManager(this.config, this.logger);

// setupGoogleAuthCallbacks 메서드에 에러 핸들러 콜백 추가
function setupGoogleAuthCallbacksWithErrorHandler() {
    // 기존 콜백 설정
    this.googleAuthManager.onSignInSuccess = async (userData) => {
        await this.handleGoogleSignInSuccess(userData);
        this.googleAuthManager.saveAuthState(userData);
    };
    
    this.googleAuthManager.onSignInError = (error) => {
        this.handleGoogleSignInError(error);
    };
    
    this.googleAuthManager.onSignOutSuccess = () => {
        this.handleGoogleSignOutSuccess();
    };
    
    this.googleAuthManager.onTokenRefresh = (tokenData) => {
        console.log('🔄 토큰 갱신됨:', new Date(tokenData.refreshTime).toLocaleString());
        this.googleAuthManager.updateLastActivity();
    };
    
    // 에러 핸들러 콜백 설정
    this.googleAuthManager.showMessage = (message, type) => {
        this.showMessage(message, type);
    };
    
    this.googleAuthManager.showSetupInstructions = () => {
        this.showGoogleSetupNotice();
    };
    
    this.googleAuthManager.enableFallback = () => {
        this.updateGoogleLoginButtonState(false, 'fallback');
        this.showMessage('기존 사용자명 로그인을 사용해주세요.', 'info');
    };
}

// HTML에 error-handler.js 스크립트 추가 필요
// <script src="js/error-handler.js"></script>
// <script src="js/activity-logger.js"></script> 이후에 추가
