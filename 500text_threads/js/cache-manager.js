/**
 * ============================================================================
 * CacheManager - 세션 내 메모리 캐싱 관리
 * ============================================================================
 *
 * Firebase 비용 최적화를 위한 클라이언트 사이드 캐싱 레이어
 *
 * [기능]
 * - LRU(Least Recently Used) 정책 기반 캐시 관리
 * - TTL(Time To Live) 기반 자동 만료
 * - Firestore Timestamp 직렬화 지원
 * - 캐시 통계 (hit rate) 제공
 *
 * [사용처]
 * - loadSavedTexts(): 저장된 글 목록 캐싱
 * - 탭 전환 시 중복 API 호출 방지
 *
 * @version 1.0.0
 * @date 2026-01-21
 * @author Tech Lead 김진호
 * ============================================================================
 */

export class CacheManager {
  // ========================================================================
  // SECTION 1: 생성자 및 초기화
  // ========================================================================

  /**
   * CacheManager 생성자
   *
   * @param {Object} options - 캐시 설정
   * @param {number} options.ttlMs - 캐시 만료 시간 (기본 5분 = 300000ms)
   * @param {number} options.maxSize - 최대 캐시 항목 수 (기본 100)
   */
  constructor(options = {}) {
    this.ttl = options.ttlMs || 300000; // 5분
    this.maxSize = options.maxSize || 100;
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };

    console.log(
      "[CacheManager] 초기화 완료 - TTL:",
      this.ttl,
      "ms, MaxSize:",
      this.maxSize,
    );
  }

  // ========================================================================
  // SECTION 2: 캐시 조회 (LRU 정책)
  // ========================================================================

  /**
   * 캐시에서 데이터 조회 (LRU 정책 적용)
   *
   * @param {string} key - 캐시 키
   * @returns {*|null} 캐시된 데이터 또는 null
   */
  get(key) {
    try {
      const item = this.cache.get(key);

      // 캐시 미스: 항목이 없음
      if (!item) {
        this.stats.misses++;
        return null;
      }

      // TTL 만료 체크
      if (Date.now() - item.timestamp > this.ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        console.log("[CacheManager] TTL 만료:", key);
        return null;
      }

      // LRU: 접근 시 순서 갱신 (Map은 삽입 순서 유지)
      this.cache.delete(key);
      this.cache.set(key, item);

      this.stats.hits++;
      console.log("[CacheManager] 캐시 히트:", key);
      return item.data;
    } catch (e) {
      console.warn("[CacheManager] get 오류:", e.message);
      return null;
    }
  }

  // ========================================================================
  // SECTION 3: 캐시 저장 (LRU 정책)
  // ========================================================================

  /**
   * 캐시에 데이터 저장 (LRU 정책 적용)
   *
   * @param {string} key - 캐시 키
   * @param {*} data - 저장할 데이터
   */
  set(key, data) {
    try {
      // 최대 크기 초과 시 가장 오래된 항목 제거 (LRU)
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
        console.log("[CacheManager] LRU 제거:", oldestKey);
      }

      this.cache.set(key, {
        data: this._serializeData(data),
        timestamp: Date.now(),
      });

      console.log(
        "[CacheManager] 캐시 저장:",
        key,
        "- 현재 크기:",
        this.cache.size,
      );
    } catch (e) {
      console.warn("[CacheManager] set 오류:", e.message);
    }
  }

  // ========================================================================
  // SECTION 4: 캐시 무효화
  // ========================================================================

  /**
   * 특정 키의 캐시 무효화
   *
   * @param {string} key - 캐시 키
   */
  invalidate(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log("[CacheManager] 캐시 무효화:", key);
    }
  }

  /**
   * 패턴에 맞는 모든 캐시 무효화
   *
   * @param {string} pattern - 검색 패턴 (substring 매칭)
   */
  invalidatePattern(pattern) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      console.log(
        "[CacheManager] 패턴 무효화:",
        pattern,
        "- 삭제:",
        count,
        "개",
      );
    }
  }

  /**
   * 전체 캐시 클리어
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    console.log("[CacheManager] 전체 클리어 - 삭제:", size, "개");
  }

  // ========================================================================
  // SECTION 5: 캐시 통계
  // ========================================================================

  /**
   * 캐시 통계 반환
   *
   * @returns {{ hits: number, misses: number, hitRate: string, size: number }}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate:
        total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + "%" : "N/A",
      size: this.cache.size,
    };
  }

  // ========================================================================
  // SECTION 6: 내부 유틸리티 (직렬화)
  // ========================================================================

  /**
   * Firestore Timestamp를 직렬화 가능한 형태로 변환
   *
   * @private
   * @param {*} data - 원본 데이터
   * @returns {*} 직렬화된 데이터
   */
  _serializeData(data) {
    if (Array.isArray(data)) {
      return data.map((item) => this._serializeItem(item));
    }
    return this._serializeItem(data);
  }

  /**
   * 단일 항목 직렬화
   *
   * @private
   * @param {*} item - 원본 항목
   * @returns {*} 직렬화된 항목
   */
  _serializeItem(item) {
    if (!item || typeof item !== "object") return item;

    const serialized = { ...item };

    // Timestamp → ISO 문자열 변환 (원본 보존 + ISO 추가)
    if (serialized.createdAt?.toDate) {
      serialized._createdAtISO = serialized.createdAt.toDate().toISOString();
    }
    if (serialized.updatedAt?.toDate) {
      serialized._updatedAtISO = serialized.updatedAt.toDate().toISOString();
    }

    return serialized;
  }
}
