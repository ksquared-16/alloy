/**
 * Shared QA Activation Safety — no-send before Resend / auth provider.
 *
 * Proves deliverQueuedEmailHtml refuses QA org ids before calling Resend,
 * invite + password-reset routes gate with refuseQaOrgOutbound before provider
 * calls, and non-QA orgs are unchanged.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QA_ORGS } from "@/lib/qa/sharedQaRegistry";
import { refuseQaOrgOutbound } from "@/lib/qa/sharedQaSafety";

const ROOT = join(__dirname, "../../..");
const WEB = join(ROOT, "web");
const QA_SHARED = QA_ORGS.qa_shared.id;
const QA_SECONDARY = QA_ORGS.qa_secondary.id;
const NON_QA = "11111111-1111-4111-8111-111111111111";

describe("refuseQaOrgOutbound", () => {
  it("refuses both frozen QA organizations", () => {
    expect(refuseQaOrgOutbound(QA_SHARED)).toEqual(
      expect.objectContaining({ ok: false, code: "qa_org_outbound_refused" }),
    );
    expect(refuseQaOrgOutbound(QA_SECONDARY)).toEqual(
      expect.objectContaining({ ok: false, code: "qa_org_outbound_refused" }),
    );
  });

  it("allows non-QA and Firefly (production tenant is not a QA outbound target here)", () => {
    expect(refuseQaOrgOutbound(NON_QA).ok).toBe(true);
    expect(refuseQaOrgOutbound("93667019-bd28-49b5-a688-acc9bb1e0a19").ok).toBe(true);
    expect(refuseQaOrgOutbound(null).ok).toBe(true);
  });
});

describe("deliverQueuedEmailHtml — QA org refuses before Resend", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.RESEND_API_KEY = "re_test_key_must_not_be_used";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  function supabaseFor(orgId: string) {
    const messageRow = {
      id: "msg-1",
      org_id: orgId,
      thread_id: "thr-1",
      status: "queued",
      channel: "email",
      subject: "hello",
      body: "body",
      to_address: "parent@example.invalid",
      from_address: "ops@example.invalid",
      rendered_snapshot: { html: '<p><a href="https://example.invalid/x">x</a></p>', text: "x" },
      communication_provider_binding_id: null,
    };
    const chain = () => {
      const self: Record<string, unknown> = {};
      const ret = () => self;
      for (const m of ["select", "eq", "not", "order", "limit", "update", "in"]) {
        self[m] = ret;
      }
      self.maybeSingle = async () => ({ data: messageRow, error: null });
      // supabase-js builders are thenable; history + update awaits resolve here.
      self.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      return self;
    };
    return { from: () => chain() };
  }

  it("refuses QA Shared before fetch to Resend even when RESEND_API_KEY is set", async () => {
    const { deliverQueuedEmailHtml } = await import("@/lib/communications/deliverQueuedEmailHtml");
    const result = await deliverQueuedEmailHtml({
      supabase: supabaseFor(QA_SHARED) as never,
      messageId: "msg-1",
      resendApiKey: "re_test_key_must_not_be_used",
    });
    expect(result).toEqual({ ok: false, reason: "qa_org_outbound_refused" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses QA Secondary before Resend", async () => {
    const { deliverQueuedEmailHtml } = await import("@/lib/communications/deliverQueuedEmailHtml");
    const result = await deliverQueuedEmailHtml({
      supabase: supabaseFor(QA_SECONDARY) as never,
      messageId: "msg-1",
    });
    expect(result).toEqual({ ok: false, reason: "qa_org_outbound_refused" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("non-QA org still reaches Resend when credentials and snapshot are present", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "re_msg_1" }),
    });
    const { deliverQueuedEmailHtml } = await import("@/lib/communications/deliverQueuedEmailHtml");
    const result = await deliverQueuedEmailHtml({
      supabase: supabaseFor(NON_QA) as never,
      messageId: "msg-1",
      resendApiKey: "re_test_key",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.resend.com");
  });
});

describe("invite and password-reset routes — QA gate before provider", () => {
  it("users invite route refuses QA orgs before inviteUserByEmail", () => {
    const src = readFileSync(join(WEB, "app/api/admin/users/route.ts"), "utf8");
    expect(src).toContain("refuseQaOrgOutbound");
    const gate = src.indexOf("refuseQaOrgOutbound(access.orgId)");
    const invite = src.indexOf("supabase.auth.admin.inviteUserByEmail");
    expect(gate).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(gate);
  });

  it("password-reset route refuses QA orgs before resetPasswordForEmail", () => {
    const src = readFileSync(join(WEB, "app/api/admin/send-password-reset/route.ts"), "utf8");
    expect(src).toContain("refuseQaOrgOutbound");
    const gate = src.indexOf("refuseQaOrgOutbound(orgId)");
    const reset = src.indexOf("supabase.auth.resetPasswordForEmail");
    expect(gate).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(gate);
  });
});
