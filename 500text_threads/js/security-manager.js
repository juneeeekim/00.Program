/**
 * SecurityManager
 * 
 * 보안 관리자 - 공용/개인 기기 모드 관리
 * - 기기 유형 확인 (개인/공용)
 * - 공용 모드 활성화/비활성화
 * - 비활성 타이머 (30분)
 * - 자동 로그아웃 및 데이터 삭제
 * 
 * Requirements: 4.5, 4.6, 4.7, 4.8
 */

class SecurityManager {
    constructor(logger) {
        // 의존성
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 기기 유형
        this.deviceType = null; // 'personal' | 'public' | null
        
        // 타이머
        this.inactivityTimer = null;
        this.warningTimer = null;
        
        // 설정
        this.INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30분
        this.WARNING_TIME = 5 * 60 * 1000; // 5분 전 경고
        
        // 저장 키
        this.DEVICE_TYPE_KEY = 'dualTextWriter_deviceType';
        this.PUBLIC_MODE_KEY = 'dualTextWriter_publicModeActive';
        this.REMEMBER_DEVICE_KEY = 'dualTextWriter_rememberDevice';
        
        // 콜백
        this.onAutoLogout = null;
        
        // 초기화
        this.init();
    }
    
    /**
     * 초기화
     */
    init() {
        // 저장된 기기 유형 복원
        this.restoreDeviceType();
        
        // 공용 모드 복원
        if (this.isPublicMode()) {
            this.enablePublicMode();
        }
    }
    
    /**
     * 기기 유형 확인 (모달 다이얼로그)
     * @param {boolean} force - 강제 표시 (기억된 설정 무시)
     * @returns {Promise<string>} 'personal' | 'public'
     */
    async askDeviceType(force = false) {
        // 이미 기억된 기기가 있고 강제가 아니면 저장된 값 반환
        if (!force && this.isDeviceRemembered()) {
            const savedType = localStorage.getItem(this.DEVICE_TYPE_KEY);
            this.deviceType = savedType;
            
            if (this.logger) {
                this.logger.logAction('device_type_restored', '기기 유형 복원', {
                    deviceType: savedType
                });
            }
            
            return savedType;
        }
        
        return new Promise((resolve) => {
            // 모달 생성
            const modal = this.createDeviceTypeModal();
            document.body.appendChild(modal);
            
            // 버튼 이벤트
            const personalBtn = modal.querySelector('#device-type-personal');
            const publicBtn = modal.querySelector('#device-type-public');
            const rememberCheckbox = modal.querySelector('#remember-device');
            
            const handleSelection = (type) => {
                // 기기 유형 설정
                this.deviceType = type;
                localStorage.setItem(this.DEVICE_TYPE_KEY, type);
                
                // 기억하기 설정
                const remember = rememberCheckbox.checked;
                if (remember) {
                    localStorage.setItem(this.REMEMBER_DEVICE_KEY, 'true');
                } else {
                    localStorage.removeItem(this.REMEMBER_DEVICE_KEY);
                }
                
                // 공용 모드 활성화
                if (type === 'public') {
                    this.enablePublicMode();
                } else {
                    this.disablePublicMode();
                }
                
                // 로깅
                if (this.logger) {
                    this.logger.logAction('device_type_selected', '기기 유형 선택', {
                        deviceType: type,
                        remembered: remember
                    });
                }
                
                // 모달 제거
                document.body.removeChild(modal);
                
                resolve(type);
            };
            
            personalBtn.addEventListener('click', () => handleSelection('personal'));
            publicBtn.addEventListener('click', () => handleSelection('public'));
        });
    }
    
    /**
     * 공용 모드 활성화
     */
    enablePublicMode() {
        // 공용 모드 플래그 설정
        localStorage.setItem(this.PUBLIC_MODE_KEY, 'true');
        this.deviceType = 'public';
        
        // 비활성 타이머 시작
        this.startInactivityTimer();
        
        // 공용 모드 배너 표시
        this.showPublicModeBanner();
        
        // 브라우저 종료 시 데이터 삭제 이벤트
        this.setupBeforeUnloadHandler();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('public_mode_enabled', '공용 모드 활성화');
        }
        
        console.log('⚠️ 공용 모드 활성화됨');
    }
    
    /**
     * 공용 모드 비활성화
     */
    disablePublicMode() {
        // 공용 모드 플래그 제거
        localStorage.removeItem(this.PUBLIC_MODE_KEY);
        
        // 타이머 정리
        this.stopInactivityTimer();
        
        // 배너 숨김
        this.hidePublicModeBanner();
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('public_mode_disabled', '공용 모드 비활성화');
        }
        
        console.log('✅ 공용 모드 비활성화됨');
    }
    
    /**
     * 비활성 타이머 시작
     */
    startInactivityTimer() {
        // 기존 타이머 정리
        this.stopInactivityTimer();
        
        // 경고 타이머 (25분 후)
        this.warningTimer = setTimeout(() => {
            this.showWarning();
        }, this.INACTIVITY_TIMEOUT - this.WARNING_TIME);
        
        // 자동 로그아웃 타이머 (30분 후)
        this.inactivityTimer = setTimeout(() => {
            this.handleAutoLogout();
        }, this.INACTIVITY_TIMEOUT);
        
        // 사용자 활동 감지 이벤트
        this.setupActivityListeners();
        
        console.log('⏱️ 비활성 타이머 시작 (30분)');
    }
    
    /**
     * 비활성 타이머 정지
     */
    stopInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
        
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }
        
        // 활동 리스너 제거
        this.removeActivityListeners();
    }
    
    /**
     * 비활성 타이머 리셋
     */
    resetInactivityTimer() {
        if (this.isPublicMode() && this.inactivityTimer) {
            console.log('🔄 비활성 타이머 리셋');
            this.startInactivityTimer();
            
            // 배너 업데이트
            this.updatePublicModeBanner();
        }
    }
    
    /**
     * 사용자 활동 리스너 설정
     */
    setupActivityListeners() {
        const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
        
        this.activityHandler = () => {
            this.resetInactivityTimer();
        };
        
        // 디바운스 적용 (1초에 한 번만)
        let lastReset = 0;
        this.debouncedActivityHandler = () => {
            const now = Date.now();
            if (now - lastReset > 1000) {
                lastReset = now;
                this.activityHandler();
            }
        };
        
        events.forEach(event => {
            document.addEventListener(event, this.debouncedActivityHandler, { passive: true });
        });
    }
    
    /**
     * 사용자 활동 리스너 제거
     */
    removeActivityListeners() {
        if (this.debouncedActivityHandler) {
            const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
            events.forEach(event => {
                document.removeEventListener(event, this.debouncedActivityHandler);
            });
        }
    }
    
    /**
     * 5분 전 경고 표시
     */
    showWarning() {
        const message = '⚠️ 5분 후 자동 로그아웃됩니다.\n\n계속 사용하시려면 화면을 클릭하거나 키를 입력해주세요.';
        
        // 토스트 알림
        this.showToast(message, 'warning', 10000);
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('auto_logout_warning', '자동 로그아웃 경고');
        }
    }
    
    /**
     * 자동 로그아웃 처리
     */
    handleAutoLogout() {
        console.log('⏰ 비활성 타임아웃 - 자동 로그아웃');
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('auto_logout', '자동 로그아웃 (비활성)');
        }
        
        // 데이터 삭제
        this.clearAllData();
        
        // 콜백 실행
        if (this.onAutoLogout) {
            this.onAutoLogout();
        }
        
        // 알림
        alert('30분 동안 활동이 없어 자동 로그아웃되었습니다.\n\n보안을 위해 모든 데이터가 삭제되었습니다.');
        
        // 페이지 새로고침
        window.location.reload();
    }
    
    /**
     * 모든 데이터 삭제 (공용 모드 로그아웃)
     */
    clearAllData() {
        const currentUser = localStorage.getItem('dualTextWriter_currentUser');
        
        if (currentUser) {
            // 저장된 글 삭제
            const savedTextsKey = `dualTextWriter_savedTexts_${currentUser}`;
            localStorage.removeItem(savedTextsKey);
            
            // 임시 저장 데이터 삭제
            const tempSaveKey = `dualTextWriter_tempSave_${currentUser}`;
            localStorage.removeItem(tempSaveKey);
            
            // 세션 데이터 삭제
            localStorage.removeItem('dualTextWriter_currentUser');
            localStorage.removeItem('dualTextWriter_authProvider');
            localStorage.removeItem('dualTextWriter_usernameSession');
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('all_data_cleared', '모든 데이터 삭제 (공용 모드)', {
                    username: currentUser
                });
            }
            
            console.log('🗑️ 모든 데이터 삭제 완료:', currentUser);
        }
        
        // 공용 모드 플래그 제거
        localStorage.removeItem(this.PUBLIC_MODE_KEY);
    }
    
    /**
     * 브라우저 종료 시 데이터 삭제 핸들러
     */
    setupBeforeUnloadHandler() {
        this.beforeUnloadHandler = (e) => {
            if (this.isPublicMode()) {
                this.clearAllData();
            }
        };
        
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    /**
     * 공용 모드 여부 확인
     * @returns {boolean}
     */
    isPublicMode() {
        return localStorage.getItem(this.PUBLIC_MODE_KEY) === 'true';
    }
    
    /**
     * 기기 기억 여부 확인
     * @returns {boolean}
     */
    isDeviceRemembered() {
        return localStorage.getItem(this.REMEMBER_DEVICE_KEY) === 'true';
    }
    
    /**
     * 저장된 기기 유형 복원
     */
    restoreDeviceType() {
        const savedType = localStorage.getItem(this.DEVICE_TYPE_KEY);
        if (savedType) {
            this.deviceType = savedType;
        }
    }
    
    /**
     * 기기 유형 가져오기
     * @returns {string|null}
     */
    getDeviceType() {
        return this.deviceType;
    }
    
    /**
     * 개인 모드로 전환
     */
    switchToPersonalMode() {
        if (confirm('개인 모드로 전환하시겠습니까?\n\n자동 로그아웃이 비활성화됩니다.')) {
            this.deviceType = 'personal';
            localStorage.setItem(this.DEVICE_TYPE_KEY, 'personal');
            this.disablePublicMode();
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('switched_to_personal', '개인 모드로 전환');
            }
            
            // 알림
            this.showToast('✅ 개인 모드로 전환되었습니다.', 'success');
        }
    }
    
    /**
     * 기기 유형 모달 생성
     * @returns {HTMLElement}
     */
    createDeviceTypeModal() {
        const modal = document.createElement('div');
        modal.className = 'device-type-modal-overlay';
        modal.innerHTML = `
            <div class="device-type-modal">
                <div class="device-type-header">
                    <h3>🔐 기기 유형 선택</h3>
                    <p>이 기기는 어떤 유형인가요?</p>
                </div>
                
                <div class="device-type-options">
                    <button id="device-type-personal" class="device-type-btn personal">
                        <span class="device-icon">🏠</span>
                        <h4>개인 기기</h4>
                        <p>본인만 사용하는 기기</p>
                        <ul>
                            <li>✓ 데이터 유지</li>
                            <li>✓ 자동 로그인</li>
                            <li>✓ 편리한 사용</li>
                        </ul>
                    </button>
                    
                    <button id="device-type-public" class="device-type-btn public">
                        <span class="device-icon">🏢</span>
                        <h4>공용 기기</h4>
                        <p>여러 사람이 사용하는 기기</p>
                        <ul>
                            <li>✓ 30분 후 자동 로그아웃</li>
                            <li>✓ 브라우저 종료 시 데이터 삭제</li>
                            <li>✓ 보안 강화</li>
                        </ul>
                    </button>
                </div>
                
                <div class="device-type-footer">
                    <label class="remember-device-label">
                        <input type="checkbox" id="remember-device" />
                        <span>이 기기 기억하기 (다음에 묻지 않음)</span>
                    </label>
                </div>
            </div>
        `;
        
        return modal;
    }
    
    /**
     * 공용 모드 배너 표시
     */
    showPublicModeBanner() {
        // 기존 배너 제거
        this.hidePublicModeBanner();
        
        const banner = document.createElement('div');
        banner.id = 'public-mode-banner';
        banner.className = 'public-mode-banner';
        banner.innerHTML = `
            <div class="banner-content">
                <span class="banner-icon">⚠️</span>
                <div class="banner-text">
                    <strong>공용 컴퓨터 모드</strong>
                    <span id="public-mode-timer">30분 후 자동 로그아웃</span>
                </div>
                <button id="switch-to-personal-btn" class="banner-btn">개인 기기로 전환</button>
            </div>
        `;
        
        document.body.insertBefore(banner, document.body.firstChild);
        
        // 전환 버튼 이벤트
        const switchBtn = banner.querySelector('#switch-to-personal-btn');
        switchBtn.addEventListener('click', () => {
            this.switchToPersonalMode();
        });
        
        // 타이머 업데이트 시작
        this.startBannerTimerUpdate();
    }
    
    /**
     * 공용 모드 배너 숨김
     */
    hidePublicModeBanner() {
        const banner = document.getElementById('public-mode-banner');
        if (banner) {
            banner.remove();
        }
        
        // 타이머 업데이트 중지
        this.stopBannerTimerUpdate();
    }
    
    /**
     * 공용 모드 배너 업데이트
     */
    updatePublicModeBanner() {
        const timerEl = document.getElementById('public-mode-timer');
        if (timerEl && this.inactivityTimer) {
            // 남은 시간 계산은 타이머 업데이트에서 처리
        }
    }
    
    /**
     * 배너 타이머 업데이트 시작
     */
    startBannerTimerUpdate() {
        this.bannerUpdateInterval = setInterval(() => {
            const timerEl = document.getElementById('public-mode-timer');
            if (timerEl) {
                // 간단한 표시 (정확한 시간 계산은 복잡하므로 고정 메시지)
                timerEl.textContent = '30분 후 자동 로그아웃 | 브라우저 종료 시 데이터 삭제';
            }
        }, 1000);
    }
    
    /**
     * 배너 타이머 업데이트 중지
     */
    stopBannerTimerUpdate() {
        if (this.bannerUpdateInterval) {
            clearInterval(this.bannerUpdateInterval);
            this.bannerUpdateInterval = null;
        }
    }
    
    /**
     * 토스트 알림 표시
     * @param {string} message
     * @param {string} type - 'success' | 'warning' | 'error' | 'info'
     * @param {number} duration - 표시 시간 (ms)
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `security-toast security-toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.SecurityManager = SecurityManager;
}
