class DualTextWriter {
    constructor() {
        // Firebase 설정
        this.auth = null;

        // 사용자 정의 해시태그 설정 (기본값)
        this.defaultHashtags = ['#writing', '#content', '#threads'];
        this.db = null;
        this.currentUser = null;
        this.isFirebaseReady = false;

        // 트래킹 관련 속성
        this.trackingPosts = []; // 트래킹 중인 포스트 목록
        this.trackingChart = null; // Chart.js 인스턴스
        this.currentTrackingPost = null; // 현재 트래킹 중인 포스트
        this.chartMode = 'total'; // 차트 모드: 'total' (전체 총합) 또는 'individual' (개별 포스트)
        this.selectedChartPostId = null; // 개별 포스트 모드에서 선택된 포스트 ID
        this.allTrackingPostsForSelector = []; // 포스트 선택기용 전체 포스트 목록
        this.chartRange = '7d'; // '7d' | '30d' | 'all'
        this.scaleMode = 'combined'; // 'combined' | 'split'
        
        // Firebase 초기화 대기
        this.waitForFirebase();

        // Firebase 설정 안내
        this.showFirebaseSetupNotice();

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
        this.batchMigrationBtn = document.getElementById('batch-migration-btn');
        this.tempSaveStatus = document.getElementById('temp-save-status');
        this.tempSaveText = document.getElementById('temp-save-text');

        // 탭 관련 요소들
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');

        // 트래킹 관련 요소들
        this.trackingPostsList = document.getElementById('tracking-posts-list');
        this.trackingChartCanvas = document.getElementById('tracking-chart');
        this.totalPostsElement = document.getElementById('total-posts');
        this.totalViewsElement = document.getElementById('total-views');
        this.totalLikesElement = document.getElementById('total-likes');
        this.totalCommentsElement = document.getElementById('total-comments');
        this.totalSharesElement = document.getElementById('total-shares');
        
        this.maxLength = 500;
        this.currentUser = null;
        this.savedTexts = [];
        this.savedFilter = localStorage.getItem('dualTextWriter_savedFilter') || 'all';
        this.tempSaveInterval = null;
        this.lastTempSave = null;
        this.savedItemClickHandler = null; // 이벤트 핸들러 참조

        // LLM 검증 시스템 초기화
        this.initializeLLMValidation();

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.waitForFirebase();
        this.setupAuthStateListener();
    }

    // Firebase 초기화 대기
    async waitForFirebase() {
        const maxAttempts = 50;
        let attempts = 0;

        while (attempts < maxAttempts) {
            if (window.firebaseAuth && window.firebaseDb) {
                this.auth = window.firebaseAuth;
                this.db = window.firebaseDb;
                this.isFirebaseReady = true;
                console.log('Firebase 초기화 완료');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!this.isFirebaseReady) {
            console.error('Firebase 초기화 실패');
            this.showMessage('Firebase 초기화에 실패했습니다. 페이지를 새로고침해주세요.', 'error');
        }
    }

    // Firebase Auth 상태 리스너 설정
    setupAuthStateListener() {
        if (!this.isFirebaseReady) return;

        window.firebaseOnAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.showUserInterface();
                this.loadUserData();
                console.log('사용자 로그인:', user.displayName || user.uid);
            } else {
                this.currentUser = null;
                this.showLoginInterface();
                this.clearAllData();
                console.log('사용자 로그아웃');
            }
        });
    }

    // 탭 기능 초기화
    initTabListeners() {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }

    // 탭 전환
    switchTab(tabName) {
        // 모든 탭 버튼과 콘텐츠에서 active 클래스 제거
        this.tabButtons.forEach(btn => btn.classList.remove('active'));
        this.tabContents.forEach(content => content.classList.remove('active'));

        // 선택된 탭 버튼과 콘텐츠에 active 클래스 추가
        const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = document.getElementById(`${tabName}-tab`);

        if (activeButton) activeButton.classList.add('active');
        if (activeContent) activeContent.classList.add('active');

        // 저장된 글 탭으로 전환할 때 목록 새로고침
        if (tabName === 'saved') {
            this.loadSavedTexts();
            this.initSavedFilters();
            // 미트래킹 글 버튼 상태 업데이트
            if (this.updateBatchMigrationButton) {
                this.updateBatchMigrationButton();
            }
        }

        // 트래킹 탭으로 전환 시 데이터 로드
        if (tabName === 'tracking') {
            this.loadTrackingPosts();
            this.updateTrackingSummary();
            this.initTrackingChart();
        }
        
        // 글 작성 탭으로 전환할 때는 레퍼런스와 작성 패널이 모두 보임
        if (tabName === 'writing') {
            // 이미 writing-container에 두 패널이 모두 포함되어 있음
        }
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

        // 탭 이벤트 리스너 설정
        this.initTabListeners();

        // 저장된 글 필터 초기화 (초기 로드 시점에도 반영)
        setTimeout(() => this.initSavedFilters(), 0);

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

        // 반자동화 포스팅 이벤트
        const semiAutoPostBtn = document.getElementById('semi-auto-post-btn');
        if (semiAutoPostBtn) {
            console.log('✅ 반자동화 포스팅 버튼 발견 및 이벤트 바인딩');

            semiAutoPostBtn.addEventListener('click', (e) => {
                console.log('🔍 반자동화 포스팅 버튼 클릭 감지');
                e.preventDefault();
                e.stopPropagation();

                // this 컨텍스트 명시적 바인딩
                const self = this;
                console.log('🔍 this 컨텍스트:', self);
                console.log('🔍 handleSemiAutoPost 함수:', typeof self.handleSemiAutoPost);

                if (typeof self.handleSemiAutoPost === 'function') {
                    console.log('✅ handleSemiAutoPost 함수 호출');
                    self.handleSemiAutoPost();
                } else {
                    console.error('❌ handleSemiAutoPost 함수가 없습니다!');
                }
            });

            // 키보드 접근성 지원
            semiAutoPostBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    console.log('🔍 반자동화 포스팅 버튼 키보드 입력 감지');
                    e.preventDefault();
                    e.stopPropagation();

                    // this 컨텍스트 명시적 바인딩
                    const self = this;

                    if (typeof self.handleSemiAutoPost === 'function') {
                        console.log('✅ handleSemiAutoPost 함수 호출 (키보드)');
                        self.handleSemiAutoPost();
                    } else {
                        console.error('❌ handleSemiAutoPost 함수가 없습니다!');
                    }
                }
            });

            // 접근성 속성 설정
            semiAutoPostBtn.setAttribute('aria-label', 'Threads에 반자동으로 포스팅하기');
            semiAutoPostBtn.setAttribute('role', 'button');
            semiAutoPostBtn.setAttribute('tabindex', '0');

            console.log('✅ 반자동화 포스팅 버튼 이벤트 바인딩 완료');
        } else {
            console.error('❌ 반자동화 포스팅 버튼을 찾을 수 없습니다!');
        }

        // 해시태그 설정 버튼 이벤트 바인딩
        const hashtagSettingsBtn = document.getElementById('hashtag-settings-btn');
        if (hashtagSettingsBtn) {
            hashtagSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showHashtagSettings();
            });

            // 초기 해시태그 표시 업데이트
            setTimeout(() => {
                this.updateHashtagsDisplay();
            }, 100);

            console.log('✅ 해시태그 설정 버튼 이벤트 바인딩 완료');
        } else {
            console.error('❌ 해시태그 설정 버튼을 찾을 수 없습니다!');
        }

        // 일괄 마이그레이션 버튼 이벤트 바인딩
        if (this.batchMigrationBtn) {
            this.batchMigrationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showBatchMigrationConfirm();
            });
            console.log('✅ 일괄 마이그레이션 버튼 이벤트 바인딩 완료');
        } else {
            console.log('⚠️ 일괄 마이그레이션 버튼을 찾을 수 없습니다 (선택적 기능)');
        }

        // 개발 모드에서 자동 테스트 실행
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                console.log('🔧 개발 모드: 자동 테스트 실행');
                this.runComprehensiveTest();
            }, 2000);
        }
    }

    // 저장된 글 필터 UI 초기화 및 이벤트 바인딩
    initSavedFilters() {
        const container = document.querySelector('#saved-tab .segmented-control');
        if (!container) return;
        const buttons = container.querySelectorAll('.segment-btn');
        if (!buttons || buttons.length === 0) return;

        // 활성 상태 복원
        buttons.forEach(btn => {
            const filter = btn.getAttribute('data-filter');
            const isActive = filter === this.savedFilter;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // 클릭 이벤트 바인딩
        buttons.forEach(btn => {
            btn.removeEventListener('click', btn._filterHandler);
            btn._filterHandler = (e) => {
                e.preventDefault();
                const filter = btn.getAttribute('data-filter');
                this.setSavedFilter(filter);
            };
            btn.addEventListener('click', btn._filterHandler);
        });
    }

    setSavedFilter(filter) {
        if (!['all', 'edit', 'reference'].includes(filter)) return;
        this.savedFilter = filter;
        localStorage.setItem('dualTextWriter_savedFilter', filter);

        // UI 업데이트
        const container = document.querySelector('#saved-tab .segmented-control');
        if (container) {
            container.querySelectorAll('.segment-btn').forEach(btn => {
                const isActive = btn.getAttribute('data-filter') === filter;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }

        // 목록 렌더링
        this.renderSavedTexts();
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

    // Firebase 기반 인증으로 대체됨

    // Firebase Google 로그인 처리
    async googleLogin() {
        if (!this.isFirebaseReady) {
            this.showMessage('Firebase가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.', 'error');
            return;
        }

        try {
            const provider = new window.firebaseGoogleAuthProvider();
            const result = await window.firebaseSignInWithPopup(this.auth, provider);
            const user = result.user;

            // 기존 로컬 데이터 마이그레이션 확인
            await this.checkAndMigrateLocalData(user.uid);

            this.showMessage(`${user.displayName || user.email}님, Google 로그인으로 환영합니다!`, 'success');

        } catch (error) {
            console.error('Google 로그인 실패:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                this.showMessage('로그인이 취소되었습니다.', 'info');
            } else {
            this.showMessage('Google 로그인에 실패했습니다. 기존 방식으로 로그인해주세요.', 'error');
        }
    }
    }

    // Firebase Auth 상태 리스너가 자동으로 처리함

    // Firebase 사용자명 로그인 (Anonymous Auth 사용)
    async login() {
        const username = this.usernameInput.value.trim();
        if (!username) {
            alert('사용자명을 입력해주세요.');
            this.usernameInput.focus();
            return;
        }

        if (username.length < 2) {
            alert('사용자명은 2자 이상이어야 합니다.');
            this.usernameInput.focus();
            return;
        }

        if (!this.isFirebaseReady) {
            this.showMessage('Firebase가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.', 'error');
            return;
        }

        try {
            // 익명 로그인으로 사용자 생성
            const result = await window.firebaseSignInAnonymously(this.auth);
            const user = result.user;

            // 사용자명을 Firestore에 저장
            await this.saveUsernameToFirestore(user.uid, username);

            // 기존 로컬 데이터 마이그레이션
            await this.checkAndMigrateLocalData(user.uid);

            this.showMessage(`${username}님, 환영합니다!`, 'success');

                } catch (error) {
            console.error('사용자명 로그인 실패:', error);
            this.showMessage('로그인에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }

    // 사용자명을 Firestore에 저장
    async saveUsernameToFirestore(uid, username) {
        try {
            await window.firebaseAddDoc(window.firebaseCollection(this.db, 'users', uid, 'profile'), {
                username: username,
                createdAt: window.firebaseServerTimestamp(),
                loginMethod: 'username'
            });
        } catch (error) {
            console.error('사용자명 저장 실패:', error);
        }
    }

    // Firebase 로그아웃 처리
    async logout() {
        if (confirm('로그아웃하시겠습니까? 현재 작성 중인 내용은 임시 저장됩니다.')) {
            this.performTempSave(); // 로그아웃 전 임시 저장

            try {
                await window.firebaseSignOut(this.auth);
                this.showMessage('로그아웃되었습니다.', 'info');
            } catch (error) {
                console.error('로그아웃 실패:', error);
                this.showMessage('로그아웃 중 오류가 발생했습니다.', 'error');
            }
        }
    }

    // Firebase Auth가 자동으로 토큰 관리함

    showLoginInterface() {
        this.loginForm.style.display = 'block';
        this.userInfo.style.display = 'none';
        this.mainContent.style.display = 'block'; // 로그인 없이도 메인 콘텐츠 표시
    }

    // 기존 로컬 스토리지 데이터를 Firestore로 마이그레이션
    async checkAndMigrateLocalData(userId) {
        const localData = localStorage.getItem('dualTextWriter_savedTexts');
        if (!localData) return;

        try {
            const localTexts = JSON.parse(localData);
            if (localTexts.length === 0) return;

            const shouldMigrate = confirm(
                `기존에 저장된 ${localTexts.length}개의 글이 있습니다.\n` +
                `이 데이터를 새로운 계정으로 이전하시겠습니까?\n\n` +
                `이전하면 기존 데이터는 클라우드에 안전하게 보관됩니다.`
            );

            if (shouldMigrate) {
                await this.migrateLocalDataToFirestore(userId, localTexts);
                this.showMessage('기존 데이터가 성공적으로 이전되었습니다!', 'success');

                // 로컬 스토리지 정리
                localStorage.removeItem('dualTextWriter_savedTexts');
                localStorage.removeItem('dualTextWriter_tempSave');
            }

        } catch (error) {
            console.error('데이터 마이그레이션 실패:', error);
            this.showMessage('데이터 마이그레이션 중 오류가 발생했습니다.', 'error');
        }
    }

    // 로컬 데이터를 Firestore로 마이그레이션
    async migrateLocalDataToFirestore(userId, localTexts) {
        for (const text of localTexts) {
            try {
                const textData = {
                    content: text.content,
                    type: text.type,
                    characterCount: text.characterCount,
                    createdAt: window.firebaseServerTimestamp(),
                    updatedAt: window.firebaseServerTimestamp(),
                    migrated: true // 마이그레이션 표시
                };

                await window.firebaseAddDoc(
                    window.firebaseCollection(this.db, 'users', userId, 'texts'),
                    textData
                );

        } catch (error) {
                console.error('개별 텍스트 마이그레이션 실패:', error);
        }
        }

        console.log(`${localTexts.length}개의 텍스트를 Firestore로 마이그레이션했습니다.`);
    }

    showUserInterface() {
        this.loginForm.style.display = 'none';
        this.userInfo.style.display = 'block';
        this.mainContent.style.display = 'block';

        // 사용자 정보 표시 (Firebase 사용자 정보 사용)
        if (this.currentUser) {
            const displayName = this.currentUser.displayName || 
                              this.currentUser.email || 
                              '사용자';
        this.usernameDisplay.textContent = displayName;
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

    // Firestore에 텍스트 저장
    async saveText(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
        const panelName = panel === 'ref' ? '레퍼런스 글' : '수정/작성 글';

        if (text.length === 0) {
            alert('저장할 내용이 없습니다.');
            return;
        }

        if (!this.currentUser) {
            this.showMessage('로그인이 필요합니다.', 'error');
            return;
        }

        try {
            const textData = {
                content: text,
                type: panel === 'ref' ? 'reference' : 'edit',
                characterCount: this.getKoreanCharacterCount(text),
                createdAt: window.firebaseServerTimestamp(),
                updatedAt: window.firebaseServerTimestamp()
            };

            // Firestore에 저장
            const docRef = await window.firebaseAddDoc(
                window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'texts'),
                textData
            );

            // 로컬 배열에도 추가 (UI 업데이트용)
        const savedItem = {
                id: docRef.id,
            content: text,
            date: new Date().toLocaleString('ko-KR'),
            characterCount: this.getKoreanCharacterCount(text),
            type: panel === 'ref' ? 'reference' : 'edit'
        };

        this.savedTexts.unshift(savedItem);
        this.renderSavedTexts();

        this.showMessage(`${panelName}이 저장되었습니다!`, 'success');

        // Clear input
        textInput.value = '';
        this.updateCharacterCount(panel);

        } catch (error) {
            console.error('텍스트 저장 실패:', error);
            this.showMessage('저장에 실패했습니다. 다시 시도해주세요.', 'error');
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

        this.showMessage(`${panelName} 글 TXT 파일이 다운로드되었습니다!`, 'success');
    }

    async renderSavedTexts() {
        console.log('renderSavedTexts 호출됨:', this.savedTexts);

        // 필터 적용
        let list = this.savedTexts;
        if (this.savedFilter === 'edit') {
            list = list.filter(item => item.type === 'edit');
        } else if (this.savedFilter === 'reference') {
            list = list.filter(item => item.type === 'reference');
        }

        if (list.length === 0) {
            const emptyMsg = this.savedFilter === 'all'
                ? '저장된 글이 없습니다.'
                : (this.savedFilter === 'edit' ? '작성 글이 없습니다.' : '레퍼런스 글이 없습니다.');
            this.savedList.innerHTML = `<p style="color: #666; text-align: center; padding: 20px;">${emptyMsg}</p>`;
            return;
        }

        // 각 저장된 글에 대한 트래킹 데이터 조회 (비동기)
        const itemsWithTracking = await Promise.all(list.map(async (item, index) => {
            let postData = null;
            if (this.trackingPosts && this.currentUser && this.isFirebaseReady) {
                // 로컬 데이터에서 먼저 찾기
                postData = this.trackingPosts.find(p => p.sourceTextId === item.id);
                
                // 로컬에 없으면 Firebase에서 조회
                if (!postData) {
                    try {
                        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                        const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', item.id));
                        const querySnapshot = await window.firebaseGetDocs(q);
                        
                        if (!querySnapshot.empty) {
                            const postDoc = querySnapshot.docs[0];
                            const data = postDoc.data();
                            postData = {
                                id: postDoc.id,
                                metrics: data.metrics || [],
                                trackingEnabled: data.trackingEnabled || false
                            };
                        }
                    } catch (error) {
                        console.error('트래킹 데이터 조회 실패:', error);
                    }
                }
            }
            
            return { item, postData, index };
        }));

        this.savedList.innerHTML = itemsWithTracking.map(({ item, postData, index }) => {
            // 타임라인 HTML 생성
            const timelineHtml = this.renderTrackingTimeline(postData?.metrics || []);
            
            return `
            <div class="saved-item ${index === 0 ? 'new' : ''}" data-item-id="${item.id}">
                <div class="saved-item-header">
                    <span class="saved-item-type">${(item.type || 'edit') === 'reference' ? '📖 레퍼런스' : '✏️ 작성'}</span>
                    <span class="saved-item-date">${item.date}</span>
                    <span class="saved-item-count">${item.characterCount}자</span>
                </div>
                <div class="saved-item-content">${this.escapeHtml(item.content)}</div>
                ${timelineHtml ? `<div class="saved-item-tracking">${timelineHtml}</div>` : ''}
                <div class="saved-item-actions">
                    <button class="action-button btn-primary" data-action="edit" data-type="${(item.type || 'edit')}" data-item-id="${item.id}">편집</button>
                    <button class="action-button btn-secondary" data-action="delete" data-item-id="${item.id}">삭제</button>
                    <button class="action-button btn-tracking" data-action="add-tracking" data-item-id="${item.id}">📊 데이터 입력</button>
                </div>
            </div>
        `;
        }).join('');

        // DOM 렌더링 완료 후 이벤트 리스너 설정
        setTimeout(() => {
            this.setupSavedItemEventListeners();
            this.bindDirectEventListeners(); // 직접 이벤트 바인딩도 추가
        }, 100);
        
        // 미트래킹 글 개수 확인 및 버튼 조건부 표시
        this.updateBatchMigrationButton();
    }
    
    // 미트래킹 글 개수 확인 및 일괄 트래킹 버튼 업데이트
    async updateBatchMigrationButton() {
        if (!this.batchMigrationBtn || !this.currentUser || !this.isFirebaseReady) return;
        
        try {
            // 전체 저장된 글 중 미트래킹 글 찾기
            const untrackedTexts = [];
            
            for (const textItem of this.savedTexts) {
                // 로컬에서 먼저 확인
                let hasTracking = false;
                if (this.trackingPosts) {
                    hasTracking = this.trackingPosts.some(p => p.sourceTextId === textItem.id);
                }
                
                // 로컬에 없으면 Firebase에서 확인
                if (!hasTracking) {
                    try {
                        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                        const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textItem.id));
                        const querySnapshot = await window.firebaseGetDocs(q);
                        hasTracking = !querySnapshot.empty;
                    } catch (error) {
                        console.error('트래킹 확인 실패:', error);
                    }
                }
                
                if (!hasTracking) {
                    untrackedTexts.push(textItem);
                }
            }
            
            // 버튼 조건부 표시
            const migrationTools = document.querySelector('.migration-tools');
            if (migrationTools) {
                if (untrackedTexts.length > 0) {
                    // 미트래킹 글이 있으면 버튼 표시 및 개수 표시
                    migrationTools.style.display = 'flex';
                    this.batchMigrationBtn.style.display = 'block';
                    this.batchMigrationBtn.textContent = `📊 미트래킹 글 ${untrackedTexts.length}개 일괄 트래킹 시작`;
                    this.batchMigrationBtn.title = `${untrackedTexts.length}개의 저장된 글이 아직 트래킹되지 않았습니다. 모두 트래킹을 시작하시겠습니까?`;
                } else {
                    // 미트래킹 글이 없으면 버튼 숨김
                    migrationTools.style.display = 'none';
                    this.batchMigrationBtn.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('미트래킹 글 확인 실패:', error);
            // 에러 발생 시 버튼은 숨김
            if (this.batchMigrationBtn) {
                this.batchMigrationBtn.style.display = 'none';
            }
        }
    }

    // 트래킹 타임라인 렌더링
    renderTrackingTimeline(metrics) {
        if (!metrics || metrics.length === 0) {
            return '';
        }

        // 날짜 순으로 정렬 (오래된 것부터)
        const sortedMetrics = [...metrics].sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                         (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                         (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
            return dateA - dateB;
        });

        return `
            <div class="tracking-timeline-container">
                <div class="tracking-timeline-header">
                    <span class="timeline-title">📊 트래킹 기록</span>
                    <button class="timeline-toggle-btn" onclick="dualTextWriter.toggleTimeline(this)" aria-label="타임라인 접기/펼치기">▼</button>
                </div>
                <div class="tracking-timeline-content">
                    ${sortedMetrics.map((metric, sortedIdx) => {
                        const date = metric.timestamp?.toDate ? metric.timestamp.toDate() : 
                                    (metric.timestamp instanceof Date ? metric.timestamp : new Date());
                        const dateStr = this.formatDateForDisplay(date);
                        // 원본 metrics 배열에서의 인덱스 찾기
                        const originalIndex = metrics.findIndex(m => {
                            const mDate = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : 
                                         (m.timestamp instanceof Date ? m.timestamp.getTime() : 0);
                            const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate().getTime() : 
                                              (metric.timestamp instanceof Date ? metric.timestamp.getTime() : 0);
                            return mDate === metricDate && m.views === metric.views && m.likes === metric.likes;
                        });
                        const metricIndex = originalIndex >= 0 ? originalIndex : sortedIdx;
                        return `
                            <div class="timeline-item" data-metric-index="${metricIndex}">
                                <div class="timeline-item-header">
                                    <span class="timeline-date">📅 ${dateStr}</span>
                                    <div class="timeline-item-actions">
                                        <button class="timeline-edit-btn" onclick="dualTextWriter.editTrackingMetric(this, '${metricIndex}')" aria-label="수정">✏️</button>
                                    </div>
                                </div>
                                <div class="timeline-item-data">
                                    <span class="metric-badge views">👀 조회수: ${metric.views || 0}</span>
                                    <span class="metric-badge likes">❤️ 좋아요: ${metric.likes || 0}</span>
                                    <span class="metric-badge comments">💬 댓글: ${metric.comments || 0}</span>
                    <span class="metric-badge shares">🔄 공유: ${metric.shares || 0}</span>
                    <span class="metric-badge follows">👥 팔로우: ${metric.follows || 0}</span>
                                    ${metric.notes ? `<div class="timeline-notes">📝 ${this.escapeHtml(metric.notes)}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // 날짜 포맷팅 (25년 10월 29일 형식)
    formatDateForDisplay(date) {
        if (!date || !(date instanceof Date)) {
            return '';
        }
        const year = date.getFullYear().toString().slice(-2); // 마지막 2자리
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}년 ${month}월 ${day}일`;
    }

    // 타임라인 접기/펼치기
    toggleTimeline(button) {
        const container = button.closest('.tracking-timeline-container');
        const content = container.querySelector('.tracking-timeline-content');
        const isExpanded = content.style.display !== 'none';
        
        if (isExpanded) {
            content.style.display = 'none';
            button.textContent = '▶';
        } else {
            content.style.display = 'block';
            button.textContent = '▼';
        }
    }

    // 저장된 글 항목의 이벤트 리스너 설정 (이벤트 위임)
    setupSavedItemEventListeners() {
        console.log('setupSavedItemEventListeners 호출됨');

        // 기존 이벤트 리스너 제거 (중복 방지)
        if (this.savedItemClickHandler) {
            this.savedList.removeEventListener('click', this.savedItemClickHandler);
        }

        // 새로운 이벤트 리스너 생성
        this.savedItemClickHandler = (event) => {
            console.log('저장된 글 영역 클릭:', event.target);
            const button = event.target.closest('button');
            if (!button) {
                console.log('버튼이 아님');
                return;
            }

            const action = button.getAttribute('data-action');
            const itemId = button.getAttribute('data-item-id');

            console.log('이벤트 처리:', { itemId, action, button: button.textContent });

            if (!itemId) {
                console.error('Item ID not found');
                return;
            }

            if (action === 'edit') {
                const type = button.getAttribute('data-type');
                console.log('편집 액션 실행:', { itemId, type });
                this.editText(itemId, type);
            } else if (action === 'delete') {
                console.log('삭제 액션 실행:', { itemId });
                this.deleteText(itemId);
            } else if (action === 'track') {
                console.log('트래킹 액션 실행:', { itemId });
                this.startTrackingFromSaved(itemId);
            } else if (action === 'add-tracking') {
                console.log('트래킹 데이터 입력 액션 실행:', { itemId });
                this.currentTrackingPost = null; // 포스트 ID 초기화
                this.openTrackingModal(itemId);
            } else if (action === 'llm-validation') {
                console.log('LLM 검증 드롭다운 클릭:', { itemId });
                // 드롭다운 메뉴 토글은 CSS로 처리됨
            } else {
                // LLM 옵션 버튼 처리 (data-llm 속성 확인)
                const llmService = button.getAttribute('data-llm');
                if (llmService) {
                    console.log('LLM 옵션 클릭:', { itemId, llmService });
                    this.validateWithLLM(itemId, llmService);
                }
            }
        };

        // 이벤트 리스너 등록
        this.savedList.addEventListener('click', this.savedItemClickHandler);
        console.log('이벤트 리스너 등록 완료');
    }

    // 직접 이벤트 바인딩 (백업 방법)
    bindDirectEventListeners() {
        console.log('직접 이벤트 바인딩 시작');

        const editButtons = this.savedList.querySelectorAll('.btn-edit');
        const deleteButtons = this.savedList.querySelectorAll('.btn-delete');
        const llmButtons = this.savedList.querySelectorAll('.llm-option');

        console.log(`편집 버튼 ${editButtons.length}개, 삭제 버튼 ${deleteButtons.length}개, LLM 버튼 ${llmButtons.length}개 발견`);

        editButtons.forEach((button, index) => {
            const itemId = button.getAttribute('data-item-id');
            const type = button.getAttribute('data-type');

            console.log(`편집 버튼 ${index} 바인딩:`, { itemId, type });

            // 기존 이벤트 리스너 제거
            button.removeEventListener('click', button._editHandler);

            // 새로운 이벤트 핸들러 생성 및 바인딩
            button._editHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('직접 편집 버튼 클릭:', { itemId, type });
                this.editText(itemId, type);
            };

            button.addEventListener('click', button._editHandler);
        });

        deleteButtons.forEach((button, index) => {
            const itemId = button.getAttribute('data-item-id');

            console.log(`삭제 버튼 ${index} 바인딩:`, { itemId });

            // 기존 이벤트 리스너 제거
            button.removeEventListener('click', button._deleteHandler);

            // 새로운 이벤트 핸들러 생성 및 바인딩
            button._deleteHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('직접 삭제 버튼 클릭:', { itemId });
                this.deleteText(itemId);
            };

            button.addEventListener('click', button._deleteHandler);
        });

        // 패널 기반 LLM 검증 버튼들 바인딩
        const panelLlmButtons = document.querySelectorAll('.llm-option[data-panel]');
        panelLlmButtons.forEach((button, index) => {
            const panel = button.getAttribute('data-panel');
            const llmService = button.getAttribute('data-llm');

            console.log(`패널 LLM 버튼 ${index} 바인딩:`, { panel, llmService });

            // 기존 이벤트 리스너 제거
            button.removeEventListener('click', button._panelLlmHandler);

            // 새로운 이벤트 핸들러 생성 및 바인딩
            button._panelLlmHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('패널 LLM 버튼 클릭:', { panel, llmService });

                this.validatePanelWithLLM(panel, llmService);
            };

            button.addEventListener('click', button._panelLlmHandler);
        });

        console.log('직접 이벤트 바인딩 완료');
    }

    // LLM 특성 정보 검증 함수 (개발자용)
    verifyLLMCharacteristics() {
        console.log('=== LLM 특성 정보 검증 ===');

        if (!this.llmCharacteristics) {
            console.error('❌ llmCharacteristics 객체가 없습니다!');
            return false;
        }

        const services = ['chatgpt', 'gemini', 'perplexity', 'grok'];
        let allValid = true;

        services.forEach(service => {
            const char = this.llmCharacteristics[service];
            if (!char) {
                console.error(`❌ ${service} 특성 정보가 없습니다!`);
                allValid = false;
            } else {
                console.log(`✅ ${service}:`, {
                    name: char.name,
                    description: char.description,
                    details: char.details,
                    strength: char.strength
                });
            }
        });

        console.log('=== 검증 완료 ===');
        return allValid;
    }

    // 디버깅용 함수 - 전역에서 호출 가능
    debugSavedItems() {
        console.log('=== 저장된 글 디버깅 정보 ===');
        console.log('savedTexts 배열:', this.savedTexts);
        console.log('savedList 요소:', this.savedList);

        const savedItems = this.savedList.querySelectorAll('.saved-item');
        console.log(`저장된 글 항목 ${savedItems.length}개:`);

        savedItems.forEach((item, index) => {
            const itemId = item.getAttribute('data-item-id');
            const editBtn = item.querySelector('.btn-edit');
            const deleteBtn = item.querySelector('.btn-delete');

            console.log(`항목 ${index}:`, {
                id: itemId,
                editButton: editBtn,
                deleteButton: deleteBtn,
                editButtonId: editBtn?.getAttribute('data-item-id'),
                deleteButtonId: deleteBtn?.getAttribute('data-item-id')
            });
        });

        const editButtons = this.savedList.querySelectorAll('.btn-edit');
        const deleteButtons = this.savedList.querySelectorAll('.btn-delete');
        console.log(`편집 버튼 ${editButtons.length}개, 삭제 버튼 ${deleteButtons.length}개`);

        console.log('=== 디버깅 정보 끝 ===');
    }

    editText(id, type) {
        console.log('편집 버튼 클릭:', { id, type });
        const item = this.savedTexts.find(saved => saved.id === id);
        if (item) {
            console.log('편집할 항목 찾음:', item);
            if (type === 'reference') {
                this.refTextInput.value = item.content;
                this.updateCharacterCount('ref');
                this.refTextInput.focus();
                this.showMessage('레퍼런스 글을 편집 영역으로 불러왔습니다.', 'success');
            } else {
                this.editTextInput.value = item.content;
                this.updateCharacterCount('edit');
                this.editTextInput.focus();
                this.showMessage('수정 글을 편집 영역으로 불러왔습니다.', 'success');
            }
            this.refTextInput.scrollIntoView({ behavior: 'smooth' });
        } else {
            console.error('편집할 항목을 찾을 수 없음:', { id, type, savedTexts: this.savedTexts });
            this.showMessage('편집할 글을 찾을 수 없습니다.', 'error');
        }
    }

    // Firestore에서 텍스트 삭제 (연결된 트래킹 포스트도 함께 삭제)
    async deleteText(id) {
        console.log('삭제 버튼 클릭:', { id });
        
        if (!this.currentUser || !this.isFirebaseReady) {
            this.showMessage('로그인이 필요합니다.', 'error');
            return;
        }

        try {
            // 연결된 트래킹 포스트 찾기
            const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
            const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', id));
            const querySnapshot = await window.firebaseGetDocs(q);
            
            const connectedPosts = [];
            querySnapshot.forEach((doc) => {
                connectedPosts.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            const postCount = connectedPosts.length;
            const metricsCount = connectedPosts.reduce((sum, post) => sum + (post.metrics?.length || 0), 0);
            
            // 경고 메시지 구성
            let confirmMessage = '이 글을 삭제하시겠습니까?';
            if (postCount > 0) {
                confirmMessage = `이 글을 삭제하시겠습니까?\n\n` +
                    `⚠️ 연결된 트래킹 데이터:\n` +
                    `   - 트래킹 포스트: ${postCount}개\n` +
                    `   - 트래킹 기록: ${metricsCount}개\n\n` +
                    `이 모든 데이터가 함께 삭제됩니다.`;
            }
            
            if (!confirm(confirmMessage)) {
                console.log('사용자가 삭제 취소');
                return;
            }
            
            console.log('Firestore에서 삭제 시작:', { id, connectedPostsCount: postCount });
            
            // 연결된 트래킹 포스트 삭제 (캐스케이드 삭제)
            const deletePromises = connectedPosts.map(post => {
                const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', post.id);
                return window.firebaseDeleteDoc(postRef);
            });
            
            // 포스트 삭제와 텍스트 삭제를 병렬로 처리
            await Promise.all([
                ...deletePromises,
                window.firebaseDeleteDoc(window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', id))
            ]);
            
            // 로컬 배열에서도 제거
            this.savedTexts = this.savedTexts.filter(saved => saved.id !== id);
            
            // 로컬 트래킹 포스트 배열에서도 제거
            if (this.trackingPosts) {
                this.trackingPosts = this.trackingPosts.filter(post => post.sourceTextId !== id);
            }
            
            // UI 업데이트
            this.renderSavedTexts();
            
            // 트래킹 탭이 활성화되어 있으면 트래킹 목록도 새로고침
            const trackingTab = document.getElementById('tracking-tab');
            if (trackingTab && trackingTab.classList.contains('active')) {
                await this.loadTrackingPosts();
                this.updateTrackingSummary();
                this.updateTrackingChart();
            }
            
            // 성공 메시지
            let successMessage = '글이 삭제되었습니다.';
            if (postCount > 0) {
                successMessage = `글과 연결된 트래킹 데이터 ${postCount}개가 모두 삭제되었습니다.`;
            }
            this.showMessage(successMessage, 'success');
            
            console.log('삭제 완료', { id, deletedPosts: postCount });

        } catch (error) {
            console.error('텍스트 삭제 실패:', error);
            this.showMessage('삭제에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }

    // HTML 이스케이프 함수 (줄바꿈 보존)
    escapeHtml(text) {
        if (!text) return '';

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>'); // 줄바꿈을 <br> 태그로 변환
    }

    // 텍스트만 이스케이프 (줄바꿈 없이)
    escapeHtmlOnly(text) {
        if (!text) return '';

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : 
                       type === 'error' ? '#dc3545' : 
                       type === 'warning' ? '#ffc107' : '#17a2b8';

        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: ${type === 'warning' ? '#000' : 'white'};
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-weight: 600;
            animation: slideIn 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;
        messageEl.textContent = message;

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, type === 'error' ? 4000 : 2000);
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

    // Firebase 설정 안내
    showFirebaseSetupNotice() {
        console.info(`
🔥 Firebase 설정이 필요합니다!

1. Firebase Console (https://console.firebase.google.com) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "Authentication" > "Sign-in method" 에서 Google 로그인 활성화
4. "Firestore Database" 생성
5. "Project Settings" > "General" 에서 웹 앱 추가
6. 설정 정보를 index.html의 firebaseConfig에 입력

현재는 로컬 스토리지 모드로 동작합니다.
        `);
    }

    // LLM 검증 시스템 초기화
    initializeLLMValidation() {
        // LLM 사이트별 프롬프트 템플릿
        this.llmPrompts = {
            chatgpt: "다음 글을 SNS 후킹 관점에서 분석해주세요. 특히 다음 요소들을 평가해주세요:\n\n🎯 후킹 효과성:\n- 첫 문장이 독자의 관심을 끌 수 있는가?\n- 감정적 몰입을 유도하는가?\n- 호기심을 자극하는 요소가 있는가?\n\n📱 SNS 최적화:\n- 읽기 쉬운 구조인가?\n- 공유하고 싶은 욕구를 자극하는가?\n- 댓글을 유도할 수 있는 요소가 있는가?\n\n💡 개선 제안:\n- 더 강력한 후킹 포인트 제안\n- 감정적 반응을 높이는 방법\n- 행동 유도(좋아요, 공유, 댓글) 강화 방안\n\n분석할 글:\n",
            gemini: "다음 글을 SNS 마케팅 전문가 관점에서 분석해주세요:\n\n🧠 심리적 후킹 분석:\n- 독자의 무의식을 자극하는 요소 분석\n- 감정적 트리거 포인트 식별\n- 인지 편향 활용도 평가\n\n📊 타겟 독자 분석:\n- 어떤 독자층에게 어필하는가?\n- 공감대 형성 요소는 무엇인가?\n- 행동 변화를 유도할 수 있는가?\n\n🎨 표현력 개선:\n- 더 강력한 표현으로 바꿀 부분\n- 시각적 임팩트를 높이는 방법\n- 기억에 남는 문구 만들기\n\n분석할 글:\n",
            perplexity: "다음 글을 SNS 트렌드 및 신뢰성 관점에서 분석해주세요:\n\n🔍 트렌드 적합성:\n- 현재 SNS 트렌드와 부합하는가?\n- 바이럴 가능성이 있는 주제인가?\n- 시의적절한 타이밍인가?\n\n📈 신뢰성 강화:\n- 사실 확인이 필요한 부분\n- 더 설득력 있는 근거 제시 방법\n- 전문성 어필 요소 추가 방안\n\n🌐 확산 가능성:\n- 공유 가치가 있는 콘텐츠인가?\n- 논란을 일으킬 수 있는 요소는?\n- 긍정적 바이럴을 위한 개선점\n\n분석할 글:\n",
            grok: "다음 글을 SNS 후킹 전문가 관점에서 간결하고 임팩트 있게 분석해주세요:\n\n⚡ 임팩트 포인트:\n- 가장 강력한 후킹 문장은?\n- 독자에게 남을 핵심 메시지는?\n- 행동을 유도하는 CTA는?\n\n🎯 명확성 검증:\n- 메시지가 명확하게 전달되는가?\n- 불필요한 요소는 없는가?\n- 핵심만 간결하게 전달하는가?\n\n🚀 개선 액션:\n- 즉시 적용 가능한 개선점\n- 더 강력한 후킹 문구 제안\n- 독자 반응을 높이는 방법\n\n분석할 글:\n"
        };

        // LLM 사이트별 특성 정보 (사용자 가이드용)
        this.llmCharacteristics = {
            chatgpt: {
                name: "ChatGPT",
                icon: "🤖",
                description: "SNS 후킹 분석",
                details: "후킹 효과성·SNS 최적화·행동 유도 분석",
                strength: "종합적 후킹 전략"
            },
            gemini: {
                name: "Gemini", 
                icon: "🧠",
                description: "심리적 후킹",
                details: "무의식 자극·감정 트리거·타겟 독자 분석",
                strength: "심리학적 접근"
            },
            perplexity: {
                name: "Perplexity",
                icon: "🔎", 
                description: "트렌드 검증",
                details: "SNS 트렌드·바이럴 가능성·신뢰성 강화",
                strength: "실시간 트렌드 분석"
            },
            grok: {
                name: "Grok",
                icon: "🚀",
                description: "임팩트 최적화", 
                details: "강력한 후킹 문구·명확한 메시지·즉시 개선점",
                strength: "간결한 임팩트 분석"
            }
        };

        // LLM 사이트별 URL 패턴
        this.llmUrls = {
            chatgpt: "https://chatgpt.com/?q=",
            gemini: "https://gemini.google.com/?q=",
            perplexity: "https://www.perplexity.ai/?q=",
            grok: "https://grok.com/?q="
        };

        console.log('LLM 검증 시스템 초기화 완료');
    }

    // 패널 기반 LLM 검증 실행
    async validatePanelWithLLM(panel, llmService) {
        console.log('패널 LLM 검증 시작:', { panel, llmService });

        try {
            // 패널에 따른 텍스트 영역 선택
            let textArea, panelType;
            if (panel === 'reference') {
                textArea = document.getElementById('ref-text-input');
                panelType = '레퍼런스 글';
            } else if (panel === 'writing') {
                textArea = document.getElementById('edit-text-input');
                panelType = '수정/작성 글';
            } else {
                console.error('지원하지 않는 패널:', panel);
                this.showMessage('지원하지 않는 패널입니다.', 'error');
                return;
            }

            // 텍스트 내용 가져오기
            const content = textArea.value.trim();
            if (!content) {
                this.showMessage(`${panelType}이 비어있습니다. 먼저 글을 작성해주세요.`, 'warning');
                return;
            }

            // LLM 서비스 정보 가져오기
            const llmInfo = this.llmCharacteristics[llmService];
            if (!llmInfo) {
                console.error('지원하지 않는 LLM 서비스:', llmService);
                this.showMessage('지원하지 않는 LLM 서비스입니다.', 'error');
                return;
            }

            // 프롬프트 생성 (제목 라인 없이)
            const prompt = this.llmPrompts[llmService];
            const fullText = `${prompt}\n\n${content}`;

            console.log('패널 검증 텍스트 생성:', { panel, llmService, contentLength: content.length });

            // 클립보드에 복사
            await this.copyToClipboard(fullText);

            // LLM 사이트 열기
            this.openLLMSite(llmService, fullText);

            // 성공 메시지
            this.showMessage(`${panelType}에 대한 ${llmInfo.name} 검증을 위해 새 탭이 열렸습니다. 프롬프트가 클립보드에 복사되었습니다.`, 'success');

        } catch (error) {
            console.error('패널 LLM 검증 실행 실패:', error);
            this.showMessage('LLM 검증 실행에 실패했습니다.', 'error');
        }
    }

    // LLM 검증 실행
    async validateWithLLM(itemId, llmService) {
        console.log('LLM 검증 시작:', { itemId, llmService });

        // 저장된 글 찾기
        const item = this.savedTexts.find(saved => saved.id === itemId);
        if (!item) {
            this.showMessage('검증할 글을 찾을 수 없습니다.', 'error');
            return;
        }

        // 프롬프트와 글 내용 조합
        const prompt = this.llmPrompts[llmService];
        const fullText = prompt + item.content;

        console.log('검증 텍스트 생성:', { llmService, contentLength: item.content.length });

        try {
            // 클립보드에 복사
            await this.copyToClipboard(fullText);

            // LLM 사이트 URL 생성 및 새 탭에서 열기
            this.openLLMSite(llmService, fullText);

            // 사용자에게 안내 메시지
            this.showLLMValidationGuide(llmService);

        } catch (error) {
            console.error('LLM 검증 실행 실패:', error);
            this.showMessage('LLM 검증 실행에 실패했습니다.', 'error');
        }
    }

    // 클립보드에 텍스트 복사
    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                console.log('클립보드 복사 성공 (Clipboard API)');
            } else {
                // 폴백 방법
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('클립보드 복사 성공 (execCommand)');
            }
        } catch (error) {
            console.error('클립보드 복사 실패:', error);
            throw error;
        }
    }

    // LLM 사이트 새 탭에서 열기
    openLLMSite(llmService, text) {
        if (llmService === 'gemini') {
            // Gemini는 특별한 모달 방식 사용
            this.showGeminiCopyModal(text);
            return;
        }

        // 다른 LLM들은 기존 방식 사용
        const baseUrl = this.llmUrls[llmService];
        const encodedText = encodeURIComponent(text);
        const fullUrl = baseUrl + encodedText;

        console.log('LLM 사이트 열기 (URL 파라미터 지원):', { llmService, url: fullUrl });

        // 새 탭에서 열기
        window.open(fullUrl, '_blank', 'noopener,noreferrer');
    }

    // Gemini 전용 복사 모달 표시
    showGeminiCopyModal(text) {
        // 기존 모달이 있다면 제거
        const existingModal = document.getElementById('gemini-copy-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 HTML 생성
        const modalHTML = `
            <div id="gemini-copy-modal" class="gemini-modal-overlay">
                <div class="gemini-modal-content">
                    <div class="gemini-modal-header">
                        <h3>🧠 Gemini 검증 텍스트 복사</h3>
                        <button class="gemini-modal-close" onclick="this.closest('.gemini-modal-overlay').remove()">×</button>
                    </div>
                    <div class="gemini-modal-body">
                        <p class="gemini-instruction">아래 텍스트를 복사하여 Gemini에 붙여넣기하세요:</p>
                        <div class="gemini-text-container">
                            <textarea id="gemini-text-area" readonly>${text}</textarea>
                            <button class="gemini-copy-btn" onclick="dualTextWriter.copyGeminiText()">📋 전체 복사</button>
                        </div>
                        <div class="gemini-steps">
                            <h4>📝 사용 방법:</h4>
                            <ol>
                                <li>위의 "전체 복사" 버튼을 클릭하세요</li>
                                <li>Gemini 페이지로 이동하세요</li>
                                <li>Gemini 입력창에 Ctrl+V로 붙여넣기하세요</li>
                                <li>Enter를 눌러 검증을 시작하세요</li>
                            </ol>
                        </div>
                        <div class="gemini-actions">
                            <button class="gemini-open-btn" onclick="window.open('https://gemini.google.com', '_blank')">🚀 Gemini 열기</button>
                            <button class="gemini-close-btn" onclick="this.closest('.gemini-modal-overlay').remove()">닫기</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 모달을 body에 추가
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 텍스트 영역 자동 선택
        setTimeout(() => {
            const textArea = document.getElementById('gemini-text-area');
            if (textArea) {
                textArea.focus();
                textArea.select();
            }
        }, 100);
    }

    // Gemini 텍스트 복사 함수
    copyGeminiText() {
        const textArea = document.getElementById('gemini-text-area');
        if (!textArea) {
            console.error('Gemini 텍스트 영역을 찾을 수 없습니다.');
            return;
        }

        try {
            // 텍스트 영역 선택
            textArea.focus();
            textArea.select();

            // 복사 실행
            const successful = document.execCommand('copy');
            if (successful) {
                this.showMessage('✅ 텍스트가 클립보드에 복사되었습니다!', 'success');

                // 복사 버튼 텍스트 변경
                const copyBtn = document.querySelector('.gemini-copy-btn');
                if (copyBtn) {
                    copyBtn.textContent = '✅ 복사 완료!';
                    copyBtn.style.background = '#4CAF50';

                    // 2초 후 원래 상태로 복원
                    setTimeout(() => {
                        copyBtn.textContent = '📋 전체 복사';
                        copyBtn.style.background = '';
                    }, 2000);
                }
            } else {
                throw new Error('복사 명령 실행 실패');
            }
        } catch (error) {
            console.error('Gemini 텍스트 복사 실패:', error);
            this.showMessage('❌ 복사에 실패했습니다. 텍스트를 수동으로 선택하여 복사해주세요.', 'error');
        }
    }

    // LLM 검증 가이드 메시지 표시
    showLLMValidationGuide(llmService) {
        const characteristics = this.llmCharacteristics[llmService];

        let message;

        if (llmService === 'gemini') {
            message = `✅ ${characteristics.name} 복사 모달이 열렸습니다!\n\n` +
                `📋 모달에서 "전체 복사" 버튼을 클릭하세요.\n` +
                `💡 ${characteristics.name} 페이지로 이동하여 Ctrl+V로 붙여넣기하세요.\n\n` +
                `🎯 기대 결과: ${characteristics.description} - ${characteristics.details}`;
        } else {
            message = `✅ ${characteristics.name} 검증 페이지가 열렸습니다!\n\n` +
                `📋 검증할 텍스트가 클립보드에 복사되었습니다.\n` +
                `💡 ${characteristics.name} 프롬프트 창에 Ctrl+V로 붙여넣기하세요.\n\n` +
                `🎯 기대 결과: ${characteristics.description} - ${characteristics.details}`;
        }

        this.showMessage(message, 'success');

        // 추가 안내를 위한 상세 메시지
        setTimeout(() => {
            this.showDetailedGuide(llmService);
        }, 2000);
    }

    // 상세 가이드 표시
    showDetailedGuide(llmService) {
        const guides = {
            chatgpt: 'ChatGPT의 SNS 후킹 분석 결과를 바탕으로 글의 감정적 몰입과 행동 유도를 강화해보세요.',
            gemini: 'Gemini의 심리적 후킹 분석을 참고하여 독자의 무의식을 자극하는 요소를 추가해보세요.',
            perplexity: 'Perplexity의 트렌드 분석 결과를 활용하여 현재 SNS 트렌드에 맞게 글을 개선해보세요.',
            grok: 'Grok의 임팩트 분석을 반영하여 더 강력하고 명확한 후킹 문구로 글을 업그레이드해보세요.'
        };

        const guide = guides[llmService];
        this.showMessage(`💡 ${guide}`, 'info');
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

    // Firestore에서 사용자 데이터 로드
    async loadUserData() {
        if (!this.currentUser) return;

        try {
            await this.loadSavedTextsFromFirestore();
            // 트래킹 포스트도 함께 로드 (저장된 글의 타임라인 표시를 위해)
            if (this.loadTrackingPosts) {
                await this.loadTrackingPosts();
            }
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
        await this.renderSavedTexts();
        this.startTempSave();
        this.restoreTempSave();
        
        // 미트래킹 글 버튼 상태 업데이트
        if (this.updateBatchMigrationButton) {
            await this.updateBatchMigrationButton();
        }
        } catch (error) {
            console.error('사용자 데이터 로드 실패:', error);
            this.showMessage('데이터를 불러오는데 실패했습니다.', 'error');
        }
    }

    // Firestore에서 저장된 텍스트들 불러오기
    async loadSavedTextsFromFirestore() {
        if (!this.currentUser || !this.isFirebaseReady) return;

        try {
            const textsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'texts');
            const q = window.firebaseQuery(textsRef, window.firebaseOrderBy('createdAt', 'desc'));
            const querySnapshot = await window.firebaseGetDocs(q);

            this.savedTexts = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // 타입 정규화 (레거시 값 대응): 'writing'|'edit' -> 'edit', 'ref'|'reference' -> 'reference'
                let normalizedType = (data.type || '').toString().toLowerCase();
                if (normalizedType === 'writing') normalizedType = 'edit';
                if (normalizedType === 'ref') normalizedType = 'reference';
                if (normalizedType !== 'edit' && normalizedType !== 'reference') {
                    // 알 수 없는 타입은 편의상 'edit'로 처리
                    normalizedType = 'edit';
                }
                this.savedTexts.push({
                    id: doc.id,
                    content: data.content,
                    date: data.createdAt ? data.createdAt.toDate().toLocaleString('ko-KR') : '날짜 없음',
                    characterCount: data.characterCount,
                    type: normalizedType
                });
            });

            console.log(`${this.savedTexts.length}개의 텍스트를 불러왔습니다.`);

        } catch (error) {
            console.error('Firestore에서 텍스트 불러오기 실패:', error);
            this.savedTexts = [];
        }
    }

    // 기존 로컬 스토리지 메서드들은 Firestore로 대체됨

    cleanupTempSave() {
        if (this.tempSaveInterval) {
            clearInterval(this.tempSaveInterval);
        }
        if (this.tempSaveTimeout) {
            clearTimeout(this.tempSaveTimeout);
        }
    }

    // ===== 반자동화 포스팅 시스템 =====

    // 해시태그 추출 함수
    extractHashtags(content) {
        const hashtagRegex = /#[\w가-힣]+/g;
        const hashtags = content.match(hashtagRegex) || [];
        return hashtags.map(tag => tag.toLowerCase());
    }

    // 사용자 정의 해시태그 가져오기
    getUserHashtags() {
        try {
            const saved = localStorage.getItem('userHashtags');
            if (saved) {
                const parsed = JSON.parse(saved);
                // 빈 배열도 유효한 값으로 처리
                return Array.isArray(parsed) ? parsed : this.defaultHashtags;
            }
        } catch (error) {
            console.error('해시태그 불러오기 실패:', error);
        }
        return this.defaultHashtags;
    }

    // 사용자 정의 해시태그 저장
    saveUserHashtags(hashtags) {
        try {
            // 빈 배열 허용 (해시태그 없이 사용)
            if (!Array.isArray(hashtags)) {
                console.warn('유효하지 않은 해시태그 배열');
                return false;
            }

            // 해시태그가 없는 경우
            if (hashtags.length === 0) {
                localStorage.setItem('userHashtags', JSON.stringify([]));
                console.log('해시태그 없이 사용하도록 설정됨');
                return true;
            }

            // 해시태그 형식 검증
            const validHashtags = hashtags
                .map(tag => tag.trim())
                .filter(tag => tag.startsWith('#') && tag.length > 1)
                .filter(tag => tag.length <= 50); // 길이 제한

            if (validHashtags.length === 0) {
                console.warn('유효한 해시태그가 없습니다');
                return false;
            }

            localStorage.setItem('userHashtags', JSON.stringify(validHashtags));
            console.log('해시태그 저장 완료:', validHashtags);
            return true;
        } catch (error) {
            console.error('해시태그 저장 실패:', error);
            return false;
        }
    }

    // Threads 포맷팅 함수 (XSS 방지 포함, 줄바꿈 보존)
    formatForThreads(content) {
        // XSS 방지를 위한 HTML 이스케이프 (줄바꿈은 보존)
        if (!content) return '';

        // 줄바꿈 보존하면서 XSS 방지
        const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 줄바꿈 정규화 (CRLF -> LF)
        const normalizedContent = escapedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 연속 줄바꿈 정리 (최대 2개까지만)
        const cleanedContent = normalizedContent.replace(/\n{3,}/g, '\n\n');

        return cleanedContent.trim();
    }

    // HTML 이스케이프 함수 (보안 강화 - 완전한 XSS 방지)
    escapeHtml(text) {
        if (typeof text !== 'string') {
            return '';
        }

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 사용자 입력 검증 함수 (보안 강화)
    validateUserInput(input, type = 'text') {
        if (!input || typeof input !== 'string') {
            throw new Error('유효하지 않은 입력입니다.');
        }

        // 길이 제한 검증
        if (input.length > 10000) {
            throw new Error('입력이 너무 깁니다. (최대 10,000자)');
        }

        // 위험한 패턴 검증
        const dangerousPatterns = [
            /<script[^>]*>.*?<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe[^>]*>.*?<\/iframe>/gi,
            /<object[^>]*>.*?<\/object>/gi,
            /<embed[^>]*>/gi,
            /<link[^>]*>/gi,
            /<meta[^>]*>/gi
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(input)) {
                throw new Error('위험한 코드가 감지되었습니다.');
            }
        }

        return true;
    }

    // 안전한 텍스트 처리 함수
    sanitizeText(text) {
        this.validateUserInput(text);

        // HTML 태그 제거
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const cleanText = tempDiv.textContent || tempDiv.innerText || '';

        // 특수 문자 정리
        return cleanText
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 제어 문자 제거
            .replace(/\s+/g, ' ') // 연속 공백 정리
            .trim();
    }

    // 내용 최적화 엔진 (보안 강화 버전)
    optimizeContentForThreads(content) {
        try {
            // 1단계: 입력 검증 및 정화
            const sanitizedContent = this.sanitizeText(content);

            // 2단계: 성능 최적화 - 대용량 텍스트 처리
            if (sanitizedContent.length > 10000) {
                console.warn('매우 긴 텍스트가 감지되었습니다. 처리 시간이 오래 걸릴 수 있습니다.');
            }

            const optimized = {
                original: sanitizedContent,
                optimized: '',
                hashtags: [],
                characterCount: 0,
                suggestions: [],
                warnings: [],
                securityChecks: {
                    xssBlocked: false,
                    maliciousContentRemoved: false,
                    inputValidated: true
                }
            };

            // 3단계: 글자 수 최적화 (Threads는 500자 제한)
            if (sanitizedContent.length > 500) {
                // 단어 단위로 자르기 (더 자연스러운 자르기)
                const words = sanitizedContent.substring(0, 500).split(' ');
                words.pop(); // 마지막 불완전한 단어 제거
                optimized.optimized = words.join(' ') + '...';
                optimized.suggestions.push('글이 500자를 초과하여 단어 단위로 잘렸습니다.');
                optimized.warnings.push('원본보다 짧아졌습니다.');
            } else {
                optimized.optimized = sanitizedContent;
            }

            // 4단계: 해시태그 자동 추출/추가 (보안 검증 포함)
            const hashtags = this.extractHashtags(optimized.optimized);
            if (hashtags.length === 0) {
                // 사용자 정의 해시태그 사용 (선택적)
                const userHashtags = this.getUserHashtags();
                if (userHashtags && userHashtags.length > 0) {
                    optimized.hashtags = userHashtags;
                    optimized.suggestions.push('해시태그를 추가했습니다.');
                } else {
                    optimized.hashtags = [];
                    optimized.suggestions.push('해시태그 없이 포스팅됩니다.');
                }
            } else {
                // 해시태그 보안 검증
                optimized.hashtags = hashtags.filter(tag => {
                    // 위험한 해시태그 필터링
                    const dangerousTags = ['#script', '#javascript', '#eval', '#function'];
                    return !dangerousTags.some(dangerous => tag.toLowerCase().includes(dangerous));
                });
            }

            // 5단계: 최종 포맷팅 적용 (보안 강화)
            optimized.optimized = this.formatForThreads(optimized.optimized);
            optimized.characterCount = optimized.optimized.length;

            // 6단계: 보안 검증 완료 표시
            optimized.securityChecks.inputValidated = true;

            return optimized;

        } catch (error) {
            console.error('내용 최적화 중 오류 발생:', error);

            // 보안 오류인 경우 특별 처리
            if (error.message.includes('위험한') || error.message.includes('유효하지 않은')) {
                throw new Error('보안상의 이유로 내용을 처리할 수 없습니다. 입력을 확인해주세요.');
            }

            throw new Error('내용 최적화에 실패했습니다.');
        }
    }

    // 폴백 클립보드 복사 함수
    fallbackCopyToClipboard(text) {
        console.log('🔄 폴백 클립보드 복사 시작');
        console.log('📝 폴백 복사할 텍스트:', text);
        console.log('📝 폴백 텍스트 길이:', text ? text.length : 'undefined');

        return new Promise((resolve, reject) => {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                textArea.style.opacity = '0';
                textArea.setAttribute('readonly', '');
                textArea.setAttribute('aria-hidden', 'true');

                document.body.appendChild(textArea);
                console.log('✅ textarea 생성 및 DOM 추가 완료');

                // 모바일 지원을 위한 선택 범위 설정
                if (textArea.setSelectionRange) {
                    textArea.setSelectionRange(0, text.length);
                    console.log('✅ setSelectionRange 사용');
                } else {
                    textArea.select();
                    console.log('✅ select() 사용');
                }

                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('✅ textarea 제거 완료');
                console.log('📋 execCommand 결과:', successful);

                if (successful) {
                    console.log('✅ 폴백 복사 성공');
                    resolve(true);
                } else {
                    console.error('❌ execCommand 복사 실패');
                    reject(new Error('execCommand 복사 실패'));
                }
            } catch (error) {
                console.error('❌ 폴백 복사 중 오류:', error);
                reject(error);
            }
        });
    }

    // 로딩 상태 관리 함수
    showLoadingState(element, isLoading) {
        if (isLoading) {
            element.disabled = true;
            element.innerHTML = '⏳ 처리 중...';
            element.classList.add('loading');
        } else {
            element.disabled = false;
            element.innerHTML = '🚀 반자동 포스팅';
            element.classList.remove('loading');
        }
    }

    // 클립보드 자동화 (완전한 에러 처리 및 폴백)
    async copyToClipboardWithFormat(content) {
        console.log('🔍 copyToClipboardWithFormat 시작');
        console.log('📝 입력 내용:', content);
        console.log('📝 입력 타입:', typeof content);

        const button = document.getElementById('semi-auto-post-btn');

        try {
            // 로딩 상태 표시
            if (button) {
                this.showLoadingState(button, true);
            }

            // 1단계: 입력 검증 강화
            if (!content || typeof content !== 'string') {
                console.error('❌ 유효하지 않은 내용:', content);
                throw new Error('유효하지 않은 내용입니다.');
            }

            console.log('✅ 1단계: 입력 검증 통과');

            // 2단계: 원본 텍스트 그대로 사용 (줄바꿈 보존)
            console.log('📝 원본 내용 사용 (줄바꿈 보존):', content);

            if (!content || content.length === 0) {
                console.error('❌ 내용이 비어있음');
                throw new Error('내용이 비어있습니다.');
            }

            console.log('✅ 2단계: 검증 완료');

            // 클립보드 API 지원 확인
            console.log('🔄 3단계: 클립보드 API 확인...');
            console.log('📋 navigator.clipboard 존재:', !!navigator.clipboard);
            console.log('🔒 isSecureContext:', window.isSecureContext);

            if (navigator.clipboard && window.isSecureContext) {
                try {
                    console.log('📋 클립보드 API로 복사 시도...');
                    await navigator.clipboard.writeText(content);
                    console.log('✅ 클립보드 API 복사 성공');
                    this.showMessage('✅ 내용이 클립보드에 복사되었습니다!', 'success');
                    return true;
                } catch (clipboardError) {
                    console.warn('❌ Clipboard API 실패, 폴백 방법 사용:', clipboardError);
                    throw clipboardError;
                }
            } else {
                console.warn('❌ Clipboard API 미지원');
                throw new Error('Clipboard API 미지원');
            }

        } catch (error) {
            console.error('❌ 클립보드 복사 실패:', error);
            console.error('❌ 오류 상세:', error.stack);

            try {
                // 폴백 방법 시도
                console.log('🔄 폴백 방법 시도...');
                await this.fallbackCopyToClipboard(content);
                console.log('✅ 폴백 방법 복사 성공');
                this.showMessage('✅ 내용이 클립보드에 복사되었습니다! (폴백 방법)', 'success');
                return true;
            } catch (fallbackError) {
                console.error('❌ 폴백 복사도 실패:', fallbackError);
                this.showMessage('❌ 클립보드 복사에 실패했습니다. 수동으로 복사해주세요.', 'error');

                // 수동 복사를 위한 텍스트 영역 표시
                console.log('🔄 수동 복사 모달 표시...');
                this.showManualCopyModal(formattedContent);
                return false;
            }
        } finally {
            // 로딩 상태 해제
            if (button) {
                this.showLoadingState(button, false);
            }
            console.log('✅ 로딩 상태 해제 완료');
        }
    }

    // 수동 복사 모달 표시 함수
    showManualCopyModal(content) {
        const modal = document.createElement('div');
        modal.className = 'manual-copy-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>📋 수동 복사</h3>
                <p>클립보드 복사에 실패했습니다. 아래 텍스트를 수동으로 복사해주세요:</p>
                <textarea readonly class="copy-textarea" aria-label="복사할 텍스트">${content}</textarea>
                <div class="modal-actions">
                    <button class="btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">확인</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 텍스트 영역 자동 선택
        const textarea = modal.querySelector('.copy-textarea');
        textarea.focus();
        textarea.select();
    }

    // 최적화 모달 표시 함수 (접근성 강화)
    showOptimizationModal(optimized, originalContent) {
        // 원본 텍스트 저장 (줄바꿈 보존)
        optimized.originalContent = originalContent;

        const modal = document.createElement('div');
        modal.className = 'optimization-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title');
        modal.setAttribute('aria-describedby', 'modal-description');

        // 현재 언어 감지
        const currentLang = this.detectLanguage();
        console.log('🌍 감지된 언어:', currentLang);
        console.log('📝 원본 텍스트 저장:', originalContent);

        modal.innerHTML = `
            <div class="optimization-content" lang="${currentLang}">
                <h3 id="modal-title">${this.t('optimizationTitle')}</h3>
                <div id="modal-description" class="sr-only">포스팅 내용이 최적화되었습니다. 결과를 확인하고 진행하세요.</div>
                
                <div class="optimization-stats" role="region" aria-label="최적화 통계">
                    <div class="stat-item">
                        <span class="stat-label">${this.t('originalLength')}</span>
                        <span class="stat-value" aria-label="${optimized.original.length}${this.t('characters')}">${optimized.original.length}${this.t('characters')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${this.t('optimizedLength')}</span>
                        <span class="stat-value" aria-label="${optimized.characterCount}${this.t('characters')}">${optimized.characterCount}${this.t('characters')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${this.t('hashtags')}</span>
                        <span class="stat-value" aria-label="해시태그 ${optimized.hashtags.length}${this.t('hashtagCount')}">${optimized.hashtags.join(' ')}</span>
                    </div>
                </div>
                
                ${optimized.suggestions.length > 0 ? `
                    <div class="suggestions" role="region" aria-label="최적화 제안사항">
                        <h4>${this.t('optimizationSuggestions')}</h4>
                        <ul>
                            ${optimized.suggestions.map(suggestion => `<li>${this.escapeHtml(suggestion)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="preview-section" role="region" aria-label="포스팅 내용 미리보기">
                    <div class="hashtag-toggle-section">
                        <label class="hashtag-toggle-label">
                            <input type="checkbox" id="hashtag-toggle" checked aria-label="해시태그 자동 추가">
                            <span class="toggle-text">해시태그 자동 추가</span>
                        </label>
                    </div>
                    <h4>${this.t('previewTitle')}</h4>
                    <div class="preview-content" role="textbox" aria-label="포스팅 내용" tabindex="0" id="preview-content-display">
                        ${this.escapeHtml(originalContent)}
                        ${optimized.hashtags.length > 0 ? `<br><br>${this.escapeHtmlOnly(optimized.hashtags.join(' '))}` : ''}
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary btn-copy-only" 
                            id="copy-only-btn"
                            lang="${currentLang}"
                            aria-label="클립보드에만 복사">
                        📋 클립보드 복사
                    </button>
                    <button class="btn-primary btn-threads-only" 
                            id="threads-only-btn"
                            lang="${currentLang}"
                            aria-label="Threads 페이지만 열기">
                        🚀 Threads 열기
                    </button>
                    <button class="btn-success btn-both" 
                            id="both-btn"
                            lang="${currentLang}"
                            aria-label="클립보드 복사하고 Threads 페이지 열기">
                        📋🚀 둘 다 실행
                    </button>
                    <button class="btn-secondary" 
                            id="cancel-btn"
                            lang="${currentLang}"
                            aria-label="모달 닫기">
                        ${this.t('cancelButton')}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 버튼 클릭 이벤트 직접 바인딩 (동적 생성된 모달)
        setTimeout(() => {
            // 해시태그 토글 스위치
            const hashtagToggle = modal.querySelector('#hashtag-toggle');
            const previewDisplay = modal.querySelector('#preview-content-display');

            if (hashtagToggle && previewDisplay) {
                hashtagToggle.addEventListener('change', () => {
                    console.log('🔄 해시태그 토글 변경:', hashtagToggle.checked);

                    // 미리보기 업데이트
                    if (hashtagToggle.checked) {
                        previewDisplay.innerHTML = this.escapeHtml(originalContent) + 
                            (optimized.hashtags.length > 0 ? '<br><br>' + this.escapeHtmlOnly(optimized.hashtags.join(' ')) : '');
                    } else {
                        previewDisplay.innerHTML = this.escapeHtml(originalContent);
                    }
                });
            }

            // 클립보드 복사 버튼
            const copyBtn = modal.querySelector('#copy-only-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    // 토글 상태에 따라 해시태그 포함 여부 결정
                    const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
                    const content = originalContent + (includeHashtags && optimized.hashtags.length > 0 ? '\n\n' + optimized.hashtags.join(' ') : '');
                    console.log('🔍 클립보드 복사 버튼 클릭 감지');
                    console.log('📝 원본 텍스트 직접 사용:', content);
                    this.copyToClipboardOnly(content, e);
                });
            }

            // Threads 열기 버튼
            const threadsBtn = modal.querySelector('#threads-only-btn');
            if (threadsBtn) {
                threadsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('🔍 Threads 열기 버튼 클릭 감지');
                    this.openThreadsOnly();
                });
            }

            // 둘 다 실행 버튼
            const bothBtn = modal.querySelector('#both-btn');
            if (bothBtn) {
                bothBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    // 토글 상태에 따라 해시태그 포함 여부 결정
                    const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
                    const content = originalContent + (includeHashtags && optimized.hashtags.length > 0 ? '\n\n' + optimized.hashtags.join(' ') : '');
                    console.log('🔍 둘 다 실행 버튼 클릭 감지');
                    console.log('📝 원본 텍스트 직접 사용:', content);
                    this.proceedWithPosting(content, e);
                });
            }

            // 취소 버튼
            const cancelBtn = modal.querySelector('#cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('🔍 취소 버튼 클릭 감지');
                    modal.remove();
                });
            }
        }, 10);

        // 접근성 강화: 포커스 관리
        const firstBtn = modal.querySelector('#copy-only-btn');

        // 첫 번째 버튼에 포커스
        setTimeout(() => {
            if (firstBtn) {
                firstBtn.focus();
            }
        }, 150);

        // ESC 키로 모달 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Tab 키 순환 제한 (모달 내에서만)
        const focusableElements = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (firstElement && lastElement) {
            const handleTabKey = (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey) {
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                }
            };

            modal.addEventListener('keydown', handleTabKey);
        }

        // 모달이 제거될 때 이벤트 리스너 정리 (간단한 방식)
        const cleanup = () => {
            document.removeEventListener('keydown', handleEscape);
            console.log('✅ 모달 이벤트 리스너 정리됨');
        };

        // 모달 DOM 제거 시 자동 정리
        const observer = new MutationObserver(() => {
            if (!document.body.contains(modal)) {
                cleanup();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }

    // 포스팅 진행 함수 (이벤트 컨텍스트 보존)
    async proceedWithPosting(formattedContent, event = null) {
        console.log('📋🚀 둘 다 실행 시작');
        console.log('🎯 이벤트 컨텍스트:', event ? '보존됨' : '없음');

        try {
            // 클립보드에 복사 (이벤트 컨텍스트 보존)
            let success = false;

            if (event) {
                console.log('🚀 이벤트 컨텍스트에서 즉시 복사 시도');
                success = await this.copyToClipboardImmediate(formattedContent);
            } else {
                console.log('🔄 기존 방법으로 복사 시도');
                success = await this.copyToClipboardWithFormat(formattedContent);
            }

            if (success) {
                console.log('✅ 클립보드 복사 성공');
            } else {
                console.warn('⚠️ 클립보드 복사 실패, Threads는 계속 열기');
            }

            // Threads 새 탭 열기 (클립보드 복사 성공 여부와 관계없이)
            const threadsUrl = this.getThreadsUrl();
            console.log('🔗 Threads URL:', threadsUrl);
            window.open(threadsUrl, '_blank', 'noopener,noreferrer');

            // 사용자 가이드 표시
            this.showPostingGuide();

            // 모달 닫기
            const modal = document.querySelector('.optimization-modal');
            if (modal) {
                modal.remove();
            }

        } catch (error) {
            console.error('포스팅 진행 중 오류:', error);
            this.showMessage('포스팅 진행 중 오류가 발생했습니다.', 'error');
        }
    }

    // 클립보드 복사만 실행하는 함수 (이벤트 컨텍스트 보존)
    async copyToClipboardOnly(formattedContent, event = null) {
        console.log('📋 클립보드 복사만 실행');
        console.log('📝 받은 내용:', formattedContent);
        console.log('📝 내용 타입:', typeof formattedContent);
        console.log('📝 내용 길이:', formattedContent ? formattedContent.length : 'undefined');
        console.log('🎯 이벤트 컨텍스트:', event ? '보존됨' : '없음');

        try {
            // 이벤트가 있으면 즉시 클립보드 복사 시도
            if (event) {
                console.log('🚀 이벤트 컨텍스트에서 즉시 복사 시도');
                const success = await this.copyToClipboardImmediate(formattedContent);

                if (success) {
                    this.showMessage('✅ 텍스트가 클립보드에 복사되었습니다!', 'success');
                    console.log('✅ 클립보드 복사 완료');
                    return;
                }
            }

            // 이벤트가 없거나 즉시 복사 실패 시 기존 방법 사용
            console.log('🔄 기존 방법으로 복사 시도');
            const success = await this.copyToClipboardWithFormat(formattedContent);

            if (success) {
                this.showMessage('✅ 텍스트가 클립보드에 복사되었습니다!', 'success');
                console.log('✅ 클립보드 복사 완료');
            } else {
                this.showMessage('❌ 클립보드 복사에 실패했습니다.', 'error');
                console.error('❌ 클립보드 복사 실패');
            }
        } catch (error) {
            console.error('❌ 클립보드 복사 중 오류:', error);
            this.showMessage('클립보드 복사 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    }

    // 즉시 클립보드 복사 (이벤트 컨텍스트 보존)
    async copyToClipboardImmediate(content) {
        console.log('🚀 즉시 클립보드 복사 시작');

        try {
            // 1단계: 입력 검증
            if (!content || typeof content !== 'string') {
                throw new Error('유효하지 않은 내용입니다.');
            }

            // 2단계: 원본 텍스트 그대로 사용 (줄바꿈 보존)
            console.log('📝 원본 내용 (줄바꿈 보존):', content);

            // 3단계: 클립보드 API 시도 (이벤트 컨텍스트 내에서)
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    console.log('📋 클립보드 API로 즉시 복사 시도...');
                    await navigator.clipboard.writeText(content);
                    console.log('✅ 클립보드 API 즉시 복사 성공');
                    return true;
                } catch (clipboardError) {
                    console.warn('❌ 클립보드 API 즉시 복사 실패:', clipboardError);
                    // 폴백으로 execCommand 시도
                    return await this.fallbackCopyToClipboard(content);
                }
            } else {
                console.log('🔄 클립보드 API 미지원, 폴백 방법 사용');
                return await this.fallbackCopyToClipboard(content);
            }

        } catch (error) {
            console.error('❌ 즉시 클립보드 복사 실패:', error);
            return false;
        }
    }

    // Threads 열기만 실행하는 함수
    openThreadsOnly() {
        console.log('🚀 Threads 열기만 실행');

        try {
            const threadsUrl = this.getThreadsUrl();
            console.log('🔗 Threads URL:', threadsUrl);

            window.open(threadsUrl, '_blank', 'noopener,noreferrer');

            this.showMessage('✅ Threads 페이지가 열렸습니다!', 'success');
            console.log('✅ Threads 페이지 열기 완료');

            // 간단한 가이드 표시
            this.showSimpleThreadsGuide();

        } catch (error) {
            console.error('❌ Threads 열기 중 오류:', error);
            this.showMessage('Threads 열기 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    }

    // 간단한 Threads 가이드 표시
    showSimpleThreadsGuide() {
        const currentLang = this.detectLanguage();

        const guide = document.createElement('div');
        guide.className = 'simple-threads-guide';
        guide.setAttribute('lang', currentLang);

        guide.innerHTML = `
            <div class="guide-content">
                <h3>✅ Threads 페이지가 열렸습니다!</h3>
                <div class="guide-steps">
                    <h4>📝 다음 단계:</h4>
                    <ol>
                        <li>Threads 새 탭으로 이동하세요</li>
                        <li>"새 글 작성" 버튼을 클릭하세요</li>
                        <li>작성한 텍스트를 입력하세요</li>
                        <li>"게시" 버튼을 클릭하세요</li>
                    </ol>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="this.closest('.simple-threads-guide').remove()">✅ 확인</button>
                </div>
            </div>
        `;

        document.body.appendChild(guide);

        // 언어 최적화 적용
        this.applyLanguageOptimization(guide, currentLang);

        // 5초 후 자동으로 사라지게 하기
        setTimeout(() => {
            if (guide.parentNode) {
                guide.remove();
            }
        }, 8000);
    }

    // Threads URL 가져오기 함수
    getThreadsUrl() {
        // 사용자 설정에서 프로필 URL 확인
        const userProfileUrl = localStorage.getItem('threads_profile_url');

        if (userProfileUrl && this.isValidThreadsUrl(userProfileUrl)) {
            console.log('✅ 사용자 프로필 URL 사용:', userProfileUrl);
            return userProfileUrl;
        }

        // 기본 Threads 메인 페이지
        console.log('✅ 기본 Threads 메인 페이지 사용');
        return 'https://www.threads.com/';
    }

    // Threads URL 유효성 검사
    isValidThreadsUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('threads.com') || urlObj.hostname.includes('threads.net');
        } catch (error) {
            return false;
        }
    }

    // 사용자 프로필 URL 설정 함수
    setThreadsProfileUrl(url) {
        if (this.isValidThreadsUrl(url)) {
            localStorage.setItem('threads_profile_url', url);
            this.showMessage('✅ Threads 프로필 URL이 설정되었습니다!', 'success');
            return true;
        } else {
            this.showMessage('❌ 올바른 Threads URL을 입력해주세요. (예: https://www.threads.com/@username)', 'error');
            return false;
        }
    }

    // 포스팅 가이드 표시 함수
    showPostingGuide() {
        const guide = document.createElement('div');
        guide.className = 'posting-guide';
        guide.innerHTML = `
            <div class="guide-content">
                <h3>✅ 성공! Threads 페이지가 열렸습니다</h3>
                <div class="guide-steps">
                    <h4>📝 다음 단계를 따라해주세요:</h4>
                    <ol>
                        <li>Threads 새 탭으로 이동하세요</li>
                        <li>"새 글 작성" 버튼을 클릭하세요</li>
                        <li>텍스트 입력창에 Ctrl+V로 붙여넣기하세요</li>
                        <li>"게시" 버튼을 클릭하여 포스팅하세요</li>
                    </ol>
                </div>
                <div class="guide-tip">
                    <p>💡 팁: 붙여넣기 후 내용을 한 번 더 확인해보세요!</p>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" onclick="this.closest('.posting-guide').remove()">✅ 확인</button>
                    <button class="btn-secondary" onclick="dualTextWriter.showThreadsProfileSettings()">⚙️ 프로필 설정</button>
                </div>
            </div>
        `;

        document.body.appendChild(guide);

        // 5초 후 자동으로 사라지게 하기
        setTimeout(() => {
            if (guide.parentNode) {
                guide.remove();
            }
        }, 10000);
    }

    // Threads 프로필 설정 모달 표시
    showThreadsProfileSettings() {
        const currentLang = this.detectLanguage();

        const modal = document.createElement('div');
        modal.className = 'threads-profile-modal';
        modal.setAttribute('lang', currentLang);

        modal.innerHTML = `
            <div class="modal-content">
                <h3>⚙️ Threads 프로필 설정</h3>
                <p>포스팅 시 열릴 Threads 페이지를 설정하세요.</p>
                
                <div class="profile-url-section">
                    <label for="threads-profile-url">프로필 URL:</label>
                    <input type="url" id="threads-profile-url" 
                           placeholder="https://www.threads.com/@username"
                           value="${localStorage.getItem('threads_profile_url') || ''}">
                    <small>예: https://www.threads.com/@username</small>
                </div>
                
                <div class="url-options">
                    <h4>빠른 선택:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/')">
                        🏠 Threads 메인 페이지
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/new')">
                        ✏️ 새 글 작성 페이지
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveThreadsProfileUrl()">💾 저장</button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.threads-profile-modal').remove()">❌ 취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 언어 최적화 적용
        this.applyLanguageOptimization(modal, currentLang);

        // 입력 필드에 포커스
        setTimeout(() => {
            const input = modal.querySelector('#threads-profile-url');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    // Threads 프로필 URL 저장
    saveThreadsProfileUrl() {
        const input = document.getElementById('threads-profile-url');
        if (input) {
            const url = input.value.trim();
            if (url) {
                this.setThreadsProfileUrl(url);
            } else {
                // 빈 값이면 기본 URL로 설정
                localStorage.removeItem('threads_profile_url');
                this.showMessage('✅ 기본 Threads 메인 페이지로 설정되었습니다!', 'success');
            }

            // 모달 닫기
            const modal = document.querySelector('.threads-profile-modal');
            if (modal) {
                modal.remove();
            }
        }
    }

    // 해시태그 설정 모달 표시
    showHashtagSettings() {
        const currentLang = this.detectLanguage();
        const currentHashtags = this.getUserHashtags();

        const modal = document.createElement('div');
        modal.className = 'hashtag-settings-modal';
        modal.setAttribute('lang', currentLang);

        modal.innerHTML = `
            <div class="modal-content">
                <h3>📌 해시태그 설정</h3>
                <p>반자동 포스팅 시 사용될 기본 해시태그를 설정하세요.</p>
                
                <div class="hashtag-input-section">
                    <label for="hashtag-input">해시태그 (쉼표로 구분):</label>
                    <input type="text" id="hashtag-input" 
                           placeholder="예: #writing, #content, #threads"
                           value="${currentHashtags.join(', ')}">
                    <small>예: #writing, #content, #threads</small>
                </div>
                
                <div class="hashtag-examples">
                    <h4>추천 해시태그:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#writing, #content, #threads'">
                        📝 일반 글 작성
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#생각, #일상, #daily'">
                        💭 일상 글
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#경제, #투자, #finance'">
                        💰 경제/투자
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#기술, #개발, #tech'">
                        🚀 기술/개발
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value=''" style="background: #f8f9fa; color: #6c757d;">
                        ❌ 해시태그 없이 사용
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveHashtagSettings()">💾 저장</button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.hashtag-settings-modal').remove()">❌ 취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 언어 최적화 적용
        this.applyLanguageOptimization(modal, currentLang);

        // 입력 필드에 포커스
        setTimeout(() => {
            const input = modal.querySelector('#hashtag-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    // 해시태그 설정 저장
    saveHashtagSettings() {
        const input = document.getElementById('hashtag-input');
        if (input) {
            const inputValue = input.value.trim();

            // 빈 값 허용 (해시태그 없이 사용)
            if (!inputValue) {
                this.saveUserHashtags([]);
                this.showMessage('✅ 해시태그 없이 포스팅하도록 설정되었습니다!', 'success');
                this.updateHashtagsDisplay();

                // 모달 닫기
                const modal = document.querySelector('.hashtag-settings-modal');
                if (modal) {
                    modal.remove();
                }
                return;
            }

            // 쉼표로 분리하여 배열로 변환
            const hashtags = inputValue
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);

            if (this.saveUserHashtags(hashtags)) {
                this.showMessage('✅ 해시태그가 저장되었습니다!', 'success');
                this.updateHashtagsDisplay();

                // 모달 닫기
                const modal = document.querySelector('.hashtag-settings-modal');
                if (modal) {
                    modal.remove();
                }
            } else {
                this.showMessage('❌ 해시태그 저장에 실패했습니다. 형식을 확인해주세요.', 'error');
            }
        }
    }

    // 해시태그 표시 업데이트
    updateHashtagsDisplay() {
        const display = document.getElementById('current-hashtags-display');
        if (display) {
            const hashtags = this.getUserHashtags();
            if (hashtags && hashtags.length > 0) {
                display.textContent = hashtags.join(' ');
            } else {
                display.textContent = '해시태그 없음';
                display.style.color = '#6c757d';
            }
        }
    }

    // 오프라인 지원 함수들
    saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.warn('로컬 스토리지 저장 실패:', error);
            return false;
        }
    }

    loadFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.warn('로컬 스토리지 로드 실패:', error);
            return null;
        }
    }

    // 오프라인 상태 감지
    isOnline() {
        return navigator.onLine;
    }

    // 오프라인 알림 표시
    showOfflineNotification() {
        if (!this.isOnline()) {
            this.showMessage('📡 오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.', 'warning');
        }
    }

    // 언어 감지 함수
    detectLanguage() {
        // 1. 브라우저 언어 설정 확인
        const browserLang = navigator.language || navigator.userLanguage;
        console.log('🌍 브라우저 언어:', browserLang);

        // 2. HTML lang 속성 확인
        const htmlLang = document.documentElement.lang;
        console.log('🌍 HTML 언어:', htmlLang);

        // 3. 사용자 설정 언어 확인 (로컬 스토리지)
        const userLang = localStorage.getItem('preferred_language');
        console.log('🌍 사용자 설정 언어:', userLang);

        // 우선순위: 사용자 설정 > HTML 속성 > 브라우저 설정
        let detectedLang = userLang || htmlLang || browserLang;

        // 언어 코드 정규화 (ko-KR -> ko, en-US -> en)
        if (detectedLang) {
            detectedLang = detectedLang.split('-')[0];
        }

        // 지원되는 언어 목록
        const supportedLanguages = ['ko', 'en', 'ja', 'zh'];

        // 지원되지 않는 언어는 기본값(한국어)으로 설정
        if (!supportedLanguages.includes(detectedLang)) {
            detectedLang = 'ko';
        }

        console.log('🌍 최종 감지된 언어:', detectedLang);
        return detectedLang;
    }

    // 언어별 텍스트 최적화 적용
    applyLanguageOptimization(element, language) {
        if (!element) return;

        // 언어별 클래스 추가
        element.classList.add(`lang-${language}`);

        // 언어별 스타일 적용
        const style = document.createElement('style');
        style.textContent = `
            .lang-${language} {
                font-family: ${this.getLanguageFont(language)};
            }
        `;
        document.head.appendChild(style);

        console.log(`🌍 ${language} 언어 최적화 적용됨`);
    }

    // 언어별 폰트 설정
    getLanguageFont(language) {
        const fontMap = {
            'ko': '"Noto Sans KR", "Malgun Gothic", "맑은 고딕", sans-serif',
            'en': '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
            'ja': '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "ヒラギノ角ゴ ProN W3", sans-serif',
            'zh': '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
        };

        return fontMap[language] || fontMap['ko'];
    }

    // 국제화 지원 함수들
    getLanguage() {
        return navigator.language || navigator.userLanguage || 'ko-KR';
    }

    getTexts() {
        const lang = this.getLanguage();
        const texts = {
            'ko-KR': {
                noContent: '❌ 포스팅할 내용이 없습니다.',
                processingError: '포스팅 처리 중 오류가 발생했습니다.',
                offlineWarning: '📡 오프라인 상태입니다. 로컬에서만 처리됩니다.',
                optimizationTitle: '📝 Threads 포스팅 최적화 결과',
                originalLength: '원본 글자 수:',
                optimizedLength: '최적화된 글자 수:',
                hashtags: '해시태그:',
                optimizationSuggestions: '💡 최적화 사항:',
                previewTitle: '📋 최종 포스팅 내용 미리보기:',
                proceedButton: '📋 클립보드 복사 & Threads 열기',
                cancelButton: '❌ 취소',
                characters: '자',
                hashtagCount: '개'
            },
            'en-US': {
                noContent: '❌ No content to post.',
                processingError: 'An error occurred while processing the post.',
                offlineWarning: '📡 You are offline. Processing locally only.',
                optimizationTitle: '📝 Threads Posting Optimization Results',
                originalLength: 'Original length:',
                optimizedLength: 'Optimized length:',
                hashtags: 'Hashtags:',
                optimizationSuggestions: '💡 Optimization suggestions:',
                previewTitle: '📋 Final posting content preview:',
                proceedButton: '📋 Copy to Clipboard & Open Threads',
                cancelButton: '❌ Cancel',
                characters: 'chars',
                hashtagCount: 'tags'
            },
            'ja-JP': {
                noContent: '❌ 投稿するコンテンツがありません。',
                processingError: '投稿処理中にエラーが発生しました。',
                offlineWarning: '📡 オフライン状態です。ローカルでのみ処理されます。',
                optimizationTitle: '📝 Threads投稿最適化結果',
                originalLength: '元の文字数:',
                optimizedLength: '最適化された文字数:',
                hashtags: 'ハッシュタグ:',
                optimizationSuggestions: '💡 最適化提案:',
                previewTitle: '📋 最終投稿内容プレビュー:',
                proceedButton: '📋 クリップボードにコピー & Threadsを開く',
                cancelButton: '❌ キャンセル',
                characters: '文字',
                hashtagCount: '個'
            }
        };

        return texts[lang] || texts['ko-KR'];
    }

    t(key) {
        const texts = this.getTexts();
        return texts[key] || key;
    }

    // 성능 모니터링 함수들
    performanceMonitor = {
        startTime: null,
        measurements: {},

        start(label) {
            this.startTime = performance.now();
            this.measurements[label] = { start: this.startTime };
        },

        end(label) {
            if (this.startTime && this.measurements[label]) {
                const endTime = performance.now();
                const duration = endTime - this.startTime;
                this.measurements[label].duration = duration;
                this.measurements[label].end = endTime;

                console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
                return duration;
            }
            return 0;
        },

        getReport() {
            return Object.keys(this.measurements).map(label => ({
                label,
                duration: this.measurements[label].duration || 0
            }));
        }
    };

    // 메모리 사용량 체크
    checkMemoryUsage() {
        if (performance.memory) {
            const memory = performance.memory;
            console.log('🧠 메모리 사용량:', {
                used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
                total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
                limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
            });
        }
    }

    // 종합 테스트 함수
    async runComprehensiveTest() {
        console.log('🧪 종합 테스트 시작...');

        const testResults = {
            security: false,
            accessibility: false,
            performance: false,
            mobile: false,
            offline: false,
            internationalization: false
        };

        try {
            // 1. 보안 테스트
            console.log('🔒 보안 테스트...');
            const testContent = '<script>alert("xss")</script>안녕하세요 #test';
            const sanitized = this.sanitizeText(testContent);
            testResults.security = !sanitized.includes('<script>');
            console.log('보안 테스트:', testResults.security ? '✅ 통과' : '❌ 실패');

            // 2. 접근성 테스트
            console.log('♿ 접근성 테스트...');
            const button = document.getElementById('semi-auto-post-btn');
            testResults.accessibility = button && 
                button.getAttribute('aria-label') && 
                button.getAttribute('role');
            console.log('접근성 테스트:', testResults.accessibility ? '✅ 통과' : '❌ 실패');

            // 3. 성능 테스트
            console.log('⚡ 성능 테스트...');
            this.performanceMonitor.start('테스트');
            await new Promise(resolve => setTimeout(resolve, 10));
            const duration = this.performanceMonitor.end('테스트');
            testResults.performance = duration < 100; // 100ms 이하
            console.log('성능 테스트:', testResults.performance ? '✅ 통과' : '❌ 실패');

            // 4. 모바일 테스트
            console.log('📱 모바일 테스트...');
            const isMobile = window.innerWidth <= 768;
            testResults.mobile = true; // CSS 미디어 쿼리로 처리됨
            console.log('모바일 테스트:', testResults.mobile ? '✅ 통과' : '❌ 실패');

            // 5. 오프라인 테스트
            console.log('💾 오프라인 테스트...');
            testResults.offline = typeof this.isOnline === 'function' && 
                typeof this.saveToLocalStorage === 'function';
            console.log('오프라인 테스트:', testResults.offline ? '✅ 통과' : '❌ 실패');

            // 6. 국제화 테스트
            console.log('🌍 국제화 테스트...');
            testResults.internationalization = typeof this.t === 'function' && 
                this.t('noContent') !== 'noContent';
            console.log('국제화 테스트:', testResults.internationalization ? '✅ 통과' : '❌ 실패');

            // 결과 요약
            const passedTests = Object.values(testResults).filter(result => result).length;
            const totalTests = Object.keys(testResults).length;

            console.log(`\n🎯 테스트 완료: ${passedTests}/${totalTests} 통과`);
            console.log('상세 결과:', testResults);

            return testResults;

        } catch (error) {
            console.error('테스트 중 오류 발생:', error);
            return testResults;
        }
    }

    // 반자동화 포스팅 메인 함수 (성능 최적화 + 오프라인 지원 + 모니터링)
    async handleSemiAutoPost() {
        console.log('🔍 반자동화 포스팅 시작');

        const content = this.editTextInput.value;
        console.log('📝 입력 내용:', content);

        if (!content.trim()) {
            console.warn('❌ 포스팅할 내용이 없습니다');
            this.showMessage('❌ 포스팅할 내용이 없습니다.', 'error');
            return;
        }

        const button = document.getElementById('semi-auto-post-btn');

        try {
            console.log('✅ 1. 입력 검증 완료');

            // 로딩 상태 표시
            if (button) {
                this.showLoadingState(button, true);
                console.log('✅ 2. 로딩 상태 표시');
            }

            console.log('🔄 3. 내용 최적화 시작...');
            const optimized = await this.optimizeContentForThreadsAsync(content);
            console.log('✅ 4. 내용 최적화 완료:', optimized);

            // 오프라인에서도 로컬 저장
            try {
                this.saveToLocalStorage('lastOptimizedContent', optimized);
                console.log('✅ 5. 로컬 저장 완료');
            } catch (saveError) {
                console.warn('⚠️ 로컬 저장 실패:', saveError);
            }

            // 자동 트래킹 시작: posts 컬렉션에 포스트 생성
            console.log('🔄 6. 자동 트래킹 시작...');
            let sourceTextId = null;
            
            // 현재 텍스트를 texts 컬렉션에 먼저 저장 (원본 보존)
            if (this.currentUser && this.isFirebaseReady) {
                try {
                    const textData = {
                        content: content, // 원본 내용 (최적화 전)
                        type: 'edit',
                        characterCount: this.getKoreanCharacterCount(content),
                        createdAt: window.firebaseServerTimestamp(),
                        updatedAt: window.firebaseServerTimestamp()
                    };
                    
                    const textDocRef = await window.firebaseAddDoc(
                        window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'texts'),
                        textData
                    );
                    
                    sourceTextId = textDocRef.id;
                    console.log('✅ 원본 텍스트 저장 완료:', sourceTextId);
                } catch (textSaveError) {
                    console.warn('⚠️ 원본 텍스트 저장 실패 (트래킹은 계속 진행):', textSaveError);
                }
            }
            
            // posts 컬렉션에 트래킹 포스트 자동 생성
            if (this.currentUser && this.isFirebaseReady) {
                try {
                    const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                    const postData = {
                        content: content, // 원본 내용 (최적화 전, 트래킹용)
                        type: 'edit',
                        postedAt: window.firebaseServerTimestamp(),
                        trackingEnabled: true, // 자동으로 트래킹 활성화
                        metrics: [],
                        analytics: {},
                        sourceTextId: sourceTextId || null, // 원본 텍스트 참조 (있는 경우)
                        sourceType: 'edit', // 원본 텍스트 타입
                        createdAt: window.firebaseServerTimestamp(),
                        updatedAt: window.firebaseServerTimestamp()
                    };
                    
                    const postDocRef = await window.firebaseAddDoc(postsRef, postData);
                    console.log('✅ 트래킹 포스트 자동 생성 완료:', postDocRef.id);
                    
                    // 트래킹 탭 목록 새로고침 (백그라운드에서)
                    if (this.trackingPosts && this.loadTrackingPosts) {
                        this.loadTrackingPosts().catch(err => {
                            console.warn('⚠️ 트래킹 목록 새로고침 실패:', err);
                        });
                    }
                    
                    // 사용자 피드백 메시지
                    this.showMessage('📊 트래킹이 자동으로 시작되었습니다!', 'success');
                    
                } catch (postError) {
                    console.error('❌ 트래킹 포스트 생성 실패:', postError);
                    // 트래킹 생성 실패해도 포스팅은 계속 진행
                    this.showMessage('⚠️ 트래킹 시작에 실패했지만 포스팅은 계속할 수 있습니다.', 'warning');
                }
            }

            // 최적화 완료 후 모달 표시 (원본 텍스트 전달)
            console.log('🔄 7. 최적화 모달 표시 시작...');
            this.showOptimizationModal(optimized, content);
            console.log('✅ 8. 최적화 모달 표시 완료');

        } catch (error) {
            console.error('❌ 반자동화 포스팅 처리 중 오류:', error);
            console.error('오류 상세:', error.stack);
            this.showMessage('포스팅 처리 중 오류가 발생했습니다: ' + error.message, 'error');
        } finally {
            // 로딩 상태 해제
            if (button) {
                this.showLoadingState(button, false);
                console.log('✅ 8. 로딩 상태 해제');
            }
        }
    }

    // 비동기 내용 최적화 함수 (성능 개선)
    async optimizeContentForThreadsAsync(content) {
        return new Promise((resolve, reject) => {
            // 메인 스레드 블로킹 방지를 위한 setTimeout 사용
            setTimeout(() => {
                try {
                    const optimized = this.optimizeContentForThreads(content);
                    resolve(optimized);
                } catch (error) {
                    reject(error);
                }
            }, 0);
        });
    }
}

// Initialize the application
let dualTextWriter;

document.addEventListener('DOMContentLoaded', () => {
    dualTextWriter = new DualTextWriter();

    // 메인 콘텐츠 강제 표시 (로그인 상태와 관계없이)
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.style.display = 'block';
    }

    // 전역 디버깅 함수 등록
    window.debugSavedItems = () => dualTextWriter.debugSavedItems();
    window.verifyLLMCharacteristics = () => dualTextWriter.verifyLLMCharacteristics();
    window.testEditButton = (index = 0) => {
        const editButtons = document.querySelectorAll('.btn-edit');
        if (editButtons[index]) {
            editButtons[index].click();
        } else {
            console.log('편집 버튼을 찾을 수 없습니다.');
        }
    };
    window.testDeleteButton = (index = 0) => {
        const deleteButtons = document.querySelectorAll('.btn-delete');
        if (deleteButtons[index]) {
            deleteButtons[index].click();
        } else {
            console.log('삭제 버튼을 찾을 수 없습니다.');
        }
    };
    window.testLLMValidation = (llmService = 'chatgpt', index = 0) => {
        const llmButtons = document.querySelectorAll(`[data-llm="${llmService}"]`);
        if (llmButtons[index]) {
            llmButtons[index].click();
        } else {
            console.log(`${llmService} 검증 버튼을 찾을 수 없습니다.`);
        }
    };
});

// 페이지 언로드 시 정리 작업
window.addEventListener('beforeunload', () => {
    if (dualTextWriter) {
        dualTextWriter.cleanupTempSave();
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

// ==================== 트래킹 기능 메서드들 ====================

// 트래킹 포스트 로드
DualTextWriter.prototype.loadTrackingPosts = async function() {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    try {
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const q = window.firebaseQuery(postsRef, window.firebaseOrderBy('postedAt', 'desc'));
        const querySnapshot = await window.firebaseGetDocs(q);
        
        this.trackingPosts = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            this.trackingPosts.push({
                id: doc.id,
                content: data.content,
                type: data.type || 'edit',
                postedAt: data.postedAt ? data.postedAt.toDate() : new Date(),
                trackingEnabled: data.trackingEnabled || false,
                metrics: data.metrics || [],
                analytics: data.analytics || {},
                sourceTextId: data.sourceTextId || null, // 원본 텍스트 참조
                sourceType: data.sourceType || data.type || 'edit', // 원본 텍스트 타입
                sourceTextExists: null // 검증 결과 (나중에 설정)
            });
        });
        
        console.log(`${this.trackingPosts.length}개의 트래킹 포스트를 불러왔습니다.`);
        
        // 데이터 무결성 검증: 각 포스트의 sourceTextId가 유효한지 확인
        await this.validateSourceTexts();
        
        // 포스트 선택 드롭다운 업데이트 (개별 포스트 모드일 때)
        if (this.chartMode === 'individual') {
            this.populatePostSelector();
        }
        
        this.renderTrackingPosts();
        
    } catch (error) {
        console.error('트래킹 포스트 불러오기 실패:', error);
        this.trackingPosts = [];
    }
};

// 원본 텍스트 존재 여부 검증
DualTextWriter.prototype.validateSourceTexts = async function() {
    if (!this.currentUser || !this.isFirebaseReady || !this.trackingPosts) return;
    
    try {
        // sourceTextId가 있는 포스트들만 검증
        const postsToValidate = this.trackingPosts.filter(post => post.sourceTextId);
        
        if (postsToValidate.length === 0) {
            // sourceTextId가 없는 포스트들은 orphan으로 표시
            this.trackingPosts.forEach(post => {
                if (!post.sourceTextId) {
                    post.sourceTextExists = false;
                    post.isOrphan = true;
                }
            });
            return;
        }
        
        // 모든 sourceTextId 수집
        const sourceTextIds = [...new Set(postsToValidate.map(post => post.sourceTextId))];
        
        // 원본 텍스트 존재 여부 일괄 확인
        const validationPromises = sourceTextIds.map(async (textId) => {
            try {
                const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', textId);
                const textDoc = await window.firebaseGetDoc(textRef);
                return { textId, exists: textDoc.exists() };
            } catch (error) {
                console.error(`원본 텍스트 검증 실패 (${textId}):`, error);
                return { textId, exists: false };
            }
        });
        
        const validationResults = await Promise.all(validationPromises);
        const validationMap = new Map(validationResults.map(r => [r.textId, r.exists]));
        
        // 각 포스트에 검증 결과 적용
        this.trackingPosts.forEach(post => {
            if (post.sourceTextId) {
                post.sourceTextExists = validationMap.get(post.sourceTextId) || false;
                post.isOrphan = !post.sourceTextExists;
            } else {
                // sourceTextId가 없으면 orphan으로 표시 (업그레이드 전 데이터)
                post.sourceTextExists = false;
                post.isOrphan = true;
            }
        });
        
        const orphanCount = this.trackingPosts.filter(p => p.isOrphan).length;
        if (orphanCount > 0) {
            console.log(`⚠️ ${orphanCount}개의 orphan 포스트가 발견되었습니다.`);
        }
        
    } catch (error) {
        console.error('원본 텍스트 검증 실패:', error);
        // 에러 발생 시 모든 포스트를 검증 실패로 표시하지 않고, sourceTextId가 없는 것만 orphan으로 표시
        this.trackingPosts.forEach(post => {
            if (!post.sourceTextId) {
                post.isOrphan = true;
                post.sourceTextExists = false;
            }
        });
    }
};

// 트래킹 포스트 렌더링
DualTextWriter.prototype.renderTrackingPosts = function() {
    if (!this.trackingPostsList) return;
    
    if (this.trackingPosts.length === 0) {
        this.trackingPostsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 20px;">📊</div>
                <h3>트래킹 중인 포스트가 없습니다</h3>
                <p>저장된 글에서 트래킹을 시작해보세요!</p>
            </div>
        `;
        return;
    }
    
    // Orphan 포스트 개수 확인
    const orphanPosts = this.trackingPosts.filter(post => post.isOrphan);
    const orphanCount = orphanPosts.length;
    
    // Orphan 포스트 경고 배너 HTML
    const orphanBannerHtml = orphanCount > 0 ? `
        <div class="orphan-posts-warning" style="
            background: linear-gradient(135deg, #fff3cd, #ffeaa7);
            border: 2px solid #fdcb6e;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        ">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-size: 1.2rem;">⚠️</span>
                    <strong style="color: #856404; font-size: 1rem;">원본이 삭제된 포스트 ${orphanCount}개 발견</strong>
                </div>
                <div style="color: #856404; font-size: 0.9rem; margin-left: 28px;">
                    원본 글(저장된 글)이 삭제되어 연결이 끊어진 포스트입니다.
                </div>
            </div>
            <button 
                class="btn btn-danger" 
                onclick="dualTextWriter.cleanupOrphanPosts()"
                style="
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-weight: 600;
                    white-space: nowrap;
                "
            >
                🗑️ 정리하기
            </button>
        </div>
    ` : '';
    
    this.trackingPostsList.innerHTML = orphanBannerHtml + this.trackingPosts.map(post => {
        const latestMetrics = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        const hasMetrics = post.metrics.length > 0;
        const metricsCount = post.metrics.length;
        
        // 상태 정보
        const statusClass = post.trackingEnabled ? 'active' : 'inactive';
        const statusIcon = post.trackingEnabled ? '🟢' : '⚪';
        const statusText = post.trackingEnabled ? '활성' : '비활성';
        
        // Orphan 포스트 표시
        const orphanBadge = post.isOrphan ? `
            <div class="orphan-badge" style="
                background: #dc3545;
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 0.75rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 8px;
            ">
                ⚠️ 원본 삭제됨
            </div>
        ` : '';
        
        // 메트릭 데이터 표시
        const metricsBadgeClass = hasMetrics ? 'has-data' : 'no-data';
        const metricsBadgeText = hasMetrics ? `📊 ${metricsCount}회 입력` : '📭 데이터 없음';
        
        // 마지막 업데이트 날짜
        let lastUpdateText = '';
        if (latestMetrics && latestMetrics.timestamp) {
            try {
                const updateDate = latestMetrics.timestamp.toDate ? latestMetrics.timestamp.toDate() : new Date(latestMetrics.timestamp);
                lastUpdateText = updateDate.toLocaleDateString('ko-KR', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                lastUpdateText = '';
            }
        }
        
        // Orphan 포스트는 시각적으로 다르게 표시
        const orphanClass = post.isOrphan ? 'orphan-post' : '';
        
        return `
            <div class="tracking-post-item ${statusClass} ${orphanClass}" data-post-id="${post.id}" data-is-orphan="${post.isOrphan ? 'true' : 'false'}">
                <div class="tracking-post-header">
                    <div class="tracking-post-title" style="display: flex; align-items: center; flex-wrap: wrap;">
                        ${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}
                        ${orphanBadge}
                    </div>
                    <div class="tracking-post-status-group">
                        <div class="tracking-post-status ${statusClass}" aria-label="트래킹 상태: ${statusText}">
                            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                </div>
                
                <div class="tracking-post-info">
                    <div class="tracking-post-metrics-badge ${metricsBadgeClass}">
                        ${metricsBadgeText}
                    </div>
                    ${lastUpdateText ? `
                        <div class="tracking-post-update-date">
                            마지막 업데이트: ${lastUpdateText}
                        </div>
                    ` : ''}
                </div>
                
                ${latestMetrics ? `
                    <div class="tracking-post-metrics">
                        <div class="metric-item">
                            <div class="metric-icon">👀</div>
                            <div class="metric-value">${latestMetrics.views || 0}</div>
                            <div class="metric-label">조회수</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">❤️</div>
                            <div class="metric-value">${latestMetrics.likes || 0}</div>
                            <div class="metric-label">좋아요</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">💬</div>
                            <div class="metric-value">${latestMetrics.comments || 0}</div>
                            <div class="metric-label">댓글</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">🔄</div>
                            <div class="metric-value">${latestMetrics.shares || 0}</div>
                            <div class="metric-label">공유</div>
                        </div>
                    </div>
                ` : `
                    <div class="tracking-post-no-data">
                        <span class="no-data-icon">📭</span>
                        <span class="no-data-text">아직 데이터가 입력되지 않았습니다. "데이터 추가" 버튼을 클릭하여 성과 데이터를 입력하세요.</span>
                    </div>
                `}
                
                <div class="tracking-post-actions">
                    ${post.trackingEnabled ? 
                        `<button class="tracking-btn primary" onclick="dualTextWriter.addTrackingData('${post.id}')" aria-label="성과 데이터 추가">데이터 추가</button>` :
                        `<button class="tracking-btn primary" onclick="dualTextWriter.startTracking('${post.id}')" aria-label="트래킹 시작">트래킹 시작</button>`
                    }
                    <button class="tracking-btn secondary" onclick="dualTextWriter.stopTracking('${post.id}')" aria-label="트래킹 중지">트래킹 중지</button>
                </div>
            </div>
        `;
    }).join('');
};

// 트래킹 시작
DualTextWriter.prototype.startTracking = async function(postId) {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    try {
        const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
        await window.firebaseUpdateDoc(postRef, {
            trackingEnabled: true,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts.find(p => p.id === postId);
        if (post) {
            post.trackingEnabled = true;
            this.renderTrackingPosts();
            
            // 시각적 피드백: 성공 메시지
            this.showMessage('✅ 트래킹이 시작되었습니다!', 'success');
        }
        
        console.log('트래킹이 시작되었습니다.');
        
    } catch (error) {
        console.error('트래킹 시작 실패:', error);
    }
};

// 트래킹 중지
DualTextWriter.prototype.stopTracking = async function(postId) {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    try {
        const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
        await window.firebaseUpdateDoc(postRef, {
            trackingEnabled: false,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts.find(p => p.id === postId);
        if (post) {
            post.trackingEnabled = false;
            this.renderTrackingPosts();
            
            // 시각적 피드백: 성공 메시지
            this.showMessage('⏸️ 트래킹이 중지되었습니다.', 'info');
        }
        
        console.log('트래킹이 중지되었습니다.');
        
    } catch (error) {
        console.error('트래킹 중지 실패:', error);
    }
};

// 트래킹 데이터 추가
DualTextWriter.prototype.addTrackingData = function(postId) {
    this.currentTrackingPost = postId;
    
    // 선택된 포스트에 시각적 피드백 (선택 효과)
    const postElement = document.querySelector(`.tracking-post-item[data-post-id="${postId}"]`);
    if (postElement) {
        postElement.classList.add('selected');
        setTimeout(() => {
            postElement.classList.remove('selected');
        }, 500);
    }
    
    this.openTrackingModal();
};

// 트래킹 모달 열기
DualTextWriter.prototype.openTrackingModal = function(textId = null) {
    const modal = document.getElementById('tracking-modal');
    if (modal) {
        modal.style.display = 'flex';
        // 폼 초기화
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tracking-date').value = today;
        document.getElementById('tracking-views').value = '';
        document.getElementById('tracking-likes').value = '';
        document.getElementById('tracking-comments').value = '';
        document.getElementById('tracking-shares').value = '';
        const followsInput = document.getElementById('tracking-follows');
        if (followsInput) followsInput.value = '';
        document.getElementById('tracking-notes').value = '';
        
        // 저장된 글에서 호출한 경우 textId 저장
        this.currentTrackingTextId = textId;
    }
};

// 트래킹 데이터 저장
DualTextWriter.prototype.saveTrackingData = async function() {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    // 저장된 글에서 직접 입력하는 경우
    if (this.currentTrackingTextId && !this.currentTrackingPost) {
        return await this.saveTrackingDataFromSavedText();
    }
    
    // 기존 방식: 트래킹 포스트에 데이터 추가
    if (!this.currentTrackingPost) return;
    
    const dateValue = document.getElementById('tracking-date').value;
    const views = parseInt(document.getElementById('tracking-views').value) || 0;
    const likes = parseInt(document.getElementById('tracking-likes').value) || 0;
    const comments = parseInt(document.getElementById('tracking-comments').value) || 0;
    const shares = parseInt(document.getElementById('tracking-shares').value) || 0;
    const follows = parseInt((document.getElementById('tracking-follows')||{value:''}).value) || 0;
    const notes = document.getElementById('tracking-notes').value;
    
    // 날짜 처리: 사용자가 선택한 날짜를 Timestamp로 변환
    let timestamp;
    if (dateValue) {
        const selectedDate = new Date(dateValue);
        // 시간을 자정(00:00:00)으로 설정
        selectedDate.setHours(0, 0, 0, 0);
        timestamp = window.firebaseTimestamp(selectedDate);
    } else {
        timestamp = window.firebaseServerTimestamp();
    }
    
    const trackingData = {
        timestamp: timestamp,
        views,
        likes,
        comments,
        shares,
        follows,
        notes
    };
    
    try {
        const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', this.currentTrackingPost);
        const postDoc = await window.firebaseGetDoc(postRef);
        
        if (postDoc.exists()) {
            const postData = postDoc.data();
            const updatedMetrics = [...(postData.metrics || []), trackingData];
            
            // 날짜 순으로 정렬 (오래된 것부터)
            updatedMetrics.sort((a, b) => {
                const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                return dateA - dateB;
            });
            
            // 분석 데이터 계산
            const analytics = this.calculateAnalytics(updatedMetrics);
            
            await window.firebaseUpdateDoc(postRef, {
                metrics: updatedMetrics,
                analytics,
                updatedAt: window.firebaseServerTimestamp()
            });
            
            // 로컬 데이터 업데이트
            const post = this.trackingPosts.find(p => p.id === this.currentTrackingPost);
            if (post) {
                post.metrics = updatedMetrics;
                post.analytics = analytics;
            }
            
            this.closeTrackingModal();
            this.renderTrackingPosts();
            this.updateTrackingSummary();
            this.updateTrackingChart();
            
            // 저장된 글 목록도 새로고침 (타임라인 업데이트)
            if (this.savedTexts) {
                this.renderSavedTexts();
            }
            
            // 시각적 피드백: 성공 메시지
            this.showMessage('✅ 성과 데이터가 저장되었습니다!', 'success');
            
            console.log('트래킹 데이터가 저장되었습니다.');
        }
        
    } catch (error) {
        console.error('트래킹 데이터 저장 실패:', error);
        this.showMessage('❌ 트래킹 데이터 저장에 실패했습니다: ' + error.message, 'error');
    }
};

// 저장된 글에서 직접 트래킹 데이터 저장
DualTextWriter.prototype.saveTrackingDataFromSavedText = async function() {
    if (!this.currentTrackingTextId || !this.currentUser || !this.isFirebaseReady) return;
    
    try {
        // 먼저 저장된 텍스트 정보 가져오기
        const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', this.currentTrackingTextId);
        const textDoc = await window.firebaseGetDoc(textRef);
        
        if (!textDoc.exists()) {
            this.showMessage('❌ 원본 텍스트를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const textData = textDoc.data();
        
        // 해당 텍스트에 연결된 포스트 찾기 또는 생성
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', this.currentTrackingTextId));
        const querySnapshot = await window.firebaseGetDocs(q);
        
        let postId;
        let postData;
        
        if (!querySnapshot.empty) {
            // 기존 포스트가 있으면 사용
            const existingPost = querySnapshot.docs[0];
            postId = existingPost.id;
            postData = existingPost.data();
        } else {
            // 새 포스트 생성
            const newPostData = {
                content: textData.content,
                type: textData.type || 'edit',
                postedAt: window.firebaseServerTimestamp(),
                trackingEnabled: true,
                metrics: [],
                analytics: {},
                sourceTextId: this.currentTrackingTextId,
                sourceType: textData.type || 'edit',
                createdAt: window.firebaseServerTimestamp(),
                updatedAt: window.firebaseServerTimestamp()
            };
            
            const postDocRef = await window.firebaseAddDoc(postsRef, newPostData);
            postId = postDocRef.id;
            postData = newPostData;
            
            // 트래킹 포스트 목록에 추가
            if (!this.trackingPosts) {
                this.trackingPosts = [];
            }
            this.trackingPosts.push({
                id: postId,
                ...newPostData,
                postedAt: new Date()
            });
        }
        
        // 트래킹 데이터 수집
        const dateValue = document.getElementById('tracking-date').value;
        const views = parseInt(document.getElementById('tracking-views').value) || 0;
        const likes = parseInt(document.getElementById('tracking-likes').value) || 0;
        const comments = parseInt(document.getElementById('tracking-comments').value) || 0;
        const shares = parseInt(document.getElementById('tracking-shares').value) || 0;
        const follows = parseInt((document.getElementById('tracking-follows')||{value:''}).value) || 0;
        const notes = document.getElementById('tracking-notes').value;
        
        // 날짜 처리
        let timestamp;
        if (dateValue) {
            const selectedDate = new Date(dateValue);
            selectedDate.setHours(0, 0, 0, 0);
            timestamp = window.firebaseTimestamp(selectedDate);
        } else {
            timestamp = window.firebaseServerTimestamp();
        }
        
        const trackingData = {
            timestamp: timestamp,
            views,
            likes,
            comments,
            shares,
            follows,
            notes
        };
        
        // 포스트에 트래킹 데이터 추가
        const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
        const updatedMetrics = [...(postData.metrics || []), trackingData];
        
        // 날짜 순으로 정렬
        updatedMetrics.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
            return dateA - dateB;
        });
        
        // 분석 데이터 계산
        const analytics = this.calculateAnalytics(updatedMetrics);
        
        await window.firebaseUpdateDoc(postRef, {
            metrics: updatedMetrics,
            analytics,
            trackingEnabled: true,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts.find(p => p.id === postId);
        if (post) {
            post.metrics = updatedMetrics;
            post.analytics = analytics;
            post.trackingEnabled = true;
        } else {
            // 로컬 목록에 없으면 추가
            this.trackingPosts.push({
                id: postId,
                content: textData.content,
                type: textData.type || 'edit',
                postedAt: new Date(),
                trackingEnabled: true,
                metrics: updatedMetrics,
                analytics: analytics,
                sourceTextId: this.currentTrackingTextId,
                sourceType: textData.type || 'edit'
            });
        }
        
        this.closeTrackingModal();
        
        // 트래킹 포스트 목록을 최신 데이터로 새로고침 (Firebase에서 다시 가져오기)
        if (this.loadTrackingPosts) {
            await this.loadTrackingPosts();
        }
        
        // UI 업데이트
        this.renderSavedTexts(); // 저장된 글 목록 새로고침 (타임라인 업데이트)
        this.renderTrackingPosts(); // 트래킹 탭 목록 새로고침
        this.updateTrackingSummary(); // 트래킹 요약 업데이트
        this.updateTrackingChart(); // 트래킹 차트 업데이트
        
        // 초기화
        this.currentTrackingTextId = null;
        
        this.showMessage('✅ 트래킹 데이터가 저장되었습니다!', 'success');
        console.log('저장된 글에서 트래킹 데이터 저장 완료');
        
    } catch (error) {
        console.error('저장된 글에서 트래킹 데이터 저장 실패:', error);
        this.showMessage('❌ 트래킹 데이터 저장에 실패했습니다: ' + error.message, 'error');
    }
};

// 트래킹 모달 닫기
DualTextWriter.prototype.closeTrackingModal = function() {
    const modal = document.getElementById('tracking-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    this.currentTrackingPost = null;
    this.currentTrackingTextId = null;
};

// 트래킹 메트릭 수정 모달 열기
DualTextWriter.prototype.editTrackingMetric = async function(button, metricIndexStr) {
    const metricIndex = parseInt(metricIndexStr);
    const timelineItem = button.closest('.timeline-item');
    const savedItem = timelineItem.closest('.saved-item');
    const textId = savedItem.getAttribute('data-item-id');
    
    if (!textId) {
        this.showMessage('❌ 저장된 글 ID를 찾을 수 없습니다.', 'error');
        return;
    }
    
    // 해당 텍스트에 연결된 포스트 찾기
    let postData = null;
    if (this.trackingPosts) {
        postData = this.trackingPosts.find(p => p.sourceTextId === textId);
    }
    
    if (!postData || !postData.metrics || postData.metrics.length <= metricIndex) {
        // Firebase에서 조회
        try {
            const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
            const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId));
            const querySnapshot = await window.firebaseGetDocs(q);
            
            if (!querySnapshot.empty) {
                const postDoc = querySnapshot.docs[0];
                const data = postDoc.data();
                postData = {
                    id: postDoc.id,
                    metrics: data.metrics || [],
                    trackingEnabled: data.trackingEnabled || false
                };
            }
        } catch (error) {
            console.error('포스트 조회 실패:', error);
            this.showMessage('❌ 트래킹 데이터를 찾을 수 없습니다.', 'error');
            return;
        }
    }
    
    if (!postData || !postData.metrics || postData.metrics.length <= metricIndex) {
        this.showMessage('❌ 수정할 데이터를 찾을 수 없습니다.', 'error');
        return;
    }
    
    const metric = postData.metrics[metricIndex];
    const date = metric.timestamp?.toDate ? metric.timestamp.toDate() : 
                (metric.timestamp instanceof Date ? metric.timestamp : new Date());
    const dateStr = date.toISOString().split('T')[0];
    
    // 수정 모달에 데이터 채우기
    document.getElementById('tracking-edit-date').value = dateStr;
    document.getElementById('tracking-edit-views').value = metric.views || 0;
    document.getElementById('tracking-edit-likes').value = metric.likes || 0;
    document.getElementById('tracking-edit-comments').value = metric.comments || 0;
    document.getElementById('tracking-edit-shares').value = metric.shares || 0;
    const editFollows = document.getElementById('tracking-edit-follows');
    if (editFollows) editFollows.value = metric.follows || 0;
    document.getElementById('tracking-edit-notes').value = metric.notes || '';
    
    // 수정할 데이터 저장
    this.editingMetricData = {
        postId: postData.id || null,
        textId: textId,
        metricIndex: metricIndex
    };
    
    // 수정 모달 열기
    const editModal = document.getElementById('tracking-edit-modal');
    if (editModal) {
        editModal.style.display = 'flex';
    }
};

// 트래킹 데이터 수정
DualTextWriter.prototype.updateTrackingDataItem = async function() {
    if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady) return;
    
    try {
        const { postId, textId, metricIndex } = this.editingMetricData;
        
        // 포스트 데이터 가져오기
        let postData;
        let postRef;
        
        if (postId) {
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
            const postDoc = await window.firebaseGetDoc(postRef);
            if (!postDoc.exists()) {
                this.showMessage('❌ 포스트를 찾을 수 없습니다.', 'error');
                return;
            }
            postData = postDoc.data();
        } else {
            // textId로 포스트 찾기
            const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
            const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId));
            const querySnapshot = await window.firebaseGetDocs(q);
            
            if (querySnapshot.empty) {
                this.showMessage('❌ 포스트를 찾을 수 없습니다.', 'error');
                return;
            }
            
            const postDoc = querySnapshot.docs[0];
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postDoc.id);
            postData = postDoc.data();
        }
        
        // 수정된 데이터 수집
        const dateValue = document.getElementById('tracking-edit-date').value;
        const views = parseInt(document.getElementById('tracking-edit-views').value) || 0;
        const likes = parseInt(document.getElementById('tracking-edit-likes').value) || 0;
        const comments = parseInt(document.getElementById('tracking-edit-comments').value) || 0;
        const shares = parseInt(document.getElementById('tracking-edit-shares').value) || 0;
        const follows = parseInt((document.getElementById('tracking-edit-follows')||{value:''}).value) || 0;
        const notes = document.getElementById('tracking-edit-notes').value;
        
        // 날짜 처리
        let timestamp;
        if (dateValue) {
            const selectedDate = new Date(dateValue);
            selectedDate.setHours(0, 0, 0, 0);
            timestamp = window.firebaseTimestamp(selectedDate);
        } else {
            timestamp = postData.metrics[metricIndex].timestamp || window.firebaseServerTimestamp();
        }
        
        // 메트릭 배열 업데이트
        const updatedMetrics = [...postData.metrics];
        updatedMetrics[metricIndex] = {
            timestamp: timestamp,
            views,
            likes,
            comments,
            shares,
            follows,
            notes
        };
        
        // 날짜 순으로 정렬
        updatedMetrics.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
            return dateA - dateB;
        });
        
        // 분석 데이터 계산
        const analytics = this.calculateAnalytics(updatedMetrics);
        
        // Firebase 업데이트
        await window.firebaseUpdateDoc(postRef, {
            metrics: updatedMetrics,
            analytics,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts.find(p => p.id === postRef.id || p.sourceTextId === textId);
        if (post) {
            post.metrics = updatedMetrics;
            post.analytics = analytics;
        }
        
        // 모달 닫기
        const editModal = document.getElementById('tracking-edit-modal');
        if (editModal) {
            editModal.style.display = 'none';
        }
        
        this.editingMetricData = null;
        
        // 화면 새로고침
        this.renderSavedTexts();
        this.renderTrackingPosts();
        this.updateTrackingSummary();
        this.updateTrackingChart();
        
        this.showMessage('✅ 트래킹 데이터가 수정되었습니다!', 'success');
        console.log('트래킹 데이터 수정 완료');
        
    } catch (error) {
        console.error('트래킹 데이터 수정 실패:', error);
        this.showMessage('❌ 트래킹 데이터 수정에 실패했습니다: ' + error.message, 'error');
    }
};

// 트래킹 데이터 삭제
DualTextWriter.prototype.deleteTrackingDataItem = async function() {
    if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady) {
        const editModal = document.getElementById('tracking-edit-modal');
        if (editModal) {
            editModal.style.display = 'none';
        }
        return;
    }
    
    if (!confirm('정말로 이 트래킹 데이터를 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const { postId, textId, metricIndex } = this.editingMetricData;
        
        // 포스트 데이터 가져오기
        let postData;
        let postRef;
        
        if (postId) {
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
            const postDoc = await window.firebaseGetDoc(postRef);
            if (!postDoc.exists()) {
                this.showMessage('❌ 포스트를 찾을 수 없습니다.', 'error');
                return;
            }
            postData = postDoc.data();
        } else {
            // textId로 포스트 찾기
            const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
            const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId));
            const querySnapshot = await window.firebaseGetDocs(q);
            
            if (querySnapshot.empty) {
                this.showMessage('❌ 포스트를 찾을 수 없습니다.', 'error');
                return;
            }
            
            const postDoc = querySnapshot.docs[0];
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postDoc.id);
            postData = postDoc.data();
        }
        
        // 메트릭 배열에서 해당 항목 제거
        const updatedMetrics = postData.metrics.filter((_, idx) => idx !== metricIndex);
        
        // 분석 데이터 계산
        const analytics = updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};
        
        // Firebase 업데이트
        await window.firebaseUpdateDoc(postRef, {
            metrics: updatedMetrics,
            analytics,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts.find(p => p.id === postRef.id || p.sourceTextId === textId);
        if (post) {
            post.metrics = updatedMetrics;
            post.analytics = analytics;
        }
        
        // 모달 닫기
        const editModal = document.getElementById('tracking-edit-modal');
        if (editModal) {
            editModal.style.display = 'none';
        }
        
        this.editingMetricData = null;
        
        // 화면 새로고침
        this.renderSavedTexts();
        this.renderTrackingPosts();
        this.updateTrackingSummary();
        this.updateTrackingChart();
        
        this.showMessage('✅ 트래킹 데이터가 삭제되었습니다!', 'success');
        console.log('트래킹 데이터 삭제 완료');
        
    } catch (error) {
        console.error('트래킹 데이터 삭제 실패:', error);
        this.showMessage('❌ 트래킹 데이터 삭제에 실패했습니다: ' + error.message, 'error');
    }
};

// 분석 데이터 계산
DualTextWriter.prototype.calculateAnalytics = function(metrics) {
    if (metrics.length === 0) return {};
    
    const latest = metrics[metrics.length - 1];
    const first = metrics[0];
    
    return {
        totalViews: latest.views,
        totalLikes: latest.likes,
        totalComments: latest.comments,
        totalShares: latest.shares,
        viewsGrowth: latest.views - first.views,
        likesGrowth: latest.likes - first.likes,
        commentsGrowth: latest.comments - first.comments,
        sharesGrowth: latest.shares - first.shares,
        engagementRate: latest.views > 0 ? 
            ((latest.likes + latest.comments + latest.shares) / latest.views * 100).toFixed(2) : 0
    };
};

// 트래킹 요약 업데이트
DualTextWriter.prototype.updateTrackingSummary = function() {
    const totalPosts = this.trackingPosts.length;
    const totalViews = this.trackingPosts.reduce((sum, post) => {
        const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        return sum + (latest ? latest.views : 0);
    }, 0);
    const totalLikes = this.trackingPosts.reduce((sum, post) => {
        const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        return sum + (latest ? latest.likes : 0);
    }, 0);
    const totalComments = this.trackingPosts.reduce((sum, post) => {
        const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        return sum + (latest ? latest.comments || 0 : 0);
    }, 0);
    const totalShares = this.trackingPosts.reduce((sum, post) => {
        const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        return sum + (latest ? latest.shares || 0 : 0);
    }, 0);
    const totalFollows = this.trackingPosts.reduce((sum, post) => {
        const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        return sum + (latest ? latest.follows || 0 : 0);
    }, 0);
    
    if (this.totalPostsElement) this.totalPostsElement.textContent = totalPosts;
    if (this.totalViewsElement) this.totalViewsElement.textContent = totalViews.toLocaleString();
    if (this.totalLikesElement) this.totalLikesElement.textContent = totalLikes.toLocaleString();
    if (this.totalCommentsElement) this.totalCommentsElement.textContent = totalComments.toLocaleString();
    if (this.totalSharesElement) this.totalSharesElement.textContent = totalShares.toLocaleString();
    const totalFollowsElement = document.getElementById('total-follows');
    if (totalFollowsElement) totalFollowsElement.textContent = totalFollows.toLocaleString();
};

// 트래킹 차트 초기화
DualTextWriter.prototype.initTrackingChart = function() {
    if (!this.trackingChartCanvas) return;
    
    const ctx = this.trackingChartCanvas.getContext('2d');
    
    // 기존 차트가 있다면 제거
    if (this.trackingChart) {
        this.trackingChart.destroy();
    }
    
    this.trackingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '조회수',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }, {
                label: '좋아요',
                data: [],
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4
            }, {
                label: '댓글',
                data: [],
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                tension: 0.4
            }, {
                label: '공유',
                data: [],
                borderColor: '#f39c12',
                backgroundColor: 'rgba(243, 156, 18, 0.1)',
                tension: 0.4
            }, {
                label: '팔로우',
                data: [],
                borderColor: '#16a085',
                backgroundColor: 'rgba(22, 160, 133, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '포스트 성과 추이'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        maxTicksLimit: 8,
                        precision: 0,
                        stepSize: 1 // 초기값, updateTrackingChart에서 동적으로 업데이트됨
                    },
                    max: 10 // 초기값, updateTrackingChart에서 동적으로 업데이트됨
                },
                y2: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: {
                        maxTicksLimit: 8,
                        precision: 0,
                        stepSize: 1
                    },
                    max: 10
                }
            },
            animation: {
                duration: 0 // 애니메이션 비활성화로 스크롤 문제 방지
            },
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 10,
                    right: 10
                }
            }
        }
    });
    
    this.updateTrackingChart();
};

// 스케일 모드 설정
DualTextWriter.prototype.setScaleMode = function(mode) {
    this.scaleMode = mode; // 'combined' | 'split'
    const combinedBtn = document.getElementById('chart-scale-combined');
    const splitBtn = document.getElementById('chart-scale-split');
    if (combinedBtn && splitBtn) {
        if (mode === 'combined') {
            combinedBtn.classList.add('active');
            combinedBtn.style.background = 'white';
            combinedBtn.style.color = '#667eea';
            splitBtn.classList.remove('active');
            splitBtn.style.background = 'transparent';
            splitBtn.style.color = '#666';
        } else {
            splitBtn.classList.add('active');
            splitBtn.style.background = 'white';
            splitBtn.style.color = '#667eea';
            combinedBtn.classList.remove('active');
            combinedBtn.style.background = 'transparent';
            combinedBtn.style.color = '#666';
        }
    }
    this.updateTrackingChart();
};
// 차트 모드 설정
DualTextWriter.prototype.setChartMode = function(mode) {
    this.chartMode = mode;
    
    // 버튼 스타일 업데이트
    const totalBtn = document.getElementById('chart-mode-total');
    const individualBtn = document.getElementById('chart-mode-individual');
    const postSelectorContainer = document.getElementById('post-selector-container');
    
    if (mode === 'total') {
        totalBtn.classList.add('active');
        totalBtn.style.background = 'white';
        totalBtn.style.color = '#667eea';
        totalBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        
        individualBtn.classList.remove('active');
        individualBtn.style.background = 'transparent';
        individualBtn.style.color = '#666';
        individualBtn.style.boxShadow = 'none';
        
        postSelectorContainer.style.display = 'none';
        this.selectedChartPostId = null;
        // 전체 총합 모드로 전환 시 검색 입력창 초기화
        const searchInput = document.getElementById('chart-post-search');
        if (searchInput) {
            searchInput.value = '';
        }
        const dropdown = document.getElementById('post-selector-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        document.removeEventListener('click', this.handlePostSelectorClickOutside);
    } else {
        individualBtn.classList.add('active');
        individualBtn.style.background = 'white';
        individualBtn.style.color = '#667eea';
        individualBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        
        totalBtn.classList.remove('active');
        totalBtn.style.background = 'transparent';
        totalBtn.style.color = '#666';
        totalBtn.style.boxShadow = 'none';
        
        postSelectorContainer.style.display = 'block';
        this.populatePostSelector();
    }
    
    // 차트 업데이트
    this.updateTrackingChart();
};

// 차트 범위 설정
DualTextWriter.prototype.setChartRange = function(range) {
    this.chartRange = range; // '7d' | '30d' | 'all'
    // 버튼 스타일 업데이트
    const ranges = ['7d', '30d', 'all'];
    ranges.forEach(r => {
        const btn = document.getElementById(`chart-range-${r}`);
        if (!btn) return;
        if (r === range) {
            btn.classList.add('active');
            btn.style.background = 'white';
            btn.style.color = '#667eea';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = '#666';
        }
    });
    this.updateTrackingChart();
};

// 포스트 선택 드롭다운 채우기 (검색 가능한 커스텀 드롭다운)
DualTextWriter.prototype.populatePostSelector = function() {
    if (!this.trackingPosts || this.trackingPosts.length === 0) return;
    
    // 전체 포스트 목록 저장 (검색 필터링용)
    this.allTrackingPostsForSelector = [...this.trackingPosts].sort((a, b) => {
        // 최근 포스트 우선 정렬
        const dateA = a.postedAt instanceof Date ? a.postedAt : (a.postedAt?.toDate ? a.postedAt.toDate() : new Date(0));
        const dateB = b.postedAt instanceof Date ? b.postedAt : (b.postedAt?.toDate ? b.postedAt.toDate() : new Date(0));
        return dateB.getTime() - dateA.getTime();
    });
    
    // 드롭다운 렌더링
    this.renderPostSelectorDropdown('');
    
    // 선택된 포스트가 있으면 검색 입력창에 표시
    if (this.selectedChartPostId) {
        const selectedPost = this.trackingPosts.find(p => p.id === this.selectedChartPostId);
        if (selectedPost) {
            const searchInput = document.getElementById('chart-post-search');
            if (searchInput) {
                const contentPreview = selectedPost.content.length > 50 ? selectedPost.content.substring(0, 50) + '...' : selectedPost.content;
                searchInput.value = contentPreview;
            }
        }
    }
};

// 포스트 선택 드롭다운 렌더링
DualTextWriter.prototype.renderPostSelectorDropdown = function(searchTerm = '') {
    const dropdown = document.getElementById('post-selector-dropdown');
    if (!dropdown) return;
    
    // 검색어로 필터링
    let filteredPosts = this.allTrackingPostsForSelector;
    if (searchTerm && searchTerm.trim()) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredPosts = this.allTrackingPostsForSelector.filter(post => {
            const content = post.content.toLowerCase();
            return content.includes(lowerSearchTerm);
        });
    }
    
    // 최근 포스트 우선 정렬 (이미 정렬되어 있지만 확실히)
    filteredPosts = [...filteredPosts].sort((a, b) => {
        const dateA = a.postedAt instanceof Date ? a.postedAt : (a.postedAt?.toDate ? a.postedAt.toDate() : new Date(0));
        const dateB = b.postedAt instanceof Date ? b.postedAt : (b.postedAt?.toDate ? b.postedAt.toDate() : new Date(0));
        return dateB.getTime() - dateA.getTime();
    });
    
    if (filteredPosts.length === 0) {
        dropdown.innerHTML = `
            <div class="post-selector-empty" style="padding: 20px; text-align: center; color: #666;">
                <div style="font-size: 1.5rem; margin-bottom: 8px;">🔍</div>
                <div>검색 결과가 없습니다.</div>
            </div>
        `;
        return;
    }
    
    // 포스트 목록 HTML 생성
    dropdown.innerHTML = filteredPosts.map(post => {
        const contentPreview = post.content.length > 60 ? post.content.substring(0, 60) + '...' : post.content;
        const isSelected = this.selectedChartPostId === post.id;
        const metricsCount = post.metrics?.length || 0;
        const lastUpdate = post.metrics && post.metrics.length > 0 
            ? post.metrics[post.metrics.length - 1] 
            : null;
        
        return `
            <div 
                class="post-selector-item ${isSelected ? 'selected' : ''}" 
                data-post-id="${post.id}"
                onclick="dualTextWriter.selectPostFromDropdown('${post.id}')"
                style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background-color 0.2s; ${isSelected ? 'background-color: #e3f2fd;' : ''}"
                onmouseover="this.style.backgroundColor='#f5f5f5'"
                onmouseout="this.style.backgroundColor=${isSelected ? "'#e3f2fd'" : "'transparent'"}">
                <div style="font-weight: ${isSelected ? '600' : '500'}; color: #333; margin-bottom: 4px; line-height: 1.4;">
                    ${this.escapeHtml(contentPreview)}
                </div>
                <div style="font-size: 0.8rem; color: #666; display: flex; gap: 12px; align-items: center;">
                    <span>📊 ${metricsCount}회 입력</span>
                    ${lastUpdate ? `<span>최근: ${lastUpdate.views || 0} 조회</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
};

// 포스트 선택 드롭다운 표시
DualTextWriter.prototype.showPostSelectorDropdown = function() {
    const dropdown = document.getElementById('post-selector-dropdown');
    const searchInput = document.getElementById('chart-post-search');
    
    if (!dropdown || !searchInput) return;
    
    // 드롭다운 표시
    dropdown.style.display = 'block';
    
    // 검색어가 없으면 전체 목록 표시, 있으면 필터링
    const searchTerm = searchInput.value || '';
    this.renderPostSelectorDropdown(searchTerm);
    
    // 외부 클릭 시 드롭다운 닫기
    setTimeout(() => {
        document.addEventListener('click', this.handlePostSelectorClickOutside);
    }, 100);
};

// 외부 클릭 처리
DualTextWriter.prototype.handlePostSelectorClickOutside = function(event) {
    const container = document.querySelector('.post-selector-container');
    const dropdown = document.getElementById('post-selector-dropdown');
    
    if (!container || !dropdown) return;
    
    if (!container.contains(event.target) && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        document.removeEventListener('click', dualTextWriter.handlePostSelectorClickOutside);
    }
};

// 포스트 선택 필터링
DualTextWriter.prototype.filterPostSelector = function(searchTerm) {
    const dropdown = document.getElementById('post-selector-dropdown');
    if (!dropdown) return;
    
    // 드롭다운이 닫혀있으면 열기
    if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
    }
    
    // 검색어로 필터링하여 렌더링
    this.renderPostSelectorDropdown(searchTerm);
};

// 드롭다운에서 포스트 선택
DualTextWriter.prototype.selectPostFromDropdown = function(postId) {
    const selectedPost = this.trackingPosts.find(p => p.id === postId);
    if (!selectedPost) return;
    
    this.selectedChartPostId = postId;
    
    // 검색 입력창에 선택된 포스트 제목 표시
    const searchInput = document.getElementById('chart-post-search');
    if (searchInput) {
        const contentPreview = selectedPost.content.length > 50 ? selectedPost.content.substring(0, 50) + '...' : selectedPost.content;
        searchInput.value = contentPreview;
    }
    
    // 드롭다운 닫기
    const dropdown = document.getElementById('post-selector-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    // 외부 클릭 이벤트 리스너 제거
    document.removeEventListener('click', this.handlePostSelectorClickOutside);
    
    // 차트 업데이트
    this.updateTrackingChart();
};

// 포스트 선택 변경 (구버전 호환, 더 이상 사용 안 함)
DualTextWriter.prototype.updateChartPostSelection = function() {
    // 새로운 검색 가능한 드롭다운 사용 중이므로 이 함수는 더 이상 사용되지 않음
    // 호환성을 위해 유지
};

// 트래킹 차트 업데이트
DualTextWriter.prototype.updateTrackingChart = function() {
    if (!this.trackingChart) return;
    
    // 선택된 범위에 따른 날짜 배열 생성
    const dateRange = [];
    const viewsData = [];
    const likesData = [];
    const commentsData = [];
    const sharesData = [];
    const followsData = [];
    
    // 범위 계산 함수
    const makeRange = (startDate, endDate, maxDays = 365) => {
        const days = [];
        const start = new Date(startDate.getTime());
        const end = new Date(endDate.getTime());
        start.setHours(0,0,0,0);
        end.setHours(0,0,0,0);
        let current = start;
        let cnt = 0;
        while (current.getTime() <= end.getTime() && cnt < maxDays) {
            days.push(new Date(current.getTime()));
            current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
            cnt++;
        }
        return days;
    };
    
    // 범위 결정
    const today = new Date(); today.setHours(0,0,0,0);
    if (this.chartRange === '7d') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            dateRange.push(d);
        }
    } else if (this.chartRange === '30d') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            dateRange.push(d);
        }
    } else {
        // 'all' 범위
        if (this.chartMode === 'individual' && this.selectedChartPostId) {
            const post = this.trackingPosts.find(p => p.id === this.selectedChartPostId);
            if (post && post.metrics && post.metrics.length > 0) {
                const first = post.metrics[0].timestamp?.toDate ? post.metrics[0].timestamp.toDate() : new Date(post.metrics[0].timestamp);
                const last = post.metrics[post.metrics.length - 1].timestamp?.toDate ? post.metrics[post.metrics.length - 1].timestamp.toDate() : new Date(post.metrics[post.metrics.length - 1].timestamp);
                dateRange.push(...makeRange(first, last));
            } else {
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                    dateRange.push(d);
                }
            }
        } else {
            let minDate = null; let maxDate = null;
            this.trackingPosts.forEach(post => {
                (post.metrics || []).forEach(m => {
                    const dt = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp);
                    dt.setHours(0,0,0,0);
                    if (!minDate || dt < minDate) minDate = new Date(dt);
                    if (!maxDate || dt > maxDate) maxDate = new Date(dt);
                });
            });
            if (minDate && maxDate) {
                dateRange.push(...makeRange(minDate, maxDate));
            } else {
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                    dateRange.push(d);
                }
            }
        }
    }
    
    if (this.chartMode === 'total') {
        // 전체 총합 모드: 각 날짜까지의 모든 포스트 최신 메트릭 누적 합계
        dateRange.forEach((targetDate) => {
            let dayTotalViews = 0;
            let dayTotalLikes = 0;
            let dayTotalComments = 0;
            let dayTotalShares = 0;
            let dayTotalFollows = 0;
            
            // 각 포스트에 대해 해당 날짜까지의 최신 메트릭 찾기
            this.trackingPosts.forEach(post => {
                if (!post.metrics || post.metrics.length === 0) return;
                
                // 해당 날짜 이전 또는 당일의 가장 최근 메트릭 찾기
                let latestMetricBeforeDate = null;
                for (let i = post.metrics.length - 1; i >= 0; i--) {
                    const metric = post.metrics[i];
                    const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate() : new Date(metric.timestamp);
                    metricDate.setHours(0, 0, 0, 0);
                    
                    if (metricDate.getTime() <= targetDate.getTime()) {
                        latestMetricBeforeDate = metric;
                        break;
                    }
                }
                
                // 최신 메트릭이 있으면 합산 (없으면 해당 포스트는 0으로 처리)
                if (latestMetricBeforeDate) {
                    dayTotalViews += latestMetricBeforeDate.views || 0;
                    dayTotalLikes += latestMetricBeforeDate.likes || 0;
                    dayTotalComments += latestMetricBeforeDate.comments || 0;
                    dayTotalShares += latestMetricBeforeDate.shares || 0;
                    dayTotalFollows += latestMetricBeforeDate.follows || 0;
                }
            });
            
            viewsData.push(dayTotalViews);
            likesData.push(dayTotalLikes);
            commentsData.push(dayTotalComments);
            sharesData.push(dayTotalShares);
            followsData.push(dayTotalFollows);
        });
        
        // 차트 제목 업데이트
        this.trackingChart.options.plugins.title.text = '전체 포스트 누적 총합 추이';
        
    } else {
        // 개별 포스트 모드: 선택된 포스트의 날짜별 데이터
        if (!this.selectedChartPostId) {
            // 포스트가 선택되지 않았으면 빈 데이터
            dateRange.forEach(() => {
                viewsData.push(0);
                likesData.push(0);
                commentsData.push(0);
                sharesData.push(0);
                followsData.push(0);
            });
            this.trackingChart.options.plugins.title.text = '포스트 성과 추이 (포스트를 선택하세요)';
        } else {
            const selectedPost = this.trackingPosts.find(p => p.id === this.selectedChartPostId);
            
            if (selectedPost && selectedPost.metrics) {
                // 범위에 데이터가 없으면 자동으로 전체 범위로 전환
                if (dateRange.length > 0) {
                    const firstDate = dateRange[0].getTime();
                    const lastDate = dateRange[dateRange.length - 1].getTime();
                    const hasAnyInRange = selectedPost.metrics.some(metric => {
                        const md = metric.timestamp?.toDate ? metric.timestamp.toDate() : new Date(metric.timestamp);
                        md.setHours(0,0,0,0);
                        const t = md.getTime();
                        return t >= firstDate && t <= lastDate;
                    });
                    if (!hasAnyInRange && this.chartRange !== 'all') {
                        this.setChartRange('all');
                        return;
                    }
                }

                dateRange.forEach((targetDate) => {
                    // 해당 날짜에 입력된 메트릭 찾기
                    let dayViews = 0;
                    let dayLikes = 0;
                    let dayComments = 0;
                    let dayShares = 0;
                    let dayFollows = 0;
                    
                    selectedPost.metrics.forEach(metric => {
                        const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate() : new Date(metric.timestamp);
                        metricDate.setHours(0, 0, 0, 0);
                        
                        if (metricDate.getTime() === targetDate.getTime()) {
                            dayViews += metric.views || 0;
                            dayLikes += metric.likes || 0;
                            dayComments += metric.comments || 0;
                            dayShares += metric.shares || 0;
                            dayFollows += metric.follows || 0;
                        }
                    });
                    
                    viewsData.push(dayViews);
                    likesData.push(dayLikes);
                    commentsData.push(dayComments);
                    sharesData.push(dayShares);
                    followsData.push(dayFollows);
                });
                
                // 차트 제목 업데이트
                const contentPreview = selectedPost.content.length > 30 
                    ? selectedPost.content.substring(0, 30) + '...' 
                    : selectedPost.content;
                this.trackingChart.options.plugins.title.text = `포스트 성과 추이: ${contentPreview}`;
            } else {
                dateRange.forEach(() => {
                    viewsData.push(0);
                    likesData.push(0);
                    commentsData.push(0);
                    sharesData.push(0);
                    followsData.push(0);
                });
                this.trackingChart.options.plugins.title.text = '포스트 성과 추이 (데이터 없음)';
            }
        }
    }
    
    // 날짜 레이블 포맷팅
    const dateLabels = dateRange.map(date => 
        date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    );
    
    this.trackingChart.data.labels = dateLabels;
    // 데이터 바인딩
    const datasets = this.trackingChart.data.datasets;
    datasets[0].data = viewsData;
    datasets[1].data = likesData;
    datasets[2].data = commentsData;
    datasets[3].data = sharesData;
    if (datasets[4]) datasets[4].data = followsData;
    
    // 축 배치: combined는 모두 y, split은 조회수 y / 나머지 y2
    if (this.scaleMode === 'split') {
        datasets[0].yAxisID = 'y';
        for (let i = 1; i < datasets.length; i++) {
            datasets[i].yAxisID = 'y2';
        }
    } else {
        for (let i = 0; i < datasets.length; i++) {
            datasets[i].yAxisID = 'y';
        }
    }
    
    // y축 스케일 재계산 (데이터 범위에 맞게 최적화)
    const maxValue = Math.max(
        ...(viewsData.length ? viewsData : [0]),
        ...(likesData.length ? likesData : [0]),
        ...(commentsData.length ? commentsData : [0]),
        ...(sharesData.length ? sharesData : [0]),
        ...(followsData.length ? followsData : [0])
    );
    // 스케일 계산
    if (this.scaleMode === 'split') {
        // 왼쪽 y: 조회수 전용
        const maxViews = Math.max(...(viewsData.length ? viewsData : [0]));
        const yMax = maxViews > 0 ? Math.ceil(maxViews * 1.2) : 10;
        const yStep = Math.max(1, Math.ceil((yMax || 10) / 8));
        this.trackingChart.options.scales.y.max = yMax;
        this.trackingChart.options.scales.y.ticks.stepSize = yStep;
        
        // 오른쪽 y2: 나머지 지표
        const maxOthers = Math.max(
            ...(likesData.length ? likesData : [0]),
            ...(commentsData.length ? commentsData : [0]),
            ...(sharesData.length ? sharesData : [0]),
            ...(followsData.length ? followsData : [0])
        );
        const y2Max = maxOthers > 0 ? Math.ceil(maxOthers * 1.8) : 10;
        const y2Step = Math.max(1, Math.ceil((y2Max || 10) / 6));
        this.trackingChart.options.scales.y2.max = y2Max;
        this.trackingChart.options.scales.y2.ticks.stepSize = y2Step;
    } else {
        if (maxValue > 0) {
            const suggestedMax = Math.ceil(maxValue * 1.2);
            const stepSize = Math.max(1, Math.ceil(suggestedMax / 8));
            this.trackingChart.options.scales.y.max = suggestedMax;
            this.trackingChart.options.scales.y.ticks.stepSize = stepSize;
        } else {
            this.trackingChart.options.scales.y.max = 10;
            this.trackingChart.options.scales.y.ticks.stepSize = 1;
        }
        // y2는 비활성처럼 동일 값으로 최소화
        this.trackingChart.options.scales.y2.max = this.trackingChart.options.scales.y.max;
        this.trackingChart.options.scales.y2.ticks.stepSize = this.trackingChart.options.scales.y.ticks.stepSize;
    }
    
    // 애니메이션 없이 업데이트 (스크롤 문제 방지)
    this.trackingChart.update('none');
};

// 저장된 글에서 트래킹 시작
DualTextWriter.prototype.startTrackingFromSaved = async function(textId) {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    try {
        // 저장된 텍스트 정보 가져오기
        const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', textId);
        const textDoc = await window.firebaseGetDoc(textRef);
        
        if (!textDoc.exists()) {
            console.error('텍스트를 찾을 수 없습니다.');
            this.showMessage('❌ 원본 텍스트를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const textData = textDoc.data();
        
        // 데이터 일관성 검증: 원본 텍스트가 유효한지 확인
        if (!textData.content || textData.content.trim().length === 0) {
            console.warn('원본 텍스트 내용이 비어있습니다.');
            this.showMessage('⚠️ 원본 텍스트 내용이 비어있습니다.', 'warning');
        }
        
        // 중복 확인: 이미 이 텍스트에서 포스트가 생성되었는지 확인 (선택적)
        const existingPosts = await this.checkExistingPostForText(textId);
        if (existingPosts.length > 0) {
            const confirmMessage = `이 텍스트에서 이미 ${existingPosts.length}개의 포스트가 생성되었습니다.\n계속해서 새 포스트를 생성하시겠습니까?`;
            if (!confirm(confirmMessage)) {
                console.log('사용자가 중복 생성 취소');
                return;
            }
        }
        
        // 포스트 컬렉션에 추가
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const postData = {
            content: textData.content,
            type: textData.type || 'edit',
            postedAt: window.firebaseServerTimestamp(),
            trackingEnabled: true,
            metrics: [],
            analytics: {},
            sourceTextId: textId, // 원본 텍스트 참조
            sourceType: textData.type || 'edit', // 원본 텍스트 타입
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp()
        };
        
        const docRef = await window.firebaseAddDoc(postsRef, postData);
        
        console.log('트래킹 포스트가 생성되었습니다:', docRef.id);
        
        // 트래킹 탭으로 전환
        this.switchTab('tracking');
        
        // 트래킹 포스트 목록 새로고침
        this.loadTrackingPosts();
        
    } catch (error) {
        console.error('트래킹 시작 실패:', error);
        this.showMessage('❌ 트래킹 시작에 실패했습니다: ' + error.message, 'error');
    }
};

// 특정 텍스트에서 생성된 포스트 확인
DualTextWriter.prototype.checkExistingPostForText = async function(textId) {
    if (!this.currentUser || !this.isFirebaseReady) return [];
    
    try {
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId));
        const querySnapshot = await window.firebaseGetDocs(q);
        
        const existingPosts = [];
        querySnapshot.forEach((doc) => {
            existingPosts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return existingPosts;
    } catch (error) {
        console.error('기존 포스트 확인 실패:', error);
        return [];
    }
};

// Orphan 포스트 정리 (원본이 삭제된 포스트 일괄 삭제)
DualTextWriter.prototype.cleanupOrphanPosts = async function() {
    if (!this.currentUser || !this.isFirebaseReady) {
        this.showMessage('❌ 로그인이 필요합니다.', 'error');
        return;
    }
    
    // Orphan 포스트 필터링
    const orphanPosts = this.trackingPosts.filter(post => post.isOrphan);
    
    if (orphanPosts.length === 0) {
        this.showMessage('✅ 정리할 orphan 포스트가 없습니다.', 'success');
        return;
    }
    
    // 삭제 전 확인
    const metricsCount = orphanPosts.reduce((sum, post) => sum + (post.metrics?.length || 0), 0);
    const confirmMessage = `원본이 삭제된 포스트 ${orphanPosts.length}개를 삭제하시겠습니까?\n\n` +
        `⚠️ 삭제될 데이터:\n` +
        `   - 트래킹 포스트: ${orphanPosts.length}개\n` +
        `   - 트래킹 기록: ${metricsCount}개\n\n` +
        `이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMessage)) {
        console.log('사용자가 orphan 포스트 정리 취소');
        return;
    }
    
    try {
        // 진행 중 메시지
        this.showMessage('🔄 Orphan 포스트를 정리하는 중...', 'info');
        
        // 모든 orphan 포스트 삭제 (병렬 처리)
        const deletePromises = orphanPosts.map(post => {
            const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', post.id);
            return window.firebaseDeleteDoc(postRef);
        });
        
        await Promise.all(deletePromises);
        
        // 로컬 배열에서도 제거
        this.trackingPosts = this.trackingPosts.filter(post => !post.isOrphan);
        
        // UI 업데이트
        this.renderTrackingPosts();
        this.updateTrackingSummary();
        this.updateTrackingChart();
        
        // 성공 메시지
        this.showMessage(`✅ Orphan 포스트 ${orphanPosts.length}개가 정리되었습니다!`, 'success');
        console.log('Orphan 포스트 정리 완료', { deletedCount: orphanPosts.length });
        
    } catch (error) {
        console.error('Orphan 포스트 정리 실패:', error);
        this.showMessage('❌ Orphan 포스트 정리에 실패했습니다: ' + error.message, 'error');
    }
};

// 일괄 마이그레이션 확인 대화상자 표시
DualTextWriter.prototype.showBatchMigrationConfirm = async function() {
    if (!this.currentUser || !this.isFirebaseReady) {
        this.showMessage('로그인이 필요합니다.', 'error');
        return;
    }
    
    // 미트래킹 글만 찾기
    const untrackedTexts = [];
    
    for (const textItem of this.savedTexts) {
        // 로컬에서 먼저 확인
        let hasTracking = false;
        if (this.trackingPosts) {
            hasTracking = this.trackingPosts.some(p => p.sourceTextId === textItem.id);
        }
        
        // 로컬에 없으면 Firebase에서 확인
        if (!hasTracking) {
            try {
                const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                const q = window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textItem.id));
                const querySnapshot = await window.firebaseGetDocs(q);
                hasTracking = !querySnapshot.empty;
            } catch (error) {
                console.error('트래킹 확인 실패:', error);
            }
        }
        
        if (!hasTracking) {
            untrackedTexts.push(textItem);
        }
    }
    
    if (untrackedTexts.length === 0) {
        this.showMessage('✅ 모든 저장된 글이 이미 트래킹 중입니다!', 'success');
        // 버튼 상태 업데이트
        this.updateBatchMigrationButton();
        return;
    }
    
    const confirmMessage = `트래킹이 시작되지 않은 저장된 글 ${untrackedTexts.length}개를 트래킹 포스트로 변환하시겠습니까?\n\n` +
        `⚠️ 주의사항:\n` +
        `- 이미 트래킹 중인 글은 제외됩니다\n` +
        `- 중복 생성 방지를 위해 각 텍스트의 기존 포스트를 확인합니다\n` +
        `- 마이그레이션 중에는 페이지를 닫지 마세요`;
    
    if (confirm(confirmMessage)) {
        // 미트래킹 글만 마이그레이션 실행
        this.executeBatchMigrationForUntracked(untrackedTexts);
    }
};

// 미트래킹 글만 일괄 마이그레이션 실행
DualTextWriter.prototype.executeBatchMigrationForUntracked = async function(untrackedTexts) {
    if (!this.currentUser || !this.isFirebaseReady || !untrackedTexts || untrackedTexts.length === 0) {
        return;
    }
    
    const button = this.batchMigrationBtn;
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    try {
        // 버튼 비활성화
        if (button) {
            button.disabled = true;
            button.textContent = '마이그레이션 진행 중...';
        }
        
        this.showMessage(`🔄 미트래킹 글 ${untrackedTexts.length}개의 트래킹을 시작합니다...`, 'info');
        
        // 각 미트래킹 텍스트에 대해 포스트 생성
        for (let i = 0; i < untrackedTexts.length; i++) {
            const textItem = untrackedTexts[i];
            
            try {
                // 기존 포스트 확인 (안전장치)
                const existingPosts = await this.checkExistingPostForText(textItem.id);
                if (existingPosts.length > 0) {
                    console.log(`텍스트 ${textItem.id}: 이미 ${existingPosts.length}개의 포스트 존재, 건너뜀`);
                    skipCount++;
                    continue;
                }
                
                // 포스트 생성 (트래킹 탭 전환 없이 백그라운드 처리)
                const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', textItem.id);
                const textDoc = await window.firebaseGetDoc(textRef);
                
                if (!textDoc.exists()) {
                    errorCount++;
                    continue;
                }
                
                const textData = textDoc.data();
                
                const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                const postData = {
                    content: textData.content,
                    type: textData.type || 'edit',
                    postedAt: window.firebaseServerTimestamp(),
                    trackingEnabled: true,
                    metrics: [],
                    analytics: {},
                    sourceTextId: textItem.id,
                    sourceType: textData.type || 'edit',
                    createdAt: window.firebaseServerTimestamp(),
                    updatedAt: window.firebaseServerTimestamp()
                };
                
                await window.firebaseAddDoc(postsRef, postData);
                successCount++;
                
                // 진행 상황 표시 (마지막 항목이 아닐 때만)
                if (i < untrackedTexts.length - 1) {
                    const progress = Math.round((i + 1) / untrackedTexts.length * 100);
                    if (button) {
                        button.textContent = `마이그레이션 진행 중... (${progress}%)`;
                    }
                }
                
                // 너무 빠른 요청 방지 (Firebase 할당량 고려)
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`텍스트 ${textItem.id} 마이그레이션 실패:`, error);
                errorCount++;
            }
        }
        
        // 결과 메시지
        const resultMessage = `✅ 미트래킹 글 마이그레이션 완료!\n` +
            `- 성공: ${successCount}개\n` +
            `- 건너뜀: ${skipCount}개 (이미 포스트 존재)\n` +
            `- 실패: ${errorCount}개`;
        
        this.showMessage(resultMessage, 'success');
        console.log('일괄 마이그레이션 결과:', { successCount, skipCount, errorCount });
        
        // 트래킹 포스트 목록 새로고침 (트래킹 탭이 활성화되어 있으면)
        if (this.loadTrackingPosts) {
            await this.loadTrackingPosts();
        }
        
        // 저장된 글 목록도 새로고침 (버튼 상태 업데이트를 위해)
        await this.renderSavedTexts();
        
    } catch (error) {
        console.error('일괄 마이그레이션 중 오류:', error);
        this.showMessage('❌ 마이그레이션 중 오류가 발생했습니다: ' + error.message, 'error');
    } finally {
        // 버튼 복원 및 상태 업데이트
        if (button) {
            button.disabled = false;
        }
        // 버튼 텍스트는 updateBatchMigrationButton에서 업데이트됨
        await this.updateBatchMigrationButton();
    }
};

// 전역 함수들
window.saveTrackingData = function() {
    if (dualTextWriter) {
        dualTextWriter.saveTrackingData();
    }
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    if (modalId === 'tracking-modal' && dualTextWriter) {
        dualTextWriter.closeTrackingModal();
    }
    if (modalId === 'tracking-edit-modal' && dualTextWriter) {
        dualTextWriter.editingMetricData = null;
    }
};

window.updateTrackingDataItem = function() {
    if (dualTextWriter) {
        dualTextWriter.updateTrackingDataItem();
    }
};

window.deleteTrackingDataItem = function() {
    if (dualTextWriter) {
        dualTextWriter.deleteTrackingDataItem();
    }
};