import { describe, it, expect, vi } from "vitest";
import { orchestrateFamilySend, type FamilySendDeps } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import type { RecipientVM } from "@/lib/communications/v2/familyWorkspace/types";

const ch = (avail: boolean, reason: string | null = null) => ({ hasAddress: avail, providerBound: true, available: avail, unavailableReason: reason, marketing: "unset" as const, transactional: "unset" as const, canSendTransactional: avail, canSendMarketing: avail });
const rec = (id: string, name: string, emailOk: boolean): RecipientVM => ({ id, displayName: name, roleType: "parent", roleLabel: "Parent", isPrimary: true, tier: "primary", email: emailOk ? "a@b.com" : null, phone: "+15105550100", channels: { email: ch(emailOk, emailOk ? null : "No email on file"), sms: ch(true) } });

const mom = rec("p-mom", "Sarah Rivera", true);
const dad = rec("p-dad", "Carlos Rivera", false);

function deps(over: Partial<FamilySendDeps> = {}): FamilySendDeps {
    return {
        getRecipient: (id) => ({ "p-mom": mom, "p-dad": dad })[id],
        checkConsent: async () => null,
        runSend: vi.fn(async ({ personId }) => ({ ok: true, thread_id: `t-${personId}`, communication_message_id: `m-${personId}` })),
        ...over,
    };
}

describe("orchestrateFamilySend", () => {
    it("preflight performs no sends and marks eligible recipients ready", async () => {
        const d = deps();
        const out = await orchestrateFamilySend(d, { recipientPersonIds: ["p-mom"], channel: "email", subject: "Hi", body: "x", confirm: false });
        expect(out.mode).toBe("preflight");
        expect(out.results[0].status).toBe("ready");
        expect(d.runSend).not.toHaveBeenCalled();
    });
    it("confirm sends eligible recipients", async () => {
        const out = await orchestrateFamilySend(deps(), { recipientPersonIds: ["p-mom"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(out.results[0]).toMatchObject({ status: "sent", thread_id: "t-p-mom", communication_message_id: "m-p-mom" });
        expect(out.summary.sent).toBe(1);
    });
    it("ineligible (no email) is blocked with reason, never sent", async () => {
        const d = deps();
        const out = await orchestrateFamilySend(d, { recipientPersonIds: ["p-dad"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(out.results[0]).toMatchObject({ status: "blocked", reason: "No email on file" });
    });
    it("consent block returns blocked", async () => {
        const out = await orchestrateFamilySend(deps({ checkConsent: async () => ({ allowed: false, reason: "Recipient opted out of email_transactional." }) }), { recipientPersonIds: ["p-mom"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(out.results[0]).toMatchObject({ status: "blocked", reason: "Recipient opted out of email_transactional." });
    });
    it("send failure returns failed; consent_blocked code maps to blocked", async () => {
        const fail = await orchestrateFamilySend(deps({ runSend: async () => ({ ok: false, error: "provider error" }) }), { recipientPersonIds: ["p-mom"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(fail.results[0]).toMatchObject({ status: "failed", reason: "provider error" });
        const blk = await orchestrateFamilySend(deps({ runSend: async () => ({ ok: false, error: "opted out", code: "consent_blocked" }) }), { recipientPersonIds: ["p-mom"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(blk.results[0].status).toBe("blocked");
    });
    it("partial success: mom sent, dad blocked; no rollback", async () => {
        const out = await orchestrateFamilySend(deps(), { recipientPersonIds: ["p-mom", "p-dad"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(out.summary).toMatchObject({ requested: 2, sent: 1, blocked: 1, failed: 0 });
    });
    it("unknown recipient -> failed; ids deduped", async () => {
        const out = await orchestrateFamilySend(deps(), { recipientPersonIds: ["p-ghost", "p-mom", "p-mom"], channel: "email", subject: "Hi", body: "x", confirm: true });
        expect(out.summary.requested).toBe(2);
        expect(out.results.find((r) => r.person_id === "p-ghost")?.status).toBe("failed");
    });
});
