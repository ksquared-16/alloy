/**
 * Motion-token audit — enforces the Operational Motion Doctrine's hard rule #1:
 * "No raw timing in components. Every duration and easing references a token."
 *
 * Doctrine: docs/platform/experience/operational-motion-doctrine.md
 * Tokens:   web/lib/motion/motionTokens.ts + the `:root` block in web/app/globals.css
 *
 * A `transition` that hardcodes a duration (`120ms`, `0.18s`) or an easing
 * (`ease`, `ease-out`, `cubic-bezier(...)`) instead of `var(--motion-*)` is a
 * violation. `animation` declarations (ambient loops are a separate, exempt class),
 * `@keyframes`, and `transition: none` are ignored.
 *
 * Migration is incremental. STRICT surfaces are fully migrated — the audit fails (exit 1)
 * if a raw timing reappears. INVENTORY surfaces are partially migrated — their remaining
 * raw timings are reported as a non-blocking count so the residual stays visible. As an
 * INVENTORY file reaches zero, promote it into STRICT.
 *
 * Run:  npm run audit:motion   (from web/)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Fully migrated operator surfaces — zero raw transition timings tolerated. */
export const STRICT_CSS = ["app/adminV2/adminV2.css"];
/** Component trees that must never introduce a raw `\d+ms` / `cubic-bezier` in markup. */
export const STRICT_COMPONENT_DIRS = ["components/presentation"];
/** Partially migrated — remaining raw timings reported, not enforced (yet). */
export const INVENTORY_CSS = [
    "app/adminV2/components/workspace/workspace.css",
    "app/adminV2/components/alloyOsRuntime.css",
];

const RAW_DURATION = /\d+(?:\.\d+)?\s*m?s\b/;
const RAW_EASING = /\b(?:ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier)\b/;

/** Strip `/* … *​/` block comments so commented-out timings never register. */
function stripBlockComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Find raw (untokenized) timings inside `transition` declarations of a CSS string.
 * Returns `{ line, declaration }` for each violation.
 */
export function findRawTransitionTimings(css) {
    const clean = stripBlockComments(css);
    const violations = [];
    // Match `transition:` or `transition-duration:`/`transition-timing-function:` up to `;`.
    const re = /transition(?:-duration|-timing-function)?\s*:\s*([^;{}]+);/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const value = m[1];
        const trimmed = value.trim();
        if (/^(none|inherit|initial|unset|revert)$/i.test(trimmed)) continue;
        // Remove tokenized references; a fully-migrated declaration has nothing left but
        // property names, commas, and whitespace.
        const residual = value.replace(/var\(\s*--motion-[a-z-]+\s*(?:,[^)]*)?\)/g, " ");
        if (RAW_DURATION.test(residual) || RAW_EASING.test(residual)) {
            const line = clean.slice(0, m.index).split("\n").length;
            violations.push({ line, declaration: trimmed.replace(/\s+/g, " ") });
        }
    }
    return violations;
}

/** Raw `\d+ms` / `cubic-bezier` literals inside a component's markup (className/style). */
export function findRawComponentTimings(src) {
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, " ");
    const violations = [];
    const re = /(\d+ms\b|cubic-bezier\s*\()/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const line = clean.slice(0, m.index).split("\n").length;
        violations.push({ line, declaration: m[1] });
    }
    return violations;
}

function walkTsx(dirAbs, out) {
    for (const entry of readdirSync(dirAbs)) {
        const abs = join(dirAbs, entry);
        const st = statSync(abs);
        if (st.isDirectory()) walkTsx(abs, out);
        else if (/\.tsx?$/.test(entry)) out.push(abs);
    }
    return out;
}

/** Run the audit. Returns `{ strict, inventory }` violation maps keyed by repo-relative path. */
export function runAudit() {
    const strict = {};
    const inventory = {};

    for (const rel of STRICT_CSS) {
        const v = findRawTransitionTimings(readFileSync(join(WEB_ROOT, rel), "utf8"));
        if (v.length) strict[rel] = v;
    }
    for (const dir of STRICT_COMPONENT_DIRS) {
        for (const abs of walkTsx(join(WEB_ROOT, dir), [])) {
            const v = findRawComponentTimings(readFileSync(abs, "utf8"));
            if (v.length) strict[relative(WEB_ROOT, abs)] = v;
        }
    }
    for (const rel of INVENTORY_CSS) {
        const v = findRawTransitionTimings(readFileSync(join(WEB_ROOT, rel), "utf8"));
        if (v.length) inventory[rel] = v;
    }
    return { strict, inventory };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { strict, inventory } = runAudit();
    const strictCount = Object.values(strict).reduce((n, v) => n + v.length, 0);
    const invCount = Object.values(inventory).reduce((n, v) => n + v.length, 0);

    if (invCount) {
        console.log(`\nℹ  Motion-token residual (inventory — not enforced, ${invCount} raw timings):`);
        for (const [file, v] of Object.entries(inventory)) {
            console.log(`   ${file}: ${v.length}`);
        }
    }
    if (strictCount) {
        console.error(`\n✖ Motion-token audit FAILED — ${strictCount} raw timing(s) on migrated surfaces:`);
        for (const [file, v] of Object.entries(strict)) {
            for (const { line, declaration } of v) {
                console.error(`   ${file}:${line}  ${declaration}`);
            }
        }
        console.error("\n  Replace raw durations/easings with var(--motion-*). See operational-motion-doctrine.md.\n");
        process.exit(1);
    }
    console.log(`\n✓ Motion-token audit passed — migrated surfaces are token-only.${invCount ? ` (${invCount} residual tracked)` : ""}\n`);
}
