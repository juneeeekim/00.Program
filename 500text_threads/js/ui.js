import { Constants } from './constants.js';
import { escapeHtml, formatDate } from './utils.js';

/**
 * UI 관리 클래스
 * DOM 조작, 이벤트 리스너 바인딩, 화면 업데이트를 담당합니다.
 */
export class UIManager {
    constructor() {
        this.elements = {};
        this.initElements();
    }

    /**
     * 주요 DOM 요소 초기화 및 캐싱
     */
    initElements() {
        // 사용자 인증 관련
        this.elements.usernameInput = document.getElementById('username-input');
        this.elements.loginBtn = document.getElementById('login-btn');
        this.elements.logoutBtn = document.getElementById('logout-btn');
        this.elements.loginForm = document.getElementById('login-form');
        this.elements.userInfo = document.getElementById('user-info');
        this.elements.usernameDisplay = document.getElementById('username-display');
        this.elements.mainContent = document.getElementById('main-content');

        // 탭 관련
        this.elements.tabButtons = document.querySelectorAll('.tab-button');
        this.elements.tabContents = document.querySelectorAll('.tab-content');

        // 알림/토스트
        this.elements.toastContainer = document.getElementById('toast-container');
        if (!this.elements.toastContainer) {
            this.elements.toastContainer = document.createElement('div');
            this.elements.toastContainer.id = 'toast-container';
            this.elements.toastContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';
            document.body.appendChild(this.elements.toastContainer);
        }
    }

    /**
     * 로그인 UI 상태 업데이트
     * @param {boolean} isLoggedIn - 로그인 여부
     * @param {string} username - 사용자명 (로그인 시)
     */
    updateLoginState(isLoggedIn, username = '') {
        if (isLoggedIn) {
            this.elements.loginForm.style.display = 'none';
            this.elements.userInfo.style.display = 'flex';
            this.elements.usernameDisplay.textContent = username;
            this.elements.mainContent.style.display = 'block';
        } else {
            this.elements.loginForm.style.display = 'block';
            this.elements.userInfo.style.display = 'none';
            // this.elements.mainContent.style.display = 'none'; // 로그인 전에도 메인 컨텐츠 표시 (요구사항)
            this.elements.usernameInput.value = '';
        }
    }

    /**
     * 토스트 메시지 표시
     * @param {string} message - 메시지 내용
     * @param {string} type - 메시지 타입 ('success', 'error', 'info', 'warning')
     */
    showMessage(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // 스타일 설정 (CSS 클래스가 없는 경우를 대비한 기본 스타일)
        toast.style.cssText = `
            background-color: ${type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#333'};
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            margin-top: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
        `;

        this.elements.toastContainer.appendChild(toast);

        // 페이드 인
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });

        // 일정 시간 후 제거
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.parentElement.removeChild(toast);
                }
            }, 300);
        }, Constants.UI.TOAST_DURATION);
    }

    /**
     * 탭 전환 UI 업데이트
     * @param {string} tabName - 활성화할 탭 이름
     */
    activateTab(tabName) {
        // 버튼 상태 업데이트
        this.elements.tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 컨텐츠 표시 업데이트
        this.elements.tabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    /**
     * 요소의 표시 여부 토글
     * @param {HTMLElement} element - 대상 요소
     * @param {boolean} show - 표시 여부
     */
    toggleElement(element, show) {
        if (!element) return;
        element.style.display = show ? 'block' : 'none';
    }

    /**
     * 입력 필드 값 가져오기
     * @param {string} elementId - 요소 ID
     * @returns {string} - 입력값
     */
    getInputValue(elementId) {
        const element = document.getElementById(elementId);
        return element ? element.value : '';
    }

    /**
     * 입력 필드 값 설정하기
     * @param {string} elementId - 요소 ID
     * @param {string} value - 설정할 값
     */
    setInputValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = value;
        }
    }

    /**
     * 로딩 상태 표시/해제
     * @param {HTMLElement} element - 대상 요소 (버튼 등)
     * @param {boolean} isLoading - 로딩 여부
     */
    showLoadingState(element, isLoading) {
        if (!element) return;
        
        if (isLoading) {
            // 기존 내용 저장 (HTML 포함)
            if (!element.hasAttribute('data-original-html')) {
                element.setAttribute('data-original-html', element.innerHTML);
            }
            element.disabled = true;
            element.classList.add('loading');
            
            // 버튼인 경우 텍스트 변경 (아이콘 포함 가능)
            // [UX] 로딩 스피너와 텍스트 표시
            element.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 처리 중...';
        } else {
            element.disabled = false;
            element.classList.remove('loading');
            
            // 내용 복원
            if (element.hasAttribute('data-original-html')) {
                element.innerHTML = element.getAttribute('data-original-html');
                element.removeAttribute('data-original-html');
            }
        }
    }
}
