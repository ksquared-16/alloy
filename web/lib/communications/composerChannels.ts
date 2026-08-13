/** Card 12 — derive which outbound channels appear in composer from binding rows (no secrets). */

export type BindingSummary = {
    id: string;
    channel: string;
    provider?: string | null;
    scope?: string | null;
    location_id?: string | null;
    display_label?: string | null;
    status?: string | null;
    is_primary?: boolean | null;
    secret_ref?: string | null;
    config?: Record<string, unknown> | null;
    inbound_to_e164?: string | null;
};

function isSmsBindingReady(b: BindingSummary): boolean {
    if ((b.channel || "").toLowerCase() !== "sms") return false;
    const prov = String(b.provider ?? "").toLowerCase();
    if (prov !== "twilio") return false;
    const ref = String(b.secret_ref ?? "").trim().toLowerCase();
    if (ref === "unconfigured" || ref === "") return false;
    return true;
}

function isEmailBindingReady(b: BindingSummary): boolean {
    if ((b.channel || "").toLowerCase() !== "email") return false;
    const prov = String(b.provider ?? "").toLowerCase();
    if (prov !== "resend") return false;
    const ref = String(b.secret_ref ?? "").trim().toLowerCase();
    // Empty counts as unconfigured, exactly as it does for SMS above. Both mean
    // "nothing for `resolve_secret_plaintext` to resolve", so an empty ref would
    // offer the operator a channel that fails at send time. The column is
    // NOT NULL DEFAULT 'unconfigured', so only a runbook can produce this state —
    // which is precisely why the gate should not depend on it never happening.
    if (ref === "" || ref === "unconfigured") return false;
    return true;
}

/**
 * True when this binding row is counted toward outbound email/SMS in {@link availableComposerChannels}
 * (active + channel-specific credential rules — same as send route / drawer).
 */
export function bindingEligibleForOutboundComposer(b: BindingSummary): boolean {
    if ((b.status || "").toLowerCase() !== "active") return false;
    return isSmsBindingReady(b) || isEmailBindingReady(b);
}

/** Distinct channels user may pick; in_app always available (internal queue / no provider). */
export function availableComposerChannels(bindings: BindingSummary[]): ("sms" | "email" | "in_app")[] {
    const out = new Set<"sms" | "email" | "in_app">();
    out.add("in_app");
    for (const b of bindings) {
        if ((b.status || "").toLowerCase() !== "active") continue;
        if (isSmsBindingReady(b)) out.add("sms");
        if (isEmailBindingReady(b)) out.add("email");
    }
    return Array.from(out);
}

/** Provider-backed channels only — in-app has no binding row selector. */
export function activeOutboundBindings(bindings: BindingSummary[], channel: string): BindingSummary[] {
    const ch = channel.toLowerCase();
    if (ch === "in_app") return [];
    return bindings.filter(
        (b) =>
            (b.status || "").toLowerCase() === "active" &&
            (b.channel || "").toLowerCase() === ch &&
            (ch === "sms" ? isSmsBindingReady(b) : ch === "email" ? isEmailBindingReady(b) : false)
    );
}
