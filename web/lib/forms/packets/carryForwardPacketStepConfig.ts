/**
 * Keep a packet step's CONFIGURATION across the step-list rewrite that reorders it.
 *
 * ## The defect this exists to make impossible
 *
 * The items PUT route replaces the whole ordered list: it deletes every `form_packet_items` row and
 * reinserts them in the submitted order. It rebuilt each row's `metadata` from `step_label` alone,
 * which was harmless while a step could only ever be "complete this form" — order and a label were
 * the entire content.
 *
 * Once a step can be an upload or an acknowledgment, that same rewrite became destructive. Pressing
 * "Save steps" merely to MOVE a step up would have dropped `step_kind`, `document_type_key` and
 * `acknowledgment_document_id` from every document step in the packet, silently demoting each one to
 * a bare form. The family would then have been shown a one-control adapter with no document behind
 * it, and nothing anywhere would have reported an error — the packet would simply have quietly
 * stopped asking for the immunization record.
 *
 * ## How a draft row is matched to what it used to be
 *
 * By `packet_item_id` when the client names which stored row a draft came from — the only
 * unambiguous answer, and what the builder now sends. Otherwise by the form that executes the step,
 * which is 1:1 with its step for every generated adapter, so a document step is still recovered from
 * a client that predates this field. A plain form step matched this way loses nothing that matters:
 * its configuration is its form and its label, both of which the request already carries.
 *
 * Pure. No I/O.
 */

import { readPacketStepConfig, writePacketStepConfig, type PacketStepConfig } from "@/lib/forms/packets/packetStepKind";

export type PriorPacketStepRow = {
    readonly id: string;
    readonly form_definition_id: string;
    readonly metadata: unknown;
};

export type IncomingPacketStep = {
    readonly form_definition_id: string;
    readonly step_label?: string;
    readonly packet_item_id?: string;
};

/** Index prior rows for both lookup routes. */
export function indexPriorPacketSteps(rows: readonly PriorPacketStepRow[]): {
    byId: Map<string, unknown>;
    byForm: Map<string, unknown>;
} {
    const byId = new Map<string, unknown>();
    const byForm = new Map<string, unknown>();
    for (const row of rows) {
        byId.set(row.id, row.metadata);
        // First write wins: a form appearing twice cannot be told apart by form id, and an adapter
        // never does. Guessing between two identical candidates would be worse than the fallback.
        if (!byForm.has(row.form_definition_id)) byForm.set(row.form_definition_id, row.metadata);
    }
    return { byId, byForm };
}

/** The configuration a rewritten row should be reinserted with. */
export function carryForwardPacketStepConfig(
    step: IncomingPacketStep,
    index: { byId: Map<string, unknown>; byForm: Map<string, unknown> },
): PacketStepConfig {
    const prior = readPacketStepConfig(
        (step.packet_item_id ? index.byId.get(step.packet_item_id) : undefined) ??
            index.byForm.get(step.form_definition_id),
    );
    const label = (step.step_label ?? "").trim();
    // The request is authoritative for the label the operator just typed; everything else is
    // carried, because the request never carried it in the first place.
    return { ...prior, label: label || prior.label };
}

/** The `metadata` value to store for a rewritten row. */
export function packetStepMetadataForRewrite(
    step: IncomingPacketStep,
    index: { byId: Map<string, unknown>; byForm: Map<string, unknown> },
): Record<string, unknown> {
    return writePacketStepConfig({}, carryForwardPacketStepConfig(step, index));
}
