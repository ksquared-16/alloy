/**
 * CATALOG ADD CHARGE, LIVE — against a real Postgres, in an ISOLATED certification environment ONLY.
 *
 * The unit suites prove the rule over a mock client. This proves the same contract where the
 * database decides: the charge row, its period binding, the posting RPC and its journal entry, the
 * resolution-key uniqueness index, and the charge → `gl_account_mappings` → `gl_accounts` chain.
 *
 * ── IT REFUSES TO RUN ANYWHERE SHARED ──
 *
 * The other live suites fall back to `web/.env.certification.local`, which is the SHARED local
 * `alloy-cert` stack. This one does not: it runs only when the caller names an isolated
 * environment explicitly (`CATALOG_LIVE_ISOLATED=1` + `CERT_SUPABASE_URL` + `CERT_SERVICE_ROLE_KEY`
 * + `CERT_FIXTURE_ORG_ID`, as `test:qa:financials-isolated` hands them over from the executor's verified
 * binding), never on the shared stack's port, never on a hosted
 * project. It POSTS a charge, and posted money is immutable — which is only acceptable in an
 * environment that is retired afterwards.
 */
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGlAccountForMappingKey } from "@/lib/financials/accounting/resolveGlMapping";
import { loadCatalogChargeOptions } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { previewTemplateCharge, writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import { ensureAccountingPeriodCovers } from "./certEnvironment";

/** The shared local stack's API port — never an isolated environment. */
const SHARED_CERT_PORT = "54421";

function isolatedEnv(): { url: string; serviceKey: string; orgId: string } | null {
    if (process.env.CATALOG_LIVE_ISOLATED !== "1") return null;
    const url = (process.env.CERT_SUPABASE_URL ?? "").trim();
    const serviceKey = (process.env.CERT_SERVICE_ROLE_KEY ?? "").trim();
    /* The organization is the executor's bound seed org (verified by the runner), never a constant here. */
    const orgId = (process.env.CERT_FIXTURE_ORG_ID ?? "").trim();
    if (!url || !serviceKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orgId)) return null;
    const u = new URL(url);
    const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (!loopback || u.port === SHARED_CERT_PORT) {
        throw new Error(`catalog live suite refuses ${u.hostname}:${u.port} — isolated loopback certification environments only`);
    }
    return { url, serviceKey, orgId };
}

const env = isolatedEnv();
const describeLive = env ? describe : describe.skip;

const ORG = env?.orgId ?? "";
const RUN = randomUUID().slice(0, 8);
const P = `ca7a${RUN.slice(0, 4)}-0000-4000-8000-`;
const CUSTOMER = `${P}0000000c0001`;
const SITE = `${P}0000000b0001`;
const OTHER_SITE = `${P}0000000b0002`;
const CHILD = { member: `${P}0000000d0001`, person: `${P}0000000e0001`, agreement: `${P}0000000a0001` };
const ACCOUNT = { fee: `${P}000000f00001`, fallback: `${P}000000f00002`, orphan: `${P}000000f00003` };
const MAPPING_KEY = `catalog_live_${RUN}`;
const RC = { mapped: `${P}000000e10001`, unmapped: `${P}000000e10002`, orphan: `${P}000000e10003` };
const PRODUCT = {
    fee: `${P}000000d10001`,
    sameName: `${P}000000d10002`,
    unmapped: `${P}000000d10003`,
    orphan: `${P}000000d10004`,
    annual: `${P}000000d10005`,
    otherSite: `${P}000000d10006`,
};
const TEMPLATE = `${P}000000010001`;
const TODAY = "2026-11-05";
const ENROLLED = { agreementId: CHILD.agreement, billableSource: { type: "enrollment_agreement" as const, id: CHILD.agreement } };

describeLive("catalog Add Charge — live, isolated", () => {
    let db: SupabaseClient;

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: CUSTOMER, org_id: ORG, name: `Catalog live ${RUN}`, customer_type: "household" });
        for (const [id, label] of [[SITE, "site"], [OTHER_SITE, "other site"]] as const) {
            await seed("locations", { id, org_id: ORG, customer_id: CUSTOMER, label: `Catalog ${label} ${RUN}`, location_type: "site", is_active: true });
        }
        await seed("persons", { id: CHILD.person, org_id: ORG, first_name: "Cat", last_name: `Live${RUN}` });
        await seed("customer_members", {
            id: CHILD.member, org_id: ORG, customer_id: CUSTOMER, person_id: CHILD.person,
            display_name: `Cat Live${RUN}`, relationship: "child", is_active: true,
        });
        await seed("child_enrollment_agreements", {
            id: CHILD.agreement, org_id: ORG, customer_id: CUSTOMER, customer_member_id: CHILD.member, person_id: CHILD.person,
            site_location_id: SITE, status: "active", start_date: "2026-01-01",
        });
        const rule = (policy_type: string, value: Record<string, unknown>) =>
            seed("financial_policies", {
                id: randomUUID(), org_id: ORG, scope_type: "customer", customer_id: CUSTOMER, location_id: null,
                policy_type, is_active: true, effective_start: "2026-01-01", effective_end: null, value,
            });
        await rule("billing_calendar", { cadence: "monthly", anchor_on: null });
        await rule("posting_review", { required: false });

        for (const [id, code] of [[ACCOUNT.fee, "4710"], [ACCOUNT.fallback, "4711"], [ACCOUNT.orphan, "4712"]] as const) {
            await seed("gl_accounts", { id, org_id: ORG, code: `${code}-${RUN}`, name: `Catalog live ${code}`, type: "revenue", currency: "USD", is_active: true });
        }
        await seed("gl_account_mappings", { id: randomUUID(), org_id: ORG, key: MAPPING_KEY, gl_account_id: ACCOUNT.fee, is_active: true });
        for (const [id, label, gl] of [[RC.mapped, "mapped", ACCOUNT.fee], [RC.unmapped, "unmapped", null], [RC.orphan, "orphan", ACCOUNT.orphan]] as const) {
            await seed("commercial_revenue_categories", { id, org_id: ORG, label: `Catalog live ${label} ${RUN}`, mapped_gl_account_id: gl, is_active: true });
        }
        const product = (id: string, over: Record<string, unknown>) =>
            seed("commercial_products", {
                id, org_id: ORG, location_id: null, program_key: null, name: `Catalog live fee ${RUN}`, commercial_type: "fee",
                amount_cents: 4200, cadence_key: null, revenue_category_id: RC.mapped, behavior: {}, is_active: true, ...over,
            });
        await product(PRODUCT.fee, {});
        await product(PRODUCT.sameName, { amount_cents: 5300 });
        await product(PRODUCT.unmapped, { revenue_category_id: RC.unmapped });
        await product(PRODUCT.orphan, { revenue_category_id: RC.orphan });
        await product(PRODUCT.annual, { cadence_key: "annual" });
        await product(PRODUCT.otherSite, { location_id: OTHER_SITE });
        /* A template with the SAME name as the catalog items — the historical-identity hazard. */
        await seed("financial_charge_templates", {
            id: TEMPLATE, org_id: ORG, template_key: `catalog_live_tpl_${RUN}`, label: `Catalog live fee ${RUN}`,
            charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: 1100, currency_code: "USD",
            occurs_on_strategy: "now", billable_on_strategy: "immediate", review_required: false, is_active: true,
            effective_start: "2026-01-01",
        });
        await ensureAccountingPeriodCovers(db, ORG, TODAY);
    });

    afterAll(async () => {
        /* Drafts and configuration are removed; a POSTED charge cannot be (immutable) — the environment is retired. */
        await db?.from("charges").delete().eq("org_id", ORG).eq("billable_source_id", CHILD.agreement).eq("status", "draft");
        await db?.from("commercial_products").delete().in("id", Object.values(PRODUCT));
        await db?.from("financial_charge_templates").delete().eq("id", TEMPLATE);
    });

    it("lists the catalog by the shared rule: one-time fees offerable, others listed with reasons", async () => {
        const opts = await loadCatalogChargeOptions(db, ORG, { asOf: TODAY, locationIds: [null, SITE] });
        const by = new Map(opts.map((o) => [o.id, o]));
        expect(by.get(PRODUCT.fee)?.availability).toBe("offerable");
        expect(by.get(PRODUCT.sameName)?.availability).toBe("offerable");
        expect(by.get(PRODUCT.unmapped)?.availability).toBe("blocked");
        expect(by.get(PRODUCT.orphan)?.availability).toBe("blocked");
        expect(by.get(PRODUCT.annual)?.availability).toBe("unsupported");
        expect(by.has(PRODUCT.otherSite)).toBe(false);
    });

    it("previews and writes the same catalog charge, posts it, journals it once, to the catalog's own account", async () => {
        const args = { templateId: "", catalogProductId: PRODUCT.fee, ...ENROLLED, today: TODAY };
        const preview = await previewTemplateCharge(db, ORG, args);
        expect(preview.intent).toMatchObject({ eligible: true, amountCents: 4200, glMappingKey: MAPPING_KEY });
        const written = await writeTemplateDraftCharge(db, ORG, args);
        expect(written.status).toBe("created");
        if (written.status !== "created") return;
        const { data: row } = await db.from("charges").select("*").eq("id", written.chargeId).single();
        expect(row).toMatchObject({ amount_cents: 4200, charge_template_id: null, charge_category: "fee", billable_on: preview.intent.billableOn });
        expect(row.metadata).toMatchObject({ source: "commercial_catalog", gl_mapping_key: MAPPING_KEY });
        expect(row.metadata.catalog_item).toMatchObject({ product_id: PRODUCT.fee, gl_account_id: ACCOUNT.fee });

        const again = await writeTemplateDraftCharge(db, ORG, args);
        expect(again.status).toBe("unchanged");

        const posted = await postChildcareCharge(db, { orgId: ORG, chargeId: written.chargeId, businessDateYmd: TODAY });
        expect(posted.charge.status).toBe("posted");
        expect(["recorded", "already_recorded"]).toContain(posted.journal.status);

        const [{ data: maps }, { data: accounts }] = await Promise.all([
            db.from("gl_account_mappings").select("*").eq("org_id", ORG),
            db.from("gl_accounts").select("*").eq("org_id", ORG),
        ]);
        expect(resolveGlAccountForMappingKey(MAPPING_KEY, maps as GlAccountMappingRow[], accounts as GlAccountRow[])?.id).toBe(ACCOUNT.fee);
    });

    it.each([
        [PRODUCT.unmapped, /not mapped to a GL account/],
        [PRODUCT.orphan, /No posting mapping uses GL account/],
        [PRODUCT.annual, /recurring Catalog item/],
        [PRODUCT.otherSite, /different location/],
    ])("refuses %s on preview and write, writing nothing", async (id, reason) => {
        const args = { templateId: "", catalogProductId: id, ...ENROLLED, today: TODAY };
        const preview = await previewTemplateCharge(db, ORG, args);
        expect(preview.intent.reason).toMatch(reason);
        const before = await db.from("charges").select("id", { count: "exact", head: true }).eq("billable_source_id", CHILD.agreement);
        expect((await writeTemplateDraftCharge(db, ORG, args)).status).toBe("not_writable");
        const after = await db.from("charges").select("id", { count: "exact", head: true }).eq("billable_source_id", CHILD.agreement);
        expect(after.count).toBe(before.count);
    });

    it("two same-name catalog items are two charges at two prices; the same-name template stays a template", async () => {
        const sameName = await writeTemplateDraftCharge(db, ORG, { templateId: "", catalogProductId: PRODUCT.sameName, ...ENROLLED, today: TODAY });
        const template = await writeTemplateDraftCharge(db, ORG, { templateId: TEMPLATE, ...ENROLLED, today: TODAY });
        expect(sameName.status).toBe("created");
        expect(template.status).toBe("created");
        if (sameName.status !== "created" || template.status !== "created") return;
        const { data: rows } = await db.from("charges").select("id, amount_cents, charge_template_id, metadata").in("id", [sameName.chargeId, template.chargeId]);
        const byId = new Map((rows ?? []).map((r) => [r.id, r]));
        expect(byId.get(sameName.chargeId)).toMatchObject({ amount_cents: 5300, charge_template_id: null });
        expect(byId.get(template.chargeId)).toMatchObject({ amount_cents: 1100, charge_template_id: TEMPLATE });
        expect(byId.get(template.chargeId)!.metadata.catalog_item).toBeUndefined();
    });
});
