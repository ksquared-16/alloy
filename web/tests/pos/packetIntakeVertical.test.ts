/**
 * Slice 3 certification — the operator vertical, end to end.
 *
 *   create a packet case → attach all three sources → run packet_source → every reader executes
 *   → 180 normalized destinations reconcile → 86 facts + 32 obligations → lineage available
 *   → the unsafe physician-phone binding is refused → choice semantics survive
 *   → review decisions persist → NOTHING publishes
 *
 * The database is an in-memory double implementing exactly the four reads and one write the builder
 * performs, plus real bytes from the certification corpus through Storage. It exercises the real
 * builder, the real readers and the real persistence SHAPE. What it does not exercise is Postgres
 * itself and the HTTP authorization layer — the browser leg needs a human to sign the QA identity
 * in, and that is reported rather than simulated.
 */

import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildPacketIntakeForCaseSafe } from "@/lib/pos/packetIntake/buildPacketIntakeForCaseSafe";
import {
    dbLoadPacketIntake,
    dbLoadPacketReview,
    dbStorePacketReview,
    PACKET_INTAKE_METADATA_KEY,
    PACKET_REVIEW_METADATA_KEY,
    type PacketReviewDecision,
} from "@/lib/pos/packetIntake/packetIntakeDb";
import { CERTIFICATION_FIXTURES, HOSTED_FORM_SOURCE_URI } from "@/lib/pos/packetIntake/loadCertificationPacket";
import type { PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";

const ORG = "org-1";
const CASE = "case-1";
const DIR = path.join(process.cwd(), "tests/fixtures/processing");

interface DocRow {
    id: string;
    org_id: string;
    title: string;
    original_filename: string;
    mime_type: string;
    public_url: string | null;
    checksum_sha256: string;
    bucket: string;
    storage_path: string;
    created_at: string;
}

/**
 * The operator's packet: one case, three sources, attached in the order they were uploaded.
 * `role` is `primary` for the first and `related` for the rest — the shape the table already has.
 */
function seed() {
    const bytesOf = (n: string) => fs.readFileSync(path.join(DIR, n));
    const doc = (id: string, file: string, mime: string, title: string, url: string | null): DocRow => ({
        id, org_id: ORG, title, original_filename: file, mime_type: mime, public_url: url,
        checksum_sha256: crypto.createHash("sha256").update(bytesOf(file)).digest("hex"),
        bucket: "documents", storage_path: file, created_at: "2026-08-24T00:00:00.000Z",
    });
    const documents: DocRow[] = [
        doc("doc-handbook", CERTIFICATION_FIXTURES.handbook, "application/pdf", "Family Handbook 2026–2027", null),
        doc("doc-cis", CERTIFICATION_FIXTURES.cis, "application/pdf", "Oregon Certificate of Immunization Status", null),
        doc("doc-formsite", CERTIFICATION_FIXTURES.hostedForm, "text/html", "School of Enrichment Admissions Packet", HOSTED_FORM_SOURCE_URI),
    ];
    const sources = documents.map((d, i) => ({
        org_id: ORG, processing_case_id: CASE, source_kind: "document", source_id: d.id,
        role: i === 0 ? "primary" : "related", linked_at: `2026-08-24T00:0${i}:00.000Z`,
    }));
    const cases = [{ id: CASE, org_id: ORG, metadata: {} as Record<string, unknown> }];
    return { documents, sources, cases };
}

/** A double for exactly the queries the builder and the store perform. Nothing more is emulated. */
function fakeSupabase(db: ReturnType<typeof seed>) {
    const writes: Array<{ table: string; metadataKeys: string[] }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder is self-referential
    type QueryBuilder = any;
    const client = {
        from(table: string): QueryBuilder {
            const filters: Record<string, unknown> = {};
            let inFilter: { col: string; values: unknown[] } | null = null;
            let pendingUpdate: Record<string, unknown> | null = null;
            const api = {
                select() { return api; },
                eq(col: string, val: unknown) { filters[col] = val; return api; },
                in(col: string, values: unknown[]) { inFilter = { col, values }; return api; },
                order() { return api; },
                async maybeSingle() {
                    if (table === "processing_cases") {
                        const row = db.cases.find((c) => c.id === filters.id && c.org_id === filters.org_id) ?? null;
                        return { data: row, error: null };
                    }
                    if (table === "documents") {
                        const row = db.documents.find((d) => d.id === filters.id && d.org_id === filters.org_id) ?? null;
                        return { data: row, error: null };
                    }
                    return { data: null, error: null };
                },
                // Supabase returns a BUILDER from update(), so `.eq()` chains after it and the write
                // lands on await. A double that returns a promise here breaks the chain — which is
                // exactly how this test failed the first time.
                update(patch: Record<string, unknown>) {
                    pendingUpdate = patch;
                    return api;
                },
                then(resolve: (r: { data: unknown; error: null }) => unknown) {
                    if (pendingUpdate) {
                        const patch = pendingUpdate;
                        pendingUpdate = null;
                        if (table === "processing_cases") {
                            const row = db.cases.find((c) => c.id === filters.id && c.org_id === filters.org_id);
                            if (row) Object.assign(row, patch);
                        }
                        writes.push({ table, metadataKeys: Object.keys((patch.metadata ?? {}) as object) });
                        return Promise.resolve(resolve({ data: null, error: null }));
                    }
                    if (table === "processing_case_sources") {
                        return Promise.resolve(resolve({ data: db.sources.filter((s) => s.processing_case_id === filters.processing_case_id && s.org_id === filters.org_id), error: null }));
                    }
                    if (table === "documents" && inFilter) {
                        const f = inFilter as { col: string; values: unknown[] };
                        return Promise.resolve(resolve({ data: db.documents.filter((d) => f.values.includes((d as unknown as Record<string, unknown>)[f.col]) && d.org_id === filters.org_id), error: null }));
                    }
                    return Promise.resolve(resolve({ data: [], error: null }));
                },
            };
            // `update()` is awaited directly by the store layer.
            return api as unknown as ReturnType<typeof client.from>;
        },
        storage: {
            from() {
                return {
                    async download(p: string) {
                        try {
                            const buf = fs.readFileSync(path.join(DIR, p));
                            return { data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, error: null };
                        } catch (e) {
                            return { data: null, error: e };
                        }
                    },
                };
            },
        },
        __writes: writes,
    };
    return client as unknown as Parameters<typeof buildPacketIntakeForCaseSafe>[0] & { __writes: typeof writes };
}

let db: ReturnType<typeof seed>;
let supabase: ReturnType<typeof fakeSupabase>;
let packet: PacketIntakeResult;

beforeAll(async () => {
    db = seed();
    supabase = fakeSupabase(db);
    const built = await buildPacketIntakeForCaseSafe(supabase, { orgId: ORG, caseId: CASE });
    expect(built, "the packet builder must produce a packet from the case's three sources").toBeTruthy();
    packet = built!.packet;
}, 300_000);

describe("create packet case → attach three sources → run packet_source", () => {
    it("reuses the existing case/source owners rather than a second upload system", () => {
        expect(db.sources.map((s) => s.role)).toEqual(["primary", "related", "related"]);
        expect(db.sources.every((s) => s.source_kind === "document")).toBe(true);
        expect(new Set(db.sources.map((s) => s.processing_case_id))).toEqual(new Set([CASE]));
    });

    it("runs every reader — one per source, chosen by format", () => {
        expect(packet.sources.map((s) => `${s.title.slice(0, 6)}:${s.reader}`)).toEqual([
            "Family:layout",
            "Oregon:acroform",
            "School:hosted_form",
        ]);
    });

    it("preserves each source's provenance, including the hosted form's URL and hash", () => {
        const hosted = packet.sources.find((s) => s.reader === "hosted_form")!;
        expect(hosted.source_uri).toBe(HOSTED_FORM_SOURCE_URI);
        expect(hosted.mime_type).toBe("text/html");
        expect(hosted.checksum_sha256).toBe(db.documents.find((d) => d.id === "doc-formsite")!.checksum_sha256);
        expect(hosted.captured_at).toBe("2026-08-24T00:00:00.000Z");
        expect(packet.sources.every((s) => !!s.checksum_sha256)).toBe(true);
    });
});

describe("the packet reconciles and means something", () => {
    it("182 raw destinations normalize to 180, all accounted for", () => {
        expect(packet.reconciliation.total_raw).toBe(182);
        expect(packet.reconciliation.total_reported).toBe(180);
        expect(packet.reconciliation.total_accounted).toBe(180);
        expect(packet.reconciliation.balanced).toBe(true);
        expect(packet.reconciliation.duplicated).toEqual([]);
    });

    it("represents 86 semantic facts and 32 obligations", () => {
        const OBLIGATION = new Set(["acknowledgement", "upload_requirement", "signature"]);
        const merge = new Map<string, string>();
        for (const c of packet.correlations) for (const m of c.members) merge.set(`${m.document_id}:${m.concept_id}`, c.concept_key);
        const facts = new Set<string>();
        const obligations = new Set<string>();
        const sameObligation = new Map<string, string>();
        for (const o of packet.obligations) if (o.relation === "same_obligation") for (const m of o.members) sameObligation.set(`${m.document_id}:${m.concept_id}`, o.id);
        for (const [docId, a] of Object.entries(packet.source_analysis)) {
            const isReference = packet.sources.find((s) => s.document_id === docId)?.fill_intent === "reference";
            for (const c of a.concepts) {
                const key = `${docId}:${c.id}`;
                if (OBLIGATION.has(c.kind)) obligations.add(sameObligation.get(key) ?? `${docId}|${c.id}`);
                else if (!isReference) facts.add(merge.get(key) ?? `${docId}|${c.concept_key ?? c.id}`);
            }
        }
        expect(facts.size).toBe(86);
        expect(obligations.size).toBe(32);
    });

    it("makes source lineage available from a fact", () => {
        const guardianName = packet.source_analysis["doc-formsite"].concepts.find((c) => c.concept_key === "guardian.name")!;
        expect((guardianName.source.destinations ?? []).length).toBeGreaterThanOrEqual(3);
        expect(guardianName.source.destinations!.every((d) => d.evidence && d.section_title)).toBe(true);
    });
});

describe("the unsafe binding is refused", () => {
    it("never offers a person's phone field for the physician's phone", () => {
        const proposals = Object.values(packet.source_analysis).flatMap((a) => a.proposals);
        // Slice 4 gave the physician a canonical home, so the fact is BOUND rather than refused —
        // but never to the household's person record, which is the property that must hold either way.
        const toPersonPhone = proposals.filter(
            (p) => p.target_field_source?.entity_type === "person" && p.target_field_source?.field_key === "phone"
        );
        for (const p of toPersonPhone) {
            const c = Object.values(packet.source_analysis).flatMap((a) => a.concepts).find((x) => x.id === p.candidate_id)!;
            expect(c.party ?? "unknown", `${c.label} bound to person.phone`).not.toMatch(/physician|dentist/);
        }
        const rel = proposals.filter((p) => p.target_relationship_role === "physician");
        expect(rel.length).toBe(2);
    });

    it("proposes no canonical binding whose field belongs to another party", () => {
        const proposals = Object.values(packet.source_analysis).flatMap((a) => a.proposals);
        const bound = proposals.filter((p) => p.disposition === "reuse_canonical_field");
        // 9 proposals, 7 distinct facts: the child's name and date of birth are each proposed in
        // both artifacts that ask for them, and correlation is what makes them one.
        //
        // Was 10/8 before Slice 5. The tenth was a medication question binding at LOW confidence to
        // the generic `medical_notes` field; it is now held for the Health foundation (D-H5).
        expect(bound.length).toBe(9);
        const merged = new Set<string>();
        for (const [docId, a] of Object.entries(packet.source_analysis)) {
            for (const p of a.proposals) {
                if (p.disposition !== "reuse_canonical_field") continue;
                const c = a.concepts.find((x) => x.id === p.candidate_id)!;
                const corr = packet.correlations.find((x) => x.members.some((m) => m.document_id === docId && m.concept_id === c.id));
                merged.add(corr?.concept_key ?? `${docId}|${c.concept_key}`);
            }
        }
        expect(merged.size).toBe(7);
        expect(bound.every((p) => !p.refused_binding)).toBe(true);
    });
});

describe("choice semantics survive", () => {
    it("keeps the hosted form's declared options on the analysed concepts", () => {
        const gender = packet.source_analysis["doc-formsite"].concepts.find((c) => /describe your child's gender/i.test(c.label))!;
        expect(gender.options).toEqual(["Male", "Female", "Gender-diverse"]);
    });
});

describe("review decisions persist, and nothing publishes", () => {
    it("stores the analysis on the case, under its own metadata key", async () => {
        const stored = await dbLoadPacketIntake(supabase, { orgId: ORG, caseId: CASE });
        expect(stored?.reconciliation.total_accounted).toBe(180);
        expect(Object.keys(db.cases[0].metadata)).toContain(PACKET_INTAKE_METADATA_KEY);
    });

    it("persists an operator's decisions separately, so re-running never erases them", async () => {
        const decisions: PacketReviewDecision[] = [
            { subject: "fact", subject_id: "p1", decision: "accepted", decided_by: "operator", decided_at: "2026-08-24T01:00:00.000Z" },
            { subject: "artifact", subject_id: "1:page_1", decision: "renamed", name: "Vaccination record", decided_by: "operator", decided_at: "2026-08-24T01:00:00.000Z" },
            { subject: "obligation", subject_id: "same:x", decision: "confirmed", decided_by: "operator", decided_at: "2026-08-24T01:00:00.000Z" },
        ];
        await dbStorePacketReview(supabase, { orgId: ORG, caseId: CASE, decisions, updatedBy: "operator", now: "2026-08-24T01:00:00.000Z" });
        expect(await dbLoadPacketReview(supabase, { orgId: ORG, caseId: CASE })).toHaveLength(3);

        // Re-running the readers must not touch them.
        await buildPacketIntakeForCaseSafe(supabase, { orgId: ORG, caseId: CASE });
        const after = await dbLoadPacketReview(supabase, { orgId: ORG, caseId: CASE });
        expect(after).toHaveLength(3);
        expect(after.find((d) => d.subject === "artifact")?.name).toBe("Vaccination record");
    });

    it("NEGATIVE CONTROL — the whole vertical writes to exactly one table, and only its metadata", () => {
        const tables = new Set(supabase.__writes.map((w) => w.table));
        expect([...tables]).toEqual(["processing_cases"]);
        const keys = new Set(supabase.__writes.flatMap((w) => w.metadataKeys));
        // Only the analysis and the decisions. No form, no field, no process, no publish.
        expect([...keys].sort()).toEqual([PACKET_INTAKE_METADATA_KEY, PACKET_REVIEW_METADATA_KEY].sort());
    });

    it("POSITIVE CONTROL — the double WOULD have caught a write to a publishing table", () => {
        // Proves the control above can fail: the recorder is not blind to other tables.
        void (supabase.from("form_definitions").update({ x: 1 }) as unknown as Promise<unknown>).then?.(() => {});
        expect(new Set(supabase.__writes.map((w) => w.table))).toContain("form_definitions");
    });
});
