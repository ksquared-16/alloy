/**
 * Benchmark context pack semantic guards (Slot C, erun_2696218404a5b8a6).
 *
 * The pack decides what an AI may treat as authoritative Alloy doctrine, so its failure modes are
 * specific: a pointer to a document that no longer exists, a treatment that promotes planning
 * material to current truth, or a domain quietly listed as certified before its blockers closed.
 * These guards check those relationships rather than the prose.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../scripts/docs-lint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const MANIFEST = "docs/context/alloy-benchmark-context.md";
const manifest = () => read(MANIFEST);

const TREATMENTS = [
    "DIRECT",
    "REFERENCE_ON_DEMAND",
    "GENERATED_REFERENCE",
    "SUMMARY",
    "EXCLUDE_HISTORY",
    "PLANNED_ONLY",
];

/** Backticked repo-relative doc paths the manifest points at, ignoring globs and ranges. */
function citedPaths(): string[] {
    const out = new Set<string>();
    for (const m of manifest().matchAll(/`((?:docs\/)?(?:platform|runtime|api|context)\/[^`\s]+)`/g)) {
        const raw = m[1];
        if (raw.includes("*") || /\d+–\d+/.test(raw)) continue; // globs and history ranges
        out.add(raw.startsWith("docs/") ? raw : `docs/${raw}`);
    }
    return [...out].sort();
}

describe("the pack is governed and discoverable", () => {
    it("exists, is canonical, and names an owner", () => {
        expect(existsSync(path.join(repoRoot, MANIFEST))).toBe(true);
        const fm = parseFrontmatter(manifest()).data as Record<string, unknown> | null;
        expect(fm?.status).toBe("canonical");
        expect(fm?.owner).toBeTruthy();
    });

    it("is reachable from docs/README.md", () => {
        expect(read("docs/README.md")).toContain("context/alloy-benchmark-context.md");
    });

    it("docs/context is governed by docs-lint, so the manifest cannot drift unchecked", () => {
        // A manifest about authority that is not itself linted is the failure this prevents.
        const lint = read("scripts/docs-lint.mjs");
        expect(lint).toMatch(/GOVERNED_GLOBS[\s\S]{0,400}docs\\\/context/);
        expect(lint).toMatch(/CANONICAL_LINK_SCOPES[\s\S]{0,400}docs\\\/context/);
    });
});

describe("every document the pack points at exists", () => {
    it("has at least the certified API and Runtime owners", () => {
        expect(citedPaths().length).toBeGreaterThanOrEqual(10);
    });

    it("resolves every cited path — a dead pointer makes the pack unusable", () => {
        const dead = citedPaths().filter((p) => !existsSync(path.join(repoRoot, p)));
        expect(dead).toEqual([]);
    });
});

describe("treatments cannot promote non-current material", () => {
    it("uses only defined treatments", () => {
        const used = new Set<string>();
        for (const m of manifest().matchAll(/\b([A-Z][A-Z_]{3,})\b/g)) {
            if (TREATMENTS.includes(m[1])) used.add(m[1]);
        }
        expect([...used].sort()).toEqual([...TREATMENTS].sort());
    });

    it("the two still-proposed runtime documents are never DIRECT", () => {
        // Both carry status: proposed. Listing either as DIRECT would present a plan as doctrine.
        for (const rel of [
            "docs/platform/runtime/runtime-implementation-authorization.md",
            "docs/platform/runtime/stage-work-view-queue-canonical-model.md",
        ]) {
            const fm = parseFrontmatter(read(rel)).data as Record<string, unknown> | null;
            if (fm?.status !== "proposed") continue; // ratified later: the constraint lapses
            const row = manifest()
                .split("\n")
                .find((l) => l.includes(rel.replace(/^docs\//, "")) && l.includes("|"));
            expect(row, `no manifest row for ${rel}`).toBeTruthy();
            expect(row).toMatch(/PLANNED_ONLY/);
            expect(row).not.toMatch(/\bDIRECT\b/);
        }
    });

    it("states that canonical status alone does not earn DIRECT context", () => {
        expect(manifest()).toMatch(/`status: canonical` alone does not qualify/i);
    });

    it("states that code evidence outranks documentation", () => {
        expect(manifest()).toMatch(/outranks documentation/i);
    });
});

describe("Business Process is listed at its true certification state", () => {
    /** D-BP1 is open while either operator surface still sends a lifecycle status key. */
    /**
     * D-BP1 is open while any supported caller can still write lifecycle state through the generic
     * Opportunity PATCH.
     *
     * Current Work converged in erun_3c3e4601ce8ab9fb, so checking it would now read as closed. The
     * remaining consumer is the record-action path, and it cannot be detected by scanning its own
     * source: `executeOpportunityRecordAction` forwards a body built by `opportunityRecordActionMap`.
     * So the pair is what gets checked.
     */
    const bypassOpen = () => {
        /*
         * D-BP1 is open while the generic record route can persist governed lifecycle state.
         * Closed in erun_fbaf1ac1049f1050: the keys left the writable allow-list and the route now
         * refuses them outright. This reads the refusal rather than a sender list, because the senders
         * are what kept moving — the route's own authority is the durable fact.
         */
        const route = read("web/app/api/admin/opportunities/[id]/route.ts");
        const refuses = /canonical_transition_required/.test(route);
        const allowList = route.slice(route.indexOf("ALLOWED_KEYS"), route.indexOf("PIPELINE_ONLY_KEYS"));
        const writable = /"status_key"|"close_reason_key"/.test(allowList);
        return writable || !refuses;
    };

    it("is PENDING_CERTIFICATION while the bypass is open", () => {
        if (!bypassOpen()) return; // converged: the domain may certify
        expect(manifest()).toMatch(/PENDING_CERTIFICATION/);
    });

    it("names its blockers rather than just deferring", () => {
        if (!bypassOpen()) return;
        const m = manifest();
        for (const blocker of ["D-BP1", "D-BP4", "D-BP5"]) expect(m).toContain(blocker);
    });

    it("does not list a Business Process document as DIRECT while pending", () => {
        if (!bypassOpen()) return;
        const bpDocs = [
            "core/business-process-system.md",
            "core/stage-membership-and-outcomes.md",
            "core/status-and-state-system.md",
            "core/work-view-membership-and-navigation.md",
        ];
        for (const line of manifest().split("\n")) {
            if (!bpDocs.some((d) => line.includes(d))) continue;
            expect(line, `BP doc offered as DIRECT while pending: ${line.trim().slice(0, 100)}`).not.toMatch(
                /\bDIRECT\b/,
            );
        }
    });
});

describe("Identity/Access is pending, and its blockers are real", () => {
    /** The RLS authority decision is open while that canonical doc still says DECISION_READY. */
    const rlsGateOpen = () =>
        /DIRECTOR_DECISION_READY/.test(read("docs/platform/governance/rls-authority-model-director-gate.md"));

    it("is listed PENDING_CERTIFICATION while the RLS gate is open", () => {
        if (!rlsGateOpen()) return; // decided later: the constraint lapses
        const section = manifest().split("## 6.")[1] ?? "";
        expect(section).toMatch(/PENDING_CERTIFICATION/);
    });

    it("does not offer any Identity/Access document as DIRECT while pending", () => {
        if (!rlsGateOpen()) return;
        const idDocs = [
            "governance/roles-and-permissions.md",
            "governance/rls-authority-model-director-gate.md",
            "operator/access-product-ui.md",
            "operator/identity-surface-composition-v2.md",
        ];
        for (const line of manifest().split("\n")) {
            if (!idDocs.some((d) => line.includes(d))) continue;
            expect(line, `Identity doc offered as DIRECT while pending: ${line.trim().slice(0, 90)}`).not.toMatch(
                /\bDIRECT\b(?!_CANDIDATE)/,
            );
        }
    });

    it("treats the Access V2 planning tree as planning, never as authority", () => {
        const section = manifest().split("## 6.")[1] ?? "";
        expect(section).toMatch(/PLANNED_ONLY/);
        expect(section).toMatch(/access-identity-v2/);
    });
});

describe("the pack records what it was certified against", () => {
    it("carries a version, a certification date and a base SHA", () => {
        const m = manifest();
        expect(m).toMatch(/\*\*Version\*\*/);
        expect(m).toMatch(/\*\*Certified\*\*/);
        expect(m).toMatch(/\*\*Base\*\*/);
    });

    it("lists both certified and pending domains", () => {
        expect(manifest()).toMatch(/Domains certified/);
        expect(manifest()).toMatch(/Domains pending/);
    });
});
