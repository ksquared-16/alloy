/**
 * THE canonical public origin for every externally delivered Alloy URL.
 *
 * WHY THIS IS AN AUTHORITY AND NOT A HELPER
 *
 * A recipient-facing link is built as an absolute string by whichever runtime happens to
 * author it, and then persisted as message text. Nothing downstream re-derives it. So the
 * origin in a parent's inbox is decided by the runtime that COMPOSED the message, not by
 * the runtime that DELIVERED it — and those are not the same machine.
 *
 * That is not hypothetical. Managed agent slots run at `http://localhost:301X` while
 * pointing at the same database hosted staging reads, so a link authored in a slot is a
 * `localhost` link sitting in staging's tables, indistinguishable from a real one. An
 * operator on staging then sends it and the family receives a URL that resolves to their
 * own machine.
 *
 * Two rules follow, and both are enforced here rather than at each call site:
 *
 *   1. ONE origin per runtime, from configuration — never from a request header, never
 *      from `window.location`, never from whichever browser happened to click send. A
 *      recipient's link must not be a function of the operator's address bar.
 *   2. A hosted runtime must FAIL CLOSED rather than emit a loopback or malformed origin.
 *      Sending an unusable link is worse than refusing to send: the refusal is visible and
 *      recoverable, the bad link is neither.
 *
 * Precedence (unchanged):
 * 1. NEXT_PUBLIC_APP_URL — set per environment to the branded domain.
 * 2. APP_CANONICAL_URL or ALLOY_PUBLIC_APP_URL — server-only fallbacks.
 * 3. VERCEL_PROJECT_PRODUCTION_URL — production hostname (avoids *.vercel.app in links).
 * 4. VERCEL_URL — last resort (preview deployment host).
 */

export type PublicRuntimeClass =
    /** Vercel production deployment. */
    | "production"
    /** Vercel preview/staging deployment. Hosted, and therefore held to the same rules. */
    | "hosted_preview"
    /** A managed agent slot (`ALLOY_AGENT_ENV`). Loopback is the CORRECT answer here. */
    | "local_agent"
    /** Anything else: developer machine, certification stack, test runner. */
    | "local";

export type PublicOriginFailureCode =
    | "missing"
    | "malformed"
    | "insecure_hosted_origin"
    | "loopback_in_hosted_runtime";

export type PublicOriginDecision =
    | { ok: true; origin: string; runtime: PublicRuntimeClass }
    | {
          ok: false;
          code: PublicOriginFailureCode;
          runtime: PublicRuntimeClass;
          /** What configuration actually said, so the failure names its own cause. */
          configured: string;
          message: string;
      };

type Env = Record<string, string | undefined>;

function trimEnv(v: string | undefined | null): string {
    return v != null ? String(v).trim() : "";
}

/**
 * Loopback is a property of the HOST, not of the string "localhost". `[::1]`,
 * `127.0.0.53`, and `*.localhost` (RFC 6761) all resolve to the local machine and all
 * produce a link a recipient cannot open.
 */
export function isLoopbackHost(hostname: string): boolean {
    const h = String(hostname ?? "")
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
    if (!h) return false;
    if (h === "localhost" || h.endsWith(".localhost")) return true;
    if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
    if (h === "0.0.0.0") return true;
    return /^127\./.test(h);
}

/**
 * Which runtime is this, for the purpose of deciding whether loopback is legitimate?
 *
 * A Vercel PREVIEW is hosted. It has real recipients and a real domain, so it is held to
 * the production rule — treating preview as "not really deployed" is exactly how a
 * localhost link reaches a family.
 */
export function classifyPublicRuntime(env: Env = process.env as Env): PublicRuntimeClass {
    const vercelEnv = trimEnv(env.VERCEL_ENV).toLowerCase();
    if (vercelEnv === "production") return "production";
    if (vercelEnv || trimEnv(env.VERCEL) === "1") return "hosted_preview";
    if (trimEnv(env.ALLOY_AGENT_ENV)) return "local_agent";
    return "local";
}

export function isHostedRuntime(runtime: PublicRuntimeClass): boolean {
    return runtime === "production" || runtime === "hosted_preview";
}

/**
 * Is this runtime writing into a DEPLOYED database rather than a disposable local stack?
 *
 * This matters more than it looks. Dispatch is a separate worker polling
 * `communication_messages` for `status in (queued, deferred)`; it has no idea which
 * runtime inserted a row. So a managed agent slot pointed at the shared deployed project
 * can enqueue a row that a hosted dispatcher then really sends, to a real family. For the
 * purpose of "can this link reach someone", the DATABASE decides, not the process.
 *
 * A census of the deployed project found eight delivered/sent bodies carrying loopback
 * links, minted on ports 3014 and 3015 — slots, not hosted runtimes.
 */
export function isDeployedDatabaseTarget(env: Env = process.env as Env): boolean {
    const raw = trimEnv(env.NEXT_PUBLIC_SUPABASE_URL) || trimEnv(env.SUPABASE_URL);
    if (!raw) return false;
    try {
        return !isLoopbackHost(new URL(raw).hostname);
    } catch {
        return false;
    }
}

function configuredOriginRaw(env: Env): string {
    const fromEnv =
        trimEnv(env.NEXT_PUBLIC_APP_URL) ||
        trimEnv(env.APP_CANONICAL_URL) ||
        trimEnv(env.ALLOY_PUBLIC_APP_URL);
    if (fromEnv) return fromEnv;

    const prodHost = trimEnv(env.VERCEL_PROJECT_PRODUCTION_URL);
    if (prodHost) {
        const host = prodHost.replace(/^https?:\/\//i, "").split("/")[0] ?? prodHost;
        return `https://${host}`;
    }

    const vercel = trimEnv(env.VERCEL_URL);
    if (vercel) return `https://${vercel.replace(/^https?:\/\//i, "").split("/")[0]}`;

    return "";
}

/**
 * Resolve the public origin, or say precisely why it cannot be resolved.
 *
 * The failure is a VALUE, not an empty string. An empty string is what let callers build
 * `/a/CODE` with no origin and hand it to an SMS provider.
 */
export type ResolvePublicAppOriginOptions = {
    /**
     * Hold the origin to the DELIVERABLE standard (no loopback, https) even when the
     * process itself is local.
     *
     * Defaults to whether this runtime is hosted. The outbound seam overrides it, because
     * a local slot writing into the deployed database produces links a real recipient will
     * receive — and `http://localhost:3013` is not an answer for them.
     */
    deliveryIsHosted?: boolean;
};

export function resolvePublicAppOrigin(
    env: Env = process.env as Env,
    options: ResolvePublicAppOriginOptions = {},
): PublicOriginDecision {
    const runtime = classifyPublicRuntime(env);
    const configured = configuredOriginRaw(env);
    const hosted = options.deliveryIsHosted ?? isHostedRuntime(runtime);

    if (!configured) {
        return {
            ok: false,
            code: "missing",
            runtime,
            configured: "",
            message:
                "No public application origin is configured (NEXT_PUBLIC_APP_URL). Externally delivered links cannot be built.",
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(configured);
    } catch {
        return {
            ok: false,
            code: "malformed",
            runtime,
            configured,
            message: `The configured public application origin is not a valid URL: ${configured}`,
        };
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return {
            ok: false,
            code: "malformed",
            runtime,
            configured,
            message: `The configured public application origin must be http or https: ${configured}`,
        };
    }
    if (!parsed.hostname) {
        return {
            ok: false,
            code: "malformed",
            runtime,
            configured,
            message: `The configured public application origin has no host: ${configured}`,
        };
    }

    if (hosted && isLoopbackHost(parsed.hostname)) {
        return {
            ok: false,
            code: "loopback_in_hosted_runtime",
            runtime,
            configured,
            message: `A deliverable link cannot use a loopback origin. The configured public application origin is ${configured}.`,
        };
    }
    if (hosted && parsed.protocol !== "https:") {
        return {
            ok: false,
            code: "insecure_hosted_origin",
            runtime,
            configured,
            message: `A deliverable link must use https. The configured public application origin is ${configured}.`,
        };
    }

    // Normalize to a true origin: scheme + host + port. A path here would be silently
    // duplicated into every link.
    return { ok: true, origin: parsed.origin, runtime };
}

/**
 * Canonical public origin, or `""` when it cannot be resolved.
 *
 * Retained for callers that legitimately degrade (an internal admin convenience link).
 * Anything that produces a RECIPIENT-facing URL must use {@link resolvePublicAppOrigin}
 * and surface the failure instead.
 */
export function getPublicAppOrigin(env: Env = process.env as Env): string {
    const decision = resolvePublicAppOrigin(env);
    return decision.ok ? decision.origin : "";
}

export class PublicOriginUnavailableError extends Error {
    readonly code: PublicOriginFailureCode;
    readonly runtime: PublicRuntimeClass;
    constructor(decision: Extract<PublicOriginDecision, { ok: false }>) {
        super(decision.message);
        this.name = "PublicOriginUnavailableError";
        this.code = decision.code;
        this.runtime = decision.runtime;
    }
}

/** Canonical public origin, or throw. For paths where there is no sane degraded answer. */
export function requirePublicAppOrigin(env: Env = process.env as Env): string {
    const decision = resolvePublicAppOrigin(env);
    if (!decision.ok) throw new PublicOriginUnavailableError(decision);
    return decision.origin;
}

/** Operator-facing sentence for a failed resolution. Never leaks the configured value. */
export const PUBLIC_ORIGIN_OPERATOR_MESSAGE: Record<PublicOriginFailureCode, string> = {
    missing: "This message cannot be sent until the public site address is configured.",
    malformed: "This message cannot be sent: the configured public site address is not a valid URL.",
    insecure_hosted_origin:
        "This message cannot be sent: the configured public site address is not secure (https).",
    loopback_in_hosted_runtime:
        "This message cannot be sent: the configured public site address points at localhost, which no recipient can open.",
};

const ABSOLUTE_URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;

/** Every absolute URL in `text` whose host is loopback — i.e. undeliverable to a recipient. */
export function findLoopbackUrls(text: string): string[] {
    const out: string[] = [];
    for (const match of String(text ?? "").matchAll(ABSOLUTE_URL_RE)) {
        const raw = match[0];
        try {
            if (isLoopbackHost(new URL(raw).hostname)) out.push(raw);
        } catch {
            // Not parseable as a URL; it is not a link we can reason about.
        }
    }
    return out;
}

/**
 * Re-anchor loopback-origin URLs onto `origin`, preserving path, query and fragment.
 *
 * This is what repairs a link authored by a DIFFERENT runtime. It deliberately rewrites
 * only loopback origins: a genuine third-party URL an operator typed is left alone,
 * because re-hosting someone else's domain onto ours would be a far worse defect than the
 * one being fixed.
 */
export function rehostLoopbackUrls(text: string, origin: string): string {
    const base = String(origin ?? "").replace(/\/+$/, "");
    if (!base) return String(text ?? "");
    return String(text ?? "").replace(ABSOLUTE_URL_RE, (raw) => {
        let parsed: URL;
        try {
            parsed = new URL(raw);
        } catch {
            return raw;
        }
        if (!isLoopbackHost(parsed.hostname)) return raw;
        return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
    });
}
