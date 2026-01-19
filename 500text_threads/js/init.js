/**
 * 초기화 관리 모듈 (Phase 10)
 * @module Init
 *
 * [목적]
 * - 앱 초기화 로직을 중앙 집중화
 * - 이벤트 바인딩을 카테고리별로 분리
 * - 탭 전환 로직 정리
 *
 * [구조]
 * - InitManager: 초기화 및 이벤트 바인딩 관리
 * - TabManager: 탭 전환 로직 담당
 */

import { logger } from './logger.js';
import { Constants } from './constants.js';

// ============================================================================
// TabManager: 탭 전환 관련 로직 담당
// ============================================================================
export class TabManager {
    /**
     * @param {object} app - DualTextWriter 인스턴스 참조
     */
    constructor(app) {
        this.app = app;
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.currentTab = Constants.TABS.WRITING;
    }

    /**
     * 탭 이벤트 리스너 초기화
     */
    initTabListeners() {
        this.tabButtons.forEach((button) => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
        logger.log('[TabManager] 탭 이벤트 리스너 초기화 완료');
    }

    /**
     * 탭 전환 처리
     * @param {string} tabName - 전환할 탭 이름 ('writing', 'saved', 'tracking', 'management')
     */
    switchTab(tabName) {
        // ===== [Phase 10] 탭 전환 로직 중앙화 =====

        // 1. 모든 탭 버튼과 콘텐츠에서 active 클래스 제거
        this.tabButtons.forEach((btn) => btn.classList.remove('active'));
        this.tabContents.forEach((content) => content.classList.remove('active'));

        // 2. 선택된 탭 버튼과 콘텐츠에 active 클래스 추가
        const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = document.getElementById(`${tabName}-tab`);

        if (activeButton) {
            activeButton.classList.add('active');
            activeButton.setAttribute('aria-selected', 'true');
        }
        if (activeContent) {
            activeContent.classList.add('active');
        }

        // 3. 이전 탭의 aria-selected 해제
        this.tabButtons.forEach((btn) => {
            if (btn !== activeButton) {
                btn.setAttribute('aria-selected', 'false');
            }
        });

        // 4. 현재 탭 상태 저장
        this.currentTab = tabName;

        // 5. 탭별 특화 로직 실행
        this._handleTabSpecificLogic(tabName);

        logger.log(`[TabManager] 탭 전환: ${tabName}`);
    }

    /**
     * 탭별 특화 로직 처리 (private)
     * @param {string} tabName - 탭 이름
     */
    _handleTabSpecificLogic(tabName) {
        const app = this.app;

        switch (tabName) {
            case Constants.TABS.SAVED:
                // ===== [2026-01-18] T4-02 빠른 탭 전환 중복 호출 방지 =====
                // Debounce: 연속 클릭 시 마지막 클릭만 실행
                clearTimeout(this._savedTabDebounce);
                this._savedTabDebounce = setTimeout(() => {
                    // 이미 로딩 중이면 스킵
                    if (app._isLoadingSavedTexts) {
                        logger.log('[TabManager] loadSavedTexts 이미 로딩 중, 스킵');
                        return;
                    }
                    if (typeof app.loadSavedTexts === 'function') {
                        app.loadSavedTexts();
                    }
                }, 150); // 150ms debounce

                if (typeof app.initSavedFilters === 'function') {
                    app.initSavedFilters();
                }
                // 미트래킹 글 버튼 상태 업데이트
                if (typeof app.updateBatchMigrationButton === 'function') {
                    app.updateBatchMigrationButton();
                }
                break;

            case Constants.TABS.TRACKING:
                // 트래킹 탭: 데이터 로드
                if (typeof app.loadTrackingPosts === 'function') {
                    app.loadTrackingPosts();
                }
                if (typeof app.updateTrackingSummary === 'function') {
                    app.updateTrackingSummary();
                }
                if (typeof app.initTrackingChart === 'function') {
                    app.initTrackingChart();
                }
                break;

            case Constants.TABS.WRITING:
                // 글 작성 탭: 특별한 처리 불필요 (레퍼런스와 작성 패널이 이미 포함)
                break;

            case Constants.TABS.MANAGEMENT:
                // 관리 탭: 아티클 데이터 로드
                if (typeof app.loadArticlesForManagement === 'function') {
                    app.loadArticlesForManagement();
                }
                if (typeof app.initArticleManagement === 'function') {
                    app.initArticleManagement();
                }
                break;

            case Constants.TABS.URLLINK:
                // [2026-01-18] URL 연결 탭: URL 링크 로드
                if (app.urlLinkManager) {
                    app.urlLinkManager.init();
                    app.urlLinkManager.loadUrlLinks();
                }
                break;

            case Constants.TABS.BACKUP:
                // [2026-01-18] 백업 탭: BackupManager 초기화
                if (app.backupManager) {
                    app.backupManager.init();
                }
                break;
        }
    }


    /**
     * 현재 활성 탭 가져오기
     * @returns {string} 현재 탭 이름
     */
    getCurrentTab() {
        return this.currentTab;
    }
}

// ============================================================================
// InitManager: 앱 초기화 및 이벤트 바인딩 관리
// ============================================================================
export class InitManager {
    /**
     * @param {object} app - DualTextWriter 인스턴스 참조
     */
    constructor(app) {
        this.app = app;
        this.tabManager = new TabManager(app);
        this.isInitialized = false;
    }

    // ========================================================================
    // 메인 초기화 메서드
    // ========================================================================

    /**
     * 앱 전체 초기화 (메인 진입점)
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('[InitManager] 이미 초기화됨, 스킵');
            return;
        }

        logger.log('[InitManager] ===== 앱 초기화 시작 =====');

        try {
            // 1. 이벤트 바인딩
            this.bindAllEvents();

            // 2. Firebase 초기화 대기
            await this.app.waitForFirebase();

            /* ============================================================
             * [P2-01] 2026-01-18: 인증 상태 리스너 설정 - AuthManager에 직접 호출
             * - 사유: 타이밍 문제 해결 (Race Condition)
             * - 변경: waitForFirebase() 완료 후 DualTextWriter 속성 동기화가
             *         완료된 상태에서 Auth 리스너를 등록
             * - 이전: this.app.setupAuthStateListener() (빈 메서드)
             * ============================================================ */
            // 3. 인증 상태 리스너 설정 (AuthManager에 직접 호출)
            if (this.app.authManager) {
                this.app.authManager.setupAuthStateListener();
                logger.log('[InitManager] Auth 상태 리스너 설정 완료');
            } else {
                logger.warn('[InitManager] authManager가 없습니다. Auth 리스너 설정 스킵');
            }

            // 4. UI 컴포넌트 초기화
            this._initUIComponents();

            // 5. 기능별 초기화
            this._initFeatures();

            this.isInitialized = true;
            logger.log('[InitManager] ===== 앱 초기화 완료 =====');
        } catch (error) {
            logger.error('[InitManager] 초기화 실패:', error);
            throw error;
        }
    }

    /**
     * UI 컴포넌트 초기화 (private)
     */
    _initUIComponents() {
        const app = this.app;

        // 글자 제한 토글 초기화
        if (typeof app.initCharLimitToggle === 'function') {
            app.initCharLimitToggle();
        }

        // 초기 글자 제한 반영
        if (typeof app.applyCharLimit === 'function') {
            app.applyCharLimit(app.maxLength);
        }

        logger.log('[InitManager] UI 컴포넌트 초기화 완료');
    }

    /**
     * 기능별 초기화 (private)
     */
    _initFeatures() {
        const app = this.app;

        // 실시간 중복 체크 초기화
        if (typeof app.initLiveDuplicateCheck === 'function') {
            app.initLiveDuplicateCheck();
        }

        // 레퍼런스 선택 기능 초기화
        if (typeof app.initReferenceSelection === 'function') {
            app.initReferenceSelection();
        }

        // SNS 플랫폼 선택 기능 초기화
        if (typeof app.initSnsPlatformSelection === 'function') {
            app.initSnsPlatformSelection();
        }

        // 레퍼런스 불러오기 패널 초기화
        if (typeof app.initReferenceLoader === 'function') {
            app.initReferenceLoader();
        }

        // 확대 모드 초기화
        if (typeof app.initExpandModal === 'function') {
            app.initExpandModal();
        }

        logger.log('[InitManager] 기능 초기화 완료');
    }

    // ========================================================================
    // 이벤트 바인딩 메서드
    // ========================================================================

    /**
     * 모든 이벤트 바인딩 (메인)
     */
    bindAllEvents() {
        logger.log('[InitManager] 이벤트 바인딩 시작');

        // 1. 인증 관련 이벤트
        this._bindAuthEvents();

        // 2. 탭 관련 이벤트
        this.tabManager.initTabListeners();

        // 3. 텍스트 입력 관련 이벤트
        this._bindTextInputEvents();

        // 4. 반자동화 포스팅 이벤트
        this._bindSemiAutoPostEvents();

        // 5. 필터 관련 이벤트 (지연 로드)
        setTimeout(() => this._bindFilterEvents(), 0);

        // 6. 기타 이벤트 (해시태그, 마이그레이션 등)
        this._bindMiscEvents();

        // 7. 패널 기반 LLM 버튼 (지연 로드)
        setTimeout(() => {
            if (typeof this.app.bindPanelLLMButtons === 'function') {
                this.app.bindPanelLLMButtons();
            }
        }, 100);

        logger.log('[InitManager] 이벤트 바인딩 완료');
    }

    /**
     * 인증 관련 이벤트 바인딩 (private)
     */
    _bindAuthEvents() {
        const app = this.app;

        // 로그인/로그아웃 버튼
        if (app.loginBtn) {
            app.loginBtn.addEventListener('click', () => app.login());
        }
        if (app.logoutBtn) {
            app.logoutBtn.addEventListener('click', () => app.logout());
        }

        // 새로고침 버튼 (PC 전용)
        if (app.refreshBtn) {
            app.refreshBtn.addEventListener('click', () => app.refreshAllData());
        }

        // Enter 키로 로그인
        if (app.usernameInput) {
            app.usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    app.login();
                }
            });
        }

        // Google 로그인
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', () => app.googleLogin());
        }

        logger.log('[InitManager] 인증 이벤트 바인딩 완료');
    }

    /**
     * 텍스트 입력 관련 이벤트 바인딩 (private)
     */
    _bindTextInputEvents() {
        const app = this.app;

        // ==================== TextCrudManager 직접 바인딩 (Phase B) ====================
        // 레퍼런스 글 이벤트
        if (app.refTextInput) {
            app.refTextInput.addEventListener('input', () => {
                app.textCrudManager.updateCharacterCount('ref');
                app.scheduleTempSave();
            });
        }
        if (app.refClearBtn) {
            app.refClearBtn.addEventListener('click', () => app.textCrudManager.clearText('ref'));
        }
        if (app.refSaveBtn) {
            app.refSaveBtn.addEventListener('click', () => app.textCrudManager.saveText('ref'));
        }
        if (app.refDownloadBtn) {
            app.refDownloadBtn.addEventListener('click', () => app.textCrudManager.downloadAsTxt('ref'));
        }

        // 수정/작성 글 이벤트
        if (app.editTextInput) {
            app.editTextInput.addEventListener('input', () => {
                app.textCrudManager.updateCharacterCount('edit');
                app.scheduleTempSave();
            });
        }
        if (app.editClearBtn) {
            app.editClearBtn.addEventListener('click', () => app.textCrudManager.clearText('edit'));
        }
        if (app.editSaveBtn) {
            app.editSaveBtn.addEventListener('click', () => app.textCrudManager.saveText('edit'));
        }
        if (app.editDownloadBtn) {
            app.editDownloadBtn.addEventListener('click', () => app.textCrudManager.downloadAsTxt('edit'));
        }

        logger.log('[InitManager] 텍스트 입력 이벤트 바인딩 완료');
    }

    /**
     * 반자동화 포스팅 이벤트 바인딩 (private)
     */
    _bindSemiAutoPostEvents() {
        const app = this.app;
        const semiAutoPostBtn = document.getElementById('semi-auto-post-btn');

        if (!semiAutoPostBtn) {
            logger.warn('[InitManager] 반자동화 포스팅 버튼을 찾을 수 없습니다');
            return;
        }

        // 클릭 이벤트
        semiAutoPostBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof app.handleSemiAutoPost === 'function') {
                app.handleSemiAutoPost();
            } else {
                logger.error('[InitManager] handleSemiAutoPost 함수가 없습니다');
            }
        });

        // 키보드 접근성
        semiAutoPostBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (typeof app.handleSemiAutoPost === 'function') {
                    app.handleSemiAutoPost();
                }
            }
        });

        // 접근성 속성
        semiAutoPostBtn.setAttribute('aria-label', 'Threads에 반자동으로 포스팅하기');
        semiAutoPostBtn.setAttribute('role', 'button');
        semiAutoPostBtn.setAttribute('tabindex', '0');

        logger.log('[InitManager] 반자동화 포스팅 이벤트 바인딩 완료');
    }

    /**
     * 필터 관련 이벤트 바인딩 (private)
     */
    _bindFilterEvents() {
        const app = this.app;

        // 저장된 글 필터 초기화
        if (typeof app.initSavedFilters === 'function') {
            app.initSavedFilters();
        }

        // ===== 트래킹 필터 이벤트 =====
        this._bindTrackingFilterEvents();

        // ===== 저장된 글 검색 이벤트 =====
        this._bindSavedSearchEvents();

        // ===== 범위 필터 이벤트 =====
        this._bindRangeFilterEvents();

        // 범위 필터 접기/펼치기 초기화
        if (typeof app.initRangeFilter === 'function') {
            app.initRangeFilter();
        }

        // CSV 내보내기 버튼
        if (app.exportCsvBtn) {
            app.exportCsvBtn.addEventListener('click', () => app.exportTrackingCsv());
        }

        logger.log('[InitManager] 필터 이벤트 바인딩 완료');
    }

    /**
     * 트래킹 필터 이벤트 바인딩 (private helper)
     */
    _bindTrackingFilterEvents() {
        const app = this.app;

        // 정렬 선택
        if (app.trackingSortSelect) {
            app.trackingSortSelect.value = app.trackingSort;
            app.trackingSortSelect.addEventListener('change', (e) => {
                app.trackingSort = e.target.value;
                localStorage.setItem('dtw_tracking_sort', app.trackingSort);
                app.refreshUI({ trackingPosts: true });
            });
        }

        // 상태 필터
        if (app.trackingStatusSelect) {
            app.trackingStatusSelect.value = app.trackingStatusFilter;
            app.trackingStatusSelect.addEventListener('change', (e) => {
                app.trackingStatusFilter = e.target.value;
                localStorage.setItem('dtw_tracking_status', app.trackingStatusFilter);
                app.refreshUI({ trackingPosts: true });
            });
        }

        // 검색 입력
        if (app.trackingSearchInput) {
            app.trackingSearchInput.value = app.trackingSearch;
            app.trackingSearchDebounce = null;
            app.trackingSearchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                clearTimeout(app.trackingSearchDebounce);
                app.trackingSearchDebounce = setTimeout(() => {
                    app.trackingSearch = val;
                    localStorage.setItem('dtw_tracking_search', app.trackingSearch);
                    app.refreshUI({ trackingPosts: true });
                }, 300);
            });
        }

        // 날짜 범위 필터
        if (app.trackingUpdatedFromInput) {
            app.trackingUpdatedFromInput.value = app.trackingUpdatedFrom;
            app.trackingUpdatedFromInput.addEventListener('change', (e) => {
                app.trackingUpdatedFrom = e.target.value;
                localStorage.setItem('dtw_tracking_from', app.trackingUpdatedFrom);
                app.refreshUI({ trackingPosts: true });
            });
        }

        if (app.trackingUpdatedToInput) {
            app.trackingUpdatedToInput.value = app.trackingUpdatedTo;
            app.trackingUpdatedToInput.addEventListener('change', (e) => {
                app.trackingUpdatedTo = e.target.value;
                localStorage.setItem('dtw_tracking_to', app.trackingUpdatedTo);
                app.refreshUI({ trackingPosts: true });
            });
        }

        // 날짜 초기화 버튼
        if (app.trackingDateClearBtn) {
            app.trackingDateClearBtn.addEventListener('click', () => {
                app.trackingUpdatedFrom = '';
                app.trackingUpdatedTo = '';
                if (app.trackingUpdatedFromInput) app.trackingUpdatedFromInput.value = '';
                if (app.trackingUpdatedToInput) app.trackingUpdatedToInput.value = '';
                localStorage.removeItem('dtw_tracking_from');
                localStorage.removeItem('dtw_tracking_to');
                app.refreshUI({ trackingPosts: true });
            });
        }
    }

    /**
     * 저장된 글 검색 이벤트 바인딩 (private helper)
     */
    _bindSavedSearchEvents() {
        const app = this.app;

        if (app.savedSearchInput) {
            app.savedSearchInput.value = app.savedSearch;
            app.savedSearchDebounce = null;
            app.savedSearchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                clearTimeout(app.savedSearchDebounce);
                app.savedSearchDebounce = setTimeout(() => {
                    app.savedSearch = val;
                    localStorage.setItem('dtw_saved_search', app.savedSearch);
                    if (typeof app.renderSavedTexts === 'function') {
                        app.renderSavedTexts();
                    }
                }, 600);
            });
        }
    }

    /**
     * 범위 필터 이벤트 바인딩 (private helper)
     */
    _bindRangeFilterEvents() {
        const app = this.app;

        const bindRange = (input, key) => {
            if (!input) return;
            if (app.rangeFilters[key] !== undefined) {
                input.value = app.rangeFilters[key];
            }
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val === '') {
                    delete app.rangeFilters[key];
                } else {
                    app.rangeFilters[key] = Number(val) || 0;
                }
                localStorage.setItem('dtw_tracking_ranges', JSON.stringify(app.rangeFilters));
                app.refreshUI({ trackingPosts: true });
            });
        };

        bindRange(app.minViewsInput, 'minViews');
        bindRange(app.maxViewsInput, 'maxViews');
        bindRange(app.minLikesInput, 'minLikes');
        bindRange(app.maxLikesInput, 'maxLikes');
        bindRange(app.minCommentsInput, 'minComments');
        bindRange(app.maxCommentsInput, 'maxComments');
        bindRange(app.minSharesInput, 'minShares');
        bindRange(app.maxSharesInput, 'maxShares');
        bindRange(app.minFollowsInput, 'minFollows');
        bindRange(app.maxFollowsInput, 'maxFollows');
    }

    /**
     * 기타 이벤트 바인딩 (private)
     */
    _bindMiscEvents() {
        const app = this.app;

        // 해시태그 설정 버튼
        const hashtagSettingsBtn = document.getElementById('hashtag-settings-btn');
        if (hashtagSettingsBtn) {
            hashtagSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof app.showHashtagSettings === 'function') {
                    app.showHashtagSettings();
                }
            });

            // 초기 해시태그 표시 업데이트
            setTimeout(() => {
                if (typeof app.updateHashtagsDisplay === 'function') {
                    app.updateHashtagsDisplay();
                }
            }, 100);

            logger.log('[InitManager] 해시태그 설정 버튼 바인딩 완료');
        }

        // 일괄 마이그레이션 버튼
        if (app.batchMigrationBtn) {
            app.batchMigrationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof app.showBatchMigrationConfirm === 'function') {
                    app.showBatchMigrationConfirm();
                }
            });
            logger.log('[InitManager] 일괄 마이그레이션 버튼 바인딩 완료');
        }

        // 개발 모드에서 자동 테스트 실행
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                logger.log('[InitManager] 개발 모드: 자동 테스트 실행');
                if (typeof app.runComprehensiveTest === 'function') {
                    app.runComprehensiveTest();
                }
            }, 2000);
        }
    }

    // ========================================================================
    // 유틸리티 메서드
    // ========================================================================

    /**
     * TabManager 인스턴스 가져오기
     * @returns {TabManager}
     */
    getTabManager() {
        return this.tabManager;
    }

    /**
     * 초기화 상태 확인
     * @returns {boolean}
     */
    getIsInitialized() {
        return this.isInitialized;
    }
}
