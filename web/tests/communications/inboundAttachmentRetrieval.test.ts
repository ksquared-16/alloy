/**
 * D10-F1 / D10-S1 — inbound attachment retrieval under the organization's own credential, behind a flag that is OFF,
 * and the message link it writes when on.
 *
 * Over the in-memory service client and a FAKE provider transport (no Resend endpoint is called; the URLs are the
 * published contract `resendAttachmentContentFetcher.ts` already pins). The malware "verdict source" in the composed
 * cases is a test double answering about exactly the version it is asked about — NOT a scanner; nothing enables one.
 * What is proven:
 *   - the flag defaults OFF, and OFF is byte-for-byte the old production default (no fetcher, no link);
 *   - the key is the binding's org-owned credential only: a deployment key, an `env:` reference, a disabled or foreign
 *     binding fetch nothing, and the environment is never read;
 *   - composed ON (ingestion-shaped message → storage → fetcher → credential → document → link → case), redelivery
 *     converges, and a lost link heals without a second object;
 *   - even ON, the production deps still hold every attachment before a byte is read while no scanner exists.
 * Not proven here: the database (see certification/invariants/communication-message-attachments-preapply.sql), a real
 * provider, a scanner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const adminDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => adminDb.current }));

import {
    INBOUND_ATTACHMENT_RETRIEVAL_FLAG,
    inboundAttachmentFilingOptions,
    isInboundAttachmentRetrievalEnabled,
    makeInboundAttachmentContentFetcher,
    resolveInboundAttachmentRetrievalKey,
} from "@/lib/communications/email/inboundAttachmentRetrieval";
import {
    fileInboundAttachmentsForPersistedMessage,
    makeInboundAttachmentFilingDeps,
} from "@/lib/documents/inbound/inboundAttachmentHook";
import { createWs11AttachmentStorage, inboundAttachmentDocumentId } from "@/lib/documents/inbound/ws11AttachmentStorage";
import type { InboundAttachmentFilingDeps, MalwareScanBoundary } from "@/lib/documents/inbound/inboundAttachmentFiling";
import { InMemorySupabase } from "../harness/inMemorySupabase";

const ORG = "0a000000-0000-4000-8000-0000000000a1";
const OTHER = "0b000000-0000-4000-8000-0000000000a1";
const MSG = "3e000000-0000-4000-8000-0000000000a1";
const BINDING = "b1000000-0000-4000-8000-0000000000a1";
const ORG_KEY = "re_org_owned_key_for_test";
const DEPLOYMENT_KEY = "re_deployment_key_must_never_be_used";
const VAULT_REF = "vault:org-credential-0001";
const LINKS = "communication_message_attachments";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const PDF = enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const ON = { [INBOUND_ATTACHMENT_RETRIEVAL_FLAG]: "true" };

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

type BindingSeed = { org_id?: string; channel?: string; provider?: string; status?: string; secret_ref?: string };

/** The rows ingestion persists: an owned inbound email naming its binding, and the binding itself. */
function seededDb(binding: BindingSeed = {}, credential: string | null = ORG_KEY) {
    const db = new InMemorySupabase();
    db.uniqueOn = { documents: [["id"]], [LINKS]: [["message_id", "provider_attachment_id"], ["message_id", "document_id"]] };
    db.seed("communication_provider_bindings", [
        { id: BINDING, org_id: ORG, channel: "email", provider: "resend", status: "active", secret_ref: VAULT_REF, ...binding },
    ]);
    db.seed("communication_messages", [
        {
            id: MSG,
            org_id: ORG,
            direction: "inbound",
            channel: "email",
            provider_message_id: "resend-email-1",
            communication_provider_binding_id: BINDING,
            metadata: {
                attachments: [{ id: "att-1", filename: "shot record.pdf", content_type: "application/pdf", content_disposition: "attachment", size: PDF.byteLength }],
            },
        },
    ]);
    const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    db.rpc = async (fn: string, a?: Record<string, unknown>) => {
        rpcCalls.push({ fn, args: a });
        if (fn === "org_provider_credential_resolve") {
            // The database authority: only this organization's own reference resolves.
            const ok = credential !== null && a?.p_org_id === ORG && a?.p_secret_ref === VAULT_REF;
            return { data: ok ? credential : null, error: null };
        }
        if (fn === "open_processing_case_with_primary_source" && a) {
            const hit = db.rows("processing_case_sources").find((x) => x.org_id === a.p_org_id && x.source_id === a.p_source_id && x.role === "primary");
            if (hit) return { data: [{ processing_case_id: hit.processing_case_id, created: false }], error: null };
            const id = `ca5e0000-0000-4000-8000-${String(db.rows("processing_cases").length + 1).padStart(12, "0")}`;
            db.seed("processing_cases", [{ id, org_id: a.p_org_id, status: "received", case_type: a.p_case_type, metadata: {} }]);
            db.seed("processing_case_sources", [{ org_id: a.p_org_id, processing_case_id: id, source_kind: a.p_source_kind, source_id: a.p_source_id, role: "primary" }]);
            return { data: [{ processing_case_id: id, created: true }], error: null };
        }
        return { data: null, error: { code: "PGRST202", message: `missing ${fn}` } };
    };
    return { db, rpcCalls };
}

/** Resend's two documented requests, faked: metadata + signed URL from the API, bytes from the CDN. */
function fakeResend(bytes: Uint8Array = PDF) {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({ url, authorization: headers.get("authorization") });
        if (url.startsWith("https://api.resend.com/emails/receiving/")) {
            return new Response(
                JSON.stringify({
                    object: "attachment",
                    id: "att-1",
                    size: bytes.byteLength,
                    content_type: "application/pdf",
                    download_url: "https://inbound-cdn.resend.com/signed/att-1?sig=x",
                    expires_at: "2999-01-01T00:00:00.000Z",
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        }
        if (url.startsWith("https://inbound-cdn.resend.com/")) {
            return new Response(bytes.slice(), { status: 200, headers: { "content-length": String(bytes.byteLength) } });
        }
        return new Response("unexpected", { status: 599 });
    }) as typeof fetch;
    return { fetchImpl, calls };
}

const boundVerdicts: MalwareScanBoundary = {
    available: true,
    verdict: async ({ documentId, versionId, checksumSha256 }) => ({
        verdict: "clean",
        subject: versionId && checksumSha256 ? { documentId, versionId, checksumSha256 } : null,
    }),
};

let seq = 0;
const ids = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const okAudit = async () => ({ ok: true as const, eventId: `ev-${++seq}` });

/** The production deps for the flag's options, with only the scanner (absent in production) replaced by the double. */
function composed(db: InMemorySupabase, fetchImpl: typeof fetch): InboundAttachmentFilingDeps {
    const opts = inboundAttachmentFilingOptions(db as never, { env: ON, fetchImpl });
    const prod = makeInboundAttachmentFilingDeps(db as never, opts);
    return {
        ...prod,
        storage: createWs11AttachmentStorage({ supabase: db as never, fetchContent: opts.fetchContent, linkAttachments: opts.linkAttachments, audit: okAudit, newId: ids }),
        malware: boundVerdicts,
    };
}

describe("the flag: OFF unless explicitly on", () => {
    it.each([undefined, "", "0", "false", "off", "no", "enabled", "truthy", "2"])("%j → off", (v) => {
        expect(isInboundAttachmentRetrievalEnabled({ [INBOUND_ATTACHMENT_RETRIEVAL_FLAG]: v })).toBe(false);
    });

    it.each(["1", "true", "TRUE", " on ", "yes"])("%j → on", (v) => {
        expect(isInboundAttachmentRetrievalEnabled({ [INBOUND_ATTACHMENT_RETRIEVAL_FLAG]: v })).toBe(true);
    });

    it("reads the process environment by default, where it is unset", () => {
        vi.stubEnv(INBOUND_ATTACHMENT_RETRIEVAL_FLAG, undefined as unknown as string);
        expect(isInboundAttachmentRetrievalEnabled()).toBe(false);
        const { db } = seededDb();
        expect(inboundAttachmentFilingOptions(db as never)).toEqual({ fetchContent: null, linkAttachments: false });
    });

    it("OFF is the old production default: no fetcher, no link, and the hook holds before any read or write", async () => {
        const { db, rpcCalls } = seededDb();
        const t = fakeResend();
        vi.stubGlobal("fetch", t.fetchImpl);
        const deps = makeInboundAttachmentFilingDeps(db as never, inboundAttachmentFilingOptions(db as never, { env: {} }));
        expect(deps.storage.available).toBe(false);
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: deps }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["storage_unavailable", "malware_scanning_unavailable"] });
        expect(t.calls).toEqual([]);
        expect(rpcCalls).toEqual([]);
        expect(db.uploadCalls).toEqual([]);
        for (const table of ["documents", LINKS, "processing_cases"]) expect(db.rows(table), table).toEqual([]);
    });

    it("ON, with the production deps and no scanner: still held before a byte is read — the flag releases nothing", async () => {
        const { db, rpcCalls } = seededDb();
        const t = fakeResend();
        const deps = makeInboundAttachmentFilingDeps(db as never, inboundAttachmentFilingOptions(db as never, { env: ON, fetchImpl: t.fetchImpl }));
        expect(deps.storage.available).toBe(true);
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: deps }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["malware_scanning_unavailable"] });
        expect(t.calls).toEqual([]);
        expect(rpcCalls).toEqual([]);
        for (const table of ["documents", LINKS]) expect(db.rows(table), table).toEqual([]);
    });
});

describe("the key: the binding's org-owned credential, or nothing", () => {
    it("resolves the message binding's vault reference through the database authority, for this organization", async () => {
        const { db, rpcCalls } = seededDb();
        expect(await resolveInboundAttachmentRetrievalKey(db as never, { orgId: ORG, providerBindingId: BINDING })).toEqual({ ok: true, apiKey: ORG_KEY });
        expect(rpcCalls).toEqual([{ fn: "org_provider_credential_resolve", args: { p_org_id: ORG, p_secret_ref: VAULT_REF } }]);
    });

    it.each<[string, BindingSeed, string | null, string]>([
        ["a deployment variable reference, with the deployment key set", { secret_ref: "env:RESEND_API_KEY" }, ORG_KEY, "no_org_credential"],
        ["no credential configured, with the deployment key set", { secret_ref: "unconfigured" }, ORG_KEY, "no_org_credential"],
        ["a revoked or unresolvable org credential", {}, null, "org_credential_unavailable"],
        ["a disabled binding", { status: "disabled" }, ORG_KEY, "binding_disabled"],
        ["an SMS binding", { channel: "sms" }, ORG_KEY, "binding_not_resend_email"],
        ["another provider", { provider: "postmark" }, ORG_KEY, "binding_not_resend_email"],
        ["another organization's binding", { org_id: OTHER }, ORG_KEY, "binding_missing"],
    ])("%s → %s, and the environment is never the answer", async (_label, binding, credential, reason) => {
        vi.stubEnv("RESEND_API_KEY", DEPLOYMENT_KEY);
        const { db } = seededDb(binding, credential);
        const got = await resolveInboundAttachmentRetrievalKey(db as never, { orgId: ORG, providerBindingId: BINDING });
        expect(got).toEqual({ ok: false, reason });
        expect(JSON.stringify(got)).not.toContain(DEPLOYMENT_KEY);
    });

    it("a message with no binding has no key", async () => {
        const { db, rpcCalls } = seededDb();
        expect(await resolveInboundAttachmentRetrievalKey(db as never, { orgId: ORG, providerBindingId: null })).toEqual({ ok: false, reason: "binding_missing" });
        expect(rpcCalls).toEqual([]);
    });

    it("the fetcher sends the org key to the API only, sends no credential to the CDN, and never the deployment key", async () => {
        vi.stubEnv("RESEND_API_KEY", DEPLOYMENT_KEY);
        const { db } = seededDb();
        const t = fakeResend();
        const got = await makeInboundAttachmentContentFetcher(db as never, { fetchImpl: t.fetchImpl })({
            orgId: ORG,
            providerMessageId: "resend-email-1",
            providerBindingId: BINDING,
            attachmentId: "att-1",
        });
        expect(got).toEqual({ ok: true, bytes: PDF });
        expect(t.calls).toEqual([
            { url: "https://api.resend.com/emails/receiving/resend-email-1/attachments/att-1", authorization: `Bearer ${ORG_KEY}` },
            { url: "https://inbound-cdn.resend.com/signed/att-1?sig=x", authorization: null },
        ]);
    });

    it("no credential: a retryable reason that names no secret, and no provider request", async () => {
        vi.stubEnv("RESEND_API_KEY", DEPLOYMENT_KEY);
        const { db } = seededDb({ secret_ref: "env:RESEND_API_KEY" });
        const t = fakeResend();
        const got = await makeInboundAttachmentContentFetcher(db as never, { fetchImpl: t.fetchImpl })({
            orgId: ORG,
            providerMessageId: "resend-email-1",
            providerBindingId: BINDING,
            attachmentId: "att-1",
        });
        expect(got).toEqual({ ok: false, retryable: true, reason: "credential_unavailable" });
        expect(t.calls).toEqual([]);
    });
});

describe("composed ON: message → storage → fetcher → org credential → document → link → case", () => {
    it("one fetch, one object, one document, one link, one case; a redelivery adds nothing", async () => {
        adminDb.current = new InMemorySupabase();
        const { db } = seededDb();
        const t = fakeResend();
        const filing = composed(db, t.fetchImpl);
        const first = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        const second = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        expect(first.status === "filed" && first.outcomes[0]).toMatchObject({ outcome: "case_opened", documentId: docId });
        expect(second.status === "filed" && second.outcomes[0]).toMatchObject({ outcome: "case_existing", documentId: docId });
        expect(t.calls).toHaveLength(2);
        expect(db.uploadCalls).toHaveLength(1);
        expect(db.rows("documents")).toEqual([expect.objectContaining({ id: docId, org_id: ORG, status: "uploaded", checksum_sha256: expect.any(String) })]);
        expect(db.rows(LINKS)).toEqual([expect.objectContaining({ org_id: ORG, message_id: MSG, document_id: docId, provider_attachment_id: "att-1", disposition: "attachment" })]);
        expect(db.rows("processing_case_sources")).toEqual([expect.objectContaining({ org_id: ORG, source_kind: "email_attachment", source_id: docId })]);
    });

    it("a lost link (written document, failed link) holds once, then heals on redelivery with no second object", async () => {
        adminDb.current = new InMemorySupabase();
        const { db } = seededDb();
        const t = fakeResend();
        const filing = composed(db, t.fetchImpl);
        db.failInsertInto.add(LINKS);
        const first = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(first.status === "filed" && first.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["attachment_not_stored"] });
        expect(db.rows("documents")).toHaveLength(1);
        expect(db.rows(LINKS)).toEqual([]);
        expect(db.rows("processing_cases")).toEqual([]);

        db.failInsertInto.delete(LINKS);
        const again = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(again.status === "filed" && again.outcomes[0]).toMatchObject({ outcome: "case_opened" });
        expect(db.uploadCalls).toHaveLength(1);
        expect(db.rows("documents")).toHaveLength(1);
        expect(db.rows(LINKS)).toHaveLength(1);
    });

    it("a concurrent writer's link is success, not failure", async () => {
        const { db } = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("documents", [{ id: docId, org_id: ORG, status: "uploaded", current_version_id: "v1", checksum_sha256: "x" }]);
        db.seed(LINKS, [{ org_id: ORG, message_id: MSG, document_id: docId, provider_attachment_id: "att-1", disposition: "attachment" }]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeResend().fetchImpl as never, linkAttachments: true, audit: okAudit, newId: ids });
        await expect(
            s.store({ orgId: ORG, messageId: MSG, attachmentId: "att-1", filename: "a.pdf", mimeType: "application/pdf", bytes: PDF, status: "uploaded", screening: {} }),
        ).resolves.toMatchObject({ documentId: docId });
        expect(db.rows(LINKS)).toHaveLength(1);
        expect(db.uploadCalls).toEqual([]);
    });

    it("a link naming another document for the same provider attachment is refused, never overwritten", async () => {
        const { db } = seededDb();
        const docId = inboundAttachmentDocumentId(ORG, MSG, "att-1");
        db.seed("documents", [{ id: docId, org_id: ORG, status: "uploaded", current_version_id: "v1", checksum_sha256: "x" }]);
        db.seed(LINKS, [{ org_id: ORG, message_id: MSG, document_id: "d0000000-0000-4000-8000-00000000beef", provider_attachment_id: "att-1", disposition: "attachment" }]);
        const s = createWs11AttachmentStorage({ supabase: db as never, fetchContent: fakeResend().fetchImpl as never, linkAttachments: true, audit: okAudit, newId: ids });
        await expect(s.findStored({ orgId: ORG, messageId: MSG, attachmentId: "att-1" })).rejects.toThrow(/another document/);
        await expect(
            s.store({ orgId: ORG, messageId: MSG, attachmentId: "att-1", filename: "a.pdf", mimeType: "application/pdf", bytes: PDF, status: "uploaded", screening: {} }),
        ).rejects.toThrow(/another document|conflicts/);
        expect(db.rows(LINKS)).toHaveLength(1);
    });

    it("an unresolvable org credential holds the attachment as a retrieval failure: no provider request, nothing stored", async () => {
        const { db } = seededDb({}, null);
        const t = fakeResend();
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing: composed(db, t.fetchImpl) }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "held", reasons: ["retrieval_failed"] });
        expect(t.calls).toEqual([]);
        for (const table of ["documents", LINKS, "processing_cases"]) expect(db.rows(table), table).toEqual([]);
    });

    it("links off (the default): storage never reads or writes the link table", async () => {
        adminDb.current = new InMemorySupabase();
        const { db } = seededDb();
        const t = fakeResend();
        const filing = { ...composed(db, t.fetchImpl), storage: createWs11AttachmentStorage({ supabase: db as never, fetchContent: makeInboundAttachmentContentFetcher(db as never, { fetchImpl: t.fetchImpl }), audit: okAudit, newId: ids }) };
        db.failInsertInto.add(LINKS);
        const r = await fileInboundAttachmentsForPersistedMessage({ supabase: db as never, filing }, { orgId: ORG, messageId: MSG });
        expect(r.status === "filed" && r.outcomes[0]).toMatchObject({ outcome: "case_opened" });
        expect(db.rows(LINKS)).toEqual([]);
    });
});
