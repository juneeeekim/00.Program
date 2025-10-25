# Google Cloud Console 설정 가이드

## 1. Google Cloud 프로젝트 생성

### 단계별 설정
1. **Google Cloud Console 접속**
   - https://console.cloud.google.com 방문
   - Google 계정으로 로그인

2. **새 프로젝트 생성**
   ```
   1. 상단 프로젝트 선택 드롭다운 클릭
   2. "새 프로젝트" 선택
   3. 프로젝트 이름: "500text-writer" 입력
   4. "만들기" 클릭
   ```

3. **프로젝트 선택 확인**
   - 생성된 프로젝트가 선택되었는지 확인

## 2. OAuth 2.0 클라이언트 ID 생성

### API 및 서비스 활성화
1. **Google Identity Services API 활성화**
   ```
   1. 좌측 메뉴 > "API 및 서비스" > "라이브러리"
   2. "Google Identity Services API" 검색
   3. "사용 설정" 클릭
   ```

### OAuth 동의 화면 설정
1. **동의 화면 구성**
   ```
   1. 좌측 메뉴 > "API 및 서비스" > "OAuth 동의 화면"
   2. 사용자 유형: "외부" 선택 (개인 개발자)
   3. "만들기" 클릭
   ```

2. **앱 정보 입력**
   ```
   앱 이름: "500자 미만 글 작성기"
   사용자 지원 이메일: [개발자 이메일]
   앱 로고: (선택사항)
   앱 도메인: 
     - 애플리케이션 홈페이지: http://localhost:3000 (개발용)
     - 개인정보처리방침: (선택사항)
     - 서비스 약관: (선택사항)
   개발자 연락처 정보: [개발자 이메일]
   ```

3. **범위 설정**
   ```
   1. "범위 추가 또는 삭제" 클릭
   2. 다음 범위 선택:
      - ../auth/userinfo.email
      - ../auth/userinfo.profile
      - openid
   3. "업데이트" 클릭
   ```

### 클라이언트 ID 생성
1. **사용자 인증 정보 만들기**
   ```
   1. 좌측 메뉴 > "API 및 서비스" > "사용자 인증 정보"
   2. "+ 사용자 인증 정보 만들기" > "OAuth 클라이언트 ID"
   3. 애플리케이션 유형: "웹 애플리케이션"
   ```

2. **웹 클라이언트 설정**
   ```
   이름: "500text-writer-web-client"
   
   승인된 자바스크립트 원본:
   - http://localhost:3000 (개발용)
   - http://localhost:8080 (개발용)
   - http://127.0.0.1:3000 (개발용)
   - https://yourdomain.com (프로덕션용 - 나중에 추가)
   
   승인된 리디렉션 URI:
   - http://localhost:3000 (개발용)
   - http://localhost:8080 (개발용)
   - https://yourdomain.com (프로덕션용 - 나중에 추가)
   ```

3. **클라이언트 ID 저장**
   - 생성된 클라이언트 ID를 안전한 곳에 복사하여 저장
   - 형식: `123456789-abcdefghijklmnop.apps.googleusercontent.com`

## 3. 보안 설정

### API 키 제한 (선택사항)
```
1. "API 키" 생성 (필요시)
2. "키 제한" 설정:
   - HTTP 리퍼러 제한
   - API 제한 설정
```

### 테스트 사용자 추가 (개발 단계)
```
1. OAuth 동의 화면 > "테스트 사용자"
2. 개발/테스트용 Google 계정 이메일 추가
3. 최대 100명까지 추가 가능
```

## 4. 환경별 설정

### 개발 환경
```javascript
// config/development.js
const DEVELOPMENT_CONFIG = {
    GOOGLE_CLIENT_ID: 'your-development-client-id',
    ALLOWED_ORIGINS: [
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:3000'
    ]
};
```

### 프로덕션 환경
```javascript
// config/production.js
const PRODUCTION_CONFIG = {
    GOOGLE_CLIENT_ID: 'your-production-client-id',
    ALLOWED_ORIGINS: [
        'https://yourdomain.com',
        'https://www.yourdomain.com'
    ]
};
```

## 5. 검증 체크리스트

### 설정 완료 확인
- [ ] Google Cloud 프로젝트 생성됨
- [ ] Google Identity Services API 활성화됨
- [ ] OAuth 동의 화면 구성 완료
- [ ] OAuth 클라이언트 ID 생성됨
- [ ] 승인된 도메인 설정됨
- [ ] 클라이언트 ID 안전하게 저장됨

### 테스트 준비
- [ ] 테스트 사용자 계정 추가됨
- [ ] 로컬 개발 서버 설정됨
- [ ] HTTPS 인증서 준비됨 (프로덕션용)

## 6. 문제 해결

### 일반적인 오류
```
오류: "redirect_uri_mismatch"
해결: 승인된 리디렉션 URI에 정확한 URL 추가

오류: "unauthorized_client"
해결: OAuth 동의 화면 설정 및 앱 검토 상태 확인

오류: "access_denied"
해결: 테스트 사용자 목록에 계정 추가
```

### 디버깅 팁
```
1. 브라우저 개발자 도구 콘솔 확인
2. Google Cloud Console 로그 확인
3. OAuth 플로우 단계별 검증
```

이 가이드를 따라 Google Cloud Console 설정을 완료한 후, 다음 단계인 클라이언트 코드 구현으로 진행하겠습니다.