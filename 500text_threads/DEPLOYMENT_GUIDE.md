# 🚀 배포 가이드 - 500자 미만 글 작성기 (Threads 반자동 포스팅 포함)

## 📋 배포 전 체크리스트

### ✅ Firebase 설정 완료
- [ ] Firebase 프로젝트 생성
- [ ] Authentication 활성화 (Google 로그인)
- [ ] Firestore Database 생성
- [ ] 웹 앱 등록 및 설정 정보 복사
- [ ] Firestore 보안 규칙 설정
- [ ] `index.html`에 Firebase 설정 정보 입력
 - [ ] 승인된 도메인(Allowed Domains) 추가

### ✅ GitHub Repository 설정
- [ ] GitHub Repository 생성
- [ ] 모든 파일 업로드
- [ ] GitHub Pages 활성화
- [ ] Firebase에 GitHub Pages 도메인 추가

## 🔧 단계별 배포 과정

### 1단계: Firebase 프로젝트 설정

1. **Firebase Console 접속**
   ```
   https://console.firebase.google.com
   ```

2. **프로젝트 생성**
   - 프로젝트 이름: `500text-writer` (또는 원하는 이름)
   - Google Analytics: 선택사항
   - 위치: `asia-northeast3` (서울)

3. **Authentication 설정**
   ```
   Authentication > Sign-in method > Google > 활성화
   ```

4. **Firestore Database 생성**
   ```
   Firestore Database > 데이터베이스 만들기 > 테스트 모드에서 시작
   ```

5. **웹 앱 추가**
   ```
   프로젝트 설정 > 일반 > 웹 앱 추가
   ```

### 2단계: 코드 설정

1. **Firebase 설정 정보 복사**
   - 웹 앱 등록 후 나타나는 설정 정보 복사

2. **index.html 수정**
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

3. **Firestore 보안 규칙 설정**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/texts/{textId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /users/{userId}/profile/{profileId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### 3단계: GitHub Repository 설정

1. **Repository 생성**
   ```
   Repository 이름: 500text_threads
   Public: 체크
   README: 체크
   ```

2. **파일 업로드**
   - 모든 프로젝트 파일을 Repository에 업로드
   - `.gitignore` 파일 확인

3. **GitHub Pages 활성화**
   ```
   Settings > Pages > Source: Deploy from a branch
   Branch: main, Folder: / (root)
   ```

### 4단계: Firebase 도메인 설정

1. **승인된 도메인 추가**
   ```
   Authentication > 설정 > 승인된 도메인
   GitHub Pages URL 추가: https://username.github.io
   ```

2. **Firestore 규칙 게시**
   ```
   Firestore Database > 규칙 > 게시
   ```

## 🧪 배포 후 테스트

### 1. 기본 기능 테스트
- [ ] 페이지 로딩 확인
- [ ] Google 로그인 테스트
- [ ] 사용자명 로그인 테스트
- [ ] 글 작성 및 저장 테스트
- [ ] 글 불러오기 테스트
- [ ] 글 삭제 테스트

### 1-1. 반자동 포스팅 테스트
- [ ] `🚀 반자동 포스팅` 버튼 클릭 시 최적화 모달/가이드 표시
- [ ] 클립보드 API 지원 환경에서 즉시 복사 성공
- [ ] 비지원 환경에서 execCommand 폴백 성공
- [ ] 폴백 실패 시 수동 복사 모달 표시
- [ ] Threads 새 탭 열림(프로필 URL 설정 시)

### 2. Firebase 연동 테스트
- [ ] 브라우저 개발자 도구 콘솔에서 `runFirebaseTests()` 실행
- [ ] 모든 테스트 통과 확인
- [ ] Firebase Console에서 데이터 확인

### 3. 멀티유저 테스트
- [ ] 다른 기기에서 로그인 테스트
- [ ] 사용자별 데이터 격리 확인
- [ ] 데이터 동기화 확인

## 🔍 문제 해결

### 일반적인 문제들

1. **Firebase 초기화 실패**
   ```
   해결방법: 설정 정보 확인, 도메인 승인 확인
   ```

2. **로그인 실패**
   ```
   해결방법: Google 로그인 활성화 확인, 도메인 추가 확인
   ```

3. **데이터 저장 실패**
   ```
   해결방법: Firestore 규칙 확인, 사용자 인증 상태 확인
   ```

4. **CORS 오류**
   ```
   해결방법: Firebase 설정에서 도메인 추가
   ```

5. **클립보드 복사 실패**
   ```
   해결방법: HTTPS 환경 사용, 권한/포커스 확인, execCommand 폴백 또는 수동 복사 사용
   ```

### 디버깅 방법

1. **브라우저 개발자 도구**
   - 콘솔에서 오류 메시지 확인
   - 네트워크 탭에서 API 호출 확인

2. **Firebase Console**
   - Authentication > 사용자 탭에서 로그인 상태 확인
   - Firestore > 데이터 탭에서 데이터 저장 확인

3. **테스트 스크립트**
   - `runFirebaseTests()` 실행하여 연동 상태 확인

## 📊 모니터링

### Firebase Console 모니터링
- Authentication > 사용자: 로그인 사용자 수
- Firestore > 사용량: 데이터베이스 사용량
- 프로젝트 설정 > 사용량: 전체 사용량

### 성능 지표
- 페이지 로딩 시간: < 3초
- 로그인 시간: < 10초
- 데이터 저장 시간: < 2초
- 반자동 포스팅 준비(최적화+복사) 시간: < 1초

## 🎯 성공 기준

- [ ] 모든 사용자가 정상적으로 로그인 가능
- [ ] 사용자별 데이터 완전 격리
- [ ] 데이터 실시간 동기화
- [ ] 오프라인에서도 기본 기능 작동
- [ ] 모바일에서도 정상 작동
- [ ] 반자동 포스팅 흐름이 정책 준수 방식으로 정상 작동

## 📞 지원

문제가 발생하거나 추가 도움이 필요한 경우:
1. GitHub Issues에 문제 보고
2. Firebase Console 로그 확인
3. 브라우저 개발자 도구 콘솔 확인

---

**배포 완료 후에는 테스트 스크립트(`test-firebase.js`)를 제거하는 것을 권장합니다.**
