"use strict";
// Render assets/icon.svg → assets/icon-1024.png WITH TRANSPARENCY preserved.
// qlmanage flattens transparent SVG areas to white (white corners on the Dock
// icon); Electron with a transparent window keeps real alpha. Offscreen, no
// visible window. Run: electron render-icon.js
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "assets", "icon.svg"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:1024px;height:1024px}
  </style></head><body>${svg}</body></html>`;
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false,
    transparent: true, backgroundColor: "#00000000",
    webPreferences: { offscreen: false },
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, "assets", "icon-1024.png"), img.toPNG());
  process.stdout.write("wrote assets/icon-1024.png\n");
  app.quit();
});
