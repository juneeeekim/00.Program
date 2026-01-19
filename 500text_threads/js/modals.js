/**
 * ==================== ModalManager ====================
 * 모달/바텀시트 관리 모듈
 *
 * [역할]
 * - 모달 열기/닫기 관리
 * - 바텀시트 드래그 제스처 처리
 * - ESC 키 및 외부 클릭 이벤트 핸들링
 * - 접근성 (ARIA) 속성 관리
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team - Phase 6
 */

export class ModalManager {
  /**
   * ModalManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 모달 상태 ====================
    /**
     * 현재 열려있는 모달 스택
     * - LIFO 방식으로 관리 (마지막에 열린 모달이 먼저 닫힘)
     */
    this._openModals = [];

    // ==================== 확장 모달 DOM 참조 ====================
    this._expandModal = null;
    this._expandModalContent = null;
    this._expandModalCloseBtn = null;

    // ==================== 이벤트 핸들러 바인딩 ====================
    this._handleEscKey = this._handleEscKey.bind(this);
    this._handleOutsideClick = this._handleOutsideClick.bind(this);

    console.log("✅ ModalManager 초기화 완료");
  }

  // ==================== Getter/Setter: openModals ====================

  /**
   * 열려있는 모달 스택 getter
   * @returns {Array} 열려있는 모달 배열
   */
  get openModals() {
    return this._openModals;
  }

  // ==================== 확장 모달 초기화 (Phase 6-01) ====================

  /**
   * 확장 모달 초기화
   * - DOM 요소 참조 설정
   * - 이벤트 리스너 등록
   */
  initExpandModal() {
    const app = this.mainApp;

    this._expandModal = document.getElementById("content-expand-modal");
    this._expandModalContent = document.getElementById("expand-modal-content");
    this._expandModalCloseBtn = document.getElementById("expand-modal-close");

    // 닫기 버튼 이벤트
    if (this._expandModalCloseBtn) {
      this._expandModalCloseBtn.addEventListener("click", () => {
        this.closeExpandModal();
      });
    }

    // ESC 키 이벤트 (전역)
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this._expandModal &&
        this._expandModal.style.display === "block"
      ) {
        this.closeExpandModal();
      }
    });
  }

  /**
   * 확장 모달 열기
   * @param {string} content - 표시할 콘텐츠 (HTML)
   */
  openExpandModal(content) {
    if (!this._expandModal) return;

    if (this._expandModalContent) {
      this._expandModalContent.innerHTML = content;
    }
    this._expandModal.style.display = "block";

    // 접근성: 포커스 이동
    if (this._expandModalCloseBtn) {
      this._expandModalCloseBtn.focus();
    }

    // 모달 스택에 추가
    this._addToModalStack("expand-modal");
  }

  /**
   * 확장 모달 닫기
   */
  closeExpandModal() {
    if (this._expandModal) {
      this._expandModal.style.display = "none";
    }

    // 모달 스택에서 제거
    this._removeFromModalStack("expand-modal");
  }

  // ==================== 마이그레이션 모달 (Phase 6-01) ====================

  /**
   * 마이그레이션 진행 모달 표시
   * @param {number} total - 총 마이그레이션 항목 수
   */
  showMigrationProgressModal(total) {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "flex";
      const progressText = modal.querySelector(".progress-text");
      const progressBar = modal.querySelector(".progress-fill");
      if (progressText) progressText.textContent = `0 / ${total}`;
      if (progressBar) progressBar.style.width = "0%";

      this._addToModalStack("migration-progress-modal");
    }
  }

  /**
   * 마이그레이션 진행 상황 업데이트
   * @param {number} current - 현재 완료된 항목 수
   * @param {number} total - 총 항목 수
   */
  updateMigrationProgress(current, total) {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      const progressText = modal.querySelector(".progress-text");
      const progressBar = modal.querySelector(".progress-fill");
      if (progressText) progressText.textContent = `${current} / ${total}`;
      if (progressBar) {
        const percent = total > 0 ? (current / total) * 100 : 0;
        progressBar.style.width = `${percent}%`;
      }
    }
  }

  /**
   * 마이그레이션 진행 모달 숨기기
   */
  hideMigrationProgressModal() {
    const modal = document.getElementById("migration-progress-modal");
    if (modal) {
      modal.style.display = "none";
      this._removeFromModalStack("migration-progress-modal");
    }
  }

  // ==================== 수동 복사 모달 (Phase 6-01) ====================

  /**
   * 수동 복사 모달 표시
   * - 클립보드 API 실패 시 대체 UI
   * @param {string} content - 복사할 콘텐츠
   */
  showManualCopyModal(content) {
    const app = this.mainApp;
    const modal = document.createElement("div");
    modal.className = "manual-copy-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "수동 복사");
    modal.innerHTML = `
      <div class="modal-content">
        <p>아래 텍스트를 직접 복사해 주세요 (Ctrl+C / Cmd+C)</p>
        <textarea class="copy-textarea" readonly>${app.escapeHtml(content)}</textarea>
        <div class="modal-actions">
          <button class="btn-close" onclick="this.closest('.manual-copy-modal').remove()">닫기</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 텍스트 선택
    const textarea = modal.querySelector(".copy-textarea");
    if (textarea) {
      textarea.focus();
      textarea.select();
    }

    this._addToModalStack("manual-copy-modal");
  }

  // ==================== 공통 모달 유틸리티 (Phase 6-01) ====================

  /**
   * 모달 스택에 추가
   * @param {string} modalId - 모달 식별자
   */
  _addToModalStack(modalId) {
    if (!this._openModals.includes(modalId)) {
      this._openModals.push(modalId);
    }
  }

  /**
   * 모달 스택에서 제거
   * @param {string} modalId - 모달 식별자
   */
  _removeFromModalStack(modalId) {
    const index = this._openModals.indexOf(modalId);
    if (index > -1) {
      this._openModals.splice(index, 1);
    }
  }

  /**
   * ESC 키 핸들러
   * @param {KeyboardEvent} e - 키보드 이벤트
   */
  _handleEscKey(e) {
    if (e.key === "Escape" && this._openModals.length > 0) {
      // 가장 최근에 열린 모달 닫기
      const lastModal = this._openModals[this._openModals.length - 1];
      this.closeModalById(lastModal);
    }
  }

  /**
   * 외부 클릭 핸들러
   * @param {MouseEvent} e - 마우스 이벤트
   */
  _handleOutsideClick(e) {
    // 모달 외부 클릭 시 닫기 로직
    const modal = e.target.closest(".modal-content, .bottom-sheet-content");
    if (!modal && this._openModals.length > 0) {
      const lastModal = this._openModals[this._openModals.length - 1];
      this.closeModalById(lastModal);
    }
  }

  /**
   * ID로 모달 닫기
   * @param {string} modalId - 모달 식별자
   */
  closeModalById(modalId) {
    switch (modalId) {
      case "expand-modal":
        this.closeExpandModal();
        break;
      case "migration-progress-modal":
        this.hideMigrationProgressModal();
        break;
      case "manual-copy-modal":
        const manualModal = document.querySelector(".manual-copy-modal");
        if (manualModal) manualModal.remove();
        this._removeFromModalStack(modalId);
        break;
      default:
        // 기타 모달은 mainApp에서 처리
        break;
    }
  }

  /**
   * 모든 모달 닫기
   */
  closeAllModals() {
    while (this._openModals.length > 0) {
      const modalId = this._openModals.pop();
      this.closeModalById(modalId);
    }
  }

  /**
   * 현재 열려있는 모달이 있는지 확인
   * @returns {boolean} 모달 열림 여부
   */
  hasOpenModal() {
    return this._openModals.length > 0;
  }

  // ==================== 바텀시트 메서드 (Phase 6-02) ====================

  /**
   * 바텀시트 열기
   * - 드래그 제스처 처리
   * - Number stepper 핸들러
   * - Date tab 핸들러
   * - Focus scroll correction (모바일 키보드 대응)
   * @param {HTMLElement} modalElement - 바텀시트 모달 요소
   */
  openBottomSheet(modalElement) {
    if (!modalElement) return;
    const app = this.mainApp;

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
  }

  /**
   * 바텀시트 닫기
   * - 폼 값 초기화
   * - 이벤트 리스너 정리
   * - 모달 상태 리셋
   * @param {HTMLElement} modalElement - 바텀시트 모달 요소
   */
  closeBottomSheet(modalElement) {
    if (!modalElement) return;
    const app = this.mainApp;

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

    // 모달 상태 초기화 (mainApp의 속성)
    app.currentTrackingTextId = null;
    app.editingMetricData = null;
  }

  // ==================== 커스텀 모달 메서드 (Phase 6-03) ====================

  /**
   * 커스텀 모달 이벤트 바인딩
   * - 닫기 버튼, 외부 클릭, ESC 키, "내용 보기" 버튼 처리
   * @param {HTMLElement} modal - 모달 DOM 요소
   */
  bindCustomModalEvents(modal) {
    if (!modal) return;
    const app = this.mainApp;

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

        app.viewSavedText(itemId, { type: itemType });
      });
    });
  }

  /**
   * 레퍼런스 콘텐츠 모달 표시
   * - 레퍼런스 글 상세 보기 모달
   * @param {string} referenceId - 레퍼런스 ID
   */
  showReferenceContentModal(referenceId) {
    const app = this.mainApp;

    try {
      if (!referenceId) {
        console.warn("⚠️ showReferenceContentModal: referenceId가 없습니다.");
        return;
      }

      const referenceItem = app.savedTexts.find(
        (item) =>
          item.id === referenceId && (item.type || "edit") === "reference"
      );

      if (!referenceItem) {
        app.showMessage("❌ 레퍼런스 글을 찾을 수 없습니다.", "error");
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
        app.formatDateFromFirestore(referenceItem.createdAt) ||
        referenceItem.date ||
        "";
      const topicText = app.escapeHtml(
        referenceItem.topic || "출처 정보 없음"
      );
      const contentHtml = app.escapeHtml(referenceItem.content || "").replace(
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
                                <div><strong>유형:</strong> <span class="reference-type-badge badge-${app.escapeHtml(
                                  refType
                                )}">${app.escapeHtml(
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
            app.textCrudManager.editText(referenceId, "reference");
            modal.remove();
            document.body.style.overflow = "";
          });
        }
      }
    } catch (error) {
      console.error("showReferenceContentModal 실패:", error);
      app.showMessage("❌ 레퍼런스를 표시하지 못했습니다.", "error");
    }
  }

  // ==================== 공통 모달 유틸리티 (Phase 6-03) ====================

  /**
   * 간단한 모달 열기 유틸리티
   * - display: flex 설정
   * - body overflow 숨김
   * @param {HTMLElement} modalElement - 모달 요소
   */
  openModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  /**
   * 간단한 모달 닫기 유틸리티
   * - display: none 설정
   * - body overflow 복원
   * @param {HTMLElement} modalElement - 모달 요소
   */
  closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = "none";
    document.body.style.overflow = "";
  }

  /**
   * 모달 요소 제거 유틸리티
   * - DOM에서 완전히 제거
   * - body overflow 복원
   * @param {HTMLElement} modalElement - 모달 요소
   */
  removeModal(modalElement) {
    if (!modalElement) return;
    modalElement.remove();
    document.body.style.overflow = "";
  }
}
