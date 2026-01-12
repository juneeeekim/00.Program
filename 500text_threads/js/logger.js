/**
 * ============================================================
 * 환경별 로깅 유틸리티 모듈
 * @module Logger
 * @version 1.0.0
 * @date 2026-01-13
 * 
 * [P4-01] 프로덕션 환경에서 콘솔 로그 노출 방지
 * - 개발 환경(localhost)에서만 로그 출력
 * - 에러 로그는 항상 출력 (모니터링 필요)
 * - 추후 에러 모니터링 서비스 연동 가능
 * ============================================================
 */

/**
 * 개발 환경 여부 판별
 * - localhost 또는 127.0.0.1에서 실행 시 개발 환경으로 판단
 * @type {boolean}
 */
const isDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
);

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
    },

    /**
     * 경고 로그 (개발 환경에서만 출력)
     * @param {...any} args - 로그 인자들
     */
    warn: (...args) => {
        if (isDev) console.warn(...args);
    },

    /**
     * 에러 로그 (항상 출력 - 모니터링 필요)
     * @param {...any} args - 로그 인자들
     */
    error: (...args) => {
        console.error(...args);
        // 추후 에러 모니터링 서비스 연동 가능
        // sendToErrorMonitoring(args);
    },

    /**
     * 디버그 로그 (개발 환경에서만 출력)
     * @param {...any} args - 로그 인자들
     */
    debug: (...args) => {
        if (isDev) console.debug(...args);
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
};

export default logger;
