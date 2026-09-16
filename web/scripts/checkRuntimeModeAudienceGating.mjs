#!/usr/bin/env node
/**
 * Runtime mode is not audience.
 *
 * `process.env.NODE_ENV` says which build is running. It does not say who is looking. Alloy's
 * certification and Human-QA hosts run development servers ON PURPOSE, and real operators view them
 * over the tailnet — so "not production" is true on exactly the machines where operators are invited
 * to look. Every rendered surface gated only that way is operator-visible precisely where it must
 * not be.
 *
 * Two instances reached an operator before this guard existed. The sign-in page printed an internal
 * loopback address under words describing where sign-in posts, and an operator on a remote browser
 * reasonably read it as an instruction. Processing offered a "Reset test data" button that deletes
 * the fixture a Human-QA walkthrough is walking. Both were single-gated on NODE_ENV; both were added
 * inside commits about something else; neither was caught by review, by typecheck, or by any of the
 * three prebuild gates that already existed.
 *
 * WHAT THIS REFUSES, precisely: a JSX expression whose visibility depends on NODE_ENV and on nothing
 * else. That is the audience decision. It is not interested in NODE_ENV appearing in logging, in
 * server-only behaviour, in a safety refusal, in a test, or under `app/dev/**`, which already 404s
 * in production and is the sanctioned home for developer surfaces.
 *
 * WHY AN AST AND NOT A GREP. The distinction this guard exists to make — rendered audience gating
 * versus a console.info — is structural. A regex can see `process.env.NODE_ENV` and cannot see
 * whether JSX hangs off it, which is the only thing that matters. The three sibling guards are
 * text-shaped because their questions are; this one is not.
 *
 * THE ESCAPE IS A SECOND GATE, NOT AN ALLOWLIST. `NODE_ENV === "development" &&
 * NEXT_PUBLIC_<AREA>_DEBUG === "1"` passes, because the flag is the part a person had to set
 * deliberately. There is no per-file exemption list on purpose: an allowlist would have accepted
 * both defects this guard was written for.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["app", "components"];
/** Already a developer surface: it refuses to exist in production. */
const EXCLUDED_PREFIXES = ["app/dev/"];
const EXCLUDED_FILE = /\.(test|spec)\.(ts|tsx)$/;

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.tsx$/.test(entry) && !EXCLUDED_FILE.test(entry)) out.push(full);
    }
    return out;
}

const referencesNodeEnv = (node) =>
    /process\s*\.\s*env\s*\.\s*NODE_ENV/.test(node.getText());

/**
 * A second, deliberate signal in the same condition.
 *
 * Any other `process.env.*` read alongside NODE_ENV means somebody had to set something for this to
 * appear. That is the whole difference between "the build happens to be dev" and "a developer asked".
 */
const hasExplicitOptIn = (node) => {
    const text = node.getText().replace(/process\s*\.\s*env\s*\.\s*NODE_ENV/g, "");
    return /process\s*\.\s*env\s*\./.test(text);
};

/** Does this expression put JSX on screen? */
function rendersJsx(node) {
    let found = false;
    const visit = (n) => {
        if (found) return;
        if (
            ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)
        ) {
            found = true;
            return;
        }
        ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
}

function scanFile(file) {
    const rel = relative(WEB, file).replaceAll("\\", "/");
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) return [];
    const text = readFileSync(file, "utf8");
    if (!text.includes("NODE_ENV")) return [];

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const violations = [];

    /** `const showX = process.env.NODE_ENV !== "production"` — the gate hidden behind a name. */
    const singleGatedNames = new Set();
    const collect = (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
            if (referencesNodeEnv(node.initializer) && !hasExplicitOptIn(node.initializer)) {
                singleGatedNames.add(node.name.text);
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(source);

    const conditionIsSingleGated = (condition) => {
        const text = condition.getText();
        if (referencesNodeEnv(condition)) return !hasExplicitOptIn(condition);
        // A named gate counts, but only if nothing else narrows it in this condition.
        for (const name of singleGatedNames) {
            if (new RegExp(`\\b${name}\\b`).test(text)) {
                return !/process\s*\.\s*env\s*\./.test(text) && !/&&/.test(text);
            }
        }
        return false;
    };

    const report = (node, condition) => {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
            file: rel,
            line: line + 1,
            condition: condition.getText().replace(/\s+/g, " ").slice(0, 120),
        });
    };

    const visit = (node) => {
        // `{cond ? <X/> : null}` and `{cond && <X/>}` inside JSX, and the same shapes returned.
        if (ts.isConditionalExpression(node)) {
            if (conditionIsSingleGated(node.condition)
                && (rendersJsx(node.whenTrue) || rendersJsx(node.whenFalse))) {
                report(node, node.condition);
            }
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            if (conditionIsSingleGated(node.left) && rendersJsx(node.right)) {
                report(node, node.left);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return violations;
}

const specimenPath = process.argv.includes("--specimen")
    ? process.argv[process.argv.indexOf("--specimen") + 1]
    : null;

if (specimenPath) {
    // Used by the regression specimens: scan one file and report machine-readably.
    const found = scanFile(resolve(specimenPath));
    process.stdout.write(`${JSON.stringify({ violations: found }, null, 2)}\n`);
    process.exit(0);
}

const files = ROOTS.flatMap((r) => walk(join(WEB, r)));
const violations = files.flatMap(scanFile);

process.stdout.write(`Runtime-mode audience gating — ${files.length} rendered files scanned\n\n`);

if (violations.length === 0) {
    /*
     * ZERO IS THE INVARIANT, not a ceiling. The post-repair census found no legitimate single-gated
     * rendered case anywhere in the tree, so there is nothing to ratchet down from — and a ceiling
     * above zero would quietly re-admit exactly the two defects this was written for.
     */
    process.stdout.write("✓ no rendered operator surface is gated on NODE_ENV alone.\n");
    process.exit(0);
}

process.stdout.write(`✗ ${violations.length} rendered surface(s) gated on NODE_ENV alone:\n`);
for (const v of violations) {
    process.stdout.write(`    ${v.file}:${v.line} — ${v.condition}\n`);
}
process.stdout.write(
    "\n  Runtime mode is not audience. A certification or Human-QA host runs a development\n"
    + "  server while real operators look at it, so NODE_ENV alone shows developer UI to them.\n"
    + "  Add an explicit opt-in — NODE_ENV === \"development\" && NEXT_PUBLIC_<AREA>_DEBUG === \"1\" —\n"
    + "  or move the surface under app/dev/, which refuses to exist in production.\n",
);
process.exit(1);
