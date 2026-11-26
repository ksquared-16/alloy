/**
 * Where a tenant operator command may write (briefing M5, M8; step 16).
 *
 * The production commands (`tenantCreate.ts`, `tenantConfigImport.ts`) write through the Supabase data API with a
 * service-role key, so the app's own constraints, triggers and RPCs run exactly as they do for the app. Their target
 * comes only from explicit arguments: `--target`, `--supabase-url` and, for production, `--project-ref` re-typed by
 * the operator. No `.env` file is read, and no `SUPABASE_*` variable the app itself uses is consulted, so a session
 * with a dev or staging environment loaded cannot be aimed anywhere by accident. The key is the one credential, and
 * it comes from `ALLOY_OPERATOR_SERVICE_ROLE_KEY` (never argv, which a transcript or `ps` would show).
 *
 *   local       a loopback URL (a throwaway local stack). No project ref.
 *   production  exactly https://<ref>.supabase.co, the ref re-typed with --project-ref, ALLOY_ENVIRONMENT=production.
 *               Never staging, and never the previous production project, which D2 leaves untouched.
 *
 * Pure: no I/O, no environment reads. The CLIs pass everything in.
 */

import { QA_HOSTED_PROJECT_REF, QA_PRODUCTION_PROJECT_REF } from "@/lib/qa/sharedQaRegistry";

/** Staging. A tenant command never writes here: staging already holds Firefly, and a second one is a new tenant. */
export const STAGING_PROJECT_REF = QA_HOSTED_PROJECT_REF;
/** The previous production project. D2: not changed in any way; it is the rollback target. */
export const PREVIOUS_PRODUCTION_PROJECT_REF = QA_PRODUCTION_PROJECT_REF;

export const OPERATOR_SERVICE_ROLE_KEY_ENV = "ALLOY_OPERATOR_SERVICE_ROLE_KEY" as const;

export const OPERATOR_TARGETS = ["local", "production"] as const;
export type OperatorTargetKey = (typeof OPERATOR_TARGETS)[number];

export type OperatorTargetRequest = {
    target: string | null | undefined;
    supabaseUrl: string | null | undefined;
    /** What the operator re-typed with --project-ref. Required for production, refused for local. */
    projectRef?: string | null;
    /** process.env.ALLOY_ENVIRONMENT, passed in. Must be `production` for production. */
    alloyEnvironment?: string | null;
    /** The service-role key, passed in so its project claim can be checked. Never printed. */
    serviceRoleKey: string | null | undefined;
};

export type OperatorTargetRefusal = { ok: false; code: string; detail: string };
export type ResolvedOperatorTarget = {
    ok: true;
    target: OperatorTargetKey;
    supabaseUrl: string;
    projectRef: string | null;
    serviceRoleKey: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PROJECT_REF = /^[a-z0-9]{20}$/;

function refuse(code: string, detail: string): OperatorTargetRefusal {
    return { ok: false, code, detail };
}

/**
 * The claims of a legacy JWT-shaped service key (`ref`, `role`), or null for an opaque `sb_secret_` key. Decoded
 * only to compare its project with the target; the signature is the server's business.
 */
export function serviceKeyClaims(key: string): { ref: string | null; role: string | null } | null {
    const parts = key.split(".");
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        return {
            ref: typeof payload?.ref === "string" ? payload.ref : null,
            role: typeof payload?.role === "string" ? payload.role : null,
        };
    } catch {
        return null;
    }
}

export function resolveOperatorTarget(req: OperatorTargetRequest): ResolvedOperatorTarget | OperatorTargetRefusal {
    const target = String(req.target ?? "").trim();
    if (!(OPERATOR_TARGETS as readonly string[]).includes(target)) {
        return refuse("target_required", `--target must be one of ${OPERATOR_TARGETS.join(", ")}`);
    }
    const raw = String(req.supabaseUrl ?? "").trim();
    if (!raw) return refuse("supabase_url_required", "--supabase-url is required; it has no default");
    for (const forbidden of [STAGING_PROJECT_REF, PREVIOUS_PRODUCTION_PROJECT_REF]) {
        // On the raw text, before parsing, so no URL shape can carry it past.
        if (raw.toLowerCase().includes(forbidden)) {
            return refuse(
                "forbidden_project",
                forbidden === STAGING_PROJECT_REF
                    ? `the URL names staging (${forbidden}); a tenant command never writes to staging`
                    : `the URL names the previous production project (${forbidden}), which D2 leaves untouched`,
            );
        }
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return refuse("supabase_url_malformed", "--supabase-url does not parse");
    }
    const key = String(req.serviceRoleKey ?? "").trim();
    if (!key) return refuse("service_role_key_required", `${OPERATOR_SERVICE_ROLE_KEY_ENV} is not set`);
    const claims = serviceKeyClaims(key);
    if (claims && claims.role !== "service_role") {
        return refuse("service_role_key_wrong_role", `the key's role is ${claims.role ?? "absent"}, not service_role`);
    }
    const requestedRef = String(req.projectRef ?? "").trim();

    if (target === "local") {
        if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
            return refuse("local_not_loopback", `target local must be a loopback URL, got host ${url.hostname}`);
        }
        if (requestedRef) return refuse("local_takes_no_ref", "target local takes no --project-ref");
        return { ok: true, target: "local", supabaseUrl: url.origin, projectRef: null, serviceRoleKey: key };
    }

    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname.toLowerCase());
    if (url.protocol !== "https:" || !match || (url.pathname !== "/" && url.pathname !== "") || url.search || url.port) {
        return refuse("production_url_shape", "target production must be exactly https://<project-ref>.supabase.co");
    }
    const ref = match[1];
    if (!requestedRef) return refuse("project_ref_required", "target production needs --project-ref, re-typed by the operator");
    if (!PROJECT_REF.test(requestedRef) || requestedRef !== ref) {
        return refuse("project_ref_mismatch", `--project-ref ${requestedRef} does not match the URL's project ${ref}`);
    }
    const env = String(req.alloyEnvironment ?? "").trim().toLowerCase();
    if (env !== "production") {
        return refuse("environment_not_declared", `target production requires ALLOY_ENVIRONMENT=production, got ${env ? `"${env}"` : "nothing"}`);
    }
    if (claims?.ref && claims.ref !== ref) {
        return refuse("service_role_key_other_project", `the service-role key belongs to project ${claims.ref}, not ${ref}`);
    }
    return { ok: true, target: "production", supabaseUrl: url.origin, projectRef: ref, serviceRoleKey: key };
}

/** One line naming the target, for the plan and the log. Never the key. */
export function describeOperatorTarget(t: ResolvedOperatorTarget): string {
    return t.target === "production" ? `production project ${t.projectRef} (${t.supabaseUrl})` : `local ${t.supabaseUrl}`;
}
