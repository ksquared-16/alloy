/**
 * R11 — shared harness environment.
 *
 * Every R11 script measures a PRODUCTION build of the branch under test, so the three ways a runtime
 * measurement silently lies are closed here once rather than per script:
 *   - measuring a stale `.next-prodcert` while believing it is the candidate;
 *   - leaking subject identifiers into durable output;
 *   - leaving a browser or request context alive when a probe throws.
 *
 * Env (PE3 convention): PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE, plus R11_OUT_DIR.
 * Local hosts only — these harnesses never point at a hosted environment.
 */
import fs from "fs";
import { createHash } from "crypto";
import { homedir } from "os";
import { join } from "path";

export const SLOT = process.env.PE3_SLOT ?? "2";
export const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
export const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
export const STORAGE =
    process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);
export const OUT_DIR = process.env.R11_OUT_DIR ?? join(process.cwd(), ".r11-out");

/** Refuse to measure anything but a local host. */
export function assertLocalBase() {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(BASE)) {
        throw new Error(`refusing to measure a non-local base: ${BASE}`);
    }
}

/**
 * Refuse to measure a `.next-prodcert` older than the sources it claims to contain. A killed
 * `next start` can leave its child holding the port, so the replacement fails and the OLD server
 * answers — the reading looks plausible and describes the wrong build.
 */
export function assertCandidateBuild() {
    const dist = join(process.cwd(), ".next-prodcert");
    let builtAt;
    try {
        builtAt = fs.statSync(join(dist, "BUILD_ID")).mtimeMs;
    } catch {
        throw new Error(`no production build at ${dist} — run scripts/pe3ProdBuild.sh first`);
    }
    let newest = 0;
    let newestPath = "";
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const p = join(dir, entry.name);
            if (entry.isDirectory()) { walk(p); continue; }
            if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
            const m = fs.statSync(p).mtimeMs;
            if (m > newest) { newest = m; newestPath = p; }
        }
    };
    for (const root of ["lib", "app", "components", "contexts"]) {
        try { walk(join(process.cwd(), root)); } catch { /* absent root */ }
    }
    if (newest > builtAt) {
        throw new Error(
            `STALE BUILD: ${newestPath.replace(process.cwd() + "/", "")} is newer than .next-prodcert — rebuild before measuring`,
        );
    }
    console.log(`build: .next-prodcert BUILD_ID ${fs.readFileSync(join(dist, "BUILD_ID"), "utf8").trim()}`);
}

/**
 * Stable pseudonym for a subject id. Durable evidence must be comparable across runs without
 * carrying tenant identifiers, so the same subject maps to the same label without being recoverable.
 */
export function redactSubject(id) {
    return `subject_${createHash("sha256").update(String(id)).digest("hex").slice(0, 8)}`;
}

/** Write durable output with every subject identifier replaced by its pseudonym. */
export function writeEvidence(name, value) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const json = JSON.stringify(value, null, 2).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (m) => redactSubject(m),
    );
    const path = join(OUT_DIR, name);
    fs.writeFileSync(path, json);
    console.log(`-> ${path.replace(process.cwd() + "/", "")}`);
    return path;
}

/** Read the subject list produced by r11Discover.mjs. */
export function readSubjects(file = "subjects.json") {
    const path = join(OUT_DIR, file);
    if (!fs.existsSync(path)) {
        throw new Error(`no subject list at ${path.replace(process.cwd() + "/", "")} — run scripts/r11Discover.mjs first`);
    }
    return JSON.parse(fs.readFileSync(path, "utf8"));
}

/** Run `fn` with a resource, disposing it even when the probe throws. */
export async function withResource(open, close, fn) {
    const res = await open();
    try {
        return await fn(res);
    } finally {
        await close(res).catch(() => { /* cleanup must not mask the real failure */ });
    }
}
