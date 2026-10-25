const { chromium } = require(process.argv[2]);
const lum = (rgb) => { const [r,g,b] = rgb.match(/\d+/g).slice(0,3).map(Number).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; }); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio = (a,b) => { const [h,l] = [lum(a),lum(b)].sort((x,y)=>y-x); return ((h+0.05)/(l+0.05)).toFixed(2); };
(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("file:///tmp/s4browser/page.html");
    for (const key of ["platform", "pale", "purple"]) {
      const r = await page.evaluate((key) => {
        const sec = document.querySelector(`[data-brand="${key}"]`);
        const btn = [...sec.querySelectorAll("button")].find((b) => b.textContent.trim() === "Submit");
        const back = [...sec.querySelectorAll("button")].find((b) => b.textContent.trim() === "Back");
        const ink = sec.querySelector("[data-ink]");
        const cs = getComputedStyle(btn);
        btn.focus();
        return { bg: cs.backgroundColor, fg: cs.color, width: btn.getBoundingClientRect().width, row: btn.parentElement.getBoundingClientRect().width,
                 backWidth: back.getBoundingClientRect().width, ink: getComputedStyle(ink).color };
      }, key);
      out.push({ width, key, ...r, contrast: ratio(r.bg, r.fg), inkContrast: ratio(r.ink, "rgb(255, 255, 255)") });
    }
    await page.screenshot({ path: `/tmp/s4browser/footer-${width}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
