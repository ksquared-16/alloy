"use strict";

// The SPA is a trusted, locally-served page. contextIsolation stays ON and the
// renderer gets no Node — but the preload (which shares the DOM) adds the
// native window affordances the browser page can't provide on its own, without
// the SPA needing to know it's running in Electron.

const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  // titleBarStyle:"hiddenInset" hides the OS title bar behind the app's own
  // `.topbar`. Make that header behave like a native title bar: drag to move,
  // and double-click to zoom (fill the screen) — the macOS title-bar gesture.
  const style = document.createElement("style");
  style.textContent = `
    .topbar { -webkit-app-region: drag; }
    .topbar button, .topbar input, .topbar a, .topbar select,
    .topbar textarea, .topbar .search, .topbar .livepill { -webkit-app-region: no-drag; }
  `;
  document.head.appendChild(style);

  const bar = document.querySelector(".topbar");
  if (bar) {
    bar.addEventListener("dblclick", (e) => {
      // Don't hijack double-clicks on interactive controls in the bar.
      if (e.target.closest("button, input, a, select, textarea, .search")) return;
      ipcRenderer.send("win:toggle-zoom");
    });
  }
});
