import "server-only";

/**
 * DURABLE PERSON SUBJECT — the server composition.
 *
 * Answers "what is true about this person?" for a record attended SUBJECT-FIRST: no provisioning
 * answer, no queue membership, no active Work Unit, and no Opportunity — fabricated or otherwise.
 * A staff member created the canonical way (`staff.add` writes `persons` + `employments` and nothing
 * else) has none of those things and must still open.
 *
 * ── IT COMPOSES NOTHING OF ITS OWN ──
 *
 * The person payload is `buildPersonDrawerEntityPayloadForViewModel` — the same canonical composer
 * the person record already uses, which itself calls `buildPersonEmploymentComposition`. Employment
 * meaning (`is_staff`, `current`, `state_label`, the configured facts) arrives DECIDED by
 * `lib/employment` and is carried verbatim. Nothing here recomputes employment, and nothing computes
 * it at case grain: `buildCaseEmploymentProjection` is the *case's* projection of the same
 * person-owned truth, and this path deliberately does not go through it.
 *
 * ── WHY THE MODULE PATH SAYS `drawer` AND THAT IS FINE ──
 *
 * `buildPersonDrawerEntityPayloadForViewModel` predates the drawer's removal; its name records where
 * it used to be rendered, not what it is. It is a payload composer with no drawer dependency. See
 * `focus-panel-architecture-vocabulary.md` on what "drawer" means in a path name.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { buildPersonDrawerEntityPayloadForViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerEntityPayloadForViewModel";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import {
    personEmploymentSignal,
    type DurablePersonSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";

export type ComposeDurablePersonSubjectResult =
    | { ok: true; subject: DurablePersonSubject }
    | { ok: false; reason: "not_found" };

import { resolveIdentityPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

export async function composeDurablePersonSubject(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    dimensions?: AdminAccessScopeDimensions | null,
): Promise<ComposeDurablePersonSubjectResult> {
    const id = personId.trim();
    if (!id) return { ok: false, reason: "not_found" };

    // `full` depth: this surface IS the record, so there is no above-fold/below-fold split to defer.
    const payload = await buildPersonDrawerEntityPayloadForViewModel(
        supabase,
        orgId,
        id,
        dimensions ?? null,
        "full",
    );
    if (!payload.ok) return { ok: false, reason: "not_found" };

    const truth = payload.record;
    const label = trimOrNull(truth._person_name) ?? "Person";
    const composition = (truth._employment ?? null) as PersonEmploymentComposition | null;

    return {
        ok: true,
        subject: {
            personId: id,
            label,
            truth,
            // Provenance matters: the resolver distinguishes an actor-authorized URL from one found
            // in storage, so the shell never renders a credential it was not granted.
            imageUrl: resolveIdentityPhotoUrlFromRaw(truth),
            employment: personEmploymentSignal(id, label, composition),
        },
    };
}
