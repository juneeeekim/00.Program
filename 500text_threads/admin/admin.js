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

(function() {
  'use strict';

  /**
   * AdminDashboard 클래스
   * 관리자 대시보드의 모든 기능을 관리하는 메인 클래스
   */
  class AdminDashboard {
    constructor() {
      this.version = '2.0.0';
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
      if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js가 로드되지 않았습니다.');
        return false;
      }
      
      console.log('✅ Chart.js 로드 완료:', Chart.version);
      
      if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK가 로드되지 않았습니다.');
        return false;
      }
      
      console.log('✅ Firebase SDK 로드 완료');
      return true;
    }

    /**
     * Firebase 초기화
     */
    async initFirebase() {
      try {
        console.log('🔧 Firebase 초기화 중...');
        
        // Firebase가 이미 초기화되어 있는지 확인
        if (firebase.apps.length === 0) {
          console.warn('⚠️ Firebase가 초기화되지 않았습니다.');
          console.warn('📝 firebase-config.js에서 Firebase를 초기화해야 합니다.');
          this.redirectToMain('Firebase 초기화 필요');
          return;
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        console.log('✅ Firebase 초기화 완료');

        // 인증 상태 변경 감지
        this.auth.onAuthStateChanged((user) => {
          if (user) {
            console.log('👤 사용자 로그인 감지:', user.email);
            this.checkAdminAccess(user);
          } else {
            console.warn('⚠️ 로그인되지 않음');
            this.redirectToMain('로그인이 필요합니다');
          }
        });

      } catch (error) {
        console.error('❌ Firebase 초기화 실패:', error);
        this.redirectToMain('Firebase 초기화 실패');
      }
    }

    /**
     * 관리자 권한 확인
     * Custom Claims에서 admin 권한 확인
     */
    async checkAdminAccess(user) {
      try {
        console.log('🔐 관리자 권한 확인 중...');
        
        // ID 토큰 가져오기 (Custom Claims 포함)
        const idTokenResult = await user.getIdTokenResult();
        
        console.log('🔍 Custom Claims:', idTokenResult.claims);
        
        // Custom Claims에서 admin 권한 확인
        if (idTokenResult.claims.admin === true) {
          console.log('✅ 관리자 권한 확인됨');
          this.currentUser = user;
          this.init();
        } else {
          console.warn('⚠️ 관리자 권한 없음');
          console.warn('📝 이 사용자에게 관리자 권한을 부여하려면:');
          console.warn(`   firebase functions:shell`);
          console.warn(`   setAdminClaim({uid: '${user.uid}'})`);
          this.redirectToMain('관리자 권한이 필요합니다');
        }
      } catch (error) {
        console.error('❌ 권한 확인 실패:', error);
        this.redirectToMain('권한 확인 실패');
      }
    }

    /**
     * 메인 페이지로 리다이렉트
     * @param {string} reason - 리다이렉트 사유
     */
    redirectToMain(reason) {
      console.warn(`🚫 접근 차단: ${reason}`);
      
      // 사용자에게 알림
      alert(`접근이 거부되었습니다.\n\n사유: ${reason}\n\n메인 페이지로 이동합니다.`);
      
      // 히스토리 남기지 않고 리다이렉트 (뒤로가기 방지)
      window.location.replace('../index.html');
    }

    /**
     * 대시보드 초기화 (관리자 권한 확인 후에만 실행)
     */
    init() {
      if (this.initialized) {
        console.warn('⚠️ AdminDashboard가 이미 초기화되었습니다.');
        return;
      }

      console.log('🚀 AdminDashboard 초기화 시작...');
      
      // DOM 로드 확인
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }

    /**
     * 대시보드 설정
     */
    setup() {
      console.log('⚙️ AdminDashboard 설정 중...');
      
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
      
      // 데이터 로드
      this.loadDashboardData();
      
      this.initialized = true;
      console.log('✅ AdminDashboard 초기화 완료');
      console.log('📊 관리자 대시보드가 준비되었습니다.');
    }

    /**
     * 네비게이션 설정
     */
    setupNavigation() {
      const navButtons = document.querySelectorAll('.admin-nav__item');
      const sections = document.querySelectorAll('.admin-section');

      if (navButtons.length === 0) {
        console.warn('⚠️ 네비게이션 버튼을 찾을 수 없습니다.');
        return;
      }

      navButtons.forEach(button => {
        button.addEventListener('click', () => {
          const targetSection = button.dataset.section;
          
          // 모든 버튼 비활성화
          navButtons.forEach(btn => {
            btn.classList.remove('admin-nav__item--active');
            btn.setAttribute('aria-selected', 'false');
          });
          
          // 클릭된 버튼 활성화
          button.classList.add('admin-nav__item--active');
          button.setAttribute('aria-selected', 'true');
          
          // 모든 섹션 숨기기
          sections.forEach(section => {
            section.classList.add('admin-hidden');
            section.setAttribute('aria-hidden', 'true');
          });
          
          // 선택된 섹션 표시
          const activeSection = document.getElementById(`admin-${targetSection}`);
          if (activeSection) {
            activeSection.classList.remove('admin-hidden');
            activeSection.setAttribute('aria-hidden', 'false');
            console.log(`📍 섹션 전환: ${targetSection}`);
          }
        });
        
        // 키보드 접근성
        button.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            button.click();
          }
        });
      });
      
      console.log('✅ 네비게이션 설정 완료');
    }

    /**
     * Chart.js 초기화
     */
    initializeCharts() {
      const canvas = document.getElementById('admin-chart-main');
      if (!canvas) {
        console.warn('⚠️ Chart 캔버스를 찾을 수 없습니다.');
        return;
      }
      
      if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js가 로드되지 않았습니다.');
        return;
      }

      const ctx = canvas.getContext('2d');
      this.mainChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
          datasets: [{
            label: '활성 사용자',
            data: [12, 19, 3, 5, 2, 3],
            borderColor: 'rgb(102, 126, 234)',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            title: {
              display: true,
              text: '월별 사용자 활동'
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
      
      console.log('✅ Chart.js 차트 생성 완료');
    }

    /**
     * 대시보드 데이터 로드
     */
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
      const refreshBtn = document.getElementById('refresh-stats-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refreshStats());
      }
    }

    /**
     * 대시보드 데이터 로드 (Read-Only)
     * admin_stats 컬렉션에서 집계된 데이터를 읽어옵니다.
     */
    async loadDashboardData() {
      this.showLoading();
      try {
        console.log('📊 대시보드 데이터 로딩 중...');
        
        // 저장된 통계 데이터 읽기 (1회 Read)
        const statsDoc = await this.db.collection('admin_stats').doc('summary').get();
        
        if (statsDoc.exists) {
          const data = statsDoc.data();
          this.renderStats(data);
          console.log('✅ 대시보드 데이터 로드 완료 (Cached)');
        } else {
          // 데이터가 없으면 갱신 유도
          this.showNoDataState();
          console.log('ℹ️ 저장된 통계 데이터가 없습니다.');
        }
      } catch (error) {
        console.error('❌ 데이터 로드 실패:', error);
        this.showError('데이터를 불러오는데 실패했습니다.');
      } finally {
        this.hideLoading();
      }
    }

    /**
     * 데이터 갱신 (Write - Admin Only)
     * 전체 데이터를 집계하여 admin_stats에 저장합니다.
     */
    async refreshStats() {
      if (!confirm('전체 데이터를 집계하시겠습니까?\n데이터 양에 따라 시간이 걸릴 수 있습니다.')) return;

      this.setRefreshing(true);
      try {
        console.log('🔄 데이터 집계 시작...');
        
        // 1. 전체 사용자 조회
        const usersSnapshot = await this.db.collection('users').get();
        let totalTexts = 0;
        let totalPosts = 0;
        
        console.log(`   - 사용자 ${usersSnapshot.size}명 처리 중...`);

        // 2. 각 사용자의 데이터 집계 (병렬 처리)
        // 주의: 사용자 수가 많을 경우 배치 처리 필요 (현재는 단순 구현)
        const promises = usersSnapshot.docs.map(async doc => {
          const texts = await doc.ref.collection('texts').get();
          const posts = await doc.ref.collection('posts').get();
          return { texts: texts.size, posts: posts.size };
        });
        
        const results = await Promise.all(promises);
        results.forEach(r => {
          totalTexts += r.texts;
          totalPosts += r.posts;
        });

        // 3. 통계 데이터 구성
        const statsData = {
          totalUsers: usersSnapshot.size,
          totalTexts,
          totalPosts,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          // 차트용 더미 데이터 (실제 구현 시 날짜별 집계 로직 필요)
          monthlyActivity: {
            labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
            values: [12, 19, 3, 5, 2, 3] 
          }
        };

        // 4. 저장
        await this.db.collection('admin_stats').doc('summary').set(statsData);
        
        // 5. UI 업데이트
        // 서버 타임스탬프는 즉시 읽을 수 없으므로 현재 시간으로 대체하여 렌더링
        const renderData = { ...statsData, lastUpdated: new Date() };
        this.renderStats(renderData);
        
        console.log('✅ 데이터 집계 및 저장 완료');
        alert('데이터가 성공적으로 갱신되었습니다.');
        
      } catch (error) {
        console.error('❌ 데이터 갱신 실패:', error);
        alert('데이터 갱신 중 오류가 발생했습니다: ' + error.message);
      } finally {
        this.setRefreshing(false);
      }
    }

    /**
     * 통계 데이터 렌더링
     */
    renderStats(data) {
      // 숫자 업데이트
      this.animateValue('total-users', data.totalUsers || 0);
      this.animateValue('total-texts', data.totalTexts || 0);
      this.animateValue('total-posts', data.totalPosts || 0);
      
      // 마지막 업데이트 시간
      const timeEl = document.getElementById('last-updated-time');
      if (timeEl) {
        const date = data.lastUpdated instanceof firebase.firestore.Timestamp 
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
      const elements = ['total-users', 'total-texts', 'total-posts'];
      elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = '...';
          el.classList.add('admin-loading-text');
        }
      });
    }

    /**
     * 로딩 상태 숨김
     */
    hideLoading() {
      const elements = ['total-users', 'total-texts', 'total-posts'];
      elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('admin-loading-text');
        }
      });
    }

    /**
     * 갱신 중 상태 설정
     */
    setRefreshing(isRefreshing) {
      const btn = document.getElementById('refresh-stats-btn');
      if (!btn) return;
      
      if (isRefreshing) {
        btn.disabled = true;
        btn.innerHTML = '🔄 집계 중...';
        btn.classList.add('spin');
      } else {
        btn.disabled = false;
        btn.innerHTML = '🔄 데이터 갱신';
        btn.classList.remove('spin');
      }
    }

    /**
     * 데이터 없음 상태 표시
     */
    showNoDataState() {
      const elements = ['total-users', 'total-texts', 'total-posts'];
      elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = '-';
        }
      });
      
      // 알림 (선택 사항)
      // alert('표시할 데이터가 없습니다. [데이터 갱신] 버튼을 눌러주세요.');
    }

    /**
     * 에러 메시지 표시
     */
    showError(message) {
      const elements = ['total-users', 'total-texts', 'total-posts'];
      elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = '오류';
          el.classList.add('admin-error-text');
        }
      });
      console.error(message);
    }

    /**
     * 환경 정보 로깅
     */
    logEnvironment() {
      console.group('📊 Admin Dashboard Environment');
      console.log('Version:', this.version);
      console.log('Chart.js:', typeof Chart !== 'undefined' ? Chart.version : 'Not loaded');
      console.log('Firebase:', firebase.apps.length > 0 ? 'Initialized' : 'Not initialized');
      console.log('User Agent:', navigator.userAgent);
      console.log('Screen Size:', `${window.innerWidth}x${window.innerHeight}`);
      console.groupEnd();
    }

    /**
     * 사용자 정보 표시
     */
    displayUserInfo() {
      if (!this.currentUser) {
        console.warn('⚠️ 사용자 정보 없음');
        return;
      }
      
      console.group('👤 관리자 정보');
      console.log('UID:', this.currentUser.uid);
      console.log('Email:', this.currentUser.email || '없음');
      console.log('Display Name:', this.currentUser.displayName || '없음');
      console.log('Email Verified:', this.currentUser.emailVerified);
      console.groupEnd();
    }

    /**
     * 전역 변수 오염 체크
     */
    checkGlobalPollution() {
      const adminGlobals = Object.keys(window).filter(key => 
        key.toLowerCase().includes('admin') && key !== 'AdminDashboard'
      );
      
      if (adminGlobals.length > 0) {
        console.warn('⚠️ 전역 변수 오염 감지:', adminGlobals);
        return false;
      }
      
      console.log('✅ 전역 변수 오염 없음');
      return true;
    }
  }

  // 전역 노출 (최소화)
  window.AdminDashboard = AdminDashboard;

  // 자동 초기화
  const dashboard = new AdminDashboard();

  console.log('✅ Admin Dashboard 모듈 로드 완료');
})();
