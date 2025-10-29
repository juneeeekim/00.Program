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
        await this.testLLMValidationFeatures();
        await this.testTrackingFeatures();
        
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
    
    async testLLMValidationFeatures() {
        try {
            // LLM 검증 기능 테스트
            if (window.dualTextWriter) {
                // LLM 프롬프트 템플릿 확인
                if (window.dualTextWriter.llmPrompts) {
                    const promptCount = Object.keys(window.dualTextWriter.llmPrompts).length;
                    this.addResult('✅ LLM 프롬프트 템플릿', `${promptCount}개 로드됨`);
                } else {
                    this.addResult('❌ LLM 프롬프트 템플릿', '로드되지 않음');
                }
                
                // LLM 특성 정보 확인
                if (window.dualTextWriter.llmCharacteristics) {
                    const charCount = Object.keys(window.dualTextWriter.llmCharacteristics).length;
                    this.addResult('✅ LLM 특성 정보', `${charCount}개 로드됨 (SNS 후킹 전문가 버전)`);
                } else {
                    this.addResult('❌ LLM 특성 정보', '로드되지 않음');
                }
                
                // LLM URL 패턴 확인
                if (window.dualTextWriter.llmUrls) {
                    const urlCount = Object.keys(window.dualTextWriter.llmUrls).length;
                    this.addResult('✅ LLM URL 패턴', `${urlCount}개 설정됨`);
                } else {
                    this.addResult('❌ LLM URL 패턴', '설정되지 않음');
                }
                
                // LLM 검증 버튼 확인
                const llmButtons = document.querySelectorAll('.llm-option');
                if (llmButtons.length > 0) {
                    this.addResult('✅ LLM 검증 버튼', `${llmButtons.length}개 발견`);
                } else {
                    this.addResult('⚠️ LLM 검증 버튼', '없음 (저장된 글이 있어야 표시됨)');
                }
                
                // 클립보드 API 지원 확인
                if (navigator.clipboard) {
                    this.addResult('✅ 클립보드 API', '지원됨');
                } else {
                    this.addResult('⚠️ 클립보드 API', '지원되지 않음 (폴백 방법 사용)');
                }
                
            } else {
                this.addResult('❌ DualTextWriter 객체', '찾을 수 없음');
            }
        } catch (error) {
            this.addResult('❌ LLM 검증 기능 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testTrackingFeatures() {
        console.log('\n📊 트래킹 기능 테스트 시작...');
        
        try {
            if (!window.dualTextWriter) {
                this.addResult('❌ DualTextWriter 객체', '트래킹 테스트를 위해 필요');
                return;
            }
            
            if (!window.dualTextWriter.currentUser || !window.dualTextWriter.isFirebaseReady) {
                this.addResult('⚠️ 사용자 인증', '로그인 필요 (트래킹 테스트는 로그인 후 실행)');
                return;
            }
            
            // 1. 포스트 생성 테스트
            await this.testPostCreation();
            
            // 2. 메트릭 추가 테스트
            await this.testMetricAddition();
            
            // 3. 트래킹 활성화/비활성화 테스트
            await this.testTrackingToggle();
            
            // 4. 요약 통계 테스트
            await this.testSummaryStatistics();
            
            // 5. 개별 포스트 격리 확인
            await this.testPostIsolation();
            
        } catch (error) {
            this.addResult('❌ 트래킹 기능 테스트', `실패 - ${error.message}`);
            console.error('트래킹 테스트 오류:', error);
        }
    }
    
    async testPostCreation() {
        console.log('  → 포스트 생성 테스트...');
        
        try {
            const writer = window.dualTextWriter;
            const db = writer.db;
            const userId = writer.currentUser.uid;
            
            // 테스트용 포스트 2개 생성
            const postsRef = window.firebaseCollection(db, 'users', userId, 'posts');
            
            const testPost1 = {
                content: '테스트 포스트 1',
                type: 'edit',
                postedAt: window.firebaseServerTimestamp(),
                trackingEnabled: true,
                metrics: [],
                analytics: {},
                createdAt: window.firebaseServerTimestamp(),
                testData: true
            };
            
            const testPost2 = {
                content: '테스트 포스트 2',
                type: 'reference',
                postedAt: window.firebaseServerTimestamp(),
                trackingEnabled: false,
                metrics: [],
                analytics: {},
                createdAt: window.firebaseServerTimestamp(),
                testData: true
            };
            
            const docRef1 = await window.firebaseAddDoc(postsRef, testPost1);
            const docRef2 = await window.firebaseAddDoc(postsRef, testPost2);
            
            this.testPostIds = [docRef1.id, docRef2.id];
            
            // 생성된 포스트 조회
            const post1Ref = window.firebaseDoc(db, 'users', userId, 'posts', docRef1.id);
            const post2Ref = window.firebaseDoc(db, 'users', userId, 'posts', docRef2.id);
            
            const post1Doc = await window.firebaseGetDoc(post1Ref);
            const post2Doc = await window.firebaseGetDoc(post2Ref);
            
            if (post1Doc.exists() && post2Doc.exists()) {
                const post1Data = post1Doc.data();
                const post2Data = post2Doc.data();
                
                // 독립적인 문서인지 확인
                if (post1Data.content !== post2Data.content) {
                    this.addResult('✅ 포스트 독립성', '각 포스트가 독립적인 문서로 생성됨');
                } else {
                    this.addResult('❌ 포스트 독립성', '포스트 데이터가 겹침');
                }
                
                // trackingEnabled 기본값 확인
                if (post1Data.trackingEnabled === true && post2Data.trackingEnabled === false) {
                    this.addResult('✅ trackingEnabled 기본값', '각 포스트가 독립적으로 설정됨');
                } else {
                    this.addResult('❌ trackingEnabled 기본값', '설정이 예상과 다름');
                }
                
                // metrics 배열이 빈 배열로 시작하는지 확인
                if (Array.isArray(post1Data.metrics) && Array.isArray(post2Data.metrics) &&
                    post1Data.metrics.length === 0 && post2Data.metrics.length === 0) {
                    this.addResult('✅ metrics 초기값', '빈 배열로 시작함');
                } else {
                    this.addResult('❌ metrics 초기값', '빈 배열이 아님');
                }
                
            } else {
                this.addResult('❌ 포스트 생성', '문서 조회 실패');
            }
            
        } catch (error) {
            this.addResult('❌ 포스트 생성 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testMetricAddition() {
        console.log('  → 메트릭 추가 테스트...');
        
        try {
            if (!this.testPostIds || this.testPostIds.length < 2) {
                this.addResult('⚠️ 메트릭 추가 테스트', '포스트 생성 테스트 먼저 실행 필요');
                return;
            }
            
            const writer = window.dualTextWriter;
            const db = writer.db;
            const userId = writer.currentUser.uid;
            
            // 포스트 A에 메트릭 추가
            const post1Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[0]);
            const post1Doc = await window.firebaseGetDoc(post1Ref);
            
            if (post1Doc.exists()) {
                const post1Data = post1Doc.data();
                const metrics1 = post1Data.metrics || [];
                
                const newMetric1 = {
                    timestamp: window.firebaseServerTimestamp(),
                    views: 100,
                    likes: 10,
                    comments: 5,
                    shares: 2,
                    notes: '테스트 메트릭 1'
                };
                
                const updatedMetrics1 = [...metrics1, newMetric1];
                const analytics1 = writer.calculateAnalytics(updatedMetrics1);
                
                await window.firebaseUpdateDoc(post1Ref, {
                    metrics: updatedMetrics1,
                    analytics: analytics1
                });
                
                // 포스트 B에 다른 메트릭 추가
                const post2Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[1]);
                const post2Doc = await window.firebaseGetDoc(post2Ref);
                
                if (post2Doc.exists()) {
                    const post2Data = post2Doc.data();
                    const metrics2 = post2Data.metrics || [];
                    
                    const newMetric2 = {
                        timestamp: window.firebaseServerTimestamp(),
                        views: 200,
                        likes: 20,
                        comments: 10,
                        shares: 4,
                        notes: '테스트 메트릭 2'
                    };
                    
                    const updatedMetrics2 = [...metrics2, newMetric2];
                    const analytics2 = writer.calculateAnalytics(updatedMetrics2);
                    
                    await window.firebaseUpdateDoc(post2Ref, {
                        metrics: updatedMetrics2,
                        analytics: analytics2
                    });
                    
                    // 각 포스트의 메트릭이 독립적으로 저장되었는지 확인
                    const updatedPost1Doc = await window.firebaseGetDoc(post1Ref);
                    const updatedPost2Doc = await window.firebaseGetDoc(post2Ref);
                    
                    const updatedPost1Data = updatedPost1Doc.data();
                    const updatedPost2Data = updatedPost2Doc.data();
                    
                    if (updatedPost1Data.metrics.length === 1 && updatedPost2Data.metrics.length === 1) {
                        if (updatedPost1Data.metrics[0].views === 100 && updatedPost2Data.metrics[0].views === 200) {
                            this.addResult('✅ 메트릭 독립성', '각 포스트의 메트릭이 독립적으로 저장됨');
                        } else {
                            this.addResult('❌ 메트릭 독립성', '메트릭 데이터가 예상과 다름');
                        }
                    } else {
                        this.addResult('❌ 메트릭 독립성', '메트릭 배열 길이가 예상과 다름');
                    }
                    
                    // analytics 객체가 각 포스트별로 올바르게 계산되었는지 확인
                    if (updatedPost1Data.analytics.totalViews === 100 && 
                        updatedPost2Data.analytics.totalViews === 200) {
                        this.addResult('✅ analytics 계산', '각 포스트별로 올바르게 계산됨');
                    } else {
                        this.addResult('❌ analytics 계산', '계산 결과가 예상과 다름');
                    }
                }
            }
            
        } catch (error) {
            this.addResult('❌ 메트릭 추가 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testTrackingToggle() {
        console.log('  → 트래킹 활성화/비활성화 테스트...');
        
        try {
            if (!this.testPostIds || this.testPostIds.length < 2) {
                this.addResult('⚠️ 트래킹 토글 테스트', '포스트 생성 테스트 먼저 실행 필요');
                return;
            }
            
            const writer = window.dualTextWriter;
            const db = writer.db;
            const userId = writer.currentUser.uid;
            
            // 포스트 A만 트래킹 활성화
            const post1Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[0]);
            await window.firebaseUpdateDoc(post1Ref, {
                trackingEnabled: true
            });
            
            // 포스트 B는 비활성 상태 유지
            const post2Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[1]);
            await window.firebaseUpdateDoc(post2Ref, {
                trackingEnabled: false
            });
            
            // 각 포스트의 상태 확인
            const post1Doc = await window.firebaseGetDoc(post1Ref);
            const post2Doc = await window.firebaseGetDoc(post2Ref);
            
            const post1Data = post1Doc.data();
            const post2Data = post2Doc.data();
            
            if (post1Data.trackingEnabled === true && post2Data.trackingEnabled === false) {
                this.addResult('✅ 트래킹 상태 독립성', '각 포스트의 상태가 독립적으로 관리됨');
            } else {
                this.addResult('❌ 트래킹 상태 독립성', '상태가 예상과 다름');
            }
            
        } catch (error) {
            this.addResult('❌ 트래킹 토글 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testSummaryStatistics() {
        console.log('  → 요약 통계 테스트...');
        
        try {
            if (!this.testPostIds || this.testPostIds.length < 2) {
                this.addResult('⚠️ 요약 통계 테스트', '포스트 생성 테스트 먼저 실행 필요');
                return;
            }
            
            const writer = window.dualTextWriter;
            
            // 트래킹 포스트 목록 다시 로드
            await writer.loadTrackingPosts();
            
            // 요약 통계 업데이트
            writer.updateTrackingSummary();
            
            // 예상 통계값 계산 (테스트 포스트 2개 + 기존 포스트)
            const totalPosts = writer.trackingPosts.length;
            const totalViews = writer.trackingPosts.reduce((sum, post) => {
                const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
                return sum + (latest ? latest.views : 0);
            }, 0);
            const totalLikes = writer.trackingPosts.reduce((sum, post) => {
                const latest = post.metrics.length > 0 ? post.metrics[post.metrics.length - 1] : null;
                return sum + (latest ? latest.likes : 0);
            }, 0);
            
            // UI에 표시된 값 확인 (테스트 포스트 포함 시 최소 2개 이상)
            if (totalPosts >= 2) {
                this.addResult('✅ 총 포스팅 수 집계', `정상 작동 (${totalPosts}개)`);
            } else {
                this.addResult('❌ 총 포스팅 수 집계', '집계가 올바르지 않음');
            }
            
            // 테스트 포스트의 메트릭이 집계되었는지 확인 (views: 100 + 200 = 300 이상)
            if (totalViews >= 300) {
                this.addResult('✅ 총 조회수 집계', `정상 작동 (${totalViews})`);
            } else {
                this.addResult('⚠️ 총 조회수 집계', `현재 값: ${totalViews} (테스트 포스트 포함 시 300 이상이어야 함)`);
            }
            
            // 테스트 포스트의 메트릭이 집계되었는지 확인 (likes: 10 + 20 = 30 이상)
            if (totalLikes >= 30) {
                this.addResult('✅ 총 좋아요 집계', `정상 작동 (${totalLikes})`);
            } else {
                this.addResult('⚠️ 총 좋아요 집계', `현재 값: ${totalLikes} (테스트 포스트 포함 시 30 이상이어야 함)`);
            }
            
        } catch (error) {
            this.addResult('❌ 요약 통계 테스트', `실패 - ${error.message}`);
        }
    }
    
    async testPostIsolation() {
        console.log('  → 포스트 격리 확인 테스트...');
        
        try {
            if (!this.testPostIds || this.testPostIds.length < 2) {
                this.addResult('⚠️ 포스트 격리 테스트', '포스트 생성 테스트 먼저 실행 필요');
                return;
            }
            
            const writer = window.dualTextWriter;
            const db = writer.db;
            const userId = writer.currentUser.uid;
            
            // 포스트 A의 데이터 수정
            const post1Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[0]);
            const post1Doc = await window.firebaseGetDoc(post1Ref);
            const post1Data = post1Doc.data();
            
            // 포스트 A에 추가 메트릭 추가
            const newMetric = {
                timestamp: window.firebaseServerTimestamp(),
                views: 150,
                likes: 15,
                comments: 8,
                shares: 3,
                notes: '격리 테스트용 메트릭'
            };
            
            const updatedMetrics = [...(post1Data.metrics || []), newMetric];
            
            await window.firebaseUpdateDoc(post1Ref, {
                metrics: updatedMetrics
            });
            
            // 포스트 B의 데이터가 변경되지 않았는지 확인
            const post2Ref = window.firebaseDoc(db, 'users', userId, 'posts', this.testPostIds[1]);
            const post2Doc = await window.firebaseGetDoc(post2Ref);
            const post2Data = post2Doc.data();
            
            // 포스트 A는 메트릭 2개, 포스트 B는 여전히 1개여야 함
            const updatedPost1Doc = await window.firebaseGetDoc(post1Ref);
            const updatedPost1Data = updatedPost1Doc.data();
            
            if (updatedPost1Data.metrics.length === 2 && post2Data.metrics.length === 1) {
                this.addResult('✅ 포스트 데이터 격리', '포스트 A의 변경이 포스트 B에 영향을 주지 않음');
            } else {
                this.addResult('❌ 포스트 데이터 격리', '데이터 격리가 올바르지 않음');
            }
            
        } catch (error) {
            this.addResult('❌ 포스트 격리 테스트', `실패 - ${error.message}`);
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
2. 로그인 완료 (트래킹 테스트는 로그인 필수)
3. runFirebaseTests() 실행
4. 결과 확인

테스트 내용:
- Firebase 초기화 및 연동
- Authentication
- Firestore 연결
- 데이터 작업
- 버튼 기능
- LLM 검증 기능
- 📊 트래킹 기능 (신규!)
  * 포스트 생성 및 독립성
  * 메트릭 추가 및 격리
  * 트래킹 활성화/비활성화
  * 요약 통계 집계
  * 포스트 데이터 격리

주의사항:
- Firebase 설정이 완료된 후 테스트하세요
- 실제 데이터베이스에 테스트 데이터가 저장됩니다 (testData: true 플래그 포함)
- 테스트 후 Firebase Console에서 testData: true인 문서들을 정리할 수 있습니다
`);

// 전역 함수로 등록
window.runFirebaseTests = runFirebaseTests;
