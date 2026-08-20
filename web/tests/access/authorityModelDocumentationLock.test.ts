import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * W-52 Tier A (`02…§19`, `RL-41`) — *"`README_ADMIN_AUTH.md` asserts a resolver and entry-point set;
 * assert it matches the exports actually present."*
 *
 * `01…§31` counts the repository's own description of the authority model among GAP-12's eight
 * truthfulness mechanisms, and notes it is one of the two that **mislead the engineer who would fix
 * the other six**. The document this locks previously asserted a *"Single resolver"* while three
 * functions independently computed `portalEligible`; described `requireAdminOrOps` as resolving
 * through `getAdminAuth` when it resolves through a *different* resolver (`M2-13`); and cited an
 * **archived** document as canonical product semantics.
 *
 * Why a lock and not just a rewrite: a document is true on the day it is written. The three
 * assertions below are the ones that were false, so they are the three a future change must keep
 * true — and the resolver set is **DISCOVERED from source**, not enumerated here, because an
 * enumerated list is a list a newly added resolver is absent from. That is the failure shape this
 * initiative has already paid for in `W-5`'s locks and session 3's backing-route record.
 */

const WEB_DIR = process.cwd();
const REPO_ROOT = resolve(WEB_DIR, "..");
const README = join(WEB_DIR, "README_ADMIN_AUTH.md");
const GOVERNANCE = join(REPO_ROOT, "docs/platform/governance/roles-and-permissions.md");

const readmeSource = readFileSync(README, "utf8");
const governanceSource = readFileSync(GOVERNANCE, "utf8");

// ---------------------------------------------------------------------------
// Discovery: what actually resolves portal admission
// ---------------------------------------------------------------------------

/**
 * A "resolution path" is a function that **binds `portalEligible`** from a `PORTAL_ROLES` test.
 * That is the property the document makes a cardinality claim about, so it is the property the
 * check derives — rather than a name list, which the document could satisfy by agreeing with itself.
 *
 * **Why not every `PORTAL_ROLES` reader.** `chooseOrgAndRoleKeysFromMembershipRows` consults the
 * same set to PREFER an org where the principal holds `admin`/`ops` among several memberships. It
 * decides *which org*, never *whether admission is granted* — listing it as a resolution path would
 * make the document state something false. This narrowing is not the "shrinking the alarm set" move
 * session 5 declined: this check produces a **cardinality claim about admission deciders**, not a
 * risk bucket, and widening it here would corrupt the claim rather than make it conservative.
 *
 * Attribution is to the nearest PRECEDING exported function, at method grain: two of the three live
 * in one module, so a file-grained answer would report two paths where there are three. Matching is
 * over the raw source by offset so a binding split across lines is still attributed.
 */
function portalEligibilityResolvers(source: string): string[] {
    const exportsAt: { at: number; name: string }[] = [];
    for (const m of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
        exportsAt.push({ at: m.index ?? 0, name: m[1] });
    }

    const found = new Set<string>();
    for (const hit of source.matchAll(/portalEligible\s*=\s*[^;]*PORTAL_ROLES\.has\(/g)) {
        const at = hit.index ?? 0;
        let owner: string | null = null;
        for (const e of exportsAt) {
            if (e.at < at) owner = e.name;
            else break;
        }
        if (owner) found.add(owner);
    }
    return [...found].sort();
}

function adminLibModules(): string[] {
    const dir = join(WEB_DIR, "lib/admin");
    return readdirSync(dir)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
        .map((f) => join(dir, f));
}

/** Every `portalEligible` resolver in `lib/admin`, as `symbol` names. */
function discoveredResolutionPaths(): string[] {
    const found = new Set<string>();
    for (const file of adminLibModules()) {
        for (const name of portalEligibilityResolvers(readFileSync(file, "utf8"))) {
            found.add(name);
        }
    }
    return [...found].sort();
}

// ---------------------------------------------------------------------------
// Parsing: what the document claims
// ---------------------------------------------------------------------------

/** `| 1 | **\`symbol\`** | \`path\` | … |` — the resolution-path table. */
function claimedResolutionPaths(doc: string): { symbol: string; file: string }[] {
    const rows: { symbol: string; file: string }[] = [];
    for (const line of doc.split("\n")) {
        const m = /^\|\s*\d+\s*\|\s*\*\*`([^`]+)`\*\*\s*\|\s*`([^`]+)`\s*\|/.exec(line);
        if (m) rows.push({ symbol: m[1], file: m[2] });
    }
    return rows;
}

/** `| **\`symbol\`** (\`path\`) | … |` — the entry-point table. */
function claimedEntryPoints(doc: string): { symbol: string; file: string }[] {
    const rows: { symbol: string; file: string }[] = [];
    for (const line of doc.split("\n")) {
        const m = /^\|\s*\*\*`([^`]+)`\*\*\s*\(`([^`]+)`\)\s*\|/.exec(line);
        if (m) rows.push({ symbol: m[1], file: m[2] });
    }
    return rows;
}

/** Every file-shaped path the document mentions, in a link or a code span. */
function referencedPaths(doc: string): string[] {
    const found = new Set<string>();
    const candidates = [
        ...[...doc.matchAll(/`([^`]+)`/g)].map((m) => m[1]),
        ...[...doc.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]),
    ];
    for (const raw of candidates) {
        const c = raw.trim();
        if (!c.includes("/")) continue;
        if (!/\.(md|ts|tsx|json)$/.test(c)) continue;
        found.add(c);
    }
    return [...found].sort();
}

/** A path resolves if it exists relative to the repo root OR to the document's own directory. */
function pathResolves(candidate: string, docPath: string): boolean {
    return (
        existsSync(resolve(REPO_ROOT, candidate)) ||
        existsSync(resolve(dirname(docPath), candidate))
    );
}

function exportsSymbol(fileRelToWeb: string, symbol: string): boolean {
    const abs = existsSync(resolve(WEB_DIR, fileRelToWeb))
        ? resolve(WEB_DIR, fileRelToWeb)
        : resolve(REPO_ROOT, fileRelToWeb);
    if (!existsSync(abs)) return false;
    const src = readFileSync(abs, "utf8");
    return new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${symbol}\\b`).test(src);
}

// ---------------------------------------------------------------------------

describe("W-52 / RL-41 — the resolver set the README asserts is the one that exists", () => {
    it("discovers the resolution paths it is supposed to be checking (not vacuous)", () => {
        // Three today. The assertion is a floor, not the count, so that ADDING a resolver fails on
        // the set comparison below — where the reviewer sees its name — rather than here.
        expect(discoveredResolutionPaths().length).toBeGreaterThanOrEqual(2);
    });

    it("names every function that decides portal admission, and no function that does not", () => {
        const discovered = discoveredResolutionPaths();
        const claimed = claimedResolutionPaths(readmeSource).map((r) => r.symbol).sort();

        expect(
            claimed,
            "README_ADMIN_AUTH.md's resolution-path table must match the functions that actually " +
                "compute portalEligible. The document once claimed a 'Single resolver' while three " +
                "existed — M2-13's 'two gates in one request can disagree about the same principal'."
        ).toEqual(discovered);
    });

    it("each resolution path's named module really contains it", () => {
        const wrong = claimedResolutionPaths(readmeSource).filter(
            (r) => !exportsSymbol(r.file, r.symbol)
        );
        expect(wrong.map((w) => `${w.symbol} not exported by ${w.file}`)).toEqual([]);
    });
});

describe("W-52 / RL-41 — the entry points the README asserts are exports that exist", () => {
    it("finds the entry-point table (not vacuous)", () => {
        expect(claimedEntryPoints(readmeSource).length).toBeGreaterThanOrEqual(5);
    });

    it("every named entry point is exported by the module the README names", () => {
        const wrong = claimedEntryPoints(readmeSource).filter(
            (r) => !exportsSymbol(r.file, r.symbol)
        );
        expect(
            wrong.map((w) => `${w.symbol} not exported by ${w.file}`),
            "a route-entry helper the document names but the tree does not export sends an engineer " +
                "to a path that is not the live one"
        ).toEqual([]);
    });
});

describe("W-52 / RL-41 — no dead pointers, and nothing archived is cited as canonical", () => {
    it("finds paths to check in both documents (not vacuous)", () => {
        expect(referencedPaths(readmeSource).length).toBeGreaterThanOrEqual(5);
        expect(referencedPaths(governanceSource).length).toBeGreaterThanOrEqual(3);
    });

    it("every path README_ADMIN_AUTH.md points at exists", () => {
        const dead = referencedPaths(readmeSource).filter((p) => !pathResolves(p, README));
        expect(dead).toEqual([]);
    });

    it("every path the canonical governance doc points at exists", () => {
        // The defect this replaces: an 'Expanded reference' to docs/system/roles-and-permissions.md,
        // a file that has never existed, in a document carrying `status: canonical`.
        const dead = referencedPaths(governanceSource).filter((p) => !pathResolves(p, GOVERNANCE));
        expect(dead).toEqual([]);
    });

    it("README_ADMIN_AUTH.md cites no archived document", () => {
        expect(
            readmeSource.includes("docs/archive/"),
            "the README once named an archived doc as 'Canonical product semantics', in four places"
        ).toBe(false);
    });

    it("the governance doc marks its archived reference as not canonical", () => {
        const archiveIndex = governanceSource.indexOf("docs/archive/");
        expect(archiveIndex).toBeGreaterThan(-1);
        const preamble = governanceSource.slice(Math.max(0, archiveIndex - 200), archiveIndex);
        expect(
            /not canonical/i.test(preamble),
            "retaining superseded background is fine; presenting it as canonical is the defect"
        ).toBe(true);
    });
});

describe("W-52 / RL-41 — the lock bites", () => {
    it("bites: dropping a resolution path from the table is caught", () => {
        const regressed = readmeSource.replace(
            /^\|\s*3\s*\|\s*\*\*`resolveAdminPortalOrgCore`\*\*.*$/m,
            ""
        );
        expect(regressed).not.toBe(readmeSource);
        expect(claimedResolutionPaths(regressed).map((r) => r.symbol).sort()).not.toEqual(
            discoveredResolutionPaths()
        );
    });

    it("bites: claiming a resolver the tree does not export is caught", () => {
        const regressed = readmeSource.replace(
            "| 3 | **`resolveAdminPortalOrgCore`** |",
            "| 3 | **`resolveTheOneTrueResolver`** |"
        );
        expect(regressed).not.toBe(readmeSource);
        const wrong = claimedResolutionPaths(regressed).filter(
            (r) => !exportsSymbol(r.file, r.symbol)
        );
        expect(wrong.length).toBeGreaterThan(0);
    });

    it("bites: a dead documentation pointer is caught", () => {
        const regressed = governanceSource.replace(
            "../../../web/README_ADMIN_AUTH.md",
            "../../system/roles-and-permissions.md"
        );
        expect(regressed).not.toBe(governanceSource);
        const dead = referencedPaths(regressed).filter((p) => !pathResolves(p, GOVERNANCE));
        expect(dead.length).toBeGreaterThan(0);
    });

    it("bites: an entry point that is not exported is caught", () => {
        const regressed = readmeSource.replace(
            "**`loadAdminRouteGate`** (`lib/admin/adminRouteGate.ts`)",
            "**`loadAdminRouteGateV2`** (`lib/admin/adminRouteGate.ts`)"
        );
        expect(regressed).not.toBe(readmeSource);
        const wrong = claimedEntryPoints(regressed).filter((r) => !exportsSymbol(r.file, r.symbol));
        expect(wrong.length).toBeGreaterThan(0);
    });
});
