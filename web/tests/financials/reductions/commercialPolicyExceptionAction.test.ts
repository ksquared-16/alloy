/**
 * WHAT THE EXCEPTION COMMAND WILL AND WILL NOT ACCEPT.
 *
 * The service decides what an exception MEANS (see commercialPolicyException.test.ts). This file
 * is about the boundary in front of it: which identities a caller may name, which it may not, and
 * what happens to an operator who has not been granted financial write.
 *
 * The distinction worth keeping: an exception is a statement about APPLICABILITY. Every route by
 * which a caller could turn it into a statement about MONEY — an amount, a percent, or the
 * per-assignment `discount_enabled` switch this feature must never become — is refused here rather
 * than ignored downstream, because a surface that believes it set a price and was silently
 * overruled will ship that belief.
 */
import { describe, expect, it } from "vitest";

import {
    POLICY_EXCEPTION_ACTION_KEY,
    POLICY_EXCEPTION_END_ACTION_KEY,
    POLICY_EXCEPTION_PERMISSION,
    commercialPolicyExceptionActions,
} from "@/lib/adminV2/actions/definitions/commercialPolicyExceptionActions";
import { getRegisteredAction, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";

const except = commercialPolicyExceptionActions.find((a) => a.actionKey === POLICY_EXCEPTION_ACTION_KEY)!;
const end = commercialPolicyExceptionActions.find((a) => a.actionKey === POLICY_EXCEPTION_END_ACTION_KEY)!;

const VALID = { policy_id: "policy-1", effective_start: "2026-10-01", reason: "Board waived the fee for this family" };

/** The narrowest client that answers what `resolveActorPermissionGrants` asks. */
function grantingClient(permissions: string[]) {
    const table = (name: string) => ({
        select: () => {
            const rows = name === "user_roles" ? [{ org_id: "org-1", role: "admin" }] : permissions.map((permission_key) => ({ permission_key }));
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = self;
            chain.in = self;
            chain.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
            return chain;
        },
    });
    return { from: (name: string) => table(name) } as never;
}
const ctx = { orgId: "org-1", userId: "user-1" } as never;
const invocation = { entityType: "opportunity_customer_member", entityId: "ocm-1", actionKey: POLICY_EXCEPTION_ACTION_KEY } as never;

describe("the exception command is reachable at all", () => {
    /*
     * A definition that no registry carries is not a command — it is a file. Both halves are
     * asserted because they fail independently: the registry makes it executable, the capability
     * row makes it a classified identity rather than a drifted handler.
     */
    it("is registered with an executable handler and classified as a capability", () => {
        for (const key of [POLICY_EXCEPTION_ACTION_KEY, POLICY_EXCEPTION_END_ACTION_KEY]) {
            expect(listRegisteredActionKeys()).toContain(key);
            expect(typeof getRegisteredAction(key)?.execute, `${key} has an execute handler`).toBe("function");
            expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).toContain(key);
        }
    });

    /* The subject is the assignment — the same durable identity an accepted price is scoped to. */
    it("takes the assignment as its subject", () => {
        expect(except.supportedEntityTypes).toContain("opportunity_customer_member");
        expect(except.requiredContext?.requiresEntityId).toBe(true);
    });
});

describe("what the caller may say", () => {
    it("requires the policy being excepted", () => {
        const r = except.validatePayload!({ reason: "x" });
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.blockers.map((b) => b.code)).toContain("policy_required");
    });

    /* Not defaulted, not inferred: an exception to policy that cannot say why is not a decision. */
    it("requires a reason", () => {
        for (const reason of [undefined, "", "   "]) {
            const r = except.validatePayload!({ policy_id: "policy-1", reason });
            expect(r.ok, `reason=${JSON.stringify(reason)}`).toBe(false);
        }
        expect(except.validatePayload!(VALID).ok).toBe(true);
    });

    it.each(["amount_cents", "percent", "percentage", "discount_enabled", "enabled", "customer_member_id", "org_id"])(
        "refuses a payload carrying %s rather than ignoring it",
        (field) => {
            const r = except.validatePayload!({ ...VALID, [field]: field === "discount_enabled" ? false : 1 });
            expect(r.ok).toBe(false);
            if (r.ok === false) {
                expect(r.blockers.map((b) => b.code)).toContain("effect_not_caller_supplied");
                expect(r.blockers.some((b) => b.field === field)).toBe(true);
            }
        },
    );

    /* An open-ended exception is the ordinary case; only a malformed window is refused. */
    it("accepts an exception with no end date", () => {
        expect(except.validatePayload!({ ...VALID, effective_end: undefined }).ok).toBe(true);
    });
});

describe("who may exclude a policy", () => {
    it("refuses an operator without financial write, before touching the exception", async () => {
        const result = await except.execute!({
            supabase: grantingClient(["enrollment.write"]),
            ctx,
            invocation,
            payload: VALID,
        } as never);
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.blockers?.map((b) => b.code)).toContain("exception_permission_required");
    });

    it("names the permission it wants, and it is a financial one", () => {
        expect(POLICY_EXCEPTION_PERMISSION).toBe("fin.write");
    });

    it("also guards ending an exception", async () => {
        const result = await end.execute!({
            supabase: grantingClient([]),
            ctx,
            invocation: { ...(invocation as object), actionKey: POLICY_EXCEPTION_END_ACTION_KEY } as never,
            payload: { exception_id: "exception-1" },
        } as never);
        expect(result.ok).toBe(false);
    });
});

describe("what the preview promises", () => {
    /*
     * The preview says what the exception will MEAN. It deliberately promises no number: the
     * consequence is decided by eligibility when an obligation is evaluated, and a second opinion
     * stated here would be the one the operator remembers.
     */
    it("describes applicability and never an amount", async () => {
        const preview = await except.buildPreview!({ supabase: grantingClient([POLICY_EXCEPTION_PERMISSION]), ctx, invocation, payload: VALID } as never);
        const text = `${preview.summary} ${(preview.changes ?? []).join(" ")}`;
        expect(text).toContain("will not apply");
        expect(text, "no money is promised here").not.toMatch(/\$\s?\d|\d+\s?%|amount_cents|cents/i);
        expect(text).toContain(VALID.reason);
    });

    /* Posted history is not in scope, and the operator is told so before they commit. */
    it("says that posted obligations are unaffected", async () => {
        const preview = await except.buildPreview!({ supabase: grantingClient([POLICY_EXCEPTION_PERMISSION]), ctx, invocation, payload: VALID } as never);
        expect((preview.changes ?? []).join(" ")).toContain("already posted are unaffected");
    });
});
