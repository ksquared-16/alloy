/**
 * A RETRY MUST NOT BILL A FAMILY TWICE — proven on the real resolution authority.
 *
 * ── WHY THIS SEAM ────────────────────────────────────────────────────────────────────────────
 *
 * There is no batch table and no rollback on this path, and none is added here. Idempotency is a
 * single fact: `tpl:<template_key>:<occurs_on>:<scopeKey>` plus the database's
 * `charges_resolution_key_unique`. So the honest place to prove a retry is the code that COMPUTES
 * that key and the code that decides what a second pass would write — `resolveChargeFromTemplate`
 * and `previewTemplateCharge`, both run for real here.
 *
 * What is doubled is only the store: a charges table that answers the same three filters the real
 * dedupe read uses and hands back the same `metadata.resolution_key` a real row carries. The key
 * arithmetic, the scope decision and the create/unchanged/recalculate verdict are the product's.
 *
 * ── THE SCOPE BUG THIS PROTECTS ──────────────────────────────────────────────────────────────
 *
 * The key was once scoped to the agreement with a literal `"org"` fallback, so two different
 * families' household fees collided on the same day — and a household charge had no idempotency at
 * all. The scope is the BILLABLE SOURCE. That is what makes N children N obligations rather than
 * one, and it is what stops a retry from making 2N.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const listChargeTemplates = vi.fn();
const listFinancialPolicies = vi.fn();
vi.mock("@/lib/financials/chargeTemplates/chargeTemplateAuthoringService", () => ({
    listChargeTemplates: (...a: unknown[]) => listChargeTemplates(...a),
}));
vi.mock("@/lib/financials/policies/financialPolicyService", () => ({
    listFinancialPolicies: (...a: unknown[]) => listFinancialPolicies(...a),
}));

const { previewTemplateCharge } = await import("@/lib/financials/chargeLifecycle/chargeLifecycleService");
const { resolveChargeFromTemplate } = await import("@/lib/financials/chargeLifecycle/resolveChargeFromTemplate");
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

const TODAY = "2026-09-18";

const TEMPLATE: ChargeTemplateRow = {
    id: "tpl-fieldtrip", org_id: "org-1", service_id: null, template_key: "field_trip", label: "Field trip",
    description: null, charge_category: "fee", trigger_type: "manual", trigger_key: null,
    amount_strategy: "fixed", amount_cents: 4000, currency_code: "USD", occurs_on_strategy: "now",
    billable_on_strategy: "immediate", billable_offset_days: null, default_gl_mapping_key: null,
    default_responsibility_key: null, review_required: false, is_active: true,
    effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
    created_by: null, updated_by: null, created_at: "", updated_at: "",
} as ChargeTemplateRow;

/** One charge row as the real table stores it — the resolution key lives in `metadata`. */
type StoredCharge = {
    id: string; org_id: string; billable_source_type: string; billable_source_id: string;
    status: string; amount_cents: number; occurs_on: string; billable_on: string;
    charge_template_id: string; metadata: { resolution_key: string };
};

/**
 * A charges table that answers the three filters the dedupe read actually applies. It is a store,
 * not a stub of the decision: the create/unchanged verdict is computed by the product from what
 * this returns.
 */
function storeOf(rows: StoredCharge[]) {
    return {
        from: (_table: string) => {
            const f: Record<string, unknown> = {};
            let filtered = rows;
            const chain = {
                select: () => chain,
                eq: (col: string, val: unknown) => {
                    f[col] = val;
                    filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
                    return chain;
                },
                then: undefined,
            } as unknown as PromiseLike<{ data: StoredCharge[]; error: null }> & Record<string, unknown>;
            // The read is awaited directly after the last .eq(), so the chain must be thenable.
            (chain as unknown as { then: unknown }).then = (res: (v: { data: StoredCharge[]; error: null }) => unknown) =>
                res({ data: filtered, error: null });
            return chain;
        },
    } as never;
}

const preview = (rows: StoredCharge[], args: Record<string, unknown>) =>
    previewTemplateCharge(storeOf(rows), "org-1", { templateId: "tpl-fieldtrip", today: TODAY, ...args } as never);

const stored = (id: string, sourceType: string, sourceId: string, key: string, over: Partial<StoredCharge> = {}): StoredCharge => ({
    id, org_id: "org-1", billable_source_type: sourceType, billable_source_id: sourceId,
    status: "draft", amount_cents: 4000, occurs_on: TODAY, billable_on: TODAY,
    charge_template_id: "tpl-fieldtrip", metadata: { resolution_key: key }, ...over,
});

beforeEach(() => {
    listChargeTemplates.mockReset().mockResolvedValue([TEMPLATE]);
    listFinancialPolicies.mockReset().mockResolvedValue([]);
});

describe("THE GATE — N children is N keys (§3A)", () => {
    /* The key is scoped to the BILLABLE SOURCE, so each child's agreement earns its own. */
    it("gives each child's agreement its own resolution key", () => {
        const keyFor = (scopeKey: string) =>
            resolveChargeFromTemplate(TEMPLATE, { today: TODAY, scopeKey } as never).resolutionKey;
        const ana = keyFor("agr-ana");
        const ben = keyFor("agr-ben");
        expect(ana).toBe("tpl:field_trip:2026-09-18:agr-ana");
        expect(ben).toBe("tpl:field_trip:2026-09-18:agr-ben");
        expect(ana, "two children are two obligations, never one").not.toBe(ben);
    });

    /* Same child, same template, same day — the SAME key. That is what makes a retry safe. */
    it("gives a repeat of the same intent the same key", () => {
        const k = () => resolveChargeFromTemplate(TEMPLATE, { today: TODAY, scopeKey: "agr-ana" } as never).resolutionKey;
        expect(k()).toBe(k());
    });

    /*
     * THE SCOPE BUG. A household charge must key on the CUSTOMER, not the literal "org" — which
     * would have collided two different families' fees on the same day.
     */
    it("scopes a household charge to the customer, never to a shared literal", async () => {
        const r = await preview([], { billableSource: { type: "customer", id: "cust-certhouse" } });
        expect(r.intent.resolutionKey).toBe("tpl:field_trip:2026-09-18:cust-certhouse");
        expect(r.intent.resolutionKey).not.toContain(":org");
    });
});

describe("THE GATE — the retry converges (§3A)", () => {
    it("writes each child once on the first pass", async () => {
        for (const agr of ["agr-ana", "agr-ben"]) {
            const r = await preview([], { agreementId: agr });
            expect(r.wouldWrite, `${agr} is new`).toBe("create");
            expect(r.existing).toBeNull();
        }
    });

    /*
     * THE RETRY. The same governed intent, replayed against a store that already holds the first
     * pass's rows, creates NOTHING and resolves to the charges that already exist — by id.
     */
    it("creates zero duplicates on a retry, and names the rows that already exist", async () => {
        const first = [
            stored("chg-ana", "enrollment_agreement", "agr-ana", "tpl:field_trip:2026-09-18:agr-ana"),
            stored("chg-ben", "enrollment_agreement", "agr-ben", "tpl:field_trip:2026-09-18:agr-ben"),
        ];
        const retry = await Promise.all(["agr-ana", "agr-ben"].map((agr) => preview(first, { agreementId: agr })));

        expect(retry.map((r) => r.wouldWrite), "nothing is created twice").toEqual(["unchanged", "unchanged"]);
        expect(retry.map((r) => r.existing?.id), "it resolves to the same two rows").toEqual(["chg-ana", "chg-ben"]);
    });

    /* One child's existing charge must not satisfy another child's intent. */
    it("does not let one child's charge suppress a sibling's", async () => {
        const onlyAna = [stored("chg-ana", "enrollment_agreement", "agr-ana", "tpl:field_trip:2026-09-18:agr-ana")];
        expect((await preview(onlyAna, { agreementId: "agr-ana" })).wouldWrite).toBe("unchanged");
        expect((await preview(onlyAna, { agreementId: "agr-ben" })).wouldWrite, "Ben is still owed a charge").toBe("create");
    });

    /* A POSTED charge is history. A retry may not quietly rewrite it. */
    it("refuses to touch a charge that has already posted", async () => {
        const posted = [stored("chg-ana", "enrollment_agreement", "agr-ana", "tpl:field_trip:2026-09-18:agr-ana", { status: "posted" })];
        expect((await preview(posted, { agreementId: "agr-ana" })).wouldWrite).toBe("skipped_posted");
    });
});

describe("THE GATE — the review boundary is policy, not ceremony (§3H)", () => {
    /*
     * NO CONFIGURED REVIEW is not "review by default". The tenant that configured nothing gets the
     * direct path, because the ceremony would be a decision nobody made.
     */
    it("requires no review when the organisation has configured none", async () => {
        listFinancialPolicies.mockResolvedValue([]);
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent.reviewRequired).toBe(false);
    });

    it("requires review when the posting_review policy says so", async () => {
        listFinancialPolicies.mockResolvedValue([{
            // The scope vocabulary is "org" — the surface says so too: "Resolved (org default)".
            id: "pol-review", org_id: "org-1", policy_type: "posting_review", scope_type: "org",
            location_id: null, service_id: null, rate_plan_id: null,
            value: { required: true }, effective_start: "2026-01-01", effective_end: null, is_active: true,
        }]);
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent.reviewRequired, "the configured boundary is honoured").toBe(true);
    });

    /* A template may demand review on its own, whatever the org policy says. */
    it("lets a template demand review independently of policy", async () => {
        listChargeTemplates.mockResolvedValue([{ ...TEMPLATE, review_required: true }]);
        listFinancialPolicies.mockResolvedValue([]);
        expect((await preview([], { agreementId: "agr-ana" })).intent.reviewRequired).toBe(true);
    });

    /*
     * POSTED IS NOT "ACCOUNTING PERIOD CLOSED". The review boundary decides whether a human sees
     * the charge before it posts; it says nothing about the period being closed, and the intent
     * carries no such claim.
     */
    it("does not conflate the review boundary with a closed accounting period", async () => {
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent).not.toHaveProperty("periodClosed");
        expect(r.intent.lifecycleStatus, "an immediate charge is a draft, not a posting verdict").toBe("draft");
    });
});

describe("THE GATE — the due-date policy actually runs (§7E)", () => {
    /*
     * ── A CONFIGURABLE POLICY THAT NOTHING CONSUMED ──────────────────────────────────────────
     *
     * `resolveDueDate` shipped with four strategies and a deliberate null for "no rule". It had NO
     * CALLER: `ChargeResolutionContext.dueDate` was declared and never supplied, the insert never
     * wrote the column, and every charge recorded `due_date: null`. An operator could configure
     * terms on /organization/financials and the product ignored them — configurable, and not a
     * capability.
     *
     * The five dates stay five dates. These lock that the DUE date is derived from the INVOICE date
     * and the period, and that neither is overwritten by it.
     */
    const dueDatePolicy = (value: Record<string, unknown>) => ([{
        id: "pol-due", org_id: "org-1", policy_type: "due_date", scope_type: "org",
        location_id: null, service_id: null, rate_plan_id: null,
        value, effective_start: "2026-01-01", effective_end: null, is_active: true,
    }]);

    it("leaves the due date alone when the organisation has configured no terms", async () => {
        listFinancialPolicies.mockResolvedValue([]);
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent.dueDate, "not today, not the invoice date — untouched").toBeNull();
    });

    it("resolves on_invoice to the invoice date itself", async () => {
        listFinancialPolicies.mockResolvedValue(dueDatePolicy({ strategy: "on_invoice" }));
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent.dueDate).toBe(r.intent.billableOn);
        expect(r.intent.dueDate).toBe(TODAY);
    });

    it("resolves days_after_invoice by counting from the invoice date", async () => {
        listFinancialPolicies.mockResolvedValue(dueDatePolicy({ strategy: "days_after_invoice", offset_days: 10 }));
        const r = await preview([], { agreementId: "agr-ana" });
        expect(r.intent.dueDate).toBe("2026-09-28");
        expect(r.intent.billableOn, "the invoice date is not moved by the due date").toBe(TODAY);
        expect(r.intent.occursOn, "and neither is the service date").toBe(TODAY);
    });

    /* An unreadable strategy is not a guess: no date rather than a wrong one. */
    it("writes no due date for a strategy it cannot carry out", async () => {
        listFinancialPolicies.mockResolvedValue(dueDatePolicy({ strategy: "whenever_feels_right" }));
        expect((await preview([], { agreementId: "agr-ana" })).intent.dueDate).toBeNull();
    });

    /* And the column is actually written, which is the half that made this invisible. */
    it("persists the resolved due date on the charge", () => {
        const svc = readFileSync(join(process.cwd(), "lib/financials/chargeLifecycle/chargeLifecycleService.ts"), "utf8");
        const insertAt = svc.indexOf("        .insert({");
        expect(insertAt, "the create insert is findable").toBeGreaterThan(0);
        expect(svc.slice(insertAt, insertAt + 1400), "the create writes it").toContain("due_date: intent.dueDate");
        expect(svc, "and a recalculated draft re-dates it").toMatch(/update\(\{[\s\S]{0,600}due_date: intent\.dueDate/);
    });
});
