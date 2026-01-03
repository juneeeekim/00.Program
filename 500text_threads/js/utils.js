/**
 * 유틸리티 함수 모음
 * @module Utils
 */

/**
 * 내용에서 제목 추출 (첫 줄 또는 첫 50자)
 * @param {string} content - 추출할 내용
 * @returns {string} 추출된 제목
 */
export function extractTitleFromContent(content) {
    if (!content) return '제목 없음';
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length > 0) {
        return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    }
    return content.length > 50 ? content.substring(0, 50) + '...' : content;
}

/**
 * HTML 이스케이프 함수 (줄바꿈 보존)
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 HTML 문자열
 */
export function escapeHtml(text) {
    if (!text) return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>'); // 줄바꿈을 <br> 태그로 변환
}

/**
 * 디바운스 함수
 * @param {Function} func - 실행할 함수
 * @param {number} wait - 대기 시간 (ms)
 * @returns {Function} 디바운스된 함수
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 날짜 포맷팅 (YYYY. MM. DD. 오전/오후 HH:MM)
 * @param {Date|Object} dateObj - Date 객체 또는 Firestore Timestamp
 * @returns {string} 포맷팅된 날짜 문자열
 */
export function formatDate(dateObj) {
    if (!dateObj) return '날짜 없음';
    
    const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    
    // 유효하지 않은 날짜 체크
    if (isNaN(date.getTime())) return '날짜 없음';

    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * 지수 백오프를 적용한 재시도 유틸리티
 * @param {Function} fn - 실행할 비동기 함수
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @param {number} baseDelayMs - 기본 대기 시간 (기본값: 1000ms)
 */
export async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      // Firestore 에러 코드 중 재시도 가능한 것들
      const retryableCodes = [
        "unavailable", // 서비스 일시 불가
        "resource-exhausted", // 할당량 초과
        "deadline-exceeded", // 타임아웃
        "aborted", // 트랜잭션 충돌
        "internal", // 내부 오류
      ];
      
      const isRetryable = retryableCodes.includes(error.code) || 
                          error.message === 'Failed to fetch' || // 네트워크 오류
                          !error.code; // 코드가 없는 일반 네트워크 에러 가정

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[Retry] 시도 ${attempt + 1}/${maxRetries} (${delayMs}ms 후 재시도)... 에러: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
