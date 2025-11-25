/**
 * Admin Dashboard - Main JavaScript
 * 
 * 격리 전략 (Isolation Strategy):
 * - IIFE 패턴으로 전역 오염 방지
 * - 'use strict' 모드 사용
 * - 최소한의 전역 노출 (window.AdminDashboard만)
 * 
 * @version 1.0.0
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
      this.version = '1.0.0';
      this.initialized = false;
      
      // Chart.js 로드 확인
      this.checkDependencies();
      
      // 초기화
      this.init();
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
      return true;
    }

    /**
     * 대시보드 초기화
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
      
      this.initialized = true;
      console.log('✅ AdminDashboard 초기화 완료');
    }

    /**
     * 환경 정보 로깅
     */
    logEnvironment() {
      console.group('📊 Admin Dashboard Environment');
      console.log('Version:', this.version);
      console.log('Chart.js:', typeof Chart !== 'undefined' ? Chart.version : 'Not loaded');
      console.log('User Agent:', navigator.userAgent);
      console.log('Screen Size:', `${window.innerWidth}x${window.innerHeight}`);
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
  
  // 전역 변수 오염 체크
  dashboard.checkGlobalPollution();

  console.log('✅ Admin Dashboard 모듈 로드 완료');
})();
