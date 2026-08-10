/**
 * Send a tour invitation — the Slice D composition service.
 *
 * This is **composition only**. Every step below is an existing platform capability:
 *
 *   recipient  → resolveTourCommsParentRecipient
 *   times      → computeAvailableTourSlots
 *   content    → buildTourInvitationContent / validateTourInvitationContent (Slice A)
 *   authority  → mintTourInvitation (Slice C)
 *   render     → renderTourCommsTemplate via orchestrateTourInvitationComms
 *   enqueue    → enqueueCanonicalOutboundMessage
 *   audit      → recordTourEvent
 *
 * It owns no booking logic, no token logic, and no transport logic. It is the only
 * place that turns an operator's intent into an invitation + its messages, which is
 * what keeps a single sender.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOrgTimezoneFromMetadata } from "@/lib/admin/timezoneContract";
import { formatLocationAddress } from "@/lib/locations/locationWorkspaceModel";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import { orchestrateTourInvitationComms } from "@/lib/tours/comms/tourCommsOrchestrator";
import { resolveTourCommsConfig } from "@/lib/tours/comms/resolveTourCommsConfig";
import {
    resolveTourCommsParentRecipient,
    type TourCommsParentRecipient,
} from "@/lib/tours/comms/resolveTourCommsRecipient";
import type { TourCommsTemplateContext } from "@/lib/tours/comms/tourCommsTemplateContext";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import { aliasTourBookingUrl } from "@/lib/tours/invitation/tourBookingPublicAlias";
import { mintTourInvitation, type MintedAction } from "@/lib/tours/invitation/mintTourInvitation";
import {
    validateTourInvitationContent,
    type TourInvitationContent,
    type TourOption,
} from "@/lib/tours/invitation/tourInvitationContent";
import { renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";

/** How many times to offer. More than this reads as a wall of text on a phone. */
const MAX_OFFERED_OPTIONS = 5;

/** How far ahead to look for offerable times. */
const OFFER_WINDOW_DAYS = 21;

export type TourInvitationComposeDraft = {
    invitationId: string;
    recipientPersonId: string | null;
    recipientDisplayName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    emailSubject: string | null;
    emailBody: string | null;
    smsBody: string | null;
    invitationActionUrl: string;
};

export type SendTourInvitationResult =
    | {
          ok: true;
          invitationId: string;
          /** True when this call re-sent an existing invitation rather than creating one. */
          idempotentReplay: boolean;
          optionCount: number;
          /** Channels that actually enqueued a message. */
          sentChannels: string[];
          /** Machine-readable reasons a channel did not send. */
          skippedReasons: string[];
          /** Present when mode is prepare — editable compose seed; nothing was sent. */
          draft?: TourInvitationComposeDraft;
      }
    | { ok: false; code: SendTourInvitationFailureCode; message: string };

/**
 * Failure codes are operator-facing. Each maps to a sentence an operator can act on,
 * never to a stack trace or a platform concept.
 */
export type SendTourInvitationFailureCode =
    | "missing_opportunity"
    | "missing_location"
    | "missing_recipient"
    | "no_available_times"
    | "invalid_content"
    | "mint_failed"
    | "nothing_sent";

export const SEND_TOUR_INVITATION_OPERATOR_MESSAGE: Record<SendTourInvitationFailureCode, string> = {
    missing_opportunity: "This record is no longer available.",
    missing_location:
        "This family is not assigned to a center yet. Set the center on the record, then send the invitation.",
    missing_recipient:
        "There is no parent contact with an email address or mobile number on this record. Add one, then send the invitation.",
    no_available_times:
        "There are no tour times available at this center in the next three weeks. Add tour availability, then send the invitation.",
    invalid_content: "The invitation could not be prepared for this family.",
    mint_failed: "The invitation could not be created. Nothing was sent.",
    nothing_sent:
        "The invitation was prepared but no message could be sent — the parent has no reachable email or mobile number.",
};

/**
 * A stable id for an offered time. Derived from the slot itself, so the same offer
 * produces the same option ids — which is what makes the invitation fingerprint (and
 * therefore the idempotency boundary) stable across retries.
 */
export function tourOptionIdForSlot(slot: AvailableTourSlot): string {
    return `${slot.ruleId}:${slot.startAt}`;
}

function toOption(slot: AvailableTourSlot, locationLabel: string, presentationLabel: string): TourOption {
    const start = new Date(slot.startAt);
    const iso = Number.isNaN(start.getTime()) ? "" : start.toISOString();
    return {
        optionId: tourOptionIdForSlot(slot),
        date: iso.slice(0, 10),
        startTime: iso.slice(11, 16),
        timezone: slot.timezone,
        locationId: slot.locationId,
        locationLabel,
        staffUserId: slot.userId,
        availabilityRef: slot.ruleId,
        presentationLabel,
        actionKind: "select_tour_slot",
    };
}

/** "Monday, August 10 · 9:00 AM" — what the parent reads. */
export function formatTourOptionLabel(startAt: string, timezone: string): string {
    const d = new Date(startAt);
    if (Number.isNaN(d.getTime())) return "";
    const tz = timezone || "UTC";
    try {
        const day = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: tz,
        }).format(d);
        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: tz,
        }).format(d);
        return `${day} · ${time}`;
    } catch {
        return "";
    }
}

function actionUrl(baseUrl: string, rawToken: string, optionId?: string): string {
    const base = `${baseUrl.replace(/\/+$/, "")}/tour-booking/${encodeURIComponent(rawToken)}`;
    return optionId ? `${base}?option=${encodeURIComponent(optionId)}` : base;
}

function findToken(actions: MintedAction[], kind: string): string | null {
    return actions.find((a) => a.actionKind === kind)?.rawToken ?? null;
}

/**
 * Collapse recipient-identical wall-clock choices (same location + label).
 * Distinct staff/resources that present identically to the parent stay one choice;
 * booking resolves an eligible backing resource via existing scheduling.
 */
export function dedupeTourOptionsForRecipient(options: TourOption[]): TourOption[] {
    const seen = new Set<string>();
    const out: TourOption[] = [];
    for (const option of options) {
        const key = [
            String(option.locationId ?? "").trim(),
            String(option.presentationLabel ?? "").trim().toLowerCase(),
            String(option.date ?? "").trim(),
            String(option.startTime ?? "").trim(),
            String(option.timezone ?? "").trim(),
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(option);
    }
    return out;
}

export type TourOptionsBlockFormat = "plain" | "email_html_source";

/**
 * Render the option list into the block templates interpolate.
 *
 * Plain (SMS): labeled times with short or long URLs on the same line.
 * Email source: "Label — URL" so polishTourCommsEmailHtml can turn labels into anchors
 * without exposing raw tokens in HTML.
 */
export function buildTourOptionsBlock(
    content: TourInvitationContent,
    baseUrl: string,
    selectToken: string,
    urlByOptionId?: Record<string, string>,
): string {
    return content.options
        .map((o) => {
            const url = urlByOptionId?.[o.optionId] ?? actionUrl(baseUrl, selectToken, o.optionId);
            return `${o.presentationLabel} — ${url}`;
        })
        .join("\n");
}

export async function sendTourInvitation(args: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId?: string | null;
    /** Overrides the offered location; defaults to the opportunity's own location. */
    locationId?: string | null;
    /** Operator prose above the options. Optional by design. */
    messageText?: string | null;
    /** Public origin for no-login links. */
    baseUrl: string;
    /**
     * Idempotency boundary for the invitation itself. The same key with the same
     * recipient/location/times returns the existing invitation instead of a second one.
     */
    idempotencyKey: string;
    /**
     * `prepare` mints the invitation and returns editable draft copy without enqueueing.
     * `send` (default) enqueues through tour invitation communications.
     */
    mode?: "prepare" | "send";
}): Promise<SendTourInvitationResult> {
    const orgId = String(args.orgId ?? "").trim();
    const opportunityId = String(args.opportunityId ?? "").trim();

    // `process_instance_id` is NOT selected: there is no such column on
    // `opportunities`. Selecting it made PostgREST reject the whole query, and
    // because only `data` was destructured that error was swallowed and returned
    // as `missing_opportunity` — "This record is no longer available." The
    // command therefore answered 404 for EVERY record in every tenant, and a
    // schema mismatch read as a missing record. It is optional and nullable end
    // to end (mintTourInvitation already defaults it to null), so nothing
    // downstream loses anything.
    const { data: oppRow, error: oppError } = await args.supabase
        .from("opportunities")
        .select("id, name, primary_person_id, location_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();

    // A failed lookup is NOT an absent record. Collapsing the two is exactly what
    // hid this for the life of the feature, so they now read differently.
    if (oppError) {
        console.error("[sendTourInvitation] opportunity lookup failed", {
            opportunity_id: opportunityId,
            code: (oppError as { code?: string }).code ?? null,
            message: oppError.message,
        });
        return {
            ok: false,
            code: "missing_opportunity",
            message:
                "The record could not be loaded, so nothing was sent. Please try again, and report this if it keeps happening.",
        };
    }
    if (!oppRow) {
        return { ok: false, code: "missing_opportunity", message: SEND_TOUR_INVITATION_OPERATOR_MESSAGE.missing_opportunity };
    }
    const opportunity = oppRow as {
        id: string;
        name: string | null;
        primary_person_id: string | null;
        location_id: string | null;
    };

    const locationId = String(args.locationId ?? opportunity.location_id ?? "").trim();
    if (!locationId) {
        return { ok: false, code: "missing_location", message: SEND_TOUR_INVITATION_OPERATOR_MESSAGE.missing_location };
    }

    // No booking exists yet, so the resolver falls through to the opportunity's party —
    // the same identity path a booking would have resolved to.
    const recipient: TourCommsParentRecipient | null = await resolveTourCommsParentRecipient({
        supabase: args.supabase,
        orgId,
        booking: { primary_person_id: null, primary_contact_id: null },
        opportunity,
    });
    if (!recipient || (!recipient.email && !recipient.smsTo)) {
        return { ok: false, code: "missing_recipient", message: SEND_TOUR_INVITATION_OPERATOR_MESSAGE.missing_recipient };
    }

    const [locRes, orgRes, orgSettingsRes] = await Promise.all([
        args.supabase
            .from("locations")
            .select("id, label, address1, address2, city, state, postal_code")
            .eq("org_id", orgId)
            .eq("id", locationId)
            .maybeSingle(),
        args.supabase.from("orgs").select("name").eq("id", orgId).maybeSingle(),
        args.supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle(),
    ]);
    const location = (locRes.data as Record<string, unknown> | null) ?? null;
    const locationLabel = location && typeof location.label === "string" ? location.label.trim() : "";
    const orgName =
        orgRes.data && typeof (orgRes.data as { name?: string }).name === "string"
            ? String((orgRes.data as { name: string }).name).trim()
            : null;
    const orgTimezone = resolveOrgTimezoneFromMetadata(
        (orgSettingsRes.data as { metadata?: unknown } | null)?.metadata ?? null
    ).iana;

    const from = new Date();
    const to = new Date(from.getTime() + OFFER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const slots = await computeAvailableTourSlots(args.supabase, { orgId, locationId, from, to });
    const offered = dedupeTourOptionsForRecipient(
        slots
            .slice(0, MAX_OFFERED_OPTIONS * 3)
            .map((s) =>
                toOption(s, locationLabel, formatTourOptionLabel(s.startAt, s.timezone || orgTimezone)),
            ),
    ).slice(0, MAX_OFFERED_OPTIONS);
    if (!offered.length) {
        return { ok: false, code: "no_available_times", message: SEND_TOUR_INVITATION_OPERATOR_MESSAGE.no_available_times };
    }

    const options = offered;

    // `fallbackActionUrl` is filled after minting — the token does not exist yet.
    const content: TourInvitationContent = {
        kind: "tour_invitation",
        text: String(args.messageText ?? "").trim(),
        options,
        primaryAction: { kind: "select_tour_slot", label: "Choose a time", actionRef: "select" },
        secondaryAction: { kind: "decline_tour", label: "Not right now", actionRef: "decline" },
        fallbackActionUrl: `${args.baseUrl.replace(/\/+$/, "")}/tour-booking`,
    };

    const violation = validateTourInvitationContent(content);
    if (violation) {
        return { ok: false, code: "invalid_content", message: violation.message };
    }

    const minted = await mintTourInvitation({
        supabase: args.supabase,
        orgId,
        recipientPersonId: recipient.personId,
        opportunityId,
        locationId,
        // No column links an opportunity to a process instance today; the mint
        // defaults this to null. Kept explicit so the absence is a decision.
        processInstanceId: null,
        content,
        createdByUserId: args.actorUserId ?? null,
        idempotencyKey: args.idempotencyKey,
    });
    if (!minted.ok) {
        return { ok: false, code: "mint_failed", message: minted.message };
    }

    const selectToken = findToken(minted.actions, "select_tour_slot");
    const viewToken = findToken(minted.actions, "view_tour_slots");
    const declineToken = findToken(minted.actions, "decline_tour");

    const urlByOptionId: Record<string, string> = {};
    if (selectToken) {
        for (const option of content.options) {
            const longUrl = actionUrl(args.baseUrl, selectToken, option.optionId);
            urlByOptionId[option.optionId] = await aliasTourBookingUrl({
                supabase: args.supabase,
                orgId,
                invitationId: minted.invitationId,
                longUrl,
            });
        }
    }

    const invitationLong = viewToken ? actionUrl(args.baseUrl, viewToken) : content.fallbackActionUrl;
    const declineLong = declineToken ? actionUrl(args.baseUrl, declineToken) : "";
    const invitationActionUrl = await aliasTourBookingUrl({
        supabase: args.supabase,
        orgId,
        invitationId: minted.invitationId,
        longUrl: invitationLong,
    });
    const declineUrl = declineLong
        ? await aliasTourBookingUrl({
              supabase: args.supabase,
              orgId,
              invitationId: minted.invitationId,
              longUrl: declineLong,
          })
        : "";

    const templateContext: TourCommsTemplateContext = {
        orgName,
        locationName: locationLabel || null,
        locationAddress: location ? formatLocationAddress(location as Parameters<typeof formatLocationAddress>[0]) : null,
        timezone: orgTimezone,
        parentName: recipient.displayName,
        childName: opportunity.name,
        opportunityName: opportunity.name,
        tourOptionsBlock: selectToken ? buildTourOptionsBlock(content, args.baseUrl, selectToken, urlByOptionId) : "",
        invitationActionUrl,
        declineUrl,
    };

    const { config } = await resolveTourCommsConfig(args.supabase, { orgId, locationId });

    // Prepare-only: mint + render editable drafts. Do not enqueue or mark invitation sent.
    if (args.mode === "prepare") {
        const email = renderTourCommsTemplate({
            eventKey: "tour_invitation",
            channel: "email",
            context: templateContext,
            templateOverrides: config.templates,
        });
        const sms = renderTourCommsTemplate({
            eventKey: "tour_invitation",
            channel: "sms",
            context: templateContext,
            templateOverrides: config.templates,
        });
        return {
            ok: true,
            invitationId: minted.invitationId,
            idempotentReplay: minted.idempotentReplay,
            optionCount: options.length,
            sentChannels: [],
            skippedReasons: ["prepare_only"],
            draft: {
                invitationId: minted.invitationId,
                recipientPersonId: recipient.personId,
                recipientDisplayName: recipient.displayName,
                recipientEmail: recipient.email,
                recipientPhone: recipient.smsTo,
                emailSubject: email?.channel === "email" ? email.subject : null,
                emailBody: email?.channel === "email" ? email.bodyText : null,
                smsBody: sms?.channel === "sms" ? sms.body : null,
                invitationActionUrl,
            },
        };
    }

    // Keyed on the offered times, so re-sending the same offer dedupes while a genuinely
    // new set of times is allowed to send again.
    const generationToken = `invitation:${minted.invitationId}:${options.map((o) => o.optionId).join("|")}`;

    const comms = await orchestrateTourInvitationComms({
        supabase: args.supabase,
        orgId,
        invitationId: minted.invitationId,
        opportunityId,
        locationId,
        config,
        context: templateContext,
        recipient,
        generationToken,
    });

    const sentChannels = comms.immediate.filter((r) => r.status === "sent").map((r) => r.channel);
    const skippedReasons = [
        ...comms.skippedReasons,
        ...comms.immediate.filter((r) => r.status !== "sent").map((r) => `${r.channel}:${r.reason ?? r.status}`),
    ];

    // `tour_invitation_activated` is the existing event for an invitation becoming live
    // to its recipient. `detail` carries only allow-listed keys — never a token.
    await recordTourEvent(args.supabase, {
        event: "tour_invitation_activated",
        orgId,
        invitationId: minted.invitationId,
        recipientPersonId: recipient.personId,
        opportunityId,
        detail: {
            slot_count: options.length,
            channel: sentChannels.join(","),
            idempotent_replay: minted.idempotentReplay,
        },
    });

    if (!sentChannels.length) {
        // A REPLAY that dispatches nothing is not a delivery failure. The comms
        // orchestrator dedupes on the offered times, so pressing the button twice
        // legitimately sends nothing the second time — and reporting
        // `nothing_sent` there told operators "the parent has no reachable email
        // or mobile number" about a parent who has both. Truthfully, the
        // invitation already went out and there was nothing new to send.
        if (minted.idempotentReplay) {
            return {
                ok: true,
                invitationId: minted.invitationId,
                idempotentReplay: true,
                optionCount: options.length,
                sentChannels: [],
                skippedReasons: ["already_sent"],
            };
        }
        // First send, nothing dispatched: the invitation exists and is valid, so
        // this genuinely is a delivery problem. Reported as such.
        return { ok: false, code: "nothing_sent", message: SEND_TOUR_INVITATION_OPERATOR_MESSAGE.nothing_sent };
    }

    return {
        ok: true,
        invitationId: minted.invitationId,
        idempotentReplay: minted.idempotentReplay,
        optionCount: options.length,
        sentChannels,
        skippedReasons,
    };
}
