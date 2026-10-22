const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");
const JSZip = require("jszip");

async function makeImageFile(page, mimeType, name) {
  const bytes = await page.evaluate(async (type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    context.fillStyle = "#397a55";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4b384";
    context.fillRect(9, 7, 23, 16);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.98));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);
  return { name, mimeType, buffer: Buffer.from(bytes) };
}

async function makeOfficeFile(type) {
  const archive = new JSZip();
  archive.file("[Content_Types].xml", "<Types><Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>");
  archive.file("_rels/.rels", "<Relationships/>");
  const path = type === "word" ? "word/document.xml" : "ppt/presentation.xml";
  archive.file(path, `<document>${"Filewise office compression test ".repeat(500)}</document>`);
  const mimeType = type === "word"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const extension = type === "word" ? "docx" : "pptx";
  return {
    name: `sample.${extension}`,
    mimeType,
    buffer: await archive.generateAsync({ type: "nodebuffer", compression: "STORE" })
  };
}

async function downloadCompressed(page, expectedName) {
  await expect(page.locator("#compress-tools-button")).toBeEnabled();
  await page.locator("#compress-tools-button").click();
  await expect(page.locator("#compress-tools-result")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#compress-download")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#compress-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(expectedName);
  const bytes = await readFile(await download.path());
  expect(bytes.length).toBeGreaterThan(0);
  return { download, bytes };
}

test("compression menu entries open their matching active local tools", async ({ page }) => {
  for (const type of ["jpg", "png", "mp4", "word", "ppt"]) {
    await page.goto("/");
    await page.locator('.nav-item:has(.nav-home-link[href="/"]) .nav-trigger').hover();
    const item = page.locator(`#compression-menu a[href="/compress?type=${type}"]`);
    await expect(item).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/compress\\?type=${type}$`));
    await expect(page.locator("#compress-tool-name")).toContainText(type === "ppt" ? "PowerPoint" : type.toUpperCase() === "WORD" ? "Word" : type.toUpperCase());
    await expect(page.locator(`#primary-navigation a[href="/compress?type=${type}"]`)).toHaveAttribute("aria-current", "page");
  }
});

test("homepage compression cards open their matching local tools", async ({ page }) => {
  for (const type of ["jpg", "png", "mp4", "word", "ppt"]) {
    await page.goto("/");
    await page.locator(`#tools a.tool-card[href="/compress?type=${type}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/compress\\?type=${type}$`));
    await expect(page.locator("#compress-tool-name")).toBeVisible();
  }
});

for (const [type, mimeType, extension, signature] of [
  ["jpg", "image/jpeg", "jpg", [0xff, 0xd8, 0xff]],
  ["png", "image/png", "png", [137, 80, 78, 71, 13, 10, 26, 10]]
]) {
  test(`${type.toUpperCase()} compression creates a real image with preserved dimensions`, async ({ page }) => {
    await page.goto(`/compress?type=${type}`);
    const source = await makeImageFile(page, mimeType, `photo.${extension}`);
    await page.locator("#compress-file-input").setInputFiles(source);
    const { download, bytes } = await downloadCompressed(page, `photo-compressed.${extension}`);
    expect(bytes.subarray(0, signature.length)).toEqual(Buffer.from(signature));
    expect(bytes.length).toBeGreaterThan(0);
    const dimensions = await page.evaluate(async (values) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(values)]));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, Array.from(bytes));
    expect(dimensions).toEqual({ width: 48, height: 32 });
    expect(download.suggestedFilename()).toBe(`photo-compressed.${extension}`);
    await expect(page.locator("#compress-original-size")).not.toHaveText("-");
    await expect(page.locator("#compress-output-size")).not.toHaveText("-");
  });
}

for (const type of ["word", "ppt"]) {
  test(`${type.toUpperCase()} compression preserves a valid Office package`, async ({ page }) => {
    await page.goto(`/compress?type=${type}`);
    const source = await makeOfficeFile(type);
    await page.locator("#compress-file-input").setInputFiles(source);
    const extension = type === "word" ? "docx" : "pptx";
    const { bytes } = await downloadCompressed(page, `sample-compressed.${extension}`);
    const output = await JSZip.loadAsync(bytes, { checkCRC32: true });
    expect(output.files["[Content_Types].xml"]).toBeTruthy();
    const documentPath = type === "word" ? "word/document.xml" : "ppt/presentation.xml";
    expect(await output.file(documentPath).async("string")).toContain("Filewise office compression test");
    await expect(page.locator("#compress-size-change")).not.toHaveText("-");
  });
}

test("MP4 compression produces a nonempty playable MP4 locally", async ({ page }) => {
  await page.goto("/compress?type=mp4");
  const sourceBytes = await page.evaluate(async () => {
    if (!window.FFmpegWASM?.FFmpeg) throw new Error("FFmpeg browser bundle is missing");
    const ffmpeg = new window.FFmpegWASM.FFmpeg();
    await ffmpeg.load({
      coreURL: "/vendor/ffmpeg/ffmpeg-core.js",
      wasmURL: "/vendor/ffmpeg/ffmpeg-core.wasm"
    });
    const exitCode = await ffmpeg.exec([
      "-f", "lavfi", "-i", "color=c=red:s=32x32:r=10:d=1",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "fixture.mp4"
    ]);
    if (exitCode !== 0) throw new Error("Could not create local MP4 test fixture");
    const bytes = Array.from(await ffmpeg.readFile("fixture.mp4"));
    ffmpeg.terminate();
    return bytes;
  });
  await page.locator("#compress-file-input").setInputFiles({ name: "sample.mp4", mimeType: "video/mp4", buffer: Buffer.from(sourceBytes) });
  const { bytes } = await downloadCompressed(page, "sample-compressed.mp4");
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
  await expect(page.locator("#compress-size-change")).not.toHaveText("-");
});

test("compression tools reject mismatched and empty files without downloads", async ({ page }) => {
  await page.goto("/compress?type=jpg");
  await page.locator("#compress-file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.locator("#compress-status")).toContainText("JPG 파일");
  await expect(page.locator("#compress-tools-button")).toBeDisabled();
  await expect(page.locator("#compress-download")).toBeDisabled();

  await page.goto("/compress?type=word");
  await page.locator("#compress-file-input").setInputFiles({ name: "empty.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.alloc(0) });
  await expect(page.locator("#compress-status")).toContainText("빈 파일");
  await expect(page.locator("#compress-download")).toBeDisabled();
});
