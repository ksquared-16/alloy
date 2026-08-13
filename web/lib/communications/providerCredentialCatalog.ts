/**
 * Which credentials an admin may CONNECT a channel to — and, just as importantly,
 * which they may not.
 *
 * The rule the create flow exists to enforce: **an operator chooses a credential
 * that the deployment already provisioned; they never supply one.** No API key is
 * ever accepted over the wire, so no API key can be stored, logged, echoed back,
 * or leaked by a validation error. What the operator picks is an opaque catalogue
 * KEY; the server alone knows the `secret_ref` behind it.
 *
 * Three consequences worth stating, because each is a decision rather than an
 * implementation detail:
 *
 * 1. **The catalogue is an ALLOW-LIST, not a lookup.** Accepting an arbitrary
 *    `env:VAR_NAME` from a client would turn this route into an environment
 *    oracle — probe a name, read `available`, learn what the deployment holds.
 *    Only names declared here are ever consulted.
 *
 * 2. **`available` is a presence probe and nothing else.** It reports whether a
 *    provisioned credential exists. It never carries a length, a prefix, a
 *    fingerprint, or any other function of the value.
 *
 * 3. **The catalogue key is what crosses the boundary, not `secret_ref`.** The
 *    bindings contract has always refused to emit `secret_ref`; an edit flow
 *    still needs to show which credential is bound. A stable opaque key satisfies
 *    both, and keeps the environment variable NAME server-side too.
 *
 * Pure: every function decides from the arguments it is given, so the boundary is
 * testable without a process environment.
 */

export type CredentialEnv = Record<string, string | undefined>;

export type ProviderCredentialOption = {
    /** Opaque, stable identifier — the only credential token a client ever sees. */
    key: string;
    channel: "sms" | "email";
    provider: string;
    label: string;
    /** What an operator needs to know to choose correctly. Never describes the value. */
    description: string;
    /**
     * The stored `secret_ref`. Server-side only — {@link publicCredentialOption}
     * strips it before anything is serialized.
     */
    secretRef: string;
    /** Which env name decides availability. Server-side only; `null` = always present. */
    envVar: string | null;
    /** Can this connection reach a real provider? See PublicCredentialOption. */
    externalSendCapable: boolean;
};

/** The client-facing shape: no `secret_ref`, no environment variable name. */
export type PublicCredentialOption = {
    key: string;
    channel: "sms" | "email";
    provider: string;
    /** Product name of the CONNECTION, e.g. "Firefly Resend". Never infra vocabulary. */
    label: string;
    description: string;
    /** True when the deployment has provisioned this credential. Presence only. */
    available: boolean;
    /**
     * Whether choosing this connection makes REAL EXTERNAL DELIVERY possible.
     *
     * The question an administrator actually needs answered before clicking
     * Connect: "could this send a message to a real person?" A certification
     * connection resolves to no secret at all and is structurally unable to
     * authenticate, so it is `false`. A deployment connection backed by a real
     * provisioned key is `true`.
     */
    externalSendCapable: boolean;
};

/**
 * Every credential a binding may reference, grounded in what the deployment and
 * the certified runtimes actually resolve — not in what the `secret_ref` grammar
 * could express. Adding a provider is a deliberate edit here plus a runtime that
 * can execute it; there is no dynamic discovery on purpose.
 */
const CATALOG: readonly ProviderCredentialOption[] = [
    {
        key: "resend_deployment_key",
        channel: "email",
        provider: "resend",
        label: "Resend — this deployment's connection",
        description:
            "The Resend account this Alloy deployment is configured with. Sends real email and retrieves real replies.",
        secretRef: "env:RESEND_API_KEY",
        envVar: "RESEND_API_KEY",
        externalSendCapable: true,
    },
    {
        key: "twilio_deployment_token",
        channel: "sms",
        provider: "twilio",
        label: "Twilio — this deployment's connection",
        description:
            "The Twilio account this Alloy deployment is configured with. Sends real texts and receives real replies.",
        secretRef: "env:TWILIO_AUTH_TOKEN",
        envVar: "TWILIO_AUTH_TOKEN",
        externalSendCapable: true,
    },
    {
        key: "twilio_legacy_global",
        channel: "sms",
        provider: "twilio",
        label: "Twilio — shared platform account (legacy)",
        description:
            "The shared Twilio account retained for migrated organizations. Sends real texts. Prefer this deployment's own connection for anything new.",
        secretRef: "legacy_global_twilio",
        envVar: "TWILIO_AUTH_TOKEN",
        externalSendCapable: true,
    },
];

/** `secret_ref` for a binding an operator has not yet connected to a credential. */
export const UNCONFIGURED_SECRET_REF = "unconfigured";

/**
 * The certification-only credential.
 *
 * WHY THIS EXISTS. The certification environment deliberately holds no provider
 * credentials — that absence is what guarantees no certification run can send
 * anything — which left the SUCCESSFUL connect path uncertifiable: every option
 * was correctly unavailable, so only the fail-closed half could be proven.
 *
 * WHY IT IS SAFE, structurally rather than by policy:
 *
 *  1. It is offered ONLY when `ALLOY_CERTIFICATION=1`. In every other deployment
 *     it is not in the catalogue at all, so it cannot be selected, and
 *     `selectCredential` refuses it as an unknown key.
 *  2. Its `secret_ref` is `certification_synthetic` — deliberately NOT an
 *     `env:` reference and not a known sentinel. Both resolvers
 *     (`resolve_secret_plaintext` in Python, `resolveTwilioAuthTokenFromSecretRef`
 *     in TypeScript) treat an unknown convention as "no secret", so it cannot
 *     authenticate to Resend or Twilio even if a key were present in the
 *     environment. It is not a fake key; it is the absence of one, named.
 *  3. It carries no value of any kind, so there is nothing to leak.
 *
 * This is the "certification-only approved synthetic catalogue entry" option, and
 * it does not weaken the no-credentials posture: certification still cannot send.
 * It certifies that CONNECT works — a binding is created, projected, and becomes
 * resolvable — which is exactly the gap, and no more than that.
 */
export const CERTIFICATION_SECRET_REF = "certification_synthetic";
/** Per-channel refs. One shared ref would make `credentialKeyForSecretRef`
 *  ambiguous — it would resolve an SMS binding to the email entry. */
export const CERTIFICATION_SECRET_REF_EMAIL = "certification_synthetic_email";
export const CERTIFICATION_SECRET_REF_SMS = "certification_synthetic_sms";

/** True only in a certification run. */
function certificationEnabled(env: CredentialEnv): boolean {
    return String(env.ALLOY_CERTIFICATION ?? "").trim() === "1";
}

const CERTIFICATION_CATALOG: readonly ProviderCredentialOption[] = [
    {
        key: "certification_email",
        channel: "email",
        provider: "resend",
        label: "Certification connection (cannot send externally)",
        description:
            "Certification only. Nothing can leave this environment — it resolves to no credential at all.",
        secretRef: CERTIFICATION_SECRET_REF_EMAIL,
        envVar: null,
        externalSendCapable: false,
    },
    {
        key: "certification_sms",
        channel: "sms",
        provider: "twilio",
        label: "Certification connection (cannot send externally)",
        description:
            "Certification only. Nothing can leave this environment — it resolves to no credential at all.",
        secretRef: CERTIFICATION_SECRET_REF_SMS,
        envVar: null,
        externalSendCapable: false,
    },
];

/** The catalogue for this deployment. Certification entries exist nowhere else. */
function catalogFor(env: CredentialEnv): readonly ProviderCredentialOption[] {
    return certificationEnabled(env) ? [...CATALOG, ...CERTIFICATION_CATALOG] : CATALOG;
}

/** Channels the create flow can connect. `in_app` needs no provider and no binding row. */
export const CONNECTABLE_CHANNELS = ["email", "sms"] as const;
export type ConnectableChannel = (typeof CONNECTABLE_CHANNELS)[number];

export function isConnectableChannel(value: unknown): value is ConnectableChannel {
    return typeof value === "string" && (CONNECTABLE_CHANNELS as readonly string[]).includes(value.trim().toLowerCase());
}

function credentialAvailable(option: ProviderCredentialOption, env: CredentialEnv): boolean {
    if (option.envVar === null) return true;
    return (env[option.envVar] ?? "").trim().length > 0;
}

/** Strip everything the client must not learn. The single serialization seam. */
export function publicCredentialOption(
    option: ProviderCredentialOption,
    env: CredentialEnv,
): PublicCredentialOption {
    return {
        key: option.key,
        channel: option.channel,
        provider: option.provider,
        label: option.label,
        description: option.description,
        available: credentialAvailable(option, env),
        externalSendCapable: option.externalSendCapable,
    };
}

/** The whole catalogue, client-safe. Unavailable options are still listed — an
 *  operator learns *what to provision*, rather than facing an empty menu. */
export function listCredentialOptions(env: CredentialEnv): PublicCredentialOption[] {
    return catalogFor(env).map((o) => publicCredentialOption(o, env));
}

export function credentialOptionsForChannel(
    channel: string,
    env: CredentialEnv,
): PublicCredentialOption[] {
    const ch = channel.trim().toLowerCase();
    return catalogFor(env).filter((o) => o.channel === ch).map((o) => publicCredentialOption(o, env));
}

/** Server-side lookup by catalogue key. `null` for anything not allow-listed. */
export function findCredentialOption(key: unknown, env: CredentialEnv = {}): ProviderCredentialOption | null {
    if (typeof key !== "string") return null;
    const k = key.trim();
    if (!k) return null;
    return catalogFor(env).find((o) => o.key === k) ?? null;
}

/**
 * Reverse direction: which catalogue key does a STORED `secret_ref` correspond to?
 *
 * Returns `null` for `unconfigured`, and for any ref written before this catalogue
 * existed or by a runbook that bypassed it. A null key means "connected to
 * something the UI does not manage" — which the surface must say plainly rather
 * than silently rendering as unconfigured.
 */
export function credentialKeyForSecretRef(secretRef: string | null | undefined): string | null {
    const ref = (secretRef ?? "").trim();
    if (!ref || ref === UNCONFIGURED_SECRET_REF) return null;
    return [...CATALOG, ...CERTIFICATION_CATALOG].find((o) => o.secretRef === ref)?.key ?? null;
}

export type CredentialSelection =
    | { ok: true; option: ProviderCredentialOption }
    | { ok: false; reason: "unknown_credential" | "channel_mismatch" | "not_provisioned"; message: string };

/**
 * Validate an operator's credential choice for a channel.
 *
 * `not_provisioned` is refused rather than stored: binding a channel to a
 * credential the deployment does not hold produces a row that looks connected and
 * fails at send time. Configuration must not be able to claim a readiness the
 * runtime cannot honour.
 */
export function selectCredential(params: {
    channel: string;
    credentialKey: unknown;
    env: CredentialEnv;
}): CredentialSelection {
    const option = findCredentialOption(params.credentialKey, params.env);
    if (!option) {
        return {
            ok: false,
            reason: "unknown_credential",
            message: "Choose one of the credentials provisioned for this deployment.",
        };
    }
    if (option.channel !== params.channel.trim().toLowerCase()) {
        return {
            ok: false,
            reason: "channel_mismatch",
            message: `${option.label} cannot be used for the ${params.channel} channel.`,
        };
    }
    if (!credentialAvailable(option, params.env)) {
        return {
            ok: false,
            reason: "not_provisioned",
            message: `${option.label} is not provisioned for this deployment yet. It must be configured in the deployment before a channel can use it.`,
        };
    }
    return { ok: true, option };
}

/**
 * Field names that would mean a client is trying to supply a secret directly.
 *
 * Refusing these by NAME — before any value is read — is what makes "no API key
 * ever crosses the wire" checkable rather than aspirational. A request carrying
 * `api_key` is rejected whole; the value is never inspected, so it is never in a
 * position to be echoed into an error message or a log line.
 */
const FORBIDDEN_SECRET_FIELDS = [
    "secret",
    "secret_ref",
    "secretref",
    "api_key",
    "apikey",
    "auth_token",
    "authtoken",
    "token",
    "password",
    "credential",
    "credentials",
    "key",
];

export type SecretBoundaryViolation = { field: string; message: string };

/** `null` when the body is clean. Checks keys only — never values. */
export function detectSecretBoundaryViolation(body: Record<string, unknown>): SecretBoundaryViolation | null {
    for (const field of Object.keys(body)) {
        if (FORBIDDEN_SECRET_FIELDS.includes(field.trim().toLowerCase())) {
            return {
                field,
                message:
                    "Credentials are provisioned by the deployment and selected by reference. Remove this field and choose a credential instead.",
            };
        }
    }
    return null;
}
