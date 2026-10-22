/* assets/js/convert.js */

document.addEventListener("DOMContentLoaded", function () {
  const maxFileSize = 50 * 1024 * 1024;
  const maxBatchSize = 100 * 1024 * 1024;
  const maxFileCount = 20;
  const maxImagePixels = 40000000;
  const input = document.querySelector("#convert-file-input");
  const dropzone = document.querySelector("#convert-dropzone");
  const filePanel = document.querySelector("#convert-file");
  const fileList = document.querySelector("#convert-file-list");
  const status = document.querySelector("#convert-status");
  const formatSelect = document.querySelector("#output-format");
  const qualityInput = document.querySelector("#output-quality");
  const qualitySetting = document.querySelector("#quality-setting");
  const qualityValue = document.querySelector("#quality-value");
  const convertButton = document.querySelector("#convert-button");
  const result = document.querySelector("#convert-result");
  const downloadButton = document.querySelector("#download-results");
  const convertedFileList = document.querySelector("#converted-file-list");
  const requestedOutputFormat = new URLSearchParams(window.location.search).get("format");
  const formatDetails = {
    "image/jpeg": { extension: "jpg", label: "JPG", note: "JPG는 사진에 적합합니다. 투명한 영역은 흰색으로 채워집니다.", lossy: true },
    "image/png": { extension: "png", label: "PNG", note: "PNG는 투명 배경을 유지합니다. 품질 설정은 적용되지 않습니다.", lossy: false },
    "image/webp": { extension: "webp", label: "WebP", note: "WebP는 작은 용량과 선명한 화질을 함께 얻을 수 있는 형식입니다.", lossy: true },
    "image/avif": { extension: "avif", label: "AVIF", note: "AVIF 인코딩을 지원하는 브라우저에서만 사용할 수 있습니다.", lossy: true }
  };
  const inputFormats = {
    "image/jpeg": { label: "JPG", extensions: ["jpg", "jpeg"] },
    "image/png": { label: "PNG", extensions: ["png"] },
    "image/webp": { label: "WebP", extensions: ["webp"] },
    "image/heic": { label: "HEIC", extensions: ["heic", "heif"] }
  };
  const conversionMatrix = {
    "image/jpeg": ["image/png", "image/webp", "image/avif"],
    "image/png": ["image/jpeg", "image/webp", "image/avif"],
    "image/webp": ["image/jpeg", "image/png", "image/avif"],
    "image/heic": ["image/jpeg", "image/png"]
  };
  const outputMimeTypes = Object.keys(formatDetails);
  const outputCapabilities = {};
  const previewUrls = [];
  let selectedFiles = [];
  let convertedDownload = null;
  let isConverting = false;

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 바이트";
    const units = ["바이트", "KB", "MB", "GB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, unitIndex)).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function setStatus(message, isProgress = false) {
    status.textContent = message;
    status.classList.toggle("is-progress", isProgress);
  }

  function clearResult() {
    convertedDownload = null;
    convertedFileList.replaceChildren();
    result.hidden = true;
    downloadButton.disabled = true;
  }

  function clearPreviews() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.length = 0;
  }

  function clearFiles(message = "") {
    selectedFiles = [];
    input.value = "";
    fileList.replaceChildren();
    filePanel.hidden = true;
    clearPreviews();
    clearResult();
    convertButton.disabled = true;
    setStatus(message);
    updateFormatOptions();
  }

  function ascii(bytes, start, end) {
    return String.fromCharCode(...bytes.slice(start, end));
  }

  async function detectInputFormat(file) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
    if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
      const brand = ascii(bytes, 8, 12);
      if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis", "hevm", "hevs"].includes(brand)) {
        return "image/heic";
      }
    }

    const mimeType = file.type.toLowerCase().split(";")[0];
    if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return mimeType;
    if (["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(mimeType)) return "image/heic";

    const extension = file.name.split(".").pop().toLowerCase();
    return Object.entries(inputFormats).find(([, details]) => details.extensions.includes(extension))?.[0] || null;
  }

  function addFileRow(entry) {
    const row = document.createElement("li");
    row.className = "convert-file-row";
    const format = inputFormats[entry.inputFormat];
    if (entry.inputFormat === "image/heic") {
      const badge = document.createElement("span");
      badge.className = "file-type-icon";
      badge.textContent = format.label;
      row.append(badge);
    } else {
      const preview = document.createElement("img");
      preview.className = "file-preview";
      preview.alt = "";
      const url = URL.createObjectURL(entry.file);
      previewUrls.push(url);
      preview.src = url;
      row.append(preview);
    }

    const meta = document.createElement("div");
    meta.className = "convert-file-meta";
    const name = document.createElement("strong");
    name.textContent = entry.file.name;
    const info = document.createElement("span");
    info.textContent = `${format.label} · ${formatFileSize(entry.file.size)}`;
    meta.append(name, info);
    row.append(meta);
    fileList.append(row);
  }

  function updateFormatOptions() {
    const currentValue = formatSelect.value;
    const availableFormats = selectedFiles.length
      ? outputMimeTypes.filter((mimeType) => selectedFiles.every((entry) => conversionMatrix[entry.inputFormat].includes(mimeType)) && outputCapabilities[mimeType])
      : [];
    formatSelect.replaceChildren(...availableFormats.map((mimeType) => {
      const option = document.createElement("option");
      option.value = mimeType;
      option.textContent = formatDetails[mimeType].label;
      return option;
    }));

    if (!availableFormats.length) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "이미지를 먼저 선택하세요";
      placeholder.selected = true;
      formatSelect.append(placeholder);
    }

    if (availableFormats.includes(currentValue)) {
      formatSelect.value = currentValue;
    } else if (availableFormats.includes(requestedOutputFormat)) {
      formatSelect.value = requestedOutputFormat;
    } else if (availableFormats.length) {
      formatSelect.value = availableFormats[0];
    }

    formatSelect.disabled = isConverting || availableFormats.length === 0;
    convertButton.disabled = isConverting || selectedFiles.length === 0 || availableFormats.length === 0;
    updateFormatSettings();

    if (selectedFiles.length && !availableFormats.length) {
      setStatus("선택한 파일에 공통으로 사용할 수 있는 출력 형식이 없습니다.");
    }
  }

  function updateFormatSettings() {
    const details = formatDetails[formatSelect.value];
    const note = document.querySelector("#format-note");
    qualitySetting.hidden = !details || !details.lossy;
    note.textContent = details ? details.note : "기기에서 실제로 변환할 수 있는 형식만 표시됩니다.";
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== mimeType) {
          reject(new Error(`${formatDetails[mimeType].label} 인코딩을 이 브라우저에서 지원하지 않습니다.`));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  async function supportsCanvasFormat(mimeType) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType));
      return Boolean(blob && blob.type === mimeType);
    } catch {
      return false;
    }
  }

  async function verifyImageBlob(blob, mimeType) {
    if (blob.type !== mimeType) throw new Error("변환 결과의 파일 형식이 선택한 형식과 다릅니다.");

    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const validSignature = {
      "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      "image/png": bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG",
      "image/webp": ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP",
      "image/avif": ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))
    }[mimeType];
    if (!validSignature) throw new Error("변환 결과의 파일 시그니처가 올바르지 않습니다.");

    const bitmap = await createImageBitmap(blob);
    const validImage = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    if (!validImage) throw new Error("변환 파일을 다시 열 수 없습니다.");
  }

  async function decodeSource(entry) {
    if (entry.inputFormat !== "image/heic") return entry.file;
    if (typeof window.heic2any !== "function") {
      throw new Error("HEIC 변환 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    }

    const decoded = await window.heic2any({ blob: entry.file, toType: "image/png" });
    return Array.isArray(decoded) ? decoded[0] : decoded;
  }

  async function convertOne(entry, mimeType, quality) {
    const sourceBlob = await decodeSource(entry);
    const bitmap = await createImageBitmap(sourceBlob);
    const imageWidth = bitmap.width;
    const imageHeight = bitmap.height;
    if (imageWidth * imageHeight > maxImagePixels) {
      bitmap.close();
      throw new Error(`${entry.file.name}: 이미지 해상도가 너무 큽니다. 4,000만 픽셀 이하의 이미지를 선택해 주세요.`);
    }

    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("이미지 변환을 시작할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.");
    }

    if (mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    try {
      const outputBlob = await canvasToBlob(canvas, mimeType, formatDetails[mimeType].lossy ? quality : undefined);
      await verifyImageBlob(outputBlob, mimeType);
      return { blob: outputBlob, width: imageWidth, height: imageHeight };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  function makeOutputName(file, mimeType, usedNames) {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "converted-image";
    const extension = formatDetails[mimeType].extension;
    let outputName = `${baseName}.${extension}`;
    let suffix = 2;
    while (usedNames.has(outputName.toLowerCase())) {
      outputName = `${baseName}-${suffix}.${extension}`;
      suffix += 1;
    }
    usedNames.add(outputName.toLowerCase());
    return outputName;
  }

  function addConvertedRow(item) {
    const row = document.createElement("li");
    row.className = "converted-file-row";
    const name = document.createElement("span");
    name.className = "converted-file-name";
    name.textContent = item.name;
    const sizes = document.createElement("span");
    sizes.className = "converted-file-sizes";
    sizes.textContent = `${formatFileSize(item.inputSize)} → ${formatFileSize(item.blob.size)}`;
    row.append(name, sizes);
    convertedFileList.append(row);
  }

  async function createDownload(items) {
    if (items.length === 1) return { blob: items[0].blob, name: items[0].name };
    if (!window.JSZip) throw new Error("ZIP 모듈을 불러오지 못해 여러 파일을 묶을 수 없습니다.");

    const archive = new window.JSZip();
    items.forEach((item) => archive.file(item.name, item.blob));
    const blob = await archive.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "DEFLATE",
      compressionOptions: { level: 1 }
    });
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
      throw new Error("ZIP 다운로드 파일을 만들지 못했습니다.");
    }
    return { blob, name: "converted-images.zip" };
  }

  async function convertImages() {
    if (!selectedFiles.length || isConverting) return;
    const mimeType = formatSelect.value;
    const quality = Number(qualityInput.value) / 100;
    const convertedItems = [];
    const usedNames = new Set();
    isConverting = true;
    input.disabled = true;
    formatSelect.disabled = true;
    convertButton.disabled = true;
    convertButton.setAttribute("aria-busy", "true");
    convertButton.querySelector("span").textContent = "변환 중...";
    clearResult();

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const entry = selectedFiles[index];
        setStatus(`${index + 1}/${selectedFiles.length} 파일 변환 및 검증 중...`, true);
        const converted = await convertOne(entry, mimeType, quality);
        convertedItems.push({
          ...converted,
          name: makeOutputName(entry.file, mimeType, usedNames),
          inputSize: entry.file.size
        });
      }

      convertedItems.forEach(addConvertedRow);
      convertedDownload = await createDownload(convertedItems);
      const originalSize = convertedItems.reduce((total, item) => total + item.inputSize, 0);
      const convertedSize = convertedItems.reduce((total, item) => total + item.blob.size, 0);
      document.querySelector("#result-summary").textContent = `${convertedItems.length}개 파일 · 원본 ${formatFileSize(originalSize)} → 변환 후 ${formatFileSize(convertedSize)}${convertedItems.length > 1 ? " · ZIP으로 묶어 다운로드" : ""}`;
      document.querySelector("#result-format").textContent = formatDetails[mimeType].label;
      downloadButton.querySelector("span").textContent = convertedItems.length > 1 ? "변환 파일 ZIP 다운로드" : "변환 파일 다운로드";
      result.hidden = false;
      downloadButton.disabled = false;
      setStatus("변환 파일의 형식과 열기를 확인했습니다.", true);
    } catch (error) {
      console.error("Image conversion failed:", error);
      clearResult();
      const errorMessage = error instanceof Error ? error.message : error?.message;
      const includesHeic = selectedFiles.some((entry) => entry.inputFormat === "image/heic");
      setStatus(includesHeic
        ? "HEIC/HEIF 파일을 읽지 못했습니다. 손상되었거나 현재 디코더가 지원하지 않는 파일일 수 있습니다."
        : typeof errorMessage === "string" ? errorMessage : "이미지를 변환하지 못했습니다.");
    } finally {
      isConverting = false;
      input.disabled = false;
      convertButton.removeAttribute("aria-busy");
      convertButton.querySelector("span").textContent = "다시 변환하기";
      updateFormatOptions();
    }
  }

  async function loadFiles(files) {
    if (isConverting || !files.length) return;
    clearFiles();

    if (files.length > maxFileCount) {
      setStatus(`한 번에 최대 ${maxFileCount}개 파일까지 선택할 수 있습니다.`);
      return;
    }
    if (files.some((file) => file.size > maxFileSize)) {
      setStatus("파일 하나의 크기는 50 MB 이하여야 합니다.");
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > maxBatchSize) {
      setStatus("한 번에 선택한 파일의 총 크기는 100 MB 이하여야 합니다.");
      return;
    }

    setStatus("파일 형식을 확인하고 있습니다.", true);
    const detected = await Promise.all(files.map(async (file) => ({ file, inputFormat: await detectInputFormat(file) })));
    const unsupported = detected.find((entry) => !entry.inputFormat || !conversionMatrix[entry.inputFormat]);
    if (unsupported) {
      setStatus(`${unsupported.file.name}: JPG, PNG, WebP, HEIC 파일만 변환할 수 있습니다.`);
      return;
    }
    if (detected.some((entry) => entry.inputFormat === "image/heic") && typeof window.heic2any !== "function") {
      setStatus("HEIC 변환 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }

    selectedFiles = detected;
    selectedFiles.forEach(addFileRow);
    filePanel.hidden = false;
    updateFormatOptions();
    setStatus(`${selectedFiles.length}개 파일을 확인했습니다.`, true);
  }

  input.addEventListener("change", () => {
    const files = Array.from(input.files);
    input.value = "";
    loadFiles(files);
  });
  formatSelect.addEventListener("change", () => {
    updateFormatSettings();
    clearResult();
  });
  qualityInput.addEventListener("input", () => {
    qualityValue.value = `${qualityInput.value}%`;
    qualityValue.textContent = `${qualityInput.value}%`;
  });
  convertButton.addEventListener("click", convertImages);
  downloadButton.addEventListener("click", () => {
    if (!convertedDownload || downloadButton.disabled) return;
    const url = URL.createObjectURL(convertedDownload.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = convertedDownload.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (event) => loadFiles(Array.from(event.dataTransfer.files)));

  Promise.all(outputMimeTypes.map(async (mimeType) => {
    outputCapabilities[mimeType] = await supportsCanvasFormat(mimeType);
  })).then(updateFormatOptions);
});