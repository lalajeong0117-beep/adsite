const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");

test.beforeEach(async ({ page }) => {
  await page.goto("/barcode.html");
  await expect(page.locator("#site-header .header")).toBeVisible();
  await expect(page.locator("#site-footer .footer")).toBeVisible();
});

test("renders real examples for all supported barcode formats", async ({ page }) => {
  await expect(page).toHaveTitle("무료 바코드 생성기 | CODE128, EAN13, UPC 바코드 만들기 - Filewise");
  for (const format of ["CODE128", "EAN13", "UPC", "CODE39", "ITF14"]) {
    const sample = page.locator(`[data-barcode-example="${format}"]`);
    await expect(sample.locator("rect").first()).toBeAttached();
  }

  const cases = [
    ["CODE128", "FW-24018"],
    ["EAN13", "400638133393"],
    ["UPC", "03600029145"],
    ["CODE39", "FILEWISE-39"],
    ["ITF14", "1001234500001"]
  ];
  for (const [format, value] of cases) {
    await page.locator("#barcode-format").selectOption(format);
    await page.locator("#barcode-data").fill(value);
    await expect(page.locator("#barcode-preview path").first()).toBeAttached();
    await expect(page.locator("#barcode-download-png")).toBeEnabled();
  }
  await expect(page.locator("#barcode-print-value")).toContainText("10012345000017");
});

test("calculates and validates retail check digits without stale previews", async ({ page }) => {
  await page.locator("#barcode-format").selectOption("EAN13");
  await page.locator("#barcode-data").fill("400638133393");
  await expect(page.locator("#barcode-print-value")).toContainText("4006381333931");
  await page.locator("#barcode-data").fill("4006381333932");
  await expect(page.locator("#barcode-status")).toContainText("체크디지트가 올바르지 않습니다");
  await expect(page.locator("#barcode-preview")).toBeHidden();
  await expect(page.locator("#barcode-download-svg")).toBeDisabled();

  const checksumCases = [["UPC", "03600029145", "036000291452"], ["ITF14", "1001234500001", "10012345000017"]];
  for (const [format, input, expected] of checksumCases) {
    await page.locator("#barcode-format").selectOption(format);
    await page.locator("#barcode-data").fill(input);
    await expect(page.locator("#barcode-print-value")).toContainText(expected);
  }
});

test("invalid characters and lengths clear generated output", async ({ page }) => {
  await page.locator("#barcode-format").selectOption("CODE39");
  await page.locator("#barcode-data").fill("lowercase");
  await expect(page.locator("#barcode-status")).toContainText("CODE 39는");
  await expect(page.locator("#barcode-preview")).toBeHidden();
  await expect(page.locator("#barcode-print")).toBeDisabled();

  await page.locator("#barcode-format").selectOption("EAN13");
  await page.locator("#barcode-data").fill("123");
  await expect(page.locator("#barcode-status")).toContainText("12자리 입력");
  await expect(page.locator("#barcode-download-png")).toBeDisabled();
});

test("downloads a real PNG and a valid SVG", async ({ page }) => {
  await page.locator("#barcode-format").selectOption("EAN13");
  await page.locator("#barcode-data").fill("400638133393");

  const pngPromise = page.waitForEvent("download");
  await page.locator("#barcode-download-png").click();
  const pngDownload = await pngPromise;
  expect(pngDownload.suggestedFilename()).toBe("barcode-ean13.png");
  const pngBytes = await readFile(await pngDownload.path());
  expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const pngDimensions = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }, Array.from(pngBytes));
  expect(pngDimensions.width).toBeGreaterThan(100);
  expect(pngDimensions.height).toBeGreaterThan(100);

  const svgPromise = page.waitForEvent("download");
  await page.locator("#barcode-download-svg").click();
  const svgDownload = await svgPromise;
  expect(svgDownload.suggestedFilename()).toBe("barcode-ean13.svg");
  const svg = await readFile(await svgDownload.path(), "utf8");
  const isValidSvg = await page.evaluate((markup) => {
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    return parsed.documentElement.localName === "svg" && !parsed.querySelector("parsererror") && parsed.querySelector("rect[width]");
  }, svg);
  expect(isValidSvg).toBeTruthy();
});

test("updates design settings, prints only the barcode, and fits mobile", async ({ page }) => {
  await page.locator("#barcode-data").fill("STYLE-128");
  await page.locator("#barcode-width").fill("3");
  await page.locator("#barcode-line-color").evaluate((input) => {
    input.value = "#174d43";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#barcode-preview path").first()).toHaveAttribute("fill", "#174d43");
  await expect(page.locator("#barcode-width-output")).toHaveValue("3");

  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printCalled = "true"; }; });
  await page.locator("#barcode-print").click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.locator(".menu-toggle").click();
  await expect(page.locator("#primary-navigation")).toHaveClass(/is-open/);
  await expect(page.getByRole("link", { name: "바코드 생성 페이지" })).toBeVisible();
});

test("shared navigation reaches barcode and keeps all existing service links", async ({ page }) => {
  await expect(page.locator('#primary-navigation a[href="barcode.html"]')).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "파일 압축 페이지" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "파일 변환 페이지" }).click();
  await expect(page).toHaveURL(/\/convert$/);
  await page.getByRole("link", { name: "QR 코드 생성 페이지" }).click();
  await expect(page).toHaveURL(/\/qr\.html$/);
  await page.getByRole("link", { name: "바코드 생성 페이지" }).click();
  await expect(page).toHaveURL(/\/barcode\.html$/);
  await expect(page.locator('#primary-navigation a[href="barcode.html"]')).toHaveAttribute("aria-current", "page");
});