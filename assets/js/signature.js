/* assets/js/signature.js */
/**
 * Filewise Electronic Signature Maker
 * Pure Vanilla JavaScript & HTML5 Canvas API
 */

(function () {
  "use strict";

  // State variables
  let canvas = null;
  let ctx = null;
  let canvasContainer = null;
  let placeholder = null;
  let statusMsg = null;

  // Drawing settings
  let currentColor = "#111827";
  let currentWidth = 4;
  let selectedBg = "transparent"; // "transparent" or "white"

  // Drawing tracking
  let isDrawing = false;
  let currentPointerId = null;
  let currentStroke = null;
  const strokes = []; // Array of { color: string, width: number, points: Array<{x: number, y: number}> }

  // Cached DOM elements
  let undoBtn = null;
  let clearBtn = null;
  let downloadSelectedBtn = null;
  let downloadTransparentBtn = null;
  let downloadWhiteBtn = null;
  let downloadSelectedLabel = null;
  let penWidthSlider = null;
  let penWidthDisplay = null;
  let colorButtons = [];
  let widthPresetButtons = [];
  let bgRadioInputs = [];
  let bgSelectorLabels = [];

  /**
   * Initialize on DOM ready
   */
  document.addEventListener("DOMContentLoaded", function () {
    initDOM();
    initCanvas();
    initToolbar();
    initBackgroundOptions();
    initDownloadButtons();
    updateUIState();
  });

  /**
   * Cache DOM elements
   */
  function initDOM() {
    canvas = document.getElementById("signature-canvas");
    canvasContainer = document.getElementById("signature-canvas-container");
    placeholder = document.getElementById("canvas-placeholder");
    statusMsg = document.getElementById("signature-status-msg");

    undoBtn = document.getElementById("btn-undo");
    clearBtn = document.getElementById("btn-clear");
    downloadSelectedBtn = document.getElementById("btn-download-selected");
    downloadTransparentBtn = document.getElementById("btn-download-transparent");
    downloadWhiteBtn = document.getElementById("btn-download-white");
    downloadSelectedLabel = document.getElementById("download-selected-label");

    penWidthSlider = document.getElementById("pen-width-slider");
    penWidthDisplay = document.getElementById("pen-width-display");

    colorButtons = Array.from(document.querySelectorAll(".color-btn"));
    widthPresetButtons = Array.from(document.querySelectorAll(".width-preset-btn"));
    bgRadioInputs = Array.from(document.querySelectorAll('input[name="signature-bg"]'));
    bgSelectorLabels = Array.from(document.querySelectorAll(".bg-selector-item"));
  }

  /**
   * Setup Canvas dimensions with devicePixelRatio
   */
  function initCanvas() {
    if (!canvas) return;
    ctx = canvas.getContext("2d", { willReadFrequently: false });

    // Set canvas dimensions
    resizeCanvas(false);

    // Attach Pointer Events for unified PC Mouse & Mobile Touch support
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    // Prevent default touch gestures (e.g. pinch-zoom, pull-down refresh)
    canvas.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    // Resize observer for container dimension changes (window resize / screen rotation)
    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeCanvas(true);
      }, 100);
    });
    if (canvasContainer) {
      resizeObserver.observe(canvasContainer);
    }
  }

  /**
   * Resize canvas matching container with high-DPI scaling
   * and redraw existing strokes so nothing is lost
   */
  function resizeCanvas(shouldRedraw) {
    if (!canvas || !canvasContainer) return;

    const rect = canvasContainer.getBoundingClientRect();
    const cssWidth = Math.floor(rect.width);
    const cssHeight = Math.floor(rect.height);

    if (cssWidth <= 0 || cssHeight <= 0) return;

    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    if (ctx.resetTransform) {
      ctx.resetTransform();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(dpr, dpr);

    if (shouldRedraw) {
      redrawAllStrokes();
    }
  }

  /**
   * Pointer event coordinates relative to canvas
   */
  function getCanvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      cssX: event.clientX - rect.left,
      cssY: event.clientY - rect.top,
      normX: (event.clientX - rect.left) / rect.width,
      normY: (event.clientY - rect.top) / rect.height
    };
  }

  /**
   * Pointer Down - start new stroke
   */
  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return; // Only primary button
    event.preventDefault();

    try {
      canvas.setPointerCapture(event.pointerId);
      currentPointerId = event.pointerId;
    } catch (err) {
      // In some older environments setPointerCapture may fail gracefully
    }

    isDrawing = true;
    canvasContainer.classList.add("is-active");

    const coords = getCanvasCoords(event);
    currentStroke = {
      color: currentColor,
      width: currentWidth,
      points: [{ x: coords.normX, y: coords.normY }]
    };

    // Draw immediate dot for single tap
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(coords.normX * rect.width, coords.normY * rect.height, currentWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    hidePlaceholder();
  }

  /**
   * Pointer Move - append points and render line segment
   */
  function handlePointerMove(event) {
    if (!isDrawing || !currentStroke) return;
    event.preventDefault();

    const coords = getCanvasCoords(event);
    const prevPoint = currentStroke.points[currentStroke.points.length - 1];
    currentStroke.points.push({ x: coords.normX, y: coords.normY });

    const rect = canvas.getBoundingClientRect();
    const prevCssX = prevPoint.x * rect.width;
    const prevCssY = prevPoint.y * rect.height;
    const currCssX = coords.normX * rect.width;
    const currCssY = coords.normY * rect.height;

    ctx.save();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prevCssX, prevCssY);
    ctx.lineTo(currCssX, currCssY);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Pointer Up - finalize stroke
   */
  function handlePointerUp(event) {
    if (!isDrawing) return;
    event.preventDefault();

    if (currentPointerId !== null) {
      try {
        canvas.releasePointerCapture(currentPointerId);
      } catch (err) {}
      currentPointerId = null;
    }

    isDrawing = false;
    canvasContainer.classList.remove("is-active");

    if (currentStroke && currentStroke.points.length > 0) {
      strokes.push(currentStroke);
    }
    currentStroke = null;

    updateUIState();
  }

  function handlePointerCancel(event) {
    handlePointerUp(event);
  }

  function handlePointerLeave(event) {
    // If pointer is captured, move will continue even outside
    if (!canvas.hasPointerCapture || !canvas.hasPointerCapture(event.pointerId)) {
      if (isDrawing) {
        handlePointerUp(event);
      }
    }
  }

  /**
   * Redraw all saved strokes onto canvas
   */
  function redrawAllStrokes() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    for (let s = 0; s < strokes.length; s++) {
      const stroke = strokes[s];
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.points.length === 1) {
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        const p = stroke.points[0];
        ctx.arc(p.x * rect.width, p.y * rect.height, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        const p0 = stroke.points[0];
        ctx.moveTo(p0.x * rect.width, p0.y * rect.height);
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          ctx.lineTo(pt.x * rect.width, pt.y * rect.height);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Undo last stroke
   */
  function undoLastStroke() {
    if (strokes.length === 0) return;
    strokes.pop();
    redrawAllStrokes();
    updateUIState();
    showStatus("마지막 획을 취소했습니다.");
  }

  /**
   * Clear all strokes
   */
  function clearAllStrokes() {
    if (strokes.length === 0) return;
    strokes.length = 0;
    redrawAllStrokes();
    updateUIState();
    showStatus("서명이 전체 지워졌습니다.");
  }

  /**
   * Hide / show placeholder
   */
  function hidePlaceholder() {
    if (placeholder) placeholder.classList.add("is-hidden");
  }

  function showPlaceholder() {
    if (placeholder && strokes.length === 0 && !isDrawing) {
      placeholder.classList.remove("is-hidden");
    }
  }

  /**
   * Update UI button states based on signature content
   */
  function updateUIState() {
    const hasSignature = strokes.length > 0;

    if (undoBtn) undoBtn.disabled = !hasSignature;
    if (clearBtn) clearBtn.disabled = !hasSignature;
    if (downloadSelectedBtn) downloadSelectedBtn.disabled = !hasSignature;
    if (downloadTransparentBtn) downloadTransparentBtn.disabled = !hasSignature;
    if (downloadWhiteBtn) downloadWhiteBtn.disabled = !hasSignature;

    if (hasSignature) {
      hidePlaceholder();
      showStatus("서명이 작성되었습니다. 원하는 배경을 선택하여 다운로드하세요.", "is-success");
    } else {
      showPlaceholder();
      showStatus("서명을 캔버스에 작성하면 다운로드 버튼이 활성화됩니다.");
    }
  }

  /**
   * Status message display
   */
  function showStatus(text, modifierClass) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.className = "status-message" + (modifierClass ? " " + modifierClass : "");
  }

  /**
   * Toolbar controls setup (Color, Width, Undo, Clear)
   */
  function initToolbar() {
    // 1. Color selector buttons
    colorButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const color = btn.getAttribute("data-color");
        if (!color) return;

        currentColor = color;
        colorButtons.forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-checked", String(b === btn));
        });
      });
    });

    // 2. Pen width slider
    if (penWidthSlider) {
      penWidthSlider.addEventListener("input", function () {
        setPenWidth(Number(penWidthSlider.value));
      });
    }

    // 3. Pen width preset buttons
    widthPresetButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const size = Number(btn.getAttribute("data-size"));
        if (!size) return;
        setPenWidth(size);
      });
    });

    // 4. Edit actions
    if (undoBtn) {
      undoBtn.addEventListener("click", undoLastStroke);
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", clearAllStrokes);
    }
  }

  /**
   * Set pen width and sync slider & presets
   */
  function setPenWidth(size) {
    currentWidth = Math.max(2, Math.min(10, size));
    if (penWidthSlider) penWidthSlider.value = String(currentWidth);
    if (penWidthDisplay) penWidthDisplay.textContent = currentWidth + "px";

    widthPresetButtons.forEach(function (b) {
      const bSize = Number(b.getAttribute("data-size"));
      b.classList.toggle("is-active", bSize === currentWidth);
    });
  }

  /**
   * Background options (Transparent vs White)
   */
  function initBackgroundOptions() {
    bgRadioInputs.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        selectedBg = radio.value; // "transparent" or "white"
        syncBgUI();
      });
    });

    bgSelectorLabels.forEach(function (label) {
      label.addEventListener("click", function () {
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          selectedBg = radio.value;
          syncBgUI();
        }
      });
    });

    syncBgUI();
  }

  function syncBgUI() {
    bgSelectorLabels.forEach(function (label) {
      const radio = label.querySelector('input[type="radio"]');
      const isChecked = radio && radio.value === selectedBg;
      label.classList.toggle("is-selected", Boolean(isChecked));
    });

    if (downloadSelectedLabel) {
      const bgName = selectedBg === "white" ? "흰색 배경" : "투명 배경";
      downloadSelectedLabel.textContent = `PNG 다운로드 (${bgName})`;
    }
  }

  /**
   * Download buttons initialization
   */
  function initDownloadButtons() {
    // 1. Primary download button (respects radio selection)
    if (downloadSelectedBtn) {
      downloadSelectedBtn.addEventListener("click", function () {
        exportSignature(selectedBg);
      });
    }

    // 2. Direct Transparent PNG download button
    if (downloadTransparentBtn) {
      downloadTransparentBtn.addEventListener("click", function () {
        exportSignature("transparent");
      });
    }

    // 3. Direct White PNG download button
    if (downloadWhiteBtn) {
      downloadWhiteBtn.addEventListener("click", function () {
        exportSignature("white");
      });
    }
  }

  /**
   * Export Signature to PNG with selected background
   * Client-side only with high resolution crispness
   */
  function exportSignature(bgType) {
    if (strokes.length === 0) {
      showStatus("다운로드할 서명이 없습니다. 캔버스에 먼저 서명해 주세요.", "is-warning");
      alert("서명을 먼저 작성해 주세요.");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const exportDpr = Math.max(window.devicePixelRatio || 1, 2); // At least 2x for sharp print/contract quality
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.round(rect.width * exportDpr);
    offscreen.height = Math.round(rect.height * exportDpr);

    const offCtx = offscreen.getContext("2d");
    if (!offCtx) {
      showStatus("이미지 변환에 실패했습니다.", "is-warning");
      return;
    }

    // Apply Background
    if (bgType === "white") {
      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    }
    // If transparent, canvas is transparent by default!

    // Scale context for export
    offCtx.scale(exportDpr, exportDpr);

    // Draw all strokes
    for (let s = 0; s < strokes.length; s++) {
      const stroke = strokes[s];
      if (!stroke.points || stroke.points.length === 0) continue;

      offCtx.save();
      offCtx.strokeStyle = stroke.color;
      offCtx.lineWidth = stroke.width;
      offCtx.lineCap = "round";
      offCtx.lineJoin = "round";

      if (stroke.points.length === 1) {
        offCtx.fillStyle = stroke.color;
        offCtx.beginPath();
        const p = stroke.points[0];
        offCtx.arc(p.x * rect.width, p.y * rect.height, stroke.width / 2, 0, Math.PI * 2);
        offCtx.fill();
      } else {
        offCtx.beginPath();
        const p0 = stroke.points[0];
        offCtx.moveTo(p0.x * rect.width, p0.y * rect.height);
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          offCtx.lineTo(pt.x * rect.width, pt.y * rect.height);
        }
        offCtx.stroke();
      }
      offCtx.restore();
    }

    // Generate PNG Blob and trigger client-side download
    offscreen.toBlob(function (blob) {
      if (!blob) {
        showStatus("PNG 파일 생성에 실패했습니다.", "is-warning");
        return;
      }

      const fileName = "filewise-signature.png";
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setTimeout(function () {
        URL.revokeObjectURL(blobUrl);
      }, 1500);

      const bgText = bgType === "white" ? "흰색 배경" : "투명 배경";
      showStatus(`${bgText} PNG 서명 파일이 다운로드되었습니다 (${fileName}).`, "is-success");
    }, "image/png");
  }
})();
