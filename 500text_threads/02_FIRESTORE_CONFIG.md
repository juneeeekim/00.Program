# 🗄️ Step 2: Firestore 보안 규칙 & 인덱스 설정

---

**버전**: v2.0.0  
**최종 수정**: 2025-11-22  
**문서 순서**: **Step 2 of 3 - Firestore Database 설정**  
**소요 시간**: 약 10-15분

> 📌 **이전 단계**: [Step 1 - Firebase 프로젝트 설정](01_FIREBASE_SETUP.md)  
> 📌 **다음 단계**: [Step 3 - 배포 실행](03_DEPLOYMENT.md)

---

## 📋 이 단계에서 할 일

Step 1에서 생성한 Firestore Database의 보안과 성능을 설정합니다:

1. ✅ Firestore 보안 규칙 배포
2. ✅ 복합 인덱스 생성으로 쿼리 최적화
3. ✅ 데이터 구조 검증

**완료 후**: 실제 웹사이트 배포를 위해 [Step 3](03_DEPLOYMENT.md)로 이동합니다.

---

## 🔒 1. Firestore 보안 규칙 이해하기

### 1.1 왜 보안 규칙이 필요한가?

Step 1에서 "테스트 모드"로 시작했습니다. 이는 **30일 후 만료**되며, 모든 사용자가 데이터를 읽고 쓸 수 있어 **보안에 취약**합니다.

프로덕션 보안 규칙은:

- ✅ 인증된 사용자만 자신의 데이터에 접근
- ✅ 데이터 형식 검증 (잘못된 데이터 저장 방지)
- ✅ createdAt 필드 변조 방지

### 1.2 보안 규칙 파일 확인

프로젝트에 `firestore.rules` 파일이 있는지 확인:

```bash
cd /Users/gimhyeonjun/Desktop/00.Program/500text_threads
ls -la firestore.rules
```

**파일 내용 미리보기**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자는 자신의 데이터만 접근 가능
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;

      match /texts/{textId} {
        // 데이터 검증: content, type, characterCount 등 필수 필드 확인
        allow create: if request.resource.data.content.size() > 0
                      && request.resource.data.content.size() <= 10000;
      }
    }
  }
}
```

---

## 🚀 2. Firestore 보안 규칙 배포

### 방법 A: Firebase Console에서 수동 배포 (초보자 권장)

#### 2.1 Firebase Console 접속

1. **Firestore Database 페이지 열기**

   ```
   https://console.firebase.google.com
   → 프로젝트 선택
   → Firestore Database
   ```

2. **"규칙" 탭 클릭**
   - 상단의 "데이터" / "규칙" / "인덱스" / "사용량" 탭 중 "규칙" 선택

#### 2.2 보안 규칙 복사 및 붙여넣기

1. **`firestore.rules` 파일 열기**

   - 텍스트 에디터로 `firestore.rules` 파일 열기
   - 전체 내용 복사 (Cmd+A → Cmd+C)

2. **Firebase Console 규칙 편집기에 붙여넣기**

   - 기존 내용 전체 삭제
   - 복사한 내용 붙여넣기 (Cmd+V)

3. **규칙 게시**

   - ✅ "게시" 버튼 클릭
   - 확인 대화상자에서 "게시" 다시 클릭

4. **성공 확인**
   ```
   ✅ 규칙이 게시되었습니다.
   ```

---

### 방법 B: Firebase CLI로 배포 (개발자 권장)

**선행 조건**: Node.js 및 Firebase CLI 설치 필요 (Step 3에서 자세히 설명)

```bash
# 1. Firebase 로그인
firebase login

# 2. 프로젝트 디렉토리로 이동
cd /Users/gimhyeonjun/Desktop/00.Program/500text_threads

# 3. 보안 규칙만 배포
firebase deploy --only firestore:rules

# 4. 성공 메시지 확인
# ✔ Deploy complete!
```

---

## 📊 3. Firestore 인덱스 설정

### 3.1 왜 인덱스가 필요한가?

Firestore는 단일 필드 쿼리는 자동으로 처리하지만, **복합 쿼리**(여러 필드 필터링 + 정렬)는 인덱스가 필요합니다.

**이 앱에서 사용하는 복합 쿼리 예시**:

```javascript
// type으로 필터링 + createdAt으로 정렬
texts.where("type", "==", "reference").orderBy("createdAt", "desc");

// platforms 배열 검색 + createdAt으로 정렬
texts
  .where("platforms", "array-contains", "threads")
  .orderBy("createdAt", "desc");
```

### 3.2 인덱스 파일 확인

`firestore.indexes.json` 파일 확인:

```bash
ls -la firestore.indexes.json
```

**파일 내용 예시**:

```json
{
  "indexes": [
    {
      "collectionGroup": "texts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

### 3.3 필수 인덱스 목록

이 앱은 **총 6개의 복합 인덱스**가 필요합니다:

| #   | Collection | 필드 조합                              | 용도              |
| --- | ---------- | -------------------------------------- | ----------------- |
| 1   | texts      | type(↑) + createdAt(↓)                 | 타입별 글 목록    |
| 2   | texts      | type(↑) + topic(↑) + createdAt(↓)      | 타입+주제 필터링  |
| 3   | texts      | platforms(array) + createdAt(↓)        | SNS 플랫폼별 검색 |
| 4   | texts      | linkedReferences(array) + createdAt(↓) | 참조 링크 역추적  |
| 5   | posts      | trackingEnabled(↑) + updatedAt(↓)      | 활성 트래킹 목록  |
| 6   | posts      | sourceTextId(↑) + createdAt(↓)         | 포스트별 메트릭   |

---

## 🚀 4. Firestore 인덱스 배포

### 방법 A: Firebase Console에서 수동 생성

#### 4.1 인덱스 탭 열기

1. **Firestore Database → "인덱스" 탭**

2. **"복합" 탭 선택**
   - "단일 필드" / "복합" / "면제" 중 "복합" 선택

#### 4.2 인덱스 생성 (예시: 인덱스 #1)

1. **"인덱스 만들기" 클릭**

2. **인덱스 설정**

   ```
   컬렉션 ID: texts

   필드 1:
   - 필드 경로: type
   - 순서: 오름차순

   필드 2:
   - 필드 경로: createdAt
   - 순서: 내림차순

   쿼리 범위: 컬렉션
   ```

3. **"만들기" 클릭**

4. **인덱스 생성 대기**
   - 상태: "빌드 중..." → "사용 설정됨" (1-2분 소요)

**⚠️ 중요**: 3.3의 **6개 인덱스 모두** 동일한 방법으로 생성해야 합니다.

---

### 방법 B: Firebase CLI로 자동 배포 (권장)

**선행 조건**: Firebase CLI 설치 필요

```bash
# 1. 프로젝트 디렉토리로 이동
cd /Users/gimhyeonjun/Desktop/00.Program/500text_threads

# 2. 인덱스만 배포
firebase deploy --only firestore:indexes

# 3. 성공 메시지 확인
# ✔ Deploy complete!
```

**장점**:

- ✅ 6개 인덱스를 한 번에 생성
- ✅ 실수 방지

#### 4.3 인덱스 생성 확인

Firebase Console → Firestore Database → 인덱스 탭:

```
✅ texts: type(↑), createdAt(↓)           [사용 설정됨]
✅ texts: type(↑), topic(↑), createdAt(↓)  [사용 설정됨]
✅ texts: platforms(array), createdAt(↓)   [사용 설정됨]
✅ texts: linkedReferences(array), createdAt(↓) [사용 설정됨]
✅ posts: trackingEnabled(↑), updatedAt(↓) [사용 설정됨]
✅ posts: sourceTextId(↑), createdAt(↓)    [사용 설정됨]
```

---

## 🧪 5. 설정 검증

### 5.1 보안 규칙 테스트

Firebase Console에서:

1. **Firestore Database → "규칙" 탭**

2. **"규칙 플레이그라운드" 클릭**

3. **시뮬레이션 실행**

   ```
   위치: /users/testUser123/texts/doc1
   읽기/쓰기: 읽기
   인증됨: 예
   Firebase UID: testUser123

   결과: ✅ 허용됨
   ```

4. **권한 없는 접근 테스트**

   ```
   위치: /users/otherUser456/texts/doc1
   읽기/쓰기: 읽기
   인증됨: 예
   Firebase UID: testUser123

   결과: ❌ 거부됨 (정상)
   ```

---

## 📚 6. 데이터 구조 참고

### 6.1 Firestore 컬렉션 구조

```
users/
  └── {userId}/           # 사용자별 최상위 문서
      ├── profile/        # 프로필 정보
      │   └── {profileId}
      │       ├── username: string
      │       ├── createdAt: timestamp
      │       └── loginMethod: string
      ├── texts/          # 저장된 글
      │   └── {textId}
      │       ├── content: string (1-10000자)
      │       ├── type: 'edit'|'reference'|'script'
      │       ├── characterCount: number
      │       ├── topic?: string
      │       ├── platforms?: string[]
      │       ├── linkedReferences?: string[]
      │       ├── createdAt: timestamp
      │       └── updatedAt: timestamp
      └── posts/          # 트래킹 포스트
          └── {postId}
              ├── content: string
              ├── sourceTextId: string
              ├── trackingEnabled: boolean
              ├── metrics: array
              ├── createdAt: timestamp
              └── updatedAt: timestamp
```

---

## ✅ Step 2 완료 체크리스트

다음 항목이 모두 완료되었는지 확인하세요:

- [ ] Firestore 보안 규칙 배포 완료
  - [ ] Firebase Console에서 "규칙" 탭 확인
  - [ ] 게시 상태: "활성"
- [ ] Firestore 인덱스 생성 완료
  - [ ] 6개 인덱스 모두 "사용 설정됨" 상태
  - [ ] 빌드 진행 중인 인덱스 없음
- [ ] 보안 규칙 테스트 완료 (선택사항)

---

## 🎯 다음 단계

> **Step 2를 모두 완료했습니다!** 🎉
>
> Firestore가 안전하고 빠르게 설정되었습니다.  
> 이제 웹사이트를 실제로 배포할 차례입니다.
>
> 👉 **[Step 3: 배포 실행](03_DEPLOYMENT.md)** 으로 이동하세요.

---

## 🆘 문제 해결

### Q1: "The query requires an index" 오류가 발생해요

**A**:

1. 오류 메시지의 링크를 클릭하면 자동으로 인덱스 생성 페이지로 이동
2. 또는 Firebase CLI로 `firebase deploy --only firestore:indexes` 재실행

### Q2: 인덱스가 "빌드 중"에서 멈춰있어요

**A**:

- 일반적으로 1-5분 소요
- 10분 이상 걸리면 페이지 새로고침
- 그래도 안되면 인덱스 삭제 후 재생성

### Q3: 보안 규칙을 배포했는데 여전히 테스트 모드 경고가 나와요

**A**:

- 브라우저 캐시 문제일 수 있음
- Firebase Console 로그아웃 → 재로그인
- "규칙" 탭에서 마지막 게시 시간 확인

### Q4: Firebase CLI가 설치되지 않았어요

**A**:

- Step 2는 Console로만 완료 가능
- Firebase CLI는 Step 3에서 설치 (Node.js 필요)

---

**문서 정보**

- **버전**: v2.0.0
- **최종 수정**: 2025-11-22
- **문서 타입**: Step 2 - Firestore 보안 규칙 & 인덱스 설정
- **관련 파일**:
  - `firestore.rules` - 보안 규칙
  - `firestore.indexes.json` - 인덱스 설정
- **다음 단계**: [Step 3 - 배포 실행](03_DEPLOYMENT.md)
