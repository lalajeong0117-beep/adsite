document.addEventListener("DOMContentLoaded", function () {
  const headerContainer = document.querySelector("#site-header");
  if (headerContainer) {
    fetch("components/header.html")
      .then((response) => {
        if (!response.ok) throw new Error("Header fetch failed");
        return response.text();
      })
      .then((markup) => {
        headerContainer.innerHTML = markup;
        const currentFile = window.location.pathname.split("/").pop() || "index.html";
        const currentType = new URLSearchParams(window.location.search).get("type");
        const navLinks = headerContainer.querySelectorAll("#primary-navigation a");
        navLinks.forEach((link) => {
          const href = link.getAttribute("href") || "";
          const [linkPath, linkSearch] = href.split("?");
          if (linkPath === currentFile) {
            if (!linkSearch || (currentType && linkSearch.includes(`type=${currentType}`))) {
              link.setAttribute("aria-current", "page");
            }
          }
        });
      })
      .catch((err) => console.warn("Header load warning:", err));
  }

  const bannerContainer = document.querySelector("#site-banner");
  if (bannerContainer) {
    fetch("components/banner.html")
      .then((response) => {
        if (!response.ok) throw new Error("Banner fetch failed");
        return response.text();
      })
      .then((markup) => {
        bannerContainer.innerHTML = markup;
        loadCoupangBanners();
      })
      .catch((err) => console.warn("Banner load warning:", err));
  }

  function loadCoupangBanners() {
    function render() {
      if (typeof PartnersCoupang === "undefined" || !PartnersCoupang.G) return;
      const pcContainer = document.querySelector("#coupang-banner-pc");
      const moContainer = document.querySelector("#coupang-banner-mo");

      if (pcContainer && pcContainer.children.length === 0) {
        new PartnersCoupang.G({
          id: 1044376,
          template: "carousel",
          trackingCode: "AF9566632",
          width: "680",
          height: "140",
          tsource: "",
          container: pcContainer
        });
      }

      if (moContainer && moContainer.children.length === 0) {
        new PartnersCoupang.G({
          id: 1044376,
          template: "carousel",
          trackingCode: "AF9566632",
          width: "280",
          height: "140",
          tsource: "",
          container: moContainer
        });
      }
    }

    if (typeof PartnersCoupang !== "undefined" && PartnersCoupang.G) {
      render();
    } else {
      const existingScript = document.querySelector('script[src*="ads-partners.coupang.com/g.js"]');
      if (existingScript) {
        existingScript.addEventListener("load", render);
      } else {
        const script = document.createElement("script");
        script.src = "https://ads-partners.coupang.com/g.js";
        script.async = true;
        script.onload = render;
        document.head.appendChild(script);
      }
    }
  }

  const footerContainer = document.querySelector("#site-footer");
  if (footerContainer) {
    fetch("components/footer.html")
      .then((response) => {
        if (!response.ok) throw new Error("Footer fetch failed");
        return response.text();
      })
      .then((markup) => {
        footerContainer.innerHTML = markup;
      })
      .catch((err) => console.warn("Footer load warning:", err));
  }

  const fileInput = document.querySelector("#file-input");
  if (fileInput) {
    const maxFileSize = 100 * 1024 * 1024;
    const fileDetails = document.querySelector("#file-details");
    const uploadMessage = document.querySelector("#upload-message");
    const compressionResult = document.querySelector("#compression-result");
    const compressButton = document.querySelector("#compress-button");
    const downloadButton = document.querySelector("#download-button");
    let selectedFile = null;
    let compressedBlob = null;
    let downloadFilename = "compressed.pdf";
    let isCompressing = false;

  // File information
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 바이트";

    const units = ["바이트", "KB", "MB", "GB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = bytes / Math.pow(1024, unitIndex);
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function setStatus(message, isProgress = false) {
    uploadMessage.classList.toggle("is-progress", isProgress);
    uploadMessage.textContent = message;
  }

  function resetResult() {
    compressedBlob = null;
    compressionResult.hidden = true;
    downloadButton.disabled = true;
    compressButton.disabled = false;
    compressButton.querySelector("span").textContent = "PDF 압축 시작";
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    fileDetails.hidden = true;
    setStatus("");
    resetResult();
  }

  function showFile(file) {
    if (!file) return;

    if (!/\.pdf$/i.test(file.name)) {
      clearFile();
      setStatus("PDF 파일만 압축할 수 있습니다.");
      return;
    }

    if (file.size === 0) {
      clearFile();
      setStatus("빈 파일은 PDF로 처리할 수 없습니다.");
      return;
    }

    if (file.size > maxFileSize) {
      clearFile();
      setStatus("파일 크기는 100 MB 이하여야 합니다.");
      return;
    }

    selectedFile = file;
    setStatus("");
    document.querySelector("#file-name").textContent = file.name;
    document.querySelector("#file-size").textContent = formatFileSize(file.size);
    fileDetails.hidden = false;
    resetResult();
  }

  fileInput.addEventListener("change", function () {
    showFile(this.files[0]);
  });

  document.querySelector("#remove-file").addEventListener("click", clearFile);

  // Drag and drop
  const uploadZone = document.querySelector("#upload-zone");
  uploadZone.addEventListener("dragenter", function (event) {
    event.preventDefault();
    event.stopPropagation();
    this.classList.add("is-dragover");
  });
  uploadZone.addEventListener("dragover", function (event) {
    event.preventDefault();
    event.stopPropagation();
    this.classList.add("is-dragover");
  });
  uploadZone.addEventListener("dragleave", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.relatedTarget || !this.contains(event.relatedTarget)) {
      this.classList.remove("is-dragover");
    }
  });
  uploadZone.addEventListener("drop", function (event) {
    event.preventDefault();
    event.stopPropagation();
    this.classList.remove("is-dragover");
    showFile(event.dataTransfer.files[0]);
  });

  // Re-save the PDF locally in the browser and download the result
  async function startCompression() {
    if (isCompressing) return;

    if (!selectedFile) {
      setStatus("압축할 PDF 파일을 먼저 선택해 주세요.");
      fileInput.focus();
      return;
    }

    isCompressing = true;
    resetResult();
    compressButton.disabled = true;
    compressButton.setAttribute("aria-busy", "true");
    compressButton.querySelector("span").textContent = "PDF 처리 중...";
    document.querySelector("#remove-file").disabled = true;
    fileInput.disabled = true;

    try {
      if (!window.PDFLib || !window.PDFLib.PDFDocument) {
        throw new Error("PDF 처리 라이브러리를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      }

      setStatus("파일 준비 중...", true);
      const originalBytes = new Uint8Array(await selectedFile.arrayBuffer());
      if (String.fromCharCode(...originalBytes.slice(0, 5)) !== "%PDF-") {
        throw new Error("선택한 파일에서 PDF 형식을 확인할 수 없습니다.");
      }

      setStatus("PDF 처리 중...", true);
      let pdfDocument;
      try {
        pdfDocument = await window.PDFLib.PDFDocument.load(originalBytes, { updateMetadata: false });
      } catch (error) {
        const details = String(error?.message || "").toLowerCase();
        if (details.includes("encrypt") || details.includes("password")) {
          throw new Error("암호로 보호된 PDF는 처리할 수 없습니다. 암호 보호를 해제한 뒤 다시 시도해 주세요.");
        }
        throw new Error("PDF를 열지 못했습니다. 파일이 손상되었거나 지원하지 않는 구조인지 확인해 주세요.");
      }
      const originalPageCount = pdfDocument.getPageCount();
      const compressionLevel = document.querySelector("input[name='compression-level']:checked").value;
      const compressedBytes = await pdfDocument.save({
        useObjectStreams: compressionLevel === "balanced",
        addDefaultPage: false,
        updateFieldAppearances: false
      });

      setStatus("결과 확인 중...", true);
      const outputBytes = new Uint8Array(compressedBytes);
      if (!outputBytes.length || String.fromCharCode(...outputBytes.slice(0, 5)) !== "%PDF-") {
        throw new Error("생성된 PDF 데이터가 비어 있거나 형식이 올바르지 않습니다.");
      }
      const verifiedDocument = await window.PDFLib.PDFDocument.load(outputBytes, { updateMetadata: false });
      if (verifiedDocument.getPageCount() !== originalPageCount) {
        throw new Error("결과 PDF의 페이지 수가 원본과 달라 다운로드를 중단했습니다.");
      }

      compressedBlob = new Blob([outputBytes], { type: "application/pdf" });
      if (compressedBlob.size === 0) throw new Error("PDF 다운로드 파일을 생성하지 못했습니다.");
      downloadFilename = `${selectedFile.name.replace(/\.pdf$/i, "")}-compressed.pdf`;
      const sizeDeltaPercent = ((compressedBlob.size - selectedFile.size) / selectedFile.size) * 100;

      document.querySelector("#original-size").textContent = formatFileSize(selectedFile.size);
      document.querySelector("#compressed-size").textContent = formatFileSize(compressedBlob.size);
      document.querySelector("#saved-percent").textContent = sizeDeltaPercent < 0
        ? `${Math.abs(sizeDeltaPercent).toFixed(1)}%`
        : sizeDeltaPercent > 0 ? "크기 증가" : "변화 없음";
      document.querySelector("#result-note").textContent = sizeDeltaPercent < 0
        ? `실제 파일 크기가 ${Math.abs(sizeDeltaPercent).toFixed(1)}% 줄었습니다. 이미지 자체는 재압축하지 않았습니다.`
        : sizeDeltaPercent > 0
          ? `재저장 결과 원본보다 ${sizeDeltaPercent.toFixed(1)}% 커졌습니다. 이미지 자체는 재압축하지 않았습니다.`
          : "재저장 후 파일 크기에 변화가 없습니다. 이미지 자체는 재압축하지 않았습니다.";
      compressionResult.hidden = false;
      downloadButton.disabled = false;
      setStatus("PDF 처리가 완료되었습니다.");
      compressButton.querySelector("span").textContent = "다시 압축하기";
      triggerDownload();
    } catch (error) {
      console.error("Local PDF processing failed:", error);
      handleCompressionError(error instanceof Error ? error.message : "PDF를 처리하지 못했습니다.");
    } finally {
      isCompressing = false;
      compressButton.disabled = false;
      compressButton.removeAttribute("aria-busy");
      document.querySelector("#remove-file").disabled = false;
      fileInput.disabled = false;
      if (!compressedBlob) compressButton.querySelector("span").textContent = "다시 시도";
    }
  }

  function handleCompressionError(message) {
    compressedBlob = null;
    setStatus(message);
    compressionResult.hidden = true;
    compressButton.disabled = false;
    compressButton.querySelector("span").textContent = "다시 시도";
    document.querySelector("#remove-file").disabled = false;
    fileInput.disabled = false;
    downloadButton.disabled = true;
  }

  function triggerDownload() {
    if (!compressedBlob || compressedBlob.size === 0 || compressedBlob.type !== "application/pdf") {
      setStatus("다운로드할 압축 파일이 없습니다.");
      return;
    }

    try {
      const downloadUrl = URL.createObjectURL(compressedBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(downloadUrl);
      }, 1000);
      setStatus("압축 PDF 다운로드를 시작했습니다.");
    } catch (error) {
      console.error("Local PDF download failed:", error);
      setStatus("다운로드 파일을 준비하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  compressButton.addEventListener("click", startCompression);

  // Download another copy from the received compressed PDF blob
  downloadButton.addEventListener("click", function () {
    triggerDownload();
  });
  }

  function setDropdownOpen(item, isOpen) {
    item.classList.toggle("is-open", isOpen);
    item.querySelector(".nav-trigger")?.setAttribute("aria-expanded", String(isOpen));
  }

  function closeDropdowns(except = null) {
    document.querySelectorAll(".nav-item.is-open").forEach((item) => {
      if (item !== except) setDropdownOpen(item, false);
    });
  }

  function closeMobileNavigation() {
    const navigation = document.querySelector("#primary-navigation");
    const menuToggle = document.querySelector(".menu-toggle");
    navigation?.classList.remove("is-open");
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "메뉴 열기");
      menuToggle.querySelector("use")?.setAttribute("href", "#icon-menu");
    }
    closeDropdowns();
  }

  // Header navigation
  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    const menuToggle = event.target.closest(".menu-toggle");
    if (menuToggle) {
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isExpanded));
      menuToggle.setAttribute("aria-label", isExpanded ? "메뉴 열기" : "메뉴 닫기");
      document.querySelector("#primary-navigation")?.classList.toggle("is-open", !isExpanded);
      menuToggle.querySelector("use")?.setAttribute("href", isExpanded ? "#icon-menu" : "#icon-close");
      if (isExpanded) closeDropdowns();
      return;
    }

    const trigger = event.target.closest(".nav-trigger");
    if (trigger) {
      const item = trigger.closest(".nav-item");
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      closeDropdowns(item);
      const openedByHover = item.dataset.hoverOpen === "true";
      delete item.dataset.hoverOpen;
      setDropdownOpen(item, openedByHover || !isOpen);
      return;
    }

    if (event.target.closest(".nav-entry, .nav-home-link")) {
      closeMobileNavigation();
      return;
    }

    if (!event.target.closest(".main-nav")) {
      closeDropdowns();
      if (!event.target.closest(".menu-toggle")) closeMobileNavigation();
    }
  });

  document.addEventListener("pointerover", function (event) {
    if (!window.matchMedia("(min-width: 768px)").matches || !(event.target instanceof Element)) return;
    const item = event.target.closest(".nav-item");
    if (!item || (event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) return;
    closeDropdowns(item);
    item.dataset.hoverOpen = "true";
    setDropdownOpen(item, true);
  });

  document.addEventListener("pointerout", function (event) {
    if (!window.matchMedia("(min-width: 768px)").matches || !(event.target instanceof Element)) return;
    const item = event.target.closest(".nav-item");
    if (!item || (event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) return;
    delete item.dataset.hoverOpen;
    setDropdownOpen(item, false);
  });

  document.addEventListener("focusout", function (event) {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest(".nav-item");
    if (!item || (event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) return;
    if (!item.matches(":hover")) setDropdownOpen(item, false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    const openItem = document.querySelector(".nav-item.is-open");
    if (openItem) {
      const trigger = openItem.querySelector(".nav-trigger");
      setDropdownOpen(openItem, false);
      trigger?.focus();
      return;
    }
    const navigation = document.querySelector("#primary-navigation");
    if (navigation?.classList.contains("is-open")) {
      closeMobileNavigation();
      document.querySelector(".menu-toggle")?.focus();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowDown" || !(event.target instanceof Element)) return;
    const trigger = event.target.closest(".nav-trigger");
    if (!trigger) return;
    event.preventDefault();
    const item = trigger.closest(".nav-item");
    setDropdownOpen(item, true);
    item.querySelector(".nav-entry")?.focus();
  });
});
