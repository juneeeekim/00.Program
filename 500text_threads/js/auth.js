/**
 * 인증 관리 모듈
 * @module Auth
 */

export class AuthManager {
    constructor(callbacks) {
        this.auth = null;
        this.db = null;
        this.isFirebaseReady = false;
        this.currentUser = null;
        
        // 콜백 함수들 (UI 업데이트 등을 위함)
        this.onLogin = callbacks.onLogin || (() => {});
        this.onLogout = callbacks.onLogout || (() => {});
        this.showMessage = callbacks.showMessage || console.log;
    }

    /* ============================================================
     * [Phase 1-2 Hotfix] 2025-12-07
     * Firebase 초기화 대기 로직 강화
     * - Promise 기반으로 변경하여 명확한 성공/실패 반환
     * - 타임아웃 시 사용자에게 재시도 옵션 안내
     * - 디버깅을 위한 상세 로그 추가
     * ============================================================ */
    
    /**
     * Firebase 초기화 대기
     * @returns {Promise<boolean>} 초기화 성공 여부
     * @throws {Error} 타임아웃 시 에러 throw
     */
    async waitForFirebase() {
        const MAX_ATTEMPTS = 50;       // 최대 시도 횟수
        const POLL_INTERVAL_MS = 100;  // 폴링 간격 (ms)
        const TIMEOUT_MS = MAX_ATTEMPTS * POLL_INTERVAL_MS; // 총 5초
        
        console.log('[AuthManager] Firebase 초기화 대기 시작...');
        
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            // Firebase SDK가 전역에 로드되었는지 확인
            if (window.firebaseAuth && window.firebaseDb) {
                this.auth = window.firebaseAuth;
                this.db = window.firebaseDb;
                this.isFirebaseReady = true;
                
                console.log(`[AuthManager] ✅ Firebase 초기화 완료 (${attempt * POLL_INTERVAL_MS}ms 소요)`);
                this.setupAuthStateListener();
                return true;
            }
            
            // 대기
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // 타임아웃 도달: 명시적 에러 처리
        this.isFirebaseReady = false;
        const errorMsg = `Firebase 초기화 타임아웃 (${TIMEOUT_MS}ms). 네트워크 연결을 확인하고 페이지를 새로고침해주세요.`;
        console.error('[AuthManager] ❌', errorMsg);
        
        // 사용자에게 재시도 안내 (접근성: role="alert" 로 표시)
        this.showMessage(errorMsg, 'error');
        
        // 에러 throw (호출측에서 catch 가능)
        throw new Error(errorMsg);
    }


    /**
     * Firebase Auth 상태 리스너 설정
     */
    setupAuthStateListener() {
        if (!this.isFirebaseReady) return;

        window.firebaseOnAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.currentUser = user;
                console.log('사용자 로그인:', user.displayName || user.uid);
                this.onLogin(user);
            } else {
                this.currentUser = null;
                console.log('사용자 로그아웃');
                this.onLogout();
            }
        });
    }

    /**
     * 로그인 처리
     * @param {string} username - 사용자명
     */
    async login(username) {
        if (!this.isFirebaseReady) {
            this.showMessage('Firebase가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.', 'error');
            return;
        }

        try {
            // 익명 로그인으로 사용자 생성
            const result = await window.firebaseSignInAnonymously(this.auth);
            const user = result.user;

            // 사용자명을 Firestore에 저장 (외부에서 처리하도록 콜백이나 별도 함수로 분리 가능하지만, 일단 여기 둠)
            // 주의: saveUsernameToFirestore는 DataManager 영역이지만, 편의상 Auth 흐름에 포함
            // 리팩토링 단계에서는 일단 성공 여부만 반환
            return { success: true, user };

        } catch (error) {
            console.error('사용자명 로그인 실패:', error);
            this.showMessage('로그인에 실패했습니다. 다시 시도해주세요.', 'error');
            return { success: false, error };
        }
    }

    /**
     * 로그아웃 처리
     */
    async logout() {
        try {
            await window.firebaseSignOut(this.auth);
            this.showMessage('로그아웃되었습니다.', 'info');
            return true;
        } catch (error) {
            console.error('로그아웃 실패:', error);
            this.showMessage('로그아웃 중 오류가 발생했습니다.', 'error');
            return false;
        }
    }
}
