/**
 * ContextualHelpSystem
 * 
 * 상황별 도움말 시스템
 * - Username 입력 필드 옆 "?" 아이콘
 * - 검증 규칙 툴팁
 * - 로그인 방식 선택 가이드
 * - 양쪽 로그인 방법 설명 모달
 * 
 * Requirements: 3.1, 4.9
 */

class ContextualHelpSystem {
    constructor() {
        // 첫 방문 여부 확인
        this.isFirstVisit = !localStorage.getItem('dualTextWriter_hasVisited');
        
        // 도움말 내용
        this.helpContent = {
            firstTimeOnboarding: {
                title: '500text_threads에 오신 것을 환영합니다!',
                content: `
                    <div class="help-section">
                        <h4>📝 이 앱은 무엇인가요?</h4>
                        <p>500text_threads는 Threads 플랫폼에 특화된 500자 미만 글 작성 도구입니다.</p>
                        <p>레퍼런스 글을 참고하면서 새로운 글을 작성할 수 있는 듀얼 패널 환경을 제공합니다.</p>
                    </div>
                    
                    <div class="help-section">
                        <h4>🚀 시작하기</h4>
                        <ol>
                            <li><strong>로그인 방식 선택</strong>: Google 로그인 또는 사용자명 로그인 중 선택</li>
                            <li><strong>글 작성</strong>: 좌측에 레퍼런스, 우측에 새로운 글 작성</li>
                            <li><strong>저장 및 관리</strong>: 작성한 글을 저장하고 관리</li>
                        </ol>
                    </div>
                    
                    <div class="help-section">
                        <h4>🔐 로그인 방식 선택</h4>
                        <div class="onboarding-options">
                            <div class="onboarding-option">
                                <div class="option-icon">🔍</div>
                                <h5>Google 로그인</h5>
                                <p>여러 기기에서 사용하고 클라우드에 백업하고 싶다면 추천</p>
                            </div>
                            <div class="onboarding-option">
                                <div class="option-icon">👤</div>
                                <h5>사용자명 로그인</h5>
                                <p>빠르게 시작하거나 오프라인에서 사용하고 싶다면 추천</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="help-section">
                        <p class="help-note">💡 나중에 언제든지 로그인 방식을 변경하거나 계정을 연결할 수 있습니다.</p>
                    </div>
                `
            },
            
            usernameValidation: {
                title: '사용자명 규칙',
                content: `
                    <div class="help-section">
                        <h4>✅ 사용 가능한 문자</h4>
                        <ul>
                            <li>한글 (가-힣)</li>
                            <li>영문 (a-z, A-Z)</li>
                            <li>숫자 (0-9)</li>
                            <li>특수문자: 하이픈(-), 언더스코어(_)</li>
                        </ul>
                    </div>
                    
                    <div class="help-section">
                        <h4>📏 길이 제한</h4>
                        <ul>
                            <li>최소 2자 이상</li>
                            <li>최대 50자 이하</li>
                        </ul>
                    </div>
                    
                    <div class="help-section">
                        <h4>🚫 사용 불가</h4>
                        <ul>
                            <li>금지어: admin, root, system, test</li>
                            <li>HTML 태그 및 스크립트</li>
                            <li>특수문자 (-, _ 제외)</li>
                        </ul>
                    </div>
                    
                    <div class="help-section">
                        <h4>💡 예시</h4>
                        <ul class="example-list">
                            <li class="example-good">✅ 홍길동</li>
                            <li class="example-good">✅ user123</li>
                            <li class="example-good">✅ my-name_2024</li>
                            <li class="example-bad">❌ admin</li>
                            <li class="example-bad">❌ user@email</li>
                            <li class="example-bad">❌ &lt;script&gt;</li>
                        </ul>
                    </div>
                `
            },
            
            loginMethodGuide: {
                title: '로그인 방식 선택 가이드',
                content: `
                    <div class="help-section">
                        <h4>🔍 Google 로그인</h4>
                        <div class="method-description">
                            <p><strong>추천 대상:</strong> 여러 기기에서 사용하거나 데이터를 안전하게 보관하고 싶은 경우</p>
                            
                            <div class="pros-cons">
                                <div class="pros">
                                    <h5>✅ 장점</h5>
                                    <ul>
                                        <li>클라우드 동기화 (여러 기기에서 접근)</li>
                                        <li>Google 계정으로 안전하게 보호</li>
                                        <li>비밀번호 불필요</li>
                                        <li>데이터 백업 자동</li>
                                    </ul>
                                </div>
                                <div class="cons">
                                    <h5>⚠️ 제한사항</h5>
                                    <ul>
                                        <li>인터넷 연결 필요</li>
                                        <li>Google 계정 필요</li>
                                        <li>팝업 차단 해제 필요</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="help-divider"></div>
                    
                    <div class="help-section">
                        <h4>👤 사용자명 로그인</h4>
                        <div class="method-description">
                            <p><strong>추천 대상:</strong> 빠르게 시작하거나 오프라인에서 사용하고 싶은 경우</p>
                            
                            <div class="pros-cons">
                                <div class="pros">
                                    <h5>✅ 장점</h5>
                                    <ul>
                                        <li>빠른 시작 (계정 불필요)</li>
                                        <li>오프라인 사용 가능</li>
                                        <li>간단한 로그인</li>
                                        <li>개인정보 불필요</li>
                                    </ul>
                                </div>
                                <div class="cons">
                                    <h5>⚠️ 제한사항</h5>
                                    <ul>
                                        <li>브라우저에만 저장 (다른 기기 접근 불가)</li>
                                        <li>브라우저 데이터 삭제 시 손실 가능</li>
                                        <li>클라우드 동기화 없음</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="help-divider"></div>
                    
                    <div class="help-section">
                        <h4>🔄 계정 연결</h4>
                        <p>사용자명으로 시작한 후 나중에 Google 계정과 연결하여 데이터를 이전할 수 있습니다.</p>
                        <p class="help-note">💡 두 방식을 모두 사용할 수 있으며, 필요에 따라 전환 가능합니다.</p>
                    </div>
                    
                    <div class="help-section">
                        <h4>🏢 공용 컴퓨터 사용 시</h4>
                        <p>사용자명 로그인 시 "공용 기기" 옵션을 선택하면:</p>
                        <ul>
                            <li>30분 후 자동 로그아웃</li>
                            <li>브라우저 종료 시 데이터 자동 삭제</li>
                            <li>보안 강화</li>
                        </ul>
                    </div>
                `
            }
        };
        
        // 툴팁 요소
        this.activeTooltip = null;
        
        // 에러 도움말 매핑
        this.errorHelpMapping = {
            'username_too_short': {
                title: '사용자명이 너무 짧습니다',
                content: '사용자명은 최소 2자 이상이어야 합니다. 더 긴 이름을 입력해주세요.',
                suggestions: ['2자 이상 입력하기', '예: 홍길동, user123']
            },
            'username_too_long': {
                title: '사용자명이 너무 깁니다',
                content: '사용자명은 최대 50자까지 가능합니다. 더 짧은 이름을 입력해주세요.',
                suggestions: ['50자 이하로 줄이기']
            },
            'username_invalid_chars': {
                title: '사용할 수 없는 문자가 포함되어 있습니다',
                content: '사용자명은 한글, 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다.',
                suggestions: ['특수문자 제거하기', '예: user-name_123']
            },
            'username_forbidden': {
                title: '사용할 수 없는 사용자명입니다',
                content: 'admin, root, system, test와 같은 금지어는 사용할 수 없습니다.',
                suggestions: ['다른 이름 선택하기', '예: my-admin, user-system']
            },
            'username_xss': {
                title: '보안상 사용할 수 없는 문자입니다',
                content: 'HTML 태그나 스크립트는 보안상 사용할 수 없습니다.',
                suggestions: ['일반 텍스트만 사용하기']
            },
            'google_popup_blocked': {
                title: '팝업이 차단되었습니다',
                content: 'Google 로그인을 위해서는 팝업을 허용해야 합니다.',
                suggestions: [
                    '브라우저 주소창의 팝업 차단 아이콘을 클릭하여 허용',
                    '또는 사용자명 로그인 사용'
                ]
            },
            'google_network_error': {
                title: '네트워크 연결 오류',
                content: '인터넷 연결을 확인해주세요.',
                suggestions: [
                    '인터넷 연결 확인',
                    '사용자명 로그인으로 오프라인 사용'
                ]
            },
            'storage_full': {
                title: '저장 공간이 부족합니다',
                content: '브라우저 저장 공간이 가득 찼습니다.',
                suggestions: [
                    '오래된 글 삭제하기',
                    'Google 로그인으로 클라우드 사용'
                ]
            },
            'migration_failed': {
                title: '데이터 마이그레이션 실패',
                content: '데이터 이전 중 오류가 발생했습니다. 원본 데이터는 안전합니다.',
                suggestions: [
                    '다시 시도하기',
                    '나중에 다시 시도하기',
                    '문제가 계속되면 수동으로 데이터 백업'
                ]
            }
        };
        
        // 초기화
        this.init();
    }
    
    /**
     * 초기화
     */
    init() {
        // 스타일 주입
        this.injectStyles();
        
        // 이벤트 바인딩
        this.bindEvents();
        
        // 첫 방문자 온보딩
        if (this.isFirstVisit) {
            this.showFirstTimeOnboarding();
        }
    }
    
    /**
     * 이벤트 바인딩
     */
    bindEvents() {
        // Username 도움말 버튼
        const usernameHelpBtn = document.getElementById('username-help-btn');
        if (usernameHelpBtn) {
            usernameHelpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showUsernameHelp();
            });
            
            // 호버 시 툴팁 표시
            usernameHelpBtn.addEventListener('mouseenter', (e) => {
                this.showTooltip(e.target, '사용자명 규칙 보기');
            });
            
            usernameHelpBtn.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        }
        
        // 로그인 가이드 버튼
        const loginGuideBtn = document.getElementById('login-guide-btn');
        if (loginGuideBtn) {
            loginGuideBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginMethodGuide();
            });
        }
        
        // Google 로그인 버튼 호버
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('mouseenter', (e) => {
                const tooltip = 'Google 계정으로 안전하게 로그인하고\n클라우드 동기화를 사용할 수 있습니다';
                this.showTooltip(e.target, tooltip);
            });
            
            googleLoginBtn.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        }
        
        // Username 입력 필드 포커스 시 힌트
        const usernameInput = document.getElementById('username-input');
        if (usernameInput) {
            usernameInput.addEventListener('focus', () => {
                this.showInputHint();
            });
            
            usernameInput.addEventListener('blur', () => {
                this.hideInputHint();
            });
        }
    }
    
    /**
     * 사용자명 도움말 표시
     * Requirements: 3.1
     */
    showUsernameHelp() {
        const help = this.helpContent.usernameValidation;
        
        this.showHelpModal({
            title: help.title,
            content: help.content,
            icon: '❓'
        });
    }
    
    /**
     * 로그인 방식 선택 가이드 표시
     * Requirements: 3.1, 4.9
     */
    showLoginMethodGuide() {
        const help = this.helpContent.loginMethodGuide;
        
        this.showHelpModal({
            title: help.title,
            content: help.content,
            icon: '💡',
            wide: true
        });
    }
    
    /**
     * 첫 방문자 온보딩 표시
     * Requirements: 3.2
     */
    showFirstTimeOnboarding() {
        // 로그인 폼이 표시될 때까지 대기
        setTimeout(() => {
            const loginForm = document.getElementById('login-form');
            if (!loginForm || loginForm.style.display === 'none') {
                return;
            }
            
            const help = this.helpContent.firstTimeOnboarding;
            
            this.showHelpModal({
                title: help.title,
                content: help.content,
                icon: '👋',
                wide: true,
                onClose: () => {
                    // 방문 기록 저장
                    localStorage.setItem('dualTextWriter_hasVisited', 'true');
                    this.isFirstVisit = false;
                }
            });
        }, 1000);
    }
    
    /**
     * 에러 도움말 표시
     * Requirements: 3.1, 9.1, 9.2
     * @param {string} errorType - 에러 타입
     * @param {string} customMessage - 커스텀 메시지 (선택)
     */
    showErrorHelp(errorType, customMessage = null) {
        const errorHelp = this.errorHelpMapping[errorType];
        
        if (!errorHelp) {
            console.warn('Unknown error type:', errorType);
            return;
        }
        
        const content = `
            <div class="help-section">
                <p>${customMessage || errorHelp.content}</p>
            </div>
            
            <div class="help-section">
                <h4>💡 해결 방법</h4>
                <ul>
                    ${errorHelp.suggestions.map(s => `<li>${s}</li>`).join('')}
                </ul>
            </div>
            
            <div class="help-section">
                <p class="help-note">문제가 계속되면 "로그인 방식 선택 가이드"를 참고하세요.</p>
            </div>
        `;
        
        this.showHelpModal({
            title: errorHelp.title,
            content: content,
            icon: '⚠️'
        });
    }
    
    /**
     * 도움말 모달 표시
     * @param {Object} options
     */
    showHelpModal(options) {
        const {
            title = '도움말',
            content = '',
            icon = '💡',
            wide = false,
            onClose = null
        } = options;
        
        // 기존 모달 제거
        this.closeHelpModal();
        
        // 모달 오버레이 생성
        const overlay = document.createElement('div');
        overlay.className = 'help-modal-overlay';
        overlay.id = 'help-modal-overlay';
        
        // 모달 생성
        const modal = document.createElement('div');
        modal.className = `help-modal ${wide ? 'help-modal-wide' : ''}`;
        
        modal.innerHTML = `
            <div class="help-modal-header">
                <span class="help-modal-icon">${icon}</span>
                <h3 class="help-modal-title">${this.escapeHtml(title)}</h3>
                <button class="help-modal-close" id="help-modal-close">×</button>
            </div>
            <div class="help-modal-body">
                ${content}
            </div>
            <div class="help-modal-footer">
                <button class="help-modal-btn" id="help-modal-ok">확인</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 애니메이션
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // 이벤트 바인딩
        const closeBtn = modal.querySelector('#help-modal-close');
        const okBtn = modal.querySelector('#help-modal-ok');
        
        const closeHandler = () => {
            this.closeHelpModal();
            if (onClose) onClose();
        };
        
        closeBtn.addEventListener('click', closeHandler);
        okBtn.addEventListener('click', closeHandler);
        
        // 오버레이 클릭 시 닫기
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeHandler();
            }
        });
        
        // ESC 키로 닫기
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeHandler();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * 도움말 모달 닫기
     */
    closeHelpModal() {
        const overlay = document.getElementById('help-modal-overlay');
        if (!overlay) return;
        
        overlay.classList.remove('show');
        
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);
    }
    
    /**
     * 툴팁 표시
     * @param {HTMLElement} target
     * @param {string} text
     */
    showTooltip(target, text) {
        // 기존 툴팁 제거
        this.hideTooltip();
        
        const tooltip = document.createElement('div');
        tooltip.className = 'contextual-tooltip';
        tooltip.textContent = text;
        
        document.body.appendChild(tooltip);
        
        // 위치 계산
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let top = rect.top - tooltipRect.height - 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        
        // 화면 밖으로 나가지 않도록 조정
        if (top < 0) {
            top = rect.bottom + 8;
            tooltip.classList.add('tooltip-bottom');
        }
        
        if (left < 8) {
            left = 8;
        } else if (left + tooltipRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tooltipRect.width - 8;
        }
        
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        
        // 애니메이션
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
        
        this.activeTooltip = tooltip;
    }
    
    /**
     * 툴팁 숨김
     */
    hideTooltip() {
        if (!this.activeTooltip) return;
        
        this.activeTooltip.classList.remove('show');
        
        setTimeout(() => {
            if (this.activeTooltip && this.activeTooltip.parentNode) {
                this.activeTooltip.parentNode.removeChild(this.activeTooltip);
            }
            this.activeTooltip = null;
        }, 200);
    }
    
    /**
     * 입력 필드 힌트 표시
     */
    showInputHint() {
        const usernameInput = document.getElementById('username-input');
        if (!usernameInput) return;
        
        // 이미 힌트가 있으면 무시
        if (document.getElementById('username-input-hint')) return;
        
        const hint = document.createElement('div');
        hint.id = 'username-input-hint';
        hint.className = 'input-hint';
        hint.innerHTML = `
            <span class="hint-icon">💡</span>
            <span class="hint-text">한글, 영문, 숫자, -, _만 사용 가능 (2-50자)</span>
        `;
        
        usernameInput.parentNode.appendChild(hint);
        
        setTimeout(() => {
            hint.classList.add('show');
        }, 10);
    }
    
    /**
     * 입력 필드 힌트 숨김
     */
    hideInputHint() {
        const hint = document.getElementById('username-input-hint');
        if (!hint) return;
        
        hint.classList.remove('show');
        
        setTimeout(() => {
            if (hint.parentNode) {
                hint.parentNode.removeChild(hint);
            }
        }, 200);
    }
    
    /**
     * HTML 이스케이프
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 스타일 주입
     */
    injectStyles() {
        if (document.getElementById('contextual-help-styles')) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = 'contextual-help-styles';
        style.textContent = `
            /* Help Icon Button */
            .help-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.3);
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                margin-left: 6px;
            }
            
            .help-icon:hover {
                background: rgba(255, 255, 255, 0.3);
                border-color: rgba(255, 255, 255, 0.5);
                transform: scale(1.1);
            }
            
            /* Tooltip */
            .contextual-tooltip {
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 13px;
                line-height: 1.4;
                max-width: 250px;
                z-index: 10002;
                opacity: 0;
                transform: translateY(-4px);
                transition: all 0.2s ease;
                pointer-events: none;
                white-space: pre-line;
            }
            
            .contextual-tooltip.show {
                opacity: 1;
                transform: translateY(0);
            }
            
            .contextual-tooltip::after {
                content: '';
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 6px solid transparent;
                border-bottom-color: rgba(0, 0, 0, 0.9);
            }
            
            .contextual-tooltip.tooltip-bottom::after {
                bottom: auto;
                top: 100%;
                border-bottom-color: transparent;
                border-top-color: rgba(0, 0, 0, 0.9);
            }
            
            /* Input Hint */
            .input-hint {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 8px;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                opacity: 0;
                transform: translateY(-4px);
                transition: all 0.2s ease;
            }
            
            .input-hint.show {
                opacity: 1;
                transform: translateY(0);
            }
            
            .hint-icon {
                font-size: 16px;
            }
            
            .hint-text {
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                line-height: 1.4;
            }
            
            /* Help Modal Overlay */
            .help-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .help-modal-overlay.show {
                opacity: 1;
            }
            
            /* Help Modal */
            .help-modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            
            .help-modal-wide {
                max-width: 800px;
            }
            
            .help-modal-overlay.show .help-modal {
                transform: scale(1);
            }
            
            .help-modal-header {
                padding: 20px 24px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 12px;
                flex-shrink: 0;
            }
            
            .help-modal-icon {
                font-size: 28px;
            }
            
            .help-modal-title {
                flex: 1;
                font-size: 20px;
                font-weight: 600;
                color: #333;
                margin: 0;
            }
            
            .help-modal-close {
                width: 32px;
                height: 32px;
                border: none;
                background: #f5f5f5;
                border-radius: 50%;
                font-size: 24px;
                color: #666;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .help-modal-close:hover {
                background: #e0e0e0;
                color: #333;
            }
            
            .help-modal-body {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            }
            
            .help-section {
                margin-bottom: 24px;
            }
            
            .help-section:last-child {
                margin-bottom: 0;
            }
            
            .help-section h4 {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                margin: 0 0 12px 0;
            }
            
            .help-section ul {
                margin: 8px 0;
                padding-left: 24px;
            }
            
            .help-section li {
                margin: 6px 0;
                color: #555;
                line-height: 1.6;
            }
            
            .help-section p {
                color: #555;
                line-height: 1.6;
                margin: 8px 0;
            }
            
            .method-description {
                background: #f9f9f9;
                border-radius: 8px;
                padding: 16px;
                margin-top: 12px;
            }
            
            .pros-cons {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-top: 12px;
            }
            
            .pros, .cons {
                background: white;
                border-radius: 6px;
                padding: 12px;
            }
            
            .pros h5 {
                color: #4caf50;
                font-size: 14px;
                margin: 0 0 8px 0;
            }
            
            .cons h5 {
                color: #ff9800;
                font-size: 14px;
                margin: 0 0 8px 0;
            }
            
            .pros ul, .cons ul {
                margin: 0;
                padding-left: 20px;
            }
            
            .pros li, .cons li {
                font-size: 13px;
                margin: 4px 0;
            }
            
            .help-divider {
                height: 1px;
                background: #e0e0e0;
                margin: 24px 0;
            }
            
            .help-note {
                background: #e3f2fd;
                border-left: 4px solid #2196f3;
                padding: 12px;
                border-radius: 4px;
                margin: 12px 0;
                font-size: 14px;
            }
            
            .example-list {
                list-style: none;
                padding: 0;
            }
            
            .example-good {
                color: #4caf50;
            }
            
            .example-bad {
                color: #f44336;
            }
            
            /* Onboarding Styles */
            .onboarding-options {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-top: 16px;
            }
            
            .onboarding-option {
                background: #f9f9f9;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                padding: 16px;
                text-align: center;
                transition: all 0.2s;
            }
            
            .onboarding-option:hover {
                border-color: #667eea;
                background: #f5f7ff;
            }
            
            .option-icon {
                font-size: 32px;
                margin-bottom: 8px;
            }
            
            .onboarding-option h5 {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                margin: 8px 0;
            }
            
            .onboarding-option p {
                font-size: 13px;
                color: #666;
                margin: 8px 0 0 0;
                line-height: 1.5;
            }
            
            .help-section ol {
                margin: 12px 0;
                padding-left: 24px;
            }
            
            .help-section ol li {
                margin: 8px 0;
                color: #555;
                line-height: 1.6;
            }
            
            .help-section ol li strong {
                color: #333;
                font-weight: 600;
            }
            
            .help-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
                flex-shrink: 0;
            }
            
            .help-modal-btn {
                padding: 10px 24px;
                border: none;
                border-radius: 6px;
                background: #667eea;
                color: white;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .help-modal-btn:hover {
                background: #5568d3;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .help-modal {
                    width: 95%;
                    max-height: 90vh;
                }
                
                .help-modal-wide {
                    max-width: 95%;
                }
                
                .pros-cons {
                    grid-template-columns: 1fr;
                }
                
                .onboarding-options {
                    grid-template-columns: 1fr;
                }
                
                .help-modal-header,
                .help-modal-body,
                .help-modal-footer {
                    padding: 16px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 전역 인스턴스 생성
if (typeof window !== 'undefined') {
    window.ContextualHelpSystem = ContextualHelpSystem;
    
    // DOM 로드 후 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.contextualHelpSystem = new ContextualHelpSystem();
        });
    } else {
        window.contextualHelpSystem = new ContextualHelpSystem();
    }
}
