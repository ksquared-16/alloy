/** Stable sender-resolution failure codes. */

export const SENDER_FAILURE = {
    TENANT_MISSING: "tenant_missing",
    UNSUPPORTED_CHANNEL: "unsupported_channel",
    NO_ELIGIBLE_IDENTITY: "no_eligible_identity",
    IDENTITY_DISABLED: "identity_disabled",
    IDENTITY_UNVERIFIED: "identity_unverified",
    PROVIDER_ACCOUNT_UNHEALTHY: "provider_account_unhealthy",
    LOCATION_BINDING_MISSING: "location_binding_missing",
    OPERATOR_UNAUTHORIZED: "operator_unauthorized",
    OVERRIDE_INVALID: "override_invalid",
    CAPABILITY_UNAVAILABLE: "capability_unavailable",
    CREDENTIALS_UNAVAILABLE: "credentials_unavailable",
} as const;

export type SenderFailureCode = (typeof SENDER_FAILURE)[keyof typeof SENDER_FAILURE];

export function senderFailureMessage(code: SenderFailureCode): string {
    switch (code) {
        case SENDER_FAILURE.TENANT_MISSING:
            return "Organization context is required to resolve a sender identity.";
        case SENDER_FAILURE.UNSUPPORTED_CHANNEL:
            return "The requested channel is not supported for identity resolution.";
        case SENDER_FAILURE.NO_ELIGIBLE_IDENTITY:
            return "No eligible communication identity is configured for this send.";
        case SENDER_FAILURE.IDENTITY_DISABLED:
            return "The selected communication identity is disabled.";
        case SENDER_FAILURE.IDENTITY_UNVERIFIED:
            return "The selected communication identity is not verified for outbound send.";
        case SENDER_FAILURE.PROVIDER_ACCOUNT_UNHEALTHY:
            return "The provider account for this identity is unavailable.";
        case SENDER_FAILURE.LOCATION_BINDING_MISSING:
            return "No location-bound identity is available for this context.";
        case SENDER_FAILURE.OPERATOR_UNAUTHORIZED:
            return "You are not authorized to send using this communication identity.";
        case SENDER_FAILURE.OVERRIDE_INVALID:
            return "The requested sender identity override is invalid or not permitted.";
        case SENDER_FAILURE.CAPABILITY_UNAVAILABLE:
            return "The selected identity does not support the required capability.";
        case SENDER_FAILURE.CREDENTIALS_UNAVAILABLE:
            return "Provider credentials are not configured for this identity.";
        default:
            return "Sender identity could not be resolved.";
    }
}
