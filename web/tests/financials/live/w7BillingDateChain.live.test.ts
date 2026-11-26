/**
 * W7 BILLING CONFIGURATION CONVERGENCE — THE NOV 5 ACCEPTANCE EXAMPLE, AGAINST A REAL DATABASE.
 *
 * The Director's baseline, configured for ONE run-unique household (account-scoped rules, so the
 * shared certification tenant's org defaults are untouched):
 *
 *   billing period   monthly, 1st → last day
 *   invoice timing   7 days before the billing period begins
 *   payment due      on the first day of the billing period
 *   posting review   none
 *
 * Then the real writer (`writeTemplateDraftCharge`) and the real posting authority
 * (`postChildcareCharge`) run, and every assertion is a RE-READ of the stored row — never a
 * return value:
 *
 *   A  Nov 5 service, created Oct 8          → November · invoiced Oct 25 · due Nov 1 · waits for Nov 1
 *   B  Nov 5 service, created Nov 5 (late)   → November · invoiced Nov 5  · due Nov 5 · posts
 *   C  template exception "next cycle"       → STILL November · invoiced Dec 1
 *   D  GENERATED tuition for November        → the same chain through the generation path
 *      (`servicePeriodStart` + `autoPostGeneratedCharge`): invoiced Oct 25, due Nov 1, and the
 *      auto-post waits for the period rather than posting
 *
 * And the preview answers exactly what the write stored (preview/commit parity).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { previewTemplateCharge, writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { autoPostGeneratedCharge } from "@/lib/financials/posting/autoPostGeneratedCharge";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { ensureAccountingPeriodCovers } from "./certEnvironment";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = null;
const RUN = randomUUID().slice(0, 8);
const P = `f7c0${RUN.slice(0, 4)}-0000-4000-8000-`;
const CUSTOMER = `${P}0000000c0001`;
const LOCATION = `${P}0000000b0001`;
const CHILD = (n: number) => ({
    member: `${P}0000000d000${n}`,
    person: `${P}0000000e000${n}`,
    agreement: `${P}0000000a000${n}`,
});
const TEMPLATE_POLICY = `${P}000000010001`;
const TEMPLATE_NEXT_CYCLE = `${P}000000010002`;
const TEMPLATE_TUITION = `${P}000000010003`;

type StoredCharge = {
    id: string;
    status: string;
    service_date: string;
    billable_on: string | null;
    due_date: string | null;
    billing_period_id: string | null;
    metadata: Record<string, unknown>;
};

describeLive("W7 — the Nov 5 date chain, live", () => {
    let db: SupabaseClient;
    const periodOf = async (id: string | null) => {
        const { data } = await db.from("financial_billing_periods").select("period_key, starts_on, ends_on").eq("id", id!).single();
        return data as { period_key: string; starts_on: string; ends_on: string };
    };
    const reread = async (id: string) => {
        const { data, error } = await db
            .from("charges")
            .select("id, status, service_date, billable_on, due_date, billing_period_id, metadata")
            .eq("id", id)
            .single();
        expect(error).toBeNull();
        return data as StoredCharge;
    };

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: CUSTOMER, org_id: ORG, name: `W7 chain ${RUN}`, customer_type: "household" });
        await seed("locations", {
            id: LOCATION, org_id: ORG, customer_id: CUSTOMER, label: `W7 chain site ${RUN}`, location_type: "site", is_active: true,
        });
        for (const n of [1, 2, 3, 4]) {
            const c = CHILD(n);
            await seed("persons", { id: c.person, org_id: ORG, first_name: `Chain${n}`, last_name: "W7" });
            await seed("customer_members", {
                id: c.member, org_id: ORG, customer_id: CUSTOMER, person_id: c.person,
                display_name: `Chain${n} W7`, relationship: "child", is_active: true,
            });
            await seed("child_enrollment_agreements", {
                id: c.agreement, org_id: ORG, customer_id: CUSTOMER, customer_member_id: c.member, person_id: c.person,
                site_location_id: LOCATION, status: "active", start_date: "2026-01-01",
            });
        }
        /* The W7 baseline, scoped to THIS account so the shared tenant's defaults are not touched. */
        const rule = (policy_type: string, value: Record<string, unknown>) =>
            seed("financial_policies", {
                id: randomUUID(), org_id: ORG, scope_type: "customer", customer_id: CUSTOMER, location_id: null,
                policy_type, is_active: true, effective_start: "2026-01-01", effective_end: null, value,
            });
        await rule("billing_calendar", { cadence: "monthly", anchor_on: null });
        await rule("invoice_timing", { strategy: "days_before_period_start", offset_days: 7 });
        await rule("due_date", { strategy: "on_period_start", offset_days: 0 });

        const template = (id: string, key: string, billable_on_strategy: string, occurs_on_strategy = "event_date", trigger_type = "manual") =>
            seed("financial_charge_templates", {
                id, org_id: ORG, template_key: `w7_${key}_${RUN}`, label: `W7 ${key}`,
                charge_category: key === "tuition" ? "tuition" : "fee",
                trigger_type, amount_strategy: "fixed", amount_cents: 4000, currency_code: "USD",
                occurs_on_strategy, billable_on_strategy, billable_offset_days: null,
                review_required: false, is_active: true, effective_start: "2026-01-01",
            });
        await template(TEMPLATE_POLICY, "trip", "billing_policy");
        await template(TEMPLATE_NEXT_CYCLE, "arrears", "next_billing_cycle");
        await template(TEMPLATE_TUITION, "tuition", "billing_policy", "service_period_start", "schedule");

        await ensureAccountingPeriodCovers(db, ORG, "2026-11-05");
    });

    afterAll(async () => {
        await db.from("charges").delete().eq("org_id", ORG).in("billable_source_id", [1, 2, 3, 4].map((n) => CHILD(n).agreement)).eq("status", "draft");
        await db.from("financial_policies").delete().eq("org_id", ORG).eq("customer_id", CUSTOMER);
        await db.from("financial_charge_templates").delete().in("id", [TEMPLATE_POLICY, TEMPLATE_NEXT_CYCLE, TEMPLATE_TUITION]);
    });

    it("A — normal pre-period billing: November, invoiced Oct 25, due Nov 1, waits for Nov 1", async () => {
        const args = {
            templateId: TEMPLATE_POLICY,
            agreementId: CHILD(1).agreement,
            eventDate: "2026-11-05",
            today: "2026-10-08",
        };
        const preview = await previewTemplateCharge(db, ORG, args);
        const written = await writeTemplateDraftCharge(db, ORG, { ...args, actorUserId: ACTOR });
        expect(written.status).toBe("created");
        const row = await reread((written as { chargeId: string }).chargeId);
        const period = await periodOf(row.billing_period_id);

        expect(row.service_date).toBe("2026-11-05");
        expect(period).toEqual({ period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" });
        expect(row.billable_on).toBe("2026-10-25");
        expect(row.due_date).toBe("2026-11-01");
        expect(row.metadata.charge_dates).toMatchObject({
            period_key: "2026-11",
            invoice_rule: "days_before_period_start",
            invoice_offset_days: 7,
            invoice_rule_source: "policy:customer",
            invoice_late: false,
            due_rule: "on_period_start",
            due_clamped_to_invoice: false,
        });

        /* Preview/commit parity: the preview answered exactly what was stored. */
        expect(preview.intent.dateChain?.period?.key).toBe("2026-11");
        expect(preview.intent.billableOn).toBe(row.billable_on);
        expect(preview.intent.dueDate).toBe(row.due_date);
        expect(preview.intent.dateChain?.posting).toEqual({ gate: "awaits_period", notBefore: "2026-11-01" });

        /* Posting on Oct 8 refuses and labels the draft; on Nov 1 the period has begun and it posts. */
        await expect(
            postChildcareCharge(db, { orgId: ORG, chargeId: row.id, actorUserId: ACTOR, businessDateYmd: "2026-10-08" }),
        ).rejects.toThrow();
        const waiting = await reread(row.id);
        expect(waiting.status).toBe("draft");
        expect(waiting.metadata.post_gate).toBe("period_not_started");
        expect(waiting.metadata.post_not_before).toBe("2026-11-01");

        await postChildcareCharge(db, { orgId: ORG, chargeId: row.id, actorUserId: ACTOR, businessDateYmd: "2026-11-01" });
        expect((await reread(row.id)).status).toBe("posted");

        /* The journal STORES the billing period — it must be November, not the invoice's October. */
        const { data: entries } = await db
            .from("financial_journal_entries")
            .select("billing_period_key, effective_on")
            .eq("org_id", ORG)
            .eq("source_type", "charge")
            .eq("source_id", row.id);
        const keys = ((entries ?? []) as Array<{ billing_period_key: string | null }>).map((e) => e.billing_period_key);
        expect(keys.length, "the posting journalled").toBeGreaterThan(0);
        expect(new Set(keys)).toEqual(new Set(["2026-11"]));
    });

    it("B — created late on Nov 5: November, invoiced Nov 5, due Nov 5, posts now", async () => {
        const written = await writeTemplateDraftCharge(db, ORG, {
            templateId: TEMPLATE_POLICY,
            agreementId: CHILD(2).agreement,
            eventDate: "2026-11-05",
            today: "2026-11-05",
            actorUserId: ACTOR,
        });
        const row = await reread((written as { chargeId: string }).chargeId);
        expect((await periodOf(row.billing_period_id)).period_key).toBe("2026-11");
        expect(row.billable_on, "never Oct 25 — the charge did not exist then").toBe("2026-11-05");
        expect(row.due_date, "never Nov 1 — it was not invoiced until Nov 5").toBe("2026-11-05");
        expect(row.metadata.charge_dates).toMatchObject({
            invoice_intended: "2026-10-25",
            invoice_late: true,
            due_rule_date: "2026-11-01",
            due_clamped_to_invoice: true,
            created_on: "2026-11-05",
        });
        await postChildcareCharge(db, { orgId: ORG, chargeId: row.id, actorUserId: ACTOR, businessDateYmd: "2026-11-05" });
        expect((await reread(row.id)).status).toBe("posted");
    });

    it("C — invoice timing cannot move membership: a 'next cycle' template still bills November", async () => {
        const written = await writeTemplateDraftCharge(db, ORG, {
            templateId: TEMPLATE_NEXT_CYCLE,
            agreementId: CHILD(3).agreement,
            eventDate: "2026-11-05",
            today: "2026-10-08",
            actorUserId: ACTOR,
        });
        const row = await reread((written as { chargeId: string }).chargeId);
        expect((await periodOf(row.billing_period_id)).period_key, "W7-F004: was December").toBe("2026-11");
        expect(row.billable_on).toBe("2026-12-01");
        expect(row.metadata.charge_dates).toMatchObject({ invoice_rule: "next_period_start", invoice_rule_source: "template" });
    });

    it("D — generated tuition for November runs the same chain, and its auto-post waits for Nov 1", async () => {
        /* Exactly the call generation makes (consumptionService → writeTemplateDraftCharge). */
        const written = await writeTemplateDraftCharge(db, ORG, {
            templateId: TEMPLATE_TUITION,
            agreementId: CHILD(4).agreement,
            servicePeriodStart: "2026-11-01",
            eventDate: "2026-11-01",
            resolvedAmountCents: 4000,
            today: "2026-10-08",
            actorUserId: ACTOR,
        });
        expect(written.status).toBe("created");
        const row = await reread((written as { chargeId: string }).chargeId);
        expect((await periodOf(row.billing_period_id)).period_key).toBe("2026-11");
        expect(row.service_date).toBe("2026-11-01");
        expect(row.billable_on).toBe("2026-10-25");
        expect(row.due_date).toBe("2026-11-01");

        const policies = await listFinancialPolicies(db, ORG);
        const early = await autoPostGeneratedCharge(db, {
            orgId: ORG, chargeId: row.id, policies, today: "2026-10-08", businessDateYmd: "2026-10-08",
        });
        expect(early.kind).toBe("period_not_started");
        expect((await reread(row.id)).status).toBe("draft");

        const onTime = await autoPostGeneratedCharge(db, {
            orgId: ORG, chargeId: row.id, policies, today: "2026-11-01", businessDateYmd: "2026-11-01",
        });
        expect(onTime.kind).toBe("posted");
        expect((await reread(row.id)).status).toBe("posted");
    });
});
