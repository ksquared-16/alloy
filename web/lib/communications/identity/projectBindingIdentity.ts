/**
 * Keeping the identity model in step with the binding model, synchronously.
 *
 * ---------------------------------------------------------------------------
 * The authority decision, stated once
 * ---------------------------------------------------------------------------
 *
 * Two models describe the same thing:
 *
 *   `communication_provider_bindings`   — what the operator authored
 *   `communication_identities` (+ accounts, + location bindings)
 *                                      — what the sender resolver reads
 *
 * **The binding is the write authority.** Everything the runtime actually
 * enforces hangs off it: the Python dispatcher reads `secret_ref` and
 * `config.from_email` from the binding, inbound ownership resolves from the
 * binding's `inbound_address` / `inbound_to_e164`, and the GLOBAL cross-tenant
 * uniqueness indexes that stop two organizations claiming one address are defined
 * on the binding table. Making identities authoritative would mean moving those
 * guarantees, which is a migration of certified runtimes, not a convergence.
 *
 * **The identity model is therefore a PROJECTION** — derived, never authored. It
 * exists so `resolveSenderIdentity` (which is channel-neutral and already
 * implements location precedence) has something real to resolve against.
 *
 * ---------------------------------------------------------------------------
 * Why synchronous, and not a job
 * ---------------------------------------------------------------------------
 *
 * The identity rows were originally created by a ONE-TIME `DO $$` backfill inside
 * `20260715120000`. There is no trigger and no sync. So a channel connected
 * through `/organization/communications` produced a binding and no identity — and
 * would have been invisible to the resolver the moment it was switched on.
 *
 * A reconciliation job would fix that eventually. "Eventually" is the wrong
 * contract for configuration: an administrator connects a channel and sends a
 * message ten seconds later. Projecting inside the same request means the runtime
 * can resolve the binding the instant the operator sees it saved, with no window
 * in which the two models disagree.
 *
 * This module is the PURE half — it decides what the projection should contain.
 * The I/O lives in `applyBindingIdentityProjection`.
 */

export type ProjectableBinding = {
    id: string;
    org_id: string;
    channel: string;
    provider: string | null;
    status: string | null;
    is_primary: boolean | null;
    scope: string | null;
    location_id: string | null;
    display_label: string | null;
    secret_ref: string | null;
    inbound_address: string | null;
    inbound_to_e164: string | null;
    config: Record<string, unknown> | null;
};

export type ProviderAccountProjection = {
    org_id: string;
    provider_type: string;
    display_label: string;
    status: string;
    verification_state: string;
    secret_ref: string;
    config: Record<string, unknown>;
    legacy_binding_id: string;
    metadata: Record<string, unknown>;
};

export type IdentityProjection = {
    org_id: string;
    channel: string;
    identity_type: string;
    canonical_address: string;
    normalized_address: string;
    display_name: string | null;
    inbound_enabled: boolean;
    outbound_enabled: boolean;
    verification_state: string;
    status: string;
    scope: string;
    is_default_for_scope: boolean;
    legacy_binding_id: string;
    metadata: Record<string, unknown>;
};

export type LocationBindingProjection = {
    org_id: string;
    location_id: string;
    channel: string;
    priority: number;
    is_default: boolean;
    inbound_routing_enabled: boolean;
    outbound_sending_enabled: boolean;
    status: string;
};

export type BindingProjectionPlan = {
    account: ProviderAccountProjection;
    /**
     * `null` when the binding has no sendable address yet. A connected-but-unaddressed
     * channel is a real state (connect SMS, then set the number), and inventing a
     * placeholder address would put a fake identity in front of the resolver.
     */
    identity: IdentityProjection | null;
    /** `null` for organization-scoped bindings. */
    locationBinding: LocationBindingProjection | null;
};

/**
 * `communication_identities.status` admits only `active | disabled` — there is no
 * pending state. That is not a gap to paper over: an identity is either usable by
 * the runtime or it is not, and a binding awaiting verification is NOT usable.
 * Mapping it to `disabled` is what makes the resolver refuse it.
 */
function identityStatusFor(bindingStatus: string): string {
    return bindingStatus === "active" ? "active" : "disabled";
}

/** Accounts DO carry a pending state, so the operator's intent survives there. */
function verificationStateFor(bindingStatus: string): string {
    if (bindingStatus === "active") return "verified";
    if (bindingStatus === "pending_verification") return "pending";
    return "failed";
}

/** The address this identity sends AS. */
function canonicalAddressFor(binding: ProjectableBinding): string | null {
    const channel = String(binding.channel ?? "").trim().toLowerCase();
    if (channel === "email") {
        const cfg = binding.config && typeof binding.config === "object" ? binding.config : {};
        const from = typeof cfg.from_email === "string" ? cfg.from_email.trim() : "";
        // Falling back to the receiving address is deliberate: an email channel
        // that receives at families@ and has no explicit From still HAS an
        // identity, and that address is the truthful one to resolve to.
        return from || (binding.inbound_address ?? "").trim() || null;
    }
    const cfg = binding.config && typeof binding.config === "object" ? binding.config : {};
    const fromNumber = typeof cfg.from_number === "string" ? cfg.from_number.trim() : "";
    return (binding.inbound_to_e164 ?? "").trim() || fromNumber || null;
}

function identityTypeFor(channel: string): string {
    return channel === "email" ? "email_address" : "phone_number";
}

/**
 * Build the projection for one binding.
 *
 * Deterministic and total: the same binding always yields the same plan, so
 * re-running it (on every save, on a retry, on a replay) converges rather than
 * accumulating rows.
 */
export function planBindingIdentityProjection(binding: ProjectableBinding): BindingProjectionPlan {
    const channel = String(binding.channel ?? "").trim().toLowerCase();
    const provider = String(binding.provider ?? "").trim().toLowerCase();
    const status = String(binding.status ?? "").trim().toLowerCase();
    const secretRef = String(binding.secret_ref ?? "unconfigured").trim() || "unconfigured";
    const locationId = (binding.location_id ?? "").trim() || null;
    const label = (binding.display_label ?? "").trim() || `${provider || channel} channel`;

    const account: ProviderAccountProjection = {
        org_id: binding.org_id,
        provider_type: provider || channel,
        display_label: label,
        status: status || "disabled",
        verification_state: verificationStateFor(status),
        secret_ref: secretRef,
        config: (binding.config && typeof binding.config === "object" ? binding.config : {}) as Record<string, unknown>,
        legacy_binding_id: binding.id,
        metadata: { projection_source: "communication_provider_bindings" },
    };

    const address = canonicalAddressFor(binding);
    const identity: IdentityProjection | null = address
        ? {
              org_id: binding.org_id,
              channel,
              identity_type: identityTypeFor(channel),
              canonical_address: address,
              normalized_address: address.toLowerCase(),
              display_name: (binding.display_label ?? "").trim() || null,
              // Receiving is claimed only where the binding actually owns a
              // receiving identity — otherwise the resolver would believe this
              // channel can take replies it will never see.
              inbound_enabled: Boolean(
                  channel === "email" ? binding.inbound_address?.trim() : binding.inbound_to_e164?.trim(),
              ),
              outbound_enabled: status === "active",
              verification_state: verificationStateFor(status),
              status: identityStatusFor(status),
              scope: locationId ? "location" : "tenant",
              is_default_for_scope: Boolean(binding.is_primary),
              legacy_binding_id: binding.id,
              metadata: { projection_source: "communication_provider_bindings" },
          }
        : null;

    const locationBinding: LocationBindingProjection | null =
        locationId && identity
            ? {
                  org_id: binding.org_id,
                  location_id: locationId,
                  channel,
                  // A location's own identity outranks anything inherited. The
                  // resolver sorts ascending, so 10 leaves room either side.
                  priority: 10,
                  is_default: true,
                  inbound_routing_enabled: identity.inbound_enabled,
                  outbound_sending_enabled: status === "active",
                  status: identityStatusFor(status),
              }
            : null;

    return { account, identity, locationBinding };
}
