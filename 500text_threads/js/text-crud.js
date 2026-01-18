/**
 * ==================== TextCrudManager ====================
 * 글 관리 (CRUD) 모듈
 *
 * [역할]
 * - 글 저장 (saveText)
 * - 글 삭제 (deleteText - Soft Delete)
 * - 글 복원 (restoreText)
 * - 영구 삭제 (permanentlyDeleteText)
 * - 글 편집 (editText)
 * - 글 지우기 (clearText)
 * - 글 다운로드 (downloadAsTxt)
 * - 글자 수 관리 (updateCharacterCount, getKoreanCharacterCount)
 *
 * [의존성]
 * - DualTextWriter 인스턴스 (mainApp)
 * - Firebase Firestore
 * - Constants 모듈
 *
 * [생성일] 2026-01-16
 * [작성자] Refactoring Team - Phase 8
 */

import { Constants } from "./constants.js";

export class TextCrudManager {
  /**
   * TextCrudManager 생성자
   * @param {Object} mainApp - DualTextWriter 인스턴스 참조
   */
  constructor(mainApp) {
    // ==================== 메인 앱 참조 ====================
    this.mainApp = mainApp;

    console.log("✅ TextCrudManager 초기화 완료");
  }

  // ==================== 글자 수 관리 (Phase 8-01) ====================

  /**
   * 글자 수 카운터 업데이트
   * @param {string} panel - 패널 타입 ('ref' | 'edit')
   */
  updateCharacterCount(panel) {
    const app = this.mainApp;
    const textInput = panel === "ref" ? app.refTextInput : app.editTextInput;
    const currentCount =
      panel === "ref" ? app.refCurrentCount : app.editCurrentCount;
    const progressFill =
      panel === "ref" ? app.refProgressFill : app.editProgressFill;


    const saveBtn = panel === "ref" ? app.refSaveBtn : app.editSaveBtn;
    const downloadBtn =
      panel === "ref" ? app.refDownloadBtn : app.editDownloadBtn;

    const text = textInput.value;
    const currentLength = this.getKoreanCharacterCount(text);

    currentCount.textContent = currentLength;

    // Update progress bar
    const progress = (currentLength / app.maxLength) * 100;
    progressFill.style.width = `${Math.min(progress, 100)}%`;

    // Update character count color based on usage
    if (currentLength >= app.maxLength * 0.9) {
      currentCount.className = "danger";
    } else if (currentLength >= app.maxLength * 0.7) {
      currentCount.className = "warning";
    } else {
      currentCount.className = "";
    }

    // Update button states
    saveBtn.disabled = currentLength === 0;
    downloadBtn.disabled = currentLength === 0;
  }

  /**
   * 한글 글자 수 계산
   * @param {string} text - 계산할 텍스트
   * @returns {number} 글자 수
   */
  getKoreanCharacterCount(text) {
    return text.length;
  }

  // ==================== 글 지우기/다운로드 (Phase 8-01) ====================

  /**
   * 텍스트 입력 필드 초기화
   * @param {string} panel - 패널 타입 ('ref' | 'edit')
   */
  clearText(panel) {
    const app = this.mainApp;
    const textInput = panel === "ref" ? app.refTextInput : app.editTextInput;
    const panelName = panel === "ref" ? "레퍼런스 글" : "수정/작성 글";

    if (confirm(`${panelName}을 지우시겠습니까?`)) {
      textInput.value = "";
      if (panel === "edit" && app.editTopicInput) {
        app.editTopicInput.value = "";
      }
      if (panel === "ref" && app.refTopicInput) {
        app.refTopicInput.value = "";
      }
      // SNS 플랫폼 선택 초기화
      if (panel === "edit") {
        app.selectedSnsPlatforms = [];
        app.renderSnsPlatformTags();
        app.updateSnsPlatformCount();
      }
      this.updateCharacterCount(panel);
      textInput.focus();
    }
  }

  /**
   * 텍스트를 TXT 파일로 다운로드
   * @param {string} panel - 패널 타입 ('ref' | 'edit')
   */
  downloadAsTxt(panel) {
    const app = this.mainApp;
    const textInput = panel === "ref" ? app.refTextInput : app.editTextInput;
    const text = textInput.value;
    const panelName = panel === "ref" ? "레퍼런스" : "수정작성";

    if (text.length === 0) {
      alert("다운로드할 내용이 없습니다.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `${panelName}_${timestamp}.txt`;

    const content =
      `500자 미만 글 작성기 - ${panelName} 글\n` +
      `작성일: ${new Date().toLocaleString("ko-KR")}\n` +
      `글자 수: ${this.getKoreanCharacterCount(text)}자\n` +
      `\n${"=".repeat(30)}\n\n` +
      `${text}`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    app.showMessage(
      `${panelName} 글 TXT 파일이 다운로드되었습니다!`,
      "success"
    );
  }


  // ==================== 글 저장 (Phase 8-02) ====================

  /**
   * Firestore에 텍스트 저장
   * @param {string} panel - 패널 타입 ('ref' | 'edit')
   */
  async saveText(panel) {
    const app = this.mainApp;
    const textInput = panel === "ref" ? app.refTextInput : app.editTextInput;
    const text = textInput.value;
    const panelName = panel === "ref" ? "레퍼런스 글" : "수정/작성 글";

    if (text.length === 0) {
      alert("저장할 내용이 없습니다.");
      return;
    }

    if (!app.currentUser) {
      app.showMessage("로그인이 필요합니다.", "error");
      return;
    }

    try {
      const textData = {
        content: text,
        type:
          panel === "ref"
            ? Constants.DATA_TYPES.REFERENCE
            : Constants.DATA_TYPES.EDIT,
        characterCount: this.getKoreanCharacterCount(text),
        createdAt: window.firebaseServerTimestamp(),
        updatedAt: window.firebaseServerTimestamp(),
        isDeleted: false,
      };

      // 레퍼런스 저장 시 referenceType 필수
      if (panel === "ref") {
        let refType = Constants.REF_TYPES.UNSPECIFIED;
        if (app.refTypeStructure && app.refTypeStructure.checked)
          refType = Constants.REF_TYPES.STRUCTURE;
        if (app.refTypeIdea && app.refTypeIdea.checked)
          refType = Constants.REF_TYPES.IDEA;
        if (refType === Constants.REF_TYPES.UNSPECIFIED) {
          app.showMessage(
            "레퍼런스 유형(구조/아이디어)을 선택해주세요.",
            "error"
          );
          return;
        }
        textData.referenceType = refType;
      }

      // 수정/작성 글 저장 시 주제 추가 (선택사항)
      if (panel === "edit" && app.editTopicInput) {
        const topic = app.editTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // 작성글 저장 시 연결된 레퍼런스 ID 배열 추가
      if (panel === "edit") {
        const validReferences = app.selectedReferences.filter((refId) =>
          app.savedTexts.some(
            (item) =>
              item.id === refId &&
              (item.type || Constants.DATA_TYPES.EDIT) ===
                Constants.DATA_TYPES.REFERENCE
          )
        );

        if (validReferences.length > 0) {
          textData.linkedReferences = validReferences;
          textData.referenceMeta = {
            linkedAt: window.firebaseServerTimestamp(),
            linkCount: validReferences.length,
          };
          console.log(`📚 ${validReferences.length}개 레퍼런스 연결됨`);
        } else {
          textData.linkedReferences = [];
        }

        // SNS 플랫폼 저장
        if (
          app.selectedSnsPlatforms &&
          Array.isArray(app.selectedSnsPlatforms)
        ) {
          const validPlatformIds = app.constructor.SNS_PLATFORMS.map(
            (p) => p.id
          );
          const validPlatforms = app.selectedSnsPlatforms.filter(
            (platformId) => validPlatformIds.includes(platformId)
          );
          textData.platforms = validPlatforms;

          if (validPlatforms.length > 0) {
            console.log(
              `📱 ${validPlatforms.length}개 SNS 플랫폼 저장됨:`,
              validPlatforms
            );
          }
        } else {
          textData.platforms = [];
        }
      }

      // 레퍼런스 글 저장 시 주제 추가 (선택사항)
      if (panel === "ref" && app.refTopicInput) {
        const topic = app.refTopicInput.value.trim();
        if (topic) {
          textData.topic = topic;
        }
      }

      // 레퍼런스 저장 시 해시 필드 추가
      if (panel === "ref") {
        try {
          const normalizedForHash = app.normalizeContent(text);
          const contentHash = await app.calculateContentHash(normalizedForHash);
          if (contentHash) {
            textData.contentHash = contentHash;
            textData.hashVersion = 1;
          }
        } catch (e) {
          console.warn("contentHash 계산 실패: 해시 없이 저장합니다.", e);
        }
      }

      // 레퍼런스 저장 시 중복 체크
      if (panel === "ref") {
        try {
          const duplicate = app.checkDuplicateReference(text);
          if (duplicate) {
            const shouldProceed = await app.showDuplicateConfirmModal(duplicate);
            if (!shouldProceed) {
              return;
            }
          }
        } catch (error) {
          console.warn(
            "중복 체크 중 오류 발생, 저장을 계속 진행합니다:",
            error
          );
        }
      }

      // Firestore에 저장
      const docRef = await window.firebaseAddDoc(
        window.firebaseCollection(
          app.db,
          "users",
          app.currentUser.uid,
          "texts"
        ),
        textData
      );

      // 로컬 배열에도 추가
      const savedItem = {
        id: docRef.id,
        content: text,
        date: new Date().toLocaleString("ko-KR"),
        characterCount: this.getKoreanCharacterCount(text),
        type: panel === "ref" ? "reference" : "edit",
        referenceType: panel === "ref" ? textData.referenceType : undefined,
        topic:
          panel === "edit"
            ? textData.topic
            : panel === "ref"
            ? textData.topic
            : undefined,
        contentHash: panel === "ref" ? textData.contentHash : undefined,
        hashVersion: panel === "ref" ? textData.hashVersion : undefined,
        linkedReferences:
          panel === "edit" ? textData.linkedReferences : undefined,
        referenceMeta: panel === "edit" ? textData.referenceMeta : undefined,
        platforms: panel === "edit" ? textData.platforms || [] : undefined,
      };

      // Optimistic UI
      app.savedTexts.unshift(savedItem);
      app.renderSavedTextsCache = null;
      app.renderSavedTextsCacheKey = null;
      app.updateTopicFilterOptions();
      app.refreshUI({ savedTexts: true, force: true });

      app.showMessage(`${panelName}이 저장되었습니다!`, "success");

      // Clear input
      textInput.value = "";
      if (panel === "edit" && app.editTopicInput) {
        app.editTopicInput.value = "";
      }
      if (panel === "ref" && app.refTopicInput) {
        app.refTopicInput.value = "";
      }

      // 작성글 저장 후 선택된 레퍼런스 및 SNS 플랫폼 초기화
      if (panel === "edit") {
        app.selectedReferences = [];
        app.renderSelectedReferenceTags();
        if (app.selectedRefCount) {
          app.selectedRefCount.textContent = "(0개 선택됨)";
        }
        console.log("✅ 레퍼런스 선택 초기화 완료");

        app.selectedSnsPlatforms = [];
        app.renderSnsPlatformTags();
        app.updateSnsPlatformCount();
        console.log("✅ SNS 플랫폼 선택 초기화 완료");
      }

      this.updateCharacterCount(panel);
    } catch (error) {
      console.error("텍스트 저장 실패:", error);
      app.showMessage("저장에 실패했습니다. 다시 시도해주세요.", "error");
    }
  }


  // ==================== 글 편집 (Phase 8-02) ====================

  /**
   * 저장된 글을 편집 영역으로 불러오기
   * @param {string} id - 글 ID
   * @param {string} type - 글 타입 ('reference' | 'edit')
   */
  editText(id, type) {
    const app = this.mainApp;
    console.log("편집 버튼 클릭:", { id, type });
    const item = app.savedTexts.find((saved) => saved.id === id);
    if (item) {
      console.log("편집할 항목 찾음:", item);
      if (type === "reference") {
        app.refTextInput.value = item.content;
        this.updateCharacterCount("ref");
        app.refTextInput.focus();
        app.showMessage(
          "레퍼런스 글을 편집 영역으로 불러왔습니다.",
          "success"
        );
      } else {
        app.editTextInput.value = item.content;
        // 주제 로드
        if (app.editTopicInput) {
          app.editTopicInput.value = item.topic || "";
        }
        // SNS 플랫폼 로드
        if (item.platforms && Array.isArray(item.platforms)) {
          app.selectedSnsPlatforms = [...item.platforms];
        } else {
          app.selectedSnsPlatforms = [];
        }
        app.renderSnsPlatformTags();
        app.updateSnsPlatformCount();
        this.updateCharacterCount("edit");
        app.editTextInput.focus();
        app.showMessage("수정 글을 편집 영역으로 불러왔습니다.", "success");
      }
      app.refTextInput.scrollIntoView({ behavior: "smooth" });
    } else {
      console.error("편집할 항목을 찾을 수 없음:", {
        id,
        type,
        savedTexts: app.savedTexts,
      });
      app.showMessage("편집할 글을 찾을 수 없습니다.", "error");
    }
  }

  // ==================== 글 삭제 (Phase 8-02) ====================

  /**
   * Firestore에서 텍스트 삭제 (Soft Delete)
   * @param {string} id - 삭제할 글 ID
   */
  async deleteText(id) {
    const app = this.mainApp;
    console.log("삭제 버튼 클릭 (Soft Delete):", { id });

    if (!app.currentUser || !app.isFirebaseReady) {
      app.showMessage("로그인이 필요합니다.", "error");
      return;
    }

    try {
      const targetIndex = app.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("삭제할 아이템을 찾을 수 없습니다:", id);
        app.showMessage("삭제할 글을 찾을 수 없습니다.", "error");
        return;
      }

      const itemToDelete = app.savedTexts[targetIndex];

      // 레퍼런스 삭제 시 연결된 작성글 확인
      if ((itemToDelete.type || "edit") === "reference") {
        const usedEdits = app.getEditsByReference(id);
        if (usedEdits.length > 0) {
          const confirmed = confirm(
            `⚠️ 이 레퍼런스는 ${usedEdits.length}개의 작성글에서 참고되고 있습니다.\n\n` +
              `휴지통으로 이동하시겠습니까?\n\n` +
              `(작성글의 연결 정보는 유지되지만, 레퍼런스 내용은 볼 수 없게 됩니다.)`
          );
          if (!confirmed) {
            console.log("사용자가 레퍼런스 삭제 취소");
            return;
          }
        }
      }

      if (!confirm("이 글을 휴지통으로 이동하시겠습니까?")) {
        return;
      }

      // Soft Delete 처리
      itemToDelete.isDeleted = true;
      itemToDelete.deletedAt = new Date().toISOString();

      // 캐시 무효화
      app.renderSavedTextsCache = null;
      app.renderSavedTextsCacheKey = null;

      // UI 갱신
      app.refreshUI({
        savedTexts: true,
        trackingPosts: true,
        trackingSummary: true,
        trackingChart: true,
        force: true,
      });

      console.log("Firestore Soft Delete 시작:", { id });

      try {
        const docRef = window.firebaseDoc(
          app.db,
          "users",
          app.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: true,
          deletedAt: window.firebaseServerTimestamp(),
        });

        app.showMessage("휴지통으로 이동되었습니다.", "success");
        console.log("Soft Delete 완료", { id });
      } catch (error) {
        console.error("텍스트 삭제 실패:", error);

        // 실패 복구
        itemToDelete.isDeleted = false;
        delete itemToDelete.deletedAt;

        app.renderSavedTextsCache = null;
        app.renderSavedTextsCacheKey = null;
        app.renderSavedTexts();

        app.showMessage(
          "휴지통 이동에 실패했습니다. 다시 시도해주세요.",
          "error"
        );
      }
    } catch (error) {
      console.error("텍스트 삭제 실패:", error);
      app.showMessage(
        "휴지통 이동에 실패했습니다. 다시 시도해주세요.",
        "error"
      );
    }
  }


  // ==================== 글 복원 (Phase 8-02) ====================

  /**
   * 휴지통에서 글 복원
   * @param {string} id - 복원할 글 ID
   */
  async restoreText(id) {
    const app = this.mainApp;
    console.log("복원 버튼 클릭:", { id });

    if (!app.currentUser || !app.isFirebaseReady) return;

    try {
      const targetIndex = app.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("복원할 아이템을 찾을 수 없습니다:", id);
        return;
      }

      const itemToRestore = app.savedTexts[targetIndex];

      // 낙관적 업데이트
      itemToRestore.isDeleted = false;
      itemToRestore.deletedAt = null;

      app.renderSavedTextsCache = null;
      app.renderSavedTextsCacheKey = null;

      // 휴지통 UI 갱신
      if (document.getElementById("trash-bin-modal")) {
        app.renderTrashBinList();
      }
      // 메인 목록 갱신
      app.renderSavedTexts();

      try {
        const docRef = window.firebaseDoc(
          app.db,
          "users",
          app.currentUser.uid,
          "texts",
          id
        );

        await window.firebaseUpdateDoc(docRef, {
          isDeleted: false,
          deletedAt: window.firebaseDeleteField(),
        });

        app.showMessage("글이 복원되었습니다.", "success");
      } catch (error) {
        console.error("복원 실패:", error);
        // 롤백
        itemToRestore.isDeleted = true;
        itemToRestore.deletedAt = new Date().toISOString();
        if (document.getElementById("trash-bin-modal")) {
          app.renderTrashBinList();
        }
        app.showMessage("복원에 실패했습니다.", "error");
      }
    } catch (error) {
      console.error("복원 오류:", error);
    }
  }

  // ==================== 영구 삭제 (Phase 8-02) ====================

  /**
   * 글 영구 삭제 (Permanently Delete)
   * @param {string} id - 삭제할 글 ID
   */
  async permanentlyDeleteText(id) {
    const app = this.mainApp;
    console.log("영구 삭제 버튼 클릭:", { id });

    if (!app.currentUser || !app.isFirebaseReady) return;

    try {
      const targetIndex = app.savedTexts.findIndex((saved) => saved.id === id);
      if (targetIndex === -1) {
        console.warn("삭제할 아이템을 찾을 수 없습니다:", id);
        return;
      }

      if (
        !confirm(
          "정말로 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 연결된 트래킹 데이터도 모두 삭제됩니다."
        )
      ) {
        return;
      }

      const itemToDelete = app.savedTexts[targetIndex];

      // 연결된 트래킹 포스트 찾기
      const postsRef = window.firebaseCollection(
        app.db,
        "users",
        app.currentUser.uid,
        "posts"
      );
      const q = window.firebaseQuery(
        postsRef,
        window.firebaseWhere("sourceTextId", "==", id)
      );
      const querySnapshot = await window.firebaseGetDocs(q);

      const connectedPosts = [];
      querySnapshot.forEach((doc) => {
        connectedPosts.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // 낙관적 업데이트: 배열에서 제거
      app.savedTexts.splice(targetIndex, 1);
      app.renderSavedTextsCache = null;
      app.renderSavedTextsCacheKey = null;

      if (document.getElementById("trash-bin-modal")) {
        app.renderTrashBinList();
      }

      try {
        // 실제 Firestore 삭제
        const deletePromises = connectedPosts.map((post) => {
          const postRef = window.firebaseDoc(
            app.db,
            "users",
            app.currentUser.uid,
            "posts",
            post.id
          );
          return window.firebaseDeleteDoc(postRef);
        });

        await Promise.all([
          ...deletePromises,
          window.firebaseDeleteDoc(
            window.firebaseDoc(
              app.db,
              "users",
              app.currentUser.uid,
              "texts",
              id
            )
          ),
        ]);

        app.showMessage("영구 삭제되었습니다.", "success");
      } catch (error) {
        console.error("영구 삭제 실패:", error);
        app.showMessage(
          "영구 삭제 중 오류가 발생했습니다. 새로고침 해주세요.",
          "error"
        );
        app.loadSavedTexts(true);
      }
    } catch (error) {
      console.error("영구 삭제 오류:", error);
    }
  }
}
