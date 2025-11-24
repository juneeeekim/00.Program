# 🎨 Step 4: 프론트엔드 개발 가이드

---

**버전**: v2.0.0  
**최종 수정**: 2025-11-22  
**문서 순서**: **Step 4 - Frontend Development (프론트엔드 전용)**  
**대상**: 프론트엔드 개발자, UI/UX 디자이너

> 📌 **이전 단계**: [Step 3 - 배포 실행](03_DEPLOYMENT.md) (배포 완료 후)  
> 📌 **다음 단계**: [Step 5 - 백엔드 개발 가이드](05_BACKEND.md)  
> 📌 **선행 조건**: Step 1-3 완료 (배포된 웹사이트 존재)

---

## 📋 이 문서의 목적

배포된 웹사이트의 **프론트엔드 영역**을 수정, 개선, 커스터마이징하는 방법을 안내합니다.

**다루는 내용**:

- ✅ HTML/CSS 구조 이해 및 수정
- ✅ JavaScript 모듈 구조 파악
- ✅ UI 컴포넌트 커스터마이징
- ✅ 스타일 및 테마 변경
- ✅ 반응형 디자인 수정
- ✅ 클라이언트 로직 추가/수정

**다루지 않는 내용** (→ Step 5 참고):

- ❌ Firestore 데이터 구조 변경
- ❌ 보안 규칙 수정
- ❌ 백엔드 로직

---

## 🏗️ 1. 프론트엔드 아키텍처 이해

### 1.1 파일 구조

```
500text_threads/
├── index.html              # 메인 HTML (UI 구조)
├── style.css               # 전역 스타일시트
├── script.js               # 메인 애플리케이션 로직
├── firebase-config.js      # Firebase 설정 (백엔드 연결)
└── js/                     # 모듈화된 JavaScript
    ├── utils.js            # 유틸리티 함수
    ├── auth.js             # 인증 관리 (AuthManager)
    ├── constants.js        # 상수 정의
    ├── data.js             # 데이터 관리 (DataManager)
    └── ui.js               # UI 관리 (UIManager)
```

### 1.2 프론트엔드 책임 영역

| 파일              | 역할                   | 수정 빈도 |
| ----------------- | ---------------------- | --------- |
| `index.html`      | DOM 구조, 마크업       | 중간      |
| `style.css`       | 스타일, 레이아웃, 테마 | 높음      |
| `script.js`       | 메인 로직, 이벤트 처리 | 중간      |
| `js/ui.js`        | UI 업데이트, DOM 조작  | 높음      |
| `js/utils.js`     | 헬퍼 함수              | 낮음      |
| `js/auth.js`      | 인증 UI 처리           | 낮음      |
| `js/constants.js` | UI 상수                | 낮음      |

---

## 🎨 2. 스타일 커스터마이징 (CSS)

### 2.1 색상 테마 변경

**파일**: `style.css`

#### 현재 메인 색상

```css
/* 현재 그라데이션 배경 */
body {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 현재 액센트 색상 */
.tab-button.active {
  color: #667eea;
  border-bottom: 3px solid #667eea;
}
```

#### 커스터마이징 예시: 블루 테마

```css
/* 새로운 그라데이션 배경 */
body {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

/* 새로운 액센트 색상 */
.tab-button.active {
  color: #4facfe;
  border-bottom: 3px solid #4facfe;
}

.character-counter #current-count {
  color: #4facfe;
}
```

### 2.2 다크 모드 추가

`style.css` 하단에 추가:

```css
/* 다크 모드 */
@media (prefers-color-scheme: dark) {
  body {
    background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  }

  .container {
    color: #e2e8f0;
  }

  .tab-content,
  .writing-panel {
    background: #2d3748;
    color: #e2e8f0;
  }

  textarea {
    background: #1a202c;
    color: #e2e8f0;
    border-color: #4a5568;
  }

  .btn {
    background: #4a5568;
    color: #e2e8f0;
  }
}
```

### 2.3 폰트 변경

```css
/* Google Fonts 추가 (index.html <head>에) */
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap" rel="stylesheet">

/* CSS에서 적용 */
body {
  font-family: "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif;
}
```

### 2.4 반응형 브레이크포인트 수정

```css
/* 현재 태블릿 브레이크포인트: 768px */
@media (max-width: 768px) {
  .writing-container {
    grid-template-columns: 1fr; /* 세로 배치 */
  }
}

/* 더 큰 태블릿을 위한 브레이크포인트: 1024px */
@media (max-width: 1024px) {
  .writing-container {
    grid-template-columns: 1fr;
  }
}
```

---

## 📝 3. HTML 구조 수정

### 3.1 탭 추가하기

**파일**: `index.html`

#### 기존 탭 구조

```html
<div class="tab-container">
  <button class="tab-button active" data-tab="writing">✏️ 글 작성</button>
  <button class="tab-button" data-tab="saved">💾 저장된 글</button>
  <button class="tab-button" data-tab="tracking">📊 트래킹</button>
  <button class="tab-button" data-tab="management">📋 스크립트 작성</button>
</div>
```

#### 새 탭 추가 예시

```html
<div class="tab-container">
  <button class="tab-button active" data-tab="writing">✏️ 글 작성</button>
  <button class="tab-button" data-tab="saved">💾 저장된 글</button>
  <button class="tab-button" data-tab="tracking">📊 트래킹</button>
  <button class="tab-button" data-tab="management">📋 스크립트 작성</button>
  <!-- 새 탭 추가 -->
  <button class="tab-button" data-tab="analytics">📈 분석</button>
</div>

<!-- 탭 컨텐츠 추가 -->
<div class="tab-content" id="analytics-tab">
  <h2>📈 분석 대시보드</h2>
  <p>여기에 분석 내용을 추가하세요.</p>
</div>
```

### 3.2 폼 필드 추가

**레퍼런스 글에 "출처 URL" 필드 추가 예시**:

```html
<!-- 기존 topic-input-group 다음에 추가 -->
<div class="source-url-group">
  <label for="ref-source-url" class="url-label">출처 URL (선택사항)</label>
  <input
    type="url"
    id="ref-source-url"
    class="url-input"
    placeholder="https://example.com"
    aria-label="출처 URL 입력"
  />
</div>
```

---

## ⚙️ 4. JavaScript 로직 수정

### 4.1 모듈 구조 이해

#### ES Module 시스템

```javascript
// script.js에서 모듈 import
import { extractTitleFromContent, escapeHtml } from "./js/utils.js";
import { AuthManager } from "./js/auth.js";
import { Constants } from "./js/constants.js";
import { DataManager } from "./js/data.js";
import { UIManager } from "./js/ui.js";
```

### 4.2 새로운 유틸리티 함수 추가

**파일**: `js/utils.js`

```javascript
/**
 * 새로운 함수 추가 예시: URL 유효성 검사
 * @param {string} url - 검사할 URL
 * @returns {boolean} - 유효한 URL이면 true
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 텍스트를 클립보드에 복사
 * @param {string} text - 복사할 텍스트
 * @returns {Promise<boolean>} - 성공 여부
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("클립보드 복사 실패:", err);
    return false;
  }
}
```

**사용 예시** (`script.js`에서):

```javascript
import { isValidUrl, copyToClipboard } from "./js/utils.js";

// URL 검증
const url = document.getElementById("ref-source-url").value;
if (url && !isValidUrl(url)) {
  alert("유효하지 않은 URL입니다");
  return;
}

// 클립보드 복사
await copyToClipboard("복사할 내용");
```

### 4.3 UI 컴포넌트 추가

**파일**: `js/ui.js`

```javascript
/**
 * 로딩 스피너 표시
 * @param {boolean} show - 표시 여부
 */
showLoadingSpinner(show) {
    let spinner = document.getElementById('loading-spinner');

    if (show && !spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loading-spinner';
        spinner.className = 'spinner';
        spinner.innerHTML = '<div class="spinner-icon">⏳</div>';
        document.body.appendChild(spinner);
    } else if (!show && spinner) {
        spinner.remove();
    }
}

/**
 * 확인 대화상자 표시
 * @param {string} message - 메시지
 * @returns {Promise<boolean>} - 사용자 응답
 */
async showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn-cancel">취소</button>
                    <button class="btn-confirm">확인</button>
                </div>
            </div>
        `;

        modal.querySelector('.btn-cancel').onclick = () => {
            modal.remove();
            resolve(false);
        };

        modal.querySelector('.btn-confirm').onclick = () => {
            modal.remove();
            resolve(true);
        };

        document.body.appendChild(modal);
    });
}
```

### 4.4 이벤트 리스너 추가

**파일**: `script.js`

```javascript
// 생성자 또는 init() 메서드에서
init() {
    // 기존 초기화...

    // 새로운 이벤트 리스너 추가
    this.setupCustomEventListeners();
}

setupCustomEventListeners() {
    // 복사 버튼 이벤트
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => this.handleCopyClick());
    }

    // 키보드 단축키 (Ctrl+S: 저장)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveText('edit');
        }
    });
}

async handleCopyClick() {
    const text = this.editTextInput.value;
    const success = await copyToClipboard(text);

    if (success) {
        this.uiManager.showMessage('복사되었습니다!', 'success');
    } else {
        this.uiManager.showMessage('복사 실패', 'error');
    }
}
```

---

## 🔧 5. 자주 하는 커스터마이징

### 5.1 최대 글자 수 변경

**파일**: `js/constants.js`

```javascript
// 기존
export const Constants = {
  UI: {
    MAX_CHAR_500: 500,
    MAX_CHAR_1000: 1000,
    // ...
  },
};

// 2000자로 확장
export const Constants = {
  UI: {
    MAX_CHAR_500: 500,
    MAX_CHAR_1000: 1000,
    MAX_CHAR_2000: 2000, // 추가
    // ...
  },
};
```

**index.html에 토글 버튼 추가**:

```html
<div class="segmented-control" id="char-limit-toggle">
  <button class="segment-btn" data-limit="500">500자</button>
  <button class="segment-btn" data-limit="1000">1,000자</button>
  <button class="segment-btn" data-limit="2000">2,000자</button>
</div>
```

### 5.2 SNS 플랫폼 추가

**파일**: `script.js`

```javascript
// 기존 SNS_PLATFORMS 배열에 추가
static SNS_PLATFORMS = [
    { id: 'threads', name: 'Threads', icon: '🧵' },
    { id: 'instagram', name: 'Instagram', icon: '📷' },
    // ... 기존 플랫폼들
    { id: 'pinterest', name: 'Pinterest', icon: '📌' },  // 새로 추가
    { id: 'reddit', name: 'Reddit', icon: '🔴' },        // 새로 추가
];
```

### 5.3 자동 저장 기능 추가

**파일**: `script.js`

```javascript
// 생성자에서
constructor() {
    // ... 기존 코드

    // 자동 저장 설정 (5분마다)
    this.autoSaveInterval = setInterval(() => {
        this.autoSave();
    }, 5 * 60 * 1000); // 5분
}

async autoSave() {
    const refText = this.refTextInput?.value || '';
    const editText = this.editTextInput?.value || '';

    if (refText.length > 50 || editText.length > 50) {
        console.log('자동 저장 중...');
        // localStorage에 임시 저장
        localStorage.setItem('autosave_ref', refText);
        localStorage.setItem('autosave_edit', editText);
        localStorage.setItem('autosave_time', new Date().toISOString());
    }
}
```

---

## 🎯 6. 배포 (프론트엔드 변경사항)

### 6.1 로컬 테스트

```bash
# 로컬 서버 실행
firebase serve

# 브라우저에서 테스트
# http://localhost:5000
```

### 6.2 프론트엔드만 재배포

```bash
# CSS/HTML/JS 변경 후
firebase deploy --only hosting

# 성공 메시지:
# ✔ Deploy complete!
```

### 6.3 캐시 무효화

```bash
# 강제 새로고침
# 브라우저: Cmd+Shift+R (macOS) 또는 Ctrl+Shift+R (Windows)
```

---

## 📋 프론트엔드 체크리스트

수정 전 확인사항:

- [ ] 로컬에서 테스트 완료
- [ ] 모든 브라우저에서 동작 확인 (Chrome, Safari, Firefox)
- [ ] 모바일 반응형 확인
- [ ] 브라우저 콘솔에 오류 없음
- [ ] 접근성 검증 (ARIA 라벨, 키보드 네비게이션)
- [ ] git commit (버전 관리)
- [ ] 배포 후 실제 URL에서 재확인

---

## 🆘 문제 해결

### Q1: CSS 변경사항이 반영되지 않아요

**A**:

```bash
# 1. 브라우저 캐시 삭제 (Cmd+Shift+R)
# 2. firebase.json의 캐시 헤더 확인
# 3. style.css 파일명에 버전 추가
# <link rel="stylesheet" href="style.css?v=2">
```

### Q2: JavaScript 모듈 오류가 발생해요

**A**:

```javascript
// index.html에서 type="module" 확인
<script type="module" src="script.js"></script>;

// import 경로 확인 (상대 경로)
import { Utils } from "./js/utils.js"; // ✅ 올바름
import { Utils } from "js/utils.js"; // ❌ 틀림
```

### Q3: 반응형이 모바일에서 깨져요

**A**:

```html
<!-- index.html <head>에 viewport 메타태그 확인 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- CSS에서 모바일 우선 설계 -->
@media (max-width: 768px) { /* 모바일용 스타일 */ }
```

---

## 🎓 추가 학습 자료

- [MDN Web Docs - JavaScript](https://developer.mozilla.org/ko/docs/Web/JavaScript)
- [CSS Grid 가이드](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [ES6 Modules](https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide/Modules)
- [웹 접근성 가이드](https://www.w3.org/WAI/fundamentals/accessibility-intro/ko)

---

## 🎯 다음 단계

> **프론트엔드 커스터마이징이 완료되었나요?**
>
> 백엔드 데이터 구조나 보안 규칙을 수정하고 싶다면:
>
> 👉 **[Step 5: 백엔드 개발 가이드](05_BACKEND.md)** 로 이동하세요.

---

**문서 정보**

- **버전**: v2.0.0
- **최종 수정**: 2025-11-22
- **문서 타입**: Step 4 - Frontend Development Guide
- **대상**: 프론트엔드 개발자, UI/UX 디자이너
- **관련 파일**: `index.html`, `style.css`, `script.js`, `js/ui.js`, `js/utils.js`
- **다음 단계**: [Step 5 - 백엔드 개발 가이드](05_BACKEND.md)
