# Firebase 설정 가이드 (Threads 반자동 포스팅 연계)

## 🔥 Firebase 프로젝트 설정 단계

### 1. Firebase 프로젝트 생성
1. [Firebase Console](https://console.firebase.google.com) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: "500text-writer")
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

### 2. Authentication 설정
1. 좌측 메뉴에서 "Authentication" 클릭
2. "시작하기" 버튼 클릭
3. "Sign-in method" 탭으로 이동
4. "Google" 제공업체 활성화
5. 프로젝트 지원 이메일 설정
6. "저장" 클릭

### 3. Firestore Database 설정
1. 좌측 메뉴에서 "Firestore Database" 클릭
2. "데이터베이스 만들기" 클릭
3. "테스트 모드에서 시작" 선택 (개발용)
4. 위치 선택 (asia-northeast3 권장)
5. "완료" 클릭

### 4. 웹 앱 추가
1. 프로젝트 설정 (⚙️) > "프로젝트 설정" 클릭
2. "일반" 탭에서 스크롤 다운
3. "내 앱" 섹션에서 "</>" 아이콘 클릭
4. 앱 닉네임 입력 (예: "500text-web")
5. "Firebase Hosting 설정" 체크 (선택사항)
6. "앱 등록" 클릭
7. 설정 정보 복사

### 5. 설정 정보 적용
복사된 설정 정보를 `index.html`의 `firebaseConfig` 객체에 붙여넣기:

```javascript
const firebaseConfig = {
  apiKey: "실제_API_키",
  authDomain: "프로젝트_ID.firebaseapp.com",
  projectId: "실제_프로젝트_ID",
  storageBucket: "프로젝트_ID.appspot.com",
  messagingSenderId: "실제_메시징_센더_ID",
  appId: "실제_앱_ID"
};
```

### 6. Firestore 보안 규칙 설정
1. "Firestore Database" > "규칙" 탭으로 이동
2. 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자별 텍스트 데이터
    match /users/{userId}/texts/{textId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 사용자 프로필 데이터
    match /users/{userId}/profile/{profileId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. "게시" 클릭

### 7. GitHub Pages 도메인 추가 (승인된 도메인)
1. "Authentication" > "설정" 탭으로 이동
2. "승인된 도메인" 섹션에서 "도메인 추가"
3. GitHub Pages URL 추가 (예: `https://username.github.io`)
4. "완료" 클릭

### 8. 권장 추가 설정
1. Authentication > 설정 > 승인된 도메인에 실제 배포 URL 추가
2. Firestore > 인덱스는 기본값 유지(필요 시 쿼리 사용에 맞춰 생성)
3. 보안 규칙은 개발/운영 단계에 맞춰 최소 권한 원칙 유지

## 🚀 배포 후 확인사항

1. GitHub Pages가 정상적으로 배포되었는지 확인
2. Firebase Console에서 사용자 인증 로그 확인
3. Firestore에서 데이터 저장 확인
4. 다른 기기에서 로그인 테스트
5. 반자동 포스팅 흐름(클립보드 복사 폴백, Threads 새 탭 열기, 수동 복사 모달) 확인
6. 트래킹 대시보드 데이터 입력 및 차트 렌더링 확인
7. 해시태그 관리 시스템 정상 작동 확인

## 🔧 문제 해결

### 일반적인 문제들
1. **Firebase 초기화 실패**: 설정 정보 확인
2. **로그인 실패**: 승인된 도메인 확인
3. **데이터 저장 실패**: Firestore 규칙 확인
4. **CORS 오류**: Firebase 설정에서 도메인 추가
5. **클립보드 복사 실패**: HTTPS 환경 사용, 권한/포커스 확인, execCommand 폴백 또는 수동 복사 모달 확인

### 디버깅 방법
1. 브라우저 개발자 도구 콘솔 확인
2. Firebase Console의 로그 확인
3. 네트워크 탭에서 API 호출 확인
4. `runFirebaseTests()` 실행으로 초기 연동 및 LLM/클립보드 항목 점검
5. 트래킹 데이터 저장 및 차트 렌더링 확인
6. 해시태그 설정 저장 및 불러오기 확인
