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
     * 저장된 텍스트 목록 조회 (삭제되지 않은 글만)
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
                const data = doc.data();
                // isDeleted가 true가 아닌 경우만 포함 (undefined, null, false)
                if (data.isDeleted !== true) {
                    texts.push({ id: doc.id, ...data });
                }
            });
            return texts;
        } catch (error) {
            console.error('텍스트 목록 조회 실패:', error);
            throw error;
        }
    }

    /**
     * 휴지통 목록 조회 (삭제된 글만)
     * @param {string} uid - 사용자 UID
     * @returns {Promise<Array>} - 텍스트 데이터 배열
     */
    async loadTrashTexts(uid) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const q = window.firebaseQuery(
                window.firebaseCollection(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS),
                window.firebaseOrderBy('deletedAt', 'desc')
            );
            
            const querySnapshot = await window.firebaseGetDocs(q);
            const texts = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.isDeleted === true) {
                    texts.push({ id: doc.id, ...data });
                }
            });
            return texts;
        } catch (error) {
            console.error('휴지통 목록 조회 실패:', error);
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
     * 텍스트 데이터 삭제 (Soft Delete - 휴지통으로 이동)
     * @param {string} uid - 사용자 UID
     * @param {string} textId - 텍스트 문서 ID
     */
    async deleteText(uid, textId) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const docRef = window.firebaseDoc(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS, textId);
            await window.firebaseUpdateDoc(docRef, {
                isDeleted: true,
                deletedAt: window.firebaseServerTimestamp(),
                updatedAt: window.firebaseServerTimestamp()
            });
        } catch (error) {
            console.error('텍스트 삭제(휴지통 이동) 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 데이터 복원 (휴지통에서 복구)
     * @param {string} uid - 사용자 UID
     * @param {string} textId - 텍스트 문서 ID
     */
    async restoreText(uid, textId) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            const docRef = window.firebaseDoc(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS, textId);
            await window.firebaseUpdateDoc(docRef, {
                isDeleted: false,
                deletedAt: window.firebaseDeleteField(), // 필드 삭제
                updatedAt: window.firebaseServerTimestamp()
            });
        } catch (error) {
            console.error('텍스트 복원 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 데이터 영구 삭제
     * @param {string} uid - 사용자 UID
     * @param {string} textId - 텍스트 문서 ID
     */
    async permanentlyDeleteText(uid, textId) {
        if (!this.db) throw new Error('Firestore not initialized');

        try {
            await window.firebaseDeleteDoc(window.firebaseDoc(this.db, Constants.COLLECTIONS.USERS, uid, Constants.COLLECTIONS.TEXTS, textId));
        } catch (error) {
            console.error('텍스트 영구 삭제 실패:', error);
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
