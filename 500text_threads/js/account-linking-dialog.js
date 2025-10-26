/**
 * AccountLinkingDialog
 * 
 * 계정 연결 UI 다이얼로그
 * - 매칭된 계정 표시
 * - 신뢰도 점수 및 이유 표시
 * - 데이터 미리보기 (항목 수, 마지막 사용)
 * - 연결/나중에/무시 버튼
 * 
 * Requirements: 8.2, 8.3
 */

class AccountLinkingDialog {
    constructor(userMatcher, migrationManager, logger) {
        // 의존성
        this.userMatcher = userMatcher || (window.UserMatcher ? new UserMatcher() : null);
        this.migrationManager = migrationManager || null;
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 콜백
        this.onLink = null;
        this.onLater = null;
        this.onIgnore = null;
    }
    
    /**
     * 계정 연결 다이얼로그 표시
     * @param {string} googleEmail - Google 이메일
     * @param {Object} matchResult - 매칭 결과
     * @returns {Promise<string>} 'link' | 'later' | 'ignore'
     */
    async show(googleEmail, matchResult) {
        return new Promise((resolve) => {
            // 모달 생성
            const modal = this.createModal(googleEmail, matchResult);
            document.body.appendChild(modal);
            
            // 버튼 이벤트
            const linkBtn = modal.querySelector('#account-link-btn');
            const laterBtn = modal.querySelector('#account-later-btn');
            const ignoreBtn = modal.querySelector('#account-ignore-btn');
            const closeBtn = modal.querySelector('#account-link-close');
            
            const handleClose = (action) => {
                // 로깅
                if (this.logger) {
                    this.logger.logAction('account_link_dialog_closed', '계정 연결 다이얼로그 닫힘', {
                        googleEmail: googleEmail,
                        username: matchResult.username,
                        action: action
                    });
                }
                
                // 모달 제거
                modal.classList.add('hiding');
                setTimeout(() => {
                    if (modal.parentNode) {
                        document.body.removeChild(modal);
                    }
                }, 300);
                
                resolve(action);
            };
            
            // 연결하고 데이터 이전
            linkBtn.addEventListener('click', async () => {
                linkBtn.disabled = true;
                linkBtn.textContent = '연결 중...';
                
                try {
                    // 계정 연결
                    const linked = this.userMatcher.linkAccounts(googleEmail, matchResult.username);
                    
                    if (linked) {
                        // 콜백 실행
                        if (this.onLink) {
                            await this.onLink(googleEmail, matchResult.username);
                        }
                        
                        handleClose('link');
                    } else {
                        throw new Error('계정 연결 실패');
                    }
                } catch (error) {
                    console.error('❌ 계정 연결 실패:', error);
                    alert('계정 연결에 실패했습니다. 다시 시도해주세요.');
                    linkBtn.disabled = false;
                    linkBtn.textContent = '연결하고 데이터 이전';
                }
            });
            
            // 나중에
            laterBtn.addEventListener('click', () => {
                if (this.onLater) {
                    this.onLater(googleEmail, matchResult.username);
                }
                handleClose('later');
            });
            
            // 무시
            ignoreBtn.addEventListener('click', () => {
                if (confirm('이 매칭을 무시하시겠습니까?\n\n다시 표시되지 않습니다.')) {
                    // 무시 처리
                    this.userMatcher.ignoreMatch(googleEmail, matchResult.username);
                    
                    if (this.onIgnore) {
                        this.onIgnore(googleEmail, matchResult.username);
                    }
                    
                    handleClose('ignore');
                }
            });
            
            // 닫기 버튼 (나중에와 동일)
            closeBtn.addEventListener('click', () => {
                if (this.onLater) {
                    this.onLater(googleEmail, matchResult.username);
                }
                handleClose('later');
            });
            
            // ESC 키로 닫기
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escHandler);
                    if (this.onLater) {
                        this.onLater(googleEmail, matchResult.username);
                    }
                    handleClose('later');
                }
            };
            document.addEventListener('keydown', escHandler);
            
            // 애니메이션
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
        });
    }
    
    /**
     * 모달 생성
     * @param {string} googleEmail
     * @param {Object} matchResult
     * @returns {HTMLElement}
     */
    createModal(googleEmail, matchResult) {
        const modal = document.createElement('div');
        modal.className = 'account-link-modal-overlay';
        
        // 신뢰도 퍼센트
        const confidencePercent = Math.round(matchResult.confidence * 100);
        
        // 신뢰도 색상
        let confidenceColor = '#28a745'; // 녹색
        if (matchResult.confidence < 0.8) {
            confidenceColor = '#ffc107'; // 노란색
        }
        if (matchResult.confidence < 0.7) {
            confidenceColor = '#dc3545'; // 빨간색
        }
        
        // 마지막 사용 시간 포맷
        const lastUsedText = this.userMatcher.formatDate(matchResult.lastUsed);
        
        modal.innerHTML = `
            <div class="account-link-modal">
                <button class="modal-close-btn" id="account-link-close" aria-label="닫기">×</button>
                
                <div class="account-link-header">
                    <div class="account-link-icon">🔗</div>
                    <h3>계정 연결 제안</h3>
                    <p class="account-link-subtitle">기존 사용자명 계정을 발견했습니다</p>
                </div>
                
                <div class="account-link-content">
                    <!-- 매칭 정보 -->
                    <div class="match-info-card">
                        <div class="match-username">
                            <span class="username-icon">👤</span>
                            <span class="username-text">"${this.escapeHtml(matchResult.username)}"</span>
                        </div>
                        
                        <div class="match-details">
                            <div class="match-detail-item">
                                <span class="detail-icon">📦</span>
                                <span class="detail-text">${matchResult.itemCount}개 글</span>
                            </div>
                            <div class="match-detail-item">
                                <span class="detail-icon">🕒</span>
                                <span class="detail-text">최근 사용: ${lastUsedText}</span>
                            </div>
                        </div>
                        
                        <div class="match-confidence">
                            <div class="confidence-label">매칭 신뢰도</div>
                            <div class="confidence-bar-container">
                                <div class="confidence-bar" style="width: ${confidencePercent}%; background: ${confidenceColor};"></div>
                            </div>
                            <div class="confidence-value" style="color: ${confidenceColor};">
                                ${confidencePercent}%
                            </div>
                        </div>
                        
                        <div class="match-reason">
                            <span class="reason-icon">💡</span>
                            <span class="reason-text">${this.escapeHtml(matchResult.reason)}</span>
                        </div>
                    </div>
                    
                    <!-- 연결 설명 -->
                    <div class="link-explanation">
                        <h4>이 계정을 Google 계정과 연결하시겠습니까?</h4>
                        <div class="link-email">
                            <span class="email-icon">📧</span>
                            <span class="email-text">${this.escapeHtml(googleEmail)}</span>
                        </div>
                        
                        <div class="link-benefits">
                            <div class="benefit-item">
                                <span class="benefit-check">✓</span>
                                <span>데이터가 통합됩니다</span>
                            </div>
                            <div class="benefit-item">
                                <span class="benefit-check">✓</span>
                                <span>어떤 방식으로 로그인해도 같은 데이터 사용</span>
                            </div>
                            <div class="benefit-item">
                                <span class="benefit-check">✓</span>
                                <span>클라우드 동기화 가능</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="account-link-actions">
                    <button id="account-link-btn" class="btn btn-primary btn-large">
                        <span class="btn-icon">🔗</span>
                        연결하고 데이터 이전
                    </button>
                    <div class="secondary-actions">
                        <button id="account-later-btn" class="btn btn-secondary">나중에</button>
                        <button id="account-ignore-btn" class="btn btn-text">무시</button>
                    </div>
                </div>
            </div>
        `;
        
        return modal;
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
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.AccountLinkingDialog = AccountLinkingDialog;
}
