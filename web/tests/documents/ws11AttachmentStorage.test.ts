/**
 * D10 — the WS11 storage adapter and the Communications hook, over the in-memory service client.
 *
 * Synthetic proof only. The content fetcher is a fake transport (no provider endpoint is called or invented), the
 * malware "verdict source" is a test double that answers about the exact version it is asked about — it is NOT a
 * scanner and nothing here enables one. The in-memory client enforces the `documents` primary key and the processing
 * primary-source uniqueness; the database's own enforcement, the D2 insert trigger and storage RLS are NOT exercised.
 */
import { describe, expect, it, vi } from "vitest";

const adminDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => adminDb.current }));

import { recordDocumentAudit, type DocumentAuditInput, type DocumentAuditResult } from "@/lib/documents/documentAudit";
import {
    INBOUND_ATTACHMENT_BUCKET,
    createWs11AttachmentStorage,
    inboundAttachmentDocumentId,
    type AttachmentContentFetcher,
} from "@/lib/documents/inbound/ws11AttachmentStorage";
import {
    fileInboundAttachmentsForPersistedMessage,
    makeInboundAttachmentFilingDeps,
    makeInboundCaseAnnotator,
} from "@/lib/documents/inbound/inboundAttachmentHook";
import type { MalwareScanBoundary } from "@/lib/documents/inbound/inboundAttachmentFiling";
import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";
import { caseRequiresFiling, loadDocumentCase } from "@/lib/pos/documentFiling/documentFilingService";
import { InMemorySupabase } from "../harness/inMemorySupabase";

const ORG = "0a000000-0000-4000-8000-0000000000f1";
const OTHER = "0b000000-0000-4000-8000-0000000000f1";
const MSG = "3e000000-0000-4000-8000-0000000000f1";
const BINDING = "b1000000-0000-4000-8000-0000000000f1";
const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const pdf = () =>
    enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

function seededDb(over: { org?: string; direction?: string } = {}) {
    const db = new InMemorySupabase();
    db.uniqueOn = { documents: [["id"]] };
    db.seed("communication_messages", [
        {
            id: MSG,
            org_id: over.org ?? ORG,
            direction: over.direction ?? "inbound",
            channel: "email",
            provider_message_id: "resend-email-1",
            communication_provider_binding_id: BINDING,
            metadata: {
                attachments: [{ id: "att-1", filename: "shot record.pdf", content_type: "application/pdf", content_disposition: "attachment", size: 200 }],
            },
        },
    ]);
    return db;
}

function fakeFetcher(bytes: Uint8Array | null = pdf()) {
    const calls: Array<Parameters<AttachmentContentFetcher>[0]> = [];
    const fetchContent: AttachmentContentFetcher = async (args) => {
        calls.push(args);
        return bytes ? { ok: true, bytes } : { ok: false, retryable: false, reason: "provider_not_found" };
    };
    return { fetchContent, calls };
}

function okAudit() {
    const events: DocumentAuditInput[] = [];
    const audit = async (input: DocumentAuditInput): Promise<DocumentAuditResult> => {
        events.push(input);
        return { ok: true, eventId: `ev-${events.length}` };
    };
    return { audit, events };
}

/**
 * Models the migration's `open_processing_case_with_primary_source` on the in-memory client (find, else both inserts
 * with no await between them). The client's default `rpc` answers PGRST202 — a database without the function.
 */
function withAtomicOpen(db: InMemorySupabase) {
    db.rpc = async (fn: string, a?: Record<string, unknown>) => {
        if (fn !== "open_processing_case_with_primary_source" || !a) return { data: null, error: { code: "PGRST202", message: "missing" } };
        const hit = db.rows("processing_case_sources").find((x) => x.org_id === a.p_org_id && x.source_kind === a.p_source_kind && x.source_id === a.p_source_id && x.role === "primary");
        if (hit) return { data: [{ processing_case_id: hit.processing_case_id, created: false }], error: null };
        const id = `ca5e0000-0000-4000-8000-${String(db.rows("processing_cases").length + 1).padStart(12, "0")}`;
        db.seed("processing_cases", [{ id, org_id: a.p_org_id, status: "received", case_type: a.p_case_type, metadata: {} }]);
        db.seed("processing_case_sources", [{ org_id: a.p_org_id, processing_case_id: id, source_kind: a.p_source_kind, source_id: a.p_source_id, role: "primary" }]);
        return { data: [{ processing_case_id: id, created: true }], error: null };
    };
    return db;
}

let seq = 0;
const ids = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const storeArgs = (bytes = pdf()) => ({
    orgId: ORG,
    messageId: MSG,
    attachmentId: "att-1",
    filename: "shot record.pdf",
    mimeType: "application/pdf",
    bytes,
    status: "uploaded",
    screening: { status: "clean" },
});

/**
 * Stands in for the governed release a clean, version-bound verdict will authorize — NOT part of ws11, which never
 * updates a documents row: a structurally clean, scan-held row becomes `uploaded`.
 */
function releaseScanHeld(db: InMemorySupabase) {
    for (const r of db.rows("documents")) {
        const screening = (r.metadata as { screening?: Record<string, unknown> } | null)?.screening;
        if (screening?.malware_hold === "awaiting_verdict" && screening.structural_status === "uploaded") r.status = "uploaded";
    }
}

/** A test double answering about exactly the version it is asked about. Not a scanner. */
const boundVerdicts = (verdict: "clean" | "infected" = "clean"): MalwareScanBoundary => ({
    available: true,
    verdict: async ({ documentId, versionId, checksumSha256 }) => ({
        verdict,
        subject: versionId && checksumSha256 ? { documentId, versionId, checksumSha256 } : null,
    }),
});

describe("the stable document id", () => {
    it("is one UUID per (organization, message, attachment), and differs if any of them differs", () => {
        const a = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        expect(a).toBe(inboundAttachmentDocumentId(ORG, MSG, "att-1"));
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(new Set([a, inboundAttachmentDocumentId(OTHER, MSG, "att-1"), inboundAttachmentDocumentId(ORG, MSG, "att-2"), inboundAttachmentDocumentId(ORG, OTHER, "att-1")]).size).toBe(4);
    });
});

describe("retrieval: only through the injected fetcher, only for this organization's own listed attachment", () => {
    it("without a fetcher the boundary is unavailable and reads nothing", async () => {
        const db = seededDb();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: null });
        expect(s.available).toBe(false);
        expect(await s.retrieve({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual({ ok: false, reason: "storage_unavailable" });
    });

    it("passes the provider's message id and the binding (never a credential) to the fetcher", async () => {
        const f = fakeFetcher();
        const s = createWs11AttachmentStorage({ supabase: seededDb() as never, fetchContent: f.fetchContent });
        const got = await s.retrieve({ orgId: ORG, messageId: MSG, attachmentId: "att-1" });
        expect(got.ok).toBe(true);
        expect(f.calls).toEqual([{ orgId: ORG, providerMessageId: "resend-email-1", providerBindingId: BINDING, attachmentId: "att-1" }]);
    });

    it.each([
        ["another organization's message", seededDb({ org: OTHER }), "att-1", "message_not_owned"],
        ["an outbound message", seededDb({ direction: "outbound" }), "att-1", "message_not_owned"],
        ["an attachment the message does not list", seededDb(), "att-forged", "attachment_not_listed"],
    ])("%s: refused, the fetcher is never called", async (_why, db, attachmentId, reason) => {
        const f = fakeFetcher();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: f.fetchContent });
        expect(await s.retrieve({ orgId: ORG, messageId: MSG, attachmentId })).toEqual({ ok: false, reason });
        expect(f.calls).toHaveLength(0);
    });

    it("a fetcher failure or exception is a reason, not a throw", async () => {
        const s1 = createWs11AttachmentStorage({ supabase: seededDb() as never, fetchContent: fakeFetcher(null).fetchContent });
        expect(await s1.retrieve({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual({ ok: false, reason: "provider_not_found" });
        const s2 = createWs11AttachmentStorage({ supabase: seededDb() as never, fetchContent: async () => { throw new Error("socket"); } });
        expect(await s2.retrieve({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual({ ok: false, reason: "fetch_threw" });
    });
});

describe("storage: the existing document sequence, idempotent on the attachment", () => {
    it("audits first, stores under the organization, writes one documents row naming its version and hash", async () => {
        const db = seededDb();
        const order: string[] = [];
        const a = okAudit();
        const s = createWs11AttachmentStorage({
            supabase: db as never,
            fetchContent: fakeFetcher().fetchContent,
            audit: async (i) => { order.push(`audit:${db.uploadCalls.length}`); return a.audit(i); },
            newId: ids,
        });
        const stored = await s.store(storeArgs());
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        expect(order).toEqual(["audit:0"]); // nothing was uploaded before the audit
        expect(a.events[0]).toMatchObject({ orgId: ORG, actorUserId: null, actorPrincipal: { kind: "system", process: "inbound_email_attachment" }, event: "document_upload_authorized", subject: { type: "documents", id: docId } });
        expect(JSON.stringify(a.events[0])).not.toContain("pos_intake");
        expect(db.uploadCalls).toHaveLength(1);
        expect(db.uploadCalls[0].bucket).toBe(INBOUND_ATTACHMENT_BUCKET);
        expect(db.uploadCalls[0].path.startsWith(`${ORG}/pos_intake/`)).toBe(true);
        const rows = db.rows("documents");
        expect(rows).toHaveLength(1);
        expect(rows[0]).not.toHaveProperty("entity_type");
        expect(rows[0]).toMatchObject({ id: docId, org_id: ORG, status: "uploaded", mime_type: "application/pdf", storage_path: db.uploadCalls[0].path });
        expect(rows[0].checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
        expect((rows[0].metadata as Record<string, unknown>).processing_intent).toBe("store_document");
        expect((rows[0].metadata as Record<string, unknown>).inbound_email).toEqual({ communication_message_id: MSG, attachment_id: "att-1" });
        expect(stored).toEqual({ documentId: docId, orgId: ORG, status: "uploaded", versionId: rows[0].current_version_id, checksumSha256: rows[0].checksum_sha256, structural: "clean" });
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual(stored);
        expect(await s.findStored({ orgId: OTHER, messageId: MSG, attachmentId: "att-1" })).toBeNull();
    });

    it("no audit, no file: nothing uploaded, no row", async () => {
        const db = seededDb();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: async () => ({ ok: false, error: "down" }) });
        await expect(s.store(storeArgs())).rejects.toThrow(/audit/);
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents")).toHaveLength(0);
    });

    it("a repeat returns the stored document without a second upload", async () => {
        const db = seededDb();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        const first = await s.store(storeArgs());
        const second = await s.store(storeArgs());
        expect(second).toEqual(first);
        expect(db.uploadCalls).toHaveLength(1);
    });

    it("two concurrent stores of one attachment: one row; the loser removes only ITS object and returns the winner", async () => {
        const db = seededDb();
        let arrived = 0;
        let release!: () => void;
        const barrier = new Promise<void>((r) => (release = r));
        const a = okAudit();
        const s = createWs11AttachmentStorage({
            supabase: db as never,
            fetchContent: fakeFetcher().fetchContent,
            newId: ids,
            // Both deliveries pass the "already stored?" read before either inserts.
            audit: async (i) => { if (++arrived === 2) release(); await barrier; return a.audit(i); },
        });
        const [x, y] = await Promise.all([s.store(storeArgs()), s.store(storeArgs())]);
        expect(db.rows("documents")).toHaveLength(1);
        const winner = db.rows("documents")[0];
        expect(x).toEqual(y);
        expect(x.versionId).toBe(winner.current_version_id);
        expect(db.uploadCalls).toHaveLength(2);
        const loserPath = db.uploadCalls.map((u) => u.path).find((p) => p !== winner.storage_path)!;
        expect(db.removeCalls).toEqual([{ bucket: INBOUND_ATTACHMENT_BUCKET, paths: [loserPath] }]);
        expect(db.objects.has(`${INBOUND_ATTACHMENT_BUCKET}/${winner.storage_path}`)).toBe(true);
        expect(db.objects.has(`${INBOUND_ATTACHMENT_BUCKET}/${loserPath}`)).toBe(false);
    });

    it("any other insert failure removes only its own object and throws; no row is deleted", async () => {
        const db = seededDb();
        db.failInsertInto.add("documents");
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        await expect(s.store(storeArgs())).rejects.toThrow(/insert failed/);
        expect(db.removeCalls).toEqual([{ bucket: INBOUND_ATTACHMENT_BUCKET, paths: [db.uploadCalls[0].path] }]);
    });
});

describe("the malware hold: structural is read from the persisted result, never from the status", () => {
    const held = (structural: "uploaded" | "quarantined") => ({
        ...storeArgs(),
        status: "quarantined",
        screening: { status: structural === "uploaded" ? "clean" : "flagged", structural_status: structural, malware_hold: "awaiting_verdict" },
    });

    it("a scan-held, structurally clean document is stored quarantined and reported structurally CLEAN", async () => {
        const db = seededDb();
        const a = okAudit();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: a.audit, newId: ids });
        const stored = await s.store(held("uploaded"));
        const row = db.rows("documents")[0];
        expect(row.status).toBe("quarantined");
        expect((row.metadata as { screening: Record<string, unknown> }).screening).toMatchObject({ structural_status: "uploaded", malware_hold: "awaiting_verdict" });
        expect(a.events[0].detail).toMatchObject({ screening_status: "quarantined", structural_status: "uploaded", malware_hold: "awaiting_verdict" });
        expect(stored).toMatchObject({ status: "quarantined", structural: "clean" });
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toMatchObject({ status: "quarantined", structural: "clean" });
    });

    it("a structurally quarantined one stays structurally quarantined", async () => {
        const db = seededDb();
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        await s.store(held("quarantined"));
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toMatchObject({ status: "quarantined", structural: "quarantined" });
    });

    it.each([
        ["quarantined", "quarantined"],
        ["uploaded", "clean"],
    ])("a legacy row (no structural_status) with status %s falls back to %s", async (status, structural) => {
        const db = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("documents", [{ id: docId, org_id: ORG, status, current_version_id: "v1", checksum_sha256: "x", metadata: { screening: { status: "clean" } } }]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual({ documentId: docId, orgId: ORG, status, versionId: "v1", checksumSha256: "x", structural });
    });
});

describe("an operator's audited delete is final: a redelivery never re-creates the attachment", () => {
    const deletion = (documentId: string, event = "document_delete_authorized", org = ORG) => ({
        id: `ev-${documentId}-${event}`,
        org_id: org,
        event_type: event,
        entity_type: "documents",
        entity_id: documentId,
        payload: {},
    });

    it("no row and a recorded deletion: findStored reports it deleted; the pipeline holds it without a fetch or a store", async () => {
        const db = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("workflow_events", [deletion(docId)]);
        const f = fakeFetcher();
        const storage = createWs11AttachmentStorage({ supabase: db as never, fetchContent: f.fetchContent, audit: okAudit().audit, newId: ids });
        expect(await storage.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toEqual({ documentId: docId, orgId: ORG, deleted: true });
        const r = await fileInboundAttachmentsForPersistedMessage(
            { supabase: db as never, filing: { storage, malware: boundVerdicts("clean"), processing: makeProcessingCaseDbDeps(withAtomicOpen(db) as never) } },
            { orgId: ORG, messageId: MSG },
        );
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["attachment_deleted"], documentId: docId });
        expect(f.calls).toHaveLength(0);
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents")).toHaveLength(0);
        expect(db.rows("processing_cases")).toHaveLength(0);
    });

    it("unaffected: another event, another document's or another organization's deletion, or a row that still exists", async () => {
        const db = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("workflow_events", [
            deletion(docId, "document_delete_failed"),
            deletion(inboundAttachmentDocumentId(ORG, MSG, "att-2")),
            deletion(docId, "document_delete_authorized", OTHER),
        ]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toBeNull();
        // A delete that was authorized but never removed the row: the row is what is stored.
        db.seed("workflow_events", [deletion(docId)]);
        db.seed("documents", [{ id: docId, org_id: ORG, status: "uploaded", current_version_id: "v1", checksum_sha256: "x", metadata: {} }]);
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toMatchObject({ documentId: docId, status: "uploaded" });
    });

    it("an unrecognised recorded structural result is read as quarantined (fail closed)", async () => {
        const db = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("documents", [{ id: docId, org_id: ORG, status: "quarantined", current_version_id: "v1", checksum_sha256: "x", metadata: { screening: { structural_status: "Clean?" } } }]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        expect(await s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).toMatchObject({ structural: "quarantined" });
    });

    it("a delete that lands between findStored and store: store refuses, nothing is uploaded or inserted", async () => {
        const db = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("workflow_events", [deletion(docId)]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids });
        await expect(
            s.store({ orgId: ORG, messageId: MSG, attachmentId: "att-1", filename: "a.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]), status: "quarantined", screening: {} as never }),
        ).rejects.toThrow("attachment was deleted");
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents")).toHaveLength(0);
    });
});

describe("the system audit principal", () => {
    it("is recorded as a named process; an unnamed process is refused", async () => {
        const db = new InMemorySupabase();
        adminDb.current = db;
        const ok = await recordDocumentAudit({ orgId: ORG, actorUserId: null, actorPrincipal: { kind: "system", process: "inbound_email_attachment" }, event: "document_upload_authorized", subject: { type: "documents", id: MSG }, route: "r" });
        expect(ok.ok).toBe(true);
        expect(db.rows("workflow_events")[0].payload).toMatchObject({ actor_user_id: null, actor_kind: "system", actor_process: "inbound_email_attachment" });
        const bad = await recordDocumentAudit({ orgId: ORG, actorUserId: null, actorPrincipal: { kind: "system", process: "anything" } as never, event: "document_upload_authorized", subject: { type: "documents", id: MSG }, route: "r" });
        expect(bad).toEqual({ ok: false, error: "actor_required" });
        expect(db.rows("workflow_events")).toHaveLength(1);
    });
});

describe("the Communications hook", () => {
    it("production wiring: every attachment held before a byte is read — even with a fetcher, while no scanner exists", async () => {
        for (const fetchContent of [null, fakeFetcher().fetchContent]) {
            const db = seededDb();
            const f = fakeFetcher();
            const deps = makeInboundAttachmentFilingDeps(db as never, { fetchContent: fetchContent ? f.fetchContent : null });
            const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: deps }, { orgId: ORG, messageId: MSG });
            expect(r.status).toBe("filed");
            expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held" });
            expect(r.status === "filed" && (r.outcomes[0] as { reasons: string[] }).reasons).toContain("malware_scanning_unavailable");
            expect(f.calls).toHaveLength(0);
            expect(db.uploadCalls).toHaveLength(0);
            expect(db.rows("documents")).toHaveLength(0);
            expect(db.rows("processing_cases")).toHaveLength(0);
        }
    });

    it("a message of another organization, or none: nothing is touched", async () => {
        const db = seededDb({ org: OTHER });
        const deps = makeInboundAttachmentFilingDeps(db as never);
        expect(await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: deps }, { orgId: ORG, messageId: MSG })).toEqual({ status: "message_not_found" });
        expect(await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: deps }, { orgId: ORG, messageId: OTHER })).toEqual({ status: "message_not_found" });
    });

    it("composed with a fetcher and a version-bound verdict: one document, one annotated case in the filing queue; redelivery adds nothing", async () => {
        adminDb.current = new InMemorySupabase();
        const db = withAtomicOpen(seededDb());
        const f = fakeFetcher();
        const filing = {
            storage: createWs11AttachmentStorage({ supabase: db as never, fetchContent: f.fetchContent, audit: okAudit().audit, newId: ids }),
            malware: boundVerdicts("clean"),
            processing: makeProcessingCaseDbDeps(db as never),
            annotateCase: makeInboundCaseAnnotator(db as never),
        };
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        // Stored scan-held: no case until the governed release a clean verdict authorizes (modelled here, not by ws11).
        const held = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(held.status === "filed" && held.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["document_unavailable"], documentId: docId });
        expect(db.rows("processing_cases")).toHaveLength(0);
        releaseScanHeld(db);
        const first = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        const second = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(first.status === "filed" && first.outcomes[0]).toMatchObject({ outcome: "case_opened", documentId: docId });
        expect(second.status === "filed" && second.outcomes[0]).toMatchObject({ outcome: "case_existing", documentId: docId });
        expect(f.calls).toHaveLength(1);
        expect(db.rows("documents")).toHaveLength(1);
        expect(db.rows("processing_cases")).toHaveLength(1);
        expect(db.rows("processing_case_sources")).toEqual([expect.objectContaining({ org_id: ORG, source_kind: "email_attachment", source_id: docId, role: "primary" })]);
        const caseRow = db.rows("processing_cases")[0] as { id: string; metadata: Record<string, unknown> };
        expect(caseRequiresFiling(caseRow)).toBe(true);
        expect(caseRow.metadata).toMatchObject({ source_document_filename: "shot record.pdf", inbound_email: { communication_message_id: MSG, attachment_id: "att-1", document_id: docId } });
        expect((await loadDocumentCase(db as never, ORG, caseRow.id))?.documentId).toBe(docId);
    });

    it("a database WITHOUT the atomic function (PGRST202): held as processing_atomic_open_unavailable; no case, no source, no legacy write", async () => {
        const db = seededDb();
        const filing = {
            storage: createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids }),
            malware: boundVerdicts("clean"),
            processing: makeProcessingCaseDbDeps(db as never),
            annotateCase: makeInboundCaseAnnotator(db as never),
        };
        await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        releaseScanHeld(db);
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["processing_atomic_open_unavailable"] });
        expect(db.rows("processing_cases")).toHaveLength(0);
        expect(db.rows("processing_case_sources")).toHaveLength(0);
        // Once the function exists, a redelivery opens the case on the SAME stored document — no second upload.
        withAtomicOpen(db);
        const again = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: { ...filing, processing: makeProcessingCaseDbDeps(db as never) } }, { orgId: ORG, messageId: MSG });
        expect(again.status === "filed" && again.outcomes[0]).toMatchObject({ outcome: "case_opened", documentId: inboundAttachmentDocumentId(ORG, MSG, "att-1") });
        expect(db.uploadCalls).toHaveLength(1);
        expect(db.rows("processing_case_sources")).toHaveLength(1);
    });

    it("a verdict about other bytes never releases: stored, but held with no case", async () => {
        const db = seededDb();
        const stale: MalwareScanBoundary = {
            available: true,
            verdict: async ({ documentId, checksumSha256 }) => ({ verdict: "clean", subject: { documentId, versionId: "5e000000-0000-4000-8000-00000000dead", checksumSha256: checksumSha256 ?? "" } }),
        };
        const filing = {
            storage: createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeFetcher().fetchContent, audit: okAudit().audit, newId: ids }),
            malware: stale,
            processing: makeProcessingCaseDbDeps(db as never),
        };
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["document_unavailable", "malware_verdict_unbound"] });
        expect(db.rows("documents")[0].status).toBe("quarantined");
        expect(db.rows("documents")).toHaveLength(1);
        expect(db.rows("processing_cases")).toHaveLength(0);
    });
});
