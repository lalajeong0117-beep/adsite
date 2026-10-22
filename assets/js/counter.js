/* assets/js/counter.js */
/**
 * Filewise Character & Byte Counter
 * Pure Vanilla JavaScript
 */

(function () {
  "use strict";

  // Storage Keys
  const STORAGE_TEXT_KEY = "filewise_counter_saved_text";
  const STORAGE_AUTOSAVE_KEY = "filewise_counter_autosave_active";

  // DOM Elements Cache
  let textarea = null;
  let autosaveCheckbox = null;
  let autosaveStatus = null;
  let btnClearStorage = null;
  let toastEl = null;

  // Editing buttons
  let btnCopy = null;
  let btnCleanSpaces = null;
  let btnRemoveNewlines = null;
  let btnClear = null;
  let btnUndoClear = null;
  let btnDownloadTxt = null;

  // Stat displays
  let countCharsWithSpacesEl = null;
  let countCharsNoSpacesEl = null;
  let countWordsEl = null;
  let countLinesEl = null;
  let countBytesEl = null;
  let countSentencesEl = null;
  let byteModeDescEl = null;

  // Byte mode radios & labels
  let byteModeRadios = [];
  let byteModeLabels = [];
  let currentByteMode = "utf8"; // 'utf8' or 'kr2byte'

  // Limit Checker Elements
  let limitCriterionRadios = [];
  let limitCriterionLabels = [];
  let limitPresetBtns = [];
  let customLimitInput = null;
  let limitCurrentValEl = null;
  let limitMaxValEl = null;
  let limitDiffValEl = null;
  let limitDiffIndicator = null;
  let progressFillBar = null;
  let progressPercentVal = null;
  let limitHelpText = null;
  let limitExceedAlert = null;
  let limitExceedMsg = null;

  // State
  let currentLimit = 1000;
  let currentCriterion = "with_spaces"; // 'with_spaces' or 'no_spaces'
  let lastClearedText = "";
  let toastTimer = null;
  let autosaveTimer = null;

  /**
   * Initialize on DOM Content Loaded
   */
  document.addEventListener("DOMContentLoaded", function () {
    initDOM();
    initAutoSave();
    initEditingTools();
    initByteModes();
    initLimitControls();
    attachInputEvents();

    // Initial calculation on load
    updateCalculations();
  });

  /**
   * Cache DOM Elements
   */
  function initDOM() {
    textarea = document.getElementById("counter-textarea");
    autosaveCheckbox = document.getElementById("autosave-checkbox");
    autosaveStatus = document.getElementById("autosave-status");
    btnClearStorage = document.getElementById("btn-clear-storage");
    toastEl = document.getElementById("counter-toast");

    btnCopy = document.getElementById("btn-copy");
    btnCleanSpaces = document.getElementById("btn-clean-spaces");
    btnRemoveNewlines = document.getElementById("btn-remove-newlines");
    btnClear = document.getElementById("btn-clear");
    btnUndoClear = document.getElementById("btn-undo-clear");
    btnDownloadTxt = document.getElementById("btn-download-txt");

    countCharsWithSpacesEl = document.getElementById("count-chars-with-spaces");
    countCharsNoSpacesEl = document.getElementById("count-chars-no-spaces");
    countWordsEl = document.getElementById("count-words");
    countLinesEl = document.getElementById("count-lines");
    countBytesEl = document.getElementById("count-bytes");
    countSentencesEl = document.getElementById("count-sentences");
    byteModeDescEl = document.getElementById("byte-mode-desc");

    byteModeRadios = Array.from(document.querySelectorAll('input[name="byte-mode"]'));
    byteModeLabels = Array.from(document.querySelectorAll(".byte-mode-item"));

    limitCriterionRadios = Array.from(document.querySelectorAll('input[name="limit-criterion"]'));
    limitCriterionLabels = Array.from(document.querySelectorAll(".limit-crit-btn"));
    limitPresetBtns = Array.from(document.querySelectorAll(".limit-preset-btn"));
    customLimitInput = document.getElementById("custom-limit-input");

    limitCurrentValEl = document.getElementById("limit-current-val");
    limitMaxValEl = document.getElementById("limit-max-val");
    limitDiffValEl = document.getElementById("limit-diff-val");
    limitDiffIndicator = document.getElementById("limit-diff-indicator");
    progressFillBar = document.getElementById("progress-fill-bar");
    progressPercentVal = document.getElementById("progress-percent-val");
    limitHelpText = document.getElementById("limit-help-text");
    limitExceedAlert = document.getElementById("limit-exceed-alert");
    limitExceedMsg = document.getElementById("limit-exceed-msg");
  }

  /**
   * Event Listeners for Input & IME
   */
  function attachInputEvents() {
    if (!textarea) return;

    // input event catches both typing, pasting, and IME changes
    textarea.addEventListener("input", function () {
      updateCalculations();
      triggerAutoSave();
    });

    textarea.addEventListener("compositionend", function () {
      updateCalculations();
      triggerAutoSave();
    });
  }

  /**
   * Core Calculation Function
   */
  function updateCalculations() {
    if (!textarea) return;
    const text = textarea.value;

    // 1. 공백 포함 글자 수 (Unicode Code Points handling for surrogates/emojis)
    const charsWithSpaces = Array.from(text).length;

    // 2. 공백 제외 글자 수
    const noSpaceText = text.replace(/\s/g, "");
    const charsNoSpaces = Array.from(noSpaceText).length;

    // 3. 단어 수 (Word count)
    const trimmed = text.trim();
    const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

    // 4. 줄 수 (Line count)
    let lineCount = 0;
    if (text.length > 0) {
      lineCount = text.split(/\r\n|\r|\n/).length;
    }

    // 5. 바이트 수 (Byte count based on active mode)
    let byteCount = 0;
    if (currentByteMode === "utf8") {
      byteCount = calculateUtf8Bytes(text);
    } else {
      byteCount = calculateKorean2Bytes(text);
    }

    // 6. 문장 수 (Sentence count estimation)
    const sentenceCount = calculateSentences(text);

    // Update DOM Stat Cards
    if (countCharsWithSpacesEl) countCharsWithSpacesEl.textContent = charsWithSpaces.toLocaleString();
    if (countCharsNoSpacesEl) countCharsNoSpacesEl.textContent = charsNoSpaces.toLocaleString();
    if (countWordsEl) countWordsEl.textContent = wordCount.toLocaleString();
    if (countLinesEl) countLinesEl.textContent = lineCount.toLocaleString();
    if (countBytesEl) {
      countBytesEl.innerHTML = `${byteCount.toLocaleString()} <small>B</small>`;
    }
    if (countSentencesEl) countSentencesEl.textContent = sentenceCount.toLocaleString();

    // Update Limit Checker
    updateLimitChecker(charsWithSpaces, charsNoSpaces);
  }

  /**
   * UTF-8 Byte Calculation using TextEncoder API
   */
  function calculateUtf8Bytes(text) {
    if (!text) return 0;
    try {
      return new TextEncoder().encode(text).length;
    } catch (e) {
      // Fallback manual UTF-8 byte counter
      let bytes = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code <= 0x7f) {
          bytes += 1;
        } else if (code <= 0x7ff) {
          bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff) {
          // Surrogate pair
          bytes += 4;
          i++;
        } else {
          bytes += 3;
        }
      }
      return bytes;
    }
  }

  /**
   * Korean 2-Byte Simple Calculation Rule:
   * - Korean syllables (AC00-D7A3) & Jamo (1100-11FF, 3130-318F, A960-A97F, D7B0-D7FF): 2 bytes
   * - ASCII (00-7F): 1 byte
   * - Other unicode characters / symbols / emojis: 2 bytes
   */
  function calculateKorean2Bytes(text) {
    if (!text) return 0;
    let bytes = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      if (code <= 0x7f) {
        bytes += 1;
      } else {
        // Korean syllables, jamo, and other multi-byte characters
        bytes += 2;
      }
    }
    return bytes;
  }

  /**
   * Sentence Count Estimation
   */
  function calculateSentences(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    const matches = trimmed.match(/[.!?]+(?=\s|$)/g);
    if (matches && matches.length > 0) {
      const lastPuncIdx = Math.max(
        trimmed.lastIndexOf("."),
        trimmed.lastIndexOf("!"),
        trimmed.lastIndexOf("?")
      );
      const trailing = trimmed.substring(lastPuncIdx + 1).trim();
      return matches.length + (trailing.length > 0 ? 1 : 0);
    }
    return 1;
  }

  /**
   * Limit Checker Update
   */
  function updateLimitChecker(charsWithSpaces, charsNoSpaces) {
    const currentVal = currentCriterion === "with_spaces" ? charsWithSpaces : charsNoSpaces;
    const maxVal = currentLimit > 0 ? currentLimit : 1000;
    const diff = maxVal - currentVal;
    const percent = Math.round((currentVal / maxVal) * 100);

    if (limitCurrentValEl) limitCurrentValEl.textContent = currentVal.toLocaleString();
    if (limitMaxValEl) limitMaxValEl.textContent = maxVal.toLocaleString();

    if (limitDiffValEl) {
      if (diff >= 0) {
        limitDiffValEl.textContent = `${diff.toLocaleString()}자 남음`;
        limitDiffValEl.classList.remove("is-exceeded");
      } else {
        limitDiffValEl.textContent = `${Math.abs(diff).toLocaleString()}자 초과!`;
        limitDiffValEl.classList.add("is-exceeded");
      }
    }

    // Progress Bar Fill & Colors
    if (progressFillBar) {
      const barWidth = Math.min(Math.max(percent, 0), 100);
      progressFillBar.style.width = `${barWidth}%`;

      progressFillBar.classList.remove("status-warning", "status-exceeded");
      if (percent > 100) {
        progressFillBar.classList.add("status-exceeded");
      } else if (percent >= 90) {
        progressFillBar.classList.add("status-warning");
      }
    }

    if (progressPercentVal) {
      progressPercentVal.textContent = `${percent}%`;
    }

    // Help text & Exceed Alert Box
    if (diff < 0) {
      if (limitExceedAlert) limitExceedAlert.hidden = false;
      if (limitExceedMsg) {
        limitExceedMsg.textContent = `설정한 목표 글자 수(${maxVal.toLocaleString()}자)를 ${Math.abs(diff).toLocaleString()}자 초과했습니다. 필요 시 문장을 간결하게 다듬어보세요. (작성한 글은 삭제되지 않습니다.)`;
      }
      if (limitHelpText) {
        limitHelpText.textContent = "목표 글자 수를 초과했습니다.";
      }
    } else {
      if (limitExceedAlert) limitExceedAlert.hidden = true;
      if (limitHelpText) {
        if (percent === 100) {
          limitHelpText.textContent = "목표 글자 수를 정확히 채웠습니다.";
        } else if (percent >= 90) {
          limitHelpText.textContent = "목표 글자 수에 거의 도달했습니다.";
        } else {
          limitHelpText.textContent = "설정한 목표 글자 수까지 여유가 있습니다.";
        }
      }
    }
  }

  /**
   * Limit Controls (Presets, Custom, and Criterion)
   */
  function initLimitControls() {
    // 1. Criterion (공백 포함 vs 제외)
    limitCriterionRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        currentCriterion = radio.value; // 'with_spaces' or 'no_spaces'
        syncCriterionUI();
        updateCalculations();
      });
    });

    limitCriterionLabels.forEach(function (label) {
      label.addEventListener("click", function () {
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          currentCriterion = radio.value;
          syncCriterionUI();
          updateCalculations();
        }
      });
    });

    // 2. Limit Presets
    limitPresetBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const limit = Number(btn.getAttribute("data-limit"));
        if (!limit) return;

        currentLimit = limit;
        if (customLimitInput) customLimitInput.value = "";
        syncPresetUI(btn);
        updateCalculations();
      });
    });

    // 3. Custom Limit Input
    if (customLimitInput) {
      customLimitInput.addEventListener("input", function () {
        const val = Number(customLimitInput.value);
        if (val > 0) {
          currentLimit = val;
          limitPresetBtns.forEach(function (b) {
            b.classList.remove("is-active");
          });
          updateCalculations();
        }
      });
    }
  }

  function syncCriterionUI() {
    limitCriterionLabels.forEach(function (label) {
      const radio = label.querySelector('input[type="radio"]');
      const isChecked = radio && radio.value === currentCriterion;
      label.classList.toggle("is-active", Boolean(isChecked));
    });
  }

  function syncPresetUI(activeBtn) {
    limitPresetBtns.forEach(function (b) {
      b.classList.toggle("is-active", b === activeBtn);
    });
  }

  /**
   * Byte Mode Toggles
   */
  function initByteModes() {
    byteModeRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        setByteMode(radio.value);
      });
    });

    byteModeLabels.forEach(function (label) {
      label.addEventListener("click", function () {
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          setByteMode(radio.value);
        }
      });
    });
  }

  function setByteMode(mode) {
    currentByteMode = mode; // 'utf8' or 'kr2byte'
    byteModeLabels.forEach(function (label) {
      const radio = label.querySelector('input[type="radio"]');
      const isChecked = radio && radio.value === currentByteMode;
      label.classList.toggle("is-active", Boolean(isChecked));
    });

    if (byteModeDescEl) {
      if (currentByteMode === "utf8") {
        byteModeDescEl.textContent = "UTF-8 표준 인코딩 기준 (한글 3B, 영문 1B)";
      } else {
        byteModeDescEl.textContent = "한글 2바이트 간편 기준 (한글 2B, 기본 ASCII 1B)";
      }
    }

    updateCalculations();
  }

  /**
   * Editing Tools (Copy, Clean, Remove Newlines, Clear, Undo, TXT Download)
   */
  function initEditingTools() {
    // 1. Copy All
    if (btnCopy) {
      btnCopy.addEventListener("click", function () {
        if (!textarea) return;
        const text = textarea.value;
        if (!text) {
          showToast("복사할 텍스트가 없습니다.", "toast-info");
          return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(function () {
              showToast("전체 텍스트가 클립보드에 복사되었습니다.", "toast-success");
            })
            .catch(function () {
              fallbackCopy(text);
            });
        } else {
          fallbackCopy(text);
        }
      });
    }

    function fallbackCopy(text) {
      textarea.select();
      try {
        document.execCommand("copy");
        showToast("전체 텍스트가 클립보드에 복사되었습니다.", "toast-success");
      } catch (err) {
        showToast("클립보드 복사에 실패했습니다.", "toast-info");
      }
    }

    // 2. Clean Consecutive Spaces (Preserve newlines!)
    if (btnCleanSpaces) {
      btnCleanSpaces.addEventListener("click", function () {
        if (!textarea) return;
        const text = textarea.value;
        if (!text) return;

        // Replace 2 or more horizontal spaces/tabs with 1 space, preserving newlines
        const cleaned = text.replace(/[^\S\r\n]+/g, " ");
        if (cleaned !== text) {
          textarea.value = cleaned;
          updateCalculations();
          triggerAutoSave();
          showToast("연속된 공백을 1개로 정리했습니다 (줄바꿈 유지).", "toast-success");
        } else {
          showToast("정리할 연속 공백이 없습니다.", "toast-info");
        }
      });
    }

    // 3. Remove Newlines (Convert newlines into spaces)
    if (btnRemoveNewlines) {
      btnRemoveNewlines.addEventListener("click", function () {
        if (!textarea) return;
        const text = textarea.value;
        if (!text) return;

        const flattened = text.replace(/\r\n|\r|\n/g, " ").replace(/\s{2,}/g, " ");
        if (flattened !== text) {
          textarea.value = flattened;
          updateCalculations();
          triggerAutoSave();
          showToast("줄바꿈을 띄어쓰기로 합쳤습니다.", "toast-success");
        } else {
          showToast("제거할 줄바꿈이 없습니다.", "toast-info");
        }
      });
    }

    // 4. Clear All with Undo Support
    if (btnClear) {
      btnClear.addEventListener("click", function () {
        if (!textarea) return;
        const text = textarea.value;
        if (!text) return;

        lastClearedText = text;
        textarea.value = "";
        updateCalculations();
        triggerAutoSave();

        if (btnUndoClear) btnUndoClear.hidden = false;
        showToast("텍스트가 모두 지워졌습니다. [지운 글 복원] 버튼으로 되돌릴 수 있습니다.", "toast-info");
      });
    }

    // 5. Undo Clear
    if (btnUndoClear) {
      btnUndoClear.addEventListener("click", function () {
        if (!textarea || !lastClearedText) return;

        textarea.value = lastClearedText;
        lastClearedText = "";
        btnUndoClear.hidden = true;
        updateCalculations();
        triggerAutoSave();

        showToast("삭제했던 텍스트를 복원했습니다.", "toast-success");
      });
    }

    // 6. Download TXT
    if (btnDownloadTxt) {
      btnDownloadTxt.addEventListener("click", function () {
        if (!textarea) return;
        const text = textarea.value;
        if (!text) {
          showToast("다운로드할 텍스트가 없습니다.", "toast-info");
          return;
        }

        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "filewise-text.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1500);

        showToast("TXT 파일로 다운로드되었습니다 (filewise-text.txt).", "toast-success");
      });
    }
  }

  /**
   * LocalStorage Auto-save
   */
  function initAutoSave() {
    let autosaveActive = true;
    try {
      const storedSetting = localStorage.getItem(STORAGE_AUTOSAVE_KEY);
      if (storedSetting !== null) {
        autosaveActive = storedSetting === "true";
      }
    } catch (e) {}

    if (autosaveCheckbox) {
      autosaveCheckbox.checked = autosaveActive;
      autosaveCheckbox.addEventListener("change", function () {
        const isChecked = autosaveCheckbox.checked;
        try {
          localStorage.setItem(STORAGE_AUTOSAVE_KEY, String(isChecked));
        } catch (e) {}
        updateAutosaveStatus(isChecked);

        if (!isChecked) {
          showToast("자동 저장이 꺼졌습니다.", "toast-info");
        } else {
          triggerAutoSave();
          showToast("자동 저장이 켜졌습니다.", "toast-success");
        }
      });
    }

    // Restore text if available
    if (autosaveActive) {
      try {
        const savedText = localStorage.getItem(STORAGE_TEXT_KEY);
        if (savedText && textarea && textarea.value === "") {
          textarea.value = savedText;
        }
      } catch (e) {}
    }

    updateAutosaveStatus(autosaveActive);

    // Clear saved storage button
    if (btnClearStorage) {
      btnClearStorage.addEventListener("click", function () {
        try {
          localStorage.removeItem(STORAGE_TEXT_KEY);
          showToast("브라우저에 보관된 임시 텍스트를 삭제했습니다.", "toast-info");
        } catch (e) {}
      });
    }
  }

  function updateAutosaveStatus(active) {
    if (!autosaveStatus) return;
    if (active) {
      autosaveStatus.textContent = "임시 저장 활성";
      autosaveStatus.style.color = "#059669";
      autosaveStatus.style.background = "#ecfdf5";
    } else {
      autosaveStatus.textContent = "임시 저장 꺼짐";
      autosaveStatus.style.color = "#64748b";
      autosaveStatus.style.background = "#f1f5f9";
    }
  }

  function triggerAutoSave() {
    if (!autosaveCheckbox || !autosaveCheckbox.checked) return;
    if (!textarea) return;

    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_TEXT_KEY, textarea.value);
      } catch (e) {}
    }, 400);
  }

  /**
   * Toast notification helper
   */
  function showToast(message, typeClass) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = "counter-toast is-visible " + (typeClass || "toast-info");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 3200);
  }
})();
