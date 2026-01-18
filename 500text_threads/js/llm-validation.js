/**
 * ============================================================================
 * LLMValidationManager - LLM 검증 시스템 관리 모듈
 * ============================================================================
 * 
 * [Phase 2: P2-01] LLM 검증 관련 프로퍼티 및 상태 관리
 * 
 * 이 모듈은 script.js에서 분리된 LLM 검증 시스템을 담당합니다.
 * - LLM 프롬프트 템플릿 관리 (ChatGPT, Gemini, Perplexity, Grok, Claude)
 * - LLM 특성 정보 관리
 * - LLM 사이트 URL 관리
 * - 클립보드 복사 및 새 탭 열기 기능
 * 
 * @author Refactoring Team
 * @version 1.0.0
 * @since 2026-01-14
 * 
 * 의존성:
 * - DualTextWriter (메인 클래스)
 * - Clipboard API (브라우저)
 */

/**
 * LLMValidationManager 클래스
 * 
 * LLM 검증 시스템의 상태와 동작을 관리하는 클래스입니다.
 * DualTextWriter 메인 클래스와 연동하여 동작합니다.
 * 
 * @class LLMValidationManager
 */
export class LLMValidationManager {
  /**
   * LLMValidationManager 생성자
   * 
   * @param {DualTextWriter} mainApp - 메인 애플리케이션 인스턴스
   * @throws {Error} mainApp이 제공되지 않으면 에러 발생
   */
  constructor(mainApp) {
    // ========================================
    // [P2-01] 메인 앱 참조 저장
    // ========================================
    if (!mainApp) {
      throw new Error('[LLMValidationManager] mainApp 인스턴스가 필요합니다.');
    }
    this.app = mainApp;

    // ========================================
    // [P2-01] LLM 프롬프트 템플릿
    // ========================================
    /** @type {Object} LLM 서비스별 프롬프트 템플릿 */
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

    // ========================================
    // [P2-01] LLM 특성 정보 (사용자 가이드용)
    // ========================================
    /** @type {Object} LLM 서비스별 특성 정보 */
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

    // ========================================
    // [P2-01] LLM 사이트 URL
    // ========================================
    /** @type {Object} LLM 서비스별 홈페이지 URL */
    this.llmUrls = {
      chatgpt: "https://chatgpt.com",
      gemini: "https://gemini.google.com",
      perplexity: "https://www.perplexity.ai",
      grok: "https://grok.com",
      claude: "https://claude.ai/new",
    };

    console.log('✅ [LLMValidationManager] 초기화 완료');
  }

  // ========================================
  // [P2-01] Getter 메서드
  // ========================================

  /**
   * LLM 프롬프트 템플릿 반환
   * @returns {Object} LLM 프롬프트 객체
   */
  getPrompts() {
    return this.llmPrompts;
  }

  /**
   * 특정 LLM 서비스의 프롬프트 반환
   * @param {string} service - LLM 서비스 ID (chatgpt, gemini, perplexity, grok, claude)
   * @returns {string|null} 프롬프트 템플릿 또는 null
   */
  getPrompt(service) {
    return this.llmPrompts[service] || null;
  }

  /**
   * LLM 특성 정보 반환
   * @returns {Object} LLM 특성 객체
   */
  getCharacteristics() {
    return this.llmCharacteristics;
  }

  /**
   * 특정 LLM 서비스의 특성 정보 반환
   * @param {string} service - LLM 서비스 ID
   * @returns {Object|null} 특성 정보 또는 null
   */
  getCharacteristic(service) {
    return this.llmCharacteristics[service] || null;
  }

  /**
   * LLM URL 반환
   * @returns {Object} LLM URL 객체
   */
  getUrls() {
    return this.llmUrls;
  }

  /**
   * 특정 LLM 서비스의 URL 반환
   * @param {string} service - LLM 서비스 ID
   * @returns {string|null} URL 또는 null
   */
  getUrl(service) {
    return this.llmUrls[service] || null;
  }

  // ========================================
  // [P2-01] 유틸리티 메서드 (헬퍼)
  // ========================================

  /**
   * 메시지 표시 (메인 앱에 위임)
   * @private
   * @param {string} message - 표시할 메시지
   * @param {string} type - 메시지 타입 (success, error, warning, info)
   */
  _showMessage(message, type) {
    if (this.app && this.app.showMessage) {
      this.app.showMessage(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  /**
   * HTML 이스케이프 (메인 앱에 위임)
   * @private
   * @param {string} text - 이스케이프할 텍스트
   * @returns {string} 이스케이프된 텍스트
   */
  _escapeHtml(text) {
    if (this.app && this.app.escapeHtml) {
      return this.app.escapeHtml(text);
    }
    // 폴백: 기본 이스케이프
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========================================
  // [P2-02] LLM 검증 실행 메서드
  // ========================================

  /**
   * 패널 기반 LLM 검증 실행
   * 
   * 작성/레퍼런스 패널에서 직접 LLM 검증을 실행합니다.
   * 텍스트를 클립보드에 복사하고 LLM 사이트를 새 탭에서 엽니다.
   * 
   * @param {string} panel - 패널 타입 ('reference' | 'writing')
   * @param {string} llmService - LLM 서비스 ID (chatgpt, gemini, perplexity, grok, claude)
   * @returns {Promise<void>}
   */
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
        this._showMessage("지원하지 않는 패널입니다.", "error");
        return;
      }

      // 텍스트 내용 가져오기
      const content = textArea.value.trim();
      if (!content) {
        this._showMessage(
          `${panelType}이 비어있습니다. 먼저 글을 작성해주세요.`,
          "warning"
        );
        return;
      }

      // LLM 서비스 정보 가져오기
      const llmInfo = this.llmCharacteristics[llmService];
      if (!llmInfo) {
        console.error("지원하지 않는 LLM 서비스:", llmService);
        this._showMessage("지원하지 않는 LLM 서비스입니다.", "error");
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
      this._showMessage(
        `${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`,
        "success"
      );
    } catch (error) {
      console.error("패널 LLM 검증 실행 실패:", error);
      this._showMessage("LLM 검증 실행에 실패했습니다.", "error");
    }
  }

  /**
   * 저장된 글 기반 LLM 검증 실행
   * 
   * 저장된 글 목록에서 특정 글을 선택하여 LLM 검증을 실행합니다.
   * 텍스트를 클립보드에 복사하고 LLM 사이트를 새 탭에서 엽니다.
   * 
   * @param {string} itemId - 저장된 글 ID
   * @param {string} llmService - LLM 서비스 ID (chatgpt, gemini, perplexity, grok, claude)
   * @returns {Promise<void>}
   */
  async validateWithLLM(itemId, llmService) {
    console.log("LLM 검증 시작:", { itemId, llmService });

    // 저장된 글 찾기 (메인 앱에서 savedTexts 참조)
    const savedTexts = this.app.savedTexts || [];
    const item = savedTexts.find((saved) => saved.id === itemId);
    if (!item) {
      this._showMessage("검증할 글을 찾을 수 없습니다.", "error");
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
        this._showMessage(
          `${llmInfo.icon} ${llmInfo.name} 페이지가 열렸습니다. Ctrl+V로 붙여넣기하세요!`,
          "success"
        );
      }
    } catch (error) {
      console.error("LLM 검증 실행 실패:", error);
      this._showMessage("LLM 검증 실행에 실패했습니다.", "error");
    }
  }

  /**
   * 클립보드에 텍스트 복사
   * 
   * Clipboard API를 우선 사용하고, 지원하지 않는 환경에서는
   * execCommand 폴백을 사용합니다.
   * 
   * @param {string} text - 복사할 텍스트
   * @returns {Promise<void>}
   * @throws {Error} 클립보드 복사 실패 시 에러 발생
   */
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

  /**
   * LLM 사이트 새 탭에서 열기
   * 
   * 지정된 LLM 서비스의 웹사이트를 새 탭에서 엽니다.
   * 보안을 위해 noopener, noreferrer 옵션을 사용합니다.
   * 
   * @param {string} llmService - LLM 서비스 ID (chatgpt, gemini, perplexity, grok, claude)
   * @param {string} text - 검증할 텍스트 (현재 사용되지 않음, 향후 확장용)
   */
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

  // ========================================
  // [P2-01] 기존 코드 호환성을 위한 Getter (별칭)
  // ========================================

  /**
   * LLM 프롬프트 반환 (기존 코드 호환성)
   * @returns {Object} LLM 프롬프트 객체
   */
  getLLMPrompts() {
    return this.llmPrompts;
  }

  /**
   * LLM 특성 정보 반환 (기존 코드 호환성)
   * @returns {Object} LLM 특성 객체
   */
  getLLMCharacteristics() {
    return this.llmCharacteristics;
  }

  /**
   * LLM URL 반환 (기존 코드 호환성)
   * @returns {Object} LLM URL 객체
   */
  getLLMUrls() {
    return this.llmUrls;
  }

  // ========================================
  // [P2-03] LLM 모달 관련 메서드
  // ========================================

  /**
   * LLM 통합 복사 모달 표시
   * 
   * 모든 LLM 서비스에 대해 통합된 복사 모달을 표시합니다.
   * 텍스트 복사, LLM 사이트 열기 기능을 제공합니다.
   * 
   * @param {string} llmService - LLM 서비스 ID (chatgpt, gemini, perplexity, grok, claude)
   * @param {string} text - 복사할 텍스트
   */
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

  /**
   * Gemini 전용 복사 모달 표시 (하위 호환성)
   * 
   * @param {string} text - 복사할 텍스트
   */
  showGeminiCopyModal(text) {
    this.showLLMCopyModal("gemini", text);
  }

  /**
   * LLM 통합 텍스트 복사 함수
   * 
   * 모달 내 텍스트 영역의 내용을 클립보드에 복사합니다.
   * 복사 성공 시 버튼 상태를 변경하여 피드백을 제공합니다.
   * 
   * @param {string} llmService - LLM 서비스 ID
   */
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
        this._showMessage(`✅ 텍스트가 클립보드에 복사되었습니다!`, "success");

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
      this._showMessage(
        "❌ 복사에 실패했습니다. 텍스트를 수동으로 선택하여 복사해주세요.",
        "error"
      );
    }
  }

  /**
   * Gemini 텍스트 복사 함수 (하위 호환성)
   */
  copyGeminiText() {
    this.copyLLMText("gemini");
  }

  /**
   * LLM 검증 가이드 메시지 표시
   * 
   * LLM 검증 모달이 열렸을 때 사용자에게 안내 메시지를 표시합니다.
   * 
   * @param {string} llmService - LLM 서비스 ID
   */
  showLLMValidationGuide(llmService) {
    const characteristics = this.llmCharacteristics[llmService];
    if (!characteristics) {
      console.error("지원하지 않는 LLM 서비스:", llmService);
      return;
    }

    // 모든 LLM에 통합 모달 방식 사용
    const message =
      `✅ ${characteristics.name} 검증 모달이 열렸습니다!\n\n` +
      `📋 검증할 텍스트가 클립보드에 복사되었습니다.\n` +
      `💡 모달에서 "전체 복사" 버튼을 클릭하거나, ${characteristics.name} 페이지로 이동하여 Ctrl+V로 붙여넣기하세요.\n\n` +
      `🎯 기대 결과: ${characteristics.description} - ${characteristics.details}`;

    this._showMessage(message, "success");

    // 추가 안내를 위한 상세 메시지
    setTimeout(() => {
      this.showDetailedGuide(llmService);
    }, 2000);
  }

  /**
   * 상세 가이드 표시
   * 
   * LLM 서비스별 상세 사용 가이드를 표시합니다.
   * 
   * @param {string} llmService - LLM 서비스 ID
   */
  showDetailedGuide(llmService) {
    const guides = {
      chatgpt:
        "ChatGPT의 SNS 후킹 분석 결과를 바탕으로 글의 감정적 몰입과 행동 유도를 강화해보세요.",
      gemini:
        "Gemini의 심리적 후킹 분석을 참고하여 독자의 무의식을 자극하는 요소를 추가해보세요.",
      perplexity:
        "Perplexity의 트렌드 분석 결과를 활용하여 현재 SNS 트렌드에 맞게 글을 개선해보세요.",
      grok: "Grok의 임팩트 분석을 반영하여 더 강력하고 명확한 후킹 문구로 글을 업그레이드해보세요.",
      claude:
        "Claude의 형식 준수 및 긴 문맥 분석을 활용하여 구조적으로 완성도 높은 글을 작성해보세요.",
    };

    const guide = guides[llmService];
    if (guide) {
      this._showMessage(`💡 ${guide}`, "info");
    }
  }
}
