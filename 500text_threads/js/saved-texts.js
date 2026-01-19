/**
 * ==================== SavedTextsManager ====================
 * 저장된 글 관리 모듈
 *
 * [역할]
 * - 저장된 글 목록 상태 관리
 * - 필터/검색 상태 관리
 * - 렌더링 캐시 관리
 * - 주제/소스 목록 관리
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - Constants (STORAGE_KEYS)
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team
 */

import { Constants } from "./constants.js";

export class SavedTextsManager {
  /**
   * SavedTextsManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 저장된 글 데이터 ====================
    /**
     * 저장된 글 배열
     * - Firestore에서 로드된 모든 글 (작성글 + 레퍼런스)
     * - isDeleted 플래그로 휴지통 항목 구분
     */
    this._savedTexts = [];

    // ==================== 필터 상태 ====================
    /**
     * 현재 필터 상태
     * - 'all': 전체
     * - 'edit': 작성글만
     * - 'reference': 레퍼런스만
     * - 'reference-used': 사용된 레퍼런스
     */
    this._savedFilter =
      localStorage.getItem(Constants.STORAGE_KEYS.SAVED_FILTER) || "all";

    // ==================== 검색 상태 ====================
    /**
     * 검색어 상태
     * - localStorage에 저장되어 세션 간 유지
     */
    this._savedSearch =
      localStorage.getItem(Constants.STORAGE_KEYS.SAVED_SEARCH) || "";

    /**
     * 검색 디바운스 타이머
     * - 과도한 검색 요청 방지
     */
    this._savedSearchDebounce = null;

    // ==================== 렌더링 캐시 ====================
    /**
     * 렌더링 결과 캐시
     * - 동일 필터 조건에서 재계산 방지
     */
    this._renderSavedTextsCache = null;

    /**
     * 캐시 키
     * - 필터 + 검색어 + 플랫폼 조합
     */
    this._renderSavedTextsCacheKey = null;

    /**
     * 렌더링 디바운스 타이머
     */
    this._renderSavedTextsDebounceTimer = null;

    // ==================== 주제/소스 목록 ====================
    /**
     * 사용 가능한 주제 목록 (작성글)
     * - savedTexts에서 동적으로 추출
     */
    this._availableTopics = [];

    /**
     * 사용 가능한 소스 목록 (레퍼런스)
     * - savedTexts에서 동적으로 추출
     */
    this._availableSources = [];

    console.log("✅ SavedTextsManager 초기화 완료");
  }

  // ==================== Getter/Setter: savedTexts ====================

  /**
   * 저장된 글 배열 getter
   * @returns {Array} 저장된 글 배열
   */
  get savedTexts() {
    return this._savedTexts;
  }

  /**
   * 저장된 글 배열 setter
   * @param {Array} value - 저장된 글 배열
   */
  set savedTexts(value) {
    this._savedTexts = value;
  }

  // ==================== Getter/Setter: savedFilter ====================

  /**
   * 필터 상태 getter
   * @returns {string} 현재 필터 값
   */
  get savedFilter() {
    return this._savedFilter;
  }

  /**
   * 필터 상태 setter
   * - localStorage에 저장
   * @param {string} value - 필터 값
   */
  set savedFilter(value) {
    this._savedFilter = value;
    localStorage.setItem(Constants.STORAGE_KEYS.SAVED_FILTER, value);
  }

  // ==================== Getter/Setter: savedSearch ====================

  /**
   * 검색어 getter
   * @returns {string} 현재 검색어
   */
  get savedSearch() {
    return this._savedSearch;
  }

  /**
   * 검색어 setter
   * - localStorage에 저장
   * @param {string} value - 검색어
   */
  set savedSearch(value) {
    this._savedSearch = value;
    localStorage.setItem(Constants.STORAGE_KEYS.SAVED_SEARCH, value);
  }

  // ==================== Getter/Setter: savedSearchDebounce ====================

  /**
   * 검색 디바운스 타이머 getter
   * @returns {number|null} 타이머 ID
   */
  get savedSearchDebounce() {
    return this._savedSearchDebounce;
  }

  /**
   * 검색 디바운스 타이머 setter
   * @param {number|null} value - 타이머 ID
   */
  set savedSearchDebounce(value) {
    this._savedSearchDebounce = value;
  }

  // ==================== Getter/Setter: renderSavedTextsCache ====================

  /**
   * 렌더링 캐시 getter
   * @returns {any} 캐시된 렌더링 결과
   */
  get renderSavedTextsCache() {
    return this._renderSavedTextsCache;
  }

  /**
   * 렌더링 캐시 setter
   * @param {any} value - 캐시할 렌더링 결과
   */
  set renderSavedTextsCache(value) {
    this._renderSavedTextsCache = value;
  }

  // ==================== Getter/Setter: renderSavedTextsCacheKey ====================

  /**
   * 캐시 키 getter
   * @returns {string|null} 캐시 키
   */
  get renderSavedTextsCacheKey() {
    return this._renderSavedTextsCacheKey;
  }

  /**
   * 캐시 키 setter
   * @param {string|null} value - 캐시 키
   */
  set renderSavedTextsCacheKey(value) {
    this._renderSavedTextsCacheKey = value;
  }

  // ==================== Getter/Setter: renderSavedTextsDebounceTimer ====================

  /**
   * 렌더링 디바운스 타이머 getter
   * @returns {number|null} 타이머 ID
   */
  get renderSavedTextsDebounceTimer() {
    return this._renderSavedTextsDebounceTimer;
  }

  /**
   * 렌더링 디바운스 타이머 setter
   * @param {number|null} value - 타이머 ID
   */
  set renderSavedTextsDebounceTimer(value) {
    this._renderSavedTextsDebounceTimer = value;
  }

  // ==================== Getter/Setter: availableTopics ====================

  /**
   * 사용 가능한 주제 목록 getter
   * @returns {Array} 주제 목록
   */
  get availableTopics() {
    return this._availableTopics;
  }

  /**
   * 사용 가능한 주제 목록 setter
   * @param {Array} value - 주제 목록
   */
  set availableTopics(value) {
    this._availableTopics = value;
  }

  // ==================== Getter/Setter: availableSources ====================

  /**
   * 사용 가능한 소스 목록 getter
   * @returns {Array} 소스 목록
   */
  get availableSources() {
    return this._availableSources;
  }

  /**
   * 사용 가능한 소스 목록 setter
   * @param {Array} value - 소스 목록
   */
  set availableSources(value) {
    this._availableSources = value;
  }

  // ==================== 캐시 무효화 ====================

  /**
   * 렌더링 캐시 무효화
   * - 데이터 변경 시 호출하여 다음 렌더링에서 재계산하도록 함
   */
  invalidateCache() {
    this._renderSavedTextsCache = null;
    this._renderSavedTextsCacheKey = null;
  }

  // ==================== 데이터 초기화 ====================

  /**
   * 저장된 글 데이터 초기화 (로그아웃 시 사용)
   */
  resetData() {
    this._savedTexts = [];
    this._availableTopics = [];
    this._availableSources = [];
    this.invalidateCache();
    console.log("✅ SavedTextsManager 데이터 초기화 완료");
  }

  // ==================== 렌더링 메서드 (Phase 5-02) ====================

  /**
   * 저장된 글 목록 렌더링 (디바운스 적용)
   * - 300ms 디바운스로 과도한 렌더링 방지
   * - 실제 렌더링은 _renderSavedTextsImpl()에서 수행
   * @returns {Promise} 렌더링 완료 Promise
   */
  async renderSavedTexts() {
    // 디바운스 적용 (300ms)
    if (this._renderSavedTextsDebounceTimer) {
      clearTimeout(this._renderSavedTextsDebounceTimer);
    }

    return new Promise((resolve) => {
      this._renderSavedTextsDebounceTimer = setTimeout(async () => {
        await this._renderSavedTextsImpl();
        resolve();
      }, 300);
    });
  }

  /**
   * 저장된 글 목록 실제 렌더링 구현
   * - 필터/검색 적용
   * - 캐시 확인 및 업데이트
   * - 트래킹 데이터 조회
   * - 배치 렌더링 (성능 최적화)
   */
  async _renderSavedTextsImpl() {
    const app = this.mainApp;

    // ==================== 캐시 키 생성 ====================
    const topicOrSourceFilter =
      this._savedFilter === "edit"
        ? app.currentTopicFilter || "all"
        : app.currentSourceFilter || "all";
    const snsFilterKey =
      this._savedFilter === "edit" &&
      app.currentSnsFilterMode &&
      app.currentSnsFilterMode !== "all" &&
      app.currentSnsFilterPlatform
        ? `${app.currentSnsFilterMode}_${app.currentSnsFilterPlatform}`
        : "all";
    const searchKey =
      this._savedSearch && this._savedSearch.trim()
        ? this._savedSearch.trim().toLowerCase()
        : "";
    const cacheKey = `${this._savedFilter}_${
      app.referenceTypeFilter || "all"
    }_${topicOrSourceFilter}_${snsFilterKey}_${searchKey}`;

    // ==================== 캐시 확인 ====================
    if (
      this._renderSavedTextsCache &&
      this._renderSavedTextsCacheKey === cacheKey
    ) {
      console.log("renderSavedTexts: 캐시된 결과 사용 (성능 최적화)");
      return;
    }

    console.log("renderSavedTexts 호출됨:", this._savedTexts);

    // ==================== 필터 적용 ====================
    let list = this._savedTexts;

    // [Soft Delete] 삭제된 항목 제외
    list = list.filter((item) => !item.isDeleted);

    // [Tab Separation] 'script' 타입은 저장된 글 탭에서 제외
    list = list.filter((item) => (item.type || "edit") !== "script");

    // 타입 필터
    if (this._savedFilter === "edit") {
      list = list.filter((item) => item.type === "edit");
    } else if (this._savedFilter === "reference") {
      list = list.filter((item) => (item.type || "edit") === "reference");
    } else if (this._savedFilter === "reference-used") {
      list = list.filter((item) => (item.type || "edit") === "reference");
    }

    // 레퍼런스 유형 필터 적용 (structure/idea)
    if (
      (this._savedFilter === "reference" ||
        this._savedFilter === "reference-used") &&
      app.referenceTypeFilter &&
      app.referenceTypeFilter !== "all"
    ) {
      list = list.filter((item) => {
        const rtype = item.referenceType || "unspecified";
        return rtype === app.referenceTypeFilter;
      });
    }

    // 주제 필터 적용 (작성 글용)
    if (
      this._savedFilter === "edit" &&
      app.currentTopicFilter &&
      app.currentTopicFilter !== "all"
    ) {
      list = list.filter((item) => {
        const itemTopic = item.topic || "";
        return itemTopic === app.currentTopicFilter;
      });
    }

    // 소스 필터 적용 (레퍼런스 글용)
    if (
      (this._savedFilter === "reference" ||
        this._savedFilter === "reference-used") &&
      app.currentSourceFilter &&
      app.currentSourceFilter !== "all"
    ) {
      list = list.filter((item) => {
        const itemTopic = item.topic || "";
        return itemTopic === app.currentSourceFilter;
      });
    }

    // SNS 플랫폼 필터 적용 (작성 글용)
    if (
      this._savedFilter === "edit" &&
      app.currentSnsFilterMode &&
      app.currentSnsFilterMode !== "all" &&
      app.currentSnsFilterPlatform
    ) {
      list = list.filter((item) => {
        const platforms = Array.isArray(item.platforms) ? item.platforms : [];

        if (app.currentSnsFilterMode === "has") {
          return platforms.includes(app.currentSnsFilterPlatform);
        } else if (app.currentSnsFilterMode === "not-has") {
          return !platforms.includes(app.currentSnsFilterPlatform);
        }
        return true;
      });
    }

    // ==================== 검색 필터 적용 ====================
    if (this._savedSearch && this._savedSearch.trim()) {
      const tokens = this._savedSearch
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      list = list.filter((item) => {
        const content = (item.content || "").toLowerCase();
        const topic = (item.topic || "").toLowerCase();
        const searchText = `${content} ${topic}`;
        return tokens.every((tk) => searchText.includes(tk));
      });
    }

    // ==================== 필터 옵션 업데이트 ====================
    if (this._savedFilter === "edit") {
      app.updateTopicFilterOptions();
      app.updateSnsFilterOptions();
    } else if (
      this._savedFilter === "reference" ||
      this._savedFilter === "reference-used"
    ) {
      app.updateSourceFilterOptions();
    }

    // ==================== 빈 목록 처리 ====================
    if (list.length === 0) {
      let emptyMsg = "저장된 글이 없습니다.";
      if (this._savedFilter === "edit") {
        emptyMsg = "작성 글이 없습니다.";
      } else if (this._savedFilter === "reference") {
        emptyMsg = "레퍼런스 글이 없습니다.";
      } else if (this._savedFilter === "reference-used") {
        emptyMsg = "사용된 레퍼런스가 없습니다.";
      }
      app.savedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">${emptyMsg}</div>
          <div class="empty-state-subtext">글을 작성하고 저장해보세요!</div>
        </div>
      `;
      return;
    }

    // ==================== 로딩 스켈레톤 표시 ====================
    app.savedList.innerHTML = `
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

    // ==================== 레퍼런스 사용 여부 배치 조회 ====================
    const referenceItems = list.filter(
      (item) => (item.type || "edit") === "reference"
    );
    let referenceUsageMap = {};
    referenceItems.forEach((item) => {
      if (item.id) {
        referenceUsageMap[item.id] = 0;
      }
    });
    if (referenceItems.length > 0 && app.currentUser && app.isFirebaseReady) {
      try {
        const referenceIds = referenceItems
          .map((item) => item.id)
          .filter((id) => id);
        if (referenceIds.length > 0) {
          const fetchedUsageMap = await app.checkMultipleReferenceUsage(
            referenceIds
          );
          Object.assign(referenceUsageMap, fetchedUsageMap);
        }
      } catch (error) {
        console.error("레퍼런스 사용 여부 배치 조회 실패:", error);
      }
    }

    // 캐시 키 업데이트
    this._renderSavedTextsCacheKey = cacheKey;

    // ==================== 트래킹 데이터 조회 및 필터링 ====================
    const itemsWithTracking = await Promise.all(
      list.map(async (item, index) => {
        let postData = null;
        if (app.trackingPosts && app.currentUser && app.isFirebaseReady) {
          postData = app.trackingPosts.find((p) => p.sourceTextId === item.id);

          if (!postData) {
            try {
              const postsRef = window.firebaseCollection(
                app.db,
                "users",
                app.currentUser.uid,
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
          usageCount =
            referenceUsageMap[item.id] !== undefined
              ? referenceUsageMap[item.id]
              : 0;
        }

        const itemWithUsage = { ...item, usageCount };

        // reference 필터: usageCount가 0인 항목만 포함
        if (this._savedFilter === "reference") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount !== 0) {
            return null;
          }
        }

        // reference-used 필터: usageCount가 1 이상인 항목만 포함
        if (this._savedFilter === "reference-used") {
          const isReference = (item.type || "edit") === "reference";
          if (!isReference || usageCount === 0) {
            return null;
          }
        }

        return { item: itemWithUsage, postData, index };
      })
    );

    // null 항목 제거
    const filteredItemsWithTracking =
      this._savedFilter === "reference" || this._savedFilter === "reference-used"
        ? itemsWithTracking.filter((result) => result !== null)
        : itemsWithTracking;

    // ==================== 필터링 후 빈 목록 체크 ====================
    if (filteredItemsWithTracking.length === 0) {
      let emptyMsg = "저장된 글이 없습니다.";
      let emptySubMsg = "글을 작성하고 저장해보세요!";

      if (this._savedSearch && this._savedSearch.trim()) {
        emptyMsg = `"${this._savedSearch}" 검색 결과가 없습니다.`;
        emptySubMsg = "다른 검색어를 시도해보세요.";
      } else {
        if (this._savedFilter === "edit") {
          emptyMsg = "작성 글이 없습니다.";
        } else if (this._savedFilter === "reference") {
          emptyMsg = "레퍼런스 글이 없습니다.";
        } else if (this._savedFilter === "reference-used") {
          emptyMsg = "사용된 레퍼런스가 없습니다.";
        }
      }

      app.savedList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">${emptyMsg}</div>
          <div class="empty-state-subtext">${emptySubMsg}</div>
        </div>
      `;
      app.savedList.setAttribute("aria-label", `저장된 글 목록: ${emptyMsg}`);
      return;
    }

    // ==================== 배치 렌더링 ====================
    const batchSize = 10;
    const totalItems = itemsWithTracking.length;

    const filterDescription =
      this._savedFilter === "edit"
        ? "작성 글"
        : this._savedFilter === "reference"
        ? "레퍼런스 글"
        : this._savedFilter === "reference-used"
        ? "사용된 레퍼런스"
        : "저장된 글";

    let ariaLabelText = `저장된 글 목록: ${filterDescription} ${totalItems}개`;
    if (this._savedSearch && this._savedSearch.trim()) {
      ariaLabelText = `저장된 글 목록: ${filterDescription} 검색 결과 ${totalItems}개`;
    }
    app.savedList.setAttribute("aria-label", ariaLabelText);

    if (totalItems > batchSize) {
      // 대량 렌더링: 첫 번째 배치만 즉시 렌더링
      const firstBatch = filteredItemsWithTracking.slice(0, batchSize);
      app.savedList.innerHTML = firstBatch
        .map(({ item, postData, index }) => {
          return app.cardRenderer.renderSavedItemCard(item, postData, index);
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
            return app.cardRenderer.renderSavedItemCard(item, postData, index);
          })
          .join("");

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = batchHtml;
        while (tempDiv.firstChild) {
          app.savedList.appendChild(tempDiv.firstChild);
        }

        currentIndex += batchSize;
        if (currentIndex < totalItems) {
          requestAnimationFrame(renderNextBatch);
        } else {
          setTimeout(() => {
            app.setupSavedItemEventListeners();
            app.bindLinkedReferenceBadgeEvents();
          }, 100);
        }
      };

      requestAnimationFrame(renderNextBatch);
    } else {
      // 소량 렌더링: 즉시 렌더링
      app.savedList.innerHTML = filteredItemsWithTracking
        .map(({ item, postData, index }) => {
          return app.cardRenderer.renderSavedItemCard(item, postData, index);
        })
        .join("");
    }

    // DOM 렌더링 완료 후 이벤트 리스너 설정
    if (totalItems <= batchSize) {
      setTimeout(() => {
        app.setupSavedItemEventListeners();
        app.bindLinkedReferenceBadgeEvents();
      }, 100);
    }
  }

  // ==================== 휴지통 메서드 (Phase 5-02) ====================

  /**
   * 휴지통 목록 렌더링
   * - 삭제된 항목만 표시
   * - 삭제일 기준 내림차순 정렬
   */
  renderTrashBinList() {
    const app = this.mainApp;
    const container = document.getElementById("trash-bin-list");
    if (!container) return;

    const deletedItems = this._savedTexts
      .filter((item) => item.isDeleted)
      .sort((a, b) => {
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
            <div class="saved-item-content">${app.escapeHtml(preview)}</div>
            <div class="saved-item-actions">
              <button class="btn-restore" onclick="window.dualTextWriter.textCrudManager.restoreText('${
                item.id
              }')" aria-label="글 복원">
                ♻️ 복원
              </button>
              <button class="btn-delete-permanent" onclick="window.dualTextWriter.textCrudManager.permanentlyDeleteText('${
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

  /**
   * 휴지통 모달 열기
   */
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

  /**
   * 휴지통 모달 닫기
   */
  closeTrashBin() {
    const modal = document.getElementById("trash-bin-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  // ==================== 필터 메서드 (Phase 5-03) ====================

  /**
   * 저장된 글 필터 UI 초기화 및 이벤트 바인딩
   * - 세그먼트 버튼 이벤트
   * - 레퍼런스 유형 필터
   * - 주제/소스/SNS 필터
   */
  initSavedFilters() {
    const app = this.mainApp;
    const container = document.querySelector("#saved-tab .segmented-control");
    if (!container) return;
    const buttons = container.querySelectorAll(".segment-btn");
    if (!buttons || buttons.length === 0) return;

    // ==================== 레퍼런스 유형 필터 초기화 ====================
    app.referenceTypeFilter =
      localStorage.getItem("dualTextWriter_referenceTypeFilter") || "all";
    app.referenceTypeFilterSelect = document.getElementById(
      "reference-type-filter"
    );
    app.referenceTypeFilterContainer = document.getElementById(
      "reference-type-filter-container"
    );
    if (app.referenceTypeFilterSelect) {
      app.referenceTypeFilterSelect.value = app.referenceTypeFilter;
      app.referenceTypeFilterSelect.onchange = () => {
        app.referenceTypeFilter = app.referenceTypeFilterSelect.value;
        localStorage.setItem(
          "dualTextWriter_referenceTypeFilter",
          app.referenceTypeFilter
        );
        this.renderSavedTexts();
      };
    }

    // ==================== 주제 필터 이벤트 리스너 설정 ====================
    if (app.topicFilter) {
      app.currentTopicFilter =
        localStorage.getItem("dualTextWriter_topicFilter") || "all";
      app.topicFilter.value = app.currentTopicFilter;
      app.topicFilter.onchange = () => {
        app.currentTopicFilter = app.topicFilter.value;
        localStorage.setItem(
          "dualTextWriter_topicFilter",
          app.currentTopicFilter
        );
        this._renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // ==================== 소스 필터 이벤트 리스너 설정 ====================
    if (app.sourceFilter) {
      app.currentSourceFilter =
        localStorage.getItem("dualTextWriter_sourceFilter") || "all";
      app.sourceFilter.value = app.currentSourceFilter;
      app.sourceFilter.onchange = () => {
        app.currentSourceFilter = app.sourceFilter.value;
        localStorage.setItem(
          "dualTextWriter_sourceFilter",
          app.currentSourceFilter
        );
        this._renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // ==================== SNS 플랫폼 필터 이벤트 리스너 설정 ====================
    if (app.snsFilterMode) {
      app.currentSnsFilterMode =
        localStorage.getItem("dualTextWriter_snsFilterMode") || "all";
      app.snsFilterMode.value = app.currentSnsFilterMode;
      app.snsFilterMode.onchange = () => {
        app.currentSnsFilterMode = app.snsFilterMode.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterMode",
          app.currentSnsFilterMode
        );
        // 필터 모드가 'all'이 아니면 플랫폼 선택 드롭다운 표시
        if (app.snsFilterPlatform) {
          if (app.currentSnsFilterMode === "all") {
            app.snsFilterPlatform.style.display = "none";
            app.currentSnsFilterPlatform = "";
            app.snsFilterPlatform.value = "";
          } else {
            app.snsFilterPlatform.style.display = "block";
          }
        }
        this._renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    if (app.snsFilterPlatform) {
      app.currentSnsFilterPlatform =
        localStorage.getItem("dualTextWriter_snsFilterPlatform") || "";
      app.snsFilterPlatform.value = app.currentSnsFilterPlatform;
      // 초기 표시 상태 설정
      if (app.currentSnsFilterMode === "all") {
        app.snsFilterPlatform.style.display = "none";
      } else {
        app.snsFilterPlatform.style.display = "block";
      }
      app.snsFilterPlatform.onchange = () => {
        app.currentSnsFilterPlatform = app.snsFilterPlatform.value;
        localStorage.setItem(
          "dualTextWriter_snsFilterPlatform",
          app.currentSnsFilterPlatform
        );
        this._renderSavedTextsCache = null; // 캐시 무효화
        this.renderSavedTexts();
      };
    }

    // SNS 플랫폼 목록 초기화
    this.updateSnsFilterOptions();

    // ==================== 활성 상태 복원 ====================
    buttons.forEach((btn) => {
      const filter = btn.getAttribute("data-filter");
      const isActive = filter === this._savedFilter;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // ==================== 클릭 이벤트 바인딩 ====================
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
    app.updateReferenceTypeFilterVisibility();
  }

  /**
   * 저장된 글 필터 설정
   * @param {string} filter - 필터 값 ('all', 'edit', 'reference', 'reference-used')
   */
  setSavedFilter(filter) {
    const app = this.mainApp;

    // 에러 처리: 필터 값이 예상 범위를 벗어난 경우 처리
    const validFilters = ["all", "edit", "reference", "reference-used"];
    if (!validFilters.includes(filter)) {
      console.warn("setSavedFilter: 잘못된 필터 값:", filter);
      return;
    }

    this._savedFilter = filter;
    localStorage.setItem(Constants.STORAGE_KEYS.SAVED_FILTER, filter);

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
    app.updateReferenceTypeFilterVisibility();

    // 주제/소스 필터 표시/숨김
    app.updateTopicSourceFilterVisibility();

    // 목록 렌더링
    this.renderSavedTexts();
  }

  /**
   * 주제 필터 옵션 업데이트 (작성글용)
   * - savedTexts에서 고유한 주제 목록 추출
   * - 드롭다운 옵션 업데이트
   */
  updateTopicFilterOptions() {
    const app = this.mainApp;
    if (!app.topicFilter) return;

    // 작성 글(type === 'edit')에서만 고유한 주제 목록 추출
    const topics = new Set();
    this._savedTexts.forEach((item) => {
      if ((item.type || "edit") === "edit" && item.topic && item.topic.trim()) {
        topics.add(item.topic.trim());
      }
    });

    // 주제 목록을 배열로 변환하고 정렬
    this._availableTopics = Array.from(topics).sort();

    // 드롭다운 옵션 업데이트
    const currentValue = app.topicFilter.value;
    app.topicFilter.innerHTML = '<option value="all">전체 주제</option>';

    this._availableTopics.forEach((topic) => {
      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic;
      app.topicFilter.appendChild(option);
    });

    // 이전 선택값 복원
    if (currentValue && this._availableTopics.includes(currentValue)) {
      app.topicFilter.value = currentValue;
    } else {
      app.topicFilter.value = "all";
      app.currentTopicFilter = "all";
    }
  }

  /**
   * 소스 필터 옵션 업데이트 (레퍼런스용)
   * - savedTexts에서 고유한 소스 목록 추출
   * - 드롭다운 옵션 업데이트
   */
  updateSourceFilterOptions() {
    const app = this.mainApp;
    if (!app.sourceFilter) return;

    // 레퍼런스 글(type === 'reference')에서만 고유한 소스(주제) 목록 추출
    const sources = new Set();
    this._savedTexts.forEach((item) => {
      if (
        (item.type || "edit") === "reference" &&
        item.topic &&
        item.topic.trim()
      ) {
        sources.add(item.topic.trim());
      }
    });

    // 소스 목록을 배열로 변환하고 정렬
    this._availableSources = Array.from(sources).sort();

    // 드롭다운 옵션 업데이트
    const currentValue = app.sourceFilter.value;
    app.sourceFilter.innerHTML = '<option value="all">전체 소스</option>';

    this._availableSources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      app.sourceFilter.appendChild(option);
    });

    // 이전 선택값 복원
    if (currentValue && this._availableSources.includes(currentValue)) {
      app.sourceFilter.value = currentValue;
    } else {
      app.sourceFilter.value = "all";
      app.currentSourceFilter = "all";
    }
  }

  /**
   * SNS 필터 옵션 업데이트 (작성글용)
   * - SNS_PLATFORMS에서 플랫폼 목록 생성
   * - 드롭다운 옵션 업데이트
   */
  updateSnsFilterOptions() {
    const app = this.mainApp;
    if (!app.snsFilterPlatform) return;

    // 현재 선택값 저장
    const currentValue = app.snsFilterPlatform.value;

    // SNS 플랫폼 목록 초기화
    app.snsFilterPlatform.innerHTML = '<option value="">플랫폼 선택</option>';

    // DualTextWriter.SNS_PLATFORMS에서 플랫폼 목록 생성
    // mainApp의 constructor에서 SNS_PLATFORMS를 참조
    const SNS_PLATFORMS = app.constructor.SNS_PLATFORMS;
    if (SNS_PLATFORMS) {
      SNS_PLATFORMS.forEach((platform) => {
        const option = document.createElement("option");
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        app.snsFilterPlatform.appendChild(option);
      });
    }

    // 이전 선택값 복원
    if (
      currentValue &&
      SNS_PLATFORMS &&
      SNS_PLATFORMS.some((p) => p.id === currentValue)
    ) {
      app.snsFilterPlatform.value = currentValue;
    } else {
      app.snsFilterPlatform.value = "";
      app.currentSnsFilterPlatform = "";
    }

    // 필터 모드에 따라 플랫폼 선택 드롭다운 표시/숨김
    if (app.snsFilterMode && app.snsFilterPlatform) {
      if (app.currentSnsFilterMode === "all") {
        app.snsFilterPlatform.style.display = "none";
      } else {
        app.snsFilterPlatform.style.display = "block";
      }
    }
  }
}
