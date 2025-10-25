// 활동 로깅 시스템
class ActivityLogger {
    constructor(userId = null) {
        this.userId = userId;
        this.sessionId = this.generateSessionId();
        this.isDevelopment = this.detectEnvironment();
        this.logBuffer = [];
        this.maxLogs = 1000; // 최대 로그 개수
        this.storageKey = 'dualTextWriter_activityLogs';
    }
    
    // 환경 감지
    detectEnvironment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1';
    }
    
    // 세션 ID 생성
    generateSessionId() {
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // 사용자 ID 설정
    setUserId(userId) {
        this.userId = userId;
        this.logAction('user_id_updated', '사용자 ID 업데이트', { userId });
    }
    
    // 액션 로깅
    logAction(action, message, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            userId: this.userId || 'anonymous',
            action: action,
            message: message,
            details: details,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        // 버퍼에 추가
        this.logBuffer.push(logEntry);
        
        // 로컬 스토리지에 저장
        this.saveToLocalStorage(logEntry);
        
        // 개발 환경에서만 콘솔 출력
        if (this.isDevelopment) {
            this.logToConsole(logEntry);
        }
    }
    
    // 콘솔 로깅 (개발 환경용)
    logToConsole(logEntry) {
        const actionIcons = {
            // 인증 관련
            'auth_init': '🔐',
            'auth_success': '✅',
            'auth_failure': '❌',
            'auth_logout': '🚪',
            'token_refresh': '🔄',
            'token_expired': '⏰',
            
            // 마이그레이션 관련
            'migration_start': '📦',
            'migration_complete': '✅',
            'migration_error': '❌',
            'migration_rollback': '↩️',
            
            // 데이터 관련
            'text_saved': '💾',
            'text_deleted': '🗑️',
            'text_edited': '✏️',
            'temp_save': '💾',
            'data_loaded': '📂',
            
            // UI 관련
            'page_load': '🚀',
            'button_click': '🖱️',
            'input_change': '⌨️',
            
            // 오류 관련
            'error_occurred': '🔴',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        
        const icon = actionIcons[logEntry.action] || '📊';
        const timestamp = new Date(logEntry.timestamp).toLocaleTimeString('ko-KR');
        
        console.log(
            `${icon} [${timestamp}] ${logEntry.action}: ${logEntry.message}`,
            logEntry.details
        );
    }
    
    // 로컬 스토리지에 저장
    saveToLocalStorage(logEntry) {
        try {
            const existingLogs = this.getExistingLogs();
            existingLogs.push(logEntry);
            
            // 최대 개수 제한
            if (existingLogs.length > this.maxLogs) {
                existingLogs.shift(); // 가장 오래된 로그 제거
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(existingLogs));
        } catch (error) {
            console.error('로그 저장 실패:', error);
            
            // 스토리지 용량 초과 시 오래된 로그 정리
            if (error.name === 'QuotaExceededError') {
                this.cleanupOldLogs();
            }
        }
    }
    
    // 기존 로그 조회
    getExistingLogs() {
        try {
            const logs = localStorage.getItem(this.storageKey);
            return logs ? JSON.parse(logs) : [];
        } catch (error) {
            console.error('로그 조회 실패:', error);
            return [];
        }
    }
    
    // 오래된 로그 정리
    cleanupOldLogs() {
        try {
            const logs = this.getExistingLogs();
            
            // 최근 500개만 유지
            const recentLogs = logs.slice(-500);
            
            localStorage.setItem(this.storageKey, JSON.stringify(recentLogs));
            
            console.log('🧹 오래된 로그 정리 완료:', logs.length - recentLogs.length, '개 삭제');
        } catch (error) {
            console.error('로그 정리 실패:', error);
        }
    }
    
    // 특정 액션 로그 조회
    getLogsByAction(action) {
        const logs = this.getExistingLogs();
        return logs.filter(log => log.action === action);
    }
    
    // 특정 사용자 로그 조회
    getLogsByUser(userId) {
        const logs = this.getExistingLogs();
        return logs.filter(log => log.userId === userId);
    }
    
    // 특정 세션 로그 조회
    getLogsBySession(sessionId) {
        const logs = this.getExistingLogs();
        return logs.filter(log => log.sessionId === sessionId);
    }
    
    // 시간 범위 로그 조회
    getLogsByTimeRange(startTime, endTime) {
        const logs = this.getExistingLogs();
        return logs.filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            return logTime >= startTime && logTime <= endTime;
        });
    }
    
    // 로그 통계
    getLogStatistics() {
        const logs = this.getExistingLogs();
        
        const stats = {
            totalLogs: logs.length,
            uniqueUsers: new Set(logs.map(log => log.userId)).size,
            uniqueSessions: new Set(logs.map(log => log.sessionId)).size,
            actionCounts: {},
            recentActivity: logs.slice(-10)
        };
        
        // 액션별 카운트
        logs.forEach(log => {
            stats.actionCounts[log.action] = (stats.actionCounts[log.action] || 0) + 1;
        });
        
        return stats;
    }
    
    // 로그 내보내기 (디버깅용)
    exportLogs(format = 'json') {
        const logs = this.getExistingLogs();
        
        if (format === 'json') {
            return JSON.stringify(logs, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(logs);
        }
        
        return logs;
    }
    
    // CSV 변환
    convertToCSV(logs) {
        if (logs.length === 0) return '';
        
        const headers = ['timestamp', 'sessionId', 'userId', 'action', 'message'];
        const csvRows = [headers.join(',')];
        
        logs.forEach(log => {
            const row = [
                log.timestamp,
                log.sessionId,
                log.userId,
                log.action,
                `"${log.message}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    // 로그 다운로드
    downloadLogs(format = 'json') {
        const content = this.exportLogs(format);
        const filename = `activity-logs-${Date.now()}.${format}`;
        const mimeType = format === 'json' ? 'application/json' : 'text/csv';
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📥 로그 다운로드 완료:', filename);
    }
    
    // 디버그 모드 활성화
    enableDebugMode() {
        this.isDevelopment = true;
        console.log('🐛 디버그 모드 활성화');
        this.logAction('debug_mode_enabled', '디버그 모드 활성화');
    }
    
    // 디버그 모드 비활성화
    disableDebugMode() {
        this.isDevelopment = false;
        console.log('🐛 디버그 모드 비활성화');
        this.logAction('debug_mode_disabled', '디버그 모드 비활성화');
    }
    
    // 로그 초기화
    clearLogs() {
        try {
            localStorage.removeItem(this.storageKey);
            this.logBuffer = [];
            console.log('🧹 모든 로그 삭제 완료');
        } catch (error) {
            console.error('로그 삭제 실패:', error);
        }
    }
    
    // 성능 측정 시작
    startPerformanceMeasure(measureName) {
        performance.mark(`${measureName}-start`);
    }
    
    // 성능 측정 종료
    endPerformanceMeasure(measureName) {
        try {
            performance.mark(`${measureName}-end`);
            performance.measure(measureName, `${measureName}-start`, `${measureName}-end`);
            
            const measure = performance.getEntriesByName(measureName)[0];
            const duration = measure.duration.toFixed(2);
            
            this.logAction('performance_measure', `${measureName} 완료`, {
                measureName,
                duration: `${duration}ms`
            });
            
            // 성능 경고 (1초 이상)
            if (measure.duration > 1000) {
                console.warn(`⚠️ 성능 경고: ${measureName}이(가) ${duration}ms 소요됨`);
            }
            
            return measure.duration;
        } catch (error) {
            console.error('성능 측정 실패:', error);
            return null;
        }
    }
}

// 전역 인스턴스 생성
window.ActivityLogger = ActivityLogger;
