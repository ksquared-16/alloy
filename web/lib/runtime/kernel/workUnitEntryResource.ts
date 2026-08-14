/**
 * The Entry Resource binding: K2 asks D1 for truth.
 *
 * Kernel §K2: "← Entry Resources / Records: asks them for truth." K2 does not know how truth is
 * made; D1 does not know when it is asked. This module is the only place the two meet, and it is
 * deliberately tiny — it maps an AttentionRef onto the D1 Preparation request and nothing else.
 *
 * Note what is NOT here: no route, no mount, no DOM, no lane. The Attention ref carries the whole
 * cause (tenant, principal, target, lens, subject), which is why preparation can begin at the
 * gesture rather than after a destination exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttentionRef } from "./attention";
import type { EntryResource } from "./provisioning";
import { composeWorkUnitProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { parseCardFocusAspect } from "./attentionCardFocus";

export function workUnitEntryResource(deps: {
    supabase: SupabaseClient;
    currentUserId?: string | null;
}): EntryResource {
    return async (ref: AttentionRef) => {
        // CONTEXTUAL FOCUS, READ FROM WHAT ATTENTION STATES — never from what it omits. `ref.cohort`
        // is the operator's stated answer to "did you choose a cohort". `ref.lens == null` is a
        // different sentence — "you did not name one" — and it is what nearly every link has always
        // sent, so treating it as the same thing would make half the product contextual by accident.
        const contextual = ref.cohort === "none";
        // The ASPECT is the kernel's encoding of card + row. Parsed once here so the answer carries it
        // structured and the panel is told which card was asked for, rather than re-reading a string.
        const cardFocus = contextual ? parseCardFocusAspect(ref.aspect) : null;
        return composeWorkUnitProvisioningAnswer({
            supabase: deps.supabase,
            // U-P1: tenant/principal come from Attention, resolved once upstream by the route gate.
            orgId: ref.tenant,
            currentUserId: deps.currentUserId ?? ref.principal,
            workUnitSlug: ref.target,
            // Attention is the INPUT. The resource never derives the lens or subject from a route.
            requestedWorkViewId: ref.lens,
            requestedSubjectId: ref.subject,
            mode: contextual ? "contextual_focus" : "operational",
            requestedAspect: cardFocus ? { cardKey: cardFocus.card_key, itemId: cardFocus.item_id } : null,
        });
    };
}
