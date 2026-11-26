/**
 * ASSIGNMENT → TUITION, AGAINST THE REAL DATABASE.
 *
 * Everything Thread 3 claims is claimed about persistence, authority and history, and none of those
 * can be proved against a mock. A mock is what let two readers select columns the database dropped
 * in July and stay green for two months, and a mock would happily accept a stale resolution, an
 * unauthorized override, or a second identical term.
 *
 * So these run against the certification stack (`alloy-cert`) over commercial configuration this
 * file authors and an assignment the representative seed already produced. The sequence is the
 * one the thread has to answer:
 *
 *   A  a proposed assignment with NO enrollment agreement resolves tuition
 *   B  the recommendation is deterministic, and carries its inputs, version and explanation
 *   C  a changed canonical fact changes the recommendation
 *   D  two equal candidates report ambiguity; nothing is silently selected
 *   E  no applicable option is an explicit no-match
 *   F  inactive / future / expired / not-offered are each excluded, and told apart
 *   G  acceptance persists
 *   H  a fresh read returns identical accepted truth
 *   I  a pre-change resolution cannot be accepted after the assignment changes
 *   J  a retry creates no second term
 *   K  editing the catalog does not rewrite an accepted term
 *   L  an effective-dated successor supersedes without destroying its predecessor
 *   M  an unauthorized override fails
 *   N  an authorized override with no reason fails
 *   O  an authorized override preserves recommendation, selection, reason, actor and time
 *   P  the term learns its agreement once, and cannot be re-pointed
 *   Q  the downstream payload is readable, complete, and creates no charge
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeCommercialExport } from "@/lib/commercial/execution/export/composeCommercialExport";
import { resolveAssignmentPricingOptions } from "@/lib/commercial/execution/evaluate/resolveOptions";
import { readAssignmentPricingFacts } from "@/lib/enrollment/pricing/assignmentPricingFacts";
import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import {
    acceptEnrollmentPricingTerm,
    linkPricingTermsToAgreement,
    overrideEnrollmentPricingTerm,
    readAcceptedPricingTerms,
} from "@/lib/enrollment/pricing/enrollmentPricingTermsService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
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
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const GRANTED = ["enrollment.pricing.override"];
const UNGRANTED: string[] = [];

/** Fixture ids, all under one prefix so teardown is exact. */
const P = "ee3c0000-0000-4000-8000-";
const OFFER_FULL = `${P}000000000001`;
const OFFER_PART = `${P}000000000002`;
const VAR_5DAY = `${P}00000000000a`;
const VAR_3DAY = `${P}00000000000b`;
/**
 * The TRANSPARENT DEFAULT variant — no quantity, so it applies whatever the schedule is.
 *
 * This is what makes a genuine tie reachable. Two variants with the SAME quantity cannot both
 * exist: `program_offering_variants_unique` is on (org, offering, quantity_type, quantity_value)
 * with NULLS NOT DISTINCT, so the schema already rules that shape out. An offering priced both
 * per-days and with a flat default is ordinary configuration, and both apply equally.
 */
const VAR_DEFAULT = `${P}00000000000c`;
const VAR_PART_5 = `${P}00000000000d`;
const RATE_MONTHLY = `${P}0000000000f1`;
const RATE_WEEKLY = `${P}0000000000f2`;
const RATE_TWIN = `${P}0000000000f3`;
const RATE_3DAY = `${P}0000000000f4`;
const RATE_FUTURE = `${P}0000000000f5`;
const RATE_EXPIRED = `${P}0000000000f6`;
const RATE_NOT_OFFERED = `${P}0000000000f7`;
const RATE_PART = `${P}0000000000f8`;
const AGREEMENT = `${P}0000000000e1`;
/** A fixture PROGRAM, so the seeded catalog never applies to the assignment under test. */
const CATEGORY = `${P}0000000000c1`;
const PROGRAM_KEY = "cert_thread3_program";

/*
 * Teardown addresses rows by ID, never by a `like` on the uuid column: PostgREST answers
 * `operator does not exist: uuid ~~ unknown` for that, and the error is easy to swallow — which is
 * exactly what left a previous run's catalog standing and made the next one fail on a primary key.
 */
const ALL_RATES = [RATE_MONTHLY, RATE_WEEKLY, RATE_TWIN, RATE_3DAY, RATE_FUTURE, RATE_EXPIRED, RATE_NOT_OFFERED, RATE_PART];
const ALL_VARIANTS = [VAR_5DAY, VAR_3DAY, VAR_DEFAULT, VAR_PART_5];
const ALL_OFFERINGS = [OFFER_FULL, OFFER_PART];

const TODAY = new Date().toISOString().slice(0, 10);

describeLive("assignment → tuition, live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /** The representative assignment this run operates on, and the facts around it. */
    let ocmId = "";
    let customerMemberId = "";
    let programCategoryId = "";
    let programKey = "";
    let locationId: string | null = null;
    let scheduleType = "";

    /** The assignment's original program, restored on the way out. */
    let originalProgramCategoryId: string | null = null;

    async function cleanup() {
        if (ocmId) {
            await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG).eq("opportunity_customer_member_id", ocmId);
            await supabase
                .from("opportunity_customer_members")
                .update({ program_category_id: originalProgramCategoryId })
                .eq("id", ocmId);
        }
        await supabase.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
        await supabase.from("commercial_tuition_rates").delete().in("id", ALL_RATES);
        await supabase.from("program_offering_variants").delete().in("id", ALL_VARIANTS);
        await supabase.from("program_offerings").delete().in("id", ALL_OFFERINGS);
        await supabase.from("location_program_categories").delete().eq("id", CATEGORY);
    }

    /** Re-author the rate set from scratch, so each case starts from a known catalog. */
    async function authorRates(rows: Array<Record<string, unknown>>) {
        const { error: clearError } = await supabase
            .from("commercial_tuition_rates")
            .delete()
            .in("id", ALL_RATES);
        expect(clearError, clearError?.message).toBeNull();
        if (rows.length === 0) return;
        const { error } = await supabase.from("commercial_tuition_rates").insert(
            rows.map((r) => ({
                org_id: ORG,
                payer_type: "private_pay",
                is_active: true,
                not_offered: false,
                location_id: null,
                ...r,
            })),
        );
        expect(error, error?.message).toBeNull();
    }

    async function view(over: { cadenceKey?: string | null; asOf?: string | null } = {}) {
        const v = await buildAssignmentTuitionView(supabase, {
            orgId: ORG,
            opportunityCustomerMemberId: ocmId,
            // `??` would swallow an explicit null, which is the whole point of the unchosen-cadence
            // case: null means "the operator has not chosen", not "use the default".
            cadenceKey: "cadenceKey" in over ? over.cadenceKey : "monthly",
            asOf: over.asOf ?? TODAY,
        });
        expect(v).not.toBeNull();
        return v!;
    }

    beforeAll(async () => {
        // A representative assignment the seed already produced — proposed, and NOT enrolled.
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id, customer_member_id, program_category_id, schedule_type, location_id")
            .eq("org_id", ORG)
            .not("program_category_id", "is", null)
            .limit(1);
        const ocm = (ocmRows ?? [])[0] as Record<string, string> | undefined;
        expect(ocm, "the representative tenant must hold an assignment").toBeTruthy();
        ocmId = ocm!.id;
        customerMemberId = ocm!.customer_member_id;
        programCategoryId = ocm!.program_category_id;
        scheduleType = ocm!.schedule_type;
        locationId = ocm!.location_id ?? null;

        originalProgramCategoryId = ocm!.program_category_id ?? null;
        await cleanup();

        /*
         * A PROGRAM OF THIS TEST'S OWN. The representative seed authors real programs and real
         * tuition, and it should — the mounted card has to price a seeded family. But a case that
         * proves "an empty catalog is a no-match" cannot share a catalog with it, so the assignment
         * under test is pointed at a fixture program nothing else prices.
         */
        const { error: categoryError } = await supabase.from("location_program_categories").insert({
            id: CATEGORY,
            org_id: ORG,
            location_id: locationId,
            key: PROGRAM_KEY,
            label: "Thread 3 certification program",
            is_active: true,
        });
        expect(categoryError, categoryError?.message).toBeNull();
        programCategoryId = CATEGORY;
        programKey = PROGRAM_KEY;
        const { error: pointError } = await supabase
            .from("opportunity_customer_members")
            .update({ program_category_id: CATEGORY })
            .eq("id", ocmId);
        expect(pointError, pointError?.message).toBeNull();

        // The assignment commits to five days a week. Days live on the assignment until a schedule
        // assignment commits them, so this is the owner speaking, not a copy.
        await supabase
            .from("opportunity_customer_members")
            .update({ metadata: { seed: "local_representative_seed", requested_days_per_week: 5 } })
            .eq("id", ocmId);

        // Two programs, two attendance shapes, two quantities — the real eligibility dimensions this
        // commercial model has. Age banding is not one of them, and none is invented here.
        const { error: offeringError } = await supabase.from("program_offerings").insert([
            { id: OFFER_FULL, org_id: ORG, program_key: programKey, label: "Full week", attendance_type: scheduleType },
            { id: OFFER_PART, org_id: ORG, program_key: programKey, label: "Part week", attendance_type: `${scheduleType}_alt` },
        ]);
        expect(offeringError, offeringError?.message).toBeNull();
        const { error: variantError } = await supabase.from("program_offering_variants").insert([
            { id: VAR_5DAY, org_id: ORG, offering_id: OFFER_FULL, label: "5 days/week", quantity_type: "days", quantity_value: 5 },
            { id: VAR_3DAY, org_id: ORG, offering_id: OFFER_FULL, label: "3 days/week", quantity_type: "days", quantity_value: 3 },
            { id: VAR_DEFAULT, org_id: ORG, offering_id: OFFER_FULL, label: "Flat rate", quantity_type: null, quantity_value: null },
            { id: VAR_PART_5, org_id: ORG, offering_id: OFFER_PART, label: "5 days/week", quantity_type: "days", quantity_value: 5 },
        ]);
        expect(variantError, variantError?.message).toBeNull();
    }, 60_000);

    afterAll(async () => {
        await cleanup();
    });

    // ── A · A PROPOSED ASSIGNMENT, WITH NO ENROLMENT, RESOLVES TUITION ───────────────────────
    it("A — prices an assignment that has no enrollment agreement", async () => {
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
        ]);
        const { data: agreements } = await supabase
            .from("child_enrollment_agreements")
            .select("id")
            .eq("org_id", ORG)
            .eq("opportunity_customer_member_id", ocmId);
        expect(agreements ?? [], "the assignment must not be enrolled yet").toHaveLength(0);

        const v = await view();
        expect(v.enrollmentAgreementId).toBeNull();
        expect(v.state).toBe("recommended");
        expect(v.recommended?.amountCents).toBe(120_000);
    });

    // ── B · DETERMINISTIC, WITH ITS INPUTS, VERSION AND EXPLANATION ──────────────────────────
    it("B — the recommendation carries the facts, the config version and why it matched", async () => {
        const v = await view();
        expect(v.facts).toMatchObject({
            programKey,
            attendanceType: scheduleType,
            daysPerWeek: 5,
            payerType: "private_pay",
            cadenceKey: "monthly",
        });
        expect(v.factSources.daysPerWeek).toBe("requested");
        expect(v.configVersion).toMatch(/\S/);
        expect(v.resolutionKey).toMatch(/\S/);
        expect(v.recommended!.matched.join(" ")).toContain("5 days a week");
        // Reproducible: the same assignment and catalog resolve identically.
        const again = await view();
        expect(again.resolutionKey).toBe(v.resolutionKey);
        expect(again.recommended!.sourceId).toBe(v.recommended!.sourceId);
    });

    // ── C · A CHANGED CANONICAL FACT CHANGES THE ANSWER ──────────────────────────────────────
    it("C — changing the assignment's committed days changes the recommendation", async () => {
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
            { id: RATE_3DAY, variant_id: VAR_3DAY, cadence_key: "monthly", rate_cents: 78_000 },
        ]);
        const five = await view();
        expect(five.recommended!.amountCents).toBe(120_000);

        // Through the owner: days live on the assignment.
        await supabase
            .from("opportunity_customer_members")
            .update({ metadata: { seed: "local_representative_seed", requested_days_per_week: 3 } })
            .eq("id", ocmId);
        const three = await view();
        expect(three.recommended!.amountCents).toBe(78_000);
        expect(three.resolutionKey).not.toBe(five.resolutionKey);

        await supabase
            .from("opportunity_customer_members")
            .update({ metadata: { seed: "local_representative_seed", requested_days_per_week: 5 } })
            .eq("id", ocmId);
    });

    // ── D · AMBIGUITY DOES NOT SILENTLY SELECT ───────────────────────────────────────────────
    it("D — two equal candidates report ambiguity, with no recommendation", async () => {
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
            { id: RATE_TWIN, variant_id: VAR_DEFAULT, cadence_key: "monthly", rate_cents: 125_000 },
        ]);
        const v = await view();
        expect(v.state).toBe("ambiguous");
        expect(v.recommended).toBeNull();
        expect(v.tied).toHaveLength(2);
        expect(v.tied.map((t) => t.sourceId).sort()).toEqual([RATE_MONTHLY, RATE_TWIN].sort());
    });

    it("D — an unchosen billing frequency with two offers is also ambiguous", async () => {
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
            { id: RATE_WEEKLY, variant_id: VAR_5DAY, cadence_key: "weekly", rate_cents: 30_000 },
        ]);
        const unchosen = await view({ cadenceKey: null });
        expect(unchosen.state).toBe("ambiguous");
        const chosen = await view({ cadenceKey: "weekly" });
        expect(chosen.state).toBe("recommended");
        expect(chosen.recommended!.amountCents).toBe(30_000);
    });

    // ── E · NO MATCH IS EXPLICIT ─────────────────────────────────────────────────────────────
    it("E — an empty catalog is an explicit no-match, not a zero", async () => {
        await authorRates([]);
        const v = await view();
        expect(v.state).toBe("no_match");
        expect(v.recommended).toBeNull();
        expect(v.noMatchReason).toBe("no_rate_for_scope");
    });

    // ── F · EXCLUSIONS, EACH TOLD APART ──────────────────────────────────────────────────────
    it("F — inactive, future, expired and not-offered are each excluded for their own reason", async () => {
        /*
         * Distinct matrix coordinates, because `commercial_tuition_rates_unique` is on
         * (org, location, variant, cadence, payer) — three rates cannot share a cell, and that
         * constraint is itself part of what the model guarantees. The cadence is left UNCHOSEN so
         * each rate is excluded for its own reason rather than for the cadence.
         */
        await authorRates([
            { id: RATE_FUTURE, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 111_000, effective_start: "2099-01-01" },
            { id: RATE_EXPIRED, variant_id: VAR_5DAY, cadence_key: "weekly", rate_cents: 112_000, effective_start: "2020-01-01", effective_end: "2020-12-31" },
            { id: RATE_NOT_OFFERED, variant_id: VAR_5DAY, cadence_key: "biweekly", rate_cents: 113_000, not_offered: true },
            { id: RATE_PART, variant_id: VAR_PART_5, cadence_key: "monthly", rate_cents: 114_000 },
        ]);
        const v = await view({ cadenceKey: null });
        expect(v.state).toBe("no_match");
        const reasons = new Map(v.rejected.map((r) => [r.sourceId, r]));
        expect(reasons.get(RATE_FUTURE)).toMatchObject({ reason: "no_effective_config" });
        expect(reasons.get(RATE_FUTURE)!.detail).toContain("not effective until");
        expect(reasons.get(RATE_EXPIRED)!.detail).toContain("expired after");
        expect(reasons.get(RATE_NOT_OFFERED)).toMatchObject({ reason: "not_offered_at_scope" });
        // A rate on another offering's variant is not this assignment's business at all.
        expect(reasons.has(RATE_PART)).toBe(false);

        /*
         * INACTIVE IS GONE, not rejected. `not_offered` is a deliberate statement about a scope and
         * stays visible so it can be explained; a deactivated rate is simply not in the catalog.
         *
         * This case found that it WAS in the catalog: `readPricing` selected `is_active` and then
         * dropped it, so a rate turned off in Commercial Configuration went on pricing children.
         * `resolvePricing`'s own comment had claimed the folding happened in the readers.
         */
        await supabase.from("commercial_tuition_rates").update({ is_active: false }).eq("id", RATE_FUTURE);
        const after = await view({ cadenceKey: null });
        expect(after.rejected.some((r) => r.sourceId === RATE_FUTURE)).toBe(false);
        expect(after.applicable.some((o) => o.sourceId === RATE_FUTURE)).toBe(false);
    });

    // ── G–K · ACCEPTANCE, PERSISTENCE, STALENESS, RETRY, CATALOG DRIFT ───────────────────────
    it("G/H/I/J/K — acceptance persists, survives a fresh read, refuses staleness, is retry-safe, and does not move when the catalog does", async () => {
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
        ]);
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG).eq("opportunity_customer_member_id", ocmId);

        const v = await view();
        expect(v.state).toBe("recommended");

        // G — the write.
        const accepted = await acceptEnrollmentPricingTerm(supabase, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: UNGRANTED, // acceptance needs no special authority
            opportunityCustomerMemberId: ocmId,
            resolutionKey: v.resolutionKey,
            selectedSourceId: v.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(accepted.ok, accepted.ok ? "" : accepted.message).toBe(true);
        if (!accepted.ok) return;
        expect(accepted.term).toMatchObject({
            state: "accepted",
            amount_cents: 120_000,
            cadence_key: "monthly",
            source_entity: "commercial_tuition_rates",
            source_id: RATE_MONTHLY,
            effective_start: TODAY,
            accepted_by: ACTOR,
            enrollment_agreement_id: null,
        });
        expect(accepted.term.config_version).toBe(v.configVersion);
        expect(accepted.term.resolved_facts).toMatchObject({ fact_sources: { daysPerWeek: "requested" } });

        // H — a fresh read returns identical truth.
        const reread = await view();
        expect(reread.accepted?.termId).toBe(accepted.term.id);
        expect(reread.accepted?.amountCents).toBe(120_000);
        expect(reread.acceptedIsStale).toBe(false);

        // J — the retry.
        const retry = await acceptEnrollmentPricingTerm(supabase, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: UNGRANTED,
            opportunityCustomerMemberId: ocmId,
            resolutionKey: v.resolutionKey,
            selectedSourceId: v.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(retry.ok).toBe(true);
        expect(retry.ok && retry.idempotent).toBe(true);
        expect(retry.ok && retry.term.id).toBe(accepted.term.id);
        const all = await readAcceptedPricingTerms(supabase, { orgId: ORG, opportunityCustomerMemberId: ocmId });
        expect(all).toHaveLength(1);

        // I — the assignment moves, and the OLD resolution can no longer be accepted.
        await supabase
            .from("opportunity_customer_members")
            .update({ metadata: { seed: "local_representative_seed", requested_days_per_week: 3 } })
            .eq("id", ocmId);
        const stale = await acceptEnrollmentPricingTerm(supabase, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: UNGRANTED,
            opportunityCustomerMemberId: ocmId,
            resolutionKey: v.resolutionKey,
            selectedSourceId: v.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(stale.ok).toBe(false);
        expect(stale.ok === false && stale.code).toBe("stale_resolution");
        // And the surface says so about what is already accepted.
        const stalenessView = await view();
        expect(stalenessView.acceptedIsStale).toBe(true);
        await supabase
            .from("opportunity_customer_members")
            .update({ metadata: { seed: "local_representative_seed", requested_days_per_week: 5 } })
            .eq("id", ocmId);

        // K — the catalog moves, and the accepted term does not.
        await supabase.from("commercial_tuition_rates").update({ rate_cents: 145_000 }).eq("id", RATE_MONTHLY);
        const afterCatalogEdit = await readAcceptedPricingTerms(supabase, { orgId: ORG, opportunityCustomerMemberId: ocmId });
        expect(afterCatalogEdit[0]!.amountCents).toBe(120_000);
        expect(afterCatalogEdit[0]!.termId).toBe(accepted.term.id);
        await supabase.from("commercial_tuition_rates").update({ rate_cents: 120_000 }).eq("id", RATE_MONTHLY);
    }, 60_000);

    // ── L · AN EFFECTIVE-DATED SUCCESSOR, WITHOUT DESTROYING ITS PREDECESSOR ─────────────────
    it("L — a future-dated term supersedes nothing and both stay readable", async () => {
        const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
        const futureView = await view({ asOf: future });
        expect(futureView.state).toBe("recommended");
        const successor = await acceptEnrollmentPricingTerm(supabase, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: UNGRANTED,
            opportunityCustomerMemberId: ocmId,
            resolutionKey: futureView.resolutionKey,
            selectedSourceId: futureView.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: future,
        });
        expect(successor.ok, successor.ok ? "" : successor.message).toBe(true);

        const live = await readAcceptedPricingTerms(supabase, { orgId: ORG, opportunityCustomerMemberId: ocmId });
        expect(live).toHaveLength(2);
        // Each is in force on its own date, and neither destroyed the other.
        const todayTerms = await readAcceptedPricingTerms(supabase, { orgId: ORG, opportunityCustomerMemberId: ocmId, onDate: TODAY });
        expect(todayTerms).toHaveLength(1);
        expect(todayTerms[0]!.effectiveStart).toBe(TODAY);
        const futureTerms = await readAcceptedPricingTerms(supabase, { orgId: ORG, opportunityCustomerMemberId: ocmId, onDate: future });
        expect(futureTerms.map((t) => t.effectiveStart)).toContain(future);
        // Tidy the successor away so the override cases start from one live term.
        await supabase.from("enrollment_pricing_terms").delete().eq("id", (successor as { term: { id: string } }).term.id);
    }, 60_000);

    // ── M–O · OVERRIDE ───────────────────────────────────────────────────────────────────────
    it("M/N/O — an override is authorized, explained, and keeps both halves reconstructable", async () => {
        // G–L's terms have served their purpose, and they hold the rates by a RESTRICT foreign key —
        // which is itself the guarantee that an accepted price cannot have its rate deleted from
        // under it. Release them before re-authoring the catalog.
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG).eq("opportunity_customer_member_id", ocmId);
        await authorRates([
            { id: RATE_MONTHLY, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 120_000 },
            { id: RATE_TWIN, variant_id: VAR_5DAY, cadence_key: "monthly", rate_cents: 131_000, location_id: locationId },
        ]);
        const v = await view();
        // The site rate supersedes the org default, so the recommendation is the site one and the
        // org default is the alternative an override would choose.
        expect(v.state).toBe("recommended");
        expect(v.recommended!.sourceId).toBe(RATE_TWIN);
        const alternative = v.applicable.find((o) => o.sourceId === RATE_MONTHLY);
        expect(alternative, "the org default must remain an applicable alternative").toBeTruthy();

        // A baseline acceptance, so the override has a predecessor to supersede rather than being
        // the first term this assignment ever had.
        const baseline = await acceptEnrollmentPricingTerm(supabase, {
            orgId: ORG,
            actorUserId: ACTOR,
            permissionKeys: UNGRANTED,
            opportunityCustomerMemberId: ocmId,
            resolutionKey: v.resolutionKey,
            selectedSourceId: v.recommended!.sourceId,
            cadenceKey: "monthly",
            asOf: TODAY,
        });
        expect(baseline.ok, baseline.ok ? "" : baseline.message).toBe(true);

        const base = {
            orgId: ORG,
            actorUserId: ACTOR,
            opportunityCustomerMemberId: ocmId,
            resolutionKey: v.resolutionKey,
            selectedSourceId: RATE_MONTHLY,
            cadenceKey: "monthly",
            asOf: TODAY,
            supersede: true,
        };

        // M — no grant, no override, whatever the UI rendered.
        const unauthorized = await overrideEnrollmentPricingTerm(supabase, {
            ...base,
            permissionKeys: UNGRANTED,
            overrideReason: "Sibling arrangement agreed with the director",
        });
        expect(unauthorized.ok).toBe(false);
        expect(unauthorized.ok === false && unauthorized.code).toBe("override_permission_required");

        // N — granted, but silent.
        const unexplained = await overrideEnrollmentPricingTerm(supabase, {
            ...base,
            permissionKeys: GRANTED,
            overrideReason: "   ",
        });
        expect(unexplained.ok).toBe(false);
        expect(unexplained.ok === false && unexplained.code).toBe("override_reason_required");

        // An override that picks the recommendation is an acceptance, and says so.
        const notAnOverride = await overrideEnrollmentPricingTerm(supabase, {
            ...base,
            selectedSourceId: RATE_TWIN,
            permissionKeys: GRANTED,
            overrideReason: "Because",
        });
        expect(notAnOverride.ok === false && notAnOverride.code).toBe("override_matches_recommendation");

        // O — the real thing.
        const reason = "Sibling arrangement agreed with the director";
        const overridden = await overrideEnrollmentPricingTerm(supabase, {
            ...base,
            permissionKeys: GRANTED,
            overrideReason: reason,
        });
        expect(overridden.ok, overridden.ok ? "" : overridden.message).toBe(true);
        if (!overridden.ok) return;
        expect(overridden.term).toMatchObject({
            state: "overridden",
            source_id: RATE_MONTHLY,
            amount_cents: 120_000,
            recommended_source_id: RATE_TWIN,
            override_reason: reason,
            accepted_by: ACTOR,
        });
        expect(overridden.term.accepted_at).toMatch(/\d{4}-\d{2}-\d{2}/);
        // BOTH HALVES: what was recommended, and what was chosen instead.
        expect(overridden.term.recommended_source_id).not.toBe(overridden.term.source_id);
        // The predecessor is superseded, not deleted.
        const { data: history } = await supabase
            .from("enrollment_pricing_terms")
            .select("id, state, superseded_at")
            .eq("org_id", ORG)
            .eq("opportunity_customer_member_id", ocmId);
        expect((history ?? []).length).toBeGreaterThanOrEqual(2);
        expect((history ?? []).some((h) => (h as { superseded_at: string | null }).superseded_at != null)).toBe(true);
    }, 60_000);

    // ── P · THE TERM LEARNS ITS AGREEMENT, ONCE ──────────────────────────────────────────────
    it("P — an assignment priced before enrolment learns its agreement, and cannot be re-pointed", async () => {
        const { data: member } = await supabase
            .from("customer_members")
            .select("customer_id")
            .eq("id", customerMemberId)
            .maybeSingle();
        const { data: site } = await supabase.from("locations").select("id").eq("org_id", ORG).limit(1);
        const { error: agreementError } = await supabase.from("child_enrollment_agreements").insert({
            id: AGREEMENT,
            org_id: ORG,
            customer_member_id: customerMemberId,
            customer_id: (member as { customer_id: string }).customer_id,
            site_location_id: ((site ?? [])[0] as { id: string }).id,
            opportunity_customer_member_id: ocmId,
            status: "active",
            start_date: TODAY,
        });
        expect(agreementError, agreementError?.message).toBeNull();

        const { linked } = await linkPricingTermsToAgreement(supabase, {
            orgId: ORG,
            opportunityCustomerMemberId: ocmId,
            enrollmentAgreementId: AGREEMENT,
        });
        expect(linked).toBeGreaterThan(0);

        const terms = await readAcceptedPricingTerms(supabase, { orgId: ORG, enrollmentAgreementId: AGREEMENT });
        expect(terms.length).toBeGreaterThan(0);
        expect(terms[0]!.enrollmentAgreementId).toBe(AGREEMENT);

        // Re-pointing is refused by the database, not by a service that could be bypassed.
        const { error: repointError } = await supabase
            .from("enrollment_pricing_terms")
            .update({ enrollment_agreement_id: null })
            .eq("id", terms[0]!.termId);
        expect(repointError, "re-pointing an agreement must be refused").not.toBeNull();
    }, 60_000);

    // ── Q · THE DOWNSTREAM PAYLOAD ───────────────────────────────────────────────────────────
    it("Q — a later thread can read everything it needs, and nothing has become a charge", async () => {
        const { count: chargesBefore } = await supabase
            .from("charges")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG);

        const terms = await readAcceptedPricingTerms(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            onDate: TODAY,
        });
        expect(terms).toHaveLength(1);
        const term = terms[0]!;
        // Everything required to raise an obligation later, and nothing that IS one.
        expect(term).toMatchObject({
            termKind: "tuition",
            enrollmentAgreementId: AGREEMENT,
            currencyCode: "USD",
            cadenceKey: "monthly",
            payerType: "private_pay",
            effectiveStart: TODAY,
        });
        expect(term.customerMemberId).toBe(customerMemberId);
        expect(term.amountCents).toBeGreaterThan(0);
        expect(term.source.entity).toBe("commercial_tuition_rates");
        expect(term.configVersion).toMatch(/\S/);
        expect(term.resolutionKey).toMatch(/\S/);
        expect(Object.keys(term)).not.toContain("chargeId");

        const { count: chargesAfter } = await supabase
            .from("charges")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG);
        expect(chargesAfter, "pricing a family must create no charge").toBe(chargesBefore);
    }, 60_000);

    // ── The resolver and the surface agree, because they are the same code ───────────────────
    it("the composed view and a direct resolution cannot disagree", async () => {
        const read = await readAssignmentPricingFacts(supabase, {
            orgId: ORG,
            opportunityCustomerMemberId: ocmId,
            asOf: TODAY,
            cadenceKey: "monthly",
        });
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        const exported = await composeCommercialExport({ supabase, orgId: ORG, asOf: TODAY });
        const direct = resolveAssignmentPricingOptions(exported.export, read.facts);
        const composed = await view();
        expect(composed.resolutionKey).toBe(direct.resolutionKey);
        expect(composed.state).toBe(direct.kind === "recommended" ? "recommended" : direct.kind);
    });
});
