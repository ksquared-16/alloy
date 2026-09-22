/**
 * THE ATTENTION SUBJECT IS AN INPUT, NOT A CREDENTIAL.
 *
 * Carrying the subject of attention on the Drawer request means a caller can now WRITE it — the
 * query parameter is whatever the client sends. That makes this an authorization and data-attribution
 * boundary, not merely a plumbing detail: naming another family's child must not cause producers to
 * read that child.
 *
 * The route does not validate it and must not try to. It hands the value to the canonical resolver,
 * which already refuses a participation that does not belong to the record under view — the same
 * refusal that protects a stale selection surviving a navigation. These tests hold that line at both
 * layers: the resolver refuses, and the producers, given the refusal, read nothing.
 */

import { resolveFinancialSubjectIdFromTruth } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import { describe, expect, it, vi } from "vitest";

import { resolveParticipantScope } from "@/lib/adminV2/runtime/operationalContext/resolveParticipantScope";

const FAMILY_A_CHILD = "1054ae3e-cc6d-4ae5-8797-92c331bb360a";
const FAMILY_A_CHILD_MEMBER = "aa11bb22-0000-4000-8000-00000000mem1";
const FAMILY_B_CHILD = "50b19065-51fd-41e4-83c9-07ba787759f0";

const familyAParticipants = [
    { id: FAMILY_A_CHILD, customerMemberId: FAMILY_A_CHILD_MEMBER, name: "Child A" },
];

describe("a foreign participation resolves to no scope", () => {
    it("refuses a child that belongs to another family", () => {
        const result = resolveParticipantScope({
            selectedParticipationId: FAMILY_B_CHILD,
            participants: familyAParticipants,
        });
        expect(result.scope).toBeNull();
        expect(result.reason).toBe("not_found");
    });

    it("does NOT fall back to the sole participant when a foreign child is named", () => {
        /*
         * THE DANGEROUS SHAPE, stated explicitly.
         *
         * A single-child family is exactly where a lenient resolver would answer "well, there is only
         * one — here it is", turning a rejected request into a successful read of Child A's data by a
         * caller who asked for Child B. The refusal must win over the convenience.
         */
        const result = resolveParticipantScope({
            selectedParticipationId: FAMILY_B_CHILD,
            participants: familyAParticipants,
        });
        expect(result.reason).not.toBe("sole_participant");
        expect(result.scope).toBeNull();
    });

    it("still resolves the family's OWN child, by participation id or by member id", () => {
        // The boundary must refuse foreigners without breaking the legitimate case.
        expect(
            resolveParticipantScope({ selectedParticipationId: FAMILY_A_CHILD, participants: familyAParticipants })
                .scope?.participationId,
        ).toBe(FAMILY_A_CHILD);
        expect(
            resolveParticipantScope({
                selectedParticipationId: FAMILY_A_CHILD_MEMBER,
                participants: familyAParticipants,
            }).scope?.customerMemberId,
        ).toBe(FAMILY_A_CHILD_MEMBER);
    });
});

describe("given no scope, the producers read nothing", () => {
    it("returns `unavailable` and never queries for a member", async () => {
        const buildAttendanceCardVM = vi.fn();
        vi.doMock("@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM", () => ({
            buildAttendanceCardVM,
        }));
        const { projectFocusPanelCardProducers } = await import(
            "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers"
        );

        const results = await projectFocusPanelCardProducers({
            supabase: {} as never,
            orgId: "org-1",
            // What a refused foreign participation produces: a context with no participant scope.
            context: { participantScope: null } as never,
            financialSubjectId: resolveFinancialSubjectIdFromTruth((({ participantScope: null } as never) as { truth?: Record<string, unknown> }).truth ?? {}),
            // The route's resolved caller authority. Irrelevant to this test's claim — with no scope
            // there is nothing to read for at all — but the producer requires it, because a producer
            // that could run without the caller's authority is the defect that contract prevents.
            access: { permissionKeys: [] } as never,
        });

        expect(results.attendance.state).toBe("unavailable");
        expect(results.attendance.data).toBeNull();
        // The strong claim: not merely an empty answer, but no read attempted at all.
        expect(buildAttendanceCardVM).not.toHaveBeenCalled();
        vi.doUnmock("@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM");
    });
});
