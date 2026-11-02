/**
 * THE SHARED QA WORKFLOW VERIFIER — a rendered, read-only proof of one workflow, as one QA persona, on one
 * candidate preview, under the isolated executor's binding. Product-owned and lane-neutral: a lane supplies an
 * ADAPTER (fixed routes, the DOM it reads, its assertions); this module supplies everything else.
 *
 * WHY IT EXISTS. A fixture can prove the domain rule on Postgres, but not what an operator sees. The installed
 * toolkit's browser tools are slot-bound or sign in the seed operator, and a lane must never be handed a session
 * file or a free browser. So the capability is a CHILD-SIDE step of an already-governed fixture operation: the
 * executor built this process's environment, bound the preview, the persona's session file (by digest), the
 * candidate, the run, the environment and the expiry. This module re-reads exactly that and nothing else.
 *
 * WHAT IT REFUSES BEFORE ANY BROWSER EXISTS (`readWorkflowBinding`):
 *   · a preview origin that is not `http://127.0.0.1:<4410–4419>`; a session origin that is neither it nor the
 *     same port on a `*.ts.net` tailnet host;
 *   · a session file that is not this run's and this persona's storage state, or whose bytes do not hash to the
 *     executor's `ALLOY_QA_SESSION_SHA256` (the path goes to the driver only; it is never printed);
 *   · an expected identity that is not an email; a candidate, environment, run, organization or API origin that
 *     differs from the verified fixture authority; an expired binding.
 *
 * WHAT IT ENFORCES WHILE THE BROWSER RUNS (`runWorkflowVerification`):
 *   · only the adapter's own routes — fixed, relative, no scheme, no `..`; the caller names none;
 *   · the authority is re-attested immediately before the browser opens (a hold that changed refuses);
 *   · a network policy the driver applies to every request: GET/HEAD only, and only to the preview, session and
 *     API origins. Anything else is aborted by the driver AND fails the verification — an attempted write is a
 *     hidden mutation and an attempted foreign request is an outbound send, whether or not it was stopped;
 *   · interaction is limited to the adapter's declared REVEAL selectors (disclosure toggles). A reveal that tries
 *     to write is caught by the same policy;
 *   · the signed-in identity the page reports must be the bound persona; a redirect away from the route (login,
 *     unauthorized) fails.
 *
 * The verdict is lines in the executor's contract (`✓ <check>` / `✗ <check>`) built from fixed text, ids and
 * counts — never page text beyond what an adapter asserts, never a URL with a token, never a cookie.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export const WORKFLOW_VERIFICATION_SCHEMA = "alloy.qa_workflow_verification.v1";
/** Candidate preview ports (toolkit `PREVIEW_PORT_RANGE`, lib/candidate-preview.mjs). */
export const PREVIEW_PORT_MIN = 4410;
export const PREVIEW_PORT_MAX = 4419;
export const ALLOWED_METHODS = Object.freeze(["GET", "HEAD"]);

export const WORKFLOW_REFUSALS = Object.freeze({
    BINDING_ABSENT: "workflow_binding_absent",
    PREVIEW_ORIGIN: "workflow_preview_origin_refused",
    SESSION_ORIGIN: "workflow_session_origin_refused",
    SESSION_FILE: "workflow_session_file_unbound",
    SESSION_DIGEST: "workflow_session_digest_mismatch",
    IDENTITY: "workflow_identity_unbound",
    CANDIDATE: "workflow_candidate_mismatch",
    ENVIRONMENT: "workflow_environment_mismatch",
    RUN: "workflow_run_mismatch",
    ORG: "workflow_org_mismatch",
    API: "workflow_api_mismatch",
    EXPIRED: "workflow_binding_expired",
    ADAPTER: "workflow_adapter_invalid",
    ROUTE: "workflow_route_unapproved",
    ATTEST: "workflow_attestation_refused",
});

export const WORKFLOW_FAILURES = Object.freeze({
    SIGNED_OUT: "workflow_session_not_signed_in",
    WRONG_IDENTITY: "workflow_wrong_identity",
    REDIRECTED: "workflow_route_redirected",
    MUTATION: "workflow_hidden_mutation_attempted",
    OUTBOUND: "workflow_outbound_request_attempted",
    DRIVER: "workflow_driver_failed",
    ASSERTION: "workflow_assertion_failed",
});

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const QA_RUN_RE = /^qar_[0-9a-f]{12}$/;
const PERSONA_RE = /^[a-z0-9_]{1,64}$/;
const TAILNET_HOST = /^[a-z0-9][a-z0-9.-]*\.ts\.net$/i;
/** A route is a fixed relative path with an optional fixed query; nothing that can name another origin. */
const ROUTE_RE = /^\/[A-Za-z0-9/_.-]*(\?[A-Za-z0-9_=&.-]+)?$/;
const KEY_RE = /^[a-z0-9_]{1,64}$/;

const refuse = (code, detail) => ({ ok: false, code, detail });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function originOf(raw) {
    try {
        const u = new URL(String(raw));
        if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
        return u;
    } catch {
        return null;
    }
}

/**
 * The executor-bound facts a rendered verification needs, judged against the VERIFIED fixture authority
 * (`{ candidate_sha, environment_id, qa_run_id, org_id, api_url, expires_at }`). → `{ ok, binding }` or a refusal.
 *
 * @param {Record<string, string | undefined>} env the executor-built child environment
 * @param {{ candidate_sha: string, environment_id: string, qa_run_id: string, org_id: string, api_url: string, expires_at: string }} authority
 * @param {{ nowMs?: number, readFile?: (p: string) => Buffer | string }} [opts]
 */
export function readWorkflowBinding(env, authority, { nowMs = Date.now(), readFile = (p) => readFileSync(p) } = {}) {
    const R = WORKFLOW_REFUSALS;
    if (!env || !authority) return refuse(R.BINDING_ABSENT, "no executor environment or verified authority");
    const preview = originOf(env.ALLOY_QA_PREVIEW_ORIGIN);
    const port = preview ? Number(preview.port) : NaN;
    if (!preview || preview.protocol !== "http:" || preview.hostname !== "127.0.0.1" || !(port >= PREVIEW_PORT_MIN && port <= PREVIEW_PORT_MAX)) {
        return refuse(R.PREVIEW_ORIGIN, `ALLOY_QA_PREVIEW_ORIGIN must be http://127.0.0.1:${PREVIEW_PORT_MIN}-${PREVIEW_PORT_MAX}`);
    }
    const session = originOf(env.ALLOY_QA_SESSION_ORIGIN || env.ALLOY_QA_PREVIEW_ORIGIN);
    const sameLoopback = session && session.origin === preview.origin;
    const tailnet = session && session.protocol === "https:" && TAILNET_HOST.test(session.hostname) && Number(session.port) === port;
    if (!sameLoopback && !tailnet) return refuse(R.SESSION_ORIGIN, "ALLOY_QA_SESSION_ORIGIN must be the preview origin or its port on the tailnet host");

    const runId = String(env.ALLOY_QA_RUN_ID || "");
    const persona = String(env.ALLOY_QA_PERSONA || "");
    if (!QA_RUN_RE.test(runId) || runId !== authority.qa_run_id) return refuse(R.RUN, "ALLOY_QA_RUN_ID is not the authority's run");
    if (!PERSONA_RE.test(persona)) return refuse(R.SESSION_FILE, "ALLOY_QA_PERSONA is absent or malformed");
    const file = String(env.ALLOY_QA_SESSION_FILE || "");
    if (!isAbsolute(file) || file.split("/").includes("..") || !file.endsWith(`/qa-runs/${runId}/${persona}/storage-state.json`)) {
        return refuse(R.SESSION_FILE, "ALLOY_QA_SESSION_FILE is not this run's storage state for this persona");
    }
    const expectedDigest = String(env.ALLOY_QA_SESSION_SHA256 || "");
    if (!HEX64.test(expectedDigest)) return refuse(R.SESSION_DIGEST, "ALLOY_QA_SESSION_SHA256 is absent");
    let digest;
    try {
        digest = sha256(readFile(file));
    } catch {
        return refuse(R.SESSION_FILE, "the bound session file is unreadable");
    }
    if (digest !== expectedDigest) return refuse(R.SESSION_DIGEST, "the session file is not the one the executor bound");

    const identity = String(env.ALLOY_QA_IDENTITY_EMAIL || "");
    if (!EMAIL.test(identity)) return refuse(R.IDENTITY, "ALLOY_QA_IDENTITY_EMAIL is absent or not an email");
    const candidate = String(env.ALLOY_QA_CANDIDATE_SHA || "");
    if (!HEX40.test(candidate) || candidate !== authority.candidate_sha) return refuse(R.CANDIDATE, "ALLOY_QA_CANDIDATE_SHA is not the authority's candidate");
    if (String(env.ALLOY_QA_ENVIRONMENT_ID || "") !== authority.environment_id) return refuse(R.ENVIRONMENT, "ALLOY_QA_ENVIRONMENT_ID is not the authority's environment");
    if (String(env.ALLOY_CERT_FIXTURE_ORG_ID || "") !== authority.org_id) return refuse(R.ORG, "ALLOY_CERT_FIXTURE_ORG_ID is not the authority's organization");
    const api = originOf(env.SUPABASE_URL);
    if (!api || api.origin !== String(authority.api_url || "").replace(/\/$/, "")) return refuse(R.API, "SUPABASE_URL is not the attested API origin");
    const ends = [Date.parse(String(env.ALLOY_QA_BINDING_EXPIRES_AT || "")), Date.parse(String(authority.expires_at || ""))];
    if (ends.some((t) => !Number.isFinite(t) || t <= nowMs)) return refuse(R.EXPIRED, "the binding or the authority has expired");

    /* The browser-facing API: the loopback origin, or the same port on the session's tailnet host (assemblePreviewEnv). */
    const apiOrigins = [api.origin];
    if (tailnet) apiOrigins.push(`https://${session.hostname.toLowerCase()}:${api.port}`);
    return {
        ok: true,
        binding: Object.freeze({
            previewOrigin: preview.origin,
            sessionOrigin: session.origin,
            sessionFile: file,
            expectedIdentity: identity.toLowerCase(),
            candidate,
            environmentId: authority.environment_id,
            qaRunId: runId,
            persona,
            orgId: authority.org_id,
            allowedOrigins: Object.freeze([...new Set([preview.origin, session.origin, ...apiOrigins])]),
            expiresAtMs: Math.min(...ends),
        }),
    };
}

/**
 * The request policy the driver applies to EVERY request, and this module re-applies to everything the driver
 * reports. `ws:`/`wss:` are judged as their http(s) origin.
 */
export function judgeRequest(binding, method, url) {
    let u;
    try {
        u = new URL(String(url));
    } catch {
        return { ok: false, failure: WORKFLOW_FAILURES.OUTBOUND };
    }
    if (u.protocol === "data:" || u.protocol === "blob:") return { ok: true };
    const proto = u.protocol === "ws:" ? "http:" : u.protocol === "wss:" ? "https:" : u.protocol;
    const origin = `${proto}//${u.host}`;
    if (!binding.allowedOrigins.includes(origin)) return { ok: false, failure: WORKFLOW_FAILURES.OUTBOUND };
    if (!ALLOWED_METHODS.includes(String(method || "").toUpperCase())) return { ok: false, failure: WORKFLOW_FAILURES.MUTATION };
    return { ok: true };
}

/**
 * DIAGNOSTICS FOR A FOREIGN REQUEST — the one thing a failed verdict could not say. Only the request's ORIGIN
 * (scheme, host, port: never userinfo, path, query or fragment) and a fixed class leave this function, and only for a
 * request the policy already refused. It changes no verdict.
 */
const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;
export function foreignOriginOf(binding, url) {
    let u;
    try {
        u = new URL(String(url));
    } catch {
        return { origin: "unparseable", class: "unparseable" };
    }
    const proto = u.protocol === "ws:" ? "http:" : u.protocol === "wss:" ? "https:" : u.protocol;
    if (!["http:", "https:"].includes(proto)) return { origin: `${u.protocol}`, class: "non_http_scheme" };
    const origin = `${proto}//${u.host}`.toLowerCase();
    const host = u.hostname.toLowerCase();
    const session = (() => { try { return new URL(binding.sessionOrigin).hostname.toLowerCase(); } catch { return null; } })();
    const cls = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host) ? "loopback_other_port"
        : session && host === session ? "session_host_other_port"
            : TAILNET_HOST.test(host) ? "tailnet_other_host"
                : PRIVATE_V4.test(host) ? "private_network"
                    : "third_party";
    return { origin, class: cls };
}

/**
 * An adapter: `{ key, routes: [{ id, path }], capture: [{ name, selector, attrs?, parts? }], reveal?: string[],
 * assert(routeId, snapshot, context) → { ok, check }[] }`. Frozen shape; any other field refuses.
 */
export function validateAdapter(adapter) {
    const R = WORKFLOW_REFUSALS;
    const a = adapter;
    if (!a || typeof a !== "object" || !KEY_RE.test(String(a.key || "")) || typeof a.assert !== "function") return refuse(R.ADAPTER, "adapter key/assert");
    const extra = Object.keys(a).filter((k) => !["key", "routes", "capture", "reveal", "assert"].includes(k));
    if (extra.length) return refuse(R.ADAPTER, `not an adapter field: ${extra.join(",")}`);
    if (!Array.isArray(a.routes) || !a.routes.length || a.routes.length > 8) return refuse(R.ADAPTER, "1–8 routes");
    for (const r of a.routes) {
        if (!KEY_RE.test(String(r?.id || "")) || !ROUTE_RE.test(String(r?.path || "")) || String(r.path).includes("..") || String(r.path).startsWith("//")) {
            return refuse(R.ROUTE, `route ${String(r?.id || "?")} is not a fixed relative path`);
        }
    }
    if (!Array.isArray(a.capture) || !a.capture.length || a.capture.some((c) => !KEY_RE.test(String(c?.name || "")) || typeof c.selector !== "string" || !c.selector)) {
        return refuse(R.ADAPTER, "capture specs");
    }
    if (a.reveal != null && (!Array.isArray(a.reveal) || a.reveal.some((s) => typeof s !== "string" || !s))) return refuse(R.ADAPTER, "reveal selectors");
    return { ok: true };
}

/**
 * Run one adapter's routes through a driver. `attest()` re-runs the fixture authority immediately before the
 * browser opens. `driver.open(policy)` → `{ visit(path) → { finalUrl, identity, requests: [{method,url,blocked}],
 * snapshot }, close() }`. The real driver is `qaWorkflowVerifierPlaywright.mjs`; tests use a fake.
 *
 * → `{ schema, ok, adapter, refusal?, failures: string[], checks: {ok, check}[] }`
 */
export async function runWorkflowVerification({ adapter, binding, driver, attest, context = {}, nowMs = () => Date.now() }) {
    const out = (extra) => ({ schema: WORKFLOW_VERIFICATION_SCHEMA, adapter: adapter?.key ?? null, ...extra });
    const valid = validateAdapter(adapter);
    if (!valid.ok) return out({ ok: false, refusal: valid.code, failures: [], checks: [] });
    if (!binding || typeof binding !== "object" || !Array.isArray(binding.allowedOrigins)) {
        return out({ ok: false, refusal: WORKFLOW_REFUSALS.BINDING_ABSENT, failures: [], checks: [] });
    }
    if (!(binding.expiresAtMs > nowMs())) return out({ ok: false, refusal: WORKFLOW_REFUSALS.EXPIRED, failures: [], checks: [] });
    const attested = typeof attest === "function" ? await attest() : null;
    if (!attested?.ok) return out({ ok: false, refusal: WORKFLOW_REFUSALS.ATTEST, failures: [], checks: [] });

    const failures = new Set();
    const checks = [];
    const policy = Object.freeze({
        baseOrigin: binding.sessionOrigin,
        storageStatePath: binding.sessionFile,
        allowedOrigins: binding.allowedOrigins,
        allowedMethods: ALLOWED_METHODS,
        reveal: Object.freeze([...(adapter.reveal || [])]),
        capture: adapter.capture,
        judge: (method, url) => judgeRequest(binding, method, url),
    });
    let session = null;
    try {
        session = await driver.open(policy);
        for (const route of adapter.routes) {
            if (!(binding.expiresAtMs > nowMs())) {
                failures.add(WORKFLOW_REFUSALS.EXPIRED);
                break;
            }
            const page = await session.visit(route.path);
            const final = (() => { try { return new URL(String(page.finalUrl)); } catch { return null; } })();
            const wanted = new URL(route.path, binding.sessionOrigin);
            const routeOk = Boolean(final) && final.origin === wanted.origin && final.pathname === wanted.pathname;
            if (!routeOk) failures.add(final && /^\/(login|unauthorized)/.test(final.pathname) ? WORKFLOW_FAILURES.SIGNED_OUT : WORKFLOW_FAILURES.REDIRECTED);
            checks.push({ ok: routeOk, check: `ui ${adapter.key} route=${route.id} rendered at its own path` });
            const who = String(page.identity || "").toLowerCase();
            const whoOk = who === binding.expectedIdentity;
            if (!whoOk) failures.add(who ? WORKFLOW_FAILURES.WRONG_IDENTITY : WORKFLOW_FAILURES.SIGNED_OUT);
            checks.push({ ok: whoOk, check: `ui ${adapter.key} route=${route.id} signed in as persona=${binding.persona}` });
            const requests = Array.isArray(page.requests) ? page.requests : null;
            if (!requests) {
                failures.add(WORKFLOW_FAILURES.DRIVER);
                checks.push({ ok: false, check: `ui ${adapter.key} route=${route.id} request log absent` });
            } else {
                const bad = requests.map((r) => judgeRequest(binding, r?.method, r?.url)).filter((v) => !v.ok);
                for (const v of bad) failures.add(v.failure);
                const writes = bad.filter((v) => v.failure === WORKFLOW_FAILURES.MUTATION).length;
                const foreign = bad.filter((v) => v.failure === WORKFLOW_FAILURES.OUTBOUND).length;
                checks.push({ ok: bad.length === 0, check: `ui ${adapter.key} route=${route.id} requests=${requests.length} writes=${writes} foreign=${foreign}` });
                /* Which origins were refused (origin + class only), at most three, so a failure names its cause. */
                if (foreign) {
                    const seen = new Map();
                    for (const r of requests) {
                        if (judgeRequest(binding, r?.method, r?.url).failure !== WORKFLOW_FAILURES.OUTBOUND) continue;
                        const f = foreignOriginOf(binding, r?.url);
                        const k = `${f.origin} class=${f.class}`;
                        seen.set(k, (seen.get(k) || 0) + 1);
                    }
                    for (const [k, n] of [...seen].slice(0, 3)) checks.push({ ok: false, check: `ui ${adapter.key} route=${route.id} foreign origin=${k} count=${n}` });
                    if (seen.size > 3) checks.push({ ok: false, check: `ui ${adapter.key} route=${route.id} foreign origins_more=${seen.size - 3}` });
                }
            }
            let asserted;
            try {
                asserted = adapter.assert(route.id, page.snapshot ?? {}, context);
            } catch {
                asserted = [{ ok: false, check: `ui ${adapter.key} route=${route.id} assertion threw` }];
            }
            for (const c of Array.isArray(asserted) ? asserted : []) {
                checks.push({ ok: c?.ok === true, check: String(c?.check || "unnamed assertion").slice(0, 200) });
                if (c?.ok !== true) failures.add(WORKFLOW_FAILURES.ASSERTION);
            }
            if (!Array.isArray(asserted) || !asserted.length) failures.add(WORKFLOW_FAILURES.ASSERTION);
            /* On a failed assertion, how much the page actually rendered for each capture: counts, never content. */
            if (!Array.isArray(asserted) || !asserted.length || asserted.some((c) => c?.ok !== true)) {
                const snap = page.snapshot && typeof page.snapshot === "object" ? page.snapshot : {};
                for (const c of adapter.capture || []) {
                    const v = snap[c.name];
                    checks.push({ ok: false, check: `ui ${adapter.key} route=${route.id} captured ${c.name}=${Array.isArray(v) ? v.length : "absent"}` });
                }
            }
        }
    } catch {
        failures.add(WORKFLOW_FAILURES.DRIVER);
        checks.push({ ok: false, check: `ui ${adapter.key} driver failed` });
    } finally {
        try {
            await session?.close?.();
        } catch {
            /* closing is best-effort; the verdict already stands */
        }
    }
    return out({ ok: failures.size === 0 && checks.length > 0 && checks.every((c) => c.ok), failures: [...failures].sort(), checks });
}

/** Lines in the executor's contract: one per check, then one summary. */
export function workflowVerificationLines(result) {
    const lines = result.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.check}`);
    if (result.refusal) lines.push(`✗ ui ${result.adapter ?? "?"} refused: ${result.refusal}`);
    lines.push(`ui verification adapter=${result.adapter ?? "?"} ok=${result.ok}${result.failures.length ? ` failures=${result.failures.join(",")}` : ""}`);
    return lines;
}
