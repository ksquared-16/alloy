import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { CATALOG_VERSION, SCENARIOS, SUITE_KEY } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";
import {
    QA_SUBJECT,
    deployedRevision,
    environmentName,
    readSubject,
    readVmExtras,
    resolveReadiness,
} from "@/lib/qa/financialsDirectorQa/readiness";

/**
 * GET  /api/admin/qa/financials-director   — readiness, subject truth and this build's results
 * POST /api/admin/qa/financials-director   — record one Director acceptance result
 *
 * ── WHAT THIS ROUTE MAY DO, AND WHAT IT MAY NOT ─────────────────────────────────────────────────
 *
 * It READS Financials through the canonical account reader and WRITES only to the QA acceptance
 * table. It never creates a charge, never applies a payment, never touches a financial row. The
 * money in the walkthrough is made by the Director, through the product's own actions — which is
 * the whole point of a human acceptance pass and the reason this harness is trustworthy at all.
 *
 * The org comes from the authenticated session, never the request, so a household id from another
 * tenant resolves to nothing rather than to that tenant's ledger.
 */

const RESULTS = "qa_director_acceptance_results";

export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();

    /*
     * THIS SURFACE SHOWS A FAMILY'S BALANCES, SO IT IS GATED LIKE ONE.
     *
     * Being an internal QA tool is not a reason to read money more cheaply than the product does.
     * The harness renders outstanding, collectible and responsibility for a real household, so it
     * asks for the same permission the Financials card asks for — otherwise it would be a way to
     * see a tenant's money without the grant that governs seeing it.
     */
    const allowedRead = await assertFinancialsReadAllowed({
        supabase, orgId: ctx.orgId, userId: ctx.userId,
    });
    if (!allowedRead.ok) {
        return NextResponse.json(
            { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
            { status: 403 },
        );
    }

    const revision = deployedRevision();

    const [subject, extras] = await Promise.all([
        readSubject(supabase, ctx.orgId),
        readVmExtras(supabase, ctx.orgId),
    ]);

    /*
     * RESULTS ARE READ FOR THIS BUILD ONLY.
     *
     * An acceptance is testimony about the build it was given. Reading across revisions would let
     * yesterday's ticks vouch for code nobody has looked at, which is exactly the silent carry-over
     * this program exists to prevent. Earlier builds' answers stay in the table and stay legible;
     * they simply do not count as this build's.
     */
    const { data: results, error } = await supabase
        .from(RESULTS)
        .select("scenario_key, result, observation, expected_result, classification, evidence_reference, scenario_definition_version, deployed_revision, tester_email, completed_at")
        .eq("org_id", ctx.orgId)
        .eq("suite_key", SUITE_KEY)
        .eq("deployed_revision", revision);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const accepted = new Set(
        (results ?? []).filter((r) => String(r.result) === "pass").map((r) => String(r.scenario_key)),
    );

    /*
     * BASELINE CHANGED. Any answer recorded against a DIFFERENT revision is reported rather than
     * quietly reused, so the Director decides what still stands.
     */
    const { data: otherBuilds } = await supabase
        .from(RESULTS)
        .select("deployed_revision, scenario_definition_version")
        .eq("org_id", ctx.orgId)
        .eq("suite_key", SUITE_KEY)
        .neq("deployed_revision", revision)
        .limit(200);

    const priorRevisions = [...new Set((otherBuilds ?? []).map((r) => String(r.deployed_revision)))];
    const priorCatalogVersions = [...new Set((otherBuilds ?? []).map((r) => String(r.scenario_definition_version)))]
        .filter((v) => v !== CATALOG_VERSION);

    return NextResponse.json({
        ok: true,
        suiteKey: SUITE_KEY,
        catalogVersion: CATALOG_VERSION,
        environment: environmentName(),
        deployedRevision: revision,
        subjectReference: QA_SUBJECT,
        subject,
        scenarios: SCENARIOS,
        readiness: resolveReadiness(subject, extras, accepted),
        results: results ?? [],
        baselineChanged: priorRevisions.length > 0,
        priorRevisions,
        priorCatalogVersions,
    });
}

const RESULT_VALUES = new Set(["pass", "fail", "blocked", "not_run"]);
const CLASSIFICATIONS = new Set([
    "PRODUCT_DEFECT", "CONFUSING_UX", "GUIDE_MISMATCH",
    "FIXTURE_DRIFT", "ENVIRONMENT_RUNTIME", "UNKNOWN_NEEDS_TRIAGE",
]);

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
     * Refused here as well as in the table's own constraint: the operator is told before they lose
     * what they were about to type, rather than after.
     */
    if ((result === "fail" || result === "blocked")) {
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

    const { error } = await supabase
        .from(RESULTS)
        .upsert(
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
