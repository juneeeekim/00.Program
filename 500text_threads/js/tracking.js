/**
 * ============================================================================
 * TrackingManager - 트래킹 시스템 관리 모듈
 * ============================================================================
 * 
 * [Phase 1: P1-01] 트래킹 관련 프로퍼티 및 상태 관리
 * 
 * 이 모듈은 script.js에서 분리된 트래킹 시스템을 담당합니다.
 * - 트래킹 포스트 목록 관리
 * - Chart.js 인스턴스 관리
 * - 차트 모드/범위/스케일 설정
 * - 일괄 선택 모드 상태 관리
 * 
 * @author Refactoring Team
 * @version 1.0.0
 * @since 2026-01-14
 * 
 * 의존성:
 * - DualTextWriter.CONFIG (메인 클래스 설정 상수)
 * - Chart.js (차트 라이브러리)
 * - Firebase Firestore (데이터 저장소)
 */

/**
 * TrackingManager 클래스
 * 
 * 트래킹 시스템의 상태와 동작을 관리하는 클래스입니다.
 * DualTextWriter 메인 클래스와 연동하여 동작합니다.
 * 
 * @class TrackingManager
 */
export class TrackingManager {
  /**
   * TrackingManager 생성자
   * 
   * @param {DualTextWriter} mainApp - 메인 애플리케이션 인스턴스
   * @throws {Error} mainApp이 제공되지 않으면 에러 발생
   */
  constructor(mainApp) {
    // ========================================
    // [P1-01] 메인 앱 참조 저장
    // ========================================
    if (!mainApp) {
      throw new Error('[TrackingManager] mainApp 인스턴스가 필요합니다.');
    }
    this.app = mainApp;

    // ========================================
    // [P1-01] 트래킹 포스트 관련 프로퍼티
    // ========================================
    /** @type {Array} 트래킹 중인 포스트 목록 */
    this.trackingPosts = [];
    
    /** @type {Object|null} 현재 트래킹 중인 포스트 */
    this.currentTrackingPost = null;
    
    /** @type {Array} 포스트 선택기용 전체 포스트 목록 */
    this.allTrackingPostsForSelector = [];

    // ========================================
    // [P1-01] Chart.js 관련 프로퍼티
    // ========================================
    /** @type {Chart|null} Chart.js 인스턴스 */
    this.trackingChart = null;
    
    /** @type {string} 차트 모드: 'total' (전체 총합) 또는 'individual' (개별 포스트) */
    this.chartMode = 'total';
    
    /** @type {string|null} 개별 포스트 모드에서 선택된 포스트 ID */
    this.selectedChartPostId = null;
    
    /** @type {string} 차트 범위: '7d' | '30d' | 'all' */
    this.chartRange = '7d';
    
    /** @type {string} 스케일 모드: 'combined' | 'split' */
    this.scaleMode = 'combined';

    // ========================================
    // [P1-01] 일괄 삭제 관련 상태
    // ========================================
    /** @type {boolean} 일괄 선택 모드 활성화 여부 */
    this.isBatchSelectMode = false;
    
    /** @type {Array<number>} 선택된 메트릭 인덱스 배열 */
    this.selectedMetricIndices = [];

    console.log('✅ [TrackingManager] 초기화 완료');
  }

  // ========================================
  // [P1-01] Getter/Setter 메서드
  // ========================================

  /**
   * 트래킹 포스트 목록 반환
   * @returns {Array} 트래킹 포스트 배열
   */
  getTrackingPosts() {
    return this.trackingPosts;
  }

  /**
   * 트래킹 포스트 목록 설정
   * @param {Array} posts - 트래킹 포스트 배열
   */
  setTrackingPosts(posts) {
    this.trackingPosts = Array.isArray(posts) ? posts : [];
  }

  /**
   * 현재 트래킹 포스트 반환
   * @returns {Object|null} 현재 트래킹 포스트
   */
  getCurrentTrackingPost() {
    return this.currentTrackingPost;
  }

  /**
   * 현재 트래킹 포스트 설정
   * @param {Object|null} post - 트래킹 포스트 객체
   */
  setCurrentTrackingPost(post) {
    this.currentTrackingPost = post;
  }

  /**
   * Chart.js 인스턴스 반환
   * @returns {Chart|null} Chart.js 인스턴스
   */
  getTrackingChart() {
    return this.trackingChart;
  }

  /**
   * Chart.js 인스턴스 설정
   * @param {Chart|null} chart - Chart.js 인스턴스
   */
  setTrackingChart(chart) {
    this.trackingChart = chart;
  }

  /**
   * 차트 모드 반환
   * @returns {string} 차트 모드 ('total' | 'individual')
   */
  getChartMode() {
    return this.chartMode;
  }

  /**
   * 차트 모드 설정
   * @param {string} mode - 차트 모드 ('total' | 'individual')
   */
  setChartMode(mode) {
    if (mode === 'total' || mode === 'individual') {
      this.chartMode = mode;
    } else {
      console.warn(`[TrackingManager] 유효하지 않은 차트 모드: ${mode}`);
    }
  }

  /**
   * 선택된 차트 포스트 ID 반환
   * @returns {string|null} 선택된 포스트 ID
   */
  getSelectedChartPostId() {
    return this.selectedChartPostId;
  }

  /**
   * 선택된 차트 포스트 ID 설정
   * @param {string|null} postId - 포스트 ID
   */
  setSelectedChartPostId(postId) {
    this.selectedChartPostId = postId;
  }

  /**
   * 차트 범위 반환
   * @returns {string} 차트 범위 ('7d' | '30d' | 'all')
   */
  getChartRange() {
    return this.chartRange;
  }

  /**
   * 차트 범위 설정
   * @param {string} range - 차트 범위 ('7d' | '30d' | 'all')
   */
  setChartRange(range) {
    if (['7d', '30d', 'all'].includes(range)) {
      this.chartRange = range;
    } else {
      console.warn(`[TrackingManager] 유효하지 않은 차트 범위: ${range}`);
    }
  }

  /**
   * 스케일 모드 반환
   * @returns {string} 스케일 모드 ('combined' | 'split')
   */
  getScaleMode() {
    return this.scaleMode;
  }

  /**
   * 스케일 모드 설정
   * @param {string} mode - 스케일 모드 ('combined' | 'split')
   */
  setScaleMode(mode) {
    if (mode === 'combined' || mode === 'split') {
      this.scaleMode = mode;
    } else {
      console.warn(`[TrackingManager] 유효하지 않은 스케일 모드: ${mode}`);
    }
  }


  // ========================================
  // [P2-04] Chart post selector population
  // ========================================

  populatePostSelector() {
    if (!this.trackingPosts || this.trackingPosts.length === 0) return;

    this.allTrackingPostsForSelector = [...this.trackingPosts].sort((a, b) => {
      const dateA = a.postedAt instanceof Date
        ? a.postedAt
        : a.postedAt?.toDate
        ? a.postedAt.toDate()
        : new Date(0);
      const dateB = b.postedAt instanceof Date
        ? b.postedAt
        : b.postedAt?.toDate
        ? b.postedAt.toDate()
        : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    if (this.app && this.app.renderPostSelectorDropdown) {
      this.app.renderPostSelectorDropdown("");
    }

    if (this.selectedChartPostId) {
      const selectedPost = this.trackingPosts.find(
        (post) => post.id === this.selectedChartPostId
      );
      if (selectedPost) {
        const searchInput = document.getElementById("chart-post-search");
        if (searchInput) {
          const contentPreview =
            selectedPost.content.length > 50
              ? selectedPost.content.substring(0, 50) + "..."
              : selectedPost.content;
          searchInput.value = contentPreview;
        }
      }
    }
  }

  /**
   * 일괄 선택 모드 상태 반환
   * @returns {boolean} 일괄 선택 모드 활성화 여부
   */
  getIsBatchSelectMode() {
    return this.isBatchSelectMode;
  }

  /**
   * 일괄 선택 모드 설정
   * @param {boolean} isActive - 활성화 여부
   */
  setIsBatchSelectMode(isActive) {
    this.isBatchSelectMode = Boolean(isActive);
  }

  /**
   * 선택된 메트릭 인덱스 배열 반환
   * @returns {Array<number>} 선택된 메트릭 인덱스 배열
   */
  getSelectedMetricIndices() {
    return this.selectedMetricIndices;
  }

  /**
   * 선택된 메트릭 인덱스 배열 설정
   * @param {Array<number>} indices - 메트릭 인덱스 배열
   */
  setSelectedMetricIndices(indices) {
    this.selectedMetricIndices = Array.isArray(indices) ? indices : [];
  }

  /**
   * 선택된 메트릭 인덱스 추가
   * @param {number} index - 메트릭 인덱스
   */
  addSelectedMetricIndex(index) {
    if (typeof index === 'number' && !this.selectedMetricIndices.includes(index)) {
      this.selectedMetricIndices.push(index);
    }
  }

  /**
   * 선택된 메트릭 인덱스 제거
   * @param {number} index - 메트릭 인덱스
   */
  removeSelectedMetricIndex(index) {
    const idx = this.selectedMetricIndices.indexOf(index);
    if (idx !== -1) {
      this.selectedMetricIndices.splice(idx, 1);
    }
  }

  /**
   * 선택된 메트릭 인덱스 초기화
   */
  clearSelectedMetricIndices() {
    this.selectedMetricIndices = [];
  }

  /**
   * 포스트 선택기용 전체 포스트 목록 반환
   * @returns {Array} 포스트 목록
   */
  getAllTrackingPostsForSelector() {
    return this.allTrackingPostsForSelector;
  }

  /**
   * 포스트 선택기용 전체 포스트 목록 설정
   * @param {Array} posts - 포스트 목록
   */
  setAllTrackingPostsForSelector(posts) {
    this.allTrackingPostsForSelector = Array.isArray(posts) ? posts : [];
  }

  // ========================================
  // [P1-01] 유틸리티 메서드
  // ========================================

  /**
   * 트래킹 포스트 ID로 포스트 찾기
   * @param {string} postId - 포스트 ID
   * @returns {Object|undefined} 찾은 포스트 또는 undefined
   */
  findTrackingPostById(postId) {
    return this.trackingPosts.find(p => p.id === postId);
  }

  /**
   * 소스 텍스트 ID로 트래킹 포스트 찾기
   * @param {string} sourceTextId - 소스 텍스트 ID
   * @returns {Object|undefined} 찾은 포스트 또는 undefined
   */
  findTrackingPostBySourceTextId(sourceTextId) {
    return this.trackingPosts.find(p => p.sourceTextId === sourceTextId);
  }

  /**
   * 트래킹 포스트 추가
   * @param {Object} post - 추가할 포스트
   */
  addTrackingPost(post) {
    if (post && post.id) {
      // 중복 체크
      const existingIndex = this.trackingPosts.findIndex(p => p.id === post.id);
      if (existingIndex === -1) {
        this.trackingPosts.push(post);
      } else {
        // 기존 포스트 업데이트
        this.trackingPosts[existingIndex] = post;
      }
    }
  }

  /**
   * 트래킹 포스트 제거
   * @param {string} postId - 제거할 포스트 ID
   * @returns {boolean} 제거 성공 여부
   */
  removeTrackingPost(postId) {
    const index = this.trackingPosts.findIndex(p => p.id === postId);
    if (index !== -1) {
      this.trackingPosts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 모든 트래킹 데이터 초기화
   */
  clearAllTrackingData() {
    this.trackingPosts = [];
    this.currentTrackingPost = null;
    this.allTrackingPostsForSelector = [];
    this.selectedChartPostId = null;
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];
    
    // 차트 인스턴스 정리
    if (this.trackingChart) {
      this.trackingChart.destroy();
      this.trackingChart = null;
    }
    
    console.log('🗑️ [TrackingManager] 모든 트래킹 데이터 초기화됨');
  }

  /**
   * 트래킹 상태 요약 반환 (디버깅용)
   * @returns {Object} 상태 요약 객체
   */
  getStatusSummary() {
    return {
      postsCount: this.trackingPosts.length,
      currentPost: this.currentTrackingPost?.id || null,
      chartMode: this.chartMode,
      chartRange: this.chartRange,
      scaleMode: this.scaleMode,
      selectedPostId: this.selectedChartPostId,
      isBatchSelectMode: this.isBatchSelectMode,
      selectedMetricsCount: this.selectedMetricIndices.length,
      hasChart: !!this.trackingChart
    };
  }

  // ========================================
  // [P1-02] 트래킹 데이터 로드/저장 메서드
  // ========================================

  /**
   * 트래킹 포스트 로드 (Firebase에서 데이터 가져오기)
   * 
   * Firebase Firestore에서 사용자의 트래킹 포스트를 로드합니다.
   * 레퍼런스 타입 포스트는 트래킹 목록에서 제외됩니다.
   * 
   * @async
   * @returns {Promise<void>}
   * 
   * 의존성:
   * - this.app.currentUser: 현재 로그인한 사용자
   * - this.app.isFirebaseReady: Firebase 초기화 상태
   * - this.app.db: Firestore 인스턴스
   * - window.firebaseCollection, firebaseQuery, firebaseOrderBy, firebaseGetDocs
   */
  async loadTrackingPosts(retryCount = 0) {
    // [P1-04] retryCount 변수 사용 확인
    const isFirstAttempt = retryCount === 0;

    // 사전 조건 검사: 사용자 인증 및 Firebase 준비 상태
     if (!this.app.currentUser || !this.app.isFirebaseReady) {
      console.warn('[TrackingManager] loadTrackingPosts: 사용자 미인증 또는 Firebase 미준비');
      return;
    }

    // 로딩 스켈레톤 표시
    const trackingPostsList = this.app.trackingPostsList;
    if (trackingPostsList) {
      trackingPostsList.innerHTML = `
        <div class="skeleton-card">
          <div class="skeleton skeleton-card-header"></div>
          <div class="skeleton skeleton-card-content"></div>
          <div class="skeleton skeleton-card-content"></div>
          <div class="skeleton skeleton-chip"></div>
          <div class="skeleton skeleton-chip"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton skeleton-card-header"></div>
          <div class="skeleton skeleton-card-content"></div>
          <div class="skeleton skeleton-chip"></div>
        </div>
      `;
    }

    try {
      // Firebase Firestore에서 포스트 컬렉션 참조
      const postsRef = window.firebaseCollection(
        this.app.db,
        "users",
        this.app.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseOrderBy("postedAt", "desc")
      );
      const querySnapshot = await window.firebaseGetDocs(q);

      // 트래킹 포스트 목록 초기화 및 데이터 로드
      this.trackingPosts = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // 레퍼런스 타입 포스트는 트래킹 목록에서 제외
        const postType = data.type || "edit";
        const sourceType = data.sourceType || data.type || "edit";

        if (postType === "reference" || sourceType === "reference") {
          console.log("[TrackingManager] 레퍼런스 포스트 제외:", doc.id);
          return;
        }

        // 트래킹 포스트 객체 생성
        this.trackingPosts.push({
          id: doc.id,
          content: data.content,
          type: postType,
          postedAt: data.postedAt ? data.postedAt.toDate() : new Date(),
          trackingEnabled: data.trackingEnabled || false,
          metrics: data.metrics || [],
          analytics: data.analytics || {},
          sourceTextId: data.sourceTextId || null,
          sourceType: sourceType,
          sourceTextExists: null,
        });
      });

      console.log(`✅ [TrackingManager] ${this.trackingPosts.length}개의 트래킹 포스트 로드 완료`);

      // ===== [2026-01-18] 후속 처리는 별도 try-catch로 분리 =====
      // 데이터 로드는 성공했는데 UI 갱신 에러로 실패 처리되는 문제 방지
      try {
        // 데이터 무결성 검증: sourceTextId 유효성 확인
        if (this.validateSourceTexts) {
          await this.validateSourceTexts();
        }

        // 포스트 선택 드롭다운 업데이트 (개별 포스트 모드일 때)
        if (this.chartMode === "individual") {
          this.populatePostSelector();
        }

        // UI 새로고침 (메인 앱에 위임)
        if (this.app.refreshUI) {
          this.app.refreshUI({
            trackingPosts: true,
            trackingSummary: true,
            trackingChart: true,
            force: true,
          });
        }
      } catch (postLoadError) {
        // 후속 처리 에러는 경고로만 출력 (데이터 로드 자체는 성공)
        console.warn('[TrackingManager] 후속 처리 중 오류 (데이터 로드는 성공):', 
          postLoadError?.message || postLoadError);
      }
    } catch (error) {
      // ===== [iOS Patch] 2026-01-18: iOS용 권한 오류 자동 재시도 =====
      if (error.code === "permission-denied" && isFirstAttempt) {
        logger.warn("[iOS Patch] 트래킹 권한 부족(Permission Denied) 감지. 1초 후 재시도합니다...");
        if (this.app.showMessage) {
            this.app.showMessage("📊 트래킹 상태를 동기화 중입니다...", "info"); // [UX] 친절한 메시지 추가
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.loadTrackingPosts(retryCount + 1);
      }

      // ===== [2026-01-18] 에러 로깅 개선: error 객체 직렬화 문제 해결 =====
      // Error 객체는 JSON.stringify로 직렬화 시 빈 객체 {}로 표시됨
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error("[TrackingManager] loadTrackingPosts 실패:", errorMessage);
      
      this.trackingPosts = [];  // 에러 시 빈 배열로 초기화

      // 사용자에게 에러 메시지 표시
      if (this.app.showMessage) {
        if (error.code === "permission-denied") {
            this.app.showMessage("📊 트래킹 데이터 접근 권한을 확인 중입니다. 잠시 후 새로고침 해주세요.", "warning");
        } else {
            this.app.showMessage(
              "트래킹 데이터를 불러오는데 실패했습니다. 네트워크 연결을 확인해주세요.",
              "error"
            );
        }
      }

      // 빈 상태 표시
      if (trackingPostsList) {
        trackingPostsList.innerHTML = `
          <div class="tracking-post-no-data" style="text-align: center; padding: 40px 20px;">
            <span class="no-data-icon" style="font-size: 3rem; display: block; margin-bottom: 16px;">📭</span>
            <span class="no-data-text" style="color: #666; font-size: 0.95rem;">데이터를 불러올 수 없습니다. 페이지를 새로고침해주세요.</span>
          </div>
        `;
      }
    }
  }

  /**
   * 트래킹 요약 통계 업데이트
   * 
   * 트래킹 포스트 목록에서 총합 통계를 계산하여 UI에 표시합니다.
   * - 총 포스트 수
   * - 총 조회수, 좋아요, 댓글, 공유, 팔로우
   * 
   * @returns {void}
   * 
   * 의존성:
   * - this.app.totalPostsElement, totalViewsElement 등 DOM 요소
   */

  // ========================================
  // [P2-02] Source text validation (moved from script.js)
  // ========================================

  async validateSourceTexts() {
    if (!this.app.currentUser || !this.app.isFirebaseReady) return;
    if (!this.trackingPosts || this.trackingPosts.length == 0) return;

    const postsToValidate = this.trackingPosts.filter(
      (post) => post.sourceTextId && post.sourceTextExists === null
    );

    if (postsToValidate.length == 0) return;

    try {
      const textIds = postsToValidate.map((post) => post.sourceTextId);
      const existsMap = await this._checkTextsExist(textIds);

      this.trackingPosts.forEach((post) => {
        if (post.sourceTextId) {
          post.sourceTextExists = existsMap[post.sourceTextId] ?? false;
          post.isOrphan = !post.sourceTextExists;
        }
      });

      logger.log(`[TrackingManager] ${postsToValidate.length}? ??? ?? ??`);
    } catch (error) {
      logger.error('[TrackingManager] validateSourceTexts ??:', error);
    }
  }

  async _checkTextsExist(textIds) {
    const existsMap = {};
    const textsRef = window.firebaseCollection(
      this.app.db,
      'users',
      this.app.currentUser.uid,
      'texts'
    );

    for (const textId of textIds) {
      try {
        const docRef = window.firebaseDoc(textsRef, textId);
        const docSnap = await window.firebaseGetDoc(docRef);
        existsMap[textId] = docSnap.exists();
      } catch {
        existsMap[textId] = false;
      }
    }

    return existsMap;
  }


  // ========================================
  // [P2-03] Tracking manage list render (moved from script.js)
  // ========================================

  renderTrackingPostsForManage() {
    const container = document.getElementById('tracking-manage-list');
    if (!container) {
      if (typeof logger !== 'undefined') {
        logger.warn('[TrackingManager] tracking-manage-list ?? ??');
      } else {
        console.warn('[TrackingManager] tracking-manage-list ?? ??');
      }
      return;
    }

    if (!this.trackingPosts || this.trackingPosts.length === 0) {
      container.innerHTML = this._getEmptyStateHTML();
      return;
    }

    const sortedPosts = [...this.trackingPosts].sort((a, b) => {
      const aTime = a.postedAt instanceof Date ? a.postedAt.getTime() : new Date(a.postedAt || 0).getTime();
      const bTime = b.postedAt instanceof Date ? b.postedAt.getTime() : new Date(b.postedAt || 0).getTime();
      return bTime - aTime;
    });

    container.innerHTML = sortedPosts
      .map((post) => this._renderTrackingPostCard(post))
      .join('');

    this._bindTrackingPostEvents(container);
  }

  _getEmptyStateHTML() {
    return `
      <div class="tracking-post-no-data">
        <span class="no-data-icon">??</span>
        <span class="no-data-text">??? ?? ???? ????.</span>
      </div>
    `;
  }

  _renderTrackingPostCard(post) {
    const postedAt = post.postedAt instanceof Date
      ? post.postedAt
      : post.postedAt?.toDate
      ? post.postedAt.toDate()
      : new Date(post.postedAt || Date.now());

    const dateText = Number.isNaN(postedAt.getTime())
      ? '-'
      : postedAt.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });

    const metricsCount = Array.isArray(post.metrics) ? post.metrics.length : 0;
    const title = (post.content || '').split('
')[0].trim();

    return `
      <div class="tracking-manage-card" data-post-id="${post.id}">
        <div class="tracking-manage-header">
          <div class="tracking-manage-title">${this._escapeHtml(title || '(?? ??)')}</div>
          <div class="tracking-manage-meta">${dateText} ? ??? ${metricsCount}?</div>
        </div>
        <div class="tracking-manage-actions">
          <button class="btn btn-secondary" data-action="manage-metrics" data-post-id="${post.id}">?? ??? ??</button>
        </div>
      </div>
    `;
  }

  _bindTrackingPostEvents(container) {
    if (container._trackingManageEventsBound) return;
    container._trackingManageEventsBound = true;

    container.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const action = button.getAttribute('data-action');
      const postId = button.getAttribute('data-post-id');
      if (!postId) return;

      if (action === 'manage-metrics') {
        event.preventDefault();
        if (this.manageMetrics) {
          this.manageMetrics(postId);
        }
      }
    });
  }

  updateTrackingSummary() {
    const totalPosts = this.trackingPosts.length;

    // 각 메트릭의 최신 값 합산
    const totalViews = this.trackingPosts.reduce((sum, post) => {
      const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
      return sum + (latest ? latest.views : 0);
    }, 0);

    const totalLikes = this.trackingPosts.reduce((sum, post) => {
      const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
      return sum + (latest ? latest.likes : 0);
    }, 0);

    const totalComments = this.trackingPosts.reduce((sum, post) => {
      const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
      return sum + (latest ? latest.comments || 0 : 0);
    }, 0);

    const totalShares = this.trackingPosts.reduce((sum, post) => {
      const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
      return sum + (latest ? latest.shares || 0 : 0);
    }, 0);

    const totalFollows = this.trackingPosts.reduce((sum, post) => {
      const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
      return sum + (latest ? latest.follows || 0 : 0);
    }, 0);

    // DOM 요소 업데이트
    if (this.app.totalPostsElement) {
      this.app.totalPostsElement.textContent = totalPosts;
    }
    if (this.app.totalViewsElement) {
      this.app.totalViewsElement.textContent = totalViews.toLocaleString();
    }
    if (this.app.totalLikesElement) {
      this.app.totalLikesElement.textContent = totalLikes.toLocaleString();
    }
    if (this.app.totalCommentsElement) {
      this.app.totalCommentsElement.textContent = totalComments.toLocaleString();
    }
    if (this.app.totalSharesElement) {
      this.app.totalSharesElement.textContent = totalShares.toLocaleString();
    }

    // total-follows 요소는 동적으로 찾기
    const totalFollowsElement = document.getElementById("total-follows");
    if (totalFollowsElement) {
      totalFollowsElement.textContent = totalFollows.toLocaleString();
    }

    console.log(`📊 [TrackingManager] 요약 업데이트: ${totalPosts}개 포스트, ${totalViews} 조회`);
  }

  /**
   * 분석 데이터 계산
   * 
   * 메트릭 배열에서 분석 데이터를 계산합니다.
   * - 총 조회수, 좋아요, 댓글, 공유
   * - 성장률 (최신 - 최초)
   * - 참여율 (engagement rate)
   * 
   * @param {Array} metrics - 메트릭 배열 [{views, likes, comments, shares, recordedAt}, ...]
   * @returns {Object} 분석 데이터 객체
   * 
   * @example
   * const analytics = trackingManager.calculateAnalytics(post.metrics);
   * // { totalViews: 1000, viewsGrowth: 500, engagementRate: "5.50" }
   */
  calculateAnalytics(metrics) {
    // 빈 배열 처리
    if (!metrics || metrics.length === 0) {
      return {};
    }

    const latest = metrics[metrics.length - 1];
    const first = metrics[0];

    // 분석 데이터 계산
    return {
      totalViews: latest.views,
      totalLikes: latest.likes,
      totalComments: latest.comments,
      totalShares: latest.shares,
      viewsGrowth: latest.views - first.views,
      likesGrowth: latest.likes - first.likes,
      commentsGrowth: latest.comments - first.comments,
      sharesGrowth: latest.shares - first.shares,
      engagementRate:
        latest.views > 0
          ? (
              ((latest.likes + latest.comments + latest.shares) / latest.views) *
              100
            ).toFixed(2)
          : 0,
    };
  }

  // ========================================
  // [P1-03] 차트 관련 메서드
  // ========================================

  /**
   * 트래킹 차트 초기화
   * 
   * Chart.js를 사용하여 트래킹 데이터를 시각화하는 차트를 초기화합니다.
   * Canvas 요소가 없거나 Chart.js 라이브러리가 로드되지 않은 경우 에러 처리를 수행합니다.
   * 
   * 의존성:
   * - this.app.trackingChartCanvas: Canvas DOM 요소
   * - this.app.showMessage: 메시지 표시 함수
   * - Chart.js 라이브러리 (전역)
   * 
   * @returns {void}
   */
  initTrackingChart() {
    // 에러 처리: Canvas 요소가 없을 때 Chart.js 초기화 실패 방지
    if (!this.app.trackingChartCanvas) {
      console.warn("[TrackingManager] initTrackingChart: Canvas element not found");
      return;
    }

    // Chart.js 라이브러리 로드 실패 시 폴백 처리
    if (typeof Chart === "undefined") {
      console.error("[TrackingManager] initTrackingChart: Chart.js library not loaded");
      if (this.app.showMessage) {
        this.app.showMessage(
          "차트 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해주세요.",
          "error"
        );
      }
      return;
    }

    try {
      const ctx = this.app.trackingChartCanvas.getContext("2d");
      if (!ctx) {
        console.error("[TrackingManager] initTrackingChart: Failed to get 2D context");
        if (this.app.showMessage) {
          this.app.showMessage(
            "차트를 초기화할 수 없습니다. 브라우저를 새로고침해주세요.",
            "error"
          );
        }
        return;
      }

      // 기존 차트가 있다면 제거 (메모리 누수 방지)
      if (this.trackingChart) {
        this.trackingChart.destroy();
        this.trackingChart = null;
      }

      // Chart.js 초기화: responsive: true로 설정되어 있어 부모 컨테이너 크기에 맞춰 자동 조절
      this.trackingChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "조회수",
              data: [],
              borderColor: "#667eea",
              backgroundColor: "rgba(102, 126, 234, 0.1)",
              tension: 0.4,
            },
            {
              label: "좋아요",
              data: [],
              borderColor: "#e74c3c",
              backgroundColor: "rgba(231, 76, 60, 0.1)",
              tension: 0.4,
            },
            {
              label: "댓글",
              data: [],
              borderColor: "#9b59b6",
              backgroundColor: "rgba(155, 89, 182, 0.1)",
              tension: 0.4,
            },
            {
              label: "공유",
              data: [],
              borderColor: "#f39c12",
              backgroundColor: "rgba(243, 156, 18, 0.1)",
              tension: 0.4,
            },
            {
              label: "팔로우",
              data: [],
              borderColor: "#16a085",
              backgroundColor: "rgba(22, 160, 133, 0.1)",
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: false,
              text: "포스트 성과 추이",
            },
            legend: {
              display: false,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                maxTicksLimit: 8,
                precision: 0,
                stepSize: 1,
              },
              max: 10,
            },
            y2: {
              beginAtZero: true,
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                maxTicksLimit: 8,
                precision: 0,
                stepSize: 1,
              },
              max: 10,
            },
          },
          animation: {
            duration: 0,
          },
          layout: {
            padding: {
              top: 20,
              bottom: 40,
              left: 15,
              right: 15,
            },
          },
          interaction: {
            mode: "index",
            intersect: false,
          },
          elements: {
            point: {
              radius: 4,
              hoverRadius: 6,
            },
          },
        },
      });

      // Chart.js 초기화 후 차트 업데이트
      this.updateTrackingChart();
      console.log("✅ [TrackingManager] 차트 초기화 완료");
    } catch (error) {
      console.error("[TrackingManager] initTrackingChart failed:", error);
      if (this.app.showMessage) {
        this.app.showMessage(
          "차트를 초기화하는 중 오류가 발생했습니다: " + error.message,
          "error"
        );
      }
      this.trackingChart = null;
    }
  }

  /**
   * 트래킹 차트 업데이트
   * 
   * 현재 설정된 모드와 범위에 따라 차트 데이터를 업데이트합니다.
   * - 전체 총합 모드: 모든 포스트의 메트릭을 합산하여 표시
   * - 개별 포스트 모드: 선택한 포스트의 메트릭만 표시
   * 
   * @returns {void}
   */
  updateTrackingChart() {
    // 에러 처리: 차트가 아직 초기화되지 않았을 때 처리
    if (!this.trackingChart) {
      console.warn("[TrackingManager] updateTrackingChart: Chart not initialized yet");
      return;
    }

    try {
      // 선택된 범위에 따른 날짜 배열 생성
      const dateRange = [];
      const viewsData = [];
      const likesData = [];
      const commentsData = [];
      const sharesData = [];
      const followsData = [];

      // 범위 계산 함수
      const makeRange = (startDate, endDate, maxDays = 365) => {
        const days = [];
        const start = new Date(startDate.getTime());
        const end = new Date(endDate.getTime());
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        let current = start;
        let cnt = 0;
        while (current.getTime() <= end.getTime() && cnt < maxDays) {
          days.push(new Date(current.getTime()));
          current = new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() + 1
          );
          cnt++;
        }
        return days;
      };

      // 범위 결정
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (this.chartRange === "7d") {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          dateRange.push(d);
        }
      } else if (this.chartRange === "30d") {
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          dateRange.push(d);
        }
      } else {
        // 'all' 범위
        if (this.chartMode === "individual" && this.selectedChartPostId) {
          const post = this.trackingPosts.find(p => p.id === this.selectedChartPostId);
          if (post && post.metrics && post.metrics.length > 0) {
            try {
              const firstMetric = post.metrics[0];
              const lastMetric = post.metrics[post.metrics.length - 1];
              if (!firstMetric || !firstMetric.timestamp || !lastMetric || !lastMetric.timestamp) {
                throw new Error("Invalid metric timestamp");
              }

              const first = firstMetric.timestamp?.toDate
                ? firstMetric.timestamp.toDate()
                : new Date(firstMetric.timestamp);
              const last = lastMetric.timestamp?.toDate
                ? lastMetric.timestamp.toDate()
                : new Date(lastMetric.timestamp);

              if (isNaN(first.getTime()) || isNaN(last.getTime())) {
                throw new Error("Invalid date in metric");
              }

              dateRange.push(...makeRange(first, last));
            } catch (err) {
              console.warn("[TrackingManager] updateTrackingChart: Error processing date range:", err);
              for (let i = 6; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                dateRange.push(d);
              }
            }
          } else {
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
              dateRange.push(d);
            }
          }
        } else {
          let minDate = null;
          let maxDate = null;
          this.trackingPosts.forEach((post) => {
            (post.metrics || []).forEach((m) => {
              if (!m || !m.timestamp) return;
              try {
                const dt = m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp);
                if (isNaN(dt.getTime())) return;
                dt.setHours(0, 0, 0, 0);
                if (!minDate || dt < minDate) minDate = new Date(dt);
                if (!maxDate || dt > maxDate) maxDate = new Date(dt);
              } catch (err) {
                console.warn("[TrackingManager] updateTrackingChart: Error processing metric:", err);
              }
            });
          });
          if (minDate && maxDate) {
            dateRange.push(...makeRange(minDate, maxDate));
          } else {
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
              dateRange.push(d);
            }
          }
        }
      }

      // 데이터 계산: 모드에 따라 분기
      if (this.chartMode === "total") {
        // 전체 총합 모드
        dateRange.forEach((targetDate) => {
          let dayTotalViews = 0, dayTotalLikes = 0, dayTotalComments = 0, dayTotalShares = 0, dayTotalFollows = 0;

          this.trackingPosts.forEach((post) => {
            if (!post.metrics || post.metrics.length === 0) return;

            let latestMetricBeforeDate = null;
            for (let i = post.metrics.length - 1; i >= 0; i--) {
              const metric = post.metrics[i];
              const metricDate = metric.timestamp?.toDate
                ? metric.timestamp.toDate()
                : new Date(metric.timestamp);
              metricDate.setHours(0, 0, 0, 0);

              if (metricDate.getTime() <= targetDate.getTime()) {
                latestMetricBeforeDate = metric;
                break;
              }
            }

            if (latestMetricBeforeDate) {
              dayTotalViews += Number(latestMetricBeforeDate.views) || 0;
              dayTotalLikes += Number(latestMetricBeforeDate.likes) || 0;
              dayTotalComments += Number(latestMetricBeforeDate.comments) || 0;
              dayTotalShares += Number(latestMetricBeforeDate.shares) || 0;
              dayTotalFollows += Number(latestMetricBeforeDate.follows) || 0;
            }
          });

          viewsData.push(dayTotalViews);
          likesData.push(dayTotalLikes);
          commentsData.push(dayTotalComments);
          sharesData.push(dayTotalShares);
          followsData.push(dayTotalFollows);
        });

        this.trackingChart.options.plugins.title.text = "전체 포스트 현재값 합계 추이";
        if (this.app.updateChartHeader) {
          this.app.updateChartHeader("전체 포스트 현재값 합계 추이", null);
        }
      } else {
        // 개별 포스트 모드
        if (!this.selectedChartPostId) {
          dateRange.forEach(() => {
            viewsData.push(0);
            likesData.push(0);
            commentsData.push(0);
            sharesData.push(0);
            followsData.push(0);
          });
          this.trackingChart.options.plugins.title.text = "포스트 성과 추이 (포스트를 선택하세요)";
          if (this.app.updateChartHeader) {
            this.app.updateChartHeader("포스트 성과 추이 (포스트를 선택하세요)", null);
          }
        } else {
          const selectedPost = this.trackingPosts.find(p => p.id === this.selectedChartPostId);

          if (selectedPost && selectedPost.metrics) {
            // 범위에 데이터가 없으면 자동으로 전체 범위로 전환
            if (dateRange.length > 0) {
              const firstDate = dateRange[0].getTime();
              const lastDate = dateRange[dateRange.length - 1].getTime();
              const hasAnyInRange = selectedPost.metrics.some((metric) => {
                const md = metric.timestamp?.toDate
                  ? metric.timestamp.toDate()
                  : new Date(metric.timestamp);
                md.setHours(0, 0, 0, 0);
                const t = md.getTime();
                return t >= firstDate && t <= lastDate;
              });
              if (!hasAnyInRange && this.chartRange !== "all") {
                if (this.app.setChartRange) {
                  this.app.setChartRange("all");
                } else {
                  this.chartRange = "all";
                }
                return;
              }
            }

            dateRange.forEach((targetDate) => {
              let dayViews = 0, dayLikes = 0, dayComments = 0, dayShares = 0, dayFollows = 0;

              selectedPost.metrics.forEach((metric) => {
                if (!metric || !metric.timestamp) return;
                try {
                  const metricDate = metric.timestamp?.toDate
                    ? metric.timestamp.toDate()
                    : new Date(metric.timestamp);
                  if (isNaN(metricDate.getTime())) return;
                  metricDate.setHours(0, 0, 0, 0);

                  if (metricDate.getTime() === targetDate.getTime()) {
                    dayViews += Number(metric.views) || 0;
                    dayLikes += Number(metric.likes) || 0;
                    dayComments += Number(metric.comments) || 0;
                    dayShares += Number(metric.shares) || 0;
                    dayFollows += Number(metric.follows) || 0;
                  }
                } catch (err) {
                  console.warn("[TrackingManager] updateTrackingChart: Error processing metric:", err);
                }
              });

              viewsData.push(dayViews);
              likesData.push(dayLikes);
              commentsData.push(dayComments);
              sharesData.push(dayShares);
              followsData.push(dayFollows);
            });

            const contentPreview = selectedPost.content.length > 30
              ? selectedPost.content.substring(0, 30) + "..."
              : selectedPost.content;
            this.trackingChart.options.plugins.title.text = `포스트 성과 추이: ${contentPreview}`;

            const latestMetric = selectedPost.metrics && selectedPost.metrics.length > 0
              ? selectedPost.metrics[selectedPost.metrics.length - 1]
              : null;
            let lastUpdate = null;
            if (latestMetric && latestMetric.timestamp) {
              lastUpdate = latestMetric.timestamp?.toDate
                ? latestMetric.timestamp.toDate()
                : new Date(latestMetric.timestamp);
            }
            if (this.app.updateChartHeader) {
              this.app.updateChartHeader(selectedPost.content, lastUpdate);
            }
          } else {
            dateRange.forEach(() => {
              viewsData.push(0);
              likesData.push(0);
              commentsData.push(0);
              sharesData.push(0);
              followsData.push(0);
            });
            this.trackingChart.options.plugins.title.text = "포스트 성과 추이 (데이터 없음)";
            if (this.app.updateChartHeader) {
              this.app.updateChartHeader("포스트 성과 추이 (데이터 없음)", null);
            }
          }
        }
      }

      // 날짜 레이블 포맷팅
      const dateLabels = dateRange.map((date) =>
        date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
      );

      this.trackingChart.data.labels = dateLabels;

      // 데이터 바인딩
      const datasets = this.trackingChart.data.datasets;
      datasets[0].data = viewsData;
      datasets[1].data = likesData;
      datasets[2].data = commentsData;
      datasets[3].data = sharesData;
      if (datasets[4]) datasets[4].data = followsData;

      // 축 배치: combined는 모두 y, split은 조회수 y / 나머지 y2
      if (this.scaleMode === "split") {
        datasets[0].yAxisID = "y";
        for (let i = 1; i < datasets.length; i++) {
          datasets[i].yAxisID = "y2";
        }
      } else {
        for (let i = 0; i < datasets.length; i++) {
          datasets[i].yAxisID = "y";
        }
      }

      // y축 스케일 재계산
      const maxValue = Math.max(
        ...(viewsData.length ? viewsData : [0]),
        ...(likesData.length ? likesData : [0]),
        ...(commentsData.length ? commentsData : [0]),
        ...(sharesData.length ? sharesData : [0]),
        ...(followsData.length ? followsData : [0])
      );

      if (this.scaleMode === "split") {
        const maxViews = Math.max(...(viewsData.length ? viewsData : [0]));
        const yMax = maxViews > 0 ? Math.ceil(maxViews * 1.2) : 10;
        const yStep = Math.max(1, Math.ceil((yMax || 10) / 8));
        this.trackingChart.options.scales.y.max = yMax;
        this.trackingChart.options.scales.y.ticks.stepSize = yStep;

        const maxOthers = Math.max(
          ...(likesData.length ? likesData : [0]),
          ...(commentsData.length ? commentsData : [0]),
          ...(sharesData.length ? sharesData : [0]),
          ...(followsData.length ? followsData : [0])
        );
        const y2Max = maxOthers > 0 ? Math.ceil(maxOthers * 1.8) : 10;
        const y2Step = Math.max(1, Math.ceil((y2Max || 10) / 6));
        this.trackingChart.options.scales.y2.max = y2Max;
        this.trackingChart.options.scales.y2.ticks.stepSize = y2Step;
      } else {
        if (maxValue > 0) {
          const suggestedMax = Math.ceil(maxValue * 1.2);
          const stepSize = Math.max(1, Math.ceil(suggestedMax / 8));
          this.trackingChart.options.scales.y.max = suggestedMax;
          this.trackingChart.options.scales.y.ticks.stepSize = stepSize;
        } else {
          this.trackingChart.options.scales.y.max = 10;
          this.trackingChart.options.scales.y.ticks.stepSize = 1;
        }
        this.trackingChart.options.scales.y2.max = this.trackingChart.options.scales.y.max;
        this.trackingChart.options.scales.y2.ticks.stepSize = this.trackingChart.options.scales.y.ticks.stepSize;
      }

      // 애니메이션 없이 업데이트
      this.trackingChart.update("none");
    } catch (error) {
      console.error("[TrackingManager] updateTrackingChart failed:", error);
    }
  }

  // ========================================
  // [P1-03] 차트 모드 전환 메서드
  // ========================================

  /**
   * 스케일 모드 설정 및 UI 업데이트
   * 
   * 그래프의 스케일 모드를 변경하고 UI를 업데이트합니다.
   * 'combined' 모드: 모든 지표가 동일한 y축 스케일을 사용
   * 'split' 모드: 조회수는 왼쪽 y축, 나머지 지표는 오른쪽 y2축 사용
   * 
   * @param {string} mode - 스케일 모드 ('combined' | 'split')
   * @returns {void}
   */
  setScaleModeWithUI(mode) {
    // 스케일 모드 설정
    this.setScaleMode(mode);

    // UI 버튼 스타일 업데이트
    const combinedBtn = document.getElementById("chart-scale-combined");
    const splitBtn = document.getElementById("chart-scale-split");
    
    if (combinedBtn && splitBtn) {
      if (mode === "combined") {
        combinedBtn.classList.add("active");
        combinedBtn.style.background = "white";
        combinedBtn.style.color = "#667eea";
        combinedBtn.setAttribute("aria-pressed", "true");
        splitBtn.classList.remove("active");
        splitBtn.style.background = "transparent";
        splitBtn.style.color = "#666";
        splitBtn.setAttribute("aria-pressed", "false");
      } else {
        splitBtn.classList.add("active");
        splitBtn.style.background = "white";
        splitBtn.style.color = "#667eea";
        splitBtn.setAttribute("aria-pressed", "true");
        combinedBtn.classList.remove("active");
        combinedBtn.style.background = "transparent";
        combinedBtn.style.color = "#666";
        combinedBtn.setAttribute("aria-pressed", "false");
      }
    }

    // 차트 업데이트
    this.updateTrackingChart();
  }

  /**
   * 차트 모드 설정 및 UI 업데이트
   * 
   * 그래프의 모드를 변경하고 UI를 업데이트합니다.
   * 'total' 모드: 모든 포스트의 누적 총합 표시
   * 'individual' 모드: 선택한 개별 포스트의 데이터만 표시
   * 
   * @param {string} mode - 차트 모드 ('total' | 'individual')
   * @returns {void}
   */
  setChartModeWithUI(mode) {
    // 차트 모드 설정
    this.setChartMode(mode);

    // UI 버튼 스타일 업데이트
    const totalBtn = document.getElementById("chart-mode-total");
    const individualBtn = document.getElementById("chart-mode-individual");
    const postSelectorContainer = document.getElementById("post-selector-container");

    if (mode === "total") {
      if (totalBtn) {
        totalBtn.classList.add("active");
        totalBtn.style.background = "white";
        totalBtn.style.color = "#667eea";
        totalBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        totalBtn.setAttribute("aria-pressed", "true");
      }

      if (individualBtn) {
        individualBtn.classList.remove("active");
        individualBtn.style.background = "transparent";
        individualBtn.style.color = "#666";
        individualBtn.style.boxShadow = "none";
        individualBtn.setAttribute("aria-pressed", "false");
      }

      if (postSelectorContainer) {
        postSelectorContainer.style.display = "none";
      }
      
      this.selectedChartPostId = null;
      
      // 전체 총합 모드로 전환 시 검색 입력창 초기화
      const searchInput = document.getElementById("chart-post-search");
      if (searchInput) {
        searchInput.value = "";
      }
      const dropdown = document.getElementById("post-selector-dropdown");
      if (dropdown) {
        dropdown.style.display = "none";
      }
      
      // 외부 클릭 이벤트 리스너 제거
      if (this.app && this.app.handlePostSelectorClickOutside) {
        document.removeEventListener("click", this.app.handlePostSelectorClickOutside);
      }
    } else {
      if (individualBtn) {
        individualBtn.classList.add("active");
        individualBtn.style.background = "white";
        individualBtn.style.color = "#667eea";
        individualBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        individualBtn.setAttribute("aria-pressed", "true");
      }

      if (totalBtn) {
        totalBtn.classList.remove("active");
        totalBtn.style.background = "transparent";
        totalBtn.style.color = "#666";
        totalBtn.style.boxShadow = "none";
        totalBtn.setAttribute("aria-pressed", "false");
      }

      if (postSelectorContainer) {
        postSelectorContainer.style.display = "block";
      }
      
      // 포스트 선택 드롭다운 채우기
      this.populatePostSelector();
    }

    // 차트 업데이트
    this.updateTrackingChart();
  }

  /**
   * 차트 범위 설정 및 UI 업데이트
   * 
   * 그래프에 표시할 데이터 범위를 변경하고 UI를 업데이트합니다.
   * '7d': 최근 7일 데이터만 표시
   * '30d': 최근 30일 데이터만 표시
   * 'all': 전체 데이터 표시
   * 
   * @param {string} range - 차트 범위 ('7d' | '30d' | 'all')
   * @returns {void}
   */
  setChartRangeWithUI(range) {
    // 차트 범위 설정
    this.setChartRange(range);

    // UI 버튼 스타일 업데이트
    const ranges = ["7d", "30d", "all"];
    ranges.forEach((r) => {
      const btn = document.getElementById(`chart-range-${r}`);
      if (!btn) return;
      if (r === range) {
        btn.classList.add("active");
        btn.style.background = "white";
        btn.style.color = "#667eea";
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = "#666";
        btn.setAttribute("aria-pressed", "false");
      }
    });

    // 차트 업데이트
    this.updateTrackingChart();
  }


  // ========================================
  // [P1-04] 헬퍼 메서드 - 메인 앱 메서드 위임
  // ========================================

  /**
   * 바텀시트 열기 (메인 앱에 위임)
   * @param {HTMLElement} modal - 모달 요소
   */
  _openBottomSheet(modal) {
    if (this.app && this.app.openBottomSheet) {
      return this.app.openBottomSheet(modal);
    }
    console.warn('[TrackingManager] openBottomSheet 메서드를 찾을 수 없습니다.');
  }

  /**
   * 바텀시트 닫기 (메인 앱에 위임)
   * @param {HTMLElement} modal - 모달 요소
   */
  _closeBottomSheet(modal) {
    if (this.app && this.app.closeBottomSheet) {
      return this.app.closeBottomSheet(modal);
    }
    console.warn('[TrackingManager] closeBottomSheet 메서드를 찾을 수 없습니다.');
  }

  /**
   * 메시지 표시 (메인 앱에 위임)
   * @param {string} msg - 메시지 내용
   * @param {string} type - 메시지 타입 ('success' | 'error' | 'warning' | 'info')
   */
  _showMessage(msg, type) {
    if (this.app && this.app.showMessage) {
      return this.app.showMessage(msg, type);
    }
    console.warn('[TrackingManager] showMessage 메서드를 찾을 수 없습니다.');
  }

  /**
   * UI 새로고침 (메인 앱에 위임)
   * @param {Object} options - 새로고침 옵션
   */
  _refreshUI(options) {
    if (this.app && this.app.refreshUI) {
      return this.app.refreshUI(options);
    }
    console.warn('[TrackingManager] refreshUI 메서드를 찾을 수 없습니다.');
  }

  /**
   * HTML 이스케이프 (메인 앱에 위임 또는 유틸리티 사용)
   * @param {string} str - 이스케이프할 문자열
   * @returns {string} 이스케이프된 문자열
   */
  _escapeHtml(str) {
    if (this.app && this.app.escapeHtml) {
      return this.app.escapeHtml(str);
    }
    // 폴백: 기본 이스케이프 처리
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ========================================
  // [P1-04] 메트릭 관리 상태 프로퍼티
  // ========================================

  /** @type {Object|null} 편집 중인 메트릭 데이터 */
  get editingMetricData() {
    return this._editingMetricData || null;
  }

  set editingMetricData(value) {
    this._editingMetricData = value;
  }
}

// 기본 내보내기
export default TrackingManager;


// ============================================================================
// [P1-04] 메트릭 관리 메서드
// ============================================================================
// 
// script.js에서 이동된 메트릭 관리 관련 메서드들입니다.
// - manageMetrics(): 메트릭 관리 모달 열기
// - renderMetricsListForManage(): 메트릭 목록 렌더링
// - bindMetricsManageEvents(): 수정/삭제 버튼 이벤트 바인딩
// - editMetricFromManage(): 개별 메트릭 수정
// - deleteMetricFromManage(): 개별 메트릭 삭제
// - bindBatchSelectEvents(): 일괄 선택 모드 이벤트 바인딩
// - updateBatchSelectUI(): 일괄 선택 UI 업데이트
// - refreshMetricsListForManage(): 메트릭 목록 새로고침
// - batchDeleteMetrics(): 일괄 삭제
// ============================================================================

/**
 * 메트릭 관리 모달 열기 (트래킹 탭에서 사용)
 * 
 * 특정 포스트의 메트릭 데이터를 관리할 수 있는 모달을 엽니다.
 * 메트릭 수정, 삭제, 일괄 삭제 기능을 제공합니다.
 * 
 * @async
 * @param {string} postId - 포스트 ID
 * @returns {Promise<void>}
 */
TrackingManager.prototype.manageMetrics = async function (postId) {
  if (!this.app.currentUser || !this.app.isFirebaseReady) {
    this._showMessage("로그인이 필요합니다.", "error");
    return;
  }

  try {
    // 포스트 데이터 가져오기
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    // 로컬에 없으면 Firebase에서 조회
    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      try {
        const postRef = window.firebaseDoc(
          this.app.db,
          "users",
          this.app.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            content: data.content || "",
            metrics: data.metrics || [],
            sourceTextId: data.sourceTextId || null,
          };
        }
      } catch (error) {
        console.error("[TrackingManager] 포스트 조회 실패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      this._showMessage("메트릭 데이터가 없습니다.", "warning");
      return;
    }

    // 메트릭 목록 렌더링
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postData.id,
      postData.sourceTextId
    );

    // 일괄 선택 모드 초기화
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 모달 열기
    const modal = document.getElementById("metrics-manage-modal");
    const content = document.getElementById("metrics-manage-content");
    if (modal && content) {
      content.innerHTML = `
        <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${this._escapeHtml(
                postData.content.substring(0, 50)
              )}${postData.content.length > 50 ? "..." : ""}</div>
              <div style="font-size: 0.85rem; color: #666;">메트릭 ${
                postData.metrics.length
              }개</div>
            </div>
            <button id="batch-select-toggle" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" aria-label="일괄 선택 모드">
              📋 일괄 선택
            </button>
          </div>
          <div id="batch-select-info" style="display: none; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 0.85rem; color: #1976d2;">
            <span id="selected-count">0</span>개 선택됨
            <button id="select-all-metrics" class="btn-link" style="margin-left: 12px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">전체 선택</button>
            <button id="deselect-all-metrics" class="btn-link" style="margin-left: 8px; color: #1976d2; text-decoration: underline; background: none; border: none; cursor: pointer;">전체 해제</button>
          </div>
        </div>
        ${metricsHtml}
        <div id="batch-delete-actions" style="display: none; margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 2px solid #ffc107;">
          <div style="margin-bottom: 8px; font-weight: 600; color: #856404;">
            선택된 항목: <span id="batch-delete-count">0</span>개
          </div>
          <button id="batch-delete-btn" class="btn btn-danger" style="width: 100%;" aria-label="선택된 항목 일괄 삭제">
            🗑️ 선택된 항목 삭제
          </button>
        </div>
      `;
      this._openBottomSheet(modal);

      // 모달 내부의 수정/삭제 버튼 이벤트 바인딩
      this.bindMetricsManageEvents(postData.id, postData.sourceTextId);

      // 일괄 선택 모드 토글 버튼 이벤트 바인딩
      this.bindBatchSelectEvents(postData.id, postData.sourceTextId);
    }
  } catch (error) {
    console.error("[TrackingManager] 메트릭 관리 모달 열기 실패:", error);
    this._showMessage("메트릭 데이터를 불러오는데 실패했습니다.", "error");
  }
};

/**
 * 메트릭 관리 모달용 메트릭 목록 렌더링
 * 
 * 메트릭 배열을 받아 관리 모달에 표시할 HTML을 생성합니다.
 * 날짜 순으로 정렬하고, 수정/삭제 버튼 및 체크박스를 포함합니다.
 * 
 * @param {Array} metrics - 메트릭 배열
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 * @returns {string} 렌더링된 HTML 문자열
 */
TrackingManager.prototype.renderMetricsListForManage = function (
  metrics,
  postId,
  textId
) {
  if (!metrics || metrics.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">메트릭 데이터가 없습니다.</div>';
  }

  // 날짜 순으로 정렬 (최신 것부터)
  const sortedMetrics = [...metrics].sort((a, b) => {
    const dateA = a.timestamp?.toDate
      ? a.timestamp.toDate().getTime()
      : a.timestamp instanceof Date
      ? a.timestamp.getTime()
      : 0;
    const dateB = b.timestamp?.toDate
      ? b.timestamp.toDate().getTime()
      : b.timestamp instanceof Date
      ? b.timestamp.getTime()
      : 0;
    return dateB - dateA; // 최신 것부터
  });

  return `
    <div class="metrics-manage-list">
      ${sortedMetrics
        .map((metric, sortedIdx) => {
          // 원본 인덱스 찾기
          const originalIndex = metrics.findIndex((m) => {
            const mDate = m.timestamp?.toDate
              ? m.timestamp.toDate().getTime()
              : m.timestamp instanceof Date
              ? m.timestamp.getTime()
              : 0;
            const metricDate = metric.timestamp?.toDate
              ? metric.timestamp.toDate().getTime()
              : metric.timestamp instanceof Date
              ? metric.timestamp.getTime()
              : 0;
            return (
              mDate === metricDate &&
              m.views === metric.views &&
              m.likes === metric.likes &&
              m.comments === metric.comments &&
              m.shares === metric.shares
            );
          });
          const metricIndex =
            originalIndex >= 0 ? originalIndex : sortedIdx;

          // 메트릭 인덱스가 유효한지 확인 (원본 배열 범위 내)
          const finalMetricIndex =
            metricIndex < metrics.length ? metricIndex : sortedIdx;

          const date = metric.timestamp?.toDate
            ? metric.timestamp.toDate()
            : metric.timestamp instanceof Date
            ? metric.timestamp
            : new Date();
          const dateStr = date.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          const isSelected =
            this.isBatchSelectMode &&
            this.selectedMetricIndices.includes(finalMetricIndex);

          return `
            <div class="metric-manage-item" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
            textId || ""
          }">
              <div class="metric-manage-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" 
                    class="metric-checkbox" 
                    data-metric-index="${finalMetricIndex}"
                    ${isSelected ? "checked" : ""}
                    style="display: ${
                      this.isBatchSelectMode ? "block" : "none"
                    }; width: 18px; height: 18px; cursor: pointer;"
                    aria-label="메트릭 선택"
                  />
                  <div class="metric-manage-date">📅 ${dateStr}</div>
                </div>
                <div class="metric-manage-actions" style="display: ${
                  this.isBatchSelectMode ? "none" : "flex"
                };">
                  <button class="btn-edit-metric" data-action="edit-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
            textId || ""
          }" aria-label="수정">✏️ 수정</button>
                  <button class="btn-delete-metric" data-action="delete-metric" data-metric-index="${finalMetricIndex}" data-post-id="${postId}" data-text-id="${
            textId || ""
          }" aria-label="삭제">🗑️ 삭제</button>
                </div>
              </div>
              <div class="metric-manage-data">
                <div class="metric-chip"><span class="metric-icon">👀</span> <span class="metric-value">${
                  metric.views || 0
                }</span></div>
                <div class="metric-chip"><span class="metric-icon">❤️</span> <span class="metric-value">${
                  metric.likes || 0
                }</span></div>
                <div class="metric-chip"><span class="metric-icon">💬</span> <span class="metric-value">${
                  metric.comments || 0
                }</span></div>
                <div class="metric-chip"><span class="metric-icon">🔄</span> <span class="metric-value">${
                  metric.shares || 0
                }</span></div>
                <div class="metric-chip"><span class="metric-icon">👥</span> <span class="metric-value">${
                  metric.follows || 0
                }</span></div>
                ${
                  metric.notes
                    ? `<div class="metric-notes">📝 ${this._escapeHtml(
                        metric.notes
                      )}</div>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
};

/**
 * 메트릭 관리 모달 내부 이벤트 바인딩
 * 
 * 수정/삭제 버튼 클릭 이벤트를 바인딩합니다.
 * 
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 */
TrackingManager.prototype.bindMetricsManageEvents = function (postId, textId) {
  const content = document.getElementById("metrics-manage-content");
  if (!content) return;

  const self = this;

  // 기존 리스너 제거하고 새로 바인딩
  content.addEventListener(
    "click",
    (e) => {
      const button = e.target.closest("button");
      if (!button) return;

      const action = button.getAttribute("data-action");
      const metricIndex = parseInt(button.getAttribute("data-metric-index"));
      const buttonPostId = button.getAttribute("data-post-id") || postId;
      const buttonTextId = button.getAttribute("data-text-id") || textId;

      if (action === "edit-metric") {
        e.preventDefault();
        e.stopPropagation();
        self.editMetricFromManage(buttonPostId, buttonTextId, metricIndex);
      } else if (action === "delete-metric") {
        e.preventDefault();
        e.stopPropagation();

        if (confirm("정말로 이 메트릭을 삭제하시겠습니까?")) {
          self.deleteMetricFromManage(buttonPostId, buttonTextId, metricIndex);
        }
      }
    },
    { once: false }
  );
};


/**
 * 메트릭 관리 모달에서 메트릭 수정
 * 
 * 선택한 메트릭의 수정 모달을 엽니다.
 * 
 * @async
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 * @param {number} metricIndex - 메트릭 인덱스
 * @returns {Promise<void>}
 */
TrackingManager.prototype.editMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  try {
    // 포스트 데이터 가져오기
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      // Firebase에서 조회
      try {
        const postRef = window.firebaseDoc(
          this.app.db,
          "users",
          this.app.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            metrics: data.metrics || [],
          };
        }
      } catch (error) {
        console.error("[TrackingManager] 포스트 조회 실패:", error);
      }
    }

    if (
      !postData ||
      !postData.metrics ||
      postData.metrics.length <= metricIndex
    ) {
      this._showMessage("메트릭을 찾을 수 없습니다.", "error");
      return;
    }

    const metric = postData.metrics[metricIndex];

    // 편집 데이터 설정
    this.editingMetricData = {
      postId: postId,
      textId: textId,
      metricIndex: metricIndex,
    };

    // 메트릭 관리 모달 닫기
    const manageModal = document.getElementById("metrics-manage-modal");
    if (manageModal) {
      this._closeBottomSheet(manageModal);
    }

    // 기존 editTrackingMetric의 모달 열기 로직 재사용
    const date = metric.timestamp?.toDate
      ? metric.timestamp.toDate()
      : metric.timestamp instanceof Date
      ? metric.timestamp
      : new Date();
    const dateStr = date.toISOString().split("T")[0];

    document.getElementById("tracking-edit-date").value = dateStr;
    document.getElementById("tracking-edit-views").value = metric.views || 0;
    document.getElementById("tracking-edit-likes").value = metric.likes || 0;
    document.getElementById("tracking-edit-comments").value =
      metric.comments || 0;
    document.getElementById("tracking-edit-shares").value = metric.shares || 0;
    const followsInput = document.getElementById("tracking-edit-follows");
    if (followsInput) followsInput.value = metric.follows || 0;
    document.getElementById("tracking-edit-notes").value = metric.notes || "";

    // 수정 모달 열기
    const editModal = document.getElementById("tracking-edit-modal");
    if (editModal) {
      // 날짜 탭 설정
      editModal
        .querySelectorAll(".date-tab")
        .forEach((tab) => tab.classList.remove("active"));
      const customTab = editModal.querySelector(
        '.date-tab[data-date="custom"]'
      );
      if (customTab) customTab.classList.add("active");
      document.getElementById("tracking-edit-date").style.display = "block";

      this._openBottomSheet(editModal);
    }
  } catch (error) {
    console.error("[TrackingManager] 메트릭 수정 실패:", error);
    this._showMessage("메트릭을 불러오는데 실패했습니다.", "error");
  }
};

/**
 * 메트릭 관리 모달에서 메트릭 삭제
 * 
 * 선택한 메트릭을 삭제합니다.
 * 
 * @async
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 * @param {number} metricIndex - 메트릭 인덱스
 * @returns {Promise<void>}
 */
TrackingManager.prototype.deleteMetricFromManage = async function (
  postId,
  textId,
  metricIndex
) {
  if (!this.app.currentUser || !this.app.isFirebaseReady) return;

  if (!confirm("정말로 이 트래킹 데이터를 삭제하시겠습니까?")) {
    return;
  }

  try {
    // 포스트 데이터 가져오기
    let postData = null;
    let postRef = null;

    try {
      // postId로 직접 조회
      postRef = window.firebaseDoc(
        this.app.db,
        "users",
        this.app.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);

      if (postDoc.exists()) {
        postData = postDoc.data();
      } else if (textId) {
        // textId로 찾기
        const postsRef = window.firebaseCollection(
          this.app.db,
          "users",
          this.app.currentUser.uid,
          "posts"
        );
        const textQuerySnapshot = await window.firebaseGetDocs(
          window.firebaseQuery(
            postsRef,
            window.firebaseWhere("sourceTextId", "==", textId)
          )
        );
        if (!textQuerySnapshot.empty) {
          const postDoc = textQuerySnapshot.docs[0];
          postRef = window.firebaseDoc(
            this.app.db,
            "users",
            this.app.currentUser.uid,
            "posts",
            postDoc.id
          );
          postData = postDoc.data();
        }
      }
    } catch (error) {
      console.error("[TrackingManager] 포스트 조회 실패:", error);
    }

    if (!postData || !postRef) {
      this._showMessage("포스트를 찾을 수 없습니다.", "error");
      return;
    }

    // 메트릭 배열에서 해당 항목 제거
    const updatedMetrics = postData.metrics.filter(
      (_, idx) => idx !== metricIndex
    );

    // 분석 데이터 계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase 업데이트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 메트릭 관리 모달 새로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // 메트릭 관리 모달이 열려있으면 새로고침
      const refreshPostId = postRef.id || postId;
      const self = this;
      setTimeout(() => {
        self.manageMetrics(refreshPostId);
      }, 300);
    } else {
      // 메트릭 관리 모달이 닫혀있으면 일반 UI 업데이트
      this._refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this._showMessage("✅ 트래킹 데이터가 삭제되었습니다!", "success");
  } catch (error) {
    console.error("[TrackingManager] 트래킹 데이터 삭제 실패:", error);
    this._showMessage(
      "❌ 트래킹 데이터 삭제에 실패했습니다: " + error.message,
      "error"
    );
  }
};

/**
 * 일괄 선택 모드 이벤트 바인딩
 * 
 * 일괄 선택 모드 토글, 전체 선택/해제, 체크박스 클릭, 일괄 삭제 버튼 이벤트를 바인딩합니다.
 * 
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 */
TrackingManager.prototype.bindBatchSelectEvents = function (postId, textId) {
  const toggleBtn = document.getElementById("batch-select-toggle");
  const selectInfo = document.getElementById("batch-select-info");
  const selectAllBtn = document.getElementById("select-all-metrics");
  const deselectAllBtn = document.getElementById("deselect-all-metrics");
  const batchDeleteActions = document.getElementById("batch-delete-actions");
  const batchDeleteBtn = document.getElementById("batch-delete-btn");
  const content = document.getElementById("metrics-manage-content");

  if (!toggleBtn || !content) return;

  const self = this;

  // 일괄 선택 모드 토글
  toggleBtn.addEventListener("click", () => {
    self.isBatchSelectMode = !self.isBatchSelectMode;
    self.selectedMetricIndices = [];

    if (self.isBatchSelectMode) {
      toggleBtn.textContent = "❌ 취소";
      toggleBtn.style.background = "#dc3545";
      if (selectInfo) selectInfo.style.display = "block";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    } else {
      toggleBtn.textContent = "📋 일괄 선택";
      toggleBtn.style.background = "";
      if (selectInfo) selectInfo.style.display = "none";
      if (batchDeleteActions) batchDeleteActions.style.display = "none";
    }

    // 메트릭 목록 다시 렌더링
    self.refreshMetricsListForManage(postId, textId);
  });

  // 전체 선택
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => {
        const index = parseInt(cb.getAttribute("data-metric-index"));
        if (!self.selectedMetricIndices.includes(index)) {
          self.selectedMetricIndices.push(index);
        }
        cb.checked = true;
      });
      self.updateBatchSelectUI();
    });
  }

  // 전체 해제
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      self.selectedMetricIndices = [];
      const checkboxes = content.querySelectorAll(".metric-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      self.updateBatchSelectUI();
    });
  }

  // 체크박스 클릭 이벤트
  content.addEventListener("change", (e) => {
    if (e.target.classList.contains("metric-checkbox")) {
      const index = parseInt(e.target.getAttribute("data-metric-index"));
      if (e.target.checked) {
        if (!self.selectedMetricIndices.includes(index)) {
          self.selectedMetricIndices.push(index);
        }
      } else {
        self.selectedMetricIndices = self.selectedMetricIndices.filter(
          (i) => i !== index
        );
      }
      self.updateBatchSelectUI();
    }
  });

  // 일괄 삭제 버튼
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener("click", () => {
      if (self.selectedMetricIndices.length === 0) {
        self._showMessage("선택된 항목이 없습니다.", "warning");
        return;
      }

      if (
        confirm(
          `선택된 ${self.selectedMetricIndices.length}개의 메트릭을 삭제하시겠습니까?`
        )
      ) {
        self.batchDeleteMetrics(postId, textId);
      }
    });
  }
};

/**
 * 일괄 선택 UI 업데이트
 * 
 * 선택된 항목 개수를 UI에 반영합니다.
 */
TrackingManager.prototype.updateBatchSelectUI = function () {
  const selectedCount = document.getElementById("selected-count");
  const batchDeleteCount = document.getElementById("batch-delete-count");
  const batchDeleteActions = document.getElementById("batch-delete-actions");

  const count = this.selectedMetricIndices.length;

  if (selectedCount) {
    selectedCount.textContent = count;
  }

  if (batchDeleteCount) {
    batchDeleteCount.textContent = count;
  }

  if (batchDeleteActions) {
    batchDeleteActions.style.display = count > 0 ? "block" : "none";
  }
};

/**
 * 메트릭 목록 새로고침 (일괄 선택 모드 상태 반영)
 * 
 * 메트릭 목록을 다시 렌더링합니다.
 * 
 * @async
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 * @returns {Promise<void>}
 */
TrackingManager.prototype.refreshMetricsListForManage = async function (
  postId,
  textId
) {
  try {
    // 포스트 데이터 가져오기
    let postData = null;
    if (this.trackingPosts) {
      postData = this.trackingPosts.find((p) => p.id === postId);
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      try {
        const postRef = window.firebaseDoc(
          this.app.db,
          "users",
          this.app.currentUser.uid,
          "posts",
          postId
        );
        const postDoc = await window.firebaseGetDoc(postRef);

        if (postDoc.exists()) {
          const data = postDoc.data();
          postData = {
            id: postDoc.id,
            metrics: data.metrics || [],
          };
        }
      } catch (error) {
        console.error("[TrackingManager] 포스트 조회 실패:", error);
      }
    }

    if (!postData || !postData.metrics || postData.metrics.length === 0) {
      return;
    }

    // 메트릭 목록 다시 렌더링
    const metricsHtml = this.renderMetricsListForManage(
      postData.metrics,
      postId,
      textId
    );
    const content = document.getElementById("metrics-manage-content");
    if (content) {
      const listContainer = content.querySelector(".metrics-manage-list");
      if (listContainer) {
        listContainer.outerHTML = metricsHtml;
      }
    }
  } catch (error) {
    console.error("[TrackingManager] 메트릭 목록 새로고침 실패:", error);
  }
};

/**
 * 일괄 삭제 함수
 * 
 * 선택된 메트릭들을 일괄 삭제합니다.
 * 
 * @async
 * @param {string} postId - 포스트 ID
 * @param {string} textId - 소스 텍스트 ID
 * @returns {Promise<void>}
 */
TrackingManager.prototype.batchDeleteMetrics = async function (postId, textId) {
  if (!this.app.currentUser || !this.app.isFirebaseReady) {
    this._showMessage("로그인이 필요합니다.", "error");
    return;
  }

  if (this.selectedMetricIndices.length === 0) {
    this._showMessage("선택된 항목이 없습니다.", "warning");
    return;
  }

  try {
    // 포스트 데이터 가져오기
    let postData = null;
    let postRef = null;

    try {
      postRef = window.firebaseDoc(
        this.app.db,
        "users",
        this.app.currentUser.uid,
        "posts",
        postId
      );
      const postDoc = await window.firebaseGetDoc(postRef);

      if (postDoc.exists()) {
        postData = postDoc.data();
      } else if (textId) {
        const postsRef = window.firebaseCollection(
          this.app.db,
          "users",
          this.app.currentUser.uid,
          "posts"
        );
        const textQuerySnapshot = await window.firebaseGetDocs(
          window.firebaseQuery(
            postsRef,
            window.firebaseWhere("sourceTextId", "==", textId)
          )
        );
        if (!textQuerySnapshot.empty) {
          const doc = textQuerySnapshot.docs[0];
          postRef = window.firebaseDoc(
            this.app.db,
            "users",
            this.app.currentUser.uid,
            "posts",
            doc.id
          );
          postData = doc.data();
        }
      }
    } catch (error) {
      console.error("[TrackingManager] 포스트 조회 실패:", error);
    }

    if (!postData || !postRef) {
      this._showMessage("포스트를 찾을 수 없습니다.", "error");
      return;
    }

    // 선택된 인덱스를 내림차순으로 정렬 (뒤에서부터 삭제하여 인덱스 변경 방지)
    const sortedIndices = [...this.selectedMetricIndices].sort((a, b) => b - a);

    // 메트릭 배열에서 선택된 항목 제거
    let updatedMetrics = [...(postData.metrics || [])];
    sortedIndices.forEach((index) => {
      if (index >= 0 && index < updatedMetrics.length) {
        updatedMetrics.splice(index, 1);
      }
    });

    // 분석 데이터 계산
    const analytics =
      updatedMetrics.length > 0 ? this.calculateAnalytics(updatedMetrics) : {};

    // Firebase 업데이트
    await window.firebaseUpdateDoc(postRef, {
      metrics: updatedMetrics,
      analytics,
      updatedAt: window.firebaseServerTimestamp(),
    });

    // 로컬 데이터 업데이트
    const post = this.trackingPosts?.find(
      (p) => p.id === postRef.id || p.sourceTextId === textId
    );
    if (post) {
      post.metrics = updatedMetrics;
      post.analytics = analytics;
    }

    // 일괄 선택 모드 해제
    this.isBatchSelectMode = false;
    this.selectedMetricIndices = [];

    // 메트릭 관리 모달 새로고침
    const manageModal = document.getElementById("metrics-manage-modal");
    const isManageModalOpen =
      manageModal &&
      (manageModal.classList.contains("bottom-sheet-open") ||
        manageModal.style.display !== "none");

    if (isManageModalOpen) {
      // 메트릭 관리 모달이 열려있으면 새로고침
      const self = this;
      setTimeout(() => {
        self.manageMetrics(postRef.id || postId);
      }, 300);
    } else {
      // 메트릭 관리 모달이 닫혀있으면 일반 UI 업데이트
      this._refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });
    }

    this._showMessage(
      `✅ ${sortedIndices.length}개의 트래킹 데이터가 삭제되었습니다!`,
      "success"
    );
  } catch (error) {
    console.error("[TrackingManager] 일괄 삭제 실패:", error);
    this._showMessage("❌ 일괄 삭제에 실패했습니다: " + error.message, "error");
  }
};
