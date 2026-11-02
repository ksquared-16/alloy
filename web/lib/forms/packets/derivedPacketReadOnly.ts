/**
 * A requirement-derived packet is READ-ONLY outside its derivation (V0.5 FI-12).
 *
 * The Enrollment participant packet is a projection of a Business Process stage's Form
 * requirements (`requirementDerivedPacket.ts`, Director decision B1 option C): addressed by
 * `(revision, stage)`, never authored, and verified against the requirements on every reuse — any
 * divergence refuses the launch with `packet_drift`. It is still an ordinary
 * `form_packet_definitions` row, so the Packet Composer and its routes could edit it, and the
 * next family to start Enrollment would hit that refusal.
 *
 * So the composer shows it read-only and the direct mutation routes refuse it, both naming the
 * actual owner — the stage's Form requirements in Organization › Processes. The canonical
 * derivation service writes these rows itself and is not affected. Authored packets are unchanged.
 *
 * Pure (no I/O, no server-only imports) so the composer and the routes share one answer.
 * `REQUIREMENT_DERIVED_PACKET_SOURCE` in requirementDerivedPacket.ts stays the authority for the
 * marker; a test pins the two equal.
 */

/** `metadata.derived_from` on a requirement-derived packet (mirror of REQUIREMENT_DERIVED_PACKET_SOURCE). */
export const DERIVED_PACKET_SOURCE_MARKER = "business_process_requirements" as const;

/** Refusal code on the direct packet mutation routes. */
export const DERIVED_PACKET_READ_ONLY_CODE = "derived_packet_read_only";

/** Where the owning requirements are edited. */
export const DERIVED_PACKET_OWNER_HREF = "/organization/processes";

export type DerivedPacketOwner = {
    readonly businessProcessRevisionId: string | null;
    readonly processKey: string | null;
    readonly stageKey: string | null;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The owning Business Process stage of a derived packet, or null for an authored packet. */
export function derivedPacketOwner(metadata: unknown): DerivedPacketOwner | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const m = metadata as Record<string, unknown>;
    if (m.derived_from !== DERIVED_PACKET_SOURCE_MARKER) return null;
    return {
        businessProcessRevisionId: text(m.business_process_revision_id),
        processKey: text(m.process_key),
        stageKey: text(m.stage_key),
    };
}

/** Operator guidance naming the real owner. */
export function derivedPacketEditGuidance(owner: DerivedPacketOwner): string {
    const stage = owner.stageKey ? `the “${owner.stageKey}” stage` : "its stage";
    const process = owner.processKey ? ` of the “${owner.processKey}” business process` : "";
    return (
        `This packet is built from the Form requirements of ${stage}${process}, so it can't be edited here. ` +
        "To change its forms or their order, edit that stage's Form requirements in Organization › Processes and publish — " +
        "the next family to start gets the updated packet. Families already in progress keep the packet they started."
    );
}

export type DerivedPacketRefusal = {
    readonly status: 409;
    readonly code: typeof DERIVED_PACKET_READ_ONLY_CODE;
    readonly message: string;
    readonly owner: DerivedPacketOwner;
    readonly edit_href: typeof DERIVED_PACKET_OWNER_HREF;
};

/** The refusal a direct mutation route returns for a derived packet, or null when it may proceed. */
export function derivedPacketMutationRefusal(metadata: unknown): DerivedPacketRefusal | null {
    const owner = derivedPacketOwner(metadata);
    if (!owner) return null;
    return {
        status: 409,
        code: DERIVED_PACKET_READ_ONLY_CODE,
        message: derivedPacketEditGuidance(owner),
        owner,
        edit_href: DERIVED_PACKET_OWNER_HREF,
    };
}
