/**
 * Admin Dashboard - Main JavaScript
 *
 * ê²©ë¦¬ ?„ëµ (Isolation Strategy):
 * - IIFE ?¨í„´?¼ë¡œ ?„ì—­ ?¤ì—¼ ë°©ì?
 * - 'use strict' ëª¨ë“œ ?¬ìš©
 * - Firebase Custom Claims ê¸°ë°˜ ?¸ì¦
 * - ìµœì†Œ?œì˜ ?„ì—­ ?¸ì¶œ (window.AdminDashboardë§?
 *
 * @version 2.0.0 - Phase 2: Security & Authentication
 * @date 2025-11-25
 */

(function () {
  "use strict";

  // ============================================================
  // [P4-06] ?˜ê²½ë³?ë¡œê¹… ? í‹¸ë¦¬í‹° (IIFE ?´ë???
  // - ?„ë¡œ?•ì…˜ ?˜ê²½?ì„œ ì½˜ì†” ë¡œê·¸ ?¸ì¶œ ë°©ì?
  // - ?ëŸ¬ ë¡œê·¸????ƒ ì¶œë ¥ (ëª¨ë‹ˆ?°ë§ ?„ìš”)
  // ============================================================
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const logger = {
    log: (...args) => { if (isDev) logger.log(...args); },
    warn: (...args) => { if (isDev) logger.warn(...args); },
    error: (...args) => { logger.error(...args); }, // ??ƒ ì¶œë ¥
    debug: (...args) => { if (isDev) console.debug(...args); },
  };

  /**
   * AdminDashboard ?´ë˜??
   * ê´€ë¦¬ì ?€?œë³´?œì˜ ëª¨ë“  ê¸°ëŠ¥??ê´€ë¦¬í•˜??ë©”ì¸ ?´ë˜??
   */
  class AdminDashboard {
    constructor() {
      this.version = "2.0.0";
      this.initialized = false;
      this.auth = null;
      this.db = null;
      this.currentUser = null;
      this.mainChart = null;

      // Chart.js ë¡œë“œ ?•ì¸
      this.checkDependencies();

      // Firebase ì´ˆê¸°??ë°??¸ì¦ ì²´í¬
      this.initFirebase();
    }

    /**
     * ?˜ì¡´???¼ì´ë¸ŒëŸ¬ë¦??•ì¸
     */
    checkDependencies() {
      if (typeof Chart === "undefined") {
        logger.warn("? ï¸ Chart.jsê°€ ë¡œë“œ?˜ì? ?Šì•˜?µë‹ˆ??");
        return false;
      }

      logger.log("??Chart.js ë¡œë“œ ?„ë£Œ:", Chart.version);

      if (typeof firebase === "undefined") {
        logger.error("??Firebase SDKê°€ ë¡œë“œ?˜ì? ?Šì•˜?µë‹ˆ??");
        return false;
      }

      logger.log("??Firebase SDK ë¡œë“œ ?„ë£Œ");
      return true;
    }

    /**
     * Firebase ì´ˆê¸°??
     */
    async initFirebase() {
      try {
        logger.log("?”§ Firebase ì´ˆê¸°??ì¤?..");

        // Firebaseê°€ ?´ë? ì´ˆê¸°?”ë˜???ˆëŠ”ì§€ ?•ì¸
        if (firebase.apps.length === 0) {
          logger.warn("? ï¸ Firebaseê°€ ì´ˆê¸°?”ë˜ì§€ ?Šì•˜?µë‹ˆ??");
          logger.warn(
            "?“ firebase-config.js?ì„œ Firebaseë¥?ì´ˆê¸°?”í•´???©ë‹ˆ??"
          );
          this.redirectToMain("Firebase ì´ˆê¸°???„ìš”");
          return;
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        logger.log("??Firebase ì´ˆê¸°???„ë£Œ");

        // ?¸ì¦ ?íƒœ ë³€ê²?ê°ì?
        this.auth.onAuthStateChanged((user) => {
          if (user) {
            logger.log("?‘¤ ?¬ìš©??ë¡œê·¸??ê°ì?:", user.email);
            this.checkAdminAccess(user);
          } else {
            logger.warn("? ï¸ ë¡œê·¸?¸ë˜ì§€ ?ŠìŒ");
            this.redirectToMain("ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??);
          }
        });
      } catch (error) {
        logger.error("??Firebase ì´ˆê¸°???¤íŒ¨:", error);
        this.redirectToMain("Firebase ì´ˆê¸°???¤íŒ¨");
      }
    }

    /**
     * ê´€ë¦¬ì ê¶Œí•œ ?•ì¸
     * Custom Claims?ì„œ admin ê¶Œí•œ ?•ì¸
     */
    async checkAdminAccess(user) {
      try {
        logger.log("?” ê´€ë¦¬ì ê¶Œí•œ ?•ì¸ ì¤?..");

        // ID ? í° ê°€?¸ì˜¤ê¸?(Custom Claims ?¬í•¨)
        const idTokenResult = await user.getIdTokenResult();

        logger.log("?” Custom Claims:", idTokenResult.claims);

        // Custom Claims?ì„œ admin ê¶Œí•œ ?•ì¸
        if (idTokenResult.claims.admin === true) {
          logger.log("??ê´€ë¦¬ì ê¶Œí•œ ?•ì¸??);
          this.currentUser = user;
          this.init();
        } else {
          logger.warn("? ï¸ ê´€ë¦¬ì ê¶Œí•œ ?†ìŒ");
          logger.warn("?“ ???¬ìš©?ì—ê²?ê´€ë¦¬ì ê¶Œí•œ??ë¶€?¬í•˜?¤ë©´:");
          logger.warn(`   firebase functions:shell`);
          logger.warn(`   setAdminClaim({uid: '${user.uid}'})`);
          this.redirectToMain("ê´€ë¦¬ì ê¶Œí•œ???„ìš”?©ë‹ˆ??);
        }
      } catch (error) {
        logger.error("??ê¶Œí•œ ?•ì¸ ?¤íŒ¨:", error);
        this.redirectToMain("ê¶Œí•œ ?•ì¸ ?¤íŒ¨");
      }
    }

    /**
     * ë©”ì¸ ?˜ì´ì§€ë¡?ë¦¬ë‹¤?´ë ‰??
     * @param {string} reason - ë¦¬ë‹¤?´ë ‰???¬ìœ 
     */
    redirectToMain(reason) {
      logger.warn(`?š« ?‘ê·¼ ì°¨ë‹¨: ${reason}`);

      // ?¬ìš©?ì—ê²??Œë¦¼
      alert(
        `?‘ê·¼??ê±°ë??˜ì—ˆ?µë‹ˆ??\n\n?¬ìœ : ${reason}\n\në©”ì¸ ?˜ì´ì§€ë¡??´ë™?©ë‹ˆ??`
      );

      // ?ˆìŠ¤? ë¦¬ ?¨ê¸°ì§€ ?Šê³  ë¦¬ë‹¤?´ë ‰??(?¤ë¡œê°€ê¸?ë°©ì?)
      window.location.replace("../index.html");
    }

    /**
     * ?€?œë³´??ì´ˆê¸°??(ê´€ë¦¬ì ê¶Œí•œ ?•ì¸ ?„ì—ë§??¤í–‰)
     */
    init() {
      if (this.initialized) {
        logger.warn("? ï¸ AdminDashboardê°€ ?´ë? ì´ˆê¸°?”ë˜?ˆìŠµ?ˆë‹¤.");
        return;
      }

      logger.log("?? AdminDashboard ì´ˆê¸°???œì‘...");

      // DOM ë¡œë“œ ?•ì¸
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.setup());
      } else {
        this.setup();
      }
    }

    /**
     * ?€?œë³´???¤ì •
     */
    setup() {
      logger.log("?™ï¸ AdminDashboard ?¤ì • ì¤?..");

      // ?˜ê²½ ?•ë³´ ì¶œë ¥
      this.logEnvironment();

      // ?¬ìš©???•ë³´ ?œì‹œ
      this.displayUserInfo();

      // ?„ì—­ ë³€???¤ì—¼ ì²´í¬
      this.checkGlobalPollution();

      // ?¤ë¹„ê²Œì´???¤ì •
      this.setupNavigation();

      // Chart.js ì´ˆê¸°??
      this.initializeCharts();

      // ?´ë²¤??ë¦¬ìŠ¤???¤ì •
      this.setupEventListeners();

      // 6-3. ?„í„° ?¤ì •
      this.setupFilters();

      // ?°ì´??ë¡œë“œ
      this.loadDashboardData();

      // 6-4. ê²Œì‹œë¬?ëª©ë¡ ë¡œë“œ
      this.loadPosts();

      this.initialized = true;
      logger.log("??AdminDashboard ì´ˆê¸°???„ë£Œ");
      logger.log("?“Š ê´€ë¦¬ì ?€?œë³´?œê? ì¤€ë¹„ë˜?ˆìŠµ?ˆë‹¤.");
    }

    /**
     * ?¤ë¹„ê²Œì´???¤ì •
     */
    setupNavigation() {
      const navButtons = document.querySelectorAll(".admin-nav__item");
      const sections = document.querySelectorAll(".admin-section");

      if (navButtons.length === 0) {
        logger.warn("? ï¸ ?¤ë¹„ê²Œì´??ë²„íŠ¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.");
        return;
      }

      navButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const targetSection = button.dataset.section;

          // ëª¨ë“  ë²„íŠ¼ ë¹„í™œ?±í™”
          navButtons.forEach((btn) => {
            btn.classList.remove("admin-nav__item--active");
            btn.setAttribute("aria-selected", "false");
          });

          // ?´ë¦­??ë²„íŠ¼ ?œì„±??
          button.classList.add("admin-nav__item--active");
          button.setAttribute("aria-selected", "true");

          // ëª¨ë“  ?¹ì…˜ ?¨ê¸°ê¸?
          sections.forEach((section) => {
            section.classList.add("admin-hidden");
            section.setAttribute("aria-hidden", "true");
          });

          // ? íƒ???¹ì…˜ ?œì‹œ
          const activeSection = document.getElementById(
            `admin-${targetSection}`
          );
          if (activeSection) {
            activeSection.classList.remove("admin-hidden");
            activeSection.setAttribute("aria-hidden", "false");
            logger.log(`?“ ?¹ì…˜ ?„í™˜: ${targetSection}`);
          }
        });

        // ?¤ë³´???‘ê·¼??
        button.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            button.click();
          }
        });
      });

      logger.log("???¤ë¹„ê²Œì´???¤ì • ?„ë£Œ");
    }

    /**
     * Chart.js ì´ˆê¸°??(6-2)
     */
    initializeCharts() {
      const canvas = document.getElementById("admin-chart-main");
      if (!canvas) return;

      if (typeof Chart === "undefined") return;

      // CSS ë³€??ê°€?¸ì˜¤ê¸?
      const styles = getComputedStyle(document.documentElement);
      const primaryColor =
        styles.getPropertyValue("--admin-chart-primary").trim() || "#667eea";
      const bgColor =
        styles.getPropertyValue("--admin-chart-bg").trim() ||
        "rgba(102, 126, 234, 0.1)";

      const ctx = canvas.getContext("2d");
      this.mainChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "?œì„± ?¬ìš©??,
              data: [],
              borderColor: primaryColor,
              backgroundColor: bgColor,
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: "index",
              intersect: false,
            },
          },
          scales: {
            y: { beginAtZero: true, grid: { borderDash: [2, 4] } },
            x: { grid: { display: false } },
          },
        },
      });

      logger.log("??Chart.js ì°¨íŠ¸ ?ì„± ?„ë£Œ");
    }

    /**
     * ?„í„° ?¤ì • (6-3)
     */
    setupFilters() {
      const startDateInput = document.getElementById("filter-start-date");
      const endDateInput = document.getElementById("filter-end-date");
      const resetBtn = document.getElementById("filter-reset-btn");

      if (!startDateInput || !endDateInput || !resetBtn) return;

      // ê¸°ë³¸ê°? ìµœê·¼ 1ê°œì›”
      const today = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(today.getMonth() - 1);

      startDateInput.valueAsDate = lastMonth;
      endDateInput.valueAsDate = today;

      const handleFilterChange = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;
        logger.log(`?“… ?„í„° ë³€ê²? ${start} ~ ${end}`);

        // ?„í„° ë³€ê²??Œë¦¼ (?‘ê·¼??
        const announcement = document.createElement("div");
        announcement.setAttribute("aria-live", "polite");
        announcement.classList.add("sr-only"); // ?”ë©´???ˆë³´?´ê²Œ
        announcement.textContent = `ê¸°ê°„??${start}ë¶€??${end}ê¹Œì?ë¡?ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤.`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);

        // ê²Œì‹œë¬?ëª©ë¡ ?¤ì‹œ ë¡œë“œ
        this.loadPosts(start, end);
      };

      startDateInput.addEventListener("change", handleFilterChange);
      endDateInput.addEventListener("change", handleFilterChange);

      resetBtn.addEventListener("click", () => {
        startDateInput.valueAsDate = lastMonth;
        endDateInput.valueAsDate = today;
        handleFilterChange();
      });
    /**
     * ê²Œì‹œë¬?ëª©ë¡ ë¡œë“œ (6-4)
     */
    async loadPosts(startDate = null, endDate = null, isNextPage = false) {
      const listContainer = document.getElementById("post-list-content");
      const paginationContainer = document.getElementById("post-pagination");
      if (!listContainer) return;

      if (!isNextPage) {
        listContainer.innerHTML = '<p class="admin-loading">ê²Œì‹œë¬??°ì´??ë¡œë”© ì¤?..</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        this.lastVisible = null;
      }

      try {
        let query = this.db
          .collectionGroup("posts")
          .orderBy("createdAt", "desc")
          .limit(20);

        if (startDate) {
          const start = new Date(startDate);
          query = query.where("createdAt", ">=", start);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59);
          query = query.where("createdAt", "<=", end);
        }

        if (isNextPage && this.lastVisible) {
          query = query.startAfter(this.lastVisible);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          if (!isNextPage) {
            listContainer.innerHTML = '<p class="admin-no-data">ê²Œì‹œë¬¼ì´ ?†ìŠµ?ˆë‹¤.</p>';
          } else {
            const loadMoreBtn = document.getElementById("load-more-btn");
            if (loadMoreBtn) loadMoreBtn.style.display = "none";
          }
          return;
        }

        this.lastVisible = snapshot.docs[snapshot.docs.length - 1];

        this.renderPostList(snapshot.docs, isNextPage);

        if (snapshot.docs.length === 20) {
          this.renderLoadMoreButton(startDate, endDate);
        } else {
          const loadMoreBtn = document.getElementById("load-more-btn");
          if (loadMoreBtn) loadMoreBtn.style.display = "none";
        }
      } catch (error) {
        logger.error("??ê²Œì‹œë¬?ë¡œë“œ ?¤íŒ¨:", error);
        if (error.code === "failed-precondition") {
          listContainer.innerHTML =
            '<p class="admin-error-text">?¸ë±???ì„±???„ìš”?©ë‹ˆ?? ì½˜ì†”???•ì¸?˜ì„¸??</p>';
        } else {
          listContainer.innerHTML =
            '<p class="admin-error-text">ê²Œì‹œë¬¼ì„ ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.</p>';
        }
      }
    }

    /**
     * ê²Œì‹œë¬?ëª©ë¡ ?Œë”ë§?(6-4)
     */
    renderPostList(docs, isAppend = false) {
      const listContainer = document.getElementById("post-list-content");
      if (!isAppend) listContainer.innerHTML = "";

      docs.forEach((doc) => {
        const data = doc.data();
        const date = data.createdAt
          ? data.createdAt.toDate().toLocaleDateString()
          : "-";
        const views = data.views || 0;
        const platform = data.platform || "etc";

        const item = document.createElement("div");
        item.className = "admin-post-item";
        item.innerHTML = `
          <div class="admin-post-icon">
            ${this.getPlatformIcon(platform)}
          </div>
          <div class="admin-post-info">
            <a href="#" class="admin-post-title">${this.escapeHtml(
              data.content || "?´ìš© ?†ìŒ"
            )}</a>
            <div class="admin-post-meta">
              <span>?“… ${date}</span>
              <span>?·ï¸?${data.topic || "ë¯¸ì???}</span>
            </div>
          </div>
          <div class="admin-post-stats">
            <div class="admin-post-views">?‘ï¸?${views}</div>
          </div>
        `;
        listContainer.appendChild(item);
      });
    }

    renderLoadMoreButton(startDate, endDate) {
      const paginationContainer = document.getElementById("post-pagination");
      if (!paginationContainer) return;

      paginationContainer.innerHTML = "";

      const btn = document.createElement("button");
      btn.id = "load-more-btn";
      btn.className = "admin-btn admin-btn--outline";
      btn.textContent = "??ë³´ê¸° ?‘‡";
      btn.onclick = () => this.loadPosts(startDate, endDate, true);

      paginationContainer.appendChild(btn);
    }

    getPlatformIcon(platform) {
      switch (platform.toLowerCase()) {
        case "twitter":
          return "?¦";
        case "instagram":
          return "?“·";
        case "facebook":
          return "?“˜";
        default:
          return "?“";
      }
    }

    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/[&<>"']/g, function (m) {
        switch (m) {
          case "&":
            return "&amp;";
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case '"':
            return "&quot;";
          case "'":
            return "&#039;";
          default:
            return m;
        }
      });
    }

    /**
     * ?€?œë³´???°ì´??ë¡œë“œ
     */
    /**
     * ?´ë²¤??ë¦¬ìŠ¤???¤ì •
     */
    setupEventListeners() {
      const refreshBtn = document.getElementById("refresh-stats-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => this.refreshStats());
      }
    }

    /**
     * ?€?œë³´???°ì´??ë¡œë“œ (Read-Only)
     * admin_stats ì»¬ë ‰?˜ì—??ì§‘ê³„???°ì´?°ë? ?½ì–´?µë‹ˆ??
     */
    async loadDashboardData() {
      this.showLoading();
      // ?¤ì¼ˆ?ˆí†¤ ?œì‹œ (6-2)
      const skeleton = document.getElementById("chart-skeleton");
      const chartContainer = document.querySelector(".admin-chart-container");
      if (skeleton && chartContainer) {
        skeleton.classList.remove("admin-hidden");
        chartContainer.classList.add("admin-hidden");
      }

      try {
        logger.log("?“Š ?€?œë³´???°ì´??ë¡œë”© ì¤?..");

        // ?€?¥ëœ ?µê³„ ?°ì´???½ê¸° (1??Read)
        const statsDoc = await this.db
          .collection("admin_stats")
          .doc("summary")
          .get();

        if (statsDoc.exists) {
          const data = statsDoc.data();
          this.renderStats(data);
          logger.log("???€?œë³´???°ì´??ë¡œë“œ ?„ë£Œ (Cached)");
        } else {
          // ?°ì´?°ê? ?†ìœ¼ë©?ê°±ì‹  ? ë„
          this.showNoDataState();
          logger.log("?¹ï¸ ?€?¥ëœ ?µê³„ ?°ì´?°ê? ?†ìŠµ?ˆë‹¤.");
        }
      } catch (error) {
        logger.error("???°ì´??ë¡œë“œ ?¤íŒ¨:", error);
        this.showError("?°ì´?°ë? ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤.");
      } finally {
        this.hideLoading();
        // ?¤ì¼ˆ?ˆí†¤ ?¨ê¸°ê¸?(6-2)
        const skeleton = document.getElementById("chart-skeleton");
        const chartContainer = document.querySelector(".admin-chart-container");
        if (skeleton && chartContainer) {
          skeleton.classList.add("admin-hidden");
          chartContainer.classList.remove("admin-hidden");
        }
      }
    }

    /**
     * ?°ì´??ê°±ì‹  (Write - Admin Only)
     * ?„ì²´ ?°ì´?°ë? ì§‘ê³„?˜ì—¬ admin_stats???€?¥í•©?ˆë‹¤.
     */
    async refreshStats() {
      if (
        !confirm(
          "?„ì²´ ?°ì´?°ë? ì§‘ê³„?˜ì‹œê² ìŠµ?ˆê¹Œ?\n?°ì´???‘ì— ?°ë¼ ?œê°„??ê±¸ë¦´ ???ˆìŠµ?ˆë‹¤."
        )
      )
        return;

      this.setRefreshing(true);
      try {
        logger.log("?”„ ?°ì´??ì§‘ê³„ ?œì‘...");

        // 1. ?„ì²´ ?¬ìš©??ì¡°íšŒ
        const usersSnapshot = await this.db.collection("users").get();
        let totalTexts = 0;
        let totalPosts = 0;

        // ?”ë³„ ?œë™ ì§‘ê³„??ê°ì²´ (Key: 'YYYY-MM', Value: count)
        const monthlyCounts = {};

        // ìµœê·¼ 6ê°œì›” ?¼ë²¨ ?ì„±
        const today = new Date();
        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          last6Months.push(key);
          monthlyCounts[key] = 0; // ì´ˆê¸°??
        }

        logger.log(`   - ?¬ìš©??${usersSnapshot.size}ëª?ì²˜ë¦¬ ì¤?..`);

        // 2. ê°??¬ìš©?ì˜ ?°ì´??ì§‘ê³„ (ë³‘ë ¬ ì²˜ë¦¬)
        const promises = usersSnapshot.docs.map(async (doc) => {
          const texts = await doc.ref.collection("texts").get();
          const posts = await doc.ref.collection("posts").get();

          // ?ìŠ¤???‘ì„±??ì§‘ê³„
          texts.docs.forEach((textDoc) => {
            const data = textDoc.data();
            if (data.createdAt) {
              const date = data.createdAt.toDate();
              const key = `${date.getFullYear()}-${String(
                date.getMonth() + 1
              ).padStart(2, "0")}`;
              if (monthlyCounts[key] !== undefined) {
                monthlyCounts[key]++;
              }
            }
          });

          return { texts: texts.size, posts: posts.size };
        });

        const results = await Promise.all(promises);
        results.forEach((r) => {
          totalTexts += r.texts;
          totalPosts += r.posts;
        });

        // 3. ì°¨íŠ¸ ?°ì´??ë³€??
        const chartLabels = last6Months.map((key) => {
          const [year, month] = key.split("-");
          return `${month}??;
        });
        const chartValues = last6Months.map((key) => monthlyCounts[key]);

        // 4. ?µê³„ ?°ì´??êµ¬ì„±
        const statsData = {
          totalUsers: usersSnapshot.size,
          totalTexts,
          totalPosts,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          monthlyActivity: {
            labels: chartLabels,
            values: chartValues,
          },
        };

        // 5. ?€??
        await this.db.collection("admin_stats").doc("summary").set(statsData);

        // 6. UI ?…ë°?´íŠ¸
        const renderData = { ...statsData, lastUpdated: new Date() };
        this.renderStats(renderData);

        logger.log("???°ì´??ì§‘ê³„ ë°??€???„ë£Œ");
        logger.log("?“Š ?”ë³„ ?°ì´??", monthlyCounts);
        alert("?°ì´?°ê? ?±ê³µ?ìœ¼ë¡?ê°±ì‹ ?˜ì—ˆ?µë‹ˆ??");
      } catch (error) {
        logger.error("???°ì´??ê°±ì‹  ?¤íŒ¨:", error);
        alert("?°ì´??ê°±ì‹  ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤: " + error.message);
      } finally {
        this.setRefreshing(false);
      }
    }

    /**
     * ?µê³„ ?°ì´???Œë”ë§?
     */
    renderStats(data) {
      // ?«ì ?…ë°?´íŠ¸
      this.animateValue("total-users", data.totalUsers || 0);
      this.animateValue("total-texts", data.totalTexts || 0);
      this.animateValue("total-posts", data.totalPosts || 0);

      // ë§ˆì?ë§??…ë°?´íŠ¸ ?œê°„
      const timeEl = document.getElementById("last-updated-time");
      if (timeEl) {
        const date =
          data.lastUpdated instanceof firebase.firestore.Timestamp
            ? data.lastUpdated.toDate()
            : new Date(data.lastUpdated || Date.now());
        timeEl.textContent = date.toLocaleString();
      }

      // ì°¨íŠ¸ ?…ë°?´íŠ¸
      if (data.monthlyActivity && this.mainChart) {
        this.updateChartData(data.monthlyActivity);
      }
    }

    /**
     * ?«ì ì¹´ìš´??? ë‹ˆë©”ì´??
     */
    animateValue(id, end) {
      const obj = document.getElementById(id);
      if (!obj) return;

      // ê°„ë‹¨??? ë‹ˆë©”ì´???†ì´ ë°”ë¡œ ?¤ì • (?¤ë¥˜ ë°©ì?)
      obj.textContent = end.toLocaleString();
    }

    /**
     * ì°¨íŠ¸ ?°ì´???…ë°?´íŠ¸
     */
    updateChartData(monthlyData) {
      if (!this.mainChart) return;

      this.mainChart.data.labels = monthlyData.labels || [];
      this.mainChart.data.datasets[0].data = monthlyData.values || [];
      this.mainChart.update();
    }

    /**
     * ë¡œë”© ?íƒœ ?œì‹œ
     */
    showLoading() {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = "...";
          el.classList.add("admin-loading-text");
        }
      });
    }

    /**
     * ë¡œë”© ?íƒœ ?¨ê?
     */
    hideLoading() {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove("admin-loading-text");
        }
      });
    }

    /**
     * ê°±ì‹  ì¤??íƒœ ?¤ì •
     */
    setRefreshing(isRefreshing) {
      const btn = document.getElementById("refresh-stats-btn");
      if (!btn) return;

      if (isRefreshing) {
        btn.disabled = true;
        btn.innerHTML = "?”„ ì§‘ê³„ ì¤?..";
        btn.classList.add("spin");
      } else {
        btn.disabled = false;
        btn.innerHTML = "?”„ ?°ì´??ê°±ì‹ ";
        btn.classList.remove("spin");
      }
    }

    /**
     * ?°ì´???†ìŒ ?íƒœ ?œì‹œ
     */
    showNoDataState() {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = "-";
        }
      });

      // ?Œë¦¼ (? íƒ ?¬í•­)
      // alert('?œì‹œ???°ì´?°ê? ?†ìŠµ?ˆë‹¤. [?°ì´??ê°±ì‹ ] ë²„íŠ¼???ŒëŸ¬ì£¼ì„¸??');
    }

    /**
     * ?ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
     */
    showError(message) {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = "?¤ë¥˜";
          el.classList.add("admin-error-text");
        }
      });
      logger.error(message);
    }

    /**
     * ?˜ê²½ ?•ë³´ ë¡œê¹…
     */
    logEnvironment() {
      console.group("?“Š Admin Dashboard Environment");
      logger.log("Version:", this.version);
      logger.log(
        "Chart.js:",
        typeof Chart !== "undefined" ? Chart.version : "Not loaded"
      );
      logger.log(
        "Firebase:",
        firebase.apps.length > 0 ? "Initialized" : "Not initialized"
      );
      logger.log("User Agent:", navigator.userAgent);
      logger.log("Screen Size:", `${window.innerWidth}x${window.innerHeight}`);
      console.groupEnd();
    }

    /**
     * ?¬ìš©???•ë³´ ?œì‹œ
     */
    displayUserInfo() {
      if (!this.currentUser) {
        logger.warn("? ï¸ ?¬ìš©???•ë³´ ?†ìŒ");
        return;
      }

      console.group("?‘¤ ê´€ë¦¬ì ?•ë³´");
      logger.log("UID:", this.currentUser.uid);
      logger.log("Email:", this.currentUser.email || "?†ìŒ");
      logger.log("Display Name:", this.currentUser.displayName || "?†ìŒ");
      logger.log("Email Verified:", this.currentUser.emailVerified);
      console.groupEnd();
    }

    /**
     * ?„ì—­ ë³€???¤ì—¼ ì²´í¬
     */
    checkGlobalPollution() {
      const adminGlobals = Object.keys(window).filter(
        (key) => key.toLowerCase().includes("admin") && key !== "AdminDashboard"
      );

      if (adminGlobals.length > 0) {
        logger.warn("? ï¸ ?„ì—­ ë³€???¤ì—¼ ê°ì?:", adminGlobals);
        return false;
      }

      logger.log("???„ì—­ ë³€???¤ì—¼ ?†ìŒ");
      return true;
    }
  }

  // ?„ì—­ ?¸ì¶œ (ìµœì†Œ??
  window.AdminDashboard = AdminDashboard;

  // ?ë™ ì´ˆê¸°??
  const dashboard = new AdminDashboard();

  logger.log("??Admin Dashboard ëª¨ë“ˆ ë¡œë“œ ?„ë£Œ");
})();
