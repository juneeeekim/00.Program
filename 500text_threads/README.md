# 500자 미만 글 작성기 - Firebase 연동 버전

레퍼런스 글을 참고하면서 새로운 글을 작성할 수 있는 듀얼 패널 웹 애플리케이션입니다.
Firebase Authentication과 Firestore를 사용하여 멀티유저 지원 및 클라우드 데이터 저장을 제공합니다.

## 🚀 주요 기능

### 🔐 인증 시스템
- ✅ Google OAuth 2.0 로그인 (Firebase Auth)
- ✅ 사용자명 기반 로그인 (Anonymous Auth)
- ✅ 자동 세션 관리 및 토큰 갱신
- ✅ 사용자별 데이터 완전 격리

### 📖 레퍼런스 글 패널 (왼쪽)
- ✅ 실시간 글자 수 카운팅 (500자 제한)
- ✅ 참고할 원본 글 입력 및 클라우드 저장
- ✅ TXT 파일 다운로드
- ✅ 독립적인 임시 저장

### ✏️ 수정/작성 글 패널 (오른쪽)
- ✅ 레퍼런스를 참고한 새로운 글 작성
- ✅ 실시간 글자 수 카운팅 (500자 제한)
- ✅ 작성한 글 클라우드 저장 및 다운로드
- ✅ 독립적인 임시 저장

### ☁️ 클라우드 기능
- ✅ Firestore 실시간 데이터 동기화
- ✅ 사용자별 데이터 격리 및 보안
- ✅ 기존 로컬 데이터 자동 마이그레이션
- ✅ 오프라인 지원 (Firebase 오프라인 캐싱)

### 🔍 LLM 검증 기능 (NEW!)
- ✅ ChatGPT, Gemini, Perplexity, Grok 연동
- ✅ 하드코딩된 검증 프롬프트 템플릿
- ✅ 자동 클립보드 복사 및 새 탭 열기
- ✅ 비용 0원 (API 사용 없음)
- ✅ 사용자 중심의 검증 프로세스

### 🚀 Threads 반자동 포스팅 (업데이트)
- ✅ 반자동 포스팅 버튼 제공(오른쪽 패널)
- ✅ 500자 기준 단어 경계 자르기, 줄바꿈/공백 정규화, HTML 이스케이프
- ✅ 해시태그 자동 추출/기본값 추가
- ✅ 클립보드 API → execCommand → 수동 복사 모달의 폴백 체인
- ✅ Threads 새 탭 열기 또는 간단 가이드 표시(프로필 URL 미설정 시)

## 🛠️ 기술 스택

### 프론트엔드
- HTML5, CSS3, Vanilla JavaScript
- Firebase SDK v10.7.1
- GitHub Pages 호스팅

### 백엔드 (Firebase)
- Firebase Authentication (Google OAuth)
- Cloud Firestore (NoSQL 데이터베이스)
- Firebase Hosting (선택사항)

## 📖 사용법

### 기본 사용법
1. `index.html` 파일을 웹 브라우저에서 열기
2. **왼쪽 패널**: 참고할 레퍼런스 글 입력
3. **오른쪽 패널**: 레퍼런스를 참고하여 새로운 글 작성
4. 각 패널에서 실시간으로 글자 수 확인 (500자 제한)
5. "저장" 버튼으로 각각의 글 저장
6. "TXT 다운로드" 버튼으로 파일 다운로드

### 고급 사용법
- **임시 저장**: 각 패널에서 자동으로 임시 저장됨
- **복원**: 프로그램 재시작 시 임시 저장된 글 복원 제안
- **편집**: 저장된 글 목록에서 클릭하여 해당 패널로 복원
- **타입 구분**: 저장된 글에서 레퍼런스/수정작성 타입 구분 표시

### 🔍 LLM 검증 사용법
1. 글 작성 후 저장
2. 저장된 글 목록에서 "🔍 LLM 검증" 버튼 클릭
3. 원하는 LLM 서비스 선택 (ChatGPT, Gemini, Perplexity, Grok)
4. 새 탭에서 해당 LLM 사이트가 열림
5. 프롬프트와 글이 클립보드에 복사됨
6. LLM 프롬프트 창에 Ctrl+V로 붙여넣기
7. 검증 결과 확인 후 필요시 글 수정

## 📋 설정 방법

### 1. Firebase 프로젝트 설정
1. [Firebase Console](https://console.firebase.google.com) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **Authentication** > **Sign-in method** 에서 Google 로그인 활성화
4. **Firestore Database** 생성 (테스트 모드로 시작)
5. **Project Settings** > **General** 에서 웹 앱 추가
6. 설정 정보를 `index.html`의 `firebaseConfig`에 입력

### 2. Firestore 보안 규칙 설정
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

### 3. GitHub Pages 배포
1. GitHub Repository 생성
2. 파일들을 Repository에 업로드
3. Repository Settings > Pages에서 배포 활성화
4. Firebase 설정에서 승인된 도메인에 GitHub Pages URL 추가

## 💰 비용

### 무료 티어 (월간)
- **Firebase Authentication**: 무제한 사용자
- **Firestore 읽기**: 50,000회
- **Firestore 쓰기**: 20,000회
- **Firestore 저장공간**: 1GB
- **GitHub Pages**: 무료 호스팅

### 예상 사용량
- 일일 활성 사용자: 100명
- 월간 사용자: 3,000명
- 평균 글 저장: 사용자당 월 10개
- **예상 비용**: $0/월 (무료 티어 내)

## 🔒 보안 기능

- 사용자별 데이터 완전 격리
- Firebase Auth 자동 토큰 관리
- HTTPS 강제 통신
- Firestore 보안 규칙 적용
- 사용자 데이터 암호화 저장
 - 승인된 도메인(Allowed Domains) 설정

## 📱 반응형 디자인

- 데스크톱과 모바일 모두 지원
- 터치 친화적 인터페이스
- 자동 레이아웃 조정

## 🌐 브라우저 지원

- Chrome (권장)
- Firefox
- Safari
- Edge

## 📄 라이선스

MIT License

## 🔧 개발자 정보

- **시니어 개발자**: Firebase 연동, 보안/아키텍처, 반자동 포스팅 기능 설계
- **주니어 개발자**: UI/UX 최적화, LLM 검증 UX, 접근성/반응형 개선

## 📚 기술 문서

- `report/2510282140_Semi-Automated_Threads_Posting_Solution_Technical_Documentation.md`
  - Semi-automated Threads posting solution (Firebase multi-user, clipboard fallbacks, accessibility, mobile)

## 📞 지원

문제가 발생하거나 기능 요청이 있으시면 GitHub Issues를 통해 연락해주세요.