// Firebase Configuration
// 실제 사용 시 Firebase Console에서 발급받은 설정으로 교체하세요

const firebaseConfig = {
  apiKey: "AIzaSyDtaeQY_XdmaYcybY-S0LmDMuCC_gonJyw",
  authDomain: "text-threads.firebaseapp.com",
  projectId: "text-threads",
  storageBucket: "text-threads.firebasestorage.app",
  messagingSenderId: "84225903613",
  appId: "1:84225903613:web:e0909478d5a334d7046794"
};

// Firebase 초기화
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// ============================================
// [P3-FIX] iOS Safari Firestore 연결 안정성 개선
// ============================================
// 문제: iOS Safari에서 WebChannel 연결이 불안정하여 데이터 로드 실패
// 해결: experimentalAutoDetectLongPolling 옵션으로 자동 폴백 활성화
// - WebSocket 사용 가능 시: WebSocket 사용 (빠름)
// - WebSocket 불안정 시: Long Polling으로 자동 전환 (안정적)
// ============================================

// Firebase 서비스 초기화
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const storage = getStorage(app);

export default app;
