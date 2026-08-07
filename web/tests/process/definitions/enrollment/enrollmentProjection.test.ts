/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildEnrollmentParticipants } from "@/lib/process/definitions/enrollment";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("enrollment projection stitch — PI ⋈ opportunity ⋈ customer_member → participants", () => {
    const piRows = [
        { id: "pi-a", org_id: "org-1", process_key: "enrollment", subject_type: "child", subject_id: "cm-a", context_id: "opp-1", stage_key: null, state: null, close_reason_key: null },
        { id: "pi-b", org_id: "org-1", process_key: "enrollment", subject_type: "child", subject_id: "cm-b", context_id: "opp-1", stage_key: "waitlist", state: "waitlisted", close_reason_key: null },
    ];
    const opps = [{ id: "opp-1", stage_key: "lead", status_key: "open", work_unit_id: "wu-1" }];
    const members = [
        { id: "cm-a", is_active: true },
        { id: "cm-b", is_active: false },
    ];

    it("resolves scopeId from the opportunity work unit and fills the enrollment attributes", () => {
        const [a, b] = buildEnrollmentParticipants(piRows, opps, members);
        expect(a.scopeId).toBe("wu-1"); // from opportunity.work_unit_id
        expect(a.contextStageKey).toBe("lead"); // from opportunity.stage_key (family track)
        expect(a.participantStageKey).toBeNull();
        expect(a.attributes).toEqual({ contextStatusKey: "open", subjectActive: true, waitlistRank: null });
        expect(b.participantStageKey).toBe("waitlist");
        expect(b.attributes.subjectActive).toBe(false); // is_active === false
    });

    it("drops PIs whose opportunity context is missing (no ghost Family Leads / Children)", () => {
        const out = buildEnrollmentParticipants(
            [
                {
                    id: "pi-x",
                    org_id: "org-1",
                    process_key: "enrollment",
                    subject_type: "child",
                    subject_id: "gone",
                    context_id: "missing",
                    stage_key: "tour",
                    state: null,
                    close_reason_key: null,
                },
            ],
            [],
            [],
        );
        expect(out).toEqual([]);
    });

    it("keeps participants when opportunity exists even if the child member row is gone", () => {
        const [p] = buildEnrollmentParticipants(
            [
                {
                    id: "pi-x",
                    org_id: "org-1",
                    process_key: "enrollment",
                    subject_type: "child",
                    subject_id: "gone",
                    context_id: "opp-1",
                    stage_key: null,
                    state: null,
                    close_reason_key: null,
                },
            ],
            [{ id: "opp-1", stage_key: "lead", status_key: "open", work_unit_id: "wu-1" }],
            [],
        );
        expect(p.scopeId).toBe("wu-1");
        expect(p.attributes.subjectActive).toBe(true); // absent member ⇒ treated active
        expect(p.attributes.contextStatusKey).toBe("open");
    });
});

describe("enrollment projection I/O columns", () => {
    it("does not select stage_entered_at (column not yet on process_instances)", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/process/definitions/enrollment/enrollmentProjection.ts"),
            "utf8",
        );
        expect(source).not.toMatch(/stage_entered_at/);
    });
});
