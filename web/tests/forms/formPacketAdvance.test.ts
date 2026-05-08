import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    advancePacketSessionAfterSubmit,
    shallowMergeSharedValues,
    findActivePacketSessionItem,
    type PacketSessionItemRow,
} from "@/lib/forms/packets/formPacketService";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESS = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const SUB = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";

function makeAdvanceClient(scenario: "hasNext" | "last" | "wrongOrg") {
    const itemsAfterList =
        scenario === "hasNext"
            ? [
                  { id: "a", sequence_index: 0, status: "submitted" },
                  { id: "b", sequence_index: 1, status: "pending" },
              ]
            : [{ id: "a", sequence_index: 0, status: "submitted" }];

    const session =
        scenario === "wrongOrg"
            ? null
            : {
                  id: SESS,
                  org_id: ORG,
                  status: "in_progress",
                  shared_values: { existing: 1 },
              };

    return {
        from(table: string) {
            if (table === "form_packet_session_items") {
                return {
                    select() {
                        return {
                            eq(col: string) {
                                if (col === "form_submission_id") {
                                    return {
                                        maybeSingle: async () => ({
                                            data: {
                                                id: "itemA",
                                                packet_session_id: SESS,
                                                sequence_index: 0,
                                                status: "active",
                                            },
                                            error: null,
                                        }),
                                    };
                                }
                                if (col === "packet_session_id") {
                                    return {
                                        eq() {
                                            return {
                                                order() {
                                                    return Promise.resolve({ data: itemsAfterList, error: null });
                                                },
                                            };
                                        },
                                    };
                                }
                                throw new Error(`unexpected eq col ${col}`);
                            },
                        };
                    },
                    update() {
                        return {
                            eq() {
                                return {
                                    eq: async () => ({ error: null }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_packet_sessions") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({ data: session, error: null }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                    update() {
                        return {
                            eq() {
                                return {
                                    eq: async () => ({ error: null }),
                                };
                            },
                        };
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    } as unknown as SupabaseClient;
}

describe("formPacketService packet advance", () => {
    it("shallowMergeSharedValues overlays keys", () => {
        expect(shallowMergeSharedValues({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
        expect(shallowMergeSharedValues({ a: 1 }, { a: 9 })).toEqual({ a: 9 });
    });

    it("findActivePacketSessionItem picks active row", () => {
        const rows: PacketSessionItemRow[] = [
            {
                id: "1",
                packet_session_id: SESS,
                packet_item_id: "p",
                sequence_index: 0,
                status: "submitted",
                form_submission_id: null,
            },
            {
                id: "2",
                packet_session_id: SESS,
                packet_item_id: "q",
                sequence_index: 1,
                status: "active",
                form_submission_id: null,
            },
        ];
        expect(findActivePacketSessionItem(rows)?.id).toBe("2");
    });

    it("advancePacketSessionAfterSubmit returns next_form_available when another step exists", async () => {
        const supabase = makeAdvanceClient("hasNext");
        const r = await advancePacketSessionAfterSubmit(supabase, ORG, SUB, { x: "y" });
        expect(r.error).toBeNull();
        expect(r.result).toMatchObject({
            packet_complete: false,
            next_form_available: true,
            next_sequence_index: 1,
        });
    });

    it("advancePacketSessionAfterSubmit completes packet on final step", async () => {
        const supabase = makeAdvanceClient("last");
        const r = await advancePacketSessionAfterSubmit(supabase, ORG, SUB, { x: "y" });
        expect(r.error).toBeNull();
        expect(r.result).toMatchObject({
            packet_complete: true,
            next_form_available: false,
            next_sequence_index: null,
        });
    });

    it("advancePacketSessionAfterSubmit rejects missing session for org scope", async () => {
        const supabase = makeAdvanceClient("wrongOrg");
        const r = await advancePacketSessionAfterSubmit(supabase, ORG, SUB, {});
        expect(r.result).toBeNull();
        expect(r.error?.message).toContain("Packet session not found");
    });
});
