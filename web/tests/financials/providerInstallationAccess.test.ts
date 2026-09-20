/**
 * WHO MAY DECIDE WHERE A FAMILY'S MONEY SETTLES.
 *
 * `fin.write` is held by `ops` — the role that records cheques and collects cards all day. Connecting
 * a provider is a different act: it chooses the bank account every family's money lands in, for the
 * whole organisation. So it takes `fin.provider`, and these cases prove the gate is real rather than
 * a hidden menu item.
 *
 * Both halves matter. Eligibility decides whether a control is OFFERED; execute decides whether the
 * act HAPPENS. A surface that hid the chapter and an executor that accepted the call anyway would be
 * a product with no authorization at all.
 */
import { describe, expect, it } from "vitest";

import {
    PROVIDER_CONNECT_ACTION_KEY,
    PROVIDER_DISCONNECT_ACTION_KEY,
    PROVIDER_REFRESH_ACTION_KEY,
    providerInstallationActions,
} from "@/lib/adminV2/actions/definitions/providerInstallationActions";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    financialAuthority,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";

const ACTOR = "user-1";

function action(key: string) {
    const found = providerInstallationActions.find((a) => a.actionKey === key);
    if (!found) throw new Error(`no registered action ${key}`);
    return found;
}

function supabaseWith(keys: string[]) {
    return createOperationalEnrollmentMockSupabase(
        // The access cases never reach a merchant read — they are refused at the gate — so the store
        // only has to carry the caller's grants.
        createOperationalEnrollmentMockStore({ ...financialAuthority(keys, ACTOR) }),
    ) as never;
}

const ctx = { orgId: ORG_ID, userId: ACTOR } as never;
const invocation = { actionKey: "", entityType: "opportunity", entityId: "" } as never;

const CASES = [
    [PROVIDER_CONNECT_ACTION_KEY, "Connecting"],
    [PROVIDER_REFRESH_ACTION_KEY, "Refreshing"],
    [PROVIDER_DISCONNECT_ACTION_KEY, "Disconnecting"],
] as const;

describe("provider configuration requires fin.provider", () => {
    it.each(CASES)("%s is ineligible and refuses execution without the key", async (key) => {
        const supabase = supabaseWith(["fin.read", "fin.write", "fin.adjust"]);

        const eligibility = await action(key).resolveEligibility({
            supabase, ctx, invocation, payload: { display_name: "Northwind" },
        } as never);
        expect(eligibility.eligible, "an ops operator is not offered the control").toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("provider_permission_required");

        /* Hiding a control is not authorization. The executor refuses the same call. */
        const executed = await action(key).execute({
            supabase, ctx, invocation, payload: { display_name: "Northwind" },
        } as never);
        expect(executed.ok, "direct invocation is refused server-side").toBe(false);
        if (executed.ok) return;
        expect(executed.status).toBe(403);
        expect(executed.error).toContain("fin.provider");
    });

    it.each(CASES)("%s is eligible for a holder of fin.provider", async (key) => {
        const supabase = supabaseWith(["fin.read", "fin.provider"]);
        const eligibility = await action(key).resolveEligibility({
            supabase, ctx, invocation, payload: { display_name: "Northwind" },
        } as never);
        expect(eligibility.eligible).toBe(true);
    });

    it("refuses an unidentified caller rather than treating them as unprivileged", async () => {
        const supabase = supabaseWith(["fin.provider"]);
        const executed = await action(PROVIDER_CONNECT_ACTION_KEY).execute({
            supabase,
            ctx: { orgId: ORG_ID, userId: null } as never,
            invocation,
            payload: { display_name: "Northwind" },
        } as never);
        expect(executed.ok).toBe(false);
    });

    it("will not connect without a business name to give the provider", async () => {
        const validated = action(PROVIDER_CONNECT_ACTION_KEY).validatePayload({});
        expect(validated.ok).toBe(false);
    });

    it("declares disconnect as destructive, so the runtime asks before withdrawing collection", () => {
        expect(action(PROVIDER_DISCONNECT_ACTION_KEY).confirmationPolicy).toBe("destructive");
        expect(action(PROVIDER_CONNECT_ACTION_KEY).confirmationPolicy).toBe("none");
    });
});
