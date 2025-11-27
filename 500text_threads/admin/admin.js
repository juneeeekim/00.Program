/**
 * Admin Dashboard - Main JavaScript
 *
 * 격리 전략 (Isolation Strategy):
 * - IIFE 패턴으로 전역 오염 방지
 * - 'use strict' 모드 사용
 * - Firebase Custom Claims 기반 인증
 * - 최소한의 전역 노출 (window.AdminDashboard만)
 *
 * @version 2.0.0 - Phase 2: Security & Authentication
 * @date 2025-11-25
 */

(function () {
  "use strict";

  /**
   * AdminDashboard 클래스
   * 관리자 대시보드의 모든 기능을 관리하는 메인 클래스
   */
  class AdminDashboard {
    constructor() {
      this.version = "2.0.0";
      this.initialized = false;
      this.auth = null;
      this.db = null;
      this.currentUser = null;
      this.mainChart = null;

      // Chart.js 로드 확인
      this.checkDependencies();

      // Firebase 초기화 및 인증 체크
      this.initFirebase();
    }

    /**
     * 의존성 라이브러리 확인
     */
    checkDependencies() {
      if (typeof Chart === "undefined") {
        console.warn("⚠️ Chart.js가 로드되지 않았습니다.");
        return false;
      }

      console.log("✅ Chart.js 로드 완료:", Chart.version);

      if (typeof firebase === "undefined") {
        console.error("❌ Firebase SDK가 로드되지 않았습니다.");
        return false;
      }

      console.log("✅ Firebase SDK 로드 완료");
      return true;
    }

    /**
     * Firebase 초기화
     */
    async initFirebase() {
      try {
        console.log("🔧 Firebase 초기화 중...");

        // Firebase가 이미 초기화되어 있는지 확인
        if (firebase.apps.length === 0) {
          console.warn("⚠️ Firebase가 초기화되지 않았습니다.");
          console.warn(
            "📝 firebase-config.js에서 Firebase를 초기화해야 합니다."
          );
          this.redirectToMain("Firebase 초기화 필요");
          return;
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        console.log("✅ Firebase 초기화 완료");

        // 인증 상태 변경 감지
        this.auth.onAuthStateChanged((user) => {
          if (user) {
            console.log("👤 사용자 로그인 감지:", user.email);
            this.checkAdminAccess(user);
          } else {
            console.warn("⚠️ 로그인되지 않음");
            this.redirectToMain("로그인이 필요합니다");
          }
        });
      } catch (error) {
        console.error("❌ Firebase 초기화 실패:", error);
        this.redirectToMain("Firebase 초기화 실패");
      }
    }

    /**
     * 관리자 권한 확인
     * Custom Claims에서 admin 권한 확인
     */
    async checkAdminAccess(user) {
      try {
        console.log("🔐 관리자 권한 확인 중...");

        // ID 토큰 가져오기 (Custom Claims 포함)
        const idTokenResult = await user.getIdTokenResult();

        console.log("🔍 Custom Claims:", idTokenResult.claims);

        // Custom Claims에서 admin 권한 확인
        if (idTokenResult.claims.admin === true) {
          console.log("✅ 관리자 권한 확인됨");
          this.currentUser = user;
          this.init();
        } else {
          console.warn("⚠️ 관리자 권한 없음");
          console.warn("📝 이 사용자에게 관리자 권한을 부여하려면:");
          console.warn(`   firebase functions:shell`);
          console.warn(`   setAdminClaim({uid: '${user.uid}'})`);
          this.redirectToMain("관리자 권한이 필요합니다");
        }
      } catch (error) {
        console.error("❌ 권한 확인 실패:", error);
        this.redirectToMain("권한 확인 실패");
      }
    }

    /**
     * 메인 페이지로 리다이렉트
     * @param {string} reason - 리다이렉트 사유
     */
    redirectToMain(reason) {
      console.warn(`🚫 접근 차단: ${reason}`);

      // 사용자에게 알림
      alert(
        `접근이 거부되었습니다.\n\n사유: ${reason}\n\n메인 페이지로 이동합니다.`
      );

      // 히스토리 남기지 않고 리다이렉트 (뒤로가기 방지)
      window.location.replace("../index.html");
    }

    /**
     * 대시보드 초기화 (관리자 권한 확인 후에만 실행)
     */
    init() {
      if (this.initialized) {
        console.warn("⚠️ AdminDashboard가 이미 초기화되었습니다.");
        return;
      }

      console.log("🚀 AdminDashboard 초기화 시작...");

      // DOM 로드 확인
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.setup());
      } else {
        this.setup();
      }
    }

    /**
     * 대시보드 설정
     */
    setup() {
      console.log("⚙️ AdminDashboard 설정 중...");

      // 환경 정보 출력
      this.logEnvironment();

      // 사용자 정보 표시
      this.displayUserInfo();

      // 전역 변수 오염 체크
      this.checkGlobalPollution();

      // 네비게이션 설정
      this.setupNavigation();

      // Chart.js 초기화
      this.initializeCharts();

      // 이벤트 리스너 설정
      this.setupEventListeners();

      // 6-3. 필터 설정
      this.setupFilters();

      // 데이터 로드
      this.loadDashboardData();

      // 6-4. 게시물 목록 로드
      this.loadPosts();

      this.initialized = true;
      console.log("✅ AdminDashboard 초기화 완료");
      console.log("📊 관리자 대시보드가 준비되었습니다.");
    }

    /**
     * 네비게이션 설정
     */
    setupNavigation() {
      const navButtons = document.querySelectorAll(".admin-nav__item");
      const sections = document.querySelectorAll(".admin-section");

      if (navButtons.length === 0) {
        console.warn("⚠️ 네비게이션 버튼을 찾을 수 없습니다.");
        return;
      }

      navButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const targetSection = button.dataset.section;

          // 모든 버튼 비활성화
          navButtons.forEach((btn) => {
            btn.classList.remove("admin-nav__item--active");
            btn.setAttribute("aria-selected", "false");
          });

          // 클릭된 버튼 활성화
          button.classList.add("admin-nav__item--active");
          button.setAttribute("aria-selected", "true");

          // 모든 섹션 숨기기
          sections.forEach((section) => {
            section.classList.add("admin-hidden");
            section.setAttribute("aria-hidden", "true");
          });

          // 선택된 섹션 표시
          const activeSection = document.getElementById(
            `admin-${targetSection}`
          );
          if (activeSection) {
            activeSection.classList.remove("admin-hidden");
            activeSection.setAttribute("aria-hidden", "false");
            console.log(`📍 섹션 전환: ${targetSection}`);
          }
        });

        // 키보드 접근성
        button.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            button.click();
          }
        });
      });

      console.log("✅ 네비게이션 설정 완료");
    }

    /**
     * Chart.js 초기화 (6-2)
     */
    initializeCharts() {
      const canvas = document.getElementById("admin-chart-main");
      if (!canvas) return;

      if (typeof Chart === "undefined") return;

      // CSS 변수 가져오기
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
              label: "활성 사용자",
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

      console.log("✅ Chart.js 차트 생성 완료");
    }

    /**
     * 필터 설정 (6-3)
     */
    setupFilters() {
      const startDateInput = document.getElementById("filter-start-date");
      const endDateInput = document.getElementById("filter-end-date");
      const resetBtn = document.getElementById("filter-reset-btn");

      if (!startDateInput || !endDateInput || !resetBtn) return;

      // 기본값: 최근 1개월
      const today = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(today.getMonth() - 1);

      startDateInput.valueAsDate = lastMonth;
      endDateInput.valueAsDate = today;

      const handleFilterChange = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;
        console.log(`📅 필터 변경: ${start} ~ ${end}`);

        // 필터 변경 알림 (접근성)
        const announcement = document.createElement("div");
        announcement.setAttribute("aria-live", "polite");
        announcement.classList.add("sr-only"); // 화면엔 안보이게
        announcement.textContent = `기간이 ${start}부터 ${end}까지로 변경되었습니다.`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);

        // 게시물 목록 다시 로드
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
     * 게시물 목록 로드 (6-4)
     */
    async loadPosts(startDate = null, endDate = null, isNextPage = false) {
      const listContainer = document.getElementById("post-list-content");
      const paginationContainer = document.getElementById("post-pagination");
      if (!listContainer) return;

      if (!isNextPage) {
        listContainer.innerHTML = '<p class="admin-loading">게시물 데이터 로딩 중...</p>';
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
            listContainer.innerHTML = '<p class="admin-no-data">게시물이 없습니다.</p>';
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
        console.error("❌ 게시물 로드 실패:", error);
        if (error.code === "failed-precondition") {
          listContainer.innerHTML =
            '<p class="admin-error-text">인덱스 생성이 필요합니다. 콘솔을 확인하세요.</p>';
        } else {
          listContainer.innerHTML =
            '<p class="admin-error-text">게시물을 불러오는데 실패했습니다.</p>';
        }
      }
    }

    /**
     * 게시물 목록 렌더링 (6-4)
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
              data.content || "내용 없음"
            )}</a>
            <div class="admin-post-meta">
              <span>📅 ${date}</span>
              <span>🏷️ ${data.topic || "미지정"}</span>
            </div>
          </div>
          <div class="admin-post-stats">
            <div class="admin-post-views">👁️ ${views}</div>
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
      btn.textContent = "더 보기 👇";
      btn.onclick = () => this.loadPosts(startDate, endDate, true);

      paginationContainer.appendChild(btn);
    }

    getPlatformIcon(platform) {
      switch (platform.toLowerCase()) {
        case "twitter":
          return "🐦";
        case "instagram":
          return "📷";
        case "facebook":
          return "📘";
        default:
          return "📝";
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
     * 대시보드 데이터 로드
     */
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
      const refreshBtn = document.getElementById("refresh-stats-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => this.refreshStats());
      }
    }

    /**
     * 대시보드 데이터 로드 (Read-Only)
     * admin_stats 컬렉션에서 집계된 데이터를 읽어옵니다.
     */
    async loadDashboardData() {
      this.showLoading();
      // 스켈레톤 표시 (6-2)
      const skeleton = document.getElementById("chart-skeleton");
      const chartContainer = document.querySelector(".admin-chart-container");
      if (skeleton && chartContainer) {
        skeleton.classList.remove("admin-hidden");
        chartContainer.classList.add("admin-hidden");
      }

      try {
        console.log("📊 대시보드 데이터 로딩 중...");

        // 저장된 통계 데이터 읽기 (1회 Read)
        const statsDoc = await this.db
          .collection("admin_stats")
          .doc("summary")
          .get();

        if (statsDoc.exists) {
          const data = statsDoc.data();
          this.renderStats(data);
          console.log("✅ 대시보드 데이터 로드 완료 (Cached)");
        } else {
          // 데이터가 없으면 갱신 유도
          this.showNoDataState();
          console.log("ℹ️ 저장된 통계 데이터가 없습니다.");
        }
      } catch (error) {
        console.error("❌ 데이터 로드 실패:", error);
        this.showError("데이터를 불러오는데 실패했습니다.");
      } finally {
        this.hideLoading();
        // 스켈레톤 숨기기 (6-2)
        const skeleton = document.getElementById("chart-skeleton");
        const chartContainer = document.querySelector(".admin-chart-container");
        if (skeleton && chartContainer) {
          skeleton.classList.add("admin-hidden");
          chartContainer.classList.remove("admin-hidden");
        }
      }
    }

    /**
     * 데이터 갱신 (Write - Admin Only)
     * 전체 데이터를 집계하여 admin_stats에 저장합니다.
     */
    async refreshStats() {
      if (
        !confirm(
          "전체 데이터를 집계하시겠습니까?\n데이터 양에 따라 시간이 걸릴 수 있습니다."
        )
      )
        return;

      this.setRefreshing(true);
      try {
        console.log("🔄 데이터 집계 시작...");

        // 1. 전체 사용자 조회
        const usersSnapshot = await this.db.collection("users").get();
        let totalTexts = 0;
        let totalPosts = 0;

        // 월별 활동 집계용 객체 (Key: 'YYYY-MM', Value: count)
        const monthlyCounts = {};

        // 최근 6개월 라벨 생성
        const today = new Date();
        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          last6Months.push(key);
          monthlyCounts[key] = 0; // 초기화
        }

        console.log(`   - 사용자 ${usersSnapshot.size}명 처리 중...`);

        // 2. 각 사용자의 데이터 집계 (병렬 처리)
        const promises = usersSnapshot.docs.map(async (doc) => {
          const texts = await doc.ref.collection("texts").get();
          const posts = await doc.ref.collection("posts").get();

          // 텍스트 작성일 집계
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

        // 3. 차트 데이터 변환
        const chartLabels = last6Months.map((key) => {
          const [year, month] = key.split("-");
          return `${month}월`;
        });
        const chartValues = last6Months.map((key) => monthlyCounts[key]);

        // 4. 통계 데이터 구성
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

        // 5. 저장
        await this.db.collection("admin_stats").doc("summary").set(statsData);

        // 6. UI 업데이트
        const renderData = { ...statsData, lastUpdated: new Date() };
        this.renderStats(renderData);

        console.log("✅ 데이터 집계 및 저장 완료");
        console.log("📊 월별 데이터:", monthlyCounts);
        alert("데이터가 성공적으로 갱신되었습니다.");
      } catch (error) {
        console.error("❌ 데이터 갱신 실패:", error);
        alert("데이터 갱신 중 오류가 발생했습니다: " + error.message);
      } finally {
        this.setRefreshing(false);
      }
    }

    /**
     * 통계 데이터 렌더링
     */
    renderStats(data) {
      // 숫자 업데이트
      this.animateValue("total-users", data.totalUsers || 0);
      this.animateValue("total-texts", data.totalTexts || 0);
      this.animateValue("total-posts", data.totalPosts || 0);

      // 마지막 업데이트 시간
      const timeEl = document.getElementById("last-updated-time");
      if (timeEl) {
        const date =
          data.lastUpdated instanceof firebase.firestore.Timestamp
            ? data.lastUpdated.toDate()
            : new Date(data.lastUpdated || Date.now());
        timeEl.textContent = date.toLocaleString();
      }

      // 차트 업데이트
      if (data.monthlyActivity && this.mainChart) {
        this.updateChartData(data.monthlyActivity);
      }
    }

    /**
     * 숫자 카운트 애니메이션
     */
    animateValue(id, end) {
      const obj = document.getElementById(id);
      if (!obj) return;

      // 간단한 애니메이션 없이 바로 설정 (오류 방지)
      obj.textContent = end.toLocaleString();
    }

    /**
     * 차트 데이터 업데이트
     */
    updateChartData(monthlyData) {
      if (!this.mainChart) return;

      this.mainChart.data.labels = monthlyData.labels || [];
      this.mainChart.data.datasets[0].data = monthlyData.values || [];
      this.mainChart.update();
    }

    /**
     * 로딩 상태 표시
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
     * 로딩 상태 숨김
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
     * 갱신 중 상태 설정
     */
    setRefreshing(isRefreshing) {
      const btn = document.getElementById("refresh-stats-btn");
      if (!btn) return;

      if (isRefreshing) {
        btn.disabled = true;
        btn.innerHTML = "🔄 집계 중...";
        btn.classList.add("spin");
      } else {
        btn.disabled = false;
        btn.innerHTML = "🔄 데이터 갱신";
        btn.classList.remove("spin");
      }
    }

    /**
     * 데이터 없음 상태 표시
     */
    showNoDataState() {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = "-";
        }
      });

      // 알림 (선택 사항)
      // alert('표시할 데이터가 없습니다. [데이터 갱신] 버튼을 눌러주세요.');
    }

    /**
     * 에러 메시지 표시
     */
    showError(message) {
      const elements = ["total-users", "total-texts", "total-posts"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = "오류";
          el.classList.add("admin-error-text");
        }
      });
      console.error(message);
    }

    /**
     * 환경 정보 로깅
     */
    logEnvironment() {
      console.group("📊 Admin Dashboard Environment");
      console.log("Version:", this.version);
      console.log(
        "Chart.js:",
        typeof Chart !== "undefined" ? Chart.version : "Not loaded"
      );
      console.log(
        "Firebase:",
        firebase.apps.length > 0 ? "Initialized" : "Not initialized"
      );
      console.log("User Agent:", navigator.userAgent);
      console.log("Screen Size:", `${window.innerWidth}x${window.innerHeight}`);
      console.groupEnd();
    }

    /**
     * 사용자 정보 표시
     */
    displayUserInfo() {
      if (!this.currentUser) {
        console.warn("⚠️ 사용자 정보 없음");
        return;
      }

      console.group("👤 관리자 정보");
      console.log("UID:", this.currentUser.uid);
      console.log("Email:", this.currentUser.email || "없음");
      console.log("Display Name:", this.currentUser.displayName || "없음");
      console.log("Email Verified:", this.currentUser.emailVerified);
      console.groupEnd();
    }

    /**
     * 전역 변수 오염 체크
     */
    checkGlobalPollution() {
      const adminGlobals = Object.keys(window).filter(
        (key) => key.toLowerCase().includes("admin") && key !== "AdminDashboard"
      );

      if (adminGlobals.length > 0) {
        console.warn("⚠️ 전역 변수 오염 감지:", adminGlobals);
        return false;
      }

      console.log("✅ 전역 변수 오염 없음");
      return true;
    }
  }

  // 전역 노출 (최소화)
  window.AdminDashboard = AdminDashboard;

  // 자동 초기화
  const dashboard = new AdminDashboard();

  console.log("✅ Admin Dashboard 모듈 로드 완료");
})();
