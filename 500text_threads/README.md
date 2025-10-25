# 500자 미만 글 작성기 - 레퍼런스 편집 도구

레퍼런스 글을 참고하면서 새로운 글을 작성할 수 있는 듀얼 패널 웹 애플리케이션입니다.

## 주요 기능

### 📖 레퍼런스 글 패널 (왼쪽)
- ✅ 실시간 글자 수 카운팅 (500자 제한)
- ✅ 참고할 원본 글 입력 및 저장
- ✅ TXT 파일 다운로드
- ✅ 독립적인 임시 저장

### ✏️ 수정/작성 글 패널 (오른쪽)
- ✅ 레퍼런스를 참고한 새로운 글 작성
- ✅ 실시간 글자 수 카운팅 (500자 제한)
- ✅ 작성한 글 저장 및 다운로드
- ✅ 독립적인 임시 저장

### 🔄 공통 기능
- ✅ 각 패널별 독립적인 글자 수 카운팅
- ✅ 진행률 바를 통한 시각적 피드백
- ✅ 글 저장 및 불러오기 (로컬 스토리지)
- ✅ 저장된 글 편집 및 삭제 (타입별 구분)
- ✅ 반응형 디자인 (모바일 지원)
- ✅ 깔끔하고 직관적인 UI

## 사용법

### Google OAuth 설정 (필수)
1. [Google Cloud Console 설정 가이드](docs/google-cloud-setup-guide.md) 참조
2. `config/auth-config.js`에서 클라이언트 ID 설정
3. `test-oauth.html`로 OAuth 설정 테스트

### 기본 사용법
1. `index.html` 파일을 웹 브라우저에서 열기
2. **Google 로그인** 또는 **기존 사용자명 로그인** 선택
3. **왼쪽 패널**: 참고할 레퍼런스 글 입력
4. **오른쪽 패널**: 레퍼런스를 참고하여 새로운 글 작성
5. 각 패널에서 실시간으로 글자 수 확인 (500자 제한)
6. "저장" 버튼으로 각각의 글 저장
7. "TXT 다운로드" 버튼으로 파일 다운로드

### 고급 사용법
- **임시 저장**: 각 패널에서 자동으로 임시 저장됨
- **복원**: 프로그램 재시작 시 임시 저장된 글 복원 제안
- **편집**: 저장된 글 목록에서 클릭하여 해당 패널로 복원
- **타입 구분**: 저장된 글에서 레퍼런스/수정작성 타입 구분 표시

## 파일 구조

```
500text_threads/
├── index.html                    # 메인 HTML 파일
├── style.css                     # 스타일시트
├── script.js                     # 메인 JavaScript 로직
├── test-oauth.html              # Google OAuth 테스트 도구
├── config/
│   └── auth-config.js           # 인증 설정 파일
├── js/
│   ├── google-auth-manager.js   # Google OAuth 관리
│   └── data-migration-manager.js # 데이터 마이그레이션 관리
├── docs/
│   └── google-cloud-setup-guide.md # Google Cloud 설정 가이드
├── .kiro/
│   └── steering/
│       └── google-oauth-spec.md # OAuth 구현 Spec 문서
└── README.md                    # 프로젝트 설명서
```

## 기술 스택

- HTML5
- CSS3 (Flexbox, Grid, 애니메이션)
- Vanilla JavaScript (ES6+)
- Google OAuth 2.0 API
- Google Identity Services
- Local Storage API
- Web Crypto API (데이터 암호화)

## 특징

- **듀얼 패널**: 레퍼런스와 수정 글을 동시에 관리
- **독립적 관리**: 각 패널별 독립적인 저장/복원/다운로드
- **한글 최적화**: 한글 글자 수를 정확하게 카운팅
- **사용자 친화적**: 직관적인 UI/UX
- **데이터 보존**: 브라우저 로컬 스토리지에 자동 저장
- **반응형**: 데스크톱과 모바일 모두 지원
- **오프라인**: 인터넷 연결 없이도 사용 가능
- **타입 구분**: 저장된 글의 레퍼런스/수정작성 타입 구분

## 브라우저 지원

### 지원 브라우저 (최신 2개 버전)
- ✅ **Chrome** 90+ (권장)
- ✅ **Firefox** 88+
- ✅ **Safari** 14+
- ✅ **Edge** 90+

### 브라우저 호환성 테스트
애플리케이션의 브라우저 호환성을 확인하려면:
1. `test-browser-compatibility.html` 파일을 각 브라우저에서 열기
2. "▶️ Run All Tests" 버튼 클릭
3. 테스트 결과 확인 및 내보내기

자세한 테스트 가이드는 [브라우저 호환성 테스트 가이드](docs/browser-compatibility-testing-guide.md)를 참조하세요.

### 필수 브라우저 기능
- Local Storage
- Fetch API
- ES6+ (Arrow Functions, Promises)
- CSS Grid & Flexbox
- Web Crypto API (선택적)

## 라이선스

MIT License


## 🔐 Google OAuth 2.0 인증

### 주요 기능
- **안전한 로그인**: Google 계정으로 보안성 높은 인증
- **자동 토큰 관리**: 토큰 만료 시 자동 갱신 (만료 5분 전)
- **데이터 마이그레이션**: 기존 사용자명 → Google 계정 자동 이전
- **폴백 시스템**: Google 로그인 실패 시 기존 방식 사용 가능
- **환경 자동 감지**: 개발/프로덕션 환경 자동 인식 및 설정

### 빠른 시작 가이드

#### 1단계: Google Cloud Console 설정

1. **프로젝트 생성**
   - [Google Cloud Console](https://console.cloud.google.com) 접속
   - 새 프로젝트 생성: "500text-writer" (또는 원하는 이름)

2. **OAuth 동의 화면 구성**
   - 좌측 메뉴: "API 및 서비스" > "OAuth 동의 화면"
   - 사용자 유형: **외부 (External)** 선택
   - 앱 정보 입력:
     - 앱 이름: "500자 미만 글 작성기"
     - 사용자 지원 이메일: 본인 이메일
     - 개발자 연락처 정보: 본인 이메일
   - 범위 추가: `profile`, `email` (기본 범위)
   - 저장 후 계속

3. **OAuth 2.0 클라이언트 ID 생성**
   - 좌측 메뉴: "API 및 서비스" > "사용자 인증 정보"
   - 상단: "+ 사용자 인증 정보 만들기" > "OAuth 클라이언트 ID"
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: "500text-writer-web-client"

4. **승인된 JavaScript 원본 추가**
   
   **로컬 개발 환경:**
   ```
   http://localhost
   http://localhost:3000
   http://localhost:8080
   http://127.0.0.1
   http://127.0.0.1:3000
   ```
   
   **프로덕션 환경 (예시):**
   ```
   https://yourdomain.com
   https://www.yourdomain.com
   ```

5. **승인된 리디렉션 URI 추가**
   ```
   http://localhost/callback
   https://yourdomain.com/callback
   ```

6. **클라이언트 ID 복사**
   - 생성 완료 후 표시되는 클라이언트 ID 복사
   - 형식: `123456789-abc123def456.apps.googleusercontent.com`

#### 2단계: 애플리케이션 설정

1. **config/auth-config.js 파일 열기**

2. **클라이언트 ID 설정**
   ```javascript
   // 개발 환경용 (localhost)
   getClientIdForEnvironment() {
       if (this.isDevelopment) {
           return '123456789-abc123def456.apps.googleusercontent.com';  // 여기에 실제 Client ID 입력
       } else {
           return '987654321-xyz789uvw456.apps.googleusercontent.com';  // 프로덕션용 Client ID
       }
   }
   ```

3. **파일 저장 후 브라우저 새로고침**

#### 3단계: 테스트 및 검증

1. **설정 확인**
   - `test-oauth.html` 파일을 브라우저에서 열기
   - "설정 확인" 버튼 클릭
   - 설정 상태 확인 (✅ 완료 표시 확인)

2. **로그인 테스트**
   - "Google 로그인 테스트" 버튼 클릭
   - Google 계정 선택 및 권한 승인
   - 로그인 성공 확인

3. **메인 애플리케이션 사용**
   - `index.html` 파일 열기
   - "Google로 로그인" 버튼 클릭
   - 정상 작동 확인

### 배포 시나리오별 설정

#### GitHub Pages
```javascript
// config/auth-config.js
origins: ['https://username.github.io']
redirectUri: 'https://username.github.io/500text_threads/callback'
```

#### Vercel
```javascript
origins: ['https://your-app.vercel.app']
redirectUri: 'https://your-app.vercel.app/callback'
```

#### Netlify
```javascript
origins: ['https://your-app.netlify.app']
redirectUri: 'https://your-app.netlify.app/callback'
```

#### 커스텀 도메인
```javascript
origins: ['https://yourdomain.com', 'https://www.yourdomain.com']
redirectUri: 'https://yourdomain.com/callback'
```

### 보안 기능
- **토큰 자동 갱신**: 만료 5분 전 자동 갱신
- **세션 검증**: 페이지 로드 시 토큰 유효성 확인
- **데이터 암호화**: Web Crypto API 사용 (선택적)
- **CSRF 방지**: Google OAuth 2.0 표준 보안
- **HTTPS 강제**: 프로덕션 환경에서 HTTPS 필수

## 📦 데이터 마이그레이션

### 자동 마이그레이션
- 기존 사용자명 기반 데이터를 Google 계정으로 안전하게 이전
- 마이그레이션 전 자동 백업 생성
- 실패 시 자동 롤백 기능
- 데이터 무결성 검증

### 마이그레이션 과정
1. **기존 데이터 감지**: 사용자명 기반 데이터 확인
2. **사용자 확인**: 마이그레이션 동의 요청 (저장된 글 개수 표시)
3. **백업 생성**: 기존 데이터 안전 백업 (`dualTextWriter_migration_backup`)
4. **데이터 이전**: Google 계정 키로 데이터 이전
5. **검증 완료**: 이전 성공 확인 후 기존 데이터 삭제

### 상세 가이드
마이그레이션에 대한 자세한 내용은 [데이터 마이그레이션 가이드](docs/migration-guide.md)를 참조하세요:
- 마이그레이션 프로세스 상세 설명
- 실패 시 복구 방법
- 수동 백업 및 복원
- 여러 기기에서 마이그레이션
- FAQ 및 문제 해결

## 🛠️ 개발자 도구

### OAuth 테스트 도구 (test-oauth.html)
- Google OAuth 설정 상태 확인
- 로그인/로그아웃 테스트
- 토큰 갱신 및 검증 테스트
- 마이그레이션 상태 확인
- 실시간 로그 모니터링

### 디버깅 팁
```javascript
// 브라우저 콘솔에서 사용 가능한 디버깅 명령어
dualTextWriter.checkMigrationStatus();  // 마이그레이션 상태 확인
dualTextWriter.config.getSetupInstructions();  // 설정 가이드 출력
dualTextWriter.googleAuthManager.getCurrentUser();  // 현재 사용자 정보
```

## 🔧 문제 해결

### 일반적인 인증 오류

#### ❌ "redirect_uri_mismatch"
**원인**: Google Cloud Console에 등록된 리디렉션 URI와 실제 URI가 일치하지 않음

**해결 방법**:
1. Google Cloud Console > 사용자 인증 정보 > OAuth 2.0 클라이언트 ID 선택
2. "승인된 리디렉션 URI" 섹션 확인
3. 현재 사용 중인 URI 추가 (예: `http://localhost/callback`)
4. 저장 후 브라우저 새로고침

#### ❌ "unauthorized_client"
**원인**: OAuth 동의 화면이 제대로 구성되지 않았거나 클라이언트 ID가 잘못됨

**해결 방법**:
1. OAuth 동의 화면 설정 완료 확인
2. 클라이언트 ID가 올바르게 복사되었는지 확인
3. 클라이언트 ID 형식 확인 (`.googleusercontent.com`으로 끝나야 함)
4. config/auth-config.js 파일의 플레이스홀더 값 교체 확인

#### ❌ "popup_closed_by_user"
**원인**: 사용자가 Google 로그인 팝업을 닫음

**해결 방법**:
- 이것은 오류가 아닙니다
- 사용자가 로그인을 취소한 것이므로 재시도 안내
- 기존 사용자명 로그인 방식 사용 가능

#### ❌ "popup_blocked_by_browser"
**원인**: 브라우저가 팝업을 차단함

**해결 방법**:
1. 브라우저 주소창의 팝업 차단 아이콘 클릭
2. 이 사이트의 팝업 허용
3. 페이지 새로고침 후 재시도

#### ❌ Google OAuth 초기화 실패
**원인**: 설정 오류 또는 네트워크 문제

**해결 방법**:
1. 브라우저 콘솔(F12) 열어 상세 오류 확인
2. config/auth-config.js의 클라이언트 ID 확인
3. 네트워크 연결 확인
4. test-oauth.html로 설정 상태 확인

#### ❌ "idpiframe_initialization_failed"
**원인**: 쿠키 차단 또는 서드파티 쿠키 비활성화

**해결 방법**:
1. 브라우저 설정 > 개인정보 및 보안
2. 쿠키 및 사이트 데이터 설정 확인
3. Google 도메인의 쿠키 허용
4. 시크릿 모드에서는 작동하지 않을 수 있음

### 설정 관련 문제

#### ⚠️ "YOUR_CLIENT_ID" 플레이스홀더 오류
**증상**: Google 로그인 버튼이 비활성화되고 설정 안내 표시

**해결 방법**:
1. config/auth-config.js 파일 열기
2. `YOUR_DEVELOPMENT_CLIENT_ID` 또는 `YOUR_PRODUCTION_CLIENT_ID` 검색
3. 실제 Google Client ID로 교체
4. 파일 저장 후 브라우저 새로고침

#### ⚠️ HTTPS 필수 오류 (프로덕션)
**증상**: 프로덕션 환경에서 "HTTPS가 필수입니다" 오류

**해결 방법**:
1. SSL 인증서 설치 (Let's Encrypt 무료 인증서 권장)
2. HTTPS로 사이트 접속
3. 또는 개발 환경(localhost)에서 테스트

### 데이터 마이그레이션 문제

#### 🔄 마이그레이션 실패
**증상**: 기존 데이터가 Google 계정으로 이전되지 않음

**해결 방법**:
1. 브라우저 콘솔에서 마이그레이션 로그 확인
2. 로컬 스토리지 용량 확인 (F12 > Application > Local Storage)
3. 백업 데이터 확인: `dualTextWriter_migration_backup` 키
4. 필요시 수동 복구 또는 개발자 도구 사용

#### 🔄 마이그레이션 후 데이터 손실
**증상**: 마이그레이션 후 일부 데이터가 보이지 않음

**해결 방법**:
1. 로그아웃 후 재로그인
2. 브라우저 캐시 삭제 후 재시도
3. 백업 데이터 확인 및 복구
4. 활동 로그 확인: `dualTextWriter_activityLogs`

### 개발 환경 설정

#### 로컬 테스트 환경
```
지원되는 로컬 도메인:
- http://localhost
- http://localhost:3000
- http://localhost:8080
- http://localhost:5500 (Live Server)
- http://127.0.0.1
- http://127.0.0.1:3000
```

#### 프로덕션 환경 요구사항
```
필수 사항:
- HTTPS 프로토콜 (필수)
- 유효한 SSL 인증서
- Google Cloud Console에 도메인 등록
- 올바른 리디렉션 URI 설정
```

### 디버깅 도구

#### 브라우저 콘솔 명령어
```javascript
// 현재 설정 상태 확인
dualTextWriter.config.getSetupInstructions();

// 현재 사용자 정보
dualTextWriter.googleAuthManager.getCurrentUser();

// 마이그레이션 상태 확인
dualTextWriter.checkMigrationStatus();

// 토큰 정보 확인
dualTextWriter.googleAuthManager.tokenData;

// 활동 로그 확인
JSON.parse(localStorage.getItem('dualTextWriter_activityLogs'));
```

#### 테스트 도구 사용
1. `test-oauth.html` 파일 열기
2. 각 테스트 버튼 순서대로 실행:
   - 설정 확인
   - Google 로그인 테스트
   - 토큰 갱신 테스트
   - 마이그레이션 상태 확인
3. 로그 패널에서 상세 정보 확인

### 로컬 개발 환경 설정

#### Live Server 사용 (VS Code)
1. VS Code에서 Live Server 확장 설치
2. `index.html` 우클릭 > "Open with Live Server"
3. 자동으로 `http://localhost:5500` 또는 다른 포트에서 실행
4. Google Cloud Console에 해당 포트 추가

#### Python 간단한 서버
```bash
# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

#### Node.js http-server
```bash
# 설치
npm install -g http-server

# 실행
http-server -p 8080
```

#### 포트 변경 시 주의사항
- Google Cloud Console에 새 포트 추가 필요
- 예: `http://localhost:8080`
- 리디렉션 URI도 업데이트: `http://localhost:8080/callback`

### 추가 지원

문제가 계속되면:
1. 브라우저 콘솔(F12)의 오류 메시지 확인
2. `docs/google-cloud-setup-guide.md` 상세 가이드 참조
3. `docs/migration-guide.md` 마이그레이션 가이드 참조
4. GitHub Issues에 문제 보고 (오류 메시지 포함)
5. 로컬 스토리지 데이터 백업 후 초기화 시도