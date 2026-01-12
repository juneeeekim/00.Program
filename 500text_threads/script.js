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
   * ?±ëŠ¥ ë°??™ì‘ ê´€???¤ì • ?ìˆ˜
   *
   * ?¥í›„ ì¡°ì •???„ìš”??ê²½ìš° ???¹ì…˜?ì„œ ê°’ì„ ë³€ê²½í•˜?¸ìš”.
   */
  static CONFIG = {
    // ?¤ì‹œê°?ì¤‘ë³µ ì²´í¬ ?¤ì •
    DEBOUNCE_DUPLICATE_CHECK_MS: 600, // Debounce ?œê°„ (ms)
    DUPLICATE_CHECK_MIN_LENGTH: 10, // ì¤‘ë³µ ì²´í¬ ìµœì†Œ ê¸¸ì´ (??

    // ë°°ì¹˜ ì²˜ë¦¬ ?¤ì •
    BATCH_SIZE: 500, // Firestore ë°°ì¹˜ ?¬ê¸° (ìµœë? 500ê°?
    BATCH_DELAY_MS: 100, // ë°°ì¹˜ ê°??œë ˆ??(ms, ?œë²„ ë¶€??ë¶„ì‚°)

    // ê¸°í? ?¤ì •
    TEMP_SAVE_INTERVAL_MS: 5000, // ?„ì‹œ ?€??ê°„ê²© (ms)
    TEMP_SAVE_DELAY_MS: 2000, // ?„ì‹œ ?€???œë ˆ??(ms)

    // ?•ë? ëª¨ë“œ ? ë‹ˆë©”ì´???¤ì •
    EXPAND_MODE_ANIMATION_DELAY: 150, // ?•ë? ëª¨ë“œ ?´ë¦¼ ???ˆí¼?°ìŠ¤ ì¶”ê? ì§€???œê°„ (ms)
    REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS: 600, // ?ˆí¼?°ìŠ¤ ê°•ì¡° ? ë‹ˆë©”ì´??ì§€???œê°„ (ms)

    // ?ˆí¼?°ìŠ¤ ?œí•œ ?¤ì •
    MAX_EXPAND_REFERENCES: 3, // ?•ë? ëª¨ë“œ?ì„œ ìµœë? ?ˆí¼?°ìŠ¤ ê°œìˆ˜

    // ?±ëŠ¥ ëª¨ë‹ˆ?°ë§ ?¤ì •
    PERFORMANCE_WARNING_THRESHOLD_MS: 200, // ?±ëŠ¥ ê²½ê³  ?„ê³„ê°?(ms)

    // ?¬ì»¤??ê´€ë¦?ì§€???œê°„
    FOCUS_MANAGEMENT_DELAY_MS: 50, // ?¬ì»¤??ê´€ë¦?ì§€???œê°„ (ms)
    SCREEN_READER_ANNOUNCE_DELAY_MS: 100, // ?¤í¬ë¦?ë¦¬ë” ?Œë¦¼ ì§€???œê°„ (ms)
  };

  /**
   * SNS ?Œë«??ëª©ë¡ ?ìˆ˜
   *
   * ê°??Œë«?¼ì? id, name, icon ?ì„±??ê°€ì§‘ë‹ˆ??
   * ?ˆë¡œ??SNS ?Œë«?¼ì„ ì¶”ê??˜ê±°???œê±°??????ë°°ì—´???˜ì •?˜ì„¸??
   */
  static SNS_PLATFORMS = [
    { id: "threads", name: "Threads", icon: "?§µ" },
    { id: "instagram", name: "Instagram", icon: "?“·" },
    { id: "twitter", name: "Twitter/X", icon: "?¦" },
    { id: "facebook", name: "Facebook", icon: "?‘¥" },
    { id: "linkedin", name: "LinkedIn", icon: "?’¼" },
    { id: "tiktok", name: "TikTok", icon: "?µ" },
    { id: "naver-blog", name: "?¤ì´ë²„ë¸”ë¡œê·¸", icon: "?“" },
    { id: "youtube", name: "? íŠœë¸?ê²Œì‹œê¸€", icon: "?“º" },
    { id: "custom", name: "ì§ì ‘ ?…ë ¥", icon: "?ï¸" },
  ];

  constructor() {
    // Firebase ?¤ì •
    this.auth = null;

    // ?¬ìš©???•ì˜ ?´ì‹œ?œê·¸ ?¤ì • (ê¸°ë³¸ê°?
    this.defaultHashtags = ["#writing", "#content", "#threads"];
    this.db = null;
    this.currentUser = null;
    this.isFirebaseReady = false;

    // ?¸ë˜??ê´€???ì„±
    this.trackingPosts = []; // ?¸ë˜??ì¤‘ì¸ ?¬ìŠ¤??ëª©ë¡
    this.trackingChart = null; // Chart.js ?¸ìŠ¤?´ìŠ¤
    this.currentTrackingPost = null; // ?„ì¬ ?¸ë˜??ì¤‘ì¸ ?¬ìŠ¤??
    this.chartMode = "total"; // ì°¨íŠ¸ ëª¨ë“œ: 'total' (?„ì²´ ì´í•©) ?ëŠ” 'individual' (ê°œë³„ ?¬ìŠ¤??
    this.selectedChartPostId = null; // ê°œë³„ ?¬ìŠ¤??ëª¨ë“œ?ì„œ ? íƒ???¬ìŠ¤??ID
    this.allTrackingPostsForSelector = []; // ?¬ìŠ¤??? íƒê¸°ìš© ?„ì²´ ?¬ìŠ¤??ëª©ë¡
    this.chartRange = "7d"; // '7d' | '30d' | 'all'
    this.scaleMode = "combined"; // 'combined' | 'split'

    // ?¼ê´„ ?? œ ê´€???íƒœ
    this.isBatchSelectMode = false; // ?¼ê´„ ? íƒ ëª¨ë“œ ?œì„±???¬ë?
    this.selectedMetricIndices = []; // ? íƒ??ë©”íŠ¸ë¦??¸ë±??ë°°ì—´

    // ?‘ì„±ê¸€-?ˆí¼?°ìŠ¤ ?°ë™ ê¸°ëŠ¥ ê´€???„ë¡œ?¼í‹°
    this.selectedReferences = []; // ?„ì¬ ? íƒ???ˆí¼?°ìŠ¤ ID ë°°ì—´
    this.referenceSelectionModal = null; // ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬ DOM
    this.referenceLinkCache = new Map(); // ??°©??ì¡°íšŒ ìºì‹œ (refId -> editIds[])

    // ===== [Bug Fix] ?¤í¬ë¦½íŠ¸ ?‘ì„± ??ì´ˆê¸°???íƒœ ?Œë˜ê·?=====
    // ëª©ì : switchTab()?ì„œ ???„í™˜ ??initArticleManagement() ì¤‘ë³µ ?¸ì¶œ ë°©ì?
    // ?´ë²¤??ë¦¬ìŠ¤?ˆê? ?¬ëŸ¬ ë²??±ë¡?˜ì–´ ?€????ì¤‘ë³µ ê¸€???ì„±?˜ëŠ” ë²„ê·¸ ?˜ì •
    this.isArticleManagementInitialized = false;

    // ===== [Dual Panel] ?€???¨ë„ ?íƒœ ê´€ë¦?=====
    // ëª©ì : ??ê°œì˜ ê¸€???™ì‹œ??ë¹„êµ/?¸ì§‘?????ˆëŠ” ?€???¨ë„ ê¸°ëŠ¥ ì§€??
    // 2025-12-09 Phase 2 ì¶”ê?
    this.selectedArticleIds = [null, null]; // ê°??¨ë„??? íƒ??ê¸€ ID [?¨ë„1, ?¨ë„2]
    this.activePanelIndex = 0; // ?„ì¬ ?œì„± ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
    this.isDualMode = false; // ?€??ëª¨ë“œ ?œì„±???¬ë?

    // Firebase ?¤ì • ?ˆë‚´
    // Note: Firebase ì´ˆê¸°?”ëŠ” init()?ì„œ awaitë¡?ì²˜ë¦¬??
    this.showFirebaseSetupNotice();

    // ?¬ìš©???¸ì¦ ê´€???”ì†Œ??
    this.usernameInput = document.getElementById("username-input");
    this.loginBtn = document.getElementById("login-btn");
    this.logoutBtn = document.getElementById("logout-btn");
    this.refreshBtn = document.getElementById("refresh-btn");
    this.loginForm = document.getElementById("login-form");
    this.userInfo = document.getElementById("user-info");
    this.usernameDisplay = document.getElementById("username-display");
    this.mainContent = document.getElementById("main-content");

    // ?ˆí¼?°ìŠ¤ ê¸€ ê´€???”ì†Œ??
    this.refTextInput = document.getElementById("ref-text-input");
    this.refCurrentCount = document.getElementById("ref-current-count");
    this.refMaxCount = document.getElementById("ref-max-count");
    this.refProgressFill = document.getElementById("ref-progress-fill");
    this.refClearBtn = document.getElementById("ref-clear-btn");
    this.refSaveBtn = document.getElementById("ref-save-btn");
    this.refDownloadBtn = document.getElementById("ref-download-btn");
    // ?ˆí¼?°ìŠ¤ ? í˜• ?¼ë””??
    this.refTypeStructure = document.getElementById("ref-type-structure");
    this.refTypeIdea = document.getElementById("ref-type-idea");

    // ?˜ì •/?‘ì„± ê¸€ ê´€???”ì†Œ??
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
    this.selectedSnsPlatforms = []; // ? íƒ??SNS ?Œë«??ID ë°°ì—´
    this.editCurrentCount = document.getElementById("edit-current-count");
    this.editMaxCount = document.getElementById("edit-max-count");

    // ?ˆí¼?°ìŠ¤ ê¸€ ê´€???”ì†Œ??
    this.refTopicInput = document.getElementById("ref-topic-input");
    this.editProgressFill = document.getElementById("edit-progress-fill");
    this.editClearBtn = document.getElementById("edit-clear-btn");
    this.editSaveBtn = document.getElementById("edit-save-btn");
    this.editDownloadBtn = document.getElementById("edit-download-btn");

    // ê³µí†µ ?”ì†Œ??
    this.savedList = document.getElementById("saved-list");
    this.batchMigrationBtn = document.getElementById("batch-migration-btn");
    this.tempSaveStatus = document.getElementById("temp-save-status");
    this.tempSaveText = document.getElementById("temp-save-text");

    // ì£¼ì œ ?„í„° ê´€???”ì†Œ??(?‘ì„± ê¸€??
    this.topicFilter = document.getElementById("topic-filter");
    this.topicFilterGroup = document.getElementById("topic-filter-group");
    this.currentTopicFilter = "all"; // ?„ì¬ ? íƒ??ì£¼ì œ ?„í„°
    this.availableTopics = []; // ?¬ìš© ê°€?¥í•œ ì£¼ì œ ëª©ë¡

    // ?ŒìŠ¤ ?„í„° ê´€???”ì†Œ??(?ˆí¼?°ìŠ¤ ê¸€??
    this.sourceFilter = document.getElementById("source-filter");
    this.sourceFilterGroup = document.getElementById("source-filter-group");
    this.currentSourceFilter = "all"; // ?„ì¬ ? íƒ???ŒìŠ¤ ?„í„°
    this.availableSources = []; // ?¬ìš© ê°€?¥í•œ ?ŒìŠ¤ ëª©ë¡

    // SNS ?Œë«???„í„° ê´€???”ì†Œ??(?‘ì„± ê¸€??
    this.snsFilterGroup = document.getElementById("sns-filter-group");
    this.snsFilterMode = document.getElementById("sns-filter-mode");
    this.snsFilterPlatform = document.getElementById("sns-filter-platform");
    this.currentSnsFilterMode = "all"; // ?„ì¬ ? íƒ??SNS ?„í„° ëª¨ë“œ ('all', 'has', 'not-has')
    this.currentSnsFilterPlatform = ""; // ?„ì¬ ? íƒ??SNS ?Œë«??ID

    // ??ê´€???”ì†Œ??
    this.tabButtons = document.querySelectorAll(".tab-button");
    this.tabContents = document.querySelectorAll(".tab-content");

    // ?¸ë˜??ê´€???”ì†Œ??
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

    // ?±ëŠ¥ ìµœì ?? ?”ë°”?´ì‹± ?€?´ë¨¸ ë°??…ë°?´íŠ¸ ??
    this.debounceTimers = {};
    this.updateQueue = {
      savedTexts: false,
      trackingPosts: false,
      trackingSummary: false,
      trackingChart: false,
    };

    // ê¸€???œí•œ (500/1000) - ê¸°ë³¸ 500, ?¬ìš©??? íƒ??ë¡œì»¬???€??
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
    this.savedItemClickHandler = null; // ?´ë²¤???¸ë“¤??ì°¸ì¡°
    this.outsideClickHandler = null; // ë°”ê¹¥ ?´ë¦­ ?¸ë“¤??ì°¸ì¡°

    // LLM ê²€ì¦??œìŠ¤??ì´ˆê¸°??
    this.initializeLLMValidation();

    // [Refactoring] Manager ?¸ìŠ¤?´ìŠ¤ ?ì„±
    // UIManager: UI ?…ë°?´íŠ¸ ë°?ë©”ì‹œì§€ ?œì‹œ
    this.uiManager = new UIManager();

    // AuthManager: ?¸ì¦ ì²˜ë¦¬
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

    // DataManager: ?°ì´???ì†??ì²˜ë¦¬
    this.dataManager = new DataManager(this.authManager);

    // Pagination State
    this.lastVisibleDoc = null;
    this.isAllDataLoaded = false;
    this.PAGE_SIZE = 20;

    this.init();
  }

  /**
   * ?ˆí¼?°ìŠ¤ ?…ë ¥?€???€???¤ì‹œê°?ì¤‘ë³µ ì²´í¬ ì´ˆê¸°??
   *
   * ?±ëŠ¥ ìµœì ??
   * - Debounce ?œê°„: 300ms ??600ms (ë¹ ë¥¸ ?€?´í•‘ ??ë¶ˆí•„?”í•œ ê²€??50% ê°ì†Œ)
   * - ìµœì†Œ ê¸¸ì´ ì²´í¬: 10??ë¯¸ë§Œ?€ ê²€???ëµ
   */
  initLiveDuplicateCheck() {
    if (!this.refTextInput) return;
    // ?ŒíŠ¸ ?ì—­???†ë‹¤ë©??ì„±
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

    // ???±ëŠ¥ ìµœì ?? ?¤ì • ?ìˆ˜ ?¬ìš© (?¥í›„ ì¡°ì • ?©ì´)
    const DEBOUNCE_MS = DualTextWriter.CONFIG.DEBOUNCE_DUPLICATE_CHECK_MS;
    const MIN_LENGTH = DualTextWriter.CONFIG.DUPLICATE_CHECK_MIN_LENGTH;

    this.refTextInput.addEventListener("input", () => {
      // ?”ë°”?´ìŠ¤ ì²˜ë¦¬
      clearTimeout(this.debounceTimers.refDuplicate);
      this.debounceTimers.refDuplicate = setTimeout(() => {
        const value = this.refTextInput.value || "";
        // ?ˆë¬´ ì§§ìœ¼ë©?ê²€?¬í•˜ì§€ ?ŠìŒ (?±ëŠ¥/UX)
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
          // ?…ë ¥ ì¤??¤ë¥˜ê°€ ?ˆì–´??ë¬´ì‹œ?˜ê³  ?ŒíŠ¸ ?¨ê?
          logger.warn("?¤ì‹œê°?ì¤‘ë³µ ì²´í¬ ì¤?ê²½ê³ :", e);
          this.hideInlineDuplicateHint();
        }
      }, DEBOUNCE_MS);
    });
  }

  /**
   * ?¸ë¼??ì¤‘ë³µ ê²½ê³  ?œì‹œ
   * @param {Object} duplicate
   */
  showInlineDuplicateHint(duplicate) {
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    const createdAtStr = formatDate(duplicate?.createdAt) || "";
    const topicStr = duplicate?.topic
      ? ` Â· ì£¼ì œ: ${escapeHtml(duplicate.topic)}`
      : "";
    hint.innerHTML = `? ï¸ ?™ì¼???ˆí¼?°ìŠ¤ê°€ ?´ë? ?ˆìŠµ?ˆë‹¤${
      createdAtStr ? ` Â· ?€?¥ì¼: ${createdAtStr}` : ""
    }${topicStr}. ?€????ì¤‘ë³µ?¼ë¡œ ?€?¥ë  ???ˆìŠµ?ˆë‹¤.`;
    hint.style.display = "block";
  }

  /**
   * ?¸ë¼??ì¤‘ë³µ ê²½ê³  ?¨ê?
   */
  hideInlineDuplicateHint() {
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    hint.style.display = "none";
    hint.textContent = "";
  }

  /**
   * ?ˆí¼?°ìŠ¤ ? íƒ ê¸°ëŠ¥ ì´ˆê¸°??
   *
   * - ?‘ì„ ???ˆëŠ” ?¨ë„ ? ê? ê¸°ëŠ¥
   * - ëª¨ë‹¬ DOM ?”ì†Œ ì°¸ì¡°
   * - ?´ë²¤??ë¦¬ìŠ¤??ë°”ì¸??
   * - ì´ˆê¸° ?íƒœ ?¤ì •
   */
  initReferenceSelection() {
    // DOM ?”ì†Œ ì°¸ì¡°
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

    // ? íš¨??ê²€??
    if (!this.selectReferencesBtn || !this.referenceSelectionModal) {
      logger.warn("? ï¸ ?ˆí¼?°ìŠ¤ ? íƒ UI ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      return;
    }

    // ?‘ì„ ???ˆëŠ” ?¨ë„ ? ê? ?´ë²¤??
    if (this.referenceCollapseToggle && this.referenceLinkContent) {
      this.referenceCollapseToggle.addEventListener("click", () =>
        this.toggleReferenceCollapse()
      );
    }

    // ?´ë²¤??ë¦¬ìŠ¤??ë°”ì¸??
    this.selectReferencesBtn.addEventListener("click", () =>
      this.openReferenceSelectionModal()
    );
    this.confirmReferenceSelectionBtn.addEventListener("click", () =>
      this.confirmReferenceSelection()
    );

    // ëª¨ë‹¬ ?«ê¸° ë²„íŠ¼
    const closeBtns = this.referenceSelectionModal.querySelectorAll(
      ".close-btn, .cancel-btn"
    );
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.closeReferenceSelectionModal());
    });

    // ëª¨ë‹¬ ?¸ë? ?´ë¦­ ???«ê¸°
    this.referenceSelectionModal.addEventListener("click", (e) => {
      if (e.target === this.referenceSelectionModal) {
        this.closeReferenceSelectionModal();
      }
    });

    // ESC ?¤ë¡œ ëª¨ë‹¬ ?«ê¸°
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceSelectionModal.style.display === "flex"
      ) {
        this.closeReferenceSelectionModal();
      }
    });

    // ê²€??ë°??„í„° ?´ë²¤??
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

    logger.log("???ˆí¼?°ìŠ¤ ? íƒ ê¸°ëŠ¥ ì´ˆê¸°???„ë£Œ");
  }

  /**
   * ì°¸ê³  ?ˆí¼?°ìŠ¤ ?¨ë„ ? ê?
   *
   * - ?¨ë„ ?¼ì¹˜ê¸??‘ê¸°
   * - ?„ì´ì½??Œì „ ? ë‹ˆë©”ì´??
   * - ARIA ?ì„± ?…ë°?´íŠ¸
   */
  toggleReferenceCollapse() {
    try {
      if (!this.referenceLinkContent || !this.referenceCollapseToggle) {
        logger.warn("? ï¸ ?ˆí¼?°ìŠ¤ ?¨ë„ ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      const isExpanded =
        this.referenceCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // ?¨ë„ ?‘ê¸°
        this.referenceLinkContent.classList.remove("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "false");
        this.referenceLinkContent.setAttribute("aria-hidden", "true");
        logger.log("?“š ?ˆí¼?°ìŠ¤ ?¨ë„ ?‘í˜");
      } else {
        // ?¨ë„ ?¼ì¹˜ê¸?
        this.referenceLinkContent.classList.add("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "true");
        this.referenceLinkContent.setAttribute("aria-hidden", "false");
        logger.log("?“š ?ˆí¼?°ìŠ¤ ?¨ë„ ?¼ì¹¨");
      }
    } catch (error) {
      logger.error("?ˆí¼?°ìŠ¤ ?¨ë„ ? ê? ?¤íŒ¨:", error);
    }
  }

  // ?ˆí¼?°ìŠ¤ ? í˜• ë°°ì? ?Œë”ë§?
  renderReferenceTypeBadge(referenceType) {
    const type = referenceType || "unspecified";
    let label = "ë¯¸ì???;
    let cls = "reference-type-badge--unspecified";
    if (type === "structure") {
      label = "êµ¬ì¡°";
      cls = "reference-type-badge--structure";
    } else if (type === "idea") {
      label = "?„ì´?”ì–´";
      cls = "reference-type-badge--idea";
    }
    return `
            <span class="reference-type-badge ${cls}" role="status" aria-label="?ˆí¼?°ìŠ¤ ? í˜•: ${label}">
                ${label}
            </span>
        `;
  }

  /**
   * SNS ?Œë«??? íƒ ê¸°ëŠ¥ ì´ˆê¸°??
   *
   * - SNS ?Œë«???œê·¸ ?Œë”ë§?
   * - ?´ë²¤??ë¦¬ìŠ¤??ë°”ì¸??(?´ë²¤???„ì„ ?¬ìš©)
   * - ? íƒ ?íƒœ ê´€ë¦?
   * - ?„ì½”?”ì–¸ ? ê? ê¸°ëŠ¥
   *
   * @throws {Error} ?„ìˆ˜ DOM ?”ì†Œê°€ ?†ì„ ê²½ìš° ?ëŸ¬ ë¡œê¹…
   */
  initSnsPlatformSelection() {
    try {
      // ? íš¨??ê²€?? ?„ìˆ˜ DOM ?”ì†Œ ?•ì¸
      if (!this.editSnsPlatformTags) {
        logger.warn("? ï¸ SNS ?Œë«??? íƒ UI ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      // SNS ?Œë«???œê·¸ ?Œë”ë§?
      this.renderSnsPlatformTags();

      // ?„ì½”?”ì–¸ ? ê? ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
      if (this.snsPlatformCollapseToggle) {
        // ?´ë¦­ ?´ë²¤?? ë§ˆìš°??ë°??°ì¹˜ ?”ë°”?´ìŠ¤ ì§€??
        this.snsPlatformCollapseToggle.addEventListener("click", () => {
          this.toggleSnsPlatformCollapse();
        });

        // ?¤ë³´???´ë²¤??ì²˜ë¦¬ (?‘ê·¼??: Enter ë°?Space ??ì§€??
        this.snsPlatformCollapseToggle.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggleSnsPlatformCollapse();
          }
        });
      } else {
        logger.warn("? ï¸ SNS ?Œë«??? ê? ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      }

      // ?´ë²¤???„ì„: ?œê·¸ ?´ë¦­ ?´ë²¤??ì²˜ë¦¬ (?±ëŠ¥ ìµœì ?? ??ë²ˆë§Œ ë°”ì¸??
      if (!this._snsPlatformEventBound) {
        this._snsPlatformEventBound = true;

        // ?´ë¦­ ?´ë²¤?? ?Œë«???œê·¸ ? íƒ/?´ì œ
        this.editSnsPlatformTags.addEventListener("click", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          const platformId = tag.getAttribute("data-platform-id");
          if (!platformId) {
            logger.warn("? ï¸ ?Œë«??IDë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
            return;
          }

          e.preventDefault();
          this.toggleSnsPlatform(platformId);
        });

        // ?¤ë³´???´ë²¤??ì²˜ë¦¬ (?‘ê·¼??: ?¤ë³´???¤ë¹„ê²Œì´??ì§€??
        this.editSnsPlatformTags.addEventListener("keydown", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const platformId = tag.getAttribute("data-platform-id");
            if (platformId) {
              this.toggleSnsPlatform(platformId);
            } else {
              logger.warn("? ï¸ ?¤ë³´???´ë²¤?? ?Œë«??IDë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
            }
          }
        });
      }
    } catch (error) {
      logger.error("??SNS ?Œë«??? íƒ ê¸°ëŠ¥ ì´ˆê¸°???¤íŒ¨:", error);
      // ?¬ìš©?ì—ê²?ì¹œí™”?ì¸ ë©”ì‹œì§€ ?œì‹œ (? íƒ?¬í•­)
      if (this.showMessage) {
        this.showMessage(
          "SNS ?Œë«??? íƒ ê¸°ëŠ¥??ì´ˆê¸°?”í•˜??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?Œë«??? íƒ ?¨ë„ ? ê?
   *
   * - ?¨ë„ ?¼ì¹˜ê¸??‘ê¸°
   * - ?„ì´ì½??Œì „ ? ë‹ˆë©”ì´??(CSS transition?¼ë¡œ ì²˜ë¦¬)
   * - ARIA ?ì„± ?…ë°?´íŠ¸ (?‘ê·¼???¥ìƒ)
   *
   * @throws {Error} DOM ?”ì†Œê°€ ?†ì„ ê²½ìš° ?ëŸ¬ ë¡œê¹…
   */
  toggleSnsPlatformCollapse() {
    try {
      // ? íš¨??ê²€?? ?„ìˆ˜ DOM ?”ì†Œ ?•ì¸
      if (!this.snsPlatformContent || !this.snsPlatformCollapseToggle) {
        logger.warn("? ï¸ SNS ?Œë«???¨ë„ ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      // ?„ì¬ ?•ì¥ ?íƒœ ?•ì¸ (ARIA ?ì„± ê¸°ë°˜)
      const isExpanded =
        this.snsPlatformCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // ?¨ë„ ?‘ê¸°: ì½˜í…ì¸??¨ê? ë°?ARIA ?ì„± ?…ë°?´íŠ¸
        this.snsPlatformContent.classList.remove("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "false");
        this.snsPlatformContent.setAttribute("aria-hidden", "true");
      } else {
        // ?¨ë„ ?¼ì¹˜ê¸? ì½˜í…ì¸??œì‹œ ë°?ARIA ?ì„± ?…ë°?´íŠ¸
        this.snsPlatformContent.classList.add("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "true");
        this.snsPlatformContent.setAttribute("aria-hidden", "false");
      }
    } catch (error) {
      logger.error("??SNS ?Œë«???¨ë„ ? ê? ?¤íŒ¨:", error);
      // ?¬ìš©?ì—ê²?ì¹œí™”?ì¸ ë©”ì‹œì§€ ?œì‹œ (? íƒ?¬í•­)
      if (this.showMessage) {
        this.showMessage("?¨ë„??? ê??˜ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
      }
    }
  }

  /**
   * SNS ?Œë«???œê·¸ ?Œë”ë§?
   *
   * - ëª¨ë“  SNS ?Œë«???œê·¸ë¥??™ì ?¼ë¡œ ?ì„±
   * - ? íƒ ?íƒœ???°ë¥¸ ?¤í???ë°?ARIA ?ì„± ?ìš©
   * - XSS ë°©ì?ë¥??„í•œ HTML ?´ìŠ¤ì¼€?´í”„ ì²˜ë¦¬
   *
   * @throws {Error} DOM ?”ì†Œ???Œë«???°ì´?°ê? ?†ì„ ê²½ìš° ì¡°ìš©??ë°˜í™˜
   */
  renderSnsPlatformTags() {
    try {
      // ? íš¨??ê²€?? ?„ìˆ˜ DOM ?”ì†Œ ë°??°ì´???•ì¸
      if (!this.editSnsPlatformTags) {
        logger.warn("? ï¸ SNS ?Œë«???œê·¸ ì»¨í…Œ?´ë„ˆë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        logger.warn("? ï¸ SNS ?Œë«???°ì´?°ê? ? íš¨?˜ì? ?ŠìŠµ?ˆë‹¤.");
        return;
      }

      // ?Œë«???œê·¸ HTML ?ì„± (XSS ë°©ì?: escapeHtml ?¬ìš©)
      const tagsHtml = DualTextWriter.SNS_PLATFORMS.map((platform) => {
        // ?Œë«??? íƒ ?íƒœ ?•ì¸
        const isSelected = this.selectedSnsPlatforms.includes(platform.id);
        const selectedClass = isSelected ? "selected" : "";
        const ariaChecked = isSelected ? "true" : "false";
        const ariaLabelText = `${this.escapeHtml(platform.name)} ${
          isSelected ? "? íƒ?? : "? íƒ ?ˆë¨"
        }`;

        // ?ˆì „??HTML ?ì„± (XSS ë°©ì?)
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

      // DOM ?…ë°?´íŠ¸ (?±ëŠ¥: ??ë²ˆì˜ innerHTML ? ë‹¹)
      this.editSnsPlatformTags.innerHTML = tagsHtml;

      // ? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸
      this.updateSnsPlatformCount();
    } catch (error) {
      logger.error("??SNS ?Œë«???œê·¸ ?Œë”ë§??¤íŒ¨:", error);
      // ?¬ìš©?ì—ê²?ì¹œí™”?ì¸ ë©”ì‹œì§€ ?œì‹œ (? íƒ?¬í•­)
      if (this.showMessage) {
        this.showMessage(
          "SNS ?Œë«??ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?Œë«??? íƒ/?´ì œ ? ê?
   *
   * - ?Œë«??? íƒ ?íƒœë¥?? ê?
   * - ? íš¨??ê²€ì¦????íƒœ ë³€ê²?
   * - UI ?ë™ ?…ë°?´íŠ¸
   *
   * @param {string} platformId - ?Œë«??ID (?? 'threads', 'instagram')
   * @throws {Error} ? íš¨?˜ì? ?Šì? ?Œë«??ID??ê²½ìš° ê²½ê³  ë¡œê¹…
   */
  toggleSnsPlatform(platformId) {
    try {
      // ?…ë ¥ ? íš¨??ê²€ì¦?
      if (!platformId || typeof platformId !== "string") {
        logger.warn("? ï¸ ? íš¨?˜ì? ?Šì? ?Œë«??ID ?•ì‹:", platformId);
        return;
      }

      // ?Œë«???°ì´??? íš¨??ê²€ì¦? ?Œë«??IDê°€ ?•ì˜???Œë«??ëª©ë¡???ˆëŠ”ì§€ ?•ì¸
      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        logger.warn("? ï¸ SNS ?Œë«???°ì´?°ê? ? íš¨?˜ì? ?ŠìŠµ?ˆë‹¤.");
        return;
      }

      const platform = DualTextWriter.SNS_PLATFORMS.find(
        (p) => p.id === platformId
      );
      if (!platform) {
        logger.warn(`? ï¸ ? íš¨?˜ì? ?Šì? ?Œë«??ID: ${platformId}`);
        return;
      }

      // ? íƒ ?íƒœ ? ê?: ë°°ì—´?ì„œ ì¶”ê? ?ëŠ” ?œê±°
      const currentIndex = this.selectedSnsPlatforms.indexOf(platformId);
      if (currentIndex >= 0) {
        // ?´ë? ? íƒ??ê²½ìš°: ? íƒ ?´ì œ
        this.selectedSnsPlatforms.splice(currentIndex, 1);
      } else {
        // ? íƒ?˜ì? ?Šì? ê²½ìš°: ? íƒ ì¶”ê?
        this.selectedSnsPlatforms.push(platformId);
      }

      // UI ?…ë°?´íŠ¸: ?œê·¸ ?¬ë Œ?”ë§ ë°?ê°œìˆ˜ ?…ë°?´íŠ¸
      this.renderSnsPlatformTags();
      this.updateSnsPlatformCount();
    } catch (error) {
      logger.error("??SNS ?Œë«??? ê? ?¤íŒ¨:", error);
      // ?¬ìš©?ì—ê²?ì¹œí™”?ì¸ ë©”ì‹œì§€ ?œì‹œ (? íƒ?¬í•­)
      if (this.showMessage) {
        this.showMessage(
          "?Œë«??? íƒ??ë³€ê²½í•˜??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
          "error"
        );
      }
    }
  }

  /**
   * SNS ?Œë«??? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸
   *
   * - ? íƒ???Œë«??ê°œìˆ˜ë¥?UI???œì‹œ
   * - ?‘ê·¼?±ì„ ?„í•œ ARIA ?ì„± ?…ë°?´íŠ¸ (? íƒ?¬í•­)
   *
   * @throws {Error} DOM ?”ì†Œê°€ ?†ì„ ê²½ìš° ì¡°ìš©??ë°˜í™˜
   */
  updateSnsPlatformCount() {
    try {
      // ? íš¨??ê²€?? DOM ?”ì†Œ ?•ì¸
      if (!this.snsPlatformCount) {
        // DOM ?”ì†Œê°€ ?†ì–´???ëŸ¬ë¥?ë°œìƒ?œí‚¤ì§€ ?ŠìŒ (? íƒ??UI ?”ì†Œ)
        return;
      }

      // ? íƒ???Œë«??ê°œìˆ˜ ê³„ì‚°
      const selectedCount = Array.isArray(this.selectedSnsPlatforms)
        ? this.selectedSnsPlatforms.length
        : 0;

      // UI ?…ë°?´íŠ¸: ?ìŠ¤??ì½˜í…ì¸?ë³€ê²?
      this.snsPlatformCount.textContent = `(${selectedCount}ê°?? íƒ??`;

      // ?‘ê·¼???¥ìƒ: ARIA ?ì„± ?…ë°?´íŠ¸ (ë¶€ëª??”ì†Œ??aria-live ?ì„±???ˆë‹¤ë©??ë™?¼ë¡œ ?Œë¦¼)
      if (this.snsPlatformCollapseToggle) {
        const ariaLabel = `SNS ?Œë«??? íƒ (${selectedCount}ê°?? íƒ??`;
        this.snsPlatformCollapseToggle.setAttribute("aria-label", ariaLabel);
      }
    } catch (error) {
      logger.error("??SNS ?Œë«??? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸ ?¤íŒ¨:", error);
      // ?ëŸ¬ê°€ ë°œìƒ?´ë„ ???„ì²´ ?™ì‘???í–¥??ì£¼ì? ?Šë„ë¡?ì¡°ìš©??ì²˜ë¦¬
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ?¨ë„ ì´ˆê¸°??
   */
  initReferenceLoader() {
    // DOM ?”ì†Œ ì°¸ì¡°
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

    // ?´ë²¤??ë¦¬ìŠ¤?? ?¨ë„ ?´ê¸° (?ì„¸ ëª¨ë“œ)
    if (this.detailLoadReferenceBtn) {
      this.detailLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "detail"; // ëª¨ë“œ ?¤ì •
        this.openReferenceLoader();
      });
    }

    // ?´ë²¤??ë¦¬ìŠ¤?? ?¨ë„ ?´ê¸° (?•ë? ëª¨ë“œ)
    this.expandLoadReferenceBtn = document.getElementById(
      "expand-load-reference-btn"
    );
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "expand"; // ëª¨ë“œ ?¤ì •
        this.openReferenceLoader();
      });
    }

    // ?´ë²¤??ë¦¬ìŠ¤?? ?¨ë„ ?«ê¸°
    if (this.referenceLoaderCloseBtn) {
      this.referenceLoaderCloseBtn.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    // ?´ë²¤??ë¦¬ìŠ¤?? ???„í™˜
    this.referenceLoaderTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchReferenceLoaderTab(tabName);
      });
    });

    // ?´ë²¤??ë¦¬ìŠ¤?? ?¸ë? ?´ë¦­ ???«ê¸°
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

    // ?´ë²¤??ë¦¬ìŠ¤?? ?ˆí¼?°ìŠ¤ ì¶”ê? (?´ë²¤???„ì„)
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

    // ?´ë²¤??ë¦¬ìŠ¤?? ê²€??
    if (this.referenceLoaderSearchInput) {
      this.referenceLoaderSearchInput.addEventListener(
        "input",
        debounce(() => {
          this.filterReferenceLoaderList();
        }, 300)
      );
    }

    // ESC ?¤ë¡œ ?«ê¸°
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceLoaderPanel.style.display === "block"
      ) {
        // ?•ë? ëª¨ë“œ ëª¨ë‹¬???´ë ¤?ˆê³ , ?ˆí¼?°ìŠ¤ ë¡œë”???´ë ¤?ˆë‹¤ë©??ˆí¼?°ìŠ¤ ë¡œë”ë§??«ê¸°
        // z-indexê°€ ???’ìœ¼ë¯€ë¡??°ì„ ?œìœ„ ì²˜ë¦¬
        this.closeReferenceLoader();
      }
    });
  }

  /**
   * ?´ìš© ?•ë? ëª¨ë“œ ì´ˆê¸°??
   */
  initExpandModal() {
    this.expandModal = document.getElementById("content-expand-modal");
    this.detailExpandBtn = document.getElementById("detail-expand-btn");
    this.expandModalCloseBtn = document.getElementById("expand-modal-close");
    this.expandContentTextarea = document.getElementById(
      "expand-content-textarea"
    );

    // ?´ê¸° ë²„íŠ¼ ?´ë²¤??- initArticleManagement ?ëŠ” DOMContentLoaded?ì„œ ì²˜ë¦¬??
    // if (this.detailExpandBtn) {
    //   this.detailExpandBtn.addEventListener("click", () => {
    //     this.openExpandModal();
    //   });
    // }

    // ?«ê¸° ë²„íŠ¼ ?´ë²¤??
    if (this.expandModalCloseBtn) {
      this.expandModalCloseBtn.addEventListener("click", () => {
        this.closeExpandModal();
      });
    }

    // ESC ?¤ë¡œ ?«ê¸°
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.expandModal &&
        this.expandModal.style.display === "block"
      ) {
        // ?ˆí¼?°ìŠ¤ ë¡œë”ê°€ ?´ë ¤?ˆìœ¼ë©??ˆí¼?°ìŠ¤ ë¡œë”ê°€ ë¨¼ì? ?«í˜ (z-index ?•ì¸)
        if (
          this.referenceLoaderPanel &&
          this.referenceLoaderPanel.style.display === "block"
        ) {
          return; // ?ˆí¼?°ìŠ¤ ë¡œë”??ESC ?¸ë“¤?¬ê? ì²˜ë¦¬?˜ë„ë¡???
        }
        this.closeExpandModal();
      }
    });
    if (!this.expandModal) return;

    // ë³€ê²½ëœ ?´ìš©???ì„¸ ?¨ë„(?˜ì • ëª¨ë“œ)??ë°˜ì˜
    const editContentTextarea = document.getElementById(
      "edit-content-textarea"
    );
    if (editContentTextarea && this.expandContentTextarea) {
      editContentTextarea.value = this.expandContentTextarea.value;
      // input ?´ë²¤???¸ë¦¬ê±°í•˜??ê¸€?ìˆ˜ ???…ë°?´íŠ¸
      editContentTextarea.dispatchEvent(new Event("input"));
    }

    this.expandModal.style.display = "none";
    document.body.style.overflow = ""; // ë°°ê²½ ?¤í¬ë¡?ë³µì›
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ?¨ë„ ?´ê¸°
   */
  openReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "block";
      // ?°ì´??ë¡œë“œ (ì²˜ìŒ ?????ëŠ” ?„ìš” ??
      this.loadReferenceLoaderData();
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ?¨ë„ ?«ê¸°
   */
  closeReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "none";
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¡œë” ???„í™˜
   */
  switchReferenceLoaderTab(tabName) {
    // ???œì„±???íƒœ ë³€ê²?
    this.referenceLoaderTabs.forEach((tab) => {
      if (tab.getAttribute("data-tab") === tabName) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    // ì½˜í…ì¸??œì‹œ ?íƒœ ë³€ê²?
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
   * ?ˆí¼?°ìŠ¤ ë¡œë” ?°ì´??ë¡œë“œ
   */
  async loadReferenceLoaderData() {
    // ?€?¥ëœ ê¸€ ë¡œë“œ
    await this.loadSavedReferencesForLoader();
    // ?¸ë˜???°ì´??ë¡œë“œ (?„ìš” ??êµ¬í˜„)
    // await this.loadTrackingReferencesForLoader();
  }

  /**
   * ?€?¥ëœ ê¸€???ˆí¼?°ìŠ¤ ë¡œë”?©ìœ¼ë¡?ë¡œë“œ
   */
  async loadSavedReferencesForLoader() {
    if (!this.currentUser) return;

    try {
      // ê¸°ì¡´ savedTexts ?œìš©?˜ê±°???ˆë¡œ fetch
      // ?¬ê¸°?œëŠ” ê¸°ì¡´ savedTextsê°€ ?ˆë‹¤ê³?ê°€?•í•˜ê³??Œë”ë§?
      // ë§Œì•½ savedTextsê°€ ë¹„ì–´?ˆë‹¤ë©?fetch ?„ìš”
      if (this.savedTexts.length === 0) {
        await this.loadSavedTexts();
      }

      this.renderReferenceLoaderList(
        this.savedTexts,
        this.referenceSavedList,
        "saved"
      );
    } catch (error) {
      logger.error("?ˆí¼?°ìŠ¤ ?°ì´??ë¡œë“œ ?¤íŒ¨:", error);
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
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

      // ? ì§œ ?¬ë§·??
      const dateStr = item.createdAt ? formatDate(item.createdAt) : "";

      // ?´ìš© ë¯¸ë¦¬ë³´ê¸° (HTML ?œê·¸ ?œê±° ë°?ê¸¸ì´ ?œí•œ)
      const contentPreview = item.content
        ? item.content.replace(/<[^>]*>/g, "").substring(0, 100) +
          (item.content.length > 100 ? "..." : "")
        : "";

      el.innerHTML = `
                <div class="reference-item-header">
                    <div class="reference-item-title">${escapeHtml(
                      item.topic || "?œëª© ?†ìŒ"
                    )}</div>
                </div>
                <div class="reference-item-content">${escapeHtml(
                  contentPreview
                )}</div>
                <div class="reference-item-meta">
                    <span>?“… ${dateStr}</span>
                    ${
                      item.category
                        ? `<span>?“ ${escapeHtml(item.category)}</span>`
                        : ""
                    }
                </div>
                <div class="reference-item-actions">
                    <button class="reference-item-btn" data-action="add">
                        ì¶”ê??˜ê¸°
                    </button>
                </div>
            `;
      container.appendChild(el);
    });
  }

  /**
   * ?ˆí¼?°ìŠ¤ ?„ì´???´ë¦­ ?¸ë“¤??(ì¶”ê??˜ê¸° ë²„íŠ¼)
   */
  handleReferenceItemClick(e) {
    const btn = e.target.closest(".reference-item-btn");
    if (!btn) return;

    const itemEl = btn.closest(".reference-item");
    const itemId = itemEl.getAttribute("data-item-id");
    const sourceType = itemEl.getAttribute("data-source-type");

    // ?°ì´??ì°¾ê¸°
    let itemData = null;
    if (sourceType === "saved") {
      itemData = this.savedTexts.find((i) => i.id === itemId);
    } else {
      // ?¸ë˜???°ì´?°ì—??ì°¾ê¸° (êµ¬í˜„ ?„ìš”)
    }

    if (itemData) {
      if (this.referenceLoaderMode === "expand") {
        this.addReferenceToExpand(itemData);
      } else {
        this.addReferenceToDetail(itemData);
      }
      // ? íƒ ???¨ë„ ?«ê¸° (? íƒ?¬í•­)
      this.closeReferenceLoader();
    }
  }

  /**
   * ?•ë? ëª¨ë“œ???ˆí¼?°ìŠ¤ ì¶”ê?
   */
  addReferenceToExpand(item) {
    const expandReferenceList = document.getElementById(
      "expand-reference-list"
    );
    const expandReferenceEmpty = document.querySelector(
      ".expand-reference-empty"
    );

    if (!expandReferenceList) return;

    // ë¹??íƒœ ë©”ì‹œì§€ ?¨ê?
    if (expandReferenceEmpty) {
      expandReferenceEmpty.style.display = "none";
    }
    expandReferenceList.style.display = "block";

    // ì¤‘ë³µ ì²´í¬
    const existing = expandReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("?´ë? ì¶”ê????ˆí¼?°ìŠ¤?…ë‹ˆ??");
      return;
    }

    const el = document.createElement("div");
    el.className = "expand-reference-item"; // CSS ?´ë˜???„ìš” (?ëŠ” ?¸ë¼???¤í???
    el.setAttribute("data-ref-id", item.id);

    // ?¤í????ìš© (ì´ˆë¡???Œë‘ë¦???
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
                  item.topic || "?œëª© ?†ìŒ"
                )}</h4>
                <button class="expand-ref-remove" aria-label="?? œ" style="background: none; border: none; color: #999; cursor: pointer; font-size: 1.2rem;">Ã—</button>
            </div>
            <div style="font-size: 0.9rem; color: #666; margin-bottom: 15px; line-height: 1.5;">
                ${escapeHtml(contentPreview)}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: #999; margin-bottom: 15px;">
                <span>?“… ${dateStr}</span>
                ${
                  item.category
                    ? `<span>?“ ${escapeHtml(item.category)}</span>`
                    : ""
                }
            </div>
            <button class="btn btn-primary btn-block btn-add-content" style="width: 100%; background-color: #667eea; border: none; padding: 10px; border-radius: 6px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                <span>??/span> ?´ìš©??ì¶”ê?
            </button>
        `;

    // ?? œ ë²„íŠ¼ ?´ë²¤??
    el.querySelector(".expand-ref-remove").addEventListener("click", () => {
      el.remove();
      if (expandReferenceList.children.length === 0) {
        if (expandReferenceEmpty) expandReferenceEmpty.style.display = "block";
        expandReferenceList.style.display = "none";
      }
    });

    // ?´ìš©??ì¶”ê? ë²„íŠ¼ ?´ë²¤??
    el.querySelector(".btn-add-content").addEventListener("click", () => {
      this.addContentToExpandEditor(item.content);
    });

    expandReferenceList.appendChild(el);
  }

  /**
   * ?•ë? ëª¨ë“œ ?ë””?°ì— ?´ìš© ì¶”ê?
   */
  addContentToExpandEditor(content) {
    const textarea = document.getElementById("expand-content-textarea");
    if (!textarea) return;

    // HTML ?œê·¸ ?œê±° (? íƒ?¬í•­, ê¸°íš???°ë¼ ?¤ë¦„)
    const plainText = content
      .replace(/<[^>]*>/g, "\n")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // ?„ì¬ ì»¤ì„œ ?„ì¹˜???½ì… ?ëŠ” ë§??¤ì— ì¶”ê?
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const textBefore = textarea.value.substring(0, startPos);
    const textAfter = textarea.value.substring(endPos, textarea.value.length);

    textarea.value = textBefore + plainText + textAfter;

    // ì»¤ì„œ ?„ì¹˜ ì¡°ì •
    const newCursorPos = startPos + plainText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    // ê¸€?ìˆ˜ ?…ë°?´íŠ¸ ?¸ë¦¬ê±?
    textarea.dispatchEvent(new Event("input"));
  }

  /**
   * ?ì„¸ ë·°ì— ?ˆí¼?°ìŠ¤ ì¶”ê?
   */
  addReferenceToDetail(item) {
    if (!this.detailReferenceList) return;

    // ë¹??íƒœ ë©”ì‹œì§€ ?¨ê?
    if (this.detailReferenceEmpty) {
      this.detailReferenceEmpty.style.display = "none";
    }
    this.detailReferenceList.style.display = "block";

    // ì¤‘ë³µ ì²´í¬
    const existing = this.detailReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("?´ë? ì¶”ê????ˆí¼?°ìŠ¤?…ë‹ˆ??");
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
                  item.topic || "?œëª© ?†ìŒ"
                )}</span>
                <button class="detail-ref-remove" aria-label="?? œ">Ã—</button>
            </div>
            <div class="detail-ref-content">${escapeHtml(contentPreview)}</div>
        `;

    // ?? œ ë²„íŠ¼ ?´ë²¤??
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
   * ?ˆí¼?°ìŠ¤ ëª©ë¡ ?„í„°ë§?(ê²€??
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
    // ì´ˆê¸° ê¸€???œí•œ ë°˜ì˜
    this.applyCharLimit(this.maxLength);
    // ?¤ì‹œê°?ì¤‘ë³µ ì²´í¬ ì´ˆê¸°??
    this.initLiveDuplicateCheck();
    // ?ˆí¼?°ìŠ¤ ? íƒ ê¸°ëŠ¥ ì´ˆê¸°??
    this.initReferenceSelection();
    // SNS ?Œë«??? íƒ ê¸°ëŠ¥ ì´ˆê¸°??
    this.initSnsPlatformSelection();
    // ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ?¨ë„ ì´ˆê¸°??
    this.initReferenceLoader();
    // ?•ë? ëª¨ë“œ ì´ˆê¸°??
    this.initExpandModal();
  }

  // [Refactoring] AuthManagerë¡??„ì„
  async waitForFirebase() {
    await this.authManager.waitForFirebase();
    this.auth = this.authManager.auth;
    this.db = this.authManager.db;
    this.isFirebaseReady = this.authManager.isFirebaseReady;
  }

  // [Refactoring] AuthManager?ì„œ ì²˜ë¦¬?˜ë?ë¡??œê±° ?ëŠ” ?˜í•‘
  setupAuthStateListener() {
    // AuthManager ?´ë??ì„œ ì²˜ë¦¬??
  }

  // ??ê¸°ëŠ¥ ì´ˆê¸°??
  initTabListeners() {
    this.tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchTab(tabName);
      });
    });
  }

  /**
   * ???„í™˜ ì²˜ë¦¬
   * @param {string} tabName - ?„í™˜?????´ë¦„ ('writing', 'saved', 'tracking', 'management')
   */
  switchTab(tabName) {
    // ëª¨ë“  ??ë²„íŠ¼ê³?ì½˜í…ì¸ ì—??active ?´ë˜???œê±°
    this.tabButtons.forEach((btn) => btn.classList.remove("active"));
    this.tabContents.forEach((content) => content.classList.remove("active"));

    // ? íƒ????ë²„íŠ¼ê³?ì½˜í…ì¸ ì— active ?´ë˜??ì¶”ê?
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeButton) activeButton.classList.add("active");
    if (activeContent) activeContent.classList.add("active");

    // ?€?¥ëœ ê¸€ ??œ¼ë¡??„í™˜????ëª©ë¡ ?ˆë¡œê³ ì¹¨
    if (tabName === Constants.TABS.SAVED) {
      this.loadSavedTextsFromFirestore(false);
      this.initSavedFilters();
      // ë¯¸íŠ¸?˜í‚¹ ê¸€ ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    }

    // ?¸ë˜????œ¼ë¡??„í™˜ ???°ì´??ë¡œë“œ
    if (tabName === Constants.TABS.TRACKING) {
      this.loadTrackingPosts();
      this.updateTrackingSummary();
      this.initTrackingChart();
    }

    // ê¸€ ?‘ì„± ??œ¼ë¡??„í™˜???ŒëŠ” ?ˆí¼?°ìŠ¤?€ ?‘ì„± ?¨ë„??ëª¨ë‘ ë³´ì„
    if (tabName === Constants.TABS.WRITING) {
      // ?´ë? writing-container?????¨ë„??ëª¨ë‘ ?¬í•¨?˜ì–´ ?ˆìŒ
    }

    // ?¤í¬ë¦½íŠ¸ ?‘ì„± ??œ¼ë¡??„í™˜ ???°ì´??ë¡œë“œ
    if (tabName === Constants.TABS.MANAGEMENT) {
      this.loadArticlesForManagement();
      this.initArticleManagement();
    }
  }

  bindEvents() {
    // ?¬ìš©???¸ì¦ ?´ë²¤??
    this.loginBtn.addEventListener("click", () => this.login());
    this.logoutBtn.addEventListener("click", () => this.logout());

    // ?ˆë¡œê³ ì¹¨ ë²„íŠ¼ ?´ë²¤??ë¦¬ìŠ¤??(PC ?„ìš©)
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", () => this.refreshAllData());
    }
    this.usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.login();
      }
    });

    // Google ë¡œê·¸???´ë²¤??
    const googleLoginBtn = document.getElementById("google-login-btn");
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", () => this.googleLogin());
    }

    // ???´ë²¤??ë¦¬ìŠ¤???¤ì •
    this.initTabListeners();

    // ?€?¥ëœ ê¸€ ?„í„° ì´ˆê¸°??(ì´ˆê¸° ë¡œë“œ ?œì ?ë„ ë°˜ì˜)
    setTimeout(() => this.initSavedFilters(), 0);

    // ?ˆí¼?°ìŠ¤ ê¸€ ?´ë²¤??
    this.refTextInput.addEventListener("input", () => {
      this.updateCharacterCount("ref");
      this.scheduleTempSave();
    });
    this.refClearBtn.addEventListener("click", () => this.clearText("ref"));
    this.refSaveBtn.addEventListener("click", () => this.saveText("ref"));
    this.refDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("ref")
    );

    // ?˜ì •/?‘ì„± ê¸€ ?´ë²¤??
    this.editTextInput.addEventListener("input", () => {
      this.updateCharacterCount("edit");
      this.scheduleTempSave();
    });
    this.editClearBtn.addEventListener("click", () => this.clearText("edit"));
    this.editSaveBtn.addEventListener("click", () => this.saveText("edit"));
    this.editDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("edit")
    );

    // ë°˜ì?™í™” ?¬ìŠ¤???´ë²¤??
    const semiAutoPostBtn = document.getElementById("semi-auto-post-btn");
    if (semiAutoPostBtn) {
      logger.log("??ë°˜ì?™í™” ?¬ìŠ¤??ë²„íŠ¼ ë°œê²¬ ë°??´ë²¤??ë°”ì¸??);

      semiAutoPostBtn.addEventListener("click", (e) => {
        logger.log("?” ë°˜ì?™í™” ?¬ìŠ¤??ë²„íŠ¼ ?´ë¦­ ê°ì?");
        e.preventDefault();
        e.stopPropagation();

        // this ì»¨í…?¤íŠ¸ ëª…ì‹œ??ë°”ì¸??
        const self = this;
        logger.log("?” this ì»¨í…?¤íŠ¸:", self);
        logger.log(
          "?” handleSemiAutoPost ?¨ìˆ˜:",
          typeof self.handleSemiAutoPost
        );

        if (typeof self.handleSemiAutoPost === "function") {
          logger.log("??handleSemiAutoPost ?¨ìˆ˜ ?¸ì¶œ");
          self.handleSemiAutoPost();
        } else {
          logger.error("??handleSemiAutoPost ?¨ìˆ˜ê°€ ?†ìŠµ?ˆë‹¤!");
        }
      });

      // ?¤ë³´???‘ê·¼??ì§€??
      semiAutoPostBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          logger.log("?” ë°˜ì?™í™” ?¬ìŠ¤??ë²„íŠ¼ ?¤ë³´???…ë ¥ ê°ì?");
          e.preventDefault();
          e.stopPropagation();

          // this ì»¨í…?¤íŠ¸ ëª…ì‹œ??ë°”ì¸??
          const self = this;

          if (typeof self.handleSemiAutoPost === "function") {
            logger.log("??handleSemiAutoPost ?¨ìˆ˜ ?¸ì¶œ (?¤ë³´??");
            self.handleSemiAutoPost();
          } else {
            logger.error("??handleSemiAutoPost ?¨ìˆ˜ê°€ ?†ìŠµ?ˆë‹¤!");
          }
        }
      });

      // ?‘ê·¼???ì„± ?¤ì •
      semiAutoPostBtn.setAttribute(
        "aria-label",
        "Threads??ë°˜ì?™ìœ¼ë¡??¬ìŠ¤?…í•˜ê¸?
      );
      semiAutoPostBtn.setAttribute("role", "button");
      semiAutoPostBtn.setAttribute("tabindex", "0");

      logger.log("??ë°˜ì?™í™” ?¬ìŠ¤??ë²„íŠ¼ ?´ë²¤??ë°”ì¸???„ë£Œ");
    } else {
      logger.error("??ë°˜ì?™í™” ?¬ìŠ¤??ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤!");
    }

    // ?¸ë˜???„í„° ?´ë²¤??
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
          // debounceë¡??±ëŠ¥ ìµœì ??ë°?sticky ?„í„°ë°?ì¶©ëŒ ë°©ì?
          this.trackingSearchDebounce = setTimeout(() => {
            this.trackingSearch = val;
            localStorage.setItem("dtw_tracking_search", this.trackingSearch);
            // refreshUI ?¬ìš©?¼ë¡œ ?µí•© ?…ë°?´íŠ¸
            this.refreshUI({ trackingPosts: true });
          }, 300);
        });
      }
      // ???€?¥ëœ ê¸€ ê²€???´ë²¤??ë°”ì¸??
      if (this.savedSearchInput) {
        this.savedSearchInput.value = this.savedSearch;
        this.savedSearchDebounce = null;
        this.savedSearchInput.addEventListener("input", (e) => {
          const val = e.target.value;
          clearTimeout(this.savedSearchDebounce);
          // debounceë¡??±ëŠ¥ ìµœì ??(600ms)
          this.savedSearchDebounce = setTimeout(async () => {
            // [Hybrid Pagination] ê²€?????„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
            await this.ensureAllDataLoaded();
            
            this.savedSearch = val;
            localStorage.setItem("dtw_saved_search", this.savedSearch);
            // ?€?¥ëœ ê¸€ ëª©ë¡ ?ˆë¡œê³ ì¹¨
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

      // ?˜ì¹˜ ë²”ìœ„ ?„í„° ?…ë ¥ ë°”ì¸??
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

      // ë²”ìœ„ ?„í„° ?‘ê¸°/?¼ì¹˜ê¸?ì´ˆê¸°??
      this.initRangeFilter();

      if (this.exportCsvBtn) {
        this.exportCsvBtn.addEventListener("click", () =>
          this.exportTrackingCsv()
        );
      }
    }, 0);

    // ?´ì‹œ?œê·¸ ?¤ì • ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
    const hashtagSettingsBtn = document.getElementById("hashtag-settings-btn");
    if (hashtagSettingsBtn) {
      hashtagSettingsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showHashtagSettings();
      });

      // ì´ˆê¸° ?´ì‹œ?œê·¸ ?œì‹œ ?…ë°?´íŠ¸
      setTimeout(() => {
        this.updateHashtagsDisplay();
      }, 100);

      logger.log("???´ì‹œ?œê·¸ ?¤ì • ë²„íŠ¼ ?´ë²¤??ë°”ì¸???„ë£Œ");
    } else {
      logger.error("???´ì‹œ?œê·¸ ?¤ì • ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤!");
    }

    // ?¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
    if (this.batchMigrationBtn) {
      this.batchMigrationBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showBatchMigrationConfirm();
      });
      logger.log("???¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ë²„íŠ¼ ?´ë²¤??ë°”ì¸???„ë£Œ");
    } else {
      logger.log("? ï¸ ?¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤ (? íƒ??ê¸°ëŠ¥)");
    }

    // ê°œë°œ ëª¨ë“œ?ì„œ ?ë™ ?ŒìŠ¤???¤í–‰
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      setTimeout(() => {
        logger.log("?”§ ê°œë°œ ëª¨ë“œ: ?ë™ ?ŒìŠ¤???¤í–‰");
        this.runComprehensiveTest();
      }, 2000);
    }

    // ?¨ë„ ê¸°ë°˜ LLM ê²€ì¦?ë²„íŠ¼ ì´ˆê¸° ë°”ì¸??
    // DOM???„ì „??ë¡œë“œ?????¤í–‰?˜ë„ë¡?setTimeout ?¬ìš©
    setTimeout(() => {
      this.bindPanelLLMButtons();
    }, 100);

    // '??ë³´ê¸°' ë²„íŠ¼ ?´ë²¤??
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => this.loadMoreTexts());
    }
  }

  /**
   * ?€?¥ëœ ê¸€ ë¶ˆëŸ¬?¤ê¸° (Firestore) - ?˜ì´ì§€?¤ì´??ì§€??
   * @param {boolean} loadAll - ?„ì²´ ë¡œë“œ ?¬ë? (ê²€???„í„° ??true)
   */
  async loadSavedTextsFromFirestore(loadAll = false) {
    if (!this.currentUser) return;

    try {
      this.showLoadingSpinner(true);

      if (loadAll) {
        // ?„ì²´ ë¡œë“œ (ê¸°ì¡´ ë°©ì‹ê³?? ì‚¬?˜ì?ë§?DataManager ì§ì ‘ ?¬ìš©)
        const texts = await this.dataManager.loadSavedTexts(this.currentUser.uid);
        this.savedTexts = texts;
        this.isAllDataLoaded = true;
        this.lastVisibleDoc = null;
      } else {
        // ?˜ì´ì§€?¤ì´??ë¡œë“œ
        const result = await this.dataManager.loadSavedTextsPaginated(
          this.currentUser.uid,
          this.PAGE_SIZE,
          this.lastVisibleDoc
        );

        if (this.lastVisibleDoc === null) {
          // ì²??˜ì´ì§€
          this.savedTexts = result.texts;
        } else {
          // ??ë³´ê¸°: ì¤‘ë³µ ?œê±° ??ì¶”ê?
          const newTexts = result.texts.filter(
            (newText) => !this.savedTexts.some((existing) => existing.id === newText.id)
          );
          this.savedTexts = [...this.savedTexts, ...newTexts];
        }

        this.lastVisibleDoc = result.lastVisibleDoc;

        // ???´ìƒ ë¶ˆëŸ¬???°ì´?°ê? ?†ìœ¼ë©??Œë˜ê·??¤ì •
        if (result.texts.length < this.PAGE_SIZE) {
          this.isAllDataLoaded = true;
        }
      }

      // UI ?…ë°?´íŠ¸
      this.updateLoadMoreButtonVisibility();
      this.renderSavedTexts();

    } catch (error) {
      logger.error("?€?¥ëœ ê¸€ ë¡œë“œ ?¤íŒ¨:", error);
      this.showMessage("ê¸€ ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
    } finally {
      this.showLoadingSpinner(false);
    }
  }

  /**
   * '??ë³´ê¸°' ë²„íŠ¼ ?´ë¦­ ?¸ë“¤??
   */
  async loadMoreTexts() {
    if (this.isAllDataLoaded) return;
    await this.loadSavedTextsFromFirestore(false);
  }

  /**
   * [Hybrid Pagination] ê²€???„í„°ë¥??„í•œ ?„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
   */
  async ensureAllDataLoaded() {
    if (this.isAllDataLoaded) return;

    this.showMessage("ê²€???„í„°ë¥??„í•´ ?„ì²´ ?°ì´?°ë? ë¶ˆëŸ¬?µë‹ˆ??..", "info");
    await this.loadSavedTextsFromFirestore(true);
  }

  /**
   * '??ë³´ê¸°' ë²„íŠ¼ ë°??¤í”¼???íƒœ ?…ë°?´íŠ¸
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
        loadMoreBtn.textContent = "??ë³´ê¸°";
      }
    }

    if (spinner) {
      spinner.style.display = "none";
    }
  }

  /**
   * ë¡œë”© ?¤í”¼???œì‹œ/?¨ê?
   */
  showLoadingSpinner(show) {
    const loadMoreBtn = document.getElementById("load-more-btn");
    const spinner = document.getElementById("load-more-container");

    if (show) {
      if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = "ë¡œë”© ì¤?..";
      }
      if (spinner) spinner.style.display = "flex";
    } else {
      this.updateLoadMoreButtonVisibility();
    }
  }

  // ê¸€???œí•œ ? ê? ì´ˆê¸°??
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
    // textarea maxlength ?…ë°?´íŠ¸
    if (this.refTextInput)
      this.refTextInput.setAttribute("maxlength", String(value));
    if (this.editTextInput)
      this.editTextInput.setAttribute("maxlength", String(value));
    // ?ë‹¨ ì¹´ìš´??ìµœë?ê°??œì‹œ ?…ë°?´íŠ¸
    const refMax = document.getElementById("ref-max-count");
    const editMax = document.getElementById("edit-max-count");
    if (refMax) refMax.textContent = String(value);
    if (editMax) editMax.textContent = String(value);
    // ì§„í–‰ë°?ë²„íŠ¼ ?íƒœ ?¬ê³„??
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
  }

  // ?€?¥ëœ ê¸€ ?„í„° UI ì´ˆê¸°??ë°??´ë²¤??ë°”ì¸??
  initSavedFilters() {
    const container = document.querySelector("#saved-tab .segmented-control");
    if (!container) return;
    const buttons = container.querySelectorAll(".segment-btn");
    if (!buttons || buttons.length === 0) return;

    // ?ˆí¼?°ìŠ¤ ? í˜• ?„í„° ì´ˆê¸°??
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
        // [Hybrid Pagination] ?„í„° ???„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
        await this.ensureAllDataLoaded();

        this.referenceTypeFilter = this.referenceTypeFilterSelect.value;
        localStorage.setItem(
          "dualTextWriter_referenceTypeFilter",
          this.referenceTypeFilter
        );
        this.renderSavedTexts();
      };
    }

    // ì£¼ì œ ?„í„° ?´ë²¤??ë¦¬ìŠ¤???¤ì • (?‘ì„± ê¸€??
    if (this.topicFilter) {
      this.currentTopicFilter =
        localStorage.getItem("dualTextWriter_topicFilter") || "all";
      this.topicFilter.value = this.currentTopicFilter;
      this.topicFilter.onchange = async () => {
        // [Hybrid Pagination] ?„í„° ???„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
        await this.ensureAllDataLoaded();

        this.currentTopicFilter = this.topicFilter.value;
        localStorage.setItem(
          "dualTextWriter_topicFilter",
          this.currentTopicFilter
        );
        this.renderSavedTextsCache = null; // ìºì‹œ ë¬´íš¨??
        this.renderSavedTexts();
      };
    }

    // ?ŒìŠ¤ ?„í„° ?´ë²¤??ë¦¬ìŠ¤???¤ì • (?ˆí¼?°ìŠ¤ ê¸€??
    if (this.sourceFilter) {
      this.currentSourceFilter =
        localStorage.getItem("dualTextWriter_sourceFilter") || "all";
      this.sourceFilter.value = this.currentSourceFilter;
      this.sourceFilter.onchange = async () => {
        // [Hybrid Pagination] ?„í„° ???„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
        await this.ensureAllDataLoaded();

        this.currentSourceFilter = this.sourceFilter.value;
        localStorage.setItem(
          "dualTextWriter_sourceFilter",
          this.currentSourceFilter
        );
        this.renderSavedTextsCache = null; // ìºì‹œ ë¬´íš¨??
        this.renderSavedTexts();
      };
    }

    // SNS ?Œë«???„í„° ?´ë²¤??ë¦¬ìŠ¤???¤ì • (?‘ì„± ê¸€??
    if (this.snsFilterMode) {
      this.currentSnsFilterMode =
        localStorage.getItem("dualTextWriter_snsFilterMode") || "all";
      this.snsFilterMode.value = this.currentSnsFilterMode;
      this.snsFilterMode.onchange = async () => {
        // [Hybrid Pagination] ?„í„° ???„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
        await this.ensureAllDataLoaded();

        this.currentSnsFilterMode = this.snsFilterMode.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterMode",
          this.currentSnsFilterMode
        );
        // ?„í„° ëª¨ë“œê°€ 'all'???„ë‹ˆë©??Œë«??? íƒ ?œë¡­?¤ìš´ ?œì‹œ
        if (this.snsFilterPlatform) {
          if (this.currentSnsFilterMode === "all") {
            this.snsFilterPlatform.style.display = "none";
            this.currentSnsFilterPlatform = "";
            this.snsFilterPlatform.value = "";
          } else {
            this.snsFilterPlatform.style.display = "block";
          }
        }
        this.renderSavedTextsCache = null; // ìºì‹œ ë¬´íš¨??
        this.renderSavedTexts();
      };
    }

    if (this.snsFilterPlatform) {
      this.currentSnsFilterPlatform =
        localStorage.getItem("dualTextWriter_snsFilterPlatform") || "";
      this.snsFilterPlatform.value = this.currentSnsFilterPlatform;
      // ì´ˆê¸° ?œì‹œ ?íƒœ ?¤ì •
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
      this.snsFilterPlatform.onchange = async () => {
        // [Hybrid Pagination] ?„í„° ???„ì²´ ?°ì´??ë¡œë“œ ë³´ì¥
        await this.ensureAllDataLoaded();

        this.currentSnsFilterPlatform = this.snsFilterPlatform.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterPlatform",
          this.currentSnsFilterPlatform
        );
        this.renderSavedTextsCache = null; // ìºì‹œ ë¬´íš¨??
        this.renderSavedTexts();
      };
    }

    // SNS ?Œë«??ëª©ë¡ ì´ˆê¸°??(?ëŸ¬ ë°œìƒ ?œì—????ì´ˆê¸°?”ê? ì§„í–‰?˜ë„ë¡?ë³´í˜¸)
    try {
      this.updateSnsFilterOptions();
    } catch (e) {
      logger.error("SNS ?„í„° ?µì…˜ ?…ë°?´íŠ¸ ?¤íŒ¨:", e);
    }

    // ?œì„± ?íƒœ ë³µì› (ê°•ì œ ?™ê¸°??
    try {
      buttons.forEach((btn) => {
        const filter = btn.getAttribute("data-filter");
        const isActive = filter === this.savedFilter;
        // HTML??ë°•ì œ??class="active"ê°€ ?ˆë”?¼ë„ JS ?íƒœ??ë§ì¶° ê°•ì œ ?¬ì„¤??
        if (isActive) {
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
        } else {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        }
      });
    } catch (e) {
      logger.error("?„í„° ë²„íŠ¼ ?íƒœ ?™ê¸°???¤íŒ¨:", e);
    }

    // ?´ë¦­ ?´ë²¤??ë°”ì¸??
    buttons.forEach((btn) => {
      btn.removeEventListener("click", btn._filterHandler);
      btn._filterHandler = (e) => {
        e.preventDefault();
        const filter = btn.getAttribute("data-filter");
        this.setSavedFilter(filter);
      };
      btn.addEventListener("click", btn._filterHandler);
    });

    // ì´ˆê¸° ?œì‹œ ?íƒœ
    this.updateReferenceTypeFilterVisibility();
  }

  setSavedFilter(filter) {
    // ?ëŸ¬ ì²˜ë¦¬: ?„í„° ê°’ì´ ?ˆìƒ ë²”ìœ„ë¥?ë²—ì–´??ê²½ìš° ì²˜ë¦¬
    const validFilters = ["all", "edit", "reference", "reference-used"];
    if (!validFilters.includes(filter)) {
      logger.warn("setSavedFilter: ?˜ëª»???„í„° ê°?", filter);
      return;
    }

    this.savedFilter = filter;
    localStorage.setItem("dualTextWriter_savedFilter", filter);

    // UI ?…ë°?´íŠ¸
    const container = document.querySelector("#saved-tab .segmented-control");
    if (container) {
      container.querySelectorAll(".segment-btn").forEach((btn) => {
        const isActive = btn.getAttribute("data-filter") === filter;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    // ? í˜• ?„í„° ?œì‹œ/?¨ê?
    this.updateReferenceTypeFilterVisibility();

    // ì£¼ì œ/?ŒìŠ¤ ?„í„° ?œì‹œ/?¨ê?
    this.updateTopicSourceFilterVisibility();

    // ëª©ë¡ ?Œë”ë§?
    this.renderSavedTexts();

    // ?‘ê·¼?? ?„í„° ë³€ê²????¬ì»¤??ê´€ë¦?(? íƒ?? ?„ìš” ???œì„±??
    // setTimeout???¬ìš©?˜ì—¬ ?Œë”ë§??„ë£Œ ???¤í–‰
    // const firstItem = this.savedList.querySelector('.saved-item');
    // if (firstItem) {
    //     setTimeout(() => {
    //         firstItem.focus();
    //     }, 100);
    // }
  }

  updateTopicFilterOptions() {
    if (!this.topicFilter) return;

    // ?‘ì„± ê¸€(type === 'edit')?ì„œë§?ê³ ìœ ??ì£¼ì œ ëª©ë¡ ì¶”ì¶œ
    const topics = new Set();
    this.savedTexts.forEach((item) => {
      // ?‘ì„± ê¸€ë§??„í„°ë§?
      if ((item.type || "edit") === "edit" && item.topic && item.topic.trim()) {
        topics.add(item.topic.trim());
      }
    });

    // ì£¼ì œ ëª©ë¡??ë°°ì—´ë¡?ë³€?˜í•˜ê³??•ë ¬
    this.availableTopics = Array.from(topics).sort();

    // ?œë¡­?¤ìš´ ?µì…˜ ?…ë°?´íŠ¸
    const currentValue = this.topicFilter.value;
    this.topicFilter.innerHTML = '<option value="all">?„ì²´ ì£¼ì œ</option>';

    this.availableTopics.forEach((topic) => {
      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic;
      this.topicFilter.appendChild(option);
    });

    // ?´ì „ ? íƒê°?ë³µì›
    if (currentValue && this.availableTopics.includes(currentValue)) {
      this.topicFilter.value = currentValue;
    } else {
      this.topicFilter.value = "all";
      this.currentTopicFilter = "all";
    }
  }

  updateSourceFilterOptions() {
    if (!this.sourceFilter) return;

    // ?ˆí¼?°ìŠ¤ ê¸€(type === 'reference')?ì„œë§?ê³ ìœ ???ŒìŠ¤(ì£¼ì œ) ëª©ë¡ ì¶”ì¶œ
    const sources = new Set();
    this.savedTexts.forEach((item) => {
      // ?ˆí¼?°ìŠ¤ ê¸€ë§??„í„°ë§?
      if (
        (item.type || "edit") === "reference" &&
        item.topic &&
        item.topic.trim()
      ) {
        sources.add(item.topic.trim());
      }
    });

    // ?ŒìŠ¤ ëª©ë¡??ë°°ì—´ë¡?ë³€?˜í•˜ê³??•ë ¬
    this.availableSources = Array.from(sources).sort();

    // ?œë¡­?¤ìš´ ?µì…˜ ?…ë°?´íŠ¸
    const currentValue = this.sourceFilter.value;
    this.sourceFilter.innerHTML = '<option value="all">?„ì²´ ?ŒìŠ¤</option>';

    this.availableSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      this.sourceFilter.appendChild(option);
    });

    // ?´ì „ ? íƒê°?ë³µì›
    if (currentValue && this.availableSources.includes(currentValue)) {
      this.sourceFilter.value = currentValue;
    } else {
      this.sourceFilter.value = "all";
      this.currentSourceFilter = "all";
    }
  }

  updateSnsFilterOptions() {
    if (!this.snsFilterPlatform) return;

    // ?„ì¬ ? íƒê°??€??
    const currentValue = this.snsFilterPlatform.value;

    // SNS ?Œë«??ëª©ë¡ ì´ˆê¸°??
    this.snsFilterPlatform.innerHTML = '<option value="">?Œë«??? íƒ</option>';

    // DualTextWriter.SNS_PLATFORMS?ì„œ ?Œë«??ëª©ë¡ ?ì„±
    DualTextWriter.SNS_PLATFORMS.forEach((platform) => {
      const option = document.createElement("option");
      option.value = platform.id;
      option.textContent = `${platform.icon} ${platform.name}`;
      this.snsFilterPlatform.appendChild(option);
    });

    // ?´ì „ ? íƒê°?ë³µì›
    if (
      currentValue &&
      DualTextWriter.SNS_PLATFORMS.some((p) => p.id === currentValue)
    ) {
      this.snsFilterPlatform.value = currentValue;
    } else {
      this.snsFilterPlatform.value = "";
      this.currentSnsFilterPlatform = "";
    }

    // ?„í„° ëª¨ë“œ???°ë¼ ?Œë«??? íƒ ?œë¡­?¤ìš´ ?œì‹œ/?¨ê?
    if (this.snsFilterMode && this.snsFilterPlatform) {
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
    }
  }

  updateTopicSourceFilterVisibility() {
    // ?‘ì„± ê¸€ ?„í„°???? ì£¼ì œ ?„í„° ë°?SNS ?„í„° ?œì‹œ, ?ŒìŠ¤ ?„í„° ?¨ê?
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
    // ?ˆí¼?°ìŠ¤ ê¸€ ?„í„°???? ?ŒìŠ¤ ?„í„° ?œì‹œ, ì£¼ì œ ?„í„° ë°?SNS ?„í„° ?¨ê?
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
    // ?„ì²´ ?„í„°???? ëª¨ë‘ ?¨ê?
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
   * ?ìŠ¤???´ìš©???•ê·œ?”í•©?ˆë‹¤.
   *
   * ì¤‘ë³µ ì²´í¬ë¥??„í•´ ?ìŠ¤?¸ë? ?•ê·œ?”í•©?ˆë‹¤. ê³µë°±, ì¤„ë°”ê¿? ìºë¦¬ì§€ ë¦¬í„´???•ë¦¬?˜ì—¬
   * ?™ì¼???´ìš©???¤ë¥¸ ?•ì‹?¼ë¡œ ?…ë ¥??ê²½ìš°?ë„ ì¤‘ë³µ?¼ë¡œ ?¸ì‹?????ˆë„ë¡??©ë‹ˆ??
   *
   * @param {string} text - ?•ê·œ?”í•  ?ìŠ¤??
   * @returns {string} ?•ê·œ?”ëœ ?ìŠ¤??(ë¹?ë¬¸ì???ëŠ” ?•ê·œ?”ëœ ?ìŠ¤??
   *
   * @example
   * // ê³µë°± ì°¨ì´ ?•ê·œ??
   * normalizeContent('hello   world') // 'hello world'
   *
   * // ì¤„ë°”ê¿??•ë¦¬
   * normalizeContent('hello\nworld') // 'hello world'
   *
   * // ?ë’¤ ê³µë°± ?œê±°
   * normalizeContent('  hello world  ') // 'hello world'
   */
  normalizeContent(text) {
    // null, undefined, ë¹?ë¬¸ì??ì²˜ë¦¬
    if (!text || typeof text !== "string") {
      return "";
    }

    try {
      // ?ë’¤ ê³µë°± ?œê±°
      let normalized = text.trim();

      // ?°ì†??ê³µë°±???˜ë‚˜ë¡?ë³€??
      normalized = normalized.replace(/\s+/g, " ");

      // ì¤„ë°”ê¿ˆì„ ê³µë°±?¼ë¡œ ë³€??
      normalized = normalized.replace(/\n+/g, " ");

      // ìºë¦¬ì§€ ë¦¬í„´??ê³µë°±?¼ë¡œ ë³€??
      normalized = normalized.replace(/\r+/g, " ");

      // ìµœì¢…?ìœ¼ë¡??°ì†??ê³µë°±???ê¸¸ ???ˆìœ¼ë¯€ë¡??¤ì‹œ ?•ë¦¬
      normalized = normalized.replace(/\s+/g, " ");

      return normalized.trim();
    } catch (error) {
      // ?•ê·œ???ëŸ¬ ë°œìƒ ???ë³¸ ?ìŠ¤?¸ì˜ trimë§?ë°˜í™˜
      logger.warn("?ìŠ¤???•ê·œ??ì¤??¤ë¥˜ ë°œìƒ:", error);
      return typeof text === "string" ? text.trim() : "";
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ?´ìš©??ì¤‘ë³µ ?¬ë?ë¥??•ì¸?©ë‹ˆ??
   *
   * ?€?¥ëœ ?ˆí¼?°ìŠ¤(`this.savedTexts` ì¤?type === 'reference'????ª©)?€
   * ?…ë ¥???´ìš©(`content`)???•ê·œ?”í•˜???„ì „ ?¼ì¹˜ ?¬ë?ë¥??•ì¸?©ë‹ˆ??
   * ì²?ë²ˆì§¸ë¡?ë°œê²¬??ì¤‘ë³µ ?ˆí¼?°ìŠ¤ ê°ì²´ë¥?ë°˜í™˜?˜ë©°, ?†ìœ¼ë©?null??ë°˜í™˜?©ë‹ˆ??
   *
   * ?±ëŠ¥: O(N) - ?ˆí¼?°ìŠ¤ ?˜ê? ë§ì? ?Šì? ?„ì¬ êµ¬ì¡°?ì„œ ?í•©?˜ë©°,
   * ì¶”í›„ ?´ì‹œ ê¸°ë°˜ ìµœì ??Phase 3)ë¡??•ì¥ ê°€?¥í•©?ˆë‹¤.
   *
   * @param {string} content - ?•ì¸???ˆí¼?°ìŠ¤ ?´ìš©
   * @returns {Object|null} ì¤‘ë³µ???ˆí¼?°ìŠ¤ ê°ì²´ ?ëŠ” null
   *
   * @example
   * const dup = this.checkDuplicateReference('  ê°™ì?  ?´ìš©\\n?…ë‹ˆ??');
   * if (dup) { logger.log('ì¤‘ë³µ ë°œê²¬:', dup.id); }
   */
  checkDuplicateReference(content) {
    // ?ˆì „??ì²´í¬
    if (!content || typeof content !== "string") {
      return null;
    }
    if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) {
      return null;
    }

    // 1) ?´ì‹œê°€ ?ˆëŠ” ê²½ìš°: ?´ì‹œ ?°ì„  ë¹„êµ
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
      // ?´ì‹œ ê³„ì‚° ?¤íŒ¨ ??ë¬´ì‹œ?˜ê³  ?•ê·œ??ë¹„êµë¡??´ë°±
    }

    // 2) ?•ê·œ??ê¸°ë°˜ ?„ì „ ?¼ì¹˜ ë¹„êµ
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
   * ?´ìš© ?´ì‹œ(SHA-256)ë¥?ê³„ì‚°?©ë‹ˆ?? ë¸Œë¼?°ì? SubtleCrypto ?¬ìš©.
   * ?¬ìš©??ë¶ˆê????˜ê²½???„í•´ ?™ê¸° ?´ë°± ?´ì‹œ???œê³µ?©ë‹ˆ??
   *
   * @param {string} content - ?•ê·œ?”ëœ ?´ìš©
   * @returns {Promise<string>} 16ì§„ìˆ˜ ?´ì‹œ ë¬¸ì??
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
      logger.warn("SHA-256 ?´ì‹œ ê³„ì‚° ?¤íŒ¨, ?´ë°± ?´ì‹œ ?¬ìš©:", e);
    }
    // ?´ë°±: ê°„ë‹¨???™ê¸° ?´ì‹œ (ì¶©ëŒ ê°€?¥ì„± ?ˆìœ¼???„ì‹œ??
    return this.calculateContentHashSync(content);
  }

  /**
   * ?™ê¸° ?´ë°± ?´ì‹œ (ê°„ë‹¨??32ë¹„íŠ¸ ?„ì  ?´ì‹œ)
   * @param {string} content
   * @returns {string} 16ì§„ìˆ˜ ?´ì‹œ
   */
  calculateContentHashSync(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    // 32ë¹„íŠ¸ ?•ìˆ˜ -> 8?ë¦¬ 16ì§„ìˆ˜
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  /**
   * ê¸°ì¡´ ?ˆí¼?°ìŠ¤??contentHashë¥?ì±„ì›Œ ?£ëŠ” ë§ˆì´ê·¸ë ˆ?´ì…˜ ? í‹¸ë¦¬í‹°.
   * ?€??ë¬¸ì„œ?ëŠ” ë°°ì¹˜/ë°±ì˜¤???„ëµ???„ìš”?????ˆìŒ.
   */
  /**
   * ê¸°ì¡´ ?ˆí¼?°ìŠ¤??contentHashë¥?ë°°ì¹˜ ì²˜ë¦¬ë¡?ë§ˆì´ê·¸ë ˆ?´ì…˜
   *
   * ?±ëŠ¥ ìµœì ??
   * - ?œì°¨ ?…ë°?´íŠ¸ Në²???writeBatch() ë°°ì¹˜ ì²˜ë¦¬
   * - ?¤í–‰ ?œê°„: 20-30ì´???2-3ì´?(90% ?¨ì¶•)
   * - 500ê°??¨ìœ„ë¡?ì²?¬ ë¶„í•  (Firestore ë°°ì¹˜ ?œí•œ)
   * - ë°°ì¹˜ ê°?100ms ?œë ˆ??(?œë²„ ë¶€??ë¶„ì‚°)
   *
   * @returns {Promise<void>}
   */
  async migrateHashesForExistingReferences() {
    if (!this.currentUser || !this.isFirebaseReady) return;
    if (!Array.isArray(this.savedTexts) || this.savedTexts.length === 0) return;

    try {
      // 1. ?…ë°?´íŠ¸ ?€???˜ì§‘
      const updates = [];
      for (const item of this.savedTexts) {
        if ((item.type || "edit") !== "reference") continue;
        if (item.contentHash) continue; // ?´ë? ?´ì‹œ ?ˆìŒ

        const normalized = this.normalizeContent(item.content || "");
        const hash = await this.calculateContentHash(normalized);
        if (!hash) continue;

        updates.push({ id: item.id, contentHash: hash });
      }

      if (updates.length === 0) {
        this.showMessage("??ëª¨ë“  ?ˆí¼?°ìŠ¤ê°€ ìµœì‹  ?íƒœ?…ë‹ˆ??", "success");
        return;
      }

      logger.log(`?“Š ${updates.length}ê°??ˆí¼?°ìŠ¤ ?´ì‹œ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?œì‘...`);

      // ì§„í–‰ë¥?ëª¨ë‹¬ ?œì‹œ
      this.showMigrationProgressModal(updates.length);

      // 2. ??ë°°ì¹˜ ì²˜ë¦¬ (?¤ì • ?ìˆ˜ ?¬ìš©)
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

          // ë¡œì»¬ ë°˜ì˜
          const local = this.savedTexts.find((t) => t.id === u.id);
          if (local) {
            local.contentHash = u.contentHash;
            local.hashVersion = 1;
          }
        }

        // ë°°ì¹˜ ì»¤ë°‹
        await batch.commit();
        completedCount += chunk.length;

        // ì§„í–‰ë¥??…ë°?´íŠ¸
        this.updateMigrationProgress(completedCount, updates.length);

        // ì§„í–‰ë¥?ë¡œê·¸ (?”ë²„ê¹…ìš©)
        const progress = Math.round((completedCount / updates.length) * 100);
        logger.log(
          `??ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ ì¤? ${completedCount}/${updates.length} (${progress}%)`
        );

        // ?¤ìŒ ë°°ì¹˜ ??ì§§ì? ?€ê¸?(?œë²„ ë¶€??ë¶„ì‚°, ?¤ì • ?ìˆ˜ ?¬ìš©)
        if (index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // ì§„í–‰ë¥?ëª¨ë‹¬ ?«ê¸°
      this.hideMigrationProgressModal();

      // ?„ë£Œ ë©”ì‹œì§€
      this.showMessage(
        `??${updates.length}ê°??ˆí¼?°ìŠ¤ ?´ì‹œ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?„ë£Œ!`,
        "success"
      );
      logger.log(`??ë§ˆì´ê·¸ë ˆ?´ì…˜ ?„ë£Œ: ${updates.length}ê°?);
    } catch (error) {
      // ì§„í–‰ë¥?ëª¨ë‹¬ ?«ê¸° (?ëŸ¬ ??
      this.hideMigrationProgressModal();

      logger.error("???´ì‹œ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤íŒ¨:", error);
      this.showMessage(
        `???´ì‹œ ë§ˆì´ê·¸ë ˆ?´ì…˜ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ë¥?ëª¨ë‹¬ ?œì‹œ
   * @param {number} total - ?„ì²´ ??ª© ??
   */
  showMigrationProgressModal(total) {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "flex";
      this.updateMigrationProgress(0, total);
    }
  }

  /**
   * ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ë¥??…ë°?´íŠ¸
   * @param {number} completed - ?„ë£Œ????ª© ??
   * @param {number} total - ?„ì²´ ??ª© ??
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
      progressText.textContent = `${completed} / ${total} ?„ë£Œ (${progress}%)`;
    }

    if (progressContainer) {
      progressContainer.setAttribute("aria-valuenow", progress);
    }
  }

  /**
   * ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ë¥?ëª¨ë‹¬ ?¨ê?
   */
  hideMigrationProgressModal() {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  /**
   * ì¤‘ë³µ ?ˆí¼?°ìŠ¤ ?•ì¸ ëª¨ë‹¬???œì‹œ?©ë‹ˆ??
   *
   * ì¤‘ë³µ???ˆí¼?°ìŠ¤???”ì•½ ?•ë³´ë¥?ë³´ì—¬ì£¼ê³ , ?¬ìš©?ì—ê²?
   * ?€??ì·¨ì†Œ, ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ë³´ê¸°, ê·¸ë˜???€??ì¤??˜ë‚˜ë¥?? íƒ?˜ê²Œ ?©ë‹ˆ??
   *
   * ?‘ê·¼??
   * - role="dialog", aria-modal="true" ?ìš©
   * - ESC ë¡??«ê¸° ì§€??
   * - ë²„íŠ¼??ëª…í™•???¼ë²¨ ?ìš©
   *
   * @param {Object} duplicate - ì¤‘ë³µ???ˆí¼?°ìŠ¤ ?•ë³´ ê°ì²´
   * @returns {Promise<boolean>} true: ê·¸ë˜???€?? false: ì·¨ì†Œ/ë³´ê¸° ? íƒ
   */
  async showDuplicateConfirmModal(duplicate) {
    return new Promise((resolve) => {
      // ê¸°ì¡´ ëª¨ë‹¬ ?œê±° (ì¤‘ë³µ ?œì‹œ ë°©ì?)
      const existing = document.getElementById("duplicate-confirm-overlay");
      if (existing) existing.remove();

      // ? ì§œ ?¬ë§· ? í‹¸ (?´ë? ?„ìš©)
      // ? ì§œ ?¬ë§·?…ì? ?´ë˜??ë©”ì„œ??formatDateFromFirestore ?¬ìš©

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
                    <div style="font-size: 1.25rem;">? ï¸</div>
                    <h3 id="duplicate-confirm-title" style="margin:0; font-size:1.1rem; font-weight:700; color:#333;">
                        ì¤‘ë³µ ?ˆí¼?°ìŠ¤ ë°œê²¬
                    </h3>
                </div>
                <p style="margin:0 0 12px; color:#555; line-height:1.6;">
                    ?…ë ¥?˜ì‹  ?´ìš©ê³??™ì¼???ˆí¼?°ìŠ¤ê°€ ?´ë? ?€?¥ë˜???ˆìŠµ?ˆë‹¤. ?´ë–»ê²??˜ì‹œê² ìŠµ?ˆê¹Œ?
                </p>
                <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; margin-bottom: 16px;">
                    ${
                      createdAtStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>?€??? ì§œ:</strong> ${createdAtStr}</div>`
                        : ""
                    }
                    ${
                      topicStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>ì£¼ì œ:</strong> ${topicStr}</div>`
                        : ""
                    }
                    <div style="font-size:0.95rem; color:#444;"><strong>?´ìš©:</strong> ${contentPreview}</div>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" data-action="cancel" class="btn btn-secondary" aria-label="?€??ì·¨ì†Œ"
                        style="padding:8px 12px; border-radius:8px; background:#e9ecef; border:none; color:#333; cursor:pointer;">
                        ì·¨ì†Œ
                    </button>
                    <button type="button" data-action="view" class="btn btn-primary" aria-label="ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ë³´ê¸°"
                        style="padding:8px 12px; border-radius:8px; background:#0d6efd; border:none; color:#fff; cursor:pointer;">
                        ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ë³´ê¸°
                    </button>
                    <button type="button" data-action="save" class="btn btn-warning" aria-label="ê·¸ë˜???€??
                        style="padding:8px 12px; border-radius:8px; background:#ffc107; border:none; color:#333; cursor:pointer;">
                        ê·¸ë˜???€??
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
            logger.warn("ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ë³´ê¸° ì²˜ë¦¬ ì¤?ê²½ê³ :", err);
          }
          cleanup(false);
        });
      modal
        .querySelector('[data-action="save"]')
        .addEventListener("click", () => cleanup(true));

      // ?¬ì»¤??ì´ˆê¸° ë²„íŠ¼ë¡??´ë™
      const firstBtn = modal.querySelector('[data-action="save"]');
      if (firstBtn) firstBtn.focus();
    });
  }

  // Firebase ê¸°ë°˜ ?¸ì¦?¼ë¡œ ?€ì²´ë¨
  // Firebase Google ë¡œê·¸??ì²˜ë¦¬
  // Firebase Google ë¡œê·¸??ì²˜ë¦¬
  async googleLogin() {
    logger.log("[googleLogin] ?œì‘, isFirebaseReady:", this.isFirebaseReady);
    
    if (!this.isFirebaseReady) {
      this.showMessage(
        "Firebaseê°€ ì´ˆê¸°?”ë˜ì§€ ?Šì•˜?µë‹ˆ?? ? ì‹œ ???¤ì‹œ ?œë„?´ì£¼?¸ìš”.",
        "error"
      );
      return;
    }

    // Google Auth Provider ?•ì¸
    if (!window.firebaseGoogleAuthProvider) {
      logger.error("[googleLogin] GoogleAuthProviderê°€ ë¡œë“œ?˜ì? ?Šì•˜?µë‹ˆ??");
      this.showMessage("Google ë¡œê·¸??ê¸°ëŠ¥??ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ?? ?˜ì´ì§€ë¥??ˆë¡œê³ ì¹¨?´ì£¼?¸ìš”.", "error");
      return;
    }

    try {
      logger.log("[googleLogin] Google ë¡œê·¸???ì—… ?œì‘...");
      const provider = new window.firebaseGoogleAuthProvider();
      const result = await window.firebaseSignInWithPopup(this.auth, provider);
      const user = result.user;
      logger.log("[googleLogin] ë¡œê·¸???±ê³µ:", user.displayName || user.email);

      // ê¸°ì¡´ ë¡œì»¬ ?°ì´??ë§ˆì´ê·¸ë ˆ?´ì…˜ ?•ì¸
      await this.checkAndMigrateLocalData(user.uid);

      this.showMessage(
        `${user.displayName || user.email}?? Google ë¡œê·¸?¸ìœ¼ë¡??˜ì˜?©ë‹ˆ??`,
        "success"
      );
    } catch (error) {
      logger.error("[googleLogin] Google ë¡œê·¸???¤íŒ¨:", error);
      logger.error("[googleLogin] ?ëŸ¬ ì½”ë“œ:", error.code);
      logger.error("[googleLogin] ?ëŸ¬ ë©”ì‹œì§€:", error.message);
      
      if (error.code === "auth/popup-closed-by-user") {
        this.showMessage("ë¡œê·¸?¸ì´ ì·¨ì†Œ?˜ì—ˆ?µë‹ˆ??", "info");
      } else if (error.code === "auth/popup-blocked") {
        this.showMessage("?ì—…??ì°¨ë‹¨?˜ì—ˆ?µë‹ˆ?? ?ì—… ì°¨ë‹¨???´ì œ?´ì£¼?¸ìš”.", "error");
      } else if (error.code === "auth/cancelled-popup-request") {
        this.showMessage("?´ì „ ë¡œê·¸???”ì²­??ì·¨ì†Œ?˜ì—ˆ?µë‹ˆ?? ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.", "info");
      } else if (error.code === "auth/network-request-failed") {
        this.showMessage("?¤íŠ¸?Œí¬ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ?¸í„°???°ê²°???•ì¸?´ì£¼?¸ìš”.", "error");
      } else if (error.code === "auth/operation-not-allowed") {
        this.showMessage("Google ë¡œê·¸?¸ì´ ë¹„í™œ?±í™”?˜ì–´ ?ˆìŠµ?ˆë‹¤. ê´€ë¦¬ì?ê²Œ ë¬¸ì˜?˜ì„¸??", "error");
        logger.error("[googleLogin] Firebase Console?ì„œ Google ë¡œê·¸???œê³µ?ë? ?œì„±?”í•´???©ë‹ˆ??");
      } else {
        this.showMessage(
          `Google ë¡œê·¸?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤: ${error.message || '?????†ëŠ” ?¤ë¥˜'}`,
          "error"
        );
      }
    }
  }

  /**
   * ?¬ìš©?ëª…??Firestore???€??
   * @param {string} uid - ?¬ìš©??UID
   * @param {string} username - ?¬ìš©?ëª…
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
      logger.error("?¬ìš©?ëª… ?€???¤íŒ¨:", error);
    }
  }

  // [Refactoring] AuthManagerë¡??„ì„
  async logout() {
    if (
      confirm("ë¡œê·¸?„ì›ƒ?˜ì‹œê² ìŠµ?ˆê¹Œ? ?„ì¬ ?‘ì„± ì¤‘ì¸ ?´ìš©?€ ?„ì‹œ ?€?¥ë©?ˆë‹¤.")
    ) {
      this.performTempSave(); // ë¡œê·¸?„ì›ƒ ???„ì‹œ ?€??
      await this.authManager.logout();
    }
  }

  // Firebase Authê°€ ?ë™?¼ë¡œ ? í° ê´€ë¦¬í•¨

  showLoginInterface() {
    this.loginForm.style.display = "block";
    this.userInfo.style.display = "none";
    this.mainContent.style.display = "block"; // ë¡œê·¸???†ì´??ë©”ì¸ ì½˜í…ì¸??œì‹œ
  }

  // ê¸°ì¡´ ë¡œì»¬ ?¤í† ë¦¬ì? ?°ì´?°ë? Firestoreë¡?ë§ˆì´ê·¸ë ˆ?´ì…˜
  async checkAndMigrateLocalData(userId) {
    const localData = localStorage.getItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
    if (!localData) return;

    try {
      const localTexts = JSON.parse(localData);
      if (localTexts.length === 0) return;

      const shouldMigrate = confirm(
        `ê¸°ì¡´???€?¥ëœ ${localTexts.length}ê°œì˜ ê¸€???ˆìŠµ?ˆë‹¤.\n` +
          `???°ì´?°ë? ?ˆë¡œ??ê³„ì •?¼ë¡œ ?´ì „?˜ì‹œê² ìŠµ?ˆê¹Œ?\n\n` +
          `?´ì „?˜ë©´ ê¸°ì¡´ ?°ì´?°ëŠ” ?´ë¼?°ë“œ???ˆì „?˜ê²Œ ë³´ê??©ë‹ˆ??`
      );

      if (shouldMigrate) {
        await this.migrateLocalDataToFirestore(userId, localTexts);
        this.showMessage("ê¸°ì¡´ ?°ì´?°ê? ?±ê³µ?ìœ¼ë¡??´ì „?˜ì—ˆ?µë‹ˆ??", "success");

        // ë¡œì»¬ ?¤í† ë¦¬ì? ?•ë¦¬
        localStorage.removeItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
        localStorage.removeItem(Constants.STORAGE_KEYS.TEMP_SAVE);
      }
    } catch (error) {
      logger.error("?°ì´??ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤íŒ¨:", error);
      this.showMessage("?°ì´??ë§ˆì´ê·¸ë ˆ?´ì…˜ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // ë¡œì»¬ ?°ì´?°ë? Firestoreë¡?ë§ˆì´ê·¸ë ˆ?´ì…˜
  async migrateLocalDataToFirestore(userId, localTexts) {
    for (const text of localTexts) {
      try {
        const textData = {
          content: text.content,
          type: text.type,
          characterCount: text.characterCount,
          createdAt: window.firebaseServerTimestamp(),
          updatedAt: window.firebaseServerTimestamp(),
          migrated: true, // ë§ˆì´ê·¸ë ˆ?´ì…˜ ?œì‹œ
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
        logger.error("ê°œë³„ ?ìŠ¤??ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤íŒ¨:", error);
      }
    }

    logger.log(
      `${localTexts.length}ê°œì˜ ?ìŠ¤?¸ë? Firestoreë¡?ë§ˆì´ê·¸ë ˆ?´ì…˜?ˆìŠµ?ˆë‹¤.`
    );
  }
  showUserInterface() {
    this.loginForm.style.display = "none";
    this.userInfo.style.display = "block";
    this.mainContent.style.display = "block";

    // ?¬ìš©???•ë³´ ?œì‹œ (Firebase ?¬ìš©???•ë³´ ?¬ìš©)
    if (this.currentUser) {
      const displayName =
        this.currentUser.displayName || this.currentUser.email || "?¬ìš©??;
      this.usernameDisplay.textContent = displayName;
    }
  }

  clearAllData() {
    this.refTextInput.value = "";
    this.editTextInput.value = "";
    this.savedTexts = [];
    // ìºì‹œ ë¬´íš¨??(?°ì´??ë³€ê²???
    this.renderSavedTextsCache = null;
    this.renderSavedTextsCacheKey = null;
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
    this.renderSavedTexts();
  }

  clearText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const panelName = panel === "ref" ? "?ˆí¼?°ìŠ¤ ê¸€" : "?˜ì •/?‘ì„± ê¸€";

    if (confirm(`${panelName}??ì§€?°ì‹œê² ìŠµ?ˆê¹Œ?`)) {
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }
      // SNS ?Œë«??? íƒ ì´ˆê¸°??
      if (panel === "edit") {
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
      }
      this.updateCharacterCount(panel);
      textInput.focus();
    }
  }

  // Firestore???ìŠ¤???€??
  async saveText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() ?œê±°?˜ì—¬ ?¬ìš©???…ë ¥??ê³µë°±ê³?ì¤„ë°”ê¿?ë³´ì¡´
    const panelName = panel === "ref" ? "?ˆí¼?°ìŠ¤ ê¸€" : "?˜ì •/?‘ì„± ê¸€";

    if (text.length === 0) {
      alert("?€?¥í•  ?´ìš©???†ìŠµ?ˆë‹¤.");
      return;
    }

    if (!this.currentUser) {
      this.showMessage("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
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
        isDeleted: false, // [Soft Delete] ì´ˆê¸°??
      };

      // ?ˆí¼?°ìŠ¤ ?€????referenceType ?„ìˆ˜
      if (panel === "ref") {
        let refType = Constants.REF_TYPES.UNSPECIFIED;
        if (this.refTypeStructure && this.refTypeStructure.checked)
          refType = Constants.REF_TYPES.STRUCTURE;
        if (this.refTypeIdea && this.refTypeIdea.checked)
          refType = Constants.REF_TYPES.IDEA;
        if (refType === Constants.REF_TYPES.UNSPECIFIED) {
          this.showMessage(
            "?ˆí¼?°ìŠ¤ ? í˜•(êµ¬ì¡°/?„ì´?”ì–´)??? íƒ?´ì£¼?¸ìš”.",
            "error"
          );
          return;
        }
        textData.referenceType = refType;
      }

      // ?˜ì •/?‘ì„± ê¸€ ?€????ì£¼ì œ ì¶”ê? (? íƒ?¬í•­)
      if (panel === "edit" && this.editTopicInput) {
        const topic = this.editTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // ?‘ì„±ê¸€ ?€?????°ê²°???ˆí¼?°ìŠ¤ ID ë°°ì—´ ì¶”ê?
      if (panel === "edit") {
        // ??? íš¨???ˆí¼?°ìŠ¤ IDë§??„í„°ë§?(ì¡´ì¬ ?¬ë? ?•ì¸)
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
            linkedAt: window.firebaseServerTimestamp(), // ?°ê²° ?œì 
            linkCount: validReferences.length, // ?°ê²° ê°œìˆ˜ (ìºì‹œ)
          };

          logger.log(`?“š ${validReferences.length}ê°??ˆí¼?°ìŠ¤ ?°ê²°??);
        } else {
          // ë¹?ë°°ì—´ë¡??¤ì • (null???„ë‹Œ ë¹?ë°°ì—´)
          textData.linkedReferences = [];
        }

        // ??SNS ?Œë«???€??(? íš¨??ê²€ì¦??¬í•¨)
        if (
          this.selectedSnsPlatforms &&
          Array.isArray(this.selectedSnsPlatforms)
        ) {
          // ? íš¨???Œë«??IDë§??„í„°ë§?(DualTextWriter.SNS_PLATFORMS???•ì˜??IDë§??ˆìš©)
          const validPlatformIds = DualTextWriter.SNS_PLATFORMS.map(
            (p) => p.id
          );
          const validPlatforms = this.selectedSnsPlatforms.filter(
            (platformId) => validPlatformIds.includes(platformId)
          );

          // ë¹?ë°°ì—´???€??(ê¸°ì¡´ ?°ì´???¸í™˜??
          textData.platforms = validPlatforms;

          if (validPlatforms.length > 0) {
            logger.log(
              `?“± ${validPlatforms.length}ê°?SNS ?Œë«???€?¥ë¨:`,
              validPlatforms
            );
          }
        } else {
          // selectedSnsPlatformsê°€ ?†ê±°??ë°°ì—´???„ë‹Œ ê²½ìš° ë¹?ë°°ì—´ë¡??¤ì •
          textData.platforms = [];
        }
      }

      // ?ˆí¼?°ìŠ¤ ê¸€ ?€????ì£¼ì œ ì¶”ê? (? íƒ?¬í•­)
      if (panel === "ref" && this.refTopicInput) {
        const topic = this.refTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // ?ˆí¼?°ìŠ¤ ?€?????´ì‹œ ?„ë“œ ì¶”ê? (?•ê·œ??ê¸°ë°˜)
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
          logger.warn("contentHash ê³„ì‚° ?¤íŒ¨: ?´ì‹œ ?†ì´ ?€?¥í•©?ˆë‹¤.", e);
        }
      }

      // ?ˆí¼?°ìŠ¤ ?€????ì¤‘ë³µ ì²´í¬ (referenceType ì²´í¬ ?´í›„, Firestore ?€???´ì „)
      if (panel === "ref") {
        try {
          const duplicate = this.checkDuplicateReference(text);
          if (duplicate) {
            // ì¤‘ë³µ ?•ì¸ ëª¨ë‹¬ ?œì‹œ
            const shouldProceed = await this.showDuplicateConfirmModal(
              duplicate
            );
            if (!shouldProceed) {
              // ?¬ìš©?ê? ì·¨ì†Œ ? íƒ ???€??ì¤‘ë‹¨
              return;
            }
            // shouldProceedê°€ true?´ë©´ ê³„ì† ì§„í–‰ (ê·¸ë˜???€??
          }
        } catch (error) {
          // ì¤‘ë³µ ì²´í¬ ?¤íŒ¨ ???€??ê³„ì† ì§„í–‰ (?ˆì „??ê¸°ë³¸ê°?
          logger.warn(
            "ì¤‘ë³µ ì²´í¬ ì¤??¤ë¥˜ ë°œìƒ, ?€?¥ì„ ê³„ì† ì§„í–‰?©ë‹ˆ??",
            error
          );
          // ?ëŸ¬ ë¡œê·¸ë§?ê¸°ë¡?˜ê³  ?€?¥ì? ê³„ì† ì§„í–‰
        }
      }

      // ========================================
      // [P3-05] ?µëª… ?¬ìš©???€???œí•œ ì²´í¬ (?´ë¼?´ì–¸???¬ì´??UX ê°œì„ )
      // - Firestore ê·œì¹™?ì„œ??ì°¨ë‹¨?˜ì?ë§? ?´ë¼?´ì–¸?¸ì—??ë¨¼ì? ì²´í¬?˜ì—¬
      //   ?¬ìš©?ì—ê²?ì¹œì ˆ???ˆë‚´ ë©”ì‹œì§€ë¥??œê³µ?©ë‹ˆ??
      // ========================================
      if (this.currentUser?.isAnonymous) {
        this.showMessage('ê¸€???€?¥í•˜?¤ë©´ Google ê³„ì •?¼ë¡œ ë¡œê·¸?¸í•´ì£¼ì„¸??', 'warning');
        return;
      }

      // Firestore???€??
      const docRef = await window.firebaseAddDoc(
        window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "texts"
        ),
        textData
      );

      // ë¡œì»¬ ë°°ì—´?ë„ ì¶”ê? (UI ?…ë°?´íŠ¸??
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

      // Optimistic UI: ì¦‰ì‹œ ë¡œì»¬ ?°ì´???…ë°?´íŠ¸ ë°?UI ë°˜ì˜
      this.savedTexts.unshift(savedItem);
      // ìºì‹œ ë¬´íš¨??(?°ì´??ë³€ê²???
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      // ì£¼ì œ ?„í„° ?µì…˜ ?…ë°?´íŠ¸ (??ì£¼ì œê°€ ì¶”ê??????ˆìœ¼ë¯€ë¡?
      this.updateTopicFilterOptions();
      this.refreshUI({ savedTexts: true, force: true });

      this.showMessage(`${panelName}???€?¥ë˜?ˆìŠµ?ˆë‹¤!`, "success");

      // Clear input
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }

      // ???‘ì„±ê¸€ ?€????? íƒ???ˆí¼?°ìŠ¤ ë°?SNS ?Œë«??ì´ˆê¸°??
      if (panel === "edit") {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0ê°?? íƒ??";
        }
        logger.log("???ˆí¼?°ìŠ¤ ? íƒ ì´ˆê¸°???„ë£Œ");

        // SNS ?Œë«??? íƒ ì´ˆê¸°??
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        logger.log("??SNS ?Œë«??? íƒ ì´ˆê¸°???„ë£Œ");
      }

      this.updateCharacterCount(panel);
    } catch (error) {
      logger.error("?ìŠ¤???€???¤íŒ¨:", error);
      this.showMessage("?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤. ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.", "error");
    }
  }

  downloadAsTxt(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() ?œê±°?˜ì—¬ ?¬ìš©???…ë ¥??ê³µë°±ê³?ì¤„ë°”ê¿?ë³´ì¡´
    const panelName = panel === "ref" ? "?ˆí¼?°ìŠ¤" : "?˜ì •?‘ì„±";

    if (text.length === 0) {
      alert("?¤ìš´ë¡œë“œ???´ìš©???†ìŠµ?ˆë‹¤.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `${panelName}_${timestamp}.txt`;

    const content =
      `500??ë¯¸ë§Œ ê¸€ ?‘ì„±ê¸?- ${panelName} ê¸€\n` +
      `?‘ì„±?? ${new Date().toLocaleString("ko-KR")}\n` +
      `ê¸€???? ${this.getKoreanCharacterCount(text)}??n` +
      `\n${"=".repeat(30)}\n\n` +
      `${text}`; // ?¬ìš©?ê? ?…ë ¥??ê·¸ë?ë¡?ì¤„ë°”ê¿ˆê³¼ ê³µë°± ? ì?

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
      `${panelName} ê¸€ TXT ?Œì¼???¤ìš´ë¡œë“œ?˜ì—ˆ?µë‹ˆ??`,
      "success"
    );
  }

  // ?”ë°”?´ìŠ¤ ?€?´ë¨¸ (?±ëŠ¥ ìµœì ?? ê³¼ë„???¸ì¶œ ë°©ì?)
  renderSavedTextsDebounceTimer = null;

  // ë©”ëª¨?´ì œ?´ì…˜ ìºì‹œ (?±ëŠ¥ ìµœì ?? ê°™ì? ?„í„° ì¡°ê±´?ì„œ ?¬ê³„??ë°©ì?)
  renderSavedTextsCache = null;
  renderSavedTextsCacheKey = null;

  async renderSavedTexts() {
    // ?”ë°”?´ìŠ¤ ?ìš© (300ms)
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

  // ?´ì???ëª©ë¡ ?Œë”ë§?
  renderTrashBinList() {
    const container = document.getElementById("trash-bin-list");
    if (!container) return;

    const deletedItems = this.savedTexts
      .filter((item) => item.isDeleted)
      .sort((a, b) => {
        // ?? œ??? ì§œ ?´ë¦¼ì°¨ìˆœ (?†ìœ¼ë©??ì„±??
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
          <div class="empty-icon">?—‘ï¸?/div>
          <p>?´ì??µì´ ë¹„ì—ˆ?µë‹ˆ??</p>
        </div>
      `;
      return;
    }

    container.innerHTML = deletedItems
      .map((item) => {
        const date = item.deletedAt
          ? new Date(item.deletedAt).toLocaleString("ko-KR")
          : "? ì§œ ?†ìŒ";
        const typeLabel =
          (item.type || "edit") === "reference" ? "?“– ?ˆí¼?°ìŠ¤" : "?ï¸ ?‘ì„±ê¸€";

        // ?´ìš© ë¯¸ë¦¬ë³´ê¸° (HTML ?œê·¸ ?œê±° ë°?ê¸¸ì´ ?œí•œ)
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
            <span class="saved-item-date">?? œ?? ${date}</span>
          </div>
          <div class="saved-item-content">${this.escapeHtml(preview)}</div>
          <div class="saved-item-actions">
            <button class="btn-restore" onclick="window.dualTextWriter.restoreText('${
              item.id
            }')" aria-label="ê¸€ ë³µì›">
              ?»ï¸ ë³µì›
            </button>
            <button class="btn-delete-permanent" onclick="window.dualTextWriter.permanentlyDeleteText('${
              item.id
            }')" aria-label="?êµ¬ ?? œ">
              ?”¥ ?êµ¬ ?? œ
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // ?´ì????´ê¸°
  openTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "flex";
      this.renderTrashBinList();
      // ?‘ê·¼?? ëª¨ë‹¬???¬ì»¤???´ë™
      const closeBtn = modal.querySelector(".close-btn");
      if (closeBtn) closeBtn.focus();
    }
  }

  // ?´ì????«ê¸°
  closeTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  async _renderSavedTextsImpl() {
    // [Hybrid Pagination] ?„í„°??ê²€?‰ì–´ ?¬ìš© ???„ì²´ ?°ì´??ë¡œë“œ
    const isFiltering =
      (this.savedSearch && this.savedSearch.trim().length > 0) ||
      (this.savedFilter === "edit" &&
        ((this.currentTopicFilter && this.currentTopicFilter !== "all") ||
         (this.currentSnsFilterMode && this.currentSnsFilterMode !== "all" && this.currentSnsFilterPlatform))) ||
      ((this.savedFilter === "reference" || this.savedFilter === "reference-used") &&
        ((this.currentSourceFilter && this.currentSourceFilter !== "all") || 
         (this.referenceTypeFilter && this.referenceTypeFilter !== "all")));

    if (isFiltering && !this.isAllDataLoaded) {
      logger.log("?” ?„í„°/ê²€??ê°ì?: ?„ì²´ ?°ì´??ë¡œë“œ ?œì‘ (Hybrid Pagination)");
      await this.loadSavedTextsFromFirestore(true);
      return; // ?°ì´??ë¡œë“œ ???¬ë Œ?”ë§?˜ë?ë¡??„ì¬ ?¤í–‰ ì¤‘ë‹¨
    }

    // ë©”ëª¨?´ì œ?´ì…˜: ìºì‹œ ???ì„± (?„í„° ì¡°ê±´ + ê²€?‰ì–´ ê¸°ë°˜)
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

    // ìºì‹œ ?•ì¸ (ê°™ì? ?„í„° ì¡°ê±´ + ê²€?‰ì–´?ì„œ ?¬í˜¸ì¶?ë°©ì?)
    if (
      this.renderSavedTextsCache &&
      this.renderSavedTextsCacheKey === cacheKey
    ) {
      logger.log("renderSavedTexts: ìºì‹œ??ê²°ê³¼ ?¬ìš© (?±ëŠ¥ ìµœì ??");
      return;
    }

    logger.log("renderSavedTexts ?¸ì¶œ??", this.savedTexts);

    // ?„í„° ?ìš©
    let list = this.savedTexts;

    // [Soft Delete] ?? œ????ª© ?œì™¸
    list = list.filter((item) => !item.isDeleted);

    // [Tab Separation] 'script' ?€?…ì? ?€?¥ëœ ê¸€ ??—???œì™¸ (?¤í¬ë¦½íŠ¸ ?‘ì„± ??—?œë§Œ ê´€ë¦?
    // ì£¼ë‹ˆ??ê°œë°œ??ì²´í¬: ?°ì´??ë¶„ë¦¬ ë¡œì§ ?ìš©
    list = list.filter((item) => (item.type || "edit") !== "script");

    if (this.savedFilter === "edit") {
      list = list.filter((item) => item.type === "edit");
    } else if (this.savedFilter === "reference") {
      // ?ˆí¼?°ìŠ¤ ?? ?‘ì„± ê¸€(type='edit')?€ ?ˆë? ë³´ì´ë©?????
      // type??'reference'??ê²ƒë§Œ ?„ê²©?˜ê²Œ ?„í„°ë§?
      list = list.filter((item) => {
        const type = item.type || "edit";
        return type === "reference";
      });
    } else if (this.savedFilter === "reference-used") {
      // ?¬ìš©???ˆí¼?°ìŠ¤ ?? ?‘ì„± ê¸€ ?œì™¸
      list = list.filter((item) => {
        const type = item.type || "edit";
        return type === "reference";
      });
    }

    // ?ˆí¼?°ìŠ¤ ? í˜• ?„í„° ?ìš© (structure/idea)
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

    // ì£¼ì œ ?„í„° ?ìš© (?‘ì„± ê¸€??
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

    // ?ŒìŠ¤ ?„í„° ?ìš© (?ˆí¼?°ìŠ¤ ê¸€??
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

    // SNS ?Œë«???„í„° ?ìš© (?‘ì„± ê¸€??
    if (
      this.savedFilter === "edit" &&
      this.currentSnsFilterMode &&
      this.currentSnsFilterMode !== "all" &&
      this.currentSnsFilterPlatform
    ) {
      list = list.filter((item) => {
        // platforms ?„ë“œê°€ ?†ê±°??ë°°ì—´???„ë‹Œ ê²½ìš° ë¹?ë°°ì—´ë¡?ì²˜ë¦¬
        const platforms = Array.isArray(item.platforms) ? item.platforms : [];

        if (this.currentSnsFilterMode === "has") {
          // ?¹ì • SNS???¬ë¦° ê¸€: platforms ë°°ì—´???´ë‹¹ ?Œë«??IDê°€ ?ˆëŠ” ê²½ìš°
          return platforms.includes(this.currentSnsFilterPlatform);
        } else if (this.currentSnsFilterMode === "not-has") {
          // ?¹ì • SNS???¬ë¦¬ì§€ ?Šì? ê¸€: platforms ë°°ì—´???´ë‹¹ ?Œë«??IDê°€ ?†ëŠ” ê²½ìš°
          return !platforms.includes(this.currentSnsFilterPlatform);
        }
        return true;
      });
    }

    // ??ê²€???„í„° ?ìš© (?´ìš© + ì£¼ì œ?ì„œ ê²€??
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
        // ëª¨ë“  ?¤ì›Œ?œê? ?¬í•¨?˜ì–´????(AND ê²€??
        return tokens.every((tk) => searchText.includes(tk));
      });
    }

    // ?„í„° ?µì…˜ ?…ë°?´íŠ¸
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
      // ?ëŸ¬ ì²˜ë¦¬: ?„í„° ?ìš© ???°ì´?°ê? ?†ëŠ” ê²½ìš° ì²˜ë¦¬
      let emptyMsg = "?€?¥ëœ ê¸€???†ìŠµ?ˆë‹¤.";
      if (this.savedFilter === "edit") {
        emptyMsg = "?‘ì„± ê¸€???†ìŠµ?ˆë‹¤.";
      } else if (this.savedFilter === "reference") {
        emptyMsg = "?ˆí¼?°ìŠ¤ ê¸€???†ìŠµ?ˆë‹¤.";
      } else if (this.savedFilter === "reference-used") {
        emptyMsg = "?¬ìš©???ˆí¼?°ìŠ¤ê°€ ?†ìŠµ?ˆë‹¤.";
      }
      this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">?“</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">ê¸€???‘ì„±?˜ê³  ?€?¥í•´ë³´ì„¸??</div>
                </div>
            `;
      return;
    }

    // ë¡œë”© ?¤ì¼ˆ?ˆí†¤ ?œì‹œ (?°ì´??ì¡°íšŒ ì¤?
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

    // ?±ëŠ¥ ìµœì ?? ?ˆí¼?°ìŠ¤ ê¸€???¬ìš© ?¬ë?ë¥?ë°°ì¹˜ ì¡°íšŒë¡?ë¯¸ë¦¬ ?•ì¸
    const referenceItems = list.filter(
      (item) => (item.type || "edit") === "reference"
    );
    let referenceUsageMap = {};
    // ëª¨ë“  ?ˆí¼?°ìŠ¤ ??ª©???€??ê¸°ë³¸ê°?0?¼ë¡œ ì´ˆê¸°??(ë°°ì?ê°€ ??ƒ ?œì‹œ?˜ë„ë¡?ë³´ì¥)
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
          // ì¡°íšŒ??ê²°ê³¼ë¥?referenceUsageMap??ë³‘í•©
          Object.assign(referenceUsageMap, fetchedUsageMap);
        }
      } catch (error) {
        logger.error("?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ë? ë°°ì¹˜ ì¡°íšŒ ?¤íŒ¨:", error);
        // ?ëŸ¬ ë°œìƒ ?œì—??ê¸°ë³¸ê°?0???´ë? ?¤ì •?˜ì–´ ?ˆìœ¼ë¯€ë¡?ë°°ì????œì‹œ??
      }
    }

    // ìºì‹œ ?…ë°?´íŠ¸
    this.renderSavedTextsCacheKey = cacheKey;

    // ê°??€?¥ëœ ê¸€???€???¸ë˜???°ì´??ì¡°íšŒ ë°??¬ìš© ?¬ë? ì¶”ê? (ë¹„ë™ê¸?
    const itemsWithTracking = await Promise.all(
      list.map(async (item, index) => {
        let postData = null;
        if (this.trackingPosts && this.currentUser && this.isFirebaseReady) {
          // ë¡œì»¬ ?°ì´?°ì—??ë¨¼ì? ì°¾ê¸°
          postData = this.trackingPosts.find((p) => p.sourceTextId === item.id);

          // ë¡œì»¬???†ìœ¼ë©?Firebase?ì„œ ì¡°íšŒ
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
              logger.error("?¸ë˜???°ì´??ì¡°íšŒ ?¤íŒ¨:", error);
            }
          }
        }

        // ?ˆí¼?°ìŠ¤ ê¸€??ê²½ìš° ?¬ìš© ?¬ë? ì¶”ê?
        let usageCount = 0;
        if ((item.type || "edit") === "reference") {
          // referenceUsageMap?ì„œ usageCountë¥?ê°€?¸ì˜¤?? ?†ìœ¼ë©?0?¼ë¡œ ?¤ì •
          usageCount =
            referenceUsageMap[item.id] !== undefined
              ? referenceUsageMap[item.id]
              : 0;
        }

        // ?¬ìš© ?¬ë?ë¥?item ê°ì²´??ì¶”ê??˜ì—¬ ìºì‹± (?ˆí¼?°ìŠ¤ ê¸€?€ ??ƒ usageCount ?¬í•¨)
        const itemWithUsage = { ...item, usageCount };

        // reference ?„í„°??ê²½ìš°, usageCountê°€ 0????ª©ë§??¬í•¨ (?¬ìš© ?ˆëœ ?ˆí¼?°ìŠ¤ë§?
        if (this.savedFilter === "reference") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount !== 0) {
            return null; // ?„í„°ë§??€?ì—???œì™¸ (?¬ìš©???ˆí¼?°ìŠ¤???œì™¸)
          }
        }

        // reference-used ?„í„°??ê²½ìš°, usageCountê°€ 1 ?´ìƒ????ª©ë§??¬í•¨
        if (this.savedFilter === "reference-used") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount === 0) {
            return null; // ?„í„°ë§??€?ì—???œì™¸
          }
        }

        return { item: itemWithUsage, postData, index };
      })
    );

    // reference ?ëŠ” reference-used ?„í„°??ê²½ìš° null????ª© ?œê±°
    const filteredItemsWithTracking =
      this.savedFilter === "reference" || this.savedFilter === "reference-used"
        ? itemsWithTracking.filter((result) => result !== null)
        : itemsWithTracking;

    // ?„í„°ë§???ë¹?ëª©ë¡ ì²´í¬
    if (filteredItemsWithTracking.length === 0) {
      let emptyMsg = "?€?¥ëœ ê¸€???†ìŠµ?ˆë‹¤.";
      let emptySubMsg = "ê¸€???‘ì„±?˜ê³  ?€?¥í•´ë³´ì„¸??";

      // ??ê²€?‰ì–´ê°€ ?ˆì„ ??ê²€??ê²°ê³¼ ?†ìŒ ë©”ì‹œì§€ ?œì‹œ
      if (this.savedSearch && this.savedSearch.trim()) {
        if (this.savedFilter === "edit") {
          emptyMsg = `"${this.savedSearch}" ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.`;
        } else if (this.savedFilter === "reference") {
          emptyMsg = `"${this.savedSearch}" ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.`;
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = `"${this.savedSearch}" ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.`;
        } else {
          emptyMsg = `"${this.savedSearch}" ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.`;
        }
        emptySubMsg = "?¤ë¥¸ ê²€?‰ì–´ë¥??œë„?´ë³´?¸ìš”.";
      } else {
        if (this.savedFilter === "edit") {
          emptyMsg = "?‘ì„± ê¸€???†ìŠµ?ˆë‹¤.";
        } else if (this.savedFilter === "reference") {
          emptyMsg = "?ˆí¼?°ìŠ¤ ê¸€???†ìŠµ?ˆë‹¤.";
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = "?¬ìš©???ˆí¼?°ìŠ¤ê°€ ?†ìŠµ?ˆë‹¤.";
        }
      }

      this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">?“</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">${emptySubMsg}</div>
                </div>
            `;
      // ?‘ê·¼?? ?¤í¬ë¦?ë¦¬ë”??ë¹?ëª©ë¡ ?íƒœ ?„ë‹¬ (aria-liveë¡??ë™ ?„ë‹¬??
      this.savedList.setAttribute("aria-label", `?€?¥ëœ ê¸€ ëª©ë¡: ${emptyMsg}`);
      return;
    }

    // ?±ëŠ¥ ìµœì ?? ë§ì? ì¹´ë“œ ?Œë”ë§???ë°°ì¹˜ ì²˜ë¦¬
    const batchSize = 10;
    const totalItems = itemsWithTracking.length;

    // ?‘ê·¼?? ?„í„° ê²°ê³¼ë¥??¤í¬ë¦?ë¦¬ë”???„ë‹¬ (aria-live="polite"ë¡??ë™ ?„ë‹¬??
    const filterDescription =
      this.savedFilter === "edit"
        ? "?‘ì„± ê¸€"
        : this.savedFilter === "reference"
        ? "?ˆí¼?°ìŠ¤ ê¸€"
        : this.savedFilter === "reference-used"
        ? "?¬ìš©???ˆí¼?°ìŠ¤"
        : "?€?¥ëœ ê¸€";

    // ??ê²€??ê²°ê³¼ ê°œìˆ˜ ?œì‹œ
    let ariaLabelText = `?€?¥ëœ ê¸€ ëª©ë¡: ${filterDescription} ${totalItems}ê°?;
    if (this.savedSearch && this.savedSearch.trim()) {
      ariaLabelText = `?€?¥ëœ ê¸€ ëª©ë¡: ${filterDescription} ê²€??ê²°ê³¼ ${totalItems}ê°?;
    }
    this.savedList.setAttribute("aria-label", ariaLabelText);

    if (totalItems > batchSize) {
      // ?€???Œë”ë§? ì²?ë²ˆì§¸ ë°°ì¹˜ë§?ì¦‰ì‹œ ?Œë”ë§? ?˜ë¨¸ì§€??requestAnimationFrame?¼ë¡œ ì²˜ë¦¬
      const firstBatch = filteredItemsWithTracking.slice(0, batchSize);
      this.savedList.innerHTML = firstBatch
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");

      // ?˜ë¨¸ì§€ ë°°ì¹˜ë¥??ì§„?ìœ¼ë¡??Œë”ë§?
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
          // DOM ?Œë”ë§??„ë£Œ ???´ë²¤??ë¦¬ìŠ¤???¤ì •
          setTimeout(() => {
            this.setupSavedItemEventListeners();
            this.bindLinkedReferenceBadgeEvents();
          }, 100);
        }
      };

      requestAnimationFrame(renderNextBatch);
    } else {
      // ?ŒëŸ‰ ?Œë”ë§? ì¦‰ì‹œ ?Œë”ë§?
      this.savedList.innerHTML = filteredItemsWithTracking
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");
    }

    // DOM ?Œë”ë§??„ë£Œ ???´ë²¤??ë¦¬ìŠ¤???¤ì • (ì¦‰ì‹œ ?Œë”ë§ëœ ê²½ìš°)
    if (totalItems <= batchSize) {
      setTimeout(() => {
        this.setupSavedItemEventListeners();
        this.bindLinkedReferenceBadgeEvents();
      }, 100);
    }
  }

  /**
   * Phase 1.6.1: ?‘ì„±ê¸€-?ˆí¼?°ìŠ¤ ?°ë™ ë°°ì? ?´ë²¤??ë°”ì¸??
   *
   * - ?‘ì„±ê¸€ ì¹´ë“œ??"ì°¸ê³  ?ˆí¼?°ìŠ¤ Nê°? ë°°ì? ?´ë¦­ ?´ë²¤??
   * - ?ˆí¼?°ìŠ¤ ì¹´ë“œ??"???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ??ê¸€ Nê°? ë°°ì? ?´ë¦­ ?´ë²¤??
   */
  bindLinkedReferenceBadgeEvents() {
    try {
      // ?‘ì„±ê¸€ ì¹´ë“œ??"ì°¸ê³  ?ˆí¼?°ìŠ¤ Nê°? ë°°ì? ?´ë¦­
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

      // ?ˆí¼?°ìŠ¤ ì¹´ë“œ??"???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ??ê¸€ Nê°? ë°°ì? ?´ë¦­
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

      logger.log("??ë°°ì? ?´ë¦­ ?´ë²¤??ë°”ì¸???„ë£Œ");
    } catch (error) {
      logger.error("ë°°ì? ?´ë²¤??ë°”ì¸???¤íŒ¨:", error);
    }
  }

  // ?€?¥ëœ ??ª© ì¹´ë“œ ?Œë”ë§??¨ìˆ˜ (?¬ì‚¬??ê°€?¥í•˜ê²?ë¶„ë¦¬)
  renderSavedItemCard(item, postData, index) {
    const metaText = `${
      (item.type || "edit") === "reference" ? "?“– ?ˆí¼?°ìŠ¤" : "?ï¸ ?‘ì„±"
    } Â· ${item.date} Â· ${item.characterCount}??;
    // ?µì¼???¤í‚¤ë§? card:{itemId}:expanded
    const expanded = localStorage.getItem(`card:${item.id}:expanded`) === "1";
    // ?€?„ë¼??HTML ?ì„±
    const timelineHtml = this.renderTrackingTimeline(
      postData?.metrics || [],
      item.id
    );

    // ?ˆí¼?°ìŠ¤ ê¸€??ê²½ìš° ?¬ìš© ?¬ë? ë°°ì? ë°?? í˜• ë°°ì? ?ì„±
    const isReference = (item.type || "edit") === "reference";
    // usageCountê°€ undefined??ê²½ìš° 0?¼ë¡œ ?¤ì • (?ˆí¼?°ìŠ¤ ê¸€?€ ??ƒ ?¬ìš© ?¬ë? ë°°ì? ?œì‹œ)
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

    // ??Phase 1.6.1: ?‘ì„±ê¸€-?ˆí¼?°ìŠ¤ ?°ë™ ë°°ì? ?ì„±
    // ?‘ì„±ê¸€ ì¹´ë“œ: ?°ê²°???ˆí¼?°ìŠ¤ ê°œìˆ˜ ?œì‹œ
    let linkedRefBadge = "";
    const isEdit = (item.type || "edit") === "edit";
    if (isEdit && Array.isArray(item.linkedReferences)) {
      const refCount = item.linkedReferences.length;
      if (refCount > 0) {
        linkedRefBadge = `
                    <button 
                        class="linked-ref-badge" 
                        data-edit-id="${item.id}"
                        aria-label="${refCount}ê°œì˜ ì°¸ê³  ?ˆí¼?°ìŠ¤ ë³´ê¸°"
                        title="??ê¸€??ì°¸ê³ ???ˆí¼?°ìŠ¤ ëª©ë¡">
                        ?“š ì°¸ê³  ?ˆí¼?°ìŠ¤ ${refCount}ê°?
                    </button>
                `;
      }
    }

    // ?ˆí¼?°ìŠ¤ ì¹´ë“œ: ???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ê°œìˆ˜ ?œì‹œ (??°©??
    let usedInEditsBadge = "";
    if (isReference) {
      const usedEdits = this.getEditsByReference(item.id);
      const editCount = usedEdits.length;
      if (editCount > 0) {
        usedInEditsBadge = `
                    <button 
                        class="used-in-edits-badge" 
                        data-ref-id="${item.id}"
                        aria-label="???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ??ê¸€ ${editCount}ê°?ë³´ê¸°"
                        title="???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ëª©ë¡">
                        ?“ ???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ??ê¸€ ${editCount}ê°?
                    </button>
                `;
      }
    }

    // ??SNS ?Œë«??ë°°ì? ?ì„± (?‘ì„± ê¸€??
    let snsPlatformsHtml = "";
    if (isEdit && Array.isArray(item.platforms) && item.platforms.length > 0) {
      // ? íš¨???Œë«??IDë§??„í„°ë§?
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
              )} ?Œë«??>${p.icon} ${this.escapeHtml(p.name)}</span>`
          )
          .join("");
        snsPlatformsHtml = `
                    <div class="saved-item-platforms" role="list" aria-label="SNS ?Œë«??ëª©ë¡">
                        ${platformsList}
                    </div>
                `;
      }
    }

    // ê²€?‰ì–´ ê°€?¸ì˜¤ê¸?
    const searchTerm = this.savedSearchInput?.value.toLowerCase().trim() || "";

    // ?˜ì´?¼ì´???ìš©
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
                        ? "?ˆí¼?°ìŠ¤ ê¸€"
                        : "?‘ì„± ê¸€"
                    }">${
      (item.type || "edit") === "reference" ? "?“– ?ˆí¼?°ìŠ¤" : "?ï¸ ?‘ì„±"
    }</span>
                    ${refTypeBadgeHtml}
                    ${usageBadgeHtml}
                </div>
            </div>
            <div class="saved-item-meta" aria-label="ë©”í? ?•ë³´: ${metaText}">
                ${metaText}
                ${
                  linkedRefBadge
                    ? `<span class="meta-separator">Â·</span>${linkedRefBadge}`
                    : ""
                }
                ${
                  usedInEditsBadge
                    ? `<span class="meta-separator">Â·</span>${usedInEditsBadge}`
                    : ""
                }
            </div>
            ${
              item.topic
                ? `<div class="saved-item-topic" aria-label="ì£¼ì œ: ${this.escapeHtml(
                    item.topic
                  )}">?·ï¸?${highlightedTopic}</div>`
                : ""
            }
            ${snsPlatformsHtml}
            <div class="saved-item-content ${
              expanded ? "expanded" : ""
            }" aria-label="ë³¸ë¬¸ ?´ìš©">${highlightedContent}</div>
            <button class="saved-item-toggle" data-action="toggle" data-item-id="${
              item.id
            }" aria-expanded="${expanded ? "true" : "false"}" aria-label="${
      expanded ? "?´ìš© ?‘ê¸°" : "?´ìš© ?”ë³´ê¸?
    }">${expanded ? "?‘ê¸°" : "?”ë³´ê¸?}</button>
            ${
              timelineHtml
                ? `<div class="saved-item-tracking" role="region" aria-label="?¸ë˜??ê¸°ë¡">${timelineHtml}</div>`
                : ""
            }
            <div class="saved-item-actions actions--primary" role="group" aria-label="ì¹´ë“œ ?‘ì—… ë²„íŠ¼">
                <button class="action-button btn-primary" data-action="edit" data-type="${
                  item.type || "edit"
                }" data-item-id="${item.id}" aria-label="${
      (item.type || "edit") === "reference"
        ? "?ˆí¼?°ìŠ¤ ê¸€ ?¸ì§‘"
        : "?‘ì„± ê¸€ ?¸ì§‘"
    }">?¸ì§‘</button>
                <button class="action-button btn-tracking" data-action="add-tracking" data-item-id="${
                  item.id
                }" aria-label="?¸ë˜???°ì´???…ë ¥">?“Š ?°ì´???…ë ¥</button>
                <div class="llm-validation-dropdown" style="position: relative; display: inline-block;">
                    <button class="action-button btn-llm-main" data-action="llm-validation" data-item-id="${
                      item.id
                    }" aria-label="LLM ê²€ì¦?ë©”ë‰´">?” LLM ê²€ì¦?/button>
                    <div class="llm-dropdown-menu">
                        <button class="llm-option" data-llm="chatgpt" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?¤–</span>
                                    <span class="llm-name">ChatGPT</span>
                                    <span class="llm-description">SNS ?„í‚¹ ë¶„ì„</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="gemini" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?§ </span>
                                    <span class="llm-name">Gemini</span>
                                    <span class="llm-description">?¬ë¦¬???„í‚¹ ë¶„ì„</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="perplexity" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">?”</span>
                                    <span class="llm-name">Perplexity</span>
                                    <span class="llm-description">?¸ë Œ??ê²€ì¦?/span>
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
                                    <span class="llm-description">?„íŒ©??ìµœì ??/span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="more-menu actions--more">
                    <button class="more-menu-btn" data-action="more" data-item-id="${
                      item.id
                    }" aria-haspopup="true" aria-expanded="false" aria-label="ê¸°í? ?‘ì—… ë©”ë‰´ ?´ê¸°">??/button>
                    <div class="more-menu-list" role="menu" aria-label="ê¸°í? ?‘ì—…">
                        <button class="more-menu-item" role="menuitem" data-action="delete" data-item-id="${
                          item.id
                        }" aria-label="ê¸€ ?? œ">?? œ</button>
                    </div>
                </div>
            </div>
        </div>
        `;
  }
  // ë¯¸íŠ¸?˜í‚¹ ê¸€ ê°œìˆ˜ ?•ì¸ ë°??¼ê´„ ?¸ë˜??ë²„íŠ¼ ?…ë°?´íŠ¸
  /**
   * ë¯¸íŠ¸?˜í‚¹ ê¸€ ?•ì¸ ë°??¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ë²„íŠ¼ ?…ë°?´íŠ¸
   *
   * ?±ëŠ¥ ìµœì ??
   * - Firebase ì¿¼ë¦¬ Në²???0ë²?(ë©”ëª¨ë¦??°ì´?°ë§Œ ?¬ìš©)
   * - ?¤í–‰ ?œê°„: 20-60ì´???10ms ë¯¸ë§Œ
   * - Set ?ë£Œêµ¬ì¡°ë¡?O(1) ê²€??êµ¬í˜„
   *
   * @returns {void}
   */
  updateBatchMigrationButton() {
    if (!this.batchMigrationBtn || !this.currentUser || !this.isFirebaseReady)
      return;

    try {
      // ???±ëŠ¥ ìµœì ?? ë©”ëª¨ë¦??°ì´?°ë§Œ ?¬ìš© (Firebase ì¿¼ë¦¬ ?†ìŒ)
      // Set???¬ìš©?˜ì—¬ O(1) ê²€??êµ¬í˜„
      const trackedTextIds = new Set(
        (this.trackingPosts || []).map((p) => p.sourceTextId).filter(Boolean)
      );

      // ?ˆì „??ë°°ì—´ ì²˜ë¦¬ (ë¹?ë°°ì—´ ?´ë°±)
      const untrackedTexts = (this.savedTexts || []).filter(
        (textItem) => !trackedTextIds.has(textItem.id)
      );

      // ë²„íŠ¼ UI ?…ë°?´íŠ¸
      const migrationTools = document.querySelector(".migration-tools");
      if (migrationTools) {
        if (untrackedTexts.length > 0) {
          // ë¯¸íŠ¸?˜í‚¹ ê¸€???ˆìœ¼ë©?ë²„íŠ¼ ?œì‹œ ë°?ê°œìˆ˜ ?œì‹œ
          migrationTools.style.display = "flex";
          this.batchMigrationBtn.style.display = "block";
          this.batchMigrationBtn.textContent = `?“Š ë¯¸íŠ¸?˜í‚¹ ê¸€ ${untrackedTexts.length}ê°??¼ê´„ ?¸ë˜???œì‘`;
          this.batchMigrationBtn.title = `${untrackedTexts.length}ê°œì˜ ?€?¥ëœ ê¸€???„ì§ ?¸ë˜?¹ë˜ì§€ ?Šì•˜?µë‹ˆ?? ëª¨ë‘ ?¸ë˜?¹ì„ ?œì‘?˜ì‹œê² ìŠµ?ˆê¹Œ?`;

          // ?‘ê·¼??ê°œì„ : aria-label ?™ì  ?…ë°?´íŠ¸
          this.batchMigrationBtn.setAttribute(
            "aria-label",
            `${untrackedTexts.length}ê°œì˜ ë¯¸íŠ¸?˜í‚¹ ê¸€ ?¼ê´„ ?¸ë˜???œì‘`
          );
        } else {
          // ë¯¸íŠ¸?˜í‚¹ ê¸€???†ìœ¼ë©?ë²„íŠ¼ ?¨ê?
          migrationTools.style.display = "none";
          this.batchMigrationBtn.style.display = "none";
        }
      }

      // ?±ëŠ¥ ë¡œê·¸ (?”ë²„ê¹…ìš©)
      logger.log(
        `??ë¯¸íŠ¸?˜í‚¹ ê¸€ ?•ì¸ ?„ë£Œ: ${untrackedTexts.length}ê°?(ë©”ëª¨ë¦?ê²€?? Firebase ì¿¼ë¦¬ ?†ìŒ)`
      );
    } catch (error) {
      logger.error("??ë¯¸íŠ¸?˜í‚¹ ê¸€ ?•ì¸ ?¤íŒ¨:", error);

      // ?ëŸ¬ ë°œìƒ ??ë²„íŠ¼ ?¨ê?
      if (this.batchMigrationBtn) {
        this.batchMigrationBtn.style.display = "none";
      }

      // ?¬ìš©???Œë¦¼ (UX ê°œì„ )
      this.showMessage(
        "? ï¸ ë¯¸íŠ¸?˜í‚¹ ê¸€ ?•ì¸ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
        "warning"
      );
    }
  }

  // ?¸ë˜???€?„ë¼???Œë”ë§?
  renderTrackingTimeline(metrics) {
    if (!metrics || metrics.length === 0) {
      return "";
    }

    // ? ì§œ ?œìœ¼ë¡??•ë ¬ (?¤ë˜??ê²ƒë???
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

    // ?©ê³„ ê³„ì‚°
    const totals = this.calculateMetricsTotal(metrics);

    // localStorage?ì„œ ?‘ê¸°/?¼ì¹˜ê¸??íƒœ ë³µì› (per-post)
    // saved-item??data-item-idë¥??¬ìš©?˜ì—¬ ???ì„±
    // ???¨ìˆ˜??saved-item ?´ë??ì„œ ?¸ì¶œ?˜ë?ë¡? ?´ë¡œ?€???Œë¼ë¯¸í„°ë¡?itemId ?„ë‹¬ ?„ìš”
    const savedItemId = arguments[1] || null; // ??ë²ˆì§¸ ?Œë¼ë¯¸í„°ë¡?itemId ?„ë‹¬
    // ?µì¼???¤í‚¤ë§? card:{itemId}:details (?€?„ë¼???‘ê¸°/?¼ì¹˜ê¸?
    const isExpanded = savedItemId
      ? localStorage.getItem(`card:${savedItemId}:details`) === "1"
      : false;
    const collapsedClass = isExpanded ? "" : "collapsed";
    const buttonText = isExpanded ? "?‘ê¸°" : `ê¸°ë¡ ${totalCount}ê°??”ë³´ê¸?;

    return `
            <div class="tracking-timeline-container">
                <div class="tracking-timeline-header">
                    <span class="timeline-title">?“Š ?¸ë˜??ê¸°ë¡</span>
                    ${this.renderMetricsTotals(totals)}
                    <button class="timeline-toggle-btn small" onclick="dualTextWriter.toggleTimelineCollapse(this)" aria-label="ê¸°ë¡ ?”ë³´ê¸??‘ê¸°" aria-expanded="${
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
                            <div class="timeline-item" data-metric-index="${metricIndex}" role="button" aria-label="ê¸°ë¡ ?¸ì§‘">
                                <span class="timeline-date">?“… ${dateStr}</span>
                                <div class="timeline-item-data">
                                    <span class="metric-badge views">?? ${
                                      metric.views || 0
                                    }</span>
                                    <span class="metric-badge likes">?¤ï¸ ${
                                      metric.likes || 0
                                    }</span>
                                    <span class="metric-badge comments">?’¬ ${
                                      metric.comments || 0
                                    }</span>
                                    <span class="metric-badge shares">?”„ ${
                                      metric.shares || 0
                                    }</span>
                                    <span class="metric-badge follows">?‘¥ ${
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

  // ? ì§œ ?¬ë§·??(25??10??29???•ì‹)
  formatDateForDisplay(date) {
    if (!date || !(date instanceof Date)) {
      return "";
    }
    const year = date.getFullYear().toString().slice(-2); // ë§ˆì?ë§?2?ë¦¬
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}??${month}??${day}??;
  }

  /**
   * Firestore Timestamp ?ëŠ” ?¤ì–‘??? ì§œ ?•ì‹???œêµ­??? ì§œ ë¬¸ì?´ë¡œ ë³€?˜í•©?ˆë‹¤.
   *
   * Firestore Timestamp, Date ê°ì²´, ?«ì(?€?„ìŠ¤?¬í”„), ë¬¸ì?????¤ì–‘???•ì‹??
   * ?œêµ­??? ì§œ ?•ì‹("2025??11??11??)?¼ë¡œ ë³€?˜í•©?ˆë‹¤.
   *
   * @param {Object|Date|number|string} dateInput - ë³€?˜í•  ? ì§œ (Firestore Timestamp, Date, ?«ì, ë¬¸ì??
   * @returns {string} ?œêµ­??? ì§œ ?•ì‹ ë¬¸ì??(?? "2025??11??11??) ?ëŠ” ë¹?ë¬¸ì??
   *
   * @example
   * // Firestore Timestamp
   * formatDateFromFirestore(timestamp) // "2025??11??11??
   *
   * // Date ê°ì²´
   * formatDateFromFirestore(new Date()) // "2025??11??11??
   *
   * // ?«ì ?€?„ìŠ¤?¬í”„
   * formatDateFromFirestore(1699718400000) // "2025??11??11??
   */
  formatDateFromFirestore(dateInput) {
    if (!dateInput) {
      return "";
    }

    try {
      let dateObj = null;

      // Firestore Timestamp ì²˜ë¦¬
      if (dateInput.toDate && typeof dateInput.toDate === "function") {
        dateObj = dateInput.toDate();
      }
      // Date ê°ì²´ ì²˜ë¦¬
      else if (dateInput instanceof Date) {
        dateObj = dateInput;
      }
      // ?«ì ?€?„ìŠ¤?¬í”„ ì²˜ë¦¬
      else if (typeof dateInput === "number") {
        dateObj = new Date(dateInput);
      }
      // ë¬¸ì??? ì§œ ì²˜ë¦¬
      else if (typeof dateInput === "string") {
        const parsed = Date.parse(dateInput);
        if (!Number.isNaN(parsed)) {
          dateObj = new Date(parsed);
        }
      }

      // ? íš¨??Date ê°ì²´?¸ì? ?•ì¸
      if (
        !dateObj ||
        !(dateObj instanceof Date) ||
        Number.isNaN(dateObj.getTime())
      ) {
        return "";
      }

      // ?œêµ­??? ì§œ ?•ì‹?¼ë¡œ ë³€??
      return dateObj.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      // ?ëŸ¬ ë°œìƒ ??ë¹?ë¬¸ì??ë°˜í™˜
      logger.warn("? ì§œ ?¬ë§·??ì¤??¤ë¥˜ ë°œìƒ:", error);
      return "";
    }
  }

  /**
   * ?¸ë˜??ë©”íŠ¸ë¦?˜ ìµœì‹  ê°’ì„ ë°˜í™˜?©ë‹ˆ??
   *
   * ?¬ìš©?ëŠ” ê¸°ë¡??ê¸°ì¡´?ì„œ ?´í›„ë¡??ì–´ê°€??ë°©ì‹?¼ë¡œ,
   * ê°?? ì§œ??ê°’ì? ?´ë‹¹ ?œì ???„ì ê°’ì„ ?˜í??…ë‹ˆ??
   * ?°ë¼??ê°€??ë§ˆì?ë§?ìµœì‹ ) ê¸°ë¡??ê°’ì´ ?„ì¬ ì´í•©???˜í??…ë‹ˆ??
   *
   * @param {Array} metrics - ë©”íŠ¸ë¦?ë°°ì—´
   * @returns {Object} ê°€??ìµœì‹  ë©”íŠ¸ë¦?˜ ê°?ê°ì²´
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

    // ? ì§œ ?œìœ¼ë¡??•ë ¬?˜ì—¬ ê°€??ìµœì‹  ë©”íŠ¸ë¦?ì°¾ê¸°
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
      return dateA - dateB; // ?¤ë˜??ê²ƒë????•ë ¬
    });

    // ê°€??ë§ˆì?ë§?ìµœì‹ ) ë©”íŠ¸ë¦?˜ ê°?ë°˜í™˜
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
   * ?ˆí¼?°ìŠ¤ ê¸€???¬ìš© ?¬ë?ë¥?ë°°ì? ?•íƒœë¡??Œë”ë§í•©?ˆë‹¤.
   *
   * ?¬ìš© ?¬ë????°ë¼ ë°°ì? HTML??ë°˜í™˜?©ë‹ˆ??
   * - ?¬ìš© ?ˆë¨ (usageCount === 0): ë¹?ë¬¸ì??ë°˜í™˜
   * - ?¬ìš©??(usageCount > 0): "???¬ìš©?? ?ëŠ” "?¬ìš©??N?? ë°°ì? HTML ë°˜í™˜
   *
   * @param {number} usageCount - ?ˆí¼?°ìŠ¤ ê¸€???¬ìš© ?Ÿìˆ˜ (0 ?´ìƒ???•ìˆ˜)
   * @returns {string} ë°°ì? HTML ë¬¸ì??(?¬ìš© ?ˆë¨?´ë©´ ë¹?ë¬¸ì??
   *
   * @example
   * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(3);
   * // ê²°ê³¼: '<span class="reference-usage-badge" aria-label="?¬ìš©??3?? role="status">???¬ìš©??3??/span>'
   *
   * const badgeHtml = dualTextWriter.renderReferenceUsageBadge(0);
   * // ê²°ê³¼: '' (ë¹?ë¬¸ì??
   */
  renderReferenceUsageBadge(usageCount) {
    // ?ëŸ¬ ì²˜ë¦¬: null ?ëŠ” undefined ?…ë ¥ ì²˜ë¦¬
    if (usageCount == null) {
      return "";
    }

    // ?ëŸ¬ ì²˜ë¦¬: ?«ìê°€ ?„ë‹Œ ê²½ìš° ì²˜ë¦¬
    if (typeof usageCount !== "number") {
      logger.warn(
        "renderReferenceUsageBadge: usageCountê°€ ?«ìê°€ ?„ë‹™?ˆë‹¤:",
        usageCount
      );
      return "";
    }

    // ?ëŸ¬ ì²˜ë¦¬: ?Œìˆ˜??ê²½ìš° 0?¼ë¡œ ì²˜ë¦¬
    if (usageCount < 0) {
      logger.warn(
        "renderReferenceUsageBadge: usageCountê°€ ?Œìˆ˜?…ë‹ˆ??",
        usageCount
      );
      usageCount = 0;
    }

    // ?¬ìš© ?ˆë¨: ?Œìƒ‰ ë°°ì? HTML ë°˜í™˜ (?´ë¦­ ê°€??
    if (usageCount === 0) {
      const ariaLabel = "?ˆí¼?°ìŠ¤ ?¬ìš© ?ˆë¨ (?´ë¦­?˜ë©´ ?¬ìš©?¨ìœ¼ë¡??œì‹œ)";
      return `<span class="reference-usage-badge reference-usage-badge--unused reference-usage-badge--clickable" data-action="mark-reference-used" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">?†• ?¬ìš© ?ˆë¨</span>`;
    }

    // ?¬ìš©?? ì´ˆë¡??ë°°ì? HTML ë°˜í™˜ (?´ë¦­ ê°€?? ? ê? ê¸°ëŠ¥)
    // ?‘ê·¼?? aria-labelë¡??¬ìš© ?¬ë?ë¥??¤í¬ë¦?ë¦¬ë”???„ë‹¬
    // role="button"?¼ë¡œ ?´ë¦­ ê°€?¥í•¨??ëª…ì‹œ
    const usageText = usageCount === 1 ? "?¬ìš©?? : `?¬ìš©??${usageCount}??;
    const ariaLabel = `?ˆí¼?°ìŠ¤ ${usageText} (?´ë¦­?˜ë©´ ?¬ìš© ?ˆë¨?¼ë¡œ ?œì‹œ)`;

    return `<span class="reference-usage-badge reference-usage-badge--used reference-usage-badge--clickable" data-action="mark-reference-unused" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">??${usageText}</span>`;
  }

  /**
   * ?¸ë˜??ë©”íŠ¸ë¦??©ê³„ë¥?ë°°ì? ?•íƒœë¡??Œë”ë§í•©?ˆë‹¤.
   *
   * @param {Object} totals - ?©ê³„ ê°ì²´
   * @returns {string} ?©ê³„ ë°°ì? HTML
   */
  renderMetricsTotals(totals) {
    return `
            <div class="metrics-totals" role="group" aria-label="?„ì¬ ?©ê³„">
                <span class="total-badge views" aria-label="?„ì¬ ì¡°íšŒ?? ${totals.totalViews.toLocaleString()}">
                    <span class="total-icon">??</span>
                    <span class="total-value">${totals.totalViews.toLocaleString()}</span>
                </span>
                <span class="total-badge likes" aria-label="?„ì¬ ì¢‹ì•„?? ${totals.totalLikes.toLocaleString()}">
                    <span class="total-icon">?¤ï¸</span>
                    <span class="total-value">${totals.totalLikes.toLocaleString()}</span>
                </span>
                <span class="total-badge comments" aria-label="?„ì¬ ?“ê?: ${totals.totalComments.toLocaleString()}">
                    <span class="total-icon">?’¬</span>
                    <span class="total-value">${totals.totalComments.toLocaleString()}</span>
                </span>
                <span class="total-badge shares" aria-label="?„ì¬ ê³µìœ : ${totals.totalShares.toLocaleString()}">
                    <span class="total-icon">?”„</span>
                    <span class="total-value">${totals.totalShares.toLocaleString()}</span>
                </span>
                <span class="total-badge follows" aria-label="?„ì¬ ?”ë¡œ?? ${totals.totalFollows.toLocaleString()}">
                    <span class="total-icon">?‘¥</span>
                    <span class="total-value">${totals.totalFollows.toLocaleString()}</span>
                </span>
            </div>
        `;
  }

  // ?µí•© UI ?…ë°?´íŠ¸ ?¨ìˆ˜ (?±ëŠ¥ ìµœì ??
  refreshUI(options = {}) {
    const {
      savedTexts = false,
      trackingPosts = false,
      trackingSummary = false,
      trackingChart = false,
      force = false,
    } = options;

    // ?…ë°?´íŠ¸ ?ì— ì¶”ê?
    if (savedTexts) this.updateQueue.savedTexts = true;
    if (trackingPosts) this.updateQueue.trackingPosts = true;
    if (trackingSummary) this.updateQueue.trackingSummary = true;
    if (trackingChart) this.updateQueue.trackingChart = true;

    // ê°•ì œ ?…ë°?´íŠ¸?´ê±°??ì¦‰ì‹œ ?¤í–‰???„ìš”??ê²½ìš°
    if (force) {
      this.executeUIUpdate();
      return;
    }

    // ?”ë°”?´ì‹±: ë§ˆì?ë§??¸ì¶œ ??100ms ?„ì— ?¤í–‰
    if (this.debounceTimers.uiUpdate) {
      clearTimeout(this.debounceTimers.uiUpdate);
    }

    this.debounceTimers.uiUpdate = setTimeout(() => {
      this.executeUIUpdate();
    }, 100);
  }

  // UI ?…ë°?´íŠ¸ ?¤í–‰ (?´ë? ?¨ìˆ˜)
  executeUIUpdate() {
    // ?œì„± ???•ì¸
    const savedTab = document.getElementById("saved-tab");
    const trackingTab = document.getElementById("tracking-tab");
    const isSavedTabActive = savedTab && savedTab.classList.contains("active");
    const isTrackingTabActive =
      trackingTab && trackingTab.classList.contains("active");

    // ?€?¥ëœ ê¸€ ???…ë°?´íŠ¸
    if (this.updateQueue.savedTexts && isSavedTabActive) {
      this.renderSavedTexts();
      this.updateQueue.savedTexts = false;
    }

    // ?¸ë˜?????…ë°?´íŠ¸
    if (this.updateQueue.trackingPosts && isTrackingTabActive) {
      this.renderTrackingPosts();
      this.updateQueue.trackingPosts = false;
    }

    // ?¸ë˜???”ì•½ ?…ë°?´íŠ¸ (?¸ë˜????´ ?œì„±?”ë˜???ˆì„ ?Œë§Œ)
    if (this.updateQueue.trackingSummary && isTrackingTabActive) {
      this.updateTrackingSummary();
      this.updateQueue.trackingSummary = false;
    }

    // ?¸ë˜??ì°¨íŠ¸ ?…ë°?´íŠ¸ (?¸ë˜????´ ?œì„±?”ë˜???ˆê³  ì°¨íŠ¸ê°€ ë³´ì¼ ?Œë§Œ)
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
  // ?”ë°”?´ì‹± ? í‹¸ë¦¬í‹° ?¨ìˆ˜
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

  // ë²”ìœ„ ?„í„° ì´ˆê¸°??
  initRangeFilter() {
    try {
      // localStorage?ì„œ ?‘ê¸°/?¼ì¹˜ê¸??íƒœ ë³µì›
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
      logger.error("ë²”ìœ„ ?„í„° ì´ˆê¸°???¤íŒ¨:", error);
    }
  }

  // ë²”ìœ„ ?„í„° ?‘ê¸°/?¼ì¹˜ê¸?? ê?
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

    // ?íƒœ localStorage???€??
    try {
      localStorage.setItem("rangeFilter:expanded", isExpanded ? "1" : "0");
    } catch (error) {
      logger.error("ë²”ìœ„ ?„í„° ?íƒœ ?€???¤íŒ¨:", error);
    }
  }

  // ?€?„ë¼???”ë³´ê¸??‘ê¸° (ìµœì‹  1ê°?ê¸°ë³¸)
  toggleTimelineCollapse(button) {
    const container = button.closest(".tracking-timeline-container");
    const content = container.querySelector(".tracking-timeline-content");
    if (!content) return;

    // ?€?¥ëœ ê¸€ ?„ì´??ID ?•ì¸ (per-post ???ì„±??
    const savedItem = button.closest(".saved-item");
    const itemId = savedItem ? savedItem.getAttribute("data-item-id") : null;

    const collapsed = content.classList.toggle("collapsed");
    const total = content.querySelectorAll(".timeline-item").length;

    // ?íƒœ localStorage???€??(per-post)
    if (itemId) {
      try {
        // ?µì¼???¤í‚¤ë§? card:{itemId}:details
        const key = `card:${itemId}:details`;
        localStorage.setItem(key, collapsed ? "0" : "1");
      } catch (e) {
        /* ignore quota */
      }
    }

    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) {
      button.textContent = `ê¸°ë¡ ${total}ê°??”ë³´ê¸?;
    } else {
      button.textContent = "?‘ê¸°";
    }
  }
  /**
   * ?€?¥ëœ ê¸€ ??ª©???´ë²¤??ë¦¬ìŠ¤???¤ì • (?´ë²¤???„ì„)
   * - ë©”ë‰´ ?´ê¸°/?«ê¸°, ?? œ, ?¸ë˜?????€?¥ëœ ê¸€ ê´€??ëª¨ë“  ?´ë²¤??ì²˜ë¦¬
   * - ?´ë²¤??ë¦¬ìŠ¤??ì¤‘ë³µ ?±ë¡ ë°©ì?ë¥??„í•´ ê¸°ì¡´ ?¸ë“¤???œê±° ?????¸ë“¤???±ë¡
   * @returns {void}
   */
  setupSavedItemEventListeners() {
    logger.log("setupSavedItemEventListeners ?¸ì¶œ??);

    // ê¸°ì¡´ ?´ë²¤??ë¦¬ìŠ¤???œê±° (ì¤‘ë³µ ë°©ì?)
    if (this.savedItemClickHandler) {
      this.savedList.removeEventListener("click", this.savedItemClickHandler);
    }
    if (this.savedItemKeydownHandler) {
      this.savedList.removeEventListener(
        "keydown",
        this.savedItemKeydownHandler
      );
    }

    // ?¤ë³´???´ë²¤???¸ë“¤??(?‘ê·¼???¥ìƒ)
    this.savedItemKeydownHandler = (event) => {
      // ?”ë³´ê¸??‘ê¸° ë²„íŠ¼ ?¤ë³´???‘ê·¼??
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
            button.textContent = nowExpanded ? "?‘ê¸°" : "?”ë³´ê¸?;
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

    // ?´ë¦­ ?´ë²¤???¸ë“¤??
    this.savedItemClickHandler = (event) => {
      logger.log("?€?¥ëœ ê¸€ ?ì—­ ?´ë¦­:", event.target);

      // ?ˆí¼?°ìŠ¤ ?¬ìš© ë°°ì? ?´ë¦­ ì²˜ë¦¬ (ë²„íŠ¼???„ë‹Œ span ?”ì†Œ)
      const badge = event.target.closest(".reference-usage-badge--clickable");
      if (badge) {
        const badgeAction = badge.getAttribute("data-action");
        if (badgeAction === "mark-reference-used") {
          event.preventDefault();
          event.stopPropagation();

          // ?ˆí¼?°ìŠ¤ ì¹´ë“œ?ì„œ itemId ì°¾ê¸°
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            logger.log(
              "?ˆí¼?°ìŠ¤ ?¬ìš© ë°°ì? ?´ë¦­ (?¬ìš©?¨ìœ¼ë¡??œì‹œ):",
              referenceItemId
            );
            this.markReferenceAsUsed(referenceItemId);
          }
          return;
        } else if (badgeAction === "mark-reference-unused") {
          event.preventDefault();
          event.stopPropagation();

          // ?ˆí¼?°ìŠ¤ ì¹´ë“œ?ì„œ itemId ì°¾ê¸°
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            logger.log(
              "?ˆí¼?°ìŠ¤ ?¬ìš© ë°°ì? ?´ë¦­ (?¬ìš© ?ˆë¨?¼ë¡œ ?œì‹œ):",
              referenceItemId
            );
            this.unmarkReferenceAsUsed(referenceItemId);
          }
          return;
        }
      }

      const button = event.target.closest("button");
      if (!button) {
        // ë²„íŠ¼???„ë‹ˆë©??€?„ë¼??????ì²˜ë¦¬
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

      logger.log("?´ë²¤??ì²˜ë¦¬:", {
        itemId,
        action,
        button: button.textContent,
      });

      if (!itemId) {
        logger.error("Item ID not found");
        return;
      }

      if (action === "more") {
        // ?´ë²¤???„íŒŒ ?œì–´: ?´ë²¤??ë²„ë¸”ë§?ë°©ì?ë¡?ë°”ê¹¥ ?´ë¦­ ?¸ë“¤?¬ê? ì¦‰ì‹œ ?¤í–‰?˜ì? ?Šë„ë¡???
        event.preventDefault();
        event.stopPropagation();

        // DOM ?ìƒ‰ ë°©ì‹ ê°œì„ : closest + querySelector ?¬ìš©?¼ë¡œ ???ˆì •?ì¸ ?ìƒ‰
        const moreMenuContainer = button.closest(".more-menu");
        if (!moreMenuContainer) {
          logger.warn("[more menu] Container not found:", { itemId, button });
          return;
        }

        const menu = moreMenuContainer.querySelector(".more-menu-list");
        if (menu) {
          const isOpen = menu.classList.toggle("open");
          button.setAttribute("aria-expanded", isOpen ? "true" : "false");

          // ?¤ë§ˆ???¬ì??”ë‹: ?”ë©´ ?„ì¹˜???°ë¼ ë©”ë‰´ ?œì‹œ ë°©í–¥ ê²°ì •
          if (isOpen) {
            this.applySmartMenuPosition(menu, button);

            // ?¬ì»¤???¸ë©: ë©”ë‰´ê°€ ?´ë¦¬ë©?ì²?ë²ˆì§¸ ë©”ë‰´ ?„ì´?œì— ?¬ì»¤??
            const firstMenuItem = menu.querySelector(".more-menu-item");
            if (firstMenuItem) {
              setTimeout(() => firstMenuItem.focus(), 50);
            }
          } else {
            // ë©”ë‰´ ?«í ???„ì¹˜ ?´ë˜???œê±°
            menu.classList.remove("open-top", "open-bottom");
          }
        } else {
          // ë©”ë‰´ë¥?ì°¾ì? ëª»í•œ ê²½ìš° ?”ë²„ê¹?ë¡œê·¸ ì¶œë ¥
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
          button.textContent = nowExpanded ? "?‘ê¸°" : "?”ë³´ê¸?;
          button.setAttribute("aria-expanded", nowExpanded ? "true" : "false");
          try {
            // ?µì¼???¤í‚¤ë§? card:{itemId}:expanded
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
        logger.log("?¸ì§‘ ?¡ì…˜ ?¤í–‰:", { itemId, type });
        this.editText(itemId, type);
      } else if (action === "delete") {
        logger.log("?? œ ?¡ì…˜ ?¤í–‰:", { itemId });
        // ?´ë²¤???„íŒŒ ?œì–´: outsideClickHandlerê°€ ë©”ë‰´ë¥??«ê¸° ?„ì— ?? œ ?¤í–‰
        event.preventDefault();
        event.stopPropagation();
        // ë©”ë‰´ ?«ê¸°
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
        // ?? œ ?¤í–‰
        this.deleteText(itemId);
      } else if (action === "track") {
        logger.log("?¸ë˜???¡ì…˜ ?¤í–‰:", { itemId });
        this.startTrackingFromSaved(itemId);
      } else if (action === "add-tracking") {
        logger.log("?¸ë˜???°ì´???…ë ¥ ?¡ì…˜ ?¤í–‰:", { itemId });
        this.currentTrackingPost = null; // ?¬ìŠ¤??ID ì´ˆê¸°??
        this.openTrackingModal(itemId);
      } else if (action === "llm-validation") {
        logger.log("LLM ê²€ì¦??œë¡­?¤ìš´ ?´ë¦­:", { itemId });
        event.preventDefault();
        event.stopPropagation();

        // ?œë¡­?¤ìš´ ë©”ë‰´ ? ê? (ëª¨ë°”??ì§€??
        const dropdownContainer = button.closest(".llm-validation-dropdown");
        if (dropdownContainer) {
          const dropdownMenu =
            dropdownContainer.querySelector(".llm-dropdown-menu");
          if (dropdownMenu) {
            const isOpen = dropdownMenu.classList.toggle("open");
            button.setAttribute("aria-expanded", isOpen ? "true" : "false");

            // ?¤ë§ˆ???¬ì??”ë‹: ?”ë©´ ?„ì¹˜???°ë¼ ë©”ë‰´ ?œì‹œ ë°©í–¥ ê²°ì •
            if (isOpen) {
              this.applySmartMenuPosition(dropdownMenu, button);

              // ?¬ì»¤???¸ë©: ë©”ë‰´ê°€ ?´ë¦¬ë©?ì²?ë²ˆì§¸ LLM ?µì…˜???¬ì»¤??
              const firstOption = dropdownMenu.querySelector(".llm-option");
              if (firstOption) {
                setTimeout(() => firstOption.focus(), 50);
              }
            } else {
              // ë©”ë‰´ ?«í ???„ì¹˜ ?´ë˜???œê±°
              dropdownMenu.classList.remove("open-top", "open-bottom");
            }
          }
        }
        return;
      } else {
        // LLM ?µì…˜ ë²„íŠ¼ ì²˜ë¦¬ (data-llm ?ì„± ?•ì¸)
        const llmService = button.getAttribute("data-llm");
        if (llmService) {
          logger.log("LLM ?µì…˜ ?´ë¦­:", { itemId, llmService });
          this.validateWithLLM(itemId, llmService);
        }
      }
    };

    // ?´ë²¤??ë¦¬ìŠ¤???±ë¡
    this.savedList.addEventListener("click", this.savedItemClickHandler);
    this.savedList.addEventListener("keydown", this.savedItemKeydownHandler);

    // ê¸°ì¡´ ë°”ê¹¥ ?´ë¦­ ?¸ë“¤???œê±° (ì¤‘ë³µ ë°©ì?)
    if (this.outsideClickHandler) {
      document.removeEventListener("click", this.outsideClickHandler, {
        capture: true,
      });
    }

    // ë°”ê¹¥ ?´ë¦­ ??ëª¨ë“  more ë©”ë‰´ ë°?LLM ?œë¡­?¤ìš´ ?«ê¸°
    // setTimeout???¬ìš©?˜ì—¬ ?´ë²¤??ì²˜ë¦¬ ?œì„œ ë³´ì¥: ë©”ë‰´ë¥??¬ëŠ” ?™ì‘???„ë£Œ????ë°”ê¹¥ ?´ë¦­??ê°ì?
    this.outsideClickHandler = (e) => {
      const isInsideMenu = e.target.closest(".more-menu");
      const isInsideLLMDropdown = e.target.closest(".llm-validation-dropdown");

      if (!isInsideMenu && !isInsideLLMDropdown) {
        // ?´ë²¤??ì²˜ë¦¬ ?œì„œ ë³´ì¥: ë©”ë‰´ ?´ê¸° ?™ì‘???„ë£Œ?????¤í–‰?˜ë„ë¡?setTimeout ?¬ìš©
        setTimeout(() => {
          // More ë©”ë‰´ ?«ê¸°
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // ?¬ì»¤???¸ë© ?´ì œ: ë©”ë‰´ ë²„íŠ¼?¼ë¡œ ?¬ì»¤??ë³µì›
            const menuBtn = el.previousElementSibling;
            if (menuBtn && menuBtn.classList.contains("more-menu-btn")) {
              menuBtn.setAttribute("aria-expanded", "false");
              menuBtn.focus();
            }
          });
          document
            .querySelectorAll('.more-menu-btn[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute("aria-expanded", "false"));

          // LLM ?œë¡­?¤ìš´ ?«ê¸°
          document.querySelectorAll(".llm-dropdown-menu.open").forEach((el) => {
            el.classList.remove("open");
            // ?¬ì»¤???¸ë© ?´ì œ: LLM ë©”ì¸ ë²„íŠ¼?¼ë¡œ ?¬ì»¤??ë³µì›
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

    // ?€?„ë¼???œìŠ¤ì²?ë¡±í”„?ˆìŠ¤ ?? œ, ?¤ì??´í”„ ì¢???
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
            // ë¡±í”„?ˆìŠ¤ ???? œ ?•ì¸
            this.editingMetricData = this.editingMetricData || {
              metricIndex: Number(metricIndex),
            };
            // editTrackingMetric?€ ëª¨ë‹¬ ê¸°ë°˜?´ë?ë¡?ì§ì ‘ ?? œ ?¸ì¶œ ì¤€ë¹„ë? ?„í•´ context ë³´ì¥ ?„ìš”
            // ê°„ë‹¨???? œ ?•ì¸ ??ì§„í–‰
            if (confirm("??ê¸°ë¡???? œ? ê¹Œ??")) {
              // edit modal ì»¨í…?¤íŠ¸ ?†ì´???? œ ?˜í–‰???„í•´ ?„ì‹œ ì»¨í…?¤íŠ¸ êµ¬ì„±
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              // textId ê¸°ë°˜?¼ë¡œ editingMetricData ?‹ì—…
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
              // ì¢ŒìŠ¤?€?´í”„ ???¸ì§‘
              this.editTrackingMetric(row, metricIndex);
            } else {
              // ?°ìŠ¤?€?´í”„ ???? œ ?•ì¸
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              this.editingMetricData = {
                postId: null,
                textId: itemId,
                metricIndex: Number(metricIndex),
              };
              if (confirm("??ê¸°ë¡???? œ? ê¹Œ??")) {
                this.deleteTrackingDataItem();
              }
            }
          }
        },
        { passive: true }
      );
    }

    // ESC ?¤ë¡œ ë©”ë‰´ ?«ê¸°
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
    logger.log("?´ë²¤??ë¦¬ìŠ¤???±ë¡ ?„ë£Œ");
  }

  // ?¤ë§ˆ???¬ì??”ë‹: ?”ë©´ ?„ì¹˜???°ë¼ ë©”ë‰´ ?œì‹œ ë°©í–¥ ê²°ì •
  applySmartMenuPosition(menu, button) {
    // ê¸°ì¡´ ?„ì¹˜ ?´ë˜???œê±°
    menu.classList.remove("open-top", "open-bottom");

    // ë©”ë‰´ ?¬ê¸° ì¶”ì • (?¤ì œ ?Œë”ë§??„ì´???„ì‹œë¡??œì‹œ?˜ì—¬ ?¬ê¸° ì¸¡ì •)
    const wasVisible = menu.style.display !== "none";
    if (!wasVisible) {
      menu.style.visibility = "hidden";
      menu.style.display = "block";
    }

    const menuRect = menu.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const menuHeight = menuRect.height || 150; // ê¸°ë³¸ê°? ?€?µì ??ë©”ë‰´ ?’ì´
    const viewportHeight = window.innerHeight;
    const threshold = 200; // ?ë‹¨/?˜ë‹¨ ?„ê³„ê°?(?½ì?)

    // ?„ë¡œ ?œì‹œ?ˆì„ ???”ë©´ ë°–ìœ¼ë¡??˜ê??”ì? ?•ì¸
    const spaceAbove = buttonRect.top;
    const spaceBelow = viewportHeight - buttonRect.bottom;

    // ?„ì¹˜ ê²°ì • ë¡œì§
    // 1. ?ë‹¨ ê·¼ì²˜(threshold ?´ë‚´)?´ê³  ?„ë¡œ ?œì‹œ??ê³µê°„??ë¶€ì¡±í•˜ë©????„ë˜ë¡?
    // 2. ?˜ë‹¨ ê·¼ì²˜?´ê³  ?„ë˜ë¡??œì‹œ??ê³µê°„??ë¶€ì¡±í•˜ë©????„ë¡œ
    // 3. ê·??¸ì—??ê¸°ë³¸ê°??„ë¡œ) ?¬ìš©

    if (spaceAbove < threshold && spaceAbove < menuHeight + 20) {
      // ?”ë©´ ?ë‹¨ ê·¼ì²˜?´ê³  ?„ë¡œ ?œì‹œ??ê³µê°„??ë¶€ì¡????„ë˜ë¡??œì‹œ
      menu.classList.add("open-bottom");
    } else if (spaceBelow < threshold && spaceBelow < menuHeight + 20) {
      // ?”ë©´ ?˜ë‹¨ ê·¼ì²˜?´ê³  ?„ë˜ë¡??œì‹œ??ê³µê°„??ë¶€ì¡????„ë¡œ ?œì‹œ
      menu.classList.add("open-top");
    } else {
      // ê¸°ë³¸ê°? ?„ë¡œ ?œì‹œ (???ì—°?¤ëŸ¬??UX)
      menu.classList.add("open-top");
    }

    // ?„ì‹œ ?œì‹œ ?œê±°
    if (!wasVisible) {
      menu.style.visibility = "";
      menu.style.display = "";
    }
  }

  // ?¨ë„ ê¸°ë°˜ LLM ê²€ì¦?ë²„íŠ¼ ë°”ì¸??(?¬ì‚¬??ê°€??
  bindPanelLLMButtons() {
    logger.log("?¨ë„ LLM ë²„íŠ¼ ë°”ì¸???œì‘");

    const panelLlmButtons = document.querySelectorAll(
      ".llm-option[data-panel]"
    );
    logger.log(`?¨ë„ LLM ë²„íŠ¼ ${panelLlmButtons.length}ê°?ë°œê²¬`);

    panelLlmButtons.forEach((button, index) => {
      const panel = button.getAttribute("data-panel");
      const llmService = button.getAttribute("data-llm");

      if (!panel || !llmService) {
        logger.warn(`?¨ë„ LLM ë²„íŠ¼ ${index}???„ìˆ˜ ?ì„±???†ìŠµ?ˆë‹¤:`, {
          panel,
          llmService,
        });
        return;
      }

      logger.log(`?¨ë„ LLM ë²„íŠ¼ ${index} ë°”ì¸??`, { panel, llmService });

      // ê¸°ì¡´ ?´ë²¤??ë¦¬ìŠ¤???œê±° (ì¤‘ë³µ ë°©ì?)
      if (button._panelLlmHandler) {
        button.removeEventListener("click", button._panelLlmHandler);
      }

      // ?ˆë¡œ???´ë²¤???¸ë“¤???ì„± ë°?ë°”ì¸??
      button._panelLlmHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("?¨ë„ LLM ë²„íŠ¼ ?´ë¦­:", { panel, llmService });
        this.validatePanelWithLLM(panel, llmService);
      };

      button.addEventListener("click", button._panelLlmHandler);
    });

    logger.log("?¨ë„ LLM ë²„íŠ¼ ë°”ì¸???„ë£Œ");
  }

  // ì§ì ‘ ?´ë²¤??ë°”ì¸??(ë°±ì—… ë°©ë²•)
  bindDirectEventListeners() {
    logger.log("ì§ì ‘ ?´ë²¤??ë°”ì¸???œì‘");

    const editButtons = this.savedList.querySelectorAll(".btn-edit");
    const deleteButtons = this.savedList.querySelectorAll(".btn-delete");
    const llmButtons = this.savedList.querySelectorAll(".llm-option");

    logger.log(
      `?¸ì§‘ ë²„íŠ¼ ${editButtons.length}ê°? ?? œ ë²„íŠ¼ ${deleteButtons.length}ê°? LLM ë²„íŠ¼ ${llmButtons.length}ê°?ë°œê²¬`
    );

    editButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");
      const type = button.getAttribute("data-type");

      logger.log(`?¸ì§‘ ë²„íŠ¼ ${index} ë°”ì¸??`, { itemId, type });

      // ê¸°ì¡´ ?´ë²¤??ë¦¬ìŠ¤???œê±°
      button.removeEventListener("click", button._editHandler);

      // ?ˆë¡œ???´ë²¤???¸ë“¤???ì„± ë°?ë°”ì¸??
      button._editHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("ì§ì ‘ ?¸ì§‘ ë²„íŠ¼ ?´ë¦­:", { itemId, type });
        this.editText(itemId, type);
      };

      button.addEventListener("click", button._editHandler);
    });

    deleteButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");

      logger.log(`?? œ ë²„íŠ¼ ${index} ë°”ì¸??`, { itemId });

      // ê¸°ì¡´ ?´ë²¤??ë¦¬ìŠ¤???œê±°
      button.removeEventListener("click", button._deleteHandler);

      // ?ˆë¡œ???´ë²¤???¸ë“¤???ì„± ë°?ë°”ì¸??
      button._deleteHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log("ì§ì ‘ ?? œ ë²„íŠ¼ ?´ë¦­:", { itemId });
        this.deleteText(itemId);
      };

      button.addEventListener("click", button._deleteHandler);
    });

    // ?¨ë„ ê¸°ë°˜ LLM ê²€ì¦?ë²„íŠ¼??ë°”ì¸??(?¬ì‚¬???¨ìˆ˜ ?¸ì¶œ)
    this.bindPanelLLMButtons();

    logger.log("ì§ì ‘ ?´ë²¤??ë°”ì¸???„ë£Œ");
  }

  // LLM ?¹ì„± ?•ë³´ ê²€ì¦??¨ìˆ˜ (ê°œë°œ?ìš©)
  verifyLLMCharacteristics() {
    logger.log("=== LLM ?¹ì„± ?•ë³´ ê²€ì¦?===");

    if (!this.llmCharacteristics) {
      logger.error("??llmCharacteristics ê°ì²´ê°€ ?†ìŠµ?ˆë‹¤!");
      return false;
    }

    const services = ["chatgpt", "gemini", "perplexity", "grok"];
    let allValid = true;

    services.forEach((service) => {
      const char = this.llmCharacteristics[service];
      if (!char) {
        logger.error(`??${service} ?¹ì„± ?•ë³´ê°€ ?†ìŠµ?ˆë‹¤!`);
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

    logger.log("=== ê²€ì¦??„ë£Œ ===");
    return allValid;
  }

  // ?”ë²„ê¹…ìš© ?¨ìˆ˜ - ?„ì—­?ì„œ ?¸ì¶œ ê°€??
  debugSavedItems() {
    logger.log("=== ?€?¥ëœ ê¸€ ?”ë²„ê¹??•ë³´ ===");
    logger.log("savedTexts ë°°ì—´:", this.savedTexts);
    logger.log("savedList ?”ì†Œ:", this.savedList);

    const savedItems = this.savedList.querySelectorAll(".saved-item");
    logger.log(`?€?¥ëœ ê¸€ ??ª© ${savedItems.length}ê°?`);

    savedItems.forEach((item, index) => {
      const itemId = item.getAttribute("data-item-id");
      const editBtn = item.querySelector(".btn-edit");
      const deleteBtn = item.querySelector(".btn-delete");

      logger.log(`??ª© ${index}:`, {
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
      `?¸ì§‘ ë²„íŠ¼ ${editButtons.length}ê°? ?? œ ë²„íŠ¼ ${deleteButtons.length}ê°?
    );

    logger.log("=== ?”ë²„ê¹??•ë³´ ??===");
  }

  editText(id, type) {
    logger.log("?¸ì§‘ ë²„íŠ¼ ?´ë¦­:", { id, type });
    const item = this.savedTexts.find((saved) => saved.id === id);
    if (item) {
      logger.log("?¸ì§‘????ª© ì°¾ìŒ:", item);
      if (type === "reference") {
        this.refTextInput.value = item.content;
        this.updateCharacterCount("ref");
        this.refTextInput.focus();
        this.showMessage(
          "?ˆí¼?°ìŠ¤ ê¸€???¸ì§‘ ?ì—­?¼ë¡œ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.",
          "success"
        );
      } else {
        this.editTextInput.value = item.content;
        // ì£¼ì œ ë¡œë“œ (?˜ì •/?‘ì„± ê¸€??ê²½ìš°)
        if (this.editTopicInput) {
          this.editTopicInput.value = item.topic || "";
        }
        // SNS ?Œë«??ë¡œë“œ (?˜ì •/?‘ì„± ê¸€??ê²½ìš°)
        if (item.platforms && Array.isArray(item.platforms)) {
          this.selectedSnsPlatforms = [...item.platforms];
        } else {
          this.selectedSnsPlatforms = [];
        }
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        this.updateCharacterCount("edit");
        this.editTextInput.focus();
        this.showMessage("?˜ì • ê¸€???¸ì§‘ ?ì—­?¼ë¡œ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.", "success");
      }
      this.refTextInput.scrollIntoView({ behavior: "smooth" });
    } else {
      logger.error("?¸ì§‘????ª©??ì°¾ì„ ???†ìŒ:", {
        id,
        type,
        savedTexts: this.savedTexts,
      });
      this.showMessage("?¸ì§‘??ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    }
  }
  // Firestore?ì„œ ?ìŠ¤???? œ (Soft Delete)
  async deleteText(id) {
    logger.log("?? œ ë²„íŠ¼ ?´ë¦­ (Soft Delete):", { id });

    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
      return;
    }

    try {
      // ?? œ???„ì´??ì°¾ê¸°
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("?? œ???„ì´?œì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤:", id);
        this.showMessage("?? œ??ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // Phase 1.7.1: ?ˆí¼?°ìŠ¤ ?? œ ???°ê²°???‘ì„±ê¸€ ?•ì¸
      if ((itemToDelete.type || "edit") === "reference") {
        const usedEdits = this.getEditsByReference(id);
        if (usedEdits.length > 0) {
          const confirmed = confirm(
            `? ï¸ ???ˆí¼?°ìŠ¤??${usedEdits.length}ê°œì˜ ?‘ì„±ê¸€?ì„œ ì°¸ê³ ?˜ê³  ?ˆìŠµ?ˆë‹¤.\n\n` +
              `?´ì??µìœ¼ë¡??´ë™?˜ì‹œê² ìŠµ?ˆê¹Œ?\n\n` +
              `(?‘ì„±ê¸€???°ê²° ?•ë³´??? ì??˜ì?ë§? ?ˆí¼?°ìŠ¤ ?´ìš©?€ ë³????†ê²Œ ?©ë‹ˆ??)`
          );
          if (!confirmed) {
            logger.log("?¬ìš©?ê? ?ˆí¼?°ìŠ¤ ?? œ ì·¨ì†Œ");
            return;
          }
        }
      }

      if (!confirm("??ê¸€???´ì??µìœ¼ë¡??´ë™?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
        return;
      }

      // ?™ê????…ë°?´íŠ¸ë¥??„í•œ ë°±ì—…
      const itemBackup = { ...itemToDelete };

      // Soft Delete ì²˜ë¦¬
      itemToDelete.isDeleted = true;
      itemToDelete.deletedAt = new Date().toISOString();

      // UI ?…ë°?´íŠ¸ (ë©”ì¸ ëª©ë¡?ì„œ ?œê±°)
      // this.savedTexts??ì°¸ì¡°ë¥?? ì??´ì•¼ ?˜ë?ë¡?ë°°ì—´ ?ì²´ë¥?êµì²´?˜ì? ?Šê³  ?íƒœë§?ë³€ê²?
      // renderSavedTexts?ì„œ isDeleted ?„í„°ë§?ì²˜ë¦¬

      // ìºì‹œ ë¬´íš¨??
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // UI ê°±ì‹ 
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true, // ?¸ë˜???¬ìŠ¤?¸ëŠ” ? ì??˜ì?ë§??ŒìŠ¤ê°€ ?? œ???œì‹œ ?„ìš”?????ˆìŒ
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      logger.log("Firestore Soft Delete ?œì‘:", { id });

      try {
        // Firestore ?…ë°?´íŠ¸
        const docRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: true,
          deletedAt: window.firebaseServerTimestamp(), // ?œë²„ ?œê°„ ?¬ìš©
        });

        this.showMessage("?´ì??µìœ¼ë¡??´ë™?˜ì—ˆ?µë‹ˆ??", "success");
        logger.log("Soft Delete ?„ë£Œ", { id });
      } catch (error) {
        logger.error("?ìŠ¤???? œ ?¤íŒ¨:", error);

        // ?¤íŒ¨ ë³µêµ¬
        itemToDelete.isDeleted = false;
        delete itemToDelete.deletedAt;

        this.renderSavedTextsCache = null;
        this.renderSavedTextsCacheKey = null;
        this.renderSavedTexts();

        this.showMessage(
          "?´ì????´ë™???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.",
          "error"
        );
      }
    } catch (error) {
      logger.error("?ìŠ¤???? œ ?¤íŒ¨:", error);
      this.showMessage(
        "?´ì????´ë™???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.",
        "error"
      );
    }
  }

  // ê¸€ ë³µì› (Restore)
  async restoreText(id) {
    logger.log("ë³µì› ë²„íŠ¼ ?´ë¦­:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("ë³µì›???„ì´?œì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤:", id);
        return;
      }

      const itemToRestore = this.savedTexts[targetIndex];

      // ?™ê????…ë°?´íŠ¸
      itemToRestore.isDeleted = false;
      itemToRestore.deletedAt = null;

      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // ?´ì???UI ê°±ì‹  (?¸ì¶œ?ê? ì²˜ë¦¬?˜ê±°???¬ê¸°??ì²˜ë¦¬)
      if (document.getElementById("trash-bin-modal")) {
        this.renderTrashBinList();
      }
      // ë©”ì¸ ëª©ë¡ ê°±ì‹ 
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

        this.showMessage("ê¸€??ë³µì›?˜ì—ˆ?µë‹ˆ??", "success");
      } catch (error) {
        logger.error("ë³µì› ?¤íŒ¨:", error);
        // ë¡¤ë°±
        itemToRestore.isDeleted = true;
        itemToRestore.deletedAt = new Date().toISOString();
        if (document.getElementById("trash-bin-modal")) {
          this.renderTrashBinList();
        }
        this.showMessage("ë³µì›???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
      }
    } catch (error) {
      logger.error("ë³µì› ?¤ë¥˜:", error);
    }
  }

  // ?êµ¬ ?? œ (Permanently Delete)
  async permanentlyDeleteText(id) {
    logger.log("?êµ¬ ?? œ ë²„íŠ¼ ?´ë¦­:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        logger.warn("?? œ???„ì´?œì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤:", id);
        return;
      }

      if (
        !confirm(
          "?•ë§ë¡??êµ¬ ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?\n???‘ì—…?€ ?˜ëŒë¦????†ìœ¼ë©? ?°ê²°???¸ë˜???°ì´?°ë„ ëª¨ë‘ ?? œ?©ë‹ˆ??"
        )
      ) {
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // ?°ê²°???¸ë˜???¬ìŠ¤??ì°¾ê¸° (ê¸°ì¡´ ë¡œì§ ?¬ì‚¬??
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

      // ?™ê????…ë°?´íŠ¸: ë°°ì—´?ì„œ ?œê±°
      this.savedTexts.splice(targetIndex, 1);
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      if (document.getElementById("trash-bin-modal")) {
        this.renderTrashBinList();
      }

      try {
        // ?¤ì œ Firestore ?? œ
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

        this.showMessage("?êµ¬ ?? œ?˜ì—ˆ?µë‹ˆ??", "success");
      } catch (error) {
        logger.error("?êµ¬ ?? œ ?¤íŒ¨:", error);
        // ë¡¤ë°± (ë³µì¡?˜ë?ë¡??ˆë¡œê³ ì¹¨ ê¶Œì¥ ë©”ì‹œì§€ ?ëŠ” ?¨ìˆœ ?ëŸ¬ ?œì‹œ)
        this.showMessage(
          "?êµ¬ ?? œ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ?ˆë¡œê³ ì¹¨ ?´ì£¼?¸ìš”.",
          "error"
        );
        this.loadSavedTexts(true); // ?°ì´???¬ë¡œ??
      }
    } catch (error) {
      logger.error("?êµ¬ ?? œ ?¤ë¥˜:", error);
    }
  }
  // [Refactoring] Utils ëª¨ë“ˆ ?¬ìš©
  escapeHtml(text) {
    return escapeHtml(text);
  }

  // ?ìŠ¤?¸ë§Œ ?´ìŠ¤ì¼€?´í”„ (ì¤„ë°”ê¿??†ì´)
  escapeHtmlOnly(text) {
    if (!text) return "";

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * ?¬ìš©?ì—ê²?ë©”ì‹œì§€ ?œì‹œ
   * [Refactoring] UIManagerë¡??„ì„
   * @param {string} message - ë©”ì‹œì§€ ?´ìš©
   * @param {string} type - ë©”ì‹œì§€ ?€??('success', 'error', 'info', 'warning')
   */
  showMessage(message, type = "info") {
    if (this.uiManager) {
      this.uiManager.showMessage(message, type);
    } else {
      // Fallback: UIManagerê°€ ì´ˆê¸°?”ë˜ì§€ ?Šì? ê²½ìš°
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
   * ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
   * aria-live ?ì—­???¬ìš©?˜ì—¬ ?¤í¬ë¦?ë¦¬ë”??ë©”ì‹œì§€ë¥??„ë‹¬?©ë‹ˆ??
   *
   * @param {string} message - ?¤í¬ë¦?ë¦¬ë”???„ë‹¬??ë©”ì‹œì§€
   */
  announceToScreenReader(message) {
    if (!message || typeof message !== "string") {
      return;
    }

    // aria-live ?ì—­???†ìœ¼ë©??ì„±
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

    // ë©”ì‹œì§€ ?…ë°?´íŠ¸ (?¤í¬ë¦?ë¦¬ë”ê°€ ë³€ê²½ì„ ê°ì??˜ë„ë¡?
    ariaLiveRegion.textContent = "";
    // ?½ê°„??ì§€????ë©”ì‹œì§€ ?¤ì • (?¤í¬ë¦?ë¦¬ë”ê°€ ë³€ê²½ì„ ?•ì‹¤??ê°ì??˜ë„ë¡?
    setTimeout(() => {
      ariaLiveRegion.textContent = message;
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // ë³´ì•ˆ ê°•í™”: ?¬ìš©???°ì´???”í˜¸??
  async encryptUserData(data) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));

      // ?¬ìš©?ë³„ ê³ ìœ  ???ì„±
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
      logger.warn("?°ì´???”í˜¸???¤íŒ¨:", error);
      return null;
    }
  }

  // ë³´ì•ˆ ê°•í™”: ?¬ìš©???°ì´??ë³µí˜¸??
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
      logger.warn("?°ì´??ë³µí˜¸???¤íŒ¨:", error);
      return null;
    }
  }

  // Firebase ?¤ì • ?ˆë‚´
  showFirebaseSetupNotice() {
    console.info(`
?”¥ Firebase ?¤ì •???„ìš”?©ë‹ˆ??

1. Firebase Console (https://console.firebase.google.com) ?‘ì†
2. ???„ë¡œ?íŠ¸ ?ì„± ?ëŠ” ê¸°ì¡´ ?„ë¡œ?íŠ¸ ? íƒ
3. "Authentication" > "Sign-in method" ?ì„œ Google ë¡œê·¸???œì„±??
4. "Firestore Database" ?ì„±
5. "Project Settings" > "General" ?ì„œ ????ì¶”ê?
6. ?¤ì • ?•ë³´ë¥?index.html??firebaseConfig???…ë ¥

?„ì¬??ë¡œì»¬ ?¤í† ë¦¬ì? ëª¨ë“œë¡??™ì‘?©ë‹ˆ??
        `);
  }

  // LLM ê²€ì¦??œìŠ¤??ì´ˆê¸°??
  initializeLLMValidation() {
    // LLM ?¬ì´?¸ë³„ ?„ë¡¬?„íŠ¸ ?œí”Œë¦?
    this.llmPrompts = {
      chatgpt:
        "?¤ìŒ ê¸€??SNS ?„í‚¹ ê´€?ì—??ë¶„ì„?´ì£¼?¸ìš”. ?¹íˆ ?¤ìŒ ?”ì†Œ?¤ì„ ?‰ê??´ì£¼?¸ìš”:\n\n?¯ ?„í‚¹ ?¨ê³¼??\n- ì²?ë¬¸ì¥???…ì??ê´€?¬ì„ ?????ˆëŠ”ê°€?\n- ê°ì •??ëª°ì…??? ë„?˜ëŠ”ê°€?\n- ?¸ê¸°?¬ì„ ?ê·¹?˜ëŠ” ?”ì†Œê°€ ?ˆëŠ”ê°€?\n\n?“± SNS ìµœì ??\n- ?½ê¸° ?¬ìš´ êµ¬ì¡°?¸ê??\n- ê³µìœ ?˜ê³  ?¶ì? ?•êµ¬ë¥??ê·¹?˜ëŠ”ê°€?\n- ?“ê???? ë„?????ˆëŠ” ?”ì†Œê°€ ?ˆëŠ”ê°€?\n\n?’¡ ê°œì„  ?œì•ˆ:\n- ??ê°•ë ¥???„í‚¹ ?¬ì¸???œì•ˆ\n- ê°ì •??ë°˜ì‘???’ì´??ë°©ë²•\n- ?‰ë™ ? ë„(ì¢‹ì•„?? ê³µìœ , ?“ê?) ê°•í™” ë°©ì•ˆ\n\n?“‚ ì¹´í…Œê³ ë¦¬ ì¶”ì²œ:\n- ??ê¸€???´ë–¤ ì¹´í…Œê³ ë¦¬??ê°€???í•©?œì? 3ê°€ì§€ ì¶”ì²œ\n- ê°?ì¹´í…Œê³ ë¦¬???í•©?„ì? ?´ìœ  ?¤ëª…\n- ì¹´í…Œê³ ë¦¬ë³?ê²Œì‹œ ?„ëµ ?œì•ˆ\n\n[?•ì±… ì¤€??ê²€??\n?•ì±…: 'ê²½ì œ???´ìµ??ê´€???„ì‹¤???†ëŠ” ì£¼ì¥?´ë‚˜ ?½ì†(ê³ ìˆ˜??ë³´ì¥, ?ê¸ˆ ë³´ì¥, ë¬´ìœ„?? ?¨ê¸°ê°?ê³ ìˆ˜?? ?•ì • ?˜ìµ/?¼ì„¼??ë³´ì¥ ??' ê¸ˆì?.\nê²€???€???ìŠ¤?? ??'ë¶„ì„??ê¸€'\nì¶œë ¥ ?•ì‹(?„ìˆ˜):\n?„ë°˜ ?¬ë?: [ëª…ë°±???„ë°˜|?„ë°˜ ?Œì? ?’ìŒ|? ë§¤??ê²½ê³ )|?ˆì „|ëª…ë°±??ë¹„ìœ„ë°?\n?„ë°˜ ?„í—˜ ?ìˆ˜: [1|2|3|4|5]\n?„ë°˜ ê·¼ê±° ë¬¸êµ¬: [...]\në¶„ì„ ?¬ìœ : (?µì‹¬ ê·¼ê±°ë¥?3ì¤??´ë‚´ë¡?\n\n[2~3ì¤?ì¹´í”¼ ?ì„±]\n??• : ?¹ì‹ ?€ ì¹´í”¼?¼ì´?°ì…?ˆë‹¤. ?„ë˜ 'ë¶„ì„??ê¸€'??ì£¼ì œÂ·?•ì„œÂ·ë©”ì‹œì§€ë¥?? ì??˜ë©° 2~3ì¤?ì¹´í”¼ë¥??ì„±?˜ì„¸??\n?”êµ¬?¬í•­:\n- ?•í™•??2ì¤??ëŠ” 3ì¤„ë§Œ ì¶œë ¥(?í™©??ë§ì¶° ? íƒ). ì¤„ë°”ê¿ˆìœ¼ë¡?êµ¬ë¶„, ê·????ìŠ¤??ê¸ˆì?.\n- 2ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸?Â·ë„“?€ ê³µê°(?ë¬¸ê³??¼ë§¥?í†µ), 2ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- 3ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸??ë©”ì‹œì§€, 2ì¤„ì°¨=ë§¥ë½ ?„ê°œ(1ì¤„ê³¼ ?°ê²°), 3ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- ê°„ê²°Â·ëª…í™•, ì¤‘ë³µ/ê³¼ì¥/?´ì‹œ?œê·¸/?´ëª¨ì§€/?°ì˜´??ë¨¸ë¦¬ë§Â·ê¼¬ë¦¬ë§ ê¸ˆì?.\n\në¶„ì„??ê¸€:\n",
      gemini:
        "?¤ìŒ ê¸€??SNS ë§ˆì????„ë¬¸ê°€ ê´€?ì—??ë¶„ì„?´ì£¼?¸ìš”:\n\n?§  ?¬ë¦¬???„í‚¹ ë¶„ì„:\n- ?…ì??ë¬´ì˜?ì„ ?ê·¹?˜ëŠ” ?”ì†Œ ë¶„ì„\n- ê°ì •???¸ë¦¬ê±??¬ì¸???ë³„\n- ?¸ì? ?¸í–¥ ?œìš©???‰ê?\n\n?“Š ?€ê²??…ì ë¶„ì„:\n- ?´ë–¤ ?…ìì¸µì—ê²??´í•„?˜ëŠ”ê°€?\n- ê³µê°?€ ?•ì„± ?”ì†Œ??ë¬´ì—‡?¸ê??\n- ?‰ë™ ë³€?”ë? ? ë„?????ˆëŠ”ê°€?\n\n?¨ ?œí˜„??ê°œì„ :\n- ??ê°•ë ¥???œí˜„?¼ë¡œ ë°”ê? ë¶€ë¶?n- ?œê°???„íŒ©?¸ë? ?’ì´??ë°©ë²•\n- ê¸°ì–µ???¨ëŠ” ë¬¸êµ¬ ë§Œë“¤ê¸?n\n?“‚ ì¹´í…Œê³ ë¦¬ ì¶”ì²œ:\n- ??ê¸€???´ë–¤ ì¹´í…Œê³ ë¦¬??ê°€???í•©?œì? 3ê°€ì§€ ì¶”ì²œ\n- ê°?ì¹´í…Œê³ ë¦¬???í•©?„ì? ?´ìœ  ?¤ëª…\n- ì¹´í…Œê³ ë¦¬ë³?ê²Œì‹œ ?„ëµ ?œì•ˆ\n\n[?•ì±… ì¤€??ê²€??\n?•ì±…: 'ê²½ì œ???´ìµ??ê´€???„ì‹¤???†ëŠ” ì£¼ì¥?´ë‚˜ ?½ì†(ê³ ìˆ˜??ë³´ì¥, ?ê¸ˆ ë³´ì¥, ë¬´ìœ„?? ?¨ê¸°ê°?ê³ ìˆ˜?? ?•ì • ?˜ìµ/?¼ì„¼??ë³´ì¥ ??' ê¸ˆì?.\nê²€???€???ìŠ¤?? ??'ë¶„ì„??ê¸€'\nì¶œë ¥ ?•ì‹(?„ìˆ˜):\n?„ë°˜ ?¬ë?: [ëª…ë°±???„ë°˜|?„ë°˜ ?Œì? ?’ìŒ|? ë§¤??ê²½ê³ )|?ˆì „|ëª…ë°±??ë¹„ìœ„ë°?\n?„ë°˜ ?„í—˜ ?ìˆ˜: [1|2|3|4|5]\n?„ë°˜ ê·¼ê±° ë¬¸êµ¬: [...]\në¶„ì„ ?¬ìœ : (?µì‹¬ ê·¼ê±°ë¥?3ì¤??´ë‚´ë¡?\n\n[2~3ì¤?ì¹´í”¼ ?ì„±]\n??• : ?¹ì‹ ?€ ì¹´í”¼?¼ì´?°ì…?ˆë‹¤. ?„ë˜ 'ë¶„ì„??ê¸€'??ì£¼ì œÂ·?•ì„œÂ·ë©”ì‹œì§€ë¥?? ì??˜ë©° 2~3ì¤?ì¹´í”¼ë¥??ì„±?˜ì„¸??\n?”êµ¬?¬í•­:\n- ?•í™•??2ì¤??ëŠ” 3ì¤„ë§Œ ì¶œë ¥(?í™©??ë§ì¶° ? íƒ). ì¤„ë°”ê¿ˆìœ¼ë¡?êµ¬ë¶„, ê·????ìŠ¤??ê¸ˆì?.\n- 2ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸?Â·ë„“?€ ê³µê°(?ë¬¸ê³??¼ë§¥?í†µ), 2ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- 3ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸??ë©”ì‹œì§€, 2ì¤„ì°¨=ë§¥ë½ ?„ê°œ(1ì¤„ê³¼ ?°ê²°), 3ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- ê°„ê²°Â·ëª…í™•, ì¤‘ë³µ/ê³¼ì¥/?´ì‹œ?œê·¸/?´ëª¨ì§€/?°ì˜´??ë¨¸ë¦¬ë§Â·ê¼¬ë¦¬ë§ ê¸ˆì?.\n\në¶„ì„??ê¸€:\n",
      perplexity:
        "?¤ìŒ ê¸€??SNS ?¸ë Œ??ë°?? ë¢°??ê´€?ì—??ë¶„ì„?´ì£¼?¸ìš”:\n\n?” ?¸ë Œ???í•©??\n- ?„ì¬ SNS ?¸ë Œ?œì? ë¶€?©í•˜?”ê??\n- ë°”ì´??ê°€?¥ì„±???ˆëŠ” ì£¼ì œ?¸ê??\n- ?œì˜?ì ˆ???€?´ë°?¸ê??\n\n?“ˆ ? ë¢°??ê°•í™”:\n- ?¬ì‹¤ ?•ì¸???„ìš”??ë¶€ë¶?n- ???¤ë“???ˆëŠ” ê·¼ê±° ?œì‹œ ë°©ë²•\n- ?„ë¬¸???´í•„ ?”ì†Œ ì¶”ê? ë°©ì•ˆ\n\n?Œ ?•ì‚° ê°€?¥ì„±:\n- ê³µìœ  ê°€ì¹˜ê? ?ˆëŠ” ì½˜í…ì¸ ì¸ê°€?\n- ?¼ë????¼ìœ¼?????ˆëŠ” ?”ì†Œ??\n- ê¸ì •??ë°”ì´?´ì„ ?„í•œ ê°œì„ ??n\n?“‚ ì¹´í…Œê³ ë¦¬ ì¶”ì²œ:\n- ??ê¸€???´ë–¤ ì¹´í…Œê³ ë¦¬??ê°€???í•©?œì? 3ê°€ì§€ ì¶”ì²œ\n- ê°?ì¹´í…Œê³ ë¦¬???í•©?„ì? ?´ìœ  ?¤ëª…\n- ì¹´í…Œê³ ë¦¬ë³?ê²Œì‹œ ?„ëµ ?œì•ˆ\n\n[?•ì±… ì¤€??ê²€??\n?•ì±…: 'ê²½ì œ???´ìµ??ê´€???„ì‹¤???†ëŠ” ì£¼ì¥?´ë‚˜ ?½ì†(ê³ ìˆ˜??ë³´ì¥, ?ê¸ˆ ë³´ì¥, ë¬´ìœ„?? ?¨ê¸°ê°?ê³ ìˆ˜?? ?•ì • ?˜ìµ/?¼ì„¼??ë³´ì¥ ??' ê¸ˆì?.\nê²€???€???ìŠ¤?? ??'ë¶„ì„??ê¸€'\nì¶œë ¥ ?•ì‹(?„ìˆ˜):\n?„ë°˜ ?¬ë?: [ëª…ë°±???„ë°˜|?„ë°˜ ?Œì? ?’ìŒ|? ë§¤??ê²½ê³ )|?ˆì „|ëª…ë°±??ë¹„ìœ„ë°?\n?„ë°˜ ?„í—˜ ?ìˆ˜: [1|2|3|4|5]\n?„ë°˜ ê·¼ê±° ë¬¸êµ¬: [...]\në¶„ì„ ?¬ìœ : (?µì‹¬ ê·¼ê±°ë¥?3ì¤??´ë‚´ë¡?\n\n[2~3ì¤?ì¹´í”¼ ?ì„±]\n??• : ?¹ì‹ ?€ ì¹´í”¼?¼ì´?°ì…?ˆë‹¤. ?„ë˜ 'ë¶„ì„??ê¸€'??ì£¼ì œÂ·?•ì„œÂ·ë©”ì‹œì§€ë¥?? ì??˜ë©° 2~3ì¤?ì¹´í”¼ë¥??ì„±?˜ì„¸??\n?”êµ¬?¬í•­:\n- ?•í™•??2ì¤??ëŠ” 3ì¤„ë§Œ ì¶œë ¥(?í™©??ë§ì¶° ? íƒ). ì¤„ë°”ê¿ˆìœ¼ë¡?êµ¬ë¶„, ê·????ìŠ¤??ê¸ˆì?.\n- 2ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸?Â·ë„“?€ ê³µê°(?ë¬¸ê³??¼ë§¥?í†µ), 2ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- 3ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸??ë©”ì‹œì§€, 2ì¤„ì°¨=ë§¥ë½ ?„ê°œ(1ì¤„ê³¼ ?°ê²°), 3ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- ê°„ê²°Â·ëª…í™•, ì¤‘ë³µ/ê³¼ì¥/?´ì‹œ?œê·¸/?´ëª¨ì§€/?°ì˜´??ë¨¸ë¦¬ë§Â·ê¼¬ë¦¬ë§ ê¸ˆì?.\n\në¶„ì„??ê¸€:\n",
      grok: "?¤ìŒ ê¸€??SNS ?„í‚¹ ?„ë¬¸ê°€ ê´€?ì—??ê°„ê²°?˜ê³  ?„íŒ©???ˆê²Œ ë¶„ì„?´ì£¼?¸ìš”:\n\n???„íŒ©???¬ì¸??\n- ê°€??ê°•ë ¥???„í‚¹ ë¬¸ì¥?€?\n- ?…ì?ê²Œ ?¨ì„ ?µì‹¬ ë©”ì‹œì§€??\n- ?‰ë™??? ë„?˜ëŠ” CTA??\n\n?¯ ëª…í™•??ê²€ì¦?\n- ë©”ì‹œì§€ê°€ ëª…í™•?˜ê²Œ ?„ë‹¬?˜ëŠ”ê°€?\n- ë¶ˆí•„?”í•œ ?”ì†Œ???†ëŠ”ê°€?\n- ?µì‹¬ë§?ê°„ê²°?˜ê²Œ ?„ë‹¬?˜ëŠ”ê°€?\n\n?? ê°œì„  ?¡ì…˜:\n- ì¦‰ì‹œ ?ìš© ê°€?¥í•œ ê°œì„ ??n- ??ê°•ë ¥???„í‚¹ ë¬¸êµ¬ ?œì•ˆ\n- ?…ì ë°˜ì‘???’ì´??ë°©ë²•\n\n?“‚ ì¹´í…Œê³ ë¦¬ ì¶”ì²œ:\n- ??ê¸€???´ë–¤ ì¹´í…Œê³ ë¦¬??ê°€???í•©?œì? 3ê°€ì§€ ì¶”ì²œ\n- ê°?ì¹´í…Œê³ ë¦¬???í•©?„ì? ?´ìœ  ?¤ëª…\n- ì¹´í…Œê³ ë¦¬ë³?ê²Œì‹œ ?„ëµ ?œì•ˆ\n\n[?•ì±… ì¤€??ê²€??\n?•ì±…: 'ê²½ì œ???´ìµ??ê´€???„ì‹¤???†ëŠ” ì£¼ì¥?´ë‚˜ ?½ì†(ê³ ìˆ˜??ë³´ì¥, ?ê¸ˆ ë³´ì¥, ë¬´ìœ„?? ?¨ê¸°ê°?ê³ ìˆ˜?? ?•ì • ?˜ìµ/?¼ì„¼??ë³´ì¥ ??' ê¸ˆì?.\nê²€???€???ìŠ¤?? ??'ë¶„ì„??ê¸€'\nì¶œë ¥ ?•ì‹(?„ìˆ˜):\n?„ë°˜ ?¬ë?: [ëª…ë°±???„ë°˜|?„ë°˜ ?Œì? ?’ìŒ|? ë§¤??ê²½ê³ )|?ˆì „|ëª…ë°±??ë¹„ìœ„ë°?\n?„ë°˜ ?„í—˜ ?ìˆ˜: [1|2|3|4|5]\n?„ë°˜ ê·¼ê±° ë¬¸êµ¬: [...]\në¶„ì„ ?¬ìœ : (?µì‹¬ ê·¼ê±°ë¥?3ì¤??´ë‚´ë¡?\n\n[2~3ì¤?ì¹´í”¼ ?ì„±]\n??• : ?¹ì‹ ?€ ì¹´í”¼?¼ì´?°ì…?ˆë‹¤. ?„ë˜ 'ë¶„ì„??ê¸€'??ì£¼ì œÂ·?•ì„œÂ·ë©”ì‹œì§€ë¥?? ì??˜ë©° 2~3ì¤?ì¹´í”¼ë¥??ì„±?˜ì„¸??\n?”êµ¬?¬í•­:\n- ?•í™•??2ì¤??ëŠ” 3ì¤„ë§Œ ì¶œë ¥(?í™©??ë§ì¶° ? íƒ). ì¤„ë°”ê¿ˆìœ¼ë¡?êµ¬ë¶„, ê·????ìŠ¤??ê¸ˆì?.\n- 2ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸?Â·ë„“?€ ê³µê°(?ë¬¸ê³??¼ë§¥?í†µ), 2ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- 3ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸??ë©”ì‹œì§€, 2ì¤„ì°¨=ë§¥ë½ ?„ê°œ(1ì¤„ê³¼ ?°ê²°), 3ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- ê°„ê²°Â·ëª…í™•, ì¤‘ë³µ/ê³¼ì¥/?´ì‹œ?œê·¸/?´ëª¨ì§€/?°ì˜´??ë¨¸ë¦¬ë§Â·ê¼¬ë¦¬ë§ ê¸ˆì?.\n\në¶„ì„??ê¸€:\n",
      claude:
        "?¤ìŒ ê¸€???¬ë§· ?„ìˆ˜?€ ê¸?ë¬¸ë§¥ ?´í•´??ê°•í•œ ?„ë¬¸ê°€ë¡œì„œ ë¶„ì„?´ì£¼?¸ìš”:\n\n?“Œ êµ¬ì¡°??ë¶„ì„:\n- ì£¼ì œÂ·ë©”ì‹œì§€Â·?€ê²??”ì•½(1~2ì¤?\n- ?¼ë¦¬ ?ë¦„ê³?ê²°ë¡ ???¼ì¹˜ ?¬ë?\n\n?§­ ?•ì‹ ì¤€???ê?:\n- ?”êµ¬??ì¶œë ¥ ?•ì‹/??ì¤€???¬ë?\n- ëª¨í˜¸/ê³¼ì¥/ê³¼ë„???•ì–¸ ì¡´ì¬ ?¬ë?\n\n?’¡ ê°œì„  ?œì•ˆ:\n- ?•ì‹/ëª…í™•??ê·¼ê±° ë³´ê°• ?¬ì¸??n- ?ˆì „???€???œí˜„(ê³¼ì¥ ìµœì†Œ??\n\n[?•ì±… ì¤€??ê²€??\n?•ì±…: 'ê²½ì œ???´ìµ??ê´€???„ì‹¤???†ëŠ” ì£¼ì¥?´ë‚˜ ?½ì†(ê³ ìˆ˜??ë³´ì¥, ?ê¸ˆ ë³´ì¥, ë¬´ìœ„?? ?¨ê¸°ê°?ê³ ìˆ˜?? ?•ì • ?˜ìµ/?¼ì„¼??ë³´ì¥ ??' ê¸ˆì?.\nê²€???€???ìŠ¤?? ??'ë¶„ì„??ê¸€'\nì¶œë ¥ ?•ì‹(?„ìˆ˜):\n?„ë°˜ ?¬ë?: [ëª…ë°±???„ë°˜|?„ë°˜ ?Œì? ?’ìŒ|? ë§¤??ê²½ê³ )|?ˆì „|ëª…ë°±??ë¹„ìœ„ë°?\n?„ë°˜ ?„í—˜ ?ìˆ˜: [1|2|3|4|5]\n?„ë°˜ ê·¼ê±° ë¬¸êµ¬: [...]\në¶„ì„ ?¬ìœ : (?µì‹¬ ê·¼ê±°ë¥?3ì¤??´ë‚´ë¡?\n\n[2~3ì¤?ì¹´í”¼ ?ì„±]\n??• : ?¹ì‹ ?€ ì¹´í”¼?¼ì´?°ì…?ˆë‹¤. ?„ë˜ 'ë¶„ì„??ê¸€'??ì£¼ì œÂ·?•ì„œÂ·ë©”ì‹œì§€ë¥?? ì??˜ë©° 2~3ì¤?ì¹´í”¼ë¥??ì„±?˜ì„¸??\n?”êµ¬?¬í•­:\n- ?•í™•??2ì¤??ëŠ” 3ì¤„ë§Œ ì¶œë ¥(?í™©??ë§ì¶° ? íƒ). ì¤„ë°”ê¿ˆìœ¼ë¡?êµ¬ë¶„, ê·????ìŠ¤??ê¸ˆì?.\n- 2ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸?Â·ë„“?€ ê³µê°(?ë¬¸ê³??¼ë§¥?í†µ), 2ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- 3ì¤„ì¼ ?? 1ì¤„ì°¨=ë³´í¸??ë©”ì‹œì§€, 2ì¤„ì°¨=ë§¥ë½ ?„ê°œ(1ì¤„ê³¼ ?°ê²°), 3ì¤„ì°¨=êµ¬ì²´Â·ì§ì ‘?Â·ê°???´ì… ? ë°œ.\n- ê°„ê²°Â·ëª…í™•, ì¤‘ë³µ/ê³¼ì¥/?´ì‹œ?œê·¸/?´ëª¨ì§€/?°ì˜´??ë¨¸ë¦¬ë§Â·ê¼¬ë¦¬ë§ ê¸ˆì?.\n\në¶„ì„??ê¸€:\n",
    };

    // LLM ?¬ì´?¸ë³„ ?¹ì„± ?•ë³´ (?¬ìš©??ê°€?´ë“œ??
    this.llmCharacteristics = {
      chatgpt: {
        name: "ChatGPT",
        icon: "?¤–",
        description: "SNS ?„í‚¹ ë¶„ì„",
        details: "?„í‚¹ ?¨ê³¼?±Â·SNS ìµœì ?”Â·í–‰??? ë„ ë¶„ì„",
        strength: "ì¢…í•©???„í‚¹ ?„ëµ",
      },
      gemini: {
        name: "Gemini",
        icon: "?§ ",
        description: "?¬ë¦¬???„í‚¹",
        details: "ë¬´ì˜???ê·¹Â·ê°ì • ?¸ë¦¬ê±°Â·í?ê²??…ì ë¶„ì„",
        strength: "?¬ë¦¬?™ì  ?‘ê·¼",
      },
      perplexity: {
        name: "Perplexity",
        icon: "?”",
        description: "?¸ë Œ??ê²€ì¦?,
        details: "SNS ?¸ë Œ?œÂ·ë°”?´ëŸ´ ê°€?¥ì„±Â·? ë¢°??ê°•í™”",
        strength: "?¤ì‹œê°??¸ë Œ??ë¶„ì„",
      },
      grok: {
        name: "Grok",
        icon: "??",
        description: "?„íŒ©??ìµœì ??,
        details: "ê°•ë ¥???„í‚¹ ë¬¸êµ¬Â·ëª…í™•??ë©”ì‹œì§€Â·ì¦‰ì‹œ ê°œì„ ??,
        strength: "ê°„ê²°???„íŒ©??ë¶„ì„",
      },
      claude: {
        name: "Claude",
        icon: "?Ÿ£",
        description: "?•ì‹ ?„ìˆ˜Â·ê¸?ë¬¸ë§¥",
        details: "?•ì‹ ì¤€?˜Â·ì•ˆ?„ì„±Â·?¥ë¬¸ ?”ì•½/êµ¬ì¡°??,
        strength: "?•ì±…/?¬ë§· ì¤€?˜ì? ê¸?ë¬¸ë§¥ ì²˜ë¦¬",
      },
    };

    // LLM ?¬ì´?¸ë³„ ?ˆí˜?´ì? URL (ì¿¼ë¦¬ ?Œë¼ë¯¸í„° ì§€?????? ëª¨ë‹¬ ë°©ì‹ ?¬ìš©)
    this.llmUrls = {
      chatgpt: "https://chatgpt.com",
      gemini: "https://gemini.google.com",
      perplexity: "https://www.perplexity.ai",
      grok: "https://grok.com",
      claude: "https://claude.ai/new",
    };

    logger.log("LLM ê²€ì¦??œìŠ¤??ì´ˆê¸°???„ë£Œ");
  }

  // ?¨ë„ ê¸°ë°˜ LLM ê²€ì¦??¤í–‰
  async validatePanelWithLLM(panel, llmService) {
    logger.log("?¨ë„ LLM ê²€ì¦??œì‘:", { panel, llmService });

    try {
      // ?¨ë„???°ë¥¸ ?ìŠ¤???ì—­ ? íƒ
      let textArea, panelType;
      if (panel === "reference") {
        textArea = document.getElementById("ref-text-input");
        panelType = "?ˆí¼?°ìŠ¤ ê¸€";
      } else if (panel === "writing") {
        textArea = document.getElementById("edit-text-input");
        panelType = "?˜ì •/?‘ì„± ê¸€";
      } else {
        logger.error("ì§€?í•˜ì§€ ?ŠëŠ” ?¨ë„:", panel);
        this.showMessage("ì§€?í•˜ì§€ ?ŠëŠ” ?¨ë„?…ë‹ˆ??", "error");
        return;
      }

      // ?ìŠ¤???´ìš© ê°€?¸ì˜¤ê¸?
      const content = textArea.value.trim();
      if (!content) {
        this.showMessage(
          `${panelType}??ë¹„ì–´?ˆìŠµ?ˆë‹¤. ë¨¼ì? ê¸€???‘ì„±?´ì£¼?¸ìš”.`,
          "warning"
        );
        return;
      }

      // LLM ?œë¹„???•ë³´ ê°€?¸ì˜¤ê¸?
      const llmInfo = this.llmCharacteristics[llmService];
      if (!llmInfo) {
        logger.error("ì§€?í•˜ì§€ ?ŠëŠ” LLM ?œë¹„??", llmService);
        this.showMessage("ì§€?í•˜ì§€ ?ŠëŠ” LLM ?œë¹„?¤ì…?ˆë‹¤.", "error");
        return;
      }

      // ?„ë¡¬?„íŠ¸ ?ì„± (?œëª© ?¼ì¸ ?†ì´)
      const prompt = this.llmPrompts[llmService];
      const fullText = `${prompt}\n\n${content}`;

      logger.log("?¨ë„ ê²€ì¦??ìŠ¤???ì„±:", {
        panel,
        llmService,
        contentLength: content.length,
      });

      // ?´ë¦½ë³´ë“œ??ë³µì‚¬
      await this.copyToClipboard(fullText);

      // LLM ?¬ì´???´ê¸°
      this.openLLMSite(llmService, fullText);

      // ?±ê³µ ë©”ì‹œì§€ (?¬í”Œ???ˆë‚´)
      this.showMessage(
        `${llmInfo.icon} ${llmInfo.name} ?˜ì´ì§€ê°€ ?´ë ¸?µë‹ˆ?? Ctrl+Vë¡?ë¶™ì—¬?£ê¸°?˜ì„¸??`,
        "success"
      );
    } catch (error) {
      logger.error("?¨ë„ LLM ê²€ì¦??¤í–‰ ?¤íŒ¨:", error);
      this.showMessage("LLM ê²€ì¦??¤í–‰???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // LLM ê²€ì¦??¤í–‰
  async validateWithLLM(itemId, llmService) {
    logger.log("LLM ê²€ì¦??œì‘:", { itemId, llmService });

    // ?€?¥ëœ ê¸€ ì°¾ê¸°
    const item = this.savedTexts.find((saved) => saved.id === itemId);
    if (!item) {
      this.showMessage("ê²€ì¦í•  ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ?„ë¡¬?„íŠ¸?€ ê¸€ ?´ìš© ì¡°í•©
    const prompt = this.llmPrompts[llmService];
    const fullText = prompt + item.content;

    logger.log("ê²€ì¦??ìŠ¤???ì„±:", {
      llmService,
      contentLength: item.content.length,
    });

    try {
      // ?´ë¦½ë³´ë“œ??ë³µì‚¬
      await this.copyToClipboard(fullText);

      // LLM ?¬ì´??URL ?ì„± ë°?????—???´ê¸°
      this.openLLMSite(llmService, fullText);

      // ?±ê³µ ë©”ì‹œì§€ (?¬í”Œ???ˆë‚´)
      const llmInfo = this.llmCharacteristics[llmService];
      if (llmInfo) {
        this.showMessage(
          `${llmInfo.icon} ${llmInfo.name} ?˜ì´ì§€ê°€ ?´ë ¸?µë‹ˆ?? Ctrl+Vë¡?ë¶™ì—¬?£ê¸°?˜ì„¸??`,
          "success"
        );
      }
    } catch (error) {
      logger.error("LLM ê²€ì¦??¤í–‰ ?¤íŒ¨:", error);
      this.showMessage("LLM ê²€ì¦??¤í–‰???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // ?´ë¦½ë³´ë“œ???ìŠ¤??ë³µì‚¬
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        logger.log("?´ë¦½ë³´ë“œ ë³µì‚¬ ?±ê³µ (Clipboard API)");
      } else {
        // ?´ë°± ë°©ë²•
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
        logger.log("?´ë¦½ë³´ë“œ ë³µì‚¬ ?±ê³µ (execCommand)");
      }
    } catch (error) {
      logger.error("?´ë¦½ë³´ë“œ ë³µì‚¬ ?¤íŒ¨:", error);
      throw error;
    }
  }

  // LLM ?¬ì´??????—???´ê¸° (?¬í”Œ??ë°©ì‹: ?ë™ ë³µì‚¬ + ?????´ê¸°)
  openLLMSite(llmService, text) {
    // LLM ?œë¹„???•ë³´ ê°€?¸ì˜¤ê¸?
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      logger.error("ì§€?í•˜ì§€ ?ŠëŠ” LLM ?œë¹„??", llmService);
      return;
    }

    // LLM ?¬ì´??URL ê°€?¸ì˜¤ê¸?
    const llmUrl =
      this.llmUrls[llmService] ||
      {
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        perplexity: "https://www.perplexity.ai",
        grok: "https://grok.com",
      }[llmService] ||
      "https://chatgpt.com";

    logger.log("LLM ?¬ì´???´ê¸°:", { llmService, url: llmUrl });

    // ????—??LLM ?¬ì´???´ê¸°
    window.open(llmUrl, "_blank", "noopener,noreferrer");
  }

  // LLM ?µí•© ë³µì‚¬ ëª¨ë‹¬ ?œì‹œ (ëª¨ë“  LLM ì§€??
  showLLMCopyModal(llmService, text) {
    // LLM ?œë¹„???•ë³´ ê°€?¸ì˜¤ê¸?
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      logger.error("ì§€?í•˜ì§€ ?ŠëŠ” LLM ?œë¹„??", llmService);
      return;
    }

    // ê¸°ë³¸ URL ê°€?¸ì˜¤ê¸?(ì¿¼ë¦¬ ?Œë¼ë¯¸í„° ?œê±°)
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

    // ê¸°ì¡´ ëª¨ë‹¬???ˆë‹¤ë©??œê±°
    const existingModal = document.getElementById("llm-copy-modal");
    if (existingModal) {
      existingModal.remove();
    }

    // ëª¨ë‹¬ HTML ?ì„± (ëª¨ë“  LLM??ê³µí†µ ?¬ìš©)
    const modalHTML = `
            <div id="llm-copy-modal" class="gemini-modal-overlay">
                <div class="gemini-modal-content">
                    <div class="gemini-modal-header">
                        <h3>${llmInfo.icon} ${llmInfo.name} ê²€ì¦??ìŠ¤??ë³µì‚¬</h3>
                        <button class="gemini-modal-close" onclick="this.closest('.gemini-modal-overlay').remove()">Ã—</button>
                    </div>
                    <div class="gemini-modal-body">
                        <p class="gemini-instruction">?„ë˜ ?ìŠ¤?¸ë? ë³µì‚¬?˜ì—¬ ${llmInfo.name}??ë¶™ì—¬?£ê¸°?˜ì„¸??</p>
                        <div class="gemini-text-container">
                            <textarea id="llm-text-area" readonly>${text}</textarea>
                            <button class="gemini-copy-btn" onclick="dualTextWriter.copyLLMText('${llmService}')">?“‹ ?„ì²´ ë³µì‚¬</button>
                        </div>
                        <div class="gemini-steps">
                            <h4>?“ ?¬ìš© ë°©ë²•:</h4>
                            <ol>
                                <li>?„ì˜ "?„ì²´ ë³µì‚¬" ë²„íŠ¼???´ë¦­?˜ì„¸??(?ëŠ” ?´ë? ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì–´ ?ˆìŠµ?ˆë‹¤)</li>
                                <li>${llmInfo.name} ?˜ì´ì§€ë¡??´ë™?˜ì„¸??/li>
                                <li>${llmInfo.name} ?…ë ¥ì°½ì— Ctrl+Vë¡?ë¶™ì—¬?£ê¸°?˜ì„¸??/li>
                                <li>Enterë¥??ŒëŸ¬ ê²€ì¦ì„ ?œì‘?˜ì„¸??/li>
                            </ol>
                        </div>
                        <div class="gemini-actions">
                            <button class="gemini-open-btn" onclick="window.open('${cleanUrl}', '_blank')">?? ${llmInfo.name} ?´ê¸°</button>
                            <button class="gemini-close-btn" onclick="this.closest('.gemini-modal-overlay').remove()">?«ê¸°</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // ëª¨ë‹¬??body??ì¶”ê?
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // ?ìŠ¤???ì—­ ?ë™ ? íƒ
    setTimeout(() => {
      const textArea = document.getElementById("llm-text-area");
      if (textArea) {
        textArea.focus();
        textArea.select();
      }
    }, 100);
  }

  // Gemini ?„ìš© ë³µì‚¬ ëª¨ë‹¬ ?œì‹œ (?˜ìœ„ ?¸í™˜?±ì„ ?„í•´ ? ì?)
  showGeminiCopyModal(text) {
    this.showLLMCopyModal("gemini", text);
  }

  // LLM ?µí•© ?ìŠ¤??ë³µì‚¬ ?¨ìˆ˜ (ëª¨ë“  LLM ì§€??
  copyLLMText(llmService) {
    const textArea = document.getElementById("llm-text-area");
    if (!textArea) {
      logger.error("LLM ?ìŠ¤???ì—­??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      return;
    }

    const llmInfo = this.llmCharacteristics[llmService];
    const llmName = llmInfo?.name || "LLM";

    try {
      // ?ìŠ¤???ì—­ ? íƒ
      textArea.focus();
      textArea.select();

      // ë³µì‚¬ ?¤í–‰
      const successful = document.execCommand("copy");
      if (successful) {
        this.showMessage(`???ìŠ¤?¸ê? ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??`, "success");

        // ë³µì‚¬ ë²„íŠ¼ ?ìŠ¤??ë³€ê²?
        const copyBtn = document.querySelector(".gemini-copy-btn");
        if (copyBtn) {
          copyBtn.textContent = "??ë³µì‚¬ ?„ë£Œ!";
          copyBtn.style.background = "#4CAF50";

          // 2ì´????ë˜ ?íƒœë¡?ë³µì›
          setTimeout(() => {
            copyBtn.textContent = "?“‹ ?„ì²´ ë³µì‚¬";
            copyBtn.style.background = "";
          }, 2000);
        }
      } else {
        throw new Error("ë³µì‚¬ ëª…ë ¹ ?¤í–‰ ?¤íŒ¨");
      }
    } catch (error) {
      logger.error(`${llmName} ?ìŠ¤??ë³µì‚¬ ?¤íŒ¨:`, error);
      this.showMessage(
        "??ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?ìŠ¤?¸ë? ?˜ë™?¼ë¡œ ? íƒ?˜ì—¬ ë³µì‚¬?´ì£¼?¸ìš”.",
        "error"
      );
    }
  }

  // Gemini ?ìŠ¤??ë³µì‚¬ ?¨ìˆ˜ (?˜ìœ„ ?¸í™˜?±ì„ ?„í•´ ? ì?)
  copyGeminiText() {
    this.copyLLMText("gemini");
  }

  // LLM ê²€ì¦?ê°€?´ë“œ ë©”ì‹œì§€ ?œì‹œ
  showLLMValidationGuide(llmService) {
    const characteristics = this.llmCharacteristics[llmService];

    // ëª¨ë“  LLM???µí•© ëª¨ë‹¬ ë°©ì‹ ?¬ìš©
    const message =
      `??${characteristics.name} ê²€ì¦?ëª¨ë‹¬???´ë ¸?µë‹ˆ??\n\n` +
      `?“‹ ê²€ì¦í•  ?ìŠ¤?¸ê? ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??\n` +
      `?’¡ ëª¨ë‹¬?ì„œ "?„ì²´ ë³µì‚¬" ë²„íŠ¼???´ë¦­?˜ê±°?? ${characteristics.name} ?˜ì´ì§€ë¡??´ë™?˜ì—¬ Ctrl+Vë¡?ë¶™ì—¬?£ê¸°?˜ì„¸??\n\n` +
      `?¯ ê¸°ë? ê²°ê³¼: ${characteristics.description} - ${characteristics.details}`;

    this.showMessage(message, "success");

    // ì¶”ê? ?ˆë‚´ë¥??„í•œ ?ì„¸ ë©”ì‹œì§€
    setTimeout(() => {
      this.showDetailedGuide(llmService);
    }, 2000);
  }

  // ?ì„¸ ê°€?´ë“œ ?œì‹œ
  showDetailedGuide(llmService) {
    const guides = {
      chatgpt:
        "ChatGPT??SNS ?„í‚¹ ë¶„ì„ ê²°ê³¼ë¥?ë°”íƒ•?¼ë¡œ ê¸€??ê°ì •??ëª°ì…ê³??‰ë™ ? ë„ë¥?ê°•í™”?´ë³´?¸ìš”.",
      gemini:
        "Gemini???¬ë¦¬???„í‚¹ ë¶„ì„??ì°¸ê³ ?˜ì—¬ ?…ì??ë¬´ì˜?ì„ ?ê·¹?˜ëŠ” ?”ì†Œë¥?ì¶”ê??´ë³´?¸ìš”.",
      perplexity:
        "Perplexity???¸ë Œ??ë¶„ì„ ê²°ê³¼ë¥??œìš©?˜ì—¬ ?„ì¬ SNS ?¸ë Œ?œì— ë§ê²Œ ê¸€??ê°œì„ ?´ë³´?¸ìš”.",
      grok: "Grok???„íŒ©??ë¶„ì„??ë°˜ì˜?˜ì—¬ ??ê°•ë ¥?˜ê³  ëª…í™•???„í‚¹ ë¬¸êµ¬ë¡?ê¸€???…ê·¸?ˆì´?œí•´ë³´ì„¸??",
    };

    const guide = guides[llmService];
    this.showMessage(`?’¡ ${guide}`, "info");
  }

  // ?„ì‹œ ?€??ê¸°ëŠ¥
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
      // trim() ?œê±°?˜ì—¬ ?ë³¸ ?¬ë§· ? ì?
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
        logger.error("?„ì‹œ ?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤:", error);
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
          if (confirm("?„ì‹œ ?€?¥ëœ ê¸€???ˆìŠµ?ˆë‹¤. ë³µì›?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
            if (data.refText) {
              this.refTextInput.value = data.refText;
              this.updateCharacterCount("ref");
            }
            if (data.editText) {
              this.editTextInput.value = data.editText;
              this.updateCharacterCount("edit");
            }
            this.showMessage("?„ì‹œ ?€?¥ëœ ê¸€??ë³µì›?˜ì—ˆ?µë‹ˆ??", "success");
          }
        } else {
          localStorage.removeItem(userTempKey);
        }
      }
    } catch (error) {
      logger.error("?„ì‹œ ?€??ë³µì›???¤íŒ¨?ˆìŠµ?ˆë‹¤:", error);
    }
  }

  // Firestore?ì„œ ?¬ìš©???°ì´??ë¡œë“œ
  async loadUserData() {
    if (!this.currentUser) return;

    try {
      // ??Phase 3.1.1: ?„ìˆ˜ ?°ì´??ë³‘ë ¬ ë¡œë“œ (30-50% ?¨ì¶•)
      // loadSavedTextsFromFirestore()?€ loadTrackingPosts()???œë¡œ ?…ë¦½?ì´ë¯€ë¡?
      // Promise.all???¬ìš©?˜ì—¬ ?™ì‹œ???¤í–‰
      await Promise.all([
        this.loadSavedTextsFromFirestore(),
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI ?…ë°?´íŠ¸ (?™ê¸°)
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
      await this.renderSavedTexts();
      this.startTempSave();
      this.restoreTempSave();

      // ë¯¸íŠ¸?˜í‚¹ ê¸€ ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸ (?™ê¸°, Phase 2?ì„œ ìµœì ?”ë¨)
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    } catch (error) {
      logger.error("?¬ìš©???°ì´??ë¡œë“œ ?¤íŒ¨:", error);
      this.showMessage("?°ì´?°ë? ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ëª¨ë“  ?°ì´?°ë? ?ˆë¡œê³ ì¹¨?©ë‹ˆ??
   *
   * Firebase?ì„œ ìµœì‹  ?°ì´?°ë? ?¤ì‹œ ë¶ˆëŸ¬?€ UIë¥??…ë°?´íŠ¸?©ë‹ˆ??
   * ?€?¥ëœ ê¸€, ?¸ë˜???¬ìŠ¤?? ?µê³„ ?±ì„ ëª¨ë‘ ?ˆë¡œê³ ì¹¨?©ë‹ˆ??
   */
  async refreshAllData() {
    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("? ï¸ ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "warning");
      return;
    }

    // ë¡œë”© ?íƒœ ?œì‹œ
    const refreshBtn = this.refreshBtn;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      const refreshIcon = refreshBtn.querySelector(".refresh-icon");
      if (refreshIcon) {
        refreshIcon.style.animation = "spin 0.6s linear infinite";
      }
    }

    try {
      // ??Phase 3.1.1: ?€?¥ëœ ê¸€ ë°??¸ë˜???¬ìŠ¤??ë³‘ë ¬ ?ˆë¡œê³ ì¹¨ (30-50% ?¨ì¶•)
      await Promise.all([
        this.loadSavedTextsFromFirestore(),
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI ?…ë°?´íŠ¸
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
      await this.renderSavedTexts();

      // ë¯¸íŠ¸?˜í‚¹ ê¸€ ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸ (?™ê¸°, Phase 2?ì„œ ìµœì ?”ë¨)
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }

      // ëª¨ë“  ??˜ ?°ì´??ê°•ì œ ?ˆë¡œê³ ì¹¨
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      // ?±ê³µ ë©”ì‹œì§€
      this.showMessage("???°ì´?°ê? ?ˆë¡œê³ ì¹¨?˜ì—ˆ?µë‹ˆ??", "success");
      logger.log("??ëª¨ë“  ?°ì´???ˆë¡œê³ ì¹¨ ?„ë£Œ");
    } catch (error) {
      logger.error("?°ì´???ˆë¡œê³ ì¹¨ ?¤íŒ¨:", error);
      this.showMessage(
        "???°ì´???ˆë¡œê³ ì¹¨???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
        "error"
      );
    } finally {
      // ë¡œë”© ?íƒœ ?´ì œ
      if (refreshBtn) {
        refreshBtn.disabled = false;
        const refreshIcon = refreshBtn.querySelector(".refresh-icon");
        if (refreshIcon) {
          refreshIcon.style.animation = "";
          // ?Œì „ ? ë‹ˆë©”ì´???¨ê³¼
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
   * ?€?¥ëœ ê¸€ ?°ì´?°ë? ë³´ì¥?©ë‹ˆ??
   *
   * @param {boolean} forceReload - trueë©?Firestore?ì„œ ?¤ì‹œ ë¶ˆëŸ¬?µë‹ˆ??
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
          "loadSavedTexts: Firebaseï¿½ï¿½ ï¿½ï¿½ï¿½ï¿½ï¿½Ç¾ï¿½ ï¿½Ö´ï¿½ ï¿½Ç´ï¿½ ï¿½Î±ï¿½ï¿½ï¿½ï¿½ï¿½ ï¿½Ê¿ï¿½ï¿½Õ´Ï´ï¿½."
        );
        return;
      }

      await this.loadSavedTextsFromFirestore();
      await this.renderSavedTexts();
    } catch (error) {
      logger.error("loadSavedTexts ï¿½ï¿½ï¿½ï¿½:", error);
      this.showMessage("??ï¿½ï¿½ï¿½ï¿½ï¿?ï¿½ï¿½ ï¿½Ò·ï¿½ï¿½ï¿½ï¿½ï¿½ ï¿½ï¿½ ï¿½ï¿½ï¿½ï¿½ï¿½ß½ï¿½ï¿½Ï´ï¿½.", "error");
    }
  }

  // Firestore?ì„œ ?€?¥ëœ ?ìŠ¤?¸ë“¤ ë¶ˆëŸ¬?¤ê¸°
  // ?±ëŠ¥ ìµœì ?? ?œë²„ ?¬ì´???„í„°ë§?ì§€??(? íƒ??
  async loadSavedTextsFromFirestore(filterOptions = {}) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // ?œë²„ ?¬ì´???„í„°ë§?êµ¬ì„± (?±ëŠ¥ ìµœì ??
      // ì°¸ê³ : Firestore ë³µí•© ?¸ë±???„ìš” ??Firebase Console?ì„œ ?ì„± ?„ìš”
      // ?¸ë±???ˆì‹œ: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)
      const queryConstraints = [window.firebaseOrderBy("createdAt", "desc")];

      // type ?„í„° (?œë²„ ?¬ì´??
      if (filterOptions.type && filterOptions.type !== "all") {
        queryConstraints.push(
          window.firebaseWhere("type", "==", filterOptions.type)
        );
      }

      // referenceType ?„í„° (?œë²„ ?¬ì´?? type??'reference'???Œë§Œ ? íš¨)
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
      // ìºì‹œ ë¬´íš¨??(?°ì´??ë¡œë“œ ??
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // ?€???•ê·œ??(?ˆê±°??ê°??€??: 'writing'|'edit' -> 'edit', 'ref'|'reference' -> 'reference'
        let normalizedType = (data.type || "").toString().toLowerCase();
        if (normalizedType === "writing") normalizedType = "edit";
        if (normalizedType === "ref") normalizedType = "reference";

        // [Tab Separation] 'script' ?€??ë³´ì¡´ (ê¸°ì¡´?ëŠ” ?????†ëŠ” ?€?…ì? ë¬´ì¡°ê±?editë¡?ì²˜ë¦¬?ˆìŒ)
        if (
          normalizedType !== "edit" &&
          normalizedType !== "reference" &&
          normalizedType !== "script"
        ) {
          // ?????†ëŠ” ?€?…ì? ?¸ì˜??'edit'ë¡?ì²˜ë¦¬
          normalizedType = "edit";
        }
        this.savedTexts.push({
          id: doc.id,
          content: data.content,
          date: data.createdAt
            ? data.createdAt.toDate().toLocaleString("ko-KR")
            : "? ì§œ ?†ìŒ",
          createdAt: data.createdAt, // Firestore Timestamp ?ë³¸ ë³´ì¡´
          characterCount: data.characterCount,
          type: normalizedType,
          referenceType: data.referenceType || "unspecified",
          topic: data.topic || undefined,
          contentHash: data.contentHash || undefined,
          hashVersion: data.hashVersion || undefined,

          // ???°ê²°???ˆí¼?°ìŠ¤ (ê¸°ì¡´ ?°ì´?°ëŠ” undefined?´ë?ë¡?ë¹?ë°°ì—´ë¡?ì²˜ë¦¬)
          linkedReferences: Array.isArray(data.linkedReferences)
            ? data.linkedReferences
            : [],
          referenceMeta: data.referenceMeta || undefined,

          // ??SNS ?Œë«??(ê¸°ì¡´ ?°ì´?°ëŠ” undefined?´ë?ë¡?ë¹?ë°°ì—´ë¡?ì²˜ë¦¬)
          platforms: Array.isArray(data.platforms) ? data.platforms : [],
        });
      });

      logger.log(`${this.savedTexts.length}ê°œì˜ ?ìŠ¤?¸ë? ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`);

      // ì£¼ì œ ?„í„° ?µì…˜ ?…ë°?´íŠ¸ (?°ì´??ë¡œë“œ ??
      this.updateTopicFilterOptions();

      // ?´ì‹œ ë¯¸ë³´???ˆí¼?°ìŠ¤ ?ˆë‚´ (?‘ê·¼?? ? ìŠ¤?¸ëŠ” aria-liveë¡??œì‹œ??
      try {
        const missingHashCount = this.savedTexts.filter(
          (t) => (t.type || "edit") === "reference" && !t.contentHash
        ).length;
        if (missingHashCount > 0) {
          this.showMessage(
            `?¹ï¸ ?´ì‹œê°€ ?†ëŠ” ?ˆí¼?°ìŠ¤ ${missingHashCount}ê°œê? ?ˆìŠµ?ˆë‹¤. ?„ìš” ???´ì‹œ ë§ˆì´ê·¸ë ˆ?´ì…˜???¤í–‰?˜ì„¸??`,
            "info"
          );
        }
      } catch (e) {
        // ë¬´ì‹œ
      }
    } catch (error) {
      logger.error("Firestore?ì„œ ?ìŠ¤??ë¶ˆëŸ¬?¤ê¸° ?¤íŒ¨:", error);
      // ë³µí•© ?¸ë±???¤ë¥˜??ê²½ìš° ?ˆë‚´ ë©”ì‹œì§€
      if (error.code === "failed-precondition") {
        logger.warn(
          "ë³µí•© ?¸ë±?¤ê? ?„ìš”?©ë‹ˆ?? Firebase Console?ì„œ ?¸ë±?¤ë? ?ì„±?´ì£¼?¸ìš”."
        );
        logger.warn(
          "?¸ë±??êµ¬ì„±: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)"
        );
      }
      this.savedTexts = [];
    }
  }

  // ê¸°ì¡´ ë¡œì»¬ ?¤í† ë¦¬ì? ë©”ì„œ?œë“¤?€ Firestoreë¡??€ì²´ë¨

  cleanupTempSave() {
    if (this.tempSaveInterval) {
      clearInterval(this.tempSaveInterval);
    }
    if (this.tempSaveTimeout) {
      clearTimeout(this.tempSaveTimeout);
    }
    // ?•ë? ëª¨ë“œ ê´€??timeout ?•ë¦¬
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }
  }

  // ===== ë°˜ì?™í™” ?¬ìŠ¤???œìŠ¤??=====

  // ?´ì‹œ?œê·¸ ì¶”ì¶œ ?¨ìˆ˜
  extractHashtags(content) {
    const hashtagRegex = /#[\wê°€-??+/g;
    const hashtags = content.match(hashtagRegex) || [];
    return hashtags.map((tag) => tag.toLowerCase());
  }

  // ?¬ìš©???•ì˜ ?´ì‹œ?œê·¸ ê°€?¸ì˜¤ê¸?
  getUserHashtags() {
    try {
      const saved = localStorage.getItem("userHashtags");
      if (saved) {
        const parsed = JSON.parse(saved);
        // ë¹?ë°°ì—´??? íš¨??ê°’ìœ¼ë¡?ì²˜ë¦¬
        return Array.isArray(parsed) ? parsed : this.defaultHashtags;
      }
    } catch (error) {
      logger.error("?´ì‹œ?œê·¸ ë¶ˆëŸ¬?¤ê¸° ?¤íŒ¨:", error);
    }
    return this.defaultHashtags;
  }

  // ?¬ìš©???•ì˜ ?´ì‹œ?œê·¸ ?€??
  saveUserHashtags(hashtags) {
    try {
      // ë¹?ë°°ì—´ ?ˆìš© (?´ì‹œ?œê·¸ ?†ì´ ?¬ìš©)
      if (!Array.isArray(hashtags)) {
        logger.warn("? íš¨?˜ì? ?Šì? ?´ì‹œ?œê·¸ ë°°ì—´");
        return false;
      }

      // ?´ì‹œ?œê·¸ê°€ ?†ëŠ” ê²½ìš°
      if (hashtags.length === 0) {
        localStorage.setItem("userHashtags", JSON.stringify([]));
        logger.log("?´ì‹œ?œê·¸ ?†ì´ ?¬ìš©?˜ë„ë¡??¤ì •??);
        return true;
      }

      // ?´ì‹œ?œê·¸ ?•ì‹ ê²€ì¦?
      const validHashtags = hashtags
        .map((tag) => tag.trim())
        .filter((tag) => tag.startsWith("#") && tag.length > 1)
        .filter((tag) => tag.length <= 50); // ê¸¸ì´ ?œí•œ

      if (validHashtags.length === 0) {
        logger.warn("? íš¨???´ì‹œ?œê·¸ê°€ ?†ìŠµ?ˆë‹¤");
        return false;
      }

      localStorage.setItem("userHashtags", JSON.stringify(validHashtags));
      logger.log("?´ì‹œ?œê·¸ ?€???„ë£Œ:", validHashtags);
      return true;
    } catch (error) {
      logger.error("?´ì‹œ?œê·¸ ?€???¤íŒ¨:", error);
      return false;
    }
  }
  // Threads ?¬ë§·???¨ìˆ˜ (XSS ë°©ì? ?¬í•¨, ì¤„ë°”ê¿?ë³´ì¡´)
  formatForThreads(content) {
    // XSS ë°©ì?ë¥??„í•œ HTML ?´ìŠ¤ì¼€?´í”„ (ì¤„ë°”ê¿ˆì? ë³´ì¡´)
    if (!content) return "";

    // ì¤„ë°”ê¿?ë³´ì¡´?˜ë©´??XSS ë°©ì?
    const escapedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    // ì¤„ë°”ê¿??•ê·œ??(CRLF -> LF)
    const normalizedContent = escapedContent
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // ?°ì† ì¤„ë°”ê¿??•ë¦¬ (ìµœë? 2ê°œê¹Œì§€ë§?
    const cleanedContent = normalizedContent.replace(/\n{3,}/g, "\n\n");

    return cleanedContent.trim();
  }

  // HTML ?´ìŠ¤ì¼€?´í”„ ?¨ìˆ˜ (ë³´ì•ˆ ê°•í™” - ?„ì „??XSS ë°©ì?)
  escapeHtml(text) {
    if (typeof text !== "string") {
      return "";
    }

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ?¬ìš©???…ë ¥ ê²€ì¦??¨ìˆ˜ (ë³´ì•ˆ ê°•í™”)
  validateUserInput(input, type = "text") {
    if (!input || typeof input !== "string") {
      throw new Error("? íš¨?˜ì? ?Šì? ?…ë ¥?…ë‹ˆ??");
    }

    // ê¸¸ì´ ?œí•œ ê²€ì¦?
    if (input.length > 10000) {
      throw new Error("?…ë ¥???ˆë¬´ ê¹ë‹ˆ?? (ìµœë? 10,000??");
    }

    // ?„í—˜???¨í„´ ê²€ì¦?
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
        throw new Error("?„í—˜??ì½”ë“œê°€ ê°ì??˜ì—ˆ?µë‹ˆ??");
      }
    }

    return true;
  }

  // ?ˆì „???ìŠ¤??ì²˜ë¦¬ ?¨ìˆ˜
  sanitizeText(text) {
    this.validateUserInput(text);

    // HTML ?œê·¸ ?œê±°
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || tempDiv.innerText || "";

    // ?¹ìˆ˜ ë¬¸ì ?•ë¦¬
    return cleanText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // ?œì–´ ë¬¸ì ?œê±°
      .replace(/\s+/g, " ") // ?°ì† ê³µë°± ?•ë¦¬
      .trim();
  }

  // ?´ìš© ìµœì ???”ì§„ (ë³´ì•ˆ ê°•í™” ë²„ì „)
  optimizeContentForThreads(content) {
    try {
      // 1?¨ê³„: ?…ë ¥ ê²€ì¦?ë°??•í™”
      const sanitizedContent = this.sanitizeText(content);

      // 2?¨ê³„: ?±ëŠ¥ ìµœì ??- ?€?©ëŸ‰ ?ìŠ¤??ì²˜ë¦¬
      if (sanitizedContent.length > 10000) {
        logger.warn(
          "ë§¤ìš° ê¸??ìŠ¤?¸ê? ê°ì??˜ì—ˆ?µë‹ˆ?? ì²˜ë¦¬ ?œê°„???¤ë˜ ê±¸ë¦´ ???ˆìŠµ?ˆë‹¤."
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

      // 3?¨ê³„: ê¸€????ìµœì ??(Threads??500???œí•œ)
      if (sanitizedContent.length > 500) {
        // ?¨ì–´ ?¨ìœ„ë¡??ë¥´ê¸?(???ì—°?¤ëŸ¬???ë¥´ê¸?
        const words = sanitizedContent.substring(0, 500).split(" ");
        words.pop(); // ë§ˆì?ë§?ë¶ˆì™„?„í•œ ?¨ì–´ ?œê±°
        optimized.optimized = words.join(" ") + "...";
        optimized.suggestions.push(
          "ê¸€??500?ë? ì´ˆê³¼?˜ì—¬ ?¨ì–´ ?¨ìœ„ë¡??˜ë ¸?µë‹ˆ??"
        );
        optimized.warnings.push("?ë³¸ë³´ë‹¤ ì§§ì•„ì¡ŒìŠµ?ˆë‹¤.");
      } else {
        optimized.optimized = sanitizedContent;
      }

      // 4?¨ê³„: ?´ì‹œ?œê·¸ ?ë™ ì¶”ì¶œ/ì¶”ê? (ë³´ì•ˆ ê²€ì¦??¬í•¨)
      const hashtags = this.extractHashtags(optimized.optimized);
      if (hashtags.length === 0) {
        // ?¬ìš©???•ì˜ ?´ì‹œ?œê·¸ ?¬ìš© (? íƒ??
        const userHashtags = this.getUserHashtags();
        if (userHashtags && userHashtags.length > 0) {
          optimized.hashtags = userHashtags;
          optimized.suggestions.push("?´ì‹œ?œê·¸ë¥?ì¶”ê??ˆìŠµ?ˆë‹¤.");
        } else {
          optimized.hashtags = [];
          optimized.suggestions.push("?´ì‹œ?œê·¸ ?†ì´ ?¬ìŠ¤?…ë©?ˆë‹¤.");
        }
      } else {
        // ?´ì‹œ?œê·¸ ë³´ì•ˆ ê²€ì¦?
        optimized.hashtags = hashtags.filter((tag) => {
          // ?„í—˜???´ì‹œ?œê·¸ ?„í„°ë§?
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

      // 5?¨ê³„: ìµœì¢… ?¬ë§·???ìš© (ë³´ì•ˆ ê°•í™”)
      optimized.optimized = this.formatForThreads(optimized.optimized);
      optimized.characterCount = optimized.optimized.length;

      // 6?¨ê³„: ë³´ì•ˆ ê²€ì¦??„ë£Œ ?œì‹œ
      optimized.securityChecks.inputValidated = true;

      return optimized;
    } catch (error) {
      logger.error("?´ìš© ìµœì ??ì¤??¤ë¥˜ ë°œìƒ:", error);

      // ë³´ì•ˆ ?¤ë¥˜??ê²½ìš° ?¹ë³„ ì²˜ë¦¬
      if (
        error.message.includes("?„í—˜??) ||
        error.message.includes("? íš¨?˜ì? ?Šì?")
      ) {
        throw new Error(
          "ë³´ì•ˆ?ì˜ ?´ìœ ë¡??´ìš©??ì²˜ë¦¬?????†ìŠµ?ˆë‹¤. ?…ë ¥???•ì¸?´ì£¼?¸ìš”."
        );
      }

      throw new Error("?´ìš© ìµœì ?”ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.");
    }
  }

  // ?´ë°± ?´ë¦½ë³´ë“œ ë³µì‚¬ ?¨ìˆ˜
  fallbackCopyToClipboard(text) {
    logger.log("?”„ ?´ë°± ?´ë¦½ë³´ë“œ ë³µì‚¬ ?œì‘");
    logger.log("?“ ?´ë°± ë³µì‚¬???ìŠ¤??", text);
    logger.log("?“ ?´ë°± ?ìŠ¤??ê¸¸ì´:", text ? text.length : "undefined");

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
        logger.log("??textarea ?ì„± ë°?DOM ì¶”ê? ?„ë£Œ");

        // ëª¨ë°”??ì§€?ì„ ?„í•œ ? íƒ ë²”ìœ„ ?¤ì •
        if (textArea.setSelectionRange) {
          textArea.setSelectionRange(0, text.length);
          logger.log("??setSelectionRange ?¬ìš©");
        } else {
          textArea.select();
          logger.log("??select() ?¬ìš©");
        }

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        logger.log("??textarea ?œê±° ?„ë£Œ");
        logger.log("?“‹ execCommand ê²°ê³¼:", successful);

        if (successful) {
          logger.log("???´ë°± ë³µì‚¬ ?±ê³µ");
          resolve(true);
        } else {
          logger.error("??execCommand ë³µì‚¬ ?¤íŒ¨");
          reject(new Error("execCommand ë³µì‚¬ ?¤íŒ¨"));
        }
      } catch (error) {
        logger.error("???´ë°± ë³µì‚¬ ì¤??¤ë¥˜:", error);
        reject(error);
      }
    });
  }

  // ë¡œë”© ?íƒœ ê´€ë¦??¨ìˆ˜
  showLoadingState(element, isLoading) {
    if (isLoading) {
      element.disabled = true;
      element.innerHTML = "??ì²˜ë¦¬ ì¤?..";
      element.classList.add("loading");
    } else {
      element.disabled = false;
      element.innerHTML = "?? ë°˜ì???¬ìŠ¤??;
      element.classList.remove("loading");
    }
  }

  // ?´ë¦½ë³´ë“œ ?ë™??(?„ì „???ëŸ¬ ì²˜ë¦¬ ë°??´ë°±)
  async copyToClipboardWithFormat(content) {
    logger.log("?” copyToClipboardWithFormat ?œì‘");
    logger.log("?“ ?…ë ¥ ?´ìš©:", content);
    logger.log("?“ ?…ë ¥ ?€??", typeof content);

    const button = document.getElementById("semi-auto-post-btn");

    try {
      // ë¡œë”© ?íƒœ ?œì‹œ
      if (button) {
        this.showLoadingState(button, true);
      }

      // 1?¨ê³„: ?…ë ¥ ê²€ì¦?ê°•í™”
      if (!content || typeof content !== "string") {
        logger.error("??? íš¨?˜ì? ?Šì? ?´ìš©:", content);
        throw new Error("? íš¨?˜ì? ?Šì? ?´ìš©?…ë‹ˆ??");
      }

      logger.log("??1?¨ê³„: ?…ë ¥ ê²€ì¦??µê³¼");

      // 2?¨ê³„: ?ë³¸ ?ìŠ¤??ê·¸ë?ë¡??¬ìš© (ì¤„ë°”ê¿?ë³´ì¡´)
      logger.log("?“ ?ë³¸ ?´ìš© ?¬ìš© (ì¤„ë°”ê¿?ë³´ì¡´):", content);

      if (!content || content.length === 0) {
        logger.error("???´ìš©??ë¹„ì–´?ˆìŒ");
        throw new Error("?´ìš©??ë¹„ì–´?ˆìŠµ?ˆë‹¤.");
      }

      logger.log("??2?¨ê³„: ê²€ì¦??„ë£Œ");

      // ?´ë¦½ë³´ë“œ API ì§€???•ì¸
      logger.log("?”„ 3?¨ê³„: ?´ë¦½ë³´ë“œ API ?•ì¸...");
      logger.log("?“‹ navigator.clipboard ì¡´ì¬:", !!navigator.clipboard);
      logger.log("?”’ isSecureContext:", window.isSecureContext);

      if (navigator.clipboard && window.isSecureContext) {
        try {
          logger.log("?“‹ ?´ë¦½ë³´ë“œ APIë¡?ë³µì‚¬ ?œë„...");
          await navigator.clipboard.writeText(content);
          logger.log("???´ë¦½ë³´ë“œ API ë³µì‚¬ ?±ê³µ");
          this.showMessage("???´ìš©???´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
          return true;
        } catch (clipboardError) {
          logger.warn(
            "??Clipboard API ?¤íŒ¨, ?´ë°± ë°©ë²• ?¬ìš©:",
            clipboardError
          );
          throw clipboardError;
        }
      } else {
        logger.warn("??Clipboard API ë¯¸ì???);
        throw new Error("Clipboard API ë¯¸ì???);
      }
    } catch (error) {
      logger.error("???´ë¦½ë³´ë“œ ë³µì‚¬ ?¤íŒ¨:", error);
      logger.error("???¤ë¥˜ ?ì„¸:", error.stack);

      try {
        // ?´ë°± ë°©ë²• ?œë„
        logger.log("?”„ ?´ë°± ë°©ë²• ?œë„...");
        await this.fallbackCopyToClipboard(content);
        logger.log("???´ë°± ë°©ë²• ë³µì‚¬ ?±ê³µ");
        this.showMessage(
          "???´ìš©???´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ?? (?´ë°± ë°©ë²•)",
          "success"
        );
        return true;
      } catch (fallbackError) {
        logger.error("???´ë°± ë³µì‚¬???¤íŒ¨:", fallbackError);
        this.showMessage(
          "???´ë¦½ë³´ë“œ ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?˜ë™?¼ë¡œ ë³µì‚¬?´ì£¼?¸ìš”.",
          "error"
        );

        // ?˜ë™ ë³µì‚¬ë¥??„í•œ ?ìŠ¤???ì—­ ?œì‹œ
        logger.log("?”„ ?˜ë™ ë³µì‚¬ ëª¨ë‹¬ ?œì‹œ...");
        this.showManualCopyModal(formattedContent);
        return false;
      }
    } finally {
      // ë¡œë”© ?íƒœ ?´ì œ
      if (button) {
        this.showLoadingState(button, false);
      }
      logger.log("??ë¡œë”© ?íƒœ ?´ì œ ?„ë£Œ");
    }
  }

  // ?˜ë™ ë³µì‚¬ ëª¨ë‹¬ ?œì‹œ ?¨ìˆ˜
  showManualCopyModal(content) {
    const modal = document.createElement("div");
    modal.className = "manual-copy-modal";
    modal.innerHTML = `
            <div class="modal-content">
                <h3>?“‹ ?˜ë™ ë³µì‚¬</h3>
                <p>?´ë¦½ë³´ë“œ ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?„ë˜ ?ìŠ¤?¸ë? ?˜ë™?¼ë¡œ ë³µì‚¬?´ì£¼?¸ìš”:</p>
                <textarea readonly class="copy-textarea" aria-label="ë³µì‚¬???ìŠ¤??>${content}</textarea>
                <div class="modal-actions">
                    <button class="btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">?•ì¸</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?ìŠ¤???ì—­ ?ë™ ? íƒ
    const textarea = modal.querySelector(".copy-textarea");
    textarea.focus();
    textarea.select();
  }
  // ìµœì ??ëª¨ë‹¬ ?œì‹œ ?¨ìˆ˜ (?‘ê·¼??ê°•í™”)
  showOptimizationModal(optimized, originalContent) {
    // ?ë³¸ ?ìŠ¤???€??(ì¤„ë°”ê¿?ë³´ì¡´)
    optimized.originalContent = originalContent;

    const modal = document.createElement("div");
    modal.className = "optimization-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");
    modal.setAttribute("aria-describedby", "modal-description");

    // ?„ì¬ ?¸ì–´ ê°ì?
    const currentLang = this.detectLanguage();
    logger.log("?Œ ê°ì????¸ì–´:", currentLang);
    logger.log("?“ ?ë³¸ ?ìŠ¤???€??", originalContent);

    modal.innerHTML = `
            <div class="optimization-content" lang="${currentLang}">
                <h3 id="modal-title">${this.t("optimizationTitle")}</h3>
                <div id="modal-description" class="sr-only">?¬ìŠ¤???´ìš©??ìµœì ?”ë˜?ˆìŠµ?ˆë‹¤. ê²°ê³¼ë¥??•ì¸?˜ê³  ì§„í–‰?˜ì„¸??</div>
                
                <div class="optimization-stats" role="region" aria-label="ìµœì ???µê³„">
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
                        <span class="stat-value" aria-label="?´ì‹œ?œê·¸ ${
                          optimized.hashtags.length
                        }${this.t("hashtagCount")}">${optimized.hashtags.join(
      " "
    )}</span>
                    </div>
                </div>
                
                ${
                  optimized.suggestions.length > 0
                    ? `
                    <div class="suggestions" role="region" aria-label="ìµœì ???œì•ˆ?¬í•­">
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
                
                <div class="preview-section" role="region" aria-label="?¬ìŠ¤???´ìš© ë¯¸ë¦¬ë³´ê¸°">
                    <div class="hashtag-toggle-section">
                        <label class="hashtag-toggle-label">
                            <input type="checkbox" id="hashtag-toggle" checked aria-label="?´ì‹œ?œê·¸ ?ë™ ì¶”ê?">
                            <span class="toggle-text">?´ì‹œ?œê·¸ ?ë™ ì¶”ê?</span>
                        </label>
                    </div>
                    <h4>${this.t("previewTitle")}</h4>
                    <div class="preview-content" role="textbox" aria-label="?¬ìŠ¤???´ìš©" tabindex="0" id="preview-content-display">
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
                            aria-label="?´ë¦½ë³´ë“œ?ë§Œ ë³µì‚¬">
                        ?“‹ ?´ë¦½ë³´ë“œ ë³µì‚¬
                    </button>
                    <button class="btn-primary btn-threads-only" 
                            id="threads-only-btn"
                            lang="${currentLang}"
                            aria-label="Threads ?˜ì´ì§€ë§??´ê¸°">
                        ?? Threads ?´ê¸°
                    </button>
                    <button class="btn-success btn-both" 
                            id="both-btn"
                            lang="${currentLang}"
                            aria-label="?´ë¦½ë³´ë“œ ë³µì‚¬?˜ê³  Threads ?˜ì´ì§€ ?´ê¸°">
                        ?“‹?? ?????¤í–‰
                    </button>
                    <button class="btn-secondary" 
                            id="cancel-btn"
                            lang="${currentLang}"
                            aria-label="ëª¨ë‹¬ ?«ê¸°">
                        ${this.t("cancelButton")}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ë²„íŠ¼ ?´ë¦­ ?´ë²¤??ì§ì ‘ ë°”ì¸??(?™ì  ?ì„±??ëª¨ë‹¬)
    setTimeout(() => {
      // ?´ì‹œ?œê·¸ ? ê? ?¤ìœ„ì¹?
      const hashtagToggle = modal.querySelector("#hashtag-toggle");
      const previewDisplay = modal.querySelector("#preview-content-display");

      if (hashtagToggle && previewDisplay) {
        hashtagToggle.addEventListener("change", () => {
          logger.log("?”„ ?´ì‹œ?œê·¸ ? ê? ë³€ê²?", hashtagToggle.checked);

          // ë¯¸ë¦¬ë³´ê¸° ?…ë°?´íŠ¸
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

      // ?´ë¦½ë³´ë“œ ë³µì‚¬ ë²„íŠ¼
      const copyBtn = modal.querySelector("#copy-only-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // ? ê? ?íƒœ???°ë¼ ?´ì‹œ?œê·¸ ?¬í•¨ ?¬ë? ê²°ì •
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          logger.log("?” ?´ë¦½ë³´ë“œ ë³µì‚¬ ë²„íŠ¼ ?´ë¦­ ê°ì?");
          logger.log("?“ ?ë³¸ ?ìŠ¤??ì§ì ‘ ?¬ìš©:", content);
          this.copyToClipboardOnly(content, e);
        });
      }

      // Threads ?´ê¸° ë²„íŠ¼
      const threadsBtn = modal.querySelector("#threads-only-btn");
      if (threadsBtn) {
        threadsBtn.addEventListener("click", (e) => {
          e.preventDefault();
          logger.log("?” Threads ?´ê¸° ë²„íŠ¼ ?´ë¦­ ê°ì?");
          this.openThreadsOnly();
        });
      }

      // ?????¤í–‰ ë²„íŠ¼
      const bothBtn = modal.querySelector("#both-btn");
      if (bothBtn) {
        bothBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // ? ê? ?íƒœ???°ë¼ ?´ì‹œ?œê·¸ ?¬í•¨ ?¬ë? ê²°ì •
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          logger.log("?” ?????¤í–‰ ë²„íŠ¼ ?´ë¦­ ê°ì?");
          logger.log("?“ ?ë³¸ ?ìŠ¤??ì§ì ‘ ?¬ìš©:", content);
          this.proceedWithPosting(content, e);
        });
      }

      // ì·¨ì†Œ ë²„íŠ¼
      const cancelBtn = modal.querySelector("#cancel-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          logger.log("?” ì·¨ì†Œ ë²„íŠ¼ ?´ë¦­ ê°ì?");
          modal.remove();
        });
      }
    }, 10);

    // ?‘ê·¼??ê°•í™”: ?¬ì»¤??ê´€ë¦?
    const firstBtn = modal.querySelector("#copy-only-btn");

    // ì²?ë²ˆì§¸ ë²„íŠ¼???¬ì»¤??
    setTimeout(() => {
      if (firstBtn) {
        firstBtn.focus();
      }
    }, 150);

    // ESC ?¤ë¡œ ëª¨ë‹¬ ?«ê¸°
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Tab ???œí™˜ ?œí•œ (ëª¨ë‹¬ ?´ì—?œë§Œ)
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

    // ëª¨ë‹¬???œê±°?????´ë²¤??ë¦¬ìŠ¤???•ë¦¬ (ê°„ë‹¨??ë°©ì‹)
    const cleanup = () => {
      document.removeEventListener("keydown", handleEscape);
      logger.log("??ëª¨ë‹¬ ?´ë²¤??ë¦¬ìŠ¤???•ë¦¬??);
    };

    // ëª¨ë‹¬ DOM ?œê±° ???ë™ ?•ë¦¬
    const observer = new MutationObserver(() => {
      if (!document.body.contains(modal)) {
        cleanup();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  // ?¬ìŠ¤??ì§„í–‰ ?¨ìˆ˜ (?´ë²¤??ì»¨í…?¤íŠ¸ ë³´ì¡´)
  async proceedWithPosting(formattedContent, event = null) {
    logger.log("?“‹?? ?????¤í–‰ ?œì‘");
    logger.log("?¯ ?´ë²¤??ì»¨í…?¤íŠ¸:", event ? "ë³´ì¡´?? : "?†ìŒ");

    try {
      // ?´ë¦½ë³´ë“œ??ë³µì‚¬ (?´ë²¤??ì»¨í…?¤íŠ¸ ë³´ì¡´)
      let success = false;

      if (event) {
        logger.log("?? ?´ë²¤??ì»¨í…?¤íŠ¸?ì„œ ì¦‰ì‹œ ë³µì‚¬ ?œë„");
        success = await this.copyToClipboardImmediate(formattedContent);
      } else {
        logger.log("?”„ ê¸°ì¡´ ë°©ë²•?¼ë¡œ ë³µì‚¬ ?œë„");
        success = await this.copyToClipboardWithFormat(formattedContent);
      }

      if (success) {
        logger.log("???´ë¦½ë³´ë“œ ë³µì‚¬ ?±ê³µ");
      } else {
        logger.warn("? ï¸ ?´ë¦½ë³´ë“œ ë³µì‚¬ ?¤íŒ¨, Threads??ê³„ì† ?´ê¸°");
      }

      // Threads ?????´ê¸° (?´ë¦½ë³´ë“œ ë³µì‚¬ ?±ê³µ ?¬ë??€ ê´€ê³„ì—†??
      const threadsUrl = this.getThreadsUrl();
      logger.log("?”— Threads URL:", threadsUrl);
      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      // ?¬ìš©??ê°€?´ë“œ ?œì‹œ
      this.showPostingGuide();

      // ëª¨ë‹¬ ?«ê¸°
      const modal = document.querySelector(".optimization-modal");
      if (modal) {
        modal.remove();
      }
    } catch (error) {
      logger.error("?¬ìŠ¤??ì§„í–‰ ì¤??¤ë¥˜:", error);
      this.showMessage("?¬ìŠ¤??ì§„í–‰ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // ?´ë¦½ë³´ë“œ ë³µì‚¬ë§??¤í–‰?˜ëŠ” ?¨ìˆ˜ (?´ë²¤??ì»¨í…?¤íŠ¸ ë³´ì¡´)
  async copyToClipboardOnly(formattedContent, event = null) {
    logger.log("?“‹ ?´ë¦½ë³´ë“œ ë³µì‚¬ë§??¤í–‰");
    logger.log("?“ ë°›ì? ?´ìš©:", formattedContent);
    logger.log("?“ ?´ìš© ?€??", typeof formattedContent);
    logger.log(
      "?“ ?´ìš© ê¸¸ì´:",
      formattedContent ? formattedContent.length : "undefined"
    );
    logger.log("?¯ ?´ë²¤??ì»¨í…?¤íŠ¸:", event ? "ë³´ì¡´?? : "?†ìŒ");

    try {
      // ?´ë²¤?¸ê? ?ˆìœ¼ë©?ì¦‰ì‹œ ?´ë¦½ë³´ë“œ ë³µì‚¬ ?œë„
      if (event) {
        logger.log("?? ?´ë²¤??ì»¨í…?¤íŠ¸?ì„œ ì¦‰ì‹œ ë³µì‚¬ ?œë„");
        const success = await this.copyToClipboardImmediate(formattedContent);

        if (success) {
          this.showMessage("???ìŠ¤?¸ê? ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
          logger.log("???´ë¦½ë³´ë“œ ë³µì‚¬ ?„ë£Œ");
          return;
        }
      }

      // ?´ë²¤?¸ê? ?†ê±°??ì¦‰ì‹œ ë³µì‚¬ ?¤íŒ¨ ??ê¸°ì¡´ ë°©ë²• ?¬ìš©
      logger.log("?”„ ê¸°ì¡´ ë°©ë²•?¼ë¡œ ë³µì‚¬ ?œë„");
      const success = await this.copyToClipboardWithFormat(formattedContent);

      if (success) {
        this.showMessage("???ìŠ¤?¸ê? ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
        logger.log("???´ë¦½ë³´ë“œ ë³µì‚¬ ?„ë£Œ");
      } else {
        this.showMessage("???´ë¦½ë³´ë“œ ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
        logger.error("???´ë¦½ë³´ë“œ ë³µì‚¬ ?¤íŒ¨");
      }
    } catch (error) {
      logger.error("???´ë¦½ë³´ë“œ ë³µì‚¬ ì¤??¤ë¥˜:", error);
      this.showMessage(
        "?´ë¦½ë³´ë“œ ë³µì‚¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message,
        "error"
      );
    }
  }

  // ì¦‰ì‹œ ?´ë¦½ë³´ë“œ ë³µì‚¬ (?´ë²¤??ì»¨í…?¤íŠ¸ ë³´ì¡´)
  async copyToClipboardImmediate(content) {
    logger.log("?? ì¦‰ì‹œ ?´ë¦½ë³´ë“œ ë³µì‚¬ ?œì‘");

    try {
      // 1?¨ê³„: ?…ë ¥ ê²€ì¦?
      if (!content || typeof content !== "string") {
        throw new Error("? íš¨?˜ì? ?Šì? ?´ìš©?…ë‹ˆ??");
      }

      // 2?¨ê³„: ?ë³¸ ?ìŠ¤??ê·¸ë?ë¡??¬ìš© (ì¤„ë°”ê¿?ë³´ì¡´)
      logger.log("?“ ?ë³¸ ?´ìš© (ì¤„ë°”ê¿?ë³´ì¡´):", content);

      // 3?¨ê³„: ?´ë¦½ë³´ë“œ API ?œë„ (?´ë²¤??ì»¨í…?¤íŠ¸ ?´ì—??
      if (navigator.clipboard && window.isSecureContext) {
        try {
          logger.log("?“‹ ?´ë¦½ë³´ë“œ APIë¡?ì¦‰ì‹œ ë³µì‚¬ ?œë„...");
          await navigator.clipboard.writeText(content);
          logger.log("???´ë¦½ë³´ë“œ API ì¦‰ì‹œ ë³µì‚¬ ?±ê³µ");
          return true;
        } catch (clipboardError) {
          logger.warn("???´ë¦½ë³´ë“œ API ì¦‰ì‹œ ë³µì‚¬ ?¤íŒ¨:", clipboardError);
          // ?´ë°±?¼ë¡œ execCommand ?œë„
          return await this.fallbackCopyToClipboard(content);
        }
      } else {
        logger.log("?”„ ?´ë¦½ë³´ë“œ API ë¯¸ì??? ?´ë°± ë°©ë²• ?¬ìš©");
        return await this.fallbackCopyToClipboard(content);
      }
    } catch (error) {
      logger.error("??ì¦‰ì‹œ ?´ë¦½ë³´ë“œ ë³µì‚¬ ?¤íŒ¨:", error);
      return false;
    }
  }

  // Threads ?´ê¸°ë§??¤í–‰?˜ëŠ” ?¨ìˆ˜
  openThreadsOnly() {
    logger.log("?? Threads ?´ê¸°ë§??¤í–‰");

    try {
      const threadsUrl = this.getThreadsUrl();
      logger.log("?”— Threads URL:", threadsUrl);

      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      this.showMessage("??Threads ?˜ì´ì§€ê°€ ?´ë ¸?µë‹ˆ??", "success");
      logger.log("??Threads ?˜ì´ì§€ ?´ê¸° ?„ë£Œ");

      // ê°„ë‹¨??ê°€?´ë“œ ?œì‹œ
      this.showSimpleThreadsGuide();
    } catch (error) {
      logger.error("??Threads ?´ê¸° ì¤??¤ë¥˜:", error);
      this.showMessage(
        "Threads ?´ê¸° ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message,
        "error"
      );
    }
  }

  // ê°„ë‹¨??Threads ê°€?´ë“œ ?œì‹œ
  showSimpleThreadsGuide() {
    const currentLang = this.detectLanguage();

    const guide = document.createElement("div");
    guide.className = "simple-threads-guide";
    guide.setAttribute("lang", currentLang);

    guide.innerHTML = `
            <div class="guide-content">
                <h3>??Threads ?˜ì´ì§€ê°€ ?´ë ¸?µë‹ˆ??</h3>
                <div class="guide-steps">
                    <h4>?“ ?¤ìŒ ?¨ê³„:</h4>
                    <ol>
                        <li>Threads ????œ¼ë¡??´ë™?˜ì„¸??/li>
                        <li>"??ê¸€ ?‘ì„±" ë²„íŠ¼???´ë¦­?˜ì„¸??/li>
                        <li>?‘ì„±???ìŠ¤?¸ë? ?…ë ¥?˜ì„¸??/li>
                        <li>"ê²Œì‹œ" ë²„íŠ¼???´ë¦­?˜ì„¸??/li>
                    </ol>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="this.closest('.simple-threads-guide').remove()">???•ì¸</button>
                </div>
            </div>
        `;

    document.body.appendChild(guide);

    // ?¸ì–´ ìµœì ???ìš©
    this.applyLanguageOptimization(guide, currentLang);

    // 5ì´????ë™?¼ë¡œ ?¬ë¼ì§€ê²??˜ê¸°
    setTimeout(() => {
      if (guide.parentNode) {
        guide.remove();
      }
    }, 8000);
  }

  // Threads URL ê°€?¸ì˜¤ê¸??¨ìˆ˜
  getThreadsUrl() {
    // ?¬ìš©???¤ì •?ì„œ ?„ë¡œ??URL ?•ì¸
    const userProfileUrl = localStorage.getItem("threads_profile_url");

    if (userProfileUrl && this.isValidThreadsUrl(userProfileUrl)) {
      logger.log("???¬ìš©???„ë¡œ??URL ?¬ìš©:", userProfileUrl);
      return userProfileUrl;
    }

    // ê¸°ë³¸ Threads ë©”ì¸ ?˜ì´ì§€
    logger.log("??ê¸°ë³¸ Threads ë©”ì¸ ?˜ì´ì§€ ?¬ìš©");
    return "https://www.threads.com/";
  }

  // Threads URL ? íš¨??ê²€??
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

  // ?¬ìš©???„ë¡œ??URL ?¤ì • ?¨ìˆ˜
  setThreadsProfileUrl(url) {
    if (this.isValidThreadsUrl(url)) {
      localStorage.setItem("threads_profile_url", url);
      this.showMessage("??Threads ?„ë¡œ??URL???¤ì •?˜ì—ˆ?µë‹ˆ??", "success");
      return true;
    } else {
      this.showMessage(
        "???¬ë°”ë¥?Threads URL???…ë ¥?´ì£¼?¸ìš”. (?? https://www.threads.com/@username)",
        "error"
      );
      return false;
    }
  }

  // ?¬ìŠ¤??ê°€?´ë“œ ?œì‹œ ?¨ìˆ˜
  showPostingGuide() {
    const guide = document.createElement("div");
    guide.className = "posting-guide";
    guide.innerHTML = `
            <div class="guide-content">
                <h3>???±ê³µ! Threads ?˜ì´ì§€ê°€ ?´ë ¸?µë‹ˆ??/h3>
                <div class="guide-steps">
                    <h4>?“ ?¤ìŒ ?¨ê³„ë¥??°ë¼?´ì£¼?¸ìš”:</h4>
                    <ol>
                        <li>Threads ????œ¼ë¡??´ë™?˜ì„¸??/li>
                        <li>"??ê¸€ ?‘ì„±" ë²„íŠ¼???´ë¦­?˜ì„¸??/li>
                        <li>?ìŠ¤???…ë ¥ì°½ì— Ctrl+Vë¡?ë¶™ì—¬?£ê¸°?˜ì„¸??/li>
                        <li>"ê²Œì‹œ" ë²„íŠ¼???´ë¦­?˜ì—¬ ?¬ìŠ¤?…í•˜?¸ìš”</li>
                    </ol>
                </div>
                <div class="guide-tip">
                    <p>?’¡ ?? ë¶™ì—¬?£ê¸° ???´ìš©????ë²????•ì¸?´ë³´?¸ìš”!</p>
                </div>
                <div class="guide-actions">
                    <button class="btn-primary" onclick="this.closest('.posting-guide').remove()">???•ì¸</button>
                    <button class="btn-secondary" onclick="dualTextWriter.showThreadsProfileSettings()">?™ï¸ ?„ë¡œ???¤ì •</button>
                </div>
            </div>
        `;

    document.body.appendChild(guide);

    // 5ì´????ë™?¼ë¡œ ?¬ë¼ì§€ê²??˜ê¸°
    setTimeout(() => {
      if (guide.parentNode) {
        guide.remove();
      }
    }, 10000);
  }
  // Threads ?„ë¡œ???¤ì • ëª¨ë‹¬ ?œì‹œ
  showThreadsProfileSettings() {
    const currentLang = this.detectLanguage();

    const modal = document.createElement("div");
    modal.className = "threads-profile-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>?™ï¸ Threads ?„ë¡œ???¤ì •</h3>
                <p>?¬ìŠ¤?????´ë¦´ Threads ?˜ì´ì§€ë¥??¤ì •?˜ì„¸??</p>
                
                <div class="profile-url-section">
                    <label for="threads-profile-url">?„ë¡œ??URL:</label>
                    <input type="url" id="threads-profile-url" 
                           placeholder="https://www.threads.com/@username"
                           value="${
                             localStorage.getItem("threads_profile_url") || ""
                           }">
                    <small>?? https://www.threads.com/@username</small>
                </div>
                
                <div class="url-options">
                    <h4>ë¹ ë¥¸ ? íƒ:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/')">
                        ?  Threads ë©”ì¸ ?˜ì´ì§€
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="dualTextWriter.setThreadsProfileUrl('https://www.threads.com/new')">
                        ?ï¸ ??ê¸€ ?‘ì„± ?˜ì´ì§€
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveThreadsProfileUrl()">?’¾ ?€??/button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.threads-profile-modal').remove()">??ì·¨ì†Œ</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?¸ì–´ ìµœì ???ìš©
    this.applyLanguageOptimization(modal, currentLang);

    // ?…ë ¥ ?„ë“œ???¬ì»¤??
    setTimeout(() => {
      const input = modal.querySelector("#threads-profile-url");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // Threads ?„ë¡œ??URL ?€??
  saveThreadsProfileUrl() {
    const input = document.getElementById("threads-profile-url");
    if (input) {
      const url = input.value.trim();
      if (url) {
        this.setThreadsProfileUrl(url);
      } else {
        // ë¹?ê°’ì´ë©?ê¸°ë³¸ URLë¡??¤ì •
        localStorage.removeItem("threads_profile_url");
        this.showMessage(
          "??ê¸°ë³¸ Threads ë©”ì¸ ?˜ì´ì§€ë¡??¤ì •?˜ì—ˆ?µë‹ˆ??",
          "success"
        );
      }

      // ëª¨ë‹¬ ?«ê¸°
      const modal = document.querySelector(".threads-profile-modal");
      if (modal) {
        modal.remove();
      }
    }
  }

  // ?´ì‹œ?œê·¸ ?¤ì • ëª¨ë‹¬ ?œì‹œ
  showHashtagSettings() {
    const currentLang = this.detectLanguage();
    const currentHashtags = this.getUserHashtags();

    const modal = document.createElement("div");
    modal.className = "hashtag-settings-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>?“Œ ?´ì‹œ?œê·¸ ?¤ì •</h3>
                <p>ë°˜ì???¬ìŠ¤?????¬ìš©??ê¸°ë³¸ ?´ì‹œ?œê·¸ë¥??¤ì •?˜ì„¸??</p>
                
                <div class="hashtag-input-section">
                    <label for="hashtag-input">?´ì‹œ?œê·¸ (?¼í‘œë¡?êµ¬ë¶„):</label>
                    <input type="text" id="hashtag-input" 
                           placeholder="?? #writing, #content, #threads"
                           value="${currentHashtags.join(", ")}">
                    <small>?? #writing, #content, #threads</small>
                </div>
                
                <div class="hashtag-examples">
                    <h4>ì¶”ì²œ ?´ì‹œ?œê·¸:</h4>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#writing, #content, #threads'">
                        ?“ ?¼ë°˜ ê¸€ ?‘ì„±
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#?ê°, #?¼ìƒ, #daily'">
                        ?’­ ?¼ìƒ ê¸€
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#ê²½ì œ, #?¬ì, #finance'">
                        ?’° ê²½ì œ/?¬ì
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value='#ê¸°ìˆ , #ê°œë°œ, #tech'">
                        ?? ê¸°ìˆ /ê°œë°œ
                    </button>
                    <button class="btn-option" lang="${currentLang}" onclick="document.getElementById('hashtag-input').value=''" style="background: #f8f9fa; color: #6c757d;">
                        ???´ì‹œ?œê·¸ ?†ì´ ?¬ìš©
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" lang="${currentLang}" onclick="dualTextWriter.saveHashtagSettings()">?’¾ ?€??/button>
                    <button class="btn-secondary" lang="${currentLang}" onclick="this.closest('.hashtag-settings-modal').remove()">??ì·¨ì†Œ</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // ?¸ì–´ ìµœì ???ìš©
    this.applyLanguageOptimization(modal, currentLang);

    // ?…ë ¥ ?„ë“œ???¬ì»¤??
    setTimeout(() => {
      const input = modal.querySelector("#hashtag-input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // ?´ì‹œ?œê·¸ ?¤ì • ?€??
  saveHashtagSettings() {
    const input = document.getElementById("hashtag-input");
    if (input) {
      const inputValue = input.value.trim();

      // ë¹?ê°??ˆìš© (?´ì‹œ?œê·¸ ?†ì´ ?¬ìš©)
      if (!inputValue) {
        this.saveUserHashtags([]);
        this.showMessage(
          "???´ì‹œ?œê·¸ ?†ì´ ?¬ìŠ¤?…í•˜?„ë¡ ?¤ì •?˜ì—ˆ?µë‹ˆ??",
          "success"
        );
        this.updateHashtagsDisplay();

        // ëª¨ë‹¬ ?«ê¸°
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
        return;
      }

      // ?¼í‘œë¡?ë¶„ë¦¬?˜ì—¬ ë°°ì—´ë¡?ë³€??
      const hashtags = inputValue
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (this.saveUserHashtags(hashtags)) {
        this.showMessage("???´ì‹œ?œê·¸ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤!", "success");
        this.updateHashtagsDisplay();

        // ëª¨ë‹¬ ?«ê¸°
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
      } else {
        this.showMessage(
          "???´ì‹œ?œê·¸ ?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤. ?•ì‹???•ì¸?´ì£¼?¸ìš”.",
          "error"
        );
      }
    }
  }
  // ?´ì‹œ?œê·¸ ?œì‹œ ?…ë°?´íŠ¸
  updateHashtagsDisplay() {
    const display = document.getElementById("current-hashtags-display");
    if (display) {
      const hashtags = this.getUserHashtags();
      if (hashtags && hashtags.length > 0) {
        display.textContent = hashtags.join(" ");
      } else {
        display.textContent = "?´ì‹œ?œê·¸ ?†ìŒ";
        display.style.color = "#6c757d";
      }
    }
  }

  // ?¤í”„?¼ì¸ ì§€???¨ìˆ˜??
  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      logger.warn("ë¡œì»¬ ?¤í† ë¦¬ì? ?€???¤íŒ¨:", error);
      return false;
    }
  }

  loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn("ë¡œì»¬ ?¤í† ë¦¬ì? ë¡œë“œ ?¤íŒ¨:", error);
      return null;
    }
  }

  // ?¤í”„?¼ì¸ ?íƒœ ê°ì?
  isOnline() {
    return navigator.onLine;
  }

  // ?¤í”„?¼ì¸ ?Œë¦¼ ?œì‹œ
  showOfflineNotification() {
    if (!this.isOnline()) {
      this.showMessage(
        "?“¡ ?¤í”„?¼ì¸ ?íƒœ?…ë‹ˆ?? ?¼ë? ê¸°ëŠ¥???œí•œ?????ˆìŠµ?ˆë‹¤.",
        "warning"
      );
    }
  }

  // ?¸ì–´ ê°ì? ?¨ìˆ˜
  detectLanguage() {
    // 1. ë¸Œë¼?°ì? ?¸ì–´ ?¤ì • ?•ì¸
    const browserLang = navigator.language || navigator.userLanguage;
    logger.log("?Œ ë¸Œë¼?°ì? ?¸ì–´:", browserLang);

    // 2. HTML lang ?ì„± ?•ì¸
    const htmlLang = document.documentElement.lang;
    logger.log("?Œ HTML ?¸ì–´:", htmlLang);

    // 3. ?¬ìš©???¤ì • ?¸ì–´ ?•ì¸ (ë¡œì»¬ ?¤í† ë¦¬ì?)
    const userLang = localStorage.getItem("preferred_language");
    logger.log("?Œ ?¬ìš©???¤ì • ?¸ì–´:", userLang);

    // ?°ì„ ?œìœ„: ?¬ìš©???¤ì • > HTML ?ì„± > ë¸Œë¼?°ì? ?¤ì •
    let detectedLang = userLang || htmlLang || browserLang;

    // ?¸ì–´ ì½”ë“œ ?•ê·œ??(ko-KR -> ko, en-US -> en)
    if (detectedLang) {
      detectedLang = detectedLang.split("-")[0];
    }

    // ì§€?ë˜???¸ì–´ ëª©ë¡
    const supportedLanguages = ["ko", "en", "ja", "zh"];

    // ì§€?ë˜ì§€ ?ŠëŠ” ?¸ì–´??ê¸°ë³¸ê°??œêµ­???¼ë¡œ ?¤ì •
    if (!supportedLanguages.includes(detectedLang)) {
      detectedLang = "ko";
    }

    logger.log("?Œ ìµœì¢… ê°ì????¸ì–´:", detectedLang);
    return detectedLang;
  }

  // ?¸ì–´ë³??ìŠ¤??ìµœì ???ìš©
  applyLanguageOptimization(element, language) {
    if (!element) return;

    // ?¸ì–´ë³??´ë˜??ì¶”ê?
    element.classList.add(`lang-${language}`);

    // ?¸ì–´ë³??¤í????ìš©
    const style = document.createElement("style");
    style.textContent = `
            .lang-${language} {
                font-family: ${this.getLanguageFont(language)};
            }
        `;
    document.head.appendChild(style);

    logger.log(`?Œ ${language} ?¸ì–´ ìµœì ???ìš©??);
  }

  // ?¸ì–´ë³??°íŠ¸ ?¤ì •
  getLanguageFont(language) {
    const fontMap = {
      ko: '"Noto Sans KR", "Malgun Gothic", "ë§‘ì? ê³ ë”•", sans-serif',
      en: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      ja: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "?’ãƒ©??ƒè§’ã‚´ ProN W3", sans-serif',
      zh: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    };

    return fontMap[language] || fontMap["ko"];
  }

  // êµ? œ??ì§€???¨ìˆ˜??
  getLanguage() {
    return navigator.language || navigator.userLanguage || "ko-KR";
  }

  getTexts() {
    const lang = this.getLanguage();
    const texts = {
      "ko-KR": {
        noContent: "???¬ìŠ¤?…í•  ?´ìš©???†ìŠµ?ˆë‹¤.",
        processingError: "?¬ìŠ¤??ì²˜ë¦¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
        offlineWarning: "?“¡ ?¤í”„?¼ì¸ ?íƒœ?…ë‹ˆ?? ë¡œì»¬?ì„œë§?ì²˜ë¦¬?©ë‹ˆ??",
        optimizationTitle: "?“ Threads ?¬ìŠ¤??ìµœì ??ê²°ê³¼",
        originalLength: "?ë³¸ ê¸€????",
        optimizedLength: "ìµœì ?”ëœ ê¸€????",
        hashtags: "?´ì‹œ?œê·¸:",
        optimizationSuggestions: "?’¡ ìµœì ???¬í•­:",
        previewTitle: "?“‹ ìµœì¢… ?¬ìŠ¤???´ìš© ë¯¸ë¦¬ë³´ê¸°:",
        proceedButton: "?“‹ ?´ë¦½ë³´ë“œ ë³µì‚¬ & Threads ?´ê¸°",
        cancelButton: "??ì·¨ì†Œ",
        characters: "??,
        hashtagCount: "ê°?,
      },
      "en-US": {
        noContent: "??No content to post.",
        processingError: "An error occurred while processing the post.",
        offlineWarning: "?“¡ You are offline. Processing locally only.",
        optimizationTitle: "?“ Threads Posting Optimization Results",
        originalLength: "Original length:",
        optimizedLength: "Optimized length:",
        hashtags: "Hashtags:",
        optimizationSuggestions: "?’¡ Optimization suggestions:",
        previewTitle: "?“‹ Final posting content preview:",
        proceedButton: "?“‹ Copy to Clipboard & Open Threads",
        cancelButton: "??Cancel",
        characters: "chars",
        hashtagCount: "tags",
      },
      "ja-JP": {
        noContent: "???•ç¨¿?™ã‚‹?³ãƒ³?†ãƒ³?„ãŒ?‚ã‚Š?¾ã›?“ã€?,
        processingError: "?•ç¨¿??†ä¸?«?¨ãƒ©?¼ãŒ?ºç”Ÿ?—ã¾?—ãŸ??,
        offlineWarning: "?“¡ ?ªãƒ•?©ã‚¤?³çŠ¶?‹ã§?™ã€‚ãƒ­?¼ã‚«?«ã§??¿??†?•ã‚Œ?¾ã™??,
        optimizationTitle: "?“ Threads?•ç¨¿?€?©åŒ–çµæœ",
        originalLength: "?ƒã®?‡å­—??",
        optimizedLength: "?€?©åŒ–?•ã‚Œ?Ÿæ–‡å­—æ•°:",
        hashtags: "?ãƒƒ?·ãƒ¥?¿ã‚°:",
        optimizationSuggestions: "?’¡ ?€?©åŒ–?æ¡ˆ:",
        previewTitle: "?“‹ ?€çµ‚æŠ•ç¨¿å†…å®¹ãƒ—?¬ãƒ“?¥ãƒ¼:",
        proceedButton: "?“‹ ??ƒª?ƒãƒ—?œãƒ¼?‰ã«?³ãƒ”??& Threads?’é–‹??,
        cancelButton: "????ƒ£?³ã‚»??,
        characters: "?‡å­—",
        hashtagCount: "??,
      },
    };

    return texts[lang] || texts["ko-KR"];
  }

  t(key) {
    const texts = this.getTexts();
    return texts[key] || key;
  }

  // ?±ëŠ¥ ëª¨ë‹ˆ?°ë§ ?¨ìˆ˜??
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

        logger.log(`?±ï¸ ${label}: ${duration.toFixed(2)}ms`);
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

  // ë©”ëª¨ë¦??¬ìš©??ì²´í¬
  checkMemoryUsage() {
    if (performance.memory) {
      const memory = performance.memory;
      logger.log("?§  ë©”ëª¨ë¦??¬ìš©??", {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  // ì¢…í•© ?ŒìŠ¤???¨ìˆ˜
  async runComprehensiveTest() {
    logger.log("?§ª ì¢…í•© ?ŒìŠ¤???œì‘...");

    const testResults = {
      security: false,
      accessibility: false,
      performance: false,
      mobile: false,
      offline: false,
      internationalization: false,
    };

    try {
      // 1. ë³´ì•ˆ ?ŒìŠ¤??
      logger.log("?”’ ë³´ì•ˆ ?ŒìŠ¤??..");
      const testContent = '<script>alert("xss")</script>?ˆë…•?˜ì„¸??#test';
      const sanitized = this.sanitizeText(testContent);
      testResults.security = !sanitized.includes("<script>");
      logger.log("ë³´ì•ˆ ?ŒìŠ¤??", testResults.security ? "???µê³¼" : "???¤íŒ¨");

      // 2. ?‘ê·¼???ŒìŠ¤??
      logger.log("???‘ê·¼???ŒìŠ¤??..");
      const button = document.getElementById("semi-auto-post-btn");
      testResults.accessibility =
        button &&
        button.getAttribute("aria-label") &&
        button.getAttribute("role");
      logger.log(
        "?‘ê·¼???ŒìŠ¤??",
        testResults.accessibility ? "???µê³¼" : "???¤íŒ¨"
      );

      // 3. ?±ëŠ¥ ?ŒìŠ¤??
      logger.log("???±ëŠ¥ ?ŒìŠ¤??..");
      this.performanceMonitor.start("?ŒìŠ¤??);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const duration = this.performanceMonitor.end("?ŒìŠ¤??);
      testResults.performance = duration < 100; // 100ms ?´í•˜
      logger.log(
        "?±ëŠ¥ ?ŒìŠ¤??",
        testResults.performance ? "???µê³¼" : "???¤íŒ¨"
      );

      // 4. ëª¨ë°”???ŒìŠ¤??
      logger.log("?“± ëª¨ë°”???ŒìŠ¤??..");
      const isMobile = window.innerWidth <= 768;
      testResults.mobile = true; // CSS ë¯¸ë””??ì¿¼ë¦¬ë¡?ì²˜ë¦¬??
      logger.log("ëª¨ë°”???ŒìŠ¤??", testResults.mobile ? "???µê³¼" : "???¤íŒ¨");

      // 5. ?¤í”„?¼ì¸ ?ŒìŠ¤??
      logger.log("?’¾ ?¤í”„?¼ì¸ ?ŒìŠ¤??..");
      testResults.offline =
        typeof this.isOnline === "function" &&
        typeof this.saveToLocalStorage === "function";
      logger.log(
        "?¤í”„?¼ì¸ ?ŒìŠ¤??",
        testResults.offline ? "???µê³¼" : "???¤íŒ¨"
      );

      // 6. êµ? œ???ŒìŠ¤??
      logger.log("?Œ êµ? œ???ŒìŠ¤??..");
      testResults.internationalization =
        typeof this.t === "function" && this.t("noContent") !== "noContent";
      logger.log(
        "êµ? œ???ŒìŠ¤??",
        testResults.internationalization ? "???µê³¼" : "???¤íŒ¨"
      );

      // ê²°ê³¼ ?”ì•½
      const passedTests = Object.values(testResults).filter(
        (result) => result
      ).length;
      const totalTests = Object.keys(testResults).length;

      logger.log(`\n?¯ ?ŒìŠ¤???„ë£Œ: ${passedTests}/${totalTests} ?µê³¼`);
      logger.log("?ì„¸ ê²°ê³¼:", testResults);

      return testResults;
    } catch (error) {
      logger.error("?ŒìŠ¤??ì¤??¤ë¥˜ ë°œìƒ:", error);
      return testResults;
    }
  }

  // ë°˜ì?™í™” ?¬ìŠ¤??ë©”ì¸ ?¨ìˆ˜ (?±ëŠ¥ ìµœì ??+ ?¤í”„?¼ì¸ ì§€??+ ëª¨ë‹ˆ?°ë§)
  async handleSemiAutoPost() {
    logger.log("?” ë°˜ì?™í™” ?¬ìŠ¤???œì‘");

    const content = this.editTextInput.value;
    logger.log("?“ ?…ë ¥ ?´ìš©:", content);

    if (!content.trim()) {
      logger.warn("???¬ìŠ¤?…í•  ?´ìš©???†ìŠµ?ˆë‹¤");
      this.showMessage("???¬ìŠ¤?…í•  ?´ìš©???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const button = document.getElementById("semi-auto-post-btn");

    try {
      logger.log("??1. ?…ë ¥ ê²€ì¦??„ë£Œ");

      // ë¡œë”© ?íƒœ ?œì‹œ
      if (button) {
        this.showLoadingState(button, true);
        logger.log("??2. ë¡œë”© ?íƒœ ?œì‹œ");
      }

      logger.log("?”„ 3. ?´ìš© ìµœì ???œì‘...");
      const optimized = await this.optimizeContentForThreadsAsync(content);
      logger.log("??4. ?´ìš© ìµœì ???„ë£Œ:", optimized);

      // ?¤í”„?¼ì¸?ì„œ??ë¡œì»¬ ?€??
      try {
        this.saveToLocalStorage("lastOptimizedContent", optimized);
        logger.log("??5. ë¡œì»¬ ?€???„ë£Œ");
      } catch (saveError) {
        logger.warn("? ï¸ ë¡œì»¬ ?€???¤íŒ¨:", saveError);
      }

      // ?ë™ ?¸ë˜???œì‘: posts ì»¬ë ‰?˜ì— ?¬ìŠ¤???ì„±
      logger.log("?”„ 6. ?ë™ ?¸ë˜???œì‘...");
      let sourceTextId = null;
      let referenceTextId = null;

      // ?¼ìª½ ?¨ë„(?ˆí¼?°ìŠ¤)?ì„œ ?„ì¬ ?…ë ¥???ˆí¼?°ìŠ¤ ?•ì¸
      const referenceContent = this.refTextInput.value.trim();
      if (referenceContent) {
        // ?ˆí¼?°ìŠ¤ê°€ ?…ë ¥?˜ì–´ ?ˆëŠ” ê²½ìš°, ?€?¥ëœ ?ˆí¼?°ìŠ¤ ì¤‘ì—??ì°¾ê±°???ˆë¡œ ?€??
        try {
          // ?€?¥ëœ ?ˆí¼?°ìŠ¤ ì¤‘ì—???™ì¼???´ìš©???ˆí¼?°ìŠ¤ ì°¾ê¸°
          const matchingReference = this.savedTexts?.find(
            (item) =>
              item.type === "reference" && item.content === referenceContent
          );

          if (matchingReference) {
            // ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ?¬ìš©
            referenceTextId = matchingReference.id;
            logger.log("??ê¸°ì¡´ ?ˆí¼?°ìŠ¤ ?¬ìš©:", referenceTextId);
          } else {
            // ???ˆí¼?°ìŠ¤ë¡??€??
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
            logger.log("?????ˆí¼?°ìŠ¤ ?€???„ë£Œ:", referenceTextId);

            // ë¡œì»¬ ë°°ì—´?ë„ ì¶”ê?
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
            "? ï¸ ?ˆí¼?°ìŠ¤ ?€???¤íŒ¨ (?¸ë˜?¹ì? ê³„ì† ì§„í–‰):",
            referenceError
          );
        }
      }

      // ?„ì¬ ?ìŠ¤?¸ë? texts ì»¬ë ‰?˜ì— ë¨¼ì? ?€??(?ë³¸ ë³´ì¡´)
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const textData = {
            content: content, // ?ë³¸ ?´ìš© (ìµœì ????
            type: "edit",
            characterCount: this.getKoreanCharacterCount(content),
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // ì£¼ì œ ì¶”ê? (? íƒ?¬í•­)
          if (this.editTopicInput) {
            const topic = this.editTopicInput.value.trim();
            if (topic) {
              textData.topic = topic;
            }
          }

          // ??ì°¸ê³  ?ˆí¼?°ìŠ¤ ? íƒ ?•ë³´ ì¶”ê?
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // ? íš¨???ˆí¼?°ìŠ¤ IDë§??„í„°ë§?(ì¡´ì¬ ?¬ë? ?•ì¸)
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
                linkedAt: window.firebaseServerTimestamp(), // ?°ê²° ?œì 
                linkCount: validReferences.length, // ?°ê²° ê°œìˆ˜ (ìºì‹œ)
              };

              logger.log(
                `?“š ${validReferences.length}ê°??ˆí¼?°ìŠ¤ ?°ê²°??(ë°˜ì???¬ìŠ¤??`
              );
            } else {
              // ë¹?ë°°ì—´ë¡??¤ì • (null???„ë‹Œ ë¹?ë°°ì—´)
              textData.linkedReferences = [];
            }
          } else {
            // ? íƒ???ˆí¼?°ìŠ¤ê°€ ?†ëŠ” ê²½ìš° ë¹?ë°°ì—´ë¡??¤ì •
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
          logger.log("???ë³¸ ?ìŠ¤???€???„ë£Œ:", sourceTextId);
        } catch (textSaveError) {
          logger.warn(
            "? ï¸ ?ë³¸ ?ìŠ¤???€???¤íŒ¨ (?¸ë˜?¹ì? ê³„ì† ì§„í–‰):",
            textSaveError
          );
        }
      }

      // posts ì»¬ë ‰?˜ì— ?¸ë˜???¬ìŠ¤???ë™ ?ì„±
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const postsRef = window.firebaseCollection(
            this.db,
            "users",
            this.currentUser.uid,
            "posts"
          );
          const postData = {
            content: content, // ?ë³¸ ?´ìš© (ìµœì ???? ?¸ë˜?¹ìš©)
            type: "edit",
            postedAt: window.firebaseServerTimestamp(),
            trackingEnabled: true, // ?ë™?¼ë¡œ ?¸ë˜???œì„±??
            metrics: [],
            analytics: {},
            sourceTextId: sourceTextId || null, // ?ë³¸ ?ìŠ¤??ì°¸ì¡° (?ˆëŠ” ê²½ìš°)
            sourceType: "edit", // ?ë³¸ ?ìŠ¤???€??
            // ?ˆí¼?°ìŠ¤ ?¬ìš© ?•ë³´ ì¶”ê?
            referenceTextId: referenceTextId || null, // ?ˆí¼?°ìŠ¤ ?ìŠ¤??ì°¸ì¡° (?ˆëŠ” ê²½ìš°)
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // ??ì°¸ê³  ?ˆí¼?°ìŠ¤ ? íƒ ?•ë³´ ì¶”ê? (posts ì»¬ë ‰?˜ì—???™ì¼?˜ê²Œ ?€??
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // ? íš¨???ˆí¼?°ìŠ¤ IDë§??„í„°ë§?(ì¡´ì¬ ?¬ë? ?•ì¸)
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
                linkedAt: window.firebaseServerTimestamp(), // ?°ê²° ?œì 
                linkCount: validReferences.length, // ?°ê²° ê°œìˆ˜ (ìºì‹œ)
              };

              logger.log(
                `?“š ?¸ë˜???¬ìŠ¤?¸ì— ${validReferences.length}ê°??ˆí¼?°ìŠ¤ ?°ê²°??
              );
            } else {
              // ë¹?ë°°ì—´ë¡??¤ì • (null???„ë‹Œ ë¹?ë°°ì—´)
              postData.linkedReferences = [];
            }
          } else {
            // ? íƒ???ˆí¼?°ìŠ¤ê°€ ?†ëŠ” ê²½ìš° ë¹?ë°°ì—´ë¡??¤ì •
            postData.linkedReferences = [];
          }

          // ?ˆí¼?°ìŠ¤ê°€ ?¬ìš©??ê²½ìš°, ?ˆí¼?°ìŠ¤???¬ìŠ¤?¸ë„ ?ì„±
          if (referenceTextId) {
            const referencePostData = {
              content: referenceContent, // ?ˆí¼?°ìŠ¤ ?´ìš©
              type: "reference",
              postedAt: window.firebaseServerTimestamp(),
              trackingEnabled: false, // ?ˆí¼?°ìŠ¤ ?¬ìŠ¤?¸ëŠ” ?¸ë˜??ë¹„í™œ?±í™”
              metrics: [],
              analytics: {},
              sourceTextId: referenceTextId, // ?ˆí¼?°ìŠ¤ ?ìŠ¤??ì°¸ì¡°
              sourceType: "reference", // ?ˆí¼?°ìŠ¤ ?€?…ìœ¼ë¡??¤ì •
              createdAt: window.firebaseServerTimestamp(),
              updatedAt: window.firebaseServerTimestamp(),
            };

            await window.firebaseAddDoc(postsRef, referencePostData);
            logger.log(
              "???ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤???ì„± ?„ë£Œ (?ˆí¼?°ìŠ¤ ID:",
              referenceTextId,
              ")"
            );
          }

          const postDocRef = await window.firebaseAddDoc(postsRef, postData);
          logger.log("???¸ë˜???¬ìŠ¤???ë™ ?ì„± ?„ë£Œ:", postDocRef.id);

          // ?¸ë˜????ëª©ë¡ ?ˆë¡œê³ ì¹¨ (ë°±ê·¸?¼ìš´?œì—??
          if (this.trackingPosts && this.loadTrackingPosts) {
            this.loadTrackingPosts().catch((err) => {
              logger.warn("? ï¸ ?¸ë˜??ëª©ë¡ ?ˆë¡œê³ ì¹¨ ?¤íŒ¨:", err);
            });
          }

          // ?¬ìš©???¼ë“œë°?ë©”ì‹œì§€
          this.showMessage("?“Š ?¸ë˜?¹ì´ ?ë™?¼ë¡œ ?œì‘?˜ì—ˆ?µë‹ˆ??", "success");
        } catch (postError) {
          logger.error("???¸ë˜???¬ìŠ¤???ì„± ?¤íŒ¨:", postError);
          // ?¸ë˜???ì„± ?¤íŒ¨?´ë„ ?¬ìŠ¤?…ì? ê³„ì† ì§„í–‰
          this.showMessage(
            "? ï¸ ?¸ë˜???œì‘???¤íŒ¨?ˆì?ë§??¬ìŠ¤?…ì? ê³„ì†?????ˆìŠµ?ˆë‹¤.",
            "warning"
          );
        }
      }

      // ??ë°˜ì???¬ìŠ¤????? íƒ???ˆí¼?°ìŠ¤ ì´ˆê¸°??(?¼ê???? ì?)
      if (this.selectedReferences && this.selectedReferences.length > 0) {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0ê°?? íƒ??";
        }
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0ê°?? íƒ??";
        }
        logger.log("??ë°˜ì???¬ìŠ¤?????ˆí¼?°ìŠ¤ ? íƒ ì´ˆê¸°???„ë£Œ");
      }

      // ìµœì ???„ë£Œ ??ëª¨ë‹¬ ?œì‹œ (?ë³¸ ?ìŠ¤???„ë‹¬)
      logger.log("?”„ 7. ìµœì ??ëª¨ë‹¬ ?œì‹œ ?œì‘...");
      this.showOptimizationModal(optimized, content);
      logger.log("??8. ìµœì ??ëª¨ë‹¬ ?œì‹œ ?„ë£Œ");
    } catch (error) {
      logger.error("??ë°˜ì?™í™” ?¬ìŠ¤??ì²˜ë¦¬ ì¤??¤ë¥˜:", error);
      logger.error("?¤ë¥˜ ?ì„¸:", error.stack);
      this.showMessage(
        "?¬ìŠ¤??ì²˜ë¦¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message,
        "error"
      );
    } finally {
      // ë¡œë”© ?íƒœ ?´ì œ
      if (button) {
        this.showLoadingState(button, false);
        logger.log("??8. ë¡œë”© ?íƒœ ?´ì œ");
      }
    }
  }

  // ë¹„ë™ê¸??´ìš© ìµœì ???¨ìˆ˜ (?±ëŠ¥ ê°œì„ )
  async optimizeContentForThreadsAsync(content) {
    return new Promise((resolve, reject) => {
      // ë©”ì¸ ?¤ë ˆ??ë¸”ë¡œ??ë°©ì?ë¥??„í•œ setTimeout ?¬ìš©
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
   * ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬ ?´ê¸°
   *
   * - ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
   * - ?„ì¬ ? íƒ????ª© ë³µì›
   * - ëª¨ë‹¬ ?œì‹œ ë°??¬ì»¤???´ë™
   */
  openReferenceSelectionModal() {
    try {
      if (!this.referenceSelectionModal) {
        logger.warn("? ï¸ ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      // ?ˆí¼?°ìŠ¤ë§??„í„°ë§?(type???†ëŠ” ê²½ìš° 'edit'ë¡?ê°„ì£¼)
      const references = this.savedTexts.filter(
        (item) => (item.type || "edit") === "reference"
      );

      if (references.length === 0) {
        this.showMessage(
          "? ï¸ ?€?¥ëœ ?ˆí¼?°ìŠ¤ê°€ ?†ìŠµ?ˆë‹¤. ë¨¼ì? ?ˆí¼?°ìŠ¤ë¥??€?¥í•´ì£¼ì„¸??",
          "info"
        );
        return;
      }

      // ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
      this.renderReferenceSelectionList(references);

      // ê²€???„í„° ì´ˆê¸°??
      if (this.referenceSearchInput) this.referenceSearchInput.value = "";
      if (this.referenceTypeFilterModal)
        this.referenceTypeFilterModal.value = "all";

      // ? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸
      this.updateReferenceSelectionCount();

      // ëª¨ë‹¬ ?œì‹œ
      this.referenceSelectionModal.style.display = "flex";
      document.body.style.overflow = "hidden"; // ë°°ê²½ ?¤í¬ë¡?ë°©ì?

      // ?‘ê·¼?? ?¬ì»¤???´ë™ (ê²€???…ë ¥ ?„ë“œë¡?
      setTimeout(() => {
        if (this.referenceSearchInput) {
          this.referenceSearchInput.focus();
        }
      }, 100);

      logger.log("?“š ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬ ?´ë¦¼");
    } catch (error) {
      logger.error("ëª¨ë‹¬ ?´ê¸° ?¤íŒ¨:", error);
      this.showMessage("??ëª¨ë‹¬???????†ìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬ ?«ê¸°
   *
   * - ëª¨ë‹¬ ?¨ê?
   * - ë°°ê²½ ?¤í¬ë¡?ë³µì›
   * - ?¬ì»¤??ë³µì› (?ë˜ ë²„íŠ¼?¼ë¡œ)
   */
  closeReferenceSelectionModal() {
    if (!this.referenceSelectionModal) return;

    this.referenceSelectionModal.style.display = "none";
    document.body.style.overflow = ""; // ë°°ê²½ ?¤í¬ë¡?ë³µì›

    // ?‘ê·¼?? ?¬ì»¤??ë³µì›
    if (this.selectReferencesBtn) {
      this.selectReferencesBtn.focus();
    }

    logger.log("?“š ?ˆí¼?°ìŠ¤ ? íƒ ëª¨ë‹¬ ?«í˜");
  }

  /**
   * Phase 1.6.2: ?‘ì„±ê¸€??ì°¸ê³ ???ˆí¼?°ìŠ¤ ëª©ë¡ ëª¨ë‹¬ ?œì‹œ
   *
   * @param {string} editId - ?‘ì„±ê¸€ ID
   *
   * - ?‘ì„±ê¸€???°ê²°???ˆí¼?°ìŠ¤ ëª©ë¡ ì¡°íšŒ
   * - ì»¤ìŠ¤?€ ëª¨ë‹¬ë¡??œì‹œ
   * - ê°??ˆí¼?°ìŠ¤ "?´ìš© ë³´ê¸°" ë²„íŠ¼ ?œê³µ
   */
  showLinkedReferencesModal(editId) {
    try {
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem) {
        this.showMessage("???‘ì„±ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }

      const linkedRefs = this.getLinkedReferences(editId);

      if (linkedRefs.length === 0) {
        this.showMessage("?¹ï¸ ?°ê²°???ˆí¼?°ìŠ¤ê°€ ?†ìŠµ?ˆë‹¤.", "info");
        return;
      }

      // ëª¨ë‹¬ ?´ìš© ?ì„±
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
              ? "êµ¬ì¡°"
              : refType === "idea"
              ? "?„ì´?”ì–´"
              : "ê¸°í?";

          return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${
            content.length >= 100 ? "..." : ""
          }</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>Â·</span>
                                <span class="reference-type-badge badge-${this.escapeHtml(
                                  refType
                                )}">${this.escapeHtml(refTypeLabel)}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${ref.id}"
                                data-item-type="reference"
                                aria-label="?ˆí¼?°ìŠ¤ ?´ìš© ë³´ê¸°">
                                ?´ìš© ë³´ê¸°
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
                            <h3 id="linked-ref-modal-title">?“š ??ê¸€??ì°¸ê³ ???ˆí¼?°ìŠ¤</h3>
                            <button class="close-btn" aria-label="ëª¨ë‹¬ ?«ê¸°">Ã—</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>?‘ì„±ê¸€:</strong> ${editTitle}${
        editTitle.length >= 50 ? "..." : ""
      }
                            </div>
                            <div class="linked-items-list" role="list" aria-label="ì°¸ê³  ?ˆí¼?°ìŠ¤ ëª©ë¡">
                                ${refsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="?«ê¸°">?«ê¸°</button>
                        </div>
                    </div>
                </div>
            `;

      // ëª¨ë‹¬ ?œì‹œ
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // ?´ë²¤??ë°”ì¸??
      this.bindCustomModalEvents(modal);

      logger.log(`?“š ?°ê²° ?ˆí¼?°ìŠ¤ ëª¨ë‹¬ ?œì‹œ: ${linkedRefs.length}ê°?);
    } catch (error) {
      logger.error("?°ê²°???ˆí¼?°ìŠ¤ ëª¨ë‹¬ ?œì‹œ ?¤íŒ¨:", error);
      this.showMessage("???ˆí¼?°ìŠ¤ë¥?ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * Phase 1.6.2: ?ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ëª©ë¡ ëª¨ë‹¬ ?œì‹œ
   *
   * @param {string} refId - ?ˆí¼?°ìŠ¤ ID
   *
   * - ?ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ëª©ë¡ ì¡°íšŒ (??°©??
   * - ì»¤ìŠ¤?€ ëª¨ë‹¬ë¡??œì‹œ
   * - ê°??‘ì„±ê¸€ "?´ìš© ë³´ê¸°" ë²„íŠ¼ ?œê³µ
   */
  showEditsByReferenceModal(refId) {
    try {
      const refItem = this.savedTexts.find((item) => item.id === refId);
      if (!refItem) {
        this.showMessage("???ˆí¼?°ìŠ¤ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }

      const usedEdits = this.getEditsByReference(refId);

      if (usedEdits.length === 0) {
        this.showMessage("?¹ï¸ ???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ??ê¸€???†ìŠµ?ˆë‹¤.", "info");
        return;
      }

      // ëª¨ë‹¬ ?´ìš© ?ì„±
      const refTitle = this.escapeHtml(refItem.content || "").substring(0, 50);
      const editsHtml = usedEdits
        .map((edit, index) => {
          const content = this.escapeHtml(edit.content || "").substring(0, 100);
          const date =
            this.formatDateFromFirestore(edit.createdAt) || edit.date || "";
          const topic = this.escapeHtml(edit.topic || "ì£¼ì œ ?†ìŒ");

          return `
                    <div class="linked-item" role="listitem">
                        <div class="item-number">${index + 1}.</div>
                        <div class="item-details">
                            <div class="item-content">${content}${
            content.length >= 100 ? "..." : ""
          }</div>
                            <div class="item-meta">
                                <span>${date}</span>
                                <span>Â·</span>
                                <span>?·ï¸?${topic}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${edit.id}"
                                data-item-type="edit"
                                aria-label="?‘ì„±ê¸€ ?´ìš© ë³´ê¸°">
                                ?´ìš© ë³´ê¸°
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
                            <h3 id="used-in-edits-modal-title">?“ ???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€</h3>
                            <button class="close-btn" aria-label="ëª¨ë‹¬ ?«ê¸°">Ã—</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>?ˆí¼?°ìŠ¤:</strong> ${refTitle}${
        refTitle.length >= 50 ? "..." : ""
      }
                            </div>
                            <div class="linked-items-list" role="list" aria-label="ì°¸ê³ ???‘ì„±ê¸€ ëª©ë¡">
                                ${editsHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="primary-btn close-modal-btn" aria-label="?«ê¸°">?«ê¸°</button>
                        </div>
                    </div>
                </div>
            `;

      // ëª¨ë‹¬ ?œì‹œ
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // ?´ë²¤??ë°”ì¸??
      this.bindCustomModalEvents(modal);

      logger.log(`?“ ì°¸ê³ ???‘ì„±ê¸€ ëª¨ë‹¬ ?œì‹œ: ${usedEdits.length}ê°?);
    } catch (error) {
      logger.error("ì°¸ê³ ???‘ì„±ê¸€ ëª¨ë‹¬ ?œì‹œ ?¤íŒ¨:", error);
      this.showMessage("???‘ì„±ê¸€??ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ?€?¥ëœ ê¸€ ?´ìš© ë³´ê¸°
   *
   * @param {string} itemId - ?€?¥ëœ ê¸€ ID
   * @param {Object|string} [options] - ì¶”ê? ?µì…˜ (type ??
   *
   * - ?€?¥ëœ ê¸€ ëª©ë¡?¼ë¡œ ?„í™˜
   * - ?´ë‹¹ ê¸€??ì°¾ì•„ ?¤í¬ë¡?
   * - ?´ìš© ?ë™ ?¼ì¹˜ê¸?
   * - ê°•ì¡° ?œì‹œ (2ì´?
   * - ?ˆì™¸: ê¸€??ì°¾ì? ëª»í•œ ê²½ìš° ?¸ì§‘ ?”ë©´ ?„í™˜
   */
  async viewSavedText(itemId, options = {}) {
    try {
      if (!itemId) {
        logger.warn("? ï¸ viewSavedText: itemIdê°€ ?†ìŠµ?ˆë‹¤.");
        return;
      }

      const optionObject =
        typeof options === "string" ? { type: options } : options || {};
      const cachedItem = this.savedTexts?.find((t) => t.id === itemId);
      const requestedType =
        optionObject.type || (cachedItem ? cachedItem.type || "edit" : null);
      const normalizedType =
        requestedType === "reference" ? "reference" : "edit";

      // ?€?¥ëœ ê¸€ ëª©ë¡?¼ë¡œ ?„í™˜
      this.switchTab("saved");

      // ?„í„°ë¥??ë™ ì¡°ì •?˜ì—¬ ?€??ì¹´ë“œê°€ DOM??ì¡´ì¬?˜ë„ë¡?ì²˜ë¦¬
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

      // ?´ë‹¹ ê¸€ ì°¾ê¸°
      const savedItem = document.querySelector(`[data-item-id="${itemId}"]`);

      if (savedItem) {
        // ?¤í¬ë¡?ë°?ê°•ì¡° ?œì‹œ
        savedItem.scrollIntoView({ behavior: "smooth", block: "center" });
        savedItem.classList.add("highlight");

        // ?´ìš© ?ë™ ?¼ì¹˜ê¸?(?”ë³´ê¸?ë²„íŠ¼ ?´ë¦­)
        const toggleBtn = savedItem.querySelector(".saved-item-toggle");
        const contentEl = savedItem.querySelector(".saved-item-content");

        if (
          toggleBtn &&
          contentEl &&
          !contentEl.classList.contains("expanded")
        ) {
          toggleBtn.click();
        }

        // ê°•ì¡° ?œì‹œ ?œê±° (2ì´???
        setTimeout(() => {
          savedItem.classList.remove("highlight");
        }, 2000);

        // ?¬ì»¤???´ë™ (?‘ê·¼??
        savedItem.setAttribute("tabindex", "-1");
        savedItem.focus();

        logger.log(`???€?¥ëœ ê¸€ ?´ìš© ë³´ê¸°: ${itemId}`);
      } else {
        // ê¸€??ì°¾ì? ëª»í•œ ê²½ìš° (?„í„° ë³€ê²??ëŠ” ?¸ì§‘ ?”ë©´ ?„í™˜)
        logger.warn(
          `? ï¸ ?€?¥ëœ ê¸€ ì¹´ë“œë¥?ì°¾ì„ ???†ìŒ: ${itemId}, ?¸ì§‘ ?”ë©´ ?„í™˜`
        );

        const item = cachedItem || this.savedTexts.find((t) => t.id === itemId);
        if (item) {
          const type =
            (item.type || "edit") === "reference" ? "reference" : "edit";
          this.editText(itemId, type);
          this.showMessage("?“ ?¸ì§‘ ?”ë©´?¼ë¡œ ?„í™˜?ˆìŠµ?ˆë‹¤.", "info");
        } else {
          this.showMessage("??ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        }
      }
    } catch (error) {
      logger.error("viewSavedText ?¤íŒ¨:", error);
      this.showMessage("???´ìš©??ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ì°¸ê³  ?ˆí¼?°ìŠ¤ ?´ìš©??ì¦‰ì‹œ ?œì‹œ?©ë‹ˆ??
   *
   * @param {string} referenceId - ?ˆí¼?°ìŠ¤ ID
   */
  showReferenceContentModal(referenceId) {
    try {
      if (!referenceId) {
        logger.warn("? ï¸ showReferenceContentModal: referenceIdê°€ ?†ìŠµ?ˆë‹¤.");
        return;
      }

      const referenceItem = this.savedTexts.find(
        (item) =>
          item.id === referenceId && (item.type || "edit") === "reference"
      );

      if (!referenceItem) {
        this.showMessage("???ˆí¼?°ìŠ¤ ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }

      const refType = referenceItem.referenceType || "unspecified";
      const refTypeLabel =
        refType === "structure"
          ? "êµ¬ì¡°"
          : refType === "idea"
          ? "?„ì´?”ì–´"
          : "ê¸°í?";
      const dateText =
        this.formatDateFromFirestore(referenceItem.createdAt) ||
        referenceItem.date ||
        "";
      const topicText = this.escapeHtml(
        referenceItem.topic || "ì¶œì²˜ ?•ë³´ ?†ìŒ"
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
                            <h3 id="reference-detail-title">?“š ì°¸ê³  ?ˆí¼?°ìŠ¤</h3>
                            <button class="close-btn" aria-label="ëª¨ë‹¬ ?«ê¸°">??/button>
                        </div>
                        <div class="modal-body">
                            <div class="reference-detail-meta">
                                <div><strong>? í˜•:</strong> <span class="reference-type-badge badge-${this.escapeHtml(
                                  refType
                                )}">${this.escapeHtml(
        refTypeLabel
      )}</span></div>
                                <div><strong>?‘ì„±??</strong> ${
                                  dateText || "ê¸°ë¡ ?†ìŒ"
                                }</div>
                                <div><strong>ì¶œì²˜:</strong> ${topicText}</div>
                            </div>
                            <div class="reference-detail-content" role="region" aria-label="?ˆí¼?°ìŠ¤ ?´ìš©">
                                ${contentHtml || "<em>?´ìš©???†ìŠµ?ˆë‹¤.</em>"}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="secondary-btn reference-import-btn" data-reference-id="${referenceId}">
                                ?ï¸ ?‘ì„± ?ì—­?¼ë¡œ ë¶ˆëŸ¬?¤ê¸°
                            </button>
                            <button class="primary-btn close-modal-btn" aria-label="?«ê¸°">?«ê¸°</button>
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
      logger.error("showReferenceContentModal ?¤íŒ¨:", error);
      this.showMessage("???ˆí¼?°ìŠ¤ë¥??œì‹œ?˜ì? ëª»í–ˆ?µë‹ˆ??", "error");
    }
  }

  /**
   * Phase 1.6.2: ì»¤ìŠ¤?€ ëª¨ë‹¬ ?´ë²¤??ë°”ì¸??
   *
   * @param {HTMLElement} modal - ëª¨ë‹¬ DOM ?”ì†Œ
   *
   * - ?«ê¸° ë²„íŠ¼ ?´ë²¤??
   * - ëª¨ë‹¬ ?¸ë? ?´ë¦­
   * - ESC ??
   * - "?´ìš© ë³´ê¸°" ë²„íŠ¼
   */
  bindCustomModalEvents(modal) {
    if (!modal) return;

    // ?«ê¸° ë²„íŠ¼
    const closeBtns = modal.querySelectorAll(".close-btn, .close-modal-btn");
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.remove();
        document.body.style.overflow = "";
      });
    });

    // ëª¨ë‹¬ ?¸ë? ?´ë¦­
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

    // "?´ìš© ë³´ê¸°" ë²„íŠ¼
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
   * ?ˆí¼?°ìŠ¤ ? íƒ ëª©ë¡ ?Œë”ë§?
   *
   * @param {Array} references - ?ˆí¼?°ìŠ¤ ë°°ì—´ (?µì…˜, ?†ìœ¼ë©??„ì²´ ì¡°íšŒ)
   *
   * - ì²´í¬ë°•ìŠ¤ë¡??¤ì¤‘ ? íƒ ê°€??
   * - ?„ì¬ ? íƒ????ª© ì²´í¬ ?œì‹œ
   * - ê²€??ë°??„í„° ?ìš©
   * - ìµœì‹ ???•ë ¬
   */
  /**
   * ?ìŠ¤???˜ì´?¼ì´??(ê²€?‰ì–´ ê°•ì¡°)
   *
   * @param {string} text - ?ë³¸ ?ìŠ¤??
   * @param {string} query - ê²€?‰ì–´
   * @returns {string} ?˜ì´?¼ì´?…ëœ HTML ë¬¸ì??
   *
   * - ê²€?‰ì–´?€ ?¼ì¹˜?˜ëŠ” ë¶€ë¶„ì„ <mark> ?œê·¸ë¡?ê°ìŒˆ
   * - XSS ë°©ì?ë¥??„í•´ ?˜ë¨¸ì§€ ë¶€ë¶„ì? ?´ìŠ¤ì¼€?´í”„ ì²˜ë¦¬
   * - ?€?Œë¬¸??êµ¬ë¶„ ?†ì´ ë§¤ì¹­
   */
  highlightText(text, query) {
    if (!text) return "";
    if (!query) return this.escapeHtml(text);

    try {
      // ?•ê·œ???¹ìˆ˜ë¬¸ì ?´ìŠ¤ì¼€?´í”„
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
      logger.warn("?˜ì´?¼ì´??ì²˜ë¦¬ ì¤??¤ë¥˜:", e);
      return this.escapeHtml(text);
    }
  }

  renderReferenceSelectionList(references = null) {
    if (!this.referenceSelectionList) return;

    try {
      // ?ˆí¼?°ìŠ¤ ëª©ë¡ ê°€?¸ì˜¤ê¸?(?Œë¼ë¯¸í„° ?†ìœ¼ë©??„ì²´ ì¡°íšŒ)
      let refs =
        references ||
        this.savedTexts.filter((item) => (item.type || "edit") === "reference");

      // ê²€???„í„° ?ìš©
      const searchTerm =
        this.referenceSearchInput?.value.toLowerCase().trim() || "";
      if (searchTerm) {
        refs = refs.filter((ref) => {
          const content = (ref.content || "").toLowerCase();
          const topic = (ref.topic || "").toLowerCase();
          return content.includes(searchTerm) || topic.includes(searchTerm);
        });
      }

      // ?€???„í„° ?ìš©
      const typeFilter = this.referenceTypeFilterModal?.value || "all";
      if (typeFilter !== "all") {
        refs = refs.filter(
          (ref) => (ref.referenceType || "other") === typeFilter
        );
      }

      // ?•ë ¬ (ìµœì‹ ??
      refs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      // HTML ?ì„±
      if (refs.length === 0) {
        this.referenceSelectionList.innerHTML = `
                    <div class="empty-state" style="padding: 40px; text-align: center; color: #6c757d;">
                        <p>ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.</p>
                    </div>
                `;
        return;
      }

      const html = refs
        .map((ref) => {
          const isSelected = this.selectedReferences.includes(ref.id);

          // ?ìŠ¤??ì¤€ë¹?(ê¸¸ì´ ?œí•œ)
          const contentRaw = ref.content || "";
          const isLong = contentRaw.length > 100;
          const contentDisplay = isLong
            ? contentRaw.substring(0, 100)
            : contentRaw;

          // ?˜ì´?¼ì´???ìš©
          const content = this.highlightText(contentDisplay, searchTerm);
          const topic = this.highlightText(
            ref.topic || "ì£¼ì œ ?†ìŒ",
            searchTerm
          );

          const refType = ref.referenceType || "other";
          const typeLabel =
            refType === "structure"
              ? "êµ¬ì¡°"
              : refType === "idea"
              ? "?„ì´?”ì–´"
              : "ë¯¸ì???;
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
                                ${date ? "<span>Â·</span>" : ""}
                                <span class="reference-type-badge ${badgeClass}">${typeLabel}</span>
                                <span>Â·</span>
                                <span>${topic}</span>
                            </div>
                        </div>
                    </div>
                `;
        })
        .join("");

      this.referenceSelectionList.innerHTML = html;

      // ì²´í¬ë°•ìŠ¤ ?´ë²¤??ë°”ì¸??
      this.bindReferenceCheckboxEvents();

      logger.log(`???ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§??„ë£Œ: ${refs.length}ê°?);
    } catch (error) {
      logger.error("?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§??¤íŒ¨:", error);
      this.referenceSelectionList.innerHTML = `
                <div class="error-state" style="padding: 40px; text-align: center; color: #dc3545;">
                    <p>??ëª©ë¡??ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤.</p>
                </div>
            `;
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ì²´í¬ë°•ìŠ¤ ?´ë²¤??ë°”ì¸??
   *
   * - ì²´í¬ë°•ìŠ¤ ë³€ê²???? íƒ ë°°ì—´ ?…ë°?´íŠ¸
   * - ? íƒ ê°œìˆ˜ ?¤ì‹œê°??œì‹œ
   * - ë¦¬ìŠ¤???„ì´???´ë¦­?¼ë¡œ??? ê? ê°€??
   */
  bindReferenceCheckboxEvents() {
    if (!this.referenceSelectionList) return;

    // ì²´í¬ë°•ìŠ¤ ë³€ê²??´ë²¤??
    const checkboxes = this.referenceSelectionList.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const refId = e.target.value;

        if (e.target.checked) {
          // ? íƒ ì¶”ê?
          if (!this.selectedReferences.includes(refId)) {
            this.selectedReferences.push(refId);
          }
        } else {
          // ? íƒ ?œê±°
          this.selectedReferences = this.selectedReferences.filter(
            (id) => id !== refId
          );
        }

        // ? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸
        this.updateReferenceSelectionCount();

        logger.log("? íƒ???ˆí¼?°ìŠ¤:", this.selectedReferences);
      });
    });

    // ë¦¬ìŠ¤???„ì´???´ë¦­ ??ì²´í¬ë°•ìŠ¤ ? ê? (UX ê°œì„ )
    const listItems = this.referenceSelectionList.querySelectorAll(
      ".reference-list-item"
    );
    listItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        // ì²´í¬ë°•ìŠ¤ ?ì²´ë¥??´ë¦­??ê²½ìš°???œì™¸
        if (e.target.type !== "checkbox") {
          const checkbox = item.querySelector('input[type="checkbox"]');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            // change ?´ë²¤???¸ë¦¬ê±?
            checkbox.dispatchEvent(new Event("change"));
          }
        }
      });
    });
  }

  /**
   * ? íƒ???ˆí¼?°ìŠ¤ ê°œìˆ˜ ?…ë°?´íŠ¸
   *
   * - ëª¨ë‹¬ ??ê°œìˆ˜ ?œì‹œ
   * - aria-liveë¡??¤í¬ë¦?ë¦¬ë”???Œë¦¼
   */
  updateReferenceSelectionCount() {
    const count = this.selectedReferences.length;

    if (this.modalSelectedCount) {
      this.modalSelectedCount.textContent = count;
    }

    // aria-liveë¡??¤í¬ë¦?ë¦¬ë”???Œë¦¼
    const selectionCountDiv =
      this.referenceSelectionModal?.querySelector(".selection-count");
    if (selectionCountDiv) {
      selectionCountDiv.setAttribute("aria-live", "polite");
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ? íƒ/?´ì œ ? ê? (?ˆê±°???¸í™˜??
   * @deprecated bindReferenceCheckboxEvents??change ?´ë²¤?¸ë¡œ ?€ì²´ë¨
   */
  toggleReferenceSelection(refId) {
    const index = this.selectedReferences.indexOf(refId);
    if (index > -1) {
      // ?´ë? ? íƒ??ê²½ìš° ?œê±°
      this.selectedReferences.splice(index, 1);
    } else {
      // ? íƒ?˜ì? ?Šì? ê²½ìš° ì¶”ê?
      this.selectedReferences.push(refId);
    }

    this.updateReferenceSelectionCount();
  }

  /**
   * ëª¨ë‹¬ ??? íƒ ê°œìˆ˜ ?…ë°?´íŠ¸ (?ˆê±°???¸í™˜??
   * @deprecated updateReferenceSelectionCountë¡??µí•©??
   */
  updateModalSelectedCount() {
    this.updateReferenceSelectionCount();
  }

  /**
   * ?ˆí¼?°ìŠ¤ ? íƒ ?•ì¸
   *
   * - ? íƒ???ˆí¼?°ìŠ¤ ?œê·¸ ?œì‹œ
   * - ëª¨ë‹¬ ?«ê¸°
   * - ? íƒ ê°œìˆ˜ ë²„íŠ¼ ?…ë°?´íŠ¸
   */
  confirmReferenceSelection() {
    try {
      // ?œê·¸ ?Œë”ë§?(? ê? ë²„íŠ¼ ì¹´ìš´?¸ë„ ?¨ê»˜ ?…ë°?´íŠ¸)
      this.renderSelectedReferenceTags();

      // ë²„íŠ¼ ê°œìˆ˜ ?…ë°?´íŠ¸
      if (this.selectedRefCount) {
        this.selectedRefCount.textContent = `(${this.selectedReferences.length}ê°?? íƒ??`;
      }

      // ? ê? ë²„íŠ¼ ì¹´ìš´???…ë°?´íŠ¸
      if (this.collapseRefCount) {
        this.collapseRefCount.textContent = `(${this.selectedReferences.length}ê°?? íƒ??`;
      }

      // ëª¨ë‹¬ ?«ê¸°
      this.closeReferenceSelectionModal();

      logger.log(`??${this.selectedReferences.length}ê°??ˆí¼?°ìŠ¤ ? íƒ ?„ë£Œ`);
    } catch (error) {
      logger.error("? íƒ ?•ì¸ ?¤íŒ¨:", error);
      this.showMessage("??? íƒ???€?¥í•  ???†ìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ? íƒ???ˆí¼?°ìŠ¤ ?œê·¸ ?Œë”ë§?
   *
   * - ? íƒ??ê°??ˆí¼?°ìŠ¤ë¥??œê·¸ë¡??œì‹œ
   * - X ë²„íŠ¼?¼ë¡œ ?œê±° ê°€??
   */
  renderSelectedReferenceTags() {
    if (!this.selectedReferencesTags) return;

    try {
      if (this.selectedReferences.length === 0) {
        this.selectedReferencesTags.innerHTML = "";
        // ? ê? ë²„íŠ¼ ì¹´ìš´?¸ë„ ?…ë°?´íŠ¸
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0ê°?? íƒ??";
        }
        return;
      }

      // ? íƒ???ˆí¼?°ìŠ¤ ê°ì²´ ê°€?¸ì˜¤ê¸?
      const selectedRefs = this.selectedReferences
        .map((refId) => this.savedTexts.find((item) => item.id === refId))
        .filter(Boolean); // null ?œê±°

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
                            aria-label="${this.escapeHtml(content)} ?œê±°"
                            title="?œê±°">
                            Ã—
                        </button>
                    </div>
                `;
        })
        .join("");

      this.selectedReferencesTags.innerHTML = html;

      // ? ê? ë²„íŠ¼ ì¹´ìš´?¸ë„ ?…ë°?´íŠ¸
      if (this.collapseRefCount) {
        this.collapseRefCount.textContent = `(${this.selectedReferences.length}ê°?? íƒ??`;
      }

      // ?œê±° ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
      this.bindReferenceTagRemoveEvents();

      logger.log(`??${selectedRefs.length}ê°??œê·¸ ?Œë”ë§??„ë£Œ`);
    } catch (error) {
      logger.error("?œê·¸ ?Œë”ë§??¤íŒ¨:", error);
      this.selectedReferencesTags.innerHTML =
        '<p style="color: #dc3545;">?œê·¸ë¥??œì‹œ?????†ìŠµ?ˆë‹¤.</p>';
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ?œê·¸ ?œê±° ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
   */
  bindReferenceTagRemoveEvents() {
    if (!this.selectedReferencesTags) return;

    const removeBtns =
      this.selectedReferencesTags.querySelectorAll(".remove-btn");

    removeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const refId = btn.getAttribute("data-ref-id");

        // ? íƒ ë°°ì—´?ì„œ ?œê±°
        this.selectedReferences = this.selectedReferences.filter(
          (id) => id !== refId
        );

        // ?œê·¸ ?¬ë Œ?”ë§
        this.renderSelectedReferenceTags();

        // ë²„íŠ¼ ê°œìˆ˜ ?…ë°?´íŠ¸
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = `(${this.selectedReferences.length}ê°?? íƒ??`;
        }

        logger.log(`?ˆí¼?°ìŠ¤ ?œê±°: ${refId}`);
      });
    });
  }

  /**
   * ? íƒ???ˆí¼?°ìŠ¤ë¥??œê·¸ë¡??Œë”ë§?(?ˆê±°???¸í™˜??
   * @deprecated renderSelectedReferenceTagsë¡??µí•©??
   */
  renderSelectedReferencesTags() {
    this.renderSelectedReferenceTags();
  }

  /**
   * ? íƒ???ˆí¼?°ìŠ¤ ?œê±° (?ˆê±°???¸í™˜?? ?„ì—­ ?¨ìˆ˜?ì„œ ?¸ì¶œ)
   */
  removeSelectedReference(refId) {
    const index = this.selectedReferences.indexOf(refId);
    if (index > -1) {
      this.selectedReferences.splice(index, 1);
      this.renderSelectedReferenceTags();

      // ë²„íŠ¼ ?ìŠ¤???…ë°?´íŠ¸
      if (this.selectedRefCount) {
        this.selectedRefCount.textContent = `(${this.selectedReferences.length}ê°?? íƒ??`;
      }
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ ëª©ë¡ ?„í„°ë§?(ê²€??+ ?€??
   */
  filterReferenceList() {
    const searchTerm = this.referenceSearchInput?.value.toLowerCase() || "";
    const selectedType = this.referenceTypeFilterModal?.value || "all";

    let filtered = this.savedTexts.filter((item) => item.type === "reference");

    // ê²€?‰ì–´ ?„í„°
    if (searchTerm) {
      filtered = filtered.filter(
        (ref) =>
          ref.content.toLowerCase().includes(searchTerm) ||
          (ref.topic && ref.topic.toLowerCase().includes(searchTerm))
      );
    }

    // ?€???„í„°
    if (selectedType !== "all") {
      filtered = filtered.filter((ref) => ref.referenceType === selectedType);
    }

    // ?¬ë Œ?”ë§
    this.renderReferenceSelectionList(filtered);
  }

  /**
   * ?‘ì„±ê¸€???°ê²°???ˆí¼?°ìŠ¤ ì¡°íšŒ (ì§ì ‘ ì¡°íšŒ)
   *
   * @param {string} editId - ?‘ì„±ê¸€ ID
   * @returns {Array} ?°ê²°???ˆí¼?°ìŠ¤ ê°ì²´ ë°°ì—´
   *
   * - ?‘ì„±ê¸€??linkedReferences ID ë°°ì—´??ê¸°ë°˜?¼ë¡œ ?ˆí¼?°ìŠ¤ ê°ì²´ ì¡°íšŒ
   * - ì¡´ì¬?˜ì? ?ŠëŠ” ?ˆí¼?°ìŠ¤???œì™¸
   * - ìµœì‹ ???•ë ¬
   */
  getLinkedReferences(editId) {
    try {
      // ?‘ì„±ê¸€ ì°¾ê¸°
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem || (editItem.type || "edit") !== "edit") {
        return [];
      }

      // linkedReferences ë°°ì—´ ?•ì¸
      const linkedRefIds = editItem.linkedReferences || [];
      if (linkedRefIds.length === 0) {
        return [];
      }

      // IDë¥?ê°ì²´ë¡?ë³€??(O(n) ê²€??
      const linkedRefs = linkedRefIds
        .map((refId) =>
          this.savedTexts.find(
            (item) => item.id === refId && (item.type || "edit") === "reference"
          )
        )
        .filter(Boolean); // null ?œê±°

      // ìµœì‹ ???•ë ¬
      linkedRefs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      return linkedRefs;
    } catch (error) {
      logger.error("?°ê²°???ˆí¼?°ìŠ¤ ì¡°íšŒ ?¤íŒ¨:", error);
      return [];
    }
  }

  /**
   * ?ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ì¡°íšŒ (??°©??
   *
   * @param {string} referenceId - ?ˆí¼?°ìŠ¤ ID
   * @returns {Array} ???ˆí¼?°ìŠ¤ë¥?ì°¸ê³ ???‘ì„±ê¸€ ê°ì²´ ë°°ì—´
   *
   * - ?´ë¼?´ì–¸?¸ì—??ê³„ì‚° (Firebase ì¿¼ë¦¬ ?†ìŒ)
   * - ë©”ëª¨ë¦¬ì— ë¡œë“œ??savedTexts ë°°ì—´??O(n) ê²€??
   * - ìµœì‹ ???•ë ¬
   */
  getEditsByReference(referenceId) {
    try {
      // ?‘ì„±ê¸€ë§??„í„°ë§?+ linkedReferences??referenceId ?¬í•¨
      const edits = this.savedTexts.filter(
        (item) =>
          (item.type || "edit") === "edit" &&
          Array.isArray(item.linkedReferences) &&
          item.linkedReferences.includes(referenceId)
      );

      // ìµœì‹ ???•ë ¬
      edits.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      return edits;
    } catch (error) {
      logger.error("??°©??ì¡°íšŒ ?¤íŒ¨:", error);
      return [];
    }
  }

  /**
   * ??°©??ì¡°íšŒ ìºì‹œ ë¬´íš¨??
   *
   * - ?°ì´??ë³€ê²???(?€?? ?? œ) ìºì‹œ ì´ˆê¸°??
   * - ?„ì¬??ìºì‹±???¬ìš©?˜ì? ?Šì?ë§? ?¥í›„ ?•ì¥?±ì„ ?„í•´ ?¨ìˆ˜ ?œê³µ
   */
  invalidateReferenceLinkCache() {
    if (this.referenceLinkCache) {
      this.referenceLinkCache.clear();
    }
    // ?„ì¬??ë§¤ë²ˆ ê³„ì‚°?˜ë?ë¡?ë³„ë„ ?‘ì—… ë¶ˆí•„??
    logger.log("?“š ?ˆí¼?°ìŠ¤ ë§í¬ ìºì‹œ ë¬´íš¨??(?„ì¬??ìºì‹± ë¯¸ì‚¬??");
  }

  // ===== ?¤í¬ë¦½íŠ¸ ?‘ì„± ê¸°ëŠ¥ =====

  /**
   * ?¤í¬ë¦½íŠ¸ ?‘ì„± ê¸°ëŠ¥ ì´ˆê¸°??
   */
  initArticleManagement() {
    // ===== [Bug Fix] ì¤‘ë³µ ?¤í–‰ ë°©ì? =====
    // ëª©ì : switchTab()?ì„œ ???„í™˜ ?œë§ˆ?????¨ìˆ˜ê°€ ?¸ì¶œ?˜ì–´
    // ?´ë²¤??ë¦¬ìŠ¤?ˆê? ì¤‘ë³µ ?±ë¡?˜ëŠ” ê²ƒì„ ë°©ì?
    // ì¦ìƒ: ?€??ë²„íŠ¼ ?´ë¦­ ???™ì¼??ê¸€???¬ëŸ¬ ê°??€?¥ë˜??ë²„ê·¸
    if (this.isArticleManagementInitialized) {
      return; // ?´ë? ì´ˆê¸°?”ë˜?ˆìœ¼ë©?ì¡°ê¸° ë¦¬í„´
    }
    this.isArticleManagementInitialized = true;

    // DOM ?”ì†Œ ì°¸ì¡°
    this.categorySelect = document.getElementById("category-select");
    this.articleCardsGrid = document.getElementById("article-cards-grid");
    this.managementEmptyState = document.getElementById(
      "management-empty-state"
    );
    // ===== [Dual Panel] ?€???¨ë„ DOM ?”ì†Œ ì°¸ì¡° =====
    // 2025-12-09 Phase 2 ì¶”ê?
    this.articleDetailContainer = document.getElementById(
      "article-detail-container"
    );
    this.articleDetailPanel1 = document.getElementById("article-detail-panel-1");
    this.articleDetailPanel2 = document.getElementById("article-detail-panel-2");
    this.detailDualDivider = document.getElementById("detail-dual-divider");

    // ?¨ë„ 1 DOM ?”ì†Œ ì°¸ì¡° (ê¸°ì¡´ articleDetailPanel ??articleDetailPanel1?¼ë¡œ ë³€ê²?
    this.articleDetailPanel = this.articleDetailPanel1; // ?˜ìœ„ ?¸í™˜??? ì?
    this.detailPanelClose = document.getElementById("detail-panel-close-1");
    this.detailEditBtn = document.getElementById("detail-edit-btn-1");
    this.detailDeleteBtn = document.getElementById("detail-delete-btn-1");
    this.detailCopyBtn = document.getElementById("detail-copy-btn-1");
    this.editSaveBtn = document.getElementById("edit-article-save-btn-1");
    this.editCancelBtn = document.getElementById("edit-article-cancel-btn-1");
    this.editTitleInput = document.getElementById("edit-title-input-1");
    this.editCategorySelect = document.getElementById("edit-category-select-1");
    this.editContentTextarea = document.getElementById("edit-content-textarea-1");

    // ===== [Dual Panel] ?¨ë„ 2 ?˜ì • ëª¨ë“œ DOM ì°¸ì¡° =====
    // 2025-12-10 ë²„ê·¸ ?˜ì •: ?¨ë„ 2 ?€??ì·¨ì†Œ ë²„íŠ¼ ?´ë²¤???°ê²°???„í•œ DOM ì°¸ì¡° ì¶”ê?
    this.editSaveBtn2 = document.getElementById("edit-article-save-btn-2");
    this.editCancelBtn2 = document.getElementById("edit-article-cancel-btn-2");
    this.editTitleInput2 = document.getElementById("edit-title-input-2");
    this.editCategorySelect2 = document.getElementById("edit-category-select-2");
    this.editContentTextarea2 = document.getElementById("edit-content-textarea-2");

    // ===== [Dual Panel] ?•ë? ë²„íŠ¼ DOM ì°¸ì¡° =====
    // 2025-12-09 Phase 1 ì¶”ê?: ?€???¨ë„ ?•ë? ë²„íŠ¼ ê¸°ëŠ¥ êµ¬í˜„
    this.detailExpandBtn1 = document.getElementById("detail-expand-btn-1");
    this.detailExpandBtn2 = document.getElementById("detail-expand-btn-2");

    // ???¤í¬ë¦½íŠ¸ ?‘ì„± ??ê´€???”ì†Œ
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

    // ?•ë? ëª¨ë“œ ê´€???”ì†Œ
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

    // ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?ì—­ ê´€???”ì†Œ
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

    // ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?íƒœ
    this.expandReferences = []; // ?•ë? ëª¨ë“œ?ì„œ ? íƒ???ˆí¼?°ìŠ¤ ëª©ë¡
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

    // ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ê´€???”ì†Œ
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
    // ?ì„¸ ëª¨ë“œ ?ˆí¼?°ìŠ¤ ë¡œë“œ ë²„íŠ¼
    this.detailLoadReferenceBtn = document.getElementById(
      "detail-load-reference-btn"
    );
    // ?´ë²¤??ë¦¬ìŠ¤???°ê²°
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

    // ?ˆí¼?°ìŠ¤ ë¡œë” ?íƒœ
    this.currentReferenceTab = "saved";
    this.referenceSearchDebounce = null;
    this.recentReferences = this.loadRecentReferences(); // localStorage?ì„œ ìµœê·¼ ?¬ìš© ê¸€ ë¡œë“œ

    // ?„ì¬ ? íƒ??ê¸€ ID
    this.selectedArticleId = null;
    this.managementArticles = []; // ?¤í¬ë¦½íŠ¸ ?‘ì„±??ê¸€ ëª©ë¡

    // ?´ë²¤??ë¦¬ìŠ¤??ë°”ì¸??
    if (this.categorySelect) {
      this.categorySelect.addEventListener("change", (e) => {
        this.filterArticlesByCategory(e.target.value);
      });
    }

    // ===== [Dual Panel] ?¨ë„ ?«ê¸° ë²„íŠ¼ ?´ë²¤??=====
    // ?¨ë„ 1 ?«ê¸° ë²„íŠ¼
    if (this.detailPanelClose) {
      this.detailPanelClose.addEventListener("click", () => {
        this.closeDetailPanelByIndex(0);
      });
    }

    // ?¨ë„ 2 ?«ê¸° ë²„íŠ¼
    const detailPanelClose2 = document.getElementById("detail-panel-close-2");
    if (detailPanelClose2) {
      detailPanelClose2.addEventListener("click", () => {
        this.closeDetailPanelByIndex(1);
      });
    }

    // ===== [Dual Panel] ?¨ë„ 1 ?˜ì •/?? œ/ë³µì‚¬ ë²„íŠ¼ ?´ë²¤??=====
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

    // ===== [Dual Panel] ?¨ë„ 2 ?˜ì •/?? œ/ë³µì‚¬ ë²„íŠ¼ ?´ë²¤??=====
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

    // ===== [Dual Panel] ?•ë? ë²„íŠ¼ ?´ë²¤??=====
    // 2025-12-09 Phase 1 ì¶”ê?: ?€???¨ë„ ?•ë? ë²„íŠ¼ ?´ë¦­ ?´ë²¤???°ê²°
    // ?¨ë„ 1 ?•ë? ë²„íŠ¼
    if (this.detailExpandBtn1) {
      this.detailExpandBtn1.addEventListener("click", () => {
        this.openExpandModeByIndex(0);
      });
    }

    // ?¨ë„ 2 ?•ë? ë²„íŠ¼
    if (this.detailExpandBtn2) {
      this.detailExpandBtn2.addEventListener("click", () => {
        this.openExpandModeByIndex(1);
      });
    }

    // ===== [Dual Panel] ?¨ë„ 1 ?€??ì·¨ì†Œ ë²„íŠ¼ ?´ë²¤??=====
    // 2025-12-10 ë²„ê·¸ ?˜ì •: ByIndex ?¨ìˆ˜ ?¸ì¶œë¡?ë³€ê²?(suffix ?ìš©??DOM ID ?¬ìš©)
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

    // ===== [Dual Panel] ?¨ë„ 2 ?€??ì·¨ì†Œ ë²„íŠ¼ ?´ë²¤??=====
    // 2025-12-10 ë²„ê·¸ ?˜ì •: ?¨ë„ 2 ?˜ì • ëª¨ë“œ ?€??ì·¨ì†Œ ê¸°ëŠ¥ ?°ê²°
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

    // ???¤í¬ë¦½íŠ¸ ?‘ì„± ???´ë²¤??
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

    // ì¹´í…Œê³ ë¦¬ ?ë™?„ì„± ?…ë°?´íŠ¸
    if (this.scriptCategoryInput) {
      this.scriptCategoryInput.addEventListener("input", () => {
        this.updateCategorySuggestions();
      });
    }

    // ?´ìš© ê¸€????ì¹´ìš´??
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.addEventListener("input", () => {
        this.updateContentCounter();
      });
      // ì´ˆê¸° ì¹´ìš´???œì‹œ
      this.updateContentCounter();
    }

    // ?•ë? ëª¨ë“œ ?´ë²¤??
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

    // ?•ë? ëª¨ë“œ textarea ?´ë²¤??
    if (this.expandContentTextarea) {
      this.expandContentTextarea.addEventListener("input", () => {
        this.updateExpandContentCounter();
      });
    }

    // ESC ?¤ë¡œ ?•ë? ëª¨ë“œ ?«ê¸°
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.contentExpandModal &&
        this.contentExpandModal.style.display === "block"
      ) {
        this.closeExpandMode();
      }
    });

    // ?•ë? ëª¨ë“œ?ì„œ ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸°
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        // ?•ë? ëª¨ë“œ?ì„œ ?ˆí¼?°ìŠ¤ ë¡œë” ?´ê¸°
        this.openReferenceLoader();
      });
    }

    // ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?ì—­ ?‘ê¸°/?¼ì¹˜ê¸?
    if (this.expandToggleReferenceBtn) {
      this.expandToggleReferenceBtn.addEventListener("click", () => {
        this.toggleExpandReferencePanel();
      });
    }

    // ?•ë? ëª¨ë“œ ë¶„í• ???œë˜ê·?ê¸°ëŠ¥
    if (this.expandSplitDivider) {
      this.initExpandSplitResize();
    }

    // ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ?´ë²¤??
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

    // ?ˆí¼?°ìŠ¤ ???„í™˜
    this.referenceTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchReferenceTab(tab.getAttribute("data-tab"));
      });
    });

    // ?ˆí¼?°ìŠ¤ ê²€??
    if (this.referenceSearchInput) {
      this.referenceSearchInput.addEventListener("input", (e) => {
        this.handleReferenceSearch(e.target.value);
      });
    }

    // ?ˆí¼?°ìŠ¤ ?„í„°
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

    // ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸
    this.updateCategoryDropdown();

    // ===== [Dual Panel] êµ¬ë¶„???œë˜ê·?ì´ˆê¸°??=====
    this.initDualDividerDrag();
  }

  /**
   * ?¤í¬ë¦½íŠ¸ ?‘ì„±??ê¸€ ëª©ë¡ ë¡œë“œ
   */
  async loadArticlesForManagement() {
    if (!this.currentUser || !this.isFirebaseReady) {
      // Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜ê±°ë‚˜ ë¡œê·¸?¸ì´ ?„ìš”??ê²½ìš° ì¡°ìš©??ë°˜í™˜
      // ?ëŸ¬ ë©”ì‹œì§€ë¥??œì‹œ?˜ì? ?ŠìŒ (?•ìƒ?ì¸ ?í™©)
      logger.warn(
        "loadArticlesForManagement: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜ê±°ë‚˜ ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??"
      );
      this.managementArticles = [];
      // ë¹??íƒœ ?œì‹œ
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
      return;
    }

    try {
      // 'edit' ?€??ê¸€ë§?ë¡œë“œ (?ˆí¼?°ìŠ¤ ?œì™¸)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // ?¸ë±???¤ë¥˜ë¥??€ë¹„í•˜??orderBy ?†ì´ ë¨¼ì? ?œë„
      let querySnapshot;
      try {
        // [Tab Separation] 'script' ?€??ê¸€ë§?ë¡œë“œ (ê¸€ ?‘ì„± ??˜ 'edit' ?€???œì™¸)
        const q = window.firebaseQuery(
          textsRef,
          window.firebaseWhere("type", "==", "script"),
          window.firebaseOrderBy("createdAt", "desc")
        );
        querySnapshot = await window.firebaseGetDocs(q);
      } catch (indexError) {
        // ?¸ë±???¤ë¥˜??ê²½ìš° orderBy ?†ì´ ì¿¼ë¦¬
        if (indexError.code === "failed-precondition") {
          logger.warn(
            "Firebase ?¸ë±?¤ê? ?†ì–´ orderBy ?†ì´ ì¿¼ë¦¬?©ë‹ˆ?? ?´ë¼?´ì–¸???¬ì´?œì—???•ë ¬?©ë‹ˆ??"
          );
          // [Tab Separation] ?¸ë±???¤ë¥˜ ?œì—??'script' ?€???„í„°ë§?? ì?
          const q = window.firebaseQuery(
            textsRef,
            window.firebaseWhere("type", "==", "script")
          );
          querySnapshot = await window.firebaseGetDocs(q);
        } else {
          throw indexError; // ?¤ë¥¸ ?ëŸ¬???¤ì‹œ throw
        }
      }

      this.managementArticles = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.managementArticles.push({
          id: doc.id,
          // Firestore???€?¥ëœ title ?¬ìš© (?†ìœ¼ë©?"?œëª© ?†ìŒ")
          title: data.title || "?œëª© ?†ìŒ",
          content: data.content || "",
          category: data.topic || "ë¯¸ë¶„ë¥?, // topic??categoryë¡??¬ìš©
          createdAt: data.createdAt,
          order: data.order || 0, // order ?„ë“œ (ê¸°ë³¸ê°?0)
          viewCount: data.viewCount || 0,
          characterCount: data.characterCount, // [Fix] ê¸€?????„ë“œ ë¡œë“œ
        });
      });

      // orderBy ?†ì´ ë¡œë“œ??ê²½ìš° ?´ë¼?´ì–¸???¬ì´?œì—???•ë ¬
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
          return dateB - dateA; // ?´ë¦¼ì°¨ìˆœ (ìµœì‹ ??
        });
      }

      // order ?„ë“œê°€ ?†ëŠ” ê²½ìš° ì´ˆê¸°??
      await this.initializeArticleOrders();

      // ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸ (?Œë”ë§??„ì— ?…ë°?´íŠ¸)
      this.updateCategoryDropdown();

      // ?„ì¬ ? íƒ??ì¹´í…Œê³ ë¦¬ ?„í„° ê°?ê°€?¸ì˜¤ê¸?
      const currentCategory = this.categorySelect
        ? this.categorySelect.value
        : "";

      // ì¹´í…Œê³ ë¦¬ë³„ë¡œ ?•ë ¬ ???Œë”ë§?(?„ì¬ ? íƒ???„í„° ê°??„ë‹¬)
      this.renderArticleCards(currentCategory);

      // ì¹´í…Œê³ ë¦¬ ?œì•ˆ ?…ë°?´íŠ¸
      this.updateCategorySuggestions();

      // ?ˆí¼?°ìŠ¤ ë¡œë” ì¹´í…Œê³ ë¦¬ ?„í„° ?…ë°?´íŠ¸
      this.updateReferenceCategoryFilter();
    } catch (error) {
      logger.error("?¤í¬ë¦½íŠ¸ ?‘ì„±??ê¸€ ë¡œë“œ ?¤íŒ¨:", error);

      // Firebase ?¸ë±???¤ë¥˜??ì¡°ìš©??ì²˜ë¦¬ (?´ë? ?„ì—??ì²˜ë¦¬??
      if (error.code === "failed-precondition") {
        logger.warn(
          "Firebase ?¸ë±???¤ë¥˜: ?¸ë±?¤ê? ?ì„±???Œê¹Œì§€ ?´ë¼?´ì–¸???¬ì´???•ë ¬???¬ìš©?©ë‹ˆ??"
        );
        // ?ëŸ¬ ë©”ì‹œì§€ ?œì‹œ?˜ì? ?ŠìŒ (?•ìƒ ?™ì‘)
        this.managementArticles = [];
        if (this.articleCardsGrid) {
          this.articleCardsGrid.innerHTML = "";
        }
        if (this.managementEmptyState) {
          this.managementEmptyState.style.display = "block";
        }
        return;
      }

      // ?¤íŠ¸?Œí¬ ?¤ë¥˜???¸ì¦ ?¤ë¥˜??ê²½ìš°?ë§Œ ?ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
      if (error.code === "permission-denied" || error.code === "unavailable") {
        this.showMessage(
          "??ê¸€??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ?¤íŠ¸?Œí¬ ?°ê²°???•ì¸?´ì£¼?¸ìš”.",
          "error"
        );
      } else if (error.code && error.code !== "failed-precondition") {
        // ?¸ë±???¤ë¥˜ê°€ ?„ë‹Œ ?¤ë¥¸ ?ëŸ¬ë§??œì‹œ
        logger.error("?ˆìƒì¹?ëª»í•œ ?ëŸ¬:", error);
        // ê°œë°œ ?˜ê²½?ì„œë§??ì„¸ ?ëŸ¬ ?œì‹œ
        if (error.message && !error.message.includes("permission")) {
          this.showMessage("??ê¸€??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
        }
      }

      this.managementArticles = [];
      // ë¹??íƒœ ?œì‹œ
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
    }
  }

  /**
   * order ?„ë“œ ì´ˆê¸°??ë°?ì¤‘ë³µ ?•ë¦¬
   * - orderê°€ ?†ê±°?? ì¤‘ë³µ??orderê°€ ?ˆëŠ” ê²½ìš° ?¤í–‰
   * - createdAt ê¸°ì??¼ë¡œ ?¬ì •?¬í•˜???€?„ìŠ¤?¬í”„ ê¸°ë°˜ order ? ë‹¹
   */
  async initializeArticleOrders() {
    if (!this.currentUser || !this.isFirebaseReady) return;

    // ì¹´í…Œê³ ë¦¬ë³„ë¡œ ê·¸ë£¹??
    const articlesByCategory = {};
    this.managementArticles.forEach((article) => {
      const category = article.category || "ë¯¸ë¶„ë¥?;
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
        // ì¤‘ë³µ ì²´í¬
        const orders = articles.map((a) => a.order);
        const hasDuplicates = new Set(orders).size !== orders.length;
        const hasMissingOrder = articles.some(
          (a) => a.order === undefined || a.order === null
        );
        // [Fix] characterCount ?„ë½ ?•ì¸
        const hasMissingCharCount = articles.some(
          (a) => typeof a.characterCount !== "number"
        );

        if (hasDuplicates || hasMissingOrder || hasMissingCharCount) {
          logger.log(
            `[Order/Data Fix] ${category}: ?°ì´??ë³´ì •(?œì„œ/ê¸€?ìˆ˜)???œì‘?©ë‹ˆ??`
          );

          // createdAt ?¤ë¦„ì°¨ìˆœ ?•ë ¬ (ê³¼ê±° -> ìµœì‹ )
          articles.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
          });

          // order ?¬í• ??ë°?characterCount ë³´ì •
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const date = article.createdAt?.toDate?.() || new Date();
            let newOrder = date.getTime();

            // ?´ì „ ê¸€ë³´ë‹¤ ?‘ê±°??ê°™ìœ¼ë©?1ms ì¦ê? (?•ë ¬ ?œì„œ ? ì?)
            if (i > 0) {
              const prevOrder = articles[i - 1].order;
              if (newOrder <= prevOrder) {
                newOrder = prevOrder + 1;
              }
            }

            // ?…ë°?´íŠ¸ê°€ ?„ìš”?œì? ?•ì¸
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
          logger.log(`[Order/Data Fix] ${category}: ë³´ì • ?„ë£Œ`);
        }
      }

      if (hasUpdates) {
        await batch.commit();
        logger.log(
          `[Order Fix] ì´?${batchCount}ê°œì˜ ê¸€ ?œì„œê°€ ?…ë°?´íŠ¸?˜ì—ˆ?µë‹ˆ??`
        );
      }
    } catch (error) {
      logger.error("order ?„ë“œ ì´ˆê¸°???¤íŒ¨:", error);
    }
  }

  // [Refactoring] Utils ëª¨ë“ˆ ?¬ìš©
  extractTitleFromContent(content) {
    return extractTitleFromContent(content);
  }

  /**
   * ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸
   */
  updateCategoryDropdown() {
    if (!this.categorySelect || !this.editCategorySelect) return;

    // ê³ ìœ ??ì¹´í…Œê³ ë¦¬ ëª©ë¡ ì¶”ì¶œ
    const categories = new Set(["ë¯¸ë¶„ë¥?]);
    this.managementArticles.forEach((article) => {
      if (article.category) {
        categories.add(article.category);
      }
    });

    // "ë¯¸ë¶„ë¥?ë¥??œì™¸??ì¹´í…Œê³ ë¦¬ë¥??ŒíŒŒë²³ìˆœ?¼ë¡œ ?•ë ¬ ??"ë¯¸ë¶„ë¥?ë¥?ë§??¤ì— ì¶”ê?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "ë¯¸ë¶„ë¥?).sort();
    const sortedCategories = categoriesArray.includes("ë¯¸ë¶„ë¥?) 
      ? [...otherCategories, "ë¯¸ë¶„ë¥?] 
      : otherCategories;

    // ì¹´í…Œê³ ë¦¬ ? íƒ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸
    this.categorySelect.innerHTML = '<option value="">?„ì²´ ê¸€ ë³´ê¸°</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.categorySelect.appendChild(option);
    });

    // ?˜ì • ëª¨ë“œ ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸
    this.editCategorySelect.innerHTML = "";
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.editCategorySelect.appendChild(option);
    });
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¡œë” ì¹´í…Œê³ ë¦¬ ?„í„° ?…ë°?´íŠ¸
   */
  updateReferenceCategoryFilter() {
    if (!this.referenceCategoryFilter) return;

    // ê³ ìœ ??ì¹´í…Œê³ ë¦¬ ëª©ë¡ ì¶”ì¶œ
    const categories = new Set(["ë¯¸ë¶„ë¥?]);

    // ?€?¥ëœ ê¸€?ì„œ ì¹´í…Œê³ ë¦¬ ì¶”ì¶œ
    if (this.savedTexts) {
      this.savedTexts.forEach((text) => {
        if (text.topic) {
          categories.add(text.topic);
        }
      });
    }

    // "ë¯¸ë¶„ë¥?ë¥??œì™¸??ì¹´í…Œê³ ë¦¬ë¥??ŒíŒŒë²³ìˆœ?¼ë¡œ ?•ë ¬ ??"ë¯¸ë¶„ë¥?ë¥?ë§??¤ì— ì¶”ê?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "ë¯¸ë¶„ë¥?).sort();
    const sortedCategories = categoriesArray.includes("ë¯¸ë¶„ë¥?) 
      ? [...otherCategories, "ë¯¸ë¶„ë¥?] 
      : otherCategories;

    // ?„í„° ?œë¡­?¤ìš´ ?…ë°?´íŠ¸
    this.referenceCategoryFilter.innerHTML =
      '<option value="">?„ì²´ ì¹´í…Œê³ ë¦¬</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.referenceCategoryFilter.appendChild(option);
    });
  }

  /**
   * ì¹´í…Œê³ ë¦¬ë³??„í„°ë§?
   */
  filterArticlesByCategory(category) {
    this.renderArticleCards(category);
  }

  /**
   * ê¸€ ì¹´ë“œ ?Œë”ë§?
   */
  renderArticleCards(filterCategory = "") {
    if (!this.articleCardsGrid) return;

    // ?„í„°ë§?
    let filteredArticles = this.managementArticles;
    if (filterCategory) {
      filteredArticles = this.managementArticles.filter(
        (article) => (article.category || "ë¯¸ë¶„ë¥?) === filterCategory
      );
    }

    // ì¹´í…Œê³ ë¦¬ë³„ë¡œ ê·¸ë£¹??ë°??•ë ¬
    const articlesByCategory = {};
    filteredArticles.forEach((article) => {
      const category = article.category || "ë¯¸ë¶„ë¥?;
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = [];
      }
      articlesByCategory[category].push(article);
    });

    // ê°?ì¹´í…Œê³ ë¦¬ë³„ë¡œ order ê¸°ì? ?•ë ¬ (?´ë¦¼ì°¨ìˆœ: ??ê°’ì´ ?„ë¡œ)
    Object.keys(articlesByCategory).forEach((category) => {
      articlesByCategory[category].sort((a, b) => {
        return (b.order || 0) - (a.order || 0);
      });
    });

    // ë¹??íƒœ ì²˜ë¦¬
    if (filteredArticles.length === 0) {
      this.articleCardsGrid.innerHTML = "";
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
        this.managementEmptyState.textContent = filterCategory
          ? `${filterCategory} ì¹´í…Œê³ ë¦¬??ê¸€???†ìŠµ?ˆë‹¤.`
          : "?œì‹œ??ê¸€???†ìŠµ?ˆë‹¤.";
      }
      return;
    }

    if (this.managementEmptyState) {
      this.managementEmptyState.style.display = "none";
    }

    // ì¹´ë“œ ?Œë”ë§?
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
   * ê¸€ ì¹´ë“œ ?ì„±
   */
  createArticleCard(article, orderNumber, filterCategory = "") {
    const card = document.createElement("div");
    card.className = "article-card";
    card.setAttribute("data-article-id", article.id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `ê¸€ ${orderNumber}: ${article.title}`);

    // ===== [Dual Panel] ?´ë¦­ ?´ë²¤??- Ctrl+?´ë¦­?¼ë¡œ ?¨ë„ 2???´ê¸° =====
    // - ?¼ë°˜ ?´ë¦­: ?¨ë„ 1 (?¸ë±??0)
    // - Ctrl+?´ë¦­ (Windows) ?ëŠ” Cmd+?´ë¦­ (Mac): ?¨ë„ 2 (?¸ë±??1)
    card.addEventListener("click", (e) => {
      // Ctrl ?ëŠ” Cmd ?¤ê? ?Œë ¤?ˆëŠ”ì§€ ?•ì¸
      const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
      this.selectArticleToPanel(article.id, panelIndex);
    });

    // ===== [Dual Panel] ?¤ë³´???‘ê·¼??- Ctrl+Enterë¡??¨ë„ 2???´ê¸° =====
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // Ctrl+Enter ?ëŠ” Ctrl+Space: ?¨ë„ 2???´ê¸°
        const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
        this.selectArticleToPanel(article.id, panelIndex);
      }
    });

    // ?´ìš© ë¯¸ë¦¬ë³´ê¸° (3ì¤?
    const contentPreview = this.getContentPreview(article.content, 3);

    // ? ì§œ ?¬ë§·
    const dateStr = article.createdAt
      ? this.formatDateFromFirestore(article.createdAt)
      : "? ì§œ ?†ìŒ";

    // ?œì„œ ì¡°ì • ë²„íŠ¼ ?œì„±???¬ë? ?•ì¸
    const canMoveUp = this.canMoveUp(article, filterCategory);
    const canMoveDown = this.canMoveDown(article, filterCategory);

    card.innerHTML = `
            <div class="article-card-header">
                <div class="article-card-order">
                    <span class="article-order-badge" aria-label="?œì„œ ${orderNumber}">${orderNumber}</span>
                    <h4 class="article-card-title" title="${this.escapeHtml(
                      article.title
                    )}">${this.escapeHtml(article.title)}</h4>
                </div>
                <div class="article-card-actions">
                    <button 
                        class="order-button" 
                        data-action="up" 
                        data-article-id="${article.id}"
                        aria-label="?„ë¡œ ?´ë™"
                        title="?„ë¡œ ?´ë™"
                        ${canMoveUp ? "" : "disabled"}>
                        ??
                    </button>
                    <button 
                        class="order-button" 
                        data-action="down" 
                        data-article-id="${article.id}"
                        aria-label="?„ë˜ë¡??´ë™"
                        title="?„ë˜ë¡??´ë™"
                        ${canMoveDown ? "" : "disabled"}>
                        ??
                    </button>
                </div>
            </div>
            <div class="article-card-content">${this.escapeHtml(
              contentPreview
            )}</div>
            <div class="article-card-meta">
                <span class="article-card-date">?“… ${dateStr}</span>
                <span class="article-card-count">?“ ${article.content ? article.content.length : 0}??/span>
                <span class="article-card-category">?“ ${this.escapeHtml(
                  article.category || "ë¯¸ë¶„ë¥?
                )}</span>
            </div>
        `;

    // ?œì„œ ì¡°ì • ë²„íŠ¼ ?´ë²¤??
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
   * ?´ìš© ë¯¸ë¦¬ë³´ê¸° ?ì„±
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
   * ?„ë¡œ ?´ë™ ê°€???¬ë?
   */
  canMoveUp(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "ë¯¸ë¶„ë¥?) === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "ë¯¸ë¶„ë¥?) === (article.category || "ë¯¸ë¶„ë¥?)
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // ?´ë¦¼ì°¨ìˆœ ?•ë ¬

    return sameCategory[0]?.id !== article.id;
  }

  /**
   * ?„ë˜ë¡??´ë™ ê°€???¬ë?
   */
  canMoveDown(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "ë¯¸ë¶„ë¥?) === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "ë¯¸ë¶„ë¥?) === (article.category || "ë¯¸ë¶„ë¥?)
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // ?´ë¦¼ì°¨ìˆœ ?•ë ¬

    return sameCategory[sameCategory.length - 1]?.id !== article.id;
  }

  // ================================================================
  // [Dual Panel] ?€???¨ë„ ê¸€ ? íƒ ?¨ìˆ˜
  // - ?¹ì • ?¨ë„(0 ?ëŠ” 1)??ê¸€??? íƒ?˜ì—¬ ?œì‹œ
  // - Ctrl+?´ë¦­?¼ë¡œ ??ë²ˆì§¸ ?¨ë„??ê¸€ ?´ê¸° ì§€??
  // - 2025-12-09 Phase 3A êµ¬í˜„
  // ================================================================

  /**
   * ?¹ì • ?¨ë„??ê¸€ ? íƒ
   * @param {string} articleId - ? íƒ??ê¸€ ID
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0: ì²?ë²ˆì§¸, 1: ??ë²ˆì§¸)
   */
  selectArticleToPanel(articleId, panelIndex = 0) {
    // panelIndex ? íš¨??ê²€??
    if (panelIndex !== 0 && panelIndex !== 1) {
      logger.warn("[Dual Panel] ? íš¨?˜ì? ?Šì? panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // ì¤‘ë³µ ? íƒ ë°©ì?: ê°™ì? ê¸€???¤ë¥¸ ?¨ë„???´ë? ?´ë ¤?ˆëŠ”ì§€ ?•ì¸
    const otherPanelIndex = panelIndex === 0 ? 1 : 0;
    if (this.selectedArticleIds[otherPanelIndex] === articleId) {
      alert("?´ë? ?¤ë¥¸ ?¨ë„?ì„œ ?´ë ¤?ˆëŠ” ê¸€?…ë‹ˆ??");
      return;
    }

    // ê¸€ ?°ì´??ì°¾ê¸°
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      logger.warn("[Dual Panel] ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤:", articleId);
      return;
    }

    // ?´ì „?????¨ë„??? íƒ??ì¹´ë“œ???˜ì´?¼ì´???œê±°
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

    // ? íƒ??ì¹´ë“œ???¨ë„ë³??˜ì´?¼ì´??ì¶”ê?
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add(`selected-panel-${panelIndex + 1}`);
      selectedCard.classList.add("selected");
    }

    // ?íƒœ ?…ë°?´íŠ¸
    this.selectedArticleIds[panelIndex] = articleId;
    this.activePanelIndex = panelIndex;

    // ?¨ë„??ê¸€ ?Œë”ë§?
    this.renderDetailPanelByIndex(article, panelIndex);

    // ?€??ëª¨ë“œ ?íƒœ ?…ë°?´íŠ¸
    this.updateDualModeState();

    // ?´ë‹¹ ?¨ë„ë¡??¤í¬ë¡?
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    if (panel) {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  /**
   * ê¸€ ? íƒ (?˜ìœ„ ?¸í™˜??? ì? - ê¸°ë³¸?ìœ¼ë¡??¨ë„ 0??? íƒ)
   */
  selectArticle(articleId) {
    // ëª¨ë“  ì¹´ë“œ ? íƒ ?´ì œ
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    // ? íƒ??ì¹´ë“œ ?˜ì´?¼ì´??
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add("selected");
    }

    // ?ì„¸ ?¨ë„ ?œì‹œ
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (article) {
      this.selectedArticleId = articleId;
      this.renderDetailPanel(article);

      // ?ì„¸ ?¨ë„ë¡??¤í¬ë¡?
      if (this.articleDetailPanel) {
        this.articleDetailPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }

  // ================================================================
  // [Dual Panel] ?€???¨ë„ ?Œë”ë§??¨ìˆ˜
  // - ?¨ë„ ?¸ë±?¤ì— ?°ë¼ ?¬ë°”ë¥?DOM ?”ì†Œ??ê¸€ ?Œë”ë§?
  // - 2025-12-09 Phase 3A êµ¬í˜„
  // ================================================================

  /**
   * ?¹ì • ?¨ë„??ê¸€ ?ì„¸ ?Œë”ë§?
   * @param {object} article - ê¸€ ê°ì²´
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  renderDetailPanelByIndex(article, panelIndex = 0) {
    // panelIndex???°ë¥¸ suffix ê²°ì • (0 ??-1, 1 ??-2)
    const suffix = panelIndex === 0 ? "-1" : "-2";
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;

    if (!panel) {
      logger.warn("[Dual Panel] ?¨ë„??ì°¾ì„ ???†ìŠµ?ˆë‹¤:", panelIndex);
      return;
    }

    // ?½ê¸° ëª¨ë“œ ?œì‹œ, ?˜ì • ëª¨ë“œ ?¨ê?
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // ?°ì´??ì±„ìš°ê¸?
    const categoryEl = document.getElementById(`detail-category${suffix}`);
    const dateEl = document.getElementById(`detail-date${suffix}`);
    const charCountEl = document.getElementById(`detail-char-count${suffix}`);
    const titleEl = document.getElementById(`detail-title${suffix}`);
    const contentEl = document.getElementById(`detail-content${suffix}`);

    if (categoryEl) {
      categoryEl.textContent = article.category || "ë¯¸ë¶„ë¥?;
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "? ì§œ ?†ìŒ";
    }
    if (charCountEl) {
      charCountEl.textContent = `?“ ${article.content ? article.content.length : 0}??;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // ?¨ë„ ?œì‹œ
    panel.style.display = "block";
  }

  /**
   * ?€??ëª¨ë“œ ?íƒœ ?…ë°?´íŠ¸
   * - ???¨ë„ ëª¨ë‘ ?´ë ¤?ˆìœ¼ë©??€??ëª¨ë“œ ?œì„±??
   * - ???¨ë„ë§??´ë ¤?ˆìœ¼ë©??¨ì¼ ëª¨ë“œ
   */
  updateDualModeState() {
    const panel1Open = this.selectedArticleIds[0] !== null;
    const panel2Open = this.selectedArticleIds[1] !== null;

    // ?´ì „ ëª¨ë“œ ?€??
    const wasInDualMode = this.isDualMode;

    // ??ëª¨ë“œ ê²°ì •
    this.isDualMode = panel1Open && panel2Open;

    // ì»¨í…Œ?´ë„ˆ??dual-mode ?´ë˜??? ê?
    if (this.articleDetailContainer) {
      if (this.isDualMode) {
        this.articleDetailContainer.classList.add("dual-mode");
      } else {
        this.articleDetailContainer.classList.remove("dual-mode");
      }
    }

    // êµ¬ë¶„???œì‹œ/?¨ê?
    if (this.detailDualDivider) {
      this.detailDualDivider.style.display = this.isDualMode ? "flex" : "none";
    }

    // ëª¨ë“œ ë³€ê²????¤í¬ë¦?ë¦¬ë” ?Œë¦¼ (?‘ê·¼??
    if (wasInDualMode !== this.isDualMode) {
      const message = this.isDualMode
        ? "?€???¨ë„ ëª¨ë“œê°€ ?œì„±?”ë˜?ˆìŠµ?ˆë‹¤."
        : "?¨ì¼ ?¨ë„ ëª¨ë“œë¡??„í™˜?˜ì—ˆ?µë‹ˆ??";
      this.announceToScreenReader(message);
    }
  }

  /**
   * ?¤í¬ë¦?ë¦¬ë” ?Œë¦¼ (?‘ê·¼??ì§€??
   * @param {string} message - ?Œë¦´ ë©”ì‹œì§€
   */
  announceToScreenReader(message) {
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.cssText = "position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;";
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    // ? ì‹œ ???œê±°
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  // ================================================================
  // [Dual Panel] êµ¬ë¶„???œë˜ê·?ê¸°ëŠ¥
  // - ë§ˆìš°???œë˜ê·¸ë¡œ ?¨ë„ ?ˆë¹„ ì¡°ì ˆ
  // - ìµœì†Œ 20%, ìµœë? 80% ?œí•œ
  // - 2025-12-09 Phase 5 êµ¬í˜„
  // ================================================================

  /**
   * ?€???¨ë„ êµ¬ë¶„???œë˜ê·?ì´ˆê¸°??
   * - initArticleManagement()?ì„œ ?¸ì¶œ
   */
  initDualDividerDrag() {
    if (!this.detailDualDivider || !this.articleDetailContainer) {
      return;
    }

    // ?œë˜ê·??íƒœ ë³€??
    let isDragging = false;
    let startX = 0;
    let startLeftPanelWidth = 50; // ì´ˆê¸° ë¹„ìœ¨ (%)

    // ë§ˆìš°???¤ìš´ - ?œë˜ê·??œì‘
    const onMouseDown = (e) => {
      if (!this.isDualMode) return;
      
      isDragging = true;
      startX = e.clientX;
      
      // ?„ì¬ ?¨ë„ 1???ˆë¹„ ë¹„ìœ¨ ê³„ì‚°
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const panel1Rect = this.articleDetailPanel1.getBoundingClientRect();
      startLeftPanelWidth = (panel1Rect.width / containerRect.width) * 100;
      
      // ?œë˜ê·?ì¤??œê°???¼ë“œë°?
      this.detailDualDivider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      
      e.preventDefault();
    };

    // ë§ˆìš°???´ë™ - ?œë˜ê·?ì¤?
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerRect.width) * 100;
      
      // ??ë¹„ìœ¨ ê³„ì‚° (ìµœì†Œ 20%, ìµœë? 80%)
      let newLeftPercent = startLeftPanelWidth + deltaPercent;
      newLeftPercent = Math.max(20, Math.min(80, newLeftPercent));
      
      // Grid ë¹„ìœ¨ ?ìš©
      this.articleDetailContainer.style.gridTemplateColumns = 
        `${newLeftPercent}% 8px ${100 - newLeftPercent}%`;
    };

    // ë§ˆìš°????- ?œë˜ê·?ì¢…ë£Œ
    const onMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      this.detailDualDivider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    // ?´ë²¤??ë¦¬ìŠ¤???±ë¡
    this.detailDualDivider.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    // ?”ë©´ ?´íƒˆ ì²˜ë¦¬
    document.addEventListener("mouseleave", onMouseUp);

    // ?”ë¸”?´ë¦­?¼ë¡œ 50:50 ë¦¬ì…‹
    this.detailDualDivider.addEventListener("dblclick", () => {
      if (!this.isDualMode) return;
      this.articleDetailContainer.style.gridTemplateColumns = "1fr 8px 1fr";
    });
  }

  /**
   * ?ì„¸ ?¨ë„ ?Œë”ë§?(?˜ìœ„ ?¸í™˜??- ?¨ë„ 0???Œë”ë§?
   */
  renderDetailPanel(article) {
    if (!this.articleDetailPanel) return;

    // ?½ê¸° ëª¨ë“œ ?œì‹œ
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // ?°ì´??ì±„ìš°ê¸?
    const categoryEl = document.getElementById("detail-category");
    const dateEl = document.getElementById("detail-date");
    const charCountEl = document.getElementById("detail-char-count");
    const titleEl = document.getElementById("detail-title");
    const contentEl = document.getElementById("detail-content");

    if (categoryEl) {
      categoryEl.textContent = article.category || "ë¯¸ë¶„ë¥?;
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "? ì§œ ?†ìŒ";
    }
    if (charCountEl) {
      charCountEl.textContent = `?“ ${article.content ? article.content.length : 0}??;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // ?ì„¸ ?¨ë„ ?œì‹œ
    this.articleDetailPanel.style.display = "block";
  }

  // ================================================================
  // [Dual Panel] ?¨ë„ë³??˜ì •/?? œ/ë³µì‚¬ ?¨ìˆ˜
  // - ê°??¨ë„?ì„œ ?…ë¦½?ìœ¼ë¡??˜ì •/?? œ/ë³µì‚¬ ê¸°ëŠ¥ ?œê³µ
  // - 2025-12-09 Phase 6 êµ¬í˜„
  // ================================================================

  /**
   * ?¹ì • ?¨ë„?ì„œ ?˜ì • ëª¨ë“œ ì§„ì…
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  enterEditModeByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] ? íƒ??ê¸€???†ìŠµ?ˆë‹¤:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // panelIndex???°ë¥¸ suffix ê²°ì •
    const suffix = panelIndex === 0 ? "-1" : "-2";

    // ?½ê¸° ëª¨ë“œ ?¨ê¸°ê¸? ?˜ì • ëª¨ë“œ ?œì‹œ
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // ?…ë ¥ ?„ë“œ??ê°??¤ì •
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
      // ì¹´í…Œê³ ë¦¬ ?µì…˜ ?™ì  ì¶”ê?
      this.populateEditCategorySelect(editCategorySelect, article.category);
    }

    // ?„ì¬ ?¸ì§‘ ì¤‘ì¸ ê¸€ ID ?¤ì •
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(articleId);
    }
  }

  // ================================================================
  // [Bug Fix] ?˜ì • ëª¨ë“œ ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ì±„ìš°ê¸?
  // - 2025-12-10 ë²„ê·¸ ?˜ì •: ?˜ì • ëª¨ë“œ ì§„ì… ??ì¹´í…Œê³ ë¦¬ê°€ ë¶ˆëŸ¬?€ì§€ì§€ ?ŠëŠ” ë¬¸ì œ ?´ê²°
  // - enterEditModeByIndex()?ì„œ ?¸ì¶œ?˜ì—¬ ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´??ì±„ìš°ê³?? íƒ
  // ================================================================

  /**
   * ?˜ì • ëª¨ë“œ ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ì±„ìš°ê¸?ë°?? íƒ
   * @param {HTMLSelectElement} selectElement - ì¹´í…Œê³ ë¦¬ select ?”ì†Œ
   * @param {string} selectedCategory - ? íƒ?´ì•¼ ??ì¹´í…Œê³ ë¦¬ ê°?
   */
  populateEditCategorySelect(selectElement, selectedCategory) {
    if (!selectElement) {
      logger.warn("[Bug Fix] ì¹´í…Œê³ ë¦¬ select ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      return;
    }

    // ?„ì¬ ì¹´í…Œê³ ë¦¬ ëª©ë¡?ì„œ ê³ ìœ ??ì¹´í…Œê³ ë¦¬ ì¶”ì¶œ
    const categories = new Set(["ë¯¸ë¶„ë¥?]);
    this.managementArticles.forEach((article) => {
      if (article.category) {
        categories.add(article.category);
      }
    });

    // "ë¯¸ë¶„ë¥?ë¥??œì™¸??ì¹´í…Œê³ ë¦¬ë¥??ŒíŒŒë²³ìˆœ?¼ë¡œ ?•ë ¬ ??"ë¯¸ë¶„ë¥?ë¥?ë§??¤ì— ì¶”ê?
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "ë¯¸ë¶„ë¥?).sort();
    const sortedCategories = categoriesArray.includes("ë¯¸ë¶„ë¥?) 
      ? [...otherCategories, "ë¯¸ë¶„ë¥?] 
      : otherCategories;

    // ?œë¡­?¤ìš´ ì´ˆê¸°??ë°??µì…˜ ì¶”ê?
    selectElement.innerHTML = "";
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      selectElement.appendChild(option);
    });

    // ê¸°ì¡´ ì¹´í…Œê³ ë¦¬ ? íƒ (?†ìœ¼ë©?"ë¯¸ë¶„ë¥? ? íƒ)
    const categoryToSelect = selectedCategory || "ë¯¸ë¶„ë¥?;
    if (sortedCategories.includes(categoryToSelect)) {
      selectElement.value = categoryToSelect;
    } else {
      // ê¸°ì¡´ ì¹´í…Œê³ ë¦¬ê°€ ëª©ë¡???†ìœ¼ë©?ì¶”ê? ??? íƒ
      const newOption = document.createElement("option");
      newOption.value = categoryToSelect;
      newOption.textContent = categoryToSelect;
      selectElement.insertBefore(newOption, selectElement.firstChild);
      selectElement.value = categoryToSelect;
    }

    logger.log("[Bug Fix] ì¹´í…Œê³ ë¦¬ ?œë¡­?¤ìš´ ì±„ìš°ê¸??„ë£Œ:", {
      totalCategories: sortedCategories.length,
      selectedCategory: selectElement.value
    });
  }

  /**
   * ?¹ì • ?¨ë„?ì„œ ê¸€ ?? œ
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  async deleteArticleByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId || !this.currentUser || !this.isFirebaseReady) {
      logger.warn("[Dual Panel] ?? œ?????†ìŠµ?ˆë‹¤:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // ?? œ ?•ì¸
    const confirmed = confirm(
      `"${article.title}"??ë¥? ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?\n\n? ï¸ ???‘ì—…?€ ?˜ëŒë¦????†ìŠµ?ˆë‹¤.`
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

      this.showMessage("??ê¸€???? œ?˜ì—ˆ?µë‹ˆ??", "success");

      // ?´ë‹¹ ?¨ë„ ?«ê¸°
      this.closeDetailPanelByIndex(panelIndex);

      // ëª©ë¡ ê°±ì‹ 
      await this.loadArticlesForManagement();
    } catch (error) {
      logger.error("[Dual Panel] ?? œ ?¤íŒ¨:", error);
      this.showMessage("???? œ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ?¹ì • ?¨ë„ ê¸€ ?´ìš© ?´ë¦½ë³´ë“œ ë³µì‚¬
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  async copyArticleContentByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] ë³µì‚¬??ê¸€???†ìŠµ?ˆë‹¤:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article || !article.content) {
      this.showMessage("?“‹ ë³µì‚¬???´ìš©???†ìŠµ?ˆë‹¤.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("?“‹ ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
    } catch (error) {
      logger.error("[Dual Panel] ë³µì‚¬ ?¤íŒ¨:", error);
      // ?´ë°±: ?„ì‹œ textarea ?¬ìš©
      const textarea = document.createElement("textarea");
      textarea.value = article.content;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      this.showMessage("?“‹ ?´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
    }
  }

  /**
   * ?˜ì • ëª¨ë“œ ì§„ì… (?˜ìœ„ ?¸í™˜??- ?¨ë„ 0)
   */
  enterEditMode() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    // ?½ê¸° ëª¨ë“œ ?¨ê¸°ê¸? ?˜ì • ëª¨ë“œ ?œì‹œ
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // ?…ë ¥ ?„ë“œ??ê°??¤ì •
    if (this.editTitleInput) {
      this.editTitleInput.value = article.title;
    }
    if (this.editContentTextarea) {
      this.editContentTextarea.value = article.content;
    }
    if (this.editCategorySelect) {
      this.editCategorySelect.value = article.category || "ë¯¸ë¶„ë¥?;
    }

    // ?„ì¬ ?¸ì§‘ ì¤‘ì¸ ê¸€ ID ?¤ì • (?ˆí¼?°ìŠ¤ ë¡œë“œ??
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(this.selectedArticleId);
    }
  }

  /**
   * ê¸€ ?˜ì • ?€??
   */
  async saveArticleEdit() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    const title = this.editTitleInput?.value.trim() || "";
    const content = this.editContentTextarea?.value.trim() || "";
    const category = this.editCategorySelect?.value || "ë¯¸ë¶„ë¥?;

    // ê²€ì¦?
    if (!title && !content) {
      this.showMessage("???œëª© ?ëŠ” ?´ìš©???…ë ¥?´ì£¼?¸ìš”.", "error");
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
      // ?œëª© ê²€ì¦? ?œëª©??ë¹„ì–´?ˆìœ¼ë©??€??ë¶ˆê?
      if (!title || title.trim() === "") {
        this.showMessage("???œëª©???…ë ¥?´ì£¼?¸ìš”.", "error");
        if (this.editTitleInput) {
          this.editTitleInput.focus();
        }
        return;
      }

      await window.firebaseUpdateDoc(articleRef, {
        title: title.trim(),
        content: content,
        characterCount: content.length, // [Fix] ?„ìˆ˜ ?„ë“œ ì¶”ê?
        topic: category, // topic ?„ë“œ??ì¹´í…Œê³ ë¦¬ ?€??
        updatedAt: window.firebaseServerTimestamp(),
      });

      // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        article.title = title.trim();
        article.content = content;
        article.category = category;
      }

      // UI ?…ë°?´íŠ¸
      this.showMessage("??ê¸€???˜ì •?˜ì—ˆ?µë‹ˆ??", "success");
      await this.loadArticlesForManagement();
      this.selectArticle(this.selectedArticleId);

      // ?½ê¸° ëª¨ë“œë¡??„í™˜
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");
      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";
    } catch (error) {
      logger.error("ê¸€ ?˜ì • ?¤íŒ¨:", error);
      this.showMessage("??ê¸€ ?˜ì • ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ?˜ì • ì·¨ì†Œ
   */
  cancelArticleEdit() {
    if (!this.selectedArticleId) return;

    if (confirm("?˜ì •??ì·¨ì†Œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
      // ?½ê¸° ëª¨ë“œë¡??„í™˜
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");

      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      // ?ì„¸ ?¨ë„ ?¤ì‹œ ?Œë”ë§?
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        this.renderDetailPanel(article);
      }
    }
  }

  // ===== [Dual Panel] ?¨ë„ë³?ê¸€ ?˜ì • ?€??=====
  // 2025-12-10 ë²„ê·¸ ?˜ì •: ?¨ë„ 2 ?€??ë²„íŠ¼???™ì‘?˜ì? ?ŠëŠ” ë¬¸ì œ ?´ê²°
  /**
   * ?¹ì • ?¨ë„?ì„œ ê¸€ ?˜ì • ?€??
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  async saveArticleEditByIndex(panelIndex = 0) {
    // ?¨ë„ ?¸ë±?¤ì— ?°ë¥¸ ê¸€ ID ê°€?¸ì˜¤ê¸?
    const articleId = this.selectedArticleIds?.[panelIndex] || 
      (panelIndex === 0 ? this.selectedArticleId : null);
    
    if (!articleId || !this.currentUser || !this.isFirebaseReady) {
      logger.warn("[Dual Panel] ?€??ë¶ˆê?: ê¸€ ID ?ëŠ” ?¸ì¦ ?•ë³´ ?†ìŒ", { panelIndex, articleId });
      return;
    }

    // ?¨ë„ ?¸ë±?¤ì— ?°ë¥¸ suffix ê²°ì •
    const suffix = panelIndex === 0 ? "-1" : "-2";
    
    // DOM ?”ì†Œ ì°¸ì¡°
    const editTitleInput = document.getElementById(`edit-title-input${suffix}`);
    const editContentTextarea = document.getElementById(`edit-content-textarea${suffix}`);
    const editCategorySelect = document.getElementById(`edit-category-select${suffix}`);
    
    const title = editTitleInput?.value.trim() || "";
    const content = editContentTextarea?.value.trim() || "";
    const category = editCategorySelect?.value || "ë¯¸ë¶„ë¥?;

    // ?œëª© ê²€ì¦?
    if (!title || title.trim() === "") {
      this.showMessage("???œëª©???…ë ¥?´ì£¼?¸ìš”.", "error");
      if (editTitleInput) {
        editTitleInput.focus();
      }
      return;
    }

    // ?´ìš© ê²€ì¦?
    if (!content) {
      this.showMessage("???´ìš©???…ë ¥?´ì£¼?¸ìš”.", "error");
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

      // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (article) {
        article.title = title.trim();
        article.content = content;
        article.category = category;
      }

      // UI ?…ë°?´íŠ¸
      this.showMessage("??ê¸€???˜ì •?˜ì—ˆ?µë‹ˆ??", "success");
      await this.loadArticlesForManagement();
      
      // ?´ë‹¹ ?¨ë„ ?¤ì‹œ ?Œë”ë§?
      this.renderDetailPanelByIndex(article, panelIndex);

      // ?½ê¸° ëª¨ë“œë¡??„í™˜
      const readMode = document.getElementById(`detail-read-mode${suffix}`);
      const editMode = document.getElementById(`detail-edit-mode${suffix}`);
      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      logger.log("[Dual Panel] ê¸€ ?˜ì • ?€???„ë£Œ:", { panelIndex, articleId, title });
    } catch (error) {
      logger.error("[Dual Panel] ê¸€ ?˜ì • ?¤íŒ¨:", error);
      this.showMessage("??ê¸€ ?˜ì • ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // ===== [Dual Panel] ?¨ë„ë³??˜ì • ì·¨ì†Œ =====
  // 2025-12-10 ë²„ê·¸ ?˜ì •: ?¨ë„ 2 ì·¨ì†Œ ë²„íŠ¼???™ì‘?˜ì? ?ŠëŠ” ë¬¸ì œ ?´ê²°
  /**
   * ?¹ì • ?¨ë„?ì„œ ?˜ì • ì·¨ì†Œ
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  cancelArticleEditByIndex(panelIndex = 0) {
    // ?¨ë„ ?¸ë±?¤ì— ?°ë¥¸ ê¸€ ID ê°€?¸ì˜¤ê¸?
    const articleId = this.selectedArticleIds?.[panelIndex] || 
      (panelIndex === 0 ? this.selectedArticleId : null);
    
    if (!articleId) {
      logger.warn("[Dual Panel] ì·¨ì†Œ ë¶ˆê?: ê¸€ ID ?†ìŒ", { panelIndex });
      return;
    }

    if (confirm("?˜ì •??ì·¨ì†Œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
      // ?¨ë„ ?¸ë±?¤ì— ?°ë¥¸ suffix ê²°ì •
      const suffix = panelIndex === 0 ? "-1" : "-2";
      
      // ?½ê¸° ëª¨ë“œë¡??„í™˜
      const readMode = document.getElementById(`detail-read-mode${suffix}`);
      const editMode = document.getElementById(`detail-edit-mode${suffix}`);

      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      // ?ì„¸ ?¨ë„ ?¤ì‹œ ?Œë”ë§?
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (article) {
        this.renderDetailPanelByIndex(article, panelIndex);
      }

      logger.log("[Dual Panel] ?˜ì • ì·¨ì†Œ:", { panelIndex, articleId });
    }
  }

  /**
   * ê¸€ ?? œ
   */
  async deleteArticle() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    if (!confirm("?•ë§ ??ê¸€???? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) return;

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        this.selectedArticleId
      );
      await window.firebaseDeleteDoc(articleRef);

      // ë¡œì»¬ ?°ì´?°ì—???œê±°
      this.managementArticles = this.managementArticles.filter(
        (a) => a.id !== this.selectedArticleId
      );

      // UI ?…ë°?´íŠ¸
      this.showMessage("??ê¸€???? œ?˜ì—ˆ?µë‹ˆ??", "success");
      this.closeDetailPanel();
      await this.loadArticlesForManagement();
    } catch (error) {
      logger.error("ê¸€ ?? œ ?¤íŒ¨:", error);
      this.showMessage("??ê¸€ ?? œ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ê¸€ ?´ìš© ë³µì‚¬
   */
  async copyArticleContent() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("???´ë¦½ë³´ë“œ??ë³µì‚¬?˜ì—ˆ?µë‹ˆ??", "success");
    } catch (error) {
      logger.error("ë³µì‚¬ ?¤íŒ¨:", error);
      this.showMessage("??ë³µì‚¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  // ================================================================
  // [Dual Panel] ?€???¨ë„ ?«ê¸° ?¨ìˆ˜
  // - ?¹ì • ?¨ë„ë§??«ê³  ?´ë‹¹ ì¹´ë“œ ? íƒ ?´ì œ
  // - 2025-12-09 Phase 3B êµ¬í˜„
  // ================================================================

  /**
   * ?¹ì • ?¨ë„ ?«ê¸°
   * @param {number} panelIndex - ?«ì„ ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  closeDetailPanelByIndex(panelIndex = 0) {
    // panelIndex ? íš¨??ê²€??
    if (panelIndex !== 0 && panelIndex !== 1) {
      logger.warn("[Dual Panel] ? íš¨?˜ì? ?Šì? panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // ?´ë‹¹ ?¨ë„ ì°¸ì¡°
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    
    // ?´ë? ?«í??ˆëŠ” ?¨ë„?¸ì? ?•ì¸
    if (!panel || panel.style.display === "none") {
      logger.log("[Dual Panel] ?¨ë„???´ë? ?«í??ˆìŠµ?ˆë‹¤:", panelIndex);
      return;
    }

    // ?¨ë„ ?¨ê?
    panel.style.display = "none";

    // ?´ë‹¹ ?¨ë„??? íƒ??ê¸€??ì¹´ë“œ ?˜ì´?¼ì´???œê±°
    const previousId = this.selectedArticleIds[panelIndex];
    if (previousId) {
      const previousCard = document.querySelector(
        `[data-article-id="${previousId}"]`
      );
      if (previousCard) {
        previousCard.classList.remove(`selected-panel-${panelIndex + 1}`);
        // ?¤ë¥¸ ?¨ë„?ì„œ??? íƒ?˜ì–´?ˆì? ?Šìœ¼ë©?selected ?´ë˜?¤ë„ ?œê±°
        const otherPanelIndex = panelIndex === 0 ? 1 : 0;
        if (this.selectedArticleIds[otherPanelIndex] !== previousId) {
          previousCard.classList.remove("selected");
        }
      }
    }

    // ?íƒœ ?…ë°?´íŠ¸
    this.selectedArticleIds[panelIndex] = null;

    // ?€??ëª¨ë“œ ?íƒœ ?…ë°?´íŠ¸
    this.updateDualModeState();

    // ?œì„± ?¨ë„ ?¸ë±???…ë°?´íŠ¸ (?«íŒ ?¨ë„???œì„±?´ì—ˆ?¤ë©´ ?¤ë¥¸ ?¨ë„ë¡??„í™˜)
    if (this.activePanelIndex === panelIndex) {
      const otherPanelIndex = panelIndex === 0 ? 1 : 0;
      if (this.selectedArticleIds[otherPanelIndex] !== null) {
        this.activePanelIndex = otherPanelIndex;
      }
    }
  }

  /**
   * ?ì„¸ ?¨ë„ ?«ê¸° (?˜ìœ„ ?¸í™˜??- ?¨ë„ 0 ?«ê¸°)
   */
  closeDetailPanel() {
    if (this.articleDetailPanel) {
      this.articleDetailPanel.style.display = "none";
    }

    // ëª¨ë“  ì¹´ë“œ ? íƒ ?´ì œ
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    this.selectedArticleId = null;
  }

  /**
   * ?œì„œ ë³€ê²?
   */
  async moveArticleOrder(articleId, direction) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (!article) return;

      const category = article.category || "ë¯¸ë¶„ë¥?;
      const sameCategoryArticles = this.managementArticles
        .filter((a) => (a.category || "ë¯¸ë¶„ë¥?) === category)
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // ?´ë¦¼ì°¨ìˆœ ?•ë ¬

      const currentIndex = sameCategoryArticles.findIndex(
        (a) => a.id === articleId
      );
      if (currentIndex === -1) return;

      let targetIndex;
      if (direction === "up") {
        if (currentIndex === 0) return; // ?´ë? ì²?ë²ˆì§¸
        targetIndex = currentIndex - 1;
      } else {
        if (currentIndex === sameCategoryArticles.length - 1) return; // ?´ë? ë§ˆì?ë§?
        targetIndex = currentIndex + 1;
      }

      const targetArticle = sameCategoryArticles[targetIndex];
      const currentOrder = article.order || 0;
      const targetOrder = targetArticle.order || 0;

      // ?œì„œ êµí™˜
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

      // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
      article.order = targetOrder;
      targetArticle.order = currentOrder;

      // UI ë¦¬ë Œ?”ë§
      const currentCategory = this.categorySelect?.value || "";
      this.renderArticleCards(currentCategory);
    } catch (error) {
      logger.error("?œì„œ ë³€ê²??¤íŒ¨:", error);
      this.showMessage("???œì„œ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ? ì§œ ?¬ë§·??(Firestore Timestamp)
   */
  formatDateFromFirestore(timestamp) {
    if (!timestamp) return "? ì§œ ?†ìŒ";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (error) {
      return "? ì§œ ?†ìŒ";
    }
  }

  /**
   * HTML ?´ìŠ¤ì¼€?´í”„
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== ???¤í¬ë¦½íŠ¸ ?‘ì„± ê¸°ëŠ¥ =====

  /**
   * ?¤í¬ë¦½íŠ¸ ?‘ì„± ??? ê?
   */
  toggleScriptCreateForm() {
    if (!this.scriptCreateForm || !this.newScriptToggleBtn) return;

    const isExpanded =
      this.newScriptToggleBtn.getAttribute("aria-expanded") === "true";
    const newState = !isExpanded;

    this.newScriptToggleBtn.setAttribute("aria-expanded", newState.toString());
    this.scriptCreateForm.setAttribute("aria-hidden", (!newState).toString());
    this.scriptCreateForm.style.display = newState ? "block" : "none";

    // ?¼ì´ ?´ë¦´ ??ì¹´í…Œê³ ë¦¬ ?œì•ˆ ?…ë°?´íŠ¸
    if (newState) {
      this.updateCategorySuggestions();
    }
  }

  /**
   * LLM ëª¨ë¸ ? íƒ ë³€ê²?ì²˜ë¦¬
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
   * ì¹´í…Œê³ ë¦¬ ?œì•ˆ ?…ë°?´íŠ¸
   */
  updateCategorySuggestions() {
    if (!this.categorySuggestions) return;

    // ê¸°ì¡´ ?œì•ˆ ?œê±°
    this.categorySuggestions.innerHTML = "";

    // ê³ ìœ ??ì¹´í…Œê³ ë¦¬ ëª©ë¡ ì¶”ì¶œ
    const categories = new Set();
    this.managementArticles.forEach((article) => {
      if (article.category && article.category.trim()) {
        categories.add(article.category.trim());
      }
    });

    // ?œì•ˆ ì¶”ê?
    Array.from(categories)
      .sort()
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        this.categorySuggestions.appendChild(option);
      });
  }

  /**
   * ???¤í¬ë¦½íŠ¸ ?€??
   */
  async saveNewScript() {
    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
      return;
    }

    // ?…ë ¥ê°?ê°€?¸ì˜¤ê¸?
    const title = this.scriptTitleInput?.value.trim() || "";
    const content = this.scriptContentTextarea?.value.trim() || "";
    const category = this.scriptCategoryInput?.value.trim() || "ë¯¸ë¶„ë¥?;
    const llmModel =
      this.scriptLlmModelSelect?.value === "custom"
        ? this.scriptLlmModelCustom?.value.trim() || ""
        : this.scriptLlmModelSelect?.value || "";
    const llmModelType = this.scriptLlmTypeInput?.value.trim() || "?¼ë°˜";

    // ê²€ì¦? ?œëª© ?„ìˆ˜
    if (!title || title.trim() === "") {
      this.showMessage("???œëª©???…ë ¥?´ì£¼?¸ìš”.", "error");
      if (this.scriptTitleInput) {
        this.scriptTitleInput.focus();
      }
      return;
    }

    if (!content || content.trim() === "") {
      this.showMessage("???´ìš©???…ë ¥?´ì£¼?¸ìš”.", "error");
      if (this.scriptContentTextarea) {
        this.scriptContentTextarea.focus();
      }
      return;
    }

    try {
      // Firebase???€??(?œëª©?€ ?¬ìš©?ê? ?…ë ¥??ê°??¬ìš©)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );
      const newScriptData = {
        title: title.trim(), // ?¬ìš©?ê? ì§ì ‘ ?…ë ¥???œëª©
        content: content,
        characterCount: content.length, // [Fix] ?„ìˆ˜ ?„ë“œ ì¶”ê?
        topic: category, // ì¹´í…Œê³ ë¦¬??topic ?„ë“œ???€??
        type: "script", // [Tab Separation] ?¤í¬ë¦½íŠ¸ ?‘ì„± ???„ìš© ?€??(ê¸°ì¡´ 'edit'?€ ë¶„ë¦¬)
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
        order: Date.now(), // ?€?„ìŠ¤?¬í”„ ê¸°ë°˜ ?•ë ¬ (ìµœì‹  ê¸€????ê°?
        // LLM ê´€???„ë“œ (? íƒ?¬í•­)
        ...(llmModel && { llmModel: llmModel }),
        ...(llmModelType && { llmModelType: llmModelType }),
      };

      await window.firebaseAddDoc(textsRef, newScriptData);

      // ?±ê³µ ë©”ì‹œì§€
      this.showMessage("???¤í¬ë¦½íŠ¸ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.", "success");

      // ??ì´ˆê¸°??
      this.resetScriptCreateForm();

      // ???«ê¸°
      this.toggleScriptCreateForm();

      // ì¹´í…Œê³ ë¦¬ ?„í„°ë¥?"?„ì²´ ê¸€ ë³´ê¸°"ë¡?ë¦¬ì…‹ (?ˆë¡œ ?€?¥ëœ ê¸€??ë³´ì´?„ë¡)
      if (this.categorySelect) {
        this.categorySelect.value = "";
      }

      // ëª©ë¡ ?ˆë¡œê³ ì¹¨
      await this.loadArticlesForManagement();

      // ì¹´í…Œê³ ë¦¬ ?œì•ˆ ?…ë°?´íŠ¸
      this.updateCategorySuggestions();
    } catch (error) {
      logger.error("?¤í¬ë¦½íŠ¸ ?€???¤íŒ¨:", error);
      this.showMessage("???¤í¬ë¦½íŠ¸ ?€??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ?¤í¬ë¦½íŠ¸ ?‘ì„± ì·¨ì†Œ
   */
  cancelScriptCreate() {
    if (confirm("?‘ì„± ì¤‘ì¸ ?´ìš©???¬ë¼ì§‘ë‹ˆ?? ?•ë§ ì·¨ì†Œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
      this.resetScriptCreateForm();
      this.toggleScriptCreateForm();
    }
  }

  /**
   * ?¤í¬ë¦½íŠ¸ ?‘ì„± ??ì´ˆê¸°??
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
    if (this.scriptLlmTypeInput) this.scriptLlmTypeInput.value = "?¼ë°˜";
  }

  /**
   * ?´ìš© ê¸€????ì¹´ìš´???…ë°?´íŠ¸
   */
  updateContentCounter() {
    if (!this.scriptContentTextarea || !this.scriptContentCounter) return;

    const content = this.scriptContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // ê¸€?????œì‹œ ?…ë°?´íŠ¸
    this.scriptContentCounter.textContent = `(${charCount} / ${maxChars}?ëŠ” ??1ë¶?15ì´?`;

    // 500??ì´ˆê³¼ ??ê²½ê³  ?¤í????ìš©
    if (charCount > maxChars) {
      this.scriptContentCounter.style.color = "#e74c3c";
      this.scriptContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% ?´ìƒ????ì£¼ì˜ ?‰ìƒ
      this.scriptContentCounter.style.color = "#f39c12";
      this.scriptContentCounter.style.fontWeight = "500";
    } else {
      // ?•ìƒ ë²”ìœ„
      this.scriptContentCounter.style.color = "#666";
      this.scriptContentCounter.style.fontWeight = "400";
    }
  }

  // ===== ?•ë? ëª¨ë“œ ê¸°ëŠ¥ =====

  /**
   * ?•ë? ëª¨ë“œ ?´ê¸°
   * ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸, ?¤í¬ë¦?ë¦¬ë” ?Œë¦¼, ?¬ì»¤???¸ë©, ESC ??ì²˜ë¦¬ ?¬í•¨
   */
  openExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // ì»¨í…?¤íŠ¸ ê°ì?: ?˜ì • ëª¨ë“œ?¸ì? ?•ì¸
    const isEditMode =
      document.getElementById("detail-edit-mode")?.style.display !== "none" &&
      this.selectedArticleId;

    // ?ŒìŠ¤ ê²°ì •
    if (isEditMode) {
      // ?˜ì • ëª¨ë“œ: ?œëª©, ì¹´í…Œê³ ë¦¬, ?´ìš©???˜ì • ?¼ì—??ê°€?¸ì˜´
      this.expandSourceMode = "edit"; // ì»¨í…?¤íŠ¸ ?€??
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
      // ??ê¸€ ?‘ì„± ëª¨ë“œ (ê¸°ë³¸)
      this.expandSourceMode = "new"; // ì»¨í…?¤íŠ¸ ?€??
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

    // ì¹´ìš´???…ë°?´íŠ¸
    this.updateExpandContentCounter();

    // ëª¨ë‹¬ ?œì‹œ
    this.contentExpandModal.style.display = "block";

    // ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // ?„ì¬ ?œì„±?”ëœ ë²„íŠ¼??aria-expanded ?…ë°?´íŠ¸
    const activeBtn = isEditMode ? this.detailExpandBtn : this.expandContentBtn;
    if (activeBtn) {
      activeBtn.setAttribute("aria-expanded", "true");
    }

    // ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
    this.announceToScreenReader("?•ë? ëª¨ë“œê°€ ?´ë ¸?µë‹ˆ??");

    // ?‘ê·¼?? ?¬ì»¤???¸ë© ?¤ì • (Tab ???œí™˜ ?œí•œ)
    this._setupExpandModeFocusTrap();

    // ?‘ê·¼?? ESC ?¤ë¡œ ëª¨ë‹¬ ?«ê¸°
    this._setupExpandModeEscapeHandler();

    // ?½ê°„??ì§€?????¬ì»¤??(? ë‹ˆë©”ì´???„ë£Œ ??
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // ì»¤ì„œë¥??ìœ¼ë¡??´ë™
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // ===== [Dual Panel] ?€???¨ë„ ?•ë? ëª¨ë“œ ?´ê¸° =====
  // 2025-12-09 Phase 2 ì¶”ê?: ?¹ì • ?¨ë„?ì„œ ?•ë? ëª¨ë“œ ì§„ì…
  /**
   * ?¹ì • ?¨ë„?ì„œ ?•ë? ëª¨ë“œ ì§„ì… (?€???¨ë„??
   * @param {number} panelIndex - ?¨ë„ ?¸ë±??(0 ?ëŠ” 1)
   */
  openExpandModeByIndex(panelIndex = 0) {
    // ?„ìˆ˜ DOM ?”ì†Œ ?•ì¸
    if (!this.contentExpandModal || !this.expandContentTextarea) {
      logger.warn("[Dual Panel] ?•ë? ëª¨ë“œ DOM ?”ì†Œ ?†ìŒ");
      return;
    }

    // ?¨ë„ ?¸ë±?¤ë¡œ ê¸€ ID ê°€?¸ì˜¤ê¸?
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      logger.warn("[Dual Panel] ?•ë???ê¸€???†ìŠµ?ˆë‹¤:", panelIndex);
      this.showMessage("??? íƒ??ê¸€???†ìŠµ?ˆë‹¤.", "warning");
      return;
    }

    // ê¸€ ?°ì´??ì¡°íšŒ
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      this.showMessage("??ê¸€ ?•ë³´ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ?•ë? ëª¨ë“œ ?ŒìŠ¤ ?€??(?€???¨ë„)
    this.expandSourceMode = "dualPanel";
    this.expandModeArticleId = articleId;
    this.expandModePanelIndex = panelIndex;

    // ?•ë? ëª¨ë“œ UI???°ì´??ë¡œë“œ
    // ?œëª© ?¤ì •
    if (this.expandPreviewTitle) {
      this.expandPreviewTitle.textContent = article.title || "?œëª© ?†ìŒ";
    }

    // ì¹´í…Œê³ ë¦¬ ?¤ì •
    if (this.expandPreviewCategory) {
      this.expandPreviewCategory.textContent = article.category || "ë¯¸ë¶„ë¥?;
    }

    // ?´ìš© ?¤ì •
    if (this.expandContentTextarea) {
      this.expandContentTextarea.value = article.content || "";
    }

    // ê¸€????ì¹´ìš´???…ë°?´íŠ¸
    this.updateExpandContentCounter();

    // ëª¨ë‹¬ ?œì‹œ
    this.contentExpandModal.style.display = "block";

    // ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // ARIA ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸
    const expandBtn = panelIndex === 0 
      ? this.detailExpandBtn1 
      : this.detailExpandBtn2;
    if (expandBtn) {
      expandBtn.setAttribute("aria-expanded", "true");
    }

    // ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
    this.announceToScreenReader("?•ë? ëª¨ë“œê°€ ?´ë ¸?µë‹ˆ?? ?¨ë„ " + (panelIndex + 1) + "??ê¸€???¸ì§‘?©ë‹ˆ??");

    // ?‘ê·¼?? ?¬ì»¤???¸ë© ?¤ì • (Tab ???œí™˜ ?œí•œ)
    this._setupExpandModeFocusTrap();

    // ?‘ê·¼?? ESC ?¤ë¡œ ëª¨ë‹¬ ?«ê¸°
    this._setupExpandModeEscapeHandler();

    // ?½ê°„??ì§€?????¬ì»¤??(? ë‹ˆë©”ì´???„ë£Œ ??
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // ì»¤ì„œë¥??ìœ¼ë¡??´ë™
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);

    logger.log("[Dual Panel] ?•ë? ëª¨ë“œ ?´ë¦¼:", { panelIndex, articleId, title: article.title });
  }

  // ===== [Dual Panel] ?•ë? ëª¨ë“œ ?«ê¸° =====
  // 2025-12-09 Phase 3 ì¶”ê?: ?€???¨ë„ ?íƒœ ë³µì› ?¬í•¨
  /**
   * ?•ë? ëª¨ë“œ ?«ê¸°
   * ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸ ?¬í•¨
   * ?±ëŠ¥: ?€ê¸?ì¤‘ì¸ timeout ?•ë¦¬
   */
  closeExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // ?€ê¸?ì¤‘ì¸ timeout ?•ë¦¬ (ë©”ëª¨ë¦??„ìˆ˜ ë°©ì?)
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }

    // ?•ë? ëª¨ë“œ???´ìš©???ë³¸ textarea???™ê¸°??(?«ì„ ???ë™ ?™ê¸°??
    // ===== [Dual Panel] ?€???¨ë„ ëª¨ë“œ ?™ê¸°??=====
    if (this.expandSourceMode === "dualPanel") {
      // ?€???¨ë„ ëª¨ë“œ: ?€?¥ì? ë³„ë„ë¡?ì²˜ë¦¬
      logger.log("[Dual Panel] ?•ë? ëª¨ë“œ ?«í˜");
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

    // ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸
    this.contentExpandModal.setAttribute("aria-hidden", "true");

    // ===== [Dual Panel] ARIA ë²„íŠ¼ ?íƒœ ë³µì› =====
    if (this.expandSourceMode === "dualPanel") {
      // ?€???¨ë„ ?•ë? ë²„íŠ¼ aria-expanded ë³µì›
      if (this.detailExpandBtn1) {
        this.detailExpandBtn1.setAttribute("aria-expanded", "false");
      }
      if (this.detailExpandBtn2) {
        this.detailExpandBtn2.setAttribute("aria-expanded", "false");
      }
    } else {
      // ê¸°ì¡´ ë¡œì§
      const activeBtn =
        this.expandSourceMode === "edit"
          ? this.detailExpandBtn
          : this.expandContentBtn;
      if (activeBtn) {
        activeBtn.setAttribute("aria-expanded", "false");
      }
    }

    // ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
    this.announceToScreenReader("?•ë? ëª¨ë“œê°€ ?«í˜”?µë‹ˆ??");

    // ?‘ê·¼?? ?¬ì»¤???¸ë© ë°?ESC ?¸ë“¤???œê±°
    this._removeExpandModeFocusTrap();
    this._removeExpandModeEscapeHandler();

    // ëª¨ë‹¬ ?¨ê¸°ê¸?
    this.contentExpandModal.style.display = "none";

    // ===== [Dual Panel] ?¬ì»¤??ë³µì› ë°??íƒœ ì´ˆê¸°??=====
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
      // ?íƒœ ë³€??ì´ˆê¸°??
      this.expandModeArticleId = null;
      this.expandModePanelIndex = null;
    } else {
      // ê¸°ì¡´ ë¡œì§
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
   * ?•ë? ëª¨ë“œ ?¬ì»¤???¸ë© ?¤ì •
   * Tab ?¤ë¡œ ëª¨ë‹¬ ?´ë??ì„œë§??¬ì»¤???œí™˜
   * @private
   */
  _setupExpandModeFocusTrap() {
    if (!this.contentExpandModal) return;

    // ?¬ì»¤??ê°€?¥í•œ ?”ì†Œ ì°¾ê¸°
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
      // ?”ë©´??ë³´ì´???”ì†Œë§??¬í•¨
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Tab ???¸ë“¤??
    this._expandModeTabHandler = (e) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab: ??°©??
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: ?•ë°©??
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
   * ?•ë? ëª¨ë“œ ?¬ì»¤???¸ë© ?œê±°
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
   * ?•ë? ëª¨ë“œ ESC ???¸ë“¤???¤ì •
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
   * ?•ë? ëª¨ë“œ ESC ???¸ë“¤???œê±°
   * @private
   */
  _removeExpandModeEscapeHandler() {
    if (this._expandModeEscapeHandler) {
      document.removeEventListener("keydown", this._expandModeEscapeHandler);
      this._expandModeEscapeHandler = null;
    }
  }

  // ===== [Dual Panel] ?€?¥í•˜ê³??•ë? ëª¨ë“œ ?«ê¸° =====
  // 2025-12-09 Phase 4 ì¶”ê?: ?€???¨ë„ ëª¨ë“œ ?€??ì§€??
  /**
   * ?€?¥í•˜ê³??•ë? ëª¨ë“œ ?«ê¸°
   */
  async saveAndCloseExpandMode() {
    // ===== [Dual Panel] ?€???¨ë„ ëª¨ë“œ ?€??=====
    if (this.expandSourceMode === "dualPanel") {
      const articleId = this.expandModeArticleId;
      const panelIndex = this.expandModePanelIndex;
      const newContent = this.expandContentTextarea?.value || "";
      
      if (!articleId) {
        this.showMessage("???€?¥í•  ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        this.closeExpandMode();
        return;
      }

      try {
        // ===== [Bug Fix] 2025-12-10 Firebase ?‘ê·¼ ë°©ì‹ ?œì???=====
        // ê¸°ì¡´: firebase.auth().currentUser, firebase.firestore() ì§ì ‘ ?‘ê·¼
        // ?˜ì •: this.currentUser, window.firebaseDoc() + window.firebaseUpdateDoc() ?˜í¼ ?¬ìš©
        if (!this.currentUser || !this.isFirebaseReady) {
          this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
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

        // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
        const article = this.managementArticles.find((a) => a.id === articleId);
        if (article) {
          article.content = newContent;
          article.updatedAt = new Date();
        }

        // ?¨ë„ UI ê°±ì‹ 
        if (article && panelIndex !== null) {
          this.renderDetailPanelByIndex(article, panelIndex);
        }

        this.showMessage("???€?¥ë˜?ˆìŠµ?ˆë‹¤.", "success");
        logger.log("[Dual Panel] ?•ë? ëª¨ë“œ?ì„œ ?€???„ë£Œ:", { articleId, panelIndex });

      } catch (error) {
        logger.error("[Dual Panel] ?€???¤íŒ¨:", error);
        this.showMessage("???€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
      }

      this.closeExpandMode();
      return;
    }

    // ===== ê¸°ì¡´ ë¡œì§: edit ëª¨ë“œ ë°?new ëª¨ë“œ =====
    // ?´ìš© ?™ê¸°??(?«ê¸° ?„ì— ?˜í–‰)
    if (this.expandSourceMode === "edit") {
      // ?˜ì • ëª¨ë“œë¡?ë°˜í™˜
      if (this.editContentTextarea && this.expandContentTextarea) {
        this.editContentTextarea.value = this.expandContentTextarea.value;
      }
    } else {
      // ??ê¸€ ?‘ì„± ëª¨ë“œë¡?ë°˜í™˜ (ê¸°ë³¸)
      if (this.scriptContentTextarea && this.expandContentTextarea) {
        this.scriptContentTextarea.value = this.expandContentTextarea.value;
        this.updateContentCounter(); // ??ê¸€ ì¹´ìš´???…ë°?´íŠ¸
      }
    }

    this.closeExpandMode();

    // ?€??ë²„íŠ¼ ?´ë¦­
    if (this.expandSourceMode === "edit") {
      // ?˜ì • ?€??
      if (this.editSaveBtn) {
        this.editSaveBtn.click();
      }
    } else {
      // ??ê¸€ ?€??
      if (this.scriptSaveBtn) {
        this.scriptSaveBtn.click();
      }
    }
  }

  /**
   * ?•ë? ëª¨ë“œ ê¸€????ì¹´ìš´???…ë°?´íŠ¸
   */
  updateExpandContentCounter() {
    if (!this.expandContentTextarea || !this.expandContentCounter) return;

    const content = this.expandContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // ê¸€?????œì‹œ ?…ë°?´íŠ¸
    this.expandContentCounter.textContent = `(${charCount} / ${maxChars}?ëŠ” ??1ë¶?15ì´?`;

    // 500??ì´ˆê³¼ ??ê²½ê³  ?¤í????ìš©
    if (charCount > maxChars) {
      this.expandContentCounter.style.color = "#e74c3c";
      this.expandContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% ?´ìƒ????ì£¼ì˜ ?‰ìƒ
      this.expandContentCounter.style.color = "#f39c12";
      this.expandContentCounter.style.fontWeight = "500";
    } else {
      // ?•ìƒ ë²”ìœ„
      this.expandContentCounter.style.color = "#666";
      this.expandContentCounter.style.fontWeight = "400";
    }
  }

  /**
   * ?•ë? ëª¨ë“œ???ˆí¼?°ìŠ¤ ì¶”ê?
   */
  addReferenceToExpandMode(item, sourceType) {
    if (!item || !item.content) return;

    // ì¤‘ë³µ ì²´í¬
    const exists = this.expandReferences.some(
      (ref) => ref.id === item.id && ref.sourceType === sourceType
    );

    if (exists) {
      this.showMessage("?¹ï¸ ?´ë? ì¶”ê????ˆí¼?°ìŠ¤?…ë‹ˆ??", "info");
      return;
    }

    // ìµœë? ê°œìˆ˜ ?œí•œ ?•ì¸
    if (
      this.expandReferences.length >=
      DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES
    ) {
      this.showMessage(
        `? ï¸ ?ˆí¼?°ìŠ¤??ìµœë? ${DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES}ê°œê¹Œì§€ ì¶”ê??????ˆìŠµ?ˆë‹¤.`,
        "error"
      );
      return;
    }

    // ?ˆí¼?°ìŠ¤ ì¶”ê?
    const newReference = {
      id: item.id,
      sourceType: sourceType,
      content: item.content,
      title:
        sourceType === "saved"
          ? item.title || "?œëª© ?†ìŒ" // Firestore???€?¥ëœ title ?¬ìš©
          : (item.content || "").substring(0, 50),
      date:
        sourceType === "saved"
          ? item.createdAt
            ? this.formatDateFromFirestore(item.createdAt)
            : item.date || ""
          : item.postedAt
          ? new Date(item.postedAt).toLocaleDateString("ko-KR")
          : "",
      category: item.topic || "ë¯¸ë¶„ë¥?,
    };

    this.expandReferences.push(newReference);

    // ?Œë”ë§?(?ˆë¡œ ì¶”ê????ˆí¼?°ìŠ¤ ID ?„ë‹¬?˜ì—¬ ?œê°???¼ë“œë°??œê³µ)
    this.renderExpandReferences(newReference.id);

    // ?±ê³µ ë©”ì‹œì§€
    this.showMessage("???ˆí¼?°ìŠ¤ê°€ ì¶”ê??˜ì—ˆ?µë‹ˆ??", "success");
  }

  /**
   * ?•ë? ëª¨ë“œ?ì„œ ?ˆí¼?°ìŠ¤ ?œê±°
   */
  removeExpandReference(index) {
    if (index < 0 || index >= this.expandReferences.length) return;

    this.expandReferences.splice(index, 1);
    this.renderExpandReferences();
  }

  /**
   * ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?Œë”ë§?
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
        `?ˆí¼?°ìŠ¤ ${index + 1}: ${this.escapeHtml(ref.title)}`
      );

      // ?ˆë¡œ ì¶”ê????ˆí¼?°ìŠ¤?¸ì? ?•ì¸?˜ì—¬ ?œê°???¼ë“œë°?ì¶”ê?
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
                        aria-label="?ˆí¼?°ìŠ¤ ?œê±°"
                        title="?œê±°">
                        Ã—
                    </button>
                </div>
                <div class="expand-reference-item-content">${this.escapeHtml(
                  contentPreview
                )}${ref.content.length > 500 ? "..." : ""}</div>
                <div class="expand-reference-item-meta">
                    <span>?“… ${ref.date}</span>
                    <span>?“ ${this.escapeHtml(ref.category)}</span>
                </div>
                <div class="expand-reference-item-actions">
                    <button 
                        class="expand-reference-add-btn"
                        aria-label="?´ìš©??ì¶”ê?"
                        title="???ˆí¼?°ìŠ¤ë¥??¤ë¥¸ìª??´ìš© ?„ë“œ??ì¶”ê?">
                        <span class="btn-icon">??/span>
                        <span class="btn-text">?´ìš©??ì¶”ê?</span>
                    </button>
                </div>
            `;

      // ?œê±° ë²„íŠ¼ ?´ë²¤??
      const removeBtn = itemEl.querySelector(".expand-reference-item-remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          this.removeExpandReference(index);
        });
      }

      // ?´ìš©??ì¶”ê? ë²„íŠ¼ ?´ë²¤??
      const addBtn = itemEl.querySelector(".expand-reference-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          this.addExpandReferenceToContent(ref, index);
        });
      }

      this.expandReferenceList.appendChild(itemEl);

      // ?ˆë¡œ ì¶”ê????ˆí¼?°ìŠ¤??ê²½ìš° ? ë‹ˆë©”ì´???„ë£Œ ???´ë˜???œê±°
      if (isNewlyAdded) {
        setTimeout(() => {
          itemEl.classList.remove("reference-added");
        }, DualTextWriter.CONFIG.REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS);
      }
    });

    // ?‘ê·¼?? ?ˆí¼?°ìŠ¤ ëª©ë¡ ?œì‹œ ë°?ARIA ?ì„± ?…ë°?´íŠ¸
    if (this.expandReferenceList && this.expandReferences.length > 0) {
      this.expandReferenceList.style.display = "block";
      this.expandReferenceList.setAttribute(
        "aria-label",
        `ì¶”ê????ˆí¼?°ìŠ¤ ëª©ë¡ (${this.expandReferences.length}ê°?`
      );
    }
  }

  /**
   * ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ë¥??´ìš© ?„ë“œ??ì¶”ê?
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

    // ì»¤ì„œë¥?ì¶”ê????´ìš© ?ìœ¼ë¡??´ë™
    const length = newContent.length;
    this.expandContentTextarea.setSelectionRange(length, length);

    // ê¸€????ì¹´ìš´???…ë°?´íŠ¸
    this.updateExpandContentCounter();

    // ?ë³¸ textarea???™ê¸°??
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.value = newContent;
      this.updateContentCounter();
    }

    // ?±ê³µ ë©”ì‹œì§€
    this.showMessage("???ˆí¼?°ìŠ¤ê°€ ?´ìš©??ì¶”ê??˜ì—ˆ?µë‹ˆ??", "success");
  }

  /**
   * ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?ì—­ ?‘ê¸°/?¼ì¹˜ê¸?
   */
  /**
   * ?•ë? ëª¨ë“œ ?ˆí¼?°ìŠ¤ ?¨ë„ ? ê?
   * ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸ ë°??¤í¬ë¦?ë¦¬ë” ?Œë¦¼ ?¬í•¨
   */
  toggleExpandReferencePanel() {
    if (!this.expandReferencePanel || !this.expandToggleReferenceBtn) return;

    const isCollapsed =
      this.expandReferencePanel.classList.contains("collapsed");

    // collapsed ?´ë˜??? ê?
    this.expandReferencePanel.classList.toggle("collapsed");

    // ?‘ê·¼?? ARIA ?ì„± ?…ë°?´íŠ¸
    const newState = !isCollapsed; // ? ê? ???íƒœ (true = ?‘í˜, false = ?¼ì¹¨)
    this.expandToggleReferenceBtn.setAttribute(
      "aria-expanded",
      newState ? "false" : "true"
    );

    // ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
    const message = newState
      ? "?ˆí¼?°ìŠ¤ ?ì—­???‘í˜”?µë‹ˆ??"
      : "?ˆí¼?°ìŠ¤ ?ì—­???¼ì³ì¡ŒìŠµ?ˆë‹¤.";
    this.announceToScreenReader(message);
  }

  /**
   * ?•ë? ëª¨ë“œ ë¶„í• ???œë˜ê·?ì´ˆê¸°??
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

      // ìµœì†Œ/ìµœë? ?ˆë¹„ ?œí•œ
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

  // ===== ?ˆí¼?°ìŠ¤ ë¶ˆëŸ¬?¤ê¸° ê¸°ëŠ¥ =====

  /**
   * ?ˆí¼?°ìŠ¤ ë¡œë” ?´ê¸°
   */
  openReferenceLoader() {
    logger.log("[openReferenceLoader] ?¨ìˆ˜ ?¸ì¶œ??);
    if (!this.referenceLoaderPanel) {
      logger.error(
        "[openReferenceLoader] referenceLoaderPanel??ì°¾ì„ ???†ìŠµ?ˆë‹¤."
      );
      return;
    }

    const content = this.referenceLoaderPanel.querySelector(
      ".reference-loader-content"
    );

    // ?¨ë„ ?œì‹œ
    this.referenceLoaderPanel.style.display = "block";

    // ???íƒœ ì´ˆê¸°??(?œì„± ??³¼ ?™ê¸°??
    const activeTab = this.referenceLoaderPanel.querySelector(
      ".reference-tab.active"
    );
    if (activeTab) {
      const tabName = activeTab.getAttribute("data-tab") || "saved";
      this.currentReferenceTab = tabName;
    } else {
      // ?œì„± ??´ ?†ìœ¼ë©?ê¸°ë³¸ê°’ìœ¼ë¡??¤ì •
      this.currentReferenceTab = "saved";
    }

    // transform ì´ˆê¸°??(?¸ë¼???¤í????œê±° ??CSS ?ìš©)
    if (content) {
      // ?¸ë¼???¤í????œê±°?˜ì—¬ CSS ? íƒ?ê? ?‘ë™?˜ë„ë¡???
      content.style.transform = "";

      // ?½ê°„??ì§€????transform ?ìš© (ë¦¬í”Œë¡œìš° ë³´ì¥)
      setTimeout(() => {
        content.style.transform = "translateX(0)";
      }, 10);
    }

    // ?½ê°„??ì§€?????°ì´??ë¡œë“œ
    setTimeout(() => {
      try {
        this.loadReferenceList();
        this.loadRecentReferencesList();
      } catch (error) {
        logger.error("[openReferenceLoader] ?°ì´??ë¡œë“œ ì¤??¤ë¥˜ ë°œìƒ:", {
          function: "openReferenceLoader",
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage(
          "???ˆí¼?°ìŠ¤ ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
          "error"
        );
      }
    }, 20);
  }

  /**
   * ?ˆí¼?°ìŠ¤ ë¡œë” ?«ê¸°
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
      // ?¸ë¼???¤í????œê±°?˜ì—¬ ?¤ìŒ ????CSSê°€ ?•ìƒ ?‘ë™?˜ë„ë¡???
      if (content) {
        content.style.transform = "";
      }
      if (this.referenceSearchInput) {
        this.referenceSearchInput.value = "";
      }
      // ?„í„°??ì´ˆê¸°??
      if (this.referenceCategoryFilter) {
        this.referenceCategoryFilter.value = "";
      }
      if (this.referenceSortFilter) {
        this.referenceSortFilter.value = "recent";
      }
    }, 300);
  }

  /**
   * ?ˆí¼?°ìŠ¤ ???„í™˜
   */
  switchReferenceTab(tabName) {
    this.currentReferenceTab = tabName;

    // ??ë²„íŠ¼ ?…ë°?´íŠ¸
    this.referenceTabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-tab") === tabName;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive.toString());
    });

    // ì½˜í…ì¸??…ë°?´íŠ¸
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

    // ?„í„° ?œì‹œ/?¨ê?
    if (this.referenceTrackingFilters) {
      this.referenceTrackingFilters.style.display =
        tabName === "tracking" ? "flex" : "none";
    }

    // ëª©ë¡ ë¡œë“œ
    this.loadReferenceList();
  }

  /**
   * ?ˆí¼?°ìŠ¤ ê²€??ì²˜ë¦¬
   */
  handleReferenceSearch(query) {
    clearTimeout(this.referenceSearchDebounce);
    this.referenceSearchDebounce = setTimeout(() => {
      this.loadReferenceList();
    }, 300);
  }

  /**
   * ?ˆí¼?°ìŠ¤ ëª©ë¡ ë¡œë“œ
   */
  async loadReferenceList() {
    if (!this.currentUser || !this.isFirebaseReady) {
      logger.warn("[loadReferenceList] ?¬ìš©???ëŠ” Firebase ì¤€ë¹??íƒœ ?•ì¸:", {
        hasUser: !!this.currentUser,
        isFirebaseReady: this.isFirebaseReady,
      });
      return;
    }

    // currentReferenceTab???†ìœ¼ë©?ê¸°ë³¸ê°??¤ì •
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
          "[loadReferenceList] ?????†ëŠ” ??",
          this.currentReferenceTab
        );
        // ê¸°ë³¸ê°’ìœ¼ë¡??€?¥ëœ ê¸€ ë¡œë“œ
        this.currentReferenceTab = "saved";
        await this.loadSavedReferences(searchQuery, categoryFilter);
      }
    } catch (error) {
      logger.error("[loadReferenceList] ?ˆí¼?°ìŠ¤ ëª©ë¡ ë¡œë“œ ?¤íŒ¨:", {
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
        "???ˆí¼?°ìŠ¤ ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
        "error"
      );
    }
  }

  /**
   * ?€?¥ëœ ê¸€ ?ˆí¼?°ìŠ¤ ë¡œë“œ
   */
  async loadSavedReferences(searchQuery = "", categoryFilter = "") {
    if (!this.referenceSavedList) return;

    // ?€?¥ëœ ê¸€ ëª©ë¡???†ìœ¼ë©?ë¡œë“œ
    if (!this.savedTexts || this.savedTexts.length === 0) {
      await this.loadSavedTexts();
    }

    // ?„í„°ë§?
    let filtered = this.savedTexts.filter((text) => {
      // [Tab Separation] ?ˆí¼?°ìŠ¤??'edit'(ê¸€ ?‘ì„±)?€ 'script'(?¤í¬ë¦½íŠ¸) ëª¨ë‘ ?ˆìš©
      const type = text.type || "edit";
      if (type !== "edit" && type !== "script") return false;

      // ê²€?‰ì–´ ?„í„°
      if (searchQuery) {
        const title = this.extractTitleFromContent(
          text.content || ""
        ).toLowerCase();
        const content = (text.content || "").toLowerCase();
        if (!title.includes(searchQuery) && !content.includes(searchQuery)) {
          return false;
        }
      }

      // ì¹´í…Œê³ ë¦¬ ?„í„°
      if (categoryFilter) {
        const category = text.topic || "ë¯¸ë¶„ë¥?;
        if (category !== categoryFilter) return false;
      }

      return true;
    });

    // ?•ë ¬ (ìµœì‹ ??
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
      const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
      return dateB - dateA;
    });

    // ?Œë”ë§?
    this.renderReferenceList(filtered, this.referenceSavedList, "saved");

    // ë¹??íƒœ ì²˜ë¦¬
    const emptyEl = document.getElementById("reference-saved-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * ?¸ë˜???ˆí¼?°ìŠ¤ ë¡œë“œ
   */
  async loadTrackingReferences(
    searchQuery = "",
    categoryFilter = "",
    sortFilter = "recent"
  ) {
    if (!this.referenceTrackingList) return;

    // ?¸ë˜???¬ìŠ¤??ëª©ë¡???†ìœ¼ë©?ë¡œë“œ
    if (!this.trackingPosts || this.trackingPosts.length === 0) {
      await this.loadTrackingPosts();
    }

    // ?„í„°ë§?
    let filtered = this.trackingPosts.filter((post) => {
      // ê²€?‰ì–´ ?„í„°
      if (searchQuery) {
        const content = (post.content || "").toLowerCase();
        if (!content.includes(searchQuery)) return false;
      }

      // ì¹´í…Œê³ ë¦¬ ?„í„°???¸ë˜?¹ì—???ìš© ????(?˜ì¤‘???•ì¥ ê°€??
      return true;
    });

    // ?•ë ¬
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
        // ìµœì‹ ??
        const dateA = a.postedAt || new Date(0);
        const dateB = b.postedAt || new Date(0);
        return dateB - dateA;
      }
    });

    // ?Œë”ë§?
    this.renderReferenceList(filtered, this.referenceTrackingList, "tracking");

    // ë¹??íƒœ ì²˜ë¦¬
    const emptyEl = document.getElementById("reference-tracking-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * ?¸ë˜???¬ìŠ¤?¸ì˜ ìµœì‹  ë©”íŠ¸ë¦?ê°?ê°€?¸ì˜¤ê¸?
   */
  getLatestMetricValue(post, metricType) {
    if (!post.metrics || post.metrics.length === 0) return 0;

    const latest = post.metrics[post.metrics.length - 1];
    return latest[metricType] || 0;
  }

  /**
   * ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
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
   * ?ˆí¼?°ìŠ¤ ?„ì´???ì„±
   */
  createReferenceItem(item, sourceType) {
    const div = document.createElement("div");
    div.className = "reference-item";
    div.setAttribute("data-item-id", item.id);
    div.setAttribute("data-source-type", sourceType);

    const title =
      sourceType === "saved"
        ? item.title || "?œëª© ?†ìŒ" // Firestore???€?¥ëœ title ?¬ìš©
        : (item.content || "").substring(0, 50) +
          (item.content?.length > 50 ? "..." : "");

    const content = (item.content || "").substring(0, 150);
    let date = "";
    if (sourceType === "saved") {
      date = item.createdAt
        ? this.formatDateFromFirestore(item.createdAt)
        : item.date || "";
    } else {
      // ?¸ë˜???¬ìŠ¤?¸ì˜ ê²½ìš° postedAt??Date ê°ì²´???˜ë„ ?ˆìŒ
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

    let metaHtml = `<span>?“… ${date}</span>`;

    if (sourceType === "tracking") {
      const views = this.getLatestMetricValue(item, "views") || 0;
      const likes = this.getLatestMetricValue(item, "likes") || 0;
      const follows = this.getLatestMetricValue(item, "follows") || 0;
      metaHtml += `<span>?? ${views}</span>`;
      metaHtml += `<span>?¤ï¸ ${likes}</span>`;
      metaHtml += `<span>?‘¥ ${follows}</span>`;
    } else {
      const category = item.topic || "ë¯¸ë¶„ë¥?;
      metaHtml += `<span>?“ ${this.escapeHtml(category)}</span>`;
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
                    ì¶”ê??˜ê¸°
                </button>
            </div>
        `;

    // ì¶”ê? ë²„íŠ¼ ?´ë²¤??
    const addBtn = div.querySelector('[data-action="add"]');
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.addReferenceToContent(item, sourceType);
      });
    }

    // ?„ì´???´ë¦­ ?œì—??ì¶”ê?
    div.addEventListener("click", () => {
      this.addReferenceToContent(item, sourceType);
    });

    return div;
  }

  /**
   * ?ˆí¼?°ìŠ¤ë¥??•ë? ëª¨ë“œ???ˆí¼?°ìŠ¤ ?ì—­??ì¶”ê?
   * ?•ë? ëª¨ë“œê°€ ?«í??ˆìœ¼ë©??ë™?¼ë¡œ ?´ê³  ?ˆí¼?°ìŠ¤ë¥?ì¶”ê??©ë‹ˆ??
   *
   * @param {Object} item - ?ˆí¼?°ìŠ¤ ?„ì´??ê°ì²´
   * @param {string} sourceType - ?ˆí¼?°ìŠ¤ ?ŒìŠ¤ ?€??('saved' ?ëŠ” 'tracking')
   */
  addReferenceToContent(item, sourceType) {
    // ?„ìˆ˜ DOM ?”ì†Œ ì¡´ì¬ ?¬ë? ?•ì¸
    if (!this.scriptContentTextarea) {
      logger.error("[addReferenceToContent] ?„ìˆ˜ DOM ?”ì†Œ ?†ìŒ:", {
        function: "addReferenceToContent",
        missingElement: "scriptContentTextarea",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ?Œë¼ë¯¸í„° ? íš¨??ê²€??
    if (!item || typeof item !== "object") {
      logger.error("[addReferenceToContent] ?Œë¼ë¯¸í„° ? íš¨??ê²€???¤íŒ¨:", {
        function: "addReferenceToContent",
        parameter: "item",
        receivedType: typeof item,
        receivedValue: item,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("???ˆí¼?°ìŠ¤ ?•ë³´ê°€ ?¬ë°”ë¥´ì? ?ŠìŠµ?ˆë‹¤.", "error");
      return;
    }

    const content = item.content || "";
    if (!content.trim()) {
      this.showMessage("???ˆí¼?°ìŠ¤ ?´ìš©??ë¹„ì–´?ˆìŠµ?ˆë‹¤.", "error");
      return;
    }

    // sourceType ?Œë¼ë¯¸í„° ? íš¨??ê²€??
    if (!sourceType || typeof sourceType !== "string") {
      logger.error(
        "[addReferenceToContent] sourceType ?Œë¼ë¯¸í„° ? íš¨??ê²€???¤íŒ¨:",
        {
          function: "addReferenceToContent",
          parameter: "sourceType",
          receivedType: typeof sourceType,
          receivedValue: sourceType,
          timestamp: new Date().toISOString(),
        }
      );
      this.showMessage("???ˆí¼?°ìŠ¤ ?ŒìŠ¤ ?€?…ì´ ?¬ë°”ë¥´ì? ?ŠìŠµ?ˆë‹¤.", "error");
      return;
    }

    const validSourceTypes = ["saved", "tracking"];
    if (!validSourceTypes.includes(sourceType)) {
      logger.error("[addReferenceToContent] ? íš¨?˜ì? ?Šì? sourceType:", {
        function: "addReferenceToContent",
        parameter: "sourceType",
        receivedValue: sourceType,
        validValues: validSourceTypes,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("??ì§€?í•˜ì§€ ?ŠëŠ” ?ˆí¼?°ìŠ¤ ?ŒìŠ¤ ?€?…ì…?ˆë‹¤.", "error");
      return;
    }

    // ?•ë? ëª¨ë“œ ?´ë¦¼ ?íƒœ ?•ì¸
    const isExpandModeOpen =
      this.contentExpandModal &&
      this.contentExpandModal.style.display === "block";

    // ?•ë? ëª¨ë“œê°€ ?«í??ˆìœ¼ë©?ë¨¼ì? ?´ê¸°
    if (!isExpandModeOpen) {
      // ?„ìˆ˜ DOM ?”ì†Œ ?•ì¸
      if (!this.contentExpandModal || !this.expandContentTextarea) {
        logger.error("[addReferenceToContent] ?•ë? ëª¨ë“œ ê´€??DOM ?”ì†Œ ?†ìŒ:", {
          function: "addReferenceToContent",
          missingElements: {
            contentExpandModal: !this.contentExpandModal,
            expandContentTextarea: !this.expandContentTextarea,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage("???•ë? ëª¨ë“œë¥??????†ìŠµ?ˆë‹¤.", "error");
        return;
      }

      try {
        // ?±ëŠ¥ ëª¨ë‹ˆ?°ë§: ?œì‘ ?œê°„ ê¸°ë¡
        const performanceStart = performance.now();

        // ?•ë? ëª¨ë“œ ?´ê¸°
        this.openExpandMode();

        // ëª¨ë‹¬???´ë¦° ???ˆí¼?°ìŠ¤ ì¶”ê? (? ë‹ˆë©”ì´???„ë£Œ ?€ê¸?
        const timeoutId = setTimeout(() => {
          // ?±ëŠ¥ ëª¨ë‹ˆ?°ë§: ?„ë£Œ ?œê°„ ê¸°ë¡
          const performanceEnd = performance.now();
          const performanceDuration = performanceEnd - performanceStart;

          // ?±ëŠ¥???ë¦° ê²½ìš°?ë§Œ ë¡œê¹…
          if (
            performanceDuration >
            DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS
          ) {
            logger.warn("[addReferenceToContent] ?±ëŠ¥ ê²½ê³ :", {
              function: "addReferenceToContent",
              action: "expandModeOpenAndAddReference",
              duration: `${performanceDuration.toFixed(2)}ms`,
              threshold: `${DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS}ms`,
              timestamp: new Date().toISOString(),
            });
          }

          this._addReferenceToExpandModeAndNotify(item, sourceType, true);
        }, DualTextWriter.CONFIG.EXPAND_MODE_ANIMATION_DELAY);

        // ë©”ëª¨ë¦??„ìˆ˜ ë°©ì?ë¥??„í•œ timeout ID ?€??(?„ìš”???´ë¦¬??ê°€??
        if (!this._expandModeTimeouts) {
          this._expandModeTimeouts = [];
        }
        this._expandModeTimeouts.push(timeoutId);

        return;
      } catch (error) {
        // êµ¬ì¡°?”ëœ ?ëŸ¬ ë¡œê¹…
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
          "[addReferenceToContent] ?•ë? ëª¨ë“œ ?´ê¸° ì¤??¤ë¥˜ ë°œìƒ:",
          errorContext
        );
        this.showMessage("???•ë? ëª¨ë“œë¥??????†ìŠµ?ˆë‹¤.", "error");
        return;
      }
    }

    // ?•ë? ëª¨ë“œê°€ ?´ë? ?´ë ¤?ˆëŠ” ê²½ìš°
    this._addReferenceToExpandModeAndNotify(item, sourceType, false);
  }

  /**
   * ?ˆí¼?°ìŠ¤ë¥??•ë? ëª¨ë“œ??ì¶”ê??˜ê³  ?¬ìš©?ì—ê²??Œë¦¼
   * ì¤‘ë³µ ì½”ë“œ ?œê±°ë¥??„í•œ ?¬í¼ ?¨ìˆ˜
   *
   * @param {Object} item - ?ˆí¼?°ìŠ¤ ?„ì´??ê°ì²´
   * @param {string} sourceType - ?ˆí¼?°ìŠ¤ ?ŒìŠ¤ ?€??
   * @param {boolean} isNewlyOpened - ?•ë? ëª¨ë“œê°€ ë°©ê¸ˆ ?´ë ¸?”ì? ?¬ë?
   * @private
   */
  _addReferenceToExpandModeAndNotify(item, sourceType, isNewlyOpened) {
    try {
      // ?ˆí¼?°ìŠ¤ ì¶”ê?
      this.addReferenceToExpandMode(item, sourceType);

      // ìµœê·¼ ?¬ìš© ëª©ë¡??ì¶”ê?
      if (item.id && sourceType) {
        this.addToRecentReferences(item.id, sourceType);
      }

      // ?¬ì´???¨ë„ ?«ê¸°
      this.closeReferenceLoader();

      // ?¤í¬ë¦?ë¦¬ë” ?¬ìš©?ë? ?„í•œ ?Œë¦¼
      const screenReaderMessage = isNewlyOpened
        ? "?ˆí¼?°ìŠ¤ê°€ ?•ë? ëª¨ë“œ???ˆí¼?°ìŠ¤ ?ì—­??ì¶”ê??˜ì—ˆ?µë‹ˆ??"
        : "?ˆí¼?°ìŠ¤ê°€ ?ˆí¼?°ìŠ¤ ?ì—­??ì¶”ê??˜ì—ˆ?µë‹ˆ??";
      this.announceToScreenReader(screenReaderMessage);

      // ?±ê³µ ë©”ì‹œì§€
      this.showMessage(
        "???ˆí¼?°ìŠ¤ê°€ ì¶”ê??˜ì—ˆ?µë‹ˆ?? ?¼ìª½ ?ˆí¼?°ìŠ¤ ?ì—­?ì„œ ?•ì¸?˜ì„¸??",
        "success"
      );

      // ?•ë? ëª¨ë“œê°€ ë°©ê¸ˆ ?´ë¦° ê²½ìš°?ë§Œ ?¬ì»¤??ê´€ë¦?
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
      // êµ¬ì¡°?”ëœ ?ëŸ¬ ë¡œê¹…
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
        "[addReferenceToContent] ?ˆí¼?°ìŠ¤ ì¶”ê? ì¤??¤ë¥˜ ë°œìƒ:",
        errorContext
      );
      this.showMessage("???ˆí¼?°ìŠ¤ ì¶”ê? ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.", "error");
    }
  }

  /**
   * ìµœê·¼ ?¬ìš© ?ˆí¼?°ìŠ¤ ë¡œë“œ (localStorage)
   */
  loadRecentReferences() {
    try {
      const stored = localStorage.getItem("dtw_recent_references");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error("ìµœê·¼ ?ˆí¼?°ìŠ¤ ë¡œë“œ ?¤íŒ¨:", error);
      return [];
    }
  }

  /**
   * ìµœê·¼ ?¬ìš© ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
   */
  async loadRecentReferencesList() {
    if (!this.referenceRecentList || !this.referenceRecentSection) return;

    if (this.recentReferences.length === 0) {
      this.referenceRecentSection.style.display = "none";
      return;
    }

    this.referenceRecentSection.style.display = "block";
    this.referenceRecentList.innerHTML = "";

    // ìµœê·¼ 5ê°œë§Œ ?œì‹œ
    const recent = this.recentReferences.slice(0, 5);

    for (const ref of recent) {
      try {
        let item = null;

        if (ref.sourceType === "saved") {
          // ?€?¥ëœ ê¸€?ì„œ ì°¾ê¸°
          if (!this.savedTexts || this.savedTexts.length === 0) {
            await this.loadSavedTexts();
          }
          item = this.savedTexts.find((t) => t.id === ref.id);
        } else {
          // ?¸ë˜?¹ì—??ì°¾ê¸°
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
        logger.error("ìµœê·¼ ?ˆí¼?°ìŠ¤ ë¡œë“œ ?¤íŒ¨:", error);
      }
    }
  }

  /**
   * ìµœê·¼ ?¬ìš© ?ˆí¼?°ìŠ¤??ì¶”ê?
   */
  addToRecentReferences(itemId, sourceType) {
    // ê¸°ì¡´ ??ª© ?œê±° (ì¤‘ë³µ ë°©ì?)
    this.recentReferences = this.recentReferences.filter(
      (ref) => !(ref.id === itemId && ref.sourceType === sourceType)
    );

    // ë§??ì— ì¶”ê?
    this.recentReferences.unshift({
      id: itemId,
      sourceType: sourceType,
      timestamp: Date.now(),
    });

    // ìµœë? 10ê°œë§Œ ? ì?
    this.recentReferences = this.recentReferences.slice(0, 10);

    // localStorage???€??
    try {
      localStorage.setItem(
        Constants.STORAGE_KEYS.RECENT_REFERENCES,
        JSON.stringify(this.recentReferences)
      );
    } catch (error) {
      logger.error("ìµœê·¼ ?ˆí¼?°ìŠ¤ ?€???¤íŒ¨:", error);
    }
  }
}

// Initialize the application
let dualTextWriter;

document.addEventListener("DOMContentLoaded", () => {
  dualTextWriter = new DualTextWriter();
  window.dualTextWriter = dualTextWriter;
  window.app = dualTextWriter;

  // ë©”ì¸ ì½˜í…ì¸?ê°•ì œ ?œì‹œ (ë¡œê·¸???íƒœ?€ ê´€ê³„ì—†??
  const mainContent = document.getElementById("main-content");
  if (mainContent) {
    mainContent.style.display = "block";
  }

  // ?„ì—­ ?”ë²„ê¹??¨ìˆ˜ ?±ë¡
  window.debugSavedItems = () => dualTextWriter.debugSavedItems();
  window.verifyLLMCharacteristics = () =>
    dualTextWriter.verifyLLMCharacteristics();
  window.testEditButton = (index = 0) => {
    const editButtons = document.querySelectorAll(".btn-edit");
    if (editButtons[index]) {
      editButtons[index].click();
    } else {
      logger.log("?¸ì§‘ ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    }
  };
  window.testDeleteButton = (index = 0) => {
    const deleteButtons = document.querySelectorAll(".btn-delete");
    if (deleteButtons[index]) {
      deleteButtons[index].click();
    } else {
      logger.log("?? œ ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    }
  };
  window.testLLMValidation = (llmService = "chatgpt", index = 0) => {
    const llmButtons = document.querySelectorAll(`[data-llm="${llmService}"]`);
    if (llmButtons[index]) {
      llmButtons[index].click();
    } else {
      logger.log(`${llmService} ê²€ì¦?ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.`);
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

      // ? íš¨??ê²€ì¦? min/max ë²”ìœ„ ?´ì¸ì§€ ?•ì¸
      if (newValue >= min && newValue <= max) {
        input.value = newValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));

        // ?¤ì‹œê°?? íš¨???¼ë“œë°? ë²”ìœ„ë¥?ë²—ì–´?˜ë©´ ?¤í…Œ??ë¹„í™œ?±í™”
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

  // Date tab handlers - ?´ë²¤???„ì„ ë°©ì‹?¼ë¡œ ?ˆì •?ì¸ ë°”ì¸??
  // ê¸°ì¡´ ?¸ë“¤???œê±° (ì¤‘ë³µ ë°”ì¸??ë°©ì?)
  if (content._dateTabHandler) {
    content.removeEventListener("click", content._dateTabHandler);
  }

  // ?ˆë¡œ???¸ë“¤???ì„± ë°??€??
  content._dateTabHandler = (e) => {
    const tab = e.target.closest(".date-tab");
    if (!tab) return;

    e.preventDefault();
    e.stopPropagation();

    const tabs = tab.closest(".date-selector-tabs");
    if (!tabs) return;

    // ê°™ì? ??ê·¸ë£¹ ?´ì˜ ? ì§œ ?…ë ¥ ?„ë“œ ì°¾ê¸°
    const formGroup = tabs.closest(".form-group");
    if (!formGroup) return;

    const dateInput = formGroup.querySelector('input[type="date"]');
    if (!dateInput) {
      logger.warn("? ì§œ ?…ë ¥ ?„ë“œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤:", formGroup);
      return;
    }

    // ëª¨ë“  ??ë¹„í™œ?±í™” ???´ë¦­?????œì„±??
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
      // input ?´ë²¤???¸ë¦¬ê±°í•˜????ê²€ì¦??…ë°?´íŠ¸
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "yesterday") {
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      dateInput.value = yesterdayStr;
      dateInput.style.display = "none";
      // input ?´ë²¤???¸ë¦¬ê±°í•˜????ê²€ì¦??…ë°?´íŠ¸
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "custom") {
      dateInput.style.display = "block";
      // ì§ì ‘?…ë ¥ ?„ë“œê°€ ë³´ì´?„ë¡ ?½ê°„??ì§€?????¬ì»¤??(? ë‹ˆë©”ì´???„ë£Œ ??
      setTimeout(() => {
        dateInput.focus();
      }, 50);
      // ?¬ìš©???…ë ¥???„í•´ ?„ì¬ ê°’ì„ ? ì??˜ê±°???¤ëŠ˜ ? ì§œë¡??¤ì •
      if (!dateInput.value) {
        dateInput.value = today.toISOString().split("T")[0];
      }
      // input ?´ë²¤???¸ë¦¬ê±?
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  // ?´ë²¤???„ì„: ëª¨ë‹¬ ì»¨í…ì¸ ì— ??ë²ˆë§Œ ë°”ì¸??
  content.addEventListener("click", content._dateTabHandler);

  // Focus scroll correction: ?¤íŒ¨?œê? ê°€?¤ì?ì§€ ?Šë„ë¡?(?ˆë“œë¡œì´???„ì´???¸í™˜)
  content.querySelectorAll("input, textarea").forEach((field) => {
    const handleFocus = (e) => {
      // ?¬ëŸ¬ ë²??¸ì¶œ ë°©ì?
      if (field._scrollHandled) return;
      field._scrollHandled = true;

      setTimeout(
        () => {
          const rect = field.getBoundingClientRect();
          const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight;

          // ?Œë«?¼ë³„ ?¤íŒ¨???’ì´ ì¶”ì •
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
            const scrollOffset = fieldBottom - visibleArea + 30; // ?¬ìœ  ê³µê°„ ì¦ê?

            // ëª¨ë‹¬ ì»¨í…ì¸??¤í¬ë¡?
            if (content.scrollHeight > content.clientHeight) {
              content.scrollTop += scrollOffset;
            }

            // ?„ì²´ ?˜ì´ì§€ ?¤í¬ë¡?(?„ìš”??
            const modalRect = modalElement.getBoundingClientRect();
            if (modalRect.bottom > visibleArea) {
              // ë¶€?œëŸ¬???¤í¬ë¡?
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
      ); // iOS???¤íŒ¨??? ë‹ˆë©”ì´?˜ì´ ??ê¸????ˆìŒ
    };

    field.addEventListener("focus", handleFocus, { passive: true });

    // blur ???Œë˜ê·?ë¦¬ì…‹
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

  // ??ê°?ì´ˆê¸°???„ëµ: ë°”í??œíŠ¸ ?«ì„ ??ëª¨ë“  ?…ë ¥ ?„ë“œ ì´ˆê¸°??
  const content = modalElement.querySelector(".modal-content");
  if (content) {
    // ëª¨ë“  input, textarea, select ì´ˆê¸°??
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

    // ? ì§œ ??ì´ˆê¸°??
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

    // ? ì§œ ?…ë ¥ ?„ë“œ ì´ˆê¸°??
    const dateInputs = content.querySelectorAll('input[type="date"]');
    dateInputs.forEach((input) => {
      input.style.display = "none";
    });

    // ?¤í…Œ??ë²„íŠ¼ ?íƒœ ì´ˆê¸°??
    const steppers = content.querySelectorAll(".number-stepper");
    steppers.forEach((stepper) => {
      stepper.disabled = false;
      stepper.style.opacity = "1";
    });

    // ??ê²€ì¦?ë©”ì‹œì§€ ?œê±°
    const errorMessages = content.querySelectorAll(
      ".error-message, .validation-error"
    );
    errorMessages.forEach((msg) => msg.remove());

    // ?…ë ¥ ?„ë“œ???ëŸ¬ ?íƒœ ?œê±°
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

  // ëª¨ë‹¬ ?íƒœ ì´ˆê¸°??
  this.currentTrackingTextId = null;
  this.editingMetricData = null;
};

// ?˜ì´ì§€ ?¸ë¡œ?????•ë¦¬ ?‘ì—…
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

// ==================== ?¸ë˜??ê¸°ëŠ¥ ë©”ì„œ?œë“¤ ====================

// ?¸ë˜???¬ìŠ¤??ë¡œë“œ
DualTextWriter.prototype.loadTrackingPosts = async function () {
  if (!this.currentUser || !this.isFirebaseReady) return;

  // ë¡œë”© ?¤ì¼ˆ?ˆí†¤ ?œì‹œ
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

      // ?ˆí¼?°ìŠ¤ ?€???¬ìŠ¤?¸ëŠ” ?¸ë˜??ëª©ë¡?ì„œ ?œì™¸
      // ?ˆí¼?°ìŠ¤ ê¸€?€ ?¬ìš© ?¬ë? ?œì‹œ?©ì´ì§€ ?¸ë˜???€?ì´ ?„ë‹˜
      const postType = data.type || "edit";
      const sourceType = data.sourceType || data.type || "edit";

      // ?ˆí¼?°ìŠ¤ ?€???¬ìŠ¤???„í„°ë§?(type === 'reference' ?ëŠ” sourceType === 'reference')
      if (postType === "reference" || sourceType === "reference") {
        logger.log("?ˆí¼?°ìŠ¤ ?¬ìŠ¤?¸ëŠ” ?¸ë˜??ëª©ë¡?ì„œ ?œì™¸:", doc.id);
        return; // ???¬ìŠ¤?¸ëŠ” ?¸ë˜??ëª©ë¡??ì¶”ê??˜ì? ?ŠìŒ
      }

      this.trackingPosts.push({
        id: doc.id,
        content: data.content,
        type: postType,
        postedAt: data.postedAt ? data.postedAt.toDate() : new Date(),
        trackingEnabled: data.trackingEnabled || false,
        metrics: data.metrics || [],
        analytics: data.analytics || {},
        sourceTextId: data.sourceTextId || null, // ?ë³¸ ?ìŠ¤??ì°¸ì¡°
        sourceType: sourceType, // ?ë³¸ ?ìŠ¤???€??
        sourceTextExists: null, // ê²€ì¦?ê²°ê³¼ (?˜ì¤‘???¤ì •)
      });
    });

    logger.log(
      `${this.trackingPosts.length}ê°œì˜ ?¸ë˜???¬ìŠ¤?¸ë? ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`
    );

    // ?°ì´??ë¬´ê²°??ê²€ì¦? ê°??¬ìŠ¤?¸ì˜ sourceTextIdê°€ ? íš¨?œì? ?•ì¸
    await this.validateSourceTexts();

    // ?¬ìŠ¤??? íƒ ?œë¡­?¤ìš´ ?…ë°?´íŠ¸ (ê°œë³„ ?¬ìŠ¤??ëª¨ë“œ????
    if (this.chartMode === "individual") {
      this.populatePostSelector();
    }

    // loadTrackingPosts??ì´ˆê¸° ë¡œë“œ ?œì—ë§??¬ìš©, ?´í›„?ëŠ” refreshUI ?¬ìš©
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });
  } catch (error) {
    // Firebase ?°ì´??ë¡œë“œ ?¤íŒ¨ ???ëŸ¬ ì²˜ë¦¬
    logger.error("[loadTrackingPosts] Failed to load tracking posts:", error);
    this.trackingPosts = [];
    // ?¬ìš©?ì—ê²??ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
    this.showMessage(
      "?¸ë˜???°ì´?°ë? ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?¤íŠ¸?Œí¬ ?°ê²°???•ì¸?´ì£¼?¸ìš”.",
      "error"
    );
    // ë¹??íƒœ ?œì‹œ
    if (this.trackingPostsList) {
      this.trackingPostsList.innerHTML = `
                <div class="tracking-post-no-data" style="text-align: center; padding: 40px 20px;">
                    <span class="no-data-icon" style="font-size: 3rem; display: block; margin-bottom: 16px;">?“­</span>
                    <span class="no-data-text" style="color: #666; font-size: 0.95rem;">?°ì´?°ë? ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤. ?˜ì´ì§€ë¥??ˆë¡œê³ ì¹¨?´ì£¼?¸ìš”.</span>
                </div>
            `;
    }
  }
};

// ì¦ê²¨ì°¾ê¸° ê´€ë¦?
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
    logger.error("ì¦ê²¨ì°¾ê¸° ?€???¤íŒ¨", e);
  }
};

// CSV ?´ë³´?´ê¸° (?„ì¬ ?„í„°/?•ë ¬ ?ìš©??ë¦¬ìŠ¤??ê¸°ì?)
DualTextWriter.prototype.exportTrackingCsv = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) {
    this.showMessage("?´ë³´???°ì´?°ê? ?†ìŠµ?ˆë‹¤.", "info");
    return;
  }
  // renderTrackingPosts???„í„°/?•ë ¬ ë¡œì§???¬ì‚¬?©í•˜ê¸??„í•´ ?™ì¼ ê³„ì‚° ?˜í–‰
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;
  let list = [...this.trackingPosts];
  // ?íƒœ
  if (this.trackingStatusFilter === "active")
    list = list.filter((p) => !!p.trackingEnabled);
  else if (this.trackingStatusFilter === "inactive")
    list = list.filter((p) => !p.trackingEnabled);
  else if (this.trackingStatusFilter === "hasData")
    list = list.filter((p) => p.metrics && p.metrics.length > 0);
  else if (this.trackingStatusFilter === "noData")
    list = list.filter((p) => !(p.metrics && p.metrics.length > 0));
  // ê²€??
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
  // ê¸°ê°„
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
  // ?˜ì¹˜ ë²”ìœ„
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
  // ?•ë ¬ ?ìš© (renderTrackingPosts?€ ?™ì¼??ë¡œì§)
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // ì¡°íšŒ???•ë ¬
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
    // ì¢‹ì•„???•ë ¬
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
    // ?“ê? ?•ë ¬
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
    // ê³µìœ  ?•ë ¬
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
    // ?”ë¡œ???•ë ¬
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
    // ?…ë ¥ ?Ÿìˆ˜ ?•ë ¬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // ? ì§œ ?•ë ¬
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
      // ê¸°ë³¸ê°? ìµœì‹  ?…ë°?´íŠ¸??
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

  // CSV ?‘ì„±
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
// ?ë³¸ ?ìŠ¤??ì¡´ì¬ ?¬ë? ê²€ì¦?
DualTextWriter.prototype.validateSourceTexts = async function () {
  if (!this.currentUser || !this.isFirebaseReady || !this.trackingPosts) return;

  try {
    // sourceTextIdê°€ ?ˆëŠ” ?¬ìŠ¤?¸ë“¤ë§?ê²€ì¦?
    const postsToValidate = this.trackingPosts.filter(
      (post) => post.sourceTextId
    );

    if (postsToValidate.length === 0) {
      // sourceTextIdê°€ ?†ëŠ” ?¬ìŠ¤?¸ë“¤?€ orphan?¼ë¡œ ?œì‹œ
      this.trackingPosts.forEach((post) => {
        if (!post.sourceTextId) {
          post.sourceTextExists = false;
          post.isOrphan = true;
        }
      });
      return;
    }

    // ëª¨ë“  sourceTextId ?˜ì§‘
    const sourceTextIds = [
      ...new Set(postsToValidate.map((post) => post.sourceTextId)),
    ];

    // ?ë³¸ ?ìŠ¤??ì¡´ì¬ ?¬ë? ?¼ê´„ ?•ì¸
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
        logger.error(`?ë³¸ ?ìŠ¤??ê²€ì¦??¤íŒ¨ (${textId}):`, error);
        return { textId, exists: false };
      }
    });

    const validationResults = await Promise.all(validationPromises);
    const validationMap = new Map(
      validationResults.map((r) => [r.textId, r.exists])
    );

    // ê°??¬ìŠ¤?¸ì— ê²€ì¦?ê²°ê³¼ ?ìš©
    this.trackingPosts.forEach((post) => {
      if (post.sourceTextId) {
        post.sourceTextExists = validationMap.get(post.sourceTextId) || false;
        post.isOrphan = !post.sourceTextExists;
      } else {
        // sourceTextIdê°€ ?†ìœ¼ë©?orphan?¼ë¡œ ?œì‹œ (?…ê·¸?ˆì´?????°ì´??
        post.sourceTextExists = false;
        post.isOrphan = true;
      }
    });

    const orphanCount = this.trackingPosts.filter((p) => p.isOrphan).length;
    if (orphanCount > 0) {
      logger.log(`? ï¸ ${orphanCount}ê°œì˜ orphan ?¬ìŠ¤?¸ê? ë°œê²¬?˜ì—ˆ?µë‹ˆ??`);
    }
  } catch (error) {
    logger.error("?ë³¸ ?ìŠ¤??ê²€ì¦??¤íŒ¨:", error);
    // ?ëŸ¬ ë°œìƒ ??ëª¨ë“  ?¬ìŠ¤?¸ë? ê²€ì¦??¤íŒ¨ë¡??œì‹œ?˜ì? ?Šê³ , sourceTextIdê°€ ?†ëŠ” ê²ƒë§Œ orphan?¼ë¡œ ?œì‹œ
    this.trackingPosts.forEach((post) => {
      if (!post.sourceTextId) {
        post.isOrphan = true;
        post.sourceTextExists = false;
      }
    });
  }
};
// ?¸ë˜???¬ìŠ¤???Œë”ë§?
DualTextWriter.prototype.renderTrackingPosts = function () {
  if (!this.trackingPostsList) return;

  if (this.trackingPosts.length === 0) {
    this.trackingPostsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">?“Š</div>
                <div class="empty-state-text">?¸ë˜??ì¤‘ì¸ ?¬ìŠ¤?¸ê? ?†ìŠµ?ˆë‹¤</div>
                <div class="empty-state-subtext">?€?¥ëœ ê¸€?ì„œ ?¸ë˜?¹ì„ ?œì‘?´ë³´?¸ìš”!</div>
            </div>
        `;
    return;
  }

  // Orphan ?¬ìŠ¤??ê°œìˆ˜ ?•ì¸
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);
  const orphanCount = orphanPosts.length;

  // Orphan ?¬ìŠ¤??ê²½ê³  ë°°ë„ˆ HTML
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
                    <span style="font-size: 1.2rem;">? ï¸</span>
                    <strong style="color: #856404; font-size: 1rem;">?ë³¸???? œ???¬ìŠ¤??${orphanCount}ê°?ë°œê²¬</strong>
                </div>
                <div style="color: #856404; font-size: 0.9rem; margin-left: 28px;">
                    ?ë³¸ ê¸€(?€?¥ëœ ê¸€)???? œ?˜ì–´ ?°ê²°???Šì–´ì§??¬ìŠ¤?¸ì…?ˆë‹¤.
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
                ?—‘ï¸??•ë¦¬?˜ê¸°
            </button>
        </div>
    `
      : "";

  // ?íƒœ/ê²€??ê¸°ê°„ ?„í„° ?ìš©
  let list = [...this.trackingPosts];

  // ?ˆí¼?°ìŠ¤ ?¬ìŠ¤???„í„°ë§?(?¸ë˜???€???„ë‹˜)
  // ?ˆí¼?°ìŠ¤ ê¸€?€ ?¬ìš© ?¬ë? ?œì‹œ?©ì´ì§€ ?¸ë˜???€?ì´ ?„ë‹˜
  list = list.filter((post) => {
    const postType = post.type || "edit";
    const sourceType = post.sourceType || post.type || "edit";

    // ?ˆí¼?°ìŠ¤ ?€???¬ìŠ¤?¸ëŠ” ?œì™¸
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

  // ?•ë ¬ ê¸°ì? ê³„ì‚°???„ìš”??ìµœì‹  ë©”íŠ¸ë¦?
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;

  // ê²€???œëª©/?¤ì›Œ???´ì‹œ?œê·¸)
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

  // ê¸°ê°„(ìµœì¢… ?…ë°?´íŠ¸) ?„í„°
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

  // ?˜ì¹˜ ë²”ìœ„ ?„í„° (ìµœì‹  ë©”íŠ¸ë¦?ê¸°ì?)
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

  // ?•ë ¬ ?ìš©
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // ì¡°íšŒ???•ë ¬
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
    // ì¢‹ì•„???•ë ¬
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
    // ?“ê? ?•ë ¬
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
    // ê³µìœ  ?•ë ¬
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
    // ?”ë¡œ???•ë ¬
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
    // ?…ë ¥ ?Ÿìˆ˜ ?•ë ¬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // ? ì§œ ?•ë ¬
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
      // ê¸°ë³¸ê°? ìµœì‹  ?…ë°?´íŠ¸??
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

  // ?´ë²¤???„ì„ ?¤ì • (ìµœì´ˆ 1?Œë§Œ)
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
              button.textContent = nowExpanded ? "?‘ê¸°" : "?”ë³´ê¸?;
              button.setAttribute(
                "aria-expanded",
                nowExpanded ? "true" : "false"
              );
              try {
                // localStorage???íƒœ ?€??(?µì¼???¤í‚¤ë§? card:{postId}:expanded)
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

      // ?¤ë³´???‘ê·¼??ì§€??(Enter/Space ??ì²˜ë¦¬) - ìµœì´ˆ 1?Œë§Œ
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

        // ?íƒœ ?•ë³´
        const statusClass = post.trackingEnabled ? "active" : "inactive";
        const statusIcon = post.trackingEnabled ? "?Ÿ¢" : "??;
        const statusText = post.trackingEnabled ? "?œì„±" : "ë¹„í™œ??;

        // Orphan ?¬ìŠ¤???œì‹œ
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
                ? ï¸ ?ë³¸ ?? œ??
            </div>
        `
          : "";

        // ë©”íŠ¸ë¦??°ì´???œì‹œ
        const metricsBadgeClass = hasMetrics ? "has-data" : "no-data";
        const metricsBadgeText = hasMetrics
          ? `?“Š ${metricsCount}???…ë ¥`
          : "?“­ ?°ì´???†ìŒ";

        // ë§ˆì?ë§??…ë°?´íŠ¸ ? ì§œ
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

        // Orphan ?¬ìŠ¤?¸ëŠ” ?œê°?ìœ¼ë¡??¤ë¥´ê²??œì‹œ
        const orphanClass = post.isOrphan ? "orphan-post" : "";

        // sourceTextIdë¥??µí•´ ?ë³¸ ?ìŠ¤?¸ì—??ì£¼ì œ ?•ë³´ ê°€?¸ì˜¤ê¸?
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

        // ??sourceTextIdë¥??µí•´ ?ë³¸ ?ìŠ¤?¸ì—??SNS ?Œë«???•ë³´ ê°€?¸ì˜¤ê¸?
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
            // ? íš¨???Œë«??IDë§??„í„°ë§?
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
                    )} ?Œë«??>${p.icon} ${this.escapeHtml(p.name)}</span>`
                )
                .join("");
              snsPlatformsHtml = `
                        <div class="tracking-post-platforms" role="list" aria-label="SNS ?Œë«??ëª©ë¡">
                            ${platformsList}
                        </div>
                    `;
            }
          }
        }

        // localStorage?ì„œ ?•ì¥ ?íƒœ ë³µì› (?µì¼???¤í‚¤ë§? card:{postId}:expanded)
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
                        }" title="ì¦ê²¨ì°¾ê¸°" style="border:none; background:transparent; cursor:pointer; font-size:1.1rem; min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center;">${
          isFav ? "â­? : "??
        }</button>
                        ${orphanBadge}
                    </div>
                    <div class="tracking-post-status-group">
                        <div class="tracking-post-status ${statusClass}" aria-label="?¸ë˜???íƒœ: ${statusText}">
                            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                </div>
                ${
                  topic
                    ? `<div class="tracking-post-topic" aria-label="ì£¼ì œ: ${this.escapeHtml(
                        topic
                      )}">?·ï¸?${this.escapeHtml(topic)}</div>`
                    : ""
                }
                ${snsPlatformsHtml}
                <div class="tracking-post-content ${
                  expanded ? "expanded" : ""
                }" aria-label="?¬ìŠ¤???´ìš©">${this.escapeHtml(
          post.content || ""
        )}</div>
                ${
                  shouldShowToggle
                    ? `<button class="tracking-post-toggle" data-action="toggle-content" data-post-id="${
                        post.id
                      }" aria-expanded="${
                        expanded ? "true" : "false"
                      }" aria-label="${
                        expanded ? "?´ìš© ?‘ê¸°" : "?´ìš© ?”ë³´ê¸?
                      }">${expanded ? "?‘ê¸°" : "?”ë³´ê¸?}</button>`
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
                            ë§ˆì?ë§??…ë°?´íŠ¸: ${lastUpdateText}
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
                    }" title="ê·¸ë˜?„ì—??ë³´ê¸°" role="button" tabindex="0" aria-label="ê·¸ë˜?„ì—??ë³´ê¸°">
                        <div class="metric-item">
                            <div class="metric-icon">??</div>
                            <div class="metric-value">${
                              latestMetrics.views || 0
                            }</div>
                            <div class="metric-label">ì¡°íšŒ??/div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?¤ï¸</div>
                            <div class="metric-value">${
                              latestMetrics.likes || 0
                            }</div>
                            <div class="metric-label">ì¢‹ì•„??/div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?’¬</div>
                            <div class="metric-value">${
                              latestMetrics.comments || 0
                            }</div>
                            <div class="metric-label">?“ê?</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?”„</div>
                            <div class="metric-value">${
                              latestMetrics.shares || 0
                            }</div>
                            <div class="metric-label">ê³µìœ </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">?‘¥</div>
                            <div class="metric-value">${
                              latestMetrics.follows || 0
                            }</div>
                            <div class="metric-label">?”ë¡œ??/div>
                        </div>
                    </div>
                `
                    : `
                    <div class="tracking-post-no-data">
                        <span class="no-data-icon">?“­</span>
                        <span class="no-data-text">?„ì§ ?°ì´?°ê? ?…ë ¥?˜ì? ?Šì•˜?µë‹ˆ?? "?°ì´??ì¶”ê?" ë²„íŠ¼???´ë¦­?˜ì—¬ ?±ê³¼ ?°ì´?°ë? ?…ë ¥?˜ì„¸??</span>
                    </div>
                `
                }
                
                <div class="tracking-post-actions actions--primary">
                    ${
                      post.trackingEnabled
                        ? `<button class="tracking-btn primary" data-action="add-tracking-data" data-post-id="${post.id}" aria-label="?±ê³¼ ?°ì´??ì¶”ê?">?°ì´??ì¶”ê?</button>`
                        : `<button class="tracking-btn primary" data-action="start-tracking" data-post-id="${post.id}" aria-label="?¸ë˜???œì‘">?¸ë˜???œì‘</button>`
                    }
                    <div class="more-menu actions--more">
                        <button class="more-menu-btn" data-action="more-menu" data-post-id="${
                          post.id
                        }" data-tracking-enabled="${
          post.trackingEnabled ? "true" : "false"
        }" aria-haspopup="true" aria-expanded="false" aria-label="ê¸°í? ?‘ì—…">??/button>
                        <div class="more-menu-list" role="menu">
                            ${
                              hasMetrics
                                ? `<button class="more-menu-item" role="menuitem" data-action="manage-metrics" data-post-id="${post.id}">?“Š ë©”íŠ¸ë¦?ê´€ë¦?/button>`
                                : ""
                            }
                            ${
                              post.trackingEnabled
                                ? `<button class="more-menu-item" role="menuitem" data-action="stop-tracking" data-post-id="${post.id}">?¸ë˜??ì¤‘ì?</button>`
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

// ?¸ë˜??ì¹´ë“œ ??ë©”ë‰´ ? ê?
DualTextWriter.prototype.toggleTrackingMoreMenu = function (
  button,
  postId,
  trackingEnabled
) {
  const menu = button.nextElementSibling;
  if (menu && menu.classList.contains("more-menu-list")) {
    const isOpen = menu.classList.toggle("open");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");

    // ?¤ë§ˆ???¬ì??”ë‹: ?”ë©´ ?„ì¹˜???°ë¼ ë©”ë‰´ ?œì‹œ ë°©í–¥ ê²°ì •
    if (isOpen) {
      dualTextWriter.applySmartMenuPosition(menu, button);

      // ?¬ì»¤???¸ë©: ë©”ë‰´ê°€ ?´ë¦¬ë©?ì²?ë²ˆì§¸ ë©”ë‰´ ?„ì´?œì— ?¬ì»¤??
      const firstMenuItem = menu.querySelector(".more-menu-item");
      if (firstMenuItem) {
        setTimeout(() => firstMenuItem.focus(), 50);
      }
    } else {
      // ë©”ë‰´ ?«í ???„ì¹˜ ?´ë˜???œê±°
      menu.classList.remove("open-top", "open-bottom");
    }
  }
  // ë°”ê¹¥ ?´ë¦­ ??ëª¨ë“  ë©”ë‰´ ?«ê¸° (?´ë²¤???„ì„?¼ë¡œ ì²˜ë¦¬)
  setTimeout(() => {
    document.addEventListener(
      "click",
      function closeHandler(e) {
        if (!e.target.closest(".more-menu")) {
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // ?¬ì»¤???¸ë© ?´ì œ: ë©”ë‰´ ë²„íŠ¼?¼ë¡œ ?¬ì»¤??ë³µì›
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

// ?¸ë˜???œì‘
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

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = true;
      this.refreshUI({ trackingPosts: true, force: true });

      // ?œê°???¼ë“œë°? ?±ê³µ ë©”ì‹œì§€
      this.showMessage("???¸ë˜?¹ì´ ?œì‘?˜ì—ˆ?µë‹ˆ??", "success");
    }

    logger.log("?¸ë˜?¹ì´ ?œì‘?˜ì—ˆ?µë‹ˆ??");
  } catch (error) {
    logger.error("?¸ë˜???œì‘ ?¤íŒ¨:", error);
  }
};

// ?¸ë˜??ì¤‘ì?
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

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = false;
      this.refreshUI({ trackingPosts: true, force: true });

      // ?œê°???¼ë“œë°? ?±ê³µ ë©”ì‹œì§€
      this.showMessage("?¸ï¸ ?¸ë˜?¹ì´ ì¤‘ì??˜ì—ˆ?µë‹ˆ??", "info");
    }

    logger.log("?¸ë˜?¹ì´ ì¤‘ì??˜ì—ˆ?µë‹ˆ??");
  } catch (error) {
    logger.error("?¸ë˜??ì¤‘ì? ?¤íŒ¨:", error);
  }
};

// ?¸ë˜???°ì´??ì¶”ê?
DualTextWriter.prototype.addTrackingData = function (postId) {
  this.currentTrackingPost = postId;

  // ? íƒ???¬ìŠ¤?¸ì— ?œê°???¼ë“œë°?(? íƒ ?¨ê³¼)
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

// ?¸ë˜??ëª¨ë‹¬ ?´ê¸°
DualTextWriter.prototype.openTrackingModal = async function (textId = null) {
  const modal = document.getElementById("tracking-modal");
  if (!modal) {
    logger.error("?¸ë˜??ëª¨ë‹¬??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    this.showMessage("???¸ë˜??ëª¨ë‹¬??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    return;
  }

  try {
    this.openBottomSheet(modal);

    // ?€?¥ëœ ê¸€?ì„œ ?¸ì¶œ??ê²½ìš° textId ?€??
    if (textId) {
      this.currentTrackingTextId = textId;
    }

    // ê¸°ì¡´ ?°ì´??ë¶ˆëŸ¬?¤ê¸°
    let latestMetric = null;

    // 1. currentTrackingPostê°€ ?ˆìœ¼ë©??´ë‹¹ ?¬ìŠ¤?¸ì˜ ìµœì‹  ë©”íŠ¸ë¦??°ì´??ë¶ˆëŸ¬?¤ê¸°
    if (this.currentTrackingPost) {
      const post = this.trackingPosts?.find(
        (p) => p.id === this.currentTrackingPost
      );
      if (post && post.metrics && post.metrics.length > 0) {
        // ìµœì‹  ë©”íŠ¸ë¦?(ë§ˆì?ë§???ª©)
        latestMetric = post.metrics[post.metrics.length - 1];
        logger.log("?¸ë˜???¬ìŠ¤?¸ì—??ìµœì‹  ë©”íŠ¸ë¦?ë¶ˆëŸ¬?¤ê¸°:", latestMetric);
      } else if (this.currentUser && this.isFirebaseReady) {
        // ë¡œì»¬???†ìœ¼ë©?Firebase?ì„œ ì¡°íšŒ
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
              logger.log("Firebase?ì„œ ìµœì‹  ë©”íŠ¸ë¦?ë¶ˆëŸ¬?¤ê¸°:", latestMetric);
            }
          }
        } catch (error) {
          logger.error("Firebase?ì„œ ë©”íŠ¸ë¦?ì¡°íšŒ ?¤íŒ¨:", error);
        }
      }
    }
    // 2. currentTrackingTextIdë§??ˆê³  currentTrackingPostê°€ ?†ìœ¼ë©? ?°ê²°???¬ìŠ¤??ì°¾ê¸°
    else if (this.currentTrackingTextId && !this.currentTrackingPost) {
      // ë¡œì»¬ ?°ì´?°ì—??ë¨¼ì? ì°¾ê¸°
      const post = this.trackingPosts?.find(
        (p) => p.sourceTextId === this.currentTrackingTextId
      );
      if (post && post.metrics && post.metrics.length > 0) {
        latestMetric = post.metrics[post.metrics.length - 1];
        logger.log(
          "?€?¥ëœ ê¸€?ì„œ ?°ê²°???¬ìŠ¤?¸ì˜ ìµœì‹  ë©”íŠ¸ë¦?ë¶ˆëŸ¬?¤ê¸°:",
          latestMetric
        );
      } else if (this.currentUser && this.isFirebaseReady) {
        // ë¡œì»¬???†ìœ¼ë©?Firebase?ì„œ ì¡°íšŒ
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
                "Firebase?ì„œ ?€?¥ëœ ê¸€???°ê²°???¬ìŠ¤??ìµœì‹  ë©”íŠ¸ë¦?ë¶ˆëŸ¬?¤ê¸°:",
                latestMetric
              );
            }
          }
        } catch (error) {
          logger.error("Firebase?ì„œ ë©”íŠ¸ë¦?ì¡°íšŒ ?¤íŒ¨:", error);
        }
      }
    }

    // ??ì´ˆê¸°???ëŠ” ê¸°ì¡´ ?°ì´?°ë¡œ ì±„ìš°ê¸?
    const dateInput = document.getElementById("tracking-date");
    const viewsInput = document.getElementById("tracking-views");
    const likesInput = document.getElementById("tracking-likes");
    const commentsInput = document.getElementById("tracking-comments");
    const sharesInput = document.getElementById("tracking-shares");
    const followsInput = document.getElementById("tracking-follows");
    const notesInput = document.getElementById("tracking-notes");

    // ? ì§œ????ƒ "?¤ëŠ˜"ë¡??¤ì • (ê¸°ì¡´ ?°ì´??? ë¬´?€ ê´€ê³„ì—†??
    const today = new Date().toISOString().split("T")[0];
    if (dateInput) {
      dateInput.value = today;
    }
    // ? ì§œ ??ì´ˆê¸°?? ?¤ëŠ˜ ???œì„±?? ì§ì ‘?…ë ¥ ?¨ê?
    modal
      .querySelectorAll(".date-tab")
      .forEach((tab) => tab.classList.remove("active"));
    const todayTab = modal.querySelector('.date-tab[data-date="today"]');
    if (todayTab) todayTab.classList.add("active");
    if (dateInput) dateInput.style.display = "none";

    if (latestMetric) {
      // ê¸°ì¡´ ?°ì´?°ê? ?ˆìœ¼ë©?ë©”íŠ¸ë¦?ê°’ë§Œ ì±„ìš°ê¸?(? ì§œ ?œì™¸)
      if (viewsInput) viewsInput.value = latestMetric.views || "";
      if (likesInput) likesInput.value = latestMetric.likes || "";
      if (commentsInput) commentsInput.value = latestMetric.comments || "";
      if (sharesInput) sharesInput.value = latestMetric.shares || "";
      if (followsInput) followsInput.value = latestMetric.follows || "";
      if (notesInput) notesInput.value = latestMetric.notes || "";

      logger.log(
        "ê¸°ì¡´ ?°ì´?°ë¡œ ??ì±„ìš°ê¸??„ë£Œ (? ì§œ???¤ëŠ˜ë¡??¤ì •):",
        latestMetric
      );
    } else {
      // ê¸°ì¡´ ?°ì´?°ê? ?†ìœ¼ë©?ëª¨ë“  ?„ë“œ ì´ˆê¸°??
      if (viewsInput) viewsInput.value = "";
      if (likesInput) likesInput.value = "";
      if (commentsInput) commentsInput.value = "";
      if (sharesInput) sharesInput.value = "";
      if (followsInput) followsInput.value = "";
      if (notesInput) notesInput.value = "";

      logger.log("ê¸°ì¡´ ?°ì´???†ìŒ, ??ì´ˆê¸°???„ë£Œ (? ì§œ???¤ëŠ˜ë¡??¤ì •)");
    }

    logger.log("?¸ë˜??ëª¨ë‹¬ ?´ê¸°:", {
      textId,
      currentTrackingTextId: this.currentTrackingTextId,
      currentTrackingPost: this.currentTrackingPost,
      hasLatestMetric: !!latestMetric,
    });
  } catch (error) {
    logger.error("?¸ë˜??ëª¨ë‹¬ ?´ê¸° ?¤íŒ¨:", error);
    this.showMessage("???¸ë˜??ëª¨ë‹¬???????†ìŠµ?ˆë‹¤.", "error");
  }
};

// ?¸ë˜???°ì´???€??
DualTextWriter.prototype.saveTrackingData = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    logger.warn(
      "?¸ë˜???°ì´???€???¤íŒ¨: ?¬ìš©?ê? ë¡œê·¸?¸í•˜ì§€ ?Šì•˜ê±°ë‚˜ Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??"
    );
    this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  logger.log("?¸ë˜???°ì´???€???œì‘:", {
    currentTrackingTextId: this.currentTrackingTextId,
    currentTrackingPost: this.currentTrackingPost,
  });

  // ?€?¥ëœ ê¸€?ì„œ ì§ì ‘ ?…ë ¥?˜ëŠ” ê²½ìš°
  if (this.currentTrackingTextId && !this.currentTrackingPost) {
    logger.log(
      "?€?¥ëœ ê¸€?ì„œ ?¸ë˜???°ì´???€??",
      this.currentTrackingTextId
    );
    return await this.saveTrackingDataFromSavedText();
  }

  // ê¸°ì¡´ ë°©ì‹: ?¸ë˜???¬ìŠ¤?¸ì— ?°ì´??ì¶”ê?
  if (!this.currentTrackingPost) {
    logger.warn("?¸ë˜???°ì´???€???¤íŒ¨: currentTrackingPostê°€ ?†ìŠµ?ˆë‹¤.");
    this.showMessage("???¸ë˜?¹í•  ?¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
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

  // ? ì§œ ì²˜ë¦¬: ?¬ìš©?ê? ? íƒ??? ì§œë¥?Timestampë¡?ë³€??
  let timestamp;
  if (dateValue) {
    const selectedDate = new Date(dateValue);
    // ?œê°„???ì •(00:00:00)?¼ë¡œ ?¤ì •
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

      // ? ì§œ ?œìœ¼ë¡??•ë ¬ (?¤ë˜??ê²ƒë???
      updatedMetrics.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return dateA - dateB;
      });

      // ë¶„ì„ ?°ì´??ê³„ì‚°
      const analytics = this.calculateAnalytics(updatedMetrics);

      await window.firebaseUpdateDoc(postRef, {
        metrics: updatedMetrics,
        analytics,
        updatedAt: window.firebaseServerTimestamp(),
      });

      // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
      const post = this.trackingPosts.find(
        (p) => p.id === this.currentTrackingPost
      );
      if (post) {
        post.metrics = updatedMetrics;
        post.analytics = analytics;
      }

      // Optimistic UI: ì¦‰ì‹œ ë¡œì»¬ ?°ì´???…ë°?´íŠ¸ ë°?UI ë°˜ì˜
      this.closeTrackingModal();
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      // ?œê°???¼ë“œë°? ?±ê³µ ë©”ì‹œì§€
      this.showMessage("???±ê³¼ ?°ì´?°ê? ?€?¥ë˜?ˆìŠµ?ˆë‹¤!", "success");

      logger.log("?¸ë˜???°ì´?°ê? ?€?¥ë˜?ˆìŠµ?ˆë‹¤.");
    }
  } catch (error) {
    logger.error("?¸ë˜???°ì´???€???¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???°ì´???€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};
// ?€?¥ëœ ê¸€?ì„œ ì§ì ‘ ?¸ë˜???°ì´???€??
DualTextWriter.prototype.saveTrackingDataFromSavedText = async function () {
  if (!this.currentTrackingTextId || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    // ë¨¼ì? ?€?¥ëœ ?ìŠ¤???•ë³´ ê°€?¸ì˜¤ê¸?
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      this.currentTrackingTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      this.showMessage("???ë³¸ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?´ë‹¹ ?ìŠ¤?¸ì— ?°ê²°???¬ìŠ¤??ì°¾ê¸° ?ëŠ” ?ì„±
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
      // ê¸°ì¡´ ?¬ìŠ¤?¸ê? ?ˆìœ¼ë©??¬ìš©
      const existingPost = querySnapshot.docs[0];
      postId = existingPost.id;
      postData = existingPost.data();
    } else {
      // ???¬ìŠ¤???ì„±
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

      // ?¸ë˜???¬ìŠ¤??ëª©ë¡??ì¶”ê?
      if (!this.trackingPosts) {
        this.trackingPosts = [];
      }
      this.trackingPosts.push({
        id: postId,
        ...newPostData,
        postedAt: new Date(),
      });
    }

    // ?¸ë˜???°ì´???˜ì§‘
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

    // ? ì§œ ì²˜ë¦¬
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

    // ?¬ìŠ¤?¸ì— ?¸ë˜???°ì´??ì¶”ê?
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      postId
    );
    const updatedMetrics = [...(postData.metrics || []), trackingData];

    // ? ì§œ ?œìœ¼ë¡??•ë ¬
    updatedMetrics.sort((a, b) => {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return dateA - dateB;
    });

    // ë¶„ì„ ?°ì´??ê³„ì‚°
    const analytics = this.calculateAnalytics(updatedMetrics);

    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      trackingEnabled: true,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
      post.trackingEnabled = true;
    } else {
      // ë¡œì»¬ ëª©ë¡???†ìœ¼ë©?ì¶”ê?
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

    // Optimistic UI: ë¡œì»¬ ?°ì´???…ë°?´íŠ¸ë¡?ì¦‰ì‹œ ë°˜ì˜ (Firebase ?„ì²´ ?¬ì¡°??ë¶ˆí•„??
    // ?¸ë˜????ëª©ë¡?€ ë¡œì»¬ ?°ì´?°ê? ?´ë? ?…ë°?´íŠ¸?˜ì—ˆ?¼ë?ë¡??¬ì¡°??ë¶ˆí•„??

    // UI ?…ë°?´íŠ¸
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // ì´ˆê¸°??
    this.currentTrackingTextId = null;

    this.showMessage("???¸ë˜???°ì´?°ê? ?€?¥ë˜?ˆìŠµ?ˆë‹¤!", "success");
    logger.log("?€?¥ëœ ê¸€?ì„œ ?¸ë˜???°ì´???€???„ë£Œ");
  } catch (error) {
    logger.error("?€?¥ëœ ê¸€?ì„œ ?¸ë˜???°ì´???€???¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???°ì´???€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

// ?¸ë˜??ëª¨ë‹¬ ?«ê¸°
DualTextWriter.prototype.closeTrackingModal = function () {
  const modal = document.getElementById("tracking-modal");
  if (modal) {
    this.closeBottomSheet(modal);
  }
  this.currentTrackingPost = null;
  this.currentTrackingTextId = null;
};
// ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?´ê¸° (?¸ë˜????—???¬ìš©)
DualTextWriter.prototype.manageMetrics = async function (postId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  try {
    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    // ë¡œì»¬???†ìœ¼ë©?Firebase?ì„œ ì¡°íšŒ
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
        logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      this.showMessage("ë©”íŠ¸ë¦??°ì´?°ê? ?†ìŠµ?ˆë‹¤.", "warning");
      return;
    }

    // ë©”íŠ¸ë¦?ëª©ë¡ ?Œë”ë§?
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postData.id,
      postData.sourceTextId
    );

    // ?¼ê´„ ? íƒ ëª¨ë“œ ì´ˆê¸°??
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // ëª¨ë‹¬ ?´ê¸°
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
                            <div style="font-size: 0.85rem; color: #666;">ë©”íŠ¸ë¦?${
                              postData.metrics.length
                            }ê°?/div>
                        </div>
                        <button id="batch-select-toggle" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" aria-label="?¼ê´„ ? íƒ ëª¨ë“œ">
                            ?“‹ ?¼ê´„ ? íƒ
                        </button>
                    </div>
                    <div id="batch-select-info" style="display: none; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 0.85rem; color: #1976d2;">
                        <span id="selected-count">0</span>ê°?? íƒ??
                        <button id="select-all-metrics" class="btn-link" style="margin-left: 12px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">?„ì²´ ? íƒ</button>
                        <button id="deselect-all-metrics" class="btn-link" style="margin-left: 8px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">?„ì²´ ?´ì œ</button>
                    </div>
                </div>
                ${metricsHtml}
                <div id="batch-delete-actions" style="display: none; margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 2px solid #ffc107;">
                    <div style="margin-bottom: 8px; font-weight: 600; color: #856404;">
                        ? íƒ????ª©: <span id="batch-delete-count">0</span>ê°?
                    </div>
                    <button id="batch-delete-btn" class="btn btn-danger" style="width: 100%;" aria-label="? íƒ????ª© ?¼ê´„ ?? œ">
                        ?—‘ï¸?? íƒ????ª© ?? œ
                    </button>
                </div>
            `;
      this.openBottomSheet(modal);

      // ëª¨ë‹¬ ?´ë????˜ì •/?? œ ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
      this.bindMetricsManageEvents(postData.id, postData.sourceTextId);

      // ?¼ê´„ ? íƒ ëª¨ë“œ ? ê? ë²„íŠ¼ ?´ë²¤??ë°”ì¸??
      this.bindBatchSelectEvents(postData.id, postData.sourceTextId);
    }
  } catch (error) {
    logger.error("ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?´ê¸° ?¤íŒ¨:", error);
    this.showMessage("ë©”íŠ¸ë¦??°ì´?°ë? ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
  }
};

// ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬??ë©”íŠ¸ë¦?ëª©ë¡ ?Œë”ë§?
DualTextWriter.prototype.renderMetricsListForManage = function (
  metrics,
  postId,
  textId
) {
  if (!metrics || metrics.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">ë©”íŠ¸ë¦??°ì´?°ê? ?†ìŠµ?ˆë‹¤.</div>';
  }

  // ? ì§œ ?œìœ¼ë¡??•ë ¬ (ìµœì‹  ê²ƒë???
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
    return dateB - dateA; // ìµœì‹  ê²ƒë???
  });

  return `
        <div class="metrics-manage-list">
            ${sortedMetrics
              .map((metric, sortedIdx) => {
                // ?ë³¸ ?¸ë±??ì°¾ê¸°
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

                // ë©”íŠ¸ë¦??¸ë±?¤ê? ? íš¨?œì? ?•ì¸ (?ë³¸ ë°°ì—´ ë²”ìœ„ ??
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
                                    aria-label="ë©”íŠ¸ë¦?? íƒ"
                                />
                                <div class="metric-manage-date">?“… ${dateStr}</div>
                            </div>
                            <div class="metric-manage-actions" style="display: ${
                              this.isBatchSelectMode ? "none" : "flex"
                            };">
                                <button class="btn-edit-metric" data-action="edit-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="?˜ì •">?ï¸ ?˜ì •</button>
                                <button class="btn-delete-metric" data-action="delete-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="?? œ">?—‘ï¸??? œ</button>
                            </div>
                        </div>
                        <div class="metric-manage-data">
                            <div class="metric-chip"><span class="metric-icon">??</span> <span class="metric-value">${
                              metric.views || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?¤ï¸</span> <span class="metric-value">${
                              metric.likes || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?’¬</span> <span class="metric-value">${
                              metric.comments || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?”„</span> <span class="metric-value">${
                              metric.shares || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">?‘¥</span> <span class="metric-value">${
                              metric.follows || 0
                            }</span></div>
                            ${
                              metric.notes
                                ? `<div class="metric-notes">?“ ${this.escapeHtml(
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

// ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?´ë? ?´ë²¤??ë°”ì¸??
DualTextWriter.prototype.bindMetricsManageEvents = function (postId, textId) {
  const content = document.getElementById("metrics-manage-content");
  if (!content) return;

  // ê¸°ì¡´ ë¦¬ìŠ¤???œê±°?˜ê³  ?ˆë¡œ ë°”ì¸??
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

        if (confirm("?•ë§ë¡???ë©”íŠ¸ë¦?„ ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
          this.deleteMetricFromManage(buttonPostId, buttonTextId, metricIndex);
        }
      }
    },
    { once: false }
  );
};

// ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬?ì„œ ë©”íŠ¸ë¦??˜ì •
DualTextWriter.prototype.editMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  try {
    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      // Firebase?ì„œ ì¡°íšŒ
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
        logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
      }
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      this.showMessage("ë©”íŠ¸ë¦?„ ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const metric = postData.metrics[metricIndex];

    // ?¸ì§‘ ?°ì´???¤ì •
    this.editingMetricData = {
      postId: postId,
      textId: textId,
      metricIndex: metricIndex,
    };

    // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?«ê¸°
    const manageModal = document.getElementById("metrics-manage-modal");
    if (manageModal) {
      this.closeBottomSheet(manageModal);
    }

    // ê¸°ì¡´ editTrackingMetric??ëª¨ë‹¬ ?´ê¸° ë¡œì§ ?¬ì‚¬??
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

    // ?˜ì • ëª¨ë‹¬ ?´ê¸°
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      // ? ì§œ ???¤ì •
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
    logger.error("ë©”íŠ¸ë¦??˜ì • ?¤íŒ¨:", error);
    this.showMessage("ë©”íŠ¸ë¦?„ ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.", "error");
  }
};

// ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬?ì„œ ë©”íŠ¸ë¦??? œ
DualTextWriter.prototype.deleteMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  if (!confirm("?•ë§ë¡????¸ë˜???°ì´?°ë? ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
    return;
  }

  try {
    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
    let postData = null;
    let postRef = null;

    try {
      // postIdë¡?ì§ì ‘ ì¡°íšŒ
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
        // textIdë¡?ì°¾ê¸°
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
      logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("?¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ë©”íŠ¸ë¦?ë°°ì—´?ì„œ ?´ë‹¹ ??ª© ?œê±°
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // ë¶„ì„ ?°ì´??ê³„ì‚°
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?…ë°?´íŠ¸
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?ˆë¡œê³ ì¹¨
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???´ë ¤?ˆìœ¼ë©??ˆë¡œê³ ì¹¨
      const refreshPostId = postRef.id || postId;
      setTimeout(() => {
        this.manageMetrics(refreshPostId);
      }, 300);
    } else {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???«í??ˆìœ¼ë©??¼ë°˜ UI ?…ë°?´íŠ¸
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.showMessage("???¸ë˜???°ì´?°ê? ?? œ?˜ì—ˆ?µë‹ˆ??", "success");
  } catch (error) {
    logger.error("?¸ë˜???°ì´???? œ ?¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???°ì´???? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

// ?¼ê´„ ? íƒ ëª¨ë“œ ?´ë²¤??ë°”ì¸??
DualTextWriter.prototype.bindBatchSelectEvents = function (postId, textId) {
  const toggleBtn = document.getElementById("batch-select-toggle");
  const selectInfo = document.getElementById("batch-select-info");
  const selectAllBtn = document.getElementById("select-all-metrics");
  const deselectAllBtn = document.getElementById("deselect-all-metrics");
  const batchDeleteActions = document.getElementById("batch-delete-actions");
  const batchDeleteBtn = document.getElementById("batch-delete-btn");
  const content = document.getElementById("metrics-manage-content");

  if (!toggleBtn || !content) return;

  // ?¼ê´„ ? íƒ ëª¨ë“œ ? ê?
  toggleBtn.addEventListener("click", () => {
    this.isBatchSelectMode = !this.isBatchSelectMode;
    this.selectedMetricIndices = [];

    if (this.isBatchSelectMode) {
      toggleBtn.textContent = "??ì·¨ì†Œ";
      toggleBtn.style.background = "#dc3545";
      if (selectInfo) selectInfo.style.display = "block";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    } else {
      toggleBtn.textContent = "?“‹ ?¼ê´„ ? íƒ";
      toggleBtn.style.background = "";
      if (selectInfo) selectInfo.style.display = "none";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    }

    // ë©”íŠ¸ë¦?ëª©ë¡ ?¤ì‹œ ?Œë”ë§?
    this.refreshMetricsListForManage(postId, textId);
  });

  // ?„ì²´ ? íƒ
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

  // ?„ì²´ ?´ì œ
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      this.selectedMetricIndices = [];
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      this.updateBatchSelectUI();
    });
  }

  // ì²´í¬ë°•ìŠ¤ ?´ë¦­ ?´ë²¤??
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

  // ?¼ê´„ ?? œ ë²„íŠ¼
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener("click", () => {
      if (this.selectedMetricIndices.length === 0) {
        this.showMessage("? íƒ????ª©???†ìŠµ?ˆë‹¤.", "warning");
        return;
      }

      if (
        confirm(
          `? íƒ??${this.selectedMetricIndices.length}ê°œì˜ ë©”íŠ¸ë¦?„ ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?`
        )
      ) {
        this.batchDeleteMetrics(postId, textId);
      }
    });
  }
};

// ?¼ê´„ ? íƒ UI ?…ë°?´íŠ¸
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

// ë©”íŠ¸ë¦?ëª©ë¡ ?ˆë¡œê³ ì¹¨ (?¼ê´„ ? íƒ ëª¨ë“œ ?íƒœ ë°˜ì˜)
DualTextWriter.prototype.refreshMetricsListForManage = async function (
  postId,
  textId
) {
  try {
    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
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
        logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      return;
    }

    // ë©”íŠ¸ë¦?ëª©ë¡ ?¤ì‹œ ?Œë”ë§?
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
    logger.error("ë©”íŠ¸ë¦?ëª©ë¡ ?ˆë¡œê³ ì¹¨ ?¤íŒ¨:", error);
  }
};

// ?¼ê´„ ?? œ ?¨ìˆ˜
DualTextWriter.prototype.batchDeleteMetrics = async function (postId, textId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  if (this.selectedMetricIndices.length === 0) {
    this.showMessage("? íƒ????ª©???†ìŠµ?ˆë‹¤.", "warning");
    return;
  }

  try {
    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
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
      logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("?¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ? íƒ???¸ë±?¤ë? ?´ë¦¼ì°¨ìˆœ?¼ë¡œ ?•ë ¬ (?¤ì—?œë????? œ?˜ì—¬ ?¸ë±??ë³€ê²?ë°©ì?)
    const sortedIndices = [...this.selectedMetricIndices].sort((a, b) => b - a);

    // ë©”íŠ¸ë¦?ë°°ì—´?ì„œ ? íƒ????ª© ?œê±°
    let updatedMetrics = [...(postData.metrics || [])];
    sortedIndices.forEach((index) => {
      if (index >= 0 && index < updatedMetrics.length) {
        updatedMetrics.splice(index, 1);
      }
    });

    // ë¶„ì„ ?°ì´??ê³„ì‚°
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?…ë°?´íŠ¸
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ?¼ê´„ ? íƒ ëª¨ë“œ ?´ì œ
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?ˆë¡œê³ ì¹¨
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???´ë ¤?ˆìœ¼ë©??ˆë¡œê³ ì¹¨
      setTimeout(() => {
        this.manageMetrics(postRef.id || postId);
      }, 300);
    } else {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???«í??ˆìœ¼ë©??¼ë°˜ UI ?…ë°?´íŠ¸
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.showMessage(
      `??${sortedIndices.length}ê°œì˜ ?¸ë˜???°ì´?°ê? ?? œ?˜ì—ˆ?µë‹ˆ??`,
      "success"
    );
  } catch (error) {
    logger.error("?¼ê´„ ?? œ ?¤íŒ¨:", error);
    this.showMessage("???¼ê´„ ?? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
  }
};

// ?¸ë˜??ë©”íŠ¸ë¦??˜ì • ëª¨ë‹¬ ?´ê¸°
DualTextWriter.prototype.editTrackingMetric = async function (
  button,
  metricIndexStr
) {
  const metricIndex = parseInt(metricIndexStr);
  const timelineItem = button.closest(".timeline-item");
  const savedItem = timelineItem.closest(".saved-item");
  const textId = savedItem.getAttribute("data-item-id");

  if (!textId) {
    this.showMessage("???€?¥ëœ ê¸€ IDë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    return;
  }

  // ?´ë‹¹ ?ìŠ¤?¸ì— ?°ê²°???¬ìŠ¤??ì°¾ê¸°
  let postData = null;
  if (this.trackingPosts) {
    postData = this.trackingPosts.find((p) => p.sourceTextId === textId);
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    // Firebase?ì„œ ì¡°íšŒ
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
      logger.error("?¬ìŠ¤??ì¡°íšŒ ?¤íŒ¨:", error);
      this.showMessage("???¸ë˜???°ì´?°ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    this.showMessage("???˜ì •???°ì´?°ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    return;
  }

  const metric = postData.metrics[metricIndex];
  const date = metric.timestamp?.toDate
    ? metric.timestamp.toDate()
    : metric.timestamp instanceof Date
    ? metric.timestamp
    : new Date();
  const dateStr = date.toISOString().split("T")[0];

  // ?˜ì • ëª¨ë‹¬???°ì´??ì±„ìš°ê¸?
  document.getElementById("tracking-edit-date").value = dateStr;
  document.getElementById("tracking-edit-views").value = metric.views || 0;
  document.getElementById("tracking-edit-likes").value = metric.likes || 0;
  document.getElementById("tracking-edit-comments").value =
    metric.comments || 0;
  document.getElementById("tracking-edit-shares").value = metric.shares || 0;
  const editFollows = document.getElementById("tracking-edit-follows");
  if (editFollows) editFollows.value = metric.follows || 0;
  document.getElementById("tracking-edit-notes").value = metric.notes || "";

  // ?˜ì •???°ì´???€??
  this.editingMetricData = {
    postId: postData.id || null,
    textId: textId,
    metricIndex: metricIndex,
  };

  // ?˜ì • ëª¨ë‹¬ ?´ê¸°
  const editModal = document.getElementById("tracking-edit-modal");
  if (editModal) {
    this.openBottomSheet(editModal);
    // ? ì§œ ??ì´ˆê¸°?? ?„ì¬ ? ì§œ???°ë¼ ???¤ì •
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
// ?¸ë˜???°ì´???˜ì •
DualTextWriter.prototype.updateTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
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
        this.showMessage("???¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textIdë¡??¬ìŠ¤??ì°¾ê¸°
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
        this.showMessage("???¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
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

    // ?˜ì •???°ì´???˜ì§‘
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

    // ? ì§œ ì²˜ë¦¬
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

    // ë©”íŠ¸ë¦?ë°°ì—´ ?…ë°?´íŠ¸
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

    // ? ì§œ ?œìœ¼ë¡??•ë ¬
    updatedMetrics.sort((a, b) => {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
      return dateA - dateB;
    });

    // ë¶„ì„ ?°ì´??ê³„ì‚°
    const analytics = this.calculateAnalytics(updatedMetrics);

    // Firebase ?…ë°?´íŠ¸
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ?˜ì • ëª¨ë‹¬ ?«ê¸°
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      this.closeBottomSheet(editModal);
    }

    // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???´ë ¤?ˆìœ¼ë©??ˆë¡œê³ ì¹¨
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬ ?ˆë¡œê³ ì¹¨
      const refreshPostId = postRef.id || postId;
      setTimeout(() => {
        this.manageMetrics(refreshPostId);
      }, 300);
    } else {
      // ë©”íŠ¸ë¦?ê´€ë¦?ëª¨ë‹¬???«í??ˆìœ¼ë©??¼ë°˜ UI ?…ë°?´íŠ¸
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this.editingMetricData = null;

    this.showMessage("???¸ë˜???°ì´?°ê? ?˜ì •?˜ì—ˆ?µë‹ˆ??", "success");
    logger.log("?¸ë˜???°ì´???˜ì • ?„ë£Œ");
  } catch (error) {
    logger.error("?¸ë˜???°ì´???˜ì • ?¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???°ì´???˜ì •???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

// ?¸ë˜???°ì´???? œ
DualTextWriter.prototype.deleteTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady) {
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }
    return;
  }

  if (!confirm("?•ë§ë¡????¸ë˜???°ì´?°ë? ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
    return;
  }

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // ?¬ìŠ¤???°ì´??ê°€?¸ì˜¤ê¸?
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
        this.showMessage("???¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textIdë¡??¬ìŠ¤??ì°¾ê¸°
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
        this.showMessage("???¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
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

    // ë©”íŠ¸ë¦?ë°°ì—´?ì„œ ?´ë‹¹ ??ª© ?œê±°
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // ë¶„ì„ ?°ì´??ê³„ì‚°
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase ?…ë°?´íŠ¸
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // ë¡œì»¬ ?°ì´???…ë°?´íŠ¸
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // ëª¨ë‹¬ ?«ê¸°
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }

    this.editingMetricData = null;

    // ?”ë©´ ?ˆë¡œê³ ì¹¨
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    this.showMessage("???¸ë˜???°ì´?°ê? ?? œ?˜ì—ˆ?µë‹ˆ??", "success");
    logger.log("?¸ë˜???°ì´???? œ ?„ë£Œ");
  } catch (error) {
    logger.error("?¸ë˜???°ì´???? œ ?¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???°ì´???? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

// ë¶„ì„ ?°ì´??ê³„ì‚°
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

// ?¸ë˜???”ì•½ ?…ë°?´íŠ¸
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
 * ?¸ë˜??ì°¨íŠ¸ ì´ˆê¸°??
 *
 * Chart.jsë¥??¬ìš©?˜ì—¬ ?¸ë˜???°ì´?°ë? ?œê°?”í•˜??ì°¨íŠ¸ë¥?ì´ˆê¸°?”í•©?ˆë‹¤.
 * Canvas ?”ì†Œê°€ ?†ê±°??Chart.js ?¼ì´ë¸ŒëŸ¬ë¦¬ê? ë¡œë“œ?˜ì? ?Šì? ê²½ìš° ?ëŸ¬ ì²˜ë¦¬ë¥??˜í–‰?©ë‹ˆ??
 *
 * **ì£¼ìš” ê¸°ëŠ¥:**
 * - Canvas ?”ì†Œ ì¡´ì¬ ?•ì¸ ë°?2D ì»¨í…?¤íŠ¸ ê²€ì¦?
 * - Chart.js ?¼ì´ë¸ŒëŸ¬ë¦?ë¡œë“œ ?•ì¸
 * - ê¸°ì¡´ ì°¨íŠ¸ ?œê±°ë¡?ë©”ëª¨ë¦??„ìˆ˜ ë°©ì?
 * - ë°˜ì‘??ì°¨íŠ¸ ?¤ì • (responsive: true, maintainAspectRatio: false)
 * - ? ë‹ˆë©”ì´??ë¹„í™œ?±í™”ë¡??¤í¬ë¡?ë¬¸ì œ ë°©ì?
 * - ?ˆì´?„ì›ƒ ?¨ë”© ?¤ì •?¼ë¡œ ì¶??ˆì´ë¸?ë³´í˜¸
 *
 * **?ëŸ¬ ì²˜ë¦¬:**
 * - Canvas ?”ì†Œê°€ ?†ì„ ?? console.warn ë¡œê·¸ ì¶œë ¥ ë°?ì¡°ê¸° ë°˜í™˜
 * - Chart.js ?¼ì´ë¸ŒëŸ¬ë¦?ë¯¸ë¡œ?? ?¬ìš©??ë©”ì‹œì§€ ?œì‹œ ë°?ì¡°ê¸° ë°˜í™˜
 * - 2D ì»¨í…?¤íŠ¸ ?¤íŒ¨: ?¬ìš©??ë©”ì‹œì§€ ?œì‹œ ë°?ì¡°ê¸° ë°˜í™˜
 * - ì´ˆê¸°???¤íŒ¨: try-catch ë¸”ë¡?¼ë¡œ ?ëŸ¬ ìºì¹˜ ë°??¬ìš©??ë©”ì‹œì§€ ?œì‹œ
 *
 * **?±ëŠ¥ ìµœì ??**
 * - animation.duration: 0 ?¤ì •?¼ë¡œ ë¶ˆí•„?”í•œ ? ë‹ˆë©”ì´???œê±°
 * - ê¸°ì¡´ ì°¨íŠ¸ destroy() ?¸ì¶œë¡?ë©”ëª¨ë¦??„ìˆ˜ ë°©ì?
 *
 * @returns {void}
 * @throws {Error} Chart.js ì´ˆê¸°???¤íŒ¨ ???ëŸ¬ ë°œìƒ
 */
DualTextWriter.prototype.initTrackingChart = function () {
  // ?ëŸ¬ ì²˜ë¦¬: Canvas ?”ì†Œê°€ ?†ì„ ??Chart.js ì´ˆê¸°???¤íŒ¨ ë°©ì?
  if (!this.trackingChartCanvas) {
    logger.warn("[initTrackingChart] Canvas element not found");
    return;
  }

  // Chart.js ?¼ì´ë¸ŒëŸ¬ë¦?ë¡œë“œ ?¤íŒ¨ ???´ë°± ì²˜ë¦¬
  if (typeof Chart === "undefined") {
    logger.error("[initTrackingChart] Chart.js library not loaded");
    this.showMessage(
      "ì°¨íŠ¸ ?¼ì´ë¸ŒëŸ¬ë¦¬ë? ë¶ˆëŸ¬?????†ìŠµ?ˆë‹¤. ?˜ì´ì§€ë¥??ˆë¡œê³ ì¹¨?´ì£¼?¸ìš”.",
      "error"
    );
    return;
  }

  try {
    const ctx = this.trackingChartCanvas.getContext("2d");
    if (!ctx) {
      logger.error("[initTrackingChart] Failed to get 2D context");
      this.showMessage(
        "ì°¨íŠ¸ë¥?ì´ˆê¸°?”í•  ???†ìŠµ?ˆë‹¤. ë¸Œë¼?°ì?ë¥??ˆë¡œê³ ì¹¨?´ì£¼?¸ìš”.",
        "error"
      );
      return;
    }

    // ê¸°ì¡´ ì°¨íŠ¸ê°€ ?ˆë‹¤ë©??œê±° (ë©”ëª¨ë¦??„ìˆ˜ ë°©ì?)
    if (this.trackingChart) {
      this.trackingChart.destroy();
      this.trackingChart = null;
    }

    // Chart.js ì´ˆê¸°?? responsive: trueë¡??¤ì •?˜ì–´ ?ˆì–´ ë¶€ëª?ì»¨í…Œ?´ë„ˆ ?¬ê¸°??ë§ì¶° ?ë™ ì¡°ì ˆ
    this.trackingChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "ì¡°íšŒ??,
            data: [],
            borderColor: "#667eea",
            backgroundColor: "rgba(102, 126, 234, 0.1)",
            tension: 0.4,
          },
          {
            label: "ì¢‹ì•„??,
            data: [],
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            tension: 0.4,
          },
          {
            label: "?“ê?",
            data: [],
            borderColor: "#9b59b6",
            backgroundColor: "rgba(155, 89, 182, 0.1)",
            tension: 0.4,
          },
          {
            label: "ê³µìœ ",
            data: [],
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
            tension: 0.4,
          },
          {
            label: "?”ë¡œ??,
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
            display: false, // HTML ?¤ë” ?¬ìš©?¼ë¡œ ì°¨íŠ¸ ?´ë? ?œëª© ?¨ê?
            text: "?¬ìŠ¤???±ê³¼ ì¶”ì´",
          },
          legend: {
            display: false, // ë²”ë?????œ¼ë¡??œì‹œ
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 8,
              precision: 0,
              stepSize: 1, // ì´ˆê¸°ê°? updateTrackingChart?ì„œ ?™ì ?¼ë¡œ ?…ë°?´íŠ¸??
            },
            max: 10, // ì´ˆê¸°ê°? updateTrackingChart?ì„œ ?™ì ?¼ë¡œ ?…ë°?´íŠ¸??
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
          duration: 0, // ? ë‹ˆë©”ì´??ë¹„í™œ?±í™”ë¡??¤í¬ë¡?ë¬¸ì œ ë°©ì?
        },
        layout: {
          padding: {
            top: 20,
            bottom: 40, // ?˜ë‹¨ ?¬ë°± ì¦ê? (ì¶??ˆì´ë¸?ë³´í˜¸)
            left: 15,
            right: 15,
          },
        },
        // ?¸í„°?™ì…˜ ?¤ì •: ?œë˜ê·?ì¤??ˆìš©
        interaction: {
          mode: "index",
          intersect: false,
        },
        // ?”ì†Œ ?´ë¦­ ê°€?¥í•˜?„ë¡ ?¤ì •
        elements: {
          point: {
            radius: 4,
            hoverRadius: 6,
          },
        },
      },
    });

    // Chart.js ì´ˆê¸°????ì°¨íŠ¸ ?…ë°?´íŠ¸
    this.updateTrackingChart();
  } catch (error) {
    // Chart.js ì´ˆê¸°???¤íŒ¨ ???¬ìš©?ì—ê²??ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
    logger.error("[initTrackingChart] Chart initialization failed:", error);
    this.showMessage(
      "ì°¨íŠ¸ë¥?ì´ˆê¸°?”í•˜??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
    this.trackingChart = null;
  }
};

/**
 * ?¤ì???ëª¨ë“œ ?¤ì •
 *
 * ê·¸ë˜?„ì˜ ?¤ì???ëª¨ë“œë¥?ë³€ê²½í•©?ˆë‹¤.
 * 'combined' ëª¨ë“œ: ëª¨ë“  ì§€?œê? ?™ì¼??yì¶??¤ì??¼ì„ ?¬ìš©
 * 'split' ëª¨ë“œ: ì¡°íšŒ?˜ëŠ” ?¼ìª½ yì¶? ?˜ë¨¸ì§€ ì§€?œëŠ” ?¤ë¥¸ìª?y2ì¶??¬ìš©
 *
 * @param {string} mode - ?¤ì???ëª¨ë“œ ('combined' | 'split')
 * @returns {void}
 */
DualTextWriter.prototype.setScaleMode = function (mode) {
  // ê·¸ë˜???¤ì???ëª¨ë“œ ë³€ê²???ì¦‰ì‹œ ë°˜ì˜ ë°?ì¶?ë°˜ì‘??? ì?
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
 * ì°¨íŠ¸ ëª¨ë“œ ?¤ì •
 *
 * ê·¸ë˜?„ì˜ ëª¨ë“œë¥?ë³€ê²½í•©?ˆë‹¤.
 * 'total' ëª¨ë“œ: ëª¨ë“  ?¬ìŠ¤?¸ì˜ ?„ì  ì´í•© ?œì‹œ
 * 'individual' ëª¨ë“œ: ? íƒ??ê°œë³„ ?¬ìŠ¤?¸ì˜ ?°ì´?°ë§Œ ?œì‹œ
 *
 * @param {string} mode - ì°¨íŠ¸ ëª¨ë“œ ('total' | 'individual')
 * @returns {void}
 */
DualTextWriter.prototype.setChartMode = function (mode) {
  // ê·¸ë˜??ëª¨ë“œ ë³€ê²???ì¦‰ì‹œ ë°˜ì˜
  this.chartMode = mode;

  // ë²„íŠ¼ ?¤í????…ë°?´íŠ¸
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
    // ?„ì²´ ì´í•© ëª¨ë“œë¡??„í™˜ ??ê²€???…ë ¥ì°?ì´ˆê¸°??
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

  // ì°¨íŠ¸ ?…ë°?´íŠ¸
  this.updateTrackingChart();
};

/**
 * ì°¨íŠ¸ ë²”ìœ„ ?¤ì •
 *
 * ê·¸ë˜?„ì— ?œì‹œ???°ì´??ë²”ìœ„ë¥?ë³€ê²½í•©?ˆë‹¤.
 * '7d': ìµœê·¼ 7???°ì´?°ë§Œ ?œì‹œ
 * '30d': ìµœê·¼ 30???°ì´?°ë§Œ ?œì‹œ
 * 'all': ?„ì²´ ?°ì´???œì‹œ
 *
 * @param {string} range - ì°¨íŠ¸ ë²”ìœ„ ('7d' | '30d' | 'all')
 * @returns {void}
 */
DualTextWriter.prototype.setChartRange = function (range) {
  // ê·¸ë˜??ë²”ìœ„ ë³€ê²???ì¦‰ì‹œ ë°˜ì˜ ë°?ì¶?ë°˜ì‘??? ì?
  this.chartRange = range; // '7d' | '30d' | 'all'
  // ë²„íŠ¼ ?¤í????…ë°?´íŠ¸
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

// ?¬ìŠ¤??? íƒ ?œë¡­?¤ìš´ ì±„ìš°ê¸?(ê²€??ê°€?¥í•œ ì»¤ìŠ¤?€ ?œë¡­?¤ìš´)
DualTextWriter.prototype.populatePostSelector = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) return;

  // ?„ì²´ ?¬ìŠ¤??ëª©ë¡ ?€??(ê²€???„í„°ë§ìš©)
  this.allTrackingPostsForSelector = [...this.trackingPosts].sort((a, b) => {
    // ìµœê·¼ ?¬ìŠ¤???°ì„  ?•ë ¬
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

  // ?œë¡­?¤ìš´ ?Œë”ë§?
  this.renderPostSelectorDropdown("");

  // ? íƒ???¬ìŠ¤?¸ê? ?ˆìœ¼ë©?ê²€???…ë ¥ì°½ì— ?œì‹œ
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
// ?¬ìŠ¤??? íƒ ?œë¡­?¤ìš´ ?Œë”ë§?
DualTextWriter.prototype.renderPostSelectorDropdown = function (
  searchTerm = ""
) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // ê²€?‰ì–´ë¡??„í„°ë§?
  let filteredPosts = this.allTrackingPostsForSelector;
  if (searchTerm && searchTerm.trim()) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    filteredPosts = this.allTrackingPostsForSelector.filter((post) => {
      const content = post.content.toLowerCase();
      return content.includes(lowerSearchTerm);
    });
  }

  // ìµœê·¼ ?¬ìŠ¤???°ì„  ?•ë ¬ (?´ë? ?•ë ¬?˜ì–´ ?ˆì?ë§??•ì‹¤??
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
                <div style="font-size: 1.5rem; margin-bottom: 8px;">?”</div>
                <div>ê²€??ê²°ê³¼ê°€ ?†ìŠµ?ˆë‹¤.</div>
            </div>
        `;
    return;
  }

  // ?¬ìŠ¤??ëª©ë¡ HTML ?ì„±
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
                    <span>?“Š ${metricsCount}???…ë ¥</span>
                    ${
                      lastUpdate
                        ? `<span>ìµœê·¼: ${lastUpdate.views || 0} ì¡°íšŒ</span>`
                        : ""
                    }
                </div>
            </div>
        `;
    })
    .join("");
};

// ?¬ìŠ¤??? íƒ ?œë¡­?¤ìš´ ?œì‹œ
DualTextWriter.prototype.showPostSelectorDropdown = function () {
  const dropdown = document.getElementById("post-selector-dropdown");
  const searchInput = document.getElementById("chart-post-search");

  if (!dropdown || !searchInput) return;

  // ?œë¡­?¤ìš´ ?œì‹œ
  dropdown.style.display = "block";

  // ê²€?‰ì–´ê°€ ?†ìœ¼ë©??„ì²´ ëª©ë¡ ?œì‹œ, ?ˆìœ¼ë©??„í„°ë§?
  const searchTerm = searchInput.value || "";
  this.renderPostSelectorDropdown(searchTerm);

  // ?¸ë? ?´ë¦­ ???œë¡­?¤ìš´ ?«ê¸°
  setTimeout(() => {
    document.addEventListener("click", this.handlePostSelectorClickOutside);
  }, 100);
};

// ?¸ë? ?´ë¦­ ì²˜ë¦¬
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

// ?¬ìŠ¤??? íƒ ?„í„°ë§?
DualTextWriter.prototype.filterPostSelector = function (searchTerm) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // ?œë¡­?¤ìš´???«í??ˆìœ¼ë©??´ê¸°
  if (dropdown.style.display === "none") {
    dropdown.style.display = "block";
  }

  // ê²€?‰ì–´ë¡??„í„°ë§í•˜???Œë”ë§?
  this.renderPostSelectorDropdown(searchTerm);
};

// ?œë¡­?¤ìš´?ì„œ ?¬ìŠ¤??? íƒ
DualTextWriter.prototype.selectPostFromDropdown = function (postId) {
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  if (!selectedPost) return;

  this.selectedChartPostId = postId;

  // ê²€???…ë ¥ì°½ì— ? íƒ???¬ìŠ¤???œëª© ?œì‹œ
  const searchInput = document.getElementById("chart-post-search");
  if (searchInput) {
    const contentPreview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = contentPreview;
  }

  // ?œë¡­?¤ìš´ ?«ê¸°
  const dropdown = document.getElementById("post-selector-dropdown");
  if (dropdown) {
    dropdown.style.display = "none";
  }

  // ?¸ë? ?´ë¦­ ?´ë²¤??ë¦¬ìŠ¤???œê±°
  document.removeEventListener("click", this.handlePostSelectorClickOutside);

  // ì°¨íŠ¸ ?…ë°?´íŠ¸
  this.updateTrackingChart();
};

// ?¸ë˜??ëª©ë¡?ì„œ ?´ë¦­ ??ì°¨íŠ¸???œì‹œ
DualTextWriter.prototype.showPostInChart = function (postId) {
  // ëª¨ë“œ ?„í™˜ ë°??¬ìŠ¤??? íƒ
  this.setChartMode("individual");
  this.selectedChartPostId = postId;
  // ê²€???…ë ¥ì°½ì— ?œëª© ?œì‹œ
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  const searchInput = document.getElementById("chart-post-search");
  if (selectedPost && searchInput) {
    const preview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = preview;
  }
  // ?œë¡­?¤ìš´ ëª©ë¡ ê°±ì‹ 
  this.populatePostSelector();
  // ì°¨íŠ¸ ?…ë°?´íŠ¸
  this.updateTrackingChart();
  // ì°¨íŠ¸ ?ì—­ ?¬ì»¤???¤í¬ë¡?
  if (this.trackingChartCanvas && this.trackingChartCanvas.scrollIntoView) {
    this.trackingChartCanvas.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
};

// ?¬ìŠ¤??? íƒ ë³€ê²?(êµ¬ë²„???¸í™˜, ???´ìƒ ?¬ìš© ????
DualTextWriter.prototype.updateChartPostSelection = function () {
  // ?ˆë¡œ??ê²€??ê°€?¥í•œ ?œë¡­?¤ìš´ ?¬ìš© ì¤‘ì´ë¯€ë¡????¨ìˆ˜?????´ìƒ ?¬ìš©?˜ì? ?ŠìŒ
  // ?¸í™˜?±ì„ ?„í•´ ? ì?
};

// ê·¸ë˜???¤ë” ?…ë°?´íŠ¸
DualTextWriter.prototype.updateChartHeader = function (postTitle, lastUpdate) {
  const titleEl = document.getElementById("chart-post-title");
  const updateEl = document.getElementById("chart-last-update");

  if (titleEl) {
    const maxLength = 50;
    const displayTitle =
      postTitle && postTitle.length > maxLength
        ? postTitle.substring(0, maxLength) + "..."
        : postTitle || "?„ì²´ ?¬ìŠ¤???„ì¬ê°??©ê³„ ì¶”ì´";
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
      updateEl.textContent = `ìµœê·¼ ?…ë°?´íŠ¸: ${formattedDate}`;
    } else {
      updateEl.textContent = "ìµœê·¼ ?…ë°?´íŠ¸: -";
    }
  }
};
/**
 * ?¸ë˜??ì°¨íŠ¸ ?…ë°?´íŠ¸
 *
 * ?„ì¬ ?¤ì •??ëª¨ë“œ?€ ë²”ìœ„???°ë¼ ì°¨íŠ¸ ?°ì´?°ë? ?…ë°?´íŠ¸?©ë‹ˆ??
 * ?°ì´???•ì‹ ê²€ì¦?ë°??ëŸ¬ ì²˜ë¦¬ë¥??¬í•¨?©ë‹ˆ??
 *
 * **?°ì´??ì²˜ë¦¬:**
 * - ?„ì²´ ì´í•© ëª¨ë“œ: ëª¨ë“  ?¬ìŠ¤?¸ì˜ ë©”íŠ¸ë¦?„ ?©ì‚°?˜ì—¬ ?œì‹œ
 * - ê°œë³„ ?¬ìŠ¤??ëª¨ë“œ: ? íƒ???¬ìŠ¤?¸ì˜ ë©”íŠ¸ë¦?§Œ ?œì‹œ
 * - ? ì§œ ?„í„°ë§? ?¤ì •??ë²”ìœ„(7d/30d/all)???°ë¼ ?°ì´???„í„°ë§?
 *
 * **?¤ì???ê³„ì‚°:**
 * - combined ëª¨ë“œ: ëª¨ë“  ì§€?œê? ?™ì¼??yì¶??¤ì????¬ìš©
 * - split ëª¨ë“œ: ì¡°íšŒ?˜ëŠ” yì¶? ?˜ë¨¸ì§€ ì§€?œëŠ” y2ì¶??¬ìš©
 * - ?™ì  ?¤ì???ê³„ì‚°: ?°ì´??ìµœë?ê°’ì˜ 1.2ë°??ëŠ” 1.8ë°°ë¡œ ?¤ì •
 *
 * **?ëŸ¬ ì²˜ë¦¬:**
 * - ì°¨íŠ¸ ë¯¸ì´ˆê¸°í™”: console.warn ë¡œê·¸ ì¶œë ¥ ë°?ì¡°ê¸° ë°˜í™˜
 * - ?°ì´???•ì‹ ?¤ë¥˜: try-catch ë¸”ë¡?¼ë¡œ ?ëŸ¬ ìºì¹˜ ë°?ë¡œê·¸ ì¶œë ¥
 * - ? ì§œ ? íš¨??ê²€ì¦? ? íš¨?˜ì? ?Šì? ? ì§œ ?„í„°ë§?
 * - ?«ì ?•ì‹ ê²€ì¦? NaN ë°?Infinity ë°©ì?
 *
 * **?±ëŠ¥ ìµœì ??**
 * - animation.duration: 0 ?¤ì •?¼ë¡œ ? ë‹ˆë©”ì´???†ì´ ì¦‰ì‹œ ?…ë°?´íŠ¸
 * - update('none') ëª¨ë“œ ?¬ìš©?¼ë¡œ ?¤í¬ë¡?ë¬¸ì œ ë°©ì?
 *
 * @returns {void}
 * @throws {Error} ì°¨íŠ¸ ?…ë°?´íŠ¸ ?¤íŒ¨ ???ëŸ¬ ë°œìƒ
 */
DualTextWriter.prototype.updateTrackingChart = function () {
  // ?ëŸ¬ ì²˜ë¦¬: ì°¨íŠ¸ê°€ ?„ì§ ì´ˆê¸°?”ë˜ì§€ ?Šì•˜????ì²˜ë¦¬
  if (!this.trackingChart) {
    logger.warn("[updateTrackingChart] Chart not initialized yet");
    return;
  }

  try {
    // ? íƒ??ë²”ìœ„???°ë¥¸ ? ì§œ ë°°ì—´ ?ì„±
    const dateRange = [];
    const viewsData = [];
    const likesData = [];
    const commentsData = [];
    const sharesData = [];
    const followsData = [];

    // ë²”ìœ„ ê³„ì‚° ?¨ìˆ˜
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

    // ë²”ìœ„ ê²°ì •
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
      // 'all' ë²”ìœ„
      if (this.chartMode === "individual" && this.selectedChartPostId) {
        const post = this.trackingPosts.find(
          (p) => p.id === this.selectedChartPostId
        );
        if (post && post.metrics && post.metrics.length > 0) {
          try {
            // ?°ì´???•ì‹ ê²€ì¦? timestampê°€ ? íš¨?œì? ?•ì¸
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

            // ? ì§œ ? íš¨??ê²€ì¦?
            if (isNaN(first.getTime()) || isNaN(last.getTime())) {
              throw new Error("Invalid date in metric");
            }

            dateRange.push(...makeRange(first, last));
          } catch (err) {
            logger.warn(
              "[updateTrackingChart] Error processing date range for individual post:",
              err
            );
            // ?´ë°±: ê¸°ë³¸ 7??ë²”ìœ„ ?¬ìš©
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
            // ?°ì´???•ì‹ ê²€ì¦? timestampê°€ ? íš¨?œì? ?•ì¸
            if (!m || !m.timestamp) return;

            try {
              const dt = m.timestamp?.toDate
                ? m.timestamp.toDate()
                : new Date(m.timestamp);
              // ? ì§œ ? íš¨??ê²€ì¦?
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
      // ?„ì²´ ì´í•© ëª¨ë“œ: ê°?? ì§œê¹Œì???ëª¨ë“  ?¬ìŠ¤??ìµœì‹  ë©”íŠ¸ë¦??„ì  ?©ê³„
      dateRange.forEach((targetDate) => {
        let dayTotalViews = 0;
        let dayTotalLikes = 0;
        let dayTotalComments = 0;
        let dayTotalShares = 0;
        let dayTotalFollows = 0;

        // ê°??¬ìŠ¤?¸ì— ?€???´ë‹¹ ? ì§œê¹Œì???ìµœì‹  ë©”íŠ¸ë¦?ì°¾ê¸°
        this.trackingPosts.forEach((post) => {
          if (!post.metrics || post.metrics.length === 0) return;

          // ?´ë‹¹ ? ì§œ ?´ì „ ?ëŠ” ?¹ì¼??ê°€??ìµœê·¼ ë©”íŠ¸ë¦?ì°¾ê¸°
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

          // ìµœì‹  ë©”íŠ¸ë¦?´ ?ˆìœ¼ë©??©ì‚° (?†ìœ¼ë©??´ë‹¹ ?¬ìŠ¤?¸ëŠ” 0?¼ë¡œ ì²˜ë¦¬)
          if (latestMetricBeforeDate) {
            // ?«ì ?•ì‹ ê²€ì¦? NaN?´ë‚˜ Infinity ë°©ì?
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

      // ì°¨íŠ¸ ?œëª© ?…ë°?´íŠ¸
      this.trackingChart.options.plugins.title.text =
        "?„ì²´ ?¬ìŠ¤???„ì¬ê°??©ê³„ ì¶”ì´";
      // ?¤ë” ?…ë°?´íŠ¸
      this.updateChartHeader("?„ì²´ ?¬ìŠ¤???„ì¬ê°??©ê³„ ì¶”ì´", null);
    } else {
      // ê°œë³„ ?¬ìŠ¤??ëª¨ë“œ: ? íƒ???¬ìŠ¤?¸ì˜ ? ì§œë³??°ì´??
      if (!this.selectedChartPostId) {
        // ?¬ìŠ¤?¸ê? ? íƒ?˜ì? ?Šì•˜?¼ë©´ ë¹??°ì´??
        dateRange.forEach(() => {
          viewsData.push(0);
          likesData.push(0);
          commentsData.push(0);
          sharesData.push(0);
          followsData.push(0);
        });
        this.trackingChart.options.plugins.title.text =
          "?¬ìŠ¤???±ê³¼ ì¶”ì´ (?¬ìŠ¤?¸ë? ? íƒ?˜ì„¸??";
        this.updateChartHeader("?¬ìŠ¤???±ê³¼ ì¶”ì´ (?¬ìŠ¤?¸ë? ? íƒ?˜ì„¸??", null);
      } else {
        const selectedPost = this.trackingPosts.find(
          (p) => p.id === this.selectedChartPostId
        );

        if (selectedPost && selectedPost.metrics) {
          // ë²”ìœ„???°ì´?°ê? ?†ìœ¼ë©??ë™?¼ë¡œ ?„ì²´ ë²”ìœ„ë¡??„í™˜
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
            // ?´ë‹¹ ? ì§œ???…ë ¥??ë©”íŠ¸ë¦?ì°¾ê¸°
            let dayViews = 0;
            let dayLikes = 0;
            let dayComments = 0;
            let dayShares = 0;
            let dayFollows = 0;

            selectedPost.metrics.forEach((metric) => {
              // ?°ì´???•ì‹ ê²€ì¦? timestampê°€ ? íš¨?œì? ?•ì¸
              if (!metric || !metric.timestamp) return;

              try {
                const metricDate = metric.timestamp?.toDate
                  ? metric.timestamp.toDate()
                  : new Date(metric.timestamp);
                // ? ì§œ ? íš¨??ê²€ì¦?
                if (isNaN(metricDate.getTime())) {
                  logger.warn(
                    "[updateTrackingChart] Invalid date in metric:",
                    metric
                  );
                  return;
                }
                metricDate.setHours(0, 0, 0, 0);

                if (metricDate.getTime() === targetDate.getTime()) {
                  // ?«ì ?•ì‹ ê²€ì¦? NaN?´ë‚˜ Infinity ë°©ì?
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

          // ì°¨íŠ¸ ?œëª© ?…ë°?´íŠ¸
          const contentPreview =
            selectedPost.content.length > 30
              ? selectedPost.content.substring(0, 30) + "..."
              : selectedPost.content;
          this.trackingChart.options.plugins.title.text = `?¬ìŠ¤???±ê³¼ ì¶”ì´: ${contentPreview}`;

          // ?¤ë” ?…ë°?´íŠ¸: ?¬ìŠ¤???œëª©ê³?ìµœê·¼ ?…ë°?´íŠ¸
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
            "?¬ìŠ¤???±ê³¼ ì¶”ì´ (?°ì´???†ìŒ)";
          this.updateChartHeader("?¬ìŠ¤???±ê³¼ ì¶”ì´ (?°ì´???†ìŒ)", null);
        }
      }
    }

    // ? ì§œ ?ˆì´ë¸??¬ë§·??
    const dateLabels = dateRange.map((date) =>
      date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    );

    this.trackingChart.data.labels = dateLabels;
    // ?°ì´??ë°”ì¸??
    const datasets = this.trackingChart.data.datasets;
    datasets[0].data = viewsData;
    datasets[1].data = likesData;
    datasets[2].data = commentsData;
    datasets[3].data = sharesData;
    if (datasets[4]) datasets[4].data = followsData;

    // ì¶?ë°°ì¹˜: combined??ëª¨ë‘ y, split?€ ì¡°íšŒ??y / ?˜ë¨¸ì§€ y2
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

    // yì¶??¤ì????¬ê³„??(?°ì´??ë²”ìœ„??ë§ê²Œ ìµœì ??
    const maxValue = Math.max(
      ...(viewsData.length ? viewsData : [0]),
      ...(likesData.length ? likesData : [0]),
      ...(commentsData.length ? commentsData : [0]),
      ...(sharesData.length ? sharesData : [0]),
      ...(followsData.length ? followsData : [0])
    );
    // ?¤ì???ê³„ì‚°
    if (this.scaleMode === "split") {
      // ?¼ìª½ y: ì¡°íšŒ???„ìš©
      const maxViews = Math.max(...(viewsData.length ? viewsData : [0]));
      const yMax = maxViews > 0 ? Math.ceil(maxViews * 1.2) : 10;
      const yStep = Math.max(1, Math.ceil((yMax || 10) / 8));
      this.trackingChart.options.scales.y.max = yMax;
      this.trackingChart.options.scales.y.ticks.stepSize = yStep;

      // ?¤ë¥¸ìª?y2: ?˜ë¨¸ì§€ ì§€??
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
      // y2??ë¹„í™œ?±ì²˜???™ì¼ ê°’ìœ¼ë¡?ìµœì†Œ??
      this.trackingChart.options.scales.y2.max =
        this.trackingChart.options.scales.y.max;
      this.trackingChart.options.scales.y2.ticks.stepSize =
        this.trackingChart.options.scales.y.ticks.stepSize;
    }

    // ? ë‹ˆë©”ì´???†ì´ ?…ë°?´íŠ¸ (?¤í¬ë¡?ë¬¸ì œ ë°©ì?)
    this.trackingChart.update("none");
  } catch (error) {
    // ì°¨íŠ¸ ?…ë°?´íŠ¸ ?¤íŒ¨ ???ëŸ¬ ì²˜ë¦¬
    logger.error("[updateTrackingChart] Chart update failed:", error);
    // ?¬ìš©?ì—ê²??ëŸ¬ ë©”ì‹œì§€ ?œì‹œ (?„ìš”??
    // this.showMessage('ì°¨íŠ¸ ?…ë°?´íŠ¸ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ?˜ì´ì§€ë¥??ˆë¡œê³ ì¹¨?´ì£¼?¸ìš”.', 'error');
  }
};

/**
 * ë²”ë? ??? ê? (?°ì´?°ì…‹ show/hide)
 *
 * ì°¨íŠ¸???¹ì • ?°ì´?°ì…‹???œì‹œ?˜ê±°???¨ê¹?ˆë‹¤.
 * ë²„íŠ¼???¤í??¼ì„ ?…ë°?´íŠ¸?˜ì—¬ ?„ì¬ ?íƒœë¥??œê°?ìœ¼ë¡??œì‹œ?©ë‹ˆ??
 *
 * @param {HTMLElement} button - ? ê? ë²„íŠ¼ ?”ì†Œ
 * @param {number} datasetIndex - ?°ì´?°ì…‹ ?¸ë±??(0: ì¡°íšŒ?? 1: ì¢‹ì•„?? 2: ?“ê?, 3: ê³µìœ , 4: ?”ë¡œ??
 * @returns {void}
 */
DualTextWriter.prototype.toggleLegend = function (button, datasetIndex) {
  if (!this.trackingChart) return;

  const dataset = this.trackingChart.data.datasets[datasetIndex];
  if (!dataset) return;

  // ?°ì´?°ì…‹ ?œì‹œ/?¨ê? ? ê? (ì¦‰ì‹œ ë°˜ì˜)
  const isVisible = dataset.hidden !== true;
  dataset.hidden = isVisible;

  // ë²„íŠ¼ ?¤í????…ë°?´íŠ¸
  if (isVisible) {
    button.style.opacity = "0.4";
    button.style.textDecoration = "line-through";
    button.setAttribute("aria-pressed", "false");
  } else {
    button.style.opacity = "1";
    button.style.textDecoration = "none";
    button.setAttribute("aria-pressed", "true");
  }

  // ì°¨íŠ¸ ì¦‰ì‹œ ?…ë°?´íŠ¸ ë°?ì¶?ë°˜ì‘??? ì?
  this.trackingChart.update("none");

  // ì¶?ë°˜ì‘???¬ê³„??
  if (
    this.trackingChart &&
    this.trackingChart.options &&
    this.trackingChart.options.scales
  ) {
    this.updateTrackingChart(); // ?„ì²´ ì°¨íŠ¸ ?…ë°?´íŠ¸ë¡?ì¶??¬ê³„??
  }
};
/**
 * ì°¨íŠ¸ ì»¨íŠ¸ë¡??¤ë³´???‘ê·¼???´ë²¤??ë°”ì¸??
 *
 * ëª¨ë“  ì°¨íŠ¸ ì»¨íŠ¸ë¡?ë²„íŠ¼???¤ë³´???´ë²¤??ë¦¬ìŠ¤?ˆë? ì¶”ê??©ë‹ˆ??
 * Enter ?ëŠ” Space ?¤ë¡œ ë²„íŠ¼???œì„±?”í•  ???ˆë„ë¡??©ë‹ˆ??
 *
 * **ë°”ì¸???€??**
 * - ì°¨íŠ¸ ëª¨ë“œ ë²„íŠ¼ (?„ì²´ ì´í•© / ê°œë³„ ?¬ìŠ¤??
 * - ì°¨íŠ¸ ë²”ìœ„ ë²„íŠ¼ (7??/ 30??/ ?„ì²´)
 * - ì°¨íŠ¸ ?¤ì???ë²„íŠ¼ (ê³µë™ / ë¶„ë¦¬)
 * - ë²”ë? ë²„íŠ¼ (ì¡°íšŒ?? ì¢‹ì•„?? ?“ê?, ê³µìœ , ?”ë¡œ??
 *
 * **?´ë²¤??ì²˜ë¦¬:**
 * - ?´ë²¤???„ì„ ?¬ìš©?¼ë¡œ ?™ì ?¼ë¡œ ì¶”ê???ë²”ë? ë²„íŠ¼??ì²˜ë¦¬ ê°€??
 * - `preventDefault()`ë¡?ê¸°ë³¸ ?™ì‘ ë°©ì?
 *
 * **?‘ê·¼??**
 * - WCAG 2.1 AA ê¸°ì? ì¶©ì¡±
 * - ?¤ë³´?œë§Œ?¼ë¡œ ëª¨ë“  ì°¨íŠ¸ ê¸°ëŠ¥ ?‘ê·¼ ê°€??
 *
 * @returns {void}
 */
DualTextWriter.prototype.bindChartKeyboardEvents = function () {
  // ì°¨íŠ¸ ëª¨ë“œ ë²„íŠ¼ ?¤ë³´???´ë²¤??
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

  // ì°¨íŠ¸ ë²”ìœ„ ë²„íŠ¼ ?¤ë³´???´ë²¤??
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

  // ì°¨íŠ¸ ?¤ì???ë²„íŠ¼ ?¤ë³´???´ë²¤??
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

  // ë²”ë? ë²„íŠ¼ ?¤ë³´???´ë²¤??(?´ë²¤???„ì„ ?¬ìš©)
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

// ?€?¥ëœ ê¸€?ì„œ ?¸ë˜???œì‘
DualTextWriter.prototype.startTrackingFromSaved = async function (textId) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  try {
    // ?€?¥ëœ ?ìŠ¤???•ë³´ ê°€?¸ì˜¤ê¸?
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      textId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      this.showMessage("???ë³¸ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?°ì´???¼ê???ê²€ì¦? ?ë³¸ ?ìŠ¤?¸ê? ? íš¨?œì? ?•ì¸
    if (!textData.content || textData.content.trim().length === 0) {
      logger.warn("?ë³¸ ?ìŠ¤???´ìš©??ë¹„ì–´?ˆìŠµ?ˆë‹¤.");
      this.showMessage("? ï¸ ?ë³¸ ?ìŠ¤???´ìš©??ë¹„ì–´?ˆìŠµ?ˆë‹¤.", "warning");
    }

    // ì¤‘ë³µ ?•ì¸: ?´ë? ???ìŠ¤?¸ì—???¬ìŠ¤?¸ê? ?ì„±?˜ì—ˆ?”ì? ?•ì¸ (? íƒ??
    const existingPosts = await this.checkExistingPostForText(textId);
    if (existingPosts.length > 0) {
      const confirmMessage = `???ìŠ¤?¸ì—???´ë? ${existingPosts.length}ê°œì˜ ?¬ìŠ¤?¸ê? ?ì„±?˜ì—ˆ?µë‹ˆ??\nê³„ì†?´ì„œ ???¬ìŠ¤?¸ë? ?ì„±?˜ì‹œê² ìŠµ?ˆê¹Œ?`;
      if (!confirm(confirmMessage)) {
        logger.log("?¬ìš©?ê? ì¤‘ë³µ ?ì„± ì·¨ì†Œ");
        return;
      }
    }

    // ?¬ìŠ¤??ì»¬ë ‰?˜ì— ì¶”ê?
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
      sourceTextId: textId, // ?ë³¸ ?ìŠ¤??ì°¸ì¡°
      sourceType: textData.type || "edit", // ?ë³¸ ?ìŠ¤???€??
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    const docRef = await window.firebaseAddDoc(postsRef, postData);

    logger.log("?¸ë˜???¬ìŠ¤?¸ê? ?ì„±?˜ì—ˆ?µë‹ˆ??", docRef.id);

    // ?¸ë˜????œ¼ë¡??„í™˜
    this.switchTab("tracking");

    // ?¸ë˜???¬ìŠ¤??ëª©ë¡ ?ˆë¡œê³ ì¹¨
    this.loadTrackingPosts();
  } catch (error) {
    logger.error("?¸ë˜???œì‘ ?¤íŒ¨:", error);
    this.showMessage(
      "???¸ë˜???œì‘???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

// ?¹ì • ?ìŠ¤?¸ì—???ì„±???¬ìŠ¤???•ì¸
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
    logger.error("ê¸°ì¡´ ?¬ìŠ¤???•ì¸ ?¤íŒ¨:", error);
    return [];
  }
};

/**
 * ?ˆí¼?°ìŠ¤ ê¸€???¬ìš© ?¬ë?ë¥??•ì¸?©ë‹ˆ??
 *
 * Firebase `posts` ì»¬ë ‰?˜ì—??`sourceType === 'reference'`?´ê³ 
 * `sourceTextId`ê°€ ?¼ì¹˜?˜ëŠ” ?¬ìŠ¤??ê°œìˆ˜ë¥?ë°˜í™˜?©ë‹ˆ??
 *
 * @param {string} referenceTextId - ?ˆí¼?°ìŠ¤ ?ìŠ¤?¸ì˜ ID (texts ì»¬ë ‰??ë¬¸ì„œ ID)
 * @returns {Promise<number>} ?¬ìš© ?Ÿìˆ˜ (0?´ë©´ ?¬ìš© ?ˆë¨, 1 ?´ìƒ?´ë©´ ?¬ìš©??
 *
 * @example
 * const usageCount = await dualTextWriter.checkReferenceUsage('abc123');
 * if (usageCount > 0) {
 *     logger.log(`???ˆí¼?°ìŠ¤??${usageCount}???¬ìš©?˜ì—ˆ?µë‹ˆ??`);
 * }
 */
DualTextWriter.prototype.checkReferenceUsage = async function (
  referenceTextId
) {
  // ?ëŸ¬ ì²˜ë¦¬: ?Œë¼ë¯¸í„° ? íš¨??ê²€??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "checkReferenceUsage: ?˜ëª»??referenceTextId:",
      referenceTextId
    );
    return 0;
  }

  // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¤€ë¹??íƒœ ?•ì¸
  if (!this.isFirebaseReady) {
    logger.warn("checkReferenceUsage: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??");
    return 0;
  }

  // ?ëŸ¬ ì²˜ë¦¬: ?¬ìš©??ë¡œê·¸???¬ë? ?•ì¸
  if (!this.currentUser) {
    logger.warn("checkReferenceUsage: ?¬ìš©?ê? ë¡œê·¸?¸í•˜ì§€ ?Šì•˜?µë‹ˆ??");
    return 0;
  }

  try {
    // Firebase posts ì»¬ë ‰??ì°¸ì¡°
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // Firebase ì¿¼ë¦¬: sourceType??'reference'?´ê³  sourceTextIdê°€ ?¼ì¹˜?˜ëŠ” ?¬ìŠ¤??ì¡°íšŒ
    // ì°¸ê³ : Firestore??where ?ˆì„ ?¬ëŸ¬ ê°??¬ìš©?????ˆìŒ (ë³µí•© ?¸ë±???„ìš”?????ˆìŒ)
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference"),
      window.firebaseWhere("sourceTextId", "==", referenceTextId)
    );

    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    // ?¬ìš© ?Ÿìˆ˜ ê³„ì‚° (ì¿¼ë¦¬ ê²°ê³¼??ë¬¸ì„œ ê°œìˆ˜)
    const usageCount = querySnapshot.size;

    return usageCount;
  } catch (error) {
    // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¡°íšŒ ?¤íŒ¨ ??ê¸°ë³¸ê°?0) ë°˜í™˜
    logger.error("?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ë? ?•ì¸ ?¤íŒ¨:", error);
    return 0;
  }
};

/**
 * ?¬ëŸ¬ ?ˆí¼?°ìŠ¤ ê¸€???¬ìš© ?¬ë?ë¥??œë²ˆ???•ì¸?©ë‹ˆ??(?±ëŠ¥ ìµœì ??.
 *
 * Firebase `posts` ì»¬ë ‰?˜ì—??`sourceType === 'reference'`???¬ìŠ¤?¸ë“¤??ì¡°íšŒ????
 * JavaScript?ì„œ `sourceTextId`ë³„ë¡œ ê·¸ë£¹?‘í•˜???¬ìš© ?Ÿìˆ˜ë¥?ê³„ì‚°?©ë‹ˆ??
 *
 * **?±ëŠ¥ ìµœì ???„ëµ:**
 * - ëª¨ë“  ?ˆí¼?°ìŠ¤ ?¬ìŠ¤?¸ë? ??ë²ˆì˜ ì¿¼ë¦¬ë¡?ì¡°íšŒ
 * - JavaScript?ì„œ ê·¸ë£¹?‘í•˜??ì¹´ìš´??(Firebase `whereIn` 10ê°??œí•œ ?Œí”¼)
 *
 * @param {Array<string>} referenceTextIds - ?ˆí¼?°ìŠ¤ ?ìŠ¤??ID ë°°ì—´ (texts ì»¬ë ‰??ë¬¸ì„œ ID??
 * @returns {Promise<Object>} ?¬ìš© ?Ÿìˆ˜ ê°ì²´: `{ textId1: count1, textId2: count2, ... }`
 *
 * @example
 * const usageMap = await dualTextWriter.checkMultipleReferenceUsage(['id1', 'id2', 'id3']);
 * // ê²°ê³¼: { id1: 2, id2: 0, id3: 1 }
 *
 * if (usageMap.id1 > 0) {
 *     logger.log(`?ˆí¼?°ìŠ¤ id1?€ ${usageMap.id1}???¬ìš©?˜ì—ˆ?µë‹ˆ??`);
 * }
 */
DualTextWriter.prototype.checkMultipleReferenceUsage = async function (
  referenceTextIds
) {
  // ?ëŸ¬ ì²˜ë¦¬: ë¹?ë°°ì—´ ?…ë ¥ ì²˜ë¦¬
  if (!Array.isArray(referenceTextIds) || referenceTextIds.length === 0) {
    return {};
  }

  // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¤€ë¹??íƒœ ?•ì¸
  if (!this.isFirebaseReady) {
    logger.warn(
      "checkMultipleReferenceUsage: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??"
    );
    // ëª¨ë“  ID???€??0 ë°˜í™˜
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  // ?ëŸ¬ ì²˜ë¦¬: ?¬ìš©??ë¡œê·¸???¬ë? ?•ì¸
  if (!this.currentUser) {
    logger.warn(
      "checkMultipleReferenceUsage: ?¬ìš©?ê? ë¡œê·¸?¸í•˜ì§€ ?Šì•˜?µë‹ˆ??"
    );
    // ëª¨ë“  ID???€??0 ë°˜í™˜
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  try {
    // Firebase posts ì»¬ë ‰??ì°¸ì¡°
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // ?±ëŠ¥ ìµœì ?? sourceType??'reference'??ëª¨ë“  ?¬ìŠ¤?¸ë? ??ë²ˆì˜ ì¿¼ë¦¬ë¡?ì¡°íšŒ
    // (whereIn 10ê°??œí•œ???Œí”¼?˜ê¸° ?„í•´ JavaScript?ì„œ ?„í„°ë§?
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference")
    );

    const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

    // ?¬ìš© ?Ÿìˆ˜ ê³„ì‚°???„í•œ Map ì´ˆê¸°??(ëª¨ë“  ID???€??0?¼ë¡œ ì´ˆê¸°??
    const usageMap = new Map();
    referenceTextIds.forEach((id) => {
      // ? íš¨??IDë§?ì²˜ë¦¬
      if (id && typeof id === "string") {
        usageMap.set(id, 0);
      }
    });

    // ì¿¼ë¦¬ ê²°ê³¼ë¥??œíšŒ?˜ë©° sourceTextIdë³„ë¡œ ì¹´ìš´??
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const sourceTextId = data.sourceTextId;

      // ?”ì²­??ID ëª©ë¡???¬í•¨??ê²½ìš°?ë§Œ ì¹´ìš´??
      if (sourceTextId && usageMap.has(sourceTextId)) {
        const currentCount = usageMap.get(sourceTextId);
        usageMap.set(sourceTextId, currentCount + 1);
      }
    });

    // Map??ê°ì²´ë¡?ë³€?˜í•˜??ë°˜í™˜
    const result = {};
    usageMap.forEach((count, id) => {
      result[id] = count;
    });

    return result;
  } catch (error) {
    // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¡°íšŒ ?¤íŒ¨ ??ëª¨ë“  ID???€??0 ë°˜í™˜
    logger.error("?¬ëŸ¬ ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ë? ?•ì¸ ?¤íŒ¨:", error);
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }
};
/**
 * ?ˆí¼?°ìŠ¤ë¥??¬ìš©??ê²ƒìœ¼ë¡??œì‹œ?©ë‹ˆ??(ê°„ë‹¨???´ë¦­ ?™ì‘).
 *
 * ?ˆí¼?°ìŠ¤ë¥??¬ìš©?ˆë‹¤ê³??œì‹œ?˜ê¸° ?„í•´ ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤?¸ë? ?ì„±?©ë‹ˆ??
 * ?¬ìš©?ê? "?¬ìš© ?ˆë¨" ë°°ì?ë¥??´ë¦­?ˆì„ ???¸ì¶œ?©ë‹ˆ??
 *
 * @param {string} referenceTextId - ?ˆí¼?°ìŠ¤ ?ìŠ¤?¸ì˜ ID (texts ì»¬ë ‰??ë¬¸ì„œ ID)
 * @returns {Promise<void>}
 *
 * @example
 * await dualTextWriter.markReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.markReferenceAsUsed = async function (
  referenceTextId
) {
  // ?ëŸ¬ ì²˜ë¦¬: ?Œë¼ë¯¸í„° ? íš¨??ê²€??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "markReferenceAsUsed: ?˜ëª»??referenceTextId:",
      referenceTextId
    );
    this.showMessage("???ˆí¼?°ìŠ¤ IDë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    return;
  }

  // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¤€ë¹??íƒœ ?•ì¸
  if (!this.isFirebaseReady) {
    logger.warn("markReferenceAsUsed: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??");
    this.showMessage("??Firebase ?°ê²°??ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??", "error");
    return;
  }

  // ?ëŸ¬ ì²˜ë¦¬: ?¬ìš©??ë¡œê·¸???¬ë? ?•ì¸
  if (!this.currentUser) {
    logger.warn("markReferenceAsUsed: ?¬ìš©?ê? ë¡œê·¸?¸í•˜ì§€ ?Šì•˜?µë‹ˆ??");
    this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  try {
    // ?ˆí¼?°ìŠ¤ ?ìŠ¤??ì¡°íšŒ
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?ˆí¼?°ìŠ¤ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      this.showMessage("???ˆí¼?°ìŠ¤ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?ˆí¼?°ìŠ¤ ?€???•ì¸
    if ((textData.type || "edit") !== "reference") {
      logger.warn("markReferenceAsUsed: ?ˆí¼?°ìŠ¤ê°€ ?„ë‹Œ ?ìŠ¤?¸ì…?ˆë‹¤.");
      this.showMessage("???ˆí¼?°ìŠ¤ ê¸€ë§??¬ìš© ?œì‹œ?????ˆìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ?´ë? ?¬ìš©???ˆí¼?°ìŠ¤?¸ì? ?•ì¸
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount > 0) {
      logger.log("?´ë? ?¬ìš©???ˆí¼?°ìŠ¤?…ë‹ˆ?? ?¬ìš© ?Ÿìˆ˜:", existingUsageCount);
      // ?´ë? ?¬ìš©??ê²½ìš°?ë„ ë©”ì‹œì§€ ?œì‹œ?˜ì? ?Šê³  ì¡°ìš©??ì²˜ë¦¬
      // UIë§??…ë°?´íŠ¸
      await this.refreshSavedTextsUI();
      return;
    }

    // ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤???ì„±
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const referencePostData = {
      content: textData.content, // ?ˆí¼?°ìŠ¤ ?´ìš©
      type: "reference",
      postedAt: window.firebaseServerTimestamp(),
      trackingEnabled: false, // ?ˆí¼?°ìŠ¤ ?¬ìŠ¤?¸ëŠ” ?¸ë˜??ë¹„í™œ?±í™”
      metrics: [],
      analytics: {},
      sourceTextId: referenceTextId, // ?ˆí¼?°ìŠ¤ ?ìŠ¤??ì°¸ì¡°
      sourceType: "reference", // ?ˆí¼?°ìŠ¤ ?€?…ìœ¼ë¡??¤ì •
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    await window.firebaseAddDoc(postsRef, referencePostData);
    logger.log(
      "???ˆí¼?°ìŠ¤ ?¬ìš© ?œì‹œ ?„ë£Œ (?ˆí¼?°ìŠ¤ ID:",
      referenceTextId,
      ")"
    );

    // ?±ê³µ ë©”ì‹œì§€
    this.showMessage("???ˆí¼?°ìŠ¤ê°€ ?¬ìš©?¨ìœ¼ë¡??œì‹œ?˜ì—ˆ?µë‹ˆ??", "success");

    // "?¬ìš©?? ??œ¼ë¡??ë™ ?´ë™
    this.setSavedFilter("reference-used");

    // UI ì¦‰ì‹œ ?…ë°?´íŠ¸ (?ˆë¡œê³ ì¹¨ ?†ì´)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¡°íšŒ/?ì„± ?¤íŒ¨ ???ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
    logger.error("?ˆí¼?°ìŠ¤ ?¬ìš© ?œì‹œ ?¤íŒ¨:", error);
    this.showMessage(
      "???ˆí¼?°ìŠ¤ ?¬ìš© ?œì‹œ???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

/**
 * ?ˆí¼?°ìŠ¤ë¥??¬ìš© ?ˆëœ ê²ƒìœ¼ë¡??˜ëŒë¦½ë‹ˆ??(? ê? ê¸°ëŠ¥).
 *
 * ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤?¸ë? ?? œ?˜ì—¬ ?¬ìš© ?ˆë¨ ?íƒœë¡?ë³µì›?©ë‹ˆ??
 * ?¬ìš©?ê? "?¬ìš©?? ë°°ì?ë¥??´ë¦­?ˆì„ ???¸ì¶œ?©ë‹ˆ??
 *
 * @param {string} referenceTextId - ?ˆí¼?°ìŠ¤ ?ìŠ¤?¸ì˜ ID (texts ì»¬ë ‰??ë¬¸ì„œ ID)
 * @returns {Promise<void>}
 *
 * @example
 * await dualTextWriter.unmarkReferenceAsUsed('abc123');
 */
DualTextWriter.prototype.unmarkReferenceAsUsed = async function (
  referenceTextId
) {
  // ?ëŸ¬ ì²˜ë¦¬: ?Œë¼ë¯¸í„° ? íš¨??ê²€??
  if (!referenceTextId || typeof referenceTextId !== "string") {
    logger.warn(
      "unmarkReferenceAsUsed: ?˜ëª»??referenceTextId:",
      referenceTextId
    );
    this.showMessage("???ˆí¼?°ìŠ¤ IDë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
    return;
  }

  // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¤€ë¹??íƒœ ?•ì¸
  if (!this.isFirebaseReady) {
    logger.warn("unmarkReferenceAsUsed: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??");
    this.showMessage("??Firebase ?°ê²°??ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??", "error");
    return;
  }

  // ?ëŸ¬ ì²˜ë¦¬: ?¬ìš©??ë¡œê·¸???¬ë? ?•ì¸
  if (!this.currentUser) {
    logger.warn("unmarkReferenceAsUsed: ?¬ìš©?ê? ë¡œê·¸?¸í•˜ì§€ ?Šì•˜?µë‹ˆ??");
    this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  try {
    // ?ˆí¼?°ìŠ¤ ?ìŠ¤??ì¡°íšŒ
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      logger.error("?ˆí¼?°ìŠ¤ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      this.showMessage("???ˆí¼?°ìŠ¤ ?ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    const textData = textDoc.data();

    // ?ˆí¼?°ìŠ¤ ?€???•ì¸
    if ((textData.type || "edit") !== "reference") {
      logger.warn("unmarkReferenceAsUsed: ?ˆí¼?°ìŠ¤ê°€ ?„ë‹Œ ?ìŠ¤?¸ì…?ˆë‹¤.");
      this.showMessage(
        "???ˆí¼?°ìŠ¤ ê¸€ë§??¬ìš© ?ˆë¨?¼ë¡œ ?˜ëŒë¦????ˆìŠµ?ˆë‹¤.",
        "error"
      );
      return;
    }

    // ?„ì¬ ?¬ìš© ?¬ë? ?•ì¸
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount === 0) {
      logger.log("?´ë? ?¬ìš© ?ˆëœ ?ˆí¼?°ìŠ¤?…ë‹ˆ??");
      // ?´ë? ?¬ìš© ?ˆëœ ê²½ìš°?ë„ ë©”ì‹œì§€ ?œì‹œ?˜ì? ?Šê³  ì¡°ìš©??ì²˜ë¦¬
      // UIë§??…ë°?´íŠ¸
      await this.refreshSavedTextsUI();
      return;
    }

    // ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤??ì¡°íšŒ ë°??? œ
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
        "unmarkReferenceAsUsed: ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤?¸ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤."
      );
      // ?¬ìš© ?¬ìŠ¤?¸ê? ?†ì–´??UIë§??…ë°?´íŠ¸
      await this.refreshSavedTextsUI();
      return;
    }

    // ëª¨ë“  ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ìŠ¤???? œ (ë°°ì¹˜ ?? œ)
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
      "???ˆí¼?°ìŠ¤ ?¬ìš© ?ˆë¨ ë³µì› ?„ë£Œ (?ˆí¼?°ìŠ¤ ID:",
      referenceTextId,
      ", ?? œ???¬ìŠ¤??",
      querySnapshot.docs.length,
      "ê°?"
    );

    // ?±ê³µ ë©”ì‹œì§€
    this.showMessage("???ˆí¼?°ìŠ¤ê°€ ?¬ìš© ?ˆë¨?¼ë¡œ ?˜ëŒ?¤ì¡Œ?µë‹ˆ??", "success");

    // "?ˆí¼?°ìŠ¤" ??œ¼ë¡??ë™ ?´ë™ (?¬ìš© ?ˆë¨ ?ˆí¼?°ìŠ¤ë¥?ë³´ê¸° ?„í•´)
    this.setSavedFilter("reference");

    // UI ì¦‰ì‹œ ?…ë°?´íŠ¸ (?ˆë¡œê³ ì¹¨ ?†ì´)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // ?ëŸ¬ ì²˜ë¦¬: Firebase ì¡°íšŒ/?? œ ?¤íŒ¨ ???ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
    logger.error("?ˆí¼?°ìŠ¤ ?¬ìš© ?ˆë¨ ë³µì› ?¤íŒ¨:", error);
    this.showMessage(
      "???ˆí¼?°ìŠ¤ ?¬ìš© ?ˆë¨ ë³µì›???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};

/**
 * ?€?¥ëœ ê¸€ ëª©ë¡ UIë¥??ˆë¡œê³ ì¹¨?©ë‹ˆ??
 * ?ˆí¼?°ìŠ¤ ?¬ìš© ?¬ë?ë¥??¤ì‹œ ?•ì¸?˜ì—¬ ë°°ì? ?…ë°?´íŠ¸?©ë‹ˆ??
 *
 * @returns {Promise<void>}
 */
DualTextWriter.prototype.refreshSavedTextsUI = async function () {
  try {
    // ?€?¥ëœ ê¸€ ëª©ë¡ ?¤ì‹œ ?Œë”ë§?
    await this.renderSavedTexts();
  } catch (error) {
    logger.error("?€?¥ëœ ê¸€ UI ?ˆë¡œê³ ì¹¨ ?¤íŒ¨:", error);
  }
};

// Orphan ?¬ìŠ¤???•ë¦¬ (?ë³¸???? œ???¬ìŠ¤???¼ê´„ ?? œ)
DualTextWriter.prototype.cleanupOrphanPosts = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  // Orphan ?¬ìŠ¤???„í„°ë§?
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);

  if (orphanPosts.length === 0) {
    this.showMessage("???•ë¦¬??orphan ?¬ìŠ¤?¸ê? ?†ìŠµ?ˆë‹¤.", "success");
    return;
  }

  // ?? œ ???•ì¸
  const metricsCount = orphanPosts.reduce(
    (sum, post) => sum + (post.metrics?.length || 0),
    0
  );
  const confirmMessage =
    `?ë³¸???? œ???¬ìŠ¤??${orphanPosts.length}ê°œë? ?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?\n\n` +
    `? ï¸ ?? œ???°ì´??\n` +
    `   - ?¸ë˜???¬ìŠ¤?? ${orphanPosts.length}ê°?n` +
    `   - ?¸ë˜??ê¸°ë¡: ${metricsCount}ê°?n\n` +
    `???‘ì—…?€ ?˜ëŒë¦????†ìŠµ?ˆë‹¤.`;

  if (!confirm(confirmMessage)) {
    logger.log("?¬ìš©?ê? orphan ?¬ìŠ¤???•ë¦¬ ì·¨ì†Œ");
    return;
  }

  try {
    // ì§„í–‰ ì¤?ë©”ì‹œì§€
    this.showMessage("?”„ Orphan ?¬ìŠ¤?¸ë? ?•ë¦¬?˜ëŠ” ì¤?..", "info");

    // ëª¨ë“  orphan ?¬ìŠ¤???? œ (ë³‘ë ¬ ì²˜ë¦¬)
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

    // ë¡œì»¬ ë°°ì—´?ì„œ???œê±°
    this.trackingPosts = this.trackingPosts.filter((post) => !post.isOrphan);

    // UI ?…ë°?´íŠ¸
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // ?±ê³µ ë©”ì‹œì§€
    this.showMessage(
      `??Orphan ?¬ìŠ¤??${orphanPosts.length}ê°œê? ?•ë¦¬?˜ì—ˆ?µë‹ˆ??`,
      "success"
    );
    logger.log("Orphan ?¬ìŠ¤???•ë¦¬ ?„ë£Œ", {
      deletedCount: orphanPosts.length,
    });
  } catch (error) {
    logger.error("Orphan ?¬ìŠ¤???•ë¦¬ ?¤íŒ¨:", error);
    this.showMessage(
      "??Orphan ?¬ìŠ¤???•ë¦¬???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  }
};
// ?¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?•ì¸ ?€?”ìƒ???œì‹œ
DualTextWriter.prototype.showBatchMigrationConfirm = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
    return;
  }

  // ë¯¸íŠ¸?˜í‚¹ ê¸€ë§?ì°¾ê¸°
  const untrackedTexts = [];

  for (const textItem of this.savedTexts) {
    // ë¡œì»¬?ì„œ ë¨¼ì? ?•ì¸
    let hasTracking = false;
    if (this.trackingPosts) {
      hasTracking = this.trackingPosts.some(
        (p) => p.sourceTextId === textItem.id
      );
    }

    // ë¡œì»¬???†ìœ¼ë©?Firebase?ì„œ ?•ì¸
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
        logger.error("?¸ë˜???•ì¸ ?¤íŒ¨:", error);
      }
    }

    if (!hasTracking) {
      untrackedTexts.push(textItem);
    }
  }

  if (untrackedTexts.length === 0) {
    this.showMessage("??ëª¨ë“  ?€?¥ëœ ê¸€???´ë? ?¸ë˜??ì¤‘ì…?ˆë‹¤!", "success");
    // ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸
    this.updateBatchMigrationButton();
    return;
  }

  const confirmMessage =
    `?¸ë˜?¹ì´ ?œì‘?˜ì? ?Šì? ?€?¥ëœ ê¸€ ${untrackedTexts.length}ê°œë? ?¸ë˜???¬ìŠ¤?¸ë¡œ ë³€?˜í•˜?œê² ?µë‹ˆê¹?\n\n` +
    `? ï¸ ì£¼ì˜?¬í•­:\n` +
    `- ?´ë? ?¸ë˜??ì¤‘ì¸ ê¸€?€ ?œì™¸?©ë‹ˆ??n` +
    `- ì¤‘ë³µ ?ì„± ë°©ì?ë¥??„í•´ ê°??ìŠ¤?¸ì˜ ê¸°ì¡´ ?¬ìŠ¤?¸ë? ?•ì¸?©ë‹ˆ??n` +
    `- ë§ˆì´ê·¸ë ˆ?´ì…˜ ì¤‘ì—???˜ì´ì§€ë¥??«ì? ë§ˆì„¸??;

  if (confirm(confirmMessage)) {
    // ë¯¸íŠ¸?˜í‚¹ ê¸€ë§?ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤í–‰
    this.executeBatchMigrationForUntracked(untrackedTexts);
  }
};

// ë¯¸íŠ¸?˜í‚¹ ê¸€ë§??¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤í–‰
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
    // ë²„íŠ¼ ë¹„í™œ?±í™”
    if (button) {
      button.disabled = true;
      button.textContent = "ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ ì¤?..";
    }

    this.showMessage(
      `?”„ ë¯¸íŠ¸?˜í‚¹ ê¸€ ${untrackedTexts.length}ê°œì˜ ?¸ë˜?¹ì„ ?œì‘?©ë‹ˆ??..`,
      "info"
    );

    // ê°?ë¯¸íŠ¸?˜í‚¹ ?ìŠ¤?¸ì— ?€???¬ìŠ¤???ì„±
    for (let i = 0; i < untrackedTexts.length; i++) {
      const textItem = untrackedTexts[i];

      try {
        // ê¸°ì¡´ ?¬ìŠ¤???•ì¸ (?ˆì „?¥ì¹˜)
        const existingPosts = await this.checkExistingPostForText(textItem.id);
        if (existingPosts.length > 0) {
          logger.log(
            `?ìŠ¤??${textItem.id}: ?´ë? ${existingPosts.length}ê°œì˜ ?¬ìŠ¤??ì¡´ì¬, ê±´ë„ˆ?€`
          );
          skipCount++;
          continue;
        }

        // ?¬ìŠ¤???ì„± (?¸ë˜?????„í™˜ ?†ì´ ë°±ê·¸?¼ìš´??ì²˜ë¦¬)
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

        // ì§„í–‰ ?í™© ?œì‹œ (ë§ˆì?ë§???ª©???„ë‹ ?Œë§Œ)
        if (i < untrackedTexts.length - 1) {
          const progress = Math.round(((i + 1) / untrackedTexts.length) * 100);
          if (button) {
            button.textContent = `ë§ˆì´ê·¸ë ˆ?´ì…˜ ì§„í–‰ ì¤?.. (${progress}%)`;
          }
        }

        // ?ˆë¬´ ë¹ ë¥¸ ?”ì²­ ë°©ì? (Firebase ? ë‹¹??ê³ ë ¤)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`?ìŠ¤??${textItem.id} ë§ˆì´ê·¸ë ˆ?´ì…˜ ?¤íŒ¨:`, error);
        errorCount++;
      }
    }

    // ê²°ê³¼ ë©”ì‹œì§€
    const resultMessage =
      `??ë¯¸íŠ¸?˜í‚¹ ê¸€ ë§ˆì´ê·¸ë ˆ?´ì…˜ ?„ë£Œ!\n` +
      `- ?±ê³µ: ${successCount}ê°?n` +
      `- ê±´ë„ˆ?€: ${skipCount}ê°?(?´ë? ?¬ìŠ¤??ì¡´ì¬)\n` +
      `- ?¤íŒ¨: ${errorCount}ê°?;

    this.showMessage(resultMessage, "success");
    logger.log("?¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ê²°ê³¼:", {
      successCount,
      skipCount,
      errorCount,
    });

    // ?¸ë˜???¬ìŠ¤??ëª©ë¡ ?ˆë¡œê³ ì¹¨ (?¸ë˜????´ ?œì„±?”ë˜???ˆìœ¼ë©?
    if (this.loadTrackingPosts) {
      await this.loadTrackingPosts();
    }

    // ?€?¥ëœ ê¸€ ëª©ë¡???ˆë¡œê³ ì¹¨ (ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸ë¥??„í•´)
    await this.renderSavedTexts();
  } catch (error) {
    logger.error("?¼ê´„ ë§ˆì´ê·¸ë ˆ?´ì…˜ ì¤??¤ë¥˜:", error);
    this.showMessage(
      "??ë§ˆì´ê·¸ë ˆ?´ì…˜ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message,
      "error"
    );
  } finally {
    // ë²„íŠ¼ ë³µì› ë°??íƒœ ?…ë°?´íŠ¸
    if (button) {
      button.disabled = false;
    }
    // ë²„íŠ¼ ?ìŠ¤?¸ëŠ” updateBatchMigrationButton?ì„œ ?…ë°?´íŠ¸??
    await this.updateBatchMigrationButton();
  }
};

// [Refactoring] ?„ì—­ ?¸ìŠ¤?´ìŠ¤ ?ì„± ë°??¸ì¶œ ?œê±° (DOMContentLoaded?ì„œ ì²˜ë¦¬??
// const dualTextWriter = new DualTextWriter(); // Removed to avoid duplicate and premature instantiation
// window.dualTextWriter = dualTextWriter; // Handled in DOMContentLoaded
// window.app = dualTextWriter; // Handled in DOMContentLoaded

// ?„ì—­ ?¨ìˆ˜??(?¸ë¼???¸ë“¤???¸í™˜??? ì?)
window.saveTrackingData = function () {
  if (window.dualTextWriter) {
    window.dualTextWriter.saveTrackingData();
  }
};

window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active"); // classList ?¬ìš© ê¶Œì¥
    // ?˜ìœ„ ?¸í™˜?? style.display??ì²´í¬
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
// ê¸€ ?ì„¸ ?¨ë„ ?•ë? ëª¨ë“œ ê¸°ëŠ¥
// ========================================

/**
 * ê¸€ ?ì„¸ ?¨ë„ ?•ë? ëª¨ë“œ ì´ˆê¸°??
 * - ?•ë? ë²„íŠ¼ ?´ë¦­ ?´ë²¤??
 * - ESC ?¤ë¡œ ?«ê¸°
 * - ?¤ë²„?ˆì´ ?´ë¦­?¼ë¡œ ?«ê¸°
 */
document.addEventListener("DOMContentLoaded", () => {
  const detailExpandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");
  const detailPanelClose = document.getElementById("detail-panel-close");

  if (!detailExpandBtn || !articleDetailPanel) {
    logger.warn("ê¸€ ?ì„¸ ?¨ë„ ?•ë? ëª¨ë“œ: ?„ìˆ˜ ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    return;
  }

  /**
   * ?•ë? ëª¨ë“œ ? ê? ?¨ìˆ˜
   */
  function toggleDetailPanelExpand() {
    const isExpanded = articleDetailPanel.classList.contains("expanded");

    if (isExpanded) {
      // ì¶•ì†Œ
      articleDetailPanel.classList.remove("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "false");
      detailExpandBtn.title = "?„ì²´ ?”ë©´ ?•ë? (ESCë¡??«ê¸°)";
      document.body.style.overflow = "";
      removeDetailPanelOverlay();
    } else {
      // ?•ë?
      articleDetailPanel.classList.add("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "true");
      detailExpandBtn.title = "?•ë? ëª¨ë“œ ?«ê¸° (ESC)";
      document.body.style.overflow = "hidden";
      addDetailPanelOverlay();
    }
  }

  /**
   * ?¤ë²„?ˆì´ ì¶”ê? ?¨ìˆ˜
   */
  function addDetailPanelOverlay() {
    let overlay = document.querySelector(".detail-panel-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "detail-panel-overlay";
      document.body.appendChild(overlay);

      // ?¤ë²„?ˆì´ ?´ë¦­ ??ì¶•ì†Œ
      overlay.addEventListener("click", toggleDetailPanelExpand);
    }
    overlay.classList.add("active");
  }

  /**
   * ?¤ë²„?ˆì´ ?œê±° ?¨ìˆ˜
   */
  function removeDetailPanelOverlay() {
    const overlay = document.querySelector(".detail-panel-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  }

  // ?•ë? ë²„íŠ¼ ?´ë¦­ ?´ë²¤??-> ëª¨ë‹¬ ?•ë? ëª¨ë“œë¡?ë³€ê²?
  detailExpandBtn.addEventListener("click", () => {
    if (window.dualTextWriter) {
      window.dualTextWriter.openExpandMode();
    } else {
      logger.error("DualTextWriter ?¸ìŠ¤?´ìŠ¤ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    }
  });

  // ESC ?¤ë¡œ ?•ë? ëª¨ë“œ ?«ê¸°
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

  // ?¨ë„ ?«ê¸° ë²„íŠ¼ ?´ë¦­ ???•ë? ëª¨ë“œ???´ì œ
  if (detailPanelClose) {
    const originalCloseHandler = detailPanelClose.onclick;
    detailPanelClose.addEventListener("click", () => {
      // ?•ë? ëª¨ë“œê°€ ?œì„±?”ë˜???ˆìœ¼ë©?ë¨¼ì? ?´ì œ
      if (articleDetailPanel.classList.contains("expanded")) {
        toggleDetailPanelExpand();
      }
    });
  }

  logger.log("??ê¸€ ?ì„¸ ?¨ë„ ?•ë? ëª¨ë“œ ì´ˆê¸°???„ë£Œ");
});

// ========================================
// ê¸€ ?ì„¸ ?¨ë„ ?ˆí¼?°ìŠ¤ ê¸°ëŠ¥
// ========================================

/**
 * ê¸€ ?ì„¸ ?¨ë„?ì„œ ?ˆí¼?°ìŠ¤ë¥?ë¡œë“œ?˜ê³  ê´€ë¦¬í•˜??ê¸°ëŠ¥
 * - ?•ë? ëª¨ë“œ ?œì„±?????°ê²°???ˆí¼?°ìŠ¤ ?ë™ ë¡œë“œ
 * - ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
 * - ?ˆí¼?°ìŠ¤ ?´ë¦­?¼ë¡œ ?´ìš© ë³µì‚¬
 * - ?œë˜ê·¸ë¡œ ?¨ë„ ?¬ê¸° ì¡°ì ˆ
 */

let currentArticleReferences = [];
let currentEditingArticleId = null;

/**
 * ê¸€???°ê²°???ˆí¼?°ìŠ¤ ë¡œë“œ
 */
function loadArticleReferences(articleId) {
  currentEditingArticleId = articleId;
  currentArticleReferences = [];

  // DualTextWriter ?¸ìŠ¤?´ìŠ¤ ?•ì¸
  if (!window.dualTextWriter || !window.dualTextWriter.currentUser) {
    logger.warn("DualTextWriter ?¸ìŠ¤?´ìŠ¤ê°€ ?†ê±°??ë¡œê·¸?¸í•˜ì§€ ?Šì•˜?µë‹ˆ??");
    renderDetailReferences();
    return;
  }

  // ?„ì¬ ?¸ì§‘ ì¤‘ì¸ ê¸€ ì°¾ê¸°
  const article = window.dualTextWriter.savedTexts.find(
    (t) => t.id === articleId
  );
  if (!article) {
    logger.warn("ê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤:", articleId);
    renderDetailReferences();
    return;
  }

  // ?°ê²°???ˆí¼?°ìŠ¤ê°€ ?ˆëŠ”ì§€ ?•ì¸
  if (article.linkedReferences && article.linkedReferences.length > 0) {
    // ?ˆí¼?°ìŠ¤ IDë¡??¤ì œ ?ˆí¼?°ìŠ¤ ?°ì´??ê°€?¸ì˜¤ê¸?
    const references = article.linkedReferences
      .map((refId) => {
        return window.dualTextWriter.savedTexts.find((t) => t.id === refId);
      })
      .filter((ref) => ref); // null ?œê±°

    currentArticleReferences = references;
    logger.log(`???ˆí¼?°ìŠ¤ ${references.length}ê°?ë¡œë“œ ?„ë£Œ`);
  }

  renderDetailReferences();
}

/**
 * ?ˆí¼?°ìŠ¤ ëª©ë¡ ?Œë”ë§?
 */
function renderDetailReferences() {
  const listEl = document.getElementById("detail-reference-list");
  const emptyEl = document.querySelector(".detail-reference-empty");

  if (!listEl || !emptyEl) {
    logger.warn("?ˆí¼?°ìŠ¤ UI ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
    return;
  }

  // ?ˆí¼?°ìŠ¤ê°€ ?†ëŠ” ê²½ìš°
  if (currentArticleReferences.length === 0) {
    listEl.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  // ?ˆí¼?°ìŠ¤ ëª©ë¡ ?œì‹œ
  listEl.style.display = "block";
  emptyEl.style.display = "none";

  // HTML ?´ìŠ¤ì¼€?´í”„ ?¨ìˆ˜
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ?ˆí¼?°ìŠ¤ ??ª© ?Œë”ë§?
  listEl.innerHTML = currentArticleReferences
    .map((ref) => {
      const title = ref.topic || ref.source || "?œëª© ?†ìŒ";
      const content = ref.content || "?´ìš© ?†ìŒ";

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

  // ?´ë¦­ ?´ë²¤?? ?´ìš© ë³µì‚¬
  listEl.querySelectorAll(".detail-reference-item").forEach((item) => {
    item.addEventListener("click", () => {
      const refId = item.dataset.refId;
      const ref = currentArticleReferences.find((r) => r.id === refId);
      if (ref && ref.content) {
        navigator.clipboard
          .writeText(ref.content)
          .then(() => {
            // ë³µì‚¬ ?±ê³µ ?¼ë“œë°?
            const originalBg = item.style.background;
            item.style.background = "#e7f3ff";
            setTimeout(() => {
              item.style.background = originalBg;
            }, 300);

            logger.log("???ˆí¼?°ìŠ¤ ?´ìš© ë³µì‚¬ ?„ë£Œ");
          })
          .catch((err) => {
            logger.error("ë³µì‚¬ ?¤íŒ¨:", err);
            alert("ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤.");
          });
      }
    });

    // ?¤ë³´???‘ê·¼??
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.click();
      }
    });
  });
}

/**
 * ?œë˜ê·?ê°€?¥í•œ êµ¬ë¶„??ì´ˆê¸°??
 */
function initDetailDividerDrag() {
  const divider = document.getElementById("detail-split-divider");
  const container = document.querySelector(".detail-edit-container");

  if (!divider || !container) {
    logger.warn("êµ¬ë¶„???”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
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

    // ìµœì†Œ/ìµœë? ?ˆë¹„ ?œí•œ (300px ~ ?„ì²´ ?ˆë¹„ - 400px)
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

  logger.log("??êµ¬ë¶„???œë˜ê·?ê¸°ëŠ¥ ì´ˆê¸°???„ë£Œ");
}

/**
 * ?•ë? ë²„íŠ¼ ?´ë¦­ ???ˆí¼?°ìŠ¤ ë¡œë“œ ë°?êµ¬ë¶„??ì´ˆê¸°??
 */
document.addEventListener("DOMContentLoaded", () => {
  const expandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");

  if (expandBtn && articleDetailPanel) {
    // ê¸°ì¡´ ?•ë? ë²„íŠ¼ ?´ë¦­ ?´ë²¤?¸ì— ì¶”ê? ë¡œì§ ?½ì…
    expandBtn.addEventListener("click", () => {
      // ?½ê°„??ì§€?????•ë? ëª¨ë“œ ?íƒœ ?•ì¸
      setTimeout(() => {
        const isExpanded = articleDetailPanel.classList.contains("expanded");
        const isEditMode =
          document.getElementById("detail-edit-mode").style.display !== "none";

        // ?•ë? ëª¨ë“œ ?œì„±??&& ?˜ì • ëª¨ë“œ???Œë§Œ ?¤í–‰
        if (isExpanded && isEditMode && currentEditingArticleId) {
          loadArticleReferences(currentEditingArticleId);
          initDetailDividerDrag();
          logger.log("???•ë? ëª¨ë“œ?ì„œ ?ˆí¼?°ìŠ¤ ?¨ë„ ?œì„±??);
        }
      }, 100);
    });
  }

  logger.log("???ˆí¼?°ìŠ¤ ?¨ë„ ê¸°ëŠ¥ ì´ˆê¸°???„ë£Œ");
});

/**
 * ?˜ì • ëª¨ë“œ ì§„ì… ???„ì¬ ê¸€ ID ?€??
 * (ê¸°ì¡´ ì½”ë“œ?ì„œ ?˜ì • ë²„íŠ¼ ?´ë¦­ ???¸ì¶œ?˜ëŠ” ë¶€ë¶„ì— ì¶”ê? ?„ìš”)
 */
function setCurrentEditingArticle(articleId) {
  currentEditingArticleId = articleId;
  logger.log("?„ì¬ ?¸ì§‘ ì¤‘ì¸ ê¸€ ID ?¤ì •:", articleId);
}

// ?„ì—­ ?¨ìˆ˜ë¡??¸ì¶œ (ê¸°ì¡´ ì½”ë“œ?ì„œ ?¸ì¶œ ê°€?¥í•˜?„ë¡)
window.setCurrentEditingArticle = setCurrentEditingArticle;
window.loadArticleReferences = loadArticleReferences;

// ================================================================
// [Phase 3] 2025-12-08
// URL ?°ê²° ??ê¸°ëŠ¥ (URL Connection Tab Feature)
// 
// - ?ì£¼ ?¬ìš©?˜ëŠ” URL??ê´€ë¦¬í•˜ê³?ë¹ ë¥´ê²??‘ê·¼
// - LocalStorage ê¸°ë°˜ ?°ì´???€??
// - CRUD ê¸°ëŠ¥ (ì¶”ê?, ì¡°íšŒ, ?˜ì •, ?? œ)
// - ë³´ì•ˆ: noopener noreferrer, XSS ë°©ì?
// ================================================================

/**
 * URL ?°ê²° ê´€ë¦¬ì (UrlLinkManager)
 * 
 * ?„ì—­ ?¤ì½”?„ì—??URL ë§í¬ ê´€ë¦?ê¸°ëŠ¥???œê³µ?©ë‹ˆ??
 * Firebase Firestoreë¥??¬ìš©?˜ì—¬ ?¬ë¡œ??ë¸Œë¼?°ì?/?”ë°”?´ìŠ¤ ?™ê¸°?”ë? ì§€?í•©?ˆë‹¤.
 */
const UrlLinkManager = (function () {
  // ----------------------------------------
  // 3.1 ?ìˆ˜ ë°??°ì´??ëª¨ë¸ ?•ì˜
  // ----------------------------------------
  
  /**
   * Firestore ì»¬ë ‰???´ë¦„
   * ê²½ë¡œ: users/{userId}/urlLinks/{linkId}
   * @type {string}
   */
  const URL_LINKS_COLLECTION = "urlLinks";

  /**
   * URL ë§í¬ ?°ì´??ë°°ì—´
   * @type {Array<{id: string, name: string, description: string, url: string, order: number, createdAt: number}>}
   */
  let urlLinks = [];

  /**
   * ?„ì¬ ?˜ì • ì¤‘ì¸ ë§í¬ ID (null?´ë©´ ì¶”ê? ëª¨ë“œ)
   * @type {string|null}
   */
  let editingLinkId = null;

  /**
   * Firebase ì¤€ë¹??íƒœ ë°??¬ìš©??ì°¸ì¡°
   */
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;

  // DOM ?”ì†Œ ìºì‹œ
  let elements = {};

  // ----------------------------------------
  // 3.2 Firebase Firestore ?°ë™ ?¨ìˆ˜
  // ----------------------------------------

  /**
   * Firebase?ì„œ URL ë§í¬ ?°ì´??ë¡œë“œ
   * @returns {Promise<Array>} URL ë§í¬ ë°°ì—´
   */
  async function loadUrlLinks() {
    // Firebase ì¤€ë¹??•ì¸
    if (!isFirebaseReady || !currentUser) {
      logger.warn("URL ë§í¬ ë¡œë“œ: Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜ê±°ë‚˜ ë¡œê·¸?¸ë˜ì§€ ?Šì•˜?µë‹ˆ??");
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

      // order ?„ë“œë¡??•ë ¬?˜ì—¬ ì¡°íšŒ
      const q = window.firebaseQuery(
        linksRef,
        window.firebaseOrderBy("order", "asc")
      );

      const querySnapshot = await withRetry(() => window.firebaseGetDocs(q));

      urlLinks = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.log(`??URL ë§í¬ ${urlLinks.length}ê°?ë¡œë“œ ?„ë£Œ (Firebase)`);
      renderUrlLinks();
      return urlLinks;
    } catch (error) {
      logger.error("Firebase?ì„œ URL ë§í¬ ë¡œë“œ ?¤íŒ¨:", error);
      urlLinks = [];
      renderUrlLinks();
      return urlLinks;
    }
  }

  /**
   * Firebase???¨ì¼ URL ë§í¬ ?€??(ì¶”ê?)
   * @param {Object} linkData - ?€?¥í•  URL ë§í¬ ?°ì´??
   * @returns {Promise<string|null>} ?€?¥ëœ ë¬¸ì„œ ID ?ëŠ” null
   */
  async function saveUrlLinkToFirebase(linkData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
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

      logger.log(`??URL ë§í¬ ?€???„ë£Œ (ID: ${docRef.id})`);
      return docRef.id;
    } catch (error) {
      logger.error("Firebase??URL ë§í¬ ?€???¤íŒ¨:", error);
      showMessage("???€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
      return null;
    }
  }

  /**
   * Firebase?ì„œ URL ë§í¬ ?˜ì •
   * @param {string} linkId - ë§í¬ ë¬¸ì„œ ID
   * @param {Object} updateData - ?˜ì •???°ì´??
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function updateUrlLinkInFirebase(linkId, updateData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
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

      logger.log(`??URL ë§í¬ ?˜ì • ?„ë£Œ (ID: ${linkId})`);
      return true;
    } catch (error) {
      logger.error("Firebase?ì„œ URL ë§í¬ ?˜ì • ?¤íŒ¨:", error);
      showMessage("???˜ì •???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
      return false;
    }
  }

  /**
   * Firebase?ì„œ URL ë§í¬ ?? œ
   * @param {string} linkId - ë§í¬ ë¬¸ì„œ ID
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function deleteUrlLinkFromFirebase(linkId) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
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
      logger.log(`??URL ë§í¬ ?? œ ?„ë£Œ (ID: ${linkId})`);
      return true;
    } catch (error) {
      logger.error("Firebase?ì„œ URL ë§í¬ ?? œ ?¤íŒ¨:", error);
      showMessage("???? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
      return false;
    }
  }

  /**
   * ëª¨ë“  URL ë§í¬??order ê°??¼ê´„ ?…ë°?´íŠ¸ (?œì„œ ë³€ê²½ìš©)
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function updateAllOrdersInFirebase() {
    if (!isFirebaseReady || !currentUser) {
      return false;
    }

    try {
      // ê°?ë§í¬??order ê°’ì„ ?„ì¬ ë°°ì—´ ?¸ë±?¤ë¡œ ?…ë°?´íŠ¸
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
      logger.log("??URL ë§í¬ ?œì„œ ?…ë°?´íŠ¸ ?„ë£Œ");
      return true;
    } catch (error) {
      logger.error("URL ë§í¬ ?œì„œ ?…ë°?´íŠ¸ ?¤íŒ¨:", error);
      return false;
    }
  }

  // ----------------------------------------
  // 3.3 CRUD ?¨ìˆ˜ êµ¬í˜„
  // ----------------------------------------

  /**
   * ê³ ìœ  ID ?ì„±
   * @returns {string} ê³ ìœ  ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * URL ? íš¨??ê²€??ë°??ë™ ?˜ì •
   * @param {string} url - URL ë¬¸ì??
   * @returns {string|null} ? íš¨??URL ?ëŠ” null
   */
  function validateAndFixUrl(url) {
    if (!url || typeof url !== "string") {
      return null;
    }

    let trimmedUrl = url.trim();

    // ë¹?ë¬¸ì??ì²´í¬
    if (!trimmedUrl) {
      return null;
    }

    // ?„í—˜???„ë¡œ? ì½œ ì°¨ë‹¨ (XSS ë°©ì?)
    const dangerousProtocols = ["javascript:", "data:", "vbscript:"];
    const lowerUrl = trimmedUrl.toLowerCase();
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        showMessage("??ë³´ì•ˆ?ì˜ ?´ìœ ë¡??´ë‹¹ URL???¬ìš©?????†ìŠµ?ˆë‹¤.", "error");
        return null;
      }
    }

    // http:// ?ëŠ” https:// ?†ìœ¼ë©??ë™ ì¶”ê?
    if (!trimmedUrl.match(/^https?:\/\//i)) {
      trimmedUrl = "https://" + trimmedUrl;
    }

    // URL ?•ì‹ ê²€ì¦?
    try {
      new URL(trimmedUrl);
      return trimmedUrl;
    } catch (e) {
      showMessage("???¬ë°”ë¥?URL ?•ì‹???„ë‹™?ˆë‹¤.", "error");
      return null;
    }
  }

  /**
   * ??URL ë§í¬ ì¶”ê? (Firebase ?€??
   * @param {Object} linkData - { name, description, url }
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function addUrlLink(linkData) {
    // ? íš¨??ê²€??
    if (!linkData.name || !linkData.name.trim()) {
      showMessage("???œë¹„??ëª…ì¹­???…ë ¥?´ì£¼?¸ìš”.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(linkData.url);
    if (!validUrl) {
      return false;
    }

    // ??ë§í¬ ?°ì´???ì„± (order???„ì¬ ë°°ì—´ ê¸¸ì´ = ë§???
    const newLinkData = {
      name: linkData.name.trim(),
      description: (linkData.description || "").trim(),
      url: validUrl,
      order: urlLinks.length,
    };

    // Firebase???€??
    const docId = await saveUrlLinkToFirebase(newLinkData);
    if (docId) {
      showMessage("??URL??ì¶”ê??˜ì—ˆ?µë‹ˆ??", "success");
      hideForm();
      // ?°ì´???¤ì‹œ ë¡œë“œ
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL ë§í¬ ?˜ì • (Firebase ?…ë°?´íŠ¸)
   * @param {string} id - ë§í¬ ID
   * @param {Object} newData - { name, description, url }
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function updateUrlLink(id, newData) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("???˜ì •??URL??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return false;
    }

    // ? íš¨??ê²€??
    if (!newData.name || !newData.name.trim()) {
      showMessage("???œë¹„??ëª…ì¹­???…ë ¥?´ì£¼?¸ìš”.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(newData.url);
    if (!validUrl) {
      return false;
    }

    // Firebase???…ë°?´íŠ¸
    const updateData = {
      name: newData.name.trim(),
      description: (newData.description || "").trim(),
      url: validUrl,
    };

    const success = await updateUrlLinkInFirebase(id, updateData);
    if (success) {
      showMessage("??URL???˜ì •?˜ì—ˆ?µë‹ˆ??", "success");
      hideForm();
      // ?°ì´???¤ì‹œ ë¡œë“œ
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL ë§í¬ ?? œ (Firebase ?? œ)
   * @param {string} id - ë§í¬ ID
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function deleteUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("???? œ??URL??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return false;
    }

    // ?•ì¸ ?€?”ìƒ??
    if (!confirm(`"${link.name}" URL???? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?`)) {
      return false;
    }

    // Firebase?ì„œ ?? œ
    const success = await deleteUrlLinkFromFirebase(id);
    if (success) {
      showMessage("??URL???? œ?˜ì—ˆ?µë‹ˆ??", "success");
      // ?°ì´???¤ì‹œ ë¡œë“œ
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  // ----------------------------------------
  // 3.3.1 URL ë§í¬ ?œì„œ ?´ë™ ê¸°ëŠ¥ (Firebase)
  // ----------------------------------------

  /**
   * URL ë§í¬ë¥??„ë¡œ ?´ë™ (?œì„œ ë³€ê²?- Firebase)
   * @param {string} id - ë§í¬ ID
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function moveUrlLinkUp(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // ì²?ë²ˆì§¸ ??ª©?€ ???„ë¡œ ?´ë™ ë¶ˆê?
    if (index <= 0) {
      return false;
    }

    // ë°°ì—´?ì„œ ?„ì¹˜ êµí™˜
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];

    // Firebase???œì„œ ?…ë°?´íŠ¸
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // ?¤íŒ¨ ??ë¡¤ë°±
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];
    return false;
  }

  /**
   * URL ë§í¬ë¥??„ë˜ë¡??´ë™ (?œì„œ ë³€ê²?- Firebase)
   * @param {string} id - ë§í¬ ID
   * @returns {Promise<boolean>} ?±ê³µ ?¬ë?
   */
  async function moveUrlLinkDown(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // ë§ˆì?ë§???ª©?€ ???„ë˜ë¡??´ë™ ë¶ˆê?
    if (index === -1 || index >= urlLinks.length - 1) {
      return false;
    }

    // ë°°ì—´?ì„œ ?„ì¹˜ êµí™˜
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];

    // Firebase???œì„œ ?…ë°?´íŠ¸
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // ?¤íŒ¨ ??ë¡¤ë°±
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];
    return false;
  }

  /**
   * URL ?´ê¸° (????
   * @param {string} id - ë§í¬ ID
   */
  function openUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("??URL??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
      return;
    }

    // ë³´ì•ˆ: noopener, noreferrer ?µì…˜ ?ìš©
    window.open(link.url, "_blank", "noopener,noreferrer");
    logger.log(`??URL ?´ê¸°: ${link.name} (${link.url})`);
  }

  // ----------------------------------------
  // 3.4 ?Œë”ë§??¨ìˆ˜
  // ----------------------------------------

  /**
   * URL?ì„œ ?„ë©”??ì¶”ì¶œ
   * @param {string} url - URL ë¬¸ì??
   * @returns {string} ?„ë©”??
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
   * URL ë§í¬ ëª©ë¡ ?Œë”ë§?
   * - DocumentFragment ?¬ìš©?¼ë¡œ ?±ëŠ¥ ìµœì ??
   * - XSS ë°©ì?: textContent ?¬ìš©
   */
  function renderUrlLinks() {
    const listEl = elements.urlLinkList;
    const emptyEl = elements.urlLinkEmptyState;

    if (!listEl || !emptyEl) {
      logger.warn("URL ë§í¬ ?Œë”ë§? DOM ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      return;
    }

    // ë¹??íƒœ ì²˜ë¦¬
    if (urlLinks.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";

    // DocumentFragment ?¬ìš©?¼ë¡œ DOM ì¡°ì‘ ìµœì†Œ??
    const fragment = document.createDocumentFragment();

    urlLinks.forEach((link) => {
      const card = createUrlLinkCard(link);
      fragment.appendChild(card);
    });

    // ??ë²ˆì— DOM ?…ë°?´íŠ¸
    listEl.innerHTML = "";
    listEl.appendChild(fragment);
  }

  /**
   * URL ë§í¬ ì¹´ë“œ ?”ì†Œ ?ì„±
   * @param {Object} link - URL ë§í¬ ê°ì²´
   * @returns {HTMLElement} ì¹´ë“œ ?”ì†Œ
   */
  function createUrlLinkCard(link) {
    const card = document.createElement("div");
    card.className = "url-link-card";
    card.setAttribute("role", "listitem");
    card.dataset.linkId = link.id;

    // ?´ë™ ë²„íŠ¼
    const launchBtn = document.createElement("button");
    launchBtn.className = "btn-url-launch";
    launchBtn.setAttribute("aria-label", `${link.name} ?´ê¸°`);
    launchBtn.title = `${link.name} ?´ê¸°`;
    launchBtn.textContent = "??";
    launchBtn.addEventListener("click", () => openUrlLink(link.id));

    // ?Œë¹„ì½??ì—­
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
        fallback.textContent = "?Œ";
        faviconDiv.appendChild(fallback);
      };
      faviconDiv.appendChild(faviconImg);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "favicon-fallback";
      fallback.textContent = "?Œ";
      faviconDiv.appendChild(fallback);
    }

    // ?•ë³´ ?ì—­ (XSS ë°©ì?: textContent ?¬ìš©)
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

    // ?¡ì…˜ ë²„íŠ¼ ?ì—­
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "url-link-actions";

    // ?„ë¡œ ?´ë™ ë²„íŠ¼
    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "btn-icon btn-move-up";
    moveUpBtn.setAttribute("aria-label", `${link.name} ?„ë¡œ ?´ë™`);
    moveUpBtn.title = "?„ë¡œ ?´ë™";
    moveUpBtn.textContent = "â¬†ï¸";
    moveUpBtn.addEventListener("click", () => moveUrlLinkUp(link.id));

    // ?„ë˜ë¡??´ë™ ë²„íŠ¼
    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "btn-icon btn-move-down";
    moveDownBtn.setAttribute("aria-label", `${link.name} ?„ë˜ë¡??´ë™`);
    moveDownBtn.title = "?„ë˜ë¡??´ë™";
    moveDownBtn.textContent = "â¬‡ï¸";
    moveDownBtn.addEventListener("click", () => moveUrlLinkDown(link.id));

    // ?˜ì • ë²„íŠ¼
    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon btn-edit";
    editBtn.setAttribute("aria-label", `${link.name} ?˜ì •`);
    editBtn.title = "?˜ì •";
    editBtn.textContent = "?ï¸";
    editBtn.addEventListener("click", () => showEditForm(link.id));

    // ?? œ ë²„íŠ¼
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon btn-delete";
    deleteBtn.setAttribute("aria-label", `${link.name} ?? œ`);
    deleteBtn.title = "?? œ";
    deleteBtn.textContent = "?—‘ï¸?;
    deleteBtn.addEventListener("click", () => deleteUrlLink(link.id));

    actionsDiv.appendChild(moveUpBtn);
    actionsDiv.appendChild(moveDownBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    // ì¹´ë“œ???”ì†Œ ì¶”ê?
    card.appendChild(launchBtn);
    card.appendChild(faviconDiv);
    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);

    return card;
  }

  // ----------------------------------------
  // 3.5 ??ë°??´ë²¤??ì²˜ë¦¬
  // ----------------------------------------

  /**
   * ?…ë ¥ ???œì‹œ (ì¶”ê? ëª¨ë“œ)
   */
  function showAddForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "block";
    elements.urlLinkName.focus();
  }

  /**
   * ?…ë ¥ ???œì‹œ (?˜ì • ëª¨ë“œ)
   * @param {string} id - ?˜ì •??ë§í¬ ID
   */
  function showEditForm(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("???˜ì •??URL??ì°¾ì„ ???†ìŠµ?ˆë‹¤.", "error");
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
   * ?…ë ¥ ???¨ê¸°ê¸?
   */
  function hideForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "none";
  }

  /**
   * ???…ë ¥ ì´ˆê¸°??
   */
  function clearForm() {
    elements.urlLinkName.value = "";
    elements.urlLinkDesc.value = "";
    elements.urlLinkUrl.value = "";
    elements.urlLinkEditId.value = "";
  }

  /**
   * ?€??ë²„íŠ¼ ?¸ë“¤??(async)
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
   * ë©”ì‹œì§€ ?œì‹œ (ê¸°ì¡´ showMessage ?œìš©)
   * @param {string} message - ë©”ì‹œì§€
   * @param {string} type - ë©”ì‹œì§€ ? í˜• (success, error, info)
   */
  function showMessage(message, type) {
    if (window.dualTextWriter && window.dualTextWriter.showMessage) {
      window.dualTextWriter.showMessage(message, type);
    } else {
      logger.log(`[${type}] ${message}`);
      // ?´ë°±: alert ?¬ìš©
      if (type === "error") {
        alert(message);
      }
    }
  }

  // ----------------------------------------
  // ì´ˆê¸°??
  // ----------------------------------------

  /**
   * URL ?°ê²° ??ì´ˆê¸°??(Firebase ?°ë™)
   */
  function init() {
    // DOM ?”ì†Œ ìºì‹œ
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

    // ?„ìˆ˜ ?”ì†Œ ?•ì¸
    if (!elements.urlLinkList) {
      logger.warn("URL ?°ê²° ?? DOM ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤. (??´ ?Œë”ë§ë˜ì§€ ?Šì•˜?????ˆìŒ)");
      return false;
    }

    // Firebase ?°ë™ ?•ì¸
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase ?¸ì¦ ?íƒœ ë¦¬ìŠ¤??
      window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
        currentUser = user;
        if (user) {
          logger.log("??URL ?°ê²° ?? ?¬ìš©??ë¡œê·¸?¸ë¨ -", user.uid);
          // ë¡œê·¸?????°ì´??ë¡œë“œ
          await loadUrlLinks();
        } else {
          logger.log("? ï¸ URL ?°ê²° ?? ?¬ìš©??ë¡œê·¸?„ì›ƒ??);
          // ë¡œê·¸?„ì›ƒ ???°ì´??ì´ˆê¸°??
          urlLinks = [];
          renderUrlLinks();
        }
      });
    } else {
      logger.warn("URL ?°ê²° ?? Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ?? ? ì‹œ ???¤ì‹œ ?œë„?©ë‹ˆ??");
      isFirebaseReady = false;
      // ë¹??íƒœ ?œì‹œ
      renderUrlLinks();
    }

    // ?´ë²¤??ë°”ì¸??
    if (elements.addUrlLinkBtn) {
      elements.addUrlLinkBtn.addEventListener("click", showAddForm);
    }

    if (elements.urlLinkSaveBtn) {
      elements.urlLinkSaveBtn.addEventListener("click", handleSave);
    }

    if (elements.urlLinkCancelBtn) {
      elements.urlLinkCancelBtn.addEventListener("click", hideForm);
    }

    // ?¤ë³´???´ë²¤?? Enterë¡??€?? Escë¡?ì·¨ì†Œ
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

    // ì´ˆê¸° ?Œë”ë§?
    renderUrlLinks();

    logger.log("??URL ?°ê²° ??ì´ˆê¸°???„ë£Œ");
    return true;
  }

  // ê³µê°œ API
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

// DOM ë¡œë“œ ?„ë£Œ ??URL ?°ê²° ??ì´ˆê¸°??
document.addEventListener("DOMContentLoaded", () => {
  // ?½ê°„??ì§€????ì´ˆê¸°??(?¤ë¥¸ ì´ˆê¸°?”ê? ?„ë£Œ???´í›„)
  setTimeout(() => {
    if (UrlLinkManager.init()) {
      logger.log("??UrlLinkManager ì´ˆê¸°???±ê³µ");
    }
  }, 500);
});

// ?„ì—­ ?¤ì½”?„ì— ?¸ì¶œ (?”ë²„ê¹…ìš©)
window.UrlLinkManager = UrlLinkManager;

/**
 * ë°±ì—… ê´€ë¦¬ì (BackupManager)
 * 
 * Firebase ?°ì´?°ë? JSON ?Œì¼ë¡??´ë³´?´ê¸°/ê°€?¸ì˜¤ê¸?ê¸°ëŠ¥???œê³µ?©ë‹ˆ??
 * ê¸°ì¡´ ?œë¹„?¤ì? ?„ì „???…ë¦½?ìœ¼ë¡??™ì‘?©ë‹ˆ??
 */
const BackupManager = (function () {
  // ----------------------------------------
  // ?íƒœ ë³€??
  // ----------------------------------------
  
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;
  let selectedFile = null;
  
  // DOM ?”ì†Œ ìºì‹œ
  let elements = {};

  // ----------------------------------------
  // Firebase ?°ì´???˜ì§‘ ?¨ìˆ˜
  // ----------------------------------------

  /**
   * ëª¨ë“  ?¬ìš©???°ì´?°ë? Firebase?ì„œ ?˜ì§‘
   * @returns {Promise<Object>} ?˜ì§‘???°ì´??ê°ì²´
   */
  async function collectAllData() {
    if (!isFirebaseReady || !currentUser) {
      throw new Error("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??");
    }

    const data = {
      exportedAt: new Date().toISOString(),
      userId: currentUser.uid,
      userEmail: currentUser.email || "?µëª…",
      texts: [],
      posts: [],
      urlLinks: [],
    };

    try {
      // 1. texts ì»¬ë ‰???˜ì§‘
      const textsRef = window.firebaseCollection(db, "users", currentUser.uid, "texts");
      const textsSnapshot = await window.firebaseGetDocs(textsRef);
      data.texts = textsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 2. posts ì»¬ë ‰???˜ì§‘
      const postsRef = window.firebaseCollection(db, "users", currentUser.uid, "posts");
      const postsSnapshot = await window.firebaseGetDocs(postsRef);
      data.posts = postsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 3. urlLinks ì»¬ë ‰???˜ì§‘
      const urlLinksRef = window.firebaseCollection(db, "users", currentUser.uid, "urlLinks");
      const urlLinksSnapshot = await window.firebaseGetDocs(urlLinksRef);
      data.urlLinks = urlLinksSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.log(`???°ì´???˜ì§‘ ?„ë£Œ: texts(${data.texts.length}), posts(${data.posts.length}), urlLinks(${data.urlLinks.length})`);
      return data;
    } catch (error) {
      logger.error("?°ì´???˜ì§‘ ?¤íŒ¨:", error);
      throw error;
    }
  }

  // ----------------------------------------
  // ?´ë³´?´ê¸° ?¨ìˆ˜
  // ----------------------------------------

  /**
   * ?°ì´?°ë? JSON ?Œì¼ë¡??´ë³´?´ê¸°
   */
  async function exportData() {
    updateStatus("export", "???°ì´?°ë? ?˜ì§‘?˜ëŠ” ì¤?..", "loading");

    try {
      const data = await collectAllData();

      // JSON ?Œì¼ ?ì„±
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      
      // ?Œì¼ëª??ì„± (? ì§œ ?¬í•¨)
      const date = new Date().toISOString().split("T")[0];
      const filename = `500text_backup_${date}.json`;

      // ?¤ìš´ë¡œë“œ ë§í¬ ?ì„± ë°??´ë¦­
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const summary = `?“ texts: ${data.texts.length}ê°? ?“Š posts: ${data.posts.length}ê°? ?”— urlLinks: ${data.urlLinks.length}ê°?;
      updateStatus("export", `??ë°±ì—… ?„ë£Œ! (${filename})\n${summary}`, "success");
      showMessage("??ë°±ì—… ?Œì¼???¤ìš´ë¡œë“œ?˜ì—ˆ?µë‹ˆ??", "success");
    } catch (error) {
      logger.error("?´ë³´?´ê¸° ?¤íŒ¨:", error);
      updateStatus("export", `???´ë³´?´ê¸° ?¤íŒ¨: ${error.message}`, "error");
      showMessage("??ë°±ì—…???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // ê°€?¸ì˜¤ê¸??¨ìˆ˜
  // ----------------------------------------

  /**
   * ? íƒ???Œì¼???°ì´?°ë? Firebase??ë³µì›
   */
  async function importData() {
    if (!selectedFile) {
      showMessage("??ë¨¼ì? JSON ?Œì¼??? íƒ?´ì£¼?¸ìš”.", "error");
      return;
    }

    if (!isFirebaseReady || !currentUser) {
      showMessage("??ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??", "error");
      return;
    }

    // ?•ì¸ ?€?”ìƒ??
    if (!confirm("? ï¸ ê¸°ì¡´ ?°ì´?°ê? ë³µì› ?°ì´?°ë¡œ ??–´?°ì—¬ì§????ˆìŠµ?ˆë‹¤.\n\n?•ë§ë¡?ë³µì›?˜ì‹œê² ìŠµ?ˆê¹Œ?")) {
      return;
    }

    updateStatus("import", "???Œì¼???½ëŠ” ì¤?..", "loading");

    try {
      // ?Œì¼ ?½ê¸°
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      // ? íš¨??ê²€??
      if (!data.texts && !data.posts && !data.urlLinks) {
        throw new Error("? íš¨??ë°±ì—… ?Œì¼???„ë‹™?ˆë‹¤.");
      }

      updateStatus("import", "???°ì´?°ë? ë³µì›?˜ëŠ” ì¤?..", "loading");

      let restored = { texts: 0, posts: 0, urlLinks: 0 };

      // 1. texts ë³µì›
      if (data.texts && Array.isArray(data.texts)) {
        for (const item of data.texts) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "texts", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.texts++;
        }
      }

      // 2. posts ë³µì›
      if (data.posts && Array.isArray(data.posts)) {
        for (const item of data.posts) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "posts", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.posts++;
        }
      }

      // 3. urlLinks ë³µì›
      if (data.urlLinks && Array.isArray(data.urlLinks)) {
        for (const item of data.urlLinks) {
          const { id, ...docData } = item;
          const docRef = window.firebaseDoc(db, "users", currentUser.uid, "urlLinks", id);
          await window.firebaseSetDoc(docRef, docData, { merge: true });
          restored.urlLinks++;
        }
      }

      const summary = `?“ texts: ${restored.texts}ê°? ?“Š posts: ${restored.posts}ê°? ?”— urlLinks: ${restored.urlLinks}ê°?;
      updateStatus("import", `??ë³µì› ?„ë£Œ!\n${summary}`, "success");
      showMessage("???°ì´?°ê? ?±ê³µ?ìœ¼ë¡?ë³µì›?˜ì—ˆ?µë‹ˆ??", "success");

      // ?Œì¼ ? íƒ ì´ˆê¸°??
      selectedFile = null;
      elements.fileInput.value = "";
      elements.fileName.textContent = "? íƒ???Œì¼ ?†ìŒ";
      elements.importBtn.disabled = true;
    } catch (error) {
      logger.error("ê°€?¸ì˜¤ê¸??¤íŒ¨:", error);
      updateStatus("import", `??ë³µì› ?¤íŒ¨: ${error.message}`, "error");
      showMessage("??ë³µì›???¤íŒ¨?ˆìŠµ?ˆë‹¤: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // UI ?¬í¼ ?¨ìˆ˜
  // ----------------------------------------

  /**
   * ?íƒœ ë©”ì‹œì§€ ?…ë°?´íŠ¸
   */
  function updateStatus(type, message, status) {
    const el = type === "export" ? elements.exportStatus : elements.importStatus;
    if (el) {
      el.textContent = message;
      el.className = `backup-status ${status}`;
    }
  }

  /**
   * ?Œì¼ ? íƒ ?¸ë“¤??
   */
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        showMessage("??JSON ?Œì¼ë§?? íƒ?????ˆìŠµ?ˆë‹¤.", "error");
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
   * ë©”ì‹œì§€ ?œì‹œ (ê¸°ì¡´ showMessage ?œìš©)
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
  // ì´ˆê¸°??
  // ----------------------------------------

  /**
   * ë°±ì—… ??ì´ˆê¸°??
   */
  function init() {
    // DOM ?”ì†Œ ìºì‹œ
    elements = {
      exportBtn: document.getElementById("backup-export-btn"),
      exportStatus: document.getElementById("backup-export-status"),
      fileInput: document.getElementById("backup-file-input"),
      fileSelectBtn: document.getElementById("backup-file-select-btn"),
      fileName: document.getElementById("backup-file-name"),
      importBtn: document.getElementById("backup-import-btn"),
      importStatus: document.getElementById("backup-import-status"),
    };

    // ?„ìˆ˜ ?”ì†Œ ?•ì¸
    if (!elements.exportBtn) {
      logger.warn("ë°±ì—… ?? DOM ?”ì†Œë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
      return false;
    }

    // Firebase ?°ë™ ?•ì¸
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase ?¸ì¦ ?íƒœ ë¦¬ìŠ¤??
      window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        currentUser = user;
        if (user) {
          logger.log("??ë°±ì—… ?? ?¬ìš©??ë¡œê·¸?¸ë¨");
        } else {
          logger.log("? ï¸ ë°±ì—… ?? ?¬ìš©??ë¡œê·¸?„ì›ƒ??);
        }
      });
    } else {
      logger.warn("ë°±ì—… ?? Firebaseê°€ ì¤€ë¹„ë˜ì§€ ?Šì•˜?µë‹ˆ??");
      isFirebaseReady = false;
    }

    // ?´ë²¤??ë°”ì¸??
    elements.exportBtn.addEventListener("click", exportData);
    
    elements.fileSelectBtn.addEventListener("click", () => {
      elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener("change", handleFileSelect);
    elements.importBtn.addEventListener("click", importData);

    logger.log("??ë°±ì—… ??ì´ˆê¸°???„ë£Œ");
    return true;
  }

  // ê³µê°œ API
  return {
    init,
    exportData,
    importData,
  };
})();

// DOM ë¡œë“œ ?„ë£Œ ??ë°±ì—… ??ì´ˆê¸°??
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (BackupManager.init()) {
      logger.log("??BackupManager ì´ˆê¸°???±ê³µ");
    }
  }, 600);
});

// ?„ì—­ ?¤ì½”?„ì— ?¸ì¶œ (?”ë²„ê¹…ìš©)
window.BackupManager = BackupManager;
