/**
 * D10 pilot — inbound attachments → Processing → canonical filing, as synthetic integration over injected boundaries.
 *
 * Storage (WS11) and malware scanning are in-memory stand-ins for capabilities that do not exist yet; structural
 * screening is the REAL D1c-1 `decideIngestion`, and case opening is the REAL non-form opener over in-memory case
 * storage that enforces the database's unique primary-source rule. Nothing sends; nothing touches a database.
 */
import { describe, expect, it } from "vitest";

import {
    UNAVAILABLE_ATTACHMENT_STORAGE,
    UNAVAILABLE_MALWARE_SCAN,
    fileInboundEmailAttachments,
    type AttachmentStorageBoundary,
    type InboundMessageForFiling,
    type MalwareScanBoundary,
    type StoredAttachment,
} from "@/lib/documents/inbound/inboundAttachmentFiling";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import { DOCUMENT_SOURCE_KINDS, processingFilingKey } from "@/lib/pos/documentFiling/documentFilingModel";
import { loadDocumentCase } from "@/lib/pos/documentFiling/documentFilingService";
import { InMemorySupabase } from "../harness/inMemorySupabase";

const ORG = "0a000000-0000-4000-8000-0000000000e1";
const OTHER = "0b000000-0000-4000-8000-0000000000e1";
const MSG = "3e000000-0000-4000-8000-0000000000e1";
const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const pdf = (extra = "") =>
    enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R " + extra + " >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

function memoryStorage(bytesById: Record<string, Uint8Array>, docOrg = ORG) {
    const rows = new Map<string, StoredAttachment & { key: string }>();
    const calls = { retrieve: 0, store: 0 };
    let n = 0;
    const storage: AttachmentStorageBoundary = {
        available: true,
        async findStored({ messageId, attachmentId }) {
            return rows.get(`${messageId}:${attachmentId}`) ?? null;
        },
        async retrieve({ attachmentId }) {
            calls.retrieve += 1;
            const b = bytesById[attachmentId];
            return b ? { ok: true as const, bytes: b } : { ok: false as const, reason: "provider_unavailable" };
        },
        async store({ messageId, attachmentId, status }) {
            calls.store += 1;
            const key = `${messageId}:${attachmentId}`;
            const existing = rows.get(key);
            if (existing) return existing;
            n += 1;
            const row = { key, documentId: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, orgId: docOrg, status, versionId: `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`, checksumSha256: "c".repeat(64) };
            rows.set(key, row);
            return row;
        },
    };
    return { storage, rows, calls };
}

/**
 * In-memory case storage. `atomic` (default) models the migration's one-transaction function — the check and both
 * inserts happen with no await between them, so no interleaving can split them. `atomic: "missing"` models a database
 * without the function (the port answers null, like PGRST202). Every legacy-sequence call is counted.
 */
function memoryCases(opts: { atomic?: true | "missing" } = {}) {
    const cases: Array<{ id: string; orgId: string; status: string; caseType: string | null }> = [];
    const sources: Array<{ orgId: string; processingCaseId: string; sourceKind: string; sourceId: string; role: string }> = [];
    const legacy = { find: 0, insertCase: 0, insertSource: 0 };
    const primaryOf = (orgId: string, sourceKind: string, sourceId: string) =>
        sources.find((s) => s.orgId === orgId && s.sourceKind === sourceKind && s.sourceId === sourceId && s.role === "primary")?.processingCaseId ?? null;
    const deps: ProcessingCaseDeps = {
        async openCaseWithPrimarySource({ orgId, sourceKind, sourceId, caseType }) {
            if (opts.atomic === "missing") return null;
            const existing = primaryOf(orgId, sourceKind, sourceId);
            if (existing) return { processingCaseId: existing, created: false };
            const id = `ca5e0000-0000-4000-8000-${String(cases.length + 1).padStart(12, "0")}`;
            cases.push({ id, orgId, status: "received", caseType });
            sources.push({ orgId, processingCaseId: id, sourceKind, sourceId, role: "primary" });
            return { processingCaseId: id, created: true };
        },
        async findCaseIdByPrimarySource({ orgId, sourceKind, sourceId }) {
            legacy.find += 1;
            return sources.find((s) => s.orgId === orgId && s.sourceKind === sourceKind && s.sourceId === sourceId && s.role === "primary")?.processingCaseId ?? null;
        },
        async insertCase({ orgId, status, caseType }) {
            legacy.insertCase += 1;
            const id = `ca5e0000-0000-4000-8000-${String(cases.length + 1).padStart(12, "0")}`;
            cases.push({ id, orgId, status, caseType });
            return { id };
        },
        async insertSource(s) {
            legacy.insertSource += 1;
            // uq_pcs_primary_source_once (org_id, source_kind, source_id) WHERE role='primary'
            if (s.role === "primary" && sources.some((x) => x.orgId === s.orgId && x.sourceKind === s.sourceKind && x.sourceId === s.sourceId && x.role === "primary")) {
                throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
            }
            sources.push({ ...s });
        },
    };
    return { deps, cases, sources, legacy };
}

/** A synthetic verdict source (NOT a scanner): answers about exactly the version it was asked about. */
const scanner = (verdict: "clean" | "infected" | "pending"): MalwareScanBoundary => ({
    available: true,
    verdict: async ({ documentId, versionId, checksumSha256 }) => ({
        verdict,
        subject: versionId && checksumSha256 ? { documentId, versionId, checksumSha256 } : null,
    }),
});

const message = (over: Partial<InboundMessageForFiling> = {}): InboundMessageForFiling => ({
    id: MSG,
    orgId: ORG,
    ownership: "owned",
    attachments: [{ id: "att-1", filename: "immunizations.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 400 }],
    ...over,
});

describe("today, in production wiring: everything is held and nothing is retrieved, stored or opened", () => {
    it("UNAVAILABLE storage and scanner hold every attachment with both reasons", async () => {
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments({ storage: UNAVAILABLE_ATTACHMENT_STORAGE, malware: UNAVAILABLE_MALWARE_SCAN, processing: cases.deps }, message());
        expect(out).toEqual([
            { attachmentId: "att-1", sourceKey: `email_attachment:${MSG}:att-1`, outcome: "held", reasons: ["storage_unavailable", "malware_scanning_unavailable"], documentId: null },
        ]);
        expect(cases.cases).toHaveLength(0);
    });
});

describe("with storage and a scanner present (synthetic boundaries)", () => {
    it("a clean, owned attachment: stored once, screened, ONE email_attachment case on the document, no subject", async () => {
        const mem = memoryStorage({ "att-1": pdf() });
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments({ storage: mem.storage, malware: scanner("clean"), processing: cases.deps }, message());
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ outcome: "case_opened", documentId: "d0000000-0000-4000-8000-000000000001" });
        expect(cases.sources).toEqual([
            { orgId: ORG, processingCaseId: cases.cases[0].id, sourceKind: "email_attachment", sourceId: "d0000000-0000-4000-8000-000000000001", role: "primary" },
        ]);
        expect(cases.cases[0]).toMatchObject({ orgId: ORG, status: "received", caseType: null });
        expect(mem.calls).toEqual({ retrieve: 1, store: 1 });
    });

    it("redelivery converges: no second retrieval, document or case", async () => {
        const mem = memoryStorage({ "att-1": pdf() });
        const cases = memoryCases();
        const deps = { storage: mem.storage, malware: scanner("clean"), processing: cases.deps };
        const first = await fileInboundEmailAttachments(deps, message());
        const second = await fileInboundEmailAttachments(deps, message());
        expect(first[0].outcome).toBe("case_opened");
        expect(second[0]).toMatchObject({ outcome: "case_existing", processingCaseId: (first[0] as { processingCaseId: string }).processingCaseId });
        expect(cases.cases).toHaveLength(1);
        expect(mem.calls).toEqual({ retrieve: 1, store: 1 });
    });

    it("two concurrent deliveries of one attachment: one case, one primary source, no orphan, through the atomic open only", async () => {
        const mem = memoryStorage({ "att-1": pdf() });
        const cases = memoryCases();
        const deps = { storage: mem.storage, malware: scanner("clean"), processing: cases.deps };
        const [a, b] = await Promise.all([fileInboundEmailAttachments(deps, message()), fileInboundEmailAttachments(deps, message())]);
        expect([a[0].outcome, b[0].outcome].sort()).toEqual(["case_existing", "case_opened"]);
        expect(cases.cases).toHaveLength(1);
        expect(cases.sources).toHaveLength(1);
        expect(cases.cases.every((c) => cases.sources.some((s) => s.processingCaseId === c.id))).toBe(true);
        expect(cases.legacy).toEqual({ find: 0, insertCase: 0, insertSource: 0 });
    });

    it("D10 requires the atomic open: without it (function missing, or no atomic port) the attachment is HELD and no case or source is written", async () => {
        const missing = memoryCases({ atomic: "missing" });
        const noPort = memoryCases();
        const { openCaseWithPrimarySource: _drop, ...legacyOnly } = noPort.deps;
        void _drop;
        for (const [cases, processing] of [[missing, missing.deps], [noPort, legacyOnly as ProcessingCaseDeps]] as const) {
            const mem = memoryStorage({ "att-1": pdf() });
            const out = await fileInboundEmailAttachments({ storage: mem.storage, malware: scanner("clean"), processing }, message());
            expect(out[0]).toMatchObject({ outcome: "held", reasons: ["processing_atomic_open_unavailable"], documentId: "d0000000-0000-4000-8000-000000000001" });
            expect(cases.cases).toHaveLength(0);
            expect(cases.sources).toHaveLength(0);
            expect(cases.legacy).toEqual({ find: 0, insertCase: 0, insertSource: 0 });
        }
    });

    it("unowned and ambiguous messages: refused before anything is retrieved or stored", async () => {
        for (const m of [message({ ownership: "no_attributable_org", orgId: null }), message({ ownership: "cross_org_ambiguous", orgId: null })]) {
            const mem = memoryStorage({ "att-1": pdf() });
            const cases = memoryCases();
            const out = await fileInboundEmailAttachments({ storage: mem.storage, malware: scanner("clean"), processing: cases.deps }, m);
            expect(out[0].outcome).toBe("held");
            expect((out[0] as { reasons: string[] }).reasons.some((r) => r === "message_not_owned" || r === "message_ownership_ambiguous")).toBe(true);
            expect(mem.calls).toEqual({ retrieve: 0, store: 0 });
            expect(cases.cases).toHaveLength(0);
        }
    });

    it("a document stored in another organization is never opened as a case here", async () => {
        const mem = memoryStorage({ "att-1": pdf() }, OTHER);
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments({ storage: mem.storage, malware: scanner("clean"), processing: cases.deps }, message());
        expect(out[0]).toMatchObject({ outcome: "held", reasons: ["stored_in_another_organization"] });
        expect(cases.cases).toHaveLength(0);
    });

    it("structural screening (real D1c-1): active content is stored QUARANTINED and held; a non-PDF claiming PDF is never stored", async () => {
        const mem = memoryStorage({ "att-1": pdf("/OpenAction << /S /JavaScript /JS (app.alert(1)) >>"), "att-2": enc("MZ\x90\x00 not a pdf") });
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments(
            { storage: mem.storage, malware: scanner("clean"), processing: cases.deps },
            message({ attachments: [
                { id: "att-1", filename: "a.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 300 },
                { id: "att-2", filename: "b.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 30 },
            ] }),
        );
        expect(out[0]).toMatchObject({ outcome: "held", reasons: ["document_unavailable"] });
        expect([...mem.rows.values()][0].status).toBe("quarantined");
        expect(out[1]).toMatchObject({ outcome: "held", reasons: ["screening_refused"] });
        expect(mem.calls.store).toBe(1); // the refused file was never stored
        expect(cases.cases).toHaveLength(0);
    });

    it("oversized, inline and unretrievable attachments are held; nothing is opened", async () => {
        const mem = memoryStorage({});
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments(
            { storage: mem.storage, malware: scanner("clean"), processing: cases.deps },
            message({ attachments: [
                { id: "big", filename: "big.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 50 * 1024 * 1024 },
                { id: "logo", filename: "logo.png", content_type: "image/png", content_disposition: "inline", size: 100 },
                { id: "gone", filename: "x.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 100 },
            ] }),
        );
        expect(out.map((o) => (o as { reasons?: string[] }).reasons)).toEqual([["screening_refused"], ["not_an_attachment"], ["retrieval_failed"]]);
        expect(mem.calls.store).toBe(0);
        expect(cases.cases).toHaveLength(0);
    });

    it("malware: infected and pending are held after storage; the default policy never releases without a scanner", async () => {
        for (const [malware, reason] of [[scanner("infected"), "malware_rejected"], [scanner("pending"), "malware_pending"], [UNAVAILABLE_MALWARE_SCAN, "malware_scanning_unavailable"]] as const) {
            const mem = memoryStorage({ "att-1": pdf() });
            const cases = memoryCases();
            const out = await fileInboundEmailAttachments({ storage: mem.storage, malware, processing: cases.deps }, message());
            expect(out[0].outcome).toBe("held");
            expect((out[0] as { reasons: string[] }).reasons).toContain(reason);
            expect(cases.cases).toHaveLength(0);
        }
    });

    it("D1c-2 fails closed: a throwing scanner, a verdict about another version and a version-less row all hold", async () => {
        const throwing: MalwareScanBoundary = { available: true, verdict: async () => { throw new Error("scanner down"); } };
        const otherVersion: MalwareScanBoundary = {
            available: true,
            verdict: async ({ documentId, checksumSha256 }) => ({ verdict: "clean", subject: { documentId, versionId: "5e000000-0000-4000-8000-0000000000ff", checksumSha256: checksumSha256 ?? "" } }),
        };
        for (const [malware, reason] of [[throwing, "malware_rejected"], [otherVersion, "malware_verdict_unbound"]] as const) {
            const mem = memoryStorage({ "att-1": pdf() });
            const cases = memoryCases();
            const out = await fileInboundEmailAttachments({ storage: mem.storage, malware, processing: cases.deps }, message());
            expect(out[0]).toMatchObject({ outcome: "held", reasons: [reason] });
            expect(cases.cases).toHaveLength(0);
        }
        // Storage that cannot name the version: even the bound test double cannot release it.
        const mem = memoryStorage({ "att-1": pdf() });
        const versionless: typeof mem.storage = { ...mem.storage, store: async (x) => ({ ...(await mem.storage.store(x)), versionId: null }) };
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments({ storage: versionless, malware: scanner("clean"), processing: cases.deps }, message());
        expect(out[0]).toMatchObject({ outcome: "held", reasons: ["malware_verdict_unbound"] });
        expect(cases.cases).toHaveLength(0);
    });

    it("the case is annotated on every converged open (a lost annotation is repaired by redelivery); a failing annotator never forks or fails", async () => {
        const mem = memoryStorage({ "att-1": pdf() });
        const cases = memoryCases();
        const seen: string[] = [];
        let fail = true;
        const annotateCase = async (x: { processingCaseId: string; documentId: string; messageId: string; attachmentId: string; filename: string | null }) => {
            seen.push(`${x.processingCaseId}|${x.documentId}|${x.messageId}|${x.attachmentId}|${x.filename}`);
            if (fail) { fail = false; throw new Error("lost"); }
        };
        const deps = { storage: mem.storage, malware: scanner("clean"), processing: cases.deps, annotateCase };
        const first = await fileInboundEmailAttachments(deps, message());
        const second = await fileInboundEmailAttachments(deps, message());
        expect(first[0].outcome).toBe("case_opened");
        expect(second[0].outcome).toBe("case_existing");
        expect(cases.cases).toHaveLength(1);
        expect(seen).toHaveLength(2);
        expect(new Set(seen).size).toBe(1);
        expect(seen[0]).toBe(`${cases.cases[0].id}|d0000000-0000-4000-8000-000000000001|${MSG}|att-1|immunizations.pdf`);
    });

    it("a storage failure holds that attachment only; the next one proceeds", async () => {
        const mem = memoryStorage({ "a1": pdf(), "a2": pdf() });
        const flaky: typeof mem.storage = { ...mem.storage, store: async (x) => { if (x.attachmentId === "a1") throw new Error("bucket down"); return mem.storage.store(x); } };
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments(
            { storage: flaky, malware: scanner("clean"), processing: cases.deps },
            message({ attachments: ["a1", "a2"].map((id) => ({ id, filename: `${id}.pdf`, content_type: "application/pdf", content_disposition: "attachment", size: 400 })) }),
        );
        expect(out.map((o) => o.outcome)).toEqual(["held", "case_opened"]);
        expect(out[0]).toMatchObject({ reasons: ["attachment_not_stored"] });
    });

    it("an explicit structural-only policy releases on D1c-1 alone", async () => {
        const mem = memoryStorage({ "att-1": pdf() });
        const cases = memoryCases();
        const out = await fileInboundEmailAttachments({ storage: mem.storage, malware: UNAVAILABLE_MALWARE_SCAN, processing: cases.deps, policy: { requireMalwareScan: false } }, message());
        expect(out[0].outcome).toBe("case_opened");
    });

    it("nothing in the pipeline can send: its dependencies carry no messaging capability", () => {
        const deps = { storage: UNAVAILABLE_ATTACHMENT_STORAGE, malware: UNAVAILABLE_MALWARE_SCAN, processing: memoryCases().deps };
        expect(Object.keys(deps).sort()).toEqual(["malware", "processing", "storage"]);
    });
});

describe("filing: an email_attachment case is filed by the canonical document path", () => {
    it("email_attachment is a filing-queue document source, and the case resolves to its document", async () => {
        expect(DOCUMENT_SOURCE_KINDS).toContain("email_attachment");
        const db = new InMemorySupabase();
        const CASE = "ca5e0000-0000-4000-8000-0000000000e1";
        const DOC = "d0000000-0000-4000-8000-0000000000e1";
        db.seed("processing_cases", [{ id: CASE, org_id: ORG, status: "received", case_type: null, created_at: "2026-10-30T00:00:00Z", status_changed_at: null, metadata: {} }]);
        db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: CASE, source_kind: "email_attachment", source_id: DOC, role: "primary" }]);
        const loaded = await loadDocumentCase(db as never, ORG, CASE);
        expect(loaded?.documentId).toBe(DOC);
        // No subject is proposed: the case waits in "Needs a record" until an operator chooses.
        expect(loaded?.proposal.primary ?? null).toBeNull();
        expect(processingFilingKey(CASE, DOC)).toBe(`processing_case:${CASE}:document:${DOC}`);
    });
});
