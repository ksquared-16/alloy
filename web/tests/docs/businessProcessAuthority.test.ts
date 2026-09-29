/**
 * Business Process documentation authority guards.
 *
 * These pin the six defects repaired by the BP documentation convergence packet (2026-09-29).
 * Each guards a semantic AUTHORITY RELATIONSHIP rather than a prose snapshot, so ordinary editing
 * does not break them and a genuine authority regression does.
 *
 * Discovery record: the direct status PATCH is active bypass debt (D-BP1); the Stage/Work View/Queue
 * model is partially superseded and its implemented half was extracted to a canonical owner (D-BP2);
 * `runtime-implementation-authorization.md` stays proposed (D-BP3); one canonical transition gate is
 * the ratified direction but is not yet universal (D-BP4); fresh child OCM status is `new_inquiry`,
 * not null (D-BP5).
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../scripts/docs-lint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const CANONICAL_WORK_VIEW_DOC = "docs/platform/core/work-view-membership-and-navigation.md";

function walkMarkdown(rel: string): string[] {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(abs)) {
        const childRel = `${rel}/${entry}`;
        if (statSync(path.join(repoRoot, childRel)).isDirectory()) out.push(...walkMarkdown(childRel));
        else if (entry.endsWith(".md")) out.push(childRel);
    }
    return out;
}

/** Docs that state CURRENT platform doctrine — excludes history, archives and planning trees. */
function currentDoctrineDocs(): string[] {
    return walkMarkdown("docs/platform")
        .filter((p) => !p.startsWith("docs/platform/planning/"))
        .filter((p) => {
            const fm = parseFrontmatter(read(p)).data as Record<string, unknown> | null;
            return fm?.status === "canonical" || fm?.status === "frozen";
        });
}

describe("BP authority — guard 1: the Work View canonical owner exists and is discoverable", () => {
    it("exists and is canonical", () => {
        expect(existsSync(path.join(repoRoot, CANONICAL_WORK_VIEW_DOC))).toBe(true);
        const fm = parseFrontmatter(read(CANONICAL_WORK_VIEW_DOC)).data as Record<string, unknown> | null;
        expect(fm?.status).toBe("canonical");
        expect(fm?.owner).toBeTruthy();
    });

    it("is reachable from docs/README.md, so it is never an orphan-canonical", () => {
        // docs-lint derives its index from docs/README.md; an unindexed platform doc is an orphan.
        expect(read("docs/README.md")).toContain("platform/core/work-view-membership-and-navigation.md");
    });

    it("owns the claims extracted from the proposed model", () => {
        const doc = read(CANONICAL_WORK_VIEW_DOC);
        // One evaluator, membership-vs-stage, and the fail-closed guard are the load-bearing three.
        expect(doc).toMatch(/one evaluator/i);
        expect(doc).toMatch(/stage position neither establishes nor limits/i);
        expect(doc).toMatch(/fail-closed/i);
    });
});

describe("BP authority — guard 2: D1 citations do not name a proposed doc as Governing", () => {
    const citing = [
        "web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts",
        "web/tests/runtime/d1ProvisioningAnswer.test.ts",
        "web/tests/runtime/d1ProvisioningStageMembership.test.ts",
    ];
    const PROPOSED = [
        "docs/platform/runtime/runtime-implementation-authorization.md",
        "docs/platform/runtime/stage-work-view-queue-canonical-model.md",
    ];

    it("each citing file names the canonical owner", () => {
        for (const rel of citing) expect(read(rel), rel).toContain(CANONICAL_WORK_VIEW_DOC);
    });

    it("no proposed doc is labelled Governing while a canonical owner exists", () => {
        for (const rel of citing) {
            const text = read(rel);
            for (const proposed of PROPOSED) {
                const fm = parseFrontmatter(read(proposed)).data as Record<string, unknown> | null;
                if (fm?.status !== "proposed") continue; // ratified later: the constraint lapses
                for (const line of text.split("\n")) {
                    if (!line.includes(proposed)) continue;
                    expect(
                        /governing/i.test(line) && !/not governing/i.test(line),
                        `${rel} names proposed ${proposed} as Governing`,
                    ).toBe(false);
                }
            }
        }
    });
});

describe("BP authority — guard 3: `new_lead` is not the current stored status key", () => {
    it("no current doctrine doc presents new_lead as a stored/persisted key", () => {
        for (const rel of currentDoctrineDocs()) {
            for (const line of read(rel).split("\n")) {
                if (!/\bnew_lead\b/.test(line)) continue;
                // Naming it as a label, an alias, a retired key or a deferred rename is correct.
                const framedAsNonStored =
                    /label|alias|display|operator-facing|retired|deferred|legacy|not the (persisted|stored)|builder/i.test(line);
                expect(framedAsNonStored, `${rel}: unqualified new_lead — ${line.trim().slice(0, 120)}`).toBe(true);
            }
        }
    });

    it("the stored fresh-lead key in code is new_inquiry", () => {
        expect(read("web/lib/admin/actions/createLeadActionConstants.ts")).toContain(
            'export const NEW_LEAD_STATUS_KEY = "new_inquiry"',
        );
    });
});

describe("BP authority — guard 4: placement_candidates is not promoted to a governed status domain", () => {
    it("the status owner explicitly excludes it", () => {
        const doc = read("docs/platform/core/status-and-state-system.md");
        expect(doc).toMatch(/placement_candidates\.status/);
        expect(doc).toMatch(/NOT a governed Status domain/i);
    });

    it("no doc lists placement_candidates as a status_definitions entity_type", () => {
        // The governed domains are exactly these; entity_type never takes the candidate table.
        for (const rel of currentDoctrineDocs()) {
            for (const line of read(rel).split("\n")) {
                if (!/status_definitions/.test(line) || !/placement_candidates/.test(line)) continue;
                expect(
                    /never|not |outside|exclud/i.test(line),
                    `${rel}: places placement_candidates inside status_definitions — ${line.trim().slice(0, 120)}`,
                ).toBe(true);
            }
        }
    });

    it("the DB CHECK constraint remains the vocabulary owner", () => {
        const sql = read("supabase/migrations/20260616120000_waitlist_placement_foundation.sql");
        expect(sql).toContain("placement_candidates_status_check");
        for (const v of ["active", "paused", "withdrawn", "placed"]) expect(sql).toContain(`'${v}'`);
    });
});

describe("BP authority — guard 5: unimplemented stage-condition vocabulary is not current runtime", () => {
    const UNIMPLEMENTED = ["membership_criteria_v1", "entry_conditions", "exit_conditions"];

    it("stays absent from the implementation, or this guard must be revisited", () => {
        // The guard's premise. If one of these ships, the docs may legitimately describe it as current.
        const searchRoots = ["web/lib", "web/app", "web/components"];
        const present = new Set<string>();
        const scan = (rel: string) => {
            const abs = path.join(repoRoot, rel);
            if (!existsSync(abs)) return;
            for (const entry of readdirSync(abs)) {
                const childRel = `${rel}/${entry}`;
                const st = statSync(path.join(repoRoot, childRel));
                if (st.isDirectory()) scan(childRel);
                else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
                    const text = readFileSync(path.join(repoRoot, childRel), "utf8");
                    for (const k of UNIMPLEMENTED) if (text.includes(k)) present.add(k);
                }
            }
        };
        searchRoots.forEach(scan);
        expect([...present]).toEqual([]);
    });

    it("current doctrine marks them proposed rather than live configuration", () => {
        for (const rel of currentDoctrineDocs()) {
            for (const line of read(rel).split("\n")) {
                for (const key of UNIMPLEMENTED) {
                    if (!line.includes(key)) continue;
                    const framedAsNotCurrent =
                        /propos|not implemented|no (TypeScript|implementation)|planned|successor|never as current/i.test(line);
                    expect(
                        framedAsNotCurrent,
                        `${rel}: ${key} presented as current runtime — ${line.trim().slice(0, 120)}`,
                    ).toBe(true);
                }
            }
        }
    });
});

describe("BP authority — guard 6: the D-BP1 bypass is not declared resolved before it converges", () => {
    const SENDERS = [
        "web/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel.tsx",
        "web/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
    ];

    /** A sender still participates in the bypass while it puts status_key on the wire. */
    const stillBypassing = () =>
        SENDERS.filter((rel) => existsSync(path.join(repoRoot, rel)) && /status_key/.test(read(rel)));

    it("while any sender remains, the debt is documented and not claimed closed", () => {
        if (stillBypassing().length === 0) return; // converged: the marker may be retired
        const bp = read("docs/platform/core/business-process-system.md");
        expect(bp).toMatch(/Direct status PATCH/i);
        expect(bp).toMatch(/implementation\s+debt/i);
        expect(bp).not.toMatch(/bypass (is|has been) (resolved|closed|removed|converged)/i);
    });

    it("while any sender remains, no doc claims outcome execution is the ONLY status writer", () => {
        if (stillBypassing().length === 0) return;
        const claim = /outcome execution is the only writer(?![^.\n]*full process semantics)/i;
        for (const rel of currentDoctrineDocs()) {
            expect(claim.test(read(rel)), `${rel} claims outcome execution is the only writer`).toBe(false);
        }
    });

    it("the transition gate is not described as universal while known paths bypass it", () => {
        const status = read("docs/platform/core/status-and-state-system.md");
        expect(status).toMatch(/not yet universal/i);
        expect(status).toMatch(/Bypasses today/i);
    });
});
