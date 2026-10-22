// ocr.js – client side OCR logic using Tesseract.js

// Helper: update status messages
function setStatus(msg, isError = false) {
  const el = document.getElementById('ocr-status');
  el.textContent = msg;
  el.style.color = isError ? 'var(--error)' : 'var(--text)';
}

let selectedFiles = [];
let worker = null;
const fileInput = document.getElementById('ocr-file-input');
const fileListEl = document.getElementById('ocr-file-list');
const startBtn = document.getElementById('ocr-start');
const resultPanel = document.getElementById('result-panel');
const canvas = document.getElementById('ocr-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const textArea = document.getElementById('ocr-text');
const copyBtn = document.getElementById('ocr-copy');
const dlBtn = document.getElementById('ocr-download');

// ---------- File handling ----------
function formatBytes(b) {
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function renderFileList() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.onload = () => URL.revokeObjectURL(img.src);
    const info = document.createElement('div');
    info.textContent = `${f.name} – ${formatBytes(f.size)} – ${f.type}`;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = '삭제';
    del.onclick = () => {
      selectedFiles.splice(idx, 1);
      renderFileList();
      startBtn.disabled = selectedFiles.length === 0;
    };
    item.append(img, info, del);
    fileListEl.appendChild(item);
  });
  startBtn.disabled = selectedFiles.length === 0;
}

// Shared file validation & addition logic
function handleFiles(fileList) {
  const arr = Array.from(fileList);
  // validation
  if (selectedFiles.length + arr.length > 10) {
    setStatus('한 번에 최대 10개의 이미지만 선택할 수 있습니다.', true);
    return;
  }
  for (const f of arr) {
    if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(f.type)) {
      setStatus(`지원하지 않는 파일 형식: ${f.name}`, true);
      continue;
    }
    if (f.size > 15 * 1024 * 1024) {
      setStatus(`파일이 너무 큽니다 (15 MB 초과): ${f.name}`, true);
      continue;
    }
    // avoid duplicate entries
    if (!selectedFiles.some(existing => existing.name === f.name && existing.size === f.size && existing.lastModified === f.lastModified)) {
      selectedFiles.push(f);
    }
  }
  renderFileList();
}

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
});



// Drag & Drop support
const dropzone = document.querySelector('.ocr-dropzone');
['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e=>{e.preventDefault();dropzone.classList.add('dragover');}));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e=>{e.preventDefault();dropzone.classList.remove('dragover');}));
 dropzone.addEventListener('drop', e=>{
  const files = e.dataTransfer.files;
  fileInput.files = files; // triggers change via event listener above
  fileInput.dispatchEvent(new Event('change'));
  });

async function initWorker() {
  // Terminate any existing worker to allow language change
  if (worker) {
    await worker.terminate();
    worker = null;
  }
  setStatus('OCR 엔진 초기화 중...');
  // Gather selected language codes as an array
  const langs = Array.from(document.querySelectorAll('.ocr-lang input:checked')).map(i => i.value);
  // Create worker using Tesseract v5 API (languages array, OEM=1)
  worker = await Tesseract.createWorker(langs, 1);
  setStatus('OCR 엔진 초기화 완료');
  // Optional: set page segmentation mode for better Korean handling
  if (worker.setParameters) {
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
  }
  return worker;
}

function drawToCanvas(file, rotation = 0) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      canvas.width = rotation % 180 === 0 ? w : h;
      canvas.height = rotation % 180 === 0 ? h : w;
      ctx.save();
      // Center and rotate without extra DPI scaling
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      // Revoke the temporary object URL
      URL.revokeObjectURL(img.src);
      resolve();
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Apply selected PSM and preprocessing before OCR
async function processFile(file) {
  await drawToCanvas(file);
  // Apply preprocessing based on UI checkboxes
  applyPreprocess();

  // Set PSM mode
  const psmSelect = document.getElementById('ocr-psm');
  const psmValue = psmSelect.value; // AUTO, SINGLE_BLOCK, SINGLE_LINE
  const psmMap = {
    AUTO: Tesseract.PSM.AUTO_OSD || 3,
    SINGLE_BLOCK: Tesseract.PSM.SINGLE_BLOCK || 6,
    SINGLE_LINE: Tesseract.PSM.SINGLE_LINE || 7
  };
  if (worker.setParameters) {
    await worker.setParameters({ tessedit_pageseg_mode: psmMap[psmValue] || 3 });
  }

  const { data: { text } } = await worker.recognize(canvas);
  return text.trim() || '인식된 텍스트가 없습니다.';
}

// Preprocess canvas image according to selected options
function applyPreprocess() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Grayscale
  if (document.getElementById('preprocess-grayscale').checked) {
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = data[i + 1] = data[i + 2] = avg;
    }
  }

  // Contrast (simple boost)
  if (document.getElementById('preprocess-contrast').checked) {
    const contrast = 40; // range -255 to 255
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = truncate(factor * (data[i] - 128) + 128);
      data[i + 1] = truncate(factor * (data[i + 1] - 128) + 128);
      data[i + 2] = truncate(factor * (data[i + 2] - 128) + 128);
    }
  }

  // Binarize (threshold after possible grayscale)
  if (document.getElementById('preprocess-binarize').checked) {
    const threshold = 128;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Upscale 2x if selected
  if (document.getElementById('preprocess-upscale').checked) {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width * 2;
    tmp.height = canvas.height * 2;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    canvas.width = tmp.width;
    canvas.height = tmp.height;
    ctx.drawImage(tmp, 0, 0);
  }
}

function truncate(val) {
  return Math.min(255, Math.max(0, val));
}

// ---------- UI flow ----------
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  setStatus('OCR 엔진 초기화 중...');
  try {
    await initWorker();
    const results = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      setStatus(`이미지 ${i + 1}/${selectedFiles.length} 처리 중...`);
      const txt = await processFile(selectedFiles[i]);
      results.push(`--- ${selectedFiles[i].name} ---\n${txt}`);
      textArea.value = results.join('\n\n');
    }
    setStatus('인식 완료');
    resultPanel.hidden = false;
    copyBtn.disabled = false;
    dlBtn.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus('OCR 작업 중 오류가 발생했습니다.', true);
  } finally {
    startBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(textArea.value);
    setStatus('텍스트가 클립보드에 복사되었습니다.');
  } catch (e) {
    setStatus('복사에 실패했습니다.', true);
  }
});

dlBtn.addEventListener('click', () => {
  const blob = new Blob([textArea.value], {type: 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'extracted-text.txt';
  a.click();
  URL.revokeObjectURL(url);
});

// Initial UI state
copyBtn.disabled = true;
dlBtn.disabled = true;
resultPanel.hidden = true;
