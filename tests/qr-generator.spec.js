const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");

async function loadQrDecoder(page) {
  const source = await readFile(require.resolve("jsqr"), "utf8");
  await page.addScriptTag({ content: source });
}

async function decodePreview(page) {
  return page.evaluate(() => {
    const image = document.querySelector("#qr-preview");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data || null;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/qr-tools/");
  await expect(page.locator("#site-header .site-header")).toBeVisible();
  await expect(page.locator("#site-footer .site-footer")).toBeVisible();
});

const filewiseQrCases = [
  ["url", "#qr-url", "https://example.com/filewise", "https://example.com/filewise"],
  ["text", "#qr-text", "Filewise QR 한글 테스트", "Filewise QR 한글 테스트"],
  ["email", "#qr-email", "hello@example.com", "mailto:hello@example.com?subject=Filewise&body=Hello%20there"],
  ["phone", "#qr-phone", "+82 (10) 1234-5678", "tel:+821012345678"],
  ["sms", "#qr-sms-phone", "+1 555 123 4567", "sms:+15551234567?body=Meet%20me"]
];

for (const [type, selector, input] of filewiseQrCases) {
  test(`Filewise ${type} QR encodes a scannable payload`, async ({ page }) => {
    await page.goto(`/qr.html?type=${type}`);
    await loadQrDecoder(page);
    await expect(page.locator(`.qr-type[data-qr-type="${type}"]`)).toHaveAttribute("aria-selected", "true");
    await page.locator(selector).fill(input);
    if (type === "email") {
      await page.locator("#qr-email-subject").fill("Filewise");
      await page.locator("#qr-email-body").fill("Hello there");
    }
    if (type === "sms") await page.locator("#qr-sms-message").fill("Meet me");
    await expect(page.locator("#qr-preview")).toBeVisible();
    const expectedPayload = filewiseQrCases.find(([caseType]) => caseType === type)[3];
    await expect.poll(() => decodePreview(page)).toBe(expectedPayload);
  });
}

test("Filewise Wi-Fi QR escapes special characters in the standard payload", async ({ page }) => {
  await page.goto("/qr.html?type=wifi");
  await loadQrDecoder(page);
  await page.locator("#qr-ssid").fill("Studio;Guest");
  await page.locator("#qr-wifi-password").fill('p;ass\\word,"x"');
  await page.locator("#qr-hidden").check();
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect.poll(() => decodePreview(page)).toBe('WIFI:T:WPA;S:Studio\\;Guest;P:p\\;ass\\\\word\\,\\"x\\";H:true;;');
});

test("Filewise QR downloads a scannable PNG and a valid vector SVG", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request));
  await page.goto("/qr.html?type=url");
  await loadQrDecoder(page);
  await page.locator("#qr-url").fill("https://example.com/download");
  await expect(page.locator("#qr-preview")).toBeVisible();

  const pngPromise = page.waitForEvent("download");
  await page.locator("#qr-download-png").click();
  const pngDownload = await pngPromise;
  expect(pngDownload.suggestedFilename()).toBe("filewise-qr-url.png");
  const pngBytes = await readFile(await pngDownload.path());
  expect(pngBytes.length).toBeGreaterThan(100);
  expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const scannedPng = await page.evaluate(async (bytes) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    return jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data || null;
  }, Array.from(pngBytes));
  expect(scannedPng).toBe("https://example.com/download");

  const svgPromise = page.waitForEvent("download");
  await page.locator("#qr-download-svg").click();
  const svgDownload = await svgPromise;
  expect(svgDownload.suggestedFilename()).toBe("filewise-qr-url.svg");
  const svg = await readFile(await svgDownload.path(), "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("<path");
  const svgIsValid = await page.evaluate((markup) => {
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    return parsed.documentElement.localName === "svg" && !parsed.querySelector("parsererror") && parsed.querySelector("path[d]");
  }, svg);
  expect(svgIsValid).toBeTruthy();
  const origin = new URL(page.url()).origin;
  expect(requests.filter((request) => ["fetch", "xhr"].includes(request.resourceType()) && new URL(request.url()).origin !== origin)).toEqual([]);
});

test("Filewise QR size, error correction and colors apply to the generated files", async ({ page }) => {
  await page.goto("/qr.html?type=url");
  await loadQrDecoder(page);
  await page.locator("#qr-url").fill("https://example.com/options");
  await page.locator("#qr-size").selectOption("1024");
  await page.locator("#qr-error-level").selectOption("Q");
  await page.locator("#qr-foreground").evaluate((input) => {
    input.value = "#1747c7";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect(page.locator("#qr-preview-meta")).toContainText("1,024 × 1,024 px");
  await expect(page.locator("#qr-preview-meta")).toContainText("오류 정정 Q");
  await expect.poll(() => decodePreview(page)).toBe("https://example.com/options");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#qr-download-svg").click();
  const download = await downloadPromise;
  const svg = await readFile(await download.path(), "utf8");
  expect(svg).toContain('width="1024"');
  expect(svg).toContain("#1747C7");
});

test("Filewise QR input errors keep generated downloads disabled", async ({ page }) => {
  await page.goto("/qr.html?type=url");
  await page.locator("#qr-url").fill("not a url");
  await expect(page.locator("#qr-status")).toContainText("올바른 웹 주소");
  await expect(page.locator("#qr-preview")).toBeHidden();
  await expect(page.locator("#qr-download-png")).toBeDisabled();

  await page.goto("/qr.html?type=wifi");
  await page.locator("#qr-ssid").fill("Guest Network");
  await page.locator("#qr-security").selectOption("nopass");
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect(page.locator("#qr-wifi-password")).toBeHidden();
});

test("QR menu selects each supported type and top-level links switch services", async ({ page }) => {
  for (const type of ["url", "text", "wifi", "email", "phone", "sms"]) {
    await page.goto(`/qr.html?type=${type}#generator`);
    await expect(page.locator(`.qr-type[data-qr-type="${type}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`[data-qr-form="${type}"]`)).toBeVisible();
  }

  await page.goto("/");
  await page.getByRole("link", { name: "QR 코드 생성 페이지" }).click();
  await expect(page).toHaveURL(/\/qr\.html$/);
  await expect(page.locator('#primary-navigation a[href="/qr.html"]')).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "파일 압축 페이지" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator('#primary-navigation a[href="/"]')).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "파일 변환 페이지" }).click();
  await expect(page).toHaveURL(/\/convert$/);
  await expect(page.locator('#primary-navigation a[href="/convert"]')).toHaveAttribute("aria-current", "page");
  await page.locator("#site-header .logo").click();
  await expect(page).toHaveURL(/\/#top$/);
});

test("creates a scannable URL QR and downloads matching PNG", async ({ page }) => {
  await loadQrDecoder(page);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const value = "https://example.com/qr?source=dotcode";
  await page.locator("#url-input").fill(value);
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect.poll(() => decodePreview(page)).toBe(value);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("dotcode-qr.png");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const dimensions = await page.evaluate(async (input) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(input)], { type: "image/png" }));
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, Array.from(bytes));
  expect(dimensions).toEqual({ width: 512, height: 512 });
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test("encodes Korean UTF-8 text and downloads a real vector SVG", async ({ page }) => {
  await loadQrDecoder(page);
  const value = "한글 QR 테스트 · café · 你好";
  await page.getByRole("tab", { name: "일반 텍스트" }).click();
  await page.locator("#text-input").fill(value);
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect.poll(() => decodePreview(page)).toBe(value);
  await expect(page.locator("#text-count")).toContainText("B");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-svg").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("dotcode-qr.svg");
  const svg = await readFile(await download.path(), "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("<path");
  expect(svg).toContain('width="512"');
  expect(svg).toContain('height="512"');
  expect(svg).not.toContain("data:image/");
});

test("live customization changes PNG pixels and SVG colors", async ({ page }) => {
  await loadQrDecoder(page);
  await page.locator("#url-input").fill("https://example.com/custom");
  await page.locator("#qr-size").selectOption("1024");
  await page.locator("#qr-error-level").selectOption("Q");
  await page.locator("#qr-foreground-hex").fill("#1747C7");
  await page.locator("#qr-foreground-hex").press("Tab");
  await expect(page.locator("#qr-preview")).toBeVisible();
  await expect(page.locator("#preview-meta")).toContainText("1,024 × 1,024 px");
  await expect(page.locator("#preview-meta")).toContainText("오류 정정 Q");
  await expect.poll(() => decodePreview(page)).toBe("https://example.com/custom");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-svg").click();
  const download = await downloadPromise;
  const svg = await readFile(await download.path(), "utf8");
  expect(svg).toContain("#1747C7");
  expect(svg).toContain('width="1024"');
});

test("invalid URLs and empty input never enable downloads", async ({ page }) => {
  await expect(page.locator("#download-png")).toBeDisabled();
  await page.locator("#url-input").fill("not a url");
  await expect(page.locator("#qr-status")).toContainText("올바른 웹 주소");
  await expect(page.locator("#qr-preview")).toBeHidden();
  await expect(page.locator("#download-png")).toBeDisabled();
  await page.locator("#reset-button").click();
  await expect(page.locator("#qr-preview")).toBeHidden();
  await expect(page.locator("#download-svg")).toBeDisabled();
});

test("shared header and footer are reused on the guide page", async ({ page }) => {
  await page.goto("/qr-tools/guides.html");
  await expect(page).toHaveTitle("QR 코드 인쇄 가이드 | Dotcode");
  await expect(page.locator("#site-header .site-header")).toBeVisible();
  await expect(page.locator("#site-footer .site-footer")).toBeVisible();
  await expect(page.locator('#primary-navigation [data-nav="guide"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#site-footer")).toContainText("© 2026 Dotcode");
});

test("file tools link to the QR site from both shared layouts", async ({ page }) => {
  for (const route of ["/", "/convert"]) {
    await page.goto(route);
    const compressionLink = page.locator('#primary-navigation a[href="/"]');
    const conversionLink = page.locator('#primary-navigation a[href="/convert"]');
    const headerLink = page.locator('#primary-navigation a[href="/qr.html"]');
    const footerLink = page.locator('#site-footer a[href="/qr.html"]');
    await expect(compressionLink).toHaveText("파일 압축");
    await expect(conversionLink).toHaveText("파일 변환");
    await expect(headerLink).toHaveText("QR 코드 생성");
    await expect(footerLink).toHaveText("QR 코드 생성기");
    await expect(page.locator('.nav-item:has(.nav-home-link[href="/convert"]) .nav-trigger')).toBeVisible();
    await expect(page.locator(".login-link, .signup-link")).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const compressionMenu = page.locator('.nav-item:has(.nav-home-link[href="/"]) .nav-trigger');
  const conversionMenu = page.locator('.nav-item:has(.nav-home-link[href="/convert"]) .nav-trigger');
  await compressionMenu.hover();
  await expect(compressionMenu).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#compression-menu")).toBeVisible();
  await page.locator("#compression-menu .nav-entry").first().hover();
  await expect(compressionMenu).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#compression-menu")).toBeVisible();
  await compressionMenu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#compression-menu .nav-entry").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(compressionMenu).toBeFocused();
  await conversionMenu.click();
  await expect(page.locator("#compression-menu")).toBeHidden();
  await expect(conversionMenu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#conversion-menu")).toBeHidden();
  await expect(conversionMenu).toHaveAttribute("aria-expanded", "false");
  await conversionMenu.click();
  await page.locator("#hero-title").click();
  await expect(page.locator("#conversion-menu")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".menu-toggle").click();
  await expect(page.locator("#primary-navigation")).toHaveClass(/is-open/);
  await page.locator('.nav-item:has(.nav-home-link[href="/convert"]) .nav-trigger').click();
  const mobileWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(mobileWidths.page).toBeLessThanOrEqual(mobileWidths.viewport);
  const mobileImageLink = page.locator('#primary-navigation a[href^="/convert?format=image/png"]');
  await expect(mobileImageLink).toBeVisible();
  await mobileImageLink.click();
  await expect(page).toHaveURL(/\/convert\?format=image\/png$/);
  await expect(page.locator("#image-convert-panel")).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  const animation = await page.locator(".converter-main-panel").evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration, delay: style.animationDelay };
  });
  expect(animation.name).toBe("enter-up");
  expect(animation.duration).toBe("0.7s");
  expect(animation.delay).toBe("0.18s");
  await expect(page.locator(".login-link, .signup-link")).toHaveCount(0);
});

test("QR navigation opens the selected URL or text generator", async ({ page }) => {
  await page.goto("/qr.html?type=text#generator");
  await expect(page.locator('.qr-type[data-qr-type="text"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-qr-form="text"]')).toBeVisible();
});

for (const width of [1920, 1440, 768, 390, 360]) {
  test(`QR page fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/qr.html");
    await expect(page.locator("#generator")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test("mobile navigation opens and closes from the shared header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator(".menu-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#primary-navigation")).toHaveClass(/is-open/);
  await page.goto("/qr.html");
  await toggle.click();
  await page.locator('.nav-item:has(.nav-home-link[href="/qr.html"]) .nav-trigger').click();
  await page.locator('#primary-navigation a[href="/qr.html?type=wifi#generator"]').click();
  await expect(page).toHaveURL(/\/qr\.html\?type=wifi#generator$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('.qr-type[data-qr-type="wifi"]')).toHaveAttribute("aria-selected", "true");
});