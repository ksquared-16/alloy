import { describe, expect, it } from "vitest";

import {
    derivePacketVersionSnapshot,
    packetSnapshotsAreEquivalent,
    type PacketVersionStep,
} from "@/lib/forms/packets/versioning/derivePacketVersionSnapshot";

/**
 * A VERSION MUST MEAN A REAL CHANGE.
 *
 * Derivation runs whenever configuration is read. If every run minted a version, "which version is
 * this family on?" would have a new answer on every reload, and the table would fill with identical
 * snapshots. These pin the line between "the same thing, derived again" and "this now executes
 * differently".
 */

const step = (seq: number, form: string, version: string | null): PacketVersionStep => ({
    sequence_index: seq,
    form_definition_id: form,
    form_definition_version_id: version,
});

const northwind = step(0, "form-northwind", "ver-northwind-1");
const health = step(1, "form-health", "ver-health-1");
const immunization = step(2, "form-immunization", "ver-immunization-7");

describe("idempotent derivation", () => {
    it("the same configuration derives the same fingerprint every time", () => {
        const a = derivePacketVersionSnapshot([northwind, health, immunization]);
        const b = derivePacketVersionSnapshot([northwind, health, immunization]);
        expect(a.fingerprint).toBe(b.fingerprint);
        expect(packetSnapshotsAreEquivalent(a, b)).toBe(true);
    });

    it("row order coming back from the database does not matter", () => {
        // Only sequence_index orders a packet; the order rows arrive in is an accident.
        const a = derivePacketVersionSnapshot([northwind, health, immunization]);
        const b = derivePacketVersionSnapshot([immunization, northwind, health]);
        expect(b.fingerprint).toBe(a.fingerprint);
        expect(b.steps.map((s) => s.sequence_index)).toEqual([0, 1, 2]);
    });

    it("cosmetic detail is not part of execution meaning", () => {
        /*
         * A requirement id rides along for provenance but does not change what executes, so a
         * packet whose requirements were re-keyed must not mint a version for every family.
         */
        const withReq = derivePacketVersionSnapshot([
            { ...northwind, requirement_id: "req-a" },
            health,
            immunization,
        ]);
        const withoutReq = derivePacketVersionSnapshot([northwind, health, immunization]);
        expect(withReq.fingerprint).toBe(withoutReq.fingerprint);
    });
});

describe("a real change is a new version", () => {
    const base = derivePacketVersionSnapshot([northwind, health, immunization]);

    it("a step's Form version moving", () => {
        // The live hazard: Immunization republished from v7 to v11.
        const next = derivePacketVersionSnapshot([
            northwind,
            health,
            step(2, "form-immunization", "ver-immunization-11"),
        ]);
        expect(next.fingerprint).not.toBe(base.fingerprint);
    });

    it("a step added", () => {
        const next = derivePacketVersionSnapshot([northwind, health, immunization, step(3, "form-extra", "ver-extra-1")]);
        expect(next.fingerprint).not.toBe(base.fingerprint);
    });

    it("a step removed", () => {
        expect(derivePacketVersionSnapshot([northwind, health]).fingerprint).not.toBe(base.fingerprint);
    });

    it("steps reordered", () => {
        // Same forms, same versions, different order — a family meets them in a different order.
        const next = derivePacketVersionSnapshot([
            step(0, "form-health", "ver-health-1"),
            step(1, "form-northwind", "ver-northwind-1"),
            step(2, "form-immunization", "ver-immunization-7"),
        ]);
        expect(next.fingerprint).not.toBe(base.fingerprint);
    });
});

describe("a snapshot is not publishable until every step pins a version", () => {
    it("is complete when all steps name a version", () => {
        expect(derivePacketVersionSnapshot([northwind, health, immunization]).complete).toBe(true);
    });

    it("is incomplete when any step does not", () => {
        /*
         * Publishing a version with an unpinned step would hand a family a packet that resolves
         * "whatever is published when they reach step 3" — the exact drift versioning removes.
         */
        expect(derivePacketVersionSnapshot([northwind, step(1, "form-health", null)]).complete).toBe(false);
    });

    it("an empty packet is not complete", () => {
        expect(derivePacketVersionSnapshot([]).complete).toBe(false);
    });
});
