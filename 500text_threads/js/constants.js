/**
 * 애플리케이션 전역 상수 정의
 * @module Constants
 */

export const Constants = {
    // Firestore 컬렉션 이름
    COLLECTIONS: {
        USERS: 'users',
        TEXTS: 'texts',
        PROFILE: 'profile'
    },

    // 로컬 스토리지 키
    STORAGE_KEYS: {
        SAVED_TEXTS: 'dualTextWriter_savedTexts',
        TEMP_SAVE: 'dualTextWriter_tempSave',
        CHAR_LIMIT: 'dualTextWriter_charLimit',
        SAVED_FILTER: 'dualTextWriter_savedFilter',
        SAVED_SEARCH: 'dtw_saved_search',
        TRACKING_SORT: 'dtw_tracking_sort',
        TRACKING_STATUS: 'dtw_tracking_status',
        TRACKING_SEARCH: 'dtw_tracking_search',
        TRACKING_FROM: 'dtw_tracking_from',
        TRACKING_TO: 'dtw_tracking_to',
        TRACKING_RANGES: 'dtw_tracking_ranges',
        RECENT_REFERENCES: 'dtw_recent_references'
    },

    // 탭 이름
    TABS: {
        WRITING: 'writing',
        SAVED: 'saved',
        TRACKING: 'tracking',
        MANAGEMENT: 'management',
        URLLINK: 'urllink',    // [2026-01-18] URL 연결 탭 추가
        BACKUP: 'backup'       // [2026-01-18] 백업 탭 추가
    },

    // 데이터 타입
    DATA_TYPES: {
        EDIT: 'edit',
        REFERENCE: 'reference',
        SCRIPT: 'script'
    },

    // 레퍼런스 타입
    REF_TYPES: {
        UNSPECIFIED: 'unspecified',
        STRUCTURE: 'structure',
        IDEA: 'idea'
    },

    // UI 관련 상수
    UI: {
        THEME_COLOR: '#0d6efd',
        TOAST_DURATION: 3000
    }
};
