/**
 * Communications-owned marketing consent handoff for public intake.
 *
 * Forms/Processing capture evidence BEFORE a Person exists. At identity commit
 * they call {@link commitMarketingConsentFromIntakeCapture}, which writes the
 * canonical `communication_preferences` row through the same persist authority
 * as operator edits and recipient unsubscribe.
 *
 * Consent collection itself must never enqueue a send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    appendCommunicationPreferenceEvent,
    persistCommunicationPreference,
} from "@/lib/communications/v2/persistCommunicationPreference";
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

export type MarketingConsentChannel = "email" | "sms";

/** Evidence captured on a public form / Processing Case before Person exists. */
export type IntakeMarketingConsentCapture = {
    channel: MarketingConsentChannel;
    /** Explicit opt-in only. Absent/false means leave unset — never invent consent. */
    optedIn: boolean;
    capturedAt: string;
    source: string;
    method?: string | null;
    /** Form / link / case identifiers for audit metadata. */
    evidence?: Record<string, unknown> | null;
};

export type CommitMarketingConsentResult =
    | {
          ok: true;
          channel: MarketingConsentChannel;
          category: PreferenceCategory;
          outcome: "opted_in" | "preserved_opt_out" | "skipped_unset" | "already_opted_in";
      }
    | { ok: false; channel: MarketingConsentChannel; error: string };

/** The audit event's evidence: what was asked, when, under which wording, from which form and case. */
function intakeEventMetadata(
    capture: IntakeMarketingConsentCapture,
    outcome: "opted_in" | "preserved_opt_out"
): Record<string, unknown> {
    return {
        outcome,
        ...(outcome === "preserved_opt_out" ? { requested_state: "opted_in" } : {}),
        captured_at: capture.capturedAt,
        ...(capture.evidence ?? {}),
    };
}

function categoryForChannel(channel: MarketingConsentChannel): PreferenceCategory {
    return channel === "sms" ? "sms_marketing" : "email_marketing";
}

/**
 * Apply one channel's intake capture to a resolved Person.
 *
 * Rules:
 * - optedIn false → no write (leave unset / existing state alone).
 * - existing opted_out → preserve; record an event that intake opt-in was ignored.
 * - otherwise → opted_in with intake provenance.
 */
export async function commitMarketingConsentFromIntakeCapture(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        personId: string;
        capture: IntakeMarketingConsentCapture;
        actorUserId?: string | null;
    }
): Promise<CommitMarketingConsentResult> {
    const channel = input.capture.channel;
    const category = categoryForChannel(channel);

    if (!input.capture.optedIn) {
        return { ok: true, channel, category, outcome: "skipped_unset" };
    }

    const { data: existing } = await supabase
        .from("communication_preferences")
        .select("state")
        .eq("org_id", input.orgId)
        .eq("person_id", input.personId)
        .eq("category", category)
        .maybeSingle();

    const fromState =
        existing && typeof existing === "object" && "state" in existing
            ? ((existing as { state: PreferenceState }).state ?? null)
            : null;

    if (fromState === "opted_out") {
        // Preserve the opt-out and leave an audit breadcrumb that intake asked to opt in — as an event
        // only: the state row keeps the provenance of the opt-out (e.g. recipient_unsubscribe), so the
        // inquiry never reads as the source of the current state.
        const preserved = await appendCommunicationPreferenceEvent(supabase, {
            orgId: input.orgId,
            personId: input.personId,
            category,
            fromState: "opted_out",
            toState: "opted_out",
            source: input.capture.source || "public_intake",
            method: input.capture.method ?? "form_checkbox",
            actorUserId: input.actorUserId ?? null,
            metadata: intakeEventMetadata(input.capture, "preserved_opt_out"),
        });
        if (!preserved.ok) return { ok: false, channel, error: preserved.message };
        return { ok: true, channel, category, outcome: "preserved_opt_out" };
    }

    if (fromState === "opted_in") {
        return { ok: true, channel, category, outcome: "already_opted_in" };
    }

    const result = await persistCommunicationPreference(supabase, {
        orgId: input.orgId,
        personId: input.personId,
        category,
        fromState,
        toState: "opted_in",
        source: input.capture.source || "public_intake",
        method: input.capture.method ?? "form_checkbox",
        actorUserId: input.actorUserId ?? null,
        metadata: intakeEventMetadata(input.capture, "opted_in"),
    });
    if (!result.ok) return { ok: false, channel, error: result.message };
    return { ok: true, channel, category, outcome: "opted_in" };
}

/** Apply every capture in the bag. Never throws; returns per-channel results. */
export async function commitMarketingConsentCaptures(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        personId: string;
        captures: IntakeMarketingConsentCapture[];
        actorUserId?: string | null;
    }
): Promise<CommitMarketingConsentResult[]> {
    const out: CommitMarketingConsentResult[] = [];
    for (const capture of input.captures) {
        out.push(
            await commitMarketingConsentFromIntakeCapture(supabase, {
                orgId: input.orgId,
                personId: input.personId,
                capture,
                actorUserId: input.actorUserId,
            })
        );
    }
    return out;
}
