/**
 * §10 — first-publish readiness over the real packet.
 *
 * One question: if Alloy published this packet, would it collect anything that NOTHING owns?
 * A parent answering into nowhere is the dishonest outcome, and it is the only outcome that must
 * be impossible before a publish.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { classifyForPublish, ownerlessCount, type PublishOwnership } from "@/lib/pos/discovery/publishOwnershipClassification";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
    packet = composePacket(inputs);
}, 300_000);

function classifyAll() {
    const out: { key: string; ownership: PublishOwnership; label: string; basis: string }[] = [];
    for (const i of inputs) {
        if (i.artifact.fill_intent === "reference") continue;
        const byCandidate = new Map(i.discovery.proposals.map((p) => [p.candidate_id, p]));
        for (const c of i.discovery.concepts) {
            const p = byCandidate.get(c.id);
            if (!p) continue;
            const r = classifyForPublish(p, { label: c.label, concept_key: c.concept_key });
            out.push({ key: `${i.artifact.document_id}|${c.concept_key ?? c.id}`, ownership: r.ownership, label: c.label, basis: r.basis });
        }
    }
    return out;
}

describe("nothing the packet collects is ownerless", () => {
    it("has an owner for every concept", () => {
        const classified = classifyAll();
        const orphans = classified.filter((c) => c.ownership === "OWNERLESS");
        expect(orphans.map((o) => o.label), "concepts a publish would collect into nowhere").toEqual([]);
        expect(ownerlessCount(classified)).toBe(0);
    });

    it("classifies every concept — none falls through unlabelled", () => {
        const classified = classifyAll();
        expect(classified.length).toBeGreaterThan(0);
        expect(classified.every((c) => c.basis.length > 0)).toBe(true);
    });
});

describe("the safeguarding questions are owned, not held", () => {
    it("emits NEEDS_CANONICAL_SAFEGUARDING_OWNER nowhere in the packet", () => {
        const stillHeld = inputs.flatMap((i) =>
            i.discovery.proposals.filter((p) => p.ownership_hold?.state === "NEEDS_CANONICAL_SAFEGUARDING_OWNER"),
        );
        expect(stillHeld).toHaveLength(0);
    });

    it("binds them to the canonical safeguarding owner", () => {
        const safeguarding = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.disposition === "safeguarding_binding"));
        expect(safeguarding).toHaveLength(3);
        expect(safeguarding.map((p) => p.target_safeguarding_kind).sort()).toEqual([
            "custody_restriction",
            "custody_restriction",
            "protective_or_restraining_order",
        ]);
    });

    it("does NOT flatten either concept into a generic child field", () => {
        // The whole point. A restraining-order question answered into a child text box is the
        // free-text `custody_notes` failure with extra steps.
        const safeguarding = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.disposition === "safeguarding_binding"));
        expect(safeguarding.every((p) => p.proposed_field === undefined)).toBe(true);
        expect(safeguarding.every((p) => p.target_field_source === undefined)).toBe(true);
    });

    it("does not infer an operational effect from a question", () => {
        // A form question rarely states the terms of an order. Deciding "may not pick up" from
        // "is there a restraining order?" would be Alloy deciding what a court decided.
        const safeguarding = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.disposition === "safeguarding_binding"));
        for (const p of safeguarding) {
            expect(p.explanation).toMatch(/Nothing becomes active until someone approves it/i);
        }
    });
});

describe("the ten health concepts stay held, exactly as Slice 5 determined", () => {
    it("keeps them pending the Health foundation", () => {
        const classified = classifyAll();
        const health = classified.filter((c) => c.ownership === "HELD_PENDING_HEALTH");
        // 10 concepts across 11 occurrences — the CIS immunization set plus the medication list.
        expect(health.length).toBeGreaterThanOrEqual(10);
    });

    it("creates no durable Health destination", () => {
        const held = inputs.flatMap((i) => i.discovery.proposals.filter((p) => p.disposition === "held_for_canonical_owner"));
        expect(held.every((p) => p.proposed_field === undefined)).toBe(true);
    });
});

describe("the packet is not smaller than it was", () => {
    it("still accounts for every destination", () => {
        expect(packet.destinations).toHaveLength(180);
        expect(packet.obligations).toHaveLength(32);
    });

    it("publishes nothing", () => {
        for (const i of inputs) expect(i.discovery.proposals.every((p) => p.decision_state === "proposed")).toBe(true);
    });
});
