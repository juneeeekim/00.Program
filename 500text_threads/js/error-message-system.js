/**
 * ErrorMessageSystem
 * 
 * 통합 에러 메시지 시스템
 * - Toast 알림 (간단한 메시지)
 * - Modal 다이얼로그 (상세한 에러 정보)
 * - 심각도 레벨 (error, warning, info, success)
 * - "자세히 보기" 버튼 (복잡한 에러용)
 * - "재시도" 버튼 (복구 가능한 에러용)
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

class ErrorMessageSystem {
    constructor() {
        // 설정
        this.toastDuration = {
            success: 3000,
            info: 4000,
            warning: 5000,
            error: 6000
        };
        
        // 현재 표시 중인 메시지
        this.activeToasts = [];
        this.activeModal = null;
        
        // 에러 상세 정보 저장
        this.errorDetails = new Map();
        
        // 초기화
        this.init();
    }
    
    /**
     * 초기화
     */
    init() {
        // Toast 컨테이너 생성
        this.createToastContainer();
        
        // 스타일 추가
        this.injectStyles();
    }
    
    /**
     * Toast 컨테이너 생성
     */
    createToastContainer() {
        if (document.getElementById('error-toast-container')) {
            return;
        }
        
        const container = document.createElement('div');
        container.id = 'error-toast-container';
        container.className = 'error-toast-container';
        document.body.appendChild(container);
    }
    
    /**
     * Toast 알림 표시
     * @param {string} message - 메시지
     * @param {string} severity - 'success' | 'info' | 'warning' | 'error'
     * @param {Object} options - 추가 옵션
     * Requirements: 9.2
     */
    showToast(message, severity = 'info', options = {}) {
        const {
            duration = this.toastDuration[severity],
            showLearnMore = false,
            learnMoreCallback = null,
            showRetry = false,
            retryCallback = null,
            dismissible = true
        } = options;
        
        // Toast 요소 생성
        const toast = document.createElement('div');
        toast.className = `error-toast error-toast-${severity}`;
        
        // 아이콘
        const icon = this.getIcon(severity);
        
        // 내용 구성
        toast.innerHTML = `
            <div class="error-toast-content">
                <span class="error-toast-icon">${icon}</span>
                <div class="error-toast-message">${this.escapeHtml(message)}</div>
                <div class="error-toast-actions">
                    ${showLearnMore ? '<button class="error-toast-btn error-toast-learn-more">자세히 보기</button>' : ''}
                    ${showRetry ? '<button class="error-toast-btn error-toast-retry">재시도</button>' : ''}
                    ${dismissible ? '<button class="error-toast-btn error-toast-dismiss">×</button>' : ''}
                </div>
            </div>
        `;
        
        // 이벤트 바인딩
        if (showLearnMore && learnMoreCallback) {
            const learnMoreBtn = toast.querySelector('.error-toast-learn-more');
            learnMoreBtn.addEventListener('click', () => {
                learnMoreCallback();
                this.removeToast(toast);
            });
        }
        
        if (showRetry && retryCallback) {
            const retryBtn = toast.querySelector('.error-toast-retry');
            retryBtn.addEventListener('click', () => {
                retryCallback();
                this.removeToast(toast);
            });
        }
        
        if (dismissible) {
            const dismissBtn = toast.querySelector('.error-toast-dismiss');
            dismissBtn.addEventListener('click', () => {
                this.removeToast(toast);
            });
        }
        
        // 컨테이너에 추가
        const container = document.getElementById('error-toast-container');
        container.appendChild(toast);
        
        // 애니메이션
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 활성 Toast 목록에 추가
        this.activeToasts.push(toast);
        
        // 자동 제거
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }
        
        return toast;
    }
    
    /**
     * Toast 제거
     * @param {HTMLElement} toast
     */
    removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        
        toast.classList.remove('show');
        toast.classList.add('hide');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            
            // 활성 목록에서 제거
            const index = this.activeToasts.indexOf(toast);
            if (index > -1) {
                this.activeToasts.splice(index, 1);
            }
        }, 300);
    }
    
    /**
     * 모든 Toast 제거
     */
    clearAllToasts() {
        this.activeToasts.forEach(toast => {
            this.removeToast(toast);
        });
        this.activeToasts = [];
    }
    
    /**
     * Modal 다이얼로그 표시
     * @param {Object} options - 모달 옵션
     * Requirements: 9.2, 9.6, 9.7
     */
    showModal(options) {
        const {
            title = '오류',
            message = '',
            severity = 'error',
            details = null,
            showRetry = false,
            retryCallback = null,
            showCancel = true,
            cancelText = '닫기',
            confirmText = '확인',
            confirmCallback = null
        } = options;
        
        // 기존 모달 제거
        this.closeModal();
        
        // 모달 오버레이 생성
        const overlay = document.createElement('div');
        overlay.className = 'error-modal-overlay';
        
        // 모달 생성
        const modal = document.createElement('div');
        modal.className = `error-modal error-modal-${severity}`;
        
        // 아이콘
        const icon = this.getIcon(severity);
        
        // 내용 구성
        modal.innerHTML = `
            <div class="error-modal-header">
                <span class="error-modal-icon">${icon}</span>
                <h3 class="error-modal-title">${this.escapeHtml(title)}</h3>
            </div>
            <div class="error-modal-body">
                <p class="error-modal-message">${this.escapeHtml(message)}</p>
                ${details ? `
                    <div class="error-modal-details">
                        <button class="error-modal-details-toggle" id="error-details-toggle">
                            <span class="toggle-icon">▶</span>
                            <span class="toggle-text">자세한 정보</span>
                        </button>
                        <div class="error-modal-details-content" id="error-details-content" style="display: none;">
                            <pre>${this.escapeHtml(JSON.stringify(details, null, 2))}</pre>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="error-modal-footer">
                ${showRetry ? `<button class="error-modal-btn error-modal-retry">재시도</button>` : ''}
                ${showCancel ? `<button class="error-modal-btn error-modal-cancel">${this.escapeHtml(cancelText)}</button>` : ''}
                ${confirmCallback ? `<button class="error-modal-btn error-modal-confirm">${this.escapeHtml(confirmText)}</button>` : ''}
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 애니메이션
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // 이벤트 바인딩
        if (details) {
            const toggleBtn = modal.querySelector('#error-details-toggle');
            const detailsContent = modal.querySelector('#error-details-content');
            const toggleIcon = toggleBtn.querySelector('.toggle-icon');
            
            toggleBtn.addEventListener('click', () => {
                const isVisible = detailsContent.style.display !== 'none';
                detailsContent.style.display = isVisible ? 'none' : 'block';
                toggleIcon.textContent = isVisible ? '▶' : '▼';
            });
        }
        
        if (showRetry && retryCallback) {
            const retryBtn = modal.querySelector('.error-modal-retry');
            retryBtn.addEventListener('click', () => {
                retryCallback();
                this.closeModal();
            });
        }
        
        if (showCancel) {
            const cancelBtn = modal.querySelector('.error-modal-cancel');
            cancelBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }
        
        if (confirmCallback) {
            const confirmBtn = modal.querySelector('.error-modal-confirm');
            confirmBtn.addEventListener('click', () => {
                confirmCallback();
                this.closeModal();
            });
        }
        
        // 오버레이 클릭 시 닫기
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeModal();
            }
        });
        
        // ESC 키로 닫기
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        this.activeModal = overlay;
        
        return overlay;
    }
    
    /**
     * Modal 닫기
     */
    closeModal() {
        if (!this.activeModal) return;
        
        this.activeModal.classList.remove('show');
        
        setTimeout(() => {
            if (this.activeModal && this.activeModal.parentNode) {
                this.activeModal.parentNode.removeChild(this.activeModal);
            }
            this.activeModal = null;
        }, 300);
    }
    
    /**
     * 에러 표시 (자동으로 Toast 또는 Modal 선택)
     * @param {Error} error
     * @param {Object} options
     * Requirements: 9.1, 9.2
     */
    showError(error, options = {}) {
        const {
            useModal = false,
            showRetry = false,
            retryCallback = null,
            showDetails = false
        } = options;
        
        const message = error.userMessage || error.message || '오류가 발생했습니다.';
        const severity = this.getSeverityFromError(error);
        
        if (useModal) {
            // Modal로 표시
            this.showModal({
                title: this.getTitleFromSeverity(severity),
                message: message,
                severity: severity,
                details: showDetails ? {
                    error: error.message,
                    code: error.code,
                    stack: error.stack
                } : null,
                showRetry: showRetry,
                retryCallback: retryCallback
            });
        } else {
            // Toast로 표시
            this.showToast(message, severity, {
                showRetry: showRetry,
                retryCallback: retryCallback,
                showLearnMore: showDetails,
                learnMoreCallback: () => {
                    this.showModal({
                        title: this.getTitleFromSeverity(severity),
                        message: message,
                        severity: severity,
                        details: {
                            error: error.message,
                            code: error.code,
                            stack: error.stack
                        }
                    });
                }
            });
        }
    }
    
    /**
     * 성공 메시지 표시
     * @param {string} message
     * @param {Object} options
     */
    showSuccess(message, options = {}) {
        return this.showToast(message, 'success', options);
    }
    
    /**
     * 정보 메시지 표시
     * @param {string} message
     * @param {Object} options
     */
    showInfo(message, options = {}) {
        return this.showToast(message, 'info', options);
    }
    
    /**
     * 경고 메시지 표시
     * @param {string} message
     * @param {Object} options
     */
    showWarning(message, options = {}) {
        return this.showToast(message, 'warning', options);
    }
    
    /**
     * 확인 다이얼로그 표시
     * @param {string} message
     * @param {Function} onConfirm
     * @param {Object} options
     */
    showConfirm(message, onConfirm, options = {}) {
        const {
            title = '확인',
            confirmText = '확인',
            cancelText = '취소'
        } = options;
        
        return this.showModal({
            title: title,
            message: message,
            severity: 'info',
            showCancel: true,
            cancelText: cancelText,
            confirmText: confirmText,
            confirmCallback: onConfirm
        });
    }
    
    /**
     * 심각도에 따른 아이콘 반환
     * @param {string} severity
     * @returns {string}
     */
    getIcon(severity) {
        const icons = {
            success: '✅',
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌'
        };
        return icons[severity] || icons.info;
    }
    
    /**
     * 에러에서 심각도 추출
     * @param {Error} error
     * @returns {string}
     */
    getSeverityFromError(error) {
        if (error.severity) {
            return error.severity;
        }
        
        if (error.code) {
            const code = error.code.toUpperCase();
            if (code.includes('WARNING') || code.includes('VALIDATION')) {
                return 'warning';
            }
            if (code.includes('INFO')) {
                return 'info';
            }
        }
        
        return 'error';
    }
    
    /**
     * 심각도에 따른 제목 반환
     * @param {string} severity
     * @returns {string}
     */
    getTitleFromSeverity(severity) {
        const titles = {
            success: '성공',
            info: '알림',
            warning: '경고',
            error: '오류'
        };
        return titles[severity] || titles.error;
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
        if (document.getElementById('error-message-system-styles')) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = 'error-message-system-styles';
        style.textContent = `
            /* Toast Container */
            .error-toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            }
            
            /* Toast */
            .error-toast {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                padding: 16px;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                border-left: 4px solid #ccc;
            }
            
            .error-toast.show {
                opacity: 1;
                transform: translateX(0);
            }
            
            .error-toast.hide {
                opacity: 0;
                transform: translateX(100%);
            }
            
            .error-toast-success {
                border-left-color: #4caf50;
            }
            
            .error-toast-info {
                border-left-color: #2196f3;
            }
            
            .error-toast-warning {
                border-left-color: #ff9800;
            }
            
            .error-toast-error {
                border-left-color: #f44336;
            }
            
            .error-toast-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            
            .error-toast-icon {
                font-size: 24px;
                flex-shrink: 0;
            }
            
            .error-toast-message {
                flex: 1;
                color: #333;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .error-toast-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .error-toast-btn {
                background: none;
                border: none;
                color: #667eea;
                cursor: pointer;
                font-size: 14px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s;
            }
            
            .error-toast-btn:hover {
                background: rgba(102, 126, 234, 0.1);
            }
            
            .error-toast-dismiss {
                font-size: 20px;
                color: #999;
                padding: 0;
                width: 24px;
                height: 24px;
            }
            
            /* Modal Overlay */
            .error-modal-overlay {
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
            
            .error-modal-overlay.show {
                opacity: 1;
            }
            
            /* Modal */
            .error-modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow: auto;
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            
            .error-modal-overlay.show .error-modal {
                transform: scale(1);
            }
            
            .error-modal-header {
                padding: 24px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .error-modal-icon {
                font-size: 32px;
            }
            
            .error-modal-title {
                font-size: 20px;
                font-weight: 600;
                color: #333;
                margin: 0;
            }
            
            .error-modal-body {
                padding: 24px;
            }
            
            .error-modal-message {
                color: #555;
                font-size: 16px;
                line-height: 1.6;
                margin: 0 0 16px 0;
            }
            
            .error-modal-details {
                margin-top: 16px;
            }
            
            .error-modal-details-toggle {
                background: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                text-align: left;
                font-size: 14px;
                color: #666;
                transition: background 0.2s;
            }
            
            .error-modal-details-toggle:hover {
                background: #ebebeb;
            }
            
            .toggle-icon {
                font-size: 12px;
            }
            
            .error-modal-details-content {
                margin-top: 12px;
                background: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 12px;
                max-height: 200px;
                overflow: auto;
            }
            
            .error-modal-details-content pre {
                margin: 0;
                font-size: 12px;
                color: #666;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .error-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid #eee;
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
            
            .error-modal-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .error-modal-cancel {
                background: #f5f5f5;
                color: #666;
            }
            
            .error-modal-cancel:hover {
                background: #ebebeb;
            }
            
            .error-modal-confirm,
            .error-modal-retry {
                background: #667eea;
                color: white;
            }
            
            .error-modal-confirm:hover,
            .error-modal-retry:hover {
                background: #5568d3;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .error-toast-container {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
                
                .error-modal {
                    width: 95%;
                    max-height: 90vh;
                }
                
                .error-modal-header,
                .error-modal-body,
                .error-modal-footer {
                    padding: 16px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 전역 인스턴스 생성
if (typeof window !== 'undefined') {
    window.ErrorMessageSystem = ErrorMessageSystem;
    window.errorMessageSystem = new ErrorMessageSystem();
}
