import puppeteer, { type Browser } from "puppeteer";

// launching Chromium is expensive (roughly a second) - reused across conversions rather than
// spun up fresh per request. Lazily created on first use, same pattern as gridfs.ts's bucket.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true });
  }
  return browserPromise;
}

// Converts uploaded HTML to a paginated PDF using Chromium's own print engine, so CSS page
// breaks (`break-before`/`break-after`/`@page`) and `printBackground`-relevant styling are
// honored exactly as a real browser's print preview would (US-1.4) - no bespoke pagination
// logic needed on our side.
export async function convertHtmlToPdf(html: Buffer): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // JavaScript execution is deliberately disabled: this HTML is untrusted user upload, and
    // running it in a real browser engine with the server's own network access would let a
    // malicious document make outbound requests or otherwise act with server-side privileges
    // (arbitrary script execution is the highest-severity risk here; page-load network
    // requests for referenced images/fonts are still permitted, since blocking those too
    // would break plenty of legitimate documents for a comparatively low-severity SSRF risk
    // that server-side link-preview/thumbnail features commonly accept as well).
    await page.setJavaScriptEnabled(false);
    // "load" (not "networkidle0", which setContent's types don't even accept) - waits for the
    // page's own resources (images, stylesheets) to finish loading before printing.
    await page.setContent(html.toString("utf-8"), { waitUntil: "load", timeout: 30000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // honors a document's own `@page { size: ... }` CSS instead of forcing A4 regardless.
      preferCSSPageSize: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      timeout: 30000,
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeHtmlToPdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}
