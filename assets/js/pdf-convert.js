/* assets/js/pdf-convert.js */

document.addEventListener("DOMContentLoaded", function () {
  const PDFLib = window.PDFLib;
  const maxFileSize = 50 * 1024 * 1024;
  const maxBatchSize = 100 * 1024 * 1024;
  const maxFileCount = 20;
  const tabButtons = Array.from(document.querySelectorAll(".converter-tab"));
  const imagePanel = document.querySelector("#image-convert-panel");
  const pdfPanel = document.querySelector("#pdf-convert-panel");
  const modeButtons = Array.from(document.querySelectorAll(".pdf-mode"));
  const input = document.querySelector("#pdf-file-input");
  const dropzone = document.querySelector("#pdf-dropzone");
  const filePanel = document.querySelector("#pdf-file-panel");
  const fileList = document.querySelector("#pdf-file-list");
  const status = document.querySelector("#pdf-status");
  const progress = document.querySelector("#pdf-progress");
  const progressBar = document.querySelector("#pdf-progress-bar");
  const progressLabel = document.querySelector("#pdf-progress-label");
  const runButton = document.querySelector("#pdf-run-button");
  const result = document.querySelector("#pdf-result");
  const downloadAllButton = document.querySelector("#pdf-download-all");
  const downloadZipButton = document.querySelector("#pdf-download-zip");
  const outputList = document.querySelector("#pdf-result-files");
  const inputTypeLabels = {
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "application/pdf": "PDF"
  };
  const requestedPdfMode = new URLSearchParams(window.location.search).get("mode");
  const supportedPdfModes = ["image-to-pdf", "pdf-to-image", "merge", "edit"];
  let activeMode = supportedPdfModes.includes(requestedPdfMode) ? requestedPdfMode : "image-to-pdf";
  let selectedFiles = [];
  let outputFiles = [];
  let zipDownload = null;
  let downloadAll = null;
  let isWorking = false;
  let pdfJsPromise = null;
  let loadedPdfPageCount = 0;
  let pageOrder = [];

  function setStatus(message) {
    status.textContent = message;
  }

  function setProgress(value, label = "") {
    progress.hidden = false;
    progressBar.value = value;
    progressLabel.textContent = label;
  }

  function formatFileSize(bytes) {
    if (!bytes) return "0 바이트";
    const units = ["바이트", "KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, unit)).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function clearResult() {
    outputFiles = [];
    zipDownload = null;
    downloadAll = null;
    outputList.replaceChildren();
    result.hidden = true;
    downloadAllButton.disabled = true;
    downloadZipButton.disabled = true;
    downloadAllButton.hidden = true;
    downloadZipButton.hidden = true;
  }

  function clearFiles(message = "") {
    selectedFiles = [];
    loadedPdfPageCount = 0;
    pageOrder = [];
    fileList.replaceChildren();
    document.querySelector("#pdf-page-list").replaceChildren();
    filePanel.hidden = true;
    clearResult();
    runButton.disabled = true;
    progress.hidden = true;
    setStatus(message);
  }

  function readAscii(bytes, start, end) {
    return String.fromCharCode(...bytes.slice(start, end));
  }

  async function detectImageType(file) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && readAscii(bytes, 1, 4) === "PNG") return "image/png";
    if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 12) === "WEBP") return "image/webp";
    return null;
  }

  async function detectFileType(file) {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (readAscii(signature, 0, 5) === "%PDF-") return "application/pdf";
    return detectImageType(file);
  }

  async function getPdfJs() {
    if (!pdfJsPromise) {
      const cdnUrl = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs";
      pdfJsPromise = import(cdnUrl).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }

  async function renderPageCards(entry) {
    if (entry.pageCount > 50) throw new Error("페이지 편집 미리보기는 50페이지 이하 PDF를 지원합니다.");
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await entry.file.arrayBuffer()) });
    const pdfDocument = await loadingTask.promise;
    const pageList = document.querySelector("#pdf-page-list");
    pageList.replaceChildren();
    pageOrder = Array.from({ length: entry.pageCount }, (_, index) => index + 1);

    try {
      for (const pageNumber of pageOrder) {
        setStatus(`${pageNumber}/${entry.pageCount} 페이지 미리보기를 준비하고 있습니다.`);
        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(0.35, 140 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const card = document.createElement("li");
        card.className = "pdf-page-card";
        card.draggable = true;
        card.dataset.pageNumber = String(pageNumber);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise;
        const label = document.createElement("strong");
        label.textContent = `페이지 ${pageNumber}`;
        card.append(canvas, label);
        pageList.append(card);
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }
    setStatus(`${entry.pageCount}페이지 미리보기 완료 · 카드를 드래그해 순서를 바꿀 수 있습니다.`);
  }

  function reorderPageCards() {
    pageOrder = Array.from(document.querySelectorAll("#pdf-page-list .pdf-page-card"), (card) => Number(card.dataset.pageNumber));
    setStatus(`페이지 순서 변경됨 · ${pageOrder.join(", ")}`);
  }

  function parsePageRange(value, pageCount) {
    if (!value.trim()) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = new Set();
    for (const part of value.split(",").map((item) => item.trim())) {
      const range = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!range) throw new Error("페이지 범위 형식이 올바르지 않습니다. 예: 1, 3-5");
      const first = Number(range[1]);
      const last = Number(range[2] || range[1]);
      if (first < 1 || last < first || last > pageCount) {
        throw new Error(`페이지 범위는 1부터 ${pageCount} 사이에서 입력해 주세요.`);
      }
      for (let page = first; page <= last; page += 1) pages.add(page);
    }
    return [...pages].sort((a, b) => a - b);
  }

  function updateEditControls() {
    const operation = document.querySelector("#pdf-edit-operation").value;
    const rangeOperations = ["extract", "rotate", "delete"];
    document.querySelector("#pdf-edit-range-row").hidden = !rangeOperations.includes(operation);
    document.querySelector("#pdf-rotate-row").hidden = operation !== "rotate";
    const messages = {
      reorder: "페이지 카드를 드래그해 순서를 바꾸세요.",
      extract: "입력한 페이지만 새 PDF로 추출합니다. 예: 1, 3-5",
      split: "모든 페이지를 각각 하나의 PDF로 분할하고 ZIP으로 묶습니다.",
      rotate: "범위를 비우면 모든 페이지를 회전합니다.",
      delete: "입력한 페이지를 삭제합니다. 모든 페이지를 지울 수는 없습니다."
    };
    document.querySelector("#pdf-edit-help").textContent = messages[operation];
    const labels = { reorder: "페이지 순서 저장", extract: "페이지 추출", split: "페이지별 PDF 분할", rotate: "페이지 회전 적용", delete: "페이지 삭제 적용" };
    runButton.querySelector("span").textContent = labels[operation];
    runButton.disabled = isWorking || selectedFiles.length !== 1;
  }

  function renderFileList() {
    fileList.replaceChildren(...selectedFiles.map((entry, index) => {
      const row = document.createElement("li");
      row.className = "pdf-file-row";
      const number = document.createElement("span");
      number.className = "pdf-file-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const details = document.createElement("div");
      details.className = "pdf-file-meta";
      const name = document.createElement("strong");
      name.textContent = entry.file.name;
      const info = document.createElement("span");
      const pageCount = entry.pageCount ? ` · ${entry.pageCount}페이지` : "";
      info.textContent = `${inputTypeLabels[entry.type]} · ${formatFileSize(entry.file.size)}${pageCount}`;
      details.append(name, info);
      row.append(number, details);
      return row;
    }));
    document.querySelector("#pdf-file-count").textContent = `${selectedFiles.length}개 파일`;
    document.querySelector("#pdf-file-total").textContent = formatFileSize(selectedFiles.reduce((total, entry) => total + entry.file.size, 0));
    filePanel.hidden = selectedFiles.length === 0;
    runButton.disabled = isWorking || selectedFiles.length === 0 || (activeMode === "merge" && selectedFiles.length < 2);
  }

  function setMode(mode) {
    activeMode = mode;
    modeButtons.forEach((button) => {
      const isActive = button.dataset.pdfMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    const imageMode = mode === "image-to-pdf";
    const renderMode = mode === "pdf-to-image";
    const mergeMode = mode === "merge";
    const editMode = mode === "edit";
    const copy = {
      "image-to-pdf": ["이미지를 PDF로 만들기", "이미지를 순서대로 추가해 하나의 PDF로 합치거나, 이미지별 PDF를 만드세요.", "이미지 파일을 여기에 놓으세요", "JPG, PNG, WebP 이미지를 지원합니다", "JPG, PNG, WebP · 파일당 50 MB · 최대 20개 · 총 100 MB", "PDF 만들기"],
      "pdf-to-image": ["PDF 페이지를 이미지로 변환", "모든 페이지 또는 필요한 범위를 JPG·PNG 이미지로 렌더링합니다.", "PDF 파일을 여기에 놓으세요", "페이지가 많은 PDF는 필요한 범위만 선택하세요", "PDF 파일당 최대 50 MB · 최대 20페이지 출력", "이미지로 변환"],
      merge: ["PDF 문서 합치기", "문서를 원하는 순서로 추가하면 하나의 PDF로 합칩니다.", "합칠 PDF를 여기에 놓으세요", "PDF 문서 2개 이상을 선택하세요", "PDF 파일당 최대 50 MB · 최대 20개 · 총 100 MB", "PDF 합치기"],
      edit: ["PDF 페이지 편집", "페이지를 추출·분할·회전·삭제하거나 순서를 바꾸세요.", "편집할 PDF를 여기에 놓으세요", "PDF 문서 한 개를 선택하세요", "PDF 파일 최대 50 MB", "페이지 편집 적용"]
    }[mode];
    document.querySelector("#pdf-task-title").textContent = copy[0];
    document.querySelector("#pdf-task-description").textContent = copy[1];
    document.querySelector("#pdf-drop-title").textContent = copy[2];
    document.querySelector("#pdf-drop-subtitle").textContent = copy[3];
    document.querySelector("#pdf-file-help").textContent = copy[4];
    document.querySelector("#image-pdf-options").hidden = !imageMode;
    document.querySelector("#pdf-render-options").hidden = !renderMode;
    document.querySelector("#pdf-edit-options").hidden = !editMode;
    input.accept = imageMode ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : ".pdf,application/pdf";
    input.disabled = isWorking;
    runButton.querySelector("span").textContent = copy[5];
    document.querySelector("#pdf-dropzone").hidden = false;
    document.querySelector("#pdf-page-range").disabled = !renderMode;
    clearFiles("");
    if (editMode) updateEditControls();
  }

  async function decodeImage(entry) {
    if (entry.type !== "image/webp") return entry.file;
    const bitmap = await createImageBitmap(entry.file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    try {
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
        if (!blob) reject(new Error(`${entry.file.name}: PDF 변환용 이미지 데이터를 만들지 못했습니다.`));
        else resolve(blob);
      }, "image/png"));
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async function embedImage(pdfDocument, entry) {
    const blob = await decodeImage(entry);
    const bytes = await blob.arrayBuffer();
    if (entry.type === "image/jpeg") return pdfDocument.embedJpg(bytes);
    return pdfDocument.embedPng(bytes);
  }

  async function createImagePdf(entries, fitToPage, filename) {
    const document = await PDFLib.PDFDocument.create();
    for (const entry of entries) {
      const image = await embedImage(document, entry);
      const imageWidth = image.width;
      const imageHeight = image.height;
      const pageWidth = fitToPage ? 595.28 : imageWidth * 0.75;
      const pageHeight = fitToPage ? 841.89 : imageHeight * 0.75;
      const scale = fitToPage ? Math.min((pageWidth - 36) / imageWidth, (pageHeight - 36) / imageHeight) : 0.75;
      const width = imageWidth * scale;
      const height = imageHeight * scale;
      const page = document.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height
      });
    }

    const bytes = await document.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const parsed = await PDFLib.PDFDocument.load(await blob.arrayBuffer());
    if (parsed.getPageCount() !== entries.length) throw new Error(`${filename}: PDF 페이지 수 검증에 실패했습니다.`);
    const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (readAscii(signature, 0, 5) !== "%PDF-") throw new Error(`${filename}: PDF 시그니처 검증에 실패했습니다.`);
    return { name: filename, blob, pageCount: parsed.getPageCount() };
  }

  function addOutputRow(file, index, total) {
    const row = document.createElement("li");
    row.className = "converted-file-row";
    const name = document.createElement("span");
    name.className = "converted-file-name";
    name.textContent = file.name;
    const info = document.createElement("span");
    info.className = "converted-file-sizes";
    info.textContent = `${file.pageCount}페이지 · ${formatFileSize(file.blob.size)}`;
    row.append(name, info);
    if (total > 1) {
      const downloadButton = document.createElement("button");
      downloadButton.className = "pdf-output-download";
      downloadButton.type = "button";
      downloadButton.textContent = "다운로드";
      downloadButton.addEventListener("click", () => triggerDownload(outputFiles[index] || file));
      row.append(downloadButton);
    }
    outputList.append(row);
  }

  async function createZip(files) {
    if (typeof window.JSZip !== "function") throw new Error("ZIP 라이브러리를 불러오지 못했습니다.");
    const archive = new window.JSZip();
    files.forEach((file) => archive.file(file.name, file.blob));
    const blob = await archive.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "DEFLATE",
      compressionOptions: { level: 1 }
    });
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (readAscii(signature, 0, 2) !== "PK") throw new Error("ZIP 파일을 만들지 못했습니다.");
    return blob;
  }

  async function presentPdfOutputs(outputs, format, summary) {
    outputFiles = outputs;
    outputs.forEach((file, index) => addOutputRow(file, index, outputs.length));
    const archive = outputs.length > 1 ? await createZip(outputs) : null;
    zipDownload = archive ? { name: format === "PDF" ? "converted-pdfs.zip" : "converted-pages.zip", blob: archive } : null;
    downloadAll = outputs.length === 1 ? outputs[0] : null;
    document.querySelector("#pdf-result-summary").textContent = summary;
    document.querySelector("#pdf-result-format").textContent = format;
    downloadAllButton.hidden = outputs.length !== 1;
    downloadAllButton.disabled = !downloadAll;
    downloadZipButton.hidden = !archive;
    downloadZipButton.disabled = !archive;
    document.querySelector("#pdf-download-all span").textContent = format === "PDF" ? "PDF 다운로드" : "이미지 다운로드";
    result.hidden = false;
  }

  async function runPdfMerge() {
    if (selectedFiles.length < 2 || isWorking) return;
    isWorking = true;
    runButton.disabled = true;
    runButton.setAttribute("aria-busy", "true");
    runButton.querySelector("span").textContent = "PDF 병합 중...";
    clearResult();
    setProgress(5, "PDF 문서를 읽고 있습니다.");

    try {
      const merged = await PDFLib.PDFDocument.create();
      let expectedPages = 0;
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const entry = selectedFiles[index];
        setProgress(Math.round(((index + 1) / selectedFiles.length) * 75), `${index + 1}/${selectedFiles.length} PDF 병합 중`);
        expectedPages += entry.document.getPageCount();
        const pages = await merged.copyPages(entry.document, entry.document.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const blob = new Blob([await merged.save()], { type: "application/pdf" });
      const pageCount = await verifyPdfBlob(blob, expectedPages);
      const size = selectedFiles.reduce((total, entry) => total + entry.file.size, 0);
      await presentPdfOutputs([{ name: "merged.pdf", blob, pageCount, sourceSize: size }], "PDF", `${selectedFiles.length}개 PDF 병합 · ${pageCount}페이지 · ${formatFileSize(size)} → ${formatFileSize(blob.size)}`);
      setProgress(100, "PDF 시그니처와 페이지 수를 확인했습니다.");
      setStatus("PDF 병합과 검증이 완료되었습니다.");
    } catch (error) {
      console.error("PDF merge failed:", error);
      clearResult();
      setStatus(error instanceof Error ? error.message : "PDF를 병합하지 못했습니다.");
      progress.hidden = true;
    } finally {
      isWorking = false;
      runButton.removeAttribute("aria-busy");
      runButton.querySelector("span").textContent = "다시 병합하기";
      renderFileList();
    }
  }

  async function runPdfSplit() {
    if (selectedFiles.length !== 1 || isWorking) return;
    isWorking = true;
    runButton.disabled = true;
    runButton.setAttribute("aria-busy", "true");
    runButton.querySelector("span").textContent = "페이지 분할 중...";
    clearResult();
    setProgress(0, "PDF를 페이지별로 분할하고 있습니다.");

    try {
      const entry = selectedFiles[0];
      const source = await PDFLib.PDFDocument.load(await entry.file.arrayBuffer());
      if (source.getPageCount() > 20) throw new Error("한 번에 최대 20페이지까지 분할할 수 있습니다.");
      const outputs = [];
      for (let index = 0; index < source.getPageCount(); index += 1) {
        setProgress(Math.round(((index + 1) / source.getPageCount()) * 85), `${index + 1}/${source.getPageCount()} 페이지 분할 중`);
        const onePage = await PDFLib.PDFDocument.create();
        const [page] = await onePage.copyPages(source, [index]);
        onePage.addPage(page);
        const blob = new Blob([await onePage.save()], { type: "application/pdf" });
        const pageCount = await verifyPdfBlob(blob, 1);
        outputs.push({
          name: `${entry.file.name.replace(/\.pdf$/i, "") || "document"}-page-${String(index + 1).padStart(3, "0")}.pdf`,
          blob,
          pageCount,
          sourceSize: entry.file.size
        });
      }
      await presentPdfOutputs(outputs, "PDF", `${outputs.length}개 PDF · 페이지별 분할 · 원본 ${formatFileSize(entry.file.size)}`);
      setProgress(100, "분할 PDF의 시그니처와 페이지 수를 확인했습니다.");
      setStatus("PDF 페이지 분할과 검증이 완료되었습니다.");
    } catch (error) {
      console.error("PDF split failed:", error);
      clearResult();
      setStatus(error instanceof Error ? error.message : "PDF를 분할하지 못했습니다.");
      progress.hidden = true;
    } finally {
      isWorking = false;
      runButton.removeAttribute("aria-busy");
      runButton.querySelector("span").textContent = "다시 분할하기";
      renderFileList();
    }
  }

  async function runPdfEdit() {
    if (selectedFiles.length !== 1 || isWorking) return;
    const operation = document.querySelector("#pdf-edit-operation").value;
    if (operation === "split") {
      runPdfSplit();
      return;
    }

    isWorking = true;
    runButton.disabled = true;
    runButton.setAttribute("aria-busy", "true");
    runButton.querySelector("span").textContent = "PDF 편집 중...";
    clearResult();
    setProgress(10, "PDF 페이지를 편집하고 있습니다.");

    try {
      const entry = selectedFiles[0];
      const source = await PDFLib.PDFDocument.load(await entry.file.arrayBuffer());
      let output;
      let pageCount = source.getPageCount();
      if (operation === "reorder") {
        const order = Array.from(document.querySelectorAll("#pdf-page-list .pdf-page-card"), (card) => Number(card.dataset.pageNumber) - 1);
        if (order.length !== pageCount || new Set(order).size !== pageCount) throw new Error("페이지 순서가 올바르지 않습니다.");
        const reordered = await PDFLib.PDFDocument.create();
        const pages = await reordered.copyPages(source, order);
        pages.forEach((page) => reordered.addPage(page));
        output = reordered;
      } else if (operation === "extract") {
        const selectedPages = parsePageRange(document.querySelector("#pdf-edit-range").value, pageCount);
        const extracted = await PDFLib.PDFDocument.create();
        const pages = await extracted.copyPages(source, selectedPages.map((page) => page - 1));
        pages.forEach((page) => extracted.addPage(page));
        pageCount = pages.length;
        output = extracted;
      } else if (operation === "rotate") {
        const selectedPages = parsePageRange(document.querySelector("#pdf-edit-range").value, pageCount);
        const degrees = Number(document.querySelector("#pdf-rotation").value);
        selectedPages.forEach((pageNumber) => {
          const page = source.getPage(pageNumber - 1);
          page.setRotation(PDFLib.degrees((page.getRotation().angle + degrees) % 360));
        });
        output = source;
      } else if (operation === "delete") {
        const range = document.querySelector("#pdf-edit-range").value;
        if (!range.trim()) throw new Error("삭제할 페이지 범위를 입력해 주세요.");
        const selectedPages = parsePageRange(range, pageCount);
        if (selectedPages.length === pageCount) throw new Error("모든 페이지를 삭제할 수 없습니다.");
        selectedPages.sort((a, b) => b - a).forEach((pageNumber) => source.removePage(pageNumber - 1));
        pageCount = source.getPageCount();
        output = source;
      } else {
        throw new Error("지원하지 않는 PDF 편집 작업입니다.");
      }

      const blob = new Blob([await output.save()], { type: "application/pdf" });
      await verifyPdfBlob(blob, pageCount);
      const operationNames = { reorder: "reordered", extract: "extracted", rotate: "rotated", delete: "edited" };
      const filename = `${entry.file.name.replace(/\.pdf$/i, "") || "document"}-${operationNames[operation]}.pdf`;
      await presentPdfOutputs([{ name: filename, blob, pageCount, sourceSize: entry.file.size }], "PDF", `${pageCount}페이지 · 원본 ${formatFileSize(entry.file.size)} → 결과 ${formatFileSize(blob.size)}`);
      setProgress(100, "PDF 시그니처와 페이지 수를 확인했습니다.");
      setStatus("PDF 편집과 검증이 완료되었습니다.");
    } catch (error) {
      console.error("PDF page editing failed:", error);
      clearResult();
      setStatus(error instanceof Error ? error.message : "PDF 페이지를 편집하지 못했습니다.");
      progress.hidden = true;
    } finally {
      isWorking = false;
      runButton.removeAttribute("aria-busy");
      updateEditControls();
    }
  }

  async function verifyPdfBlob(blob, expectedPages) {
    const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (readAscii(signature, 0, 5) !== "%PDF-") throw new Error("PDF 출력 시그니처가 올바르지 않습니다.");
    const parsed = await PDFLib.PDFDocument.load(await blob.arrayBuffer());
    if (parsed.getPageCount() !== expectedPages) throw new Error("PDF 출력 페이지 수 검증에 실패했습니다.");
    return parsed.getPageCount();
  }

  async function verifyRasterBlob(blob, mimeType) {
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const isPng = mimeType === "image/png" && bytes[0] === 0x89 && readAscii(bytes, 1, 4) === "PNG";
    const isJpeg = mimeType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (blob.type !== mimeType || (!isPng && !isJpeg)) throw new Error("변환된 이미지의 파일 형식이 올바르지 않습니다.");
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (!size.width || !size.height) throw new Error("변환된 이미지를 다시 열 수 없습니다.");
    return size;
  }

  async function renderPdfToImages(entry) {
    const pdfjs = await getPdfJs();
    const data = new Uint8Array(await entry.file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    const requestedPages = parsePageRange(entry.pageRangeInput || "", pdfDocument.numPages);
    if (requestedPages.length > 20) {
      await loadingTask.destroy();
      throw new Error("한 번에 최대 20페이지까지 이미지로 변환할 수 있습니다. 페이지 범위를 좁혀 주세요.");
    }

    const mimeType = entry.outputMimeType || "image/jpeg";
    const scale = Number(entry.outputScale || 1.5);
    const quality = Number(entry.outputQuality || 85) / 100;
    const baseName = entry.file.name.replace(/\.pdf$/i, "") || "document";
    const outputs = [];
    let totalPixels = 0;

    try {
      for (let index = 0; index < requestedPages.length; index += 1) {
        const pageNumber = requestedPages[index];
        setProgress(Math.round(((index + 1) / requestedPages.length) * 90), `${pageNumber}/${pdfDocument.numPages} 페이지 렌더링 중`);
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        totalPixels += width * height;
        if (width * height > 20000000 || totalPixels > 100000000) {
          page.cleanup();
          throw new Error("출력 이미지 해상도가 기기 처리 한도를 넘습니다. 낮은 배율이나 적은 페이지를 선택해 주세요.");
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: mimeType === "image/png" });
        if (!context) throw new Error("페이지 렌더링을 시작할 수 없습니다.");
        if (mimeType === "image/jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
        }
        await page.render({ canvasContext: context, viewport, intent: "print" }).promise;
        const blob = await new Promise((resolve, reject) => canvas.toBlob((output) => {
          if (!output || output.type !== mimeType) reject(new Error("요청한 이미지 형식을 생성하지 못했습니다."));
          else resolve(output);
        }, mimeType, mimeType === "image/jpeg" ? quality : undefined));
        await verifyRasterBlob(blob, mimeType);
        const extension = mimeType === "image/png" ? "png" : "jpg";
        outputs.push({
          name: `${baseName}-page-${String(pageNumber).padStart(3, "0")}.${extension}`,
          blob,
          pageCount: 1,
          sourceSize: entry.file.size
        });
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await loadingTask.destroy();
    }
    return outputs;
  }

  async function loadPdfFiles(files) {
    if (isWorking || !files.length) return;
    clearFiles();
    const maxCount = activeMode === "pdf-to-image" ? 1 : maxFileCount;
    if (files.length > maxCount) {
      setStatus(activeMode === "pdf-to-image" ? "PDF를 한 번에 하나씩 변환해 주세요." : `한 번에 최대 ${maxCount}개 파일까지 선택할 수 있습니다.`);
      return;
    }
    if (files.some((file) => file.size > maxFileSize)) {
      setStatus("PDF 파일 하나의 크기는 50 MB 이하여야 합니다.");
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > maxBatchSize) {
      setStatus("PDF 파일의 총 크기는 100 MB 이하여야 합니다.");
      return;
    }

    try {
      const entries = [];
      for (const file of files) {
        const type = await detectFileType(file);
        if (type !== "application/pdf") throw new Error(`${file.name}: PDF 시그니처를 찾을 수 없습니다.`);
        let loaded;
        try {
          loaded = await PDFLib.PDFDocument.load(await file.arrayBuffer());
        } catch (error) {
          const details = String(error?.message || "").toLowerCase();
          if (details.includes("encrypt") || details.includes("password")) {
            throw new Error(`${file.name}: 암호로 보호된 PDF는 열 수 없습니다. 암호 보호를 해제한 파일을 선택해 주세요.`);
          }
          throw new Error(`${file.name}: 암호화되었거나 손상된 PDF를 열 수 없습니다.`);
        }
        if (!loaded.getPageCount()) throw new Error(`${file.name}: 페이지가 없는 PDF입니다.`);
        entries.push({ file, type, pageCount: loaded.getPageCount(), document: loaded });
      }
      if ((activeMode === "pdf-to-image" || activeMode === "edit") && entries.length !== 1) {
        throw new Error("이 작업은 PDF 파일 한 개씩 처리합니다.");
      }
      if (activeMode === "merge" && entries.length < 2) throw new Error("PDF 병합에는 문서가 2개 이상 필요합니다.");
      selectedFiles = entries;
      renderFileList();
      loadedPdfPageCount = entries[0].pageCount;
      setStatus(`${entries.length}개 PDF를 열었습니다. ${entries.reduce((total, entry) => total + entry.pageCount, 0)}페이지`);
      if (activeMode === "edit") {
        runButton.disabled = true;
        await renderPageCards(entries[0]);
        updateEditControls();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isExpectedMessage = ["시그니처", "암호로 보호", "암호화되었거나 손상", "페이지가 없는", "병합에는", "한 개씩 처리"].some((part) => message.includes(part));
      clearFiles(isExpectedMessage ? message : "PDF가 암호화되었거나 손상되어 열 수 없습니다.");
    }
  }

  async function runPdfToImages() {
    if (selectedFiles.length !== 1 || isWorking) return;
    isWorking = true;
    runButton.disabled = true;
    runButton.setAttribute("aria-busy", "true");
    runButton.querySelector("span").textContent = "페이지 렌더링 중...";
    clearResult();
    setProgress(0, "PDF.js를 불러오고 있습니다.");

    try {
      const entry = selectedFiles[0];
      entry.pageRangeInput = document.querySelector("#pdf-page-range").value;
      entry.outputMimeType = document.querySelector("#pdf-image-format").value;
      entry.outputScale = document.querySelector("#pdf-render-scale").value;
      entry.outputQuality = document.querySelector("#pdf-quality").value;
      const outputs = await renderPdfToImages(entry);
      outputs.forEach((file, index) => addOutputRow(file, index, outputs.length));
      const archive = outputs.length > 1 ? await createZip(outputs) : null;
      outputFiles = outputs;
      zipDownload = archive ? { name: `${entry.file.name.replace(/\.pdf$/i, "") || "pages"}-images.zip`, blob: archive } : null;
      downloadAll = outputs.length === 1 ? outputs[0] : null;
      document.querySelector("#pdf-result-summary").textContent = `${outputs.length}개 페이지 이미지 · PDF ${formatFileSize(entry.file.size)} → 이미지 ${formatFileSize(outputs.reduce((total, file) => total + file.blob.size, 0))}`;
      document.querySelector("#pdf-result-format").textContent = document.querySelector("#pdf-image-format").selectedOptions[0].textContent;
      downloadAllButton.hidden = outputs.length !== 1;
      downloadZipButton.hidden = !archive;
      document.querySelector("#pdf-download-all span").textContent = outputs.length === 1 ? "이미지 다운로드" : "전체 파일 다운로드";
      result.hidden = false;
      downloadAllButton.disabled = !downloadAll || outputs.length !== 1;
      downloadZipButton.disabled = !archive;
      setProgress(100, "이미지 형식과 페이지 수를 확인했습니다.");
      setStatus("PDF 페이지 변환이 완료되었습니다.");
    } catch (error) {
      console.error("PDF to image conversion failed:", error);
      clearResult();
      const message = error?.name === "PasswordException"
        ? "암호로 보호된 PDF입니다. 암호 보호가 해제된 파일을 선택해 주세요."
        : error?.name === "InvalidPDFException"
          ? "암호화되었거나 손상된 PDF를 열 수 없습니다."
        : error instanceof Error ? error.message : "PDF를 이미지로 변환하지 못했습니다.";
      setStatus(message);
      progress.hidden = true;
    } finally {
      isWorking = false;
      runButton.removeAttribute("aria-busy");
      runButton.querySelector("span").textContent = "다시 변환하기";
      renderFileList();
    }
  }

  async function runImageToPdf() {
    if (!selectedFiles.length || isWorking) return;
    isWorking = true;
    runButton.disabled = true;
    runButton.setAttribute("aria-busy", "true");
    runButton.querySelector("span").textContent = "PDF 생성 중...";
    clearResult();
    setProgress(5, "PDF 문서를 준비하고 있습니다.");

    try {
      const individual = document.querySelector('input[name="image-pdf-mode"]:checked').value === "individual";
      const fitToPage = document.querySelector("#fit-images").checked;
      const sourceName = selectedFiles[0].file.name.replace(/\.[^.]+$/, "") || "image";
      const outputs = [];
      if (individual) {
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const entry = selectedFiles[index];
          setProgress(Math.round(((index + 1) / selectedFiles.length) * 80), `${index + 1}/${selectedFiles.length} PDF 생성 중`);
          const name = `${entry.file.name.replace(/\.[^.]+$/, "") || "image"}.pdf`;
          outputs.push(await createImagePdf([entry], fitToPage, name));
        }
      } else {
        setProgress(45, "이미지를 페이지로 배치하고 있습니다.");
        outputs.push(await createImagePdf(selectedFiles, fitToPage, `${sourceName}${selectedFiles.length > 1 ? "-images" : ""}.pdf`));
      }

      outputs.forEach((file, index) => addOutputRow(file, index, outputs.length));
      const archive = outputs.length > 1 ? await createZip(outputs) : null;
      outputFiles = outputs.map((file) => ({ name: file.name, blob: file.blob }));
      zipDownload = archive ? { name: "converted-pdfs.zip", blob: archive } : null;
      downloadAll = outputs.length === 1 ? outputFiles[0] : null;
      const pageCount = outputs.reduce((total, file) => total + file.pageCount, 0);
      document.querySelector("#pdf-result-summary").textContent = `${outputs.length}개 PDF · ${pageCount}페이지 · ${formatFileSize(outputs.reduce((total, file) => total + file.blob.size, 0))}`;
      document.querySelector("#pdf-result-format").textContent = "PDF";
      document.querySelector("#pdf-download-all span").textContent = "PDF 다운로드";
      result.hidden = false;
      downloadAllButton.hidden = outputs.length !== 1;
      downloadAllButton.disabled = !downloadAll;
      downloadZipButton.hidden = !archive;
      downloadZipButton.disabled = !archive;
      setProgress(100, "PDF 파일의 시그니처와 페이지 수를 확인했습니다.");
      setStatus("PDF 생성과 검증이 완료되었습니다.");
    } catch (error) {
      console.error("Image to PDF conversion failed:", error);
      clearResult();
      setStatus(error instanceof Error ? error.message : "PDF를 만들지 못했습니다. 파일을 확인해 주세요.");
      progress.hidden = true;
    } finally {
      isWorking = false;
      runButton.removeAttribute("aria-busy");
      runButton.querySelector("span").textContent = "다시 만들기";
      renderFileList();
    }
  }

  function triggerDownload(file) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function loadImageFiles(files) {
    if (isWorking || !files.length) return;
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
      setStatus("파일의 총 크기는 100 MB 이하여야 합니다.");
      return;
    }

    setStatus("이미지 형식을 확인하고 있습니다.");
    const entries = await Promise.all(files.map(async (file) => ({ file, type: await detectImageType(file) })));
    const unsupported = entries.find((entry) => !entry.type);
    if (unsupported) {
      setStatus(`${unsupported.file.name}: JPG, PNG, WebP 이미지 파일만 PDF로 만들 수 있습니다.`);
      return;
    }
    selectedFiles = entries;
    renderFileList();
    setStatus(`${selectedFiles.length}개 이미지의 형식을 확인했습니다.`);
  }

  function activateConverterTab(button) {
    const isPdf = button.id === "pdf-tab";
    tabButtons.forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    imagePanel.hidden = isPdf;
    pdfPanel.hidden = !isPdf;
  }

  tabButtons.forEach((button) => button.addEventListener("click", () => activateConverterTab(button)));
  if (new URLSearchParams(window.location.search).get("tool") === "pdf") {
    activateConverterTab(document.querySelector("#pdf-tab"));
  }
  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.pdfMode)));
  input.addEventListener("change", () => {
    const files = Array.from(input.files);
    input.value = "";
    if (activeMode === "image-to-pdf") loadImageFiles(files);
    else loadPdfFiles(files);
  });
  document.querySelector("#pdf-image-format").addEventListener("change", () => {
    document.querySelector("#pdf-jpg-quality").hidden = document.querySelector("#pdf-image-format").value !== "image/jpeg";
  });
  const requestedImageFormat = new URLSearchParams(window.location.search).get("format");
  if (["image/jpeg", "image/png"].includes(requestedImageFormat)) {
    document.querySelector("#pdf-image-format").value = requestedImageFormat;
    document.querySelector("#pdf-jpg-quality").hidden = requestedImageFormat !== "image/jpeg";
  }
  document.querySelector("#pdf-quality").addEventListener("input", (event) => {
    document.querySelector("#pdf-quality-value").value = `${event.currentTarget.value}%`;
    document.querySelector("#pdf-quality-value").textContent = `${event.currentTarget.value}%`;
  });
  document.querySelector("#pdf-edit-operation").addEventListener("change", () => {
    clearResult();
    updateEditControls();
  });
  runButton.addEventListener("click", () => {
    if (activeMode === "image-to-pdf") runImageToPdf();
    else if (activeMode === "pdf-to-image") runPdfToImages();
    else if (activeMode === "merge") runPdfMerge();
    else if (activeMode === "edit") runPdfEdit();
  });
  document.querySelector("#pdf-page-list").addEventListener("dragstart", (event) => {
    const card = event.target.closest(".pdf-page-card");
    if (!card) return;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.pageNumber);
  });
  document.querySelector("#pdf-page-list").addEventListener("dragover", (event) => {
    event.preventDefault();
    const target = event.target.closest(".pdf-page-card");
    const dragging = document.querySelector(".pdf-page-card.is-dragging");
    if (!target || !dragging || target === dragging) return;
    const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    target.parentNode.insertBefore(dragging, after ? target.nextSibling : target);
  });
  document.querySelector("#pdf-page-list").addEventListener("drop", (event) => {
    event.preventDefault();
    reorderPageCards();
  });
  document.querySelector("#pdf-page-list").addEventListener("dragend", (event) => {
    event.target.closest(".pdf-page-card")?.classList.remove("is-dragging");
    reorderPageCards();
  });
  downloadAllButton.addEventListener("click", () => {
    if (downloadAll) triggerDownload(downloadAll);
  });
  downloadZipButton.addEventListener("click", () => {
    if (zipDownload) triggerDownload(zipDownload);
  });

  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  }));
  dropzone.addEventListener("drop", (event) => loadImageFiles(Array.from(event.dataTransfer.files)));

  if (!PDFLib?.PDFDocument) {
    setStatus("PDF 라이브러리를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    return;
  }
  setMode(activeMode);
});