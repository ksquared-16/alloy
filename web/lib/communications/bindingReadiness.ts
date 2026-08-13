/**
 * Whether a channel actually works — reported as two answers, never one.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: **send and receive are separate.** A
 * single green check is the failure mode being designed out. An email binding
 * with a credential and no receiving address sends perfectly and silently drops
 * every reply; an operator told "Ready" has been told something false about the
 * half that is broken.
 *
 * The second rule: **readiness is derived from what the runtime would do, never
 * from configuration being present.** Each state below is answerable by pointing
 * at the code path that would run. Where this module says `ready`, the certified
 * runtime accepts the binding — that correspondence is asserted by test against
 * `bindingEligibleForOutboundComposer` and `bindingAcceptsInbound` rather than
 * maintained by hand, because the two drifting apart is exactly how a
 * configuration surface starts lying.
 *
 * Pure: values in, states out.
 */

import { bindingEligibleForOutboundComposer, type BindingSummary } from "./composerChannels";
import { normalizeEmailAddress } from "./email/inboundEmailRouting";

export type ReadinessState =
    /** The runtime will accept this binding for this direction, today. */
    | "ready"
    /** Something an operator can fix here is missing — an address, a credential. */
    | "setup_required"
    /** Configured, but not yet turned on: `pending_verification`, or provider-side
     *  domain verification that Alloy cannot perform on the operator's behalf. */
    | "verification_required"
    /** The operator switched this binding off. Not a fault. */
    | "disabled"
    /** No runtime exists for this provider on this channel. Not fixable by config. */
    | "provider_unavailable";

export type DirectionReadiness = {
    state: ReadinessState;
    /** One operator-facing sentence. Says what is true, and what to do about it. */
    detail: string;
};

/**
 * Whether the credential this channel names is actually present in the
 * deployment.
 *
 *   `configured`   — a credential is referenced AND the deployment holds it.
 *   `unavailable`  — a credential is referenced but the deployment does NOT hold
 *                    it, so every send will fail at dispatch.
 *   `not_connected`— no credential referenced yet.
 *
 * This is deliberately the ONLY provider fact reported. Alloy can observe whether
 * it holds a key; it cannot observe, without asking the provider, whether a
 * sending domain is verified or MX records point anywhere. Those are reported as
 * "verification required" — an honest unknown — rather than invented.
 */
export type ProviderConnectionState = "configured" | "unavailable" | "not_connected";

export type BindingReadiness = {
    send: DirectionReadiness;
    receive: DirectionReadiness;
    providerConnection: ProviderConnectionState;
};

/** Providers with a real execution path, per channel. Everything else is
 *  `provider_unavailable` — configuration cannot conjure an adapter. */
const RUNTIME_PROVIDERS: Record<string, string> = { email: "resend", sms: "twilio" };

function channelOf(binding: BindingSummary): string {
    return String(binding.channel ?? "").trim().toLowerCase();
}

function statusOf(binding: BindingSummary): string {
    return String(binding.status ?? "").trim().toLowerCase();
}

/** A credential is bound when `secret_ref` names something resolvable. Mirrors
 *  `resolve_secret_plaintext` / `resolveTwilioAuthTokenFromSecretRef`: empty and
 *  `unconfigured` both mean "nothing to resolve". */
export function hasBoundCredential(binding: BindingSummary): boolean {
    const ref = String(binding.secret_ref ?? "").trim().toLowerCase();
    return ref !== "" && ref !== "unconfigured";
}

/** The receiving identity for a channel: an address for email, a number for SMS. */
export function receivingIdentity(binding: BindingSummary & { inbound_address?: string | null }): string | null {
    if (channelOf(binding) === "email") return normalizeEmailAddress(binding.inbound_address);
    const e164 = String(binding.inbound_to_e164 ?? "").trim();
    return e164 || null;
}

/**
 * The domain a receiving address belongs to — the thing that needs an MX record
 * pointed at the provider. Derived rather than stored: it is a function of the
 * address, and a second column could disagree with it.
 */
export function receivingDomain(inboundAddress: string | null | undefined): string | null {
    const normalized = normalizeEmailAddress(inboundAddress);
    if (!normalized) return null;
    const at = normalized.lastIndexOf("@");
    const domain = at >= 0 ? normalized.slice(at + 1).trim() : "";
    return domain || null;
}

/** The domain mail is sent FROM — what the provider must have verified, and the
 *  domain Alloy mints Message-IDs under, which is what replies correlate on. */
export function sendingDomain(fromEmail: string | null | undefined): string | null {
    return receivingDomain(fromEmail);
}

/**
 * Readiness for both directions.
 *
 * Precedence is deliberate and shared by both directions: `disabled` >
 * `provider_unavailable` > `setup_required` > `verification_required` > `ready`.
 * The most actionable true statement wins — telling an operator "verify your
 * domain" when no credential is bound sends them to the wrong place.
 */
export function evaluateBindingReadiness(
    binding: BindingSummary & { inbound_address?: string | null },
    options?: {
        /**
         * Whether the deployment actually holds the credential this binding
         * names. `undefined` means "not checked" and is treated as available, so
         * callers that cannot observe it keep today's behaviour.
         *
         * Supplying it closes a real gap: a binding can reference
         * `env:RESEND_API_KEY` while the deployment has no such variable. Before
         * this, the surface reported "Ready" and every send failed at dispatch —
         * configuration claiming a readiness the runtime could not honour, which
         * is the one thing this model exists to prevent.
         */
        credentialAvailable?: boolean;
    },
): BindingReadiness {
    const channel = channelOf(binding);
    const status = statusOf(binding);
    const provider = String(binding.provider ?? "").trim().toLowerCase();

    if (status === "disabled") {
        const detail = "This channel is switched off. Switch it on to start using it again.";
        return {
            providerConnection: hasBoundCredential(binding) ? "configured" : "not_connected",
            send: { state: "disabled", detail },
            receive: { state: "disabled", detail },
        };
    }

    const expectedProvider = RUNTIME_PROVIDERS[channel];
    if (!expectedProvider || provider !== expectedProvider) {
        const detail = expectedProvider
            ? `Alloy has no ${channel} runtime for “${provider || "unknown"}”. Only ${expectedProvider} is supported today.`
            : `Alloy has no runtime for the “${channel || "unknown"}” channel.`;
        return {
            providerConnection: "not_connected",
            send: { state: "provider_unavailable", detail },
            receive: { state: "provider_unavailable", detail },
        };
    }

    const referenced = hasBoundCredential(binding);
    const available = options?.credentialAvailable !== false;
    // A referenced-but-absent credential is NOT credentialed for readiness
    // purposes: dispatch would fail, so reporting otherwise would be a lie.
    const credentialed = referenced && available;
    const pending = status === "pending_verification";

    const providerConnection: ProviderConnectionState = !referenced
        ? "not_connected"
        : available
          ? "configured"
          : "unavailable";

    const send = evaluateSend({ binding, channel, credentialed, pending });
    const receive = evaluateReceive({ binding, channel, credentialed, pending });

    if (providerConnection === "unavailable") {
        const detail =
            "The credential this channel uses is not available in this deployment, so nothing can be sent or received. Ask your administrator to restore it.";
        return {
            providerConnection,
            send: { state: "setup_required", detail },
            receive: { state: "setup_required", detail },
        };
    }

    return { providerConnection, send, receive };
}

function evaluateSend(params: {
    binding: BindingSummary;
    channel: string;
    credentialed: boolean;
    pending: boolean;
}): DirectionReadiness {
    const { binding, channel, credentialed, pending } = params;

    if (!credentialed) {
        return {
            state: "setup_required",
            detail: "No credential is connected, so nothing can be sent. Connect one of the credentials provisioned for this deployment.",
        };
    }
    if (pending) {
        return {
            state: "verification_required",
            detail:
                channel === "email"
                    ? "Waiting on verification. The sending domain must be verified with Resend before mail will be delivered."
                    : "Waiting on verification. Confirm the number is active on the provider account, then set this channel to active.",
        };
    }

    // The composer is the authority on whether an outbound channel is usable.
    // Deriving from it — rather than restating its rules — is what keeps this
    // page from advertising a channel the runtime will refuse.
    //
    // UNREACHABLE BY CONSTRUCTION, and deliberately kept. By this point the status
    // is active, the provider matches, and a credential is bound — which is
    // exactly what `bindingEligibleForOutboundComposer` requires, so it cannot
    // return false here today. It is a guard against the two definitions drifting
    // apart later, not a live branch. Stated plainly because a positive-control
    // run proved no test can reach this sentence, and an untested branch that
    // looks tested is worse than one that admits it.
    if (!bindingEligibleForOutboundComposer(binding)) {
        return {
            state: "setup_required",
            detail: "Alloy cannot send on this channel yet. Check the provider and the connected credential.",
        };
    }

    if (channel === "email") {
        const cfg = binding.config && typeof binding.config === "object" ? binding.config : null;
        const from = typeof cfg?.from_email === "string" ? cfg.from_email.trim() : "";
        if (!from) {
            // Not a blocker: the send path falls back to the deployment default
            // address. It IS worth saying, because that address also sets the
            // domain replies correlate on.
            return {
                state: "ready",
                detail: "Sending with the deployment's default From address. Set one here to control the sending identity and the domain replies come back to.",
            };
        }
        return { state: "ready", detail: `Sending as ${from}.` };
    }

    return { state: "ready", detail: "Ready to send." };
}

function evaluateReceive(params: {
    binding: BindingSummary & { inbound_address?: string | null };
    channel: string;
    credentialed: boolean;
    pending: boolean;
}): DirectionReadiness {
    const { binding, channel, credentialed, pending } = params;
    const identity = receivingIdentity(binding);

    if (!identity) {
        return {
            state: "setup_required",
            detail:
                channel === "email"
                    ? "No receiving address, so replies cannot reach Alloy. Set the address mail is delivered to."
                    : "No receiving number, so inbound texts cannot reach Alloy. Set the number the provider delivers to.",
        };
    }

    // Ownership of an inbound message resolves without a credential, but the body
    // of a received email is fetched with one — so receiving genuinely does not
    // work without it. Reporting `ready` here would claim a readiness the runtime
    // cannot honour, which is the one thing this model must never do.
    if (!credentialed) {
        return {
            state: "setup_required",
            detail:
                channel === "email"
                    ? "No credential is connected. Mail addressed here cannot be retrieved and will wait unprocessed."
                    : "No credential is connected, so inbound webhooks cannot be verified.",
        };
    }

    if (pending) {
        return {
            state: "verification_required",
            detail:
                channel === "email"
                    ? `Waiting on verification. ${receivingDomain(binding.inbound_address) ?? "The receiving domain"} needs its MX records pointed at Resend, and inbound enabled on the account.`
                    : "Waiting on verification. Confirm the provider is delivering inbound messages to Alloy.",
        };
    }

    return {
        state: "ready",
        detail:
            channel === "email"
                ? `Receiving mail addressed to ${identity}.`
                : `Receiving messages sent to ${identity}.`,
    };
}

/** Short operator-facing label for a state. */
export function readinessLabel(state: ReadinessState): string {
    switch (state) {
        case "ready":
            return "Ready";
        case "setup_required":
            return "Setup required";
        case "verification_required":
            return "Verification required";
        case "disabled":
            return "Disabled";
        case "provider_unavailable":
            return "Provider unavailable";
    }
}
