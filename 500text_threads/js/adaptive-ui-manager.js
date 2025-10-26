/**
 * AdaptiveUIManager
 * 
 * 적응형 UI 관리자 - 사용자 행동과 컨텍스트 기반 UI 조정
 * - 로그인 방식 추천
 * - UI 레이아웃 자동 조정
 * - 사용자 선호도 학습
 * - 네트워크 상태 기반 최적화
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

class AdaptiveUIManager {
    constructor(logger) {
        // 의존성
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 사용자 선호도
        this.userPreferences = this.loadPreferences();
        
        // 로그인 히스토리
        this.loginHistory = this.loadLoginHistory();
        
        // 네트워크 모니터
        this.isOnline = navigator.onLine;
        
        // Firebase 상태
        this.isFirebaseReady = false;
        
        // 저장 키
        this.PREFERENCES_KEY = 'dualTextWriter_userPreferences';
        this.LOGIN_HISTORY_KEY = 'dualTextWriter_loginHistory';
        
        // 설정
        this.MAX_HISTORY_SIZE = 50;
        this.PREFERENCE_THRESHOLD = 3; // 3회 이상 사용 시 선호 방식으로 간주
        
        // 초기화
        this.init();
    }
    
    /**
     * 초기화
     */
    init() {
        // 네트워크 상태 모니터링
        this.setupNetworkMonitoring();
        
        // "항상 이 방식 사용" 체크박스 이벤트 설정
        this.setupAlwaysUseCheckboxes();
        
        // 저장된 선호도 복원
        this.restoreAlwaysUsePreference();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('adaptive_ui_initialized', 'Adaptive UI 초기화', {
                historySize: this.loginHistory.length,
                hasPreferences: !!this.userPreferences.preferredAuthMethod
            });
        }
    }
    
    /**
     * UI 모드 결정 (컨텍스트 기반)
     * @returns {string} 'google-first' | 'username-first' | 'username-only' | 'both-equal'
     */
    determineUIMode() {
        // 1. 사용자가 "항상 이 방식 사용" 설정한 경우
        if (this.userPreferences.alwaysUsePreferred && this.userPreferences.preferredAuthMethod) {
            const method = this.userPreferences.preferredAuthMethod;
            
            // 오프라인이면 username만 가능
            if (!this.isOnline && method === 'google') {
                return 'username-only';
            }
            
            return method === 'google' ? 'google-first' : 'username-first';
        }
        
        // 2. 오프라인 상태 확인
        if (!this.isOnline) {
            return 'username-only';
        }
        
        // 3. Firebase 사용 불가 시
        if (!this.isFirebaseReady) {
            return 'username-first';
        }
        
        // 4. 로그인 히스토리 기반 선호도 확인
        const preferredMethod = this.getPreferredMethodFromHistory();
        if (preferredMethod) {
            return preferredMethod === 'google' ? 'google-first' : 'username-first';
        }
        
        // 5. 기본값: Firebase 사용 가능하면 Google 우선
        return this.isFirebaseReady ? 'google-first' : 'both-equal';
    }
    
    /**
     * 로그인 방식 추적
     * @param {string} method - 'google' | 'username'
     */
    trackLoginMethod(method) {
        // 히스토리에 추가
        this.loginHistory.push({
            method: method,
            timestamp: Date.now()
        });
        
        // 최대 크기 유지
        if (this.loginHistory.length > this.MAX_HISTORY_SIZE) {
            this.loginHistory.shift();
        }
        
        // 저장
        this.saveLoginHistory();
        
        // 선호도 자동 업데이트
        this.updatePreferredMethod();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('login_method_tracked', '로그인 방식 추적', {
                method: method,
                historySize: this.loginHistory.length
            });
        }
    }
    
    /**
     * 추천 로그인 방식 가져오기
     * @returns {string|null} 'google' | 'username' | null
     */
    getRecommendedMethod() {
        // 1. 오프라인이면 username 추천
        if (!this.isOnline) {
            return 'username';
        }
        
        // 2. Firebase 사용 불가면 username 추천
        if (!this.isFirebaseReady) {
            return 'username';
        }
        
        // 3. 사용자 선호도 확인
        if (this.userPreferences.preferredAuthMethod) {
            return this.userPreferences.preferredAuthMethod;
        }
        
        // 4. 히스토리 기반 추천
        const preferredMethod = this.getPreferredMethodFromHistory();
        if (preferredMethod) {
            return preferredMethod;
        }
        
        // 5. 기본값: Firebase 사용 가능하면 Google 추천
        return this.isFirebaseReady ? 'google' : null;
    }
    
    /**
     * UI 레이아웃 적용
     * @param {string} mode - 'google-first' | 'username-first' | 'username-only' | 'both-equal'
     */
    applyUILayout(mode) {
        const googleSection = document.querySelector('.google-login-section');
        const usernameSection = document.querySelector('.username-login-section');
        const loginForm = document.querySelector('.login-form');
        
        if (!googleSection || !usernameSection || !loginForm) {
            console.warn('⚠️ 로그인 UI 요소를 찾을 수 없습니다.');
            return;
        }
        
        // 기존 순서 클래스 제거
        loginForm.classList.remove('google-first', 'username-first', 'username-only', 'both-equal');
        
        // 새 모드 적용
        loginForm.classList.add(mode);
        
        switch (mode) {
            case 'google-first':
                // Google을 위로
                loginForm.insertBefore(googleSection, usernameSection.parentElement);
                this.showRecommendedBadge('google');
                this.enableGoogleLogin();
                break;
                
            case 'username-first':
                // Username을 위로
                loginForm.insertBefore(usernameSection, googleSection.parentElement);
                this.showRecommendedBadge('username');
                this.enableGoogleLogin();
                break;
                
            case 'username-only':
                // Google 비활성화
                this.disableGoogleLogin();
                this.hideRecommendedBadge();
                break;
                
            case 'both-equal':
            default:
                // 기본 순서 유지
                this.hideRecommendedBadge();
                this.enableGoogleLogin();
                break;
        }
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('ui_layout_applied', 'UI 레이아웃 적용', {
                mode: mode
            });
        }
    }
    
    /**
     * 컨텍스트 기반 UI 업데이트
     * @param {Object} context - UI 컨텍스트 정보
     */
    updateUIForContext(context) {
        // 컨텍스트 업데이트
        if (context.isOnline !== undefined) {
            this.isOnline = context.isOnline;
        }
        
        if (context.isFirebaseReady !== undefined) {
            this.isFirebaseReady = context.isFirebaseReady;
        }
        
        // UI 모드 결정
        const mode = this.determineUIMode();
        
        // UI 레이아웃 적용
        this.applyUILayout(mode);
        
        // 추천 방식 표시
        const recommendedMethod = this.getRecommendedMethod();
        if (recommendedMethod) {
            this.showRecommendedBadge(recommendedMethod);
        }
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('ui_updated_for_context', 'UI 컨텍스트 업데이트', {
                mode: mode,
                recommendedMethod: recommendedMethod,
                isOnline: this.isOnline,
                isFirebaseReady: this.isFirebaseReady
            });
        }
    }
    
    /**
     * 히스토리에서 선호 방식 추출
     * @returns {string|null} 'google' | 'username' | null
     */
    getPreferredMethodFromHistory() {
        if (this.loginHistory.length < this.PREFERENCE_THRESHOLD) {
            return null;
        }
        
        // 최근 10개 로그인 확인
        const recentLogins = this.loginHistory.slice(-10);
        
        // 각 방식 사용 횟수 계산
        const googleCount = recentLogins.filter(l => l.method === 'google').length;
        const usernameCount = recentLogins.filter(l => l.method === 'username').length;
        
        // 70% 이상 사용한 방식을 선호 방식으로 간주
        const threshold = recentLogins.length * 0.7;
        
        if (googleCount >= threshold) {
            return 'google';
        } else if (usernameCount >= threshold) {
            return 'username';
        }
        
        return null;
    }
    
    /**
     * 선호 방식 자동 업데이트
     */
    updatePreferredMethod() {
        const preferredMethod = this.getPreferredMethodFromHistory();
        
        if (preferredMethod && preferredMethod !== this.userPreferences.preferredAuthMethod) {
            // 선호도 변경 감지
            this.userPreferences.preferredAuthMethod = preferredMethod;
            this.savePreferences();
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('preferred_method_updated', '선호 방식 자동 업데이트', {
                    newPreferredMethod: preferredMethod
                });
            }
        }
    }
    
    /**
     * "항상 이 방식 사용" 설정
     * @param {string} method - 'google' | 'username'
     * @param {boolean} always - 항상 사용 여부
     */
    setAlwaysUseMethod(method, always) {
        this.userPreferences.preferredAuthMethod = method;
        this.userPreferences.alwaysUsePreferred = always;
        this.savePreferences();
        
        // UI 즉시 업데이트
        this.updateUIForContext({});
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('always_use_method_set', '"항상 이 방식 사용" 설정', {
                method: method,
                always: always
            });
        }
    }
    
    /**
     * 추천 배지 표시
     * @param {string} method - 'google' | 'username'
     */
    showRecommendedBadge(method) {
        // 모든 배지 숨김
        this.hideRecommendedBadge();
        
        // 해당 방식에 배지 표시
        const badgeId = method === 'google' ? 'google-recommended-badge' : 'username-recommended-badge';
        const badge = document.getElementById(badgeId);
        
        if (badge) {
            badge.style.display = 'inline-block';
        }
    }
    
    /**
     * 추천 배지 숨김
     */
    hideRecommendedBadge() {
        const googleBadge = document.getElementById('google-recommended-badge');
        const usernameBadge = document.getElementById('username-recommended-badge');
        
        if (googleBadge) googleBadge.style.display = 'none';
        if (usernameBadge) usernameBadge.style.display = 'none';
    }
    
    /**
     * Google 로그인 활성화
     */
    enableGoogleLogin() {
        const googleBtn = document.getElementById('google-login-btn');
        const googleStatus = document.getElementById('google-status');
        
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.classList.remove('disabled');
        }
        
        if (googleStatus) {
            googleStatus.style.display = 'none';
        }
    }
    
    /**
     * Google 로그인 비활성화
     */
    disableGoogleLogin() {
        const googleBtn = document.getElementById('google-login-btn');
        const googleStatus = document.getElementById('google-status');
        const googleStatusIcon = document.getElementById('google-status-icon');
        const googleStatusText = document.getElementById('google-status-text');
        
        if (googleBtn) {
            googleBtn.disabled = true;
            googleBtn.classList.add('disabled');
        }
        
        if (googleStatus && googleStatusIcon && googleStatusText) {
            googleStatus.style.display = 'block';
            googleStatusIcon.textContent = '📡';
            googleStatusText.textContent = '오프라인 모드 - Google 로그인 사용 불가';
        }
    }
    
    /**
     * "항상 이 방식 사용" 체크박스 설정
     */
    setupAlwaysUseCheckboxes() {
        const googleCheckbox = document.getElementById('always-use-google');
        const usernameCheckbox = document.getElementById('always-use-username');
        
        if (googleCheckbox) {
            googleCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // Username 체크박스 해제
                    if (usernameCheckbox) {
                        usernameCheckbox.checked = false;
                    }
                    
                    // 선호도 설정
                    this.setAlwaysUseMethod('google', true);
                } else {
                    // 선호도 해제
                    this.setAlwaysUseMethod('google', false);
                }
            });
        }
        
        if (usernameCheckbox) {
            usernameCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // Google 체크박스 해제
                    if (googleCheckbox) {
                        googleCheckbox.checked = false;
                    }
                    
                    // 선호도 설정
                    this.setAlwaysUseMethod('username', true);
                } else {
                    // 선호도 해제
                    this.setAlwaysUseMethod('username', false);
                }
            });
        }
    }
    
    /**
     * 저장된 "항상 이 방식 사용" 선호도 복원
     */
    restoreAlwaysUsePreference() {
        if (this.userPreferences.alwaysUsePreferred && this.userPreferences.preferredAuthMethod) {
            const method = this.userPreferences.preferredAuthMethod;
            const checkboxId = method === 'google' ? 'always-use-google' : 'always-use-username';
            const checkbox = document.getElementById(checkboxId);
            
            if (checkbox) {
                checkbox.checked = true;
            }
        }
    }
    
    /**
     * 네트워크 모니터링 설정
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateUIForContext({ isOnline: true });
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('network_online', '온라인 상태로 전환');
            }
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateUIForContext({ isOnline: false });
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('network_offline', '오프라인 상태로 전환');
            }
        });
    }
    
    /**
     * Firebase 상태 업데이트
     * @param {boolean} isReady
     */
    setFirebaseReady(isReady) {
        this.isFirebaseReady = isReady;
        this.updateUIForContext({ isFirebaseReady: isReady });
    }
    
    /**
     * 사용자 선호도 로드
     * @returns {Object}
     */
    loadPreferences() {
        try {
            const data = localStorage.getItem(this.PREFERENCES_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('선호도 로드 실패:', error);
        }
        
        // 기본값
        return {
            preferredAuthMethod: null,
            alwaysUsePreferred: false,
            showTooltips: true,
            rememberDevice: false
        };
    }
    
    /**
     * 사용자 선호도 저장
     */
    savePreferences() {
        try {
            localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('선호도 저장 실패:', error);
        }
    }
    
    /**
     * 로그인 히스토리 로드
     * @returns {Array}
     */
    loadLoginHistory() {
        try {
            const data = localStorage.getItem(this.LOGIN_HISTORY_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('로그인 히스토리 로드 실패:', error);
        }
        
        return [];
    }
    
    /**
     * 로그인 히스토리 저장
     */
    saveLoginHistory() {
        try {
            localStorage.setItem(this.LOGIN_HISTORY_KEY, JSON.stringify(this.loginHistory));
        } catch (error) {
            console.error('로그인 히스토리 저장 실패:', error);
        }
    }
    
    /**
     * 히스토리 초기화
     */
    clearHistory() {
        this.loginHistory = [];
        this.saveLoginHistory();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('login_history_cleared', '로그인 히스토리 초기화');
        }
    }
    
    /**
     * 선호도 초기화
     */
    clearPreferences() {
        this.userPreferences = {
            preferredAuthMethod: null,
            alwaysUsePreferred: false,
            showTooltips: true,
            rememberDevice: false
        };
        this.savePreferences();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('preferences_cleared', '사용자 선호도 초기화');
        }
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.AdaptiveUIManager = AdaptiveUIManager;
}
