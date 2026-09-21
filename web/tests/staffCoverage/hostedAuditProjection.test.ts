/**
 * The audit projection, run over the REAL hosted lineage.
 *
 * Coverage keeps no event table — the lineage is the audit — so the hosted proof
 * for "the five operations are distinguishable" cannot be a query against an
 * events relation. It has to be the projection itself, fed the rows staging
 * actually holds. Those rows arrive as a census artifact, so this test reads the
 * evidence file rather than a database: the projection is pure, and pointing it
 * at a live connection would prove less, not more.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import { projectCoverageAudit } from "@/lib/staffCoverage/staffCoverageAudit";
import type { CoverageAllocation } from "@/lib/staffCoverage/staffCoverageService";

const EVIDENCE = resolve(
    __dirname,
    "../../../certification/migrations/coverage-hosted-lifecycle-4.sql.results.json"
);

type CensusRow = {
    id: string; state: string; transition: string | null;
    supersedes: string | null; root: string | null;
    start: string; end: string; room: string | null; site: string;
    created_by: string | null; created_at: string;
    cancelled_by: string | null; cancelled_at: string | null;
    reason: string | null; cancel_reason: string | null; source: string;
};

function load(): CoverageAllocation[] {
    const raw = JSON.parse(readFileSync(EVIDENCE, "utf8"));
    const rows = raw.results.questions.coverage_lifecycle_final.rows[0].lineage as CensusRow[];
    return rows.map((r) => ({
        id: r.id, orgId: "", employmentId: "hosted", serviceDate: "2027-04-01",
        startTime: r.start.slice(0, 5), endTime: r.end.slice(0, 5),
        siteLocationId: r.site, roomLocationId: r.room,
        lifecycleState: r.state as CoverageAllocation["lifecycleState"],
        transitionType: r.transition as CoverageAllocation["transitionType"],
        supersedesCoverageId: r.supersedes, lineageRootId: r.root,
        reasonKey: r.reason, cancelReasonKey: r.cancel_reason, note: null, sourceKey: r.source,
        createdBy: r.created_by, createdAt: r.created_at,
        cancelledBy: r.cancelled_by, cancelledAt: r.cancelled_at,
    }));
}

describe.runIf(existsSync(EVIDENCE))("hosted coverage audit projection", () => {
    it("names all five operations over the lineage staging actually holds", () => {
        const all = load();
        // The QA date carries three independent lineages; the audited one is the
        // chain that was revised, corrected and then cancelled.
        const root = all.find((r) => r.lifecycleState === "cancelled")?.lineageRootId;
        expect(root).toBeTruthy();
        const lineage = all.filter((r) => (r.lineageRootId ?? r.id) === root);
        expect(lineage.length).toBe(3);

        const events = projectCoverageAudit(lineage);
        const ops = events.map((e) => e.operation);
        expect(new Set(ops)).toEqual(
            new Set(["CREATED", "REVISED", "CORRECTED", "SUPERSEDED", "CANCELLED"])
        );
        expect(ops.filter((o) => o === "SUPERSEDED").length).toBe(2);

        for (const e of events) {
            expect(e.occurredAt, `${e.operation} needs a moment`).toBeTruthy();
            expect(e.actorUserId, `${e.operation} needs an actor`).toBeTruthy();
            expect(e.lineageRootId).toBe(root);
        }

        const byOp = (o: string) => events.find((e) => e.operation === o)!;
        expect(byOp("REVISED").reasonKey).toBe("qa_revision");
        expect(byOp("CORRECTED").reasonKey).toBe("qa_correction");
        // The cancellation reports its own reason; the correction keeps the one
        // it was authored with. Before the cancel-reason repair these were the
        // same field, and cancelling a correction erased why it existed.
        expect(byOp("CANCELLED").reasonKey).toBe("qa_cleanup");
        // A correction must stay distinguishable from a genuine change of plan.
        expect(byOp("REVISED").coverageId).not.toBe(byOp("CORRECTED").coverageId);
    });
});
