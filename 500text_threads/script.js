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
        this.mainContent.style.display = 'none';
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
    
    // Firestore에서 텍스트 삭제
    async deleteText(id) {
        if (confirm('이 글을 삭제하시겠습니까?')) {
            if (!this.currentUser || !this.isFirebaseReady) {
                this.showMessage('로그인이 필요합니다.', 'error');
                return;
            }
            
            try {
                // Firestore에서 삭제
                await window.firebaseDeleteDoc(window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', id));
                
                // 로컬 배열에서도 제거
                this.savedTexts = this.savedTexts.filter(saved => saved.id !== id);
                this.renderSavedTexts();
                this.showMessage('글이 삭제되었습니다.', 'info');
                
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
}

// Initialize the application
let dualTextWriter;

document.addEventListener('DOMContentLoaded', () => {
    dualTextWriter = new DualTextWriter();
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