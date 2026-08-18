/**
 * The Email address a person sees — and the one nobody outside setup ever does.
 *
 * TWO CONCEPTS, DELIBERATELY NOT ONE:
 *
 *   VISIBLE IDENTITY      kelly@workwithalloy.com
 *     What the organization communicates as. It is the `From` on a parent's
 *     screen, the address their Reply targets, the address the operator is told
 *     is theirs, and the address shown in conversation headers and sent history.
 *
 *   INGRESS DESTINATION   <opaque>@<id>.resend.app
 *     Where mail addressed to the visible identity is administratively routed so
 *     Alloy can observe it. Transport metadata. It has no product meaning, it is
 *     not anybody's address, and it must never render outside an administrator's
 *     technical routing instructions.
 *
 * These were previously one column, `inbound_address`, doing both jobs. That
 * works only while the two happen to be equal — which is exactly the arrangement
 * being replaced. The moment inbound is routed through a hidden destination, one
 * column has to be either the address parents reply to OR the address the
 * provider delivers to, and whichever it is, the other is wrong. A model that
 * cannot hold both without lying is a model that will show a parent an opaque
 * provider address, or tell an operator their email address is
 * `a7f3@x9k2.resend.app`.
 *
 * So: `inbound_address` KEEPS its meaning — the organization's own receiving
 * address, the visible one — and the hidden destination lives in its own
 * `communication_ingress_routes` row. Nothing about the existing direct-delivery
 * arrangement changes, and nothing about the certified SMS runtime is touched.
 *
 * This module is the single place that decides which of the two a given surface
 * is allowed to see. Pure: values in, identity out.
 */

import { normalizeEmailAddress } from "@/lib/communications/email/inboundEmailRouting";

/**
 * Provider-issued ingress domains. An address on one of these is transport, not
 * identity, no matter which field it arrived in.
 *
 * This is a BACKSTOP, not the model. The model is that the ingress destination
 * lives in its own table; this catches the case where one was mistakenly written
 * into an identity field, so the mistake shows up as a withheld address rather
 * than as an opaque string on a parent's screen.
 */
const INGRESS_ONLY_DOMAIN_SUFFIXES = [".resend.app", ".resend.dev"] as const;

/** True when this address is a provider ingress destination and never an identity. */
export function isIngressOnlyAddress(raw: string | null | undefined): boolean {
    const address = normalizeEmailAddress(raw);
    if (!address) return false;
    const at = address.lastIndexOf("@");
    const domain = at >= 0 ? address.slice(at + 1) : "";
    return INGRESS_ONLY_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/**
 * An address safe to show a parent or an operator, or null.
 *
 * Null rather than a fallback: showing nothing is recoverable, and an operator
 * who sees no address goes looking for the setting. Showing them a transport
 * address teaches them a wrong fact about their own identity, and they may then
 * hand it to a parent.
 */
export function visibleEmailAddress(raw: string | null | undefined): string | null {
    const address = normalizeEmailAddress(raw);
    if (!address) return null;
    return isIngressOnlyAddress(address) ? null : address;
}

export type VisibleEmailIdentity = {
    /** The address a parent sees as `From`, and replies to. */
    address: string;
    /** "Kelly Kurzman", when the organization configured one. */
    displayName: string | null;
    /** `Kelly Kurzman <kelly@workwithalloy.com>`, or the bare address. */
    formatted: string;
};

/** RFC 5322 display-name quoting, applied only when the name needs it. */
function formatMailbox(displayName: string | null, address: string): string {
    const name = (displayName ?? "").trim();
    if (!name) return address;
    // Quote when the name contains anything that would otherwise need escaping.
    const needsQuoting = /[",;:<>@[\]\\().]/.test(name);
    const rendered = needsQuoting ? `"${name.replace(/(["\\])/g, "\\$1")}"` : name;
    return `${rendered} <${address}>`;
}

/**
 * The organization's visible Email identity for a channel binding.
 *
 * `from_email` is preferred over the receiving address because it is the field
 * an administrator sets to control the sending identity; the receiving address
 * is the fallback for the common case where they are the same address. Either
 * way an ingress destination is refused, so a mis-filled field degrades to "no
 * identity configured" rather than leaking transport into the product.
 */
export function resolveVisibleEmailIdentity(params: {
    fromEmail?: string | null;
    inboundAddress?: string | null;
    displayName?: string | null;
}): VisibleEmailIdentity | null {
    const address = visibleEmailAddress(params.fromEmail) ?? visibleEmailAddress(params.inboundAddress);
    if (!address) return null;
    const displayName = (params.displayName ?? "").trim() || null;
    return { address, displayName, formatted: formatMailbox(displayName, address) };
}

/**
 * The address to put in `Reply-To` on an outbound email.
 *
 * Set EXPLICITLY rather than left to default to `From`. The two are equal today,
 * so the header changes nothing on the wire — but "where a reply goes" then
 * becomes a stated fact that certification can assert, instead of a consequence
 * of a provider default that a later change to the sending identity would
 * silently alter.
 *
 * Returns null when there is no visible identity to name. Never returns an
 * ingress destination: a parent replying to `<opaque>@<id>.resend.app` would see
 * it in their own sent mail, in their address book, and in every subsequent
 * thread — which is the failure this whole separation exists to prevent.
 */
export function resolveVisibleReplyIdentity(params: {
    fromEmail?: string | null;
    inboundAddress?: string | null;
}): string | null {
    return visibleEmailAddress(params.inboundAddress) ?? visibleEmailAddress(params.fromEmail);
}
