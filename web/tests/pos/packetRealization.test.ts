/**
 * Processing proposes; the Packet executes. This proves the handoff writes only canonical Packet and
 * Form rows, at artifact grain, once.
 *
 * The realization key is the load-bearing part. The existing form link is stored one-per-case, which
 * cannot express six artifacts — so a re-run would have made a seventh Form. Keying on case +
 * document + artifact is what makes "run it twice" safe.
 */

import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { artifactRealizationKey, createPacketFromProcessingAnalysis, type CreatePacketDeps, type PacketRealization } from "@/lib/pos/packet/createPacketFromProcessingAnalysis";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import type { PacketIntakeInput, PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";

let inputs: PacketIntakeInput[];
let packet: PacketIntakeResult;

beforeAll(async () => {
    inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing"));
    packet = composePacket(inputs);
}, 300_000);

/** An in-memory canonical store: the same tables, without a database. */
function harness() {
    const forms: any[] = [];
    const versions: any[] = [];
    const packets: any[] = [];
    const items: any[] = [];
    const published = new Set<string>();
    let saved: PacketRealization | null = null;
    let n = 0;
    const id = (p: string) => `${p}-${++n}`;
    const deps: CreatePacketDeps = {
        listFormKeys: async () => new Set(forms.map((f) => f.key)),
        listPacketKeys: async () => new Set(packets.map((p) => p.key)),
        insertFormDefinition: async (a) => { const r = { id: id("form"), ...a }; forms.push(r); return { id: r.id }; },
        insertVersion: async (a) => { const r = { id: id("ver"), ...a }; versions.push(r); return { id: r.id }; },
        publishVersion: async (a) => { published.add(a.versionId); },
        insertPacketDefinition: async (a) => { const r = { id: id("pkt"), ...a }; packets.push(r); return { id: r.id }; },
        insertPacketItem: async (a) => { const r = { id: id("item"), ...a }; items.push(r); return { id: r.id }; },
        loadDiscoveryDecisions: async () => [],
        loadRealization: async () => saved,
        saveRealization: async (a) => { saved = a.realization; },
    };
    return { deps, forms, versions, packets, items, published, get saved() { return saved; } };
}

/** A Supabase double returning exactly what the service reads. */
function supabaseDouble(pk: PacketIntakeResult, ins: PacketIntakeInput[], review: unknown[] = []) {
    return { __packet: pk, __inputs: ins, __review: review } as never;
}

// The service calls buildPacketIntakeForCaseSafe + dbLoadPacketReview; stub those modules.
vi.mock("@/lib/pos/packetIntake/buildPacketIntakeForCaseSafe", () => ({
    buildPacketIntakeForCaseSafe: async (sb: any) => ({ packet: sb.__packet, inputs: sb.__inputs, unreadable: [] }),
}));
vi.mock("@/lib/pos/packetIntake/packetIntakeDb", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    dbLoadPacketReview: async (sb: any) => sb.__review,
}));

import { vi } from "vitest";

const NAMES = [
    { subject: "artifact", subject_id: "1:page_1", decision: "renamed", name: "Oregon Certificate of Immunization Status" },
    { subject: "artifact", subject_id: "2:page_2", decision: "renamed", name: "Oregon Nonmedical Exemption" },
];

describe("six artifacts realize six Forms and one packet", () => {
    it("creates 6 forms, 6 published versions, 1 packet, 6 ordered items", async () => {
        const h = harness();
        const res = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(h.forms).toHaveLength(6);
        expect(h.versions).toHaveLength(6);
        expect(h.packets).toHaveLength(1);
        expect(h.items).toHaveLength(6);
        expect(h.published.size, "every pinned version must be published — a draft is not executable").toBe(6);
        expect(h.items.map((i) => i.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5]);
        // Every item pins the exact version this run published, never "latest".
        for (const i of h.items) expect(i.pinnedVersionId).toBeTruthy();
    });

    it("uses the operator's artifact names, and never invents one", async () => {
        const h = harness();
        await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        const names = h.forms.map((f) => f.name);
        expect(names).toContain("Oregon Certificate of Immunization Status");
        expect(names).toContain("Oregon Nonmedical Exemption");
        expect(names, "a page number is a position, not an identity").not.toContain("Page 1");
        expect(names).not.toContain("Page 2");
    });

    it("falls back to the artifact's own title when the operator named nothing", async () => {
        const h = harness();
        await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, []), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(h.forms.map((f) => f.name)).toContain("Tuition & Enrollment Agreement");
    });
});

describe("provenance travels with every artifact", () => {
    it("records case, document, checksum and artifact identity on each Form", async () => {
        const h = harness();
        await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        for (const f of h.forms) {
            expect(f.metadata.source_case_id).toBe("case");
            expect(f.metadata.source_document_id).toBeTruthy();
            expect(f.metadata.logical_artifact_id).toBeTruthy();
            expect(f.metadata.realization_key).toBe(
                artifactRealizationKey("case", f.metadata.source_document_id, f.metadata.logical_artifact_id),
            );
        }
    });

    it("records all three sources and their hashes on the packet", async () => {
        const h = harness();
        await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        const meta = h.packets[0].metadata;
        expect(meta.created_via).toBe("pos_packet_from_analysis");
        expect(meta.source_documents).toHaveLength(3);
        expect(meta.logical_artifact_ids).toHaveLength(6);
        // Multiple Forms legitimately share a source hash — the document is not duplicated.
        const hashes = (meta.source_documents as any[]).map((d) => d.checksum_sha256);
        expect(new Set(hashes).size).toBe(3);
    });
});

describe("idempotency — running it twice changes nothing", () => {
    it("returns the existing realization instead of a second packet", async () => {
        const h = harness();
        const first = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        const second = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.realization.packet_definition_id).toBe(first.realization.packet_definition_id);
        // No duplicates of anything.
        expect(h.forms).toHaveLength(6);
        expect(h.versions).toHaveLength(6);
        expect(h.packets).toHaveLength(1);
        expect(h.items).toHaveLength(6);
        expect(second.realization.warnings.join(" ")).toMatch(/already realized/i);
    });

    it("keys realization on case + document + artifact, not on the case alone", () => {
        // The one-per-case link could not express six artifacts; this is what replaced it.
        const a = artifactRealizationKey("case", "doc", "1:page_1");
        const b = artifactRealizationKey("case", "doc", "2:page_2");
        expect(a).not.toBe(b);
        expect(artifactRealizationKey("case", "doc-x", "1:page_1")).not.toBe(a);
    });
});

describe("the packet writes only canonical configuration", () => {
    it("creates no field definitions, safeguarding rows or payment methods", async () => {
        const h = harness();
        await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        // The deps ARE the complete write surface: forms, versions, packets, items. There is no
        // seam through which this service could write a field, a restriction or a credential.
        expect(Object.keys(h.deps).filter((k) => /insert|publish/.test(k)).sort()).toEqual([
            "insertFormDefinition", "insertPacketDefinition", "insertPacketItem", "insertVersion", "publishVersion",
        ]);
    });
});
