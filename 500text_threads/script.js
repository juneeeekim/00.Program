class DualTextWriter {
    constructor() {
        // 활동 로거 초기화 (먼저 생성)
        this.logger = new ActivityLogger();

        // 보안 유틸리티 초기화
        this.securityUtils = new SecurityUtils();

        // Firebase 설정 및 매니저 초기화
        this.firebaseConfig = new FirebaseConfig();
        this.firebaseManager = new FirebaseManager(this.firebaseConfig);

        // Firebase 상태
        this.isFirebaseReady = false;

        // 데이터 마이그레이션 서비스 (Firebase 통합용)
        this.migrationService = null;

        // Username 인증 초기화
        this.usernameValidator = new UsernameValidator();

        // 보안 관리자 (공용/개인 기기 모드) - UsernameAuthProvider보다 먼저 생성
        this.securityManager = new SecurityManager(this.logger);

        // UsernameAuthProvider에 SecurityManager 전달
        this.usernameAuthProvider = new UsernameAuthProvider(this.usernameValidator, this.logger, this.securityManager);

        // 계정 매칭 및 연결 (하이브리드 인증)
        this.userMatcher = new UserMatcher(this.logger);
        this.migrationManager = new MigrationManager(this.logger);
        this.accountLinkingDialog = new AccountLinkingDialog(this.userMatcher, this.migrationManager, this.logger);

        // 마이그레이션 UI 다이얼로그 (lazy loading for performance)
        this.migrationPreviewDialog = null;
        this.migrationProgressDialog = null;

        // 적응형 UI 관리자
        this.adaptiveUIManager = new AdaptiveUIManager(this.logger);

        // Analytics Monitor (분석 및 모니터링)
        this.analyticsMonitor = new AnalyticsMonitor(this.logger);

        // 사용자 인증 관련 요소들
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginForm = document.getElementById('login-form');
        this.userInfo = document.getElementById('user-info');
        this.usernameDisplay = document.getElementById('username-display');
        this.mainContent = document.getElementById('main-content');

        // Username 로그인 UI 요소들
        this.usernameInput = document.getElementById('username-input');
        this.usernameLoginBtn = document.getElementById('username-login-btn');
        this.usernameError = document.getElementById('username-error');
        this.usernameCharCount = document.getElementById('username-char-count');
        this.usernameCurrentCount = document.getElementById('username-current-count');

        // 레퍼런스 글 관련 요소들
        this.refTextInput = document.getElementById('ref-text-input');
        this.refCurrentCount = document.getElementById('ref-current-count');
        this.refMaxCount = document.getElementById('ref-max-count');
        this.refProgressFill = document.getElementById('ref-progress-fill');
        this.refClearBtn = document.getElementById('ref-clear-btn');
        this.refSaveBtn = document.getElementById('ref-save-btn');
        this.refDownloadBtn = document.getElementById('ref-download-btn');

        // 수정/작성 글 관련 요소들
        this.editTextInput = document.getElementById('edit-text-input');
        this.editCurrentCount = document.getElementById('edit-current-count');
        this.editMaxCount = document.getElementById('edit-max-count');
        this.editProgressFill = document.getElementById('edit-progress-fill');
        this.editClearBtn = document.getElementById('edit-clear-btn');
        this.editSaveBtn = document.getElementById('edit-save-btn');
        this.editDownloadBtn = document.getElementById('edit-download-btn');

        // 공통 요소들
        this.savedList = document.getElementById('saved-list');
        this.tempSaveStatus = document.getElementById('temp-save-status');
        this.tempSaveText = document.getElementById('temp-save-text');

        this.maxLength = 500;
        this.currentUser = null;
        this.savedTexts = [];
        this.tempSaveInterval = null;
        this.lastTempSave = null;

        // Performance optimization: Debounce timers
        this.validationDebounceTimer = null;
        this.validationDebounceDelay = 300; // 300ms

        // 이벤트 바인딩 플래그 (중복 방지)
        this._eventsbound = false;

        // init()은 DOMContentLoaded에서 호출됨 (중복 초기화 방지)
    }

    async init() {
        console.log('🚀 DualTextWriter 초기화 시작...');

        // 성능 측정 시작
        this.logger.startPerformanceMeasure('app_initialization');
        this.logger.logAction('page_load', '애플리케이션 초기화 시작');

        // 1. 이벤트 바인딩
        this.bindEvents();
        this.logger.logAction('events_bound', '이벤트 바인딩 완료');

        // 2. 네트워크 상태 모니터링 시작
        this.setupNetworkMonitoring();

        // 3. Firebase 초기화
        await this.initializeFirebase();

        // 4. Firebase 콜백 설정
        this.setupFirebaseCallbacks();

        // 5. Adaptive UI 초기화
        this.initializeAdaptiveUI();

        // 6. 기존 사용자 확인 및 복원
        this.checkExistingUser();

        // 성능 측정 종료
        this.logger.endPerformanceMeasure('app_initialization');
        this.logger.logAction('app_ready', '애플리케이션 초기화 완료');

        console.log('✅ DualTextWriter 초기화 완료');
    }

    bindEvents() {
        // 중복 바인딩 방지 플래그 확인
        if (this._eventsbound) {
            console.warn('⚠️ 이벤트가 이미 바인딩되어 있습니다. 중복 방지.');
            return;
        }

        // 사용자 인증 이벤트
        this.logoutBtn.addEventListener('click', () => this.logout());

        // Google 로그인 이벤트 (Firebase)
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', () => this.googleLogin());
        }

        // Username 로그인 이벤트
        if (this.usernameLoginBtn) {
            // 로그인 버튼 클릭
            this.usernameLoginBtn.addEventListener('click', () => this.usernameLogin());
        }

        if (this.usernameInput) {
            // Enter 키 이벤트
            this.usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.usernameLogin();
                }
            });

            // 입력 중 실시간 검증 (blur 이벤트)
            this.usernameInput.addEventListener('blur', () => {
                this.validateUsernameInput();
            });

            // 실시간 글자 수 표시 및 debounced 검증
            this.usernameInput.addEventListener('input', () => {
                this.updateUsernameCharCount();
                this.debouncedValidateUsername();
            });
        }

        // 레퍼런스 글 이벤트
        this.refTextInput.addEventListener('input', () => {
            this.updateCharacterCount('ref');
            this.scheduleTempSave();
        });
        this.refClearBtn.addEventListener('click', () => this.clearText('ref'));
        this.refSaveBtn.addEventListener('click', () => this.saveText('ref'));
        this.refDownloadBtn.addEventListener('click', () => this.downloadAsTxt('ref'));

        // 수정/작성 글 이벤트
        this.editTextInput.addEventListener('input', () => {
            this.updateCharacterCount('edit');
            this.scheduleTempSave();
        });
        this.editClearBtn.addEventListener('click', () => this.clearText('edit'));
        this.editSaveBtn.addEventListener('click', () => this.saveText('edit'));
        this.editDownloadBtn.addEventListener('click', () => this.downloadAsTxt('edit'));

        // 바인딩 완료 플래그 설정
        this._eventsbound = true;
        console.log('✅ 이벤트 바인딩 완료');
    }

    updateCharacterCount(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const currentCount = panel === 'ref' ? this.refCurrentCount : this.editCurrentCount;
        const progressFill = panel === 'ref' ? this.refProgressFill : this.editProgressFill;
        const saveBtn = panel === 'ref' ? this.refSaveBtn : this.editSaveBtn;
        const downloadBtn = panel === 'ref' ? this.refDownloadBtn : this.editDownloadBtn;

        const text = textInput.value;
        const currentLength = this.getKoreanCharacterCount(text);

        currentCount.textContent = currentLength;

        // Update progress bar
        const progress = (currentLength / this.maxLength) * 100;
        progressFill.style.width = `${Math.min(progress, 100)}%`;

        // Update character count color based on usage
        if (currentLength >= this.maxLength * 0.9) {
            currentCount.className = 'danger';
        } else if (currentLength >= this.maxLength * 0.7) {
            currentCount.className = 'warning';
        } else {
            currentCount.className = '';
        }

        // Update button states
        saveBtn.disabled = currentLength === 0;
        downloadBtn.disabled = currentLength === 0;
    }

    getKoreanCharacterCount(text) {
        return text.length;
    }

    // Firebase 초기화
    async initializeFirebase() {
        try {
            console.log('🔥 Firebase 초기화 시도...');
            this.logger.logAction('firebase_init', 'Firebase 초기화 시작');

            // 오프라인 상태 확인
            if (!navigator.onLine) {
                console.warn('⚠️ 오프라인 상태: Firebase 초기화 건너뛰기');
                this.isFirebaseReady = false;
                this.enableFallbackSystem('offline');

                // Adaptive UI에 Firebase 상태 알림
                if (this.adaptiveUIManager) {
                    this.adaptiveUIManager.setFirebaseReady(false);
                }
                return;
            }

            // FirebaseManager 초기화
            this.isFirebaseReady = await this.firebaseManager.initialize();

            if (this.isFirebaseReady) {
                console.log('✅ Firebase 시스템 준비 완료');
                this.logger.logAction('firebase_init_success', 'Firebase 초기화 성공');
                this.updateGoogleLoginButtonState(true);

                // 상태 표시 숨김
                const googleStatus = document.getElementById('google-status');
                if (googleStatus) {
                    googleStatus.style.display = 'none';
                }

                // Adaptive UI에 Firebase 상태 알림
                if (this.adaptiveUIManager) {
                    this.adaptiveUIManager.setFirebaseReady(true);
                }
            } else {
                console.warn('⚠️ Firebase 사용 불가, 기존 방식으로 폴백');
                this.logger.logAction('firebase_init_failed', 'Firebase 초기화 실패, 폴백 모드');
                this.showFirebaseSetupNotice();
                this.enableFallbackSystem('init_failed');

                // Adaptive UI에 Firebase 상태 알림
                if (this.adaptiveUIManager) {
                    this.adaptiveUIManager.setFirebaseReady(false);
                }
            }
        } catch (error) {
            console.error('❌ Firebase 초기화 중 오류:', error);
            this.logger.logAction('firebase_init_error', 'Firebase 초기화 오류', {
                error: error.message,
                stack: error.stack
            });

            this.isFirebaseReady = false;
            this.enableFallbackSystem('error');

            // Adaptive UI에 Firebase 상태 알림
            if (this.adaptiveUIManager) {
                this.adaptiveUIManager.setFirebaseReady(false);
            }

            // 개선된 에러 처리 (Task 6.3)
            // 초기화 오류는 조용히 처리하고 폴백 시스템 활성화
            console.warn('⚠️ Firebase 초기화 실패, 폴백 모드로 전환');
        }
    }

    // Adaptive UI 초기화
    initializeAdaptiveUI() {
        try {
            console.log('🎨 Adaptive UI 초기화...');

            // 현재 컨텍스트로 UI 업데이트
            this.adaptiveUIManager.updateUIForContext({
                isOnline: navigator.onLine,
                isFirebaseReady: this.isFirebaseReady
            });

            console.log('✅ Adaptive UI 초기화 완료');
        } catch (error) {
            console.error('❌ Adaptive UI 초기화 실패:', error);
        }
    }

    // Firebase 콜백 설정
    setupFirebaseCallbacks() {
        // 인증 상태 변경 리스너 등록
        if (this.isFirebaseReady) {
            this.firebaseManager.onAuthStateChanged((user) => {
                this.handleAuthStateChange(user);
            });

            // 연결 상태 변경 리스너 등록
            this.firebaseManager.onConnectionStateChange((isOnline) => {
                this.handleConnectionStateChange(isOnline);
            });

            // 데이터 마이그레이션 서비스 초기화
            this.migrationService = new DataMigrationService(this.firebaseManager, this.logger);
        }
    }

    // Google 로그인 처리 (Firebase)
    async googleLogin() {
        if (!this.isFirebaseReady) {
            this.showMessage('Firebase 로그인을 사용할 수 없습니다. 기존 방식으로 로그인해주세요.', 'error');
            return;
        }

        // 로딩 표시 시작
        this.showLoadingIndicator('Google 로그인 중...');

        // Track login attempt
        const loginStartTime = performance.now();

        try {
            const userData = await this.firebaseManager.signInWithGoogle();

            // 로그인 성공 처리
            this.currentUser = userData.email;
            this.logger.setUserId(userData.email);

            // 사용자 정보 저장
            this.saveFirebaseUserData(userData);

            // UI 업데이트
            this.showUserInterface();

            // 로딩 표시 제거
            this.hideLoadingIndicator();

            // 환영 메시지
            this.showMessage(`${userData.displayName}님, 환영합니다!`, 'success');

            // 자동 계정 매칭 및 연결 확인 (Task 5.3)
            await this.checkAccountMatching(userData);

            // 첫 로그인 시 로컬 데이터 마이그레이션 확인
            await this.checkAndMigrateLocalData(userData);

            // 데이터 로드
            await this.loadUserData();

            // 실시간 동기화 설정
            this.setupRealtimeSync();

            // Adaptive UI: 로그인 방식 추적
            if (this.adaptiveUIManager) {
                this.adaptiveUIManager.trackLoginMethod('google');
            }

            // Analytics: Track successful login
            const loginDuration = performance.now() - loginStartTime;
            this.analyticsMonitor.trackAuthEvent('login', 'google', true, {
                email: userData.email,
                duration: loginDuration
            });
            this.analyticsMonitor.trackPerformance('login', loginDuration, 2000);

            console.log('✅ Google 로그인 완료');
        } catch (error) {
            console.error('❌ Google 로그인 실패:', error);
            this.hideLoadingIndicator();

            // Analytics: Track failed login
            const loginDuration = performance.now() - loginStartTime;
            this.analyticsMonitor.trackAuthEvent('login', 'google', false, {
                error: error.message,
                duration: loginDuration
            });
            this.analyticsMonitor.trackError('auth_error', 'google_login', error.message, {
                code: error.code
            });

            // 개선된 에러 처리 (Task 6.3)
            this.handleFirebaseError(error, 'google_login');
        }
    }

    // Firebase 사용자 데이터 저장
    saveFirebaseUserData(userData) {
        // 이메일 검증 (보안 강화)
        if (!this.securityUtils.isValidEmail(userData.email)) {
            console.error('❌ 유효하지 않은 이메일 형식:', userData.email);
            this.logger.logAction('invalid_email', '유효하지 않은 이메일', {
                email: userData.email
            });
            return;
        }

        const secureData = {
            uid: userData.uid,
            displayName: userData.displayName,
            email: userData.email,
            photoURL: userData.photoURL,
            emailVerified: userData.emailVerified,
            provider: 'firebase',
            loginTime: Date.now()
        };

        // 데이터 검증
        const validation = this.securityUtils.validateUserData(secureData);
        if (!validation.valid) {
            console.error('❌ 사용자 데이터 검증 실패:', validation.errors);
            this.logger.logAction('user_data_validation_failed', '사용자 데이터 검증 실패', {
                errors: validation.errors
            });
            return;
        }

        // 안전한 저장
        localStorage.setItem('dualTextWriter_currentUser', userData.email);
        this.securityUtils.safeSaveToStorage('dualTextWriter_userData', secureData);
        localStorage.setItem('dualTextWriter_authProvider', 'firebase');
    }

    // Username 로그인 처리
    async usernameLogin() {
        const username = this.usernameInput.value.trim();

        // 빈 값 체크
        if (!username) {
            this.showUsernameError('사용자명을 입력해주세요.');
            this.usernameInput.focus();
            return;
        }

        // 로딩 표시 시작
        this.showLoadingIndicator('로그인 중...');

        // Track login attempt
        const loginStartTime = performance.now();

        try {
            // 사용자명 로그인 수행
            const session = await this.usernameAuthProvider.login(username);

            // 로그인 성공 처리
            this.currentUser = session.userId;
            this.logger.setUserId(session.userId);

            // UI 업데이트
            this.showUserInterface();

            // 로딩 표시 제거
            this.hideLoadingIndicator();

            // 환영 메시지
            this.showMessage(`${session.userId}님, 환영합니다!`, 'success');

            // 데이터 로드
            this.loadUserData();

            // 입력 필드 초기화
            this.usernameInput.value = '';
            this.updateUsernameCharCount();
            this.hideUsernameError();

            // Adaptive UI: 로그인 방식 추적
            if (this.adaptiveUIManager) {
                this.adaptiveUIManager.trackLoginMethod('username');
            }

            // Analytics: Track successful login
            const loginDuration = performance.now() - loginStartTime;
            this.analyticsMonitor.trackAuthEvent('login', 'username', true, {
                username: session.userId,
                deviceType: session.deviceType,
                duration: loginDuration
            });
            this.analyticsMonitor.trackPerformance('login', loginDuration, 2000);
            this.analyticsMonitor.updateUserPreference('deviceType', session.deviceType);

            console.log('✅ 사용자명 로그인 완료:', session.userId);

        } catch (error) {
            console.error('❌ 사용자명 로그인 실패:', error);
            this.hideLoadingIndicator();

            // Analytics: Track failed login
            const loginDuration = performance.now() - loginStartTime;
            this.analyticsMonitor.trackAuthEvent('login', 'username', false, {
                error: error.message,
                duration: loginDuration
            });
            this.analyticsMonitor.trackError('validation_error', 'username_login', error.message);

            // 에러 메시지 표시
            const errorMessage = this.usernameAuthProvider.getErrorMessage(error);
            this.showUsernameError(errorMessage);

            // 입력 필드 포커스
            this.usernameInput.focus();
        }
    }

    // Username 입력 검증 (blur 이벤트용)
    validateUsernameInput() {
        const username = this.usernameInput.value.trim();

        // 빈 값이면 에러 숨김
        if (!username) {
            this.hideUsernameError();
            this.usernameInput.classList.remove('error');
            return;
        }

        // 실시간 검증
        const result = this.usernameValidator.validateRealtime(username);

        if (!result.valid) {
            this.showUsernameError(result.message);
            this.usernameInput.classList.add('error');
        } else {
            this.hideUsernameError();
            this.usernameInput.classList.remove('error');
        }
    }

    // Username 글자 수 업데이트
    updateUsernameCharCount() {
        if (!this.usernameInput || !this.usernameCurrentCount) return;

        const username = this.usernameInput.value;
        const length = username.length;
        const maxLength = 50;

        // 글자 수 표시
        this.usernameCurrentCount.textContent = length;

        // 색상 변경
        if (length >= maxLength * 0.9) {
            this.usernameCharCount.classList.add('danger');
            this.usernameCharCount.classList.remove('warning');
        } else if (length >= maxLength * 0.7) {
            this.usernameCharCount.classList.add('warning');
            this.usernameCharCount.classList.remove('danger');
        } else {
            this.usernameCharCount.classList.remove('warning', 'danger');
        }

        // 로그인 버튼 활성화/비활성화
        if (this.usernameLoginBtn) {
            this.usernameLoginBtn.disabled = length === 0;
        }
    }

    // Username 에러 표시
    showUsernameError(message) {
        if (this.usernameError) {
            this.usernameError.textContent = message;
            this.usernameError.style.display = 'block';
        }
    }

    // Username 에러 숨김
    hideUsernameError() {
        if (this.usernameError) {
            this.usernameError.style.display = 'none';
            this.usernameError.textContent = '';
        }
    }

    // Debounced username validation (Performance optimization)
    debouncedValidateUsername() {
        // Clear existing timer
        if (this.validationDebounceTimer) {
            clearTimeout(this.validationDebounceTimer);
        }

        // Set new timer
        this.validationDebounceTimer = setTimeout(() => {
            this.validateUsernameInput();
        }, this.validationDebounceDelay);
    }

    // 사용자 인증 관련 메서드들
    checkExistingUser() {
        const savedUser = localStorage.getItem('dualTextWriter_currentUser');
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');

        if (savedUser) {
            this.currentUser = savedUser;

            // Firebase 사용자인 경우 인증 상태 확인
            if (authProvider === 'firebase' && this.isFirebaseReady) {
                const currentUser = this.firebaseManager.getCurrentUser();
                if (currentUser) {
                    // 로그인 상태 유지됨
                    this.showUserInterface();
                    this.loadUserData();
                    this.setupRealtimeSync();
                } else {
                    // 세션 만료됨
                    this.showLoginInterface();
                }
            } else if (authProvider === 'username') {
                // Username 인증 세션 복원
                const session = this.usernameAuthProvider.restoreSession();
                if (session) {
                    // 세션 복원 성공
                    this.currentUser = session.userId;
                    this.logger.setUserId(session.userId);
                    this.showUserInterface();
                    this.loadUserData();
                } else {
                    // 세션 복원 실패
                    this.showLoginInterface();
                }
            } else {
                // 레거시 사용자명 로그인 (authProvider 없음)
                this.showUserInterface();
                this.loadUserData();
            }
        } else {
            this.showLoginInterface();
        }
    }



    async logout() {
        if (confirm('로그아웃하시겠습니까? 현재 작성 중인 내용은 임시 저장됩니다.')) {
            // 로딩 표시 시작
            this.showLoadingIndicator('로그아웃 중...');

            this.performTempSave(); // 로그아웃 전 임시 저장

            // 인증 제공자별 로그아웃 처리
            const authProvider = localStorage.getItem('dualTextWriter_authProvider');

            if (authProvider === 'firebase' && this.isFirebaseReady) {
                // Firebase 로그아웃
                try {
                    await this.firebaseManager.signOut();
                } catch (error) {
                    console.warn('Firebase 로그아웃 실패:', error);
                }
            } else if (authProvider === 'username') {
                // Username 로그아웃
                try {
                    await this.usernameAuthProvider.logout(false); // 데이터는 유지
                } catch (error) {
                    console.warn('Username 로그아웃 실패:', error);
                }
            }

            this.currentUser = null;
            localStorage.removeItem('dualTextWriter_currentUser');
            localStorage.removeItem('dualTextWriter_userData');
            localStorage.removeItem('dualTextWriter_authProvider');

            // Analytics: Track logout
            this.analyticsMonitor.trackLogout();

            // 로딩 표시 제거
            this.hideLoadingIndicator();

            this.showLoginInterface();
            this.clearAllData();
            this.showMessage('로그아웃되었습니다.', 'info');
        }
    }



    showLoginInterface() {
        this.loginForm.style.display = 'block';
        this.userInfo.style.display = 'none';
        this.mainContent.style.display = 'none';
    }



    showUserInterface() {
        this.loginForm.style.display = 'none';
        this.userInfo.style.display = 'block';
        this.mainContent.style.display = 'block';

        // 사용자 정보 표시 (Firebase 사용자인 경우 이름 표시)
        // 안전한 데이터 로드 및 검증
        const userData = this.securityUtils.safeLoadFromStorage(
            'dualTextWriter_userData',
            {},
            (data) => this.securityUtils.validateUserData(data)
        );

        // 사용자 이름 안전 처리 (XSS 방지)
        const displayName = userData?.displayName || userData?.name || this.currentUser;
        this.usernameDisplay.textContent = this.securityUtils.sanitizeUserName(displayName);

        // 인증 제공자 표시 (Task 10.2)
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        const userProviderElement = document.getElementById('user-provider');
        if (userProviderElement) {
            if (authProvider === 'firebase') {
                userProviderElement.textContent = '(Google)';
                userProviderElement.style.display = 'inline';
            } else if (authProvider === 'username') {
                userProviderElement.textContent = '(사용자명)';
                userProviderElement.style.display = 'inline';
            } else {
                // 레거시 사용자 (authProvider 없음)
                userProviderElement.textContent = '';
                userProviderElement.style.display = 'none';
            }
        }
    }

    clearAllData() {
        this.refTextInput.value = '';
        this.editTextInput.value = '';
        this.savedTexts = [];
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
        this.renderSavedTexts();
    }

    clearText(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const panelName = panel === 'ref' ? '레퍼런스 글' : '수정/작성 글';

        if (confirm(`${panelName}을 지우시겠습니까?`)) {
            textInput.value = '';
            this.updateCharacterCount(panel);
            textInput.focus();
        }
    }

    async saveText(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
        const panelName = panel === 'ref' ? '레퍼런스 글' : '수정/작성 글';

        if (text.length === 0) {
            alert('저장할 내용이 없습니다.');
            return;
        }

        // Firebase 사용자인 경우 Firestore에 저장
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        if (authProvider === 'firebase' && this.isFirebaseReady) {
            try {
                // 로딩 표시
                this.showLoadingIndicator('저장 중...');

                // Firestore에 저장
                const textData = {
                    content: text,
                    characterCount: this.getKoreanCharacterCount(text),
                    type: panel === 'ref' ? 'reference' : 'edit',
                    deviceInfo: {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform
                    }
                };

                const savedItem = await this.firebaseManager.saveText(textData);

                // 로딩 표시 제거
                this.hideLoadingIndicator();

                // 로깅
                this.logger.logAction('text_saved', `${panelName} 저장 (Firestore)`, {
                    panel: panel,
                    characterCount: savedItem.characterCount,
                    textId: savedItem.id
                });

                // Analytics: Track text saved
                this.analyticsMonitor.trackUsage('text_saved', {
                    panel,
                    characterCount: savedItem.characterCount,
                    storage: 'firestore'
                });

                this.showMessage(`${panelName}이 저장되었습니다!`, 'success');

                // Clear input
                textInput.value = '';
                this.updateCharacterCount(panel);

                // 실시간 동기화가 UI를 자동 업데이트함
            } catch (error) {
                console.error('❌ 저장 실패:', error);
                this.hideLoadingIndicator();

                // 개선된 에러 처리 (Task 6.3)
                this.handleFirebaseError(error, 'save');
            }
        } else {
            // 기존 로컬 스토리지 저장 방식
            const savedItem = {
                id: Date.now() + (panel === 'edit' ? 1 : 0),
                content: text,
                date: new Date().toLocaleString('ko-KR'),
                characterCount: this.getKoreanCharacterCount(text),
                type: panel === 'ref' ? 'reference' : 'edit'
            };

            this.savedTexts.unshift(savedItem);
            this.saveToLocalStorage();
            this.renderSavedTexts();

            // 로깅
            this.logger.logAction('text_saved', `${panelName} 저장 (로컬)`, {
                panel: panel,
                characterCount: savedItem.characterCount,
                textId: savedItem.id
            });

            // Analytics: Track text saved
            this.analyticsMonitor.trackUsage('text_saved', {
                panel,
                characterCount: savedItem.characterCount,
                storage: 'local'
            });

            this.showMessage(`${panelName}이 저장되었습니다!`, 'success');

            // Clear input
            textInput.value = '';
            this.updateCharacterCount(panel);
        }
    }

    downloadAsTxt(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
        const panelName = panel === 'ref' ? '레퍼런스' : '수정작성';

        if (text.length === 0) {
            alert('다운로드할 내용이 없습니다.');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${panelName}_${timestamp}.txt`;

        const content = `500자 미만 글 작성기 - ${panelName} 글\n` +
            `작성일: ${new Date().toLocaleString('ko-KR')}\n` +
            `글자 수: ${this.getKoreanCharacterCount(text)}자\n` +
            `\n${'='.repeat(30)}\n\n` +
            `${text}`; // 사용자가 입력한 그대로 줄바꿈과 공백 유지

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Analytics: Track download
        this.analyticsMonitor.trackUsage('download', {
            panel,
            characterCount: this.getKoreanCharacterCount(text),
            filename
        });

        this.showMessage(`${panelName} 글 TXT 파일이 다운로드되었습니다!`, 'success');
    }

    renderSavedTexts() {
        // Performance optimization: Use DocumentFragment for batch DOM updates
        if (this.savedTexts.length === 0) {
            this.savedList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">저장된 글이 없습니다.</p>';
            return;
        }

        // Use template string for better performance (single innerHTML update)
        const html = this.savedTexts.map((item, index) => `
            <div class="saved-item ${index === 0 ? 'new' : ''}" role="listitem">
                <div class="saved-item-header">
                    <span class="saved-item-date">${item.date}</span>
                    <span class="saved-item-count">${item.characterCount}자</span>
                    <span class="saved-item-type">${item.type === 'reference' ? '📖 레퍼런스' : '✏️ 수정작성'}</span>
                </div>
                <div class="saved-item-content">${this.escapeHtml(item.content)}</div>
                <div class="saved-item-actions">
                    <button class="btn-small btn-edit" onclick="dualTextWriter.editText(${item.id}, '${item.type}')" aria-label="글 편집">편집</button>
                    <button class="btn-small btn-delete" onclick="dualTextWriter.deleteText(${item.id})" aria-label="글 삭제">삭제</button>
                </div>
            </div>
        `).join('');

        // Single DOM update for better performance
        this.savedList.innerHTML = html;
    }

    editText(id, type) {
        const item = this.savedTexts.find(saved => saved.id === id);
        if (item) {
            if (type === 'reference') {
                this.refTextInput.value = item.content;
                this.updateCharacterCount('ref');
                this.refTextInput.focus();
            } else {
                this.editTextInput.value = item.content;
                this.updateCharacterCount('edit');
                this.editTextInput.focus();
            }
            this.refTextInput.scrollIntoView({ behavior: 'smooth' });
        }
    }

    deleteText(id) {
        if (confirm('이 글을 삭제하시겠습니까?')) {
            const deletedItem = this.savedTexts.find(saved => saved.id === id);

            this.savedTexts = this.savedTexts.filter(saved => saved.id !== id);
            this.saveToLocalStorage();
            this.renderSavedTexts();

            // 로깅
            if (deletedItem) {
                this.logger.logAction('text_deleted', '글 삭제', {
                    textId: id,
                    type: deletedItem.type,
                    characterCount: deletedItem.characterCount
                });

                // Analytics: Track text deleted
                this.analyticsMonitor.trackUsage('text_deleted', {
                    type: deletedItem.type,
                    characterCount: deletedItem.characterCount
                });
            }

            this.showMessage('글이 삭제되었습니다.', 'info');
        }
    }

    escapeHtml(text) {
        // SecurityUtils를 사용한 XSS 방지
        return this.securityUtils.escapeHtml(text);
    }

    // 향상된 메시지 표시 시스템 (토스트 알림)
    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');

        // 타입별 아이콘 및 색상
        const messageConfig = {
            'success': { icon: '✅', bgColor: '#28a745', textColor: 'white', duration: 3000 },
            'error': { icon: '❌', bgColor: '#dc3545', textColor: 'white', duration: 5000 },
            'warning': { icon: '⚠️', bgColor: '#ffc107', textColor: '#000', duration: 4000 },
            'info': { icon: 'ℹ️', bgColor: '#17a2b8', textColor: 'white', duration: 3000 }
        };

        const config = messageConfig[type] || messageConfig['info'];

        messageEl.className = 'toast-message';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${config.bgColor};
            color: ${config.textColor};
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-weight: 600;
            max-width: 350px;
            word-wrap: break-word;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        messageEl.innerHTML = `
            <span style="font-size: 1.2em;">${config.icon}</span>
            <span style="flex: 1;">${this.escapeHtml(message)}</span>
            <button class="toast-close" aria-label="닫기">×</button>
        `;

        document.body.appendChild(messageEl);

        // 닫기 버튼 이벤트
        const closeBtn = messageEl.querySelector('.toast-close');
        const removeToast = () => {
            messageEl.classList.add('hiding');
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        };

        closeBtn.addEventListener('click', removeToast);

        // 자동 사라짐 (3초)
        const autoHideTimeout = setTimeout(removeToast, config.duration);

        // 마우스 호버 시 타이머 일시 정지
        messageEl.addEventListener('mouseenter', () => {
            clearTimeout(autoHideTimeout);
        });

        messageEl.addEventListener('mouseleave', () => {
            setTimeout(removeToast, 1000);
        });
    }

    // 로딩 표시기 표시
    showLoadingIndicator(message = '처리 중...') {
        // 기존 로딩 표시기 제거
        this.hideLoadingIndicator();

        const loadingEl = document.createElement('div');
        loadingEl.id = 'loading-indicator';
        loadingEl.className = 'loading-indicator';
        loadingEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 30px 40px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            z-index: 2000;
            text-align: center;
            min-width: 250px;
        `;

        loadingEl.innerHTML = `
            <div class="spinner" style="
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid white;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            "></div>
            <div style="font-size: 16px; font-weight: 600;">${this.escapeHtml(message)}</div>
        `;

        document.body.appendChild(loadingEl);

        // 스피너 애니메이션 추가
        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 로딩 표시기 숨기기
    hideLoadingIndicator() {
        const loadingEl = document.getElementById('loading-indicator');
        if (loadingEl && loadingEl.parentNode) {
            loadingEl.parentNode.removeChild(loadingEl);
        }
    }

    // 보안 강화: 사용자 데이터 암호화
    async encryptUserData(data) {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(JSON.stringify(data));

            // 사용자별 고유 키 생성
            const userKey = await crypto.subtle.importKey(
                'raw',
                encoder.encode(this.currentUser + 'dualTextWriter'),
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                userKey,
                dataBuffer
            );

            return {
                encrypted: Array.from(new Uint8Array(encrypted)),
                iv: Array.from(iv)
            };
        } catch (error) {
            console.warn('데이터 암호화 실패:', error);
            return null;
        }
    }

    // 보안 강화: 사용자 데이터 복호화
    async decryptUserData(encryptedData) {
        try {
            const encoder = new TextEncoder();
            const userKey = await crypto.subtle.importKey(
                'raw',
                encoder.encode(this.currentUser + 'dualTextWriter'),
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
                userKey,
                new Uint8Array(encryptedData.encrypted)
            );

            return JSON.parse(encoder.decode(decrypted));
        } catch (error) {
            console.warn('데이터 복호화 실패:', error);
            return null;
        }
    }

    // Google 로그인 버튼 상태 업데이트 (향상된 버전)
    updateGoogleLoginButtonState(isReady, errorType = null) {
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (!googleLoginBtn) return;

        if (isReady) {
            // 정상 상태
            googleLoginBtn.disabled = false;
            googleLoginBtn.innerHTML = `
                <span class="google-icon">🔍</span>
                Google로 로그인
            `;
            googleLoginBtn.title = 'Google 계정으로 안전하게 로그인';
            googleLoginBtn.classList.remove('btn-disabled');
        } else {
            // 비활성 상태
            googleLoginBtn.disabled = true;
            googleLoginBtn.classList.add('btn-disabled');

            // 오류 유형별 메시지
            const errorMessages = {
                'config_invalid': {
                    icon: '⚙️',
                    text: 'Google OAuth 설정 필요',
                    title: 'Google Cloud Console에서 OAuth 설정이 필요합니다'
                },
                'init_failed': {
                    icon: '⚠️',
                    text: 'Google 로그인 사용 불가',
                    title: 'Google OAuth 초기화에 실패했습니다'
                },
                'error': {
                    icon: '❌',
                    text: 'Google 로그인 오류',
                    title: 'Google 로그인 중 오류가 발생했습니다'
                }
            };

            const errorMsg = errorMessages[errorType] || errorMessages['error'];

            googleLoginBtn.innerHTML = `
                <span class="google-icon">${errorMsg.icon}</span>
                ${errorMsg.text}
            `;
            googleLoginBtn.title = errorMsg.title;
        }
    }

    // Google OAuth 설정 안내 (향상된 버전)
    showGoogleSetupNotice() {
        if (!this.config.validateGoogleConfig()) {
            const setupInstructions = this.config.getSetupInstructions();
            console.warn(setupInstructions);

            // 개발 환경에서만 상세 안내 표시
            if (this.config.isDevelopment) {
                console.group('📋 Google OAuth 설정 가이드');
                console.log(setupInstructions);
                console.groupEnd();
            }
        }
    }

    // 마이그레이션 진행 표시 (향상된 버전 - 진행률 바 포함)
    showMigrationProgress(status) {
        // 기존 진행 표시기 제거
        const existingProgress = document.getElementById('migration-progress-indicator');
        if (existingProgress) {
            existingProgress.remove();
        }

        const statusConfig = {
            'checking': {
                icon: '🔍',
                title: '데이터 확인 중',
                text: '기존 데이터를 확인하고 있습니다...',
                progress: 10,
                steps: { backup: false, transfer: false, verify: false }
            },
            'migrating': {
                icon: '📦',
                title: '마이그레이션 진행 중',
                text: '데이터를 안전하게 이전하고 있습니다...',
                progress: 50,
                steps: { backup: true, transfer: true, verify: false }
            },
            'complete': {
                icon: '✅',
                title: '마이그레이션 완료',
                text: '모든 데이터가 성공적으로 이전되었습니다!',
                progress: 100,
                steps: { backup: true, transfer: true, verify: true }
            },
            'error': {
                icon: '❌',
                title: '마이그레이션 실패',
                text: '데이터 이전 중 오류가 발생했습니다. 기존 데이터는 안전합니다.',
                progress: 0,
                steps: { backup: false, transfer: false, verify: false }
            }
        };

        const config = statusConfig[status];
        if (!config) return;

        console.log(`${config.icon} ${config.text}`);

        // 완료 또는 오류 시 토스트 메시지만 표시
        if (status === 'complete' || status === 'error') {
            this.showMessage(config.text, status === 'complete' ? 'success' : 'error');
            return;
        }

        // 진행 중 상태는 모달 표시
        const progressEl = document.createElement('div');
        progressEl.id = 'migration-progress-indicator';
        progressEl.className = 'migration-progress';

        progressEl.innerHTML = `
            <h4>${config.icon} ${config.title}</h4>
            <div class="migration-progress-bar">
                <div class="migration-progress-fill" style="width: ${config.progress}%"></div>
            </div>
            <div class="migration-status-text">${config.text}</div>
            <div class="migration-steps">
                <div class="migration-step ${config.steps.backup ? 'complete' : ''}">
                    <span class="migration-step-icon">${config.steps.backup ? '✅' : '⏳'}</span>
                    백업
                </div>
                <div class="migration-step ${config.steps.transfer ? 'active' : ''}">
                    <span class="migration-step-icon">${config.steps.transfer ? '✅' : '⏳'}</span>
                    이전
                </div>
                <div class="migration-step ${config.steps.verify ? 'complete' : ''}">
                    <span class="migration-step-icon">${config.steps.verify ? '✅' : '⏳'}</span>
                    검증
                </div>
            </div>
        `;

        document.body.appendChild(progressEl);

        // 완료 시 자동 제거 (3초 후)
        if (status === 'complete') {
            setTimeout(() => {
                if (progressEl.parentNode) {
                    progressEl.style.animation = 'fadeOut 0.3s ease';
                    setTimeout(() => progressEl.remove(), 300);
                }
            }, 3000);
        }
    }

    // 임시 저장 기능
    startTempSave() {
        this.tempSaveInterval = setInterval(() => {
            this.performTempSave();
        }, 5000);
    }

    scheduleTempSave() {
        clearTimeout(this.tempSaveTimeout);
        this.tempSaveTimeout = setTimeout(() => {
            this.performTempSave();
        }, 2000);
    }

    performTempSave() {
        if (!this.currentUser) return;

        const refText = this.refTextInput.value;
        const editText = this.editTextInput.value;

        if (refText.length > 0 || editText.length > 0) { // trim() 제거하여 원본 포맷 유지
            try {
                const tempData = {
                    refText: refText,
                    editText: editText,
                    timestamp: Date.now(),
                    refCharacterCount: this.getKoreanCharacterCount(refText),
                    editCharacterCount: this.getKoreanCharacterCount(editText)
                };

                const userTempKey = `dualTextWriter_tempSave_${this.currentUser}`;
                localStorage.setItem(userTempKey, JSON.stringify(tempData));
                this.lastTempSave = tempData;
                this.showTempSaveStatus();
            } catch (error) {
                console.error('임시 저장에 실패했습니다:', error);
            }
        }
    }

    showTempSaveStatus() {
        this.tempSaveStatus.classList.remove('hide');
        this.tempSaveStatus.classList.add('show');

        setTimeout(() => {
            this.tempSaveStatus.classList.remove('show');
            this.tempSaveStatus.classList.add('hide');
        }, 3000);
    }

    restoreTempSave() {
        if (!this.currentUser) return;

        try {
            const userTempKey = `dualTextWriter_tempSave_${this.currentUser}`;
            const tempData = localStorage.getItem(userTempKey);
            if (tempData) {
                const data = JSON.parse(tempData);

                const now = Date.now();
                const dayInMs = 24 * 60 * 60 * 1000;

                if (now - data.timestamp < dayInMs) {
                    if (confirm('임시 저장된 글이 있습니다. 복원하시겠습니까?')) {
                        if (data.refText) {
                            this.refTextInput.value = data.refText;
                            this.updateCharacterCount('ref');
                        }
                        if (data.editText) {
                            this.editTextInput.value = data.editText;
                            this.updateCharacterCount('edit');
                        }
                        this.showMessage('임시 저장된 글이 복원되었습니다.', 'success');
                    }
                } else {
                    localStorage.removeItem(userTempKey);
                }
            }
        } catch (error) {
            console.error('임시 저장 복원에 실패했습니다:', error);
        }
    }

    loadUserData() {
        if (!this.currentUser) return;

        this.savedTexts = this.loadSavedTexts();
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
        this.renderSavedTexts();
        this.startTempSave();
        this.restoreTempSave();
    }

    loadSavedTexts() {
        if (!this.currentUser) return [];

        // 안전한 데이터 로드 및 검증 (보안 강화)
        const userKey = `dualTextWriter_savedTexts_${this.currentUser}`;
        const savedTexts = this.securityUtils.safeLoadFromStorage(
            userKey,
            [],
            (data) => this.securityUtils.validateSavedTexts(data)
        );

        // 검증된 데이터 반환
        return savedTexts || [];
    }

    saveToLocalStorage() {
        if (!this.currentUser) return;

        // 안전한 데이터 저장 및 검증 (보안 강화)
        const userKey = `dualTextWriter_savedTexts_${this.currentUser}`;
        const success = this.securityUtils.safeSaveToStorage(
            userKey,
            this.savedTexts,
            (data) => this.securityUtils.validateSavedTexts(data)
        );

        if (!success) {
            console.error('글을 저장하는데 실패했습니다.');
            this.showMessage('저장에 실패했습니다.', 'error');
        }
    }

    cleanupTempSave() {
        if (this.tempSaveInterval) {
            clearInterval(this.tempSaveInterval);
        }
        if (this.tempSaveTimeout) {
            clearTimeout(this.tempSaveTimeout);
        }
    }

    // ============================================
    // 폴백 시스템 강화 (Task 6)
    // ============================================

    // 6.1 폴백 활성화 로직 구현
    enableFallbackSystem(reason = 'unknown') {
        console.log(`🔄 폴백 시스템 활성화: ${reason}`);

        // 로깅
        this.logger.logAction('fallback_enabled', '폴백 시스템 활성화', {
            reason: reason,
            timestamp: Date.now()
        });

        // Google 로그인 버튼 비활성화
        this.updateGoogleLoginButtonState(false, reason);

        // 폴백 활성화 이유 사용자에게 설명
        this.showFallbackNotice(reason);
    }

    // 폴백 활성화 이유 표시
    showFallbackNotice(reason) {
        const reasonMessages = {
            'offline': {
                icon: '📡',
                title: '오프라인 모드',
                message: '인터넷 연결이 없습니다. 기존 사용자명으로 로그인하여 오프라인에서도 사용할 수 있습니다.',
                type: 'warning'
            },
            'config_invalid': {
                icon: '⚙️',
                title: 'Google OAuth 설정 필요',
                message: 'Google OAuth가 설정되지 않았습니다. 기존 사용자명으로 로그인해주세요.',
                type: 'info'
            },
            'init_failed': {
                icon: '⚠️',
                title: 'Google 로그인 사용 불가',
                message: 'Google 로그인 초기화에 실패했습니다. 기존 사용자명으로 로그인해주세요.',
                type: 'warning'
            },
            'error': {
                icon: '❌',
                title: 'Google 로그인 오류',
                message: 'Google 로그인 중 오류가 발생했습니다. 기존 사용자명으로 로그인해주세요.',
                type: 'error'
            },
            'unknown': {
                icon: 'ℹ️',
                title: '폴백 모드',
                message: '기존 사용자명으로 로그인해주세요.',
                type: 'info'
            }
        };

        const notice = reasonMessages[reason] || reasonMessages['unknown'];

        // Google 상태 표시 영역 업데이트
        const googleStatus = document.getElementById('google-status');
        const googleStatusIcon = document.getElementById('google-status-icon');
        const googleStatusText = document.getElementById('google-status-text');

        if (googleStatus && googleStatusIcon && googleStatusText) {
            googleStatusIcon.textContent = notice.icon;
            googleStatusText.textContent = notice.message;
            googleStatus.style.display = 'flex';
            googleStatus.className = `google-status ${notice.type}`;
        }

        // 콘솔 로그
        console.log(`${notice.icon} ${notice.title}: ${notice.message}`);
    }



    // ============================================
    // Task 8: Enhanced Offline Support
    // ============================================

    /**
     * Task 8.1: Improve offline detection
     * Requirements: 6.1, 6.2
     * - Listen to online/offline events
     * - Update UI within 2 seconds of status change
     * - Show offline indicator banner
     * - Disable Google login button when offline
     */
    setupNetworkMonitoring() {
        console.log('📡 네트워크 상태 모니터링 시작...');

        // 네트워크 상태 추적 변수
        this.isOnline = navigator.onLine;
        this.networkStatusChangeTime = null;

        // 초기 네트워크 상태 확인
        this.checkNetworkStatus();

        // online 이벤트 리스너 (Task 8.1)
        window.addEventListener('online', () => {
            const startTime = performance.now();
            console.log('✅ 네트워크 연결 복구됨');

            this.isOnline = true;
            this.networkStatusChangeTime = Date.now();

            // UI 업데이트 (2초 이내)
            this.handleNetworkOnline();

            // 성능 측정
            const duration = performance.now() - startTime;
            console.log(`⏱️ UI 업데이트 시간: ${duration.toFixed(2)}ms`);

            if (duration > 2000) {
                console.warn('⚠️ UI 업데이트가 2초를 초과했습니다.');
            }
        });

        // offline 이벤트 리스너 (Task 8.1)
        window.addEventListener('offline', () => {
            const startTime = performance.now();
            console.warn('⚠️ 네트워크 연결 끊김');

            this.isOnline = false;
            this.networkStatusChangeTime = Date.now();

            // UI 업데이트 (2초 이내)
            this.handleNetworkOffline();

            // 성능 측정
            const duration = performance.now() - startTime;
            console.log(`⏱️ UI 업데이트 시간: ${duration.toFixed(2)}ms`);

            if (duration > 2000) {
                console.warn('⚠️ UI 업데이트가 2초를 초과했습니다.');
            }
        });

        this.logger.logAction('network_monitoring_started', '네트워크 모니터링 시작');
    }

    /**
     * Task 8.1: 네트워크 상태 확인
     */
    checkNetworkStatus() {
        this.isOnline = navigator.onLine;

        if (!this.isOnline) {
            console.warn('⚠️ 오프라인 상태 감지');
            this.handleNetworkOffline();
        } else {
            console.log('✅ 온라인 상태');
        }
    }

    /**
     * Task 8.3: Implement online recovery
     * Requirements: 6.5
     * - Re-enable Google login when back online
     * - Show "Back online" notification
     * - Offer to sync data if user was working offline
     */
    async handleNetworkOnline() {
        this.logger.logAction('network_online', '네트워크 연결 복구');

        // Task 8.2: 오프라인 배너 숨김
        this.hideOfflineBanner();

        // Task 8.3: "Back online" 알림
        this.showMessage('✅ 인터넷 연결이 복구되었습니다. Google 로그인을 사용할 수 있습니다.', 'success');

        // Task 8.1: Google 로그인 버튼 활성화
        this.updateGoogleLoginButtonState(true);

        // Firebase 재초기화 시도
        if (!this.isFirebaseReady) {
            console.log('🔄 Firebase 재초기화 시도...');
            await this.initializeFirebase();

            if (this.isFirebaseReady) {
                // 상태 표시 숨김
                const googleStatus = document.getElementById('google-status');
                if (googleStatus) {
                    googleStatus.style.display = 'none';
                }

                console.log('✅ Firebase 재활성화 완료');
            }
        }

        // Task 8.4: 오프라인 데이터 동기화 제안
        if (this.currentUser && this.hasOfflineChanges()) {
            this.offerOfflineDataSync();
        }

        // Adaptive UI 업데이트
        if (this.adaptiveUIManager) {
            this.adaptiveUIManager.updateUIForContext({
                isOnline: true,
                isFirebaseReady: this.isFirebaseReady
            });
        }
    }

    /**
     * Task 8.1 & 8.2: 오프라인 시 처리
     * Requirements: 6.1, 6.2
     * - Disable Google login button when offline
     * - Show offline indicator banner
     */
    handleNetworkOffline() {
        this.logger.logAction('network_offline', '네트워크 연결 끊김');

        // Task 8.1: Google 로그인 버튼 비활성화
        this.updateGoogleLoginButtonState(false);

        // Task 8.2: 오프라인 배너 표시
        this.showOfflineBanner();

        // 폴백 시스템 활성화
        this.enableFallbackSystem('offline');

        // Adaptive UI 업데이트
        if (this.adaptiveUIManager) {
            this.adaptiveUIManager.updateUIForContext({
                isOnline: false,
                isFirebaseReady: false
            });
        }
    }

    /**
     * Task 8.2: Create offline mode banner
     * Requirements: 6.2
     * - Show "📡 오프라인 모드" banner at top
     * - Explain that Google login is unavailable
     * - Highlight that username login still works
     * - Auto-hide when back online
     */
    showOfflineBanner() {
        // 기존 배너가 있으면 제거
        this.hideOfflineBanner();

        // 오프라인 배너 생성
        const banner = document.createElement('div');
        banner.id = 'offline-mode-banner';
        banner.className = 'offline-mode-banner';
        banner.innerHTML = `
            <div class="offline-banner-content">
                <span class="offline-icon">📡</span>
                <div class="offline-text">
                    <strong>오프라인 모드</strong>
                    <p>Google 로그인을 사용할 수 없습니다. 사용자명 로그인은 계속 사용 가능합니다.</p>
                </div>
                <button class="offline-banner-close" onclick="dualTextWriter.hideOfflineBanner()" title="닫기">×</button>
            </div>
        `;

        // 페이지 상단에 추가
        document.body.insertBefore(banner, document.body.firstChild);

        // 애니메이션 효과
        setTimeout(() => {
            banner.classList.add('show');
        }, 10);

        console.log('📡 오프라인 배너 표시됨');
        this.logger.logAction('offline_banner_shown', '오프라인 배너 표시');
    }

    /**
     * Task 8.2: 오프라인 배너 숨김
     */
    hideOfflineBanner() {
        const banner = document.getElementById('offline-mode-banner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.remove();
            }, 300);

            console.log('✅ 오프라인 배너 숨김');
            this.logger.logAction('offline_banner_hidden', '오프라인 배너 숨김');
        }
    }

    /**
     * Task 8.4: Implement offline data sync
     * Requirements: 6.6, 6.7
     * - Detect when user comes back online
     * - Offer to sync offline changes to Firestore
     * - Handle conflicts (keep most recent by timestamp)
     * - Show sync progress
     */
    hasOfflineChanges() {
        // 오프라인 중 변경사항이 있는지 확인
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');

        // Username 인증 사용자가 오프라인 중 작업한 경우
        if (authProvider === 'username') {
            const tempSaveKey = `dualTextWriter_tempSave_${this.currentUser}`;
            const tempSave = localStorage.getItem(tempSaveKey);

            if (tempSave) {
                const tempData = JSON.parse(tempSave);
                // 최근 5분 이내 변경사항이 있는지 확인
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                return tempData.timestamp > fiveMinutesAgo;
            }
        }

        return false;
    }

    /**
     * Task 8.4: 오프라인 데이터 동기화 제안
     */
    async offerOfflineDataSync() {
        // Firebase가 준비되지 않았으면 동기화 불가
        if (!this.isFirebaseReady) {
            console.warn('⚠️ Firebase가 준비되지 않아 동기화를 제안할 수 없습니다.');
            return;
        }

        // 사용자에게 동기화 제안
        const shouldSync = confirm(
            '오프라인 중 작업한 내용이 있습니다.\n' +
            'Google 계정으로 동기화하시겠습니까?\n\n' +
            '동기화하면 클라우드에 저장되어 다른 기기에서도 사용할 수 있습니다.'
        );

        if (shouldSync) {
            await this.syncOfflineData();
        } else {
            console.log('사용자가 동기화를 거부했습니다.');
            this.logger.logAction('offline_sync_declined', '오프라인 동기화 거부');
        }
    }

    /**
     * Task 8.4: 오프라인 데이터 동기화 실행
     * Requirements: 6.6, 6.7
     */
    async syncOfflineData() {
        try {
            console.log('🔄 오프라인 데이터 동기화 시작...');
            this.showLoadingIndicator('오프라인 데이터 동기화 중...');

            // 로컬 데이터 가져오기
            const localKey = `dualTextWriter_savedTexts_${this.currentUser}`;
            const localData = JSON.parse(localStorage.getItem(localKey) || '[]');

            if (localData.length === 0) {
                this.hideLoadingIndicator();
                this.showMessage('동기화할 데이터가 없습니다.', 'info');
                return;
            }

            // Firestore에서 기존 데이터 가져오기
            const cloudData = await this.firebaseManager.getAllTexts();

            // 충돌 해결: 타임스탬프 기준으로 최신 데이터 유지
            const mergedData = this.mergeDataByTimestamp(localData, cloudData);

            // 동기화 진행
            let syncedCount = 0;
            const totalCount = mergedData.length;

            for (const item of mergedData) {
                try {
                    // Firestore에 저장
                    await this.firebaseManager.saveText({
                        content: item.content,
                        characterCount: item.characterCount,
                        type: item.type,
                        createdAt: item.date || new Date().toISOString()
                    });

                    syncedCount++;

                    // 진행률 업데이트
                    const progress = Math.round((syncedCount / totalCount) * 100);
                    this.updateLoadingMessage(`동기화 중... ${progress}% (${syncedCount}/${totalCount})`);

                } catch (error) {
                    console.error('항목 동기화 실패:', error);
                }
            }

            this.hideLoadingIndicator();
            this.showMessage(`✅ ${syncedCount}개 항목이 동기화되었습니다!`, 'success');

            console.log(`✅ 오프라인 데이터 동기화 완료: ${syncedCount}/${totalCount}`);
            this.logger.logAction('offline_sync_completed', '오프라인 동기화 완료', {
                syncedCount,
                totalCount
            });

        } catch (error) {
            console.error('❌ 오프라인 데이터 동기화 실패:', error);
            this.hideLoadingIndicator();
            this.showMessage('동기화에 실패했습니다. 나중에 다시 시도해주세요.', 'error');

            this.logger.logAction('offline_sync_failed', '오프라인 동기화 실패', {
                error: error.message
            });
        }
    }

    /**
     * Task 8.4: 데이터 병합 (충돌 해결)
     * Requirements: 6.7
     * - Handle conflicts (keep most recent by timestamp)
     */
    mergeDataByTimestamp(localData, cloudData) {
        const merged = new Map();

        // 로컬 데이터 추가
        localData.forEach(item => {
            const key = `${item.content.substring(0, 50)}_${item.type}`;
            merged.set(key, {
                ...item,
                timestamp: this.parseDate(item.date)
            });
        });

        // 클라우드 데이터와 비교하여 최신 것만 유지
        cloudData.forEach(item => {
            const key = `${item.content.substring(0, 50)}_${item.type}`;
            const existing = merged.get(key);
            const cloudTimestamp = this.parseDate(item.createdAt);

            if (!existing || cloudTimestamp > existing.timestamp) {
                merged.set(key, {
                    ...item,
                    timestamp: cloudTimestamp
                });
            }
        });

        return Array.from(merged.values());
    }

    /**
     * 날짜 문자열을 타임스탬프로 변환
     */
    parseDate(dateStr) {
        if (!dateStr) return Date.now();

        try {
            return new Date(dateStr).getTime();
        } catch (error) {
            return Date.now();
        }
    }

    /**
     * 로딩 메시지 업데이트
     */
    updateLoadingMessage(message) {
        const loadingMessage = document.getElementById('auth-loading-message');
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }

    // 6.3 폴백 시스템 기능 검증
    verifyFallbackSystem() {
        console.group('🔍 폴백 시스템 기능 검증');

        const verificationResults = {
            dataSave: false,
            dataLoad: false,
            coreFunctions: false
        };

        try {
            // 1. 데이터 저장 기능 확인
            try {
                const testKey = 'dualTextWriter_fallback_test';
                const testData = { test: 'fallback_verification', timestamp: Date.now() };
                localStorage.setItem(testKey, JSON.stringify(testData));
                const retrieved = JSON.parse(localStorage.getItem(testKey));
                verificationResults.dataSave = retrieved.test === 'fallback_verification';
                localStorage.removeItem(testKey);
                console.log(`✓ 데이터 저장/로드: ${verificationResults.dataSave ? '정상' : '오류'}`);
            } catch (error) {
                console.error('✗ 데이터 저장/로드 오류:', error);
            }

            // 2. 핵심 기능 확인
            const refTextInput = document.getElementById('ref-text-input');
            const editTextInput = document.getElementById('edit-text-input');
            const refSaveBtn = document.getElementById('ref-save-btn');
            const editSaveBtn = document.getElementById('edit-save-btn');

            verificationResults.coreFunctions = !!(
                refTextInput && editTextInput &&
                refSaveBtn && editSaveBtn
            );
            console.log(`✓ 핵심 기능: ${verificationResults.coreFunctions ? '정상' : '오류'}`);

            // 전체 결과
            const allPassed = Object.values(verificationResults).every(result => result === true);

            if (allPassed) {
                console.log('✅ 폴백 시스템 검증 완료: 모든 기능 정상');
            } else {
                console.warn('⚠️ 폴백 시스템 검증: 일부 기능 오류');
            }

            console.groupEnd();

            // 로깅
            this.logger.logAction('fallback_verification', '폴백 시스템 검증', {
                results: verificationResults,
                allPassed: allPassed
            });

            return verificationResults;

        } catch (error) {
            console.error('❌ 폴백 시스템 검증 실패:', error);
            console.groupEnd();

            this.logger.logAction('fallback_verification_error', '폴백 시스템 검증 오류', {
                error: error.message
            });

            return verificationResults;
        }
    }

    // 폴백 시스템 상태 확인 (디버깅용)
    getFallbackSystemStatus() {
        return {
            isGoogleReady: this.isGoogleReady,
            isOnline: navigator.onLine,
            currentUser: this.currentUser,
            authProvider: localStorage.getItem('dualTextWriter_authProvider'),
            fallbackAvailable: true,
            verificationResults: this.verifyFallbackSystem()
        };
    }

    // ============================================
    // Firebase 통합 메서드 (Task 4.7, 4.8, 4.9)
    // ============================================

    /**
     * 인증 상태 변경 핸들러 (Task 4.7)
     * Requirements: 1.5
     */
    handleAuthStateChange(user) {
        console.log('🔄 인증 상태 변경 감지:', user ? user.email : '로그아웃');

        if (user) {
            // 로그인 상태
            this.currentUser = user.email;
            this.logger.setUserId(user.email);

            // 사용자 정보 저장
            this.saveFirebaseUserData(user);

            // UI 업데이트
            this.showUserInterface();

            // 데이터 로드
            this.loadUserData();

            // 실시간 동기화 설정
            this.setupRealtimeSync();

            console.log('✅ 세션 복원 완료:', user.email);

            // 로깅
            this.logger.logAction('auth_state_restored', '세션 자동 복원', {
                email: user.email,
                provider: 'firebase'
            });
        } else {
            // 로그아웃 상태
            console.log('🚪 세션 만료 또는 로그아웃');

            // 실시간 동기화 해제
            if (this.firebaseManager) {
                this.firebaseManager.unsubscribeFromTexts();
            }

            // 로깅
            this.logger.logAction('auth_state_changed', '로그아웃 상태', {
                reason: 'session_expired_or_logout'
            });
        }
    }

    /**
     * 실시간 동기화 설정 (Task 4.8)
     * Requirements: 3.3
     */
    setupRealtimeSync() {
        if (!this.isFirebaseReady || !this.firebaseManager) {
            console.warn('⚠️ Firebase가 준비되지 않아 실시간 동기화를 설정할 수 없습니다.');
            return;
        }

        console.log('🔄 실시간 동기화 설정 시작...');

        // Firestore 리스너 등록
        this.firebaseManager.subscribeToTexts((texts, error) => {
            if (error) {
                console.error('❌ 실시간 동기화 오류:', error);
                this.showMessage('데이터 동기화 중 오류가 발생했습니다.', 'error');
                return;
            }

            if (texts) {
                console.log('🔄 데이터 변경 감지:', texts.length, '개');

                // savedTexts 업데이트
                this.savedTexts = texts.map(item => ({
                    id: item.id,
                    content: item.content,
                    date: item.createdAt.toLocaleString('ko-KR'),
                    characterCount: item.characterCount,
                    type: item.type
                }));

                // UI 자동 업데이트
                this.renderSavedTexts();

                // 로깅
                this.logger.logAction('realtime_sync_update', '실시간 데이터 업데이트', {
                    count: texts.length
                });
            }
        });

        console.log('✅ 실시간 동기화 설정 완료');

        // 로깅
        this.logger.logAction('realtime_sync_enabled', '실시간 동기화 활성화');
    }

    /**
     * 자동 계정 매칭 및 연결 확인
     * Requirements: 8.1, 8.2
     * Task 5.3: Implement automatic match detection
     */
    async checkAccountMatching(userData) {
        try {
            const googleEmail = userData.email;

            // 이미 연결된 계정이 있는지 확인
            const existingLink = this.userMatcher.getLinkedAccount(googleEmail);
            if (existingLink) {
                console.log('ℹ️ 이미 연결된 계정이 있습니다:', existingLink.username);
                return;
            }

            // 첫 로그인인지 확인 (Firestore에 데이터가 없는 경우)
            const isFirstLogin = await this.isFirstGoogleLogin(googleEmail);
            if (!isFirstLogin) {
                console.log('ℹ️ 첫 로그인이 아닙니다. 매칭 건너뛰기');
                return;
            }

            // 유사한 사용자명 계정 찾기
            const bestMatch = this.userMatcher.suggestMatch(googleEmail);

            if (!bestMatch) {
                console.log('ℹ️ 매칭되는 사용자명 계정이 없습니다.');
                return;
            }

            // 신뢰도가 70% 이상인 경우만 제안
            if (bestMatch.confidence < 0.7) {
                console.log('ℹ️ 매칭 신뢰도가 낮습니다:', bestMatch.confidence);
                return;
            }

            // 이미 무시된 매칭인지 확인
            if (this.userMatcher.isMatchIgnored(googleEmail, bestMatch.username)) {
                console.log('ℹ️ 사용자가 이전에 무시한 매칭입니다.');
                return;
            }

            // 계정 연결 다이얼로그 표시
            console.log('🔗 계정 매칭 발견:', bestMatch);

            // 콜백 설정
            this.accountLinkingDialog.onLink = async (googleId, username) => {
                await this.handleAccountLink(googleId, username);
            };

            this.accountLinkingDialog.onLater = (googleId, username) => {
                console.log('⏰ 나중에 연결하기:', googleId, username);
                this.logger.logAction('account_link_postponed', '계정 연결 연기', {
                    googleId,
                    username
                });
            };

            this.accountLinkingDialog.onIgnore = (googleId, username) => {
                console.log('🚫 매칭 무시:', googleId, username);
            };

            // 다이얼로그 표시
            const action = await this.accountLinkingDialog.show(googleEmail, bestMatch);

            console.log('✅ 계정 연결 다이얼로그 완료:', action);

        } catch (error) {
            console.error('❌ 계정 매칭 확인 중 오류:', error);
            // 에러가 발생해도 로그인 프로세스는 계속 진행
        }
    }

    /**
     * 첫 Google 로그인 여부 확인
     * @param {string} email
     * @returns {Promise<boolean>}
     */
    async isFirstGoogleLogin(email) {
        try {
            if (!this.isFirebaseReady || !this.firebaseManager) {
                return true; // Firebase가 없으면 첫 로그인으로 간주
            }

            // Firestore에서 사용자 데이터 확인
            const texts = await this.firebaseManager.loadTexts();

            // 데이터가 없으면 첫 로그인
            return texts.length === 0;

        } catch (error) {
            console.error('❌ 첫 로그인 확인 실패:', error);
            return true; // 에러 시 첫 로그인으로 간주
        }
    }

    /**
     * 계정 연결 및 데이터 마이그레이션 처리
     * @param {string} googleId - Google 이메일
     * @param {string} username - 사용자명
     */
    async handleAccountLink(googleId, username) {
        try {
            console.log('🔗 계정 연결 및 데이터 마이그레이션 시작:', googleId, '<->', username);

            // 1. 데이터 분석
            const analysis = await this.migrationManager.analyzeData(username);

            if (!analysis.hasData || analysis.itemCount === 0) {
                console.log('ℹ️ 이전할 데이터가 없습니다.');
                this.showMessage('연결할 데이터가 없습니다.', 'info');
                return;
            }

            // 2. 미리보기 다이얼로그 표시 (lazy initialization)
            if (!this.migrationPreviewDialog) {
                this.migrationPreviewDialog = new MigrationPreviewDialog(this.migrationManager, this.logger);
            }
            const confirmed = await this.migrationPreviewDialog.show(analysis, username, googleId);

            if (!confirmed) {
                console.log('⏰ 사용자가 마이그레이션을 취소했습니다.');
                return;
            }

            // 3. 진행 다이얼로그 표시 (lazy initialization)
            if (!this.migrationProgressDialog) {
                this.migrationProgressDialog = new MigrationProgressDialog(this.logger);
            }
            const progressControl = this.migrationProgressDialog.show(analysis.itemCount);

            try {
                // 4. 마이그레이션 실행
                const result = await this.migrationManager.migrateWithProgress(
                    username,
                    googleId,
                    (progress) => {
                        progressControl.update(progress);
                    }
                );

                // 5. 완료 표시
                progressControl.complete();

                // 6. 성공 메시지
                this.showMessage(
                    `✅ ${result.migratedCount}개의 글이 성공적으로 이전되었습니다!`,
                    'success'
                );

                // 7. 로깅
                this.logger.logAction('account_link_migration_success', '계정 연결 및 마이그레이션 성공', {
                    googleId,
                    username,
                    itemCount: result.migratedCount,
                    duration: result.duration
                });

                // 8. Firebase 동기화 (Firebase가 준비된 경우)
                if (this.isFirebaseReady && this.firebaseManager) {
                    console.log('🔄 Firebase 동기화 시작...');
                    await this.syncToFirebase(googleId);
                }

                // 9. 다이얼로그 자동 닫기 (3초 후)
                setTimeout(() => {
                    progressControl.close();
                }, 3000);

            } catch (migrationError) {
                console.error('❌ 마이그레이션 실패:', migrationError);

                // 에러 표시
                progressControl.error(migrationError);

                // 에러 메시지
                this.showMessage(
                    '마이그레이션에 실패했습니다. 기존 데이터는 안전하게 보존되었습니다.',
                    'error'
                );

                // 로깅
                this.logger.logAction('account_link_migration_failed', '계정 연결 마이그레이션 실패', {
                    googleId,
                    username,
                    error: migrationError.message
                });
            }

        } catch (error) {
            console.error('❌ 계정 연결 처리 실패:', error);
            this.showMessage('계정 연결에 실패했습니다. 기존 데이터는 안전합니다.', 'error');

            // 로깅
            this.logger.logAction('account_link_migration_failed', '계정 연결 및 마이그레이션 실패', {
                error: error.message
            });
        }
    }

    /**
     * Firebase 동기화 헬퍼 메서드
     * @param {string} userId - 사용자 ID
     */
    async syncToFirebase(userId) {
        try {
            const sourceKey = `dualTextWriter_savedTexts_${userId}`;
            const sourceData = JSON.parse(localStorage.getItem(sourceKey) || '[]');

            if (sourceData.length === 0) {
                console.log('ℹ️ 동기화할 데이터가 없습니다.');
                return;
            }

            let uploadedCount = 0;

            for (const item of sourceData) {
                try {
                    await this.firebaseManager.saveText({
                        content: item.content,
                        characterCount: item.characterCount,
                        type: item.type || 'edit',
                        deviceInfo: {
                            userAgent: navigator.userAgent,
                            platform: navigator.platform
                        }
                    });
                    uploadedCount++;
                } catch (error) {
                    console.error('❌ 항목 업로드 실패:', error);
                }
            }

            console.log(`✅ Firebase 동기화 완료: ${uploadedCount}/${sourceData.length}`);

            // 로깅
            this.logger.logAction('firebase_sync_complete', 'Firebase 동기화 완료', {
                userId,
                uploadedCount,
                totalCount: sourceData.length
            });

        } catch (error) {
            console.error('❌ Firebase 동기화 실패:', error);

            // 로깅
            this.logger.logAction('firebase_sync_failed', 'Firebase 동기화 실패', {
                error: error.message
            });
        }
    }

    /**
     * 로컬 데이터 마이그레이션 확인 및 실행
     * Requirements: 8.1, 8.2
     */
    async checkAndMigrateLocalData(userData) {
        try {
            if (!this.migrationService) {
                console.warn('⚠️ 마이그레이션 서비스가 초기화되지 않았습니다.');
                return;
            }

            // 이미 마이그레이션 완료된 경우 건너뛰기
            const migrationRecord = this.migrationService.getMigrationRecord();
            if (migrationRecord && migrationRecord.userEmail === userData.email) {
                console.log('ℹ️ 이미 마이그레이션 완료된 사용자입니다.');
                return;
            }

            // 로컬 데이터 감지
            const localData = this.migrationService.detectLocalData(userData.email);

            if (!localData.hasData) {
                console.log('ℹ️ 마이그레이션할 로컬 데이터가 없습니다.');
                return;
            }

            // 사용자에게 마이그레이션 제안
            const shouldMigrate = await this.migrationService.confirmMigration(localData, userData.email);

            if (shouldMigrate) {
                await this.performMigration(userData, localData);
            } else {
                console.log('ℹ️ 사용자가 마이그레이션을 거부했습니다.');
                this.logger.logAction('firebase_migration_declined', '사용자가 마이그레이션 거부', {
                    userEmail: userData.email,
                    dataCount: localData.dataCount
                });
            }
        } catch (error) {
            console.error('❌ 마이그레이션 확인 중 오류:', error);
            this.showMessage('데이터 마이그레이션 확인 중 오류가 발생했습니다.', 'warning');
        }
    }

    /**
     * 마이그레이션 프로세스 실행
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     */
    async performMigration(userData, localData) {
        try {
            console.log('🚀 마이그레이션 프로세스 시작...');

            // 진행 상태 표시
            this.showMigrationProgress('시작', 0);

            // 마이그레이션 실행
            const result = await this.migrationService.performMigration(
                userData.email,
                userData.email,
                (progress) => {
                    // 진행 상태 업데이트
                    this.showMigrationProgress(
                        `업로드 중 (${progress.current}/${progress.total})`,
                        progress.percentage
                    );
                }
            );

            if (result.success) {
                // 성공 메시지
                const successMessage = `
✅ 데이터 마이그레이션 완료!

• 성공: ${result.uploadResults.success.length}개
• 실패: ${result.uploadResults.failed.length}개
• 총 데이터: ${localData.dataCount}개

클라우드에 안전하게 저장되었습니다.
                `.trim();

                alert(successMessage);

                // 로컬 데이터 정리 확인
                if (result.uploadResults.failed.length === 0) {
                    const shouldCleanup = confirm(
                        '마이그레이션이 성공적으로 완료되었습니다.\n' +
                        '로컬 데이터를 정리하시겠습니까?\n\n' +
                        '(백업은 30일간 보관됩니다)'
                    );

                    if (shouldCleanup) {
                        this.migrationService.cleanupLocalData(userData.email);
                        this.showMessage('로컬 데이터가 정리되었습니다.', 'success');
                    }
                } else {
                    this.showMessage(
                        `일부 데이터(${result.uploadResults.failed.length}개) 업로드에 실패했습니다. 로컬 데이터는 유지됩니다.`,
                        'warning'
                    );
                }

                // 진행 상태 숨기기
                this.hideMigrationProgress();

                console.log('✅ 마이그레이션 프로세스 완료');
            }
        } catch (error) {
            console.error('❌ 마이그레이션 프로세스 실패:', error);

            // 진행 상태 숨기기
            this.hideMigrationProgress();

            // 오류 메시지
            alert(
                '❌ 데이터 마이그레이션에 실패했습니다.\n\n' +
                error.message + '\n\n' +
                '로컬 데이터는 안전하게 보존되었습니다.'
            );

            this.showMessage('마이그레이션에 실패했습니다. 로컬 데이터는 안전합니다.', 'error');
        }
    }

    /**
     * 마이그레이션 진행 상태 표시
     */
    showMigrationProgress(message, percentage) {
        // 기존 진행 표시기 제거
        this.hideMigrationProgress();

        const progressEl = document.createElement('div');
        progressEl.id = 'migration-progress';
        progressEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            z-index: 2000;
            min-width: 350px;
            text-align: center;
        `;

        progressEl.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 15px;">🔄</div>
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 20px;">데이터 마이그레이션</div>
            <div style="margin-bottom: 15px; color: #666;">${this.escapeHtml(message)}</div>
            <div style="background: #e0e0e0; height: 8px; border-radius: 4px; overflow: hidden;">
                <div id="migration-progress-bar" style="
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                    height: 100%;
                    width: ${percentage}%;
                    transition: width 0.3s ease;
                "></div>
            </div>
            <div style="margin-top: 10px; font-size: 14px; color: #666;">${percentage}%</div>
        `;

        document.body.appendChild(progressEl);
    }

    /**
     * 마이그레이션 진행 상태 숨기기
     */
    hideMigrationProgress() {
        const progressEl = document.getElementById('migration-progress');
        if (progressEl && progressEl.parentNode) {
            progressEl.parentNode.removeChild(progressEl);
        }
    }

    /**
     * 연결 상태 변경 핸들러 (Task 4.9)
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
     */
    handleConnectionStateChange(isOnline) {
        console.log(`🌐 연결 상태 변경: ${isOnline ? '온라인' : '오프라인'}`);

        // 로깅
        this.logger.logAction('connection_state_changed', '연결 상태 변경', {
            isOnline: isOnline,
            timestamp: Date.now()
        });

        if (isOnline) {
            // 온라인 복구
            this.handleOnlineRecovery();
        } else {
            // 오프라인 전환
            this.handleOfflineMode();
        }
    }

    /**
     * 온라인 복구 처리
     * Requirements: 5.3, 5.4
     */
    handleOnlineRecovery() {
        console.log('✅ 온라인 복구됨');

        // 오프라인 인디케이터 숨기기
        this.hideOfflineIndicator();

        // 사용자에게 알림
        this.showMessage('인터넷 연결이 복구되었습니다. 데이터가 자동으로 동기화됩니다.', 'success');

        // Firebase 사용자인 경우 자동 동기화
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        if (authProvider === 'firebase' && this.isFirebaseReady) {
            console.log('🔄 자동 동기화 시작...');

            // Firestore는 자동으로 대기 중인 작업을 동기화함
            // 추가 작업 필요 없음

            this.showMessage('대기 중이던 변경사항이 동기화되었습니다.', 'info');
        }

        // 로깅
        this.logger.logAction('online_recovery', '온라인 복구 및 동기화');
    }

    /**
     * 오프라인 모드 처리
     * Requirements: 5.1, 5.2, 5.5
     */
    handleOfflineMode() {
        console.warn('⚠️ 오프라인 모드로 전환됨');

        // 오프라인 인디케이터 표시
        this.showOfflineIndicator();

        // 사용자에게 알림
        this.showMessage(
            '오프라인 모드입니다. 변경사항은 로컬에 저장되며 온라인 복구 시 자동으로 동기화됩니다.',
            'warning'
        );

        // Firebase 사용자인 경우 오프라인 지원 안내
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        if (authProvider === 'firebase') {
            console.log('💾 오프라인 지원: 변경사항은 로컬에 저장되며 온라인 복구 시 자동 동기화됩니다.');
        }

        // 로깅
        this.logger.logAction('offline_mode', '오프라인 모드 전환');
    }

    /**
     * 오프라인 인디케이터 표시
     * Requirements: 5.1, 5.5
     */
    showOfflineIndicator() {
        // 기존 인디케이터 제거
        this.hideOfflineIndicator();

        // 오프라인 인디케이터 생성
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'offline-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(220, 53, 69, 0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1500;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideDown 0.3s ease-out;
        `;

        indicator.innerHTML = `
            <span style="font-size: 1.2em;">📴</span>
            <span>오프라인 모드</span>
            <span style="font-size: 0.9em; opacity: 0.9;">• 온라인 복구 시 자동 동기화</span>
        `;

        document.body.appendChild(indicator);

        // 애니메이션 추가
        if (!document.getElementById('offline-indicator-style')) {
            const style = document.createElement('style');
            style.id = 'offline-indicator-style';
            style.textContent = `
                @keyframes slideDown {
                    from {
                        transform: translateX(-50%) translateY(-100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        console.log('📴 오프라인 인디케이터 표시됨');
    }

    /**
     * 오프라인 인디케이터 숨기기
     * Requirements: 5.1, 5.5
     */
    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator && indicator.parentNode) {
            indicator.style.animation = 'slideUp 0.3s ease-out';

            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);

            console.log('✅ 오프라인 인디케이터 숨김');
        }
    }

    // ============================================
    // Firebase 에러 처리 개선 (Task 6.3)
    // ============================================

    /**
     * Firebase 에러 처리 및 사용자 친화적 메시지 표시
     * Requirements: 9.1, 9.2, 9.3
     */
    handleFirebaseError(error, context = 'unknown') {
        console.error(`❌ Firebase 오류 (${context}):`, error);

        // 로깅
        this.logger.logAction('firebase_error', 'Firebase 오류 발생', {
            context: context,
            errorCode: error.code,
            errorMessage: error.message
        });

        // 에러 코드별 사용자 친화적 메시지
        const errorInfo = this.getFirebaseErrorInfo(error);

        // 에러 메시지 표시
        this.showFirebaseErrorDialog(errorInfo, context, error);
    }

    /**
     * Firebase 에러 정보 가져오기
     */
    getFirebaseErrorInfo(error) {
        const errorCode = error.code || 'unknown';

        // Firebase Auth 에러
        const authErrors = {
            'auth/popup-closed-by-user': {
                title: '로그인 취소',
                message: '로그인 팝업이 닫혔습니다.',
                solution: '다시 시도하거나 기존 사용자명으로 로그인해주세요.',
                icon: 'ℹ️',
                type: 'info',
                retryable: true
            },
            'auth/popup-blocked': {
                title: '팝업 차단',
                message: '브라우저에서 팝업이 차단되었습니다.',
                solution: '브라우저 설정에서 팝업을 허용한 후 다시 시도해주세요.',
                icon: '🚫',
                type: 'warning',
                retryable: true
            },
            'auth/network-request-failed': {
                title: '네트워크 오류',
                message: '인터넷 연결을 확인할 수 없습니다.',
                solution: '인터넷 연결을 확인한 후 다시 시도해주세요.',
                icon: '📡',
                type: 'error',
                retryable: true
            },
            'auth/unauthorized-domain': {
                title: '도메인 미승인',
                message: '이 도메인은 Firebase에서 승인되지 않았습니다.',
                solution: 'Firebase Console에서 이 도메인을 승인된 도메인에 추가해주세요.',
                icon: '⚙️',
                type: 'error',
                retryable: false
            },
            'auth/operation-not-allowed': {
                title: '로그인 방법 비활성화',
                message: 'Google 로그인이 Firebase에서 활성화되지 않았습니다.',
                solution: 'Firebase Console에서 Google 로그인을 활성화해주세요.',
                icon: '⚙️',
                type: 'error',
                retryable: false
            },
            'auth/user-disabled': {
                title: '계정 비활성화',
                message: '이 계정은 비활성화되었습니다.',
                solution: '관리자에게 문의해주세요.',
                icon: '🚫',
                type: 'error',
                retryable: false
            }
        };

        // Firestore 에러
        const firestoreErrors = {
            'permission-denied': {
                title: '권한 없음',
                message: '이 작업을 수행할 권한이 없습니다.',
                solution: '다시 로그인하거나 관리자에게 문의해주세요.',
                icon: '🔒',
                type: 'error',
                retryable: false
            },
            'not-found': {
                title: '데이터 없음',
                message: '요청한 데이터를 찾을 수 없습니다.',
                solution: '데이터가 삭제되었거나 존재하지 않습니다.',
                icon: '🔍',
                type: 'warning',
                retryable: false
            },
            'unavailable': {
                title: '서비스 일시 중단',
                message: 'Firebase 서비스에 일시적으로 연결할 수 없습니다.',
                solution: '잠시 후 다시 시도해주세요.',
                icon: '⏳',
                type: 'warning',
                retryable: true
            },
            'deadline-exceeded': {
                title: '시간 초과',
                message: '요청 시간이 초과되었습니다.',
                solution: '인터넷 연결을 확인하고 다시 시도해주세요.',
                icon: '⏱️',
                type: 'warning',
                retryable: true
            },
            'resource-exhausted': {
                title: '할당량 초과',
                message: 'Firebase 할당량을 초과했습니다.',
                solution: '잠시 후 다시 시도하거나 관리자에게 문의해주세요.',
                icon: '📊',
                type: 'error',
                retryable: true
            },
            'failed-precondition': {
                title: '조건 불충족',
                message: '작업을 수행하기 위한 조건이 충족되지 않았습니다.',
                solution: '다른 탭에서 이미 사용 중이거나 브라우저가 지원하지 않습니다.',
                icon: '⚠️',
                type: 'warning',
                retryable: false
            }
        };

        // 에러 정보 찾기
        let errorInfo = authErrors[errorCode] || firestoreErrors[errorCode];

        // 기본 에러 정보
        if (!errorInfo) {
            errorInfo = {
                title: '알 수 없는 오류',
                message: error.message || '알 수 없는 오류가 발생했습니다.',
                solution: '문제가 계속되면 페이지를 새로고침하거나 관리자에게 문의해주세요.',
                icon: '❌',
                type: 'error',
                retryable: true
            };
        }

        return errorInfo;
    }

    /**
     * Firebase 에러 다이얼로그 표시
     */
    showFirebaseErrorDialog(errorInfo, context, originalError) {
        // 기존 에러 다이얼로그 제거
        this.hideFirebaseErrorDialog();

        const dialog = document.createElement('div');
        dialog.id = 'firebase-error-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            z-index: 2000;
            min-width: 400px;
            max-width: 500px;
            animation: fadeIn 0.3s ease;
        `;

        // 배경 오버레이
        const overlay = document.createElement('div');
        overlay.id = 'firebase-error-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1999;
            animation: fadeIn 0.3s ease;
        `;

        // 타입별 색상
        const typeColors = {
            'error': '#dc3545',
            'warning': '#ffc107',
            'info': '#17a2b8'
        };

        const color = typeColors[errorInfo.type] || typeColors['error'];

        dialog.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 10px;">${errorInfo.icon}</div>
                <h3 style="color: ${color}; margin: 0 0 10px 0; font-size: 20px;">${this.escapeHtml(errorInfo.title)}</h3>
                <p style="color: #666; margin: 0; font-size: 16px; line-height: 1.5;">${this.escapeHtml(errorInfo.message)}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div style="font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;">💡 해결 방법</div>
                <div style="color: #666; font-size: 14px; line-height: 1.5;">${this.escapeHtml(errorInfo.solution)}</div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: center;">
                ${errorInfo.retryable ? `
                    <button id="firebase-error-retry" class="btn btn-primary" style="flex: 1;">
                        🔄 다시 시도
                    </button>
                ` : ''}
                <button id="firebase-error-close" class="btn btn-secondary" style="flex: 1;">
                    확인
                </button>
            </div>
            
            ${context !== 'unknown' ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0; text-align: center;">
                    <small style="color: #999; font-size: 12px;">컨텍스트: ${this.escapeHtml(context)}</small>
                </div>
            ` : ''}
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        // 이벤트 리스너
        const closeBtn = document.getElementById('firebase-error-close');
        const retryBtn = document.getElementById('firebase-error-retry');

        const closeDialog = () => {
            this.hideFirebaseErrorDialog();
        };

        closeBtn.addEventListener('click', closeDialog);
        overlay.addEventListener('click', closeDialog);

        if (retryBtn && errorInfo.retryable) {
            retryBtn.addEventListener('click', () => {
                closeDialog();
                this.retryFailedOperation(context, originalError);
            });
        }

        console.log('📋 Firebase 에러 다이얼로그 표시됨');
    }

    /**
     * Firebase 에러 다이얼로그 숨기기
     */
    hideFirebaseErrorDialog() {
        const dialog = document.getElementById('firebase-error-dialog');
        const overlay = document.getElementById('firebase-error-overlay');

        if (dialog && dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
        }

        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    /**
     * 실패한 작업 재시도
     */
    async retryFailedOperation(context, originalError) {
        console.log(`🔄 작업 재시도: ${context}`);

        this.logger.logAction('firebase_operation_retry', '작업 재시도', {
            context: context,
            errorCode: originalError.code
        });

        // 컨텍스트별 재시도 로직
        switch (context) {
            case 'login':
            case 'google_login':
                await this.googleLogin();
                break;

            case 'save':
                this.showMessage('저장을 다시 시도해주세요.', 'info');
                break;

            case 'load':
                await this.loadUserData();
                break;

            case 'delete':
                this.showMessage('삭제를 다시 시도해주세요.', 'info');
                break;

            case 'firebase_init':
                await this.initializeFirebase();
                break;

            default:
                this.showMessage('작업을 다시 시도해주세요.', 'info');
        }
    }

    // ============================================
    // 전체 정리 작업
    // ============================================
    cleanup() {
        this.cleanupTempSave();
        // Firebase cleanup is handled automatically
    }
}

// Initialize the application
let dualTextWriter;

document.addEventListener('DOMContentLoaded', () => {
    dualTextWriter = new DualTextWriter();
    dualTextWriter.init(); // 명시적으로 초기화 호출
});

// 페이지 언로드 시 정리 작업
window.addEventListener('beforeunload', () => {
    if (dualTextWriter) {
        dualTextWriter.cleanup();
    }
});

// Add CSS for message animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
`;
document.head.appendChild(style);