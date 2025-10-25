// Google OAuth 설정 파일
class AuthConfig {
    constructor() {
        // 환경 감지 (강화됨)
        this.isDevelopment = this.detectEnvironment();
        this.protocol = window.location.protocol;
        this.hostname = window.location.hostname;
        this.port = window.location.port;
        
        // Google OAuth 설정
        this.GOOGLE_CLIENT_ID = this.getClientIdForEnvironment();
        
        this.OAUTH_SCOPES = ['profile', 'email'];
        this.TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5분
        
        // 데이터 관리 설정
        this.MIGRATION_BACKUP_KEY = 'dualTextWriter_migration_backup';
        this.AUTO_SAVE_INTERVAL = 5000; // 5초
        this.TEMP_SAVE_DELAY = 2000; // 2초
        
        // 보안 설정
        this.MAX_LOGIN_ATTEMPTS = 3;
        this.SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24시간
        
        // UI 설정
        this.NOTIFICATION_DURATION = {
            success: 2000,
            error: 4000,
            warning: 3000,
            info: 2000
        };
        
        // 검증 결과 캐싱
        this.validationResult = null;
    }
    
    // 환경 감지 로직 (강화됨)
    detectEnvironment() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // 개발 환경 감지: localhost, 127.0.0.1, file:// 프로토콜
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isFileProtocol = protocol === 'file:';
        const isLocalIP = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || 
                         /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
        
        return isLocalhost || isFileProtocol || isLocalIP;
    }
    
    // 환경별 Client ID 반환
    getClientIdForEnvironment() {
        if (this.isDevelopment) {
            // 개발 환경 Client ID
            // 예시: '123456789-abc123def456.apps.googleusercontent.com'
            return 'YOUR_DEVELOPMENT_CLIENT_ID';
        } else {
            // 프로덕션 환경 Client ID
            // 예시: '987654321-xyz789uvw456.apps.googleusercontent.com'
            return 'YOUR_PRODUCTION_CLIENT_ID';
        }
    }
    
    // 폴백 설정 옵션
    getFallbackConfig() {
        return {
            enableFallbackLogin: true,  // 기존 사용자명 로그인 활성화
            fallbackMessage: 'Google 로그인을 사용할 수 없습니다. 기존 방식으로 로그인해주세요.',
            showSetupInstructions: true,  // 설정 안내 표시
            allowOfflineMode: true  // 오프라인 모드 허용
        };
    }
    
    // 다양한 배포 시나리오 예시
    getDeploymentExamples() {
        return {
            localhost: {
                description: '로컬 개발 환경',
                origins: ['http://localhost', 'http://localhost:3000', 'http://127.0.0.1'],
                redirectUri: 'http://localhost/callback',
                httpsRequired: false
            },
            githubPages: {
                description: 'GitHub Pages 배포',
                origins: ['https://username.github.io'],
                redirectUri: 'https://username.github.io/500text_threads/callback',
                httpsRequired: true
            },
            customDomain: {
                description: '커스텀 도메인 배포',
                origins: ['https://yourdomain.com', 'https://www.yourdomain.com'],
                redirectUri: 'https://yourdomain.com/callback',
                httpsRequired: true
            },
            vercel: {
                description: 'Vercel 배포',
                origins: ['https://your-app.vercel.app'],
                redirectUri: 'https://your-app.vercel.app/callback',
                httpsRequired: true
            },
            netlify: {
                description: 'Netlify 배포',
                origins: ['https://your-app.netlify.app'],
                redirectUri: 'https://your-app.netlify.app/callback',
                httpsRequired: true
            }
        };
    }
    
    // 프로덕션 환경 HTTPS 검증
    validateProductionEnvironment() {
        if (!this.isDevelopment && this.protocol !== 'https:') {
            return {
                valid: false,
                error: 'HTTPS_REQUIRED',
                message: '프로덕션 환경에서는 HTTPS가 필수입니다.'
            };
        }
        return { valid: true };
    }
    
    // Google Client ID 형식 검증
    validateClientIdFormat() {
        const clientId = this.GOOGLE_CLIENT_ID;
        
        // 플레이스홀더 값 확인
        if (clientId.includes('YOUR_')) {
            return {
                valid: false,
                error: 'PLACEHOLDER_VALUE',
                message: 'Google Client ID가 설정되지 않았습니다. 플레이스홀더 값을 실제 Client ID로 교체해주세요.'
            };
        }
        
        // 빈 값 확인
        if (!clientId || clientId.trim() === '') {
            return {
                valid: false,
                error: 'EMPTY_CLIENT_ID',
                message: 'Google Client ID가 비어있습니다.'
            };
        }
        
        // Google Client ID 형식 검증 (.googleusercontent.com으로 끝나야 함)
        if (!clientId.endsWith('.googleusercontent.com')) {
            return {
                valid: false,
                error: 'INVALID_FORMAT',
                message: 'Google Client ID 형식이 올바르지 않습니다. Client ID는 ".googleusercontent.com"으로 끝나야 합니다.'
            };
        }
        
        return { valid: true };
    }
    
    // 포괄적인 Google OAuth 설정 검증
    validateGoogleConfig() {
        // 캐시된 결과가 있으면 반환
        if (this.validationResult !== null) {
            return this.validationResult.valid;
        }
        
        // 프로덕션 환경 검증
        const envValidation = this.validateProductionEnvironment();
        if (!envValidation.valid) {
            this.validationResult = envValidation;
            console.error('❌ 환경 검증 실패:', envValidation.message);
            return false;
        }
        
        // Client ID 형식 검증
        const formatValidation = this.validateClientIdFormat();
        if (!formatValidation.valid) {
            this.validationResult = formatValidation;
            console.warn('⚠️ Client ID 검증 실패:', formatValidation.message);
            return false;
        }
        
        // 모든 검증 통과
        this.validationResult = { valid: true };
        console.log('✅ Google OAuth 설정 검증 완료');
        return true;
    }
    
    // 검증 오류 메시지 반환
    getValidationError() {
        if (!this.validationResult || this.validationResult.valid) {
            return null;
        }
        
        return {
            error: this.validationResult.error,
            message: this.validationResult.message,
            instructions: this.getErrorSpecificInstructions(this.validationResult.error)
        };
    }
    
    // 오류 유형별 구체적인 안내
    getErrorSpecificInstructions(errorType) {
        const instructions = {
            'HTTPS_REQUIRED': `
프로덕션 환경에서는 보안을 위해 HTTPS가 필수입니다.

해결 방법:
1. SSL 인증서를 설치하여 HTTPS를 활성화하세요
2. 또는 개발 환경에서 테스트하세요 (http://localhost)
            `,
            'PLACEHOLDER_VALUE': `
Google Client ID가 아직 설정되지 않았습니다.

해결 방법:
1. Google Cloud Console (https://console.cloud.google.com)에 접속
2. 프로젝트를 생성하거나 선택
3. "API 및 서비스" > "사용자 인증 정보"로 이동
4. "OAuth 2.0 클라이언트 ID" 생성
5. 생성된 Client ID를 config/auth-config.js 파일에 설정
            `,
            'EMPTY_CLIENT_ID': `
Google Client ID가 비어있습니다.

해결 방법:
1. config/auth-config.js 파일을 확인
2. GOOGLE_CLIENT_ID 값이 올바르게 설정되어 있는지 확인
            `,
            'INVALID_FORMAT': `
Google Client ID 형식이 올바르지 않습니다.

올바른 형식: "123456789-abcdefg.apps.googleusercontent.com"

해결 방법:
1. Google Cloud Console에서 생성한 Client ID를 다시 확인
2. 전체 Client ID를 복사하여 붙여넣기
3. ".googleusercontent.com"으로 끝나는지 확인
            `
        };
        
        return instructions[errorType] || '알 수 없는 오류입니다.';
    }
    
    // 환경별 설정 반환
    getEnvironmentConfig() {
        const currentOrigin = window.location.origin;
        
        return {
            environment: this.isDevelopment ? 'development' : 'production',
            protocol: this.protocol,
            hostname: this.hostname,
            port: this.port,
            origin: currentOrigin,
            clientId: this.GOOGLE_CLIENT_ID,
            scopes: this.OAUTH_SCOPES,
            isValid: this.validateGoogleConfig(),
            allowedOrigins: this.getAllowedOrigins(),
            redirectUri: this.getRedirectUri()
        };
    }
    
    // 허용된 원본 목록
    getAllowedOrigins() {
        if (this.isDevelopment) {
            return [
                'http://localhost',
                'http://localhost:3000',
                'http://localhost:8080',
                'http://localhost:5500',
                'http://127.0.0.1',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:8080',
                'http://127.0.0.1:5500'
            ];
        } else {
            // 프로덕션: 실제 도메인으로 교체 필요
            return [
                'https://yourdomain.com',
                'https://www.yourdomain.com'
            ];
        }
    }
    
    // 리디렉션 URI
    getRedirectUri() {
        return window.location.origin + '/callback';
    }
    
    // 포괄적인 설정 안내 생성기
    getSetupInstructions() {
        const config = this.getEnvironmentConfig();
        const validationError = this.getValidationError();
        const deploymentExamples = this.getDeploymentExamples();
        
        let instructions = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Google OAuth 2.0 설정 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 현재 환경 정보:
  • 환경: ${config.environment === 'development' ? '개발 (Development)' : '프로덕션 (Production)'}
  • 프로토콜: ${config.protocol}
  • 호스트: ${config.hostname}${config.port ? ':' + config.port : ''}
  • 원본: ${config.origin}
  • 설정 상태: ${config.isValid ? '✅ 완료' : '❌ 미완료'}

`;

        if (validationError) {
            instructions += `
⚠️ 설정 오류:
  ${validationError.message}

${validationError.instructions}

`;
        }

        instructions += `
📋 Google Cloud Console 설정 단계:

1️⃣ Google Cloud Console 접속
   https://console.cloud.google.com

2️⃣ 프로젝트 생성 또는 선택
   • 프로젝트 이름: "500text-writer" (또는 원하는 이름)

3️⃣ OAuth 동의 화면 구성
   • "API 및 서비스" > "OAuth 동의 화면"
   • 사용자 유형: 외부 (External)
   • 앱 이름, 사용자 지원 이메일 입력
   • 범위 추가: profile, email

4️⃣ OAuth 2.0 클라이언트 ID 생성
   • "API 및 서비스" > "사용자 인증 정보"
   • "+ 사용자 인증 정보 만들기" > "OAuth 클라이언트 ID"
   • 애플리케이션 유형: 웹 애플리케이션

5️⃣ 승인된 JavaScript 원본 추가
`;

        if (this.isDevelopment) {
            instructions += `   개발 환경용:
   • http://localhost
   • http://localhost:3000
   • http://localhost:8080
   • http://127.0.0.1
   • http://127.0.0.1:3000
`;
        } else {
            instructions += `   프로덕션 환경용:
   • ${config.origin}
   • https://www.yourdomain.com (www 서브도메인 사용 시)
`;
        }

        instructions += `
6️⃣ 승인된 리디렉션 URI 추가
   • ${config.redirectUri}

7️⃣ 생성된 클라이언트 ID 복사
   • 형식: "123456789-abcdefg.apps.googleusercontent.com"

8️⃣ config/auth-config.js 파일 수정
   • ${this.isDevelopment ? 'YOUR_DEVELOPMENT_CLIENT_ID' : 'YOUR_PRODUCTION_CLIENT_ID'}를
   • 복사한 Client ID로 교체

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 배포 시나리오별 설정 예시:

`;

        // 현재 환경에 맞는 배포 예시 표시
        const relevantScenarios = this.isDevelopment 
            ? ['localhost'] 
            : ['githubPages', 'customDomain', 'vercel', 'netlify'];
        
        relevantScenarios.forEach(scenario => {
            const example = deploymentExamples[scenario];
            instructions += `
${example.description}:
  • JavaScript 원본: ${example.origins.join(', ')}
  • 리디렉션 URI: ${example.redirectUri}
  • HTTPS 필수: ${example.httpsRequired ? '예' : '아니오'}
`;
        });

        instructions += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 도움말:
  • 설정 후 페이지를 새로고침하세요
  • 문제가 지속되면 브라우저 콘솔을 확인하세요
  • 자세한 가이드: docs/google-cloud-setup-guide.md
  • 테스트 도구: test-oauth.html

🔄 폴백 옵션:
  • Google 로그인 실패 시 기존 사용자명 로그인 사용 가능
  • 오프라인 모드에서도 기본 기능 사용 가능
  • 데이터는 로컬 스토리지에 안전하게 보관됨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        return instructions;
    }
    
    // 설정이 유효한지 확인
    isConfigurationValid() {
        return this.validateGoogleConfig();
    }
}

// 전역 설정 인스턴스
window.AUTH_CONFIG = new AuthConfig();