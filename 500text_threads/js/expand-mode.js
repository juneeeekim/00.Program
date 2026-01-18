/**
 * ==================== ExpandModeManager ====================
 * 확대 모드 관리 모듈
 *
 * [역할]
 * - 확대 모드 열기/닫기 관리
 * - 확대 모드 레퍼런스 렌더링
 * - 분할선 드래그 리사이즈 처리
 * - 포커스 트랩 및 ESC 키 핸들링
 * - 접근성 (ARIA) 속성 관리
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - ReferenceManager (expandReferences 상태)
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team - Phase 7
 */

export class ExpandModeManager {
  /**
   * ExpandModeManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 확대 모드 상태 ====================
    /**
     * 확대 모드 소스 모드 ('new' | 'edit')
     * - 'new': 새 글 작성 모드에서 열림
     * - 'edit': 수정 모드에서 열림
     */
    this._expandSourceMode = "new";

    // ==================== 이벤트 핸들러 참조 ====================
    this._expandModeTabHandler = null;
    this._expandModeEscapeHandler = null;
    this._expandModeTimeouts = [];

    console.log("✅ ExpandModeManager 초기화 완료");
  }

  // ==================== Getter/Setter ====================

  /**
   * 확대 모드 소스 모드 getter
   * @returns {string} 'new' | 'edit'
   */
  get expandSourceMode() {
    return this._expandSourceMode;
  }

  /**
   * 확대 모드 소스 모드 setter
   * @param {string} value - 'new' | 'edit'
   */
  set expandSourceMode(value) {
    this._expandSourceMode = value;
  }

  // ==================== 확대 모드 열기/닫기 (Phase 7-01) ====================

  /**
   * 확대 모드 열기
   * 접근성: ARIA 속성 업데이트, 스크린 리더 알림, 포커스 트랩, ESC 키 처리 포함
   */
  openExpandMode() {
    const app = this.mainApp;
    if (!app.contentExpandModal || !app.expandContentTextarea) return;

    // 컨텍스트 감지: 수정 모드인지 확인
    const isEditMode =
      document.getElementById("detail-edit-mode")?.style.display !== "none" &&
      app.selectedArticleId;

    // 소스 결정
    if (isEditMode) {
      // 수정 모드: 제목, 카테고리, 내용을 수정 폼에서 가져옴
      this._expandSourceMode = "edit";
      const title = app.editTitleInput?.value.trim() || "-";
      const category = app.editCategorySelect?.value || "-";
      const content = app.editContentTextarea?.value || "";

      app.expandContentTextarea.value = content;

      if (app.expandPreviewTitle) {
        app.expandPreviewTitle.textContent = title;
      }
      if (app.expandPreviewCategory) {
        app.expandPreviewCategory.textContent = category;
      }
    } else {
      // 새 글 작성 모드 (기본)
      this._expandSourceMode = "new";
      if (app.scriptContentTextarea) {
        app.expandContentTextarea.value = app.scriptContentTextarea.value;
      }

      if (app.expandPreviewTitle) {
        const title = app.scriptTitleInput?.value.trim() || "-";
        app.expandPreviewTitle.textContent = title || "-";
      }

      if (app.expandPreviewCategory) {
        const category = app.scriptCategoryInput?.value.trim() || "-";
        app.expandPreviewCategory.textContent = category || "-";
      }
    }

    // 카운터 업데이트
    this.updateExpandContentCounter();

    // 모달 표시
    app.contentExpandModal.style.display = "block";

    // 접근성: ARIA 속성 업데이트
    app.contentExpandModal.setAttribute("aria-hidden", "false");

    // 현재 활성화된 버튼에 aria-expanded 업데이트
    const activeBtn = isEditMode ? app.detailExpandBtn : app.expandContentBtn;
    if (activeBtn) {
      activeBtn.setAttribute("aria-expanded", "true");
    }

    // 스크린 리더 사용자를 위한 알림
    app.announceToScreenReader("확대 모드가 열렸습니다.");

    // 접근성: 포커스 트랩 설정 (Tab 키 순환 제한)
    this._setupExpandModeFocusTrap();

    // 접근성: ESC 키로 모달 닫기
    this._setupExpandModeEscapeHandler();

    // 약간의 지연 후 포커스 (애니메이션 완료 후)
    const timeoutId = setTimeout(() => {
      app.expandContentTextarea.focus();
      // 커서를 끝으로 이동
      const length = app.expandContentTextarea.value.length;
      app.expandContentTextarea.setSelectionRange(length, length);
    }, app.constructor.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
    this._expandModeTimeouts.push(timeoutId);
  }

  /**
   * 확대 모드 닫기
   * 접근성: ARIA 속성 업데이트 포함
   * 성능: 대기 중인 timeout 정리
   */
  closeExpandMode() {
    const app = this.mainApp;
    if (!app.contentExpandModal || !app.expandContentTextarea) return;

    // 대기 중인 timeout 정리 (메모리 누수 방지)
    if (this._expandModeTimeouts && this._expandModeTimeouts.length > 0) {
      this._expandModeTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this._expandModeTimeouts = [];
    }

    // 확대 모드의 내용을 원본 textarea에 동기화 (닫을 때 자동 동기화)
    if (this._expandSourceMode === "edit") {
      if (app.editContentTextarea) {
        app.editContentTextarea.value = app.expandContentTextarea.value;
      }
    } else {
      if (app.scriptContentTextarea) {
        app.scriptContentTextarea.value = app.expandContentTextarea.value;
        app.updateContentCounter();
      }
    }

    // 접근성: ARIA 속성 업데이트
    app.contentExpandModal.setAttribute("aria-hidden", "true");

    // 열었던 버튼의 aria-expanded 복구
    const activeBtn =
      this._expandSourceMode === "edit"
        ? app.detailExpandBtn
        : app.expandContentBtn;
    if (activeBtn) {
      activeBtn.setAttribute("aria-expanded", "false");
    }

    // 스크린 리더 사용자를 위한 알림
    app.announceToScreenReader("확대 모드가 닫혔습니다.");

    // 접근성: 포커스 트랩 및 ESC 핸들러 제거
    this._removeExpandModeFocusTrap();
    this._removeExpandModeEscapeHandler();

    // 모달 숨기기
    app.contentExpandModal.style.display = "none";

    // 접근성: 원래 포커스 위치로 복귀 (확대 모드 열기 버튼)
    const focusTarget =
      this._expandSourceMode === "edit"
        ? app.detailExpandBtn
        : app.expandContentBtn;
    if (focusTarget) {
      const timeoutId = setTimeout(() => {
        focusTarget.focus();
      }, app.constructor.CONFIG.SCREEN_READER_ANNOUNCE_DELAY_MS);
      this._expandModeTimeouts.push(timeoutId);
    }
  }

  /**
   * 저장하고 확대 모드 닫기
   */
  saveAndCloseExpandMode() {
    const app = this.mainApp;

    // 내용 동기화 (닫기 전에 수행)
    if (this._expandSourceMode === "edit") {
      // 수정 모드로 반환
      if (app.editContentTextarea && app.expandContentTextarea) {
        app.editContentTextarea.value = app.expandContentTextarea.value;
      }
    } else {
      // 새 글 작성 모드로 반환 (기본)
      if (app.scriptContentTextarea && app.expandContentTextarea) {
        app.scriptContentTextarea.value = app.expandContentTextarea.value;
        app.updateContentCounter(); // 새 글 카운터 업데이트
      }
    }

    this.closeExpandMode();

    // 저장 버튼 클릭
    if (this._expandSourceMode === "edit") {
      // 수정 저장
      if (app.editSaveBtn) {
        app.editSaveBtn.click();
      }
    } else {
      // 새 글 저장
      if (app.scriptSaveBtn) {
        app.scriptSaveBtn.click();
      }
    }
  }

  // ==================== 글자 수 카운터 (Phase 7-01) ====================

  /**
   * 확대 모드 글자 수 카운터 업데이트
   */
  updateExpandContentCounter() {
    const app = this.mainApp;
    if (!app.expandContentTextarea || !app.expandContentCounter) return;

    const content = app.expandContentTextarea.value || "";
    const charCount = content.length;
    const maxChars = 500;

    // 글자 수 표시 업데이트
    app.expandContentCounter.textContent = `(${charCount} / ${maxChars}자는 약 1분)`;

    // 500자 초과 시 경고 스타일 적용
    if (charCount > maxChars) {
      app.expandContentCounter.style.color = "#e74c3c";
      app.expandContentCounter.style.fontWeight = "600";
    } else if (charCount > maxChars * 0.9) {
      // 90% 이상일 때 주의 색상
      app.expandContentCounter.style.color = "#f39c12";
      app.expandContentCounter.style.fontWeight = "500";
    } else {
      // 정상 범위
      app.expandContentCounter.style.color = "#666";
      app.expandContentCounter.style.fontWeight = "400";
    }
  }

  // ==================== 포커스 트랩 (Phase 7-01) ====================

  /**
   * 확대 모드 포커스 트랩 설정
   * Tab 키로 모달 내부에서만 포커스 순환
   * @private
   */
  _setupExpandModeFocusTrap() {
    const app = this.mainApp;
    if (!app.contentExpandModal) return;

    // 포커스 가능한 요소 찾기
    const focusableSelectors = [
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const focusableElements = Array.from(
      app.contentExpandModal.querySelectorAll(focusableSelectors)
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

    app.contentExpandModal.addEventListener(
      "keydown",
      this._expandModeTabHandler
    );
  }

  /**
   * 확대 모드 포커스 트랩 제거
   * @private
   */
  _removeExpandModeFocusTrap() {
    const app = this.mainApp;
    if (this._expandModeTabHandler && app.contentExpandModal) {
      app.contentExpandModal.removeEventListener(
        "keydown",
        this._expandModeTabHandler
      );
      this._expandModeTabHandler = null;
    }
  }

  // ==================== ESC 키 핸들러 (Phase 7-01) ====================

  /**
   * 확대 모드 ESC 키 핸들러 설정
   * @private
   */
  _setupExpandModeEscapeHandler() {
    const app = this.mainApp;

    this._expandModeEscapeHandler = (e) => {
      if (
        e.key === "Escape" &&
        app.contentExpandModal &&
        app.contentExpandModal.style.display === "block"
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

  // ==================== 레퍼런스 관리 (Phase 7-02) ====================

  /**
   * 확대 모드에서 레퍼런스 제거
   * @param {number} index - 제거할 레퍼런스 인덱스
   */
  removeExpandReference(index) {
    const app = this.mainApp;
    if (index < 0 || index >= app.expandReferences.length) return;

    app.expandReferences.splice(index, 1);
    this.renderExpandReferences();
  }

  /**
   * 확대 모드 레퍼런스 렌더링
   * @param {string|null} newlyAddedId - 새로 추가된 레퍼런스 ID (하이라이트용)
   */
  renderExpandReferences(newlyAddedId = null) {
    const app = this.mainApp;
    if (!app.expandReferenceList || !app.expandReferenceEmpty) return;

    if (app.expandReferences.length === 0) {
      app.expandReferenceList.style.display = "none";
      app.expandReferenceEmpty.style.display = "flex";
      return;
    }

    app.expandReferenceList.style.display = "block";
    app.expandReferenceEmpty.style.display = "none";

    app.expandReferenceList.innerHTML = "";

    app.expandReferences.forEach((ref, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "expand-reference-item";
      itemEl.setAttribute("role", "listitem");
      itemEl.setAttribute(
        "aria-label",
        `레퍼런스 ${index + 1}: ${app.escapeHtml(ref.title)}`
      );

      // 새로 추가된 레퍼런스인지 확인하여 시각적 피드백 추가
      const isNewlyAdded = newlyAddedId && ref.id === newlyAddedId;
      if (isNewlyAdded) {
        itemEl.classList.add("reference-added");
      }

      const contentPreview = (ref.content || "").substring(0, 500);

      itemEl.innerHTML = `
                <div class="expand-reference-item-header">
                    <div class="expand-reference-item-title">${app.escapeHtml(
                      ref.title
                    )}</div>
                    <button 
                        class="expand-reference-item-remove"
                        aria-label="레퍼런스 제거"
                        title="제거">
                        ×
                    </button>
                </div>
                <div class="expand-reference-item-content">${app.escapeHtml(
                  contentPreview
                )}${ref.content.length > 500 ? "..." : ""}</div>
                <div class="expand-reference-item-meta">
                    <span>📅 ${ref.date}</span>
                    <span>📁 ${app.escapeHtml(ref.category)}</span>
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

      app.expandReferenceList.appendChild(itemEl);

      // 새로 추가된 레퍼런스인 경우 애니메이션 완료 후 클래스 제거
      if (isNewlyAdded) {
        setTimeout(() => {
          itemEl.classList.remove("reference-added");
        }, app.constructor.CONFIG.REFERENCE_HIGHLIGHT_ANIMATION_DURATION_MS);
      }
    });

    // 접근성: 레퍼런스 목록 표시 및 ARIA 속성 업데이트
    if (app.expandReferenceList && app.expandReferences.length > 0) {
      app.expandReferenceList.style.display = "block";
      app.expandReferenceList.setAttribute(
        "aria-label",
        `추가된 레퍼런스 목록 (${app.expandReferences.length}개)`
      );
    }
  }

  /**
   * 확대 모드 레퍼런스를 내용 필드에 추가
   * @param {Object} ref - 레퍼런스 객체
   * @param {number} index - 레퍼런스 인덱스
   */
  addExpandReferenceToContent(ref, index) {
    const app = this.mainApp;
    if (!app.expandContentTextarea || !ref || !ref.content) return;

    const content = ref.content || "";
    if (!content.trim()) return;

    const currentContent = app.expandContentTextarea.value;
    const separator = currentContent ? "\n\n---\n\n" : "";
    const newContent = currentContent + separator + content;

    app.expandContentTextarea.value = newContent;
    app.expandContentTextarea.focus();

    // 커서를 추가된 내용 끝으로 이동
    const length = newContent.length;
    app.expandContentTextarea.setSelectionRange(length, length);

    // 글자 수 카운터 업데이트
    this.updateExpandContentCounter();

    // 원본 textarea도 동기화
    if (app.scriptContentTextarea) {
      app.scriptContentTextarea.value = newContent;
      app.updateContentCounter();
    }

    // 성공 메시지
    app.showMessage("✅ 레퍼런스가 내용에 추가되었습니다.", "success");
  }

  // ==================== 레퍼런스 패널 토글 (Phase 7-02) ====================

  /**
   * 확대 모드 레퍼런스 패널 토글
   * 접근성: ARIA 속성 업데이트 및 스크린 리더 알림 포함
   */
  toggleExpandReferencePanel() {
    const app = this.mainApp;
    if (!app.expandReferencePanel || !app.expandToggleReferenceBtn) return;

    const isCollapsed =
      app.expandReferencePanel.classList.contains("collapsed");

    // collapsed 클래스 토글
    app.expandReferencePanel.classList.toggle("collapsed");

    // 접근성: ARIA 속성 업데이트
    const newState = !isCollapsed; // 토글 후 상태 (true = 접힘, false = 펼침)
    app.expandToggleReferenceBtn.setAttribute(
      "aria-expanded",
      newState ? "false" : "true"
    );

    // 스크린 리더 사용자를 위한 알림
    const message = newState
      ? "레퍼런스 영역이 접혔습니다."
      : "레퍼런스 영역이 펼쳐졌습니다.";
    app.announceToScreenReader(message);
  }

  // ==================== 분할선 드래그 리사이즈 (Phase 7-03) ====================

  /**
   * 확대 모드 분할선 드래그 초기화
   */
  initExpandSplitResize() {
    const app = this.mainApp;
    if (!app.expandSplitDivider || !app.expandReferencePanel) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const handleMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = app.expandReferencePanel.offsetWidth;

      app.expandSplitDivider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const diff = e.clientX - startX;
      const newWidth = startWidth + diff;
      const container = app.expandReferencePanel.parentElement;
      const containerWidth = container.offsetWidth;

      // 최소/최대 너비 제한
      const minWidth = 300;
      const maxWidth = containerWidth * 0.7;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        app.expandReferencePanel.style.width = `${newWidth}px`;
      }

      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        app.expandSplitDivider.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    app.expandSplitDivider.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }
}
