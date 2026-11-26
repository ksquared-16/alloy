/**
 * D10-F1 — the Communications side of inbound attachment retrieval: WHOSE key fetches an attachment's bytes, and the
 * switch that decides whether anything fetches them at all.
 *
 * ---------------------------------------------------------------------------
 * THE FLAG, AND WHY IT IS OFF
 * ---------------------------------------------------------------------------
 *
 * `INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED` (server-only). Unset, empty or anything but an explicit yes → OFF, and
 * `inboundAttachmentFilingOptions` returns exactly the production default `makeInboundAttachmentFilingDeps` already had:
 * no fetcher, no message link. Every attachment stays held before a byte is read, and nothing touches
 * `communication_message_attachments` — a table that does not exist until migration 20261218090000 is applied.
 *
 * Turning it on is NOT this change. It is operator decision DEC-8, after the migration's apply, hosted proof of storage,
 * a malware scanner (D1c-2) and the atomic Processing open. Even ON, the filing pipeline still holds every attachment
 * before retrieval while no scanner is wired: this flag supplies a fetcher, it does not release anything.
 *
 * ---------------------------------------------------------------------------
 * THE CREDENTIAL: THE ORGANIZATION'S OWN, OR NOTHING
 * ---------------------------------------------------------------------------
 *
 * The key comes from the binding the MESSAGE was received on (`communication_messages.communication_provider_binding_id`,
 * which ownership resolved at ingestion), re-read here under the message's organization, through
 * `resolveInboundRetrievalCredential`. Two rules are stricter than received-email retrieval:
 *
 *   - ORG-OWNED ONLY. The resolver is given an EMPTY environment, so a binding naming no org-owned credential (`env:…`,
 *     `unconfigured`, empty) resolves to nothing, and a deployment-wide `RESEND_API_KEY` is never read for an
 *     attachment. The source is checked as well (`org_owned`), so a later change to the resolver's fallback cannot
 *     quietly widen this.
 *   - A DISABLED binding fetches nothing. The administrator turned that connection off.
 *
 * Every refusal is a reason code; the key is passed only to the provider adapter, never logged or returned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveInboundRetrievalCredential } from "@/lib/communications/email/inboundRetrievalCredential";
import { makeResendAttachmentContentFetcher } from "@/lib/documents/inbound/resendAttachmentContentFetcher";
import type { AttachmentContentFetcher } from "@/lib/documents/inbound/ws11AttachmentStorage";

export const INBOUND_ATTACHMENT_RETRIEVAL_FLAG = "INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED";

/** Default OFF. Only an explicit yes turns it on; anything unrecognised stays off. */
export function isInboundAttachmentRetrievalEnabled(env: Record<string, string | undefined> = process.env): boolean {
    const raw = env[INBOUND_ATTACHMENT_RETRIEVAL_FLAG];
    return typeof raw === "string" && ["1", "true", "on", "yes"].includes(raw.trim().toLowerCase());
}

export type AttachmentRetrievalKeyRefusal =
    | "binding_missing"
    | "binding_not_owned"
    | "binding_not_resend_email"
    | "binding_disabled"
    | "org_credential_unavailable"
    | "no_org_credential";

export type AttachmentRetrievalKey = { ok: true; apiKey: string } | { ok: false; reason: AttachmentRetrievalKeyRefusal };

type BindingRow = { id: string; org_id: string; channel: string | null; provider: string | null; status: string | null; secret_ref: string | null };

/** The organization's own Resend key for the binding a message arrived on. Never the deployment key. */
export async function resolveInboundAttachmentRetrievalKey(
    supabase: SupabaseClient,
    ref: { orgId: string; providerBindingId: string | null },
): Promise<AttachmentRetrievalKey> {
    if (!ref.providerBindingId) return { ok: false, reason: "binding_missing" };
    const { data, error } = await supabase
        .from("communication_provider_bindings")
        .select("id, org_id, channel, provider, status, secret_ref")
        .eq("org_id", ref.orgId)
        .eq("id", ref.providerBindingId)
        .maybeSingle();
    const binding = (error ? null : data) as BindingRow | null;
    if (!binding) return { ok: false, reason: "binding_missing" };
    if (binding.org_id !== ref.orgId) return { ok: false, reason: "binding_not_owned" };
    if (binding.channel !== "email" || String(binding.provider ?? "").trim().toLowerCase() !== "resend") {
        return { ok: false, reason: "binding_not_resend_email" };
    }
    if (binding.status === "disabled") return { ok: false, reason: "binding_disabled" };

    // An empty environment: the deployment key is not an attachment credential (see the header).
    const credential = await resolveInboundRetrievalCredential({ supabase, orgId: ref.orgId, secretRef: binding.secret_ref, env: {} });
    if (!credential.ok) return { ok: false, reason: credential.reason === "org_credential_unavailable" ? "org_credential_unavailable" : "no_org_credential" };
    if (credential.source !== "org_owned") return { ok: false, reason: "no_org_credential" };
    return { ok: true, apiKey: credential.apiKey };
}

/** The Resend attachment fetcher under the organization's own binding credential. */
export function makeInboundAttachmentContentFetcher(
    supabase: SupabaseClient,
    opts: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => Date } = {},
): AttachmentContentFetcher {
    return makeResendAttachmentContentFetcher({
        resolveApiKey: (ref) => resolveInboundAttachmentRetrievalKey(supabase, ref),
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.timeoutMs,
        now: opts.now,
    });
}

/**
 * What the ingestion hand-off passes to `makeInboundAttachmentFilingDeps`. OFF: the production default, unchanged — no
 * fetcher, no link. ON: the org-credential fetcher and the message link, together, because the link table and real
 * retrieval go live under the same decision.
 */
export function inboundAttachmentFilingOptions(
    supabase: SupabaseClient,
    opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): { fetchContent: AttachmentContentFetcher | null; linkAttachments: boolean } {
    if (!isInboundAttachmentRetrievalEnabled(opts.env)) return { fetchContent: null, linkAttachments: false };
    return { fetchContent: makeInboundAttachmentContentFetcher(supabase, { fetchImpl: opts.fetchImpl }), linkAttachments: true };
}
