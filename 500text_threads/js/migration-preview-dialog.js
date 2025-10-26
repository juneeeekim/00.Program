/**
 * MigrationPreviewDialog
 * 
 * 마이그레이션 미리보기 다이얼로그
 * - 분석 결과 표시 (항목 수, 예상 시간)
 * - 원본 및 대상 계정 명확히 표시
 * - 시작/취소 버튼
 * - 데이터 통합 경고
 * 
 * Requirements: 5.2
 */

class MigrationPreviewDialog {
    constructor(migrationManager, logger) {
        // 의존성
        this.migrationManager = migrationManager || new MigrationManager();
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 상태
        this.isOpen = false;
        this.onConfirm = null;
        this.onCancel = null;
    }
    
    /**
     * 미리보기 다이얼로그 표시
     * @param {Object} analysis - 데이터 분석 결과
     * @param {string} sourceUser - 원본 사용자
     * @param {string} targetUser - 대상 사용자
     * @returns {Promise<boolean>} 사용자 확인 여부
     */
    async show(analysis, sourceUser, targetUser) {
        return new Promise((resolve) => {
            // 이미 열려있으면 닫기
            if (this.isOpen) {
                this.close();
            }
            
            // 콜백 설정
            this.onConfirm = () => {
                this.close();
                resolve(true);
            };
            
            this.onCancel = () => {
                this.close();
                resolve(false);
            };
            
            // 다이얼로그 생성 및 표시
            const dialog = this.createDialog(analysis, sourceUser, targetUser);
            document.body.appendChild(dialog);
            
            this.isOpen = true;
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_preview_shown', '마이그레이션 미리보기 표시', {
                    sourceUser: sourceUser,
                    targetUser: targetUser,
                    itemCount: analysis.itemCount
                });
            }
            
            // 애니메이션
            setTimeout(() => {
                dialog.classList.add('show');
            }, 10);
        });
    }
    
    /**
     * 다이얼로그 생성
     * @param {Object} analysis - 데이터 분석 결과
     * @param {string} sourceUser - 원본 사용자
     * @param {string} targetUser - 대상 사용자
     * @returns {HTMLElement}
     */
    createDialog(analysis, sourceUser, targetUser) {
        const overlay = document.createElement('div');
        overlay.id = 'migration-preview-overlay';
        overlay.className = 'migration-preview-overlay';
        
        overlay.innerHTML = `
            <div class="migration-preview-dialog">
                <div class="migration-preview-header">
                    <h3>📦 데이터 마이그레이션 미리보기</h3>
                    <button class="close-btn" id="migration-preview-close" aria-label="닫기">×</button>
                </div>
                
                <div class="migration-preview-body">
                    <!-- 계정 정보 -->
                    <div class="migration-accounts">
                        <div class="migration-account source">
                            <div class="account-label">원본 계정</div>
                            <div class="account-name">${this.escapeHtml(sourceUser)}</div>
                            <div class="account-type">${this.getAccountType(sourceUser)}</div>
                        </div>
                        
                        <div class="migration-arrow">→</div>
                        
                        <div class="migration-account target">
                            <div class="account-label">대상 계정</div>
                            <div class="account-name">${this.escapeHtml(targetUser)}</div>
                            <div class="account-type">${this.getAccountType(targetUser)}</div>
                        </div>
                    </div>
                    
                    <!-- 분석 결과 -->
                    <div class="migration-analysis">
                        <h4>📊 마이그레이션 정보</h4>
                        <div class="analysis-grid">
                            <div class="analysis-item">
                                <span class="analysis-icon">📝</span>
                                <div class="analysis-content">
                                    <div class="analysis-label">저장된 글</div>
                                    <div class="analysis-value">${analysis.itemCount}개</div>
                                </div>
                            </div>
                            
                            <div class="analysis-item">
                                <span class="analysis-icon">💾</span>
                                <div class="analysis-content">
                                    <div class="analysis-label">데이터 크기</div>
                                    <div class="analysis-value">${analysis.totalSizeReadable}</div>
                                </div>
                            </div>
                            
                            <div class="analysis-item">
                                <span class="analysis-icon">⏱️</span>
                                <div class="analysis-content">
                                    <div class="analysis-label">예상 소요 시간</div>
                                    <div class="analysis-value">${this.formatTime(analysis.estimatedTime)}</div>
                                </div>
                            </div>
                            
                            <div class="analysis-item">
                                <span class="analysis-icon">📦</span>
                                <div class="analysis-content">
                                    <div class="analysis-label">처리 배치</div>
                                    <div class="analysis-value">${analysis.batchCount}개</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 경고 메시지 -->
                    <div class="migration-warning">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-content">
                            <h4>데이터 통합 안내</h4>
                            <ul>
                                <li>원본 계정의 모든 데이터가 대상 계정으로 이전됩니다</li>
                                <li>대상 계정에 기존 데이터가 있는 경우 함께 보관됩니다</li>
                                <li>마이그레이션 전 자동으로 백업이 생성됩니다</li>
                                <li>문제 발생 시 자동으로 롤백됩니다</li>
                            </ul>
                        </div>
                    </div>
                    
                    <!-- 진행 사항 -->
                    <div class="migration-steps">
                        <h4>🔄 진행 단계</h4>
                        <ol>
                            <li>백업 생성</li>
                            <li>데이터 이전 (배치 처리)</li>
                            <li>데이터 검증</li>
                            <li>마이그레이션 완료</li>
                        </ol>
                    </div>
                </div>
                
                <div class="migration-preview-footer">
                    <button class="btn-secondary" id="migration-preview-cancel">취소</button>
                    <button class="btn-primary" id="migration-preview-start">
                        <span class="btn-icon">🚀</span>
                        마이그레이션 시작
                    </button>
                </div>
            </div>
        `;
        
        // 이벤트 바인딩
        this.bindEvents(overlay);
        
        return overlay;
    }
    
    /**
     * 이벤트 바인딩
     * @param {HTMLElement} overlay
     */
    bindEvents(overlay) {
        // 닫기 버튼
        const closeBtn = overlay.querySelector('#migration-preview-close');
        closeBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
        });
        
        // 취소 버튼
        const cancelBtn = overlay.querySelector('#migration-preview-cancel');
        cancelBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
        });
        
        // 시작 버튼
        const startBtn = overlay.querySelector('#migration-preview-start');
        startBtn.addEventListener('click', () => {
            if (this.onConfirm) {
                this.onConfirm();
            }
        });
        
        // 오버레이 클릭 (배경 클릭 시 닫기)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (this.onCancel) {
                    this.onCancel();
                }
            }
        });
        
        // ESC 키로 닫기
        const escHandler = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                if (this.onCancel) {
                    this.onCancel();
                }
            }
        };
        
        document.addEventListener('keydown', escHandler);
        
        // 정리 시 이벤트 리스너 제거
        overlay.addEventListener('remove', () => {
            document.removeEventListener('keydown', escHandler);
        });
    }
    
    /**
     * 다이얼로그 닫기
     */
    close() {
        const overlay = document.getElementById('migration-preview-overlay');
        
        if (overlay) {
            overlay.classList.remove('show');
            
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.dispatchEvent(new Event('remove'));
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
        
        this.isOpen = false;
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('migration_preview_closed', '마이그레이션 미리보기 닫힘');
        }
    }
    
    /**
     * 계정 유형 판별
     * @param {string} userId
     * @returns {string}
     */
    getAccountType(userId) {
        if (userId.includes('@')) {
            return '🔍 Google 계정';
        } else {
            return '👤 사용자명 계정';
        }
    }
    
    /**
     * 시간 포맷팅
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        if (seconds < 1) {
            return '1초 미만';
        } else if (seconds < 60) {
            return `약 ${seconds}초`;
        } else {
            const minutes = Math.ceil(seconds / 60);
            return `약 ${minutes}분`;
        }
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
    window.MigrationPreviewDialog = MigrationPreviewDialog;
}
