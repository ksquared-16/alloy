/**
 * Firefly staging seed — the designated targets, and every refusal in front of them (ALY-14 E2).
 *
 * The seed writes to exactly two kinds of database, both named here and nowhere else:
 *
 *   local    the shared local Supabase stack (`alloy-stack use`), reached on loopback only.
 *   staging  the staging Supabase project, identified by its project ref — never by a label.
 *
 * Production is unreachable: its project ref anywhere in the connection string is a refusal, and any
 * host that is neither loopback nor the staging project is a refusal. A staging apply additionally
 * requires `ALLOY_ENVIRONMENT=staging` (the same declaration the ALY-14 outbound guard reads) and the
 * operator re-typing the staging project ref, so a pasted URL alone can never start a write.
 *
 * Pure: no I/O, no environment reads. The CLI passes everything in.
 */

import { QA_HOSTED_PROJECT_REF, QA_PRODUCTION_PROJECT_REF } from "@/lib/qa/sharedQaRegistry";

export const STAGING_PROJECT_REF = QA_HOSTED_PROJECT_REF;
export const PRODUCTION_PROJECT_REF = QA_PRODUCTION_PROJECT_REF;

export const SEED_TARGET_KEYS = ["local", "staging"] as const;
export type SeedTargetKey = (typeof SEED_TARGET_KEYS)[number];

/** The shared local stack (`alloy-cert`, certification/supabase/config.toml [db] port). */
export const LOCAL_STACK_DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
/** Its database container, whose own psql is used when the host has none (as certification/alloy-certify does). */
export const LOCAL_STACK_DB_CONTAINER = "supabase_db_alloy-cert";

export type SeedTargetRequest = {
    target: string | null | undefined;
    databaseUrl: string | null | undefined;
    /** What the operator re-typed with --confirm-project-ref. Required for staging. */
    confirmProjectRef?: string | null;
    /** process.env.ALLOY_ENVIRONMENT, passed in. Required to be `staging` for staging. */
    alloyEnvironment?: string | null;
};

export type SeedTargetRefusal = { ok: false; code: string; detail: string };
export type ResolvedSeedTarget = {
    ok: true;
    target: SeedTargetKey;
    databaseUrl: string;
    /** host as parsed — for the operator-facing plan, never the password. */
    host: string;
    projectRef: string | null;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function refuse(code: string, detail: string): SeedTargetRefusal {
    return { ok: false, code, detail };
}

/**
 * The project ref a Supabase connection string names, from either shape:
 *   direct  db.<ref>.supabase.co
 *   pooler  user `postgres.<ref>` @ <region>.pooler.supabase.com
 */
export function supabaseProjectRefOf(url: URL): string | null {
    const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
    if (direct) return direct[1].toLowerCase();
    if (/\.pooler\.supabase\.com$/i.test(url.hostname)) {
        const user = decodeURIComponent(url.username);
        const pooled = /^[^.]+\.([a-z0-9]{20})$/i.exec(user);
        if (pooled) return pooled[1].toLowerCase();
    }
    return null;
}

export function resolveSeedTarget(req: SeedTargetRequest): ResolvedSeedTarget | SeedTargetRefusal {
    const target = String(req.target ?? "").trim();
    if (!target) return refuse("target_required", "name the target: --target local | --target staging");
    if (!(SEED_TARGET_KEYS as readonly string[]).includes(target)) {
        return refuse("unknown_target", `"${target}" is not a designated seed target (local, staging)`);
    }

    const raw = String(req.databaseUrl ?? "").trim() || (target === "local" ? LOCAL_STACK_DEFAULT_DATABASE_URL : "");
    if (!raw) {
        return refuse("database_url_required", "staging needs FIREFLY_STAGING_SEED_DATABASE_URL; it has no default");
    }
    // Checked on the raw text before parsing, so no encoding or URL shape can smuggle it past.
    if (raw.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
        return refuse("production_refused", "the production project is never a seed target");
    }

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return refuse("database_url_malformed", "the database URL does not parse");
    }
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
        return refuse("database_url_malformed", "the database URL is not postgresql://");
    }

    const host = url.hostname.toLowerCase();
    const projectRef = supabaseProjectRefOf(url);

    if (target === "local") {
        if (!LOOPBACK_HOSTS.has(host)) {
            return refuse("local_not_loopback", `target local must be a loopback host, got ${host}`);
        }
        return { ok: true, target: "local", databaseUrl: raw, host, projectRef: null };
    }

    // target === "staging"
    if (projectRef !== STAGING_PROJECT_REF) {
        return refuse(
            "wrong_project",
            `target staging must be project ${STAGING_PROJECT_REF}, the URL names ${projectRef ?? `host ${host}`}`,
        );
    }
    const env = String(req.alloyEnvironment ?? "").trim().toLowerCase();
    if (env !== "staging") {
        return refuse(
            "environment_not_declared",
            `target staging requires ALLOY_ENVIRONMENT=staging, got ${env ? `"${env}"` : "nothing"}`,
        );
    }
    const confirmed = String(req.confirmProjectRef ?? "").trim().toLowerCase();
    if (confirmed !== STAGING_PROJECT_REF) {
        return refuse(
            "confirmation_required",
            `re-type the staging project ref: --confirm-project-ref ${STAGING_PROJECT_REF}`,
        );
    }
    return { ok: true, target: "staging", databaseUrl: raw, host, projectRef };
}

/** The URL with its password masked, for anything printed. */
export function redactDatabaseUrl(raw: string): string {
    try {
        const url = new URL(raw);
        if (url.password) url.password = "***";
        return url.toString();
    } catch {
        return "<unparseable>";
    }
}
