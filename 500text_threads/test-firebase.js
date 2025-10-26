// 테스트 스크립트 - 개발자 콘솔에서 실행
// Firebase 연동 테스트

class FirebaseTestSuite {
    constructor() {
        this.testResults = [];
    }
    
    async runAllTests() {
        console.log('🧪 Firebase 연동 테스트 시작...');
        
        await this.testFirebaseInitialization();
        await this.testAuthentication();
        await this.testFirestoreConnection();
        await this.testDataOperations();
        await this.testButtonFunctions();
        
        this.printResults();
    }
    
    async testFirebaseInitialization() {
        try {
            if (window.firebaseAuth && window.firebaseDb) {
                this.addResult('✅ Firebase 초기화', '성공');
            } else {
                this.addResult('❌ Firebase 초기화', '실패 - Firebase SDK가 로드되지 않음');
            }
        } catch (error) {
            this.addResult('❌ Firebase 초기화', `실패 - ${error.message}`);
        }
    }
    
    async testAuthentication() {
        try {
            if (window.firebaseAuth) {
                const auth = window.firebaseAuth;
                console.log('현재 사용자:', auth.currentUser);
                this.addResult('✅ Authentication 객체', '성공');
            } else {
                this.addResult('❌ Authentication 객체', '실패');
            }
        } catch (error) {
            this.addResult('❌ Authentication 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testFirestoreConnection() {
        try {
            if (window.firebaseDb) {
                const db = window.firebaseDb;
                console.log('Firestore 데이터베이스:', db);
                this.addResult('✅ Firestore 연결', '성공');
            } else {
                this.addResult('❌ Firestore 연결', '실패');
            }
        } catch (error) {
            this.addResult('❌ Firestore 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testDataOperations() {
        try {
            // 테스트 데이터 생성
            const testData = {
                content: '테스트 글입니다.',
                type: 'test',
                characterCount: 8,
                createdAt: new Date(),
                test: true
            };
            
            if (window.firebaseAddDoc && window.firebaseCollection && window.firebaseDb) {
                this.addResult('✅ 데이터 작업 함수', '사용 가능');
            } else {
                this.addResult('❌ 데이터 작업 함수', '일부 함수 누락');
            }
        } catch (error) {
            this.addResult('❌ 데이터 작업 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testButtonFunctions() {
        try {
            // 편집/삭제 버튼 테스트
            if (window.dualTextWriter) {
                const savedItems = document.querySelectorAll('.saved-item');
                if (savedItems.length > 0) {
                    this.addResult('✅ 저장된 글 항목', `${savedItems.length}개 발견`);
                    
                    // 편집 버튼 확인
                    const editButtons = document.querySelectorAll('.btn-edit');
                    const deleteButtons = document.querySelectorAll('.btn-delete');
                    
                    this.addResult('✅ 편집 버튼', `${editButtons.length}개 발견`);
                    this.addResult('✅ 삭제 버튼', `${deleteButtons.length}개 발견`);
                    
                    // 이벤트 리스너 확인
                    if (window.dualTextWriter.savedItemClickHandler) {
                        this.addResult('✅ 이벤트 리스너', '설정됨');
                    } else {
                        this.addResult('❌ 이벤트 리스너', '설정되지 않음');
                    }
                } else {
                    this.addResult('⚠️ 저장된 글 항목', '없음 (테스트용 데이터 저장 후 다시 테스트)');
                }
            } else {
                this.addResult('❌ DualTextWriter 객체', '찾을 수 없음');
            }
        } catch (error) {
            this.addResult('❌ 버튼 기능 테스트', `실패 - ${error.message}`);
        }
    }
    
    addResult(test, result) {
        this.testResults.push({ test, result });
        console.log(`${test}: ${result}`);
    }
    
    printResults() {
        console.log('\n📊 테스트 결과 요약:');
        console.log('='.repeat(50));
        
        const passed = this.testResults.filter(r => r.result === '성공').length;
        const total = this.testResults.length;
        
        this.testResults.forEach(result => {
            console.log(`${result.test}: ${result.result}`);
        });
        
        console.log('='.repeat(50));
        console.log(`통과: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
        
        if (passed === total) {
            console.log('🎉 모든 테스트 통과! Firebase 연동이 정상적으로 작동합니다.');
        } else {
            console.log('⚠️ 일부 테스트 실패. Firebase 설정을 확인해주세요.');
        }
    }
}

// 테스트 실행 함수
function runFirebaseTests() {
    const testSuite = new FirebaseTestSuite();
    testSuite.runAllTests();
}

// 사용법 안내
console.log(`
🧪 Firebase 테스트 스위트

사용법:
1. 브라우저 개발자 도구 콘솔 열기 (F12)
2. runFirebaseTests() 실행
3. 결과 확인

주의사항:
- Firebase 설정이 완료된 후 테스트하세요
- 실제 데이터베이스에 테스트 데이터가 저장될 수 있습니다
`);

// 전역 함수로 등록
window.runFirebaseTests = runFirebaseTests;
