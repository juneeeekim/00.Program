# Google OAuth 테스트 가이드

## 개요

이 문서는 Google OAuth 2.0 인증 시스템의 테스트 유틸리티 사용 방법과 검증 절차를 설명합니다.

## 테스트 유틸리티 구성

### 1. OAuthTestUtilities 클래스

**위치**: `js/test-utilities.js`

**주요 기능**:
- Google OAuth 응답 모킹
- 인증 플로우 검증
- 토큰 관리 테스트
- 마이그레이션 테스트
- 오류 처리 검증

### 2. 테스트 HTML 인터페이스

**위치**: `test-oauth-utilities.html`

**기능**:
- 시각적 테스트 실행 인터페이스
- 실시간 테스트 결과 표시
- Mock 데이터 관리
- 테스트 데이터 정리

## 테스트 카테고리

### 1. 설정 검증 테스트

**목적**: AuthConfig 클래스의 설정 검증 기능 확인

**테스트 항목**:
- ✅ 환경 감지 (개발/프로덕션)
- ✅ Client ID 형식 검증
- ✅ 전체 설정 유효성 확인

**실행 방법**:
```javascript
const testUtils = new OAuthTestUtilities();
const authConfig = new AuthConfig();
const results = testUtils.testConfigValidation(authConfig);
```

**예상 결과**:
- 환경이 올바르게 감지됨
- Client ID 형식이 검증됨
- 설정 상태가 정확히 반환됨

### 2. 인증 플로우 테스트

**목적**: GoogleAuthManager의 인증 프로세스 검증

**테스트 항목**:
- ✅ 초기화 프로세스
- ✅ 로그인 상태 확인
- ✅ 현재 사용자 정보 조회
- ✅ 인증 상태 정보 반환

**실행 방법**:
```javascript
const authManager = new GoogleAuthManager(authConfig);
const results = await testUtils.testAuthenticationFlow(authManager);
```

**예상 결과**:
- 초기화가 성공하거나 예상된 실패 발생
- 로그인 상태가 boolean으로 반환됨
- 사용자 정보가 올바른 형식으로 반환됨


### 3. 토큰 관리 테스트

**목적**: 토큰 검증 및 모니터링 기능 확인

**테스트 항목**:
- ✅ 토큰 유효성 검증
- ✅ 토큰 모니터링 상태 확인

**실행 방법**:
```javascript
const results = testUtils.testTokenManagement(authManager);
```

**예상 결과**:
- 토큰 검증이 정상 작동
- 모니터링 상태가 올바르게 반환됨

### 4. 마이그레이션 테스트

**목적**: 데이터 마이그레이션 프로세스 검증

**테스트 항목**:
- ✅ 마이그레이션 필요성 확인
- ✅ 기존 데이터 조회
- ✅ 백업 생성
- ✅ 마이그레이션 실행
- ✅ 마이그레이션 후 데이터 검증

**실행 방법**:
```javascript
const migrationManager = new DataMigrationManager(authConfig);
const googleUserData = testUtils.mockData.googleUser;
const results = await testUtils.testMigration(migrationManager, googleUserData);
```

**예상 결과**:
- 기존 데이터가 정확히 감지됨
- 백업이 성공적으로 생성됨
- 데이터가 새 키로 이전됨
- 이전된 데이터가 검증됨

### 5. 오류 처리 테스트

**목적**: 다양한 오류 시나리오에 대한 처리 검증

**테스트 항목**:
- ✅ 사용자 취소 오류 메시지
- ✅ 네트워크 오류 메시지
- ✅ 토큰 만료 오류 메시지
- ✅ 설정 오류 메시지

**실행 방법**:
```javascript
const results = testUtils.testErrorHandling(authManager);
```

**예상 결과**:
- 각 오류 유형에 대해 사용자 친화적 메시지 생성
- 메시지가 명확하고 실행 가능한 안내 포함

## Mock 데이터 구조

### Google 사용자 데이터
```javascript
{
    id: 'test_user_123456789',
    name: 'Test User',
    email: 'testuser@example.com',
    picture: 'https://example.com/avatar.jpg',
    provider: 'google',
    accessToken: 'mock_access_token_...',
    expiresAt: 1234567890000,
    loginTime: 1234567890000
}
```

### 인증 응답
```javascript
{
    access_token: 'mock_access_token_...',
    expires_at: 1234567890,
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'profile email'
}
```

### 저장된 글
```javascript
[
    {
        id: 1234567890000,
        content: '테스트 저장 글 1',
        date: '2025-10-25 14:30:15',
        characterCount: 10,
        type: 'reference'
    }
]
```

## 테스트 실행 방법

### 방법 1: HTML 인터페이스 사용

1. `test-oauth-utilities.html` 파일을 브라우저에서 엽니다
2. "전체 테스트 실행" 버튼을 클릭합니다
3. 결과를 확인합니다

### 방법 2: 콘솔에서 직접 실행

```javascript
// 1. 테스트 유틸리티 초기화
const testUtils = new OAuthTestUtilities();
const authConfig = new AuthConfig();
const authManager = new GoogleAuthManager(authConfig);
const migrationManager = new DataMigrationManager(authConfig);

// 2. 전체 테스트 실행
const results = await testUtils.runAllTests(
    authConfig,
    authManager,
    migrationManager
);

// 3. 결과 확인
console.log(results);
```

### 방법 3: 개별 테스트 실행

```javascript
// 설정 검증만 테스트
const configResults = testUtils.testConfigValidation(authConfig);

// 인증 플로우만 테스트
const authResults = await testUtils.testAuthenticationFlow(authManager);

// 토큰 관리만 테스트
const tokenResults = testUtils.testTokenManagement(authManager);

// 마이그레이션만 테스트
const migrationResults = await testUtils.testMigration(
    migrationManager,
    testUtils.mockData.googleUser
);
```


## 테스트 결과 해석

### 성공 기준

각 테스트는 다음 기준으로 평가됩니다:

1. **설정 검증 테스트**
   - 환경 감지: boolean 값 반환
   - Client ID 검증: valid 속성 포함된 객체 반환
   - 전체 검증: boolean 값 반환

2. **인증 플로우 테스트**
   - 초기화: true/false 반환 (설정에 따라)
   - 로그인 상태: boolean 값 반환
   - 사용자 정보: null 또는 사용자 객체 반환
   - 인증 상태: 필수 필드 포함된 객체 반환

3. **토큰 관리 테스트**
   - 토큰 검증: boolean 값 반환
   - 모니터링 상태: boolean 값 반환

4. **마이그레이션 테스트**
   - 필요성 확인: needed 속성이 true
   - 데이터 조회: savedTexts 배열에 데이터 존재
   - 백업 생성: timestamp와 data 속성 존재
   - 마이그레이션 실행: success가 true
   - 데이터 검증: 이전된 데이터 존재

5. **오류 처리 테스트**
   - 각 오류 유형에 대해 문자열 메시지 반환
   - 메시지 길이 > 0

### 실패 원인 분석

**설정 검증 실패**:
- Client ID가 플레이스홀더 값인 경우
- Client ID 형식이 올바르지 않은 경우
- 프로덕션 환경에서 HTTPS가 아닌 경우

**인증 플로우 실패**:
- Google API 스크립트 로드 실패
- 네트워크 연결 문제
- 설정 오류

**토큰 관리 실패**:
- 현재 사용자가 없는 경우 (정상)
- 토큰이 만료된 경우 (정상)

**마이그레이션 실패**:
- 기존 데이터가 없는 경우
- 로컬 스토리지 접근 오류
- 데이터 형식 오류

## 테스트 데이터 관리

### 테스트 데이터 생성

```javascript
// 마이그레이션 테스트용 데이터 생성
const testData = testUtils.createMigrationTestData('test_user');

// 생성되는 로컬 스토리지 키:
// - dualTextWriter_savedTexts_test_user
// - dualTextWriter_tempSave_test_user
// - dualTextWriter_currentUser
// - dualTextWriter_authProvider
```

### 테스트 데이터 정리

```javascript
// 모든 테스트 데이터 삭제
testUtils.cleanupTestData();

// 정리되는 키:
// - dualTextWriter_savedTexts_migration_test_user
// - dualTextWriter_tempSave_migration_test_user
// - dualTextWriter_savedTexts_testuser@example.com
// - dualTextWriter_tempSave_testuser@example.com
// - dualTextWriter_migrationRecord
// - dualTextWriter_migration_backup
```

## 요구사항 검증 매트릭스

| 요구사항 | 테스트 항목 | 검증 방법 |
|---------|-----------|----------|
| 1.1 Google 로그인 | 인증 플로우 테스트 | signIn 메서드 호출 |
| 1.2 프로필 저장 | 인증 플로우 테스트 | getCurrentUser 검증 |
| 1.3 로그인 실패 시 폴백 | 오류 처리 테스트 | 오류 메시지 확인 |
| 1.4 설정 검증 | 설정 검증 테스트 | validateGoogleConfig |
| 1.5 프로필 표시 | 인증 플로우 테스트 | 사용자 정보 조회 |
| 2.1 환경 감지 | 설정 검증 테스트 | detectEnvironment |
| 2.2 환경별 Client ID | 설정 검증 테스트 | getClientIdForEnvironment |
| 2.3 설정 안내 | 설정 검증 테스트 | getSetupInstructions |
| 2.4 Client ID 형식 검증 | 설정 검증 테스트 | validateClientIdFormat |
| 2.5 검증 실패 시 폴백 | 오류 처리 테스트 | 오류 메시지 확인 |
| 3.1 기존 데이터 확인 | 마이그레이션 테스트 | checkMigrationNeeded |
| 3.2 마이그레이션 확인 | 마이그레이션 테스트 | confirmMigration |
| 3.3 데이터 이전 | 마이그레이션 테스트 | performMigration |
| 3.4 백업 생성 | 마이그레이션 테스트 | createBackup |
| 3.5 마이그레이션 완료 | 마이그레이션 테스트 | 데이터 검증 |
| 4.1 자동 토큰 갱신 | 토큰 관리 테스트 | refreshTokenIfNeeded |
| 4.2 5분 임계값 | 토큰 관리 테스트 | checkTokenExpiry |
| 4.3 갱신 실패 처리 | 오류 처리 테스트 | 토큰 오류 메시지 |
| 4.4 토큰 검증 | 토큰 관리 테스트 | validateToken |
| 4.5 무효 토큰 정리 | 토큰 관리 테스트 | clearInvalidTokens |
| 5.1 초기화 실패 | 오류 처리 테스트 | 초기화 오류 메시지 |
| 5.2 사용자 취소 | 오류 처리 테스트 | 취소 메시지 |
| 5.3 네트워크 오류 | 오류 처리 테스트 | 네트워크 오류 메시지 |
| 5.4 서비스 불가 | 오류 처리 테스트 | 서비스 오류 메시지 |
| 5.5 상세 로깅 | 모든 테스트 | 콘솔 로그 확인 |

## 베스트 프랙티스

### 1. 테스트 전 준비
- 브라우저 콘솔을 열어 로그 확인
- 로컬 스토리지를 정리하여 깨끗한 상태에서 시작
- 네트워크 연결 확인

### 2. 테스트 실행
- 전체 테스트를 먼저 실행하여 전반적인 상태 확인
- 실패한 테스트가 있으면 개별 테스트로 상세 확인
- 콘솔 로그를 통해 상세 정보 확인

### 3. 테스트 후 정리
- 테스트 데이터 정리 버튼 클릭
- 브라우저 새로고침으로 상태 초기화
- 실제 사용자 데이터와 혼동되지 않도록 주의

### 4. 문제 해결
- 설정 검증 실패: `config/auth-config.js` 확인
- 초기화 실패: Google API 스크립트 로드 확인
- 마이그레이션 실패: 로컬 스토리지 권한 확인

## 자동화 가능성

현재 테스트 유틸리티는 수동 실행을 위해 설계되었지만, 다음과 같이 자동화할 수 있습니다:

```javascript
// CI/CD 파이프라인에서 실행 가능한 자동화 스크립트
async function runAutomatedTests() {
    const testUtils = new OAuthTestUtilities();
    const authConfig = new AuthConfig();
    const authManager = new GoogleAuthManager(authConfig);
    const migrationManager = new DataMigrationManager(authConfig);
    
    const results = await testUtils.runAllTests(
        authConfig,
        authManager,
        migrationManager
    );
    
    // 결과를 JSON으로 내보내기
    const exportedResults = testUtils.exportResults();
    
    // 실패한 테스트가 있으면 종료 코드 1 반환
    if (results.totalFailed > 0) {
        console.error('테스트 실패:', results.totalFailed);
        process.exit(1);
    }
    
    console.log('모든 테스트 통과');
    process.exit(0);
}
```

## 추가 리소스

- **Google OAuth 2.0 문서**: https://developers.google.com/identity/protocols/oauth2
- **프로젝트 설정 가이드**: `docs/google-cloud-setup-guide.md`
- **요구사항 문서**: `.kiro/specs/google-oauth-fix/requirements.md`
- **설계 문서**: `.kiro/specs/google-oauth-fix/design.md`
