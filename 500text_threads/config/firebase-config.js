/**
 * Firebase 설정 및 초기화
 * 
 * 이 파일은 Firebase 프로젝트 설정을 관리하고 Firebase 앱을 초기화합니다.
 * 환경별 설정 분리 (개발/프로덕션)를 지원합니다.
 * 
 * Requirements: 7.1, 7.4
 */

class FirebaseConfig {
    constructor() {
        this.isDevelopment = this.detectEnvironment();
        this.firebaseApp = null;
        this.isInitialized = false;
    }

    /**
     * 환경 감지 (개발/프로덕션)
     */
    detectEnvironment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' || 
               hostname.includes('localhost');
    }

    /**
     * Firebase 구성 객체 가져오기
     * 
     * ⚠️ 중요: 실제 Firebase 프로젝트 설정으로 교체해야 합니다!
     * Firebase Console > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성
     */
    getFirebaseConfig() {
        // 개발 환경 설정
        const developmentConfig = {
            apiKey: "AIzaSyDtaeQY_XdmaYcybY-S0LmDMuCC_gonJyw",
            authDomain: "text-threads.firebaseapp.com",
            projectId: "text-threads",
            storageBucket: "text-threads.firebasestorage.app",
            messagingSenderId: "84225903613",
            appId: "1:84225903613:web:e0909478d5a334d7046794"
        };

        // 프로덕션 환경 설정
        const productionConfig = {
            apiKey: "AIzaSyDtaeQY_XdmaYcybY-S0LmDMuCC_gonJyw",
            authDomain: "text-threads.firebaseapp.com",
            projectId: "text-threads",
            storageBucket: "text-threads.firebasestorage.app",
            messagingSenderId: "84225903613",
            appId: "1:84225903613:web:e0909478d5a334d7046794"
        };

        return this.isDevelopment ? developmentConfig : productionConfig;
    }

    /**
     * Firebase 설정 검증
     */
    validateConfig() {
        const config = this.getFirebaseConfig();
        
        // 플레이스홀더 값 확인
        if (config.apiKey.includes('YOUR_')) {
            console.warn('⚠️ Firebase 설정이 필요합니다!');
            console.warn('Firebase Console에서 프로젝트를 생성하고 설정 정보를 입력해주세요.');
            return false;
        }

        // 필수 필드 확인
        const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        for (const field of requiredFields) {
            if (!config[field]) {
                console.error(`❌ Firebase 설정 오류: ${field}가 누락되었습니다.`);
                return false;
            }
        }

        // authDomain 형식 확인
        if (!config.authDomain.includes('.firebaseapp.com')) {
            console.error('❌ Firebase 설정 오류: authDomain 형식이 올바르지 않습니다.');
            return false;
        }

        // 프로덕션 환경에서 HTTPS 확인
        if (!this.isDevelopment && window.location.protocol !== 'https:') {
            console.error('❌ 프로덕션 환경에서는 HTTPS가 필수입니다.');
            return false;
        }

        return true;
    }

    /**
     * Firebase 초기화
     */
    async initializeFirebase() {
        // 이미 초기화된 경우
        if (this.isInitialized && this.firebaseApp) {
            console.log('✅ Firebase는 이미 초기화되었습니다.');
            return this.firebaseApp;
        }

        // Firebase SDK 로드 대기
        if (!window.firebase) {
            console.log('Firebase SDK 로드 대기 중...');
            await this.waitForFirebase();
        }

        // 설정 검증
        if (!this.validateConfig()) {
            console.error('❌ Firebase 설정 검증 실패');
            this.showSetupInstructions();
            return null;
        }

        try {
            const config = this.getFirebaseConfig();
            
            // Firebase 앱 초기화
            this.firebaseApp = firebase.initializeApp(config);
            this.isInitialized = true;

            console.log('✅ Firebase 초기화 완료');
            console.log(`환경: ${this.isDevelopment ? '개발' : '프로덕션'}`);
            console.log(`프로젝트 ID: ${config.projectId}`);

            return this.firebaseApp;
        } catch (error) {
            console.error('❌ Firebase 초기화 실패:', error);
            
            if (error.code === 'app/duplicate-app') {
                console.log('Firebase 앱이 이미 존재합니다. 기존 앱을 사용합니다.');
                this.firebaseApp = firebase.app();
                this.isInitialized = true;
                return this.firebaseApp;
            }

            this.showSetupInstructions();
            return null;
        }
    }

    /**
     * Firebase SDK 로드 대기
     */
    waitForFirebase() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5초 (100ms * 50)

            const checkFirebase = setInterval(() => {
                attempts++;

                if (window.firebase) {
                    clearInterval(checkFirebase);
                    console.log('✅ Firebase SDK 로드 완료');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkFirebase);
                    console.error('❌ Firebase SDK 로드 시간 초과');
                    reject(new Error('Firebase SDK 로드 실패'));
                }
            }, 100);
        });
    }

    /**
     * Firebase 앱 인스턴스 가져오기
     */
    getFirebaseApp() {
        if (!this.isInitialized || !this.firebaseApp) {
            console.warn('⚠️ Firebase가 초기화되지 않았습니다.');
            return null;
        }
        return this.firebaseApp;
    }

    /**
     * Firebase Auth 인스턴스 가져오기
     */
    getAuth() {
        if (!this.firebaseApp) {
            console.error('❌ Firebase 앱이 초기화되지 않았습니다.');
            return null;
        }
        return firebase.auth();
    }

    /**
     * Firestore 인스턴스 가져오기
     */
    getFirestore() {
        if (!this.firebaseApp) {
            console.error('❌ Firebase 앱이 초기화되지 않았습니다.');
            return null;
        }
        return firebase.firestore();
    }

    /**
     * 설정 안내 표시
     */
    showSetupInstructions() {
        console.log('\n📋 Firebase 설정 가이드:');
        console.log('1. Firebase Console (https://console.firebase.google.com) 접속');
        console.log('2. 프로젝트 생성 또는 선택');
        console.log('3. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가');
        console.log('4. SDK 설정 및 구성에서 설정 정보 복사');
        console.log('5. config/firebase-config.js 파일의 getFirebaseConfig() 메서드에 설정 정보 입력');
        console.log('\n필수 설정:');
        console.log('- Authentication > Sign-in method > Google 활성화');
        console.log('- Firestore Database 생성 (asia-northeast3 권장)');
        console.log('- 승인된 도메인에 GitHub Pages URL 추가\n');
    }

    /**
     * 현재 환경 정보 가져오기
     */
    getEnvironmentInfo() {
        return {
            isDevelopment: this.isDevelopment,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            isInitialized: this.isInitialized,
            hasFirebaseApp: !!this.firebaseApp
        };
    }
}

// 전역 인스턴스 생성 (다른 모듈에서 사용)
if (typeof window !== 'undefined') {
    window.FirebaseConfig = FirebaseConfig;
}
