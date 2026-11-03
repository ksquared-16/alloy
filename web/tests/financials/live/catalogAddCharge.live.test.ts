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
 * project. It POSTS charges, and posted money is immutable — which is only acceptable in an
 * environment that is retired afterwards.
 *
 * ── AUTHORITY BEFORE ITS CLIENT ──
 *
 * With `CATALOG_LIVE_ISOLATED=1` the suite re-verifies the executor's v2 operation authority itself
 * (financialsFixtureAuthority.mjs, program `financials_isolated_tests`, operation `run`) before any
 * client exists, and takes its target and organization from that verdict: `CERT_SUPABASE_URL` must BE the
 * record's API identity and `CERT_FIXTURE_ORG_ID` the verified org, or it throws. Immediately before
 * `createClient`, the exact configuration (DATABASE_URL, this environment, that origin) is attested again
 * and the client is built from the frozen copy. A refusal is a failure, never a skip. Without the flag it
 * skips, and the runner reports a skip as NOT a pass.
 *
 * ── WHAT IT LEAVES, MEASURED ──
 *
 * Every row it owns is named by a fixed per-run id (`ca7a<4 hex>-0000-4000-8000-…`) or hangs off one
 * of its own agreements — counted by that exact identity, in the bound org, before the first write
 * and after its own cleanup, and written with the retained posted charges and their journal entries
 * to `FIN_ISOLATED_PROOF_FILE` (financialsIsolatedProof.mjs is the contract the runner holds it to).
 * The cleanup deletes only drafts on its own agreements, its own products and its own template — by
 * id, never by name or org-wide. Posted charges and journal entries stay; their disposition is the
 * environment's retirement.
 */
import { randomUUID } from "node:crypto";

import { writeFileSync } from "node:fs";
import { basename } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { __testables as chargeActions } from "@/lib/adminV2/actions/definitions/financialChargeActions";
import { resolveGlAccountForMappingKey } from "@/lib/financials/accounting/resolveGlMapping";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { loadCatalogChargeOptions } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { previewTemplateCharge, writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import { ensureAccountingPeriodCovers } from "./certEnvironment";
import { FINANCIALS_ISOLATED_PROGRAM, runAttestedFinancialsConnection, verifyFinancialsFixtureAuthority } from "../../../scripts/qa/financialsFixtureAuthority.mjs";
import { CATALOG_PROOF_FILE_NAME, CATALOG_PROOF_SCHEMA, OWNED_TABLES } from "../../../scripts/qa/financialsIsolatedProof.mjs";

/** The shared local stack's API port — never an isolated environment. */
const SHARED_CERT_PORT = "54421";

function isolatedEnv(): { url: string; serviceKey: string; orgId: string; proofFile: string | null } | null {
    if (process.env.CATALOG_LIVE_ISOLATED !== "1") return null;
    /* Authority v2 before anything else: no client, no credential use, for an unverified execution. */
    const url = (process.env.CERT_SUPABASE_URL ?? "").trim();
    const auth = verifyFinancialsFixtureAuthority(process.env, {
        program: FINANCIALS_ISOLATED_PROGRAM, operation: "run",
        connection: { url: process.env.DATABASE_URL, clientEnv: process.env, apiOrigin: url },
    });
    if (!auth.ok) throw new Error(`catalog live suite refuses: ${auth.code}`);
    /* The organization and target are the executor's verified ones, never a constant here. */
    const orgId = (process.env.CERT_FIXTURE_ORG_ID ?? "").trim();
    if (url !== auth.authority.api_url || orgId !== auth.authority.org_id) throw new Error("catalog live suite refuses: target_or_org_not_the_verified_one");
    const serviceKey = (process.env.CERT_SERVICE_ROLE_KEY ?? "").trim();
    if (!serviceKey) throw new Error("catalog live suite refuses: credential_absent");
    const u = new URL(url);
    if (u.hostname !== "127.0.0.1" || u.port === SHARED_CERT_PORT) {
        throw new Error("catalog live suite refuses: isolated loopback certification environments only");
    }
    const proof = (process.env.FIN_ISOLATED_PROOF_FILE ?? "").trim();
    const proofFile = proof.startsWith("/") && basename(proof) === CATALOG_PROOF_FILE_NAME ? proof : null;
    return { url, serviceKey, orgId, proofFile };
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
/* A sibling in the same household: the multi-child (bulk) command charges both children. */
const SIBLING = { member: `${P}0000000d0002`, person: `${P}0000000e0002`, agreement: `${P}0000000a0002` };
const AGREEMENTS = [CHILD.agreement, SIBLING.agreement];
const ACCOUNT = { fee: `${P}000000f00001`, fallback: `${P}000000f00002`, orphan: `${P}000000f00003` };
const POLICY = { calendar: `${P}000000f10001`, review: `${P}000000f10002` };
const MAPPING_ID = `${P}000000f20001`;
const MAPPING_KEY = `catalog_live_${RUN}`;
const RC = { mapped: `${P}000000e10001`, unmapped: `${P}000000e10002`, orphan: `${P}000000e10003` };
const PRODUCT = {
    fee: `${P}000000d10001`,
    sameName: `${P}000000d10002`,
    unmapped: `${P}000000d10003`,
    orphan: `${P}000000d10004`,
    annual: `${P}000000d10005`,
    otherSite: `${P}000000d10006`,
    /* A one-time fee charged through the multi-child command. */
    bulkFee: `${P}000000d10007`,
};
const TEMPLATE = `${P}000000010001`;
const TODAY = "2026-11-05";
const ENROLLED = { agreementId: CHILD.agreement, billableSource: { type: "enrollment_agreement" as const, id: CHILD.agreement } };

/** Every owned row, counted by exact identity in the bound org — never by name, prefix scan or org-wide. */
async function countOwned(db: SupabaseClient): Promise<Record<string, number>> {
    const exact = async (table: string, column: string, ids: string[], status?: "draft" | "nondraft") => {
        if (!ids.length) return 0;
        const base = db.from(table).select("id", { count: "exact", head: true }).eq("org_id", ORG).in(column, ids);
        const q = status === "draft" ? base.eq("status", "draft") : status === "nondraft" ? base.neq("status", "draft") : base;
        const { count, error } = await q;
        if (error) throw new Error(`owned_count_failed table=${table}`);
        return count ?? 0;
    };
    const { data: charges, error } = await db.from("charges").select("id").eq("org_id", ORG).in("billable_source_id", AGREEMENTS);
    if (error) throw new Error("owned_count_failed table=charges");
    const chargeIds = (charges ?? []).map((c: { id: string }) => c.id);
    const counts: Record<string, number> = {
        customers: await exact("customers", "id", [CUSTOMER]),
        locations: await exact("locations", "id", [SITE, OTHER_SITE]),
        persons: await exact("persons", "id", [CHILD.person, SIBLING.person]),
        customer_members: await exact("customer_members", "id", [CHILD.member, SIBLING.member]),
        child_enrollment_agreements: await exact("child_enrollment_agreements", "id", AGREEMENTS),
        financial_policies: await exact("financial_policies", "id", Object.values(POLICY)),
        gl_accounts: await exact("gl_accounts", "id", Object.values(ACCOUNT)),
        gl_account_mappings: await exact("gl_account_mappings", "id", [MAPPING_ID]),
        commercial_revenue_categories: await exact("commercial_revenue_categories", "id", Object.values(RC)),
        commercial_products: await exact("commercial_products", "id", Object.values(PRODUCT)),
        financial_charge_templates: await exact("financial_charge_templates", "id", [TEMPLATE]),
        charges_draft: await exact("charges", "billable_source_id", AGREEMENTS, "draft"),
        charges_nondraft: await exact("charges", "billable_source_id", AGREEMENTS, "nondraft"),
        financial_journal_entries: await exact("financial_journal_entries", "source_id", chargeIds),
    };
    if (Object.keys(counts).join() !== OWNED_TABLES.join()) throw new Error("owned_tables_drift");
    return counts;
}

/**
 * The run's own customer's commercial periods, by exact identity (its customer id, in the bound org). Never deleted:
 * posted charges are bound to them; they are retained with the environment and reported for the proof.
 */
async function measureBillingPeriods(db: SupabaseClient): Promise<Array<{ id: string; period_key: string; status: string }>> {
    const { data, error } = await db.from("financial_billing_periods").select("id, period_key, status").eq("org_id", ORG).eq("customer_id", CUSTOMER);
    if (error) throw new Error("billing_period_census_failed table=financial_billing_periods");
    return (data ?? [])
        .map((p: { id: string; period_key: string; status: string }) => ({ id: String(p.id), period_key: String(p.period_key), status: String(p.status) }))
        .sort((a, b) => a.period_key.localeCompare(b.period_key));
}

/** The posted charges this run leaves, each with its one journal entry (measured, not remembered). */
async function measureRetained(db: SupabaseClient): Promise<Array<{ charge_id: string; journal_entry_id: string }>> {
    const { data: posted, error } = await db.from("charges").select("id").eq("org_id", ORG).in("billable_source_id", AGREEMENTS).neq("status", "draft");
    if (error) throw new Error("retained_read_failed table=charges");
    const ids = (posted ?? []).map((c: { id: string }) => c.id).sort();
    if (!ids.length) return [];
    const { data: entries, error: jErr } = await db.from("financial_journal_entries").select("id, source_id").eq("org_id", ORG).in("source_id", ids);
    if (jErr) throw new Error("retained_read_failed table=financial_journal_entries");
    return ids.flatMap((id) => {
        const mine = (entries ?? []).filter((e: { source_id: string }) => e.source_id === id);
        return mine.length === 1 ? [{ charge_id: id, journal_entry_id: String((mine[0] as { id: string }).id) }] : [];
    });
}

describeLive("catalog Add Charge — live, isolated", () => {
    let db: SupabaseClient;
    let ownedBefore: Record<string, number> | null = null;
    let billingPeriodsBefore: number | null = null;
    let accountingPeriodCreated = false;

    beforeAll(async () => {
        /* The gate, immediately before the client: this exact configuration, frozen and attested. */
        const gated = await runAttestedFinancialsConnection(process.env, {
            program: FINANCIALS_ISOLATED_PROGRAM, operation: "run",
            url: process.env.DATABASE_URL, clientEnv: process.env, apiOrigin: env!.url,
            connect: (c) => createClient(String(c.apiOrigin), env!.serviceKey, { auth: { persistSession: false } }),
        });
        if (!gated.ok || !("result" in gated)) throw new Error(`catalog live suite refuses: ${gated.code}`);
        db = gated.result;
        /* Before the first write: a fresh run owns nothing. */
        ownedBefore = await countOwned(db);
        billingPeriodsBefore = (await measureBillingPeriods(db)).length;
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: CUSTOMER, org_id: ORG, name: `Catalog live ${RUN}`, customer_type: "household" });
        for (const [id, label] of [[SITE, "site"], [OTHER_SITE, "other site"]] as const) {
            await seed("locations", { id, org_id: ORG, customer_id: CUSTOMER, label: `Catalog ${label} ${RUN}`, location_type: "site", is_active: true });
        }
        for (const [kid, first] of [[CHILD, "Cat"], [SIBLING, "Sib"]] as const) {
            await seed("persons", { id: kid.person, org_id: ORG, first_name: first, last_name: `Live${RUN}` });
            await seed("customer_members", {
                id: kid.member, org_id: ORG, customer_id: CUSTOMER, person_id: kid.person,
                display_name: `${first} Live${RUN}`, relationship: "child", is_active: true,
            });
            await seed("child_enrollment_agreements", {
                id: kid.agreement, org_id: ORG, customer_id: CUSTOMER, customer_member_id: kid.member, person_id: kid.person,
                site_location_id: SITE, status: "active", start_date: "2026-01-01",
            });
        }
        const rule = (id: string, policy_type: string, value: Record<string, unknown>) =>
            seed("financial_policies", {
                id, org_id: ORG, scope_type: "customer", customer_id: CUSTOMER, location_id: null,
                policy_type, is_active: true, effective_start: "2026-01-01", effective_end: null, value,
            });
        await rule(POLICY.calendar, "billing_calendar", { cadence: "monthly", anchor_on: null });
        await rule(POLICY.review, "posting_review", { required: false });

        for (const [id, code] of [[ACCOUNT.fee, "4710"], [ACCOUNT.fallback, "4711"], [ACCOUNT.orphan, "4712"]] as const) {
            await seed("gl_accounts", { id, org_id: ORG, code: `${code}-${RUN}`, name: `Catalog live ${code}`, type: "revenue", currency: "USD", is_active: true });
        }
        await seed("gl_account_mappings", { id: MAPPING_ID, org_id: ORG, key: MAPPING_KEY, gl_account_id: ACCOUNT.fee, is_active: true });
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
        await product(PRODUCT.bulkFee, { name: `Catalog live bulk fee ${RUN}`, amount_cents: 3100 });
        /* A template with the SAME name as the catalog items — the historical-identity hazard. */
        await seed("financial_charge_templates", {
            id: TEMPLATE, org_id: ORG, template_key: `catalog_live_tpl_${RUN}`, label: `Catalog live fee ${RUN}`,
            charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: 1100, currency_code: "USD",
            occurs_on_strategy: "now", billable_on_strategy: "immediate", review_required: false, is_active: true,
            effective_start: "2026-01-01",
        });
        accountingPeriodCreated = (await ensureAccountingPeriodCovers(db, ORG, TODAY))?.created === true;
    });

    afterAll(async () => {
        if (!db) return;
        /*
         * Drafts on this run's own agreements, its own products and its own template — by id, never by
         * name or org-wide. POSTED charges and their journal entries cannot be removed (immutable) and are
         * not: they are measured below and retained until the environment is retired.
         */
        await db.from("charges").delete().eq("org_id", ORG).in("billable_source_id", AGREEMENTS).eq("status", "draft");
        await db.from("commercial_products").delete().eq("org_id", ORG).in("id", Object.values(PRODUCT));
        await db.from("financial_charge_templates").delete().eq("org_id", ORG).eq("id", TEMPLATE);
        if (!env?.proofFile || !ownedBefore || billingPeriodsBefore === null) return;
        const report = {
            schema: CATALOG_PROOF_SCHEMA,
            run_prefix: P.slice(0, 8),
            owned_before: ownedBefore,
            owned_after: await countOwned(db),
            retained: await measureRetained(db),
            billing_periods: { before: billingPeriodsBefore, after: await measureBillingPeriods(db) },
            accounting_period_created: accountingPeriodCreated,
        };
        writeFileSync(env.proofFile, `${JSON.stringify(report)}\n`, { mode: 0o600 });
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
        [PRODUCT.orphan, /is not set up for posting yet/],
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

    /*
     * THE OPERATOR COMMAND, LIVE. `charge.add` for a multi-child selection is `executeMultiChildAdd`: a loop over
     * the same two canonical writers (`writeTemplateDraftCharge`, then `postChildcareCharge` where no review
     * boundary applies) — the bulk Add path. It runs at the org's own business date, so the posting gate decides
     * exactly as it does for an operator.
     */
    const subjects = () => [CHILD, SIBLING].map((kid) => ({
        childId: kid.member,
        subject: { ok: true as const, kind: "enrollment_agreement" as const, agreementId: kid.agreement, customerMemberId: kid.member },
    }));
    const command = async (catalogProductId: string, today: string) => chargeActions.executeMultiChildAdd({
        supabase: db,
        ctx: { orgId: ORG, userId: null },
        invocation: { entityType: "child", entityId: CHILD.member },
        payload: { catalog_product_id: catalogProductId, today },
        subjects: subjects() as never,
        correlationId: `catalog-live-${RUN}`,
    });

    it("charge.add for two children: one catalog fee each at the catalog price, posted and journaled once; a retry converges", async () => {
        const businessDate = await fetchOrgBusinessDate(db, ORG);
        accountingPeriodCreated = (await ensureAccountingPeriodCovers(db, ORG, businessDate))?.created === true || accountingPeriodCreated;
        const res = await command(PRODUCT.bulkFee, businessDate);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const detail = res.result.detail as { charges_created: number; charges_failed: number; per_child: Array<{ charge_id: string; posted: boolean; write_status: string }> };
        expect(detail).toMatchObject({ charges_created: 2, charges_failed: 0 });
        expect(detail.per_child.every((c) => c.posted && c.write_status === "created")).toBe(true);
        const ids = detail.per_child.map((c) => c.charge_id);
        const { data: rows } = await db.from("charges").select("id, amount_cents, status, billable_source_id, charge_template_id, metadata").in("id", ids);
        expect((rows ?? []).map((r) => r.billable_source_id).sort()).toEqual([...AGREEMENTS].sort());
        for (const r of rows ?? []) {
            expect(r).toMatchObject({ amount_cents: 3100, charge_template_id: null });
            expect(r.status).not.toBe("draft");
            expect(r.metadata).toMatchObject({ source: "commercial_catalog", gl_mapping_key: MAPPING_KEY });
            expect(r.metadata.catalog_item).toMatchObject({ product_id: PRODUCT.bulkFee, gl_account_id: ACCOUNT.fee });
        }
        const { count: journals } = await db.from("financial_journal_entries").select("id", { count: "exact", head: true }).in("source_id", ids);
        expect(journals).toBe(2);

        const again = await command(PRODUCT.bulkFee, businessDate);
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        const retry = again.result.detail as { per_child: Array<{ charge_id: string; posted: boolean }> };
        expect(retry.per_child.map((c) => c.charge_id).sort()).toEqual([...ids].sort());
        const { count: after } = await db.from("charges").select("id", { count: "exact", head: true }).eq("org_id", ORG).in("billable_source_id", AGREEMENTS).eq("metadata->catalog_item->>product_id", PRODUCT.bulkFee);
        expect(after).toBe(2);
    });

    it("charge.add for two children with an item for another site: refused for every child, nothing written", async () => {
        const businessDate = await fetchOrgBusinessDate(db, ORG);
        const count = async () => (await db.from("charges").select("id", { count: "exact", head: true }).eq("org_id", ORG).in("billable_source_id", AGREEMENTS)).count;
        const before = await count();
        const res = await command(PRODUCT.otherSite, businessDate);
        expect(res.ok).toBe(false);
        expect(await count()).toBe(before);
    });
});
