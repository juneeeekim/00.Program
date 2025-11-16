// Firebase Configuration
// PromptHub Production 프로젝트 설정

const firebaseConfig = {
  apiKey: "AIzaSyDudPHjfulRRa6wtOzC8nkPE8wnhya__DE",
  authDomain: "prompthub-production.firebaseapp.com",
  projectId: "prompthub-production",
  storageBucket: "prompthub-production.firebasestorage.app",
  messagingSenderId: "547082323866",
  appId: "1:547082323866:web:b44da017391ab6dd2cdc23",
  measurementId: "G-NRW0VKLWDK"
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
