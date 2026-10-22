const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const JSZip = require("jszip");

async function makeImageFile(page, mimeType, name) {
  const bytes = await page.evaluate(async (type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 6;
    const context = canvas.getContext("2d");
    context.fillStyle = "#38794c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);

  return { name, mimeType, buffer: Buffer.from(bytes) };
}

function hasExpectedSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

async function convertAndDownload(page, source, outputMimeType) {
  await page.locator("#convert-file-input").setInputFiles(source);
  await expect(page.locator("#convert-file-list")).toContainText(source.name.replace(/\.[^.]+$/, ""));
  await page.locator("#output-format").selectOption(outputMimeType);
  await expect(page.locator("#download-results")).toBeDisabled();
  await page.locator("#convert-button").click();
  await expect(page.locator("#convert-status")).toContainText("형식과 열기를 확인했습니다");
  await expect(page.locator("#download-results")).toBeEnabled();

  const filename = source.name.replace(/\.[^.]+$/, "") + {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  }[outputMimeType];
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-results").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(filename);

  const downloadedBytes = await readFile(await download.path());
  expect(hasExpectedSignature(downloadedBytes, outputMimeType)).toBe(true);
  const decoded = await page.evaluate(async ({ bytes, type }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type }));
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, { bytes: Array.from(downloadedBytes), type: outputMimeType });
  expect(decoded.width).toBe(8);
  expect(decoded.height).toBe(6);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/convert");
});

test("uses the output format selected by a Filewise menu link", async ({ page }) => {
  await page.goto("/convert?format=image/png");
  const source = await makeImageFile(page, "image/jpeg", "menu-source.jpg");
  await page.locator("#convert-file-input").setInputFiles(source);
  await expect(page.locator("#output-format")).toHaveValue("image/png");
});

test("Filewise conversion page fits desktop, tablet and mobile widths", async ({ page }) => {
  await page.goto("/convert");
  await expect(page.locator("#convert-title")).toContainText("파일 형식을");
  await expect(page.locator("#popular-conversions")).toBeVisible();
  for (const width of [1920, 1440, 1024, 768, 767, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

for (const [sourceType, sourceExt, outputType, outputExt] of [
  ["image/jpeg", "jpg", "image/png", "png"],
  ["image/jpeg", "jpg", "image/webp", "webp"],
  ["image/png", "png", "image/jpeg", "jpg"],
  ["image/png", "png", "image/webp", "webp"],
  ["image/webp", "webp", "image/jpeg", "jpg"],
  ["image/webp", "webp", "image/png", "png"]
]) {
  test(`${sourceExt.toUpperCase()} to ${outputExt.toUpperCase()} creates a valid downloadable image`, async ({ page }) => {
    const source = await makeImageFile(page, sourceType, `source.${sourceExt}`);
    await convertAndDownload(page, source, outputType);
  });
}

test("detects image format from bytes and only shows supported output formats", async ({ page }) => {
  const png = await makeImageFile(page, "image/png", "misnamed.jpg");
  await page.locator("#convert-file-input").setInputFiles({ ...png, mimeType: "application/octet-stream" });

  await expect(page.locator("#convert-file-list")).toContainText("PNG ·");
  const options = await page.locator("#output-format option").evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(options).toContain("image/jpeg");
  expect(options).toContain("image/webp");

  const avifSupported = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/avif"));
    return Boolean(blob && blob.type === "image/avif");
  });
  expect(options.includes("image/avif")).toBe(avifSupported);
});

test("downloads multiple converted files as a valid ZIP archive", async ({ page }) => {
  const sources = [
    await makeImageFile(page, "image/png", "first.png"),
    await makeImageFile(page, "image/webp", "second.webp")
  ];
  await page.locator("#convert-file-input").setInputFiles(sources);
  await expect(page.locator("#output-format")).toHaveValue("image/jpeg");
  await page.locator("#convert-button").click();
  await expect(page.locator("#convert-status")).toContainText("형식과 열기를 확인했습니다");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-results").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("converted-images.zip");
  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  expect(Object.keys(archive.files).sort()).toEqual(["first.jpg", "second.jpg"]);
  for (const entry of Object.values(archive.files)) {
    const bytes = await entry.async("nodebuffer");
    expect(hasExpectedSignature(bytes, "image/jpeg")).toBe(true);
  }
});

test("detects invalid HEIC input and leaves downloads disabled", async ({ page }) => {
  const invalidHeic = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0]);
  await page.locator("#convert-file-input").setInputFiles({
    name: "misnamed.jpg",
    mimeType: "application/octet-stream",
    buffer: invalidHeic
  });
  await expect(page.locator("#convert-file-list")).toContainText("HEIC ·");
  await expect(page.locator("#output-format option")).toHaveCount(2);
  await page.locator("#output-format").selectOption("image/jpeg");
  await page.locator("#convert-button").click();
  await expect(page.locator("#convert-status")).toContainText("현재 디코더가 지원하지 않는");
  await expect(page.locator("#convert-result")).toBeHidden();
  await expect(page.locator("#download-results")).toBeDisabled();
});

test("converts a valid local HEIC fixture to JPG and PNG", async ({ page }) => {
  const buffer = await readFile(path.join(__dirname, "fixtures", "clap_cropped.heic"));
  await page.goto("/convert");
  await page.locator("#convert-file-input").setInputFiles({ name: "sample.heic", mimeType: "image/heic", buffer });
  await expect(page.locator("#convert-file-list")).toContainText("HEIC ·");

  for (const [mimeType, extension, signature] of [
    ["image/jpeg", "jpg", Buffer.from([0xff, 0xd8, 0xff])],
    ["image/png", "png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]
  ]) {
    const options = await page.locator("#output-format option").evaluateAll((nodes) => nodes.map((node) => node.value));
    expect(options).toContain(mimeType);
    await page.locator("#output-format").selectOption(mimeType);
    await page.locator("#convert-button").click();
    await expect(page.locator("#convert-status")).toContainText("형식과 열기를 확인했습니다", { timeout: 15000 });
    await expect(page.locator("#download-results")).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-results").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`sample.${extension}`);
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, signature.length)).toEqual(signature);
    const dimensions = await page.evaluate(async ({ values, type }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(values)], { type }));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, { values: Array.from(bytes), type: mimeType });
    expect(dimensions).toEqual({ width: 64, height: 64 });
  }
});