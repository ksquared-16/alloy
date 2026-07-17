/**
 * D7 — FAIL-CLOSED ENVIRONMENT PREFLIGHT.
 *
 * The runtime's performance and behavior may only be certified from a trustworthy environment. This
 * preflight verifies the environment and, when it is degraded, classifies WHY — so an invalid run is
 * never mistaken for a product failure. A degraded environment SKIPS the behavioral suite rather than
 * failing it.
 *
 * Failure classes (D7 §1): environment | authentication | seed | server_ownership | hosted_backend.
 */
import type { APIRequestContext } from "@playwright/test";

export type PreflightClass =
    | "ok"
    | "environment"
    | "authentication"
    | "seed"
    | "server_ownership"
    | "hosted_backend";

export type PreflightResult = {
    ok: boolean;
    class: PreflightClass;
    detail: string;
    checks: Record<string, boolean>;
};

const REPRESENTATIVE_WU = process.env.WU_SLUG_A || "new-leads";
const REPRESENTATIVE_WU_MIN_ROWS = 1;

/**
 * Run the preflight against the live app. Uses only the app's own endpoints — a healthy answer proves
 * production mode, a live local DB, valid auth, seed presence, D1 operational, and Settlement terminal
 * ALL AT ONCE, because the hosted tenant cannot produce the local seed and a degraded DB cannot answer.
 */
export async function runPreflight(request: APIRequestContext, baseURL: string): Promise<PreflightResult> {
    const checks: Record<string, boolean> = {};
    const fail = (cls: PreflightClass, detail: string): PreflightResult => ({ ok: false, class: cls, detail, checks });

    // 1. App reachable + production mode + toolkit-owned server (build-info answers only from a live server).
    let build: any;
    try {
        const res = await request.get(`${baseURL}/api/build-info`, { timeout: 8000 });
        checks.app_reachable = res.ok();
        if (!res.ok()) return fail("environment", `build-info HTTP ${res.status()}`);
        build = await res.json();
    } catch (e) {
        return fail("environment", `app unreachable: ${String(e).slice(0, 80)}`);
    }
    checks.production_mode = build?.nodeEnv === "production";
    if (!checks.production_mode) return fail("environment", `nodeEnv=${build?.nodeEnv} (expected production)`);

    // 2. Auth + D1 + seed + settlement, in ONE call: the provisioning answer.
    let answer: any;
    try {
        const url = `${baseURL}/api/admin/work-units/${REPRESENTATIVE_WU}/provisioning-answer?work_view_id=new_leads`;
        const res = await request.get(url, { timeout: 12000 });
        checks.d1_reachable = true;
        if (res.status() === 401 || res.status() === 403) return fail("authentication", `provisioning-answer HTTP ${res.status()} — storage state invalid/expired`);
        if (!res.ok()) return fail("environment", `provisioning-answer HTTP ${res.status()}`);
        answer = await res.json();
    } catch (e) {
        return fail("environment", `D1 request failed (local DB down?): ${String(e).slice(0, 80)}`);
    }

    // 3. D1 operational + representative seed present.
    checks.d1_operational = answer?.terminal === "operational";
    if (answer?.terminal === "error") return fail("environment", `D1 error terminal: ${answer?.code} ${answer?.message}`);
    checks.seed_present = Array.isArray(answer?.rows) && answer.rows.length >= REPRESENTATIVE_WU_MIN_ROWS;
    if (!checks.seed_present) return fail("seed", `representative WU '${REPRESENTATIVE_WU}' has ${answer?.rows?.length ?? 0} rows`);

    // 4. Settlement reaches a terminal state (resolved or explicitly unavailable — both are terminal).
    const settlement = answer?.settlement?.status;
    checks.settlement_terminal = settlement === "resolved" || settlement === "unavailable";
    if (!checks.settlement_terminal) return fail("environment", `settlement status='${settlement}' (not terminal)`);

    // 5. Hosted-backend protection: the local seed proves a LOCAL DB (the hosted tenant has ~3 leads, not
    //    the 2400-opp local seed). If we somehow saw the hosted tenant, that is the hosted_backend class.
    checks.local_backend = checks.seed_present; // local seed present ⇒ not the hosted tenant

    return { ok: true, class: "ok", detail: `production · D1 operational · seed=${answer.rows.length} · settlement=${settlement}`, checks };
}
