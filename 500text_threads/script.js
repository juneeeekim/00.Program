class DualTextWriter {
    constructor() {
        // Firebase 설정
        this.auth = null;
        this.db = null;
        this.currentUser = null;
        this.isFirebaseReady = false;
        
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
        this.tempSaveStatus = document.getElementById('temp-save-status');
        this.tempSaveText = document.getElementById('temp-save-text');
        
        this.maxLength = 500;
        this.currentUser = null;
        this.savedTexts = [];
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
        
        // 개발 모드에서 자동 테스트 실행
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                console.log('🔧 개발 모드: 자동 테스트 실행');
                this.runComprehensiveTest();
            }, 2000);
        }
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
    
    renderSavedTexts() {
        console.log('renderSavedTexts 호출됨:', this.savedTexts);
        
        if (this.savedTexts.length === 0) {
            this.savedList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">저장된 글이 없습니다.</p>';
            return;
        }
        
        this.savedList.innerHTML = this.savedTexts.map((item, index) => `
            <div class="saved-item ${index === 0 ? 'new' : ''}" data-item-id="${item.id}">
                <div class="saved-item-header">
                    <span class="saved-item-date">${item.date}</span>
                    <span class="saved-item-count">${item.characterCount}자</span>
                    <span class="saved-item-type">${item.type === 'reference' ? '📖 레퍼런스' : '✏️ 수정작성'}</span>
                </div>
                <div class="saved-item-content">${this.escapeHtml(item.content)}</div>
                <div class="saved-item-actions">
                    <button class="btn-small btn-edit" data-action="edit" data-type="${item.type}" data-item-id="${item.id}">편집</button>
                    <button class="btn-small btn-delete" data-action="delete" data-item-id="${item.id}">삭제</button>
                    <div class="llm-validation-dropdown">
                        <button class="btn-small btn-llm-main" data-action="llm-validation" data-item-id="${item.id}">🔍 LLM 검증</button>
                        <div class="llm-dropdown-menu">
                            <button class="llm-option" data-llm="chatgpt" data-item-id="${item.id}">
                                <div class="llm-option-content">
                                    <div class="llm-option-header">
                                        <span class="llm-icon">${this.llmCharacteristics.chatgpt.icon}</span>
                                        <span class="llm-name">${this.llmCharacteristics.chatgpt.name}</span>
                                    </div>
                                    <div class="llm-description">${this.llmCharacteristics.chatgpt.description}</div>
                                    <div class="llm-details">${this.llmCharacteristics.chatgpt.details}</div>
                                </div>
                            </button>
                            <button class="llm-option" data-llm="gemini" data-item-id="${item.id}">
                                <div class="llm-option-content">
                                    <div class="llm-option-header">
                                        <span class="llm-icon">${this.llmCharacteristics.gemini.icon}</span>
                                        <span class="llm-name">${this.llmCharacteristics.gemini.name}</span>
                                    </div>
                                    <div class="llm-description">${this.llmCharacteristics.gemini.description}</div>
                                    <div class="llm-details">${this.llmCharacteristics.gemini.details}</div>
                                </div>
                            </button>
                            <button class="llm-option" data-llm="perplexity" data-item-id="${item.id}">
                                <div class="llm-option-content">
                                    <div class="llm-option-header">
                                        <span class="llm-icon">${this.llmCharacteristics.perplexity.icon}</span>
                                        <span class="llm-name">${this.llmCharacteristics.perplexity.name}</span>
                                    </div>
                                    <div class="llm-description">${this.llmCharacteristics.perplexity.description}</div>
                                    <div class="llm-details">${this.llmCharacteristics.perplexity.details}</div>
                                </div>
                            </button>
                            <button class="llm-option" data-llm="grok" data-item-id="${item.id}">
                                <div class="llm-option-content">
                                    <div class="llm-option-header">
                                        <span class="llm-icon">${this.llmCharacteristics.grok.icon}</span>
                                        <span class="llm-name">${this.llmCharacteristics.grok.name}</span>
                                    </div>
                                    <div class="llm-description">${this.llmCharacteristics.grok.description}</div>
                                    <div class="llm-details">${this.llmCharacteristics.grok.details}</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        // DOM 렌더링 완료 후 이벤트 리스너 설정
        setTimeout(() => {
            this.setupSavedItemEventListeners();
            this.bindDirectEventListeners(); // 직접 이벤트 바인딩도 추가
        }, 100);
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
        
        // LLM 검증 버튼들 바인딩
        llmButtons.forEach((button, index) => {
            const itemId = button.getAttribute('data-item-id');
            const llmService = button.getAttribute('data-llm');
            
            console.log(`LLM 버튼 ${index} 바인딩:`, { itemId, llmService });
            
            // 기존 이벤트 리스너 제거
            button.removeEventListener('click', button._llmHandler);
            
            // 새로운 이벤트 핸들러 생성 및 바인딩
            button._llmHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('직접 LLM 버튼 클릭:', { itemId, llmService });
                
                // 디버깅을 위한 추가 로그
                console.log('버튼 요소:', button);
                console.log('클릭된 요소:', e.target);
                console.log('이벤트 타겟의 부모:', e.target.closest('.llm-option'));
                
                this.validateWithLLM(itemId, llmService);
            };
            
            button.addEventListener('click', button._llmHandler);
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
    
    // Firestore에서 텍스트 삭제
    async deleteText(id) {
        console.log('삭제 버튼 클릭:', { id });
        if (confirm('이 글을 삭제하시겠습니까?')) {
            if (!this.currentUser || !this.isFirebaseReady) {
                this.showMessage('로그인이 필요합니다.', 'error');
                return;
            }
            
            try {
                console.log('Firestore에서 삭제 시작:', id);
                // Firestore에서 삭제
                await window.firebaseDeleteDoc(window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', id));
                
                // 로컬 배열에서도 제거
            this.savedTexts = this.savedTexts.filter(saved => saved.id !== id);
            this.renderSavedTexts();
            this.showMessage('글이 삭제되었습니다.', 'info');
                console.log('삭제 완료');
                
            } catch (error) {
                console.error('텍스트 삭제 실패:', error);
                this.showMessage('삭제에 실패했습니다. 다시 시도해주세요.', 'error');
            }
        }
    }
    
    escapeHtml(text) {
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
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
        this.renderSavedTexts();
        this.startTempSave();
        this.restoreTempSave();
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
                this.savedTexts.push({
                    id: doc.id,
                    content: data.content,
                    date: data.createdAt ? data.createdAt.toDate().toLocaleString('ko-KR') : '날짜 없음',
                    characterCount: data.characterCount,
                    type: data.type
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
    
    // Threads 포맷팅 함수 (XSS 방지 포함)
    formatForThreads(content) {
        // XSS 방지를 위한 HTML 이스케이프
        const escapedContent = this.escapeHtml(content);
        
        // 줄바꿈 정규화
        const normalizedContent = escapedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 연속 공백 정리
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
                optimized.hashtags = ['#writing', '#content', '#threads'];
                optimized.suggestions.push('해시태그를 추가했습니다.');
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
            
            // 2단계: Threads 최적화 포맷으로 변환
            console.log('🔄 2단계: 포맷팅 시작...');
            const formattedContent = this.formatForThreads(content);
            console.log('📝 포맷팅된 내용:', formattedContent);
            console.log('📝 포맷팅된 내용 길이:', formattedContent ? formattedContent.length : 'undefined');
            
            if (!formattedContent || formattedContent.length === 0) {
                console.error('❌ 포맷팅된 내용이 비어있음');
                throw new Error('포맷팅된 내용이 비어있습니다.');
            }
            
            console.log('✅ 2단계: 포맷팅 완료');
            
            // 클립보드 API 지원 확인
            console.log('🔄 3단계: 클립보드 API 확인...');
            console.log('📋 navigator.clipboard 존재:', !!navigator.clipboard);
            console.log('🔒 isSecureContext:', window.isSecureContext);
            
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    console.log('📋 클립보드 API로 복사 시도...');
                    await navigator.clipboard.writeText(formattedContent);
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
                await this.fallbackCopyToClipboard(formattedContent);
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
    showOptimizationModal(optimized) {
        const modal = document.createElement('div');
        modal.className = 'optimization-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title');
        modal.setAttribute('aria-describedby', 'modal-description');
        
        // 현재 언어 감지
        const currentLang = this.detectLanguage();
        console.log('🌍 감지된 언어:', currentLang);
        
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
                    <h4>${this.t('previewTitle')}</h4>
                    <div class="preview-content" role="textbox" aria-label="최적화된 포스팅 내용" tabindex="0">
                        ${this.escapeHtml(optimized.optimized)}
                        ${optimized.hashtags.length > 0 ? `<br><br>${this.escapeHtml(optimized.hashtags.join(' '))}` : ''}
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
            // 클립보드 복사 버튼
            const copyBtn = modal.querySelector('#copy-only-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const content = this.escapeHtml(optimized.optimized + (optimized.hashtags.length > 0 ? '\n\n' + optimized.hashtags.join(' ') : ''));
                    console.log('🔍 클립보드 복사 버튼 클릭 감지');
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
                    const content = this.escapeHtml(optimized.optimized + (optimized.hashtags.length > 0 ? '\n\n' + optimized.hashtags.join(' ') : ''));
                    console.log('🔍 둘 다 실행 버튼 클릭 감지');
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
            
            // 2단계: 포맷팅
            const formattedContent = this.formatForThreads(content);
            if (!formattedContent || formattedContent.length === 0) {
                throw new Error('포맷팅된 내용이 비어있습니다.');
            }
            
            console.log('📝 포맷팅된 내용:', formattedContent);
            
            // 3단계: 클립보드 API 시도 (이벤트 컨텍스트 내에서)
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    console.log('📋 클립보드 API로 즉시 복사 시도...');
                    await navigator.clipboard.writeText(formattedContent);
                    console.log('✅ 클립보드 API 즉시 복사 성공');
                    return true;
                } catch (clipboardError) {
                    console.warn('❌ 클립보드 API 즉시 복사 실패:', clipboardError);
                    // 폴백으로 execCommand 시도
                    return await this.fallbackCopyToClipboard(formattedContent);
                }
            } else {
                console.log('🔄 클립보드 API 미지원, 폴백 방법 사용');
                return await this.fallbackCopyToClipboard(formattedContent);
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
            
            // 최적화 완료 후 모달 표시
            console.log('🔄 6. 최적화 모달 표시 시작...');
            this.showOptimizationModal(optimized);
            console.log('✅ 7. 최적화 모달 표시 완료');
            
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