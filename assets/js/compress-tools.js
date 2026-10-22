/* Local compression for images, MP4 and Office Open XML documents. */
document.addEventListener("DOMContentLoaded", function () {
  const options = {
    jpg: { label: "JPG", accept: ".jpg,.jpeg,image/jpeg", extension: "jpg", mimeType: "image/jpeg", maxBytes: 50 * 1024 * 1024 },
    png: { label: "PNG", accept: ".png,image/png", extension: "png", mimeType: "image/png", maxBytes: 50 * 1024 * 1024 },
    mp4: { label: "MP4", accept: ".mp4,video/mp4", extension: "mp4", mimeType: "video/mp4", maxBytes: 250 * 1024 * 1024 },
    word: { label: "Word", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", maxBytes: 100 * 1024 * 1024 },
    ppt: { label: "PowerPoint", accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxBytes: 100 * 1024 * 1024 }
  };
  const type = new URLSearchParams(window.location.search).get("type");
  const config = options[type];
  const input = document.querySelector("#compress-file-input");
  const uploadZone = document.querySelector("#compress-upload-zone");
  const selectedPanel = document.querySelector("#compress-selected-file");
  const qualityPanel = document.querySelector("#compress-quality");
  const qualityRange = document.querySelector("#compress-quality-range");
  const qualityLabel = document.querySelector("#compress-quality-label");
  const qualityValue = document.querySelector("#compress-quality-value");
  const button = document.querySelector("#compress-tools-button");
  const status = document.querySelector("#compress-status");
  const progress = document.querySelector("#compress-progress");
  const progressBar = document.querySelector("#compress-progress-bar");
  const progressLabel = document.querySelector("#compress-progress-label");
  const result = document.querySelector("#compress-tools-result");
  const downloadButton = document.querySelector("#compress-download");
  let selectedFile = null;
  let resultBlob = null;
  let resultName = "";
  let isProcessing = false;
  let ffmpegInstance = null;

  if (!config) {
    document.querySelector("#compress-tool-name").textContent = "파일 압축 도구를 찾을 수 없습니다.";
    input.disabled = true;
    return;
  }

  function formatSize(bytes) {
    if (bytes === 0) return "0 바이트";
    const units = ["바이트", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function setProgress(value, message) {
    progress.hidden = false;
    progressBar.value = Math.max(0, Math.min(100, value));
    progressLabel.textContent = message;
  }

  function clearResult() {
    resultBlob = null;
    resultName = "";
    result.hidden = true;
    downloadButton.disabled = true;
  }

  function resetFile() {
    selectedFile = null;
    input.value = "";
    selectedPanel.hidden = true;
    button.disabled = true;
    button.querySelector("span").textContent = "압축 시작";
    qualityRange.disabled = false;
    progress.hidden = true;
    setStatus("");
    clearResult();
  }

  function validSignature(file, bytes) {
    if (type === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (type === "png") return bytes.subarray(0, 8).toString() === "137,80,78,71,13,10,26,10";
    if (type === "mp4") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
    if (type === "word" || type === "ppt") return bytes[0] === 0x50 && bytes[1] === 0x4b;
    return false;
  }

  function selectFile(file) {
    if (!file || isProcessing) return;
    resetFile();
    const extension = file.name.split(".").pop().toLowerCase();
    const allowed = type === "jpg" ? ["jpg", "jpeg"] : [config.extension];
    if (!allowed.includes(extension)) {
      setStatus(`${config.label} 파일(${allowed.map((value) => `.${value}`).join(", ")})만 선택할 수 있습니다.`, true);
      return;
    }
    if (file.size === 0) {
      setStatus("빈 파일은 압축할 수 없습니다.", true);
      return;
    }
    if (file.size > config.maxBytes) {
      setStatus(`파일은 ${formatSize(config.maxBytes)} 이하만 처리할 수 있습니다.`, true);
      return;
    }
    selectedFile = file;
    document.querySelector("#compress-file-name").textContent = file.name;
    document.querySelector("#compress-file-size").textContent = formatSize(file.size);
    document.querySelector("#compress-tool-name").textContent = `${config.label} 압축`;
    document.querySelector("#compress-tool-description").textContent = type === "mp4"
      ? "동영상을 H.264로 다시 인코딩합니다. 재생 시간에 따라 처리에 시간이 걸릴 수 있습니다."
      : type === "word" || type === "ppt"
        ? `${config.label} 문서 패키지를 다시 압축합니다. 문서 내부 파일을 확인한 뒤 결과를 제공합니다.`
        : `${config.label} 이미지를 브라우저 Canvas로 다시 인코딩하고 원본 크기와 비교합니다.`;
    selectedPanel.hidden = false;
    button.disabled = false;
    qualityPanel.hidden = type === "ppt" || type === "word" || type === "png";
    qualityLabel.textContent = type === "mp4" ? "영상 품질" : "이미지 품질";
    qualityValue.textContent = `${qualityRange.value}%`;
    clearResult();
    setStatus("파일을 확인했습니다. 압축을 시작할 수 있습니다.");
  }

  async function verifyOfficePackage(blob) {
    if (typeof window.JSZip !== "function") throw new Error("문서 압축 모듈을 불러오지 못했습니다.");
    const archive = await window.JSZip.loadAsync(blob, { checkCRC32: true });
    const required = type === "word" ? "word/document.xml" : "ppt/presentation.xml";
    if (!archive.files["[Content_Types].xml"] || !archive.files[required]) {
      throw new Error(`${config.label} 문서 구조를 확인할 수 없습니다. DOCX 또는 PPTX 파일인지 확인해 주세요.`);
    }
    return archive;
  }

  async function compressImage() {
    const signature = new Uint8Array(await selectedFile.slice(0, 8).arrayBuffer());
    if (!validSignature(selectedFile, signature)) throw new Error("선택한 파일의 이미지 시그니처가 올바르지 않습니다.");
    setProgress(10, "이미지 데이터를 읽고 있습니다.");
    const bitmap = await createImageBitmap(selectedFile);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (sourceWidth * sourceHeight > 40000000) {
      bitmap.close();
      throw new Error("이미지 해상도가 4,000만 픽셀을 초과합니다.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d", { alpha: type === "png" });
    if (!context) {
      bitmap.close();
      throw new Error("이미지 인코더를 시작할 수 없습니다.");
    }
    if (type === "jpg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    setProgress(65, "이미지를 다시 인코딩하고 있습니다.");
    const blob = await new Promise((resolve, reject) => canvas.toBlob((output) => {
      if (!output || output.type !== config.mimeType || output.size === 0) reject(new Error("유효한 이미지 파일을 생성하지 못했습니다."));
      else resolve(output);
    }, config.mimeType, type === "jpg" ? Number(qualityRange.value) / 100 : undefined));
    canvas.width = 0;
    canvas.height = 0;
    const outputBitmap = await createImageBitmap(blob);
    const sameDimensions = outputBitmap.width === sourceWidth && outputBitmap.height === sourceHeight;
    outputBitmap.close();
    if (!sameDimensions) throw new Error("압축 후 이미지 크기가 원본과 달라 작업을 중단했습니다.");
    return blob;
  }

  async function loadFfmpeg() {
    if (!window.FFmpegWASM?.FFmpeg) throw new Error("MP4 압축 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
    if (!ffmpegInstance) {
      ffmpegInstance = new window.FFmpegWASM.FFmpeg();
      ffmpegInstance.on("progress", ({ progress: value }) => {
        if (isProcessing) setProgress(15 + value * 75, `동영상 재인코딩 ${Math.round(value * 100)}%`);
      });
      ffmpegInstance.on("log", ({ message }) => {
        if (/error|failed/i.test(message)) console.warn("FFmpeg:", message);
      });
    }
    if (!ffmpegInstance.loaded) {
      setProgress(5, "로컬 영상 압축기를 준비하고 있습니다. 첫 사용에는 약 32 MB를 읽습니다.");
      const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpegInstance.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`
      });
    }
    return ffmpegInstance;
  }

  async function compressVideoNative(file, qualityPercent) {
    setProgress(15, "브라우저 내장 미디어 엔진으로 동영상을 압축하고 있습니다.");
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("동영상 정보를 읽지 못했습니다."));
    });

    const duration = video.duration || 1;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const scale = qualityPercent < 50 ? 0.75 : 1;
    const targetWidth = Math.round((width * scale) / 2) * 2;
    const targetHeight = Math.round((height * scale) / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(25);
    const mimeType = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4;codecs=avc1"))
      ? "video/mp4;codecs=avc1"
      : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4"))
        ? "video/mp4"
        : "video/webm";

    const bitrate = Math.max(250000, Math.round((file.size * 8 / duration) * (qualityPercent / 100) * 0.7));
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      videoBitsPerSecond: bitrate
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        URL.revokeObjectURL(video.src);
        const actualType = mimeType.includes("mp4") ? "video/mp4" : "video/webm";
        const outputBlob = new Blob(chunks, { type: actualType });
        resolve(outputBlob);
      };
      recorder.onerror = reject;

      recorder.start(100);
      video.play().catch(reject);

      function renderFrame() {
        if (video.ended || video.paused) {
          if (recorder.state === "recording") recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const percent = Math.min(90, Math.round((video.currentTime / duration) * 75) + 15);
        setProgress(percent, `동영상 압축 중 (${Math.round((video.currentTime / duration) * 100)}%)`);
        requestAnimationFrame(renderFrame);
      }
      renderFrame();
    });
  }

  async function compressVideo() {
    const signature = new Uint8Array(await selectedFile.slice(0, 12).arrayBuffer());
    if (!validSignature(selectedFile, signature)) throw new Error("MP4 컨테이너 시그니처를 확인할 수 없습니다.");

    if (typeof window.SharedArrayBuffer !== "undefined" && window.crossOriginIsolated) {
      try {
        const ffmpeg = await loadFfmpeg();
        const sourcePath = "filewise-input.mp4";
        const outputPath = "filewise-compressed.mp4";
        setProgress(10, "MP4 파일을 로컬 작업 공간에 준비하고 있습니다.");
        await ffmpeg.writeFile(sourcePath, new Uint8Array(await selectedFile.arrayBuffer()));
        const quality = Number(qualityRange.value);
        const crf = String(Math.round(35 - ((quality - 30) / 65) * 19));
        try {
          const exitCode = await ffmpeg.exec([
            "-i", sourcePath,
            "-map", "0:v:0",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", crf,
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outputPath
          ]);
          if (exitCode === 0) {
            const outputBytes = await ffmpeg.readFile(outputPath);
            if (outputBytes instanceof Uint8Array && outputBytes.length >= 16) {
              return new Blob([outputBytes], { type: config.mimeType });
            }
          }
        } finally {
          for (const path of [sourcePath, outputPath, "filewise-probe.json"]) {
            try {
              await ffmpeg.deleteFile(path);
            } catch {
              continue;
            }
          }
        }
      } catch (err) {
        console.warn("FFmpeg fallback to native video recorder:", err);
      }
    }
    return await compressVideoNative(selectedFile, Number(qualityRange.value));
  }

  async function compressOffice() {
    const signature = new Uint8Array(await selectedFile.slice(0, 4).arrayBuffer());
    if (!validSignature(selectedFile, signature)) throw new Error("Office 문서 ZIP 시그니처가 올바르지 않습니다.");
    setProgress(10, `${config.label} 문서 패키지를 확인하고 있습니다.`);
    const archive = await verifyOfficePackage(selectedFile);
    setProgress(65, "문서 패키지 항목을 다시 압축하고 있습니다.");
    const blob = await archive.generateAsync({
      type: "blob",
      mimeType: config.mimeType,
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    }, ({ percent }) => setProgress(65 + percent * 0.25, `문서 압축 ${Math.round(percent)}%`));
    if (!blob.size) throw new Error("압축된 문서 파일이 비어 있습니다.");
    await verifyOfficePackage(blob);
    return blob;
  }

  function presentResult(blob) {
    resultBlob = blob;
    const sourceName = selectedFile.name.replace(/\.[^.]+$/, "") || "file";
    const ext = blob.type.includes("webm") ? "webm" : config.extension;
    resultName = `${sourceName}-compressed.${ext}`;
    const change = ((blob.size - selectedFile.size) / selectedFile.size) * 100;
    document.querySelector("#compress-original-size").textContent = formatSize(selectedFile.size);
    document.querySelector("#compress-output-size").textContent = formatSize(blob.size);
    document.querySelector("#compress-size-change").textContent = change < 0
      ? `${Math.abs(change).toFixed(1)}% 감소`
      : change > 0 ? `${change.toFixed(1)}% 증가` : "변화 없음";
    document.querySelector("#compress-result-note").textContent = change < 0
      ? `실제 파일 크기가 ${Math.abs(change).toFixed(1)}% 줄었습니다.`
      : change > 0
        ? `재압축 결과 원본보다 ${change.toFixed(1)}% 커졌습니다. 결과 파일을 그대로 다운로드할 수 있습니다.`
        : "재압축 후 파일 크기에 변화가 없습니다. 결과 파일은 다운로드할 수 있습니다.";
    result.hidden = false;
    downloadButton.disabled = false;
  }

  async function startCompression() {
    if (!selectedFile || isProcessing) return;
    isProcessing = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span").textContent = "압축 중...";
    input.disabled = true;
    qualityRange.disabled = true;
    document.querySelector("#compress-remove-file").disabled = true;
    setStatus("");
    clearResult();
    try {
      setProgress(2, "파일 준비 중");
      const blob = type === "jpg" || type === "png"
        ? await compressImage()
        : type === "mp4" ? await compressVideo() : await compressOffice();
      setProgress(95, "결과 파일을 확인하고 있습니다.");
      if (!blob || !blob.size || blob.type !== config.mimeType) throw new Error("압축 결과의 파일 형식 또는 크기가 올바르지 않습니다.");
      presentResult(blob);
      setProgress(100, "파일 형식과 구조 검증을 완료했습니다.");
      setStatus("압축과 결과 검증이 완료되었습니다.");
      button.querySelector("span").textContent = "다시 압축하기";
    } catch (error) {
      console.error("Local file compression failed:", error);
      clearResult();
      progress.hidden = true;
      setStatus(error instanceof Error ? error.message : "파일을 압축하지 못했습니다.", true);
      button.querySelector("span").textContent = "다시 시도";
    } finally {
      isProcessing = false;
      input.disabled = false;
      qualityRange.disabled = false;
      document.querySelector("#compress-remove-file").disabled = false;
      button.removeAttribute("aria-busy");
      button.disabled = !selectedFile;
    }
  }

  function downloadResult() {
    if (!resultBlob || !resultBlob.size) {
      setStatus("다운로드할 압축 파일이 없습니다.", true);
      return;
    }
    const url = URL.createObjectURL(resultBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = resultName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  document.querySelector("#compress-tool-name").textContent = `${config.label} 압축`;
  document.querySelector("#compress-drop-title").textContent = `${config.label} 파일을 여기에 놓으세요`;
  document.querySelector("#compress-drop-help").textContent = `${config.accept.split(",").slice(0, 2).join(", ")} · 파일당 최대 ${formatSize(config.maxBytes)}`;
  input.accept = config.accept;
  qualityPanel.hidden = type === "ppt" || type === "word" || type === "png";
  if (type === "mp4") qualityLabel.textContent = "영상 품질";

  input.addEventListener("change", () => selectFile(input.files[0]));
  document.querySelector("#compress-remove-file").addEventListener("click", resetFile);
  button.addEventListener("click", startCompression);
  downloadButton.addEventListener("click", downloadResult);
  qualityRange.addEventListener("input", () => {
    qualityValue.textContent = `${qualityRange.value}%`;
    clearResult();
  });
  ["dragenter", "dragover"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("is-dragover");
  }));
  uploadZone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));
});
