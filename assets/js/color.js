// assets/js/color.js
// Core functionality for Image Color Picker

// Utility: convert [r,g,b] to HEX, RGB, HSL strings
function rgbToHex(r, g, b) {
  const toHex = n => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
function rgbToString(r, g, b) {
  return `rgb(${r}, ${g}, ${b})`;
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Luminosity (relative brightness) using ITU-R BT.709 formula
function getLuminosity(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio per WCAG 2.1
function contrastRatio(l1, l2) {
  const L1 = Math.max(l1, l2) / 255;
  const L2 = Math.min(l1, l2) / 255;
  return (L1 + 0.05) / (L2 + 0.05);
}
function evaluateContrast(rgb1, rgb2) {
  const lum1 = getLuminosity(...rgb1);
  const lum2 = getLuminosity(...rgb2);
  const ratio = contrastRatio(lum1, lum2);
  const aa = ratio >= 4.5;
  const aaLarge = ratio >= 3;
  const aaa = ratio >= 7;
  return { ratio: ratio.toFixed(2), aa, aaLarge, aaa };
}

// Global state
let uploadedImage = null;
let canvas, ctx, magnifier;
let recentColors = [];
const maxRecent = 20;

function init() {
  // Elements
  const fileInput = document.getElementById('file-input');
  const selectBtn = document.getElementById('select-button');
  const uploadZone = document.getElementById('upload-zone');
  canvas = document.getElementById('image-canvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  magnifier = document.getElementById('magnifier');

  // Load recent from localStorage
  loadRecent();

  // File selection
  selectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  // Drag & drop
  ['dragenter', 'dragover'].forEach(ev => uploadZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); uploadZone.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach(ev => uploadZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); uploadZone.classList.remove('is-dragover'); if (ev === 'drop') handleFileSelect(e); }));

  // Canvas interaction (mouse and touch)
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', () => { magnifier.style.display = 'none'; });
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleTouch(e.touches[0]); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); handleTouch(e.touches[0]); });

  // Palette generation
  document.getElementById('generate-palette').addEventListener('click', generatePalette);
  document.getElementById('download-png').addEventListener('click', downloadPalettePNG);
  document.getElementById('download-css').addEventListener('click', downloadPaletteCSS);
  document.getElementById('download-txt').addEventListener('click', downloadPaletteTXT);

  // Harmony
  // (Will be called after a color is selected)

  // Contrast
  document.getElementById('check-contrast').addEventListener('click', checkContrast);

  // Recent clear
  document.getElementById('clear-recent').addEventListener('click', clearRecent);
}

function handleFileSelect(e) {
  const files = e.target.files || e.dataTransfer.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    alert('지원되지 않는 파일 형식입니다. JPG, PNG, WEBP만 사용하세요.');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    alert('파일 크기가 15 MB를 초과합니다.');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      drawImageToCanvas();
      document.getElementById('preview-section').hidden = false;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function drawImageToCanvas() {
  const maxWidth = 800; // limit for performance
  let { width, height } = uploadedImage;
  if (width > maxWidth) {
    const ratio = maxWidth / width;
    width = maxWidth;
    height = height * ratio;
  }
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(uploadedImage, 0, 0, width, height);
}

function getCanvasMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((evt.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.round((evt.clientY - rect.top) * (canvas.height / rect.height));
  return { x, y };
}

function handleMouseMove(e) {
  const { x, y } = getCanvasMousePos(e);
  showMagnifier(x, y);
}

function handleTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((touch.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.round((touch.clientY - rect.top) * (canvas.height / rect.height));
  showMagnifier(x, y);
}

function showMagnifier(cx, cy) {
  const size = 30; // pixels from source
  const zoom = 3;
  const sx = Math.max(0, cx - size / 2);
  const sy = Math.max(0, cy - size / 2);
  const sw = Math.min(size, canvas.width - sx);
  const sh = Math.min(size, canvas.height - sy);
  const dx = 0, dy = 0, dw = magnifier.clientWidth, dh = magnifier.clientHeight;
  const temp = document.createElement('canvas');
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataURL = temp.toDataURL();
  magnifier.style.backgroundImage = `url(${dataURL})`;
  magnifier.style.backgroundSize = `${sw * zoom}px ${sh * zoom}px`;
  const magRect = canvas.getBoundingClientRect();
  magnifier.style.left = `${magRect.left + cx * magRect.width / canvas.width - magnifier.offsetWidth/2}px`;
  magnifier.style.top = `${magRect.top + cy * magRect.height / canvas.height - magnifier.offsetHeight/2}px`;
  magnifier.style.display = 'block';
}

function handleCanvasClick(e) {
  const { x, y } = getCanvasMousePos(e);
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  const [r, g, b, a] = pixel;
  if (a === 0) return; // transparent
  const hex = rgbToHex(r, g, b);
  const rgb = rgbToString(r, g, b);
  const hsl = rgbToHsl(r, g, b);
  const lum = Math.round(getLuminosity(r, g, b));

  // Update UI
  document.getElementById('color-swatch').style.backgroundColor = hex;
  document.getElementById('hex-code').textContent = hex;
  document.getElementById('rgb-code').textContent = rgb;
  document.getElementById('hsl-code').textContent = hsl;
  document.getElementById('luminosity').textContent = lum;
  document.getElementById('color-info').hidden = false;
  document.getElementById('palette-section').hidden = false;
  document.getElementById('harmony-section').hidden = false;
  document.getElementById('contrast-section').hidden = false;
  document.getElementById('recent-section').hidden = false;

  // Save recent
  addRecent({ hex, rgb, hsl });
  // Generate harmony
  generateHarmony({ r, g, b });
}

function addRecent(colorObj) {
  // Avoid duplicates at front
  recentColors = recentColors.filter(c => c.hex !== colorObj.hex);
  recentColors.unshift(colorObj);
  if (recentColors.length > maxRecent) recentColors.pop();
  localStorage.setItem('colorPickerRecent', JSON.stringify(recentColors));
  renderRecent();
}

function loadRecent() {
  const stored = localStorage.getItem('colorPickerRecent');
  if (stored) recentColors = JSON.parse(stored);
  renderRecent();
}

function renderRecent() {
  const container = document.getElementById('recent-colors');
  container.innerHTML = '';
  recentColors.forEach(c => {
    const div = document.createElement('div');
    div.className = 'recent-card';
    div.style.backgroundColor = c.hex;
    div.dataset.hex = c.hex;
    div.title = `${c.hex}\n${c.rgb}\n${c.hsl}`;
    div.addEventListener('click', () => {
      // simulate selection
      document.getElementById('color-swatch').style.backgroundColor = c.hex;
      document.getElementById('hex-code').textContent = c.hex;
      document.getElementById('rgb-code').textContent = c.rgb;
      document.getElementById('hsl-code').textContent = c.hsl;
    });
    container.appendChild(div);
  });
}

function clearRecent() {
  recentColors = [];
  localStorage.removeItem('colorPickerRecent');
  renderRecent();
}

// Copy buttons using Clipboard API
document.addEventListener('click', e => {
  if (e.target.classList.contains('copy-btn')) {
    const targetId = e.target.dataset.clipboardTarget;
    const text = document.getElementById(targetId).textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert(`${targetId.replace('-code', '').toUpperCase()} 복사됨`);
    }).catch(() => alert('복사 실패'));
  }
});

// Simple palette generation using frequency counting
function generatePalette() {
  if (!uploadedImage) return;
  const size = 50; // sample step
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colorMap = {};
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const i = (y * canvas.width + x) * 4;
      const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
      const hex = rgbToHex(r, g, b);
      colorMap[hex] = (colorMap[hex] || 0) + 1;
    }
  }
  const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
  const count = parseInt(document.getElementById('palette-size').value, 10);
  const top = sorted.slice(0, count).map(entry => entry[0]);
  renderPalette(top);
}

function renderPalette(colors) {
  const container = document.getElementById('palette-cards');
  container.innerHTML = '';
  colors.forEach(hex => {
    const div = document.createElement('div');
    div.className = 'palette-card';
    div.style.backgroundColor = hex;
    div.dataset.hex = hex;
    div.title = hex;
    div.addEventListener('click', () => {
      navigator.clipboard.writeText(hex).then(() => alert('HEX 복사됨'));
    });
    container.appendChild(div);
  });
  // Save for download functions
  window.currentPalette = colors;
}

function downloadPalettePNG() {
  if (!window.currentPalette) return;
  const sw = 50, sh = 50;
  const cols = Math.min(5, window.currentPalette.length);
  const rows = Math.ceil(window.currentPalette.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * sw;
  canvas.height = rows * sh;
  const ctx = canvas.getContext('2d');
  window.currentPalette.forEach((hex, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    ctx.fillStyle = hex;
    ctx.fillRect(col * sw, row * sh, sw, sh);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(hex, col * sw + 4, row * sh + 14);
  });
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'palette.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function downloadPaletteCSS() {
  if (!window.currentPalette) return;
  const lines = [':root {'];
  window.currentPalette.forEach((hex, i) => {
    lines.push(`  --color-${i + 1}: ${hex};`);
  });
  lines.push('}');
  const blob = new Blob([lines.join('\n')], { type: 'text/css' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palette.css';
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadPaletteTXT() {
  if (!window.currentPalette) return;
  const blob = new Blob([window.currentPalette.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palette.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Harmony calculations
function generateHarmony({ r, g, b }) {
  const hsl = rgbToHsl(r, g, b);
  const hue = parseInt(hsl.match(/\d+/)[0]);
  const saturation = parseInt(hsl.match(/(?:\d+)%/,)[0]);
  const light = parseInt(hsl.match(/\d+%$/)[0]);
  const combos = [];
  // Complementary
  combos.push({ name: 'Complementary', hue: (hue + 180) % 360 });
  // Analogous (±30)
  combos.push({ name: 'Analogous 1', hue: (hue + 30) % 360 });
  combos.push({ name: 'Analogous 2', hue: (hue - 30 + 360) % 360 });
  // Triadic
  combos.push({ name: 'Triadic 1', hue: (hue + 120) % 360 });
  combos.push({ name: 'Triadic 2', hue: (hue + 240) % 360 });
  // Monochromatic (lightness variations)
  combos.push({ name: 'Monochrome Light', hue, saturation, light: Math.min(light + 20, 100) });
  combos.push({ name: 'Monochrome Dark', hue, saturation, light: Math.max(light - 20, 0) });

  const container = document.getElementById('harmony-cards');
  container.innerHTML = '';
  combos.forEach(c => {
    const hex = hslToHex(c.hue, c.saturation ?? saturation, c.light ?? light);
    const div = document.createElement('div');
    div.className = 'harmony-card';
    div.style.backgroundColor = hex;
    div.dataset.hex = hex;
    div.title = `${c.name}: ${hex}`;
    div.addEventListener('click', () => navigator.clipboard.writeText(hex).then(() => alert('HEX 복사됨')));
    container.appendChild(div);
  });
}

// Convert HSL back to HEX (simple conversion)
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color);
  };
  return rgbToHex(f(0), f(8), f(4));
}

function checkContrast() {
  const bgHex = document.getElementById('bg-color').value;
  const txtHex = document.getElementById('text-color').value;
  const bgRgb = hexToRgb(bgHex);
  const txtRgb = hexToRgb(txtHex);
  const result = evaluateContrast(bgRgb, txtRgb);
  const el = document.getElementById('contrast-result');
  el.innerHTML = `Contrast Ratio: ${result.ratio}<br>AA (normal): ${result.aa ? 'PASS' : 'FAIL'}<br>AA (large): ${result.aaLarge ? 'PASS' : 'FAIL'}<br>AAA: ${result.aaa ? 'PASS' : 'FAIL'}`;
}
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Initialize after DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
