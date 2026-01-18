/**
 * ==================== FilterManager ====================
 * 필터/검색 상태 관리 모듈
 *
 * [역할]
 * - 저장된 글 필터 상태 관리 (주제, 소스, SNS 플랫폼)
 * - 트래킹 탭 필터 상태 관리 (정렬, 상태, 검색, 범위)
 * - localStorage 상태 동기화
 * - 디바운스 타이머 관리
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - Constants (STORAGE_KEYS)
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team - Phase 9
 */

import { Constants } from "./constants.js";

export class FilterManager {
  /**
   * FilterManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    // ==================== 저장된 글 필터 상태 ====================
    /**
     * 현재 선택된 주제 필터 (작성글용)
     * - 'all': 전체
     * - 특정 주제명: 해당 주제만 표시
     */
    this._currentTopicFilter = "all";

    /**
     * 현재 선택된 소스 필터 (레퍼런스용)
     * - 'all': 전체
     * - 특정 소스명: 해당 소스만 표시
     */
    this._currentSourceFilter = "all";

    /**
     * 현재 선택된 SNS 필터 모드 (작성글용)
     * - 'all': 전체
     * - 'has': 특정 플랫폼 포함
     * - 'not-has': 특정 플랫폼 미포함
     */
    this._currentSnsFilterMode = "all";

    /**
     * 현재 선택된 SNS 플랫폼 ID (작성글용)
     * - '': 선택 안함
     * - 플랫폼 ID: 특정 플랫폼
     */
    this._currentSnsFilterPlatform = "";

    // ==================== 트래킹 탭 필터 상태 ====================
    /**
     * 트래킹 정렬 방식
     * - localStorage에서 복원
     * - 기본값: 'updatedDesc' (최근 업데이트순)
     */
    this._trackingSort =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_SORT) ||
      "updatedDesc";

    /**
     * 트래킹 상태 필터
     * - 'all': 전체
     * - 'active': 활성화된 항목
     * - 'inactive': 비활성화된 항목
     * - 'hasData': 데이터 있는 항목
     * - 'noData': 데이터 없는 항목
     */
    this._trackingStatusFilter =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_STATUS) || "all";

    /**
     * 트래킹 검색어
     * - localStorage에서 복원
     */
    this._trackingSearch =
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_SEARCH) || "";

    /**
     * 트래킹 수치 범위 필터
     * - minViews, maxViews, minLikes, maxLikes 등
     * - localStorage에서 JSON으로 복원
     */
    this._rangeFilters = JSON.parse(
      localStorage.getItem(Constants.STORAGE_KEYS.TRACKING_RANGES) || "{}"
    );

    // ==================== 디바운스 타이머 ====================
    /**
     * 트래킹 검색 디바운스 타이머
     * - 과도한 검색 요청 방지
     */
    this._trackingSearchDebounce = null;

    console.log("✅ FilterManager 초기화 완료");
  }

  // ==================== Getter/Setter: currentTopicFilter ====================

  /**
   * 주제 필터 getter
   * @returns {string} 현재 주제 필터 값
   */
  get currentTopicFilter() {
    return this._currentTopicFilter;
  }

  /**
   * 주제 필터 setter
   * @param {string} value - 주제 필터 값
   */
  set currentTopicFilter(value) {
    this._currentTopicFilter = value;
  }

  // ==================== Getter/Setter: currentSourceFilter ====================

  /**
   * 소스 필터 getter
   * @returns {string} 현재 소스 필터 값
   */
  get currentSourceFilter() {
    return this._currentSourceFilter;
  }

  /**
   * 소스 필터 setter
   * @param {string} value - 소스 필터 값
   */
  set currentSourceFilter(value) {
    this._currentSourceFilter = value;
  }

  // ==================== Getter/Setter: currentSnsFilterMode ====================

  /**
   * SNS 필터 모드 getter
   * @returns {string} 현재 SNS 필터 모드
   */
  get currentSnsFilterMode() {
    return this._currentSnsFilterMode;
  }

  /**
   * SNS 필터 모드 setter
   * @param {string} value - SNS 필터 모드
   */
  set currentSnsFilterMode(value) {
    this._currentSnsFilterMode = value;
  }

  // ==================== Getter/Setter: currentSnsFilterPlatform ====================

  /**
   * SNS 플랫폼 필터 getter
   * @returns {string} 현재 SNS 플랫폼 ID
   */
  get currentSnsFilterPlatform() {
    return this._currentSnsFilterPlatform;
  }

  /**
   * SNS 플랫폼 필터 setter
   * @param {string} value - SNS 플랫폼 ID
   */
  set currentSnsFilterPlatform(value) {
    this._currentSnsFilterPlatform = value;
  }

  // ==================== Getter/Setter: trackingSort ====================

  /**
   * 트래킹 정렬 getter
   * @returns {string} 현재 정렬 방식
   */
  get trackingSort() {
    return this._trackingSort;
  }

  /**
   * 트래킹 정렬 setter
   * - localStorage에 저장
   * @param {string} value - 정렬 방식
   */
  set trackingSort(value) {
    this._trackingSort = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_SORT, value);
  }

  // ==================== Getter/Setter: trackingStatusFilter ====================

  /**
   * 트래킹 상태 필터 getter
   * @returns {string} 현재 상태 필터
   */
  get trackingStatusFilter() {
    return this._trackingStatusFilter;
  }

  /**
   * 트래킹 상태 필터 setter
   * - localStorage에 저장
   * @param {string} value - 상태 필터
   */
  set trackingStatusFilter(value) {
    this._trackingStatusFilter = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_STATUS, value);
  }

  // ==================== Getter/Setter: trackingSearch ====================

  /**
   * 트래킹 검색어 getter
   * @returns {string} 현재 검색어
   */
  get trackingSearch() {
    return this._trackingSearch;
  }

  /**
   * 트래킹 검색어 setter
   * - localStorage에 저장
   * @param {string} value - 검색어
   */
  set trackingSearch(value) {
    this._trackingSearch = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_SEARCH, value);
  }

  // ==================== Getter/Setter: rangeFilters ====================

  /**
   * 범위 필터 getter
   * @returns {Object} 범위 필터 객체
   */
  get rangeFilters() {
    return this._rangeFilters;
  }

  /**
   * 범위 필터 setter
   * - localStorage에 JSON으로 저장
   * @param {Object} value - 범위 필터 객체
   */
  set rangeFilters(value) {
    this._rangeFilters = value;
    localStorage.setItem(
      Constants.STORAGE_KEYS.TRACKING_RANGES,
      JSON.stringify(value)
    );
  }

  // ==================== Getter/Setter: trackingSearchDebounce ====================

  /**
   * 트래킹 검색 디바운스 타이머 getter
   * @returns {number|null} 타이머 ID
   */
  get trackingSearchDebounce() {
    return this._trackingSearchDebounce;
  }

  /**
   * 트래킹 검색 디바운스 타이머 setter
   * @param {number|null} value - 타이머 ID
   */
  set trackingSearchDebounce(value) {
    this._trackingSearchDebounce = value;
  }

  // ==================== 범위 필터 유틸리티 메서드 ====================

  /**
   * 특정 범위 필터 값 설정
   * @param {string} key - 필터 키 (예: 'minViews', 'maxLikes')
   * @param {number|string} value - 필터 값
   */
  setRangeFilter(key, value) {
    if (value === "" || value === null || value === undefined) {
      delete this._rangeFilters[key];
    } else {
      this._rangeFilters[key] = Number(value) || 0;
    }
    localStorage.setItem(
      Constants.STORAGE_KEYS.TRACKING_RANGES,
      JSON.stringify(this._rangeFilters)
    );
  }

  /**
   * 특정 범위 필터 값 조회
   * @param {string} key - 필터 키
   * @returns {number|undefined} 필터 값
   */
  getRangeFilter(key) {
    return this._rangeFilters[key];
  }

  /**
   * 모든 범위 필터 초기화
   */
  clearRangeFilters() {
    this._rangeFilters = {};
    localStorage.setItem(
      Constants.STORAGE_KEYS.TRACKING_RANGES,
      JSON.stringify({})
    );
  }

  // ==================== 필터 초기화 메서드 ====================

  /**
   * 저장된 글 필터 초기화
   */
  resetSavedFilters() {
    this._currentTopicFilter = "all";
    this._currentSourceFilter = "all";
    this._currentSnsFilterMode = "all";
    this._currentSnsFilterPlatform = "";
    console.log("✅ 저장된 글 필터 초기화 완료");
  }

  /**
   * 트래킹 필터 초기화
   */
  resetTrackingFilters() {
    this._trackingSort = "updatedDesc";
    this._trackingStatusFilter = "all";
    this._trackingSearch = "";
    this._rangeFilters = {};

    // localStorage 초기화
    localStorage.setItem(
      Constants.STORAGE_KEYS.TRACKING_SORT,
      "updatedDesc"
    );
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_STATUS, "all");
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_SEARCH, "");
    localStorage.setItem(
      Constants.STORAGE_KEYS.TRACKING_RANGES,
      JSON.stringify({})
    );

    console.log("✅ 트래킹 필터 초기화 완료");
  }

  /**
   * 모든 필터 초기화
   */
  resetAllFilters() {
    this.resetSavedFilters();
    this.resetTrackingFilters();
    console.log("✅ 모든 필터 초기화 완료");
  }

  // ==================== 디바운스 유틸리티 ====================

  /**
   * 트래킹 검색 디바운스 클리어
   */
  clearTrackingSearchDebounce() {
    if (this._trackingSearchDebounce) {
      clearTimeout(this._trackingSearchDebounce);
      this._trackingSearchDebounce = null;
    }
  }

  // ==================== [2026-01-18] 함수 형태 Getter/Setter 추가 ====================
  // script.js에서 getXxx()/setXxx() 패턴으로 호출하므로 함수 별칭 제공

  getCurrentTopicFilter() { return this._currentTopicFilter; }
  setCurrentTopicFilter(value) { this._currentTopicFilter = value; }

  getCurrentSourceFilter() { return this._currentSourceFilter; }
  setCurrentSourceFilter(value) { this._currentSourceFilter = value; }

  getCurrentSnsFilterMode() { return this._currentSnsFilterMode; }
  setCurrentSnsFilterMode(value) { this._currentSnsFilterMode = value; }

  getCurrentSnsFilterPlatform() { return this._currentSnsFilterPlatform; }
  setCurrentSnsFilterPlatform(value) { this._currentSnsFilterPlatform = value; }

  getTrackingSort() { return this._trackingSort; }
  setTrackingSort(value) { 
    this._trackingSort = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_SORT, value);
  }

  getTrackingStatusFilter() { return this._trackingStatusFilter; }
  setTrackingStatusFilter(value) { 
    this._trackingStatusFilter = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_STATUS, value);
  }

  getTrackingSearch() { return this._trackingSearch; }
  setTrackingSearch(value) { 
    this._trackingSearch = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_SEARCH, value);
  }

  getRangeFilters() { return this._rangeFilters; }
  setRangeFilters(value) { 
    this._rangeFilters = value;
    localStorage.setItem(Constants.STORAGE_KEYS.TRACKING_RANGES, JSON.stringify(value));
  }

  getTrackingSearchDebounce() { return this._trackingSearchDebounce; }
  setTrackingSearchDebounce(value) { this._trackingSearchDebounce = value; }
}
