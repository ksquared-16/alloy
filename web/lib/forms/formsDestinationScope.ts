/**
 * FORMS WRITE DESTINATIONS — may this actor point a Forms write AT these subjects?
 *
 * R2 (hosted, Revision 3 personas): the read rule (`formSubmissionScope.ts`) guarded a write's CURRENT subject, but three
 * writes take their destination from the request:
 *   - `manual-link` re-points a submission's person / household / child / opportunity;
 *   - POS packet compose names an anchor AND the children and recipients its links are minted for;
 *   - a form public link carries caller metadata that names a launch source, a child, a recipient or an opportunity —
 *     metadata the public prefill and the submission's subject are later derived from.
 * A department-restricted actor could therefore write onto, or mint a prefilled link for, a record it cannot read.
 *
 * The rule is the read rule applied to the destination, never a new one:
 *   - every named SUBJECT must pass {@link formsSubjectInActorScope} (an opportunity's department/site decides; a child,
 *     household or person with no opportunity is unrestricted-only);
 *   - every named CHILD and RECIPIENT must belong to the in-scope opportunity's own household roster
 *     (the household's members; `recipientsForAnchor` — the recipients the composer offers), so an in-scope anchor cannot carry
 *     another department's child or parent. A child or recipient with no in-scope opportunity to anchor it is refused.
 * Unrestricted actors are unaffected (the function answers true without reading). A failed access context is no scope.
 * Callers answer a refusal with the same 404 a missing record gets, so nothing about the destination is disclosed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { accessScopeRestrictsData, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { formsSubjectInActorScope, type FormsSubjectRef } from "@/lib/forms/formSubmissionScope";
import { recipientsForAnchor, resolveAnchorContext } from "@/lib/pos/packet/posPacketRoster";

export type FormsWriteDestination = {
    /** Subjects the write is about (each must be in scope on its own). */
    subjects: FormsSubjectRef[];
    /** Children named in addition (composer children, selected children). */
    childIds?: string[];
    /** Recipients named in addition (composer recipients, recipient persons). */
    recipientIds?: string[];
    /** The in-scope opportunity whose household roster the children / recipients must belong to. */
    rosterOpportunityId?: string | null;
};

const id = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const uniq = (xs: readonly (string | null | undefined)[]) => [...new Set(xs.map(id).filter((x): x is string => Boolean(x)))];

export async function formsDestinationInActorScope(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    dest: FormsWriteDestination,
): Promise<boolean> {
    if (!scope) return false;
    if (!accessScopeRestrictsData(scope)) return true;
    for (const subject of dest.subjects) {
        if (!(await formsSubjectInActorScope(supabase, orgId, scope, subject))) return false;
    }
    const children = uniq(dest.childIds ?? []);
    const recipients = uniq(dest.recipientIds ?? []);
    if (children.length === 0 && recipients.length === 0) return true;
    const anchorOpp = id(dest.rosterOpportunityId);
    if (!anchorOpp || !(await formsSubjectInActorScope(supabase, orgId, scope, { opportunity_id: anchorOpp }))) return false;
    const anchor = await resolveAnchorContext(supabase, orgId, "opportunity", anchorOpp);
    if (children.length > 0) {
        // Membership of the household, active or not (the composer lists active children; the Enrollment selection
        // accepts any member of the account) — the boundary is the household, not the roster's display filter.
        if (!anchor.customer_id) return false;
        const { data } = await supabase.from("customer_members").select("id").eq("org_id", orgId).eq("customer_id", anchor.customer_id).in("id", children);
        const members = new Set(((data ?? []) as Array<{ id: string }>).map((r) => String(r.id)));
        if (!children.every((c) => members.has(c))) return false;
    }
    if (recipients.length > 0) {
        const roster = new Set((await recipientsForAnchor(supabase, orgId, anchor)).map((r) => r.person_id));
        if (!recipients.every((r) => roster.has(r))) return false;
    }
    return true;
}

/** Link metadata keys that name a subject (what `linkMetadataSubject`, the prefill and the submission FKs read). */
export const LINK_METADATA_SUBJECT_KEYS = [
    "source_entity_type", "source_entity_id", "opportunity_id", "anchor_opportunity_id",
    "composer_child_id", "selected_customer_member_id", "selected_customer_member_ids",
    "composer_recipient_id", "recipient_person_id",
] as const;

/**
 * The destination a link's caller-supplied metadata names: the launch source and any opportunity as subjects, and every
 * child / recipient key (arrays included — not just the first) checked against the opportunity's roster.
 */
export function linkMetadataDestination(metadata: Record<string, unknown>, launch: FormsSubjectRef | null = null): FormsWriteDestination {
    const subjects: FormsSubjectRef[] = launch ? [launch] : [];
    const sourceType = typeof metadata.source_entity_type === "string" ? metadata.source_entity_type.trim().toLowerCase().replace(/s$/, "") : "";
    const source = id(metadata.source_entity_id);
    const metaOpps = uniq([metadata.opportunity_id as string, metadata.anchor_opportunity_id as string, sourceType === "opportunity" ? source : null]);
    for (const o of metaOpps) subjects.push({ opportunity_id: o });
    if (source && sourceType && sourceType !== "opportunity") {
        subjects.push(
            sourceType === "customer_member" ? { customer_member_id: source }
            : sourceType === "person" ? { person_id: source }
            : { customer_id: source }, // customer, or an unrecognised type: unlinked, unrestricted-only
        );
    }
    const childIds = uniq([
        metadata.composer_child_id as string,
        metadata.selected_customer_member_id as string,
        ...(Array.isArray(metadata.selected_customer_member_ids) ? (metadata.selected_customer_member_ids as string[]) : []),
    ]);
    const recipientIds = uniq([metadata.composer_recipient_id as string, metadata.recipient_person_id as string]);
    const rosterOpportunityId = id(launch?.opportunity_id) ?? metaOpps[0] ?? null;
    return { subjects, childIds, recipientIds, rosterOpportunityId };
}
