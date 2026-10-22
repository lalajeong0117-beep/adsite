const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");
const { PDFDocument, rgb } = require("pdf-lib");
const JSZip = require("jszip");

async function makeImageFile(page, mimeType, name) {
  const bytes = await page.evaluate(async (type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 18;
    const context = canvas.getContext("2d");
    context.fillStyle = "#397a55";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);
  return { name, mimeType, buffer: Buffer.from(bytes) };
}

async function makePdfFile(pageSpecs, name) {
  const document = await PDFDocument.create();
  pageSpecs.forEach(([width, height], index) => {
    const page = document.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width: 8, height: 8, color: rgb(index / (pageSpecs.length + 1), 0.3, 0.6) });
  });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await document.save()) };
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 바이트";
  const units = ["바이트", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, unit)).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function uploadFiles(page, files) {
  await page.locator("#pdf-file-input").setInputFiles(files);
}

async function downloadPdf(page, buttonSelector = "#pdf-download-all") {
  const downloadPromise = page.waitForEvent("download");
  await page.locator(buttonSelector).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.toString("ascii", 0, 5)).toBe("%PDF-");
  const document = await PDFDocument.load(bytes);
  return { download, bytes, document };
}

async function downloadZip(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#pdf-download-zip").click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
  return { download, archive: await JSZip.loadAsync(bytes) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/convert");
  await page.getByRole("tab", { name: "PDF 도구" }).click();
});

test("compresses a PDF locally without jQuery or external API requests", async ({ page }) => {
  const requests = [];
  const pageErrors = [];
  page.on("request", (request) => requests.push(request));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  expect(await page.evaluate(() => typeof window.jQuery)).toBe("undefined");
  await expect(page.locator('input[name="compression-level"][value="smallest"]')).toBeDisabled();
  await page.locator("#compress-button").click();
  await expect(page.locator("#upload-message")).toContainText("먼저 선택");

  const source = await makePdfFile([[180, 120], [160, 100]], "보고서 final.pdf");
  await page.locator("#file-input").setInputFiles(source);
  await expect(page.locator("#file-name")).toHaveText(source.name);
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => {
    const prototype = window.PDFLib.PDFDocument.prototype;
    const originalSave = prototype.save;
    window.__pdfSaveCount = 0;
    prototype.save = async function (...args) {
      window.__pdfSaveCount += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      return originalSave.apply(this, args);
    };
    const button = document.querySelector("#compress-button");
    button.click();
    button.click();
  });

  const download = await downloadPromise;
  expect(await page.evaluate(() => window.__pdfSaveCount)).toBe(1);
  expect(download.suggestedFilename()).toBe("보고서 final-compressed.pdf");
  const bytes = await readFile(await download.path());
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.toString("ascii", 0, 5)).toBe("%PDF-");
  const verified = await PDFDocument.load(bytes);
  const sourceDocument = await PDFDocument.load(source.buffer);
  expect(verified.getPageCount()).toBe(sourceDocument.getPageCount());
  expect(verified.getPages().map((pdfPage) => [pdfPage.getWidth(), pdfPage.getHeight()]))
    .toEqual(sourceDocument.getPages().map((pdfPage) => [pdfPage.getWidth(), pdfPage.getHeight()]));
  const renderedPages = await page.evaluate(async ({ sourceBytes, outputBytes }) => {
    const pdfjs = await import("/vendor/pdfjs/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/legacy/build/pdf.worker.min.mjs";
    async function renderPages(bytes) {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      const pdfDocument = await loadingTask.promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        pages.push({
          width: canvas.width,
          height: canvas.height,
          pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data)
        });
      }
      await loadingTask.destroy();
      return pages;
    }
    return [await renderPages(sourceBytes), await renderPages(outputBytes)];
  }, { sourceBytes: Array.from(source.buffer), outputBytes: Array.from(bytes) });
  expect(renderedPages[1]).toEqual(renderedPages[0]);
  await expect(page.locator("#original-size")).toHaveText(formatFileSize(source.buffer.length));
  await expect(page.locator("#compressed-size")).toHaveText(formatFileSize(bytes.length));
  const delta = ((bytes.length - source.buffer.length) / source.buffer.length) * 100;
  await expect(page.locator("#saved-percent")).toHaveText(delta < 0 ? `${Math.abs(delta).toFixed(1)}%` : delta > 0 ? "크기 증가" : "변화 없음");
  await expect(page.locator("#download-button")).toBeEnabled();

  const secondDownloadPromise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const secondDownload = await secondDownloadPromise;
  expect(secondDownload.suggestedFilename()).toBe(download.suggestedFilename());
  expect(await readFile(await secondDownload.path())).toEqual(bytes);
  expect(pageErrors).toEqual([]);

  const pageOrigin = new URL(page.url()).origin;
  const externalApiRequests = requests.filter((request) => {
    return ["fetch", "xhr"].includes(request.resourceType()) && new URL(request.url()).origin !== pageOrigin;
  });
  expect(externalApiRequests).toEqual([]);
});

test("accepts a PDF dropped into the compressor", async ({ page }) => {
  await page.goto("/");
  const source = await makePdfFile([[120, 90]], "dropped.pdf");
  await page.evaluate(({ name, bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
    document.querySelector("#upload-zone").dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer
    }));
  }, { name: source.name, bytes: Array.from(source.buffer) });
  await expect(page.locator("#file-name")).toHaveText("dropped.pdf");
  await expect(page.locator("#compress-button")).toBeEnabled();
});

test("rejects non-PDF and damaged PDF inputs without enabling download", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a PDF") });
  await expect(page.locator("#upload-message")).toContainText("PDF 파일만");
  await expect(page.locator("#download-button")).toBeDisabled();

  await page.locator("#file-input").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-broken") });
  await page.locator("#compress-button").click();
  await expect(page.locator("#upload-message")).toContainText("손상되었거나 지원하지 않는 구조");
  await expect(page.locator("#compression-result")).toBeHidden();
  await expect(page.locator("#download-button")).toBeDisabled();
});

test("reports a missing local PDF library", async ({ page }) => {
  await page.route("**/vendor/pdf-lib.min.js", (route) => route.abort());
  await page.goto("/");
  await page.locator("#file-input").setInputFiles(await makePdfFile([[100, 80]], "missing-library.pdf"));
  await page.locator("#compress-button").click();
  await expect(page.locator("#upload-message")).toContainText("라이브러리를 불러오지 못했습니다");
  await expect(page.locator("#download-button")).toBeDisabled();
});

test("opens the requested PDF converter mode from a menu destination", async ({ page }) => {
  await page.goto("/convert?tool=pdf&mode=pdf-to-image&format=image/png");
  await expect(page.locator("#pdf-tab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pdf-convert-panel")).toBeVisible();
  await expect(page.locator('.pdf-mode[data-pdf-mode="pdf-to-image"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pdf-image-format")).toHaveValue("image/png");
});

for (const [mimeType, extension] of [["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]) {
  test(`${extension.toUpperCase()} creates a valid PDF`, async ({ page }) => {
    const source = await makeImageFile(page, mimeType, `photo.${extension}`);
    await uploadFiles(page, source);
    await expect(page.locator("#pdf-run-button")).toBeEnabled();
    await expect(page.locator("#pdf-download-all")).toBeDisabled();
    await page.locator("#pdf-run-button").click();
    await expect(page.locator("#pdf-status")).toContainText("완료되었습니다");
    await expect(page.locator("#pdf-download-all")).toBeEnabled();

    const { download, document } = await downloadPdf(page);
    expect(download.suggestedFilename()).toBe(`photo.pdf`);
    expect(document.getPageCount()).toBe(1);
  });
}

test("combines multiple images into one ordered PDF", async ({ page }) => {
  const sources = [
    await makeImageFile(page, "image/jpeg", "first.jpg"),
    await makeImageFile(page, "image/png", "second.png"),
    await makeImageFile(page, "image/webp", "third.webp")
  ];
  await uploadFiles(page, sources);
  await page.locator("#pdf-run-button").click();
  const { document } = await downloadPdf(page);
  expect(document.getPageCount()).toBe(3);
});

test("creates individual image PDFs and downloads them as a ZIP", async ({ page }) => {
  const sources = [
    await makeImageFile(page, "image/jpeg", "first.jpg"),
    await makeImageFile(page, "image/png", "second.png")
  ];
  await uploadFiles(page, sources);
  await page.locator('input[name="image-pdf-mode"][value="individual"]').check();
  await page.locator("#pdf-run-button").click();
  await expect(page.locator("#pdf-download-zip")).toBeEnabled();
  const { archive } = await downloadZip(page);
  expect(Object.keys(archive.files).sort()).toEqual(["first.pdf", "second.pdf"]);
  for (const entry of Object.values(archive.files)) {
    expect((await PDFDocument.load(await entry.async("nodebuffer"))).getPageCount()).toBe(1);
  }
});

for (const [mimeType, extension, signature] of [
  ["image/jpeg", "jpg", [0xff, 0xd8, 0xff]],
  ["image/png", "png", [137, 80, 78, 71, 13, 10, 26, 10]]
]) {
  test(`PDF pages render to ${extension.toUpperCase()} images and a ZIP`, async ({ page }) => {
    const source = await makePdfFile([[180, 120], [160, 100], [140, 90]], "render.pdf");
    await page.getByRole("tab", { name: "PDF → 이미지" }).click();
    await uploadFiles(page, source);
    await expect(page.locator("#pdf-file-list")).toContainText("3페이지");
    await page.locator("#pdf-page-range").fill("2-3");
    await page.locator("#pdf-image-format").selectOption(mimeType);
    await page.locator("#pdf-render-scale").selectOption("1");
    await page.locator("#pdf-run-button").click();
    await expect(page.locator("#pdf-status")).toContainText("완료되었습니다", { timeout: 15000 });
    await expect(page.locator("#pdf-download-zip")).toBeEnabled();

    const { download, archive } = await downloadZip(page);
    expect(download.suggestedFilename()).toBe("render-images.zip");
    expect(Object.keys(archive.files).sort()).toEqual(["render-page-002." + extension, "render-page-003." + extension]);
    for (const entry of Object.values(archive.files)) {
      const bytes = await entry.async("nodebuffer");
      expect(Array.from(bytes.subarray(0, signature.length))).toEqual(signature);
      const dimensions = await page.evaluate(async ({ values, type }) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(values)], { type }));
        const result = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
      }, { values: Array.from(await entry.async("uint8array")), type: mimeType });
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
    }
  });
}

test("merges multiple PDFs and verifies the resulting page count", async ({ page }) => {
  await page.getByRole("tab", { name: "PDF 병합" }).click();
  await uploadFiles(page, [await makePdfFile([[120, 90]], "first.pdf"), await makePdfFile([[130, 90], [140, 90]], "second.pdf")]);
  await page.locator("#pdf-run-button").click();
  await expect(page.locator("#pdf-status")).toContainText("완료되었습니다");
  const { document } = await downloadPdf(page);
  expect(document.getPageCount()).toBe(3);
});

test("splits a PDF into valid single-page PDFs in a ZIP", async ({ page }) => {
  await page.getByRole("tab", { name: "페이지 편집" }).click();
  await uploadFiles(page, await makePdfFile([[120, 90], [140, 90], [160, 90]], "split.pdf"));
  await expect(page.locator("#pdf-page-list .pdf-page-card")).toHaveCount(3);
  await page.locator("#pdf-edit-operation").selectOption("split");
  await expect(page.locator("#pdf-run-button")).toBeEnabled();
  await page.locator("#pdf-run-button").click();
  await expect(page.locator("#pdf-status")).toContainText("완료되었습니다");
  const { archive } = await downloadZip(page);
  const entries = Object.values(archive.files);
  expect(entries).toHaveLength(3);
  for (const entry of entries) {
    const document = await PDFDocument.load(await entry.async("nodebuffer"));
    expect(document.getPageCount()).toBe(1);
  }
});

test("deletes selected pages without removing the whole document", async ({ page }) => {
  await page.getByRole("tab", { name: "페이지 편집" }).click();
  await uploadFiles(page, await makePdfFile([[120, 90], [140, 90], [160, 90]], "delete.pdf"));
  await page.locator("#pdf-edit-operation").selectOption("delete");
  await page.locator("#pdf-edit-range").fill("2");
  await page.locator("#pdf-run-button").click();
  const { document } = await downloadPdf(page);
  expect(document.getPageCount()).toBe(2);
});

test("extracts the selected pages into a valid PDF", async ({ page }) => {
  await page.getByRole("tab", { name: "페이지 편집" }).click();
  await uploadFiles(page, await makePdfFile([[100, 80], [130, 90], [160, 110]], "extract.pdf"));
  await expect(page.locator("#pdf-page-list .pdf-page-card")).toHaveCount(3);
  await page.locator("#pdf-edit-operation").selectOption("extract");
  await page.locator("#pdf-edit-range").fill("1, 3");
  await page.locator("#pdf-run-button").click();
  const { document } = await downloadPdf(page);
  expect(document.getPages().map((pdfPage) => Math.round(pdfPage.getWidth()))).toEqual([100, 160]);
});

test("dragging page cards changes output PDF order", async ({ page }) => {
  await page.getByRole("tab", { name: "페이지 편집" }).click();
  await uploadFiles(page, await makePdfFile([[100, 80], [130, 90], [160, 110]], "reorder.pdf"));
  const cards = page.locator("#pdf-page-list .pdf-page-card");
  await expect(cards).toHaveCount(3);
  await cards.nth(0).dragTo(cards.nth(2));
  const pageOrder = await cards.evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.pageNumber)));
  await page.locator("#pdf-run-button").click();
  const { document } = await downloadPdf(page);
  const outputWidths = document.getPages().map((pdfPage) => Math.round(pdfPage.getWidth()));
  expect(outputWidths).toEqual(pageOrder.map((pageNumber) => [100, 130, 160][pageNumber - 1]));
});

test("rotates only the selected page", async ({ page }) => {
  await page.getByRole("tab", { name: "페이지 편집" }).click();
  await uploadFiles(page, await makePdfFile([[120, 90], [140, 90], [160, 90]], "rotate.pdf"));
  await page.locator("#pdf-edit-operation").selectOption("rotate");
  await page.locator("#pdf-edit-range").fill("2");
  await page.locator("#pdf-rotation").selectOption("90");
  await page.locator("#pdf-run-button").click();
  const { document } = await downloadPdf(page);
  expect(document.getPages().map((pdfPage) => pdfPage.getRotation().angle)).toEqual([0, 90, 0]);
});

test("rejects a damaged PDF and keeps downloads disabled", async ({ page }) => {
  await page.getByRole("tab", { name: "PDF → 이미지" }).click();
  await uploadFiles(page, { name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nnot a valid document") });
  await expect(page.locator("#pdf-status")).toContainText("손상되어 열 수 없습니다");
  await expect(page.locator("#pdf-download-all")).toBeDisabled();
  await expect(page.locator("#pdf-download-zip")).toBeDisabled();
});

test("PDF tools remain within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "PDF 도구" }).click();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await expect(page.getByRole("tab", { name: "PDF → 이미지" })).toBeVisible();
});