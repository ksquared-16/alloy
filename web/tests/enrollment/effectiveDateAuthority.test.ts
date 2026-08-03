import { describe, expect, it } from "vitest";
import {
    EFFECTIVE_DATE_LABELS,
    assignmentQualifiesForStartDate,
    mergeEnrollmentDateOntoProcessMetadata,
    resolveEnrollmentDate,
    resolveOperationalStartDate,
    resolvePreferredWeekdays,
    resolveRequestedDaysPerWeek,
    resolveRequestedStart,
} from "@/lib/enrollment/effectiveDateAuthority";

describe("effectiveDateAuthority — Requested Start", () => {
    it("prefers process-instance participation start over OCM and opportunity overlays", () => {
        expect(
            resolveRequestedStart({
                processInstanceMetadata: { start_date: "2026-09-01" },
                ocmStartDate: "2026-08-01",
                opportunityDesiredStartDate: "2026-07-01",
            }),
        ).toBe("2026-09-01");
    });

    it("falls back to OCM then opportunity desired start", () => {
        expect(resolveRequestedStart({ ocmStartDate: "2026-08-15" })).toBe("2026-08-15");
        expect(resolveRequestedStart({ opportunityDesiredStartDate: "2026-07-20T12:00:00Z" })).toBe(
            "2026-07-20",
        );
    });
});

describe("effectiveDateAuthority — Start Date from first committed assignment", () => {
    it("uses earliest committed assignment start, ignoring proposed and canceled", () => {
        const resolved = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "b",
                    start_date: "2026-10-01",
                    status: "active",
                    commitment_kind: "committed",
                },
                {
                    id: "a",
                    start_date: "2026-09-15",
                    status: "planned",
                    commitment_kind: "committed",
                },
                {
                    id: "p",
                    start_date: "2026-09-01",
                    status: "planned",
                    commitment_kind: "proposed",
                },
                {
                    id: "c",
                    start_date: "2026-08-01",
                    status: "canceled",
                    commitment_kind: "committed",
                },
            ],
            agreementStartDate: "2026-09-20",
        });
        expect(resolved).toEqual({
            startDate: "2026-09-15",
            source: "committed_assignment",
            assignmentId: "a",
        });
    });

    it("keeps original Start Date when a later supersede changes room/schedule", () => {
        const resolved = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "first",
                    start_date: "2026-09-15",
                    status: "superseded",
                    commitment_kind: "committed",
                },
                {
                    id: "second",
                    start_date: "2026-11-01",
                    status: "active",
                    commitment_kind: "committed",
                },
            ],
        });
        expect(resolved.startDate).toBe("2026-09-15");
        expect(resolved.assignmentId).toBe("first");
    });

    it("falls back to agreement start when no committed assignment exists", () => {
        expect(
            resolveOperationalStartDate({
                committedAssignments: [
                    {
                        id: "p",
                        start_date: "2026-09-01",
                        status: "planned",
                        commitment_kind: "proposed",
                    },
                ],
                agreementStartDate: "2026-09-20",
            }),
        ).toEqual({
            startDate: "2026-09-20",
            source: "agreement_fallback",
            assignmentId: null,
        });
    });

    it("excludes correction-flagged rows", () => {
        expect(
            assignmentQualifiesForStartDate({
                id: "x",
                start_date: "2026-01-01",
                status: "active",
                commitment_kind: "committed",
                excluded_from_start_date: true,
            }),
        ).toBe(false);
    });
});

describe("effectiveDateAuthority — Enrollment Date", () => {
    it("prefers process-instance over opportunity compat projection", () => {
        expect(
            resolveEnrollmentDate({
                processInstanceMetadata: { enrollment_date: "2026-06-01" },
                opportunityMetadata: { enrollment_date: "2026-05-01" },
            }),
        ).toEqual({ enrollmentDate: "2026-06-01", source: "process_instance" });
    });

    it("stamps once from paperwork completion and refuses silent overwrite", () => {
        const first = mergeEnrollmentDateOntoProcessMetadata(
            { start_date: "2026-09-01" },
            {
                enrollment_date: "2026-06-10",
                source: "paperwork_completion_outcome",
                stamped_at: "2026-06-10T15:00:00Z",
                actor_user_id: "user-1",
            },
        );
        expect(first.wrote).toBe(true);
        expect(first.metadata.enrollment_date).toBe("2026-06-10");

        const second = mergeEnrollmentDateOntoProcessMetadata(first.metadata, {
            enrollment_date: "2026-06-20",
            source: "paperwork_completion_outcome",
            stamped_at: "2026-06-20T15:00:00Z",
        });
        expect(second.wrote).toBe(false);
        expect(second.refusedOverwrite).toBe(true);
        expect(second.metadata.enrollment_date).toBe("2026-06-10");
    });

    it("allows authorized correction with prior value evidence", () => {
        const base = mergeEnrollmentDateOntoProcessMetadata(
            {},
            {
                enrollment_date: "2026-06-10",
                source: "paperwork_completion_outcome",
                stamped_at: "2026-06-10T15:00:00Z",
            },
        );
        const corrected = mergeEnrollmentDateOntoProcessMetadata(base.metadata, {
            enrollment_date: "2026-06-12",
            source: "authorized_correction",
            stamped_at: "2026-06-15T12:00:00Z",
            actor_user_id: "admin-1",
            reason: "Packet completed two days later than first stamp",
        });
        expect(corrected.wrote).toBe(true);
        expect(corrected.metadata.enrollment_date).toBe("2026-06-12");
        const evidence = corrected.metadata.enrollment_date_evidence as Record<string, unknown>;
        expect(evidence.previous_enrollment_date).toBe("2026-06-10");
        expect(evidence.reason).toContain("Packet completed");
    });
});

describe("effectiveDateAuthority — requested care", () => {
    it("reads requested days independently of preferred weekdays", () => {
        const meta = { requested_days_per_week: 3, weekdays: [1, 3, 5] };
        expect(resolveRequestedDaysPerWeek(meta)).toBe(3);
        expect(resolvePreferredWeekdays(meta)).toEqual([1, 3, 5]);
        expect(resolveRequestedDaysPerWeek({ requested_days_per_week: "2" })).toBe(2);
        expect(resolvePreferredWeekdays({})).toEqual([]);
    });

    it("keeps operator labels distinct", () => {
        expect(EFFECTIVE_DATE_LABELS.requestedStart).toBe("Requested Start");
        expect(EFFECTIVE_DATE_LABELS.startDate).toBe("Start Date");
        expect(EFFECTIVE_DATE_LABELS.enrollmentDate).toBe("Enrollment Date");
        expect(EFFECTIVE_DATE_LABELS.proposedSchedule).not.toBe(EFFECTIVE_DATE_LABELS.committedSchedule);
    });
});
