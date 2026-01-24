/**
 * ==================== ThreadsManager ====================
 * Threads 포스팅 관리 모듈
 * 
 * [역할]
 * - Threads 최적화 엔진
 * - 클립보드 복사 기능
 * - 해시태그 설정
 * - 프로필 URL 관리
 * - 최적화 모달 표시
 * 
 * [생성일] 2026-01-18
 * [리팩토링] script.js에서 분리됨 (Phase 1)
 * =========================================================
 */

import { logger } from './logger.js';

// ============================================================================
// [P1-01] ThreadsManager 클래스 정의
// ============================================================================

/**
 * Threads 포스팅 관리 클래스
 * @class ThreadsManager
 */
export class ThreadsManager {
    
    // ========================================================================
    // [P1-01] 생성자 및 초기화
    // ========================================================================
    
    /**
     * ThreadsManager 생성자
     * @param {object} mainApp - DualTextWriter 인스턴스 참조
     * @throws {Error} mainApp이 제공되지 않으면 에러 발생
     */
    constructor(mainApp) {
        // 필수 파라미터 검증
        if (!mainApp) {
            throw new Error('[ThreadsManager] mainApp 인스턴스가 필요합니다.');
        }
        
        this.mainApp = mainApp;
        
        // 해시태그 설정 로드
        this.hashtagSettings = this._loadHashtagSettings();
        
        // Threads 프로필 URL 로드
        this.threadsProfileUrl = localStorage.getItem('threadsProfileUrl') || '';
        
        logger.log('✅ [ThreadsManager] 초기화 완료');
    }
    
    // ========================================================================
    // [P1-01] Private 헬퍼 메서드
    // ========================================================================
    
    /**
     * localStorage에서 해시태그 설정 로드
     * @returns {Object} 해시태그 설정 객체
     * @private
     */
    _loadHashtagSettings() {
        try {
            const saved = localStorage.getItem('hashtagSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
                    autoAppend: Boolean(parsed.autoAppend)
                };
            }
        } catch (error) {
            logger.warn('[ThreadsManager] 해시태그 설정 로드 실패:', error);
        }
        
        // 기본값 반환
        return { hashtags: [], autoAppend: false };
    }
    
    // ========================================================================
    // [P1-02] sanitizeText() - 텍스트 정제 (XSS 방지)
    // script.js:4368-4381에서 이관됨
    // ========================================================================
    
    /**
     * 텍스트 정제 (XSS 방지)
     * - HTML 태그 제거
     * - 위험 문자 이스케이프
     * - 제어 문자 제거
     * 
     * @param {string} text - 정제할 텍스트
     * @returns {string} 정제된 텍스트
     */
    sanitizeText(text) {
        // 입력 검증: null, undefined, non-string 처리
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        try {
            // 1단계: HTML 태그 제거 (XSS 방지)
            const div = document.createElement('div');
            div.innerHTML = text;
            let sanitized = div.textContent || div.innerText || '';
            
            // 2단계: 위험 문자 이스케이프
            sanitized = sanitized.replace(/[<>'"]/g, (char) => ({
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[char] || char));
            
            // 3단계: 제어 문자 제거 (ASCII 0x00-0x1F, 0x7F)
            sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            
            // 4단계: 연속 공백 정리 및 trim
            sanitized = sanitized.replace(/\s+/g, ' ').trim();
            
            return sanitized;
            
        } catch (error) {
            logger.error('[ThreadsManager] sanitizeText 실패:', error);
            // 에러 시 원본 텍스트의 기본 정제만 수행
            return String(text).trim();
        }
    }
    
    // ========================================================================
    // [P1-03] optimizeContentForThreads() - Threads 최적화 엔진
    // script.js:4383-4475에서 이관됨
    // ========================================================================
    
    /**
     * Threads 최적화 엔진 (보안 강화 버전)
     * - 500자 제한 최적화
     * - 해시태그 자동 추출/추가
     * - 보안 검증 포함
     * 
     * @param {string} content - 최적화할 콘텐츠
     * @returns {Object} 최적화 결과 객체
     */
    optimizeContentForThreads(content) {
        try {
            // ============================================================
            // 1단계: 입력 검증 및 정화
            // ============================================================
            const sanitizedContent = this.sanitizeText(content);
            
            if (!sanitizedContent) {
                return {
                    original: '',
                    optimized: '',
                    hashtags: [],
                    characterCount: 0,
                    suggestions: ['내용이 비어있습니다.'],
                    warnings: [],
                    securityChecks: { xssBlocked: false, maliciousContentRemoved: false, inputValidated: true }
                };
            }
            
            // ============================================================
            // 2단계: 성능 최적화 - 대용량 텍스트 경고
            // ============================================================
            if (sanitizedContent.length > 10000) {
                logger.warn('[ThreadsManager] 매우 긴 텍스트가 감지되었습니다. 처리 시간이 오래 걸릴 수 있습니다.');
            }
            
            // 결과 객체 초기화
            const optimized = {
                original: sanitizedContent,
                optimized: '',
                hashtags: [],
                characterCount: 0,
                suggestions: [],
                warnings: [],
                securityChecks: {
                    xssBlocked: false,
                    maliciousContentRemoved: false,
                    inputValidated: true
                }
            };
            
            // ============================================================
            // 3단계: 글자 수 최적화 (Threads는 500자 제한)
            // ============================================================
            if (sanitizedContent.length > 500) {
                // 단어 단위로 자르기 (더 자연스러운 자르기)
                const words = sanitizedContent.substring(0, 500).split(' ');
                words.pop(); // 마지막 불완전한 단어 제거
                optimized.optimized = words.join(' ') + '...';
                optimized.suggestions.push('글이 500자를 초과하여 단어 단위로 잘렸습니다.');
                optimized.warnings.push('원본보다 짧아졌습니다.');
            } else {
                optimized.optimized = sanitizedContent;
            }
            
            // ============================================================
            // 4단계: 해시태그 자동 추출/추가 (보안 검증 포함)
            // mainApp의 헬퍼 함수 사용 (점진적 이관)
            // ============================================================
            let hashtags = [];
            
            // mainApp.extractHashtags 사용 (점진적 이관)
            if (this.mainApp.extractHashtags) {
                hashtags = this.mainApp.extractHashtags(optimized.optimized);
            }
            
            if (hashtags.length === 0) {
                // 사용자 정의 해시태그 사용 (선택적)
                const userHashtags = this.mainApp.getUserHashtags ? this.mainApp.getUserHashtags() : [];
                if (userHashtags && userHashtags.length > 0) {
                    optimized.hashtags = userHashtags;
                    optimized.suggestions.push('해시태그를 추가했습니다.');
                } else {
                    optimized.hashtags = [];
                    optimized.suggestions.push('해시태그 없이 포스팅됩니다.');
                }
            } else {
                // 해시태그 보안 검증
                const dangerousTags = ['#script', '#javascript', '#eval', '#function'];
                optimized.hashtags = hashtags.filter(tag => {
                    return !dangerousTags.some(dangerous => 
                        tag.toLowerCase().includes(dangerous)
                    );
                });
            }
            
            // ============================================================
            // 5단계: 최종 포맷팅 적용 (보안 강화)
            // mainApp.formatForThreads 사용 (점진적 이관)
            // ============================================================
            if (this.mainApp.formatForThreads) {
                optimized.optimized = this.mainApp.formatForThreads(optimized.optimized);
            }
            optimized.characterCount = optimized.optimized.length;
            
            // 6단계: 보안 검증 완료 표시
            optimized.securityChecks.inputValidated = true;
            
            logger.log('[ThreadsManager] optimizeContentForThreads 완료:', {
                originalLength: sanitizedContent.length,
                optimizedLength: optimized.characterCount,
                hashtagCount: optimized.hashtags.length
            });
            
            return optimized;
            
        } catch (error) {
            logger.error('[ThreadsManager] optimizeContentForThreads 실패:', error);
            
            // 보안 오류인 경우 특별 처리
            if (error.message && (error.message.includes('위험한') || error.message.includes('유효하지 않은'))) {
                throw new Error('보안상의 이유로 내용을 처리할 수 없습니다. 입력을 확인해주세요.');
            }
            
            throw new Error('내용 최적화에 실패했습니다.');
        }
    }
    
    // ========================================================================
    // [P1-04] copyToClipboardWithFormat() - 클립보드 복사
    // script.js:4538-4626에서 이관됨
    // ========================================================================
    
    /**
     * 클립보드 복사 (완전한 에러 처리 및 폴백)
     * - Clipboard API 우선 시도
     * - execCommand 폴백
     * - 모바일 지원
     * 
     * @param {string} content - 복사할 콘텐츠
     * @returns {Promise<boolean>} 복사 성공 여부
     */
    async copyToClipboardWithFormat(content) {
        logger.log('[ThreadsManager] copyToClipboardWithFormat 시작');
        
        // 로딩 상태 표시용 버튼 (mainApp에서 가져옴)
        const button = document.getElementById('semi-auto-post-btn');
        
        try {
            // 로딩 상태 표시
            if (button && this.mainApp.showLoadingState) {
                this.mainApp.showLoadingState(button, true);
            }
            
            // ============================================================
            // 1단계: 입력 검증
            // ============================================================
            if (!content || typeof content !== 'string') {
                logger.error('[ThreadsManager] 유효하지 않은 내용:', content);
                throw new Error('유효하지 않은 내용입니다.');
            }
            
            if (content.length === 0) {
                logger.error('[ThreadsManager] 내용이 비어있음');
                throw new Error('내용이 비어있습니다.');
            }
            
            // ============================================================
            // 2단계: Clipboard API 시도 (보안 컨텍스트 확인)
            // ============================================================
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    logger.log('[ThreadsManager] Clipboard API로 복사 시도...');
                    await navigator.clipboard.writeText(content);
                    logger.log('[ThreadsManager] Clipboard API 복사 성공');
                    this.mainApp.showMessage('✅ 내용이 클립보드에 복사되었습니다!', 'success');
                    return true;
                } catch (clipboardError) {
                    logger.warn('[ThreadsManager] Clipboard API 실패, 폴백 시도:', clipboardError);
                    // 폴백으로 진행
                }
            } else {
                logger.warn('[ThreadsManager] Clipboard API 미지원 또는 비보안 컨텍스트');
            }
            
            // ============================================================
            // 3단계: 폴백 방법 시도 (execCommand)
            // ============================================================
            const fallbackSuccess = await this._fallbackCopyToClipboard(content);
            
            if (fallbackSuccess) {
                logger.log('[ThreadsManager] 폴백 방법 복사 성공');
                this.mainApp.showMessage('✅ 내용이 클립보드에 복사되었습니다!', 'success');
                return true;
            } else {
                throw new Error('폴백 복사 실패');
            }
            
        } catch (error) {
            logger.error('[ThreadsManager] 클립보드 복사 실패:', error);
            this.mainApp.showMessage('❌ 클립보드 복사에 실패했습니다. 수동으로 복사해주세요.', 'error');
            
            // 수동 복사 모달 표시 (mainApp 함수 사용)
            if (this.mainApp.showManualCopyModal) {
                this.mainApp.showManualCopyModal(content);
            }
            
            return false;
            
        } finally {
            // 로딩 상태 해제
            if (button && this.mainApp.showLoadingState) {
                this.mainApp.showLoadingState(button, false);
            }
            logger.log('[ThreadsManager] 로딩 상태 해제 완료');
        }
    }
    
    /**
     * 폴백 클립보드 복사 (execCommand 사용)
     * - 모바일 지원을 위한 선택 범위 설정
     * - 접근성 속성 추가
     * 
     * @param {string} text - 복사할 텍스트
     * @returns {Promise<boolean>} 복사 성공 여부
     * @private
     */
    _fallbackCopyToClipboard(text) {
        logger.log('[ThreadsManager] 폴백 클립보드 복사 시작');
        
        return new Promise((resolve, reject) => {
            try {
                // textarea 생성 (화면 밖에 배치)
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                textArea.style.opacity = '0';
                textArea.setAttribute('readonly', '');
                textArea.setAttribute('aria-hidden', 'true');
                
                document.body.appendChild(textArea);
                
                // 모바일 지원을 위한 선택 범위 설정
                if (textArea.setSelectionRange) {
                    textArea.setSelectionRange(0, text.length);
                } else {
                    textArea.select();
                }
                
                // execCommand로 복사
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (successful) {
                    logger.log('[ThreadsManager] 폴백 복사 성공');
                    resolve(true);
                } else {
                    logger.error('[ThreadsManager] execCommand 복사 실패');
                    resolve(false); // reject 대신 resolve(false)로 처리
                }
                
            } catch (error) {
                logger.error('[ThreadsManager] 폴백 복사 중 오류:', error);
                resolve(false); // reject 대신 resolve(false)로 처리
            }
        });
    }
    
    // ========================================================================
    // [P1-05] showOptimizationModal() - 최적화 모달 표시
    // 복잡한 모달 로직은 mainApp에 위임 (점진적 이관)
    // script.js:4650-4912 참조
    // ========================================================================
    
    /**
     * 최적화 모달 표시 (접근성 강화)
     * - 500자 초과 시 최적화 결과 표시
     * - 클립보드 복사 / Threads 열기 선택
     * - 해시태그 토글 기능
     * 
     * @param {Object} optimized - 최적화 결과 객체
     * @param {string} originalContent - 원본 콘텐츠
     * 
     * @note 현재는 mainApp에 위임. 향후 전체 이관 예정.
     */
    showOptimizationModal(optimized, originalContent) {
        logger.log('[ThreadsManager] showOptimizationModal 호출');
        
        // 입력 검증
        if (!optimized) {
            logger.error('[ThreadsManager] optimized 객체가 없습니다.');
            this.mainApp.showMessage('최적화 데이터가 없습니다.', 'error');
            return;
        }
        
        // 기존 모달 제거 (중복 방지)
        const existingModal = document.querySelector('.optimization-modal');
        if (existingModal) {
            logger.log('[ThreadsManager] 기존 모달 제거');
            existingModal.remove();
        }
        
        // mainApp의 showOptimizationModal 호출 (위임)
        // 복잡한 DOM 생성 및 이벤트 바인딩은 mainApp에서 처리
        
        // 1. mainApp에 _showOptimizationModalImpl(원본 구현)이 있는 경우 -> 그거 호출
        if (this.mainApp._showOptimizationModalImpl) {
            return this.mainApp._showOptimizationModalImpl(optimized, originalContent);
        } 
        
        // 2. mainApp.showOptimizationModal이 존재하고, 이것이 ThreadsManager의 이 함수와 다른 경우 -> 그거 호출
        // (단, 바인딩된 함수 비교는 까다로우므로, 이름이나 속성으로 체크하는 것이 안전하지만 여기선 단순 비교)
        // [Fix] 순환 호출 방지 로직 개선
        const isSelf = this.mainApp.showOptimizationModal === this.showOptimizationModal || 
                       (this.mainApp.threadsManager && this.mainApp.showOptimizationModal === this.mainApp.threadsManager.showOptimizationModal);

        if (typeof this.mainApp.showOptimizationModal === 'function' && !isSelf) {
             try {
                this.mainApp.showOptimizationModal(optimized, originalContent);
                return;
            } catch (error) {
                logger.warn('[ThreadsManager] mainApp.showOptimizationModal 호출 실패, 폴백 사용:', error);
            }
        }
        
        // 3. 폴백: 직접 모달 생성
        this._createAndShowModal(optimized, originalContent);
    }
    
    /**
     * 최적화 모달 직접 생성 (간소화 버전)
     * @param {Object} optimized - 최적화 결과
     * @param {string} originalContent - 원본 콘텐츠
     * @private
     */
    _createAndShowModal(optimized, originalContent) {
        // 원본 텍스트 저장
        optimized.originalContent = originalContent;
        
        const modal = document.createElement('div');
        modal.className = 'optimization-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title');
        
        // 현재 언어 감지 (mainApp 함수 사용)
        const currentLang = this.mainApp.detectLanguage ? this.mainApp.detectLanguage() : 'ko';
        const t = (key) => this.mainApp.t ? this.mainApp.t(key) : this._getDefaultText(key);
        const escapeHtml = (text) => this.mainApp.escapeHtml ? this.mainApp.escapeHtml(text) : this._escapeHtmlSimple(text);
        
        // 모달 HTML 생성
        modal.innerHTML = `
            <div class="optimization-content" lang="${currentLang}">
                <h3 id="modal-title">${t('optimizationTitle')}</h3>
                
                <div class="optimization-stats" role="region" aria-label="최적화 통계">
                    <div class="stat-item">
                        <span class="stat-label">${t('originalLength')}</span>
                        <span class="stat-value">${optimized.original?.length || 0}${t('characters')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${t('optimizedLength')}</span>
                        <span class="stat-value">${optimized.characterCount || 0}${t('characters')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">${t('hashtags')}</span>
                        <span class="stat-value">${(optimized.hashtags || []).join(' ')}</span>
                    </div>
                </div>
                
                ${optimized.suggestions?.length > 0 ? `
                    <div class="suggestions" role="region" aria-label="최적화 제안사항">
                        <h4>${t('optimizationSuggestions')}</h4>
                        <ul>
                            ${optimized.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                <div class="preview-section" role="region" aria-label="포스팅 내용 미리보기">
                    <div class="hashtag-toggle-section">
                        <label class="hashtag-toggle-label">
                            <input type="checkbox" id="hashtag-toggle" checked>
                            <span class="toggle-text">해시태그 자동 추가</span>
                        </label>
                    </div>
                    <h4>${t('previewTitle')}</h4>
                    <div class="preview-content" id="preview-content-display">
                        ${escapeHtml(originalContent)}
                        ${(optimized.hashtags || []).length > 0 ? `<br><br>${(optimized.hashtags || []).join(' ')}` : ''}
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary btn-copy-only" id="copy-only-btn">📋 클립보드 복사</button>
                    <button class="btn-primary btn-threads-only" id="threads-only-btn">🚀 Threads 열기</button>
                    <button class="btn-success btn-both" id="both-btn">📋🚀 둘 다 실행</button>
                    <button class="btn-secondary" id="cancel-btn">${t('cancelButton')}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 이벤트 바인딩
        this._bindOptimizationModalEvents(modal, optimized, originalContent);
        
        // 접근성: 첫 번째 버튼에 포커스
        setTimeout(() => {
            const firstBtn = modal.querySelector('#copy-only-btn');
            if (firstBtn) firstBtn.focus();
        }, 100);
        
        logger.log('[ThreadsManager] 최적화 모달 생성 완료');
    }
    
    /**
     * 모달 이벤트 바인딩
     * @param {HTMLElement} modal - 모달 요소
     * @param {Object} optimized - 최적화 결과
     * @param {string} originalContent - 원본 콘텐츠
     * @private
     */
    _bindOptimizationModalEvents(modal, optimized, originalContent) {
        const hashtagToggle = modal.querySelector('#hashtag-toggle');
        const previewDisplay = modal.querySelector('#preview-content-display');
        const escapeHtml = (text) => this.mainApp.escapeHtml ? this.mainApp.escapeHtml(text) : this._escapeHtmlSimple(text);
        
        // 해시태그 토글
        if (hashtagToggle && previewDisplay) {
            hashtagToggle.addEventListener('change', () => {
                if (hashtagToggle.checked) {
                    previewDisplay.innerHTML = escapeHtml(originalContent) + 
                        ((optimized.hashtags || []).length > 0 ? '<br><br>' + (optimized.hashtags || []).join(' ') : '');
                } else {
                    previewDisplay.innerHTML = escapeHtml(originalContent);
                }
            });
        }
        
        // 클립보드 복사 버튼
        const copyBtn = modal.querySelector('#copy-only-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
                const content = originalContent + 
                    (includeHashtags && (optimized.hashtags || []).length > 0 ? '\n\n' + optimized.hashtags.join(' ') : '');
                
                if (this.mainApp.copyToClipboardOnly) {
                    this.mainApp.copyToClipboardOnly(content, e);
                } else {
                    this.copyToClipboardWithFormat(content);
                }
            });
        }
        
        // Threads 열기 버튼
        const threadsBtn = modal.querySelector('#threads-only-btn');
        if (threadsBtn) {
            threadsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.mainApp.openThreadsOnly) {
                    this.mainApp.openThreadsOnly();
                } else {
                    window.open(this.getThreadsUrl(), '_blank');
                }
            });
        }
        
        // 둘 다 실행 버튼
        const bothBtn = modal.querySelector('#both-btn');
        if (bothBtn) {
            bothBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const includeHashtags = hashtagToggle ? hashtagToggle.checked : true;
                const content = originalContent + 
                    (includeHashtags && (optimized.hashtags || []).length > 0 ? '\n\n' + optimized.hashtags.join(' ') : '');
                
                if (this.mainApp.proceedWithPosting) {
                    this.mainApp.proceedWithPosting(content, e);
                } else {
                    this.copyToClipboardWithFormat(content);
                    window.open(this.getThreadsUrl(), '_blank');
                }
            });
        }
        
        // 취소 버튼
        const cancelBtn = modal.querySelector('#cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._closeOptimizationModal(modal);
            });
        }
        
        // ESC 키 핸들러
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this._closeOptimizationModal(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        modal._escapeHandler = handleEscape;
        
        // Tab 키 순환 (접근성)
        this._setupFocusTrap(modal);
    }
    
    /**
     * 모달 닫기
     * @param {HTMLElement} modal - 모달 요소
     * @private
     */
    _closeOptimizationModal(modal) {
        if (modal._escapeHandler) {
            document.removeEventListener('keydown', modal._escapeHandler);
        }
        modal.remove();
        logger.log('[ThreadsManager] 모달 닫힘');
    }
    
    /**
     * 포커스 트랩 설정 (접근성)
     * @param {HTMLElement} modal - 모달 요소
     * @private
     */
    _setupFocusTrap(modal) {
        const focusableElements = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"]), input');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (firstElement && lastElement) {
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            });
        }
    }
    
    /**
     * 간단한 HTML 이스케이프 (폴백용)
     * @param {string} text - 이스케이프할 텍스트
     * @returns {string} 이스케이프된 텍스트
     * @private
     */
    _escapeHtmlSimple(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 기본 텍스트 반환 (i18n 폴백용)
     * @param {string} key - 텍스트 키
     * @returns {string} 기본 텍스트
     * @private
     */
    _getDefaultText(key) {
        const texts = {
            optimizationTitle: '📝 포스팅 최적화 결과',
            originalLength: '원본 글자 수:',
            optimizedLength: '최적화 후:',
            characters: '자',
            hashtags: '해시태그:',
            hashtagCount: '개',
            optimizationSuggestions: '💡 최적화 제안',
            previewTitle: '📋 포스팅 내용',
            cancelButton: '❌ 취소'
        };
        return texts[key] || key;
    }
    
    /**
    // ========================================================================
    // [P1-06] Threads 설정 관련 함수들
    // script.js:5093-5371에서 이관됨
    // ========================================================================
    
    /**
     * Threads URL 반환
     * @returns {string} Threads 프로필 URL 또는 기본 URL
     */
    getThreadsUrl() {
        // 사용자 설정에서 프로필 URL 확인
        const userProfileUrl = localStorage.getItem('threads_profile_url');
        
        if (userProfileUrl && this._isValidThreadsUrl(userProfileUrl)) {
            logger.log('[ThreadsManager] 사용자 프로필 URL 사용:', userProfileUrl);
            return userProfileUrl;
        }
        
        // 인스턴스 변수에 저장된 URL 확인
        if (this.threadsProfileUrl && this._isValidThreadsUrl(this.threadsProfileUrl)) {
            return this.threadsProfileUrl;
        }
        
        // 기본 Threads 메인 페이지
        return 'https://www.threads.net/';
    }
    
    /**
     * Threads 프로필 URL 설정
     * @param {string} url - 설정할 URL
     * @returns {boolean} 설정 성공 여부
     */
    setThreadsProfileUrl(url) {
        if (!url) {
            logger.warn('[ThreadsManager] URL이 제공되지 않음');
            return false;
        }
        
        // URL 유효성 검사
        if (!this._isValidThreadsUrl(url)) {
            this.mainApp.showMessage('올바른 Threads URL을 입력해주세요.', 'error');
            return false;
        }
        
        this.threadsProfileUrl = url;
        localStorage.setItem('threadsProfileUrl', url);
        localStorage.setItem('threads_profile_url', url); // 호환성
        
        logger.log('[ThreadsManager] Threads 프로필 URL 저장:', url);
        this.mainApp.showMessage('✅ Threads 프로필 URL이 저장되었습니다!', 'success');
        return true;
    }
    
    /**
     * Threads URL 유효성 검사
     * @param {string} url - 검사할 URL
     * @returns {boolean} 유효 여부
     * @private
     */
    _isValidThreadsUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname.includes('threads.net') || 
                   parsed.hostname.includes('threads.com');
        } catch {
            return false;
        }
    }
    
    /**
     * Threads 프로필 설정 모달 표시
     */
    showProfileSettingsModal() {
        logger.log('[ThreadsManager] 프로필 설정 모달 표시');
        
        // 기존 모달 제거
        const existingModal = document.querySelector('.threads-profile-modal');
        if (existingModal) existingModal.remove();
        
        const currentLang = this.mainApp.detectLanguage ? this.mainApp.detectLanguage() : 'ko';
        const currentUrl = localStorage.getItem('threads_profile_url') || '';
        
        const modal = document.createElement('div');
        modal.className = 'threads-profile-modal';
        modal.setAttribute('lang', currentLang);
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3>⚙️ Threads 프로필 설정</h3>
                <p>포스팅 시 열릴 Threads 페이지를 설정하세요.</p>
                
                <div class="profile-url-section">
                    <label for="threads-profile-url">프로필 URL:</label>
                    <input type="url" id="threads-profile-url" 
                           placeholder="https://www.threads.net/@username"
                           value="${currentUrl}">
                    <small>예: https://www.threads.net/@username</small>
                </div>
                
                <div class="url-options">
                    <h4>빠른 선택:</h4>
                    <button class="btn-option" id="url-option-main">
                        🏠 Threads 메인 페이지
                    </button>
                    <button class="btn-option" id="url-option-new">
                        ✏️ 새 글 작성 페이지
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" id="profile-save-btn">💾 저장</button>
                    <button class="btn-secondary" id="profile-cancel-btn">❌ 취소</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 이벤트 바인딩
        const urlInput = modal.querySelector('#threads-profile-url');
        
        modal.querySelector('#url-option-main')?.addEventListener('click', () => {
            urlInput.value = 'https://www.threads.net/';
        });
        
        modal.querySelector('#url-option-new')?.addEventListener('click', () => {
            urlInput.value = 'https://www.threads.net/new';
        });
        
        modal.querySelector('#profile-save-btn')?.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                this.setThreadsProfileUrl(url);
            } else {
                localStorage.removeItem('threads_profile_url');
                localStorage.removeItem('threadsProfileUrl');
                this.threadsProfileUrl = '';
                this.mainApp.showMessage('✅ 기본 Threads 메인 페이지로 설정되었습니다!', 'success');
            }
            modal.remove();
        });
        
        modal.querySelector('#profile-cancel-btn')?.addEventListener('click', () => {
            modal.remove();
        });
        
        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // 입력 필드에 포커스
        setTimeout(() => {
            if (urlInput) {
                urlInput.focus();
                urlInput.select();
            }
        }, 100);
    }
    
    /**
     * 해시태그 설정 모달 표시
     */
    showHashtagSettingsModal() {
        logger.log('[ThreadsManager] 해시태그 설정 모달 표시');
        
        // 기존 모달 제거
        const existingModal = document.querySelector('.hashtag-settings-modal');
        if (existingModal) existingModal.remove();
        
        const currentLang = this.mainApp.detectLanguage ? this.mainApp.detectLanguage() : 'ko';
        const currentHashtags = this.mainApp.getUserHashtags ? this.mainApp.getUserHashtags() : [];
        
        const modal = document.createElement('div');
        modal.className = 'hashtag-settings-modal';
        modal.setAttribute('lang', currentLang);
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3>📌 해시태그 설정</h3>
                <p>반자동 포스팅 시 사용될 기본 해시태그를 설정하세요.</p>
                
                <div class="hashtag-input-section">
                    <label for="hashtag-input">해시태그 (쉼표로 구분):</label>
                    <input type="text" id="hashtag-input" 
                           placeholder="예: #writing, #content, #threads"
                           value="${currentHashtags.join(', ')}">
                    <small>예: #writing, #content, #threads</small>
                </div>
                
                <div class="hashtag-examples">
                    <h4>추천 해시태그:</h4>
                    <button class="btn-option" data-hashtags="#writing, #content, #threads">
                        📝 일반 글 작성
                    </button>
                    <button class="btn-option" data-hashtags="#생각, #일상, #daily">
                        💭 일상 글
                    </button>
                    <button class="btn-option" data-hashtags="#경제, #투자, #finance">
                        💰 경제/투자
                    </button>
                    <button class="btn-option" data-hashtags="#기술, #개발, #tech">
                        🚀 기술/개발
                    </button>
                    <button class="btn-option btn-clear" data-hashtags="">
                        ❌ 해시태그 없이 사용
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" id="hashtag-save-btn">💾 저장</button>
                    <button class="btn-secondary" id="hashtag-cancel-btn">❌ 취소</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 이벤트 바인딩
        const hashtagInput = modal.querySelector('#hashtag-input');
        
        // 추천 해시태그 버튼들
        modal.querySelectorAll('.hashtag-examples .btn-option').forEach(btn => {
            btn.addEventListener('click', () => {
                hashtagInput.value = btn.dataset.hashtags || '';
            });
        });
        
        // 저장 버튼
        modal.querySelector('#hashtag-save-btn')?.addEventListener('click', () => {
            const inputValue = hashtagInput.value.trim();
            
            if (!inputValue) {
                // 빈 값 - 해시태그 없이 사용
                if (this.mainApp.saveUserHashtags) {
                    this.mainApp.saveUserHashtags([]);
                }
                this.saveHashtagSettings({ hashtags: [], autoAppend: false });
                this.mainApp.showMessage('✅ 해시태그 없이 포스팅하도록 설정되었습니다!', 'success');
            } else {
                // 쉼표로 분리하여 배열로 변환
                const hashtags = inputValue
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
                
                if (this.mainApp.saveUserHashtags) {
                    this.mainApp.saveUserHashtags(hashtags);
                }
                this.saveHashtagSettings({ hashtags, autoAppend: true });
                this.mainApp.showMessage('✅ 해시태그가 저장되었습니다!', 'success');
            }
            
            // 해시태그 표시 업데이트
            if (this.mainApp.updateHashtagsDisplay) {
                this.mainApp.updateHashtagsDisplay();
            }
            
            modal.remove();
        });
        
        // 취소 버튼
        modal.querySelector('#hashtag-cancel-btn')?.addEventListener('click', () => {
            modal.remove();
        });
        
        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // 입력 필드에 포커스
        setTimeout(() => {
            if (hashtagInput) {
                hashtagInput.focus();
                hashtagInput.select();
            }
        }, 100);
    }
    
    /**
     * 해시태그 설정 저장
     * @param {Object} settings - 저장할 설정 { hashtags: [], autoAppend: boolean }
     */
    saveHashtagSettings(settings) {
        if (!settings) return;
        
        this.hashtagSettings = {
            hashtags: Array.isArray(settings.hashtags) ? settings.hashtags : [],
            autoAppend: Boolean(settings.autoAppend)
        };
        
        localStorage.setItem('hashtagSettings', JSON.stringify(this.hashtagSettings));
        logger.log('[ThreadsManager] 해시태그 설정 저장됨:', this.hashtagSettings);
    }

    // [P1-08] Update hashtags display in UI
    updateHashtagsDisplay() {
        const display = document.getElementById('current-hashtags-display');
        if (!display) return;

        const hashtags = this.mainApp.getUserHashtags ? this.mainApp.getUserHashtags() : [];
        if (hashtags && hashtags.length > 0) {
            display.textContent = hashtags.join(' ');
        } else {
            display.textContent = '?????? ???';
            display.style.color = '#6c757d';
        }
    }


    /**
     * 해시태그 설정 반환
     * @returns {Object} 해시태그 설정
     */
    getHashtagSettings() {
        return this.hashtagSettings;
    }
}
