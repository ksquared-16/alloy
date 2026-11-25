/**
 * ALY-14 — staging email/SMS reach only test recipients or the owner allowlist.
 *
 * Proves the recipient rules, that deliverQueuedEmailHtml and the demo-request
 * route refuse in staging BEFORE fetch to Resend, that allowed recipients still
 * reach the (faked) provider, and that production is unchanged. Every Resend
 * call site in web/ is pinned to the guard. fetch is always stubbed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ALLOY_STAGING_SUPABASE_PROJECT_REF,
    STAGING_EMAIL_ALLOWLIST_ENV,
    STAGING_RECIPIENT_REFUSED,
    STAGING_SMS_ALLOWLIST_ENV,
    guardOutboundRecipients,
    isControlledTestEmail,
    isControlledTestPhone,
    isStagingOutboundRuntime,
} from "@/lib/communications/stagingOutboundRecipientGuard";

const WEB = join(__dirname, "../..");
const STAGING_URL = `https://${ALLOY_STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = "https://vslwnntzzgpnmrpjipat.supabase.co";

const SIGNALS = [
    "NEXT_PUBLIC_APP_ENV",
    "APP_ENV",
    "ALLOY_ENVIRONMENT",
    "VERCEL_ENV",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    STAGING_EMAIL_ALLOWLIST_ENV,
    STAGING_SMS_ALLOWLIST_ENV,
] as const;
const cleared = Object.fromEntries(SIGNALS.map((k) => [k, undefined]));
const staging = (extra: Record<string, string> = {}) => ({ ...cleared, NEXT_PUBLIC_SUPABASE_URL: STAGING_URL, ...extra });
const production = (extra: Record<string, string> = {}) => ({
    ...cleared,
    NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
    VERCEL_ENV: "production",
    ...extra,
});

describe("environment detection", () => {
    it("restricts on the staging project ref, a staging label, or a Vercel preview", () => {
        expect(isStagingOutboundRuntime(staging())).toBe(true);
        expect(isStagingOutboundRuntime({ ...cleared, SUPABASE_URL: STAGING_URL })).toBe(true);
        expect(isStagingOutboundRuntime(production({ NEXT_PUBLIC_APP_ENV: "staging" }))).toBe(true);
        expect(isStagingOutboundRuntime({ ...cleared, VERCEL_ENV: "preview" })).toBe(true);
    });

    it("does not restrict production or the local certification stack", () => {
        expect(isStagingOutboundRuntime(production())).toBe(false);
        expect(isStagingOutboundRuntime({ ...cleared, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421" })).toBe(false);
    });
});

describe("recipient rules", () => {
    it("accepts controlled test inboxes and numbers only", () => {
        for (const a of ["p@example.com", "Ops <ops@example.org>", "a@firefly.test", "delivered+x@resend.dev"]) {
            expect(isControlledTestEmail(a), a).toBe(true);
        }
        for (const a of ["p@gmail.com", "onboarding@resend.dev", "x@example.com.evil.io", "nobody"]) {
            expect(isControlledTestEmail(a), a).toBe(false);
        }
        expect(isControlledTestPhone("+12125550100")).toBe(true);
        expect(isControlledTestPhone("(212) 555-0199")).toBe(true);
        expect(isControlledTestPhone("+15551234567")).toBe(false);
        expect(isControlledTestPhone("+12125550200")).toBe(false);
    });

    it("staging: allows test recipients for email and SMS", () => {
        expect(guardOutboundRecipients("email", ["parent@example.com"], staging())).toEqual({ ok: true, restricted: true });
        expect(guardOutboundRecipients("sms", ["+12125550142"], staging())).toEqual({ ok: true, restricted: true });
    });

    it("staging: allows exact owner-allowlisted email and phone", () => {
        const env = staging({
            [STAGING_EMAIL_ALLOWLIST_ENV]: "Owner@Alloy.dev, second@alloy.dev",
            [STAGING_SMS_ALLOWLIST_ENV]: "+1 (415) 555-1234; +14155559876",
        });
        expect(guardOutboundRecipients("email", ["owner@alloy.dev"], env).ok).toBe(true);
        expect(guardOutboundRecipients("email", ["Kelly <SECOND@alloy.dev>"], env).ok).toBe(true);
        expect(guardOutboundRecipients("sms", ["4155551234"], env).ok).toBe(true);
        expect(guardOutboundRecipients("sms", ["+14155559876"], env).ok).toBe(true);
        // Exact only: no plus-tag, no domain wildcard.
        expect(guardOutboundRecipients("email", ["owner+x@alloy.dev"], env).ok).toBe(false);
        expect(guardOutboundRecipients("email", ["someone@alloy.dev"], env).ok).toBe(false);
    });

    it("staging: blocks non-allowlisted email and SMS, masking the recipient", () => {
        const email = guardOutboundRecipients("email", ["parent@gmail.com"], staging());
        expect(email).toEqual(expect.objectContaining({ ok: false, code: STAGING_RECIPIENT_REFUSED }));
        expect(JSON.stringify(email)).not.toContain("parent@gmail.com");
        const sms = guardOutboundRecipients("sms", ["+14155550000"], staging());
        expect(sms).toEqual(expect.objectContaining({ ok: false, code: STAGING_RECIPIENT_REFUSED }));
        expect(JSON.stringify(sms)).not.toContain("4155550000");
        // One stranger among allowed recipients refuses the whole send; empty is refused.
        expect(guardOutboundRecipients("email", ["a@example.com", "b@gmail.com"], staging()).ok).toBe(false);
        expect(guardOutboundRecipients("email", [], staging()).ok).toBe(false);
    });

    it("production: unchanged for any recipient", () => {
        expect(guardOutboundRecipients("email", ["parent@gmail.com"], production())).toEqual({ ok: true, restricted: false });
        expect(guardOutboundRecipients("sms", ["+14155550000"], production())).toEqual({ ok: true, restricted: false });
    });
});

describe("deliverQueuedEmailHtml — staging guard before Resend", () => {
    const fetchMock = vi.fn();
    const NON_QA = "11111111-1111-4111-8111-111111111111";

    function supabaseFor(toAddress: string) {
        const messageRow = {
            id: "msg-1",
            org_id: NON_QA,
            thread_id: "thr-1",
            status: "queued",
            channel: "email",
            subject: "hello",
            body: "body",
            to_address: toAddress,
            from_address: "ops@alloy.dev",
            rendered_snapshot: { html: '<p><a href="https://example.invalid/x">x</a></p>', text: "x" },
            communication_provider_binding_id: null,
            metadata: { unsubscribe_url: "https://example.invalid/u" },
        };
        const chain = () => {
            const self: Record<string, unknown> = {};
            const ret = () => self;
            for (const m of ["select", "eq", "not", "order", "limit", "update", "in"]) self[m] = ret;
            self.maybeSingle = async () => ({ data: messageRow, error: null });
            self.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
                Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
            return self;
        };
        return { from: () => chain() };
    }

    async function deliver(env: Record<string, string | undefined>, to: string) {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
        const { deliverQueuedEmailHtml } = await import("@/lib/communications/deliverQueuedEmailHtml");
        return deliverQueuedEmailHtml({ supabase: supabaseFor(to) as never, messageId: "msg-1", resendApiKey: "re_fake" });
    }

    beforeEach(() => {
        vi.resetModules();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "re_msg_1" }) });
        vi.stubGlobal("fetch", fetchMock);
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const sentTo = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).to;

    it("staging: blocks a real inbox and never calls fetch", async () => {
        const result = await deliver(staging(), "parent@gmail.com");
        expect(result).toEqual({ ok: false, reason: STAGING_RECIPIENT_REFUSED });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("staging: delivers to a controlled test inbox", async () => {
        const result = await deliver(staging(), "delivered@resend.dev");
        expect(result.ok).toBe(true);
        expect(sentTo()).toEqual(["delivered@resend.dev"]);
    });

    it("staging: delivers to an owner-allowlisted inbox", async () => {
        const result = await deliver(staging({ [STAGING_EMAIL_ALLOWLIST_ENV]: "owner@alloy.dev" }), "owner@alloy.dev");
        expect(result.ok).toBe(true);
        expect(sentTo()).toEqual(["owner@alloy.dev"]);
    });

    it("production: a real inbox still reaches Resend unchanged", async () => {
        const result = await deliver(production(), "parent@gmail.com");
        expect(result.ok).toBe(true);
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.resend.com/emails");
        expect(sentTo()).toEqual(["parent@gmail.com"]);
    });
});

describe("every web Resend send site is guarded", () => {
    function walk(dir: string, out: string[] = []): string[] {
        for (const name of readdirSync(dir)) {
            if (name === "node_modules" || name === ".next" || name === "tests") continue;
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p, out);
            else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
        }
        return out;
    }

    it("only guarded files POST to api.resend.com/emails, and the guard precedes the fetch", () => {
        const senders = [...walk(join(WEB, "lib")), ...walk(join(WEB, "app"))]
            .filter((p) => readFileSync(p, "utf8").includes('"https://api.resend.com/emails"'))
            .map((p) => relative(WEB, p))
            .sort();
        expect(senders).toEqual(["app/api/marketing/demo-request/route.ts", "lib/communications/deliverQueuedEmailHtml.ts"]);
        for (const rel of senders) {
            const src = readFileSync(join(WEB, rel), "utf8");
            const gate = src.indexOf('guardOutboundRecipients("email"');
            expect(gate, rel).toBeGreaterThan(-1);
            expect(gate, rel).toBeLessThan(src.indexOf('fetch("https://api.resend.com/emails"'));
        }
    });

    it("web/ never sends SMS itself — Twilio Messages are the Python dispatcher's, guarded there", () => {
        const offenders = [...walk(join(WEB, "lib")), ...walk(join(WEB, "app"))].filter((p) =>
            /Messages\.json|messages\.create\(/.test(readFileSync(p, "utf8"))
        );
        expect(offenders.map((p) => relative(WEB, p))).toEqual([]);
    });
});
