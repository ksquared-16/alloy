/**
 * The organization's RECEIVING DOMAIN, and the hidden destinations derived from it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PROVIDER ACTUALLY OFFERS — verified, not assumed
 * ---------------------------------------------------------------------------
 *
 * Resend has NO API that creates an inbound address. There is nothing to
 * provision. What it gives an account is a RECEIVING DOMAIN, and every local
 * part at that domain is already deliverable: "you will receive emails for any
 * address at that domain". Two kinds exist:
 *
 *   default   `<id>.resend.app`, assigned per team, needs no DNS — and is NOT
 *             exposed by any API, so an administrator copies it once from the
 *             Resend dashboard.
 *   custom    a domain the account enabled for receiving, discoverable through
 *             `GET /domains` as `capabilities.receiving === "enabled"`, and
 *             requiring an MX record the administrator adds themselves.
 *
 * So Alloy DERIVES destinations; it never creates them. That distinction is why
 * this module is pure and why no provider mutation exists anywhere in the flow.
 *
 * ---------------------------------------------------------------------------
 * GRAIN
 * ---------------------------------------------------------------------------
 *
 * The receiving domain belongs to the PROVIDER ACCOUNT — one Resend connection,
 * one receiving domain — and is stored once on
 * `communication_provider_accounts.config`. It is emphatically NOT a property of
 * a communication identity: copying it onto every identity would make a single
 * provider fact editable in several places, and those places would disagree.
 *
 * Each visible identity then gets its OWN destination at that shared domain:
 *
 *     receiving domain      cool-hedgehog.resend.app
 *     Kelly  kelly@workwithalloy.com   -> <opaque>@cool-hedgehog.resend.app
 *     North  north@workwithalloy.com   -> <different-opaque>@cool-hedgehog.resend.app
 *
 * Pure: values in, values out.
 */

import { randomBytes } from "node:crypto";

/** Resend's own receiving domain suffix. */
export const RESEND_DEFAULT_RECEIVING_SUFFIX = ".resend.app";

export type ReceivingDomainSource =
    /** Discovered through the provider API as receiving-enabled. */
    | "custom_domain"
    /** Supplied by the administrator from the Resend dashboard. */
    | "resend_default";

export type ReceivingDomainDecision =
    | { ok: true; domain: string; source: ReceivingDomainSource }
    | { ok: false; reason: "empty" | "malformed" | "not_a_domain" | "looks_like_an_address" };

/**
 * Validate a receiving domain an administrator supplied.
 *
 * Conservative on purpose. A wrong domain here is not a validation nuisance — it
 * produces a destination that silently receives nothing, and the operator would
 * have no way to tell that from "the forwarding rule has not been created yet".
 *
 * Rejecting an ADDRESS is called out separately because it is the likeliest
 * mistake: the Resend dashboard shows `anything@<id>.resend.app`, and pasting the
 * whole thing is the natural thing to do.
 */
export function validateReceivingDomain(raw: string | null | undefined): ReceivingDomainDecision {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value) return { ok: false, reason: "empty" };
    if (value.includes("@")) return { ok: false, reason: "looks_like_an_address" };
    if (value.includes(" ") || value.includes("/") || value.includes(":")) {
        return { ok: false, reason: "malformed" };
    }
    // A domain, conservatively: labels of alphanumerics and hyphens, at least one
    // dot, no leading/trailing hyphen or dot.
    if (!/^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))+$/.test(value)) {
        return { ok: false, reason: "not_a_domain" };
    }
    return {
        ok: true,
        domain: value,
        source: value.endsWith(RESEND_DEFAULT_RECEIVING_SUFFIX) ? "resend_default" : "custom_domain",
    };
}

/**
 * Receiving-enabled domains from a `GET /domains` response.
 *
 * Keys off `capabilities.receiving === "enabled"` — the field the provider
 * documents for exactly this. A domain that merely SENDS is not offered: routing
 * mail to it would deliver nowhere, and presenting it as a choice would invite an
 * administrator to pick the thing that cannot work.
 *
 * Tolerant of shape, like `extractVerifiedDomains`: an unreadable payload yields
 * an empty list, which the caller reports as "none discovered" and falls back to
 * the paste path. It must never be read as "the account has no receiving domain".
 */
export function extractReceivingDomains(body: unknown): string[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown })?.data)
          ? (body as { data: unknown[] }).data
          : [];
    const out: string[] = [];
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const name = String((row as { name?: unknown }).name ?? "").trim().toLowerCase();
        const caps = (row as { capabilities?: unknown }).capabilities;
        const receiving =
            caps && typeof caps === "object"
                ? String((caps as { receiving?: unknown }).receiving ?? "").trim().toLowerCase()
                : "";
        if (name && receiving === "enabled" && !out.includes(name)) out.push(name);
    }
    return out;
}

/**
 * A hidden destination's local part.
 *
 * Cryptographically strong and server-generated. The administrator never chooses
 * it, for two reasons that both matter: a guessable destination invites mail an
 * organization never agreed to receive, and a MEANINGFUL one (`kelly-inbound@…`)
 * would leak the visible identity into transport and tempt someone to treat the
 * transport address as an identity — the exact confusion this whole model exists
 * to prevent.
 *
 * 16 bytes, base32-ish lowercase alphanumerics: unguessable, and still safe as an
 * email local part.
 */
export function mintIngressLocalPart(bytes: () => Buffer = () => randomBytes(16)): string {
    return bytes()
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase()
        .slice(0, 24);
}

/** Compose a hidden destination for a visible identity at a receiving domain. */
export function composeIngressDestination(localPart: string, domain: string): string {
    return `${localPart.trim().toLowerCase()}@${domain.trim().toLowerCase()}`;
}
