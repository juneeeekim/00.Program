/**
 * ==================== UrlLinkManager ====================
 * URL 바로가기 관리 모듈
 *
 * [역할]
 * - Firebase Firestore에서 URL 링크 CRUD
 * - URL 링크 렌더링 및 UI 관리
 * - 링크 클릭 시 새 탭으로 열기
 *
 * [Firestore 구조]
 * - Collection: users/{uid}/urlLinks
 * - Document: { name, description, url, createdAt, order }
 *
 * [생성일] 2026-01-18
 * [작성자] URL Link Implementation Team
 */

export class UrlLinkManager {
  /**
   * UrlLinkManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    this.mainApp = mainApp;
    this.urlLinks = [];
    this.isLoading = false;
    this.editingId = null;
    this.initialized = false; // [2026-01-18] 초기화 여부 플래그

    // DOM 요소 캐싱
    this.listContainer = null;
    this.emptyState = null;
    this.form = null;
    this.addBtn = null;

    console.log('✅ [UrlLinkManager] 인스턴스 생성 완료 (초기화 대기)');
  }

  /**
   * DOM 요소 캐싱 및 이벤트 바인딩
   * @returns {boolean} 초기화 성공 여부
   */
  init() {
    if (this.initialized) return true; // 이미 초기화됨

    this._cacheDOM();
    
    // 필수 요소 확인
    if (!this.addBtn || !this.listContainer) {
      console.warn('[UrlLinkManager] 필수 DOM 요소를 찾을 수 없습니다. (URL 연결 탭이 아직 렌더링되지 않았을 수 있음)');
      return false;
    }

    this._bindEvents();
    this.initialized = true;
    console.log('✅ [UrlLinkManager] DOM 바인딩 및 이벤트 초기화 완료');
    return true;
  }

  /**
   * DOM 요소 캐싱
   */
  _cacheDOM() {
    this.listContainer = document.getElementById('url-link-list');
    this.emptyState = document.getElementById('url-link-empty-state');
    this.form = document.getElementById('url-link-form');
    this.addBtn = document.getElementById('add-url-link-btn');
    this.saveBtn = document.getElementById('url-link-save-btn');
    this.cancelBtn = document.getElementById('url-link-cancel-btn');
    this.nameInput = document.getElementById('url-link-name');
    this.descInput = document.getElementById('url-link-desc');
    this.urlInput = document.getElementById('url-link-url');
    this.editIdInput = document.getElementById('url-link-edit-id');
  }

  /**
   * 이벤트 바인딩
   */
  _bindEvents() {
    // 추가 버튼
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this.showForm());
    }

    // 저장 버튼
    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.saveUrlLink());
    }

    // 취소 버튼
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => this.hideForm());
    }
  }

  // ==================== Firebase CRUD ====================

  /**
   * Firebase에서 URL 링크 로드
   */
  async loadUrlLinks() {
    // [2026-01-18] 아직 초기화 전이라면 초기화 시도
    if (!this.initialized) {
      if (!this.init()) return; 
    }

    if (this.isLoading) {
      console.log('[UrlLinkManager] 이미 로딩 중, 스킵');
      return;
    }

    const app = this.mainApp;
    if (!app.currentUser || !app.isFirebaseReady) {
      console.warn('[UrlLinkManager] Firebase 미준비 또는 미로그인 (데이터 로드를 위해 로그인이 필요합니다)');
      this._showEmptyState();
      return;
    }

    this.isLoading = true;

    try {
      const linksRef = window.firebaseCollection(
        app.db,
        'users',
        app.currentUser.uid,
        'urlLinks'
      );

      // createdAt 내림차순 정렬 시도, 실패 시 정렬 없이
      let querySnapshot;
      try {
        const q = window.firebaseQuery(
          linksRef,
          window.firebaseOrderBy('createdAt', 'desc')
        );
        querySnapshot = await window.firebaseGetDocs(q);
      } catch (orderError) {
        console.warn('[UrlLinkManager] orderBy 실패, 정렬 없이 로드:', orderError.message);
        querySnapshot = await window.firebaseGetDocs(linksRef);
      }

      this.urlLinks = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.urlLinks.push({
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          url: data.url || '',
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
          order: data.order || 0
        });
      });

      // 클라이언트 사이드 정렬 (order 또는 createdAt)
      this.urlLinks.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return b.createdAt - a.createdAt;
      });

      console.log(`✅ [UrlLinkManager] ${this.urlLinks.length}개 URL 링크 로드 완료`);
      this.renderUrlLinks();

    } catch (error) {
      console.error('[UrlLinkManager] URL 링크 로드 실패:', error?.message || error);
      this._showEmptyState();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * URL 링크 저장 (추가 또는 수정)
   */
  async saveUrlLink() {
    const app = this.mainApp;
    if (!app.currentUser || !app.isFirebaseReady) {
      app.showMessage('❌ 로그인이 필요합니다.', 'error');
      return;
    }

    // 입력값 검증
    const name = this.nameInput?.value?.trim();
    const description = this.descInput?.value?.trim() || '';
    const url = this.urlInput?.value?.trim();
    const editId = this.editIdInput?.value;

    if (!name) {
      app.showMessage('❌ 서비스 명칭을 입력해주세요.', 'error');
      this.nameInput?.focus();
      return;
    }

    if (!url) {
      app.showMessage('❌ URL 주소를 입력해주세요.', 'error');
      this.urlInput?.focus();
      return;
    }

    // URL 유효성 검사
    if (!this._isValidUrl(url)) {
      app.showMessage('❌ 올바른 URL 형식을 입력해주세요. (https://...)', 'error');
      this.urlInput?.focus();
      return;
    }

    try {
      const linksRef = window.firebaseCollection(
        app.db,
        'users',
        app.currentUser.uid,
        'urlLinks'
      );

      if (editId) {
        // 수정 모드
        const docRef = window.firebaseDoc(linksRef, editId);
        await window.firebaseUpdateDoc(docRef, {
          name,
          description,
          url,
          updatedAt: window.firebaseServerTimestamp()
        });
        app.showMessage('✅ URL 링크가 수정되었습니다.', 'success');
      } else {
        // 추가 모드
        await window.firebaseAddDoc(linksRef, {
          name,
          description,
          url,
          createdAt: window.firebaseServerTimestamp(),
          order: this.urlLinks.length
        });
        app.showMessage('✅ URL 링크가 추가되었습니다.', 'success');
      }

      this.hideForm();
      await this.loadUrlLinks();

    } catch (error) {
      console.error('[UrlLinkManager] URL 링크 저장 실패:', error?.message || error);
      app.showMessage('❌ URL 링크 저장에 실패했습니다.', 'error');
    }
  }

  /**
   * URL 링크 삭제
   * @param {string} linkId - 삭제할 링크 ID
   */
  async deleteUrlLink(linkId) {
    const app = this.mainApp;
    if (!app.currentUser || !app.isFirebaseReady) {
      app.showMessage('❌ 로그인이 필요합니다.', 'error');
      return;
    }

    if (!confirm('이 URL 링크를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const docRef = window.firebaseDoc(
        app.db,
        'users',
        app.currentUser.uid,
        'urlLinks',
        linkId
      );
      await window.firebaseDeleteDoc(docRef);

      app.showMessage('✅ URL 링크가 삭제되었습니다.', 'success');
      await this.loadUrlLinks();

    } catch (error) {
      console.error('[UrlLinkManager] URL 링크 삭제 실패:', error?.message || error);
      app.showMessage('❌ URL 링크 삭제에 실패했습니다.', 'error');
    }
  }

  // ==================== UI 렌더링 ====================

  /**
   * URL 링크 목록 렌더링
   */
  renderUrlLinks() {
    if (!this.listContainer) return;

    if (this.urlLinks.length === 0) {
      this._showEmptyState();
      return;
    }

    this._hideEmptyState();
    this.listContainer.innerHTML = this.urlLinks.map(link => this._createLinkCard(link)).join('');

    // 이벤트 바인딩 (동적 생성된 요소)
    this._bindCardEvents();
  }

  /**
   * 링크 카드 HTML 생성
   * @param {Object} link - 링크 데이터
   * @returns {string} HTML 문자열
   */
  _createLinkCard(link) {
    const escapedName = this._escapeHtml(link.name);
    const escapedDesc = this._escapeHtml(link.description);
    const escapedUrl = this._escapeHtml(link.url);
    const displayUrl = this._truncateUrl(link.url, 40);

    return `
      <div class="url-link-card" data-link-id="${link.id}" role="listitem">
        <div class="url-link-card-main" title="${escapedUrl}">
          <div class="url-link-card-icon">🔗</div>
          <div class="url-link-card-content">
            <h4 class="url-link-card-name">${escapedName}</h4>
            ${escapedDesc ? `<p class="url-link-card-desc">${escapedDesc}</p>` : ''}
            <span class="url-link-card-url">${displayUrl}</span>
          </div>
        </div>
        <div class="url-link-card-actions">
          <button class="url-link-open-btn" data-url="${escapedUrl}" title="새 탭에서 열기">
            🚀 열기
          </button>
          <button class="url-link-edit-btn" data-id="${link.id}" title="수정">
            ✏️
          </button>
          <button class="url-link-delete-btn" data-id="${link.id}" title="삭제">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 카드 이벤트 바인딩
   */
  _bindCardEvents() {
    // 열기 버튼
    document.querySelectorAll('.url-link-open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.dataset.url;
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });

    // 수정 버튼
    document.querySelectorAll('.url-link-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const linkId = e.currentTarget.dataset.id;
        this.editUrlLink(linkId);
      });
    });

    // 삭제 버튼
    document.querySelectorAll('.url-link-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const linkId = e.currentTarget.dataset.id;
        this.deleteUrlLink(linkId);
      });
    });

    // 카드 클릭 (열기)
    document.querySelectorAll('.url-link-card-main').forEach(cardMain => {
      cardMain.addEventListener('click', (e) => {
        const card = e.currentTarget.closest('.url-link-card');
        const linkId = card?.dataset.linkId;
        const link = this.urlLinks.find(l => l.id === linkId);
        if (link?.url) {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  // ==================== 폼 관리 ====================

  /**
   * 추가/수정 폼 표시
   * @param {Object} [linkData] - 수정 시 기존 데이터
   */
  showForm(linkData = null) {
    if (!this.form) return;

    // 폼 초기화
    if (this.nameInput) this.nameInput.value = linkData?.name || '';
    if (this.descInput) this.descInput.value = linkData?.description || '';
    if (this.urlInput) this.urlInput.value = linkData?.url || '';
    if (this.editIdInput) this.editIdInput.value = linkData?.id || '';

    this.form.style.display = 'block';
    this.nameInput?.focus();
  }

  /**
   * 폼 숨기기
   */
  hideForm() {
    if (!this.form) return;
    this.form.style.display = 'none';
    
    // 입력값 초기화
    if (this.nameInput) this.nameInput.value = '';
    if (this.descInput) this.descInput.value = '';
    if (this.urlInput) this.urlInput.value = '';
    if (this.editIdInput) this.editIdInput.value = '';
  }

  /**
   * 수정 폼 표시
   * @param {string} linkId - 수정할 링크 ID
   */
  editUrlLink(linkId) {
    const link = this.urlLinks.find(l => l.id === linkId);
    if (link) {
      this.showForm(link);
    }
  }

  // ==================== 유틸리티 ====================

  /**
   * 빈 상태 메시지 표시
   */
  _showEmptyState() {
    if (this.listContainer) this.listContainer.innerHTML = '';
    if (this.emptyState) this.emptyState.style.display = 'block';
  }

  /**
   * 빈 상태 메시지 숨기기
   */
  _hideEmptyState() {
    if (this.emptyState) this.emptyState.style.display = 'none';
  }

  /**
   * URL 유효성 검사
   * @param {string} url - URL 문자열
   * @returns {boolean} 유효 여부
   */
  _isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * URL 축약 표시
   * @param {string} url - 원본 URL
   * @param {number} maxLength - 최대 길이
   * @returns {string} 축약된 URL
   */
  _truncateUrl(url, maxLength = 50) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  }

  /**
   * HTML 이스케이프
   * @param {string} text - 원본 텍스트
   * @returns {string} 이스케이프된 텍스트
   */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
