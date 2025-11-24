import {
  formatDate,
  escapeHtml
} from "./utils.js";
import { Constants } from "./constants.js";

/**
 * DashboardManager
 * 관리자 대시보드 기능을 담당하는 클래스
 */
export class DashboardManager {
  constructor(authManager, uiManager, dataManager) {
    this.authManager = authManager;
    this.uiManager = uiManager;
    this.dataManager = dataManager;
    this.db = null; // Will be accessed via dataManager.db
    this.isAdmin = false;
    
    // DOM Elements
    this.dashboardTabBtn = document.getElementById("dashboard-tab-btn");
    this.dashboardContent = document.getElementById("dashboard-tab");
    this.statsContainer = document.getElementById("admin-stats-container");
    this.chartCanvas = document.getElementById("admin-main-chart");
    this.platformChartCanvas = document.getElementById("admin-platform-chart");
    this.logsTableBody = document.getElementById("admin-logs-body");
    this.refreshBtn = document.getElementById("admin-refresh-btn");
    
    // User Management Elements
    this.userSearchInput = document.getElementById("admin-user-search");
    this.userSearchBtn = document.getElementById("admin-user-search-btn");
    this.userResultContainer = document.getElementById("admin-user-result");
    
    // Chart instances
    this.chart = null;
    this.platformChart = null;
    
    // Unsubscribe functions
    this.unsubscribes = [];
    
    // Event Handlers (bound for removal)
    this.handleRefreshClick = () => this.loadDashboardData();
    this.handleSearchClick = () => this.searchUser();
    this.handleSearchEnter = (e) => {
      if (e.key === "Enter") this.searchUser();
    };
    this.handleTabClick = () => {
      if (this.isAdmin) this.loadDashboardData();
    };

    this.init();
  }

  init() {
    this.checkAdminStatus();
    
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", this.handleRefreshClick);
    }
    
    if (this.userSearchBtn) {
      this.userSearchBtn.addEventListener("click", this.handleSearchClick);
    }
    
    if (this.userSearchInput) {
      this.userSearchInput.addEventListener("keypress", this.handleSearchEnter);
    }

    // Expose for global access (needed for inline onclick handlers in generated HTML)
    window.dashboardManager = this;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.unsubscribeAll();
    
    if (this.refreshBtn) {
      this.refreshBtn.removeEventListener("click", this.handleRefreshClick);
    }
    if (this.userSearchBtn) {
      this.userSearchBtn.removeEventListener("click", this.handleSearchClick);
    }
    if (this.userSearchInput) {
      this.userSearchInput.removeEventListener("keypress", this.handleSearchEnter);
    }
    if (this.dashboardTabBtn) {
      this.dashboardTabBtn.removeEventListener("click", this.handleTabClick);
    }
    
    if (this.chart) {
      this.chart.destroy();
    }
    if (this.platformChart) {
      this.platformChart.destroy();
    }
  }

  /**
   * 관리자 권한 확인
   */
  async checkAdminStatus() {
    const user = this.authManager.currentUser;
    if (user) {
      try {
        const token = await user.getIdTokenResult();
        this.isAdmin = !!token?.claims?.admin;
      } catch (e) {
        console.error("Error checking admin status:", e);
        this.isAdmin = false;
      }
    } else {
      this.isAdmin = false;
    }
    
    // [Demo] 로컬 스토리지에 'admin_mode=true'가 있거나, 
    // 현재 사용자가 특정 이메일인 경우 관리자로 간주 (개발용)
    const isDemoAdmin = localStorage.getItem("admin_mode") === "true";
    
    if (this.isAdmin || isDemoAdmin) {
      this.isAdmin = true; // 데모 모드일 경우 강제 true
      this.showDashboardTab();
    } else {
      if (this.dashboardTabBtn) this.dashboardTabBtn.style.display = "none";
    }
  }

  showDashboardTab() {
    if (this.dashboardTabBtn) {
      this.dashboardTabBtn.style.display = "flex";
      this.dashboardTabBtn.removeEventListener('click', this.handleTabClick); // Prevent duplicate
      this.dashboardTabBtn.addEventListener('click', this.handleTabClick);
    }
  }

  /**
   * 대시보드 데이터 로드
   */
  async loadDashboardData() {
    if (!this.isAdmin) return;
    this.db = this.dataManager?.db;
    if (!this.db) {
      console.warn("Firestore not initialized yet.");
      return;
    }
    
    this.uiManager.showLoading(true);
    
    this.unsubscribeAll();

    try {
      await Promise.all([
        this.setupRealtimeKPIs(),
        this.renderChart(),
        this.renderPlatformChart(),
        this.fetchLogs()
      ]);
      this.uiManager.showToast("대시보드 데이터가 업데이트되었습니다.");
    } catch (error) {
      console.error("대시보드 로드 실패:", error);
      this.uiManager.showToast("데이터를 불러오는데 실패했습니다.", "error");
    } finally {
      this.uiManager.showLoading(false);
    }
  }

  unsubscribeAll() {
    this.unsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    this.unsubscribes = [];
  }

  /**
   * 실시간 핵심 지표(KPI) 설정
   */
  async setupRealtimeKPIs() {
    try {
        // 1. 오늘 작성된 글 (실시간)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const textsQuery = window.firebaseQuery(
          window.firebaseCollectionGroup(this.db, "texts"),
          window.firebaseWhere("createdAt", ">=", today)
        );

        const unsubTexts = window.firebaseOnSnapshot(textsQuery, (snapshot) => {
          const count = snapshot.size;
          const el = document.getElementById("kpi-today-posts");
          if (el) el.textContent = count.toLocaleString();
        }, (error) => {
            console.error("KPI Realtime Error (Texts):", error);
        });
        this.unsubscribes.push(unsubTexts);

        // 2. 총 사용자 수
        const statsQuery = window.firebaseQuery(
          window.firebaseCollection(this.db, "stats_daily"),
          window.firebaseOrderBy("date", "desc"),
          window.firebaseLimit(1)
        );
        
        const unsubStats = window.firebaseOnSnapshot(statsQuery, (snapshot) => {
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const elUsers = document.getElementById("kpi-total-users");
            if (elUsers) elUsers.textContent = (data?.totalUsers || 0).toLocaleString();
          }
        }, (error) => {
            console.error("KPI Realtime Error (Stats):", error);
        });
        this.unsubscribes.push(unsubStats);

        // 3. LLM 검증 사용 (Mock)
        const elLlm = document.getElementById("kpi-llm-usage");
        if (elLlm) elLlm.textContent = Math.floor(Math.random() * 50 + 10).toString();

        // 4. 휴지통 용량
        const trashQuery = window.firebaseQuery(
          window.firebaseCollectionGroup(this.db, "texts"),
          window.firebaseWhere("isDeleted", "==", true)
        );
        
        const unsubTrash = window.firebaseOnSnapshot(trashQuery, (snapshot) => {
          const count = snapshot.size;
          const el = document.getElementById("kpi-trash-size");
          if (el) el.textContent = `${count}개`;
        }, (error) => {
            console.error("KPI Realtime Error (Trash):", error);
        });
        this.unsubscribes.push(unsubTrash);
    } catch (error) {
        console.error("Error setting up KPIs:", error);
    }
  }

  /**
   * 차트 렌더링 (stats_daily 기반)
   */
  async renderChart() {
    if (!this.chartCanvas) return;
    
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dateStr = sevenDaysAgo.toISOString().split('T')[0];

        const q = window.firebaseQuery(
          window.firebaseCollection(this.db, "stats_daily"),
          window.firebaseWhere("date", ">=", dateStr),
          window.firebaseOrderBy("date", "asc")
        );

        const snapshot = await window.firebaseGetDocs(q);
        
        const labels = [];
        const dataPosts = [];
        const dataUsers = [];

        let prevTotalUsers = 0;

        snapshot.forEach(doc => {
          const data = doc.data();
          labels.push(data.date.substring(5)); // MM-DD
          dataPosts.push(data.newTextsCount || 0);
          
          if (prevTotalUsers > 0) {
            dataUsers.push(Math.max(0, data.totalUsers - prevTotalUsers));
          } else {
            dataUsers.push(0);
          }
          prevTotalUsers = data.totalUsers;
        });

        if (this.chart) {
          this.chart.destroy();
        }

        if (typeof Chart === 'undefined') return;

        this.chart = new Chart(this.chartCanvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: '일일 작성 글',
                data: dataPosts,
                borderColor: '#4a90e2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                tension: 0.4,
                fill: true
              },
              {
                label: '신규 가입자 (추정)',
                data: dataUsers,
                borderColor: '#50e3c2',
                backgroundColor: 'transparent',
                tension: 0.4,
                borderDash: [5, 5]
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { color: '#e0e0e0' }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#a0a0a0' }
              },
              x: {
                grid: { display: false },
                ticks: { color: '#a0a0a0' }
              }
            }
          }
        });
    } catch (error) {
        console.error("Error rendering main chart:", error);
    }
  }

  /**
   * 플랫폼 점유율 차트 렌더링
   */
  async renderPlatformChart() {
    if (!this.platformChartCanvas) return;

    try {
        const q = window.firebaseQuery(
          window.firebaseCollectionGroup(this.db, "texts"),
          window.firebaseOrderBy("createdAt", "desc"),
          window.firebaseLimit(100)
        );

        const snapshot = await window.firebaseGetDocs(q);
        const platformCounts = {};

        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.snsPlatforms && Array.isArray(data.snsPlatforms)) {
            data.snsPlatforms.forEach(platform => {
              platformCounts[platform] = (platformCounts[platform] || 0) + 1;
            });
          }
        });

        const labels = Object.keys(platformCounts);
        const data = Object.values(platformCounts);
        
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

        if (this.platformChart) {
          this.platformChart.destroy();
        }

        this.platformChart = new Chart(this.platformChartCanvas, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colors,
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#e0e0e0', boxWidth: 12 }
              }
            }
          }
        });
    } catch (error) {
        console.error("Error rendering platform chart:", error);
    }
  }

  /**
   * 사용자 검색 및 관리
   */
  async searchUser() {
    const queryText = this.userSearchInput.value.trim();
    if (!queryText) return;

    this.userResultContainer.innerHTML = '<div class="loading-spinner">검색 중...</div>';

    try {
      let userDoc = null;
      
      // 1. UID로 조회 시도
      const uidRef = window.firebaseDoc(this.db, "users", queryText);
      const uidSnap = await window.firebaseGetDoc(uidRef);
      
      if (uidSnap.exists()) {
        userDoc = uidSnap;
      } else {
        // 2. 이메일로 조회 (Collection Group Query)
        const q = window.firebaseQuery(
          window.firebaseCollectionGroup(this.db, "profile"),
          window.firebaseWhere("username", "==", queryText)
        );
        const querySnap = await window.firebaseGetDocs(q);
        if (!querySnap.empty) {
          const profileDoc = querySnap.docs[0];
          const userId = profileDoc.ref.parent.parent.id;
          const userRef = window.firebaseDoc(this.db, "users", userId);
          userDoc = await window.firebaseGetDoc(userRef);
        }
      }

      if (userDoc && userDoc.exists()) {
        this.renderUserResult(userDoc);
      } else {
        this.userResultContainer.innerHTML = '<p class="no-result">사용자를 찾을 수 없습니다.</p>';
      }
    } catch (error) {
      console.error("User search error:", error);
      this.userResultContainer.innerHTML = `<p class="error">검색 중 오류 발생: ${escapeHtml(error.message)}</p>`;
    }
  }

  renderUserResult(userDoc) {
    const userId = userDoc.id;
    this.userResultContainer.innerHTML = `
      <div class="user-card-admin">
        <div class="user-info-header">
          <h5>User ID: ${escapeHtml(userId)}</h5>
          <span class="badge badge-success">Active</span>
        </div>
        <div class="user-actions">
          <button class="btn btn-sm btn-danger" onclick="window.dashboardManager.banUser('${escapeHtml(userId)}')">차단</button>
          <button class="btn btn-sm btn-warning" onclick="window.dashboardManager.resetPassword('${escapeHtml(userId)}')">비밀번호 초기화</button>
        </div>
      </div>
    `;
  }

  async banUser(userId) {
    if (!confirm("정말 이 사용자를 차단하시겠습니까?")) return;
    
    try {
      await this.logAdminAction("BLOCK_USER", userId);
      this.uiManager.showToast("사용자가 차단되었습니다. (데모)");
    } catch (e) {
      console.error("Ban user error:", e);
      this.uiManager.showToast("오류 발생: " + e.message, "error");
    }
  }
  
  async resetPassword(userId) {
    if (!confirm("비밀번호 초기화 이메일을 전송하시겠습니까?")) return;
    try {
        await this.logAdminAction("RESET_PASSWORD", userId);
        this.uiManager.showToast("비밀번호 초기화 이메일이 전송되었습니다. (데모)");
    } catch (e) {
        console.error("Reset password error:", e);
        this.uiManager.showToast("오류 발생: " + e.message, "error");
    }
  }

  /**
   * 관리자 로그 기록
   */
  async logAdminAction(action, target) {
    const user = this.authManager.currentUser;
    if (!user) return;
    
    try {
        await window.firebaseAddDoc(window.firebaseCollection(this.db, "admin_logs"), {
          action: action,
          target: target,
          adminUid: user.uid,
          adminEmail: user.email || "unknown",
          timestamp: window.firebaseServerTimestamp()
        });
        
        this.fetchLogs(); // 로그 목록 갱신
    } catch (error) {
        console.error("Log admin action error:", error);
        throw error;
    }
  }

  /**
   * 관리자 로그 가져오기
   */
  async fetchLogs() {
    if (!this.logsTableBody) return;
    
    try {
        const q = window.firebaseQuery(
          window.firebaseCollection(this.db, "admin_logs"),
          window.firebaseOrderBy("timestamp", "desc"),
          window.firebaseLimit(20)
        );

        const snapshot = await window.firebaseGetDocs(q);
        
        if (snapshot.empty) {
          this.logsTableBody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding: 20px;'>로그가 없습니다.</td></tr>";
          return;
        }

        // Using map and join is efficient for this size
        this.logsTableBody.innerHTML = snapshot.docs.map(doc => {
          const log = doc.data();
          const timeStr = log.timestamp ? formatDate(log.timestamp.toDate()) : "-";
          return `
          <tr>
            <td><span class="badge badge-${this.getActionColor(log.action)}">${log.action}</span></td>
            <td>${escapeHtml(log.target || "-")}</td>
            <td>${escapeHtml(log.adminEmail || log.adminUid)}</td>
            <td>${timeStr}</td>
          </tr>
        `}).join("");
    } catch (error) {
        console.error("Fetch logs error:", error);
        this.logsTableBody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding: 20px; color: red;'>로그를 불러오는데 실패했습니다.</td></tr>";
    }
  }

  getActionColor(action) {
    if (!action) return "info";
    if (action.includes("DELETE") || action.includes("BAN") || action.includes("BLOCK")) return "danger";
    if (action.includes("RESET") || action.includes("WARNING")) return "warning";
    return "info";
  }
}
