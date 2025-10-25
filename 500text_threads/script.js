class DualTextWriter {
    constructor() {
        // 활동 로거 초기화 (먼저 생성)
        this.logger = new ActivityLogger();
        
        // 보안 유틸리티 초기화
        this.securityUtils = new SecurityUtils();
        
        // 설정 및 매니저 초기화 (로거 전달)
        this.config = window.AUTH_CONFIG;
        this.googleAuthManager = new GoogleAuthManager(this.config, this.logger);
        this.migrationManager = new DataMigrationManager(this.config, this.logger);
        
        // Google OAuth 상태
        this.isGoogleReady = false;
        
        // 사용자 인증 관련 요소들
        this.usernameInput = document.getElementById('username-input');
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginForm = document.getElementById('login-form');
        this.userInfo = document.getElementById('user-info');
        this.usernameDisplay = document.getElementById('username-display');
        this.mainContent = document.getElementById('main-content');
        
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
        
        this.init();
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
        
        // 3. Google OAuth 초기화 (향상된 버전)
        await this.initializeGoogleAuth();
        
        // 4. Google Auth 콜백 설정
        this.setupGoogleAuthCallbacks();
        
        // 5. 기존 사용자 확인 및 복원
        this.checkExistingUser();
        
        // 성능 측정 종료
        this.logger.endPerformanceMeasure('app_initialization');
        this.logger.logAction('app_ready', '애플리케이션 초기화 완료');
        
        console.log('✅ DualTextWriter 초기화 완료');
    }
    
    bindEvents() {
        // 사용자 인증 이벤트
        this.loginBtn.addEventListener('click', () => this.login());
        this.logoutBtn.addEventListener('click', () => this.logout());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });
        
        // Google 로그인 이벤트
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', () => this.googleLogin());
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
    
    // Google OAuth 초기화 (향상된 버전 - 로깅 및 폴백 시스템 통합)
    async initializeGoogleAuth() {
        try {
            console.log('🔐 Google OAuth 초기화 시도...');
            this.logger.logAction('auth_init', 'Google OAuth 초기화 시작');
            
            // 오프라인 상태 확인
            if (!navigator.onLine) {
                console.warn('⚠️ 오프라인 상태: Google OAuth 초기화 건너뛰기');
                this.isGoogleReady = false;
                this.enableFallbackSystem('offline');
                return;
            }
            
            // 설정 검증 먼저 수행
            if (!this.config.validateGoogleConfig()) {
                console.warn('⚠️ Google OAuth 설정 검증 실패');
                this.logger.logAction('auth_config_invalid', 'Google OAuth 설정 검증 실패', {
                    validationError: this.config.getValidationError()
                });
                
                this.isGoogleReady = false;
                this.showGoogleSetupNotice();
                this.enableFallbackSystem('config_invalid');
                return;
            }
            
            // GoogleAuthManager 초기화
            this.isGoogleReady = await this.googleAuthManager.initialize();
            
            if (this.isGoogleReady) {
                console.log('✅ Google OAuth 시스템 준비 완료');
                this.logger.logAction('auth_init_success', 'Google OAuth 초기화 성공');
                this.updateGoogleLoginButtonState(true);
                
                // 상태 표시 숨김
                const googleStatus = document.getElementById('google-status');
                if (googleStatus) {
                    googleStatus.style.display = 'none';
                }
            } else {
                console.warn('⚠️ Google OAuth 사용 불가, 기존 방식으로 폴백');
                this.logger.logAction('auth_init_failed', 'Google OAuth 초기화 실패, 폴백 모드');
                this.showGoogleSetupNotice();
                this.enableFallbackSystem('init_failed');
            }
        } catch (error) {
            console.error('❌ Google OAuth 초기화 중 오류:', error);
            this.logger.logAction('auth_init_error', 'Google OAuth 초기화 오류', {
                error: error.message,
                stack: error.stack
            });
            
            this.isGoogleReady = false;
            this.enableFallbackSystem('error');
            this.showGoogleSetupNotice();
        }
    }
    
    // Google Auth 콜백 설정
    setupGoogleAuthCallbacks() {
        this.googleAuthManager.onSignInSuccess = async (userData) => {
            await this.handleGoogleSignInSuccess(userData);
            // 인증 상태 저장
            this.googleAuthManager.saveAuthState(userData);
        };
        
        this.googleAuthManager.onSignInError = (error) => {
            this.handleGoogleSignInError(error);
        };
        
        this.googleAuthManager.onSignOutSuccess = () => {
            this.handleGoogleSignOutSuccess();
        };
        
        // 토큰 갱신 성공 콜백 (콘솔 로그만 출력, 사용자 방해 안 함)
        this.googleAuthManager.onTokenRefresh = (tokenData) => {
            console.log('🔄 토큰 자동 갱신 성공:', new Date(tokenData.refreshTime).toLocaleString());
            console.log('   ├─ 다음 갱신 예정:', new Date(tokenData.expiresAt - 5 * 60 * 1000).toLocaleString());
            console.log('   └─ 만료 시간:', new Date(tokenData.expiresAt).toLocaleString());
            
            // 마지막 활동 시간 업데이트
            this.googleAuthManager.updateLastActivity();
            
            // 로깅
            this.logger.logAction('token_refresh_success', '토큰 자동 갱신 성공', {
                expiresAt: tokenData.expiresAt,
                refreshTime: tokenData.refreshTime
            });
        };
        
        // 토큰 갱신 실패 콜백 (사용자에게 알림)
        this.googleAuthManager.onTokenRefreshError = (error) => {
            console.error('❌ 토큰 갱신 실패:', error);
            
            // 사용자에게 알림 (갱신 실패 시에만)
            this.showMessage(
                '로그인 세션 갱신에 실패했습니다. 잠시 후 다시 로그인해주세요.',
                'warning'
            );
            
            // 로깅
            this.logger.logAction('token_refresh_error', '토큰 갱신 실패', {
                error: error.message || error.toString()
            });
        };
    }
    
    // Google 로그인 처리 (향상된 버전 - 로딩 표시기 추가)
    async googleLogin() {
        if (!this.isGoogleReady) {
            this.showMessage('Google 로그인을 사용할 수 없습니다. 기존 방식으로 로그인해주세요.', 'error');
            return;
        }
        
        // 로딩 표시 시작
        this.showLoadingIndicator('Google 로그인 중...');
        
        try {
            await this.googleAuthManager.signIn();
            // 성공 시 로딩 표시 제거 (콜백에서 처리)
        } catch (error) {
            // 에러는 콜백에서 처리됨
            this.hideLoadingIndicator();
        }
    }
    
    // Google 로그인 성공 처리 (향상된 버전 - DataMigrationManager 통합 및 로깅)
    async handleGoogleSignInSuccess(userData) {
        try {
            console.log('✅ Google 로그인 성공, 후처리 시작...');
            this.logger.logAction('auth_success', 'Google 로그인 성공', {
                userId: userData.email,
                userName: userData.name,
                provider: 'google'
            });
            
            // 1단계: 마이그레이션 필요성 확인
            const migrationInfo = this.migrationManager.checkMigrationNeeded(userData);
            
            if (migrationInfo.needed) {
                console.log('📦 기존 데이터 발견, 마이그레이션 필요');
                this.logger.logAction('migration_needed', '데이터 마이그레이션 필요', {
                    oldUsername: migrationInfo.oldUsername,
                    newEmail: migrationInfo.newEmail,
                    dataCount: migrationInfo.dataCount
                });
                
                // 마이그레이션 진행 표시
                this.showMigrationProgress('checking');
                
                // 사용자 확인
                const shouldMigrate = await this.migrationManager.confirmMigration(migrationInfo);
                
                if (shouldMigrate) {
                    // 마이그레이션 진행 표시
                    this.showMigrationProgress('migrating');
                    this.logger.logAction('migration_start', '데이터 마이그레이션 시작', migrationInfo);
                    
                    try {
                        const migrationResult = await this.migrationManager.performMigration(
                            migrationInfo.oldUsername, 
                            migrationInfo.newEmail
                        );
                        
                        if (migrationResult.success) {
                            // 마이그레이션 완료 표시
                            this.showMigrationProgress('complete');
                            this.logger.logAction('migration_complete', '데이터 마이그레이션 완료', {
                                migrationRecord: migrationResult.migrationRecord
                            });
                            
                            this.showMessage(
                                `데이터 마이그레이션 완료! ${migrationResult.migrationRecord.dataCount}개의 글이 이전되었습니다.`, 
                                'success'
                            );
                            
                            console.log('✅ 마이그레이션 성공:', migrationResult.migrationRecord);
                        }
                    } catch (migrationError) {
                        console.error('❌ 마이그레이션 실패:', migrationError);
                        this.logger.logAction('migration_error', '데이터 마이그레이션 실패', {
                            error: migrationError.message,
                            stack: migrationError.stack
                        });
                        
                        this.showMigrationProgress('error');
                        this.showMessage('데이터 마이그레이션에 실패했습니다. 기존 데이터는 보존되었습니다.', 'error');
                    }
                } else {
                    console.log('ℹ️ 사용자가 마이그레이션을 거부함');
                    this.logger.logAction('migration_declined', '사용자가 마이그레이션 거부');
                }
            }
            
            // 2단계: 사용자 설정
            this.currentUser = userData.email;
            this.saveGoogleUserData(userData);
            
            // 로거에 사용자 ID 설정
            this.logger.setUserId(userData.email);
            
            // 3단계: UI 업데이트
            this.showUserInterface();
            
            // 4단계: 사용자 데이터 로드
            this.loadUserData();
            
            // 5단계: 로딩 표시 제거
            this.hideLoadingIndicator();
            
            // 6단계: 환영 메시지
            this.showMessage(`${userData.name}님, Google 로그인으로 환영합니다!`, 'success');
            
            console.log('✅ Google 로그인 후처리 완료');
            
        } catch (error) {
            console.error('❌ Google 로그인 후처리 실패:', error);
            this.logger.logAction('auth_post_process_error', 'Google 로그인 후처리 실패', {
                error: error.message,
                stack: error.stack
            });
            
            this.hideLoadingIndicator();
            this.showMessage('로그인 후 데이터 처리 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // Google 로그인 실패 처리 (향상된 버전)
    handleGoogleSignInError(error) {
        console.error('Google 로그인 실패:', error);
        
        // GoogleAuthManager에서 생성한 사용자 친화적 메시지 사용
        const message = error.message || 'Google 로그인에 실패했습니다.';
        
        // 오류 유형에 따라 메시지 타입 결정
        let messageType = 'error';
        
        if (error.error === 'popup_closed_by_user') {
            messageType = 'info'; // 사용자 취소는 오류가 아님
        } else if (error.type === 'network') {
            messageType = 'warning';
        }
        
        this.showMessage(message, messageType);
    }
    
    // Google 로그아웃 성공 처리
    handleGoogleSignOutSuccess() {
        console.log('Google 로그아웃 완료');
    }
    
    // Google 사용자 데이터 저장
    saveGoogleUserData(userData) {
        // 이메일 검증 (보안 강화)
        if (!this.securityUtils.isValidEmail(userData.email)) {
            console.error('❌ 유효하지 않은 이메일 형식:', userData.email);
            this.logger.logAction('invalid_email', '유효하지 않은 이메일', {
                email: userData.email
            });
            return;
        }
        
        const secureData = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            picture: userData.picture,
            provider: userData.provider || 'google',
            loginTime: userData.loginTime
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
        localStorage.setItem('dualTextWriter_authProvider', 'google');
    }
    
    // 사용자 인증 관련 메서드들
    checkExistingUser() {
        const savedUser = localStorage.getItem('dualTextWriter_currentUser');
        const authProvider = localStorage.getItem('dualTextWriter_authProvider');
        
        if (savedUser) {
            this.currentUser = savedUser;
            this.showUserInterface();
            this.loadUserData();
            
            // Google 사용자인 경우 토큰 유효성 확인
            if (authProvider === 'google') {
                this.validateGoogleToken();
            }
        } else {
            this.showLoginInterface();
        }
    }
    
    login() {
        const username = this.usernameInput.value.trim();
        
        // 사용자명 검증 (보안 강화)
        const validation = this.securityUtils.validateUsername(username);
        if (!validation.valid) {
            alert(validation.error);
            this.usernameInput.focus();
            return;
        }
        
        this.logger.logAction('auth_username_login', '사용자명 로그인', {
            username: username,
            provider: 'username'
        });
        
        this.currentUser = username;
        this.logger.setUserId(username);
        
        localStorage.setItem('dualTextWriter_currentUser', username);
        this.showUserInterface();
        this.loadUserData();
        
        // 사용자 이름 안전 처리 (XSS 방지)
        const safeName = this.securityUtils.sanitizeUserName(username);
        this.showMessage(`${safeName}님, 환영합니다!`, 'success');
    }
    
    async logout() {
        if (confirm('로그아웃하시겠습니까? 현재 작성 중인 내용은 임시 저장됩니다.')) {
            // 로딩 표시 시작
            this.showLoadingIndicator('로그아웃 중...');
            
            this.performTempSave(); // 로그아웃 전 임시 저장
            
            // Google 사용자인 경우 Google 로그아웃도 처리
            const authProvider = localStorage.getItem('dualTextWriter_authProvider');
            if (authProvider === 'google' && this.isGoogleReady) {
                try {
                    await this.googleAuthManager.signOut();
                } catch (error) {
                    console.warn('Google 로그아웃 실패:', error);
                }
            }
            
            this.currentUser = null;
            localStorage.removeItem('dualTextWriter_currentUser');
            localStorage.removeItem('dualTextWriter_userData');
            localStorage.removeItem('dualTextWriter_authProvider');
            
            // 로딩 표시 제거
            this.hideLoadingIndicator();
            
            this.showLoginInterface();
            this.clearAllData();
            this.showMessage('로그아웃되었습니다.', 'info');
        }
    }
    
    // Google 토큰 유효성 검증 (향상된 버전)
    async validateGoogleToken() {
        if (!this.isGoogleReady) return;
        
        try {
            const isValid = this.googleAuthManager.validateToken();
            
            if (!isValid) {
                // 토큰이 만료된 경우 자동 로그아웃
                console.warn('⚠️ 토큰이 유효하지 않습니다.');
                this.showMessage('로그인 세션이 만료되었습니다. 다시 로그인해주세요.', 'warning');
                await this.logout();
                return;
            }
            
            // 토큰이 유효한 경우 사용자 정보 업데이트
            const currentUser = this.googleAuthManager.getCurrentUser();
            if (currentUser) {
                this.saveGoogleUserData(currentUser);
                // 마지막 활동 시간 업데이트
                this.googleAuthManager.updateLastActivity();
            }
            
        } catch (error) {
            console.warn('토큰 검증 실패:', error);
            this.showMessage('인증 상태를 확인할 수 없습니다. 다시 로그인해주세요.', 'warning');
        }
    }
    
    showLoginInterface() {
        this.loginForm.style.display = 'block';
        this.userInfo.style.display = 'none';
        this.mainContent.style.display = 'none';
    }
    
    // 마이그레이션 상태 확인 (디버깅용)
    checkMigrationStatus() {
        const status = this.migrationManager.getMigrationStatus();
        console.log('📋 마이그레이션 상태:', status);
        return status;
    }
    
    showUserInterface() {
        this.loginForm.style.display = 'none';
        this.userInfo.style.display = 'block';
        this.mainContent.style.display = 'block';
        
        // 사용자 정보 표시 (Google 사용자인 경우 이름 표시)
        // 안전한 데이터 로드 및 검증
        const userData = this.securityUtils.safeLoadFromStorage(
            'dualTextWriter_userData',
            {},
            (data) => this.securityUtils.validateUserData(data)
        );
        
        // 사용자 이름 안전 처리 (XSS 방지)
        const displayName = userData?.name || this.currentUser;
        this.usernameDisplay.textContent = this.securityUtils.sanitizeUserName(displayName);
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
    
    saveText(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
        const panelName = panel === 'ref' ? '레퍼런스 글' : '수정/작성 글';
        
        if (text.length === 0) {
            alert('저장할 내용이 없습니다.');
            return;
        }
        
        const savedItem = {
            id: Date.now() + (panel === 'edit' ? 1 : 0), // 편집 글은 ID를 다르게
            content: text,
            date: new Date().toLocaleString('ko-KR'),
            characterCount: this.getKoreanCharacterCount(text),
            type: panel === 'ref' ? 'reference' : 'edit'
        };
        
        this.savedTexts.unshift(savedItem);
        this.saveToLocalStorage();
        this.renderSavedTexts();
        
        // 로깅
        this.logger.logAction('text_saved', `${panelName} 저장`, {
            panel: panel,
            characterCount: savedItem.characterCount,
            textId: savedItem.id
        });
        
        this.showMessage(`${panelName}이 저장되었습니다!`, 'success');
        
        // Clear input
        textInput.value = '';
        this.updateCharacterCount(panel);
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
        
        this.showMessage(`${panelName} 글 TXT 파일이 다운로드되었습니다!`, 'success');
    }
    
    renderSavedTexts() {
        if (this.savedTexts.length === 0) {
            this.savedList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">저장된 글이 없습니다.</p>';
            return;
        }
        
        this.savedList.innerHTML = this.savedTexts.map((item, index) => `
            <div class="saved-item ${index === 0 ? 'new' : ''}">
                <div class="saved-item-header">
                    <span class="saved-item-date">${item.date}</span>
                    <span class="saved-item-count">${item.characterCount}자</span>
                    <span class="saved-item-type">${item.type === 'reference' ? '📖 레퍼런스' : '✏️ 수정작성'}</span>
                </div>
                <div class="saved-item-content">${this.escapeHtml(item.content)}</div>
                <div class="saved-item-actions">
                    <button class="btn-small btn-edit" onclick="dualTextWriter.editText(${item.id}, '${item.type}')">편집</button>
                    <button class="btn-small btn-delete" onclick="dualTextWriter.deleteText(${item.id})">삭제</button>
                </div>
            </div>
        `).join('');
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
        
        // 기존 사용자명 로그인 섹션 강조
        this.highlightFallbackLogin();
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
    
    // 기존 사용자명 로그인 섹션 강조
    highlightFallbackLogin() {
        const legacyLoginSection = document.querySelector('.legacy-login-section');
        if (legacyLoginSection) {
            legacyLoginSection.classList.add('highlighted');
            
            // 3초 후 강조 제거
            setTimeout(() => {
                legacyLoginSection.classList.remove('highlighted');
            }, 3000);
        }
    }
    
    // 6.2 네트워크 상태 모니터링 구현
    setupNetworkMonitoring() {
        console.log('📡 네트워크 상태 모니터링 시작...');
        
        // 초기 네트워크 상태 확인
        this.checkNetworkStatus();
        
        // online 이벤트 리스너
        window.addEventListener('online', () => {
            console.log('✅ 네트워크 연결 복구됨');
            this.handleNetworkOnline();
        });
        
        // offline 이벤트 리스너
        window.addEventListener('offline', () => {
            console.warn('⚠️ 네트워크 연결 끊김');
            this.handleNetworkOffline();
        });
        
        this.logger.logAction('network_monitoring_started', '네트워크 모니터링 시작');
    }
    
    // 네트워크 상태 확인
    checkNetworkStatus() {
        if (!navigator.onLine) {
            console.warn('⚠️ 오프라인 상태 감지');
            this.handleNetworkOffline();
        }
    }
    
    // 온라인 복구 시 처리
    async handleNetworkOnline() {
        this.logger.logAction('network_online', '네트워크 연결 복구');
        
        // 사용자에게 알림
        this.showMessage('인터넷 연결이 복구되었습니다. Google 로그인을 사용할 수 있습니다.', 'success');
        
        // Google OAuth 재활성화 시도
        if (!this.isGoogleReady) {
            console.log('🔄 Google OAuth 재초기화 시도...');
            await this.initializeGoogleAuth();
            
            if (this.isGoogleReady) {
                // Google 로그인 버튼 활성화
                this.updateGoogleLoginButtonState(true);
                
                // 상태 표시 숨김
                const googleStatus = document.getElementById('google-status');
                if (googleStatus) {
                    googleStatus.style.display = 'none';
                }
                
                console.log('✅ Google OAuth 재활성화 완료');
            }
        }
    }
    
    // 오프라인 시 처리
    handleNetworkOffline() {
        this.logger.logAction('network_offline', '네트워크 연결 끊김');
        
        // 폴백 시스템 활성화
        this.enableFallbackSystem('offline');
        
        // 사용자에게 명확한 안내
        this.showMessage(
            '오프라인 모드입니다. 기존 사용자명으로 로그인하여 계속 사용할 수 있습니다.',
            'warning'
        );
    }
    
    // 6.3 폴백 시스템 기능 검증
    verifyFallbackSystem() {
        console.group('🔍 폴백 시스템 기능 검증');
        
        const verificationResults = {
            usernameLogin: false,
            dataSave: false,
            dataLoad: false,
            coreFunctions: false
        };
        
        try {
            // 1. 기존 사용자명 로그인 정상 작동 확인
            const usernameInput = document.getElementById('username-input');
            const loginBtn = document.getElementById('login-btn');
            verificationResults.usernameLogin = !!(usernameInput && loginBtn && !loginBtn.disabled);
            console.log(`✓ 사용자명 로그인: ${verificationResults.usernameLogin ? '정상' : '오류'}`);
            
            // 2. 데이터 저장 기능 확인
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
            
            // 3. 핵심 기능 확인
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
    // 전체 정리 작업
    // ============================================
    cleanup() {
        this.cleanupTempSave();
        this.googleAuthManager.cleanup();
        this.migrationManager.cleanup();
    }
}

// Initialize the application
let dualTextWriter;

document.addEventListener('DOMContentLoaded', () => {
    dualTextWriter = new DualTextWriter();
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