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

## 🛠️ 기술 스택

### 프론트엔드
- HTML5, CSS3, Vanilla JavaScript
- Firebase SDK v10.7.1
- GitHub Pages 호스팅

### 백엔드 (Firebase)
- Firebase Authentication (Google OAuth)
- Cloud Firestore (NoSQL 데이터베이스)
- Firebase Hosting (선택사항)

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

- **시니어 개발자**: Firebase 연동 및 멀티유저 시스템 구현
- **주니어 개발자**: 프론트엔드 최적화 및 사용자 경험 개선

## 📞 지원

문제가 발생하거나 기능 요청이 있으시면 GitHub Issues를 통해 연락해주세요.