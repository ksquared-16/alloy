/**
 * Give a visible identity a hidden destination — idempotently, and without
 * anything that could be mistaken for the identity itself.
 *
 * NOTHING IS PROVISIONED AT THE PROVIDER. Resend has no API that creates an
 * inbound address, and none is needed: every local part at a receiving domain is
 * already deliverable. So this composes a destination and records the mapping.
 * The only external fact required is the receiving DOMAIN, which lives once on
 * the provider account.
 *
 * IDEMPOTENCE IS THE WHOLE CONTRACT. An administrator will press the setup button
 * twice, reload mid-flow, and come back tomorrow. Every one of those must yield
 * the SAME destination, because a second destination silently strands the
 * forwarding rule they already created against the first — mail would arrive
 * nowhere while the UI showed a freshly minted address that looks correct.
 *
 * Pure decisions live here; the caller owns the I/O so both the "already exists"
 * and "create" paths are testable without a database.
 */

import {
    composeIngressDestination,
    mintIngressLocalPart,
} from "@/lib/communications/ingress/receivingDomain";

export type ExistingRoute = {
    id: string;
    destination: string;
    last_inbound_at: string | null;
};

export type ProvisionDecision =
    /** A route already exists for this binding. Returned unchanged. */
    | { action: "reuse"; destination: string; routeId: string }
    /** No route exists; create this one. */
    | { action: "create"; destination: string }
    /** The provider account has no receiving domain configured yet. */
    | { action: "needs_receiving_domain" };

/**
 * Decide what a setup press should do.
 *
 * Reuse wins over everything. In particular a route is reused even when the
 * receiving DOMAIN has since changed: silently reminting the destination onto a
 * new domain would orphan both the administrator's existing forwarding rule and
 * every message already correlated through the old address. Changing the
 * receiving domain is a deliberate lifecycle act, not a side effect of pressing
 * a setup button — see `describeDomainDrift`.
 */
export function decideProvisioning(params: {
    receivingDomain: string | null;
    existing: ExistingRoute | null;
    mintLocalPart?: () => string;
}): ProvisionDecision {
    if (params.existing) {
        return { action: "reuse", destination: params.existing.destination, routeId: params.existing.id };
    }
    const domain = String(params.receivingDomain ?? "").trim().toLowerCase();
    if (!domain) return { action: "needs_receiving_domain" };
    const local = (params.mintLocalPart ?? mintIngressLocalPart)();
    return { action: "create", destination: composeIngressDestination(local, domain) };
}

export type DomainDrift =
    | { drifted: false }
    /**
     * The account's receiving domain no longer matches the one this route was
     * minted against. Surfaced, never auto-repaired: the existing destination
     * still works if the old domain still receives, and rewriting it would break
     * a forwarding rule that is currently correct.
     */
    | { drifted: true; routeDomain: string; accountDomain: string };

/** Whether an existing route was minted against a different receiving domain. */
export function describeDomainDrift(
    existingDestination: string | null | undefined,
    accountReceivingDomain: string | null | undefined
): DomainDrift {
    const dest = String(existingDestination ?? "").trim().toLowerCase();
    const account = String(accountReceivingDomain ?? "").trim().toLowerCase();
    if (!dest || !account) return { drifted: false };
    const at = dest.lastIndexOf("@");
    if (at < 0) return { drifted: false };
    const routeDomain = dest.slice(at + 1);
    if (routeDomain === account) return { drifted: false };
    return { drifted: true, routeDomain, accountDomain: account };
}

/**
 * What the administrator is told after a successful setup press.
 *
 * `receivingReady` is deliberately absent from this type. Creating a destination
 * proves only that Alloy has somewhere to receive; it says nothing about whether
 * the external forwarding rule exists, and conflating the two is the exact lie
 * the readiness model was rebuilt to remove.
 */
export type IngressSetupSummary = {
    visibleIdentity: string;
    hiddenDestination: string;
    /** True when this press created it, false when an existing one was returned. */
    created: boolean;
    /** Observed inbound, if any has ever arrived through this route. */
    lastInboundAt: string | null;
};
