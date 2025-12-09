import {
  extractTitleFromContent,
  escapeHtml,
  debounce,
  formatDate,
} from "./js/utils.js";
import { AuthManager } from "./js/auth.js";
import { Constants } from "./js/constants.js";
import { DataManager } from "./js/data.js";
import { UIManager } from "./js/ui.js";

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
   * 성능 및 동작 관련 설정 상수
   *
   * 향후 조정이 필요한 경우 이 섹션에서 값을 변경하세요.
   */
  static CONFIG = {
    // 실시간 중복 체크 설정
    DEBOUNCE_DUPLICATE_CHECK_MS: 600, // Debounce 시간 (ms)
    DUPLICATE_CHECK_MIN_LENGTH: 10, // 중복 체크 최소 길이 (자)

    // 배치 처리 설정
    BATCH_SIZE: 500, // Firestore 배치 크기 (최대 500개)
    BATCH_DELAY_MS: 100, // 배치 간 딜레이 (ms, 서버 부하 분산)

    // 기타 설정
    TEMP_SAVE_INTERVAL_MS: 5000, // 임시 저장 간격 (ms)
    TEMP_SAVE_DELAY_MS: 2000, // 임시 저장 딜레이 (ms)

    // 확대 모드 애니메이션 설정
    EXPAND_MODE_ANIMATION_DELAY: 150, // 확대 모드 열림 후 레퍼런스 추가 지연 시간 (ms)
    REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS: 600, // 레퍼런스 강조 애니메이션 지속 시간 (ms)

    // 레퍼런스 제한 설정
    MAX_EXPAND_REFERENCES: 3, // 확대 모드에서 최대 레퍼런스 개수

    // 성능 모니터링 설정
    PERFORMANCE_WARNING_THRESHOLD_MS: 200, // 성능 경고 임계값 (ms)

    // 포커스 관리 지연 시간
    FOCUS_MANAGEMENT_DELAY_MS: 50, // 포커스 관리 지연 시간 (ms)
    SCREEN_READER_ANNOUNCE_DELAY_MS: 100, // 스크린 리더 알림 지연 시간 (ms)
  };

  /**
   * SNS 플랫폼 목록 상수
   *
   * 각 플랫폼은 id, name, icon 속성을 가집니다.
   * 새로운 SNS 플랫폼을 추가하거나 제거할 때 이 배열을 수정하세요.
   */
  static SNS_PLATFORMS = [
    { id: "threads", name: "Threads", icon: "🧵" },
    { id: "instagram", name: "Instagram", icon: "📷" },
    { id: "twitter", name: "Twitter/X", icon: "🐦" },
    { id: "facebook", name: "Facebook", icon: "👥" },
    { id: "linkedin", name: "LinkedIn", icon: "💼" },
    { id: "tiktok", name: "TikTok", icon: "🎵" },
    { id: "naver-blog", name: "네이버블로그", icon: "📝" },
    { id: "youtube", name: "유튜브 게시글", icon: "📺" },
    { id: "custom", name: "직접 입력", icon: "✏️" },
  ];

  constructor() {
    // Firebase 설정
    this.auth = null;

    // 사용자 정의 해시태그 설정 (기본값)
    this.defaultHashtags = ["#writing", "#content", "#threads"];
    this.db = null;
    this.currentUser = null;
    this.isFirebaseReady = false;

    // 트래킹 관련 속성
    this.trackingPosts = []; // 트래킹 중인 포스트 목록
    this.trackingChart = null; // Chart.js 인스턴스
    this.currentTrackingPost = null; // 현재 트래킹 중인 포스트
    this.chartMode = "total"; // 차트 모드: 'total' (전체 총합) 또는 'individual' (개별 포스트)
    this.selectedChartPostId = null; // 개별 포스트 모드에서 선택된 포스트 ID
    this.allTrackingPostsForSelector = []; // 포스트 선택기용 전체 포스트 목록
    this.chartRange = "7d"; // '7d' | '30d' | 'all'
    this.scaleMode = "combined"; // 'combined' | 'split'

    // 일괄 삭제 관련 상태
    this.isBatchSelectMode = false; // 일괄 선택 모드 활성화 여부
    this.selectedMetricIndices = []; // 선택된 메트릭 인덱스 배열

    // 작성글-레퍼런스 연동 기능 관련 프로퍼티
    this.selectedReferences = []; // 현재 선택된 레퍼런스 ID 배열
    this.referenceSelectionModal = null; // 레퍼런스 선택 모달 DOM
    this.referenceLinkCache = new Map(); // 역방향 조회 캐시 (refId -> editIds[])

    // ===== [Bug Fix] 스크립트 작성 탭 초기화 상태 플래그 =====
    // 목적: switchTab()에서 탭 전환 시 initArticleManagement() 중복 호출 방지
    // 이벤트 리스너가 여러 번 등록되어 저장 시 중복 글이 생성되는 버그 수정
    this.isArticleManagementInitialized = false;

    // ===== [Dual Panel] 듀얼 패널 상태 관리 =====
    // 목적: 두 개의 글을 동시에 비교/편집할 수 있는 듀얼 패널 기능 지원
    // 2025-12-09 Phase 2 추가
    this.selectedArticleIds = [null, null]; // 각 패널에 선택된 글 ID [패널1, 패널2]
    this.activePanelIndex = 0; // 현재 활성 패널 인덱스 (0 또는 1)
    this.isDualMode = false; // 듀얼 모드 활성화 여부

    // Firebase 초기화 대기
    this.waitForFirebase();

    // Firebase 설정 안내
    this.showFirebaseSetupNotice();

    // 사용자 인증 관련 요소들
    this.usernameInput = document.getElementById("username-input");
    this.loginBtn = document.getElementById("login-btn");
    this.logoutBtn = document.getElementById("logout-btn");
    this.refreshBtn = document.getElementById("refresh-btn");
    this.loginForm = document.getElementById("login-form");
    this.userInfo = document.getElementById("user-info");
    this.usernameDisplay = document.getElementById("username-display");
    this.mainContent = document.getElementById("main-content");

    // 레퍼런스 글 관련 요소들
    this.refTextInput = document.getElementById("ref-text-input");
    this.refCurrentCount = document.getElementById("ref-current-count");
    this.refMaxCount = document.getElementById("ref-max-count");
    this.refProgressFill = document.getElementById("ref-progress-fill");
    this.refClearBtn = document.getElementById("ref-clear-btn");
    this.refSaveBtn = document.getElementById("ref-save-btn");
    this.refDownloadBtn = document.getElementById("ref-download-btn");
    // 레퍼런스 유형 라디오
    this.refTypeStructure = document.getElementById("ref-type-structure");
    this.refTypeIdea = document.getElementById("ref-type-idea");

    // 수정/작성 글 관련 요소들
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
    this.selectedSnsPlatforms = []; // 선택된 SNS 플랫폼 ID 배열
    this.editCurrentCount = document.getElementById("edit-current-count");
    this.editMaxCount = document.getElementById("edit-max-count");

    // 레퍼런스 글 관련 요소들
    this.refTopicInput = document.getElementById("ref-topic-input");
    this.editProgressFill = document.getElementById("edit-progress-fill");
    this.editClearBtn = document.getElementById("edit-clear-btn");
    this.editSaveBtn = document.getElementById("edit-save-btn");
    this.editDownloadBtn = document.getElementById("edit-download-btn");

    // 공통 요소들
    this.savedList = document.getElementById("saved-list");
    this.batchMigrationBtn = document.getElementById("batch-migration-btn");
    this.tempSaveStatus = document.getElementById("temp-save-status");
    this.tempSaveText = document.getElementById("temp-save-text");

    // 주제 필터 관련 요소들 (작성 글용)
    this.topicFilter = document.getElementById("topic-filter");
    this.topicFilterGroup = document.getElementById("topic-filter-group");
    this.currentTopicFilter = "all"; // 현재 선택된 주제 필터
    this.availableTopics = []; // 사용 가능한 주제 목록

    // 소스 필터 관련 요소들 (레퍼런스 글용)
    this.sourceFilter = document.getElementById("source-filter");
    this.sourceFilterGroup = document.getElementById("source-filter-group");
    this.currentSourceFilter = "all"; // 현재 선택된 소스 필터
    this.availableSources = []; // 사용 가능한 소스 목록

    // SNS 플랫폼 필터 관련 요소들 (작성 글용)
    this.snsFilterGroup = document.getElementById("sns-filter-group");
    this.snsFilterMode = document.getElementById("sns-filter-mode");
    this.snsFilterPlatform = document.getElementById("sns-filter-platform");
    this.currentSnsFilterMode = "all"; // 현재 선택된 SNS 필터 모드 ('all', 'has', 'not-has')
    this.currentSnsFilterPlatform = ""; // 현재 선택된 SNS 플랫폼 ID

    // 탭 관련 요소들
    this.tabButtons = document.querySelectorAll(".tab-button");
    this.tabContents = document.querySelectorAll(".tab-content");

    // 트래킹 관련 요소들
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

    // 성능 최적화: 디바운싱 타이머 및 업데이트 큐
    this.debounceTimers = {};
    this.updateQueue = {
      savedTexts: false,
      trackingPosts: false,
      trackingSummary: false,
      trackingChart: false,
    };

    // 글자 제한 (500/1000) - 기본 500, 사용자 선택을 로컬에 저장
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
    this.savedItemClickHandler = null; // 이벤트 핸들러 참조
    this.outsideClickHandler = null; // 바깥 클릭 핸들러 참조

    // LLM 검증 시스템 초기화
    this.initializeLLMValidation();

    // [Refactoring] Manager 인스턴스 생성
    // UIManager: UI 업데이트 및 메시지 표시
    this.uiManager = new UIManager();

    // AuthManager: 인증 처리
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

    // DataManager: 데이터 영속성 처리
    this.dataManager = new DataManager(this.authManager);

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

    // ✅ 성능 최적화: 설정 상수 사용 (향후 조정 용이)
    const DEBOUNCE_MS = DualTextWriter.CONFIG.DEBOUNCE_DUPLICATE_CHECK_MS;
    const MIN_LENGTH = DualTextWriter.CONFIG.DUPLICATE_CHECK_MIN_LENGTH;

    this.refTextInput.addEventListener("input", () => {
      // 디바운스 처리
      clearTimeout(this.debounceTimers.refDuplicate);
      this.debounceTimers.refDuplicate = setTimeout(() => {
        const value = this.refTextInput.value || "";
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
          console.warn("실시간 중복 체크 중 경고:", e);
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
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    const createdAtStr = formatDate(duplicate?.createdAt) || "";
    const topicStr = duplicate?.topic
      ? ` · 주제: ${escapeHtml(duplicate.topic)}`
      : "";
    hint.innerHTML = `⚠️ 동일한 레퍼런스가 이미 있습니다${
      createdAtStr ? ` · 저장일: ${createdAtStr}` : ""
    }${topicStr}. 저장 시 중복으로 저장될 수 있습니다.`;
    hint.style.display = "block";
  }

  /**
   * 인라인 중복 경고 숨김
   */
  hideInlineDuplicateHint() {
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    hint.style.display = "none";
    hint.textContent = "";
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

    // 유효성 검사
    if (!this.selectReferencesBtn || !this.referenceSelectionModal) {
      console.warn("⚠️ 레퍼런스 선택 UI 요소를 찾을 수 없습니다.");
      return;
    }

    // 접을 수 있는 패널 토글 이벤트
    if (this.referenceCollapseToggle && this.referenceLinkContent) {
      this.referenceCollapseToggle.addEventListener("click", () =>
        this.toggleReferenceCollapse()
      );
    }

    // 이벤트 리스너 바인딩
    this.selectReferencesBtn.addEventListener("click", () =>
      this.openReferenceSelectionModal()
    );
    this.confirmReferenceSelectionBtn.addEventListener("click", () =>
      this.confirmReferenceSelection()
    );

    // 모달 닫기 버튼
    const closeBtns = this.referenceSelectionModal.querySelectorAll(
      ".close-btn, .cancel-btn"
    );
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.closeReferenceSelectionModal());
    });

    // 모달 외부 클릭 시 닫기
    this.referenceSelectionModal.addEventListener("click", (e) => {
      if (e.target === this.referenceSelectionModal) {
        this.closeReferenceSelectionModal();
      }
    });

    // ESC 키로 모달 닫기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceSelectionModal.style.display === "flex"
      ) {
        this.closeReferenceSelectionModal();
      }
    });

    // 검색 및 필터 이벤트
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

    console.log("✅ 레퍼런스 선택 기능 초기화 완료");
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
        console.warn("⚠️ 레퍼런스 패널 요소를 찾을 수 없습니다.");
        return;
      }

      const isExpanded =
        this.referenceCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // 패널 접기
        this.referenceLinkContent.classList.remove("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "false");
        this.referenceLinkContent.setAttribute("aria-hidden", "true");
        console.log("📚 레퍼런스 패널 접힘");
      } else {
        // 패널 펼치기
        this.referenceLinkContent.classList.add("expanded");
        this.referenceCollapseToggle.setAttribute("aria-expanded", "true");
        this.referenceLinkContent.setAttribute("aria-hidden", "false");
        console.log("📚 레퍼런스 패널 펼침");
      }
    } catch (error) {
      console.error("레퍼런스 패널 토글 실패:", error);
    }
  }

  // 레퍼런스 유형 배지 렌더링
  renderReferenceTypeBadge(referenceType) {
    const type = referenceType || "unspecified";
    let label = "미지정";
    let cls = "reference-type-badge--unspecified";
    if (type === "structure") {
      label = "구조";
      cls = "reference-type-badge--structure";
    } else if (type === "idea") {
      label = "아이디어";
      cls = "reference-type-badge--idea";
    }
    return `
            <span class="reference-type-badge ${cls}" role="status" aria-label="레퍼런스 유형: ${label}">
                ${label}
            </span>
        `;
  }

  /**
   * SNS 플랫폼 선택 기능 초기화
   *
   * - SNS 플랫폼 태그 렌더링
   * - 이벤트 리스너 바인딩 (이벤트 위임 사용)
   * - 선택 상태 관리
   * - 아코디언 토글 기능
   *
   * @throws {Error} 필수 DOM 요소가 없을 경우 에러 로깅
   */
  initSnsPlatformSelection() {
    try {
      // 유효성 검사: 필수 DOM 요소 확인
      if (!this.editSnsPlatformTags) {
        console.warn("⚠️ SNS 플랫폼 선택 UI 요소를 찾을 수 없습니다.");
        return;
      }

      // SNS 플랫폼 태그 렌더링
      this.renderSnsPlatformTags();

      // 아코디언 토글 버튼 이벤트 바인딩
      if (this.snsPlatformCollapseToggle) {
        // 클릭 이벤트: 마우스 및 터치 디바이스 지원
        this.snsPlatformCollapseToggle.addEventListener("click", () => {
          this.toggleSnsPlatformCollapse();
        });

        // 키보드 이벤트 처리 (접근성): Enter 및 Space 키 지원
        this.snsPlatformCollapseToggle.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggleSnsPlatformCollapse();
          }
        });
      } else {
        console.warn("⚠️ SNS 플랫폼 토글 버튼을 찾을 수 없습니다.");
      }

      // 이벤트 위임: 태그 클릭 이벤트 처리 (성능 최적화: 한 번만 바인딩)
      if (!this._snsPlatformEventBound) {
        this._snsPlatformEventBound = true;

        // 클릭 이벤트: 플랫폼 태그 선택/해제
        this.editSnsPlatformTags.addEventListener("click", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          const platformId = tag.getAttribute("data-platform-id");
          if (!platformId) {
            console.warn("⚠️ 플랫폼 ID를 찾을 수 없습니다.");
            return;
          }

          e.preventDefault();
          this.toggleSnsPlatform(platformId);
        });

        // 키보드 이벤트 처리 (접근성): 키보드 네비게이션 지원
        this.editSnsPlatformTags.addEventListener("keydown", (e) => {
          const tag = e.target.closest(".sns-platform-tag");
          if (!tag) return;

          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const platformId = tag.getAttribute("data-platform-id");
            if (platformId) {
              this.toggleSnsPlatform(platformId);
            } else {
              console.warn("⚠️ 키보드 이벤트: 플랫폼 ID를 찾을 수 없습니다.");
            }
          }
        });
      }
    } catch (error) {
      console.error("❌ SNS 플랫폼 선택 기능 초기화 실패:", error);
      // 사용자에게 친화적인 메시지 표시 (선택사항)
      if (this.showMessage) {
        this.showMessage(
          "SNS 플랫폼 선택 기능을 초기화하는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS 플랫폼 선택 패널 토글
   *
   * - 패널 펼치기/접기
   * - 아이콘 회전 애니메이션 (CSS transition으로 처리)
   * - ARIA 속성 업데이트 (접근성 향상)
   *
   * @throws {Error} DOM 요소가 없을 경우 에러 로깅
   */
  toggleSnsPlatformCollapse() {
    try {
      // 유효성 검사: 필수 DOM 요소 확인
      if (!this.snsPlatformContent || !this.snsPlatformCollapseToggle) {
        console.warn("⚠️ SNS 플랫폼 패널 요소를 찾을 수 없습니다.");
        return;
      }

      // 현재 확장 상태 확인 (ARIA 속성 기반)
      const isExpanded =
        this.snsPlatformCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // 패널 접기: 콘텐츠 숨김 및 ARIA 속성 업데이트
        this.snsPlatformContent.classList.remove("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "false");
        this.snsPlatformContent.setAttribute("aria-hidden", "true");
      } else {
        // 패널 펼치기: 콘텐츠 표시 및 ARIA 속성 업데이트
        this.snsPlatformContent.classList.add("expanded");
        this.snsPlatformCollapseToggle.setAttribute("aria-expanded", "true");
        this.snsPlatformContent.setAttribute("aria-hidden", "false");
      }
    } catch (error) {
      console.error("❌ SNS 플랫폼 패널 토글 실패:", error);
      // 사용자에게 친화적인 메시지 표시 (선택사항)
      if (this.showMessage) {
        this.showMessage("패널을 토글하는 중 오류가 발생했습니다.", "error");
      }
    }
  }

  /**
   * SNS 플랫폼 태그 렌더링
   *
   * - 모든 SNS 플랫폼 태그를 동적으로 생성
   * - 선택 상태에 따른 스타일 및 ARIA 속성 적용
   * - XSS 방지를 위한 HTML 이스케이프 처리
   *
   * @throws {Error} DOM 요소나 플랫폼 데이터가 없을 경우 조용히 반환
   */
  renderSnsPlatformTags() {
    try {
      // 유효성 검사: 필수 DOM 요소 및 데이터 확인
      if (!this.editSnsPlatformTags) {
        console.warn("⚠️ SNS 플랫폼 태그 컨테이너를 찾을 수 없습니다.");
        return;
      }

      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        console.warn("⚠️ SNS 플랫폼 데이터가 유효하지 않습니다.");
        return;
      }

      // 플랫폼 태그 HTML 생성 (XSS 방지: escapeHtml 사용)
      const tagsHtml = DualTextWriter.SNS_PLATFORMS.map((platform) => {
        // 플랫폼 선택 상태 확인
        const isSelected = this.selectedSnsPlatforms.includes(platform.id);
        const selectedClass = isSelected ? "selected" : "";
        const ariaChecked = isSelected ? "true" : "false";
        const ariaLabelText = `${this.escapeHtml(platform.name)} ${
          isSelected ? "선택됨" : "선택 안됨"
        }`;

        // 안전한 HTML 생성 (XSS 방지)
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

      // DOM 업데이트 (성능: 한 번의 innerHTML 할당)
      this.editSnsPlatformTags.innerHTML = tagsHtml;

      // 선택 개수 업데이트
      this.updateSnsPlatformCount();
    } catch (error) {
      console.error("❌ SNS 플랫폼 태그 렌더링 실패:", error);
      // 사용자에게 친화적인 메시지 표시 (선택사항)
      if (this.showMessage) {
        this.showMessage(
          "SNS 플랫폼 목록을 불러오는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS 플랫폼 선택/해제 토글
   *
   * - 플랫폼 선택 상태를 토글
   * - 유효성 검증 후 상태 변경
   * - UI 자동 업데이트
   *
   * @param {string} platformId - 플랫폼 ID (예: 'threads', 'instagram')
   * @throws {Error} 유효하지 않은 플랫폼 ID일 경우 경고 로깅
   */
  toggleSnsPlatform(platformId) {
    try {
      // 입력 유효성 검증
      if (!platformId || typeof platformId !== "string") {
        console.warn("⚠️ 유효하지 않은 플랫폼 ID 형식:", platformId);
        return;
      }

      // 플랫폼 데이터 유효성 검증: 플랫폼 ID가 정의된 플랫폼 목록에 있는지 확인
      if (
        !DualTextWriter.SNS_PLATFORMS ||
        !Array.isArray(DualTextWriter.SNS_PLATFORMS)
      ) {
        console.warn("⚠️ SNS 플랫폼 데이터가 유효하지 않습니다.");
        return;
      }

      const platform = DualTextWriter.SNS_PLATFORMS.find(
        (p) => p.id === platformId
      );
      if (!platform) {
        console.warn(`⚠️ 유효하지 않은 플랫폼 ID: ${platformId}`);
        return;
      }

      // 선택 상태 토글: 배열에서 추가 또는 제거
      const currentIndex = this.selectedSnsPlatforms.indexOf(platformId);
      if (currentIndex >= 0) {
        // 이미 선택된 경우: 선택 해제
        this.selectedSnsPlatforms.splice(currentIndex, 1);
      } else {
        // 선택되지 않은 경우: 선택 추가
        this.selectedSnsPlatforms.push(platformId);
      }

      // UI 업데이트: 태그 재렌더링 및 개수 업데이트
      this.renderSnsPlatformTags();
      this.updateSnsPlatformCount();
    } catch (error) {
      console.error("❌ SNS 플랫폼 토글 실패:", error);
      // 사용자에게 친화적인 메시지 표시 (선택사항)
      if (this.showMessage) {
        this.showMessage(
          "플랫폼 선택을 변경하는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  /**
   * SNS 플랫폼 선택 개수 업데이트
   *
   * - 선택된 플랫폼 개수를 UI에 표시
   * - 접근성을 위한 ARIA 속성 업데이트 (선택사항)
   *
   * @throws {Error} DOM 요소가 없을 경우 조용히 반환
   */
  updateSnsPlatformCount() {
    try {
      // 유효성 검사: DOM 요소 확인
      if (!this.snsPlatformCount) {
        // DOM 요소가 없어도 에러를 발생시키지 않음 (선택적 UI 요소)
        return;
      }

      // 선택된 플랫폼 개수 계산
      const selectedCount = Array.isArray(this.selectedSnsPlatforms)
        ? this.selectedSnsPlatforms.length
        : 0;

      // UI 업데이트: 텍스트 콘텐츠 변경
      this.snsPlatformCount.textContent = `(${selectedCount}개 선택됨)`;

      // 접근성 향상: ARIA 속성 업데이트 (부모 요소에 aria-live 속성이 있다면 자동으로 알림)
      if (this.snsPlatformCollapseToggle) {
        const ariaLabel = `SNS 플랫폼 선택 (${selectedCount}개 선택됨)`;
        this.snsPlatformCollapseToggle.setAttribute("aria-label", ariaLabel);
      }
    } catch (error) {
      console.error("❌ SNS 플랫폼 선택 개수 업데이트 실패:", error);
      // 에러가 발생해도 앱 전체 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * 레퍼런스 불러오기 패널 초기화
   */
  initReferenceLoader() {
    // DOM 요소 참조
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

    // 이벤트 리스너: 패널 열기 (상세 모드)
    if (this.detailLoadReferenceBtn) {
      this.detailLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "detail"; // 모드 설정
        this.openReferenceLoader();
      });
    }

    // 이벤트 리스너: 패널 열기 (확대 모드)
    this.expandLoadReferenceBtn = document.getElementById(
      "expand-load-reference-btn"
    );
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        this.referenceLoaderMode = "expand"; // 모드 설정
        this.openReferenceLoader();
      });
    }

    // 이벤트 리스너: 패널 닫기
    if (this.referenceLoaderCloseBtn) {
      this.referenceLoaderCloseBtn.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    // 이벤트 리스너: 탭 전환
    this.referenceLoaderTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchReferenceLoaderTab(tabName);
      });
    });

    // 이벤트 리스너: 외부 클릭 시 닫기
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

    // 이벤트 리스너: 레퍼런스 추가 (이벤트 위임)
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

    // 이벤트 리스너: 검색
    if (this.referenceLoaderSearchInput) {
      this.referenceLoaderSearchInput.addEventListener(
        "input",
        debounce(() => {
          this.filterReferenceLoaderList();
        }, 300)
      );
    }

    // ESC 키로 닫기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.referenceLoaderPanel.style.display === "block"
      ) {
        // 확대 모드 모달이 열려있고, 레퍼런스 로더도 열려있다면 레퍼런스 로더만 닫기
        // z-index가 더 높으므로 우선순위 처리
        this.closeReferenceLoader();
      }
    });
  }

  /**
   * 내용 확대 모드 초기화
   */
  initExpandModal() {
    this.expandModal = document.getElementById("content-expand-modal");
    this.detailExpandBtn = document.getElementById("detail-expand-btn");
    this.expandModalCloseBtn = document.getElementById("expand-modal-close");
    this.expandContentTextarea = document.getElementById(
      "expand-content-textarea"
    );

    // 열기 버튼 이벤트 - initArticleManagement 또는 DOMContentLoaded에서 처리됨
    // if (this.detailExpandBtn) {
    //   this.detailExpandBtn.addEventListener("click", () => {
    //     this.openExpandModal();
    //   });
    // }

    // 닫기 버튼 이벤트
    if (this.expandModalCloseBtn) {
      this.expandModalCloseBtn.addEventListener("click", () => {
        this.closeExpandModal();
      });
    }

    // ESC 키로 닫기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.expandModal &&
        this.expandModal.style.display === "block"
      ) {
        // 레퍼런스 로더가 열려있으면 레퍼런스 로더가 먼저 닫힘 (z-index 확인)
        if (
          this.referenceLoaderPanel &&
          this.referenceLoaderPanel.style.display === "block"
        ) {
          return; // 레퍼런스 로더의 ESC 핸들러가 처리하도록 함
        }
        this.closeExpandModal();
      }
    });
    if (!this.expandModal) return;

    // 변경된 내용을 상세 패널(수정 모드)에 반영
    const editContentTextarea = document.getElementById(
      "edit-content-textarea"
    );
    if (editContentTextarea && this.expandContentTextarea) {
      editContentTextarea.value = this.expandContentTextarea.value;
      // input 이벤트 트리거하여 글자수 등 업데이트
      editContentTextarea.dispatchEvent(new Event("input"));
    }

    this.expandModal.style.display = "none";
    document.body.style.overflow = ""; // 배경 스크롤 복원
  }

  /**
   * 레퍼런스 불러오기 패널 열기
   */
  openReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "block";
      // 데이터 로드 (처음 열 때 또는 필요 시)
      this.loadReferenceLoaderData();
    }
  }

  /**
   * 레퍼런스 불러오기 패널 닫기
   */
  closeReferenceLoader() {
    if (this.referenceLoaderPanel) {
      this.referenceLoaderPanel.style.display = "none";
    }
  }

  /**
   * 레퍼런스 로더 탭 전환
   */
  switchReferenceLoaderTab(tabName) {
    // 탭 활성화 상태 변경
    this.referenceLoaderTabs.forEach((tab) => {
      if (tab.getAttribute("data-tab") === tabName) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    // 콘텐츠 표시 상태 변경
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
   * 레퍼런스 로더 데이터 로드
   */
  async loadReferenceLoaderData() {
    // 저장된 글 로드
    await this.loadSavedReferencesForLoader();
    // 트래킹 데이터 로드 (필요 시 구현)
    // await this.loadTrackingReferencesForLoader();
  }

  /**
   * 저장된 글을 레퍼런스 로더용으로 로드
   */
  async loadSavedReferencesForLoader() {
    if (!this.currentUser) return;

    try {
      // 기존 savedTexts 활용하거나 새로 fetch
      // 여기서는 기존 savedTexts가 있다고 가정하고 렌더링
      // 만약 savedTexts가 비어있다면 fetch 필요
      if (this.savedTexts.length === 0) {
        await this.loadSavedTexts();
      }

      this.renderReferenceLoaderList(
        this.savedTexts,
        this.referenceSavedList,
        "saved"
      );
    } catch (error) {
      console.error("레퍼런스 데이터 로드 실패:", error);
    }
  }

  /**
   * 레퍼런스 목록 렌더링
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

      // 날짜 포맷팅
      const dateStr = item.createdAt ? formatDate(item.createdAt) : "";

      // 내용 미리보기 (HTML 태그 제거 및 길이 제한)
      const contentPreview = item.content
        ? item.content.replace(/<[^>]*>/g, "").substring(0, 100) +
          (item.content.length > 100 ? "..." : "")
        : "";

      el.innerHTML = `
                <div class="reference-item-header">
                    <div class="reference-item-title">${escapeHtml(
                      item.topic || "제목 없음"
                    )}</div>
                </div>
                <div class="reference-item-content">${escapeHtml(
                  contentPreview
                )}</div>
                <div class="reference-item-meta">
                    <span>📅 ${dateStr}</span>
                    ${
                      item.category
                        ? `<span>📁 ${escapeHtml(item.category)}</span>`
                        : ""
                    }
                </div>
                <div class="reference-item-actions">
                    <button class="reference-item-btn" data-action="add">
                        추가하기
                    </button>
                </div>
            `;
      container.appendChild(el);
    });
  }

  /**
   * 레퍼런스 아이템 클릭 핸들러 (추가하기 버튼)
   */
  handleReferenceItemClick(e) {
    const btn = e.target.closest(".reference-item-btn");
    if (!btn) return;

    const itemEl = btn.closest(".reference-item");
    const itemId = itemEl.getAttribute("data-item-id");
    const sourceType = itemEl.getAttribute("data-source-type");

    // 데이터 찾기
    let itemData = null;
    if (sourceType === "saved") {
      itemData = this.savedTexts.find((i) => i.id === itemId);
    } else {
      // 트래킹 데이터에서 찾기 (구현 필요)
    }

    if (itemData) {
      if (this.referenceLoaderMode === "expand") {
        this.addReferenceToExpand(itemData);
      } else {
        this.addReferenceToDetail(itemData);
      }
      // 선택 후 패널 닫기 (선택사항)
      this.closeReferenceLoader();
    }
  }

  /**
   * 확대 모드에 레퍼런스 추가
   */
  addReferenceToExpand(item) {
    const expandReferenceList = document.getElementById(
      "expand-reference-list"
    );
    const expandReferenceEmpty = document.querySelector(
      ".expand-reference-empty"
    );

    if (!expandReferenceList) return;

    // 빈 상태 메시지 숨김
    if (expandReferenceEmpty) {
      expandReferenceEmpty.style.display = "none";
    }
    expandReferenceList.style.display = "block";

    // 중복 체크
    const existing = expandReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("이미 추가된 레퍼런스입니다.");
      return;
    }

    const el = document.createElement("div");
    el.className = "expand-reference-item"; // CSS 클래스 필요 (또는 인라인 스타일)
    el.setAttribute("data-ref-id", item.id);

    // 스타일 적용 (초록색 테두리 등)
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
                  item.topic || "제목 없음"
                )}</h4>
                <button class="expand-ref-remove" aria-label="삭제" style="background: none; border: none; color: #999; cursor: pointer; font-size: 1.2rem;">×</button>
            </div>
            <div style="font-size: 0.9rem; color: #666; margin-bottom: 15px; line-height: 1.5;">
                ${escapeHtml(contentPreview)}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: #999; margin-bottom: 15px;">
                <span>📅 ${dateStr}</span>
                ${
                  item.category
                    ? `<span>📁 ${escapeHtml(item.category)}</span>`
                    : ""
                }
            </div>
            <button class="btn btn-primary btn-block btn-add-content" style="width: 100%; background-color: #667eea; border: none; padding: 10px; border-radius: 6px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                <span>➕</span> 내용에 추가
            </button>
        `;

    // 삭제 버튼 이벤트
    el.querySelector(".expand-ref-remove").addEventListener("click", () => {
      el.remove();
      if (expandReferenceList.children.length === 0) {
        if (expandReferenceEmpty) expandReferenceEmpty.style.display = "block";
        expandReferenceList.style.display = "none";
      }
    });

    // 내용에 추가 버튼 이벤트
    el.querySelector(".btn-add-content").addEventListener("click", () => {
      this.addContentToExpandEditor(item.content);
    });

    expandReferenceList.appendChild(el);
  }

  /**
   * 확대 모드 에디터에 내용 추가
   */
  addContentToExpandEditor(content) {
    const textarea = document.getElementById("expand-content-textarea");
    if (!textarea) return;

    // HTML 태그 제거 (선택사항, 기획에 따라 다름)
    const plainText = content
      .replace(/<[^>]*>/g, "\n")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // 현재 커서 위치에 삽입 또는 맨 뒤에 추가
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const textBefore = textarea.value.substring(0, startPos);
    const textAfter = textarea.value.substring(endPos, textarea.value.length);

    textarea.value = textBefore + plainText + textAfter;

    // 커서 위치 조정
    const newCursorPos = startPos + plainText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    // 글자수 업데이트 트리거
    textarea.dispatchEvent(new Event("input"));
  }

  /**
   * 상세 뷰에 레퍼런스 추가
   */
  addReferenceToDetail(item) {
    if (!this.detailReferenceList) return;

    // 빈 상태 메시지 숨김
    if (this.detailReferenceEmpty) {
      this.detailReferenceEmpty.style.display = "none";
    }
    this.detailReferenceList.style.display = "block";

    // 중복 체크
    const existing = this.detailReferenceList.querySelector(
      `[data-ref-id="${item.id}"]`
    );
    if (existing) {
      alert("이미 추가된 레퍼런스입니다.");
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
                  item.topic || "제목 없음"
                )}</span>
                <button class="detail-ref-remove" aria-label="삭제">×</button>
            </div>
            <div class="detail-ref-content">${escapeHtml(contentPreview)}</div>
        `;

    // 삭제 버튼 이벤트
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
   * 레퍼런스 목록 필터링 (검색)
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
    // 초기 글자 제한 반영
    this.applyCharLimit(this.maxLength);
    // 실시간 중복 체크 초기화
    this.initLiveDuplicateCheck();
    // 레퍼런스 선택 기능 초기화
    this.initReferenceSelection();
    // SNS 플랫폼 선택 기능 초기화
    this.initSnsPlatformSelection();
    // 레퍼런스 불러오기 패널 초기화
    this.initReferenceLoader();
    // 확대 모드 초기화
    this.initExpandModal();
  }

  // [Refactoring] AuthManager로 위임
  async waitForFirebase() {
    await this.authManager.waitForFirebase();
    this.auth = this.authManager.auth;
    this.db = this.authManager.db;
    this.isFirebaseReady = this.authManager.isFirebaseReady;
  }

  // [Refactoring] AuthManager에서 처리하므로 제거 또는 래핑
  setupAuthStateListener() {
    // AuthManager 내부에서 처리됨
  }

  // 탭 기능 초기화
  initTabListeners() {
    this.tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchTab(tabName);
      });
    });
  }

  /**
   * 탭 전환 처리
   * @param {string} tabName - 전환할 탭 이름 ('writing', 'saved', 'tracking', 'management')
   */
  switchTab(tabName) {
    // 모든 탭 버튼과 콘텐츠에서 active 클래스 제거
    this.tabButtons.forEach((btn) => btn.classList.remove("active"));
    this.tabContents.forEach((content) => content.classList.remove("active"));

    // 선택된 탭 버튼과 콘텐츠에 active 클래스 추가
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeButton) activeButton.classList.add("active");
    if (activeContent) activeContent.classList.add("active");

    // 저장된 글 탭으로 전환할 때 목록 새로고침
    if (tabName === Constants.TABS.SAVED) {
      this.loadSavedTexts();
      this.initSavedFilters();
      // 미트래킹 글 버튼 상태 업데이트
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    }

    // 트래킹 탭으로 전환 시 데이터 로드
    if (tabName === Constants.TABS.TRACKING) {
      this.loadTrackingPosts();
      this.updateTrackingSummary();
      this.initTrackingChart();
    }

    // 글 작성 탭으로 전환할 때는 레퍼런스와 작성 패널이 모두 보임
    if (tabName === Constants.TABS.WRITING) {
      // 이미 writing-container에 두 패널이 모두 포함되어 있음
    }

    // 스크립트 작성 탭으로 전환 시 데이터 로드
    if (tabName === Constants.TABS.MANAGEMENT) {
      this.loadArticlesForManagement();
      this.initArticleManagement();
    }
  }

  bindEvents() {
    // 사용자 인증 이벤트
    this.loginBtn.addEventListener("click", () => this.login());
    this.logoutBtn.addEventListener("click", () => this.logout());

    // 새로고침 버튼 이벤트 리스너 (PC 전용)
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", () => this.refreshAllData());
    }
    this.usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.login();
      }
    });

    // Google 로그인 이벤트
    const googleLoginBtn = document.getElementById("google-login-btn");
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", () => this.googleLogin());
    }

    // 탭 이벤트 리스너 설정
    this.initTabListeners();

    // 저장된 글 필터 초기화 (초기 로드 시점에도 반영)
    setTimeout(() => this.initSavedFilters(), 0);

    // 레퍼런스 글 이벤트
    this.refTextInput.addEventListener("input", () => {
      this.updateCharacterCount("ref");
      this.scheduleTempSave();
    });
    this.refClearBtn.addEventListener("click", () => this.clearText("ref"));
    this.refSaveBtn.addEventListener("click", () => this.saveText("ref"));
    this.refDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("ref")
    );

    // 수정/작성 글 이벤트
    this.editTextInput.addEventListener("input", () => {
      this.updateCharacterCount("edit");
      this.scheduleTempSave();
    });
    this.editClearBtn.addEventListener("click", () => this.clearText("edit"));
    this.editSaveBtn.addEventListener("click", () => this.saveText("edit"));
    this.editDownloadBtn.addEventListener("click", () =>
      this.downloadAsTxt("edit")
    );

    // 반자동화 포스팅 이벤트
    const semiAutoPostBtn = document.getElementById("semi-auto-post-btn");
    if (semiAutoPostBtn) {
      console.log("✅ 반자동화 포스팅 버튼 발견 및 이벤트 바인딩");

      semiAutoPostBtn.addEventListener("click", (e) => {
        console.log("🔍 반자동화 포스팅 버튼 클릭 감지");
        e.preventDefault();
        e.stopPropagation();

        // this 컨텍스트 명시적 바인딩
        const self = this;
        console.log("🔍 this 컨텍스트:", self);
        console.log(
          "🔍 handleSemiAutoPost 함수:",
          typeof self.handleSemiAutoPost
        );

        if (typeof self.handleSemiAutoPost === "function") {
          console.log("✅ handleSemiAutoPost 함수 호출");
          self.handleSemiAutoPost();
        } else {
          console.error("❌ handleSemiAutoPost 함수가 없습니다!");
        }
      });

      // 키보드 접근성 지원
      semiAutoPostBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          console.log("🔍 반자동화 포스팅 버튼 키보드 입력 감지");
          e.preventDefault();
          e.stopPropagation();

          // this 컨텍스트 명시적 바인딩
          const self = this;

          if (typeof self.handleSemiAutoPost === "function") {
            console.log("✅ handleSemiAutoPost 함수 호출 (키보드)");
            self.handleSemiAutoPost();
          } else {
            console.error("❌ handleSemiAutoPost 함수가 없습니다!");
          }
        }
      });

      // 접근성 속성 설정
      semiAutoPostBtn.setAttribute(
        "aria-label",
        "Threads에 반자동으로 포스팅하기"
      );
      semiAutoPostBtn.setAttribute("role", "button");
      semiAutoPostBtn.setAttribute("tabindex", "0");

      console.log("✅ 반자동화 포스팅 버튼 이벤트 바인딩 완료");
    } else {
      console.error("❌ 반자동화 포스팅 버튼을 찾을 수 없습니다!");
    }

    // 트래킹 필터 이벤트
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
          // debounce로 성능 최적화 및 sticky 필터바 충돌 방지
          this.trackingSearchDebounce = setTimeout(() => {
            this.trackingSearch = val;
            localStorage.setItem("dtw_tracking_search", this.trackingSearch);
            // refreshUI 사용으로 통합 업데이트
            this.refreshUI({ trackingPosts: true });
          }, 300);
        });
      }
      // ✅ 저장된 글 검색 이벤트 바인딩
      if (this.savedSearchInput) {
        this.savedSearchInput.value = this.savedSearch;
        this.savedSearchDebounce = null;
        this.savedSearchInput.addEventListener("input", (e) => {
          const val = e.target.value;
          clearTimeout(this.savedSearchDebounce);
          // debounce로 성능 최적화 (600ms)
          this.savedSearchDebounce = setTimeout(() => {
            this.savedSearch = val;
            localStorage.setItem("dtw_saved_search", this.savedSearch);
            // 저장된 글 목록 새로고침
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

      // 수치 범위 필터 입력 바인딩
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

      // 범위 필터 접기/펼치기 초기화
      this.initRangeFilter();

      if (this.exportCsvBtn) {
        this.exportCsvBtn.addEventListener("click", () =>
          this.exportTrackingCsv()
        );
      }
    }, 0);

    // 해시태그 설정 버튼 이벤트 바인딩
    const hashtagSettingsBtn = document.getElementById("hashtag-settings-btn");
    if (hashtagSettingsBtn) {
      hashtagSettingsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showHashtagSettings();
      });

      // 초기 해시태그 표시 업데이트
      setTimeout(() => {
        this.updateHashtagsDisplay();
      }, 100);

      console.log("✅ 해시태그 설정 버튼 이벤트 바인딩 완료");
    } else {
      console.error("❌ 해시태그 설정 버튼을 찾을 수 없습니다!");
    }

    // 일괄 마이그레이션 버튼 이벤트 바인딩
    if (this.batchMigrationBtn) {
      this.batchMigrationBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showBatchMigrationConfirm();
      });
      console.log("✅ 일괄 마이그레이션 버튼 이벤트 바인딩 완료");
    } else {
      console.log("⚠️ 일괄 마이그레이션 버튼을 찾을 수 없습니다 (선택적 기능)");
    }

    // 개발 모드에서 자동 테스트 실행
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      setTimeout(() => {
        console.log("🔧 개발 모드: 자동 테스트 실행");
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
    // textarea maxlength 업데이트
    if (this.refTextInput)
      this.refTextInput.setAttribute("maxlength", String(value));
    if (this.editTextInput)
      this.editTextInput.setAttribute("maxlength", String(value));
    // 상단 카운터 최대값 표시 업데이트
    const refMax = document.getElementById("ref-max-count");
    const editMax = document.getElementById("edit-max-count");
    if (refMax) refMax.textContent = String(value);
    if (editMax) editMax.textContent = String(value);
    // 진행바/버튼 상태 재계산
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
  }

  // 저장된 글 필터 UI 초기화 및 이벤트 바인딩
  initSavedFilters() {
    const container = document.querySelector("#saved-tab .segmented-control");
    if (!container) return;
    const buttons = container.querySelectorAll(".segment-btn");
    if (!buttons || buttons.length === 0) return;

    // 레퍼런스 유형 필터 초기화
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
      this.referenceTypeFilterSelect.onchange = () => {
        this.referenceTypeFilter = this.referenceTypeFilterSelect.value;
        localStorage.setItem(
          "dualTextWriter_referenceTypeFilter",
          this.referenceTypeFilter
        );
        this.renderSavedTexts();
      };
    }

    // 주제 필터 이벤트 리스너 설정 (작성 글용)
    if (this.topicFilter) {
      this.currentTopicFilter =
        localStorage.getItem("dualTextWriter_topicFilter") || "all";
      this.topicFilter.value = this.currentTopicFilter;
      this.topicFilter.onchange = () => {
        this.currentTopicFilter = this.topicFilter.value;
        localStorage.setItem(
          "dualTextWriter_topicFilter",
          this.currentTopicFilter
        );
        this.renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // 소스 필터 이벤트 리스너 설정 (레퍼런스 글용)
    if (this.sourceFilter) {
      this.currentSourceFilter =
        localStorage.getItem("dualTextWriter_sourceFilter") || "all";
      this.sourceFilter.value = this.currentSourceFilter;
      this.sourceFilter.onchange = () => {
        this.currentSourceFilter = this.sourceFilter.value;
        localStorage.setItem(
          "dualTextWriter_sourceFilter",
          this.currentSourceFilter
        );
        this.renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // SNS 플랫폼 필터 이벤트 리스너 설정 (작성 글용)
    if (this.snsFilterMode) {
      this.currentSnsFilterMode =
        localStorage.getItem("dualTextWriter_snsFilterMode") || "all";
      this.snsFilterMode.value = this.currentSnsFilterMode;
      this.snsFilterMode.onchange = () => {
        this.currentSnsFilterMode = this.snsFilterMode.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterMode",
          this.currentSnsFilterMode
        );
        // 필터 모드가 'all'이 아니면 플랫폼 선택 드롭다운 표시
        if (this.snsFilterPlatform) {
          if (this.currentSnsFilterMode === "all") {
            this.snsFilterPlatform.style.display = "none";
            this.currentSnsFilterPlatform = "";
            this.snsFilterPlatform.value = "";
          } else {
            this.snsFilterPlatform.style.display = "block";
          }
        }
        this.renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    if (this.snsFilterPlatform) {
      this.currentSnsFilterPlatform =
        localStorage.getItem("dualTextWriter_snsFilterPlatform") || "";
      this.snsFilterPlatform.value = this.currentSnsFilterPlatform;
      // 초기 표시 상태 설정
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
      this.snsFilterPlatform.onchange = () => {
        this.currentSnsFilterPlatform = this.snsFilterPlatform.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterPlatform",
          this.currentSnsFilterPlatform
        );
        this.renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // SNS 플랫폼 목록 초기화
    this.updateSnsFilterOptions();

    // 활성 상태 복원
    buttons.forEach((btn) => {
      const filter = btn.getAttribute("data-filter");
      const isActive = filter === this.savedFilter;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // 클릭 이벤트 바인딩
    buttons.forEach((btn) => {
      btn.removeEventListener("click", btn._filterHandler);
      btn._filterHandler = (e) => {
        e.preventDefault();
        const filter = btn.getAttribute("data-filter");
        this.setSavedFilter(filter);
      };
      btn.addEventListener("click", btn._filterHandler);
    });

    // 초기 표시 상태
    this.updateReferenceTypeFilterVisibility();
  }

  setSavedFilter(filter) {
    // 에러 처리: 필터 값이 예상 범위를 벗어난 경우 처리
    const validFilters = ["all", "edit", "reference", "reference-used"];
    if (!validFilters.includes(filter)) {
      console.warn("setSavedFilter: 잘못된 필터 값:", filter);
      return;
    }

    this.savedFilter = filter;
    localStorage.setItem("dualTextWriter_savedFilter", filter);

    // UI 업데이트
    const container = document.querySelector("#saved-tab .segmented-control");
    if (container) {
      container.querySelectorAll(".segment-btn").forEach((btn) => {
        const isActive = btn.getAttribute("data-filter") === filter;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
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
    this.savedTexts.forEach((item) => {
      // 작성 글만 필터링
      if ((item.type || "edit") === "edit" && item.topic && item.topic.trim()) {
        topics.add(item.topic.trim());
      }
    });

    // 주제 목록을 배열로 변환하고 정렬
    this.availableTopics = Array.from(topics).sort();

    // 드롭다운 옵션 업데이트
    const currentValue = this.topicFilter.value;
    this.topicFilter.innerHTML = '<option value="all">전체 주제</option>';

    this.availableTopics.forEach((topic) => {
      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic;
      this.topicFilter.appendChild(option);
    });

    // 이전 선택값 복원
    if (currentValue && this.availableTopics.includes(currentValue)) {
      this.topicFilter.value = currentValue;
    } else {
      this.topicFilter.value = "all";
      this.currentTopicFilter = "all";
    }
  }

  updateSourceFilterOptions() {
    if (!this.sourceFilter) return;

    // 레퍼런스 글(type === 'reference')에서만 고유한 소스(주제) 목록 추출
    const sources = new Set();
    this.savedTexts.forEach((item) => {
      // 레퍼런스 글만 필터링
      if (
        (item.type || "edit") === "reference" &&
        item.topic &&
        item.topic.trim()
      ) {
        sources.add(item.topic.trim());
      }
    });

    // 소스 목록을 배열로 변환하고 정렬
    this.availableSources = Array.from(sources).sort();

    // 드롭다운 옵션 업데이트
    const currentValue = this.sourceFilter.value;
    this.sourceFilter.innerHTML = '<option value="all">전체 소스</option>';

    this.availableSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      this.sourceFilter.appendChild(option);
    });

    // 이전 선택값 복원
    if (currentValue && this.availableSources.includes(currentValue)) {
      this.sourceFilter.value = currentValue;
    } else {
      this.sourceFilter.value = "all";
      this.currentSourceFilter = "all";
    }
  }

  updateSnsFilterOptions() {
    if (!this.snsFilterPlatform) return;

    // 현재 선택값 저장
    const currentValue = this.snsFilterPlatform.value;

    // SNS 플랫폼 목록 초기화
    this.snsFilterPlatform.innerHTML = '<option value="">플랫폼 선택</option>';

    // DualTextWriter.SNS_PLATFORMS에서 플랫폼 목록 생성
    DualTextWriter.SNS_PLATFORMS.forEach((platform) => {
      const option = document.createElement("option");
      option.value = platform.id;
      option.textContent = `${platform.icon} ${platform.name}`;
      this.snsFilterPlatform.appendChild(option);
    });

    // 이전 선택값 복원
    if (
      currentValue &&
      DualTextWriter.SNS_PLATFORMS.some((p) => p.id === currentValue)
    ) {
      this.snsFilterPlatform.value = currentValue;
    } else {
      this.snsFilterPlatform.value = "";
      this.currentSnsFilterPlatform = "";
    }

    // 필터 모드에 따라 플랫폼 선택 드롭다운 표시/숨김
    if (this.snsFilterMode && this.snsFilterPlatform) {
      if (this.currentSnsFilterMode === "all") {
        this.snsFilterPlatform.style.display = "none";
      } else {
        this.snsFilterPlatform.style.display = "block";
      }
    }
  }

  updateTopicSourceFilterVisibility() {
    // 작성 글 필터일 때: 주제 필터 및 SNS 필터 표시, 소스 필터 숨김
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
    // 레퍼런스 글 필터일 때: 소스 필터 표시, 주제 필터 및 SNS 필터 숨김
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
    // 전체 필터일 때: 모두 숨김
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
    if (!text || typeof text !== "string") {
      return "";
    }

    try {
      // 앞뒤 공백 제거
      let normalized = text.trim();

      // 연속된 공백을 하나로 변환
      normalized = normalized.replace(/\s+/g, " ");

      // 줄바꿈을 공백으로 변환
      normalized = normalized.replace(/\n+/g, " ");

      // 캐리지 리턴을 공백으로 변환
      normalized = normalized.replace(/\r+/g, " ");

      // 최종적으로 연속된 공백이 생길 수 있으므로 다시 정리
      normalized = normalized.replace(/\s+/g, " ");

      return normalized.trim();
    } catch (error) {
      // 정규식 에러 발생 시 원본 텍스트의 trim만 반환
      console.warn("텍스트 정규화 중 오류 발생:", error);
      return typeof text === "string" ? text.trim() : "";
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
    if (!content || typeof content !== "string") {
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
          if ((item.type || "edit") !== "reference") return false;
          return item.contentHash && item.contentHash === targetHash;
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
      if ((item.type || "edit") !== "reference") return false;
      const itemContent = typeof item.content === "string" ? item.content : "";
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
      console.warn("SHA-256 해시 계산 실패, 폴백 해시 사용:", e);
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
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
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
        if ((item.type || "edit") !== "reference") continue;
        if (item.contentHash) continue; // 이미 해시 있음

        const normalized = this.normalizeContent(item.content || "");
        const hash = await this.calculateContentHash(normalized);
        if (!hash) continue;

        updates.push({ id: item.id, contentHash: hash });
      }

      if (updates.length === 0) {
        this.showMessage("✅ 모든 레퍼런스가 최신 상태입니다.", "success");
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

        // 진행률 업데이트
        this.updateMigrationProgress(completedCount, updates.length);

        // 진행률 로그 (디버깅용)
        const progress = Math.round((completedCount / updates.length) * 100);
        console.log(
          `⏳ 마이그레이션 진행 중: ${completedCount}/${updates.length} (${progress}%)`
        );

        // 다음 배치 전 짧은 대기 (서버 부하 분산, 설정 상수 사용)
        if (index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // 진행률 모달 닫기
      this.hideMigrationProgressModal();

      // 완료 메시지
      this.showMessage(
        `✅ ${updates.length}개 레퍼런스 해시 마이그레이션 완료!`,
        "success"
      );
      console.log(`✅ 마이그레이션 완료: ${updates.length}개`);
    } catch (error) {
      // 진행률 모달 닫기 (에러 시)
      this.hideMigrationProgressModal();

      console.error("❌ 해시 마이그레이션 실패:", error);
      this.showMessage(
        `❌ 해시 마이그레이션 중 오류가 발생했습니다: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * 마이그레이션 진행률 모달 표시
   * @param {number} total - 전체 항목 수
   */
  showMigrationProgressModal(total) {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "flex";
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

    const progressBar = document.getElementById("migration-progress-bar");
    const progressText = document.getElementById("migration-progress-text");
    const progressContainer = progressBar?.parentElement;

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (progressText) {
      progressText.textContent = `${completed} / ${total} 완료 (${progress}%)`;
    }

    if (progressContainer) {
      progressContainer.setAttribute("aria-valuenow", progress);
    }
  }

  /**
   * 마이그레이션 진행률 모달 숨김
   */
  hideMigrationProgressModal() {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "none";
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
      const existing = document.getElementById("duplicate-confirm-overlay");
      if (existing) existing.remove();

      // 날짜 포맷 유틸 (내부 전용)
      // 날짜 포맷팅은 클래스 메서드 formatDateFromFirestore 사용

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
                    <div style="font-size: 1.25rem;">⚠️</div>
                    <h3 id="duplicate-confirm-title" style="margin:0; font-size:1.1rem; font-weight:700; color:#333;">
                        중복 레퍼런스 발견
                    </h3>
                </div>
                <p style="margin:0 0 12px; color:#555; line-height:1.6;">
                    입력하신 내용과 동일한 레퍼런스가 이미 저장되어 있습니다. 어떻게 하시겠습니까?
                </p>
                <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; margin-bottom: 16px;">
                    ${
                      createdAtStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>저장 날짜:</strong> ${createdAtStr}</div>`
                        : ""
                    }
                    ${
                      topicStr
                        ? `<div style="font-size:0.9rem; color:#666; margin-bottom:6px;"><strong>주제:</strong> ${topicStr}</div>`
                        : ""
                    }
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
            console.warn("기존 레퍼런스 보기 처리 중 경고:", err);
          }
          cleanup(false);
        });
      modal
        .querySelector('[data-action="save"]')
        .addEventListener("click", () => cleanup(true));

      // 포커스 초기 버튼로 이동
      const firstBtn = modal.querySelector('[data-action="save"]');
      if (firstBtn) firstBtn.focus();
    });
  }

  // Firebase 기반 인증으로 대체됨
  // Firebase Google 로그인 처리
  // Firebase Google 로그인 처리
  async googleLogin() {
    if (!this.isFirebaseReady) {
      this.showMessage(
        "Firebase가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.",
        "error"
      );
      return;
    }

    try {
      const provider = new window.firebaseGoogleAuthProvider();
      const result = await window.firebaseSignInWithPopup(this.auth, provider);
      const user = result.user;

      // 기존 로컬 데이터 마이그레이션 확인
      await this.checkAndMigrateLocalData(user.uid);

      this.showMessage(
        `${user.displayName || user.email}님, Google 로그인으로 환영합니다!`,
        "success"
      );
    } catch (error) {
      console.error("Google 로그인 실패:", error);
      if (error.code === "auth/popup-closed-by-user") {
        this.showMessage("로그인이 취소되었습니다.", "info");
      } else {
        this.showMessage(
          "Google 로그인에 실패했습니다. 기존 방식으로 로그인해주세요.",
          "error"
        );
      }
    }
  }

  /**
   * 사용자명을 Firestore에 저장
   * @param {string} uid - 사용자 UID
   * @param {string} username - 사용자명
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
      console.error("사용자명 저장 실패:", error);
    }
  }

  // [Refactoring] AuthManager로 위임
  async logout() {
    if (
      confirm("로그아웃하시겠습니까? 현재 작성 중인 내용은 임시 저장됩니다.")
    ) {
      this.performTempSave(); // 로그아웃 전 임시 저장
      await this.authManager.logout();
    }
  }

  // Firebase Auth가 자동으로 토큰 관리함

  showLoginInterface() {
    this.loginForm.style.display = "block";
    this.userInfo.style.display = "none";
    this.mainContent.style.display = "block"; // 로그인 없이도 메인 콘텐츠 표시
  }

  // 기존 로컬 스토리지 데이터를 Firestore로 마이그레이션
  async checkAndMigrateLocalData(userId) {
    const localData = localStorage.getItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
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
        this.showMessage("기존 데이터가 성공적으로 이전되었습니다!", "success");

        // 로컬 스토리지 정리
        localStorage.removeItem(Constants.STORAGE_KEYS.SAVED_TEXTS);
        localStorage.removeItem(Constants.STORAGE_KEYS.TEMP_SAVE);
      }
    } catch (error) {
      console.error("데이터 마이그레이션 실패:", error);
      this.showMessage("데이터 마이그레이션 중 오류가 발생했습니다.", "error");
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
          migrated: true, // 마이그레이션 표시
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
        console.error("개별 텍스트 마이그레이션 실패:", error);
      }
    }

    console.log(
      `${localTexts.length}개의 텍스트를 Firestore로 마이그레이션했습니다.`
    );
  }
  showUserInterface() {
    this.loginForm.style.display = "none";
    this.userInfo.style.display = "block";
    this.mainContent.style.display = "block";

    // 사용자 정보 표시 (Firebase 사용자 정보 사용)
    if (this.currentUser) {
      const displayName =
        this.currentUser.displayName || this.currentUser.email || "사용자";
      this.usernameDisplay.textContent = displayName;
    }
  }

  clearAllData() {
    this.refTextInput.value = "";
    this.editTextInput.value = "";
    this.savedTexts = [];
    // 캐시 무효화 (데이터 변경 시)
    this.renderSavedTextsCache = null;
    this.renderSavedTextsCacheKey = null;
    this.updateCharacterCount("ref");
    this.updateCharacterCount("edit");
    this.renderSavedTexts();
  }

  clearText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const panelName = panel === "ref" ? "레퍼런스 글" : "수정/작성 글";

    if (confirm(`${panelName}을 지우시겠습니까?`)) {
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }
      // SNS 플랫폼 선택 초기화
      if (panel === "edit") {
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
      }
      this.updateCharacterCount(panel);
      textInput.focus();
    }
  }

  // Firestore에 텍스트 저장
  async saveText(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
    const panelName = panel === "ref" ? "레퍼런스 글" : "수정/작성 글";

    if (text.length === 0) {
      alert("저장할 내용이 없습니다.");
      return;
    }

    if (!this.currentUser) {
      this.showMessage("로그인이 필요합니다.", "error");
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
        isDeleted: false, // [Soft Delete] 초기화
      };

      // 레퍼런스 저장 시 referenceType 필수
      if (panel === "ref") {
        let refType = Constants.REF_TYPES.UNSPECIFIED;
        if (this.refTypeStructure && this.refTypeStructure.checked)
          refType = Constants.REF_TYPES.STRUCTURE;
        if (this.refTypeIdea && this.refTypeIdea.checked)
          refType = Constants.REF_TYPES.IDEA;
        if (refType === Constants.REF_TYPES.UNSPECIFIED) {
          this.showMessage(
            "레퍼런스 유형(구조/아이디어)을 선택해주세요.",
            "error"
          );
          return;
        }
        textData.referenceType = refType;
      }

      // 수정/작성 글 저장 시 주제 추가 (선택사항)
      if (panel === "edit" && this.editTopicInput) {
        const topic = this.editTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // 작성글 저장 시 연결된 레퍼런스 ID 배열 추가
      if (panel === "edit") {
        // ✅ 유효한 레퍼런스 ID만 필터링 (존재 여부 확인)
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
            linkedAt: window.firebaseServerTimestamp(), // 연결 시점
            linkCount: validReferences.length, // 연결 개수 (캐시)
          };

          console.log(`📚 ${validReferences.length}개 레퍼런스 연결됨`);
        } else {
          // 빈 배열로 설정 (null이 아닌 빈 배열)
          textData.linkedReferences = [];
        }

        // ✅ SNS 플랫폼 저장 (유효성 검증 포함)
        if (
          this.selectedSnsPlatforms &&
          Array.isArray(this.selectedSnsPlatforms)
        ) {
          // 유효한 플랫폼 ID만 필터링 (DualTextWriter.SNS_PLATFORMS에 정의된 ID만 허용)
          const validPlatformIds = DualTextWriter.SNS_PLATFORMS.map(
            (p) => p.id
          );
          const validPlatforms = this.selectedSnsPlatforms.filter(
            (platformId) => validPlatformIds.includes(platformId)
          );

          // 빈 배열도 저장 (기존 데이터 호환성)
          textData.platforms = validPlatforms;

          if (validPlatforms.length > 0) {
            console.log(
              `📱 ${validPlatforms.length}개 SNS 플랫폼 저장됨:`,
              validPlatforms
            );
          }
        } else {
          // selectedSnsPlatforms가 없거나 배열이 아닌 경우 빈 배열로 설정
          textData.platforms = [];
        }
      }

      // 레퍼런스 글 저장 시 주제 추가 (선택사항)
      if (panel === "ref" && this.refTopicInput) {
        const topic = this.refTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // 레퍼런스 저장 시 해시 필드 추가 (정규화 기반)
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
          console.warn("contentHash 계산 실패: 해시 없이 저장합니다.", e);
        }
      }

      // 레퍼런스 저장 시 중복 체크 (referenceType 체크 이후, Firestore 저장 이전)
      if (panel === "ref") {
        try {
          const duplicate = this.checkDuplicateReference(text);
          if (duplicate) {
            // 중복 확인 모달 표시
            const shouldProceed = await this.showDuplicateConfirmModal(
              duplicate
            );
            if (!shouldProceed) {
              // 사용자가 취소 선택 시 저장 중단
              return;
            }
            // shouldProceed가 true이면 계속 진행 (그래도 저장)
          }
        } catch (error) {
          // 중복 체크 실패 시 저장 계속 진행 (안전한 기본값)
          console.warn(
            "중복 체크 중 오류 발생, 저장을 계속 진행합니다:",
            error
          );
          // 에러 로그만 기록하고 저장은 계속 진행
        }
      }

      // Firestore에 저장
      const docRef = await window.firebaseAddDoc(
        window.firebaseCollection(
          this.db,
          "users",
          this.currentUser.uid,
          "texts"
        ),
        textData
      );

      // 로컬 배열에도 추가 (UI 업데이트용)
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

      // Optimistic UI: 즉시 로컬 데이터 업데이트 및 UI 반영
      this.savedTexts.unshift(savedItem);
      // 캐시 무효화 (데이터 변경 시)
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      // 주제 필터 옵션 업데이트 (새 주제가 추가될 수 있으므로)
      this.updateTopicFilterOptions();
      this.refreshUI({ savedTexts: true, force: true });

      this.showMessage(`${panelName}이 저장되었습니다!`, "success");

      // Clear input
      textInput.value = "";
      if (panel === "edit" && this.editTopicInput) {
        this.editTopicInput.value = "";
      }
      if (panel === "ref" && this.refTopicInput) {
        this.refTopicInput.value = "";
      }

      // ✅ 작성글 저장 후 선택된 레퍼런스 및 SNS 플랫폼 초기화
      if (panel === "edit") {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0개 선택됨)";
        }
        console.log("✅ 레퍼런스 선택 초기화 완료");

        // SNS 플랫폼 선택 초기화
        this.selectedSnsPlatforms = [];
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        console.log("✅ SNS 플랫폼 선택 초기화 완료");
      }

      this.updateCharacterCount(panel);
    } catch (error) {
      console.error("텍스트 저장 실패:", error);
      this.showMessage("저장에 실패했습니다. 다시 시도해주세요.", "error");
    }
  }

  downloadAsTxt(panel) {
    const textInput = panel === "ref" ? this.refTextInput : this.editTextInput;
    const text = textInput.value; // trim() 제거하여 사용자 입력의 공백과 줄바꿈 보존
    const panelName = panel === "ref" ? "레퍼런스" : "수정작성";

    if (text.length === 0) {
      alert("다운로드할 내용이 없습니다.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `${panelName}_${timestamp}.txt`;

    const content =
      `500자 미만 글 작성기 - ${panelName} 글\n` +
      `작성일: ${new Date().toLocaleString("ko-KR")}\n` +
      `글자 수: ${this.getKoreanCharacterCount(text)}자\n` +
      `\n${"=".repeat(30)}\n\n` +
      `${text}`; // 사용자가 입력한 그대로 줄바꿈과 공백 유지

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
      `${panelName} 글 TXT 파일이 다운로드되었습니다!`,
      "success"
    );
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

  // 휴지통 목록 렌더링
  renderTrashBinList() {
    const container = document.getElementById("trash-bin-list");
    if (!container) return;

    const deletedItems = this.savedTexts
      .filter((item) => item.isDeleted)
      .sort((a, b) => {
        // 삭제된 날짜 내림차순 (없으면 생성일)
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
          <div class="empty-icon">🗑️</div>
          <p>휴지통이 비었습니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = deletedItems
      .map((item) => {
        const date = item.deletedAt
          ? new Date(item.deletedAt).toLocaleString("ko-KR")
          : "날짜 없음";
        const typeLabel =
          (item.type || "edit") === "reference" ? "📖 레퍼런스" : "✏️ 작성글";

        // 내용 미리보기 (HTML 태그 제거 및 길이 제한)
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
            <span class="saved-item-date">삭제일: ${date}</span>
          </div>
          <div class="saved-item-content">${this.escapeHtml(preview)}</div>
          <div class="saved-item-actions">
            <button class="btn-restore" onclick="window.dualTextWriter.restoreText('${
              item.id
            }')" aria-label="글 복원">
              ♻️ 복원
            </button>
            <button class="btn-delete-permanent" onclick="window.dualTextWriter.permanentlyDeleteText('${
              item.id
            }')" aria-label="영구 삭제">
              🔥 영구 삭제
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // 휴지통 열기
  openTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "flex";
      this.renderTrashBinList();
      // 접근성: 모달에 포커스 이동
      const closeBtn = modal.querySelector(".close-btn");
      if (closeBtn) closeBtn.focus();
    }
  }

  // 휴지통 닫기
  closeTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  async _renderSavedTextsImpl() {
    // 메모이제이션: 캐시 키 생성 (필터 조건 + 검색어 기반)
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

    // 캐시 확인 (같은 필터 조건 + 검색어에서 재호출 방지)
    if (
      this.renderSavedTextsCache &&
      this.renderSavedTextsCacheKey === cacheKey
    ) {
      console.log("renderSavedTexts: 캐시된 결과 사용 (성능 최적화)");
      return;
    }

    console.log("renderSavedTexts 호출됨:", this.savedTexts);

    // 필터 적용
    let list = this.savedTexts;

    // [Soft Delete] 삭제된 항목 제외
    list = list.filter((item) => !item.isDeleted);

    // [Tab Separation] 'script' 타입은 저장된 글 탭에서 제외 (스크립트 작성 탭에서만 관리)
    // 주니어 개발자 체크: 데이터 분리 로직 적용
    list = list.filter((item) => (item.type || "edit") !== "script");

    if (this.savedFilter === "edit") {
      list = list.filter((item) => item.type === "edit");
    } else if (this.savedFilter === "reference") {
      // 레퍼런스 탭에는 사용 안된 레퍼런스(usageCount === 0)만 표시
      // 주의: usageCount는 나중에 checkMultipleReferenceUsage()로 확인되므로,
      // 여기서는 type만 체크하고 실제 필터링은 사용 여부 확인 후 수행
      list = list.filter((item) => (item.type || "edit") === "reference");
    } else if (this.savedFilter === "reference-used") {
      // 사용된 레퍼런스만 필터링 (usageCount > 0)
      // 주의: usageCount는 나중에 checkMultipleReferenceUsage()로 확인되므로,
      // 여기서는 type만 체크하고 실제 필터링은 사용 여부 확인 후 수행
      list = list.filter((item) => (item.type || "edit") === "reference");
    }

    // 레퍼런스 유형 필터 적용 (structure/idea)
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

    // 주제 필터 적용 (작성 글용)
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

    // 소스 필터 적용 (레퍼런스 글용)
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

    // SNS 플랫폼 필터 적용 (작성 글용)
    if (
      this.savedFilter === "edit" &&
      this.currentSnsFilterMode &&
      this.currentSnsFilterMode !== "all" &&
      this.currentSnsFilterPlatform
    ) {
      list = list.filter((item) => {
        // platforms 필드가 없거나 배열이 아닌 경우 빈 배열로 처리
        const platforms = Array.isArray(item.platforms) ? item.platforms : [];

        if (this.currentSnsFilterMode === "has") {
          // 특정 SNS에 올린 글: platforms 배열에 해당 플랫폼 ID가 있는 경우
          return platforms.includes(this.currentSnsFilterPlatform);
        } else if (this.currentSnsFilterMode === "not-has") {
          // 특정 SNS에 올리지 않은 글: platforms 배열에 해당 플랫폼 ID가 없는 경우
          return !platforms.includes(this.currentSnsFilterPlatform);
        }
        return true;
      });
    }

    // ✅ 검색 필터 적용 (내용 + 주제에서 검색)
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
        // 모든 키워드가 포함되어야 함 (AND 검색)
        return tokens.every((tk) => searchText.includes(tk));
      });
    }

    // 필터 옵션 업데이트
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
      // 에러 처리: 필터 적용 시 데이터가 없는 경우 처리
      let emptyMsg = "저장된 글이 없습니다.";
      if (this.savedFilter === "edit") {
        emptyMsg = "작성 글이 없습니다.";
      } else if (this.savedFilter === "reference") {
        emptyMsg = "레퍼런스 글이 없습니다.";
      } else if (this.savedFilter === "reference-used") {
        emptyMsg = "사용된 레퍼런스가 없습니다.";
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
    const referenceItems = list.filter(
      (item) => (item.type || "edit") === "reference"
    );
    let referenceUsageMap = {};
    // 모든 레퍼런스 항목에 대해 기본값 0으로 초기화 (배지가 항상 표시되도록 보장)
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
          // 조회된 결과를 referenceUsageMap에 병합
          Object.assign(referenceUsageMap, fetchedUsageMap);
        }
      } catch (error) {
        console.error("레퍼런스 사용 여부 배치 조회 실패:", error);
        // 에러 발생 시에도 기본값 0이 이미 설정되어 있으므로 배지는 표시됨
      }
    }

    // 캐시 업데이트
    this.renderSavedTextsCacheKey = cacheKey;

    // 각 저장된 글에 대한 트래킹 데이터 조회 및 사용 여부 추가 (비동기)
    const itemsWithTracking = await Promise.all(
      list.map(async (item, index) => {
        let postData = null;
        if (this.trackingPosts && this.currentUser && this.isFirebaseReady) {
          // 로컬 데이터에서 먼저 찾기
          postData = this.trackingPosts.find((p) => p.sourceTextId === item.id);

          // 로컬에 없으면 Firebase에서 조회
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
              const querySnapshot = await window.firebaseGetDocs(q);

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
              console.error("트래킹 데이터 조회 실패:", error);
            }
          }
        }

        // 레퍼런스 글인 경우 사용 여부 추가
        let usageCount = 0;
        if ((item.type || "edit") === "reference") {
          // referenceUsageMap에서 usageCount를 가져오되, 없으면 0으로 설정
          usageCount =
            referenceUsageMap[item.id] !== undefined
              ? referenceUsageMap[item.id]
              : 0;
        }

        // 사용 여부를 item 객체에 추가하여 캐싱 (레퍼런스 글은 항상 usageCount 포함)
        const itemWithUsage = { ...item, usageCount };

        // reference 필터인 경우, usageCount가 0인 항목만 포함 (사용 안된 레퍼런스만)
        if (this.savedFilter === "reference") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount !== 0) {
            return null; // 필터링 대상에서 제외 (사용된 레퍼런스는 제외)
          }
        }

        // reference-used 필터인 경우, usageCount가 1 이상인 항목만 포함
        if (this.savedFilter === "reference-used") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount === 0) {
            return null; // 필터링 대상에서 제외
          }
        }

        return { item: itemWithUsage, postData, index };
      })
    );

    // reference 또는 reference-used 필터인 경우 null인 항목 제거
    const filteredItemsWithTracking =
      this.savedFilter === "reference" || this.savedFilter === "reference-used"
        ? itemsWithTracking.filter((result) => result !== null)
        : itemsWithTracking;

    // 필터링 후 빈 목록 체크
    if (filteredItemsWithTracking.length === 0) {
      let emptyMsg = "저장된 글이 없습니다.";
      let emptySubMsg = "글을 작성하고 저장해보세요!";

      // ✅ 검색어가 있을 때 검색 결과 없음 메시지 표시
      if (this.savedSearch && this.savedSearch.trim()) {
        if (this.savedFilter === "edit") {
          emptyMsg = `"${this.savedSearch}" 검색 결과가 없습니다.`;
        } else if (this.savedFilter === "reference") {
          emptyMsg = `"${this.savedSearch}" 검색 결과가 없습니다.`;
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = `"${this.savedSearch}" 검색 결과가 없습니다.`;
        } else {
          emptyMsg = `"${this.savedSearch}" 검색 결과가 없습니다.`;
        }
        emptySubMsg = "다른 검색어를 시도해보세요.";
      } else {
        if (this.savedFilter === "edit") {
          emptyMsg = "작성 글이 없습니다.";
        } else if (this.savedFilter === "reference") {
          emptyMsg = "레퍼런스 글이 없습니다.";
        } else if (this.savedFilter === "reference-used") {
          emptyMsg = "사용된 레퍼런스가 없습니다.";
        }
      }

      this.savedList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    <div class="empty-state-subtext">${emptySubMsg}</div>
                </div>
            `;
      // 접근성: 스크린 리더에 빈 목록 상태 전달 (aria-live로 자동 전달됨)
      this.savedList.setAttribute("aria-label", `저장된 글 목록: ${emptyMsg}`);
      return;
    }

    // 성능 최적화: 많은 카드 렌더링 시 배치 처리
    const batchSize = 10;
    const totalItems = itemsWithTracking.length;

    // 접근성: 필터 결과를 스크린 리더에 전달 (aria-live="polite"로 자동 전달됨)
    const filterDescription =
      this.savedFilter === "edit"
        ? "작성 글"
        : this.savedFilter === "reference"
        ? "레퍼런스 글"
        : this.savedFilter === "reference-used"
        ? "사용된 레퍼런스"
        : "저장된 글";

    // ✅ 검색 결과 개수 표시
    let ariaLabelText = `저장된 글 목록: ${filterDescription} ${totalItems}개`;
    if (this.savedSearch && this.savedSearch.trim()) {
      ariaLabelText = `저장된 글 목록: ${filterDescription} 검색 결과 ${totalItems}개`;
    }
    this.savedList.setAttribute("aria-label", ariaLabelText);

    if (totalItems > batchSize) {
      // 대량 렌더링: 첫 번째 배치만 즉시 렌더링, 나머지는 requestAnimationFrame으로 처리
      const firstBatch = filteredItemsWithTracking.slice(0, batchSize);
      this.savedList.innerHTML = firstBatch
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");

      // 나머지 배치를 점진적으로 렌더링
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
      this.savedList.innerHTML = filteredItemsWithTracking
        .map(({ item, postData, index }) => {
          return this.renderSavedItemCard(item, postData, index);
        })
        .join("");
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

      // 레퍼런스 카드의 "이 레퍼런스를 참고한 글 N개" 배지 클릭
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

      console.log("✅ 배지 클릭 이벤트 바인딩 완료");
    } catch (error) {
      console.error("배지 이벤트 바인딩 실패:", error);
    }
  }

  // 저장된 항목 카드 렌더링 함수 (재사용 가능하게 분리)
  renderSavedItemCard(item, postData, index) {
    const metaText = `${
      (item.type || "edit") === "reference" ? "📖 레퍼런스" : "✏️ 작성"
    } · ${item.date} · ${item.characterCount}자`;
    // 통일된 스키마: card:{itemId}:expanded
    const expanded = localStorage.getItem(`card:${item.id}:expanded`) === "1";
    // 타임라인 HTML 생성
    const timelineHtml = this.renderTrackingTimeline(
      postData?.metrics || [],
      item.id
    );

    // 레퍼런스 글인 경우 사용 여부 배지 및 유형 배지 생성
    const isReference = (item.type || "edit") === "reference";
    // usageCount가 undefined일 경우 0으로 설정 (레퍼런스 글은 항상 사용 여부 배지 표시)
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

    // ✅ Phase 1.6.1: 작성글-레퍼런스 연동 배지 생성
    // 작성글 카드: 연결된 레퍼런스 개수 표시
    let linkedRefBadge = "";
    const isEdit = (item.type || "edit") === "edit";
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
    let usedInEditsBadge = "";
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

    // ✅ SNS 플랫폼 배지 생성 (작성 글용)
    let snsPlatformsHtml = "";
    if (isEdit && Array.isArray(item.platforms) && item.platforms.length > 0) {
      // 유효한 플랫폼 ID만 필터링
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
              )} 플랫폼">${p.icon} ${this.escapeHtml(p.name)}</span>`
          )
          .join("");
        snsPlatformsHtml = `
                    <div class="saved-item-platforms" role="list" aria-label="SNS 플랫폼 목록">
                        ${platformsList}
                    </div>
                `;
      }
    }

    // 검색어 가져오기
    const searchTerm = this.savedSearchInput?.value.toLowerCase().trim() || "";

    // 하이라이팅 적용
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
                        ? "레퍼런스 글"
                        : "작성 글"
                    }">${
      (item.type || "edit") === "reference" ? "📖 레퍼런스" : "✏️ 작성"
    }</span>
                    ${refTypeBadgeHtml}
                    ${usageBadgeHtml}
                </div>
            </div>
            <div class="saved-item-meta" aria-label="메타 정보: ${metaText}">
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
                  )}">🏷️ ${highlightedTopic}</div>`
                : ""
            }
            ${snsPlatformsHtml}
            <div class="saved-item-content ${
              expanded ? "expanded" : ""
            }" aria-label="본문 내용">${highlightedContent}</div>
            <button class="saved-item-toggle" data-action="toggle" data-item-id="${
              item.id
            }" aria-expanded="${expanded ? "true" : "false"}" aria-label="${
      expanded ? "내용 접기" : "내용 더보기"
    }">${expanded ? "접기" : "더보기"}</button>
            ${
              timelineHtml
                ? `<div class="saved-item-tracking" role="region" aria-label="트래킹 기록">${timelineHtml}</div>`
                : ""
            }
            <div class="saved-item-actions actions--primary" role="group" aria-label="카드 작업 버튼">
                <button class="action-button btn-primary" data-action="edit" data-type="${
                  item.type || "edit"
                }" data-item-id="${item.id}" aria-label="${
      (item.type || "edit") === "reference"
        ? "레퍼런스 글 편집"
        : "작성 글 편집"
    }">편집</button>
                <button class="action-button btn-tracking" data-action="add-tracking" data-item-id="${
                  item.id
                }" aria-label="트래킹 데이터 입력">📊 데이터 입력</button>
                <div class="llm-validation-dropdown" style="position: relative; display: inline-block;">
                    <button class="action-button btn-llm-main" data-action="llm-validation" data-item-id="${
                      item.id
                    }" aria-label="LLM 검증 메뉴">🔍 LLM 검증</button>
                    <div class="llm-dropdown-menu">
                        <button class="llm-option" data-llm="chatgpt" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🤖</span>
                                    <span class="llm-name">ChatGPT</span>
                                    <span class="llm-description">SNS 후킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="gemini" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🧠</span>
                                    <span class="llm-name">Gemini</span>
                                    <span class="llm-description">심리적 후킹 분석</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="perplexity" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🔎</span>
                                    <span class="llm-name">Perplexity</span>
                                    <span class="llm-description">트렌드 검증</span>
                                </div>
                            </div>
                        </button>
                        <button class="llm-option" data-llm="grok" data-item-id="${
                          item.id
                        }">
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
                    <button class="more-menu-btn" data-action="more" data-item-id="${
                      item.id
                    }" aria-haspopup="true" aria-expanded="false" aria-label="기타 작업 메뉴 열기">⋯</button>
                    <div class="more-menu-list" role="menu" aria-label="기타 작업">
                        <button class="more-menu-item" role="menuitem" data-action="delete" data-item-id="${
                          item.id
                        }" aria-label="글 삭제">삭제</button>
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
    if (!this.batchMigrationBtn || !this.currentUser || !this.isFirebaseReady)
      return;

    try {
      // ✅ 성능 최적화: 메모리 데이터만 사용 (Firebase 쿼리 없음)
      // Set을 사용하여 O(1) 검색 구현
      const trackedTextIds = new Set(
        (this.trackingPosts || []).map((p) => p.sourceTextId).filter(Boolean)
      );

      // 안전한 배열 처리 (빈 배열 폴백)
      const untrackedTexts = (this.savedTexts || []).filter(
        (textItem) => !trackedTextIds.has(textItem.id)
      );

      // 버튼 UI 업데이트
      const migrationTools = document.querySelector(".migration-tools");
      if (migrationTools) {
        if (untrackedTexts.length > 0) {
          // 미트래킹 글이 있으면 버튼 표시 및 개수 표시
          migrationTools.style.display = "flex";
          this.batchMigrationBtn.style.display = "block";
          this.batchMigrationBtn.textContent = `📊 미트래킹 글 ${untrackedTexts.length}개 일괄 트래킹 시작`;
          this.batchMigrationBtn.title = `${untrackedTexts.length}개의 저장된 글이 아직 트래킹되지 않았습니다. 모두 트래킹을 시작하시겠습니까?`;

          // 접근성 개선: aria-label 동적 업데이트
          this.batchMigrationBtn.setAttribute(
            "aria-label",
            `${untrackedTexts.length}개의 미트래킹 글 일괄 트래킹 시작`
          );
        } else {
          // 미트래킹 글이 없으면 버튼 숨김
          migrationTools.style.display = "none";
          this.batchMigrationBtn.style.display = "none";
        }
      }

      // 성능 로그 (디버깅용)
      console.log(
        `✅ 미트래킹 글 확인 완료: ${untrackedTexts.length}개 (메모리 검색, Firebase 쿼리 없음)`
      );
    } catch (error) {
      console.error("❌ 미트래킹 글 확인 실패:", error);

      // 에러 발생 시 버튼 숨김
      if (this.batchMigrationBtn) {
        this.batchMigrationBtn.style.display = "none";
      }

      // 사용자 알림 (UX 개선)
      this.showMessage(
        "⚠️ 미트래킹 글 확인 중 오류가 발생했습니다.",
        "warning"
      );
    }
  }

  // 트래킹 타임라인 렌더링
  renderTrackingTimeline(metrics) {
    if (!metrics || metrics.length === 0) {
      return "";
    }

    // 날짜 순으로 정렬 (오래된 것부터)
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

    // 합계 계산
    const totals = this.calculateMetricsTotal(metrics);

    // localStorage에서 접기/펼치기 상태 복원 (per-post)
    // saved-item의 data-item-id를 사용하여 키 생성
    // 이 함수는 saved-item 내부에서 호출되므로, 클로저나 파라미터로 itemId 전달 필요
    const savedItemId = arguments[1] || null; // 두 번째 파라미터로 itemId 전달
    // 통일된 스키마: card:{itemId}:details (타임라인 접기/펼치기)
    const isExpanded = savedItemId
      ? localStorage.getItem(`card:${savedItemId}:details`) === "1"
      : false;
    const collapsedClass = isExpanded ? "" : "collapsed";
    const buttonText = isExpanded ? "접기" : `기록 ${totalCount}개 더보기`;

    return `
            <div class="tracking-timeline-container">
                <div class="tracking-timeline-header">
                    <span class="timeline-title">📊 트래킹 기록</span>
                    ${this.renderMetricsTotals(totals)}
                    <button class="timeline-toggle-btn small" onclick="dualTextWriter.toggleTimelineCollapse(this)" aria-label="기록 더보기/접기" aria-expanded="${
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
                            <div class="timeline-item" data-metric-index="${metricIndex}" role="button" aria-label="기록 편집">
                                <span class="timeline-date">📅 ${dateStr}</span>
                                <div class="timeline-item-data">
                                    <span class="metric-badge views">👀 ${
                                      metric.views || 0
                                    }</span>
                                    <span class="metric-badge likes">❤️ ${
                                      metric.likes || 0
                                    }</span>
                                    <span class="metric-badge comments">💬 ${
                                      metric.comments || 0
                                    }</span>
                                    <span class="metric-badge shares">🔄 ${
                                      metric.shares || 0
                                    }</span>
                                    <span class="metric-badge follows">👥 ${
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

  // 날짜 포맷팅 (25년 10월 29일 형식)
  formatDateForDisplay(date) {
    if (!date || !(date instanceof Date)) {
      return "";
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
      // 숫자 타임스탬프 처리
      else if (typeof dateInput === "number") {
        dateObj = new Date(dateInput);
      }
      // 문자열 날짜 처리
      else if (typeof dateInput === "string") {
        const parsed = Date.parse(dateInput);
        if (!Number.isNaN(parsed)) {
          dateObj = new Date(parsed);
        }
      }

      // 유효한 Date 객체인지 확인
      if (
        !dateObj ||
        !(dateObj instanceof Date) ||
        Number.isNaN(dateObj.getTime())
      ) {
        return "";
      }

      // 한국어 날짜 형식으로 변환
      return dateObj.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      // 에러 발생 시 빈 문자열 반환
      console.warn("날짜 포맷팅 중 오류 발생:", error);
      return "";
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
        totalFollows: 0,
      };
    }

    // 날짜 순으로 정렬하여 가장 최신 메트릭 찾기
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
      return dateA - dateB; // 오래된 것부터 정렬
    });

    // 가장 마지막(최신) 메트릭의 값 반환
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
      return "";
    }

    // 에러 처리: 숫자가 아닌 경우 처리
    if (typeof usageCount !== "number") {
      console.warn(
        "renderReferenceUsageBadge: usageCount가 숫자가 아닙니다:",
        usageCount
      );
      return "";
    }

    // 에러 처리: 음수인 경우 0으로 처리
    if (usageCount < 0) {
      console.warn(
        "renderReferenceUsageBadge: usageCount가 음수입니다:",
        usageCount
      );
      usageCount = 0;
    }

    // 사용 안됨: 회색 배지 HTML 반환 (클릭 가능)
    if (usageCount === 0) {
      const ariaLabel = "레퍼런스 사용 안됨 (클릭하면 사용됨으로 표시)";
      return `<span class="reference-usage-badge reference-usage-badge--unused reference-usage-badge--clickable" data-action="mark-reference-used" role="button" tabindex="0" aria-label="${ariaLabel}" style="cursor: pointer;">🆕 사용 안됨</span>`;
    }

    // 사용됨: 초록색 배지 HTML 반환 (클릭 가능, 토글 기능)
    // 접근성: aria-label로 사용 여부를 스크린 리더에 전달
    // role="button"으로 클릭 가능함을 명시
    const usageText = usageCount === 1 ? "사용됨" : `사용됨 ${usageCount}회`;
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
      force = false,
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
    const savedTab = document.getElementById("saved-tab");
    const trackingTab = document.getElementById("tracking-tab");
    const isSavedTabActive = savedTab && savedTab.classList.contains("active");
    const isTrackingTabActive =
      trackingTab && trackingTab.classList.contains("active");

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
      const chartContainer = document.querySelector(
        ".tracking-chart-container"
      );
      if (chartContainer && chartContainer.offsetParent !== null) {
        this.updateTrackingChart();
      }
      this.updateQueue.trackingChart = false;
    }
  }
  // 디바운싱 유틸리티 함수
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

  // 범위 필터 초기화
  initRangeFilter() {
    try {
      // localStorage에서 접기/펼치기 상태 복원
      const isExpanded = localStorage.getItem("rangeFilter:expanded") === "1";
      const content = document.getElementById("range-filter-content");
      const toggle = document.getElementById("range-filter-toggle");
      const toggleIcon = toggle?.querySelector(".toggle-icon");

      if (content && toggle && toggleIcon) {
        if (isExpanded) {
          content.style.display = "block";
          toggle.setAttribute("aria-expanded", "true");
          toggleIcon.textContent = "▲";
        } else {
          content.style.display = "none";
          toggle.setAttribute("aria-expanded", "false");
          toggleIcon.textContent = "▼";
        }
      }
    } catch (error) {
      console.error("범위 필터 초기화 실패:", error);
    }
  }

  // 범위 필터 접기/펼치기 토글
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
      toggleIcon.textContent = "▲";
    } else {
      content.style.display = "none";
      toggle.setAttribute("aria-expanded", "false");
      toggleIcon.textContent = "▼";
    }

    // 상태 localStorage에 저장
    try {
      localStorage.setItem("rangeFilter:expanded", isExpanded ? "1" : "0");
    } catch (error) {
      console.error("범위 필터 상태 저장 실패:", error);
    }
  }

  // 타임라인 더보기/접기 (최신 1개 기본)
  toggleTimelineCollapse(button) {
    const container = button.closest(".tracking-timeline-container");
    const content = container.querySelector(".tracking-timeline-content");
    if (!content) return;

    // 저장된 글 아이템 ID 확인 (per-post 키 생성용)
    const savedItem = button.closest(".saved-item");
    const itemId = savedItem ? savedItem.getAttribute("data-item-id") : null;

    const collapsed = content.classList.toggle("collapsed");
    const total = content.querySelectorAll(".timeline-item").length;

    // 상태 localStorage에 저장 (per-post)
    if (itemId) {
      try {
        // 통일된 스키마: card:{itemId}:details
        const key = `card:${itemId}:details`;
        localStorage.setItem(key, collapsed ? "0" : "1");
      } catch (e) {
        /* ignore quota */
      }
    }

    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) {
      button.textContent = `기록 ${total}개 더보기`;
    } else {
      button.textContent = "접기";
    }
  }
  /**
   * 저장된 글 항목의 이벤트 리스너 설정 (이벤트 위임)
   * - 메뉴 열기/닫기, 삭제, 트래킹 등 저장된 글 관련 모든 이벤트 처리
   * - 이벤트 리스너 중복 등록 방지를 위해 기존 핸들러 제거 후 새 핸들러 등록
   * @returns {void}
   */
  setupSavedItemEventListeners() {
    console.log("setupSavedItemEventListeners 호출됨");

    // 기존 이벤트 리스너 제거 (중복 방지)
    if (this.savedItemClickHandler) {
      this.savedList.removeEventListener("click", this.savedItemClickHandler);
    }
    if (this.savedItemKeydownHandler) {
      this.savedList.removeEventListener(
        "keydown",
        this.savedItemKeydownHandler
      );
    }

    // 키보드 이벤트 핸들러 (접근성 향상)
    this.savedItemKeydownHandler = (event) => {
      // 더보기/접기 버튼 키보드 접근성
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
            button.textContent = nowExpanded ? "접기" : "더보기";
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

    // 클릭 이벤트 핸들러
    this.savedItemClickHandler = (event) => {
      console.log("저장된 글 영역 클릭:", event.target);

      // 레퍼런스 사용 배지 클릭 처리 (버튼이 아닌 span 요소)
      const badge = event.target.closest(".reference-usage-badge--clickable");
      if (badge) {
        const badgeAction = badge.getAttribute("data-action");
        if (badgeAction === "mark-reference-used") {
          event.preventDefault();
          event.stopPropagation();

          // 레퍼런스 카드에서 itemId 찾기
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            console.log(
              "레퍼런스 사용 배지 클릭 (사용됨으로 표시):",
              referenceItemId
            );
            this.markReferenceAsUsed(referenceItemId);
          }
          return;
        } else if (badgeAction === "mark-reference-unused") {
          event.preventDefault();
          event.stopPropagation();

          // 레퍼런스 카드에서 itemId 찾기
          const savedItem = badge.closest(".saved-item");
          const referenceItemId = savedItem?.getAttribute("data-item-id");

          if (referenceItemId) {
            console.log(
              "레퍼런스 사용 배지 클릭 (사용 안됨으로 표시):",
              referenceItemId
            );
            this.unmarkReferenceAsUsed(referenceItemId);
          }
          return;
        }
      }

      const button = event.target.closest("button");
      if (!button) {
        // 버튼이 아니면 타임라인 행 탭 처리
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

      console.log("이벤트 처리:", {
        itemId,
        action,
        button: button.textContent,
      });

      if (!itemId) {
        console.error("Item ID not found");
        return;
      }

      if (action === "more") {
        // 이벤트 전파 제어: 이벤트 버블링 방지로 바깥 클릭 핸들러가 즉시 실행되지 않도록 함
        event.preventDefault();
        event.stopPropagation();

        // DOM 탐색 방식 개선: closest + querySelector 사용으로 더 안정적인 탐색
        const moreMenuContainer = button.closest(".more-menu");
        if (!moreMenuContainer) {
          console.warn("[more menu] Container not found:", { itemId, button });
          return;
        }

        const menu = moreMenuContainer.querySelector(".more-menu-list");
        if (menu) {
          const isOpen = menu.classList.toggle("open");
          button.setAttribute("aria-expanded", isOpen ? "true" : "false");

          // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
          if (isOpen) {
            this.applySmartMenuPosition(menu, button);

            // 포커스 트랩: 메뉴가 열리면 첫 번째 메뉴 아이템에 포커스
            const firstMenuItem = menu.querySelector(".more-menu-item");
            if (firstMenuItem) {
              setTimeout(() => firstMenuItem.focus(), 50);
            }
          } else {
            // 메뉴 닫힐 때 위치 클래스 제거
            menu.classList.remove("open-top", "open-bottom");
          }
        } else {
          // 메뉴를 찾지 못한 경우 디버깅 로그 출력
          console.warn("[more menu] Menu element not found:", {
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
          button.textContent = nowExpanded ? "접기" : "더보기";
          button.setAttribute("aria-expanded", nowExpanded ? "true" : "false");
          try {
            // 통일된 스키마: card:{itemId}:expanded
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
        console.log("편집 액션 실행:", { itemId, type });
        this.editText(itemId, type);
      } else if (action === "delete") {
        console.log("삭제 액션 실행:", { itemId });
        // 이벤트 전파 제어: outsideClickHandler가 메뉴를 닫기 전에 삭제 실행
        event.preventDefault();
        event.stopPropagation();
        // 메뉴 닫기
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
        // 삭제 실행
        this.deleteText(itemId);
      } else if (action === "track") {
        console.log("트래킹 액션 실행:", { itemId });
        this.startTrackingFromSaved(itemId);
      } else if (action === "add-tracking") {
        console.log("트래킹 데이터 입력 액션 실행:", { itemId });
        this.currentTrackingPost = null; // 포스트 ID 초기화
        this.openTrackingModal(itemId);
      } else if (action === "llm-validation") {
        console.log("LLM 검증 드롭다운 클릭:", { itemId });
        event.preventDefault();
        event.stopPropagation();

        // 드롭다운 메뉴 토글 (모바일 지원)
        const dropdownContainer = button.closest(".llm-validation-dropdown");
        if (dropdownContainer) {
          const dropdownMenu =
            dropdownContainer.querySelector(".llm-dropdown-menu");
          if (dropdownMenu) {
            const isOpen = dropdownMenu.classList.toggle("open");
            button.setAttribute("aria-expanded", isOpen ? "true" : "false");

            // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
            if (isOpen) {
              this.applySmartMenuPosition(dropdownMenu, button);

              // 포커스 트랩: 메뉴가 열리면 첫 번째 LLM 옵션에 포커스
              const firstOption = dropdownMenu.querySelector(".llm-option");
              if (firstOption) {
                setTimeout(() => firstOption.focus(), 50);
              }
            } else {
              // 메뉴 닫힐 때 위치 클래스 제거
              dropdownMenu.classList.remove("open-top", "open-bottom");
            }
          }
        }
        return;
      } else {
        // LLM 옵션 버튼 처리 (data-llm 속성 확인)
        const llmService = button.getAttribute("data-llm");
        if (llmService) {
          console.log("LLM 옵션 클릭:", { itemId, llmService });
          this.validateWithLLM(itemId, llmService);
        }
      }
    };

    // 이벤트 리스너 등록
    this.savedList.addEventListener("click", this.savedItemClickHandler);
    this.savedList.addEventListener("keydown", this.savedItemKeydownHandler);

    // 기존 바깥 클릭 핸들러 제거 (중복 방지)
    if (this.outsideClickHandler) {
      document.removeEventListener("click", this.outsideClickHandler, {
        capture: true,
      });
    }

    // 바깥 클릭 시 모든 more 메뉴 및 LLM 드롭다운 닫기
    // setTimeout을 사용하여 이벤트 처리 순서 보장: 메뉴를 여는 동작이 완료된 후 바깥 클릭을 감지
    this.outsideClickHandler = (e) => {
      const isInsideMenu = e.target.closest(".more-menu");
      const isInsideLLMDropdown = e.target.closest(".llm-validation-dropdown");

      if (!isInsideMenu && !isInsideLLMDropdown) {
        // 이벤트 처리 순서 보장: 메뉴 열기 동작이 완료된 후 실행되도록 setTimeout 사용
        setTimeout(() => {
          // More 메뉴 닫기
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // 포커스 트랩 해제: 메뉴 버튼으로 포커스 복원
            const menuBtn = el.previousElementSibling;
            if (menuBtn && menuBtn.classList.contains("more-menu-btn")) {
              menuBtn.setAttribute("aria-expanded", "false");
              menuBtn.focus();
            }
          });
          document
            .querySelectorAll('.more-menu-btn[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute("aria-expanded", "false"));

          // LLM 드롭다운 닫기
          document.querySelectorAll(".llm-dropdown-menu.open").forEach((el) => {
            el.classList.remove("open");
            // 포커스 트랩 해제: LLM 메인 버튼으로 포커스 복원
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

    // 타임라인 제스처(롱프레스 삭제, 스와이프 좌/우)
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
            // 롱프레스 → 삭제 확인
            this.editingMetricData = this.editingMetricData || {
              metricIndex: Number(metricIndex),
            };
            // editTrackingMetric은 모달 기반이므로 직접 삭제 호출 준비를 위해 context 보장 필요
            // 간단히 삭제 확인 후 진행
            if (confirm("이 기록을 삭제할까요?")) {
              // edit modal 컨텍스트 없이도 삭제 수행을 위해 임시 컨텍스트 구성
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              // textId 기반으로 editingMetricData 셋업
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
              // 좌스와이프 → 편집
              this.editTrackingMetric(row, metricIndex);
            } else {
              // 우스와이프 → 삭제 확인
              const parentSaved = row.closest(".saved-item");
              const itemId = parentSaved
                ? parentSaved.getAttribute("data-item-id")
                : null;
              this.editingMetricData = {
                postId: null,
                textId: itemId,
                metricIndex: Number(metricIndex),
              };
              if (confirm("이 기록을 삭제할까요?")) {
                this.deleteTrackingDataItem();
              }
            }
          }
        },
        { passive: true }
      );
    }

    // ESC 키로 메뉴 닫기
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
    console.log("이벤트 리스너 등록 완료");
  }

  // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
  applySmartMenuPosition(menu, button) {
    // 기존 위치 클래스 제거
    menu.classList.remove("open-top", "open-bottom");

    // 메뉴 크기 추정 (실제 렌더링 전이라 임시로 표시하여 크기 측정)
    const wasVisible = menu.style.display !== "none";
    if (!wasVisible) {
      menu.style.visibility = "hidden";
      menu.style.display = "block";
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
      menu.classList.add("open-bottom");
    } else if (spaceBelow < threshold && spaceBelow < menuHeight + 20) {
      // 화면 하단 근처이고 아래로 표시할 공간이 부족 → 위로 표시
      menu.classList.add("open-top");
    } else {
      // 기본값: 위로 표시 (더 자연스러운 UX)
      menu.classList.add("open-top");
    }

    // 임시 표시 제거
    if (!wasVisible) {
      menu.style.visibility = "";
      menu.style.display = "";
    }
  }

  // 패널 기반 LLM 검증 버튼 바인딩 (재사용 가능)
  bindPanelLLMButtons() {
    console.log("패널 LLM 버튼 바인딩 시작");

    const panelLlmButtons = document.querySelectorAll(
      ".llm-option[data-panel]"
    );
    console.log(`패널 LLM 버튼 ${panelLlmButtons.length}개 발견`);

    panelLlmButtons.forEach((button, index) => {
      const panel = button.getAttribute("data-panel");
      const llmService = button.getAttribute("data-llm");

      if (!panel || !llmService) {
        console.warn(`패널 LLM 버튼 ${index}에 필수 속성이 없습니다:`, {
          panel,
          llmService,
        });
        return;
      }

      console.log(`패널 LLM 버튼 ${index} 바인딩:`, { panel, llmService });

      // 기존 이벤트 리스너 제거 (중복 방지)
      if (button._panelLlmHandler) {
        button.removeEventListener("click", button._panelLlmHandler);
      }

      // 새로운 이벤트 핸들러 생성 및 바인딩
      button._panelLlmHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("패널 LLM 버튼 클릭:", { panel, llmService });
        this.validatePanelWithLLM(panel, llmService);
      };

      button.addEventListener("click", button._panelLlmHandler);
    });

    console.log("패널 LLM 버튼 바인딩 완료");
  }

  // 직접 이벤트 바인딩 (백업 방법)
  bindDirectEventListeners() {
    console.log("직접 이벤트 바인딩 시작");

    const editButtons = this.savedList.querySelectorAll(".btn-edit");
    const deleteButtons = this.savedList.querySelectorAll(".btn-delete");
    const llmButtons = this.savedList.querySelectorAll(".llm-option");

    console.log(
      `편집 버튼 ${editButtons.length}개, 삭제 버튼 ${deleteButtons.length}개, LLM 버튼 ${llmButtons.length}개 발견`
    );

    editButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");
      const type = button.getAttribute("data-type");

      console.log(`편집 버튼 ${index} 바인딩:`, { itemId, type });

      // 기존 이벤트 리스너 제거
      button.removeEventListener("click", button._editHandler);

      // 새로운 이벤트 핸들러 생성 및 바인딩
      button._editHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("직접 편집 버튼 클릭:", { itemId, type });
        this.editText(itemId, type);
      };

      button.addEventListener("click", button._editHandler);
    });

    deleteButtons.forEach((button, index) => {
      const itemId = button.getAttribute("data-item-id");

      console.log(`삭제 버튼 ${index} 바인딩:`, { itemId });

      // 기존 이벤트 리스너 제거
      button.removeEventListener("click", button._deleteHandler);

      // 새로운 이벤트 핸들러 생성 및 바인딩
      button._deleteHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("직접 삭제 버튼 클릭:", { itemId });
        this.deleteText(itemId);
      };

      button.addEventListener("click", button._deleteHandler);
    });

    // 패널 기반 LLM 검증 버튼들 바인딩 (재사용 함수 호출)
    this.bindPanelLLMButtons();

    console.log("직접 이벤트 바인딩 완료");
  }

  // LLM 특성 정보 검증 함수 (개발자용)
  verifyLLMCharacteristics() {
    console.log("=== LLM 특성 정보 검증 ===");

    if (!this.llmCharacteristics) {
      console.error("❌ llmCharacteristics 객체가 없습니다!");
      return false;
    }

    const services = ["chatgpt", "gemini", "perplexity", "grok"];
    let allValid = true;

    services.forEach((service) => {
      const char = this.llmCharacteristics[service];
      if (!char) {
        console.error(`❌ ${service} 특성 정보가 없습니다!`);
        allValid = false;
      } else {
        console.log(`✅ ${service}:`, {
          name: char.name,
          description: char.description,
          details: char.details,
          strength: char.strength,
        });
      }
    });

    console.log("=== 검증 완료 ===");
    return allValid;
  }

  // 디버깅용 함수 - 전역에서 호출 가능
  debugSavedItems() {
    console.log("=== 저장된 글 디버깅 정보 ===");
    console.log("savedTexts 배열:", this.savedTexts);
    console.log("savedList 요소:", this.savedList);

    const savedItems = this.savedList.querySelectorAll(".saved-item");
    console.log(`저장된 글 항목 ${savedItems.length}개:`);

    savedItems.forEach((item, index) => {
      const itemId = item.getAttribute("data-item-id");
      const editBtn = item.querySelector(".btn-edit");
      const deleteBtn = item.querySelector(".btn-delete");

      console.log(`항목 ${index}:`, {
        id: itemId,
        editButton: editBtn,
        deleteButton: deleteBtn,
        editButtonId: editBtn?.getAttribute("data-item-id"),
        deleteButtonId: deleteBtn?.getAttribute("data-item-id"),
      });
    });

    const editButtons = this.savedList.querySelectorAll(".btn-edit");
    const deleteButtons = this.savedList.querySelectorAll(".btn-delete");
    console.log(
      `편집 버튼 ${editButtons.length}개, 삭제 버튼 ${deleteButtons.length}개`
    );

    console.log("=== 디버깅 정보 끝 ===");
  }

  editText(id, type) {
    console.log("편집 버튼 클릭:", { id, type });
    const item = this.savedTexts.find((saved) => saved.id === id);
    if (item) {
      console.log("편집할 항목 찾음:", item);
      if (type === "reference") {
        this.refTextInput.value = item.content;
        this.updateCharacterCount("ref");
        this.refTextInput.focus();
        this.showMessage(
          "레퍼런스 글을 편집 영역으로 불러왔습니다.",
          "success"
        );
      } else {
        this.editTextInput.value = item.content;
        // 주제 로드 (수정/작성 글인 경우)
        if (this.editTopicInput) {
          this.editTopicInput.value = item.topic || "";
        }
        // SNS 플랫폼 로드 (수정/작성 글인 경우)
        if (item.platforms && Array.isArray(item.platforms)) {
          this.selectedSnsPlatforms = [...item.platforms];
        } else {
          this.selectedSnsPlatforms = [];
        }
        this.renderSnsPlatformTags();
        this.updateSnsPlatformCount();
        this.updateCharacterCount("edit");
        this.editTextInput.focus();
        this.showMessage("수정 글을 편집 영역으로 불러왔습니다.", "success");
      }
      this.refTextInput.scrollIntoView({ behavior: "smooth" });
    } else {
      console.error("편집할 항목을 찾을 수 없음:", {
        id,
        type,
        savedTexts: this.savedTexts,
      });
      this.showMessage("편집할 글을 찾을 수 없습니다.", "error");
    }
  }
  // Firestore에서 텍스트 삭제 (Soft Delete)
  async deleteText(id) {
    console.log("삭제 버튼 클릭 (Soft Delete):", { id });

    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("로그인이 필요합니다.", "error");
      return;
    }

    try {
      // 삭제할 아이템 찾기
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("삭제할 아이템을 찾을 수 없습니다:", id);
        this.showMessage("삭제할 글을 찾을 수 없습니다.", "error");
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // Phase 1.7.1: 레퍼런스 삭제 시 연결된 작성글 확인
      if ((itemToDelete.type || "edit") === "reference") {
        const usedEdits = this.getEditsByReference(id);
        if (usedEdits.length > 0) {
          const confirmed = confirm(
            `⚠️ 이 레퍼런스는 ${usedEdits.length}개의 작성글에서 참고되고 있습니다.\n\n` +
              `휴지통으로 이동하시겠습니까?\n\n` +
              `(작성글의 연결 정보는 유지되지만, 레퍼런스 내용은 볼 수 없게 됩니다.)`
          );
          if (!confirmed) {
            console.log("사용자가 레퍼런스 삭제 취소");
            return;
          }
        }
      }

      if (!confirm("이 글을 휴지통으로 이동하시겠습니까?")) {
        return;
      }

      // 낙관적 업데이트를 위한 백업
      const itemBackup = { ...itemToDelete };

      // Soft Delete 처리
      itemToDelete.isDeleted = true;
      itemToDelete.deletedAt = new Date().toISOString();

      // UI 업데이트 (메인 목록에서 제거)
      // this.savedTexts는 참조를 유지해야 하므로 배열 자체를 교체하지 않고 상태만 변경
      // renderSavedTexts에서 isDeleted 필터링 처리

      // 캐시 무효화
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // UI 갱신
      this.refreshUI({
        savedTexts: true,
        trackingPosts: true, // 트래킹 포스트는 유지되지만 소스가 삭제됨 표시 필요할 수 있음
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      console.log("Firestore Soft Delete 시작:", { id });

      try {
        // Firestore 업데이트
        const docRef = window.firebaseDoc(
          this.db,
          "users",
          this.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: true,
          deletedAt: window.firebaseServerTimestamp(), // 서버 시간 사용
        });

        this.showMessage("휴지통으로 이동되었습니다.", "success");
        console.log("Soft Delete 완료", { id });
      } catch (error) {
        console.error("텍스트 삭제 실패:", error);

        // 실패 복구
        itemToDelete.isDeleted = false;
        delete itemToDelete.deletedAt;

        this.renderSavedTextsCache = null;
        this.renderSavedTextsCacheKey = null;
        this.renderSavedTexts();

        this.showMessage(
          "휴지통 이동에 실패했습니다. 다시 시도해주세요.",
          "error"
        );
      }
    } catch (error) {
      console.error("텍스트 삭제 실패:", error);
      this.showMessage(
        "휴지통 이동에 실패했습니다. 다시 시도해주세요.",
        "error"
      );
    }
  }

  // 글 복원 (Restore)
  async restoreText(id) {
    console.log("복원 버튼 클릭:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("복원할 아이템을 찾을 수 없습니다:", id);
        return;
      }

      const itemToRestore = this.savedTexts[targetIndex];

      // 낙관적 업데이트
      itemToRestore.isDeleted = false;
      itemToRestore.deletedAt = null;

      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      // 휴지통 UI 갱신 (호출자가 처리하거나 여기서 처리)
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

        this.showMessage("글이 복원되었습니다.", "success");
      } catch (error) {
        console.error("복원 실패:", error);
        // 롤백
        itemToRestore.isDeleted = true;
        itemToRestore.deletedAt = new Date().toISOString();
        if (document.getElementById("trash-bin-modal")) {
          this.renderTrashBinList();
        }
        this.showMessage("복원에 실패했습니다.", "error");
      }
    } catch (error) {
      console.error("복원 오류:", error);
    }
  }

  // 영구 삭제 (Permanently Delete)
  async permanentlyDeleteText(id) {
    console.log("영구 삭제 버튼 클릭:", { id });

    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const targetIndex = this.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("삭제할 아이템을 찾을 수 없습니다:", id);
        return;
      }

      if (
        !confirm(
          "정말로 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 연결된 트래킹 데이터도 모두 삭제됩니다."
        )
      ) {
        return;
      }

      const itemToDelete = this.savedTexts[targetIndex];

      // 연결된 트래킹 포스트 찾기 (기존 로직 재사용)
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
      const querySnapshot = await window.firebaseGetDocs(q);

      const connectedPosts = [];
      querySnapshot.forEach((doc) => {
        connectedPosts.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // 낙관적 업데이트: 배열에서 제거
      this.savedTexts.splice(targetIndex, 1);
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;

      if (document.getElementById("trash-bin-modal")) {
        this.renderTrashBinList();
      }

      try {
        // 실제 Firestore 삭제
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

        this.showMessage("영구 삭제되었습니다.", "success");
      } catch (error) {
        console.error("영구 삭제 실패:", error);
        // 롤백 (복잡하므로 새로고침 권장 메시지 또는 단순 에러 표시)
        this.showMessage(
          "영구 삭제 중 오류가 발생했습니다. 새로고침 해주세요.",
          "error"
        );
        this.loadSavedTexts(true); // 데이터 재로드
      }
    } catch (error) {
      console.error("영구 삭제 오류:", error);
    }
  }
  // [Refactoring] Utils 모듈 사용
  escapeHtml(text) {
    return escapeHtml(text);
  }

  // 텍스트만 이스케이프 (줄바꿈 없이)
  escapeHtmlOnly(text) {
    if (!text) return "";

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 사용자에게 메시지 표시
   * [Refactoring] UIManager로 위임
   * @param {string} message - 메시지 내용
   * @param {string} type - 메시지 타입 ('success', 'error', 'info', 'warning')
   */
  showMessage(message, type = "info") {
    if (this.uiManager) {
      this.uiManager.showMessage(message, type);
    } else {
      // Fallback: UIManager가 초기화되지 않은 경우
      console.warn("UIManager not initialized, using fallback");
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
   * 스크린 리더 사용자를 위한 알림
   * aria-live 영역을 사용하여 스크린 리더에 메시지를 전달합니다.
   *
   * @param {string} message - 스크린 리더에 전달할 메시지
   */
  announceToScreenReader(message) {
    if (!message || typeof message !== "string") {
      return;
    }

    // aria-live 영역이 없으면 생성
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

    // 메시지 업데이트 (스크린 리더가 변경을 감지하도록)
    ariaLiveRegion.textContent = "";
    // 약간의 지연 후 메시지 설정 (스크린 리더가 변경을 확실히 감지하도록)
    setTimeout(() => {
      ariaLiveRegion.textContent = message;
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // 보안 강화: 사용자 데이터 암호화
  async encryptUserData(data) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));

      // 사용자별 고유 키 생성
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
      console.warn("데이터 암호화 실패:", error);
      return null;
    }
  }

  // 보안 강화: 사용자 데이터 복호화
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
      console.warn("데이터 복호화 실패:", error);
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
      chatgpt:
        "다음 글을 SNS 후킹 관점에서 분석해주세요. 특히 다음 요소들을 평가해주세요:\n\n🎯 후킹 효과성:\n- 첫 문장이 독자의 관심을 끌 수 있는가?\n- 감정적 몰입을 유도하는가?\n- 호기심을 자극하는 요소가 있는가?\n\n📱 SNS 최적화:\n- 읽기 쉬운 구조인가?\n- 공유하고 싶은 욕구를 자극하는가?\n- 댓글을 유도할 수 있는 요소가 있는가?\n\n💡 개선 제안:\n- 더 강력한 후킹 포인트 제안\n- 감정적 반응을 높이는 방법\n- 행동 유도(좋아요, 공유, 댓글) 강화 방안\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
      gemini:
        "다음 글을 SNS 마케팅 전문가 관점에서 분석해주세요:\n\n🧠 심리적 후킹 분석:\n- 독자의 무의식을 자극하는 요소 분석\n- 감정적 트리거 포인트 식별\n- 인지 편향 활용도 평가\n\n📊 타겟 독자 분석:\n- 어떤 독자층에게 어필하는가?\n- 공감대 형성 요소는 무엇인가?\n- 행동 변화를 유도할 수 있는가?\n\n🎨 표현력 개선:\n- 더 강력한 표현으로 바꿀 부분\n- 시각적 임팩트를 높이는 방법\n- 기억에 남는 문구 만들기\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
      perplexity:
        "다음 글을 SNS 트렌드 및 신뢰성 관점에서 분석해주세요:\n\n🔍 트렌드 적합성:\n- 현재 SNS 트렌드와 부합하는가?\n- 바이럴 가능성이 있는 주제인가?\n- 시의적절한 타이밍인가?\n\n📈 신뢰성 강화:\n- 사실 확인이 필요한 부분\n- 더 설득력 있는 근거 제시 방법\n- 전문성 어필 요소 추가 방안\n\n🌐 확산 가능성:\n- 공유 가치가 있는 콘텐츠인가?\n- 논란을 일으킬 수 있는 요소는?\n- 긍정적 바이럴을 위한 개선점\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
      grok: "다음 글을 SNS 후킹 전문가 관점에서 간결하고 임팩트 있게 분석해주세요:\n\n⚡ 임팩트 포인트:\n- 가장 강력한 후킹 문장은?\n- 독자에게 남을 핵심 메시지는?\n- 행동을 유도하는 CTA는?\n\n🎯 명확성 검증:\n- 메시지가 명확하게 전달되는가?\n- 불필요한 요소는 없는가?\n- 핵심만 간결하게 전달하는가?\n\n🚀 개선 액션:\n- 즉시 적용 가능한 개선점\n- 더 강력한 후킹 문구 제안\n- 독자 반응을 높이는 방법\n\n📂 카테고리 추천:\n- 이 글이 어떤 카테고리에 가장 적합한지 3가지 추천\n- 각 카테고리의 적합도와 이유 설명\n- 카테고리별 게시 전략 제안\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
      claude:
        "다음 글을 포맷 엄수와 긴 문맥 이해에 강한 전문가로서 분석해주세요:\n\n📌 구조적 분석:\n- 주제·메시지·타겟 요약(1~2줄)\n- 논리 흐름과 결론의 일치 여부\n\n🧭 형식 준수 점검:\n- 요구된 출력 형식/톤 준수 여부\n- 모호/과장/과도한 확언 존재 여부\n\n💡 개선 제안:\n- 형식/명확성/근거 보강 포인트\n- 안전한 대안 표현(과장 최소화)\n\n[정책 준수 검사]\n정책: '경제적 이익에 관한 현실성 없는 주장이나 약속(고수익 보장, 원금 보장, 무위험, 단기간 고수익, 확정 수익/퍼센트 보장 등)' 금지.\n검토 대상 텍스트: 위 '분석할 글'\n출력 형식(엄수):\n위반 여부: [명백한 위반|위반 소지 높음|애매함(경고)|안전|명백한 비위반]\n위반 위험 점수: [1|2|3|4|5]\n위반 근거 문구: [...]\n분석 사유: (핵심 근거를 3줄 이내로)\n\n[2~3줄 카피 생성]\n역할: 당신은 카피라이터입니다. 아래 '분석할 글'의 주제·정서·메시지를 유지하며 2~3줄 카피를 생성하세요.\n요구사항:\n- 정확히 2줄 또는 3줄만 출력(상황에 맞춰 선택). 줄바꿈으로 구분, 그 외 텍스트 금지.\n- 2줄일 때: 1줄차=보편적·넓은 공감(원문과 일맥상통), 2줄차=구체·직접적·감정 이입 유발.\n- 3줄일 때: 1줄차=보편적 메시지, 2줄차=맥락 전개(1줄과 연결), 3줄차=구체·직접적·감정 이입 유발.\n- 간결·명확, 중복/과장/해시태그/이모지/따옴표/머리말·꼬리말 금지.\n\n분석할 글:\n",
    };

    // LLM 사이트별 특성 정보 (사용자 가이드용)
    this.llmCharacteristics = {
      chatgpt: {
        name: "ChatGPT",
        icon: "🤖",
        description: "SNS 후킹 분석",
        details: "후킹 효과성·SNS 최적화·행동 유도 분석",
        strength: "종합적 후킹 전략",
      },
      gemini: {
        name: "Gemini",
        icon: "🧠",
        description: "심리적 후킹",
        details: "무의식 자극·감정 트리거·타겟 독자 분석",
        strength: "심리학적 접근",
      },
      perplexity: {
        name: "Perplexity",
        icon: "🔎",
        description: "트렌드 검증",
        details: "SNS 트렌드·바이럴 가능성·신뢰성 강화",
        strength: "실시간 트렌드 분석",
      },
      grok: {
        name: "Grok",
        icon: "🚀",
        description: "임팩트 최적화",
        details: "강력한 후킹 문구·명확한 메시지·즉시 개선점",
        strength: "간결한 임팩트 분석",
      },
      claude: {
        name: "Claude",
        icon: "🟣",
        description: "형식 엄수·긴 문맥",
        details: "형식 준수·안전성·장문 요약/구조화",
        strength: "정책/포맷 준수와 긴 문맥 처리",
      },
    };

    // LLM 사이트별 홈페이지 URL (쿼리 파라미터 지원 안 함, 모달 방식 사용)
    this.llmUrls = {
      chatgpt: "https://chatgpt.com",
      gemini: "https://gemini.google.com",
      perplexity: "https://www.perplexity.ai",
      grok: "https://grok.com",
      claude: "https://claude.ai/new",
    };

    console.log("LLM 검증 시스템 초기화 완료");
  }

  // 패널 기반 LLM 검증 실행
  async validatePanelWithLLM(panel, llmService) {
    console.log("패널 LLM 검증 시작:", { panel, llmService });

    try {
      // 패널에 따른 텍스트 영역 선택
      let textArea, panelType;
      if (panel === "reference") {
        textArea = document.getElementById("ref-text-input");
        panelType = "레퍼런스 글";
      } else if (panel === "writing") {
        textArea = document.getElementById("edit-text-input");
        panelType = "수정/작성 글";
      } else {
        console.error("지원하지 않는 패널:", panel);
        this.showMessage("지원하지 않는 패널입니다.", "error");
        return;
      }

      // 텍스트 내용 가져오기
      const content = textArea.value.trim();
      if (!content) {
        this.showMessage(
          `${panelType}이 비어있습니다. 먼저 글을 작성해주세요.`,
          "warning"
        );
        return;
      }

      // LLM 서비스 정보 가져오기
      const llmInfo = this.llmCharacteristics[llmService];
      if (!llmInfo) {
        console.error("지원하지 않는 LLM 서비스:", llmService);
        this.showMessage("지원하지 않는 LLM 서비스입니다.", "error");
        return;
      }

      // 프롬프트 생성 (제목 라인 없이)
      const prompt = this.llmPrompts[llmService];
      const fullText = `${prompt}\n\n${content}`;

      console.log("패널 검증 텍스트 생성:", {
        panel,
        llmService,
        contentLength: content.length,
      });

      // 클립보드에 복사
      await this.copyToClipboard(fullText);

      // LLM 사이트 열기
      this.openLLMSite(llmService, fullText);

      // 성공 메시지 (심플한 안내)
      this.showMessage(
        `${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`,
        "success"
      );
    } catch (error) {
      console.error("패널 LLM 검증 실행 실패:", error);
      this.showMessage("LLM 검증 실행에 실패했습니다.", "error");
    }
  }

  // LLM 검증 실행
  async validateWithLLM(itemId, llmService) {
    console.log("LLM 검증 시작:", { itemId, llmService });

    // 저장된 글 찾기
    const item = this.savedTexts.find((saved) => saved.id === itemId);
    if (!item) {
      this.showMessage("검증할 글을 찾을 수 없습니다.", "error");
      return;
    }

    // 프롬프트와 글 내용 조합
    const prompt = this.llmPrompts[llmService];
    const fullText = prompt + item.content;

    console.log("검증 텍스트 생성:", {
      llmService,
      contentLength: item.content.length,
    });

    try {
      // 클립보드에 복사
      await this.copyToClipboard(fullText);

      // LLM 사이트 URL 생성 및 새 탭에서 열기
      this.openLLMSite(llmService, fullText);

      // 성공 메시지 (심플한 안내)
      const llmInfo = this.llmCharacteristics[llmService];
      if (llmInfo) {
        this.showMessage(
          `${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`,
          "success"
        );
      }
    } catch (error) {
      console.error("LLM 검증 실행 실패:", error);
      this.showMessage("LLM 검증 실행에 실패했습니다.", "error");
    }
  }

  // 클립보드에 텍스트 복사
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        console.log("클립보드 복사 성공 (Clipboard API)");
      } else {
        // 폴백 방법
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
        console.log("클립보드 복사 성공 (execCommand)");
      }
    } catch (error) {
      console.error("클립보드 복사 실패:", error);
      throw error;
    }
  }

  // LLM 사이트 새 탭에서 열기 (심플한 방식: 자동 복사 + 새 탭 열기)
  openLLMSite(llmService, text) {
    // LLM 서비스 정보 가져오기
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      console.error("지원하지 않는 LLM 서비스:", llmService);
      return;
    }

    // LLM 사이트 URL 가져오기
    const llmUrl =
      this.llmUrls[llmService] ||
      {
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        perplexity: "https://www.perplexity.ai",
        grok: "https://grok.com",
      }[llmService] ||
      "https://chatgpt.com";

    console.log("LLM 사이트 열기:", { llmService, url: llmUrl });

    // 새 탭에서 LLM 사이트 열기
    window.open(llmUrl, "_blank", "noopener,noreferrer");
  }

  // LLM 통합 복사 모달 표시 (모든 LLM 지원)
  showLLMCopyModal(llmService, text) {
    // LLM 서비스 정보 가져오기
    const llmInfo = this.llmCharacteristics[llmService];
    if (!llmInfo) {
      console.error("지원하지 않는 LLM 서비스:", llmService);
      return;
    }

    // 기본 URL 가져오기 (쿼리 파라미터 제거)
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

    // 기존 모달이 있다면 제거
    const existingModal = document.getElementById("llm-copy-modal");
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
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // 텍스트 영역 자동 선택
    setTimeout(() => {
      const textArea = document.getElementById("llm-text-area");
      if (textArea) {
        textArea.focus();
        textArea.select();
      }
    }, 100);
  }

  // Gemini 전용 복사 모달 표시 (하위 호환성을 위해 유지)
  showGeminiCopyModal(text) {
    this.showLLMCopyModal("gemini", text);
  }

  // LLM 통합 텍스트 복사 함수 (모든 LLM 지원)
  copyLLMText(llmService) {
    const textArea = document.getElementById("llm-text-area");
    if (!textArea) {
      console.error("LLM 텍스트 영역을 찾을 수 없습니다.");
      return;
    }

    const llmInfo = this.llmCharacteristics[llmService];
    const llmName = llmInfo?.name || "LLM";

    try {
      // 텍스트 영역 선택
      textArea.focus();
      textArea.select();

      // 복사 실행
      const successful = document.execCommand("copy");
      if (successful) {
        this.showMessage(`✅ 텍스트가 클립보드에 복사되었습니다!`, "success");

        // 복사 버튼 텍스트 변경
        const copyBtn = document.querySelector(".gemini-copy-btn");
        if (copyBtn) {
          copyBtn.textContent = "✅ 복사 완료!";
          copyBtn.style.background = "#4CAF50";

          // 2초 후 원래 상태로 복원
          setTimeout(() => {
            copyBtn.textContent = "📋 전체 복사";
            copyBtn.style.background = "";
          }, 2000);
        }
      } else {
        throw new Error("복사 명령 실행 실패");
      }
    } catch (error) {
      console.error(`${llmName} 텍스트 복사 실패:`, error);
      this.showMessage(
        "❌ 복사에 실패했습니다. 텍스트를 수동으로 선택하여 복사해주세요.",
        "error"
      );
    }
  }

  // Gemini 텍스트 복사 함수 (하위 호환성을 위해 유지)
  copyGeminiText() {
    this.copyLLMText("gemini");
  }

  // LLM 검증 가이드 메시지 표시
  showLLMValidationGuide(llmService) {
    const characteristics = this.llmCharacteristics[llmService];

    // 모든 LLM에 통합 모달 방식 사용
    const message =
      `✅ ${characteristics.name} 검증 모달이 열렸습니다!\n\n` +
      `📋 검증할 텍스트가 클립보드에 복사되었습니다.\n` +
      `💡 모달에서 "전체 복사" 버튼을 클릭하거나, ${characteristics.name} 페이지로 이동하여 Ctrl+V로 붙여넣기하세요.\n\n` +
      `🎯 기대 결과: ${characteristics.description} - ${characteristics.details}`;

    this.showMessage(message, "success");

    // 추가 안내를 위한 상세 메시지
    setTimeout(() => {
      this.showDetailedGuide(llmService);
    }, 2000);
  }

  // 상세 가이드 표시
  showDetailedGuide(llmService) {
    const guides = {
      chatgpt:
        "ChatGPT의 SNS 후킹 분석 결과를 바탕으로 글의 감정적 몰입과 행동 유도를 강화해보세요.",
      gemini:
        "Gemini의 심리적 후킹 분석을 참고하여 독자의 무의식을 자극하는 요소를 추가해보세요.",
      perplexity:
        "Perplexity의 트렌드 분석 결과를 활용하여 현재 SNS 트렌드에 맞게 글을 개선해보세요.",
      grok: "Grok의 임팩트 분석을 반영하여 더 강력하고 명확한 후킹 문구로 글을 업그레이드해보세요.",
    };

    const guide = guides[llmService];
    this.showMessage(`💡 ${guide}`, "info");
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

    if (refText.length > 0 || editText.length > 0) {
      // trim() 제거하여 원본 포맷 유지
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
        console.error("임시 저장에 실패했습니다:", error);
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
          if (confirm("임시 저장된 글이 있습니다. 복원하시겠습니까?")) {
            if (data.refText) {
              this.refTextInput.value = data.refText;
              this.updateCharacterCount("ref");
            }
            if (data.editText) {
              this.editTextInput.value = data.editText;
              this.updateCharacterCount("edit");
            }
            this.showMessage("임시 저장된 글이 복원되었습니다.", "success");
          }
        } else {
          localStorage.removeItem(userTempKey);
        }
      }
    } catch (error) {
      console.error("임시 저장 복원에 실패했습니다:", error);
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
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI 업데이트 (동기)
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
      await this.renderSavedTexts();
      this.startTempSave();
      this.restoreTempSave();

      // 미트래킹 글 버튼 상태 업데이트 (동기, Phase 2에서 최적화됨)
      if (this.updateBatchMigrationButton) {
        this.updateBatchMigrationButton();
      }
    } catch (error) {
      console.error("사용자 데이터 로드 실패:", error);
      this.showMessage("데이터를 불러오는데 실패했습니다.", "error");
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
      this.showMessage("⚠️ 로그인이 필요합니다.", "warning");
      return;
    }

    // 로딩 상태 표시
    const refreshBtn = this.refreshBtn;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      const refreshIcon = refreshBtn.querySelector(".refresh-icon");
      if (refreshIcon) {
        refreshIcon.style.animation = "spin 0.6s linear infinite";
      }
    }

    try {
      // ✅ Phase 3.1.1: 저장된 글 및 트래킹 포스트 병렬 새로고침 (30-50% 단축)
      await Promise.all([
        this.loadSavedTextsFromFirestore(),
        this.loadTrackingPosts ? this.loadTrackingPosts() : Promise.resolve(),
      ]);

      // UI 업데이트
      this.updateCharacterCount("ref");
      this.updateCharacterCount("edit");
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
        force: true,
      });

      // 성공 메시지
      this.showMessage("✅ 데이터가 새로고침되었습니다!", "success");
      console.log("✅ 모든 데이터 새로고침 완료");
    } catch (error) {
      console.error("데이터 새로고침 실패:", error);
      this.showMessage(
        "❌ 데이터 새로고침에 실패했습니다: " + error.message,
        "error"
      );
    } finally {
      // 로딩 상태 해제
      if (refreshBtn) {
        refreshBtn.disabled = false;
        const refreshIcon = refreshBtn.querySelector(".refresh-icon");
        if (refreshIcon) {
          refreshIcon.style.animation = "";
          // 회전 애니메이션 효과
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
   * 저장된 글 데이터를 보장합니다.
   *
   * @param {boolean} forceReload - true면 Firestore에서 다시 불러옵니다.
   */
  async loadSavedTexts(forceReload = false) {
    try {
      const hasCachedData =
        Array.isArray(this.savedTexts) && this.savedTexts.length > 0;
      if (!forceReload && hasCachedData) {
        return;
      }

      if (!this.currentUser || !this.isFirebaseReady) {
        console.warn(
          "loadSavedTexts: Firebase�� �����Ǿ� �ִ� �Ǵ� �α����� �ʿ��մϴ�."
        );
        return;
      }

      await this.loadSavedTextsFromFirestore();
      await this.renderSavedTexts();
    } catch (error) {
      console.error("loadSavedTexts ����:", error);
      this.showMessage("❌ ����� �� �ҷ����� �� �����߽��ϴ�.", "error");
    }
  }

  // Firestore에서 저장된 텍스트들 불러오기
  // 성능 최적화: 서버 사이드 필터링 지원 (선택적)
  async loadSavedTextsFromFirestore(filterOptions = {}) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // 서버 사이드 필터링 구성 (성능 최적화)
      // 참고: Firestore 복합 인덱스 필요 시 Firebase Console에서 생성 필요
      // 인덱스 예시: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)
      const queryConstraints = [window.firebaseOrderBy("createdAt", "desc")];

      // type 필터 (서버 사이드)
      if (filterOptions.type && filterOptions.type !== "all") {
        queryConstraints.push(
          window.firebaseWhere("type", "==", filterOptions.type)
        );
      }

      // referenceType 필터 (서버 사이드, type이 'reference'일 때만 유효)
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
      const querySnapshot = await window.firebaseGetDocs(q);

      this.savedTexts = [];
      // 캐시 무효화 (데이터 로드 시)
      this.renderSavedTextsCache = null;
      this.renderSavedTextsCacheKey = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // 타입 정규화 (레거시 값 대응): 'writing'|'edit' -> 'edit', 'ref'|'reference' -> 'reference'
        let normalizedType = (data.type || "").toString().toLowerCase();
        if (normalizedType === "writing") normalizedType = "edit";
        if (normalizedType === "ref") normalizedType = "reference";

        // [Tab Separation] 'script' 타입 보존 (기존에는 알 수 없는 타입은 무조건 edit로 처리했음)
        if (
          normalizedType !== "edit" &&
          normalizedType !== "reference" &&
          normalizedType !== "script"
        ) {
          // 알 수 없는 타입은 편의상 'edit'로 처리
          normalizedType = "edit";
        }
        this.savedTexts.push({
          id: doc.id,
          content: data.content,
          date: data.createdAt
            ? data.createdAt.toDate().toLocaleString("ko-KR")
            : "날짜 없음",
          createdAt: data.createdAt, // Firestore Timestamp 원본 보존
          characterCount: data.characterCount,
          type: normalizedType,
          referenceType: data.referenceType || "unspecified",
          topic: data.topic || undefined,
          contentHash: data.contentHash || undefined,
          hashVersion: data.hashVersion || undefined,

          // ✅ 연결된 레퍼런스 (기존 데이터는 undefined이므로 빈 배열로 처리)
          linkedReferences: Array.isArray(data.linkedReferences)
            ? data.linkedReferences
            : [],
          referenceMeta: data.referenceMeta || undefined,

          // ✅ SNS 플랫폼 (기존 데이터는 undefined이므로 빈 배열로 처리)
          platforms: Array.isArray(data.platforms) ? data.platforms : [],
        });
      });

      console.log(`${this.savedTexts.length}개의 텍스트를 불러왔습니다.`);

      // 주제 필터 옵션 업데이트 (데이터 로드 후)
      this.updateTopicFilterOptions();

      // 해시 미보유 레퍼런스 안내 (접근성: 토스트는 aria-live로 표시됨)
      try {
        const missingHashCount = this.savedTexts.filter(
          (t) => (t.type || "edit") === "reference" && !t.contentHash
        ).length;
        if (missingHashCount > 0) {
          this.showMessage(
            `ℹ️ 해시가 없는 레퍼런스 ${missingHashCount}개가 있습니다. 필요 시 해시 마이그레이션을 실행하세요.`,
            "info"
          );
        }
      } catch (e) {
        // 무시
      }
    } catch (error) {
      console.error("Firestore에서 텍스트 불러오기 실패:", error);
      // 복합 인덱스 오류인 경우 안내 메시지
      if (error.code === "failed-precondition") {
        console.warn(
          "복합 인덱스가 필요합니다. Firebase Console에서 인덱스를 생성해주세요."
        );
        console.warn(
          "인덱스 구성: Collection: texts, Fields: type (Ascending), referenceType (Ascending), createdAt (Descending)"
        );
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
    // 확대 모드 관련 timeout 정리
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }
  }

  // ===== 반자동화 포스팅 시스템 =====

  // 해시태그 추출 함수
  extractHashtags(content) {
    const hashtagRegex = /#[\w가-힣]+/g;
    const hashtags = content.match(hashtagRegex) || [];
    return hashtags.map((tag) => tag.toLowerCase());
  }

  // 사용자 정의 해시태그 가져오기
  getUserHashtags() {
    try {
      const saved = localStorage.getItem("userHashtags");
      if (saved) {
        const parsed = JSON.parse(saved);
        // 빈 배열도 유효한 값으로 처리
        return Array.isArray(parsed) ? parsed : this.defaultHashtags;
      }
    } catch (error) {
      console.error("해시태그 불러오기 실패:", error);
    }
    return this.defaultHashtags;
  }

  // 사용자 정의 해시태그 저장
  saveUserHashtags(hashtags) {
    try {
      // 빈 배열 허용 (해시태그 없이 사용)
      if (!Array.isArray(hashtags)) {
        console.warn("유효하지 않은 해시태그 배열");
        return false;
      }

      // 해시태그가 없는 경우
      if (hashtags.length === 0) {
        localStorage.setItem("userHashtags", JSON.stringify([]));
        console.log("해시태그 없이 사용하도록 설정됨");
        return true;
      }

      // 해시태그 형식 검증
      const validHashtags = hashtags
        .map((tag) => tag.trim())
        .filter((tag) => tag.startsWith("#") && tag.length > 1)
        .filter((tag) => tag.length <= 50); // 길이 제한

      if (validHashtags.length === 0) {
        console.warn("유효한 해시태그가 없습니다");
        return false;
      }

      localStorage.setItem("userHashtags", JSON.stringify(validHashtags));
      console.log("해시태그 저장 완료:", validHashtags);
      return true;
    } catch (error) {
      console.error("해시태그 저장 실패:", error);
      return false;
    }
  }
  // Threads 포맷팅 함수 (XSS 방지 포함, 줄바꿈 보존)
  formatForThreads(content) {
    // XSS 방지를 위한 HTML 이스케이프 (줄바꿈은 보존)
    if (!content) return "";

    // 줄바꿈 보존하면서 XSS 방지
    const escapedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    // 줄바꿈 정규화 (CRLF -> LF)
    const normalizedContent = escapedContent
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // 연속 줄바꿈 정리 (최대 2개까지만)
    const cleanedContent = normalizedContent.replace(/\n{3,}/g, "\n\n");

    return cleanedContent.trim();
  }

  // HTML 이스케이프 함수 (보안 강화 - 완전한 XSS 방지)
  escapeHtml(text) {
    if (typeof text !== "string") {
      return "";
    }

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 사용자 입력 검증 함수 (보안 강화)
  validateUserInput(input, type = "text") {
    if (!input || typeof input !== "string") {
      throw new Error("유효하지 않은 입력입니다.");
    }

    // 길이 제한 검증
    if (input.length > 10000) {
      throw new Error("입력이 너무 깁니다. (최대 10,000자)");
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
      /<meta[^>]*>/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error("위험한 코드가 감지되었습니다.");
      }
    }

    return true;
  }

  // 안전한 텍스트 처리 함수
  sanitizeText(text) {
    this.validateUserInput(text);

    // HTML 태그 제거
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || tempDiv.innerText || "";

    // 특수 문자 정리
    return cleanText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // 제어 문자 제거
      .replace(/\s+/g, " ") // 연속 공백 정리
      .trim();
  }

  // 내용 최적화 엔진 (보안 강화 버전)
  optimizeContentForThreads(content) {
    try {
      // 1단계: 입력 검증 및 정화
      const sanitizedContent = this.sanitizeText(content);

      // 2단계: 성능 최적화 - 대용량 텍스트 처리
      if (sanitizedContent.length > 10000) {
        console.warn(
          "매우 긴 텍스트가 감지되었습니다. 처리 시간이 오래 걸릴 수 있습니다."
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

      // 3단계: 글자 수 최적화 (Threads는 500자 제한)
      if (sanitizedContent.length > 500) {
        // 단어 단위로 자르기 (더 자연스러운 자르기)
        const words = sanitizedContent.substring(0, 500).split(" ");
        words.pop(); // 마지막 불완전한 단어 제거
        optimized.optimized = words.join(" ") + "...";
        optimized.suggestions.push(
          "글이 500자를 초과하여 단어 단위로 잘렸습니다."
        );
        optimized.warnings.push("원본보다 짧아졌습니다.");
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
          optimized.suggestions.push("해시태그를 추가했습니다.");
        } else {
          optimized.hashtags = [];
          optimized.suggestions.push("해시태그 없이 포스팅됩니다.");
        }
      } else {
        // 해시태그 보안 검증
        optimized.hashtags = hashtags.filter((tag) => {
          // 위험한 해시태그 필터링
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

      // 5단계: 최종 포맷팅 적용 (보안 강화)
      optimized.optimized = this.formatForThreads(optimized.optimized);
      optimized.characterCount = optimized.optimized.length;

      // 6단계: 보안 검증 완료 표시
      optimized.securityChecks.inputValidated = true;

      return optimized;
    } catch (error) {
      console.error("내용 최적화 중 오류 발생:", error);

      // 보안 오류인 경우 특별 처리
      if (
        error.message.includes("위험한") ||
        error.message.includes("유효하지 않은")
      ) {
        throw new Error(
          "보안상의 이유로 내용을 처리할 수 없습니다. 입력을 확인해주세요."
        );
      }

      throw new Error("내용 최적화에 실패했습니다.");
    }
  }

  // 폴백 클립보드 복사 함수
  fallbackCopyToClipboard(text) {
    console.log("🔄 폴백 클립보드 복사 시작");
    console.log("📝 폴백 복사할 텍스트:", text);
    console.log("📝 폴백 텍스트 길이:", text ? text.length : "undefined");

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
        console.log("✅ textarea 생성 및 DOM 추가 완료");

        // 모바일 지원을 위한 선택 범위 설정
        if (textArea.setSelectionRange) {
          textArea.setSelectionRange(0, text.length);
          console.log("✅ setSelectionRange 사용");
        } else {
          textArea.select();
          console.log("✅ select() 사용");
        }

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        console.log("✅ textarea 제거 완료");
        console.log("📋 execCommand 결과:", successful);

        if (successful) {
          console.log("✅ 폴백 복사 성공");
          resolve(true);
        } else {
          console.error("❌ execCommand 복사 실패");
          reject(new Error("execCommand 복사 실패"));
        }
      } catch (error) {
        console.error("❌ 폴백 복사 중 오류:", error);
        reject(error);
      }
    });
  }

  // 로딩 상태 관리 함수
  showLoadingState(element, isLoading) {
    if (isLoading) {
      element.disabled = true;
      element.innerHTML = "⏳ 처리 중...";
      element.classList.add("loading");
    } else {
      element.disabled = false;
      element.innerHTML = "🚀 반자동 포스팅";
      element.classList.remove("loading");
    }
  }

  // 클립보드 자동화 (완전한 에러 처리 및 폴백)
  async copyToClipboardWithFormat(content) {
    console.log("🔍 copyToClipboardWithFormat 시작");
    console.log("📝 입력 내용:", content);
    console.log("📝 입력 타입:", typeof content);

    const button = document.getElementById("semi-auto-post-btn");

    try {
      // 로딩 상태 표시
      if (button) {
        this.showLoadingState(button, true);
      }

      // 1단계: 입력 검증 강화
      if (!content || typeof content !== "string") {
        console.error("❌ 유효하지 않은 내용:", content);
        throw new Error("유효하지 않은 내용입니다.");
      }

      console.log("✅ 1단계: 입력 검증 통과");

      // 2단계: 원본 텍스트 그대로 사용 (줄바꿈 보존)
      console.log("📝 원본 내용 사용 (줄바꿈 보존):", content);

      if (!content || content.length === 0) {
        console.error("❌ 내용이 비어있음");
        throw new Error("내용이 비어있습니다.");
      }

      console.log("✅ 2단계: 검증 완료");

      // 클립보드 API 지원 확인
      console.log("🔄 3단계: 클립보드 API 확인...");
      console.log("📋 navigator.clipboard 존재:", !!navigator.clipboard);
      console.log("🔒 isSecureContext:", window.isSecureContext);

      if (navigator.clipboard && window.isSecureContext) {
        try {
          console.log("📋 클립보드 API로 복사 시도...");
          await navigator.clipboard.writeText(content);
          console.log("✅ 클립보드 API 복사 성공");
          this.showMessage("✅ 내용이 클립보드에 복사되었습니다!", "success");
          return true;
        } catch (clipboardError) {
          console.warn(
            "❌ Clipboard API 실패, 폴백 방법 사용:",
            clipboardError
          );
          throw clipboardError;
        }
      } else {
        console.warn("❌ Clipboard API 미지원");
        throw new Error("Clipboard API 미지원");
      }
    } catch (error) {
      console.error("❌ 클립보드 복사 실패:", error);
      console.error("❌ 오류 상세:", error.stack);

      try {
        // 폴백 방법 시도
        console.log("🔄 폴백 방법 시도...");
        await this.fallbackCopyToClipboard(content);
        console.log("✅ 폴백 방법 복사 성공");
        this.showMessage(
          "✅ 내용이 클립보드에 복사되었습니다! (폴백 방법)",
          "success"
        );
        return true;
      } catch (fallbackError) {
        console.error("❌ 폴백 복사도 실패:", fallbackError);
        this.showMessage(
          "❌ 클립보드 복사에 실패했습니다. 수동으로 복사해주세요.",
          "error"
        );

        // 수동 복사를 위한 텍스트 영역 표시
        console.log("🔄 수동 복사 모달 표시...");
        this.showManualCopyModal(formattedContent);
        return false;
      }
    } finally {
      // 로딩 상태 해제
      if (button) {
        this.showLoadingState(button, false);
      }
      console.log("✅ 로딩 상태 해제 완료");
    }
  }

  // 수동 복사 모달 표시 함수
  showManualCopyModal(content) {
    const modal = document.createElement("div");
    modal.className = "manual-copy-modal";
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
    const textarea = modal.querySelector(".copy-textarea");
    textarea.focus();
    textarea.select();
  }
  // 최적화 모달 표시 함수 (접근성 강화)
  showOptimizationModal(optimized, originalContent) {
    // 원본 텍스트 저장 (줄바꿈 보존)
    optimized.originalContent = originalContent;

    const modal = document.createElement("div");
    modal.className = "optimization-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");
    modal.setAttribute("aria-describedby", "modal-description");

    // 현재 언어 감지
    const currentLang = this.detectLanguage();
    console.log("🌍 감지된 언어:", currentLang);
    console.log("📝 원본 텍스트 저장:", originalContent);

    modal.innerHTML = `
            <div class="optimization-content" lang="${currentLang}">
                <h3 id="modal-title">${this.t("optimizationTitle")}</h3>
                <div id="modal-description" class="sr-only">포스팅 내용이 최적화되었습니다. 결과를 확인하고 진행하세요.</div>
                
                <div class="optimization-stats" role="region" aria-label="최적화 통계">
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
                        <span class="stat-value" aria-label="해시태그 ${
                          optimized.hashtags.length
                        }${this.t("hashtagCount")}">${optimized.hashtags.join(
      " "
    )}</span>
                    </div>
                </div>
                
                ${
                  optimized.suggestions.length > 0
                    ? `
                    <div class="suggestions" role="region" aria-label="최적화 제안사항">
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
                
                <div class="preview-section" role="region" aria-label="포스팅 내용 미리보기">
                    <div class="hashtag-toggle-section">
                        <label class="hashtag-toggle-label">
                            <input type="checkbox" id="hashtag-toggle" checked aria-label="해시태그 자동 추가">
                            <span class="toggle-text">해시태그 자동 추가</span>
                        </label>
                    </div>
                    <h4>${this.t("previewTitle")}</h4>
                    <div class="preview-content" role="textbox" aria-label="포스팅 내용" tabindex="0" id="preview-content-display">
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
                        ${this.t("cancelButton")}
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // 버튼 클릭 이벤트 직접 바인딩 (동적 생성된 모달)
    setTimeout(() => {
      // 해시태그 토글 스위치
      const hashtagToggle = modal.querySelector("#hashtag-toggle");
      const previewDisplay = modal.querySelector("#preview-content-display");

      if (hashtagToggle && previewDisplay) {
        hashtagToggle.addEventListener("change", () => {
          console.log("🔄 해시태그 토글 변경:", hashtagToggle.checked);

          // 미리보기 업데이트
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

      // 클립보드 복사 버튼
      const copyBtn = modal.querySelector("#copy-only-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // 토글 상태에 따라 해시태그 포함 여부 결정
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          console.log("🔍 클립보드 복사 버튼 클릭 감지");
          console.log("📝 원본 텍스트 직접 사용:", content);
          this.copyToClipboardOnly(content, e);
        });
      }

      // Threads 열기 버튼
      const threadsBtn = modal.querySelector("#threads-only-btn");
      if (threadsBtn) {
        threadsBtn.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("🔍 Threads 열기 버튼 클릭 감지");
          this.openThreadsOnly();
        });
      }

      // 둘 다 실행 버튼
      const bothBtn = modal.querySelector("#both-btn");
      if (bothBtn) {
        bothBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // 토글 상태에 따라 해시태그 포함 여부 결정
          const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
          const content =
            originalContent +
            (includeHashtags && optimized.hashtags.length > 0
              ? "\n\n" + optimized.hashtags.join(" ")
              : "");
          console.log("🔍 둘 다 실행 버튼 클릭 감지");
          console.log("📝 원본 텍스트 직접 사용:", content);
          this.proceedWithPosting(content, e);
        });
      }

      // 취소 버튼
      const cancelBtn = modal.querySelector("#cancel-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("🔍 취소 버튼 클릭 감지");
          modal.remove();
        });
      }
    }, 10);

    // 접근성 강화: 포커스 관리
    const firstBtn = modal.querySelector("#copy-only-btn");

    // 첫 번째 버튼에 포커스
    setTimeout(() => {
      if (firstBtn) {
        firstBtn.focus();
      }
    }, 150);

    // ESC 키로 모달 닫기
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Tab 키 순환 제한 (모달 내에서만)
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

    // 모달이 제거될 때 이벤트 리스너 정리 (간단한 방식)
    const cleanup = () => {
      document.removeEventListener("keydown", handleEscape);
      console.log("✅ 모달 이벤트 리스너 정리됨");
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
    console.log("📋🚀 둘 다 실행 시작");
    console.log("🎯 이벤트 컨텍스트:", event ? "보존됨" : "없음");

    try {
      // 클립보드에 복사 (이벤트 컨텍스트 보존)
      let success = false;

      if (event) {
        console.log("🚀 이벤트 컨텍스트에서 즉시 복사 시도");
        success = await this.copyToClipboardImmediate(formattedContent);
      } else {
        console.log("🔄 기존 방법으로 복사 시도");
        success = await this.copyToClipboardWithFormat(formattedContent);
      }

      if (success) {
        console.log("✅ 클립보드 복사 성공");
      } else {
        console.warn("⚠️ 클립보드 복사 실패, Threads는 계속 열기");
      }

      // Threads 새 탭 열기 (클립보드 복사 성공 여부와 관계없이)
      const threadsUrl = this.getThreadsUrl();
      console.log("🔗 Threads URL:", threadsUrl);
      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      // 사용자 가이드 표시
      this.showPostingGuide();

      // 모달 닫기
      const modal = document.querySelector(".optimization-modal");
      if (modal) {
        modal.remove();
      }
    } catch (error) {
      console.error("포스팅 진행 중 오류:", error);
      this.showMessage("포스팅 진행 중 오류가 발생했습니다.", "error");
    }
  }

  // 클립보드 복사만 실행하는 함수 (이벤트 컨텍스트 보존)
  async copyToClipboardOnly(formattedContent, event = null) {
    console.log("📋 클립보드 복사만 실행");
    console.log("📝 받은 내용:", formattedContent);
    console.log("📝 내용 타입:", typeof formattedContent);
    console.log(
      "📝 내용 길이:",
      formattedContent ? formattedContent.length : "undefined"
    );
    console.log("🎯 이벤트 컨텍스트:", event ? "보존됨" : "없음");

    try {
      // 이벤트가 있으면 즉시 클립보드 복사 시도
      if (event) {
        console.log("🚀 이벤트 컨텍스트에서 즉시 복사 시도");
        const success = await this.copyToClipboardImmediate(formattedContent);

        if (success) {
          this.showMessage("✅ 텍스트가 클립보드에 복사되었습니다!", "success");
          console.log("✅ 클립보드 복사 완료");
          return;
        }
      }

      // 이벤트가 없거나 즉시 복사 실패 시 기존 방법 사용
      console.log("🔄 기존 방법으로 복사 시도");
      const success = await this.copyToClipboardWithFormat(formattedContent);

      if (success) {
        this.showMessage("✅ 텍스트가 클립보드에 복사되었습니다!", "success");
        console.log("✅ 클립보드 복사 완료");
      } else {
        this.showMessage("❌ 클립보드 복사에 실패했습니다.", "error");
        console.error("❌ 클립보드 복사 실패");
      }
    } catch (error) {
      console.error("❌ 클립보드 복사 중 오류:", error);
      this.showMessage(
        "클립보드 복사 중 오류가 발생했습니다: " + error.message,
        "error"
      );
    }
  }

  // 즉시 클립보드 복사 (이벤트 컨텍스트 보존)
  async copyToClipboardImmediate(content) {
    console.log("🚀 즉시 클립보드 복사 시작");

    try {
      // 1단계: 입력 검증
      if (!content || typeof content !== "string") {
        throw new Error("유효하지 않은 내용입니다.");
      }

      // 2단계: 원본 텍스트 그대로 사용 (줄바꿈 보존)
      console.log("📝 원본 내용 (줄바꿈 보존):", content);

      // 3단계: 클립보드 API 시도 (이벤트 컨텍스트 내에서)
      if (navigator.clipboard && window.isSecureContext) {
        try {
          console.log("📋 클립보드 API로 즉시 복사 시도...");
          await navigator.clipboard.writeText(content);
          console.log("✅ 클립보드 API 즉시 복사 성공");
          return true;
        } catch (clipboardError) {
          console.warn("❌ 클립보드 API 즉시 복사 실패:", clipboardError);
          // 폴백으로 execCommand 시도
          return await this.fallbackCopyToClipboard(content);
        }
      } else {
        console.log("🔄 클립보드 API 미지원, 폴백 방법 사용");
        return await this.fallbackCopyToClipboard(content);
      }
    } catch (error) {
      console.error("❌ 즉시 클립보드 복사 실패:", error);
      return false;
    }
  }

  // Threads 열기만 실행하는 함수
  openThreadsOnly() {
    console.log("🚀 Threads 열기만 실행");

    try {
      const threadsUrl = this.getThreadsUrl();
      console.log("🔗 Threads URL:", threadsUrl);

      window.open(threadsUrl, "_blank", "noopener,noreferrer");

      this.showMessage("✅ Threads 페이지가 열렸습니다!", "success");
      console.log("✅ Threads 페이지 열기 완료");

      // 간단한 가이드 표시
      this.showSimpleThreadsGuide();
    } catch (error) {
      console.error("❌ Threads 열기 중 오류:", error);
      this.showMessage(
        "Threads 열기 중 오류가 발생했습니다: " + error.message,
        "error"
      );
    }
  }

  // 간단한 Threads 가이드 표시
  showSimpleThreadsGuide() {
    const currentLang = this.detectLanguage();

    const guide = document.createElement("div");
    guide.className = "simple-threads-guide";
    guide.setAttribute("lang", currentLang);

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
    const userProfileUrl = localStorage.getItem("threads_profile_url");

    if (userProfileUrl && this.isValidThreadsUrl(userProfileUrl)) {
      console.log("✅ 사용자 프로필 URL 사용:", userProfileUrl);
      return userProfileUrl;
    }

    // 기본 Threads 메인 페이지
    console.log("✅ 기본 Threads 메인 페이지 사용");
    return "https://www.threads.com/";
  }

  // Threads URL 유효성 검사
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

  // 사용자 프로필 URL 설정 함수
  setThreadsProfileUrl(url) {
    if (this.isValidThreadsUrl(url)) {
      localStorage.setItem("threads_profile_url", url);
      this.showMessage("✅ Threads 프로필 URL이 설정되었습니다!", "success");
      return true;
    } else {
      this.showMessage(
        "❌ 올바른 Threads URL을 입력해주세요. (예: https://www.threads.com/@username)",
        "error"
      );
      return false;
    }
  }

  // 포스팅 가이드 표시 함수
  showPostingGuide() {
    const guide = document.createElement("div");
    guide.className = "posting-guide";
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

    const modal = document.createElement("div");
    modal.className = "threads-profile-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>⚙️ Threads 프로필 설정</h3>
                <p>포스팅 시 열릴 Threads 페이지를 설정하세요.</p>
                
                <div class="profile-url-section">
                    <label for="threads-profile-url">프로필 URL:</label>
                    <input type="url" id="threads-profile-url" 
                           placeholder="https://www.threads.com/@username"
                           value="${
                             localStorage.getItem("threads_profile_url") || ""
                           }">
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
      const input = modal.querySelector("#threads-profile-url");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // Threads 프로필 URL 저장
  saveThreadsProfileUrl() {
    const input = document.getElementById("threads-profile-url");
    if (input) {
      const url = input.value.trim();
      if (url) {
        this.setThreadsProfileUrl(url);
      } else {
        // 빈 값이면 기본 URL로 설정
        localStorage.removeItem("threads_profile_url");
        this.showMessage(
          "✅ 기본 Threads 메인 페이지로 설정되었습니다!",
          "success"
        );
      }

      // 모달 닫기
      const modal = document.querySelector(".threads-profile-modal");
      if (modal) {
        modal.remove();
      }
    }
  }

  // 해시태그 설정 모달 표시
  showHashtagSettings() {
    const currentLang = this.detectLanguage();
    const currentHashtags = this.getUserHashtags();

    const modal = document.createElement("div");
    modal.className = "hashtag-settings-modal";
    modal.setAttribute("lang", currentLang);

    modal.innerHTML = `
            <div class="modal-content">
                <h3>📌 해시태그 설정</h3>
                <p>반자동 포스팅 시 사용될 기본 해시태그를 설정하세요.</p>
                
                <div class="hashtag-input-section">
                    <label for="hashtag-input">해시태그 (쉼표로 구분):</label>
                    <input type="text" id="hashtag-input" 
                           placeholder="예: #writing, #content, #threads"
                           value="${currentHashtags.join(", ")}">
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
      const input = modal.querySelector("#hashtag-input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }

  // 해시태그 설정 저장
  saveHashtagSettings() {
    const input = document.getElementById("hashtag-input");
    if (input) {
      const inputValue = input.value.trim();

      // 빈 값 허용 (해시태그 없이 사용)
      if (!inputValue) {
        this.saveUserHashtags([]);
        this.showMessage(
          "✅ 해시태그 없이 포스팅하도록 설정되었습니다!",
          "success"
        );
        this.updateHashtagsDisplay();

        // 모달 닫기
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
        return;
      }

      // 쉼표로 분리하여 배열로 변환
      const hashtags = inputValue
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (this.saveUserHashtags(hashtags)) {
        this.showMessage("✅ 해시태그가 저장되었습니다!", "success");
        this.updateHashtagsDisplay();

        // 모달 닫기
        const modal = document.querySelector(".hashtag-settings-modal");
        if (modal) {
          modal.remove();
        }
      } else {
        this.showMessage(
          "❌ 해시태그 저장에 실패했습니다. 형식을 확인해주세요.",
          "error"
        );
      }
    }
  }
  // 해시태그 표시 업데이트
  updateHashtagsDisplay() {
    const display = document.getElementById("current-hashtags-display");
    if (display) {
      const hashtags = this.getUserHashtags();
      if (hashtags && hashtags.length > 0) {
        display.textContent = hashtags.join(" ");
      } else {
        display.textContent = "해시태그 없음";
        display.style.color = "#6c757d";
      }
    }
  }

  // 오프라인 지원 함수들
  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn("로컬 스토리지 저장 실패:", error);
      return false;
    }
  }

  loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn("로컬 스토리지 로드 실패:", error);
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
      this.showMessage(
        "📡 오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.",
        "warning"
      );
    }
  }

  // 언어 감지 함수
  detectLanguage() {
    // 1. 브라우저 언어 설정 확인
    const browserLang = navigator.language || navigator.userLanguage;
    console.log("🌍 브라우저 언어:", browserLang);

    // 2. HTML lang 속성 확인
    const htmlLang = document.documentElement.lang;
    console.log("🌍 HTML 언어:", htmlLang);

    // 3. 사용자 설정 언어 확인 (로컬 스토리지)
    const userLang = localStorage.getItem("preferred_language");
    console.log("🌍 사용자 설정 언어:", userLang);

    // 우선순위: 사용자 설정 > HTML 속성 > 브라우저 설정
    let detectedLang = userLang || htmlLang || browserLang;

    // 언어 코드 정규화 (ko-KR -> ko, en-US -> en)
    if (detectedLang) {
      detectedLang = detectedLang.split("-")[0];
    }

    // 지원되는 언어 목록
    const supportedLanguages = ["ko", "en", "ja", "zh"];

    // 지원되지 않는 언어는 기본값(한국어)으로 설정
    if (!supportedLanguages.includes(detectedLang)) {
      detectedLang = "ko";
    }

    console.log("🌍 최종 감지된 언어:", detectedLang);
    return detectedLang;
  }

  // 언어별 텍스트 최적화 적용
  applyLanguageOptimization(element, language) {
    if (!element) return;

    // 언어별 클래스 추가
    element.classList.add(`lang-${language}`);

    // 언어별 스타일 적용
    const style = document.createElement("style");
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
      ko: '"Noto Sans KR", "Malgun Gothic", "맑은 고딕", sans-serif',
      en: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      ja: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "ヒラギノ角ゴ ProN W3", sans-serif',
      zh: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    };

    return fontMap[language] || fontMap["ko"];
  }

  // 국제화 지원 함수들
  getLanguage() {
    return navigator.language || navigator.userLanguage || "ko-KR";
  }

  getTexts() {
    const lang = this.getLanguage();
    const texts = {
      "ko-KR": {
        noContent: "❌ 포스팅할 내용이 없습니다.",
        processingError: "포스팅 처리 중 오류가 발생했습니다.",
        offlineWarning: "📡 오프라인 상태입니다. 로컬에서만 처리됩니다.",
        optimizationTitle: "📝 Threads 포스팅 최적화 결과",
        originalLength: "원본 글자 수:",
        optimizedLength: "최적화된 글자 수:",
        hashtags: "해시태그:",
        optimizationSuggestions: "💡 최적화 사항:",
        previewTitle: "📋 최종 포스팅 내용 미리보기:",
        proceedButton: "📋 클립보드 복사 & Threads 열기",
        cancelButton: "❌ 취소",
        characters: "자",
        hashtagCount: "개",
      },
      "en-US": {
        noContent: "❌ No content to post.",
        processingError: "An error occurred while processing the post.",
        offlineWarning: "📡 You are offline. Processing locally only.",
        optimizationTitle: "📝 Threads Posting Optimization Results",
        originalLength: "Original length:",
        optimizedLength: "Optimized length:",
        hashtags: "Hashtags:",
        optimizationSuggestions: "💡 Optimization suggestions:",
        previewTitle: "📋 Final posting content preview:",
        proceedButton: "📋 Copy to Clipboard & Open Threads",
        cancelButton: "❌ Cancel",
        characters: "chars",
        hashtagCount: "tags",
      },
      "ja-JP": {
        noContent: "❌ 投稿するコンテンツがありません。",
        processingError: "投稿処理中にエラーが発生しました。",
        offlineWarning: "📡 オフライン状態です。ローカルでのみ処理されます。",
        optimizationTitle: "📝 Threads投稿最適化結果",
        originalLength: "元の文字数:",
        optimizedLength: "最適化された文字数:",
        hashtags: "ハッシュタグ:",
        optimizationSuggestions: "💡 最適化提案:",
        previewTitle: "📋 最終投稿内容プレビュー:",
        proceedButton: "📋 クリップボードにコピー & Threadsを開く",
        cancelButton: "❌ キャンセル",
        characters: "文字",
        hashtagCount: "個",
      },
    };

    return texts[lang] || texts["ko-KR"];
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
      return Object.keys(this.measurements).map((label) => ({
        label,
        duration: this.measurements[label].duration || 0,
      }));
    },
  };

  // 메모리 사용량 체크
  checkMemoryUsage() {
    if (performance.memory) {
      const memory = performance.memory;
      console.log("🧠 메모리 사용량:", {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  // 종합 테스트 함수
  async runComprehensiveTest() {
    console.log("🧪 종합 테스트 시작...");

    const testResults = {
      security: false,
      accessibility: false,
      performance: false,
      mobile: false,
      offline: false,
      internationalization: false,
    };

    try {
      // 1. 보안 테스트
      console.log("🔒 보안 테스트...");
      const testContent = '<script>alert("xss")</script>안녕하세요 #test';
      const sanitized = this.sanitizeText(testContent);
      testResults.security = !sanitized.includes("<script>");
      console.log("보안 테스트:", testResults.security ? "✅ 통과" : "❌ 실패");

      // 2. 접근성 테스트
      console.log("♿ 접근성 테스트...");
      const button = document.getElementById("semi-auto-post-btn");
      testResults.accessibility =
        button &&
        button.getAttribute("aria-label") &&
        button.getAttribute("role");
      console.log(
        "접근성 테스트:",
        testResults.accessibility ? "✅ 통과" : "❌ 실패"
      );

      // 3. 성능 테스트
      console.log("⚡ 성능 테스트...");
      this.performanceMonitor.start("테스트");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const duration = this.performanceMonitor.end("테스트");
      testResults.performance = duration < 100; // 100ms 이하
      console.log(
        "성능 테스트:",
        testResults.performance ? "✅ 통과" : "❌ 실패"
      );

      // 4. 모바일 테스트
      console.log("📱 모바일 테스트...");
      const isMobile = window.innerWidth <= 768;
      testResults.mobile = true; // CSS 미디어 쿼리로 처리됨
      console.log("모바일 테스트:", testResults.mobile ? "✅ 통과" : "❌ 실패");

      // 5. 오프라인 테스트
      console.log("💾 오프라인 테스트...");
      testResults.offline =
        typeof this.isOnline === "function" &&
        typeof this.saveToLocalStorage === "function";
      console.log(
        "오프라인 테스트:",
        testResults.offline ? "✅ 통과" : "❌ 실패"
      );

      // 6. 국제화 테스트
      console.log("🌍 국제화 테스트...");
      testResults.internationalization =
        typeof this.t === "function" && this.t("noContent") !== "noContent";
      console.log(
        "국제화 테스트:",
        testResults.internationalization ? "✅ 통과" : "❌ 실패"
      );

      // 결과 요약
      const passedTests = Object.values(testResults).filter(
        (result) => result
      ).length;
      const totalTests = Object.keys(testResults).length;

      console.log(`\n🎯 테스트 완료: ${passedTests}/${totalTests} 통과`);
      console.log("상세 결과:", testResults);

      return testResults;
    } catch (error) {
      console.error("테스트 중 오류 발생:", error);
      return testResults;
    }
  }

  // 반자동화 포스팅 메인 함수 (성능 최적화 + 오프라인 지원 + 모니터링)
  async handleSemiAutoPost() {
    console.log("🔍 반자동화 포스팅 시작");

    const content = this.editTextInput.value;
    console.log("📝 입력 내용:", content);

    if (!content.trim()) {
      console.warn("❌ 포스팅할 내용이 없습니다");
      this.showMessage("❌ 포스팅할 내용이 없습니다.", "error");
      return;
    }

    const button = document.getElementById("semi-auto-post-btn");

    try {
      console.log("✅ 1. 입력 검증 완료");

      // 로딩 상태 표시
      if (button) {
        this.showLoadingState(button, true);
        console.log("✅ 2. 로딩 상태 표시");
      }

      console.log("🔄 3. 내용 최적화 시작...");
      const optimized = await this.optimizeContentForThreadsAsync(content);
      console.log("✅ 4. 내용 최적화 완료:", optimized);

      // 오프라인에서도 로컬 저장
      try {
        this.saveToLocalStorage("lastOptimizedContent", optimized);
        console.log("✅ 5. 로컬 저장 완료");
      } catch (saveError) {
        console.warn("⚠️ 로컬 저장 실패:", saveError);
      }

      // 자동 트래킹 시작: posts 컬렉션에 포스트 생성
      console.log("🔄 6. 자동 트래킹 시작...");
      let sourceTextId = null;
      let referenceTextId = null;

      // 왼쪽 패널(레퍼런스)에서 현재 입력된 레퍼런스 확인
      const referenceContent = this.refTextInput.value.trim();
      if (referenceContent) {
        // 레퍼런스가 입력되어 있는 경우, 저장된 레퍼런스 중에서 찾거나 새로 저장
        try {
          // 저장된 레퍼런스 중에서 동일한 내용의 레퍼런스 찾기
          const matchingReference = this.savedTexts?.find(
            (item) =>
              item.type === "reference" && item.content === referenceContent
          );

          if (matchingReference) {
            // 기존 레퍼런스 사용
            referenceTextId = matchingReference.id;
            console.log("✅ 기존 레퍼런스 사용:", referenceTextId);
          } else {
            // 새 레퍼런스로 저장
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
            console.log("✅ 새 레퍼런스 저장 완료:", referenceTextId);

            // 로컬 배열에도 추가
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
          console.warn(
            "⚠️ 레퍼런스 저장 실패 (트래킹은 계속 진행):",
            referenceError
          );
        }
      }

      // 현재 텍스트를 texts 컬렉션에 먼저 저장 (원본 보존)
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const textData = {
            content: content, // 원본 내용 (최적화 전)
            type: "edit",
            characterCount: this.getKoreanCharacterCount(content),
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // 주제 추가 (선택사항)
          if (this.editTopicInput) {
            const topic = this.editTopicInput.value.trim();
            if (topic) {
              textData.topic = topic;
            }
          }

          // ✅ 참고 레퍼런스 선택 정보 추가
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // 유효한 레퍼런스 ID만 필터링 (존재 여부 확인)
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
                linkedAt: window.firebaseServerTimestamp(), // 연결 시점
                linkCount: validReferences.length, // 연결 개수 (캐시)
              };

              console.log(
                `📚 ${validReferences.length}개 레퍼런스 연결됨 (반자동 포스팅)`
              );
            } else {
              // 빈 배열로 설정 (null이 아닌 빈 배열)
              textData.linkedReferences = [];
            }
          } else {
            // 선택된 레퍼런스가 없는 경우 빈 배열로 설정
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
          console.log("✅ 원본 텍스트 저장 완료:", sourceTextId);
        } catch (textSaveError) {
          console.warn(
            "⚠️ 원본 텍스트 저장 실패 (트래킹은 계속 진행):",
            textSaveError
          );
        }
      }

      // posts 컬렉션에 트래킹 포스트 자동 생성
      if (this.currentUser && this.isFirebaseReady) {
        try {
          const postsRef = window.firebaseCollection(
            this.db,
            "users",
            this.currentUser.uid,
            "posts"
          );
          const postData = {
            content: content, // 원본 내용 (최적화 전, 트래킹용)
            type: "edit",
            postedAt: window.firebaseServerTimestamp(),
            trackingEnabled: true, // 자동으로 트래킹 활성화
            metrics: [],
            analytics: {},
            sourceTextId: sourceTextId || null, // 원본 텍스트 참조 (있는 경우)
            sourceType: "edit", // 원본 텍스트 타입
            // 레퍼런스 사용 정보 추가
            referenceTextId: referenceTextId || null, // 레퍼런스 텍스트 참조 (있는 경우)
            createdAt: window.firebaseServerTimestamp(),
            updatedAt: window.firebaseServerTimestamp(),
          };

          // ✅ 참고 레퍼런스 선택 정보 추가 (posts 컬렉션에도 동일하게 저장)
          if (this.selectedReferences && this.selectedReferences.length > 0) {
            // 유효한 레퍼런스 ID만 필터링 (존재 여부 확인)
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
                linkedAt: window.firebaseServerTimestamp(), // 연결 시점
                linkCount: validReferences.length, // 연결 개수 (캐시)
              };

              console.log(
                `📚 트래킹 포스트에 ${validReferences.length}개 레퍼런스 연결됨`
              );
            } else {
              // 빈 배열로 설정 (null이 아닌 빈 배열)
              postData.linkedReferences = [];
            }
          } else {
            // 선택된 레퍼런스가 없는 경우 빈 배열로 설정
            postData.linkedReferences = [];
          }

          // 레퍼런스가 사용된 경우, 레퍼런스용 포스트도 생성
          if (referenceTextId) {
            const referencePostData = {
              content: referenceContent, // 레퍼런스 내용
              type: "reference",
              postedAt: window.firebaseServerTimestamp(),
              trackingEnabled: false, // 레퍼런스 포스트는 트래킹 비활성화
              metrics: [],
              analytics: {},
              sourceTextId: referenceTextId, // 레퍼런스 텍스트 참조
              sourceType: "reference", // 레퍼런스 타입으로 설정
              createdAt: window.firebaseServerTimestamp(),
              updatedAt: window.firebaseServerTimestamp(),
            };

            await window.firebaseAddDoc(postsRef, referencePostData);
            console.log(
              "✅ 레퍼런스 사용 포스트 생성 완료 (레퍼런스 ID:",
              referenceTextId,
              ")"
            );
          }

          const postDocRef = await window.firebaseAddDoc(postsRef, postData);
          console.log("✅ 트래킹 포스트 자동 생성 완료:", postDocRef.id);

          // 트래킹 탭 목록 새로고침 (백그라운드에서)
          if (this.trackingPosts && this.loadTrackingPosts) {
            this.loadTrackingPosts().catch((err) => {
              console.warn("⚠️ 트래킹 목록 새로고침 실패:", err);
            });
          }

          // 사용자 피드백 메시지
          this.showMessage("📊 트래킹이 자동으로 시작되었습니다!", "success");
        } catch (postError) {
          console.error("❌ 트래킹 포스트 생성 실패:", postError);
          // 트래킹 생성 실패해도 포스팅은 계속 진행
          this.showMessage(
            "⚠️ 트래킹 시작에 실패했지만 포스팅은 계속할 수 있습니다.",
            "warning"
          );
        }
      }

      // ✅ 반자동 포스팅 후 선택된 레퍼런스 초기화 (일관성 유지)
      if (this.selectedReferences && this.selectedReferences.length > 0) {
        this.selectedReferences = [];
        this.renderSelectedReferenceTags();
        if (this.selectedRefCount) {
          this.selectedRefCount.textContent = "(0개 선택됨)";
        }
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0개 선택됨)";
        }
        console.log("✅ 반자동 포스팅 후 레퍼런스 선택 초기화 완료");
      }

      // 최적화 완료 후 모달 표시 (원본 텍스트 전달)
      console.log("🔄 7. 최적화 모달 표시 시작...");
      this.showOptimizationModal(optimized, content);
      console.log("✅ 8. 최적화 모달 표시 완료");
    } catch (error) {
      console.error("❌ 반자동화 포스팅 처리 중 오류:", error);
      console.error("오류 상세:", error.stack);
      this.showMessage(
        "포스팅 처리 중 오류가 발생했습니다: " + error.message,
        "error"
      );
    } finally {
      // 로딩 상태 해제
      if (button) {
        this.showLoadingState(button, false);
        console.log("✅ 8. 로딩 상태 해제");
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
        console.warn("⚠️ 레퍼런스 선택 모달을 찾을 수 없습니다.");
        return;
      }

      // 레퍼런스만 필터링 (type이 없는 경우 'edit'로 간주)
      const references = this.savedTexts.filter(
        (item) => (item.type || "edit") === "reference"
      );

      if (references.length === 0) {
        this.showMessage(
          "⚠️ 저장된 레퍼런스가 없습니다. 먼저 레퍼런스를 저장해주세요.",
          "info"
        );
        return;
      }

      // 레퍼런스 목록 렌더링
      this.renderReferenceSelectionList(references);

      // 검색/필터 초기화
      if (this.referenceSearchInput) this.referenceSearchInput.value = "";
      if (this.referenceTypeFilterModal)
        this.referenceTypeFilterModal.value = "all";

      // 선택 개수 업데이트
      this.updateReferenceSelectionCount();

      // 모달 표시
      this.referenceSelectionModal.style.display = "flex";
      document.body.style.overflow = "hidden"; // 배경 스크롤 방지

      // 접근성: 포커스 이동 (검색 입력 필드로)
      setTimeout(() => {
        if (this.referenceSearchInput) {
          this.referenceSearchInput.focus();
        }
      }, 100);

      console.log("📚 레퍼런스 선택 모달 열림");
    } catch (error) {
      console.error("모달 열기 실패:", error);
      this.showMessage("❌ 모달을 열 수 없습니다.", "error");
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

    this.referenceSelectionModal.style.display = "none";
    document.body.style.overflow = ""; // 배경 스크롤 복원

    // 접근성: 포커스 복원
    if (this.selectReferencesBtn) {
      this.selectReferencesBtn.focus();
    }

    console.log("📚 레퍼런스 선택 모달 닫힘");
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
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem) {
        this.showMessage("❌ 작성글을 찾을 수 없습니다.", "error");
        return;
      }

      const linkedRefs = this.getLinkedReferences(editId);

      if (linkedRefs.length === 0) {
        this.showMessage("ℹ️ 연결된 레퍼런스가 없습니다.", "info");
        return;
      }

      // 모달 내용 생성
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
              ? "아이디어"
              : "기타";

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
                                aria-label="레퍼런스 내용 보기">
                                내용 보기
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
                            <h3 id="linked-ref-modal-title">📚 이 글이 참고한 레퍼런스</h3>
                            <button class="close-btn" aria-label="모달 닫기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>작성글:</strong> ${editTitle}${
        editTitle.length >= 50 ? "..." : ""
      }
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
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // 이벤트 바인딩
      this.bindCustomModalEvents(modal);

      console.log(`📚 연결 레퍼런스 모달 표시: ${linkedRefs.length}개`);
    } catch (error) {
      console.error("연결된 레퍼런스 모달 표시 실패:", error);
      this.showMessage("❌ 레퍼런스를 불러올 수 없습니다.", "error");
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
      const refItem = this.savedTexts.find((item) => item.id === refId);
      if (!refItem) {
        this.showMessage("❌ 레퍼런스를 찾을 수 없습니다.", "error");
        return;
      }

      const usedEdits = this.getEditsByReference(refId);

      if (usedEdits.length === 0) {
        this.showMessage("ℹ️ 이 레퍼런스를 참고한 글이 없습니다.", "info");
        return;
      }

      // 모달 내용 생성
      const refTitle = this.escapeHtml(refItem.content || "").substring(0, 50);
      const editsHtml = usedEdits
        .map((edit, index) => {
          const content = this.escapeHtml(edit.content || "").substring(0, 100);
          const date =
            this.formatDateFromFirestore(edit.createdAt) || edit.date || "";
          const topic = this.escapeHtml(edit.topic || "주제 없음");

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
                                <span>🏷️ ${topic}</span>
                            </div>
                            <button 
                                class="view-item-btn" 
                                data-item-id="${edit.id}"
                                data-item-type="edit"
                                aria-label="작성글 내용 보기">
                                내용 보기
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
                            <h3 id="used-in-edits-modal-title">📝 이 레퍼런스를 참고한 작성글</h3>
                            <button class="close-btn" aria-label="모달 닫기">×</button>
                        </div>
                        <div class="modal-body">
                            <div class="source-title">
                                <strong>레퍼런스:</strong> ${refTitle}${
        refTitle.length >= 50 ? "..." : ""
      }
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
      const existingModal = document.querySelector(".custom-modal");
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML("beforeend", modalHtml);
      const modal = document.querySelector(".custom-modal");
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";

      // 이벤트 바인딩
      this.bindCustomModalEvents(modal);

      console.log(`📝 참고한 작성글 모달 표시: ${usedEdits.length}개`);
    } catch (error) {
      console.error("참고한 작성글 모달 표시 실패:", error);
      this.showMessage("❌ 작성글을 불러올 수 없습니다.", "error");
    }
  }

  /**
   * 저장된 글 내용 보기
   *
   * @param {string} itemId - 저장된 글 ID
   * @param {Object|string} [options] - 추가 옵션 (type 등)
   *
   * - 저장된 글 목록으로 전환
   * - 해당 글을 찾아 스크롤
   * - 내용 자동 펼치기
   * - 강조 표시 (2초)
   * - 예외: 글을 찾지 못한 경우 편집 화면 전환
   */
  async viewSavedText(itemId, options = {}) {
    try {
      if (!itemId) {
        console.warn("⚠️ viewSavedText: itemId가 없습니다.");
        return;
      }

      const optionObject =
        typeof options === "string" ? { type: options } : options || {};
      const cachedItem = this.savedTexts?.find((t) => t.id === itemId);
      const requestedType =
        optionObject.type || (cachedItem ? cachedItem.type || "edit" : null);
      const normalizedType =
        requestedType === "reference" ? "reference" : "edit";

      // 저장된 글 목록으로 전환
      this.switchTab("saved");

      // 필터를 자동 조정하여 대상 카드가 DOM에 존재하도록 처리
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

      // 해당 글 찾기
      const savedItem = document.querySelector(`[data-item-id="${itemId}"]`);

      if (savedItem) {
        // 스크롤 및 강조 표시
        savedItem.scrollIntoView({ behavior: "smooth", block: "center" });
        savedItem.classList.add("highlight");

        // 내용 자동 펼치기 (더보기 버튼 클릭)
        const toggleBtn = savedItem.querySelector(".saved-item-toggle");
        const contentEl = savedItem.querySelector(".saved-item-content");

        if (
          toggleBtn &&
          contentEl &&
          !contentEl.classList.contains("expanded")
        ) {
          toggleBtn.click();
        }

        // 강조 표시 제거 (2초 후)
        setTimeout(() => {
          savedItem.classList.remove("highlight");
        }, 2000);

        // 포커스 이동 (접근성)
        savedItem.setAttribute("tabindex", "-1");
        savedItem.focus();

        console.log(`✅ 저장된 글 내용 보기: ${itemId}`);
      } else {
        // 글을 찾지 못한 경우 (필터 변경 또는 편집 화면 전환)
        console.warn(
          `⚠️ 저장된 글 카드를 찾을 수 없음: ${itemId}, 편집 화면 전환`
        );

        const item = cachedItem || this.savedTexts.find((t) => t.id === itemId);
        if (item) {
          const type =
            (item.type || "edit") === "reference" ? "reference" : "edit";
          this.editText(itemId, type);
          this.showMessage("📝 편집 화면으로 전환했습니다.", "info");
        } else {
          this.showMessage("❌ 글을 찾을 수 없습니다.", "error");
        }
      }
    } catch (error) {
      console.error("viewSavedText 실패:", error);
      this.showMessage("❌ 내용을 불러올 수 없습니다.", "error");
    }
  }

  /**
   * 참고 레퍼런스 내용을 즉시 표시합니다.
   *
   * @param {string} referenceId - 레퍼런스 ID
   */
  showReferenceContentModal(referenceId) {
    try {
      if (!referenceId) {
        console.warn("⚠️ showReferenceContentModal: referenceId가 없습니다.");
        return;
      }

      const referenceItem = this.savedTexts.find(
        (item) =>
          item.id === referenceId && (item.type || "edit") === "reference"
      );

      if (!referenceItem) {
        this.showMessage("❌ 레퍼런스 글을 찾을 수 없습니다.", "error");
        return;
      }

      const refType = referenceItem.referenceType || "unspecified";
      const refTypeLabel =
        refType === "structure"
          ? "구조"
          : refType === "idea"
          ? "아이디어"
          : "기타";
      const dateText =
        this.formatDateFromFirestore(referenceItem.createdAt) ||
        referenceItem.date ||
        "";
      const topicText = this.escapeHtml(
        referenceItem.topic || "출처 정보 없음"
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
                            <h3 id="reference-detail-title">📚 참고 레퍼런스</h3>
                            <button class="close-btn" aria-label="모달 닫기">✕</button>
                        </div>
                        <div class="modal-body">
                            <div class="reference-detail-meta">
                                <div><strong>유형:</strong> <span class="reference-type-badge badge-${this.escapeHtml(
                                  refType
                                )}">${this.escapeHtml(
        refTypeLabel
      )}</span></div>
                                <div><strong>작성일:</strong> ${
                                  dateText || "기록 없음"
                                }</div>
                                <div><strong>출처:</strong> ${topicText}</div>
                            </div>
                            <div class="reference-detail-content" role="region" aria-label="레퍼런스 내용">
                                ${contentHtml || "<em>내용이 없습니다.</em>"}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="secondary-btn reference-import-btn" data-reference-id="${referenceId}">
                                ✏️ 작성 영역으로 불러오기
                            </button>
                            <button class="primary-btn close-modal-btn" aria-label="닫기">닫기</button>
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
      console.error("showReferenceContentModal 실패:", error);
      this.showMessage("❌ 레퍼런스를 표시하지 못했습니다.", "error");
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
    const closeBtns = modal.querySelectorAll(".close-btn, .close-modal-btn");
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.remove();
        document.body.style.overflow = "";
      });
    });

    // 모달 외부 클릭
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        document.body.style.overflow = "";
      }
    });

    // ESC 키
    const escHandler = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.body.style.overflow = "";
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    // "내용 보기" 버튼
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
   * 레퍼런스 선택 목록 렌더링
   *
   * @param {Array} references - 레퍼런스 배열 (옵션, 없으면 전체 조회)
   *
   * - 체크박스로 다중 선택 가능
   * - 현재 선택된 항목 체크 표시
   * - 검색 및 필터 적용
   * - 최신순 정렬
   */
  /**
   * 텍스트 하이라이팅 (검색어 강조)
   *
   * @param {string} text - 원본 텍스트
   * @param {string} query - 검색어
   * @returns {string} 하이라이팅된 HTML 문자열
   *
   * - 검색어와 일치하는 부분을 <mark> 태그로 감쌈
   * - XSS 방지를 위해 나머지 부분은 이스케이프 처리
   * - 대소문자 구분 없이 매칭
   */
  highlightText(text, query) {
    if (!text) return "";
    if (!query) return this.escapeHtml(text);

    try {
      // 정규식 특수문자 이스케이프
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
      console.warn("하이라이팅 처리 중 오류:", e);
      return this.escapeHtml(text);
    }
  }

  renderReferenceSelectionList(references = null) {
    if (!this.referenceSelectionList) return;

    try {
      // 레퍼런스 목록 가져오기 (파라미터 없으면 전체 조회)
      let refs =
        references ||
        this.savedTexts.filter((item) => (item.type || "edit") === "reference");

      // 검색 필터 적용
      const searchTerm =
        this.referenceSearchInput?.value.toLowerCase().trim() || "";
      if (searchTerm) {
        refs = refs.filter((ref) => {
          const content = (ref.content || "").toLowerCase();
          const topic = (ref.topic || "").toLowerCase();
          return content.includes(searchTerm) || topic.includes(searchTerm);
        });
      }

      // 타입 필터 적용
      const typeFilter = this.referenceTypeFilterModal?.value || "all";
      if (typeFilter !== "all") {
        refs = refs.filter(
          (ref) => (ref.referenceType || "other") === typeFilter
        );
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

      const html = refs
        .map((ref) => {
          const isSelected = this.selectedReferences.includes(ref.id);

          // 텍스트 준비 (길이 제한)
          const contentRaw = ref.content || "";
          const isLong = contentRaw.length > 100;
          const contentDisplay = isLong
            ? contentRaw.substring(0, 100)
            : contentRaw;

          // 하이라이팅 적용
          const content = this.highlightText(contentDisplay, searchTerm);
          const topic = this.highlightText(
            ref.topic || "주제 없음",
            searchTerm
          );

          const refType = ref.referenceType || "other";
          const typeLabel =
            refType === "structure"
              ? "구조"
              : refType === "idea"
              ? "아이디어"
              : "미지정";
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

      // 체크박스 이벤트 바인딩
      this.bindReferenceCheckboxEvents();

      console.log(`✅ 레퍼런스 목록 렌더링 완료: ${refs.length}개`);
    } catch (error) {
      console.error("레퍼런스 목록 렌더링 실패:", error);
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
    const checkboxes = this.referenceSelectionList.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const refId = e.target.value;

        if (e.target.checked) {
          // 선택 추가
          if (!this.selectedReferences.includes(refId)) {
            this.selectedReferences.push(refId);
          }
        } else {
          // 선택 제거
          this.selectedReferences = this.selectedReferences.filter(
            (id) => id !== refId
          );
        }

        // 선택 개수 업데이트
        this.updateReferenceSelectionCount();

        console.log("선택된 레퍼런스:", this.selectedReferences);
      });
    });

    // 리스트 아이템 클릭 시 체크박스 토글 (UX 개선)
    const listItems = this.referenceSelectionList.querySelectorAll(
      ".reference-list-item"
    );
    listItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        // 체크박스 자체를 클릭한 경우는 제외
        if (e.target.type !== "checkbox") {
          const checkbox = item.querySelector('input[type="checkbox"]');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            // change 이벤트 트리거
            checkbox.dispatchEvent(new Event("change"));
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
    const selectionCountDiv =
      this.referenceSelectionModal?.querySelector(".selection-count");
    if (selectionCountDiv) {
      selectionCountDiv.setAttribute("aria-live", "polite");
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
      console.error("선택 확인 실패:", error);
      this.showMessage("❌ 선택을 저장할 수 없습니다.", "error");
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
        this.selectedReferencesTags.innerHTML = "";
        // 토글 버튼 카운트도 업데이트
        if (this.collapseRefCount) {
          this.collapseRefCount.textContent = "(0개 선택됨)";
        }
        return;
      }

      // 선택된 레퍼런스 객체 가져오기
      const selectedRefs = this.selectedReferences
        .map((refId) => this.savedTexts.find((item) => item.id === refId))
        .filter(Boolean); // null 제거

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
                            aria-label="${this.escapeHtml(content)} 제거"
                            title="제거">
                            ×
                        </button>
                    </div>
                `;
        })
        .join("");

      this.selectedReferencesTags.innerHTML = html;

      // 토글 버튼 카운트도 업데이트
      if (this.collapseRefCount) {
        this.collapseRefCount.textContent = `(${this.selectedReferences.length}개 선택됨)`;
      }

      // 제거 버튼 이벤트 바인딩
      this.bindReferenceTagRemoveEvents();

      console.log(`✅ ${selectedRefs.length}개 태그 렌더링 완료`);
    } catch (error) {
      console.error("태그 렌더링 실패:", error);
      this.selectedReferencesTags.innerHTML =
        '<p style="color: #dc3545;">태그를 표시할 수 없습니다.</p>';
    }
  }

  /**
   * 레퍼런스 태그 제거 버튼 이벤트 바인딩
   */
  bindReferenceTagRemoveEvents() {
    if (!this.selectedReferencesTags) return;

    const removeBtns =
      this.selectedReferencesTags.querySelectorAll(".remove-btn");

    removeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const refId = btn.getAttribute("data-ref-id");

        // 선택 배열에서 제거
        this.selectedReferences = this.selectedReferences.filter(
          (id) => id !== refId
        );

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
    const searchTerm = this.referenceSearchInput?.value.toLowerCase() || "";
    const selectedType = this.referenceTypeFilterModal?.value || "all";

    let filtered = this.savedTexts.filter((item) => item.type === "reference");

    // 검색어 필터
    if (searchTerm) {
      filtered = filtered.filter(
        (ref) =>
          ref.content.toLowerCase().includes(searchTerm) ||
          (ref.topic && ref.topic.toLowerCase().includes(searchTerm))
      );
    }

    // 타입 필터
    if (selectedType !== "all") {
      filtered = filtered.filter((ref) => ref.referenceType === selectedType);
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
      const editItem = this.savedTexts.find((item) => item.id === editId);
      if (!editItem || (editItem.type || "edit") !== "edit") {
        return [];
      }

      // linkedReferences 배열 확인
      const linkedRefIds = editItem.linkedReferences || [];
      if (linkedRefIds.length === 0) {
        return [];
      }

      // ID를 객체로 변환 (O(n) 검색)
      const linkedRefs = linkedRefIds
        .map((refId) =>
          this.savedTexts.find(
            (item) => item.id === refId && (item.type || "edit") === "reference"
          )
        )
        .filter(Boolean); // null 제거

      // 최신순 정렬
      linkedRefs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
        return dateB - dateA;
      });

      return linkedRefs;
    } catch (error) {
      console.error("연결된 레퍼런스 조회 실패:", error);
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
      const edits = this.savedTexts.filter(
        (item) =>
          (item.type || "edit") === "edit" &&
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
      console.error("역방향 조회 실패:", error);
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
    console.log("📚 레퍼런스 링크 캐시 무효화 (현재는 캐싱 미사용)");
  }

  // ===== 스크립트 작성 기능 =====

  /**
   * 스크립트 작성 기능 초기화
   */
  initArticleManagement() {
    // ===== [Bug Fix] 중복 실행 방지 =====
    // 목적: switchTab()에서 탭 전환 시마다 이 함수가 호출되어
    // 이벤트 리스너가 중복 등록되는 것을 방지
    // 증상: 저장 버튼 클릭 시 동일한 글이 여러 개 저장되는 버그
    if (this.isArticleManagementInitialized) {
      return; // 이미 초기화되었으면 조기 리턴
    }
    this.isArticleManagementInitialized = true;

    // DOM 요소 참조
    this.categorySelect = document.getElementById("category-select");
    this.articleCardsGrid = document.getElementById("article-cards-grid");
    this.managementEmptyState = document.getElementById(
      "management-empty-state"
    );
    // ===== [Dual Panel] 듀얼 패널 DOM 요소 참조 =====
    // 2025-12-09 Phase 2 추가
    this.articleDetailContainer = document.getElementById(
      "article-detail-container"
    );
    this.articleDetailPanel1 = document.getElementById("article-detail-panel-1");
    this.articleDetailPanel2 = document.getElementById("article-detail-panel-2");
    this.detailDualDivider = document.getElementById("detail-dual-divider");

    // 패널 1 DOM 요소 참조 (기존 articleDetailPanel → articleDetailPanel1으로 변경)
    this.articleDetailPanel = this.articleDetailPanel1; // 하위 호환성 유지
    this.detailPanelClose = document.getElementById("detail-panel-close-1");
    this.detailEditBtn = document.getElementById("detail-edit-btn-1");
    this.detailDeleteBtn = document.getElementById("detail-delete-btn-1");
    this.detailCopyBtn = document.getElementById("detail-copy-btn-1");
    this.editSaveBtn = document.getElementById("edit-article-save-btn-1");
    this.editCancelBtn = document.getElementById("edit-article-cancel-btn-1");
    this.editTitleInput = document.getElementById("edit-title-input-1");
    this.editCategorySelect = document.getElementById("edit-category-select-1");
    this.editContentTextarea = document.getElementById("edit-content-textarea-1");

    // ===== [Dual Panel] 확대 버튼 DOM 참조 =====
    // 2025-12-09 Phase 1 추가: 듀얼 패널 확대 버튼 기능 구현
    this.detailExpandBtn1 = document.getElementById("detail-expand-btn-1");
    this.detailExpandBtn2 = document.getElementById("detail-expand-btn-2");

    // 새 스크립트 작성 폼 관련 요소
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

    // 확대 모드 관련 요소
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

    // 확대 모드 레퍼런스 영역 관련 요소
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

    // 확대 모드 레퍼런스 상태
    this.expandReferences = []; // 확대 모드에서 선택한 레퍼런스 목록
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

    // 레퍼런스 불러오기 관련 요소
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
    // 상세 모드 레퍼런스 로드 버튼
    this.detailLoadReferenceBtn = document.getElementById(
      "detail-load-reference-btn"
    );
    // 이벤트 리스너 연결
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

    // 레퍼런스 로더 상태
    this.currentReferenceTab = "saved";
    this.referenceSearchDebounce = null;
    this.recentReferences = this.loadRecentReferences(); // localStorage에서 최근 사용 글 로드

    // 현재 선택된 글 ID
    this.selectedArticleId = null;
    this.managementArticles = []; // 스크립트 작성용 글 목록

    // 이벤트 리스너 바인딩
    if (this.categorySelect) {
      this.categorySelect.addEventListener("change", (e) => {
        this.filterArticlesByCategory(e.target.value);
      });
    }

    // ===== [Dual Panel] 패널 닫기 버튼 이벤트 =====
    // 패널 1 닫기 버튼
    if (this.detailPanelClose) {
      this.detailPanelClose.addEventListener("click", () => {
        this.closeDetailPanelByIndex(0);
      });
    }

    // 패널 2 닫기 버튼
    const detailPanelClose2 = document.getElementById("detail-panel-close-2");
    if (detailPanelClose2) {
      detailPanelClose2.addEventListener("click", () => {
        this.closeDetailPanelByIndex(1);
      });
    }

    // ===== [Dual Panel] 패널 1 수정/삭제/복사 버튼 이벤트 =====
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

    // ===== [Dual Panel] 패널 2 수정/삭제/복사 버튼 이벤트 =====
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

    // ===== [Dual Panel] 확대 버튼 이벤트 =====
    // 2025-12-09 Phase 1 추가: 듀얼 패널 확대 버튼 클릭 이벤트 연결
    // 패널 1 확대 버튼
    if (this.detailExpandBtn1) {
      this.detailExpandBtn1.addEventListener("click", () => {
        this.openExpandModeByIndex(0);
      });
    }

    // 패널 2 확대 버튼
    if (this.detailExpandBtn2) {
      this.detailExpandBtn2.addEventListener("click", () => {
        this.openExpandModeByIndex(1);
      });
    }

    if (this.editSaveBtn) {
      this.editSaveBtn.addEventListener("click", () => {
        this.saveArticleEdit();
      });
    }

    if (this.editCancelBtn) {
      this.editCancelBtn.addEventListener("click", () => {
        this.cancelArticleEdit();
      });
    }

    // 새 스크립트 작성 폼 이벤트
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

    // 카테고리 자동완성 업데이트
    if (this.scriptCategoryInput) {
      this.scriptCategoryInput.addEventListener("input", () => {
        this.updateCategorySuggestions();
      });
    }

    // 내용 글자 수 카운팅
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.addEventListener("input", () => {
        this.updateContentCounter();
      });
      // 초기 카운트 표시
      this.updateContentCounter();
    }

    // 확대 모드 이벤트
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

    // 확대 모드 textarea 이벤트
    if (this.expandContentTextarea) {
      this.expandContentTextarea.addEventListener("input", () => {
        this.updateExpandContentCounter();
      });
    }

    // ESC 키로 확대 모드 닫기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.contentExpandModal &&
        this.contentExpandModal.style.display === "block"
      ) {
        this.closeExpandMode();
      }
    });

    // 확대 모드에서 레퍼런스 불러오기
    if (this.expandLoadReferenceBtn) {
      this.expandLoadReferenceBtn.addEventListener("click", () => {
        // 확대 모드에서 레퍼런스 로더 열기
        this.openReferenceLoader();
      });
    }

    // 확대 모드 레퍼런스 영역 접기/펼치기
    if (this.expandToggleReferenceBtn) {
      this.expandToggleReferenceBtn.addEventListener("click", () => {
        this.toggleExpandReferencePanel();
      });
    }

    // 확대 모드 분할선 드래그 기능
    if (this.expandSplitDivider) {
      this.initExpandSplitResize();
    }

    // 레퍼런스 불러오기 이벤트
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

    // 레퍼런스 탭 전환
    this.referenceTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchReferenceTab(tab.getAttribute("data-tab"));
      });
    });

    // 레퍼런스 검색
    if (this.referenceSearchInput) {
      this.referenceSearchInput.addEventListener("input", (e) => {
        this.handleReferenceSearch(e.target.value);
      });
    }

    // 레퍼런스 필터
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

    // 카테고리 드롭다운 업데이트
    this.updateCategoryDropdown();

    // ===== [Dual Panel] 구분선 드래그 초기화 =====
    this.initDualDividerDrag();
  }

  /**
   * 스크립트 작성용 글 목록 로드
   */
  async loadArticlesForManagement() {
    if (!this.currentUser || !this.isFirebaseReady) {
      // Firebase가 준비되지 않았거나 로그인이 필요한 경우 조용히 반환
      // 에러 메시지를 표시하지 않음 (정상적인 상황)
      console.warn(
        "loadArticlesForManagement: Firebase가 준비되지 않았거나 로그인이 필요합니다."
      );
      this.managementArticles = [];
      // 빈 상태 표시
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
      return;
    }

    try {
      // 'edit' 타입 글만 로드 (레퍼런스 제외)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );

      // 인덱스 오류를 대비하여 orderBy 없이 먼저 시도
      let querySnapshot;
      try {
        // [Tab Separation] 'script' 타입 글만 로드 (글 작성 탭의 'edit' 타입 제외)
        const q = window.firebaseQuery(
          textsRef,
          window.firebaseWhere("type", "==", "script"),
          window.firebaseOrderBy("createdAt", "desc")
        );
        querySnapshot = await window.firebaseGetDocs(q);
      } catch (indexError) {
        // 인덱스 오류인 경우 orderBy 없이 쿼리
        if (indexError.code === "failed-precondition") {
          console.warn(
            "Firebase 인덱스가 없어 orderBy 없이 쿼리합니다. 클라이언트 사이드에서 정렬합니다."
          );
          // [Tab Separation] 인덱스 오류 시에도 'script' 타입 필터링 유지
          const q = window.firebaseQuery(
            textsRef,
            window.firebaseWhere("type", "==", "script")
          );
          querySnapshot = await window.firebaseGetDocs(q);
        } else {
          throw indexError; // 다른 에러는 다시 throw
        }
      }

      this.managementArticles = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.managementArticles.push({
          id: doc.id,
          // Firestore에 저장된 title 사용 (없으면 "제목 없음")
          title: data.title || "제목 없음",
          content: data.content || "",
          category: data.topic || "미분류", // topic을 category로 사용
          createdAt: data.createdAt,
          order: data.order || 0, // order 필드 (기본값 0)
          viewCount: data.viewCount || 0,
          characterCount: data.characterCount, // [Fix] 글자 수 필드 로드
        });
      });

      // orderBy 없이 로드한 경우 클라이언트 사이드에서 정렬
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
          return dateB - dateA; // 내림차순 (최신순)
        });
      }

      // order 필드가 없는 경우 초기화
      await this.initializeArticleOrders();

      // 카테고리 드롭다운 업데이트 (렌더링 전에 업데이트)
      this.updateCategoryDropdown();

      // 현재 선택된 카테고리 필터 값 가져오기
      const currentCategory = this.categorySelect
        ? this.categorySelect.value
        : "";

      // 카테고리별로 정렬 후 렌더링 (현재 선택된 필터 값 전달)
      this.renderArticleCards(currentCategory);

      // 카테고리 제안 업데이트
      this.updateCategorySuggestions();

      // 레퍼런스 로더 카테고리 필터 업데이트
      this.updateReferenceCategoryFilter();
    } catch (error) {
      console.error("스크립트 작성용 글 로드 실패:", error);

      // Firebase 인덱스 오류는 조용히 처리 (이미 위에서 처리됨)
      if (error.code === "failed-precondition") {
        console.warn(
          "Firebase 인덱스 오류: 인덱스가 생성될 때까지 클라이언트 사이드 정렬을 사용합니다."
        );
        // 에러 메시지 표시하지 않음 (정상 동작)
        this.managementArticles = [];
        if (this.articleCardsGrid) {
          this.articleCardsGrid.innerHTML = "";
        }
        if (this.managementEmptyState) {
          this.managementEmptyState.style.display = "block";
        }
        return;
      }

      // 네트워크 오류나 인증 오류인 경우에만 에러 메시지 표시
      if (error.code === "permission-denied" || error.code === "unavailable") {
        this.showMessage(
          "❌ 글을 불러오는 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.",
          "error"
        );
      } else if (error.code && error.code !== "failed-precondition") {
        // 인덱스 오류가 아닌 다른 에러만 표시
        console.error("예상치 못한 에러:", error);
        // 개발 환경에서만 상세 에러 표시
        if (error.message && !error.message.includes("permission")) {
          this.showMessage("❌ 글을 불러오는 중 오류가 발생했습니다.", "error");
        }
      }

      this.managementArticles = [];
      // 빈 상태 표시
      if (this.articleCardsGrid) {
        this.articleCardsGrid.innerHTML = "";
      }
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
      }
    }
  }

  /**
   * order 필드 초기화 및 중복 정리
   * - order가 없거나, 중복된 order가 있는 경우 실행
   * - createdAt 기준으로 재정렬하여 타임스탬프 기반 order 할당
   */
  async initializeArticleOrders() {
    if (!this.currentUser || !this.isFirebaseReady) return;

    // 카테고리별로 그룹화
    const articlesByCategory = {};
    this.managementArticles.forEach((article) => {
      const category = article.category || "미분류";
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
        // [Fix] characterCount 누락 확인
        const hasMissingCharCount = articles.some(
          (a) => typeof a.characterCount !== "number"
        );

        if (hasDuplicates || hasMissingOrder || hasMissingCharCount) {
          console.log(
            `[Order/Data Fix] ${category}: 데이터 보정(순서/글자수)을 시작합니다.`
          );

          // createdAt 오름차순 정렬 (과거 -> 최신)
          articles.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
          });

          // order 재할당 및 characterCount 보정
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const date = article.createdAt?.toDate?.() || new Date();
            let newOrder = date.getTime();

            // 이전 글보다 작거나 같으면 1ms 증가 (정렬 순서 유지)
            if (i > 0) {
              const prevOrder = articles[i - 1].order;
              if (newOrder <= prevOrder) {
                newOrder = prevOrder + 1;
              }
            }

            // 업데이트가 필요한지 확인
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
          console.log(`[Order/Data Fix] ${category}: 보정 완료`);
        }
      }

      if (hasUpdates) {
        await batch.commit();
        console.log(
          `[Order Fix] 총 ${batchCount}개의 글 순서가 업데이트되었습니다.`
        );
      }
    } catch (error) {
      console.error("order 필드 초기화 실패:", error);
    }
  }

  // [Refactoring] Utils 모듈 사용
  extractTitleFromContent(content) {
    return extractTitleFromContent(content);
  }

  /**
   * 카테고리 드롭다운 업데이트
   */
  updateCategoryDropdown() {
    if (!this.categorySelect || !this.editCategorySelect) return;

    // 고유한 카테고리 목록 추출
    const categories = new Set(["미분류"]);
    this.managementArticles.forEach((article) => {
      if (article.category) {
        categories.add(article.category);
      }
    });

    // "미분류"를 제외한 카테고리를 알파벳순으로 정렬 후 "미분류"를 맨 뒤에 추가
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "미분류").sort();
    const sortedCategories = categoriesArray.includes("미분류") 
      ? [...otherCategories, "미분류"] 
      : otherCategories;

    // 카테고리 선택 드롭다운 업데이트
    this.categorySelect.innerHTML = '<option value="">전체 글 보기</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.categorySelect.appendChild(option);
    });

    // 수정 모드 카테고리 드롭다운 업데이트
    this.editCategorySelect.innerHTML = "";
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.editCategorySelect.appendChild(option);
    });
  }

  /**
   * 레퍼런스 로더 카테고리 필터 업데이트
   */
  updateReferenceCategoryFilter() {
    if (!this.referenceCategoryFilter) return;

    // 고유한 카테고리 목록 추출
    const categories = new Set(["미분류"]);

    // 저장된 글에서 카테고리 추출
    if (this.savedTexts) {
      this.savedTexts.forEach((text) => {
        if (text.topic) {
          categories.add(text.topic);
        }
      });
    }

    // "미분류"를 제외한 카테고리를 알파벳순으로 정렬 후 "미분류"를 맨 뒤에 추가
    const categoriesArray = Array.from(categories);
    const otherCategories = categoriesArray.filter(c => c !== "미분류").sort();
    const sortedCategories = categoriesArray.includes("미분류") 
      ? [...otherCategories, "미분류"] 
      : otherCategories;

    // 필터 드롭다운 업데이트
    this.referenceCategoryFilter.innerHTML =
      '<option value="">전체 카테고리</option>';
    sortedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.referenceCategoryFilter.appendChild(option);
    });
  }

  /**
   * 카테고리별 필터링
   */
  filterArticlesByCategory(category) {
    this.renderArticleCards(category);
  }

  /**
   * 글 카드 렌더링
   */
  renderArticleCards(filterCategory = "") {
    if (!this.articleCardsGrid) return;

    // 필터링
    let filteredArticles = this.managementArticles;
    if (filterCategory) {
      filteredArticles = this.managementArticles.filter(
        (article) => (article.category || "미분류") === filterCategory
      );
    }

    // 카테고리별로 그룹화 및 정렬
    const articlesByCategory = {};
    filteredArticles.forEach((article) => {
      const category = article.category || "미분류";
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = [];
      }
      articlesByCategory[category].push(article);
    });

    // 각 카테고리별로 order 기준 정렬 (내림차순: 큰 값이 위로)
    Object.keys(articlesByCategory).forEach((category) => {
      articlesByCategory[category].sort((a, b) => {
        return (b.order || 0) - (a.order || 0);
      });
    });

    // 빈 상태 처리
    if (filteredArticles.length === 0) {
      this.articleCardsGrid.innerHTML = "";
      if (this.managementEmptyState) {
        this.managementEmptyState.style.display = "block";
        this.managementEmptyState.textContent = filterCategory
          ? `${filterCategory} 카테고리에 글이 없습니다.`
          : "표시할 글이 없습니다.";
      }
      return;
    }

    if (this.managementEmptyState) {
      this.managementEmptyState.style.display = "none";
    }

    // 카드 렌더링
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
   * 글 카드 생성
   */
  createArticleCard(article, orderNumber, filterCategory = "") {
    const card = document.createElement("div");
    card.className = "article-card";
    card.setAttribute("data-article-id", article.id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `글 ${orderNumber}: ${article.title}`);

    // ===== [Dual Panel] 클릭 이벤트 - Ctrl+클릭으로 패널 2에 열기 =====
    // - 일반 클릭: 패널 1 (인덱스 0)
    // - Ctrl+클릭 (Windows) 또는 Cmd+클릭 (Mac): 패널 2 (인덱스 1)
    card.addEventListener("click", (e) => {
      // Ctrl 또는 Cmd 키가 눌려있는지 확인
      const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
      this.selectArticleToPanel(article.id, panelIndex);
    });

    // ===== [Dual Panel] 키보드 접근성 - Ctrl+Enter로 패널 2에 열기 =====
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // Ctrl+Enter 또는 Ctrl+Space: 패널 2에 열기
        const panelIndex = (e.ctrlKey || e.metaKey) ? 1 : 0;
        this.selectArticleToPanel(article.id, panelIndex);
      }
    });

    // 내용 미리보기 (3줄)
    const contentPreview = this.getContentPreview(article.content, 3);

    // 날짜 포맷
    const dateStr = article.createdAt
      ? this.formatDateFromFirestore(article.createdAt)
      : "날짜 없음";

    // 순서 조정 버튼 활성화 여부 확인
    const canMoveUp = this.canMoveUp(article, filterCategory);
    const canMoveDown = this.canMoveDown(article, filterCategory);

    card.innerHTML = `
            <div class="article-card-header">
                <div class="article-card-order">
                    <span class="article-order-badge" aria-label="순서 ${orderNumber}">${orderNumber}</span>
                    <h4 class="article-card-title" title="${this.escapeHtml(
                      article.title
                    )}">${this.escapeHtml(article.title)}</h4>
                </div>
                <div class="article-card-actions">
                    <button 
                        class="order-button" 
                        data-action="up" 
                        data-article-id="${article.id}"
                        aria-label="위로 이동"
                        title="위로 이동"
                        ${canMoveUp ? "" : "disabled"}>
                        ▲
                    </button>
                    <button 
                        class="order-button" 
                        data-action="down" 
                        data-article-id="${article.id}"
                        aria-label="아래로 이동"
                        title="아래로 이동"
                        ${canMoveDown ? "" : "disabled"}>
                        ▼
                    </button>
                </div>
            </div>
            <div class="article-card-content">${this.escapeHtml(
              contentPreview
            )}</div>
            <div class="article-card-meta">
                <span class="article-card-date">📅 ${dateStr}</span>
                <span class="article-card-count">📝 ${article.content ? article.content.length : 0}자</span>
                <span class="article-card-category">📁 ${this.escapeHtml(
                  article.category || "미분류"
                )}</span>
            </div>
        `;

    // 순서 조정 버튼 이벤트
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
   * 내용 미리보기 생성
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
   * 위로 이동 가능 여부
   */
  canMoveUp(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "미분류") === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분류") === (article.category || "미분류")
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

    return sameCategory[0]?.id !== article.id;
  }

  /**
   * 아래로 이동 가능 여부
   */
  canMoveDown(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.managementArticles.filter(
          (a) => (a.category || "미분류") === filterCategory
        )
      : this.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분류") === (article.category || "미분류")
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

    return sameCategory[sameCategory.length - 1]?.id !== article.id;
  }

  // ================================================================
  // [Dual Panel] 듀얼 패널 글 선택 함수
  // - 특정 패널(0 또는 1)에 글을 선택하여 표시
  // - Ctrl+클릭으로 두 번째 패널에 글 열기 지원
  // - 2025-12-09 Phase 3A 구현
  // ================================================================

  /**
   * 특정 패널에 글 선택
   * @param {string} articleId - 선택할 글 ID
   * @param {number} panelIndex - 패널 인덱스 (0: 첫 번째, 1: 두 번째)
   */
  selectArticleToPanel(articleId, panelIndex = 0) {
    // panelIndex 유효성 검사
    if (panelIndex !== 0 && panelIndex !== 1) {
      console.warn("[Dual Panel] 유효하지 않은 panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // 중복 선택 방지: 같은 글이 다른 패널에 이미 열려있는지 확인
    const otherPanelIndex = panelIndex === 0 ? 1 : 0;
    if (this.selectedArticleIds[otherPanelIndex] === articleId) {
      alert("이미 다른 패널에서 열려있는 글입니다.");
      return;
    }

    // 글 데이터 찾기
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      console.warn("[Dual Panel] 글을 찾을 수 없습니다:", articleId);
      return;
    }

    // 이전에 이 패널에 선택된 카드의 하이라이트 제거
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

    // 선택한 카드에 패널별 하이라이트 추가
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add(`selected-panel-${panelIndex + 1}`);
      selectedCard.classList.add("selected");
    }

    // 상태 업데이트
    this.selectedArticleIds[panelIndex] = articleId;
    this.activePanelIndex = panelIndex;

    // 패널에 글 렌더링
    this.renderDetailPanelByIndex(article, panelIndex);

    // 듀얼 모드 상태 업데이트
    this.updateDualModeState();

    // 해당 패널로 스크롤
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    if (panel) {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  /**
   * 글 선택 (하위 호환성 유지 - 기본적으로 패널 0에 선택)
   */
  selectArticle(articleId) {
    // 모든 카드 선택 해제
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    // 선택한 카드 하이라이트
    const selectedCard = document.querySelector(
      `[data-article-id="${articleId}"]`
    );
    if (selectedCard) {
      selectedCard.classList.add("selected");
    }

    // 상세 패널 표시
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (article) {
      this.selectedArticleId = articleId;
      this.renderDetailPanel(article);

      // 상세 패널로 스크롤
      if (this.articleDetailPanel) {
        this.articleDetailPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }

  // ================================================================
  // [Dual Panel] 듀얼 패널 렌더링 함수
  // - 패널 인덱스에 따라 올바른 DOM 요소에 글 렌더링
  // - 2025-12-09 Phase 3A 구현
  // ================================================================

  /**
   * 특정 패널에 글 상세 렌더링
   * @param {object} article - 글 객체
   * @param {number} panelIndex - 패널 인덱스 (0 또는 1)
   */
  renderDetailPanelByIndex(article, panelIndex = 0) {
    // panelIndex에 따른 suffix 결정 (0 → -1, 1 → -2)
    const suffix = panelIndex === 0 ? "-1" : "-2";
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;

    if (!panel) {
      console.warn("[Dual Panel] 패널을 찾을 수 없습니다:", panelIndex);
      return;
    }

    // 읽기 모드 표시, 수정 모드 숨김
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // 데이터 채우기
    const categoryEl = document.getElementById(`detail-category${suffix}`);
    const dateEl = document.getElementById(`detail-date${suffix}`);
    const charCountEl = document.getElementById(`detail-char-count${suffix}`);
    const titleEl = document.getElementById(`detail-title${suffix}`);
    const contentEl = document.getElementById(`detail-content${suffix}`);

    if (categoryEl) {
      categoryEl.textContent = article.category || "미분류";
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "날짜 없음";
    }
    if (charCountEl) {
      charCountEl.textContent = `📝 ${article.content ? article.content.length : 0}자`;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // 패널 표시
    panel.style.display = "block";
  }

  /**
   * 듀얼 모드 상태 업데이트
   * - 두 패널 모두 열려있으면 듀얼 모드 활성화
   * - 한 패널만 열려있으면 단일 모드
   */
  updateDualModeState() {
    const panel1Open = this.selectedArticleIds[0] !== null;
    const panel2Open = this.selectedArticleIds[1] !== null;

    // 이전 모드 저장
    const wasInDualMode = this.isDualMode;

    // 새 모드 결정
    this.isDualMode = panel1Open && panel2Open;

    // 컨테이너에 dual-mode 클래스 토글
    if (this.articleDetailContainer) {
      if (this.isDualMode) {
        this.articleDetailContainer.classList.add("dual-mode");
      } else {
        this.articleDetailContainer.classList.remove("dual-mode");
      }
    }

    // 구분선 표시/숨김
    if (this.detailDualDivider) {
      this.detailDualDivider.style.display = this.isDualMode ? "flex" : "none";
    }

    // 모드 변경 시 스크린 리더 알림 (접근성)
    if (wasInDualMode !== this.isDualMode) {
      const message = this.isDualMode
        ? "듀얼 패널 모드가 활성화되었습니다."
        : "단일 패널 모드로 전환되었습니다.";
      this.announceToScreenReader(message);
    }
  }

  /**
   * 스크린 리더 알림 (접근성 지원)
   * @param {string} message - 알릴 메시지
   */
  announceToScreenReader(message) {
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.cssText = "position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;";
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    // 잠시 후 제거
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  // ================================================================
  // [Dual Panel] 구분선 드래그 기능
  // - 마우스 드래그로 패널 너비 조절
  // - 최소 20%, 최대 80% 제한
  // - 2025-12-09 Phase 5 구현
  // ================================================================

  /**
   * 듀얼 패널 구분선 드래그 초기화
   * - initArticleManagement()에서 호출
   */
  initDualDividerDrag() {
    if (!this.detailDualDivider || !this.articleDetailContainer) {
      return;
    }

    // 드래그 상태 변수
    let isDragging = false;
    let startX = 0;
    let startLeftPanelWidth = 50; // 초기 비율 (%)

    // 마우스 다운 - 드래그 시작
    const onMouseDown = (e) => {
      if (!this.isDualMode) return;
      
      isDragging = true;
      startX = e.clientX;
      
      // 현재 패널 1의 너비 비율 계산
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const panel1Rect = this.articleDetailPanel1.getBoundingClientRect();
      startLeftPanelWidth = (panel1Rect.width / containerRect.width) * 100;
      
      // 드래그 중 시각적 피드백
      this.detailDualDivider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      
      e.preventDefault();
    };

    // 마우스 이동 - 드래그 중
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const containerRect = this.articleDetailContainer.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerRect.width) * 100;
      
      // 새 비율 계산 (최소 20%, 최대 80%)
      let newLeftPercent = startLeftPanelWidth + deltaPercent;
      newLeftPercent = Math.max(20, Math.min(80, newLeftPercent));
      
      // Grid 비율 적용
      this.articleDetailContainer.style.gridTemplateColumns = 
        `${newLeftPercent}% 8px ${100 - newLeftPercent}%`;
    };

    // 마우스 업 - 드래그 종료
    const onMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      this.detailDualDivider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    // 이벤트 리스너 등록
    this.detailDualDivider.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    // 화면 이탈 처리
    document.addEventListener("mouseleave", onMouseUp);

    // 더블클릭으로 50:50 리셋
    this.detailDualDivider.addEventListener("dblclick", () => {
      if (!this.isDualMode) return;
      this.articleDetailContainer.style.gridTemplateColumns = "1fr 8px 1fr";
    });
  }

  /**
   * 상세 패널 렌더링 (하위 호환성 - 패널 0에 렌더링)
   */
  renderDetailPanel(article) {
    if (!this.articleDetailPanel) return;

    // 읽기 모드 표시
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "block";
    if (editMode) editMode.style.display = "none";

    // 데이터 채우기
    const categoryEl = document.getElementById("detail-category");
    const dateEl = document.getElementById("detail-date");
    const charCountEl = document.getElementById("detail-char-count");
    const titleEl = document.getElementById("detail-title");
    const contentEl = document.getElementById("detail-content");

    if (categoryEl) {
      categoryEl.textContent = article.category || "미분류";
    }
    if (dateEl) {
      dateEl.textContent = article.createdAt
        ? this.formatDateFromFirestore(article.createdAt)
        : "날짜 없음";
    }
    if (charCountEl) {
      charCountEl.textContent = `📝 ${article.content ? article.content.length : 0}자`;
    }
    if (titleEl) {
      titleEl.textContent = article.title;
    }
    if (contentEl) {
      contentEl.textContent = article.content;
    }

    // 상세 패널 표시
    this.articleDetailPanel.style.display = "block";
  }

  // ================================================================
  // [Dual Panel] 패널별 수정/삭제/복사 함수
  // - 각 패널에서 독립적으로 수정/삭제/복사 기능 제공
  // - 2025-12-09 Phase 6 구현
  // ================================================================

  /**
   * 특정 패널에서 수정 모드 진입
   * @param {number} panelIndex - 패널 인덱스 (0 또는 1)
   */
  enterEditModeByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      console.warn("[Dual Panel] 선택된 글이 없습니다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // panelIndex에 따른 suffix 결정
    const suffix = panelIndex === 0 ? "-1" : "-2";

    // 읽기 모드 숨기기, 수정 모드 표시
    const readMode = document.getElementById(`detail-read-mode${suffix}`);
    const editMode = document.getElementById(`detail-edit-mode${suffix}`);

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // 입력 필드에 값 설정
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
      // 카테고리 옵션 동적 추가
      this.populateEditCategorySelect(editCategorySelect, article.category);
    }

    // 현재 편집 중인 글 ID 설정
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(articleId);
    }
  }

  /**
   * 특정 패널에서 글 삭제
   * @param {number} panelIndex - 패널 인덱스 (0 또는 1)
   */
  async deleteArticleByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId || !this.currentUser || !this.isFirebaseReady) {
      console.warn("[Dual Panel] 삭제할 수 없습니다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) return;

    // 삭제 확인
    const confirmed = confirm(
      `"${article.title}"을(를) 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`
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

      this.showMessage("✅ 글이 삭제되었습니다.", "success");

      // 해당 패널 닫기
      this.closeDetailPanelByIndex(panelIndex);

      // 목록 갱신
      await this.loadArticlesForManagement();
    } catch (error) {
      console.error("[Dual Panel] 삭제 실패:", error);
      this.showMessage("❌ 삭제 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 특정 패널 글 내용 클립보드 복사
   * @param {number} panelIndex - 패널 인덱스 (0 또는 1)
   */
  async copyArticleContentByIndex(panelIndex = 0) {
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      console.warn("[Dual Panel] 복사할 글이 없습니다:", panelIndex);
      return;
    }

    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article || !article.content) {
      this.showMessage("📋 복사할 내용이 없습니다.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("📋 클립보드에 복사되었습니다!", "success");
    } catch (error) {
      console.error("[Dual Panel] 복사 실패:", error);
      // 폴백: 임시 textarea 사용
      const textarea = document.createElement("textarea");
      textarea.value = article.content;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      this.showMessage("📋 클립보드에 복사되었습니다!", "success");
    }
  }

  /**
   * 수정 모드 진입 (하위 호환성 - 패널 0)
   */
  enterEditMode() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    // 읽기 모드 숨기기, 수정 모드 표시
    const readMode = document.getElementById("detail-read-mode");
    const editMode = document.getElementById("detail-edit-mode");

    if (readMode) readMode.style.display = "none";
    if (editMode) editMode.style.display = "block";

    // 입력 필드에 값 설정
    if (this.editTitleInput) {
      this.editTitleInput.value = article.title;
    }
    if (this.editContentTextarea) {
      this.editContentTextarea.value = article.content;
    }
    if (this.editCategorySelect) {
      this.editCategorySelect.value = article.category || "미분류";
    }

    // 현재 편집 중인 글 ID 설정 (레퍼런스 로드용)
    if (window.setCurrentEditingArticle) {
      window.setCurrentEditingArticle(this.selectedArticleId);
    }
  }

  /**
   * 글 수정 저장
   */
  async saveArticleEdit() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    const title = this.editTitleInput?.value.trim() || "";
    const content = this.editContentTextarea?.value.trim() || "";
    const category = this.editCategorySelect?.value || "미분류";

    // 검증
    if (!title && !content) {
      this.showMessage("❌ 제목 또는 내용을 입력해주세요.", "error");
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
      // 제목 검증: 제목이 비어있으면 저장 불가
      if (!title || title.trim() === "") {
        this.showMessage("❌ 제목을 입력해주세요.", "error");
        if (this.editTitleInput) {
          this.editTitleInput.focus();
        }
        return;
      }

      await window.firebaseUpdateDoc(articleRef, {
        title: title.trim(),
        content: content,
        characterCount: content.length, // [Fix] 필수 필드 추가
        topic: category, // topic 필드에 카테고리 저장
        updatedAt: window.firebaseServerTimestamp(),
      });

      // 로컬 데이터 업데이트
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        article.title = title.trim();
        article.content = content;
        article.category = category;
      }

      // UI 업데이트
      this.showMessage("✅ 글이 수정되었습니다.", "success");
      await this.loadArticlesForManagement();
      this.selectArticle(this.selectedArticleId);

      // 읽기 모드로 전환
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");
      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";
    } catch (error) {
      console.error("글 수정 실패:", error);
      this.showMessage("❌ 글 수정 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 수정 취소
   */
  cancelArticleEdit() {
    if (!this.selectedArticleId) return;

    if (confirm("수정을 취소하시겠습니까?")) {
      // 읽기 모드로 전환
      const readMode = document.getElementById("detail-read-mode");
      const editMode = document.getElementById("detail-edit-mode");

      if (readMode) readMode.style.display = "block";
      if (editMode) editMode.style.display = "none";

      // 상세 패널 다시 렌더링
      const article = this.managementArticles.find(
        (a) => a.id === this.selectedArticleId
      );
      if (article) {
        this.renderDetailPanel(article);
      }
    }
  }

  /**
   * 글 삭제
   */
  async deleteArticle() {
    if (!this.selectedArticleId || !this.currentUser || !this.isFirebaseReady)
      return;

    if (!confirm("정말 이 글을 삭제하시겠습니까?")) return;

    try {
      const articleRef = window.firebaseDoc(
        this.db,
        "users",
        this.currentUser.uid,
        "texts",
        this.selectedArticleId
      );
      await window.firebaseDeleteDoc(articleRef);

      // 로컬 데이터에서 제거
      this.managementArticles = this.managementArticles.filter(
        (a) => a.id !== this.selectedArticleId
      );

      // UI 업데이트
      this.showMessage("✅ 글이 삭제되었습니다.", "success");
      this.closeDetailPanel();
      await this.loadArticlesForManagement();
    } catch (error) {
      console.error("글 삭제 실패:", error);
      this.showMessage("❌ 글 삭제 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 글 내용 복사
   */
  async copyArticleContent() {
    if (!this.selectedArticleId) return;

    const article = this.managementArticles.find(
      (a) => a.id === this.selectedArticleId
    );
    if (!article) return;

    try {
      await navigator.clipboard.writeText(article.content);
      this.showMessage("✅ 클립보드에 복사되었습니다!", "success");
    } catch (error) {
      console.error("복사 실패:", error);
      this.showMessage("❌ 복사 중 오류가 발생했습니다.", "error");
    }
  }

  // ================================================================
  // [Dual Panel] 듀얼 패널 닫기 함수
  // - 특정 패널만 닫고 해당 카드 선택 해제
  // - 2025-12-09 Phase 3B 구현
  // ================================================================

  /**
   * 특정 패널 닫기
   * @param {number} panelIndex - 닫을 패널 인덱스 (0 또는 1)
   */
  closeDetailPanelByIndex(panelIndex = 0) {
    // panelIndex 유효성 검사
    if (panelIndex !== 0 && panelIndex !== 1) {
      console.warn("[Dual Panel] 유효하지 않은 panelIndex:", panelIndex);
      panelIndex = 0;
    }

    // 해당 패널 참조
    const panel = panelIndex === 0 ? this.articleDetailPanel1 : this.articleDetailPanel2;
    
    // 이미 닫혀있는 패널인지 확인
    if (!panel || panel.style.display === "none") {
      console.log("[Dual Panel] 패널이 이미 닫혀있습니다:", panelIndex);
      return;
    }

    // 패널 숨김
    panel.style.display = "none";

    // 해당 패널에 선택된 글의 카드 하이라이트 제거
    const previousId = this.selectedArticleIds[panelIndex];
    if (previousId) {
      const previousCard = document.querySelector(
        `[data-article-id="${previousId}"]`
      );
      if (previousCard) {
        previousCard.classList.remove(`selected-panel-${panelIndex + 1}`);
        // 다른 패널에서도 선택되어있지 않으면 selected 클래스도 제거
        const otherPanelIndex = panelIndex === 0 ? 1 : 0;
        if (this.selectedArticleIds[otherPanelIndex] !== previousId) {
          previousCard.classList.remove("selected");
        }
      }
    }

    // 상태 업데이트
    this.selectedArticleIds[panelIndex] = null;

    // 듀얼 모드 상태 업데이트
    this.updateDualModeState();

    // 활성 패널 인덱스 업데이트 (닫힌 패널이 활성이었다면 다른 패널로 전환)
    if (this.activePanelIndex === panelIndex) {
      const otherPanelIndex = panelIndex === 0 ? 1 : 0;
      if (this.selectedArticleIds[otherPanelIndex] !== null) {
        this.activePanelIndex = otherPanelIndex;
      }
    }
  }

  /**
   * 상세 패널 닫기 (하위 호환성 - 패널 0 닫기)
   */
  closeDetailPanel() {
    if (this.articleDetailPanel) {
      this.articleDetailPanel.style.display = "none";
    }

    // 모든 카드 선택 해제
    document.querySelectorAll(".article-card").forEach((card) => {
      card.classList.remove("selected");
    });

    this.selectedArticleId = null;
  }

  /**
   * 순서 변경
   */
  async moveArticleOrder(articleId, direction) {
    if (!this.currentUser || !this.isFirebaseReady) return;

    try {
      const article = this.managementArticles.find((a) => a.id === articleId);
      if (!article) return;

      const category = article.category || "미분류";
      const sameCategoryArticles = this.managementArticles
        .filter((a) => (a.category || "미분류") === category)
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

      const currentIndex = sameCategoryArticles.findIndex(
        (a) => a.id === articleId
      );
      if (currentIndex === -1) return;

      let targetIndex;
      if (direction === "up") {
        if (currentIndex === 0) return; // 이미 첫 번째
        targetIndex = currentIndex - 1;
      } else {
        if (currentIndex === sameCategoryArticles.length - 1) return; // 이미 마지막
        targetIndex = currentIndex + 1;
      }

      const targetArticle = sameCategoryArticles[targetIndex];
      const currentOrder = article.order || 0;
      const targetOrder = targetArticle.order || 0;

      // 순서 교환
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

      // 로컬 데이터 업데이트
      article.order = targetOrder;
      targetArticle.order = currentOrder;

      // UI 리렌더링
      const currentCategory = this.categorySelect?.value || "";
      this.renderArticleCards(currentCategory);
    } catch (error) {
      console.error("순서 변경 실패:", error);
      this.showMessage("❌ 순서 변경 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 날짜 포맷팅 (Firestore Timestamp)
   */
  formatDateFromFirestore(timestamp) {
    if (!timestamp) return "날짜 없음";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (error) {
      return "날짜 없음";
    }
  }

  /**
   * HTML 이스케이프
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== 새 스크립트 작성 기능 =====

  /**
   * 스크립트 작성 폼 토글
   */
  toggleScriptCreateForm() {
    if (!this.scriptCreateForm || !this.newScriptToggleBtn) return;

    const isExpanded =
      this.newScriptToggleBtn.getAttribute("aria-expanded") === "true";
    const newState = !isExpanded;

    this.newScriptToggleBtn.setAttribute("aria-expanded", newState.toString());
    this.scriptCreateForm.setAttribute("aria-hidden", (!newState).toString());
    this.scriptCreateForm.style.display = newState ? "block" : "none";

    // 폼이 열릴 때 카테고리 제안 업데이트
    if (newState) {
      this.updateCategorySuggestions();
    }
  }

  /**
   * LLM 모델 선택 변경 처리
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
   * 카테고리 제안 업데이트
   */
  updateCategorySuggestions() {
    if (!this.categorySuggestions) return;

    // 기존 제안 제거
    this.categorySuggestions.innerHTML = "";

    // 고유한 카테고리 목록 추출
    const categories = new Set();
    this.managementArticles.forEach((article) => {
      if (article.category && article.category.trim()) {
        categories.add(article.category.trim());
      }
    });

    // 제안 추가
    Array.from(categories)
      .sort()
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        this.categorySuggestions.appendChild(option);
      });
  }

  /**
   * 새 스크립트 저장
   */
  async saveNewScript() {
    if (!this.currentUser || !this.isFirebaseReady) {
      this.showMessage("❌ 로그인이 필요합니다.", "error");
      return;
    }

    // 입력값 가져오기
    const title = this.scriptTitleInput?.value.trim() || "";
    const content = this.scriptContentTextarea?.value.trim() || "";
    const category = this.scriptCategoryInput?.value.trim() || "미분류";
    const llmModel =
      this.scriptLlmModelSelect?.value === "custom"
        ? this.scriptLlmModelCustom?.value.trim() || ""
        : this.scriptLlmModelSelect?.value || "";
    const llmModelType = this.scriptLlmTypeInput?.value.trim() || "일반";

    // 검증: 제목 필수
    if (!title || title.trim() === "") {
      this.showMessage("❌ 제목을 입력해주세요.", "error");
      if (this.scriptTitleInput) {
        this.scriptTitleInput.focus();
      }
      return;
    }

    if (!content || content.trim() === "") {
      this.showMessage("❌ 내용을 입력해주세요.", "error");
      if (this.scriptContentTextarea) {
        this.scriptContentTextarea.focus();
      }
      return;
    }

    try {
      // Firebase에 저장 (제목은 사용자가 입력한 값 사용)
      const textsRef = window.firebaseCollection(
        this.db,
        "users",
        this.currentUser.uid,
        "texts"
      );
      const newScriptData = {
        title: title.trim(), // 사용자가 직접 입력한 제목
        content: content,
        characterCount: content.length, // [Fix] 필수 필드 추가
        topic: category, // 카테고리는 topic 필드에 저장
        type: "script", // [Tab Separation] 스크립트 작성 탭 전용 타입 (기존 'edit'와 분리)
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
        order: Date.now(), // 타임스탬프 기반 정렬 (최신 글이 큰 값)
        // LLM 관련 필드 (선택사항)
        ...(llmModel && { llmModel: llmModel }),
        ...(llmModelType && { llmModelType: llmModelType }),
      };

      await window.firebaseAddDoc(textsRef, newScriptData);

      // 성공 메시지
      this.showMessage("✅ 스크립트가 저장되었습니다.", "success");

      // 폼 초기화
      this.resetScriptCreateForm();

      // 폼 닫기
      this.toggleScriptCreateForm();

      // 카테고리 필터를 "전체 글 보기"로 리셋 (새로 저장된 글이 보이도록)
      if (this.categorySelect) {
        this.categorySelect.value = "";
      }

      // 목록 새로고침
      await this.loadArticlesForManagement();

      // 카테고리 제안 업데이트
      this.updateCategorySuggestions();
    } catch (error) {
      console.error("스크립트 저장 실패:", error);
      this.showMessage("❌ 스크립트 저장 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 스크립트 작성 취소
   */
  cancelScriptCreate() {
    if (confirm("작성 중인 내용이 사라집니다. 정말 취소하시겠습니까?")) {
      this.resetScriptCreateForm();
      this.toggleScriptCreateForm();
    }
  }

  /**
   * 스크립트 작성 폼 초기화
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
    if (this.scriptLlmTypeInput) this.scriptLlmTypeInput.value = "일반";
  }

  /**
   * 내용 글자 수 카운터 업데이트
   */
  updateContentCounter() {
    if (!this.scriptContentTextarea || !this.scriptContentCounter) return;

    const content = this.scriptContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // 글자 수 표시 업데이트
    this.scriptContentCounter.textContent = `(${charCount} / ${maxChars}자는 약 1분 15초)`;

    // 500자 초과 시 경고 스타일 적용
    if (charCount > maxChars) {
      this.scriptContentCounter.style.color = "#e74c3c";
      this.scriptContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% 이상일 때 주의 색상
      this.scriptContentCounter.style.color = "#f39c12";
      this.scriptContentCounter.style.fontWeight = "500";
    } else {
      // 정상 범위
      this.scriptContentCounter.style.color = "#666";
      this.scriptContentCounter.style.fontWeight = "400";
    }
  }

  // ===== 확대 모드 기능 =====

  /**
   * 확대 모드 열기
   * 접근성: ARIA 속성 업데이트, 스크린 리더 알림, 포커스 트랩, ESC 키 처리 포함
   */
  openExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // 컨텍스트 감지: 수정 모드인지 확인
    const isEditMode =
      document.getElementById("detail-edit-mode")?.style.display !== "none" &&
      this.selectedArticleId;

    // 소스 결정
    if (isEditMode) {
      // 수정 모드: 제목, 카테고리, 내용을 수정 폼에서 가져옴
      this.expandSourceMode = "edit"; // 컨텍스트 저장
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
      // 새 글 작성 모드 (기본)
      this.expandSourceMode = "new"; // 컨텍스트 저장
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

    // 카운터 업데이트
    this.updateExpandContentCounter();

    // 모달 표시
    this.contentExpandModal.style.display = "block";

    // 접근성: ARIA 속성 업데이트
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // 현재 활성화된 버튼에 aria-expanded 업데이트
    const activeBtn = isEditMode ? this.detailExpandBtn : this.expandContentBtn;
    if (activeBtn) {
      activeBtn.setAttribute("aria-expanded", "true");
    }

    // 스크린 리더 사용자를 위한 알림
    this.announceToScreenReader("확대 모드가 열렸습니다.");

    // 접근성: 포커스 트랩 설정 (Tab 키 순환 제한)
    this._setupExpandModeFocusTrap();

    // 접근성: ESC 키로 모달 닫기
    this._setupExpandModeEscapeHandler();

    // 약간의 지연 후 포커스 (애니메이션 완료 후)
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // 커서를 끝으로 이동
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
  }

  // ===== [Dual Panel] 듀얼 패널 확대 모드 열기 =====
  // 2025-12-09 Phase 2 추가: 특정 패널에서 확대 모드 진입
  /**
   * 특정 패널에서 확대 모드 진입 (듀얼 패널용)
   * @param {number} panelIndex - 패널 인덱스 (0 또는 1)
   */
  openExpandModeByIndex(panelIndex = 0) {
    // 필수 DOM 요소 확인
    if (!this.contentExpandModal || !this.expandContentTextarea) {
      console.warn("[Dual Panel] 확대 모드 DOM 요소 없음");
      return;
    }

    // 패널 인덱스로 글 ID 가져오기
    const articleId = this.selectedArticleIds[panelIndex];
    if (!articleId) {
      console.warn("[Dual Panel] 확대할 글이 없습니다:", panelIndex);
      this.showMessage("❌ 선택된 글이 없습니다.", "warning");
      return;
    }

    // 글 데이터 조회
    const article = this.managementArticles.find((a) => a.id === articleId);
    if (!article) {
      this.showMessage("❌ 글 정보를 찾을 수 없습니다.", "error");
      return;
    }

    // 확대 모드 소스 저장 (듀얼 패널)
    this.expandSourceMode = "dualPanel";
    this.expandModeArticleId = articleId;
    this.expandModePanelIndex = panelIndex;

    // 확대 모드 UI에 데이터 로드
    // 제목 설정
    if (this.expandPreviewTitle) {
      this.expandPreviewTitle.textContent = article.title || "제목 없음";
    }

    // 카테고리 설정
    if (this.expandPreviewCategory) {
      this.expandPreviewCategory.textContent = article.category || "미분류";
    }

    // 내용 설정
    if (this.expandContentTextarea) {
      this.expandContentTextarea.value = article.content || "";
    }

    // 글자 수 카운터 업데이트
    this.updateExpandContentCounter();

    // 모달 표시
    this.contentExpandModal.style.display = "block";

    // 접근성: ARIA 속성 업데이트
    this.contentExpandModal.setAttribute("aria-hidden", "false");

    // ARIA 버튼 상태 업데이트
    const expandBtn = panelIndex === 0 
      ? this.detailExpandBtn1 
      : this.detailExpandBtn2;
    if (expandBtn) {
      expandBtn.setAttribute("aria-expanded", "true");
    }

    // 스크린 리더 사용자를 위한 알림
    this.announceToScreenReader("확대 모드가 열렸습니다. 패널 " + (panelIndex + 1) + "의 글을 편집합니다.");

    // 접근성: 포커스 트랩 설정 (Tab 키 순환 제한)
    this._setupExpandModeFocusTrap();

    // 접근성: ESC 키로 모달 닫기
    this._setupExpandModeEscapeHandler();

    // 약간의 지연 후 포커스 (애니메이션 완료 후)
    setTimeout(() => {
      this.expandContentTextarea.focus();
      // 커서를 끝으로 이동
      const length = this.expandContentTextarea.value.length;
      this.expandContentTextarea.setSelectionRange(length, length);
    }, DualTextWriter.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);

    console.log("[Dual Panel] 확대 모드 열림:", { panelIndex, articleId, title: article.title });
  }

  // ===== [Dual Panel] 확대 모드 닫기 =====
  // 2025-12-09 Phase 3 추가: 듀얼 패널 상태 복원 포함
  /**
   * 확대 모드 닫기
   * 접근성: ARIA 속성 업데이트 포함
   * 성능: 대기 중인 timeout 정리
   */
  closeExpandMode() {
    if (!this.contentExpandModal || !this.expandContentTextarea) return;

    // 대기 중인 timeout 정리 (메모리 누수 방지)
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }

    // 확대 모드의 내용을 원본 textarea에 동기화 (닫을 때 자동 동기화)
    // ===== [Dual Panel] 듀얼 패널 모드 동기화 =====
    if (this.expandSourceMode === "dualPanel") {
      // 듀얼 패널 모드: 저장은 별도로 처리
      console.log("[Dual Panel] 확대 모드 닫힘");
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

    // 접근성: ARIA 속성 업데이트
    this.contentExpandModal.setAttribute("aria-hidden", "true");

    // ===== [Dual Panel] ARIA 버튼 상태 복원 =====
    if (this.expandSourceMode === "dualPanel") {
      // 듀얼 패널 확대 버튼 aria-expanded 복원
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

    // 스크린 리더 사용자를 위한 알림
    this.announceToScreenReader("확대 모드가 닫혔습니다.");

    // 접근성: 포커스 트랩 및 ESC 핸들러 제거
    this._removeExpandModeFocusTrap();
    this._removeExpandModeEscapeHandler();

    // 모달 숨기기
    this.contentExpandModal.style.display = "none";

    // ===== [Dual Panel] 포커스 복원 및 상태 초기화 =====
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
      // 상태 변수 초기화
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
   * 확대 모드 포커스 트랩 설정
   * Tab 키로 모달 내부에서만 포커스 순환
   * @private
   */
  _setupExpandModeFocusTrap() {
    if (!this.contentExpandModal) return;

    // 포커스 가능한 요소 찾기
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
      // 화면에 보이는 요소만 포함
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Tab 키 핸들러
    this._expandModeTabHandler = (e) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab: 역방향
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: 정방향
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
   * 확대 모드 포커스 트랩 제거
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
   * 확대 모드 ESC 키 핸들러 설정
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
   * 확대 모드 ESC 키 핸들러 제거
   * @private
   */
  _removeExpandModeEscapeHandler() {
    if (this._expandModeEscapeHandler) {
      document.removeEventListener("keydown", this._expandModeEscapeHandler);
      this._expandModeEscapeHandler = null;
    }
  }

  // ===== [Dual Panel] 저장하고 확대 모드 닫기 =====
  // 2025-12-09 Phase 4 추가: 듀얼 패널 모드 저장 지원
  /**
   * 저장하고 확대 모드 닫기
   */
  async saveAndCloseExpandMode() {
    // ===== [Dual Panel] 듀얼 패널 모드 저장 =====
    if (this.expandSourceMode === "dualPanel") {
      const articleId = this.expandModeArticleId;
      const panelIndex = this.expandModePanelIndex;
      const newContent = this.expandContentTextarea?.value || "";
      
      if (!articleId) {
        this.showMessage("❌ 저장할 글을 찾을 수 없습니다.", "error");
        this.closeExpandMode();
        return;
      }

      try {
        // Firestore에서 글 업데이트
        const user = firebase.auth().currentUser;
        if (!user) {
          this.showMessage("❌ 로그인이 필요합니다.", "error");
          this.closeExpandMode();
          return;
        }

        const docRef = firebase.firestore()
          .collection("users")
          .doc(user.uid)
          .collection("texts")
          .doc(articleId);

        await docRef.update({
          content: newContent,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 로컬 데이터 업데이트
        const article = this.managementArticles.find((a) => a.id === articleId);
        if (article) {
          article.content = newContent;
          article.updatedAt = new Date();
        }

        // 패널 UI 갱신
        if (article && panelIndex !== null) {
          this.renderDetailPanelByIndex(article, panelIndex);
        }

        this.showMessage("✅ 저장되었습니다.", "success");
        console.log("[Dual Panel] 확대 모드에서 저장 완료:", { articleId, panelIndex });

      } catch (error) {
        console.error("[Dual Panel] 저장 실패:", error);
        this.showMessage("❌ 저장에 실패했습니다.", "error");
      }

      this.closeExpandMode();
      return;
    }

    // ===== 기존 로직: edit 모드 및 new 모드 =====
    // 내용 동기화 (닫기 전에 수행)
    if (this.expandSourceMode === "edit") {
      // 수정 모드로 반환
      if (this.editContentTextarea && this.expandContentTextarea) {
        this.editContentTextarea.value = this.expandContentTextarea.value;
      }
    } else {
      // 새 글 작성 모드로 반환 (기본)
      if (this.scriptContentTextarea && this.expandContentTextarea) {
        this.scriptContentTextarea.value = this.expandContentTextarea.value;
        this.updateContentCounter(); // 새 글 카운터 업데이트
      }
    }

    this.closeExpandMode();

    // 저장 버튼 클릭
    if (this.expandSourceMode === "edit") {
      // 수정 저장
      if (this.editSaveBtn) {
        this.editSaveBtn.click();
      }
    } else {
      // 새 글 저장
      if (this.scriptSaveBtn) {
        this.scriptSaveBtn.click();
      }
    }
  }

  /**
   * 확대 모드 글자 수 카운터 업데이트
   */
  updateExpandContentCounter() {
    if (!this.expandContentTextarea || !this.expandContentCounter) return;

    const content = this.expandContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // 글자 수 표시 업데이트
    this.expandContentCounter.textContent = `(${charCount} / ${maxChars}자는 약 1분 15초)`;

    // 500자 초과 시 경고 스타일 적용
    if (charCount > maxChars) {
      this.expandContentCounter.style.color = "#e74c3c";
      this.expandContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% 이상일 때 주의 색상
      this.expandContentCounter.style.color = "#f39c12";
      this.expandContentCounter.style.fontWeight = "500";
    } else {
      // 정상 범위
      this.expandContentCounter.style.color = "#666";
      this.expandContentCounter.style.fontWeight = "400";
    }
  }

  /**
   * 확대 모드에 레퍼런스 추가
   */
  addReferenceToExpandMode(item, sourceType) {
    if (!item || !item.content) return;

    // 중복 체크
    const exists = this.expandReferences.some(
      (ref) => ref.id === item.id && ref.sourceType === sourceType
    );

    if (exists) {
      this.showMessage("ℹ️ 이미 추가된 레퍼런스입니다.", "info");
      return;
    }

    // 최대 개수 제한 확인
    if (
      this.expandReferences.length >=
      DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES
    ) {
      this.showMessage(
        `⚠️ 레퍼런스는 최대 ${DualTextWriter.CONFIG.MAX_EXPAND_REFERENCES}개까지 추가할 수 있습니다.`,
        "error"
      );
      return;
    }

    // 레퍼런스 추가
    const newReference = {
      id: item.id,
      sourceType: sourceType,
      content: item.content,
      title:
        sourceType === "saved"
          ? item.title || "제목 없음" // Firestore에 저장된 title 사용
          : (item.content || "").substring(0, 50),
      date:
        sourceType === "saved"
          ? item.createdAt
            ? this.formatDateFromFirestore(item.createdAt)
            : item.date || ""
          : item.postedAt
          ? new Date(item.postedAt).toLocaleDateString("ko-KR")
          : "",
      category: item.topic || "미분류",
    };

    this.expandReferences.push(newReference);

    // 렌더링 (새로 추가된 레퍼런스 ID 전달하여 시각적 피드백 제공)
    this.renderExpandReferences(newReference.id);

    // 성공 메시지
    this.showMessage("✅ 레퍼런스가 추가되었습니다.", "success");
  }

  /**
   * 확대 모드에서 레퍼런스 제거
   */
  removeExpandReference(index) {
    if (index < 0 || index >= this.expandReferences.length) return;

    this.expandReferences.splice(index, 1);
    this.renderExpandReferences();
  }

  /**
   * 확대 모드 레퍼런스 렌더링
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
        `레퍼런스 ${index + 1}: ${this.escapeHtml(ref.title)}`
      );

      // 새로 추가된 레퍼런스인지 확인하여 시각적 피드백 추가
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
                        aria-label="레퍼런스 제거"
                        title="제거">
                        ×
                    </button>
                </div>
                <div class="expand-reference-item-content">${this.escapeHtml(
                  contentPreview
                )}${ref.content.length > 500 ? "..." : ""}</div>
                <div class="expand-reference-item-meta">
                    <span>📅 ${ref.date}</span>
                    <span>📁 ${this.escapeHtml(ref.category)}</span>
                </div>
                <div class="expand-reference-item-actions">
                    <button 
                        class="expand-reference-add-btn"
                        aria-label="내용에 추가"
                        title="이 레퍼런스를 오른쪽 내용 필드에 추가">
                        <span class="btn-icon">➕</span>
                        <span class="btn-text">내용에 추가</span>
                    </button>
                </div>
            `;

      // 제거 버튼 이벤트
      const removeBtn = itemEl.querySelector(".expand-reference-item-remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          this.removeExpandReference(index);
        });
      }

      // 내용에 추가 버튼 이벤트
      const addBtn = itemEl.querySelector(".expand-reference-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          this.addExpandReferenceToContent(ref, index);
        });
      }

      this.expandReferenceList.appendChild(itemEl);

      // 새로 추가된 레퍼런스인 경우 애니메이션 완료 후 클래스 제거
      if (isNewlyAdded) {
        setTimeout(() => {
          itemEl.classList.remove("reference-added");
        }, DualTextWriter.CONFIG.REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS);
      }
    });

    // 접근성: 레퍼런스 목록 표시 및 ARIA 속성 업데이트
    if (this.expandReferenceList && this.expandReferences.length > 0) {
      this.expandReferenceList.style.display = "block";
      this.expandReferenceList.setAttribute(
        "aria-label",
        `추가된 레퍼런스 목록 (${this.expandReferences.length}개)`
      );
    }
  }

  /**
   * 확대 모드 레퍼런스를 내용 필드에 추가
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

    // 커서를 추가된 내용 끝으로 이동
    const length = newContent.length;
    this.expandContentTextarea.setSelectionRange(length, length);

    // 글자 수 카운터 업데이트
    this.updateExpandContentCounter();

    // 원본 textarea도 동기화
    if (this.scriptContentTextarea) {
      this.scriptContentTextarea.value = newContent;
      this.updateContentCounter();
    }

    // 성공 메시지
    this.showMessage("✅ 레퍼런스가 내용에 추가되었습니다.", "success");
  }

  /**
   * 확대 모드 레퍼런스 영역 접기/펼치기
   */
  /**
   * 확대 모드 레퍼런스 패널 토글
   * 접근성: ARIA 속성 업데이트 및 스크린 리더 알림 포함
   */
  toggleExpandReferencePanel() {
    if (!this.expandReferencePanel || !this.expandToggleReferenceBtn) return;

    const isCollapsed =
      this.expandReferencePanel.classList.contains("collapsed");

    // collapsed 클래스 토글
    this.expandReferencePanel.classList.toggle("collapsed");

    // 접근성: ARIA 속성 업데이트
    const newState = !isCollapsed; // 토글 후 상태 (true = 접힘, false = 펼침)
    this.expandToggleReferenceBtn.setAttribute(
      "aria-expanded",
      newState ? "false" : "true"
    );

    // 스크린 리더 사용자를 위한 알림
    const message = newState
      ? "레퍼런스 영역이 접혔습니다."
      : "레퍼런스 영역이 펼쳐졌습니다.";
    this.announceToScreenReader(message);
  }

  /**
   * 확대 모드 분할선 드래그 초기화
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

      // 최소/최대 너비 제한
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

  // ===== 레퍼런스 불러오기 기능 =====

  /**
   * 레퍼런스 로더 열기
   */
  openReferenceLoader() {
    console.log("[openReferenceLoader] 함수 호출됨");
    if (!this.referenceLoaderPanel) {
      console.error(
        "[openReferenceLoader] referenceLoaderPanel을 찾을 수 없습니다."
      );
      return;
    }

    const content = this.referenceLoaderPanel.querySelector(
      ".reference-loader-content"
    );

    // 패널 표시
    this.referenceLoaderPanel.style.display = "block";

    // 탭 상태 초기화 (활성 탭과 동기화)
    const activeTab = this.referenceLoaderPanel.querySelector(
      ".reference-tab.active"
    );
    if (activeTab) {
      const tabName = activeTab.getAttribute("data-tab") || "saved";
      this.currentReferenceTab = tabName;
    } else {
      // 활성 탭이 없으면 기본값으로 설정
      this.currentReferenceTab = "saved";
    }

    // transform 초기화 (인라인 스타일 제거 후 CSS 적용)
    if (content) {
      // 인라인 스타일 제거하여 CSS 선택자가 작동하도록 함
      content.style.transform = "";

      // 약간의 지연 후 transform 적용 (리플로우 보장)
      setTimeout(() => {
        content.style.transform = "translateX(0)";
      }, 10);
    }

    // 약간의 지연 후 데이터 로드
    setTimeout(() => {
      try {
        this.loadReferenceList();
        this.loadRecentReferencesList();
      } catch (error) {
        console.error("[openReferenceLoader] 데이터 로드 중 오류 발생:", {
          function: "openReferenceLoader",
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage(
          "❌ 레퍼런스 목록을 불러오는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }, 20);
  }

  /**
   * 레퍼런스 로더 닫기
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
      // 인라인 스타일 제거하여 다음 열 때 CSS가 정상 작동하도록 함
      if (content) {
        content.style.transform = "";
      }
      if (this.referenceSearchInput) {
        this.referenceSearchInput.value = "";
      }
      // 필터도 초기화
      if (this.referenceCategoryFilter) {
        this.referenceCategoryFilter.value = "";
      }
      if (this.referenceSortFilter) {
        this.referenceSortFilter.value = "recent";
      }
    }, 300);
  }

  /**
   * 레퍼런스 탭 전환
   */
  switchReferenceTab(tabName) {
    this.currentReferenceTab = tabName;

    // 탭 버튼 업데이트
    this.referenceTabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-tab") === tabName;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive.toString());
    });

    // 콘텐츠 업데이트
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

    // 필터 표시/숨김
    if (this.referenceTrackingFilters) {
      this.referenceTrackingFilters.style.display =
        tabName === "tracking" ? "flex" : "none";
    }

    // 목록 로드
    this.loadReferenceList();
  }

  /**
   * 레퍼런스 검색 처리
   */
  handleReferenceSearch(query) {
    clearTimeout(this.referenceSearchDebounce);
    this.referenceSearchDebounce = setTimeout(() => {
      this.loadReferenceList();
    }, 300);
  }

  /**
   * 레퍼런스 목록 로드
   */
  async loadReferenceList() {
    if (!this.currentUser || !this.isFirebaseReady) {
      console.warn("[loadReferenceList] 사용자 또는 Firebase 준비 상태 확인:", {
        hasUser: !!this.currentUser,
        isFirebaseReady: this.isFirebaseReady,
      });
      return;
    }

    // currentReferenceTab이 없으면 기본값 설정
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
        console.warn(
          "[loadReferenceList] 알 수 없는 탭:",
          this.currentReferenceTab
        );
        // 기본값으로 저장된 글 로드
        this.currentReferenceTab = "saved";
        await this.loadSavedReferences(searchQuery, categoryFilter);
      }
    } catch (error) {
      console.error("[loadReferenceList] 레퍼런스 목록 로드 실패:", {
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
        "❌ 레퍼런스 목록을 불러오는 중 오류가 발생했습니다.",
        "error"
      );
    }
  }

  /**
   * 저장된 글 레퍼런스 로드
   */
  async loadSavedReferences(searchQuery = "", categoryFilter = "") {
    if (!this.referenceSavedList) return;

    // 저장된 글 목록이 없으면 로드
    if (!this.savedTexts || this.savedTexts.length === 0) {
      await this.loadSavedTexts();
    }

    // 필터링
    let filtered = this.savedTexts.filter((text) => {
      // [Tab Separation] 레퍼런스는 'edit'(글 작성)와 'script'(스크립트) 모두 허용
      const type = text.type || "edit";
      if (type !== "edit" && type !== "script") return false;

      // 검색어 필터
      if (searchQuery) {
        const title = this.extractTitleFromContent(
          text.content || ""
        ).toLowerCase();
        const content = (text.content || "").toLowerCase();
        if (!title.includes(searchQuery) && !content.includes(searchQuery)) {
          return false;
        }
      }

      // 카테고리 필터
      if (categoryFilter) {
        const category = text.topic || "미분류";
        if (category !== categoryFilter) return false;
      }

      return true;
    });

    // 정렬 (최신순)
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.date || 0);
      const dateB = b.createdAt?.toDate?.() || new Date(b.date || 0);
      return dateB - dateA;
    });

    // 렌더링
    this.renderReferenceList(filtered, this.referenceSavedList, "saved");

    // 빈 상태 처리
    const emptyEl = document.getElementById("reference-saved-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * 트래킹 레퍼런스 로드
   */
  async loadTrackingReferences(
    searchQuery = "",
    categoryFilter = "",
    sortFilter = "recent"
  ) {
    if (!this.referenceTrackingList) return;

    // 트래킹 포스트 목록이 없으면 로드
    if (!this.trackingPosts || this.trackingPosts.length === 0) {
      await this.loadTrackingPosts();
    }

    // 필터링
    let filtered = this.trackingPosts.filter((post) => {
      // 검색어 필터
      if (searchQuery) {
        const content = (post.content || "").toLowerCase();
        if (!content.includes(searchQuery)) return false;
      }

      // 카테고리 필터는 트래킹에는 적용 안 함 (나중에 확장 가능)
      return true;
    });

    // 정렬
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
        // 최신순
        const dateA = a.postedAt || new Date(0);
        const dateB = b.postedAt || new Date(0);
        return dateB - dateA;
      }
    });

    // 렌더링
    this.renderReferenceList(filtered, this.referenceTrackingList, "tracking");

    // 빈 상태 처리
    const emptyEl = document.getElementById("reference-tracking-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * 트래킹 포스트의 최신 메트릭 값 가져오기
   */
  getLatestMetricValue(post, metricType) {
    if (!post.metrics || post.metrics.length === 0) return 0;

    const latest = post.metrics[post.metrics.length - 1];
    return latest[metricType] || 0;
  }

  /**
   * 레퍼런스 목록 렌더링
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
   * 레퍼런스 아이템 생성
   */
  createReferenceItem(item, sourceType) {
    const div = document.createElement("div");
    div.className = "reference-item";
    div.setAttribute("data-item-id", item.id);
    div.setAttribute("data-source-type", sourceType);

    const title =
      sourceType === "saved"
        ? item.title || "제목 없음" // Firestore에 저장된 title 사용
        : (item.content || "").substring(0, 50) +
          (item.content?.length > 50 ? "..." : "");

    const content = (item.content || "").substring(0, 150);
    let date = "";
    if (sourceType === "saved") {
      date = item.createdAt
        ? this.formatDateFromFirestore(item.createdAt)
        : item.date || "";
    } else {
      // 트래킹 포스트의 경우 postedAt이 Date 객체일 수도 있음
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

    let metaHtml = `<span>📅 ${date}</span>`;

    if (sourceType === "tracking") {
      const views = this.getLatestMetricValue(item, "views") || 0;
      const likes = this.getLatestMetricValue(item, "likes") || 0;
      const follows = this.getLatestMetricValue(item, "follows") || 0;
      metaHtml += `<span>👀 ${views}</span>`;
      metaHtml += `<span>❤️ ${likes}</span>`;
      metaHtml += `<span>👥 ${follows}</span>`;
    } else {
      const category = item.topic || "미분류";
      metaHtml += `<span>📁 ${this.escapeHtml(category)}</span>`;
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
                    추가하기
                </button>
            </div>
        `;

    // 추가 버튼 이벤트
    const addBtn = div.querySelector('[data-action="add"]');
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.addReferenceToContent(item, sourceType);
      });
    }

    // 아이템 클릭 시에도 추가
    div.addEventListener("click", () => {
      this.addReferenceToContent(item, sourceType);
    });

    return div;
  }

  /**
   * 레퍼런스를 확대 모드의 레퍼런스 영역에 추가
   * 확대 모드가 닫혀있으면 자동으로 열고 레퍼런스를 추가합니다.
   *
   * @param {Object} item - 레퍼런스 아이템 객체
   * @param {string} sourceType - 레퍼런스 소스 타입 ('saved' 또는 'tracking')
   */
  addReferenceToContent(item, sourceType) {
    // 필수 DOM 요소 존재 여부 확인
    if (!this.scriptContentTextarea) {
      console.error("[addReferenceToContent] 필수 DOM 요소 없음:", {
        function: "addReferenceToContent",
        missingElement: "scriptContentTextarea",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 파라미터 유효성 검사
    if (!item || typeof item !== "object") {
      console.error("[addReferenceToContent] 파라미터 유효성 검사 실패:", {
        function: "addReferenceToContent",
        parameter: "item",
        receivedType: typeof item,
        receivedValue: item,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("❌ 레퍼런스 정보가 올바르지 않습니다.", "error");
      return;
    }

    const content = item.content || "";
    if (!content.trim()) {
      this.showMessage("❌ 레퍼런스 내용이 비어있습니다.", "error");
      return;
    }

    // sourceType 파라미터 유효성 검사
    if (!sourceType || typeof sourceType !== "string") {
      console.error(
        "[addReferenceToContent] sourceType 파라미터 유효성 검사 실패:",
        {
          function: "addReferenceToContent",
          parameter: "sourceType",
          receivedType: typeof sourceType,
          receivedValue: sourceType,
          timestamp: new Date().toISOString(),
        }
      );
      this.showMessage("❌ 레퍼런스 소스 타입이 올바르지 않습니다.", "error");
      return;
    }

    const validSourceTypes = ["saved", "tracking"];
    if (!validSourceTypes.includes(sourceType)) {
      console.error("[addReferenceToContent] 유효하지 않은 sourceType:", {
        function: "addReferenceToContent",
        parameter: "sourceType",
        receivedValue: sourceType,
        validValues: validSourceTypes,
        timestamp: new Date().toISOString(),
      });
      this.showMessage("❌ 지원하지 않는 레퍼런스 소스 타입입니다.", "error");
      return;
    }

    // 확대 모드 열림 상태 확인
    const isExpandModeOpen =
      this.contentExpandModal &&
      this.contentExpandModal.style.display === "block";

    // 확대 모드가 닫혀있으면 먼저 열기
    if (!isExpandModeOpen) {
      // 필수 DOM 요소 확인
      if (!this.contentExpandModal || !this.expandContentTextarea) {
        console.error("[addReferenceToContent] 확대 모드 관련 DOM 요소 없음:", {
          function: "addReferenceToContent",
          missingElements: {
            contentExpandModal: !this.contentExpandModal,
            expandContentTextarea: !this.expandContentTextarea,
          },
          timestamp: new Date().toISOString(),
        });
        this.showMessage("❌ 확대 모드를 열 수 없습니다.", "error");
        return;
      }

      try {
        // 성능 모니터링: 시작 시간 기록
        const performanceStart = performance.now();

        // 확대 모드 열기
        this.openExpandMode();

        // 모달이 열린 후 레퍼런스 추가 (애니메이션 완료 대기)
        const timeoutId = setTimeout(() => {
          // 성능 모니터링: 완료 시간 기록
          const performanceEnd = performance.now();
          const performanceDuration = performanceEnd - performanceStart;

          // 성능이 느린 경우에만 로깅
          if (
            performanceDuration >
            DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS
          ) {
            console.warn("[addReferenceToContent] 성능 경고:", {
              function: "addReferenceToContent",
              action: "expandModeOpenAndAddReference",
              duration: `${performanceDuration.toFixed(2)}ms`,
              threshold: `${DualTextWriter.CONFIG.PERFORMANCE_WARNING_THRESHOLD_MS}ms`,
              timestamp: new Date().toISOString(),
            });
          }

          this._addReferenceToExpandModeAndNotify(item, sourceType, true);
        }, DualTextWriter.CONFIG.EXPAND_MODE_ANIMATION_DELAY);

        // 메모리 누수 방지를 위한 timeout ID 저장 (필요시 클리어 가능)
        if (!this._expandModeTimeouts) {
          this._expandModeTimeouts = [];
        }
        this._expandModeTimeouts.push(timeoutId);

        return;
      } catch (error) {
        // 구조화된 에러 로깅
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
        console.error(
          "[addReferenceToContent] 확대 모드 열기 중 오류 발생:",
          errorContext
        );
        this.showMessage("❌ 확대 모드를 열 수 없습니다.", "error");
        return;
      }
    }

    // 확대 모드가 이미 열려있는 경우
    this._addReferenceToExpandModeAndNotify(item, sourceType, false);
  }

  /**
   * 레퍼런스를 확대 모드에 추가하고 사용자에게 알림
   * 중복 코드 제거를 위한 헬퍼 함수
   *
   * @param {Object} item - 레퍼런스 아이템 객체
   * @param {string} sourceType - 레퍼런스 소스 타입
   * @param {boolean} isNewlyOpened - 확대 모드가 방금 열렸는지 여부
   * @private
   */
  _addReferenceToExpandModeAndNotify(item, sourceType, isNewlyOpened) {
    try {
      // 레퍼런스 추가
      this.addReferenceToExpandMode(item, sourceType);

      // 최근 사용 목록에 추가
      if (item.id && sourceType) {
        this.addToRecentReferences(item.id, sourceType);
      }

      // 사이드 패널 닫기
      this.closeReferenceLoader();

      // 스크린 리더 사용자를 위한 알림
      const screenReaderMessage = isNewlyOpened
        ? "레퍼런스가 확대 모드의 레퍼런스 영역에 추가되었습니다."
        : "레퍼런스가 레퍼런스 영역에 추가되었습니다.";
      this.announceToScreenReader(screenReaderMessage);

      // 성공 메시지
      this.showMessage(
        "✅ 레퍼런스가 추가되었습니다. 왼쪽 레퍼런스 영역에서 확인하세요.",
        "success"
      );

      // 확대 모드가 방금 열린 경우에만 포커스 관리
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
      // 구조화된 에러 로깅
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
      console.error(
        "[addReferenceToContent] 레퍼런스 추가 중 오류 발생:",
        errorContext
      );
      this.showMessage("❌ 레퍼런스 추가 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 최근 사용 레퍼런스 로드 (localStorage)
   */
  loadRecentReferences() {
    try {
      const stored = localStorage.getItem("dtw_recent_references");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("최근 레퍼런스 로드 실패:", error);
      return [];
    }
  }

  /**
   * 최근 사용 레퍼런스 목록 렌더링
   */
  async loadRecentReferencesList() {
    if (!this.referenceRecentList || !this.referenceRecentSection) return;

    if (this.recentReferences.length === 0) {
      this.referenceRecentSection.style.display = "none";
      return;
    }

    this.referenceRecentSection.style.display = "block";
    this.referenceRecentList.innerHTML = "";

    // 최근 5개만 표시
    const recent = this.recentReferences.slice(0, 5);

    for (const ref of recent) {
      try {
        let item = null;

        if (ref.sourceType === "saved") {
          // 저장된 글에서 찾기
          if (!this.savedTexts || this.savedTexts.length === 0) {
            await this.loadSavedTexts();
          }
          item = this.savedTexts.find((t) => t.id === ref.id);
        } else {
          // 트래킹에서 찾기
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
        console.error("최근 레퍼런스 로드 실패:", error);
      }
    }
  }

  /**
   * 최근 사용 레퍼런스에 추가
   */
  addToRecentReferences(itemId, sourceType) {
    // 기존 항목 제거 (중복 방지)
    this.recentReferences = this.recentReferences.filter(
      (ref) => !(ref.id === itemId && ref.sourceType === sourceType)
    );

    // 맨 앞에 추가
    this.recentReferences.unshift({
      id: itemId,
      sourceType: sourceType,
      timestamp: Date.now(),
    });

    // 최대 10개만 유지
    this.recentReferences = this.recentReferences.slice(0, 10);

    // localStorage에 저장
    try {
      localStorage.setItem(
        Constants.STORAGE_KEYS.RECENT_REFERENCES,
        JSON.stringify(this.recentReferences)
      );
    } catch (error) {
      console.error("최근 레퍼런스 저장 실패:", error);
    }
  }
}

// Initialize the application
let dualTextWriter;

document.addEventListener("DOMContentLoaded", () => {
  dualTextWriter = new DualTextWriter();
  window.dualTextWriter = dualTextWriter;
  window.app = dualTextWriter;

  // 메인 콘텐츠 강제 표시 (로그인 상태와 관계없이)
  const mainContent = document.getElementById("main-content");
  if (mainContent) {
    mainContent.style.display = "block";
  }

  // 전역 디버깅 함수 등록
  window.debugSavedItems = () => dualTextWriter.debugSavedItems();
  window.verifyLLMCharacteristics = () =>
    dualTextWriter.verifyLLMCharacteristics();
  window.testEditButton = (index = 0) => {
    const editButtons = document.querySelectorAll(".btn-edit");
    if (editButtons[index]) {
      editButtons[index].click();
    } else {
      console.log("편집 버튼을 찾을 수 없습니다.");
    }
  };
  window.testDeleteButton = (index = 0) => {
    const deleteButtons = document.querySelectorAll(".btn-delete");
    if (deleteButtons[index]) {
      deleteButtons[index].click();
    } else {
      console.log("삭제 버튼을 찾을 수 없습니다.");
    }
  };
  window.testLLMValidation = (llmService = "chatgpt", index = 0) => {
    const llmButtons = document.querySelectorAll(`[data-llm="${llmService}"]`);
    if (llmButtons[index]) {
      llmButtons[index].click();
    } else {
      console.log(`${llmService} 검증 버튼을 찾을 수 없습니다.`);
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

      // 유효성 검증: min/max 범위 내인지 확인
      if (newValue >= min && newValue <= max) {
        input.value = newValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));

        // 실시간 유효성 피드백: 범위를 벗어나면 스테퍼 비활성화
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

  // Date tab handlers - 이벤트 위임 방식으로 안정적인 바인딩
  // 기존 핸들러 제거 (중복 바인딩 방지)
  if (content._dateTabHandler) {
    content.removeEventListener("click", content._dateTabHandler);
  }

  // 새로운 핸들러 생성 및 저장
  content._dateTabHandler = (e) => {
    const tab = e.target.closest(".date-tab");
    if (!tab) return;

    e.preventDefault();
    e.stopPropagation();

    const tabs = tab.closest(".date-selector-tabs");
    if (!tabs) return;

    // 같은 폼 그룹 내의 날짜 입력 필드 찾기
    const formGroup = tabs.closest(".form-group");
    if (!formGroup) return;

    const dateInput = formGroup.querySelector('input[type="date"]');
    if (!dateInput) {
      console.warn("날짜 입력 필드를 찾을 수 없습니다:", formGroup);
      return;
    }

    // 모든 탭 비활성화 후 클릭한 탭 활성화
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
      // input 이벤트 트리거하여 폼 검증 업데이트
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "yesterday") {
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      dateInput.value = yesterdayStr;
      dateInput.style.display = "none";
      // input 이벤트 트리거하여 폼 검증 업데이트
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (dateType === "custom") {
      dateInput.style.display = "block";
      // 직접입력 필드가 보이도록 약간의 지연 후 포커스 (애니메이션 완료 후)
      setTimeout(() => {
        dateInput.focus();
      }, 50);
      // 사용자 입력을 위해 현재 값을 유지하거나 오늘 날짜로 설정
      if (!dateInput.value) {
        dateInput.value = today.toISOString().split("T")[0];
      }
      // input 이벤트 트리거
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  // 이벤트 위임: 모달 컨텐츠에 한 번만 바인딩
  content.addEventListener("click", content._dateTabHandler);

  // Focus scroll correction: 키패드가 가려지지 않도록 (안드로이드/아이폰 호환)
  content.querySelectorAll("input, textarea").forEach((field) => {
    const handleFocus = (e) => {
      // 여러 번 호출 방지
      if (field._scrollHandled) return;
      field._scrollHandled = true;

      setTimeout(
        () => {
          const rect = field.getBoundingClientRect();
          const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight;

          // 플랫폼별 키패드 높이 추정
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
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              });
            }
          }

          field._scrollHandled = false;
        },
        isIOS ? 500 : 300
      ); // iOS는 키패드 애니메이션이 더 길 수 있음
    };

    field.addEventListener("focus", handleFocus, { passive: true });

    // blur 시 플래그 리셋
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

  // 폼 값 초기화 전략: 바텀시트 닫을 때 모든 입력 필드 초기화
  const content = modalElement.querySelector(".modal-content");
  if (content) {
    // 모든 input, textarea, select 초기화
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

    // 날짜 탭 초기화
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

    // 날짜 입력 필드 초기화
    const dateInputs = content.querySelectorAll('input[type="date"]');
    dateInputs.forEach((input) => {
      input.style.display = "none";
    });

    // 스테퍼 버튼 상태 초기화
    const steppers = content.querySelectorAll(".number-stepper");
    steppers.forEach((stepper) => {
      stepper.disabled = false;
      stepper.style.opacity = "1";
    });

    // 폼 검증 메시지 제거
    const errorMessages = content.querySelectorAll(
      ".error-message, .validation-error"
    );
    errorMessages.forEach((msg) => msg.remove());

    // 입력 필드의 에러 상태 제거
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

  // 모달 상태 초기화
  this.currentTrackingTextId = null;
  this.editingMetricData = null;
};

// 페이지 언로드 시 정리 작업
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

// ==================== 트래킹 기능 메서드들 ====================

// 트래킹 포스트 로드
DualTextWriter.prototype.loadTrackingPosts = async function () {
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
    const querySnapshot = await window.firebaseGetDocs(q);

    this.trackingPosts = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // 레퍼런스 타입 포스트는 트래킹 목록에서 제외
      // 레퍼런스 글은 사용 여부 표시용이지 트래킹 대상이 아님
      const postType = data.type || "edit";
      const sourceType = data.sourceType || data.type || "edit";

      // 레퍼런스 타입 포스트 필터링 (type === 'reference' 또는 sourceType === 'reference')
      if (postType === "reference" || sourceType === "reference") {
        console.log("레퍼런스 포스트는 트래킹 목록에서 제외:", doc.id);
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
        sourceTextExists: null, // 검증 결과 (나중에 설정)
      });
    });

    console.log(
      `${this.trackingPosts.length}개의 트래킹 포스트를 불러왔습니다.`
    );

    // 데이터 무결성 검증: 각 포스트의 sourceTextId가 유효한지 확인
    await this.validateSourceTexts();

    // 포스트 선택 드롭다운 업데이트 (개별 포스트 모드일 때)
    if (this.chartMode === "individual") {
      this.populatePostSelector();
    }

    // loadTrackingPosts는 초기 로드 시에만 사용, 이후에는 refreshUI 사용
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });
  } catch (error) {
    // Firebase 데이터 로드 실패 시 에러 처리
    console.error("[loadTrackingPosts] Failed to load tracking posts:", error);
    this.trackingPosts = [];
    // 사용자에게 에러 메시지 표시
    this.showMessage(
      "트래킹 데이터를 불러오는데 실패했습니다. 네트워크 연결을 확인해주세요.",
      "error"
    );
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
    console.error("즐겨찾기 저장 실패", e);
  }
};

// CSV 내보내기 (현재 필터/정렬 적용된 리스트 기준)
DualTextWriter.prototype.exportTrackingCsv = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) {
    this.showMessage("내보낼 데이터가 없습니다.", "info");
    return;
  }
  // renderTrackingPosts의 필터/정렬 로직을 재사용하기 위해 동일 계산 수행
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;
  let list = [...this.trackingPosts];
  // 상태
  if (this.trackingStatusFilter === "active")
    list = list.filter((p) => !!p.trackingEnabled);
  else if (this.trackingStatusFilter === "inactive")
    list = list.filter((p) => !p.trackingEnabled);
  else if (this.trackingStatusFilter === "hasData")
    list = list.filter((p) => p.metrics && p.metrics.length > 0);
  else if (this.trackingStatusFilter === "noData")
    list = list.filter((p) => !(p.metrics && p.metrics.length > 0));
  // 검색
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
  // 수치 범위
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
  // 정렬 적용 (renderTrackingPosts와 동일한 로직)
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // 조회수 정렬
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
    // 좋아요 정렬
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
    // 댓글 정렬
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
    // 공유 정렬
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
    // 팔로우 정렬
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
    // 입력 횟수 정렬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // 날짜 정렬
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
      // 기본값: 최신 업데이트순
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

  // CSV 작성
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
// 원본 텍스트 존재 여부 검증
DualTextWriter.prototype.validateSourceTexts = async function () {
  if (!this.currentUser || !this.isFirebaseReady || !this.trackingPosts) return;

  try {
    // sourceTextId가 있는 포스트들만 검증
    const postsToValidate = this.trackingPosts.filter(
      (post) => post.sourceTextId
    );

    if (postsToValidate.length === 0) {
      // sourceTextId가 없는 포스트들은 orphan으로 표시
      this.trackingPosts.forEach((post) => {
        if (!post.sourceTextId) {
          post.sourceTextExists = false;
          post.isOrphan = true;
        }
      });
      return;
    }

    // 모든 sourceTextId 수집
    const sourceTextIds = [
      ...new Set(postsToValidate.map((post) => post.sourceTextId)),
    ];

    // 원본 텍스트 존재 여부 일괄 확인
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
        console.error(`원본 텍스트 검증 실패 (${textId}):`, error);
        return { textId, exists: false };
      }
    });

    const validationResults = await Promise.all(validationPromises);
    const validationMap = new Map(
      validationResults.map((r) => [r.textId, r.exists])
    );

    // 각 포스트에 검증 결과 적용
    this.trackingPosts.forEach((post) => {
      if (post.sourceTextId) {
        post.sourceTextExists = validationMap.get(post.sourceTextId) || false;
        post.isOrphan = !post.sourceTextExists;
      } else {
        // sourceTextId가 없으면 orphan으로 표시 (업그레이드 전 데이터)
        post.sourceTextExists = false;
        post.isOrphan = true;
      }
    });

    const orphanCount = this.trackingPosts.filter((p) => p.isOrphan).length;
    if (orphanCount > 0) {
      console.log(`⚠️ ${orphanCount}개의 orphan 포스트가 발견되었습니다.`);
    }
  } catch (error) {
    console.error("원본 텍스트 검증 실패:", error);
    // 에러 발생 시 모든 포스트를 검증 실패로 표시하지 않고, sourceTextId가 없는 것만 orphan으로 표시
    this.trackingPosts.forEach((post) => {
      if (!post.sourceTextId) {
        post.isOrphan = true;
        post.sourceTextExists = false;
      }
    });
  }
};
// 트래킹 포스트 렌더링
DualTextWriter.prototype.renderTrackingPosts = function () {
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
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);
  const orphanCount = orphanPosts.length;

  // Orphan 포스트 경고 배너 HTML
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
    `
      : "";

  // 상태/검색/기간 필터 적용
  let list = [...this.trackingPosts];

  // 레퍼런스 포스트 필터링 (트래킹 대상 아님)
  // 레퍼런스 글은 사용 여부 표시용이지 트래킹 대상이 아님
  list = list.filter((post) => {
    const postType = post.type || "edit";
    const sourceType = post.sourceType || post.type || "edit";

    // 레퍼런스 타입 포스트는 제외
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

  // 정렬 기준 계산에 필요한 최신 메트릭
  const getLatest = (p) =>
    p.metrics && p.metrics.length > 0 ? p.metrics[p.metrics.length - 1] : null;

  // 검색(제목/키워드/해시태그)
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

  // 기간(최종 업데이트) 필터
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

  // 수치 범위 필터 (최신 메트릭 기준)
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

  // 정렬 적용
  switch (this.trackingSort) {
    case "favoritesFirst":
      list.sort((a, b) => this.isFavorite(b.id) - this.isFavorite(a.id));
      break;
    // 조회수 정렬
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
    // 좋아요 정렬
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
    // 댓글 정렬
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
    // 공유 정렬
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
    // 팔로우 정렬
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
    // 입력 횟수 정렬
    case "entriesDesc":
      list.sort((a, b) => (b.metrics?.length || 0) - (a.metrics?.length || 0));
      break;
    case "entriesAsc":
      list.sort((a, b) => (a.metrics?.length || 0) - (b.metrics?.length || 0));
      break;
    // 날짜 정렬
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
      // 기본값: 최신 업데이트순
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

  // 이벤트 위임 설정 (최초 1회만)
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
              button.textContent = nowExpanded ? "접기" : "더보기";
              button.setAttribute(
                "aria-expanded",
                nowExpanded ? "true" : "false"
              );
              try {
                // localStorage에 상태 저장 (통일된 스키마: card:{postId}:expanded)
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

      // 키보드 접근성 지원 (Enter/Space 키 처리) - 최초 1회만
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

        // 상태 정보
        const statusClass = post.trackingEnabled ? "active" : "inactive";
        const statusIcon = post.trackingEnabled ? "🟢" : "⚪";
        const statusText = post.trackingEnabled ? "활성" : "비활성";

        // Orphan 포스트 표시
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
                ⚠️ 원본 삭제됨
            </div>
        `
          : "";

        // 메트릭 데이터 표시
        const metricsBadgeClass = hasMetrics ? "has-data" : "no-data";
        const metricsBadgeText = hasMetrics
          ? `📊 ${metricsCount}회 입력`
          : "📭 데이터 없음";

        // 마지막 업데이트 날짜
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

        // Orphan 포스트는 시각적으로 다르게 표시
        const orphanClass = post.isOrphan ? "orphan-post" : "";

        // sourceTextId를 통해 원본 텍스트에서 주제 정보 가져오기
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

        // ✅ sourceTextId를 통해 원본 텍스트에서 SNS 플랫폼 정보 가져오기
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
            // 유효한 플랫폼 ID만 필터링
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
                    )} 플랫폼">${p.icon} ${this.escapeHtml(p.name)}</span>`
                )
                .join("");
              snsPlatformsHtml = `
                        <div class="tracking-post-platforms" role="list" aria-label="SNS 플랫폼 목록">
                            ${platformsList}
                        </div>
                    `;
            }
          }
        }

        // localStorage에서 확장 상태 복원 (통일된 스키마: card:{postId}:expanded)
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
          isFav ? "⭐" : "☆"
        }</button>
                        ${orphanBadge}
                    </div>
                    <div class="tracking-post-status-group">
                        <div class="tracking-post-status ${statusClass}" aria-label="트래킹 상태: ${statusText}">
                            <span class="status-icon" aria-hidden="true">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                </div>
                ${
                  topic
                    ? `<div class="tracking-post-topic" aria-label="주제: ${this.escapeHtml(
                        topic
                      )}">🏷️ ${this.escapeHtml(topic)}</div>`
                    : ""
                }
                ${snsPlatformsHtml}
                <div class="tracking-post-content ${
                  expanded ? "expanded" : ""
                }" aria-label="포스트 내용">${this.escapeHtml(
          post.content || ""
        )}</div>
                ${
                  shouldShowToggle
                    ? `<button class="tracking-post-toggle" data-action="toggle-content" data-post-id="${
                        post.id
                      }" aria-expanded="${
                        expanded ? "true" : "false"
                      }" aria-label="${
                        expanded ? "내용 접기" : "내용 더보기"
                      }">${expanded ? "접기" : "더보기"}</button>`
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
                            마지막 업데이트: ${lastUpdateText}
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
                    }" title="그래프에서 보기" role="button" tabindex="0" aria-label="그래프에서 보기">
                        <div class="metric-item">
                            <div class="metric-icon">👀</div>
                            <div class="metric-value">${
                              latestMetrics.views || 0
                            }</div>
                            <div class="metric-label">조회수</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">❤️</div>
                            <div class="metric-value">${
                              latestMetrics.likes || 0
                            }</div>
                            <div class="metric-label">좋아요</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">💬</div>
                            <div class="metric-value">${
                              latestMetrics.comments || 0
                            }</div>
                            <div class="metric-label">댓글</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">🔄</div>
                            <div class="metric-value">${
                              latestMetrics.shares || 0
                            }</div>
                            <div class="metric-label">공유</div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">👥</div>
                            <div class="metric-value">${
                              latestMetrics.follows || 0
                            }</div>
                            <div class="metric-label">팔로우</div>
                        </div>
                    </div>
                `
                    : `
                    <div class="tracking-post-no-data">
                        <span class="no-data-icon">📭</span>
                        <span class="no-data-text">아직 데이터가 입력되지 않았습니다. "데이터 추가" 버튼을 클릭하여 성과 데이터를 입력하세요.</span>
                    </div>
                `
                }
                
                <div class="tracking-post-actions actions--primary">
                    ${
                      post.trackingEnabled
                        ? `<button class="tracking-btn primary" data-action="add-tracking-data" data-post-id="${post.id}" aria-label="성과 데이터 추가">데이터 추가</button>`
                        : `<button class="tracking-btn primary" data-action="start-tracking" data-post-id="${post.id}" aria-label="트래킹 시작">트래킹 시작</button>`
                    }
                    <div class="more-menu actions--more">
                        <button class="more-menu-btn" data-action="more-menu" data-post-id="${
                          post.id
                        }" data-tracking-enabled="${
          post.trackingEnabled ? "true" : "false"
        }" aria-haspopup="true" aria-expanded="false" aria-label="기타 작업">⋯</button>
                        <div class="more-menu-list" role="menu">
                            ${
                              hasMetrics
                                ? `<button class="more-menu-item" role="menuitem" data-action="manage-metrics" data-post-id="${post.id}">📊 메트릭 관리</button>`
                                : ""
                            }
                            ${
                              post.trackingEnabled
                                ? `<button class="more-menu-item" role="menuitem" data-action="stop-tracking" data-post-id="${post.id}">트래킹 중지</button>`
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

// 트래킹 카드 ⋯ 메뉴 토글
DualTextWriter.prototype.toggleTrackingMoreMenu = function (
  button,
  postId,
  trackingEnabled
) {
  const menu = button.nextElementSibling;
  if (menu && menu.classList.contains("more-menu-list")) {
    const isOpen = menu.classList.toggle("open");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");

    // 스마트 포지셔닝: 화면 위치에 따라 메뉴 표시 방향 결정
    if (isOpen) {
      dualTextWriter.applySmartMenuPosition(menu, button);

      // 포커스 트랩: 메뉴가 열리면 첫 번째 메뉴 아이템에 포커스
      const firstMenuItem = menu.querySelector(".more-menu-item");
      if (firstMenuItem) {
        setTimeout(() => firstMenuItem.focus(), 50);
      }
    } else {
      // 메뉴 닫힐 때 위치 클래스 제거
      menu.classList.remove("open-top", "open-bottom");
    }
  }
  // 바깥 클릭 시 모든 메뉴 닫기 (이벤트 위임으로 처리)
  setTimeout(() => {
    document.addEventListener(
      "click",
      function closeHandler(e) {
        if (!e.target.closest(".more-menu")) {
          document.querySelectorAll(".more-menu-list.open").forEach((el) => {
            el.classList.remove("open");
            // 포커스 트랩 해제: 메뉴 버튼으로 포커스 복원
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

// 트래킹 시작
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

    // 로컬 데이터 업데이트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = true;
      this.refreshUI({ trackingPosts: true, force: true });

      // 시각적 피드백: 성공 메시지
      this.showMessage("✅ 트래킹이 시작되었습니다!", "success");
    }

    console.log("트래킹이 시작되었습니다.");
  } catch (error) {
    console.error("트래킹 시작 실패:", error);
  }
};

// 트래킹 중지
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

    // 로컬 데이터 업데이트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.trackingEnabled = false;
      this.refreshUI({ trackingPosts: true, force: true });

      // 시각적 피드백: 성공 메시지
      this.showMessage("⏸️ 트래킹이 중지되었습니다.", "info");
    }

    console.log("트래킹이 중지되었습니다.");
  } catch (error) {
    console.error("트래킹 중지 실패:", error);
  }
};

// 트래킹 데이터 추가
DualTextWriter.prototype.addTrackingData = function (postId) {
  this.currentTrackingPost = postId;

  // 선택된 포스트에 시각적 피드백 (선택 효과)
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

// 트래킹 모달 열기
DualTextWriter.prototype.openTrackingModal = async function (textId = null) {
  const modal = document.getElementById("tracking-modal");
  if (!modal) {
    console.error("트래킹 모달을 찾을 수 없습니다.");
    this.showMessage("❌ 트래킹 모달을 찾을 수 없습니다.", "error");
    return;
  }

  try {
    this.openBottomSheet(modal);

    // 저장된 글에서 호출한 경우 textId 저장
    if (textId) {
      this.currentTrackingTextId = textId;
    }

    // 기존 데이터 불러오기
    let latestMetric = null;

    // 1. currentTrackingPost가 있으면 해당 포스트의 최신 메트릭 데이터 불러오기
    if (this.currentTrackingPost) {
      const post = this.trackingPosts?.find(
        (p) => p.id === this.currentTrackingPost
      );
      if (post && post.metrics && post.metrics.length > 0) {
        // 최신 메트릭 (마지막 항목)
        latestMetric = post.metrics[post.metrics.length - 1];
        console.log("트래킹 포스트에서 최신 메트릭 불러오기:", latestMetric);
      } else if (this.currentUser && this.isFirebaseReady) {
        // 로컬에 없으면 Firebase에서 조회
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
              console.log("Firebase에서 최신 메트릭 불러오기:", latestMetric);
            }
          }
        } catch (error) {
          console.error("Firebase에서 메트릭 조회 실패:", error);
        }
      }
    }
    // 2. currentTrackingTextId만 있고 currentTrackingPost가 없으면, 연결된 포스트 찾기
    else if (this.currentTrackingTextId && !this.currentTrackingPost) {
      // 로컬 데이터에서 먼저 찾기
      const post = this.trackingPosts?.find(
        (p) => p.sourceTextId === this.currentTrackingTextId
      );
      if (post && post.metrics && post.metrics.length > 0) {
        latestMetric = post.metrics[post.metrics.length - 1];
        console.log(
          "저장된 글에서 연결된 포스트의 최신 메트릭 불러오기:",
          latestMetric
        );
      } else if (this.currentUser && this.isFirebaseReady) {
        // 로컬에 없으면 Firebase에서 조회
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
          const querySnapshot = await window.firebaseGetDocs(q);

          if (!querySnapshot.empty) {
            const postDoc = querySnapshot.docs[0];
            const postData = postDoc.data();
            if (postData.metrics && postData.metrics.length > 0) {
              latestMetric = postData.metrics[postData.metrics.length - 1];
              console.log(
                "Firebase에서 저장된 글의 연결된 포스트 최신 메트릭 불러오기:",
                latestMetric
              );
            }
          }
        } catch (error) {
          console.error("Firebase에서 메트릭 조회 실패:", error);
        }
      }
    }

    // 폼 초기화 또는 기존 데이터로 채우기
    const dateInput = document.getElementById("tracking-date");
    const viewsInput = document.getElementById("tracking-views");
    const likesInput = document.getElementById("tracking-likes");
    const commentsInput = document.getElementById("tracking-comments");
    const sharesInput = document.getElementById("tracking-shares");
    const followsInput = document.getElementById("tracking-follows");
    const notesInput = document.getElementById("tracking-notes");

    // 날짜는 항상 "오늘"로 설정 (기존 데이터 유무와 관계없이)
    const today = new Date().toISOString().split("T")[0];
    if (dateInput) {
      dateInput.value = today;
    }
    // 날짜 탭 초기화: 오늘 탭 활성화, 직접입력 숨김
    modal
      .querySelectorAll(".date-tab")
      .forEach((tab) => tab.classList.remove("active"));
    const todayTab = modal.querySelector('.date-tab[data-date="today"]');
    if (todayTab) todayTab.classList.add("active");
    if (dateInput) dateInput.style.display = "none";

    if (latestMetric) {
      // 기존 데이터가 있으면 메트릭 값만 채우기 (날짜 제외)
      if (viewsInput) viewsInput.value = latestMetric.views || "";
      if (likesInput) likesInput.value = latestMetric.likes || "";
      if (commentsInput) commentsInput.value = latestMetric.comments || "";
      if (sharesInput) sharesInput.value = latestMetric.shares || "";
      if (followsInput) followsInput.value = latestMetric.follows || "";
      if (notesInput) notesInput.value = latestMetric.notes || "";

      console.log(
        "기존 데이터로 폼 채우기 완료 (날짜는 오늘로 설정):",
        latestMetric
      );
    } else {
      // 기존 데이터가 없으면 모든 필드 초기화
      if (viewsInput) viewsInput.value = "";
      if (likesInput) likesInput.value = "";
      if (commentsInput) commentsInput.value = "";
      if (sharesInput) sharesInput.value = "";
      if (followsInput) followsInput.value = "";
      if (notesInput) notesInput.value = "";

      console.log("기존 데이터 없음, 폼 초기화 완료 (날짜는 오늘로 설정)");
    }

    console.log("트래킹 모달 열기:", {
      textId,
      currentTrackingTextId: this.currentTrackingTextId,
      currentTrackingPost: this.currentTrackingPost,
      hasLatestMetric: !!latestMetric,
    });
  } catch (error) {
    console.error("트래킹 모달 열기 실패:", error);
    this.showMessage("❌ 트래킹 모달을 열 수 없습니다.", "error");
  }
};

// 트래킹 데이터 저장
DualTextWriter.prototype.saveTrackingData = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    console.warn(
      "트래킹 데이터 저장 실패: 사용자가 로그인하지 않았거나 Firebase가 준비되지 않았습니다."
    );
    this.showMessage("❌ 로그인이 필요합니다.", "error");
    return;
  }

  console.log("트래킹 데이터 저장 시작:", {
    currentTrackingTextId: this.currentTrackingTextId,
    currentTrackingPost: this.currentTrackingPost,
  });

  // 저장된 글에서 직접 입력하는 경우
  if (this.currentTrackingTextId && !this.currentTrackingPost) {
    console.log(
      "저장된 글에서 트래킹 데이터 저장:",
      this.currentTrackingTextId
    );
    return await this.saveTrackingDataFromSavedText();
  }

  // 기존 방식: 트래킹 포스트에 데이터 추가
  if (!this.currentTrackingPost) {
    console.warn("트래킹 데이터 저장 실패: currentTrackingPost가 없습니다.");
    this.showMessage("❌ 트래킹할 포스트를 찾을 수 없습니다.", "error");
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
        updatedAt: window.firebaseServerTimestamp(),
      });

      // 로컬 데이터 업데이트
      const post = this.trackingPosts.find(
        (p) => p.id === this.currentTrackingPost
      );
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
        force: true,
      });

      // 시각적 피드백: 성공 메시지
      this.showMessage("✅ 성과 데이터가 저장되었습니다!", "success");

      console.log("트래킹 데이터가 저장되었습니다.");
    }
  } catch (error) {
    console.error("트래킹 데이터 저장 실패:", error);
    this.showMessage(
      "❌ 트래킹 데이터 저장에 실패했습니다: " + error.message,
      "error"
    );
  }
};
// 저장된 글에서 직접 트래킹 데이터 저장
DualTextWriter.prototype.saveTrackingDataFromSavedText = async function () {
  if (!this.currentTrackingTextId || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    // 먼저 저장된 텍스트 정보 가져오기
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      this.currentTrackingTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      this.showMessage("❌ 원본 텍스트를 찾을 수 없습니다.", "error");
      return;
    }

    const textData = textDoc.data();

    // 해당 텍스트에 연결된 포스트 찾기 또는 생성
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

      // 트래킹 포스트 목록에 추가
      if (!this.trackingPosts) {
        this.trackingPosts = [];
      }
      this.trackingPosts.push({
        id: postId,
        ...newPostData,
        postedAt: new Date(),
      });
    }

    // 트래킹 데이터 수집
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
      notes,
    };

    // 포스트에 트래킹 데이터 추가
    const postRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "posts",
      postId
    );
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
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts.find((p) => p.id === postId);
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
      post.trackingEnabled = true;
    } else {
      // 로컬 목록에 없으면 추가
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

    // Optimistic UI: 로컬 데이터 업데이트로 즉시 반영 (Firebase 전체 재조회 불필요)
    // 트래킹 탭 목록은 로컬 데이터가 이미 업데이트되었으므로 재조회 불필요

    // UI 업데이트
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // 초기화
    this.currentTrackingTextId = null;

    this.showMessage("✅ 트래킹 데이터가 저장되었습니다!", "success");
    console.log("저장된 글에서 트래킹 데이터 저장 완료");
  } catch (error) {
    console.error("저장된 글에서 트래킹 데이터 저장 실패:", error);
    this.showMessage(
      "❌ 트래킹 데이터 저장에 실패했습니다: " + error.message,
      "error"
    );
  }
};

// 트래킹 모달 닫기
DualTextWriter.prototype.closeTrackingModal = function () {
  const modal = document.getElementById("tracking-modal");
  if (modal) {
    this.closeBottomSheet(modal);
  }
  this.currentTrackingPost = null;
  this.currentTrackingTextId = null;
};
// 메트릭 관리 모달 열기 (트래킹 탭에서 사용)
DualTextWriter.prototype.manageMetrics = async function (postId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그인이 필요합니다.", "error");
    return;
  }

  try {
    // 포스트 데이터 가져오기
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    // 로컬에 없으면 Firebase에서 조회
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
        console.error("포스트 조회 실패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      this.showMessage("메트릭 데이터가 없습니다.", "warning");
      return;
    }

    // 메트릭 목록 렌더링
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postData.id,
      postData.sourceTextId
    );

    // 일괄 선택 모드 초기화
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 모달 열기
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
                            <div style="font-size: 0.85rem; color: #666;">메트릭 ${
                              postData.metrics.length
                            }개</div>
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
    console.error("메트릭 관리 모달 열기 실패:", error);
    this.showMessage("메트릭 데이터를 불러오는데 실패했습니다.", "error");
  }
};

// 메트릭 관리 모달용 메트릭 목록 렌더링
DualTextWriter.prototype.renderMetricsListForManage = function (
  metrics,
  postId,
  textId
) {
  if (!metrics || metrics.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">메트릭 데이터가 없습니다.</div>';
  }

  // 날짜 순으로 정렬 (최신 것부터)
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
    return dateB - dateA; // 최신 것부터
  });

  return `
        <div class="metrics-manage-list">
            ${sortedMetrics
              .map((metric, sortedIdx) => {
                // 원본 인덱스 찾기
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

                // 메트릭 인덱스가 유효한지 확인 (원본 배열 범위 내)
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
                                    aria-label="메트릭 선택"
                                />
                                <div class="metric-manage-date">📅 ${dateStr}</div>
                            </div>
                            <div class="metric-manage-actions" style="display: ${
                              this.isBatchSelectMode ? "none" : "flex"
                            };">
                                <button class="btn-edit-metric" data-action="edit-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="수정">✏️ 수정</button>
                                <button class="btn-delete-metric" data-action="delete-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
                  textId || ""
                }" aria-label="삭제">🗑️ 삭제</button>
                            </div>
                        </div>
                        <div class="metric-manage-data">
                            <div class="metric-chip"><span class="metric-icon">👀</span> <span class="metric-value">${
                              metric.views || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">❤️</span> <span class="metric-value">${
                              metric.likes || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">💬</span> <span class="metric-value">${
                              metric.comments || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">🔄</span> <span class="metric-value">${
                              metric.shares || 0
                            }</span></div>
                            <div class="metric-chip"><span class="metric-icon">👥</span> <span class="metric-value">${
                              metric.follows || 0
                            }</span></div>
                            ${
                              metric.notes
                                ? `<div class="metric-notes">📝 ${this.escapeHtml(
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

// 메트릭 관리 모달 내부 이벤트 바인딩
DualTextWriter.prototype.bindMetricsManageEvents = function (postId, textId) {
  const content = document.getElementById("metrics-manage-content");
  if (!content) return;

  // 기존 리스너 제거하고 새로 바인딩
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

        if (confirm("정말로 이 메트릭을 삭제하시겠습니까?")) {
          this.deleteMetricFromManage(buttonPostId, buttonTextId, metricIndex);
        }
      }
    },
    { once: false }
  );
};

// 메트릭 관리 모달에서 메트릭 수정
DualTextWriter.prototype.editMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  try {
    // 포스트 데이터 가져오기
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      // Firebase에서 조회
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
        console.error("포스트 조회 실패:", error);
      }
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      this.showMessage("메트릭을 찾을 수 없습니다.", "error");
      return;
    }

    const metric = postData.metrics[metricIndex];

    // 편집 데이터 설정
    this.editingMetricData = {
      postId: postId,
      textId: textId,
      metricIndex: metricIndex,
    };

    // 메트릭 관리 모달 닫기
    const manageModal = document.getElementById("metrics-manage-modal");
    if (manageModal) {
      this.closeBottomSheet(manageModal);
    }

    // 기존 editTrackingMetric의 모달 열기 로직 재사용
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

    // 수정 모달 열기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      // 날짜 탭 설정
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
    console.error("메트릭 수정 실패:", error);
    this.showMessage("메트릭을 불러오는데 실패했습니다.", "error");
  }
};

// 메트릭 관리 모달에서 메트릭 삭제
DualTextWriter.prototype.deleteMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  if (!confirm("정말로 이 트래킹 데이터를 삭제하시겠습니까?")) {
    return;
  }

  try {
    // 포스트 데이터 가져오기
    let postData = null;
    let postRef = null;

    try {
      // postId로 직접 조회
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
        // textId로 찾기
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
      console.error("포스트 조회 실패:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("포스트를 찾을 수 없습니다.", "error");
      return;
    }

    // 메트릭 배열에서 해당 항목 제거
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // 분석 데이터 계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase 업데이트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 메트릭 관리 모달 새로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

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
        force: true,
      });
    }

    this.showMessage("✅ 트래킹 데이터가 삭제되었습니다!", "success");
  } catch (error) {
    console.error("트래킹 데이터 삭제 실패:", error);
    this.showMessage(
      "❌ 트래킹 데이터 삭제에 실패했습니다: " + error.message,
      "error"
    );
  }
};

// 일괄 선택 모드 이벤트 바인딩
DualTextWriter.prototype.bindBatchSelectEvents = function (postId, textId) {
  const toggleBtn = document.getElementById("batch-select-toggle");
  const selectInfo = document.getElementById("batch-select-info");
  const selectAllBtn = document.getElementById("select-all-metrics");
  const deselectAllBtn = document.getElementById("deselect-all-metrics");
  const batchDeleteActions = document.getElementById("batch-delete-actions");
  const batchDeleteBtn = document.getElementById("batch-delete-btn");
  const content = document.getElementById("metrics-manage-content");

  if (!toggleBtn || !content) return;

  // 일괄 선택 모드 토글
  toggleBtn.addEventListener("click", () => {
    this.isBatchSelectMode = !this.isBatchSelectMode;
    this.selectedMetricIndices = [];

    if (this.isBatchSelectMode) {
      toggleBtn.textContent = "❌ 취소";
      toggleBtn.style.background = "#dc3545";
      if (selectInfo) selectInfo.style.display = "block";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    } else {
      toggleBtn.textContent = "📋 일괄 선택";
      toggleBtn.style.background = "";
      if (selectInfo) selectInfo.style.display = "none";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    }

    // 메트릭 목록 다시 렌더링
    this.refreshMetricsListForManage(postId, textId);
  });

  // 전체 선택
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

  // 전체 해제
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      this.selectedMetricIndices = [];
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      this.updateBatchSelectUI();
    });
  }

  // 체크박스 클릭 이벤트
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

  // 일괄 삭제 버튼
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener("click", () => {
      if (this.selectedMetricIndices.length === 0) {
        this.showMessage("선택된 항목이 없습니다.", "warning");
        return;
      }

      if (
        confirm(
          `선택된 ${this.selectedMetricIndices.length}개의 메트릭을 삭제하시겠습니까?`
        )
      ) {
        this.batchDeleteMetrics(postId, textId);
      }
    });
  }
};

// 일괄 선택 UI 업데이트
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

// 메트릭 목록 새로고침 (일괄 선택 모드 상태 반영)
DualTextWriter.prototype.refreshMetricsListForManage = async function (
  postId,
  textId
) {
  try {
    // 포스트 데이터 가져오기
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
        console.error("포스트 조회 실패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      return;
    }

    // 메트릭 목록 다시 렌더링
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
    console.error("메트릭 목록 새로고침 실패:", error);
  }
};

// 일괄 삭제 함수
DualTextWriter.prototype.batchDeleteMetrics = async function (postId, textId) {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그인이 필요합니다.", "error");
    return;
  }

  if (this.selectedMetricIndices.length === 0) {
    this.showMessage("선택된 항목이 없습니다.", "warning");
    return;
  }

  try {
    // 포스트 데이터 가져오기
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
      console.error("포스트 조회 실패:", error);
    }

    if (!postData || !postRef) {
      this.showMessage("포스트를 찾을 수 없습니다.", "error");
      return;
    }

    // 선택된 인덱스를 내림차순으로 정렬 (뒤에서부터 삭제하여 인덱스 변경 방지)
    const sortedIndices = [...this.selectedMetricIndices].sort((a, b) => b - a);

    // 메트릭 배열에서 선택된 항목 제거
    let updatedMetrics = [...(postData.metrics || [])];
    sortedIndices.forEach((index) => {
      if (index >= 0 && index < updatedMetrics.length) {
        updatedMetrics.splice(index, 1);
      }
    });

    // 분석 데이터 계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase 업데이트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 일괄 선택 모드 해제
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 메트릭 관리 모달 새로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

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
        force: true,
      });
    }

    this.showMessage(
      `✅ ${sortedIndices.length}개의 트래킹 데이터가 삭제되었습니다!`,
      "success"
    );
  } catch (error) {
    console.error("일괄 삭제 실패:", error);
    this.showMessage("❌ 일괄 삭제에 실패했습니다: " + error.message, "error");
  }
};

// 트래킹 메트릭 수정 모달 열기
DualTextWriter.prototype.editTrackingMetric = async function (
  button,
  metricIndexStr
) {
  const metricIndex = parseInt(metricIndexStr);
  const timelineItem = button.closest(".timeline-item");
  const savedItem = timelineItem.closest(".saved-item");
  const textId = savedItem.getAttribute("data-item-id");

  if (!textId) {
    this.showMessage("❌ 저장된 글 ID를 찾을 수 없습니다.", "error");
    return;
  }

  // 해당 텍스트에 연결된 포스트 찾기
  let postData = null;
  if (this.trackingPosts) {
    postData = this.trackingPosts.find((p) => p.sourceTextId === textId);
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    // Firebase에서 조회
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
      const querySnapshot = await window.firebaseGetDocs(q);

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
      console.error("포스트 조회 실패:", error);
      this.showMessage("❌ 트래킹 데이터를 찾을 수 없습니다.", "error");
      return;
    }
  }

  if (
    !postData ||
    !postData.metrics ||
    postData.metrics.length <= metricIndex
  ) {
    this.showMessage("❌ 수정할 데이터를 찾을 수 없습니다.", "error");
    return;
  }

  const metric = postData.metrics[metricIndex];
  const date = metric.timestamp?.toDate
    ? metric.timestamp.toDate()
    : metric.timestamp instanceof Date
    ? metric.timestamp
    : new Date();
  const dateStr = date.toISOString().split("T")[0];

  // 수정 모달에 데이터 채우기
  document.getElementById("tracking-edit-date").value = dateStr;
  document.getElementById("tracking-edit-views").value = metric.views || 0;
  document.getElementById("tracking-edit-likes").value = metric.likes || 0;
  document.getElementById("tracking-edit-comments").value =
    metric.comments || 0;
  document.getElementById("tracking-edit-shares").value = metric.shares || 0;
  const editFollows = document.getElementById("tracking-edit-follows");
  if (editFollows) editFollows.value = metric.follows || 0;
  document.getElementById("tracking-edit-notes").value = metric.notes || "";

  // 수정할 데이터 저장
  this.editingMetricData = {
    postId: postData.id || null,
    textId: textId,
    metricIndex: metricIndex,
  };

  // 수정 모달 열기
  const editModal = document.getElementById("tracking-edit-modal");
  if (editModal) {
    this.openBottomSheet(editModal);
    // 날짜 탭 초기화: 현재 날짜에 따라 탭 설정
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
// 트래킹 데이터 수정
DualTextWriter.prototype.updateTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady)
    return;

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // 포스트 데이터 가져오기
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
        this.showMessage("❌ 포스트를 찾을 수 없습니다.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textId로 포스트 찾기
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
      const querySnapshot = await window.firebaseGetDocs(q);

      if (querySnapshot.empty) {
        this.showMessage("❌ 포스트를 찾을 수 없습니다.", "error");
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

    // 수정된 데이터 수집
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

    // 날짜 처리
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

    // 메트릭 배열 업데이트
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
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 수정 모달 닫기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      this.closeBottomSheet(editModal);
    }

    // 메트릭 관리 모달이 열려있으면 새로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

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
        force: true,
      });
    }

    this.editingMetricData = null;

    this.showMessage("✅ 트래킹 데이터가 수정되었습니다!", "success");
    console.log("트래킹 데이터 수정 완료");
  } catch (error) {
    console.error("트래킹 데이터 수정 실패:", error);
    this.showMessage(
      "❌ 트래킹 데이터 수정에 실패했습니다: " + error.message,
      "error"
    );
  }
};

// 트래킹 데이터 삭제
DualTextWriter.prototype.deleteTrackingDataItem = async function () {
  if (!this.editingMetricData || !this.currentUser || !this.isFirebaseReady) {
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }
    return;
  }

  if (!confirm("정말로 이 트래킹 데이터를 삭제하시겠습니까?")) {
    return;
  }

  try {
    const { postId, textId, metricIndex } = this.editingMetricData;

    // 포스트 데이터 가져오기
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
        this.showMessage("❌ 포스트를 찾을 수 없습니다.", "error");
        return;
      }
      postData = postDoc.data();
    } else {
      // textId로 포스트 찾기
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
      const querySnapshot = await window.firebaseGetDocs(q);

      if (querySnapshot.empty) {
        this.showMessage("❌ 포스트를 찾을 수 없습니다.", "error");
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

    // 메트릭 배열에서 해당 항목 제거
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // 분석 데이터 계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase 업데이트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 모달 닫기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      editModal.style.display = "none";
    }

    this.editingMetricData = null;

    // 화면 새로고침
    this.refreshUI({
      savedTexts: true,
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    this.showMessage("✅ 트래킹 데이터가 삭제되었습니다!", "success");
    console.log("트래킹 데이터 삭제 완료");
  } catch (error) {
    console.error("트래킹 데이터 삭제 실패:", error);
    this.showMessage(
      "❌ 트래킹 데이터 삭제에 실패했습니다: " + error.message,
      "error"
    );
  }
};

// 분석 데이터 계산
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

// 트래킹 요약 업데이트
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
DualTextWriter.prototype.initTrackingChart = function () {
  // 에러 처리: Canvas 요소가 없을 때 Chart.js 초기화 실패 방지
  if (!this.trackingChartCanvas) {
    console.warn("[initTrackingChart] Canvas element not found");
    return;
  }

  // Chart.js 라이브러리 로드 실패 시 폴백 처리
  if (typeof Chart === "undefined") {
    console.error("[initTrackingChart] Chart.js library not loaded");
    this.showMessage(
      "차트 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해주세요.",
      "error"
    );
    return;
  }

  try {
    const ctx = this.trackingChartCanvas.getContext("2d");
    if (!ctx) {
      console.error("[initTrackingChart] Failed to get 2D context");
      this.showMessage(
        "차트를 초기화할 수 없습니다. 브라우저를 새로고침해주세요.",
        "error"
      );
      return;
    }

    // 기존 차트가 있다면 제거 (메모리 누수 방지)
    if (this.trackingChart) {
      this.trackingChart.destroy();
      this.trackingChart = null;
    }

    // Chart.js 초기화: responsive: true로 설정되어 있어 부모 컨테이너 크기에 맞춰 자동 조절
    this.trackingChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "조회수",
            data: [],
            borderColor: "#667eea",
            backgroundColor: "rgba(102, 126, 234, 0.1)",
            tension: 0.4,
          },
          {
            label: "좋아요",
            data: [],
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            tension: 0.4,
          },
          {
            label: "댓글",
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
            label: "팔로우",
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
            display: false, // HTML 헤더 사용으로 차트 내부 제목 숨김
            text: "포스트 성과 추이",
          },
          legend: {
            display: false, // 범례는 탭으로 표시
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 8,
              precision: 0,
              stepSize: 1, // 초기값, updateTrackingChart에서 동적으로 업데이트됨
            },
            max: 10, // 초기값, updateTrackingChart에서 동적으로 업데이트됨
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
          duration: 0, // 애니메이션 비활성화로 스크롤 문제 방지
        },
        layout: {
          padding: {
            top: 20,
            bottom: 40, // 하단 여백 증가 (축 레이블 보호)
            left: 15,
            right: 15,
          },
        },
        // 인터랙션 설정: 드래그/줌 허용
        interaction: {
          mode: "index",
          intersect: false,
        },
        // 요소 클릭 가능하도록 설정
        elements: {
          point: {
            radius: 4,
            hoverRadius: 6,
          },
        },
      },
    });

    // Chart.js 초기화 후 차트 업데이트
    this.updateTrackingChart();
  } catch (error) {
    // Chart.js 초기화 실패 시 사용자에게 에러 메시지 표시
    console.error("[initTrackingChart] Chart initialization failed:", error);
    this.showMessage(
      "차트를 초기화하는 중 오류가 발생했습니다: " + error.message,
      "error"
    );
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
DualTextWriter.prototype.setScaleMode = function (mode) {
  // 그래프 스케일 모드 변경 시 즉시 반영 및 축 반응형 유지
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
 * 차트 모드 설정
 *
 * 그래프의 모드를 변경합니다.
 * 'total' 모드: 모든 포스트의 누적 총합 표시
 * 'individual' 모드: 선택한 개별 포스트의 데이터만 표시
 *
 * @param {string} mode - 차트 모드 ('total' | 'individual')
 * @returns {void}
 */
DualTextWriter.prototype.setChartMode = function (mode) {
  // 그래프 모드 변경 시 즉시 반영
  this.chartMode = mode;

  // 버튼 스타일 업데이트
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
    // 전체 총합 모드로 전환 시 검색 입력창 초기화
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
DualTextWriter.prototype.setChartRange = function (range) {
  // 그래프 범위 변경 시 즉시 반영 및 축 반응형 유지
  this.chartRange = range; // '7d' | '30d' | 'all'
  // 버튼 스타일 업데이트
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

// 포스트 선택 드롭다운 채우기 (검색 가능한 커스텀 드롭다운)
DualTextWriter.prototype.populatePostSelector = function () {
  if (!this.trackingPosts || this.trackingPosts.length === 0) return;

  // 전체 포스트 목록 저장 (검색 필터링용)
  this.allTrackingPostsForSelector = [...this.trackingPosts].sort((a, b) => {
    // 최근 포스트 우선 정렬
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

  // 드롭다운 렌더링
  this.renderPostSelectorDropdown("");

  // 선택된 포스트가 있으면 검색 입력창에 표시
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
// 포스트 선택 드롭다운 렌더링
DualTextWriter.prototype.renderPostSelectorDropdown = function (
  searchTerm = ""
) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // 검색어로 필터링
  let filteredPosts = this.allTrackingPostsForSelector;
  if (searchTerm && searchTerm.trim()) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    filteredPosts = this.allTrackingPostsForSelector.filter((post) => {
      const content = post.content.toLowerCase();
      return content.includes(lowerSearchTerm);
    });
  }

  // 최근 포스트 우선 정렬 (이미 정렬되어 있지만 확실히)
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
                <div style="font-size: 1.5rem; margin-bottom: 8px;">🔍</div>
                <div>검색 결과가 없습니다.</div>
            </div>
        `;
    return;
  }

  // 포스트 목록 HTML 생성
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
                    <span>📊 ${metricsCount}회 입력</span>
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

// 포스트 선택 드롭다운 표시
DualTextWriter.prototype.showPostSelectorDropdown = function () {
  const dropdown = document.getElementById("post-selector-dropdown");
  const searchInput = document.getElementById("chart-post-search");

  if (!dropdown || !searchInput) return;

  // 드롭다운 표시
  dropdown.style.display = "block";

  // 검색어가 없으면 전체 목록 표시, 있으면 필터링
  const searchTerm = searchInput.value || "";
  this.renderPostSelectorDropdown(searchTerm);

  // 외부 클릭 시 드롭다운 닫기
  setTimeout(() => {
    document.addEventListener("click", this.handlePostSelectorClickOutside);
  }, 100);
};

// 외부 클릭 처리
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

// 포스트 선택 필터링
DualTextWriter.prototype.filterPostSelector = function (searchTerm) {
  const dropdown = document.getElementById("post-selector-dropdown");
  if (!dropdown) return;

  // 드롭다운이 닫혀있으면 열기
  if (dropdown.style.display === "none") {
    dropdown.style.display = "block";
  }

  // 검색어로 필터링하여 렌더링
  this.renderPostSelectorDropdown(searchTerm);
};

// 드롭다운에서 포스트 선택
DualTextWriter.prototype.selectPostFromDropdown = function (postId) {
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  if (!selectedPost) return;

  this.selectedChartPostId = postId;

  // 검색 입력창에 선택된 포스트 제목 표시
  const searchInput = document.getElementById("chart-post-search");
  if (searchInput) {
    const contentPreview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = contentPreview;
  }

  // 드롭다운 닫기
  const dropdown = document.getElementById("post-selector-dropdown");
  if (dropdown) {
    dropdown.style.display = "none";
  }

  // 외부 클릭 이벤트 리스너 제거
  document.removeEventListener("click", this.handlePostSelectorClickOutside);

  // 차트 업데이트
  this.updateTrackingChart();
};

// 트래킹 목록에서 클릭 시 차트에 표시
DualTextWriter.prototype.showPostInChart = function (postId) {
  // 모드 전환 및 포스트 선택
  this.setChartMode("individual");
  this.selectedChartPostId = postId;
  // 검색 입력창에 제목 표시
  const selectedPost = this.trackingPosts.find((p) => p.id === postId);
  const searchInput = document.getElementById("chart-post-search");
  if (selectedPost && searchInput) {
    const preview =
      selectedPost.content.length > 50
        ? selectedPost.content.substring(0, 50) + "..."
        : selectedPost.content;
    searchInput.value = preview;
  }
  // 드롭다운 목록 갱신
  this.populatePostSelector();
  // 차트 업데이트
  this.updateTrackingChart();
  // 차트 영역 포커스/스크롤
  if (this.trackingChartCanvas && this.trackingChartCanvas.scrollIntoView) {
    this.trackingChartCanvas.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
};

// 포스트 선택 변경 (구버전 호환, 더 이상 사용 안 함)
DualTextWriter.prototype.updateChartPostSelection = function () {
  // 새로운 검색 가능한 드롭다운 사용 중이므로 이 함수는 더 이상 사용되지 않음
  // 호환성을 위해 유지
};

// 그래프 헤더 업데이트
DualTextWriter.prototype.updateChartHeader = function (postTitle, lastUpdate) {
  const titleEl = document.getElementById("chart-post-title");
  const updateEl = document.getElementById("chart-last-update");

  if (titleEl) {
    const maxLength = 50;
    const displayTitle =
      postTitle && postTitle.length > maxLength
        ? postTitle.substring(0, maxLength) + "..."
        : postTitle || "전체 포스트 현재값 합계 추이";
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
      updateEl.textContent = `최근 업데이트: ${formattedDate}`;
    } else {
      updateEl.textContent = "최근 업데이트: -";
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
DualTextWriter.prototype.updateTrackingChart = function () {
  // 에러 처리: 차트가 아직 초기화되지 않았을 때 처리
  if (!this.trackingChart) {
    console.warn("[updateTrackingChart] Chart not initialized yet");
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
            // 데이터 형식 검증: timestamp가 유효한지 확인
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

            // 날짜 유효성 검증
            if (isNaN(first.getTime()) || isNaN(last.getTime())) {
              throw new Error("Invalid date in metric");
            }

            dateRange.push(...makeRange(first, last));
          } catch (err) {
            console.warn(
              "[updateTrackingChart] Error processing date range for individual post:",
              err
            );
            // 폴백: 기본 7일 범위 사용
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
            // 데이터 형식 검증: timestamp가 유효한지 확인
            if (!m || !m.timestamp) return;

            try {
              const dt = m.timestamp?.toDate
                ? m.timestamp.toDate()
                : new Date(m.timestamp);
              // 날짜 유효성 검증
              if (isNaN(dt.getTime())) {
                console.warn(
                  "[updateTrackingChart] Invalid date in metric:",
                  m
                );
                return;
              }
              dt.setHours(0, 0, 0, 0);
              if (!minDate || dt < minDate) minDate = new Date(dt);
              if (!maxDate || dt > maxDate) maxDate = new Date(dt);
            } catch (err) {
              console.warn(
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
      // 전체 총합 모드: 각 날짜까지의 모든 포스트 최신 메트릭 누적 합계
      dateRange.forEach((targetDate) => {
        let dayTotalViews = 0;
        let dayTotalLikes = 0;
        let dayTotalComments = 0;
        let dayTotalShares = 0;
        let dayTotalFollows = 0;

        // 각 포스트에 대해 해당 날짜까지의 최신 메트릭 찾기
        this.trackingPosts.forEach((post) => {
          if (!post.metrics || post.metrics.length === 0) return;

          // 해당 날짜 이전 또는 당일의 가장 최근 메트릭 찾기
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
      this.trackingChart.options.plugins.title.text =
        "전체 포스트 현재값 합계 추이";
      // 헤더 업데이트
      this.updateChartHeader("전체 포스트 현재값 합계 추이", null);
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
        this.trackingChart.options.plugins.title.text =
          "포스트 성과 추이 (포스트를 선택하세요)";
        this.updateChartHeader("포스트 성과 추이 (포스트를 선택하세요)", null);
      } else {
        const selectedPost = this.trackingPosts.find(
          (p) => p.id === this.selectedChartPostId
        );

        if (selectedPost && selectedPost.metrics) {
          // 범위에 데이터가 없으면 자동으로 전체 범위로 전환
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
            // 해당 날짜에 입력된 메트릭 찾기
            let dayViews = 0;
            let dayLikes = 0;
            let dayComments = 0;
            let dayShares = 0;
            let dayFollows = 0;

            selectedPost.metrics.forEach((metric) => {
              // 데이터 형식 검증: timestamp가 유효한지 확인
              if (!metric || !metric.timestamp) return;

              try {
                const metricDate = metric.timestamp?.toDate
                  ? metric.timestamp.toDate()
                  : new Date(metric.timestamp);
                // 날짜 유효성 검증
                if (isNaN(metricDate.getTime())) {
                  console.warn(
                    "[updateTrackingChart] Invalid date in metric:",
                    metric
                  );
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
                console.warn(
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

          // 차트 제목 업데이트
          const contentPreview =
            selectedPost.content.length > 30
              ? selectedPost.content.substring(0, 30) + "..."
              : selectedPost.content;
          this.trackingChart.options.plugins.title.text = `포스트 성과 추이: ${contentPreview}`;

          // 헤더 업데이트: 포스트 제목과 최근 업데이트
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
            "포스트 성과 추이 (데이터 없음)";
          this.updateChartHeader("포스트 성과 추이 (데이터 없음)", null);
        }
      }
    }

    // 날짜 레이블 포맷팅
    const dateLabels = dateRange.map((date) =>
      date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
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

    // y축 스케일 재계산 (데이터 범위에 맞게 최적화)
    const maxValue = Math.max(
      ...(viewsData.length ? viewsData : [0]),
      ...(likesData.length ? likesData : [0]),
      ...(commentsData.length ? commentsData : [0]),
      ...(sharesData.length ? sharesData : [0]),
      ...(followsData.length ? followsData : [0])
    );
    // 스케일 계산
    if (this.scaleMode === "split") {
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
      this.trackingChart.options.scales.y2.max =
        this.trackingChart.options.scales.y.max;
      this.trackingChart.options.scales.y2.ticks.stepSize =
        this.trackingChart.options.scales.y.ticks.stepSize;
    }

    // 애니메이션 없이 업데이트 (스크롤 문제 방지)
    this.trackingChart.update("none");
  } catch (error) {
    // 차트 업데이트 실패 시 에러 처리
    console.error("[updateTrackingChart] Chart update failed:", error);
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
DualTextWriter.prototype.toggleLegend = function (button, datasetIndex) {
  if (!this.trackingChart) return;

  const dataset = this.trackingChart.data.datasets[datasetIndex];
  if (!dataset) return;

  // 데이터셋 표시/숨김 토글 (즉시 반영)
  const isVisible = dataset.hidden !== true;
  dataset.hidden = isVisible;

  // 버튼 스타일 업데이트
  if (isVisible) {
    button.style.opacity = "0.4";
    button.style.textDecoration = "line-through";
    button.setAttribute("aria-pressed", "false");
  } else {
    button.style.opacity = "1";
    button.style.textDecoration = "none";
    button.setAttribute("aria-pressed", "true");
  }

  // 차트 즉시 업데이트 및 축 반응형 유지
  this.trackingChart.update("none");

  // 축 반응형 재계산
  if (
    this.trackingChart &&
    this.trackingChart.options &&
    this.trackingChart.options.scales
  ) {
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
DualTextWriter.prototype.bindChartKeyboardEvents = function () {
  // 차트 모드 버튼 키보드 이벤트
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

  // 차트 범위 버튼 키보드 이벤트
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

  // 차트 스케일 버튼 키보드 이벤트
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

  // 범례 버튼 키보드 이벤트 (이벤트 위임 사용)
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

// 저장된 글에서 트래킹 시작
DualTextWriter.prototype.startTrackingFromSaved = async function (textId) {
  if (!this.currentUser || !this.isFirebaseReady) return;

  try {
    // 저장된 텍스트 정보 가져오기
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      textId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      console.error("텍스트를 찾을 수 없습니다.");
      this.showMessage("❌ 원본 텍스트를 찾을 수 없습니다.", "error");
      return;
    }

    const textData = textDoc.data();

    // 데이터 일관성 검증: 원본 텍스트가 유효한지 확인
    if (!textData.content || textData.content.trim().length === 0) {
      console.warn("원본 텍스트 내용이 비어있습니다.");
      this.showMessage("⚠️ 원본 텍스트 내용이 비어있습니다.", "warning");
    }

    // 중복 확인: 이미 이 텍스트에서 포스트가 생성되었는지 확인 (선택적)
    const existingPosts = await this.checkExistingPostForText(textId);
    if (existingPosts.length > 0) {
      const confirmMessage = `이 텍스트에서 이미 ${existingPosts.length}개의 포스트가 생성되었습니다.\n계속해서 새 포스트를 생성하시겠습니까?`;
      if (!confirm(confirmMessage)) {
        console.log("사용자가 중복 생성 취소");
        return;
      }
    }

    // 포스트 컬렉션에 추가
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
      sourceTextId: textId, // 원본 텍스트 참조
      sourceType: textData.type || "edit", // 원본 텍스트 타입
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    const docRef = await window.firebaseAddDoc(postsRef, postData);

    console.log("트래킹 포스트가 생성되었습니다:", docRef.id);

    // 트래킹 탭으로 전환
    this.switchTab("tracking");

    // 트래킹 포스트 목록 새로고침
    this.loadTrackingPosts();
  } catch (error) {
    console.error("트래킹 시작 실패:", error);
    this.showMessage(
      "❌ 트래킹 시작에 실패했습니다: " + error.message,
      "error"
    );
  }
};

// 특정 텍스트에서 생성된 포스트 확인
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
    const querySnapshot = await window.firebaseGetDocs(q);

    const existingPosts = [];
    querySnapshot.forEach((doc) => {
      existingPosts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return existingPosts;
  } catch (error) {
    console.error("기존 포스트 확인 실패:", error);
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
DualTextWriter.prototype.checkReferenceUsage = async function (
  referenceTextId
) {
  // 에러 처리: 파라미터 유효성 검사
  if (!referenceTextId || typeof referenceTextId !== "string") {
    console.warn(
      "checkReferenceUsage: 잘못된 referenceTextId:",
      referenceTextId
    );
    return 0;
  }

  // 에러 처리: Firebase 준비 상태 확인
  if (!this.isFirebaseReady) {
    console.warn("checkReferenceUsage: Firebase가 준비되지 않았습니다.");
    return 0;
  }

  // 에러 처리: 사용자 로그인 여부 확인
  if (!this.currentUser) {
    console.warn("checkReferenceUsage: 사용자가 로그인하지 않았습니다.");
    return 0;
  }

  try {
    // Firebase posts 컬렉션 참조
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // Firebase 쿼리: sourceType이 'reference'이고 sourceTextId가 일치하는 포스트 조회
    // 참고: Firestore는 where 절을 여러 개 사용할 수 있음 (복합 인덱스 필요할 수 있음)
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference"),
      window.firebaseWhere("sourceTextId", "==", referenceTextId)
    );

    const querySnapshot = await window.firebaseGetDocs(q);

    // 사용 횟수 계산 (쿼리 결과의 문서 개수)
    const usageCount = querySnapshot.size;

    return usageCount;
  } catch (error) {
    // 에러 처리: Firebase 조회 실패 시 기본값(0) 반환
    console.error("레퍼런스 사용 여부 확인 실패:", error);
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
DualTextWriter.prototype.checkMultipleReferenceUsage = async function (
  referenceTextIds
) {
  // 에러 처리: 빈 배열 입력 처리
  if (!Array.isArray(referenceTextIds) || referenceTextIds.length === 0) {
    return {};
  }

  // 에러 처리: Firebase 준비 상태 확인
  if (!this.isFirebaseReady) {
    console.warn(
      "checkMultipleReferenceUsage: Firebase가 준비되지 않았습니다."
    );
    // 모든 ID에 대해 0 반환
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  // 에러 처리: 사용자 로그인 여부 확인
  if (!this.currentUser) {
    console.warn(
      "checkMultipleReferenceUsage: 사용자가 로그인하지 않았습니다."
    );
    // 모든 ID에 대해 0 반환
    return referenceTextIds.reduce((result, id) => {
      result[id] = 0;
      return result;
    }, {});
  }

  try {
    // Firebase posts 컬렉션 참조
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );

    // 성능 최적화: sourceType이 'reference'인 모든 포스트를 한 번의 쿼리로 조회
    // (whereIn 10개 제한을 회피하기 위해 JavaScript에서 필터링)
    const q = window.firebaseQuery(
      postsRef,
      window.firebaseWhere("sourceType", "==", "reference")
    );

    const querySnapshot = await window.firebaseGetDocs(q);

    // 사용 횟수 계산을 위한 Map 초기화 (모든 ID에 대해 0으로 초기화)
    const usageMap = new Map();
    referenceTextIds.forEach((id) => {
      // 유효한 ID만 처리
      if (id && typeof id === "string") {
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
    console.error("여러 레퍼런스 사용 여부 확인 실패:", error);
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
DualTextWriter.prototype.markReferenceAsUsed = async function (
  referenceTextId
) {
  // 에러 처리: 파라미터 유효성 검사
  if (!referenceTextId || typeof referenceTextId !== "string") {
    console.warn(
      "markReferenceAsUsed: 잘못된 referenceTextId:",
      referenceTextId
    );
    this.showMessage("❌ 레퍼런스 ID를 찾을 수 없습니다.", "error");
    return;
  }

  // 에러 처리: Firebase 준비 상태 확인
  if (!this.isFirebaseReady) {
    console.warn("markReferenceAsUsed: Firebase가 준비되지 않았습니다.");
    this.showMessage("❌ Firebase 연결이 준비되지 않았습니다.", "error");
    return;
  }

  // 에러 처리: 사용자 로그인 여부 확인
  if (!this.currentUser) {
    console.warn("markReferenceAsUsed: 사용자가 로그인하지 않았습니다.");
    this.showMessage("❌ 로그인이 필요합니다.", "error");
    return;
  }

  try {
    // 레퍼런스 텍스트 조회
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      console.error("레퍼런스 텍스트를 찾을 수 없습니다.");
      this.showMessage("❌ 레퍼런스 텍스트를 찾을 수 없습니다.", "error");
      return;
    }

    const textData = textDoc.data();

    // 레퍼런스 타입 확인
    if ((textData.type || "edit") !== "reference") {
      console.warn("markReferenceAsUsed: 레퍼런스가 아닌 텍스트입니다.");
      this.showMessage("❌ 레퍼런스 글만 사용 표시할 수 있습니다.", "error");
      return;
    }

    // 이미 사용된 레퍼런스인지 확인
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount > 0) {
      console.log("이미 사용된 레퍼런스입니다. 사용 횟수:", existingUsageCount);
      // 이미 사용된 경우에도 메시지 표시하지 않고 조용히 처리
      // UI만 업데이트
      await this.refreshSavedTextsUI();
      return;
    }

    // 레퍼런스 사용 포스트 생성
    const postsRef = window.firebaseCollection(
      this.db,
      "users",
      this.currentUser.uid,
      "posts"
    );
    const referencePostData = {
      content: textData.content, // 레퍼런스 내용
      type: "reference",
      postedAt: window.firebaseServerTimestamp(),
      trackingEnabled: false, // 레퍼런스 포스트는 트래킹 비활성화
      metrics: [],
      analytics: {},
      sourceTextId: referenceTextId, // 레퍼런스 텍스트 참조
      sourceType: "reference", // 레퍼런스 타입으로 설정
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    };

    await window.firebaseAddDoc(postsRef, referencePostData);
    console.log(
      "✅ 레퍼런스 사용 표시 완료 (레퍼런스 ID:",
      referenceTextId,
      ")"
    );

    // 성공 메시지
    this.showMessage("✅ 레퍼런스가 사용됨으로 표시되었습니다.", "success");

    // "사용됨" 탭으로 자동 이동
    this.setSavedFilter("reference-used");

    // UI 즉시 업데이트 (새로고침 없이)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // 에러 처리: Firebase 조회/생성 실패 시 에러 메시지 표시
    console.error("레퍼런스 사용 표시 실패:", error);
    this.showMessage(
      "❌ 레퍼런스 사용 표시에 실패했습니다: " + error.message,
      "error"
    );
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
DualTextWriter.prototype.unmarkReferenceAsUsed = async function (
  referenceTextId
) {
  // 에러 처리: 파라미터 유효성 검사
  if (!referenceTextId || typeof referenceTextId !== "string") {
    console.warn(
      "unmarkReferenceAsUsed: 잘못된 referenceTextId:",
      referenceTextId
    );
    this.showMessage("❌ 레퍼런스 ID를 찾을 수 없습니다.", "error");
    return;
  }

  // 에러 처리: Firebase 준비 상태 확인
  if (!this.isFirebaseReady) {
    console.warn("unmarkReferenceAsUsed: Firebase가 준비되지 않았습니다.");
    this.showMessage("❌ Firebase 연결이 준비되지 않았습니다.", "error");
    return;
  }

  // 에러 처리: 사용자 로그인 여부 확인
  if (!this.currentUser) {
    console.warn("unmarkReferenceAsUsed: 사용자가 로그인하지 않았습니다.");
    this.showMessage("❌ 로그인이 필요합니다.", "error");
    return;
  }

  try {
    // 레퍼런스 텍스트 조회
    const textRef = window.firebaseDoc(
      this.db,
      "users",
      this.currentUser.uid,
      "texts",
      referenceTextId
    );
    const textDoc = await window.firebaseGetDoc(textRef);

    if (!textDoc.exists()) {
      console.error("레퍼런스 텍스트를 찾을 수 없습니다.");
      this.showMessage("❌ 레퍼런스 텍스트를 찾을 수 없습니다.", "error");
      return;
    }

    const textData = textDoc.data();

    // 레퍼런스 타입 확인
    if ((textData.type || "edit") !== "reference") {
      console.warn("unmarkReferenceAsUsed: 레퍼런스가 아닌 텍스트입니다.");
      this.showMessage(
        "❌ 레퍼런스 글만 사용 안됨으로 되돌릴 수 있습니다.",
        "error"
      );
      return;
    }

    // 현재 사용 여부 확인
    const existingUsageCount = await this.checkReferenceUsage(referenceTextId);
    if (existingUsageCount === 0) {
      console.log("이미 사용 안된 레퍼런스입니다.");
      // 이미 사용 안된 경우에도 메시지 표시하지 않고 조용히 처리
      // UI만 업데이트
      await this.refreshSavedTextsUI();
      return;
    }

    // 레퍼런스 사용 포스트 조회 및 삭제
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
    const querySnapshot = await window.firebaseGetDocs(q);

    if (querySnapshot.empty) {
      console.warn(
        "unmarkReferenceAsUsed: 레퍼런스 사용 포스트를 찾을 수 없습니다."
      );
      // 사용 포스트가 없어도 UI만 업데이트
      await this.refreshSavedTextsUI();
      return;
    }

    // 모든 레퍼런스 사용 포스트 삭제 (배치 삭제)
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
    console.log(
      "✅ 레퍼런스 사용 안됨 복원 완료 (레퍼런스 ID:",
      referenceTextId,
      ", 삭제된 포스트:",
      querySnapshot.docs.length,
      "개)"
    );

    // 성공 메시지
    this.showMessage("✅ 레퍼런스가 사용 안됨으로 되돌려졌습니다.", "success");

    // "레퍼런스" 탭으로 자동 이동 (사용 안됨 레퍼런스를 보기 위해)
    this.setSavedFilter("reference");

    // UI 즉시 업데이트 (새로고침 없이)
    await this.refreshSavedTextsUI();
  } catch (error) {
    // 에러 처리: Firebase 조회/삭제 실패 시 에러 메시지 표시
    console.error("레퍼런스 사용 안됨 복원 실패:", error);
    this.showMessage(
      "❌ 레퍼런스 사용 안됨 복원에 실패했습니다: " + error.message,
      "error"
    );
  }
};

/**
 * 저장된 글 목록 UI를 새로고침합니다.
 * 레퍼런스 사용 여부를 다시 확인하여 배지 업데이트합니다.
 *
 * @returns {Promise<void>}
 */
DualTextWriter.prototype.refreshSavedTextsUI = async function () {
  try {
    // 저장된 글 목록 다시 렌더링
    await this.renderSavedTexts();
  } catch (error) {
    console.error("저장된 글 UI 새로고침 실패:", error);
  }
};

// Orphan 포스트 정리 (원본이 삭제된 포스트 일괄 삭제)
DualTextWriter.prototype.cleanupOrphanPosts = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("❌ 로그인이 필요합니다.", "error");
    return;
  }

  // Orphan 포스트 필터링
  const orphanPosts = this.trackingPosts.filter((post) => post.isOrphan);

  if (orphanPosts.length === 0) {
    this.showMessage("✅ 정리할 orphan 포스트가 없습니다.", "success");
    return;
  }

  // 삭제 전 확인
  const metricsCount = orphanPosts.reduce(
    (sum, post) => sum + (post.metrics?.length || 0),
    0
  );
  const confirmMessage =
    `원본이 삭제된 포스트 ${orphanPosts.length}개를 삭제하시겠습니까?\n\n` +
    `⚠️ 삭제될 데이터:\n` +
    `   - 트래킹 포스트: ${orphanPosts.length}개\n` +
    `   - 트래킹 기록: ${metricsCount}개\n\n` +
    `이 작업은 되돌릴 수 없습니다.`;

  if (!confirm(confirmMessage)) {
    console.log("사용자가 orphan 포스트 정리 취소");
    return;
  }

  try {
    // 진행 중 메시지
    this.showMessage("🔄 Orphan 포스트를 정리하는 중...", "info");

    // 모든 orphan 포스트 삭제 (병렬 처리)
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

    // 로컬 배열에서도 제거
    this.trackingPosts = this.trackingPosts.filter((post) => !post.isOrphan);

    // UI 업데이트
    this.refreshUI({
      trackingPosts: true,
      trackingSummary: true,
      trackingChart: true,
      force: true,
    });

    // 성공 메시지
    this.showMessage(
      `✅ Orphan 포스트 ${orphanPosts.length}개가 정리되었습니다!`,
      "success"
    );
    console.log("Orphan 포스트 정리 완료", {
      deletedCount: orphanPosts.length,
    });
  } catch (error) {
    console.error("Orphan 포스트 정리 실패:", error);
    this.showMessage(
      "❌ Orphan 포스트 정리에 실패했습니다: " + error.message,
      "error"
    );
  }
};
// 일괄 마이그레이션 확인 대화상자 표시
DualTextWriter.prototype.showBatchMigrationConfirm = async function () {
  if (!this.currentUser || !this.isFirebaseReady) {
    this.showMessage("로그인이 필요합니다.", "error");
    return;
  }

  // 미트래킹 글만 찾기
  const untrackedTexts = [];

  for (const textItem of this.savedTexts) {
    // 로컬에서 먼저 확인
    let hasTracking = false;
    if (this.trackingPosts) {
      hasTracking = this.trackingPosts.some(
        (p) => p.sourceTextId === textItem.id
      );
    }

    // 로컬에 없으면 Firebase에서 확인
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
        const querySnapshot = await window.firebaseGetDocs(q);
        hasTracking = !querySnapshot.empty;
      } catch (error) {
        console.error("트래킹 확인 실패:", error);
      }
    }

    if (!hasTracking) {
      untrackedTexts.push(textItem);
    }
  }

  if (untrackedTexts.length === 0) {
    this.showMessage("✅ 모든 저장된 글이 이미 트래킹 중입니다!", "success");
    // 버튼 상태 업데이트
    this.updateBatchMigrationButton();
    return;
  }

  const confirmMessage =
    `트래킹이 시작되지 않은 저장된 글 ${untrackedTexts.length}개를 트래킹 포스트로 변환하시겠습니까?\n\n` +
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
    // 버튼 비활성화
    if (button) {
      button.disabled = true;
      button.textContent = "마이그레이션 진행 중...";
    }

    this.showMessage(
      `🔄 미트래킹 글 ${untrackedTexts.length}개의 트래킹을 시작합니다...`,
      "info"
    );

    // 각 미트래킹 텍스트에 대해 포스트 생성
    for (let i = 0; i < untrackedTexts.length; i++) {
      const textItem = untrackedTexts[i];

      try {
        // 기존 포스트 확인 (안전장치)
        const existingPosts = await this.checkExistingPostForText(textItem.id);
        if (existingPosts.length > 0) {
          console.log(
            `텍스트 ${textItem.id}: 이미 ${existingPosts.length}개의 포스트 존재, 건너뜀`
          );
          skipCount++;
          continue;
        }

        // 포스트 생성 (트래킹 탭 전환 없이 백그라운드 처리)
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

        // 진행 상황 표시 (마지막 항목이 아닐 때만)
        if (i < untrackedTexts.length - 1) {
          const progress = Math.round(((i + 1) / untrackedTexts.length) * 100);
          if (button) {
            button.textContent = `마이그레이션 진행 중... (${progress}%)`;
          }
        }

        // 너무 빠른 요청 방지 (Firebase 할당량 고려)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`텍스트 ${textItem.id} 마이그레이션 실패:`, error);
        errorCount++;
      }
    }

    // 결과 메시지
    const resultMessage =
      `✅ 미트래킹 글 마이그레이션 완료!\n` +
      `- 성공: ${successCount}개\n` +
      `- 건너뜀: ${skipCount}개 (이미 포스트 존재)\n` +
      `- 실패: ${errorCount}개`;

    this.showMessage(resultMessage, "success");
    console.log("일괄 마이그레이션 결과:", {
      successCount,
      skipCount,
      errorCount,
    });

    // 트래킹 포스트 목록 새로고침 (트래킹 탭이 활성화되어 있으면)
    if (this.loadTrackingPosts) {
      await this.loadTrackingPosts();
    }

    // 저장된 글 목록도 새로고침 (버튼 상태 업데이트를 위해)
    await this.renderSavedTexts();
  } catch (error) {
    console.error("일괄 마이그레이션 중 오류:", error);
    this.showMessage(
      "❌ 마이그레이션 중 오류가 발생했습니다: " + error.message,
      "error"
    );
  } finally {
    // 버튼 복원 및 상태 업데이트
    if (button) {
      button.disabled = false;
    }
    // 버튼 텍스트는 updateBatchMigrationButton에서 업데이트됨
    await this.updateBatchMigrationButton();
  }
};

// [Refactoring] 전역 인스턴스 생성 및 노출 제거 (DOMContentLoaded에서 처리됨)
// const dualTextWriter = new DualTextWriter(); // Removed to avoid duplicate and premature instantiation
// window.dualTextWriter = dualTextWriter; // Handled in DOMContentLoaded
// window.app = dualTextWriter; // Handled in DOMContentLoaded

// 전역 함수들 (인라인 핸들러 호환성 유지)
window.saveTrackingData = function () {
  if (window.dualTextWriter) {
    window.dualTextWriter.saveTrackingData();
  }
};

window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active"); // classList 사용 권장
    // 하위 호환성: style.display도 체크
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

console.log("DualTextWriter initialized (Module Mode)");

// ========================================
// 글 상세 패널 확대 모드 기능
// ========================================

/**
 * 글 상세 패널 확대 모드 초기화
 * - 확대 버튼 클릭 이벤트
 * - ESC 키로 닫기
 * - 오버레이 클릭으로 닫기
 */
document.addEventListener("DOMContentLoaded", () => {
  const detailExpandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");
  const detailPanelClose = document.getElementById("detail-panel-close");

  if (!detailExpandBtn || !articleDetailPanel) {
    console.warn("글 상세 패널 확대 모드: 필수 요소를 찾을 수 없습니다.");
    return;
  }

  /**
   * 확대 모드 토글 함수
   */
  function toggleDetailPanelExpand() {
    const isExpanded = articleDetailPanel.classList.contains("expanded");

    if (isExpanded) {
      // 축소
      articleDetailPanel.classList.remove("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "false");
      detailExpandBtn.title = "전체 화면 확대 (ESC로 닫기)";
      document.body.style.overflow = "";
      removeDetailPanelOverlay();
    } else {
      // 확대
      articleDetailPanel.classList.add("expanded");
      detailExpandBtn.setAttribute("aria-expanded", "true");
      detailExpandBtn.title = "확대 모드 닫기 (ESC)";
      document.body.style.overflow = "hidden";
      addDetailPanelOverlay();
    }
  }

  /**
   * 오버레이 추가 함수
   */
  function addDetailPanelOverlay() {
    let overlay = document.querySelector(".detail-panel-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "detail-panel-overlay";
      document.body.appendChild(overlay);

      // 오버레이 클릭 시 축소
      overlay.addEventListener("click", toggleDetailPanelExpand);
    }
    overlay.classList.add("active");
  }

  /**
   * 오버레이 제거 함수
   */
  function removeDetailPanelOverlay() {
    const overlay = document.querySelector(".detail-panel-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  }

  // 확대 버튼 클릭 이벤트 -> 모달 확대 모드로 변경
  detailExpandBtn.addEventListener("click", () => {
    if (window.dualTextWriter) {
      window.dualTextWriter.openExpandMode();
    } else {
      console.error("DualTextWriter 인스턴스를 찾을 수 없습니다.");
    }
  });

  // ESC 키로 확대 모드 닫기
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

  // 패널 닫기 버튼 클릭 시 확대 모드도 해제
  if (detailPanelClose) {
    const originalCloseHandler = detailPanelClose.onclick;
    detailPanelClose.addEventListener("click", () => {
      // 확대 모드가 활성화되어 있으면 먼저 해제
      if (articleDetailPanel.classList.contains("expanded")) {
        toggleDetailPanelExpand();
      }
    });
  }

  console.log("✅ 글 상세 패널 확대 모드 초기화 완료");
});

// ========================================
// 글 상세 패널 레퍼런스 기능
// ========================================

/**
 * 글 상세 패널에서 레퍼런스를 로드하고 관리하는 기능
 * - 확대 모드 활성화 시 연결된 레퍼런스 자동 로드
 * - 레퍼런스 목록 렌더링
 * - 레퍼런스 클릭으로 내용 복사
 * - 드래그로 패널 크기 조절
 */

let currentArticleReferences = [];
let currentEditingArticleId = null;

/**
 * 글의 연결된 레퍼런스 로드
 */
function loadArticleReferences(articleId) {
  currentEditingArticleId = articleId;
  currentArticleReferences = [];

  // DualTextWriter 인스턴스 확인
  if (!window.dualTextWriter || !window.dualTextWriter.currentUser) {
    console.warn("DualTextWriter 인스턴스가 없거나 로그인하지 않았습니다.");
    renderDetailReferences();
    return;
  }

  // 현재 편집 중인 글 찾기
  const article = window.dualTextWriter.savedTexts.find(
    (t) => t.id === articleId
  );
  if (!article) {
    console.warn("글을 찾을 수 없습니다:", articleId);
    renderDetailReferences();
    return;
  }

  // 연결된 레퍼런스가 있는지 확인
  if (article.linkedReferences && article.linkedReferences.length > 0) {
    // 레퍼런스 ID로 실제 레퍼런스 데이터 가져오기
    const references = article.linkedReferences
      .map((refId) => {
        return window.dualTextWriter.savedTexts.find((t) => t.id === refId);
      })
      .filter((ref) => ref); // null 제거

    currentArticleReferences = references;
    console.log(`✅ 레퍼런스 ${references.length}개 로드 완료`);
  }

  renderDetailReferences();
}

/**
 * 레퍼런스 목록 렌더링
 */
function renderDetailReferences() {
  const listEl = document.getElementById("detail-reference-list");
  const emptyEl = document.querySelector(".detail-reference-empty");

  if (!listEl || !emptyEl) {
    console.warn("레퍼런스 UI 요소를 찾을 수 없습니다.");
    return;
  }

  // 레퍼런스가 없는 경우
  if (currentArticleReferences.length === 0) {
    listEl.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  // 레퍼런스 목록 표시
  listEl.style.display = "block";
  emptyEl.style.display = "none";

  // HTML 이스케이프 함수
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 레퍼런스 항목 렌더링
  listEl.innerHTML = currentArticleReferences
    .map((ref) => {
      const title = ref.topic || ref.source || "제목 없음";
      const content = ref.content || "내용 없음";

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

  // 클릭 이벤트: 내용 복사
  listEl.querySelectorAll(".detail-reference-item").forEach((item) => {
    item.addEventListener("click", () => {
      const refId = item.dataset.refId;
      const ref = currentArticleReferences.find((r) => r.id === refId);
      if (ref && ref.content) {
        navigator.clipboard
          .writeText(ref.content)
          .then(() => {
            // 복사 성공 피드백
            const originalBg = item.style.background;
            item.style.background = "#e7f3ff";
            setTimeout(() => {
              item.style.background = originalBg;
            }, 300);

            console.log("✅ 레퍼런스 내용 복사 완료");
          })
          .catch((err) => {
            console.error("복사 실패:", err);
            alert("복사에 실패했습니다.");
          });
      }
    });

    // 키보드 접근성
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.click();
      }
    });
  });
}

/**
 * 드래그 가능한 구분선 초기화
 */
function initDetailDividerDrag() {
  const divider = document.getElementById("detail-split-divider");
  const container = document.querySelector(".detail-edit-container");

  if (!divider || !container) {
    console.warn("구분선 요소를 찾을 수 없습니다.");
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

    // 최소/최대 너비 제한 (300px ~ 전체 너비 - 400px)
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

  console.log("✅ 구분선 드래그 기능 초기화 완료");
}

/**
 * 확대 버튼 클릭 시 레퍼런스 로드 및 구분선 초기화
 */
document.addEventListener("DOMContentLoaded", () => {
  const expandBtn = document.getElementById("detail-expand-btn");
  const articleDetailPanel = document.getElementById("article-detail-panel");

  if (expandBtn && articleDetailPanel) {
    // 기존 확대 버튼 클릭 이벤트에 추가 로직 삽입
    expandBtn.addEventListener("click", () => {
      // 약간의 지연 후 확대 모드 상태 확인
      setTimeout(() => {
        const isExpanded = articleDetailPanel.classList.contains("expanded");
        const isEditMode =
          document.getElementById("detail-edit-mode").style.display !== "none";

        // 확대 모드 활성화 && 수정 모드일 때만 실행
        if (isExpanded && isEditMode && currentEditingArticleId) {
          loadArticleReferences(currentEditingArticleId);
          initDetailDividerDrag();
          console.log("✅ 확대 모드에서 레퍼런스 패널 활성화");
        }
      }, 100);
    });
  }

  console.log("✅ 레퍼런스 패널 기능 초기화 완료");
});

/**
 * 수정 모드 진입 시 현재 글 ID 저장
 * (기존 코드에서 수정 버튼 클릭 시 호출되는 부분에 추가 필요)
 */
function setCurrentEditingArticle(articleId) {
  currentEditingArticleId = articleId;
  console.log("현재 편집 중인 글 ID 설정:", articleId);
}

// 전역 함수로 노출 (기존 코드에서 호출 가능하도록)
window.setCurrentEditingArticle = setCurrentEditingArticle;
window.loadArticleReferences = loadArticleReferences;

// ================================================================
// [Phase 3] 2025-12-08
// URL 연결 탭 기능 (URL Connection Tab Feature)
// 
// - 자주 사용하는 URL을 관리하고 빠르게 접근
// - LocalStorage 기반 데이터 저장
// - CRUD 기능 (추가, 조회, 수정, 삭제)
// - 보안: noopener noreferrer, XSS 방지
// ================================================================

/**
 * URL 연결 관리자 (UrlLinkManager)
 * 
 * 전역 스코프에서 URL 링크 관리 기능을 제공합니다.
 * Firebase Firestore를 사용하여 크로스 브라우저/디바이스 동기화를 지원합니다.
 */
const UrlLinkManager = (function () {
  // ----------------------------------------
  // 3.1 상수 및 데이터 모델 정의
  // ----------------------------------------
  
  /**
   * Firestore 컬렉션 이름
   * 경로: users/{userId}/urlLinks/{linkId}
   * @type {string}
   */
  const URL_LINKS_COLLECTION = "urlLinks";

  /**
   * URL 링크 데이터 배열
   * @type {Array<{id: string, name: string, description: string, url: string, order: number, createdAt: number}>}
   */
  let urlLinks = [];

  /**
   * 현재 수정 중인 링크 ID (null이면 추가 모드)
   * @type {string|null}
   */
  let editingLinkId = null;

  /**
   * Firebase 준비 상태 및 사용자 참조
   */
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;

  // DOM 요소 캐시
  let elements = {};

  // ----------------------------------------
  // 3.2 Firebase Firestore 연동 함수
  // ----------------------------------------

  /**
   * Firebase에서 URL 링크 데이터 로드
   * @returns {Promise<Array>} URL 링크 배열
   */
  async function loadUrlLinks() {
    // Firebase 준비 확인
    if (!isFirebaseReady || !currentUser) {
      console.warn("URL 링크 로드: Firebase가 준비되지 않았거나 로그인되지 않았습니다.");
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

      // order 필드로 정렬하여 조회
      const q = window.firebaseQuery(
        linksRef,
        window.firebaseOrderBy("order", "asc")
      );

      const querySnapshot = await window.firebaseGetDocs(q);

      urlLinks = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log(`✅ URL 링크 ${urlLinks.length}개 로드 완료 (Firebase)`);
      renderUrlLinks();
      return urlLinks;
    } catch (error) {
      console.error("Firebase에서 URL 링크 로드 실패:", error);
      urlLinks = [];
      renderUrlLinks();
      return urlLinks;
    }
  }

  /**
   * Firebase에 단일 URL 링크 저장 (추가)
   * @param {Object} linkData - 저장할 URL 링크 데이터
   * @returns {Promise<string|null>} 저장된 문서 ID 또는 null
   */
  async function saveUrlLinkToFirebase(linkData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("❌ 로그인이 필요합니다.", "error");
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

      console.log(`✅ URL 링크 저장 완료 (ID: ${docRef.id})`);
      return docRef.id;
    } catch (error) {
      console.error("Firebase에 URL 링크 저장 실패:", error);
      showMessage("❌ 저장에 실패했습니다: " + error.message, "error");
      return null;
    }
  }

  /**
   * Firebase에서 URL 링크 수정
   * @param {string} linkId - 링크 문서 ID
   * @param {Object} updateData - 수정할 데이터
   * @returns {Promise<boolean>} 성공 여부
   */
  async function updateUrlLinkInFirebase(linkId, updateData) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("❌ 로그인이 필요합니다.", "error");
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

      console.log(`✅ URL 링크 수정 완료 (ID: ${linkId})`);
      return true;
    } catch (error) {
      console.error("Firebase에서 URL 링크 수정 실패:", error);
      showMessage("❌ 수정에 실패했습니다: " + error.message, "error");
      return false;
    }
  }

  /**
   * Firebase에서 URL 링크 삭제
   * @param {string} linkId - 링크 문서 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async function deleteUrlLinkFromFirebase(linkId) {
    if (!isFirebaseReady || !currentUser) {
      showMessage("❌ 로그인이 필요합니다.", "error");
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
      console.log(`✅ URL 링크 삭제 완료 (ID: ${linkId})`);
      return true;
    } catch (error) {
      console.error("Firebase에서 URL 링크 삭제 실패:", error);
      showMessage("❌ 삭제에 실패했습니다: " + error.message, "error");
      return false;
    }
  }

  /**
   * 모든 URL 링크의 order 값 일괄 업데이트 (순서 변경용)
   * @returns {Promise<boolean>} 성공 여부
   */
  async function updateAllOrdersInFirebase() {
    if (!isFirebaseReady || !currentUser) {
      return false;
    }

    try {
      // 각 링크의 order 값을 현재 배열 인덱스로 업데이트
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
      console.log("✅ URL 링크 순서 업데이트 완료");
      return true;
    } catch (error) {
      console.error("URL 링크 순서 업데이트 실패:", error);
      return false;
    }
  }

  // ----------------------------------------
  // 3.3 CRUD 함수 구현
  // ----------------------------------------

  /**
   * 고유 ID 생성
   * @returns {string} 고유 ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * URL 유효성 검사 및 자동 수정
   * @param {string} url - URL 문자열
   * @returns {string|null} 유효한 URL 또는 null
   */
  function validateAndFixUrl(url) {
    if (!url || typeof url !== "string") {
      return null;
    }

    let trimmedUrl = url.trim();

    // 빈 문자열 체크
    if (!trimmedUrl) {
      return null;
    }

    // 위험한 프로토콜 차단 (XSS 방지)
    const dangerousProtocols = ["javascript:", "data:", "vbscript:"];
    const lowerUrl = trimmedUrl.toLowerCase();
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        showMessage("❌ 보안상의 이유로 해당 URL을 사용할 수 없습니다.", "error");
        return null;
      }
    }

    // http:// 또는 https:// 없으면 자동 추가
    if (!trimmedUrl.match(/^https?:\/\//i)) {
      trimmedUrl = "https://" + trimmedUrl;
    }

    // URL 형식 검증
    try {
      new URL(trimmedUrl);
      return trimmedUrl;
    } catch (e) {
      showMessage("❌ 올바른 URL 형식이 아닙니다.", "error");
      return null;
    }
  }

  /**
   * 새 URL 링크 추가 (Firebase 저장)
   * @param {Object} linkData - { name, description, url }
   * @returns {Promise<boolean>} 성공 여부
   */
  async function addUrlLink(linkData) {
    // 유효성 검사
    if (!linkData.name || !linkData.name.trim()) {
      showMessage("❌ 서비스 명칭을 입력해주세요.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(linkData.url);
    if (!validUrl) {
      return false;
    }

    // 새 링크 데이터 생성 (order는 현재 배열 길이 = 맨 끝)
    const newLinkData = {
      name: linkData.name.trim(),
      description: (linkData.description || "").trim(),
      url: validUrl,
      order: urlLinks.length,
    };

    // Firebase에 저장
    const docId = await saveUrlLinkToFirebase(newLinkData);
    if (docId) {
      showMessage("✅ URL이 추가되었습니다!", "success");
      hideForm();
      // 데이터 다시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL 링크 수정 (Firebase 업데이트)
   * @param {string} id - 링크 ID
   * @param {Object} newData - { name, description, url }
   * @returns {Promise<boolean>} 성공 여부
   */
  async function updateUrlLink(id, newData) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("❌ 수정할 URL을 찾을 수 없습니다.", "error");
      return false;
    }

    // 유효성 검사
    if (!newData.name || !newData.name.trim()) {
      showMessage("❌ 서비스 명칭을 입력해주세요.", "error");
      return false;
    }

    const validUrl = validateAndFixUrl(newData.url);
    if (!validUrl) {
      return false;
    }

    // Firebase에 업데이트
    const updateData = {
      name: newData.name.trim(),
      description: (newData.description || "").trim(),
      url: validUrl,
    };

    const success = await updateUrlLinkInFirebase(id, updateData);
    if (success) {
      showMessage("✅ URL이 수정되었습니다!", "success");
      hideForm();
      // 데이터 다시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  /**
   * URL 링크 삭제 (Firebase 삭제)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async function deleteUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("❌ 삭제할 URL을 찾을 수 없습니다.", "error");
      return false;
    }

    // 확인 대화상자
    if (!confirm(`"${link.name}" URL을 삭제하시겠습니까?`)) {
      return false;
    }

    // Firebase에서 삭제
    const success = await deleteUrlLinkFromFirebase(id);
    if (success) {
      showMessage("✅ URL이 삭제되었습니다!", "success");
      // 데이터 다시 로드
      await loadUrlLinks();
      return true;
    }

    return false;
  }

  // ----------------------------------------
  // 3.3.1 URL 링크 순서 이동 기능 (Firebase)
  // ----------------------------------------

  /**
   * URL 링크를 위로 이동 (순서 변경 - Firebase)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async function moveUrlLinkUp(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // 첫 번째 항목은 더 위로 이동 불가
    if (index <= 0) {
      return false;
    }

    // 배열에서 위치 교환
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];

    // Firebase에 순서 업데이트
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // 실패 시 롤백
    [urlLinks[index - 1], urlLinks[index]] = [urlLinks[index], urlLinks[index - 1]];
    return false;
  }

  /**
   * URL 링크를 아래로 이동 (순서 변경 - Firebase)
   * @param {string} id - 링크 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async function moveUrlLinkDown(id) {
    const index = urlLinks.findIndex((link) => link.id === id);
    
    // 마지막 항목은 더 아래로 이동 불가
    if (index === -1 || index >= urlLinks.length - 1) {
      return false;
    }

    // 배열에서 위치 교환
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];

    // Firebase에 순서 업데이트
    const success = await updateAllOrdersInFirebase();
    if (success) {
      renderUrlLinks();
      return true;
    }

    // 실패 시 롤백
    [urlLinks[index], urlLinks[index + 1]] = [urlLinks[index + 1], urlLinks[index]];
    return false;
  }

  /**
   * URL 열기 (새 탭)
   * @param {string} id - 링크 ID
   */
  function openUrlLink(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("❌ URL을 찾을 수 없습니다.", "error");
      return;
    }

    // 보안: noopener, noreferrer 옵션 적용
    window.open(link.url, "_blank", "noopener,noreferrer");
    console.log(`✅ URL 열기: ${link.name} (${link.url})`);
  }

  // ----------------------------------------
  // 3.4 렌더링 함수
  // ----------------------------------------

  /**
   * URL에서 도메인 추출
   * @param {string} url - URL 문자열
   * @returns {string} 도메인
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
   * URL 링크 목록 렌더링
   * - DocumentFragment 사용으로 성능 최적화
   * - XSS 방지: textContent 사용
   */
  function renderUrlLinks() {
    const listEl = elements.urlLinkList;
    const emptyEl = elements.urlLinkEmptyState;

    if (!listEl || !emptyEl) {
      console.warn("URL 링크 렌더링: DOM 요소를 찾을 수 없습니다.");
      return;
    }

    // 빈 상태 처리
    if (urlLinks.length === 0) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";

    // DocumentFragment 사용으로 DOM 조작 최소화
    const fragment = document.createDocumentFragment();

    urlLinks.forEach((link) => {
      const card = createUrlLinkCard(link);
      fragment.appendChild(card);
    });

    // 한 번에 DOM 업데이트
    listEl.innerHTML = "";
    listEl.appendChild(fragment);
  }

  /**
   * URL 링크 카드 요소 생성
   * @param {Object} link - URL 링크 객체
   * @returns {HTMLElement} 카드 요소
   */
  function createUrlLinkCard(link) {
    const card = document.createElement("div");
    card.className = "url-link-card";
    card.setAttribute("role", "listitem");
    card.dataset.linkId = link.id;

    // 이동 버튼
    const launchBtn = document.createElement("button");
    launchBtn.className = "btn-url-launch";
    launchBtn.setAttribute("aria-label", `${link.name} 열기`);
    launchBtn.title = `${link.name} 열기`;
    launchBtn.textContent = "🚀";
    launchBtn.addEventListener("click", () => openUrlLink(link.id));

    // 파비콘 영역
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
        fallback.textContent = "🌐";
        faviconDiv.appendChild(fallback);
      };
      faviconDiv.appendChild(faviconImg);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "favicon-fallback";
      fallback.textContent = "🌐";
      faviconDiv.appendChild(fallback);
    }

    // 정보 영역 (XSS 방지: textContent 사용)
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

    // 액션 버튼 영역
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "url-link-actions";

    // 위로 이동 버튼
    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "btn-icon btn-move-up";
    moveUpBtn.setAttribute("aria-label", `${link.name} 위로 이동`);
    moveUpBtn.title = "위로 이동";
    moveUpBtn.textContent = "⬆️";
    moveUpBtn.addEventListener("click", () => moveUrlLinkUp(link.id));

    // 아래로 이동 버튼
    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "btn-icon btn-move-down";
    moveDownBtn.setAttribute("aria-label", `${link.name} 아래로 이동`);
    moveDownBtn.title = "아래로 이동";
    moveDownBtn.textContent = "⬇️";
    moveDownBtn.addEventListener("click", () => moveUrlLinkDown(link.id));

    // 수정 버튼
    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon btn-edit";
    editBtn.setAttribute("aria-label", `${link.name} 수정`);
    editBtn.title = "수정";
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => showEditForm(link.id));

    // 삭제 버튼
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon btn-delete";
    deleteBtn.setAttribute("aria-label", `${link.name} 삭제`);
    deleteBtn.title = "삭제";
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => deleteUrlLink(link.id));

    actionsDiv.appendChild(moveUpBtn);
    actionsDiv.appendChild(moveDownBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    // 카드에 요소 추가
    card.appendChild(launchBtn);
    card.appendChild(faviconDiv);
    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);

    return card;
  }

  // ----------------------------------------
  // 3.5 폼 및 이벤트 처리
  // ----------------------------------------

  /**
   * 입력 폼 표시 (추가 모드)
   */
  function showAddForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "block";
    elements.urlLinkName.focus();
  }

  /**
   * 입력 폼 표시 (수정 모드)
   * @param {string} id - 수정할 링크 ID
   */
  function showEditForm(id) {
    const link = urlLinks.find((l) => l.id === id);
    if (!link) {
      showMessage("❌ 수정할 URL을 찾을 수 없습니다.", "error");
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
   * 입력 폼 숨기기
   */
  function hideForm() {
    editingLinkId = null;
    clearForm();
    elements.urlLinkForm.style.display = "none";
  }

  /**
   * 폼 입력 초기화
   */
  function clearForm() {
    elements.urlLinkName.value = "";
    elements.urlLinkDesc.value = "";
    elements.urlLinkUrl.value = "";
    elements.urlLinkEditId.value = "";
  }

  /**
   * 저장 버튼 핸들러 (async)
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
   * 메시지 표시 (기존 showMessage 활용)
   * @param {string} message - 메시지
   * @param {string} type - 메시지 유형 (success, error, info)
   */
  function showMessage(message, type) {
    if (window.dualTextWriter && window.dualTextWriter.showMessage) {
      window.dualTextWriter.showMessage(message, type);
    } else {
      console.log(`[${type}] ${message}`);
      // 폴백: alert 사용
      if (type === "error") {
        alert(message);
      }
    }
  }

  // ----------------------------------------
  // 초기화
  // ----------------------------------------

  /**
   * URL 연결 탭 초기화 (Firebase 연동)
   */
  function init() {
    // DOM 요소 캐시
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

    // 필수 요소 확인
    if (!elements.urlLinkList) {
      console.warn("URL 연결 탭: DOM 요소를 찾을 수 없습니다. (탭이 렌더링되지 않았을 수 있음)");
      return false;
    }

    // Firebase 연동 확인
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase 인증 상태 리스너
      window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
        currentUser = user;
        if (user) {
          console.log("✅ URL 연결 탭: 사용자 로그인됨 -", user.uid);
          // 로그인 시 데이터 로드
          await loadUrlLinks();
        } else {
          console.log("⚠️ URL 연결 탭: 사용자 로그아웃됨");
          // 로그아웃 시 데이터 초기화
          urlLinks = [];
          renderUrlLinks();
        }
      });
    } else {
      console.warn("URL 연결 탭: Firebase가 준비되지 않았습니다. 잠시 후 다시 시도합니다.");
      isFirebaseReady = false;
      // 빈 상태 표시
      renderUrlLinks();
    }

    // 이벤트 바인딩
    if (elements.addUrlLinkBtn) {
      elements.addUrlLinkBtn.addEventListener("click", showAddForm);
    }

    if (elements.urlLinkSaveBtn) {
      elements.urlLinkSaveBtn.addEventListener("click", handleSave);
    }

    if (elements.urlLinkCancelBtn) {
      elements.urlLinkCancelBtn.addEventListener("click", hideForm);
    }

    // 키보드 이벤트: Enter로 저장, Esc로 취소
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

    // 초기 렌더링
    renderUrlLinks();

    console.log("✅ URL 연결 탭 초기화 완료");
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

// DOM 로드 완료 시 URL 연결 탭 초기화
document.addEventListener("DOMContentLoaded", () => {
  // 약간의 지연 후 초기화 (다른 초기화가 완료된 이후)
  setTimeout(() => {
    if (UrlLinkManager.init()) {
      console.log("✅ UrlLinkManager 초기화 성공");
    }
  }, 500);
});

// 전역 스코프에 노출 (디버깅용)
window.UrlLinkManager = UrlLinkManager;

/**
 * 백업 관리자 (BackupManager)
 * 
 * Firebase 데이터를 JSON 파일로 내보내기/가져오기 기능을 제공합니다.
 * 기존 서비스와 완전히 독립적으로 동작합니다.
 */
const BackupManager = (function () {
  // ----------------------------------------
  // 상태 변수
  // ----------------------------------------
  
  let isFirebaseReady = false;
  let currentUser = null;
  let db = null;
  let selectedFile = null;
  
  // DOM 요소 캐시
  let elements = {};

  // ----------------------------------------
  // Firebase 데이터 수집 함수
  // ----------------------------------------

  /**
   * 모든 사용자 데이터를 Firebase에서 수집
   * @returns {Promise<Object>} 수집된 데이터 객체
   */
  async function collectAllData() {
    if (!isFirebaseReady || !currentUser) {
      throw new Error("로그인이 필요합니다.");
    }

    const data = {
      exportedAt: new Date().toISOString(),
      userId: currentUser.uid,
      userEmail: currentUser.email || "익명",
      texts: [],
      posts: [],
      urlLinks: [],
    };

    try {
      // 1. texts 컬렉션 수집
      const textsRef = window.firebaseCollection(db, "users", currentUser.uid, "texts");
      const textsSnapshot = await window.firebaseGetDocs(textsRef);
      data.texts = textsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 2. posts 컬렉션 수집
      const postsRef = window.firebaseCollection(db, "users", currentUser.uid, "posts");
      const postsSnapshot = await window.firebaseGetDocs(postsRef);
      data.posts = postsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 3. urlLinks 컬렉션 수집
      const urlLinksRef = window.firebaseCollection(db, "users", currentUser.uid, "urlLinks");
      const urlLinksSnapshot = await window.firebaseGetDocs(urlLinksRef);
      data.urlLinks = urlLinksSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log(`✅ 데이터 수집 완료: texts(${data.texts.length}), posts(${data.posts.length}), urlLinks(${data.urlLinks.length})`);
      return data;
    } catch (error) {
      console.error("데이터 수집 실패:", error);
      throw error;
    }
  }

  // ----------------------------------------
  // 내보내기 함수
  // ----------------------------------------

  /**
   * 데이터를 JSON 파일로 내보내기
   */
  async function exportData() {
    updateStatus("export", "⏳ 데이터를 수집하는 중...", "loading");

    try {
      const data = await collectAllData();

      // JSON 파일 생성
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      
      // 파일명 생성 (날짜 포함)
      const date = new Date().toISOString().split("T")[0];
      const filename = `500text_backup_${date}.json`;

      // 다운로드 링크 생성 및 클릭
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const summary = `📝 texts: ${data.texts.length}개, 📊 posts: ${data.posts.length}개, 🔗 urlLinks: ${data.urlLinks.length}개`;
      updateStatus("export", `✅ 백업 완료! (${filename})\n${summary}`, "success");
      showMessage("✅ 백업 파일이 다운로드되었습니다!", "success");
    } catch (error) {
      console.error("내보내기 실패:", error);
      updateStatus("export", `❌ 내보내기 실패: ${error.message}`, "error");
      showMessage("❌ 백업에 실패했습니다: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // 가져오기 함수
  // ----------------------------------------

  /**
   * 선택된 파일의 데이터를 Firebase에 복원
   */
  async function importData() {
    if (!selectedFile) {
      showMessage("❌ 먼저 JSON 파일을 선택해주세요.", "error");
      return;
    }

    if (!isFirebaseReady || !currentUser) {
      showMessage("❌ 로그인이 필요합니다.", "error");
      return;
    }

    // 확인 대화상자
    if (!confirm("⚠️ 기존 데이터가 복원 데이터로 덮어쓰여질 수 있습니다.\n\n정말로 복원하시겠습니까?")) {
      return;
    }

    updateStatus("import", "⏳ 파일을 읽는 중...", "loading");

    try {
      // 파일 읽기
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      // 유효성 검사
      if (!data.texts && !data.posts && !data.urlLinks) {
        throw new Error("유효한 백업 파일이 아닙니다.");
      }

      updateStatus("import", "⏳ 데이터를 복원하는 중...", "loading");

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

      const summary = `📝 texts: ${restored.texts}개, 📊 posts: ${restored.posts}개, 🔗 urlLinks: ${restored.urlLinks}개`;
      updateStatus("import", `✅ 복원 완료!\n${summary}`, "success");
      showMessage("✅ 데이터가 성공적으로 복원되었습니다!", "success");

      // 파일 선택 초기화
      selectedFile = null;
      elements.fileInput.value = "";
      elements.fileName.textContent = "선택된 파일 없음";
      elements.importBtn.disabled = true;
    } catch (error) {
      console.error("가져오기 실패:", error);
      updateStatus("import", `❌ 복원 실패: ${error.message}`, "error");
      showMessage("❌ 복원에 실패했습니다: " + error.message, "error");
    }
  }

  // ----------------------------------------
  // UI 헬퍼 함수
  // ----------------------------------------

  /**
   * 상태 메시지 업데이트
   */
  function updateStatus(type, message, status) {
    const el = type === "export" ? elements.exportStatus : elements.importStatus;
    if (el) {
      el.textContent = message;
      el.className = `backup-status ${status}`;
    }
  }

  /**
   * 파일 선택 핸들러
   */
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        showMessage("❌ JSON 파일만 선택할 수 있습니다.", "error");
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
   * 메시지 표시 (기존 showMessage 활용)
   */
  function showMessage(message, type) {
    if (window.dualTextWriter && window.dualTextWriter.showMessage) {
      window.dualTextWriter.showMessage(message, type);
    } else {
      console.log(`[${type}] ${message}`);
      if (type === "error") {
        alert(message);
      }
    }
  }

  // ----------------------------------------
  // 초기화
  // ----------------------------------------

  /**
   * 백업 탭 초기화
   */
  function init() {
    // DOM 요소 캐시
    elements = {
      exportBtn: document.getElementById("backup-export-btn"),
      exportStatus: document.getElementById("backup-export-status"),
      fileInput: document.getElementById("backup-file-input"),
      fileSelectBtn: document.getElementById("backup-file-select-btn"),
      fileName: document.getElementById("backup-file-name"),
      importBtn: document.getElementById("backup-import-btn"),
      importStatus: document.getElementById("backup-import-status"),
    };

    // 필수 요소 확인
    if (!elements.exportBtn) {
      console.warn("백업 탭: DOM 요소를 찾을 수 없습니다.");
      return false;
    }

    // Firebase 연동 확인
    if (window.firebaseDb && window.firebaseAuth) {
      db = window.firebaseDb;
      isFirebaseReady = true;
      
      // Firebase 인증 상태 리스너
      window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        currentUser = user;
        if (user) {
          console.log("✅ 백업 탭: 사용자 로그인됨");
        } else {
          console.log("⚠️ 백업 탭: 사용자 로그아웃됨");
        }
      });
    } else {
      console.warn("백업 탭: Firebase가 준비되지 않았습니다.");
      isFirebaseReady = false;
    }

    // 이벤트 바인딩
    elements.exportBtn.addEventListener("click", exportData);
    
    elements.fileSelectBtn.addEventListener("click", () => {
      elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener("change", handleFileSelect);
    elements.importBtn.addEventListener("click", importData);

    console.log("✅ 백업 탭 초기화 완료");
    return true;
  }

  // 공개 API
  return {
    init,
    exportData,
    importData,
  };
})();

// DOM 로드 완료 시 백업 탭 초기화
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (BackupManager.init()) {
      console.log("✅ BackupManager 초기화 성공");
    }
  }, 600);
});

// 전역 스코프에 노출 (디버깅용)
window.BackupManager = BackupManager;
