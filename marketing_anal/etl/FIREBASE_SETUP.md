# Firebase 설정 가이드

## 1. Firebase 프로젝트 생성

### 1-1. Firebase Console 접속

1. https://console.firebase.google.com/ 접속
2. "프로젝트 추가" 클릭

### 1-2. 프로젝트 정보 입력

1. 프로젝트 이름: `marketing-analytics-mvp` 입력
2. Google Analytics 사용 여부: 선택 사항 (나중에 추가 가능)
3. "프로젝트 만들기" 클릭

## 2. Firestore Database 생성

### 2-1. Firestore 활성화

1. 왼쪽 메뉴에서 "Firestore Database" 선택
2. "데이터베이스 만들기" 클릭

### 2-2. 보안 규칙 설정

1. 시작 모드 선택:
   - **테스트 모드**: 개발 중 (30일 후 만료)
   - **프로덕션 모드**: 실제 운영 시 (권장)
2. 위치 선택: `asia-northeast3 (Seoul)` 권장

### 2-3. 기본 컬렉션 생성

Firestore Console에서 다음 컬렉션을 수동으로 생성합니다:

#### `channels` 컬렉션

1. "컬렉션 시작" 클릭
2. 컬렉션 ID: `channels`
3. 첫 번째 문서 추가:
   - 문서 ID: `naver_cpc`
   - 필드:
     ```
     channel_id: "naver_cpc"
     platform: "naver"
     type: "search"
     traffic_type: "paid"
     name: "네이버 검색광고"
     ```

#### `metrics_daily` 컬렉션

1. "컬렉션 시작" 클릭
2. 컬렉션 ID: `metrics_daily`
3. 첫 번째 문서는 ETL 스크립트가 자동으로 생성합니다.

## 3. 보안 규칙 설정

### 3-1. Firestore Rules 수정

1. Firestore Database → 규칙 탭 선택
2. 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 읽기/쓰기 허용
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. "게시" 클릭

### 3-2. 테스트 모드 규칙 (개발 중)

개발 중에는 임시로 다음 규칙 사용 가능:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 모든 읽기/쓰기 허용 (30일 후 만료)
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2025, 12, 29);
    }
  }
}
```

## 4. 서비스 계정 키 생성

### 4-1. 서비스 계정 키 다운로드

1. 프로젝트 설정 (⚙️ 아이콘) → "서비스 계정" 탭
2. "새 비공개 키 생성" 클릭
3. 키 유형: JSON 선택
4. "키 생성" 클릭
5. 다운로드된 JSON 파일을 `etl/service-account-key.json`으로 저장

### 4-2. 보안 주의사항

⚠️ **중요**: 서비스 계정 키는 절대 Git에 업로드하지 마세요!

- `.gitignore`에 `service-account-key.json` 포함 확인
- 키 파일은 로컬에만 보관

## 5. 설정 확인

### 5-1. 체크리스트

- [ ] Firebase 프로젝트 생성 완료
- [ ] Firestore Database 생성 완료
- [ ] `channels` 컬렉션 생성 확인
- [ ] `metrics_daily` 컬렉션 생성 확인 (또는 ETL 실행 후 자동 생성)
- [ ] Firestore Rules 설정 완료
- [ ] 서비스 계정 키 다운로드 완료

### 5-2. 연결 테스트

ETL 스크립트를 실행하여 연결 확인:

```powershell
cd etl
python src/main.py
```

성공 시 Firestore Console에서 `metrics_daily` 컬렉션에 데이터가 보입니다.

## 6. 문제 해결

### Firestore 연결 실패

- 서비스 계정 키 파일 경로 확인
- Firebase 프로젝트 ID 확인
- 인터넷 연결 확인

### 권한 오류

- Firestore Rules 확인
- 서비스 계정 권한 확인 (편집자 이상)

## 참고 자료

- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Firestore 시작하기](https://firebase.google.com/docs/firestore/quickstart)
