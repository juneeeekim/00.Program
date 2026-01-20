/**
 * ==================== SNSManager ====================
 * SNS 플랫폼 관리 모듈
 *
 * [역할]
 * - SNS 플랫폼 선택 상태 관리
 * - SNS 플랫폼 태그 렌더링
 * - 플랫폼 선택/해제 토글
 * - 아코디언 패널 토글
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - DualTextWriter.SNS_PLATFORMS (정적 플랫폼 목록)
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team
 */

export class SNSManager {
  /**
   * SNSManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 이벤트 바인딩 플래그 ====================
    this._snsPlatformEventBound = false;

    console.log("✅ SNSManager 초기화 완료");
  }

  // ==================== SNS 플랫폼 선택 초기화 ====================

  /**
   * SNS 플랫폼 선택 기능 초기화
   *
   * - 태그 렌더링
   * - 아코디언 토글 이벤트 바인딩
   * - 태그 클릭/키보드 이벤트 처리
   */
  initSnsPlatformSelection() {
    const app = this.mainApp;

    try {
      // 유효성 검사: 필수 DOM 요소 확인
      if (!app.editSnsPlatformTags) {
        console.warn("⚠️ SNS 플랫폼 선택 UI 요소를 찾을 수 없습니다.");
        return;
      }

      // SNS 플랫폼 태그 렌더링
      this.renderSnsPlatformTags();

      // 아코디언 토글 버튼 이벤트 바인딩
      if (app.snsPlatformCollapseToggle) {
        // 클릭 이벤트: 마우스 및 터치 디바이스 지원
        app.snsPlatformCollapseToggle.addEventListener("click", () => {
          this.toggleSnsPlatformCollapse();
        });

        // 키보드 이벤트 처리 (접근성): Enter 및 Space 키 지원
        app.snsPlatformCollapseToggle.addEventListener("keydown", (e) => {
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
        app.editSnsPlatformTags.addEventListener("click", (e) => {
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
        app.editSnsPlatformTags.addEventListener("keydown", (e) => {
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
      if (app.showMessage) {
        app.showMessage(
          "SNS 플랫폼 선택 기능을 초기화하는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  // ==================== SNS 플랫폼 패널 토글 ====================

  /**
   * SNS 플랫폼 선택 패널 토글
   *
   * - 패널 펼치기/접기
   * - 아이콘 회전 애니메이션 (CSS transition으로 처리)
   * - ARIA 속성 업데이트 (접근성 향상)
   */
  toggleSnsPlatformCollapse() {
    const app = this.mainApp;

    try {
      // 유효성 검사: 필수 DOM 요소 확인
      if (!app.snsPlatformContent || !app.snsPlatformCollapseToggle) {
        console.warn("⚠️ SNS 플랫폼 패널 요소를 찾을 수 없습니다.");
        return;
      }

      // 현재 확장 상태 확인 (ARIA 속성 기반)
      const isExpanded =
        app.snsPlatformCollapseToggle.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        // 패널 접기: 콘텐츠 숨김 및 ARIA 속성 업데이트
        app.snsPlatformContent.classList.remove("expanded");
        app.snsPlatformCollapseToggle.setAttribute("aria-expanded", "false");
        app.snsPlatformContent.setAttribute("aria-hidden", "true");
      } else {
        // 패널 펼치기: 콘텐츠 표시 및 ARIA 속성 업데이트
        app.snsPlatformContent.classList.add("expanded");
        app.snsPlatformCollapseToggle.setAttribute("aria-expanded", "true");
        app.snsPlatformContent.setAttribute("aria-hidden", "false");
      }
    } catch (error) {
      console.error("❌ SNS 플랫폼 패널 토글 실패:", error);
      if (app.showMessage) {
        app.showMessage("패널을 토글하는 중 오류가 발생했습니다.", "error");
      }
    }
  }

  // ==================== SNS 플랫폼 태그 렌더링 ====================

  /**
   * SNS 플랫폼 태그 렌더링
   *
   * - 모든 SNS 플랫폼 태그를 동적으로 생성
   * - 선택 상태에 따른 스타일 및 ARIA 속성 적용
   * - XSS 방지를 위한 HTML 이스케이프 처리
   */
  renderSnsPlatformTags() {
    const app = this.mainApp;
    const SNS_PLATFORMS = app.constructor.SNS_PLATFORMS;

    try {
      // 유효성 검사: 필수 DOM 요소 및 데이터 확인
      if (!app.editSnsPlatformTags) {
        console.warn("⚠️ SNS 플랫폼 태그 컨테이너를 찾을 수 없습니다.");
        return;
      }

      if (!SNS_PLATFORMS || !Array.isArray(SNS_PLATFORMS)) {
        console.warn("⚠️ SNS 플랫폼 데이터가 유효하지 않습니다.");
        return;
      }

      // escapeHtml 함수 참조
      const escapeHtml = app.escapeHtml ? app.escapeHtml.bind(app) : (str) => str;

      // 플랫폼 태그 HTML 생성 (XSS 방지: escapeHtml 사용)
      const tagsHtml = SNS_PLATFORMS.map((platform) => {
        // 플랫폼 선택 상태 확인
        const isSelected = app.selectedSnsPlatforms.includes(platform.id);
        const selectedClass = isSelected ? "selected" : "";
        const ariaChecked = isSelected ? "true" : "false";
        const ariaLabelText = `${escapeHtml(platform.name)} ${
          isSelected ? "선택됨" : "선택 안됨"
        }`;

        // 안전한 HTML 생성 (XSS 방지)
        return `
          <button
            type="button"
            class="sns-platform-tag ${selectedClass}"
            data-platform-id="${escapeHtml(platform.id)}"
            role="checkbox"
            aria-label="${ariaLabelText}"
            aria-checked="${ariaChecked}"
            tabindex="0"
          >
            <span class="sns-platform-icon" aria-hidden="true">${platform.icon}</span>
            <span class="sns-platform-name">${escapeHtml(platform.name)}</span>
          </button>
        `;
      }).join("");

      // DOM 업데이트 (성능: 한 번의 innerHTML 할당)
      app.editSnsPlatformTags.innerHTML = tagsHtml;

      // 선택 개수 업데이트
      this.updateSnsPlatformCount();
    } catch (error) {
      console.error("❌ SNS 플랫폼 태그 렌더링 실패:", error);
      if (app.showMessage) {
        app.showMessage(
          "SNS 플랫폼 목록을 불러오는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  // ==================== SNS 플랫폼 선택/해제 토글 ====================

  /**
   * SNS 플랫폼 선택/해제 토글
   *
   * - 플랫폼 선택 상태를 토글
   * - 유효성 검증 후 상태 변경
   * - UI 자동 업데이트
   *
   * @param {string} platformId - 플랫폼 ID (예: 'threads', 'instagram')
   */
  toggleSnsPlatform(platformId) {
    const app = this.mainApp;
    const SNS_PLATFORMS = app.constructor.SNS_PLATFORMS;

    try {
      // 입력 유효성 검증
      if (!platformId || typeof platformId !== "string") {
        console.warn("⚠️ 유효하지 않은 플랫폼 ID 형식:", platformId);
        return;
      }

      // 플랫폼 데이터 유효성 검증
      if (!SNS_PLATFORMS || !Array.isArray(SNS_PLATFORMS)) {
        console.warn("⚠️ SNS 플랫폼 데이터가 유효하지 않습니다.");
        return;
      }

      const platform = SNS_PLATFORMS.find((p) => p.id === platformId);
      if (!platform) {
        console.warn(`⚠️ 유효하지 않은 플랫폼 ID: ${platformId}`);
        return;
      }

      // 선택 상태 토글: 배열에서 추가 또는 제거
      const currentIndex = app.selectedSnsPlatforms.indexOf(platformId);
      if (currentIndex >= 0) {
        // 이미 선택된 경우: 선택 해제
        app.selectedSnsPlatforms.splice(currentIndex, 1);
      } else {
        // 선택되지 않은 경우: 선택 추가
        app.selectedSnsPlatforms.push(platformId);
      }

      // UI 업데이트: 태그 재렌더링 및 개수 업데이트
      this.renderSnsPlatformTags();
      this.updateSnsPlatformCount();
    } catch (error) {
      console.error("❌ SNS 플랫폼 토글 실패:", error);
      if (app.showMessage) {
        app.showMessage(
          "플랫폼 선택을 변경하는 중 오류가 발생했습니다.",
          "error"
        );
      }
    }
  }

  // ==================== SNS 플랫폼 선택 개수 업데이트 ====================

  /**
   * SNS 플랫폼 선택 개수 업데이트
   *
   * - 선택된 플랫폼 개수를 UI에 표시
   * - 접근성을 위한 ARIA 속성 업데이트
   */
  updateSnsPlatformCount() {
    const app = this.mainApp;

    try {
      // 유효성 검사: DOM 요소 확인
      if (!app.snsPlatformCount) {
        return;
      }

      // 선택된 플랫폼 개수 계산
      const selectedCount = Array.isArray(app.selectedSnsPlatforms)
        ? app.selectedSnsPlatforms.length
        : 0;

      // UI 업데이트: 텍스트 콘텐츠 변경
      app.snsPlatformCount.textContent = `(${selectedCount}개 선택됨)`;

      // 접근성 향상: ARIA 속성 업데이트
      if (app.snsPlatformCollapseToggle) {
        const ariaLabel = `SNS 플랫폼 선택 (${selectedCount}개 선택됨)`;
        app.snsPlatformCollapseToggle.setAttribute("aria-label", ariaLabel);
      }
    } catch (error) {
      console.error("❌ SNS 플랫폼 선택 개수 업데이트 실패:", error);
    }
  }
}
