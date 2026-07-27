"use strict";

// The SPA is a trusted, locally-served page. contextIsolation stays ON and the
// renderer gets no Node — but the preload (which shares the DOM) adds the
// native window affordances the browser page can't provide on its own, without
// the SPA needing to know it's running in Electron.

const { ipcRenderer } = require("electron");

function wireTitleBar() {
  // titleBarStyle:"hiddenInset" hides the OS title bar behind the app's own
  // header. Make the header STRIPS behave like a native title bar: drag to move
  // the window, and double-click to zoom (fill the screen). Both the main
  // top bar and the sidebar brand block are draggable so the whole top edge
  // works; interactive controls inside them stay clickable (no-drag).
  if (!document.getElementById("vac-titlebar-style")) {
    const style = document.createElement("style");
    style.id = "vac-titlebar-style";
    style.textContent = `
      .topbar, .rail .brand { -webkit-app-region: drag; }
      .topbar button, .topbar input, .topbar a, .topbar select, .topbar textarea,
      .topbar .search, .topbar .livepill, .topbar .refreshbtn, .topbar .gen,
      .rail .brand a, .rail .brand button { -webkit-app-region: no-drag; }
    `;
    document.head.appendChild(style);
  }

  const isInteractive = (e) => e.target.closest("button, input, a, select, textarea, .search");
  for (const sel of [".topbar", ".rail .brand"]) {
    const node = document.querySelector(sel);
    if (node && !node.dataset.vacZoom) {
      node.dataset.vacZoom = "1";
      node.addEventListener("dblclick", (e) => {
        if (isInteractive(e)) return;
        ipcRenderer.send("win:toggle-zoom");
      });
    }
  }
}

// The header lives in static index.html markup, so it exists at DOMContentLoaded.
// Re-run once more after load in case anything re-mounts the shell.
window.addEventListener("DOMContentLoaded", wireTitleBar);
window.addEventListener("load", wireTitleBar);
