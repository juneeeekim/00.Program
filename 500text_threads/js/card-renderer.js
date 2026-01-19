/**
 * ==================== CardRenderer ====================
 * 저장된 글 카드 렌더링 전담 모듈
 *
 * [역할]
 * - 저장된 글 카드 HTML 생성
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (app)
 */

export class CardRenderer {
  /**
   * @param {Object} app - DualTextWriter 인스턴스
   */
  constructor(app) {
    this.app = app;
  }

  /**
   * 저장된 항목 카드 렌더링
   * @param {Object} item
   * @param {Object} postData
   * @param {number} index
   * @returns {string}
   */
  renderSavedItemCard(item, postData, index) {
    const app = this.app;
    const metaText = `${
      (item.type || "edit") === "reference" ? "📖 레퍼런스" : "✏️ 작성"
    } · ${item.date} · ${item.characterCount}자`;
    // 통일된 스키마: card:{itemId}:expanded
    const expanded = localStorage.getItem(`card:${item.id}:expanded`) === "1";
    // 타임라인 HTML 생성
    const timelineHtml = app.renderTrackingTimeline(
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
      ? app.renderReferenceUsageBadge(usageCount)
      : "";
    const refType = item.referenceType || "unspecified";
    const refTypeBadgeHtml = isReference
      ? app.renderReferenceTypeBadge(refType)
      : "";

    // Phase 1.6.1: 작성글-레퍼런스 연결 배지 생성
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
                        title="이 글과 연결된 레퍼런스 목록">
                        🔗 참고 레퍼런스 ${refCount}개
                    </button>
                `;
      }
    }

    // 레퍼런스 카드: 이 레퍼런스를 참고한 작성글 개수 표시 (선택)
    let usedInEditsBadge = "";
    if (isReference) {
      const usedEdits = app.getEditsByReference(item.id);
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

    // SNS 플랫폼 배지 생성 (작성 글만)
    let snsPlatformsHtml = "";
    if (isEdit && Array.isArray(item.platforms) && item.platforms.length > 0) {
      const snsPlatforms = app.constructor.SNS_PLATFORMS || [];
      // 유효한 플랫폼 ID만 필터링
      const validPlatformIds = snsPlatforms.map((p) => p.id);
      const validPlatforms = item.platforms
        .filter((platformId) => validPlatformIds.includes(platformId))
        .map((platformId) => {
          const platform = snsPlatforms.find((p) => p.id === platformId);
          return platform
            ? { id: platformId, name: platform.name, icon: platform.icon }
            : null;
        })
        .filter(Boolean);

      if (validPlatforms.length > 0) {
        const platformsList = validPlatforms
          .map(
            (p) =>
              `<span class="sns-platform-badge" role="listitem" aria-label="${app.escapeHtml(
                p.name
              )} 플랫폼">${p.icon} ${app.escapeHtml(p.name)}</span>`
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
    const searchTerm = app.savedSearchInput?.value.toLowerCase().trim() || "";

    // 하이라이트 적용
    const highlightedTopic = item.topic
      ? app.highlightText(item.topic, searchTerm)
      : "";
    const highlightedContent = app.highlightText(item.content, searchTerm);

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
                ? `<div class="saved-item-topic" aria-label="주제: ${app.escapeHtml(
                    item.topic
                  )}">🧩 ${highlightedTopic}</div>`
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
                }" aria-label="트래킹 데이터 입력">📈 데이터 입력</button>
                <div class="llm-validation-dropdown" style="position: relative; display: inline-block;">
                    <button class="action-button btn-llm-main" data-action="llm-validation" data-item-id="${
                      item.id
                    }" aria-label="LLM 검증 메뉴">🧠 LLM 검증</button>
                    <div class="llm-dropdown-menu">
                        <button class="llm-option" data-llm="chatgpt" data-item-id="${
                          item.id
                        }">
                            <div class="llm-option-content">
                                <div class="llm-option-header">
                                    <span class="llm-icon">🤖</span>
                                    <span class="llm-name">ChatGPT</span>
                                    <span class="llm-description">SNS 맥락 분석</span>
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
}
