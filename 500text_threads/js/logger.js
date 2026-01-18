/**
 * ============================================================
 * 환경별 로깅 유틸리티 모듈
 * @module Logger
 * @version 1.1.0
 * @date 2026-01-13
 * 
 * [P4-01] 프로덕션 환경에서 콘솔 로그 노출 방지
 * - 개발 환경(localhost)에서만 로그 출력
 * - 에러 로그는 항상 출력 (모니터링 필요)
 * - 추후 에러 모니터링 서비스 연동 가능
 * 
 * [P4-02] 디버그 모드 지원 (?debug=true)
 * - URL 파라미터로 디버그 패널 활성화
 * - 실시간 에러/경고/로그 확인 가능
 * ============================================================
 */

/**
 * 디버그 모드 여부 판별
 * - URL에 ?debug=true 파라미터가 있으면 디버그 모드 활성화
 * @type {boolean}
 */
const isDebugMode = typeof window !== 'undefined' && 
    new URLSearchParams(window.location.search).get('debug') === 'true';

/**
 * 개발 환경 여부 판별
 * - localhost 또는 127.0.0.1에서 실행 시 개발 환경으로 판단
 * - 또는 디버그 모드가 활성화된 경우
 * @type {boolean}
 */
const isDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    isDebugMode
);

/**
 * 디버그 패널 로그 저장소
 */
const debugLogs = [];
const MAX_DEBUG_LOGS = 500;

/**
 * 디버그 패널에 로그 추가
 */
function addToDebugPanel(type, args) {
    if (!isDebugMode) return;
    
    const timestamp = new Date().toLocaleTimeString('ko-KR', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
    });
    
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    debugLogs.push({ type, timestamp, message });
    
    // 최대 로그 수 제한
    if (debugLogs.length > MAX_DEBUG_LOGS) {
        debugLogs.shift();
    }
    
    // 패널 업데이트
    updateDebugPanel();
}

/**
 * 디버그 패널 UI 업데이트
 */
function updateDebugPanel() {
    const logContainer = document.getElementById('debug-panel-logs');
    if (!logContainer) return;
    
    const lastLog = debugLogs[debugLogs.length - 1];
    if (!lastLog) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `debug-log-entry debug-log-${lastLog.type}`;
    logEntry.innerHTML = `
        <span class="debug-log-time">[${lastLog.timestamp}]</span>
        <span class="debug-log-type">[${lastLog.type.toUpperCase()}]</span>
        <span class="debug-log-message">${escapeHtmlForDebug(lastLog.message)}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * HTML 이스케이프 (디버그 패널용)
 */
function escapeHtmlForDebug(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 디버그 패널 초기화
 */
function initDebugPanel() {
    if (!isDebugMode || typeof document === 'undefined') return;
    
    // 이미 패널이 있으면 스킵
    if (document.getElementById('debug-panel')) return;
    
    // 디버그 패널 HTML 생성
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = `
        <div class="debug-panel-header">
            <span class="debug-panel-title">🔧 Debug Panel</span>
            <div class="debug-panel-controls">
                <button id="debug-panel-clear" title="로그 지우기">🗑️</button>
                <button id="debug-panel-copy" title="로그 복사">📋</button>
                <button id="debug-panel-toggle" title="패널 접기/펼치기">▼</button>
                <button id="debug-panel-close" title="패널 닫기">✕</button>
            </div>
        </div>
        <div class="debug-panel-filters">
            <label><input type="checkbox" data-filter="log" checked> Log</label>
            <label><input type="checkbox" data-filter="warn" checked> Warn</label>
            <label><input type="checkbox" data-filter="error" checked> Error</label>
            <label><input type="checkbox" data-filter="debug" checked> Debug</label>
        </div>
        <div class="debug-panel-stats">
            <span id="debug-stats-log">Log: 0</span>
            <span id="debug-stats-warn">Warn: 0</span>
            <span id="debug-stats-error">Error: 0</span>
        </div>
        <div id="debug-panel-logs" class="debug-panel-logs"></div>
    `;
    
    // 스타일 추가
    const style = document.createElement('style');
    style.textContent = `
        #debug-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            max-height: 300px;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            z-index: 99999;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
        }
        #debug-panel.collapsed {
            max-height: 36px;
        }
        #debug-panel.collapsed .debug-panel-logs,
        #debug-panel.collapsed .debug-panel-filters,
        #debug-panel.collapsed .debug-panel-stats {
            display: none;
        }
        .debug-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #333;
            border-bottom: 1px solid #444;
            cursor: move;
        }
        .debug-panel-title {
            font-weight: bold;
            color: #4fc3f7;
        }
        .debug-panel-controls button {
            background: none;
            border: none;
            color: #d4d4d4;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 14px;
        }
        .debug-panel-controls button:hover {
            background: #444;
            border-radius: 4px;
        }
        .debug-panel-filters {
            display: flex;
            gap: 12px;
            padding: 6px 12px;
            background: #2d2d2d;
            border-bottom: 1px solid #444;
        }
        .debug-panel-filters label {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
        }
        .debug-panel-stats {
            display: flex;
            gap: 16px;
            padding: 4px 12px;
            background: #252525;
            font-size: 11px;
        }
        #debug-stats-log { color: #9cdcfe; }
        #debug-stats-warn { color: #dcdcaa; }
        #debug-stats-error { color: #f48771; }
        .debug-panel-logs {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            max-height: 200px;
        }
        .debug-log-entry {
            padding: 4px 8px;
            border-bottom: 1px solid #333;
            word-break: break-all;
            white-space: pre-wrap;
        }
        .debug-log-entry:hover {
            background: #2a2a2a;
        }
        .debug-log-time {
            color: #6a9955;
            margin-right: 8px;
        }
        .debug-log-type {
            font-weight: bold;
            margin-right: 8px;
        }
        .debug-log-log .debug-log-type { color: #9cdcfe; }
        .debug-log-warn .debug-log-type { color: #dcdcaa; }
        .debug-log-error .debug-log-type { color: #f48771; }
        .debug-log-debug .debug-log-type { color: #c586c0; }
        .debug-log-error {
            background: rgba(244, 135, 113, 0.1);
        }
        .debug-log-warn {
            background: rgba(220, 220, 170, 0.1);
        }
        .debug-log-message {
            color: #d4d4d4;
        }
        .debug-log-entry.hidden {
            display: none;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(panel);
    
    // 이벤트 바인딩
    document.getElementById('debug-panel-close').addEventListener('click', () => {
        panel.style.display = 'none';
    });
    
    document.getElementById('debug-panel-toggle').addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        document.getElementById('debug-panel-toggle').textContent = 
            panel.classList.contains('collapsed') ? '▲' : '▼';
    });
    
    document.getElementById('debug-panel-clear').addEventListener('click', () => {
        debugLogs.length = 0;
        document.getElementById('debug-panel-logs').innerHTML = '';
        updateDebugStats();
    });
    
    document.getElementById('debug-panel-copy').addEventListener('click', () => {
        const logText = debugLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(logText).then(() => {
            alert('로그가 클립보드에 복사되었습니다.');
        });
    });
    
    // 필터 이벤트
    document.querySelectorAll('.debug-panel-filters input').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const filter = checkbox.dataset.filter;
            const entries = document.querySelectorAll(`.debug-log-${filter}`);
            entries.forEach(entry => {
                entry.classList.toggle('hidden', !checkbox.checked);
            });
        });
    });
    
    // 초기 메시지
    addToDebugPanel('log', ['🔧 Debug Panel 활성화됨 - URL: ' + window.location.href]);
    addToDebugPanel('log', ['📱 User Agent: ' + navigator.userAgent]);
    addToDebugPanel('log', ['🌐 Online: ' + navigator.onLine]);
    
    // 전역 에러 캐치
    window.addEventListener('error', (event) => {
        addToDebugPanel('error', [`[Global Error] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`]);
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        addToDebugPanel('error', [`[Unhandled Promise Rejection] ${event.reason}`]);
    });
    
    // 네트워크 상태 모니터링
    window.addEventListener('online', () => addToDebugPanel('log', ['🌐 네트워크 연결됨']));
    window.addEventListener('offline', () => addToDebugPanel('warn', ['📡 네트워크 연결 끊김']));
}

/**
 * 디버그 통계 업데이트
 */
function updateDebugStats() {
    const logCount = debugLogs.filter(l => l.type === 'log').length;
    const warnCount = debugLogs.filter(l => l.type === 'warn').length;
    const errorCount = debugLogs.filter(l => l.type === 'error').length;
    
    const logEl = document.getElementById('debug-stats-log');
    const warnEl = document.getElementById('debug-stats-warn');
    const errorEl = document.getElementById('debug-stats-error');
    
    if (logEl) logEl.textContent = `Log: ${logCount}`;
    if (warnEl) warnEl.textContent = `Warn: ${warnCount}`;
    if (errorEl) errorEl.textContent = `Error: ${errorCount}`;
}

// DOM 로드 후 디버그 패널 초기화
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebugPanel);
    } else {
        initDebugPanel();
    }
}

/**
 * 환경별 로깅 유틸리티 객체
 * 
 * @example
 * import { logger } from './js/logger.js';
 * 
 * logger.log('일반 로그');      // 개발 환경에서만 출력
 * logger.warn('경고 로그');     // 개발 환경에서만 출력
 * logger.error('에러 로그');    // 항상 출력
 * logger.debug('디버그 로그');  // 개발 환경에서만 출력
 */
export const logger = {
    /**
     * 일반 로그 (개발 환경에서만 출력)
     * @param {...any} args - 로그 인자들
     */
    log: (...args) => {
        if (isDev) console.log(...args);
        addToDebugPanel('log', args);
        updateDebugStats();
    },

    /**
     * 경고 로그 (개발 환경에서만 출력)
     * @param {...any} args - 로그 인자들
     */
    warn: (...args) => {
        if (isDev) console.warn(...args);
        addToDebugPanel('warn', args);
        updateDebugStats();
    },

    /**
     * 에러 로그 (항상 출력 - 모니터링 필요)
     * @param {...any} args - 로그 인자들
     */
    error: (...args) => {
        console.error(...args);
        addToDebugPanel('error', args);
        updateDebugStats();
        // 추후 에러 모니터링 서비스 연동 가능
        // sendToErrorMonitoring(args);
    },

    /**
     * 디버그 로그 (개발 환경에서만 출력)
     * @param {...any} args - 로그 인자들
     */
    debug: (...args) => {
        if (isDev) console.debug(...args);
        addToDebugPanel('debug', args);
        updateDebugStats();
    },

    /**
     * 그룹 로그 시작 (개발 환경에서만 출력)
     * @param {string} label - 그룹 라벨
     */
    group: (label) => {
        if (isDev) console.group(label);
    },

    /**
     * 그룹 로그 종료 (개발 환경에서만 출력)
     */
    groupEnd: () => {
        if (isDev) console.groupEnd();
    },

    /**
     * 테이블 형식 로그 (개발 환경에서만 출력)
     * @param {any} data - 테이블로 표시할 데이터
     */
    table: (data) => {
        if (isDev) console.table(data);
    },

    /**
     * 시간 측정 시작 (개발 환경에서만 출력)
     * @param {string} label - 타이머 라벨
     */
    time: (label) => {
        if (isDev) console.time(label);
    },

    /**
     * 시간 측정 종료 (개발 환경에서만 출력)
     * @param {string} label - 타이머 라벨
     */
    timeEnd: (label) => {
        if (isDev) console.timeEnd(label);
    },
    
    /**
     * 디버그 모드 여부 확인
     * @returns {boolean}
     */
    isDebugMode: () => isDebugMode,
};

export default logger;
