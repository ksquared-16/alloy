/**
 * THE REGISTERED HANDLER — what the scheduler gets back, and what the handler refuses to own.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluatePeriodicBillingOccurrence } from "@/lib/financials/periodicBilling/periodicBillingHandler";
import { BILLING_PERIODIC_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
import type { ScheduledWorkContext } from "@/lib/scheduledWork/scheduledWorkTypes";

const code = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Comments stripped, because these locks are about what the CODE does. The runtime's own prose
 * explains that a domain no-op — "aging finding no qualifying charge" — is a success, and a lock
 * that reddened on the word "charge" appearing in that explanation would be punishing the file for
 * being well documented. Same helper shape the scheduler's own lock uses.
 */
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

const ctx = (over: Partial<ScheduledWorkContext> = {}): ScheduledWorkContext => ({
    scheduledWorkId: "sw-1", occurrenceId: "occ-1", orgId: "org-1",
    handlerKey: BILLING_PERIODIC_HANDLER_KEY, dueAt: "2026-03-01T00:00:00Z",
    attemptNumber: 1, workerId: "worker-1", domainRef: {},
    ...over,
});

/** A client that would throw if the handler tried to read anything. */
const explodingClient = { from: () => { throw new Error("the handler must not read for a tenantless occurrence"); } } as never;

describe("the handler's boundary", () => {
    it("an occurrence with no organization bills nothing and reads nothing", async () => {
        /*
         * THE HAZARD THIS CLOSES: a platform-level row already exists — the clock activation probe
         * — seeded with org_id null precisely BECAUSE this handler was non-mutating then. The
         * moment the body became real that row would wake it again, and reading null as "every
         * organization" would have turned a certification artifact into a billing run.
         */
        const outcome = await evaluatePeriodicBillingOccurrence(ctx({ orgId: null }), { supabase: explodingClient });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toMatch(/no organization/i);
        expect((outcome.diagnostic as { financial_mutation_performed?: boolean }).financial_mutation_performed).toBe(false);
    });

    it("is the registered key the scheduler dispatches, and is no longer a shadow", () => {
        expect(BILLING_PERIODIC_HANDLER_KEY).toBe("financials.periodic_billing.evaluate");
        const consumers = code("lib/scheduledWork/scheduledWorkConsumers.ts");
        // The registration must name the real handler, and must not route billing through the stub.
        expect(consumers).toMatch(/registerScheduledWorkHandler\(\s*BILLING_PERIODIC_HANDLER_KEY,[\s\S]{0,200}?evaluatePeriodicBillingOccurrence/);
        expect(consumers, "billing no longer answers through the non-mutating stub")
            .not.toMatch(/BILLING_PERIODIC_HANDLER_KEY[\s\S]{0,160}?evaluated\(/);
    });

    it("charge aging is still a stub, and says so", () => {
        // §29 — this run productizes ONE consumer. The other is reported, not quietly implied.
        const consumers = code("lib/scheduledWork/scheduledWorkConsumers.ts");
        expect(consumers).toMatch(/CHARGE_AGING_HANDLER_KEY[\s\S]{0,200}?evaluated\("charge_aging"/);
        expect(consumers).toContain("not_productized_v1");
    });
});

describe("what periodic billing does not own", () => {
    const files = [
        "lib/financials/periodicBilling/periodicBillingHandler.ts",
        "lib/financials/periodicBilling/evaluatePeriodicBilling.ts",
        "lib/financials/periodicBilling/readOutstandingBillingPeriods.ts",
    ];

    it("writes no responsibility and answers no question about who owes", () => {
        for (const f of files) {
            const src = statements(code(f));
            expect(src, `${f} must not touch responsibility`)
                .not.toMatch(/responsib|payer_assignment|charge_responsibility/i);
        }
    });

    it("infers no accounting period", () => {
        for (const f of files) {
            const src = statements(code(f));
            expect(src, `${f} must not compute accounting attribution`)
                .not.toMatch(/accounting_period|accountingPeriod|journal|gl_account/i);
        }
    });

    it("computes no price, no discount and no due date of its own", () => {
        for (const f of files) {
            const src = statements(code(f));
            expect(src, `${f} must not price`).not.toMatch(/charge_template|catalog|list_price|rate_cents/i);
            expect(src, `${f} must not reduce`).not.toMatch(/discount|reduction|commercial_polic/i);
            expect(src, `${f} must not date`).not.toMatch(/resolveDueDate|due_date/i);
        }
    });

    it("moves money only through the canonical generation authority", () => {
        const src = code("lib/financials/periodicBilling/evaluatePeriodicBilling.ts");
        // The default is the authority; the seam exists so the bound can be driven in a test.
        expect(src).toMatch(/args\.generate \?\? generateTuitionCharges/);
        expect(src).toContain('from "@/lib/financials/tuitionGeneration/generateTuitionCharges"');
        // No direct writes anywhere in the domain evaluation.
        for (const f of files) {
            expect(statements(code(f)), `${f} must not write directly`).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
        }
    });

    it("the generic scheduler still knows nothing about billing", () => {
        // Re-asserted here because productizing a consumer is exactly when this leaks.
        for (const f of ["lib/scheduledWork/scheduledWorkRuntime.ts", "lib/scheduledWork/scheduledWorkRegistry.ts", "app/api/scheduled-work/wake/route.ts"]) {
            expect(statements(code(f)), `${f} must not know what billing means`)
                .not.toMatch(/tuition|invoice|charge|catch_up|billing_period|outstanding/i);
        }
    });
});
