/**
 * Family Packet model — pure planners.
 *
 * The correct model is NOT link-centric (one packet per child-recipient pair). It is:
 *
 *   Packet Definition
 *     → Packet Instance (household / opportunity context)
 *         → Selected Children
 *         → Recipient Access Records (one token per recipient, SAME instance)
 *         → Shared (household) answers · Child-scoped answers · Recipient signatures
 *
 * Siblings share ONE experience: household questions asked once, child questions per child,
 * signatures per recipient. These planners produce that structure; the runtime persists it
 * (see the design report for the metadata-vs-migration assessment). Pure, no I/O.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { partitionFieldsByScope, type FieldScope } from "@/lib/forms/fieldScope";

export interface FamilyAnchor {
    entity_type: "opportunity" | "customer" | "person" | "customer_member";
    entity_id: string;
    opportunity_id?: string | null;
    customer_id?: string | null;
}

export interface FamilyChild {
    customer_member_id: string;
    label?: string;
}
export interface FamilyRecipient {
    person_id: string;
    label?: string;
}

export interface FamilyPacketForm {
    form_id: string;
    schema?: Pick<FormSchemaV1, "fields"> & Partial<Pick<FormSchemaV1, "sections" | "title" | "schema_version">>;
}

/** One recipient's access to the SAME packet instance (their own token, shared answers). */
export interface RecipientAccess {
    recipient_person_id: string;
    label?: string;
    /** Stable key for the recipient's access record within the instance. */
    access_key: string;
}

export interface FamilyPacketInstancePlan {
    /** Stable key grouping all recipient tokens + sessions for this launch. */
    instance_key: string;
    anchor: FamilyAnchor;
    children: FamilyChild[];
    /** One access record per recipient — NOT one packet per child-recipient pair. */
    recipient_access: RecipientAccess[];
    form_ids: string[];
    warnings: string[];
}

let instanceCounter = 0;
function newInstanceKey(anchor: FamilyAnchor): string {
    instanceCounter += 1;
    return `inst_${anchor.entity_type}_${anchor.entity_id.slice(0, 8)}_${Date.now().toString(36)}_${instanceCounter}`;
}

/**
 * Build the packet instance: one instance for the household/opportunity, the selected
 * children, and one access record per recipient (each recipient gets their own token, all
 * pointing at this single instance). Never a separate packet per child or per pair.
 */
export function buildFamilyPacketInstancePlan(input: {
    anchor: FamilyAnchor;
    children: FamilyChild[];
    recipients: FamilyRecipient[];
    form_ids: string[];
    instance_key?: string;
}): FamilyPacketInstancePlan {
    const warnings: string[] = [];
    const childIds = new Set<string>();
    const children = input.children.filter((c) => c.customer_member_id && !childIds.has(c.customer_member_id) && childIds.add(c.customer_member_id));
    const recIds = new Set<string>();
    const recipients = input.recipients.filter((r) => r.person_id && !recIds.has(r.person_id) && recIds.add(r.person_id));

    if (children.length === 0) warnings.push("No children selected — the family packet needs at least one child.");
    if (recipients.length === 0) warnings.push("No recipients selected — no one can access the packet.");
    if (input.form_ids.length === 0) warnings.push("No forms selected.");

    const instance_key = input.instance_key ?? newInstanceKey(input.anchor);
    const recipient_access: RecipientAccess[] = recipients.map((r) => ({
        recipient_person_id: r.person_id,
        ...(r.label ? { label: r.label } : {}),
        access_key: `${instance_key}__${r.person_id}`,
    }));

    return { instance_key, anchor: input.anchor, children, recipient_access, form_ids: [...input.form_ids], warnings };
}

/* --------------------------- scoped field plan (dedupe) --------------------------- */

function canonicalKey(field: { id: string; field_source?: { entity_type?: string; field_key?: string; shared_value_key?: string } }): string {
    const s = field.field_source;
    const shared = s?.shared_value_key?.trim();
    if (shared) return `shared:${shared}`;
    const et = s?.entity_type?.trim();
    const fk = s?.field_key?.trim();
    if (et && fk) return `canon:${et}:${fk}`;
    return `field:${field.id}`;
}

export interface ScopedQuestion {
    canonical_key: string;
    /** Representative form/field for rendering. */
    form_id: string;
    field_id: string;
    scope: FieldScope;
}

export interface FamilyFieldScopePlan {
    /** Household questions — asked ONCE for the whole family (deduped across forms). */
    household: ScopedQuestion[];
    /** Child questions — asked once PER selected child (deduped across forms). */
    child: ScopedQuestion[];
    /** Recipient questions (signatures) — asked once PER recipient (NOT deduped). */
    recipient: ScopedQuestion[];
    counts: {
        householdOnce: number;
        childPerChild: number;
        recipientPerRecipient: number;
        /** Total questions a family actually answers across N children + M recipients. */
        totalQuestions: number;
        /** Total if we naively repeated every form per child (the bad model) — for comparison. */
        naiveRepeatedTotal: number;
    };
}

/**
 * Build the scoped, de-duplicated question plan across all packet forms for a given family
 * size. Household + child questions dedupe by canonical key across forms (collect once);
 * recipient signatures stay per-form/per-recipient.
 */
export function buildFamilyFieldScopePlan(
    forms: FamilyPacketForm[],
    childCount: number,
    recipientCount: number
): FamilyFieldScopePlan {
    const household: ScopedQuestion[] = [];
    const child: ScopedQuestion[] = [];
    const recipient: ScopedQuestion[] = [];
    const seenHousehold = new Set<string>();
    const seenChild = new Set<string>();
    let naiveScalarFieldsPerForm = 0;

    for (const form of forms) {
        const schema = { schema_version: 1, title: "", sections: form.schema?.sections ?? [], fields: form.schema?.fields ?? [] } as FormSchemaV1;
        const partition = partitionFieldsByScope(schema);
        const byId = new Map(schema.fields.map((f) => [f.id, f]));
        naiveScalarFieldsPerForm += partition.household.length + partition.child.length + partition.recipient.length;

        const pushScoped = (ids: string[], scope: FieldScope) => {
            for (const fid of ids) {
                const field = byId.get(fid);
                if (!field) continue;
                const ck = canonicalKey(field);
                const q: ScopedQuestion = { canonical_key: ck, form_id: form.form_id, field_id: fid, scope };
                if (scope === "household") {
                    if (seenHousehold.has(ck)) continue;
                    seenHousehold.add(ck);
                    household.push(q);
                } else if (scope === "child") {
                    if (seenChild.has(ck)) continue;
                    seenChild.add(ck);
                    child.push(q);
                } else {
                    recipient.push(q); // signatures: keep each
                }
            }
        };
        pushScoped(partition.household, "household");
        pushScoped(partition.child, "child");
        pushScoped(partition.recipient, "recipient");
    }

    const nChild = Math.max(0, childCount);
    const nRecip = Math.max(0, recipientCount);
    const totalQuestions = household.length + child.length * nChild + recipient.length * nRecip;
    // Bad model: every form completed separately per child (and signatures per recipient).
    const naiveRepeatedTotal = naiveScalarFieldsPerForm * Math.max(1, nChild);

    return {
        household,
        child,
        recipient,
        counts: {
            householdOnce: household.length,
            childPerChild: child.length,
            recipientPerRecipient: recipient.length,
            totalQuestions,
            naiveRepeatedTotal,
        },
    };
}
