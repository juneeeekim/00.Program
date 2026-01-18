/**
 * ==================== ReferenceManager ====================
 * 레퍼런스 관리 모듈
 *
 * [역할]
 * - 레퍼런스 선택 상태 관리 (selectedReferences)
 * - 레퍼런스 연결 캐시 관리 (referenceLinkCache)
 * - 확대 모드 레퍼런스 관리 (expandReferences)
 * - 최근 사용 레퍼런스 관리 (recentReferences)
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - Constants (js/constants.js)
 *
 * [생성일] 2026-01-15
 * [작성자] Refactoring Team
 */

import { Constants } from "./constants.js";

export class ReferenceManager {
  /**
   * ReferenceManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 레퍼런스 선택 상태 ====================
    // 현재 선택된 레퍼런스 ID 배열
    this._selectedReferences = [];

    // 레퍼런스 선택 모달 DOM 참조
    this._referenceSelectionModal = null;

    // ==================== 레퍼런스 연결 캐시 ====================
    // 역방향 조회 캐시 (refId -> editIds[])
    this._referenceLinkCache = new Map();

    // ==================== 확대 모드 레퍼런스 ====================
    // 확대 모드에서 선택한 레퍼런스 목록
    this._expandReferences = [];

    // ==================== 최근 사용 레퍼런스 ====================
    // localStorage에서 최근 사용 글 로드
    this._recentReferences = this._loadRecentReferencesFromStorage();

    console.log("✅ ReferenceManager 초기화 완료");
  }

  // ==================== Getter/Setter: selectedReferences ====================

  /**
   * 선택된 레퍼런스 배열 반환
   * @returns {Array} 선택된 레퍼런스 ID 배열
   */
  getSelectedReferences() {
    return this._selectedReferences;
  }

  /**
   * 선택된 레퍼런스 배열 설정
   * @param {Array} value - 새로운 레퍼런스 ID 배열
   */
  setSelectedReferences(value) {
    this._selectedReferences = Array.isArray(value) ? value : [];
  }

  // ==================== Getter/Setter: referenceSelectionModal ====================

  /**
   * 레퍼런스 선택 모달 DOM 반환
   * @returns {HTMLElement|null} 모달 DOM 요소
   */
  getReferenceSelectionModal() {
    return this._referenceSelectionModal;
  }

  /**
   * 레퍼런스 선택 모달 DOM 설정
   * @param {HTMLElement|null} value - 모달 DOM 요소
   */
  setReferenceSelectionModal(value) {
    this._referenceSelectionModal = value;
  }

  // ==================== Getter/Setter: referenceLinkCache ====================

  /**
   * 레퍼런스 연결 캐시 반환
   * @returns {Map} 역방향 조회 캐시
   */
  getReferenceLinkCache() {
    return this._referenceLinkCache;
  }

  /**
   * 레퍼런스 연결 캐시 설정
   * @param {Map} value - 새로운 캐시 Map
   */
  setReferenceLinkCache(value) {
    this._referenceLinkCache = value instanceof Map ? value : new Map();
  }

  // ==================== Getter/Setter: expandReferences ====================

  /**
   * 확대 모드 레퍼런스 배열 반환
   * @returns {Array} 확대 모드 레퍼런스 목록
   */
  getExpandReferences() {
    return this._expandReferences;
  }

  /**
   * 확대 모드 레퍼런스 배열 설정
   * @param {Array} value - 새로운 레퍼런스 목록
   */
  setExpandReferences(value) {
    this._expandReferences = Array.isArray(value) ? value : [];
  }

  // ==================== Getter/Setter: recentReferences ====================

  /**
   * 최근 사용 레퍼런스 배열 반환
   * @returns {Array} 최근 사용 레퍼런스 목록
   */
  getRecentReferences() {
    return this._recentReferences;
  }

  /**
   * 최근 사용 레퍼런스 배열 설정
   * @param {Array} value - 새로운 레퍼런스 목록
   */
  setRecentReferences(value) {
    this._recentReferences = Array.isArray(value) ? value : [];
  }

  // ==================== 내부 유틸리티 메서드 ====================

  /**
   * localStorage에서 최근 사용 레퍼런스 로드
   * @returns {Array} 최근 사용 레퍼런스 목록
   * @private
   */
  _loadRecentReferencesFromStorage() {
    try {
      const stored = localStorage.getItem(Constants.STORAGE_KEYS.RECENT_REFERENCES);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn("최근 사용 레퍼런스 로드 실패:", error);
      return [];
    }
  }

  // ==================== 캐시 관리 메서드 ====================

  /**
   * 레퍼런스 연결 캐시 무효화
   * 데이터 변경 시 호출하여 캐시를 초기화합니다.
   */
  invalidateCache() {
    if (this._referenceLinkCache) {
      this._referenceLinkCache.clear();
    }
    console.log("🔄 레퍼런스 연결 캐시 무효화됨");
  }

  // ==================== 레퍼런스 선택 모달 메서드 ====================

  /**
   * 레퍼런스 선택 기능 초기화
   *
   * - 접을 수 있는 패널 토글 기능
   * - 모달 DOM 요소 참조
   * - 이벤트 리스너 바인딩
   * - 초기 상태 설정
   */
  initReferenceSelection() {
    const app = this.mainApp;

    // DOM 요소 참조
    app.referenceCollapseToggle = document.getElementById(
      "reference-collapse-toggle"
    );
    app.referenceLinkContent = document.getElementById(
      "reference-link-content"
    );
    app.collapseRefCount = document.getElementById("collapse-ref-count");
    app.selectReferencesBtn = document.getElementById("select-references-btn");
    app.referenceSelectionModal = document.getElementById(
      "reference-selection-modal"
    );
    app.referenceSelectionList = document.getElementById(
      "reference-selection-list"
    );
    app.referenceSearchInput = document.getElementById(
      "reference-search-input"
    );
    app.referenceTypeFilterModal = document.getElementById(
      "reference-type-filter-modal"
    );
    app.selectedRefCount = document.getElementById("selected-ref-count");
    app.modalSelectedCount = document.getElementById("modal-selected-count");
    app.selectedReferencesTags = document.getElementById(
      "selected-references-tags"
    );
    app.confirmReferenceSelectionBtn = document.getElementById(
      "confirm-reference-selection-btn"
    );

    // 유효성 검사
    if (!app.selectReferencesBtn || !app.referenceSelectionModal) {
      console.warn("⚠️ 레퍼런스 선택 UI 요소를 찾을 수 없습니다.");
      return;
    }

    // 접을 수 있는 패널 토글 이벤트
    if (app.referenceCollapseToggle && app.referenceLinkContent) {
      app.referenceCollapseToggle.addEventListener("click", () =>
        app.toggleReferenceCollapse()
      );
    }

    // 이벤트 리스너 바인딩
    app.selectReferencesBtn.addEventListener("click", () =>
      this.openReferenceSelectionModal()
    );
    app.confirmReferenceSelectionBtn.addEventListener("click", () =>
      this.confirmReferenceSelection()
    );

    // 모달 닫기 버튼
    const closeBtns = app.referenceSelectionModal.querySelectorAll(
      ".close-btn, .cancel-btn"
    );
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.closeReferenceSelectionModal());
    });

    // 모달 외부 클릭 시 닫기
    app.referenceSelectionModal.addEventListener("click", (e) => {
      if (e.target === app.referenceSelectionModal) {
        this.closeReferenceSelectionModal();
      }
    });

    // ESC 키로 모달 닫기
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        app.referenceSelectionModal.style.display === "flex"
      ) {
        this.closeReferenceSelectionModal();
      }
    });

    // 검색 및 필터 이벤트
    if (app.referenceSearchInput) {
      app.referenceSearchInput.addEventListener("input", () =>
        this.filterReferenceList()
      );
    }
    if (app.referenceTypeFilterModal) {
      app.referenceTypeFilterModal.addEventListener("change", () =>
        this.filterReferenceList()
      );
    }

    console.log("✅ 레퍼런스 선택 기능 초기화 완료");
  }

  /**
   * 레퍼런스 선택 모달 열기
   *
   * - 레퍼런스 목록 렌더링
   * - 현재 선택된 항목 복원
   * - 모달 표시 및 포커스 이동
   */
  openReferenceSelectionModal() {
    const app = this.mainApp;

    try {
      if (!app.referenceSelectionModal) {
        console.warn("⚠️ 레퍼런스 선택 모달을 찾을 수 없습니다.");
        return;
      }

      // 레퍼런스만 필터링 (type이 없는 경우 'edit'로 간주)
      const references = app.savedTexts.filter(
        (item) => (item.type || "edit") === "reference"
      );

      if (references.length === 0) {
        app.showMessage(
          "⚠️ 저장된 레퍼런스가 없습니다. 먼저 레퍼런스를 저장해주세요.",
          "info"
        );
        return;
      }

      // 레퍼런스 목록 렌더링
      this.renderReferenceSelectionList(references);

      // 검색/필터 초기화
      if (app.referenceSearchInput) app.referenceSearchInput.value = "";
      if (app.referenceTypeFilterModal)
        app.referenceTypeFilterModal.value = "all";

      // 선택 개수 업데이트
      this.updateReferenceSelectionCount();

      // 모달 표시
      app.referenceSelectionModal.style.display = "flex";
      document.body.style.overflow = "hidden"; // 배경 스크롤 방지

      // 접근성: 포커스 이동 (검색 입력 필드로)
      setTimeout(() => {
        if (app.referenceSearchInput) {
          app.referenceSearchInput.focus();
        }
      }, 100);

      console.log("📚 레퍼런스 선택 모달 열림");
    } catch (error) {
      console.error("모달 열기 실패:", error);
      app.showMessage("❌ 모달을 열 수 없습니다.", "error");
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
    const app = this.mainApp;

    if (!app.referenceSelectionModal) return;

    app.referenceSelectionModal.style.display = "none";
    document.body.style.overflow = ""; // 배경 스크롤 복원

    // 접근성: 포커스 복원
    if (app.selectReferencesBtn) {
      app.selectReferencesBtn.focus();
    }

    console.log("📚 레퍼런스 선택 모달 닫힘");
  }

  /**
   * 레퍼런스 선택 목록 렌더링
   *
   * @param {Array|null} references - 렌더링할 레퍼런스 배열 (null이면 전체 조회)
   */
  renderReferenceSelectionList(references = null) {
    const app = this.mainApp;

    if (!app.referenceSelectionList) return;

    try {
      // 레퍼런스 목록 가져오기 (파라미터 없으면 전체 조회)
      let refs =
        references ||
        app.savedTexts.filter((item) => (item.type || "edit") === "reference");

      // 검색 필터 적용
      const searchTerm =
        app.referenceSearchInput?.value.toLowerCase().trim() || "";
      if (searchTerm) {
        refs = refs.filter((ref) => {
          const content = (ref.content || "").toLowerCase();
          const topic = (ref.topic || "").toLowerCase();
          return content.includes(searchTerm) || topic.includes(searchTerm);
        });
      }

      // 타입 필터 적용
      const typeFilter = app.referenceTypeFilterModal?.value || "all";
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
        app.referenceSelectionList.innerHTML = `
          <div class="empty-state" style="padding: 40px; text-align: center; color: #6c757d;">
            <p>검색 결과가 없습니다.</p>
          </div>
        `;
        return;
      }

      const html = refs
        .map((ref) => {
          const isSelected = this._selectedReferences.includes(ref.id);

          // 텍스트 준비 (길이 제한)
          const contentRaw = ref.content || "";
          const isLong = contentRaw.length > 100;
          const contentDisplay = isLong
            ? contentRaw.substring(0, 100)
            : contentRaw;

          // 하이라이팅 적용
          const content = app.highlightText
            ? app.highlightText(contentDisplay, searchTerm)
            : contentDisplay;
          const topic = app.highlightText
            ? app.highlightText(ref.topic || "주제 없음", searchTerm)
            : ref.topic || "주제 없음";

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
            app.formatDateFromFirestore?.(ref.createdAt) || ref.date || "";

          return `
            <div class="reference-list-item" role="option" aria-selected="${isSelected}">
              <input 
                type="checkbox" 
                id="ref-check-${ref.id}" 
                value="${ref.id}"
                ${isSelected ? "checked" : ""}
                aria-labelledby="ref-label-${ref.id}">
              <div class="reference-item-content">
                <div class="reference-item-title" id="ref-label-${ref.id}">
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

      app.referenceSelectionList.innerHTML = html;

      // 체크박스 이벤트 바인딩
      this.bindReferenceCheckboxEvents();

      console.log(`✅ 레퍼런스 목록 렌더링 완료: ${refs.length}개`);
    } catch (error) {
      console.error("레퍼런스 목록 렌더링 실패:", error);
      app.referenceSelectionList.innerHTML = `
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
    const app = this.mainApp;

    if (!app.referenceSelectionList) return;

    // 체크박스 변경 이벤트
    const checkboxes = app.referenceSelectionList.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const refId = e.target.value;

        if (e.target.checked) {
          // 선택 추가
          if (!this._selectedReferences.includes(refId)) {
            this._selectedReferences.push(refId);
          }
        } else {
          // 선택 제거
          this._selectedReferences = this._selectedReferences.filter(
            (id) => id !== refId
          );
        }

        // 선택 개수 업데이트
        this.updateReferenceSelectionCount();

        console.log("선택된 레퍼런스:", this._selectedReferences);
      });
    });

    // 리스트 아이템 클릭 시 체크박스 토글 (UX 개선)
    const listItems = app.referenceSelectionList.querySelectorAll(
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
    const app = this.mainApp;
    const count = this._selectedReferences.length;

    if (app.modalSelectedCount) {
      app.modalSelectedCount.textContent = count;
    }

    // aria-live로 스크린 리더에 알림
    const selectionCountDiv =
      app.referenceSelectionModal?.querySelector(".selection-count");
    if (selectionCountDiv) {
      selectionCountDiv.setAttribute("aria-live", "polite");
    }
  }

  /**
   * 레퍼런스 선택 확인
   *
   * - 선택된 레퍼런스 태그 표시
   * - 모달 닫기
   * - 선택 개수 버튼 업데이트
   */
  confirmReferenceSelection() {
    const app = this.mainApp;

    try {
      // 태그 렌더링 (토글 버튼 카운트도 함께 업데이트)
      this.renderSelectedReferenceTags();

      // 버튼 개수 업데이트
      if (app.selectedRefCount) {
        app.selectedRefCount.textContent = `(${this._selectedReferences.length}개 선택됨)`;
      }

      // 토글 버튼 카운트 업데이트
      if (app.collapseRefCount) {
        app.collapseRefCount.textContent = `(${this._selectedReferences.length}개 선택됨)`;
      }

      // 모달 닫기
      this.closeReferenceSelectionModal();

      console.log(`✅ ${this._selectedReferences.length}개 레퍼런스 선택 완료`);
    } catch (error) {
      console.error("선택 확인 실패:", error);
      app.showMessage("❌ 선택을 저장할 수 없습니다.", "error");
    }
  }

  /**
   * 선택된 레퍼런스 태그 렌더링
   *
   * - 선택된 각 레퍼런스를 태그로 표시
   * - X 버튼으로 제거 가능
   */
  renderSelectedReferenceTags() {
    const app = this.mainApp;

    if (!app.selectedReferencesTags) return;

    try {
      if (this._selectedReferences.length === 0) {
        app.selectedReferencesTags.innerHTML = "";
        // 토글 버튼 카운트도 업데이트
        if (app.collapseRefCount) {
          app.collapseRefCount.textContent = "(0개 선택됨)";
        }
        return;
      }

      // 선택된 레퍼런스 객체 가져오기
      const selectedRefs = this._selectedReferences
        .map((refId) => app.savedTexts.find((item) => item.id === refId))
        .filter(Boolean); // null 제거

      const escapeHtml = app.escapeHtml ? app.escapeHtml.bind(app) : (str) => str;

      const html = selectedRefs
        .map((ref) => {
          const content = escapeHtml(ref.content || "").substring(0, 30);
          const title = `${content}${content.length >= 30 ? "..." : ""}`;

          return `
            <div class="reference-tag" role="listitem" data-ref-id="${ref.id}">
              <span class="tag-text" title="${escapeHtml(ref.content || "")}">
                ${title}
              </span>
              <button 
                class="remove-btn" 
                data-ref-id="${ref.id}"
                type="button"
                aria-label="${escapeHtml(content)} 제거"
                title="제거">
                ×
              </button>
            </div>
          `;
        })
        .join("");

      app.selectedReferencesTags.innerHTML = html;

      // 토글 버튼 카운트도 업데이트
      if (app.collapseRefCount) {
        app.collapseRefCount.textContent = `(${this._selectedReferences.length}개 선택됨)`;
      }

      // 제거 버튼 이벤트 바인딩
      this.bindReferenceTagRemoveEvents();

      console.log(`✅ ${selectedRefs.length}개 태그 렌더링 완료`);
    } catch (error) {
      console.error("태그 렌더링 실패:", error);
      app.selectedReferencesTags.innerHTML =
        '<p style="color: #dc3545;">태그를 표시할 수 없습니다.</p>';
    }
  }

  /**
   * 레퍼런스 태그 제거 버튼 이벤트 바인딩
   */
  bindReferenceTagRemoveEvents() {
    const app = this.mainApp;

    if (!app.selectedReferencesTags) return;

    const removeBtns =
      app.selectedReferencesTags.querySelectorAll(".remove-btn");

    removeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const refId = btn.getAttribute("data-ref-id");

        // 선택 배열에서 제거
        this._selectedReferences = this._selectedReferences.filter(
          (id) => id !== refId
        );

        // 태그 재렌더링
        this.renderSelectedReferenceTags();

        // 버튼 개수 업데이트
        if (app.selectedRefCount) {
          app.selectedRefCount.textContent = `(${this._selectedReferences.length}개 선택됨)`;
        }

        console.log(`레퍼런스 제거: ${refId}`);
      });
    });
  }

  /**
   * 레퍼런스 목록 필터링 (검색 + 타입)
   */
  filterReferenceList() {
    const app = this.mainApp;

    const searchTerm = app.referenceSearchInput?.value.toLowerCase() || "";
    const selectedType = app.referenceTypeFilterModal?.value || "all";

    let filtered = app.savedTexts.filter((item) => item.type === "reference");

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
   * 레퍼런스 선택/해제 토글 (레거시 호환용)
   * @deprecated bindReferenceCheckboxEvents의 change 이벤트로 대체됨
   */
  toggleReferenceSelection(refId) {
    const index = this._selectedReferences.indexOf(refId);
    if (index > -1) {
      // 이미 선택된 경우 제거
      this._selectedReferences.splice(index, 1);
    } else {
      // 선택되지 않은 경우 추가
      this._selectedReferences.push(refId);
    }

    this.updateReferenceSelectionCount();
  }

  /**
   * 선택된 레퍼런스 제거 (레거시 호환용, 전역 함수에서 호출)
   */
  removeSelectedReference(refId) {
    const app = this.mainApp;
    const index = this._selectedReferences.indexOf(refId);

    if (index > -1) {
      this._selectedReferences.splice(index, 1);
      this.renderSelectedReferenceTags();

      // 버튼 텍스트 업데이트
      if (app.selectedRefCount) {
        app.selectedRefCount.textContent = `(${this._selectedReferences.length}개 선택됨)`;
      }
    }
  }

  // ==================== 레퍼런스 연결 조회 메서드 (P3-03) ====================

  /**
   * 작성글에 연결된 레퍼런스 조회
   *
   * @param {string} editId - 작성글 ID
   * @returns {Array} 연결된 레퍼런스 객체 배열
   *
   * - 작성글의 linkedReferences ID 배열을 기반으로 레퍼런스 객체 조회
   * - 존재하지 않는 레퍼런스는 제외
   * - 최신순 정렬
   */
  getLinkedReferences(editId) {
    const app = this.mainApp;

    try {
      // 작성글 찾기
      const editItem = app.savedTexts.find((item) => item.id === editId);
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
          app.savedTexts.find(
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
    const app = this.mainApp;

    try {
      // 작성글만 필터링 + linkedReferences에 referenceId 포함
      const edits = app.savedTexts.filter(
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
   * 여러 레퍼런스의 사용 여부를 배치로 확인
   *
   * **성능 최적화 전략:**
   * - 모든 레퍼런스 포스트를 한 번의 쿼리로 조회
   * - JavaScript에서 그룹핑하여 카운트 (Firebase `whereIn` 10개 제한 회피)
   *
   * @param {Array<string>} referenceTextIds - 레퍼런스 텍스트 ID 배열
   * @returns {Promise<Object>} 사용 횟수 객체: `{ textId1: count1, textId2: count2, ... }`
   */
  async checkMultipleReferenceUsage(referenceTextIds) {
    const app = this.mainApp;

    // 에러 처리: 빈 배열 입력 처리
    if (!Array.isArray(referenceTextIds) || referenceTextIds.length === 0) {
      return {};
    }

    // 에러 처리: Firebase 준비 상태 확인
    if (!app.isFirebaseReady) {
      console.warn(
        "checkMultipleReferenceUsage: Firebase가 준비되지 않았습니다."
      );
      return referenceTextIds.reduce((result, id) => {
        result[id] = 0;
        return result;
      }, {});
    }

    // 에러 처리: 사용자 로그인 여부 확인
    if (!app.currentUser) {
      console.warn(
        "checkMultipleReferenceUsage: 사용자가 로그인하지 않았습니다."
      );
      return referenceTextIds.reduce((result, id) => {
        result[id] = 0;
        return result;
      }, {});
    }

    try {
      // Firebase posts 컬렉션 참조
      const postsRef = window.firebaseCollection(
        app.db,
        "users",
        app.currentUser.uid,
        "posts"
      );

      // 성능 최적화: sourceType이 'reference'인 모든 포스트를 한 번의 쿼리로 조회
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceType", "==", "reference")
      );

      const querySnapshot = await window.firebaseGetDocs(q);

      // 사용 횟수 계산을 위한 Map 초기화
      const usageMap = new Map();
      referenceTextIds.forEach((id) => {
        if (id && typeof id === "string") {
          usageMap.set(id, 0);
        }
      });

      // 쿼리 결과를 순회하며 sourceTextId별로 카운트
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const sourceTextId = data.sourceTextId;

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
      console.error("여러 레퍼런스 사용 여부 확인 실패:", error);
      return referenceTextIds.reduce((result, id) => {
        result[id] = 0;
        return result;
      }, {});
    }
  }

  /**
   * 작성글이 연결한 레퍼런스 목록 모달 표시
   *
   * @param {string} editId - 작성글 ID
   *
   * - 작성글이 연결한 레퍼런스 목록 조회
   * - 커스텀 모달로 표시
   * - 각 레퍼런스 "내용 보기" 버튼 제공
   */
  showLinkedReferencesModal(editId) {
    const app = this.mainApp;

    try {
      const editItem = app.savedTexts.find((item) => item.id === editId);
      if (!editItem) {
        app.showMessage("❌ 작성글을 찾을 수 없습니다.", "error");
        return;
      }

      const linkedRefs = this.getLinkedReferences(editId);

      if (linkedRefs.length === 0) {
        app.showMessage("ℹ️ 연결된 레퍼런스가 없습니다.", "info");
        return;
      }

      // 모달 내용 생성
      const editTitle = app.escapeHtml(editItem.content || "").substring(0, 50);
      const refsHtml = linkedRefs
        .map((ref, index) => {
          const content = app.escapeHtml(ref.content || "").substring(0, 100);
          const date =
            app.formatDateFromFirestore(ref.createdAt) || ref.date || "";
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
                  <span class="reference-type-badge badge-${app.escapeHtml(
                    refType
                  )}">${app.escapeHtml(refTypeLabel)}</span>
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
      app.bindCustomModalEvents(modal);

      console.log(`📚 연결 레퍼런스 모달 표시: ${linkedRefs.length}개`);
    } catch (error) {
      console.error("연결된 레퍼런스 모달 표시 실패:", error);
      app.showMessage("❌ 레퍼런스를 불러올 수 없습니다.", "error");
    }
  }

  /**
   * 레퍼런스를 참고한 작성글 목록 모달 표시
   *
   * @param {string} refId - 레퍼런스 ID
   *
   * - 레퍼런스를 참고한 작성글 목록 조회 (역방향)
   * - 커스텀 모달로 표시
   * - 각 작성글 "내용 보기" 버튼 제공
   */
  showEditsByReferenceModal(refId) {
    const app = this.mainApp;

    try {
      const refItem = app.savedTexts.find((item) => item.id === refId);
      if (!refItem) {
        app.showMessage("❌ 레퍼런스를 찾을 수 없습니다.", "error");
        return;
      }

      const usedEdits = this.getEditsByReference(refId);

      if (usedEdits.length === 0) {
        app.showMessage("ℹ️ 이 레퍼런스를 참고한 글이 없습니다.", "info");
        return;
      }

      // 모달 내용 생성
      const refTitle = app.escapeHtml(refItem.content || "").substring(0, 50);
      const editsHtml = usedEdits
        .map((edit, index) => {
          const content = app.escapeHtml(edit.content || "").substring(0, 100);
          const date =
            app.formatDateFromFirestore(edit.createdAt) || edit.date || "";
          const topic = app.escapeHtml(edit.topic || "주제 없음");

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
      app.bindCustomModalEvents(modal);

      console.log(`📝 참고한 작성글 모달 표시: ${usedEdits.length}개`);
    } catch (error) {
      console.error("참고한 작성글 모달 표시 실패:", error);
      app.showMessage("❌ 작성글을 불러올 수 없습니다.", "error");
    }
  }

  // ==================== 레퍼런스 로더 패널 메서드 (P3-04) ====================

  /**
   * 레퍼런스 불러오기 패널 초기화
   *
   * [역할]
   * - DOM 요소 참조 설정
   * - 이벤트 리스너 바인딩 (열기/닫기/탭 전환 등)
   * - ESC 키 핸들러 설정
   *
   * [호출 시점] init() 메서드에서 호출
   */
  initReferenceLoader() {
    const app = this.mainApp;

    // ===== DOM 요소 참조 =====
    app.referenceLoaderPanel = document.getElementById("reference-loader-panel");
    app.referenceLoaderCloseBtn = document.getElementById("reference-loader-close");
    app.referenceTabs = document.querySelectorAll(".reference-tab");
    app.referenceSavedContent = document.getElementById("reference-saved-content");
    app.referenceTrackingContent = document.getElementById("reference-tracking-content");
    app.referenceSavedList = document.getElementById("reference-saved-list");
    app.referenceTrackingList = document.getElementById("reference-tracking-list");
    app.referenceSearchInput = document.getElementById("reference-search-input");
    app.referenceCategoryFilter = document.getElementById("reference-category-filter");
    app.referenceSortFilter = document.getElementById("reference-sort-filter");
    app.referenceTrackingFilters = document.getElementById("reference-tracking-filters");
    app.referenceRecentSection = document.getElementById("reference-recent-section");
    app.referenceRecentList = document.getElementById("reference-recent-list");

    // 확대 모드 관련 DOM 참조
    app.expandReferenceList = document.getElementById("expand-reference-list");
    app.expandReferenceEmpty = document.querySelector(".expand-reference-empty");

    // 유효성 검사
    if (!app.referenceLoaderPanel) {
      console.warn("⚠️ 레퍼런스 로더 패널을 찾을 수 없습니다.");
      return;
    }

    // ===== 이벤트 리스너: 패널 열기 (상세 모드) =====
    const detailLoadReferenceBtn = document.getElementById("detail-load-reference-btn");
    if (detailLoadReferenceBtn) {
      detailLoadReferenceBtn.addEventListener("click", () => {
        app.referenceLoaderMode = "detail";
        this.openReferenceLoader();
      });
    }

    // ===== 이벤트 리스너: 패널 열기 (확대 모드) =====
    const expandLoadReferenceBtn = document.getElementById("expand-load-reference-btn");
    if (expandLoadReferenceBtn) {
      expandLoadReferenceBtn.addEventListener("click", () => {
        app.referenceLoaderMode = "expand";
        this.openReferenceLoader();
      });
    }

    // ===== 이벤트 리스너: 패널 닫기 =====
    if (app.referenceLoaderCloseBtn) {
      app.referenceLoaderCloseBtn.addEventListener("click", () => {
        this.closeReferenceLoader();
      });
    }

    // ===== 이벤트 리스너: 탭 전환 =====
    app.referenceTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = e.currentTarget.getAttribute("data-tab");
        this.switchReferenceTab(tabName);
      });
    });

    // ===== 이벤트 리스너: 외부 클릭 시 닫기 =====
    app.referenceLoaderPanel.addEventListener("click", (e) => {
      if (
        e.target === app.referenceLoaderPanel ||
        e.target.classList.contains("reference-loader-overlay")
      ) {
        this.closeReferenceLoader();
      }
    });

    // ===== 이벤트 리스너: 검색 =====
    if (app.referenceSearchInput) {
      app.referenceSearchInput.addEventListener("input", () => {
        this.handleReferenceSearch(app.referenceSearchInput.value);
      });
    }

    // ===== 이벤트 리스너: 필터 변경 =====
    if (app.referenceCategoryFilter) {
      app.referenceCategoryFilter.addEventListener("change", () => {
        this.loadReferenceList();
      });
    }
    if (app.referenceSortFilter) {
      app.referenceSortFilter.addEventListener("change", () => {
        this.loadReferenceList();
      });
    }

    // ===== ESC 키로 닫기 =====
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        app.referenceLoaderPanel &&
        app.referenceLoaderPanel.style.display === "block"
      ) {
        this.closeReferenceLoader();
      }
    });

    // 현재 탭 초기화
    app.currentReferenceTab = "saved";

    console.log("✅ 레퍼런스 로더 패널 초기화 완료");
  }

  /**
   * 레퍼런스 로더 열기
   *
   * [역할]
   * - 패널 표시
   * - 탭 상태 초기화
   * - 데이터 로드
   */
  openReferenceLoader() {
    const app = this.mainApp;

    console.log("[openReferenceLoader] 함수 호출됨");
    if (!app.referenceLoaderPanel) {
      console.error("[openReferenceLoader] referenceLoaderPanel을 찾을 수 없습니다.");
      return;
    }

    const content = app.referenceLoaderPanel.querySelector(".reference-loader-content");

    // 패널 표시
    app.referenceLoaderPanel.style.display = "block";

    // 탭 상태 초기화 (활성 탭과 동기화)
    const activeTab = app.referenceLoaderPanel.querySelector(".reference-tab.active");
    if (activeTab) {
      const tabName = activeTab.getAttribute("data-tab") || "saved";
      app.currentReferenceTab = tabName;
    } else {
      app.currentReferenceTab = "saved";
    }

    // transform 초기화 (인라인 스타일 제거 후 CSS 적용)
    if (content) {
      content.style.transform = "";
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
          error: { message: error.message, stack: error.stack, name: error.name },
          timestamp: new Date().toISOString(),
        });
        app.showMessage("❌ 레퍼런스 목록을 불러오는 중 오류가 발생했습니다.", "error");
      }
    }, 20);
  }

  /**
   * 레퍼런스 로더 닫기
   *
   * [역할]
   * - 패널 숨김 (애니메이션 적용)
   * - 검색/필터 초기화
   */
  closeReferenceLoader() {
    const app = this.mainApp;

    if (!app.referenceLoaderPanel) return;

    const content = app.referenceLoaderPanel.querySelector(".reference-loader-content");
    if (content) {
      content.style.transform = "translateX(100%)";
    }

    setTimeout(() => {
      app.referenceLoaderPanel.style.display = "none";
      if (content) {
        content.style.transform = "";
      }
      if (app.referenceSearchInput) {
        app.referenceSearchInput.value = "";
      }
      if (app.referenceCategoryFilter) {
        app.referenceCategoryFilter.value = "";
      }
      if (app.referenceSortFilter) {
        app.referenceSortFilter.value = "recent";
      }
    }, 300);
  }

  /**
   * 레퍼런스 탭 전환
   *
   * @param {string} tabName - 탭 이름 ('saved' 또는 'tracking')
   */
  switchReferenceTab(tabName) {
    const app = this.mainApp;

    app.currentReferenceTab = tabName;

    // 탭 버튼 업데이트
    app.referenceTabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-tab") === tabName;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive.toString());
    });

    // 콘텐츠 업데이트
    if (app.referenceSavedContent) {
      app.referenceSavedContent.classList.toggle("active", tabName === "saved");
      app.referenceSavedContent.style.display = tabName === "saved" ? "block" : "none";
    }

    if (app.referenceTrackingContent) {
      app.referenceTrackingContent.classList.toggle("active", tabName === "tracking");
      app.referenceTrackingContent.style.display = tabName === "tracking" ? "block" : "none";
    }

    // 필터 표시/숨김
    if (app.referenceTrackingFilters) {
      app.referenceTrackingFilters.style.display = tabName === "tracking" ? "flex" : "none";
    }

    // 목록 로드
    this.loadReferenceList();
  }

  /**
   * 레퍼런스 검색 처리 (디바운스 적용)
   *
   * @param {string} query - 검색어
   */
  handleReferenceSearch(query) {
    const app = this.mainApp;

    clearTimeout(app.referenceSearchDebounce);
    app.referenceSearchDebounce = setTimeout(() => {
      this.loadReferenceList();
    }, 300);
  }

  /**
   * 레퍼런스 목록 로드
   *
   * [역할]
   * - 현재 탭에 따라 저장된 글 또는 트래킹 글 로드
   * - 검색/필터 적용
   */
  async loadReferenceList() {
    const app = this.mainApp;

    if (!app.currentUser || !app.isFirebaseReady) {
      console.warn("[loadReferenceList] 사용자 또는 Firebase 준비 상태 확인:", {
        hasUser: !!app.currentUser,
        isFirebaseReady: app.isFirebaseReady,
      });
      return;
    }

    if (!app.currentReferenceTab) {
      app.currentReferenceTab = "saved";
    }

    const searchQuery = app.referenceSearchInput?.value.trim().toLowerCase() || "";
    const categoryFilter = app.referenceCategoryFilter?.value || "";
    const sortFilter = app.referenceSortFilter?.value || "recent";

    try {
      if (app.currentReferenceTab === "saved") {
        await this.loadSavedReferences(searchQuery, categoryFilter);
      } else if (app.currentReferenceTab === "tracking") {
        await this.loadTrackingReferences(searchQuery, categoryFilter, sortFilter);
      } else {
        console.warn("[loadReferenceList] 알 수 없는 탭:", app.currentReferenceTab);
        app.currentReferenceTab = "saved";
        await this.loadSavedReferences(searchQuery, categoryFilter);
      }
    } catch (error) {
      console.error("[loadReferenceList] 레퍼런스 목록 로드 실패:", {
        function: "loadReferenceList",
        currentTab: app.currentReferenceTab,
        error: { message: error.message, stack: error.stack, name: error.name },
        timestamp: new Date().toISOString(),
      });
      app.showMessage("❌ 레퍼런스 목록을 불러오는 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 저장된 글 레퍼런스 로드
   *
   * @param {string} searchQuery - 검색어
   * @param {string} categoryFilter - 카테고리 필터
   */
  async loadSavedReferences(searchQuery = "", categoryFilter = "") {
    const app = this.mainApp;

    if (!app.referenceSavedList) return;

    // 저장된 글 목록이 없으면 로드
    if (!app.savedTexts || app.savedTexts.length === 0) {
      await app.loadSavedTexts();
    }

    // 필터링
    let filtered = app.savedTexts.filter((text) => {
      const type = text.type || "edit";
      if (type !== "edit" && type !== "script") return false;

      // 검색어 필터
      if (searchQuery) {
        const title = app.extractTitleFromContent(text.content || "").toLowerCase();
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
    this.renderReferenceList(filtered, app.referenceSavedList, "saved");

    // 빈 상태 처리
    const emptyEl = document.getElementById("reference-saved-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * 트래킹 레퍼런스 로드
   *
   * @param {string} searchQuery - 검색어
   * @param {string} categoryFilter - 카테고리 필터
   * @param {string} sortFilter - 정렬 필터
   */
  async loadTrackingReferences(searchQuery = "", categoryFilter = "", sortFilter = "recent") {
    const app = this.mainApp;

    if (!app.referenceTrackingList) return;

    // 트래킹 포스트 목록이 없으면 로드
    if (!app.trackingPosts || app.trackingPosts.length === 0) {
      await app.loadTrackingPosts();
    }

    // 필터링
    let filtered = app.trackingPosts.filter((post) => {
      if (searchQuery) {
        const content = (post.content || "").toLowerCase();
        if (!content.includes(searchQuery)) return false;
      }
      return true;
    });

    // 정렬
    filtered.sort((a, b) => {
      if (sortFilter === "views") {
        const viewsA = app.getLatestMetricValue?.(a, "views") || 0;
        const viewsB = app.getLatestMetricValue?.(b, "views") || 0;
        return viewsB - viewsA;
      } else if (sortFilter === "likes") {
        const likesA = app.getLatestMetricValue?.(a, "likes") || 0;
        const likesB = app.getLatestMetricValue?.(b, "likes") || 0;
        return likesB - likesA;
      } else if (sortFilter === "follows") {
        const followsA = app.getLatestMetricValue?.(a, "follows") || 0;
        const followsB = app.getLatestMetricValue?.(b, "follows") || 0;
        return followsB - followsA;
      } else {
        const dateA = a.postedAt || new Date(0);
        const dateB = b.postedAt || new Date(0);
        return dateB - dateA;
      }
    });

    // 렌더링
    this.renderReferenceList(filtered, app.referenceTrackingList, "tracking");

    // 빈 상태 처리
    const emptyEl = document.getElementById("reference-tracking-empty");
    if (emptyEl) {
      emptyEl.style.display = filtered.length === 0 ? "block" : "none";
    }
  }

  /**
   * 레퍼런스 목록 렌더링
   *
   * @param {Array} items - 렌더링할 아이템 배열
   * @param {HTMLElement} container - 렌더링할 컨테이너
   * @param {string} sourceType - 소스 타입 ('saved' 또는 'tracking')
   */
  renderReferenceList(items, container, sourceType) {
    const app = this.mainApp;

    if (!container) return;

    container.innerHTML = "";

    items.forEach((item) => {
      const itemEl = this.createReferenceItem(item, sourceType);
      container.appendChild(itemEl);
    });
  }

  /**
   * 레퍼런스 아이템 DOM 생성
   *
   * @param {Object} item - 레퍼런스 아이템 데이터
   * @param {string} sourceType - 소스 타입
   * @returns {HTMLElement} 생성된 DOM 요소
   */
  createReferenceItem(item, sourceType) {
    const app = this.mainApp;

    const div = document.createElement("div");
    div.className = "reference-item";
    div.setAttribute("data-item-id", item.id);
    div.setAttribute("data-source-type", sourceType);

    const title =
      sourceType === "saved"
        ? item.title || "제목 없음"
        : (item.content || "").substring(0, 50) + (item.content?.length > 50 ? "..." : "");

    const content = (item.content || "").substring(0, 150);
    let date = "";
    if (sourceType === "saved") {
      date = item.createdAt
        ? app.formatDateFromFirestore(item.createdAt)
        : item.date || "";
    } else {
      if (item.postedAt) {
        if (item.postedAt.toDate) {
          date = app.formatDateFromFirestore(item.postedAt);
        } else if (item.postedAt instanceof Date) {
          date = item.postedAt.toLocaleDateString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit",
          });
        } else {
          date = new Date(item.postedAt).toLocaleDateString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit",
          });
        }
      }
    }

    let metaHtml = `<span>📅 ${date}</span>`;

    if (sourceType === "tracking") {
      const views = app.getLatestMetricValue?.(item, "views") || 0;
      const likes = app.getLatestMetricValue?.(item, "likes") || 0;
      const follows = app.getLatestMetricValue?.(item, "follows") || 0;
      metaHtml += `<span>👀 ${views}</span>`;
      metaHtml += `<span>❤️ ${likes}</span>`;
      metaHtml += `<span>👥 ${follows}</span>`;
    } else {
      const category = item.topic || "미분류";
      metaHtml += `<span>📁 ${app.escapeHtml(category)}</span>`;
    }

    div.innerHTML = `
      <div class="reference-item-header">
        <div class="reference-item-title">${app.escapeHtml(title)}</div>
      </div>
      <div class="reference-item-content">${app.escapeHtml(content)}</div>
      <div class="reference-item-meta">
        ${metaHtml}
      </div>
      <div class="reference-item-actions">
        <button class="reference-item-btn" data-action="add">추가하기</button>
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
   *
   * [역할]
   * - 확대 모드가 닫혀있으면 자동으로 열고 레퍼런스를 추가
   * - 파라미터 유효성 검사
   * - 최근 사용 목록 갱신
   *
   * @param {Object} item - 레퍼런스 아이템 객체
   * @param {string} sourceType - 레퍼런스 소스 타입 ('saved' 또는 'tracking')
   */
  addReferenceToContent(item, sourceType) {
    const app = this.mainApp;

    // 필수 DOM 요소 존재 여부 확인
    if (!app.scriptContentTextarea) {
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
        timestamp: new Date().toISOString(),
      });
      app.showMessage("❌ 레퍼런스 정보가 올바르지 않습니다.", "error");
      return;
    }

    const content = item.content || "";
    if (!content.trim()) {
      app.showMessage("❌ 레퍼런스 내용이 비어있습니다.", "error");
      return;
    }

    // sourceType 파라미터 유효성 검사
    const validSourceTypes = ["saved", "tracking"];
    if (!sourceType || !validSourceTypes.includes(sourceType)) {
      console.error("[addReferenceToContent] 유효하지 않은 sourceType:", {
        function: "addReferenceToContent",
        receivedValue: sourceType,
        validValues: validSourceTypes,
        timestamp: new Date().toISOString(),
      });
      app.showMessage("❌ 지원하지 않는 레퍼런스 소스 타입입니다.", "error");
      return;
    }

    // 확대 모드 열림 상태 확인
    const isExpandModeOpen =
      app.contentExpandModal && app.contentExpandModal.style.display === "block";

    // 확대 모드가 닫혀있으면 먼저 열기
    if (!isExpandModeOpen) {
      if (!app.contentExpandModal || !app.expandContentTextarea) {
        console.error("[addReferenceToContent] 확대 모드 관련 DOM 요소 없음");
        app.showMessage("❌ 확대 모드를 열 수 없습니다.", "error");
        return;
      }

      try {
        app.openExpandMode();

        // 모달이 열린 후 레퍼런스 추가 (애니메이션 완료 대기)
        const delay = app.constructor.CONFIG?.EXPAND_MODE_ANIMATION_DELAY || 350;
        setTimeout(() => {
          this._addReferenceToExpandModeAndNotify(item, sourceType, true);
        }, delay);
        return;
      } catch (error) {
        console.error("[addReferenceToContent] 확대 모드 열기 중 오류 발생:", error);
        app.showMessage("❌ 확대 모드를 열 수 없습니다.", "error");
        return;
      }
    }

    // 확대 모드가 이미 열려있는 경우
    this._addReferenceToExpandModeAndNotify(item, sourceType, false);
  }

  /**
   * 레퍼런스를 확대 모드에 추가하고 사용자에게 알림
   *
   * @param {Object} item - 레퍼런스 아이템 객체
   * @param {string} sourceType - 레퍼런스 소스 타입
   * @param {boolean} isNewlyOpened - 확대 모드가 방금 열렸는지 여부
   * @private
   */
  _addReferenceToExpandModeAndNotify(item, sourceType, isNewlyOpened) {
    const app = this.mainApp;

    try {
      // 레퍼런스 추가
      this.addReferenceToExpandMode(item, sourceType);

      // 최근 사용 목록에 추가
      if (item.id && sourceType) {
        app.addToRecentReferences?.(item.id, sourceType);
      }

      // 사이드 패널 닫기
      this.closeReferenceLoader();

      // 스크린 리더 사용자를 위한 알림
      const screenReaderMessage = isNewlyOpened
        ? "레퍼런스가 확대 모드의 레퍼런스 영역에 추가되었습니다."
        : "레퍼런스가 레퍼런스 영역에 추가되었습니다.";
      app.announceToScreenReader?.(screenReaderMessage);

      // 성공 메시지
      app.showMessage(
        "✅ 레퍼런스가 추가되었습니다. 왼쪽 레퍼런스 영역에서 확인하세요.",
        "success"
      );

      // 확대 모드가 방금 열린 경우에만 포커스 관리
      if (isNewlyOpened) {
        const delay = app.constructor.CONFIG?.FOCUS_MANAGEMENT_DELAY_MS || 100;
        setTimeout(() => {
          const firstReference = app.expandReferenceList?.querySelector(".expand-reference-item");
          if (firstReference) {
            firstReference.setAttribute("tabindex", "0");
            firstReference.focus();
          }
        }, delay);
      }
    } catch (error) {
      console.error("[_addReferenceToExpandModeAndNotify] 레퍼런스 추가 중 오류 발생:", error);
      app.showMessage("❌ 레퍼런스 추가 중 오류가 발생했습니다.", "error");
    }
  }

  /**
   * 확대 모드에 레퍼런스 추가
   *
   * [역할]
   * - 중복 체크
   * - 최대 개수 제한 확인
   * - expandReferences 배열에 추가
   * - 렌더링
   *
   * @param {Object} item - 레퍼런스 아이템
   * @param {string} sourceType - 소스 타입
   */
  addReferenceToExpandMode(item, sourceType) {
    const app = this.mainApp;

    if (!item || !item.content) return;

    // expandReferences 배열이 없으면 초기화
    if (!app.expandReferences) {
      app.expandReferences = [];
    }

    // 중복 체크
    const exists = app.expandReferences.some(
      (ref) => ref.id === item.id && ref.sourceType === sourceType
    );

    if (exists) {
      app.showMessage("ℹ️ 이미 추가된 레퍼런스입니다.", "info");
      return;
    }

    // 최대 개수 제한 확인
    const maxReferences = app.constructor.CONFIG?.MAX_EXPAND_REFERENCES || 10;
    if (app.expandReferences.length >= maxReferences) {
      app.showMessage(`⚠️ 레퍼런스는 최대 ${maxReferences}개까지 추가할 수 있습니다.`, "error");
      return;
    }

    // 레퍼런스 추가
    const newReference = {
      id: item.id,
      sourceType: sourceType,
      content: item.content,
      title:
        sourceType === "saved"
          ? item.title || "제목 없음"
          : (item.content || "").substring(0, 50),
      date:
        sourceType === "saved"
          ? item.createdAt
            ? app.formatDateFromFirestore(item.createdAt)
            : item.date || ""
          : item.postedAt
          ? new Date(item.postedAt).toLocaleDateString("ko-KR")
          : "",
      category: item.topic || "미분류",
    };

    app.expandReferences.push(newReference);

    // 렌더링
    app.renderExpandReferences?.(newReference.id);

    // 성공 메시지
    app.showMessage("✅ 레퍼런스가 추가되었습니다.", "success");
  }

  /**
   * 최근 사용 레퍼런스 목록 렌더링
   */
  async loadRecentReferencesList() {
    const app = this.mainApp;

    if (!app.referenceRecentList || !app.referenceRecentSection) return;

    if (!this._recentReferences || this._recentReferences.length === 0) {
      app.referenceRecentSection.style.display = "none";
      return;
    }

    app.referenceRecentSection.style.display = "block";
    app.referenceRecentList.innerHTML = "";

    const recent = this._recentReferences.slice(0, 5);

    for (const ref of recent) {
      try {
        let item = null;

        if (ref.sourceType === "saved") {
          if (!app.savedTexts || app.savedTexts.length === 0) {
            await app.loadSavedTexts();
          }
          item = app.savedTexts.find((t) => t.id === ref.id);
        } else {
          if (!app.trackingPosts || app.trackingPosts.length === 0) {
            await app.loadTrackingPosts();
          }
          item = app.trackingPosts.find((p) => p.id === ref.id);
        }

        if (item) {
          const itemEl = this.createReferenceItem(item, ref.sourceType);
          app.referenceRecentList.appendChild(itemEl);
        }
      } catch (error) {
        console.error("최근 레퍼런스 로드 실패:", error);
      }
    }
  }

  // ==================== 중복 체크 메서드 (P3-05) ====================
  // [이동됨] script.js에서 이동된 메서드들
  // 실시간 중복 체크, 텍스트 정규화, 해시 계산, 중복 확인 모달 관련 기능

  /**
   * 실시간 중복 체크 초기화
   * 레퍼런스 입력 시 debounce를 적용하여 기존 레퍼런스와 중복 여부를 검사합니다.
   *
   * 성능 최적화:
   * - Debounce 시간: 600ms (빠른 타이핑 시 불필요한 검색 감소)
   * - 최소 길이 체크: 10자 미만은 검사 생략
   */
  initLiveDuplicateCheck() {
    const app = this.mainApp;
    if (!app.refTextInput) return;

    // 힌트 영역이 없다면 생성
    let hint = document.getElementById("ref-duplicate-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "ref-duplicate-hint";
      hint.setAttribute("role", "alert");
      hint.setAttribute("aria-live", "polite");
      hint.style.cssText =
        "margin-top:8px;font-size:0.9rem;display:none;color:#b35400;background:#fff3cd;border:1px solid #ffeeba;padding:8px;border-radius:8px;";
      app.refTextInput.parentElement &&
        app.refTextInput.parentElement.appendChild(hint);
    }

    // ✅ 성능 최적화: 설정 상수 사용 (향후 조정 용이)
    const DEBOUNCE_MS = app.constructor.CONFIG.DEBOUNCE_DUPLICATE_CHECK_MS;
    const MIN_LENGTH = app.constructor.CONFIG.DUPLICATE_CHECK_MIN_LENGTH;

    app.refTextInput.addEventListener("input", () => {
      // 디바운스 처리
      clearTimeout(app.debounceTimers.refDuplicate);
      app.debounceTimers.refDuplicate = setTimeout(() => {
        const value = app.refTextInput.value || "";
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
   * @param {Object} duplicate - 중복된 레퍼런스 정보 객체
   */
  showInlineDuplicateHint(duplicate) {
    const app = this.mainApp;
    const hint = document.getElementById("ref-duplicate-hint");
    if (!hint) return;
    const createdAtStr = app.formatDate?.(duplicate?.createdAt) || "";
    const topicStr = duplicate?.topic
      ? ` · 주제: ${app.escapeHtml?.(duplicate.topic) || duplicate.topic}`
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
   * 텍스트 내용을 정규화합니다.
   * 공백, 줄바꿈, 캐리지 리턴 등을 일관된 형태로 변환합니다.
   *
   * @param {string} text - 원본 텍스트
   * @returns {string} 정규화된 텍스트 (빈 문자열 또는 정규화된 텍스트)
   *
   * @example
   * normalizeContent('hello   world') // 'hello world'
   * normalizeContent('hello\nworld') // 'hello world'
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
   * 저장된 레퍼런스(`savedTexts` 중 type === 'reference'인 항목)와
   * 입력된 내용(`content`)을 정규화하여 완전 일치 여부를 확인합니다.
   * 첫 번째로 발견된 중복 레퍼런스 객체를 반환하며, 없으면 null을 반환합니다.
   *
   * 성능: O(N) - 레퍼런스 수가 많지 않은 현재 구조에서 적합하며,
   * 추후 해시 기반 최적화로 확장 가능합니다.
   *
   * @param {string} content - 확인할 레퍼런스 내용
   * @returns {Object|null} 중복된 레퍼런스 객체 또는 null
   *
   * @example
   * const dup = this.checkDuplicateReference('  같은  내용\\n입니다 ');
   * if (dup) { console.log('중복 발견:', dup.id); }
   */
  checkDuplicateReference(content) {
    const app = this.mainApp;

    // 안전성 체크
    if (!content || typeof content !== "string") {
      return null;
    }
    if (!Array.isArray(app.savedTexts) || app.savedTexts.length === 0) {
      return null;
    }

    // 1) 해시가 있는 경우: 해시 우선 비교
    try {
      const normalizedForHash = this.normalizeContent(content);
      const targetHash = this.calculateContentHashSync
        ? this.calculateContentHashSync(normalizedForHash)
        : null;

      if (targetHash) {
        const byHash = app.savedTexts.find((item) => {
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
    const duplicate = app.savedTexts.find((item) => {
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
   * 중복 레퍼런스 발견 시 사용자에게 확인 모달을 표시합니다.
   *
   * 사용자 선택:
   * - 취소: 저장하지 않고 모달 닫기 (false 반환)
   * - 기존 레퍼런스 보기: 레퍼런스 탭으로 이동 (false 반환)
   * - 그래도 저장: 중복임에도 저장 진행 (true 반환)
   *
   * @param {Object} duplicate - 중복된 레퍼런스 정보 객체
   * @returns {Promise<boolean>} true: 그래도 저장, false: 취소/보기 선택
   */
  async showDuplicateConfirmModal(duplicate) {
    const app = this.mainApp;

    return new Promise((resolve) => {
      // 기존 모달 제거 (중복 표시 방지)
      const existing = document.getElementById("duplicate-confirm-overlay");
      if (existing) existing.remove();

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

      const createdAtStr = app.formatDateFromFirestore?.(duplicate?.createdAt) || "";
      const topicStr = duplicate?.topic ? app.escapeHtml?.(duplicate.topic) || duplicate.topic : "";
      const contentPreview =
        (app.escapeHtml?.((duplicate?.content || "").substring(0, 140)) ||
          (duplicate?.content || "").substring(0, 140)) +
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
            app.setSavedFilter && app.setSavedFilter("reference");
            await app.refreshSavedTextsUI?.();
          } catch (err) {
            console.warn("기존 레퍼런스 보기 처리 중 경고:", err);
          }
          cleanup(false);
        });
      modal
        .querySelector('[data-action="save"]')
        .addEventListener("click", () => cleanup(true));

      // 포커스 초기 버튼으로 이동
      const firstBtn = modal.querySelector('[data-action="save"]');
      if (firstBtn) firstBtn.focus();
    });
  }
}
