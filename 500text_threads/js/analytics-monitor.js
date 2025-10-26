/**
 * AnalyticsMonitor
 * 
 * 사용자 행동 분석 및 성능 모니터링
 * - 인증 이벤트 추적
 * - 오류 발생 추적
 * - 성능 메트릭 모니터링
 * - 사용자 선호도 추적
 * 
 * Requirements: Task 13.4
 */

class AnalyticsMonitor {
    constructor(logger) {
        this.logger = logger;
        this.storageKey = 'dualTextWriter_analytics';
        this.sessionStartTime = Date.now();
        
        // Analytics data structure
        this.analytics = this.loadAnalytics() || {
            authEvents: {
                googleLoginAttempts: 0,
                googleLoginSuccess: 0,
                googleLoginFailures: 0,
                usernameLoginAttempts: 0,
                usernameLoginSuccess: 0,
                usernameLoginFailures: 0,
                logoutCount: 0
            },
            errors: {
                totalErrors: 0,
                errorsByType: {},
                errorsByComponent: {},
                lastErrors: []
            },
            performance: {
                avgLoginTime: 0,
                avgPageLoadTime: 0,
                avgValidationTime: 0,
                slowOperations: []
            },
            userPreferences: {
                preferredAuthMethod: null,
                alwaysUsePreferred: false,
                deviceType: null,
                lastLoginMethod: null,
                loginMethodHistory: []
            },
            usage: {
                totalSessions: 0,
                totalTextsSaved: 0,
                totalTextsDeleted: 0,
                totalDownloads: 0,
                avgSessionDuration: 0
            }
        };
        
        // Start session tracking
        this.trackSessionStart();
        
        // Setup beforeunload to track session end
        window.addEventListener('beforeunload', () => this.trackSessionEnd());
    }
    
    /**
     * Load analytics from localStorage
     */
    loadAnalytics() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Analytics 로드 실패:', error);
            return null;
        }
    }
    
    /**
     * Save analytics to localStorage
     */
    saveAnalytics() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.analytics));
        } catch (error) {
            console.error('Analytics 저장 실패:', error);
        }
    }
    
    /**
     * Track authentication event
     */
    trackAuthEvent(eventType, method, success, details = {}) {
        const key = `${method}Login${success ? 'Success' : 'Failures'}`;
        const attemptKey = `${method}LoginAttempts`;
        
        this.analytics.authEvents[attemptKey]++;
        if (this.analytics.authEvents[key] !== undefined) {
            this.analytics.authEvents[key]++;
        }
        
        // Track login method history
        if (success) {
            this.analytics.userPreferences.lastLoginMethod = method;
            this.analytics.userPreferences.loginMethodHistory.push({
                method,
                timestamp: Date.now()
            });
            
            // Keep only last 50 entries
            if (this.analytics.userPreferences.loginMethodHistory.length > 50) {
                this.analytics.userPreferences.loginMethodHistory.shift();
            }
        }
        
        // Log the event
        this.logger.logAction(`auth_${eventType}`, `${method} 인증 ${success ? '성공' : '실패'}`, details);
        
        this.saveAnalytics();
    }
    
    /**
     * Track logout event
     */
    trackLogout() {
        this.analytics.authEvents.logoutCount++;
        this.logger.logAction('auth_logout', '로그아웃');
        this.saveAnalytics();
    }
    
    /**
     * Track error occurrence
     */
    trackError(errorType, component, errorMessage, details = {}) {
        this.analytics.errors.totalErrors++;
        
        // Track by type
        if (!this.analytics.errors.errorsByType[errorType]) {
            this.analytics.errors.errorsByType[errorType] = 0;
        }
        this.analytics.errors.errorsByType[errorType]++;
        
        // Track by component
        if (!this.analytics.errors.errorsByComponent[component]) {
            this.analytics.errors.errorsByComponent[component] = 0;
        }
        this.analytics.errors.errorsByComponent[component]++;
        
        // Store last 20 errors
        this.analytics.errors.lastErrors.push({
            type: errorType,
            component,
            message: errorMessage,
            timestamp: Date.now(),
            details
        });
        
        if (this.analytics.errors.lastErrors.length > 20) {
            this.analytics.errors.lastErrors.shift();
        }
        
        // Log the error
        this.logger.logAction('error_tracked', `오류 추적: ${errorType}`, {
            component,
            message: errorMessage,
            ...details
        });
        
        this.saveAnalytics();
    }
    
    /**
     * Track performance metric
     */
    trackPerformance(operation, duration, threshold = 1000) {
        // Update averages
        switch (operation) {
            case 'login':
                this.analytics.performance.avgLoginTime = this._updateAverage(
                    this.analytics.performance.avgLoginTime,
                    duration,
                    this.analytics.authEvents.googleLoginSuccess + this.analytics.authEvents.usernameLoginSuccess
                );
                break;
            case 'page_load':
                this.analytics.performance.avgPageLoadTime = duration;
                break;
            case 'validation':
                this.analytics.performance.avgValidationTime = this._updateAverage(
                    this.analytics.performance.avgValidationTime,
                    duration,
                    100 // Approximate validation count
                );
                break;
        }
        
        // Track slow operations
        if (duration > threshold) {
            this.analytics.performance.slowOperations.push({
                operation,
                duration,
                timestamp: Date.now()
            });
            
            // Keep only last 50 slow operations
            if (this.analytics.performance.slowOperations.length > 50) {
                this.analytics.performance.slowOperations.shift();
            }
            
            console.warn(`⚠️ 느린 작업 감지: ${operation} (${duration.toFixed(2)}ms)`);
        }
        
        // Log performance
        this.logger.logAction('performance_tracked', `성능 추적: ${operation}`, {
            duration: `${duration.toFixed(2)}ms`,
            threshold: `${threshold}ms`
        });
        
        this.saveAnalytics();
    }
    
    /**
     * Update user preference
     */
    updateUserPreference(key, value) {
        if (this.analytics.userPreferences.hasOwnProperty(key)) {
            this.analytics.userPreferences[key] = value;
            
            this.logger.logAction('preference_updated', `사용자 선호도 업데이트: ${key}`, { value });
            this.saveAnalytics();
        }
    }
    
    /**
     * Track usage event
     */
    trackUsage(eventType, details = {}) {
        switch (eventType) {
            case 'text_saved':
                this.analytics.usage.totalTextsSaved++;
                break;
            case 'text_deleted':
                this.analytics.usage.totalTextsDeleted++;
                break;
            case 'download':
                this.analytics.usage.totalDownloads++;
                break;
        }
        
        this.logger.logAction(`usage_${eventType}`, `사용 추적: ${eventType}`, details);
        this.saveAnalytics();
    }
    
    /**
     * Track session start
     */
    trackSessionStart() {
        this.analytics.usage.totalSessions++;
        this.sessionStartTime = Date.now();
        
        this.logger.logAction('session_start', '세션 시작');
        this.saveAnalytics();
    }
    
    /**
     * Track session end
     */
    trackSessionEnd() {
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        // Update average session duration
        this.analytics.usage.avgSessionDuration = this._updateAverage(
            this.analytics.usage.avgSessionDuration,
            sessionDuration,
            this.analytics.usage.totalSessions
        );
        
        this.logger.logAction('session_end', '세션 종료', {
            duration: `${(sessionDuration / 1000).toFixed(2)}s`
        });
        
        this.saveAnalytics();
    }
    
    /**
     * Get analytics summary
     */
    getSummary() {
        return {
            authEvents: this.analytics.authEvents,
            errors: {
                totalErrors: this.analytics.errors.totalErrors,
                topErrorTypes: this._getTopItems(this.analytics.errors.errorsByType, 5),
                topErrorComponents: this._getTopItems(this.analytics.errors.errorsByComponent, 5)
            },
            performance: {
                avgLoginTime: `${this.analytics.performance.avgLoginTime.toFixed(2)}ms`,
                avgPageLoadTime: `${this.analytics.performance.avgPageLoadTime.toFixed(2)}ms`,
                avgValidationTime: `${this.analytics.performance.avgValidationTime.toFixed(2)}ms`,
                slowOperationsCount: this.analytics.performance.slowOperations.length
            },
            userPreferences: this.analytics.userPreferences,
            usage: {
                ...this.analytics.usage,
                avgSessionDuration: `${(this.analytics.usage.avgSessionDuration / 1000).toFixed(2)}s`
            }
        };
    }
    
    /**
     * Get detailed report
     */
    getDetailedReport() {
        return {
            summary: this.getSummary(),
            recentErrors: this.analytics.errors.lastErrors.slice(-10),
            recentSlowOperations: this.analytics.performance.slowOperations.slice(-10),
            loginMethodHistory: this.analytics.userPreferences.loginMethodHistory.slice(-20)
        };
    }
    
    /**
     * Export analytics data
     */
    exportData(format = 'json') {
        const data = this.getDetailedReport();
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            // Simple CSV export for summary
            const summary = this.getSummary();
            let csv = 'Metric,Value\n';
            
            // Auth events
            Object.entries(summary.authEvents).forEach(([key, value]) => {
                csv += `${key},${value}\n`;
            });
            
            // Performance
            Object.entries(summary.performance).forEach(([key, value]) => {
                csv += `${key},${value}\n`;
            });
            
            return csv;
        }
        
        return data;
    }
    
    /**
     * Reset analytics
     */
    reset() {
        if (confirm('모든 분석 데이터를 초기화하시겠습니까?')) {
            localStorage.removeItem(this.storageKey);
            this.analytics = this.loadAnalytics() || this._getDefaultAnalytics();
            
            this.logger.logAction('analytics_reset', '분석 데이터 초기화');
            console.log('🧹 Analytics 데이터 초기화 완료');
        }
    }
    
    /**
     * Helper: Update running average
     * @private
     */
    _updateAverage(currentAvg, newValue, count) {
        if (count === 0) return newValue;
        return ((currentAvg * (count - 1)) + newValue) / count;
    }
    
    /**
     * Helper: Get top N items from object
     * @private
     */
    _getTopItems(obj, n) {
        return Object.entries(obj)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
    }
    
    /**
     * Helper: Get default analytics structure
     * @private
     */
    _getDefaultAnalytics() {
        return {
            authEvents: {
                googleLoginAttempts: 0,
                googleLoginSuccess: 0,
                googleLoginFailures: 0,
                usernameLoginAttempts: 0,
                usernameLoginSuccess: 0,
                usernameLoginFailures: 0,
                logoutCount: 0
            },
            errors: {
                totalErrors: 0,
                errorsByType: {},
                errorsByComponent: {},
                lastErrors: []
            },
            performance: {
                avgLoginTime: 0,
                avgPageLoadTime: 0,
                avgValidationTime: 0,
                slowOperations: []
            },
            userPreferences: {
                preferredAuthMethod: null,
                alwaysUsePreferred: false,
                deviceType: null,
                lastLoginMethod: null,
                loginMethodHistory: []
            },
            usage: {
                totalSessions: 0,
                totalTextsSaved: 0,
                totalTextsDeleted: 0,
                totalDownloads: 0,
                avgSessionDuration: 0
            }
        };
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.AnalyticsMonitor = AnalyticsMonitor;
}
