/**
 * What a packet step ASKS OF A FAMILY — collect information, supply a document, or read and agree.
 *
 * ## Why this is metadata and not a column
 *
 * `form_packet_items.form_definition_id` is NOT NULL, so relaxing it to express other step kinds is
 * a migration — and migrations cannot currently reach the environment this product runs against
 * (`gdep_bb3620a9793735`, still open). A column is the better long-term shape and should follow when
 * that clears. Until then the kind lives in the item's existing `metadata`, which is writable today,
 * and this module is the only place that reads or writes it so the shape cannot drift.
 *
 * ## The adapter, stated plainly
 *
 * Because every item must still name a form, an upload or acknowledgment step is executed by a
 * SYSTEM-GENERATED form carrying one control. That is deliberate reuse, not a shortcut: participant
 * upload, View/Replace, document classification, completion evidence, the Processing return and the
 * canonical return all already work through form submissions, and a second execution engine would
 * have to re-earn every one of those proofs.
 *
 * The rule that keeps it honest: the adapter is an implementation detail. An administrator never
 * picks it, never names it, and never sees it — Packet Studio offers "Upload a document" and "Read &
 * acknowledge", and generates what executes them. If the adapter ever appears in the admin's model,
 * this has failed.
 *
 * Pure. No I/O.
 */

export const PACKET_STEP_KINDS = ["form", "document_upload", "document_acknowledgment"] as const;

export type PacketStepKind = (typeof PACKET_STEP_KINDS)[number];

/** What an administrator calls each kind. Technical names never reach the screen. */
export const PACKET_STEP_KIND_LABELS: Readonly<Record<PacketStepKind, string>> = Object.freeze({
    form: "Collect information",
    document_upload: "Upload a document",
    document_acknowledgment: "Read & acknowledge",
});

export type PacketStepConfig = {
    readonly kind: PacketStepKind;
    /** Participant-facing name for the step. */
    readonly label: string | null;
    /** `document_upload` — what the family is asked to provide, and the classification it lands as. */
    readonly documentTypeKey: string | null;
    readonly instructions: string | null;
    /** `document_acknowledgment` — the governed document a family reads. */
    readonly acknowledgmentDocumentId: string | null;
    readonly requiresSignature: boolean;
};

const isKind = (v: unknown): v is PacketStepKind =>
    typeof v === "string" && (PACKET_STEP_KINDS as readonly string[]).includes(v);

const str = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || null;
};

/**
 * Read a step's configuration from its stored metadata.
 *
 * An item with no recorded kind is a FORM. Every packet step that existed before this vocabulary was
 * one, so the default is what those rows actually are rather than a guess.
 */
export function readPacketStepConfig(metadata: unknown): PacketStepConfig {
    const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
    const kind = isKind(m.step_kind) ? m.step_kind : "form";
    return {
        kind,
        label: str(m.step_label),
        documentTypeKey: str(m.document_type_key),
        instructions: str(m.participant_instructions),
        acknowledgmentDocumentId: str(m.acknowledgment_document_id),
        requiresSignature: m.requires_signature === true,
    };
}

/**
 * Write a step's configuration into metadata, preserving anything else already stored there.
 *
 * Only the keys this vocabulary owns are touched — an unrelated key someone else put on the item is
 * not this module's to discard.
 */
export function writePacketStepConfig(metadata: unknown, config: Partial<PacketStepConfig> & { kind: PacketStepKind }): Record<string, unknown> {
    const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
    base.step_kind = config.kind;
    if (config.label !== undefined) {
        if (config.label) base.step_label = config.label;
        else delete base.step_label;
    }
    const setOrClear = (key: string, value: string | null | undefined) => {
        if (value === undefined) return;
        if (value) base[key] = value;
        else delete base[key];
    };
    setOrClear("document_type_key", config.documentTypeKey);
    setOrClear("participant_instructions", config.instructions);
    setOrClear("acknowledgment_document_id", config.acknowledgmentDocumentId);
    if (config.requiresSignature !== undefined) {
        if (config.requiresSignature) base.requires_signature = true;
        else delete base.requires_signature;
    }
    return base;
}

/**
 * Is this step configured well enough for a family to complete it?
 *
 * A step whose completion cannot be proven must not be offered — an upload with no classification
 * produces evidence nobody can file, and an acknowledgment with no document asks a family to agree
 * to nothing.
 */
export function packetStepConfigRefusal(config: PacketStepConfig): string | null {
    if (config.kind === "document_upload" && !config.documentTypeKey) {
        return "Choose what document this step asks for, so the file can be filed against the right requirement.";
    }
    if (config.kind === "document_acknowledgment" && !config.acknowledgmentDocumentId) {
        return "Choose the document the family reads before acknowledging it.";
    }
    return null;
}
