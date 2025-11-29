# Frontend Setup Guide

## 📋 Firebase 환경 변수 설정

Frontend 앱이 Firebase에 연결하려면 환경 변수 설정이 필요합니다.

### 1. Firebase Console에서 설정 정보 가져오기

1. **Firebase Console 접속**: https://console.firebase.google.com/
2. **프로젝트 선택**: `marketing-analytics-mvp`
3. **프로젝트 설정** 클릭 (⚙️ 아이콘)
4. **"일반"** 탭에서 아래로 스크롤
5. **"내 앱"** 섹션에서 **웹 앱 추가** 클릭 (</> 아이콘)
   - 앱 닉네임: `Marketing Analytics Web`
   - Firebase Hosting 설정: 체크 안 함
   - **"앱 등록"** 클릭
6. **Firebase SDK 구성** 화면에서 `firebaseConfig` 객체 복사

### 2. .env.local 파일 생성

```powershell
# frontend 폴더에서
Copy-Item env.example .env.local
```

### 3. .env.local 파일 수정

복사한 Firebase 설정 정보를 `.env.local` 파일에 입력:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=marketing-analytics-mvp-3afd6.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=marketing-analytics-mvp-3afd6
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=marketing-analytics-mvp-3afd6.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

## 🚀 개발 서버 실행

```powershell
cd frontend
npm run dev
```

브라우저에서 http://localhost:3000 접속

## ✅ 검증

성공하면 다음이 보입니다:

- "Loading data from Firestore..." (로딩 중)
- "Loaded 9 records from metrics_daily collection" (완료)
- JSON 형식의 데이터 (9개 문서)

## 🔧 문제 해결

### Firebase 연결 오류

- `.env.local` 파일이 `frontend` 폴더에 있는지 확인
- 환경 변수 이름이 `NEXT_PUBLIC_` 접두사로 시작하는지 확인
- 개발 서버 재시작 (`Ctrl+C` 후 `npm run dev`)

### 데이터가 안 보이는 경우

- Firestore Console에서 `metrics_daily` 컬렉션에 데이터가 있는지 확인
- 브라우저 개발자 도구(F12) → Console 탭에서 에러 확인
