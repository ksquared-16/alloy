/**
 * Phase 0 commit 5 — canonical outbound renderer.
 *
 * Behavioral: every test calls the real renderer or the real enqueue path.
 * The central claim under test is that raw `{{...}}` cannot reach enqueue by
 * ANY route, and that preview and send produce identical output by construction.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    renderOutboundMessage,
    previewOutboundMessage,
    escapeHtml,
    toPlainText,
    containsUnsafeMarkup,
    smsSegments,
    OPTIONAL_TOKEN_PATHS,
    RENDER_CONTRACT_VERSION,
} from "@/lib/communications/render/renderOutboundMessage";

const RECIPIENT = { "contact.first_name": "Dana", "contact.last_name": "Rivera" };

function ctx(over: Record<string, unknown> = {}) {
    return {
        values: { recipient: RECIPIENT },
        channel: "email" as const,
        template: null,
        ...over,
    };
}

describe("renderer — free text without a template", () => {
    it("renders and remains valid", () => {
        const r = renderOutboundMessage({ subject: "Hello", body: "Just checking in.", context: ctx() });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.output.text).toBe("Just checking in.");
            expect(r.snapshot.template).toBeNull();
        }
    });

    it("blocks empty output", () => {
        const r = renderOutboundMessage({ body: "   ", context: ctx() });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.block.code).toBe("EMPTY_OUTPUT");
    });
});

describe("renderer — token resolution", () => {
    it("resolves known tokens and records exactly what was substituted", () => {
        const r = renderOutboundMessage({ body: "Hi {{contact.first_name}}!", context: ctx() });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.output.text).toBe("Hi Dana!");
            expect(r.snapshot.resolvedTokens).toEqual({ "contact.first_name": "Dana" });
        }
    });

    it("blocks an unsupported token", () => {
        const r = renderOutboundMessage({ body: "Hi {{contact.ssn}}", context: ctx() });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.block.code).toBe("TOKEN_UNSUPPORTED");
    });

    it("blocks a known token whose value is missing for this recipient", () => {
        const r = renderOutboundMessage({
            body: "Hi {{contact.first_name}}, about {{location.name}}",
            context: ctx(),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.block.code).toBe("TOKEN_UNRESOLVED");
    });

    it("names business information in the operator message, never a token path", () => {
        const r = renderOutboundMessage({ body: "About {{location.name}}", context: ctx() });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.block.message).not.toContain("{{");
            expect(r.block.message).not.toContain("location.name");
            expect(r.block.message.length).toBeGreaterThan(10);
        }
    });

    it("permits an optional token to resolve empty", () => {
        expect(OPTIONAL_TOKEN_PATHS.length).toBeGreaterThan(0);
        const optional = OPTIONAL_TOKEN_PATHS[0];
        const r = renderOutboundMessage({ body: `Hi {{${optional}}} there`, context: ctx() });
        expect(r.ok).toBe(true);
    });

    it("does not permit arbitrary object-path traversal", () => {
        // Only catalogued paths resolve. A raw payload path is unsupported,
        // which is what stops internal ids and secrets reaching a body.
        const r = renderOutboundMessage({
            body: "{{provider.secret_ref}}",
            context: { ...ctx(), values: { recipient: { "provider.secret_ref": "env:TWILIO" } } },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.block.code).toBe("TOKEN_UNSUPPORTED");
    });
});

describe("renderer — raw tokens can never survive", () => {
    it("never emits a body containing {{", () => {
        const bodies = [
            "Hi {{contact.first_name}}",
            "Plain text",
            "Mixed {{contact.first_name}} and {{contact.last_name}}",
        ];
        for (const body of bodies) {
            const r = renderOutboundMessage({ body, context: ctx() });
            if (r.ok) expect(r.output.text).not.toContain("{{");
        }
    });

    it("blocks rather than falling back to the authored template source", () => {
        const r = renderOutboundMessage({ body: "Hi {{contact.unknown_thing}}", context: ctx() });
        expect(r.ok).toBe(false);
        // Explicitly NOT { ok: true, text: "Hi {{contact.unknown_thing}}" }.
    });
});

describe("renderer — channel behavior", () => {
    it("SMS output contains no markup", () => {
        const r = renderOutboundMessage({
            body: "<p>Hi <b>Dana</b></p>",
            bodyIsHtml: true,
            context: ctx({ channel: "sms" }),
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.output.text).not.toMatch(/<[a-z]/i);
            expect(r.output.html).toBeNull();
        }
    });

    it("SMS reports segments without truncating", () => {
        const long = "x".repeat(400);
        const r = renderOutboundMessage({ body: long, context: ctx({ channel: "sms" }) });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.output.text.length).toBe(400);
            expect(r.output.smsSegments).toBeGreaterThan(1);
        }
    });

    it("email retains safe formatting and a plain-text fallback", () => {
        const r = renderOutboundMessage({
            body: "<p>Hi <b>Dana</b> — <a href='https://example.com'>details</a></p>",
            bodyIsHtml: true,
            context: ctx(),
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.output.html).toContain("<b>");
            expect(r.output.text).toContain("Dana");
            expect(r.output.text).not.toContain("<b>");
        }
    });

    it("blocks unsafe markup", () => {
        for (const unsafe of [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "<a href='javascript:alert(1)'>x</a>",
            "<iframe src='//evil'></iframe>",
        ]) {
            const r = renderOutboundMessage({ body: unsafe, bodyIsHtml: true, context: ctx() });
            expect(r.ok, unsafe).toBe(false);
            if (!r.ok) expect(r.block.code).toBe("UNSAFE_MARKUP");
        }
    });

    it("escapes substituted values so a name cannot inject markup", () => {
        expect(escapeHtml("<script>x</script>")).not.toContain("<script>");
        expect(containsUnsafeMarkup("<b>safe</b>")).toBe(false);
        expect(containsUnsafeMarkup("<script>x</script>")).toBe(true);
    });

    it("normalizes whitespace deterministically", () => {
        expect(toPlainText("a\n\n\n\n b   c ")).toBe("a\n\nb c");
        expect(smsSegments("short")).toBe(1);
    });

    it("preserves anchor href URLs in plain text (Tour friendly-link safety)", () => {
        const html =
            'Choose a tour time:<br><a href="http://127.0.0.1:3015/a/abc123" style="color:#1f4d3a;">Choose a tour time</a>';
        const plain = toPlainText(html);
        expect(plain).toContain("Choose a tour time");
        expect(plain).toContain("http://127.0.0.1:3015/a/abc123");
        expect(plain).not.toContain("<a");
    });
});

describe("renderer — preview/send parity", () => {
    it("preview is literally the same function", () => {
        expect(previewOutboundMessage).toBe(renderOutboundMessage);
    });

    it("produces identical output for identical input", () => {
        const input = { subject: "Hi", body: "Hello {{contact.first_name}}", context: ctx() };
        const preview = previewOutboundMessage(input);
        const send = renderOutboundMessage(input);
        expect(preview.ok && send.ok).toBe(true);
        if (preview.ok && send.ok) {
            expect(send.output).toEqual(preview.output);
            expect(send.snapshot.fingerprint).toBe(preview.snapshot.fingerprint);
        }
    });

    it("blocks when the content changed after preview", () => {
        const preview = renderOutboundMessage({ body: "Hello {{contact.first_name}}", context: ctx() });
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;

        const edited = renderOutboundMessage({
            body: "Hello {{contact.first_name}}, one more thing",
            context: ctx(),
            expectedFingerprint: preview.snapshot.fingerprint,
        });
        expect(edited.ok).toBe(false);
        if (!edited.ok) expect(edited.block.code).toBe("PREVIEW_STALE");
    });

    it("passes when the content is unchanged since preview", () => {
        const preview = renderOutboundMessage({ body: "Hello", context: ctx() });
        if (!preview.ok) throw new Error("preview failed");
        const send = renderOutboundMessage({
            body: "Hello",
            context: ctx(),
            expectedFingerprint: preview.snapshot.fingerprint,
        });
        expect(send.ok).toBe(true);
    });
});

describe("renderer — immutable snapshot and lineage", () => {
    it("captures the template lineage that was used", () => {
        const r = renderOutboundMessage({
            body: "Hi {{contact.first_name}}",
            context: ctx({ template: { id: "tpl-1", version: 3 } }),
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.snapshot.template).toEqual({ id: "tpl-1", version: 3 });
            expect(r.snapshot.contractVersion).toBe(RENDER_CONTRACT_VERSION);
        }
    });

    it("blocks inconsistent lineage", () => {
        for (const template of [{ id: "", version: 3 }, { id: "tpl-1", version: 0 }]) {
            const r = renderOutboundMessage({ body: "Hi", context: ctx({ template }) });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.block.code).toBe("LINEAGE_INCONSISTENT");
        }
    });

    it("a later template edit cannot change an existing snapshot", () => {
        const first = renderOutboundMessage({
            body: "Version one {{contact.first_name}}",
            context: ctx({ template: { id: "tpl-1", version: 1 } }),
        });
        if (!first.ok) throw new Error("render failed");
        const captured = JSON.parse(JSON.stringify(first.snapshot));

        // The template is edited and re-rendered as v2 — a NEW snapshot.
        renderOutboundMessage({
            body: "Version two {{contact.first_name}}",
            context: ctx({ template: { id: "tpl-1", version: 2 } }),
        });

        expect(first.snapshot).toEqual(captured);
        expect(first.snapshot.text).toContain("Version one");
    });
});

// ---------------------------------------------------------------------------
// Enqueue integration: the renderer runs at the choke point
// ---------------------------------------------------------------------------

const THREAD = "77777777-0000-4000-8000-000000000001";
let messageInserts: Array<Record<string, unknown>> = [];

vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

function fakeSupabase() {
    return {
        from(table: string) {
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                is: () => b,
                in: () => b,
                order: () => b,
                limit: async () => ({ data: [], error: null }),
                maybeSingle: async () =>
                    table === "communication_threads"
                        ? { data: { id: THREAD }, error: null }
                        : { data: null, error: null },
                insert: (rows: unknown) => {
                    if (table === "communication_messages") messageInserts.push(rows as Record<string, unknown>);
                    return { select: () => ({ maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }) }) };
                },
            };
            return b;
        },
    };
}

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";

describe("enqueue — no path can enqueue unresolved tokens", () => {
    beforeEach(() => {
        messageInserts = [];
        vi.clearAllMocks();
    });

    async function enqueue(over: Record<string, unknown> = {}) {
        return enqueueCanonicalOutboundMessage({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: fakeSupabase() as any,
            orgId: "aaaaaaaa-0000-4000-8000-000000000001",
            primaryEntityType: "persons",
            primaryEntityId: "11111111-0000-4000-8000-000000000001",
            channelRaw: "sms",
            toRaw: "+15555550123",
            bodyRaw: "Hello",
            metadata: {},
            recipientPersonId: "11111111-0000-4000-8000-000000000001",
            category: "operational",
            emitMessageQueued: false,
            ...over,
        });
    }

    it("blocks an unresolved token and inserts nothing", async () => {
        const res = await enqueue({ bodyRaw: "Hi {{location.name}}" });
        expect(res.communicationMessageId).toBeNull();
        expect(res.skippedReason).toBe("render_blocked:TOKEN_UNRESOLVED");
        expect(res.blockedMessage).toBeTruthy();
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks an unsupported token and inserts nothing", async () => {
        const res = await enqueue({ bodyRaw: "Hi {{totally.made_up}}" });
        expect(res.skippedReason).toBe("render_blocked:TOKEN_UNSUPPORTED");
        expect(messageInserts).toHaveLength(0);
    });

    it("persists the RENDERED body, not the authored source", async () => {
        await enqueue({
            bodyRaw: "Hi {{contact.first_name}}",
            renderContext: { recipient: RECIPIENT },
        });
        expect(messageInserts).toHaveLength(1);
        expect(messageInserts[0].body).toBe("Hi Dana");
        expect(String(messageInserts[0].body)).not.toContain("{{");
    });

    it("persists the immutable rendered snapshot alongside the row", async () => {
        await enqueue({
            bodyRaw: "Hi {{contact.first_name}}",
            renderContext: { recipient: RECIPIENT },
            template: { id: "tpl-1", version: 2 },
        });
        const snap = messageInserts[0].rendered_snapshot as Record<string, unknown>;
        expect(snap.template).toEqual({ id: "tpl-1", version: 2 });
        expect(snap.resolvedTokens).toEqual({ "contact.first_name": "Dana" });
        expect(snap.fingerprint).toBeTruthy();
    });

    it("free-text sends still work with no render context", async () => {
        const res = await enqueue({ bodyRaw: "Plain message" });
        expect(res.communicationMessageId).toBe("msg-1");
        expect(messageInserts[0].body).toBe("Plain message");
    });

    it("blocks a stale preview at the choke point", async () => {
        const res = await enqueue({
            bodyRaw: "Edited after preview",
            expectedRenderFingerprint: "fnv1a:deadbeef:5",
        });
        expect(res.skippedReason).toBe("render_blocked:PREVIEW_STALE");
        expect(messageInserts).toHaveLength(0);
    });
});
