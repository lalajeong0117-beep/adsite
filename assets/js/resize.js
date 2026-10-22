/* assets/js/resize.js */
/**
 * Filewise Image Resizer
 * Pure Vanilla JavaScript & HTML5 Canvas API
 */

(function () {
  "use strict";

  // Limits
  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
  const MAX_DIMENSION = 8000; // 8,000 px
  const MAX_TOTAL_PIXELS = 32000000; // 32 MP

  // State
  let originalImage = null;
  let originalWidth = 0;
  let originalHeight = 0;
  let originalSize = 0;
  let originalFilename = "";
  let originalType = "";
  let originalObjectUrl = null;

  let convertedBlob = null;
  let convertedObjectUrl = null;
  let isConverting = false;
  let isAspectLocked = true;
  let activePreviewMode = "result"; // "result" or "original"

  // DOM Elements
  let uploadCard = null;
  let editorCard = null;
  let uploadZone = null;
  let fileInput = null;
  let btnSelectFile = null;
  let uploadErrorAlert = null;
  let uploadErrorMsg = null;

  let metaFilename = null;
  let metaOriginalDim = null;
  let metaOriginalSize = null;
  let btnChangeImage = null;
  let btnResetAll = null;

  let tabResultPreview = null;
  let tabOriginalPreview = null;
  let previewImage = null;
  let previewDimBadge = null;
  let previewStatusText = null;

  let inputWidth = null;
  let inputHeight = null;
  let btnLockAspect = null;
  let aspectLockCaption = null;
  let aspectNoticeText = null;
  let btnResetDimensions = null;
  let presetButtons = [];

  let formatRadioItems = [];
  let formatRadios = [];
  let currentFormat = "jpg"; // 'jpg', 'png', 'webp'
  let qualityControlWrap = null;
  let inputQuality = null;
  let qualityValBadge = null;
  let pngQualityNotice = null;

  let btnApplyResize = null;
  let btnDownloadImage = null;
  let conversionResultSummary = null;
  let resultMetaDim = null;
  let resultMetaSize = null;
  let resultMetaFilename = null;
  let actionAlert = null;

  /**
   * DOM Ready
   */
  document.addEventListener("DOMContentLoaded", function () {
    initDOM();
    initUpload();
    initDimensionControls();
    initPresets();
    initFormatAndQuality();
    initConversionAndDownload();
  });

  /**
   * Cache DOM Elements
   */
  function initDOM() {
    uploadCard = document.getElementById("upload-card");
    editorCard = document.getElementById("editor-card");
    uploadZone = document.getElementById("resize-upload-zone");
    fileInput = document.getElementById("resize-file-input");
    btnSelectFile = document.getElementById("btn-select-file");
    uploadErrorAlert = document.getElementById("upload-error-alert");
    uploadErrorMsg = document.getElementById("upload-error-msg");

    metaFilename = document.getElementById("meta-filename");
    metaOriginalDim = document.getElementById("meta-original-dim");
    metaOriginalSize = document.getElementById("meta-original-size");
    btnChangeImage = document.getElementById("btn-change-image");
    btnResetAll = document.getElementById("btn-reset-all");

    tabResultPreview = document.getElementById("tab-result-preview");
    tabOriginalPreview = document.getElementById("tab-original-preview");
    previewImage = document.getElementById("preview-image");
    previewDimBadge = document.getElementById("preview-dim-badge");
    previewStatusText = document.getElementById("preview-status-text");

    inputWidth = document.getElementById("input-width");
    inputHeight = document.getElementById("input-height");
    btnLockAspect = document.getElementById("btn-lock-aspect");
    aspectLockCaption = document.getElementById("aspect-lock-caption");
    aspectNoticeText = document.getElementById("aspect-notice-text");
    btnResetDimensions = document.getElementById("btn-reset-dimensions");
    presetButtons = Array.from(document.querySelectorAll(".preset-btn"));

    formatRadioItems = Array.from(document.querySelectorAll(".format-option-item"));
    formatRadios = Array.from(document.querySelectorAll('input[name="output-format"]'));
    qualityControlWrap = document.getElementById("quality-control-wrap");
    inputQuality = document.getElementById("input-quality");
    qualityValBadge = document.getElementById("quality-val-badge");
    pngQualityNotice = document.getElementById("png-quality-notice");

    btnApplyResize = document.getElementById("btn-apply-resize");
    btnDownloadImage = document.getElementById("btn-download-image");
    conversionResultSummary = document.getElementById("conversion-result-summary");
    resultMetaDim = document.getElementById("result-meta-dim");
    resultMetaSize = document.getElementById("result-meta-size");
    resultMetaFilename = document.getElementById("result-meta-filename");
    actionAlert = document.getElementById("action-alert");
  }

  /**
   * Helper: Format file size
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 바이트";
    const units = ["바이트", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
  }

  /**
   * Helper: Show Upload Error
   */
  function showUploadError(message) {
    if (!uploadErrorAlert || !uploadErrorMsg) return;
    uploadErrorMsg.textContent = message;
    uploadErrorAlert.hidden = false;
  }

  function hideUploadError() {
    if (uploadErrorAlert) uploadErrorAlert.hidden = true;
  }

  /**
   * Upload & Drag & Drop Handling
   */
  function initUpload() {
    if (!uploadZone || !fileInput) return;

    // Trigger file chooser on zone click
    uploadZone.addEventListener("click", function () {
      fileInput.click();
    });

    uploadZone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        handleIncomingFile(fileInput.files[0]);
      }
    });

    // Drag and Drop
    uploadZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      uploadZone.classList.add("is-dragover");
    });

    uploadZone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      uploadZone.classList.remove("is-dragover");
    });

    uploadZone.addEventListener("drop", function (e) {
      e.preventDefault();
      uploadZone.classList.remove("is-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleIncomingFile(e.dataTransfer.files[0]);
      }
    });

    // Editor Header Actions
    if (btnChangeImage) {
      btnChangeImage.addEventListener("click", function () {
        fileInput.value = "";
        fileInput.click();
      });
    }

    if (btnResetAll) {
      btnResetAll.addEventListener("click", resetAll);
    }
  }

  /**
   * Process incoming file (validate, decode, setup)
   */
  function handleIncomingFile(file) {
    hideUploadError();

    // 1. File Type Check
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    const ext = file.name.split(".").pop().toLowerCase();
    const isImageExt = ["jpg", "jpeg", "png", "webp"].includes(ext);

    if (!validMimes.includes(file.type) && !isImageExt) {
      showUploadError("지원하지 않는 파일 형식입니다. JPG, PNG, WEBP 파일만 업로드할 수 있습니다.");
      return;
    }

    // 2. File Size Check (15 MB)
    if (file.size > MAX_FILE_SIZE) {
      showUploadError(`파일 크기는 15MB 이하여야 합니다. (선택한 파일: ${formatFileSize(file.size)})`);
      return;
    }

    if (file.size === 0) {
      showUploadError("빈 파일은 처리할 수 없습니다.");
      return;
    }

    // 3. Decode Image with Image() object
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      // Clean up any previous image url
      if (originalObjectUrl) {
        URL.revokeObjectURL(originalObjectUrl);
      }
      if (convertedObjectUrl) {
        URL.revokeObjectURL(convertedObjectUrl);
        convertedObjectUrl = null;
      }

      originalImage = img;
      originalWidth = img.naturalWidth || img.width;
      originalHeight = img.naturalHeight || img.height;
      originalSize = file.size;
      originalFilename = file.name;
      originalType = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
      originalObjectUrl = objectUrl;

      // Populate Meta in Editor
      if (metaFilename) metaFilename.textContent = originalFilename;
      if (metaOriginalDim) metaOriginalDim.textContent = `${originalWidth} × ${originalHeight} px`;
      if (metaOriginalSize) metaOriginalSize.textContent = formatFileSize(originalSize);

      // Set input values
      if (inputWidth) inputWidth.value = String(originalWidth);
      if (inputHeight) inputHeight.value = String(originalHeight);

      // Show editor, hide upload
      uploadCard.hidden = true;
      editorCard.hidden = false;

      // Set preview image
      setPreviewDisplay(originalObjectUrl, originalWidth, originalHeight);
      updateStatus("원본 이미지가 준비되었습니다. 원하는 크기를 입력한 뒤 [이미지 크기 변경]을 눌러주세요.");

      // Reset conversion
      resetConversionState();
      syncPresetButtons();
    };

    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      showUploadError("이미지 파일을 디코딩하지 못했습니다. 파일이 손상되었는지 확인해 주세요.");
    };

    img.src = objectUrl;
  }

  /**
   * Reset all state to clean start
   */
  function resetAll() {
    if (originalObjectUrl) URL.revokeObjectURL(originalObjectUrl);
    if (convertedObjectUrl) URL.revokeObjectURL(convertedObjectUrl);

    originalImage = null;
    originalWidth = 0;
    originalHeight = 0;
    originalSize = 0;
    originalFilename = "";
    originalObjectUrl = null;
    convertedBlob = null;
    convertedObjectUrl = null;

    if (fileInput) fileInput.value = "";
    if (editorCard) editorCard.hidden = true;
    if (uploadCard) uploadCard.hidden = false;
    hideUploadError();
    resetConversionState();
  }

  function resetConversionState() {
    convertedBlob = null;
    if (convertedObjectUrl) {
      URL.revokeObjectURL(convertedObjectUrl);
      convertedObjectUrl = null;
    }
    if (btnDownloadImage) btnDownloadImage.disabled = true;
    if (conversionResultSummary) conversionResultSummary.hidden = true;
    if (actionAlert) {
      actionAlert.textContent = "";
      actionAlert.className = "action-alert";
    }
    setPreviewTab("result");
  }

  /**
   * Preview display update
   */
  function setPreviewDisplay(src, w, h) {
    if (!previewImage) return;
    previewImage.src = src;
    if (previewDimBadge) {
      previewDimBadge.textContent = `${w} × ${h} px`;
    }
  }

  function updateStatus(text, isError) {
    if (!previewStatusText) return;
    previewStatusText.textContent = text;
    previewStatusText.style.color = isError ? "#dc2626" : "var(--color-muted)";
  }

  /**
   * Preview Tabs (Result vs Original)
   */
  function initPreviewTabs() {
    if (tabResultPreview) {
      tabResultPreview.addEventListener("click", function () {
        setPreviewTab("result");
      });
    }

    if (tabOriginalPreview) {
      tabOriginalPreview.addEventListener("click", function () {
        setPreviewTab("original");
      });
    }
  }

  function setPreviewTab(tab) {
    activePreviewMode = tab;
    if (tabResultPreview) {
      tabResultPreview.classList.toggle("is-active", tab === "result");
      tabResultPreview.setAttribute("aria-selected", String(tab === "result"));
    }
    if (tabOriginalPreview) {
      tabOriginalPreview.classList.toggle("is-active", tab === "original");
      tabOriginalPreview.setAttribute("aria-selected", String(tab === "original"));
    }

    if (tab === "original" && originalObjectUrl) {
      setPreviewDisplay(originalObjectUrl, originalWidth, originalHeight);
    } else if (tab === "result") {
      if (convertedObjectUrl && convertedBlob) {
        const curW = Number(inputWidth.value) || originalWidth;
        const curH = Number(inputHeight.value) || originalHeight;
        setPreviewDisplay(convertedObjectUrl, curW, curH);
      } else if (originalObjectUrl) {
        setPreviewDisplay(originalObjectUrl, originalWidth, originalHeight);
      }
    }
  }

  /**
   * Dimensions & Aspect Ratio Controls
   */
  function initDimensionControls() {
    initPreviewTabs();

    // 1. Aspect Ratio Lock Toggle
    if (btnLockAspect) {
      btnLockAspect.addEventListener("click", function () {
        isAspectLocked = !isAspectLocked;
        btnLockAspect.classList.toggle("is-locked", isAspectLocked);

        if (aspectLockCaption) {
          aspectLockCaption.textContent = isAspectLocked ? "비율 유지 ON" : "비율 유지 OFF";
        }
        if (aspectNoticeText) {
          aspectNoticeText.textContent = isAspectLocked
            ? "비율 유지가 켜져 있어 가로나 세로 한쪽만 변경해도 다른 한쪽이 자동 계산됩니다."
            : "비율 유지가 꺼져 있어 가로·세로를 독립적으로 변경할 수 있습니다 (이미지가 왜곡될 수 있음).";
        }
      });
    }

    // 2. Width Input change
    if (inputWidth) {
      inputWidth.addEventListener("input", function () {
        const w = Number(inputWidth.value);
        if (isAspectLocked && originalWidth > 0 && w > 0) {
          const ratio = originalHeight / originalWidth;
          const newH = Math.max(1, Math.round(w * ratio));
          if (inputHeight) inputHeight.value = String(newH);
        }
        onDimensionSettingsChanged();
      });
    }

    // 3. Height Input change
    if (inputHeight) {
      inputHeight.addEventListener("input", function () {
        const h = Number(inputHeight.value);
        if (isAspectLocked && originalHeight > 0 && h > 0) {
          const ratio = originalWidth / originalHeight;
          const newW = Math.max(1, Math.round(h * ratio));
          if (inputWidth) inputWidth.value = String(newW);
        }
        onDimensionSettingsChanged();
      });
    }

    // 4. Reset to Original Dimensions
    if (btnResetDimensions) {
      btnResetDimensions.addEventListener("click", function () {
        if (originalWidth > 0 && originalHeight > 0) {
          if (inputWidth) inputWidth.value = String(originalWidth);
          if (inputHeight) inputHeight.value = String(originalHeight);
          onDimensionSettingsChanged();
        }
      });
    }
  }

  function onDimensionSettingsChanged() {
    syncPresetButtons();
    if (convertedBlob) {
      // Mark as outdated
      if (btnDownloadImage) btnDownloadImage.disabled = true;
      updateStatus("크기가 변경되었습니다. [이미지 크기 변경] 버튼을 다시 눌러주세요.");
    }
  }

  /**
   * Scale Presets (25%, 50%, 75%, 100%, 150%, 200% relative to original!)
   */
  function initPresets() {
    presetButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!originalImage || originalWidth === 0) return;
        const scale = Number(btn.getAttribute("data-scale"));
        if (!scale) return;

        const targetW = Math.max(1, Math.round(originalWidth * scale));
        const targetH = Math.max(1, Math.round(originalHeight * scale));

        // Dimension bound check
        if (targetW > MAX_DIMENSION || targetH > MAX_DIMENSION || (targetW * targetH) > MAX_TOTAL_PIXELS) {
          showActionAlert(`최대 픽셀 크기(${MAX_DIMENSION}px)를 초과하여 해당 프리셋을 적용할 수 없습니다.`, "is-error");
          return;
        }

        if (inputWidth) inputWidth.value = String(targetW);
        if (inputHeight) inputHeight.value = String(targetH);

        presetButtons.forEach(b => b.classList.toggle("is-active", b === btn));
        onDimensionSettingsChanged();
      });
    });
  }

  function syncPresetButtons() {
    const curW = Number(inputWidth.value);
    const curH = Number(inputHeight.value);

    presetButtons.forEach(function (b) {
      const scale = Number(b.getAttribute("data-scale"));
      const matchW = Math.max(1, Math.round(originalWidth * scale));
      const matchH = Math.max(1, Math.round(originalHeight * scale));
      b.classList.toggle("is-active", curW === matchW && curH === matchH);
    });
  }

  /**
   * Format & Quality Controls
   */
  function initFormatAndQuality() {
    formatRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        setFormat(radio.value);
      });
    });

    formatRadioItems.forEach(function (item) {
      item.addEventListener("click", function () {
        const radio = item.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          setFormat(radio.value);
        }
      });
    });

    if (inputQuality) {
      inputQuality.addEventListener("input", function () {
        if (qualityValBadge) {
          qualityValBadge.textContent = `${inputQuality.value}%`;
        }
        if (convertedBlob) {
          if (btnDownloadImage) btnDownloadImage.disabled = true;
          updateStatus("품질 설정이 변경되었습니다. [이미지 크기 변경] 버튼을 다시 눌러주세요.");
        }
      });
    }
  }

  function setFormat(fmt) {
    currentFormat = fmt; // 'jpg', 'png', 'webp'
    formatRadioItems.forEach(function (item) {
      const radio = item.querySelector('input[type="radio"]');
      item.classList.toggle("is-selected", radio && radio.value === currentFormat);
    });

    // Handle quality slider visibility for PNG
    if (currentFormat === "png") {
      if (qualityControlWrap) qualityControlWrap.hidden = true;
      if (pngQualityNotice) pngQualityNotice.hidden = false;
    } else {
      if (qualityControlWrap) qualityControlWrap.hidden = false;
      if (pngQualityNotice) pngQualityNotice.hidden = true;
    }

    if (convertedBlob) {
      if (btnDownloadImage) btnDownloadImage.disabled = true;
      updateStatus("출력 형식이 변경되었습니다. [이미지 크기 변경] 버튼을 다시 눌러주세요.");
    }
  }

  /**
   * Conversion & Download Execution
   */
  function initConversionAndDownload() {
    if (btnApplyResize) {
      btnApplyResize.addEventListener("click", performResize);
    }

    if (btnDownloadImage) {
      btnDownloadImage.addEventListener("click", triggerDownload);
    }
  }

  function showActionAlert(msg, typeClass) {
    if (!actionAlert) return;
    actionAlert.textContent = msg;
    actionAlert.className = "action-alert" + (typeClass ? " " + typeClass : "");
  }

  /**
   * Perform Resize via Canvas API
   */
  function performResize() {
    if (isConverting) return;
    if (!originalImage || !originalWidth) {
      showActionAlert("처리할 원본 이미지가 없습니다. 먼저 이미지를 업로드해 주세요.", "is-error");
      return;
    }

    const targetW = Number(inputWidth.value);
    const targetH = Number(inputHeight.value);

    // Bounds validation
    if (!targetW || targetW <= 0 || !targetH || targetH <= 0) {
      showActionAlert("가로와 세로 크기는 1px 이상이어야 합니다.", "is-error");
      return;
    }

    if (targetW > MAX_DIMENSION || targetH > MAX_DIMENSION) {
      showActionAlert(`가로와 세로 크기는 최대 ${MAX_DIMENSION.toLocaleString()}px 이하여야 합니다.`, "is-error");
      return;
    }

    const totalPixels = targetW * targetH;
    if (totalPixels > MAX_TOTAL_PIXELS) {
      showActionAlert(`총 픽셀 수(${totalPixels.toLocaleString()}px)가 최대 허용치(${MAX_TOTAL_PIXELS.toLocaleString()}px)를 초과했습니다. 크기를 줄여주세요.`, "is-error");
      return;
    }

    isConverting = true;
    btnApplyResize.disabled = true;
    showActionAlert("이미지 크기 변경 처리 중...", "");
    updateStatus("고화질 리샘플링 변환 중입니다...");

    // Execute asynchronously to allow UI repaint
    setTimeout(function () {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("2D 캔버스 컨텍스트를 생성하지 못했습니다.");
        }

        // High quality smoothing settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // If JPG, fill white background to avoid transparent black artifacts
        if (currentFormat === "jpg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetW, targetH);
        }

        // Draw and resize image
        ctx.drawImage(originalImage, 0, 0, targetW, targetH);

        // MIME and quality mapping
        const mimeType = currentFormat === "jpg"
          ? "image/jpeg"
          : (currentFormat === "png" ? "image/png" : "image/webp");

        const quality = (currentFormat === "png")
          ? undefined
          : Math.max(0.1, Math.min(1.0, (Number(inputQuality ? inputQuality.value : 90) / 100)));

        canvas.toBlob(function (blob) {
          try {
            if (!blob) {
              throw new Error("이미지 Blob 데이터를 생성하지 못했습니다.");
            }

            // Clean up previous converted URL
            if (convertedObjectUrl) {
              URL.revokeObjectURL(convertedObjectUrl);
            }

            convertedBlob = blob;
            convertedObjectUrl = URL.createObjectURL(blob);

            // Update result display
            setPreviewTab("result");
            setPreviewDisplay(convertedObjectUrl, targetW, targetH);

            // Update Summary Card
            const downloadFilename = getOutputFilename();
            if (resultMetaDim) resultMetaDim.textContent = `${targetW} × ${targetH} px`;
            if (resultMetaSize) resultMetaSize.textContent = formatFileSize(blob.size);
            if (resultMetaFilename) resultMetaFilename.textContent = downloadFilename;
            if (conversionResultSummary) conversionResultSummary.hidden = false;

            // Enable download button
            if (btnDownloadImage) {
              btnDownloadImage.disabled = false;
              const downloadBtnText = document.getElementById("download-btn-text");
              if (downloadBtnText) {
                downloadBtnText.textContent = `다운로드 (${formatFileSize(blob.size)})`;
              }
            }

            showActionAlert("이미지 크기 변경이 완료되었습니다!", "is-success");
            updateStatus(`변환 완료: ${targetW} × ${targetH} px (${formatFileSize(blob.size)})`);
          } catch (blobErr) {
            console.error("Blob processing failed:", blobErr);
            showActionAlert(blobErr.message || "변환에 실패했습니다.", "is-error");
            updateStatus("변환 실패", true);
          } finally {
            isConverting = false;
            btnApplyResize.disabled = false;
          }
        }, mimeType, quality);
      } catch (err) {
        console.error("Canvas resize error:", err);
        showActionAlert(err.message || "이미지 크기 조절 중 오류가 발생했습니다.", "is-error");
        updateStatus("변환 중 오류 발생", true);
        isConverting = false;
        btnApplyResize.disabled = false;
      }
    }, 40);
  }

  function getOutputFilename() {
    const ext = currentFormat === "jpg" ? "jpg" : currentFormat;
    const baseName = originalFilename
      ? originalFilename.substring(0, originalFilename.lastIndexOf(".")) || "filewise"
      : "filewise";
    return `${baseName}-resized.${ext}`;
  }

  /**
   * Trigger Download of converted Blob
   */
  function triggerDownload() {
    if (!convertedBlob || !convertedObjectUrl) {
      showActionAlert("다운로드할 변환 결과가 없습니다. 먼저 [이미지 크기 변경]을 실행해 주세요.", "is-error");
      return;
    }

    const filename = getOutputFilename();
    const a = document.createElement("a");
    a.href = convertedObjectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showActionAlert(`다운로드가 시작되었습니다 (${filename}).`, "is-success");
  }
})();
