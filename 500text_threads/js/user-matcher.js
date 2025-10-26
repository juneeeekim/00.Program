/**
 * UserMatcher
 * 
 * 계정 매칭 및 연결 관리 클래스
 * - Google 계정과 Username 계정 간 유사도 계산
 * - 자동 매칭 제안
 * - 계정 연결 및 해제
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

class UserMatcher {
    constructor(logger) {
        // 의존성
        this.logger = logger || (window.ActivityLogger ? new ActivityLogger() : null);
        
        // 설정
        this.confidenceThreshold = 0.7; // 70% 이상일 때만 제안
        
        // 저장 키
        this.LINKED_ACCOUNTS_KEY = 'dualTextWriter_linkedAccounts';
        this.ACCOUNT_MATCHES_KEY = 'dualTextWriter_accountMatches';
        this.IGNORED_MATCHES_KEY = 'dualTextWriter_ignoredMatches';
    }
    
    /**
     * Google 이메일과 유사한 사용자명 찾기
     * @param {string} googleEmail - Google 이메일 주소
     * @returns {Array<Object>} 매칭 결과 배열
     */
    findMatches(googleEmail) {
        try {
            // 이메일에서 로컬 부분 추출 (@ 앞부분)
            const emailLocal = googleEmail.split('@')[0].toLowerCase();
            
            // 기존 사용자명 계정 목록 가져오기
            const existingUsernames = this.getExistingUsernames();
            
            if (existingUsernames.length === 0) {
                return [];
            }
            
            // 각 사용자명과 유사도 계산
            const matches = existingUsernames.map(username => {
                const confidence = this.calculateSimilarity(emailLocal, username);
                const lastUsed = this.getLastUsed(username);
                const itemCount = this.getItemCount(username);
                
                return {
                    username: username,
                    confidence: confidence,
                    reason: this.getMatchReason(emailLocal, username, confidence),
                    lastUsed: lastUsed,
                    itemCount: itemCount
                };
            });
            
            // 신뢰도 순으로 정렬
            matches.sort((a, b) => b.confidence - a.confidence);
            
            // 임계값 이상인 것만 반환
            const validMatches = matches.filter(m => m.confidence >= this.confidenceThreshold);
            
            // 로깅
            if (this.logger && validMatches.length > 0) {
                this.logger.logAction('matches_found', '계정 매칭 발견', {
                    googleEmail: googleEmail,
                    matchCount: validMatches.length,
                    topConfidence: validMatches[0]?.confidence
                });
            }
            
            return validMatches;
            
        } catch (error) {
            console.error('❌ 매칭 검색 실패:', error);
            return [];
        }
    }
    
    /**
     * 두 문자열 간 유사도 계산 (Levenshtein distance 기반)
     * @param {string} email - 이메일 로컬 부분
     * @param {string} username - 사용자명
     * @returns {number} 0-1 사이의 유사도 점수
     */
    calculateSimilarity(email, username) {
        // 소문자로 변환
        const str1 = email.toLowerCase();
        const str2 = username.toLowerCase();
        
        // 완전 일치
        if (str1 === str2) {
            return 1.0;
        }
        
        // 한쪽이 다른 쪽을 포함
        if (str1.includes(str2) || str2.includes(str1)) {
            const longer = Math.max(str1.length, str2.length);
            const shorter = Math.min(str1.length, str2.length);
            return 0.8 + (shorter / longer) * 0.15; // 0.8-0.95
        }
        
        // Levenshtein distance 계산
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        
        // 유사도 = 1 - (거리 / 최대 길이)
        const similarity = 1 - (distance / maxLength);
        
        // 0-1 범위로 제한
        return Math.max(0, Math.min(1, similarity));
    }
    
    /**
     * Levenshtein distance 계산 (편집 거리)
     * @param {string} str1
     * @param {string} str2
     * @returns {number}
     */
    levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        
        // 2D 배열 생성
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        
        // 초기화
        for (let i = 0; i <= len1; i++) {
            matrix[i][0] = i;
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        // 동적 프로그래밍
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // 삭제
                    matrix[i][j - 1] + 1,      // 삽입
                    matrix[i - 1][j - 1] + cost // 대체
                );
            }
        }
        
        return matrix[len1][len2];
    }
    
    /**
     * 최적의 매칭 제안
     * @param {string} googleEmail
     * @returns {Object|null}
     */
    suggestMatch(googleEmail) {
        const matches = this.findMatches(googleEmail);
        
        if (matches.length === 0) {
            return null;
        }
        
        // 가장 높은 신뢰도의 매칭 반환
        const bestMatch = matches[0];
        
        // 로깅
        if (this.logger) {
            this.logger.logAction('match_suggested', '매칭 제안', {
                googleEmail: googleEmail,
                username: bestMatch.username,
                confidence: bestMatch.confidence
            });
        }
        
        return bestMatch;
    }
    
    /**
     * 계정 연결
     * @param {string} googleId - Google 이메일
     * @param {string} username - 사용자명
     * @returns {boolean}
     */
    linkAccounts(googleId, username) {
        try {
            const linkage = {
                googleId: googleId,
                username: username,
                linkedAt: Date.now(),
                primaryProvider: 'google'
            };
            
            // 저장
            localStorage.setItem(this.LINKED_ACCOUNTS_KEY, JSON.stringify(linkage));
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('accounts_linked', '계정 연결 완료', {
                    googleId: googleId,
                    username: username,
                    timestamp: linkage.linkedAt
                });
            }
            
            console.log('✅ 계정 연결 완료:', googleId, '<->', username);
            
            return true;
            
        } catch (error) {
            console.error('❌ 계정 연결 실패:', error);
            
            if (this.logger) {
                this.logger.logAction('accounts_link_failed', '계정 연결 실패', {
                    error: error.message
                });
            }
            
            return false;
        }
    }
    
    /**
     * 계정 연결 해제
     * @param {string} identifier - Google ID 또는 Username
     * @returns {boolean}
     */
    unlinkAccounts(identifier) {
        try {
            const linkage = this.getLinkedAccount(identifier);
            
            if (!linkage) {
                console.warn('⚠️ 연결된 계정이 없습니다:', identifier);
                return false;
            }
            
            // 연결 해제
            localStorage.removeItem(this.LINKED_ACCOUNTS_KEY);
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('accounts_unlinked', '계정 연결 해제', {
                    googleId: linkage.googleId,
                    username: linkage.username
                });
            }
            
            console.log('✅ 계정 연결 해제 완료');
            
            return true;
            
        } catch (error) {
            console.error('❌ 계정 연결 해제 실패:', error);
            return false;
        }
    }
    
    /**
     * 연결된 계정 정보 가져오기
     * @param {string} identifier - Google ID 또는 Username
     * @returns {Object|null}
     */
    getLinkedAccount(identifier) {
        try {
            const linkageData = localStorage.getItem(this.LINKED_ACCOUNTS_KEY);
            
            if (!linkageData) {
                return null;
            }
            
            const linkage = JSON.parse(linkageData);
            
            // Google ID 또는 Username으로 검색
            if (linkage.googleId === identifier || linkage.username === identifier) {
                return linkage;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ 연결된 계정 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * 매칭 무시 처리
     * @param {string} googleEmail
     * @param {string} username
     */
    ignoreMatch(googleEmail, username) {
        try {
            const ignoredData = localStorage.getItem(this.IGNORED_MATCHES_KEY);
            const ignored = ignoredData ? JSON.parse(ignoredData) : {};
            
            // 무시 목록에 추가
            if (!ignored[googleEmail]) {
                ignored[googleEmail] = [];
            }
            ignored[googleEmail].push(username);
            
            localStorage.setItem(this.IGNORED_MATCHES_KEY, JSON.stringify(ignored));
            
            // 로깅
            if (this.logger) {
                this.logger.logAction('match_ignored', '매칭 무시', {
                    googleEmail: googleEmail,
                    username: username
                });
            }
            
            console.log('✅ 매칭 무시 처리:', googleEmail, '-', username);
            
        } catch (error) {
            console.error('❌ 매칭 무시 처리 실패:', error);
        }
    }
    
    /**
     * 무시된 매칭인지 확인
     * @param {string} googleEmail
     * @param {string} username
     * @returns {boolean}
     */
    isMatchIgnored(googleEmail, username) {
        try {
            const ignoredData = localStorage.getItem(this.IGNORED_MATCHES_KEY);
            if (!ignoredData) return false;
            
            const ignored = JSON.parse(ignoredData);
            return ignored[googleEmail]?.includes(username) || false;
            
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 기존 사용자명 계정 목록 가져오기
     * @returns {Array<string>}
     */
    getExistingUsernames() {
        const usernames = [];
        
        try {
            // localStorage에서 모든 키 검색
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                // savedTexts 키 패턴 확인
                if (key && key.startsWith('dualTextWriter_savedTexts_')) {
                    const username = key.replace('dualTextWriter_savedTexts_', '');
                    
                    // 이메일 형식이 아닌 것만 (사용자명 계정)
                    if (!username.includes('@')) {
                        usernames.push(username);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ 사용자명 목록 조회 실패:', error);
        }
        
        return usernames;
    }
    
    /**
     * 마지막 사용 시간 가져오기
     * @param {string} username
     * @returns {number}
     */
    getLastUsed(username) {
        try {
            const key = `dualTextWriter_savedTexts_${username}`;
            const data = localStorage.getItem(key);
            
            if (!data) return 0;
            
            const texts = JSON.parse(data);
            
            if (texts.length === 0) return 0;
            
            // 가장 최근 항목의 ID (타임스탬프)
            const lastItem = texts[0];
            return lastItem.id || 0;
            
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * 저장된 항목 수 가져오기
     * @param {string} username
     * @returns {number}
     */
    getItemCount(username) {
        try {
            const key = `dualTextWriter_savedTexts_${username}`;
            const data = localStorage.getItem(key);
            
            if (!data) return 0;
            
            const texts = JSON.parse(data);
            return texts.length;
            
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * 매칭 이유 설명 생성
     * @param {string} email
     * @param {string} username
     * @param {number} confidence
     * @returns {string}
     */
    getMatchReason(email, username, confidence) {
        const emailLower = email.toLowerCase();
        const usernameLower = username.toLowerCase();
        
        if (emailLower === usernameLower) {
            return '이메일과 사용자명이 정확히 일치합니다';
        }
        
        if (emailLower.includes(usernameLower)) {
            return '이메일에 사용자명이 포함되어 있습니다';
        }
        
        if (usernameLower.includes(emailLower)) {
            return '사용자명에 이메일이 포함되어 있습니다';
        }
        
        if (confidence >= 0.9) {
            return '매우 유사한 이름입니다';
        }
        
        if (confidence >= 0.8) {
            return '유사한 이름입니다';
        }
        
        if (confidence >= 0.7) {
            return '비슷한 패턴의 이름입니다';
        }
        
        return '일부 유사성이 있습니다';
    }
    
    /**
     * 날짜 포맷팅
     * @param {number} timestamp
     * @returns {string}
     */
    formatDate(timestamp) {
        if (!timestamp) return '사용 기록 없음';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return '오늘';
        } else if (diffDays === 1) {
            return '어제';
        } else if (diffDays < 7) {
            return `${diffDays}일 전`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}주 전`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months}개월 전`;
        } else {
            return date.toLocaleDateString('ko-KR');
        }
    }
}

// 전역 스코프에 노출 (브라우저 환경)
if (typeof window !== 'undefined') {
    window.UserMatcher = UserMatcher;
}
