/**
 * The immutable execution snapshot a participant session pins.
 *
 * ## What a Packet version is, and is not
 *
 * The Packet stays DERIVED from published Business Process requirements. A version is a snapshot of
 * one derivation — the ordered steps, each naming the exact `form_definition_version_id` a session
 * is expected to consume — and nothing here lets an administrator author steps the Business Process
 * does not say. It is a record of what was derived, not a second authoring authority.
 *
 * ## Why a fingerprint rather than "insert a row each time"
 *
 * Derivation runs whenever configuration is read. Minting a version per run would fill the table
 * with identical snapshots and make "which version is this family on?" meaningless — every reload a
 * new answer. So the snapshot carries a digest of the EXECUTION-RELEVANT facts only:
 *
 *   - ordered step identity (sequence, which Form)
 *   - the pinned Form version for each step
 *
 * Two derivations that would execute identically produce the same fingerprint and resolve to the
 * same published version. A real change — a step added, reordered, or a step's Form version moving
 * — produces a different one, and that is a new version.
 *
 * Deliberately EXCLUDED from the digest: names, labels, timestamps, who published, and anything
 * cosmetic. A Form renamed in Studio does not change what a packet executes, and inventing a new
 * version for it would strand nothing but would lie about a change having happened.
 *
 * Pure. No I/O.
 */

import { createHash } from "node:crypto";

/** One step of the derived packet, as it will execute. */
export type PacketVersionStep = {
    readonly sequence_index: number;
    readonly form_definition_id: string;
    /** The exact version this step executes. Null is not acceptable in a published snapshot. */
    readonly form_definition_version_id: string | null;
    /** The Business Process requirement this step satisfies, when derived from one. */
    readonly requirement_id?: string | null;
};

export type PacketVersionSnapshot = {
    readonly steps: readonly PacketVersionStep[];
    /** Stable digest of ordered step identity + pinned Form versions. */
    readonly fingerprint: string;
    /** True when every step names a published Form version — required before publishing. */
    readonly complete: boolean;
};

/**
 * Build the snapshot for a set of derived steps.
 *
 * @param steps steps in any order; they are sorted by `sequence_index` before digesting so two
 *              derivations that differ only in the order rows came back agree
 */
export function derivePacketVersionSnapshot(steps: readonly PacketVersionStep[]): PacketVersionSnapshot {
    const ordered = [...steps].sort((a, b) => a.sequence_index - b.sequence_index);

    /*
     * The digest is built from a canonical string rather than JSON.stringify of the objects: key
     * order and optional-field presence would otherwise leak into it, and an unrelated refactor
     * that reordered a literal would silently mint a new version for every packet in the estate.
     */
    const canonical = ordered
        .map((s, i) => `${i}|${s.form_definition_id}|${s.form_definition_version_id ?? ""}`)
        .join("\n");

    return {
        steps: ordered,
        fingerprint: createHash("sha256").update(canonical).digest("hex"),
        complete: ordered.length > 0 && ordered.every((s) => Boolean(s.form_definition_version_id)),
    };
}

/**
 * Would these two snapshots execute the same way?
 *
 * The question a resolver asks before deciding whether it is looking at a new version.
 */
export function packetSnapshotsAreEquivalent(a: PacketVersionSnapshot, b: PacketVersionSnapshot): boolean {
    return a.fingerprint === b.fingerprint;
}
