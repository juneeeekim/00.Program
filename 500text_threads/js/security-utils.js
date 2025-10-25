// 보안 유틸리티 클래스
class SecurityUtils {
    constructor() {
        // 이메일 정규식 패턴
        this.emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    }
    
    // ============================================
    // XSS 방지 (Task 8.1)
    // ============================================
    
    /**
     * HTML 이스케이프 함수
     * XSS 공격을 방지하기 위해 HTML 특수 문자를 안전하게 변환
     * @param {string} text - 이스케이프할 텍스트
     * @returns {string} - 이스케이프된 텍스트
     */
    escapeHtml(text) {
        if (text === null || text === undefined) {
            return '';
        }
        
        // 문자열로 변환
        const str = String(text);
        
        // DOM을 사용한 안전한 이스케이프
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    /**
     * 사용자 이름 안전 처리
     * 사용자 이름을 표시할 때 XSS 방지
     * @param {string} name - 사용자 이름
     * @returns {string} - 안전하게 처리된 이름
     */
    sanitizeUserName(name) {
        if (!name) {
            return '알 수 없는 사용자';
        }
        
        // HTML 이스케이프
        const escaped = this.escapeHtml(name);
        
        // 최대 길이 제한 (50자)
        if (escaped.length > 50) {
            return escaped.substring(0, 47) + '...';
        }
        
        return escaped;
    }
    
    /**
     * 이메일 안전 처리
     * 이메일을 표시할 때 XSS 방지
     * @param {string} email - 이메일 주소
     * @returns {string} - 안전하게 처리된 이메일
     */
    sanitizeEmail(email) {
        if (!email) {
            return '';
        }
        
        // HTML 이스케이프
        const escaped = this.escapeHtml(email);
        
        // 이메일 형식 검증
        if (!this.isValidEmail(email)) {
            console.warn('⚠️ 유효하지 않은 이메일 형식:', email);
            return escaped;
        }
        
        return escaped;
    }
    
    /**
     * 사용자 입력 렌더링 시 안전 처리
     * 모든 사용자 입력을 안전하게 HTML에 렌더링
     * @param {string} input - 사용자 입력
     * @returns {string} - 안전하게 처리된 입력
     */
    sanitizeUserInput(input) {
        if (!input) {
            return '';
        }
        
        // HTML 이스케이프
        return this.escapeHtml(input);
    }
    
    // ============================================
    // 데이터 검증 (Task 8.2)
    // ============================================
    
    /**
     * 이메일 형식 검증
     * @param {string} email - 검증할 이메일
     * @returns {boolean} - 유효 여부
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }
        
        return this.emailPattern.test(email.trim());
    }
    
    /**
     * 사용자 데이터 검증
     * 로컬 스토리지에서 로드한 사용자 데이터의 필수 필드 검증
     * @param {object} userData - 검증할 사용자 데이터
     * @returns {object} - { valid: boolean, errors: string[] }
     */
    validateUserData(userData) {
        const errors = [];
        
        // null 또는 undefined 체크
        if (!userData) {
            errors.push('사용자 데이터가 없습니다.');
            return { valid: false, errors, data: null };
        }
        
        // 객체 타입 체크
        if (typeof userData !== 'object') {
            errors.push('사용자 데이터가 올바른 형식이 아닙니다.');
            return { valid: false, errors, data: null };
        }
        
        // 필수 필드 검증
        const requiredFields = ['email', 'provider'];
        
        for (const field of requiredFields) {
            if (!userData[field]) {
                errors.push(`필수 필드가 누락되었습니다: ${field}`);
            }
        }
        
        // 이메일 형식 검증
        if (userData.email && !this.isValidEmail(userData.email)) {
            errors.push('유효하지 않은 이메일 형식입니다.');
        }
        
        // provider 값 검증
        const validProviders = ['google', 'username'];
        if (userData.provider && !validProviders.includes(userData.provider)) {
            errors.push(`유효하지 않은 인증 제공자입니다: ${userData.provider}`);
        }
        
        // 선택적 필드 타입 검증
        if (userData.name !== undefined && typeof userData.name !== 'string') {
            errors.push('사용자 이름이 올바른 형식이 아닙니다.');
        }
        
        if (userData.loginTime !== undefined && typeof userData.loginTime !== 'number') {
            errors.push('로그인 시간이 올바른 형식이 아닙니다.');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            data: errors.length === 0 ? userData : null
        };
    }
    
    /**
     * 저장된 텍스트 데이터 검증
     * @param {array} savedTexts - 검증할 저장된 텍스트 배열
     * @returns {object} - { valid: boolean, errors: string[], data: array }
     */
    validateSavedTexts(savedTexts) {
        const errors = [];
        
        // 배열 타입 체크
        if (!Array.isArray(savedTexts)) {
            errors.push('저장된 텍스트가 배열 형식이 아닙니다.');
            return { valid: false, errors, data: [] };
        }
        
        // 각 항목 검증
        const validatedTexts = [];
        
        for (let i = 0; i < savedTexts.length; i++) {
            const item = savedTexts[i];
            
            // 객체 타입 체크
            if (typeof item !== 'object' || item === null) {
                errors.push(`항목 ${i}: 올바른 형식이 아닙니다.`);
                continue;
            }
            
            // 필수 필드 체크
            const requiredFields = ['id', 'content', 'date', 'type'];
            let isValid = true;
            
            for (const field of requiredFields) {
                if (item[field] === undefined || item[field] === null) {
                    errors.push(`항목 ${i}: 필수 필드가 누락되었습니다 (${field})`);
                    isValid = false;
                }
            }
            
            // type 값 검증
            if (item.type && !['reference', 'edit'].includes(item.type)) {
                errors.push(`항목 ${i}: 유효하지 않은 타입입니다 (${item.type})`);
                isValid = false;
            }
            
            // 유효한 항목만 추가
            if (isValid) {
                validatedTexts.push(item);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            data: validatedTexts
        };
    }
    
    /**
     * 로컬 스토리지 데이터 안전 로드
     * JSON 파싱 오류를 처리하고 데이터 검증
     * @param {string} key - 로컬 스토리지 키
     * @param {*} defaultValue - 기본값
     * @param {function} validator - 검증 함수 (선택적)
     * @returns {*} - 로드된 데이터 또는 기본값
     */
    safeLoadFromStorage(key, defaultValue = null, validator = null) {
        try {
            const data = localStorage.getItem(key);
            
            if (!data) {
                return defaultValue;
            }
            
            // JSON 파싱
            const parsed = JSON.parse(data);
            
            // 검증 함수가 제공된 경우 검증 수행
            if (validator && typeof validator === 'function') {
                const validationResult = validator(parsed);
                
                if (!validationResult.valid) {
                    console.error(`❌ 데이터 검증 실패 (${key}):`, validationResult.errors);
                    
                    // 잘못된 데이터 로깅
                    if (window.ActivityLogger) {
                        const logger = new ActivityLogger();
                        logger.logAction('data_validation_failed', '데이터 검증 실패', {
                            key,
                            errors: validationResult.errors
                        });
                    }
                    
                    return defaultValue;
                }
                
                return validationResult.data;
            }
            
            return parsed;
            
        } catch (error) {
            console.error(`❌ 로컬 스토리지 데이터 로드 실패 (${key}):`, error);
            
            // 오류 로깅
            if (window.ActivityLogger) {
                const logger = new ActivityLogger();
                logger.logAction('storage_load_error', '스토리지 로드 오류', {
                    key,
                    error: error.message
                });
            }
            
            return defaultValue;
        }
    }
    
    /**
     * 로컬 스토리지 데이터 안전 저장
     * 저장 전 데이터 검증 및 오류 처리
     * @param {string} key - 로컬 스토리지 키
     * @param {*} data - 저장할 데이터
     * @param {function} validator - 검증 함수 (선택적)
     * @returns {boolean} - 저장 성공 여부
     */
    safeSaveToStorage(key, data, validator = null) {
        try {
            // 검증 함수가 제공된 경우 검증 수행
            if (validator && typeof validator === 'function') {
                const validationResult = validator(data);
                
                if (!validationResult.valid) {
                    console.error(`❌ 데이터 검증 실패 (${key}):`, validationResult.errors);
                    return false;
                }
            }
            
            // JSON 직렬화 및 저장
            const serialized = JSON.stringify(data);
            localStorage.setItem(key, serialized);
            
            return true;
            
        } catch (error) {
            console.error(`❌ 로컬 스토리지 데이터 저장 실패 (${key}):`, error);
            
            // QuotaExceededError 처리
            if (error.name === 'QuotaExceededError') {
                console.error('❌ 저장 공간이 부족합니다.');
                
                // 오류 로깅
                if (window.ActivityLogger) {
                    const logger = new ActivityLogger();
                    logger.logAction('storage_quota_exceeded', '저장 공간 부족', {
                        key
                    });
                }
            }
            
            return false;
        }
    }
    
    /**
     * 문자열 길이 검증
     * @param {string} str - 검증할 문자열
     * @param {number} minLength - 최소 길이
     * @param {number} maxLength - 최대 길이
     * @returns {object} - { valid: boolean, error: string }
     */
    validateStringLength(str, minLength = 0, maxLength = Infinity) {
        if (typeof str !== 'string') {
            return { valid: false, error: '문자열이 아닙니다.' };
        }
        
        const length = str.length;
        
        if (length < minLength) {
            return { valid: false, error: `최소 ${minLength}자 이상이어야 합니다.` };
        }
        
        if (length > maxLength) {
            return { valid: false, error: `최대 ${maxLength}자 이하여야 합니다.` };
        }
        
        return { valid: true, error: null };
    }
    
    /**
     * 사용자명 검증
     * @param {string} username - 검증할 사용자명
     * @returns {object} - { valid: boolean, error: string }
     */
    validateUsername(username) {
        if (!username || typeof username !== 'string') {
            return { valid: false, error: '사용자명을 입력해주세요.' };
        }
        
        const trimmed = username.trim();
        
        // 길이 검증 (2-50자)
        const lengthCheck = this.validateStringLength(trimmed, 2, 50);
        if (!lengthCheck.valid) {
            return lengthCheck;
        }
        
        // 특수 문자 검증 (영문, 한글, 숫자, 언더스코어, 하이픈만 허용)
        const usernamePattern = /^[a-zA-Z0-9가-힣_-]+$/;
        if (!usernamePattern.test(trimmed)) {
            return { valid: false, error: '사용자명은 영문, 한글, 숫자, _, - 만 사용할 수 있습니다.' };
        }
        
        return { valid: true, error: null };
    }
}

// 전역 인스턴스 생성
window.SecurityUtils = SecurityUtils;
