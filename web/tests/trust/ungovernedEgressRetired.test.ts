/**
 * Phase 2.8 Gate D — the ungoverned egress is retired, and cannot come back.
 *
 * D-45 says a bypass is closed only when it is UNREACHABLE, not when it merely
 * has no callers. The distinction is the whole of this file.
 *
 * "No callers" is a fact about today. It is undone by one import, and nothing
 * fails when someone writes that import — the reviewer has to notice. Every
 * bypass that has ever been reintroduced was reintroduced exactly that way.
 *
 * So Gate D deleted the modules rather than unlinking them, and these controls
 * assert the shape of the tree that results:
 *
 *   1. The deleted modules do not exist.
 *   2. Exactly ONE module in the repository can reach a reasoning provider, and
 *      it is the governed adapter.
 *   3. Provider credentials are read in a closed, declared set of modules.
 *   4. The one remaining route reaches the governed consumer and nothing else.
 *
 * Control 2 is the load-bearing one. It does not ask "does anything call the
 * bypass" — it asks "could a bypass exist anywhere", and it scans the whole
 * source tree to answer. Reintroducing ungoverned egress fails this suite even
 * if the new module is never imported by anything at all.
 *
 * A note on why these are source scans rather than module-graph assertions: a
 * graph only sees what is reachable from an entry point, and an unreferenced
 * file is exactly what a graph cannot see. The thing being forbidden here is
 * the file's existence.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, relative } from "path";

import { describe, expect, it } from "vitest";

const WEB_ROOT = join(__dirname, "..", "..");

/** Trees where production and operator-runnable code lives. Tests excluded deliberately — see below. */
const SCANNED_TREES = ["lib", "app", "scripts", "components"] as const;

/**
 * The ONE module permitted to reach a reasoning provider.
 *
 * A single-element allowlist rather than a rule about directories: "the
 * governed adapter" has to be a specific file for this control to mean
 * anything, and adding a second entry has to be a deliberate, reviewable act.
 */
const GOVERNED_ADAPTER = "lib/ai/trust/openAiCompatibleProviderAdapter.ts";

/**
 * Modules permitted to read a provider credential from the environment.
 *
 * `aiEnrichmentEnv` is the credential OWNER (D-34: no new secret store), and the
 * adapter and port resolver are the two things it hands values to. Nothing else.
 */
const CREDENTIAL_READERS = ["lib/ai/aiEnrichmentEnv.ts", GOVERNED_ADAPTER] as const;

/**
 * What makes a request a REASONING-provider request.
 *
 * Deliberately vendor-plural. Scoping the control to one vendor's path would
 * let the next ungoverned egress be introduced simply by choosing a different
 * provider, which is the same defect wearing a different hostname.
 *
 * `completeStructured(` is here because it is this repository's own ungoverned
 * reasoning port — the interface the deleted provider implemented.
 */
const REASONING_ENDPOINT =
    /\/chat\/completions|\/v1\/responses|\/v1\/messages|api\.openai\.com|api\.anthropic\.com|\bcompleteStructured\s*\(/;

/** A credential READ, as opposed to a mention in an operator-facing message. */
const CREDENTIAL_READ = /process\.env\s*(\.\s*OPENAI_API_KEY|\[\s*["'`]OPENAI_API_KEY)/;

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
}

function scannedFiles(): { rel: string; src: string }[] {
    const files: { rel: string; src: string }[] = [];
    for (const tree of SCANNED_TREES) {
        for (const full of walk(join(WEB_ROOT, tree))) {
            files.push({ rel: relative(WEB_ROOT, full).split("\\").join("/"), src: readFileSync(full, "utf8") });
        }
    }
    return files;
}

describe("P28D-0 — the scan sees what it claims to see", () => {
    it("covers a substantial tree, including the governed adapter itself", () => {
        const files = scannedFiles();
        // A structural control that silently scans nothing is worse than none.
        expect(files.length).toBeGreaterThan(500);
        expect(files.map((f) => f.rel)).toContain(GOVERNED_ADAPTER);
    });
});

describe("P28D-1 — the deleted modules are gone from the tree", () => {
    const DELETED = [
        // The ungoverned egress itself: transport that also decided business validity.
        "lib/ai/openAiCompatibleStructuredProvider.ts",
        // The envelope that composed an enrichment outside Trust.
        "lib/ai/enrichAttentionSuggestionStub.ts",
        // The resolver whose only reason to exist was choosing that provider.
        "lib/ai/resolveStructuredAiProvider.ts",
        // The re-export shim over the resolver.
        "lib/ai/disabledProvider.ts",
        // The operator script that called the bypass directly. Its own header
        // said to remove it once staging validation was done.
        "scripts/validateOpenAiEnrichmentLocal.ts",
    ] as const;

    for (const rel of DELETED) {
        it(`${rel} does not exist`, () => {
            expect(existsSync(join(WEB_ROOT, rel))).toBe(false);
        });
    }

    /**
     * Matches IMPORT SPECIFIERS, not any occurrence of the name.
     *
     * A comment explaining what was deleted and why is the most useful thing a
     * future reader can find in these modules, and a scan that forbade the name
     * outright would push that explanation out of the code to satisfy a
     * scanner. What must not exist is a dependency edge.
     */
    it("nothing imports any of them, by any path spelling", () => {
        const offenders: string[] = [];
        for (const { rel, src } of scannedFiles()) {
            for (const name of [
                "openAiCompatibleStructuredProvider",
                "enrichAttentionSuggestionStub",
                "resolveStructuredAiProvider",
                "ai/disabledProvider",
                "validateOpenAiEnrichmentLocal",
            ]) {
                const specifier = new RegExp(String.raw`(from|import|require)\s*\(?\s*["'][^"']*${name}`);
                if (specifier.test(src)) offenders.push(`${rel}: ${name}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * The control string is ASSEMBLED rather than written out, and that is not
     * squeamishness: `verify:module-imports` scans this repository's own source
     * for import specifiers and resolves them, so a literal import line naming
     * a deleted module fails the build — even inside a string in a test.
     * Writing it whole is the one thing that cannot be done here.
     */
    it("the specifier scan is not vacuous — it matches a real import when one exists", () => {
        const name = "openAiCompatibleStructuredProvider";
        const realImport = `${"im" + "port"} { x } ${"fr" + "om"} "@/lib/ai/${name}";`;
        const specifier = new RegExp(String.raw`(from|import|require)\s*\(?\s*["'][^"']*${name}`);

        expect(specifier.test(realImport)).toBe(true);
        // ...and does NOT match the same name in prose, which is why the
        // surviving modules may still explain what was removed.
        expect(specifier.test(`// ${name} was deleted in Gate D`)).toBe(false);
    });

    it("no npm script can run the deleted operator script", () => {
        const pkg = readFileSync(join(WEB_ROOT, "package.json"), "utf8");
        expect(pkg).not.toContain("validateOpenAiEnrichmentLocal");
        expect(pkg).not.toContain("validate:ai-openai-local");
    });
});

describe("P28D-2 — exactly one module can reach a reasoning provider", () => {
    /**
     * A completions call needs two things: a transport primitive and an
     * endpoint. Either alone is innocent — plenty of modules `fetch` internal
     * URLs, and a path string in prose is just prose. Together they are egress.
     */
    it("only the governed adapter combines transport with a completions endpoint", () => {
        const offenders: string[] = [];
        for (const { rel, src } of scannedFiles()) {
            if (rel === GOVERNED_ADAPTER) continue;
            const transports = /\bfetch\s*\(|\bXMLHttpRequest\b|from\s+"node:https?"|require\(\s*"https?"/.test(src);
            if (transports && REASONING_ENDPOINT.test(src)) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });

    /**
     * Bearer auth is unremarkable on its own — Supabase and several outbound
     * integrations use it legitimately, and a control that flagged them would
     * be noise that someone eventually silences. It is only interesting when
     * the same module also names a reasoning endpoint or reads a provider key.
     */
    it("no module outside the governed adapter authenticates TO a reasoning provider", () => {
        const offenders: string[] = [];
        for (const { rel, src } of scannedFiles()) {
            if (rel === GOVERNED_ADAPTER) continue;
            const bearer = /Authorization["']?\s*:\s*[`"']Bearer/.test(src);
            if (bearer && (REASONING_ENDPOINT.test(src) || CREDENTIAL_READ.test(src))) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });

    it("the governed adapter really is an egress module — the control is not passing vacuously", () => {
        const src = readFileSync(join(WEB_ROOT, GOVERNED_ADAPTER), "utf8");
        expect(src).toMatch(/\bfetch\s*\(/);
        expect(src).toContain("/chat/completions");
    });

    it("the surviving structured providers send nothing anywhere", () => {
        for (const rel of ["lib/ai/stubProvider.ts", "lib/ai/disabledStructuredProvider.ts"]) {
            const src = readFileSync(join(WEB_ROOT, rel), "utf8");
            expect(src, `${rel} performs transport`).not.toMatch(/\bfetch\s*\(/);
            expect(src, `${rel} reads a credential`).not.toContain("OPENAI_API_KEY");
        }
    });
});

describe("P28D-3 — provider credentials are read in a closed set of modules", () => {
    /**
     * A READ, not a mention. `resolveTrustAuthorization` names the variable in
     * the operator-facing 503 that tells an admin what to configure, and that
     * message is the correct place for it — flagging it would push a useful
     * instruction out of the product to satisfy a scanner.
     */
    it("only the credential owner and the governed adapter read the key", () => {
        const offenders: string[] = [];
        for (const { rel, src } of scannedFiles()) {
            if ((CREDENTIAL_READERS as readonly string[]).includes(rel)) continue;
            if (CREDENTIAL_READ.test(src)) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });

    it("both declared readers really do read it — the allowlist is not stale", () => {
        for (const rel of CREDENTIAL_READERS) {
            expect(CREDENTIAL_READ.test(readFileSync(join(WEB_ROOT, rel), "utf8")), `${rel}`).toBe(true);
        }
    });

    it("the port resolver obtains its transport from the owner rather than reading a key itself", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/ai/trust/governedReasoningProviderPort.ts"), "utf8");
        expect(src).not.toContain("OPENAI_API_KEY");
        expect(src).toContain("createOpenAiCompatibleProviderAdapterFromEnv");
    });
});

describe("P28D-4 — the enrichment route has one destination", () => {
    const ROUTE = "app/api/admin/ai/enrich-attention-suggestion/route.ts";

    it("reaches the governed consumer and no provider machinery", () => {
        const src = readFileSync(join(WEB_ROOT, ROUTE), "utf8");
        expect(src).toContain("enrichAttentionSuggestionViaTrustRuntime");
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toContain("completeStructured");
        expect(src).not.toContain("AiStructuredProvider");
    });

    it("no route anywhere in the app reaches a structured provider", () => {
        const offenders: string[] = [];
        for (const { rel, src } of scannedFiles()) {
            if (!rel.startsWith("app/")) continue;
            if (src.includes("completeStructured")) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });
});
