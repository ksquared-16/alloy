// P3 — resolve the Twilio auth token used to VERIFY a status callback, per binding.
// Mirrors backend secret_ref.py conventions. Pure (env + values in, token out) — unit-testable.

export type SecretEnv = Record<string, string | undefined>;

/**
 * Resolve the verification token from a binding's secret_ref.
 * - "" / "unconfigured" / "legacy_global_twilio" / unknown  -> global token (sandbox + legacy).
 * - "env:VAR_NAME" -> env[VAR_NAME] (trimmed); falls back to global token when the env var is unset.
 * Never treats the secret_ref itself as a literal secret.
 */
export function resolveTwilioAuthTokenFromSecretRef(
    secretRef: string | null | undefined,
    env: SecretEnv,
    globalToken: string | null | undefined,
): string | null {
    const global = (globalToken ?? "").trim() || null;
    const ref = (secretRef ?? "").trim();
    if (!ref || ref === "unconfigured" || ref === "legacy_global_twilio") return global;
    if (ref.startsWith("env:")) {
        const key = ref.slice(4).trim();
        if (!key) return global;
        const val = (env[key] ?? "").trim();
        return val || global;
    }
    return global; // unknown convention
}
