import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { createChildcareCorrection, postChildcareCharge } from "@/lib/financials/childcareChargeService";
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
const P = `f8c0${RUN.slice(0, 4)}-0000-4000-8000-`;
const CUSTOMER = `${P}0000000c0001`;
const LOCATION = `${P}0000000b0001`;
const MEMBER = `${P}0000000d0001`;
const PERSON = `${P}0000000e0001`;
const AGREEMENT = `${P}0000000a0001`;
const TEMPLATE = `${P}000000010001`;

/*
 * W7-F008 — A POSTED CHARGE ALWAYS HAS ITS JOURNAL ENTRY.
 *
 * Posting flipped the charge to `posted`, then wrote its `charge_posted` journal entry in a separate,
 * best-effort call that swallowed every refusal. When the accounting calendar has no period covering
 * the charge's effective date, the attribution trigger refuses the entry — and the charge stayed
 * posted with no consequence in the journal. Posting and its journal entry are now one transaction:
 * a refused entry refuses the post, and the draft stays a draft.
 */
describeLive("W7-F008 — posting and its journal entry are one fact, live", () => {
    let db: SupabaseClient;
    const journalOf = async (chargeId: string) => {
        const { data } = await db
            .from("financial_journal_entries")
            .select("entry_type, effective_on, period_attribution, accounting_period_key")
            .eq("org_id", ORG).eq("source_type", "charge").eq("source_id", chargeId);
        return (data ?? []) as Array<Record<string, unknown>>;
    };
    const statusOf = async (id: string) =>
        ((await db.from("charges").select("status").eq("id", id).single()).data as { status: string }).status;

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: CUSTOMER, org_id: ORG, name: `F008 ${RUN}`, customer_type: "household" });
        await seed("locations", { id: LOCATION, org_id: ORG, customer_id: CUSTOMER, label: `F008 site ${RUN}`, location_type: "site", is_active: true });
        await seed("persons", { id: PERSON, org_id: ORG, first_name: "Journal", last_name: "F008" });
        await seed("customer_members", {
            id: MEMBER, org_id: ORG, customer_id: CUSTOMER, person_id: PERSON, display_name: "Journal F008", relationship: "child", is_active: true,
        });
        await seed("child_enrollment_agreements", {
            id: AGREEMENT, org_id: ORG, customer_id: CUSTOMER, customer_member_id: MEMBER, person_id: PERSON,
            site_location_id: LOCATION, status: "active", start_date: "2026-01-01",
        });
        await seed("financial_policies", {
            id: randomUUID(), org_id: ORG, scope_type: "customer", customer_id: CUSTOMER, location_id: null,
            policy_type: "billing_calendar", is_active: true, effective_start: "2026-01-01", effective_end: null,
            value: { cadence: "monthly", anchor_on: null },
        });
        await seed("financial_charge_templates", {
            id: TEMPLATE, org_id: ORG, template_key: `f008_fee_${RUN}`, label: "F008 fee", charge_category: "fee",
            trigger_type: "manual", amount_strategy: "fixed", amount_cents: 4000, currency_code: "USD",
            occurs_on_strategy: "event_date", billable_on_strategy: "immediate", billable_offset_days: null,
            review_required: false, is_active: true, effective_start: "2026-01-01",
        });
        await ensureAccountingPeriodCovers(db, ORG, "2026-10-05");
    });

    afterAll(async () => {
        await db.from("charges").delete().eq("org_id", ORG).eq("billable_source_id", AGREEMENT).eq("status", "draft");
        await db.from("financial_policies").delete().eq("org_id", ORG).eq("customer_id", CUSTOMER);
        await db.from("financial_charge_templates").delete().eq("id", TEMPLATE);
    });

    it("a charge the accounting calendar cannot attribute is refused, and stays a draft with no entry", async () => {
        /* The active calendar does not reach back to March 2026; the billing period has begun. */
        const { data: covering } = await db
            .from("financial_accounting_periods")
            .select("id, financial_accounting_calendars!inner(org_id, is_active)")
            .eq("financial_accounting_calendars.org_id", ORG)
            .eq("financial_accounting_calendars.is_active", true)
            .lte("starts_on", "2026-03-05").gte("ends_on", "2026-03-05");
        expect((covering ?? []).length, "precondition: no accounting period covers 2026-03-05").toBe(0);

        const written = await writeTemplateDraftCharge(db, ORG, {
            templateId: TEMPLATE, agreementId: AGREEMENT, eventDate: "2026-03-05", today: "2026-10-09", actorUserId: ACTOR,
        });
        const id = (written as { chargeId: string }).chargeId;
        expect(await statusOf(id)).toBe("draft");

        await expect(
            postChildcareCharge(db, { orgId: ORG, chargeId: id, actorUserId: ACTOR, businessDateYmd: "2026-10-09" }),
        ).rejects.toThrow(/accounting period/i);
        expect(await statusOf(id), "a refused journal entry refuses the post").toBe("draft");
        expect(await journalOf(id)).toEqual([]);
    });

    it("an attributable charge posts and journals together", async () => {
        const written = await writeTemplateDraftCharge(db, ORG, {
            templateId: TEMPLATE, agreementId: AGREEMENT, eventDate: "2026-10-05", today: "2026-10-09", actorUserId: ACTOR,
        });
        const id = (written as { chargeId: string }).chargeId;
        const result = await postChildcareCharge(db, { orgId: ORG, chargeId: id, actorUserId: ACTOR, businessDateYmd: "2026-10-09" });
        expect(result.alreadyPosted).toBe(false);
        expect(await statusOf(id)).toBe("posted");
        const entries = await journalOf(id);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ entry_type: "charge_posted", effective_on: "2026-10-05", period_attribution: "attributed" });

        /* A repeat post converges on the one entry. */
        const again = await postChildcareCharge(db, { orgId: ORG, chargeId: id, actorUserId: ACTOR, businessDateYmd: "2026-10-09" });
        expect(again.alreadyPosted).toBe(true);
        expect(await journalOf(id)).toHaveLength(1);

        /* A correction is written with its own entry, in the same transaction, linked to the original. */
        const reversal = await createChildcareCorrection(db, { orgId: ORG, sourceChargeId: id, kind: "reversal", actorUserId: ACTOR });
        expect(reversal.status).toBe("posted");
        const { data: corrected } = await db
            .from("financial_journal_entries")
            .select("entry_type, source_id, reverses_entry_id, obligation_delta_cents")
            .eq("org_id", ORG).eq("source_type", "charge").eq("source_id", reversal.id);
        expect(corrected).toHaveLength(1);
        expect(corrected![0]).toMatchObject({ entry_type: "charge_corrected", obligation_delta_cents: -4000 });
        expect(corrected![0].reverses_entry_id).not.toBeNull();
    });
});
