import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    resolveOperationalStartDate,
    resolveRequestedStart,
} from "@/lib/enrollment/effectiveDateAuthority";

describe("assignment commitment authority — Start Date cert", () => {
    it("does not treat commitment_kind as a parallel lifecycle or status vocabulary", () => {
        const doctrine = readFileSync(
            join(process.cwd(), "../docs/platform/planning/assignment-proposed-commitment-authority.md"),
            "utf8",
        );
        expect(doctrine).toContain("commitment_kind = proposed");
        expect(doctrine).toContain("commitment_kind = committed");
        // Proposed is planning; committed is agreement-backed — not stage replacement.
        expect(doctrine).toMatch(/agreement-backed|enrollment_agreement/i);
    });

    it("Scenario 5 — Requested Start stays distinct from committed Start Date", () => {
        const requested = resolveRequestedStart({
            processInstanceMetadata: { start_date: "2026-08-01" },
        });
        const operational = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "sa-1",
                    start_date: "2026-09-15",
                    status: "active",
                    commitment_kind: "committed",
                },
            ],
        });
        expect(requested).toBe("2026-08-01");
        expect(operational.startDate).toBe("2026-09-15");
        expect(requested).not.toBe(operational.startDate);
    });

    it("later room/program schedule change does not rewrite original Start Date", () => {
        const afterChange = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "first",
                    start_date: "2026-09-15",
                    status: "superseded",
                    commitment_kind: "committed",
                },
                {
                    id: "room-change",
                    start_date: "2026-10-01",
                    status: "active",
                    commitment_kind: "committed",
                },
            ],
        });
        expect(afterChange.startDate).toBe("2026-09-15");
        expect(afterChange.assignmentId).toBe("first");
    });

    it("canceled-before-effective never qualifies; correction flag excludes original", () => {
        expect(
            resolveOperationalStartDate({
                committedAssignments: [
                    {
                        id: "canceled",
                        start_date: "2026-09-01",
                        status: "canceled",
                        commitment_kind: "committed",
                    },
                    {
                        id: "live",
                        start_date: "2026-09-20",
                        status: "planned",
                        commitment_kind: "committed",
                    },
                ],
            }).startDate,
        ).toBe("2026-09-20");

        expect(
            resolveOperationalStartDate({
                committedAssignments: [
                    {
                        id: "wrong",
                        start_date: "2026-09-01",
                        status: "active",
                        commitment_kind: "committed",
                        excluded_from_start_date: true,
                    },
                    {
                        id: "corrected",
                        start_date: "2026-09-10",
                        status: "active",
                        commitment_kind: "committed",
                    },
                ],
            }).assignmentId,
        ).toBe("corrected");
    });

    it("multi-child isolation — each child has independent Start Date resolution", () => {
        const childA = resolveOperationalStartDate({
            committedAssignments: [
                { id: "a1", start_date: "2026-09-01", status: "active", commitment_kind: "committed" },
            ],
        });
        const childB = resolveOperationalStartDate({
            committedAssignments: [
                { id: "b1", start_date: "2026-10-15", status: "active", commitment_kind: "committed" },
            ],
        });
        expect(childA.startDate).toBe("2026-09-01");
        expect(childB.startDate).toBe("2026-10-15");
        expect(childA.assignmentId).not.toBe(childB.assignmentId);
    });
});

describe("Enrollment Date ownership — paperwork outcome, not approve_enrollment", () => {
    it("stamp helper and outcome target exist; approve path is labeled compat", () => {
        const stamp = readFileSync(
            join(process.cwd(), "lib/enrollment/stampEnrollmentDateOnProcessInstances.ts"),
            "utf8",
        );
        const authority = readFileSync(
            join(process.cwd(), "lib/enrollment/effectiveDateAuthority.ts"),
            "utf8",
        );
        const executor = readFileSync(
            join(process.cwd(), "lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"),
            "utf8",
        );
        expect(stamp).toMatch(/paperwork-completion outcome|compat approve_enrollment/);
        expect(authority).toMatch(/paperwork_completion_outcome/);
        expect(authority).toMatch(/compat_approve_enrollment/);
        expect(executor).toMatch(/stamp_enrollment_date/);
    });
});
