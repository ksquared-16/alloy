#!/usr/bin/env node
/**
 * Worktree-aware Playwright resolution for Phase 3 browser helpers.
 *
 * Node ESM resolves packages from the importing file's ancestry. Helpers live
 * under scripts/local-dev/lib/, so a static `import "@playwright/test"` cannot
 * see <worktree>/web/node_modules. This module anchors createRequire at the
 * managed worktree's web/package.json instead.
 *
 * Never falls back to toolkit ancestry, canonical checkout, sibling worktrees,
 * or a global install.
 */
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const PLAYWRIGHT_PKG = "@playwright/test";

export function webPackageJsonPath(webDir) {
  return path.join(webDir, "package.json");
}

export function remediationForWeb(webDir) {
  return `cd ${webDir} && npm install`;
}

/**
 * Create a require() rooted at <webDir>/package.json.
 * @param {string} webDir absolute path to the worktree web/ directory
 */
export function createWebRequire(webDir) {
  if (!webDir || typeof webDir !== "string") {
    throw new Error("web-dir is required for Playwright resolution");
  }
  const pkgJson = webPackageJsonPath(webDir);
  if (!existsSync(pkgJson)) {
    throw new Error(
      `web/package.json missing at ${pkgJson} — run: ${remediationForWeb(webDir)}`
    );
  }
  return createRequire(pathToFileURL(pkgJson).href);
}

/**
 * Resolve the absolute filesystem path of @playwright/test from webDir.
 * Throws with remediation when missing.
 */
export function resolvePlaywrightFromWeb(webDir) {
  const requireFromWeb = createWebRequire(webDir);
  try {
    return requireFromWeb.resolve(PLAYWRIGHT_PKG);
  } catch {
    throw new Error(
      `Cannot find package '${PLAYWRIGHT_PKG}' under ${webDir}/node_modules — run: ${remediationForWeb(webDir)}`
    );
  }
}

/**
 * Load @playwright/test from the managed worktree's web package context.
 */
export function loadPlaywrightFromWeb(webDir) {
  const requireFromWeb = createWebRequire(webDir);
  try {
    return requireFromWeb(PLAYWRIGHT_PKG);
  } catch (err) {
    if (
      err &&
      (err.code === "ERR_MODULE_NOT_FOUND" ||
        err.code === "MODULE_NOT_FOUND" ||
        /Cannot find module|Cannot find package/.test(String(err.message || "")))
    ) {
      throw new Error(
        `Cannot find package '${PLAYWRIGHT_PKG}' under ${webDir}/node_modules — run: ${remediationForWeb(webDir)}`
      );
    }
    throw err;
  }
}

/** Preflight: package.json + resolvable Playwright under this webDir only. */
export function assertPlaywrightResolvable(webDir) {
  const resolved = resolvePlaywrightFromWeb(webDir);
  // Normalize macOS /tmp → /private/tmp and other symlinks before prefix check.
  let webRoot = path.resolve(webDir);
  let resolvedNorm = path.resolve(resolved);
  try {
    if (existsSync(webDir)) webRoot = realpathSync(webDir);
  } catch {
    /* keep resolved path */
  }
  try {
    if (existsSync(resolved)) resolvedNorm = realpathSync(resolved);
  } catch {
    /* keep resolved path */
  }
  if (resolvedNorm !== webRoot && !resolvedNorm.startsWith(webRoot + path.sep)) {
    throw new Error(
      `Playwright resolved outside worktree web dir (${resolvedNorm}); refusing non-local dependency`
    );
  }
  return resolved;
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAsCli =
  typeof process.argv[1] === "string" && path.resolve(process.argv[1]) === path.resolve(thisFile);

if (invokedAsCli) {
  const { values } = parseArgs({
    options: {
      preflight: { type: "boolean", default: false },
      resolve: { type: "boolean", default: false },
      "web-dir": { type: "string" },
    },
  });
  const webDir = values["web-dir"];
  if (!webDir) {
    console.error("error: --web-dir is required");
    process.exit(2);
  }
  try {
    if (values.preflight || values.resolve) {
      const resolved = assertPlaywrightResolvable(webDir);
      if (values.resolve) {
        process.stdout.write(`${resolved}\n`);
      }
      process.exit(0);
    }
    console.error("error: pass --preflight or --resolve");
    process.exit(2);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
