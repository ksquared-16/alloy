/**
 * THE EXACT ISOLATED QA BINDING a Financials QA-bound fixture runs under — judged before any IO.
 *
 * Vacilando's isolated executor (`lib/isolated-fixture-execution.mjs` in the installed toolkit) runs
 * `test:qa:financials-isolated` and `dev:qa:financials-historical-draft-fixture` in a child whose
 * environment it BUILDS rather than inherits: the leased certenv's loopback URL and keys, the owning
 * QA run, its environment id and bound persona, and the fixture/operation/namespace it was asked
 * for. This module reads exactly that contract and nothing else, and refuses — with no network, no
 * file and no database touched — when any of it is absent, malformed or points somewhere shared:
 *
 *   · the fixture, operation and reserved namespace are exactly the ones the registry pairs;
 *   · the QA run, environment and persona have the executor's shapes (`qar_…`, `certenv-…`);
 *   · the Supabase target is loopback, inside the certenv port band (56100–56299) — never the
 *     shared `alloy-cert` stack (54320–54429), never a hosted project;
 *   · a database URL, if one was injected, is the same loopback band;
 *   · the service credential is present — it is consumed by the child, NEVER printed: every refusal
 *     names the variable, not its value, and `describeTarget` reports host:port only.
 *
 * A refusal is not a skip. The callers exit non-zero on it, so an absent binding can never be read
 * as a passing certification.
 */

export const FINANCIALS_CERT_NAMESPACE = "financials-cert.alloy.invalid";

/** The registry pairs these two fixtures with these operations (certification-fixture.mjs). */
export const FINANCIALS_QA_FIXTURES = Object.freeze({
    financials_isolated_tests: Object.freeze({ operations: Object.freeze({ run: Object.freeze([]) }) }),
    financials_historical_draft: Object.freeze({
        operations: Object.freeze({
            ensure: Object.freeze(["--ensure"]),
            verify: Object.freeze(["--verify"]),
            reset: Object.freeze(["--reset"]),
        }),
    }),
});

/** The certenv API/DB port band — certification-environments.mjs CERTENV_PORT_BASE, 20 blocks of 10. */
export const CERTENV_PORT_MIN = 56100;
export const CERTENV_PORT_MAX = 56299;

const QA_RUN_RE = /^qar_[0-9a-f]{12}$/;
const CERTENV_ID_RE = /^certenv-[0-9a-f]{10}$/;
const PERSONA_RE = /^[a-z0-9_]{1,64}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

export const BINDING_REFUSALS = Object.freeze({
    PRODUCTION_RUNTIME: "production_runtime_refused",
    FIXTURE: "fixture_binding_mismatch",
    OPERATION: "operation_binding_mismatch",
    ARGV: "argv_not_the_registered_vector",
    NAMESPACE: "namespace_binding_mismatch",
    QA_RUN: "qa_run_binding_absent",
    ENVIRONMENT: "qa_environment_binding_absent",
    PERSONA: "qa_persona_binding_absent",
    TARGET_ABSENT: "supabase_target_absent",
    TARGET_FORBIDDEN: "supabase_target_forbidden",
    DATABASE_FORBIDDEN: "database_target_forbidden",
    CREDENTIAL_ABSENT: "service_credential_absent",
});

/**
 * @typedef {{ fixture: string, operation: string, namespace: string, qaRunId: string, environmentId: string, persona: string, target: { host: string, port: number } }} IsolatedBinding
 * @typedef {{ ok: false, code: string, detail: string }} BindingRefusal
 */

/** @returns {BindingRefusal} */
function refuse(code, detail) {
    return { ok: false, code, detail };
}

/** A URL inside the certenv loopback band, or why not. Never echoes credentials or a path. */
export function judgeLoopbackTarget(raw) {
    let u;
    try {
        u = new URL(String(raw));
    } catch {
        return { ok: false, detail: "not a URL" };
    }
    const host = u.hostname;
    const port = Number(u.port);
    if (!LOOPBACK.has(host)) return { ok: false, detail: `host ${host || "(none)"} is not loopback` };
    if (!Number.isInteger(port) || port < CERTENV_PORT_MIN || port > CERTENV_PORT_MAX) {
        return { ok: false, detail: `${host}:${u.port || "(default)"} is outside the isolated certenv band ${CERTENV_PORT_MIN}–${CERTENV_PORT_MAX}` };
    }
    return { ok: true, host, port };
}

/**
 * Judge the executor's environment for one fixture operation.
 *
 * `fixture` / `operation` are what THIS script implements; `argv` is what it was invoked with
 * (after `--`). The registry's argument vector is the only accepted one, so a hand-run with an
 * extra flag cannot widen what the script does.
 *
 * @param {{ env?: Record<string, string | undefined>, fixture?: string, operation?: string, argv?: string[] }} [input]
 * @returns {BindingRefusal | { ok: true, binding: IsolatedBinding }}
 */
export function readIsolatedBinding({ env = process.env, fixture, operation, argv = [] } = {}) {
    const R = BINDING_REFUSALS;
    if (String(env.NODE_ENV || "").toLowerCase() === "production" || String(env.VERCEL || "") === "1") {
        return refuse(R.PRODUCTION_RUNTIME, "a production runtime never runs a certification fixture");
    }
    const def = FINANCIALS_QA_FIXTURES[fixture];
    if (!def || env.ALLOY_CERT_FIXTURE !== fixture) {
        return refuse(R.FIXTURE, `ALLOY_CERT_FIXTURE must be ${fixture}`);
    }
    const expectedArgs = def.operations[operation];
    if (!expectedArgs || env.ALLOY_CERT_OPERATION !== operation) {
        return refuse(R.OPERATION, `ALLOY_CERT_OPERATION must be ${operation}`);
    }
    const args = [...argv];
    if (args.length !== expectedArgs.length || args.some((a, i) => a !== expectedArgs[i])) {
        return refuse(R.ARGV, `${fixture} ${operation} takes exactly [${expectedArgs.join(" ")}]`);
    }
    if (env.ALLOY_CERT_NAMESPACE !== FINANCIALS_CERT_NAMESPACE) {
        return refuse(R.NAMESPACE, `ALLOY_CERT_NAMESPACE must be ${FINANCIALS_CERT_NAMESPACE}`);
    }
    if (!QA_RUN_RE.test(String(env.ALLOY_QA_RUN_ID || ""))) return refuse(R.QA_RUN, "ALLOY_QA_RUN_ID is absent or not qar_<12 hex>");
    if (!CERTENV_ID_RE.test(String(env.ALLOY_QA_ENVIRONMENT_ID || ""))) {
        return refuse(R.ENVIRONMENT, "ALLOY_QA_ENVIRONMENT_ID is absent or not certenv-<10 hex>");
    }
    if (!PERSONA_RE.test(String(env.ALLOY_QA_PERSONA || ""))) return refuse(R.PERSONA, "ALLOY_QA_PERSONA is absent or malformed");

    const url = String(env.SUPABASE_URL || "").trim();
    if (!url) return refuse(R.TARGET_ABSENT, "SUPABASE_URL is absent");
    const target = judgeLoopbackTarget(url);
    if (!target.ok) return refuse(R.TARGET_FORBIDDEN, `SUPABASE_URL: ${target.detail}`);
    const publicUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    if (publicUrl && publicUrl !== url) return refuse(R.TARGET_FORBIDDEN, "NEXT_PUBLIC_SUPABASE_URL differs from SUPABASE_URL");
    /* A pre-set live-suite target that disagrees would be the one the suite actually reads. */
    const preset = String(env.CERT_SUPABASE_URL || "").trim();
    if (preset && preset !== url) return refuse(R.TARGET_FORBIDDEN, "CERT_SUPABASE_URL differs from the bound SUPABASE_URL");

    const dbUrl = String(env.DATABASE_URL || "").trim();
    if (dbUrl) {
        const db = judgeLoopbackTarget(dbUrl.replace(/^postgres(ql)?:/, "http:"));
        if (!db.ok) return refuse(R.DATABASE_FORBIDDEN, `DATABASE_URL: ${db.detail}`);
    }
    if (!String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) return refuse(R.CREDENTIAL_ABSENT, "SUPABASE_SERVICE_ROLE_KEY is absent");

    return {
        ok: /** @type {const} */ (true),
        binding: {
            fixture,
            operation,
            namespace: FINANCIALS_CERT_NAMESPACE,
            qaRunId: env.ALLOY_QA_RUN_ID,
            environmentId: env.ALLOY_QA_ENVIRONMENT_ID,
            persona: env.ALLOY_QA_PERSONA,
            target: { host: target.host, port: target.port },
        },
    };
}

/** One printable line for a binding — host:port and ids only. @param {IsolatedBinding} binding */
export function describeBinding(binding) {
    return `${binding.fixture} ${binding.operation} qa_run=${binding.qaRunId} environment=${binding.environmentId} persona=${binding.persona} target=${binding.target.host}:${binding.target.port}`;
}
