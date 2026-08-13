/**
 * Tour scheduling communications config (Band A).
 * Org/location overrides live in metadata JSON — see resolveTourCommsConfig.
 */

/** Allowed `communication_scheduled_sends.source` for tour reminder rows (Batch 1 migration). */
export const TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE = "tour_scheduling" as const;

export type TourSchedulingScheduledSendSource = typeof TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE;

/** Metadata keys on scheduled sends / messages for tour orchestration (Batch 4+). */
export const TOUR_COMMS_SCHEDULED_SEND_METADATA = {
    tourBookingId: "tour_booking_id",
    reminderKey: "reminder_key",
    scheduleGeneration: "schedule_generation",
    eventKey: "event_key",
    tourStartAt: "tour_start_at",
    locationId: "location_id",
    reason: "reason",
    quietHoursAdjusted: "quiet_hours_adjusted",
} as const;

/** Metadata keys on immediate outbound messages (Batch 5+). */
export const TOUR_COMMS_OUTBOUND_METADATA = {
    source: "source",
    tourBookingId: "tour_booking_id",
    /** Set instead of `tourBookingId` for `tour_invitation` — an invitation has no booking yet. */
    tourInvitationId: "tour_invitation_id",
    opportunityId: "opportunity_id",
    eventKey: "event_key",
    channel: "channel",
    idempotencyKey: "idempotency_key",
    sendGeneration: "send_generation",
    lifecycleAction: "lifecycle_action",
    recipientPersonId: "recipient_person_id",
    communicationScheduledSendId: "communication_scheduled_send_id",
} as const;

export const TOUR_COMMS_OUTBOUND_SOURCE = "tour_scheduling" as const;

export type TourCommsChannel = "email" | "sms";

export const TOUR_COMMS_CHANNELS: readonly TourCommsChannel[] = ["email", "sms"];

/**
 * Logical notification kinds — maps to template registry entries and orchestrator branches.
 * Distinct from workflow `event_type` strings on tour_bookings.
 */
export type TourCommsEventKey =
    | "tour_invitation"
    | "tour_confirmation"
    | "tour_reminder"
    | "tour_reschedule"
    | "tour_cancel"
    | "tour_no_show_followup"
    | "tour_pending_internal";

export const TOUR_COMMS_EVENT_KEYS: readonly TourCommsEventKey[] = [
    // `tour_invitation` precedes a booking; every other key describes one that already exists.
    "tour_invitation",
    "tour_confirmation",
    "tour_reminder",
    "tour_reschedule",
    "tour_cancel",
    "tour_no_show_followup",
    "tour_pending_internal",
];

export type TourCommsQuietHoursTimezoneSource = "booking" | "org";

export type TourCommsQuietHoursDeferPolicy = "next_window_end" | "next_morning";

export type TourCommsQuietHoursConfig = {
    enabled: boolean;
    /** Local wall-clock start of quiet window (`HH:mm`). */
    start: string;
    /** Local wall-clock end of quiet window (`HH:mm`). */
    end: string;
    timezone_source: TourCommsQuietHoursTimezoneSource;
    /** When true, confirmation sends may be deferred (default false). */
    apply_to_confirmation: boolean;
    defer_policy: TourCommsQuietHoursDeferPolicy;
    /** Used when defer_policy is `next_morning` (default `08:00`). */
    next_morning_time: string;
};

export type TourReminderOffset = {
    /** Stable id for dedupe (`communication_scheduled_sends.metadata.reminder_key`). */
    reminder_key: string;
    /** Minutes before `tour_bookings.start_at` (positive number, e.g. 1440 = 24h). */
    offset_minutes: number;
    channels: TourCommsChannel[];
};

/**
 * Internal staff who receive Tour calendar/notification artifacts (not parent-facing mail).
 * Configured recipients — not a Tour Host ownership model.
 */
export type TourCommsInternalRecipientsPolicy = {
    enabled: boolean;
    /** Canonical staff auth user ids. Supports 0 / 1 / many. */
    user_ids: string[];
};

/**
 * Who receives automated parent-facing Tour communications (confirmation, reminder, etc.).
 * Operator-initiated Send Tour Invitation still allows composer recipient override.
 */
export type TourCommsParentRecipientPolicy = "primary_contact";

export type TourCommsIcsPolicy = {
    /** Link or embed ICS in confirmation email (Batch 3+). */
    include_in_confirmation_email: boolean;
    /** Allow token-scoped public ICS download (Batch 3+). */
    public_download_enabled: boolean;
};

export type TourCommsTemplate = {
    subject?: string;
    body_text?: string;
    body_html?: string;
};

export type TourCommsTemplates = Partial<Record<TourCommsEventKey, Partial<Record<TourCommsChannel, TourCommsTemplate>>>>;

export type TourCommsConfig = {
    /** Master switch for automated tour comms (orchestrator Batch 5+). */
    enabled: boolean;
    /**
     * Channel master switches. Reminder rows still declare their own `channels`;
     * effective send = intersection with this map and recipient eligibility.
     */
    channels: Record<TourCommsChannel, boolean>;
    /**
     * Zero or more reminder timers before `tour_bookings.start_at`.
     * Seed one 24h entry; orgs may add 48h/72h (or any offset_minutes) without schema change.
     */
    reminder_offsets: TourReminderOffset[];
    quiet_hours: TourCommsQuietHoursConfig;
    /**
     * Staff calendar/notification recipients for scheduled Tours.
     * Independent of parent templates — delivery policy, not content ownership.
     */
    internal_recipients: TourCommsInternalRecipientsPolicy;
    /** Default recipient policy for automated Tour parent messages. */
    parent_recipient_policy: TourCommsParentRecipientPolicy;
    /**
     * When true, reminder templates may include Confirm I'm coming / Reply 1.
     * When false, reminder is informational only. Never gates booking validity.
     */
    ask_parent_confirm_attendance: boolean;
    ics: TourCommsIcsPolicy;
    templates: TourCommsTemplates;
    /** Do not schedule reminders closer than this many minutes before start (default 15). */
    min_reminder_lead_minutes: number;
};

/** JSON shape under `org_settings.metadata.tour_comms` or `locations.metadata.tour_comms`. */
export type TourCommsConfigMetadataFragment = Partial<TourCommsConfig>;

export type ResolveTourCommsConfigInput = {
    orgId: string;
    locationId?: string | null;
};

export type ResolveTourCommsConfigResult = {
    config: TourCommsConfig;
    sources: {
        org: boolean;
        location: boolean;
    };
};

const HH_MM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_TOUR_COMMS_CONFIG: TourCommsConfig = {
    // Platform seed — tenants override via org_settings.metadata.tour_comms (or location).
    enabled: true,
    channels: { email: true, sms: false },
    reminder_offsets: [
        // Single seeded timer; add more rows (48h/72h/…) via config — do not hardcode forever.
        { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email"] },
    ],
    quiet_hours: {
        enabled: true,
        start: "21:00",
        end: "08:00",
        timezone_source: "booking",
        apply_to_confirmation: false,
        defer_policy: "next_morning",
        next_morning_time: "08:00",
    },
    internal_recipients: {
        enabled: true,
        user_ids: [],
    },
    parent_recipient_policy: "primary_contact",
    ask_parent_confirm_attendance: true,
    ics: {
        include_in_confirmation_email: true,
        public_download_enabled: true,
    },
    templates: {},
    min_reminder_lead_minutes: 15,
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseHHmm(raw: unknown, fallback: string): string {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s && HH_MM_RE.test(s)) return s;
    return fallback;
}

function parseChannel(raw: unknown): TourCommsChannel | null {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (s === "email" || s === "sms") return s;
    return null;
}

function parseChannelsRecord(raw: unknown, base: Record<TourCommsChannel, boolean>): Record<TourCommsChannel, boolean> {
    if (!isRecord(raw)) return { ...base };
    const out = { ...base };
    for (const ch of TOUR_COMMS_CHANNELS) {
        if (typeof raw[ch] === "boolean") out[ch] = raw[ch];
    }
    return out;
}

function parseReminderOffsets(raw: unknown, fallback: TourReminderOffset[]): TourReminderOffset[] {
    if (!Array.isArray(raw)) return fallback.map((r) => ({ ...r, channels: [...r.channels] }));
    const out: TourReminderOffset[] = [];
    for (const item of raw) {
        if (!isRecord(item)) continue;
        const key = typeof item.reminder_key === "string" ? item.reminder_key.trim() : "";
        const off = typeof item.offset_minutes === "number" ? item.offset_minutes : Number(item.offset_minutes);
        if (!key || !Number.isFinite(off) || off <= 0) continue;
        const channels: TourCommsChannel[] = [];
        if (Array.isArray(item.channels)) {
            for (const c of item.channels) {
                const ch = parseChannel(c);
                if (ch && !channels.includes(ch)) channels.push(ch);
            }
        }
        if (channels.length === 0) continue;
        out.push({ reminder_key: key, offset_minutes: Math.floor(off), channels });
    }
    return out.length > 0 ? out : fallback.map((r) => ({ ...r, channels: [...r.channels] }));
}

function parseQuietHours(raw: unknown, base: TourCommsQuietHoursConfig): TourCommsQuietHoursConfig {
    if (!isRecord(raw)) return { ...base };
    const tzSrc = raw.timezone_source === "org" ? "org" : raw.timezone_source === "booking" ? "booking" : base.timezone_source;
    const defer =
        raw.defer_policy === "next_window_end" || raw.defer_policy === "next_morning" ? raw.defer_policy : base.defer_policy;
    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
        start: parseHHmm(raw.start, base.start),
        end: parseHHmm(raw.end, base.end),
        timezone_source: tzSrc,
        apply_to_confirmation: typeof raw.apply_to_confirmation === "boolean" ? raw.apply_to_confirmation : base.apply_to_confirmation,
        defer_policy: defer,
        next_morning_time: parseHHmm(raw.next_morning_time, base.next_morning_time),
    };
}

function parseInternalRecipients(
    raw: unknown,
    base: TourCommsInternalRecipientsPolicy,
): TourCommsInternalRecipientsPolicy {
    if (!isRecord(raw)) return { ...base, user_ids: [...base.user_ids] };
    const userIds: string[] = [];
    if (Array.isArray(raw.user_ids)) {
        for (const item of raw.user_ids) {
            const id = typeof item === "string" ? item.trim() : "";
            if (id && !userIds.includes(id)) userIds.push(id);
        }
    }
    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
        user_ids: userIds,
    };
}

function parseParentRecipientPolicy(raw: unknown, base: TourCommsParentRecipientPolicy): TourCommsParentRecipientPolicy {
    if (raw === "primary_contact") return "primary_contact";
    return base;
}

function parseIcs(raw: unknown, base: TourCommsIcsPolicy): TourCommsIcsPolicy {
    if (!isRecord(raw)) return { ...base };
    return {
        include_in_confirmation_email:
            typeof raw.include_in_confirmation_email === "boolean"
                ? raw.include_in_confirmation_email
                : base.include_in_confirmation_email,
        public_download_enabled:
            typeof raw.public_download_enabled === "boolean" ? raw.public_download_enabled : base.public_download_enabled,
    };
}

function parseTemplate(raw: unknown): TourCommsTemplate | null {
    if (!isRecord(raw)) return null;
    const t: TourCommsTemplate = {};
    if (typeof raw.subject === "string" && raw.subject.trim()) t.subject = raw.subject.trim();
    if (typeof raw.body_text === "string" && raw.body_text.trim()) t.body_text = raw.body_text;
    if (typeof raw.body_html === "string" && raw.body_html.trim()) t.body_html = raw.body_html;
    return Object.keys(t).length > 0 ? t : null;
}

function parseTemplates(raw: unknown, base: TourCommsTemplates): TourCommsTemplates {
    if (!isRecord(raw)) return { ...base };
    const out: TourCommsTemplates = { ...base };
    for (const eventKey of TOUR_COMMS_EVENT_KEYS) {
        const ev = raw[eventKey];
        if (!isRecord(ev)) continue;
        const merged: Partial<Record<TourCommsChannel, TourCommsTemplate>> = { ...(out[eventKey] ?? {}) };
        for (const ch of TOUR_COMMS_CHANNELS) {
            const t = parseTemplate(ev[ch]);
            if (t) merged[ch] = t;
        }
        if (Object.keys(merged).length > 0) out[eventKey] = merged;
    }
    return out;
}

/**
 * Sanitize a partial config fragment from metadata (never throws).
 */
export function parseTourCommsConfigFragment(raw: unknown): TourCommsConfigMetadataFragment {
    if (!isRecord(raw)) return {};
    const fragment: TourCommsConfigMetadataFragment = {};
    if (typeof raw.enabled === "boolean") fragment.enabled = raw.enabled;
    if (isRecord(raw.channels)) fragment.channels = parseChannelsRecord(raw.channels, DEFAULT_TOUR_COMMS_CONFIG.channels);
    if (raw.reminder_offsets !== undefined) fragment.reminder_offsets = parseReminderOffsets(raw.reminder_offsets, DEFAULT_TOUR_COMMS_CONFIG.reminder_offsets);
    if (isRecord(raw.quiet_hours)) fragment.quiet_hours = parseQuietHours(raw.quiet_hours, DEFAULT_TOUR_COMMS_CONFIG.quiet_hours);
    if (isRecord(raw.internal_recipients)) {
        fragment.internal_recipients = parseInternalRecipients(
            raw.internal_recipients,
            DEFAULT_TOUR_COMMS_CONFIG.internal_recipients,
        );
    }
    if (raw.parent_recipient_policy !== undefined) {
        fragment.parent_recipient_policy = parseParentRecipientPolicy(
            raw.parent_recipient_policy,
            DEFAULT_TOUR_COMMS_CONFIG.parent_recipient_policy,
        );
    }
    if (typeof raw.ask_parent_confirm_attendance === "boolean") {
        fragment.ask_parent_confirm_attendance = raw.ask_parent_confirm_attendance;
    }
    if (isRecord(raw.ics)) fragment.ics = parseIcs(raw.ics, DEFAULT_TOUR_COMMS_CONFIG.ics);
    if (isRecord(raw.templates)) fragment.templates = parseTemplates(raw.templates, DEFAULT_TOUR_COMMS_CONFIG.templates);
    if (typeof raw.min_reminder_lead_minutes === "number" && Number.isFinite(raw.min_reminder_lead_minutes)) {
        fragment.min_reminder_lead_minutes = Math.max(0, Math.floor(raw.min_reminder_lead_minutes));
    }
    return fragment;
}

/** Extract `tour_comms` object from org_settings or locations metadata. */
export function extractTourCommsMetadataRoot(metadata: unknown): unknown {
    if (!isRecord(metadata)) return null;
    return metadata.tour_comms ?? null;
}

/**
 * Merge default → org fragment → location fragment into a full TourCommsConfig.
 */
function mergeQuietHours(
    org: TourCommsQuietHoursConfig,
    location: TourCommsQuietHoursConfig | undefined,
    base: TourCommsQuietHoursConfig
): TourCommsQuietHoursConfig {
    if (!location) return org;
    const out = { ...org };
    if (location.enabled !== base.enabled) out.enabled = location.enabled;
    if (location.start !== base.start) out.start = location.start;
    if (location.end !== base.end) out.end = location.end;
    if (location.timezone_source !== base.timezone_source) out.timezone_source = location.timezone_source;
    if (location.apply_to_confirmation !== base.apply_to_confirmation) out.apply_to_confirmation = location.apply_to_confirmation;
    if (location.defer_policy !== base.defer_policy) out.defer_policy = location.defer_policy;
    if (location.next_morning_time !== base.next_morning_time) out.next_morning_time = location.next_morning_time;
    return out;
}

function mergeIcs(org: TourCommsIcsPolicy, location: TourCommsIcsPolicy | undefined, base: TourCommsIcsPolicy): TourCommsIcsPolicy {
    if (!location) return org;
    const out = { ...org };
    if (location.include_in_confirmation_email !== base.include_in_confirmation_email) {
        out.include_in_confirmation_email = location.include_in_confirmation_email;
    }
    if (location.public_download_enabled !== base.public_download_enabled) {
        out.public_download_enabled = location.public_download_enabled;
    }
    return out;
}

export function mergeTourCommsConfig(
    orgFragment: TourCommsConfigMetadataFragment,
    locationFragment: TourCommsConfigMetadataFragment
): TourCommsConfig {
    const base = DEFAULT_TOUR_COMMS_CONFIG;
    const orgQuiet = orgFragment.quiet_hours ?? base.quiet_hours;
    const orgIcs = orgFragment.ics ?? base.ics;
    const internal =
        locationFragment.internal_recipients
        ?? orgFragment.internal_recipients
        ?? base.internal_recipients;

    return {
        enabled: locationFragment.enabled ?? orgFragment.enabled ?? base.enabled,
        channels: parseChannelsRecord(locationFragment.channels ?? orgFragment.channels, base.channels),
        reminder_offsets: locationFragment.reminder_offsets ?? orgFragment.reminder_offsets ?? base.reminder_offsets,
        quiet_hours: mergeQuietHours(orgQuiet, locationFragment.quiet_hours, base.quiet_hours),
        internal_recipients: {
            enabled: internal.enabled,
            user_ids: [...internal.user_ids],
        },
        parent_recipient_policy:
            locationFragment.parent_recipient_policy
            ?? orgFragment.parent_recipient_policy
            ?? base.parent_recipient_policy,
        ask_parent_confirm_attendance:
            locationFragment.ask_parent_confirm_attendance
            ?? orgFragment.ask_parent_confirm_attendance
            ?? base.ask_parent_confirm_attendance,
        ics: mergeIcs(orgIcs, locationFragment.ics, base.ics),
        templates: {
            ...(orgFragment.templates ?? {}),
            ...(locationFragment.templates ?? {}),
        },
        min_reminder_lead_minutes:
            locationFragment.min_reminder_lead_minutes ?? orgFragment.min_reminder_lead_minutes ?? base.min_reminder_lead_minutes,
    };
}
