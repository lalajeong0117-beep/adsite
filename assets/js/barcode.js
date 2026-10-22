/* assets/js/barcode.js */

document.addEventListener("DOMContentLoaded", function () {
  const formatInput = document.querySelector("#barcode-format");
  const dataInput = document.querySelector("#barcode-data");
  const status = document.querySelector("#barcode-status");
  const preview = document.querySelector("#barcode-preview");
  const previewArea = document.querySelector("#barcode-print-area");
  const emptyState = document.querySelector("#barcode-empty");
  const printValue = document.querySelector("#barcode-print-value");
  const previewMeta = document.querySelector("#barcode-preview-meta");
  const downloadPng = document.querySelector("#barcode-download-png");
  const downloadSvg = document.querySelector("#barcode-download-svg");
  const printButton = document.querySelector("#barcode-print");
  const contrastNote = document.querySelector("#barcode-contrast");
  const formatNames = { CODE128: "CODE 128", EAN13: "EAN-13", UPC: "UPC-A", CODE39: "CODE 39", ITF14: "ITF-14" };
  const fileNames = { CODE128: "code128", EAN13: "ean13", UPC: "upc-a", CODE39: "code39", ITF14: "itf14" };
  const controls = {
    width: document.querySelector("#barcode-width"),
    height: document.querySelector("#barcode-height"),
    lineColor: document.querySelector("#barcode-line-color"),
    backgroundColor: document.querySelector("#barcode-background-color"),
    displayValue: document.querySelector("#barcode-display-value"),
    fontSize: document.querySelector("#barcode-font-size"),
    margin: document.querySelector("#barcode-margin")
  };
  let currentResult = null;

  function checksumDigit(digits) {
    const sum = Array.from(digits, (character, index) => {
      const weight = (digits.length - index) % 2 === 1 ? 3 : 1;
      return Number(character) * weight;
    }).reduce((total, digit) => total + digit, 0);
    return String((10 - sum % 10) % 10);
  }

  function normalizeData(format, value) {
    if (!value) throw new Error("바코드 데이터를 입력해 주세요.");

    if (format === "EAN13" || format === "UPC" || format === "ITF14") {
      if (!/^\d+$/.test(value)) throw new Error(`${formatNames[format]}은 숫자만 입력할 수 있습니다.`);
      const lengths = { EAN13: [12, 13], UPC: [11, 12], ITF14: [13, 14] }[format];
      if (!lengths.includes(value.length)) {
        throw new Error(`${formatNames[format]} 데이터는 ${lengths[0]}자리 입력 또는 체크디지트를 포함한 ${lengths[1]}자리여야 합니다.`);
      }
      const hasCheckDigit = value.length === lengths[1];
      const base = hasCheckDigit ? value.slice(0, -1) : value;
      const checkDigit = checksumDigit(base);
      if (hasCheckDigit && value.at(-1) !== checkDigit) {
        throw new Error(`체크디지트가 올바르지 않습니다. 마지막 숫자는 ${checkDigit}이어야 합니다.`);
      }
      return hasCheckDigit ? value : `${value}${checkDigit}`;
    }

    if (format === "CODE39" && !/^[A-Z0-9 ./$+%-]+$/.test(value)) {
      throw new Error("CODE 39는 영문 대문자, 숫자, 공백 및 - . $ / + % 문자만 지원합니다.");
    }
    if (format === "CODE128" && !/^[\x20-\x7E]+$/.test(value)) {
      throw new Error("CODE 128은 영문, 숫자, 공백 및 기본 ASCII 기호만 지원합니다.");
    }
    return value;
  }

  function barcodeOptions(multiplier = 1) {
    const width = Number(controls.width.value) * multiplier;
    const height = Number(controls.height.value) * multiplier;
    const fontSize = Number(controls.fontSize.value) * multiplier;
    const margin = Number(controls.margin.value) * multiplier;
    return {
      width,
      height,
      lineColor: controls.lineColor.value,
      background: controls.backgroundColor.value,
      displayValue: controls.displayValue.checked,
      font: "DM Sans",
      fontSize,
      textMargin: 4 * multiplier,
      marginTop: 10 * multiplier,
      marginBottom: 10 * multiplier,
      marginLeft: margin,
      marginRight: margin
    };
  }

  function updateOutputs() {
    document.querySelector("#barcode-width-output").value = controls.width.value;
    document.querySelector("#barcode-height-output").value = `${controls.height.value} px`;
    document.querySelector("#barcode-font-size-output").value = `${controls.fontSize.value} px`;
    document.querySelector("#barcode-margin-output").value = `${controls.margin.value} px`;
  }

  function luminance(hexColor) {
    const channels = hexColor.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255).map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function updateContrast() {
    const colors = [luminance(controls.lineColor.value), luminance(controls.backgroundColor.value)].sort((first, second) => second - first);
    const ratio = (colors[0] + 0.05) / (colors[1] + 0.05);
    const isLowContrast = ratio < 4.5;
    contrastNote.classList.toggle("is-warning", isLowContrast);
    contrastNote.textContent = isLowContrast
      ? "선과 배경의 명암 대비가 낮습니다. 스캔을 위해 더 대비되는 색상을 선택하세요."
      : "선과 배경의 명암 대비가 적절합니다. 인쇄 전 실제 스캔을 확인하세요.";
  }

  function clearPreview(message, isError = false) {
    currentResult = null;
    preview.replaceChildren();
    preview.hidden = true;
    previewArea.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = isError ? "바코드를 표시할 수 없습니다" : "미리보기를 준비하는 중";
    printValue.textContent = "";
    previewMeta.textContent = `${formatNames[formatInput.value]} · 입력을 확인해 주세요.`;
    downloadPng.disabled = true;
    downloadSvg.disabled = true;
    printButton.disabled = true;
    dataInput.setAttribute("aria-invalid", String(isError));
    status.classList.toggle("is-error", isError);
    status.textContent = message;
  }

  function renderBarcode() {
    updateOutputs();
    updateContrast();
    const format = formatInput.value;
    let value;

    try {
      value = normalizeData(format, dataInput.value);
      if (!window.JsBarcode) throw new Error("바코드 라이브러리를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      const options = barcodeOptions();
      window.JsBarcode(preview, value, { format, ...options });
      preview.querySelectorAll("g").forEach((group) => {
        const barRects = Array.from(group.querySelectorAll("rect"));
        if (barRects.length > 0) {
          const pathD = barRects
            .map((r) => `M${r.getAttribute("x")} ${r.getAttribute("y")}h${r.getAttribute("width")}v${r.getAttribute("height")}z`)
            .join("");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", pathD);
          path.setAttribute("fill", options.lineColor);
          group.appendChild(path);
        }
      });
      preview.setAttribute("role", "img");
      preview.setAttribute("aria-label", `${formatNames[format]} 바코드 ${value}`);
    } catch (error) {
      const message = typeof error?.message === "string" ? error.message : String(error);
      clearPreview(message || "바코드를 생성하지 못했습니다.", true);
      return;
    }

    currentResult = { format, value };
    preview.hidden = false;
    previewArea.hidden = false;
    emptyState.hidden = true;
    dataInput.setAttribute("aria-invalid", "false");
    status.classList.remove("is-error");
    status.textContent = value === dataInput.value ? "바코드가 실시간으로 업데이트되었습니다." : `체크디지트를 계산해 ${value}로 생성했습니다.`;
    printValue.textContent = `${formatNames[format]} · ${value}`;
    const width = preview.getAttribute("width").replace(/px$/, "");
    const height = preview.getAttribute("height").replace(/px$/, "");
    previewMeta.textContent = `${formatNames[format]} · ${width} × ${height} px`;
    downloadPng.disabled = false;
    downloadSvg.disabled = false;
    printButton.disabled = false;
  }

  function triggerDownload(blob, extension) {
    const link = document.createElement("a");
    const filename = `barcode-${fileNames[currentResult.format]}.${extension}`;
    const downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  function downloadSvgFile() {
    if (!currentResult) return;
    const copy = preview.cloneNode(true);
    copy.removeAttribute("hidden");
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("role", "img");
    const markup = new XMLSerializer().serializeToString(copy);
    triggerDownload(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }

  async function downloadPngFile() {
    if (!currentResult) return;
    const multiplier = 2;
    const canvas = document.createElement("canvas");
    try {
      window.JsBarcode(canvas, currentResult.value, { format: currentResult.format, ...barcodeOptions(multiplier) });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG 이미지를 만들지 못했습니다.")), "image/png");
      });
      if (blob.type !== "image/png" || blob.size === 0) throw new Error("PNG 파일 형식이 올바르지 않습니다.");
      triggerDownload(blob, "png");
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error instanceof Error ? error.message : "PNG 다운로드를 준비하지 못했습니다.";
    }
  }

  function renderExamples() {
    const examples = {
      CODE128: "FW-24018",
      EAN13: "4006381333931",
      UPC: "036000291452",
      CODE39: "FILEWISE-39",
      ITF14: "10012345000017"
    };
    document.querySelectorAll("[data-barcode-example]").forEach((svg) => {
      const format = svg.dataset.barcodeExample;
      window.JsBarcode(svg, examples[format], {
        format,
        width: 1.2,
        height: 42,
        margin: 4,
        marginTop: 2,
        marginBottom: 2,
        font: "DM Sans",
        fontSize: 10,
        lineColor: "#172b29",
        background: "#ffffff"
      });
      svg.setAttribute("role", "img");
    });
  }

  formatInput.addEventListener("change", function () {
    const hints = {
      CODE128: "CODE 128은 공백을 포함한 영문, 숫자, 기본 기호를 지원합니다.",
      EAN13: "12자리 숫자를 입력하면 체크디지트를 계산합니다. 13자리는 검증합니다.",
      UPC: "11자리 숫자를 입력하면 체크디지트를 계산합니다. 12자리는 검증합니다.",
      CODE39: "영문 대문자, 숫자, 공백 및 - . $ / + % 기호를 입력하세요.",
      ITF14: "13자리 숫자를 입력하면 체크디지트를 계산합니다. 14자리는 검증합니다."
    };
    dataInput.inputMode = ["EAN13", "UPC", "ITF14"].includes(this.value) ? "numeric" : "text";
    dataInput.placeholder = { CODE128: "예: FW-24018", EAN13: "예: 400638133393", UPC: "예: 03600029145", CODE39: "예: FILEWISE-39", ITF14: "예: 1001234500001" }[this.value];
    document.querySelector("#barcode-hint").textContent = hints[this.value];
    renderBarcode();
  });
  dataInput.addEventListener("input", renderBarcode);
  Object.values(controls).forEach((control) => control.addEventListener("input", renderBarcode));
  downloadPng.addEventListener("click", downloadPngFile);
  downloadSvg.addEventListener("click", downloadSvgFile);
  printButton.addEventListener("click", () => window.print());

  renderExamples();
  renderBarcode();
});