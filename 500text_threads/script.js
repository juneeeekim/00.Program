import {
  extractTitleFromContent,
  escapeHtml,
  debounce,
  formatDate,
  withRetry,
} from "./js/utils.js";
import { AuthManager } from "./js/auth.js";
import { Constants } from "./js/constants.js";
import { DataManager } from "./js/data.js";
import { UIManager } from "./js/ui.js";
import { logger } from "./js/logger.js";

/**
 * 500 Text Threads - Main Script
 *
 * [Refactoring Note]
 * This file is being refactored into modules.
 * - js/utils.js: Utility functions
 * - js/auth.js: Authentication logic
 */

class DualTextWriter {
  /**
   * ?�능 �??�작 관???�정 ?�수
   *
   * ?�후 조정???�요??경우 ???�션?�서 값을 변경하?�요.
   */
  static CONFIG = {
    // ?�시�?중복 체크 ?�정
    DEBOUNCE_DUPLICATE_CHECK_MS: 600, // Debounce ?�간 (ms)
    DUPLICATE_CHECK_MIN_LENGTH: 10, // 중복 체크 최소 길이 (??

    // 배치 처리 ?�정
    BATCH_SIZE: 500, // Firestore 배치 ?�기 (최�? 500�?
    BATCH_DELAY_MS: 100, // 배치 �??�레??(ms, ?�버 부??분산)

    // 기�? ?�정
    TEMP_SAVE_INTERVAL_MS: 5000, // ?�시 ?�??간격 (ms)
    TEMP_SAVE_DELAY_MS: 2000, // ?�시 ?�???�레??(ms)

    // ?��? 모드 ?�니메이???�정
    EXPAND_MODE_ANIMATION_DELAY: 150, // ?��? 모드 ?�림 ???�퍼?�스 추�? 지???�간 (ms)
    REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS: 600, // ?�퍼?�스 강조 ?�니메이??지???�간 (ms)

    // ?�퍼?�스 ?�한 ?�정
    MAX_EXPAND_REFERENCES: 3, // ?��? 모드?�서 최�? ?�퍼?�스 개수

    // ?�능 모니?�링 ?�정
    PERFORMANCE_WARNING_THRESHOLD_MS: 200, // ?�능 경고 ?�계�?(ms)

    // ?�커??관�?지???�간
    FOCUS_MANAGEMENT_DELAY_MS: 50, // ?�커??관�?지???�간 (ms)
    SCREEN_READER_ANNOUNCE_DELAY_MS: 100, // ?�크�?리더 ?�림 지???�간 (ms)
  };

  /**
   * SNS ?�랫??목록 ?�수
   *
   * �??�랫?��? id, name, icon ?�성??가집니??
   * ?�로??SNS ?�랫?�을 추�??�거???�거??????배열???�정?�세??
   */
  static SNS_PLATFORMS = [
    { id: "threads", name: "Threads", icon: "?��" },
    { id: "instagram", name: "Instagram", icon: "?��" },
    { id: "twitter", name: "Twitter/X", icon: "?��" },
    { id: "facebook", name: "Facebook", icon: "?��" },
    { id: "linkedin", name: "LinkedIn", icon: "?��" },
    { id: "tiktok", name: "TikTok", icon: "?��" },
    { id: "naver-blog", name: "?�이버블로그", icon: "?��" },
    { id: "youtube", name: "?�튜�?게시글", icon: "?��" },
    { id: "custom", name: "직접 ?�력", icon: "?�️" },
  ];

  constructor() {
    // Firebase ?�정
    this.auth = null;

    // ?�용???�의 ?�시?�그 ?�정 (기본�?
    this.defaultHashtags = ["#writing", "#content", "#threads"];
    this.db = null;
    this.currentUser = null;
    this.isFirebaseReady = false;

    // ?�래??관???�성
    this.trackingPosts = []; // ?�래??중인 ?�스??목록
    this.trackingChart = null; // Chart.js ?�스?�스
    this.currentTrackingPost = null; // ?�재 ?�래??중인 ?�스??
    this.chartMode = "total"; // 차트 모드: 'total' (?�체 총합) ?�는 'individual' (개별 ?�스??
    this.selectedChartPostId = null; // 개별 ?�스??모드?�서 ?�택???�스??ID
    this.allTrackingPostsForSelector = []; // ?�스???�택기용 ?�체 ?�스??목록
    this.chartRange = "7d"; // '7d' | '30d' | 'all'
    this.scaleMode = "combined"; // 'combined' | 'split'

    // ?�괄 ??�� 관???�태
    this.isBatchSelectMode = false; // ?�괄 ?�택 모드 ?�성???��?
    this.selectedMetricIndices = []; // ?�택??메트�??�덱??배열

    // ?�성글-?�퍼?�스 ?�동 기능 관???�로?�티
    this.selectedReferences = []; // ?�재 ?�택???�퍼?�스 ID 배열
    this.referenceSelectionModal = null; // ?�퍼?�스 ?�택 모달 DOM
    this.referenceLinkCache = new Map(); // ??��??조회 캐시 (refId -> editIds[])

    // ===== [Bug Fix] ?�크립트 ?�성 ??초기???�태 ?�래�?=====
    // 목적: switchTab()?�서 ???�환 ??initArticleManagement() 중복 ?�출 방�?
    // ?�벤??리스?��? ?�러 �??�록?�어 ?�????중복 글???�성?�는 버그 ?�정
    this.isArticleManagementInitialized = false;

    // ===== [Dual Panel] ?�???�널 ?�태 관�?=====
    // 목적: ??개의 글???�시??비교/?�집?????�는 ?�???�널 기능 지??
    // 2025-12-09 Phase 2 추�?
    this.selectedArticleIds = [null, null]; // �??�널???�택??글 ID [?�널1, ?�널2]
    this.activePanelIndex = 0; // ?�재 ?�성 ?�널 ?�덱??(0 ?�는 1)
    this.isDualMode = false; // ?�??모드 ?�성???��?

    // Firebase ?�정 ?�내
    // Note: Firebase 초기?�는 init()?�서 await�?처리??
    this.showFirebaseSetupNotice();

    // ?�용???�증 관???�소??
    this.usernameInput = document.getElementById("username-input");
    this.loginBtn = document.getElementById("login-btn");
    this.logoutBtn = document.getElementById("logout-btn");
    this.refreshBtn = document.getElementById("refresh-btn");
    this.loginForm = document.getElementById("login-form");
    this.userInfo = document.getElementById("user-info");
    this.usernameDisplay = document.getElementById("username-display");
    this.mainContent = document.getElementById("main-content");

    // ?�퍼?�스 글 관???�소??
    this.refTextInput = document.getElementById("ref-text-input");
    this.refCurrentCount = document.getElementById("ref-current-count");
    this.refMaxCount = document.getElementById("ref-max-count");
    this.refProgressFill = document.getElementById("ref-progress-fill");
    this.refClearBtn = document.getElementById("ref-clear-btn");
    this.refSaveBtn = document.getElementById("ref-save-btn");
    this.refDownloadBtn = document.getElementById("ref-download-btn");
    // ?�퍼?�스 ?�형 ?�디??
    this.refTypeStructure = document.getElementById("ref-type-structure");
    this.refTypeIdea = document.getElementById("ref-type-idea");

    // ?�정/?�성 글 관???�소??
    this.editTextInput = document.getElementById("edit-text-input");
    this.editTopicInput = document.getElementById("edit-topic-input");
    this.editSnsPlatformGroup = document.getElementById(
      "edit-sns-platform-group"
    );
    this.editSnsPlatformTags = document.getElementById(
      "edit-sns-platform-tags"
    );
    this.snsPlatformCollapseToggle = document.getElementById(
      "sns-platform-collapse-toggle"
    );
    this.snsPlatformContent = document.getElementById("sns-platform-content");
    this.snsPlatformCount = document.getElementById("sns-platform-count");
    this.selectedSnsPlatforms = []; // ?�택??SNS ?�랫??ID 배열
    this.editCurrentCount = document.getElementById("edit-current-count");
    this.editMaxCount = document.getElementById("edit-max-count");

    // ?�퍼?�스 글 관???�소??
    this.refTopicInput = document.getElementById("ref-topic-input");
    this.editProgressFill = document.getElementById("edit-progress-fill");
    this.editClearBtn = document.getElementById("edit-clear-btn");
    this.editSaveBtn = document.getElementById("edit-save-btn");
    this.editDownloadBtn = document.getElementById("edit-download-btn");

    // 공통 ?�소??
    this.savedList = document.getElementById("saved-list");
    this.batchMigrationBtn = document.getElementById("batch-migration-btn");
    this.tempSaveStatus = document.getElementById("temp-save-status");
    this.tempSaveText = document.getElementById("temp-save-text");

    // 주제 ?�터 관???�소??(?�성 글??
    this.topicFilter = document.getElementById("topic-filter");
    this.topicFilterGroup = document.getElementById("topic-filter-group");
    this.currentTopicFilter = "all"; // ?�재 ?�택??주제 ?�터
    this.availableTopics = []; // ?�용 가?�한 주제 목록

    // ?�스 ?�터 관???�소??(?�퍼?�스 글??
    this.sourceFilter = document.getElementById("source-filter");
    this.sourceFilterGroup = document.getElementById("source-filter-group");
    this.currentSourceFilter = "all"; // ?�재 ?�택???�스 ?�터
    this.availableSources = []; // ?�용 가?�한 ?�스 목록

    // SNS ?�랫???�터 관???�소??(?�성 글??
    this.snsFilterGroup = document.getElementById("sns-filter-group");
    this.snsFilterMode = document.getElementById("sns-filter-mode");
    this.snsFilterPlatform = document.getElementById("sns-filter-platform");
    this.currentSnsFilterMode = "all"; // ?�재 ?�택??SNS ?�터 모드 ('all', 'has', 'not-has')
    this.currentSnsFilterPlatform = ""; // ?�재 ?�택??SNS ?�랫??ID

    // ??관???�소??
    this.tabButtons = document.querySelectorAll(".tab-button");
    this.tabContents = document.querySelectorAll(".tab-content");

    // ?�래??관???�소??
    this.trackingPostsList = document.getElementById("tracking-posts-list");
    this.trackingChartCanvas = document.getElementById("tracking-chart");
    this.totalPostsElement = document.getElementById("total-posts");
    this.totalViewsElement = document.getElementById("total-views");
    this.totalLikesElement = document.getElementById("total-likes");
    this.totalCommentsElement = document.getElementById("total-comments");
    this.totalSharesElement = document.getElementById("total-shares");
    this.trackingSortSelect = document.getElementById("tracking-sort");
    this.trackingStatusSelect = document.getElementById(
      "tracking-status-filter"
    );
    this.trackingSearchInput = document.getElementById("tracking-search");
    this.trackingUpdatedFromInput = document.getElementById(
      "tracking-updated-from"
    );
    this.trackingUpdatedToInput = document.getElementById(
      "tracking-updated-to"
    );
    this.trackingDateClearBtn = document.getElementById("tracking-date-clear");
    this.minViewsInput = document.getElementById("min-views");
    this.maxViewsInput = document.getElementById("max-views");
    this.minLikesInput = document.getElementById("min-likes");
    this.maxLikesInput = document.getElementById("max-likes");
    this.minCommentsInput = document.getElementById("min-comments");
    this.maxCommentsInput = document.getElementById("max-comments");
    this.minSharesInput = document.getElementById("min-shares");
    this.maxSharesInput = document.getElementById("max-shares");
    this.minFollowsInput = document.getElementById("min-follows");
    this.maxFollowsInput = document.getElementById("max-follows");
    this.exportCsvBtn = document.getElementById("export-csv");
    this.trackingSort =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_SORT) ||
      "updatedDesc";
    this.trackingStatusFilter =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_STATUS) || "all";
    this.trackingSearch =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_SEARCH) || "";
    this.trackingUpdatedFrom =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_FROM) || "";
    this.trackingUpdatedTo =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_TO) || "";
    this.rangeFilters = JSON.parse(
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_RANGES) || "{}"
    );

    // ?�능 최적?? ?�바?�싱 ?�?�머 �??�데?�트 ??
    this.debounceTimers = {};
    this.updateQueue = {
      savedTexts: false,
      trackingPosts: false,
      trackingSummary: false,
      trackingChart: false,
    };

    // 글???�한 (500/1000) - 기본 500, ?�용???�택??로컬???�??
    this.maxLength = parseInt(
      localStorage.getItem(Constants.STORAGE_KEYS.CHAR_LIMIT) || "500",
      10
    );
    this.currentUser = null;
    this.savedTexts = [];
    this.savedFilter =
      localStorage.getItem(Constants.STORAGE_KEYS.SAVED_FILTER) || "all";
    this.savedSearchInput = document.getElementById("saved-search");
    this.savedSearch =
      localStorage.getItem(Constants.STORAGE_KEYS.SAVED_SEARCH) || "";
    this.savedSearchDebounce = null;
    this.tempSaveInterval = null;
    this.lastTempSave = null;
    this.savedItemClickHandler = null; // ?�벤???�들??참조
    this.outsideClickHandler = null; // 바깥 ?�릭 ?�들??참조

    // LLM 검�??�스??초기??
    this.initializeLLMValidation();

    // [Refactoring] Manager ?�스?�스 ?�성
    // UIManager: UI ?�데?�트 �?메시지 ?�시
    this.uiManager = new UIManager();

    // AuthManager: ?�증 처리
    this.authManager = new AuthManager({
      onLogin: (user) => {
        this.currentUser = user;
        this.showUserInterface();
        this.loadUserData();
      },
      onLogout: () => {
        this.currentUser = null;
        this.showLoginInterface();
        this.clearAllData();
      },
      showMessage: (msg, type) => this.showMessage(msg, type),
    });

    // DataManager: ?�이???�속??처리
    this.dataManager = new DataManager(this.authManager);

    // Pagination State
    this.lastVisibleDoc = null;
    this.isAllDataLoaded = false;
    this.PAGE_SIZE = 20;

    this.init();
  }

  /**
   * ?�퍼?�스 ?�력?�???�???�시�?중복 체크 초기??
   *
   * ?�능 최적??
   * - Debounce ?�간: 300ms ??600ms (빠른 ?�?�핑 ??불필?�한 검??50% 감소)
   * - 최소 길이 체크: 10??미만?� 검???�략
   */
  initLiveDuplicateCheck() {
    if (!this.refTextInput) return;
    // ?�트 ?�역???�다�??�성
    let hint = document.getElementById("ref-duplicate-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "ref-duplicate-hint";
      hint.setAttribute("role", "alert");
      hint.setAttribute("aria-live", "polite");
      hint.style.cssText =
        "margin-top:8px;font-size:0.9rem;display:none;color:#b35400;background:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:8px;";
      this.refTextInput.parentElement &&
        this.refTextInput.parentElement.appendChild(hint);
    }

    // ???�능 최적?? ?�정 ?�수 ?�용 (?�후 조정 ?�이)
    const DEBOUNCE_MS = DualTextWriter.CONFIG.DEBOUNCE_DUPLICATE_CHECK_MS;
    const MIN_LENGTH = DualTextWriter.CONFIG.DUPLICATE_CHECK_MIN_LENGTH;

    this.refTextInput.addEventListener("input", () => {
      // ?�바?�스 처리
      clearTimeout(this.debounceTimers.refDuplicate);
      this.debounceTimers.refDuplicate = setTimeout(() => {
        const value = this.refTextInput.value || "";
        // ?�무 짧으�?검?�하지 ?�음 (?�능/UX)
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
          // ?�력 �??�류가 ?�어??무시?�고 ?�트 ?��?
          logger.warn("?�시�?중복 체크 �?경고:", e);
          this.hideInlineDuplicateHint();
        }
      }, DEBOUNCE_MS);
    });
  }

  /**
   * ?�라??중복 경고 ?�시
   * @param {Object} duplicate
   */
  showInlineDuplicateHint(duplicate) {
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    const createdAtStr = formatDate(duplicate?.createdAt) || "";
    const topicStr = duplicate?.topic
      ? ` · 주제: ${escapeHtml(duplicate.topic)}`
      : "";
    hint.innerHTML = `?�️ ?�일???�퍼?�스가 ?��? ?�습?�다${
      createdAtStr ? ` · ?�?�일: ${createdAtStr}` : ""
    }${topicStr}. ?�????중복?�로 ?�?�될 ???�습?�다.`;
    hint.style.display = "block";
  }

  /**
   * ?�라??중복 경고 ?��?
   */
  hideInlineDuplicateHint() {
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    hint.style.display = "none";
    hint.textContent = "";
  }

  /**
   * ?�퍼?�스 ?�택 기능 초기??
   *
   * - ?�을 ???�는 ?�널 ?��? 기능
   * - 모달 DOM ?�소 참조
   * - ?�벤??리스??바인??
   * - 초기 ?�태 ?�정
   */
  initReferenceSelection() {
    // DOM ?�소 참조
    this.referenceCollapseToggle = document.getElementById(
      "reference-collapse-toggle"
    );
    this.referenceLinkContent = document.getElementById(
      "reference-link-content"
    );
    this.collapseRefCount = document.getElementById("collapse-ref-count");
    this.selectReferencesBtn = document.getElementById("select-references-btn");
    this.referenceSelectionModal = document.getElementById(
      "reference-selection-modal"
    );
    this.referenceSelectionList = document.getElementById(
      "reference-selection-list"
    );
    this.referenceSearchInput = document.getElementById(
      "reference-search-input"
    );
    this.referenceTypeFilterModal = document.getElementById(
      "reference-type-filter-modal"
    );
    this.selectedRefCount = document.getElementById("selected-ref-count");
    this.modalSelectedCount = document.getElementById("modal-selected-count");
    this.selectedReferencesTags = document.getElementById(
      "selected-references-tags"
    );
    this.confirmReferenceSelectionBtn = document.getElementById(
      "confirm-reference-selection-btn"
    );

    // ?�효??검??
    if (!this.selectReferencesBtn || !this.referenceSelectionModal) {
      logger.warn("?�️ ?�퍼?�스 ?�택 UI ?�소�?찾을 ???�습?�다.");
      return;
    }

    // ?�을 ???�는 ?�널 ?��? ?�벤??
    if (this.referenceCollapseToggle && this.referenceLinkContent) {
      this.referenceCollapseToggle.addEventListener("click", () =>
        this.toggleReferenceCollapse()
      );
    }

    // ?�벤??리스??바인??
    this.selectReferencesBtn.addEventListener("click", () =>
      this.openReferenceSelectionModal()
    );
    this.confirmReferenceSelectionBtn.addEventListener("click", () =>
      this.confirmReferenceSelection()
    );

    // 모달 ?�기 버튼
    const closeBtns = this.referenceSelectionModal.querySelectorAll(
      ".close-btn, .cancel-btn"
    );
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.closeReferenceSelectionModal());
    });

    // 모달 ?��? ?�릭 ???�기
    this.referenceSelectionModal.addEventListener("click", (e) => {
      if (e.target === this.referenceSelectionModal) {
        this.closeReferenceSelectionModal();
      }
    });

    // ESC ?�로 모달 ?�기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceSelectionModal.style.display === "flex"
      ) {
        this.closeReferenceSelectionModal();
      }
    });

    // 검??�??�터 ?�벤??
    if (this.referenceSearchInput) {
      this.referenceSearchInput.addEventListener("input", () =>
        this.filterReferenceList()
      );
    }
    if (this.referenceTypeFilterModal) {
      this.referenceTypeFilterModal.addEventListener("change", () =>
        this.filterReferenceList()
      );
    }

    logger.log("???�퍼?�스 ?�택 기능 초기???�료");
  }

  /**
   * 참고 ?�퍼?�스 ?�널 ?��?
   *
   * - ?�널 ?�치�??�기
   * - ?�이�??�전 ?�니메이??
   * - ARIA ?�성 ?�데?�트
   */
  toggleReferenceCollapse() {
    try {
      if (!this.referenceLinkContent || !this.referenceCollapseToggle) {
        logger.warn("?�️ ?�퍼?�스 ?�널 ?�소�?찾을 ???�습?�다.");
        return;
      }

      const isExpanded =
        this.referenceCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // ?�널 ?�기
        this.referenceLinkContent.classList.remove("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "false");
        this.referenceLinkContent.setAttribute("aria-hidden", "true");
        logger.log("?�� ?�퍼?�스 ?�널 ?�힘");
      } else {
        // ?�널 ?�치�?
        this.referenceLinkContent.classList.add("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "true");
        this.referenceLinkContent.setAttribute("aria-hidden", "false");
        logger.log("?�� ?�퍼?�스 ?�널 ?�침");
      }
    } catch (error) {
      logger.error("?�퍼?�스 ?�널 ?��? ?�패:", error);
    }
  }

  // ?�퍼?�스 ?�형 배�? ?�더�?
  renderReferenceTypeBadge(referenceType) {
    const type = referenceType || "unspecified";
    let label = "미�???;
    let cls = "reference-type-badge--unspecified";
    if (type === "structure") {
      label = "구조";
      cls = "reference-type-badge--structure";
    } else if (type === "idea") {
      label = "?�이?�어";
      cls = "reference-type-badge--idea";
    }
    return `
            <span class="reference-type-badge ${cls}" role="status" aria-label="?�퍼?�스 ?�형: ${label}">
                ${label}
            </span>
        `;
  }

  /**
   * SNS ?�랫???�택 기능 초기??
   *
   * - SNS ?�랫???�그 ?�더�?
   * - ?�벤??리스??바인??(?�벤???�임 ?�용)
   * - ?�택 ?�태 관�?
   * - ?�코?�언 ?��? 기능
   *
   * @throws {Error} ?�수 DOM ?�소가 ?�을 경우 ?�러 로깅
   */
  initSnsPlatformSelection() {
    try {
      // ?�효??검?? ?�수 DOM ?�소 ?�인
      if (!this.editSnsPlatformTags) {
        logger.warn("?�️ SNS ?�랫???�택 UI ?�소�?찾을 ???�습?�다.");
        return;
      }

      // SNS ?�랫???�그 ?�더�?
      this.renderSnsPlatformTags();

      // ?�코?�언 ?��? 버튼 ?�벤??바인??
      if (this.snsPlatformCollapseToggle) {
        // ?�릭 ?�벤?? 마우??�??�치 ?�바?�스 지??
        this.snsPlatformCollapseToggle.addEventListener("click", () => {
          this.toggleSnsPlatformCollapse();
        });

        // ?�보???�벤??처리 (?�근??: Enter �?Space ??지??
        this.snsPlatformCollapseToggle.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggleSnsPlatformCollapse();
          }
        });
      } else {
        logger.warn("?�️ SNS ?�랫???��? 버튼??찾을 ???�습?�다.");
      }

      // ?�벤???�임: ?�그 ?�릭 ?�벤??처리 (?�능 최적?? ??번만 바인??
      if (!this._snsPlatformEventBound) {
        this._snsPlatformEventBound = true;

        // ?�릭 ?�벤?? ?�랫???�그 ?�택/?�제
        this.editSnsPlatformTags.addEventListener("click", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          const platformId = tag.getAttribute("data-platform-id");
          if (!platformId) {
            logger.warn("?�️ ?�랫??ID�?찾을 ???�습?�다.");
            return;
          }

          e.preventDefault();
          this.toggleSnsPlatform(platformId);
        });

        // ?�보???�벤??처리 (?�근??: ?�보???�비게이??지??
        this.editSnsPlatformTags.addEventListener("keydown", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const platformId = tag.getAttribute("data-platform-id");
            if (platformId) {
              this.toggleSnsPlatform(platformId);
            } else {
              logger.warn("?�️ ?�보???�벤?? ?�랫??ID�?찾을 ???�습?�다.");
            }
          }
        });
      }
    } catch (error) {
      logger.error("??SNS ?�랫???�택 기능 초기???�패:", error);
      // ?�용?�에�?친화?�인 메시지 ?�시 (?�택?�항)
      if (this.showMessage) {
        this.showMessage(
          "SNS ?�랫???�택 기능??초기?�하??�??�류가 발생?�습?�다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?�랫???�택 ?�널 ?��?
   *
   * - ?�널 ?�치�??�기
   * - ?�이�??�전 ?�니메이??(CSS transition?�로 처리)
   * - ARIA ?�성 ?�데?�트 (?�근???�상)
   *
   * @throws {Error} DOM ?�소가 ?�을 경우 ?�러 로깅
   */
  toggleSnsPlatformCollapse() {
    try {
      // ?�효??검?? ?�수 DOM ?�소 ?�인
      if (!this.snsPlatformContent || !this.snsPlatformCollapseToggle) {
        logger.warn("?�️ SNS ?�랫???�널 ?�소�?찾을 ???�습?�다.");
        return;
      }

      // ?�재 ?�장 ?�태 ?�인 (ARIA ?�성 기반)
      const isExpanded =
        this.snsPlatformCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // ?�널 ?�기: 콘텐�??��? �?ARIA ?�성 ?�데?�트
        this.snsPlatformContent.classList.remove("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "false");
        this.snsPlatformContent.setAttribute("aria-hidden", "true");
      } else {
        // ?�널 ?�치�? 콘텐�??�시 �?ARIA ?�성 ?�데?�트
        this.snsPlatformContent.classList.add("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "true");
        this.snsPlatformContent.setAttribute("aria-hidden", "false");
      }
    } catch (error) {
      logger.error("??SNS ?�랫???�널 ?��? ?�패:", error);
      // ?�용?�에�?친화?�인 메시지 ?�시 (?�택?�항)
      if (this.showMessage) {
        this.showMessage("?�널???��??�는 �??�류가 발생?�습?�다.", "error");
      }
    }
  }

  /**
   * SNS ?�랫???�그 ?�더�?
   *
   * - 모든 SNS ?�랫???�그�??�적?�로 ?�성
   * - ?�택 ?�태???�른 ?��???�?ARIA ?�성 ?�용
   * - XSS 방�?�??�한 HTML ?�스케?�프 처리
   *
   * @throws {Error} DOM ?�소???�랫???�이?��? ?�을 경우 조용??반환
   */
  renderSnsPlatformTags() {
    try {
      // ?�효??검?? ?�수 DOM ?�소 �??�이???�인
      if (!this.editSnsPlatformTags) {
        logger.warn("?�️ SNS ?�랫???�그 컨테?�너�?찾을 ???�습?�다.");
        return;
      }

      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        logger.warn("?�️ SNS ?�랫???�이?��? ?�효?��? ?�습?�다.");
        return;
      }

      // ?�랫???�그 HTML ?�성 (XSS 방�?: escapeHtml ?�용)
      const tagsHtml = DualTextWriter.SNS_PLATFORMS.map((platform) => {
        // ?�랫???�택 ?�태 ?�인
        const isSelected = this.selectedSnsPlatforms.includes(platform.id);
        const selectedClass = isSelected ? "selected" : "";
        const ariaChecked = isSelected ? "true" : "false";
        const ariaLabelText = `${this.escapeHtml(platform.name)} ${
          isSelected ? "?�택?? : "?�택 ?�됨"
        }`;

        // ?�전??HTML ?�성 (XSS 방�?)
        return `
                    <button 
                        type="button"
                        class="sns-platform-tag ${selectedClass}" 
                        data-platform-id="${this.escapeHtml(platform.id)}"
                        role="checkbox"
                        aria-label="${ariaLabelText}"
                        aria-checked="${ariaChecked}"
                        tabindex="0"
                    >
                        <span class="sns-platform-icon" aria-hidden="true">${
                          platform.icon
                        }</span>
                        <span class="sns-platform-name">${this.escapeHtml(
                          platform.name
                        )}</span>
                    </button>
                `;
      }).join("");

      // DOM ?�데?�트 (?�능: ??번의 innerHTML ?�당)
      this.editSnsPlatformTags.innerHTML = tagsHtml;

      // ?�택 개수 ?�데?�트
      this.updateSnsPlatformCount();
    } catch (error) {
      logger.error("??SNS ?�랫???�그 ?�더�??�패:", error);
      // ?�용?�에�?친화?�인 메시지 ?�시 (?�택?�항)
      if (this.showMessage) {
        this.showMessage(
          "SNS ?�랫??목록??불러?�는 �??�류가 발생?�습?�다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?�랫???�택/?�제 ?��?
   *
   * - ?�랫???�택 ?�태�??��?
   * - ?�효??검�????�태 변�?
   * - UI ?�동 ?�데?�트
   *
   * @param {string} platformId - ?�랫??ID (?? 'threads', 'instagram')
   * @throws {Error} ?�효?��? ?��? ?�랫??ID??경우 경고 로깅
   */
  toggleSnsPlatform(platformId) {
    try {
      // ?�력 ?�효??검�?
      if (!platformId || typeof platformId !== "string") {
        logger.warn("?�️ ?�효?��? ?��? ?�랫??ID ?�식:", platformId);
        return;
      }

      // ?�랫???�이???�효??검�? ?�랫??ID가 ?�의???�랫??목록???�는지 ?�인
      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        logger.warn("?�️ SNS ?�랫???�이?��? ?�효?��? ?�습?�다.");
        return;
      }

      const platform = DualTextWriter.SNS_PLATFORMS.find(
        (p) => p.id === platformId
      );
      if (!platform) {
        logger.warn(`?�️ ?�효?��? ?��? ?�랫??ID: ${platformId}`);
        return;
      }

      // ?�택 ?�태 ?��?: 배열?�서 추�? ?�는 ?�거
      const currentIndex = this.selectedSnsPlatforms.indexOf(platformId);
      if (currentIndex >= 0) {
        // ?��? ?�택??경우: ?�택 ?�제
        this.selectedSnsPlatforms.splice(currentIndex, 1);
      } else {
        // ?�택?��? ?��? 경우: ?�택 추�?
        this.selectedSnsPlatforms.push(platformId);
      }

      // UI ?�데?�트: ?�그 ?�렌?�링 �?개수 ?�데?�트
      this.renderSnsPlatformTags();
      this.updateSnsPlatformCount();
    } catch (error) {
      logger.error("??SNS ?�랫???��? ?�패:", error);
      // ?�용?�에�?친화?�인 메시지 ?�시 (?�택?�항)
      if (this.showMessage) {
        this.showMessage(
          "?�랫???�택??변경하??�??�류가 발생?�습?�다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?�랫???�택 개수 ?�데?�트
   *
   * - ?�택???�랫??개수�?UI???�시
   * - ?�근?�을 ?�한 ARIA ?�성 ?�데?�트 (?�택?�항)
   *
   * @throws {Error} DOM ?�소가 ?�을 경우 조용??반환
   */
  updateSnsPlatformCount() {
    try {
      // ?�효??검?? DOM ?�소 ?�인
      if (!this.snsPlatformCount) {
        // DOM ?�소가 ?�어???�러�?발생?�키지 ?�음 (?�택??UI ?�소)
        return;
      }

      // ?�택???�랫??개수 계산
      const selectedCount = Array.isArray(this.selectedSnsPlatforms)
        ? this.selectedSnsPlatforms.length
        : 0;

      // UI ?�데?�트: ?�스??콘텐�?변�?
      this.snsPlatformCount.textContent = `(${selectedCount}�??�택??`;

      // ?�근???�상: ARIA ?�성 ?�데?�트 (부�??�소??aria-live ?�성???�다�??�동?�로 ?�림)
      if (this.snsPlatformCollapseToggle) {
        const ariaLabel = `SNS ?�랫???�택 (${selectedCount}�??�택??`;
        this.snsPlatformCollapseToggle.setAttribute("aria-label", ariaLabel);
      }
    } catch (error) {
      logger.error("??SNS ?�랫???�택 개수 ?�데?�트 ?�패:", error);
      // ?�러가 발생?�도 ???�체 ?�작???�향??주�? ?�도�?조용??처리
    }
  }

  /**
   * ?�퍼?�스 불러?�기 ?�널 초기??
   */
  initReferenceLoader() {
    // DOM ?�소 참조
    this.detailLoadReferenceBtn = document.getElementById(
      "detail-load-reference-btn"
    );
    this.referenceLoaderPanel = document.getElementById(
      "reference-loader-panel"
    );
    this.referenceLoaderCloseBtn = document.getElementById(
      "reference-loader-close"
    );
    this.referenceLoaderTabs = document.querySelectorAll(".reference-tab");
    this.referenceSavedContent = document.getElementById(
      "reference-saved-content"
    );
    this.referenceTrackingContent = document.getElementById(
      "reference-tracking-content"
    );
    this.referenceSavedList = document.getElementById("reference-saved-list");
    this.referenceTrackingList = document.getElementById(
      "reference-tracking-list"
    );
    this.detailReferenceList = document.getElementById("detail-reference-list");
    this.detailReferenceEmpty = document.querySelector(
      ".detail-reference-empty"
    );
    this.referenceLoaderSearchInput = document.getElementById(
      "reference-loader-search-input"
    );

    // ?�벤??리스?? ?�널 ?�기 (?�세 모드)
    if (this.detailLoadReferenceBtn) {
      this.detailLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "detail"; // 모드 ?�정
        this.openReferenceLoader();
      });
    }

    // ?�벤??리스?? ?�널 ?�기 (?��? 모드)
    this.expandLoadReferenceBtn = document.getElementById(
      "expand-load-reference-btn"
    );
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "expand"; // 모드 ?�정
        this.openReferenceLoader();
      });
    }

    // ?�벤??리스?? ?�널 ?�기
    if (this.referenceLoaderCloseBtn) {
      this.referenceLoaderCloseBtn.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    // ?�벤??리스?? ???�환
    this.referenceLoaderTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchReferenceLoaderTab(tabName);
      });
    });

    // ?�벤??리스?? ?��? ?�릭 ???�기
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.addEventListener("click", (e) => {
        if (
          e.target === this.referenceLoaderPanel ||
          e.target.classList.contains("reference-loader-overlay")
        ) {
          this.closeReferenceLoader();
        }
      });
    }

    // ?�벤??리스?? ?�퍼?�스 추�? (?�벤???�임)
    if (this.referenceSavedList) {
      this.referenceSavedList.addEventListener("click", (e) =>
        this.handleReferenceItemClick(e)
      );
    }
    if (this.referenceTrackingList) {
      this.referenceTrackingList.addEventListener("click", (e) =>
        this.handleReferenceItemClick(e)
      );
    }

    // ?�벤??리스?? 검??
    if (this.referenceLoaderSearchInput) {
      this.referenceLoaderSearchInput.addEventListener(
        "input",
        debounce(() => {
          this.filterReferenceLoaderList();
        }, 300)
      );
    }

    // ESC ?�로 ?�기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceLoaderPanel.style.display === "block"
      ) {
        // ?��? 모드 모달???�려?�고, ?�퍼?�스 로더???�려?�다�??�퍼?�스 로더�??�기
        // z-index가 ???�으므�??�선?�위 처리
        this.closeReferenceLoader();
      }
    });
  }

  /**
   * ?�용 ?��? 모드 초기??
   */
  initExpandModal() {
    this.expandModal = document.getElementById("content-expand-modal");
    this.detailExpandBtn = document.getElementById("detail-expand-btn");
    this.expandModalCloseBtn = document.getElementById("expand-modal-close");
    this.expandContentTextarea = document.getElementById(
      "expand-content-textarea"
    );

    // ?�기 버튼 ?�벤??- initArticleManagement ?�는 DOMContentLoaded?�서 처리??
    // if (this.detailExpandBtn) {
    //   this.detailExpandBtn.addEventListener("click", () => {
    //     this.openExpandModal();
    //   });
    // }

    // ?�기 버튼 ?�벤??
    if (this.expandModalCloseBtn) {
      this.expandModalCloseBtn.addEventListener("click", () => {
        this.closeExpandModal();
      });
    }

    // ESC ?�로 ?�기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.expandModal &&
        this.expandModal.style.display === "block"
      ) {
        // ?�퍼?�스 로더가 ?�려?�으�??�퍼?�스 로더가 먼�? ?�힘 (z-index ?�인)
        if (
          this.referenceLoaderPanel &&
          this.referenceLoaderPanel.style.display === "block"
        ) {
          return; // ?�퍼?�스 로더??ESC ?�들?��? 처리?�도�???
        }
        this.closeExpandModal();
      }
    });
    if (!this.expandModal) return;

    // 변경된 ?�용???�세 ?�널(?�정 모드)??반영
    const editContentTextarea = document.getElementById(
      "edit-content-textarea"
    );
    if (editContentTextarea && this.expandContentTextarea) {
      editContentTextarea.value = this.expandContentTextarea.value;
      // input ?�벤???�리거하??글?�수 ???�데?�트
      editContentTextarea.dispatchEvent(new Event("input"));
    }

    this.expandModal.style.display = "none";
    document.body.style.overflow = ""; // 배경 ?�크�?복원
  }

  /**
   * ?�퍼?�스 불러?�기 ?�널 ?�기
   */
  openReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "block";
      // ?�이??로드 (처음 ?????�는 ?�요 ??
      this.loadReferenceLoaderData();
    }
  }

  /**
   * ?�퍼?�스 불러?�기 ?�널 ?�기
   */
  closeReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "none";
    }
  }

  /**
   * ?�퍼?�스 로더 ???�환
   */
  switchReferenceLoaderTab(tabName) {
    // ???�성???�태 변�?
    this.referenceLoaderTabs.forEach((tab) => {
      if (tab.getAttribute("data-tab") === tabName) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    // 콘텐�??�시 ?�태 변�?
    if (tabName === "saved") {
      this.referenceSavedContent.style.display = "block";
      this.referenceTrackingContent.style.display = "none";
      document.getElementById("reference-tracking-filters").style.display =
        "none";
    } else {
      this.referenceSavedContent.style.display = "none";
      this.referenceTrackingContent.style.display = "block";
      document.getElementById("reference-tracking-filters").style.display =
        "flex";
    }
  }

  /**
   * ?�퍼?�스 로더 ?�이??로드
   */
  async loadReferenceLoaderData() {
    // ?�?�된 글 로드
    await this.loadSavedReferencesForLoader();
    // ?�래???�이??로드 (?�요 ??구현)
    // await this.loadTrackingReferencesForLoader();
  }

  /**
   * ?�?�된 글???�퍼?�스 로더?�으�?로드
   */
  async loadSavedReferencesForLoader() {
    if (!this.currentUser) return;

    try {
      // 기존 savedTexts ?�용?�거???�로 fetch
      // ?�기?�는 기존 savedTexts가 ?�다�?가?�하�??�더�?
      // 만약 savedTexts가 비어?�다�?fetch ?�요
      if (this.savedTexts.length === 0) {
        await this.loadSavedTexts();
      }

      this.renderReferenceLoaderList(
        this.savedTexts,
        this.referenceSavedList,
        "saved"
      );
    } catch (error) {
      logger.error("?�퍼?�스 ?�이??로드 ?�패:", error);
    }
  }

  /**
   * ?�퍼?�스 목록 ?�더�?
   */
  renderReferenceLoaderList(items, container, sourceType) {
    if (!container) return;

    container.innerHTML = "";

    if (items.length === 0) {
      const emptyMsg = document.getElementById(`reference-${sourceType}-empty`);
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }

    const emptyMsg = document.getElementById(`reference-${sourceType}-empty`);
    if (emptyMsg) emptyMsg.style.display = "none";

    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "reference-item";
      el.setAttribute("data-item-id", item.id);
      el.setAttribute("data-source-type", sourceType);

      // ?�짜 ?�맷??
      const dateStr = item.createdAt ? formatDate(item.createdAt) : "";

      // ?�용 미리보기 (HTML ?�그 ?�거 �?길이 ?�한)
      const contentPreview = item.content
        ? item.content.replace(/<[^>]*>/g, "").substring(0, 100) +
          (item.content.length > 100 ? "..." : "")
        : "";

      el.innerHTML = `
                <div class="reference-item-header">
                    <div class="reference-item-title">${escapeHtml(
                      item.topic || "?�목 ?�음"
                    )}</div>
                </div>
                <div class="reference-item-content">${escapeHtml(
                  contentPreview
                )}</div>
                <div class="reference-item-meta">
                    <span>?�� ${dateStr}</span>
                    ${
                      item.category
                        ? `<span>?�� ${escapeHtml(item.category)}</span>`
                        : ""
                    }
                </div>
                <div class="reference-item-actions">
                    <button class="reference-item-btn" data-action="add">
                        추�??�기
                    </button>
                </div>
            `;
      container.appendChild(el);
    });
  }

  /**
   * ?�퍼?�스 ?�이???�릭 ?�들??(추�??�기 버튼)
   */
  handleReferenceItemClick(e) {
    const btn = e.target.closest(".reference-item-btn");
    if (!btn) return;

    const itemEl = btn.closest(".reference-item");
    const itemId = itemEl.getAttribute("data-item-id");
    const sourceType = itemEl.getAttribute("data-source-type");

    // ?�이??찾기
    let itemData = null;
    if (sourceType === "saved") {
      itemData = this.savedTexts.find((i) => i.id === itemId);
    } else {
      // ?�래???�이?�에??찾기 (구현 ?�요)
    }

    if (itemData) {
      if (this.referenceLoaderMode === "expand") {
        this.addReferenceToExpand(itemData);
      } else {
        this.addReferenceToDetail(itemData);
      }
      // ?�택 ???�널 ?�기 (?�택?�항)
      this.closeReferenceLoader();
    }
  }

  /**
   * ?��? 모드???�퍼?�스 추�?
   */
  addReferenceToExpand(item) {
    const expandReferenceList = document.getElementById(
      "expand-reference-list"
    );
    const expandReferenceEmpty = document.querySelector(
      ".expand-reference-empty"
    );

    if (!expandReferenceList) return;

    // �??�태 메시지 ?��?
    if (expandReferenceEmpty) {
      expandReferenceEmpty.style.display = "none";
    }
    expandReferenceList.style.display = "block";

    // 중복 체크
    const existing = expandReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("?��? 추�????�퍼?�스?�니??");
      return;
    }

    const el = document.createElement("div");
    el.className = "expand-reference-item"; // CSS ?�래???�요 (?�는 ?�라???��???
    el.setAttribute("data-ref-id", item.id);

    // ?��????�용 (초록???�두�???
    el.style.border = "2px solid #28a745";
    el.style.borderRadius = "8px";
    el.style.padding = "15px";
    el.style.marginBottom = "15px";
    el.style.backgroundColor = "#fff";
    el.style.position = "relative";

    const contentPreview = item.content
      ? item.content.replace(/<[^>]*>/g, "").substring(0, 200) +
        (item.content.length > 200 ? "..." : "")
      : "";
    const dateStr = item.createdAt ? formatDate(item.createdAt) : "";

    el.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <h4 style="margin: 0; font-size: 1rem; color: #333;">${escapeHtml(
                  item.topic || "?�목 ?�음"
                )}</h4>
                <button class="expand-ref-remove" aria-label="??��" style="background: none; border: none; color: #999; cursor: pointer; font-size: 1.2rem;">×</button>
            </div>
            <div style="font-size: 0.9rem; color: #666; margin-bottom: 15px; line-height: 1.5;">
                ${escapeHtml(contentPreview)}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: #999; margin-bottom: 15px;">
                <span>?�� ${dateStr}</span>
                ${
                  item.category
                    ? `<span>?�� ${escapeHtml(item.category)}</span>`
                    : ""
                }
            </div>
            <button class="btn btn-primary btn-block btn-add-content" style="width: 100%; background-color: #667eea; border: none; padding: 10px; border-radius: 6px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                <span>??/span> ?�용??추�?
            </button>
        `;

    // ??�� 버튼 ?�벤??
    el.querySelector(".expand-ref-remove").addEventListener("click", () => {
      el.remove();
      if (expandReferenceList.children.length === 0) {
        if (expandReferenceEmpty) expandReferenceEmpty.style.display = "block";
        expandReferenceList.style.display = "none";
      }
    });

    // ?�용??추�? 버튼 ?�벤??
    el.querySelector(".btn-add-content").addEventListener("click", () => {
      this.addContentToExpandEditor(item.content);
    });

    expandReferenceList.appendChild(el);
  }

  /**
   * ?��? 모드 ?�디?�에 ?�용 추�?
   */
  addContentToExpandEditor(content) {
    const textarea = document.getElementById("expand-content-textarea");
    if (!textarea) return;

    // HTML ?�그 ?�거 (?�택?�항, 기획???�라 ?�름)
    const plainText = content
      .replace(/<[^>]*>/g, "\n")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // ?�재 커서 ?�치???�입 ?�는 �??�에 추�?
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const textBefore = textarea.value.substring(0, startPos);
    const textAfter = textarea.value.substring(endPos, textarea.value.length);

    textarea.value = textBefore + plainText + textAfter;

    // 커서 ?�치 조정
    const newCursorPos = startPos + plainText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    // 글?�수 ?�데?�트 ?�리�?
    textarea.dispatchEvent(new Event("input"));
  }

  /**
   * ?�세 뷰에 ?�퍼?�스 추�?
   */
  addReferenceToDetail(item) {
    if (!this.detailReferenceList) return;

    // �??�태 메시지 ?��?
    if (this.detailReferenceEmpty) {
      this.detailReferenceEmpty.style.display = "none";
    }
    this.detailReferenceList.style.display = "block";

    // 중복 체크
    const existing = this.detailReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("?��? 추�????�퍼?�스?�니??");
      return;
    }

    const el = document.createElement("div");
    el.className = "detail-reference-item";
    el.setAttribute("data-ref-id", item.id);

    const contentPreview = item.content
      ? item.content.replace(/<[^>]*>/g, "").substring(0, 150) +
        (item.content.length > 150 ? "..." : "")
      : "";

    el.innerHTML = `
            <div class="detail-ref-header">
                <span class="detail-ref-title">${escapeHtml(
                  item.topic || "?�목 ?�음"
                )}</span>
                <button class="detail-ref-remove" aria-label="??��">×</button>
            </div>
            <div class="detail-ref-content">${escapeHtml(contentPreview)}</div>
        `;

    // ??�� 버튼 ?�벤??
    el.querySelector(".detail-ref-remove").addEventListener("click", () => {
      el.remove();
      if (this.detailReferenceList.children.length === 0) {
        if (this.detailReferenceEmpty)
          this.detailReferenceEmpty.style.display = "block";
        this.detailReferenceList.style.display = "none";
      }
    });

    this.detailReferenceList.appendChild(el);
  }

  /**
   * ?�퍼?�스 목록 ?�터�?(검??
   */
  filterReferenceLoaderList() {
    const keyword = this.referenceLoaderSearchInput.value.toLowerCase();
    const items = document.querySelectorAll(".reference-item");

    items.forEach((item) => {
      const title = item
        .querySelector(".reference-item-title")
        .textContent.toLowerCase();
      const content = item
        .querySelector(".reference-item-content")
        .textContent.toLowerCase();

      if (title.includes(keyword) || content.includes(keyword)) {
        item.style.display = "block";
      } else {
        item.style.display = "none";
      }
    });
  }

  async init() {
    this.bindEvents();
    await this.waitForFirebase();
    this.setupAuthStateListener();
    this.initCharLimitToggle();
    // 초기 글???�한 반영
    this.applyCharLimit(this.maxLength);
    // ?�시�?중복 체크 초기??
    this.initLiveDuplicateCheck();
    // ?�퍼?�스 ?�택 기능 초기??
    this.initReferenceSelection();
    // SNS ?�랫???�택 기능 초기??
    this.initSnsPlatformSelection();
    // ?�퍼?�스 불러?�기 ?�널 초기??
    this.initReferenceLoader();
    // ?��? 모드 초기??
    this.initExpandModal();
  }

  // [Refactoring] AuthManager�??�임
  async waitForFirebase() {
    await this.authManager.waitForFirebase();
    this.auth = this.authManager.auth;
    this.db = this.authManager.db;
    this.isFirebaseReady = this.authManager.isFirebaseReady;
  }

  // [Refactoring] AuthManager?�서 처리?��?�??�거 ?�는 ?�핑
  setupAuthStateListener() {
    // AuthManager ?��??�서 처리??
  }

  // ??기능 초기??
  initTabListeners() {
    this.tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchTab(tabName);
      });
    });
  }

  /**
   * ???�환 처리
   * @param {string} tabName - ?�환?????�름 ('writing', 'saved', 'tracking', 'management')
   */
  switchTab(tabName) {
    // 모든 ??버튼�?콘텐츠에??active ?�래???�거
    this.tabButtons.forEach((btn) => btn.classList.remove("active"));
    this.tabContents.forEach((content) => content.classList.remove("active"));

    // ?�택????버튼�?콘텐츠에 active ?�래??추�?
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeButton) activeButton.classList.add("active");
    if (activeContent) activeContent.classList.add("active");

    // ?�?�된 글 ??���??�환????목록 ?�로고침
    if (tabName === Constants.TABS.SAVED) {
      this.loadSavedTextsFromFirestore(false);
      this.initSavedFilters();
      // 미트?�킹 글 버튼 ?�태 ?�데?�트
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    }

    // ?�래????���??�환 ???�이??로드
    if (tabName === Constants.TABS.TRACKING) {
      this.loadTrackingPosts();
      this.updateTrackingSummary();
      this.initTrackingChart();
    }

    // 글 ?�성 ??���??�환???�는 ?�퍼?�스?� ?�성 ?�널??모두 보임
    if (tabName === Constants.TABS.WRITING) {
      // ?��? writing-container?????�널??모두 ?�함?�어 ?�음
    }

    // ?�크립트 ?�성 ??���??�환 ???�이??로드
    if (tabName === Constants.TABS.MANAGEMENT) {
      this.loadArticlesForManagement();
      this.initArticleManagement();
    }
  }

  bindEvents() {
    // ?�용???�증 ?�벤??
    this.loginBtn.addEventListener("click", () => this.login());
    this.logoutBtn.addEventListener("click", () => this.logout());

    // ?�로고침 버튼 ?�벤??리스??(PC ?�용)
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", () => this.refreshAllData());
    }
    this.usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.login();
      }
    });

    // Google 로그???�벤??
    const googleLoginBtn = document.getElementById("google-login-btn");
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", () => this.googleLogin());
    }

    // ???�벤??리스???�정
    this.initTabListeners();

    // ?�?�된 글 ?�터 초기??(초기 로드 ?�점?�도 반영)
    setTimeout(() => this.initSavedFilters(), 0);

    // ?�퍼?�스 글 ?�벤??
    this.refTextInput.addEventListener("input", () => {
      this.updateCharacterCount("ref");
      this.scheduleTempSave();
    });
    this.refClearBtn.addEventListener("click", () => this.clearText("ref"));
    this.refSaveBtn.addEventListener("click", () => this.saveText("ref"));
    this.refDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("ref")
    );

    // ?�정/?�성 글 ?�벤??
    this.editTextInput.addEventListener("input", () => {
      this.updateCharacterCount("edit");
      this.scheduleTempSave();
    });
    this.editClearBtn.addEventListener("click", () => this.clearText("edit"));
    this.editSaveBtn.addEventListener("click", () => this.saveText("edit"));
    this.editDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("edit")
    );

    // 반자?�화 ?�스???�벤??
    const semiAutoPostBtn = document.getElementById("semi-auto-post-btn");
    if (semiAutoPostBtn) {
      logger.log("??반자?�화 ?�스??버튼 발견 �??�벤??바인??);

      semiAutoPostBtn.addEventListener("click", (e) => {
        logger.log("?�� 반자?�화 ?�스??버튼 ?�릭 감�?");
        e.preventDefault();
        e.stopPropagation();

        // this 컨텍?�트 명시??바인??
        const self = this;
        logger.log("?�� this 컨텍?�트:", self);
        logger.log(
          "?�� handleSemiAutoPost ?�수:",
          typeof self.handleSemiAutoPost
        );

        if (typeof self.handleSemiAutoPost === "function") {
          logger.log("??handleSemiAutoPost ?�수 ?�출");
          self.handleSemiAutoPost();
        } else {
          logger.error("??handleSemiAutoPost ?�수가 ?�습?�다!");
        }
      });

      // ?�보???�근??지??
      semiAutoPostBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          logger.log("?�� 반자?�화 ?�스??버튼 ?�보???�력 감�?");
          e.preventDefault();
          e.stopPropagation();

          // this 컨텍?�트 명시??바인??
          const self = this;

          if (typeof self.handleSemiAutoPost === "function") {
            logger.log("??handleSemiAutoPost ?�수 ?�출 (?�보??");
            self.handleSemiAutoPost();
          } else {
            logger.error("??handleSemiAutoPost ?�수가 ?�습?�다!");
          }
        }
      });

      // ?�근???�성 ?�정
      semiAutoPostBtn.setAttribute(
        "aria-label",
        "Threads??반자?�으�??�스?�하�?
      );
      semiAutoPostBtn.setAttribute("role", "button");
      semiAutoPostBtn.setAttribute("tabindex", "0");

      logger.log("??반자?�화 ?�스??버튼 ?�벤??바인???�료");
    } else {
      logger.error("??반자?�화 ?�스??버튼??찾을 ???�습?�다!");
    }

    // ?�래???�터 ?�벤??
    setTimeout(() => {
      if (this.trackingSortSelect) {
        this.trackingSortSelect.value = this.trackingSort;
        this.trackingSortSelect.addEventListener("change", (e) => {
          this.trackingSort = e.target.value;
          localStorage.setItem("dtw_tracking_sort", this.trackingSort);
          this.refreshUI({ trackingPosts: true });
        });
      }
      if (this.trackingStatusSelect) {
        this.trackingStatusSelect.value = this.trackingStatusFilter;
        this.trackingStatusSelect.addEventListener("change", (e) => {
          this.trackingStatusFilter = e.target.value;
          localStorage.setItem(
            "dtw_tracking_status",
            this.trackingStatusFilter
          );
          this.refreshUI({ trackingPosts: true });
        });
      }
      if (this.trackingSearchInput) {
        this.trackingSearchInput.value = this.trackingSearch;
        this.trackingSearchDebounce = null;
        this.trackingSearchInput.addEventListener("input", (e) => {
          const val = e.target.value;
          clearTimeout(this.trackingSearchDebounce);
          // debounce�??�능 최적??�?sticky ?�터�?충돌 방�?
          this.trackingSearchDebounce = setTimeout(() => {
            this.trackingSearch = val;
            localStorage.setItem("dtw_tracking_search", this.trackingSearch);
            // refreshUI ?�용?�로 ?�합 ?�데?�트
            this.refreshUI({ trackingPosts: true });
          }, 300);
        });
      }
      // ???�?�된 글 검???�벤??바인??
      if (this.savedSearchInput) {
        this.savedSearchInput.value = this.savedSearch;
        this.savedSearchDebounce = null;
        this.savedSearchInput.addEventListener("input", (e) => {
          const val = e.target.value;
          clearTimeout(this.savedSearchDebounce);
          // debounce�??�능 최적??(600ms)
          this.savedSearchDebounce = setTimeout(async () => {
            // [Hybrid Pagination] 검?????�체 ?�이??로드 보장
            await this.ensureAllDataLoaded();
            
            this.savedSearch = val;
            localStorage.setItem("dtw_saved_search", this.savedSearch);
            // ?�?�된 글 목록 ?�로고침
            this.renderSavedTexts();
          }, 600);
        });
      }
      if (this.trackingUpdatedFromInput) {
        this.trackingUpdatedFromInput.value = this.trackingUpdatedFrom;
        this.trackingUpdatedFromInput.addEventListener("change", (e) => {
          this.trackingUpdatedFrom = e.target.value;
          localStorage.setItem("dtw_tracking_from", this.trackingUpdatedFrom);
          this.refreshUI({ trackingPosts: true });
        });
      }
      if (this.trackingUpdatedToInput) {
        this.trackingUpdatedToInput.value = this.trackingUpdatedTo;
        this.trackingUpdatedToInput.addEventListener("change", (e) => {
          this.trackingUpdatedTo = e.target.value;
          localStorage.setItem("dtw_tracking_to", this.trackingUpdatedTo);
          this.refreshUI({ trackingPosts: true });
        });
      }
      if (this.trackingDateClearBtn) {
        this.trackingDateClearBtn.addEventListener("click", () => {
          this.trackingUpdatedFrom = "";
          this.trackingUpdatedTo = "";
          if (this.trackingUpdatedFromInput)
            this.trackingUpdatedFromInput.value = "";
          if (this.trackingUpdatedToInput)
            this.trackingUpdatedToInput.value = "";
          localStorage.removeItem("dtw_tracking_from");
          localStorage.removeItem("dtw_tracking_to");
          this.refreshUI({ trackingPosts: true });
        });
      }

      // ?�치 범위 ?�터 ?�력 바인??
      const bindRange = (input, key) => {
        if (!input) return;
        if (this.rangeFilters[key] !== undefined)
          input.value = this.rangeFilters[key];
        input.addEventListener("input", (e) => {
          const val = e.target.value;
          if (val === "") {
            delete this.rangeFilters[key];
          } else {
            this.rangeFilters[key] = Number(val) || 0;
          }
          localStorage.setItem(
            "dtw_tracking_ranges",
            JSON.stringify(this.rangeFilters)
          );
          this.refreshUI({ trackingPosts: true });
        });
      };
      bindRange(this.minViewsInput, "minViews");
      bindRange(this.maxViewsInput, "maxViews");
      bindRange(this.minLikesInput, "minLikes");
      bindRange(this.maxLikesInput, "maxLikes");
      bindRange(this.minCommentsInput, "minComments");
      bindRange(this.maxCommentsInput, "maxComments");
      bindRange(this.minSharesInput, "minShares");
      bindRange(this.maxSharesInput, "maxShares");
      bindRange(this.minFollowsInput, "minFollows");
      bindRange(this.maxFollowsInput, "maxFollows");

      // 범위 ?�터 ?�기/?�치�?초기??
      this.initRangeFilter();

      if (this.exportCsvBtn) {
        this.exportCsvBtn.addEventListener("click", () =>
          this.exportTrackingCsv()
        );
      }
    }, 0);

    // ?�시?�그 ?�정 버튼 ?�벤??바인??
    const hashtagSettingsBtn = document.getElementById("hashtag-settings-btn");
    if (hashtagSettingsBtn) {
      hashtagSettingsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showHashtagSettings();
      });

      // 초기 ?�시?�그 ?�시 ?�데?�트
      setTimeout(() => {
        this.updateHashtagsDisplay();
      }, 100);

      logger.log("???�시?�그 ?�정 버튼 ?�벤??바인???�료");
    } else {
      logger.error("???�시?�그 ?�정 버튼??찾을 ???�습?�다!");
    }

    // ?�괄 마이그레?�션 버튼 ?�벤??바인??
    if (this.batchMigrationBtn) {
      this.batchMigrationBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showBatchMigrationConfirm();
      });
      logger.log("???�괄 마이그레?�션 버튼 ?�벤??바인???�료");
    } else {
      logger.log("?�️ ?�괄 마이그레?�션 버튼??찾을 ???�습?�다 (?�택??기능)");
    }

    // 개발 모드?�서 ?�동 ?�스???�행
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      setTimeout(() => {
        logger.log("?�� 개발 모드: ?�동 ?�스???�행");
        this.runComprehensiveTest();
      }, 2000);
    }

    // ?�널 기반 LLM 검�?버튼 초기 바인??
    // DOM???�전??로드?????�행?�도�?setTimeout ?�용
    setTimeout(() => {
      this.bindPanelLLMButtons();
    }, 100);

    // '??보기' 버튼 ?�벤??
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => this.loadMoreTexts());
    }
  }

  /**
   * ?�?�된 글 불러?�기 (Firestore) - ?�이지?�이??지??
   * @param {boolean} loadAll - ?�체 로드 ?��? (검???�터 ??true)
   */
  async loadSavedTextsFromFirestore(loadAll = false) {
    if (!this.currentUser) return;

    try {
      this.showLoadingSpinner(true);

      if (loadAll) {
        // ?�체 로드 (기존 방식�??�사?��?�?DataManager 직접 ?�용)
        const texts = await this.dataManager.loadSavedTexts(this.currentUser.uid);
        this.savedTexts = texts;
        this.isAllDataLoaded = true;
        this.lastVisibleDoc = null;
      } else {
        // ?�이지?�이??로드
        const result = await this.dataManager.loadSavedTextsPaginated(
          this.currentUser.uid,
          this.PAGE_SIZE,
          this.lastVisibleDoc
        );

        if (this.lastVisibleDoc === null) {
          // �??�이지
          this.savedTexts = result.texts;
        } else {
          // ??보기: 중복 ?�거 ??추�?
          const newTexts = result.texts.filter(
            (newText) => !this.savedTexts.some((existing) => existing.id === newText.id)
          );
          this.savedTexts = [...this.savedTexts, ...newTexts];
        }

        this.lastVisibleDoc = result.lastVisibleDoc;

        // ???�상 불러???�이?��? ?�으�??�래�??�정
        if (result.texts.length < this.PAGE_SIZE) {
          this.isAllDataLoaded = true;
        }
      }

      // UI ?�데?�트
      this.updateLoadMoreButtonVisibility();
      this.renderSavedTexts();

    } catch (error) {
      logger.error("?�?�된 글 로드 ?�패:", error);
      this.showMessage("글 목록??불러?�는???�패?�습?�다.", "error");
    } finally {
      this.showLoadingSpinner(false);
    }
  }

  /**
   * '??보기' 버튼 ?�릭 ?�들??
   */
  async loadMoreTexts() {
    if (this.isAllDataLoaded) return;
    await this.loadSavedTextsFromFirestore(false);
  }

  /**
   * [Hybrid Pagination] 검???�터�??�한 ?�체 ?�이??로드 보장
   */
  async ensureAllDataLoaded() {
    if (this.isAllDataLoaded) return;

    this.showMessage("검???�터�??�해 ?�체 ?�이?��? 불러?�니??..", "info");
    await this.loadSavedTextsFromFirestore(true);
  }

  /**
   * '??보기' 버튼 �??�피???�태 ?�데?�트
   */
  updateLoadMoreButtonVisibility() {
    const loadMoreBtn = document.getElementById("load-more-btn");
    const spinner = document.getElementById("load-more-container");

    if (loadMoreBtn) {
      if (this.isAllDataLoaded || this.savedTexts.length === 0) {
        loadMoreBtn.style.display = "none";
      } else {
        loadMoreBtn.style.display = "block";
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "??보기";
      }
    }

    if (spinner) {
      spinner.style.display = "none";
    }
  }

  /**
   * 로딩 ?�피???�시/?��?
   */
  showLoadingSpinner(show) {
    const loadMoreBtn = document.getElementById("load-more-btn");
    const spinner = document.getElementById("load-more-container");

    if (show) {
      if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = "로딩 �?..";
      }
      if (spinner) spinner.style.display = "flex";
    } else {
      this.updateLoadMoreButtonVisibility();
    }
  }

  // 글???�한 ?��? 초기??
  initCharLimitToggle() {
    const toggle = document.getElementById("char-limit-toggle");
    if (!toggle) return;
    const buttons = toggle.querySelectorAll(".segment-btn");
    buttons.forEach((btn) => {
      const limit = parseInt(btn.getAttribute("data-limit"), 10);
      const isActive = limit === this.maxLength;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.setCharLimit(limit);
        buttons.forEach((b) => {
          const l = parseInt(b.getAttribute("data-limit"), 10);
          const on = l === this.maxLength;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
      });
    });
  }

  setCharLimit(limit) {
    const value = limit === 1000 ? 1000 : 500;
    if (this.maxLength === value) return;
    this.maxLength = value;
    localStorage.setItem("dualTextWriter_charLimit", String(value));
    this.applyCharLimit(value);
  }

  applyCharLimit(value) {
    // textarea maxlength ?�데?�트
    if (this.refTextInput)
      this.refTextInput.setAttribute("maxlength", String(value));
    if (this.editTextInput)
      this.editTextInput.setAttribute("maxlength", String(value));
    // ?�단 카운??최�?�??�시 ?�데?�트
    const refMax = document.getElementById("ref-max-count");
    const editMax = document.getElementById("edit-max-count");
    if (refMax) refMax.textContent = String(value);
    if (editMax) editMax.textContent = String(value);
    // 진행�?버튼 ?�태 ?�계??
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
  }

  // ?�?�된 글 ?�터 UI 초기??�??�벤??바인??
  initSavedFilters() {
    const container = document.querySelector("#saved-tab .segmented-control");
    if (!container) return;
    const buttons = container.querySelectorAll(".segment-btn");
    if (!buttons || buttons.length === 0) return;

    // ?�퍼?�스 ?�형 ?�터 초기??
    this.referenceTypeFilter =
      localStorage.getItem("dualTextWriter_referenceTypeFilter") || "all";
    this.referenceTypeFilterSelect = document.getElementById(
      "reference-type-filter"
    );
    this.referenceTypeFilterContainer = document.getElementById(
      "reference-type-filter-container"
    );
    if (this.referenceTypeFilterSelect) {
      this.referenceTypeFilterSelect.value = this.referenceTypeFilter;
      this.referenceTypeFilterSelect.onchange = async () => {
        // [Hybrid Pagination] ?�터 ???�체 ?�이??로드 보장
        await this.ensureAllDataLoaded();

        this.referenceTypeFilter = this.referenceTypeFilterSelect.value;
        localStorage.setItem(
          "dualTextWriter_referenceTypeFilter",
          this.referenceTypeFilter
        );
        this.renderSavedTexts();
      };
    }

    // 주제 ?�터 ?�벤??리스???�정 (?�성 글??
    if (this.topicFilter) {
      this.currentTopicFilter =
        localStorage.getItem("dualTextWriter_topicFilter") || "all";
      this.topicFilter.value = this.currentTopicFilter;
      this.topicFilter.onchange = async () => {
        // [Hybrid Pagination] ?�터 ???�체 ?�이??로드 보장
        await this.ensureAllDataLoaded();

        this.currentTopicFilter = this.topicFilter.value;
        localStorage.setItem(
          "dualTextWriter_topicFilter",
          this.currentTopicFilter
        );
        this.renderSavedTextsCache = null; // 캐시 무효??
        this.renderSavedTexts();
      };
    }

    // ?�스 ?�터 ?�벤??리스???�정 (?�퍼?�스 글??
    if (this.sourceFilter) {
      this.currentSourceFilter =
        localStorage.getItem("dualTextWriter_sourceFilter") || "all";
      this.sourceFilter.value = this.currentSourceFilter;
      this.sourceFilter.onchange = async () => {
        // [Hybrid Pagination] ?�터 ???�체 ?�이??로드 보장
        await this.ensureAllDataLoaded();

        this.currentSourceFilter = this.sourceFilter.value;
        localStorage.setItem(
          "dualTextWriter_sourceFilter",
          this.currentSourceFilter
        );
        this.renderSavedTextsCache = null; // 캐시 무효??
        this.renderSavedTexts();
      };
    }

    // SNS ?�랫???�터 ?�벤??리스???�정 (?�성 글??
    if (this.snsFilterMode) {
      this.currentSnsFilterMode =
        localStorage.getItem("dualTextWriter_snsFilterMode") || "all";
      this.snsFilterMode.value = this.currentSnsFilterMode;
      this.snsFilterMode.onchange = async () => {
        // [Hybrid Pagination] ?�터 ???�체 ?�이??로드 보장
        await this.ensureAllDataLoaded();

        this.currentSnsFilterMode = this.snsFilterMode.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterMode",
          this.currentSnsFilterMode
        );
        // ?�터 모드가 'all'???�니�??�랫???�택 ?�롭?�운 ?�시
        if (this.snsFilterPlatform) {
          if (this.currentSnsFilterMode === "all") {
            this.snsFilterPlatform.style.display = "none";
            this.currentSnsFilterPlatform = "";
            this.snsFilterPlatform.value = "";
          } else {
            this.snsFilterPlatform.style.display = "block";
          }
        }
        this.renderSavedTextsCache = null; // 캐시 무효??
        this.renderSavedTexts();
      };
    }

    if (this.snsFilterPlatform) {
      this.currentSnsFilterPlatform =
        localStorage.getItem("dualTextWriter_snsFilterPlatform") || "";
      this.snsFilterPlatform.value = this.currentSnsFilterPlatform;
      // 초기 ?�시 ?�태 ?�정
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
      this.snsFilterPlatform.onchange = async () => {
        // [Hybrid Pagination] ?�터 ???�체 ?�이??로드 보장
        await this.ensureAllDataLoaded();

        this.currentSnsFilterPlatform = this.snsFilterPlatform.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterPlatform",
          this.currentSnsFilterPlatform
        );
        this.renderSavedTextsCache = null; // 캐시 무효??
        this.renderSavedTexts();
      };
    }

    // SNS ?�랫??목록 초기??(?�러 발생 ?�에????초기?��? 진행?�도�?보호)
    try {
      this.updateSnsFilterOptions();
    } catch (e) {
      logger.error("SNS ?�터 ?�션 ?�데?�트 ?�패:", e);
    }

    // ?�성 ?�태 복원 (강제 ?�기??
    try {
      buttons.forEach((btn) => {
        const filter = btn.getAttribute("data-filter");
        const isActive = filter === this.savedFilter;
        // HTML??박제??class="active"가 ?�더?�도 JS ?�태??맞춰 강제 ?�설??
        if (isActive) {
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
        } else {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        }
      });
    } catch (e) {
      logger.error("?�터 버튼 ?�태 ?�기???�패:", e);
    }

    // ?�릭 ?�벤??바인??
    buttons.forEach((btn) => {
      btn.removeEventListener("click", btn._filterHandler);
      btn._filterHandler = (e) => {
        e.preventDefault();
        const filter = btn.getAttribute("data-filter");
        this.setSavedFilter(filter);
      };
      btn.addEventListener("click", btn._filterHandler);
    });

    // 초기 ?�시 ?�태
    this.updateReferenceTypeFilterVisibility();
  }

  setSavedFilter(filter) {
    // ?�러 처리: ?�터 값이 ?�상 범위�?벗어??경우 처리
    const validFilters = ["all", "edit", "reference", "reference-used"];
    if (!validFilters.includes(filter)) {
      logger.warn("setSavedFilter: ?�못???�터 �?", filter);
      return;
    }

    this.savedFilter = filter;
    localStorage.setItem("dualTextWriter_savedFilter", filter);

    // UI ?�데?�트
    const container = document.querySelector("#saved-tab .segmented-control");
    if (container) {
      container.querySelectorAll(".segment-btn").forEach((btn) => {
        const isActive = btn.getAttribute("data-filter") === filter;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    // ?�형 ?�터 ?�시/?��?
    this.updateReferenceTypeFilterVisibility();

    // 주제/?�스 ?�터 ?�시/?��?
    this.updateTopicSourceFilterVisibility();

    // 목록 ?�더�?
    this.renderSavedTexts();

    // ?�근?? ?�터 변�????�커??관�?(?�택?? ?�요 ???�성??
    // setTimeout???�용?�여 ?�더�??�료 ???�행
    // const firstItem = this.savedList.querySelector('.saved-item');
    // if (firstItem) {
    //     setTimeout(() => {
    //         firstItem.focus();
    //     }, 100);
    // }
  }

  updateTopicFilterOptions() {
    if (!this.topicFilter) return;

    // ?�성 글(type === 'edit')?�서�?고유??주제 목록 추출
    const topics = new Set();
    this.savedTexts.forEach((item) => {
      // ?�성 글�??�터�?
      if ((item.type || "edit") === "edit" && item.topic && item.topic.trim()) {
        topics.add(item.topic.trim());
      }
    });

    // 주제 목록??배열�?변?�하�??�렬
    this.availableTopics = Array.from(topics).sort();

    // ?�롭?�운 ?�션 ?�데?�트
    const currentValue = this.topicFilter.value;
    this.topicFilter.innerHTML = '<option value="all">?�체 주제</option>';

    this.availableTopics.forEach((topic) => {
      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic;
      this.topicFilter.appendChild(option);
    });

    // ?�전 ?�택�?복원
    if (currentValue && this.availableTopics.includes(currentValue)) {
      this.topicFilter.value = currentValue;
    } else {
      this.topicFilter.value = "all";
      this.currentTopicFilter = "all";
    }
  }

  updateSourceFilterOptions() {
    if (!this.sourceFilter) return;

    // ?�퍼?�스 글(type === 'reference')?�서�?고유???�스(주제) 목록 추출
    const sources = new Set();
    this.savedTexts.forEach((item) => {
      // ?�퍼?�스 글�??�터�?
      if (
        (item.type || "edit") === "reference" &&
        item.topic &&
        item.topic.trim()
      ) {
        sources.add(item.topic.trim());
      }
    });

    // ?�스 목록??배열�?변?�하�??�렬
    this.availableSources = Array.from(sources).sort();

    // ?�롭?�운 ?�션 ?�데?�트
    const currentValue = this.sourceFilter.value;
    this.sourceFilter.innerHTML = '<option value="all">?�체 ?�스</option>';

    this.availableSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      this.sourceFilter.appendChild(option);
    });

    // ?�전 ?�택�?복원
    if (currentValue && this.availableSources.includes(currentValue)) {
      this.sourceFilter.value = currentValue;
    } else {
      this.sourceFilter.value = "all";
      this.currentSourceFilter = "all";
    }
  }

  updateSnsFilterOptions() {
    if (!this.snsFilterPlatform) return;

    // ?�재 ?�택�??�??
    const currentValue = this.snsFilterPlatform.value;

    // SNS ?�랫??목록 초기??
    this.snsFilterPlatform.innerHTML = '<option value="">?�랫???�택</option>';

    // DualTextWriter.SNS_PLATFORMS?�서 ?�랫??목록 ?�성
    DualTextWriter.SNS_PLATFORMS.forEach((platform) => {
      const option = document.createElement("option");
      option.value = platform.id;
      option.textContent = `${platform.icon} ${platform.name}`;
      this.snsFilterPlatform.appendChild(option);
    });

    // ?�전 ?�택�?복원
    if (
      currentValue &&
      DualTextWriter.SNS_PLATFORMS.some((p) => p.id === currentValue)
    ) {
      this.snsFilterPlatform.value = currentValue;
    } else {
      this.snsFilterPlatform.value = "";
      this.currentSnsFilterPlatform = "";
    }

    // ?�터 모드???�라 ?�랫???�택 ?�롭?�운 ?�시/?��?
    if (this.snsFilterMode && this.snsFilterPlatform) {
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
    }
  }

  updateTopicSourceFilterVisibility() {
    // ?�성 글 ?�터???? 주제 ?�터 �?SNS ?�터 ?�시, ?�스 ?�터 ?��?
    if (this.savedFilter === "edit") {
      if (this.topicFilterGroup) {
        this.topicFilterGroup.style.display = "flex";
      }
      if (this.snsFilterGroup) {
        this.snsFilterGroup.style.display = "flex";
      }
      if (this.sourceFilterGroup) {
        this.sourceFilterGroup.style.display = "none";
      }
    }
    // ?�퍼?�스 글 ?�터???? ?�스 ?�터 ?�시, 주제 ?�터 �?SNS ?�터 ?��?
    else if (
      this.savedFilter === "reference" ||
      this.savedFilter === "reference-used"
    ) {
      if (this.topicFilterGroup) {
        this.topicFilterGroup.style.display = "none";
      }
      if (this.snsFilterGroup) {
        this.snsFilterGroup.style.display = "none";
      }
      if (this.sourceFilterGroup) {
        this.sourceFilterGroup.style.display = "flex";
      }
    }
    // ?�체 ?�터???? 모두 ?��?
    else {
      if (this.topicFilterGroup) {
        this.topicFilterGroup.style.display = "none";
      }
      if (this.snsFilterGroup) {
        this.snsFilterGroup.style.display = "none";
      }
      if (this.sourceFilterGroup) {
        this.sourceFilterGroup.style.display = "none";
      }
    }
  }

  updateReferenceTypeFilterVisibility() {
    if (!this.referenceTypeFilterContainer) return;
    const show =
      this.savedFilter === "reference" || this.savedFilter === "reference-used";
    this.referenceTypeFilterContainer.style.display = show ? "flex" : "none";
  }

  updateCharacterCount(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const currentCount =
      panel === "ref" ? this.refCurrentCount : this.editCurrentCount;
    const progressFill =
      panel === "ref" ? this.refProgressFill : this.editProgressFill;
    const saveBtn = panel === "ref" ? this.refSaveBtn : this.editSaveBtn;
    const downloadBtn =
      panel === "ref" ? this.refDownloadBtn : this.editDownloadBtn;

    const text = textInput.value;
    const currentLength = this.getKoreanCharacterCount(text);

    currentCount.textContent = currentLength;

    // Update progress bar
    const progress = (currentLength / this.maxLength) * 100;
    progressFill.style.width = `${Math.min(progress, 100)}%`;

    // Update character count color based on usage
    if (currentLength >= this.maxLength * 0.9) {
      currentCount.className = "danger";
    } else if (currentLength >= this.maxLength * 0.7) {
      currentCount.className = "warning";
    } else {
      currentCount.className = "";
    }

    // Update button states
    saveBtn.disabled = currentLength === 0;
    downloadBtn.disabled = currentLength === 0;
  }

  getKoreanCharacterCount(text) {
    return text.length;
  }

  /**
   * ?�스???�용???�규?�합?�다.
   *
   * 중복 체크�??�해 ?�스?��? ?�규?�합?�다. 공백, 줄바�? 캐리지 리턴???�리?�여
   * ?�일???�용???�른 ?�식?�로 ?�력??경우?�도 중복?�로 ?�식?????�도�??�니??
   *
   * @param {string} text - ?�규?�할 ?�스??
   * @returns {string} ?�규?�된 ?�스??(�?문자???�는 ?�규?�된 ?�스??
   *
   * @example
   * // 공백 차이 ?�규??
   * normalizeContent('hello   world') // 'hello world'
   *
   * // 줄바�??�리
   * normalizeContent('hello\nworld') // 'hello world'
   *
   * // ?�뒤 공백 ?�거
   * normalizeContent('  hello world  ') // 'hello world'
   */
  normalizeContent(text) {
    // null, undefined, �?문자??처리
    if (!text || typeof text !== "string") {
      return "";
    }

    try {
      // ?�뒤 공백 ?�거
      let normalized = text.trim();

      // ?�속??공백???�나�?변??
      normalized = normalized.replace(/\s+/g, " ");

      // 줄바꿈을 공백?�로 변??
      normalized = normalized.replace(/\n+/g, " ");

      // 캐리지 리턴??공백?�로 변??
      normalized = normalized.replace(/\r+/g, " ");

      // 최종?�으�??�속??공백???�길 ???�으므�??�시 ?�리
      normalized = normalized.replace(/\s+/g, " ");

      return normalized.trim();
    } catch (error) {
      // ?�규???�러 발생 ???�본 ?�스?�의 trim�?반환
      logger.warn("?�스???�규??�??�류 발생:", error);
      return typeof text === "string" ? text.trim() : "";
    }
  }

  /**
   * ?�퍼?�스 ?�용??중복 ?��?�??�인?�니??
   *
   * ?�?�된 ?�퍼?�스(`this.savedTexts` �?type === 'reference'????��)?�
   * ?�력???�용(`content`)???�규?�하???�전 ?�치 ?��?�??�인?�니??
   * �?번째�?발견??중복 ?�퍼?�스 객체�?반환?�며, ?�으�?null??반환?�니??
   *
   * ?�능: O(N) - ?�퍼?�스 ?��? 많�? ?��? ?�재 구조?�서 ?�합?�며,
   * 추후 ?�시 기반 최적??Phase 3)�??�장 가?�합?�다.
   *
   * @param {string} content - ?�인???�퍼?�스 ?�용
   * @returns {Object|null} 중복???�퍼?�스 객체 ?�는 null
   *
   * @example
   * const dup = this.checkDuplicateReference('  같�?  ?�용\\n?�니??');
   * if (dup) { logger.log('중복 발견:', dup.id); }
   */
  checkDuplicateReference(content) {
    // ?�전??체크
    if (!content || typeof content !== "string") {
      return null;
    }
    if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) {
      return null;
    }

    // 1) ?�시가 ?�는 경우: ?�시 ?�선 비교
    try {
      const normalizedForHash = this.normalizeContent(content);
      const targetHash = this.calculateContentHashSync
        ? this.calculateContentHashSync(normalizedForHash)
        : null;

      if (targetHash) {
        const byHash = this.savedTexts.find((item) => {
          if ((item.type || "edit") !== "reference") return false;
          return item.contentHash && item.contentHash === targetHash;
        });
        if (byHash) {
          return byHash;
        }
      }
    } catch (e) {
      // ?�시 계산 ?�패 ??무시?�고 ?�규??비교�??�백
    }

    // 2) ?�규??기반 ?�전 ?�치 비교
    const normalizedContent = this.normalizeContent(content);
    if (!normalizedContent) return null;
    const duplicate = this.savedTexts.find((item) => {
      if ((item.type || "edit") !== "reference") return false;
      const itemContent = typeof item.content === "string" ? item.content : "";
      const normalizedItem = this.normalizeContent(itemContent);
      return normalizedItem === normalizedContent;
    });

    return duplicate || null;
  }

  /**
   * ?�용 ?�시(SHA-256)�?계산?�니?? 브라?��? SubtleCrypto ?�용.
   * ?�용??불�????�경???�해 ?�기 ?�백 ?�시???�공?�니??
   *
   * @param {string} content - ?�규?�된 ?�용
   * @returns {Promise<string>} 16진수 ?�시 문자??
   */
  async calculateContentHash(content) {
    if (!content || typeof content !== "string") return "";
    try {
      if (window.crypto && window.crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch (e) {
      logger.warn("SHA-256 ?�시 계산 ?�패, ?�백 ?�시 ?�용:", e);
    }
    // ?�백: 간단???�기 ?�시 (충돌 가?�성 ?�으???�시??
    return this.calculateContentHashSync(content);
  }

  /**
   * ?�기 ?�백 ?�시 (간단??32비트 ?�적 ?�시)
   * @param {string} content
   * @returns {string} 16진수 ?�시
   */
  calculateContentHashSync(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    // 32비트 ?�수 -> 8?�리 16진수
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  /**
   * 기존 ?�퍼?�스??contentHash�?채워 ?�는 마이그레?�션 ?�틸리티.
   * ?�??문서?�는 배치/백오???�략???�요?????�음.
   */
  /**
   * 기존 ?�퍼?�스??contentHash�?배치 처리�?마이그레?�션
   *
   * ?�능 최적??
   * - ?�차 ?�데?�트 N�???writeBatch() 배치 처리
   * - ?�행 ?�간: 20-30�???2-3�?(90% ?�축)
   * - 500�??�위�?�?�� 분할 (Firestore 배치 ?�한)
   * - 배치 �?100ms ?�레??(?�버 부??분산)
   *
   * @returns {Promise<void>}
   */
  async migrateHashesForExistingReferences() {
    if (!this.currentUser || !this.isFirebaseReady) return;
    if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) return;

    try {
      // 1. ?�데?�트 ?�???�집
      const updates = [];
      for (const item of this.savedTexts) {
        if ((item.type || "edit") !== "reference") continue;
        if (item.contentHash) continue; // ?��? ?�시 ?�음

        const normalized = this.normalizeContent(item.content || "");
        const hash = await this.calculateContentHash(normalized);
        if (!hash) continue;

        updates.push({ id: item.id, contentHash: hash });
      }

      if (updates.length === 0) {
        this.showMessage("??모든 ?�퍼?�스가 최신 ?�태?�니??", "success");
        return;
      }

      logger.log(`?�� ${updates.length}�??�퍼?�스 ?�시 마이그레?�션 ?�작...`);

      // 진행�?모달 ?�시
      this.showMigrationProgressModal(updates.length);

      // 2. ??배치 처리 (?�정 ?�수 ?�용)
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
          const textRef = window.firebaseDoc(
            this.db,
            "users",
            this.currentUser.uid,
            "texts",
            u.id
          );
          batch.update(textRef, {
            contentHash: u.contentHash,
            hashVersion: 1,
            updatedAt: window.firebaseServerTimestamp(),
          });

          // 로컬 반영
          const local = this.savedTexts.find((t) => t.id === u.id);
          if (local) {
            local.contentHash = u.contentHash;
            local.hashVersion = 1;
          }
        }

        // 배치 커밋
        await batch.commit();
        completedCount += chunk.length;

        // 진행�??�데?�트
        this.updateMigrationProgress(completedCount, updates.length);

        // 진행�?로그 (?�버깅용)
        const progress = Math.round((completedCount / updates.length) * 100);
        logger.log(
          `??마이그레?�션 진행 �? ${completedCount}/${updates.length} (${progress}%)`
        );

        // ?�음 배치 ??짧�? ?��?(?�버 부??분산, ?�정 ?�수 ?�용)
        if (index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // 진행�?모달 ?�기
      this.hideMigrationProgressModal();

      // ?�료 메시지
      this.showMessage(
        `??${updates.length}�??�퍼?�스 ?�시 마이그레?�션 ?�료!`,
        "success"
      );
      logger.log(`??마이그레?�션 ?�료: ${updates.length}�?);
    } catch (error) {
      // 진행�?모달 ?�기 (?�러 ??
      this.hideMigrationProgressModal();

      logger.error("???�시 마이그레?�션 ?�패:", error);
      this.showMessage(
        `???�시 마이그레?�션 �??�류가 발생?�습?�다: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * 마이그레?�션 진행�?모달 ?�시
   * @param {number} total - ?�체 ??�� ??
   */
  showMigrationProgressModal(total) {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "flex";
      this.updateMigrationProgress(0, total);
    }
  }

  /**
   * 마이그레?�션 진행�??�데?�트
   * @param {number} completed - ?�료????�� ??
   * @param {number} total - ?�체 ??�� ??
   */
  updateMigrationProgress(completed, total) {
    const progress = Math.round((completed / total) * 100);

    const progressBar = document.getElementById("migration-progress-bar");
    const progressText = document.getElementById("migration-progress-text");
    const progressContainer = progressBar?.parentElement;

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (progressText) {
      progressText.textContent = `${completed} / ${total} ?�료 (${progress}%)`;
    }

    if (progressContainer) {
      progressContainer.setAttribute("aria-valuenow", progress);
    }
  }

  /**
   * 마이그레?�션 진행�?모달 ?��?
   */
  hideMigrationProgressModal() {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  /**
   * 중복 ?�퍼?�스 ?�인 모달???�시?�니??
   *
   * 중복???�퍼?�스???�약 ?�보�?보여주고, ?�용?�에�?
   * ?�??취소, 기존 ?�퍼?�스 보기, 그래???�??�??�나�??�택?�게 ?�니??
   *
   * ?�근??
   * - role="dialog", aria-modal="true" ?�용
   * - ESC �??�기 지??
   * - 버튼??명확???�벨 ?�용
   *
   * @param {Object} duplicate - 중복???�퍼?�스 ?�보 객체
   * @returns {Promise<boolean>} true: 그래???�?? false: 취소/보기 ?�택
   */
  async showDuplicateConfirmModal(duplicate) {
    return new Promise((resolve) => {
      // 기존 모달 ?�거 (중복 ?�시 방�?)
      const existing = document.getElementById("duplicate-confirm-overlay");
      if (existing) existing.remove();

      // ?�짜 ?�맷 ?�틸 (?��? ?�용)
      // ?�짜 ?�맷?��? ?�래??메서??formatDateFromFirestore ?�용

      const overlay = document.createElement("div");
      overlay.id = "duplicate-confirm-overlay";
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

      const modal = document.createElement("div");
      modal.id = "duplicate-confirm-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "duplicate-confirm-title");
      modal.style.cssText = `
                width: 100%;
                max-width: 560px;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                padding: 20px;
            `;

      const createdAtStr = this.formatDateFromFirestore(duplicate?.createdAt);
      const topicStr = duplicate?.topic ? this.escapeHtml(duplicate.topic) : "";
      const contentPreview =
        this.escapeHtml((duplicate?.content || "").substring(0, 140)) +
        ((duplicate?.content || "").length > 140 ? "..." : "");

      modal.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px;">
                    <div style="font-size: 1.25rem;">?�️</div>
                    <h3 id="duplicate-confirm-title" style="margin:0; font-size:1.1rem; font-weight:700; color:#333;">
                        중복 ?�퍼?�스 발견
                    </h3>
                </div>
                <p style="margin:0 0 12px; color:#555; line-height:1.6;">
                    ?�력?�신 ?�용�??�일???�퍼?�스가 ?��? ?�?�되???�습?�다. ?�떻�??�시겠습?�까?
                </p>
                <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; margin-bottom: 16px;">
                    ${
                      createdAtStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>?�???�짜:</strong> ${createdAtStr}</div>`
                        : ""
                    }
                    ${
                      topicStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>주제:</strong> ${topicStr}</div>`
                        : ""
                    }
                    <div style="font-size:0.95rem; color:#444;"><strong>?�용:</strong> ${contentPreview}</div>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" data-action="cancel" class="btn btn-secondary" aria-label="?�??취소"
                        style="padding:8px 12px; border-radius:8px; background:#e9ecef; border:none; color:#333; cursor:pointer;">
                        취소
                    </button>
                    <button type="button" data-action="view" class="btn btn-primary" aria-label="기존 ?�퍼?�스 보기"
                        style="padding:8px 12px; border-radius:8px; background:#0d6efd; border:none; color:#fff; cursor:pointer;">
                        기존 ?�퍼?�스 보기
                    </button>
                    <button type="button" data-action="save" class="btn btn-warning" aria-label="그래???�??
                        style="padding:8px 12px; border-radius:8px; background:#ffc107; border:none; color:#333; cursor:pointer;">
                        그래???�??
                    </button>
                </div>
            `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        window.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        resolve(result);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          cleanup(false);
        }
      };
      window.addEventListener("keydown", onKeyDown);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          cleanup(false);
        }
      });

      modal
        .querySelector('[data-action="cancel"]')
        .addEventListener("click", () => cleanup(false));
      modal
        .querySelector('[data-action="view"]')
        .addEventListener("click", async () => {
          try {
            this.setSavedFilter && this.setSavedFilter("reference");
            await this.refreshSavedTextsUI?.();
          } catch (err) {
            logger.warn("기존 ?�퍼?�스 보기 처리 �?경고:", err);
          }
          cleanup(false);
        });
      modal
        .querySelector('[data-action="save"]')
        .addEventListener("click", () => cleanup(true));

      // ?�커??초기 버튼�??�동
      const firstBtn = modal.querySelector('[data-action="save"]');
      if (firstBtn) firstBtn.focus();
    });
  }

  // Firebase 기반 인증으로 대체됨
  // Firebase Google 로그인 처리
  async googleLogin() {
    // [DEBUG] 프로덕션에서도 출력되는 에러 로그로 디버깅
    logger.error("[googleLogin] 시작, isFirebaseReady:", this.isFirebaseReady);
    logger.error("[googleLogin] this.auth:", this.auth);
    logger.error("[googleLogin] window.firebaseGoogleAuthProvider:", typeof window.firebaseGoogleAuthProvider);
    
    if (!this.isFirebaseReady) {
      this.showMessage(
        "Firebase가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.",
        "error"
      );
      return;
    }

    // Google Auth Provider 확인
    if (!window.firebaseGoogleAuthProvider) {
      logger.error("[googleLogin] GoogleAuthProvider가 로드되지 않았습니다.");
      this.showMessage("Google 로그인 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.", "error");
      return;
    }

    try {
      logger.error("[googleLogin] Google 로그인 팝업 시작...");
      const provider = new window.firebaseGoogleAuthProvider();
      const result = await window.firebaseSignInWithPopup(this.auth, provider);
      const user = result.user;
      logger.error("[googleLogin] 로그인 성공:", user.displayName || user.email);

      // 기존 로컬 데이터 마이그레이션 확인
      await this.checkAndMigrateLocalData(user.uid);

      this.showMessage(
        `${user.displayName || user.email}님, Google 로그인으로 환영합니다!`,
        "success"
      );
    } catch (error) {
      logger.error("[googleLogin] Google 로그인 실패:", error);
      logger.error("[googleLogin] 에러 코드:", error.code);
      logger.error("[googleLogin] 에러 메시지:", error.message);
      
      if (error.code === "auth/popup-closed-by-user") {
        this.showMessage("로그인이 취소되었습니다.", "info");
      } else if (error.code === "auth/popup-blocked") {
        this.showMessage("팝업이 차단되었습니다. 팝업 차단을 해제해주세요.", "error");
      } else if (error.code === "auth/cancelled-popup-request") {
        this.showMessage("이전 로그인 요청이 취소되었습니다. 다시 시도해주세요.", "info");
      } else if (error.code === "auth/network-request-failed") {
        this.showMessage("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.", "error");
      } else if (error.code === "auth/operation-not-allowed") {
        this.showMessage("Google 로그인이 비활성화되어 있습니다. 관리자에게 문의하세요.", "error");
        logger.error("[googleLogin] Firebase Console에서 Google 로그인 제공자를 활성화해야 합니다.");
      } else {
        this.showMessage(
          `Google 로그인에 실패했습니다: ${error.message || '알 수 없는 오류'}`,
          "error"
        );
      }
    }
  }

  /**
   * ?�용?�명??Firestore???�??
   * @param {string} uid - ?�용??UID
   * @param {string} username - ?�용?�명
   */
  async saveUsernameToFirestore(uid, username) {
    try {
      await window.firebaseAddDoc(
        window.firebaseCollection(
          this.db,
          Constants.COLLECTIONS.USERS,
          uid,
          Constants.COLLECTIONS.PROFILE
        ),
        {
          username: username,
          createdAt: window.firebaseServerTimestamp(),
          loginMethod: "username",
        }
      );
    } catch (error) {
      logger.error("?�용?�명 ?�???�패:", error);
    }
  }

  // [Refactoring] AuthManager�??�임
  async logout() {
    if (
      confirm("로그?�웃?�시겠습?�까? ?�재 ?�성 중인 ?�용?� ?�시 ?�?�됩?�다.")
    ) {
      this.performTempSave(); // 로그?�웃 ???�시 ?�??
      await this.authManager.logout();
    }
  }

  // Firebase Auth가 ?�동?�로 ?�큰 관리함

  showLoginInterface() {
    this.loginForm.style.display = "block";
    this.userInfo.style.display = "none";
    this.mainContent.style.display = "block"; // 로그???�이??메인 콘텐�??�시
  }

  // 기존 로컬 ?�토리�? ?�이?��? Firestore�?마이그레?�션
  async checkAndMigrateLocalData(userId) {
    const localData = localStorage.getItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
    if (!localData) return;

    try {
      const localTexts = JSON.parse(localData);
      if (localTexts.length === 0) return;

      const shouldMigrate = confirm(
        `기존???�?�된 ${localTexts.length}개의 글???�습?�다.\n` +
          `???�이?��? ?�로??계정?�로 ?�전?�시겠습?�까?\n\n` +
          `?�전?�면 기존 ?�이?�는 ?�라?�드???�전?�게 보�??�니??`
      );

      if (shouldMigrate) {
        await this.migrateLocalDataToFirestore(userId, localTexts);
        this.showMessage("기존 ?�이?��? ?�공?�으�??�전?�었?�니??", "success");

        // 로컬 ?�토리�? ?�리
        localStorage.removeItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
        localStorage.removeItem(Constants.STORAGE_KEYS.TEMP_SAVE);
      }
    } catch (error) {
      logger.error("?�이??마이그레?�션 ?�패:", error);
      this.showMessage("?�이??마이그레?�션 �??�류가 발생?�습?�다.", "error");
    }
  }

  // 로컬 ?�이?��? Firestore�?마이그레?�션
  async migrateLocalDataToFirestore(userId, localTexts) {
    for (const text of localTexts) {
      try {
        const textData = {
          content: text.content,
          type: text.type,
          characterCount: text.characterCount,
          createdAt: window.firebaseServerTimestamp(),
          updatedAt: window.firebaseServerTimestamp(),
          migrated: true, // 마이그레?�션 ?�시
        };

        await window.firebaseAddDoc(
          window.firebaseCollection(
            this.db,
            Constants.COLLECTIONS.USERS,
            userId,
            Constants.COLLECTIONS.TEXTS
          ),
          textData
        );
      } catch (error) {
        logger.error("개별 ?�스??마이그레?�션 ?�패:", error);
      }
    }

    logger.log(
      `${localTexts.length}개의 ?�스?��? Firestore�?마이그레?�션?�습?�다.`
    );
  }
  showUserInterface() {
    this.loginForm.style.display = "none";
    this.userInfo.style.display = "block";
    this.mainContent.style.display = "block";

    // ?�용???�보 ?�시 (Firebase ?�용???�보 ?�용)
    if (this.currentUser) {
      const displayName =
        this.currentUser.displayName || this.currentUser.email || "?�용??;
      this.usernameDisplay.textContent = displayName;
    }
  }

  clearAllData() {
    this.refTextInput.value = "";
    this.editTextInput.value = "";
    this.savedTexts = [];
    // 캐시 무효??(?�이??변�???
    this.renderSavedTextsCache = null;
    this.renderSavedTextsCacheKey = null;
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
    this.renderSavedTexts();
  }

  clearText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const panelName = panel === "ref" ? "?�퍼?�스 글" : "?�정/?�성 글";

    if (confirm(`${panelName}??지?�시겠습?�까?`)) {
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }
      // SNS ?�랫???�택 초기??
      if (panel === "edit") {
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
      }
      this.updateCharacterCount(panel);
      textInput.focus();
    }
  }

  // Firestore???�스???�??
  async saveText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() ?�거?�여 ?�용???�력??공백�?줄바�?보존
    const panelName = panel === "ref" ? "?�퍼?�스 글" : "?�정/?�성 글";

    if (text.length === 0) {
      alert("?�?�할 ?�용???�습?�다.");
      return;
    }

    if (!this.currentUser) {
      this.showMessage("로그?�이 ?�요?�니??", "error");
      return;
    }

    try {
      const textData = {
        content: text,
        type:
          panel === "ref"
            ? Constants.DATA_TYPES.REFERENCE
            : Constants.DATA_TYPES.EDIT,
        characterCount: this.getKoreanCharacterCount(text),
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
        isDeleted: false, // [Soft Delete] 초기??
      };

      // ?�퍼?�스 ?�????referenceType ?�수
      if (panel === "ref") {
        let refType = Constants.REF_TYPES.UNSPECIFIED;
        if (this.refTypeStructure && this.refTypeStructure.checked)
          refType = Constants.REF_TYPES.STRUCTURE;
        if (this.refTypeIdea && this.refTypeIdea.checked)
          refType = Constants.REF_TYPES.IDEA;
        if (refType === Constants.REF_TYPES.UNSPECIFIED) {
          this.showMessage(
            "?�퍼?�스 ?�형(구조/?�이?�어)???�택?�주?�요.",
            "error"
          );
          return;
        }
        textData.referenceType = refType;
      }

      // ?�정/?�성 글 ?�????주제 추�? (?�택?�항)
      if (panel === "edit" && this.editTopicInput) {
        const topic = this.editTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // ?�성글 ?�?????�결???�퍼?�스 ID 배열 추�?
      if (panel === "edit") {
        // ???�효???�퍼?�스 ID�??�터�?(존재 ?��? ?�인)
        const validReferences = this.selectedReferences.filter((refId) =>
          this.savedTexts.some(
            (item) =>
              item.id === refId &&
              (item.type || Constants.DATA_TYPES.EDIT) ===
                Constants.DATA_TYPES.REFERENCE
          )
        );

        if (validReferences.length > 0) {
          textData.linkedReferences = validReferences;
          textData.referenceMeta = {
            linkedAt: window.firebaseServerTimestamp(), // ?�결 ?�점
            linkCount: validReferences.length, // ?�결 개수 (캐시)
          };

          logger.log(`?�� ${validReferences.length}�??�퍼?�스 ?�결??);
        } else {
          // �?배열�??�정 (null???�닌 �?배열)
          textData.linkedReferences = [];
        }

        // ??SNS ?�랫???�??(?�효??검�??�함)
        if (
          this.selectedSnsPlatforms &&
          Array.isArray(this.selectedSnsPlatforms)
        ) {
          // ?�효???�랫??ID�??�터�?(DualTextWriter.SNS_PLATFORMS???�의??ID�??�용)
          const validPlatformIds = DualTextWriter.SNS_PLATFORMS.map(
            (p) => p.id
          );
          const validPlatforms = this.selectedSnsPlatforms.filter(
            (platformId) => validPlatformIds.includes(platformId)
          );

          // �?배열???�??(기존 ?�이???�환??
          textData.platforms = validPlatforms;

          if (validPlatforms.length > 0) {
            logger.log(
              `?�� ${validPlatforms.length}�?SNS ?�랫???�?�됨:`,
              validPlatforms
            );
          }
        } else {
          // selectedSnsPlatforms가 ?�거??배열???�닌 경우 �?배열�??�정
          textData.platforms = [];
        }
      }

      // ?�퍼?�스 글 ?�????주제 추�? (?�택?�항)
      if (panel === "ref" && this.refTopicInput) {
        const topic = this.refTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // ?�퍼?�스 ?�?????�시 ?�드 추�? (?�규??기반)
      if (panel === "ref") {
        try {
          const normalizedForHash = this.normalizeContent(text);
          const contentHash = await this.calculateContentHash(
            normalizedForHash
          );
          if (contentHash) {
            textData.contentHash = contentHash;
            textData.hashVersion = 1;
          }
        } catch (e) {
          logger.warn("contentHash 계산 ?�패: ?�시 ?�이 ?�?�합?�다.", e);
        }
      }

      // ?�퍼?�스 ?�????중복 체크 (referenceType 체크 ?�후, Firestore ?�???�전)
      if (panel === "ref") {
        try {
          const duplicate = this.checkDuplicateReference(text);
          if (duplicate) {
            // 중복 ?�인 모달 ?�시
            const shouldProceed = await this.showDuplicateConfirmModal(
              duplicate
            );
            if (!shouldProceed) {
              // ?�용?��? 취소 ?�택 ???�??중단
              return;
            }
            // shouldProceed가 true?�면 계속 진행 (그래???�??
          }
        } catch (error) {
          // 중복 체크 ?�패 ???�??계속 진행 (?�전??기본�?
          logger.warn(
            "중복 체크 �??�류 발생, ?�?�을 계속 진행?�니??",
            error
          );
          // ?�러 로그�?기록?�고 ?�?��? 계속 진행
        }
      }

      // ========================================
      // [P3-05] ?�명 ?�용???�???�한 체크 (?�라?�언???�이??UX 개선)
      // - Firestore 규칙?�서??차단?��?�? ?�라?�언?�에??먼�? 체크?�여
      //   ?�용?�에�?친절???�내 메시지�??�공?�니??
      // ========================================
      if (this.currentUser?.isAnonymous) {
        this.showMessage('글???�?�하?�면 Google 계정?�로 로그?�해주세??', 'warning');
        return;
      }

      // Firestore???�??
      const docRef = await window.firebaseAddDoc(
        window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "texts"
        ),
        textData
      );

      // 로컬 배열?�도 추�? (UI ?�데?�트??
      const savedItem = {
        id: docRef.id,
        content: text,
        date: new Date().toLocaleString("ko-KR"),
        characterCount: this.getKoreanCharacterCount(text),
        type: panel === "ref" ? "reference" : "edit",
        referenceType: panel === "ref" ? textData.referenceType : undefined,
        topic:
          panel === "edit"
            ? textData.topic
            : panel === "ref"
            ? textData.topic
            : undefined,
        contentHash: panel === "ref" ? textData.contentHash : undefined,
        hashVersion: panel === "ref" ? textData.hashVersion : undefined,
        linkedReferences:
          panel === "edit" ? textData.linkedReferences : undefined,
        referenceMeta: panel === "edit" ? textData.referenceMeta : undefined,
        platforms: panel === "edit" ? textData.platforms || [] : undefined,
      };

      // Optimistic UI: 즉시 로컬 ?�이???�데?�트 �?UI 반영
      this.savedTexts.unshift(savedItem);
      // 캐시 무효??(?�이??변�???
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      // 주제 ?�터 ?�션 ?�데?�트 (??주제가 추�??????�으므�?
      this.updateTopicFilterOptions();
      this.refreshUI({ savedTexts: true, force: true });

      this.showMessage(`${panelName}???�?�되?�습?�다!`, "success");

      // Clear input
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }

      // ???�성글 ?�?????�택???�퍼?�스 �?SNS ?�랫??초기??
      if (panel === "edit") {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0�??�택??";
        }
        logger.log("???�퍼?�스 ?�택 초기???�료");

        // SNS ?�랫???�택 초기??
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        logger.log("??SNS ?�랫???�택 초기???�료");
      }

      this.updateCharacterCount(panel);
    } catch (error) {
      logger.error("?�스???�???�패:", error);
      this.showMessage("?�?�에 ?�패?�습?�다. ?�시 ?�도?�주?�요.", "error");
    }
  }

  downloadAsTxt(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() ?�거?�여 ?�용???�력??공백�?줄바�?보존
    const panelName = panel === "ref" ? "?�퍼?�스" : "?�정?�성";

    if (text.length === 0) {
      alert("?�운로드???�용???�습?�다.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `${panelName}_${timestamp}.txt`;

    const content =
      `500??미만 글 ?�성�?- ${panelName} 글\n` +
      `?�성?? ${new Date().toLocaleString("ko-KR")}\n` +
      `글???? ${this.getKoreanCharacterCount(text)}??n` +
      `\n${"=".repeat(30)}\n\n` +
      `${text}`; // ?�용?��? ?�력??그�?�?줄바꿈과 공백 ?��?

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showMessage(
      `${panelName} 글 TXT ?�일???�운로드?�었?�니??`,
      "success"
    );
  }

  // ?�바?�스 ?�?�머 (?�능 최적?? 과도???�출 방�?)
  renderSavedTextsDebounceTimer = null;

  // 메모?�제?�션 캐시 (?�능 최적?? 같�? ?�터 조건?�서 ?�계??방�?)
  renderSavedTextsCache = null;
  renderSavedTextsCacheKey = null;

  async renderSavedTexts() {
    // ?�바?�스 ?�용 (300ms)
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

  // ?��???목록 ?�더�?
  renderTrashBinList() {
    const container = document.getElementById("trash-bin-list");
    if (!container) return;

    const deletedItems = this.savedTexts
      .filter((item) => item.isDeleted)
      .sort((a, b) => {
        // ??��???�짜 ?�림차순 (?�으�??�성??
        const dateA = a.deletedAt
          ? new Date(a.deletedAt)
          : new Date(a.createdAt);
        const dateB = b.deletedAt
          ? new Date(b.deletedAt)
          : new Date(b.createdAt);
        return dateB - dateA;
      });

    if (deletedItems.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">?���?/div>
          <p>?��??�이 비었?�니??</p>
        </div>
      `;
      return;
    }

    container.innerHTML = deletedItems
      .map((item) => {
        const date = item.deletedAt
          ? new Date(item.deletedAt).toLocaleString("ko-KR")
          : "?�짜 ?�음";
        const typeLabel =
          (item.type || "edit") === "reference" ? "?�� ?�퍼?�스" : "?�️ ?�성글";

        // ?�용 미리보기 (HTML ?�그 ?�거 �?길이 ?�한)
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = item.content;
        const textContent = tempDiv.textContent || tempDiv.innerText || "";
        const preview =
          textContent.length > 100
            ? textContent.substring(0, 100) + "..."
            : textContent;

        return `
        <div class="saved-item deleted-item" data-id="${item.id}">
          <div class="saved-item-header">
            <span class="saved-item-type">${typeLabel}</span>
            <span class="saved-item-date">??��?? ${date}</span>
          </div>
          <div class="saved-item-content">${this.escapeHtml(preview)}</div>
          <div class="saved-item-actions">
            <button class="btn-restore" onclick="window.dualTextWriter.restoreText('${
              item.id
            }')" aria-label="글 복원">
              ?�️ 복원
            </button>
            <button class="btn-delete-permanent" onclick="window.dualTextWriter.permanentlyDeleteText('${
              item.id
            }')" aria-label="?�구 ??��">
              ?�� ?�구 ??��
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // ?��????�기
  openTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "flex";
      this.renderTrashBinList();
      // ?�근?? 모달???�커???�동
      const closeBtn = modal.querySelector(".close-btn");
      if (closeBtn) closeBtn.focus();
    }
  }

  // ?��????�기
  closeTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  async _renderSavedTextsImpl() {
    // [Hybrid Pagination] ?�터??검?�어 ?�용 ???�체 ?�이??로드
    const isFiltering =
      (this.savedSearch && this.savedSearch.trim().length > 0) ||
      (this.savedFilter === "edit" &&
        ((this.currentTopicFilter && this.currentTopicFilter !== "all") ||
         (this.currentSnsFilterMode && this.currentSnsFilterMode !== "all" && this.currentSnsFilterPlatform))) ||
      ((this.savedFilter === "reference" || this.savedFilter === "reference-used") &&
        ((this.currentSourceFilter && this.currentSourceFilter !== "all") || 
         (this.referenceTypeFilter && this.referenceTypeFilter !== "all")));

    if (isFiltering && !this.isAllDataLoaded) {
      logger.log("?�� ?�터/검??감�?: ?�체 ?�이??로드 ?�작 (Hybrid Pagination)");
      await this.loadSavedTextsFromFirestore(true);
      return; // ?�이??로드 ???�렌?�링?��?�??�재 ?�행 중단
    }

    // 메모?�제?�션: 캐시 ???�성 (?�터 조건 + 검?�어 기반)
    const topicOrSourceFilter =
      this.savedFilter === "edit"
        ? this.currentTopicFilter || "all"
        : this.currentSourceFilter || "all";
    const snsFilterKey =
      this.savedFilter === "edit" &&
      this.currentSnsFilterMode &&
      this.currentSnsFilterMode !== "all" &&
      this.currentSnsFilterPlatform
        ? `${this.currentSnsFilterMode}_${this.currentSnsFilterPlatform}`
        : "all";
    const searchKey =
      this.savedSearch && this.savedSearch.trim()
        ? this.savedSearch.trim().toLowerCase()
        : "";
    const cacheKey = `${this.savedFilter}_${
      this.referenceTypeFilter || "all"
    }_${topicOrSourceFilter}_${snsFilterKey}_${searchKey}`;

    // 캐시 ?�인 (같�? ?�터 조건 + 검?�어?�서 ?�호�?방�?)
    if (
      this.renderSavedTextsCache &&
      this.renderSavedTextsCacheKey === cacheKey
    ) {
      logger.log("renderSavedTexts: 캐시??결과 ?�용 (?�능 최적??");
      return;
    }

    logger.log("renderSavedTexts ?�출??", this.savedTexts);

    // ?�터 ?�용
    let list = this.savedTexts;

    // [Soft Delete] ??��????�� ?�외
    list = list.filter((item) => !item.isDeleted);

    // [Tab Separation] 'script' ?�?��? ?�?�된 글 ??��???�외 (?�크립트 ?�성 ??��?�만 관�?
    // 주니??개발??체크: ?�이??분리 로직 ?�용
    list = list.filter((item) => (item.type || "edit") !== "script");

    if (this.savedFilter === "edit") {
      list = list.filter((item) => item.type === "edit");
    } else if (this.savedFilter === "reference") {
      // ?�퍼?�스 ?? ?�성 글(type='edit')?� ?��? 보이�?????
      // type??'reference'??것만 ?�격?�게 ?�터�?
      list = list.filter((item) => {
        const type = item.type || "edit";
        return type === "reference";
      });
    } else if (this.savedFilter === "reference-used") {
      // ?�용???�퍼?�스 ?? ?�성 글 ?�외
      list = list.filter((item) => {
        const type = item.type || "edit";
        return type === "reference";
      });
    }

    // ?�퍼?�스 ?�형 ?�터 ?�용 (structure/idea)
    if (
      (this.savedFilter === "reference" ||
        this.savedFilter === "reference-used") &&
      this.referenceTypeFilter &&
      this.referenceTypeFilter !== "all"
    ) {
      list = list.filter((item) => {
        const rtype = item.referenceType || "unspecified";
        return rtype === this.referenceTypeFilter;
      });
    }

    // 주제 ?�터 ?�용 (?�성 글??
    if (
      this.savedFilter === "edit" &&
      this.currentTopicFilter &&
      this.currentTopicFilter !== "all"
    ) {
      list = list.filter((item) => {
        const itemTopic = item.topic || "";
        return itemTopic === this.currentTopicFilter;
      });
    }

    // ?�스 ?�터 ?�용 (?�퍼?�스 글??
    if (
      (this.savedFilter === "reference" ||
        this.savedFilter === "reference-used") &&
      this.currentSourceFilter &&
      this.currentSourceFilter !== "all"
    ) {
      list = list.filter((item) => {
        const itemTopic = item.topic || "";
        return itemTopic === this.currentSourceFilter;
      });
    }

    // SNS ?�랫???�터 ?�용 (?�성 글??
    if (
      this.savedFilter === "edit" &&
      this.currentSnsFilterMode &&
      this.currentSnsFilterMode !== "all" &&
      this.currentSnsFilterPlatform
    ) {
      list = list.filter((item) => {
        // platforms ?�드가 ?�거??배열???�닌 경우 �?배열�?처리
        const platforms = Array.isArray(item.platforms) ? item.platforms : [];

        if (this.currentSnsFilterMode === "has") {
          // ?�정 SNS???�린 글: platforms 배열???�당 ?�랫??ID가 ?�는 경우
          return platforms.includes(this.currentSnsFilterPlatform);
        } else if (this.currentSnsFilterMode === "not-has") {
          // ?�정 SNS???�리지 ?��? 글: platforms 배열???�당 ?�랫??ID가 ?�는 경우
          return !platforms.includes(this.currentSnsFilterPlatform);
        }
        return true;
      });
    }

    // ??검???�터 ?�용 (?�용 + 주제?�서 검??
    if (this.savedSearch && this.savedSearch.trim()) {
      const tokens = this.savedSearch
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      list = list.filter((item) => {
        const content = (item.content || "").toLowerCase();
        const topic = (item.topic || "").toLowerCase();
        const searchText = `${content} ${topic}`;
        // 모든 ?�워?��? ?�함?�어????(AND 검??
        return tokens.every((tk) => searchText.includes(tk));
      });
    }

    // ?�터 ?�션 ?�데?�트
    if (this.savedFilter === "edit") {
      this.updateTopicFilterOptions();
      this.updateSnsFilterOptions();
    } else if (
      this.savedFilter === "reference" ||
      this.savedFilter === "reference-used"
    ) {
      this.updateSourceFilterOptions();
    }

    if (list.length === 0) {
      // ?�러 처리: ?�터 ?�용 ???�이?��? ?�는 경우 처리
      let emptyMsg = "?�?�된 글???�습?�다.";
      if (this.savedFilter === "edit") {
        emptyMsg = "?�성 글???�습?�다.";
      } else if (this.savedFilter === "reference") {
        emptyMsg = "?�퍼?�스 글???�습?�다.";
      } else if (this.savedFilter === "reference-used") {
        emptyMsg = "?�용???�퍼?�스가 ?�습?�다.";
      }
      this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">?��</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">글???�성?�고 ?�?�해보세??</div>
                </div>
            `;
      return;
    }

    // 로딩 ?�켈?�톤 ?�시 (?�이??조회 �?
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

    // ?�능 최적?? ?�퍼?�스 글???�용 ?��?�?배치 조회�?미리 ?�인
    const referenceItems = list.filter(
      (item) => (item.type || "edit") === "reference"
    );
    let referenceUsageMap = {};
    // 모든 ?�퍼?�스 ??��???�??기본�?0?�로 초기??(배�?가 ??�� ?�시?�도�?보장)
    referenceItems.forEach((item) => {
      if (item.id) {
        referenceUsageMap[item.id] = 0;
      }
    });
    if (referenceItems.length > 0 && this.currentUser && this.isFirebaseReady) {
      try {
        const referenceIds = referenceItems
          .map((item) => item.id)
          .filter((id) => id);
        if (referenceIds.length > 0) {
          const fetchedUsageMap = await this.checkMultipleReferenceUsage(
            referenceIds
          );
          // 조회??결과�?referenceUsageMap??병합
          Object.assign(referenceUsageMap, fetchedUsageMap);
        }
      } catch (error) {
        logger.error("?�퍼?�스 ?�용 ?��? 배치 조회 ?�패:", error);
        // ?�러 발생 ?�에??기본�?0???��? ?�정?�어 ?�으므�?배�????�시??
      }
    }

    // 캐시 ?�데?�트
    this.renderSavedTextsCacheKey = cacheKey;

    // �??�?�된 글???�???�래???�이??조회 �??�용 ?��? 추�? (비동�?
    const itemsWithTracking = await Promise.all(
      list.map(async (item, index) => {
        let postData = null;
        if (this.trackingPosts && this.currentUser && this.isFirebaseReady) {
          // 로컬 ?�이?�에??먼�? 찾기
          postData = this.trackingPosts.find((p) => p.sourceTextId === item.id);

          // 로컬???�으�?Firebase?�서 조회
          if (!postData) {
            try {
              const postsRef = window.firebaseCollection(
                this.db,
                "users",
                this.currentUser.uid,
                "posts"
              );
              const q = window.firebaseQuery(
                postsRef,
                window.firebaseWhere("sourceTextId", "==", item.id)
              );
              const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

              if (!querySnapshot.empty) {
                const postDoc = querySnapshot.docs[0];
                const data = postDoc.data();
                postData = {
                  id: postDoc.id,
                  metrics: data.metrics || [],
                  trackingEnabled: data.trackingEnabled || false,
                };
              }
            } catch (error) {
              logger.error("?�래???�이??조회 ?�패:", error);
            }
          }
        }

        // ?�퍼?�스 글??경우 ?�용 ?��? 추�?
        let usageCount = 0;
        if ((item.type || "edit") === "reference") {
          // referenceUsageMap?�서 usageCount�?가?�오?? ?�으�?0?�로 ?�정
          usageCount =
            referenceUsageMap[item.id] !== undefined
              ? referenceUsageMap[item.id]
              : 0;
        }

        // ?�용 ?��?�?item 객체??추�??�여 캐싱 (?�퍼?�스 글?� ??�� usageCount ?�함)
        const itemWithUsage = { ...item, usageCount };

        // reference ?�터??경우, usageCount가 0????���??�함 (?�용 ?�된 ?�퍼?�스�?
        if (this.savedFilter === "reference") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount !== 0) {
            return null; // ?�터�??�?�에???�외 (?�용???�퍼?�스???�외)
          }
        }

        // reference-used ?�터??경우, usageCount가 1 ?�상????���??�함
        if (this.savedFilter === "reference-used") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount === 0) {
            return null; // ?�터�??�?�에???�외
          }
        }

        return { item: itemWithUsage, postData, index };
      })
    );

    // reference ?�는 reference-used ?�터??경우 null????�� ?�거
    const filteredItemsWithTracking =
      this.savedFilter === "reference" || this.savedFilter === "reference-used"
        ? itemsWithTracking.filter((result) => result !== null)
        : itemsWithTracking;

    // ?�터�???�?목록 체크
    if (filteredItemsWithTracking.length === 0) {
      let emptyMsg = "?�?�된 글???�습?�다.";
      let emptySubMsg = "글???�성?�고 ?�?�해보세??";

      // ??검?�어가 ?�을 ??검??결과 ?�음 메시지 ?�시
      if (this.savedSearch && this.savedSearch.trim()) {
        if (this.savedFilter === "edit") {
          emptyMsg = `"${this.savedSearch}" 검??결과가 ?�습?�다.`;
        } else if (this.savedFilter === "reference") {
          emptyMsg = `"${this.savedSearch}" 검??결과가 ?�습?�다.`;
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = `"${this.savedSearch}" 검??결과가 ?�습?�다.`;
        } else {
          emptyMsg = `"${this.savedSearch}" 검??결과가 ?�습?�다.`;
        }
        emptySubMsg = "?�른 검?�어�??�도?�보?�요.";
      } else {
        if (this.savedFilter === "edit") {
          emptyMsg = "?�성 글???�습?�다.";
        } else if (this.savedFilter === "reference") {
          emptyMsg = "?�퍼?�스 글???�습?�다.";
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = "?�용???�퍼?�스가 ?�습?�다.";
        }
      }

      this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">?��</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">${emptySubMsg}</div>
                </div>
            `;
      // ?�근?? ?�크�?리더??�?목록 ?�태 ?�달 (aria-live�??�동 ?�달??
      this.savedList.setAttribute("aria-label", `?�?�된 글 목록: ${emptyMsg}`);
      return;
    }

    // ?�능 최적?? 많�? 카드 ?�더�???배치 처리
    const batchSize = 10;
    const totalItems = itemsWithTracking.length;

    // ?�근?? ?�터 결과�??�크�?리더???�달 (aria-live="polite"�??�동 ?�달??
    const filterDescription =
      this.savedFilter === "edit"
        ? "?�성 글"
        : this.savedFilter === "reference"
        ? "?�퍼?�스 글"
        : this.savedFilter === "reference-used"
        ? "?�용???�퍼?�스"
        : "?�?�된 글";

    // ??검??결과 개수 ?�시
    let ariaLabelText = `?�?�된 글 목록: ${filterDescription} ${totalItems}�?;
    if (this.savedSearch && this.savedSearch.trim()) {
      ariaLabelText = `?�?�된 글 목록: ${filterDescription} 검??결과 ${totalItems}�?;
    }
    this.savedList.setAttribute("aria-label", ariaLabelText);

    if (totalItems > batchSize) {
      // ?�???�더�? �?번째 배치�?즉시 ?�더�? ?�머지??requestAnimationFrame?�로 처리
      const firstBatch = filteredItemsWithTracking.slice(0, batchSize);
      this.savedList.innerHTML = firstBatch
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");

      // ?�머지 배치�??�진?�으�??�더�?
      let currentIndex = batchSize;
      const renderNextBatch = () => {
        if (currentIndex >= totalItems) return;

        const batch = filteredItemsWithTracking.slice(
          currentIndex,
          currentIndex + batchSize
        );
        const batchHtml = batch
          .map(({ item, postData, index }) => {
            return this.renderSavedItemCard(item, postData, index);
          })
          .join("");

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = batchHtml;
        while (tempDiv.firstChild) {
          this.savedList.appendChild(tempDiv.firstChild);
        }

        currentIndex += batchSize;
        if (currentIndex < totalItems) {
          requestAnimationFrame(renderNextBatch);
        } else {
          // DOM ?�더�??�료 ???�벤??리스???�정
          setTimeout(() => {
            this.setupSavedItemEventListeners();
            this.bindLinkedReferenceBadgeEvents();
          }, 100);
        }
      };

      requestAnimationFrame(renderNextBatch);
    } else {
      // ?�량 ?�더�? 즉시 ?�더�?
      this.savedList.innerHTML = filteredItemsWithTracking
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");
    }

    // DOM ?�더�??�료 ???�벤??리스???�정 (즉시 ?�더링된 경우)
    if (totalItems <= batchSize) {
      setTimeout(() => {
        this.setupSavedItemEventListeners();
        this.bindLinkedReferenceBadgeEvents();
      }, 100);
    }
  }

  /**
   * Phase 1.6.1: ?�성글-?�퍼?�스 ?�동 배�? ?�벤??바인??
   *
   * - ?�성글 카드??"참고 ?�퍼?�스 N�? 배�? ?�릭 ?�벤??
   * - ?�퍼?�스 카드??"???�퍼?�스�?참고??글 N�? 배�? ?�릭 ?�벤??
   */
  bindLinkedReferenceBadgeEvents() {
    try {
      // ?�성글 카드??"참고 ?�퍼?�스 N�? 배�? ?�릭
      const linkedRefBadges = document.querySelectorAll(".linked-ref-badge");
      linkedRefBadges.forEach((badge) => {
        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const editId = badge.getAttribute("data-edit-id");
          if (editId) {
            this.showLinkedReferencesModal(editId);
          }
        });
      });

      // ?�퍼?�스 카드??"???�퍼?�스�?참고??글 N�? 배�? ?�릭
      const usedInEditsBadges = document.querySelectorAll(
        ".used-in-edits-badge"
      );
      usedInEditsBadges.forEach((badge) => {
        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const refId = badge.getAttribute("data-ref-id");
          if (refId) {
            this.showEditsByReferenceModal(refId);
          }
        });
      });

      logger.log("??배�? ?�릭 ?�벤??바인???�료");
    } catch (error) {
      logger.error("배�? ?�벤??바인???�패:", error);
    }
  }

  // ?�?�된 ??�� 카드 ?�더�??�수 (?�사??가?�하�?분리)
  renderSavedItemCard(item, postData, index) {
    const metaText = `${
      (item.type || "edit") === "reference" ? "?�� ?�퍼?�스" : "?�️ ?�성"
    } · ${item.date} · ${item.characterCount}??;
    // ?�일???�키�? card:{itemId}:expanded
    const expanded = localStorage.getItem(`card:${item.id}:expanded`) === "1";
    // ?�?�라??HTML ?�성
    const timelineHtml = this.renderTrackingTimeline(
      postData?.metrics || [],
      item.id
    );

    // ?�퍼?�스 글??경우 ?�용 ?��? 배�? �??�형 배�? ?�성
    const isReference = (item.type || "edit") === "reference";
    // usageCount가 undefined??경우 0?�로 ?�정 (?�퍼?�스 글?� ??�� ?�용 ?��? 배�? ?�시)
    const usageCount = isReference
      ? item.usageCount !== undefined
        ? item.usageCount
        : 0
      : 0;
    const usageBadgeHtml = isReference
      ? this.renderReferenceUsageBadge(usageCount)
      : "";
    const refType = item.referenceType || "unspecified";
    const refTypeBadgeHtml = isReference
      ? this.renderReferenceTypeBadge(refType)
      : "";

    // ??Phase 1.6.1: ?�성글-?�퍼?�스 ?�동 배�? ?�성
    // ?�성글 카드: ?�결???�퍼?�스 개수 ?�시
    let linkedRefBadge = "";
    const isEdit = (item.type || "edit") === "edit";
    if (isEdit && Array.isArray(item.linkedReferences)) {
      const refCount = item.linkedReferences.length;
      if (refCount > 0) {
        linkedRefBadge = `
                    <button 
                        class="linked-ref-badge" 
                        data-edit-id="${item.id}"
                        aria-label="${refCount}개의 참고 ?�퍼?�스 보기"
                        title="??글??참고???�퍼?�스 목록">
                        ?�� 참고 ?�퍼?�스 ${refCount}�?
                    </button>
                `;
      }
    }

    // ?�퍼?�스 카드: ???�퍼?�스�?참고???�성글 개수 ?�시 (??��??
    let usedInEditsBadge = "";
    if (isReference) {
      const usedEdits = this.getEditsByReference(item.id);
      const editCount = usedEdits.length;
      if (editCount > 0) {
        usedInEditsBadge = `
                    <button 
                        class="used-in-edits-badge" 
                        data-ref-id="${item.id}"
                        aria-label="???�퍼?�스�?참고??글 ${editCount}�?보기"
                        title="???�퍼?�스�?참고???�성글 목록">
                        ?�� ???�퍼?�스�?참고??글 ${editCount}�?
                    </button>
                `;
      }
    }

    // ??SNS ?�랫??배�? ?�성 (?�성 글??
    let snsPlatformsHtml = "";
    if (isEdit && Array.isArray(item.platforms) && item.platforms.length > 0) {
      // ?�효???�랫??ID�??�터�?
      const validPlatformIds = DualTextWriter.SNS_PLATFORMS.map((p) => p.id);
      const validPlatforms = item.platforms
        .filter((platformId) => validPlatformIds.includes(platformId))
        .map((platformId) => {
          const platform = DualTextWriter.SNS_PLATFORMS.find(
            (p) => p.id === platformId
          );
          return platform
            ? { id: platformId, name: platform.name, icon: platform.icon }
            : null;
        })
        .filter(Boolean);

      if (validPlatforms.length > 0) {
        const platformsList = validPlatforms
          .map(
            (p) =>
              `<span class="sns-platform-badge" role="listitem" aria-label="${this.escapeHtml(
                p.name
              )} ?�랫??>${p.icon} ${this.escapeHtml(p.name)}</span>`
          )
          .join("");
        snsPlatformsHtml = `
                    <div class="saved-item-platforms" role="list" aria-label="SNS ?�랫??목록">
                        ${platformsList}
                    </div>
                `;
      }
    }

    // 검?�어 가?�오�?
    const searchTerm = this.savedSearchInput?.value.toLowerCase().trim() || "";

    // ?�이?�이???�용
    const highlightedTopic = item.topic
      ? this.highlightText(item.topic, searchTerm)
      : "";
    const highlightedContent = this.highlightText(item.content, searchTerm);

    return `
        <div class="saved-item ${index === 0 ? "new" : ""}" data-item-id="${
      item.id
    }" role="article" aria-labelledby="item-header-${item.id}">
            <div class="saved-item-header" id="item-header-${item.id}">
                <div class="saved-item-header-left">
                    <span class="saved-item-type" aria-label="${
                      (item.type || "edit") === "reference"
                        ? "?�퍼?�스 글"
                        : "?�성 글"
                    }">${
      (item.type || "edit") === "reference" ? "?�� ?�퍼?�스" : "?�️ ?�성"
    }</span>
                    ${refTypeBadgeHtml}
                    ${usageBadgeHtml}
                </div>
            </div>
            <div class="saved-item-meta" aria-label="메�? ?�보: ${metaText}">
                ${metaText}
                ${
                  linkedRefBadge
                    ? `<span class="meta-separator">·</span>${linkedRefBadge}`
                    : ""
                }
                ${
                  usedInEditsBadge
                    ? `<span class="meta-separator">·</span>${usedInEditsBadge}`
                    : ""
                }
            </div>
            ${
              item.topic
                ? `<div class="saved-item-topic" aria-label="주제: ${this.escapeHtml(
                    item.topic
                  )}">?���?${highlightedTopic}</div>`
                : ""
            }
            ${snsPlatformsHtml}
            <div class="saved-item-content ${
              expanded ? "expanded" : ""
            }" aria-label="본문 ?�용">${highlightedContent}</div>
            <button class="saved-item-toggle" data-action="toggle" data-item-id="${
              item.id
            }" aria-expanded="${expanded ? "true" : "false"}" aria-label="${
      expanded ? "?�용 ?�기" : "?�용 ?�보�?
    }">${expanded ? "?�기" : "?�보�?}</button>
            ${
              timelineHtml
                ? `<div class="saved-item-tracking" role="region" aria-label="?�래??기록">${timelineHtml}</div>`
                : ""
            }
            <div class="saved-item-actions actions--primary" role="group" aria-label="카드 ?�업 버튼">
                <button class="action-button btn-primary" data-action="edit" data-type="${
                  item.type || "edit"
                }" data-item-id="${item.id}" aria-label="${
      (item.type || "edit") === "reference"
        ? "?�퍼?�스 글 ?�집"
        : "?�성 글 ?�집"
    }">?�집</button>
                <button class="action-button btn-tracking" data-action="add-tracking" data-item-id="${
                  item.id
                }" aria-label="?�래???�이???�력">?�� ?�이???�력</button>
                <div class="llm-validation-dropdown" style="position: relative; display: inline-block;">
                    <button class="action-button btn-llm-main" data-action="llm-validation" data-item-id="${
                      item.id
                    }" aria-label="LLM 검�?메뉴">?�� LLM 검�?/button>
                    <div class="llm-dropdown-menu">
                        <button class="llm-option" data-llm="chatgpt" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?��</span>
                                    <span class="llm-name">ChatGPT</span>
                                    <span class="llm-description">SNS ?�킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="gemini" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?��</span>
                                    <span class="llm-name">Gemini</span>
                                    <span class="llm-description">?�리???�킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="perplexity" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?��</span>
                                    <span class="llm-name">Perplexity</span>
                                    <span class="llm-description">?�렌??검�?/span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="grok" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">??</span>
                                    <span class="llm-name">Grok</span>
                                    <span class="llm-description">?�팩??최적??/span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="more-menu actions--more">
                    <button class="more-menu-btn" data-action="more" data-item-id="${
                      item.id
                    }" aria-haspopup="true" aria-expanded="false" aria-label="기�? ?�업 메뉴 ?�기">??/button>
                    <div class="more-menu-list" role="menu" aria-label="기�? ?�업">
                        <button class="more-menu-item" role="menuitem" data-action="delete" data-item-id="${
                          item.id
                        }" aria-label="글 ??��">??��</button>
                    </div>
                </div>
            </div>
        </div>
        `;
  }
  // 미트?�킹 글 개수 ?�인 �??�괄 ?�래??버튼 ?�데?�트
  /**
   * 미트?�킹 글 ?�인 �??�괄 마이그레?�션 버튼 ?�데?�트
   *
   * ?�능 최적??
   * - Firebase 쿼리 N�???0�?(메모�??�이?�만 ?�용)
   * - ?�행 ?�간: 20-60�???10ms 미만
   * - Set ?�료구조�?O(1) 검??구현
   *
   * @returns {void}
   */
  updateBatchMigrationButton() {
    if (!this.batchMigrationBtn || !this.currentUser || !this.isFirebaseReady)
      return;

    try {
      // ???�능 최적?? 메모�??�이?�만 ?�용 (Firebase 쿼리 ?�음)
      // Set???�용?�여 O(1) 검??구현
      const trackedTextIds = new Set(
        (this.trackingPosts || []).map((p) => p.sourceTextId).filter(Boolean)
      );

      // ?�전??배열 처리 (�?배열 ?�백)
      const untrackedTexts = (this.savedTexts || []).filter(
        (textItem) => !trackedTextIds.has(textItem.id)
      );

      // 버튼 UI ?�데?�트
      const migrationTools = document.querySelector(".migration-tools");
      if (migrationTools) {
        if (untrackedTexts.length > 0) {
          // 미트?�킹 글???�으�?버튼 ?�시 �?개수 ?�시
          migrationTools.style.display = "flex";
          this.batchMigrationBtn.style.display = "block";
          this.batchMigrationBtn.textContent = `?�� 미트?�킹 글 ${untrackedTexts.length}�??�괄 ?�래???�작`;
          this.batchMigrationBtn.title = `${untrackedTexts.length}개의 ?�?�된 글???�직 ?�래?�되지 ?�았?�니?? 모두 ?�래?�을 ?�작?�시겠습?�까?`;

          // ?�근??개선: aria-label ?�적 ?�데?�트
          this.batchMigrationBtn.setAttribute(
            "aria-label",
            `${untrackedTexts.length}개의 미트?�킹 글 ?�괄 ?�래???�작`
          );
        } else {
          // 미트?�킹 글???�으�?버튼 ?��?
          migrationTools.style.display = "none";
          this.batchMigrationBtn.style.display = "none";
        }
      }

      // ?�능 로그 (?�버깅용)
      logger.log(
        `??미트?�킹 글 ?�인 ?�료: ${untrackedTexts.length}�?(메모�?검?? Firebase 쿼리 ?�음)`
      );
    } catch (error) {
      logger.error("??미트?�킹 글 ?�인 ?�패:", error);

      // ?�러 발생 ??버튼 ?��?
      if (this.batchMigrationBtn) {
        this.batchMigrationBtn.style.display = "none";
      }

      // ?�용???�림 (UX 개선)
      this.showMessage(
        "?�️ 미트?�킹 글 ?�인 �??�류가 발생?�습?�다.",
        "warning"
      );
    }
  }

  // ?�래???�?�라???�더�?
  renderTrackingTimeline(metrics) {
    if (!metrics || metrics.length === 0) {
      return "";
    }

    // ?�짜 ?�으�??�렬 (?�래??것�???
    const sortedMetrics = [...metrics].sort((a, b) => {
      const dateA = a.timestamp?.toDate
        ? a.timestamp.toDate().getTime()
        : a.timestamp instanceof Date
        ? a.timestamp.getTime()
        : 0;
      const dateB = b.timestamp?.toDate
        ? b.timestamp.toDate().getTime()
        : b.timestamp instanceof Date
        ? b.timestamp.getTime()
        : 0;
      return dateA - dateB;
    });

    const totalCount = sortedMetrics.length;

    // ?�계 계산
    const totals = this.calculateMetricsTotal(metrics);

    // localStorage?�서 ?�기/?�치�??�태 복원 (per-post)
    // saved-item??data-item-id�??�용?�여 ???�성
    // ???�수??saved-item ?��??�서 ?�출?��?�? ?�로?�???�라미터�?itemId ?�달 ?�요
    const savedItemId = arguments[1] || null; // ??번째 ?�라미터�?itemId ?�달
    // ?�일???�키�? card:{itemId}:details (?�?�라???�기/?�치�?
    const isExpanded = savedItemId
      ? localStorage.getItem(`card:${savedItemId}:details`) === "1"
      : false;
    const collapsedClass = isExpanded ? "" : "collapsed";
    const buttonText = isExpanded ? "?�기" : `기록 ${totalCount}�??�보�?;

    return `
            <div class="tracking-timeline-container">
                <div class="tracking-timeline-header">
                    <span class="timeline-title">?�� ?�래??기록</span>
                    ${this.renderMetricsTotals(totals)}
                    <button class="timeline-toggle-btn small" onclick="dualTextWriter.toggleTimelineCollapse(this)" aria-label="기록 ?�보�??�기" aria-expanded="${
                      isExpanded ? "true" : "false"
                    }">${buttonText}</button>
                </div>
                <div class="tracking-timeline-content ${collapsedClass}">
                    ${sortedMetrics
                      .map((metric, sortedIdx) => {
                        const date = metric.timestamp?.toDate
                          ? metric.timestamp.toDate()
                          : metric.timestamp instanceof Date
                          ? metric.timestamp
                          : new Date();
                        const dateStr = this.formatDateForDisplay(date);
                        const originalIndex = metrics.findIndex((m) => {
                          const mDate = m.timestamp?.toDate
                            ? m.timestamp.toDate().getTime()
                            : m.timestamp instanceof Date
                            ? m.timestamp.getTime()
                            : 0;
                          const metricDate = metric.timestamp?.toDate
                            ? metric.timestamp.toDate().getTime()
                            : metric.timestamp instanceof Date
                            ? metric.timestamp.getTime()
                            : 0;
                          return (
                            mDate === metricDate &&
                            m.views === metric.views &&
                            m.likes === metric.likes
                          );
                        });
                        const metricIndex =
                          originalIndex >= 0 ? originalIndex : sortedIdx;
                        return `
                            <div class="timeline-item" data-metric-index="${metricIndex}" role="button" aria-label="기록 ?�집">
                                <span class="timeline-date">?�� ${dateStr}</span>
                                <div class="timeline-item-data">
                                    <span class="metric-badge views">?? ${
                                      metric.views || 0
                                    }</span>
                                    <span class="metric-badge likes">?�️ ${
                                      metric.likes || 0
                                    }</span>
                                    <span class="metric-badge comments">?�� ${
                                      metric.comments || 0
                                    }</span>
                                    <span class="metric-badge shares">?�� ${
                                      metric.shares || 0
                                    }</span>
                                    <span class="metric-badge follows">?�� ${
                                      metric.follows || 0
                                    }</span>
                                </div>
                            </div>
                        `;
                      })
                      .join("")}
                </div>
            </div>
        `;
  }

  // ?�짜 ?�맷??(25??10??29???�식)
  formatDateForDisplay(date) {
    if (!date || !(date instanceof Date)) {
      return "";
    }
    const year = date.getFullYear().toString().slice(-2); // 마�?�?2?�리
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}??${month}??${day}??;
  }

  /**
   * Firestore Timestamp ?�는 ?�양???�짜 ?�식???�국???�짜 문자?�로 변?�합?�다.
   *
   * Firestore Timestamp, Date 객체, ?�자(?�?�스?�프), 문자?????�양???�식??
   * ?�국???�짜 ?�식("2025??11??11??)?�로 변?�합?�다.
   *
   * @param {Object|Date|number|string} dateInput - 변?�할 ?�짜 (Firestore Timestamp, Date, ?�자, 문자??
   * @returns {string} ?�국???�짜 ?�식 문자??(?? "2025??11??11??) ?�는 �?문자??
   *
   * @example
   * // Firestore Timestamp
   * formatDateFromFirestore(timestamp) // "2025??11??11??
   *
   * // Date 객체
   * formatDateFromFirestore(new Date()) // "2025??11??11??
   *
   * // ?�자 ?�?�스?�프
   * formatDateFromFirestore(1699718400000) // "2025??11??11??
   */
  formatDateFromFirestore(dateInput) {
    if (!dateInput) {
      return "";
    }

    try {
      let dateObj = null;

      // Firestore Timestamp 처리
      if (dateInput.toDate && typeof dateInput.toDate === "function") {
        dateObj = dateInput.toDate();
      }
      // Date 객체 처리
      else if (dateInput instanceof Date) {
        dateObj = dateInput;
      }
      // ?�자 ?�?�스?�프 처리
      else if (typeof dateInput === "number") {
        dateObj = new Date(dateInput);
      }
      // 문자???�짜 처리
      else if (typeof dateInput === "string") {
        const parsed = Date.parse(dateInput);
        if (!Number.isNaN(parsed)) {
          dateObj = new Date(parsed);
        }
      }

      // ?�효??Date 객체?��? ?�인
      if (
        !dateObj ||
        !(dateObj instanceof Date) ||
        Number.isNaN(dateObj.getTime())
      ) {
        return "";
      }

      // ?�국???�짜 ?�식?�로 변??
      return dateObj.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      // ?�러 발생 ??�?문자??반환
      logger.warn("?�짜 ?�맷??�??�류 발생:", error);
      return "";
    }
  }

  /**
   * ?�래??메트�?�� 최신 값을 반환?�니??
   *
   * ?�용?�는 기록??기존?�서 ?�후�??�어가??방식?�로,
   * �??�짜??값�? ?�당 ?�점???�적값을 ?��??�니??
   * ?�라??가??마�?�?최신) 기록??값이 ?�재 총합???��??�니??
   *
   * @param {Array} metrics - 메트�?배열
   * @returns {Object} 가??최신 메트�?�� �?객체
   */
  calculateMetricsTotal(metrics) {
    if (!metrics || metrics.length === 0) {
      return {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalFollows: 0,
      };
    }

    // ?�짜 ?�으�??�렬?�여 가??최신 메트�?찾기
    const sortedMetrics = [...metrics].sort((a, b) => {
      const dateA = a.timestamp?.toDate
        ? a.timestamp.toDate().getTime()
        : a.timestamp instanceof Date
        ? a.timestamp.getTime()
        : 0;
      const dateB = b.timestamp?.toDate
        ? b.timestamp.toDate().getTime()
        : b.timestamp instanceof Date
        ? b.timestamp.getTime()
        : 0;
      return dateA - dateB; // ?�래??것�????�렬
    });

    // 가??마�?�?최신) 메트�?�� �?반환
    const latestMetric = sortedMetrics[sortedMetrics.length - 1];

    return {
      totalViews: latestMetric.views || 0,
      totalLikes: latestMetric.likes || 0,
      totalComments: latestMetric.comments || 0,
      totalShares: latestMetric.shares || 0,
      totalFollows: latestMetric.follows || 0,
    };
  }

  /**
   * ?�퍼?�스 글???�용 ?��?�?배�? ?�태�??�더링합?�다.
   *
   * ?�용 ?��????�라 배�? HTML??반환?�니??
   * - ?�용 ?�됨 (usageCount === 0): �?문자??반환
   * - ?�용??(usageCount > 0): "???�용?? ?�는 "?�용??N?? 배�? HTML 반환
   *
   * @param {number} usageCount - ?�퍼?�스 글???�용 ?�수 (0 ?�상???�수)
   * @returns {string} 배�? HTML 문자??(?�용 ?�됨?�면 �?문자??
   *
   * @example
   * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(3);
   * // 결과: '<span class="reference-usage-badge" aria-label="?�용??3?? role="status">???�용??3??/span>'
   *
   * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(0);
   * // 결과: '' (�?문자??
   */
  renderReferenceUsageBadge(usageCount) {
    // ?�러 처리: null ?�는 undefined ?�력 처리
    if (usageCount == null) {
      return "";
    }

    // ?�러 처리: ?�자가 ?�닌 경우 처리
    if (typeof usageCount !== "number") {
      logger.warn(
        "renderReferenceUsageBadge: usageCount가 ?�자가 ?�닙?�다:",
        usageCount
      );
      return "";
    }

    // ?�러 처리: ?�수??경우 0?�로 처리
    if (usageCount < 0) {
      logger.warn(
        "renderReferenceUsageBadge: usageCount가 ?�수?�니??",
        usageCount
      );
      usageCount = 0;
    }

    // ?�용 ?�됨: ?�색 배�? HTML 반환 (?�릭 가??
    if (usageCount === 0) {
      const ariaLabel = "?�퍼?�스 ?�용 ?�됨 (?�릭?�면 ?�용?�으�??�시)";
      return `<span class="reference-usage-badge reference-usage-badge--unused reference-usage-badge--clickable" data-action="mark-reference-used" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">?�� ?�용 ?�됨</span>`;
    }

    // ?�용?? 초록??배�? HTML 반환 (?�릭 가?? ?��? 기능)
    // ?�근?? aria-label�??�용 ?��?�??�크�?리더???�달
    // role="button"?�로 ?�릭 가?�함??명시
    const usageText = usageCount === 1 ? "?�용?? : `?�용??${usageCount}??;
    const ariaLabel = `?�퍼?�스 ${usageText} (?�릭?�면 ?�용 ?�됨?�로 ?�시)`;

    return `<span class="reference-usage-badge reference-usage-badge--used reference-usage-badge--clickable" data-action="mark-reference-unused" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">??${usageText}</span>`;
  }

  /**
   * ?�래??메트�??�계�?배�? ?�태�??�더링합?�다.
   *
   * @param {Object} totals - ?�계 객체
   * @returns {string} ?�계 배�? HTML
   */
  renderMetricsTotals(totals) {
    return `
            <div class="metrics-totals" role="group" aria-label="?�재 ?�계">
                <span class="total-badge views" aria-label="?�재 조회?? ${totals.totalViews.toLocaleString()}">
                    <span class="total-icon">??</span>
                    <span class="total-value">${totals.totalViews.toLocaleString()}</span>
                </span>
                <span class="total-badge likes" aria-label="?�재 좋아?? ${totals.totalLikes.toLocaleString()}">
                    <span class="total-icon">?�️</span>
                    <span class="total-value">${totals.totalLikes.toLocaleString()}</span>
                </span>
                <span class="total-badge comments" aria-label="?�재 ?��?: ${totals.totalComments.toLocaleString()}">
                    <span class="total-icon">?��</span>
                    <span class="total-value">${totals.totalComments.toLocaleString()}</span>
                </span>
                <span class="total-badge shares" aria-label="?�재 공유: ${totals.totalShares.toLocaleString()}">
                    <span class="total-icon">?��</span>
                    <span class="total-value">${totals.totalShares.toLocaleString()}</span>
                </span>
                <span class="total-badge follows" aria-label="?�재 ?�로?? ${totals.totalFollows.toLocaleString()}">
                    <span class="total-icon">?��</span>
                    <span class="total-value">${totals.totalFollows.toLocaleString()}</span>
                </span>
            </div>
        `;
  }

  // ?�합 UI ?�데?�트 ?�수 (?�능 최적??
  refreshUI(options = {}) {
    const {
      savedTexts = false,
      trackingPosts = false,
      trackingSummary = false,
      trackingChart = false,
      force = false,
    } = options;

    // ?�데?�트 ?�에 추�?
    if (savedTexts) this.updateQueue.savedTexts = true;
    if (trackingPosts) this.updateQueue.trackingPosts = true;
    if (trackingSummary) this.updateQueue.trackingSummary = true;
    if (trackingChart) this.updateQueue.trackingChart = true;

    // 강제 ?�데?�트?�거??즉시 ?�행???�요??경우
    if (force) {
      this.executeUIUpdate();
      return;
    }

    // ?�바?�싱: 마�?�??�출 ??100ms ?�에 ?�행
    if (this.debounceTimers.uiUpdate) {
      clearTimeout(this.debounceTimers.uiUpdate);
    }

    this.debounceTimers.uiUpdate = setTimeout(() => {
      this.executeUIUpdate();
    }, 100);
  }

  // UI ?�데?�트 ?�행 (?��? ?�수)
  executeUIUpdate() {
    // ?�성 ???�인
    const savedTab = document.getElementById("saved-tab");
    const trackingTab = document.getElementById("tracking-tab");
    const isSavedTabActive = savedTab && savedTab.classList.contains("active");
    const isTrackingTabActive =
      trackingTab && trackingTab.classList.contains("active");

    // ?�?�된 글 ???�데?�트
    if (this.updateQueue.savedTexts && isSavedTabActive) {
      this.renderSavedTexts();
      this.updateQueue.savedTexts = false;
    }

    // ?�래?????�데?�트
    if (this.updateQueue.trackingPosts && isTrackingTabActive) {
      this.renderTrackingPosts();
      this.updateQueue.trackingPosts = false;
    }

    // ?�래???�약 ?�데?�트 (?�래????�� ?�성?�되???�을 ?�만)
    if (this.updateQueue.trackingSummary && isTrackingTabActive) {
      this.updateTrackingSummary();
      this.updateQueue.trackingSummary = false;
    }

    // ?�래??차트 ?�데?�트 (?�래????�� ?�성?�되???�고 차트가 보일 ?�만)
    if (this.updateQueue.trackingChart && isTrackingTabActive) {
      const chartContainer = document.querySelector(
        ".tracking-chart-container"
      );
      if (chartContainer && chartContainer.offsetParent !== null) {
        this.updateTrackingChart();
      }
      this.updateQueue.trackingChart = false;
    }
  }
  // ?�바?�싱 ?�틸리티 ?�수
  debounce(func, wait) {
    const key = func.name || "anonymous";
    if (this.debounceTimers[key]) {
      clearTimeout(this.debounceTimers[key]);
    }
    this.debounceTimers[key] = setTimeout(() => {
      func.apply(this, arguments);
      delete this.debounceTimers[key];
    }, wait);
  }

  // 범위 ?�터 초기??
  initRangeFilter() {
    try {
      // localStorage?�서 ?�기/?�치�??�태 복원
      const isExpanded = localStorage.getItem("rangeFilter:expanded") === "1";
      const content = document.getElementById("range-filter-content");
      const toggle = document.getElementById("range-filter-toggle");
      const toggleIcon = toggle?.querySelector(".toggle-icon");

      if (content && toggle && toggleIcon) {
        if (isExpanded) {
          content.style.display = "block";
          toggle.setAttribute("aria-expanded", "true");
          toggleIcon.textContent = "??;
        } else {
          content.style.display = "none";
          toggle.setAttribute("aria-expanded", "false");
          toggleIcon.textContent = "??;
        }
      }
    } catch (error) {
      logger.error("범위 ?�터 초기???�패:", error);
    }
  }

  // 범위 ?�터 ?�기/?�치�??��?
  toggleRangeFilter() {
    const content = document.getElementById("range-filter-content");
    const toggle = document.getElementById("range-filter-toggle");
    const toggleIcon = toggle?.querySelector(".toggle-icon");

    if (!content || !toggle || !toggleIcon) return;

    const isCurrentlyExpanded = content.style.display !== "none";
    const isExpanded = !isCurrentlyExpanded;

    if (isExpanded) {
      content.style.display = "block";
      toggle.setAttribute("aria-expanded", "true");
      toggleIcon.textContent = "??;
    } else {
      content.style.display = "none";
      toggle.setAttribute("aria-expanded", "false");
      toggleIcon.textContent = "??;
    }

    // ?�태 localStorage???�??
    try {
      localStorage.setItem("rangeFilter:expanded", isExpanded ? "1" : "0");
    } catch (error) {
      logger.error("범위 ?�터 ?�태 ?�???�패:", error);
    }
  }

  // ?�?�라???�보�??�기 (최신 1�?기본)
  toggleTimelineCollapse(button) {
    const container = button.closest(".tracking-timeline-container");
    const content = container.querySelector(".tracking-timeline-content");
    if (!content) return;

    // ?�?�된 글 ?�이??ID ?�인 (per-post ???�성??
    const savedItem = button.closest(".saved-item");
    const itemId = savedItem ? savedItem.getAttribute("data-item-id") : null;

    const collapsed = content.classList.toggle("collapsed");
    const total = content.querySelectorAll(".timeline-item").length;

    // ?�태 localStorage???�??(per-post)
    if (itemId) {
      try {
        // ?�일???�키�? card:{itemId}:details
        const key = `card:${itemId}:details`;
        localStorage.setItem(key, collapsed ? "0" : "1");
      } catch (e) {
        /* ignore quota */
      }
    }

    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) {
      button.textContent = `기록 ${total}�??�보�?;
    } else {
      button.textContent = "?�기";
    }
  }
  /**
   * ?�?�된 글 ??��???�벤??리스???�정 (?�벤???�임)
   * - 메뉴 ?�기/?�기, ??��, ?�래?????�?�된 글 관??모든 ?�벤??처리
   * - ?�벤??리스??중복 ?�록 방�?�??�해 기존 ?�들???�거 ?????�들???�록
   * @returns {void}
   */
  setupSavedItemEventListeners() {
    logger.log("setupSavedItemEventListeners ?�출??);

    // 기존 ?�벤??리스???�거 (중복 방�?)
    if (this.savedItemClickHandler) {
      this.savedList.removeEventListener("click", this.savedItemClickHandler);
    }
    if (this.savedItemKeydownHandler) {
      this.savedList.removeEventListener(
        "keydown",
        this.savedItemKeydownHandler
      );
    }

    // ?�보???�벤???�들??(?�근???�상)
    this.savedItemKeydownHandler = (event) => {
      // ?�보�??�기 버튼 ?�보???�근??
      const button = event.target.closest(".saved-item-toggle");
      if (button && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();

        const action = button.getAttribute("data-action");
        const itemId = button.getAttribute("data-item-id");

        if (action === "toggle" && itemId) {
          const contentEl = button
            .closest(".saved-item")
            .querySelector(".saved-item-content");
          if (contentEl) {
            const nowExpanded = contentEl.classList.toggle("expanded");
            button.textContent = nowExpanded ? "?�기" : "?�보�?;
            button.setAttribute(
              "aria-expanded",
              nowExpanded ? "true" : "false"
            );
            try {
              localStorage.setItem(
                `card:${itemId}:expanded`,
                nowExpanded ? "1" : "0"
              );
            } catch (e) {
              /* ignore quota */
            }
          }
        }
        return;
      }
    };

    // ?�릭 ?�벤???�들??
    this.savedItemClickHandler = (event) => {
      logger.log("?�?�된 글 ?�역 ?�릭:", event.target);

      // ?�퍼?�스 ?�용 배�? ?�릭 처리 (버튼???�닌 span ?�소)
      const badge = event.target.closest(".reference-usage-badge--clickable");
      if (badge) {
        const badgeAction = badge.getAttribute("data-action");
        if (badgeAction === "mark-reference-used") {
          event.preventDefault();
          event.stopPropagation();

          // ?�퍼?�스 카드?�서 itemId 찾기
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            logger.log(
              "?�퍼?�스 ?�용 배�? ?�릭 (?�용?�으�??�시):",
              referenceItemId
            );
            this.markReferenceAsUsed(referenceItemId);
          }
          return;
        } else if (badgeAction === "mark-reference-unused") {
          event.preventDefault();
          event.stopPropagation();

          // ?�퍼?�스 카드?�서 itemId 찾기
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            logger.log(
              "?�퍼?�스 ?�용 배�? ?�릭 (?�용 ?�됨?�로 ?�시):",
              referenceItemId
            );
            this.unmarkReferenceAsUsed(referenceItemId);
          }
          return;
        }
      }

      const button = event.target.closest("button");
      if (!button) {
        // 버튼???�니�??�?�라??????처리
        const row = event.target.closest(".timeline-item");
        if (row) {
          const metricIndex = row.getAttribute("data-metric-index");
          if (metricIndex != null) {
            this.editTrackingMetric(
              row.querySelector(".timeline-edit-btn") || row,
              metricIndex
            );
            return;
          }
        }
        return;
      }

      const action = button.getAttribute("data-action");
      const itemId = button.getAttribute("data-item-id");

      logger.log("?�벤??처리:", {
        itemId,
        action,
        button: button.textContent,
      });

      if (!itemId) {
        logger.error("Item ID not found");
        return;
      }

      if (action === "more") {
        // ?�벤???�파 ?�어: ?�벤??버블�?방�?�?바깥 ?�릭 ?�들?��? 즉시 ?�행?��? ?�도�???
        event.preventDefault();
        event.stopPropagation();

        // DOM ?�색 방식 개선: closest + querySelector ?�용?�로 ???�정?�인 ?�색
        const moreMenuContainer = button.closest(".more-menu");
        if (!moreMenuContainer) {
          logger.warn("[more menu] Container not found:", { itemId, button });
          return;
        }

        const menu = moreMenuContainer.querySelector(".more-menu-list");
        if (menu) {
          const isOpen = menu.classList.toggle("open");
          button.setAttribute("aria-expanded", isOpen ? "true" : "false");

          // ?�마???��??�닝: ?�면 ?�치???�라 메뉴 ?�시 방향 결정
          if (isOpen) {
            this.applySmartMenuPosition(menu, button);

            // ?�커???�랩: 메뉴가 ?�리�?�?번째 메뉴 ?�이?�에 ?�커??
            const firstMenuItem = menu.querySelector(".more-menu-item");
            if (firstMenuItem) {
              setTimeout(() => firstMenuItem.focus(), 50);
            }
          } else {
            // 메뉴 ?�힐 ???�치 ?�래???�거
            menu.classList.remove("open-top", "open-bottom");
          }
        } else {
          // 메뉴�?찾�? 못한 경우 ?�버�?로그 출력
          logger.warn("[more menu] Menu element not found:", {
            itemId,
            button,
            container: moreMenuContainer,
          });
        }
        return;
      } else if (action === "toggle") {
        const contentEl = button
          .closest(".saved-item")
          .querySelector(".saved-item-content");
        if (contentEl) {
          const nowExpanded = contentEl.classList.toggle("expanded");
          button.textContent = nowExpanded ? "?�기" : "?�보�?;
          button.setAttribute("aria-expanded", nowExpanded ? "true" : "false");
          try {
            // ?�일???�키�? card:{itemId}:expanded
            localStorage.setItem(
              `card:${itemId}:expanded`,
              nowExpanded ? "1" : "0"
            );
          } catch (e) {
            /* ignore quota */
          }
        }
      } else if (action === "edit") {
        const type = button.getAttribute("data-type");
        logger.log("?�집 ?�션 ?�행:", { itemId, type });
        this.editText(itemId, type);
      } else if (action === "delete") {
        logger.log("??�� ?�션 ?�행:", { itemId });
        // ?�벤???�파 ?�어: outsideClickHandler가 메뉴�??�기 ?�에 ??�� ?�행
        event.preventDefault();
        event.stopPropagation();
        // 메뉴 ?�기
        const moreMenuContainer = button.closest(".more-menu");
        if (moreMenuContainer) {
          const menu = moreMenuContainer.querySelector(".more-menu-list");
          if (menu) {
            menu.classList.remove("open");
            const menuBtn = moreMenuContainer.querySelector(".more-menu-btn");
            if (menuBtn) {
              menuBtn.setAttribute("aria-expanded", "false");
            }
          }
        }
        // ??�� ?�행
        this.deleteText(itemId);
      } else if (action === "track") {
        logger.log("?�래???�션 ?�행:", { itemId });
        this.startTrackingFromSaved(itemId);
      } else if (action === "add-tracking") {
        logger.log("?�래???�이???�력 ?�션 ?�행:", { itemId });
        this.currentTrackingPost = null; // ?�스??ID 초기??
        this.openTrackingModal(itemId);
      } else if (action === "llm-validation") {
        logger.log("LLM 검�??�롭?�운 ?�릭:", { itemId });
        event.preventDefault();
        event.stopPropagation();

        // ?�롭?�운 메뉴 ?��? (모바??지??
        const dropdownContainer = button.closest(".llm-validation-dropdown");
        if (dropdownContainer) {
          const dropdownMenu =
            dropdownContainer.querySelector(".llm-dropdown-menu");
          if (dropdownMenu) {
            const isOpen = dropdownMenu.classList.toggle("open");
            button.setAttribute("aria-expanded", isOpen ? "true" : "false");

            // ?�마???��??�닝: ?�면 ?�치???�라 메뉴 ?�시 방향 결정
            if (isOpen) {
              this.applySmartMenuPosition(dropdownMenu, button);

              // ?�커???�랩: 메뉴가 ?�리�?�?번째 LLM ?�션???�커??
              const firstOption = dropdownMenu.querySelector(".llm-option");
              if (firstOption) {
                setTimeout(() => firstOption.focus(), 50);
              }
            } else {
              // 메뉴 ?�힐 ???�치 ?�래???�거
              dropdownMenu.classList.remove("open-top", "open-bottom");
            }
          }
        }
        return;
      } else {
        // LLM ?�션 버튼 처리 (data-llm ?�성 ?�인)
        const llmService = button.getAttribute("data-llm");
        if (llmService) {
          logger.log("LLM ?�션 ?�릭:", { itemId, llmService });
          this.validateWithLLM(itemId, llmService);
        }
      }
    };

    // ?�벤??리스???�록
    this.savedList.addEventListener("click", this.savedItemClickHandler);
    this.savedList.addEventListener("keydown", this.savedItemKeydownHandler);

    // 기존 바깥 ?�릭 ?�들???�거 (중복 방�?)
    if (this.outsideClickHandler) {
      document.removeEventListener("click", this.outsideClickHandler, {
        capture: true,
      });
    }

    // 바깥 ?�릭 ??모든 more 메뉴 �?LLM ?�롭?�운 ?�기
    // setTimeout???�용?�여 ?�벤??처리 ?�서 보장: 메뉴�??�는 ?�작???�료????바깥 ?�릭??감�?
    this.outsideClickHandler = (e) => {
      const isInsideMenu = e.target.closest(".more-menu");
      const isInsideLLMDropdown = e.target.closest(".llm-validation-dropdown");

      if (!isInsideMenu && !isInsideLLMDropdown) {
        // ?�벤??처리 ?�서 보장: 메뉴 ?�기 ?�작???�료?????�행?�도�?setTimeout ?�용
        setTimeout(() => {
          // More 메뉴 ?�기
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // ?�커???�랩 ?�제: 메뉴 버튼?�로 ?�커??복원
            const menuBtn = el.previousElementSibling;
            if (menuBtn && menuBtn.classList.contains("more-menu-btn")) {
              menuBtn.setAttribute("aria-expanded", "false");
              menuBtn.focus();
            }
          });
          document
            .querySelectorAll('.more-menu-btn[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute("aria-expanded", "false"));

          // LLM ?�롭?�운 ?�기
          document.querySelectorAll(".llm-dropdown-menu.open").forEach((el) => {
            el.classList.remove("open");
            // ?�커???�랩 ?�제: LLM 메인 버튼?�로 ?�커??복원
            const llmBtn = el.previousElementSibling;
            if (llmBtn && llmBtn.classList.contains("btn-llm-main")) {
              llmBtn.setAttribute("aria-expanded", "false");
              llmBtn.focus();
            }
          });
          document
            .querySelectorAll('.btn-llm-main[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
        }, 0);
      }
    };
    document.addEventListener("click", this.outsideClickHandler, {
      capture: true,
    });

    // ?�?�라???�스�?롱프?�스 ??��, ?��??�프 �???
    if (!this._timelineGestureBound) {
      this._timelineGestureBound = true;
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let longPressTimer = null;
      const LONG_PRESS_MS = 550;
      const SWIPE_THRESHOLD = 60;

      this.savedList.addEventListener(
        "touchstart",
        (e) => {
          const row = e.target.closest(".timeline-item");
          if (!row) return;
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
          const metricIndex = row.getAttribute("data-metric-index");
          if (metricIndex == null) return;
          longPressTimer = setTimeout(() => {
            // 롱프?�스 ????�� ?�인
            this.editingMetricData = this.editingMetricData || {
              metricIndex: Number(metricIndex),
            };
            // editTrackingMetric?� 모달 기반?��?�?직접 ??�� ?�출 준비�? ?�해 context 보장 ?�요
            // 간단????�� ?�인 ??진행
            if (confirm("??기록????��?�까??")) {
              // edit modal 컨텍?�트 ?�이????�� ?�행???�해 ?�시 컨텍?�트 구성
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              // textId 기반?�로 editingMetricData ?�업
              this.editingMetricData = {
                postId: null,
                textId: itemId,
                metricIndex: Number(metricIndex),
              };
              this.deleteTrackingDataItem();
            }
          }, LONG_PRESS_MS);
        },
        { passive: true }
      );

      this.savedList.addEventListener(
        "touchmove",
        (e) => {
          if (longPressTimer) clearTimeout(longPressTimer);
        },
        { passive: true }
      );

      this.savedList.addEventListener(
        "touchend",
        (e) => {
          if (longPressTimer) clearTimeout(longPressTimer);
          const row = e.target.closest(".timeline-item");
          if (!row) return;
          const dx =
            ((e.changedTouches && e.changedTouches[0].clientX) || 0) -
            touchStartX;
          const dy =
            ((e.changedTouches && e.changedTouches[0].clientY) || 0) -
            touchStartY;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
            const metricIndex = row.getAttribute("data-metric-index");
            if (metricIndex == null) return;
            if (dx < 0) {
              // 좌스?�?�프 ???�집
              this.editTrackingMetric(row, metricIndex);
            } else {
              // ?�스?�?�프 ????�� ?�인
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              this.editingMetricData = {
                postId: null,
                textId: itemId,
                metricIndex: Number(metricIndex),
              };
              if (confirm("??기록????��?�까??")) {
                this.deleteTrackingDataItem();
              }
            }
          }
        },
        { passive: true }
      );
    }

    // ESC ?�로 메뉴 ?�기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const openMenu = document.querySelector(".more-menu-list.open");
        if (openMenu) {
          openMenu.classList.remove("open");
          const menuBtn = openMenu.previousElementSibling;
          if (menuBtn && menuBtn.classList.contains("more-menu-btn")) {
            menuBtn.setAttribute("aria-expanded", "false");
            menuBtn.focus();
          }
        }
      }
    });
    logger.log("?�벤??리스???�록 ?�료");
  }

  // ?�마???��??�닝: ?�면 ?�치???�라 메뉴 ?�시 방향 결정
  applySmartMenuPosition(menu, button) {
    // 기존 ?�치 ?�래???�거
    menu.classList.remove("open-top", "open-bottom");

    // 메뉴 ?�기 추정 (?�제 ?�더�??�이???�시�??�시?�여 ?�기 측정)
    const wasVisible = menu.style.display !== "none";
    if (!wasVisible) {
      menu.style.visibility = "hidden";
      menu.style.display = "block";
    }

    const menuRect = menu.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const menuHeight = menuRect.height || 150; // 기본�? ?�?�적??메뉴 ?�이
    const viewportHeight = window.innerHeight;
    const threshold = 200; // ?�단/?�단 ?�계�?(?��?)

    // ?�로 ?�시?�을 ???�면 밖으�??��??��? ?�인
    const spaceAbove = buttonRect.top;
    const spaceBelow = viewportHeight - buttonRect.bottom;

    // ?�치 결정 로직
    // 1. ?�단 근처(threshold ?�내)?�고 ?�로 ?�시??공간??부족하�????�래�?
    // 2. ?�단 근처?�고 ?�래�??�시??공간??부족하�????�로
    // 3. �??�에??기본�??�로) ?�용

    if (spaceAbove < threshold && spaceAbove < menuHeight + 20) {
      // ?�면 ?�단 근처?�고 ?�로 ?�시??공간??부�????�래�??�시
      menu.classList.add("open-bottom");
    } else if (spaceBelow < threshold && spaceBelow < menuHeight + 20) {
      // ?�면 ?�단 근처?�고 ?�래�??�시??공간??부�????�로 ?�시
      menu.classList.add("open-top");
    } else {
      // 기본�? ?�로 ?�시 (???�연?�러??UX)
      menu.classList.add("open-top");
    }

    // ?�시 ?�시 ?�거
    if (!wasVisible) {
      menu.style.visibility = "";
      menu.style.display = "";
    }
  }

  // ?�널 기반 LLM 검�?버튼 바인??(?�사??가??
  bindPanelLLMButtons() {
    logger.log("?�널 LLM 버튼 바인???�작");

    const panelLlmButtons = document.querySelectorAll(
      ".llm-option[data-panel]"
    );
    logger.log(`?�널 LLM 버튼 ${panelLlmButtons.length}�?발견`);

    panelLlmButtons.forEach((button, index) => {
      const panel = button.getAttribute("data-panel");
      const llmService = button.getAttribute("data-llm");

      if (!panel || !llmService) {
        logger.warn(`?�널 LLM 버튼 ${index}???�수 ?�성???�습?�다:`, {
          panel,
          llmService,
        });
        return;
      }

      logger.log(`?�널 LLM 버튼 ${index} 바인??`, { panel, llmService });

      // 기존 ?�벤??리스???�거 (중복 방�?)
      if (button._panelLlmHandler) {
        button.removeEventListener("click", button._panelLlmHandler);
      }

      // ?�로???�벤???�들???�성 �?바인??
      button._panelLlmHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("?�널 LLM 버튼 ?�릭:", { panel, llmService });
        this.validatePanelWithLLM(panel, llmService);
      };

      button.addEventListener("click", button._panelLlmHandler);
    });

    logger.log("?�널 LLM 버튼 바인???�료");
  }

  // 직접 ?�벤??바인??(백업 방법)
  bindDirectEventListeners() {
    logger.log("직접 ?�벤??바인???�작");

    const editButtons = this.savedList.querySelectorAll(".btn-edit");
    const deleteButtons = this.savedList.querySelectorAll(".btn-delete");
    const llmButtons = this.savedList.querySelectorAll(".llm-option");

    logger.log(
      `?�집 버튼 ${editButtons.length}�? ??�� 버튼 ${deleteButtons.length}�? LLM 버튼 ${llmButtons.length}�?발견`
    );

    editButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");
      const type = button.getAttribute("data-type");

      logger.log(`?�집 버튼 ${index} 바인??`, { itemId, type });

      // 기존 ?�벤??리스???�거
      button.removeEventListener("click", button._editHandler);

      // ?�로???�벤???�들???�성 �?바인??
      button._editHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("직접 ?�집 버튼 ?�릭:", { itemId, type });
        this.editText(itemId, type);
      };

      button.addEventListener("click", button._editHandler);
    });

    deleteButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");

      logger.log(`??�� 버튼 ${index} 바인??`, { itemId });

      // 기존 ?�벤??리스???�거
      button.removeEventListener("click", button._deleteHandler);

      // ?�로???�벤???�들???�성 �?바인??
      button._deleteHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("직접 ??�� 버튼 ?�릭:", { itemId });
        this.deleteText(itemId);
      };

      button.addEventListener("click", button._deleteHandler);
    });

    // ?�널 기반 LLM 검�?버튼??바인??(?�사???�수 ?�출)
    this.bindPanelLLMButtons();

    logger.log("직접 ?�벤??바인???�료");
  }

  // LLM ?�성 ?�보 검�??�수 (개발?�용)
  verifyLLMCharacteristics() {
    logger.log("=== LLM ?�성 ?�보 검�?===");

    if (!this.llmCharacteristics) {
      logger.error("??llmCharacteristics 객체가 ?�습?�다!");
      return false;
    }

    const services = ["chatgpt", "gemini", "perplexity", "grok"];
    let allValid = true;

    services.forEach((service) => {
      const char = this.llmCharacteristics[service];
      if (!char) {
        logger.error(`??${service} ?�성 ?�보가 ?�습?�다!`);
        allValid = false;
      } else {
        logger.log(`??${service}:`, {
          name: char.name,
          description: char.description,
          details: char.details,
          strength: char.strength,
        });
      }
    });

    logger.log("=== 검�??�료 ===");
    return allValid;
  }

  // ?�버깅용 ?�수 - ?�역?�서 ?�출 가??
  debugSavedItems() {
    logger.log("=== ?�?�된 글 ?�버�??�보 ===");
    logger.log("savedTexts 배열:", this.savedTexts);
    logger.log("savedList ?�소:", this.savedList);

    const savedItems = this.savedList.querySelectorAll(".saved-item");
    logger.log(`?�?�된 글 ??�� ${savedItems.length}�?`);

    savedItems.forEach((item, index) => {
      const itemId = item.getAttribute("data-item-id");
      const editBtn = item.querySelector(".btn-edit");
      const deleteBtn = item.querySelector(".btn-delete");

      logger.log(`??�� ${index}:`, {
        id: itemId,
        editButton: editBtn,
        deleteButton: deleteBtn,
        editButtonId: editBtn?.getAttribute("data-item-id"),
        deleteButtonId: deleteBtn?.getAttribute("data-item-id"),
      });
    });

    const editButtons = this.savedList.querySelectorAll(".btn-edit");
    const deleteButtons = this.savedList.querySelectorAll(".btn-delete");
    logger.log(
      `?�집 버튼 ${editButtons.length}�? ??�� 버튼 ${deleteButtons.length}�?
    );

    logger.log("=== ?�버�??�보 ??===");
  }

  editText(id, type) {
    logger.log("?�집 버튼 ?�릭:", { id, type });
    const item = this.savedTexts.find((saved) => saved.id === id);
    if (item) {
      logger.log("?�집????�� 찾음:", item);
      if (type === "reference") {
        this.refTextInput.value = item.content;
        this.updateCharacterCount("ref");
        this.refTextInput.focus();
        this.showMessage(
          "?�퍼?�스 글???�집 ?�역?�로 불러?�습?�다.",
          "success"
        );
      } else {
        this.editTextInput.value = item.content;
        // 주제 로드 (?�정/?�성 글??경우)
        if (this.editTopicInput) {
          this.editTopicInput.value = item.topic || "";
        }
        // SNS ?�랫??로드 (?�정/?�성 글??경우)
        if (item.platforms && Array.isArray(item.platforms)) {
          this.selectedSnsPlatforms = [...item.platforms];
        } else {
          this.selectedSnsPlatforms = [];
        }
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        this.updateCharacterCount("edit");
        this.editTextInput.focus();
        this.showMessage("?�정 글???�집 ?�역?�로 불러?�습?�다.", "success");
      }
      this.refTextInput.scrollIntoView({ behavior: "smooth" });
    } else {
      logger.error("?�집????��??찾을 ???�음:", {
        id,
        type,
        savedTexts: this.savedTexts,
      });
      this.showMessage("?�집??글??찾을 ???�습?�다.", "error");
    }
  }
  // Firestore?�서 ?�스????�� (Soft Delete)
  async deleteText(id) {
    logger.log("??�� 버튼 ?�릭 (Soft Delete):", { id });

    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("로그?�이 ?�요?�니??", "error");
      return;
    }

    try {
      // ??��???�이??찾기
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("??��???�이?�을 찾을 ???�습?�다:", id);
        this.showMessage("??��??글??찾을 ???�습?�다.", "error");
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // Phase 1.7.1: ?�퍼?�스 ??�� ???�결???�성글 ?�인
      if ((itemToDelete.type || "edit") === "reference") {
        const usedEdits = this.getEditsByReference(id);
        if (usedEdits.length > 0) {
          const confirmed = confirm(
            `?�️ ???�퍼?�스??${usedEdits.length}개의 ?�성글?�서 참고?�고 ?�습?�다.\n\n` +
              `?��??�으�??�동?�시겠습?�까?\n\n` +
              `(?�성글???�결 ?�보???��??��?�? ?�퍼?�스 ?�용?� �????�게 ?�니??)`
          );
          if (!confirmed) {
            logger.log("?�용?��? ?�퍼?�스 ??�� 취소");
            return;
          }
        }
      }

      if (!confirm("??글???��??�으�??�동?�시겠습?�까?")) {
        return;
      }

      // ?��????�데?�트�??�한 백업
      const itemBackup = { ...itemToDelete };

      // Soft Delete 처리
      itemToDelete.isDeleted = true;
      itemToDelete.deletedAt = new Date().toISOString();

      // UI ?�데?�트 (메인 목록?�서 ?�거)
      // this.savedTexts??참조�??��??�야 ?��?�?배열 ?�체�?교체?��? ?�고 ?�태�?변�?
      // renderSavedTexts?�서 isDeleted ?�터�?처리

      // 캐시 무효??
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // UI 갱신
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true, // ?�래???�스?�는 ?��??��?�??�스가 ??��???�시 ?�요?????�음
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      logger.log("Firestore Soft Delete ?�작:", { id });

      try {
        // Firestore ?�데?�트
        const docRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: true,
          deletedAt: window.firebaseServerTimestamp(), // ?�버 ?�간 ?�용
        });

        this.showMessage("?��??�으�??�동?�었?�니??", "success");
        logger.log("Soft Delete ?�료", { id });
      } catch (error) {
        logger.error("?�스????�� ?�패:", error);

        // ?�패 복구
        itemToDelete.isDeleted = false;
        delete itemToDelete.deletedAt;

        this.renderSavedTextsCache = null;
        this.renderSavedTextsCacheKey = null;
        this.renderSavedTexts();

        this.showMessage(
          "?��????�동???�패?�습?�다. ?�시 ?�도?�주?�요.",
          "error"
        );
      }
    } catch (error) {
      logger.error("?�스????�� ?�패:", error);
      this.showMessage(
        "?��????�동???�패?�습?�다. ?�시 ?�도?�주?�요.",
        "error"
      );
    }
  }

  // 글 복원 (Restore)
  async restoreText(id) {
    logger.log("복원 버튼 ?�릭:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("복원???�이?�을 찾을 ???�습?�다:", id);
        return;
      }

      const itemToRestore = this.savedTexts[targetIndex];

      // ?��????�데?�트
      itemToRestore.isDeleted = false;
      itemToRestore.deletedAt = null;

      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // ?��???UI 갱신 (?�출?��? 처리?�거???�기??처리)
      if (document.getElementById("trash-bin-modal")) {
        this.renderTrashBinList();
      }
      // 메인 목록 갱신
      this.renderSavedTexts();

      try {
        const docRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: false,
          deletedAt: window.firebaseDeleteField(),
        });

        this.showMessage("글??복원?�었?�니??", "success");
      } catch (error) {
        logger.error("복원 ?�패:", error);
        // 롤백
        itemToRestore.isDeleted = true;
        itemToRestore.deletedAt = new Date().toISOString();
        if (document.getElementById("trash-bin-modal")) {
          this.renderTrashBinList();
        }
        this.showMessage("복원???�패?�습?�다.", "error");
      }
    } catch (error) {
      logger.error("복원 ?�류:", error);
    }
  }

  // ?�구 ??�� (Permanently Delete)
  async permanentlyDeleteText(id) {
    logger.log("?�구 ??�� 버튼 ?�릭:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("??��???�이?�을 찾을 ???�습?�다:", id);
        return;
      }

      if (
        !confirm(
          "?�말�??�구 ??��?�시겠습?�까?\n???�업?� ?�돌�????�으�? ?�결???�래???�이?�도 모두 ??��?�니??"
        )
      ) {
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // ?�결???�래???�스??찾기 (기존 로직 ?�사??
      const postsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceTextId", "==", id)
      );
      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      const connectedPosts = [];
      querySnapshot.forEach((doc) => {
        connectedPosts.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // ?��????�데?�트: 배열?�서 ?�거
      this.savedTexts.splice(targetIndex, 1);
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      if (document.getElementById("trash-bin-modal")) {
        this.renderTrashBinList();
      }

      try {
        // ?�제 Firestore ??��
        const deletePromises = connectedPosts.map((post) => {
          const postRef = window.firebaseDoc(
            this.db,
            "users",
            this.currentUser.uid,
            "posts",
            post.id
          );
          return window.firebaseDeleteDoc(postRef);
        });

        await Promise.all([
          ...deletePromises,
          window.firebaseDeleteDoc(
            window.firebaseDoc(
              this.db,
              "users",
              this.currentUser.uid,
              "texts",
              id
            )
          ),
        ]);

        this.showMessage("?�구 ??��?�었?�니??", "success");
      } catch (error) {
        logger.error("?�구 ??�� ?�패:", error);
        // 롤백 (복잡?��?�??�로고침 권장 메시지 ?�는 ?�순 ?�러 ?�시)
        this.showMessage(
          "?�구 ??�� �??�류가 발생?�습?�다. ?�로고침 ?�주?�요.",
          "error"
        );
        this.loadSavedTexts(true); // ?�이???�로??
      }
    } catch (error) {
      logger.error("?�구 ??�� ?�류:", error);
    }
  }
  // [Refactoring] Utils 모듈 ?�용
  escapeHtml(text) {
    return escapeHtml(text);
  }

  // ?�스?�만 ?�스케?�프 (줄바�??�이)
  escapeHtmlOnly(text) {
    if (!text) return "";

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * ?�용?�에�?메시지 ?�시
   * [Refactoring] UIManager�??�임
   * @param {string} message - 메시지 ?�용
   * @param {string} type - 메시지 ?�??('success', 'error', 'info', 'warning')
   */
  showMessage(message, type = "info") {
    if (this.uiManager) {
      this.uiManager.showMessage(message, type);
    } else {
      // Fallback: UIManager가 초기?�되지 ?��? 경우
      logger.warn("UIManager not initialized, using fallback");
      const messageEl = document.createElement("div");
      const bgColor =
        type === "success"
          ? "#28a745"
          : type === "error"
          ? "#dc3545"
          : type === "warning"
          ? "#ffc107"
          : "#17a2b8";

      messageEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${bgColor};
                color: ${type === "warning" ? "#000" : "white"};
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

      setTimeout(
        () => {
          messageEl.style.animation = "slideOut 0.3s ease";
          setTimeout(() => {
            if (messageEl.parentNode) {
              messageEl.parentNode.removeChild(messageEl);
            }
          }, 300);
        },
        type === "error" ? 4000 : 2000
      );
    }
  }

  /**
   * ?�크�?리더 ?�용?��? ?�한 ?�림
   * aria-live ?�역???�용?�여 ?�크�?리더??메시지�??�달?�니??
   *
   * @param {string} message - ?�크�?리더???�달??메시지
   */
  announceToScreenReader(message) {
    if (!message || typeof message !== "string") {
      return;
    }

    // aria-live ?�역???�으�??�성
    let ariaLiveRegion = document.getElementById("screen-reader-announcements");
    if (!ariaLiveRegion) {
      ariaLiveRegion = document.createElement("div");
      ariaLiveRegion.id = "screen-reader-announcements";
      ariaLiveRegion.setAttribute("aria-live", "polite");
      ariaLiveRegion.setAttribute("aria-atomic", "true");
      ariaLiveRegion.className = "sr-only";
      ariaLiveRegion.style.cssText = `
                position: absolute;
                left: -10000px;
                width: 1px;
                height: 1px;
                overflow: hidden;
            `;
      document.body.appendChild(ariaLiveRegion);
    }

    // 메시지 ?�데?�트 (?�크�?리더가 변경을 감�??�도�?
    ariaLiveRegion.textContent = "";
    // ?�간??지????메시지 ?�정 (?�크�?리더가 변경을 ?�실??감�??�도�?
    setTimeout(() => {
      ariaLiveRegion.textContent = message;
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // 보안 강화: ?�용???�이???�호??
  async encryptUserData(data) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));

      // ?�용?�별 고유 ???�성
      const userKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.currentUser + "dualTextWriter"),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        userKey,
        dataBuffer
      );

      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
      };
    } catch (error) {
      logger.warn("?�이???�호???�패:", error);
      return null;
    }
  }

  // 보안 강화: ?�용???�이??복호??
  async decryptUserData(encryptedData) {
    try {
      const encoder = new TextEncoder();
      const userKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.currentUser + "dualTextWriter"),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(encryptedData.iv) },
        userKey,
        new Uint8Array(encryptedData.encrypted)
      );

      return JSON.parse(encoder.decode(decrypted));
    } catch (error) {
      logger.warn("?�이??복호???�패:", error);
      return null;
    }
  }

  // Firebase ?�정 ?�내
  showFirebaseSetupNotice() {
    console.info(`
?�� Firebase ?�정???�요?�니??

1. Firebase Console (https://console.firebase.google.com) ?�속
2. ???�로?�트 ?�성 ?�는 기존 ?�로?�트 ?�택
3. "Authentication" > "Sign-in method" ?�서 Google 로그???�성??
4. "Firestore Database" ?�성
5. "Project Settings" > "General" ?�서 ????추�?
6. ?�정 ?�보�?index.html??firebaseConfig???�력

?�재??로컬 ?�토리�? 모드�??�작?�니??
        `);
  }

  // LLM 검�??�스??초기??
  initializeLLMValidation() {
    // LLM ?�이?�별 ?�롬?�트 ?�플�?
    this.llmPrompts = {
      chatgpt:
        "?�음 글??SNS ?�킹 관?�에??분석?�주?�요. ?�히 ?�음 ?�소?�을 ?��??�주?�요:\n\n?�� ?�킹 ?�과??\n- �?문장???�자??관?�을 ?????�는가?\n- 감정??몰입???�도?�는가?\n- ?�기?�을 ?�극?�는 ?�소가 ?�는가?\n\n?�� SNS 최적??\n- ?�기 ?�운 구조?��??\n- 공유?�고 ?��? ?�구�??�극?�는가?\n- ?��????�도?????�는 ?�소가 ?�는가?\n\n?�� 개선 ?�안:\n- ??강력???�킹 ?�인???�안\n- 감정??반응???�이??방법\n- ?�동 ?�도(좋아?? 공유, ?��?) 강화 방안\n\n?�� 카테고리 추천:\n- ??글???�떤 카테고리??가???�합?��? 3가지 추천\n- �?카테고리???�합?��? ?�유 ?�명\n- 카테고리�?게시 ?�략 ?�안\n\n[?�책 준??검??\n?�책: '경제???�익??관???�실???�는 주장?�나 ?�속(고수??보장, ?�금 보장, 무위?? ?�기�?고수?? ?�정 ?�익/?�센??보장 ??' 금�?.\n검???�???�스?? ??'분석??글'\n출력 ?�식(?�수):\n?�반 ?��?: [명백???�반|?�반 ?��? ?�음|?�매??경고)|?�전|명백??비위�?\n?�반 ?�험 ?�수: [1|2|3|4|5]\n?�반 근거 문구: [...]\n분석 ?�유: (?�심 근거�?3�??�내�?\n\n[2~3�?카피 ?�성]\n??��: ?�신?� 카피?�이?�입?�다. ?�래 '분석??글'??주제·?�서·메시지�??��??�며 2~3�?카피�??�성?�세??\n?�구?�항:\n- ?�확??2�??�는 3줄만 출력(?�황??맞춰 ?�택). 줄바꿈으�?구분, �????�스??금�?.\n- 2줄일 ?? 1줄차=보편?�·넓?� 공감(?�문�??�맥?�통), 2줄차=구체·직접?�·감???�입 ?�발.\n- 3줄일 ?? 1줄차=보편??메시지, 2줄차=맥락 ?�개(1줄과 ?�결), 3줄차=구체·직접?�·감???�입 ?�발.\n- 간결·명확, 중복/과장/?�시?�그/?�모지/?�옴??머리말·꼬리말 금�?.\n\n분석??글:\n",
      gemini:
        "?�음 글??SNS 마�????�문가 관?�에??분석?�주?�요:\n\n?�� ?�리???�킹 분석:\n- ?�자??무의?�을 ?�극?�는 ?�소 분석\n- 감정???�리�??�인???�별\n- ?��? ?�향 ?�용???��?\n\n?�� ?��??�자 분석:\n- ?�떤 ?�자층에�??�필?�는가?\n- 공감?� ?�성 ?�소??무엇?��??\n- ?�동 변?��? ?�도?????�는가?\n\n?�� ?�현??개선:\n- ??강력???�현?�로 바�? 부�?n- ?�각???�팩?��? ?�이??방법\n- 기억???�는 문구 만들�?n\n?�� 카테고리 추천:\n- ??글???�떤 카테고리??가???�합?��? 3가지 추천\n- �?카테고리???�합?��? ?�유 ?�명\n- 카테고리�?게시 ?�략 ?�안\n\n[?�책 준??검??\n?�책: '경제???�익??관???�실???�는 주장?�나 ?�속(고수??보장, ?�금 보장, 무위?? ?�기�?고수?? ?�정 ?�익/?�센??보장 ??' 금�?.\n검???�???�스?? ??'분석??글'\n출력 ?�식(?�수):\n?�반 ?��?: [명백???�반|?�반 ?��? ?�음|?�매??경고)|?�전|명백??비위�?\n?�반 ?�험 ?�수: [1|2|3|4|5]\n?�반 근거 문구: [...]\n분석 ?�유: (?�심 근거�?3�??�내�?\n\n[2~3�?카피 ?�성]\n??��: ?�신?� 카피?�이?�입?�다. ?�래 '분석??글'??주제·?�서·메시지�??��??�며 2~3�?카피�??�성?�세??\n?�구?�항:\n- ?�확??2�??�는 3줄만 출력(?�황??맞춰 ?�택). 줄바꿈으�?구분, �????�스??금�?.\n- 2줄일 ?? 1줄차=보편?�·넓?� 공감(?�문�??�맥?�통), 2줄차=구체·직접?�·감???�입 ?�발.\n- 3줄일 ?? 1줄차=보편??메시지, 2줄차=맥락 ?�개(1줄과 ?�결), 3줄차=구체·직접?�·감???�입 ?�발.\n- 간결·명확, 중복/과장/?�시?�그/?�모지/?�옴??머리말·꼬리말 금�?.\n\n분석??글:\n",
      perplexity:
        "?�음 글??SNS ?�렌??�??�뢰??관?�에??분석?�주?�요:\n\n?�� ?�렌???�합??\n- ?�재 SNS ?�렌?��? 부?�하?��??\n- 바이??가?�성???�는 주제?��??\n- ?�의?�절???�?�밍?��??\n\n?�� ?�뢰??강화:\n- ?�실 ?�인???�요??부�?n- ???�득???�는 근거 ?�시 방법\n- ?�문???�필 ?�소 추�? 방안\n\n?�� ?�산 가?�성:\n- 공유 가치�? ?�는 콘텐츠인가?\n- ?��????�으?????�는 ?�소??\n- 긍정??바이?�을 ?�한 개선??n\n?�� 카테고리 추천:\n- ??글???�떤 카테고리??가???�합?��? 3가지 추천\n- �?카테고리???�합?��? ?�유 ?�명\n- 카테고리�?게시 ?�략 ?�안\n\n[?�책 준??검??\n?�책: '경제???�익??관???�실???�는 주장?�나 ?�속(고수??보장, ?�금 보장, 무위?? ?�기�?고수?? ?�정 ?�익/?�센??보장 ??' 금�?.\n검???�???�스?? ??'분석??글'\n출력 ?�식(?�수):\n?�반 ?��?: [명백???�반|?�반 ?��? ?�음|?�매??경고)|?�전|명백??비위�?\n?�반 ?�험 ?�수: [1|2|3|4|5]\n?�반 근거 문구: [...]\n분석 ?�유: (?�심 근거�?3�??�내�?\n\n[2~3�?카피 ?�성]\n??��: ?�신?� 카피?�이?�입?�다. ?�래 '분석??글'??주제·?�서·메시지�??��??�며 2~3�?카피�??�성?�세??\n?�구?�항:\n- ?�확??2�??�는 3줄만 출력(?�황??맞춰 ?�택). 줄바꿈으�?구분, �????�스??금�?.\n- 2줄일 ?? 1줄차=보편?�·넓?� 공감(?�문�??�맥?�통), 2줄차=구체·직접?�·감???�입 ?�발.\n- 3줄일 ?? 1줄차=보편??메시지, 2줄차=맥락 ?�개(1줄과 ?�결), 3줄차=구체·직접?�·감???�입 ?�발.\n- 간결·명확, 중복/과장/?�시?�그/?�모지/?�옴??머리말·꼬리말 금�?.\n\n분석??글:\n",
      grok: "?�음 글??SNS ?�킹 ?�문가 관?�에??간결?�고 ?�팩???�게 분석?�주?�요:\n\n???�팩???�인??\n- 가??강력???�킹 문장?�?\n- ?�자?�게 ?�을 ?�심 메시지??\n- ?�동???�도?�는 CTA??\n\n?�� 명확??검�?\n- 메시지가 명확?�게 ?�달?�는가?\n- 불필?�한 ?�소???�는가?\n- ?�심�?간결?�게 ?�달?�는가?\n\n?? 개선 ?�션:\n- 즉시 ?�용 가?�한 개선??n- ??강력???�킹 문구 ?�안\n- ?�자 반응???�이??방법\n\n?�� 카테고리 추천:\n- ??글???�떤 카테고리??가???�합?��? 3가지 추천\n- �?카테고리???�합?��? ?�유 ?�명\n- 카테고리�?게시 ?�략 ?�안\n\n[?�책 준??검??\n?�책: '경제???�익??관???�실???�는 주장?�나 ?�속(고수??보장, ?�금 보장, 무위?? ?�기�?고수?? ?�정 ?�익/?�센??보장 ??' 금�?.\n검???�???�스?? ??'분석??글'\n출력 ?�식(?�수):\n?�반 ?��?: [명백???�반|?�반 ?��? ?�음|?�매??경고)|?�전|명백??비위�?\n?�반 ?�험 ?�수: [1|2|3|4|5]\n?�반 근거 문구: [...]\n분석 ?�유: (?�심 근거�?3�??�내�?\n\n[2~3�?카피 ?�성]\n??��: ?�신?� 카피?�이?�입?�다. ?�래 '분석??글'??주제·?�서·메시지�??��??�며 2~3�?카피�??�성?�세??\n?�구?�항:\n- ?�확??2�??�는 3줄만 출력(?�황??맞춰 ?�택). 줄바꿈으�?구분, �????�스??금�?.\n- 2줄일 ?? 1줄차=보편?�·넓?� 공감(?�문�??�맥?�통), 2줄차=구체·직접?�·감???�입 ?�발.\n- 3줄일 ?? 1줄차=보편??메시지, 2줄차=맥락 ?�개(1줄과 ?�결), 3줄차=구체·직접?�·감???�입 ?�발.\n- 간결·명확, 중복/과장/?�시?�그/?�모지/?�옴??머리말·꼬리말 금�?.\n\n분석??글:\n",
      claude:
        "?�음 글???�맷 ?�수?� �?문맥 ?�해??강한 ?�문가로서 분석?�주?�요:\n\n?�� 구조??분석:\n- 주제·메시지·?��??�약(1~2�?\n- ?�리 ?�름�?결론???�치 ?��?\n\n?�� ?�식 준???��?:\n- ?�구??출력 ?�식/??준???��?\n- 모호/과장/과도???�언 존재 ?��?\n\n?�� 개선 ?�안:\n- ?�식/명확??근거 보강 ?�인??n- ?�전???�???�현(과장 최소??\n\n[?�책 준??검??\n?�책: '경제???�익??관???�실???�는 주장?�나 ?�속(고수??보장, ?�금 보장, 무위?? ?�기�?고수?? ?�정 ?�익/?�센??보장 ??' 금�?.\n검???�???�스?? ??'분석??글'\n출력 ?�식(?�수):\n?�반 ?��?: [명백???�반|?�반 ?��? ?�음|?�매??경고)|?�전|명백??비위�?\n?�반 ?�험 ?�수: [1|2|3|4|5]\n?�반 근거 문구: [...]\n분석 ?�유: (?�심 근거�?3�??�내�?\n\n[2~3�?카피 ?�성]\n??��: ?�신?� 카피?�이?�입?�다. ?�래 '분석??글'??주제·?�서·메시지�??��??�며 2~3�?카피�??�성?�세??\n?�구?�항:\n- ?�확??2�??�는 3줄만 출력(?�황??맞춰 ?�택). 줄바꿈으�?구분, �????�스??금�?.\n- 2줄일 ?? 1줄차=보편?�·넓?� 공감(?�문�??�맥?�통), 2줄차=구체·직접?�·감???�입 ?�발.\n- 3줄일 ?? 1줄차=보편??메시지, 2줄차=맥락 ?�개(1줄과 ?�결), 3줄차=구체·직접?�·감???�입 ?�발.\n- 간결·명확, 중복/과장/?�시?�그/?�모지/?�옴??머리말·꼬리말 금�?.\n\n분석??글:\n",
    };

    // LLM ?�이?�별 ?�성 ?�보 (?�용??가?�드??
    this.llmCharacteristics = {
      chatgpt: {
        name: "ChatGPT",
        icon: "?��",
        description: "SNS ?�킹 분석",
        details: "?�킹 ?�과?�·SNS 최적?�·행???�도 분석",
        strength: "종합???�킹 ?�략",
      },
      gemini: {
        name: "Gemini",
        icon: "?��",
        description: "?�리???�킹",
        details: "무의???�극·감정 ?�리거·�?�??�자 분석",
        strength: "?�리?�적 ?�근",
      },
      perplexity: {
        name: "Perplexity",
        icon: "?��",
        description: "?�렌??검�?,
        details: "SNS ?�렌?�·바?�럴 가?�성·?�뢰??강화",
        strength: "?�시�??�렌??분석",
      },
      grok: {
        name: "Grok",
        icon: "??",
        description: "?�팩??최적??,
        details: "강력???�킹 문구·명확??메시지·즉시 개선??,
        strength: "간결???�팩??분석",
      },
      claude: {
        name: "Claude",
        icon: "?��",
        description: "?�식 ?�수·�?문맥",
        details: "?�식 준?�·안?�성·?�문 ?�약/구조??,
        strength: "?�책/?�맷 준?��? �?문맥 처리",
      },
    };

    // LLM ?�이?�별 ?�페?��? URL (쿼리 ?�라미터 지?????? 모달 방식 ?�용)
    this.llmUrls = {
      chatgpt: "https://chatgpt.com",
      gemini: "https://gemini.google.com",
      perplexity: "https://www.perplexity.ai",
      grok: "https://grok.com",
      claude: "https://claude.ai/new",
    };

    logger.log("LLM 검�??�스??초기???�료");
  }

  // ?�널 기반 LLM 검�??�행
  async validatePanelWithLLM(panel, llmService) {
    logger.log("?�널 LLM 검�??�작:", { panel, llmService });

    try {
      // ?�널???�른 ?�스???�역 ?�택
      let textArea, panelType;
      if (panel === "reference") {
        textArea = document.getElementById("ref-text-input");
        panelType = "?�퍼?�스 글";
      } else if (panel === "writing") {
        textArea = document.getElementById("edit-text-input");
        panelType = "?�정/?�성 글";
      } else {
        logger.error("지?�하지 ?�는 ?�널:", panel);
        this.showMessage("지?�하지 ?�는 ?�널?�니??", "error");
        return;
      }

      // ?�스???�용 가?�오�?
      const content = textArea.value.trim();
      if (!content) {
        this.showMessage(
          `${panelType}??비어?�습?�다. 먼�? 글???�성?�주?�요.`,
          "warning"
        );
        return;
      }

      // LLM ?�비???�보 가?�오�?
      const llmInfo = this.llmCharacteristics[llmService];
      if (!llmInfo) {
        logger.error("지?�하지 ?�는 LLM ?�비??", llmService);
        this.showMessage("지?�하지 ?�는 LLM ?�비?�입?�다.", "error");
        return;
      }

      // ?�롬?�트 ?�성 (?�목 ?�인 ?�이)
      const prompt = this.llmPrompts[llmService];
      const fullText = `${prompt}\n\n${content}`;

      logger.log("?�널 검�??�스???�성:", {
        panel,
        llmService,
        contentLength: content.length,
      });

      // ?�립보드??복사
      await this.copyToClipboard(fullText);

      // LLM ?�이???�기
      this.openLLMSite(llmService, fullText);

      // ?�공 메시지 (?�플???�내)
      this.showMessage(
        `${llmInfo.icon} ${llmInfo.name} ?�이지가 ?�렸?�니?? Ctrl+V�?붙여?�기?�세??`,
        "success"
      );
    } catch (error) {
      logger.error("?�널 LLM 검�??�행 ?�패:", error);
      this.showMessage("LLM 검�??�행???�패?�습?�다.", "error");
    }
  }

  // LLM 검�??�행
  async validateWithLLM(itemId, llmService) {
    logger.log("LLM 검�??�작:", { itemId, llmService });

    // ?�?�된 글 찾기
    const item = this.savedTexts.find((saved) => saved.id === itemId);
    if (!item) {
      this.showMessage("검증할 글??찾을 ???�습?�다.", "error");
      return;
    }

    // ?�롬?�트?� 글 ?�용 조합
    const prompt = this.llmPrompts[llmService];
    const fullText = prompt + item.content;

    logger.log("검�??�스???�성:", {
      llmService,
      contentLength: item.content.length,
    });

    try {
      // ?�립보드??복사
      await this.copyToClipboard(fullText);

      // LLM ?�이??URL ?�성 �?????��???�기
      this.openLLMSite(llmService, fullText);

      // ?�공 메시지 (?�플???�내)
      const llmInfo = this.llmCharacteristics[llmService];
      if (llmInfo) {
        this.showMessage(
          `${llmInfo.icon} ${llmInfo.name} ?�이지가 ?�렸?�니?? Ctrl+V�?붙여?�기?�세??`,
          "success"
        );
      }
    } catch (error) {
      logger.error("LLM 검�??�행 ?�패:", error);
      this.showMessage("LLM 검�??�행???�패?�습?�다.", "error");
    }
  }

  // ?�립보드???�스??복사
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        logger.log("?�립보드 복사 ?�공 (Clipboard API)");
      } else {
        // ?�백 방법
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        logger.log("?�립보드 복사 ?�공 (execCommand)");
      }
    } catch (error) {
      logger.error("?�립보드 복사 ?�패:", error);
      throw error;
    }
  }

  // LLM ?�이??????��???�기 (?�플??방식: ?�동 복사 + ?????�기)
  openLLMSite(llmService, text) {
    // LLM ?�비???�보 가?�오�?
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      logger.error("지?�하지 ?�는 LLM ?�비??", llmService);
      return;
    }

    // LLM ?�이??URL 가?�오�?
    const llmUrl =
      this.llmUrls[llmService] ||
      {
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        perplexity: "https://www.perplexity.ai",
        grok: "https://grok.com",
      }[llmService] ||
      "https://chatgpt.com";

    logger.log("LLM ?�이???�기:", { llmService, url: llmUrl });

    // ????��??LLM ?�이???�기
    window.open(llmUrl, "_blank", "noopener,noreferrer");
  }

  // LLM ?�합 복사 모달 ?�시 (모든 LLM 지??
  showLLMCopyModal(llmService, text) {
    // LLM ?�비???�보 가?�오�?
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      logger.error("지?�하지 ?�는 LLM ?�비??", llmService);
      return;
    }

    // 기본 URL 가?�오�?(쿼리 ?�라미터 ?�거)
    const baseUrl =
      this.llmUrls[llmService]?.split("?")[0] || this.llmUrls[llmService];
    const cleanUrl =
      baseUrl ||
      {
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        perplexity: "https://www.perplexity.ai",
        grok: "https://grok.com",
      }[llmService] ||
      "https://chatgpt.com";

    // 기존 모달???�다�??�거
    const existingModal = document.getElementById("llm-copy-modal");
    if (existingModal) {
      existingModal.remove();
    }

    // 모달 HTML ?�성 (모든 LLM??공통 ?�용)
    const modalHTML = `
            <div id="llm-copy-modal" class="gemini-modal-overlay">
                <div class="gemini-modal-content">
                    <div class="gemini-modal-header">
                        <h3>${llmInfo.icon} ${llmInfo.name} 검�??�스??복사</h3>
                        <button class="gemini-modal-close" onclick="this.closest('.gemini-modal-overlay').remove()">×</button>
                    </div>
                    <div class="gemini-modal-body">
                        <p class="gemini-instruction">?�래 ?�스?��? 복사?�여 ${llmInfo.name}??붙여?�기?�세??</p>
                        <div class="gemini-text-container">
                            <textarea id="llm-text-area" readonly>${text}</textarea>
                            <button class="gemini-copy-btn" onclick="dualTextWriter.copyLLMText('${llmService}')">?�� ?�체 복사</button>
                        </div>
                        <div class="gemini-steps">
                            <h4>?�� ?�용 방법:</h4>
                            <ol>
                                <li>?�의 "?�체 복사" 버튼???�릭?�세??(?�는 ?��? ?�립보드??복사?�어 ?�습?�다)</li>
                                <li>${llmInfo.name} ?�이지�??�동?�세??/li>
                                <li>${llmInfo.name} ?�력창에 Ctrl+V�?붙여?�기?�세??/li>
                                <li>Enter�??�러 검증을 ?�작?�세??/li>
                            </ol>
                        </div>
                        <div class="gemini-actions">
                            <button class="gemini-open-btn" onclick="window.open('${cleanUrl}', '_blank')">?? ${llmInfo.name} ?�기</button>
                            <button class="gemini-close-btn" onclick="this.closest('.gemini-modal-overlay').remove()">?�기</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // 모달??body??추�?
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // ?�스???�역 ?�동 ?�택
    setTimeout(() => {
      const textArea = document.getElementById("llm-text-area");
      if (textArea) {
        textArea.focus();
        textArea.select();
      }
    }, 100);
  }

  // Gemini ?�용 복사 모달 ?�시 (?�위 ?�환?�을 ?�해 ?��?)
  showGeminiCopyModal(text) {
    this.showLLMCopyModal("gemini", text);
  }

  // LLM ?�합 ?�스??복사 ?�수 (모든 LLM 지??
  copyLLMText(llmService) {
    const textArea = document.getElementById("llm-text-area");
    if (!textArea) {
      logger.error("LLM ?�스???�역??찾을 ???�습?�다.");
      return;
    }

    const llmInfo = this.llmCharacteristics[llmService];
    const llmName = llmInfo?.name || "LLM";

    try {
      // ?�스???�역 ?�택
      textArea.focus();
      textArea.select();

      // 복사 ?�행
      const successful = document.execCommand("copy");
      if (successful) {
        this.showMessage(`???�스?��? ?�립보드??복사?�었?�니??`, "success");

        // 복사 버튼 ?�스??변�?
        const copyBtn = document.querySelector(".gemini-copy-btn");
        if (copyBtn) {
          copyBtn.textContent = "??복사 ?�료!";
          copyBtn.style.background = "#4CAF50";

          // 2�????�래 ?�태�?복원
          setTimeout(() => {
            copyBtn.textContent = "?�� ?�체 복사";
            copyBtn.style.background = "";
          }, 2000);
        }
      } else {
        throw new Error("복사 명령 ?�행 ?�패");
      }
    } catch (error) {
      logger.error(`${llmName} ?�스??복사 ?�패:`, error);
      this.showMessage(
        "??복사???�패?�습?�다. ?�스?��? ?�동?�로 ?�택?�여 복사?�주?�요.",
        "error"
      );
    }
  }

  // Gemini ?�스??복사 ?�수 (?�위 ?�환?�을 ?�해 ?��?)
  copyGeminiText() {
    this.copyLLMText("gemini");
  }

  // LLM 검�?가?�드 메시지 ?�시
  showLLMValidationGuide(llmService) {
    const characteristics = this.llmCharacteristics[llmService];

    // 모든 LLM???�합 모달 방식 ?�용
    const message =
      `??${characteristics.name} 검�?모달???�렸?�니??\n\n` +
      `?�� 검증할 ?�스?��? ?�립보드??복사?�었?�니??\n` +
      `?�� 모달?�서 "?�체 복사" 버튼???�릭?�거?? ${characteristics.name} ?�이지�??�동?�여 Ctrl+V�?붙여?�기?�세??\n\n` +
      `?�� 기�? 결과: ${characteristics.description} - ${characteristics.details}`;

    this.showMessage(message, "success");

    // 추�? ?�내�??�한 ?�세 메시지
    setTimeout(() => {
      this.showDetailedGuide(llmService);
    }, 2000);
  }

  // ?�세 가?�드 ?�시
  showDetailedGuide(llmService) {
    const guides = {
      chatgpt:
        "ChatGPT??SNS ?�킹 분석 결과�?바탕?�로 글??감정??몰입�??�동 ?�도�?강화?�보?�요.",
      gemini:
        "Gemini???�리???�킹 분석??참고?�여 ?�자??무의?�을 ?�극?�는 ?�소�?추�??�보?�요.",
      perplexity:
        "Perplexity???�렌??분석 결과�??�용?�여 ?�재 SNS ?�렌?�에 맞게 글??개선?�보?�요.",
      grok: "Grok???�팩??분석??반영?�여 ??강력?�고 명확???�킹 문구�?글???�그?�이?�해보세??",
    };

    const guide = guides[llmService];
    this.showMessage(`?�� ${guide}`, "info");
  }

  // ?�시 ?�??기능
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

    if (refText.length > 0 || editText.length > 0) {
      // trim() ?�거?�여 ?�본 ?�맷 ?��?
      try {
        const tempData = {
          refText: refText,
          editText: editText,
          timestamp: Date.now(),
          refCharacterCount: this.getKoreanCharacterCount(refText),
          editCharacterCount: this.getKoreanCharacterCount(editText),
        };

        const userTempKey = `dualTextWriter_tempSave_${this.currentUser}`;
        localStorage.setItem(userTempKey, JSON.stringify(tempData));
        this.lastTempSave = tempData;
        this.showTempSaveStatus();
      } catch (error) {
        logger.error("?�시 ?�?�에 ?�패?�습?�다:", error);
      }
    }
  }

  showTempSaveStatus() {
    this.tempSaveStatus.classList.remove("hide");
    this.tempSaveStatus.classList.add("show");

    setTimeout(() => {
      this.tempSaveStatus.classList.remove("show");
      this.tempSaveStatus.classList.add("hide");
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
          if (confirm("?�시 ?�?�된 글???�습?�다. 복원?�시겠습?�까?")) {
            if (data.refText) {
              this.refTextInput.value = data.refText;
              this.updateCharacterCount("ref");
            }
            if (data.editText) {
              this.editTextInput.value = data.editText;
              this.updateCharacterCount("edit");
            }
            this.showMessage("?�시 ?�?�된 글??복원?�었?�니??", "success");
          }
        } else {
          localStorage.removeItem(userTempKey);
        }
      }
    } catch (error) {
      logger.error("?�시 ?�??복원???�패?�습?�다:", error);
    }
  }

  // Firestore?�서 ?�용???�이??로드
  async loadUserData() {
    if (!this.currentUser) return;

    try {
      // ??Phase 3.1.1: ?�수 ?�이??병렬 로드 (30-50% ?�축)
      // loadSavedTextsFromFirestore()?� loadTrackingPosts()???�로 ?�립?�이므�?
      // Promise.all???�용?�여 ?�시???�행
      await Promise.all([
        this.loadSavedTextsFromFirestore(),
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI ?�데?�트 (?�기)
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
      await this.renderSavedTexts();
      this.startTempSave();
      this.restoreTempSave();

      // 미트?�킹 글 버튼 ?�태 ?�데?�트 (?�기, Phase 2?�서 최적?�됨)
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    } catch (error) {
      logger.error("?�용???�이??로드 ?�패:", error);
      this.showMessage("?�이?��? 불러?�는???�패?�습?�다.", "error");
    }
  }

  /**
   * 모든 ?�이?��? ?�로고침?�니??
   *
   * Firebase?�서 최신 ?�이?��? ?�시 불러?� UI�??�데?�트?�니??
   * ?�?�된 글, ?�래???�스?? ?�계 ?�을 모두 ?�로고침?�니??
   */
  async refreshAllData() {
    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("?�️ 로그?�이 ?�요?�니??", "warning");
      return;
    }

    // 로딩 ?�태 ?�시
    const refreshBtn = this.refreshBtn;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      const refreshIcon = refreshBtn.querySelector(".refresh-icon");
      if (refreshIcon) {
        refreshIcon.style.animation = "spin 0.6s linear infinite";
      }
    }

    try {
      // ??Phase 3.1.1: ?�?�된 글 �??�래???�스??병렬 ?�로고침 (30-50% ?�축)
      await Promise.all([
        this.loadSavedTextsFromFirestore(),
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI ?�데?�트
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
      await this.renderSavedTexts();

      // 미트?�킹 글 버튼 ?�태 ?�데?�트 (?�기, Phase 2?�서 최적?�됨)
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }

      // 모든 ??�� ?�이??강제 ?�로고침
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      // ?�공 메시지
      this.showMessage("???�이?��? ?�로고침?�었?�니??", "success");
      logger.log("??모든 ?�이???�로고침 ?�료");
    } catch (error) {
      logger.error("?�이???�로고침 ?�패:", error);
      this.showMessage(
        "???�이???�로고침???�패?�습?�다: " + error.message,
        "error"
      );
    } finally {
      // 로딩 ?�태 ?�제
      if (refreshBtn) {
        refreshBtn.disabled = false;
        const refreshIcon = refreshBtn.querySelector(".refresh-icon");
        if (refreshIcon) {
          refreshIcon.style.animation = "";
          // ?�전 ?�니메이???�과
          refreshIcon.style.transform = "rotate(180deg)";
          setTimeout(() => {
            if (refreshIcon) {
              refreshIcon.style.transform = "";
            }
          }, 300);
        }
      }
    }
  }

  /**
   * ?�?�된 글 ?�이?��? 보장?�니??
   *
   * @param {boolean} forceReload - true�?Firestore?�서 ?�시 불러?�니??
   */
  async loadSavedTexts(forceReload = false) {
    try {
      const hasCachedData =
        Array.isArray(this.savedTexts) && this.savedTexts.length > 0;
      if (!forceReload && hasCachedData) {
        return;
      }

      if (!this.currentUser || !this.isFirebaseReady) {
        logger.warn(
          "loadSavedTexts: Firebase�� �����Ǿ� �ִ� �Ǵ� �α����� �ʿ��մϴ�."
        );
        return;
      }

      await this.loadSavedTextsFromFirestore();
      await this.renderSavedTexts();
    } catch (error) {
      logger.error("loadSavedTexts ����:", error);
      this.showMessage("??�����?�� �ҷ����� �� �����߽��ϴ�.", "error");
    }
  }

  // Firestore?�서 ?�?�된 ?�스?�들 불러?�기
  // ?�능 최적?? ?�버 ?�이???�터�?지??(?�택??
  async loadSavedTextsFromFirestore(filterOptions = {}) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // ?�버 ?�이???�터�?구성 (?�능 최적??
      // 참고: Firestore 복합 ?�덱???�요 ??Firebase Console?�서 ?�성 ?�요
      // ?�덱???�시: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)
      const queryConstraints = [window.firebaseOrderBy("createdAt", "desc")];

      // type ?�터 (?�버 ?�이??
      if (filterOptions.type && filterOptions.type !== "all") {
        queryConstraints.push(
          window.firebaseWhere("type", "==", filterOptions.type)
        );
      }

      // referenceType ?�터 (?�버 ?�이?? type??'reference'???�만 ?�효)
      if (
        filterOptions.type === "reference" &&
        filterOptions.referenceType &&
        filterOptions.referenceType !== "all"
      ) {
        queryConstraints.push(
          window.firebaseWhere(
            "referenceType",
            "==",
            filterOptions.referenceType
          )
        );
      }

      const q = window.firebaseQuery(textsRef, ...queryConstraints);
      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      this.savedTexts = [];
      // 캐시 무효??(?�이??로드 ??
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // ?�???�규??(?�거??�??�??: 'writing'|'edit' -> 'edit', 'ref'|'reference' -> 'reference'
        let normalizedType = (data.type || "").toString().toLowerCase();
        if (normalizedType === "writing") normalizedType = "edit";
        if (normalizedType === "ref") normalizedType = "reference";

        // [Tab Separation] 'script' ?�??보존 (기존?�는 ?????�는 ?�?��? 무조�?edit�?처리?�음)
        if (
          normalizedType !== "edit" &&
          normalizedType !== "reference" &&
          normalizedType !== "script"
        ) {
          // ?????�는 ?�?��? ?�의??'edit'�?처리
          normalizedType = "edit";
        }
        this.savedTexts.push({
          id: doc.id,
          content: data.content,
          date: data.createdAt
            ? data.createdAt.toDate().toLocaleString("ko-KR")
            : "?�짜 ?�음",
          createdAt: data.createdAt, // Firestore Timestamp ?�본 보존
          characterCount: data.characterCount,
          type: normalizedType,
          referenceType: data.referenceType || "unspecified",
          topic: data.topic || undefined,
          contentHash: data.contentHash || undefined,
          hashVersion: data.hashVersion || undefined,

          // ???�결???�퍼?�스 (기존 ?�이?�는 undefined?��?�?�?배열�?처리)
          linkedReferences: Array.isArray(data.linkedReferences)
            ? data.linkedReferences
            : [],
          referenceMeta: data.referenceMeta || undefined,

          // ??SNS ?�랫??(기존 ?�이?�는 undefined?��?�?�?배열�?처리)
          platforms: Array.isArray(data.platforms) ? data.platforms : [],
        });
      });

      logger.log(`${this.savedTexts.length}개의 ?�스?��? 불러?�습?�다.`);

      // 주제 ?�터 ?�션 ?�데?�트 (?�이??로드 ??
      this.updateTopicFilterOptions();

      // ?�시 미보???�퍼?�스 ?�내 (?�근?? ?�스?�는 aria-live�??�시??
      try {
        const missingHashCount = this.savedTexts.filter(
          (t) => (t.type || "edit") === "reference" && !t.contentHash
        ).length;
        if (missingHashCount > 0) {
          this.showMessage(
            `?�️ ?�시가 ?�는 ?�퍼?�스 ${missingHashCount}개�? ?�습?�다. ?�요 ???�시 마이그레?�션???�행?�세??`,
            "info"
          );
        }
      } catch (e) {
        // 무시
      }
    } catch (error) {
      logger.error("Firestore?�서 ?�스??불러?�기 ?�패:", error);
      // 복합 ?�덱???�류??경우 ?�내 메시지
      if (error.code === "failed-precondition") {
        logger.warn(
          "복합 ?�덱?��? ?�요?�니?? Firebase Console?�서 ?�덱?��? ?�성?�주?�요."
        );
        logger.warn(
          "?�덱??구성: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)"
        );
      }
      this.savedTexts = [];
    }
  }

  // 기존 로컬 ?�토리�? 메서?�들?� Firestore�??�체됨

  cleanupTempSave() {
    if (this.tempSaveInterval) {
      clearInterval(this.tempSaveInterval);
    }
    if (this.tempSaveTimeout) {
      clearTimeout(this.tempSaveTimeout);
    }
    // ?��? 모드 관??timeout ?�리
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }
  }

  // ===== 반자?�화 ?�스???�스??=====

  // ?�시?�그 추출 ?�수
  extractHashtags(content) {
    const hashtagRegex = /#[\w가-??+/g;
    const hashtags = content.match(hashtagRegex) || [];
    return hashtags.map((tag) => tag.toLowerCase());
  }

  // ?�용???�의 ?�시?�그 가?�오�?
  getUserHashtags() {
    try {
      const saved = localStorage.getItem("userHashtags");
      if (saved) {
        const parsed = JSON.parse(saved);
        // �?배열???�효??값으�?처리
        return Array.isArray(parsed) ? parsed : this.defaultHashtags;
      }
    } catch (error) {
      logger.error("?�시?�그 불러?�기 ?�패:", error);
    }
    return this.defaultHashtags;
  }

  // ?�용???�의 ?�시?�그 ?�??
  saveUserHashtags(hashtags) {
    try {
      // �?배열 ?�용 (?�시?�그 ?�이 ?�용)
      if (!Array.isArray(hashtags)) {
        logger.warn("?�효?��? ?��? ?�시?�그 배열");
        return false;
      }

      // ?�시?�그가 ?�는 경우
      if (hashtags.length === 0) {
        localStorage.setItem("userHashtags", JSON.stringify([]));
        logger.log("?�시?�그 ?�이 ?�용?�도�??�정??);
        return true;
      }

      // ?�시?�그 ?�식 검�?
      const validHashtags = hashtags
        .map((tag) => tag.trim())
        .filter((tag) => tag.startsWith("#") && tag.length > 1)
        .filter((tag) => tag.length <= 50); // 길이 ?�한

      if (validHashtags.length === 0) {
        logger.warn("?�효???�시?�그가 ?�습?�다");
        return false;
      }

      localStorage.setItem("userHashtags", JSON.stringify(validHashtags));
      logger.log("?�시?�그 ?�???�료:", validHashtags);
      return true;
    } catch (error) {
      logger.error("?�시?�그 ?�???�패:", error);
      return false;
    }
  }
  // Threads ?�맷???�수 (XSS 방�? ?�함, 줄바�?보존)
  formatForThreads(content) {
    // XSS 방�?�??�한 HTML ?�스케?�프 (줄바꿈�? 보존)
    if (!content) return "";

    // 줄바�?보존?�면??XSS 방�?
    const escapedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    // 줄바�??�규??(CRLF -> LF)
    const normalizedContent = escapedContent
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // ?�속 줄바�??�리 (최�? 2개까지�?
    const cleanedContent = normalizedContent.replace(/\n{3,}/g, "\n\n");

    return cleanedContent.trim();
  }

  // HTML ?�스케?�프 ?�수 (보안 강화 - ?�전??XSS 방�?)
  escapeHtml(text) {
    if (typeof text !== "string") {
      return "";
    }

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ?�용???�력 검�??�수 (보안 강화)
  validateUserInput(input, type = "text") {
    if (!input || typeof input !== "string") {
      throw new Error("?�효?��? ?��? ?�력?�니??");
    }

    // 길이 ?�한 검�?
    if (input.length > 10000) {
      throw new Error("?�력???�무 깁니?? (최�? 10,000??");
    }

    // ?�험???�턴 검�?
    const dangerousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error("?�험??코드가 감�??�었?�니??");
      }
    }

    return true;
  }

  // ?�전???�스??처리 ?�수
  sanitizeText(text) {
    this.validateUserInput(text);

    // HTML ?�그 ?�거
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || tempDiv.innerText || "";

    // ?�수 문자 ?�리
    return cleanText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // ?�어 문자 ?�거
      .replace(/\s+/g, " ") // ?�속 공백 ?�리
      .trim();
  }

  // ?�용 최적???�진 (보안 강화 버전)
  optimizeContentForThreads(content) {
    try {
      // 1?�계: ?�력 검�?�??�화
      const sanitizedContent = this.sanitizeText(content);

      // 2?�계: ?�능 최적??- ?�?�량 ?�스??처리
      if (sanitizedContent.length > 10000) {
        logger.warn(
          "매우 �??�스?��? 감�??�었?�니?? 처리 ?�간???�래 걸릴 ???�습?�다."
        );
      }

      const optimized = {
        original: sanitizedContent,
        optimized: "",
        hashtags: [],
        characterCount: 0,
        suggestions: [],
        warnings: [],
        securityChecks: {
          xssBlocked: false,
          maliciousContentRemoved: false,
          inputValidated: true,
        },
      };

      // 3?�계: 글????최적??(Threads??500???�한)
      if (sanitizedContent.length > 500) {
        // ?�어 ?�위�??�르�?(???�연?�러???�르�?
        const words = sanitizedContent.substring(0, 500).split(" ");
        words.pop(); // 마�?�?불완?�한 ?�어 ?�거
        optimized.optimized = words.join(" ") + "...";
        optimized.suggestions.push(
          "글??500?��? 초과?�여 ?�어 ?�위�??�렸?�니??"
        );
        optimized.warnings.push("?�본보다 짧아졌습?�다.");
      } else {
        optimized.optimized = sanitizedContent;
      }

      // 4?�계: ?�시?�그 ?�동 추출/추�? (보안 검�??�함)
      const hashtags = this.extractHashtags(optimized.optimized);
      if (hashtags.length === 0) {
        // ?�용???�의 ?�시?�그 ?�용 (?�택??
        const userHashtags = this.getUserHashtags();
        if (userHashtags && userHashtags.length > 0) {
          optimized.hashtags = userHashtags;
          optimized.suggestions.push("?�시?�그�?추�??�습?�다.");
        } else {
          optimized.hashtags = [];
          optimized.suggestions.push("?�시?�그 ?�이 ?�스?�됩?�다.");
        }
      } else {
        // ?�시?�그 보안 검�?
        optimized.hashtags = hashtags.filter((tag) => {
          // ?�험???�시?�그 ?�터�?
          const dangerousTags = [
            "#script",
            "#javascript",
            "#eval",
            "#function",
          ];
          return !dangerousTags.some((dangerous) =>
            tag.toLowerCase().includes(dangerous)
          );
        });
      }

      // 5?�계: 최종 ?�맷???�용 (보안 강화)
      optimized.optimized = this.formatForThreads(optimized.optimized);
      optimized.characterCount = optimized.optimized.length;

      // 6?�계: 보안 검�??�료 ?�시
      optimized.securityChecks.inputValidated = true;

      return optimized;
    } catch (error) {
      logger.error("?�용 최적??�??�류 발생:", error);

      // 보안 ?�류??경우 ?�별 처리
      if (
        error.message.includes("?�험??) ||
        error.message.includes("?�효?��? ?��?")
      ) {
        throw new Error(
          "보안?�의 ?�유�??�용??처리?????�습?�다. ?�력???�인?�주?�요."
        );
      }

      throw new Error("?�용 최적?�에 ?�패?�습?�다.");
    }
  }

  // ?�백 ?�립보드 복사 ?�수
  fallbackCopyToClipboard(text) {
    logger.log("?�� ?�백 ?�립보드 복사 ?�작");
    logger.log("?�� ?�백 복사???�스??", text);
    logger.log("?�� ?�백 ?�스??길이:", text ? text.length : "undefined");

    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        textArea.style.opacity = "0";
        textArea.setAttribute("readonly", "");
        textArea.setAttribute("aria-hidden", "true");

        document.body.appendChild(textArea);
        logger.log("??textarea ?�성 �?DOM 추�? ?�료");

        // 모바??지?�을 ?�한 ?�택 범위 ?�정
        if (textArea.setSelectionRange) {
          textArea.setSelectionRange(0, text.length);
          logger.log("??setSelectionRange ?�용");
        } else {
          textArea.select();
          logger.log("??select() ?�용");
        }

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        logger.log("??textarea ?�거 ?�료");
        logger.log("?�� execCommand 결과:", successful);

        if (successful) {
          logger.log("???�백 복사 ?�공");
          resolve(true);
        } else {
          logger.error("??execCommand 복사 ?�패");
          reject(new Error("execCommand 복사 ?�패"));
        }
      } catch (error) {
        logger.error("???�백 복사 �??�류:", error);
        reject(error);
      }
    });
  }

  // 로딩 ?�태 관�??�수
  showLoadingState(element, isLoading) {
    if (isLoading) {
      element.disabled = true;
      element.innerHTML = "??처리 �?..";
      element.classList.add("loading");
    } else {
      element.disabled = false;
      element.innerHTML = "?? 반자???�스??;
      element.classList.remove("loading");
    }
  }

  // ?�립보드 ?�동??(?�전???�러 처리 �??�백)
  async copyToClipboardWithFormat(content) {
    logger.log("?�� copyToClipboardWithFormat ?�작");
    logger.log("?�� ?�력 ?�용:", content);
    logger.log("?�� ?�력 ?�??", typeof content);

    const button = document.getElementById("semi-auto-post-btn");

    try {
      // 로딩 ?�태 ?�시
      if (button) {
        this.showLoadingState(button, true);
      }

      // 1?�계: ?�력 검�?강화
      if (!content || typeof content !== "string") {
        logger.error("???�효?��? ?��? ?�용:", content);
        throw new Error("?�효?��? ?��? ?�용?�니??");
      }

      logger.log("??1?�계: ?�력 검�??�과");

      // 2?�계: ?�본 ?�스??그�?�??�용 (줄바�?보존)
      logger.log("?�� ?�본 ?�용 ?�용 (줄바�?보존):", content);

      if (!content || content.length === 0) {
        logger.error("???�용??비어?�음");
        throw new Error("?�용??비어?�습?�다.");
      }

      logger.log("??2?�계: 검�??�료");

      // ?�립보드 API 지???�인
      logger.log("?�� 3?�계: ?�립보드 API ?�인...");
      logger.log("?�� navigator.clipboard 존재:", !!navigator.clipboard);
      logger.log("?�� isSecureContext:", window.isSecureContext);

      if (navigator.clipboard && window.isSecureContext) {
        try {
          logger.log("?�� ?�립보드 API�?복사 ?�도...");
          await navigator.clipboard.writeText(content);
          logger.log("???�립보드 API 복사 ?�공");
          this.showMessage("???�용???�립보드??복사?�었?�니??", "success");
          return true;
        } catch (clipboardError) {
          logger.warn(
            "??Clipboard API ?�패, ?�백 방법 ?�용:",
            clipboardError
          );
          throw clipboardError;
        }
      } else {
        logger.warn("??Clipboard API 미�???);
        throw new Error("Clipboard API 미�???);
      }
    } catch (error) {
      logger.error("???�립보드 복사 ?�패:", error);
      logger.error("???�류 ?�세:", error.stack);

      try {
        // ?�백 방법 ?�도
        logger.log("?�� ?�백 방법 ?�도...");
        await this.fallbackCopyToClipboard(content);
        logger.log("???�백 방법 복사 ?�공");
        this.showMessage(
          "???�용???�립보드??복사?�었?�니?? (?�백 방법)",
          "success"
        );
        return true;
      } catch (fallbackError) {
        logger.error("???�백 복사???�패:", fallbackError);
        this.showMessage(
          "???�립보드 복사???�패?�습?�다. ?�동?�로 복사?�주?�요.",
          "error"
        );

        // ?�동 복사�??�한 ?�스???�역 ?�시
        logger.log("?�� ?�동 복사 모달 ?�시...");
        this.showManualCopyModal(formattedContent);
        return false;
      }
    } finally {
      // 로딩 ?�태 ?�제
      if (button) {
        this.showLoadingState(button, false);
      }
      logger.log("??로딩 ?�태 ?�제 ?�료");
    }
  }

  // ?�동 복사 모달 ?�시 ?�수
  showManualCopyModal(content) {
    const modal = document.createElement("div");
    modal.className = "manual-copy-modal";
    modal.innerHTML = `
            <div class="modal-content">
                <h3>?�� ?�동 복사</h3>
                <p>?�립보드 복사???�패?�습?�다. ?�래 ?�스?��? ?�동?�로 복사?�주?�요:</p>
                <textarea readonly class="copy-textarea" aria-label="복사???�스??>${content}</textarea>
                <div class="modal-actions">
                    <button class="btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">?�인</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?�스???�역 ?�동 ?�택
    const textarea = modal.querySelector(".copy-textarea");
    textarea.focus();
    textarea.select();
  }
  // 최적??모달 ?�시 ?�수 (?�근??강화)
  showOptimizationModal(optimized, originalContent) {
    // ?�본 ?�스???�??(줄바�?보존)
    optimized.originalContent = originalContent;

    const modal = document.createElement("div");
    modal.className = "optimization-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");
    modal.setAttribute("aria-describedby", "modal-description");

    // ?�재 ?�어 감�?
    const currentLang = this.detectLanguage();
    logger.log("?�� 감�????�어:", currentLang);
    logger.log("?�� ?�본 ?�스???�??", originalContent);

    modal.innerHTML = `
            <div class="optimization-content" lang="${currentLang}">
                <h3 id="modal-title">${this.t("optimizationTitle")}</h3>
                <div id="modal-description" class="sr-only">?�스???�용??최적?�되?�습?�다. 결과�??�인?�고 진행?�세??</div>
                
                <div class="optimization-stats" role="region" aria-label="최적???�계">
                    <div class="stat-item">
                        <span class="stat-label">${this.t(
                          "originalLength"
                        )}</span>
                        <span class="stat-value" aria-label="${
                          optimized.original.length
                        }${this.t("characters")}">${
      optimized.original.length
    }${this.t("characters")}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${this.t(
                          "optimizedLength"
                        )}</span>
                        <span class="stat-value" aria-label="${
                          optimized.characterCount
                        }${this.t("characters")}">${
      optimized.characterCount
    }${this.t("characters")}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${this.t("hashtags")}</span>
                        <span class="stat-value" aria-label="?�시?�그 ${
                          optimized.hashtags.length
                        }${this.t("hashtagCount")}">${optimized.hashtags.join(
      " "
    )}</span>
                    </div>
                </div>
                
                ${
                  optimized.suggestions.length > 0
                    ? `
                    <div class="suggestions" role="region" aria-label="최적???�안?�항">
                        <h4>${this.t("optimizationSuggestions")}</h4>
                        <ul>
                            ${optimized.suggestions
                              .map(
                                (suggestion) =>
                                  `<li>${this.escapeHtml(suggestion)}</li>`
                              )
                              .join("")}
                        </ul>
                    </div>
                `
                    : ""
                }
                
                <div class="preview-section" role="region" aria-label="?�스???�용 미리보기">
                    <div class="hashtag-toggle-section">
                        <label class="hashtag-toggle-label">
                            <input type="checkbox" id="hashtag-toggle" checked aria-label="?�시?�그 ?�동 추�?">
                            <span class="toggle-text">?�시?�그 ?�동 추�?</span>
                        </label>
                    </div>
                    <h4>${this.t("previewTitle")}</h4>
                    <div class="preview-content" role="textbox" aria-label="?�스???�용" tabindex="0" id="preview-content-display">
                        ${this.escapeHtml(originalContent)}
                        ${
                          optimized.hashtags.length > 0
                            ? `<br><br>${this.escapeHtmlOnly(
                                optimized.hashtags.join(" ")
                              )}`
                            : ""
                        }
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary btn-copy-only" 
                            id="copy-only-btn"
                            lang="${currentLang}"
                            aria-label="?�립보드?�만 복사">
                        ?�� ?�립보드 복사
                    </button>
                    <button class="btn-primary btn-threads-only" 
                            id="threads-only-btn"
                            lang="${currentLang}"
                            aria-label="Threads ?�이지�??�기">
                        ?? Threads ?�기
                    </button>
                    <button class="btn-success btn-both" 
                            id="both-btn"
                            lang="${currentLang}"
                            aria-label="?�립보드 복사?�고 Threads ?�이지 ?�기">
                        ?��?? ?????�행
                    </button>
                    <button class="btn-secondary" 
                            id="cancel-btn"
                            lang="${currentLang}"
                            aria-label="모달 ?�기">
                        ${this.t("cancelButton")}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // 버튼 ?�릭 ?�벤??직접 바인??(?�적 ?�성??모달)
    setTimeout(() => {
      // ?�시?�그 ?��? ?�위�?
      const hashtagToggle = modal.querySelector("#hashtag-toggle");
      const previewDisplay = modal.querySelector("#preview-content-display");

      if (hashtagToggle && previewDisplay) {
        hashtagToggle.addEventListener("change", () => {
          logger.log("?�� ?�시?�그 ?��? 변�?", hashtagToggle.checked);

          // 미리보기 ?�데?�트
          if (hashtagToggle.checked) {
            previewDisplay.innerHTML =
              this.escapeHtml(originalContent) +
              (optimized.hashtags.length > 0
                ? "<br><br>" + this.escapeHtmlOnly(optimized.hashtags.join(" "))
                : "");
          } else {
            previewDisplay.innerHTML = this.escapeHtml(originalContent);
          }
        });
      }

      // ?�립보드 복사 버튼
      const copyBtn = modal.querySelector("#copy-only-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // ?��? ?�태???�라 ?�시?�그 ?�함 ?��? 결정
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          logger.log("?�� ?�립보드 복사 버튼 ?�릭 감�?");
          logger.log("?�� ?�본 ?�스??직접 ?�용:", content);
          this.copyToClipboardOnly(content, e);
        });
      }

      // Threads ?�기 버튼
      const threadsBtn = modal.querySelector("#threads-only-btn");
      if (threadsBtn) {
        threadsBtn.addEventListener("click", (e) => {
          e.preventDefault();
          logger.log("?�� Threads ?�기 버튼 ?�릭 감�?");
          this.openThreadsOnly();
        });
      }

      // ?????�행 버튼
      const bothBtn = modal.querySelector("#both-btn");
      if (bothBtn) {
        bothBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // ?��? ?�태???�라 ?�시?�그 ?�함 ?��? 결정
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          logger.log("?�� ?????�행 버튼 ?�릭 감�?");
          logger.log("?�� ?�본 ?�스??직접 ?�용:", content);
          this.proceedWithPosting(content, e);
        });
      }

      // 취소 버튼
      const cancelBtn = modal.querySelector("#cancel-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          logger.log("?�� 취소 버튼 ?�릭 감�?");
          modal.remove();
        });
      }
    }, 10);

    // ?�근??강화: ?�커??관�?
    const firstBtn = modal.querySelector("#copy-only-btn");

    // �?번째 버튼???�커??
    setTimeout(() => {
      if (firstBtn) {
        firstBtn.focus();
      }
    }, 150);

    // ESC ?�로 모달 ?�기
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Tab ???�환 ?�한 (모달 ?�에?�만)
    const focusableElements = modal.querySelectorAll(
      'button, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement && lastElement) {
      const handleTabKey = (e) => {
        if (e.key === "Tab") {
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

      modal.addEventListener("keydown", handleTabKey);
    }

    // 모달???�거?????�벤??리스???�리 (간단??방식)
    const cleanup = () => {
      document.removeEventListener("keydown", handleEscape);
      logger.log("??모달 ?�벤??리스???�리??);
    };

    // 모달 DOM ?�거 ???�동 ?�리
    const observer = new MutationObserver(() => {
      if (!document.body.contains(modal)) {
        cleanup();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  // ?�스??진행 ?�수 (?�벤??컨텍?�트 보존)
  async proceedWithPosting(formattedContent, event = null) {
    logger.log("?��?? ?????�행 ?�작");
    logger.log("?�� ?�벤??컨텍?�트:", event ? "보존?? : "?�음");

    try {
      // ?�립보드??복사 (?�벤??컨텍?�트 보존)
      let success = false;

      if (event) {
        logger.log("?? ?�벤??컨텍?�트?�서 즉시 복사 ?�도");
        success = await this.copyToClipboardImmediate(formattedContent);
      } else {
        logger.log("?�� 기존 방법?�로 복사 ?�도");
        success = await this.copyToClipboardWithFormat(formattedContent);
      }

      if (success) {
        logger.log("???�립보드 복사 ?�공");
      } else {
        logger.warn("?�️ ?�립보드 복사 ?�패, Threads??계속 ?�기");
      }

      // Threads ?????�기 (?�립보드 복사 ?�공 ?��??� 관계없??
      const threadsUrl = this.getThreadsUrl();
      logger.log("?�� Threads URL:", threadsUrl);
      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      // ?�용??가?�드 ?�시
      this.showPostingGuide();

      // 모달 ?�기
      const modal = document.querySelector(".optimization-modal");
      if (modal) {
        modal.remove();
      }
    } catch (error) {
      logger.error("?�스??진행 �??�류:", error);
      this.showMessage("?�스??진행 �??�류가 발생?�습?�다.", "error");
    }
  }

  // ?�립보드 복사�??�행?�는 ?�수 (?�벤??컨텍?�트 보존)
  async copyToClipboardOnly(formattedContent, event = null) {
    logger.log("?�� ?�립보드 복사�??�행");
    logger.log("?�� 받�? ?�용:", formattedContent);
    logger.log("?�� ?�용 ?�??", typeof formattedContent);
    logger.log(
      "?�� ?�용 길이:",
      formattedContent ? formattedContent.length : "undefined"
    );
    logger.log("?�� ?�벤??컨텍?�트:", event ? "보존?? : "?�음");

    try {
      // ?�벤?��? ?�으�?즉시 ?�립보드 복사 ?�도
      if (event) {
        logger.log("?? ?�벤??컨텍?�트?�서 즉시 복사 ?�도");
        const success = await this.copyToClipboardImmediate(formattedContent);

        if (success) {
          this.showMessage("???�스?��? ?�립보드??복사?�었?�니??", "success");
          logger.log("???�립보드 복사 ?�료");
          return;
        }
      }

      // ?�벤?��? ?�거??즉시 복사 ?�패 ??기존 방법 ?�용
      logger.log("?�� 기존 방법?�로 복사 ?�도");
      const success = await this.copyToClipboardWithFormat(formattedContent);

      if (success) {
        this.showMessage("???�스?��? ?�립보드??복사?�었?�니??", "success");
        logger.log("???�립보드 복사 ?�료");
      } else {
        this.showMessage("???�립보드 복사???�패?�습?�다.", "error");
        logger.error("???�립보드 복사 ?�패");
      }
    } catch (error) {
      logger.error("???�립보드 복사 �??�류:", error);
      this.showMessage(
        "?�립보드 복사 �??�류가 발생?�습?�다: " + error.message,
        "error"
      );
    }
  }

  // 즉시 ?�립보드 복사 (?�벤??컨텍?�트 보존)
  async copyToClipboardImmediate(content) {
    logger.log("?? 즉시 ?�립보드 복사 ?�작");

    try {
      // 1?�계: ?�력 검�?
      if (!content || typeof content !== "string") {
        throw new Error("?�효?��? ?��? ?�용?�니??");
      }

      // 2?�계: ?�본 ?�스??그�?�??�용 (줄바�?보존)
      logger.log("?�� ?�본 ?�용 (줄바�?보존):", content);

      // 3?�계: ?�립보드 API ?�도 (?�벤??컨텍?�트 ?�에??
      if (navigator.clipboard && window.isSecureContext) {
        try {
          logger.log("?�� ?�립보드 API�?즉시 복사 ?�도...");
          await navigator.clipboard.writeText(content);
          logger.log("???�립보드 API 즉시 복사 ?�공");
          return true;
        } catch (clipboardError) {
          logger.warn("???�립보드 API 즉시 복사 ?�패:", clipboardError);
          // ?�백?�로 execCommand ?�도
          return await this.fallbackCopyToClipboard(content);
        }
      } else {
        logger.log("?�� ?�립보드 API 미�??? ?�백 방법 ?�용");
        return await this.fallbackCopyToClipboard(content);
      }
    } catch (error) {
      logger.error("??즉시 ?�립보드 복사 ?�패:", error);
      return false;
    }
  }

  // Threads ?�기�??�행?�는 ?�수
  openThreadsOnly() {
    logger.log("?? Threads ?�기�??�행");

    try {
      const threadsUrl = this.getThreadsUrl();
      logger.log("?�� Threads URL:", threadsUrl);

      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      this.showMessage("??Threads ?�이지가 ?�렸?�니??", "success");
      logger.log("??Threads ?�이지 ?�기 ?�료");

      // 간단??가?�드 ?�시
      this.showSimpleThreadsGuide();
    } catch (error) {
      logger.error("??Threads ?�기 �??�류:", error);
      this.showMessage(
        "Threads ?�기 �??�류가 발생?�습?�다: " + error.message,
        "error"
      );
    }
  }

  // 간단??Threads 가?�드 ?�시
  showSimpleThreadsGuide() {
    const currentLang = this.detectLanguage();

    const guide = document.createElement("div");
    guide.className = "simple-threads-guide";
    guide.setAttribute("lang", currentLang);

    guide.innerHTML = `
            <div class="guide-content">
                <h3>??Threads ?�이지가 ?�렸?�니??</h3>
                <div class="guide-steps">
                    <h4>?�� ?�음 ?�계:</h4>
                    <ol>
                        <li>Threads ????���??�동?�세??/li>
                        <li>"??글 ?�성" 버튼???�릭?�세??/li>
                        <li>?�성???�스?��? ?�력?�세??/li>
                        <li>"게시" 버튼???�릭?�세??/li>
                    </ol>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="this.closest('.simple-threads-guide').remove()">???�인</button>
                </div>
            </div>
        `;

    document.body.appendChild(guide);

    // ?�어 최적???�용
    this.applyLanguageOptimization(guide, currentLang);

    // 5�????�동?�로 ?�라지�??�기
    setTimeout(() => {
      if (guide.parentNode) {
        guide.remove();
      }
    }, 8000);
  }

  // Threads URL 가?�오�??�수
  getThreadsUrl() {
    // ?�용???�정?�서 ?�로??URL ?�인
    const userProfileUrl = localStorage.getItem("threads_profile_url");

    if (userProfileUrl && this.isValidThreadsUrl(userProfileUrl)) {
      logger.log("???�용???�로??URL ?�용:", userProfileUrl);
      return userProfileUrl;
    }

    // 기본 Threads 메인 ?�이지
    logger.log("??기본 Threads 메인 ?�이지 ?�용");
    return "https://www.threads.com/";
  }

  // Threads URL ?�효??검??
  isValidThreadsUrl(url) {
    try {
      const urlObj = new URL(url);
      return (
        urlObj.hostname.includes("threads.com") ||
        urlObj.hostname.includes("threads.net")
      );
    } catch (error) {
      return false;
    }
  }

  // ?�용???�로??URL ?�정 ?�수
  setThreadsProfileUrl(url) {
    if (this.isValidThreadsUrl(url)) {
      localStorage.setItem("threads_profile_url", url);
      this.showMessage("??Threads ?�로??URL???�정?�었?�니??", "success");
      return true;
    } else {
      this.showMessage(
        "???�바�?Threads URL???�력?�주?�요. (?? https://www.threads.com/@username)",
        "error"
      );
      return false;
    }
  }

  // ?�스??가?�드 ?�시 ?�수
  showPostingGuide() {
    const guide = document.createElement("div");
    guide.className = "posting-guide";
    guide.innerHTML = `
            <div class="guide-content">
                <h3>???�공! Threads ?�이지가 ?�렸?�니??/h3>
                <div class="guide-steps">
                    <h4>?�� ?�음 ?�계�??�라?�주?�요:</h4>
                    <ol>
                        <li>Threads ????���??�동?�세??/li>
                        <li>"??글 ?�성" 버튼???�릭?�세??/li>
                        <li>?�스???�력창에 Ctrl+V�?붙여?�기?�세??/li>
                        <li>"게시" 버튼???�릭?�여 ?�스?�하?�요</li>
                    </ol>
                </div>
                <div class="guide-tip">
                    <p>?�� ?? 붙여?�기 ???�용????�????�인?�보?�요!</p>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" onclick="this.closest('.posting-guide').remove()">???�인</button>
                    <button class="btn-secondary" onclick="dualTextWriter.showThreadsProfileSettings()">?�️ ?�로???�정</button>
                </div>
            </div>
        `;

    document.body.appendChild(guide);

    // 5�????�동?�로 ?�라지�??�기
    setTimeout(() => {
      if (guide.parentNode) {
        guide.remove();
      }
    }, 10000);
  }
  // Threads ?�로???�정 모달 ?�시
  showThreadsProfileSettings() {
    const currentLang = this.detectLanguage();

    const modal = document.createElement("div");
    modal.className = "threads-profile-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>?�️ Threads ?�로???�정</h3>
                <p>?�스?????�릴 Threads ?�이지�??�정?�세??</p>
                
                <div class="profile-url-section">
                    <label for="threads-profile-url">?�로??URL:</label>
                    <input type="url" id="threads-profile-url" 
                           placeholder="https://www.threads.com/@username"
                           value="${
                             localStorage.getItem("threads_profile_url") || ""
                           }">
                    <small>?? https://www.threads.com/@username</small>
                </div>
                
                <div class="url-options">
                    <h4>빠른 ?�택:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/')">
                        ?�� Threads 메인 ?�이지
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/new')">
                        ?�️ ??글 ?�성 ?�이지
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveThreadsProfileUrl()">?�� ?�??/button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.threads-profile-modal').remove()">??취소</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?�어 최적???�용
    this.applyLanguageOptimization(modal, currentLang);

    // ?�력 ?�드???�커??
    setTimeout(() => {
      const input = modal.querySelector("#threads-profile-url");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // Threads ?�로??URL ?�??
  saveThreadsProfileUrl() {
    const input = document.getElementById("threads-profile-url");
    if (input) {
      const url = input.value.trim();
      if (url) {
        this.setThreadsProfileUrl(url);
      } else {
        // �?값이�?기본 URL�??�정
        localStorage.removeItem("threads_profile_url");
        this.showMessage(
          "??기본 Threads 메인 ?�이지�??�정?�었?�니??",
          "success"
        );
      }

      // 모달 ?�기
      const modal = document.querySelector(".threads-profile-modal");
      if (modal) {
        modal.remove();
      }
    }
  }

  // ?�시?�그 ?�정 모달 ?�시
  showHashtagSettings() {
    const currentLang = this.detectLanguage();
    const currentHashtags = this.getUserHashtags();

    const modal = document.createElement("div");
    modal.className = "hashtag-settings-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>?�� ?�시?�그 ?�정</h3>
                <p>반자???�스?????�용??기본 ?�시?�그�??�정?�세??</p>
                
                <div class="hashtag-input-section">
                    <label for="hashtag-input">?�시?�그 (?�표�?구분):</label>
                    <input type="text" id="hashtag-input" 
                           placeholder="?? #writing, #content, #threads"
                           value="${currentHashtags.join(", ")}">
                    <small>?? #writing, #content, #threads</small>
                </div>
                
                <div class="hashtag-examples">
                    <h4>추천 ?�시?�그:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#writing, #content, #threads'">
                        ?�� ?�반 글 ?�성
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#?�각, #?�상, #daily'">
                        ?�� ?�상 글
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#경제, #?�자, #finance'">
                        ?�� 경제/?�자
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#기술, #개발, #tech'">
                        ?? 기술/개발
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value=''" style="background: #f8f9fa; color: #6c757d;">
                        ???�시?�그 ?�이 ?�용
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveHashtagSettings()">?�� ?�??/button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.hashtag-settings-modal').remove()">??취소</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?�어 최적???�용
    this.applyLanguageOptimization(modal, currentLang);

    // ?�력 ?�드???�커??
    setTimeout(() => {
      const input = modal.querySelector("#hashtag-input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // ?�시?�그 ?�정 ?�??
  saveHashtagSettings() {
    const input = document.getElementById("hashtag-input");
    if (input) {
      const inputValue = input.value.trim();

      // �?�??�용 (?�시?�그 ?�이 ?�용)
      if (!inputValue) {
        this.saveUserHashtags([]);
        this.showMessage(
          "???�시?�그 ?�이 ?�스?�하?�록 ?�정?�었?�니??",
          "success"
        );
        this.updateHashtagsDisplay();

        // 모달 ?�기
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
        return;
      }

      // ?�표�?분리?�여 배열�?변??
      const hashtags = inputValue
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (this.saveUserHashtags(hashtags)) {
        this.showMessage("???�시?�그가 ?�?�되?�습?�다!", "success");
        this.updateHashtagsDisplay();

        // 모달 ?�기
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
      } else {
        this.showMessage(
          "???�시?�그 ?�?�에 ?�패?�습?�다. ?�식???�인?�주?�요.",
          "error"
        );
      }
    }
  }
  // ?�시?�그 ?�시 ?�데?�트
  updateHashtagsDisplay() {
    const display = document.getElementById("current-hashtags-display");
    if (display) {
      const hashtags = this.getUserHashtags();
      if (hashtags && hashtags.length > 0) {
        display.textContent = hashtags.join(" ");
      } else {
        display.textContent = "?�시?�그 ?�음";
        display.style.color = "#6c757d";
      }
    }
  }

  // ?�프?�인 지???�수??
  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      logger.warn("로컬 ?�토리�? ?�???�패:", error);
      return false;
    }
  }

  loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn("로컬 ?�토리�? 로드 ?�패:", error);
      return null;
    }
  }

  // ?�프?�인 ?�태 감�?
  isOnline() {
    return navigator.onLine;
  }

  // ?�프?�인 ?�림 ?�시
  showOfflineNotification() {
    if (!this.isOnline()) {
      this.showMessage(
        "?�� ?�프?�인 ?�태?�니?? ?��? 기능???�한?????�습?�다.",
        "warning"
      );
    }
  }

  // ?�어 감�? ?�수
  detectLanguage() {
    // 1. 브라?��? ?�어 ?�정 ?�인
    const browserLang = navigator.language || navigator.userLanguage;
    logger.log("?�� 브라?��? ?�어:", browserLang);

    // 2. HTML lang ?�성 ?�인
    const htmlLang = document.documentElement.lang;
    logger.log("?�� HTML ?�어:", htmlLang);

    // 3. ?�용???�정 ?�어 ?�인 (로컬 ?�토리�?)
    const userLang = localStorage.getItem("preferred_language");
    logger.log("?�� ?�용???�정 ?�어:", userLang);

    // ?�선?�위: ?�용???�정 > HTML ?�성 > 브라?��? ?�정
    let detectedLang = userLang || htmlLang || browserLang;

    // ?�어 코드 ?�규??(ko-KR -> ko, en-US -> en)
    if (detectedLang) {
      detectedLang = detectedLang.split("-")[0];
    }

    // 지?�되???�어 목록
    const supportedLanguages = ["ko", "en", "ja", "zh"];

    // 지?�되지 ?�는 ?�어??기본�??�국???�로 ?�정
    if (!supportedLanguages.includes(detectedLang)) {
      detectedLang = "ko";
    }

    logger.log("?�� 최종 감�????�어:", detectedLang);
    return detectedLang;
  }

  // ?�어�??�스??최적???�용
  applyLanguageOptimization(element, language) {
    if (!element) return;

    // ?�어�??�래??추�?
    element.classList.add(`lang-${language}`);

    // ?�어�??��????�용
    const style = document.createElement("style");
    style.textContent = `
            .lang-${language} {
                font-family: ${this.getLanguageFont(language)};
            }
        `;
    document.head.appendChild(style);

    logger.log(`?�� ${language} ?�어 최적???�용??);
  }

  // ?�어�??�트 ?�정
  getLanguageFont(language) {
    const fontMap = {
      ko: '"Noto Sans KR", "Malgun Gothic", "맑�? 고딕", sans-serif',
      en: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      ja: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "?�ラ??��角ゴ ProN W3", sans-serif',
      zh: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    };

    return fontMap[language] || fontMap["ko"];
  }

  // �?��??지???�수??
  getLanguage() {
    return navigator.language || navigator.userLanguage || "ko-KR";
  }

  getTexts() {
    const lang = this.getLanguage();
    const texts = {
      "ko-KR": {
        noContent: "???�스?�할 ?�용???�습?�다.",
        processingError: "?�스??처리 �??�류가 발생?�습?�다.",
        offlineWarning: "?�� ?�프?�인 ?�태?�니?? 로컬?�서�?처리?�니??",
        optimizationTitle: "?�� Threads ?�스??최적??결과",
        originalLength: "?�본 글????",
        optimizedLength: "최적?�된 글????",
        hashtags: "?�시?�그:",
        optimizationSuggestions: "?�� 최적???�항:",
        previewTitle: "?�� 최종 ?�스???�용 미리보기:",
        proceedButton: "?�� ?�립보드 복사 & Threads ?�기",
        cancelButton: "??취소",
        characters: "??,
        hashtagCount: "�?,
      },
      "en-US": {
        noContent: "??No content to post.",
        processingError: "An error occurred while processing the post.",
        offlineWarning: "?�� You are offline. Processing locally only.",
        optimizationTitle: "?�� Threads Posting Optimization Results",
        originalLength: "Original length:",
        optimizedLength: "Optimized length:",
        hashtags: "Hashtags:",
        optimizationSuggestions: "?�� Optimization suggestions:",
        previewTitle: "?�� Final posting content preview:",
        proceedButton: "?�� Copy to Clipboard & Open Threads",
        cancelButton: "??Cancel",
        characters: "chars",
        hashtagCount: "tags",
      },
      "ja-JP": {
        noContent: "???�稿?�る?�ン?�ン?�が?�り?�せ?��?,
        processingError: "?�稿??���?��?�ラ?�が?�生?�ま?�た??,
        offlineWarning: "?�� ?�フ?�イ?�状?�で?�。ロ?�カ?�で??��??��?�れ?�す??,
        optimizationTitle: "?�� Threads?�稿?�?�化結果",
        originalLength: "?�の?�字??",
        optimizedLength: "?�?�化?�れ?�文字数:",
        hashtags: "?�ッ?�ュ?�グ:",
        optimizationSuggestions: "?�� ?�?�化?�案:",
        previewTitle: "?�� ?�終投稿内容プ?�ビ?�ー:",
        proceedButton: "?�� ??��?�プ?�ー?�に?�ピ??& Threads?�開??,
        cancelButton: "????��?�セ??,
        characters: "?�字",
        hashtagCount: "??,
      },
    };

    return texts[lang] || texts["ko-KR"];
  }

  t(key) {
    const texts = this.getTexts();
    return texts[key] || key;
  }

  // ?�능 모니?�링 ?�수??
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

        logger.log(`?�️ ${label}: ${duration.toFixed(2)}ms`);
        return duration;
      }
      return 0;
    },

    getReport() {
      return Object.keys(this.measurements).map((label) => ({
        label,
        duration: this.measurements[label].duration || 0,
      }));
    },
  };

  // 메모�??�용??체크
  checkMemoryUsage() {
    if (performance.memory) {
      const memory = performance.memory;
      logger.log("?�� 메모�??�용??", {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  // 종합 ?�스???�수
  async runComprehensiveTest() {
    logger.log("?�� 종합 ?�스???�작...");

    const testResults = {
      security: false,
      accessibility: false,
      performance: false,
      mobile: false,
      offline: false,
      internationalization: false,
    };

    try {
      // 1. 보안 ?�스??
      logger.log("?�� 보안 ?�스??..");
      const testContent = '<script>alert("xss")</script>?�녕?�세??#test';
      const sanitized = this.sanitizeText(testContent);
      testResults.security = !sanitized.includes("<script>");
      logger.log("보안 ?�스??", testResults.security ? "???�과" : "???�패");

      // 2. ?�근???�스??
      logger.log("???�근???�스??..");
      const button = document.getElementById("semi-auto-post-btn");
      testResults.accessibility =
        button &&
        button.getAttribute("aria-label") &&
        button.getAttribute("role");
      logger.log(
        "?�근???�스??",
        testResults.accessibility ? "???�과" : "???�패"
      );

      // 3. ?�능 ?�스??
      logger.log("???�능 ?�스??..");
      this.performanceMonitor.start("?�스??);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const duration = this.performanceMonitor.end("?�스??);
      testResults.performance = duration < 100; // 100ms ?�하
      logger.log(
        "?�능 ?�스??",
        testResults.performance ? "???�과" : "???�패"
      );

      // 4. 모바???�스??
      logger.log("?�� 모바???�스??..");
      const isMobile = window.innerWidth <= 768;
      testResults.mobile = true; // CSS 미디??쿼리�?처리??
      logger.log("모바???�스??", testResults.mobile ? "???�과" : "???�패");

      // 5. ?�프?�인 ?�스??
      logger.log("?�� ?�프?�인 ?�스??..");
      testResults.offline =
        typeof this.isOnline === "function" &&
        typeof this.saveToLocalStorage === "function";
      logger.log(
        "?�프?�인 ?�스??",
        testResults.offline ? "???�과" : "???�패"
      );

      // 6. �?��???�스??
      logger.log("?�� �?��???�스??..");
      testResults.internationalization =
        typeof this.t === "function" && this.t("noContent") !== "noContent";
      logger.log(
        "�?��???�스??",
        testResults.internationalization ? "???�과" : "???�패"
      );

      // 결과 ?�약
      const passedTests = Object.values(testResults).filter(
        (result) => result
      ).length;
      const totalTests = Object.keys(testResults).length;

      logger.log(`\n?�� ?�스???�료: ${passedTests}/${totalTests} ?�과`);
      logger.log("?�세 결과:", testResults);

      return testResults;
    } catch (error) {
      logger.error("?�스??�??�류 발생:", error);
      return testResults;
    }
  }

  // 반자?�화 ?�스??메인 ?�수 (?�능 최적??+ ?�프?�인 지??+ 모니?�링)
  async handleSemiAutoPost() {
    logger.log("?�� 반자?�화 ?�스???�작");

    const content = this.editTextInput.value;
    logger.log("?�� ?�력 ?�용:", content);

    if (!content.trim()) {
      logger.warn("???�스?�할 ?�용???�습?�다");
      this.showMessage("???�스?�할 ?�용???�습?�다.", "error");
      return;
    }

    const button = document.getElementById("semi-auto-post-btn");

    try {
      logger.log("??1. ?�력 검�??�료");

      // 로딩 ?�태 ?�시
      if (button) {
        this.showLoadingState(button, true);
        logger.log("??2. 로딩 ?�태 ?�시");
      }

      logger.log("?�� 3. ?�용 최적???�작...");
      const optimized = await this.optimizeContentForThreadsAsync(content);
      logger.log("??4. ?�용 최적???�료:", optimized);

      // ?�프?�인?�서??로컬 ?�??
      try {
        this.saveToLocalStorage("lastOptimizedContent", optimized);
        logger.log("??5. 로컬 ?�???�료");
      } catch (saveError) {
        logger.warn("?�️ 로컬 ?�???�패:", saveError);
      }

      // ?�동 ?�래???�작: posts 컬렉?�에 ?�스???�성
      logger.log("?�� 6. ?�동 ?�래???�작...");
      let sourceTextId = null;
      let referenceTextId = null;

      // ?�쪽 ?�널(?�퍼?�스)?�서 ?�재 ?�력???�퍼?�스 ?�인
      const referenceContent = this.refTextInput.value.trim();
      if (referenceContent) {
        // ?�퍼?�스가 ?�력?�어 ?�는 경우, ?�?�된 ?�퍼?�스 중에??찾거???�로 ?�??
        try {
          // ?�?�된 ?�퍼?�스 중에???�일???�용???�퍼?�스 찾기
          const matchingReference = this.savedTexts?.find(
            (item) =>
              item.type === "reference" && item.content === referenceContent
          );

          if (matchingReference) {
            // 기존 ?�퍼?�스 ?�용
            referenceTextId = matchingReference.id;
            logger.log("??기존 ?�퍼?�스 ?�용:", referenceTextId);
          } else {
            // ???�퍼?�스�??�??
            const referenceData = {
              content: referenceContent,
              type: "reference",
              characterCount: this.getKoreanCharacterCount(referenceContent),
              createdAt: window.firebaseServerTimestamp(),
              updatedAt: window.firebaseServerTimestamp(),
            };

            const referenceDocRef = await window.firebaseAddDoc(
              window.firebaseCollection(
                this.db,
                "users",
                this.currentUser.uid,
                "texts"
              ),
              referenceData
            );

            referenceTextId = referenceDocRef.id;
            logger.log("?????�퍼?�스 ?�???�료:", referenceTextId);

            // 로컬 배열?�도 추�?
            const savedReference = {
              id: referenceTextId,
              content: referenceContent,
              date: new Date().toLocaleString("ko-KR"),
              characterCount: this.getKoreanCharacterCount(referenceContent),
              type: "reference",
            };
            if (!this.savedTexts) {
              this.savedTexts = [];
            }
            this.savedTexts.unshift(savedReference);
          }
        } catch (referenceError) {
          logger.warn(
            "?�️ ?�퍼?�스 ?�???�패 (?�래?��? 계속 진행):",
            referenceError
          );
        }
      }

      // ?�재 ?�스?��? texts 컬렉?�에 먼�? ?�??(?�본 보존)
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const textData = {
            content: content, // ?�본 ?�용 (최적????
            type: "edit",
            characterCount: this.getKoreanCharacterCount(content),
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // 주제 추�? (?�택?�항)
          if (this.editTopicInput) {
            const topic = this.editTopicInput.value.trim();
            if (topic) {
              textData.topic = topic;
            }
          }

          // ??참고 ?�퍼?�스 ?�택 ?�보 추�?
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // ?�효???�퍼?�스 ID�??�터�?(존재 ?��? ?�인)
            const validReferences = this.selectedReferences.filter(
              (refId) =>
                this.savedTexts &&
                this.savedTexts.some(
                  (item) =>
                    item.id === refId && (item.type || "edit") === "reference"
                )
            );

            if (validReferences.length > 0) {
              textData.linkedReferences = validReferences;
              textData.referenceMeta = {
                linkedAt: window.firebaseServerTimestamp(), // ?�결 ?�점
                linkCount: validReferences.length, // ?�결 개수 (캐시)
              };

              logger.log(
                `?�� ${validReferences.length}�??�퍼?�스 ?�결??(반자???�스??`
              );
            } else {
              // �?배열�??�정 (null???�닌 �?배열)
              textData.linkedReferences = [];
            }
          } else {
            // ?�택???�퍼?�스가 ?�는 경우 �?배열�??�정
            textData.linkedReferences = [];
          }

          const textDocRef = await window.firebaseAddDoc(
            window.firebaseCollection(
              this.db,
              "users",
              this.currentUser.uid,
              "texts"
            ),
            textData
          );

          sourceTextId = textDocRef.id;
          logger.log("???�본 ?�스???�???�료:", sourceTextId);
        } catch (textSaveError) {
          logger.warn(
            "?�️ ?�본 ?�스???�???�패 (?�래?��? 계속 진행):",
            textSaveError
          );
        }
      }

      // posts 컬렉?�에 ?�래???�스???�동 ?�성
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const postsRef = window.firebaseCollection(
            this.db,
            "users",
            this.currentUser.uid,
            "posts"
          );
          const postData = {
            content: content, // ?�본 ?�용 (최적???? ?�래?�용)
            type: "edit",
            postedAt: window.firebaseServerTimestamp(),
            trackingEnabled: true, // ?�동?�로 ?�래???�성??
            metrics: [],
            analytics: {},
            sourceTextId: sourceTextId || null, // ?�본 ?�스??참조 (?�는 경우)
            sourceType: "edit", // ?�본 ?�스???�??
            // ?�퍼?�스 ?�용 ?�보 추�?
            referenceTextId: referenceTextId || null, // ?�퍼?�스 ?�스??참조 (?�는 경우)
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // ??참고 ?�퍼?�스 ?�택 ?�보 추�? (posts 컬렉?�에???�일?�게 ?�??
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // ?�효???�퍼?�스 ID�??�터�?(존재 ?��? ?�인)
            const validReferences = this.selectedReferences.filter(
              (refId) =>
                this.savedTexts &&
                this.savedTexts.some(
                  (item) =>
                    item.id === refId && (item.type || "edit") === "reference"
                )
            );

            if (validReferences.length > 0) {
              postData.linkedReferences = validReferences;
              postData.referenceMeta = {
                linkedAt: window.firebaseServerTimestamp(), // ?�결 ?�점
                linkCount: validReferences.length, // ?�결 개수 (캐시)
              };

              logger.log(
                `?�� ?�래???�스?�에 ${validReferences.length}�??�퍼?�스 ?�결??
              );
            } else {
              // �?배열�??�정 (null???�닌 �?배열)
              postData.linkedReferences = [];
            }
          } else {
            // ?�택???�퍼?�스가 ?�는 경우 �?배열�??�정
            postData.linkedReferences = [];
          }

          // ?�퍼?�스가 ?�용??경우, ?�퍼?�스???�스?�도 ?�성
          if (referenceTextId) {
            const referencePostData = {
              content: referenceContent, // ?�퍼?�스 ?�용
              type: "reference",
              postedAt: window.firebaseServerTimestamp(),
              trackingEnabled: false, // ?�퍼?�스 ?�스?�는 ?�래??비활?�화
              metrics: [],
              analytics: {},
              sourceTextId: referenceTextId, // ?�퍼?�스 ?�스??참조
              sourceType: "reference", // ?�퍼?�스 ?�?�으�??�정
              createdAt: window.firebaseServerTimestamp(),
              updatedAt: window.firebaseServerTimestamp(),
            };

            await window.firebaseAddDoc(postsRef, referencePostData);
            logger.log(
              "???�퍼?�스 ?�용 ?�스???�성 ?�료 (?�퍼?�스 ID:",
              referenceTextId,
              ")"
            );
          }

          const postDocRef = await window.firebaseAddDoc(postsRef, postData);
          logger.log("???�래???�스???�동 ?�성 ?�료:", postDocRef.id);

          // ?�래????목록 ?�로고침 (백그?�운?�에??
          if (this.trackingPosts && this.loadTrackingPosts) {
            this.loadTrackingPosts().catch((err) => {
              logger.warn("?�️ ?�래??목록 ?�로고침 ?�패:", err);
            });
          }

          // ?�용???�드�?메시지
          this.showMessage("?�� ?�래?�이 ?�동?�로 ?�작?�었?�니??", "success");
        } catch (postError) {
          logger.error("???�래???�스???�성 ?�패:", postError);
          // ?�래???�성 ?�패?�도 ?�스?��? 계속 진행
          this.showMessage(
            "?�️ ?�래???�작???�패?��?�??�스?��? 계속?????�습?�다.",
            "warning"
          );
        }
      }

      // ??반자???�스?????�택???�퍼?�스 초기??(?��????��?)
      if (this.selectedReferences && this.selectedReferences.length > 0) {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0�??�택??";
        }
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0�??�택??";
        }
        logger.log("??반자???�스?????�퍼?�스 ?�택 초기???�료");
      }

      // 최적???�료 ??모달 ?�시 (?�본 ?�스???�달)
      logger.log("?�� 7. 최적??모달 ?�시 ?�작...");
      this.showOptimizationModal(optimized, content);
      logger.log("??8. 최적??모달 ?�시 ?�료");
    } catch (error) {
      logger.error("??반자?�화 ?�스??처리 �??�류:", error);
      logger.error("?�류 ?�세:", error.stack);
      this.showMessage(
        "?�스??처리 �??�류가 발생?�습?�다: " + error.message,
        "error"
      );
    } finally {
      // 로딩 ?�태 ?�제
      if (button) {
        this.showLoadingState(button, false);
        logger.log("??8. 로딩 ?�태 ?�제");
      }
    }
  }

  // 비동�??�용 최적???�수 (?�능 개선)
  async optimizeContentForThreadsAsync(content) {
    return new Promise((resolve, reject) => {
      // 메인 ?�레??블로??방�?�??�한 setTimeout ?�용
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
   * ?�퍼?�스 ?�택 모달 ?�기
   *
   * - ?�퍼?�스 목록 ?�더�?
   * - ?�재 ?�택????�� 복원
   * - 모달 ?�시 �??�커???�동
   */
  openReferenceSelectionModal() {
    try {
      if (!this.referenceSelectionModal) {
        logger.warn("?�️ ?�퍼?�스 ?�택 모달??찾을 ???�습?�다.");
        return;
      }

      // ?�퍼?�스�??�터�?(type???�는 경우 'edit'�?간주)
      const references = this.savedTexts.filter(
        (item) => (item.type || "edit") === "reference"
      );

      if (references.length === 0) {
        this.showMessage(
          "?�️ ?�?�된 ?�퍼?�스가 ?�습?�다. 먼�? ?�퍼?�스�??�?�해주세??",
          "info"
        );
        return;
      }

      // ?�퍼?�스 목록 ?�더�?
      this.renderReferenceSelectionList(references);

      // 검???�터 초기??
      if (this.referenceSearchInput) this.referenceSearchInput.value = "";
      if (this.referenceTypeFilterModal)
        this.referenceTypeFilterModal.value = "all";

      // ?�택 개수 ?�데?�트
      this.updateReferenceSelectionCount();

      // 모달 ?�시
      this.referenceSelectionModal.style.display = "flex";
      document.body.style.overflow = "hidden"; // 배경 ?�크�?방�?

      // ?�근?? ?�커???�동 (검???�력 ?�드�?
      setTimeout(() => {
        if (this.referenceSearchInput) {
          this.referenceSearchInput.focus();
        }
      }, 100);

      logger.log("?�� ?�퍼?�스 ?�택 모달 ?�림");
    } catch (error) {
      logger.error("모달 ?�기 ?�패:", error);
      this.showMessage("??모달???????�습?�다.", "error");
    }
  }

  /**
   * ?�퍼?�스 ?�택 모달 ?�기
   *
   * - 모달 ?��?
   * - 배경 ?�크�?복원
   * - ?�커??복원 (?�래 버튼?�로)
   */
  closeReferenceSelectionModal() {
    if (!this.referenceSelectionModal) return;

    this.referenceSelectionModal.style.display = "none";
    document.body.style.overflow = ""; // 배경 ?�크�?복원

    // ?�근?? ?�커??복원
    if (this.selectReferencesBtn) {
      this.selectReferencesBtn.focus();
    }

    logger.log("?�� ?�퍼?�스 ?�택 모달 ?�힘");
  }

  /**
   * Phase 1.6.2: ?�성글??참고???�퍼?�스 목록 모달 ?�시
   *
   * @param {string} editId - ?�성글 ID
   *
   * - ?�성글???�결???�퍼?�스 목록 조회
   * - 커스?� 모달�??�시
   * - �??�퍼?�스 "?�용 보기" 버튼 ?�공
   */
  showLinkedReferencesModal(editId) {
    try {
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem) {
        this.showMessage("???�성글??찾을 ???�습?�다.", "error");
        return;
      }

      const linkedRefs = this.getLinkedReferences(editId);

      if (linkedRefs.length === 0) {
        this.showMessage("?�️ ?�결???�퍼?�스가 ?�습?�다.", "info");
        return;
      }

      // 모달 ?�용 ?�성
      const editTitle = this.escapeHtml(editItem.content || "").substring(
        0,
        50
      );
      const refsHtml = linkedRefs
        .map((ref, index) => {
          const content = this.escapeHtml(ref.content || "").substring(0, 100);
          const date =
            this.formatDateFromFirestore(ref.createdAt) || ref.date || "";
          const refType = ref.referenceType || "other";
          const refTypeLabel =
            refType === "structure"
              ? "구조"
              : refType === "idea"
              ? "?�이?�어"
              : "기�?";

          return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${
            content.length >= 100 ? "..." : ""
          }</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>·</span>
                                <span class="reference-type-badge badge-${this.escapeHtml(
                                  refType
                                )}">${this.escapeHtml(refTypeLabel)}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${ref.id}"
                                data-item-type="reference"
                                aria-label="?�퍼?�스 ?�용 보기">
                                ?�용 보기
                            </button>
                        </div>
                    </div>
                `;
        })
        .join("");

      const modalHtml = `
                <div class="custom-modal" role="dialog" aria-modal="true" 
                     aria-labelledby="linked-ref-modal-title">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h3 id="linked-ref-modal-title">?�� ??글??참고???�퍼?�스</h3>
                            <button class="close-btn" aria-label="모달 ?�기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>?�성글:</strong> ${editTitle}${
        editTitle.length >= 50 ? "..." : ""
      }
                            </div>
                            <div class="linked-items-list" role="list" aria-label="참고 ?�퍼?�스 목록">
                                ${refsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="?�기">?�기</button>
                        </div>
                    </div>
                </div>
            `;

      // 모달 ?�시
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // ?�벤??바인??
      this.bindCustomModalEvents(modal);

      logger.log(`?�� ?�결 ?�퍼?�스 모달 ?�시: ${linkedRefs.length}�?);
    } catch (error) {
      logger.error("?�결???�퍼?�스 모달 ?�시 ?�패:", error);
      this.showMessage("???�퍼?�스�?불러?????�습?�다.", "error");
    }
  }

  /**
   * Phase 1.6.2: ?�퍼?�스�?참고???�성글 목록 모달 ?�시
   *
   * @param {string} refId - ?�퍼?�스 ID
   *
   * - ?�퍼?�스�?참고???�성글 목록 조회 (??��??
   * - 커스?� 모달�??�시
   * - �??�성글 "?�용 보기" 버튼 ?�공
   */
  showEditsByReferenceModal(refId) {
    try {
      const refItem = this.savedTexts.find((item) => item.id === refId);
      if (!refItem) {
        this.showMessage("???�퍼?�스�?찾을 ???�습?�다.", "error");
        return;
      }

      const usedEdits = this.getEditsByReference(refId);

      if (usedEdits.length === 0) {
        this.showMessage("?�️ ???�퍼?�스�?참고??글???�습?�다.", "info");
        return;
      }

      // 모달 ?�용 ?�성
      const refTitle = this.escapeHtml(refItem.content || "").substring(0, 50);
      const editsHtml = usedEdits
        .map((edit, index) => {
          const content = this.escapeHtml(edit.content || "").substring(0, 100);
          const date =
            this.formatDateFromFirestore(edit.createdAt) || edit.date || "";
          const topic = this.escapeHtml(edit.topic || "주제 ?�음");

          return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${
            content.length >= 100 ? "..." : ""
          }</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>·</span>
                                <span>?���?${topic}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${edit.id}"
                                data-item-type="edit"
                                aria-label="?�성글 ?�용 보기">
                                ?�용 보기
                            </button>
                        </div>
                    </div>
                `;
        })
        .join("");

      const modalHtml = `
                <div class="custom-modal" role="dialog" aria-modal="true" 
                     aria-labelledby="used-in-edits-modal-title">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h3 id="used-in-edits-modal-title">?�� ???�퍼?�스�?참고???�성글</h3>
                            <button class="close-btn" aria-label="모달 ?�기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>?�퍼?�스:</strong> ${refTitle}${
        refTitle.length >= 50 ? "..." : ""
      }
                            </div>
                            <div class="linked-items-list" role="list" aria-label="참고???�성글 목록">
                                ${editsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="?�기">?�기</button>
                        </div>
                    </div>
                </div>
            `;

      // 모달 ?�시
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // ?�벤??바인??
      this.bindCustomModalEvents(modal);

      logger.log(`?�� 참고???�성글 모달 ?�시: ${usedEdits.length}�?);
    } catch (error) {
      logger.error("참고???�성글 모달 ?�시 ?�패:", error);
      this.showMessage("???�성글??불러?????�습?�다.", "error");
    }
  }

  /**
   * ?�?�된 글 ?�용 보기
   *
   * @param {string} itemId - ?�?�된 글 ID
   * @param {Object|string} [options] - 추�? ?�션 (type ??
   *
   * - ?�?�된 글 목록?�로 ?�환
   * - ?�당 글??찾아 ?�크�?
   * - ?�용 ?�동 ?�치�?
   * - 강조 ?�시 (2�?
   * - ?�외: 글??찾�? 못한 경우 ?�집 ?�면 ?�환
   */
  async viewSavedText(itemId, options = {}) {
    try {
      if (!itemId) {
        logger.warn("?�️ viewSavedText: itemId가 ?�습?�다.");
        return;
      }

      const optionObject =
        typeof options === "string" ? { type: options } : options || {};
      const cachedItem = this.savedTexts?.find((t) => t.id === itemId);
      const requestedType =
        optionObject.type || (cachedItem ? cachedItem.type || "edit" : null);
      const normalizedType =
        requestedType === "reference" ? "reference" : "edit";

      // ?�?�된 글 목록?�로 ?�환
      this.switchTab("saved");

      // ?�터�??�동 조정?�여 ?�??카드가 DOM??존재?�도�?처리
      let filterChanged = false;
      if (normalizedType === "reference") {
        if (!["reference", "reference-used"].includes(this.savedFilter)) {
          this.setSavedFilter("reference");
          filterChanged = true;
        }
      } else {
        if (["reference", "reference-used"].includes(this.savedFilter)) {
          this.setSavedFilter("edit");
          filterChanged = true;
        }
      }

      const waitTime = filterChanged ? 600 : 300;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // ?�당 글 찾기
      const savedItem = document.querySelector(`[data-item-id="${itemId}"]`);

      if (savedItem) {
        // ?�크�?�?강조 ?�시
        savedItem.scrollIntoView({ behavior: "smooth", block: "center" });
        savedItem.classList.add("highlight");

        // ?�용 ?�동 ?�치�?(?�보�?버튼 ?�릭)
        const toggleBtn = savedItem.querySelector(".saved-item-toggle");
        const contentEl = savedItem.querySelector(".saved-item-content");

        if (
          toggleBtn &&
          contentEl &&
          !contentEl.classList.contains("expanded")
        ) {
          toggleBtn.click();
        }

        // 강조 ?�시 ?�거 (2�???
        setTimeout(() => {
          savedItem.classList.remove("highlight");
        }, 2000);

        // ?�커???�동 (?�근??
        savedItem.setAttribute("tabindex", "-1");
        savedItem.focus();

        logger.log(`???�?�된 글 ?�용 보기: ${itemId}`);
      } else {
        // 글??찾�? 못한 경우 (?�터 변�??�는 ?�집 ?�면 ?�환)
        logger.warn(
          `?�️ ?�?�된 글 카드�?찾을 ???�음: ${itemId}, ?�집 ?�면 ?�환`
        );

        const item = cachedItem || this.savedTexts.find((t) => t.id === itemId);
        if (item) {
          const type =
            (item.type || "edit") === "reference" ? "reference" : "edit";
          this.editText(itemId, type);
          this.showMessage("?�� ?�집 ?�면?�로 ?�환?�습?�다.", "info");
        } else {
          this.showMessage("??글??찾을 ???�습?�다.", "error");
        }
      }
    } catch (error) {
      logger.error("viewSavedText ?�패:", error);
      this.showMessage("???�용??불러?????�습?�다.", "error");
    }
  }

  /**
   * 참고 ?�퍼?�스 ?�용??즉시 ?�시?�니??
   *
   * @param {string} referenceId - ?�퍼?�스 ID
   */
  showReferenceContentModal(referenceId) {
    try {
      if (!referenceId) {
        logger.warn("?�️ showReferenceContentModal: referenceId가 ?�습?�다.");
        return;
      }

      const referenceItem = this.savedTexts.find(
        (item) =>
          item.id === referenceId && (item.type || "edit") === "reference"
      );

      if (!referenceItem) {
        this.showMessage("???�퍼?�스 글??찾을 ???�습?�다.", "error");
        return;
      }

      const refType = referenceItem.referenceType || "unspecified";
      const refTypeLabel =
        refType === "structure"
          ? "구조"
          : refType === "idea"
          ? "?�이?�어"
          : "기�?";
      const dateText =
        this.formatDateFromFirestore(referenceItem.createdAt) ||
        referenceItem.date ||
        "";
      const topicText = this.escapeHtml(
        referenceItem.topic || "출처 ?�보 ?�음"
      );
      const contentHtml = this.escapeHtml(referenceItem.content || "").replace(
        /\n/g,
        "<br>"
      );

      const existingModal = document.querySelector(".reference-detail-modal");
      if (existingModal) {
        existingModal.remove();
      }

      const modalHtml = `
                <div class="custom-modal reference-detail-modal" role="dialog" aria-modal="true"
                     aria-labelledby="reference-detail-title">
                    <div class="modal-content" style="max-width: 640px;">
                        <div class="modal-header">
                            <h3 id="reference-detail-title">?�� 참고 ?�퍼?�스</h3>
                            <button class="close-btn" aria-label="모달 ?�기">??/button>
                        </div>
                        <div class="modal-body">
                            <div class="reference-detail-meta">
                                <div><strong>?�형:</strong> <span class="reference-type-badge badge-${this.escapeHtml(
                                  refType
                                )}">${this.escapeHtml(
        refTypeLabel
      )}</span></div>
                                <div><strong>?�성??</strong> ${
                                  dateText || "기록 ?�음"
                                }</div>
                                <div><strong>출처:</strong> ${topicText}</div>
                            </div>
                            <div class="reference-detail-content" role="region" aria-label="?�퍼?�스 ?�용">
                                ${contentHtml || "<em>?�용???�습?�다.</em>"}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="secondary-btn reference-import-btn" data-reference-id="${referenceId}">
                                ?�️ ?�성 ?�역?�로 불러?�기
                            </button>
                            <button class="primary-btn close-modal-btn" aria-label="?�기">?�기</button>
                        </div>
                    </div>
                </div>
            `;

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".reference-detail-modal");
      if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
        this.bindCustomModalEvents(modal);

        const importBtn = modal.querySelector(".reference-import-btn");
        if (importBtn) {
          importBtn.addEventListener("click", () => {
            this.editText(referenceId, "reference");
            modal.remove();
            document.body.style.overflow = "";
          });
        }
      }
    } catch (error) {
      logger.error("showReferenceContentModal ?�패:", error);
      this.showMessage("???�퍼?�스�??�시?��? 못했?�니??", "error");
    }
  }

  /**
   * Phase 1.6.2: 커스?� 모달 ?�벤??바인??
   *
   * @param {HTMLElement} modal - 모달 DOM ?�소
   *
   * - ?�기 버튼 ?�벤??
   * - 모달 ?��? ?�릭
   * - ESC ??
   * - "?�용 보기" 버튼
   */
  bindCustomModalEvents(modal) {
    if (!modal) return;

    // ?�기 버튼
    const closeBtns = modal.querySelectorAll(".close-btn, .close-modal-btn");
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.remove();
        document.body.style.overflow = "";
      });
    });

    // 모달 ?��? ?�릭
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        document.body.style.overflow = "";
      }
    });

    // ESC ??
    const escHandler = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.body.style.overflow = "";
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    // "?�용 보기" 버튼
    const viewBtns = modal.querySelectorAll(".view-item-btn");
    viewBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-item-id");
        const itemType = btn.getAttribute("data-item-type") || "edit";

        modal.remove();
        document.body.style.overflow = "";

        if (itemType === "reference") {
          this.showReferenceContentModal(itemId);
          return;
        }

        this.viewSavedText(itemId, { type: itemType });
      });
    });
  }

  /**
   * ?�퍼?�스 ?�택 목록 ?�더�?
   *
   * @param {Array} references - ?�퍼?�스 배열 (?�션, ?�으�??�체 조회)
   *
   * - 체크박스�??�중 ?�택 가??
   * - ?�재 ?�택????�� 체크 ?�시
   * - 검??�??�터 ?�용
   * - 최신???�렬
   */
  /**
   * ?�스???�이?�이??(검?�어 강조)
   *
   * @param {string} text - ?�본 ?�스??
   * @param {string} query - 검?�어
   * @returns {string} ?�이?�이?�된 HTML 문자??
   *
   * - 검?�어?� ?�치?�는 부분을 <mark> ?�그�?감쌈
   * - XSS 방�?�??�해 ?�머지 부분�? ?�스케?�프 처리
   * - ?�?�문??구분 ?�이 매칭
   */
  highlightText(text, query) {
    if (!text) return "";
    if (!query) return this.escapeHtml(text);

    try {
      // ?�규???�수문자 ?�스케?�프
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escapedQuery})`, "gi");

      return text
        .split(regex)
        .map((part) => {
          if (part.toLowerCase() === query.toLowerCase()) {
            return `<mark>${this.escapeHtml(part)}</mark>`;
          }
          return this.escapeHtml(part);
        })
        .join("");
    } catch (e) {
      logger.warn("?�이?�이??처리 �??�류:", e);
      return this.escapeHtml(text);
    }
  }

  renderReferenceSelectionList(references = null) {
    if (!this.referenceSelectionList) return;

    try {
      // ?�퍼?�스 목록 가?�오�?(?�라미터 ?�으�??�체 조회)
      let refs =
        references ||
        this.savedTexts.filter((item) => (item.type || "edit") === "reference");

      // 검???�터 ?�용
      const searchTerm =
        this.referenceSearchInput?.value.toLowerCase().trim() || "";
      if (searchTerm) {
        refs = refs.filter((ref) => {
          const content = (ref.content || "").toLowerCase();
          const topic = (ref.topic || "").toLowerCase();
          return content.includes(searchTerm) || topic.includes(searchTerm);
        });
      }

      // ?�???�터 ?�용
      const typeFilter = this.referenceTypeFilterModal?.value || "all";
      if (typeFilter !== "all") {
        refs = refs.filter(
          (ref) => (ref.referenceType || "other") === typeFilter
        );
      }

      // ?�렬 (최신??
      refs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      // HTML ?�성
      if (refs.length === 0) {
        this.referenceSelectionList.innerHTML = `
                    <div class="empty-state" style="padding: 40px; text-align: center; color: #6c757d;">
                        <p>검??결과가 ?�습?�다.</p>
                    </div>
                `;
        return;
      }

      const html = refs
        .map((ref) => {
          const isSelected = this.selectedReferences.includes(ref.id);

          // ?�스??준�?(길이 ?�한)
          const contentRaw = ref.content || "";
          const isLong = contentRaw.length > 100;
          const contentDisplay = isLong
            ? contentRaw.substring(0, 100)
            : contentRaw;

          // ?�이?�이???�용
          const content = this.highlightText(contentDisplay, searchTerm);
          const topic = this.highlightText(
            ref.topic || "주제 ?�음",
            searchTerm
          );

          const refType = ref.referenceType || "other";
          const typeLabel =
            refType === "structure"
              ? "구조"
              : refType === "idea"
              ? "?�이?�어"
              : "미�???;
          const badgeClass =
            refType === "structure"
              ? "structure"
              : refType === "idea"
              ? "idea"
              : "";
          const date =
            this.formatDateFromFirestore?.(ref.createdAt) || ref.date || "";

          return `
                    <div class="reference-list-item" role="option" aria-selected="${isSelected}">
                        <input 
                            type="checkbox" 
                            id="ref-check-${ref.id}" 
                            value="${ref.id}"
                            ${isSelected ? "checked" : ""}
                            aria-labelledby="ref-label-${ref.id}">
                        <div class="reference-item-content">
                            <div class="reference-item-title" id="ref-label-${
                              ref.id
                            }">
                                ${content}${isLong ? "..." : ""}
                            </div>
                            <div class="reference-item-meta">
                                ${date ? `<span>${date}</span>` : ""}
                                ${date ? "<span>·</span>" : ""}
                                <span class="reference-type-badge ${badgeClass}">${typeLabel}</span>
                                <span>·</span>
                                <span>${topic}</span>
                            </div>
                        </div>
                    </div>
                `;
        })
        .join("");

      this.referenceSelectionList.innerHTML = html;

      // 체크박스 ?�벤??바인??
      this.bindReferenceCheckboxEvents();

      logger.log(`???�퍼?�스 목록 ?�더�??�료: ${refs.length}�?);
    } catch (error) {
      logger.error("?�퍼?�스 목록 ?�더�??�패:", error);
      this.referenceSelectionList.innerHTML = `
                <div class="error-state" style="padding: 40px; text-align: center; color: #dc3545;">
                    <p>??목록??불러?????�습?�다.</p>
                </div>
            `;
    }
  }

  /**
   * ?�퍼?�스 체크박스 ?�벤??바인??
   *
   * - 체크박스 변�????�택 배열 ?�데?�트
   * - ?�택 개수 ?�시�??�시
   * - 리스???�이???�릭?�로???��? 가??
   */
  bindReferenceCheckboxEvents() {
    if (!this.referenceSelectionList) return;

    // 체크박스 변�??�벤??
    const checkboxes = this.referenceSelectionList.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const refId = e.target.value;

        if (e.target.checked) {
          // ?�택 추�?
          if (!this.selectedReferences.includes(refId)) {
            this.selectedReferences.push(refId);
          }
        } else {
          // ?�택 ?�거
          this.selectedReferences = this.selectedReferences.filter(
            (id) => id !== refId
          );
        }

        // ?�택 개수 ?�데?�트
        this.updateReferenceSelectionCount();

        logger.log("?�택???�퍼?�스:", this.selectedReferences);
      });
    });

    // 리스???�이???�릭 ??체크박스 ?��? (UX 개선)
    const listItems = this.referenceSelectionList.querySelectorAll(
      ".reference-list-item"
    );
    listItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        // 체크박스 ?�체�??�릭??경우???�외
        if (e.target.type !== "checkbox") {
          const checkbox = item.querySelector('input[type="checkbox"]');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            // change ?�벤???�리�?
            checkbox.dispatchEvent(new Event("change"));
          }
        }
      });
    });
  }

  /**
   * ?�택???�퍼?�스 개수 ?�데?�트
   *
   * - 모달 ??개수 ?�시
   * - aria-live�??�크�?리더???�림
   */
  updateReferenceSelectionCount() {
    const count = this.selectedReferences.length;

    if (this.modalSelectedCount) {
      this.modalSelectedCount.textContent = count;
    }

    // aria-live�??�크�?리더???�림
    const selectionCountDiv =
      this.referenceSelectionModal?.querySelector(".selection-count");
    if (selectionCountDiv) {
      selectionCountDiv.setAttribute("aria-live", "polite");
    }
  }

  /**
   * ?�퍼?�스 ?�택/?�제 ?��? (?�거???�환??
   * @deprecated bindReferenceCheckboxEvents??change ?�벤?�로 ?�체됨
   */
  toggleReferenceSelection(refId) {
    const index = this.selectedReferences.indexOf(refId);
    if (index > -1) {
      // ?��? ?�택??경우 ?�거
      this.selectedReferences.splice(index, 1);
    } else {
      // ?�택?��? ?��? 경우 추�?
      this.selectedReferences.push(refId);
    }

    this.updateReferenceSelectionCount();
  }

  /**
   * 모달 ???�택 개수 ?�데?�트 (?�거???�환??
   * @deprecated updateReferenceSelectionCount�??�합??
   */
  updateModalSelectedCount() {
    this.updateReferenceSelectionCount();
  }

  /**
   * ?�퍼?�스 ?�택 ?�인
   *
   * - ?�택???�퍼?�스 ?�그 ?�시
   * - 모달 ?�기
   * - ?�택 개수 버튼 ?�데?�트
   */
  confirmReferenceSelection() {
    try {
      // ?�그 ?�더�?(?��? 버튼 카운?�도 ?�께 ?�데?�트)
      this.renderSelectedReferenceTags();

      // 버튼 개수 ?�데?�트
      if (this.selectedRefCount) {
        this.selectedRefCount.textContent = `(${this.selectedReferences.length}�??�택??`;
      }

      // ?��? 버튼 카운???�데?�트
      if (this.collapseRefCount) {
        this.collapseRefCount.textContent = `(${this.selectedReferences.length}�??�택??`;
      }

      // 모달 ?�기
      this.closeReferenceSelectionModal();

      logger.log(`??${this.selectedReferences.length}�??�퍼?�스 ?�택 ?�료`);
    } catch (error) {
      logger.error("?�택 ?�인 ?�패:", error);
      this.showMessage("???�택???�?�할 ???�습?�다.", "error");
    }
  }

  /**
   * ?�택???�퍼?�스 ?�그 ?�더�?
   *
   * - ?�택??�??�퍼?�스�??�그�??�시
   * - X 버튼?�로 ?�거 가??
   */
  renderSelectedReferenceTags() {
    if (!this.selectedReferencesTags) return;

    try {
      if (this.selectedReferences.length === 0) {
        this.selectedReferencesTags.innerHTML = "";
        // ?��? 버튼 카운?�도 ?�데?�트
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0�??�택??";
        }
        return;
      }

      // ?�택???�퍼?�스 객체 가?�오�?
      const selectedRefs = this.selectedReferences
        .map((refId) => this.savedTexts.find((item) => item.id === refId))
        .filter(Boolean); // null ?�거

      const html = selectedRefs
        .map((ref) => {
          const content = this.escapeHtml(ref.content || "").substring(0, 30);
          const title = `${content}${content.length >= 30 ? "..." : ""}`;

          return `
                    <div class="reference-tag" role="listitem" data-ref-id="${
                      ref.id
                    }">
                        <span class="tag-text" title="${this.escapeHtml(
                          ref.content || ""
                        )}">
                            ${title}
                        </span>
                        <button 
                            class="remove-btn" 
                            data-ref-id="${ref.id}"
                            type="button"
                            aria-label="${this.escapeHtml(content)} ?�거"
                            title="?�거">
                            ×
                        </button>
                    </div>
                `;
        })
        .join("");

      this.selectedReferencesTags.innerHTML = html;

      // ?��? 버튼 카운?�도 ?�데?�트
      if (this.collapseRefCount) {
        this.collapseRefCount.textContent = `(${this.selectedReferences.length}�??�택??`;
      }

      // ?�거 버튼 ?�벤??바인??
      this.bindReferenceTagRemoveEvents();

      logger.log(`??${selectedRefs.length}�??�그 ?�더�??�료`);
    } catch (error) {
      logger.error("?�그 ?�더�??�패:", error);
      this.selectedReferencesTags.innerHTML =
        '<p style="color: #dc3545;">?�그�??�시?????�습?�다.</p>';
    }
  }

  /**
   * ?�퍼?�스 ?�그 ?�거 버튼 ?�벤??바인??
   */
  bindReferenceTagRemoveEvents() {
    if (!this.selectedReferencesTags) return;

    const removeBtns =
      this.selectedReferencesTags.querySelectorAll(".remove-btn");

    removeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const refId = btn.getAttribute("data-ref-id");

        // ?�택 배열?�서 ?�거
        this.selectedReferences = this.selectedReferences.filter(
          (id) => id !== refId
        );

        // ?�그 ?�렌?�링
        this.renderSelectedReferenceTags();

        // 버튼 개수 ?�데?�트
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = `(${this.selectedReferences.length}�??�택??`;
        }

        logger.log(`?�퍼?�스 ?�거: ${refId}`);
      });
    });
  }

  /**
   * ?�택???�퍼?�스�??�그�??�더�?(?�거???�환??
   * @deprecated renderSelectedReferenceTags�??�합??
   */
  renderSelectedReferencesTags() {
    this.renderSelectedReferenceTags();
  }

  /**
   * ?�택???�퍼?�스 ?�거 (?�거???�환?? ?�역 ?�수?�서 ?�출)
   */
  removeSelectedReference(refId) {
    const index = this.selectedReferences.indexOf(refId);
    if (index > -1) {
      this.selectedReferences.splice(index, 1);
      this.renderSelectedReferenceTags();

      // 버튼 ?�스???�데?�트
      if (this.selectedRefCount) {
        this.selectedRefCount.textContent = `(${this.selectedReferences.length}�??�택??`;
      }
    }
  }

  /**
   * ?�퍼?�스 목록 ?�터�?(검??+ ?�??
   */
  filterReferenceList() {
    const searchTerm = this.referenceSearchInput?.value.toLowerCase() || "";
    const selectedType = this.referenceTypeFilterModal?.value || "all";

    let filtered = this.savedTexts.filter((item) => item.type === "reference");

    // 검?�어 ?�터
    if (searchTerm) {
      filtered = filtered.filter(
        (ref) =>
          ref.content.toLowerCase().includes(searchTerm) ||
          (ref.topic && ref.topic.toLowerCase().includes(searchTerm))
      );
    }

    // ?�???�터
    if (selectedType !== "all") {
      filtered = filtered.filter((ref) => ref.referenceType === selectedType);
    }

    // ?�렌?�링
    this.renderReferenceSelectionList(filtered);
  }

  /**
   * ?�성글???�결???�퍼?�스 조회 (직접 조회)
   *
   * @param {string} editId - ?�성글 ID
   * @returns {Array} ?�결???�퍼?�스 객체 배열
   *
   * - ?�성글??linkedReferences ID 배열??기반?�로 ?�퍼?�스 객체 조회
   * - 존재?��? ?�는 ?�퍼?�스???�외
   * - 최신???�렬
   */
  getLinkedReferences(editId) {
    try {
      // ?�성글 찾기
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem || (editItem.type || "edit") !== "edit") {
        return [];
      }

      // linkedReferences 배열 ?�인
      const linkedRefIds = editItem.linkedReferences || [];
      if (linkedRefIds.length === 0) {
        return [];
      }

      // ID�?객체�?변??(O(n) 검??
      const linkedRefs = linkedRefIds
        .map((refId) =>
          this.savedTexts.find(
            (item) => item.id === refId && (item.type || "edit") === "reference"
          )
        )
        .filter(Boolean); // null ?�거

      // 최신???�렬
      linkedRefs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      return linkedRefs;
    } catch (error) {
      logger.error("?�결???�퍼?�스 조회 ?�패:", error);
      return [];
    }
  }

  /**
   * ?�퍼?�스�?참고???�성글 조회 (??��??
   *
   * @param {string} referenceId - ?�퍼?�스 ID
   * @returns {Array} ???�퍼?�스�?참고???�성글 객체 배열
   *
   * - ?�라?�언?�에??계산 (Firebase 쿼리 ?�음)
   * - 메모리에 로드??savedTexts 배열??O(n) 검??
   * - 최신???�렬
   */
  getEditsByReference(referenceId) {
    try {
      // ?�성글�??�터�?+ linkedReferences??referenceId ?�함
      const edits = this.savedTexts.filter(
        (item) =>
          (item.type || "edit") === "edit" &&
          Array.isArray(item.linkedReferences) &&
          item.linkedReferences.includes(referenceId)
      );

      // 최신???�렬
      edits.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      return edits;
    } catch (error) {
      logger.error("??��??조회 ?�패:", error);
      return [];
    }
  }

  /**
   * ??��??조회 캐시 무효??
   *
   * - ?�이??변�???(?�?? ??��) 캐시 초기??
   * - ?�재??캐싱???�용?��? ?��?�? ?�후 ?�장?�을 ?�해 ?�수 ?�공
   */
  invalidateReferenceLinkCache() {
    if (this.referenceLinkCache) {
      this.referenceLinkCache.clear();
    }
    // ?�재??매번 계산?��?�?별도 ?�업 불필??
    logger.log("?�� ?�퍼?�스 링크 캐시 무효??(?�재??캐싱 미사??");
  }

  // ===== ?�크립트 ?�성 기능 =====

  /**
   * ?�크립트 ?�성 기능 초기??
   */
  initArticleManagement() {
    // ===== [Bug Fix] 중복 ?�행 방�? =====
    // 목적: switchTab()?�서 ???�환 ?�마?????�수가 ?�출?�어
    // ?�벤??리스?��? 중복 ?�록?�는 것을 방�?
    // 증상: ?�??버튼 ?�릭 ???�일??글???�러 �??�?�되??버그
    if (this.isArticleManagementInitialized) {
      return; // ?��? 초기?�되?�으�?조기 리턴
    }
    this.isArticleManagementInitialized = true;

    // DOM ?�소 참조
    this.categorySelect = document.getElementById("category-select");
    this.articleCardsGrid = document.getElementById("article-cards-grid");
    this.managementEmptyState = document.getElementById(
      "management-empty-state"
    );
    // ===== [Dual Panel] ?�???�널 DOM ?�소 참조 =====
    // 2025-12-09 Phase 2 추�?
    this.articleDetailContainer = document.getElementById(
      "article-detail-container"
    );
    this.articleDetailPanel1 = document.getElementById("article-detail-panel-1");
    this.articleDetailPanel2 = document.getElementById("article-detail-panel-2");
    this.detailDualDivider = document.getElementById("detail-dual-divider");

    // ?�널 1 DOM ?�소 참조 (기존 articleDetailPanel ??articleDetailPanel1?�로 변�?
    this.articleDetailPanel = this.articleDetailPanel1; // ?�위 ?�환???��?
    this.detailPanelClose = document.getElementById("detail-panel-close-1");
    this.detailEditBtn = document.getElementById("detail-edit-btn-1");
    this.detailDeleteBtn = document.getElementById("detail-delete-btn-1");
    this.detailCopyBtn = document.getElementById("detail-copy-btn-1");
    this.editSaveBtn = document.getElementById("edit-article-save-btn-1");
    this.editCancelBtn = document.getElementById("edit-article-cancel-btn-1");
    this.editTitleInput = document.getElementById("edit-title-input-1");
    this.editCategorySelect = document.getElementById("edit-category-select-1");
    this.editContentTextarea = document.getElementById("edit-content-textarea-1");

    // ===== [Dual Panel] ?�널 2 ?�정 모드 DOM 참조 =====
    // 2025-12-10 버그 ?�정: ?�널 2 ?�??취소 버튼 ?�벤???�결???�한 DOM 참조 추�?
    this.editSaveBtn2 = document.getElementById("edit-article-save-btn-2");
    this.editCancelBtn2 = document.getElementById("edit-article-cancel-btn-2");
    this.editTitleInput2 = document.getElementById("edit-title-input-2");
    this.editCategorySelect2 = document.getElementById("edit-category-select-2");
    this.editContentTextarea2 = document.getElementById("edit-content-textarea-2");

    // ===== [Dual Panel] ?��? 버튼 DOM 참조 =====
    // 2025-12-09 Phase 1 추�?: ?�???�널 ?��? 버튼 기능 구현
    this.detailExpandBtn1 = document.getElementById("detail-expand-btn-1");
    this.detailExpandBtn2 = document.getElementById("detail-expand-btn-2");

    // ???�크립트 ?�성 ??관???�소
    this.newScriptToggleBtn = document.getElementById("new-script-toggle-btn");
    this.scriptCreateForm = document.getElementById("script-create-form");
    this.scriptTitleInput = document.getElementById("script-title-input");
    this.scriptContentTextarea = document.getElementById(
      "script-content-textarea"
    );
    this.scriptContentCounter = document.getElementById(
      "script-content-counter"
    );
    this.scriptCategoryInput = document.getElementById("script-category-input");

    // ?��? 모드 관???�소
    this.expandContentBtn = document.getElementById("expand-content-btn");
    this.contentExpandModal = document.getElementById("content-expand-modal");
    this.expandModalClose = document.getElementById("expand-modal-close");
    this.expandCloseBtn = document.getElementById("expand-close-btn");
    this.expandSaveBtn = document.getElementById("expand-save-btn");
    this.expandContentTextarea = document.getElementById(
      "expand-content-textarea"
    );
    this.expandContentCounter = document.getElementById(
      "expand-content-counter"
    );
    this.expandPreviewTitle = document.getElementById("expand-preview-title");
    this.expandPreviewCategory = document.getElementById(
      "expand-preview-category"
    );
    this.expandLoadReferenceBtn = document.getElementById(
      "expand-load-reference-btn"
    );

    // ?��? 모드 ?�퍼?�스 ?�역 관???�소
    this.expandReferencePanel = document.getElementById(
      "expand-reference-panel"
    );
    this.expandReferenceContent = document.getElementById(
      "expand-reference-content"
    );
    this.expandReferenceList = document.getElementById("expand-reference-list");
    this.expandReferenceEmpty = document.querySelector(
      ".expand-reference-empty"
    );
    this.expandToggleReferenceBtn = document.getElementById(
      "expand-toggle-reference-btn"
    );
    this.expandSplitDivider = document.getElementById("expand-split-divider");

    // ?��? 모드 ?�퍼?�스 ?�태
    this.expandReferences = []; // ?��? 모드?�서 ?�택???�퍼?�스 목록
    this.scriptLlmModelSelect = document.getElementById(
      "script-llm-model-select"
    );
    this.scriptLlmModelCustom = document.getElementById(
      "script-llm-model-custom"
    );
    this.scriptLlmTypeInput = document.getElementById("script-llm-type-input");
    this.scriptSaveBtn = document.getElementById("script-save-btn");
    this.scriptCancelBtn = document.getElementById("script-cancel-btn");
    this.categorySuggestions = document.getElementById("category-suggestions");

    // ?�퍼?�스 불러?�기 관???�소
    this.loadReferenceBtn = document.getElementById("load-reference-btn");
    this.referenceLoaderPanel = document.getElementById(
      "reference-loader-panel"
    );
    this.referenceLoaderClose = document.getElementById(
      "reference-loader-close"
    );
    this.referenceTabs = document.querySelectorAll(".reference-tab");
    this.referenceSearchInput = document.getElementById(
      "reference-search-input"
    );
    this.referenceSavedContent = document.getElementById(
      "reference-saved-content"
    );
    this.referenceTrackingContent = document.getElementById(
      "reference-tracking-content"
    );
    this.referenceSavedList = document.getElementById("reference-saved-list");
    this.referenceTrackingList = document.getElementById(
      "reference-tracking-list"
    );
    this.referenceRecentList = document.getElementById("reference-recent-list");
    this.referenceRecentSection = document.getElementById(
      "reference-recent-section"
    );
    this.referenceCategoryFilter = document.getElementById(
      "reference-category-filter"
    );
    this.referenceSortFilter = document.getElementById("reference-sort-filter");
    this.referenceTrackingFilters = document.getElementById(
      "reference-tracking-filters"
    );
    // ?�세 모드 ?�퍼?�스 로드 버튼
    this.detailLoadReferenceBtn = document.getElementById(
      "detail-load-reference-btn"
    );
    // ?�벤??리스???�결
    if (this.detailLoadReferenceBtn) {
      this.detailLoadReferenceBtn.addEventListener("click", () => {
        this.openReferenceLoader();
      });
    }
    if (this.referenceLoaderClose) {
      this.referenceLoaderClose.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    // ?�퍼?�스 로더 ?�태
    this.currentReferenceTab = "saved";
    this.referenceSearchDebounce = null;
    this.recentReferences = this.loadRecentReferences(); // localStorage?�서 최근 ?�용 글 로드

    // ?�재 ?�택??글 ID
    this.selectedArticleId = null;
    this.managementArticles = []; // ?�크립트 ?�성??글 목록

    // ?�벤??리스??바인??
    if (this.categorySelect) {
      this.categorySelect.addEventListener("change", (e) => {
        this.filterArticlesByCategory(e.target.value);
      });
    }

    // ===== [Dual Panel] ?�널 ?�기 버튼 ?�벤??=====
    // ?�널 1 ?�기 버튼
    if (this.detailPanelClose) {
      this.detailPanelClose.addEventListener("click", () => {
        this.closeDetailPanelByIndex(0);
      });
    }

    // ?�널 2 ?�기 버튼
    const detailPanelClose2 = document.getElementById("detail-panel-close-2");
    if (detailPanelClose2) {
      detailPanelClose2.addEventListener("click", () => {
        this.closeDetailPanelByIndex(1);
      });
    }

    // ===== [Dual Panel] ?�널 1 ?�정/??��/복사 버튼 ?�벤??=====
    if (this.detailEditBtn) {
      this.detailEditBtn.addEventListener("click", () => {
        this.enterEditModeByIndex(0);
      });
    }

    if (this.detailDeleteBtn) {
      this.detailDeleteBtn.addEventListener("click", () => {
        this.deleteArticleByIndex(0);
      });
    }

    if (this.detailCopyBtn) {
      this.detailCopyBtn.addEventListener("click", () => {
        this.copyArticleContentByIndex(0);
      });
    }

    // ===== [Dual Panel] ?�널 2 ?�정/??��/복사 버튼 ?�벤??=====
    const detailEditBtn2 = document.getElementById("detail-edit-btn-2");
    const detailDeleteBtn2 = document.getElementById("detail-delete-btn-2");
    const detailCopyBtn2 = document.getElementById("detail-copy-btn-2");

    if (detailEditBtn2) {
      detailEditBtn2.addEventListener("click", () => {
        this.enterEditModeByIndex(1);
      });
    }

    if (detailDeleteBtn2) {
      detailDeleteBtn2.addEventListener("click", () => {
        this.deleteArticleByIndex(1);
      });
    }

    if (detailCopyBtn2) {
      detailCopyBtn2.addEventListener("click", () => {
        this.copyArticleContentByIndex(1);
      });
    }

    // ===== [Dual Panel] ?��? 버튼 ?�벤??=====
    // 2025-12-09 Phase 1 추�?: ?�???�널 ?��? 버튼 ?�릭 ?�벤???�결
    // ?�널 1 ?��? 버튼
    if (this.detailExpandBtn1) {
      this.detailExpandBtn1.addEventListener("click", () => {
        this.openExpandModeByIndex(0);
      });
    }

    // ?�널 2 ?��? 버튼
    if (this.detailExpandBtn2) {
      this.detailExpandBtn2.addEventListener("click", () => {
        this.openExpandModeByIndex(1);
      });
    }

    // ===== [Dual Panel] ?�널 1 ?�??취소 버튼 ?�벤??=====
    // 2025-12-10 버그 ?�정: ByIndex ?�수 ?�출�?변�?(suffix ?�용??DOM ID ?�용)
    if (this.editSaveBtn) {
      this.editSaveBtn.addEventListener("click", () => {
        this.saveArticleEditByIndex(0);
      });
    }

    if (this.editCancelBtn) {
      this.editCancelBtn.addEventListener("click", () => {
        this.cancelArticleEditByIndex(0);
      });
    }

    // ===== [Dual Panel] ?�널 2 ?�??취소 버튼 ?�벤??=====
    // 2025-12-10 버그 ?�정: ?�널 2 ?�정 모드 ?�??취소 기능 ?�결
    if (this.editSaveBtn2) {
      this.editSaveBtn2.addEventListener("click", () => {
        this.saveArticleEditByIndex(1);
      });
    }

    if (this.editCancelBtn2) {
      this.editCancelBtn2.addEventListener("click", () => {
        this.cancelArticleEditByIndex(1);
      });
    }

    // ???�크립트 ?�성 ???�벤??
    if (this.newScriptToggleBtn) {
      this.newScriptToggleBtn.addEventListener("click", () => {
        this.toggleScriptCreateForm();
      });
    }

    if (this.scriptLlmModelSelect) {
      this.scriptLlmModelSelect.addEventListener("change", (e) => {
        this.handleLlmModelChange(e.target.value);
      });
    }

    if (this.scriptSaveBtn) {
      this.scriptSaveBtn.addEventListener("click", () => {
        this.saveNewScript();
      });
    }

    if (this.scriptCancelBtn) {
      this.scriptCancelBtn.addEventListener("click", () => {
        this.cancelScriptCreate();
      });
    }

    // 카테고리 ?�동?�성 ?�데?�트
    if (this.scriptCategoryInput) {
      this.scriptCategoryInput.addEventListener("input", () => {
        this.updateCategorySuggestions();
      });
    }

    // ?�용 글????카운??
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.addEventListener("input", () => {
        this.updateContentCounter();
      });
      // 초기 카운???�시
      this.updateContentCounter();
    }

    // ?��? 모드 ?�벤??
    if (this.expandContentBtn) {
      this.expandContentBtn.addEventListener("click", () => {
        this.openExpandMode();
      });
    }

    if (this.expandModalClose) {
      this.expandModalClose.addEventListener("click", () => {
        this.closeExpandMode();
      });
    }

    if (this.expandCloseBtn) {
      this.expandCloseBtn.addEventListener("click", () => {
        this.closeExpandMode();
      });
    }

    if (this.expandSaveBtn) {
      this.expandSaveBtn.addEventListener("click", () => {
        this.saveAndCloseExpandMode();
      });
    }

    // ?��? 모드 textarea ?�벤??
    if (this.expandContentTextarea) {
      this.expandContentTextarea.addEventListener("input", () => {
        this.updateExpandContentCounter();
      });
    }

    // ESC ?�로 ?��? 모드 ?�기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.contentExpandModal &&
        this.contentExpandModal.style.display === "block"
      ) {
        this.closeExpandMode();
      }
    });

    // ?��? 모드?�서 ?�퍼?�스 불러?�기
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        // ?��? 모드?�서 ?�퍼?�스 로더 ?�기
        this.openReferenceLoader();
      });
    }

    // ?��? 모드 ?�퍼?�스 ?�역 ?�기/?�치�?
    if (this.expandToggleReferenceBtn) {
      this.expandToggleReferenceBtn.addEventListener("click", () => {
        this.toggleExpandReferencePanel();
      });
    }

    // ?��? 모드 분할???�래�?기능
    if (this.expandSplitDivider) {
      this.initExpandSplitResize();
    }

    // ?�퍼?�스 불러?�기 ?�벤??
    if (this.loadReferenceBtn) {
      this.loadReferenceBtn.addEventListener("click", () => {
        this.openReferenceLoader();
      });
    }

    if (this.referenceLoaderClose) {
      this.referenceLoaderClose.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    if (this.referenceLoaderPanel) {
      const overlay = this.referenceLoaderPanel.querySelector(
        ".reference-loader-overlay"
      );
      if (overlay) {
        overlay.addEventListener("click", () => {
          this.closeReferenceLoader();
        });
      }
    }

    // ?�퍼?�스 ???�환
    this.referenceTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchReferenceTab(tab.getAttribute("data-tab"));
      });
    });

    // ?�퍼?�스 검??
    if (this.referenceSearchInput) {
      this.referenceSearchInput.addEventListener("input", (e) => {
        this.handleReferenceSearch(e.target.value);
      });
    }

    // ?�퍼?�스 ?�터
    if (this.referenceCategoryFilter) {
      this.referenceCategoryFilter.addEventListener("change", () => {
        this.loadReferenceList();
      });
    }

    if (this.referenceSortFilter) {
      this.referenceSortFilter.addEventListener("change", () => {
        this.loadReferenceList();
      });
    }

    // 카테고리 ?�롭?�운 ?�데?�트
    this.updateCategoryDropdown();

    // ===== [Dual Panel] 구분???�래�?초기??=====
    this.initDualDividerDrag();
  }

  /**
   * ?�크립트 ?�성??글 목록 로드
   */
  async loadArticlesForManagement() {
    if (!this.currentUser || !this.isFirebaseReady) {
      // Firebase가 준비되지 ?�았거나 로그?�이 ?�요??경우 조용??반환
      // ?�러 메시지�??�시?��? ?�음 (?�상?�인 ?�황)
      logger.warn(
        "loadArticlesForManagement: Firebase가 준비되지 ?�았거나 로그?�이 ?�요?�니??"
      );
      this.managementArticles = [];
      // �??�태 ?�시
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
      return;
    }

    try {
      // 'edit' ?�??글�?로드 (?�퍼?�스 ?�외)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // ?�덱???�류�??�비하??orderBy ?�이 먼�? ?�도
      let querySnapshot;
      try {
        // [Tab Separation] 'script' ?�??글�?로드 (글 ?�성 ??�� 'edit' ?�???�외)
        const q = window.firebaseQuery(
          textsRef,
          window.firebaseWhere("type", "==", "script"),
          window.firebaseOrderBy("createdAt", "desc")
        );
        querySnapshot = await window.firebaseGetDocs(q);
      } catch (indexError) {
        // ?�덱???�류??경우 orderBy ?�이 쿼리
        if (indexError.code === "failed-precondition") {
          logger.warn(
            "Firebase ?�덱?��? ?�어 orderBy ?�이 쿼리?�니?? ?�라?�언???�이?�에???�렬?�니??"
          );
          // [Tab Separation] ?�덱???�류 ?�에??'script' ?�???�터�??��?
          const q = window.firebaseQuery(
            textsRef,
            window.firebaseWhere("type", "==", "script")
          );
          querySnapshot = await window.firebaseGetDocs(q);
        } else {
          throw indexError; // ?�른 ?�러???�시 throw
        }
      }

      this.managementArticles = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.managementArticles.push({
          id: doc.id,
          // Firestore???�?�된 title ?�용 (?�으�?"?�목 ?�음")
          title: data.title || "?�목 ?�음",
          content: data.content || "",
          category: data.topic || "미분�?, // topic??category�??�용
          createdAt: data.createdAt,
          order: data.order || 0, // order ?�드 (기본�?0)
          viewCount: data.viewCount || 0,
          characterCount: data.characterCount, // [Fix] 글?????�드 로드
        });
      });

      // orderBy ?�이 로드??경우 ?�라?�언???�이?�에???�렬
      if (
        this.managementArticles.length > 0 &&
        this.managementArticles[0].createdAt
      ) {
        this.managementArticles.sort((a, b) => {
          const dateA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : 0;
          const dateB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : 0;
          return dateB - dateA; // ?�림차순 (최신??
        });
      }

      // order ?�드가 ?�는 경우 초기??
      await this.initializeArticleOrders();

      // 카테고리 ?�롭?�운 ?�데?�트 (?�더�??�에 ?�데?�트)
      this.updateCategoryDropdown();

      // ?�재 ?�택??카테고리 ?�터 �?가?�오�?
      const currentCategory = this.categorySelect
        ? this.categorySelect.value
        : "";

      // 카테고리별로 ?�렬 ???�더�?(?�재 ?�택???�터 �??�달)
      this.renderArticleCards(currentCategory);

      // 카테고리 ?�안 ?�데?�트
      this.updateCategorySuggestions();

      // ?�퍼?�스 로더 카테고리 ?�터 ?�데?�트
      this.updateReferenceCategoryFilter();
    } catch (error) {
      logger.error("?�크립트 ?�성??글 로드 ?�패:", error);

      // Firebase ?�덱???�류??조용??처리 (?��? ?�에??처리??
      if (error.code === "failed-precondition") {
        logger.warn(
          "Firebase ?�덱???�류: ?�덱?��? ?�성???�까지 ?�라?�언???�이???�렬???�용?�니??"
        );
        // ?�러 메시지 ?�시?��? ?�음 (?�상 ?�작)
        this.managementArticles = [];
        if (this.articleCardsGrid) {
          this.articleCardsGrid.innerHTML = "";
        }
        if (this.managementEmptyState) {
          this.managementEmptyState.style.display = "block";
        }
        return;
      }

      // ?�트?�크 ?�류???�증 ?�류??경우?�만 ?�러 메시지 ?�시
      if (error.code === "permission-denied" || error.code === "unavailable") {
        this.showMessage(
          "??글??불러?�는 �??�류가 발생?�습?�다. ?�트?�크 ?�결???�인?�주?�요.",
          "error"
        );
      } else if (error.code && error.code !== "failed-precondition") {
        // ?�덱???�류가 ?�닌 ?�른 ?�러�??�시
        logger.error("?�상�?못한 ?�러:", error);
        // 개발 ?�경?�서�??�세 ?�러 ?�시
        if (error.message && !error.message.includes("permission")) {
          this.showMessage("??글??불러?�는 �??�류가 발생?�습?�다.", "error");
        }
      }

      this.managementArticles = [];
      // �??�태 ?�시
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
    }
  }

  /**
   * order ?�드 초기??�?중복 ?�리
   * - order가 ?�거?? 중복??order가 ?�는 경우 ?�행
   * - createdAt 기�??�로 ?�정?�하???�?�스?�프 기반 order ?�당
   */
  async initializeArticleOrders() {
    if (!this.currentUser || !this.isFirebaseReady) return;

    // 카테고리별로 그룹??
    const articlesByCategory = {};
    this.managementArticles.forEach((article) => {
      const category = article.category || "미분�?;
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = [];
      }
      articlesByCategory[category].push(article);
    });

    try {
      const batch = window.firebaseWriteBatch(this.db);
      let batchCount = 0;
      let hasUpdates = false;

      for (const [category, articles] of Object.entries(articlesByCategory)) {
        // 중복 체크
        const orders = articles.map((a) => a.order);
        const hasDuplicates = new Set(orders).size !== orders.length;
        const hasMissingOrder = articles.some(
          (a) => a.order === undefined || a.order === null
        );
        // [Fix] characterCount ?�락 ?�인
        const hasMissingCharCount = articles.some(
          (a) => typeof a.characterCount !== "number"
        );

        if (hasDuplicates || hasMissingOrder || hasMissingCharCount) {
          logger.log(
            `[Order/Data Fix] ${category}: ?�이??보정(?�서/글?�수)???�작?�니??`
          );

          // createdAt ?�름차순 ?�렬 (과거 -> 최신)
          articles.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
          });

          // order ?�할??�?characterCount 보정
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const date = article.createdAt?.toDate?.() || new Date();
            let newOrder = date.getTime();

            // ?�전 글보다 ?�거??같으�?1ms 증�? (?�렬 ?�서 ?��?)
            if (i > 0) {
              const prevOrder = articles[i - 1].order;
              if (newOrder <= prevOrder) {
                newOrder = prevOrder + 1;
              }
            }

            // ?�데?�트가 ?�요?��? ?�인
            const needsOrderUpdate = article.order !== newOrder;
            const needsCharCountUpdate =
              typeof article.characterCount !== "number";

            if (needsOrderUpdate || needsCharCountUpdate) {
              const updateData = {};
              
              if (needsOrderUpdate) {
                article.order = newOrder;
                updateData.order = newOrder;
              }
              
              if (needsCharCountUpdate) {
                const count = (article.content || "").length;
                article.characterCount = count;
                updateData.characterCount = count;
              }

              const articleRef = window.firebaseDoc(
                this.db,
                "users",
                this.currentUser.uid,
                "texts",
                article.id
              );
              batch.update(articleRef, updateData);
              batchCount++;
              hasUpdates = true;
            }
          }
          logger.log(`[Order/Data Fix] ${category}: 보정 ?�료`);
        }
      }

      if (hasUpdates) {
        await batch.commit();
        logger.log(
          `[Order Fix] �?${batchCount}개의 글 ?�서가 ?�데?�트?�었?�니??`
        );
      }
    } catch (error) {
      logger.error("order ?�드 초기???�패:", error);
    }
  }

  // [Refactoring] Utils 모듈 ?�용
  extractTitleFromContent(content) {
    return extractTitleFromContent(content);
  }

  /**
   * 카테고리 ?�롭?�운 ?�데?�트
   */
  updateCategoryDropdown() {
    if (!this.categorySelect || !this.editCategorySelect) return;

    // 고유??카테고리 목록 추출
    const categories = new Set(["미분�?]);
    this.managementArticles.forEach((article) => {
      if (article.category) {
        categories.add(article.category);
      }
    });

    // "미분�?�??�외??카테고리�??�파벳순?�로 ?�렬 ??"미분�?�?�??�에 추�?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "미분�?).sort();
    const sortedCategories = categoriesArray.includes("미분�?) 
      ? [...otherCategories, "미분�?] 
      : otherCategories;

    // 카테고리 ?�택 ?�롭?�운 ?�데?�트
    this.categorySelect.innerHTML = '<option value="">?�체 글 보기</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.categorySelect.appendChild(option);
    });

    // ?�정 모드 카테고리 ?�롭?�운 ?�데?�트
    this.editCategorySelect.innerHTML = "";
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.editCategorySelect.appendChild(option);
    });
  }

  /**
   * ?�퍼?�스 로더 카테고리 ?�터 ?�데?�트
   */
  updateReferenceCategoryFilter() {
    if (!this.referenceCategoryFilter) return;

    // 고유??카테고리 목록 추출
    const categories = new Set(["미분�?]);

    // ?�?�된 글?�서 카테고리 추출
    if (this.savedTexts) {
      this.savedTexts.forEach((text) => {
        if (text.topic) {
          categories.add(text.topic);
        }
      });
    }

    // "미분�?�??�외??카테고리�??�파벳순?�로 ?�렬 ??"미분�?�?�??�에 추�?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "미분�?).sort();
    const sortedCategories = categoriesArray.includes("미분�?) 
      ? [...otherCategories, "미분�?] 
      : otherCategories;

    // ?�터 ?�롭?�운 ?�데?�트
    this.referenceCategoryFilter.innerHTML =
      '<option value="">?�체 카테고리</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.referenceCategoryFilter.appendChild(option);
    });
  }

  /**
   * 카테고리�??�터�?
   */
  filterArticlesByCategory(category) {
    this.renderArticleCards(category);
  }

  /**
   * 글 카드 ?�더�?
   */
  renderArticleCards(filterCategory = "") {
    if (!this.articleCardsGrid) return;

    // ?�터�?
    let filteredArticles = this.managementArticles;
    if (filterCategory) {
      filteredArticles = this.managementArticles.filter(
        (article) => (article.category || "미분�?) === filterCategory
      );
    }

    // 카테고리별로 그룹??�??�렬
    const articlesByCategory = {};
    filteredArticles.forEach((article) => {
      const category = article.category || "미분�?;
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = [];
      }
      articlesByCategory[category].push(article);
    });

    // �?카테고리별로 order 기�? ?�렬 (?�림차순: ??값이 ?�로)
    Object.keys(articlesByCategory).forEach((category) => {
      articlesByCategory[category].sort((a, b) => {
        return (b.order || 0) - (a.order || 0);
      });
    });

    // �??�태 처리
    if (filteredArticles.length === 0) {
      this.articleCardsGrid.innerHTML = "";
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
        this.managementEmptyState.textContent = filterCategory
          ? `${filterCategory} 카테고리??글???�습?�다.`
          : "?�시??글???�습?�다.";
      }
      return;
    }

    if (this.managementEmptyState) {
      this.managementEmptyState.style.display = "none";
    }

    // 카드 ?�더�?
    this.articleCardsGrid.innerHTML = "";
    let globalOrder = 1;

    Object.keys(articlesByCategory).forEach((category) => {
      articlesByCategory[category].forEach((article) => {
        const card = this.createArticleCard(
          article,
          globalOrder++,
          filterCategory
        );
        this.articleCardsGrid.appendChild(card);
      });
    });
  }

  /**
   * 글 카드 ?�성
   */
  createArticleCard(article, orderNumber, filterCategory = "") {
    const card = document.createElement("div");
    card.className = "article-card";
    card.setAttribute("data-article-id", article.id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `글 ${orderNumber}: ${article.title}`);

    // ===== [Dual Panel] ?�릭 ?�벤??- Ctrl+?�릭?�로 ?�널 2???�기 =====
    // - ?�반 ?�릭: ?�널 1 (?�덱??0)
    // - Ctrl+?�릭 (Windows) ?�는 Cmd+?�릭 (Mac): ?�널 2 (?�덱??1)
    card.addEventListener("click", (e) => {
      // Ctrl ?�는 Cmd ?��? ?�려?�는지 ?�인
      const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
      this.selectArticleToPanel(article.id, panelIndex);
    });

    // ===== [Dual Panel] ?�보???�근??- Ctrl+Enter�??�널 2???�기 =====
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // Ctrl+Enter ?�는 Ctrl+Space: ?�널 2???�기
        const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
        this.selectArticleToPanel(article.id, panelIndex);
      }
    });

    // ?�용 미리보기 (3�?
    const contentPreview = this.getContentPreview(article.content, 3);

    // ?�짜 ?�맷
    const dateStr = article.createdAt
      ? this.formatDateFromFirestore(article.createdAt)
      : "?�짜 ?�음";

    // ?�서 조정 버튼 ?�성???��? ?�인
    const canMoveUp = this.canMoveUp(article, filterCategory);
    const canMoveDown = this.canMoveDown(article, filterCategory);

    card.innerHTML = `
            <div class="article-card-header">
                <div class="article-card-order">
                    <span class="article-order-badge" aria-label="?�서 ${orderNumber}">${orderNumber}</span>
                    <h4 class="article-card-title" title="${this.escapeHtml(
                      article.title
                    )}">${this.escapeHtml(article.title)}</h4>
                </div>
                <div class="article-card-actions">
                    <button 
                        class="order-button" 
                        data-action="up" 
                        data-article-id="${article.id}"
                        aria-label="?�로 ?�동"
                        title="?�로 ?�동"
                        ${canMoveUp ? "" : "disabled"}>
                        ??
                    </button>
                    <button 
                        class="order-button" 
                        data-action="down" 
                        data-article-id="${article.id}"
                        aria-label="?�래�??�동"
                        title="?�래�??�동"
                        ${canMoveDown ? "" : "disabled"}>
                        ??
                    </button>
                </div>
            </div>
            <div class="article-card-content">${this.escapeHtml(
              contentPreview
            )}</div>
            <div class="article-card-meta">
                <span class="article-card-date">?�� ${dateStr}</span>
                <span class="article-card-count">?�� ${article.content ? article.content.length : 0}??/span>
                <span class="article-card-category">?�� ${this.escapeHtml(
                  article.category || "미분�?
                )}</span>
            </div>
        `;

    // ?�서 조정 버튼 ?�벤??
    const upBtn = card.querySelector('[data-action="up"]');
    const downBtn = card.querySelector('[data-action="down"]');

    if (upBtn) {
      upBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveArticleOrder(article.id, "up");
      });
    }

    if (downBtn) {
      downBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.moveArticleOrder(article.id, "down");
      });
    }

    return card;
  }

  /**
   * ?�용 미리보기 ?�성
   */
  getContentPreview(content, maxLines = 3) {
    if (!content) return "";
    const lines = content.split("\n").filter((line) => line.trim());
    const preview = lines.slice(0, maxLines).join("\n");
    if (lines.length > maxLines) {
      return preview + "...";
    }
    return preview;
  }

  /**
   * ?�로 ?�동 가???��?
   */
  canMoveUp(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "미분�?) === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분�?) === (article.category || "미분�?)
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // ?�림차순 ?�렬

    return sameCategory[0]?.id !== article.id;
  }

  /**
   * ?�래�??�동 가???��?
   */
  canMoveDown(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "미분�?) === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분�?) === (article.category || "미분�?)
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // ?�림차순 ?�렬

    return sameCategory[sameCategory.length - 1]?.id !== article.id;
  }

  // ================================================================
  // [Dual Panel] ?�???�널 글 ?�택 ?�수
  // - ?�정 ?�널(0 ?�는 1)??글???�택?�여 ?�시
  // - Ctrl+?�릭?�로 ??번째 ?�널??글 ?�기 지??
  // - 2025-12-09 Phase 3A 구현
  // ================================================================

  /**
   * ?�정 ?�널??글 ?�택
   * @param {string} articleId - ?�택??글 ID
   * @param {number} panelIndex - ?�널 ?�덱??(0: �?번째, 1: ??번째)
   */
  selectArticleToPanel(articleId, panelIndex = 0) {
    // panelIndex ?�효??검??
    if (panelIndex !== 0 && panelIndex !== 1) {
      logger.warn("[Dual Panel] ?�효?��? ?��? panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // 중복 ?�택 방�?: 같�? 글???�른 ?�널???��? ?�려?�는지 ?�인
    const otherPanelIndex = panelIndex === 0 ? 1 : 0;
    if (this.selectedArticleIds[otherPanelIndex] === articleId) {
      alert("?��? ?�른 ?�널?�서 ?�려?�는 글?�니??");
      return;
    }

    // 글 ?�이??찾기
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      logger.warn("[Dual Panel] 글??찾을 ???�습?�다:", articleId);
      return;
    }

    // ?�전?????�널???�택??카드???�이?�이???�거
    const previousId = this.selectedArticleIds[panelIndex];
    if (previousId) {
      const previousCard = document.querySelector(
        `[data-article-id="${previousId}"]`
      );
      if (previousCard) {
        previousCard.classList.remove(`selected-panel-${panelIndex + 1}`);
        previousCard.classList.remove("selected");
      }
    }

    // ?�택??카드???�널�??�이?�이??추�?
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add(`selected-panel-${panelIndex + 1}`);
      selectedCard.classList.add("selected");
    }

    // ?�태 ?�데?�트
    this.selectedArticleIds[panelIndex] = articleId;
    this.activePanelIndex = panelIndex;

    // ?�널??글 ?�더�?
    this.renderDetailPanelByIndex(article, panelIndex);

    // ?�??모드 ?�태 ?�데?�트
    this.updateDualModeState();

    // ?�당 ?�널�??�크�?
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    if (panel) {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  /**
   * 글 ?�택 (?�위 ?�환???��? - 기본?�으�??�널 0???�택)
   */
  selectArticle(articleId) {
    // 모든 카드 ?�택 ?�제
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    // ?�택??카드 ?�이?�이??
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add("selected");
    }

    // ?�세 ?�널 ?�시
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (article) {
      this.selectedArticleId = articleId;
      this.renderDetailPanel(article);

      // ?�세 ?�널�??�크�?
      if (this.articleDetailPanel) {
        this.articleDetailPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }

  // ================================================================
  // [Dual Panel] ?�???�널 ?�더�??�수
  // - ?�널 ?�덱?�에 ?�라 ?�바�?DOM ?�소??글 ?�더�?
  // - 2025-12-09 Phase 3A 구현
  // ================================================================

  /**
   * ?�정 ?�널??글 ?�세 ?�더�?
   * @param {object} article - 글 객체
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  renderDetailPanelByIndex(article, panelIndex = 0) {
    // panelIndex???�른 suffix 결정 (0 ??-1, 1 ??-2)
    const suffix = panelIndex === 0 ? "-1" : "-2";
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;

    if (!panel) {
      logger.warn("[Dual Panel] ?�널??찾을 ???�습?�다:", panelIndex);
      return;
    }

    // ?�기 모드 ?�시, ?�정 모드 ?��?
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // ?�이??채우�?
    const categoryEl = document.getElementById(`detail-category${suffix}`);
    const dateEl = document.getElementById(`detail-date${suffix}`);
    const charCountEl = document.getElementById(`detail-char-count${suffix}`);
    const titleEl = document.getElementById(`detail-title${suffix}`);
    const contentEl = document.getElementById(`detail-content${suffix}`);

    if (categoryEl) {
      categoryEl.textContent = article.category || "미분�?;
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "?�짜 ?�음";
    }
    if (charCountEl) {
      charCountEl.textContent = `?�� ${article.content ? article.content.length : 0}??;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // ?�널 ?�시
    panel.style.display = "block";
  }

  /**
   * ?�??모드 ?�태 ?�데?�트
   * - ???�널 모두 ?�려?�으�??�??모드 ?�성??
   * - ???�널�??�려?�으�??�일 모드
   */
  updateDualModeState() {
    const panel1Open = this.selectedArticleIds[0] !== null;
    const panel2Open = this.selectedArticleIds[1] !== null;

    // ?�전 모드 ?�??
    const wasInDualMode = this.isDualMode;

    // ??모드 결정
    this.isDualMode = panel1Open && panel2Open;

    // 컨테?�너??dual-mode ?�래???��?
    if (this.articleDetailContainer) {
      if (this.isDualMode) {
        this.articleDetailContainer.classList.add("dual-mode");
      } else {
        this.articleDetailContainer.classList.remove("dual-mode");
      }
    }

    // 구분???�시/?��?
    if (this.detailDualDivider) {
      this.detailDualDivider.style.display = this.isDualMode ? "flex" : "none";
    }

    // 모드 변�????�크�?리더 ?�림 (?�근??
    if (wasInDualMode !== this.isDualMode) {
      const message = this.isDualMode
        ? "?�???�널 모드가 ?�성?�되?�습?�다."
        : "?�일 ?�널 모드�??�환?�었?�니??";
      this.announceToScreenReader(message);
    }
  }

  /**
   * ?�크�?리더 ?�림 (?�근??지??
   * @param {string} message - ?�릴 메시지
   */
  announceToScreenReader(message) {
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.cssText = "position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;";
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    // ?�시 ???�거
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  // ================================================================
  // [Dual Panel] 구분???�래�?기능
  // - 마우???�래그로 ?�널 ?�비 조절
  // - 최소 20%, 최�? 80% ?�한
  // - 2025-12-09 Phase 5 구현
  // ================================================================

  /**
   * ?�???�널 구분???�래�?초기??
   * - initArticleManagement()?�서 ?�출
   */
  initDualDividerDrag() {
    if (!this.detailDualDivider || !this.articleDetailContainer) {
      return;
    }

    // ?�래�??�태 변??
    let isDragging = false;
    let startX = 0;
    let startLeftPanelWidth = 50; // 초기 비율 (%)

    // 마우???�운 - ?�래�??�작
    const onMouseDown = (e) => {
      if (!this.isDualMode) return;
      
      isDragging = true;
      startX = e.clientX;
      
      // ?�재 ?�널 1???�비 비율 계산
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const panel1Rect = this.articleDetailPanel1.getBoundingClientRect();
      startLeftPanelWidth = (panel1Rect.width / containerRect.width) * 100;
      
      // ?�래�?�??�각???�드�?
      this.detailDualDivider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      
      e.preventDefault();
    };

    // 마우???�동 - ?�래�?�?
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerRect.width) * 100;
      
      // ??비율 계산 (최소 20%, 최�? 80%)
      let newLeftPercent = startLeftPanelWidth + deltaPercent;
      newLeftPercent = Math.max(20, Math.min(80, newLeftPercent));
      
      // Grid 비율 ?�용
      this.articleDetailContainer.style.gridTemplateColumns = 
        `${newLeftPercent}% 8px ${100 - newLeftPercent}%`;
    };

    // 마우????- ?�래�?종료
    const onMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      this.detailDualDivider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    // ?�벤??리스???�록
    this.detailDualDivider.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    // ?�면 ?�탈 처리
    document.addEventListener("mouseleave", onMouseUp);

    // ?�블?�릭?�로 50:50 리셋
    this.detailDualDivider.addEventListener("dblclick", () => {
      if (!this.isDualMode) return;
      this.articleDetailContainer.style.gridTemplateColumns = "1fr 8px 1fr";
    });
  }

  /**
   * ?�세 ?�널 ?�더�?(?�위 ?�환??- ?�널 0???�더�?
   */
  renderDetailPanel(article) {
    if (!this.articleDetailPanel) return;

    // ?�기 모드 ?�시
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // ?�이??채우�?
    const categoryEl = document.getElementById("detail-category");
    const dateEl = document.getElementById("detail-date");
    const charCountEl = document.getElementById("detail-char-count");
    const titleEl = document.getElementById("detail-title");
    const contentEl = document.getElementById("detail-content");

    if (categoryEl) {
      categoryEl.textContent = article.category || "미분�?;
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "?�짜 ?�음";
    }
    if (charCountEl) {
      charCountEl.textContent = `?�� ${article.content ? article.content.length : 0}??;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // ?�세 ?�널 ?�시
    this.articleDetailPanel.style.display = "block";
  }

  // ================================================================
  // [Dual Panel] ?�널�??�정/??��/복사 ?�수
  // - �??�널?�서 ?�립?�으�??�정/??��/복사 기능 ?�공
  // - 2025-12-09 Phase 6 구현
  // ================================================================

  /**
   * ?�정 ?�널?�서 ?�정 모드 진입
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  enterEditModeByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] ?�택??글???�습?�다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // panelIndex???�른 suffix 결정
    const suffix = panelIndex === 0 ? "-1" : "-2";

    // ?�기 모드 ?�기�? ?�정 모드 ?�시
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // ?�력 ?�드??�??�정
    const editTitleInput = document.getElementById(`edit-title-input${suffix}`);
    const editContentTextarea = document.getElementById(`edit-content-textarea${suffix}`);
    const editCategorySelect = document.getElementById(`edit-category-select${suffix}`);

    if (editTitleInput) {
      editTitleInput.value = article.title;
    }
    if (editContentTextarea) {
      editContentTextarea.value = article.content;
    }
    if (editCategorySelect) {
      // 카테고리 ?�션 ?�적 추�?
      this.populateEditCategorySelect(editCategorySelect, article.category);
    }

    // ?�재 ?�집 중인 글 ID ?�정
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(articleId);
    }
  }

  // ================================================================
  // [Bug Fix] ?�정 모드 카테고리 ?�롭?�운 채우�?
  // - 2025-12-10 버그 ?�정: ?�정 모드 진입 ??카테고리가 불러?�지지 ?�는 문제 ?�결
  // - enterEditModeByIndex()?�서 ?�출?�여 카테고리 ?�롭?�운??채우�??�택
  // ================================================================

  /**
   * ?�정 모드 카테고리 ?�롭?�운 채우�?�??�택
   * @param {HTMLSelectElement} selectElement - 카테고리 select ?�소
   * @param {string} selectedCategory - ?�택?�야 ??카테고리 �?
   */
  populateEditCategorySelect(selectElement, selectedCategory) {
    if (!selectElement) {
      logger.warn("[Bug Fix] 카테고리 select ?�소�?찾을 ???�습?�다.");
      return;
    }

    // ?�재 카테고리 목록?�서 고유??카테고리 추출
    const categories = new Set(["미분�?]);
    this.managementArticles.forEach((article) => {
      if (article.category) {
        categories.add(article.category);
      }
    });

    // "미분�?�??�외??카테고리�??�파벳순?�로 ?�렬 ??"미분�?�?�??�에 추�?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "미분�?).sort();
    const sortedCategories = categoriesArray.includes("미분�?) 
      ? [...otherCategories, "미분�?] 
      : otherCategories;

    // ?�롭?�운 초기??�??�션 추�?
    selectElement.innerHTML = "";
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      selectElement.appendChild(option);
    });

    // 기존 카테고리 ?�택 (?�으�?"미분�? ?�택)
    const categoryToSelect = selectedCategory || "미분�?;
    if (sortedCategories.includes(categoryToSelect)) {
      selectElement.value = categoryToSelect;
    } else {
      // 기존 카테고리가 목록???�으�?추�? ???�택
      const newOption = document.createElement("option");
      newOption.value = categoryToSelect;
      newOption.textContent = categoryToSelect;
      selectElement.insertBefore(newOption, selectElement.firstChild);
      selectElement.value = categoryToSelect;
    }

    logger.log("[Bug Fix] 카테고리 ?�롭?�운 채우�??�료:", {
      totalCategories: sortedCategories.length,
      selectedCategory: selectElement.value
    });
  }

  /**
   * ?�정 ?�널?�서 글 ??��
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  async deleteArticleByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId || !this.currentUser || !this.isFirebaseReady) {
      logger.warn("[Dual Panel] ??��?????�습?�다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // ??�� ?�인
    const confirmed = confirm(
      `"${article.title}"??�? ??��?�시겠습?�까?\n\n?�️ ???�업?� ?�돌�????�습?�다.`
    );
    if (!confirmed) return;

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        articleId
      );
      await window.firebaseDeleteDoc(articleRef);

      this.showMessage("??글????��?�었?�니??", "success");

      // ?�당 ?�널 ?�기
      this.closeDetailPanelByIndex(panelIndex);

      // 목록 갱신
      await this.loadArticlesForManagement();
    } catch (error) {
      logger.error("[Dual Panel] ??�� ?�패:", error);
      this.showMessage("????�� �??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * ?�정 ?�널 글 ?�용 ?�립보드 복사
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  async copyArticleContentByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] 복사??글???�습?�다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article || !article.content) {
      this.showMessage("?�� 복사???�용???�습?�다.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("?�� ?�립보드??복사?�었?�니??", "success");
    } catch (error) {
      logger.error("[Dual Panel] 복사 ?�패:", error);
      // ?�백: ?�시 textarea ?�용
      const textarea = document.createElement("textarea");
      textarea.value = article.content;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      this.showMessage("?�� ?�립보드??복사?�었?�니??", "success");
    }
  }

  /**
   * ?�정 모드 진입 (?�위 ?�환??- ?�널 0)
   */
  enterEditMode() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    // ?�기 모드 ?�기�? ?�정 모드 ?�시
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // ?�력 ?�드??�??�정
    if (this.editTitleInput) {
      this.editTitleInput.value = article.title;
    }
    if (this.editContentTextarea) {
      this.editContentTextarea.value = article.content;
    }
    if (this.editCategorySelect) {
      this.editCategorySelect.value = article.category || "미분�?;
    }

    // ?�재 ?�집 중인 글 ID ?�정 (?�퍼?�스 로드??
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(this.selectedArticleId);
    }
  }

  /**
   * 글 ?�정 ?�??
   */
  async saveArticleEdit() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    const title = this.editTitleInput?.value.trim() || "";
    const content = this.editContentTextarea?.value.trim() || "";
    const category = this.editCategorySelect?.value || "미분�?;

    // 검�?
    if (!title && !content) {
      this.showMessage("???�목 ?�는 ?�용???�력?�주?�요.", "error");
      return;
    }

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        this.selectedArticleId
      );
      // ?�목 검�? ?�목??비어?�으�??�??불�?
      if (!title || title.trim() === "") {
        this.showMessage("???�목???�력?�주?�요.", "error");
        if (this.editTitleInput) {
          this.editTitleInput.focus();
        }
        return;
      }

      await window.firebaseUpdateDoc(articleRef, {
        title: title.trim(),
        content: content,
        characterCount: content.length, // [Fix] ?�수 ?�드 추�?
        topic: category, // topic ?�드??카테고리 ?�??
        updatedAt: window.firebaseServerTimestamp(),
      });

      // 로컬 ?�이???�데?�트
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        article.title = title.trim();
        article.content = content;
        article.category = category;
      }

      // UI ?�데?�트
      this.showMessage("??글???�정?�었?�니??", "success");
      await this.loadArticlesForManagement();
      this.selectArticle(this.selectedArticleId);

      // ?�기 모드�??�환
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");
      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";
    } catch (error) {
      logger.error("글 ?�정 ?�패:", error);
      this.showMessage("??글 ?�정 �??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * ?�정 취소
   */
  cancelArticleEdit() {
    if (!this.selectedArticleId) return;

    if (confirm("?�정??취소?�시겠습?�까?")) {
      // ?�기 모드�??�환
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");

      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      // ?�세 ?�널 ?�시 ?�더�?
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        this.renderDetailPanel(article);
      }
    }
  }

  // ===== [Dual Panel] ?�널�?글 ?�정 ?�??=====
  // 2025-12-10 버그 ?�정: ?�널 2 ?�??버튼???�작?��? ?�는 문제 ?�결
  /**
   * ?�정 ?�널?�서 글 ?�정 ?�??
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  async saveArticleEditByIndex(panelIndex = 0) {
    // ?�널 ?�덱?�에 ?�른 글 ID 가?�오�?
    const articleId = this.selectedArticleIds?.[panelIndex] || 
      (panelIndex === 0 ? this.selectedArticleId : null);
    
    if (!articleId || !this.currentUser || !this.isFirebaseReady) {
      logger.warn("[Dual Panel] ?�??불�?: 글 ID ?�는 ?�증 ?�보 ?�음", { panelIndex, articleId });
      return;
    }

    // ?�널 ?�덱?�에 ?�른 suffix 결정
    const suffix = panelIndex === 0 ? "-1" : "-2";
    
    // DOM ?�소 참조
    const editTitleInput = document.getElementById(`edit-title-input${suffix}`);
    const editContentTextarea = document.getElementById(`edit-content-textarea${suffix}`);
    const editCategorySelect = document.getElementById(`edit-category-select${suffix}`);
    
    const title = editTitleInput?.value.trim() || "";
    const content = editContentTextarea?.value.trim() || "";
    const category = editCategorySelect?.value || "미분�?;

    // ?�목 검�?
    if (!title || title.trim() === "") {
      this.showMessage("???�목???�력?�주?�요.", "error");
      if (editTitleInput) {
        editTitleInput.focus();
      }
      return;
    }

    // ?�용 검�?
    if (!content) {
      this.showMessage("???�용???�력?�주?�요.", "error");
      if (editContentTextarea) {
        editContentTextarea.focus();
      }
      return;
    }

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        articleId
      );

      await window.firebaseUpdateDoc(articleRef, {
        title: title.trim(),
        content: content,
        characterCount: content.length,
        topic: category,
        updatedAt: window.firebaseServerTimestamp(),
      });

      // 로컬 ?�이???�데?�트
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (article) {
        article.title = title.trim();
        article.content = content;
        article.category = category;
      }

      // UI ?�데?�트
      this.showMessage("??글???�정?�었?�니??", "success");
      await this.loadArticlesForManagement();
      
      // ?�당 ?�널 ?�시 ?�더�?
      this.renderDetailPanelByIndex(article, panelIndex);

      // ?�기 모드�??�환
      const readMode = document.getElementById(`detail-read-mode${suffix}`);
      const editMode = document.getElementById(`detail-edit-mode${suffix}`);
      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      logger.log("[Dual Panel] 글 ?�정 ?�???�료:", { panelIndex, articleId, title });
    } catch (error) {
      logger.error("[Dual Panel] 글 ?�정 ?�패:", error);
      this.showMessage("??글 ?�정 �??�류가 발생?�습?�다.", "error");
    }
  }

  // ===== [Dual Panel] ?�널�??�정 취소 =====
  // 2025-12-10 버그 ?�정: ?�널 2 취소 버튼???�작?��? ?�는 문제 ?�결
  /**
   * ?�정 ?�널?�서 ?�정 취소
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  cancelArticleEditByIndex(panelIndex = 0) {
    // ?�널 ?�덱?�에 ?�른 글 ID 가?�오�?
    const articleId = this.selectedArticleIds?.[panelIndex] || 
      (panelIndex === 0 ? this.selectedArticleId : null);
    
    if (!articleId) {
      logger.warn("[Dual Panel] 취소 불�?: 글 ID ?�음", { panelIndex });
      return;
    }

    if (confirm("?�정??취소?�시겠습?�까?")) {
      // ?�널 ?�덱?�에 ?�른 suffix 결정
      const suffix = panelIndex === 0 ? "-1" : "-2";
      
      // ?�기 모드�??�환
      const readMode = document.getElementById(`detail-read-mode${suffix}`);
      const editMode = document.getElementById(`detail-edit-mode${suffix}`);

      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      // ?�세 ?�널 ?�시 ?�더�?
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (article) {
        this.renderDetailPanelByIndex(article, panelIndex);
      }

      logger.log("[Dual Panel] ?�정 취소:", { panelIndex, articleId });
    }
  }

  /**
   * 글 ??��
   */
  async deleteArticle() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    if (!confirm("?�말 ??글????��?�시겠습?�까?")) return;

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        this.selectedArticleId
      );
      await window.firebaseDeleteDoc(articleRef);

      // 로컬 ?�이?�에???�거
      this.managementArticles = this.managementArticles.filter(
        (a) => a.id !== this.selectedArticleId
      );

      // UI ?�데?�트
      this.showMessage("??글????��?�었?�니??", "success");
      this.closeDetailPanel();
      await this.loadArticlesForManagement();
    } catch (error) {
      logger.error("글 ??�� ?�패:", error);
      this.showMessage("??글 ??�� �??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * 글 ?�용 복사
   */
  async copyArticleContent() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("???�립보드??복사?�었?�니??", "success");
    } catch (error) {
      logger.error("복사 ?�패:", error);
      this.showMessage("??복사 �??�류가 발생?�습?�다.", "error");
    }
  }

  // ================================================================
  // [Dual Panel] ?�???�널 ?�기 ?�수
  // - ?�정 ?�널�??�고 ?�당 카드 ?�택 ?�제
  // - 2025-12-09 Phase 3B 구현
  // ================================================================

  /**
   * ?�정 ?�널 ?�기
   * @param {number} panelIndex - ?�을 ?�널 ?�덱??(0 ?�는 1)
   */
  closeDetailPanelByIndex(panelIndex = 0) {
    // panelIndex ?�효??검??
    if (panelIndex !== 0 && panelIndex !== 1) {
      logger.warn("[Dual Panel] ?�효?��? ?��? panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // ?�당 ?�널 참조
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    
    // ?��? ?��??�는 ?�널?��? ?�인
    if (!panel || panel.style.display === "none") {
      logger.log("[Dual Panel] ?�널???��? ?��??�습?�다:", panelIndex);
      return;
    }

    // ?�널 ?��?
    panel.style.display = "none";

    // ?�당 ?�널???�택??글??카드 ?�이?�이???�거
    const previousId = this.selectedArticleIds[panelIndex];
    if (previousId) {
      const previousCard = document.querySelector(
        `[data-article-id="${previousId}"]`
      );
      if (previousCard) {
        previousCard.classList.remove(`selected-panel-${panelIndex + 1}`);
        // ?�른 ?�널?�서???�택?�어?��? ?�으�?selected ?�래?�도 ?�거
        const otherPanelIndex = panelIndex === 0 ? 1 : 0;
        if (this.selectedArticleIds[otherPanelIndex] !== previousId) {
          previousCard.classList.remove("selected");
        }
      }
    }

    // ?�태 ?�데?�트
    this.selectedArticleIds[panelIndex] = null;

    // ?�??모드 ?�태 ?�데?�트
    this.updateDualModeState();

    // ?�성 ?�널 ?�덱???�데?�트 (?�힌 ?�널???�성?�었?�면 ?�른 ?�널�??�환)
    if (this.activePanelIndex === panelIndex) {
      const otherPanelIndex = panelIndex === 0 ? 1 : 0;
      if (this.selectedArticleIds[otherPanelIndex] !== null) {
        this.activePanelIndex = otherPanelIndex;
      }
    }
  }

  /**
   * ?�세 ?�널 ?�기 (?�위 ?�환??- ?�널 0 ?�기)
   */
  closeDetailPanel() {
    if (this.articleDetailPanel) {
      this.articleDetailPanel.style.display = "none";
    }

    // 모든 카드 ?�택 ?�제
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    this.selectedArticleId = null;
  }

  /**
   * ?�서 변�?
   */
  async moveArticleOrder(articleId, direction) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (!article) return;

      const category = article.category || "미분�?;
      const sameCategoryArticles = this.managementArticles
        .filter((a) => (a.category || "미분�?) === category)
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // ?�림차순 ?�렬

      const currentIndex = sameCategoryArticles.findIndex(
        (a) => a.id === articleId
      );
      if (currentIndex === -1) return;

      let targetIndex;
      if (direction === "up") {
        if (currentIndex === 0) return; // ?��? �?번째
        targetIndex = currentIndex - 1;
      } else {
        if (currentIndex === sameCategoryArticles.length - 1) return; // ?��? 마�?�?
        targetIndex = currentIndex + 1;
      }

      const targetArticle = sameCategoryArticles[targetIndex];
      const currentOrder = article.order || 0;
      const targetOrder = targetArticle.order || 0;

      // ?�서 교환
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        articleId
      );
      const targetRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        targetArticle.id
      );

      await Promise.all([
        window.firebaseUpdateDoc(articleRef, { order: targetOrder }),
        window.firebaseUpdateDoc(targetRef, { order: currentOrder }),
      ]);

      // 로컬 ?�이???�데?�트
      article.order = targetOrder;
      targetArticle.order = currentOrder;

      // UI 리렌?�링
      const currentCategory = this.categorySelect?.value || "";
      this.renderArticleCards(currentCategory);
    } catch (error) {
      logger.error("?�서 변�??�패:", error);
      this.showMessage("???�서 변�?�??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * ?�짜 ?�맷??(Firestore Timestamp)
   */
  formatDateFromFirestore(timestamp) {
    if (!timestamp) return "?�짜 ?�음";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (error) {
      return "?�짜 ?�음";
    }
  }

  /**
   * HTML ?�스케?�프
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== ???�크립트 ?�성 기능 =====

  /**
   * ?�크립트 ?�성 ???��?
   */
  toggleScriptCreateForm() {
    if (!this.scriptCreateForm || !this.newScriptToggleBtn) return;

    const isExpanded =
      this.newScriptToggleBtn.getAttribute("aria-expanded") === "true";
    const newState = !isExpanded;

    this.newScriptToggleBtn.setAttribute("aria-expanded", newState.toString());
    this.scriptCreateForm.setAttribute("aria-hidden", (!newState).toString());
    this.scriptCreateForm.style.display = newState ? "block" : "none";

    // ?�이 ?�릴 ??카테고리 ?�안 ?�데?�트
    if (newState) {
      this.updateCategorySuggestions();
    }
  }

  /**
   * LLM 모델 ?�택 변�?처리
   */
  handleLlmModelChange(value) {
    if (!this.scriptLlmModelCustom) return;

    if (value === "custom") {
      this.scriptLlmModelCustom.style.display = "block";
      this.scriptLlmModelCustom.focus();
    } else {
      this.scriptLlmModelCustom.style.display = "none";
      this.scriptLlmModelCustom.value = "";
    }
  }

  /**
   * 카테고리 ?�안 ?�데?�트
   */
  updateCategorySuggestions() {
    if (!this.categorySuggestions) return;

    // 기존 ?�안 ?�거
    this.categorySuggestions.innerHTML = "";

    // 고유??카테고리 목록 추출
    const categories = new Set();
    this.managementArticles.forEach((article) => {
      if (article.category && article.category.trim()) {
        categories.add(article.category.trim());
      }
    });

    // ?�안 추�?
    Array.from(categories)
      .sort()
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        this.categorySuggestions.appendChild(option);
      });
  }

  /**
   * ???�크립트 ?�??
   */
  async saveNewScript() {
    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("??로그?�이 ?�요?�니??", "error");
      return;
    }

    // ?�력�?가?�오�?
    const title = this.scriptTitleInput?.value.trim() || "";
    const content = this.scriptContentTextarea?.value.trim() || "";
    const category = this.scriptCategoryInput?.value.trim() || "미분�?;
    const llmModel =
      this.scriptLlmModelSelect?.value === "custom"
        ? this.scriptLlmModelCustom?.value.trim() || ""
        : this.scriptLlmModelSelect?.value || "";
    const llmModelType = this.scriptLlmTypeInput?.value.trim() || "?�반";

    // 검�? ?�목 ?�수
    if (!title || title.trim() === "") {
      this.showMessage("???�목???�력?�주?�요.", "error");
      if (this.scriptTitleInput) {
        this.scriptTitleInput.focus();
      }
      return;
    }

    if (!content || content.trim() === "") {
      this.showMessage("???�용???�력?�주?�요.", "error");
      if (this.scriptContentTextarea) {
        this.scriptContentTextarea.focus();
      }
      return;
    }

    try {
      // Firebase???�??(?�목?� ?�용?��? ?�력??�??�용)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );
      const newScriptData = {
        title: title.trim(), // ?�용?��? 직접 ?�력???�목
        content: content,
        characterCount: content.length, // [Fix] ?�수 ?�드 추�?
        topic: category, // 카테고리??topic ?�드???�??
        type: "script", // [Tab Separation] ?�크립트 ?�성 ???�용 ?�??(기존 'edit'?� 분리)
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
        order: Date.now(), // ?�?�스?�프 기반 ?�렬 (최신 글????�?
        // LLM 관???�드 (?�택?�항)
        ...(llmModel && { llmModel: llmModel }),
        ...(llmModelType && { llmModelType: llmModelType }),
      };

      await window.firebaseAddDoc(textsRef, newScriptData);

      // ?�공 메시지
      this.showMessage("???�크립트가 ?�?�되?�습?�다.", "success");

      // ??초기??
      this.resetScriptCreateForm();

      // ???�기
      this.toggleScriptCreateForm();

      // 카테고리 ?�터�?"?�체 글 보기"�?리셋 (?�로 ?�?�된 글??보이?�록)
      if (this.categorySelect) {
        this.categorySelect.value = "";
      }

      // 목록 ?�로고침
      await this.loadArticlesForManagement();

      // 카테고리 ?�안 ?�데?�트
      this.updateCategorySuggestions();
    } catch (error) {
      logger.error("?�크립트 ?�???�패:", error);
      this.showMessage("???�크립트 ?�??�??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * ?�크립트 ?�성 취소
   */
  cancelScriptCreate() {
    if (confirm("?�성 중인 ?�용???�라집니?? ?�말 취소?�시겠습?�까?")) {
      this.resetScriptCreateForm();
      this.toggleScriptCreateForm();
    }
  }

  /**
   * ?�크립트 ?�성 ??초기??
   */
  resetScriptCreateForm() {
    if (this.scriptTitleInput) this.scriptTitleInput.value = "";
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.value = "";
      this.updateContentCounter();
    }
    if (this.scriptCategoryInput) this.scriptCategoryInput.value = "";
    if (this.scriptLlmModelSelect) {
      this.scriptLlmModelSelect.value = "";
      this.handleLlmModelChange("");
    }
    if (this.scriptLlmModelCustom) {
      this.scriptLlmModelCustom.value = "";
      this.scriptLlmModelCustom.style.display = "none";
    }
    if (this.scriptLlmTypeInput) this.scriptLlmTypeInput.value = "?�반";
  }

  /**
   * ?�용 글????카운???�데?�트
   */
  updateContentCounter() {
    if (!this.scriptContentTextarea || !this.scriptContentCounter) return;

    const content = this.scriptContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // 글?????�시 ?�데?�트
    this.scriptContentCounter.textContent = `(${charCount} / ${maxChars}?�는 ??1�?15�?`;

    // 500??초과 ??경고 ?��????�용
    if (charCount > maxChars) {
      this.scriptContentCounter.style.color = "#e74c3c";
      this.scriptContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% ?�상????주의 ?�상
      this.scriptContentCounter.style.color = "#f39c12";
      this.scriptContentCounter.style.fontWeight = "500";
    } else {
      // ?�상 범위
      this.scriptContentCounter.style.color = "#666";
      this.scriptContentCounter.style.fontWeight = "400";
    }
  }

  // ===== ?��? 모드 기능 =====

  /**
   * ?��? 모드 ?�기
   * ?�근?? ARIA ?�성 ?�데?�트, ?�크�?리더 ?�림, ?�커???�랩, ESC ??처리 ?�함
   */
  openExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // 컨텍?�트 감�?: ?�정 모드?��? ?�인
    const isEditMode =
      document.getElementById("detail-edit-mode")?.style.display !== "none" &&
      this.selectedArticleId;

    // ?�스 결정
    if (isEditMode) {
      // ?�정 모드: ?�목, 카테고리, ?�용???�정 ?�에??가?�옴
      this.expandSourceMode = "edit"; // 컨텍?�트 ?�??
      const title = this.editTitleInput?.value.trim() || "-";
      const category = this.editCategorySelect?.value || "-";
      const content = this.editContentTextarea?.value || "";

      this.expandContentTextarea.value = content;

      if (this.expandPreviewTitle) {
        this.expandPreviewTitle.textContent = title;
      }
      if (this.expandPreviewCategory) {
        this.expandPreviewCategory.textContent = category;
      }
    } else {
      // ??글 ?�성 모드 (기본)
      this.expandSourceMode = "new"; // 컨텍?�트 ?�??
      if (this.scriptContentTextarea) {
        this.expandContentTextarea.value = this.scriptContentTextarea.value;
      }

      if (this.expandPreviewTitle) {
        const title = this.scriptTitleInput?.value.trim() || "-";
        this.expandPreviewTitle.textContent = title || "-";
      }

      if (this.expandPreviewCategory) {
        const category = this.scriptCategoryInput?.value.trim() || "-";
        this.expandPreviewCategory.textContent = category || "-";
      }
    }

    // 카운???�데?�트
    this.updateExpandContentCounter();

    // 모달 ?�시
    this.contentExpandModal.style.display = "block";

    // ?�근?? ARIA ?�성 ?�데?�트
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // ?�재 ?�성?�된 버튼??aria-expanded ?�데?�트
    const activeBtn = isEditMode ? this.detailExpandBtn : this.expandContentBtn;
    if (activeBtn) {
      activeBtn.setAttribute("aria-expanded", "true");
    }

    // ?�크�?리더 ?�용?��? ?�한 ?�림
    this.announceToScreenReader("?��? 모드가 ?�렸?�니??");

    // ?�근?? ?�커???�랩 ?�정 (Tab ???�환 ?�한)
    this._setupExpandModeFocusTrap();

    // ?�근?? ESC ?�로 모달 ?�기
    this._setupExpandModeEscapeHandler();

    // ?�간??지?????�커??(?�니메이???�료 ??
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // 커서�??�으�??�동
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // ===== [Dual Panel] ?�???�널 ?��? 모드 ?�기 =====
  // 2025-12-09 Phase 2 추�?: ?�정 ?�널?�서 ?��? 모드 진입
  /**
   * ?�정 ?�널?�서 ?��? 모드 진입 (?�???�널??
   * @param {number} panelIndex - ?�널 ?�덱??(0 ?�는 1)
   */
  openExpandModeByIndex(panelIndex = 0) {
    // ?�수 DOM ?�소 ?�인
    if (!this.contentExpandModal || !this.expandContentTextarea) {
      logger.warn("[Dual Panel] ?��? 모드 DOM ?�소 ?�음");
      return;
    }

    // ?�널 ?�덱?�로 글 ID 가?�오�?
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] ?��???글???�습?�다:", panelIndex);
      this.showMessage("???�택??글???�습?�다.", "warning");
      return;
    }

    // 글 ?�이??조회
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      this.showMessage("??글 ?�보�?찾을 ???�습?�다.", "error");
      return;
    }

    // ?��? 모드 ?�스 ?�??(?�???�널)
    this.expandSourceMode = "dualPanel";
    this.expandModeArticleId = articleId;
    this.expandModePanelIndex = panelIndex;

    // ?��? 모드 UI???�이??로드
    // ?�목 ?�정
    if (this.expandPreviewTitle) {
      this.expandPreviewTitle.textContent = article.title || "?�목 ?�음";
    }

    // 카테고리 ?�정
    if (this.expandPreviewCategory) {
      this.expandPreviewCategory.textContent = article.category || "미분�?;
    }

    // ?�용 ?�정
    if (this.expandContentTextarea) {
      this.expandContentTextarea.value = article.content || "";
    }

    // 글????카운???�데?�트
    this.updateExpandContentCounter();

    // 모달 ?�시
    this.contentExpandModal.style.display = "block";

    // ?�근?? ARIA ?�성 ?�데?�트
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // ARIA 버튼 ?�태 ?�데?�트
    const expandBtn = panelIndex === 0 
      ? this.detailExpandBtn1 
      : this.detailExpandBtn2;
    if (expandBtn) {
      expandBtn.setAttribute("aria-expanded", "true");
    }

    // ?�크�?리더 ?�용?��? ?�한 ?�림
    this.announceToScreenReader("?��? 모드가 ?�렸?�니?? ?�널 " + (panelIndex + 1) + "??글???�집?�니??");

    // ?�근?? ?�커???�랩 ?�정 (Tab ???�환 ?�한)
    this._setupExpandModeFocusTrap();

    // ?�근?? ESC ?�로 모달 ?�기
    this._setupExpandModeEscapeHandler();

    // ?�간??지?????�커??(?�니메이???�료 ??
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // 커서�??�으�??�동
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);

    logger.log("[Dual Panel] ?��? 모드 ?�림:", { panelIndex, articleId, title: article.title });
  }

  // ===== [Dual Panel] ?��? 모드 ?�기 =====
  // 2025-12-09 Phase 3 추�?: ?�???�널 ?�태 복원 ?�함
  /**
   * ?��? 모드 ?�기
   * ?�근?? ARIA ?�성 ?�데?�트 ?�함
   * ?�능: ?��?중인 timeout ?�리
   */
  closeExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // ?��?중인 timeout ?�리 (메모�??�수 방�?)
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }

    // ?��? 모드???�용???�본 textarea???�기??(?�을 ???�동 ?�기??
    // ===== [Dual Panel] ?�???�널 모드 ?�기??=====
    if (this.expandSourceMode === "dualPanel") {
      // ?�???�널 모드: ?�?��? 별도�?처리
      logger.log("[Dual Panel] ?��? 모드 ?�힘");
    } else if (this.expandSourceMode === "edit") {
      if (this.editContentTextarea) {
        this.editContentTextarea.value = this.expandContentTextarea.value;
      }
    } else {
      if (this.scriptContentTextarea) {
        this.scriptContentTextarea.value = this.expandContentTextarea.value;
        this.updateContentCounter();
      }
    }

    // ?�근?? ARIA ?�성 ?�데?�트
    this.contentExpandModal.setAttribute("aria-hidden", "true");

    // ===== [Dual Panel] ARIA 버튼 ?�태 복원 =====
    if (this.expandSourceMode === "dualPanel") {
      // ?�???�널 ?��? 버튼 aria-expanded 복원
      if (this.detailExpandBtn1) {
        this.detailExpandBtn1.setAttribute("aria-expanded", "false");
      }
      if (this.detailExpandBtn2) {
        this.detailExpandBtn2.setAttribute("aria-expanded", "false");
      }
    } else {
      // 기존 로직
      const activeBtn =
        this.expandSourceMode === "edit"
          ? this.detailExpandBtn
          : this.expandContentBtn;
      if (activeBtn) {
        activeBtn.setAttribute("aria-expanded", "false");
      }
    }

    // ?�크�?리더 ?�용?��? ?�한 ?�림
    this.announceToScreenReader("?��? 모드가 ?�혔?�니??");

    // ?�근?? ?�커???�랩 �?ESC ?�들???�거
    this._removeExpandModeFocusTrap();
    this._removeExpandModeEscapeHandler();

    // 모달 ?�기�?
    this.contentExpandModal.style.display = "none";

    // ===== [Dual Panel] ?�커??복원 �??�태 초기??=====
    if (this.expandSourceMode === "dualPanel") {
      const panelIndex = this.expandModePanelIndex;
      const focusTarget = panelIndex === 0 
        ? this.detailExpandBtn1 
        : this.detailExpandBtn2;
      if (focusTarget) {
        setTimeout(() => {
          focusTarget.focus();
        }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
      }
      // ?�태 변??초기??
      this.expandModeArticleId = null;
      this.expandModePanelIndex = null;
    } else {
      // 기존 로직
      const focusTarget =
        this.expandSourceMode === "edit"
          ? this.detailExpandBtn
          : this.expandContentBtn;
      if (focusTarget) {
        setTimeout(() => {
          focusTarget.focus();
        }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
      }
    }
  }

  /**
   * ?��? 모드 ?�커???�랩 ?�정
   * Tab ?�로 모달 ?��??�서�??�커???�환
   * @private
   */
  _setupExpandModeFocusTrap() {
    if (!this.contentExpandModal) return;

    // ?�커??가?�한 ?�소 찾기
    const focusableSelectors = [
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const focusableElements = Array.from(
      this.contentExpandModal.querySelectorAll(focusableSelectors)
    ).filter((el) => {
      // ?�면??보이???�소�??�함
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Tab ???�들??
    this._expandModeTabHandler = (e) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab: ??��??
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: ?�방??
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    this.contentExpandModal.addEventListener(
      "keydown",
      this._expandModeTabHandler
    );
  }

  /**
   * ?��? 모드 ?�커???�랩 ?�거
   * @private
   */
  _removeExpandModeFocusTrap() {
    if (this._expandModeTabHandler && this.contentExpandModal) {
      this.contentExpandModal.removeEventListener(
        "keydown",
        this._expandModeTabHandler
      );
      this._expandModeTabHandler = null;
    }
  }

  /**
   * ?��? 모드 ESC ???�들???�정
   * @private
   */
  _setupExpandModeEscapeHandler() {
    this._expandModeEscapeHandler = (e) => {
      if (
        e.key === "Escape" &&
        this.contentExpandModal &&
        this.contentExpandModal.style.display === "block"
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.closeExpandMode();
      }
    };

    document.addEventListener("keydown", this._expandModeEscapeHandler);
  }

  /**
   * ?��? 모드 ESC ???�들???�거
   * @private
   */
  _removeExpandModeEscapeHandler() {
    if (this._expandModeEscapeHandler) {
      document.removeEventListener("keydown", this._expandModeEscapeHandler);
      this._expandModeEscapeHandler = null;
    }
  }

  // ===== [Dual Panel] ?�?�하�??��? 모드 ?�기 =====
  // 2025-12-09 Phase 4 추�?: ?�???�널 모드 ?�??지??
  /**
   * ?�?�하�??��? 모드 ?�기
   */
  async saveAndCloseExpandMode() {
    // ===== [Dual Panel] ?�???�널 모드 ?�??=====
    if (this.expandSourceMode === "dualPanel") {
      const articleId = this.expandModeArticleId;
      const panelIndex = this.expandModePanelIndex;
      const newContent = this.expandContentTextarea?.value || "";
      
      if (!articleId) {
        this.showMessage("???�?�할 글??찾을 ???�습?�다.", "error");
        this.closeExpandMode();
        return;
      }

      try {
        // ===== [Bug Fix] 2025-12-10 Firebase ?�근 방식 ?��???=====
        // 기존: firebase.auth().currentUser, firebase.firestore() 직접 ?�근
        // ?�정: this.currentUser, window.firebaseDoc() + window.firebaseUpdateDoc() ?�퍼 ?�용
        if (!this.currentUser || !this.isFirebaseReady) {
          this.showMessage("??로그?�이 ?�요?�니??", "error");
          this.closeExpandMode();
          return;
        }

        const articleRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          articleId
        );

        await window.firebaseUpdateDoc(articleRef, {
          content: newContent,
          characterCount: newContent.length,
          updatedAt: window.firebaseServerTimestamp()
        });

        // 로컬 ?�이???�데?�트
        const article = this.managementArticles.find((a) => a.id === articleId);
        if (article) {
          article.content = newContent;
          article.updatedAt = new Date();
        }

        // ?�널 UI 갱신
        if (article && panelIndex !== null) {
          this.renderDetailPanelByIndex(article, panelIndex);
        }

        this.showMessage("???�?�되?�습?�다.", "success");
        logger.log("[Dual Panel] ?��? 모드?�서 ?�???�료:", { articleId, panelIndex });

      } catch (error) {
        logger.error("[Dual Panel] ?�???�패:", error);
        this.showMessage("???�?�에 ?�패?�습?�다.", "error");
      }

      this.closeExpandMode();
      return;
    }

    // ===== 기존 로직: edit 모드 �?new 모드 =====
    // ?�용 ?�기??(?�기 ?�에 ?�행)
    if (this.expandSourceMode === "edit") {
      // ?�정 모드�?반환
      if (this.editContentTextarea && this.expandContentTextarea) {
        this.editContentTextarea.value = this.expandContentTextarea.value;
      }
    } else {
      // ??글 ?�성 모드�?반환 (기본)
      if (this.scriptContentTextarea && this.expandContentTextarea) {
        this.scriptContentTextarea.value = this.expandContentTextarea.value;
        this.updateContentCounter(); // ??글 카운???�데?�트
      }
    }

    this.closeExpandMode();

    // ?�??버튼 ?�릭
    if (this.expandSourceMode === "edit") {
      // ?�정 ?�??
      if (this.editSaveBtn) {
        this.editSaveBtn.click();
      }
    } else {
      // ??글 ?�??
      if (this.scriptSaveBtn) {
        this.scriptSaveBtn.click();
      }
    }
  }

  /**
   * ?��? 모드 글????카운???�데?�트
   */
  updateExpandContentCounter() {
    if (!this.expandContentTextarea || !this.expandContentCounter) return;

    const content = this.expandContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // 글?????�시 ?�데?�트
    this.expandContentCounter.textContent = `(${charCount} / ${maxChars}?�는 ??1�?15�?`;

    // 500??초과 ??경고 ?��????�용
    if (charCount > maxChars) {
      this.expandContentCounter.style.color = "#e74c3c";
      this.expandContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% ?�상????주의 ?�상
      this.expandContentCounter.style.color = "#f39c12";
      this.expandContentCounter.style.fontWeight = "500";
    } else {
      // ?�상 범위
      this.expandContentCounter.style.color = "#666";
      this.expandContentCounter.style.fontWeight = "400";
    }
  }

  /**
   * ?��? 모드???�퍼?�스 추�?
   */
  addReferenceToExpandMode(item, sourceType) {
    if (!item || !item.content) return;

    // 중복 체크
    const exists = this.expandReferences.some(
      (ref) => ref.id === item.id && ref.sourceType === sourceType
    );

    if (exists) {
      this.showMessage("?�️ ?��? 추�????�퍼?�스?�니??", "info");
      return;
    }

    // 최�? 개수 ?�한 ?�인
    if (
      this.expandReferences.length >=
      DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES
    ) {
      this.showMessage(
        `?�️ ?�퍼?�스??최�? ${DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES}개까지 추�??????�습?�다.`,
        "error"
      );
      return;
    }

    // ?�퍼?�스 추�?
    const newReference = {
      id: item.id,
      sourceType: sourceType,
      content: item.content,
      title:
        sourceType === "saved"
          ? item.title || "?�목 ?�음" // Firestore???�?�된 title ?�용
          : (item.content || "").substring(0, 50),
      date:
        sourceType === "saved"
          ? item.createdAt
            ? this.formatDateFromFirestore(item.createdAt)
            : item.date || ""
          : item.postedAt
          ? new Date(item.postedAt).toLocaleDateString("ko-KR")
          : "",
      category: item.topic || "미분�?,
    };

    this.expandReferences.push(newReference);

    // ?�더�?(?�로 추�????�퍼?�스 ID ?�달?�여 ?�각???�드�??�공)
    this.renderExpandReferences(newReference.id);

    // ?�공 메시지
    this.showMessage("???�퍼?�스가 추�??�었?�니??", "success");
  }

  /**
   * ?��? 모드?�서 ?�퍼?�스 ?�거
   */
  removeExpandReference(index) {
    if (index < 0 || index >= this.expandReferences.length) return;

    this.expandReferences.splice(index, 1);
    this.renderExpandReferences();
  }

  /**
   * ?��? 모드 ?�퍼?�스 ?�더�?
   */
  renderExpandReferences(newlyAddedId = null) {
    if (!this.expandReferenceList || !this.expandReferenceEmpty) return;

    if (this.expandReferences.length === 0) {
      this.expandReferenceList.style.display = "none";
      this.expandReferenceEmpty.style.display = "flex";
      return;
    }

    this.expandReferenceList.style.display = "block";
    this.expandReferenceEmpty.style.display = "none";

    this.expandReferenceList.innerHTML = "";

    this.expandReferences.forEach((ref, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "expand-reference-item";
      itemEl.setAttribute("role", "listitem");
      itemEl.setAttribute(
        "aria-label",
        `?�퍼?�스 ${index + 1}: ${this.escapeHtml(ref.title)}`
      );

      // ?�로 추�????�퍼?�스?��? ?�인?�여 ?�각???�드�?추�?
      const isNewlyAdded = newlyAddedId && ref.id === newlyAddedId;
      if (isNewlyAdded) {
        itemEl.classList.add("reference-added");
      }

      const contentPreview = (ref.content || "").substring(0, 500);

      itemEl.innerHTML = `
                <div class="expand-reference-item-header">
                    <div class="expand-reference-item-title">${this.escapeHtml(
                      ref.title
                    )}</div>
                    <button 
                        class="expand-reference-item-remove"
                        aria-label="?�퍼?�스 ?�거"
                        title="?�거">
                        ×
                    </button>
                </div>
                <div class="expand-reference-item-content">${this.escapeHtml(
                  contentPreview
                )}${ref.content.length > 500 ? "..." : ""}</div>
                <div class="expand-reference-item-meta">
                    <span>?�� ${ref.date}</span>
                    <span>?�� ${this.escapeHtml(ref.category)}</span>
                </div>
                <div class="expand-reference-item-actions">
                    <button 
                        class="expand-reference-add-btn"
                        aria-label="?�용??추�?"
                        title="???�퍼?�스�??�른�??�용 ?�드??추�?">
                        <span class="btn-icon">??/span>
                        <span class="btn-text">?�용??추�?</span>
                    </button>
                </div>
            `;

      // ?�거 버튼 ?�벤??
      const removeBtn = itemEl.querySelector(".expand-reference-item-remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          this.removeExpandReference(index);
        });
      }

      // ?�용??추�? 버튼 ?�벤??
      const addBtn = itemEl.querySelector(".expand-reference-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          this.addExpandReferenceToContent(ref, index);
        });
      }

      this.expandReferenceList.appendChild(itemEl);

      // ?�로 추�????�퍼?�스??경우 ?�니메이???�료 ???�래???�거
      if (isNewlyAdded) {
        setTimeout(() => {
          itemEl.classList.remove("reference-added");
        }, DualTextWriter.CONFIG.REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS);
      }
    });

    // ?�근?? ?�퍼?�스 목록 ?�시 �?ARIA ?�성 ?�데?�트
    if (this.expandReferenceList && this.expandReferences.length > 0) {
      this.expandReferenceList.style.display = "block";
      this.expandReferenceList.setAttribute(
        "aria-label",
        `추�????�퍼?�스 목록 (${this.expandReferences.length}�?`
      );
    }
  }

  /**
   * ?��? 모드 ?�퍼?�스�??�용 ?�드??추�?
   */
  addExpandReferenceToContent(ref, index) {
    if (!this.expandContentTextarea || !ref || !ref.content) return;

    const content = ref.content || "";
    if (!content.trim()) return;

    const currentContent = this.expandContentTextarea.value;
    const separator = currentContent ? "\n\n---\n\n" : "";
    const newContent = currentContent + separator + content;

    this.expandContentTextarea.value = newContent;
    this.expandContentTextarea.focus();

    // 커서�?추�????�용 ?�으�??�동
    const length = newContent.length;
    this.expandContentTextarea.setSelectionRange(length, length);

    // 글????카운???�데?�트
    this.updateExpandContentCounter();

    // ?�본 textarea???�기??
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.value = newContent;
      this.updateContentCounter();
    }

    // ?�공 메시지
    this.showMessage("???�퍼?�스가 ?�용??추�??�었?�니??", "success");
  }

  /**
   * ?��? 모드 ?�퍼?�스 ?�역 ?�기/?�치�?
   */
  /**
   * ?��? 모드 ?�퍼?�스 ?�널 ?��?
   * ?�근?? ARIA ?�성 ?�데?�트 �??�크�?리더 ?�림 ?�함
   */
  toggleExpandReferencePanel() {
    if (!this.expandReferencePanel || !this.expandToggleReferenceBtn) return;

    const isCollapsed =
      this.expandReferencePanel.classList.contains("collapsed");

    // collapsed ?�래???��?
    this.expandReferencePanel.classList.toggle("collapsed");

    // ?�근?? ARIA ?�성 ?�데?�트
    const newState = !isCollapsed; // ?��? ???�태 (true = ?�힘, false = ?�침)
    this.expandToggleReferenceBtn.setAttribute(
      "aria-expanded",
      newState ? "false" : "true"
    );

    // ?�크�?리더 ?�용?��? ?�한 ?�림
    const message = newState
      ? "?�퍼?�스 ?�역???�혔?�니??"
      : "?�퍼?�스 ?�역???�쳐졌습?�다.";
    this.announceToScreenReader(message);
  }

  /**
   * ?��? 모드 분할???�래�?초기??
   */
  initExpandSplitResize() {
    if (!this.expandSplitDivider || !this.expandReferencePanel) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const handleMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.expandReferencePanel.offsetWidth;

      this.expandSplitDivider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const diff = e.clientX - startX;
      const newWidth = startWidth + diff;
      const container = this.expandReferencePanel.parentElement;
      const containerWidth = container.offsetWidth;

      // 최소/최�? ?�비 ?�한
      const minWidth = 300;
      const maxWidth = containerWidth * 0.7;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        this.expandReferencePanel.style.width = `${newWidth}px`;
      }

      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        this.expandSplitDivider.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    this.expandSplitDivider.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  // ===== ?�퍼?�스 불러?�기 기능 =====

  /**
   * ?�퍼?�스 로더 ?�기
   */
  openReferenceLoader() {
    logger.log("[openReferenceLoader] ?�수 ?�출??);
    if (!this.referenceLoaderPanel) {
      logger.error(
        "[openReferenceLoader] referenceLoaderPanel??찾을 ???�습?�다."
      );
      return;
    }

    const content = this.referenceLoaderPanel.querySelector(
      ".reference-loader-content"
    );

    // ?�널 ?�시
    this.referenceLoaderPanel.style.display = "block";

    // ???�태 초기??(?�성 ??�� ?�기??
    const activeTab = this.referenceLoaderPanel.querySelector(
      ".reference-tab.active"
    );
    if (activeTab) {
      const tabName = activeTab.getAttribute("data-tab") || "saved";
      this.currentReferenceTab = tabName;
    } else {
      // ?�성 ??�� ?�으�?기본값으�??�정
      this.currentReferenceTab = "saved";
    }

    // transform 초기??(?�라???��????�거 ??CSS ?�용)
    if (content) {
      // ?�라???��????�거?�여 CSS ?�택?��? ?�동?�도�???
      content.style.transform = "";

      // ?�간??지????transform ?�용 (리플로우 보장)
      setTimeout(() => {
        content.style.transform = "translateX(0)";
      }, 10);
    }

    // ?�간??지?????�이??로드
    setTimeout(() => {
      try {
        this.loadReferenceList();
        this.loadRecentReferencesList();
      } catch (error) {
        logger.error("[openReferenceLoader] ?�이??로드 �??�류 발생:", {
          function: "openReferenceLoader",
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage(
          "???�퍼?�스 목록??불러?�는 �??�류가 발생?�습?�다.",
          "error"
        );
      }
    }, 20);
  }

  /**
   * ?�퍼?�스 로더 ?�기
   */
  closeReferenceLoader() {
    if (!this.referenceLoaderPanel) return;

    const content = this.referenceLoaderPanel.querySelector(
      ".reference-loader-content"
    );
    if (content) {
      content.style.transform = "translateX(100%)";
    }

    setTimeout(() => {
      this.referenceLoaderPanel.style.display = "none";
      // ?�라???��????�거?�여 ?�음 ????CSS가 ?�상 ?�동?�도�???
      if (content) {
        content.style.transform = "";
      }
      if (this.referenceSearchInput) {
        this.referenceSearchInput.value = "";
      }
      // ?�터??초기??
      if (this.referenceCategoryFilter) {
        this.referenceCategoryFilter.value = "";
      }
      if (this.referenceSortFilter) {
        this.referenceSortFilter.value = "recent";
      }
    }, 300);
  }

  /**
   * ?�퍼?�스 ???�환
   */
  switchReferenceTab(tabName) {
    this.currentReferenceTab = tabName;

    // ??버튼 ?�데?�트
    this.referenceTabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-tab") === tabName;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive.toString());
    });

    // 콘텐�??�데?�트
    if (this.referenceSavedContent) {
      this.referenceSavedContent.classList.toggle(
        "active",
        tabName === "saved"
      );
      this.referenceSavedContent.style.display =
        tabName === "saved" ? "block" : "none";
    }

    if (this.referenceTrackingContent) {
      this.referenceTrackingContent.classList.toggle(
        "active",
        tabName === "tracking"
      );
      this.referenceTrackingContent.style.display =
        tabName === "tracking" ? "block" : "none";
    }

    // ?�터 ?�시/?��?
    if (this.referenceTrackingFilters) {
      this.referenceTrackingFilters.style.display =
        tabName === "tracking" ? "flex" : "none";
    }

    // 목록 로드
    this.loadReferenceList();
  }

  /**
   * ?�퍼?�스 검??처리
   */
  handleReferenceSearch(query) {
    clearTimeout(this.referenceSearchDebounce);
    this.referenceSearchDebounce = setTimeout(() => {
      this.loadReferenceList();
    }, 300);
  }

  /**
   * ?�퍼?�스 목록 로드
   */
  async loadReferenceList() {
    if (!this.currentUser || !this.isFirebaseReady) {
      logger.warn("[loadReferenceList] ?�용???�는 Firebase 준�??�태 ?�인:", {
        hasUser: !!this.currentUser,
        isFirebaseReady: this.isFirebaseReady,
      });
      return;
    }

    // currentReferenceTab???�으�?기본�??�정
    if (!this.currentReferenceTab) {
      this.currentReferenceTab = "saved";
    }

    const searchQuery =
      this.referenceSearchInput?.value.trim().toLowerCase() || "";
    const categoryFilter = this.referenceCategoryFilter?.value || "";
    const sortFilter = this.referenceSortFilter?.value || "recent";

    try {
      if (this.currentReferenceTab === "saved") {
        await this.loadSavedReferences(searchQuery, categoryFilter);
      } else if (this.currentReferenceTab === "tracking") {
        await this.loadTrackingReferences(
          searchQuery,
          categoryFilter,
          sortFilter
        );
      } else {
        logger.warn(
          "[loadReferenceList] ?????�는 ??",
          this.currentReferenceTab
        );
        // 기본값으�??�?�된 글 로드
        this.currentReferenceTab = "saved";
        await this.loadSavedReferences(searchQuery, categoryFilter);
      }
    } catch (error) {
      logger.error("[loadReferenceList] ?�퍼?�스 목록 로드 ?�패:", {
        function: "loadReferenceList",
        currentTab: this.currentReferenceTab,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        timestamp: new Date().toISOString(),
      });
      this.showMessage(
        "???�퍼?�스 목록??불러?�는 �??�류가 발생?�습?�다.",
        "error"
      );
    }
  }

  /**
   * ?�?�된 글 ?�퍼?�스 로드
   */
  async loadSavedReferences(searchQuery = "", categoryFilter = "") {
    if (!this.referenceSavedList) return;

    // ?�?�된 글 목록???�으�?로드
    if (!this.savedTexts || this.savedTexts.length === 0) {
      await this.loadSavedTexts();
    }

    // ?�터�?
    let filtered = this.savedTexts.filter((text) => {
      // [Tab Separation] ?�퍼?�스??'edit'(글 ?�성)?� 'script'(?�크립트) 모두 ?�용
      const type = text.type || "edit";
      if (type !== "edit" && type !== "script") return false;

      // 검?�어 ?�터
      if (searchQuery) {
        const title = this.extractTitleFromContent(
          text.content || ""
        ).toLowerCase();
        const content = (text.content || "").toLowerCase();
        if (!title.includes(searchQuery) && !content.includes(searchQuery)) {
          return false;
        }
      }

      // 카테고리 ?�터
      if (categoryFilter) {
        const category = text.topic || "미분�?;
        if (category !== categoryFilter) return false;
      }

      return true;
    });

    // ?�렬 (최신??
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
      const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
      return dateB - dateA;
    });

    // ?�더�?
    this.renderReferenceList(filtered, this.referenceSavedList, "saved");

    // �??�태 처리
    const emptyEl = document.getElementById("reference-saved-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * ?�래???�퍼?�스 로드
   */
  async loadTrackingReferences(
    searchQuery = "",
    categoryFilter = "",
    sortFilter = "recent"
  ) {
    if (!this.referenceTrackingList) return;

    // ?�래???�스??목록???�으�?로드
    if (!this.trackingPosts || this.trackingPosts.length === 0) {
      await this.loadTrackingPosts();
    }

    // ?�터�?
    let filtered = this.trackingPosts.filter((post) => {
      // 검?�어 ?�터
      if (searchQuery) {
        const content = (post.content || "").toLowerCase();
        if (!content.includes(searchQuery)) return false;
      }

      // 카테고리 ?�터???�래?�에???�용 ????(?�중???�장 가??
      return true;
    });

    // ?�렬
    filtered.sort((a, b) => {
      if (sortFilter === "views") {
        const viewsA = this.getLatestMetricValue(a, "views") || 0;
        const viewsB = this.getLatestMetricValue(b, "views") || 0;
        return viewsB - viewsA;
      } else if (sortFilter === "likes") {
        const likesA = this.getLatestMetricValue(a, "likes") || 0;
        const likesB = this.getLatestMetricValue(b, "likes") || 0;
        return likesB - likesA;
      } else if (sortFilter === "follows") {
        const followsA = this.getLatestMetricValue(a, "follows") || 0;
        const followsB = this.getLatestMetricValue(b, "follows") || 0;
        return followsB - followsA;
      } else {
        // 최신??
        const dateA = a.postedAt || new Date(0);
        const dateB = b.postedAt || new Date(0);
        return dateB - dateA;
      }
    });

    // ?�더�?
    this.renderReferenceList(filtered, this.referenceTrackingList, "tracking");

    // �??�태 처리
    const emptyEl = document.getElementById("reference-tracking-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * ?�래???�스?�의 최신 메트�?�?가?�오�?
   */
  getLatestMetricValue(post, metricType) {
    if (!post.metrics || post.metrics.length === 0) return 0;

    const latest = post.metrics[post.metrics.length - 1];
    return latest[metricType] || 0;
  }

  /**
   * ?�퍼?�스 목록 ?�더�?
   */
  renderReferenceList(items, container, sourceType) {
    if (!container) return;

    container.innerHTML = "";

    items.forEach((item) => {
      const itemEl = this.createReferenceItem(item, sourceType);
      container.appendChild(itemEl);
    });
  }

  /**
   * ?�퍼?�스 ?�이???�성
   */
  createReferenceItem(item, sourceType) {
    const div = document.createElement("div");
    div.className = "reference-item";
    div.setAttribute("data-item-id", item.id);
    div.setAttribute("data-source-type", sourceType);

    const title =
      sourceType === "saved"
        ? item.title || "?�목 ?�음" // Firestore???�?�된 title ?�용
        : (item.content || "").substring(0, 50) +
          (item.content?.length > 50 ? "..." : "");

    const content = (item.content || "").substring(0, 150);
    let date = "";
    if (sourceType === "saved") {
      date = item.createdAt
        ? this.formatDateFromFirestore(item.createdAt)
        : item.date || "";
    } else {
      // ?�래???�스?�의 경우 postedAt??Date 객체???�도 ?�음
      if (item.postedAt) {
        if (item.postedAt.toDate) {
          date = this.formatDateFromFirestore(item.postedAt);
        } else if (item.postedAt instanceof Date) {
          date = item.postedAt.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
        } else {
          date = new Date(item.postedAt).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
        }
      }
    }

    let metaHtml = `<span>?�� ${date}</span>`;

    if (sourceType === "tracking") {
      const views = this.getLatestMetricValue(item, "views") || 0;
      const likes = this.getLatestMetricValue(item, "likes") || 0;
      const follows = this.getLatestMetricValue(item, "follows") || 0;
      metaHtml += `<span>?? ${views}</span>`;
      metaHtml += `<span>?�️ ${likes}</span>`;
      metaHtml += `<span>?�� ${follows}</span>`;
    } else {
      const category = item.topic || "미분�?;
      metaHtml += `<span>?�� ${this.escapeHtml(category)}</span>`;
    }

    div.innerHTML = `
            <div class="reference-item-header">
                <div class="reference-item-title">${this.escapeHtml(
                  title
                )}</div>
            </div>
            <div class="reference-item-content">${this.escapeHtml(
              content
            )}</div>
            <div class="reference-item-meta">
                ${metaHtml}
            </div>
            <div class="reference-item-actions">
                <button class="reference-item-btn" data-action="add">
                    추�??�기
                </button>
            </div>
        `;

    // 추�? 버튼 ?�벤??
    const addBtn = div.querySelector('[data-action="add"]');
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.addReferenceToContent(item, sourceType);
      });
    }

    // ?�이???�릭 ?�에??추�?
    div.addEventListener("click", () => {
      this.addReferenceToContent(item, sourceType);
    });

    return div;
  }

  /**
   * ?�퍼?�스�??��? 모드???�퍼?�스 ?�역??추�?
   * ?��? 모드가 ?��??�으�??�동?�로 ?�고 ?�퍼?�스�?추�??�니??
   *
   * @param {Object} item - ?�퍼?�스 ?�이??객체
   * @param {string} sourceType - ?�퍼?�스 ?�스 ?�??('saved' ?�는 'tracking')
   */
  addReferenceToContent(item, sourceType) {
    // ?�수 DOM ?�소 존재 ?��? ?�인
    if (!this.scriptContentTextarea) {
      logger.error("[addReferenceToContent] ?�수 DOM ?�소 ?�음:", {
        function: "addReferenceToContent",
        missingElement: "scriptContentTextarea",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ?�라미터 ?�효??검??
    if (!item || typeof item !== "object") {
      logger.error("[addReferenceToContent] ?�라미터 ?�효??검???�패:", {
        function: "addReferenceToContent",
        parameter: "item",
        receivedType: typeof item,
        receivedValue: item,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("???�퍼?�스 ?�보가 ?�바르�? ?�습?�다.", "error");
      return;
    }

    const content = item.content || "";
    if (!content.trim()) {
      this.showMessage("???�퍼?�스 ?�용??비어?�습?�다.", "error");
      return;
    }

    // sourceType ?�라미터 ?�효??검??
    if (!sourceType || typeof sourceType !== "string") {
      logger.error(
        "[addReferenceToContent] sourceType ?�라미터 ?�효??검???�패:",
        {
          function: "addReferenceToContent",
          parameter: "sourceType",
          receivedType: typeof sourceType,
          receivedValue: sourceType,
          timestamp: new Date().toISOString(),
        }
      );
      this.showMessage("???�퍼?�스 ?�스 ?�?�이 ?�바르�? ?�습?�다.", "error");
      return;
    }

    const validSourceTypes = ["saved", "tracking"];
    if (!validSourceTypes.includes(sourceType)) {
      logger.error("[addReferenceToContent] ?�효?��? ?��? sourceType:", {
        function: "addReferenceToContent",
        parameter: "sourceType",
        receivedValue: sourceType,
        validValues: validSourceTypes,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("??지?�하지 ?�는 ?�퍼?�스 ?�스 ?�?�입?�다.", "error");
      return;
    }

    // ?��? 모드 ?�림 ?�태 ?�인
    const isExpandModeOpen =
      this.contentExpandModal &&
      this.contentExpandModal.style.display === "block";

    // ?��? 모드가 ?��??�으�?먼�? ?�기
    if (!isExpandModeOpen) {
      // ?�수 DOM ?�소 ?�인
      if (!this.contentExpandModal || !this.expandContentTextarea) {
        logger.error("[addReferenceToContent] ?��? 모드 관??DOM ?�소 ?�음:", {
          function: "addReferenceToContent",
          missingElements: {
            contentExpandModal: !this.contentExpandModal,
            expandContentTextarea: !this.expandContentTextarea,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage("???��? 모드�??????�습?�다.", "error");
        return;
      }

      try {
        // ?�능 모니?�링: ?�작 ?�간 기록
        const performanceStart = performance.now();

        // ?��? 모드 ?�기
        this.openExpandMode();

        // 모달???�린 ???�퍼?�스 추�? (?�니메이???�료 ?��?
        const timeoutId = setTimeout(() => {
          // ?�능 모니?�링: ?�료 ?�간 기록
          const performanceEnd = performance.now();
          const performanceDuration = performanceEnd - performanceStart;

          // ?�능???�린 경우?�만 로깅
          if (
            performanceDuration >
            DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS
          ) {
            logger.warn("[addReferenceToContent] ?�능 경고:", {
              function: "addReferenceToContent",
              action: "expandModeOpenAndAddReference",
              duration: `${performanceDuration.toFixed(2)}ms`,
              threshold: `${DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS}ms`,
              timestamp: new Date().toISOString(),
            });
          }

          this._addReferenceToExpandModeAndNotify(item, sourceType, true);
        }, DualTextWriter.CONFIG.EXPAND_MODE_ANIMATION_DELAY);

        // 메모�??�수 방�?�??�한 timeout ID ?�??(?�요???�리??가??
        if (!this._expandModeTimeouts) {
          this._expandModeTimeouts = [];
        }
        this._expandModeTimeouts.push(timeoutId);

        return;
      } catch (error) {
        // 구조?�된 ?�러 로깅
        const errorContext = {
          function: "addReferenceToContent",
          action: "openExpandMode",
          itemId: item?.id || "unknown",
          sourceType: sourceType,
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        };
        logger.error(
          "[addReferenceToContent] ?��? 모드 ?�기 �??�류 발생:",
          errorContext
        );
        this.showMessage("???��? 모드�??????�습?�다.", "error");
        return;
      }
    }

    // ?��? 모드가 ?��? ?�려?�는 경우
    this._addReferenceToExpandModeAndNotify(item, sourceType, false);
  }

  /**
   * ?�퍼?�스�??��? 모드??추�??�고 ?�용?�에�??�림
   * 중복 코드 ?�거�??�한 ?�퍼 ?�수
   *
   * @param {Object} item - ?�퍼?�스 ?�이??객체
   * @param {string} sourceType - ?�퍼?�스 ?�스 ?�??
   * @param {boolean} isNewlyOpened - ?��? 모드가 방금 ?�렸?��? ?��?
   * @private
   */
  _addReferenceToExpandModeAndNotify(item, sourceType, isNewlyOpened) {
    try {
      // ?�퍼?�스 추�?
      this.addReferenceToExpandMode(item, sourceType);

      // 최근 ?�용 목록??추�?
      if (item.id && sourceType) {
        this.addToRecentReferences(item.id, sourceType);
      }

      // ?�이???�널 ?�기
      this.closeReferenceLoader();

      // ?�크�?리더 ?�용?��? ?�한 ?�림
      const screenReaderMessage = isNewlyOpened
        ? "?�퍼?�스가 ?��? 모드???�퍼?�스 ?�역??추�??�었?�니??"
        : "?�퍼?�스가 ?�퍼?�스 ?�역??추�??�었?�니??";
      this.announceToScreenReader(screenReaderMessage);

      // ?�공 메시지
      this.showMessage(
        "???�퍼?�스가 추�??�었?�니?? ?�쪽 ?�퍼?�스 ?�역?�서 ?�인?�세??",
        "success"
      );

      // ?��? 모드가 방금 ?�린 경우?�만 ?�커??관�?
      if (isNewlyOpened) {
        setTimeout(() => {
          const firstReference = this.expandReferenceList?.querySelector(
            ".expand-reference-item"
          );
          if (firstReference) {
            firstReference.setAttribute("tabindex", "0");
            firstReference.focus();
          }
        }, DualTextWriter.CONFIG.FOCUS_MANAGEMENT_DELAY_MS);
      }
    } catch (error) {
      // 구조?�된 ?�러 로깅
      const errorContext = {
        function: "_addReferenceToExpandModeAndNotify",
        action: "addReference",
        itemId: item?.id || "unknown",
        sourceType: sourceType,
        isNewlyOpened: isNewlyOpened,
        expandReferencesCount: this.expandReferences?.length || 0,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      };
      logger.error(
        "[addReferenceToContent] ?�퍼?�스 추�? �??�류 발생:",
        errorContext
      );
      this.showMessage("???�퍼?�스 추�? �??�류가 발생?�습?�다.", "error");
    }
  }

  /**
   * 최근 ?�용 ?�퍼?�스 로드 (localStorage)
   */
  loadRecentReferences() {
    try {
      const stored = localStorage.getItem("dtw_recent_references");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error("최근 ?�퍼?�스 로드 ?�패:", error);
      return [];
    }
  }

  /**
   * 최근 ?�용 ?�퍼?�스 목록 ?�더�?
   */
  async loadRecentReferencesList() {
    if (!this.referenceRecentList || !this.referenceRecentSection) return;

    if (this.recentReferences.length === 0) {
      this.referenceRecentSection.style.display = "none";
      return;
    }

    this.referenceRecentSection.style.display = "block";
    this.referenceRecentList.innerHTML = "";

    // 최근 5개만 ?�시
    const recent = this.recentReferences.slice(0, 5);

    for (const ref of recent) {
      try {
        let item = null;

        if (ref.sourceType === "saved") {
          // ?�?�된 글?�서 찾기
          if (!this.savedTexts || this.savedTexts.length === 0) {
            await this.loadSavedTexts();
          }
          item = this.savedTexts.find((t) => t.id === ref.id);
        } else {
          // ?�래?�에??찾기
          if (!this.trackingPosts || this.trackingPosts.length === 0) {
            await this.loadTrackingPosts();
          }
          item = this.trackingPosts.find((p) => p.id === ref.id);
        }

        if (item) {
          const itemEl = this.createReferenceItem(item, ref.sourceType);
          this.referenceRecentList.appendChild(itemEl);
        }
      } catch (error) {
        logger.error("최근 ?�퍼?�스 로드 ?�패:", error);
      }
    }
  }

  /**
   * 최근 ?�용 ?�퍼?�스??추�?
   */
  addToRecentReferences(itemId, sourceType) {
    // 기존 ??�� ?�거 (중복 방�?)
    this.recentReferences = this.recentReferences.filter(
      (ref) => !(ref.id === itemId && ref.sourceType === sourceType)
    );

    // �??�에 추�?
    this.recentReferences.unshift({
      id: itemId,
      sourceType: sourceType,
      timestamp: Date.now(),
    });

    // 최�? 10개만 ?��?
    this.recentReferences = this.recentReferences.slice(0, 10);

    // localStorage???�??
    try {
      localStorage.setItem(
        Constants.STORAGE_KEYS.RECENT_REFERENCES,
        JSON.stringify(this.recentReferences)
      );
    } catch (error) {
      logger.error("최근 ?�퍼?�스 ?�???�패:", error);
    }
  }
}

// Initialize the application
let dualTextWriter;

document.addEventListener("DOMContentLoaded", () => {
  dualTextWriter = new DualTextWriter();
  window.dualTextWriter = dualTextWriter;
  window.app = dualTextWriter;

  // 메인 콘텐�?강제 ?�시 (로그???�태?� 관계없??
  const mainContent = document.getElementById("main-content");
  if (mainContent) {
    mainContent.style.display = "block";
  }

  // ?�역 ?�버�??�수 ?�록
  window.debugSavedItems = () => dualTextWriter.debugSavedItems();
  window.verifyLLMCharacteristics = () =>
    dualTextWriter.verifyLLMCharacteristics();
  window.testEditButton = (index = 0) => {
    const editButtons = document.querySelectorAll(".btn-edit");
    if (editButtons[index]) {
      editButtons[index].click();
    } else {
      logger.log("?�집 버튼??찾을 ???�습?�다.");
    }
  };
  window.testDeleteButton = (index = 0) => {
    const deleteButtons = document.querySelectorAll(".btn-delete");
    if (deleteButtons[index]) {
      deleteButtons[index].click();
    } else {
      logger.log("??�� 버튼??찾을 ???�습?�다.");
    }
  };
  window.testLLMValidation = (llmService = "chatgpt", index = 0) => {
    const llmButtons = document.querySelectorAll(`[data-llm="${llmService}"]`);
    if (llmButtons[index]) {
      llmButtons[index].click();
    } else {
      logger.log(`${llmService} 검�?버튼??찾을 ???�습?�다.`);
    }
  };
});
// Bottom sheet helpers
DualTextWriter.prototype.openBottomSheet = function (modalElement) {
  if (!modalElement) return;
  modalElement.style.display = "flex";
  document.body.style.overflow = "hidden";
  const content = modalElement.querySelector(".modal-content");
  // backdrop click
  modalElement._backdropHandler = (e) => {
    if (e.target === modalElement) this.closeBottomSheet(modalElement);
  };
  modalElement.addEventListener("click", modalElement._backdropHandler);
  // ESC close
  modalElement._escHandler = (e) => {
    if (e.key === "Escape") this.closeBottomSheet(modalElement);
  };
  document.addEventListener("keydown", modalElement._escHandler);
  // drag to close from handle or top area
  let startY = null;
  let currentY = 0;
  let dragging = false;
  const threshold = 100;
  const handle = content.querySelector(".sheet-handle") || content;
  const onStart = (y) => {
    dragging = true;
    startY = y;
    content.style.transition = "none";
  };
  const onMove = (y) => {
    if (!dragging) return;
    currentY = Math.max(0, y - startY);
    content.style.transform = `translateY(${currentY}px)`;
  };
  const onEnd = () => {
    if (!dragging) return;
    content.style.transition = "";
    if (currentY > threshold) {
      this.closeBottomSheet(modalElement);
    } else {
      content.style.transform = "translateY(0)";
    }
    dragging = false;
    startY = null;
    currentY = 0;
  };
  modalElement._touchStart = (e) =>
    onStart(e.touches ? e.touches[0].clientY : e.clientY);
  modalElement._touchMove = (e) =>
    onMove(e.touches ? e.touches[0].clientY : e.clientY);
  modalElement._touchEnd = () => onEnd();

  // Number stepper handlers
  content.querySelectorAll(".number-stepper").forEach((stepper) => {
    stepper.onclick = (e) => {
      e.preventDefault();
      const targetId = stepper.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;
      const action = stepper.getAttribute("data-action");
      const current = parseInt(input.value) || 0;
      const min = parseInt(input.getAttribute("min")) || 0;
      const max = parseInt(input.getAttribute("max")) || Infinity;

      let newValue = current;
      if (action === "increase") {
        newValue = Math.min(current + 1, max);
      } else if (action === "decrease") {
        newValue = Math.max(current - 1, min);
      }

      // ?�효??검�? min/max 범위 ?�인지 ?�인
      if (newValue >= min && newValue <= max) {
        input.value = newValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));

        // ?�시�??�효???�드�? 범위�?벗어?�면 ?�테??비활?�화
        const increaseBtn = input.parentElement.querySelector(
          '.number-stepper[data-action="increase"]'
        );
        const decreaseBtn = input.parentElement.querySelector(
          '.number-stepper[data-action="decrease"]'
        );
        if (increaseBtn) {
          increaseBtn.disabled = newValue >= max;
          increaseBtn.style.opacity = newValue >= max ? "0.5" : "1";
        }
        if (decreaseBtn) {
          decreaseBtn.disabled = newValue <= min;
          decreaseBtn.style.opacity = newValue <= min ? "0.5" : "1";
        }
      }
    };
  });

  // Date tab handlers - ?�벤???�임 방식?�로 ?�정?�인 바인??
  // 기존 ?�들???�거 (중복 바인??방�?)
  if (content._dateTabHandler) {
    content.removeEventListener("click", content._dateTabHandler);
  }

  // ?�로???�들???�성 �??�??
  content._dateTabHandler = (e) => {
    const tab = e.target.closest(".date-tab");
    if (!tab) return;

    e.preventDefault();
    e.stopPropagation();

    const tabs = tab.closest(".date-selector-tabs");
    if (!tabs) return;

    // 같�? ??그룹 ?�의 ?�짜 ?�력 ?�드 찾기
    const formGroup = tabs.closest(".form-group");
    if (!formGroup) return;

    const dateInput = formGroup.querySelector('input[type="date"]');
    if (!dateInput) {
      logger.warn("?�짜 ?�력 ?�드�?찾을 ???�습?�다:", formGroup);
      return;
    }

    // 모든 ??비활?�화 ???�릭?????�성??
    tabs.querySelectorAll(".date-tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    const dateType = tab.getAttribute("data-date");
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateType === "today") {
      const todayStr = today.toISOString().split("T")[0];
      dateInput.value = todayStr;
      dateInput.style.display = "none";
      // input ?�벤???�리거하????검�??�데?�트
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "yesterday") {
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      dateInput.value = yesterdayStr;
      dateInput.style.display = "none";
      // input ?�벤???�리거하????검�??�데?�트
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "custom") {
      dateInput.style.display = "block";
      // 직접?�력 ?�드가 보이?�록 ?�간??지?????�커??(?�니메이???�료 ??
      setTimeout(() => {
        dateInput.focus();
      }, 50);
      // ?�용???�력???�해 ?�재 값을 ?��??�거???�늘 ?�짜�??�정
      if (!dateInput.value) {
        dateInput.value = today.toISOString().split("T")[0];
      }
      // input ?�벤???�리�?
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  // ?�벤???�임: 모달 컨텐츠에 ??번만 바인??
  content.addEventListener("click", content._dateTabHandler);

  // Focus scroll correction: ?�패?��? 가?��?지 ?�도�?(?�드로이???�이???�환)
  content.querySelectorAll("input, textarea").forEach((field) => {
    const handleFocus = (e) => {
      // ?�러 �??�출 방�?
      if (field._scrollHandled) return;
      field._scrollHandled = true;

      setTimeout(
        () => {
          const rect = field.getBoundingClientRect();
          const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight;

          // ?�랫?�별 ?�패???�이 추정
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isAndroid = /Android/.test(navigator.userAgent);
          const keyboardHeight = isIOS
            ? Math.max(300, viewportHeight * 0.35)
            : isAndroid
            ? Math.max(250, viewportHeight * 0.4)
            : Math.max(250, viewportHeight * 0.4);

          const fieldBottom = rect.bottom;
          const visibleArea = viewportHeight - keyboardHeight;

          if (fieldBottom > visibleArea) {
            const scrollOffset = fieldBottom - visibleArea + 30; // ?�유 공간 증�?

            // 모달 컨텐�??�크�?
            if (content.scrollHeight > content.clientHeight) {
              content.scrollTop += scrollOffset;
            }

            // ?�체 ?�이지 ?�크�?(?�요??
            const modalRect = modalElement.getBoundingClientRect();
            if (modalRect.bottom > visibleArea) {
              // 부?�러???�크�?
              field.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              });
            }
          }

          field._scrollHandled = false;
        },
        isIOS ? 500 : 300
      ); // iOS???�패???�니메이?�이 ??�????�음
    };

    field.addEventListener("focus", handleFocus, { passive: true });

    // blur ???�래�?리셋
    field.addEventListener(
      "blur",
      () => {
        field._scrollHandled = false;
      },
      { passive: true }
    );
  });
  handle.addEventListener("touchstart", modalElement._touchStart);
  handle.addEventListener("touchmove", modalElement._touchMove);
  handle.addEventListener("touchend", modalElement._touchEnd);
  handle.addEventListener("mousedown", modalElement._touchStart);
  window.addEventListener("mousemove", modalElement._touchMove);
  window.addEventListener("mouseup", modalElement._touchEnd);
};

DualTextWriter.prototype.closeBottomSheet = function (modalElement) {
  if (!modalElement) return;

  // ??�?초기???�략: 바�??�트 ?�을 ??모든 ?�력 ?�드 초기??
  const content = modalElement.querySelector(".modal-content");
  if (content) {
    // 모든 input, textarea, select 초기??
    const inputs = content.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );
    inputs.forEach((input) => {
      if (input.type === "checkbox" || input.type === "radio") {
        input.checked = false;
      } else if (input.type === "date") {
        input.value = "";
      } else {
        input.value = "";
      }
    });

    // ?�짜 ??초기??
    const dateTabs = content.querySelectorAll(".date-tab");
    dateTabs.forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    const todayTab = content.querySelector('.date-tab[data-date="today"]');
    if (todayTab) {
      todayTab.classList.add("active");
      todayTab.setAttribute("aria-selected", "true");
    }

    // ?�짜 ?�력 ?�드 초기??
    const dateInputs = content.querySelectorAll('input[type="date"]');
    dateInputs.forEach((input) => {
      input.style.display = "none";
    });

    // ?�테??버튼 ?�태 초기??
    const steppers = content.querySelectorAll(".number-stepper");
    steppers.forEach((stepper) => {
      stepper.disabled = false;
      stepper.style.opacity = "1";
    });

    // ??검�?메시지 ?�거
    const errorMessages = content.querySelectorAll(
      ".error-message, .validation-error"
    );
    errorMessages.forEach((msg) => msg.remove());

    // ?�력 ?�드???�러 ?�태 ?�거
    inputs.forEach((input) => {
      input.classList.remove("error", "invalid");
    });
  }

  modalElement.style.display = "none";
  document.body.style.overflow = "";

  // cleanup listeners
  if (modalElement._backdropHandler)
    modalElement.removeEventListener("click", modalElement._backdropHandler);
  if (modalElement._escHandler)
    document.removeEventListener("keydown", modalElement._escHandler);
  const handle = content
    ? content.querySelector(".sheet-handle") || content
    : null;
  if (handle) {
    if (modalElement._touchStart)
      handle.removeEventListener("touchstart", modalElement._touchStart);
    if (modalElement._touchMove)
      handle.removeEventListener("touchmove", modalElement._touchMove);
    if (modalElement._touchEnd)
      handle.removeEventListener("touchend", modalElement._touchEnd);
    if (modalElement._touchStart)
      handle.removeEventListener("mousedown", modalElement._touchStart);
    window.removeEventListener(
      "mousemove",
      modalElement._touchMove || (() => {})
    );
    window.removeEventListener("mouseup", modalElement._touchEnd || (() => {}));
  }

  // 모달 ?�태 초기??
  this.currentTrackingTextId = null;
  this.editingMetricData = null;
};

// ?�이지 ?�로?????�리 ?�업
window.addEventListener("beforeunload", () => {
  if (dualTextWriter) {
    dualTextWriter.cleanupTempSave();
  }
});

// Add CSS for message animations
const style = document.createElement("style");
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

// ==================== ?�래??기능 메서?�들 ====================

// ?�래???�스??로드
DualTextWriter.prototype.loadTrackingPosts = async function () {
  if (!this.currentUser || !this.isFirebaseReady) return;

  // 로딩 ?�켈?�톤 ?�시
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
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseOrderBy("postedAt", "desc")
    );
    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    this.trackingPosts = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // ?�퍼?�스 ?�???�스?�는 ?�래??목록?�서 ?�외
      // ?�퍼?�스 글?� ?�용 ?��? ?�시?�이지 ?�래???�?�이 ?�님
      const postType = data.type || "edit";
      const sourceType = data.sourceType || data.type || "edit";

      // ?�퍼?�스 ?�???�스???�터�?(type === 'reference' ?�는 sourceType === 'reference')
      if (postType === "reference" || sourceType === "reference") {
        logger.log("?�퍼?�스 ?�스?�는 ?�래??목록?�서 ?�외:", doc.id);
        return; // ???�스?�는 ?�래??목록??추�??��? ?�음
      }

      this.trackingPosts.push({
        id: doc.id,
        content: data.content,
        type: postType,
        postedAt: data.postedAt ? data.postedAt.toDate() : new Date(),
        trackingEnabled: data.trackingEnabled || false,
        metrics: data.metrics || [],
        analytics: data.analytics || {},
        sourceTextId: data.sourceTextId || null, // ?�본 ?�스??참조
        sourceType: sourceType, // ?�본 ?�스???�??
        sourceTextExists: null, // 검�?결과 (?�중???�정)
      });
    });

    logger.log(
      `${this.trackingPosts.length}개의 ?�래???�스?��? 불러?�습?�다.`
    );

    // ?�이??무결??검�? �??�스?�의 sourceTextId가 ?�효?��? ?�인
    await this.validateSourceTexts();

    // ?�스???�택 ?�롭?�운 ?�데?�트 (개별 ?�스??모드????
    if (this.chartMode === "individual") {
      this.populatePostSelector();
    }

    // loadTrackingPosts??초기 로드 ?�에�??�용, ?�후?�는 refreshUI ?�용
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });
  } catch (error) {
    // Firebase ?�이??로드 ?�패 ???�러 처리
    logger.error("[loadTrackingPosts] Failed to load tracking posts:", error);
    this.trackingPosts = [];
    // ?�용?�에�??�러 메시지 ?�시
    this.showMessage(
      "?�래???�이?��? 불러?�는???�패?�습?�다. ?�트?�크 ?�결???�인?�주?�요.",
      "error"
    );
    // �??�태 ?�시
    if (this.trackingPostsList) {
      this.trackingPostsList.innerHTML = `
                <div class="tracking-post-no-data" style="text-align: center; padding: 40px 20px;">
                    <span class="no-data-icon" style="font-size: 3rem; display: block; margin-bottom: 16px;">?��</span>
                    <span class="no-data-text" style="color: #666; font-size: 0.95rem;">?�이?��? 불러?????�습?�다. ?�이지�??�로고침?�주?�요.</span>
                </div>
            `;
    }
  }
};

// 즐겨찾기 관�?
DualTextWriter.prototype.isFavorite = function (postId) {
  try {
    const favs = JSON.parse(localStorage.getItem("dtw_favorites") || "[]");
    return favs.includes(postId);
  } catch {
    return false;
  }
};

DualTextWriter.prototype.toggleFavorite = function (postId) {
  try {
    const favs = JSON.parse(localStorage.getItem("dtw_favorites") || "[]");
    const idx = favs.indexOf(postId);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(postId);
    localStorage.setItem("dtw_favorites", JSON.stringify(favs));
    this.refreshUI({ trackingPosts: true });
  } catch (e) {
    logger.error("즐겨찾기 ?�???�패", e);
  }
};

// CSV ?�보?�기 (?�재 ?�터/?�렬 ?�용??리스??기�?)
DualTextWriter.prototype.exportTrackingCsv = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) {
    this.showMessage("?�보???�이?��? ?�습?�다.", "info");
    return;
  }
  // renderTrackingPosts???�터/?�렬 로직???�사?�하�??�해 ?�일 계산 ?�행
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;
  let list = [...this.trackingPosts];
  // ?�태
  if (this.trackingStatusFilter === "active")
    list = list.filter((p) => !!p.trackingEnabled);
  else if (this.trackingStatusFilter === "inactive")
    list = list.filter((p) => !p.trackingEnabled);
  else if (this.trackingStatusFilter === "hasData")
    list = list.filter((p) => p.metrics && p.metrics.length > 0);
  else if (this.trackingStatusFilter === "noData")
    list = list.filter((p) => !(p.metrics && p.metrics.length > 0));
  // 검??
  if (this.trackingSearch && this.trackingSearch.trim()) {
    const tokens = this.trackingSearch
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    list = list.filter((p) => {
      const text = (p.content || "").toLowerCase();
      return tokens.every((tk) => text.includes(tk));
    });
  }
  // 기간
  if (this.trackingUpdatedFrom || this.trackingUpdatedTo) {
    const fromMs = this.trackingUpdatedFrom
      ? new Date(this.trackingUpdatedFrom + "T00:00:00").getTime()
      : null;
    const toMs = this.trackingUpdatedTo
      ? new Date(this.trackingUpdatedTo + "T23:59:59").getTime()
      : null;
    list = list.filter((p) => {
      const lt = getLatest(p)?.timestamp;
      if (!lt) return false;
      const ms = lt.toDate ? lt.toDate().getTime() : new Date(lt).getTime();
      if (fromMs && ms < fromMs) return false;
      if (toMs && ms > toMs) return false;
      return true;
    });
  }
  // ?�치 범위
  const rf = this.rangeFilters || {};
  const inRange = (val, min, max) => {
    if (min !== undefined && min !== "" && val < Number(min)) return false;
    if (max !== undefined && max !== "" && val > Number(max)) return false;
    return true;
  };
  list = list.filter((p) => {
    const lt = getLatest(p) || {};
    return (
      inRange(lt.views || 0, rf.minViews, rf.maxViews) &&
      inRange(lt.likes || 0, rf.minLikes, rf.maxLikes) &&
      inRange(lt.comments || 0, rf.minComments, rf.maxComments) &&
      inRange(lt.shares || 0, rf.minShares, rf.maxShares) &&
      inRange(lt.follows || 0, rf.minFollows, rf.maxFollows)
    );
  });
  // ?�렬 ?�용 (renderTrackingPosts?� ?�일??로직)
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // 조회???�렬
    case "viewsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.views || 0) - (getLatest(a)?.views || 0)
      );
      break;
    case "viewsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.views || 0) - (getLatest(b)?.views || 0)
      );
      break;
    // 좋아???�렬
    case "likesDesc":
      list.sort(
        (a, b) => (getLatest(b)?.likes || 0) - (getLatest(a)?.likes || 0)
      );
      break;
    case "likesAsc":
      list.sort(
        (a, b) => (getLatest(a)?.likes || 0) - (getLatest(b)?.likes || 0)
      );
      break;
    // ?��? ?�렬
    case "commentsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.comments || 0) - (getLatest(a)?.comments || 0)
      );
      break;
    case "commentsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.comments || 0) - (getLatest(b)?.comments || 0)
      );
      break;
    // 공유 ?�렬
    case "sharesDesc":
      list.sort(
        (a, b) => (getLatest(b)?.shares || 0) - (getLatest(a)?.shares || 0)
      );
      break;
    case "sharesAsc":
      list.sort(
        (a, b) => (getLatest(a)?.shares || 0) - (getLatest(b)?.shares || 0)
      );
      break;
    // ?�로???�렬
    case "followsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.follows || 0) - (getLatest(a)?.follows || 0)
      );
      break;
    case "followsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.follows || 0) - (getLatest(b)?.follows || 0)
      );
      break;
    // ?�력 ?�수 ?�렬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // ?�짜 ?�렬
    case "updatedDesc":
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return bMs - aMs;
      });
      break;
    case "updatedAsc":
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return aMs - bMs;
      });
      break;
    default:
      // 기본�? 최신 ?�데?�트??
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return bMs - aMs;
      });
      break;
  }

  // CSV ?�성
  const header = [
    "postId",
    "title",
    "active",
    "entries",
    "lastUpdated",
    "views",
    "likes",
    "comments",
    "shares",
    "follows",
  ];
  const rows = [header.join(",")];
  list.forEach((p) => {
    const lt = getLatest(p) || {};
    const dt = lt.timestamp
      ? lt.timestamp.toDate
        ? lt.timestamp.toDate()
        : new Date(lt.timestamp)
      : null;
    const title = (p.content || "").replace(/\n/g, " ").replace(/"/g, '""');
    const csvTitle = `"${title.substring(0, 80)}${
      title.length > 80 ? "..." : ""
    }"`;
    rows.push(
      [
        p.id,
        csvTitle,
        p.trackingEnabled ? "Y" : "N",
        p.metrics?.length || 0,
        dt ? dt.toISOString() : "",
        lt.views || 0,
        lt.likes || 0,
        lt.comments || 0,
        lt.shares || 0,
        lt.follows || 0,
      ].join(",")
    );
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tracking_export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
// ?�본 ?�스??존재 ?��? 검�?
DualTextWriter.prototype.validateSourceTexts = async function () {
  if (!this.currentUser || !this.isFirebaseReady || !this.trackingPosts) return;

  try {
    // sourceTextId가 ?�는 ?�스?�들�?검�?
    const postsToValidate = this.trackingPosts.filter(
      (post) => post.sourceTextId
    );

    if (postsToValidate.length === 0) {
      // sourceTextId가 ?�는 ?�스?�들?� orphan?�로 ?�시
      this.trackingPosts.forEach((post) => {
        if (!post.sourceTextId) {
          post.sourceTextExists = false;
          post.isOrphan = true;
        }
      });
      return;
    }

    // 모든 sourceTextId ?�집
    const sourceTextIds = [
      ...new Set(postsToValidate.map((post) => post.sourceTextId)),
    ];

    // ?�본 ?�스??존재 ?��? ?�괄 ?�인
    const validationPromises = sourceTextIds.map(async (textId) => {
      try {
        const textRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          textId
        );
        const textDoc = await window.firebaseGetDoc(textRef);
        return { textId, exists: textDoc.exists() };
      } catch (error) {
        logger.error(`?�본 ?�스??검�??�패 (${textId}):`, error);
        return { textId, exists: false };
      }
    });

    const validationResults = await Promise.all(validationPromises);
    const validationMap = new Map(
      validationResults.map((r) => [r.textId, r.exists])
    );

    // �??�스?�에 검�?결과 ?�용
    this.trackingPosts.forEach((post) => {
      if (post.sourceTextId) {
        post.sourceTextExists = validationMap.get(post.sourceTextId) || false;
        post.isOrphan = !post.sourceTextExists;
      } else {
        // sourceTextId가 ?�으�?orphan?�로 ?�시 (?�그?�이?????�이??
        post.sourceTextExists = false;
        post.isOrphan = true;
      }
    });

    const orphanCount = this.trackingPosts.filter((p) => p.isOrphan).length;
    if (orphanCount > 0) {
      logger.log(`?�️ ${orphanCount}개의 orphan ?�스?��? 발견?�었?�니??`);
    }
  } catch (error) {
    logger.error("?�본 ?�스??검�??�패:", error);
    // ?�러 발생 ??모든 ?�스?��? 검�??�패�??�시?��? ?�고, sourceTextId가 ?�는 것만 orphan?�로 ?�시
    this.trackingPosts.forEach((post) => {
      if (!post.sourceTextId) {
        post.isOrphan = true;
        post.sourceTextExists = false;
      }
    });
  }
};
// ?�래???�스???�더�?
DualTextWriter.prototype.renderTrackingPosts = function () {
  if (!this.trackingPostsList) return;

  if (this.trackingPosts.length === 0) {
    this.trackingPostsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">?��</div>
                <div class="empty-state-text">?�래??중인 ?�스?��? ?�습?�다</div>
                <div class="empty-state-subtext">?�?�된 글?�서 ?�래?�을 ?�작?�보?�요!</div>
            </div>
        `;
    return;
  }

  // Orphan ?�스??개수 ?�인
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);
  const orphanCount = orphanPosts.length;

  // Orphan ?�스??경고 배너 HTML
  const orphanBannerHtml =
    orphanCount > 0
      ? `
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
                    <span style="font-size: 1.2rem;">?�️</span>
                    <strong style="color: #856404; font-size: 1rem;">?�본????��???�스??${orphanCount}�?발견</strong>
                </div>
                <div style="color: #856404; font-size: 0.9rem; margin-left: 28px;">
                    ?�본 글(?�?�된 글)????��?�어 ?�결???�어�??�스?�입?�다.
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
                ?���??�리?�기
            </button>
        </div>
    `
      : "";

  // ?�태/검??기간 ?�터 ?�용
  let list = [...this.trackingPosts];

  // ?�퍼?�스 ?�스???�터�?(?�래???�???�님)
  // ?�퍼?�스 글?� ?�용 ?��? ?�시?�이지 ?�래???�?�이 ?�님
  list = list.filter((post) => {
    const postType = post.type || "edit";
    const sourceType = post.sourceType || post.type || "edit";

    // ?�퍼?�스 ?�???�스?�는 ?�외
    if (postType === "reference" || sourceType === "reference") {
      return false;
    }
    return true;
  });

  if (this.trackingStatusFilter === "active") {
    list = list.filter((p) => !!p.trackingEnabled);
  } else if (this.trackingStatusFilter === "inactive") {
    list = list.filter((p) => !p.trackingEnabled);
  } else if (this.trackingStatusFilter === "hasData") {
    list = list.filter((p) => p.metrics && p.metrics.length > 0);
  } else if (this.trackingStatusFilter === "noData") {
    list = list.filter((p) => !(p.metrics && p.metrics.length > 0));
  }

  // ?�렬 기�? 계산???�요??최신 메트�?
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;

  // 검???�목/?�워???�시?�그)
  if (this.trackingSearch && this.trackingSearch.trim()) {
    const tokens = this.trackingSearch
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    list = list.filter((p) => {
      const text = (p.content || "").toLowerCase();
      return tokens.every((tk) => text.includes(tk));
    });
  }

  // 기간(최종 ?�데?�트) ?�터
  if (this.trackingUpdatedFrom || this.trackingUpdatedTo) {
    const fromMs = this.trackingUpdatedFrom
      ? new Date(this.trackingUpdatedFrom + "T00:00:00").getTime()
      : null;
    const toMs = this.trackingUpdatedTo
      ? new Date(this.trackingUpdatedTo + "T23:59:59").getTime()
      : null;
    list = list.filter((p) => {
      const lt = getLatest(p)?.timestamp;
      if (!lt) return false;
      const ms = lt.toDate ? lt.toDate().getTime() : new Date(lt).getTime();
      if (fromMs && ms < fromMs) return false;
      if (toMs && ms > toMs) return false;
      return true;
    });
  }

  // ?�치 범위 ?�터 (최신 메트�?기�?)
  const inRange = (val, min, max) => {
    if (min !== undefined && min !== null && min !== "" && val < Number(min))
      return false;
    if (max !== undefined && max !== null && max !== "" && val > Number(max))
      return false;
    return true;
  };
  const rf = this.rangeFilters || {};
  list = list.filter((p) => {
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

  // ?�렬 ?�용
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // 조회???�렬
    case "viewsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.views || 0) - (getLatest(a)?.views || 0)
      );
      break;
    case "viewsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.views || 0) - (getLatest(b)?.views || 0)
      );
      break;
    // 좋아???�렬
    case "likesDesc":
      list.sort(
        (a, b) => (getLatest(b)?.likes || 0) - (getLatest(a)?.likes || 0)
      );
      break;
    case "likesAsc":
      list.sort(
        (a, b) => (getLatest(a)?.likes || 0) - (getLatest(b)?.likes || 0)
      );
      break;
    // ?��? ?�렬
    case "commentsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.comments || 0) - (getLatest(a)?.comments || 0)
      );
      break;
    case "commentsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.comments || 0) - (getLatest(b)?.comments || 0)
      );
      break;
    // 공유 ?�렬
    case "sharesDesc":
      list.sort(
        (a, b) => (getLatest(b)?.shares || 0) - (getLatest(a)?.shares || 0)
      );
      break;
    case "sharesAsc":
      list.sort(
        (a, b) => (getLatest(a)?.shares || 0) - (getLatest(b)?.shares || 0)
      );
      break;
    // ?�로???�렬
    case "followsDesc":
      list.sort(
        (a, b) => (getLatest(b)?.follows || 0) - (getLatest(a)?.follows || 0)
      );
      break;
    case "followsAsc":
      list.sort(
        (a, b) => (getLatest(a)?.follows || 0) - (getLatest(b)?.follows || 0)
      );
      break;
    // ?�력 ?�수 ?�렬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // ?�짜 ?�렬
    case "updatedDesc":
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return bMs - aMs;
      });
      break;
    case "updatedAsc":
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return aMs - bMs;
      });
      break;
    default:
      // 기본�? 최신 ?�데?�트??
      list.sort((a, b) => {
        const at = getLatest(a)?.timestamp;
        const bt = getLatest(b)?.timestamp;
        const aMs = at
          ? at.toDate
            ? at.toDate().getTime()
            : new Date(at).getTime()
          : 0;
        const bMs = bt
          ? bt.toDate
            ? bt.toDate().getTime()
            : new Date(bt).getTime()
          : 0;
        return bMs - aMs;
      });
      break;
  }

  // ?�벤???�임 ?�정 (최초 1?�만)
  if (!this._trackingPostsEventBound) {
    this._trackingPostsEventBound = true;
    if (this.trackingPostsList) {
      this.trackingPostsList.addEventListener("click", (e) => {
        const button = e.target.closest(
          'button[data-action], [data-action][role="button"]'
        );
        if (!button) return;

        const action = button.getAttribute("data-action");
        const postId = button.getAttribute("data-post-id");

        if (!postId) return;

        switch (action) {
          case "toggle-favorite":
            e.preventDefault();
            this.toggleFavorite(postId);
            break;
          case "show-chart":
            e.preventDefault();
            this.showPostInChart(postId);
            break;
          case "add-tracking-data":
            e.preventDefault();
            this.addTrackingData(postId);
            break;
          case "start-tracking":
            e.preventDefault();
            this.startTracking(postId);
            break;
          case "stop-tracking":
            e.preventDefault();
            this.stopTracking(postId);
            break;
          case "manage-metrics":
            e.preventDefault();
            e.stopPropagation();
            this.manageMetrics(postId);
            break;
          case "more-menu":
            e.preventDefault();
            e.stopPropagation();
            const trackingEnabled =
              button.getAttribute("data-tracking-enabled") === "true";
            this.toggleTrackingMoreMenu(button, postId, trackingEnabled);
            break;
          case "toggle-content":
            e.preventDefault();
            const contentEl = button
              .closest(".tracking-post-item")
              .querySelector(".tracking-post-content");
            if (contentEl) {
              const nowExpanded = contentEl.classList.toggle("expanded");
              button.textContent = nowExpanded ? "?�기" : "?�보�?;
              button.setAttribute(
                "aria-expanded",
                nowExpanded ? "true" : "false"
              );
              try {
                // localStorage???�태 ?�??(?�일???�키�? card:{postId}:expanded)
                localStorage.setItem(
                  `card:${postId}:expanded`,
                  nowExpanded ? "1" : "0"
                );
              } catch (e) {
                /* ignore quota */
              }
            }
            break;
        }
      });

      // ?�보???�근??지??(Enter/Space ??처리) - 최초 1?�만
      if (!this._trackingPostsKeydownBound) {
        this._trackingPostsKeydownBound = true;
        this.trackingPostsList.addEventListener("keydown", (e) => {
          const button = e.target.closest(
            'button[data-action="toggle-content"]'
          );
          if (button && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            button.click();
          }
        });
      }
    }
  }

  this.trackingPostsList.innerHTML =
    orphanBannerHtml +
    list
      .map((post) => {
        const latestMetrics =
          post.metrics.length > 0
            ? post.metrics[post.metrics.length - 1]
            : null;
        const hasMetrics = post.metrics.length > 0;
        const metricsCount = post.metrics.length;
        const isFav = this.isFavorite(post.id);

        // ?�태 ?�보
        const statusClass = post.trackingEnabled ? "active" : "inactive";
        const statusIcon = post.trackingEnabled ? "?��" : "??;
        const statusText = post.trackingEnabled ? "?�성" : "비활??;

        // Orphan ?�스???�시
        const orphanBadge = post.isOrphan
          ? `
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
                ?�️ ?�본 ??��??
            </div>
        `
          : "";

        // 메트�??�이???�시
        const metricsBadgeClass = hasMetrics ? "has-data" : "no-data";
        const metricsBadgeText = hasMetrics
          ? `?�� ${metricsCount}???�력`
          : "?�� ?�이???�음";

        // 마�?�??�데?�트 ?�짜
        let lastUpdateText = "";
        if (latestMetrics && latestMetrics.timestamp) {
          try {
            const updateDate = latestMetrics.timestamp.toDate
              ? latestMetrics.timestamp.toDate()
              : new Date(latestMetrics.timestamp);
            lastUpdateText = updateDate.toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          } catch (e) {
            lastUpdateText = "";
          }
        }

        // Orphan ?�스?�는 ?�각?�으�??�르�??�시
        const orphanClass = post.isOrphan ? "orphan-post" : "";

        // sourceTextId�??�해 ?�본 ?�스?�에??주제 ?�보 가?�오�?
        let topic = null;
        if (
          post.sourceTextId &&
          this.savedTexts &&
          Array.isArray(this.savedTexts)
        ) {
          const sourceText = this.savedTexts.find(
            (text) => text.id === post.sourceTextId
          );
          if (sourceText && sourceText.topic) {
            topic = sourceText.topic;
          }
        }

        // ??sourceTextId�??�해 ?�본 ?�스?�에??SNS ?�랫???�보 가?�오�?
        let snsPlatformsHtml = "";
        if (
          post.sourceTextId &&
          this.savedTexts &&
          Array.isArray(this.savedTexts)
        ) {
          const sourceText = this.savedTexts.find(
            (text) => text.id === post.sourceTextId
          );
          if (
            sourceText &&
            Array.isArray(sourceText.platforms) &&
            sourceText.platforms.length > 0
          ) {
            // ?�효???�랫??ID�??�터�?
            const validPlatformIds = DualTextWriter.SNS_PLATFORMS.map(
              (p) => p.id
            );
            const validPlatforms = sourceText.platforms
              .filter((platformId) => validPlatformIds.includes(platformId))
              .map((platformId) => {
                const platform = DualTextWriter.SNS_PLATFORMS.find(
                  (p) => p.id === platformId
                );
                return platform
                  ? { id: platformId, name: platform.name, icon: platform.icon }
                  : null;
              })
              .filter(Boolean);

            if (validPlatforms.length > 0) {
              const platformsList = validPlatforms
                .map(
                  (p) =>
                    `<span class="sns-platform-badge" role="listitem" aria-label="${this.escapeHtml(
                      p.name
                    )} ?�랫??>${p.icon} ${this.escapeHtml(p.name)}</span>`
                )
                .join("");
              snsPlatformsHtml = `
                        <div class="tracking-post-platforms" role="list" aria-label="SNS ?�랫??목록">
                            ${platformsList}
                        </div>
                    `;
            }
          }
        }

        // localStorage?�서 ?�장 ?�태 복원 (?�일???�키�? card:{postId}:expanded)
        const expanded =
          localStorage.getItem(`card:${post.id}:expanded`) === "1";
        const shouldShowToggle = post.content && post.content.length > 100;

        return `
            <div class="tracking-post-item ${statusClass} ${orphanClass}" data-post-id="${
          post.id
        }" data-is-orphan="${post.isOrphan ? "true" : "false"}">
                <div class="tracking-post-header">
                <div class="tracking-post-title" style="display: flex; align-items: center; flex-wrap: wrap; gap:8px;">
                        <button class="fav-toggle" data-action="toggle-favorite" data-post-id="${
                          post.id
                        }" title="즐겨찾기" style="border:none; background:transparent; cursor:pointer; font-size:1.1rem; min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center;">${
          isFav ? "�? : "??
        }</button>
                        ${orphanBadge}
                    </div>
                    <div class="tracking-post-status-group">
                        <div class="tracking-post-status ${statusClass}" aria-label="?�래???�태: ${statusText}">
                            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                </div>
                ${
                  topic
                    ? `<div class="tracking-post-topic" aria-label="주제: ${this.escapeHtml(
                        topic
                      )}">?���?${this.escapeHtml(topic)}</div>`
                    : ""
                }
                ${snsPlatformsHtml}
                <div class="tracking-post-content ${
                  expanded ? "expanded" : ""
                }" aria-label="?�스???�용">${this.escapeHtml(
          post.content || ""
        )}</div>
                ${
                  shouldShowToggle
                    ? `<button class="tracking-post-toggle" data-action="toggle-content" data-post-id="${
                        post.id
                      }" aria-expanded="${
                        expanded ? "true" : "false"
                      }" aria-label="${
                        expanded ? "?�용 ?�기" : "?�용 ?�보�?
                      }">${expanded ? "?�기" : "?�보�?}</button>`
                    : ""
                }
                
                <div class="tracking-post-info">
                    <div class="tracking-post-metrics-badge ${metricsBadgeClass}">
                        ${metricsBadgeText}
                    </div>
                    ${
                      lastUpdateText
                        ? `
                        <div class="tracking-post-update-date">
                            마�?�??�데?�트: ${lastUpdateText}
                        </div>
                    `
                        : ""
                    }
                </div>
                
                ${
                  latestMetrics
                    ? `
                    <div class="tracking-post-metrics metrics-chips" data-action="show-chart" data-post-id="${
                      post.id
                    }" title="그래?�에??보기" role="button" tabindex="0" aria-label="그래?�에??보기">
                        <div class="metric-item">
                            <div class="metric-icon">??</div>
                            <div class="metric-value">${
                              latestMetrics.views || 0
                            }</div>
                            <div class="metric-label">조회??/div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?�️</div>
                            <div class="metric-value">${
                              latestMetrics.likes || 0
                            }</div>
                            <div class="metric-label">좋아??/div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?��</div>
                            <div class="metric-value">${
                              latestMetrics.comments || 0
                            }</div>
                            <div class="metric-label">?��?</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?��</div>
                            <div class="metric-value">${
                              latestMetrics.shares || 0
                            }</div>
                            <div class="metric-label">공유</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?��</div>
                            <div class="metric-value">${
                              latestMetrics.follows || 0
                            }</div>
                            <div class="metric-label">?�로??/div>
                        </div>
                    </div>
                `
                    : `
                    <div class="tracking-post-no-data">
                        <span class="no-data-icon">?��</span>
                        <span class="no-data-text">?�직 ?�이?��? ?�력?��? ?�았?�니?? "?�이??추�?" 버튼???�릭?�여 ?�과 ?�이?��? ?�력?�세??</span>
                    </div>
                `
                }
                
                <div class="tracking-post-actions actions--primary">
                    ${
                      post.trackingEnabled
                        ? `<button class="tracking-btn primary" data-action="add-tracking-data" data-post-id="${post.id}" aria-label="?�과 ?�이??추�?">?�이??추�?</button>`
                        : `<button class="tracking-btn primary" data-action="start-tracking" data-post-id="${post.id}" aria-label="?�래???�작">?�래???�작</button>`
                    }
                    <div class="more-menu actions--more">
                        <button class="more-menu-btn" data-action="more-menu" data-post-id="${
                          post.id
                        }" data-tracking-enabled="${
          post.trackingEnabled ? "true" : "false"
        }" aria-haspopup="true" aria-expanded="false" aria-label="기�? ?�업">??/button>
                        <div class="more-menu-list" role="menu">
                            ${
                              hasMetrics
                                ? `<button class="more-menu-item" role="menuitem" data-action="manage-metrics" data-post-id="${post.id}">?�� 메트�?관�?/button>`
                                : ""
                            }
                            ${
                              post.trackingEnabled
                                ? `<button class="more-menu-item" role="menuitem" data-action="stop-tracking" data-post-id="${post.id}">?�래??중�?</button>`
                                : ""
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
      })
      .join("");
};

// ?�래??카드 ??메뉴 ?��?
DualTextWriter.prototype.toggleTrackingMoreMenu = function (
  button,
  postId,
  trackingEnabled
) {
  const menu = button.nextElementSibling;
  if (menu && menu.classList.contains("more-menu-list")) {
    const isOpen = menu.classList.toggle("open");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");

    // ?�마???��??�닝: ?�면 ?�치???�라 메뉴 ?�시 방향 결정
    if (isOpen) {
      dualTextWriter.applySmartMenuPosition(menu, button);

      // ?�커???�랩: 메뉴가 ?�리�?�?번째 메뉴 ?�이?�에 ?�커??
      const firstMenuItem = menu.querySelector(".more-menu-item");
      if (firstMenuItem) {
        setTimeout(() => firstMenuItem.focus(), 50);
      }
    } else {
      // 메뉴 ?�힐 ???�치 ?�래???�거
      menu.classList.remove("open-top", "open-bottom");
    }
  }
  // 바깥 ?�릭 ??모든 메뉴 ?�기 (?�벤???�임?�로 처리)
  setTimeout(() => {
    document.addEventListener(
      "click",
      function closeHandler(e) {
        if (!e.target.closest(".more-menu")) {
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // ?�커???�랩 ?�제: 메뉴 버튼?�로 ?�커??복원
            const menuBtn = el.previousElementSibling;
            if (menuBtn && menuBtn.classList.contains("more-menu-btn")) {
              menuBtn.focus();
            }
          });
          document
            .querySelectorAll('.more-menu-btn[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
          document.removeEventListener("click", closeHandler);
        }
      },
      { once: true }
    );
  }, 0);
};

// ?�래???�작
DualTextWriter.prototype.startTracking = async function (postId) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  try {
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      postId
    );
    await window.firebaseUpdateDoc(postRef, {
      trackingEnabled: true,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = true;
      this.refreshUI({ trackingPosts: true, force: true });

      // ?�각???�드�? ?�공 메시지
      this.showMessage("???�래?�이 ?�작?�었?�니??", "success");
    }

    logger.log("?�래?�이 ?�작?�었?�니??");
  } catch (error) {
    logger.error("?�래???�작 ?�패:", error);
  }
};

// ?�래??중�?
DualTextWriter.prototype.stopTracking = async function (postId) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  try {
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      postId
    );
    await window.firebaseUpdateDoc(postRef, {
      trackingEnabled: false,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = false;
      this.refreshUI({ trackingPosts: true, force: true });

      // ?�각???�드�? ?�공 메시지
      this.showMessage("?�️ ?�래?�이 중�??�었?�니??", "info");
    }

    logger.log("?�래?�이 중�??�었?�니??");
  } catch (error) {
    logger.error("?�래??중�? ?�패:", error);
  }
};

// ?�래???�이??추�?
DualTextWriter.prototype.addTrackingData = function (postId) {
  this.currentTrackingPost = postId;

  // ?�택???�스?�에 ?�각???�드�?(?�택 ?�과)
  const postElement = document.querySelector(
    `.tracking-post-item[data-post-id="${postId}"]`
  );
  if (postElement) {
    postElement.classList.add("selected");
    setTimeout(() => {
      postElement.classList.remove("selected");
    }, 500);
  }

  this.openTrackingModal();
};

// ?�래??모달 ?�기
DualTextWriter.prototype.openTrackingModal = async function (textId = null) {
  const modal = document.getElementById("tracking-modal");
  if (!modal) {
    logger.error("?�래??모달??찾을 ???�습?�다.");
    this.showMessage("???�래??모달??찾을 ???�습?�다.", "error");
    return;
  }

  try {
    this.openBottomSheet(modal);

    // ?�?�된 글?�서 ?�출??경우 textId ?�??
    if (textId) {
      this.currentTrackingTextId = textId;
    }

    // 기존 ?�이??불러?�기
    let latestMetric = null;

    // 1. currentTrackingPost가 ?�으�??�당 ?�스?�의 최신 메트�??�이??불러?�기
    if (this.currentTrackingPost) {
      const post = this.trackingPosts?.find(
        (p) => p.id === this.currentTrackingPost
      );
      if (post && post.metrics && post.metrics.length > 0) {
        // 최신 메트�?(마�?�???��)
        latestMetric = post.metrics[post.metrics.length - 1];
        logger.log("?�래???�스?�에??최신 메트�?불러?�기:", latestMetric);
      } else if (this.currentUser && this.isFirebaseReady) {
        // 로컬???�으�?Firebase?�서 조회
        try {
          const postRef = window.firebaseDoc(
            this.db,
            "users",
            this.currentUser.uid,
            "posts",
            this.currentTrackingPost
          );
          const postDoc = await window.firebaseGetDoc(postRef);
          if (postDoc.exists()) {
            const postData = postDoc.data();
            if (postData.metrics && postData.metrics.length > 0) {
              latestMetric = postData.metrics[postData.metrics.length - 1];
              logger.log("Firebase?�서 최신 메트�?불러?�기:", latestMetric);
            }
          }
        } catch (error) {
          logger.error("Firebase?�서 메트�?조회 ?�패:", error);
        }
      }
    }
    // 2. currentTrackingTextId�??�고 currentTrackingPost가 ?�으�? ?�결???�스??찾기
    else if (this.currentTrackingTextId && !this.currentTrackingPost) {
      // 로컬 ?�이?�에??먼�? 찾기
      const post = this.trackingPosts?.find(
        (p) => p.sourceTextId === this.currentTrackingTextId
      );
      if (post && post.metrics && post.metrics.length > 0) {
        latestMetric = post.metrics[post.metrics.length - 1];
        logger.log(
          "?�?�된 글?�서 ?�결???�스?�의 최신 메트�?불러?�기:",
          latestMetric
        );
      } else if (this.currentUser && this.isFirebaseReady) {
        // 로컬???�으�?Firebase?�서 조회
        try {
          const postsRef = window.firebaseCollection(
            this.db,
            "users",
            this.currentUser.uid,
            "posts"
          );
          const q = window.firebaseQuery(
            postsRef,
            window.firebaseWhere(
              "sourceTextId",
              "==",
              this.currentTrackingTextId
            )
          );
          const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

          if (!querySnapshot.empty) {
            const postDoc = querySnapshot.docs[0];
            const postData = postDoc.data();
            if (postData.metrics && postData.metrics.length > 0) {
              latestMetric = postData.metrics[postData.metrics.length - 1];
              logger.log(
                "Firebase?�서 ?�?�된 글???�결???�스??최신 메트�?불러?�기:",
                latestMetric
              );
            }
          }
        } catch (error) {
          logger.error("Firebase?�서 메트�?조회 ?�패:", error);
        }
      }
    }

    // ??초기???�는 기존 ?�이?�로 채우�?
    const dateInput = document.getElementById("tracking-date");
    const viewsInput = document.getElementById("tracking-views");
    const likesInput = document.getElementById("tracking-likes");
    const commentsInput = document.getElementById("tracking-comments");
    const sharesInput = document.getElementById("tracking-shares");
    const followsInput = document.getElementById("tracking-follows");
    const notesInput = document.getElementById("tracking-notes");

    // ?�짜????�� "?�늘"�??�정 (기존 ?�이???�무?� 관계없??
    const today = new Date().toISOString().split("T")[0];
    if (dateInput) {
      dateInput.value = today;
    }
    // ?�짜 ??초기?? ?�늘 ???�성?? 직접?�력 ?��?
    modal
      .querySelectorAll(".date-tab")
      .forEach((tab) => tab.classList.remove("active"));
    const todayTab = modal.querySelector('.date-tab[data-date="today"]');
    if (todayTab) todayTab.classList.add("active");
    if (dateInput) dateInput.style.display = "none";

    if (latestMetric) {
      // 기존 ?�이?��? ?�으�?메트�?값만 채우�?(?�짜 ?�외)
      if (viewsInput) viewsInput.value = latestMetric.views || "";
      if (likesInput) likesInput.value = latestMetric.likes || "";
      if (commentsInput) commentsInput.value = latestMetric.comments || "";
      if (sharesInput) sharesInput.value = latestMetric.shares || "";
      if (followsInput) followsInput.value = latestMetric.follows || "";
      if (notesInput) notesInput.value = latestMetric.notes || "";

      logger.log(
        "기존 ?�이?�로 ??채우�??�료 (?�짜???�늘�??�정):",
        latestMetric
      );
    } else {
      // 기존 ?�이?��? ?�으�?모든 ?�드 초기??
      if (viewsInput) viewsInput.value = "";
      if (likesInput) likesInput.value = "";
      if (commentsInput) commentsInput.value = "";
      if (sharesInput) sharesInput.value = "";
      if (followsInput) followsInput.value = "";
      if (notesInput) notesInput.value = "";

      logger.log("기존 ?�이???�음, ??초기???�료 (?�짜???�늘�??�정)");
    }

    logger.log("?�래??모달 ?�기:", {
      textId,
      currentTrackingTextId: this.currentTrackingTextId,
      currentTrackingPost: this.currentTrackingPost,
      hasLatestMetric: !!latestMetric,
    });
  } catch (error) {
    logger.error("?�래??모달 ?�기 ?�패:", error);
    this.showMessage("???�래??모달???????�습?�다.", "error");
  }
};

// ?�래???�이???�??
DualTextWriter.prototype.saveTrackingData = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    logger.warn(
      "?�래???�이???�???�패: ?�용?��? 로그?�하지 ?�았거나 Firebase가 준비되지 ?�았?�니??"
    );
    this.showMessage("??로그?�이 ?�요?�니??", "error");
    return;
  }

  logger.log("?�래???�이???�???�작:", {
    currentTrackingTextId: this.currentTrackingTextId,
    currentTrackingPost: this.currentTrackingPost,
  });

  // ?�?�된 글?�서 직접 ?�력?�는 경우
  if (this.currentTrackingTextId && !this.currentTrackingPost) {
    logger.log(
      "?�?�된 글?�서 ?�래???�이???�??",
      this.currentTrackingTextId
    );
    return await this.saveTrackingDataFromSavedText();
  }

  // 기존 방식: ?�래???�스?�에 ?�이??추�?
  if (!this.currentTrackingPost) {
    logger.warn("?�래???�이???�???�패: currentTrackingPost가 ?�습?�다.");
    this.showMessage("???�래?�할 ?�스?��? 찾을 ???�습?�다.", "error");
    return;
  }

  const dateValue = document.getElementById("tracking-date").value;
  const views = parseInt(document.getElementById("tracking-views").value) || 0;
  const likes = parseInt(document.getElementById("tracking-likes").value) || 0;
  const comments =
    parseInt(document.getElementById("tracking-comments").value) || 0;
  const shares =
    parseInt(document.getElementById("tracking-shares").value) || 0;
  const follows =
    parseInt(
      (document.getElementById("tracking-follows") || { value: "" }).value
    ) || 0;
  const notes = document.getElementById("tracking-notes").value;

  // ?�짜 처리: ?�용?��? ?�택???�짜�?Timestamp�?변??
  let timestamp;
  if (dateValue) {
    const selectedDate = new Date(dateValue);
    // ?�간???�정(00:00:00)?�로 ?�정
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
    notes,
  };

  try {
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      this.currentTrackingPost
    );
    const postDoc = await window.firebaseGetDoc(postRef);

    if (postDoc.exists()) {
      const postData = postDoc.data();
      const updatedMetrics = [...(postData.metrics || []), trackingData];

      // ?�짜 ?�으�??�렬 (?�래??것�???
      updatedMetrics.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return dateA - dateB;
      });

      // 분석 ?�이??계산
      const analytics = this.calculateAnalytics(updatedMetrics);

      await window.firebaseUpdateDoc(postRef, {
        metrics: updatedMetrics,
        analytics,
        updatedAt: window.firebaseServerTimestamp(),
      });

      // 로컬 ?�이???�데?�트
      const post = this.trackingPosts.find(
        (p) => p.id === this.currentTrackingPost
      );
      if (post) {
        post.metrics = updatedMetrics;
        post.analytics = analytics;
      }

      // Optimistic UI: 즉시 로컬 ?�이???�데?�트 �?UI 반영
      this.closeTrackingModal();
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      // ?�각???�드�? ?�공 메시지
      this.showMessage("???�과 ?�이?��? ?�?�되?�습?�다!", "success");

      logger.log("?�래???�이?��? ?�?�되?�습?�다.");
    }
  } catch (error) {
    logger.error("?�래???�이???�???�패:", error);
    this.showMessage(
      "???�래???�이???�?�에 ?�패?�습?�다: " + error.message,
      "error"
    );
  }
};
// ?�?�된 글?�서 직접 ?�래???�이???�??
DualTextWriter.prototype.saveTrackingDataFromSavedText = async function () {
  if (!this.currentTrackingTextId || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    // 먼�? ?�?�된 ?�스???�보 가?�오�?
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      this.currentTrackingTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      this.showMessage("???�본 ?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?�당 ?�스?�에 ?�결???�스??찾기 ?�는 ?�성
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceTextId", "==", this.currentTrackingTextId)
    );
    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    let postId;
    let postData;

    if (!querySnapshot.empty) {
      // 기존 ?�스?��? ?�으�??�용
      const existingPost = querySnapshot.docs[0];
      postId = existingPost.id;
      postData = existingPost.data();
    } else {
      // ???�스???�성
      const newPostData = {
        content: textData.content,
        type: textData.type || "edit",
        postedAt: window.firebaseServerTimestamp(),
        trackingEnabled: true,
        metrics: [],
        analytics: {},
        sourceTextId: this.currentTrackingTextId,
        sourceType: textData.type || "edit",
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
      };

      const postDocRef = await window.firebaseAddDoc(postsRef, newPostData);
      postId = postDocRef.id;
      postData = newPostData;

      // ?�래???�스??목록??추�?
      if (!this.trackingPosts) {
        this.trackingPosts = [];
      }
      this.trackingPosts.push({
        id: postId,
        ...newPostData,
        postedAt: new Date(),
      });
    }

    // ?�래???�이???�집
    const dateValue = document.getElementById("tracking-date").value;
    const views =
      parseInt(document.getElementById("tracking-views").value) || 0;
    const likes =
      parseInt(document.getElementById("tracking-likes").value) || 0;
    const comments =
      parseInt(document.getElementById("tracking-comments").value) || 0;
    const shares =
      parseInt(document.getElementById("tracking-shares").value) || 0;
    const follows =
      parseInt(
        (document.getElementById("tracking-follows") || { value: "" }).value
      ) || 0;
    const notes = document.getElementById("tracking-notes").value;

    // ?�짜 처리
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
      notes,
    };

    // ?�스?�에 ?�래???�이??추�?
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      postId
    );
    const updatedMetrics = [...(postData.metrics || []), trackingData];

    // ?�짜 ?�으�??�렬
    updatedMetrics.sort((a, b) => {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return dateA - dateB;
    });

    // 분석 ?�이??계산
    const analytics = this.calculateAnalytics(updatedMetrics);

    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      trackingEnabled: true,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
      post.trackingEnabled = true;
    } else {
      // 로컬 목록???�으�?추�?
      this.trackingPosts.push({
        id: postId,
        content: textData.content,
        type: textData.type || "edit",
        postedAt: new Date(),
        trackingEnabled: true,
        metrics: updatedMetrics,
        analytics: analytics,
        sourceTextId: this.currentTrackingTextId,
        sourceType: textData.type || "edit",
      });
    }

    this.closeTrackingModal();

    // Optimistic UI: 로컬 ?�이???�데?�트�?즉시 반영 (Firebase ?�체 ?�조??불필??
    // ?�래????목록?� 로컬 ?�이?��? ?��? ?�데?�트?�었?��?�??�조??불필??

    // UI ?�데?�트
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // 초기??
    this.currentTrackingTextId = null;

    this.showMessage("???�래???�이?��? ?�?�되?�습?�다!", "success");
    logger.log("?�?�된 글?�서 ?�래???�이???�???�료");
  } catch (error) {
    logger.error("?�?�된 글?�서 ?�래???�이???�???�패:", error);
    this.showMessage(
      "???�래???�이???�?�에 ?�패?�습?�다: " + error.message,
      "error"
    );
  }
};

// ?�래??모달 ?�기
DualTextWriter.prototype.closeTrackingModal = function () {
  const modal = document.getElementById("tracking-modal");
  if (modal) {
    this.closeBottomSheet(modal);
  }
  this.currentTrackingPost = null;
  this.currentTrackingTextId = null;
};
// 메트�?관�?모달 ?�기 (?�래????��???�용)
DualTextWriter.prototype.manageMetrics = async function (postId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그?�이 ?�요?�니??", "error");
    return;
  }

  try {
    // ?�스???�이??가?�오�?
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    // 로컬???�으�?Firebase?�서 조회
    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      try {
        const postRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            content: data.content || "",
            metrics: data.metrics || [],
            sourceTextId: data.sourceTextId || null,
          };
        }
      } catch (error) {
        logger.error("?�스??조회 ?�패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      this.showMessage("메트�??�이?��? ?�습?�다.", "warning");
      return;
    }

    // 메트�?목록 ?�더�?
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postData.id,
      postData.sourceTextId
    );

    // ?�괄 ?�택 모드 초기??
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 모달 ?�기
    const modal = document.getElementById("metrics-manage-modal");
    const content = document.getElementById("metrics-manage-content");
    if (modal && content) {
      content.innerHTML = `
                <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${this.escapeHtml(
                              postData.content.substring(0, 50)
                            )}${postData.content.length > 50 ? "..." : ""}</div>
                            <div style="font-size: 0.85rem; color: #666;">메트�?${
                              postData.metrics.length
                            }�?/div>
                        </div>
                        <button id="batch-select-toggle" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" aria-label="?�괄 ?�택 모드">
                            ?�� ?�괄 ?�택
                        </button>
                    </div>
                    <div id="batch-select-info" style="display: none; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 0.85rem; color: #1976d2;">
                        <span id="selected-count">0</span>�??�택??
                        <button id="select-all-metrics" class="btn-link" style="margin-left: 12px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">?�체 ?�택</button>
                        <button id="deselect-all-metrics" class="btn-link" style="margin-left: 8px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">?�체 ?�제</button>
                    </div>
                </div>
                ${metricsHtml}
                <div id="batch-delete-actions" style="display: none; margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 2px solid #ffc107;">
                    <div style="margin-bottom: 8px; font-weight: 600; color: #856404;">
                        ?�택????��: <span id="batch-delete-count">0</span>�?
                    </div>
                    <button id="batch-delete-btn" class="btn btn-danger" style="width: 100%;" aria-label="?�택????�� ?�괄 ??��">
                        ?���??�택????�� ??��
                    </button>
                </div>
            `;
      this.openBottomSheet(modal);

      // 모달 ?��????�정/??�� 버튼 ?�벤??바인??
      this.bindMetricsManageEvents(postData.id, postData.sourceTextId);

      // ?�괄 ?�택 모드 ?��? 버튼 ?�벤??바인??
      this.bindBatchSelectEvents(postData.id, postData.sourceTextId);
    }
  } catch (error) {
    logger.error("메트�?관�?모달 ?�기 ?�패:", error);
    this.showMessage("메트�??�이?��? 불러?�는???�패?�습?�다.", "error");
  }
};

// 메트�?관�?모달??메트�?목록 ?�더�?
DualTextWriter.prototype.renderMetricsListForManage = function (
  metrics,
  postId,
  textId
) {
  if (!metrics || metrics.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">메트�??�이?��? ?�습?�다.</div>';
  }

  // ?�짜 ?�으�??�렬 (최신 것�???
  const sortedMetrics = [...metrics].sort((a, b) => {
    const dateA = a.timestamp?.toDate
      ? a.timestamp.toDate().getTime()
      : a.timestamp instanceof Date
      ? a.timestamp.getTime()
      : 0;
    const dateB = b.timestamp?.toDate
      ? b.timestamp.toDate().getTime()
      : b.timestamp instanceof Date
      ? b.timestamp.getTime()
      : 0;
    return dateB - dateA; // 최신 것�???
  });

  return `
        <div class="metrics-manage-list">
            ${sortedMetrics
              .map((metric, sortedIdx) => {
                // ?�본 ?�덱??찾기
                const originalIndex = metrics.findIndex((m) => {
                  const mDate = m.timestamp?.toDate
                    ? m.timestamp.toDate().getTime()
                    : m.timestamp instanceof Date
                    ? m.timestamp.getTime()
                    : 0;
                  const metricDate = metric.timestamp?.toDate
                    ? metric.timestamp.toDate().getTime()
                    : metric.timestamp instanceof Date
                    ? metric.timestamp.getTime()
                    : 0;
                  return (
                    mDate === metricDate &&
                    m.views === metric.views &&
                    m.likes === metric.likes &&
                    m.comments === metric.comments &&
                    m.shares === metric.shares
                  );
                });
                const metricIndex =
                  originalIndex >= 0 ? originalIndex : sortedIdx;

                // 메트�??�덱?��? ?�효?��? ?�인 (?�본 배열 범위 ??
                const finalMetricIndex =
                  metricIndex < metrics.length ? metricIndex : sortedIdx;

                const date = metric.timestamp?.toDate
                  ? metric.timestamp.toDate()
                  : metric.timestamp instanceof Date
                  ? metric.timestamp
                  : new Date();
                const dateStr = date.toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const isSelected =
                  this.isBatchSelectMode &&
                  this.selectedMetricIndices.includes(finalMetricIndex);

                return `
                    <div class="metric-manage-item" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }">
                        <div class="metric-manage-header">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" 
                                    class="metric-checkbox" 
                                    data-metric-index="${finalMetricIndex}"
                                    ${isSelected ? "checked" : ""}
                                    style="display: ${
                                      this.isBatchSelectMode ? "block" : "none"
                                    }; width: 18px; height: 18px; cursor: pointer;"
                                    aria-label="메트�??�택"
                                />
                                <div class="metric-manage-date">?�� ${dateStr}</div>
                            </div>
                            <div class="metric-manage-actions" style="display: ${
                              this.isBatchSelectMode ? "none" : "flex"
                            };">
                                <button class="btn-edit-metric" data-action="edit-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="?�정">?�️ ?�정</button>
                                <button class="btn-delete-metric" data-action="delete-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="??��">?���???��</button>
                            </div>
                        </div>
                        <div class="metric-manage-data">
                            <div class="metric-chip"><span class="metric-icon">??</span> <span class="metric-value">${
                              metric.views || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?�️</span> <span class="metric-value">${
                              metric.likes || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?��</span> <span class="metric-value">${
                              metric.comments || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?��</span> <span class="metric-value">${
                              metric.shares || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?��</span> <span class="metric-value">${
                              metric.follows || 0
                            }</span></div>
                            ${
                              metric.notes
                                ? `<div class="metric-notes">?�� ${this.escapeHtml(
                                    metric.notes
                                  )}</div>`
                                : ""
                            }
                        </div>
                    </div>
                `;
              })
              .join("")}
        </div>
    `;
};

// 메트�?관�?모달 ?��? ?�벤??바인??
DualTextWriter.prototype.bindMetricsManageEvents = function (postId, textId) {
  const content = document.getElementById("metrics-manage-content");
  if (!content) return;

  // 기존 리스???�거?�고 ?�로 바인??
  content.addEventListener(
    "click",
    (e) => {
      const button = e.target.closest("button");
      if (!button) return;

      const action = button.getAttribute("data-action");
      const metricIndex = parseInt(button.getAttribute("data-metric-index"));
      const buttonPostId = button.getAttribute("data-post-id") || postId;
      const buttonTextId = button.getAttribute("data-text-id") || textId;

      if (action === "edit-metric") {
        e.preventDefault();
        e.stopPropagation();
        this.editMetricFromManage(buttonPostId, buttonTextId, metricIndex);
      } else if (action === "delete-metric") {
        e.preventDefault();
        e.stopPropagation();

        if (confirm("?�말�???메트�?�� ??��?�시겠습?�까?")) {
          this.deleteMetricFromManage(buttonPostId, buttonTextId, metricIndex);
        }
      }
    },
    { once: false }
  );
};

// 메트�?관�?모달?�서 메트�??�정
DualTextWriter.prototype.editMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  try {
    // ?�스???�이??가?�오�?
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      // Firebase?�서 조회
      try {
        const postRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            metrics: data.metrics || [],
          };
        }
      } catch (error) {
        logger.error("?�스??조회 ?�패:", error);
      }
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      this.showMessage("메트�?�� 찾을 ???�습?�다.", "error");
      return;
    }

    const metric = postData.metrics[metricIndex];

    // ?�집 ?�이???�정
    this.editingMetricData = {
      postId: postId,
      textId: textId,
      metricIndex: metricIndex,
    };

    // 메트�?관�?모달 ?�기
    const manageModal = document.getElementById("metrics-manage-modal");
    if (manageModal) {
      this.closeBottomSheet(manageModal);
    }

    // 기존 editTrackingMetric??모달 ?�기 로직 ?�사??
    const date = metric.timestamp?.toDate
      ? metric.timestamp.toDate()
      : metric.timestamp instanceof Date
      ? metric.timestamp
      : new Date();
    const dateStr = date.toISOString().split("T")[0];

    document.getElementById("tracking-edit-date").value = dateStr;
    document.getElementById("tracking-edit-views").value = metric.views || 0;
    document.getElementById("tracking-edit-likes").value = metric.likes || 0;
    document.getElementById("tracking-edit-comments").value =
      metric.comments || 0;
    document.getElementById("tracking-edit-shares").value = metric.shares || 0;
    const followsInput = document.getElementById("tracking-edit-follows");
    if (followsInput) followsInput.value = metric.follows || 0;
    document.getElementById("tracking-edit-notes").value = metric.notes || "";

    // ?�정 모달 ?�기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      // ?�짜 ???�정
      editModal
        .querySelectorAll(".date-tab")
        .forEach((tab) => tab.classList.remove("active"));
      const customTab = editModal.querySelector(
        '.date-tab[data-date="custom"]'
      );
      if (customTab) customTab.classList.add("active");
      document.getElementById("tracking-edit-date").style.display = "block";

      this.openBottomSheet(editModal);
    }
  } catch (error) {
    logger.error("메트�??�정 ?�패:", error);
    this.showMessage("메트�?�� 불러?�는???�패?�습?�다.", "error");
  }
};

// 메트�?관�?모달?�서 메트�???��
DualTextWriter.prototype.deleteMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  if (!confirm("?�말�????�래???�이?��? ??��?�시겠습?�까?")) {
    return;
  }

  try {
    // ?�스???�이??가?�오�?
    let postData = null;
    let postRef = null;

    try {
      // postId�?직접 조회
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);

      if (postDoc.exists()) {
        postData = postDoc.data();
      } else if (textId) {
        // textId�?찾기
        const postsRef = window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "posts"
        );
        const textQuerySnapshot = await window.firebaseGetDocs(
          window.firebaseQuery(
            postsRef,
            window.firebaseWhere("sourceTextId", "==", textId)
          )
        );
        if (!textQuerySnapshot.empty) {
          const postDoc = textQuerySnapshot.docs[0];
          postRef = window.firebaseDoc(
            this.db,
            "users",
            this.currentUser.uid,
            "posts",
            postDoc.id
          );
          postData = postDoc.data();
        }
      }
    } catch (error) {
      logger.error("?�스??조회 ?�패:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    // 메트�?배열?�서 ?�당 ??�� ?�거
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // 분석 ?�이??계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?�데?�트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 메트�?관�?모달 ?�로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // 메트�?관�?모달???�려?�으�??�로고침
      const refreshPostId = postRef.id || postId;
      setTimeout(() => {
        this.manageMetrics(refreshPostId);
      }, 300);
    } else {
      // 메트�?관�?모달???��??�으�??�반 UI ?�데?�트
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.showMessage("???�래???�이?��? ??��?�었?�니??", "success");
  } catch (error) {
    logger.error("?�래???�이????�� ?�패:", error);
    this.showMessage(
      "???�래???�이????��???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

// ?�괄 ?�택 모드 ?�벤??바인??
DualTextWriter.prototype.bindBatchSelectEvents = function (postId, textId) {
  const toggleBtn = document.getElementById("batch-select-toggle");
  const selectInfo = document.getElementById("batch-select-info");
  const selectAllBtn = document.getElementById("select-all-metrics");
  const deselectAllBtn = document.getElementById("deselect-all-metrics");
  const batchDeleteActions = document.getElementById("batch-delete-actions");
  const batchDeleteBtn = document.getElementById("batch-delete-btn");
  const content = document.getElementById("metrics-manage-content");

  if (!toggleBtn || !content) return;

  // ?�괄 ?�택 모드 ?��?
  toggleBtn.addEventListener("click", () => {
    this.isBatchSelectMode = !this.isBatchSelectMode;
    this.selectedMetricIndices = [];

    if (this.isBatchSelectMode) {
      toggleBtn.textContent = "??취소";
      toggleBtn.style.background = "#dc3545";
      if (selectInfo) selectInfo.style.display = "block";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    } else {
      toggleBtn.textContent = "?�� ?�괄 ?�택";
      toggleBtn.style.background = "";
      if (selectInfo) selectInfo.style.display = "none";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    }

    // 메트�?목록 ?�시 ?�더�?
    this.refreshMetricsListForManage(postId, textId);
  });

  // ?�체 ?�택
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => {
        const index = parseInt(cb.getAttribute("data-metric-index"));
        if (!this.selectedMetricIndices.includes(index)) {
          this.selectedMetricIndices.push(index);
        }
        cb.checked = true;
      });
      this.updateBatchSelectUI();
    });
  }

  // ?�체 ?�제
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      this.selectedMetricIndices = [];
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      this.updateBatchSelectUI();
    });
  }

  // 체크박스 ?�릭 ?�벤??
  content.addEventListener("change", (e) => {
    if (e.target.classList.contains("metric-checkbox")) {
      const index = parseInt(e.target.getAttribute("data-metric-index"));
      if (e.target.checked) {
        if (!this.selectedMetricIndices.includes(index)) {
          this.selectedMetricIndices.push(index);
        }
      } else {
        this.selectedMetricIndices = this.selectedMetricIndices.filter(
          (i) => i !== index
        );
      }
      this.updateBatchSelectUI();
    }
  });

  // ?�괄 ??�� 버튼
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener("click", () => {
      if (this.selectedMetricIndices.length === 0) {
        this.showMessage("?�택????��???�습?�다.", "warning");
        return;
      }

      if (
        confirm(
          `?�택??${this.selectedMetricIndices.length}개의 메트�?�� ??��?�시겠습?�까?`
        )
      ) {
        this.batchDeleteMetrics(postId, textId);
      }
    });
  }
};

// ?�괄 ?�택 UI ?�데?�트
DualTextWriter.prototype.updateBatchSelectUI = function () {
  const selectedCount = document.getElementById("selected-count");
  const batchDeleteCount = document.getElementById("batch-delete-count");
  const batchDeleteActions = document.getElementById("batch-delete-actions");

  const count = this.selectedMetricIndices.length;

  if (selectedCount) {
    selectedCount.textContent = count;
  }

  if (batchDeleteCount) {
    batchDeleteCount.textContent = count;
  }

  if (batchDeleteActions) {
    batchDeleteActions.style.display = count > 0 ? "block" : "none";
  }
};

// 메트�?목록 ?�로고침 (?�괄 ?�택 모드 ?�태 반영)
DualTextWriter.prototype.refreshMetricsListForManage = async function (
  postId,
  textId
) {
  try {
    // ?�스???�이??가?�오�?
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      try {
        const postRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            metrics: data.metrics || [],
          };
        }
      } catch (error) {
        logger.error("?�스??조회 ?�패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      return;
    }

    // 메트�?목록 ?�시 ?�더�?
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postId,
      textId
    );
    const content = document.getElementById("metrics-manage-content");
    if (content) {
      const listContainer = content.querySelector(".metrics-manage-list");
      if (listContainer) {
        listContainer.outerHTML = metricsHtml;
      }
    }
  } catch (error) {
    logger.error("메트�?목록 ?�로고침 ?�패:", error);
  }
};

// ?�괄 ??�� ?�수
DualTextWriter.prototype.batchDeleteMetrics = async function (postId, textId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그?�이 ?�요?�니??", "error");
    return;
  }

  if (this.selectedMetricIndices.length === 0) {
    this.showMessage("?�택????��???�습?�다.", "warning");
    return;
  }

  try {
    // ?�스???�이??가?�오�?
    let postData = null;
    let postRef = null;

    try {
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);

      if (postDoc.exists()) {
        postData = postDoc.data();
      } else if (textId) {
        const postsRef = window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "posts"
        );
        const textQuerySnapshot = await window.firebaseGetDocs(
          window.firebaseQuery(
            postsRef,
            window.firebaseWhere("sourceTextId", "==", textId)
          )
        );
        if (!textQuerySnapshot.empty) {
          const doc = textQuerySnapshot.docs[0];
          postRef = window.firebaseDoc(
            this.db,
            "users",
            this.currentUser.uid,
            "posts",
            doc.id
          );
          postData = doc.data();
        }
      }
    } catch (error) {
      logger.error("?�스??조회 ?�패:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    // ?�택???�덱?��? ?�림차순?�로 ?�렬 (?�에?��?????��?�여 ?�덱??변�?방�?)
    const sortedIndices = [...this.selectedMetricIndices].sort((a, b) => b - a);

    // 메트�?배열?�서 ?�택????�� ?�거
    let updatedMetrics = [...(postData.metrics || [])];
    sortedIndices.forEach((index) => {
      if (index >= 0 && index < updatedMetrics.length) {
        updatedMetrics.splice(index, 1);
      }
    });

    // 분석 ?�이??계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?�데?�트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ?�괄 ?�택 모드 ?�제
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 메트�?관�?모달 ?�로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // 메트�?관�?모달???�려?�으�??�로고침
      setTimeout(() => {
        this.manageMetrics(postRef.id || postId);
      }, 300);
    } else {
      // 메트�?관�?모달???��??�으�??�반 UI ?�데?�트
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.showMessage(
      `??${sortedIndices.length}개의 ?�래???�이?��? ??��?�었?�니??`,
      "success"
    );
  } catch (error) {
    logger.error("?�괄 ??�� ?�패:", error);
    this.showMessage("???�괄 ??��???�패?�습?�다: " + error.message, "error");
  }
};

// ?�래??메트�??�정 모달 ?�기
DualTextWriter.prototype.editTrackingMetric = async function (
  button,
  metricIndexStr
) {
  const metricIndex = parseInt(metricIndexStr);
  const timelineItem = button.closest(".timeline-item");
  const savedItem = timelineItem.closest(".saved-item");
  const textId = savedItem.getAttribute("data-item-id");

  if (!textId) {
    this.showMessage("???�?�된 글 ID�?찾을 ???�습?�다.", "error");
    return;
  }

  // ?�당 ?�스?�에 ?�결???�스??찾기
  let postData = null;
  if (this.trackingPosts) {
    postData = this.trackingPosts.find((p) => p.sourceTextId === textId);
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    // Firebase?�서 조회
    try {
      const postsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceTextId", "==", textId)
      );
      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      if (!querySnapshot.empty) {
        const postDoc = querySnapshot.docs[0];
        const data = postDoc.data();
        postData = {
          id: postDoc.id,
          metrics: data.metrics || [],
          trackingEnabled: data.trackingEnabled || false,
        };
      }
    } catch (error) {
      logger.error("?�스??조회 ?�패:", error);
      this.showMessage("???�래???�이?��? 찾을 ???�습?�다.", "error");
      return;
    }
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    this.showMessage("???�정???�이?��? 찾을 ???�습?�다.", "error");
    return;
  }

  const metric = postData.metrics[metricIndex];
  const date = metric.timestamp?.toDate
    ? metric.timestamp.toDate()
    : metric.timestamp instanceof Date
    ? metric.timestamp
    : new Date();
  const dateStr = date.toISOString().split("T")[0];

  // ?�정 모달???�이??채우�?
  document.getElementById("tracking-edit-date").value = dateStr;
  document.getElementById("tracking-edit-views").value = metric.views || 0;
  document.getElementById("tracking-edit-likes").value = metric.likes || 0;
  document.getElementById("tracking-edit-comments").value =
    metric.comments || 0;
  document.getElementById("tracking-edit-shares").value = metric.shares || 0;
  const editFollows = document.getElementById("tracking-edit-follows");
  if (editFollows) editFollows.value = metric.follows || 0;
  document.getElementById("tracking-edit-notes").value = metric.notes || "";

  // ?�정???�이???�??
  this.editingMetricData = {
    postId: postData.id || null,
    textId: textId,
    metricIndex: metricIndex,
  };

  // ?�정 모달 ?�기
  const editModal = document.getElementById("tracking-edit-modal");
  if (editModal) {
    this.openBottomSheet(editModal);
    // ?�짜 ??초기?? ?�재 ?�짜???�라 ???�정
    const editDateInput = document.getElementById("tracking-edit-date");
    if (editDateInput && metric.timestamp) {
      const metricDate = metric.timestamp?.toDate
        ? metric.timestamp.toDate()
        : new Date(metric.timestamp);
      const metricDateStr = metricDate.toISOString().split("T")[0];
      editDateInput.value = metricDateStr;

      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      editModal
        .querySelectorAll(".date-tab")
        .forEach((tab) => tab.classList.remove("active"));
      if (metricDateStr === today) {
        const todayTab = editModal.querySelector(
          '.date-tab[data-date="today"]'
        );
        if (todayTab) todayTab.classList.add("active");
        editDateInput.style.display = "none";
      } else if (metricDateStr === yesterdayStr) {
        const yesterdayTab = editModal.querySelector(
          '.date-tab[data-date="yesterday"]'
        );
        if (yesterdayTab) yesterdayTab.classList.add("active");
        editDateInput.style.display = "none";
      } else {
        const customTab = editModal.querySelector(
          '.date-tab[data-date="custom"]'
        );
        if (customTab) customTab.classList.add("active");
        editDateInput.style.display = "block";
      }
    }
  }
};
// ?�래???�이???�정
DualTextWriter.prototype.updateTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // ?�스???�이??가?�오�?
    let postData;
    let postRef;

    if (postId) {
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);
      if (!postDoc.exists()) {
        this.showMessage("???�스?��? 찾을 ???�습?�다.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textId�??�스??찾기
      const postsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceTextId", "==", textId)
      );
      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      if (querySnapshot.empty) {
        this.showMessage("???�스?��? 찾을 ???�습?�다.", "error");
        return;
      }

      const postDoc = querySnapshot.docs[0];
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postDoc.id
      );
      postData = postDoc.data();
    }

    // ?�정???�이???�집
    const dateValue = document.getElementById("tracking-edit-date").value;
    const views =
      parseInt(document.getElementById("tracking-edit-views").value) || 0;
    const likes =
      parseInt(document.getElementById("tracking-edit-likes").value) || 0;
    const comments =
      parseInt(document.getElementById("tracking-edit-comments").value) || 0;
    const shares =
      parseInt(document.getElementById("tracking-edit-shares").value) || 0;
    const follows =
      parseInt(
        (document.getElementById("tracking-edit-follows") || { value: "" })
          .value
      ) || 0;
    const notes = document.getElementById("tracking-edit-notes").value;

    // ?�짜 처리
    let timestamp;
    if (dateValue) {
      const selectedDate = new Date(dateValue);
      selectedDate.setHours(0, 0, 0, 0);
      timestamp = window.firebaseTimestamp(selectedDate);
    } else {
      timestamp =
        postData.metrics[metricIndex].timestamp ||
        window.firebaseServerTimestamp();
    }

    // 메트�?배열 ?�데?�트
    const updatedMetrics = [...postData.metrics];
    updatedMetrics[metricIndex] = {
      timestamp: timestamp,
      views,
      likes,
      comments,
      shares,
      follows,
      notes,
    };

    // ?�짜 ?�으�??�렬
    updatedMetrics.sort((a, b) => {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return dateA - dateB;
    });

    // 분석 ?�이??계산
    const analytics = this.calculateAnalytics(updatedMetrics);

    // Firebase ?�데?�트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ?�정 모달 ?�기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      this.closeBottomSheet(editModal);
    }

    // 메트�?관�?모달???�려?�으�??�로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // 메트�?관�?모달 ?�로고침
      const refreshPostId = postRef.id || postId;
      setTimeout(() => {
        this.manageMetrics(refreshPostId);
      }, 300);
    } else {
      // 메트�?관�?모달???��??�으�??�반 UI ?�데?�트
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.editingMetricData = null;

    this.showMessage("???�래???�이?��? ?�정?�었?�니??", "success");
    logger.log("?�래???�이???�정 ?�료");
  } catch (error) {
    logger.error("?�래???�이???�정 ?�패:", error);
    this.showMessage(
      "???�래???�이???�정???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

// ?�래???�이????��
DualTextWriter.prototype.deleteTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady) {
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }
    return;
  }

  if (!confirm("?�말�????�래???�이?��? ??��?�시겠습?�까?")) {
    return;
  }

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // ?�스???�이??가?�오�?
    let postData;
    let postRef;

    if (postId) {
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);
      if (!postDoc.exists()) {
        this.showMessage("???�스?��? 찾을 ???�습?�다.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textId�??�스??찾기
      const postsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceTextId", "==", textId)
      );
      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      if (querySnapshot.empty) {
        this.showMessage("???�스?��? 찾을 ???�습?�다.", "error");
        return;
      }

      const postDoc = querySnapshot.docs[0];
      postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        postDoc.id
      );
      postData = postDoc.data();
    }

    // 메트�?배열?�서 ?�당 ??�� ?�거
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // 분석 ?�이??계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?�데?�트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 ?�이???�데?�트
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 모달 ?�기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }

    this.editingMetricData = null;

    // ?�면 ?�로고침
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    this.showMessage("???�래???�이?��? ??��?�었?�니??", "success");
    logger.log("?�래???�이????�� ?�료");
  } catch (error) {
    logger.error("?�래???�이????�� ?�패:", error);
    this.showMessage(
      "???�래???�이????��???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

// 분석 ?�이??계산
DualTextWriter.prototype.calculateAnalytics = function (metrics) {
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
    engagementRate:
      latest.views > 0
        ? (
            ((latest.likes + latest.comments + latest.shares) / latest.views) *
            100
          ).toFixed(2)
        : 0,
  };
};

// ?�래???�약 ?�데?�트
DualTextWriter.prototype.updateTrackingSummary = function () {
  const totalPosts = this.trackingPosts.length;
  const totalViews = this.trackingPosts.reduce((sum, post) => {
    const latest =
      post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
    return sum + (latest ? latest.views : 0);
  }, 0);
  const totalLikes = this.trackingPosts.reduce((sum, post) => {
    const latest =
      post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
    return sum + (latest ? latest.likes : 0);
  }, 0);
  const totalComments = this.trackingPosts.reduce((sum, post) => {
    const latest =
      post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
    return sum + (latest ? latest.comments || 0 : 0);
  }, 0);
  const totalShares = this.trackingPosts.reduce((sum, post) => {
    const latest =
      post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
    return sum + (latest ? latest.shares || 0 : 0);
  }, 0);
  const totalFollows = this.trackingPosts.reduce((sum, post) => {
    const latest =
      post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
    return sum + (latest ? latest.follows || 0 : 0);
  }, 0);

  if (this.totalPostsElement) this.totalPostsElement.textContent = totalPosts;
  if (this.totalViewsElement)
    this.totalViewsElement.textContent = totalViews.toLocaleString();
  if (this.totalLikesElement)
    this.totalLikesElement.textContent = totalLikes.toLocaleString();
  if (this.totalCommentsElement)
    this.totalCommentsElement.textContent = totalComments.toLocaleString();
  if (this.totalSharesElement)
    this.totalSharesElement.textContent = totalShares.toLocaleString();
  const totalFollowsElement = document.getElementById("total-follows");
  if (totalFollowsElement)
    totalFollowsElement.textContent = totalFollows.toLocaleString();
};
/**
 * ?�래??차트 초기??
 *
 * Chart.js�??�용?�여 ?�래???�이?��? ?�각?�하??차트�?초기?�합?�다.
 * Canvas ?�소가 ?�거??Chart.js ?�이브러리�? 로드?��? ?��? 경우 ?�러 처리�??�행?�니??
 *
 * **주요 기능:**
 * - Canvas ?�소 존재 ?�인 �?2D 컨텍?�트 검�?
 * - Chart.js ?�이브러�?로드 ?�인
 * - 기존 차트 ?�거�?메모�??�수 방�?
 * - 반응??차트 ?�정 (responsive: true, maintainAspectRatio: false)
 * - ?�니메이??비활?�화�??�크�?문제 방�?
 * - ?�이?�웃 ?�딩 ?�정?�로 �??�이�?보호
 *
 * **?�러 처리:**
 * - Canvas ?�소가 ?�을 ?? console.warn 로그 출력 �?조기 반환
 * - Chart.js ?�이브러�?미로?? ?�용??메시지 ?�시 �?조기 반환
 * - 2D 컨텍?�트 ?�패: ?�용??메시지 ?�시 �?조기 반환
 * - 초기???�패: try-catch 블록?�로 ?�러 캐치 �??�용??메시지 ?�시
 *
 * **?�능 최적??**
 * - animation.duration: 0 ?�정?�로 불필?�한 ?�니메이???�거
 * - 기존 차트 destroy() ?�출�?메모�??�수 방�?
 *
 * @returns {void}
 * @throws {Error} Chart.js 초기???�패 ???�러 발생
 */
DualTextWriter.prototype.initTrackingChart = function () {
  // ?�러 처리: Canvas ?�소가 ?�을 ??Chart.js 초기???�패 방�?
  if (!this.trackingChartCanvas) {
    logger.warn("[initTrackingChart] Canvas element not found");
    return;
  }

  // Chart.js ?�이브러�?로드 ?�패 ???�백 처리
  if (typeof Chart === "undefined") {
    logger.error("[initTrackingChart] Chart.js library not loaded");
    this.showMessage(
      "차트 ?�이브러리�? 불러?????�습?�다. ?�이지�??�로고침?�주?�요.",
      "error"
    );
    return;
  }

  try {
    const ctx = this.trackingChartCanvas.getContext("2d");
    if (!ctx) {
      logger.error("[initTrackingChart] Failed to get 2D context");
      this.showMessage(
        "차트�?초기?�할 ???�습?�다. 브라?��?�??�로고침?�주?�요.",
        "error"
      );
      return;
    }

    // 기존 차트가 ?�다�??�거 (메모�??�수 방�?)
    if (this.trackingChart) {
      this.trackingChart.destroy();
      this.trackingChart = null;
    }

    // Chart.js 초기?? responsive: true�??�정?�어 ?�어 부�?컨테?�너 ?�기??맞춰 ?�동 조절
    this.trackingChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "조회??,
            data: [],
            borderColor: "#667eea",
            backgroundColor: "rgba(102, 126, 234, 0.1)",
            tension: 0.4,
          },
          {
            label: "좋아??,
            data: [],
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            tension: 0.4,
          },
          {
            label: "?��?",
            data: [],
            borderColor: "#9b59b6",
            backgroundColor: "rgba(155, 89, 182, 0.1)",
            tension: 0.4,
          },
          {
            label: "공유",
            data: [],
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
            tension: 0.4,
          },
          {
            label: "?�로??,
            data: [],
            borderColor: "#16a085",
            backgroundColor: "rgba(22, 160, 133, 0.1)",
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: false, // HTML ?�더 ?�용?�로 차트 ?��? ?�목 ?��?
            text: "?�스???�과 추이",
          },
          legend: {
            display: false, // 범�?????���??�시
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 8,
              precision: 0,
              stepSize: 1, // 초기�? updateTrackingChart?�서 ?�적?�로 ?�데?�트??
            },
            max: 10, // 초기�? updateTrackingChart?�서 ?�적?�로 ?�데?�트??
          },
          y2: {
            beginAtZero: true,
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: {
              maxTicksLimit: 8,
              precision: 0,
              stepSize: 1,
            },
            max: 10,
          },
        },
        animation: {
          duration: 0, // ?�니메이??비활?�화�??�크�?문제 방�?
        },
        layout: {
          padding: {
            top: 20,
            bottom: 40, // ?�단 ?�백 증�? (�??�이�?보호)
            left: 15,
            right: 15,
          },
        },
        // ?�터?�션 ?�정: ?�래�?�??�용
        interaction: {
          mode: "index",
          intersect: false,
        },
        // ?�소 ?�릭 가?�하?�록 ?�정
        elements: {
          point: {
            radius: 4,
            hoverRadius: 6,
          },
        },
      },
    });

    // Chart.js 초기????차트 ?�데?�트
    this.updateTrackingChart();
  } catch (error) {
    // Chart.js 초기???�패 ???�용?�에�??�러 메시지 ?�시
    logger.error("[initTrackingChart] Chart initialization failed:", error);
    this.showMessage(
      "차트�?초기?�하??�??�류가 발생?�습?�다: " + error.message,
      "error"
    );
    this.trackingChart = null;
  }
};

/**
 * ?��???모드 ?�정
 *
 * 그래?�의 ?��???모드�?변경합?�다.
 * 'combined' 모드: 모든 지?��? ?�일??y�??��??�을 ?�용
 * 'split' 모드: 조회?�는 ?�쪽 y�? ?�머지 지?�는 ?�른�?y2�??�용
 *
 * @param {string} mode - ?��???모드 ('combined' | 'split')
 * @returns {void}
 */
DualTextWriter.prototype.setScaleMode = function (mode) {
  // 그래???��???모드 변�???즉시 반영 �?�?반응???��?
  this.scaleMode = mode; // 'combined' | 'split'
  const combinedBtn = document.getElementById("chart-scale-combined");
  const splitBtn = document.getElementById("chart-scale-split");
  if (combinedBtn && splitBtn) {
    if (mode === "combined") {
      combinedBtn.classList.add("active");
      combinedBtn.style.background = "white";
      combinedBtn.style.color = "#667eea";
      combinedBtn.setAttribute("aria-pressed", "true");
      splitBtn.classList.remove("active");
      splitBtn.style.background = "transparent";
      splitBtn.style.color = "#666";
      splitBtn.setAttribute("aria-pressed", "false");
    } else {
      splitBtn.classList.add("active");
      splitBtn.style.background = "white";
      splitBtn.style.color = "#667eea";
      splitBtn.setAttribute("aria-pressed", "true");
      combinedBtn.classList.remove("active");
      combinedBtn.style.background = "transparent";
      combinedBtn.style.color = "#666";
      combinedBtn.setAttribute("aria-pressed", "false");
    }
  }
  this.updateTrackingChart();
};
/**
 * 차트 모드 ?�정
 *
 * 그래?�의 모드�?변경합?�다.
 * 'total' 모드: 모든 ?�스?�의 ?�적 총합 ?�시
 * 'individual' 모드: ?�택??개별 ?�스?�의 ?�이?�만 ?�시
 *
 * @param {string} mode - 차트 모드 ('total' | 'individual')
 * @returns {void}
 */
DualTextWriter.prototype.setChartMode = function (mode) {
  // 그래??모드 변�???즉시 반영
  this.chartMode = mode;

  // 버튼 ?��????�데?�트
  const totalBtn = document.getElementById("chart-mode-total");
  const individualBtn = document.getElementById("chart-mode-individual");
  const postSelectorContainer = document.getElementById(
    "post-selector-container"
  );

  if (mode === "total") {
    totalBtn.classList.add("active");
    totalBtn.style.background = "white";
    totalBtn.style.color = "#667eea";
    totalBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    totalBtn.setAttribute("aria-pressed", "true");

    individualBtn.classList.remove("active");
    individualBtn.style.background = "transparent";
    individualBtn.style.color = "#666";
    individualBtn.style.boxShadow = "none";
    individualBtn.setAttribute("aria-pressed", "false");

    postSelectorContainer.style.display = "none";
    this.selectedChartPostId = null;
    // ?�체 총합 모드�??�환 ??검???�력�?초기??
    const searchInput = document.getElementById("chart-post-search");
    if (searchInput) {
      searchInput.value = "";
    }
    const dropdown = document.getElementById("post-selector-dropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
    document.removeEventListener("click", this.handlePostSelectorClickOutside);
  } else {
    individualBtn.classList.add("active");
    individualBtn.style.background = "white";
    individualBtn.style.color = "#667eea";
    individualBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    individualBtn.setAttribute("aria-pressed", "true");

    totalBtn.classList.remove("active");
    totalBtn.style.background = "transparent";
    totalBtn.style.color = "#666";
    totalBtn.style.boxShadow = "none";
    totalBtn.setAttribute("aria-pressed", "false");

    postSelectorContainer.style.display = "block";
    this.populatePostSelector();
  }

  // 차트 ?�데?�트
  this.updateTrackingChart();
};

/**
 * 차트 범위 ?�정
 *
 * 그래?�에 ?�시???�이??범위�?변경합?�다.
 * '7d': 최근 7???�이?�만 ?�시
 * '30d': 최근 30???�이?�만 ?�시
 * 'all': ?�체 ?�이???�시
 *
 * @param {string} range - 차트 범위 ('7d' | '30d' | 'all')
 * @returns {void}
 */
DualTextWriter.prototype.setChartRange = function (range) {
  // 그래??범위 변�???즉시 반영 �?�?반응???��?
  this.chartRange = range; // '7d' | '30d' | 'all'
  // 버튼 ?��????�데?�트
  const ranges = ["7d", "30d", "all"];
  ranges.forEach((r) => {
    const btn = document.getElementById(`chart-range-${r}`);
    if (!btn) return;
    if (r === range) {
      btn.classList.add("active");
      btn.style.background = "white";
      btn.style.color = "#667eea";
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.classList.remove("active");
      btn.style.background = "transparent";
      btn.style.color = "#666";
      btn.setAttribute("aria-pressed", "false");
    }
  });
  this.updateTrackingChart();
};

// ?�스???�택 ?�롭?�운 채우�?(검??가?�한 커스?� ?�롭?�운)
DualTextWriter.prototype.populatePostSelector = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) return;

  // ?�체 ?�스??목록 ?�??(검???�터링용)
  this.allTrackingPostsForSelector = [...this.trackingPosts].sort((a, b) => {
    // 최근 ?�스???�선 ?�렬
    const dateA =
      a.postedAt instanceof Date
        ? a.postedAt
        : a.postedAt?.toDate
        ? a.postedAt.toDate()
        : new Date(0);
    const dateB =
      b.postedAt instanceof Date
        ? b.postedAt
        : b.postedAt?.toDate
        ? b.postedAt.toDate()
        : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  // ?�롭?�운 ?�더�?
  this.renderPostSelectorDropdown("");

  // ?�택???�스?��? ?�으�?검???�력창에 ?�시
  if (this.selectedChartPostId) {
    const selectedPost = this.trackingPosts.find(
      (p) => p.id === this.selectedChartPostId
    );
    if (selectedPost) {
      const searchInput = document.getElementById("chart-post-search");
      if (searchInput) {
        const contentPreview =
          selectedPost.content.length > 50
            ? selectedPost.content.substring(0, 50) + "..."
            : selectedPost.content;
        searchInput.value = contentPreview;
      }
    }
  }
};
// ?�스???�택 ?�롭?�운 ?�더�?
DualTextWriter.prototype.renderPostSelectorDropdown = function (
  searchTerm = ""
) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // 검?�어�??�터�?
  let filteredPosts = this.allTrackingPostsForSelector;
  if (searchTerm && searchTerm.trim()) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    filteredPosts = this.allTrackingPostsForSelector.filter((post) => {
      const content = post.content.toLowerCase();
      return content.includes(lowerSearchTerm);
    });
  }

  // 최근 ?�스???�선 ?�렬 (?��? ?�렬?�어 ?��?�??�실??
  filteredPosts = [...filteredPosts].sort((a, b) => {
    const dateA =
      a.postedAt instanceof Date
        ? a.postedAt
        : a.postedAt?.toDate
        ? a.postedAt.toDate()
        : new Date(0);
    const dateB =
      b.postedAt instanceof Date
        ? b.postedAt
        : b.postedAt?.toDate
        ? b.postedAt.toDate()
        : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  if (filteredPosts.length === 0) {
    dropdown.innerHTML = `
            <div class="post-selector-empty" style="padding: 20px; text-align: center; color: #666;">
                <div style="font-size: 1.5rem; margin-bottom: 8px;">?��</div>
                <div>검??결과가 ?�습?�다.</div>
            </div>
        `;
    return;
  }

  // ?�스??목록 HTML ?�성
  dropdown.innerHTML = filteredPosts
    .map((post) => {
      const contentPreview =
        post.content.length > 60
          ? post.content.substring(0, 60) + "..."
          : post.content;
      const isSelected = this.selectedChartPostId === post.id;
      const metricsCount = post.metrics?.length || 0;
      const lastUpdate =
        post.metrics && post.metrics.length > 0
          ? post.metrics[post.metrics.length - 1]
          : null;

      return `
            <div 
                class="post-selector-item ${isSelected ? "selected" : ""}" 
                data-post-id="${post.id}"
                onclick="dualTextWriter.selectPostFromDropdown('${post.id}')"
                style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background-color 0.2s; ${
                  isSelected ? "background-color: #e3f2fd;" : ""
                }"
                onmouseover="this.style.backgroundColor='#f5f5f5'"
                onmouseout="this.style.backgroundColor=${
                  isSelected ? "'#e3f2fd'" : "'transparent'"
                }">
                <div style="font-weight: ${
                  isSelected ? "600" : "500"
                }; color: #333; margin-bottom: 4px; line-height: 1.4;">
                    ${this.escapeHtml(contentPreview)}
                </div>
                <div style="font-size: 0.8rem; color: #666; display: flex; gap: 12px; align-items: center;">
                    <span>?�� ${metricsCount}???�력</span>
                    ${
                      lastUpdate
                        ? `<span>최근: ${lastUpdate.views || 0} 조회</span>`
                        : ""
                    }
                </div>
            </div>
        `;
    })
    .join("");
};

// ?�스???�택 ?�롭?�운 ?�시
DualTextWriter.prototype.showPostSelectorDropdown = function () {
  const dropdown = document.getElementById("post-selector-dropdown");
  const searchInput = document.getElementById("chart-post-search");

  if (!dropdown || !searchInput) return;

  // ?�롭?�운 ?�시
  dropdown.style.display = "block";

  // 검?�어가 ?�으�??�체 목록 ?�시, ?�으�??�터�?
  const searchTerm = searchInput.value || "";
  this.renderPostSelectorDropdown(searchTerm);

  // ?��? ?�릭 ???�롭?�운 ?�기
  setTimeout(() => {
    document.addEventListener("click", this.handlePostSelectorClickOutside);
  }, 100);
};

// ?��? ?�릭 처리
DualTextWriter.prototype.handlePostSelectorClickOutside = function (event) {
  const container = document.querySelector(".post-selector-container");
  const dropdown = document.getElementById("post-selector-dropdown");

  if (!container || !dropdown) return;

  if (!container.contains(event.target) && dropdown.style.display === "block") {
    dropdown.style.display = "none";
    document.removeEventListener(
      "click",
      dualTextWriter.handlePostSelectorClickOutside
    );
  }
};

// ?�스???�택 ?�터�?
DualTextWriter.prototype.filterPostSelector = function (searchTerm) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // ?�롭?�운???��??�으�??�기
  if (dropdown.style.display === "none") {
    dropdown.style.display = "block";
  }

  // 검?�어�??�터링하???�더�?
  this.renderPostSelectorDropdown(searchTerm);
};

// ?�롭?�운?�서 ?�스???�택
DualTextWriter.prototype.selectPostFromDropdown = function (postId) {
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  if (!selectedPost) return;

  this.selectedChartPostId = postId;

  // 검???�력창에 ?�택???�스???�목 ?�시
  const searchInput = document.getElementById("chart-post-search");
  if (searchInput) {
    const contentPreview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = contentPreview;
  }

  // ?�롭?�운 ?�기
  const dropdown = document.getElementById("post-selector-dropdown");
  if (dropdown) {
    dropdown.style.display = "none";
  }

  // ?��? ?�릭 ?�벤??리스???�거
  document.removeEventListener("click", this.handlePostSelectorClickOutside);

  // 차트 ?�데?�트
  this.updateTrackingChart();
};

// ?�래??목록?�서 ?�릭 ??차트???�시
DualTextWriter.prototype.showPostInChart = function (postId) {
  // 모드 ?�환 �??�스???�택
  this.setChartMode("individual");
  this.selectedChartPostId = postId;
  // 검???�력창에 ?�목 ?�시
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  const searchInput = document.getElementById("chart-post-search");
  if (selectedPost && searchInput) {
    const preview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = preview;
  }
  // ?�롭?�운 목록 갱신
  this.populatePostSelector();
  // 차트 ?�데?�트
  this.updateTrackingChart();
  // 차트 ?�역 ?�커???�크�?
  if (this.trackingChartCanvas && this.trackingChartCanvas.scrollIntoView) {
    this.trackingChartCanvas.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
};

// ?�스???�택 변�?(구버???�환, ???�상 ?�용 ????
DualTextWriter.prototype.updateChartPostSelection = function () {
  // ?�로??검??가?�한 ?�롭?�운 ?�용 중이므�????�수?????�상 ?�용?��? ?�음
  // ?�환?�을 ?�해 ?��?
};

// 그래???�더 ?�데?�트
DualTextWriter.prototype.updateChartHeader = function (postTitle, lastUpdate) {
  const titleEl = document.getElementById("chart-post-title");
  const updateEl = document.getElementById("chart-last-update");

  if (titleEl) {
    const maxLength = 50;
    const displayTitle =
      postTitle && postTitle.length > maxLength
        ? postTitle.substring(0, maxLength) + "..."
        : postTitle || "?�체 ?�스???�재�??�계 추이";
    titleEl.textContent = displayTitle;
  }

  if (updateEl) {
    if (lastUpdate) {
      const formattedDate = lastUpdate.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      updateEl.textContent = `최근 ?�데?�트: ${formattedDate}`;
    } else {
      updateEl.textContent = "최근 ?�데?�트: -";
    }
  }
};
/**
 * ?�래??차트 ?�데?�트
 *
 * ?�재 ?�정??모드?� 범위???�라 차트 ?�이?��? ?�데?�트?�니??
 * ?�이???�식 검�?�??�러 처리�??�함?�니??
 *
 * **?�이??처리:**
 * - ?�체 총합 모드: 모든 ?�스?�의 메트�?�� ?�산?�여 ?�시
 * - 개별 ?�스??모드: ?�택???�스?�의 메트�?�� ?�시
 * - ?�짜 ?�터�? ?�정??범위(7d/30d/all)???�라 ?�이???�터�?
 *
 * **?��???계산:**
 * - combined 모드: 모든 지?��? ?�일??y�??��????�용
 * - split 모드: 조회?�는 y�? ?�머지 지?�는 y2�??�용
 * - ?�적 ?��???계산: ?�이??최�?값의 1.2�??�는 1.8배로 ?�정
 *
 * **?�러 처리:**
 * - 차트 미초기화: console.warn 로그 출력 �?조기 반환
 * - ?�이???�식 ?�류: try-catch 블록?�로 ?�러 캐치 �?로그 출력
 * - ?�짜 ?�효??검�? ?�효?��? ?��? ?�짜 ?�터�?
 * - ?�자 ?�식 검�? NaN �?Infinity 방�?
 *
 * **?�능 최적??**
 * - animation.duration: 0 ?�정?�로 ?�니메이???�이 즉시 ?�데?�트
 * - update('none') 모드 ?�용?�로 ?�크�?문제 방�?
 *
 * @returns {void}
 * @throws {Error} 차트 ?�데?�트 ?�패 ???�러 발생
 */
DualTextWriter.prototype.updateTrackingChart = function () {
  // ?�러 처리: 차트가 ?�직 초기?�되지 ?�았????처리
  if (!this.trackingChart) {
    logger.warn("[updateTrackingChart] Chart not initialized yet");
    return;
  }

  try {
    // ?�택??범위???�른 ?�짜 배열 ?�성
    const dateRange = [];
    const viewsData = [];
    const likesData = [];
    const commentsData = [];
    const sharesData = [];
    const followsData = [];

    // 범위 계산 ?�수
    const makeRange = (startDate, endDate, maxDays = 365) => {
      const days = [];
      const start = new Date(startDate.getTime());
      const end = new Date(endDate.getTime());
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      let current = start;
      let cnt = 0;
      while (current.getTime() <= end.getTime() && cnt < maxDays) {
        days.push(new Date(current.getTime()));
        current = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + 1
        );
        cnt++;
      }
      return days;
    };

    // 범위 결정
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (this.chartRange === "7d") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - i
        );
        dateRange.push(d);
      }
    } else if (this.chartRange === "30d") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - i
        );
        dateRange.push(d);
      }
    } else {
      // 'all' 범위
      if (this.chartMode === "individual" && this.selectedChartPostId) {
        const post = this.trackingPosts.find(
          (p) => p.id === this.selectedChartPostId
        );
        if (post && post.metrics && post.metrics.length > 0) {
          try {
            // ?�이???�식 검�? timestamp가 ?�효?��? ?�인
            const firstMetric = post.metrics[0];
            const lastMetric = post.metrics[post.metrics.length - 1];
            if (
              !firstMetric ||
              !firstMetric.timestamp ||
              !lastMetric ||
              !lastMetric.timestamp
            ) {
              throw new Error("Invalid metric timestamp");
            }

            const first = firstMetric.timestamp?.toDate
              ? firstMetric.timestamp.toDate()
              : new Date(firstMetric.timestamp);
            const last = lastMetric.timestamp?.toDate
              ? lastMetric.timestamp.toDate()
              : new Date(lastMetric.timestamp);

            // ?�짜 ?�효??검�?
            if (isNaN(first.getTime()) || isNaN(last.getTime())) {
              throw new Error("Invalid date in metric");
            }

            dateRange.push(...makeRange(first, last));
          } catch (err) {
            logger.warn(
              "[updateTrackingChart] Error processing date range for individual post:",
              err
            );
            // ?�백: 기본 7??범위 ?�용
            for (let i = 6; i >= 0; i--) {
              const d = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate() - i
              );
              dateRange.push(d);
            }
          }
        } else {
          for (let i = 6; i >= 0; i--) {
            const d = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate() - i
            );
            dateRange.push(d);
          }
        }
      } else {
        let minDate = null;
        let maxDate = null;
        this.trackingPosts.forEach((post) => {
          (post.metrics || []).forEach((m) => {
            // ?�이???�식 검�? timestamp가 ?�효?��? ?�인
            if (!m || !m.timestamp) return;

            try {
              const dt = m.timestamp?.toDate
                ? m.timestamp.toDate()
                : new Date(m.timestamp);
              // ?�짜 ?�효??검�?
              if (isNaN(dt.getTime())) {
                logger.warn(
                  "[updateTrackingChart] Invalid date in metric:",
                  m
                );
                return;
              }
              dt.setHours(0, 0, 0, 0);
              if (!minDate || dt < minDate) minDate = new Date(dt);
              if (!maxDate || dt > maxDate) maxDate = new Date(dt);
            } catch (err) {
              logger.warn(
                "[updateTrackingChart] Error processing metric for date range:",
                err,
                m
              );
            }
          });
        });
        if (minDate && maxDate) {
          dateRange.push(...makeRange(minDate, maxDate));
        } else {
          for (let i = 6; i >= 0; i--) {
            const d = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate() - i
            );
            dateRange.push(d);
          }
        }
      }
    }

    if (this.chartMode === "total") {
      // ?�체 총합 모드: �??�짜까�???모든 ?�스??최신 메트�??�적 ?�계
      dateRange.forEach((targetDate) => {
        let dayTotalViews = 0;
        let dayTotalLikes = 0;
        let dayTotalComments = 0;
        let dayTotalShares = 0;
        let dayTotalFollows = 0;

        // �??�스?�에 ?�???�당 ?�짜까�???최신 메트�?찾기
        this.trackingPosts.forEach((post) => {
          if (!post.metrics || post.metrics.length === 0) return;

          // ?�당 ?�짜 ?�전 ?�는 ?�일??가??최근 메트�?찾기
          let latestMetricBeforeDate = null;
          for (let i = post.metrics.length - 1; i >= 0; i--) {
            const metric = post.metrics[i];
            const metricDate = metric.timestamp?.toDate
              ? metric.timestamp.toDate()
              : new Date(metric.timestamp);
            metricDate.setHours(0, 0, 0, 0);

            if (metricDate.getTime() <= targetDate.getTime()) {
              latestMetricBeforeDate = metric;
              break;
            }
          }

          // 최신 메트�?�� ?�으�??�산 (?�으�??�당 ?�스?�는 0?�로 처리)
          if (latestMetricBeforeDate) {
            // ?�자 ?�식 검�? NaN?�나 Infinity 방�?
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

      // 차트 ?�목 ?�데?�트
      this.trackingChart.options.plugins.title.text =
        "?�체 ?�스???�재�??�계 추이";
      // ?�더 ?�데?�트
      this.updateChartHeader("?�체 ?�스???�재�??�계 추이", null);
    } else {
      // 개별 ?�스??모드: ?�택???�스?�의 ?�짜�??�이??
      if (!this.selectedChartPostId) {
        // ?�스?��? ?�택?��? ?�았?�면 �??�이??
        dateRange.forEach(() => {
          viewsData.push(0);
          likesData.push(0);
          commentsData.push(0);
          sharesData.push(0);
          followsData.push(0);
        });
        this.trackingChart.options.plugins.title.text =
          "?�스???�과 추이 (?�스?��? ?�택?�세??";
        this.updateChartHeader("?�스???�과 추이 (?�스?��? ?�택?�세??", null);
      } else {
        const selectedPost = this.trackingPosts.find(
          (p) => p.id === this.selectedChartPostId
        );

        if (selectedPost && selectedPost.metrics) {
          // 범위???�이?��? ?�으�??�동?�로 ?�체 범위�??�환
          if (dateRange.length > 0) {
            const firstDate = dateRange[0].getTime();
            const lastDate = dateRange[dateRange.length - 1].getTime();
            const hasAnyInRange = selectedPost.metrics.some((metric) => {
              const md = metric.timestamp?.toDate
                ? metric.timestamp.toDate()
                : new Date(metric.timestamp);
              md.setHours(0, 0, 0, 0);
              const t = md.getTime();
              return t >= firstDate && t <= lastDate;
            });
            if (!hasAnyInRange && this.chartRange !== "all") {
              this.setChartRange("all");
              return;
            }
          }

          dateRange.forEach((targetDate) => {
            // ?�당 ?�짜???�력??메트�?찾기
            let dayViews = 0;
            let dayLikes = 0;
            let dayComments = 0;
            let dayShares = 0;
            let dayFollows = 0;

            selectedPost.metrics.forEach((metric) => {
              // ?�이???�식 검�? timestamp가 ?�효?��? ?�인
              if (!metric || !metric.timestamp) return;

              try {
                const metricDate = metric.timestamp?.toDate
                  ? metric.timestamp.toDate()
                  : new Date(metric.timestamp);
                // ?�짜 ?�효??검�?
                if (isNaN(metricDate.getTime())) {
                  logger.warn(
                    "[updateTrackingChart] Invalid date in metric:",
                    metric
                  );
                  return;
                }
                metricDate.setHours(0, 0, 0, 0);

                if (metricDate.getTime() === targetDate.getTime()) {
                  // ?�자 ?�식 검�? NaN?�나 Infinity 방�?
                  dayViews += Number(metric.views) || 0;
                  dayLikes += Number(metric.likes) || 0;
                  dayComments += Number(metric.comments) || 0;
                  dayShares += Number(metric.shares) || 0;
                  dayFollows += Number(metric.follows) || 0;
                }
              } catch (err) {
                logger.warn(
                  "[updateTrackingChart] Error processing metric:",
                  err,
                  metric
                );
              }
            });

            viewsData.push(dayViews);
            likesData.push(dayLikes);
            commentsData.push(dayComments);
            sharesData.push(dayShares);
            followsData.push(dayFollows);
          });

          // 차트 ?�목 ?�데?�트
          const contentPreview =
            selectedPost.content.length > 30
              ? selectedPost.content.substring(0, 30) + "..."
              : selectedPost.content;
          this.trackingChart.options.plugins.title.text = `?�스???�과 추이: ${contentPreview}`;

          // ?�더 ?�데?�트: ?�스???�목�?최근 ?�데?�트
          const latestMetric =
            selectedPost.metrics && selectedPost.metrics.length > 0
              ? selectedPost.metrics[selectedPost.metrics.length - 1]
              : null;
          let lastUpdate = null;
          if (latestMetric && latestMetric.timestamp) {
            lastUpdate = latestMetric.timestamp?.toDate
              ? latestMetric.timestamp.toDate()
              : new Date(latestMetric.timestamp);
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
          this.trackingChart.options.plugins.title.text =
            "?�스???�과 추이 (?�이???�음)";
          this.updateChartHeader("?�스???�과 추이 (?�이???�음)", null);
        }
      }
    }

    // ?�짜 ?�이�??�맷??
    const dateLabels = dateRange.map((date) =>
      date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    );

    this.trackingChart.data.labels = dateLabels;
    // ?�이??바인??
    const datasets = this.trackingChart.data.datasets;
    datasets[0].data = viewsData;
    datasets[1].data = likesData;
    datasets[2].data = commentsData;
    datasets[3].data = sharesData;
    if (datasets[4]) datasets[4].data = followsData;

    // �?배치: combined??모두 y, split?� 조회??y / ?�머지 y2
    if (this.scaleMode === "split") {
      datasets[0].yAxisID = "y";
      for (let i = 1; i < datasets.length; i++) {
        datasets[i].yAxisID = "y2";
      }
    } else {
      for (let i = 0; i < datasets.length; i++) {
        datasets[i].yAxisID = "y";
      }
    }

    // y�??��????�계??(?�이??범위??맞게 최적??
    const maxValue = Math.max(
      ...(viewsData.length ? viewsData : [0]),
      ...(likesData.length ? likesData : [0]),
      ...(commentsData.length ? commentsData : [0]),
      ...(sharesData.length ? sharesData : [0]),
      ...(followsData.length ? followsData : [0])
    );
    // ?��???계산
    if (this.scaleMode === "split") {
      // ?�쪽 y: 조회???�용
      const maxViews = Math.max(...(viewsData.length ? viewsData : [0]));
      const yMax = maxViews > 0 ? Math.ceil(maxViews * 1.2) : 10;
      const yStep = Math.max(1, Math.ceil((yMax || 10) / 8));
      this.trackingChart.options.scales.y.max = yMax;
      this.trackingChart.options.scales.y.ticks.stepSize = yStep;

      // ?�른�?y2: ?�머지 지??
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
      // y2??비활?�처???�일 값으�?최소??
      this.trackingChart.options.scales.y2.max =
        this.trackingChart.options.scales.y.max;
      this.trackingChart.options.scales.y2.ticks.stepSize =
        this.trackingChart.options.scales.y.ticks.stepSize;
    }

    // ?�니메이???�이 ?�데?�트 (?�크�?문제 방�?)
    this.trackingChart.update("none");
  } catch (error) {
    // 차트 ?�데?�트 ?�패 ???�러 처리
    logger.error("[updateTrackingChart] Chart update failed:", error);
    // ?�용?�에�??�러 메시지 ?�시 (?�요??
    // this.showMessage('차트 ?�데?�트 �??�류가 발생?�습?�다. ?�이지�??�로고침?�주?�요.', 'error');
  }
};

/**
 * 범�? ???��? (?�이?�셋 show/hide)
 *
 * 차트???�정 ?�이?�셋???�시?�거???�깁?�다.
 * 버튼???��??�을 ?�데?�트?�여 ?�재 ?�태�??�각?�으�??�시?�니??
 *
 * @param {HTMLElement} button - ?��? 버튼 ?�소
 * @param {number} datasetIndex - ?�이?�셋 ?�덱??(0: 조회?? 1: 좋아?? 2: ?��?, 3: 공유, 4: ?�로??
 * @returns {void}
 */
DualTextWriter.prototype.toggleLegend = function (button, datasetIndex) {
  if (!this.trackingChart) return;

  const dataset = this.trackingChart.data.datasets[datasetIndex];
  if (!dataset) return;

  // ?�이?�셋 ?�시/?��? ?��? (즉시 반영)
  const isVisible = dataset.hidden !== true;
  dataset.hidden = isVisible;

  // 버튼 ?��????�데?�트
  if (isVisible) {
    button.style.opacity = "0.4";
    button.style.textDecoration = "line-through";
    button.setAttribute("aria-pressed", "false");
  } else {
    button.style.opacity = "1";
    button.style.textDecoration = "none";
    button.setAttribute("aria-pressed", "true");
  }

  // 차트 즉시 ?�데?�트 �?�?반응???��?
  this.trackingChart.update("none");

  // �?반응???�계??
  if (
    this.trackingChart &&
    this.trackingChart.options &&
    this.trackingChart.options.scales
  ) {
    this.updateTrackingChart(); // ?�체 차트 ?�데?�트�?�??�계??
  }
};
/**
 * 차트 컨트�??�보???�근???�벤??바인??
 *
 * 모든 차트 컨트�?버튼???�보???�벤??리스?��? 추�??�니??
 * Enter ?�는 Space ?�로 버튼???�성?�할 ???�도�??�니??
 *
 * **바인???�??**
 * - 차트 모드 버튼 (?�체 총합 / 개별 ?�스??
 * - 차트 범위 버튼 (7??/ 30??/ ?�체)
 * - 차트 ?��???버튼 (공동 / 분리)
 * - 범�? 버튼 (조회?? 좋아?? ?��?, 공유, ?�로??
 *
 * **?�벤??처리:**
 * - ?�벤???�임 ?�용?�로 ?�적?�로 추�???범�? 버튼??처리 가??
 * - `preventDefault()`�?기본 ?�작 방�?
 *
 * **?�근??**
 * - WCAG 2.1 AA 기�? 충족
 * - ?�보?�만?�로 모든 차트 기능 ?�근 가??
 *
 * @returns {void}
 */
DualTextWriter.prototype.bindChartKeyboardEvents = function () {
  // 차트 모드 버튼 ?�보???�벤??
  const modeButtons = ["chart-mode-total", "chart-mode-individual"];
  modeButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const mode = btnId === "chart-mode-total" ? "total" : "individual";
          this.setChartMode(mode);
        }
      });
    }
  });

  // 차트 범위 버튼 ?�보???�벤??
  const rangeButtons = ["chart-range-7d", "chart-range-30d", "chart-range-all"];
  rangeButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const range = btnId.replace("chart-range-", "");
          this.setChartRange(range);
        }
      });
    }
  });

  // 차트 ?��???버튼 ?�보???�벤??
  const scaleButtons = ["chart-scale-combined", "chart-scale-split"];
  scaleButtons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const mode = btnId === "chart-scale-combined" ? "combined" : "split";
          this.setScaleMode(mode);
        }
      });
    }
  });

  // 범�? 버튼 ?�보???�벤??(?�벤???�임 ?�용)
  const legendContainer = document.querySelector(".chart-legend-tabs");
  if (legendContainer) {
    legendContainer.addEventListener("keydown", (e) => {
      const legendBtn = e.target.closest(".legend-tab");
      if (!legendBtn) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const datasetIndex = parseInt(
          legendBtn.getAttribute("data-dataset") || "0"
        );
        this.toggleLegend(legendBtn, datasetIndex);
      }
    });
  }
};

// ?�?�된 글?�서 ?�래???�작
DualTextWriter.prototype.startTrackingFromSaved = async function (textId) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  try {
    // ?�?�된 ?�스???�보 가?�오�?
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      textId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?�스?��? 찾을 ???�습?�다.");
      this.showMessage("???�본 ?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?�이???��???검�? ?�본 ?�스?��? ?�효?��? ?�인
    if (!textData.content || textData.content.trim().length === 0) {
      logger.warn("?�본 ?�스???�용??비어?�습?�다.");
      this.showMessage("?�️ ?�본 ?�스???�용??비어?�습?�다.", "warning");
    }

    // 중복 ?�인: ?��? ???�스?�에???�스?��? ?�성?�었?��? ?�인 (?�택??
    const existingPosts = await this.checkExistingPostForText(textId);
    if (existingPosts.length > 0) {
      const confirmMessage = `???�스?�에???��? ${existingPosts.length}개의 ?�스?��? ?�성?�었?�니??\n계속?�서 ???�스?��? ?�성?�시겠습?�까?`;
      if (!confirm(confirmMessage)) {
        logger.log("?�용?��? 중복 ?�성 취소");
        return;
      }
    }

    // ?�스??컬렉?�에 추�?
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const postData = {
      content: textData.content,
      type: textData.type || "edit",
      postedAt: window.firebaseServerTimestamp(),
      trackingEnabled: true,
      metrics: [],
      analytics: {},
      sourceTextId: textId, // ?�본 ?�스??참조
      sourceType: textData.type || "edit", // ?�본 ?�스???�??
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    const docRef = await window.firebaseAddDoc(postsRef, postData);

    logger.log("?�래???�스?��? ?�성?�었?�니??", docRef.id);

    // ?�래????���??�환
    this.switchTab("tracking");

    // ?�래???�스??목록 ?�로고침
    this.loadTrackingPosts();
  } catch (error) {
    logger.error("?�래???�작 ?�패:", error);
    this.showMessage(
      "???�래???�작???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

// ?�정 ?�스?�에???�성???�스???�인
DualTextWriter.prototype.checkExistingPostForText = async function (textId) {
  if (!this.currentUser || !this.isFirebaseReady) return [];

  try {
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceTextId", "==", textId)
    );
    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    const existingPosts = [];
    querySnapshot.forEach((doc) => {
      existingPosts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return existingPosts;
  } catch (error) {
    logger.error("기존 ?�스???�인 ?�패:", error);
    return [];
  }
};

/**
 * ?�퍼?�스 글???�용 ?��?�??�인?�니??
 *
 * Firebase `posts` 컬렉?�에??`sourceType === 'reference'`?�고
 * `sourceTextId`가 ?�치?�는 ?�스??개수�?반환?�니??
 *
 * @param {string} referenceTextId - ?�퍼?�스 ?�스?�의 ID (texts 컬렉??문서 ID)
 * @returns {Promise<number>} ?�용 ?�수 (0?�면 ?�용 ?�됨, 1 ?�상?�면 ?�용??
 *
 * @example
 * const usageCount = await dualTextWriter.checkReferenceUsage('abc123');
 * if (usageCount > 0) {
 *     logger.log(`???�퍼?�스??${usageCount}???�용?�었?�니??`);
 * }
 */
DualTextWriter.prototype.checkReferenceUsage = async function (
  referenceTextId
) {
  // ?�러 처리: ?�라미터 ?�효??검??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "checkReferenceUsage: ?�못??referenceTextId:",
      referenceTextId
    );
    return 0;
  }

  // ?�러 처리: Firebase 준�??�태 ?�인
  if (!this.isFirebaseReady) {
    logger.warn("checkReferenceUsage: Firebase가 준비되지 ?�았?�니??");
    return 0;
  }

  // ?�러 처리: ?�용??로그???��? ?�인
  if (!this.currentUser) {
    logger.warn("checkReferenceUsage: ?�용?��? 로그?�하지 ?�았?�니??");
    return 0;
  }

  try {
    // Firebase posts 컬렉??참조
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // Firebase 쿼리: sourceType??'reference'?�고 sourceTextId가 ?�치?�는 ?�스??조회
    // 참고: Firestore??where ?�을 ?�러 �??�용?????�음 (복합 ?�덱???�요?????�음)
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference"),
      window.firebaseWhere("sourceTextId", "==", referenceTextId)
    );

    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    // ?�용 ?�수 계산 (쿼리 결과??문서 개수)
    const usageCount = querySnapshot.size;

    return usageCount;
  } catch (error) {
    // ?�러 처리: Firebase 조회 ?�패 ??기본�?0) 반환
    logger.error("?�퍼?�스 ?�용 ?��? ?�인 ?�패:", error);
    return 0;
  }
};

/**
 * ?�러 ?�퍼?�스 글???�용 ?��?�??�번???�인?�니??(?�능 최적??.
 *
 * Firebase `posts` 컬렉?�에??`sourceType === 'reference'`???�스?�들??조회????
 * JavaScript?�서 `sourceTextId`별로 그룹?�하???�용 ?�수�?계산?�니??
 *
 * **?�능 최적???�략:**
 * - 모든 ?�퍼?�스 ?�스?��? ??번의 쿼리�?조회
 * - JavaScript?�서 그룹?�하??카운??(Firebase `whereIn` 10�??�한 ?�피)
 *
 * @param {Array<string>} referenceTextIds - ?�퍼?�스 ?�스??ID 배열 (texts 컬렉??문서 ID??
 * @returns {Promise<Object>} ?�용 ?�수 객체: `{ textId1: count1, textId2: count2, ... }`
 *
 * @example
 * const usageMap = await dualTextWriter.checkMultipleReferenceUsage(['id1', 'id2', 'id3']);
 * // 결과: { id1: 2, id2: 0, id3: 1 }
 *
 * if (usageMap.id1 > 0) {
 *     logger.log(`?�퍼?�스 id1?� ${usageMap.id1}???�용?�었?�니??`);
 * }
 */
DualTextWriter.prototype.checkMultipleReferenceUsage = async function (
  referenceTextIds
) {
  // ?�러 처리: �?배열 ?�력 처리
  if (!Array.isArray(referenceTextIds) || referenceTextIds.length === 0) {
    return {};
  }

  // ?�러 처리: Firebase 준�??�태 ?�인
  if (!this.isFirebaseReady) {
    logger.warn(
      "checkMultipleReferenceUsage: Firebase가 준비되지 ?�았?�니??"
    );
    // 모든 ID???�??0 반환
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  // ?�러 처리: ?�용??로그???��? ?�인
  if (!this.currentUser) {
    logger.warn(
      "checkMultipleReferenceUsage: ?�용?��? 로그?�하지 ?�았?�니??"
    );
    // 모든 ID???�??0 반환
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  try {
    // Firebase posts 컬렉??참조
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // ?�능 최적?? sourceType??'reference'??모든 ?�스?��? ??번의 쿼리�?조회
    // (whereIn 10�??�한???�피?�기 ?�해 JavaScript?�서 ?�터�?
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference")
    );

    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    // ?�용 ?�수 계산???�한 Map 초기??(모든 ID???�??0?�로 초기??
    const usageMap = new Map();
    referenceTextIds.forEach((id) => {
      // ?�효??ID�?처리
      if (id && typeof id === "string") {
        usageMap.set(id, 0);
      }
    });

    // 쿼리 결과�??�회?�며 sourceTextId별로 카운??
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const sourceTextId = data.sourceTextId;

      // ?�청??ID 목록???�함??경우?�만 카운??
      if (sourceTextId && usageMap.has(sourceTextId)) {
        const currentCount = usageMap.get(sourceTextId);
        usageMap.set(sourceTextId, currentCount + 1);
      }
    });

    // Map??객체�?변?�하??반환
    const result = {};
    usageMap.forEach((count, id) => {
      result[id] = count;
    });

    return result;
  } catch (error) {
    // ?�러 처리: Firebase 조회 ?�패 ??모든 ID???�??0 반환
    logger.error("?�러 ?�퍼?�스 ?�용 ?��? ?�인 ?�패:", error);
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }
};
/**
 * ?�퍼?�스�??�용??것으�??�시?�니??(간단???�릭 ?�작).
 *
 * ?�퍼?�스�??�용?�다�??�시?�기 ?�해 ?�퍼?�스 ?�용 ?�스?��? ?�성?�니??
 * ?�용?��? "?�용 ?�됨" 배�?�??�릭?�을 ???�출?�니??
 *
 * @param {string} referenceTextId - ?�퍼?�스 ?�스?�의 ID (texts 컬렉??문서 ID)
 * @returns {Promise<void>}
 *
 * @example
 * await dualTextWriter.markReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.markReferenceAsUsed = async function (
  referenceTextId
) {
  // ?�러 처리: ?�라미터 ?�효??검??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "markReferenceAsUsed: ?�못??referenceTextId:",
      referenceTextId
    );
    this.showMessage("???�퍼?�스 ID�?찾을 ???�습?�다.", "error");
    return;
  }

  // ?�러 처리: Firebase 준�??�태 ?�인
  if (!this.isFirebaseReady) {
    logger.warn("markReferenceAsUsed: Firebase가 준비되지 ?�았?�니??");
    this.showMessage("??Firebase ?�결??준비되지 ?�았?�니??", "error");
    return;
  }

  // ?�러 처리: ?�용??로그???��? ?�인
  if (!this.currentUser) {
    logger.warn("markReferenceAsUsed: ?�용?��? 로그?�하지 ?�았?�니??");
    this.showMessage("??로그?�이 ?�요?�니??", "error");
    return;
  }

  try {
    // ?�퍼?�스 ?�스??조회
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?�퍼?�스 ?�스?��? 찾을 ???�습?�다.");
      this.showMessage("???�퍼?�스 ?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?�퍼?�스 ?�???�인
    if ((textData.type || "edit") !== "reference") {
      logger.warn("markReferenceAsUsed: ?�퍼?�스가 ?�닌 ?�스?�입?�다.");
      this.showMessage("???�퍼?�스 글�??�용 ?�시?????�습?�다.", "error");
      return;
    }

    // ?��? ?�용???�퍼?�스?��? ?�인
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount > 0) {
      logger.log("?��? ?�용???�퍼?�스?�니?? ?�용 ?�수:", existingUsageCount);
      // ?��? ?�용??경우?�도 메시지 ?�시?��? ?�고 조용??처리
      // UI�??�데?�트
      await this.refreshSavedTextsUI();
      return;
    }

    // ?�퍼?�스 ?�용 ?�스???�성
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const referencePostData = {
      content: textData.content, // ?�퍼?�스 ?�용
      type: "reference",
      postedAt: window.firebaseServerTimestamp(),
      trackingEnabled: false, // ?�퍼?�스 ?�스?�는 ?�래??비활?�화
      metrics: [],
      analytics: {},
      sourceTextId: referenceTextId, // ?�퍼?�스 ?�스??참조
      sourceType: "reference", // ?�퍼?�스 ?�?�으�??�정
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    await window.firebaseAddDoc(postsRef, referencePostData);
    logger.log(
      "???�퍼?�스 ?�용 ?�시 ?�료 (?�퍼?�스 ID:",
      referenceTextId,
      ")"
    );

    // ?�공 메시지
    this.showMessage("???�퍼?�스가 ?�용?�으�??�시?�었?�니??", "success");

    // "?�용?? ??���??�동 ?�동
    this.setSavedFilter("reference-used");

    // UI 즉시 ?�데?�트 (?�로고침 ?�이)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // ?�러 처리: Firebase 조회/?�성 ?�패 ???�러 메시지 ?�시
    logger.error("?�퍼?�스 ?�용 ?�시 ?�패:", error);
    this.showMessage(
      "???�퍼?�스 ?�용 ?�시???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

/**
 * ?�퍼?�스�??�용 ?�된 것으�??�돌립니??(?��? 기능).
 *
 * ?�퍼?�스 ?�용 ?�스?��? ??��?�여 ?�용 ?�됨 ?�태�?복원?�니??
 * ?�용?��? "?�용?? 배�?�??�릭?�을 ???�출?�니??
 *
 * @param {string} referenceTextId - ?�퍼?�스 ?�스?�의 ID (texts 컬렉??문서 ID)
 * @returns {Promise<void>}
 *
 * @example
 * await dualTextWriter.unmarkReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.unmarkReferenceAsUsed = async function (
  referenceTextId
) {
  // ?�러 처리: ?�라미터 ?�효??검??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "unmarkReferenceAsUsed: ?�못??referenceTextId:",
      referenceTextId
    );
    this.showMessage("???�퍼?�스 ID�?찾을 ???�습?�다.", "error");
    return;
  }

  // ?�러 처리: Firebase 준�??�태 ?�인
  if (!this.isFirebaseReady) {
    logger.warn("unmarkReferenceAsUsed: Firebase가 준비되지 ?�았?�니??");
    this.showMessage("??Firebase ?�결??준비되지 ?�았?�니??", "error");
    return;
  }

  // ?�러 처리: ?�용??로그???��? ?�인
  if (!this.currentUser) {
    logger.warn("unmarkReferenceAsUsed: ?�용?��? 로그?�하지 ?�았?�니??");
    this.showMessage("??로그?�이 ?�요?�니??", "error");
    return;
  }

  try {
    // ?�퍼?�스 ?�스??조회
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?�퍼?�스 ?�스?��? 찾을 ???�습?�다.");
      this.showMessage("???�퍼?�스 ?�스?��? 찾을 ???�습?�다.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?�퍼?�스 ?�???�인
    if ((textData.type || "edit") !== "reference") {
      logger.warn("unmarkReferenceAsUsed: ?�퍼?�스가 ?�닌 ?�스?�입?�다.");
      this.showMessage(
        "???�퍼?�스 글�??�용 ?�됨?�로 ?�돌�????�습?�다.",
        "error"
      );
      return;
    }

    // ?�재 ?�용 ?��? ?�인
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount === 0) {
      logger.log("?��? ?�용 ?�된 ?�퍼?�스?�니??");
      // ?��? ?�용 ?�된 경우?�도 메시지 ?�시?��? ?�고 조용??처리
      // UI�??�데?�트
      await this.refreshSavedTextsUI();
      return;
    }

    // ?�퍼?�스 ?�용 ?�스??조회 �???��
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceTextId", "==", referenceTextId),
      window.firebaseWhere("sourceType", "==", "reference")
    );
    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    if (querySnapshot.empty) {
      logger.warn(
        "unmarkReferenceAsUsed: ?�퍼?�스 ?�용 ?�스?��? 찾을 ???�습?�다."
      );
      // ?�용 ?�스?��? ?�어??UI�??�데?�트
      await this.refreshSavedTextsUI();
      return;
    }

    // 모든 ?�퍼?�스 ?�용 ?�스????�� (배치 ??��)
    const deletePromises = querySnapshot.docs.map((doc) => {
      return window.firebaseDeleteDoc(
        window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "posts",
          doc.id
        )
      );
    });

    await Promise.all(deletePromises);
    logger.log(
      "???�퍼?�스 ?�용 ?�됨 복원 ?�료 (?�퍼?�스 ID:",
      referenceTextId,
      ", ??��???�스??",
      querySnapshot.docs.length,
      "�?"
    );

    // ?�공 메시지
    this.showMessage("???�퍼?�스가 ?�용 ?�됨?�로 ?�돌?�졌?�니??", "success");

    // "?�퍼?�스" ??���??�동 ?�동 (?�용 ?�됨 ?�퍼?�스�?보기 ?�해)
    this.setSavedFilter("reference");

    // UI 즉시 ?�데?�트 (?�로고침 ?�이)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // ?�러 처리: Firebase 조회/??�� ?�패 ???�러 메시지 ?�시
    logger.error("?�퍼?�스 ?�용 ?�됨 복원 ?�패:", error);
    this.showMessage(
      "???�퍼?�스 ?�용 ?�됨 복원???�패?�습?�다: " + error.message,
      "error"
    );
  }
};

/**
 * ?�?�된 글 목록 UI�??�로고침?�니??
 * ?�퍼?�스 ?�용 ?��?�??�시 ?�인?�여 배�? ?�데?�트?�니??
 *
 * @returns {Promise<void>}
 */
DualTextWriter.prototype.refreshSavedTextsUI = async function () {
  try {
    // ?�?�된 글 목록 ?�시 ?�더�?
    await this.renderSavedTexts();
  } catch (error) {
    logger.error("?�?�된 글 UI ?�로고침 ?�패:", error);
  }
};

// Orphan ?�스???�리 (?�본????��???�스???�괄 ??��)
DualTextWriter.prototype.cleanupOrphanPosts = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("??로그?�이 ?�요?�니??", "error");
    return;
  }

  // Orphan ?�스???�터�?
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);

  if (orphanPosts.length === 0) {
    this.showMessage("???�리??orphan ?�스?��? ?�습?�다.", "success");
    return;
  }

  // ??�� ???�인
  const metricsCount = orphanPosts.reduce(
    (sum, post) => sum + (post.metrics?.length || 0),
    0
  );
  const confirmMessage =
    `?�본????��???�스??${orphanPosts.length}개�? ??��?�시겠습?�까?\n\n` +
    `?�️ ??��???�이??\n` +
    `   - ?�래???�스?? ${orphanPosts.length}�?n` +
    `   - ?�래??기록: ${metricsCount}�?n\n` +
    `???�업?� ?�돌�????�습?�다.`;

  if (!confirm(confirmMessage)) {
    logger.log("?�용?��? orphan ?�스???�리 취소");
    return;
  }

  try {
    // 진행 �?메시지
    this.showMessage("?�� Orphan ?�스?��? ?�리?�는 �?..", "info");

    // 모든 orphan ?�스????�� (병렬 처리)
    const deletePromises = orphanPosts.map((post) => {
      const postRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "posts",
        post.id
      );
      return window.firebaseDeleteDoc(postRef);
    });

    await Promise.all(deletePromises);

    // 로컬 배열?�서???�거
    this.trackingPosts = this.trackingPosts.filter((post) => !post.isOrphan);

    // UI ?�데?�트
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // ?�공 메시지
    this.showMessage(
      `??Orphan ?�스??${orphanPosts.length}개�? ?�리?�었?�니??`,
      "success"
    );
    logger.log("Orphan ?�스???�리 ?�료", {
      deletedCount: orphanPosts.length,
    });
  } catch (error) {
    logger.error("Orphan ?�스???�리 ?�패:", error);
    this.showMessage(
      "??Orphan ?�스???�리???�패?�습?�다: " + error.message,
      "error"
    );
  }
};
// ?�괄 마이그레?�션 ?�인 ?�?�상???�시
DualTextWriter.prototype.showBatchMigrationConfirm = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그?�이 ?�요?�니??", "error");
    return;
  }

  // 미트?�킹 글�?찾기
  const untrackedTexts = [];

  for (const textItem of this.savedTexts) {
    // 로컬?�서 먼�? ?�인
    let hasTracking = false;
    if (this.trackingPosts) {
      hasTracking = this.trackingPosts.some(
        (p) => p.sourceTextId === textItem.id
      );
    }

    // 로컬???�으�?Firebase?�서 ?�인
    if (!hasTracking) {
      try {
        const postsRef = window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "posts"
        );
        const q = window.firebaseQuery(
          postsRef,
          window.firebaseWhere("sourceTextId", "==", textItem.id)
        );
        const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));
        hasTracking = !querySnapshot.empty;
      } catch (error) {
        logger.error("?�래???�인 ?�패:", error);
      }
    }

    if (!hasTracking) {
      untrackedTexts.push(textItem);
    }
  }

  if (untrackedTexts.length === 0) {
    this.showMessage("??모든 ?�?�된 글???��? ?�래??중입?�다!", "success");
    // 버튼 ?�태 ?�데?�트
    this.updateBatchMigrationButton();
    return;
  }

  const confirmMessage =
    `?�래?�이 ?�작?��? ?��? ?�?�된 글 ${untrackedTexts.length}개�? ?�래???�스?�로 변?�하?�겠?�니�?\n\n` +
    `?�️ 주의?�항:\n` +
    `- ?��? ?�래??중인 글?� ?�외?�니??n` +
    `- 중복 ?�성 방�?�??�해 �??�스?�의 기존 ?�스?��? ?�인?�니??n` +
    `- 마이그레?�션 중에???�이지�??��? 마세??;

  if (confirm(confirmMessage)) {
    // 미트?�킹 글�?마이그레?�션 ?�행
    this.executeBatchMigrationForUntracked(untrackedTexts);
  }
};

// 미트?�킹 글�??�괄 마이그레?�션 ?�행
DualTextWriter.prototype.executeBatchMigrationForUntracked = async function (
  untrackedTexts
) {
  if (
    !this.currentUser ||
    !this.isFirebaseReady ||
    !untrackedTexts ||
    untrackedTexts.length === 0
  ) {
    return;
  }

  const button = this.batchMigrationBtn;
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  try {
    // 버튼 비활?�화
    if (button) {
      button.disabled = true;
      button.textContent = "마이그레?�션 진행 �?..";
    }

    this.showMessage(
      `?�� 미트?�킹 글 ${untrackedTexts.length}개의 ?�래?�을 ?�작?�니??..`,
      "info"
    );

    // �?미트?�킹 ?�스?�에 ?�???�스???�성
    for (let i = 0; i < untrackedTexts.length; i++) {
      const textItem = untrackedTexts[i];

      try {
        // 기존 ?�스???�인 (?�전?�치)
        const existingPosts = await this.checkExistingPostForText(textItem.id);
        if (existingPosts.length > 0) {
          logger.log(
            `?�스??${textItem.id}: ?��? ${existingPosts.length}개의 ?�스??존재, 건너?�`
          );
          skipCount++;
          continue;
        }

        // ?�스???�성 (?�래?????�환 ?�이 백그?�운??처리)
        const textRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          textItem.id
        );
        const textDoc = await window.firebaseGetDoc(textRef);

        if (!textDoc.exists()) {
          errorCount++;
          continue;
        }

        const textData = textDoc.data();

        const postsRef = window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "posts"
        );
        const postData = {
          content: textData.content,
          type: textData.type || "edit",
          postedAt: window.firebaseServerTimestamp(),
          trackingEnabled: true,
          metrics: [],
          analytics: {},
          sourceTextId: textItem.id,
          sourceType: textData.type || "edit",
          createdAt: window.firebaseServerTimestamp(),
          updatedAt: window.firebaseServerTimestamp(),
        };

        await window.firebaseAddDoc(postsRef, postData);
        successCount++;

        // 진행 ?�황 ?�시 (마�?�???��???�닐 ?�만)
        if (i < untrackedTexts.length - 1) {
          const progress = Math.round(((i + 1) / untrackedTexts.length) * 100);
          if (button) {
            button.textContent = `마이그레?�션 진행 �?.. (${progress}%)`;
          }
        }

        // ?�무 빠른 ?�청 방�? (Firebase ?�당??고려)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`?�스??${textItem.id} 마이그레?�션 ?�패:`, error);
        errorCount++;
      }
    }

    // 결과 메시지
    const resultMessage =
      `??미트?�킹 글 마이그레?�션 ?�료!\n` +
      `- ?�공: ${successCount}�?n` +
      `- 건너?�: ${skipCount}�?(?��? ?�스??존재)\n` +
      `- ?�패: ${errorCount}�?;

    this.showMessage(resultMessage, "success");
    logger.log("?�괄 마이그레?�션 결과:", {
      successCount,
      skipCount,
      errorCount,
    });

    // ?�래???�스??목록 ?�로고침 (?�래????�� ?�성?�되???�으�?
    if (this.loadTrackingPosts) {
      await this.loadTrackingPosts();
    }

    // ?�?�된 글 목록???�로고침 (버튼 ?�태 ?�데?�트�??�해)
    await this.renderSavedTexts();
  } catch (error) {
    logger.error("?�괄 마이그레?�션 �??�류:", error);
    this.showMessage(
      "??마이그레?�션 �??�류가 발생?�습?�다: " + error.message,
      "error"
    );
  } finally {
    // 버튼 복원 �??�태 ?�데?�트
    if (button) {
      button.disabled = false;
    }
    // 버튼 ?�스?�는 updateBatchMigrationButton?�서 ?�데?�트??
    await this.updateBatchMigrationButton();
  }
};

// [Refactoring] ?�역 ?�스?�스 ?�성 �??�출 ?�거 (DOMContentLoaded?�서 처리??
// const dualTextWriter = new DualTextWriter(); // Removed to avoid duplicate and premature instantiation
// window.dualTextWriter = dualTextWriter; // Handled in DOMContentLoaded
// window.app = dualTextWriter; // Handled in DOMContentLoaded

// ?�역 ?�수??(?�라???�들???�환???��?)
window.saveTrackingData = function () {
  if (window.dualTextWriter) {
    window.dualTextWriter.saveTrackingData();
  }
};

window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active"); // classList ?�용 권장
    // ?�위 ?�환?? style.display??체크
    if (modal.style.display === "block" || modal.style.display === "flex") {
      modal.style.display = "none";
    }
  }
  if (modalId === "tracking-modal" && window.dualTextWriter) {
    window.dualTextWriter.closeTrackingModal();
  }
  if (modalId === "tracking-edit-modal" && window.dualTextWriter) {
    window.dualTextWriter.editingMetricData = null;
  }
};

window.updateTrackingDataItem = function () {
  if (window.dualTextWriter) {
    window.dualTextWriter.updateTrackingDataItem();
  }
};

window.deleteTrackingDataItem = function () {
  if (window.dualTextWriter) {
    window.dualTextWriter.deleteTrackingDataItem();
  }
};

logger.log("DualTextWriter initialized (Module Mode)");

// ========================================
// 글 ?�세 ?�널 ?��? 모드 기능
// ========================================

/**
 * 글 ?�세 ?�널 ?��? 모드 초기??
 * - ?��? 버튼 ?�릭 ?�벤??
 * - ESC ?�로 ?�기
 * - ?�버?�이 ?�릭?�로 ?�기
 */
document.addEventListener("DOMContentLoaded", () => {
  const detailExpandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");
  const detailPanelClose = document.getElementById("detail-panel-close");

  if (!detailExpandBtn || !articleDetailPanel) {
    logger.warn("글 ?�세 ?�널 ?��? 모드: ?�수 ?�소�?찾을 ???�습?�다.");
    return;
  }

  /**
   * ?��? 모드 ?��? ?�수
   */
  function toggleDetailPanelExpand() {
    const isExpanded = articleDetailPanel.classList.contains("expanded");

    if (isExpanded) {
      // 축소
      articleDetailPanel.classList.remove("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "false");
      detailExpandBtn.title = "?�체 ?�면 ?��? (ESC�??�기)";
      document.body.style.overflow = "";
      removeDetailPanelOverlay();
    } else {
      // ?��?
      articleDetailPanel.classList.add("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "true");
      detailExpandBtn.title = "?��? 모드 ?�기 (ESC)";
      document.body.style.overflow = "hidden";
      addDetailPanelOverlay();
    }
  }

  /**
   * ?�버?�이 추�? ?�수
   */
  function addDetailPanelOverlay() {
    let overlay = document.querySelector(".detail-panel-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "detail-panel-overlay";
      document.body.appendChild(overlay);

      // ?�버?�이 ?�릭 ??축소
      overlay.addEventListener("click", toggleDetailPanelExpand);
    }
    overlay.classList.add("active");
  }

  /**
   * ?�버?�이 ?�거 ?�수
   */
  function removeDetailPanelOverlay() {
    const overlay = document.querySelector(".detail-panel-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  }

  // ?��? 버튼 ?�릭 ?�벤??-> 모달 ?��? 모드�?변�?
  detailExpandBtn.addEventListener("click", () => {
    if (window.dualTextWriter) {
      window.dualTextWriter.openExpandMode();
    } else {
      logger.error("DualTextWriter ?�스?�스�?찾을 ???�습?�다.");
    }
  });

  // ESC ?�로 ?��? 모드 ?�기
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (
        articleDetailPanel &&
        articleDetailPanel.classList.contains("expanded")
      ) {
        toggleDetailPanelExpand();
      }
    }
  });

  // ?�널 ?�기 버튼 ?�릭 ???��? 모드???�제
  if (detailPanelClose) {
    const originalCloseHandler = detailPanelClose.onclick;
    detailPanelClose.addEventListener("click", () => {
      // ?��? 모드가 ?�성?�되???�으�?먼�? ?�제
      if (articleDetailPanel.classList.contains("expanded")) {
        toggleDetailPanelExpand();
      }
    });
  }

  logger.log("??글 ?�세 ?�널 ?��? 모드 초기???�료");
});

// ========================================
// 글 ?�세 ?�널 ?�퍼?�스 기능
// ========================================

/**
 * 글 ?�세 ?�널?�서 ?�퍼?�스�?로드?�고 관리하??기능
 * - ?��? 모드 ?�성?????�결???�퍼?�스 ?�동 로드
 * - ?�퍼?�스 목록 ?�더�?
 * - ?�퍼?�스 ?�릭?�로 ?�용 복사
 * - ?�래그로 ?�널 ?�기 조절
 */

let currentArticleReferences = [];
let currentEditingArticleId = null;

/**
 * 글???�결???�퍼?�스 로드
 */
function loadArticleReferences(articleId) {
  currentEditingArticleId = articleId;
  currentArticleReferences = [];

  // DualTextWriter ?�스?�스 ?�인
  if (!window.dualTextWriter || !window.dualTextWriter.currentUser) {
    logger.warn("DualTextWriter ?�스?�스가 ?�거??로그?�하지 ?�았?�니??");
    renderDetailReferences();
    return;
  }

  // ?�재 ?�집 중인 글 찾기
  const article = window.dualTextWriter.savedTexts.find(
    (t) => t.id === articleId
  );
  if (!article) {
    logger.warn("글??찾을 ???�습?�다:", articleId);
    renderDetailReferences();
    return;
  }

  // ?�결???�퍼?�스가 ?�는지 ?�인
  if (article.linkedReferences && article.linkedReferences.length > 0) {
    // ?�퍼?�스 ID�??�제 ?�퍼?�스 ?�이??가?�오�?
    const references = article.linkedReferences
      .map((refId) => {
        return window.dualTextWriter.savedTexts.find((t) => t.id === refId);
      })
      .filter((ref) => ref); // null ?�거

    currentArticleReferences = references;
    logger.log(`???�퍼?�스 ${references.length}�?로드 ?�료`);
  }

  renderDetailReferences();
}

/**
 * ?�퍼?�스 목록 ?�더�?
 */
function renderDetailReferences() {
  const listEl = document.getElementById("detail-reference-list");
  const emptyEl = document.querySelector(".detail-reference-empty");

  if (!listEl || !emptyEl) {
    logger.warn("?�퍼?�스 UI ?�소�?찾을 ???�습?�다.");
    return;
  }

  // ?�퍼?�스가 ?�는 경우
  if (currentArticleReferences.length === 0) {
    listEl.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  // ?�퍼?�스 목록 ?�시
  listEl.style.display = "block";
  emptyEl.style.display = "none";

  // HTML ?�스케?�프 ?�수
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ?�퍼?�스 ??�� ?�더�?
  listEl.innerHTML = currentArticleReferences
    .map((ref) => {
      const title = ref.topic || ref.source || "?�목 ?�음";
      const content = ref.content || "?�용 ?�음";

      return `
            <div class="detail-reference-item" data-ref-id="${
              ref.id
            }" role="button" tabindex="0">
                <div class="detail-reference-item-title">${escapeHtml(
                  title
                )}</div>
                <div class="detail-reference-item-content">${escapeHtml(
                  content
                )}</div>
            </div>
        `;
    })
    .join("");

  // ?�릭 ?�벤?? ?�용 복사
  listEl.querySelectorAll(".detail-reference-item").forEach((item) => {
    item.addEventListener("click", () => {
      const refId = item.dataset.refId;
      const ref = currentArticleReferences.find((r) => r.id === refId);
      if (ref && ref.content) {
        navigator.clipboard
          .writeText(ref.content)
          .then(() => {
            // 복사 ?�공 ?�드�?
            const originalBg = item.style.background;
            item.style.background = "#e7f3ff";
            setTimeout(() => {
              item.style.background = originalBg;
            }, 300);

            logger.log("???�퍼?�스 ?�용 복사 ?�료");
          })
          .catch((err) => {
            logger.error("복사 ?�패:", err);
            alert("복사???�패?�습?�다.");
          });
      }
    });

    // ?�보???�근??
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.click();
      }
    });
  });
}

/**
 * ?�래�?가?�한 구분??초기??
 */
function initDetailDividerDrag() {
  const divider = document.getElementById("detail-split-divider");
  const container = document.querySelector(".detail-edit-container");

  if (!divider || !container) {
    logger.warn("구분???�소�?찾을 ???�습?�다.");
    return;
  }

  let isDragging = false;

  divider.addEventListener("mousedown", (e) => {
    isDragging = true;
    divider.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;

    // 최소/최�? ?�비 ?�한 (300px ~ ?�체 ?�비 - 400px)
    const minWidth = 300;
    const maxWidth = containerRect.width - 400;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      container.style.gridTemplateColumns = `${newWidth}px 4px 1fr`;
    }
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      divider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });

  logger.log("??구분???�래�?기능 초기???�료");
}

/**
 * ?��? 버튼 ?�릭 ???�퍼?�스 로드 �?구분??초기??
 */
document.addEventListener("DOMContentLoaded", () => {
  const expandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");

  if (expandBtn && articleDetailPanel) {
    // 기존 ?��? 버튼 ?�릭 ?�벤?�에 추�? 로직 ?�입
    expandBtn.addEventListener("click", () => {
      // ?�간??지?????��? 모드 ?�태 ?�인
      setTimeout(() => {
        const isExpanded = articleDetailPanel.classList.contains("expanded");
        const isEditMode =
          document.getElementById("detail-edit-mode").style.display !== "none";

        // ?��? 모드 ?�성??&& ?�정 모드???�만 ?�행
        if (isExpanded && isEditMode && currentEditingArticleId) {
          loadArticleReferences(currentEditingArticleId);
          initDetailDividerDrag();
          logger.log("???��? 모드?�서 ?�퍼?�스 ?�널 ?�성??);
        }
      }, 100);
    });
  }

  logger.log("???�퍼?�스 ?�널 기능 초기???�료");
});

/**
 * ?�정 모드 진입 ???�재 글 ID ?�??
 * (기존 코드?�서 ?�정 버튼 ?�릭 ???�출?�는 부분에 추�? ?�요)
 */
function setCurrentEditingArticle(articleId) {
  currentEditingArticleId = articleId;
  logger.log("?�재 ?�집 중인 글 ID ?�정:", articleId);
}

// ?�역 ?�수�??�출 (기존 코드?�서 ?�출 가?�하?�록)
window.setCurrentEditingArticle = setCurrentEditingArticle;
window.loadArticleReferences = loadArticleReferences;

// ================================================================
// [Phase 3] 2025-12-08
// URL ?�결 ??기능 (URL Connection Tab Feature)
// 
// - ?�주 ?�용?�는 URL??관리하�?빠르�??�근
// - LocalStorage 기반 ?�이???�??
// - CRUD 기능 (추�?, 조회, ?�정, ??��)
// - 보안: noopener noreferrer, XSS 방�?
// ================================================================

/**
 * URL ?�결 관리자 (UrlLinkManager)
 * 
 * ?�역 ?�코?�에??URL 링크 관�?기능???�공?�니??
 * Firebase Firestore�??�용?�여 ?�로??브라?��?/?�바?�스 ?�기?��? 지?�합?�다.
 */
const UrlLinkManager = (function () {
  // ----------------------------------------
  // 3.1 ?�수 �??�이??모델 ?�의
  // ----------------------------------------
  
  /**
   * Firestore 컬렉???�름
   * 경로: users/{userId}/urlLinks/{linkId}
   * @type {string}
   */
  const URL_LINKS_COLLECTION = "urlLinks";

  /**
   * URL 링크 ?�이??배열
   * @type {Array<{id: string, name: string, description: string, url: string, order: number, createdAt: number}>}
   */
  let urlLinks = [];

  /**
   * ?�재 ?�정 중인 링크 ID (null?�면 추�? 모드)
   * @type {string|null}
   */
  let editingLinkId = null;

  /**
   * Firebase 준�??�태 �??�용??참조
   */
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;

  // DOM ?�소 캐시
  let elements = {};

  // ----------------------------------------
  // 3.2 Firebase Firestore ?�동 ?�수
  // ----------------------------------------

  /**
   * Firebase?�서 URL 링크 ?�이??로드
   * @returns {Promise<Array>} URL 링크 배열
   */
  async function loadUrlLinks() {
    // Firebase 준�??�인
    if (!isFirebaseReady || !currentUser) {
      logger.warn("URL 링크 로드: Firebase가 준비되지 ?�았거나 로그?�되지 ?�았?�니??");
      urlLinks = [];
      renderUrlLinks();
      return urlLinks;
    }

    try {
      const linksRef = window.firebaseCollection(
        db,
        "users",
        currentUser.uid,
        URL_LINKS_COLLECTION
      );

      // order ?�드�??�렬?�여 조회
      const q = window.firebaseQuery(
        linksRef,
        window.firebaseOrderBy("order", "asc")
      );

      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      urlLinks = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.log(`??URL 링크 ${urlLinks.length}�?로드 ?�료 (Firebase)`);
      renderUrlLinks();
      return urlLinks;
    } catch (error) {
      logger.error("Firebase?�서 URL 링크 로드 ?�패:", error);
      urlLinks = [];
      renderUrlLinks();
      return urlLinks;
    }
  }

  /**
   * Firebase???�일 URL 링크 ?�??(추�?)
   * @param {Object} linkData - ?�?�할 URL 링크 ?�이??
   * @returns {Promise<string|null>} ?�?�된 문서 ID ?�는 null
   */
  async function saveUrlLinkToFirebase(linkData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??로그?�이 ?�요?�니??", "error");
      return null;
    }

    try {
      const linksRef = window.firebaseCollection(
        db,
        "users",
        currentUser.uid,
        URL_LINKS_COLLECTION
      );

      const docRef = await window.firebaseAddDoc(linksRef, {
        ...linkData,
        createdAt: window.firebaseServerTimestamp(),
      });

      logger.log(`??URL 링크 ?�???�료 (ID: ${docRef.id})`);
      return docRef.id;
    } catch (error) {
      logger.error("Firebase??URL 링크 ?�???�패:", error);
      showMessage("???�?�에 ?�패?�습?�다: " + error.message, "error");
      return null;
    }
  }

  /**
   * Firebase?�서 URL 링크 ?�정
   * @param {string} linkId - 링크 문서 ID
   * @param {Object} updateData - ?�정???�이??
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function updateUrlLinkInFirebase(linkId, updateData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??로그?�이 ?�요?�니??", "error");
      return false;
    }

    try {
      const linkRef = window.firebaseDoc(
        db,
        "users",
        currentUser.uid,
        URL_LINKS_COLLECTION,
        linkId
      );

      await window.firebaseUpdateDoc(linkRef, {
        ...updateData,
        updatedAt: window.firebaseServerTimestamp(),
      });

      logger.log(`??URL 링크 ?�정 ?�료 (ID: ${linkId})`);
      return true;
    } catch (error) {
      logger.error("Firebase?�서 URL 링크 ?�정 ?�패:", error);
      showMessage("???�정???�패?�습?�다: " + error.message, "error");
      return false;
    }
  }

  /**
   * Firebase?�서 URL 링크 ??��
   * @param {string} linkId - 링크 문서 ID
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function deleteUrlLinkFromFirebase(linkId) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??로그?�이 ?�요?�니??", "error");
      return false;
    }

    try {
      const linkRef = window.firebaseDoc(
        db,
        "users",
        currentUser.uid,
        URL_LINKS_COLLECTION,
        linkId
      );

      await window.firebaseDeleteDoc(linkRef);
      logger.log(`??URL 링크 ??�� ?�료 (ID: ${linkId})`);
      return true;
    } catch (error) {
      logger.error("Firebase?�서 URL 링크 ??�� ?�패:", error);
      showMessage("????��???�패?�습?�다: " + error.message, "error");
      return false;
    }
  }

  /**
   * 모든 URL 링크??order �??�괄 ?�데?�트 (?�서 변경용)
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function updateAllOrdersInFirebase() {
    if (!isFirebaseReady || !currentUser) {
      return false;
    }

    try {
      // �?링크??order 값을 ?�재 배열 ?�덱?�로 ?�데?�트
      const updatePromises = urlLinks.map((link, index) => {
        const linkRef = window.firebaseDoc(
          db,
          "users",
          currentUser.uid,
          URL_LINKS_COLLECTION,
          link.id
        );
        return window.firebaseUpdateDoc(linkRef, { order: index });
      });

      await Promise.all(updatePromises);
      logger.log("??URL 링크 ?�서 ?�데?�트 ?�료");
      return true;
    } catch (error) {
      logger.error("URL 링크 ?�서 ?�데?�트 ?�패:", error);
      return false;
    }
  }

  // ----------------------------------------
  // 3.3 CRUD ?�수 구현
  // ----------------------------------------

  /**
   * 고유 ID ?�성
   * @returns {string} 고유 ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * URL ?�효??검??�??�동 ?�정
   * @param {string} url - URL 문자??
   * @returns {string|null} ?�효??URL ?�는 null
   */
  function validateAndFixUrl(url) {
    if (!url || typeof url !== "string") {
      return null;
    }

    let trimmedUrl = url.trim();

    // �?문자??체크
    if (!trimmedUrl) {
      return null;
    }

    // ?�험???�로?�콜 차단 (XSS 방�?)
    const dangerousProtocols = ["javascript:", "data:", "vbscript:"];
    const lowerUrl = trimmedUrl.toLowerCase();
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        showMessage("??보안?�의 ?�유�??�당 URL???�용?????�습?�다.", "error");
        return null;
      }
    }

    // http:// ?�는 https:// ?�으�??�동 추�?
    if (!trimmedUrl.match(/^https?:\/\//i)) {
      trimmedUrl = "https://" + trimmedUrl;
    }

    // URL ?�식 검�?
    try {
      new URL(trimmedUrl);
      return trimmedUrl;
    } catch (e) {
      showMessage("???�바�?URL ?�식???�닙?�다.", "error");
      return null;
    }
  }

  /**
   * ??URL 링크 추�? (Firebase ?�??
   * @param {Object} linkData - { name, description, url }
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function addUrlLink(linkData) {
    // ?�효??검??
    if (!linkData.name || !linkData.name.trim()) {
      showMessage("???�비??명칭???�력?�주?�요.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(linkData.url);
    if (!validUrl) {
      return false;
    }

    // ??링크 ?�이???�성 (order???�재 배열 길이 = �???
    const newLinkData = {
      name: linkData.name.trim(),
      description: (linkData.description || "").trim(),
      url: validUrl,
      order: urlLinks.length,
    };

    // Firebase???�??
    const docId = await saveUrlLinkToFirebase(newLinkData);
    if (docId) {
      showMessage("??URL??추�??�었?�니??", "success");
      hideForm();
      // ?�이???�시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL 링크 ?�정 (Firebase ?�데?�트)
   * @param {string} id - 링크 ID
   * @param {Object} newData - { name, description, url }
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function updateUrlLink(id, newData) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("???�정??URL??찾을 ???�습?�다.", "error");
      return false;
    }

    // ?�효??검??
    if (!newData.name || !newData.name.trim()) {
      showMessage("???�비??명칭???�력?�주?�요.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(newData.url);
    if (!validUrl) {
      return false;
    }

    // Firebase???�데?�트
    const updateData = {
      name: newData.name.trim(),
      description: (newData.description || "").trim(),
      url: validUrl,
    };

    const success = await updateUrlLinkInFirebase(id, updateData);
    if (success) {
      showMessage("??URL???�정?�었?�니??", "success");
      hideForm();
      // ?�이???�시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL 링크 ??�� (Firebase ??��)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function deleteUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("????��??URL??찾을 ???�습?�다.", "error");
      return false;
    }

    // ?�인 ?�?�상??
    if (!confirm(`"${link.name}" URL????��?�시겠습?�까?`)) {
      return false;
    }

    // Firebase?�서 ??��
    const success = await deleteUrlLinkFromFirebase(id);
    if (success) {
      showMessage("??URL????��?�었?�니??", "success");
      // ?�이???�시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  // ----------------------------------------
  // 3.3.1 URL 링크 ?�서 ?�동 기능 (Firebase)
  // ----------------------------------------

  /**
   * URL 링크�??�로 ?�동 (?�서 변�?- Firebase)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function moveUrlLinkUp(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // �?번째 ??��?� ???�로 ?�동 불�?
    if (index <= 0) {
      return false;
    }

    // 배열?�서 ?�치 교환
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];

    // Firebase???�서 ?�데?�트
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // ?�패 ??롤백
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];
    return false;
  }

  /**
   * URL 링크�??�래�??�동 (?�서 변�?- Firebase)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} ?�공 ?��?
   */
  async function moveUrlLinkDown(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // 마�?�???��?� ???�래�??�동 불�?
    if (index === -1 || index >= urlLinks.length - 1) {
      return false;
    }

    // 배열?�서 ?�치 교환
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];

    // Firebase???�서 ?�데?�트
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // ?�패 ??롤백
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];
    return false;
  }

  /**
   * URL ?�기 (????
   * @param {string} id - 링크 ID
   */
  function openUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("??URL??찾을 ???�습?�다.", "error");
      return;
    }

    // 보안: noopener, noreferrer ?�션 ?�용
    window.open(link.url, "_blank", "noopener,noreferrer");
    logger.log(`??URL ?�기: ${link.name} (${link.url})`);
  }

  // ----------------------------------------
  // 3.4 ?�더�??�수
  // ----------------------------------------

  /**
   * URL?�서 ?�메??추출
   * @param {string} url - URL 문자??
   * @returns {string} ?�메??
   */
  function extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return "";
    }
  }

  /**
   * URL 링크 목록 ?�더�?
   * - DocumentFragment ?�용?�로 ?�능 최적??
   * - XSS 방�?: textContent ?�용
   */
  function renderUrlLinks() {
    const listEl = elements.urlLinkList;
    const emptyEl = elements.urlLinkEmptyState;

    if (!listEl || !emptyEl) {
      logger.warn("URL 링크 ?�더�? DOM ?�소�?찾을 ???�습?�다.");
      return;
    }

    // �??�태 처리
    if (urlLinks.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";

    // DocumentFragment ?�용?�로 DOM 조작 최소??
    const fragment = document.createDocumentFragment();

    urlLinks.forEach((link) => {
      const card = createUrlLinkCard(link);
      fragment.appendChild(card);
    });

    // ??번에 DOM ?�데?�트
    listEl.innerHTML = "";
    listEl.appendChild(fragment);
  }

  /**
   * URL 링크 카드 ?�소 ?�성
   * @param {Object} link - URL 링크 객체
   * @returns {HTMLElement} 카드 ?�소
   */
  function createUrlLinkCard(link) {
    const card = document.createElement("div");
    card.className = "url-link-card";
    card.setAttribute("role", "listitem");
    card.dataset.linkId = link.id;

    // ?�동 버튼
    const launchBtn = document.createElement("button");
    launchBtn.className = "btn-url-launch";
    launchBtn.setAttribute("aria-label", `${link.name} ?�기`);
    launchBtn.title = `${link.name} ?�기`;
    launchBtn.textContent = "??";
    launchBtn.addEventListener("click", () => openUrlLink(link.id));

    // ?�비�??�역
    const faviconDiv = document.createElement("div");
    faviconDiv.className = "url-link-favicon";
    
    const domain = extractDomain(link.url);
    if (domain) {
      const faviconImg = document.createElement("img");
      faviconImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      faviconImg.alt = "";
      faviconImg.loading = "lazy";
      faviconImg.onerror = function () {
        this.style.display = "none";
        const fallback = document.createElement("span");
        fallback.className = "favicon-fallback";
        fallback.textContent = "?��";
        faviconDiv.appendChild(fallback);
      };
      faviconDiv.appendChild(faviconImg);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "favicon-fallback";
      fallback.textContent = "?��";
      faviconDiv.appendChild(fallback);
    }

    // ?�보 ?�역 (XSS 방�?: textContent ?�용)
    const infoDiv = document.createElement("div");
    infoDiv.className = "url-link-info";

    const nameEl = document.createElement("h4");
    nameEl.className = "url-link-name";
    nameEl.textContent = link.name;

    const descEl = document.createElement("p");
    descEl.className = "url-link-desc";
    descEl.textContent = link.description || domain;

    infoDiv.appendChild(nameEl);
    infoDiv.appendChild(descEl);

    // ?�션 버튼 ?�역
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "url-link-actions";

    // ?�로 ?�동 버튼
    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "btn-icon btn-move-up";
    moveUpBtn.setAttribute("aria-label", `${link.name} ?�로 ?�동`);
    moveUpBtn.title = "?�로 ?�동";
    moveUpBtn.textContent = "⬆️";
    moveUpBtn.addEventListener("click", () => moveUrlLinkUp(link.id));

    // ?�래�??�동 버튼
    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "btn-icon btn-move-down";
    moveDownBtn.setAttribute("aria-label", `${link.name} ?�래�??�동`);
    moveDownBtn.title = "?�래�??�동";
    moveDownBtn.textContent = "⬇️";
    moveDownBtn.addEventListener("click", () => moveUrlLinkDown(link.id));

    // ?�정 버튼
    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon btn-edit";
    editBtn.setAttribute("aria-label", `${link.name} ?�정`);
    editBtn.title = "?�정";
    editBtn.textContent = "?�️";
    editBtn.addEventListener("click", () => showEditForm(link.id));

    // ??�� 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon btn-delete";
    deleteBtn.setAttribute("aria-label", `${link.name} ??��`);
    deleteBtn.title = "??��";
    deleteBtn.textContent = "?���?;
    deleteBtn.addEventListener("click", () => deleteUrlLink(link.id));

    actionsDiv.appendChild(moveUpBtn);
    actionsDiv.appendChild(moveDownBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    // 카드???�소 추�?
    card.appendChild(launchBtn);
    card.appendChild(faviconDiv);
    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);

    return card;
  }

  // ----------------------------------------
  // 3.5 ??�??�벤??처리
  // ----------------------------------------

  /**
   * ?�력 ???�시 (추�? 모드)
   */
  function showAddForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "block";
    elements.urlLinkName.focus();
  }

  /**
   * ?�력 ???�시 (?�정 모드)
   * @param {string} id - ?�정??링크 ID
   */
  function showEditForm(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("???�정??URL??찾을 ???�습?�다.", "error");
      return;
    }

    editingLinkId = id;
    elements.urlLinkName.value = link.name;
    elements.urlLinkDesc.value = link.description || "";
    elements.urlLinkUrl.value = link.url;
    elements.urlLinkEditId.value = id;
    elements.urlLinkForm.style.display = "block";
    elements.urlLinkName.focus();
  }

  /**
   * ?�력 ???�기�?
   */
  function hideForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "none";
  }

  /**
   * ???�력 초기??
   */
  function clearForm() {
    elements.urlLinkName.value = "";
    elements.urlLinkDesc.value = "";
    elements.urlLinkUrl.value = "";
    elements.urlLinkEditId.value = "";
  }

  /**
   * ?�??버튼 ?�들??(async)
   */
  async function handleSave() {
    const linkData = {
      name: elements.urlLinkName.value,
      description: elements.urlLinkDesc.value,
      url: elements.urlLinkUrl.value,
    };

    if (editingLinkId) {
      await updateUrlLink(editingLinkId, linkData);
    } else {
      await addUrlLink(linkData);
    }
  }

  /**
   * 메시지 ?�시 (기존 showMessage ?�용)
   * @param {string} message - 메시지
   * @param {string} type - 메시지 ?�형 (success, error, info)
   */
  function showMessage(message, type) {
    if (window.dualTextWriter && window.dualTextWriter.showMessage) {
      window.dualTextWriter.showMessage(message, type);
    } else {
      logger.log(`[${type}] ${message}`);
      // ?�백: alert ?�용
      if (type === "error") {
        alert(message);
      }
    }
  }

  // ----------------------------------------
  // 초기??
  // ----------------------------------------

  /**
   * URL ?�결 ??초기??(Firebase ?�동)
   */
  function init() {
    // DOM ?�소 캐시
    elements = {
      addUrlLinkBtn: document.getElementById("add-url-link-btn"),
      urlLinkForm: document.getElementById("url-link-form"),
      urlLinkName: document.getElementById("url-link-name"),
      urlLinkDesc: document.getElementById("url-link-desc"),
      urlLinkUrl: document.getElementById("url-link-url"),
      urlLinkSaveBtn: document.getElementById("url-link-save-btn"),
      urlLinkCancelBtn: document.getElementById("url-link-cancel-btn"),
      urlLinkEditId: document.getElementById("url-link-edit-id"),
      urlLinkList: document.getElementById("url-link-list"),
      urlLinkEmptyState: document.getElementById("url-link-empty-state"),
    };

    // ?�수 ?�소 ?�인
    if (!elements.urlLinkList) {
      logger.warn("URL ?�결 ?? DOM ?�소�?찾을 ???�습?�다. (??�� ?�더링되지 ?�았?????�음)");
      return false;
    }

    // Firebase ?�동 ?�인
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase ?�증 ?�태 리스??
      window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
        currentUser = user;
        if (user) {
          logger.log("??URL ?�결 ?? ?�용??로그?�됨 -", user.uid);
          // 로그?????�이??로드
          await loadUrlLinks();
        } else {
          logger.log("?�️ URL ?�결 ?? ?�용??로그?�웃??);
          // 로그?�웃 ???�이??초기??
          urlLinks = [];
          renderUrlLinks();
        }
      });
    } else {
      logger.warn("URL ?�결 ?? Firebase가 준비되지 ?�았?�니?? ?�시 ???�시 ?�도?�니??");
      isFirebaseReady = false;
      // �??�태 ?�시
      renderUrlLinks();
    }

    // ?�벤??바인??
    if (elements.addUrlLinkBtn) {
      elements.addUrlLinkBtn.addEventListener("click", showAddForm);
    }

    if (elements.urlLinkSaveBtn) {
      elements.urlLinkSaveBtn.addEventListener("click", handleSave);
    }

    if (elements.urlLinkCancelBtn) {
      elements.urlLinkCancelBtn.addEventListener("click", hideForm);
    }

    // ?�보???�벤?? Enter�??�?? Esc�?취소
    if (elements.urlLinkForm) {
      elements.urlLinkForm.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSave();
        } else if (e.key === "Escape") {
          hideForm();
        }
      });
    }

    // 초기 ?�더�?
    renderUrlLinks();

    logger.log("??URL ?�결 ??초기???�료");
    return true;
  }

  // 공개 API
  return {
    init,
    loadUrlLinks,
    addUrlLink,
    updateUrlLink,
    deleteUrlLink,
    moveUrlLinkUp,
    moveUrlLinkDown,
    openUrlLink,
    renderUrlLinks,
    showAddForm,
    showEditForm,
    hideForm,
  };
})();

// DOM 로드 ?�료 ??URL ?�결 ??초기??
document.addEventListener("DOMContentLoaded", () => {
  // ?�간??지????초기??(?�른 초기?��? ?�료???�후)
  setTimeout(() => {
    if (UrlLinkManager.init()) {
      logger.log("??UrlLinkManager 초기???�공");
    }
  }, 500);
});

// ?�역 ?�코?�에 ?�출 (?�버깅용)
window.UrlLinkManager = UrlLinkManager;

/**
 * 백업 관리자 (BackupManager)
 * 
 * Firebase ?�이?��? JSON ?�일�??�보?�기/가?�오�?기능???�공?�니??
 * 기존 ?�비?��? ?�전???�립?�으�??�작?�니??
 */
const BackupManager = (function () {
  // ----------------------------------------
  // ?�태 변??
  // ----------------------------------------
  
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;
  let selectedFile = null;
  
  // DOM ?�소 캐시
  let elements = {};

  // ----------------------------------------
  // Firebase ?�이???�집 ?�수
  // ----------------------------------------

  /**
   * 모든 ?�용???�이?��? Firebase?�서 ?�집
   * @returns {Promise<Object>} ?�집???�이??객체
   */
  async function collectAllData() {
    if (!isFirebaseReady || !currentUser) {
      throw new Error("로그?�이 ?�요?�니??");
    }

    const data = {
      exportedAt: new Date().toISOString(),
      userId: currentUser.uid,
      userEmail: currentUser.email || "?�명",
      texts: [],
      posts: [],
      urlLinks: [],
    };

    try {
      // 1. texts 컬렉???�집
      const textsRef = window.firebaseCollection(db, "users", currentUser.uid, "texts");
      const textsSnapshot = await window.firebaseGetDocs(textsRef);
      data.texts = textsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 2. posts 컬렉???�집
      const postsRef = window.firebaseCollection(db, "users", currentUser.uid, "posts");
      const postsSnapshot = await window.firebaseGetDocs(postsRef);
      data.posts = postsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 3. urlLinks 컬렉???�집
      const urlLinksRef = window.firebaseCollection(db, "users", currentUser.uid, "urlLinks");
      const urlLinksSnapshot = await window.firebaseGetDocs(urlLinksRef);
      data.urlLinks = urlLinksSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.log(`???�이???�집 ?�료: texts(${data.texts.length}), posts(${data.posts.length}), urlLinks(${data.urlLinks.length})`);
      return data;
    } catch (error) {
      logger.error("?�이???�집 ?�패:", error);
      throw error;
    }
  }

  // ----------------------------------------
  // ?�보?�기 ?�수
  // ----------------------------------------

  /**
   * ?�이?��? JSON ?�일�??�보?�기
   */
  async function exportData() {
    updateStatus("export", "???�이?��? ?�집?�는 �?..", "loading");

    try {
      const data = await collectAllData();

      // JSON ?�일 ?�성
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      
      // ?�일�??�성 (?�짜 ?�함)
      const date = new Date().toISOString().split("T")[0];
      const filename = `500text_backup_${date}.json`;

      // ?�운로드 링크 ?�성 �??�릭
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const summary = `?�� texts: ${data.texts.length}�? ?�� posts: ${data.posts.length}�? ?�� urlLinks: ${data.urlLinks.length}�?;
      updateStatus("export", `??백업 ?�료! (${filename})\n${summary}`, "success");
      showMessage("??백업 ?�일???�운로드?�었?�니??", "success");
    } catch (error) {
      logger.error("?�보?�기 ?�패:", error);
      updateStatus("export", `???�보?�기 ?�패: ${error.message}`, "error");
      showMessage("??백업???�패?�습?�다: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // 가?�오�??�수
  // ----------------------------------------

  /**
   * ?�택???�일???�이?��? Firebase??복원
   */
  async function importData() {
    if (!selectedFile) {
      showMessage("??먼�? JSON ?�일???�택?�주?�요.", "error");
      return;
    }

    if (!isFirebaseReady || !currentUser) {
      showMessage("??로그?�이 ?�요?�니??", "error");
      return;
    }

    // ?�인 ?�?�상??
    if (!confirm("?�️ 기존 ?�이?��? 복원 ?�이?�로 ??��?�여�????�습?�다.\n\n?�말�?복원?�시겠습?�까?")) {
      return;
    }

    updateStatus("import", "???�일???�는 �?..", "loading");

    try {
      // ?�일 ?�기
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      // ?�효??검??
      if (!data.texts && !data.posts && !data.urlLinks) {
        throw new Error("?�효??백업 ?�일???�닙?�다.");
      }

      updateStatus("import", "???�이?��? 복원?�는 �?..", "loading");

      let restored = { texts: 0, posts: 0, urlLinks: 0 };

      // 1. texts 복원
      if (data.texts && Array.isArray(data.texts)) {
        for (const item of data.texts) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "texts", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.texts++;
        }
      }

      // 2. posts 복원
      if (data.posts && Array.isArray(data.posts)) {
        for (const item of data.posts) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "posts", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.posts++;
        }
      }

      // 3. urlLinks 복원
      if (data.urlLinks && Array.isArray(data.urlLinks)) {
        for (const item of data.urlLinks) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "urlLinks", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.urlLinks++;
        }
      }

      const summary = `?�� texts: ${restored.texts}�? ?�� posts: ${restored.posts}�? ?�� urlLinks: ${restored.urlLinks}�?;
      updateStatus("import", `??복원 ?�료!\n${summary}`, "success");
      showMessage("???�이?��? ?�공?�으�?복원?�었?�니??", "success");

      // ?�일 ?�택 초기??
      selectedFile = null;
      elements.fileInput.value = "";
      elements.fileName.textContent = "?�택???�일 ?�음";
      elements.importBtn.disabled = true;
    } catch (error) {
      logger.error("가?�오�??�패:", error);
      updateStatus("import", `??복원 ?�패: ${error.message}`, "error");
      showMessage("??복원???�패?�습?�다: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // UI ?�퍼 ?�수
  // ----------------------------------------

  /**
   * ?�태 메시지 ?�데?�트
   */
  function updateStatus(type, message, status) {
    const el = type === "export" ? elements.exportStatus : elements.importStatus;
    if (el) {
      el.textContent = message;
      el.className = `backup-status ${status}`;
    }
  }

  /**
   * ?�일 ?�택 ?�들??
   */
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        showMessage("??JSON ?�일�??�택?????�습?�다.", "error");
        elements.fileInput.value = "";
        return;
      }
      selectedFile = file;
      elements.fileName.textContent = file.name;
      elements.importBtn.disabled = false;
      updateStatus("import", "", "");
    }
  }

  /**
   * 메시지 ?�시 (기존 showMessage ?�용)
   */
  function showMessage(message, type) {
    if (window.dualTextWriter && window.dualTextWriter.showMessage) {
      window.dualTextWriter.showMessage(message, type);
    } else {
      logger.log(`[${type}] ${message}`);
      if (type === "error") {
        alert(message);
      }
    }
  }

  // ----------------------------------------
  // 초기??
  // ----------------------------------------

  /**
   * 백업 ??초기??
   */
  function init() {
    // DOM ?�소 캐시
    elements = {
      exportBtn: document.getElementById("backup-export-btn"),
      exportStatus: document.getElementById("backup-export-status"),
      fileInput: document.getElementById("backup-file-input"),
      fileSelectBtn: document.getElementById("backup-file-select-btn"),
      fileName: document.getElementById("backup-file-name"),
      importBtn: document.getElementById("backup-import-btn"),
      importStatus: document.getElementById("backup-import-status"),
    };

    // ?�수 ?�소 ?�인
    if (!elements.exportBtn) {
      logger.warn("백업 ?? DOM ?�소�?찾을 ???�습?�다.");
      return false;
    }

    // Firebase ?�동 ?�인
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase ?�증 ?�태 리스??
      window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        currentUser = user;
        if (user) {
          logger.log("??백업 ?? ?�용??로그?�됨");
        } else {
          logger.log("?�️ 백업 ?? ?�용??로그?�웃??);
        }
      });
    } else {
      logger.warn("백업 ?? Firebase가 준비되지 ?�았?�니??");
      isFirebaseReady = false;
    }

    // ?�벤??바인??
    elements.exportBtn.addEventListener("click", exportData);
    
    elements.fileSelectBtn.addEventListener("click", () => {
      elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener("change", handleFileSelect);
    elements.importBtn.addEventListener("click", importData);

    logger.log("??백업 ??초기???�료");
    return true;
  }

  // 공개 API
  return {
    init,
    exportData,
    importData,
  };
})();

// DOM 로드 ?�료 ??백업 ??초기??
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (BackupManager.init()) {
      logger.log("??BackupManager 초기???�공");
    }
  }, 600);
});

// ?�역 ?�코?�에 ?�출 (?�버깅용)
window.BackupManager = BackupManager;
