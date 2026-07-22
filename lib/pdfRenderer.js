// ===============================
// lib/pdfRenderer.js — HTML -> PNG / HTML -> PDF via a shared headless
// Chromium instance (Puppeteer). Using ONE HTML source of truth
// (lib/worksheetTemplate.js) for both outputs guarantees the chat preview
// image and the downloadable PDF look identical.
//
// Requires the "puppeteer" package (bundles its own Chromium — see
// package.json). On Render: give the service at least 512MB RAM, and if
// you deploy via Docker make sure the base image has the shared libs
// Chromium needs (libnss3, libatk-bridge2.0-0, libgtk-3-0, libasound2,
// fonts, etc.) — see https://pptr.dev/troubleshooting for the exact list.
//
// Nothing here writes to Render's own disk — Chromium's internal temp
// profile dir is its own implementation detail (cleaned up automatically),
// not something this bot manages or relies on.
// ===============================
const puppeteer = require("puppeteer");

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

async function withPage(html, fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for the Khmer web font to actually finish loading before we
    // screenshot/print — otherwise the first render can show fallback
    // tofu boxes instead of proper Khmer glyphs.
    await page.evaluate(() => document.fonts.ready);
    return await fn(page);
  } finally {
    await page.close();
  }
}

// Renders just the FIRST ".page" section as a PNG — used for the quick
// chat preview so we don't send one giant multi-page image.
async function renderFirstPageImage(html) {
  return withPage(html, async (page) => {
    const el = await page.$(".page");
    if (!el) return page.screenshot({ type: "png", fullPage: true });
    return el.screenshot({ type: "png" });
  });
}

// Renders the FULL multi-page document as a single PDF (each ".page"
// section becomes its own PDF page via CSS page-break-after).
async function renderPdf(html) {
  return withPage(html, (page) =>
    page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    })
  );
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

module.exports = { renderFirstPageImage, renderPdf, closeBrowser };
