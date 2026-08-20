/**
 * A participant corrects a fact they already settled, from the artifact review.
 *
 * ## Why this exists alongside the turn command
 *
 * `applyParticipantTurnResponse` answers the turn the runtime is CURRENTLY asking. An edit at review
 * is not that: shared collection is over, and the parent is changing something already resolved.
 * Routing it through the turn command would mean pretending the runtime had asked, which it had not.
 *
 * So this is the same write, addressed differently — and deliberately the same write. It merges into
 * `form_packet_sessions.shared_values` through `shallowMergeSharedValues`, exactly as the turn
 * command does, so a corrected fact reaches every bound occurrence by the settled prefill path
 * rather than being patched into one artifact's submission.
 *
 * ## D-99 needs no invalidation step — but the edit IS a confirmation
 *
 * A confirmation is bound to a value FINGERPRINT. Change the value and the recorded confirmation
 * simply stops matching — `confirmationSatisfiesCurrentValue` returns false and the need re-opens as
 * `known_requires_confirmation` on the next recompute. There is no flag to clear and no way to
 * forget to clear it, which is why the correction path needs no bespoke invalidation.
 *
 * That same mechanism is why this write must ALSO record a confirmation of the new value, exactly
 * as the turn path does for a corrected confirm-turn (`confirm_value` writes evidence + value
 * together). A parent typing a value at review is the strongest confirmation the platform can get;
 * writing only the value would invalidate the old evidence, re-open the need, and send the
 * conversation back to ask "is 2021-08-09 correct?" about the value they typed three seconds ago.
 * That loop was observed live before this was added.
 *
 * ## What it will not do
 *
 * It writes only where the field carries a canonical binding. An unbound control has no shared
 * identity, so nothing may claim its value on the shared namespace — that control belongs to its
 * artifact and is edited there, through Forms.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalKeyFor } from "@/lib/pos/packet/packetFieldPlan";
import { shallowMergeSharedValues } from "@/lib/forms/packets/formPacketService";
import { buildEnrollmentNeedConfirmationPatch } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

export type ParticipantValueEditResult =
    | {
          readonly ok: true;
          readonly sharedKey: string;
          /** The session's post-write moving state, so the caller can recompute purely. */
          readonly postWrite: {
              readonly shared_values: Record<string, unknown>;
              readonly metadata: Record<string, unknown>;
          };
      }
    | { readonly ok: false; readonly refusal: { readonly code: string; readonly detail: string } };

/** The shared key a form field writes to, or null when the field is the artifact's own. */
export function sharedKeyForFieldId(schema: FormSchemaV1, fieldId: string): string | null {
    let key: string | null = null;
    walkScalarFormFields(schema, (field) => {
        if (field.id !== fieldId || key) return;
        const resolved = canonicalKeyFor(field);
        if (resolved.basis === "unbound") return;
        key = resolved.shared_value_key ?? resolved.key;
    });
    return key;
}

export async function applyParticipantValueEdit(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly sharedKey: string;
        /**
         * The need identity key (`scope:subject:canonical_key`) this value settles, when the
         * runtime tracks one — the D-99 confirmation of the edited value is recorded under it.
         * Null when no need carries this key; the value still writes, and nothing is confirmed.
         */
        readonly needKey: string | null;
        readonly value: unknown;
        readonly nowIso: string;
    },
): Promise<ParticipantValueEditResult> {
    const { data, error } = await supabase
        .from("form_packet_sessions")
        .select("shared_values, metadata")
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (error) return { ok: false, refusal: { code: "read_failed", detail: error.message } };
    if (!data) return { ok: false, refusal: { code: "no_session", detail: "Session not found." } };

    const row = data as {
        shared_values?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
    };

    const patch: Record<string, unknown> = {
        shared_values: shallowMergeSharedValues((row.shared_values ?? {}) as Record<string, unknown>, {
            [input.sharedKey]: input.value,
        }),
    };
    if (input.needKey) {
        const metadata = buildEnrollmentNeedConfirmationPatch({
            metadata: row.metadata ?? {},
            needKey: input.needKey,
            confirmedValue: input.value,
            confirmedAtIso: input.nowIso,
        });
        if (metadata) patch.metadata = metadata;
    }

    const { error: writeError } = await supabase
        .from("form_packet_sessions")
        .update(patch)
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId);
    if (writeError) return { ok: false, refusal: { code: "write_failed", detail: writeError.message } };

    return {
        ok: true,
        sharedKey: input.sharedKey,
        postWrite: {
            shared_values: patch.shared_values as Record<string, unknown>,
            metadata: (patch.metadata ?? row.metadata ?? {}) as Record<string, unknown>,
        },
    };
}
