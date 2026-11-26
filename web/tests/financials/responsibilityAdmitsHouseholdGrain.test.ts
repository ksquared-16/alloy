/**
 * HOUSEHOLD GRAIN IS A RESPONSIBILITY GRAIN.
 *
 * Measured on deployed staging, third decisive attempt: `billing.configure_responsibility` finally
 * EXECUTED and was then refused by its own registry —
 *
 *     Action "billing.configure_responsibility" does not support entity type "customer"
 *
 * — so a household-grain charge posted owed by nobody while the account carried a standing
 * arrangement. The authority defines both grains: `financial_responsibility_arrangements` holds
 * `customer_id` ALWAYS and `customer_member_id` NULLABLE, and a null member IS the household scope.
 *
 * Asserted against the REGISTERED OBJECT the executor looks up, not against the source text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    financialResponsibilityActions,
    BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY,
    BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY,
    BILLING_REALLOCATE_RESPONSIBILITY_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/financialResponsibilityActions";

const byKey = (key: string) => {
    const a = financialResponsibilityActions.find((x) => x.actionKey === key);
    expect(a, `${key} is registered`).toBeDefined();
    return a!;
};

describe("the configure action admits the grain a household charge presents", () => {
    const configure = byKey(BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY);

    it("admits customer", () => {
        expect(configure.supportedEntityTypes).toContain("customer");
    });

    it("still admits the member grains it always did", () => {
        for (const t of ["child", "person", "opportunity_customer_member"]) {
            expect(configure.supportedEntityTypes, `${t} remains supported`).toContain(t);
        }
    });

    it("admits nothing that is not an account grain", () => {
        /* Widening is to the account's own vocabulary, not to everything. */
        for (const t of ["staff", "location", "work_unit", "enrollment_agreement"]) {
            expect(configure.supportedEntityTypes, `${t} is not a responsibility grain`).not.toContain(t);
        }
    });

    it("shares one definition with the other account-mounted responsibility acts", () => {
        /*
         * The drift WAS the defect: configure carried the only hand-written list in the file and it
         * was missing `customer`, while resolve and reallocate already used the shared constant that
         * has carried it all along. Equal sets, so neither can move without the other.
         */
        const resolve = byKey(BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY);
        const reallocate = byKey(BILLING_REALLOCATE_RESPONSIBILITY_ACTION_KEY);
        expect([...configure.supportedEntityTypes].sort()).toEqual([...resolve.supportedEntityTypes].sort());
        expect([...configure.supportedEntityTypes].sort()).toEqual([...reallocate.supportedEntityTypes].sort());
    });
});

describe("admitting it reinterprets nothing", () => {
    const SRC = readFileSync(
        path.join(process.cwd(), "lib/adminV2/actions/definitions/financialResponsibilityActions.ts"),
        "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    /* The configure action's own execute body, not the file. */
    const body = SRC.slice(SRC.indexOf("const configureResponsibility"), SRC.indexOf("const resolveLikeResponsibility") >= 0
        ? SRC.indexOf("const resolveLikeResponsibility")
        : SRC.length);

    it("takes the account from the payload, never from the invoked entity", () => {
        expect(body).toMatch(/customerId: t\(payload\?\.customer_id\)/);
        expect(body, "the entity id is never read as the account").not.toMatch(/customerId:\s*t?\(?invocation\.entityId/);
    });

    it("leaves the member null for household grain rather than deriving one", () => {
        expect(body).toMatch(/customerMemberId: t\(payload\?\.customer_member_id\) \|\| null/);
        expect(body, "no member is looked up from the customer").not.toMatch(/customerMemberId:\s*t?\(?invocation/);
    });

    it("keeps the charge scope payload-driven too", () => {
        expect(body).toMatch(/chargeId: t\(payload\?\.charge_id\) \|\| null/);
    });
});

describe("the per-member acts are NOT widened by analogy", () => {
    it("expected-funding and payment-attribution keep their member grains", () => {
        for (const a of financialResponsibilityActions) {
            if (
                a.actionKey === BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY
                || a.actionKey === BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY
                || a.actionKey === BILLING_REALLOCATE_RESPONSIBILITY_ACTION_KEY
            ) continue;
            expect(
                a.supportedEntityTypes,
                `${a.actionKey} was not given household grain just because its neighbours have it`,
            ).not.toContain("customer");
        }
    });
});
