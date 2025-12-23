import { Constants } from './constants.js';

/**
 * 데이터 관리 클래스
 * Firestore 및 LocalStorage와의 상호작용을 담당합니다.
 */
export class DataManager {
    constructor(authManager) {
        this.authManager = authManager;
        this.db = null;
    }

    /**
     * Firestore 인스턴스 설정
     * @param {Object} db - Firestore 인스턴스
     */
    setDb(db) {
        this.db = db;
    }

    /**
     * 사용자 프로필 저장
     * @param {string} uid - 사용자 UID
     * @param {string} username - 사용자명
     */
    async saveUserProfile(uid, username) {
        if (!this.db) throw new Error('Firestore not initialized');
        
        try {
            await window.firebaseAddDoc(window.firebaseCollection(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.PROFILE), {
                username: username,
                createdAt: window.firebaseServerTimestamp(),
                loginMethod: 'username'
            });
        } catch (error) {
            console.error('사용자 프로필 저장 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 데이터 저장
     * @param {string} uid - 사용자 UID
     * @param {Object} textData - 저장할 텍스트 데이터 객체
     * @returns {Promise<Object>} - 저장된 문서 참조
     */
    async saveText(uid, textData) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const docRef = await window.firebaseAddDoc(
                window.firebaseCollection(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS),
                textData
            );
            return docRef;
        } catch (error) {
            console.error('텍스트 저장 실패:', error);
            throw error;
        }
    }

    /**
     * 저장된 텍스트 목록 조회
     * @param {string} uid - 사용자 UID
     * @returns {Promise<Array>} - 텍스트 데이터 배열
     */
    async loadSavedTexts(uid) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const q = window.firebaseQuery(
                window.firebaseCollection(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS),
                window.firebaseOrderBy('createdAt', 'desc')
            );
            
            const querySnapshot = await window.firebaseGetDocs(q);
            const texts = [];
            querySnapshot.forEach((doc) => {
                texts.push({ id: doc.id, ...doc.data() });
            });
            return texts;
        } catch (error) {
            console.error('텍스트 목록 조회 실패:', error);
            throw error;
        }
    }

    /**
     * 저장된 텍스트 목록 페이지네이션 조회 (LTE 최적화)
     * @param {string} uid - 사용자 UID
     * @param {number} pageSize - 페이지 크기
     * @param {Object} lastVisibleDoc - 마지막 문서 커서 (없으면 처음부터)
     * @returns {Promise<Object>} - { texts: [], lastVisibleDoc: doc }
     */
    async loadSavedTextsPaginated(uid, pageSize = 20, lastVisibleDoc = null) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const textsRef = window.firebaseCollection(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS);
            
            // 쿼리 제약 조건 생성
            const queryConstraints = [
                window.firebaseOrderBy('createdAt', 'desc'),
                window.firebaseLimit(pageSize)
            ];

            // 커서가 있으면 startAfter 추가
            if (lastVisibleDoc) {
                queryConstraints.push(window.firebaseStartAfter(lastVisibleDoc));
            }

            const q = window.firebaseQuery(textsRef, ...queryConstraints);
            const querySnapshot = await window.firebaseGetDocs(q);
            
            const texts = [];
            querySnapshot.forEach((doc) => {
                texts.push({ id: doc.id, ...doc.data() });
            });

            // 다음 페이지를 위한 커서 (마지막 문서)
            const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

            return {
                texts: texts,
                lastVisibleDoc: lastDoc || null
            };
        } catch (error) {
            console.error('텍스트 페이지네이션 조회 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 데이터 업데이트
     * @param {string} uid - 사용자 UID
     * @param {string} textId - 텍스트 문서 ID
     * @param {Object} updateData - 업데이트할 데이터
     */
    async updateText(uid, textId, updateData) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const docRef = window.firebaseDoc(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS, textId);
            await window.firebaseUpdateDoc(docRef, {
                ...updateData,
                updatedAt: window.firebaseServerTimestamp()
            });
        } catch (error) {
            console.error('텍스트 업데이트 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 데이터 삭제
     * @param {string} uid - 사용자 UID
     * @param {string} textId - 텍스트 문서 ID
     */
    async deleteText(uid, textId) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            await window.firebaseDeleteDoc(window.firebaseDoc(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS, textId));
        } catch (error) {
            console.error('텍스트 삭제 실패:', error);
            throw error;
        }
    }

    /**
     * 로컬 스토리지에서 데이터 가져오기
     * @param {string} key - 키
     * @param {*} defaultValue - 기본값
     * @returns {*} - 저장된 값 또는 기본값
     */
    getLocal(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (e) {
            console.error(`LocalStorage read error (${key}):`, e);
            return defaultValue;
        }
    }

    /**
     * 로컬 스토리지에 데이터 저장
     * @param {string} key - 키
     * @param {*} value - 저장할 값
     */
    setLocal(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.error(`LocalStorage write error (${key}):`, e);
        }
    }

    /**
     * 로컬 스토리지에서 JSON 데이터 가져오기
     * @param {string} key - 키
     * @param {*} defaultValue - 기본값
     * @returns {*} - 파싱된 객체 또는 기본값
     */
    getLocalJson(key, defaultValue = {}) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (e) {
            console.error(`LocalStorage JSON read error (${key}):`, e);
            return defaultValue;
        }
    }

    /**
     * 로컬 스토리지에 JSON 데이터 저장
     * @param {string} key - 키
     * @param {*} value - 저장할 객체
     */
    setLocalJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`LocalStorage JSON write error (${key}):`, e);
        }
    }

    /**
     * 로컬 스토리지 데이터 삭제
     * @param {string} key - 키
     */
    removeLocal(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(`LocalStorage remove error (${key}):`, e);
        }
    }
}
