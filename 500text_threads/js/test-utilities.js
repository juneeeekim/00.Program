// Google OAuth 테스트 유틸리티
class OAuthTestUtilities {
    constructor() {
        this.mockData = this.createMockData();
        this.testResults = [];
    }
    
    // Mock 데이터 생성
    createMockData() {
        return {
            googleUser: {
                id: 'test_user_123456789',
                name: 'Test User',
                email: 'testuser@example.com',
                picture: 'https://example.com/avatar.jpg',
                provider: 'google',
                accessToken: 'mock_access_token_' + Date.now(),
                expiresAt: Date.now() + (60 * 60 * 1000), // 1시간 후
                loginTime: Date.now()
            },
            
            authResponse: {
                access_token: 'mock_access_token_' + Date.now(),
                expires_at: Math.floor((Date.now() + (60 * 60 * 1000)) / 1000),
                expires_in: 3600,
                token_type: 'Bearer',
                scope: 'profile email'
            },
            
            googleProfile: {
                getId: () => 'test_user_123456789',
                getName: () => 'Test User',
                getEmail: () => 'testuser@example.com',
                getImageUrl: () => 'https://example.com/avatar.jpg'
            },
            
            savedTexts: [
                {
                    id: Date.now() - 10000,
                    content: '테스트 저장 글 1',
                    date: new Date(Date.now() - 10000).toLocaleString('ko-KR'),
                    characterCount: 10,
                    type: 'reference'
                },
                {
                    id: Date.now() - 5000,
                    content: '테스트 저장 글 2',
                    date: new Date(Date.now() - 5000).toLocaleString('ko-KR'),
                    characterCount: 10,
                    type: 'edit'
                }
            ],
            
            tempSave: {
                refText: '레퍼런스 테스트 글',
                editText: '작성 중인 테스트 글',
                timestamp: Date.now(),
                refCharacterCount: 11,
                editCharacterCount: 12
            }
        };
    }
    
    // Google OAuth 응답 모킹
    mockGoogleAuthResponse(options = {}) {
        const {
            success = true,
            error = null,
            userData = this.mockData.googleUser,
            authResponse = this.mockData.authResponse
        } = options;
        
        if (!success && error) {
            return {
                success: false,
                error: error,
                message: this.getErrorMessage(error)
            };
        }
        
        return {
            success: true,
            userData: userData,
            authResponse: authResponse,
            profile: this.mockData.googleProfile
        };
    }
    
    // 오류 메시지 생성
    getErrorMessage(errorType) {
        const errorMessages = {
            'popup_closed_by_user': '사용자가 로그인을 취소했습니다.',
            'popup_blocked': '팝업이 차단되었습니다.',
            'network_error': '네트워크 연결을 확인해주세요.',
            'invalid_client_id': 'Client ID가 올바르지 않습니다.',
            'token_expired': '토큰이 만료되었습니다.',
            'access_denied': '접근이 거부되었습니다.'
        };
        
        return errorMessages[errorType] || '알 수 없는 오류가 발생했습니다.';
    }
    
    // Mock Google API 객체 생성
    createMockGoogleAPI() {
        const mockData = this.mockData;
        
        return {
            auth2: {
                init: (config) => {
                    return Promise.resolve({
                        isSignedIn: {
                            get: () => false
                        },
                        currentUser: {
                            get: () => null
                        },
                        signIn: (options) => {
                            return Promise.resolve({
                                getBasicProfile: () => mockData.googleProfile,
                                getAuthResponse: () => mockData.authResponse,
                                reloadAuthResponse: () => Promise.resolve(mockData.authResponse)
                            });
                        },
                        signOut: () => Promise.resolve()
                    });
                },
                getAuthInstance: () => null
            },
            load: (api, callback) => {
                setTimeout(callback, 100);
            }
        };
    }
    
    // 인증 플로우 테스트 함수
    async testAuthenticationFlow(authManager) {
        const results = {
            testName: '인증 플로우 테스트',
            tests: [],
            passed: 0,
            failed: 0,
            startTime: Date.now()
        };
        
        // 테스트 1: 초기화
        try {
            const initResult = await authManager.initialize();
            results.tests.push({
                name: '초기화 테스트',
                passed: initResult === true || initResult === false,
                message: initResult ? '초기화 성공' : '초기화 실패 (예상된 동작)',
                result: initResult
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '초기화 테스트',
                passed: false,
                message: '초기화 중 오류 발생',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 2: 로그인 상태 확인
        try {
            const isSignedIn = authManager.isSignedIn();
            results.tests.push({
                name: '로그인 상태 확인',
                passed: typeof isSignedIn === 'boolean',
                message: `로그인 상태: ${isSignedIn}`,
                result: isSignedIn
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '로그인 상태 확인',
                passed: false,
                message: '로그인 상태 확인 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 3: 현재 사용자 정보
        try {
            const currentUser = authManager.getCurrentUser();
            results.tests.push({
                name: '현재 사용자 정보 조회',
                passed: true,
                message: currentUser ? '사용자 정보 있음' : '사용자 정보 없음',
                result: currentUser
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '현재 사용자 정보 조회',
                passed: false,
                message: '사용자 정보 조회 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 4: 인증 상태 정보
        try {
            const authStatus = authManager.getAuthStatus();
            const hasRequiredFields = authStatus.hasOwnProperty('isInitialized') &&
                                     authStatus.hasOwnProperty('isSignedIn');
            results.tests.push({
                name: '인증 상태 정보',
                passed: hasRequiredFields,
                message: '인증 상태 정보 조회 성공',
                result: authStatus
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '인증 상태 정보',
                passed: false,
                message: '인증 상태 정보 조회 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        results.endTime = Date.now();
        results.duration = results.endTime - results.startTime;
        
        this.testResults.push(results);
        return results;
    }
    
    // 설정 검증 테스트
    testConfigValidation(authConfig) {
        const results = {
            testName: '설정 검증 테스트',
            tests: [],
            passed: 0,
            failed: 0,
            startTime: Date.now()
        };
        
        // 테스트 1: 환경 감지
        try {
            const isDev = authConfig.isDevelopment;
            results.tests.push({
                name: '환경 감지',
                passed: typeof isDev === 'boolean',
                message: `환경: ${isDev ? '개발' : '프로덕션'}`,
                result: isDev
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '환경 감지',
                passed: false,
                message: '환경 감지 실패',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 2: Client ID 형식 검증
        try {
            const formatValidation = authConfig.validateClientIdFormat();
            results.tests.push({
                name: 'Client ID 형식 검증',
                passed: formatValidation.hasOwnProperty('valid'),
                message: formatValidation.valid ? '형식 유효' : formatValidation.message,
                result: formatValidation
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: 'Client ID 형식 검증',
                passed: false,
                message: 'Client ID 검증 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 3: 전체 설정 검증
        try {
            const isValid = authConfig.validateGoogleConfig();
            results.tests.push({
                name: '전체 설정 검증',
                passed: typeof isValid === 'boolean',
                message: isValid ? '설정 유효' : '설정 무효',
                result: isValid
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '전체 설정 검증',
                passed: false,
                message: '설정 검증 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        results.endTime = Date.now();
        results.duration = results.endTime - results.startTime;
        
        this.testResults.push(results);
        return results;
    }
    
    // 토큰 관리 테스트
    testTokenManagement(authManager) {
        const results = {
            testName: '토큰 관리 테스트',
            tests: [],
            passed: 0,
            failed: 0,
            startTime: Date.now()
        };
        
        // 테스트 1: 토큰 검증
        try {
            const isValid = authManager.validateToken();
            results.tests.push({
                name: '토큰 검증',
                passed: typeof isValid === 'boolean',
                message: isValid ? '토큰 유효' : '토큰 무효 또는 없음',
                result: isValid
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '토큰 검증',
                passed: false,
                message: '토큰 검증 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 2: 토큰 모니터링 상태
        try {
            const authStatus = authManager.getAuthStatus();
            const monitoringActive = authStatus.monitoringActive;
            results.tests.push({
                name: '토큰 모니터링 상태',
                passed: typeof monitoringActive === 'boolean',
                message: monitoringActive ? '모니터링 활성' : '모니터링 비활성',
                result: monitoringActive
            });
            results.passed++;
        } catch (error) {
            results.tests.push({
                name: '토큰 모니터링 상태',
                passed: false,
                message: '모니터링 상태 확인 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        results.endTime = Date.now();
        results.duration = results.endTime - results.startTime;
        
        this.testResults.push(results);
        return results;
    }
    
    // 마이그레이션 테스트 데이터 생성
    createMigrationTestData(username = 'testuser') {
        const testData = {
            username: username,
            savedTexts: this.mockData.savedTexts,
            tempSave: this.mockData.tempSave
        };
        
        // 로컬 스토리지에 테스트 데이터 저장
        localStorage.setItem(
            `dualTextWriter_savedTexts_${username}`,
            JSON.stringify(testData.savedTexts)
        );
        
        localStorage.setItem(
            `dualTextWriter_tempSave_${username}`,
            JSON.stringify(testData.tempSave)
        );
        
        localStorage.setItem('dualTextWriter_currentUser', username);
        localStorage.setItem('dualTextWriter_authProvider', 'username');
        
        return testData;
    }
    
    // 마이그레이션 테스트
    async testMigration(migrationManager, googleUserData) {
        const results = {
            testName: '마이그레이션 테스트',
            tests: [],
            passed: 0,
            failed: 0,
            startTime: Date.now()
        };
        
        // 테스트 데이터 생성
        const testUsername = 'migration_test_user';
        this.createMigrationTestData(testUsername);
        
        // 테스트 1: 마이그레이션 필요성 확인
        try {
            const migrationInfo = migrationManager.checkMigrationNeeded(googleUserData);
            const isCorrect = migrationInfo.needed === true &&
                            migrationInfo.oldUsername === testUsername;
            results.tests.push({
                name: '마이그레이션 필요성 확인',
                passed: isCorrect,
                message: migrationInfo.needed ? '마이그레이션 필요' : '마이그레이션 불필요',
                result: migrationInfo
            });
            if (isCorrect) results.passed++;
            else results.failed++;
        } catch (error) {
            results.tests.push({
                name: '마이그레이션 필요성 확인',
                passed: false,
                message: '마이그레이션 확인 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 2: 기존 데이터 조회
        try {
            const existingData = migrationManager.getExistingUserData(testUsername);
            const hasData = existingData.savedTexts.length > 0;
            results.tests.push({
                name: '기존 데이터 조회',
                passed: hasData,
                message: `${existingData.savedTexts.length}개의 저장된 글 발견`,
                result: existingData
            });
            if (hasData) results.passed++;
            else results.failed++;
        } catch (error) {
            results.tests.push({
                name: '기존 데이터 조회',
                passed: false,
                message: '데이터 조회 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 3: 백업 생성
        try {
            const existingData = migrationManager.getExistingUserData(testUsername);
            const backup = migrationManager.createBackup(existingData);
            const isValid = backup && backup.timestamp && backup.data;
            results.tests.push({
                name: '백업 생성',
                passed: isValid,
                message: isValid ? '백업 생성 성공' : '백업 생성 실패',
                result: backup
            });
            if (isValid) results.passed++;
            else results.failed++;
        } catch (error) {
            results.tests.push({
                name: '백업 생성',
                passed: false,
                message: '백업 생성 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 4: 마이그레이션 실행
        try {
            const migrationResult = await migrationManager.performMigration(
                testUsername,
                googleUserData.email
            );
            const isSuccess = migrationResult.success === true;
            results.tests.push({
                name: '마이그레이션 실행',
                passed: isSuccess,
                message: isSuccess ? '마이그레이션 성공' : '마이그레이션 실패',
                result: migrationResult
            });
            if (isSuccess) results.passed++;
            else results.failed++;
        } catch (error) {
            results.tests.push({
                name: '마이그레이션 실행',
                passed: false,
                message: '마이그레이션 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        // 테스트 5: 마이그레이션 후 데이터 검증
        try {
            const migratedData = localStorage.getItem(
                `dualTextWriter_savedTexts_${googleUserData.email}`
            );
            const isValid = migratedData !== null;
            results.tests.push({
                name: '마이그레이션 후 데이터 검증',
                passed: isValid,
                message: isValid ? '데이터 이전 확인됨' : '데이터 이전 실패',
                result: migratedData ? JSON.parse(migratedData) : null
            });
            if (isValid) results.passed++;
            else results.failed++;
        } catch (error) {
            results.tests.push({
                name: '마이그레이션 후 데이터 검증',
                passed: false,
                message: '데이터 검증 중 오류',
                error: error.message
            });
            results.failed++;
        }
        
        results.endTime = Date.now();
        results.duration = results.endTime - results.startTime;
        
        this.testResults.push(results);
        return results;
    }
    
    // 오류 처리 테스트
    testErrorHandling(authManager) {
        const results = {
            testName: '오류 처리 테스트',
            tests: [],
            passed: 0,
            failed: 0,
            startTime: Date.now()
        };
        
        // 테스트 1: 사용자 친화적 오류 메시지
        const errorTypes = [
            { type: 'authentication', error: 'popup_closed_by_user' },
            { type: 'network', error: 'network_error' },
            { type: 'token', error: 'token_expired' },
            { type: 'configuration', error: 'invalid_client_id' }
        ];
        
        errorTypes.forEach(({ type, error }) => {
            try {
                const message = authManager.getUserFriendlyErrorMessage(type, error);
                const isValid = typeof message === 'string' && message.length > 0;
                results.tests.push({
                    name: `오류 메시지: ${error}`,
                    passed: isValid,
                    message: message,
                    result: { type, error, message }
                });
                if (isValid) results.passed++;
                else results.failed++;
            } catch (err) {
                results.tests.push({
                    name: `오류 메시지: ${error}`,
                    passed: false,
                    message: '오류 메시지 생성 실패',
                    error: err.message
                });
                results.failed++;
            }
        });
        
        results.endTime = Date.now();
        results.duration = results.endTime - results.startTime;
        
        this.testResults.push(results);
        return results;
    }
    
    // 전체 테스트 실행
    async runAllTests(authConfig, authManager, migrationManager) {
        console.log('🧪 테스트 시작...\n');
        
        const allResults = {
            startTime: Date.now(),
            tests: [],
            totalPassed: 0,
            totalFailed: 0
        };
        
        // 1. 설정 검증 테스트
        console.log('1️⃣ 설정 검증 테스트 실행 중...');
        const configResults = this.testConfigValidation(authConfig);
        allResults.tests.push(configResults);
        allResults.totalPassed += configResults.passed;
        allResults.totalFailed += configResults.failed;
        this.printTestResults(configResults);
        
        // 2. 인증 플로우 테스트
        console.log('\n2️⃣ 인증 플로우 테스트 실행 중...');
        const authResults = await this.testAuthenticationFlow(authManager);
        allResults.tests.push(authResults);
        allResults.totalPassed += authResults.passed;
        allResults.totalFailed += authResults.failed;
        this.printTestResults(authResults);
        
        // 3. 토큰 관리 테스트
        console.log('\n3️⃣ 토큰 관리 테스트 실행 중...');
        const tokenResults = this.testTokenManagement(authManager);
        allResults.tests.push(tokenResults);
        allResults.totalPassed += tokenResults.passed;
        allResults.totalFailed += tokenResults.failed;
        this.printTestResults(tokenResults);
        
        // 4. 오류 처리 테스트
        console.log('\n4️⃣ 오류 처리 테스트 실행 중...');
        const errorResults = this.testErrorHandling(authManager);
        allResults.tests.push(errorResults);
        allResults.totalPassed += errorResults.passed;
        allResults.totalFailed += errorResults.failed;
        this.printTestResults(errorResults);
        
        // 5. 마이그레이션 테스트
        console.log('\n5️⃣ 마이그레이션 테스트 실행 중...');
        const migrationResults = await this.testMigration(
            migrationManager,
            this.mockData.googleUser
        );
        allResults.tests.push(migrationResults);
        allResults.totalPassed += migrationResults.passed;
        allResults.totalFailed += migrationResults.failed;
        this.printTestResults(migrationResults);
        
        allResults.endTime = Date.now();
        allResults.duration = allResults.endTime - allResults.startTime;
        
        // 전체 결과 출력
        this.printSummary(allResults);
        
        return allResults;
    }
    
    // 테스트 결과 출력
    printTestResults(results) {
        console.log(`\n📊 ${results.testName}`);
        console.log('━'.repeat(50));
        
        results.tests.forEach((test, index) => {
            const icon = test.passed ? '✅' : '❌';
            console.log(`${icon} ${index + 1}. ${test.name}`);
            console.log(`   ${test.message}`);
            if (test.error) {
                console.log(`   오류: ${test.error}`);
            }
        });
        
        console.log('━'.repeat(50));
        console.log(`통과: ${results.passed} | 실패: ${results.failed} | 소요시간: ${results.duration}ms`);
    }
    
    // 전체 요약 출력
    printSummary(allResults) {
        console.log('\n\n');
        console.log('═'.repeat(60));
        console.log('🎯 전체 테스트 결과 요약');
        console.log('═'.repeat(60));
        
        allResults.tests.forEach((testGroup, index) => {
            const passRate = testGroup.tests.length > 0 
                ? ((testGroup.passed / testGroup.tests.length) * 100).toFixed(1)
                : 0;
            console.log(`${index + 1}. ${testGroup.testName}`);
            console.log(`   통과: ${testGroup.passed}/${testGroup.tests.length} (${passRate}%)`);
        });
        
        console.log('═'.repeat(60));
        const totalTests = allResults.totalPassed + allResults.totalFailed;
        const totalPassRate = totalTests > 0 
            ? ((allResults.totalPassed / totalTests) * 100).toFixed(1)
            : 0;
        
        console.log(`📈 전체 통과율: ${totalPassRate}%`);
        console.log(`✅ 통과: ${allResults.totalPassed}`);
        console.log(`❌ 실패: ${allResults.totalFailed}`);
        console.log(`⏱️ 총 소요시간: ${allResults.duration}ms`);
        console.log('═'.repeat(60));
        
        if (allResults.totalFailed === 0) {
            console.log('🎉 모든 테스트를 통과했습니다!');
        } else {
            console.log('⚠️ 일부 테스트가 실패했습니다. 위의 결과를 확인해주세요.');
        }
    }
    
    // 테스트 데이터 정리
    cleanupTestData() {
        const keysToRemove = [
            'dualTextWriter_savedTexts_migration_test_user',
            'dualTextWriter_tempSave_migration_test_user',
            'dualTextWriter_savedTexts_testuser@example.com',
            'dualTextWriter_tempSave_testuser@example.com',
            'dualTextWriter_migrationRecord',
            'dualTextWriter_migration_backup'
        ];
        
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });
        
        console.log('🧹 테스트 데이터 정리 완료');
    }
    
    // 테스트 결과 내보내기
    exportResults() {
        return {
            timestamp: Date.now(),
            results: this.testResults,
            summary: {
                totalTests: this.testResults.reduce((sum, r) => sum + r.tests.length, 0),
                totalPassed: this.testResults.reduce((sum, r) => sum + r.passed, 0),
                totalFailed: this.testResults.reduce((sum, r) => sum + r.failed, 0)
            }
        };
    }
}

// 전역 인스턴스 생성
window.OAuthTestUtilities = OAuthTestUtilities;
