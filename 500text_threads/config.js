// Google OAuth 2.0 설정 파일
window.AUTH_CONFIG = {
    // Google OAuth 설정
    GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID', // Google Cloud Console에서 발급받은 실제 클라이언트 ID로 교체 필요
    OAUTH_SCOPES: ['profile', 'email'],
    
    // 토큰 관리 설정
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5분 전 토큰 갱신
    TOKEN_CHECK_INTERVAL: 60 * 1000, // 1분마다 토큰 상태 확인
    
    // 데이터 마이그레이션 설정
    MIGRATION_BACKUP_KEY: 'dualTextWriter_migration_backup',
    LEGACY_AUTH_PROVIDER: 'username',
    GOOGLE_AUTH_PROVIDER: 'google',
    
    // 로컬 스토리지 키
    STORAGE_KEYS: {
        CURRENT_USER: 'dualTextWriter_currentUser',
        USER_DATA: 'dualTextWriter_userData',
        AUTH_PROVIDER: 'dualTextWriter_authProvider',
        SAVED_TEXTS: 'dualTextWriter_savedTexts_',
        TEMP_SAVE: 'dualTextWriter_tempSave_',
        MIGRATION_RECORD: 'dualTextWriter_migrationRecord'
    },
    
    // UI 메시지
    MESSAGES: {
        GOOGLE_LOGIN_SUCCESS: '님, Google 로그인으로 환영합니다!',
        GOOGLE_LOGIN_FAILED: 'Google 로그인에 실패했습니다. 기존 방식으로 로그인해주세요.',
        GOOGLE_UNAVAILABLE: 'Google 로그인을 사용할 수 없습니다. 기존 방식으로 로그인해주세요.',
        SESSION_EXPIRED: '로그인 세션이 만료되었습니다. 다시 로그인해주세요.',
        MIGRATION_SUCCESS: '기존 데이터가 Google 계정으로 성공적으로 이전되었습니다!',
        MIGRATION_FAILED: '데이터 마이그레이션 중 오류가 발생했습니다.',
        LOGOUT_CONFIRM: '로그아웃하시겠습니까? 현재 작성 중인 내용은 임시 저장됩니다.',
        LOGOUT_SUCCESS: '로그아웃되었습니다.'
    }
};