/**
 * Jest 설정 파일
 * 브라우저 환경 시뮬레이션을 위한 설정
 */

module.exports = {
    // 테스트 환경: jsdom (브라우저 환경 시뮬레이션)
    testEnvironment: 'jsdom',
    
    // 테스트 파일 패턴
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js'
    ],
    
    // 모듈 파일 확장자
    moduleFileExtensions: ['js', 'json'],
    
    // 변환 설정 (필요시)
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    
    // 모킹할 모듈
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1'
    },
    
    // 커버리지 설정
    collectCoverageFrom: [
        'script.js',
        '!**/node_modules/**',
        '!**/tests/**'
    ],
    
    // 테스트 타임아웃 (밀리초)
    testTimeout: 10000,
    
    // 설정 파일
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    
    // 글로벌 변수
    globals: {
        'DualTextWriter': {
            CONFIG: {
                EXPAND_MODE_ANIMATION_DELAY: 150
            }
        }
    }
};

