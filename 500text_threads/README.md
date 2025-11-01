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

### 📊 트래킹 대시보드 (NEW!)
- ✅ 포스팅 성과 분석 (조회수, 좋아요, 공유 수, 댓글 수)
- ✅ 개별 포스트별 독립 트래킹 (격리된 데이터 관리)
- ✅ Chart.js 기반 데이터 시각화 (7일간 트렌드)
- ✅ 통계 요약 및 트렌드 분석
- ✅ 트래킹 중인 포스트 관리 (시작/중지, 데이터 추가)
- ✅ 반자동 포스팅 시 자동 트래킹 시작
- ✅ 기존 데이터 마이그레이션 (선택적/일괄 변환)

### 🏷️ 해시태그 관리 시스템 (NEW!)
- ✅ 정규식 기반 해시태그 자동 추출
- ✅ 사용자 정의 기본 해시태그 설정
- ✅ 해시태그 설정 모달 및 실시간 표시
- ✅ 포스팅 시 자동 해시태그 추가

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
- **트래킹**: 포스팅 후 성과 데이터 입력 및 분석
- **해시태그 관리**: 기본 해시태그 설정 및 자동 추가

### 📊 트래킹 시스템 사용법 (모바일 최적화) ⚡
#### 워크플로우 (5단계)
1. **글 작성**: 왼쪽(레퍼런스) 또는 오른쪽(작성) 패널에서 글 작성
2. **반자동 포스팅**: "🚀 반자동 포스팅" 버튼 클릭
   - 최적화된 텍스트가 클립보드에 복사됨
   - Threads 새 탭이 열림
   - **자동으로 트래킹 포스트 생성** ✅
3. **Threads에 포스팅**: 복사된 텍스트를 붙여넣고 게시
4. **성과 데이터 입력** (모바일 최적화):
   - **트래킹 탭**으로 이동
   - 포스트 카드의 **지표 칩을 탭**하면 그래프로 자동 이동 (1탭) ⚡
   - 또는 카드의 **"📊 데이터 입력"** 버튼 클릭 (1탭)
   - 바텀시트에서 숫자 스테퍼(±)로 빠른 입력
   - 날짜 선택: 오늘/어제 탭으로 1탭 입력
   - 저장 완료
5. **분석 확인**: 대시보드에서 통계 및 트렌드 확인

**모바일 UX 개선 사항:**
- ⚡ **탭 수 감소**: 카드 → 지표 칩 → 그래프 (1탭, 약 30% 감소)
- ⚡ **빠른 입력**: 숫자 스테퍼로 증감 조작
- ⚡ **바텀시트**: 키패드로 가려지지 않도록 자동 스크롤 보정
- ⚡ **성능 최적화**: 배치 렌더링으로 부드러운 스크롤
- ⚡ **접근성**: 스크린리더 지원, 터치 타겟 44px 보장

#### 저장된 글에서 트래킹 시작
- 저장된 글 탭에서 특정 글의 "📊 트래킹" 버튼 클릭
- 일괄 마이그레이션: "📊 모든 글 트래킹 시작" 버튼으로 한 번에 변환 (중복 확인 포함)

#### 트래킹 관리
- **트래킹 시작/중지**: 각 포스트별로 독립적으로 관리
- **데이터 추가**: 시간에 따라 성과 데이터 계속 추가 가능
- **시각적 피드백**: 활성/비활성 상태, 메트릭 데이터 유무, 마지막 업데이트 시간 표시

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

### 핵심 문서
- `report/데이터_모델_문서.md` - Firestore 데이터 모델 구조 및 관계 설명
- `report/데이터_모델_관계_다이어그램.md` - 데이터 관계 시각적 다이어그램
- `report/데이터_마이그레이션_가이드.md` - 기존 데이터 마이그레이션 가이드
- `report/2510292055_트래킹_시스템_개선_체크리스트.md` - 트래킹 시스템 개선 작업 내역

### 개발 문서
- `report/2510282140_Semi-Automated_Threads_Posting_Solution_Technical_Documentation.md`
  - Semi-automated Threads posting solution (Firebase multi-user, clipboard fallbacks, accessibility, mobile)
- `report/2510290820_500text_threads_project_analysis_and_development_roadmap.md`
  - 종합 프로젝트 분석 및 향후 개발 방향성 문서
- `DEPLOYMENT_GUIDE.md`
  - 단계별 배포 과정 및 체크리스트
- `FIREBASE_SETUP.md`
  - Firebase 프로젝트 설정 상세 가이드

## 📞 지원

문제가 발생하거나 기능 요청이 있으시면 GitHub Issues를 통해 연락해주세요.