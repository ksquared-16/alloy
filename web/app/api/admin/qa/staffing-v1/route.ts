import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { CATALOG_VERSION, SCENARIOS, SUITE_KEY } from "@/lib/qa/staffingV1Qa/scenarioCatalog";
import {
    QA_FIXTURE,
    deployedRevision,
    environmentName,
    overallFixtureStatus,
    readFixture,
    resolveScenarioReadiness,
} from "@/lib/qa/staffingV1Qa/readiness";

/**
 * GET  /api/admin/qa/staffing-v1  — fixture health, scenario readiness and this build's results
 * POST /api/admin/qa/staffing-v1  — record one operator acceptance result
 *
 * ── WHAT THIS ROUTE MAY DO, AND WHAT IT MAY NOT ──
 *
 * It READS the staffing day through the canonical projection — the same read the Calendar
 * uses — and WRITES only the operator's own testimony. It plans no Coverage, records no
 * call-out, authors no hours. Every fact in the walkthrough is made by the operator through
 * the product's own commands, which is the whole point of a human acceptance pass and the
 * only reason this harness is worth anything.
 *
 * The org comes from the authenticated session, never the request, so a site id from another
 * tenant resolves to nothing rather than to that tenant's day.
 *
 * Results share the acceptance table with the Core Financials Director QA suite and are
 * namespaced by `suite_key`. A second results table would have been a second thing to query
 * whenever anyone asks what has been accepted.
 */

const RESULTS = "qa_director_acceptance_results";
const RESULT_VALUES = new Set(["pass", "fail", "blocked", "not_run"]);
const CLASSIFICATIONS = new Set([
    "PRODUCT_DEFECT", "CONFUSING_UX", "GUIDE_MISMATCH",
    "FIXTURE_DRIFT", "ENVIRONMENT_RUNTIME", "UNKNOWN_NEEDS_TRIAGE",
]);

export const dynamic = "force-dynamic";

export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const fixture = await readFixture(supabase, ctx.orgId);

    const { data, error } = await supabase
        .from(RESULTS)
        .select("scenario_key, result, observation, expected_result, classification, evidence_reference, tester_email, completed_at, scenario_definition_version")
        .eq("org_id", ctx.orgId)
        .eq("suite_key", SUITE_KEY)
        .eq("deployed_revision", deployedRevision());

    return NextResponse.json({
        suite: SUITE_KEY,
        catalogVersion: CATALOG_VERSION,
        environment: environmentName(),
        deployedRevision: deployedRevision(),
        fixture: {
            ...fixture,
            status: overallFixtureStatus(fixture),
            siteLocationId: QA_FIXTURE.siteLocationId,
            roomLocationId: QA_FIXTURE.roomLocationId,
        },
        scenarios: SCENARIOS,
        readiness: resolveScenarioReadiness(fixture),
        // A results read that failed is reported, not rendered as "nothing accepted yet".
        results: error ? [] : (data ?? []),
        resultsError: error?.message ?? null,
    });
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const scenarioKey = String(body.scenario_key ?? "").trim();
    const result = String(body.result ?? "").trim();

    if (!SCENARIOS.some((s) => s.key === scenarioKey)) {
        return NextResponse.json({ error: `Unknown scenario: ${scenarioKey || "(none)"}` }, { status: 400 });
    }
    if (!RESULT_VALUES.has(result)) {
        return NextResponse.json({ error: "result must be pass, fail, blocked or not_run" }, { status: 400 });
    }

    const observation = String(body.observation ?? "").trim() || null;
    const classification = String(body.classification ?? "").trim() || null;

    /*
     * A FAILURE THAT EXPLAINS NOTHING CANNOT BE TRIAGED.
     *
     * Refused before the operator loses what they were about to type, rather than after.
     */
    if (result === "fail" || result === "blocked") {
        if (!observation) {
            return NextResponse.json(
                { error: "Say what you actually observed. A failure nobody described cannot be triaged." },
                { status: 400 },
            );
        }
        if (!classification || !CLASSIFICATIONS.has(classification)) {
            return NextResponse.json(
                { error: `Choose a classification: ${[...CLASSIFICATIONS].join(", ")}` },
                { status: 400 },
            );
        }
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await supabase.from(RESULTS).upsert(
        {
            org_id: ctx.orgId,
            suite_key: SUITE_KEY,
            scenario_key: scenarioKey,
            scenario_definition_version: CATALOG_VERSION,
            environment: environmentName(),
            deployed_revision: deployedRevision(),
            tester_user_id: auth.user.id,
            tester_email: typeof auth.user.email === "string" ? auth.user.email : null,
            result,
            observation,
            expected_result: String(body.expected_result ?? "").trim() || null,
            classification,
            evidence_reference: String(body.evidence_reference ?? "").trim() || null,
            started_at: String(body.started_at ?? "").trim() || null,
            completed_at: result === "not_run" ? null : now,
            updated_at: now,
        },
        { onConflict: "org_id,suite_key,scenario_key,deployed_revision,tester_user_id" },
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scenario_key: scenarioKey, result });
}
