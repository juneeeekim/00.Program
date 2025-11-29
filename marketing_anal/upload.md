# GitHub 업로드 가이드

**작성일**: 2025-11-29  
**프로젝트**: Marketing Analytics Web Service MVP  
**Phase**: Phase 5 Step 2 완료 후 업로드

---

## 📋 업로드 개요

Phase 5 Step 2 구현이 완료되었습니다. 이 문서는 GitHub에 프로젝트를 업로드하는 방법을 안내합니다.

---

## 📁 업로드할 폴더 및 파일 구조

```
marketing_anal/
├── frontend/                          ⬅️ 전체 폴더 업로드
│   ├── app/
│   │   ├── globals.css               ✏️ 수정됨
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── error.tsx
│   │   ├── page.module.css
│   │   └── dashboard/
│   │       ├── page.tsx
│   │       ├── layout.tsx
│   │       ├── error.tsx
│   │       └── [projectId]/
│   │           └── page.tsx
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── FunnelTable.tsx       ✏️ 수정됨
│   │   │   ├── KPICard.tsx
│   │   │   └── TrendChart.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   └── ui/
│   │       └── LoadingSkeleton.tsx   🆕 신규 파일
│   │
│   ├── lib/
│   │   └── firebase.ts
│   │
│   ├── public/
│   │   └── (이미지 파일들)
│   │
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   ├── README.md
│   ├── SETUP.md
│   └── .gitignore
│
├── etl/                              ⬅️ 전체 폴더 업로드
│   ├── src/
│   │   ├── main.py
│   │   ├── transformers.py
│   │   └── __init__.py
│   ├── data/
│   │   └── input/
│   │       └── (CSV 샘플 파일들)
│   └── requirements.txt
│
├── plan_report/                      ⬅️ 전체 폴더 업로드
│   ├── 2511290925_project_roadmap_v0.1.md
│   ├── 2511291000_phase1_skeleton_checklist.md
│   ├── 2511291600_phase3_flesh_checklist.md
│   ├── 2511291700_phase5_clothes_checklist.md  ✏️ 수정됨
│   └── (기타 계획 문서들)
│
├── .gitignore                        ⬅️ 필수! (아래 내용 참고)
└── README.md                         ⬅️ 프로젝트 설명 (선택)
```

---

## 🚫 업로드하면 **안 되는** 파일/폴더

> ⚠️ **중요**: 아래 파일들은 보안상 또는 불필요하므로 절대 업로드하지 마세요!

### 보안 관련 (절대 업로드 금지!)

```
❌ frontend/.env.local              # Firebase API 키 포함
❌ frontend/env.local.required      # 환경변수 템플릿 (선택)
❌ etl/.env                         # Firebase Admin SDK 키 포함
```

### 자동 생성 파일 (업로드 불필요)

```
❌ frontend/node_modules/           # npm install로 재생성 가능
❌ frontend/.next/                  # 빌드 결과물
❌ frontend/out/                    # Export 결과물
❌ frontend/tsconfig.tsbuildinfo    # TypeScript 캐시
❌ etl/venv/                        # Python 가상환경
❌ etl/__pycache__/                 # Python 캐시
❌ etl/**/*.pyc                     # Python 컴파일 파일
```

### 시스템 파일

```
❌ .DS_Store                        # Mac 시스템 파일
❌ Thumbs.db                        # Windows 썸네일
❌ desktop.ini                      # Windows 설정
```

---

## 📝 .gitignore 파일 생성 (필수!)

GitHub에 업로드하기 전에 프로젝트 루트(`marketing_anal/`)에 `.gitignore` 파일을 생성하세요.

**파일 경로**: `c:\Users\chyon\Desktop\01.Project\00.Program\marketing_anal\.gitignore`

**파일 내용**:

```gitignore
# ==================================================
# Environment Variables (보안)
# ==================================================
.env
.env.local
.env*.local
*.env

# ==================================================
# Frontend - Next.js
# ==================================================
frontend/node_modules/
frontend/.next/
frontend/out/
frontend/.DS_Store
frontend/tsconfig.tsbuildinfo

# ==================================================
# ETL - Python
# ==================================================
etl/venv/
etl/__pycache__/
etl/**/*.pyc
etl/**/*.pyo
etl/**/*.pyd
etl/.env
etl/.Python

# ==================================================
# IDE & Editors
# ==================================================
.vscode/
.idea/
*.swp
*.swo
*~
.project
.classpath
.settings/

# ==================================================
# OS Files
# ==================================================
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
desktop.ini

# ==================================================
# Logs
# ==================================================
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

---

## 🎯 GitHub 웹 업로드 단계별 가이드

### Step 1: GitHub 저장소 생성

1. [GitHub.com](https://github.com) 접속 및 로그인
2. 우측 상단 `+` 버튼 → `New repository` 클릭
3. 저장소 설정:
   - **Repository name**: `marketing_anal` (또는 원하는 이름)
   - **Description**: `Marketing Analytics Web Service MVP`
   - **Visibility**: `Public` 또는 `Private` 선택
   - **Initialize**: 체크 안 함 (이미 파일이 있으므로)
4. `Create repository` 클릭

### Step 2: .gitignore 파일 생성

1. 메모장 또는 VS Code 열기
2. 위의 `.gitignore` 내용 복사
3. 다른 이름으로 저장:
   - 파일명: `.gitignore` (점 포함!)
   - 위치: `c:\Users\chyon\Desktop\01.Project\00.Program\marketing_anal\`
   - 파일 형식: `모든 파일 (*.*)`

### Step 3: 업로드할 파일 준비

1. 탐색기에서 `marketing_anal` 폴더 열기
2. 아래 폴더/파일들이 있는지 확인:
   - ✅ `frontend/` 폴더
   - ✅ `etl/` 폴더
   - ✅ `plan_report/` 폴더
   - ✅ `.gitignore` 파일
3. 아래 폴더/파일들은 **삭제하거나 제외**:
   - ❌ `frontend/node_modules/`
   - ❌ `frontend/.next/`
   - ❌ `frontend/.env.local`
   - ❌ `etl/venv/`
   - ❌ `etl/.env`

### Step 4: GitHub에 파일 업로드

1. 생성한 GitHub 저장소 페이지로 이동
2. `uploading an existing file` 링크 클릭 (또는 `Add file` → `Upload files`)
3. 파일 업로드:
   - **방법 1**: 폴더를 드래그 앤 드롭
   - **방법 2**: `choose your files` 클릭하여 선택
4. 업로드할 항목:
   ```
   frontend/ (전체 폴더)
   etl/ (전체 폴더)
   plan_report/ (전체 폴더)
   .gitignore
   README.md (있다면)
   ```

### Step 5: 커밋 메시지 작성

커밋 메시지 입력란에 다음과 같이 작성:

```
feat: Phase 5 Step 2 - Premium interactions & animations

✨ New Features:
- Add LoadingSkeleton component with pulse/shimmer animations
- Enhance FunnelTable with smooth row hover effects (200ms)
- Add button active states (scale 0.98) for click feedback
- Improve focus states for keyboard navigation

📝 Updates:
- Update globals.css with shimmer animation
- Update Phase 5 checklist (all items complete)

✅ Quality:
- Build: Success (0 errors)
- TypeScript: No errors
- Syntax: No errors
```

### Step 6: 업로드 완료

1. `Commit changes` 버튼 클릭
2. 업로드 완료 대기 (파일 크기에 따라 시간 소요)
3. 저장소 메인 페이지에서 파일 구조 확인

---

## ✅ 업로드 전 최종 체크리스트

업로드하기 전에 다음 항목들을 확인하세요:

- [ ] `.gitignore` 파일 생성 완료
- [ ] `.env`, `.env.local` 파일 제외 확인
- [ ] `node_modules` 폴더 제외 확인
- [ ] `.next` 폴더 제외 확인
- [ ] `venv` 폴더 제외 확인
- [ ] `__pycache__` 폴더 제외 확인
- [ ] `frontend/` 폴더 포함 확인
- [ ] `etl/` 폴더 포함 확인
- [ ] `plan_report/` 폴더 포함 확인
- [ ] 커밋 메시지 작성 완료

---

## 📊 이번 업로드에 포함된 주요 변경사항

### 신규 파일

- `frontend/components/ui/LoadingSkeleton.tsx` - 로딩 스켈레톤 컴포넌트

### 수정된 파일

- `frontend/app/globals.css` - Active/Focus states 추가
- `frontend/components/dashboard/FunnelTable.tsx` - Hover 효과 추가
- `plan_report/2511291700_phase5_clothes_checklist.md` - 체크리스트 업데이트

### 품질 검증

- ✅ Syntax 오류: 0개
- ✅ TypeScript 오류: 0개
- ✅ Build 상태: 성공

---

## 🔒 보안 주의사항

### 절대 업로드하면 안 되는 정보

1. **Firebase API Keys** (`.env.local`, `.env`)
2. **Firebase Admin SDK Keys** (etl/.env)
3. **개인 정보** (이메일, 비밀번호 등)
4. **액세스 토큰** (GitHub, API 토큰 등)

### 만약 실수로 업로드했다면?

1. 즉시 해당 파일 삭제
2. Firebase 콘솔에서 키 재발급
3. GitHub 저장소 히스토리에서 완전 삭제 (필요시)

---

## 📞 문제 해결

### Q1: `.gitignore` 파일이 보이지 않아요

**A**: Windows 탐색기 설정에서 "숨김 파일 표시" 활성화 필요

### Q2: 폴더가 너무 커서 업로드가 안 돼요

**A**: `node_modules`, `.next`, `venv` 폴더가 제외되었는지 확인

### Q3: GitHub에서 파일이 회색으로 표시돼요

**A**: `.gitignore`에 의해 무시된 파일입니다 (정상)

---

## 🎉 완료!

업로드가 완료되면:

1. GitHub 저장소 URL 확인
2. 팀원들과 공유
3. 로컬에서 계속 개발 진행

**저장소 URL 예시**: `https://github.com/your-username/marketing_anal`

---

**작성자**: 시니어 개발자  
**검토자**: 주니어 개발자, UX/UI 전문가  
**최종 업데이트**: 2025-11-29
