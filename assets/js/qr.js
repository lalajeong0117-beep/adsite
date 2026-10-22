/* Filewise QR generation */
document.addEventListener("DOMContentLoaded", function () {
  const supportedTypes = ["url", "text", "wifi", "email", "phone", "sms"];
  const tabs = Array.from(document.querySelectorAll(".qr-type"));
  const forms = Array.from(document.querySelectorAll("[data-qr-form]"));
  const status = document.querySelector("#qr-status");
  const preview = document.querySelector("#qr-preview");
  const emptyPreview = document.querySelector("#qr-empty");
  const previewMeta = document.querySelector("#qr-preview-meta");
  const generateButton = document.querySelector("#qr-generate");
  const downloadPngButton = document.querySelector("#qr-download-png");
  const downloadSvgButton = document.querySelector("#qr-download-svg");
  const foregroundInput = document.querySelector("#qr-foreground");
  const backgroundInput = document.querySelector("#qr-background");
  const encoderLimit = 2300;
  let activeType = new URLSearchParams(window.location.search).get("type");
  if (!supportedTypes.includes(activeType)) activeType = "url";
  let currentPng = null;
  let currentSvg = null;
  let previewUrl = null;
  let updateTimer = 0;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function clearResult() {
    currentPng = null;
    currentSvg = null;
    downloadPngButton.disabled = true;
    downloadSvgButton.disabled = true;
    preview.hidden = true;
    emptyPreview.hidden = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewMeta.textContent = `최대 ${encoderLimit.toLocaleString("ko-KR")}바이트 · 오류 정정 ${document.querySelector("#qr-error-level").value}`;
  }

  function readPhone(selector) {
    const value = document.querySelector(selector).value.trim();
    const compact = value.replace(/[\s().-]/g, "");
    if (!/^\+?\d{3,20}$/.test(compact)) throw new Error("국가 번호를 포함한 올바른 전화번호를 입력해 주세요.");
    return compact;
  }

  function escapeWifiValue(value) {
    return value.replace(/[\\;,:"]/g, (character) => `\\${character}`);
  }

  function getPayload() {
    const value = (selector) => document.querySelector(selector).value.trim();
    if (activeType === "url") {
      let url;
      try {
        url = new URL(value("#qr-url"));
      } catch {
        throw new Error("올바른 웹 주소를 입력해 주세요. 예: https://example.com");
      }
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
        throw new Error("http:// 또는 https://로 시작하는 유효한 주소를 입력해 주세요.");
      }
      return url.href;
    }

    if (activeType === "text") {
      const text = document.querySelector("#qr-text").value;
      if (!text.trim()) throw new Error("QR 코드에 담을 텍스트를 입력해 주세요.");
      return text;
    }

    if (activeType === "wifi") {
      const ssid = value("#qr-ssid");
      const security = document.querySelector("#qr-security").value;
      const password = document.querySelector("#qr-wifi-password").value;
      if (!ssid) throw new Error("Wi-Fi 네트워크 이름을 입력해 주세요.");
      if (security !== "nopass" && !password) throw new Error("Wi-Fi 비밀번호를 입력해 주세요.");
      const fields = [`T:${security}`, `S:${escapeWifiValue(ssid)}`];
      if (security !== "nopass") fields.push(`P:${escapeWifiValue(password)}`);
      if (document.querySelector("#qr-hidden").checked) fields.push("H:true");
      return `WIFI:${fields.join(";")};;`;
    }

    if (activeType === "email") {
      const address = value("#qr-email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("올바른 이메일 주소를 입력해 주세요.");
      const query = [];
      const subject = value("#qr-email-subject");
      const body = document.querySelector("#qr-email-body").value.trim();
      if (subject) query.push(`subject=${encodeURIComponent(subject)}`);
      if (body) query.push(`body=${encodeURIComponent(body)}`);
      const details = query.join("&");
      return `mailto:${address}${details ? `?${details}` : ""}`;
    }

    if (activeType === "phone") return `tel:${readPhone("#qr-phone")}`;
    if (activeType === "sms") {
      const phone = readPhone("#qr-sms-phone");
      const message = document.querySelector("#qr-sms-message").value.trim();
      return `sms:${phone}${message ? `?body=${encodeURIComponent(message)}` : ""}`;
    }
    throw new Error("지원하지 않는 QR 코드 유형입니다.");
  }

  function luminance(hex) {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function updateContrast() {
    const values = [luminance(foregroundInput.value), luminance(backgroundInput.value)].sort((a, b) => b - a);
    const ratio = (values[0] + 0.05) / (values[1] + 0.05);
    const note = document.querySelector("#qr-contrast");
    note.classList.toggle("is-warning", ratio < 4.5);
    note.textContent = ratio < 4.5
      ? `명암 대비 ${ratio.toFixed(1)}:1입니다. 스캔을 위해 더 높은 대비를 권장합니다.`
      : `명암 대비 ${ratio.toFixed(1)}:1 · 스캔에 적합한 대비입니다.`;
  }

  function createQr(payload) {
    if (typeof window.qrcode !== "function") throw new Error("QR 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    const level = document.querySelector("#qr-error-level").value;
    const qr = window.qrcode(0, level);
    qr.addData(payload, "Byte");
    qr.make();
    return qr;
  }

  function createPng(qr, pixelSize, foreground, background) {
    const margin = 4;
    const modules = qr.getModuleCount();
    const total = modules + margin * 2;
    const canvas = document.createElement("canvas");
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("PNG 이미지를 만들 수 없습니다.");
    context.fillStyle = background;
    context.fillRect(0, 0, pixelSize, pixelSize);
    context.fillStyle = foreground;
    for (let row = 0; row < modules; row += 1) {
      const top = Math.floor(((row + margin) * pixelSize) / total);
      const bottom = Math.ceil(((row + margin + 1) * pixelSize) / total);
      for (let column = 0; column < modules; column += 1) {
        if (!qr.isDark(row, column)) continue;
        const left = Math.floor(((column + margin) * pixelSize) / total);
        const right = Math.ceil(((column + margin + 1) * pixelSize) / total);
        context.fillRect(left, top, right - left, bottom - top);
      }
    }
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (!blob || blob.type !== "image/png" || blob.size === 0) reject(new Error("PNG QR 파일을 만들지 못했습니다."));
      else resolve(blob);
    }, "image/png"));
  }

  function createSvg(qr, pixelSize, foreground, background) {
    const margin = 4;
    const modules = qr.getModuleCount();
    const viewSize = modules + margin * 2;
    const paths = [];
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (qr.isDark(row, column)) paths.push(`M${column + margin} ${row + margin}h1v1h-1z`);
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${background}"/><path fill="${foreground}" d="${paths.join("")}"/></svg>`;
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  }

  async function generate() {
    window.clearTimeout(updateTimer);
    setStatus("QR 코드를 생성하고 있습니다.");
    clearResult();
    try {
      const payload = getPayload();
      const byteLength = new TextEncoder().encode(payload).length;
      if (byteLength > encoderLimit) throw new Error(`입력 내용은 최대 ${encoderLimit.toLocaleString("ko-KR")}바이트까지 사용할 수 있습니다.`);
      const size = Number(document.querySelector("#qr-size").value);
      const level = document.querySelector("#qr-error-level").value;
      const foreground = foregroundInput.value.toUpperCase();
      const background = backgroundInput.value.toUpperCase();
      const qr = createQr(payload);
      const [png, svg] = await Promise.all([
        createPng(qr, size, foreground, background),
        Promise.resolve(createSvg(qr, size, foreground, background))
      ]);
      if (!png.size || !svg.size) throw new Error("QR 파일이 비어 있어 생성 결과를 사용할 수 없습니다.");
      currentPng = png;
      currentSvg = svg;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(currentPng);
      preview.src = previewUrl;
      preview.hidden = false;
      emptyPreview.hidden = true;
      downloadPngButton.disabled = false;
      downloadSvgButton.disabled = false;
      previewMeta.textContent = `${size.toLocaleString("ko-KR")} × ${size.toLocaleString("ko-KR")} px · ${byteLength.toLocaleString("ko-KR")}바이트 · 오류 정정 ${level}`;
      setStatus("QR 코드를 생성했습니다. 사용 전 카메라로 스캔해 확인하세요.");
    } catch (error) {
      clearResult();
      setStatus(error instanceof Error ? error.message : "QR 코드를 생성하지 못했습니다.", true);
    }
  }

  function scheduleGenerate() {
    setStatus("");
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(generate, 180);
  }

  function download(blob, extension) {
    if (!blob || !blob.size) {
      setStatus("다운로드할 QR 파일이 없습니다.", true);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `filewise-qr-${activeType}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function selectType(type, updateUrl = true) {
    activeType = type;
    tabs.forEach((tab) => {
      const selected = tab.dataset.qrType === type;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    forms.forEach((form) => {
      form.hidden = form.dataset.qrForm !== type;
    });
    if (type === "wifi") {
      document.querySelector("#qr-wifi-password-field").hidden = document.querySelector("#qr-security").value === "nopass";
    }
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("type", type);
      url.hash = "generator";
      window.history.replaceState({}, "", url);
    }
    clearResult();
    setStatus("");
    scheduleGenerate();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectType(tab.dataset.qrType));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[nextIndex].focus();
      selectType(tabs[nextIndex].dataset.qrType);
    });
  });

  forms.forEach((form) => form.addEventListener("input", scheduleGenerate));
  document.querySelector("#qr-security").addEventListener("change", () => {
    document.querySelector("#qr-wifi-password-field").hidden = document.querySelector("#qr-security").value === "nopass";
    scheduleGenerate();
  });
  ["#qr-size", "#qr-error-level", "#qr-foreground", "#qr-background"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      updateContrast();
      scheduleGenerate();
    });
  });
  generateButton.addEventListener("click", generate);
  downloadPngButton.addEventListener("click", () => download(currentPng, "png"));
  downloadSvgButton.addEventListener("click", () => download(currentSvg, "svg"));

  selectType(activeType, false);
  updateContrast();
});
