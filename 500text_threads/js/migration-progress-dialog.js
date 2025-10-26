/**
 * MigrationProgressDialog
 * 
 * 마이그레이션 진행 상황 다이얼로그
 * - 진행률 바 (퍼센티지)
 * - 현재 단계 표시 (백업, 이전, 검증)
 * - 항목 수 진행 상황 (예: "98/150 items")
 * - 예상 남은 시간
 * - 취소 버튼 (확인 포함)
 * 
 * Requirements: 5.4, 5.5
 */

class MigrationProgressDialog {
    constructor(logger) {
        // 의존성
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 상태
        this.isOpen = false;
        this.isCancelled = false;
        this.onCancel = null;
        
        // 진행 상황
        this.startTime = null;
        this.totalItems = 0;
        this.currentStep = null;
    }
    
    /**
     * 진행 다이얼로그 표시
     * @param {number} totalItems - 전체 항목 수
     * @returns {Object} 진행 제어 객체
     */
    show(totalItems) {
        // 이미 열려있으면 닫기
        if (this.isOpen) {
            this.close();
        }
        
        this.totalItems = totalItems;
        this.startTime = Date.now();
        this.isCancelled = false;
        
        // 다이얼로그 생성 및 표시
        const dialog = this.createDialog();
        document.body.appendChild(dialog);
        
        this.isOpen = true;
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('migration_progress_shown', '마이그레이션 진행 다이얼로그 표시', {
                totalItems: totalItems
            });
        }
        
        // 애니메이션
        setTimeout(() => {
            dialog.classList.add('show');
        }, 10);
        
        // 진행 제어 객체 반환
        return {
            update: (progress) => this.updateProgress(progress),
            complete: () => this.showComplete(),
            error: (error) => this.showError(error),
            close: () => this.close()
        };
    }
    
    /**
     * 다이얼로그 생성
     * @returns {HTMLElement}
     */
    createDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'migration-progress-overlay';
        overlay.className = 'migration-progress-overlay';
        
        overlay.innerHTML = `
            <div class="migration-progress-dialog">
                <div class="migration-progress-header">
                    <h3>🔄 데이터 마이그레이션 중...</h3>
                </div>
                
                <div class="migration-progress-body">
                    <!-- 진행률 바 -->
                    <div class="progress-bar-container">
                        <div class="progress-bar">
                            <div class="progress-fill" id="migration-progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="progress-percentage" id="migration-progress-percentage">0%</div>
                    </div>
                    
                    <!-- 현재 단계 -->
                    <div class="progress-steps">
                        <div class="progress-step" id="step-backup" data-step="backup">
                            <span class="step-icon">💾</span>
                            <span class="step-label">백업 생성</span>
                            <span class="step-status"></span>
                        </div>
                        
                        <div class="progress-step" id="step-transfer" data-step="transfer">
                            <span class="step-icon">📦</span>
                            <span class="step-label">데이터 이전</span>
                            <span class="step-status"></span>
                        </div>
                        
                        <div class="progress-step" id="step-verify" data-step="verify">
                            <span class="step-icon">🔍</span>
                            <span class="step-label">데이터 검증</span>
                            <span class="step-status"></span>
                        </div>
                        
                        <div class="progress-step" id="step-finalize" data-step="finalize">
                            <span class="step-icon">✅</span>
                            <span class="step-label">완료</span>
                            <span class="step-status"></span>
                        </div>
                    </div>
                    
                    <!-- 상세 정보 -->
                    <div class="progress-details">
                        <div class="progress-detail-item">
                            <span class="detail-label">현재 단계:</span>
                            <span class="detail-value" id="migration-current-step">준비 중...</span>
                        </div>
                        
                        <div class="progress-detail-item">
                            <span class="detail-label">진행 상황:</span>
                            <span class="detail-value" id="migration-item-progress">0/${this.totalItems} 항목</span>
                        </div>
                        
                        <div class="progress-detail-item">
                            <span class="detail-label">예상 남은 시간:</span>
                            <span class="detail-value" id="migration-remaining-time">계산 중...</span>
                        </div>
                    </div>
                    
                    <!-- 경고 메시지 -->
                    <div class="progress-warning">
                        <span class="warning-icon">⚠️</span>
                        <span class="warning-text">마이그레이션이 진행 중입니다. 브라우저를 닫지 마세요.</span>
                    </div>
                </div>
                
                <div class="migration-progress-footer">
                    <button class="btn-secondary" id="migration-progress-cancel">
                        <span class="btn-icon">✖️</span>
                        취소
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
        // 취소 버튼
        const cancelBtn = overlay.querySelector('#migration-progress-cancel');
        cancelBtn.addEventListener('click', () => {
            this.handleCancel();
        });
        
        // ESC 키로 취소 확인
        const escHandler = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.handleCancel();
            }
        };
        
        document.addEventListener('keydown', escHandler);
        
        // 정리 시 이벤트 리스너 제거
        overlay.addEventListener('remove', () => {
            document.removeEventListener('keydown', escHandler);
        });
    }
    
    /**
     * 취소 처리
     */
    handleCancel() {
        if (this.isCancelled) return;
        
        const confirmed = confirm(
            '마이그레이션을 취소하시겠습니까?\n\n' +
            '진행 중인 작업이 중단되고 자동으로 롤백됩니다.'
        );
        
        if (confirmed) {
            this.isCancelled = true;
            
            // 취소 버튼 비활성화
            const cancelBtn = document.getElementById('migration-progress-cancel');
            if (cancelBtn) {
                cancelBtn.disabled = true;
                cancelBtn.textContent = '취소 중...';
            }
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('migration_cancelled', '마이그레이션 취소됨');
            }
            
            // 콜백 실행
            if (this.onCancel) {
                this.onCancel();
            }
        }
    }
    
    /**
     * 진행 상황 업데이트
     * @param {Object} progress - {current, total, percentage, step, stepName}
     */
    updateProgress(progress) {
        if (!this.isOpen) return;
        
        // 진행률 바 업데이트
        const progressFill = document.getElementById('migration-progress-fill');
        const progressPercentage = document.getElementById('migration-progress-percentage');
        
        if (progressFill && progressPercentage) {
            progressFill.style.width = `${progress.percentage}%`;
            progressPercentage.textContent = `${progress.percentage}%`;
        }
        
        // 현재 단계 업데이트
        if (progress.step && progress.step !== this.currentStep) {
            this.updateStep(progress.step);
            this.currentStep = progress.step;
        }
        
        // 단계 이름 업데이트
        const currentStepEl = document.getElementById('migration-current-step');
        if (currentStepEl && progress.stepName) {
            currentStepEl.textContent = progress.stepName;
        }
        
        // 항목 진행 상황 업데이트
        const itemProgress = document.getElementById('migration-item-progress');
        if (itemProgress && progress.current !== undefined && progress.total !== undefined) {
            itemProgress.textContent = `${progress.current}/${progress.total} 항목`;
        }
        
        // 예상 남은 시간 계산 및 업데이트
        if (progress.percentage > 0 && progress.percentage < 100) {
            const remainingTime = this.calculateRemainingTime(progress.percentage);
            const remainingTimeEl = document.getElementById('migration-remaining-time');
            
            if (remainingTimeEl) {
                remainingTimeEl.textContent = this.formatTime(remainingTime);
            }
        }
    }
    
    /**
     * 단계 상태 업데이트
     * @param {string} step - 'backup' | 'transfer' | 'verify' | 'finalize'
     */
    updateStep(step) {
        // 모든 단계 초기화
        const steps = ['backup', 'transfer', 'verify', 'finalize'];
        
        steps.forEach(s => {
            const stepEl = document.getElementById(`step-${s}`);
            if (!stepEl) return;
            
            const statusEl = stepEl.querySelector('.step-status');
            
            if (s === step) {
                // 현재 단계
                stepEl.classList.add('active');
                stepEl.classList.remove('completed');
                statusEl.textContent = '진행 중...';
            } else if (steps.indexOf(s) < steps.indexOf(step)) {
                // 완료된 단계
                stepEl.classList.remove('active');
                stepEl.classList.add('completed');
                statusEl.textContent = '✓';
            } else {
                // 대기 중인 단계
                stepEl.classList.remove('active', 'completed');
                statusEl.textContent = '';
            }
        });
    }
    
    /**
     * 완료 상태 표시
     */
    showComplete() {
        if (!this.isOpen) return;
        
        // 진행률 100%
        this.updateProgress({
            current: this.totalItems,
            total: this.totalItems,
            percentage: 100,
            step: 'complete',
            stepName: '완료!'
        });
        
        // 모든 단계 완료 표시
        const steps = ['backup', 'transfer', 'verify', 'finalize'];
        steps.forEach(step => {
            const stepEl = document.getElementById(`step-${step}`);
            if (stepEl) {
                stepEl.classList.remove('active');
                stepEl.classList.add('completed');
                const statusEl = stepEl.querySelector('.step-status');
                if (statusEl) {
                    statusEl.textContent = '✓';
                }
            }
        });
        
        // 남은 시간 숨김
        const remainingTimeEl = document.getElementById('migration-remaining-time');
        if (remainingTimeEl) {
            remainingTimeEl.textContent = '완료';
        }
        
        // 경고 메시지 변경
        const warningEl = document.querySelector('.progress-warning');
        if (warningEl) {
            warningEl.innerHTML = `
                <span class="warning-icon">✅</span>
                <span class="warning-text">마이그레이션이 성공적으로 완료되었습니다!</span>
            `;
            warningEl.classList.add('success');
        }
        
        // 취소 버튼을 닫기 버튼으로 변경
        const cancelBtn = document.getElementById('migration-progress-cancel');
        if (cancelBtn) {
            cancelBtn.textContent = '닫기';
            cancelBtn.classList.remove('btn-secondary');
            cancelBtn.classList.add('btn-primary');
            
            // 이벤트 리스너 재설정
            const newBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
            
            newBtn.addEventListener('click', () => {
                this.close();
            });
        }
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('migration_progress_complete', '마이그레이션 완료 표시');
        }
    }
    
    /**
     * 에러 상태 표시
     * @param {Error} error
     */
    showError(error) {
        if (!this.isOpen) return;
        
        // 현재 단계를 에러로 표시
        if (this.currentStep) {
            const stepEl = document.getElementById(`step-${this.currentStep}`);
            if (stepEl) {
                stepEl.classList.remove('active');
                stepEl.classList.add('error');
                const statusEl = stepEl.querySelector('.step-status');
                if (statusEl) {
                    statusEl.textContent = '✖';
                }
            }
        }
        
        // 경고 메시지 변경
        const warningEl = document.querySelector('.progress-warning');
        if (warningEl) {
            warningEl.innerHTML = `
                <span class="warning-icon">❌</span>
                <span class="warning-text">마이그레이션 실패: ${this.escapeHtml(error.message)}</span>
            `;
            warningEl.classList.add('error');
        }
        
        // 취소 버튼을 닫기 버튼으로 변경
        const cancelBtn = document.getElementById('migration-progress-cancel');
        if (cancelBtn) {
            cancelBtn.textContent = '닫기';
            
            // 이벤트 리스너 재설정
            const newBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
            
            newBtn.addEventListener('click', () => {
                this.close();
            });
        }
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('migration_progress_error', '마이그레이션 에러 표시', {
                error: error.message
            });
        }
    }
    
    /**
     * 예상 남은 시간 계산
     * @param {number} percentage - 현재 진행률 (0-100)
     * @returns {number} 남은 시간 (초)
     */
    calculateRemainingTime(percentage) {
        if (!this.startTime || percentage === 0) {
            return 0;
        }
        
        const elapsedTime = (Date.now() - this.startTime) / 1000; // 초 단위
        const totalTime = (elapsedTime / percentage) * 100;
        const remainingTime = totalTime - elapsedTime;
        
        return Math.max(0, Math.ceil(remainingTime));
    }
    
    /**
     * 시간 포맷팅
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        if (seconds < 1) {
            return '곧 완료';
        } else if (seconds < 60) {
            return `약 ${seconds}초`;
        } else {
            const minutes = Math.ceil(seconds / 60);
            return `약 ${minutes}분`;
        }
    }
    
    /**
     * 다이얼로그 닫기
     */
    close() {
        const overlay = document.getElementById('migration-progress-overlay');
        
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
        this.currentStep = null;
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('migration_progress_closed', '마이그레이션 진행 다이얼로그 닫힘');
        }
    }
    
    /**
     * 취소 여부 확인
     * @returns {boolean}
     */
    isCancelRequested() {
        return this.isCancelled;
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
    window.MigrationProgressDialog = MigrationProgressDialog;
}
