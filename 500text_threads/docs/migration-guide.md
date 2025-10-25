# 데이터 마이그레이션 가이드

## 개요

이 가이드는 기존 사용자명 기반 로그인에서 Google OAuth 2.0 로그인으로 전환하는 사용자를 위한 데이터 마이그레이션 프로세스를 설명합니다.

## 마이그레이션이란?

**마이그레이션**은 기존 사용자명으로 저장된 모든 데이터(저장된 글, 임시 저장 등)를 Google 계정으로 안전하게 이전하는 프로세스입니다.

### 마이그레이션이 필요한 경우

- 기존에 사용자명으로 로그인하여 글을 저장한 적이 있음
- Google 계정으로 처음 로그인할 때
- 기존 데이터를 Google 계정에서 계속 사용하고 싶을 때

## 자동 마이그레이션 프로세스

### 1단계: 마이그레이션 감지

Google 계정으로 처음 로그인하면 시스템이 자동으로:
- 기존 사용자명 기반 데이터 확인
- 저장된 글 개수 및 크기 분석
- 마이그레이션 필요 여부 판단

### 2단계: 사용자 확인

마이그레이션이 필요한 경우, 확인 대화상자가 표시됩니다:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 데이터 마이그레이션

기존 사용자명으로 저장된 데이터를 발견했습니다.
Google 계정으로 데이터를 이전하시겠습니까?

📊 마이그레이션 정보:
  • 기존 사용자명: [username]
  • Google 계정: [email@gmail.com]
  • 저장된 글: 15개
  • 예상 크기: 12.5 KB

⚠️ 주의사항:
  • 마이그레이션 전 자동 백업이 생성됩니다
  • 기존 데이터는 이전 후 삭제됩니다
  • 이 작업은 되돌릴 수 없습니다

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[마이그레이션 시작]  [나중에]
```

### 3단계: 백업 생성

마이그레이션을 승인하면:
1. **자동 백업 생성**
   - 모든 기존 데이터를 백업
   - 백업 키: `dualTextWriter_migration_backup`
   - 타임스탬프 포함

2. **백업 내용**
   ```javascript
   {
     timestamp: 1635789012345,
     sourceUsername: "old_username",
     targetEmail: "user@gmail.com",
     savedTexts: [...],  // 저장된 모든 글
     tempSave: {...},    // 임시 저장 데이터
     activityLogs: [...]  // 활동 로그
   }
   ```

### 4단계: 데이터 이전

시스템이 자동으로:
1. **저장된 글 이전**
   - 키 변경: `dualTextWriter_savedTexts_[username]` → `dualTextWriter_savedTexts_[email]`
   - 모든 글 메타데이터 보존 (날짜, 타입, 글자 수 등)

2. **임시 저장 이전**
   - 키 변경: `dualTextWriter_tempSave_[username]` → `dualTextWriter_tempSave_[email]`
   - 작성 중이던 글 보존

3. **활동 로그 업데이트**
   - 마이그레이션 이벤트 기록
   - 사용자 ID 업데이트

### 5단계: 검증 및 정리

1. **데이터 무결성 검증**
   - 이전된 데이터 개수 확인
   - 데이터 크기 비교
   - 필수 필드 존재 확인

2. **기존 데이터 삭제**
   - 검증 성공 시에만 삭제
   - 사용자명 기반 키 제거
   - 백업은 보존

3. **완료 알림**
   ```
   ✅ 마이그레이션 완료!
   
   15개의 글이 성공적으로 이전되었습니다.
   이제 Google 계정으로 모든 데이터에 접근할 수 있습니다.
   ```

## 마이그레이션 데이터 구조

### 이전 전 (사용자명 기반)
```javascript
// 로컬 스토리지 키
'dualTextWriter_currentUser': 'my_username'
'dualTextWriter_savedTexts_my_username': [...]
'dualTextWriter_tempSave_my_username': {...}
'dualTextWriter_authProvider': 'username'
```

### 이전 후 (Google 계정 기반)
```javascript
// 로컬 스토리지 키
'dualTextWriter_currentUser': 'user@gmail.com'
'dualTextWriter_savedTexts_user@gmail.com': [...]
'dualTextWriter_tempSave_user@gmail.com': {...}
'dualTextWriter_authProvider': 'google'
'dualTextWriter_userData': {
  id: 'google_user_id',
  name: 'User Name',
  email: 'user@gmail.com',
  picture: 'https://...',
  provider: 'google'
}
```

## 마이그레이션 실패 시 복구

### 자동 롤백

마이그레이션 중 오류 발생 시:
1. 시스템이 자동으로 백업에서 복구
2. 기존 데이터 복원
3. 오류 메시지 표시
4. 사용자명 로그인으로 폴백

### 수동 복구 방법

#### 방법 1: 브라우저 개발자 도구 사용

1. **브라우저 콘솔 열기** (F12)

2. **백업 데이터 확인**
   ```javascript
   const backup = localStorage.getItem('dualTextWriter_migration_backup');
   console.log(JSON.parse(backup));
   ```

3. **수동 복원**
   ```javascript
   const backup = JSON.parse(localStorage.getItem('dualTextWriter_migration_backup'));
   
   // 저장된 글 복원
   localStorage.setItem(
     `dualTextWriter_savedTexts_${backup.sourceUsername}`,
     JSON.stringify(backup.savedTexts)
   );
   
   // 임시 저장 복원
   localStorage.setItem(
     `dualTextWriter_tempSave_${backup.sourceUsername}`,
     JSON.stringify(backup.tempSave)
   );
   
   console.log('복원 완료!');
   ```

4. **페이지 새로고침**

#### 방법 2: 백업 파일 내보내기

1. **백업 데이터 내보내기**
   ```javascript
   const backup = localStorage.getItem('dualTextWriter_migration_backup');
   const blob = new Blob([backup], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = 'migration_backup.json';
   a.click();
   ```

2. **파일 저장 후 안전한 곳에 보관**

3. **필요시 수동으로 데이터 복원**

## 마이그레이션 모범 사례

### 마이그레이션 전

1. **데이터 확인**
   - 저장된 글 목록 확인
   - 중요한 글은 TXT 파일로 다운로드

2. **브라우저 준비**
   - 안정적인 인터넷 연결 확인
   - 브라우저 업데이트 확인
   - 충분한 로컬 스토리지 공간 확인

3. **테스트 환경**
   - 가능하면 다른 브라우저에서 먼저 테스트
   - 또는 시크릿 모드에서 테스트

### 마이그레이션 중

1. **중단하지 않기**
   - 마이그레이션 진행 중 브라우저 닫지 않기
   - 다른 탭으로 이동하지 않기
   - 완료 메시지 확인까지 대기

2. **진행 상황 모니터링**
   - 브라우저 콘솔에서 로그 확인
   - 오류 메시지 주의 깊게 확인

### 마이그레이션 후

1. **데이터 검증**
   - 저장된 글 개수 확인
   - 몇 개의 글을 열어서 내용 확인
   - 임시 저장 데이터 확인

2. **백업 보관**
   - 백업 데이터는 최소 1주일 보관
   - 문제 없으면 수동으로 삭제 가능
   ```javascript
   localStorage.removeItem('dualTextWriter_migration_backup');
   ```

3. **기능 테스트**
   - 새 글 작성 및 저장
   - 기존 글 편집
   - 로그아웃 후 재로그인

## 마이그레이션 거부 시

마이그레이션을 거부하면:

1. **기존 데이터 유지**
   - 사용자명 기반 데이터는 그대로 유지
   - 사용자명 로그인으로 계속 접근 가능

2. **Google 계정 사용**
   - Google 계정으로는 새로운 데이터 시작
   - 기존 데이터와 분리됨

3. **나중에 마이그레이션**
   - 언제든지 마이그레이션 가능
   - 사용자명으로 로그인 → Google 로그인 시 재시도

## 여러 기기에서 마이그레이션

### 시나리오: 여러 기기에서 사용

**문제**: 집 컴퓨터와 회사 컴퓨터에서 각각 다른 사용자명으로 사용

**해결 방법**:

1. **첫 번째 기기에서 마이그레이션**
   - Google 계정으로 로그인
   - 마이그레이션 진행
   - 데이터 확인

2. **두 번째 기기에서**
   - Google 계정으로 로그인
   - 첫 번째 기기의 데이터는 자동 동기화 안 됨 (로컬 스토리지 사용)
   - 두 번째 기기의 데이터도 별도로 마이그레이션 필요

3. **데이터 통합 방법**
   - 각 기기에서 중요한 글을 TXT로 다운로드
   - 한 기기에서 수동으로 통합
   - 또는 클라우드 동기화 기능 대기 (향후 업데이트)

## 마이그레이션 로그

### 로그 확인 방법

```javascript
// 브라우저 콘솔에서
const logs = JSON.parse(localStorage.getItem('dualTextWriter_activityLogs'));
const migrationLogs = logs.filter(log => log.action.includes('migration'));
console.table(migrationLogs);
```

### 로그 항목 예시

```javascript
{
  timestamp: "2025-10-25T14:30:15.123Z",
  sessionId: "sess_abc123",
  userId: "user@gmail.com",
  action: "migration_started",
  details: {
    sourceUsername: "old_username",
    targetEmail: "user@gmail.com",
    itemCount: 15,
    estimatedSize: 12800
  }
}
```

## 자주 묻는 질문 (FAQ)

### Q1: 마이그레이션은 필수인가요?
**A**: 아니요, 선택사항입니다. 거부하면 기존 사용자명 로그인을 계속 사용할 수 있습니다.

### Q2: 마이그레이션 후 사용자명 로그인은 어떻게 되나요?
**A**: 사용자명 로그인은 계속 사용 가능하지만, 데이터는 Google 계정으로 이전되어 사용자명으로는 접근할 수 없습니다.

### Q3: 마이그레이션을 취소할 수 있나요?
**A**: 마이그레이션 완료 후에는 자동으로 취소할 수 없습니다. 하지만 백업 데이터를 사용하여 수동으로 복원할 수 있습니다.

### Q4: 여러 Google 계정을 사용하면 어떻게 되나요?
**A**: 각 Google 계정은 별도의 데이터를 가집니다. 마이그레이션은 처음 로그인한 Google 계정으로만 진행됩니다.

### Q5: 마이그레이션 중 브라우저를 닫으면 어떻게 되나요?
**A**: 마이그레이션이 중단되고 롤백됩니다. 다음 로그인 시 다시 시도할 수 있습니다.

### Q6: 백업 데이터는 언제까지 보관되나요?
**A**: 수동으로 삭제하기 전까지 브라우저 로컬 스토리지에 보관됩니다. 최소 1주일 보관을 권장합니다.

### Q7: 다른 브라우저로 데이터를 옮길 수 있나요?
**A**: 현재는 각 브라우저의 로컬 스토리지에 독립적으로 저장됩니다. TXT 다운로드 기능을 사용하여 수동으로 이전할 수 있습니다.

### Q8: 마이그레이션 실패 시 데이터가 손실되나요?
**A**: 아니요, 자동 백업 시스템이 있어 실패 시 자동으로 복원됩니다.

## 기술 세부사항

### 마이그레이션 알고리즘

```javascript
async performMigration(oldUsername, newEmail) {
    try {
        // 1. 백업 생성
        const backup = this.createBackup(oldUsername);
        
        // 2. 데이터 로드
        const savedTexts = this.loadSavedTexts(oldUsername);
        const tempSave = this.loadTempSave(oldUsername);
        
        // 3. 데이터 검증
        if (!this.validateData(savedTexts, tempSave)) {
            throw new Error('Data validation failed');
        }
        
        // 4. 데이터 이전
        this.saveSavedTexts(newEmail, savedTexts);
        this.saveTempSave(newEmail, tempSave);
        
        // 5. 검증
        const migrated = this.loadSavedTexts(newEmail);
        if (migrated.length !== savedTexts.length) {
            throw new Error('Migration verification failed');
        }
        
        // 6. 기존 데이터 삭제
        this.deleteSavedTexts(oldUsername);
        this.deleteTempSave(oldUsername);
        
        // 7. 로그 기록
        this.logMigrationSuccess(oldUsername, newEmail);
        
        return { success: true, itemCount: savedTexts.length };
        
    } catch (error) {
        // 롤백
        await this.rollbackMigration(backup);
        this.logMigrationFailure(error);
        return { success: false, error: error.message };
    }
}
```

### 데이터 무결성 검증

```javascript
validateData(savedTexts, tempSave) {
    // 저장된 글 검증
    if (!Array.isArray(savedTexts)) return false;
    
    for (const text of savedTexts) {
        if (!text.id || !text.content || !text.date) {
            return false;
        }
    }
    
    // 임시 저장 검증
    if (tempSave && typeof tempSave !== 'object') {
        return false;
    }
    
    return true;
}
```

## 지원 및 문의

마이그레이션 관련 문제가 있으면:
1. 브라우저 콘솔의 오류 메시지 확인
2. 백업 데이터 존재 여부 확인
3. GitHub Issues에 문제 보고
4. 오류 로그 및 마이그레이션 로그 첨부

---

**마지막 업데이트**: 2025-10-25  
**버전**: 1.0.0
