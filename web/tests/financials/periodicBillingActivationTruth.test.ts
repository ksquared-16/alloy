/**
 * WHAT THE PRODUCT IS ALLOWED TO CLAIM, and what has to be true before it claims it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
    PERIODIC_BILLING_SCHEDULE_LABEL,
    readPeriodicBillingSchedule,
} from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { BILLING_PERIODIC_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";

const code = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Comments stripped: this file's own prose explains that a weekly tenant and a monthly tenant get
 * the same daily wake, and a lock that reddened on the word "weekly" appearing in that explanation
 * would punish the file for saying why it is built the way it is.
 */
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

/** Every .ts/.tsx under these roots, so "nothing calls this yet" is a measured claim. */
function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        let entries: ReturnType<typeof readdirSync>;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
            else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
        }
    };
    for (const dir of ["lib", "app", "components", "scripts"]) walk(join(process.cwd(), dir));
    return out;
}

/** A client that answers the schedule lookup with whatever row the test names. */
function client(row: Record<string, unknown> | null) {
    return {
        from: () => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self; chain.eq = self;
            chain.maybeSingle = async () => ({ data: row, error: null });
            return chain;
        },
    } as never;
}

describe("automatic billing is a fact about the tenant, not about the build", () => {
    it("no schedule means not active", async () => {
        const state = await readPeriodicBillingSchedule(client(null), "org-1");
        expect(state.automaticBillingActive).toBe(false);
        expect(state.scheduleExists).toBe(false);
    });

    it("a stopped schedule is not active, and is distinguishable from never provisioned", async () => {
        const state = await readPeriodicBillingSchedule(
            client({ id: "sw-1", is_active: false, next_due_at: "2026-10-01T00:00:00Z" }), "org-1",
        );
        expect(state.automaticBillingActive).toBe(false);
        expect(state.scheduleExists, "stopped is not the same as absent").toBe(true);
    });

    it("a wound-down schedule owing no next moment is not active", async () => {
        const state = await readPeriodicBillingSchedule(
            client({ id: "sw-1", is_active: true, next_due_at: null }), "org-1",
        );
        expect(state.automaticBillingActive).toBe(false);
    });

    it("an active schedule with a next moment is active", async () => {
        const state = await readPeriodicBillingSchedule(
            client({ id: "sw-1", is_active: true, next_due_at: "2026-10-01T00:00:00Z" }), "org-1",
        );
        expect(state.automaticBillingActive).toBe(true);
        expect(state.nextDueAt).toBe("2026-10-01T00:00:00Z");
    });
});

describe("the operator surface cannot claim what is not true", () => {
    const panel = code("components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx");

    it("the automatic claim is rendered only when the tenant's schedule is active", () => {
        /*
         * BOUND TO THE SENTENCE'S OWN CONDITION. A proximity match passed while the claim itself
         * was made unconditional, because the className ternary a few lines above still mentioned
         * `automatic.active` and sat inside the window. The condition that decides which sentence
         * renders is the thing under test, so it is matched immediately before the sentence.
         */
        expect(panel).toMatch(/\{automatic\.active\s*\?\s*\n?\s*"Recurring tuition is billed automatically/);
        expect(panel, "the negative sentence is the other branch of that same condition")
            .toMatch(/:\s*\n?\s*"Recurring tuition is NOT billed automatically/);
        expect(panel).toMatch(/data-periodic-billing-active=\{automatic\.active \? "true" : "false"\}/);
    });

    it("an unknown status claims nothing at all", () => {
        // Null state renders no sentence — a failed read must not read as "not automatic" either.
        expect(panel).toMatch(/\{automatic \?/);
    });

    it("the status comes from the tenant's schedule, not from a constant", () => {
        const route = statements(code("app/api/admin/financials/periodic-billing-status/route.ts"));
        expect(route).toContain("readPeriodicBillingSchedule");
        expect(route, "no hardcoded activation answer").not.toMatch(/automatic_billing_active:\s*(true|false)\b/);
        // And it stays a domain answer: no scheduler internals leak to the operator.
        expect(route).not.toMatch(/lease|claim_token|occurrence|worker/i);
    });
});

describe("activation stays a deliberate act", () => {
    it("the schedule is provisioned by nothing yet", () => {
        /*
         * Provisioning IS activation. A migration, a startup hook or a surface calling this would
         * switch automatic billing on for every tenant the moment the candidate was promoted,
         * which is the opposite of returning READY and stopping for authorization.
         */
        const callers = sourceFiles().filter(
            (p) => !p.endsWith("periodicBillingSchedule.ts") && readFileSync(p, "utf8").includes("ensurePeriodicBillingSchedule"),
        ).map((p) => p.replace(`${process.cwd()}/`, ""));
        expect(callers, `activation must not be wired yet — found ${JSON.stringify(callers)}`).toEqual([]);
    });

    it("the schedule carries no billing cadence", () => {
        const src = statements(code("lib/financials/periodicBilling/periodicBillingSchedule.ts"));
        // A daily heartbeat, and the DOMAIN decides what is due. Cadence in the recurrence would be
        // "it's the first, bill monthly" written into infrastructure.
        expect(src).toMatch(/recurrence_kind:\s*"daily"/);
        expect(src).not.toMatch(/weekly|biweekly|monthly|annual/i);
        expect(PERIODIC_BILLING_SCHEDULE_LABEL).toBe("financials_periodic_billing");
        expect(src).toContain("BILLING_PERIODIC_HANDLER_KEY");
        expect(BILLING_PERIODIC_HANDLER_KEY).toBe("financials.periodic_billing.evaluate");
    });
});
