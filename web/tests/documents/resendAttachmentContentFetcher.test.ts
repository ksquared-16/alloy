/**
 * D10 — the Resend per-attachment content adapter, over a FAKE HTTP transport. No provider, account, mailbox or
 * credential is touched; the "key" below is a placeholder string. What is proven: the two documented requests, the
 * key's destination, the CDN host binding (no SSRF, no redirects), size / timeout / retry classification, the
 * attachment-id binding, output secrecy, and that a stored attachment is never fetched twice. NOT proven: that the
 * live provider behaves as its documentation says (no live call is authorized), or production enablement (none).
 */
import { describe, expect, it } from "vitest";

import {
    RESEND_ATTACHMENT_DOWNLOAD_HOST,
    fetchResendAttachmentContent,
    isTrustedResendDownloadUrl,
    makeResendAttachmentContentFetcher,
} from "@/lib/documents/inbound/resendAttachmentContentFetcher";
import { createWs11AttachmentStorage } from "@/lib/documents/inbound/ws11AttachmentStorage";
import { fileInboundEmailAttachments, type MalwareScanBoundary } from "@/lib/documents/inbound/inboundAttachmentFiling";
import { makeInboundAttachmentFilingDeps } from "@/lib/documents/inbound/inboundAttachmentHook";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import { InMemorySupabase } from "../harness/inMemorySupabase";

const KEY = "re_placeholder_not_a_real_key_0000";
const EMAIL = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";
const ATT = "2a0c9ce0-3112-4728-976e-47ddcd16a318";
const SIGNED = `https://${RESEND_ATTACHMENT_DOWNLOAD_HOST}/att/${ATT}?sig=SIGNEDTOKEN123&exp=1`;
const ORG = "0a000000-0000-4000-8000-0000000000a7";
const MSG = "3e000000-0000-4000-8000-0000000000a7";
const NOW = new Date("2026-10-31T02:00:00Z");
const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const PDF = enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

type Call = { url: string; headers: Record<string, string>; redirect: string | undefined };

function meta(over: Record<string, unknown> = {}) {
    return { object: "attachment", id: ATT, filename: "shots.pdf", size: PDF.byteLength, content_type: "application/pdf", content_disposition: "attachment", content_id: null, download_url: SIGNED, expires_at: "2026-10-31T03:00:00Z", ...over };
}

/** A transport answering the metadata call and the download from scripted handlers; every request is recorded. */
function transport(opts: {
    meta?: () => Response;
    download?: () => Response;
} = {}) {
    const calls: Call[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        calls.push({ url, headers, redirect: init?.redirect });
        if (url.startsWith("https://api.resend.com/")) return opts.meta ? opts.meta() : Response.json(meta());
        return opts.download ? opts.download() : new Response(PDF, { status: 200, headers: { "content-type": "application/pdf" } });
    }) as typeof fetch;
    return { calls, fetchImpl };
}

const run = (t: ReturnType<typeof transport>, over: Partial<Parameters<typeof fetchResendAttachmentContent>[0]> = {}) =>
    fetchResendAttachmentContent({ emailId: EMAIL, attachmentId: ATT, apiKey: KEY, fetchImpl: t.fetchImpl, now: () => NOW, ...over });

describe("the documented two-step contract", () => {
    it("metadata from api.resend.com WITH the key; bytes from the CDN WITHOUT it; redirects never followed", async () => {
        const t = transport();
        const r = await run(t);
        expect(r).toEqual({ ok: true, bytes: PDF });
        expect(t.calls.map((c) => c.url)).toEqual([`https://api.resend.com/emails/receiving/${EMAIL}/attachments/${ATT}`, SIGNED]);
        expect(t.calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
        expect(t.calls[1].headers.authorization).toBeUndefined();
        expect(JSON.stringify(t.calls[1].headers)).not.toContain(KEY);
        expect(t.calls.map((c) => c.redirect)).toEqual(["manual", "manual"]);
    });
});

describe("refusals before any request", () => {
    it.each([["path traversal", "../../emails"], ["slash", "a/b"], ["query", "x?y=1"], ["empty", " "]])("%s in an id: permanent, nothing sent", async (_w, bad) => {
        const t = transport();
        expect(await run(t, { attachmentId: bad })).toEqual({ ok: false, retryable: false, reason: "invalid_provider_id" });
        expect(await run(t, { emailId: bad })).toEqual({ ok: false, retryable: false, reason: "invalid_provider_id" });
        expect(t.calls).toHaveLength(0);
    });

    it("no key: retryable (configuration), nothing sent", async () => {
        const t = transport();
        expect(await run(t, { apiKey: "" })).toEqual({ ok: false, retryable: true, reason: "missing_api_key" });
        expect(t.calls).toHaveLength(0);
    });
});

describe("download binding: only the provider's CDN, over HTTPS (no SSRF)", () => {
    const hostile = [
        "http://inbound-cdn.resend.com/a",
        "https://inbound-cdn.resend.com.evil.example/a",
        "https://evil.example/inbound-cdn.resend.com/a",
        "https://user:pw@inbound-cdn.resend.com/a",
        "https://inbound-cdn.resend.com:8443/a",
        "https://169.254.169.254/latest/meta-data",
        "https://api.resend.com/emails",
        "file:///etc/passwd",
        "//inbound-cdn.resend.com/a",
        42,
        null,
    ];
    it.each(hostile.map((h) => [String(h), h]))("%s: refused permanently, never fetched", async (_l, url) => {
        const t = transport({ meta: () => Response.json(meta({ download_url: url })) });
        expect(await run(t)).toEqual({ ok: false, retryable: false, reason: "download_url_untrusted" });
        expect(t.calls).toHaveLength(1);
        expect(isTrustedResendDownloadUrl(url)).toBe(false);
    });

    it("a redirect on either request is refused, never followed", async () => {
        const redirect = () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
        expect(await run(transport({ meta: redirect }))).toEqual({ ok: false, retryable: false, reason: "provider_redirect_refused" });
        const t = transport({ download: redirect });
        expect(await run(t)).toEqual({ ok: false, retryable: false, reason: "download_redirect_refused" });
        expect(t.calls).toHaveLength(2);
    });
});

describe("the attachment is the one asked for", () => {
    it.each([
        ["another attachment id", { id: "ffffffff-3112-4728-976e-47ddcd16a318" }],
        ["not an attachment object", { object: "email" }],
    ])("%s: permanent, no download", async (_w, over) => {
        const t = transport({ meta: () => Response.json(meta(over)) });
        expect(await run(t)).toEqual({ ok: false, retryable: false, reason: "attachment_mismatch" });
        expect(t.calls).toHaveLength(1);
    });

    it("an unparseable metadata body: permanent", async () => {
        expect(await run(transport({ meta: () => new Response("<html>", { status: 200 }) }))).toEqual({ ok: false, retryable: false, reason: "unparseable_response" });
    });
});

describe("size, expiry, timeout and retry classification", () => {
    it("declared size over the cap: refused before download", async () => {
        const t = transport({ meta: () => Response.json(meta({ size: 11 * 1024 * 1024 })) });
        expect(await run(t)).toEqual({ ok: false, retryable: false, reason: "too_large" });
        expect(t.calls).toHaveLength(1);
    });

    it("Content-Length over the cap, and a stream that grows past it without one: refused", async () => {
        const big = transport({ meta: () => Response.json(meta({ size: null })), download: () => new Response(PDF, { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } }) });
        expect(await run(big)).toEqual({ ok: false, retryable: false, reason: "too_large" });
        const chunk = new Uint8Array(64 * 1024);
        let sent = 0;
        const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent > 4 * 1024 * 1024) { c.close(); return; } sent += chunk.byteLength; c.enqueue(chunk); } });
        const grows = transport({ meta: () => Response.json(meta({ size: null })), download: () => new Response(stream, { status: 200 }) });
        expect(await run(grows, { maxBytes: 1024 * 1024 })).toEqual({ ok: false, retryable: false, reason: "too_large" });
        expect(sent).toBeLessThan(4 * 1024 * 1024); // stopped reading at the cap
    });

    it("a short transfer is not the attachment: retryable size_mismatch", async () => {
        expect(await run(transport({ download: () => new Response(PDF.slice(0, 10), { status: 200 }) }))).toEqual({ ok: false, retryable: true, reason: "size_mismatch" });
    });

    it("an already-expired signed URL: retryable, not fetched", async () => {
        const t = transport({ meta: () => Response.json(meta({ expires_at: "2026-10-31T01:00:00Z" })) });
        expect(await run(t)).toEqual({ ok: false, retryable: true, reason: "download_url_expired" });
        expect(t.calls).toHaveLength(1);
    });

    it.each([
        ["provider 404", { meta: () => new Response("{}", { status: 404 }) }, false, "provider_404"],
        ["provider 401", { meta: () => new Response("{}", { status: 401 }) }, false, "provider_401"],
        ["provider 429", { meta: () => new Response("{}", { status: 429 }) }, true, "provider_429"],
        ["provider 503", { meta: () => new Response("{}", { status: 503 }) }, true, "provider_503"],
        ["download 403 (lapsed signature)", { download: () => new Response("", { status: 403 }) }, true, "download_403"],
        ["download 404", { download: () => new Response("", { status: 404 }) }, false, "download_404"],
        ["download 500", { download: () => new Response("", { status: 500 }) }, true, "download_500"],
    ] as const)("%s", async (_w, o, retry, reason) => {
        expect(await run(transport(o))).toEqual({ ok: false, retryable: retry, reason });
    });

    it("one deadline covers both requests: a hung download times out, retryable", async () => {
        const hung = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith("https://api.resend.com/")) return Response.json(meta());
            return new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
        }) as typeof fetch;
        expect(await run({ calls: [], fetchImpl: hung }, { timeoutMs: 20 })).toEqual({ ok: false, retryable: true, reason: "timeout" });
    });

    it("a network failure: retryable", async () => {
        const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
        expect(await run({ calls: [], fetchImpl: down })).toEqual({ ok: false, retryable: true, reason: "network_error" });
    });
});

describe("output secrecy", () => {
    it("no result ever carries the key, the signed URL or its token", async () => {
        const outcomes = await Promise.all([
            run(transport()),
            run(transport({ meta: () => new Response(`{"error":"${KEY}"}`, { status: 401 }) })),
            run(transport({ download: () => new Response(SIGNED, { status: 404 }) })),
            run(transport({ meta: () => Response.json(meta({ download_url: `https://evil.example/?k=${KEY}` })) })),
        ]);
        for (const o of outcomes) {
            const s = JSON.stringify({ ...o, bytes: undefined });
            expect(s).not.toContain(KEY);
            expect(s).not.toContain("SIGNEDTOKEN123");
            expect(s).not.toContain("inbound-cdn");
        }
    });
});

describe("the port: the organization's own credential, from its binding", () => {
    it("resolves per (org, binding); an unresolvable credential is retryable and sends nothing", async () => {
        const t = transport();
        const asked: unknown[] = [];
        const ok = makeResendAttachmentContentFetcher({ resolveApiKey: async (a) => { asked.push(a); return { ok: true, apiKey: KEY }; }, fetchImpl: t.fetchImpl, now: () => NOW });
        expect(await ok({ orgId: ORG, providerMessageId: EMAIL, providerBindingId: "bind-1", attachmentId: ATT })).toEqual({ ok: true, bytes: PDF });
        expect(asked).toEqual([{ orgId: ORG, providerBindingId: "bind-1" }]);

        const t2 = transport();
        const none = makeResendAttachmentContentFetcher({ resolveApiKey: async () => ({ ok: false, reason: `missing secret ${KEY}` }), fetchImpl: t2.fetchImpl });
        expect(await none({ orgId: ORG, providerMessageId: EMAIL, providerBindingId: null, attachmentId: ATT })).toEqual({ ok: false, retryable: true, reason: "credential_unavailable" });
        const throws = makeResendAttachmentContentFetcher({ resolveApiKey: async () => { throw new Error(KEY); }, fetchImpl: t2.fetchImpl });
        expect(await throws({ orgId: ORG, providerMessageId: EMAIL, providerBindingId: null, attachmentId: ATT })).toEqual({ ok: false, retryable: true, reason: "credential_unavailable" });
        expect(t2.calls).toHaveLength(0);
    });
});

describe("composed with WS11 storage and the pipeline (fake transport, in-memory store)", () => {
    function seeded() {
        const db = new InMemorySupabase();
        db.uniqueOn = { documents: [["id"]] };
        db.seed("communication_messages", [{
            id: MSG, org_id: ORG, direction: "inbound", channel: "email", provider_message_id: EMAIL, communication_provider_binding_id: "bind-1",
            metadata: { attachments: [{ id: ATT, filename: "shots.pdf", content_type: "application/pdf", content_disposition: "attachment", size: PDF.byteLength }] },
        }]);
        return db;
    }
    const verdicts: MalwareScanBoundary = { available: true, verdict: async ({ documentId, versionId, checksumSha256 }) => ({ verdict: "clean", subject: versionId && checksumSha256 ? { documentId, versionId, checksumSha256 } : null }) };
    function cases(): ProcessingCaseDeps & { n: number } {
        const primary = new Map<string, string>();
        const deps = {
            n: 0,
            async openCaseWithPrimarySource({ sourceId }: { sourceId: string }) {
                const hit = primary.get(sourceId);
                if (hit) return { processingCaseId: hit, created: false };
                deps.n += 1;
                const id = `ca5e0000-0000-4000-8000-${String(deps.n).padStart(12, "0")}`;
                primary.set(sourceId, id);
                return { processingCaseId: id, created: true };
            },
            async findCaseIdByPrimarySource() { throw new Error("legacy path must not run"); },
            async insertCase() { throw new Error("legacy path must not run"); },
            async insertSource() { throw new Error("legacy path must not run"); },
        };
        return deps as unknown as ProcessingCaseDeps & { n: number };
    }

    it("fetched once, stored once, one case; a redelivery makes no provider request", async () => {
        const db = seeded();
        const t = transport();
        const storage = createWs11AttachmentStorage({
            supabase: db as never,
            fetchContent: makeResendAttachmentContentFetcher({ resolveApiKey: async () => ({ ok: true, apiKey: KEY }), fetchImpl: t.fetchImpl, now: () => NOW }),
            audit: async () => ({ ok: true, eventId: "ev-1" }),
        });
        const processing = cases();
        const message = { id: MSG, orgId: ORG, ownership: "owned" as const, attachments: [{ id: ATT, filename: "shots.pdf", content_type: "application/pdf", content_disposition: "attachment", size: PDF.byteLength }] };
        const first = await fileInboundEmailAttachments({ storage, malware: verdicts, processing }, message);
        const second = await fileInboundEmailAttachments({ storage, malware: verdicts, processing }, message);
        expect(first[0].outcome).toBe("case_opened");
        expect(second[0].outcome).toBe("case_existing");
        expect(t.calls).toHaveLength(2); // one metadata call + one download, ever
        expect(db.rows("documents")).toHaveLength(1);
        expect(db.uploadCalls).toHaveLength(1);
    });

    it("an attachment the persisted message does not list is never requested from the provider", async () => {
        const t = transport();
        const storage = createWs11AttachmentStorage({ supabase: seeded() as never, fetchContent: makeResendAttachmentContentFetcher({ resolveApiKey: async () => ({ ok: true, apiKey: KEY }), fetchImpl: t.fetchImpl }) });
        expect(await storage.retrieve({ orgId: ORG, messageId: MSG, attachmentId: "unlisted-attachment" })).toEqual({ ok: false, reason: "attachment_not_listed" });
        expect(t.calls).toHaveLength(0);
    });

    it("production wiring is unchanged: no fetcher, so nothing is requested and everything is held", async () => {
        const deps = makeInboundAttachmentFilingDeps(seeded() as never);
        expect(deps.storage.available).toBe(false);
        expect(deps.malware.available).toBe(false);
    });
});
