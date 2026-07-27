"use strict";

// The SPA is a trusted, locally-served page — it needs nothing from Node. This
// preload exists only to keep contextIsolation on with an explicit, empty
// bridge, so the renderer stays sandboxed from the main process.
