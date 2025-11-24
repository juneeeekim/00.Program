# 🔧 Step 1: Firebase 프로젝트 설정

---

**버전**: v2.0.0  
**최종 수정**: 2025-11-22  
**문서 순서**: **Step 1 of 3 - Firebase 프로젝트 초기 설정**  
**소요 시간**: 약 15-20분

> 📌 **이전 단계**: [Step 0 - 프로젝트 개요](README.md)  
> 📌 **다음 단계**: [Step 2 - Firestore 설정](02_FIRESTORE_CONFIG.md)

---

## 📋 이 단계에서 할 일

이 문서는 Firebase를 처음 설정하는 단계입니다. 다음 작업을 수행합니다:

1. ✅ Firebase 프로젝트 생성
2. ✅ Firebase Authentication 활성화 (Google + 익명 로그인)
3. ✅ Cloud Firestore Database 생성
4. ✅ Firebase SDK 설정 파일 생성

**완료 후**: Firestore 보안 규칙 및 인덱스 설정을 위해 [Step 2](02_FIRESTORE_CONFIG.md)로 이동합니다.

---

## 🎯 1. 사전 준비

### 필요한 것

- ☑️ Google 계정 (Gmail)
- ☑️ 웹 브라우저 (Chrome 권장)
- ☑️ 인터넷 연결

### 선택사항 (Step 3에서 사용)

- Node.js (v14 이상)
- Firebase CLI

---

## 🏗️ 2. Firebase 프로젝트 생성

### 2.1 Firebase Console 접속

1. **Firefox Console 열기**

   ```
   https://console.firebase.google.com
   ```

2. **Google 계정으로 로그인**
   - Gmail 계정 사용

### 2.2 새 프로젝트 만들기

1. **"프로젝트 추가" 클릭**

2. **Step 1: 프로젝트 이름 입력**

   ```
   프로젝트 이름: 500text-threads
   (또는 원하는 이름)
   ```

   - 프로젝트 ID가 자동 생성됨 (예: `500text-threads-xxxxx`)
   - ✅ "계속" 클릭

3. **Step 2: Google Analytics 설정**

   - "이 프로젝트에서 Google Analytics 사용 설정"
   - ✅ 권장: **사용 안함** (나중에 활성화 가능)
   - ✅ "프로젝트 만들기" 클릭

4. **프로젝트 생성 대기**
   - 약 30초 소요
   - ✅ "계속" 클릭하여 프로젝트 콘솔로 이동

---

## 🔐 3. Authentication 설정

### 3.1 Authentication 활성화

1. **왼쪽 메뉴에서 "Authentication" 클릭**

   - 또는 상단 "빌드" → "Authentication" 선택

2. **"시작하기" 버튼 클릭**

### 3.2 익명(Anonymous) 로그인 활성화

1. **"Sign-in method" 탭 선택**

2. **"익명" 제공업체 찾기**

   - 목록에서 "익명" 행 클릭

3. **익명 로그인 사용 설정**
   - 스위치를 "사용 설정됨"으로 변경
   - ✅ "저장" 클릭

### 3.3 Google 로그인 활성화 (권장)

1. **"Google" 제공업체 찾기**

   - 목록에서 "Google" 행 클릭

2. **Google 로그인 사용 설정**
   - 스위치를 "사용 설정됨"으로 변경
   - 프로젝트 지원 이메일 선택 (본인 Gmail)
   - ✅ "저장" 클릭

**결과 확인**:

```
✅ 익명          사용 설정됨
✅ Google        사용 설정됨
```

---

## 🗄️ 4. Cloud Firestore 생성

### 4.1 Firestore Database 만들기

1. **왼쪽 메뉴에서 "Firestore Database" 클릭**

   - 또는 상단 "빌드" → "Firestore Database" 선택

2. **"데이터베이스 만들기" 버튼 클릭**

### 4.2 보안 규칙 모드 선택

**중요**: 처음에는 테스트 모드로 시작  
(Step 2에서 프로덕션 규칙으로 교체)

1. **"테스트 모드에서 시작" 선택**

   ```
   ⚠️ 이 규칙은 30일 후 만료됩니다
   → 괜찮습니다. Step 2에서 프로덕션 규칙 적용
   ```

2. ✅ "다음" 클릭

### 4.3 Firestore 위치 선택

1. **위치 선택**

   ```
   권장: asia-northeast3 (서울)

   이유: 한국 사용자에게 가장 빠른 응답 속도
   ```

2. ✅ "사용 설정" 클릭

3. **데이터베이스 생성 대기**
   - 약 1-2분 소요
   - 완료되면 빈 Firestore 콘솔이 표시됨

**결과 확인**:

```
Firestore Database
├── (root)
└── [데이터가 아직 없습니다]
```

---

## 🌐 5. Firebase Hosting 활성화

### 5.1 Hosting 시작하기

1. **왼쪽 메뉴에서 "Hosting" 클릭**

2. **"시작하기" 버튼 클릭**

3. **설정 단계 무시**
   - "다음", "다음", "콘솔로 이동" 순서대로 클릭
   - (실제 배포는 Step 3에서 CLI로 수행)

---

## 📱 6. 웹 앱 등록 및 SDK 설정

### 6.1 웹 앱 추가

1. **프로젝트 개요 (홈) 페이지로 이동**

   - 왼쪽 상단 "프로젝트 개요" 클릭

2. **"웹 앱에 Firebase 추가" 클릭**

   - 웹 아이콘 `</>` 클릭

3. **앱 정보 입력**

   ```
   앱 닉네임: 500text-threads-web
   Firebase Hosting 설정: ✅ 체크
   ```

4. ✅ "앱 등록" 클릭

### 6.2 Firebase SDK 설정 복사

화면에 표시되는 설정 코드를 복사합니다:

```javascript
// 이런 형태의 코드가 표시됩니다
const firebaseConfig = {
  apiKey: "AIza...xxxxx",
  authDomain: "500text-threads-xxxxx.firebaseapp.com",
  projectId: "500text-threads-xxxxx",
  storageBucket: "500text-threads-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxxx",
};
```

### 6.3 firebase-config.js 파일 생성

1. **프로젝트 폴더로 이동**

   ```bash
   cd /Users/gimhyeonjun/Desktop/00.Program/500text_threads
   ```

2. **firebase-config.js 파일 생성 또는 수정**

   텍스트 에디터로 `firebase-config.js` 파일을 열고 다음 내용 입력:

   ```javascript
   // Firebase SDK 설정
   // 버전: v2.0.0
   // 최종 수정: 2025-11-22

   const firebaseConfig = {
     apiKey: "여기에_본인의_API_KEY_입력",
     authDomain: "여기에_본인의_AUTH_DOMAIN_입력",
     projectId: "여기에_본인의_PROJECT_ID_입력",
     storageBucket: "여기에_본인의_STORAGE_BUCKET_입력",
     messagingSenderId: "여기에_본인의_SENDER_ID_입력",
     appId: "여기에_본인의_APP_ID_입력",
   };

   // Firebase 초기화
   firebase.initializeApp(firebaseConfig);
   ```

3. **6.2에서 복사한 설정값으로 교체**

### 6.4 설정 확인

Firebase Console에서:

- ✅ "콘솔로 이동" 클릭
- 프로젝트 개요 페이지의 "내 앱" 섹션에 웹 앱 표시 확인

---

## ✅ Step 1 완료 체크리스트

다음 항목이 모두 완료되었는지 확인하세요:

- [ ] Firebase 프로젝트 생성 완료
- [ ] Authentication 활성화됨
  - [ ] 익명 로그인 사용 설정
  - [ ] Google 로그인 사용 설정
- [ ] Firestore Database 생성 완료
  - [ ] 위치: `asia-northeast3 (서울)` 선택
  - [ ] 테스트 모드로 시작
- [ ] Firebase Hosting 활성화됨
- [ ] 웹 앱 등록 완료
- [ ] `firebase-config.js` 파일 생성 및 설정 완료

---

## 🎯 다음 단계

> **Step 1을 모두 완료했습니다!** 🎉
>
> 이제 Firestore 보안 규칙과 인덱스를 설정할 차례입니다.
>
> 👉 **[Step 2: Firestore 설정](02_FIRESTORE_CONFIG.md)** 으로 이동하세요.

---

## 🆘 문제 해결

### Q1: Firebase Console이 한국어로 표시되지 않아요

**A**: 브라우저 설정에서 한국어를 기본 언어로 설정하거나, 우측 상단 프로필 → 언어 설정

### Q2: 프로젝트 ID를 변경하고 싶어요

**A**: 프로젝트 생성 시 ID 옆의 "수정" 아이콘을 클릭하여 변경 가능 (생성 후에는 변경 불가)

### Q3: Google Analytics를 나중에 추가할 수 있나요?

**A**: 네, 프로젝트 설정 → 통합 → Google Analytics에서 언제든 추가 가능

### Q4: firebase-config.js 파일의 설정값이 보안에 문제가 되나요?

**A**: 아니요, 이 설정값은 공개되어도 안전합니다. 실제 보안은 Firestore 규칙으로 관리됩니다.

---

**문서 정보**

- **버전**: v2.0.0
- **최종 수정**: 2025-11-22
- **문서 타입**: Step 1 - Firebase 프로젝트 설정
- **다음 단계**: [Step 2 - Firestore 설정](02_FIRESTORE_CONFIG.md)
