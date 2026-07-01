/**
 * POS Packet Composer — pure planners (no I/O).
 *
 * Two responsibilities, both deterministic and unit-testable:
 *
 * 1. `buildPacketComposerItems` — turn an ordered list of selected form template ids into
 *    ordered packet items (sequence_index 0..N, de-duplicated, order preserved). A packet
 *    definition can contain MANY forms.
 *
 * 2. `buildPacketLaunchPlan` — expand selected children × recipients into per-pair share
 *    mint specs. Each share/link is child-recipient specific — never one generic link for
 *    multiple people. Produces the exact body fragments the compose route passes to
 *    `mintPacketPublicLinkForAdmin` (launch_from_entity + enrollment_selection).
 *
 * Prefill support note: `enrollment_selection` (customer_member_id + recipient_person_id)
 * is consumed by the mint path when the launch anchor is an opportunity; for opportunity
 * anchors this yields full child + parent prefill. For non-opportunity anchors the child is
 * still prefilled via a customer_member launch; recipient is carried for addressing.
 */

import type { LaunchEntityType } from "./launchFromEntity";

/* ----------------------------- form selection/order ----------------------------- */

export interface PacketComposerItem {
    form_definition_id: string;
    sequence_index: number;
    step_label?: string;
}

export interface PacketComposerItemsResult {
    ok: boolean;
    items: PacketComposerItem[];
    error?: string;
}

/**
 * Ordered, de-duplicated packet items from selected form ids (order = the array order).
 * `labels` optionally maps form id → step label.
 */
export function buildPacketComposerItems(
    orderedFormIds: string[],
    labels?: Record<string, string>
): PacketComposerItemsResult {
    const seen = new Set<string>();
    const items: PacketComposerItem[] = [];
    for (const raw of orderedFormIds) {
        const id = (raw ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const label = labels?.[id]?.trim();
        items.push({
            form_definition_id: id,
            sequence_index: items.length,
            ...(label ? { step_label: label } : {}),
        });
    }
    if (items.length === 0) {
        return { ok: false, items: [], error: "Select at least one form template." };
    }
    return { ok: true, items };
}

/** Move the item at `from` to `to` (pure; returns a new array). Out-of-range → unchanged copy. */
export function reorderFormSelection(ids: string[], from: number, to: number): string[] {
    const out = ids.slice();
    if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
    const [moved] = out.splice(from, 1);
    out.splice(to, 0, moved);
    return out;
}

/* --------------------------------- launch fan-out --------------------------------- */

export interface ComposerAnchor {
    entity_type: LaunchEntityType;
    entity_id: string;
    /** Resolved household + opportunity context (from the roster), when known. */
    opportunity_id?: string | null;
    customer_id?: string | null;
}

export interface ShareMintSpec {
    /** Stable key for dedupe/display. */
    pair_key: string;
    customer_member_id: string | null;
    recipient_person_id: string | null;
    launch_from_entity: { entity_type: LaunchEntityType; entity_id: string; prefill_enabled: true };
    /** Consumed by mint for opportunity anchors; harmless otherwise. */
    enrollment_selection?: { customer_member_id?: string; recipient_person_id?: string };
}

export interface PacketLaunchPlan {
    specs: ShareMintSpec[];
    warnings: string[];
}

/**
 * Choose the launch anchor for a pair: prefer an opportunity (enables full child+parent
 * prefill via enrollment_selection), then the child (customer_member), then the household
 * (customer), then the raw anchor.
 */
function launchEntityForPair(anchor: ComposerAnchor, childId: string | null): { entity_type: LaunchEntityType; entity_id: string; prefill_enabled: true } {
    if (anchor.entity_type === "opportunity") return { entity_type: "opportunity", entity_id: anchor.entity_id, prefill_enabled: true };
    if (anchor.opportunity_id) return { entity_type: "opportunity", entity_id: anchor.opportunity_id, prefill_enabled: true };
    if (childId) return { entity_type: "customer_member", entity_id: childId, prefill_enabled: true };
    if (anchor.customer_id) return { entity_type: "customer", entity_id: anchor.customer_id, prefill_enabled: true };
    return { entity_type: anchor.entity_type, entity_id: anchor.entity_id, prefill_enabled: true };
}

/**
 * Expand children × recipients into one share spec per child-recipient pair.
 *
 * - both non-empty → cartesian product (one link per pair)
 * - only children → one link per child
 * - only recipients → one link per recipient
 * - neither → a single anchor-only link (no specific pair)
 * Duplicate (child,recipient) pairs collapse.
 */
export function buildPacketLaunchPlan(
    anchor: ComposerAnchor,
    childIds: string[],
    recipientIds: string[]
): PacketLaunchPlan {
    const warnings: string[] = [];
    const children = [...new Set(childIds.map((c) => c.trim()).filter(Boolean))];
    const recipients = [...new Set(recipientIds.map((r) => r.trim()).filter(Boolean))];

    const childAxis: (string | null)[] = children.length > 0 ? children : [null];
    const recipientAxis: (string | null)[] = recipients.length > 0 ? recipients : [null];

    if (children.length === 0) warnings.push("No child selected — link will not be child-specific.");
    if (recipients.length === 0) warnings.push("No recipient selected — link will not be addressed to a specific parent/guardian.");

    const seen = new Set<string>();
    const specs: ShareMintSpec[] = [];
    for (const childId of childAxis) {
        for (const recipientId of recipientAxis) {
            const pair_key = `${childId ?? "-"}::${recipientId ?? "-"}`;
            if (seen.has(pair_key)) continue;
            seen.add(pair_key);

            const enrollment: { customer_member_id?: string; recipient_person_id?: string } = {};
            if (childId) enrollment.customer_member_id = childId;
            if (recipientId) enrollment.recipient_person_id = recipientId;

            specs.push({
                pair_key,
                customer_member_id: childId,
                recipient_person_id: recipientId,
                launch_from_entity: launchEntityForPair(anchor, childId),
                ...(Object.keys(enrollment).length > 0 ? { enrollment_selection: enrollment } : {}),
            });
        }
    }

    return { specs, warnings };
}
