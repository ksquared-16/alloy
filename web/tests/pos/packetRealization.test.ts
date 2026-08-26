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
import { artifactRealizationKey, createPacketFromProcessingAnalysis, reprojectRealizedPacket, type ReprojectDeps, type PacketRealization } from "@/lib/pos/packet/createPacketFromProcessingAnalysis";
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
    const deps: ReprojectDeps = {
        listFormKeys: async () => new Set(forms.map((f) => f.key)),
        listPacketKeys: async () => new Set(packets.map((p) => p.key)),
        insertFormDefinition: async (a) => { const r = { id: id("form"), ...a }; forms.push(r); return { id: r.id }; },
        insertVersion: async (a) => { const r = { id: id("ver"), ...a }; versions.push(r); return { id: r.id }; },
        publishVersion: async (a) => { published.add(a.versionId); },
        insertPacketDefinition: async (a) => { const r = { id: id("pkt"), ...a }; packets.push(r); return { id: r.id }; },
        insertPacketItem: async (a) => { const r = { id: id("item"), ...a }; items.push(r); return { id: r.id }; },
        loadVersion: async ({ versionId }) => {
            const v = versions.find((x) => x.id === versionId);
            return v ? { id: v.id, version_number: v.versionNumber, schema_json: v.schemaJson, form_definition_id: v.formDefinitionId } : null;
        },
        nextVersionNumber: async ({ formDefinitionId }) =>
            Math.max(0, ...versions.filter((v) => v.formDefinitionId === formDefinitionId).map((v) => v.versionNumber)) + 1,
        repinPacketItem: async ({ packetItemId, pinnedVersionId }) => {
            const it = items.find((x) => x.id === packetItemId);
            if (it) it.pinnedVersionId = pinnedVersionId;
        },
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

describe("six artifacts realize five Forms and one packet", () => {
    it("creates 5 forms, 5 published versions, 1 packet, 5 ordered items", async () => {
        const h = harness();
        const res = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // Five, from six artifacts. The Direct Payment Authorization is held for Financials: its
        // boxes are a routing number and an account number, and a Form built from a source's
        // destinations would have asked a parent for them inside Alloy even though every proposal
        // correctly refused to store one.
        expect(h.forms).toHaveLength(5);
        expect(h.versions).toHaveLength(5);
        expect(h.packets).toHaveLength(1);
        expect(h.items).toHaveLength(5);
        expect(h.published.size, "every pinned version must be published — a draft is not executable").toBe(5);
        // Contiguous: a held artifact leaves no gap in what the family is walked through.
        expect(h.items.map((i) => i.sequenceIndex)).toEqual([0, 1, 2, 3, 4]);
        expect(h.forms.map((f) => f.name)).not.toContain("Direct Payment Authorization");
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
        // The ANALYSIS still knows six artifacts; the packet executes five. A held artifact is
        // recorded, never erased from the packet's account of its own sources.
        expect(meta.logical_artifact_ids).toHaveLength(6);
        // Multiple Forms legitimately share a source hash — the document is not duplicated.
        const hashes = (meta.source_documents as any[]).map((d) => d.checksum_sha256);
        expect(new Set(hashes).size).toBe(3);
    });
});

describe("what the packet records about what it did not build", () => {
    it("carries the deferred obligation, its owner and the artifact it held", async () => {
        const h = harness();
        const res = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const [cap] = res.realization.deferred_capabilities;
        expect(cap, "a deferral that is not recorded is a silent omission").toBeDefined();
        expect(cap!.obligation).toBe("PAYMENT_SETUP_REQUIRED");
        expect(cap!.owner_label).toBe("Financials / Payments");
        expect(cap!.source_document_title).toMatch(/handbook/i);
        expect(cap!.deferred_artifact_ids).toHaveLength(1);
        expect(cap!.related_artifact_ids).toContain(cap!.deferred_artifact_ids[0]);

        // Studio reads the packet, not the case — so the record has to be on the packet too.
        const meta = h.packets[0].metadata as Record<string, any>;
        expect(meta.deferred_capabilities).toHaveLength(1);
        expect(meta.obligation_reconciliation.summary).toBe(
            "4 document/payment-like obligations discovered → 3 Enrollment document-upload obligations → 1 deferred Financials/Payments obligation → 0 dropped",
        );
        expect(meta.obligation_reconciliation.dropped).toBe(0);
    });

    it("says in the warnings which artifact it held and why", async () => {
        const h = harness();
        const res = await createPacketFromProcessingAnalysis(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok && res.realization.warnings.join(" ")).toMatch(/Direct Payment Authorization.*payment setup/i);
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
        expect(h.forms).toHaveLength(5);
        expect(h.versions).toHaveLength(5);
        expect(h.packets).toHaveLength(1);
        expect(h.items).toHaveLength(5);
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

/**
 * Correcting a projection that is already published.
 *
 * A published version is immutable and a live session transacts against the version it resolved, so
 * a correction may only ADD a version. These pin that: nothing is published when nothing changed,
 * a stale version is superseded rather than edited, and a re-projection that would change how many
 * boxes the document has is refused outright — that is a different document, not a correction.
 */
describe("re-projecting an already-realized packet", () => {
    async function realized() {
        const h = harness();
        const sb = supabaseDouble(packet, inputs, NAMES);
        const res = await createPacketFromProcessingAnalysis(sb, h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        return { h, sb };
    }

    it("publishes nothing when the projection has not changed", async () => {
        const { h, sb } = await realized();
        const before = h.versions.length;
        const res = await reprojectRealizedPacket(sb, h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.artifacts.every((a) => !a.changed), "an empty version is noise in a certification record").toBe(true);
        expect(h.versions).toHaveLength(before);
    });

    it("supersedes a stale version instead of editing it", async () => {
        const { h, sb } = await realized();
        // The shape the first live packet published: every destination asked, nothing read-only.
        const stale = h.versions[0]!;
        const staleSchema = JSON.parse(JSON.stringify(stale.schemaJson));
        for (const f of staleSchema.fields) delete f.read_only;
        stale.schemaJson = staleSchema;
        const staleItem = h.items.find((i) => i.pinnedVersionId === stale.id)!;

        const res = await reprojectRealizedPacket(sb, h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const entry = res.artifacts.find((a) => a.previous_version_id === stale.id)!;
        expect(entry.changed).toBe(true);
        expect(entry.new_version_number).toBe(2);
        // The old version is still exactly what the family was shown.
        expect(h.versions.find((v) => v.id === stale.id)!.schemaJson).toBe(staleSchema);
        // And the packet now walks the family through the corrected one.
        expect(staleItem.pinnedVersionId).toBe(entry.new_version_id);
        expect(h.published.has(entry.new_version_id!), "a pinned version must be published").toBe(true);
    });

    it("changes what is asked, never how many boxes the document has", async () => {
        const { h, sb } = await realized();
        const stale = h.versions[0]!;
        const staleSchema = JSON.parse(JSON.stringify(stale.schemaJson));
        staleSchema.fields.push({ id: "extra", type: "text", label: "Not on the page", required: false });
        stale.schemaJson = staleSchema;
        const res = await reprojectRealizedPacket(sb, h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("invalid_schema");
        expect(res.message).toMatch(/destinations/);
    });

    it("writes nothing on a dry run", async () => {
        const { h, sb } = await realized();
        const stale = h.versions[0]!;
        const staleSchema = JSON.parse(JSON.stringify(stale.schemaJson));
        for (const f of staleSchema.fields) delete f.read_only;
        stale.schemaJson = staleSchema;
        const count = h.versions.length;
        const res = await reprojectRealizedPacket(sb, h.deps, { orgId: "org", caseId: "case", userId: "user", dryRun: true });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.artifacts.some((a) => a.changed)).toBe(true);
        expect(res.artifacts.every((a) => a.new_version_id === null)).toBe(true);
        expect(h.versions).toHaveLength(count);
    });

    it("refuses a case that was never realized", async () => {
        const h = harness();
        const res = await reprojectRealizedPacket(supabaseDouble(packet, inputs, NAMES), h.deps, { orgId: "org", caseId: "case", userId: "user" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("no_realization");
    });
});
