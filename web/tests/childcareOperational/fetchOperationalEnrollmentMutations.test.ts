import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    cancelChildEnrollmentAgreementBeforeStart,
    markChildEnrollmentAgreementEnded,
    markChildEnrollmentAgreementEnding,
    submitChildPlacement,
    submitScheduleAssignment,
} from "@/lib/childcareOperational/fetchOperationalEnrollmentMutations";

describe("fetchOperationalEnrollmentMutations", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("submitChildPlacement posts supersede payload", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ placement: { id: "pl-1" } }),
        });

        await submitChildPlacement({
            enrollment_agreement_id: "agr-1",
            start_date: "2026-07-01",
            supersede: true,
            program_category_id: "prog-1",
            room_location_id: "room-1",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/child-placements",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: "agr-1",
                    start_date: "2026-07-01",
                    supersede: true,
                    program_category_id: "prog-1",
                    room_location_id: "room-1",
                    reason_key: null,
                    source_key: "operator_edit",
                }),
            })
        );
    });

    it("submitScheduleAssignment posts supersede payload", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ assignment: { id: "sa-1" } }),
        });

        await submitScheduleAssignment({
            enrollment_agreement_id: "agr-1",
            schedule_pattern_id: "pat-1",
            start_date: "2026-08-01",
            supersede: true,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/schedule-assignments",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    enrollment_agreement_id: "agr-1",
                    schedule_pattern_id: "pat-1",
                    start_date: "2026-08-01",
                    supersede: true,
                    source_key: "operator_edit",
                }),
            })
        );
    });

    it("markChildEnrollmentAgreementEnding posts end_date", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ agreement: { id: "agr-1", status: "ending" } }),
        });

        await markChildEnrollmentAgreementEnding("agr-1", "2026-09-01");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/child-enrollment-agreements/agr-1/ending",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ end_date: "2026-09-01" }),
            })
        );
    });

    it("markChildEnrollmentAgreementEnded posts to ended route", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ agreement: { id: "agr-1", status: "ended" } }),
        });

        await markChildEnrollmentAgreementEnded("agr-1");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/child-enrollment-agreements/agr-1/ended",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("cancelChildEnrollmentAgreementBeforeStart posts to cancel route", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ agreement: { id: "agr-1", status: "canceled" } }),
        });

        await cancelChildEnrollmentAgreementBeforeStart("agr-1");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/child-enrollment-agreements/agr-1/cancel",
            expect.objectContaining({ method: "POST" })
        );
    });
});
