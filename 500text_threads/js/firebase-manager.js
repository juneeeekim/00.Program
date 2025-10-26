/**
 * FirebaseManager 클래스
 * 
 * Firebase Authentication 및 Firestore와의 모든 상호작용을 관리합니다.
 * 
 * 주요 기능:
 * - Google 인증 (로그인/로그아웃)
 * - Firestore 데이터 CRUD (저장/불러오기/삭제)
 * - 실시간 동기화
 * - 오프라인 지원
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */

class FirebaseManager {
    constructor(firebaseConfig) {
        // Firebase 설정
        this.firebaseConfig = firebaseConfig;
        
        // Firebase 인스턴스
        this.app = null;
        this.auth = null;
        this.db = null;
        
        // 인증 상태
        this.currentUser = null;
        this.authStateListener = null;
        
        // 실시간 동기화
        this.textsUnsubscribe = null;
        
        // 연결 상태
        this.isOnlineState = navigator.onLine;
        this.connectionStateCallbacks = [];
        
        // 초기화 상태
        this.isInitialized = false;
    }
    
    /**
     * Firebase 초기화
     * Requirements: 1.1, 2.1
     */
    async initialize() {
        try {
            console.log('🔥 FirebaseManager 초기화 시작...');
            
            // Firebase 앱 초기화
            this.app = await this.firebaseConfig.initializeFirebase();
            
            if (!this.app) {
                console.error('❌ Firebase 앱 초기화 실패');
                return false;
            }
            
            // Firebase Auth 인스턴스 가져오기
            this.auth = this.firebaseConfig.getAuth();
            if (!this.auth) {
                console.error('❌ Firebase Auth 인스턴스 가져오기 실패');
                return false;
            }
            
            // Firestore 인스턴스 가져오기
            this.db = this.firebaseConfig.getFirestore();
            if (!this.db) {
                console.error('❌ Firestore 인스턴스 가져오기 실패');
                return false;
            }
            
            // 오프라인 지원 활성화
            await this.enableOfflinePersistence();
            
            // 연결 상태 모니터링 시작
            this.setupConnectionMonitoring();
            
            this.isInitialized = true;
            console.log('✅ FirebaseManager 초기화 완료');
            
            return true;
        } catch (error) {
            console.error('❌ FirebaseManager 초기화 오류:', error);
            return false;
        }
    }

    /**
     * Google 로그인
     * Requirements: 1.1, 1.2, 1.3
     */
    async signInWithGoogle() {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            console.log('🔐 Google 로그인 시작...');
            
            // Google Auth Provider 설정
            const provider = new firebase.auth.GoogleAuthProvider();
            
            // 추가 스코프 설정 (선택적)
            provider.addScope('profile');
            provider.addScope('email');
            
            // 팝업 방식 로그인
            const result = await this.auth.signInWithPopup(provider);
            
            // 사용자 정보 추출
            const user = result.user;
            const userData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified
            };
            
            this.currentUser = userData;
            
            console.log('✅ Google 로그인 성공:', userData.email);
            
            return userData;
        } catch (error) {
            console.error('❌ Google 로그인 실패:', error);
            
            // 사용자 친화적 에러 메시지
            if (error.code === 'auth/popup-closed-by-user') {
                throw new Error('로그인 팝업이 닫혔습니다.');
            } else if (error.code === 'auth/network-request-failed') {
                throw new Error('네트워크 연결을 확인해주세요.');
            } else if (error.code === 'auth/unauthorized-domain') {
                throw new Error('이 도메인은 Firebase에서 승인되지 않았습니다.');
            } else {
                throw new Error('Google 로그인에 실패했습니다: ' + error.message);
            }
        }
    }
    
    /**
     * 로그아웃
     * Requirements: 1.4
     */
    async signOut() {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            console.log('🚪 로그아웃 시작...');
            
            // 실시간 리스너 해제
            this.unsubscribeFromTexts();
            
            // Firebase 로그아웃
            await this.auth.signOut();
            
            // 로컬 상태 초기화
            this.currentUser = null;
            
            console.log('✅ 로그아웃 완료');
            
            return true;
        } catch (error) {
            console.error('❌ 로그아웃 실패:', error);
            throw new Error('로그아웃에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 인증 상태 변경 리스너 등록
     * Requirements: 1.5
     */
    onAuthStateChanged(callback) {
        if (!this.isInitialized) {
            console.error('❌ FirebaseManager가 초기화되지 않았습니다.');
            return null;
        }
        
        // 기존 리스너 해제
        if (this.authStateListener) {
            this.authStateListener();
        }
        
        // 새 리스너 등록
        this.authStateListener = this.auth.onAuthStateChanged((user) => {
            if (user) {
                // 로그인 상태
                const userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    emailVerified: user.emailVerified
                };
                
                this.currentUser = userData;
                console.log('🔄 인증 상태 변경: 로그인됨', userData.email);
                
                callback(userData);
            } else {
                // 로그아웃 상태
                this.currentUser = null;
                console.log('🔄 인증 상태 변경: 로그아웃됨');
                
                callback(null);
            }
        });
        
        return this.authStateListener;
    }
    
    /**
     * 현재 사용자 정보 가져오기
     * Requirements: 1.5
     */
    getCurrentUser() {
        if (!this.isInitialized) {
            console.error('❌ FirebaseManager가 초기화되지 않았습니다.');
            return null;
        }
        
        const user = this.auth.currentUser;
        
        if (user) {
            return {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified
            };
        }
        
        return null;
    }

    /**
     * 텍스트 저장
     * Requirements: 2.1, 2.2, 2.3
     */
    async saveText(textData) {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            if (!this.currentUser) {
                throw new Error('로그인이 필요합니다.');
            }
            
            console.log('💾 텍스트 저장 시작...');
            
            // 데이터 검증
            if (!textData.content || textData.content.trim().length === 0) {
                throw new Error('저장할 내용이 없습니다.');
            }
            
            if (textData.content.length > 500) {
                throw new Error('텍스트는 500자를 초과할 수 없습니다.');
            }
            
            // 사용자별 컬렉션 경로: users/{userId}/savedTexts
            const userId = this.currentUser.uid;
            const textsRef = this.db.collection('users').doc(userId).collection('savedTexts');
            
            // 저장할 데이터 준비
            const dataToSave = {
                content: textData.content,
                characterCount: textData.characterCount || textData.content.length,
                type: textData.type || 'edit', // 'reference' or 'edit'
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // 선택적 필드 추가
            if (textData.deviceInfo) {
                dataToSave.deviceInfo = textData.deviceInfo;
            }
            
            // Firestore에 저장
            const docRef = await textsRef.add(dataToSave);
            
            console.log('✅ 텍스트 저장 완료:', docRef.id);
            
            return {
                id: docRef.id,
                ...dataToSave
            };
        } catch (error) {
            console.error('❌ 텍스트 저장 실패:', error);
            
            // 에러 처리 및 재시도 로직
            if (error.code === 'permission-denied') {
                throw new Error('저장 권한이 없습니다. 다시 로그인해주세요.');
            } else if (error.code === 'unavailable') {
                // 오프라인 상태에서는 로컬에 큐잉됨
                console.log('⚠️ 오프라인 상태: 온라인 복구 시 자동 동기화됩니다.');
                throw new Error('현재 오프라인 상태입니다. 온라인 복구 시 자동으로 저장됩니다.');
            } else {
                throw new Error('텍스트 저장에 실패했습니다: ' + error.message);
            }
        }
    }
    
    /**
     * 텍스트 목록 불러오기
     * Requirements: 3.1, 3.2, 3.4
     */
    async loadTexts(limit = 50) {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            if (!this.currentUser) {
                throw new Error('로그인이 필요합니다.');
            }
            
            console.log('📥 텍스트 불러오기 시작...');
            
            // 사용자별 컬렉션 경로
            const userId = this.currentUser.uid;
            const textsRef = this.db.collection('users').doc(userId).collection('savedTexts');
            
            // 생성 시간 기준 내림차순 정렬, 페이지네이션 지원
            const snapshot = await textsRef
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            // 데이터 변환
            const texts = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                texts.push({
                    id: doc.id,
                    content: data.content,
                    characterCount: data.characterCount,
                    type: data.type,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(),
                    deviceInfo: data.deviceInfo || null
                });
            });
            
            console.log(`✅ 텍스트 불러오기 완료: ${texts.length}개`);
            
            return texts;
        } catch (error) {
            console.error('❌ 텍스트 불러오기 실패:', error);
            
            if (error.code === 'permission-denied') {
                throw new Error('데이터 접근 권한이 없습니다. 다시 로그인해주세요.');
            } else {
                throw new Error('텍스트 불러오기에 실패했습니다: ' + error.message);
            }
        }
    }
    
    /**
     * 추가 텍스트 불러오기 (페이지네이션)
     * Requirements: 3.1, 3.2, 3.4
     */
    async loadMoreTexts(lastDoc, limit = 50) {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            if (!this.currentUser) {
                throw new Error('로그인이 필요합니다.');
            }
            
            console.log('📥 추가 텍스트 불러오기 시작...');
            
            const userId = this.currentUser.uid;
            const textsRef = this.db.collection('users').doc(userId).collection('savedTexts');
            
            // 마지막 문서 이후부터 불러오기
            const snapshot = await textsRef
                .orderBy('createdAt', 'desc')
                .startAfter(lastDoc)
                .limit(limit)
                .get();
            
            const texts = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                texts.push({
                    id: doc.id,
                    content: data.content,
                    characterCount: data.characterCount,
                    type: data.type,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(),
                    deviceInfo: data.deviceInfo || null
                });
            });
            
            console.log(`✅ 추가 텍스트 불러오기 완료: ${texts.length}개`);
            
            return texts;
        } catch (error) {
            console.error('❌ 추가 텍스트 불러오기 실패:', error);
            throw new Error('추가 텍스트 불러오기에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 텍스트 삭제
     * Requirements: 4.2, 4.3, 4.4
     */
    async deleteText(textId) {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            if (!this.currentUser) {
                throw new Error('로그인이 필요합니다.');
            }
            
            console.log('🗑️ 텍스트 삭제 시작:', textId);
            
            // 사용자별 컬렉션 경로
            const userId = this.currentUser.uid;
            const textRef = this.db.collection('users').doc(userId).collection('savedTexts').doc(textId);
            
            // 문서 삭제
            await textRef.delete();
            
            console.log('✅ 텍스트 삭제 완료:', textId);
            
            return true;
        } catch (error) {
            console.error('❌ 텍스트 삭제 실패:', error);
            
            if (error.code === 'permission-denied') {
                throw new Error('삭제 권한이 없습니다. 다시 로그인해주세요.');
            } else if (error.code === 'not-found') {
                throw new Error('삭제할 텍스트를 찾을 수 없습니다.');
            } else {
                throw new Error('텍스트 삭제에 실패했습니다: ' + error.message);
            }
        }
    }
    
    /**
     * 텍스트 업데이트 (선택적 기능)
     */
    async updateText(textId, updates) {
        try {
            if (!this.isInitialized) {
                throw new Error('FirebaseManager가 초기화되지 않았습니다.');
            }
            
            if (!this.currentUser) {
                throw new Error('로그인이 필요합니다.');
            }
            
            console.log('✏️ 텍스트 업데이트 시작:', textId);
            
            const userId = this.currentUser.uid;
            const textRef = this.db.collection('users').doc(userId).collection('savedTexts').doc(textId);
            
            // 업데이트할 데이터 준비
            const dataToUpdate = {
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // 문서 업데이트
            await textRef.update(dataToUpdate);
            
            console.log('✅ 텍스트 업데이트 완료:', textId);
            
            return true;
        } catch (error) {
            console.error('❌ 텍스트 업데이트 실패:', error);
            throw new Error('텍스트 업데이트에 실패했습니다: ' + error.message);
        }
    }
    
    /**
     * 실시간 동기화 구독
     * Requirements: 3.3
     */
    subscribeToTexts(callback) {
        try {
            if (!this.isInitialized) {
                console.error('❌ FirebaseManager가 초기화되지 않았습니다.');
                return null;
            }
            
            if (!this.currentUser) {
                console.error('❌ 로그인이 필요합니다.');
                return null;
            }
            
            console.log('🔄 실시간 동기화 구독 시작...');
            
            // 기존 리스너 해제
            this.unsubscribeFromTexts();
            
            // 사용자별 컬렉션 경로
            const userId = this.currentUser.uid;
            const textsRef = this.db.collection('users').doc(userId).collection('savedTexts');
            
            // 실시간 리스너 설정
            this.textsUnsubscribe = textsRef
                .orderBy('createdAt', 'desc')
                .limit(50)
                .onSnapshot(
                    (snapshot) => {
                        console.log('🔄 데이터 변경 감지:', snapshot.size, '개');
                        
                        // 변경된 데이터 추출
                        const texts = [];
                        snapshot.forEach((doc) => {
                            const data = doc.data();
                            texts.push({
                                id: doc.id,
                                content: data.content,
                                characterCount: data.characterCount,
                                type: data.type,
                                createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                                updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(),
                                deviceInfo: data.deviceInfo || null
                            });
                        });
                        
                        // 콜백 호출
                        callback(texts);
                    },
                    (error) => {
                        console.error('❌ 실시간 동기화 오류:', error);
                        
                        if (error.code === 'permission-denied') {
                            callback(null, new Error('데이터 접근 권한이 없습니다.'));
                        } else {
                            callback(null, error);
                        }
                    }
                );
            
            console.log('✅ 실시간 동기화 구독 완료');
            
            return this.textsUnsubscribe;
        } catch (error) {
            console.error('❌ 실시간 동기화 구독 실패:', error);
            return null;
        }
    }
    
    /**
     * 실시간 동기화 구독 해제
     * Requirements: 3.3
     */
    unsubscribeFromTexts() {
        if (this.textsUnsubscribe) {
            console.log('🔄 실시간 동기화 구독 해제...');
            this.textsUnsubscribe();
            this.textsUnsubscribe = null;
        }
    }

    /**
     * 오프라인 지원 활성화
     * Requirements: 5.1, 5.2, 5.3, 5.4
     */
    async enableOfflinePersistence() {
        try {
            if (!this.db) {
                console.error('❌ Firestore 인스턴스가 없습니다.');
                return false;
            }
            
            console.log('💾 오프라인 지원 활성화 시도...');
            
            await this.db.enablePersistence({
                synchronizeTabs: true
            });
            
            console.log('✅ 오프라인 지원 활성화 완료');
            
            return true;
        } catch (error) {
            if (error.code === 'failed-precondition') {
                // 여러 탭이 열려있는 경우
                console.warn('⚠️ 여러 탭이 열려있어 오프라인 지원을 활성화할 수 없습니다.');
                console.warn('   첫 번째 탭에서만 오프라인 지원이 활성화됩니다.');
            } else if (error.code === 'unimplemented') {
                // 브라우저가 지원하지 않는 경우
                console.warn('⚠️ 이 브라우저는 오프라인 지원을 제공하지 않습니다.');
            } else {
                console.error('❌ 오프라인 지원 활성화 실패:', error);
            }
            
            return false;
        }
    }
    
    /**
     * 온라인 상태 확인
     * Requirements: 5.1, 5.2
     */
    isOnline() {
        return this.isOnlineState;
    }
    
    /**
     * 연결 상태 모니터링 설정
     * Requirements: 5.1, 5.2, 5.3, 5.4
     */
    setupConnectionMonitoring() {
        // 브라우저 온라인/오프라인 이벤트 리스너
        window.addEventListener('online', () => {
            console.log('🌐 온라인 상태로 전환됨');
            this.isOnlineState = true;
            this.notifyConnectionStateChange(true);
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 오프라인 상태로 전환됨');
            this.isOnlineState = false;
            this.notifyConnectionStateChange(false);
        });
        
        // Firestore 연결 상태 모니터링 (선택적)
        if (this.db) {
            const connectedRef = this.db.collection('.info').doc('connected');
            
            // 실시간 연결 상태 감지는 Realtime Database 기능이므로
            // Firestore에서는 브라우저 이벤트만 사용
        }
        
        console.log('✅ 연결 상태 모니터링 설정 완료');
    }
    
    /**
     * 연결 상태 변경 리스너 등록
     * Requirements: 5.1, 5.2, 5.3, 5.4
     */
    onConnectionStateChange(callback) {
        if (typeof callback === 'function') {
            this.connectionStateCallbacks.push(callback);
            
            // 현재 상태 즉시 알림
            callback(this.isOnlineState);
        }
    }
    
    /**
     * 연결 상태 변경 알림
     */
    notifyConnectionStateChange(isOnline) {
        this.connectionStateCallbacks.forEach((callback) => {
            try {
                callback(isOnline);
            } catch (error) {
                console.error('❌ 연결 상태 콜백 오류:', error);
            }
        });
    }
    
    /**
     * 초기화 상태 확인
     */
    isReady() {
        return this.isInitialized && this.app && this.auth && this.db;
    }
    
    /**
     * Firebase 앱 인스턴스 가져오기
     */
    getApp() {
        return this.app;
    }
    
    /**
     * Firebase Auth 인스턴스 가져오기
     */
    getAuth() {
        return this.auth;
    }
    
    /**
     * Firestore 인스턴스 가져오기
     */
    getFirestore() {
        return this.db;
    }
}

// 전역 인스턴스 생성 (다른 모듈에서 사용)
if (typeof window !== 'undefined') {
    window.FirebaseManager = FirebaseManager;
}
