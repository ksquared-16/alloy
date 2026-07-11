/** Communications Identity Platform — shared types. */

export type CommunicationChannel = "sms" | "email" | "voice" | "internal";

export type IdentityScope = "tenant" | "location" | "department" | "system";

export type VerificationState = "unverified" | "pending" | "verified" | "failed";

export type IdentityStatus = "active" | "disabled";

export type HealthStatus = "unknown" | "healthy" | "degraded" | "unavailable";

export type ProviderAccountRow = {
    id: string;
    org_id: string;
    provider_type: string;
    display_label: string | null;
    status: string;
    verification_state: VerificationState;
    health_status: HealthStatus;
    secret_ref: string;
    capabilities: Record<string, unknown>;
    config: Record<string, unknown>;
    provider_account_ref: string | null;
    legacy_binding_id: string | null;
    metadata: Record<string, unknown>;
};

export type CommunicationIdentityRow = {
    id: string;
    org_id: string;
    provider_account_id: string;
    channel: CommunicationChannel;
    identity_type: string;
    canonical_address: string;
    normalized_address: string;
    display_name: string | null;
    inbound_enabled: boolean;
    outbound_enabled: boolean;
    verification_state: VerificationState;
    status: IdentityStatus;
    health_status: HealthStatus;
    capabilities: Record<string, unknown>;
    provider_resource_ref: string | null;
    scope: IdentityScope;
    is_default_for_scope: boolean;
    legacy_binding_id: string | null;
    metadata: Record<string, unknown>;
    default_access_mode?: "open_until_restricted" | "explicit_grants_required";
};

export type LocationBindingRow = {
    id: string;
    org_id: string;
    identity_id: string;
    location_id: string;
    channel: CommunicationChannel;
    priority: number;
    is_default: boolean;
    inbound_routing_enabled: boolean;
    outbound_sending_enabled: boolean;
    status: string;
};

export type IdentityGrantRow = {
    id: string;
    org_id: string;
    identity_id: string;
    user_id: string;
    can_send: boolean;
    can_receive: boolean;
    can_configure: boolean;
    can_manage: boolean;
    can_override_default: boolean;
    can_use_across_locations: boolean;
    status: string;
};

export type LegacyBindingRow = {
    id: string;
    org_id: string;
    channel: string;
    provider: string;
    scope: string;
    location_id: string | null;
    status: string;
    is_primary: boolean | null;
    secret_ref: string | null;
    inbound_to_e164: string | null;
    config: Record<string, unknown> | null;
    display_label: string | null;
};

export type SenderResolutionInput = {
    orgId: string;
    channel: CommunicationChannel;
    operatorUserId: string | null;
    locationId: string | null;
    primaryEntityType?: string | null;
    primaryEntityId?: string | null;
    messagePurpose?: string | null;
    requestedIdentityId?: string | null;
    /** Legacy binding override — resolved to identity when possible. */
    requestedLegacyBindingId?: string | null;
    requiredCapabilities?: string[];
    allowLegacyCompatibilityFallback?: boolean;
    operatorHasCommunicationsSend?: boolean;
};

export type SelectionReason =
    | "explicit_authorized_override"
    | "location_default"
    | "location_priority"
    | "tenant_default"
    | "legacy_compatibility_fallback";

export type SafeSenderMetadata = {
    identityId: string;
    displayName: string | null;
    fromAddress: string;
    channel: CommunicationChannel;
    providerAdapterKey: string;
};

export type SenderResolutionSuccess = {
    ok: true;
    providerAccount: ProviderAccountRow;
    communicationIdentity: CommunicationIdentityRow;
    locationBinding: LocationBindingRow | null;
    selectionReason: SelectionReason;
    fallbackLevel: number;
    authorization: {
        allowed: true;
        usedGrant: boolean;
        overrideUsed: boolean;
    };
    capabilities: Record<string, unknown>;
    providerAdapterKey: string;
    safeSenderMetadata: SafeSenderMetadata;
    warnings: string[];
    legacyBindingId: string | null;
};

export type SenderResolutionFailure = {
    ok: false;
    failureCode: string;
    message: string;
    warnings: string[];
};

export type SenderResolutionResult = SenderResolutionSuccess | SenderResolutionFailure;

export type IdentityResolutionContext = {
    accounts: ProviderAccountRow[];
    identities: CommunicationIdentityRow[];
    locationBindings: LocationBindingRow[];
    grants: IdentityGrantRow[];
    legacyBindings: LegacyBindingRow[];
};
