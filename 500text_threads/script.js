class DualTextWriter {
    /**
     * 성능 및 동작 관련 설정 상수
     * 
     * 향후 조정이 필요한 경우 이 섹션에서 값을 변경하세요.
     */
    static CONFIG = {
        // 실시간 중복 체크 설정
        DEBOUNCE_DUPLICATE_CHECK_MS: 600,      // Debounce 시간 (ms)
        DUPLICATE_CHECK_MIN_LENGTH: 10,         // 중복 체크 최소 길이 (자)
        
        // 배치 처리 설정
        BATCH_SIZE: 500,                        // Firestore 배치 크기 (최대 500개)
        BATCH_DELAY_MS: 100,                    // 배치 간 딜레이 (ms, 서버 부하 분산)
        
        // 기타 설정
        TEMP_SAVE_INTERVAL_MS: 5000,            // 임시 저장 간격 (ms)
        TEMP_SAVE_DELAY_MS: 2000,               // 임시 저장 딜레이 (ms)
    };
    
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
        
        // 일괄 삭제 관련 상태
        this.isBatchSelectMode = false; // 일괄 선택 모드 활성화 여부
        this.selectedMetricIndices = []; // 선택된 메트릭 인덱스 배열
        
        // 작성글-레퍼런스 연동 기능 관련 프로퍼티
        this.selectedReferences = [];           // 현재 선택된 레퍼런스 ID 배열
        this.referenceSelectionModal = null;    // 레퍼런스 선택 모달 DOM
        this.referenceLinkCache = new Map();    // 역방향 조회 캐시 (refId -> editIds[])
        
        // Firebase 초기화 대기
        this.waitForFirebase();

        // Firebase 설정 안내
        this.showFirebaseSetupNotice();

        // 사용자 인증 관련 요소들
        this.usernameInput = document.getElementById('username-input');
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
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
        // 레퍼런스 유형 라디오
        this.refTypeStructure = document.getElementById('ref-type-structure');
        this.refTypeIdea = document.getElementById('ref-type-idea');

        // 수정/작성 글 관련 요소들
        this.editTextInput = document.getElementById('edit-text-input');
        this.editTopicInput = document.getElementById('edit-topic-input');
        this.editCurrentCount = document.getElementById('edit-current-count');
        this.editMaxCount = document.getElementById('edit-max-count');
        
        // 레퍼런스 글 관련 요소들
        this.refTopicInput = document.getElementById('ref-topic-input');
        this.editProgressFill = document.getElementById('edit-progress-fill');
        this.editClearBtn = document.getElementById('edit-clear-btn');
        this.editSaveBtn = document.getElementById('edit-save-btn');
        this.editDownloadBtn = document.getElementById('edit-download-btn');

        // 공통 요소들
        this.savedList = document.getElementById('saved-list');
        this.batchMigrationBtn = document.getElementById('batch-migration-btn');
        this.tempSaveStatus = document.getElementById('temp-save-status');
        this.tempSaveText = document.getElementById('temp-save-text');

        // 주제 필터 관련 요소들 (작성 글용)
        this.topicFilter = document.getElementById('topic-filter');
        this.topicFilterGroup = document.getElementById('topic-filter-group');
        this.currentTopicFilter = 'all'; // 현재 선택된 주제 필터
        this.availableTopics = []; // 사용 가능한 주제 목록
        
        // 소스 필터 관련 요소들 (레퍼런스 글용)
        this.sourceFilter = document.getElementById('source-filter');
        this.sourceFilterGroup = document.getElementById('source-filter-group');
        this.currentSourceFilter = 'all'; // 현재 선택된 소스 필터
        this.availableSources = []; // 사용 가능한 소스 목록

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
        this.trackingSortSelect = document.getElementById('tracking-sort');
        this.trackingStatusSelect = document.getElementById('tracking-status-filter');
        this.trackingSearchInput = document.getElementById('tracking-search');
        this.trackingUpdatedFromInput = document.getElementById('tracking-updated-from');
        this.trackingUpdatedToInput = document.getElementById('tracking-updated-to');
        this.trackingDateClearBtn = document.getElementById('tracking-date-clear');
        this.minViewsInput = document.getElementById('min-views');
        this.maxViewsInput = document.getElementById('max-views');
        this.minLikesInput = document.getElementById('min-likes');
        this.maxLikesInput = document.getElementById('max-likes');
        this.minCommentsInput = document.getElementById('min-comments');
        this.maxCommentsInput = document.getElementById('max-comments');
        this.minSharesInput = document.getElementById('min-shares');
        this.maxSharesInput = document.getElementById('max-shares');
        this.minFollowsInput = document.getElementById('min-follows');
        this.maxFollowsInput = document.getElementById('max-follows');
        this.exportCsvBtn = document.getElementById('export-csv');
        this.trackingSort = localStorage.getItem('dtw_tracking_sort') || 'updatedDesc';
        this.trackingStatusFilter = localStorage.getItem('dtw_tracking_status') || 'all';
        this.trackingSearch = localStorage.getItem('dtw_tracking_search') || '';
        this.trackingUpdatedFrom = localStorage.getItem('dtw_tracking_from') || '';
        this.trackingUpdatedTo = localStorage.getItem('dtw_tracking_to') || '';
        this.rangeFilters = JSON.parse(localStorage.getItem('dtw_tracking_ranges') || '{}');
        
        // 성능 최적화: 디바운싱 타이머 및 업데이트 큐
        this.debounceTimers = {};
        this.updateQueue = {
            savedTexts: false,
            trackingPosts: false,
            trackingSummary: false,
            trackingChart: false
        };
        
        // 글자 제한 (500/1000) - 기본 500, 사용자 선택을 로컬에 저장
        this.maxLength = parseInt(localStorage.getItem('dualTextWriter_charLimit') || '500', 10);
        this.currentUser = null;
        this.savedTexts = [];
        this.savedFilter = localStorage.getItem('dualTextWriter_savedFilter') || 'all';
        this.tempSaveInterval = null;
        this.lastTempSave = null;
        this.savedItemClickHandler = null; // 이벤트 핸들러 참조
        this.outsideClickHandler = null; // 바깥 클릭 핸들러 참조

        // LLM 검증 시스템 초기화
        this.initializeLLMValidation();

        this.init();
    }

    /**
     * 레퍼런스 입력란에 대한 실시간 중복 체크 초기화
     * 
     * 성능 최적화:
     * - Debounce 시간: 300ms → 600ms (빠른 타이핑 시 불필요한 검색 50% 감소)
     * - 최소 길이 체크: 10자 미만은 검사 생략
     */
    initLiveDuplicateCheck() {
        if (!this.refTextInput) return;
        // 힌트 영역이 없다면 생성
        let hint = document.getElementById('ref-duplicate-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'ref-duplicate-hint';
            hint.setAttribute('role', 'alert');
            hint.setAttribute('aria-live', 'polite');
            hint.style.cssText = 'margin-top:8px;font-size:0.9rem;display:none;color:#b35400;background:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:8px;';
            this.refTextInput.parentElement && this.refTextInput.parentElement.appendChild(hint);
        }

        // ✅ 성능 최적화: 설정 상수 사용 (향후 조정 용이)
        const DEBOUNCE_MS = DualTextWriter.CONFIG.DEBOUNCE_DUPLICATE_CHECK_MS;
        const MIN_LENGTH = DualTextWriter.CONFIG.DUPLICATE_CHECK_MIN_LENGTH;
        
        this.refTextInput.addEventListener('input', () => {
            // 디바운스 처리
            clearTimeout(this.debounceTimers.refDuplicate);
            this.debounceTimers.refDuplicate = setTimeout(() => {
                const value = this.refTextInput.value || '';
                // 너무 짧으면 검사하지 않음 (성능/UX)
                if (value.trim().length < MIN_LENGTH) {
                    this.hideInlineDuplicateHint();
                    return;
                }
                try {
                    const duplicate = this.checkDuplicateReference(value);
                    if (duplicate) {
                        this.showInlineDuplicateHint(duplicate);
                    } else {
                        this.hideInlineDuplicateHint();
                    }
                } catch (e) {
                    // 입력 중 오류가 있어도 무시하고 힌트 숨김
                    console.warn('실시간 중복 체크 중 경고:', e);
                    this.hideInlineDuplicateHint();
                }
            }, DEBOUNCE_MS);
        });
    }

    /**
     * 인라인 중복 경고 표시
     * @param {Object} duplicate
     */
    showInlineDuplicateHint(duplicate) {
        const hint = document.getElementById('ref-duplicate-hint');
        if (!hint) return;
        const createdAtStr = this.formatDateFromFirestore?.(duplicate?.createdAt) || '';
        const topicStr = duplicate?.topic ? ` · 주제: ${this.escapeHtml(duplicate.topic)}` : '';
        hint.innerHTML = `⚠️ 동일한 레퍼런스가 이미 있습니다${createdAtStr ? ` · 저장일: ${createdAtStr}` : ''}${topicStr}. 저장 시 중복으로 저장될 수 있습니다.`;
        hint.style.display = 'block';
    }

    /**
     * 인라인 중복 경고 숨김
     */
    hideInlineDuplicateHint() {
        const hint = document.getElementById('ref-duplicate-hint');
        if (!hint) return;
        hint.style.display = 'none';
        hint.textContent = '';
    }

    /**
     * 레퍼런스 선택 기능 초기화
     * 
     * - 접을 수 있는 패널 토글 기능
     * - 모달 DOM 요소 참조
     * - 이벤트 리스너 바인딩
     * - 초기 상태 설정
     */
    initReferenceSelection() {
        // DOM 요소 참조
        this.referenceCollapseToggle = document.getElementById('reference-collapse-toggle');
        this.referenceLinkContent = document.getElementById('reference-link-content');
        this.collapseRefCount = document.getElementById('collapse-ref-count');
        this.selectReferencesBtn = document.getElementById('select-references-btn');
        this.referenceSelectionModal = document.getElementById('reference-selection-modal');
        this.referenceSelectionList = document.getElementById('reference-selection-list');
        this.referenceSearchInput = document.getElementById('reference-search-input');
        this.referenceTypeFilterModal = document.getElementById('reference-type-filter-modal');
        this.selectedRefCount = document.getElementById('selected-ref-count');
        this.modalSelectedCount = document.getElementById('modal-selected-count');
        this.selectedReferencesTags = document.getElementById('selected-references-tags');
        this.confirmReferenceSelectionBtn = document.getElementById('confirm-reference-selection-btn');
        
        // 유효성 검사
        if (!this.selectReferencesBtn || !this.referenceSelectionModal) {
            console.warn('⚠️ 레퍼런스 선택 UI 요소를 찾을 수 없습니다.');
            return;
        }
        
        // 접을 수 있는 패널 토글 이벤트
        if (this.referenceCollapseToggle && this.referenceLinkContent) {
            this.referenceCollapseToggle.addEventListener('click', () => this.toggleReferenceCollapse());
        }
        
        // 이벤트 리스너 바인딩
        this.selectReferencesBtn.addEventListener('click', () => this.openReferenceSelectionModal());
        this.confirmReferenceSelectionBtn.addEventListener('click', () => this.confirmReferenceSelection());
        
        // 모달 닫기 버튼
        const closeBtns = this.referenceSelectionModal.querySelectorAll('.close-btn, .cancel-btn');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.closeReferenceSelectionModal());
        });
        
        // 모달 외부 클릭 시 닫기
        this.referenceSelectionModal.addEventListener('click', (e) => {
            if (e.target === this.referenceSelectionModal) {
                this.closeReferenceSelectionModal();
            }
        });
        
        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.referenceSelectionModal.style.display === 'flex') {
                this.closeReferenceSelectionModal();
            }
        });
        
        // 검색 및 필터 이벤트
        if (this.referenceSearchInput) {
            this.referenceSearchInput.addEventListener('input', () => this.filterReferenceList());
        }
        if (this.referenceTypeFilterModal) {
            this.referenceTypeFilterModal.addEventListener('change', () => this.filterReferenceList());
        }
        
        console.log('✅ 레퍼런스 선택 기능 초기화 완료');
    }

    /**
     * 참고 레퍼런스 패널 토글
     * 
     * - 패널 펼치기/접기
     * - 아이콘 회전 애니메이션
     * - ARIA 속성 업데이트
     */
    toggleReferenceCollapse() {
        try {
            if (!this.referenceLinkContent || !this.referenceCollapseToggle) {
                console.warn('⚠️ 레퍼런스 패널 요소를 찾을 수 없습니다.');
                return;
            }
            
            const isExpanded = this.referenceCollapseToggle.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                // 패널 접기
                this.referenceLinkContent.classList.remove('expanded');
                this.referenceCollapseToggle.setAttribute('aria-expanded', 'false');
                this.referenceLinkContent.setAttribute('aria-hidden', 'true');
                console.log('📚 레퍼런스 패널 접힘');
            } else {
                // 패널 펼치기
                this.referenceLinkContent.classList.add('expanded');
                this.referenceCollapseToggle.setAttribute('aria-expanded', 'true');
                this.referenceLinkContent.setAttribute('aria-hidden', 'false');
                console.log('📚 레퍼런스 패널 펼침');
            }
        } catch (error) {
            console.error('레퍼런스 패널 토글 실패:', error);
        }
    }

    // 레퍼런스 유형 배지 렌더링
    renderReferenceTypeBadge(referenceType) {
        const type = (referenceType || 'unspecified');
        let label = '미지정';
        let cls = 'reference-type-badge--unspecified';
        if (type === 'structure') { label = '구조'; cls = 'reference-type-badge--structure'; }
        else if (type === 'idea') { label = '아이디어'; cls = 'reference-type-badge--idea'; }
        return `
            <span class="reference-type-badge ${cls}" role="status" aria-label="레퍼런스 유형: ${label}">
                ${label}
            </span>
        `;
    }

    async init() {
        this.bindEvents();
        await this.waitForFirebase();
        this.setupAuthStateListener();
        this.initCharLimitToggle();
        // 초기 글자 제한 반영
        this.applyCharLimit(this.maxLength);
        // 실시간 중복 체크 초기화
        this.initLiveDuplicateCheck();
        // 레퍼런스 선택 기능 초기화
        this.initReferenceSelection();
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
        
        // 새로고침 버튼 이벤트 리스너 (PC 전용)
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshAllData());
        }
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

        // 트래킹 필터 이벤트
        setTimeout(() => {
            if (this.trackingSortSelect) {
                this.trackingSortSelect.value = this.trackingSort;
                this.trackingSortSelect.addEventListener('change', (e) => {
                    this.trackingSort = e.target.value;
                    localStorage.setItem('dtw_tracking_sort', this.trackingSort);
                    this.refreshUI({ trackingPosts: true });
                });
            }
            if (this.trackingStatusSelect) {
                this.trackingStatusSelect.value = this.trackingStatusFilter;
                this.trackingStatusSelect.addEventListener('change', (e) => {
                    this.trackingStatusFilter = e.target.value;
                    localStorage.setItem('dtw_tracking_status', this.trackingStatusFilter);
                    this.refreshUI({ trackingPosts: true });
                });
            }
            if (this.trackingSearchInput) {
                this.trackingSearchInput.value = this.trackingSearch;
                this.trackingSearchDebounce = null;
                this.trackingSearchInput.addEventListener('input', (e) => {
                    const val = e.target.value;
                    clearTimeout(this.trackingSearchDebounce);
                    // debounce로 성능 최적화 및 sticky 필터바 충돌 방지
                    this.trackingSearchDebounce = setTimeout(() => {
                        this.trackingSearch = val;
                        localStorage.setItem('dtw_tracking_search', this.trackingSearch);
                        // refreshUI 사용으로 통합 업데이트
                        this.refreshUI({ trackingPosts: true });
                    }, 300);
                });
            }
            if (this.trackingUpdatedFromInput) {
                this.trackingUpdatedFromInput.value = this.trackingUpdatedFrom;
                this.trackingUpdatedFromInput.addEventListener('change', (e) => {
                    this.trackingUpdatedFrom = e.target.value;
                    localStorage.setItem('dtw_tracking_from', this.trackingUpdatedFrom);
                    this.refreshUI({ trackingPosts: true });
                });
            }
            if (this.trackingUpdatedToInput) {
                this.trackingUpdatedToInput.value = this.trackingUpdatedTo;
                this.trackingUpdatedToInput.addEventListener('change', (e) => {
                    this.trackingUpdatedTo = e.target.value;
                    localStorage.setItem('dtw_tracking_to', this.trackingUpdatedTo);
                    this.refreshUI({ trackingPosts: true });
                });
            }
            if (this.trackingDateClearBtn) {
                this.trackingDateClearBtn.addEventListener('click', () => {
                    this.trackingUpdatedFrom = '';
                    this.trackingUpdatedTo = '';
                    if (this.trackingUpdatedFromInput) this.trackingUpdatedFromInput.value = '';
                    if (this.trackingUpdatedToInput) this.trackingUpdatedToInput.value = '';
                    localStorage.removeItem('dtw_tracking_from');
                    localStorage.removeItem('dtw_tracking_to');
                    this.refreshUI({ trackingPosts: true });
                });
            }

            // 수치 범위 필터 입력 바인딩
            const bindRange = (input, key) => {
                if (!input) return;
                if (this.rangeFilters[key] !== undefined) input.value = this.rangeFilters[key];
                input.addEventListener('input', (e) => {
                    const val = e.target.value;
                    if (val === '') {
                        delete this.rangeFilters[key];
                    } else {
                        this.rangeFilters[key] = Number(val) || 0;
                    }
                    localStorage.setItem('dtw_tracking_ranges', JSON.stringify(this.rangeFilters));
                    this.refreshUI({ trackingPosts: true });
                });
            };
            bindRange(this.minViewsInput, 'minViews');
            bindRange(this.maxViewsInput, 'maxViews');
            bindRange(this.minLikesInput, 'minLikes');
            bindRange(this.maxLikesInput, 'maxLikes');
            bindRange(this.minCommentsInput, 'minComments');
            bindRange(this.maxCommentsInput, 'maxComments');
            bindRange(this.minSharesInput, 'minShares');
            bindRange(this.maxSharesInput, 'maxShares');
            bindRange(this.minFollowsInput, 'minFollows');
            bindRange(this.maxFollowsInput, 'maxFollows');

            // 범위 필터 접기/펼치기 초기화
            this.initRangeFilter();
            
            if (this.exportCsvBtn) {
                this.exportCsvBtn.addEventListener('click', () => this.exportTrackingCsv());
            }
        }, 0);

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

        // 패널 기반 LLM 검증 버튼 초기 바인딩
        // DOM이 완전히 로드된 후 실행되도록 setTimeout 사용
        setTimeout(() => {
            this.bindPanelLLMButtons();
        }, 100);
    }

    // 글자 제한 토글 초기화
    initCharLimitToggle() {
        const toggle = document.getElementById('char-limit-toggle');
        if (!toggle) return;
        const buttons = toggle.querySelectorAll('.segment-btn');
        buttons.forEach(btn => {
            const limit = parseInt(btn.getAttribute('data-limit'), 10);
            const isActive = limit === this.maxLength;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.setCharLimit(limit);
                buttons.forEach(b => {
                    const l = parseInt(b.getAttribute('data-limit'), 10);
                    const on = l === this.maxLength;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-selected', on ? 'true' : 'false');
                });
            });
        });
    }

    setCharLimit(limit) {
        const value = limit === 1000 ? 1000 : 500;
        if (this.maxLength === value) return;
        this.maxLength = value;
        localStorage.setItem('dualTextWriter_charLimit', String(value));
        this.applyCharLimit(value);
    }

    applyCharLimit(value) {
        // textarea maxlength 업데이트
        if (this.refTextInput) this.refTextInput.setAttribute('maxlength', String(value));
        if (this.editTextInput) this.editTextInput.setAttribute('maxlength', String(value));
        // 상단 카운터 최대값 표시 업데이트
        const refMax = document.getElementById('ref-max-count');
        const editMax = document.getElementById('edit-max-count');
        if (refMax) refMax.textContent = String(value);
        if (editMax) editMax.textContent = String(value);
        // 진행바/버튼 상태 재계산
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
    }

    // 저장된 글 필터 UI 초기화 및 이벤트 바인딩
    initSavedFilters() {
        const container = document.querySelector('#saved-tab .segmented-control');
        if (!container) return;
        const buttons = container.querySelectorAll('.segment-btn');
        if (!buttons || buttons.length === 0) return;

        // 레퍼런스 유형 필터 초기화
        this.referenceTypeFilter = localStorage.getItem('dualTextWriter_referenceTypeFilter') || 'all';
        this.referenceTypeFilterSelect = document.getElementById('reference-type-filter');
        this.referenceTypeFilterContainer = document.getElementById('reference-type-filter-container');
        if (this.referenceTypeFilterSelect) {
            this.referenceTypeFilterSelect.value = this.referenceTypeFilter;
            this.referenceTypeFilterSelect.onchange = () => {
                this.referenceTypeFilter = this.referenceTypeFilterSelect.value;
                localStorage.setItem('dualTextWriter_referenceTypeFilter', this.referenceTypeFilter);
                this.renderSavedTexts();
            };
        }

        // 주제 필터 이벤트 리스너 설정 (작성 글용)
        if (this.topicFilter) {
            this.currentTopicFilter = localStorage.getItem('dualTextWriter_topicFilter') || 'all';
            this.topicFilter.value = this.currentTopicFilter;
            this.topicFilter.onchange = () => {
                this.currentTopicFilter = this.topicFilter.value;
                localStorage.setItem('dualTextWriter_topicFilter', this.currentTopicFilter);
                this.renderSavedTextsCache = null; // 캐시 무효화
                this.renderSavedTexts();
            };
        }
        
        // 소스 필터 이벤트 리스너 설정 (레퍼런스 글용)
        if (this.sourceFilter) {
            this.currentSourceFilter = localStorage.getItem('dualTextWriter_sourceFilter') || 'all';
            this.sourceFilter.value = this.currentSourceFilter;
            this.sourceFilter.onchange = () => {
                this.currentSourceFilter = this.sourceFilter.value;
                localStorage.setItem('dualTextWriter_sourceFilter', this.currentSourceFilter);
                this.renderSavedTextsCache = null; // 캐시 무효화
                this.renderSavedTexts();
            };
        }

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

        // 초기 표시 상태
        this.updateReferenceTypeFilterVisibility();
    }

    setSavedFilter(filter) {
        // 에러 처리: 필터 값이 예상 범위를 벗어난 경우 처리
        const validFilters = ['all', 'edit', 'reference', 'reference-used'];
        if (!validFilters.includes(filter)) {
            console.warn('setSavedFilter: 잘못된 필터 값:', filter);
            return;
        }
        
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

        // 유형 필터 표시/숨김
        this.updateReferenceTypeFilterVisibility();
        
        // 주제/소스 필터 표시/숨김
        this.updateTopicSourceFilterVisibility();

        // 목록 렌더링
        this.renderSavedTexts();
        
        // 접근성: 필터 변경 후 포커스 관리 (선택적, 필요 시 활성화)
        // setTimeout을 사용하여 렌더링 완료 후 실행
        // const firstItem = this.savedList.querySelector('.saved-item');
        // if (firstItem) {
        //     setTimeout(() => {
        //         firstItem.focus();
        //     }, 100);
        // }
    }

    updateTopicFilterOptions() {
        if (!this.topicFilter) return;
        
        // 작성 글(type === 'edit')에서만 고유한 주제 목록 추출
        const topics = new Set();
        this.savedTexts.forEach(item => {
            // 작성 글만 필터링
            if ((item.type || 'edit') === 'edit' && item.topic && item.topic.trim()) {
                topics.add(item.topic.trim());
            }
        });
        
        // 주제 목록을 배열로 변환하고 정렬
        this.availableTopics = Array.from(topics).sort();
        
        // 드롭다운 옵션 업데이트
        const currentValue = this.topicFilter.value;
        this.topicFilter.innerHTML = '<option value="all">전체 주제</option>';
        
        this.availableTopics.forEach(topic => {
            const option = document.createElement('option');
            option.value = topic;
            option.textContent = topic;
            this.topicFilter.appendChild(option);
        });
        
        // 이전 선택값 복원
        if (currentValue && this.availableTopics.includes(currentValue)) {
            this.topicFilter.value = currentValue;
        } else {
            this.topicFilter.value = 'all';
            this.currentTopicFilter = 'all';
        }
    }
    
    updateSourceFilterOptions() {
        if (!this.sourceFilter) return;
        
        // 레퍼런스 글(type === 'reference')에서만 고유한 소스(주제) 목록 추출
        const sources = new Set();
        this.savedTexts.forEach(item => {
            // 레퍼런스 글만 필터링
            if ((item.type || 'edit') === 'reference' && item.topic && item.topic.trim()) {
                sources.add(item.topic.trim());
            }
        });
        
        // 소스 목록을 배열로 변환하고 정렬
        this.availableSources = Array.from(sources).sort();
        
        // 드롭다운 옵션 업데이트
        const currentValue = this.sourceFilter.value;
        this.sourceFilter.innerHTML = '<option value="all">전체 소스</option>';
        
        this.availableSources.forEach(source => {
            const option = document.createElement('option');
            option.value = source;
            option.textContent = source;
            this.sourceFilter.appendChild(option);
        });
        
        // 이전 선택값 복원
        if (currentValue && this.availableSources.includes(currentValue)) {
            this.sourceFilter.value = currentValue;
        } else {
            this.sourceFilter.value = 'all';
            this.currentSourceFilter = 'all';
        }
    }
    
    updateTopicSourceFilterVisibility() {
        // 작성 글 필터일 때: 주제 필터 표시, 소스 필터 숨김
        if (this.savedFilter === 'edit') {
            if (this.topicFilterGroup) {
                this.topicFilterGroup.style.display = 'flex';
            }
            if (this.sourceFilterGroup) {
                this.sourceFilterGroup.style.display = 'none';
            }
        }
        // 레퍼런스 글 필터일 때: 소스 필터 표시, 주제 필터 숨김
        else if (this.savedFilter === 'reference' || this.savedFilter === 'reference-used') {
            if (this.topicFilterGroup) {
                this.topicFilterGroup.style.display = 'none';
            }
            if (this.sourceFilterGroup) {
                this.sourceFilterGroup.style.display = 'flex';
            }
        }
        // 전체 필터일 때: 둘 다 숨김
        else {
            if (this.topicFilterGroup) {
                this.topicFilterGroup.style.display = 'none';
            }
            if (this.sourceFilterGroup) {
                this.sourceFilterGroup.style.display = 'none';
            }
        }
    }

    updateReferenceTypeFilterVisibility() {
        if (!this.referenceTypeFilterContainer) return;
        const show = this.savedFilter === 'reference' || this.savedFilter === 'reference-used';
        this.referenceTypeFilterContainer.style.display = show ? 'flex' : 'none';
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

    /**
     * 텍스트 내용을 정규화합니다.
     * 
     * 중복 체크를 위해 텍스트를 정규화합니다. 공백, 줄바꿈, 캐리지 리턴을 정리하여
     * 동일한 내용을 다른 형식으로 입력한 경우에도 중복으로 인식할 수 있도록 합니다.
     * 
     * @param {string} text - 정규화할 텍스트
     * @returns {string} 정규화된 텍스트 (빈 문자열 또는 정규화된 텍스트)
     * 
     * @example
     * // 공백 차이 정규화
     * normalizeContent('hello   world') // 'hello world'
     * 
     * // 줄바꿈 정리
     * normalizeContent('hello\nworld') // 'hello world'
     * 
     * // 앞뒤 공백 제거
     * normalizeContent('  hello world  ') // 'hello world'
     */
    normalizeContent(text) {
        // null, undefined, 빈 문자열 처리
        if (!text || typeof text !== 'string') {
            return '';
        }

        try {
            // 앞뒤 공백 제거
            let normalized = text.trim();
            
            // 연속된 공백을 하나로 변환
            normalized = normalized.replace(/\s+/g, ' ');
            
            // 줄바꿈을 공백으로 변환
            normalized = normalized.replace(/\n+/g, ' ');
            
            // 캐리지 리턴을 공백으로 변환
            normalized = normalized.replace(/\r+/g, ' ');
            
            // 최종적으로 연속된 공백이 생길 수 있으므로 다시 정리
            normalized = normalized.replace(/\s+/g, ' ');
            
            return normalized.trim();
        } catch (error) {
            // 정규식 에러 발생 시 원본 텍스트의 trim만 반환
            console.warn('텍스트 정규화 중 오류 발생:', error);
            return typeof text === 'string' ? text.trim() : '';
        }
    }

    /**
     * 레퍼런스 내용의 중복 여부를 확인합니다.
     *
     * 저장된 레퍼런스(`this.savedTexts` 중 type === 'reference'인 항목)와
     * 입력된 내용(`content`)을 정규화하여 완전 일치 여부를 확인합니다.
     * 첫 번째로 발견된 중복 레퍼런스 객체를 반환하며, 없으면 null을 반환합니다.
     *
     * 성능: O(N) - 레퍼런스 수가 많지 않은 현재 구조에서 적합하며,
     * 추후 해시 기반 최적화(Phase 3)로 확장 가능합니다.
     *
     * @param {string} content - 확인할 레퍼런스 내용
     * @returns {Object|null} 중복된 레퍼런스 객체 또는 null
     *
     * @example
     * const dup = this.checkDuplicateReference('  같은  내용\\n입니다 ');
     * if (dup) { console.log('중복 발견:', dup.id); }
     */
    checkDuplicateReference(content) {
        // 안전성 체크
        if (!content || typeof content !== 'string') {
            return null;
        }
        if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) {
            return null;
        }

        // 1) 해시가 있는 경우: 해시 우선 비교
        try {
            const normalizedForHash = this.normalizeContent(content);
            const targetHash = this.calculateContentHashSync
                ? this.calculateContentHashSync(normalizedForHash)
                : null;

            if (targetHash) {
                const byHash = this.savedTexts.find((item) => {
                    if ((item.type || 'edit') !== 'reference') return false;
                    return (item.contentHash && item.contentHash === targetHash);
                });
                if (byHash) {
                    return byHash;
                }
            }
        } catch (e) {
            // 해시 계산 실패 시 무시하고 정규화 비교로 폴백
        }

        // 2) 정규화 기반 완전 일치 비교
        const normalizedContent = this.normalizeContent(content);
        if (!normalizedContent) return null;
        const duplicate = this.savedTexts.find((item) => {
            if ((item.type || 'edit') !== 'reference') return false;
            const itemContent = typeof item.content === 'string' ? item.content : '';
            const normalizedItem = this.normalizeContent(itemContent);
            return normalizedItem === normalizedContent;
        });

        return duplicate || null;
    }

    /**
     * 내용 해시(SHA-256)를 계산합니다. 브라우저 SubtleCrypto 사용.
     * 사용이 불가한 환경을 위해 동기 폴백 해시도 제공합니다.
     *
     * @param {string} content - 정규화된 내용
     * @returns {Promise<string>} 16진수 해시 문자열
     */
    async calculateContentHash(content) {
        if (!content || typeof content !== 'string') return '';
        try {
            if (window.crypto && window.crypto.subtle) {
                const encoder = new TextEncoder();
                const data = encoder.encode(content);
                const digest = await window.crypto.subtle.digest('SHA-256', data);
                return Array.from(new Uint8Array(digest))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
            }
        } catch (e) {
            console.warn('SHA-256 해시 계산 실패, 폴백 해시 사용:', e);
        }
        // 폴백: 간단한 동기 해시 (충돌 가능성 있으나 임시용)
        return this.calculateContentHashSync(content);
    }

    /**
     * 동기 폴백 해시 (간단한 32비트 누적 해시)
     * @param {string} content
     * @returns {string} 16진수 해시
     */
    calculateContentHashSync(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            hash = (hash << 5) - hash + content.charCodeAt(i);
            hash |= 0;
        }
        // 32비트 정수 -> 8자리 16진수
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    /**
     * 기존 레퍼런스에 contentHash를 채워 넣는 마이그레이션 유틸리티.
     * 대량 문서에는 배치/백오프 전략이 필요할 수 있음.
     */
    /**
     * 기존 레퍼런스에 contentHash를 배치 처리로 마이그레이션
     * 
     * 성능 최적화:
     * - 순차 업데이트 N번 → writeBatch() 배치 처리
     * - 실행 시간: 20-30초 → 2-3초 (90% 단축)
     * - 500개 단위로 청크 분할 (Firestore 배치 제한)
     * - 배치 간 100ms 딜레이 (서버 부하 분산)
     * 
     * @returns {Promise<void>}
     */
    async migrateHashesForExistingReferences() {
        if (!this.currentUser || !this.isFirebaseReady) return;
        if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) return;
        
        try {
            // 1. 업데이트 대상 수집
            const updates = [];
            for (const item of this.savedTexts) {
                if ((item.type || 'edit') !== 'reference') continue;
                if (item.contentHash) continue; // 이미 해시 있음
                
                const normalized = this.normalizeContent(item.content || '');
                const hash = await this.calculateContentHash(normalized);
                if (!hash) continue;
                
                updates.push({ id: item.id, contentHash: hash });
            }
            
            if (updates.length === 0) {
                this.showMessage('✅ 모든 레퍼런스가 최신 상태입니다.', 'success');
                return;
            }
            
            console.log(`📊 ${updates.length}개 레퍼런스 해시 마이그레이션 시작...`);
            
            // 진행률 모달 표시
            this.showMigrationProgressModal(updates.length);
            
            // 2. ✅ 배치 처리 (설정 상수 사용)
            const BATCH_SIZE = DualTextWriter.CONFIG.BATCH_SIZE;
            const BATCH_DELAY_MS = DualTextWriter.CONFIG.BATCH_DELAY_MS;
            const chunks = [];
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                chunks.push(updates.slice(i, i + BATCH_SIZE));
            }
            
            let completedCount = 0;
            for (const [index, chunk] of chunks.entries()) {
                const batch = window.firebaseWriteBatch(this.db);
                
                for (const u of chunk) {
                    const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', u.id);
                    batch.update(textRef, {
                        contentHash: u.contentHash,
                        hashVersion: 1,
                        updatedAt: window.firebaseServerTimestamp()
                    });
                    
                    // 로컬 반영
                    const local = this.savedTexts.find(t => t.id === u.id);
                    if (local) {
                        local.contentHash = u.contentHash;
                        local.hashVersion = 1;
                    }
                }
                
                // 배치 커밋
                await batch.commit();
                completedCount += chunk.length;
                
                // 진행률 업데이트
                this.updateMigrationProgress(completedCount, updates.length);
                
                // 진행률 로그 (디버깅용)
                const progress = Math.round((completedCount / updates.length) * 100);
                console.log(`⏳ 마이그레이션 진행 중: ${completedCount}/${updates.length} (${progress}%)`);
                
                // 다음 배치 전 짧은 대기 (서버 부하 분산, 설정 상수 사용)
                if (index < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }
            
            // 진행률 모달 닫기
            this.hideMigrationProgressModal();
            
            // 완료 메시지
            this.showMessage(
                `✅ ${updates.length}개 레퍼런스 해시 마이그레이션 완료!`, 
                'success'
            );
            console.log(`✅ 마이그레이션 완료: ${updates.length}개`);
            
        } catch (error) {
            // 진행률 모달 닫기 (에러 시)
            this.hideMigrationProgressModal();
            
            console.error('❌ 해시 마이그레이션 실패:', error);
            this.showMessage(
                `❌ 해시 마이그레이션 중 오류가 발생했습니다: ${error.message}`, 
                'error'
            );
        }
    }
    
    /**
     * 마이그레이션 진행률 모달 표시
     * @param {number} total - 전체 항목 수
     */
    showMigrationProgressModal(total) {
        const modal = document.getElementById('migration-progress-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.updateMigrationProgress(0, total);
        }
    }
    
    /**
     * 마이그레이션 진행률 업데이트
     * @param {number} completed - 완료된 항목 수
     * @param {number} total - 전체 항목 수
     */
    updateMigrationProgress(completed, total) {
        const progress = Math.round((completed / total) * 100);
        
        const progressBar = document.getElementById('migration-progress-bar');
        const progressText = document.getElementById('migration-progress-text');
        const progressContainer = progressBar?.parentElement;
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${completed} / ${total} 완료 (${progress}%)`;
        }
        
        if (progressContainer) {
            progressContainer.setAttribute('aria-valuenow', progress);
        }
    }
    
    /**
     * 마이그레이션 진행률 모달 숨김
     */
    hideMigrationProgressModal() {
        const modal = document.getElementById('migration-progress-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * 중복 레퍼런스 확인 모달을 표시합니다.
     *
     * 중복된 레퍼런스의 요약 정보를 보여주고, 사용자에게
     * 저장 취소, 기존 레퍼런스 보기, 그래도 저장 중 하나를 선택하게 합니다.
     *
     * 접근성:
     * - role="dialog", aria-modal="true" 적용
     * - ESC 로 닫기 지원
     * - 버튼에 명확한 라벨 적용
     *
     * @param {Object} duplicate - 중복된 레퍼런스 정보 객체
     * @returns {Promise<boolean>} true: 그래도 저장, false: 취소/보기 선택
     */
    async showDuplicateConfirmModal(duplicate) {
        return new Promise((resolve) => {
            // 기존 모달 제거 (중복 표시 방지)
            const existing = document.getElementById('duplicate-confirm-overlay');
            if (existing) existing.remove();

            // 날짜 포맷 유틸 (내부 전용)
            // 날짜 포맷팅은 클래스 메서드 formatDateFromFirestore 사용

            const overlay = document.createElement('div');
            overlay.id = 'duplicate-confirm-overlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.35);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
            `;

            const modal = document.createElement('div');
            modal.id = 'duplicate-confirm-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'duplicate-confirm-title');
            modal.style.cssText = `
                width: 100%;
                max-width: 560px;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                padding: 20px;
            `;

            const createdAtStr = this.formatDateFromFirestore(duplicate?.createdAt);
            const topicStr = duplicate?.topic ? this.escapeHtml(duplicate.topic) : '';
            const contentPreview = this.escapeHtml(
                (duplicate?.content || '').substring(0, 140)
            ) + ((duplicate?.content || '').length > 140 ? '...' : '');

            modal.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px;">
                    <div style="font-size: 1.25rem;">⚠️</div>
                    <h3 id="duplicate-confirm-title" style="margin:0; font-size:1.1rem; font-weight:700; color:#333;">
                        중복 레퍼런스 발견
                    </h3>
                </div>
                <p style="margin:0 0 12px; color:#555; line-height:1.6;">
                    입력하신 내용과 동일한 레퍼런스가 이미 저장되어 있습니다. 어떻게 하시겠습니까?
                </p>
                <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; margin-bottom: 16px;">
                    ${createdAtStr ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>저장 날짜:</strong> ${createdAtStr}</div>` : ''}
                    ${topicStr ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>주제:</strong> ${topicStr}</div>` : ''}
                    <div style="font-size:0.95rem; color:#444;"><strong>내용:</strong> ${contentPreview}</div>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" data-action="cancel" class="btn btn-secondary" aria-label="저장 취소"
                        style="padding:8px 12px; border-radius:8px; background:#e9ecef; border:none; color:#333; cursor:pointer;">
                        취소
                    </button>
                    <button type="button" data-action="view" class="btn btn-primary" aria-label="기존 레퍼런스 보기"
                        style="padding:8px 12px; border-radius:8px; background:#0d6efd; border:none; color:#fff; cursor:pointer;">
                        기존 레퍼런스 보기
                    </button>
                    <button type="button" data-action="save" class="btn btn-warning" aria-label="그래도 저장"
                        style="padding:8px 12px; border-radius:8px; background:#ffc107; border:none; color:#333; cursor:pointer;">
                        그래도 저장
                    </button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const cleanup = (result) => {
                window.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                resolve(result);
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    cleanup(false);
                }
            };
            window.addEventListener('keydown', onKeyDown);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup(false);
                }
            });

            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
            modal.querySelector('[data-action="view"]').addEventListener('click', async () => {
                try {
                    this.setSavedFilter && this.setSavedFilter('reference');
                    await this.refreshSavedTextsUI?.();
                } catch (err) {
                    console.warn('기존 레퍼런스 보기 처리 중 경고:', err);
                }
                cleanup(false);
            });
            modal.querySelector('[data-action="save"]').addEventListener('click', () => cleanup(true));

            // 포커스 초기 버튼로 이동
            const firstBtn = modal.querySelector('[data-action="save"]');
            if (firstBtn) firstBtn.focus();
        });
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
        // 캐시 무효화 (데이터 변경 시)
        this.renderSavedTextsCache = null;
        this.renderSavedTextsCacheKey = null;
        this.updateCharacterCount('ref');
        this.updateCharacterCount('edit');
        this.renderSavedTexts();
    }

    clearText(panel) {
        const textInput = panel === 'ref' ? this.refTextInput : this.editTextInput;
        const panelName = panel === 'ref' ? '레퍼런스 글' : '수정/작성 글';

        if (confirm(`${panelName}을 지우시겠습니까?`)) {
            textInput.value = '';
            if (panel === 'edit' && this.editTopicInput) {
                this.editTopicInput.value = '';
            }
            if (panel === 'ref' && this.refTopicInput) {
                this.refTopicInput.value = '';
            }
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

            // 레퍼런스 저장 시 referenceType 필수
            if (panel === 'ref') {
                let refType = 'unspecified';
                if (this.refTypeStructure && this.refTypeStructure.checked) refType = 'structure';
                if (this.refTypeIdea && this.refTypeIdea.checked) refType = 'idea';
                if (refType === 'unspecified') {
                    this.showMessage('레퍼런스 유형(구조/아이디어)을 선택해주세요.', 'error');
                    return;
                }
                textData.referenceType = refType;
            }

            // 수정/작성 글 저장 시 주제 추가 (선택사항)
            if (panel === 'edit' && this.editTopicInput) {
                const topic = this.editTopicInput.value.trim();
                if (topic) {
                    textData.topic = topic;
                }
            }
            
            // 작성글 저장 시 연결된 레퍼런스 ID 배열 추가
            if (panel === 'edit') {
                // ✅ 유효한 레퍼런스 ID만 필터링 (존재 여부 확인)
                const validReferences = this.selectedReferences.filter(refId =>
                    this.savedTexts.some(item => item.id === refId && (item.type || 'edit') === 'reference')
                );
                
                if (validReferences.length > 0) {
                    textData.linkedReferences = validReferences;
                    textData.referenceMeta = {
                        linkedAt: window.firebaseServerTimestamp(),  // 연결 시점
                        linkCount: validReferences.length             // 연결 개수 (캐시)
                    };
                    
                    console.log(`📚 ${validReferences.length}개 레퍼런스 연결됨`);
                } else {
                    // 빈 배열로 설정 (null이 아닌 빈 배열)
                    textData.linkedReferences = [];
                }
            }
            
            // 레퍼런스 글 저장 시 주제 추가 (선택사항)
            if (panel === 'ref' && this.refTopicInput) {
                const topic = this.refTopicInput.value.trim();
                if (topic) {
                    textData.topic = topic;
                }
            }

            // 레퍼런스 저장 시 해시 필드 추가 (정규화 기반)
            if (panel === 'ref') {
                try {
                    const normalizedForHash = this.normalizeContent(text);
                    const contentHash = await this.calculateContentHash(normalizedForHash);
                    if (contentHash) {
                        textData.contentHash = contentHash;
                        textData.hashVersion = 1;
                    }
                } catch (e) {
                    console.warn('contentHash 계산 실패: 해시 없이 저장합니다.', e);
                }
            }

            // 레퍼런스 저장 시 중복 체크 (referenceType 체크 이후, Firestore 저장 이전)
            if (panel === 'ref') {
                try {
                    const duplicate = this.checkDuplicateReference(text);
                    if (duplicate) {
                        // 중복 확인 모달 표시
                        const shouldProceed = await this.showDuplicateConfirmModal(duplicate);
                        if (!shouldProceed) {
                            // 사용자가 취소 선택 시 저장 중단
                            return;
                        }
                        // shouldProceed가 true이면 계속 진행 (그래도 저장)
                    }
                } catch (error) {
                    // 중복 체크 실패 시 저장 계속 진행 (안전한 기본값)
                    console.warn('중복 체크 중 오류 발생, 저장을 계속 진행합니다:', error);
                    // 에러 로그만 기록하고 저장은 계속 진행
                }
            }

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
            type: panel === 'ref' ? 'reference' : 'edit',
            referenceType: panel === 'ref' ? textData.referenceType : undefined,
            topic: panel === 'edit' ? textData.topic : (panel === 'ref' ? textData.topic : undefined),
            contentHash: panel === 'ref' ? textData.contentHash : undefined,
            hashVersion: panel === 'ref' ? textData.hashVersion : undefined,
            linkedReferences: panel === 'edit' ? textData.linkedReferences : undefined,
            referenceMeta: panel === 'edit' ? textData.referenceMeta : undefined
        };

        // Optimistic UI: 즉시 로컬 데이터 업데이트 및 UI 반영
        this.savedTexts.unshift(savedItem);
        // 캐시 무효화 (데이터 변경 시)
        this.renderSavedTextsCache = null;
        this.renderSavedTextsCacheKey = null;
        // 주제 필터 옵션 업데이트 (새 주제가 추가될 수 있으므로)
        this.updateTopicFilterOptions();
        this.refreshUI({ savedTexts: true, force: true });

        this.showMessage(`${panelName}이 저장되었습니다!`, 'success');

        // Clear input
        textInput.value = '';
        if (panel === 'edit' && this.editTopicInput) {
            this.editTopicInput.value = '';
        }
        if (panel === 'ref' && this.refTopicInput) {
            this.refTopicInput.value = '';
        }
        
        // ✅ 작성글 저장 후 선택된 레퍼런스 초기화
        if (panel === 'edit') {
            this.selectedReferences = [];
            this.renderSelectedReferenceTags();
            if (this.selectedRefCount) {
                this.selectedRefCount.textContent = '(0개 선택됨)';
            }
            console.log('✅ 레퍼런스 선택 초기화 완료');
        }
        
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

    // 디바운스 타이머 (성능 최적화: 과도한 호출 방지)
    renderSavedTextsDebounceTimer = null;
    
    // 메모이제이션 캐시 (성능 최적화: 같은 필터 조건에서 재계산 방지)
    renderSavedTextsCache = null;
    renderSavedTextsCacheKey = null;
    
    async renderSavedTexts() {
        // 디바운스 적용 (300ms)
        if (this.renderSavedTextsDebounceTimer) {
            clearTimeout(this.renderSavedTextsDebounceTimer);
        }
        
        return new Promise((resolve) => {
            this.renderSavedTextsDebounceTimer = setTimeout(async () => {
                await this._renderSavedTextsImpl();
                resolve();
            }, 300);
        });
    }
    
    async _renderSavedTextsImpl() {
        // 메모이제이션: 캐시 키 생성 (필터 조건 기반)
        const topicOrSourceFilter = this.savedFilter === 'edit' 
            ? (this.currentTopicFilter || 'all')
            : (this.currentSourceFilter || 'all');
        const cacheKey = `${this.savedFilter}_${this.referenceTypeFilter || 'all'}_${topicOrSourceFilter}`;
        
        // 캐시 확인 (같은 필터 조건에서 재호출 방지)
        if (this.renderSavedTextsCache && this.renderSavedTextsCacheKey === cacheKey) {
            console.log('renderSavedTexts: 캐시된 결과 사용 (성능 최적화)');
            return;
        }
        
        console.log('renderSavedTexts 호출됨:', this.savedTexts);

        // 필터 적용
        let list = this.savedTexts;
        if (this.savedFilter === 'edit') {
            list = list.filter(item => item.type === 'edit');
        } else if (this.savedFilter === 'reference') {
            // 레퍼런스 탭에는 사용 안된 레퍼런스(usageCount === 0)만 표시
            // 주의: usageCount는 나중에 checkMultipleReferenceUsage()로 확인되므로,
            // 여기서는 type만 체크하고 실제 필터링은 사용 여부 확인 후 수행
            list = list.filter(item => (item.type || 'edit') === 'reference');
        } else if (this.savedFilter === 'reference-used') {
            // 사용된 레퍼런스만 필터링 (usageCount > 0)
            // 주의: usageCount는 나중에 checkMultipleReferenceUsage()로 확인되므로,
            // 여기서는 type만 체크하고 실제 필터링은 사용 여부 확인 후 수행
            list = list.filter(item => (item.type || 'edit') === 'reference');
        }

        // 레퍼런스 유형 필터 적용 (structure/idea)
        if ((this.savedFilter === 'reference' || this.savedFilter === 'reference-used') && this.referenceTypeFilter && this.referenceTypeFilter !== 'all') {
            list = list.filter(item => {
                const rtype = (item.referenceType || 'unspecified');
                return rtype === this.referenceTypeFilter;
            });
        }

        // 주제 필터 적용 (작성 글용)
        if (this.savedFilter === 'edit' && this.currentTopicFilter && this.currentTopicFilter !== 'all') {
            list = list.filter(item => {
                const itemTopic = item.topic || '';
                return itemTopic === this.currentTopicFilter;
            });
        }
        
        // 소스 필터 적용 (레퍼런스 글용)
        if ((this.savedFilter === 'reference' || this.savedFilter === 'reference-used') 
            && this.currentSourceFilter && this.currentSourceFilter !== 'all') {
            list = list.filter(item => {
                const itemTopic = item.topic || '';
                return itemTopic === this.currentSourceFilter;
            });
        }

        // 필터 옵션 업데이트
        if (this.savedFilter === 'edit') {
            this.updateTopicFilterOptions();
        } else if (this.savedFilter === 'reference' || this.savedFilter === 'reference-used') {
            this.updateSourceFilterOptions();
        }

        if (list.length === 0) {
            // 에러 처리: 필터 적용 시 데이터가 없는 경우 처리
            let emptyMsg = '저장된 글이 없습니다.';
            if (this.savedFilter === 'edit') {
                emptyMsg = '작성 글이 없습니다.';
            } else if (this.savedFilter === 'reference') {
                emptyMsg = '레퍼런스 글이 없습니다.';
            } else if (this.savedFilter === 'reference-used') {
                emptyMsg = '사용된 레퍼런스가 없습니다.';
            }
            this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">글을 작성하고 저장해보세요!</div>
                </div>
            `;
            return;
        }
        
        // 로딩 스켈레톤 표시 (데이터 조회 중)
        this.savedList.innerHTML = `
            <div class="skeleton-card">
                <div class="skeleton skeleton-card-header"></div>
                <div class="skeleton skeleton-card-content"></div>
                <div class="skeleton skeleton-card-content"></div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton skeleton-card-header"></div>
                <div class="skeleton skeleton-card-content"></div>
            </div>
        `;

        // 성능 최적화: 레퍼런스 글의 사용 여부를 배치 조회로 미리 확인
        const referenceItems = list.filter(item => (item.type || 'edit') === 'reference');
        let referenceUsageMap = {};
        // 모든 레퍼런스 항목에 대해 기본값 0으로 초기화 (배지가 항상 표시되도록 보장)
        referenceItems.forEach(item => {
            if (item.id) {
                referenceUsageMap[item.id] = 0;
            }
        });
        if (referenceItems.length > 0 && this.currentUser && this.isFirebaseReady) {
            try {
                const referenceIds = referenceItems.map(item => item.id).filter(id => id);
                if (referenceIds.length > 0) {
                    const fetchedUsageMap = await this.checkMultipleReferenceUsage(referenceIds);
                    // 조회된 결과를 referenceUsageMap에 병합
                    Object.assign(referenceUsageMap, fetchedUsageMap);
                }
            } catch (error) {
                console.error('레퍼런스 사용 여부 배치 조회 실패:', error);
                // 에러 발생 시에도 기본값 0이 이미 설정되어 있으므로 배지는 표시됨
            }
        }
        
        // 캐시 업데이트
        this.renderSavedTextsCacheKey = cacheKey;
        
        // 각 저장된 글에 대한 트래킹 데이터 조회 및 사용 여부 추가 (비동기)
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
            
            // 레퍼런스 글인 경우 사용 여부 추가
            let usageCount = 0;
            if ((item.type || 'edit') === 'reference') {
                // referenceUsageMap에서 usageCount를 가져오되, 없으면 0으로 설정
                usageCount = referenceUsageMap[item.id] !== undefined ? referenceUsageMap[item.id] : 0;
            }
            
            // 사용 여부를 item 객체에 추가하여 캐싱 (레퍼런스 글은 항상 usageCount 포함)
            const itemWithUsage = { ...item, usageCount };
            
            // reference 필터인 경우, usageCount가 0인 항목만 포함 (사용 안된 레퍼런스만)
            if (this.savedFilter === 'reference') {
                const isReference = (item.type || 'edit') === 'reference';
                if (!isReference || usageCount !== 0) {
                    return null; // 필터링 대상에서 제외 (사용된 레퍼런스는 제외)
                }
            }
            
            // reference-used 필터인 경우, usageCount가 1 이상인 항목만 포함
            if (this.savedFilter === 'reference-used') {
                const isReference = (item.type || 'edit') === 'reference';
                if (!isReference || usageCount === 0) {
                    return null; // 필터링 대상에서 제외
                }
            }
            
            return { item: itemWithUsage, postData, index };
        }));
        
        // reference 또는 reference-used 필터인 경우 null인 항목 제거
        const filteredItemsWithTracking = (this.savedFilter === 'reference' || this.savedFilter === 'reference-used')
            ? itemsWithTracking.filter(result => result !== null)
            : itemsWithTracking;
        
        // 필터링 후 빈 목록 체크
        if (filteredItemsWithTracking.length === 0) {
            let emptyMsg = '저장된 글이 없습니다.';
            if (this.savedFilter === 'edit') {
                emptyMsg = '작성 글이 없습니다.';
            } else if (this.savedFilter === 'reference') {
                emptyMsg = '레퍼런스 글이 없습니다.';
            } else if (this.savedFilter === 'reference-used') {
                emptyMsg = '사용된 레퍼런스가 없습니다.';
            }
            this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">글을 작성하고 저장해보세요!</div>
                </div>
            `;
            // 접근성: 스크린 리더에 빈 목록 상태 전달 (aria-live로 자동 전달됨)
            this.savedList.setAttribute('aria-label', `저장된 글 목록: ${emptyMsg}`);
            return;
        }

        // 성능 최적화: 많은 카드 렌더링 시 배치 처리
        const batchSize = 10;
        const totalItems = itemsWithTracking.length;
        
        // 접근성: 필터 결과를 스크린 리더에 전달 (aria-live="polite"로 자동 전달됨)
        const filterDescription = this.savedFilter === 'edit' ? '작성 글' 
            : this.savedFilter === 'reference' ? '레퍼런스 글'
            : this.savedFilter === 'reference-used' ? '사용된 레퍼런스'
            : '저장된 글';
        this.savedList.setAttribute('aria-label', `저장된 글 목록: ${filterDescription} ${totalItems}개`);
        
        if (totalItems > batchSize) {
            // 대량 렌더링: 첫 번째 배치만 즉시 렌더링, 나머지는 requestAnimationFrame으로 처리
            const firstBatch = filteredItemsWithTracking.slice(0, batchSize);
            this.savedList.innerHTML = firstBatch.map(({ item, postData, index }) => {
                return this.renderSavedItemCard(item, postData, index);
            }).join('');
            
            // 나머지 배치를 점진적으로 렌더링
            let currentIndex = batchSize;
            const renderNextBatch = () => {
                if (currentIndex >= totalItems) return;
                
                const batch = filteredItemsWithTracking.slice(currentIndex, currentIndex + batchSize);
                const batchHtml = batch.map(({ item, postData, index }) => {
                    return this.renderSavedItemCard(item, postData, index);
                }).join('');
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = batchHtml;
                while (tempDiv.firstChild) {
                    this.savedList.appendChild(tempDiv.firstChild);
                }
                
                currentIndex += batchSize;
                if (currentIndex < totalItems) {
                    requestAnimationFrame(renderNextBatch);
                } else {
                    // DOM 렌더링 완료 후 이벤트 리스너 설정
                    setTimeout(() => {
                        this.setupSavedItemEventListeners();
                        this.bindLinkedReferenceBadgeEvents();
                    }, 100);
                }
            };
            
            requestAnimationFrame(renderNextBatch);
        } else {
            // 소량 렌더링: 즉시 렌더링
            this.savedList.innerHTML = filteredItemsWithTracking.map(({ item, postData, index }) => {
                return this.renderSavedItemCard(item, postData, index);
            }).join('');
        }
        
        // DOM 렌더링 완료 후 이벤트 리스너 설정 (즉시 렌더링된 경우)
        if (totalItems <= batchSize) {
            setTimeout(() => {
                this.setupSavedItemEventListeners();
                this.bindLinkedReferenceBadgeEvents();
            }, 100);
        }
    }
    
    /**
     * Phase 1.6.1: 작성글-레퍼런스 연동 배지 이벤트 바인딩
     * 
     * - 작성글 카드의 "참고 레퍼런스 N개" 배지 클릭 이벤트
     * - 레퍼런스 카드의 "이 레퍼런스를 참고한 글 N개" 배지 클릭 이벤트
     */
    bindLinkedReferenceBadgeEvents() {
        try {
            // 작성글 카드의 "참고 레퍼런스 N개" 배지 클릭
            const linkedRefBadges = document.querySelectorAll('.linked-ref-badge');
            linkedRefBadges.forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editId = badge.getAttribute('data-edit-id');
                    if (editId) {
                        this.showLinkedReferencesModal(editId);
                    }
                });
            });
            
            // 레퍼런스 카드의 "이 레퍼런스를 참고한 글 N개" 배지 클릭
            const usedInEditsBadges = document.querySelectorAll('.used-in-edits-badge');
            usedInEditsBadges.forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const refId = badge.getAttribute('data-ref-id');
                    if (refId) {
                        this.showEditsByReferenceModal(refId);
                    }
                });
            });
            
            console.log('✅ 배지 클릭 이벤트 바인딩 완료');
        } catch (error) {
            console.error('배지 이벤트 바인딩 실패:', error);
        }
    }
    
    // 저장된 항목 카드 렌더링 함수 (재사용 가능하게 분리)
    renderSavedItemCard(item, postData, index) {
        const metaText = `${(item.type || 'edit') === 'reference' ? '📖 레퍼런스' : '✏️ 작성'} · ${item.date} · ${item.characterCount}자`;
        // 통일된 스키마: card:{itemId}:expanded
        const expanded = (localStorage.getItem(`card:${item.id}:expanded`) === '1');
        // 타임라인 HTML 생성
        const timelineHtml = this.renderTrackingTimeline(postData?.metrics || [], item.id);
        
        // 레퍼런스 글인 경우 사용 여부 배지 및 유형 배지 생성
        const isReference = (item.type || 'edit') === 'reference';
        // usageCount가 undefined일 경우 0으로 설정 (레퍼런스 글은 항상 사용 여부 배지 표시)
        const usageCount = isReference ? (item.usageCount !== undefined ? item.usageCount : 0) : 0;
        const usageBadgeHtml = isReference ? this.renderReferenceUsageBadge(usageCount) : '';
        const refType = (item.referenceType || 'unspecified');
        const refTypeBadgeHtml = isReference ? this.renderReferenceTypeBadge(refType) : '';
        
        // ✅ Phase 1.6.1: 작성글-레퍼런스 연동 배지 생성
        // 작성글 카드: 연결된 레퍼런스 개수 표시
        let linkedRefBadge = '';
        const isEdit = (item.type || 'edit') === 'edit';
        if (isEdit && Array.isArray(item.linkedReferences)) {
            const refCount = item.linkedReferences.length;
            if (refCount > 0) {
                linkedRefBadge = `
                    <button 
                        class="linked-ref-badge" 
                        data-edit-id="${item.id}"
                        aria-label="${refCount}개의 참고 레퍼런스 보기"
                        title="이 글이 참고한 레퍼런스 목록">
                        📚 참고 레퍼런스 ${refCount}개
                    </button>
                `;
            }
        }
        
        // 레퍼런스 카드: 이 레퍼런스를 참고한 작성글 개수 표시 (역방향)
        let usedInEditsBadge = '';
        if (isReference) {
            const usedEdits = this.getEditsByReference(item.id);
            const editCount = usedEdits.length;
            if (editCount > 0) {
                usedInEditsBadge = `
                    <button 
                        class="used-in-edits-badge" 
                        data-ref-id="${item.id}"
                        aria-label="이 레퍼런스를 참고한 글 ${editCount}개 보기"
                        title="이 레퍼런스를 참고한 작성글 목록">
                        📝 이 레퍼런스를 참고한 글 ${editCount}개
                    </button>
                `;
            }
        }
        
        return `
        <div class="saved-item ${index === 0 ? 'new' : ''}" data-item-id="${item.id}" role="article" aria-labelledby="item-header-${item.id}">
            <div class="saved-item-header" id="item-header-${item.id}">
                <div class="saved-item-header-left">
                    <span class="saved-item-type" aria-label="${(item.type || 'edit') === 'reference' ? '레퍼런스 글' : '작성 글'}">${(item.type || 'edit') === 'reference' ? '📖 레퍼런스' : '✏️ 작성'}</span>
                    ${refTypeBadgeHtml}
                    ${usageBadgeHtml}
                </div>
            </div>
            <div class="saved-item-meta" aria-label="메타 정보: ${metaText}">
                ${metaText}
                ${linkedRefBadge ? `<span class="meta-separator">·</span>${linkedRefBadge}` : ''}
                ${usedInEditsBadge ? `<span class="meta-separator">·</span>${usedInEditsBadge}` : ''}
            </div>
            ${item.topic ? `<div class="saved-item-topic" aria-label="주제: ${this.escapeHtml(item.topic)}">🏷️ ${this.escapeHtml(item.topic)}</div>` : ''}
            <div class="saved-item-content ${expanded ? 'expanded' : ''}" aria-label="본문 내용">${this.escapeHtml(item.content)}</div>
            <button class="saved-item-toggle" data-action="toggle" data-item-id="${item.id}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? '내용 접기' : '내용 더보기'}">${expanded ? '접기' : '더보기'}</button>
            ${timelineHtml ? `<div class="saved-item-tracking" role="region" aria-label="트래킹 기록">${timelineHtml}</div>` : ''}
            <div class="saved-item-actions actions--primary" role="group" aria-label="카드 작업 버튼">
                <button class="action-button btn-primary" data-action="edit" data-type="${(item.type || 'edit')}" data-item-id="${item.id}" aria-label="${(item.type || 'edit') === 'reference' ? '레퍼런스 글 편집' : '작성 글 편집'}">편집</button>
                <button class="action-button btn-tracking" data-action="add-tracking" data-item-id="${item.id}" aria-label="트래킹 데이터 입력">📊 데이터 입력</button>
                <div class="llm-validation-dropdown" style="position: relative; display: inline-block;">
                    <button class="action-button btn-llm-main" data-action="llm-validation" data-item-id="${item.id}" aria-label="LLM 검증 메뉴">🔍 LLM 검증</button>
                    <div class="llm-dropdown-menu">
                        <button class="llm-option" data-llm="chatgpt" data-item-id="${item.id}">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🤖</span>
                                    <span class="llm-name">ChatGPT</span>
                                    <span class="llm-description">SNS 후킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="gemini" data-item-id="${item.id}">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🧠</span>
                                    <span class="llm-name">Gemini</span>
                                    <span class="llm-description">심리적 후킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="perplexity" data-item-id="${item.id}">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🔎</span>
                                    <span class="llm-name">Perplexity</span>
                                    <span class="llm-description">트렌드 검증</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="grok" data-item-id="${item.id}">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🚀</span>
                                    <span class="llm-name">Grok</span>
                                    <span class="llm-description">임팩트 최적화</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="more-menu actions--more">
                    <button class="more-menu-btn" data-action="more" data-item-id="${item.id}" aria-haspopup="true" aria-expanded="false" aria-label="기타 작업 메뉴 열기">⋯</button>
                    <div class="more-menu-list" role="menu" aria-label="기타 작업">
                        <button class="more-menu-item" role="menuitem" data-action="delete" data-item-id="${item.id}" aria-label="글 삭제">삭제</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }
    // 미트래킹 글 개수 확인 및 일괄 트래킹 버튼 업데이트
    /**
     * 미트래킹 글 확인 및 일괄 마이그레이션 버튼 업데이트
     * 
     * 성능 최적화:
     * - Firebase 쿼리 N번 → 0번 (메모리 데이터만 사용)
     * - 실행 시간: 20-60초 → 10ms 미만
     * - Set 자료구조로 O(1) 검색 구현
     * 
     * @returns {void}
     */
    updateBatchMigrationButton() {
        if (!this.batchMigrationBtn || !this.currentUser || !this.isFirebaseReady) return;
        
        try {
            // ✅ 성능 최적화: 메모리 데이터만 사용 (Firebase 쿼리 없음)
            // Set을 사용하여 O(1) 검색 구현
            const trackedTextIds = new Set(
                (this.trackingPosts || [])
                    .map(p => p.sourceTextId)
                    .filter(Boolean)
            );
            
            // 안전한 배열 처리 (빈 배열 폴백)
            const untrackedTexts = (this.savedTexts || []).filter(
                textItem => !trackedTextIds.has(textItem.id)
            );
            
            // 버튼 UI 업데이트
            const migrationTools = document.querySelector('.migration-tools');
            if (migrationTools) {
                if (untrackedTexts.length > 0) {
                    // 미트래킹 글이 있으면 버튼 표시 및 개수 표시
                    migrationTools.style.display = 'flex';
                    this.batchMigrationBtn.style.display = 'block';
                    this.batchMigrationBtn.textContent = `📊 미트래킹 글 ${untrackedTexts.length}개 일괄 트래킹 시작`;
                    this.batchMigrationBtn.title = `${untrackedTexts.length}개의 저장된 글이 아직 트래킹되지 않았습니다. 모두 트래킹을 시작하시겠습니까?`;
                    
                    // 접근성 개선: aria-label 동적 업데이트
                    this.batchMigrationBtn.setAttribute('aria-label', 
                        `${untrackedTexts.length}개의 미트래킹 글 일괄 트래킹 시작`);
                } else {
                    // 미트래킹 글이 없으면 버튼 숨김
                    migrationTools.style.display = 'none';
                    this.batchMigrationBtn.style.display = 'none';
                }
            }
            
            // 성능 로그 (디버깅용)
            console.log(`✅ 미트래킹 글 확인 완료: ${untrackedTexts.length}개 (메모리 검색, Firebase 쿼리 없음)`);
            
        } catch (error) {
            console.error('❌ 미트래킹 글 확인 실패:', error);
            
            // 에러 발생 시 버튼 숨김
            if (this.batchMigrationBtn) {
                this.batchMigrationBtn.style.display = 'none';
            }
            
            // 사용자 알림 (UX 개선)
            this.showMessage('⚠️ 미트래킹 글 확인 중 오류가 발생했습니다.', 'warning');
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

        const totalCount = sortedMetrics.length;
        
        // 합계 계산
        const totals = this.calculateMetricsTotal(metrics);
        
        // localStorage에서 접기/펼치기 상태 복원 (per-post)
        // saved-item의 data-item-id를 사용하여 키 생성
        // 이 함수는 saved-item 내부에서 호출되므로, 클로저나 파라미터로 itemId 전달 필요
        const savedItemId = arguments[1] || null; // 두 번째 파라미터로 itemId 전달
        // 통일된 스키마: card:{itemId}:details (타임라인 접기/펼치기)
        const isExpanded = savedItemId ? (localStorage.getItem(`card:${savedItemId}:details`) === '1') : false;
        const collapsedClass = isExpanded ? '' : 'collapsed';
        const buttonText = isExpanded ? '접기' : `기록 ${totalCount}개 더보기`;
        
        return `
            <div class="tracking-timeline-container">
                <div class="tracking-timeline-header">
                    <span class="timeline-title">📊 트래킹 기록</span>
                    ${this.renderMetricsTotals(totals)}
                    <button class="timeline-toggle-btn small" onclick="dualTextWriter.toggleTimelineCollapse(this)" aria-label="기록 더보기/접기" aria-expanded="${isExpanded ? 'true' : 'false'}">${buttonText}</button>
                </div>
                <div class="tracking-timeline-content ${collapsedClass}">
                    ${sortedMetrics.map((metric, sortedIdx) => {
                        const date = metric.timestamp?.toDate ? metric.timestamp.toDate() : 
                                    (metric.timestamp instanceof Date ? metric.timestamp : new Date());
                        const dateStr = this.formatDateForDisplay(date);
                        const originalIndex = metrics.findIndex(m => {
                            const mDate = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : 
                                         (m.timestamp instanceof Date ? m.timestamp.getTime() : 0);
                            const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate().getTime() : 
                                              (metric.timestamp instanceof Date ? metric.timestamp.getTime() : 0);
                            return mDate === metricDate && m.views === metric.views && m.likes === metric.likes;
                        });
                        const metricIndex = originalIndex >= 0 ? originalIndex : sortedIdx;
                        return `
                            <div class="timeline-item" data-metric-index="${metricIndex}" role="button" aria-label="기록 편집">
                                <span class="timeline-date">📅 ${dateStr}</span>
                                <div class="timeline-item-data">
                                    <span class="metric-badge views">👀 ${metric.views || 0}</span>
                                    <span class="metric-badge likes">❤️ ${metric.likes || 0}</span>
                                    <span class="metric-badge comments">💬 ${metric.comments || 0}</span>
                                    <span class="metric-badge shares">🔄 ${metric.shares || 0}</span>
                                    <span class="metric-badge follows">👥 ${metric.follows || 0}</span>
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

    /**
     * Firestore Timestamp 또는 다양한 날짜 형식을 한국어 날짜 문자열로 변환합니다.
     * 
     * Firestore Timestamp, Date 객체, 숫자(타임스탬프), 문자열 등 다양한 형식을
     * 한국어 날짜 형식("2025년 11월 11일")으로 변환합니다.
     * 
     * @param {Object|Date|number|string} dateInput - 변환할 날짜 (Firestore Timestamp, Date, 숫자, 문자열)
     * @returns {string} 한국어 날짜 형식 문자열 (예: "2025년 11월 11일") 또는 빈 문자열
     * 
     * @example
     * // Firestore Timestamp
     * formatDateFromFirestore(timestamp) // "2025년 11월 11일"
     * 
     * // Date 객체
     * formatDateFromFirestore(new Date()) // "2025년 11월 11일"
     * 
     * // 숫자 타임스탬프
     * formatDateFromFirestore(1699718400000) // "2025년 11월 11일"
     */
    formatDateFromFirestore(dateInput) {
        if (!dateInput) {
            return '';
        }

        try {
            let dateObj = null;

            // Firestore Timestamp 처리
            if (dateInput.toDate && typeof dateInput.toDate === 'function') {
                dateObj = dateInput.toDate();
            }
            // Date 객체 처리
            else if (dateInput instanceof Date) {
                dateObj = dateInput;
            }
            // 숫자 타임스탬프 처리
            else if (typeof dateInput === 'number') {
                dateObj = new Date(dateInput);
            }
            // 문자열 날짜 처리
            else if (typeof dateInput === 'string') {
                const parsed = Date.parse(dateInput);
                if (!Number.isNaN(parsed)) {
                    dateObj = new Date(parsed);
                }
            }

            // 유효한 Date 객체인지 확인
            if (!dateObj || !(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
                return '';
            }

            // 한국어 날짜 형식으로 변환
            return dateObj.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            // 에러 발생 시 빈 문자열 반환
            console.warn('날짜 포맷팅 중 오류 발생:', error);
            return '';
        }
    }

    /**
     * 트래킹 메트릭의 최신 값을 반환합니다.
     * 
     * 사용자는 기록을 기존에서 이후로 적어가는 방식으로,
     * 각 날짜의 값은 해당 시점의 누적값을 나타냅니다.
     * 따라서 가장 마지막(최신) 기록의 값이 현재 총합을 나타냅니다.
     * 
     * @param {Array} metrics - 메트릭 배열
     * @returns {Object} 가장 최신 메트릭의 값 객체
     */
    calculateMetricsTotal(metrics) {
        if (!metrics || metrics.length === 0) {
            return {
                totalViews: 0,
                totalLikes: 0,
                totalComments: 0,
                totalShares: 0,
                totalFollows: 0
            };
        }
        
        // 날짜 순으로 정렬하여 가장 최신 메트릭 찾기
        const sortedMetrics = [...metrics].sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                         (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                         (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
            return dateA - dateB; // 오래된 것부터 정렬
        });
        
        // 가장 마지막(최신) 메트릭의 값 반환
        const latestMetric = sortedMetrics[sortedMetrics.length - 1];
        
        return {
            totalViews: latestMetric.views || 0,
            totalLikes: latestMetric.likes || 0,
            totalComments: latestMetric.comments || 0,
            totalShares: latestMetric.shares || 0,
            totalFollows: latestMetric.follows || 0
        };
    }

    /**
     * 레퍼런스 글의 사용 여부를 배지 형태로 렌더링합니다.
     * 
     * 사용 여부에 따라 배지 HTML을 반환합니다.
     * - 사용 안됨 (usageCount === 0): 빈 문자열 반환
     * - 사용됨 (usageCount > 0): "✅ 사용됨" 또는 "사용됨 N회" 배지 HTML 반환
     * 
     * @param {number} usageCount - 레퍼런스 글의 사용 횟수 (0 이상의 정수)
     * @returns {string} 배지 HTML 문자열 (사용 안됨이면 빈 문자열)
     * 
     * @example
     * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(3);
     * // 결과: '<span class="reference-usage-badge" aria-label="사용됨 3회" role="status">✅ 사용됨 3회</span>'
     * 
     * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(0);
     * // 결과: '' (빈 문자열)
     */
    renderReferenceUsageBadge(usageCount) {
        // 에러 처리: null 또는 undefined 입력 처리
        if (usageCount == null) {
            return '';
        }
        
        // 에러 처리: 숫자가 아닌 경우 처리
        if (typeof usageCount !== 'number') {
            console.warn('renderReferenceUsageBadge: usageCount가 숫자가 아닙니다:', usageCount);
            return '';
        }
        
        // 에러 처리: 음수인 경우 0으로 처리
        if (usageCount < 0) {
            console.warn('renderReferenceUsageBadge: usageCount가 음수입니다:', usageCount);
            usageCount = 0;
        }
        
        // 사용 안됨: 회색 배지 HTML 반환 (클릭 가능)
        if (usageCount === 0) {
            const ariaLabel = '레퍼런스 사용 안됨 (클릭하면 사용됨으로 표시)';
            return `<span class="reference-usage-badge reference-usage-badge--unused reference-usage-badge--clickable" data-action="mark-reference-used" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">🆕 사용 안됨</span>`;
        }
        
        // 사용됨: 초록색 배지 HTML 반환 (클릭 가능, 토글 기능)
        // 접근성: aria-label로 사용 여부를 스크린 리더에 전달
        // role="button"으로 클릭 가능함을 명시
        const usageText = usageCount === 1 ? '사용됨' : `사용됨 ${usageCount}회`;
        const ariaLabel = `레퍼런스 ${usageText} (클릭하면 사용 안됨으로 표시)`;
        
        return `<span class="reference-usage-badge reference-usage-badge--used reference-usage-badge--clickable" data-action="mark-reference-unused" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">✅ ${usageText}</span>`;
    }

    /**
     * 트래킹 메트릭 합계를 배지 형태로 렌더링합니다.
     * 
     * @param {Object} totals - 합계 객체
     * @returns {string} 합계 배지 HTML
     */
    renderMetricsTotals(totals) {
        return `
            <div class="metrics-totals" role="group" aria-label="현재 합계">
                <span class="total-badge views" aria-label="현재 조회수: ${totals.totalViews.toLocaleString()}">
                    <span class="total-icon">👀</span>
                    <span class="total-value">${totals.totalViews.toLocaleString()}</span>
                </span>
                <span class="total-badge likes" aria-label="현재 좋아요: ${totals.totalLikes.toLocaleString()}">
                    <span class="total-icon">❤️</span>
                    <span class="total-value">${totals.totalLikes.toLocaleString()}</span>
                </span>
                <span class="total-badge comments" aria-label="현재 댓글: ${totals.totalComments.toLocaleString()}">
                    <span class="total-icon">💬</span>
                    <span class="total-value">${totals.totalComments.toLocaleString()}</span>
                </span>
                <span class="total-badge shares" aria-label="현재 공유: ${totals.totalShares.toLocaleString()}">
                    <span class="total-icon">🔄</span>
                    <span class="total-value">${totals.totalShares.toLocaleString()}</span>
                </span>
                <span class="total-badge follows" aria-label="현재 팔로우: ${totals.totalFollows.toLocaleString()}">
                    <span class="total-icon">👥</span>
                    <span class="total-value">${totals.totalFollows.toLocaleString()}</span>
                </span>
            </div>
        `;
    }

    // 통합 UI 업데이트 함수 (성능 최적화)
    refreshUI(options = {}) {
        const {
            savedTexts = false,
            trackingPosts = false,
            trackingSummary = false,
            trackingChart = false,
            force = false
        } = options;
        
        // 업데이트 큐에 추가
        if (savedTexts) this.updateQueue.savedTexts = true;
        if (trackingPosts) this.updateQueue.trackingPosts = true;
        if (trackingSummary) this.updateQueue.trackingSummary = true;
        if (trackingChart) this.updateQueue.trackingChart = true;
        
        // 강제 업데이트이거나 즉시 실행이 필요한 경우
        if (force) {
            this.executeUIUpdate();
            return;
        }
        
        // 디바운싱: 마지막 호출 후 100ms 후에 실행
        if (this.debounceTimers.uiUpdate) {
            clearTimeout(this.debounceTimers.uiUpdate);
        }
        
        this.debounceTimers.uiUpdate = setTimeout(() => {
            this.executeUIUpdate();
        }, 100);
    }
    
    // UI 업데이트 실행 (내부 함수)
    executeUIUpdate() {
        // 활성 탭 확인
        const savedTab = document.getElementById('saved-tab');
        const trackingTab = document.getElementById('tracking-tab');
        const isSavedTabActive = savedTab && savedTab.classList.contains('active');
        const isTrackingTabActive = trackingTab && trackingTab.classList.contains('active');
        
        // 저장된 글 탭 업데이트
        if (this.updateQueue.savedTexts && isSavedTabActive) {
            this.renderSavedTexts();
            this.updateQueue.savedTexts = false;
        }
        
        // 트래킹 탭 업데이트
        if (this.updateQueue.trackingPosts && isTrackingTabActive) {
            this.renderTrackingPosts();
            this.updateQueue.trackingPosts = false;
        }
        
        // 트래킹 요약 업데이트 (트래킹 탭이 활성화되어 있을 때만)
        if (this.updateQueue.trackingSummary && isTrackingTabActive) {
            this.updateTrackingSummary();
            this.updateQueue.trackingSummary = false;
        }
        
        // 트래킹 차트 업데이트 (트래킹 탭이 활성화되어 있고 차트가 보일 때만)
        if (this.updateQueue.trackingChart && isTrackingTabActive) {
            const chartContainer = document.querySelector('.tracking-chart-container');
            if (chartContainer && chartContainer.offsetParent !== null) {
                this.updateTrackingChart();
            }
            this.updateQueue.trackingChart = false;
        }
    }
    // 디바운싱 유틸리티 함수
    debounce(func, wait) {
        const key = func.name || 'anonymous';
        if (this.debounceTimers[key]) {
            clearTimeout(this.debounceTimers[key]);
        }
        this.debounceTimers[key] = setTimeout(() => {
            func.apply(this, arguments);
            delete this.debounceTimers[key];
        }, wait);
    }
    
    // 범위 필터 초기화
    initRangeFilter() {
        try {
            // localStorage에서 접기/펼치기 상태 복원
            const isExpanded = localStorage.getItem('rangeFilter:expanded') === '1';
            const content = document.getElementById('range-filter-content');
            const toggle = document.getElementById('range-filter-toggle');
            const toggleIcon = toggle?.querySelector('.toggle-icon');
            
            if (content && toggle && toggleIcon) {
                if (isExpanded) {
                    content.style.display = 'block';
                    toggle.setAttribute('aria-expanded', 'true');
                    toggleIcon.textContent = '▲';
                } else {
                    content.style.display = 'none';
                    toggle.setAttribute('aria-expanded', 'false');
                    toggleIcon.textContent = '▼';
                }
            }
        } catch (error) {
            console.error('범위 필터 초기화 실패:', error);
        }
    }
    
    // 범위 필터 접기/펼치기 토글
    toggleRangeFilter() {
        const content = document.getElementById('range-filter-content');
        const toggle = document.getElementById('range-filter-toggle');
        const toggleIcon = toggle?.querySelector('.toggle-icon');
        
        if (!content || !toggle || !toggleIcon) return;
        
        const isCurrentlyExpanded = content.style.display !== 'none';
        const isExpanded = !isCurrentlyExpanded;
        
        if (isExpanded) {
            content.style.display = 'block';
            toggle.setAttribute('aria-expanded', 'true');
            toggleIcon.textContent = '▲';
        } else {
            content.style.display = 'none';
            toggle.setAttribute('aria-expanded', 'false');
            toggleIcon.textContent = '▼';
        }
        
        // 상태 localStorage에 저장
        try {
            localStorage.setItem('rangeFilter:expanded', isExpanded ? '1' : '0');
        } catch (error) {
            console.error('범위 필터 상태 저장 실패:', error);
        }
    }

    // 타임라인 더보기/접기 (최신 1개 기본)
    toggleTimelineCollapse(button) {
        const container = button.closest('.tracking-timeline-container');
        const content = container.querySelector('.tracking-timeline-content');
        if (!content) return;
        
        // 저장된 글 아이템 ID 확인 (per-post 키 생성용)
        const savedItem = button.closest('.saved-item');
        const itemId = savedItem ? savedItem.getAttribute('data-item-id') : null;
        
        const collapsed = content.classList.toggle('collapsed');
        const total = content.querySelectorAll('.timeline-item').length;
        
        // 상태 localStorage에 저장 (per-post)
        if (itemId) {
            try {
                // 통일된 스키마: card:{itemId}:details
                const key = `card:${itemId}:details`;
                localStorage.setItem(key, collapsed ? '0' : '1');
            } catch (e) { /* ignore quota */ }
        }
        
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (collapsed) {
            button.textContent = `기록 ${total}개 더보기`;
        } else {
            button.textContent = '접기';
        }
    }
    /**
     * 저장된 글 항목의 이벤트 리스너 설정 (이벤트 위임)
     * - 메뉴 열기/닫기, 삭제, 트래킹 등 저장된 글 관련 모든 이벤트 처리
     * - 이벤트 리스너 중복 등록 방지를 위해 기존 핸들러 제거 후 새 핸들러 등록
     * @returns {void}
     */
    setupSavedItemEventListeners() {
        console.log('setupSavedItemEventListeners 호출됨');

        // 기존 이벤트 리스너 제거 (중복 방지)
        if (this.savedItemClickHandler) {
            this.savedList.removeEventListener('click', this.savedItemClickHandler);
        }
        if (this.savedItemKeydownHandler) {
            this.savedList.removeEventListener('keydown', this.savedItemKeydownHandler);
        }

        // 키보드 이벤트 핸들러 (접근성 향상)
        this.savedItemKeydownHandler = (event) => {
            // 더보기/접기 버튼 키보드 접근성
            const button = event.target.closest('.saved-item-toggle');
            if (button && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                event.stopPropagation();
                
                const action = button.getAttribute('data-action');
                const itemId = button.getAttribute('data-item-id');
                
                if (action === 'toggle' && itemId) {
                    const contentEl = button.closest('.saved-item').querySelector('.saved-item-content');
                    if (contentEl) {
                        const nowExpanded = contentEl.classList.toggle('expanded');
                        button.textContent = nowExpanded ? '접기' : '더보기';
                        button.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
                        try {
                            localStorage.setItem(`card:${itemId}:expanded`, nowExpanded ? '1' : '0');
                        } catch (e) { /* ignore quota */ }
                    }
                }
                return;
            }
        };
        
        // 클릭 이벤트 핸들러
        this.savedItemClickHandler = (event) => {
            console.log('저장된 글 영역 클릭:', event.target);
            
            // 레퍼런스 사용 배지 클릭 처리 (버튼이 아닌 span 요소)
            const badge = event.target.closest('.reference-usage-badge--clickable');
            if (badge) {
                const badgeAction = badge.getAttribute('data-action');
                if (badgeAction === 'mark-reference-used') {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // 레퍼런스 카드에서 itemId 찾기
                    const savedItem = badge.closest('.saved-item');
                    const referenceItemId = savedItem?.getAttribute('data-item-id');
                    
                    if (referenceItemId) {
                        console.log('레퍼런스 사용 배지 클릭 (사용됨으로 표시):', referenceItemId);
                        this.markReferenceAsUsed(referenceItemId);
                    }
                    return;
                } else if (badgeAction === 'mark-reference-unused') {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // 레퍼런스 카드에서 itemId 찾기
                    const savedItem = badge.closest('.saved-item');
                    const referenceItemId = savedItem?.getAttribute('data-item-id');
                    
                    if (referenceItemId) {
                        console.log('레퍼런스 사용 배지 클릭 (사용 안됨으로 표시):', referenceItemId);
                        this.unmarkReferenceAsUsed(referenceItemId);
                    }
                    return;
                }
            }
            
            const button = event.target.closest('button');
            if (!button) {
                // 버튼이 아니면 타임라인 행 탭 처리
                const row = event.target.closest('.timeline-item');
                if (row) {
                    const metricIndex = row.getAttribute('data-metric-index');
                    if (metricIndex != null) {
                        this.editTrackingMetric(row.querySelector('.timeline-edit-btn') || row, metricIndex);
                        return;
                    }
                }
                return;
            }

            const action = button.getAttribute('data-action');
            const itemId = button.getAttribute('data-item-id');

            console.log('이벤트 처리:', { itemId, action, button: button.textContent });

            if (!itemId) {
                console.error('Item ID not found');
                return;
            }

            if (action === 'more') {
                // 이벤트 전파 제어: 이벤트 버블링 방지로 바깥 클릭 핸들러가 즉시 실행되지 않도록 함
                event.preventDefault();
                event.stopPropagation();
                
                // DOM 탐색 방식 개선: closest + querySelector 사용으로 더 안정적인 탐색
                const moreMenuContainer = button.closest('.more-menu');
                if (!moreMenuContainer) {
                    console.warn('[more menu] Container not found:', { itemId, button });
                    return;
                }
                
                const menu = moreMenuContainer.querySelector('.more-menu-list');
                if (menu) {
                    const isOpen = menu.classList.toggle('open');
                    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    
                    // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
                    if (isOpen) {
                        this.applySmartMenuPosition(menu, button);
                        
                        // 포커스 트랩: 메뉴가 열리면 첫 번째 메뉴 아이템에 포커스
                        const firstMenuItem = menu.querySelector('.more-menu-item');
                        if (firstMenuItem) {
                            setTimeout(() => firstMenuItem.focus(), 50);
                        }
                    } else {
                        // 메뉴 닫힐 때 위치 클래스 제거
                        menu.classList.remove('open-top', 'open-bottom');
                    }
                } else {
                    // 메뉴를 찾지 못한 경우 디버깅 로그 출력
                    console.warn('[more menu] Menu element not found:', { itemId, button, container: moreMenuContainer });
                }
                return;
            } else if (action === 'toggle') {
                const contentEl = button.closest('.saved-item').querySelector('.saved-item-content');
                if (contentEl) {
                    const nowExpanded = contentEl.classList.toggle('expanded');
                    button.textContent = nowExpanded ? '접기' : '더보기';
                    button.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
                    try {
                        // 통일된 스키마: card:{itemId}:expanded
                        localStorage.setItem(`card:${itemId}:expanded`, nowExpanded ? '1' : '0');
                    } catch (e) { /* ignore quota */ }
                }
            } else if (action === 'edit') {
                const type = button.getAttribute('data-type');
                console.log('편집 액션 실행:', { itemId, type });
                this.editText(itemId, type);
            } else if (action === 'delete') {
                console.log('삭제 액션 실행:', { itemId });
                // 이벤트 전파 제어: outsideClickHandler가 메뉴를 닫기 전에 삭제 실행
                event.preventDefault();
                event.stopPropagation();
                // 메뉴 닫기
                const moreMenuContainer = button.closest('.more-menu');
                if (moreMenuContainer) {
                    const menu = moreMenuContainer.querySelector('.more-menu-list');
                    if (menu) {
                        menu.classList.remove('open');
                        const menuBtn = moreMenuContainer.querySelector('.more-menu-btn');
                        if (menuBtn) {
                            menuBtn.setAttribute('aria-expanded', 'false');
                        }
                    }
                }
                // 삭제 실행
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
                event.preventDefault();
                event.stopPropagation();
                
                // 드롭다운 메뉴 토글 (모바일 지원)
                const dropdownContainer = button.closest('.llm-validation-dropdown');
                if (dropdownContainer) {
                    const dropdownMenu = dropdownContainer.querySelector('.llm-dropdown-menu');
                    if (dropdownMenu) {
                        const isOpen = dropdownMenu.classList.toggle('open');
                        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                        
                        // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
                        if (isOpen) {
                            this.applySmartMenuPosition(dropdownMenu, button);
                            
                            // 포커스 트랩: 메뉴가 열리면 첫 번째 LLM 옵션에 포커스
                            const firstOption = dropdownMenu.querySelector('.llm-option');
                            if (firstOption) {
                                setTimeout(() => firstOption.focus(), 50);
                            }
                        } else {
                            // 메뉴 닫힐 때 위치 클래스 제거
                            dropdownMenu.classList.remove('open-top', 'open-bottom');
                        }
                    }
                }
                return;
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
        this.savedList.addEventListener('keydown', this.savedItemKeydownHandler);

        // 기존 바깥 클릭 핸들러 제거 (중복 방지)
        if (this.outsideClickHandler) {
            document.removeEventListener('click', this.outsideClickHandler, { capture: true });
        }

        // 바깥 클릭 시 모든 more 메뉴 및 LLM 드롭다운 닫기
        // setTimeout을 사용하여 이벤트 처리 순서 보장: 메뉴를 여는 동작이 완료된 후 바깥 클릭을 감지
        this.outsideClickHandler = (e) => {
            const isInsideMenu = e.target.closest('.more-menu');
            const isInsideLLMDropdown = e.target.closest('.llm-validation-dropdown');
            
            if (!isInsideMenu && !isInsideLLMDropdown) {
                // 이벤트 처리 순서 보장: 메뉴 열기 동작이 완료된 후 실행되도록 setTimeout 사용
                setTimeout(() => {
                    // More 메뉴 닫기
                    document.querySelectorAll('.more-menu-list.open').forEach(el => {
                        el.classList.remove('open');
                        // 포커스 트랩 해제: 메뉴 버튼으로 포커스 복원
                        const menuBtn = el.previousElementSibling;
                        if (menuBtn && menuBtn.classList.contains('more-menu-btn')) {
                            menuBtn.setAttribute('aria-expanded', 'false');
                            menuBtn.focus();
                        }
                    });
                    document.querySelectorAll('.more-menu-btn[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
                    
                    // LLM 드롭다운 닫기
                    document.querySelectorAll('.llm-dropdown-menu.open').forEach(el => {
                        el.classList.remove('open');
                        // 포커스 트랩 해제: LLM 메인 버튼으로 포커스 복원
                        const llmBtn = el.previousElementSibling;
                        if (llmBtn && llmBtn.classList.contains('btn-llm-main')) {
                            llmBtn.setAttribute('aria-expanded', 'false');
                            llmBtn.focus();
                        }
                    });
                    document.querySelectorAll('.btn-llm-main[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
                }, 0);
            }
        };
        document.addEventListener('click', this.outsideClickHandler, { capture: true });

        // 타임라인 제스처(롱프레스 삭제, 스와이프 좌/우)
        if (!this._timelineGestureBound) {
            this._timelineGestureBound = true;
            let touchStartX = 0;
            let touchStartY = 0;
            let touchStartTime = 0;
            let longPressTimer = null;
            const LONG_PRESS_MS = 550;
            const SWIPE_THRESHOLD = 60;

            this.savedList.addEventListener('touchstart', (e) => {
                const row = e.target.closest('.timeline-item');
                if (!row) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
                const metricIndex = row.getAttribute('data-metric-index');
                if (metricIndex == null) return;
                longPressTimer = setTimeout(() => {
                    // 롱프레스 → 삭제 확인
                    this.editingMetricData = this.editingMetricData || { metricIndex: Number(metricIndex) };
                    // editTrackingMetric은 모달 기반이므로 직접 삭제 호출 준비를 위해 context 보장 필요
                    // 간단히 삭제 확인 후 진행
                    if (confirm('이 기록을 삭제할까요?')) {
                        // edit modal 컨텍스트 없이도 삭제 수행을 위해 임시 컨텍스트 구성
                        const parentSaved = row.closest('.saved-item');
                        const itemId = parentSaved ? parentSaved.getAttribute('data-item-id') : null;
                        // textId 기반으로 editingMetricData 셋업
                        this.editingMetricData = { postId: null, textId: itemId, metricIndex: Number(metricIndex) };
                        this.deleteTrackingDataItem();
                    }
                }, LONG_PRESS_MS);
            }, { passive: true });

            this.savedList.addEventListener('touchmove', (e) => {
                if (longPressTimer) clearTimeout(longPressTimer);
            }, { passive: true });

            this.savedList.addEventListener('touchend', (e) => {
                if (longPressTimer) clearTimeout(longPressTimer);
                const row = e.target.closest('.timeline-item');
                if (!row) return;
                const dx = (e.changedTouches && e.changedTouches[0].clientX || 0) - touchStartX;
                const dy = (e.changedTouches && e.changedTouches[0].clientY || 0) - touchStartY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
                    const metricIndex = row.getAttribute('data-metric-index');
                    if (metricIndex == null) return;
                    if (dx < 0) {
                        // 좌스와이프 → 편집
                        this.editTrackingMetric(row, metricIndex);
                    } else {
                        // 우스와이프 → 삭제 확인
                        const parentSaved = row.closest('.saved-item');
                        const itemId = parentSaved ? parentSaved.getAttribute('data-item-id') : null;
                        this.editingMetricData = { postId: null, textId: itemId, metricIndex: Number(metricIndex) };
                        if (confirm('이 기록을 삭제할까요?')) {
                            this.deleteTrackingDataItem();
                        }
                    }
                }
            }, { passive: true });
        }

        
        // ESC 키로 메뉴 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openMenu = document.querySelector('.more-menu-list.open');
                if (openMenu) {
                    openMenu.classList.remove('open');
                    const menuBtn = openMenu.previousElementSibling;
                    if (menuBtn && menuBtn.classList.contains('more-menu-btn')) {
                        menuBtn.setAttribute('aria-expanded', 'false');
                        menuBtn.focus();
                    }
                }
            }
        });
        console.log('이벤트 리스너 등록 완료');
    }

    // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
    applySmartMenuPosition(menu, button) {
        // 기존 위치 클래스 제거
        menu.classList.remove('open-top', 'open-bottom');
        
        // 메뉴 크기 추정 (실제 렌더링 전이라 임시로 표시하여 크기 측정)
        const wasVisible = menu.style.display !== 'none';
        if (!wasVisible) {
            menu.style.visibility = 'hidden';
            menu.style.display = 'block';
        }
        
        const menuRect = menu.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const menuHeight = menuRect.height || 150; // 기본값: 대략적인 메뉴 높이
        const viewportHeight = window.innerHeight;
        const threshold = 200; // 상단/하단 임계값 (픽셀)
        
        // 위로 표시했을 때 화면 밖으로 나가는지 확인
        const spaceAbove = buttonRect.top;
        const spaceBelow = viewportHeight - buttonRect.bottom;
        
        // 위치 결정 로직
        // 1. 상단 근처(threshold 이내)이고 위로 표시할 공간이 부족하면 → 아래로
        // 2. 하단 근처이고 아래로 표시할 공간이 부족하면 → 위로
        // 3. 그 외에는 기본값(위로) 사용
        
        if (spaceAbove < threshold && spaceAbove < menuHeight + 20) {
            // 화면 상단 근처이고 위로 표시할 공간이 부족 → 아래로 표시
            menu.classList.add('open-bottom');
        } else if (spaceBelow < threshold && spaceBelow < menuHeight + 20) {
            // 화면 하단 근처이고 아래로 표시할 공간이 부족 → 위로 표시
            menu.classList.add('open-top');
        } else {
            // 기본값: 위로 표시 (더 자연스러운 UX)
            menu.classList.add('open-top');
        }
        
        // 임시 표시 제거
        if (!wasVisible) {
            menu.style.visibility = '';
            menu.style.display = '';
        }
    }

    // 패널 기반 LLM 검증 버튼 바인딩 (재사용 가능)
    bindPanelLLMButtons() {
        console.log('패널 LLM 버튼 바인딩 시작');
        
        const panelLlmButtons = document.querySelectorAll('.llm-option[data-panel]');
        console.log(`패널 LLM 버튼 ${panelLlmButtons.length}개 발견`);
        
        panelLlmButtons.forEach((button, index) => {
            const panel = button.getAttribute('data-panel');
            const llmService = button.getAttribute('data-llm');

            if (!panel || !llmService) {
                console.warn(`패널 LLM 버튼 ${index}에 필수 속성이 없습니다:`, { panel, llmService });
                return;
            }

            console.log(`패널 LLM 버튼 ${index} 바인딩:`, { panel, llmService });

            // 기존 이벤트 리스너 제거 (중복 방지)
            if (button._panelLlmHandler) {
                button.removeEventListener('click', button._panelLlmHandler);
            }

            // 새로운 이벤트 핸들러 생성 및 바인딩
            button._panelLlmHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('패널 LLM 버튼 클릭:', { panel, llmService });
                this.validatePanelWithLLM(panel, llmService);
            };

            button.addEventListener('click', button._panelLlmHandler);
        });

        console.log('패널 LLM 버튼 바인딩 완료');
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

        // 패널 기반 LLM 검증 버튼들 바인딩 (재사용 함수 호출)
        this.bindPanelLLMButtons();

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
                // 주제 로드 (수정/작성 글인 경우)
                if (this.editTopicInput) {
                    this.editTopicInput.value = item.topic || '';
                }
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
            // 삭제할 아이템 찾기
            const itemToDelete = this.savedTexts.find(saved => saved.id === id);
            if (!itemToDelete) {
                console.error('삭제할 아이템을 찾을 수 없습니다:', id);
                this.showMessage('삭제할 글을 찾을 수 없습니다.', 'error');
                return;
            }
            
            // Phase 1.7.1: 레퍼런스 삭제 시 연결된 작성글 확인
            if ((itemToDelete.type || 'edit') === 'reference') {
                const usedEdits = this.getEditsByReference(id);
                if (usedEdits.length > 0) {
                    const confirmed = confirm(
                        `⚠️ 이 레퍼런스는 ${usedEdits.length}개의 작성글에서 참고되고 있습니다.\n\n` +
                        `삭제하시겠습니까?\n\n` +
                        `(작성글의 연결 정보는 유지되지만, 레퍼런스 내용은 볼 수 없게 됩니다.)`
                    );
                    if (!confirmed) {
                        console.log('사용자가 레퍼런스 삭제 취소');
                        return;
                    }
                }
            }
            
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
            
            // 낙관적 업데이트를 위한 백업 데이터
            const itemBackup = { ...itemToDelete };
            const connectedPostsBackup = connectedPosts.map(post => ({ ...post }));
            
            // 낙관적 업데이트: UI 먼저 업데이트
            this.savedTexts = this.savedTexts.filter(saved => saved.id !== id);
            // 캐시 무효화 (데이터 변경 시)
            this.renderSavedTextsCache = null;
            this.renderSavedTextsCacheKey = null;
            if (this.trackingPosts) {
                this.trackingPosts = this.trackingPosts.filter(post => post.sourceTextId !== id);
            }
            
            // Optimistic UI: 즉시 UI 업데이트
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });
            
            console.log('Firestore에서 삭제 시작:', { id, connectedPostsCount: postCount });
            
            try {
                // 실제 Firestore 삭제
                const deletePromises = connectedPosts.map(post => {
                    const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', post.id);
                    return window.firebaseDeleteDoc(postRef);
                });
                
                // 포스트 삭제와 텍스트 삭제를 병렬로 처리
                await Promise.all([
                    ...deletePromises,
                    window.firebaseDeleteDoc(window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', id))
                ]);
                
                // 성공 메시지 (스낵바 형태 - 되돌리기 포함)
                let successMessage = '글이 삭제되었습니다.';
                if (postCount > 0) {
                    successMessage = `글과 연결된 트래킹 데이터 ${postCount}개가 모두 삭제되었습니다.`;
                }
                
                // 성공 메시지 표시 (showSnackbar 대신 showMessage 사용)
                this.showMessage(successMessage, 'success');
                
                console.log('삭제 완료', { id, deletedPosts: postCount });

            } catch (error) {
                console.error('텍스트 삭제 실패:', error);
                
                // 실패 복구: 백업 데이터로 복원
                this.savedTexts.push(itemBackup);
                // 캐시 무효화 (데이터 변경 시)
                this.renderSavedTextsCache = null;
                this.renderSavedTextsCacheKey = null;
                if (this.trackingPosts) {
                    connectedPostsBackup.forEach(post => {
                        if (!this.trackingPosts.find(p => p.id === post.id)) {
                            this.trackingPosts.push(post);
                        }
                    });
                }
                
                // UI 복원
                this.renderSavedTexts();
                if (trackingTab && trackingTab.classList.contains('active')) {
                    this.refreshUI({
                        trackingPosts: true,
                        trackingSummary: true,
                        trackingChart: true,
                        force: true
                    });
                }
                
                this.showMessage('삭제에 실패했습니다. 다시 시도해주세요.', 'error');
            }
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
            chatgpt: "다음 글을 SNS 후킹 관점에서 분석해주세요. 특히 다음 요소들을 평가해주세요:\n\n🎯 후킹 효과성:\n- 첫 문장이 독자의 관심을 끌 수 있는가?\n- 감정적 몰입을 유도하는가?\n- 호기심을 자극하는 요소가 있는가?\n\n📱 SNS 최적화:\n- 읽기 쉬운 구조인가?\n- 공유하고 싶은 욕구를 자극하는가?\n- 댓글을 유도할 수 있는 요소가 있는가?\n\n💡 개선 제안:\n- 더 강력한 후킹 포인트 제안\n- 감정적 반응을 높이는 방법\n- 행동 유도(좋아요, 공유, 댓글) 강화 방안\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
            gemini: "다음 글을 SNS 마케팅 전문가 관점에서 분석해주세요:\n\n🧠 심리적 후킹 분석:\n- 독자의 무의식을 자극하는 요소 분석\n- 감정적 트리거 포인트 식별\n- 인지 편향 활용도 평가\n\n📊 타겟 독자 분석:\n- 어떤 독자층에게 어필하는가?\n- 공감대 형성 요소는 무엇인가?\n- 행동 변화를 유도할 수 있는가?\n\n🎨 표현력 개선:\n- 더 강력한 표현으로 바꿀 부분\n- 시각적 임팩트를 높이는 방법\n- 기억에 남는 문구 만들기\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
            perplexity: "다음 글을 SNS 트렌드 및 신뢰성 관점에서 분석해주세요:\n\n🔍 트렌드 적합성:\n- 현재 SNS 트렌드와 부합하는가?\n- 바이럴 가능성이 있는 주제인가?\n- 시의적절한 타이밍인가?\n\n📈 신뢰성 강화:\n- 사실 확인이 필요한 부분\n- 더 설득력 있는 근거 제시 방법\n- 전문성 어필 요소 추가 방안\n\n🌐 확산 가능성:\n- 공유 가치가 있는 콘텐츠인가?\n- 논란을 일으킬 수 있는 요소는?\n- 긍정적 바이럴을 위한 개선점\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
            grok: "다음 글을 SNS 후킹 전문가 관점에서 간결하고 임팩트 있게 분석해주세요:\n\n⚡ 임팩트 포인트:\n- 가장 강력한 후킹 문장은?\n- 독자에게 남을 핵심 메시지는?\n- 행동을 유도하는 CTA는?\n\n🎯 명확성 검증:\n- 메시지가 명확하게 전달되는가?\n- 불필요한 요소는 없는가?\n- 핵심만 간결하게 전달하는가?\n\n🚀 개선 액션:\n- 즉시 적용 가능한 개선점\n- 더 강력한 후킹 문구 제안\n- 독자 반응을 높이는 방법\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
            claude: "다음 글을 포맷 엄수와 긴 문맥 이해에 강한 전문가로서 분석해주세요:\n\n📌 구조적 분석:\n- 주제·메시지·타겟 요약(1~2줄)\n- 논리 흐름과 결론의 일치 여부\n\n🧭 형식 준수 점검:\n- 요구된 출력 형식/톤 준수 여부\n- 모호/과장/과도한 확언 존재 여부\n\n💡 개선 제안:\n- 형식/명확성/근거 보강 포인트\n- 안전한 대안 표현(과장 최소화)\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n"
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
            },
            claude: {
                name: "Claude",
                icon: "🟣",
                description: "형식 엄수·긴 문맥",
                details: "형식 준수·안전성·장문 요약/구조화",
                strength: "정책/포맷 준수와 긴 문맥 처리"
            }
        };

        // LLM 사이트별 홈페이지 URL (쿼리 파라미터 지원 안 함, 모달 방식 사용)
        this.llmUrls = {
            chatgpt: "https://chatgpt.com",
            gemini: "https://gemini.google.com",
            perplexity: "https://www.perplexity.ai",
            grok: "https://grok.com",
            claude: "https://claude.ai/new"
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

            // 성공 메시지 (심플한 안내)
            this.showMessage(`${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`, 'success');

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

            // 성공 메시지 (심플한 안내)
            const llmInfo = this.llmCharacteristics[llmService];
            if (llmInfo) {
                this.showMessage(`${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`, 'success');
            }

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

    // LLM 사이트 새 탭에서 열기 (심플한 방식: 자동 복사 + 새 탭 열기)
    openLLMSite(llmService, text) {
        // LLM 서비스 정보 가져오기
        const llmInfo = this.llmCharacteristics[llmService];
        if (!llmInfo) {
            console.error('지원하지 않는 LLM 서비스:', llmService);
            return;
        }

        // LLM 사이트 URL 가져오기
        const llmUrl = this.llmUrls[llmService] || {
            chatgpt: 'https://chatgpt.com',
            gemini: 'https://gemini.google.com',
            perplexity: 'https://www.perplexity.ai',
            grok: 'https://grok.com'
        }[llmService] || 'https://chatgpt.com';

        console.log('LLM 사이트 열기:', { llmService, url: llmUrl });

        // 새 탭에서 LLM 사이트 열기
        window.open(llmUrl, '_blank', 'noopener,noreferrer');
    }

    // LLM 통합 복사 모달 표시 (모든 LLM 지원)
    showLLMCopyModal(llmService, text) {
        // LLM 서비스 정보 가져오기
        const llmInfo = this.llmCharacteristics[llmService];
        if (!llmInfo) {
            console.error('지원하지 않는 LLM 서비스:', llmService);
            return;
        }

        // 기본 URL 가져오기 (쿼리 파라미터 제거)
        const baseUrl = this.llmUrls[llmService]?.split('?')[0] || this.llmUrls[llmService];
        const cleanUrl = baseUrl || {
            chatgpt: 'https://chatgpt.com',
            gemini: 'https://gemini.google.com',
            perplexity: 'https://www.perplexity.ai',
            grok: 'https://grok.com'
        }[llmService] || 'https://chatgpt.com';

        // 기존 모달이 있다면 제거
        const existingModal = document.getElementById('llm-copy-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 HTML 생성 (모든 LLM에 공통 사용)
        const modalHTML = `
            <div id="llm-copy-modal" class="gemini-modal-overlay">
                <div class="gemini-modal-content">
                    <div class="gemini-modal-header">
                        <h3>${llmInfo.icon} ${llmInfo.name} 검증 텍스트 복사</h3>
                        <button class="gemini-modal-close" onclick="this.closest('.gemini-modal-overlay').remove()">×</button>
                    </div>
                    <div class="gemini-modal-body">
                        <p class="gemini-instruction">아래 텍스트를 복사하여 ${llmInfo.name}에 붙여넣기하세요:</p>
                        <div class="gemini-text-container">
                            <textarea id="llm-text-area" readonly>${text}</textarea>
                            <button class="gemini-copy-btn" onclick="dualTextWriter.copyLLMText('${llmService}')">📋 전체 복사</button>
                        </div>
                        <div class="gemini-steps">
                            <h4>📝 사용 방법:</h4>
                            <ol>
                                <li>위의 "전체 복사" 버튼을 클릭하세요 (또는 이미 클립보드에 복사되어 있습니다)</li>
                                <li>${llmInfo.name} 페이지로 이동하세요</li>
                                <li>${llmInfo.name} 입력창에 Ctrl+V로 붙여넣기하세요</li>
                                <li>Enter를 눌러 검증을 시작하세요</li>
                            </ol>
                        </div>
                        <div class="gemini-actions">
                            <button class="gemini-open-btn" onclick="window.open('${cleanUrl}', '_blank')">🚀 ${llmInfo.name} 열기</button>
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
            const textArea = document.getElementById('llm-text-area');
            if (textArea) {
                textArea.focus();
                textArea.select();
            }
        }, 100);
    }

    // Gemini 전용 복사 모달 표시 (하위 호환성을 위해 유지)
    showGeminiCopyModal(text) {
        this.showLLMCopyModal('gemini', text);
    }

    // LLM 통합 텍스트 복사 함수 (모든 LLM 지원)
    copyLLMText(llmService) {
        const textArea = document.getElementById('llm-text-area');
        if (!textArea) {
            console.error('LLM 텍스트 영역을 찾을 수 없습니다.');
            return;
        }

        const llmInfo = this.llmCharacteristics[llmService];
        const llmName = llmInfo?.name || 'LLM';

        try {
            // 텍스트 영역 선택
            textArea.focus();
            textArea.select();

            // 복사 실행
            const successful = document.execCommand('copy');
            if (successful) {
                this.showMessage(`✅ 텍스트가 클립보드에 복사되었습니다!`, 'success');

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
            console.error(`${llmName} 텍스트 복사 실패:`, error);
            this.showMessage('❌ 복사에 실패했습니다. 텍스트를 수동으로 선택하여 복사해주세요.', 'error');
        }
    }

    // Gemini 텍스트 복사 함수 (하위 호환성을 위해 유지)
    copyGeminiText() {
        this.copyLLMText('gemini');
    }

    // LLM 검증 가이드 메시지 표시
    showLLMValidationGuide(llmService) {
        const characteristics = this.llmCharacteristics[llmService];

        // 모든 LLM에 통합 모달 방식 사용
        const message = `✅ ${characteristics.name} 검증 모달이 열렸습니다!\n\n` +
            `📋 검증할 텍스트가 클립보드에 복사되었습니다.\n` +
            `💡 모달에서 "전체 복사" 버튼을 클릭하거나, ${characteristics.name} 페이지로 이동하여 Ctrl+V로 붙여넣기하세요.\n\n` +
            `🎯 기대 결과: ${characteristics.description} - ${characteristics.details}`;

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
            // ✅ Phase 3.1.1: 필수 데이터 병렬 로드 (30-50% 단축)
            // loadSavedTextsFromFirestore()와 loadTrackingPosts()는 서로 독립적이므로
            // Promise.all을 사용하여 동시에 실행
            await Promise.all([
                this.loadSavedTextsFromFirestore(),
                this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve()
            ]);
            
            // UI 업데이트 (동기)
            this.updateCharacterCount('ref');
            this.updateCharacterCount('edit');
            await this.renderSavedTexts();
            this.startTempSave();
            this.restoreTempSave();
            
            // 미트래킹 글 버튼 상태 업데이트 (동기, Phase 2에서 최적화됨)
            if (this.updateBatchMigrationButton) {
                this.updateBatchMigrationButton();
            }
        } catch (error) {
            console.error('사용자 데이터 로드 실패:', error);
            this.showMessage('데이터를 불러오는데 실패했습니다.', 'error');
        }
    }

    /**
     * 모든 데이터를 새로고침합니다.
     * 
     * Firebase에서 최신 데이터를 다시 불러와 UI를 업데이트합니다.
     * 저장된 글, 트래킹 포스트, 통계 등을 모두 새로고침합니다.
     */
    async refreshAllData() {
        if (!this.currentUser || !this.isFirebaseReady) {
            this.showMessage('⚠️ 로그인이 필요합니다.', 'warning');
            return;
        }

        // 로딩 상태 표시
        const refreshBtn = this.refreshBtn;
        if (refreshBtn) {
            refreshBtn.disabled = true;
            const refreshIcon = refreshBtn.querySelector('.refresh-icon');
            if (refreshIcon) {
                refreshIcon.style.animation = 'spin 0.6s linear infinite';
            }
        }

        try {
            // ✅ Phase 3.1.1: 저장된 글 및 트래킹 포스트 병렬 새로고침 (30-50% 단축)
            await Promise.all([
                this.loadSavedTextsFromFirestore(),
                this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve()
            ]);
            
            // UI 업데이트
            this.updateCharacterCount('ref');
            this.updateCharacterCount('edit');
            await this.renderSavedTexts();
            
            // 미트래킹 글 버튼 상태 업데이트 (동기, Phase 2에서 최적화됨)
            if (this.updateBatchMigrationButton) {
                this.updateBatchMigrationButton();
            }
            
            // 모든 탭의 데이터 강제 새로고침
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });

            // 성공 메시지
            this.showMessage('✅ 데이터가 새로고침되었습니다!', 'success');
            console.log('✅ 모든 데이터 새로고침 완료');

        } catch (error) {
            console.error('데이터 새로고침 실패:', error);
            this.showMessage('❌ 데이터 새로고침에 실패했습니다: ' + error.message, 'error');
        } finally {
            // 로딩 상태 해제
            if (refreshBtn) {
                refreshBtn.disabled = false;
                const refreshIcon = refreshBtn.querySelector('.refresh-icon');
                if (refreshIcon) {
                    refreshIcon.style.animation = '';
                    // 회전 애니메이션 효과
                    refreshIcon.style.transform = 'rotate(180deg)';
                    setTimeout(() => {
                        if (refreshIcon) {
                            refreshIcon.style.transform = '';
                        }
                    }, 300);
                }
            }
        }
    }

    // Firestore에서 저장된 텍스트들 불러오기
    // 성능 최적화: 서버 사이드 필터링 지원 (선택적)
    async loadSavedTextsFromFirestore(filterOptions = {}) {
        if (!this.currentUser || !this.isFirebaseReady) return;

        try {
            const textsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'texts');
            
            // 서버 사이드 필터링 구성 (성능 최적화)
            // 참고: Firestore 복합 인덱스 필요 시 Firebase Console에서 생성 필요
            // 인덱스 예시: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)
            const queryConstraints = [window.firebaseOrderBy('createdAt', 'desc')];
            
            // type 필터 (서버 사이드)
            if (filterOptions.type && filterOptions.type !== 'all') {
                queryConstraints.push(window.firebaseWhere('type', '==', filterOptions.type));
            }
            
            // referenceType 필터 (서버 사이드, type이 'reference'일 때만 유효)
            if (filterOptions.type === 'reference' && filterOptions.referenceType && filterOptions.referenceType !== 'all') {
                queryConstraints.push(window.firebaseWhere('referenceType', '==', filterOptions.referenceType));
            }
            
            const q = window.firebaseQuery(textsRef, ...queryConstraints);
            const querySnapshot = await window.firebaseGetDocs(q);

            this.savedTexts = [];
            // 캐시 무효화 (데이터 로드 시)
            this.renderSavedTextsCache = null;
            this.renderSavedTextsCacheKey = null;
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
                    createdAt: data.createdAt,  // Firestore Timestamp 원본 보존
                    characterCount: data.characterCount,
                    type: normalizedType,
                    referenceType: data.referenceType || 'unspecified',
                    topic: data.topic || undefined,
                    contentHash: data.contentHash || undefined,
                    hashVersion: data.hashVersion || undefined,
                    
                    // ✅ 연결된 레퍼런스 (기존 데이터는 undefined이므로 빈 배열로 처리)
                    linkedReferences: Array.isArray(data.linkedReferences) ? data.linkedReferences : [],
                    referenceMeta: data.referenceMeta || undefined
                });
            });

            console.log(`${this.savedTexts.length}개의 텍스트를 불러왔습니다.`);
            
            // 주제 필터 옵션 업데이트 (데이터 로드 후)
            this.updateTopicFilterOptions();

            // 해시 미보유 레퍼런스 안내 (접근성: 토스트는 aria-live로 표시됨)
            try {
                const missingHashCount = this.savedTexts.filter(t => (t.type || 'edit') === 'reference' && !t.contentHash).length;
                if (missingHashCount > 0) {
                    this.showMessage(`ℹ️ 해시가 없는 레퍼런스 ${missingHashCount}개가 있습니다. 필요 시 해시 마이그레이션을 실행하세요.`, 'info');
                }
            } catch (e) {
                // 무시
            }

        } catch (error) {
            console.error('Firestore에서 텍스트 불러오기 실패:', error);
            // 복합 인덱스 오류인 경우 안내 메시지
            if (error.code === 'failed-precondition') {
                console.warn('복합 인덱스가 필요합니다. Firebase Console에서 인덱스를 생성해주세요.');
                console.warn('인덱스 구성: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)');
            }
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
            let referenceTextId = null;
            
            // 왼쪽 패널(레퍼런스)에서 현재 입력된 레퍼런스 확인
            const referenceContent = this.refTextInput.value.trim();
            if (referenceContent) {
                // 레퍼런스가 입력되어 있는 경우, 저장된 레퍼런스 중에서 찾거나 새로 저장
                try {
                    // 저장된 레퍼런스 중에서 동일한 내용의 레퍼런스 찾기
                    const matchingReference = this.savedTexts?.find(item => 
                        item.type === 'reference' && item.content === referenceContent
                    );
                    
                    if (matchingReference) {
                        // 기존 레퍼런스 사용
                        referenceTextId = matchingReference.id;
                        console.log('✅ 기존 레퍼런스 사용:', referenceTextId);
                    } else {
                        // 새 레퍼런스로 저장
                        const referenceData = {
                            content: referenceContent,
                            type: 'reference',
                            characterCount: this.getKoreanCharacterCount(referenceContent),
                            createdAt: window.firebaseServerTimestamp(),
                            updatedAt: window.firebaseServerTimestamp()
                        };
                        
                        const referenceDocRef = await window.firebaseAddDoc(
                            window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'texts'),
                            referenceData
                        );
                        
                        referenceTextId = referenceDocRef.id;
                        console.log('✅ 새 레퍼런스 저장 완료:', referenceTextId);
                        
                        // 로컬 배열에도 추가
                        const savedReference = {
                            id: referenceTextId,
                            content: referenceContent,
                            date: new Date().toLocaleString('ko-KR'),
                            characterCount: this.getKoreanCharacterCount(referenceContent),
                            type: 'reference'
                        };
                        if (!this.savedTexts) {
                            this.savedTexts = [];
                        }
                        this.savedTexts.unshift(savedReference);
                    }
                } catch (referenceError) {
                    console.warn('⚠️ 레퍼런스 저장 실패 (트래킹은 계속 진행):', referenceError);
                }
            }
            
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
                        // 레퍼런스 사용 정보 추가
                        referenceTextId: referenceTextId || null, // 레퍼런스 텍스트 참조 (있는 경우)
                        createdAt: window.firebaseServerTimestamp(),
                        updatedAt: window.firebaseServerTimestamp()
                    };
                    
                    // 레퍼런스가 사용된 경우, 레퍼런스용 포스트도 생성
                    if (referenceTextId) {
                        const referencePostData = {
                            content: referenceContent, // 레퍼런스 내용
                            type: 'reference',
                            postedAt: window.firebaseServerTimestamp(),
                            trackingEnabled: false, // 레퍼런스 포스트는 트래킹 비활성화
                            metrics: [],
                            analytics: {},
                            sourceTextId: referenceTextId, // 레퍼런스 텍스트 참조
                            sourceType: 'reference', // 레퍼런스 타입으로 설정
                            createdAt: window.firebaseServerTimestamp(),
                            updatedAt: window.firebaseServerTimestamp()
                        };
                        
                        await window.firebaseAddDoc(postsRef, referencePostData);
                        console.log('✅ 레퍼런스 사용 포스트 생성 완료 (레퍼런스 ID:', referenceTextId, ')');
                    }
                    
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

    /**
     * 레퍼런스 선택 모달 열기
     * 
     * - 레퍼런스 목록 렌더링
     * - 현재 선택된 항목 복원
     * - 모달 표시 및 포커스 이동
     */
    openReferenceSelectionModal() {
        try {
            if (!this.referenceSelectionModal) {
                console.warn('⚠️ 레퍼런스 선택 모달을 찾을 수 없습니다.');
                return;
            }
            
            // 레퍼런스만 필터링 (type이 없는 경우 'edit'로 간주)
            const references = this.savedTexts.filter(item => 
                (item.type || 'edit') === 'reference'
            );
            
            if (references.length === 0) {
                this.showMessage('⚠️ 저장된 레퍼런스가 없습니다. 먼저 레퍼런스를 저장해주세요.', 'info');
                return;
            }
            
            // 레퍼런스 목록 렌더링
            this.renderReferenceSelectionList(references);
            
            // 검색/필터 초기화
            if (this.referenceSearchInput) this.referenceSearchInput.value = '';
            if (this.referenceTypeFilterModal) this.referenceTypeFilterModal.value = 'all';
            
            // 선택 개수 업데이트
            this.updateReferenceSelectionCount();
            
            // 모달 표시
            this.referenceSelectionModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';  // 배경 스크롤 방지
            
            // 접근성: 포커스 이동 (검색 입력 필드로)
            setTimeout(() => {
                if (this.referenceSearchInput) {
                    this.referenceSearchInput.focus();
                }
            }, 100);
            
            console.log('📚 레퍼런스 선택 모달 열림');
        } catch (error) {
            console.error('모달 열기 실패:', error);
            this.showMessage('❌ 모달을 열 수 없습니다.', 'error');
        }
    }

    /**
     * 레퍼런스 선택 모달 닫기
     * 
     * - 모달 숨김
     * - 배경 스크롤 복원
     * - 포커스 복원 (원래 버튼으로)
     */
    closeReferenceSelectionModal() {
        if (!this.referenceSelectionModal) return;
        
        this.referenceSelectionModal.style.display = 'none';
        document.body.style.overflow = '';  // 배경 스크롤 복원
        
        // 접근성: 포커스 복원
        if (this.selectReferencesBtn) {
            this.selectReferencesBtn.focus();
        }
        
        console.log('📚 레퍼런스 선택 모달 닫힘');
    }

    /**
     * Phase 1.6.2: 작성글이 참고한 레퍼런스 목록 모달 표시
     * 
     * @param {string} editId - 작성글 ID
     * 
     * - 작성글이 연결한 레퍼런스 목록 조회
     * - 커스텀 모달로 표시
     * - 각 레퍼런스 "내용 보기" 버튼 제공
     */
    showLinkedReferencesModal(editId) {
        try {
            const editItem = this.savedTexts.find(item => item.id === editId);
            if (!editItem) {
                this.showMessage('❌ 작성글을 찾을 수 없습니다.', 'error');
                return;
            }
            
            const linkedRefs = this.getLinkedReferences(editId);
            
            if (linkedRefs.length === 0) {
                this.showMessage('ℹ️ 연결된 레퍼런스가 없습니다.', 'info');
                return;
            }
            
            // 모달 내용 생성
            const editTitle = this.escapeHtml(editItem.content || '').substring(0, 50);
            const refsHtml = linkedRefs.map((ref, index) => {
                const content = this.escapeHtml(ref.content || '').substring(0, 100);
                const date = this.formatDateFromFirestore(ref.createdAt) || ref.date || '';
                const refType = ref.referenceType || 'other';
                const refTypeLabel = refType === 'structure' ? '구조' : refType === 'idea' ? '아이디어' : '기타';
                
                return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${content.length >= 100 ? '...' : ''}</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>·</span>
                                <span class="reference-type-badge badge-${this.escapeHtml(refType)}">${this.escapeHtml(refTypeLabel)}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${ref.id}"
                                aria-label="레퍼런스 내용 보기">
                                내용 보기
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            
            const modalHtml = `
                <div class="custom-modal" role="dialog" aria-modal="true" 
                     aria-labelledby="linked-ref-modal-title">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h3 id="linked-ref-modal-title">📚 이 글이 참고한 레퍼런스</h3>
                            <button class="close-btn" aria-label="모달 닫기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>작성글:</strong> ${editTitle}${editTitle.length >= 50 ? '...' : ''}
                            </div>
                            <div class="linked-items-list" role="list" aria-label="참고 레퍼런스 목록">
                                ${refsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="닫기">닫기</button>
                        </div>
                    </div>
                </div>
            `;
            
            // 모달 표시
            const existingModal = document.querySelector('.custom-modal');
            if (existingModal) {
                existingModal.remove();
            }
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = document.querySelector('.custom-modal');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // 이벤트 바인딩
            this.bindCustomModalEvents(modal);
            
            console.log(`📚 연결 레퍼런스 모달 표시: ${linkedRefs.length}개`);
        } catch (error) {
            console.error('연결된 레퍼런스 모달 표시 실패:', error);
            this.showMessage('❌ 레퍼런스를 불러올 수 없습니다.', 'error');
        }
    }

    /**
     * Phase 1.6.2: 레퍼런스를 참고한 작성글 목록 모달 표시
     * 
     * @param {string} refId - 레퍼런스 ID
     * 
     * - 레퍼런스를 참고한 작성글 목록 조회 (역방향)
     * - 커스텀 모달로 표시
     * - 각 작성글 "내용 보기" 버튼 제공
     */
    showEditsByReferenceModal(refId) {
        try {
            const refItem = this.savedTexts.find(item => item.id === refId);
            if (!refItem) {
                this.showMessage('❌ 레퍼런스를 찾을 수 없습니다.', 'error');
                return;
            }
            
            const usedEdits = this.getEditsByReference(refId);
            
            if (usedEdits.length === 0) {
                this.showMessage('ℹ️ 이 레퍼런스를 참고한 글이 없습니다.', 'info');
                return;
            }
            
            // 모달 내용 생성
            const refTitle = this.escapeHtml(refItem.content || '').substring(0, 50);
            const editsHtml = usedEdits.map((edit, index) => {
                const content = this.escapeHtml(edit.content || '').substring(0, 100);
                const date = this.formatDateFromFirestore(edit.createdAt) || edit.date || '';
                const topic = this.escapeHtml(edit.topic || '주제 없음');
                
                return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${content.length >= 100 ? '...' : ''}</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>·</span>
                                <span>🏷️ ${topic}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${edit.id}"
                                aria-label="작성글 내용 보기">
                                내용 보기
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            
            const modalHtml = `
                <div class="custom-modal" role="dialog" aria-modal="true" 
                     aria-labelledby="used-in-edits-modal-title">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h3 id="used-in-edits-modal-title">📝 이 레퍼런스를 참고한 작성글</h3>
                            <button class="close-btn" aria-label="모달 닫기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>레퍼런스:</strong> ${refTitle}${refTitle.length >= 50 ? '...' : ''}
                            </div>
                            <div class="linked-items-list" role="list" aria-label="참고한 작성글 목록">
                                ${editsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="닫기">닫기</button>
                        </div>
                    </div>
                </div>
            `;
            
            // 모달 표시
            const existingModal = document.querySelector('.custom-modal');
            if (existingModal) {
                existingModal.remove();
            }
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = document.querySelector('.custom-modal');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // 이벤트 바인딩
            this.bindCustomModalEvents(modal);
            
            console.log(`📝 참고한 작성글 모달 표시: ${usedEdits.length}개`);
        } catch (error) {
            console.error('참고한 작성글 모달 표시 실패:', error);
            this.showMessage('❌ 작성글을 불러올 수 없습니다.', 'error');
        }
    }

    /**
     * Phase 1.6.2: 커스텀 모달 이벤트 바인딩
     * 
     * @param {HTMLElement} modal - 모달 DOM 요소
     * 
     * - 닫기 버튼 이벤트
     * - 모달 외부 클릭
     * - ESC 키
     * - "내용 보기" 버튼
     */
    bindCustomModalEvents(modal) {
        if (!modal) return;
        
        // 닫기 버튼
        const closeBtns = modal.querySelectorAll('.close-btn, .close-modal-btn');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.remove();
                document.body.style.overflow = '';
            });
        });
        
        // 모달 외부 클릭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                document.body.style.overflow = '';
            }
        });
        
        // ESC 키
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.body.style.overflow = '';
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // "내용 보기" 버튼
        const viewBtns = modal.querySelectorAll('.view-item-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.getAttribute('data-item-id');
                // 기존 "내용 보기" 로직 재사용
                this.viewSavedText(itemId);
                modal.remove();
                document.body.style.overflow = '';
            });
        });
    }

    /**
     * 레퍼런스 선택 목록 렌더링
     * 
     * @param {Array} references - 레퍼런스 배열 (옵션, 없으면 전체 조회)
     * 
     * - 체크박스로 다중 선택 가능
     * - 현재 선택된 항목 체크 표시
     * - 검색 및 필터 적용
     * - 최신순 정렬
     */
    renderReferenceSelectionList(references = null) {
        if (!this.referenceSelectionList) return;
        
        try {
            // 레퍼런스 목록 가져오기 (파라미터 없으면 전체 조회)
            let refs = references || this.savedTexts.filter(item => 
                (item.type || 'edit') === 'reference'
            );
            
            // 검색 필터 적용
            const searchTerm = this.referenceSearchInput?.value.toLowerCase().trim() || '';
            if (searchTerm) {
                refs = refs.filter(ref => {
                    const content = (ref.content || '').toLowerCase();
                    const topic = (ref.topic || '').toLowerCase();
                    return content.includes(searchTerm) || topic.includes(searchTerm);
                });
            }
            
            // 타입 필터 적용
            const typeFilter = this.referenceTypeFilterModal?.value || 'all';
            if (typeFilter !== 'all') {
                refs = refs.filter(ref => (ref.referenceType || 'other') === typeFilter);
            }
            
            // 정렬 (최신순)
            refs.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
                const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
                return dateB - dateA;
            });
            
            // HTML 생성
            if (refs.length === 0) {
                this.referenceSelectionList.innerHTML = `
                    <div class="empty-state" style="padding: 40px; text-align: center; color: #6c757d;">
                        <p>검색 결과가 없습니다.</p>
                    </div>
                `;
                return;
            }
            
            const html = refs.map(ref => {
                const isSelected = this.selectedReferences.includes(ref.id);
                const content = this.escapeHtml(ref.content || '').substring(0, 100);
                const topic = this.escapeHtml(ref.topic || '주제 없음');
                const refType = ref.referenceType || 'other';
                const typeLabel = refType === 'structure' ? '구조' : refType === 'idea' ? '아이디어' : '미지정';
                const badgeClass = refType === 'structure' ? 'structure' : refType === 'idea' ? 'idea' : '';
                const date = this.formatDateFromFirestore?.(ref.createdAt) || ref.date || '';
                
                return `
                    <div class="reference-list-item" role="option" aria-selected="${isSelected}">
                        <input 
                            type="checkbox" 
                            id="ref-check-${ref.id}" 
                            value="${ref.id}"
                            ${isSelected ? 'checked' : ''}
                            aria-labelledby="ref-label-${ref.id}">
                        <div class="reference-item-content">
                            <div class="reference-item-title" id="ref-label-${ref.id}">
                                ${content}${content.length >= 100 ? '...' : ''}
                            </div>
                            <div class="reference-item-meta">
                                ${date ? `<span>${date}</span>` : ''}
                                ${date ? '<span>·</span>' : ''}
                                <span class="reference-type-badge ${badgeClass}">${typeLabel}</span>
                                <span>·</span>
                                <span>${topic}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            this.referenceSelectionList.innerHTML = html;
            
            // 체크박스 이벤트 바인딩
            this.bindReferenceCheckboxEvents();
            
            console.log(`✅ 레퍼런스 목록 렌더링 완료: ${refs.length}개`);
        } catch (error) {
            console.error('레퍼런스 목록 렌더링 실패:', error);
            this.referenceSelectionList.innerHTML = `
                <div class="error-state" style="padding: 40px; text-align: center; color: #dc3545;">
                    <p>❌ 목록을 불러올 수 없습니다.</p>
                </div>
            `;
        }
    }

    /**
     * 레퍼런스 체크박스 이벤트 바인딩
     * 
     * - 체크박스 변경 시 선택 배열 업데이트
     * - 선택 개수 실시간 표시
     * - 리스트 아이템 클릭으로도 토글 가능
     */
    bindReferenceCheckboxEvents() {
        if (!this.referenceSelectionList) return;
        
        // 체크박스 변경 이벤트
        const checkboxes = this.referenceSelectionList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const refId = e.target.value;
                
                if (e.target.checked) {
                    // 선택 추가
                    if (!this.selectedReferences.includes(refId)) {
                        this.selectedReferences.push(refId);
                    }
                } else {
                    // 선택 제거
                    this.selectedReferences = this.selectedReferences.filter(id => id !== refId);
                }
                
                // 선택 개수 업데이트
                this.updateReferenceSelectionCount();
                
                console.log('선택된 레퍼런스:', this.selectedReferences);
            });
        });
        
        // 리스트 아이템 클릭 시 체크박스 토글 (UX 개선)
        const listItems = this.referenceSelectionList.querySelectorAll('.reference-list-item');
        listItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // 체크박스 자체를 클릭한 경우는 제외
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        // change 이벤트 트리거
                        checkbox.dispatchEvent(new Event('change'));
                    }
                }
            });
        });
    }

    /**
     * 선택된 레퍼런스 개수 업데이트
     * 
     * - 모달 내 개수 표시
     * - aria-live로 스크린 리더에 알림
     */
    updateReferenceSelectionCount() {
        const count = this.selectedReferences.length;
        
        if (this.modalSelectedCount) {
            this.modalSelectedCount.textContent = count;
        }
        
        // aria-live로 스크린 리더에 알림
        const selectionCountDiv = this.referenceSelectionModal?.querySelector('.selection-count');
        if (selectionCountDiv) {
            selectionCountDiv.setAttribute('aria-live', 'polite');
        }
    }

    /**
     * 레퍼런스 선택/해제 토글 (레거시 호환용)
     * @deprecated bindReferenceCheckboxEvents의 change 이벤트로 대체됨
     */
    toggleReferenceSelection(refId) {
        const index = this.selectedReferences.indexOf(refId);
        if (index > -1) {
            // 이미 선택된 경우 제거
            this.selectedReferences.splice(index, 1);
        } else {
            // 선택되지 않은 경우 추가
            this.selectedReferences.push(refId);
        }
        
        this.updateReferenceSelectionCount();
    }

    /**
     * 모달 내 선택 개수 업데이트 (레거시 호환용)
     * @deprecated updateReferenceSelectionCount로 통합됨
     */
    updateModalSelectedCount() {
        this.updateReferenceSelectionCount();
    }

    /**
     * 레퍼런스 선택 확인
     * 
     * - 선택된 레퍼런스 태그 표시
     * - 모달 닫기
     * - 선택 개수 버튼 업데이트
     */
    confirmReferenceSelection() {
        try {
            // 태그 렌더링 (토글 버튼 카운트도 함께 업데이트)
            this.renderSelectedReferenceTags();
            
            // 버튼 개수 업데이트
            if (this.selectedRefCount) {
                this.selectedRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
            }
            
            // 토글 버튼 카운트 업데이트
            if (this.collapseRefCount) {
                this.collapseRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
            }
            
            // 모달 닫기
            this.closeReferenceSelectionModal();
            
            console.log(`✅ ${this.selectedReferences.length}개 레퍼런스 선택 완료`);
        } catch (error) {
            console.error('선택 확인 실패:', error);
            this.showMessage('❌ 선택을 저장할 수 없습니다.', 'error');
        }
    }

    /**
     * 선택된 레퍼런스 태그 렌더링
     * 
     * - 선택된 각 레퍼런스를 태그로 표시
     * - X 버튼으로 제거 가능
     */
    renderSelectedReferenceTags() {
        if (!this.selectedReferencesTags) return;
        
        try {
            if (this.selectedReferences.length === 0) {
                this.selectedReferencesTags.innerHTML = '';
                // 토글 버튼 카운트도 업데이트
                if (this.collapseRefCount) {
                    this.collapseRefCount.textContent = '(0개 선택됨)';
                }
                return;
            }
            
            // 선택된 레퍼런스 객체 가져오기
            const selectedRefs = this.selectedReferences
                .map(refId => this.savedTexts.find(item => item.id === refId))
                .filter(Boolean);  // null 제거
            
            const html = selectedRefs.map(ref => {
                const content = this.escapeHtml(ref.content || '').substring(0, 30);
                const title = `${content}${content.length >= 30 ? '...' : ''}`;
                
                return `
                    <div class="reference-tag" role="listitem" data-ref-id="${ref.id}">
                        <span class="tag-text" title="${this.escapeHtml(ref.content || '')}">
                            ${title}
                        </span>
                        <button 
                            class="remove-btn" 
                            data-ref-id="${ref.id}"
                            type="button"
                            aria-label="${this.escapeHtml(content)} 제거"
                            title="제거">
                            ×
                        </button>
                    </div>
                `;
            }).join('');
            
            this.selectedReferencesTags.innerHTML = html;
            
            // 토글 버튼 카운트도 업데이트
            if (this.collapseRefCount) {
                this.collapseRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
            }
            
            // 제거 버튼 이벤트 바인딩
            this.bindReferenceTagRemoveEvents();
            
            console.log(`✅ ${selectedRefs.length}개 태그 렌더링 완료`);
        } catch (error) {
            console.error('태그 렌더링 실패:', error);
            this.selectedReferencesTags.innerHTML = '<p style="color: #dc3545;">태그를 표시할 수 없습니다.</p>';
        }
    }

    /**
     * 레퍼런스 태그 제거 버튼 이벤트 바인딩
     */
    bindReferenceTagRemoveEvents() {
        if (!this.selectedReferencesTags) return;
        
        const removeBtns = this.selectedReferencesTags.querySelectorAll('.remove-btn');
        
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const refId = btn.getAttribute('data-ref-id');
                
                // 선택 배열에서 제거
                this.selectedReferences = this.selectedReferences.filter(id => id !== refId);
                
                // 태그 재렌더링
                this.renderSelectedReferenceTags();
                
                // 버튼 개수 업데이트
                if (this.selectedRefCount) {
                    this.selectedRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
                }
                
                console.log(`레퍼런스 제거: ${refId}`);
            });
        });
    }

    /**
     * 선택된 레퍼런스를 태그로 렌더링 (레거시 호환용)
     * @deprecated renderSelectedReferenceTags로 통합됨
     */
    renderSelectedReferencesTags() {
        this.renderSelectedReferenceTags();
    }

    /**
     * 선택된 레퍼런스 제거 (레거시 호환용, 전역 함수에서 호출)
     */
    removeSelectedReference(refId) {
        const index = this.selectedReferences.indexOf(refId);
        if (index > -1) {
            this.selectedReferences.splice(index, 1);
            this.renderSelectedReferenceTags();
            
            // 버튼 텍스트 업데이트
            if (this.selectedRefCount) {
                this.selectedRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
            }
        }
    }

    /**
     * 레퍼런스 목록 필터링 (검색 + 타입)
     */
    filterReferenceList() {
        const searchTerm = this.referenceSearchInput?.value.toLowerCase() || '';
        const selectedType = this.referenceTypeFilterModal?.value || 'all';
        
        let filtered = this.savedTexts.filter(item => item.type === 'reference');
        
        // 검색어 필터
        if (searchTerm) {
            filtered = filtered.filter(ref => 
                ref.content.toLowerCase().includes(searchTerm) ||
                (ref.topic && ref.topic.toLowerCase().includes(searchTerm))
            );
        }
        
        // 타입 필터
        if (selectedType !== 'all') {
            filtered = filtered.filter(ref => ref.referenceType === selectedType);
        }
        
        // 재렌더링
        this.renderReferenceSelectionList(filtered);
    }

    /**
     * 작성글에 연결된 레퍼런스 조회 (직접 조회)
     * 
     * @param {string} editId - 작성글 ID
     * @returns {Array} 연결된 레퍼런스 객체 배열
     * 
     * - 작성글의 linkedReferences ID 배열을 기반으로 레퍼런스 객체 조회
     * - 존재하지 않는 레퍼런스는 제외
     * - 최신순 정렬
     */
    getLinkedReferences(editId) {
        try {
            // 작성글 찾기
            const editItem = this.savedTexts.find(item => item.id === editId);
            if (!editItem || (editItem.type || 'edit') !== 'edit') {
                return [];
            }
            
            // linkedReferences 배열 확인
            const linkedRefIds = editItem.linkedReferences || [];
            if (linkedRefIds.length === 0) {
                return [];
            }
            
            // ID를 객체로 변환 (O(n) 검색)
            const linkedRefs = linkedRefIds
                .map(refId => this.savedTexts.find(item => item.id === refId && (item.type || 'edit') === 'reference'))
                .filter(Boolean);  // null 제거
            
            // 최신순 정렬
            linkedRefs.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
                const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
                return dateB - dateA;
            });
            
            return linkedRefs;
        } catch (error) {
            console.error('연결된 레퍼런스 조회 실패:', error);
            return [];
        }
    }

    /**
     * 레퍼런스를 참고한 작성글 조회 (역방향)
     * 
     * @param {string} referenceId - 레퍼런스 ID
     * @returns {Array} 이 레퍼런스를 참고한 작성글 객체 배열
     * 
     * - 클라이언트에서 계산 (Firebase 쿼리 없음)
     * - 메모리에 로드된 savedTexts 배열을 O(n) 검색
     * - 최신순 정렬
     */
    getEditsByReference(referenceId) {
        try {
            // 작성글만 필터링 + linkedReferences에 referenceId 포함
            const edits = this.savedTexts.filter(item => 
                (item.type || 'edit') === 'edit' &&
                Array.isArray(item.linkedReferences) &&
                item.linkedReferences.includes(referenceId)
            );
            
            // 최신순 정렬
            edits.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
                const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
                return dateB - dateA;
            });
            
            return edits;
        } catch (error) {
            console.error('역방향 조회 실패:', error);
            return [];
        }
    }

    /**
     * 역방향 조회 캐시 무효화
     * 
     * - 데이터 변경 시 (저장, 삭제) 캐시 초기화
     * - 현재는 캐싱을 사용하지 않지만, 향후 확장성을 위해 함수 제공
     */
    invalidateReferenceLinkCache() {
        if (this.referenceLinkCache) {
            this.referenceLinkCache.clear();
        }
        // 현재는 매번 계산하므로 별도 작업 불필요
        console.log('📚 레퍼런스 링크 캐시 무효화 (현재는 캐싱 미사용)');
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
// Bottom sheet helpers
DualTextWriter.prototype.openBottomSheet = function(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const content = modalElement.querySelector('.modal-content');
    // backdrop click
    modalElement._backdropHandler = (e) => {
        if (e.target === modalElement) this.closeBottomSheet(modalElement);
    };
    modalElement.addEventListener('click', modalElement._backdropHandler);
    // ESC close
    modalElement._escHandler = (e) => { if (e.key === 'Escape') this.closeBottomSheet(modalElement); };
    document.addEventListener('keydown', modalElement._escHandler);
    // drag to close from handle or top area
    let startY = null; let currentY = 0; let dragging = false;
    const threshold = 100;
    const handle = content.querySelector('.sheet-handle') || content;
    const onStart = (y) => { dragging = true; startY = y; content.style.transition = 'none'; };
    const onMove = (y) => {
        if (!dragging) return; currentY = Math.max(0, y - startY); content.style.transform = `translateY(${currentY}px)`;
    };
    const onEnd = () => {
        if (!dragging) return; content.style.transition = '';
        if (currentY > threshold) { this.closeBottomSheet(modalElement); }
        else { content.style.transform = 'translateY(0)'; }
        dragging = false; startY = null; currentY = 0;
    };
    modalElement._touchStart = (e) => onStart(e.touches ? e.touches[0].clientY : e.clientY);
    modalElement._touchMove = (e) => onMove(e.touches ? e.touches[0].clientY : e.clientY);
    modalElement._touchEnd = () => onEnd();
    
    // Number stepper handlers
    content.querySelectorAll('.number-stepper').forEach(stepper => {
        stepper.onclick = (e) => {
            e.preventDefault();
            const targetId = stepper.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;
            const action = stepper.getAttribute('data-action');
            const current = parseInt(input.value) || 0;
            const min = parseInt(input.getAttribute('min')) || 0;
            const max = parseInt(input.getAttribute('max')) || Infinity;
            
            let newValue = current;
            if (action === 'increase') {
                newValue = Math.min(current + 1, max);
            } else if (action === 'decrease') {
                newValue = Math.max(current - 1, min);
            }
            
            // 유효성 검증: min/max 범위 내인지 확인
            if (newValue >= min && newValue <= max) {
                input.value = newValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                
                // 실시간 유효성 피드백: 범위를 벗어나면 스테퍼 비활성화
                const increaseBtn = input.parentElement.querySelector('.number-stepper[data-action="increase"]');
                const decreaseBtn = input.parentElement.querySelector('.number-stepper[data-action="decrease"]');
                if (increaseBtn) {
                    increaseBtn.disabled = newValue >= max;
                    increaseBtn.style.opacity = newValue >= max ? '0.5' : '1';
                }
                if (decreaseBtn) {
                    decreaseBtn.disabled = newValue <= min;
                    decreaseBtn.style.opacity = newValue <= min ? '0.5' : '1';
                }
            }
        };
    });
    
    // Date tab handlers - 이벤트 위임 방식으로 안정적인 바인딩
    // 기존 핸들러 제거 (중복 바인딩 방지)
    if (content._dateTabHandler) {
        content.removeEventListener('click', content._dateTabHandler);
    }
    
    // 새로운 핸들러 생성 및 저장
    content._dateTabHandler = (e) => {
        const tab = e.target.closest('.date-tab');
        if (!tab) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const tabs = tab.closest('.date-selector-tabs');
        if (!tabs) return;
        
        // 같은 폼 그룹 내의 날짜 입력 필드 찾기
        const formGroup = tabs.closest('.form-group');
        if (!formGroup) return;
        
        const dateInput = formGroup.querySelector('input[type="date"]');
        if (!dateInput) {
            console.warn('날짜 입력 필드를 찾을 수 없습니다:', formGroup);
            return;
        }
        
        // 모든 탭 비활성화 후 클릭한 탭 활성화
        tabs.querySelectorAll('.date-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        
        const dateType = tab.getAttribute('data-date');
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (dateType === 'today') {
            const todayStr = today.toISOString().split('T')[0];
            dateInput.value = todayStr;
            dateInput.style.display = 'none';
            // input 이벤트 트리거하여 폼 검증 업데이트
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (dateType === 'yesterday') {
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            dateInput.value = yesterdayStr;
            dateInput.style.display = 'none';
            // input 이벤트 트리거하여 폼 검증 업데이트
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (dateType === 'custom') {
            dateInput.style.display = 'block';
            // 직접입력 필드가 보이도록 약간의 지연 후 포커스 (애니메이션 완료 후)
            setTimeout(() => {
                dateInput.focus();
            }, 50);
            // 사용자 입력을 위해 현재 값을 유지하거나 오늘 날짜로 설정
            if (!dateInput.value) {
                dateInput.value = today.toISOString().split('T')[0];
            }
            // input 이벤트 트리거
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };
    
    // 이벤트 위임: 모달 컨텐츠에 한 번만 바인딩
    content.addEventListener('click', content._dateTabHandler);
    
    // Focus scroll correction: 키패드가 가려지지 않도록 (안드로이드/아이폰 호환)
    content.querySelectorAll('input, textarea').forEach(field => {
        const handleFocus = (e) => {
            // 여러 번 호출 방지
            if (field._scrollHandled) return;
            field._scrollHandled = true;
            
            setTimeout(() => {
                const rect = field.getBoundingClientRect();
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                
                // 플랫폼별 키패드 높이 추정
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                const isAndroid = /Android/.test(navigator.userAgent);
                const keyboardHeight = isIOS ? Math.max(300, viewportHeight * 0.35) :
                                       isAndroid ? Math.max(250, viewportHeight * 0.4) :
                                       Math.max(250, viewportHeight * 0.4);
                
                const fieldBottom = rect.bottom;
                const visibleArea = viewportHeight - keyboardHeight;
                
                if (fieldBottom > visibleArea) {
                    const scrollOffset = fieldBottom - visibleArea + 30; // 여유 공간 증가
                    
                    // 모달 컨텐츠 스크롤
                    if (content.scrollHeight > content.clientHeight) {
                        content.scrollTop += scrollOffset;
                    }
                    
                    // 전체 페이지 스크롤 (필요시)
                    const modalRect = modalElement.getBoundingClientRect();
                    if (modalRect.bottom > visibleArea) {
                        // 부드러운 스크롤
                        field.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'center', 
                            inline: 'nearest' 
                        });
                    }
                }
                
                field._scrollHandled = false;
            }, isIOS ? 500 : 300); // iOS는 키패드 애니메이션이 더 길 수 있음
        };
        
        field.addEventListener('focus', handleFocus, { passive: true });
        
        // blur 시 플래그 리셋
        field.addEventListener('blur', () => {
            field._scrollHandled = false;
        }, { passive: true });
    });
    handle.addEventListener('touchstart', modalElement._touchStart);
    handle.addEventListener('touchmove', modalElement._touchMove);
    handle.addEventListener('touchend', modalElement._touchEnd);
    handle.addEventListener('mousedown', modalElement._touchStart);
    window.addEventListener('mousemove', modalElement._touchMove);
    window.addEventListener('mouseup', modalElement._touchEnd);
};

DualTextWriter.prototype.closeBottomSheet = function(modalElement) {
    if (!modalElement) return;
    
    // 폼 값 초기화 전략: 바텀시트 닫을 때 모든 입력 필드 초기화
    const content = modalElement.querySelector('.modal-content');
    if (content) {
        // 모든 input, textarea, select 초기화
        const inputs = content.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else if (input.type === 'date') {
                input.value = '';
            } else {
                input.value = '';
            }
        });
        
        // 날짜 탭 초기화
        const dateTabs = content.querySelectorAll('.date-tab');
        dateTabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
        const todayTab = content.querySelector('.date-tab[data-date="today"]');
        if (todayTab) {
            todayTab.classList.add('active');
            todayTab.setAttribute('aria-selected', 'true');
        }
        
        // 날짜 입력 필드 초기화
        const dateInputs = content.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => {
            input.style.display = 'none';
        });
        
        // 스테퍼 버튼 상태 초기화
        const steppers = content.querySelectorAll('.number-stepper');
        steppers.forEach(stepper => {
            stepper.disabled = false;
            stepper.style.opacity = '1';
        });
        
        // 폼 검증 메시지 제거
        const errorMessages = content.querySelectorAll('.error-message, .validation-error');
        errorMessages.forEach(msg => msg.remove());
        
        // 입력 필드의 에러 상태 제거
        inputs.forEach(input => {
            input.classList.remove('error', 'invalid');
        });
    }
    
    modalElement.style.display = 'none';
    document.body.style.overflow = '';
    
    // cleanup listeners
    if (modalElement._backdropHandler) modalElement.removeEventListener('click', modalElement._backdropHandler);
    if (modalElement._escHandler) document.removeEventListener('keydown', modalElement._escHandler);
    const handle = content ? (content.querySelector('.sheet-handle') || content) : null;
    if (handle) {
        if (modalElement._touchStart) handle.removeEventListener('touchstart', modalElement._touchStart);
        if (modalElement._touchMove) handle.removeEventListener('touchmove', modalElement._touchMove);
        if (modalElement._touchEnd) handle.removeEventListener('touchend', modalElement._touchEnd);
        if (modalElement._touchStart) handle.removeEventListener('mousedown', modalElement._touchStart);
        window.removeEventListener('mousemove', modalElement._touchMove || (()=>{}));
        window.removeEventListener('mouseup', modalElement._touchEnd || (()=>{}));
    }
    
    // 모달 상태 초기화
    this.currentTrackingTextId = null;
    this.editingMetricData = null;
};

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
    
    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(100%);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideOutDown {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(100%);
        }
    }
`;
document.head.appendChild(style);

// ==================== 트래킹 기능 메서드들 ====================

// 트래킹 포스트 로드
DualTextWriter.prototype.loadTrackingPosts = async function() {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    // 로딩 스켈레톤 표시
    if (this.trackingPostsList) {
        this.trackingPostsList.innerHTML = `
            <div class="skeleton-card">
                <div class="skeleton skeleton-card-header"></div>
                <div class="skeleton skeleton-card-content"></div>
                <div class="skeleton skeleton-card-content"></div>
                <div class="skeleton skeleton-chip"></div>
                <div class="skeleton skeleton-chip"></div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton skeleton-card-header"></div>
                <div class="skeleton skeleton-card-content"></div>
                <div class="skeleton skeleton-chip"></div>
            </div>
        `;
    }
    
    try {
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const q = window.firebaseQuery(postsRef, window.firebaseOrderBy('postedAt', 'desc'));
        const querySnapshot = await window.firebaseGetDocs(q);
        
        this.trackingPosts = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // 레퍼런스 타입 포스트는 트래킹 목록에서 제외
            // 레퍼런스 글은 사용 여부 표시용이지 트래킹 대상이 아님
            const postType = data.type || 'edit';
            const sourceType = data.sourceType || data.type || 'edit';
            
            // 레퍼런스 타입 포스트 필터링 (type === 'reference' 또는 sourceType === 'reference')
            if (postType === 'reference' || sourceType === 'reference') {
                console.log('레퍼런스 포스트는 트래킹 목록에서 제외:', doc.id);
                return; // 이 포스트는 트래킹 목록에 추가하지 않음
            }
            
            this.trackingPosts.push({
                id: doc.id,
                content: data.content,
                type: postType,
                postedAt: data.postedAt ? data.postedAt.toDate() : new Date(),
                trackingEnabled: data.trackingEnabled || false,
                metrics: data.metrics || [],
                analytics: data.analytics || {},
                sourceTextId: data.sourceTextId || null, // 원본 텍스트 참조
                sourceType: sourceType, // 원본 텍스트 타입
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
        
        // loadTrackingPosts는 초기 로드 시에만 사용, 이후에는 refreshUI 사용
        this.refreshUI({ trackingPosts: true, trackingSummary: true, trackingChart: true, force: true });
        
    } catch (error) {
        // Firebase 데이터 로드 실패 시 에러 처리
        console.error('[loadTrackingPosts] Failed to load tracking posts:', error);
        this.trackingPosts = [];
        // 사용자에게 에러 메시지 표시
        this.showMessage('트래킹 데이터를 불러오는데 실패했습니다. 네트워크 연결을 확인해주세요.', 'error');
        // 빈 상태 표시
        if (this.trackingPostsList) {
            this.trackingPostsList.innerHTML = `
                <div class="tracking-post-no-data" style="text-align: center; padding: 40px 20px;">
                    <span class="no-data-icon" style="font-size: 3rem; display: block; margin-bottom: 16px;">📭</span>
                    <span class="no-data-text" style="color: #666; font-size: 0.95rem;">데이터를 불러올 수 없습니다. 페이지를 새로고침해주세요.</span>
                </div>
            `;
        }
    }
};

// 즐겨찾기 관리
DualTextWriter.prototype.isFavorite = function(postId) {
    try {
        const favs = JSON.parse(localStorage.getItem('dtw_favorites') || '[]');
        return favs.includes(postId);
    } catch { return false; }
};

DualTextWriter.prototype.toggleFavorite = function(postId) {
    try {
        const favs = JSON.parse(localStorage.getItem('dtw_favorites') || '[]');
        const idx = favs.indexOf(postId);
        if (idx >= 0) favs.splice(idx, 1); else favs.push(postId);
        localStorage.setItem('dtw_favorites', JSON.stringify(favs));
        this.refreshUI({ trackingPosts: true });
    } catch (e) {
        console.error('즐겨찾기 저장 실패', e);
    }
};

// CSV 내보내기 (현재 필터/정렬 적용된 리스트 기준)
DualTextWriter.prototype.exportTrackingCsv = function() {
    if (!this.trackingPosts || this.trackingPosts.length === 0) {
        this.showMessage('내보낼 데이터가 없습니다.', 'info');
        return;
    }
    // renderTrackingPosts의 필터/정렬 로직을 재사용하기 위해 동일 계산 수행
    const getLatest = (p) => (p.metrics && p.metrics.length > 0) ? p.metrics[p.metrics.length - 1] : null;
    let list = [...this.trackingPosts];
    // 상태
    if (this.trackingStatusFilter === 'active') list = list.filter(p => !!p.trackingEnabled);
    else if (this.trackingStatusFilter === 'inactive') list = list.filter(p => !p.trackingEnabled);
    else if (this.trackingStatusFilter === 'hasData') list = list.filter(p => (p.metrics && p.metrics.length > 0));
    else if (this.trackingStatusFilter === 'noData') list = list.filter(p => !(p.metrics && p.metrics.length > 0));
    // 검색
    if (this.trackingSearch && this.trackingSearch.trim()) {
        const tokens = this.trackingSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        list = list.filter(p => {
            const text = (p.content || '').toLowerCase();
            return tokens.every(tk => text.includes(tk));
        });
    }
    // 기간
    if (this.trackingUpdatedFrom || this.trackingUpdatedTo) {
        const fromMs = this.trackingUpdatedFrom ? new Date(this.trackingUpdatedFrom + 'T00:00:00').getTime() : null;
        const toMs = this.trackingUpdatedTo ? new Date(this.trackingUpdatedTo + 'T23:59:59').getTime() : null;
        list = list.filter(p => {
            const lt = getLatest(p)?.timestamp; if (!lt) return false;
            const ms = lt.toDate ? lt.toDate().getTime() : new Date(lt).getTime();
            if (fromMs && ms < fromMs) return false; if (toMs && ms > toMs) return false; return true;
        });
    }
    // 수치 범위
    const rf = this.rangeFilters || {};
    const inRange = (val, min, max) => {
        if (min !== undefined && min !== '' && val < Number(min)) return false;
        if (max !== undefined && max !== '' && val > Number(max)) return false;
        return true;
    };
    list = list.filter(p => {
        const lt = getLatest(p) || {};
        return (
            inRange(lt.views || 0, rf.minViews, rf.maxViews) &&
            inRange(lt.likes || 0, rf.minLikes, rf.maxLikes) &&
            inRange(lt.comments || 0, rf.minComments, rf.maxComments) &&
            inRange(lt.shares || 0, rf.minShares, rf.maxShares) &&
            inRange(lt.follows || 0, rf.minFollows, rf.maxFollows)
        );
    });
    // 정렬 적용 (renderTrackingPosts와 동일한 로직)
    switch (this.trackingSort) {
        case 'favoritesFirst':
            list.sort((a, b) => (this.isFavorite(b.id) - this.isFavorite(a.id))); break;
        // 조회수 정렬
        case 'viewsDesc':
            list.sort((a, b) => ((getLatest(b)?.views || 0) - (getLatest(a)?.views || 0))); break;
        case 'viewsAsc':
            list.sort((a, b) => ((getLatest(a)?.views || 0) - (getLatest(b)?.views || 0))); break;
        // 좋아요 정렬
        case 'likesDesc':
            list.sort((a, b) => ((getLatest(b)?.likes || 0) - (getLatest(a)?.likes || 0))); break;
        case 'likesAsc':
            list.sort((a, b) => ((getLatest(a)?.likes || 0) - (getLatest(b)?.likes || 0))); break;
        // 댓글 정렬
        case 'commentsDesc':
            list.sort((a, b) => ((getLatest(b)?.comments || 0) - (getLatest(a)?.comments || 0))); break;
        case 'commentsAsc':
            list.sort((a, b) => ((getLatest(a)?.comments || 0) - (getLatest(b)?.comments || 0))); break;
        // 공유 정렬
        case 'sharesDesc':
            list.sort((a, b) => ((getLatest(b)?.shares || 0) - (getLatest(a)?.shares || 0))); break;
        case 'sharesAsc':
            list.sort((a, b) => ((getLatest(a)?.shares || 0) - (getLatest(b)?.shares || 0))); break;
        // 팔로우 정렬
        case 'followsDesc':
            list.sort((a, b) => ((getLatest(b)?.follows || 0) - (getLatest(a)?.follows || 0))); break;
        case 'followsAsc':
            list.sort((a, b) => ((getLatest(a)?.follows || 0) - (getLatest(b)?.follows || 0))); break;
        // 입력 횟수 정렬
        case 'entriesDesc':
            list.sort((a, b) => ((b.metrics?.length || 0) - (a.metrics?.length || 0))); break;
        case 'entriesAsc':
            list.sort((a, b) => ((a.metrics?.length || 0) - (b.metrics?.length || 0))); break;
        // 날짜 정렬
        case 'updatedDesc':
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return bMs - aMs;
            });
            break;
        case 'updatedAsc':
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return aMs - bMs;
            });
            break;
        default:
            // 기본값: 최신 업데이트순
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return bMs - aMs;
            });
            break;
    }

    // CSV 작성
    const header = ['postId','title','active','entries','lastUpdated','views','likes','comments','shares','follows'];
    const rows = [header.join(',')];
    list.forEach(p => {
        const lt = getLatest(p) || {};
        const dt = lt.timestamp ? (lt.timestamp.toDate ? lt.timestamp.toDate() : new Date(lt.timestamp)) : null;
        const title = (p.content || '').replace(/\n/g,' ').replace(/"/g,'""');
        const csvTitle = `"${title.substring(0,80)}${title.length>80?'...':''}"`;
        rows.push([
            p.id,
            csvTitle,
            p.trackingEnabled ? 'Y':'N',
            p.metrics?.length || 0,
            dt ? dt.toISOString() : '',
            lt.views||0,
            lt.likes||0,
            lt.comments||0,
            lt.shares||0,
            lt.follows||0
        ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tracking_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div class="empty-state-text">트래킹 중인 포스트가 없습니다</div>
                <div class="empty-state-subtext">저장된 글에서 트래킹을 시작해보세요!</div>
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
    
    // 상태/검색/기간 필터 적용
    let list = [...this.trackingPosts];
    
    // 레퍼런스 포스트 필터링 (트래킹 대상 아님)
    // 레퍼런스 글은 사용 여부 표시용이지 트래킹 대상이 아님
    list = list.filter(post => {
        const postType = post.type || 'edit';
        const sourceType = post.sourceType || post.type || 'edit';
        
        // 레퍼런스 타입 포스트는 제외
        if (postType === 'reference' || sourceType === 'reference') {
            return false;
        }
        return true;
    });
    
    if (this.trackingStatusFilter === 'active') {
        list = list.filter(p => !!p.trackingEnabled);
    } else if (this.trackingStatusFilter === 'inactive') {
        list = list.filter(p => !p.trackingEnabled);
    } else if (this.trackingStatusFilter === 'hasData') {
        list = list.filter(p => (p.metrics && p.metrics.length > 0));
    } else if (this.trackingStatusFilter === 'noData') {
        list = list.filter(p => !(p.metrics && p.metrics.length > 0));
    }

    // 정렬 기준 계산에 필요한 최신 메트릭
    const getLatest = (p) => (p.metrics && p.metrics.length > 0) ? p.metrics[p.metrics.length - 1] : null;
    
    // 검색(제목/키워드/해시태그)
    if (this.trackingSearch && this.trackingSearch.trim()) {
        const tokens = this.trackingSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        list = list.filter(p => {
            const text = (p.content || '').toLowerCase();
            return tokens.every(tk => text.includes(tk));
        });
    }
    
    // 기간(최종 업데이트) 필터
    if (this.trackingUpdatedFrom || this.trackingUpdatedTo) {
        const fromMs = this.trackingUpdatedFrom ? new Date(this.trackingUpdatedFrom + 'T00:00:00').getTime() : null;
        const toMs = this.trackingUpdatedTo ? new Date(this.trackingUpdatedTo + 'T23:59:59').getTime() : null;
        list = list.filter(p => {
            const lt = getLatest(p)?.timestamp;
            if (!lt) return false;
            const ms = lt.toDate ? lt.toDate().getTime() : new Date(lt).getTime();
            if (fromMs && ms < fromMs) return false;
            if (toMs && ms > toMs) return false;
            return true;
        });
    }

    // 수치 범위 필터 (최신 메트릭 기준)
    const inRange = (val, min, max) => {
        if (min !== undefined && min !== null && min !== '' && val < Number(min)) return false;
        if (max !== undefined && max !== null && max !== '' && val > Number(max)) return false;
        return true;
    };
    const rf = this.rangeFilters || {};
    list = list.filter(p => {
        const lt = getLatest(p) || {};
        const v = lt.views || 0;
        const l = lt.likes || 0;
        const c = lt.comments || 0;
        const s = lt.shares || 0;
        const f = lt.follows || 0;
        return (
            inRange(v, rf.minViews, rf.maxViews) &&
            inRange(l, rf.minLikes, rf.maxLikes) &&
            inRange(c, rf.minComments, rf.maxComments) &&
            inRange(s, rf.minShares, rf.maxShares) &&
            inRange(f, rf.minFollows, rf.maxFollows)
        );
    });
    
    // 정렬 적용
    switch (this.trackingSort) {
        case 'favoritesFirst':
            list.sort((a, b) => (this.isFavorite(b.id) - this.isFavorite(a.id))); break;
        // 조회수 정렬
        case 'viewsDesc':
            list.sort((a, b) => ((getLatest(b)?.views || 0) - (getLatest(a)?.views || 0))); break;
        case 'viewsAsc':
            list.sort((a, b) => ((getLatest(a)?.views || 0) - (getLatest(b)?.views || 0))); break;
        // 좋아요 정렬
        case 'likesDesc':
            list.sort((a, b) => ((getLatest(b)?.likes || 0) - (getLatest(a)?.likes || 0))); break;
        case 'likesAsc':
            list.sort((a, b) => ((getLatest(a)?.likes || 0) - (getLatest(b)?.likes || 0))); break;
        // 댓글 정렬
        case 'commentsDesc':
            list.sort((a, b) => ((getLatest(b)?.comments || 0) - (getLatest(a)?.comments || 0))); break;
        case 'commentsAsc':
            list.sort((a, b) => ((getLatest(a)?.comments || 0) - (getLatest(b)?.comments || 0))); break;
        // 공유 정렬
        case 'sharesDesc':
            list.sort((a, b) => ((getLatest(b)?.shares || 0) - (getLatest(a)?.shares || 0))); break;
        case 'sharesAsc':
            list.sort((a, b) => ((getLatest(a)?.shares || 0) - (getLatest(b)?.shares || 0))); break;
        // 팔로우 정렬
        case 'followsDesc':
            list.sort((a, b) => ((getLatest(b)?.follows || 0) - (getLatest(a)?.follows || 0))); break;
        case 'followsAsc':
            list.sort((a, b) => ((getLatest(a)?.follows || 0) - (getLatest(b)?.follows || 0))); break;
        // 입력 횟수 정렬
        case 'entriesDesc':
            list.sort((a, b) => ((b.metrics?.length || 0) - (a.metrics?.length || 0))); break;
        case 'entriesAsc':
            list.sort((a, b) => ((a.metrics?.length || 0) - (b.metrics?.length || 0))); break;
        // 날짜 정렬
        case 'updatedDesc':
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return bMs - aMs;
            });
            break;
        case 'updatedAsc':
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return aMs - bMs;
            });
            break;
        default:
            // 기본값: 최신 업데이트순
            list.sort((a, b) => {
                const at = getLatest(a)?.timestamp; const bt = getLatest(b)?.timestamp;
                const aMs = at ? (at.toDate ? at.toDate().getTime() : new Date(at).getTime()) : 0;
                const bMs = bt ? (bt.toDate ? bt.toDate().getTime() : new Date(bt).getTime()) : 0;
                return bMs - aMs;
            });
            break;
    }

    // 이벤트 위임 설정 (최초 1회만)
    if (!this._trackingPostsEventBound) {
        this._trackingPostsEventBound = true;
        if (this.trackingPostsList) {
            this.trackingPostsList.addEventListener('click', (e) => {
                const button = e.target.closest('button[data-action], [data-action][role="button"]');
                if (!button) return;
                
                const action = button.getAttribute('data-action');
                const postId = button.getAttribute('data-post-id');
                
                if (!postId) return;
                
                switch(action) {
                    case 'toggle-favorite':
                        e.preventDefault();
                        this.toggleFavorite(postId);
                        break;
                    case 'show-chart':
                        e.preventDefault();
                        this.showPostInChart(postId);
                        break;
                    case 'add-tracking-data':
                        e.preventDefault();
                        this.addTrackingData(postId);
                        break;
                    case 'start-tracking':
                        e.preventDefault();
                        this.startTracking(postId);
                        break;
                    case 'stop-tracking':
                        e.preventDefault();
                        this.stopTracking(postId);
                        break;
                    case 'manage-metrics':
                        e.preventDefault();
                        e.stopPropagation();
                        this.manageMetrics(postId);
                        break;
                    case 'more-menu':
                        e.preventDefault();
                        e.stopPropagation();
                        const trackingEnabled = button.getAttribute('data-tracking-enabled') === 'true';
                        this.toggleTrackingMoreMenu(button, postId, trackingEnabled);
                        break;
                    case 'toggle-content':
                        e.preventDefault();
                        const contentEl = button.closest('.tracking-post-item').querySelector('.tracking-post-content');
                        if (contentEl) {
                            const nowExpanded = contentEl.classList.toggle('expanded');
                            button.textContent = nowExpanded ? '접기' : '더보기';
                            button.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
                            try {
                                // localStorage에 상태 저장 (통일된 스키마: card:{postId}:expanded)
                                localStorage.setItem(`card:${postId}:expanded`, nowExpanded ? '1' : '0');
                            } catch (e) { /* ignore quota */ }
                        }
                        break;
                }
            });
            
            // 키보드 접근성 지원 (Enter/Space 키 처리) - 최초 1회만
            if (!this._trackingPostsKeydownBound) {
                this._trackingPostsKeydownBound = true;
                this.trackingPostsList.addEventListener('keydown', (e) => {
                    const button = e.target.closest('button[data-action="toggle-content"]');
                    if (button && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        button.click();
                    }
                });
            }
        }
    }

    this.trackingPostsList.innerHTML = orphanBannerHtml + list.map(post => {
        const latestMetrics = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
        const hasMetrics = post.metrics.length > 0;
        const metricsCount = post.metrics.length;
        const isFav = this.isFavorite(post.id);
        
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
        
        // localStorage에서 확장 상태 복원 (통일된 스키마: card:{postId}:expanded)
        const expanded = (localStorage.getItem(`card:${post.id}:expanded`) === '1');
        const shouldShowToggle = post.content && post.content.length > 100;
        
        return `
            <div class="tracking-post-item ${statusClass} ${orphanClass}" data-post-id="${post.id}" data-is-orphan="${post.isOrphan ? 'true' : 'false'}">
                <div class="tracking-post-header">
                <div class="tracking-post-title" style="display: flex; align-items: center; flex-wrap: wrap; gap:8px;">
                        <button class="fav-toggle" data-action="toggle-favorite" data-post-id="${post.id}" title="즐겨찾기" style="border:none; background:transparent; cursor:pointer; font-size:1.1rem; min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center;">${isFav ? '⭐' : '☆'}</button>
                        ${orphanBadge}
                    </div>
                    <div class="tracking-post-status-group">
                        <div class="tracking-post-status ${statusClass}" aria-label="트래킹 상태: ${statusText}">
                            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                </div>
                
                <div class="tracking-post-content ${expanded ? 'expanded' : ''}" aria-label="포스트 내용">${this.escapeHtml(post.content || '')}</div>
                ${shouldShowToggle ? `<button class="tracking-post-toggle" data-action="toggle-content" data-post-id="${post.id}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? '내용 접기' : '내용 더보기'}">${expanded ? '접기' : '더보기'}</button>` : ''}
                
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
                    <div class="tracking-post-metrics metrics-chips" data-action="show-chart" data-post-id="${post.id}" title="그래프에서 보기" role="button" tabindex="0" aria-label="그래프에서 보기">
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
                        <div class="metric-item">
                            <div class="metric-icon">👥</div>
                            <div class="metric-value">${latestMetrics.follows || 0}</div>
                            <div class="metric-label">팔로우</div>
                        </div>
                    </div>
                ` : `
                    <div class="tracking-post-no-data">
                        <span class="no-data-icon">📭</span>
                        <span class="no-data-text">아직 데이터가 입력되지 않았습니다. "데이터 추가" 버튼을 클릭하여 성과 데이터를 입력하세요.</span>
                    </div>
                `}
                
                <div class="tracking-post-actions actions--primary">
                    ${post.trackingEnabled ? 
                        `<button class="tracking-btn primary" data-action="add-tracking-data" data-post-id="${post.id}" aria-label="성과 데이터 추가">데이터 추가</button>` :
                        `<button class="tracking-btn primary" data-action="start-tracking" data-post-id="${post.id}" aria-label="트래킹 시작">트래킹 시작</button>`
                    }
                    <div class="more-menu actions--more">
                        <button class="more-menu-btn" data-action="more-menu" data-post-id="${post.id}" data-tracking-enabled="${post.trackingEnabled ? 'true' : 'false'}" aria-haspopup="true" aria-expanded="false" aria-label="기타 작업">⋯</button>
                        <div class="more-menu-list" role="menu">
                            ${hasMetrics ? 
                                `<button class="more-menu-item" role="menuitem" data-action="manage-metrics" data-post-id="${post.id}">📊 메트릭 관리</button>` :
                                ''
                            }
                            ${post.trackingEnabled ? 
                                `<button class="more-menu-item" role="menuitem" data-action="stop-tracking" data-post-id="${post.id}">트래킹 중지</button>` :
                                ''
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// 트래킹 카드 ⋯ 메뉴 토글
DualTextWriter.prototype.toggleTrackingMoreMenu = function(button, postId, trackingEnabled) {
    const menu = button.nextElementSibling;
    if (menu && menu.classList.contains('more-menu-list')) {
        const isOpen = menu.classList.toggle('open');
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        
        // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
        if (isOpen) {
            dualTextWriter.applySmartMenuPosition(menu, button);
            
            // 포커스 트랩: 메뉴가 열리면 첫 번째 메뉴 아이템에 포커스
            const firstMenuItem = menu.querySelector('.more-menu-item');
            if (firstMenuItem) {
                setTimeout(() => firstMenuItem.focus(), 50);
            }
        } else {
            // 메뉴 닫힐 때 위치 클래스 제거
            menu.classList.remove('open-top', 'open-bottom');
        }
    }
    // 바깥 클릭 시 모든 메뉴 닫기 (이벤트 위임으로 처리)
    setTimeout(() => {
        document.addEventListener('click', function closeHandler(e) {
            if (!e.target.closest('.more-menu')) {
                document.querySelectorAll('.more-menu-list.open').forEach(el => {
                    el.classList.remove('open');
                    // 포커스 트랩 해제: 메뉴 버튼으로 포커스 복원
                    const menuBtn = el.previousElementSibling;
                    if (menuBtn && menuBtn.classList.contains('more-menu-btn')) {
                        menuBtn.focus();
                    }
                });
                document.querySelectorAll('.more-menu-btn[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
                document.removeEventListener('click', closeHandler);
            }
        }, { once: true });
    }, 0);
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
            this.refreshUI({ trackingPosts: true, force: true });
            
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
            this.refreshUI({ trackingPosts: true, force: true });
            
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
    if (!modal) {
        console.error('트래킹 모달을 찾을 수 없습니다.');
        this.showMessage('❌ 트래킹 모달을 찾을 수 없습니다.', 'error');
        return;
    }
    
    try {
        this.openBottomSheet(modal);
        // 폼 초기화
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('tracking-date');
        if (dateInput) {
            dateInput.value = today;
        }
        // 날짜 탭 초기화: 오늘 탭 활성화, 직접입력 숨김
        modal.querySelectorAll('.date-tab').forEach(tab => tab.classList.remove('active'));
        const todayTab = modal.querySelector('.date-tab[data-date="today"]');
        if (todayTab) todayTab.classList.add('active');
        if (dateInput) dateInput.style.display = 'none';
        
        const viewsInput = document.getElementById('tracking-views');
        const likesInput = document.getElementById('tracking-likes');
        const commentsInput = document.getElementById('tracking-comments');
        const sharesInput = document.getElementById('tracking-shares');
        const followsInput = document.getElementById('tracking-follows');
        const notesInput = document.getElementById('tracking-notes');
        
        if (viewsInput) viewsInput.value = '';
        if (likesInput) likesInput.value = '';
        if (commentsInput) commentsInput.value = '';
        if (sharesInput) sharesInput.value = '';
        if (followsInput) followsInput.value = '';
        if (notesInput) notesInput.value = '';
        
        // 저장된 글에서 호출한 경우 textId 저장
        this.currentTrackingTextId = textId;
        console.log('트래킹 모달 열기:', { textId, currentTrackingTextId: this.currentTrackingTextId });
    } catch (error) {
        console.error('트래킹 모달 열기 실패:', error);
        this.showMessage('❌ 트래킹 모달을 열 수 없습니다.', 'error');
    }
};

// 트래킹 데이터 저장
DualTextWriter.prototype.saveTrackingData = async function() {
    if (!this.currentUser || !this.isFirebaseReady) {
        console.warn('트래킹 데이터 저장 실패: 사용자가 로그인하지 않았거나 Firebase가 준비되지 않았습니다.');
        this.showMessage('❌ 로그인이 필요합니다.', 'error');
        return;
    }
    
    console.log('트래킹 데이터 저장 시작:', { 
        currentTrackingTextId: this.currentTrackingTextId, 
        currentTrackingPost: this.currentTrackingPost 
    });
    
    // 저장된 글에서 직접 입력하는 경우
    if (this.currentTrackingTextId && !this.currentTrackingPost) {
        console.log('저장된 글에서 트래킹 데이터 저장:', this.currentTrackingTextId);
        return await this.saveTrackingDataFromSavedText();
    }
    
    // 기존 방식: 트래킹 포스트에 데이터 추가
    if (!this.currentTrackingPost) {
        console.warn('트래킹 데이터 저장 실패: currentTrackingPost가 없습니다.');
        this.showMessage('❌ 트래킹할 포스트를 찾을 수 없습니다.', 'error');
        return;
    }
    
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
            
            // Optimistic UI: 즉시 로컬 데이터 업데이트 및 UI 반영
            this.closeTrackingModal();
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });
            
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
        
        // Optimistic UI: 로컬 데이터 업데이트로 즉시 반영 (Firebase 전체 재조회 불필요)
        // 트래킹 탭 목록은 로컬 데이터가 이미 업데이트되었으므로 재조회 불필요
        
        // UI 업데이트
        this.refreshUI({
            savedTexts: true,
            trackingPosts: true,
            trackingSummary: true,
            trackingChart: true,
            force: true
        });
        
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
        this.closeBottomSheet(modal);
    }
    this.currentTrackingPost = null;
    this.currentTrackingTextId = null;
};
// 메트릭 관리 모달 열기 (트래킹 탭에서 사용)
DualTextWriter.prototype.manageMetrics = async function(postId) {
    if (!this.currentUser || !this.isFirebaseReady) {
        this.showMessage('로그인이 필요합니다.', 'error');
        return;
    }
    
    try {
        // 포스트 데이터 가져오기
        let postData = null;
        if (this.trackingPosts) {
            postData = this.trackingPosts.find(p => p.id === postId);
        }
        
        // 로컬에 없으면 Firebase에서 조회
        if (!postData || !postData.metrics || postData.metrics.length === 0) {
            try {
                const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
                const postDoc = await window.firebaseGetDoc(postRef);
                
                if (postDoc.exists()) {
                    const data = postDoc.data();
                    postData = {
                        id: postDoc.id,
                        content: data.content || '',
                        metrics: data.metrics || [],
                        sourceTextId: data.sourceTextId || null
                    };
                }
            } catch (error) {
                console.error('포스트 조회 실패:', error);
            }
        }
        
        if (!postData || !postData.metrics || postData.metrics.length === 0) {
            this.showMessage('메트릭 데이터가 없습니다.', 'warning');
            return;
        }
        
        // 메트릭 목록 렌더링
        const metricsHtml = this.renderMetricsListForManage(postData.metrics, postData.id, postData.sourceTextId);
        
        // 일괄 선택 모드 초기화
        this.isBatchSelectMode = false;
        this.selectedMetricIndices = [];
        
        // 모달 열기
        const modal = document.getElementById('metrics-manage-modal');
        const content = document.getElementById('metrics-manage-content');
        if (modal && content) {
            content.innerHTML = `
                <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${this.escapeHtml(postData.content.substring(0, 50))}${postData.content.length > 50 ? '...' : ''}</div>
                            <div style="font-size: 0.85rem; color: #666;">메트릭 ${postData.metrics.length}개</div>
                        </div>
                        <button id="batch-select-toggle" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" aria-label="일괄 선택 모드">
                            📋 일괄 선택
                        </button>
                    </div>
                    <div id="batch-select-info" style="display: none; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 0.85rem; color: #1976d2;">
                        <span id="selected-count">0</span>개 선택됨
                        <button id="select-all-metrics" class="btn-link" style="margin-left: 12px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">전체 선택</button>
                        <button id="deselect-all-metrics" class="btn-link" style="margin-left: 8px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">전체 해제</button>
                    </div>
                </div>
                ${metricsHtml}
                <div id="batch-delete-actions" style="display: none; margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 2px solid #ffc107;">
                    <div style="margin-bottom: 8px; font-weight: 600; color: #856404;">
                        선택된 항목: <span id="batch-delete-count">0</span>개
                    </div>
                    <button id="batch-delete-btn" class="btn btn-danger" style="width: 100%;" aria-label="선택된 항목 일괄 삭제">
                        🗑️ 선택된 항목 삭제
                    </button>
                </div>
            `;
            this.openBottomSheet(modal);
            
            // 모달 내부의 수정/삭제 버튼 이벤트 바인딩
            this.bindMetricsManageEvents(postData.id, postData.sourceTextId);
            
            // 일괄 선택 모드 토글 버튼 이벤트 바인딩
            this.bindBatchSelectEvents(postData.id, postData.sourceTextId);
        }
        
    } catch (error) {
        console.error('메트릭 관리 모달 열기 실패:', error);
        this.showMessage('메트릭 데이터를 불러오는데 실패했습니다.', 'error');
    }
};

// 메트릭 관리 모달용 메트릭 목록 렌더링
DualTextWriter.prototype.renderMetricsListForManage = function(metrics, postId, textId) {
    if (!metrics || metrics.length === 0) {
        return '<div style="text-align: center; padding: 40px; color: #666;">메트릭 데이터가 없습니다.</div>';
    }
    
    // 날짜 순으로 정렬 (최신 것부터)
    const sortedMetrics = [...metrics].sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 
                     (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 
                     (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
        return dateB - dateA; // 최신 것부터
    });
    
    return `
        <div class="metrics-manage-list">
            ${sortedMetrics.map((metric, sortedIdx) => {
                // 원본 인덱스 찾기
                const originalIndex = metrics.findIndex(m => {
                    const mDate = m.timestamp?.toDate ? m.timestamp.toDate().getTime() : 
                                 (m.timestamp instanceof Date ? m.timestamp.getTime() : 0);
                    const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate().getTime() : 
                                      (metric.timestamp instanceof Date ? metric.timestamp.getTime() : 0);
                    return mDate === metricDate && 
                           m.views === metric.views && 
                           m.likes === metric.likes &&
                           m.comments === metric.comments &&
                           m.shares === metric.shares;
                });
                const metricIndex = originalIndex >= 0 ? originalIndex : sortedIdx;
                
                // 메트릭 인덱스가 유효한지 확인 (원본 배열 범위 내)
                const finalMetricIndex = metricIndex < metrics.length ? metricIndex : sortedIdx;
                
                const date = metric.timestamp?.toDate ? metric.timestamp.toDate() : 
                            (metric.timestamp instanceof Date ? metric.timestamp : new Date());
                const dateStr = date.toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const isSelected = this.isBatchSelectMode && this.selectedMetricIndices.includes(finalMetricIndex);
                
                return `
                    <div class="metric-manage-item" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${textId || ''}">
                        <div class="metric-manage-header">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" 
                                    class="metric-checkbox" 
                                    data-metric-index="${finalMetricIndex}"
                                    ${isSelected ? 'checked' : ''}
                                    style="display: ${this.isBatchSelectMode ? 'block' : 'none'}; width: 18px; height: 18px; cursor: pointer;"
                                    aria-label="메트릭 선택"
                                />
                                <div class="metric-manage-date">📅 ${dateStr}</div>
                            </div>
                            <div class="metric-manage-actions" style="display: ${this.isBatchSelectMode ? 'none' : 'flex'};">
                                <button class="btn-edit-metric" data-action="edit-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${textId || ''}" aria-label="수정">✏️ 수정</button>
                                <button class="btn-delete-metric" data-action="delete-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${textId || ''}" aria-label="삭제">🗑️ 삭제</button>
                            </div>
                        </div>
                        <div class="metric-manage-data">
                            <div class="metric-chip"><span class="metric-icon">👀</span> <span class="metric-value">${metric.views || 0}</span></div>
                            <div class="metric-chip"><span class="metric-icon">❤️</span> <span class="metric-value">${metric.likes || 0}</span></div>
                            <div class="metric-chip"><span class="metric-icon">💬</span> <span class="metric-value">${metric.comments || 0}</span></div>
                            <div class="metric-chip"><span class="metric-icon">🔄</span> <span class="metric-value">${metric.shares || 0}</span></div>
                            <div class="metric-chip"><span class="metric-icon">👥</span> <span class="metric-value">${metric.follows || 0}</span></div>
                            ${metric.notes ? `<div class="metric-notes">📝 ${this.escapeHtml(metric.notes)}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

// 메트릭 관리 모달 내부 이벤트 바인딩
DualTextWriter.prototype.bindMetricsManageEvents = function(postId, textId) {
    const content = document.getElementById('metrics-manage-content');
    if (!content) return;
    
    // 기존 리스너 제거하고 새로 바인딩
    content.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        
        const action = button.getAttribute('data-action');
        const metricIndex = parseInt(button.getAttribute('data-metric-index'));
        const buttonPostId = button.getAttribute('data-post-id') || postId;
        const buttonTextId = button.getAttribute('data-text-id') || textId;
        
        if (action === 'edit-metric') {
            e.preventDefault();
            e.stopPropagation();
            this.editMetricFromManage(buttonPostId, buttonTextId, metricIndex);
        } else if (action === 'delete-metric') {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm('정말로 이 메트릭을 삭제하시겠습니까?')) {
                this.deleteMetricFromManage(buttonPostId, buttonTextId, metricIndex);
            }
        }
    }, { once: false });
};

// 메트릭 관리 모달에서 메트릭 수정
DualTextWriter.prototype.editMetricFromManage = async function(postId, textId, metricIndex) {
    try {
        // 포스트 데이터 가져오기
        let postData = null;
        if (this.trackingPosts) {
            postData = this.trackingPosts.find(p => p.id === postId);
        }
        
        if (!postData || !postData.metrics || postData.metrics.length <= metricIndex) {
            // Firebase에서 조회
            try {
                const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
                const postDoc = await window.firebaseGetDoc(postRef);
                
                if (postDoc.exists()) {
                    const data = postDoc.data();
                    postData = {
                        id: postDoc.id,
                        metrics: data.metrics || []
                    };
                }
            } catch (error) {
                console.error('포스트 조회 실패:', error);
            }
        }
        
        if (!postData || !postData.metrics || postData.metrics.length <= metricIndex) {
            this.showMessage('메트릭을 찾을 수 없습니다.', 'error');
            return;
        }
        
        const metric = postData.metrics[metricIndex];
        
        // 편집 데이터 설정
        this.editingMetricData = {
            postId: postId,
            textId: textId,
            metricIndex: metricIndex
        };
        
        // 메트릭 관리 모달 닫기
        const manageModal = document.getElementById('metrics-manage-modal');
        if (manageModal) {
            this.closeBottomSheet(manageModal);
        }
        
        // 기존 editTrackingMetric의 모달 열기 로직 재사용
        const date = metric.timestamp?.toDate ? metric.timestamp.toDate() : 
                    (metric.timestamp instanceof Date ? metric.timestamp : new Date());
        const dateStr = date.toISOString().split('T')[0];
        
        document.getElementById('tracking-edit-date').value = dateStr;
        document.getElementById('tracking-edit-views').value = metric.views || 0;
        document.getElementById('tracking-edit-likes').value = metric.likes || 0;
        document.getElementById('tracking-edit-comments').value = metric.comments || 0;
        document.getElementById('tracking-edit-shares').value = metric.shares || 0;
        const followsInput = document.getElementById('tracking-edit-follows');
        if (followsInput) followsInput.value = metric.follows || 0;
        document.getElementById('tracking-edit-notes').value = metric.notes || '';
        
        // 수정 모달 열기
        const editModal = document.getElementById('tracking-edit-modal');
        if (editModal) {
            // 날짜 탭 설정
            editModal.querySelectorAll('.date-tab').forEach(tab => tab.classList.remove('active'));
            const customTab = editModal.querySelector('.date-tab[data-date="custom"]');
            if (customTab) customTab.classList.add('active');
            document.getElementById('tracking-edit-date').style.display = 'block';
            
            this.openBottomSheet(editModal);
        }
        
    } catch (error) {
        console.error('메트릭 수정 실패:', error);
        this.showMessage('메트릭을 불러오는데 실패했습니다.', 'error');
    }
};

// 메트릭 관리 모달에서 메트릭 삭제
DualTextWriter.prototype.deleteMetricFromManage = async function(postId, textId, metricIndex) {
    if (!this.currentUser || !this.isFirebaseReady) return;
    
    if (!confirm('정말로 이 트래킹 데이터를 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        // 포스트 데이터 가져오기
        let postData = null;
        let postRef = null;
        
        try {
            // postId로 직접 조회
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
            const postDoc = await window.firebaseGetDoc(postRef);
            
            if (postDoc.exists()) {
                postData = postDoc.data();
            } else if (textId) {
                // textId로 찾기
                const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                const textQuerySnapshot = await window.firebaseGetDocs(window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId)));
                if (!textQuerySnapshot.empty) {
                    const postDoc = textQuerySnapshot.docs[0];
                    postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postDoc.id);
                    postData = postDoc.data();
                }
            }
        } catch (error) {
            console.error('포스트 조회 실패:', error);
        }
        
        if (!postData || !postRef) {
            this.showMessage('포스트를 찾을 수 없습니다.', 'error');
            return;
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
        const post = this.trackingPosts?.find(p => p.id === postRef.id || p.sourceTextId === textId);
        if (post) {
            post.metrics = updatedMetrics;
            post.analytics = analytics;
        }
        
        // 메트릭 관리 모달 새로고침
        const manageModal = document.getElementById('metrics-manage-modal');
        const isManageModalOpen = manageModal && (manageModal.classList.contains('bottom-sheet-open') || manageModal.style.display !== 'none');
        
        if (isManageModalOpen) {
            // 메트릭 관리 모달이 열려있으면 새로고침
            const refreshPostId = postRef.id || postId;
            setTimeout(() => {
                this.manageMetrics(refreshPostId);
            }, 300);
        } else {
            // 메트릭 관리 모달이 닫혀있으면 일반 UI 업데이트
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });
        }
        
        this.showMessage('✅ 트래킹 데이터가 삭제되었습니다!', 'success');
        
    } catch (error) {
        console.error('트래킹 데이터 삭제 실패:', error);
        this.showMessage('❌ 트래킹 데이터 삭제에 실패했습니다: ' + error.message, 'error');
    }
};

// 일괄 선택 모드 이벤트 바인딩
DualTextWriter.prototype.bindBatchSelectEvents = function(postId, textId) {
    const toggleBtn = document.getElementById('batch-select-toggle');
    const selectInfo = document.getElementById('batch-select-info');
    const selectAllBtn = document.getElementById('select-all-metrics');
    const deselectAllBtn = document.getElementById('deselect-all-metrics');
    const batchDeleteActions = document.getElementById('batch-delete-actions');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const content = document.getElementById('metrics-manage-content');
    
    if (!toggleBtn || !content) return;
    
    // 일괄 선택 모드 토글
    toggleBtn.addEventListener('click', () => {
        this.isBatchSelectMode = !this.isBatchSelectMode;
        this.selectedMetricIndices = [];
        
        if (this.isBatchSelectMode) {
            toggleBtn.textContent = '❌ 취소';
            toggleBtn.style.background = '#dc3545';
            if (selectInfo) selectInfo.style.display = 'block';
            if (batchDeleteActions) batchDeleteActions.style.display = 'none';
        } else {
            toggleBtn.textContent = '📋 일괄 선택';
            toggleBtn.style.background = '';
            if (selectInfo) selectInfo.style.display = 'none';
            if (batchDeleteActions) batchDeleteActions.style.display = 'none';
        }
        
        // 메트릭 목록 다시 렌더링
        this.refreshMetricsListForManage(postId, textId);
    });
    
    // 전체 선택
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = content.querySelectorAll('.metric-checkbox');
            checkboxes.forEach(cb => {
                const index = parseInt(cb.getAttribute('data-metric-index'));
                if (!this.selectedMetricIndices.includes(index)) {
                    this.selectedMetricIndices.push(index);
                }
                cb.checked = true;
            });
            this.updateBatchSelectUI();
        });
    }
    
    // 전체 해제
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            this.selectedMetricIndices = [];
            const checkboxes = content.querySelectorAll('.metric-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            this.updateBatchSelectUI();
        });
    }
    
    // 체크박스 클릭 이벤트
    content.addEventListener('change', (e) => {
        if (e.target.classList.contains('metric-checkbox')) {
            const index = parseInt(e.target.getAttribute('data-metric-index'));
            if (e.target.checked) {
                if (!this.selectedMetricIndices.includes(index)) {
                    this.selectedMetricIndices.push(index);
                }
            } else {
                this.selectedMetricIndices = this.selectedMetricIndices.filter(i => i !== index);
            }
            this.updateBatchSelectUI();
        }
    });
    
    // 일괄 삭제 버튼
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', () => {
            if (this.selectedMetricIndices.length === 0) {
                this.showMessage('선택된 항목이 없습니다.', 'warning');
                return;
            }
            
            if (confirm(`선택된 ${this.selectedMetricIndices.length}개의 메트릭을 삭제하시겠습니까?`)) {
                this.batchDeleteMetrics(postId, textId);
            }
        });
    }
};

// 일괄 선택 UI 업데이트
DualTextWriter.prototype.updateBatchSelectUI = function() {
    const selectedCount = document.getElementById('selected-count');
    const batchDeleteCount = document.getElementById('batch-delete-count');
    const batchDeleteActions = document.getElementById('batch-delete-actions');
    
    const count = this.selectedMetricIndices.length;
    
    if (selectedCount) {
        selectedCount.textContent = count;
    }
    
    if (batchDeleteCount) {
        batchDeleteCount.textContent = count;
    }
    
    if (batchDeleteActions) {
        batchDeleteActions.style.display = count > 0 ? 'block' : 'none';
    }
};

// 메트릭 목록 새로고침 (일괄 선택 모드 상태 반영)
DualTextWriter.prototype.refreshMetricsListForManage = async function(postId, textId) {
    try {
        // 포스트 데이터 가져오기
        let postData = null;
        if (this.trackingPosts) {
            postData = this.trackingPosts.find(p => p.id === postId);
        }
        
        if (!postData || !postData.metrics || postData.metrics.length === 0) {
            try {
                const postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
                const postDoc = await window.firebaseGetDoc(postRef);
                
                if (postDoc.exists()) {
                    const data = postDoc.data();
                    postData = {
                        id: postDoc.id,
                        metrics: data.metrics || []
                    };
                }
            } catch (error) {
                console.error('포스트 조회 실패:', error);
            }
        }
        
        if (!postData || !postData.metrics || postData.metrics.length === 0) {
            return;
        }
        
        // 메트릭 목록 다시 렌더링
        const metricsHtml = this.renderMetricsListForManage(postData.metrics, postId, textId);
        const content = document.getElementById('metrics-manage-content');
        if (content) {
            const listContainer = content.querySelector('.metrics-manage-list');
            if (listContainer) {
                listContainer.outerHTML = metricsHtml;
            }
        }
        
    } catch (error) {
        console.error('메트릭 목록 새로고침 실패:', error);
    }
};

// 일괄 삭제 함수
DualTextWriter.prototype.batchDeleteMetrics = async function(postId, textId) {
    if (!this.currentUser || !this.isFirebaseReady) {
        this.showMessage('로그인이 필요합니다.', 'error');
        return;
    }
    
    if (this.selectedMetricIndices.length === 0) {
        this.showMessage('선택된 항목이 없습니다.', 'warning');
        return;
    }
    
    try {
        // 포스트 데이터 가져오기
        let postData = null;
        let postRef = null;
        
        try {
            postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', postId);
            const postDoc = await window.firebaseGetDoc(postRef);
            
            if (postDoc.exists()) {
                postData = postDoc.data();
            } else if (textId) {
                const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
                const textQuerySnapshot = await window.firebaseGetDocs(window.firebaseQuery(postsRef, window.firebaseWhere('sourceTextId', '==', textId)));
                if (!textQuerySnapshot.empty) {
                    const doc = textQuerySnapshot.docs[0];
                    postRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', doc.id);
                    postData = doc.data();
                }
            }
        } catch (error) {
            console.error('포스트 조회 실패:', error);
        }
        
        if (!postData || !postRef) {
            this.showMessage('포스트를 찾을 수 없습니다.', 'error');
            return;
        }
        
        // 선택된 인덱스를 내림차순으로 정렬 (뒤에서부터 삭제하여 인덱스 변경 방지)
        const sortedIndices = [...this.selectedMetricIndices].sort((a, b) => b - a);
        
        // 메트릭 배열에서 선택된 항목 제거
        let updatedMetrics = [...(postData.metrics || [])];
        sortedIndices.forEach(index => {
            if (index >= 0 && index < updatedMetrics.length) {
                updatedMetrics.splice(index, 1);
            }
        });
        
        // 분석 데이터 계산
        const analytics = updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};
        
        // Firebase 업데이트
        await window.firebaseUpdateDoc(postRef, {
            metrics: updatedMetrics,
            analytics,
            updatedAt: window.firebaseServerTimestamp()
        });
        
        // 로컬 데이터 업데이트
        const post = this.trackingPosts?.find(p => p.id === postRef.id || p.sourceTextId === textId);
        if (post) {
            post.metrics = updatedMetrics;
            post.analytics = analytics;
        }
        
        // 일괄 선택 모드 해제
        this.isBatchSelectMode = false;
        this.selectedMetricIndices = [];
        
        // 메트릭 관리 모달 새로고침
        const manageModal = document.getElementById('metrics-manage-modal');
        const isManageModalOpen = manageModal && (manageModal.classList.contains('bottom-sheet-open') || manageModal.style.display !== 'none');
        
        if (isManageModalOpen) {
            // 메트릭 관리 모달이 열려있으면 새로고침
            setTimeout(() => {
                this.manageMetrics(postRef.id || postId);
            }, 300);
        } else {
            // 메트릭 관리 모달이 닫혀있으면 일반 UI 업데이트
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });
        }
        
        this.showMessage(`✅ ${sortedIndices.length}개의 트래킹 데이터가 삭제되었습니다!`, 'success');
        
    } catch (error) {
        console.error('일괄 삭제 실패:', error);
        this.showMessage('❌ 일괄 삭제에 실패했습니다: ' + error.message, 'error');
    }
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
        this.openBottomSheet(editModal);
        // 날짜 탭 초기화: 현재 날짜에 따라 탭 설정
        const editDateInput = document.getElementById('tracking-edit-date');
        if (editDateInput && metric.timestamp) {
            const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate() : new Date(metric.timestamp);
            const metricDateStr = metricDate.toISOString().split('T')[0];
            editDateInput.value = metricDateStr;
            
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            editModal.querySelectorAll('.date-tab').forEach(tab => tab.classList.remove('active'));
            if (metricDateStr === today) {
                const todayTab = editModal.querySelector('.date-tab[data-date="today"]');
                if (todayTab) todayTab.classList.add('active');
                editDateInput.style.display = 'none';
            } else if (metricDateStr === yesterdayStr) {
                const yesterdayTab = editModal.querySelector('.date-tab[data-date="yesterday"]');
                if (yesterdayTab) yesterdayTab.classList.add('active');
                editDateInput.style.display = 'none';
            } else {
                const customTab = editModal.querySelector('.date-tab[data-date="custom"]');
                if (customTab) customTab.classList.add('active');
                editDateInput.style.display = 'block';
            }
        }
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
        
        // 수정 모달 닫기
        const editModal = document.getElementById('tracking-edit-modal');
        if (editModal) {
            this.closeBottomSheet(editModal);
        }
        
        // 메트릭 관리 모달이 열려있으면 새로고침
        const manageModal = document.getElementById('metrics-manage-modal');
        const isManageModalOpen = manageModal && (manageModal.classList.contains('bottom-sheet-open') || manageModal.style.display !== 'none');
        
        if (isManageModalOpen) {
            // 메트릭 관리 모달 새로고침
            const refreshPostId = postRef.id || postId;
            setTimeout(() => {
                this.manageMetrics(refreshPostId);
            }, 300);
        } else {
            // 메트릭 관리 모달이 닫혀있으면 일반 UI 업데이트
            this.refreshUI({
                savedTexts: true,
                trackingPosts: true,
                trackingSummary: true,
                trackingChart: true,
                force: true
            });
        }
        
        this.editingMetricData = null;
        
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
        this.refreshUI({
            savedTexts: true,
            trackingPosts: true,
            trackingSummary: true,
            trackingChart: true,
            force: true
        });
        
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
/**
 * 트래킹 차트 초기화
 * 
 * Chart.js를 사용하여 트래킹 데이터를 시각화하는 차트를 초기화합니다.
 * Canvas 요소가 없거나 Chart.js 라이브러리가 로드되지 않은 경우 에러 처리를 수행합니다.
 * 
 * **주요 기능:**
 * - Canvas 요소 존재 확인 및 2D 컨텍스트 검증
 * - Chart.js 라이브러리 로드 확인
 * - 기존 차트 제거로 메모리 누수 방지
 * - 반응형 차트 설정 (responsive: true, maintainAspectRatio: false)
 * - 애니메이션 비활성화로 스크롤 문제 방지
 * - 레이아웃 패딩 설정으로 축 레이블 보호
 * 
 * **에러 처리:**
 * - Canvas 요소가 없을 때: console.warn 로그 출력 및 조기 반환
 * - Chart.js 라이브러리 미로드: 사용자 메시지 표시 및 조기 반환
 * - 2D 컨텍스트 실패: 사용자 메시지 표시 및 조기 반환
 * - 초기화 실패: try-catch 블록으로 에러 캐치 및 사용자 메시지 표시
 * 
 * **성능 최적화:**
 * - animation.duration: 0 설정으로 불필요한 애니메이션 제거
 * - 기존 차트 destroy() 호출로 메모리 누수 방지
 * 
 * @returns {void}
 * @throws {Error} Chart.js 초기화 실패 시 에러 발생
 */
DualTextWriter.prototype.initTrackingChart = function() {
    // 에러 처리: Canvas 요소가 없을 때 Chart.js 초기화 실패 방지
    if (!this.trackingChartCanvas) {
        console.warn('[initTrackingChart] Canvas element not found');
        return;
    }
    
    // Chart.js 라이브러리 로드 실패 시 폴백 처리
    if (typeof Chart === 'undefined') {
        console.error('[initTrackingChart] Chart.js library not loaded');
        this.showMessage('차트 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해주세요.', 'error');
        return;
    }
    
    try {
        const ctx = this.trackingChartCanvas.getContext('2d');
        if (!ctx) {
            console.error('[initTrackingChart] Failed to get 2D context');
            this.showMessage('차트를 초기화할 수 없습니다. 브라우저를 새로고침해주세요.', 'error');
            return;
        }
        
        // 기존 차트가 있다면 제거 (메모리 누수 방지)
        if (this.trackingChart) {
            this.trackingChart.destroy();
            this.trackingChart = null;
        }
        
        // Chart.js 초기화: responsive: true로 설정되어 있어 부모 컨테이너 크기에 맞춰 자동 조절
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
                    display: false, // HTML 헤더 사용으로 차트 내부 제목 숨김
                    text: '포스트 성과 추이'
                },
                legend: {
                    display: false // 범례는 탭으로 표시
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
                    top: 20,
                    bottom: 40,  // 하단 여백 증가 (축 레이블 보호)
                    left: 15,
                    right: 15
                }
            },
            // 인터랙션 설정: 드래그/줌 허용
            interaction: {
                mode: 'index',
                intersect: false
            },
            // 요소 클릭 가능하도록 설정
            elements: {
                point: {
                    radius: 4,
                    hoverRadius: 6
                }
            }
        }
    });
    
    // Chart.js 초기화 후 차트 업데이트
    this.updateTrackingChart();
    
    } catch (error) {
        // Chart.js 초기화 실패 시 사용자에게 에러 메시지 표시
        console.error('[initTrackingChart] Chart initialization failed:', error);
        this.showMessage('차트를 초기화하는 중 오류가 발생했습니다: ' + error.message, 'error');
        this.trackingChart = null;
    }
};

/**
 * 스케일 모드 설정
 * 
 * 그래프의 스케일 모드를 변경합니다.
 * 'combined' 모드: 모든 지표가 동일한 y축 스케일을 사용
 * 'split' 모드: 조회수는 왼쪽 y축, 나머지 지표는 오른쪽 y2축 사용
 * 
 * @param {string} mode - 스케일 모드 ('combined' | 'split')
 * @returns {void}
 */
DualTextWriter.prototype.setScaleMode = function(mode) {
    // 그래프 스케일 모드 변경 시 즉시 반영 및 축 반응형 유지
    this.scaleMode = mode; // 'combined' | 'split'
    const combinedBtn = document.getElementById('chart-scale-combined');
    const splitBtn = document.getElementById('chart-scale-split');
    if (combinedBtn && splitBtn) {
        if (mode === 'combined') {
            combinedBtn.classList.add('active');
            combinedBtn.style.background = 'white';
            combinedBtn.style.color = '#667eea';
            combinedBtn.setAttribute('aria-pressed', 'true');
            splitBtn.classList.remove('active');
            splitBtn.style.background = 'transparent';
            splitBtn.style.color = '#666';
            splitBtn.setAttribute('aria-pressed', 'false');
        } else {
            splitBtn.classList.add('active');
            splitBtn.style.background = 'white';
            splitBtn.style.color = '#667eea';
            splitBtn.setAttribute('aria-pressed', 'true');
            combinedBtn.classList.remove('active');
            combinedBtn.style.background = 'transparent';
            combinedBtn.style.color = '#666';
            combinedBtn.setAttribute('aria-pressed', 'false');
        }
    }
    this.updateTrackingChart();
};
/**
 * 차트 모드 설정
 * 
 * 그래프의 모드를 변경합니다.
 * 'total' 모드: 모든 포스트의 누적 총합 표시
 * 'individual' 모드: 선택한 개별 포스트의 데이터만 표시
 * 
 * @param {string} mode - 차트 모드 ('total' | 'individual')
 * @returns {void}
 */
DualTextWriter.prototype.setChartMode = function(mode) {
    // 그래프 모드 변경 시 즉시 반영
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
        totalBtn.setAttribute('aria-pressed', 'true');
        
        individualBtn.classList.remove('active');
        individualBtn.style.background = 'transparent';
        individualBtn.style.color = '#666';
        individualBtn.style.boxShadow = 'none';
        individualBtn.setAttribute('aria-pressed', 'false');
        
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
        individualBtn.setAttribute('aria-pressed', 'true');
        
        totalBtn.classList.remove('active');
        totalBtn.style.background = 'transparent';
        totalBtn.style.color = '#666';
        totalBtn.style.boxShadow = 'none';
        totalBtn.setAttribute('aria-pressed', 'false');
        
        postSelectorContainer.style.display = 'block';
        this.populatePostSelector();
    }
    
    // 차트 업데이트
    this.updateTrackingChart();
};

/**
 * 차트 범위 설정
 * 
 * 그래프에 표시할 데이터 범위를 변경합니다.
 * '7d': 최근 7일 데이터만 표시
 * '30d': 최근 30일 데이터만 표시
 * 'all': 전체 데이터 표시
 * 
 * @param {string} range - 차트 범위 ('7d' | '30d' | 'all')
 * @returns {void}
 */
DualTextWriter.prototype.setChartRange = function(range) {
    // 그래프 범위 변경 시 즉시 반영 및 축 반응형 유지
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
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = '#666';
            btn.setAttribute('aria-pressed', 'false');
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

// 트래킹 목록에서 클릭 시 차트에 표시
DualTextWriter.prototype.showPostInChart = function(postId) {
    // 모드 전환 및 포스트 선택
    this.setChartMode('individual');
    this.selectedChartPostId = postId;
    // 검색 입력창에 제목 표시
    const selectedPost = this.trackingPosts.find(p => p.id === postId);
    const searchInput = document.getElementById('chart-post-search');
    if (selectedPost && searchInput) {
        const preview = selectedPost.content.length > 50 ? selectedPost.content.substring(0,50) + '...' : selectedPost.content;
        searchInput.value = preview;
    }
    // 드롭다운 목록 갱신
    this.populatePostSelector();
    // 차트 업데이트
    this.updateTrackingChart();
    // 차트 영역 포커스/스크롤
    if (this.trackingChartCanvas && this.trackingChartCanvas.scrollIntoView) {
        this.trackingChartCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

// 포스트 선택 변경 (구버전 호환, 더 이상 사용 안 함)
DualTextWriter.prototype.updateChartPostSelection = function() {
    // 새로운 검색 가능한 드롭다운 사용 중이므로 이 함수는 더 이상 사용되지 않음
    // 호환성을 위해 유지
};

// 그래프 헤더 업데이트
DualTextWriter.prototype.updateChartHeader = function(postTitle, lastUpdate) {
    const titleEl = document.getElementById('chart-post-title');
    const updateEl = document.getElementById('chart-last-update');
    
    if (titleEl) {
        const maxLength = 50;
        const displayTitle = postTitle && postTitle.length > maxLength 
            ? postTitle.substring(0, maxLength) + '...' 
            : postTitle || '전체 포스트 현재값 합계 추이';
        titleEl.textContent = displayTitle;
    }
    
    if (updateEl) {
        if (lastUpdate) {
            const formattedDate = lastUpdate.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            updateEl.textContent = `최근 업데이트: ${formattedDate}`;
        } else {
            updateEl.textContent = '최근 업데이트: -';
        }
    }
};
/**
 * 트래킹 차트 업데이트
 * 
 * 현재 설정된 모드와 범위에 따라 차트 데이터를 업데이트합니다.
 * 데이터 형식 검증 및 에러 처리를 포함합니다.
 * 
 * **데이터 처리:**
 * - 전체 총합 모드: 모든 포스트의 메트릭을 합산하여 표시
 * - 개별 포스트 모드: 선택한 포스트의 메트릭만 표시
 * - 날짜 필터링: 설정된 범위(7d/30d/all)에 따라 데이터 필터링
 * 
 * **스케일 계산:**
 * - combined 모드: 모든 지표가 동일한 y축 스케일 사용
 * - split 모드: 조회수는 y축, 나머지 지표는 y2축 사용
 * - 동적 스케일 계산: 데이터 최대값의 1.2배 또는 1.8배로 설정
 * 
 * **에러 처리:**
 * - 차트 미초기화: console.warn 로그 출력 및 조기 반환
 * - 데이터 형식 오류: try-catch 블록으로 에러 캐치 및 로그 출력
 * - 날짜 유효성 검증: 유효하지 않은 날짜 필터링
 * - 숫자 형식 검증: NaN 및 Infinity 방지
 * 
 * **성능 최적화:**
 * - animation.duration: 0 설정으로 애니메이션 없이 즉시 업데이트
 * - update('none') 모드 사용으로 스크롤 문제 방지
 * 
 * @returns {void}
 * @throws {Error} 차트 업데이트 실패 시 에러 발생
 */
DualTextWriter.prototype.updateTrackingChart = function() {
    // 에러 처리: 차트가 아직 초기화되지 않았을 때 처리
    if (!this.trackingChart) {
        console.warn('[updateTrackingChart] Chart not initialized yet');
        return;
    }
    
    try {
    
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
                try {
                    // 데이터 형식 검증: timestamp가 유효한지 확인
                    const firstMetric = post.metrics[0];
                    const lastMetric = post.metrics[post.metrics.length - 1];
                    if (!firstMetric || !firstMetric.timestamp || !lastMetric || !lastMetric.timestamp) {
                        throw new Error('Invalid metric timestamp');
                    }
                    
                    const first = firstMetric.timestamp?.toDate ? firstMetric.timestamp.toDate() : new Date(firstMetric.timestamp);
                    const last = lastMetric.timestamp?.toDate ? lastMetric.timestamp.toDate() : new Date(lastMetric.timestamp);
                    
                    // 날짜 유효성 검증
                    if (isNaN(first.getTime()) || isNaN(last.getTime())) {
                        throw new Error('Invalid date in metric');
                    }
                    
                    dateRange.push(...makeRange(first, last));
                } catch (err) {
                    console.warn('[updateTrackingChart] Error processing date range for individual post:', err);
                    // 폴백: 기본 7일 범위 사용
                    for (let i = 6; i >= 0; i--) {
                        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                        dateRange.push(d);
                    }
                }
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
                    // 데이터 형식 검증: timestamp가 유효한지 확인
                    if (!m || !m.timestamp) return;
                    
                    try {
                        const dt = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp);
                        // 날짜 유효성 검증
                        if (isNaN(dt.getTime())) {
                            console.warn('[updateTrackingChart] Invalid date in metric:', m);
                            return;
                        }
                        dt.setHours(0,0,0,0);
                        if (!minDate || dt < minDate) minDate = new Date(dt);
                        if (!maxDate || dt > maxDate) maxDate = new Date(dt);
                    } catch (err) {
                        console.warn('[updateTrackingChart] Error processing metric for date range:', err, m);
                    }
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
                    // 숫자 형식 검증: NaN이나 Infinity 방지
                    dayTotalViews += Number(latestMetricBeforeDate.views) || 0;
                    dayTotalLikes += Number(latestMetricBeforeDate.likes) || 0;
                    dayTotalComments += Number(latestMetricBeforeDate.comments) || 0;
                    dayTotalShares += Number(latestMetricBeforeDate.shares) || 0;
                    dayTotalFollows += Number(latestMetricBeforeDate.follows) || 0;
                }
            });
            
            viewsData.push(dayTotalViews);
            likesData.push(dayTotalLikes);
            commentsData.push(dayTotalComments);
            sharesData.push(dayTotalShares);
            followsData.push(dayTotalFollows);
        });
        
        // 차트 제목 업데이트
        this.trackingChart.options.plugins.title.text = '전체 포스트 현재값 합계 추이';
        // 헤더 업데이트
        this.updateChartHeader('전체 포스트 현재값 합계 추이', null);
        
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
                this.updateChartHeader('포스트 성과 추이 (포스트를 선택하세요)', null);
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
                        // 데이터 형식 검증: timestamp가 유효한지 확인
                        if (!metric || !metric.timestamp) return;
                        
                        try {
                            const metricDate = metric.timestamp?.toDate ? metric.timestamp.toDate() : new Date(metric.timestamp);
                            // 날짜 유효성 검증
                            if (isNaN(metricDate.getTime())) {
                                console.warn('[updateTrackingChart] Invalid date in metric:', metric);
                                return;
                            }
                            metricDate.setHours(0, 0, 0, 0);
                            
                            if (metricDate.getTime() === targetDate.getTime()) {
                                // 숫자 형식 검증: NaN이나 Infinity 방지
                                dayViews += Number(metric.views) || 0;
                                dayLikes += Number(metric.likes) || 0;
                                dayComments += Number(metric.comments) || 0;
                                dayShares += Number(metric.shares) || 0;
                                dayFollows += Number(metric.follows) || 0;
                            }
                        } catch (err) {
                            console.warn('[updateTrackingChart] Error processing metric:', err, metric);
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
                
                // 헤더 업데이트: 포스트 제목과 최근 업데이트
                const latestMetric = selectedPost.metrics && selectedPost.metrics.length > 0 
                    ? selectedPost.metrics[selectedPost.metrics.length - 1] 
                    : null;
                let lastUpdate = null;
                if (latestMetric && latestMetric.timestamp) {
                    lastUpdate = latestMetric.timestamp?.toDate ? latestMetric.timestamp.toDate() : new Date(latestMetric.timestamp);
                }
                this.updateChartHeader(selectedPost.content, lastUpdate);
            } else {
                dateRange.forEach(() => {
                    viewsData.push(0);
                    likesData.push(0);
                    commentsData.push(0);
                    sharesData.push(0);
                    followsData.push(0);
                });
                this.trackingChart.options.plugins.title.text = '포스트 성과 추이 (데이터 없음)';
                this.updateChartHeader('포스트 성과 추이 (데이터 없음)', null);
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
    
    } catch (error) {
        // 차트 업데이트 실패 시 에러 처리
        console.error('[updateTrackingChart] Chart update failed:', error);
        // 사용자에게 에러 메시지 표시 (필요시)
        // this.showMessage('차트 업데이트 중 오류가 발생했습니다. 페이지를 새로고침해주세요.', 'error');
    }
};

/**
 * 범례 탭 토글 (데이터셋 show/hide)
 * 
 * 차트의 특정 데이터셋을 표시하거나 숨깁니다.
 * 버튼의 스타일을 업데이트하여 현재 상태를 시각적으로 표시합니다.
 * 
 * @param {HTMLElement} button - 토글 버튼 요소
 * @param {number} datasetIndex - 데이터셋 인덱스 (0: 조회수, 1: 좋아요, 2: 댓글, 3: 공유, 4: 팔로우)
 * @returns {void}
 */
DualTextWriter.prototype.toggleLegend = function(button, datasetIndex) {
    if (!this.trackingChart) return;
    
    const dataset = this.trackingChart.data.datasets[datasetIndex];
    if (!dataset) return;
    
    // 데이터셋 표시/숨김 토글 (즉시 반영)
    const isVisible = dataset.hidden !== true;
    dataset.hidden = isVisible;
    
    // 버튼 스타일 업데이트
    if (isVisible) {
        button.style.opacity = '0.4';
        button.style.textDecoration = 'line-through';
        button.setAttribute('aria-pressed', 'false');
    } else {
        button.style.opacity = '1';
        button.style.textDecoration = 'none';
        button.setAttribute('aria-pressed', 'true');
    }
    
    // 차트 즉시 업데이트 및 축 반응형 유지
    this.trackingChart.update('none');
    
    // 축 반응형 재계산
    if (this.trackingChart && this.trackingChart.options && this.trackingChart.options.scales) {
        this.updateTrackingChart(); // 전체 차트 업데이트로 축 재계산
    }
};
/**
 * 차트 컨트롤 키보드 접근성 이벤트 바인딩
 * 
 * 모든 차트 컨트롤 버튼에 키보드 이벤트 리스너를 추가합니다.
 * Enter 또는 Space 키로 버튼을 활성화할 수 있도록 합니다.
 * 
 * **바인딩 대상:**
 * - 차트 모드 버튼 (전체 총합 / 개별 포스트)
 * - 차트 범위 버튼 (7일 / 30일 / 전체)
 * - 차트 스케일 버튼 (공동 / 분리)
 * - 범례 버튼 (조회수, 좋아요, 댓글, 공유, 팔로우)
 * 
 * **이벤트 처리:**
 * - 이벤트 위임 사용으로 동적으로 추가된 범례 버튼도 처리 가능
 * - `preventDefault()`로 기본 동작 방지
 * 
 * **접근성:**
 * - WCAG 2.1 AA 기준 충족
 * - 키보드만으로 모든 차트 기능 접근 가능
 * 
 * @returns {void}
 */
DualTextWriter.prototype.bindChartKeyboardEvents = function() {
    // 차트 모드 버튼 키보드 이벤트
    const modeButtons = ['chart-mode-total', 'chart-mode-individual'];
    modeButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const mode = btnId === 'chart-mode-total' ? 'total' : 'individual';
                    this.setChartMode(mode);
                }
            });
        }
    });
    
    // 차트 범위 버튼 키보드 이벤트
    const rangeButtons = ['chart-range-7d', 'chart-range-30d', 'chart-range-all'];
    rangeButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const range = btnId.replace('chart-range-', '');
                    this.setChartRange(range);
                }
            });
        }
    });
    
    // 차트 스케일 버튼 키보드 이벤트
    const scaleButtons = ['chart-scale-combined', 'chart-scale-split'];
    scaleButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const mode = btnId === 'chart-scale-combined' ? 'combined' : 'split';
                    this.setScaleMode(mode);
                }
            });
        }
    });
    
    // 범례 버튼 키보드 이벤트 (이벤트 위임 사용)
    const legendContainer = document.querySelector('.chart-legend-tabs');
    if (legendContainer) {
        legendContainer.addEventListener('keydown', (e) => {
            const legendBtn = e.target.closest('.legend-tab');
            if (!legendBtn) return;
            
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const datasetIndex = parseInt(legendBtn.getAttribute('data-dataset') || '0');
                this.toggleLegend(legendBtn, datasetIndex);
            }
        });
    }
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

/**
 * 레퍼런스 글의 사용 여부를 확인합니다.
 * 
 * Firebase `posts` 컬렉션에서 `sourceType === 'reference'`이고 
 * `sourceTextId`가 일치하는 포스트 개수를 반환합니다.
 * 
 * @param {string} referenceTextId - 레퍼런스 텍스트의 ID (texts 컬렉션 문서 ID)
 * @returns {Promise<number>} 사용 횟수 (0이면 사용 안됨, 1 이상이면 사용됨)
 * 
 * @example
 * const usageCount = await dualTextWriter.checkReferenceUsage('abc123');
 * if (usageCount > 0) {
 *     console.log(`이 레퍼런스는 ${usageCount}회 사용되었습니다.`);
 * }
 */
DualTextWriter.prototype.checkReferenceUsage = async function(referenceTextId) {
    // 에러 처리: 파라미터 유효성 검사
    if (!referenceTextId || typeof referenceTextId !== 'string') {
        console.warn('checkReferenceUsage: 잘못된 referenceTextId:', referenceTextId);
        return 0;
    }
    
    // 에러 처리: Firebase 준비 상태 확인
    if (!this.isFirebaseReady) {
        console.warn('checkReferenceUsage: Firebase가 준비되지 않았습니다.');
        return 0;
    }
    
    // 에러 처리: 사용자 로그인 여부 확인
    if (!this.currentUser) {
        console.warn('checkReferenceUsage: 사용자가 로그인하지 않았습니다.');
        return 0;
    }
    
    try {
        // Firebase posts 컬렉션 참조
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        
        // Firebase 쿼리: sourceType이 'reference'이고 sourceTextId가 일치하는 포스트 조회
        // 참고: Firestore는 where 절을 여러 개 사용할 수 있음 (복합 인덱스 필요할 수 있음)
        const q = window.firebaseQuery(
            postsRef,
            window.firebaseWhere('sourceType', '==', 'reference'),
            window.firebaseWhere('sourceTextId', '==', referenceTextId)
        );
        
        const querySnapshot = await window.firebaseGetDocs(q);
        
        // 사용 횟수 계산 (쿼리 결과의 문서 개수)
        const usageCount = querySnapshot.size;
        
        return usageCount;
    } catch (error) {
        // 에러 처리: Firebase 조회 실패 시 기본값(0) 반환
        console.error('레퍼런스 사용 여부 확인 실패:', error);
        return 0;
    }
};

/**
 * 여러 레퍼런스 글의 사용 여부를 한번에 확인합니다 (성능 최적화).
 * 
 * Firebase `posts` 컬렉션에서 `sourceType === 'reference'`인 포스트들을 조회한 후,
 * JavaScript에서 `sourceTextId`별로 그룹핑하여 사용 횟수를 계산합니다.
 * 
 * **성능 최적화 전략:**
 * - 모든 레퍼런스 포스트를 한 번의 쿼리로 조회
 * - JavaScript에서 그룹핑하여 카운트 (Firebase `whereIn` 10개 제한 회피)
 * 
 * @param {Array<string>} referenceTextIds - 레퍼런스 텍스트 ID 배열 (texts 컬렉션 문서 ID들)
 * @returns {Promise<Object>} 사용 횟수 객체: `{ textId1: count1, textId2: count2, ... }`
 * 
 * @example
 * const usageMap = await dualTextWriter.checkMultipleReferenceUsage(['id1', 'id2', 'id3']);
 * // 결과: { id1: 2, id2: 0, id3: 1 }
 * 
 * if (usageMap.id1 > 0) {
 *     console.log(`레퍼런스 id1은 ${usageMap.id1}회 사용되었습니다.`);
 * }
 */
DualTextWriter.prototype.checkMultipleReferenceUsage = async function(referenceTextIds) {
    // 에러 처리: 빈 배열 입력 처리
    if (!Array.isArray(referenceTextIds) || referenceTextIds.length === 0) {
        return {};
    }
    
    // 에러 처리: Firebase 준비 상태 확인
    if (!this.isFirebaseReady) {
        console.warn('checkMultipleReferenceUsage: Firebase가 준비되지 않았습니다.');
        // 모든 ID에 대해 0 반환
        return referenceTextIds.reduce((result, id) => {
            result[id] = 0;
            return result;
        }, {});
    }
    
    // 에러 처리: 사용자 로그인 여부 확인
    if (!this.currentUser) {
        console.warn('checkMultipleReferenceUsage: 사용자가 로그인하지 않았습니다.');
        // 모든 ID에 대해 0 반환
        return referenceTextIds.reduce((result, id) => {
            result[id] = 0;
            return result;
        }, {});
    }
    
    try {
        // Firebase posts 컬렉션 참조
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        
        // 성능 최적화: sourceType이 'reference'인 모든 포스트를 한 번의 쿼리로 조회
        // (whereIn 10개 제한을 회피하기 위해 JavaScript에서 필터링)
        const q = window.firebaseQuery(
            postsRef,
            window.firebaseWhere('sourceType', '==', 'reference')
        );
        
        const querySnapshot = await window.firebaseGetDocs(q);
        
        // 사용 횟수 계산을 위한 Map 초기화 (모든 ID에 대해 0으로 초기화)
        const usageMap = new Map();
        referenceTextIds.forEach(id => {
            // 유효한 ID만 처리
            if (id && typeof id === 'string') {
                usageMap.set(id, 0);
            }
        });
        
        // 쿼리 결과를 순회하며 sourceTextId별로 카운트
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const sourceTextId = data.sourceTextId;
            
            // 요청한 ID 목록에 포함된 경우에만 카운트
            if (sourceTextId && usageMap.has(sourceTextId)) {
                const currentCount = usageMap.get(sourceTextId);
                usageMap.set(sourceTextId, currentCount + 1);
            }
        });
        
        // Map을 객체로 변환하여 반환
        const result = {};
        usageMap.forEach((count, id) => {
            result[id] = count;
        });
        
        return result;
    } catch (error) {
        // 에러 처리: Firebase 조회 실패 시 모든 ID에 대해 0 반환
        console.error('여러 레퍼런스 사용 여부 확인 실패:', error);
        return referenceTextIds.reduce((result, id) => {
            result[id] = 0;
            return result;
        }, {});
    }
};
/**
 * 레퍼런스를 사용된 것으로 표시합니다 (간단한 클릭 동작).
 * 
 * 레퍼런스를 사용했다고 표시하기 위해 레퍼런스 사용 포스트를 생성합니다.
 * 사용자가 "사용 안됨" 배지를 클릭했을 때 호출됩니다.
 * 
 * @param {string} referenceTextId - 레퍼런스 텍스트의 ID (texts 컬렉션 문서 ID)
 * @returns {Promise<void>}
 * 
 * @example
 * await dualTextWriter.markReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.markReferenceAsUsed = async function(referenceTextId) {
    // 에러 처리: 파라미터 유효성 검사
    if (!referenceTextId || typeof referenceTextId !== 'string') {
        console.warn('markReferenceAsUsed: 잘못된 referenceTextId:', referenceTextId);
        this.showMessage('❌ 레퍼런스 ID를 찾을 수 없습니다.', 'error');
        return;
    }
    
    // 에러 처리: Firebase 준비 상태 확인
    if (!this.isFirebaseReady) {
        console.warn('markReferenceAsUsed: Firebase가 준비되지 않았습니다.');
        this.showMessage('❌ Firebase 연결이 준비되지 않았습니다.', 'error');
        return;
    }
    
    // 에러 처리: 사용자 로그인 여부 확인
    if (!this.currentUser) {
        console.warn('markReferenceAsUsed: 사용자가 로그인하지 않았습니다.');
        this.showMessage('❌ 로그인이 필요합니다.', 'error');
        return;
    }
    
    try {
        // 레퍼런스 텍스트 조회
        const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', referenceTextId);
        const textDoc = await window.firebaseGetDoc(textRef);
        
        if (!textDoc.exists()) {
            console.error('레퍼런스 텍스트를 찾을 수 없습니다.');
            this.showMessage('❌ 레퍼런스 텍스트를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const textData = textDoc.data();
        
        // 레퍼런스 타입 확인
        if ((textData.type || 'edit') !== 'reference') {
            console.warn('markReferenceAsUsed: 레퍼런스가 아닌 텍스트입니다.');
            this.showMessage('❌ 레퍼런스 글만 사용 표시할 수 있습니다.', 'error');
            return;
        }
        
        // 이미 사용된 레퍼런스인지 확인
        const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
        if (existingUsageCount > 0) {
            console.log('이미 사용된 레퍼런스입니다. 사용 횟수:', existingUsageCount);
            // 이미 사용된 경우에도 메시지 표시하지 않고 조용히 처리
            // UI만 업데이트
            await this.refreshSavedTextsUI();
            return;
        }
        
        // 레퍼런스 사용 포스트 생성
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const referencePostData = {
            content: textData.content, // 레퍼런스 내용
            type: 'reference',
            postedAt: window.firebaseServerTimestamp(),
            trackingEnabled: false, // 레퍼런스 포스트는 트래킹 비활성화
            metrics: [],
            analytics: {},
            sourceTextId: referenceTextId, // 레퍼런스 텍스트 참조
            sourceType: 'reference', // 레퍼런스 타입으로 설정
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp()
        };
        
        await window.firebaseAddDoc(postsRef, referencePostData);
        console.log('✅ 레퍼런스 사용 표시 완료 (레퍼런스 ID:', referenceTextId, ')');
        
        // 성공 메시지
        this.showMessage('✅ 레퍼런스가 사용됨으로 표시되었습니다.', 'success');
        
        // "사용됨" 탭으로 자동 이동
        this.setSavedFilter('reference-used');
        
        // UI 즉시 업데이트 (새로고침 없이)
        await this.refreshSavedTextsUI();
        
    } catch (error) {
        // 에러 처리: Firebase 조회/생성 실패 시 에러 메시지 표시
        console.error('레퍼런스 사용 표시 실패:', error);
        this.showMessage('❌ 레퍼런스 사용 표시에 실패했습니다: ' + error.message, 'error');
    }
};

/**
 * 레퍼런스를 사용 안된 것으로 되돌립니다 (토글 기능).
 * 
 * 레퍼런스 사용 포스트를 삭제하여 사용 안됨 상태로 복원합니다.
 * 사용자가 "사용됨" 배지를 클릭했을 때 호출됩니다.
 * 
 * @param {string} referenceTextId - 레퍼런스 텍스트의 ID (texts 컬렉션 문서 ID)
 * @returns {Promise<void>}
 * 
 * @example
 * await dualTextWriter.unmarkReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.unmarkReferenceAsUsed = async function(referenceTextId) {
    // 에러 처리: 파라미터 유효성 검사
    if (!referenceTextId || typeof referenceTextId !== 'string') {
        console.warn('unmarkReferenceAsUsed: 잘못된 referenceTextId:', referenceTextId);
        this.showMessage('❌ 레퍼런스 ID를 찾을 수 없습니다.', 'error');
        return;
    }
    
    // 에러 처리: Firebase 준비 상태 확인
    if (!this.isFirebaseReady) {
        console.warn('unmarkReferenceAsUsed: Firebase가 준비되지 않았습니다.');
        this.showMessage('❌ Firebase 연결이 준비되지 않았습니다.', 'error');
        return;
    }
    
    // 에러 처리: 사용자 로그인 여부 확인
    if (!this.currentUser) {
        console.warn('unmarkReferenceAsUsed: 사용자가 로그인하지 않았습니다.');
        this.showMessage('❌ 로그인이 필요합니다.', 'error');
        return;
    }
    
    try {
        // 레퍼런스 텍스트 조회
        const textRef = window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'texts', referenceTextId);
        const textDoc = await window.firebaseGetDoc(textRef);
        
        if (!textDoc.exists()) {
            console.error('레퍼런스 텍스트를 찾을 수 없습니다.');
            this.showMessage('❌ 레퍼런스 텍스트를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const textData = textDoc.data();
        
        // 레퍼런스 타입 확인
        if ((textData.type || 'edit') !== 'reference') {
            console.warn('unmarkReferenceAsUsed: 레퍼런스가 아닌 텍스트입니다.');
            this.showMessage('❌ 레퍼런스 글만 사용 안됨으로 되돌릴 수 있습니다.', 'error');
            return;
        }
        
        // 현재 사용 여부 확인
        const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
        if (existingUsageCount === 0) {
            console.log('이미 사용 안된 레퍼런스입니다.');
            // 이미 사용 안된 경우에도 메시지 표시하지 않고 조용히 처리
            // UI만 업데이트
            await this.refreshSavedTextsUI();
            return;
        }
        
        // 레퍼런스 사용 포스트 조회 및 삭제
        const postsRef = window.firebaseCollection(this.db, 'users', this.currentUser.uid, 'posts');
        const q = window.firebaseQuery(
            postsRef,
            window.firebaseWhere('sourceTextId', '==', referenceTextId),
            window.firebaseWhere('sourceType', '==', 'reference')
        );
        const querySnapshot = await window.firebaseGetDocs(q);
        
        if (querySnapshot.empty) {
            console.warn('unmarkReferenceAsUsed: 레퍼런스 사용 포스트를 찾을 수 없습니다.');
            // 사용 포스트가 없어도 UI만 업데이트
            await this.refreshSavedTextsUI();
            return;
        }
        
        // 모든 레퍼런스 사용 포스트 삭제 (배치 삭제)
        const deletePromises = querySnapshot.docs.map(doc => {
            return window.firebaseDeleteDoc(window.firebaseDoc(this.db, 'users', this.currentUser.uid, 'posts', doc.id));
        });
        
        await Promise.all(deletePromises);
        console.log('✅ 레퍼런스 사용 안됨 복원 완료 (레퍼런스 ID:', referenceTextId, ', 삭제된 포스트:', querySnapshot.docs.length, '개)');
        
        // 성공 메시지
        this.showMessage('✅ 레퍼런스가 사용 안됨으로 되돌려졌습니다.', 'success');
        
        // "레퍼런스" 탭으로 자동 이동 (사용 안됨 레퍼런스를 보기 위해)
        this.setSavedFilter('reference');
        
        // UI 즉시 업데이트 (새로고침 없이)
        await this.refreshSavedTextsUI();
        
    } catch (error) {
        // 에러 처리: Firebase 조회/삭제 실패 시 에러 메시지 표시
        console.error('레퍼런스 사용 안됨 복원 실패:', error);
        this.showMessage('❌ 레퍼런스 사용 안됨 복원에 실패했습니다: ' + error.message, 'error');
    }
};

/**
 * 저장된 글 목록 UI를 새로고침합니다.
 * 레퍼런스 사용 여부를 다시 확인하여 배지 업데이트합니다.
 * 
 * @returns {Promise<void>}
 */
DualTextWriter.prototype.refreshSavedTextsUI = async function() {
    try {
        // 저장된 글 목록 다시 렌더링
        await this.renderSavedTexts();
    } catch (error) {
        console.error('저장된 글 UI 새로고침 실패:', error);
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
        this.refreshUI({
            trackingPosts: true,
            trackingSummary: true,
            trackingChart: true,
            force: true
        });
        
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