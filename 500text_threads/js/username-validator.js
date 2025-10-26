/**
 * UsernameValidator
 * 
 * 사용자명 검증 클래스
 * - 길이 검증 (2-50자)
 * - 패턴 검증 (영문, 숫자, 한글, -, _)
 * - 금지어 검증 (admin, root, system, test)
 * - XSS 방지 (HTML 태그 제거)
 * - 안전한 저장을 위한 정제
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

class UsernameValidator {
    constructor() {
        // 검증 규칙
        this.minLength = 2;
        this.maxLength = 50;
        
        // 허용 패턴: 영문, 숫자, 한글, 하이픈, 언더스코어
        this.validPattern = /^[a-zA-Z0-9가-힣_-]+$/;
        
        // 금지어 목록 (소문자로 저장)
        this.forbiddenWords = ['admin', 'root', 'system', 'test'];
        
        // 에러 메시지
        this.errorMessages = {
            empty: '사용자명을 입력해주세요.',
            tooShort: `사용자명은 최소 ${this.minLength}자 이상이어야 합니다.`,
            tooLong: `사용자명은 최대 ${this.maxLength}자까지 가능합니다.`,
            invalidPattern: '사용자명은 한글, 영문, 숫자, -, _만 사용할 수 있습니다.',
            forbidden: '이 사용자명은 사용할 수 없습니다. 다른 이름을 선택해주세요.',
            xssDetected: '사용자명에 허용되지 않는 문자가 포함되어 있습니다.'
        };
        
        // Performance optimization: Validation result cache
        this.validationCache = new Map();
        this.cacheMaxSize = 100;
    }
    
    /**
     * 종합 검증 수행 (with caching)
     * @param {string} username - 검증할 사용자명
     * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
     */
    validate(username) {
        // Check cache first
        if (this.validationCache.has(username)) {
            return this.validationCache.get(username);
        }
        
        const errors = [];
        const warnings = [];
        
        // 1. 빈 값 검증
        if (!username || username.trim().length === 0) {
            errors.push(this.errorMessages.empty);
            return { valid: false, errors, warnings };
        }
        
        // 공백 제거
        username = username.trim();
        
        // 2. 길이 검증
        if (!this.checkLength(username)) {
            if (username.length < this.minLength) {
                errors.push(this.errorMessages.tooShort);
            } else if (username.length > this.maxLength) {
                errors.push(this.errorMessages.tooLong);
            }
        }
        
        // 3. XSS 검증 (HTML 태그 감지)
        if (!this.checkXSS(username)) {
            errors.push(this.errorMessages.xssDetected);
        }
        
        // 4. 패턴 검증
        if (!this.checkPattern(username)) {
            errors.push(this.errorMessages.invalidPattern);
        }
        
        // 5. 금지어 검증
        if (!this.checkForbiddenWords(username)) {
            errors.push(this.errorMessages.forbidden);
        }
        
        // 경고: 70% 이상 사용 시
        if (username.length >= this.maxLength * 0.7) {
            warnings.push(`사용자명이 길어질수록 표시가 어려울 수 있습니다. (${username.length}/${this.maxLength}자)`);
        }
        
        const result = {
            valid: errors.length === 0,
            errors,
            warnings
        };
        
        // Cache the result
        this._cacheResult(username, result);
        
        return result;
    }
    
    /**
     * Cache validation result
     * @private
     */
    _cacheResult(username, result) {
        // Limit cache size
        if (this.validationCache.size >= this.cacheMaxSize) {
            // Remove oldest entry
            const firstKey = this.validationCache.keys().next().value;
            this.validationCache.delete(firstKey);
        }
        
        this.validationCache.set(username, result);
    }
    
    /**
     * Clear validation cache
     */
    clearCache() {
        this.validationCache.clear();
    }
    
    /**
     * 길이 검증
     * @param {string} username
     * @returns {boolean}
     */
    checkLength(username) {
        const length = username.length;
        return length >= this.minLength && length <= this.maxLength;
    }
    
    /**
     * 패턴 검증 (영문, 숫자, 한글, -, _)
     * @param {string} username
     * @returns {boolean}
     */
    checkPattern(username) {
        return this.validPattern.test(username);
    }
    
    /**
     * 금지어 검증
     * @param {string} username
     * @returns {boolean}
     */
    checkForbiddenWords(username) {
        const lowerUsername = username.toLowerCase();
        
        // 금지어가 포함되어 있는지 확인
        for (const word of this.forbiddenWords) {
            if (lowerUsername.includes(word)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * XSS 방지 검증 (HTML 태그 감지)
     * @param {string} username
     * @returns {boolean}
     */
    checkXSS(username) {
        // HTML 태그 패턴 감지
        const htmlTagPattern = /<[^>]*>/g;
        const scriptPattern = /<script|javascript:|onerror=|onclick=/i;
        
        // HTML 태그나 스크립트 패턴이 있으면 false
        if (htmlTagPattern.test(username) || scriptPattern.test(username)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 사용자명 정제 (안전한 저장을 위해)
     * @param {string} username
     * @returns {string}
     */
    sanitize(username) {
        if (!username) return '';
        
        // 1. 공백 제거
        let sanitized = username.trim();
        
        // 2. HTML 태그 제거
        sanitized = sanitized.replace(/<[^>]*>/g, '');
        
        // 3. 특수 문자 제거 (허용된 문자만 남김)
        sanitized = sanitized.replace(/[^a-zA-Z0-9가-힣_-]/g, '');
        
        // 4. 길이 제한
        if (sanitized.length > this.maxLength) {
            sanitized = sanitized.substring(0, this.maxLength);
        }
        
        return sanitized;
    }
    
    /**
     * 실시간 검증 (입력 중 피드백용)
     * @param {string} username
     * @returns {Object} { valid: boolean, message: string, severity: string }
     */
    validateRealtime(username) {
        if (!username || username.trim().length === 0) {
            return {
                valid: false,
                message: '',
                severity: 'none'
            };
        }
        
        username = username.trim();
        
        // 길이 검증
        if (username.length < this.minLength) {
            return {
                valid: false,
                message: `최소 ${this.minLength}자 필요 (현재 ${username.length}자)`,
                severity: 'warning'
            };
        }
        
        if (username.length > this.maxLength) {
            return {
                valid: false,
                message: `최대 ${this.maxLength}자 초과 (현재 ${username.length}자)`,
                severity: 'error'
            };
        }
        
        // XSS 검증
        if (!this.checkXSS(username)) {
            return {
                valid: false,
                message: '허용되지 않는 문자가 포함되어 있습니다.',
                severity: 'error'
            };
        }
        
        // 패턴 검증
        if (!this.checkPattern(username)) {
            return {
                valid: false,
                message: '한글, 영문, 숫자, -, _만 사용 가능합니다.',
                severity: 'error'
            };
        }
        
        // 금지어 검증
        if (!this.checkForbiddenWords(username)) {
            return {
                valid: false,
                message: '이 사용자명은 사용할 수 없습니다.',
                severity: 'error'
            };
        }
        
        // 모든 검증 통과
        return {
            valid: true,
            message: '사용 가능한 사용자명입니다.',
            severity: 'success'
        };
    }
    
    /**
     * 사용자명 사용 가능 여부 확인
     * @param {string} username
     * @returns {boolean}
     */
    isUsernameAvailable(username) {
        const result = this.validate(username);
        return result.valid;
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.UsernameValidator = UsernameValidator;
}
