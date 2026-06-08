import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import {
    launchFkStampFromCrmSnapshotRecord,
    mergeLaunchFksPreferringSessionCrmSnapshot,
    mergeNonNullSubmissionFksIntoCrmSnapshot,
    syncPacketSessionCrmSnapshotFromSubmission,
} from "@/lib/forms/packets/formPacketService";

const PID = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";
const MID = "33333333-3333-4333-8333-333333333333";
const OID = "44444444-4444-4444-8444-444444444444";

describe("packet CRM continuity helpers", () => {
    it("launchFkStampFromCrmSnapshotRecord ignores invalid UUID strings", () => {
        expect(
            launchFkStampFromCrmSnapshotRecord({
                person_id: "not-a-uuid",
                customer_id: CID,
            })
        ).toEqual({
            person_id: null,
            customer_id: CID,
            customer_member_id: null,
            opportunity_id: null,
        });
    });

    it("mergeLaunchFksPreferringSessionCrmSnapshot prefers snapshot when set", () => {
        const launch: LaunchFkStamp = {
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
        };
        expect(
            mergeLaunchFksPreferringSessionCrmSnapshot(launch, {
                person_id: PID,
                customer_id: CID,
            })
        ).toEqual({
            person_id: PID,
            customer_id: CID,
            customer_member_id: null,
            opportunity_id: null,
        });
    });

    it("mergeLaunchFksPreferringSessionCrmSnapshot falls back to launch for gaps", () => {
        const launch: LaunchFkStamp = {
            person_id: PID,
            customer_id: null,
            customer_member_id: MID,
            opportunity_id: null,
        };
        expect(
            mergeLaunchFksPreferringSessionCrmSnapshot(launch, {
                customer_id: CID,
            })
        ).toEqual({
            person_id: PID,
            customer_id: CID,
            customer_member_id: MID,
            opportunity_id: null,
        });
    });

    it("mergeNonNullSubmissionFksIntoCrmSnapshot overlays non-null keys only", () => {
        expect(
            mergeNonNullSubmissionFksIntoCrmSnapshot(
                { person_id: PID, customer_id: "99999999-9999-4999-8999-999999999999", extra: 1 },
                {
                    person_id: PID,
                    customer_id: CID,
                    customer_member_id: null,
                    opportunity_id: OID,
                }
            )
        ).toEqual({
            person_id: PID,
            customer_id: CID,
            extra: 1,
            opportunity_id: OID,
        });
    });
});

describe("syncPacketSessionCrmSnapshotFromSubmission", () => {
    it("merges FKs when session is in_progress", async () => {
        let updatedPatch: Record<string, unknown> | null = null;
        const client = {
            from(table: string) {
                if (table === "form_packet_sessions") {
                    return {
                        select() {
                            return {
                                eq() {
                                    return {
                                        eq() {
                                            return {
                                                maybeSingle: async () => ({
                                                    data: {
                                                        status: "in_progress",
                                                        crm_snapshot: { person_id: PID },
                                                    },
                                                    error: null,
                                                }),
                                            };
                                        },
                                    };
                                },
                            };
                        },
                        update(patch: Record<string, unknown>) {
                            updatedPatch = patch;
                            return {
                                eq() {
                                    return {
                                        eq() {
                                            return {
                                                eq: async () => ({ error: null }),
                                            };
                                        },
                                    };
                                },
                            };
                        },
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        } as unknown as SupabaseClient;

        const r = await syncPacketSessionCrmSnapshotFromSubmission(client, "org", "sess", {
            person_id: PID,
            customer_id: CID,
            customer_member_id: null,
            opportunity_id: null,
        });
        expect(r.error).toBeNull();
        expect(updatedPatch).not.toBeNull();
        const patch = updatedPatch as unknown as Record<string, unknown>;
        const snap = patch.crm_snapshot as Record<string, unknown>;
        expect(snap.person_id).toBe(PID);
        expect(snap.customer_id).toBe(CID);
    });

    it("no-ops when session is not in_progress", async () => {
        let updateCalls = 0;
        const client = {
            from(table: string) {
                if (table === "form_packet_sessions") {
                    return {
                        select() {
                            return {
                                eq() {
                                    return {
                                        eq() {
                                            return {
                                                maybeSingle: async () => ({
                                                    data: {
                                                        status: "completed",
                                                        crm_snapshot: {},
                                                    },
                                                    error: null,
                                                }),
                                            };
                                        },
                                    };
                                },
                            };
                        },
                        update() {
                            updateCalls += 1;
                            throw new Error("should not update");
                        },
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        } as unknown as SupabaseClient;

        const r = await syncPacketSessionCrmSnapshotFromSubmission(client, "org", "sess", {
            person_id: PID,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
        });
        expect(r.error).toBeNull();
        expect(updateCalls).toBe(0);
    });
});
