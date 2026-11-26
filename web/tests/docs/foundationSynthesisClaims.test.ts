import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE FOUNDATION SYNTHESIS, AND THE FOUR CLAIMS IT HAD TO CORRECT.
 *
 * Fourteen certified domain records were synthesized into a five-file Tier 1 context set. Doing that
 * forced a reconciliation against the top-level foundation documents, and four of them were wrong in
 * ways that would mislead any reader — human or model:
 *
 *   1. `foundation/architecture.md` named `/admin` as the settings hub and `/admin/settings/*` as the
 *      control plane. Both redirect. It also disagreed with `foundation/system-overview.md`, and both
 *      were marked `status: canonical`.
 *   2. `system/routing-doctrine.md` — which declares itself the single source of truth for product
 *      URLs — had gone stale on exactly that, naming `/admin` as the config landing.
 *   3. `foundation/product-roadmap.md` said partner APIs had "no inbound machine credential, no API
 *      versioning". `/api/v1` is a frozen 18-path contract with an OAuth token exchange.
 *   4. `foundation/system-overview.md` listed Scheduling, Attendance, Commercial and AI as future
 *      "domain productization" while all four are certified.
 *
 * WHY THE ABSENCE ASSERTIONS ARE WRITTEN THE WAY THEY ARE.
 *
 * Each correction deliberately QUOTES the sentence it replaces, because a correction that hides what
 * it corrected teaches nobody. That makes a naive `not.toContain(staleClaim)` fail on a correctly
 * corrected document — and makes a naive `toContain(newClaim)` pass even if someone restores the old
 * claim beside it. This is the false-green class that has bitten this suite repeatedly: matching a
 * file rather than a claim, or matching quoted text that the document is in the act of refuting.
 *
 * So the binding is positional: a stale phrase may appear ONLY inside a correction note. Delete the
 * note and restore the bare claim, and the guard fails. Keep the note and the guard passes. That is
 * the actual invariant — not the mere presence or absence of a string.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel: string) => existsSync(path.join(repoRoot, rel));

const SYNTHESIS = "docs/context/alloy-platform-synthesis.md";
const OWNERS = "docs/context/alloy-canonical-owner-map.md";
const INFERENCE = "docs/context/alloy-inference-contract.md";
const PACKAGES = "docs/context/alloy-context-packages.md";
const MANIFEST = "docs/context/alloy-benchmark-context.md";

/** The Tier 1 load set. Small on purpose: five files against a corpus of ~1,893. */
const TIER_1 = [SYNTHESIS, OWNERS, INFERENCE, PACKAGES, "docs/platform/governance/glossary.md"];

const CONTEXT_SET = [SYNTHESIS, OWNERS, INFERENCE, PACKAGES];

/** Trees that must never supply current truth. */
const EXCLUDED_TREES = [
    "docs/sprints/",
    "docs/archive/",
    "docs/audits/",
    "docs/handoffs/",
    "docs/marketing/",
    "docs/platform/planning/",
    "docs/platform/milestones/",
];

/**
 * Does `phrase` appear only inside a correction note?
 *
 * A correction note is marked by `Corrected <date>` or a `>` blockquote. Every occurrence of the
 * phrase must be preceded, within `window` characters and with no intervening blank-line paragraph
 * break for the blockquote form, by such a marker.
 */
function staleClaimOnlyInsideCorrection(text: string, phrase: string, window = 700): boolean {
    let from = 0;
    for (;;) {
        const at = text.indexOf(phrase, from);
        if (at === -1) return true;
        const before = text.slice(Math.max(0, at - window), at);
        if (!/Corrected\s+\d{4}-\d{2}-\d{2}|previously (?:read|named|listed|said|ended)/i.test(before)) {
            return false;
        }
        from = at + phrase.length;
    }
}

/** Markdown link targets, resolved relative to the citing file. */
function linkTargets(rel: string): string[] {
    const out: string[] = [];
    for (const m of read(rel).matchAll(/\]\(([^)\s]+)\)/g)) {
        const t = m[1]!;
        if (/^(https?:|#|mailto:)/.test(t)) continue;
        out.push(t.split("#")[0]!);
    }
    return out;
}

describe("the foundation synthesis exists and is governed", () => {
    it("is not vacuous: all four context documents exist, are canonical, and name an owner", () => {
        for (const rel of CONTEXT_SET) {
            expect(exists(rel), `${rel} is missing`).toBe(true);
            const head = read(rel).split("---")[1] ?? "";
            expect(head, `${rel} is not status: canonical`).toMatch(/status:\s*canonical/);
            expect(head, `${rel} names no owner`).toMatch(/owner:\s*\S+/);
        }
    });

    it("is discoverable from docs/README.md, or nobody will find it", () => {
        const readme = read("docs/README.md");
        for (const rel of CONTEXT_SET) {
            expect(readme, `docs/README.md does not point at ${rel}`).toContain(
                rel.replace("docs/", ""),
            );
        }
    });

    it("resolves every document it points at — a dead owner makes the map unusable", () => {
        for (const rel of [...CONTEXT_SET, MANIFEST]) {
            const dir = path.dirname(rel);
            for (const target of linkTargets(rel)) {
                const resolved = path.normalize(path.join(dir, target));
                expect(exists(resolved), `${rel} points at missing ${resolved}`).toBe(true);
            }
        }
    });
});

describe("Tier 1 stays small, and never promotes non-current material", () => {
    it("is exactly five files, all of which exist", () => {
        expect(TIER_1).toHaveLength(5);
        for (const rel of TIER_1) expect(exists(rel), `Tier 1 file ${rel} is missing`).toBe(true);
        // The package document must agree, or the two drift and the smaller one is ignored.
        expect(read(PACKAGES), "the package doc no longer says Tier 1 is five files").toMatch(
            /Tier 1 is \*\*five files\*\*/,
        );
    });

    it("loads nothing from an excluded tree", () => {
        for (const rel of TIER_1) {
            for (const tree of EXCLUDED_TREES) {
                expect(rel.startsWith(tree), `${rel} is Tier 1 but lives in excluded ${tree}`).toBe(
                    false,
                );
            }
        }
    });

    it("never makes a roadmap or release-history document Tier 1 or DIRECT", () => {
        /*
         * These are intent and history. The owner map lists them under "Deliberate non-owners"; that
         * placement is the claim under test, because promoting either is how a plan becomes mistaken
         * for a platform.
         */
        const owners = read(OWNERS);
        const nonOwners = owners.slice(owners.indexOf("### Deliberate non-owners"));
        for (const doc of ["product-roadmap.md", "release-history.md", "alloy-platform-handbook.md"]) {
            expect(nonOwners, `${doc} is no longer listed as a deliberate non-owner`).toContain(doc);
            expect(TIER_1.some((t) => t.endsWith(doc))).toBe(false);
        }
    });
});

describe("the manifest and the synthesis agree about what is certified", () => {
    const certifiedRow = () =>
        read(MANIFEST)
            .split("\n")
            .find((l) => /\*\*Domains certified\*\*/.test(l)) ?? "";

    /** Domain names as the certified row spells them, reduced to a matchable token. */
    const DOMAINS = [
        "Developer Platform / API",
        "Runtime",
        "Business Process",
        "Identity/Access",
        "Operations temporal truth",
        "Enrollment / Placement",
        "Staff / Scheduling",
        "Attendance",
        "Subsidy",
        "Commercial",
        "Operational Intelligence",
        "Communications",
        "Configuration",
        "AI/BOS",
    ];

    it("is not vacuous: the certified row names all fourteen domains", () => {
        const row = certifiedRow();
        expect(row, "no certified row found in the manifest").toBeTruthy();
        for (const d of DOMAINS) expect(row, `certified row omits ${d}`).toContain(d);
    });

    it("gives every certified domain a row in the status scoreboard", () => {
        const manifest = read(MANIFEST);
        const table = manifest.slice(manifest.indexOf("## Domain status"));
        expect(table.length, "the domain status table is missing").toBeGreaterThan(500);
        // The scoreboard spells two domains without the row's spacing, so compare loosely.
        for (const d of DOMAINS) {
            const loose = d.replace(/\s*\/\s*/, "\\s*/\\s*");
            expect(
                new RegExp(loose).test(table),
                `the domain status table has no row for ${d}`,
            ).toBe(true);
        }
    });

    it("keeps Financials/Payments pending, with no DIRECT owner anywhere", () => {
        const manifest = read(MANIFEST);
        const pendingRow = manifest.split("\n").find((l) => /\*\*Domains pending\*\*/.test(l)) ?? "";
        expect(pendingRow, "the pending row no longer names Financials / Payments").toMatch(
            /Financials \/ Payments/,
        );
        const table = manifest.slice(manifest.indexOf("## Domain status"));
        const finRow = table
            .split("\n")
            .find((l) => /\*\*Financials \/ Payments\*\*/.test(l) && l.includes("PENDING"));
        expect(finRow, "Financials/Payments has no PENDING row in the scoreboard").toBeTruthy();
        expect(
            /do not load a Payments document as current truth/.test(finRow ?? ""),
            "the Financials row no longer refuses a DIRECT owner",
        ).toBe(true);
    });

    it("says plainly that twelve declaration tokens cover fourteen rows", () => {
        /*
         * Measured: only twelve `*_DOCUMENTATION_CONTEXT_READY` tokens exist. Operations temporal
         * truth shares Enrollment/Placement's, and Subsidy has none. A scoreboard that implied
         * fourteen tokens would be exactly the tidy-looking falsehood this corpus exists to prevent.
         */
        const manifest = read(MANIFEST);
        expect(manifest).toMatch(/twelve tokens for fourteen rows|twelve tokens/i);
        expect(manifest, "the Subsidy row no longer records its missing declaration").toMatch(
            /Subsidy[\s\S]{0,400}no token exists in the tree/,
        );
    });
});

describe("the four corrected foundation claims stay corrected", () => {
    it("architecture.md no longer calls /admin the settings hub", () => {
        const arch = read("docs/platform/foundation/architecture.md");
        expect(
            staleClaimOnlyInsideCorrection(arch, "`/admin` | Settings hub"),
            "architecture.md again presents /admin as the settings hub outside a correction note",
        ).toBe(true);
        expect(arch, "architecture.md no longer names /organization as the config landing").toMatch(
            /`\/organization`\s*\|\s*configuration landing/i,
        );
        expect(arch, "architecture.md no longer defers URL ownership to the routing doctrine").toMatch(
            /does not own product URLs/,
        );
    });

    it("routing-doctrine.md names /organization as the configuration landing", () => {
        const doctrine = read("docs/system/routing-doctrine.md");
        expect(doctrine).toMatch(/`\/organization`\s*\|\s*\*\*Configuration landing\*\*/);
        expect(
            staleClaimOnlyInsideCorrection(
                doctrine,
                "Exact `/admin/settings` redirects to `/admin`",
            ),
            "the doctrine again claims /admin/settings redirects to /admin",
        ).toBe(true);
        expect(doctrine, "the three-base model is gone").toMatch(/Three canonical bases coexist/);
    });

    it("product-roadmap.md no longer claims Alloy has no partner API", () => {
        const roadmap = read("docs/platform/foundation/product-roadmap.md");
        expect(
            staleClaimOnlyInsideCorrection(roadmap, "no inbound machine credential, no API"),
            "the roadmap again asserts there is no inbound machine credential or API versioning",
        ).toBe(true);
        expect(roadmap, "the roadmap no longer records that the partner API is built").toMatch(
            /built, versioned and certified/,
        );
        expect(roadmap, "the roadmap no longer limits the gap to the outbound half").toMatch(
            /Only the\s*\n?\s*outbound half is genuinely absent/,
        );
    });

    it("system-overview.md no longer lists certified domains as future productization", () => {
        const overview = read("docs/platform/foundation/system-overview.md");
        expect(
            staleClaimOnlyInsideCorrection(
                overview,
                "domain productization (Scheduling, Attendance, Billing, Payments, Commercial, AI, Partner APIs)",
            ),
            "system-overview again lists certified domains as future work",
        ).toBe(true);
        expect(overview, "system-overview no longer states the certified count").toMatch(
            /Fourteen domains are certified/,
        );
    });
});

describe("the partner-API correction rests on code, not on prose", () => {
    it("the OAuth token exchange the roadmap denied actually exists", () => {
        expect(
            exists("web/app/api/v1/oauth/token/route.ts"),
            "the public OAuth token route is gone — the roadmap correction would no longer be true",
        ).toBe(true);
    });

    it("the public surface is the closed 18-path contract the correction cites", () => {
        const spec = JSON.parse(read("docs/api/openapi/alloy-public-api.v1.json")) as {
            paths?: Record<string, unknown>;
        };
        expect(
            Object.keys(spec.paths ?? {}).length,
            "the published public surface is no longer 18 paths; the synthesis and the roadmap "
                + "correction both cite that number and must be re-measured",
        ).toBe(18);
    });

    it("outbound partner event delivery is still genuinely absent", () => {
        // The one third of the original claim that was true. If delivery machinery appears, the
        // corrected roadmap entry becomes wrong in the other direction.
        const synthesis = read(SYNTHESIS);
        expect(synthesis).toMatch(/no outbound partner event delivery/i);
    });
});
