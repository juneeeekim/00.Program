# 🚀 Step 3: 웹사이트 배포 실행

---

**버전**: v2.0.0  
**최종 수정**: 2025-11-22  
**문서 순서**: **Step 3 of 3 - Firebase Hosting 배포 (최종 단계)**  
**소요 시간**: 약 20-30분

> 📌 **이전 단계**: [Step 2 - Firestore 설정](02_FIRESTORE_CONFIG.md)  
> 📌 **완료 후**: 배포된 웹사이트 URL로 접속 가능

---

## 📋 이 단계에서 할 일

Step 1, 2에서 설정한 Firebase 프로젝트에 웹사이트를 배포합니다:

1. ✅ Firebase CLI 설치 및 로그인
2. ✅ 로컬 개발 환경 설정
3. ✅ Firebase 프로젝트 초기화
4. ✅ 로컬 테스트 (선택사항)
5. ✅ Firebase Hosting 배포
6. ✅ 배포 확인 및 기능 테스트

**완료 후**: 웹사이트가 `https://YOUR_PROJECT_ID.web.app` 주소로 배포됩니다!

---

## 🛠️ 1. 사전 준비: 필수 도구 설치

### 1.1 Node.js 설치 확인

```bash
# 터미널에서 Node.js 버전 확인
node --version

# 예상 출력: v14.x.x 이상
```

**설치 필요 시**:

1. [https://nodejs.org](https://nodejs.org) 접속
2. LTS 버전 다운로드
3. 설치 후 터미널 재시작
4. 다시 `node --version`으로 확인

### 1.2 Firebase CLI 설치

```bash
# Firebase CLI 전역 설치
npm install -g firebase-tools

# 설치 확인
firebase --version

# 예상 출력: 13.x.x 이상
```

**권한 오류 발생 시**:

```bash
# macOS/Linux: sudo 사용
sudo npm install -g firebase-tools
```

---

## 🔐 2. Firebase 로그인

### 2.1 Firebase CLI 로그인

```bash
# Firebase 계정으로 로그인
firebase login

# 브라우저가 자동으로 열림
# → Google 계정 선택
# → Firebase CLI 권한 허용

# 성공 메시지:
# ✔ Success! Logged in as your-email@gmail.com
```

**브라우저가 열리지 않는 경우**:

```bash
firebase login --no-localhost
# 출력되는 URL을 복사하여 브라우저에 입력
# 인증 코드를 복사하여 터미널에 붙여넣기
```

### 2.2 로그인 확인

```bash
# 연결된 프로젝트 목록 확인
firebase projects:list

# Step 1에서 생성한 프로젝트가 보여야 함
# 예시:
# ┌──────────────────────┬─────────────────────┬─────────────────┐
# │ Project Display Name │ Project ID          │ Resource Location ID │
# ├──────────────────────┼─────────────────────┼─────────────────┤
# │ 500text-threads      │ 500text-threads-xxx │ asia-northeast3 │
# └──────────────────────┴─────────────────────┴─────────────────┘
```

---

## 📁 3. 프로젝트 디렉토리 설정

### 3.1 프로젝트 폴더로 이동

```bash
cd /Users/gimhyeonjun/Desktop/00.Program/500text_threads

# 현재 위치 확인
pwd
# 출력: /Users/gimhyeonjun/Desktop/00.Program/500text_threads
```

### 3.2 프로젝트 파일 확인

```bash
# 필수 파일들이 있는지 확인
ls -la

# 다음 파일들이 있어야 함:
# ✓ index.html
# ✓ style.css
# ✓ script.js
# ✓ firebase-config.js (Step 1에서 생성)
# ✓ firestore.rules (Step 2에서 사용)
# ✓ firestore.indexes.json (Step 2에서 사용)
# ✓ js/ (디렉토리)
```

---

## ⚙️ 4. Firebase 프로젝트 초기화

### 4.1 Firebase 초기화 시작

```bash
# Firebase 초기화 명령 실행
firebase init

# 화면에 Firebase 로고와 함께 질문이 표시됨
```

### 4.2 초기화 질문에 답변

**질문 1: 어떤 Firebase 기능을 사용하시겠습니까?**

```
? Which Firebase features do you want to set up?

→ Firestore (스페이스 키로 선택)
→ Hosting (스페이스 키로 선택)
→ Enter 키로 확인
```

**질문 2: 프로젝트 선택**

```
? Please select an option:

→ Use an existing project (기존 프로젝트 사용)
→ Enter 키

? Select a default Firebase project:

→ 500text-threads-xxxxx (Step 1에서 생성한 프로젝트)
→ Enter 키
```

**질문 3: Firestore 규칙 파일**

```
? What file should be used for Firestore Rules?

→ firestore.rules (기본값)
→ Enter 키

? File firestore.rules already exists. Do you want to overwrite?

→ No (기존 파일 유지)
```

**질문 4: Firestore 인덱스 파일**

```
? What file should be used for Firestore indexes?

→ firestore.indexes.json (기본값)
→ Enter 키

? File firestore.indexes.json already exists. Do you want to overwrite?

→ No (기존 파일 유지)
```

**질문 5: Public 디렉토리**

```
? What do you want to use as your public directory?

→ . (현재 디렉토리)
→ Enter 키
```

**질문 6: Single-Page App 설정**

```
? Configure as a single-page app (rewrite all urls to /index.html)?

→ No
→ Enter 키
```

**질문 7: GitHub 자동 배포**

```
? Set up automatic builds and deploys with GitHub?

→ No
→ Enter 키
```

### 4.3 초기화 완료 확인

```
✔ Firebase initialization complete!

# 생성된 파일 확인:
# ✓ .firebaserc (프로젝트 설정)
# ✓ firebase.json (Hosting 설정)
```

---

## 📝 5. firebase.json 설정 최적화

생성된 `firebase.json` 파일을 열고 다음 내용으로 교체:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**",
      "**/*.md",
      "plan_*/**"
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

**주요 설정 설명**:

- `public: "."` - 현재 디렉토리를 웹사이트 루트로 사용
- `ignore` - Markdown 파일, 설정 파일 등 배포 제외
- `headers` - JS/CSS 파일 캐싱 최적화

---

## 🧪 6. 로컬 테스트 (선택사항하지만 권장)

### 6.1 로컬 서버 실행

```bash
# Firebase 로컬 서버 시작
firebase serve

# 성공 메시지:
# ✔ hosting: Local server: http://localhost:5000
```

### 6.2 브라우저에서 테스트

1. **웹 브라우저 열기**

   ```
   http://localhost:5000
   ```

2. **기능 테스트**

   - ✅ 페이지 로딩 확인
   - ✅ 로그인 버튼 표시 확인
   - ✅ 탭 전환 동작 확인
   - ✅ 브라우저 콘솔에 에러 없는지 확인 (F12)

3. **서버 중지**
   ```bash
   # 터미널에서 Ctrl + C
   ```

---

## 🚀 7. Firebase Hosting 배포

### 7.1 배포 실행

```bash
# 전체 배포 (Hosting + Firestore 규칙 + 인덱스)
firebase deploy

# 또는 Hosting만 배포
firebase deploy --only hosting
```

### 7.2 배포 프로세스 모니터링

```
=== Deploying to 'YOUR_PROJECT_ID'...

i  deploying firestore, hosting
i  firestore: reading indexes from firestore.indexes.json...
i  firestore: reading rules from firestore.rules...
✔  firestore: rules file firestore.rules compiled successfully
i  hosting[YOUR_PROJECT_ID]: beginning deploy...
i  hosting[YOUR_PROJECT_ID]: found 20 files in .
✔  hosting[YOUR_PROJECT_ID]: file upload complete
i  hosting[YOUR_PROJECT_ID]: finalizing version...
✔  hosting[YOUR_PROJECT_ID]: version finalized
i  hosting[YOUR_PROJECT_ID]: releasing new version...
✔  hosting[YOUR_PROJECT_ID]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/YOUR_PROJECT_ID/overview
Hosting URL: https://YOUR_PROJECT_ID.web.app
```

### 7.3 배포 URL 확인

터미널에 표시된 **Hosting URL**을 복사하세요:

```
https://YOUR_PROJECT_ID.web.app
```

---

## ✅ 8. 배포 확인 및 테스트

### 8.1 웹사이트 접속

1. **배포 URL 열기**

   - 브라우저에서 `https://YOUR_PROJECT_ID.web.app` 접속

2. **페이지 로딩 확인**
   - ✅ 헤더: "📝 500자 미만 글 작성기"
   - ✅ 로그인 폼 표시

### 8.2 기능 테스트

#### 1) 로그인 테스트

```
Google 로그인 버튼 클릭
→ Google 계정 선택
→ "환영합니다!" 메시지 확인
→ 사용자명 표시 확인
```

#### 2) 레퍼런스 글 작성 및 저장

```
"글 작성" 탭 선택
→ 왼쪽 "레퍼런스 글" 영역
→ 레퍼런스 유형 선택 (구조/아이디어)
→ 텍스트 입력
→ "저장" 버튼 클릭
→ 성공 메시지 확인
```

#### 3) 저장된 글 확인

```
"저장된 글" 탭 선택
→ 방금 저장한 글 표시 확인
→ 필터링 기능 테스트 (전체/작성글/레퍼런스)
```

### 8.3 브라우저 개발자 도구 확인

```
F12 (또는 Cmd+Option+I) → Console 탭

✅ 정상: "DualTextWriter initialized (Module Mode)"
❌ 오류 없어야 함:
   - "Module not found" 오류 없음
   - "Firebase: Error" 없음
   - "Missing permissions" 없음
```

### 8.4 Firebase Console에서 데이터 확인

1. **Firestore Database 열기**

   ```
   https://console.firebase.google.com
   → 프로젝트 선택
   → Firestore Database
   → "데이터" 탭
   ```

2. **저장된 데이터 확인**
   ```
   users/
     └── {userId}/
         └── texts/
             └── {textId}
                 ├── content: "테스트 내용"
                 ├── type: "reference"
                 ├── createdAt: ...
                 └── ...
   ```

---

## 🔄 9. 업데이트 배포

코드를 수정한 후 재배포하는 방법:

### 9.1 파일 수정

```bash
# 예: style.css 수정
nano style.css
# 또는 원하는 텍스트 에디터 사용
```

### 9.2 재배포

```bash
# 변경사항 배포
firebase deploy --only hosting

# 성공 메시지:
# ✔ Deploy complete!
```

### 9.3 캐시 제거 후 확인

```
브라우저에서 Cmd+Shift+R (강제 새로고침)
→ 변경사항 반영 확인
```

---

## 🆘 10. 문제 해결

### 문제 1: "Module not found" 오류

**증상**: 브라우저 콘솔에 `Failed to load module script`

**해결방법**:

```bash
# 1. index.html 확인
# <script type="module" src="script.js"></script> 확인

# 2. 파일 경로 확인
ls -la script.js js/

# 3. 재배포
firebase deploy --only hosting
```

### 문제 2: Firebase 연결 실패

**증상**: "Firebase: Error (auth/...)"

**해결방법**:

```bash
# 1. firebase-config.js 설정 재확인
cat firebase-config.js

# 2. Firebase Console에서 웹 앱 설정 다시 복사
# 프로젝트 개요 → 프로젝트 설정 → 내 앱

# 3. 재배포
firebase deploy --only hosting
```

### 문제 3: "Missing permissions" 오류

**증상**: Firestore 읽기/쓰기 권한 오류

**해결방법**:

```bash
# 1. 보안 규칙 재배포
firebase deploy --only firestore:rules

# 2. Firebase Console에서 규칙 확인
# Firestore Database → 규칙 탭

# 3. 로그인 상태 확인 (로그아웃 후 재로그인)
```

### 문제 4: 배포가 너무 오래 걸림

**해결방법**:

```bash
# 1. 불필요한 파일 제외 (firebase.json에 추가)
{
  "hosting": {
    "ignore": [
      "node_modules/**",
      "**/*.md",
      ".git/**"
    ]
  }
}

# 2. 재배포
firebase deploy --only hosting
```

---

## 🎉 11. 배포 완료!

### 성공 확인

- ✅ **URL 접속**: `https://YOUR_PROJECT_ID.web.app` 정상 로딩
- ✅ **로그인**: Google/익명 로그인 작동
- ✅ **데이터 저장**: Firestore에 데이터 저장 확인
- ✅ **브라우저 콘솔**: 오류 없음

### 다음 단계 (선택사항)

1. **커스텀 도메인 연결**

   ```
   Firebase Console → Hosting → 도메인 추가
   ```

2. **성능 모니터링**

   ```
   Firebase Console → Performance
   ```

3. **Analytics 활성화**
   ```
   Firebase Console → Analytics
   ```

---

## 📋 최종 체크리스트

전체 배포 프로세스 완료 확인:

**Step 1: Firebase 프로젝트 설정**

- [x] Firebase 프로젝트 생성
- [x] Authentication 활성화
- [x] Firestore Database 생성
- [x] firebase-config.js 설정

**Step 2: Firestore 설정**

- [x] 보안 규칙 배포
- [x] 인덱스 생성 (6개)

**Step 3: 배포 실행** (현재)

- [x] Firebase CLI 설치
- [x] Firebase 로그인
- [x] 프로젝트 초기화
- [x] 로컬 테스트 (선택사항)
- [x] Firebase Hosting 배포
- [x] 배포 URL 접속 및 기능 테스트

---

## 🎓 추가 학습 자료

- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Firebase CLI 참조](https://firebase.google.com/docs/cli)
- [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Hosting 가이드](https://firebase.google.com/docs/hosting)

---

## 🎯 축하합니다!

**500자 미만 글 작성기 웹사이트가 성공적으로 배포되었습니다!** 🎉

웹사이트 URL: `https://YOUR_PROJECT_ID.web.app`

> 💡 **팁**: 이 URL을 북마크에 추가하고 모바일에서도 테스트해보세요!

---

**문서 정보**

- **버전**: v2.0.0
- **최종 수정**: 2025-11-22
- **문서 타입**: Step 3 - Firebase Hosting 배포 (최종 단계)
- **관련 문서**:
  - [Step 0 - 프로젝트 개요](README.md)
  - [Step 1 - Firebase 설정](01_FIREBASE_SETUP.md)
  - [Step 2 - Firestore 설정](02_FIRESTORE_CONFIG.md)
- **배포 후 관리**: [Firebase Console](https://console.firebase.google.com)
