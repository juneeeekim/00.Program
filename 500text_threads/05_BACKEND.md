# 🗄️ Step 5: 백엔드 개발 가이드

---

**버전**: v2.0.0  
**최종 수정**: 2025-11-22  
**문서 순서**: **Step 5 - Backend Development (백엔드 전용)**  
**대상**: 백엔드 개발자, 데이터베이스 관리자

> 📌 **이전 단계**: [Step 4 - 프론트엔드 개발 가이드](04_FRONTEND.md)  
> 📌 **선행 조건**: Step 1-3 완료 (Firestore Database 구축됨)

---

## 📋 이 문서의 목적

Firebase/Firestore **백엔드 영역**의 데이터 구조, 보안, 성능을 관리하고 최적화하는 방법을 안내합니다.

**다루는 내용**:

- ✅ Firestore 데이터 구조 설계 및 변경
- ✅ 보안 규칙 심화 및 커스터마이징
- ✅ 복합 인덱스 최적화
- ✅ 데이터 마이그레이션
- ✅ 백업 및 복구
- ✅ 성능 모니터링

**다루지 않는 내용** (→ Step 4 참고):

- ❌ UI/UX 수정
- ❌ CSS 스타일링
- ❌ 프론트엔드 JavaScript 로직

---

## 🏗️ 1. Firestore 데이터 구조

### 1.1 현재 데이터 모델

```
users/                              # 최상위 컬렉션
  └── {userId}/                     # 사용자별 문서
      ├── profile/                  # 프로필 서브컬렉션
      │   └── {profileId}
      │       ├── username: string
      │       ├── email?: string
      │       ├── createdAt: timestamp
      │       └── loginMethod: 'google' | 'username'
      │
      ├── texts/                    # 텍스트 서브컬렉션
      │   └── {textId}
      │       ├── content: string (1-10000자)
      │       ├── type: 'edit' | 'reference' | 'script'
      │       ├── characterCount: number
      │       ├── topic?: string
      │       ├── referenceType?: 'structure' | 'idea'
      │       ├── platforms?: string[]
      │       ├── linkedReferences?: string[]
      │       ├── contentHash?: string (중복 방지)
      │       ├── createdAt: timestamp
      │       └── updatedAt: timestamp
      │
      └── posts/                    # 트래킹 서브컬렉션
          └── {postId}
              ├── content: string
              ├── sourceTextId: string
              ├── platform?: string
              ├── trackingEnabled: boolean
              ├── metrics: array
              │   └── [{
              │       views: number,
              │       likes: number,
              │       comments: number,
              │       shares: number,
              │       timestamp: timestamp
              │   }]
              ├── analytics?: {
              │     totalViews: number,
              │     totalLikes: number,
              │     avgEngagement: number
              │ }
              ├── createdAt: timestamp
              └── updatedAt: timestamp
```

### 1.2 필드 타입 및 제약

| 필드               | 타입      | 필수 | 제약 조건                         |
| ------------------ | --------- | ---- | --------------------------------- |
| `content`          | string    | ✅   | 1-10000자                         |
| `type`             | string    | ✅   | 'edit' \| 'reference' \| 'script' |
| `characterCount`   | number    | ✅   | >= 0                              |
| `topic`            | string    | ❌   | 최대 50자                         |
| `platforms`        | array     | ❌   | 유효한 플랫폼 ID만                |
| `linkedReferences` | array     | ❌   | 존재하는 textId만                 |
| `createdAt`        | timestamp | ✅   | 자동 생성 (불변)                  |
| `updatedAt`        | timestamp | ✅   | 자동 업데이트                     |

---

## 🔒 2. Firestore 보안 규칙

### 2.1 현재 보안 규칙 구조

**파일**: `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 인증 헬퍼 함수
    function isAuthenticated() {
      return request.auth != null;
    }

    // 소유권 검증
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // users 컬렉션
    match /users/{userId} {
      allow read, write: if isOwner(userId);

      // texts 서브컬렉션
      match /texts/{textId} {
        allow read: if isOwner(userId);
        allow create: if isOwner(userId) && isValidTextData();
        allow update: if isOwner(userId) && isValidTextData();
        allow delete: if isOwner(userId);
      }

      // posts 서브컬렉션
      match /posts/{postId} {
        allow read: if isOwner(userId);
        allow create: if isOwner(userId) && isValidPostData();
        allow update: if isOwner(userId) && isValidPostData();
        allow delete: if isOwner(userId);
      }
    }
  }
}
```

### 2.2 보안 규칙 커스터마이징

#### 예시 1: 특정 필드 업데이트 제한

```javascript
// createdAt 필드는 변경 불가
function isValidUpdate() {
  return request.resource.data.createdAt == resource.data.createdAt;
}

match /texts/{textId} {
  allow update: if isOwner(userId)
                && isValidTextData()
                && isValidUpdate();  // 추가
}
```

#### 예시 2: 콘텐츠 길이 제한 강화

```javascript
function isValidTextData() {
  let data = request.resource.data;
  return (
    data.content.size() > 0 &&
    data.content.size() <= 5000 && // 10000 → 5000으로 축소
    data.type in ["edit", "reference", "script"] &&
    data.characterCount >= 0
  );
}
```

#### 예시 3: 관리자 권한 추가

```javascript
// 특정 사용자를 관리자로 지정
function isAdmin() {
  return request.auth.uid in ['ADMIN_UID_1', 'ADMIN_UID_2'];
}

match /users/{userId} {
  // 관리자는 모든 사용자 데이터 읽기 가능
  allow read: if isOwner(userId) || isAdmin();
  allow write: if isOwner(userId);
}
```

### 2.3 보안 규칙 테스트

**Firebase Console 사용**:

1. **Firestore Database → 규칙 탭**
2. **"규칙 플레이그라운드" 클릭**
3. **시뮬레이션 실행**:

   ```
   위치: /users/testUser123/texts/doc1
   읽기/쓰기: 쓰기
   인증됨: 예
   Firebase UID: testUser123

   요청 데이터:
   {
     "content": "테스트 내용",
     "type": "edit",
     "characterCount": 10,
     "createdAt": "2025-11-22T00:00:00Z",
     "updatedAt": "2025-11-22T00:00:00Z"
   }

   결과: ✅ 허용됨 or ❌ 거부됨
   ```

### 2.4 보안 규칙 배포

```bash
# 수정한 firestore.rules 배포
firebase deploy --only firestore:rules

# 성공 확인
# ✔ Deploy complete!
```

---

## 📊 3. Firestore 인덱스 관리

### 3.1 현재 인덱스 목록

**파일**: `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "texts",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "texts",
      "fields": [
        { "fieldPath": "platforms", "arrayConfig": "CONTAINS" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
    // ... 총 6개
  ]
}
```

### 3.2 새로운 인덱스 추가

#### 예시: 주제별 + 플랫폼별 검색

**쿼리 요구사항**:

```javascript
// JavaScript에서 이런 쿼리를 실행하려면
texts
  .where("topic", "==", "마케팅")
  .where("platforms", "array-contains", "instagram")
  .orderBy("createdAt", "desc");
```

**필요한 인덱스**:

```json
{
  "collectionGroup": "texts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "topic", "order": "ASCENDING" },
    { "fieldPath": "platforms", "arrayConfig": "CONTAINS" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### 3.3 인덱스 최적화 전략

| 쿼리 패턴             | 인덱스 필요 여부 | 이유             |
| --------------------- | ---------------- | ---------------- |
| 단일 필드 필터        | ❌               | 자동 인덱스      |
| 단일 필드 정렬        | ❌               | 자동 인덱스      |
| 여러 필드 필터        | ✅               | 복합 인덱스 필요 |
| 필터 + 정렬           | ✅               | 복합 인덱스 필요 |
| array-contains + 정렬 | ✅               | 특수 인덱스 필요 |

### 3.4 인덱스 배포

```bash
# firestore.indexes.json 수정 후
firebase deploy --only firestore:indexes

# 인덱스 생성 대기 (1-5분)
# Firebase Console → Firestore → 인덱스 탭에서 확인
```

---

## 💾 4. 데이터 마이그레이션

### 4.1 필드 추가 (안전한 마이그레이션)

**시나리오**: 모든 `texts`에 `version: 'v2'` 필드 추가

```javascript
// 마이그레이션 스크립트 (Node.js)
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

async function migrateTexts() {
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const textsSnapshot = await db
      .collection("users")
      .doc(userDoc.id)
      .collection("texts")
      .get();

    const batch = db.batch();
    let count = 0;

    for (const textDoc of textsSnapshot.docs) {
      const textRef = db
        .collection("users")
        .doc(userDoc.id)
        .collection("texts")
        .doc(textDoc.id);

      batch.update(textRef, { version: "v2" });
      count++;

      // Firestore 배치는 최대 500개
      if (count === 500) {
        await batch.commit();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
  }

  console.log("마이그레이션 완료!");
}

migrateTexts();
```

### 4.2 필드 이름 변경

**시나리오**: `topic` → `category`로 변경

```javascript
async function renameField() {
  const textsQuery = db.collectionGroup("texts");
  const snapshot = await textsQuery.get();

  const batch = db.batch();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.topic) {
      batch.update(doc.ref, {
        category: data.topic, // 새 필드 추가
        topic: admin.firestore.FieldValue.delete(), // 기존 필드 삭제
      });
    }
  });

  await batch.commit();
  console.log("필드 이름 변경 완료!");
}
```

### 4.3 데이터 타입 변경

**시나리오**: `characterCount` string → number

```javascript
async function convertDataType() {
  const textsQuery = db.collectionGroup("texts");
  const snapshot = await textsQuery.get();

  const batch = db.batch();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (typeof data.characterCount === "string") {
      batch.update(doc.ref, {
        characterCount: parseInt(data.characterCount, 10),
      });
    }
  });

  await batch.commit();
  console.log("데이터 타입 변환 완료!");
}
```

---

## 📈 5. 성능 최적화

### 5.1 쿼리 최적화

#### Before (비효율)

```javascript
// ❌ 모든 데이터를 가져온 후 필터링
const allTexts = await db
  .collection("users")
  .doc(userId)
  .collection("texts")
  .get();

const filtered = allTexts.docs.filter((doc) => doc.data().type === "reference");
```

#### After (효율적)

```javascript
// ✅ Firestore에서 필터링
const refTexts = await db
  .collection("users")
  .doc(userId)
  .collection("texts")
  .where("type", "==", "reference")
  .get();
```

### 5.2 페이지네이션 (대량 데이터)

```javascript
// 첫 페이지 (20개)
const firstPage = await db
  .collection("users")
  .doc(userId)
  .collection("texts")
  .orderBy("createdAt", "desc")
  .limit(20)
  .get();

// 다음 페이지
const lastDoc = firstPage.docs[firstPage.docs.length - 1];
const nextPage = await db
  .collection("users")
  .doc(userId)
  .collection("texts")
  .orderBy("createdAt", "desc")
  .startAfter(lastDoc)
  .limit(20)
  .get();
```

### 5.3 실시간 리스너 최적화

```javascript
// ❌ 전체 컬렉션 리스닝 (비효율)
db.collection("users")
  .doc(userId)
  .collection("texts")
  .onSnapshot((snapshot) => {
    // 너무 많은 데이터...
  });

// ✅ 필요한 데이터만 리스닝
db.collection("users")
  .doc(userId)
  .collection("texts")
  .where("type", "==", "reference")
  .limit(50)
  .onSnapshot((snapshot) => {
    // 필터링된 데이터만
  });
```

---

## 🔄 6. 백업 및 복구

### 6.1 수동 백업 (Firebase Console)

1. **Firestore Database → 데이터 탭**
2. **내보내기 버튼 클릭**
3. **Cloud Storage 버킷 선택**
4. **컬렉션 선택 (또는 전체)**
5. **내보내기 실행**

### 6.2 자동 백업 스케줄 (Cloud Scheduler)

```bash
# gcloud CLI로 백업 스케줄 생성
gcloud firestore export gs://YOUR_BUCKET/backups/$(date +%Y%m%d) \
  --project=YOUR_PROJECT_ID

# 매일 자동 백업 (Cloud Scheduler)
gcloud scheduler jobs create http daily-firestore-backup \
  --schedule="0 2 * * *" \
  --uri="https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default):exportDocuments" \
  --message-body='{"outputUriPrefix":"gs://YOUR_BUCKET/backups"}' \
  --oauth-service-account-email=YOUR_SERVICE_ACCOUNT \
  --http-method=POST
```

### 6.3 데이터 복구

```bash
# 백업에서 복구
gcloud firestore import gs://YOUR_BUCKET/backups/20251122 \
  --project=YOUR_PROJECT_ID
```

---

## 🐛 7. 디버깅 및 모니터링

### 7.1 Firestore 사용량 모니터링

**Firebase Console → Firestore Database → 사용량 탭**

확인 항목:

- **읽기/쓰기/삭제 횟수**: 일일 할당량 확인
- **저장소 크기**: 용량 증가 추이
- **인덱스 크기**: 불필요한 인덱스 제거

### 7.2 보안 규칙 로그

```javascript
// 보안 규칙에 디버그 로그 추가
function isValidTextData() {
  let data = request.resource.data;

  // 디버그: 실패 원인 파악
  debug(data);

  return data.content.size() > 0 && data.content.size() <= 10000;
}
```

**Firebase Console → Firestore → 규칙 탭 → 평가 로그**

### 7.3 성능 모니터링

```javascript
// JavaScript에서 쿼리 성능 측정
const startTime = Date.now();

const snapshot = await db
  .collection("users")
  .doc(userId)
  .collection("texts")
  .where("type", "==", "reference")
  .get();

const duration = Date.now() - startTime;
console.log(`쿼리 시간: ${duration}ms`);

if (duration > 1000) {
  console.warn("느린 쿼리 감지! 인덱스 확인 필요");
}
```

---

## 📋 백엔드 체크리스트

변경 전 확인사항:

- [ ] 데이터 구조 변경 시 프론트엔드 코드도 수정 필요한지 확인
- [ ] 보안 규칙 변경 시 기존 데이터 접근 불가 여부 확인
- [ ] 인덱스 추가 시 비용 영향 검토 (Firebase 요금제)
- [ ] 마이그레이션 스크립트 로컬에서 테스트
- [ ] 백업 생성 (중요한 변경의 경우)
- [ ] 배포 후 Firebase Console에서 규칙/인덱스 상태 확인
- [ ] 성능 모니터링 (읽기/쓰기 횟수 증가 확인)

---

## 🆘 문제 해결

### Q1: "Missing or insufficient permissions" 오류

**A**:

```bash
# 1. 보안 규칙 재배포
firebase deploy --only firestore:rules

# 2. Firebase Console에서 규칙 확인
# Firestore Database → 규칙 탭

# 3. 규칙 플레이그라운드에서 시뮬레이션
```

### Q2: "The query requires an index" 오류

**A**:

```bash
# 1. 오류 메시지의 링크 클릭 (자동 인덱스 생성)
# 2. 또는 firestore.indexes.json에 추가 후 배포
firebase deploy --only firestore:indexes
```

### Q3: 인덱스가 "빌드 중"에서 멈춤

**A**:

- 일반적으로 1-5분 소요
- 10분 이상 걸리면 인덱스 삭제 후 재생성
- Firebase 지원팀에 문의

### Q4: 데이터 마이그레이션 중 오류

**A**:

```javascript
// 배치 크기 줄이기 (500 → 100)
if (count === 100) {
  await batch.commit();
  count = 0;
}

// 재시도 로직 추가
try {
  await batch.commit();
} catch (error) {
  console.error("배치 커밋 실패:", error);
  // 재시도 로직
}
```

---

## 🎓 추가 학습 자료

- [Firestore 공식 문서](https://firebase.google.com/docs/firestore)
- [보안 규칙 가이드](https://firebase.google.com/docs/firestore/security/get-started)
- [쿼리 최적화](https://firebase.google.com/docs/firestore/query-data/queries)
- [복합 인덱스 이해](https://firebase.google.com/docs/firestore/query-data/index-overview)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)

---

## 🎯 축하합니다!

**백엔드 구조를 이해하고 관리할 준비가 완료되었습니다!** 🎉

안전하고 효율적인 데이터 관리로 애플리케이션의 성능과 보안을 유지하세요.

---

**문서 정보**

- **버전**: v2.0.0
- **최종 수정**: 2025-11-22
- **문서 타입**: Step 5 - Backend Development Guide
- **대상**: 백엔드 개발자, 데이터베이스 관리자
- **관련 파일**: `firestore.rules`, `firestore.indexes.json`
- **관련 문서**:
  - [Step 2 - Firestore 설정](02_FIRESTORE_CONFIG.md) (기본 설정)
  - [Step 4 - 프론트엔드 가이드](04_FRONTEND.md) (프론트엔드 연동)
