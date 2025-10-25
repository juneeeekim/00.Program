// 에러 처리 시스템
class ErrorHandler {
    constructor(logger = null) {
        this.logger = logger;
        
        // 에러 카테고리 정의 (CONFIG, AUTH, NETWORK, TOKEN)
        this.ERROR_CATEGORIES = {
            CONFIG: {
                PLACEHOLDER_VALUE: {
                    message: 'Google OAuth 설정이 필요합니다.',
                    action: 'showSetupInstructions',
                    severity: 'warning',
                    userMessage: 'Google 로그인 설정이 완료되지 않았습니다. 기존 방식으로 로그인해주세요.'
                },
                INVALID_FORMAT: {
                    message: '유효하지 않은 Google Client ID 형식입니다.',
                    action: 'showSetupInstructions',
                    severity: 'error',
                    userMessage: 'Google Client ID 형식이 올바르지 않습니다.'
                },
                HTTPS_REQUIRED: {
                    message: '프로덕션 환경에서는 HTTPS가 필수입니다.',
                    action: 'showSetupInstructions',
                    severity: 'error',
                    userMessage: '보안을 위해 HTTPS 연결이 필요합니다.'
                },
                INVALID_CLIENT_ID: {
                    message: 'Google Client ID가 올바르지 않습니다.',
                    action: 'showSetupInstructions',
                    severity: 'error',
                    userMessage: 'Google Client ID가 올바르지 않습니다.'
                },
                CONFIG_VALIDATION_FAILED: {
                    message: 'Google OAuth 설정 검증 실패',
                    action: 'enableFallback',
                    severity: 'error',
                    userMessage: 'Google 로그인 설정이 완료되지 않았습니다. 기존 방식으로 로그인해주세요.'
                }
            },
            
            AUTH: {
                POPUP_CLOSED_BY_USER: {
                    message: '사용자가 로그인을 취소했습니다.',
                    action: 'showInfo',
                    severity: 'info',
                    userMessage: '로그인이 취소되었습니다.'
                },
                POPUP_BLOCKED: {
                    message: '팝업이 차단되었습니다.',
                    action: 'showInfo',
                    severity: 'warning',
                    userMessage: '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.'
                },
                ACCESS_DENIED: {
                    message: '로그인 권한이 거부되었습니다.',
                    action: 'enableFallback',
                    severity: 'warning',
                    userMessage: '로그인 권한이 거부되었습니다.'
                },
                INVALID_GRANT: {
                    message: '인증 정보가 유효하지 않습니다.',
                    action: 'relogin',
                    severity: 'error',
                    userMessage: '인증 정보가 유효하지 않습니다. 다시 로그인해주세요.'
                },
                AUTH_FAILED: {
                    message: '인증에 실패했습니다.',
                    action: 'enableFallback',
                    severity: 'error',
                    userMessage: 'Google 로그인에 실패했습니다. 기존 방식으로 로그인해주세요.'
                }
            },
            
            NETWORK: {
                NETWORK_ERROR: {
                    message: '네트워크 연결이 없습니다.',
                    action: 'retry',
                    severity: 'warning',
                    userMessage: '네트워크 연결을 확인해주세요.'
                },
                TIMEOUT: {
                    message: '요청 시간이 초과되었습니다.',
                    action: 'retry',
                    severity: 'warning',
                    userMessage: '요청 시간이 초과되었습니다. 다시 시도해주세요.'
                },
                SERVICE_UNAVAILABLE: {
                    message: 'Google 서비스에 일시적으로 접속할 수 없습니다.',
                    action: 'retry',
                    severity: 'warning',
                    userMessage: 'Google 서비스에 일시적으로 접속할 수 없습니다.'
                },
                SCRIPT_LOAD_FAILED: {
                    message: 'Google 서비스를 불러올 수 없습니다.',
                    action: 'enableFallback',
                    severity: 'error',
                    userMessage: 'Google 서비스를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.'
                }
            },
            
            TOKEN: {
                TOKEN_EXPIRED: {
                    message: '로그인 세션이 만료되었습니다.',
                    action: 'autoRefresh',
                    severity: 'info',
                    userMessage: '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
                },
                TOKEN_REFRESH_FAILED: {
                    message: '세션 갱신에 실패했습니다.',
                    action: 'relogin',
                    severity: 'error',
                    userMessage: '세션 갱신에 실패했습니다. 다시 로그인해주세요.'
                },
                INVALID_TOKEN: {
                    message: '인증 토큰이 유효하지 않습니다.',
                    action: 'relogin',
                    severity: 'error',
                    userMessage: '인증 토큰이 유효하지 않습니다.'
                }
            }
        };
    }
    
    // 에러 식별 로직
    identifyError(error) {
        // 1. 네트워크 오류 확인
        if (!navigator.onLine) {
            return {
                category: 'NETWORK',
                code: 'NETWORK_ERROR',
                originalError: error
            };
        }
        
        // 2. 에러 객체에서 에러 코드 추출
        let errorCode = null;
        
        if (error.error) {
            errorCode = error.error;
        } else if (error.code) {
            errorCode = error.code;
        } else if (error.type) {
            errorCode = error.type;
        } else if (error.message) {
            // 메시지에서 에러 코드 추출 시도
            errorCode = this.extractErrorCodeFromMessage(error.message);
        }
        
        if (!errorCode) {
            return {
                category: 'UNKNOWN',
                code: 'UNKNOWN_ERROR',
                originalError: error
            };
        }
        
        // 3. 에러 코드를 대문자 및 언더스코어 형식으로 변환
        const normalizedCode = errorCode.toUpperCase().replace(/-/g, '_');
        
        // 4. 각 카테고리에서 에러 코드 검색
        for (const [category, errors] of Object.entries(this.ERROR_CATEGORIES)) {
            if (errors[normalizedCode]) {
                return {
                    category: category,
                    code: normalizedCode,
                    originalError: error
                };
            }
        }
        
        // 5. 특정 패턴으로 카테고리 추론
        return this.inferCategoryFromPattern(normalizedCode, error);
    }
    
    // 메시지에서 에러 코드 추출
    extractErrorCodeFromMessage(message) {
        const lowerMessage = message.toLowerCase();
        
        // 설정 관련
        if (lowerMessage.includes('client id') || lowerMessage.includes('config')) {
            return 'CONFIG_VALIDATION_FAILED';
        }
        
        // 네트워크 관련
        if (lowerMessage.includes('network') || lowerMessage.includes('offline')) {
            return 'NETWORK_ERROR';
        }
        
        if (lowerMessage.includes('timeout')) {
            return 'TIMEOUT';
        }
        
        // 토큰 관련
        if (lowerMessage.includes('token') && lowerMessage.includes('expired')) {
            return 'TOKEN_EXPIRED';
        }
        
        if (lowerMessage.includes('token') && lowerMessage.includes('invalid')) {
            return 'INVALID_TOKEN';
        }
        
        // 인증 관련
        if (lowerMessage.includes('popup') && lowerMessage.includes('closed')) {
            return 'POPUP_CLOSED_BY_USER';
        }
        
        if (lowerMessage.includes('access') && lowerMessage.includes('denied')) {
            return 'ACCESS_DENIED';
        }
        
        return null;
    }
    
    // 패턴으로 카테고리 추론
    inferCategoryFromPattern(code, error) {
        // 설정 관련 패턴
        if (code.includes('CONFIG') || code.includes('CLIENT') || code.includes('HTTPS')) {
            return {
                category: 'CONFIG',
                code: 'CONFIG_VALIDATION_FAILED',
                originalError: error
            };
        }
        
        // 네트워크 관련 패턴
        if (code.includes('NETWORK') || code.includes('TIMEOUT') || code.includes('OFFLINE')) {
            return {
                category: 'NETWORK',
                code: 'NETWORK_ERROR',
                originalError: error
            };
        }
        
        // 토큰 관련 패턴
        if (code.includes('TOKEN') || code.includes('EXPIRED') || code.includes('REFRESH')) {
            return {
                category: 'TOKEN',
                code: 'TOKEN_EXPIRED',
                originalError: error
            };
        }
        
        // 인증 관련 패턴
        if (code.includes('AUTH') || code.includes('LOGIN') || code.includes('POPUP')) {
            return {
                category: 'AUTH',
                code: 'AUTH_FAILED',
                originalError: error
            };
        }
        
        // 기본값
        return {
            category: 'UNKNOWN',
            code: 'UNKNOWN_ERROR',
            originalError: error
        };
    }
    
    // 에러 정보 가져오기
    getErrorInfo(category, code) {
        if (this.ERROR_CATEGORIES[category] && this.ERROR_CATEGORIES[category][code]) {
            return this.ERROR_CATEGORIES[category][code];
        }
        
        // 기본 에러 정보
        return {
            message: '알 수 없는 오류가 발생했습니다.',
            action: 'showInfo',
            severity: 'error',
            userMessage: '오류가 발생했습니다. 다시 시도해주세요.'
        };
    }
    
    // 에러 카테고리 확인
    isConfigError(category) {
        return category === 'CONFIG';
    }
    
    isAuthError(category) {
        return category === 'AUTH';
    }
    
    isNetworkError(category) {
        return category === 'NETWORK';
    }
    
    isTokenError(category) {
        return category === 'TOKEN';
    }
    
    // 카테고리별 에러 처리 로직
    handleError(error, callbacks = {}) {
        // 1. 에러 식별
        const identified = this.identifyError(error);
        const errorInfo = this.getErrorInfo(identified.category, identified.code);
        
        // 2. 개발자용 콘솔 로그
        this.logErrorToConsole(identified, errorInfo, error);
        
        // 3. ActivityLogger를 통한 에러 로그 저장
        if (this.logger) {
            this.logger.logAction('error_occurred', '에러 발생', {
                category: identified.category,
                code: identified.code,
                message: errorInfo.message,
                severity: errorInfo.severity,
                originalError: error.message || error.toString()
            });
        }
        
        // 4. 카테고리별 처리
        switch (identified.category) {
            case 'CONFIG':
                return this.handleConfigError(identified, errorInfo, callbacks);
            
            case 'AUTH':
                return this.handleAuthError(identified, errorInfo, callbacks);
            
            case 'NETWORK':
                return this.handleNetworkError(identified, errorInfo, callbacks);
            
            case 'TOKEN':
                return this.handleTokenError(identified, errorInfo, callbacks);
            
            default:
                return this.handleUnknownError(identified, errorInfo, callbacks);
        }
    }
    
    // CONFIG 에러 처리: 설정 안내 표시 및 폴백 활성화
    handleConfigError(identified, errorInfo, callbacks) {
        console.warn('⚠️ [CONFIG ERROR]', errorInfo.message);
        
        // 설정 안내 표시
        if (callbacks.showSetupInstructions) {
            callbacks.showSetupInstructions();
        }
        
        // 폴백 활성화
        if (callbacks.enableFallback) {
            callbacks.enableFallback();
        }
        
        // 사용자 메시지 표시
        if (callbacks.showMessage) {
            callbacks.showMessage(errorInfo.userMessage, 'warning');
        }
        
        return {
            category: identified.category,
            code: identified.code,
            handled: true,
            action: errorInfo.action,
            userMessage: errorInfo.userMessage
        };
    }
    
    // AUTH 에러 처리: 사용자 취소는 info 메시지, 기타는 폴백 활성화
    handleAuthError(identified, errorInfo, callbacks) {
        // 사용자 취소는 오류가 아님
        if (identified.code === 'POPUP_CLOSED_BY_USER') {
            console.log('ℹ️ [AUTH INFO]', errorInfo.message);
            
            if (callbacks.showMessage) {
                callbacks.showMessage(errorInfo.userMessage, 'info');
            }
            
            return {
                category: identified.category,
                code: identified.code,
                handled: true,
                action: 'none',
                userMessage: errorInfo.userMessage
            };
        }
        
        // 기타 인증 오류
        console.error('❌ [AUTH ERROR]', errorInfo.message);
        
        // 폴백 활성화
        if (callbacks.enableFallback) {
            callbacks.enableFallback();
        }
        
        // 사용자 메시지 표시
        if (callbacks.showMessage) {
            const messageType = errorInfo.severity === 'warning' ? 'warning' : 'error';
            callbacks.showMessage(errorInfo.userMessage, messageType);
        }
        
        return {
            category: identified.category,
            code: identified.code,
            handled: true,
            action: errorInfo.action,
            userMessage: errorInfo.userMessage
        };
    }
    
    // NETWORK 에러 처리: 연결 확인 요청 및 재시도 옵션
    handleNetworkError(identified, errorInfo, callbacks) {
        console.warn('⚠️ [NETWORK ERROR]', errorInfo.message);
        
        // 사용자 메시지 표시
        if (callbacks.showMessage) {
            callbacks.showMessage(errorInfo.userMessage, 'warning');
        }
        
        // 재시도 옵션 제공
        if (callbacks.offerRetry) {
            callbacks.offerRetry();
        }
        
        // 오프라인 모드 활성화
        if (!navigator.onLine && callbacks.enableOfflineMode) {
            callbacks.enableOfflineMode();
        }
        
        return {
            category: identified.category,
            code: identified.code,
            handled: true,
            action: errorInfo.action,
            userMessage: errorInfo.userMessage,
            retryable: true
        };
    }
    
    // TOKEN 에러 처리: 자동 갱신 또는 재로그인 프롬프트
    handleTokenError(identified, errorInfo, callbacks) {
        console.warn('⚠️ [TOKEN ERROR]', errorInfo.message);
        
        // 토큰 만료 - 자동 갱신 시도
        if (identified.code === 'TOKEN_EXPIRED' && callbacks.autoRefreshToken) {
            console.log('🔄 토큰 자동 갱신 시도...');
            callbacks.autoRefreshToken();
            
            return {
                category: identified.category,
                code: identified.code,
                handled: true,
                action: 'autoRefresh',
                userMessage: '세션을 갱신하고 있습니다...'
            };
        }
        
        // 토큰 갱신 실패 또는 유효하지 않은 토큰 - 재로그인 필요
        if (callbacks.showMessage) {
            callbacks.showMessage(errorInfo.userMessage, 'error');
        }
        
        if (callbacks.promptRelogin) {
            callbacks.promptRelogin();
        }
        
        return {
            category: identified.category,
            code: identified.code,
            handled: true,
            action: errorInfo.action,
            userMessage: errorInfo.userMessage
        };
    }
    
    // 알 수 없는 에러 처리
    handleUnknownError(identified, errorInfo, callbacks) {
        console.error('❌ [UNKNOWN ERROR]', identified.originalError);
        
        if (callbacks.showMessage) {
            callbacks.showMessage(errorInfo.userMessage, 'error');
        }
        
        return {
            category: 'UNKNOWN',
            code: 'UNKNOWN_ERROR',
            handled: false,
            action: 'none',
            userMessage: errorInfo.userMessage
        };
    }
    
    // 개발자용 콘솔 로그
    logErrorToConsole(identified, errorInfo, originalError) {
        console.group('🔴 Error Handler');
        console.error('Category:', identified.category);
        console.error('Code:', identified.code);
        console.error('Message:', errorInfo.message);
        console.error('Severity:', errorInfo.severity);
        console.error('Action:', errorInfo.action);
        console.error('User Message:', errorInfo.userMessage);
        
        if (originalError) {
            console.error('Original Error:', originalError);
            
            if (originalError.stack) {
                console.error('Stack Trace:', originalError.stack);
            }
        }
        
        console.groupEnd();
    }
}

// 전역 인스턴스 생성
window.ErrorHandler = ErrorHandler;
