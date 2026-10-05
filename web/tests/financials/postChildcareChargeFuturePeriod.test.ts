/**
 * W7-F001 — THE GATE IS IN THE AUTHORITY, WHICH IS WHY EVERY CHARGE WRITER INHERITS IT.
 *
 * `postChildcareCharge` is the only act that makes a childcare charge owed. These cases prove the
 * future-period gate binds THERE rather than in a caller, because the whole defect class is a rule
 * that one caller honours and another does not: the deployed census found four charges already
 * posted into a period beginning in December, every one of them raised from a charge template by
 * the path that never asked the question.
 *
 * The fake client is shape-faithful about the two things that decide the outcome: a conditional
 * UPDATE matches or it does not, and an omitted column arrives as `undefined` rather than as an
 * error. The second is not pedantry — a live run once lost the closed-period guard to exactly that.
 */
import { describe, expect, it } from "vitest";

import { businessDateInZone } from "@/lib/financials/businessDate";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { periodNotStartedFacts } from "@/lib/financials/posting/postingPeriodGate";

const ORG = "org-1";

type Charge = Record<string, unknown>;
type Period = Record<string, unknown>;

function makeDb(args: {
    charge: Charge;
    period: Period | null;
    /** What `org_settings.metadata` returns, so the business-date path is exercised for real. */
    orgTimezone?: string | null;
}) {
    const charge: Charge = { ...args.charge };
    const updates: Array<{ table: string; patch: Record<string, unknown>; matched: boolean }> = [];

    function builder(table: string) {
        const eqs: Array<[string, unknown]> = [];
        let patch: Record<string, unknown> | null = null;

        const rowFor = (): Record<string, unknown> | null => {
            if (table === "charges") return charge as Record<string, unknown>;
            if (table === "financial_billing_periods") return args.period;
            if (table === "org_settings") {
                return args.orgTimezone === undefined
                    ? null
                    : { metadata: args.orgTimezone ? { operational_timezone: args.orgTimezone } : {} };
            }
            /* Anything else — the journal, for instance — is simply absent, which the journal
             * recorder reports as `skipped` rather than failing the post. */
            return null;
        };

        const matches = (row: Record<string, unknown> | null): boolean => {
            if (!row) return false;
            return eqs.every(([col, val]) => {
                if (col === "org_id") return val === ORG;
                return row[col] === val;
            });
        };

        const api: Record<string, unknown> = {
            select: () => api,
            insert: (p: Record<string, unknown>) => {
                patch = p;
                return api;
            },
            update: (p: Record<string, unknown>) => {
                patch = p;
                return api;
            },
            eq: (col: string, val: unknown) => {
                eqs.push([col, val]);
                return api;
            },
            maybeSingle: async () => {
                const row = rowFor();
                if (patch) {
                    const matched = matches(row);
                    updates.push({ table, patch, matched });
                    if (matched) Object.assign(row as object, patch);
                    return { data: matched ? { ...(row as object) } : null, error: null };
                }
                return { data: matches(row) ? { ...(row as object) } : row, error: null };
            },
            single: async () => (api.maybeSingle as () => Promise<unknown>)(),
            then: undefined,
        };
        /*
         * An un-awaited terminal (`.update(...).eq(...)` with no `.select()`) is how
         * `markDraftAwaitingItsPeriod` writes. It is awaited as a promise, so the builder is
         * thenable and resolves the same way.
         */
        (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve((api.maybeSingle as () => Promise<unknown>)()).then(resolve);
        return api;
    }

    return {
        client: { from: (table: string) => builder(table) } as never,
        updates,
        charge,
    };
}

function draft(overrides: Charge = {}): Charge {
    return {
        id: "chg-1",
        org_id: ORG,
        job_id: null,
        source_charge_id: null,
        billable_source_type: "customer",
        billable_source_id: "cust-1",
        charge_type: "fee",
        charge_category: "one_time",
        status: "draft",
        currency_code: "USD",
        amount_cents: 4000,
        service_date: "2026-11-05",
        due_date: null,
        posted_at: null,
        voided_at: null,
        description: "registration",
        metadata: { source: "charge_template", resolution_key: "rk-1" },
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: null,
        created_by: "user-1",
        updated_by: null,
        posted_by: null,
        billing_period_id: "bp-1",
        legacy_billing_period_key: null,
        billing_period_generation: "canonical",
        ...overrides,
    };
}

describe("postChildcareCharge and a billing period that has not begun", () => {
    it("refuses the post, and the charge is still a draft", async () => {
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2026-12", status: "open", starts_on: "2026-12-01" },
        });

        await expect(
            postChildcareCharge(db.client, {
                orgId: ORG,
                chargeId: "chg-1",
                actorUserId: "user-1",
                businessDateYmd: "2026-10-05",
            }),
        ).rejects.toThrow(/has not started yet/);

        expect(db.charge.status).toBe("draft");
        expect(db.charge.posted_at).toBeNull();
        /* No UPDATE anywhere set `status`. The draft is preserved, not re-dated and not voided. */
        expect(db.updates.some((u) => "status" in u.patch)).toBe(false);
    });

    it("labels the draft with WHY and with the date it posts, so the queue can say so", async () => {
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2026-12", status: "open", starts_on: "2026-12-01" },
        });
        await postChildcareCharge(db.client, {
            orgId: ORG, chargeId: "chg-1", businessDateYmd: "2026-10-05",
        }).catch(() => undefined);

        const metadata = db.charge.metadata as Record<string, unknown>;
        expect(metadata.post_gate).toBe("period_not_started");
        expect(metadata.post_not_before).toBe("2026-12-01");
        expect(metadata.post_gate_period_key).toBe("2026-12");
        /* The row's existing provenance survives the label — it is what makes the draft legible. */
        expect(metadata.source).toBe("charge_template");
        expect(metadata.resolution_key).toBe("rk-1");
    });

    it("carries the facts a caller needs to report the outcome instead of an error", async () => {
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2026-12", status: "open", starts_on: "2026-12-01" },
        });
        const error = await postChildcareCharge(db.client, {
            orgId: ORG, chargeId: "chg-1", businessDateYmd: "2026-10-05",
        }).then(() => null, (e) => e);
        expect(periodNotStartedFacts(error)).toMatchObject({
            chargeId: "chg-1", periodKey: "2026-12", periodStartsOn: "2026-12-01",
        });
    });

    it("posts once the period has begun", async () => {
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2026-11", status: "open", starts_on: "2026-11-01" },
        });
        const result = await postChildcareCharge(db.client, {
            orgId: ORG, chargeId: "chg-1", actorUserId: "user-1", businessDateYmd: "2026-11-01",
        });
        expect(result.alreadyPosted).toBe(false);
        expect(db.charge.status).toBe("posted");
    });

    it("posts a legacy draft that belongs to no canonical period at all", async () => {
        /* `billing_period_id` is null for the historical thirty-five. The gate must not fire on
         * them: they are outside canonical period semantics entirely. */
        const db = makeDb({ charge: draft({ billing_period_id: null }), period: null });
        const result = await postChildcareCharge(db.client, {
            orgId: ORG, chargeId: "chg-1", businessDateYmd: "2026-10-05",
        });
        expect(result.alreadyPosted).toBe(false);
        expect(db.charge.status).toBe("posted");
    });

    it("still refuses a CLOSED period, and says that rather than the calendar", async () => {
        /* The two guards are at the same boundary and must stay distinguishable: one refuses a
         * draft becoming owed in a FINISHED period, the other in one that has not STARTED. */
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2026-09", status: "closed", starts_on: "2026-09-01" },
        });
        const error = await postChildcareCharge(db.client, {
            orgId: ORG, chargeId: "chg-1", businessDateYmd: "2026-10-05",
        }).then(() => null, (e) => e);
        expect(String(error)).toMatch(/closed/);
        expect(periodNotStartedFacts(error)).toBeNull();
    });

    it("resolves the ORGANISATION's business date when the caller supplies none", async () => {
        /*
         * The gate must not depend on a caller remembering to pass the right calendar — that is
         * exactly the mistake that made the Financials card read receivables in UTC. With no
         * `businessDateYmd`, the authority reads the tenant's own zone from `org_settings`, and the
         * date it recorded must be that zone's date rather than the UTC one.
         */
        const db = makeDb({
            charge: draft(),
            period: { id: "bp-1", period_key: "2099-01", status: "open", starts_on: "2099-01-01" },
            orgTimezone: "America/Los_Angeles",
        });
        await postChildcareCharge(db.client, { orgId: ORG, chargeId: "chg-1" }).catch(() => undefined);

        const metadata = db.charge.metadata as Record<string, unknown>;
        expect(metadata.post_gate).toBe("period_not_started");
        expect(metadata.post_gate_observed_on).toBe(
            businessDateInZone("America/Los_Angeles", new Date()),
        );
    });
});
