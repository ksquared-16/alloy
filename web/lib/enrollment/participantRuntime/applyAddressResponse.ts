/**
 * One address the family gave, written through the path every other fact uses.
 *
 * ## No second destination
 *
 * Each part is a canonical Person field, and each write lands on the SAME shared key a scalar bound
 * to that field would use. So an address collected here and the same fact collected anywhere else
 * are one value — correcting it once corrects it everywhere, and nothing about this interaction
 * creates an address store, an address writer, or a second copy to keep in step.
 *
 * ## What is NOT written
 *
 * A part the family did not touch. The card sends only the boxes it holds, and a missing key means
 * "they did not say" rather than "they cleared it" — which is what stops a correction to one line
 * from wiping a city Alloy already held. An empty string IS a clear, because the family emptied a
 * box on purpose.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { shallowMergeSharedValues } from "@/lib/forms/packets/formPacketService";
import { addressWrites, type ParticipantAddress } from "@/lib/enrollment/informationNeeds/participantAddress";

export type ApplyAddressResult =
    | { ok: true; sharedValues: Record<string, unknown>; written: string[] }
    | { ok: false; error: string };

export async function applyAddressResponse(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly address: ParticipantAddress;
        /** Keyed by address PART (`address_line1`, `city`, …) — never by a schema field id. */
        readonly submitted: Readonly<Record<string, unknown>>;
    },
): Promise<ApplyAddressResult> {
    const writes = addressWrites(input.address, input.submitted);
    if (Object.keys(writes).length === 0) {
        return { ok: false, error: "That address had nothing to save." };
    }

    const { data: row, error: readError } = await supabase
        .from("form_packet_sessions")
        .select("shared_values")
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (!row) return { ok: false, error: "Session not found." };

    const sharedValues = shallowMergeSharedValues(
        ((row as { shared_values?: unknown }).shared_values ?? {}) as Record<string, unknown>,
        writes,
    );
    const { error } = await supabase
        .from("form_packet_sessions")
        .update({ shared_values: sharedValues })
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId);
    if (error) return { ok: false, error: error.message };

    return { ok: true, sharedValues, written: Object.keys(writes) };
}
