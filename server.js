/* server.js */

const path = require("node:path");
const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/vendor", express.static(path.join(__dirname, "node_modules", "pdf-lib", "dist")));
app.use("/vendor/tesseract", express.static(path.join(__dirname, "node_modules", "tesseract.js", "dist")));
app.use("/vendor/ffmpeg", express.static(path.join(__dirname, "node_modules", "@ffmpeg", "ffmpeg", "dist", "umd")));
app.use("/vendor/ffmpeg", express.static(path.join(__dirname, "node_modules", "@ffmpeg", "core", "dist", "umd")));
app.use("/vendor/heic2any", express.static(path.join(__dirname, "node_modules", "heic2any", "dist")));
app.use("/vendor/jszip", express.static(path.join(__dirname, "node_modules", "jszip", "dist")));
app.use("/vendor/jsbarcode", express.static(path.join(__dirname, "node_modules", "jsbarcode", "dist")));
app.use("/vendor/pdfjs", express.static(path.join(__dirname, "node_modules", "pdfjs-dist")));
app.use("/vendor/qrcode-generator", express.static(path.join(__dirname, "node_modules", "qrcode-generator", "dist")));
app.use("/components", express.static(path.join(__dirname, "components")));
app.use("/qr-tools", express.static(path.join(__dirname, "qr-tools")));

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get(["/index.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get(["/convert", "/convert.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "convert.html"));
});

app.get(["/compress", "/compress.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "compress.html"));
});

app.get("/qr.html", (request, response) => {
  response.sendFile(path.join(__dirname, "qr.html"));
});

app.get(["/barcode", "/barcode.html"], (request, response) => {
    response.sendFile(path.join(__dirname, "barcode.html"));
});

app.get(["/ocr", "/ocr.html"], (request, response) => {
    response.sendFile(path.join(__dirname, "ocr.html"));
});

// Serve the Image Color Picker page
app.get(["/color", "/color.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "color.html"));
});

// Serve the Electronic Signature Maker page
app.get(["/signature", "/signature.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "signature.html"));
});

// Serve the Character & Byte Counter page
app.get(["/counter", "/counter.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "counter.html"));
});

// Serve the Image Resizer page
app.get(["/resize", "/resize.html"], (request, response) => {
  response.sendFile(path.join(__dirname, "resize.html"));
});

// Serve favicon
app.get("/favicon.svg", (request, response) => {
  response.sendFile(path.join(__dirname, "favicon.svg"));
});

// Serve robots.txt and sitemap.xml
app.get("/robots.txt", (request, response) => {
  response.type("text/plain");
  response.sendFile(path.join(__dirname, "robots.txt"));
});

app.get("/sitemap.xml", (request, response) => {
  response.type("application/xml");
  response.sendFile(path.join(__dirname, "sitemap.xml"));
});




app.listen(port, () => {
  console.log(`Filewise is running at http://localhost:${port}`);
  console.log("PDF files are processed locally in the browser; no API key is required.");
});
