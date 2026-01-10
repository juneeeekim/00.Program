/**
 * ============================================
 * Mobile Debug Helper
 * ============================================
 *
 * iOS Safari 및 모바일 브라우저에서 콘솔 접근이 어려울 때
 * 화면에 에러와 로그를 표시하는 디버깅 도구
 *
 * [P3-01] Safari 원격 디버깅 지원을 위한 보조 도구
 *
 * 사용법:
 *   - URL에 ?debug=true 추가하여 디버그 모드 활성화
 *   - 화면 우하단의 디버그 패널에서 로그 확인
 *   - 패널 헤더 클릭하여 접기/펼치기
 *
 * @version 1.0.0
 * @date 2026-01-10
 */

(function() {
  'use strict';

  // ============================================
  // [설정] 디버그 모드 활성화 조건
  // ============================================
  const DEBUG_ENABLED = (
    window.location.search.includes('debug=true') ||
    window.localStorage.getItem('mobileDebug') === 'true'
  );

  // 디버그 모드가 비활성화되면 아무것도 하지 않음
  if (!DEBUG_ENABLED) {
    console.log('[Mobile Debug] 디버그 모드 비활성화됨. URL에 ?debug=true 추가하여 활성화');
    return;
  }

  // ============================================
  // [상수] 스타일 및 설정값
  // ============================================
  const CONFIG = {
    MAX_LOGS: 100,           // 최대 로그 개수
    PANEL_WIDTH: '320px',    // 패널 너비
    PANEL_MAX_HEIGHT: '40vh', // 패널 최대 높이
    LOG_COLORS: {
      log: '#e0e0e0',
      info: '#64b5f6',
      warn: '#ffb74d',
      error: '#ef5350',
      debug: '#81c784'
    }
  };

  // ============================================
  // [변수] 상태 관리
  // ============================================
  let debugPanel = null;
  let logContainer = null;
  let isMinimized = false;
  let logCount = 0;

  // 원본 콘솔 메서드 백업
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  // ============================================
  // [함수] 디버그 패널 생성
  // ============================================
  function createDebugPanel() {
    // 패널 컨테이너 생성
    debugPanel = document.createElement('div');
    debugPanel.id = 'mobile-debug-panel';
    debugPanel.innerHTML = `
      <div id="mobile-debug-header">
        <span id="mobile-debug-title">🔧 Debug Panel</span>
        <span id="mobile-debug-count">(0)</span>
        <button id="mobile-debug-clear" title="로그 지우기">🗑️</button>
        <button id="mobile-debug-toggle" title="접기/펼치기">▼</button>
      </div>
      <div id="mobile-debug-logs"></div>
    `;

    // 스타일 적용
    const style = document.createElement('style');
    style.textContent = `
      /* ===== [Mobile Debug Panel] 메인 컨테이너 ===== */
      #mobile-debug-panel {
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: ${CONFIG.PANEL_WIDTH};
        max-width: calc(100vw - 20px);
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #444;
        border-radius: 8px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        transition: height 0.3s ease;
      }

      /* ===== [Mobile Debug Panel] 헤더 ===== */
      #mobile-debug-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #2d2d2d;
        border-bottom: 1px solid #444;
        cursor: pointer;
        user-select: none;
      }

      #mobile-debug-title {
        flex: 1;
        color: #fff;
        font-weight: bold;
      }

      #mobile-debug-count {
        color: #888;
        font-size: 10px;
      }

      #mobile-debug-header button {
        background: none;
        border: none;
        color: #888;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s;
      }

      #mobile-debug-header button:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      #mobile-debug-header button:active {
        background: rgba(255, 255, 255, 0.2);
      }

      /* ===== [Mobile Debug Panel] 로그 영역 ===== */
      #mobile-debug-logs {
        max-height: ${CONFIG.PANEL_MAX_HEIGHT};
        overflow-y: auto;
        padding: 8px;
        -webkit-overflow-scrolling: touch;
      }

      #mobile-debug-logs.minimized {
        display: none;
      }

      /* ===== [Mobile Debug Panel] 개별 로그 ===== */
      .debug-log-item {
        padding: 4px 8px;
        margin-bottom: 4px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
        word-break: break-all;
        line-height: 1.4;
      }

      .debug-log-item:last-child {
        margin-bottom: 0;
      }

      .debug-log-time {
        color: #666;
        margin-right: 6px;
        font-size: 10px;
      }

      .debug-log-type {
        font-weight: bold;
        margin-right: 6px;
        text-transform: uppercase;
        font-size: 9px;
      }

      .debug-log-content {
        color: inherit;
      }

      /* ===== [Mobile Debug Panel] 로그 타입별 색상 ===== */
      .debug-log-item.log { color: ${CONFIG.LOG_COLORS.log}; }
      .debug-log-item.info { color: ${CONFIG.LOG_COLORS.info}; }
      .debug-log-item.warn { color: ${CONFIG.LOG_COLORS.warn}; background: rgba(255, 183, 77, 0.1); }
      .debug-log-item.error { color: ${CONFIG.LOG_COLORS.error}; background: rgba(239, 83, 80, 0.15); }
      .debug-log-item.debug { color: ${CONFIG.LOG_COLORS.debug}; }

      /* ===== [Mobile Debug Panel] 에러 스택 ===== */
      .debug-error-stack {
        margin-top: 4px;
        padding: 4px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        font-size: 10px;
        color: #999;
        white-space: pre-wrap;
        max-height: 100px;
        overflow-y: auto;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(debugPanel);

    // 요소 참조 저장
    logContainer = debugPanel.querySelector('#mobile-debug-logs');

    // 이벤트 리스너 등록
    setupEventListeners();

    // 초기화 완료 메시지
    addLog('info', '🚀 Mobile Debug Panel 초기화 완료');
    addLog('info', `📱 User Agent: ${navigator.userAgent.substring(0, 80)}...`);
  }

  // ============================================
  // [함수] 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 헤더 클릭 - 접기/펼치기
    const header = debugPanel.querySelector('#mobile-debug-header');
    header.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') {
        toggleMinimize();
      }
    });

    // 접기/펼치기 버튼
    const toggleBtn = debugPanel.querySelector('#mobile-debug-toggle');
    toggleBtn.addEventListener('click', toggleMinimize);

    // 로그 지우기 버튼
    const clearBtn = debugPanel.querySelector('#mobile-debug-clear');
    clearBtn.addEventListener('click', clearLogs);
  }

  // ============================================
  // [함수] 패널 접기/펼치기
  // ============================================
  function toggleMinimize() {
    isMinimized = !isMinimized;
    const toggleBtn = debugPanel.querySelector('#mobile-debug-toggle');
    toggleBtn.textContent = isMinimized ? '▲' : '▼';
    logContainer.classList.toggle('minimized', isMinimized);
  }

  // ============================================
  // [함수] 로그 지우기
  // ============================================
  function clearLogs() {
    logContainer.innerHTML = '';
    logCount = 0;
    updateLogCount();
    addLog('info', '🧹 로그가 지워졌습니다');
  }

  // ============================================
  // [함수] 로그 개수 업데이트
  // ============================================
  function updateLogCount() {
    const countEl = debugPanel.querySelector('#mobile-debug-count');
    countEl.textContent = `(${logCount})`;
  }

  // ============================================
  // [함수] 로그 추가
  // ============================================
  function addLog(type, ...args) {
    if (!logContainer) return;

    // 로그 개수 제한
    if (logCount >= CONFIG.MAX_LOGS) {
      const firstLog = logContainer.querySelector('.debug-log-item');
      if (firstLog) {
        firstLog.remove();
        logCount--;
      }
    }

    // 시간 포맷
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 로그 내용 포맷
    let content = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    // 에러 스택 추출
    let stackHtml = '';
    if (type === 'error' && args[0] instanceof Error) {
      const error = args[0];
      if (error.stack) {
        stackHtml = `<div class="debug-error-stack">${escapeHtml(error.stack)}</div>`;
      }
    }

    // 로그 요소 생성
    const logItem = document.createElement('div');
    logItem.className = `debug-log-item ${type}`;
    logItem.innerHTML = `
      <span class="debug-log-time">${timeStr}</span>
      <span class="debug-log-type">[${type}]</span>
      <span class="debug-log-content">${escapeHtml(content)}</span>
      ${stackHtml}
    `;

    logContainer.appendChild(logItem);
    logCount++;
    updateLogCount();

    // 자동 스크롤
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // ============================================
  // [함수] HTML 이스케이프
  // ============================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // [함수] 콘솔 메서드 오버라이드
  // ============================================
  function overrideConsoleMethods() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
      console[method] = function(...args) {
        // 원본 콘솔에도 출력
        originalConsole[method](...args);
        // 디버그 패널에 추가
        addLog(method, ...args);
      };
    });
  }

  // ============================================
  // [함수] 전역 에러 핸들러 등록
  // ============================================
  function setupGlobalErrorHandlers() {
    // 일반 에러 핸들러
    window.addEventListener('error', (event) => {
      addLog('error', `❌ Error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Promise 거부 핸들러
    window.addEventListener('unhandledrejection', (event) => {
      addLog('error', `❌ Unhandled Promise Rejection:`, event.reason);
    });
  }

  // ============================================
  // [초기화] DOM 로드 후 패널 생성
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    createDebugPanel();
    overrideConsoleMethods();
    setupGlobalErrorHandlers();
    originalConsole.log('[Mobile Debug] 🟢 디버그 패널 활성화됨');
  }

})();
