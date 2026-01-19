/**
 * ============================================================================
 * OrderManager - 스크립트 순서 관리 모듈
 * ============================================================================
 * 
 * [리팩토링 날짜] 2026-01-19
 * [원본 위치] script.js
 * [이동된 함수]
 *   - initializeArticleOrders() → initialize()
 *   - canMoveUp() → canMoveUp()
 *   - canMoveDown() → canMoveDown()
 *   - moveArticleOrder() → move()
 * 
 * [의존성]
 *   - DualTextWriter 인스턴스 (this.app)
 *   - Firebase: firebaseDoc, firebaseUpdateDoc, firebaseWriteBatch
 */

export class OrderManager {
  /**
   * OrderManager 생성자
   * @param {DualTextWriter} app - 메인 앱 인스턴스
   */
  constructor(app) {
    this.app = app;
  }

  // ============================================================================
  // [R2-03-01] initialize() - 기존 initializeArticleOrders()
  // order 필드 초기화 및 중복 정리
  // ============================================================================
  /**
   * order 필드 초기화 및 중복 정리
   * - order가 없거나, 중복된 order가 있는 경우 실행
   * - createdAt 기준으로 재정렬하여 타임스탬프 기반 order 할당
   */
  async initialize() {
    if (!this.app.currentUser || !this.app.isFirebaseReady) return;

    // 카테고리별로 그룹화
    const articlesByCategory = {};
    this.app.managementArticles.forEach((article) => {
      const category = article.category || "미분류";
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = [];
      }
      articlesByCategory[category].push(article);
    });

    try {
      const batch = window.firebaseWriteBatch(this.app.db);
      let batchCount = 0;
      let hasUpdates = false;

      for (const [category, articles] of Object.entries(articlesByCategory)) {
        // 중복 체크
        const orders = articles.map((a) => a.order);
        const hasDuplicates = new Set(orders).size !== orders.length;
        const hasMissingOrder = articles.some(
          (a) => a.order === undefined || a.order === null
        );
        // [Fix] characterCount 누락 확인
        const hasMissingCharCount = articles.some(
          (a) => typeof a.characterCount !== "number"
        );

        if (hasDuplicates || hasMissingOrder || hasMissingCharCount) {
          console.log(
            `[Order/Data Fix] ${category}: 데이터 보정(순서/글자수)을 시작합니다.`
          );

          // createdAt 오름차순 정렬 (과거 -> 최신)
          articles.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
          });

          // order 재할당 및 characterCount 보정
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const date = article.createdAt?.toDate?.() || new Date();
            let newOrder = date.getTime();

            // 이전 글보다 작거나 같으면 1ms 증가 (정렬 순서 유지)
            if (i > 0) {
              const prevOrder = articles[i - 1].order;
              if (newOrder <= prevOrder) {
                newOrder = prevOrder + 1;
              }
            }

            // 업데이트가 필요한지 확인
            const needsOrderUpdate = article.order !== newOrder;
            const needsCharCountUpdate =
              typeof article.characterCount !== "number";

            if (needsOrderUpdate || needsCharCountUpdate) {
              const updateData = {};
              
              if (needsOrderUpdate) {
                article.order = newOrder;
                updateData.order = newOrder;
              }
              
              if (needsCharCountUpdate) {
                const count = (article.content || "").length;
                article.characterCount = count;
                updateData.characterCount = count;
              }

              const articleRef = window.firebaseDoc(
                this.app.db,
                "users",
                this.app.currentUser.uid,
                "texts",
                article.id
              );
              batch.update(articleRef, updateData);
              batchCount++;
              hasUpdates = true;
            }
          }
          console.log(`[Order/Data Fix] ${category}: 보정 완료`);
        }
      }

      if (hasUpdates) {
        await batch.commit();
        console.log(
          `[Order Fix] 총 ${batchCount}개의 글 순서가 업데이트되었습니다.`
        );
      }
    } catch (error) {
      console.error("order 필드 초기화 실패:", error);
    }
  }

  // ============================================================================
  // [R2-03-02] canMoveUp() - 위로 이동 가능 여부
  // ============================================================================
  /**
   * 위로 이동 가능 여부 판단
   * @param {Object} article - 대상 아티클
   * @param {string} filterCategory - 현재 필터 카테고리
   * @returns {boolean} 위로 이동 가능 여부
   */
  canMoveUp(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.app.managementArticles.filter(
          (a) => (a.category || "미분류") === filterCategory
        )
      : this.app.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분류") === (article.category || "미분류")
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

    return sameCategory[0]?.id !== article.id;
  }

  // ============================================================================
  // [R2-03-03] canMoveDown() - 아래로 이동 가능 여부
  // ============================================================================
  /**
   * 아래로 이동 가능 여부 판단
   * @param {Object} article - 대상 아티클
   * @param {string} filterCategory - 현재 필터 카테고리
   * @returns {boolean} 아래로 이동 가능 여부
   */
  canMoveDown(article, filterCategory = "") {
    const filtered = filterCategory
      ? this.app.managementArticles.filter(
          (a) => (a.category || "미분류") === filterCategory
        )
      : this.app.managementArticles;

    const sameCategory = filtered.filter(
      (a) => (a.category || "미분류") === (article.category || "미분류")
    );
    sameCategory.sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

    return sameCategory[sameCategory.length - 1]?.id !== article.id;
  }

  // ============================================================================
  // [R2-03-04] move() - 기존 moveArticleOrder()
  // 순서 변경 (Firebase 업데이트 포함)
  // ============================================================================
  /**
   * 순서 변경
   * @param {string} articleId - 대상 아티클 ID
   * @param {string} direction - 이동 방향 ('up' | 'down')
   */
  async move(articleId, direction) {
    if (!this.app.currentUser || !this.app.isFirebaseReady) return;

    try {
      const article = this.app.managementArticles.find((a) => a.id === articleId);
      if (!article) return;

      const category = article.category || "미분류";
      const sameCategoryArticles = this.app.managementArticles
        .filter((a) => (a.category || "미분류") === category)
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // 내림차순 정렬

      const currentIndex = sameCategoryArticles.findIndex(
        (a) => a.id === articleId
      );
      if (currentIndex === -1) return;

      let targetIndex;
      if (direction === "up") {
        if (currentIndex === 0) return; // 이미 첫 번째
        targetIndex = currentIndex - 1;
      } else {
        if (currentIndex === sameCategoryArticles.length - 1) return; // 이미 마지막
        targetIndex = currentIndex + 1;
      }

      const targetArticle = sameCategoryArticles[targetIndex];
      const currentOrder = article.order || 0;
      const targetOrder = targetArticle.order || 0;

      // 순서 교환 (Firebase 업데이트)
      const articleRef = window.firebaseDoc(
        this.app.db,
        "users",
        this.app.currentUser.uid,
        "texts",
        articleId
      );
      const targetRef = window.firebaseDoc(
        this.app.db,
        "users",
        this.app.currentUser.uid,
        "texts",
        targetArticle.id
      );

      await Promise.all([
        window.firebaseUpdateDoc(articleRef, { order: targetOrder }),
        window.firebaseUpdateDoc(targetRef, { order: currentOrder }),
      ]);

      // 로컬 데이터 업데이트
      article.order = targetOrder;
      targetArticle.order = currentOrder;

      // UI 리렌더링
      const currentCategory = this.app.categorySelect?.value || "";
      this.app.renderArticleCards(currentCategory);
    } catch (error) {
      console.error("순서 변경 실패:", error);
      this.app.showMessage("❌ 순서 변경 중 오류가 발생했습니다.", "error");
    }
  }
}
