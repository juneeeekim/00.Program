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
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스 초기화
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
