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

    /**
     * Firebase 초기화 대기
     */
    async waitForFirebase() {
        const maxAttempts = 50;
        let attempts = 0;

        while (attempts < maxAttempts) {
            if (window.firebaseAuth && window.firebaseDb) {
                this.auth = window.firebaseAuth;
                this.db = window.firebaseDb;
                this.isFirebaseReady = true;
                console.log('Firebase 초기화 완료 (AuthManager)');
                this.setupAuthStateListener();
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!this.isFirebaseReady) {
            console.error('Firebase 초기화 실패');
            this.showMessage('Firebase 초기화에 실패했습니다. 페이지를 새로고침해주세요.', 'error');
        }
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
