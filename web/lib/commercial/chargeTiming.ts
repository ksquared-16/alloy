/**
 * Catalog charge timing — separates scheduled billing frequencies from event triggers.
 * Authoring model only; billing runtime still reads cadence_key.
 */

export const CHARGE_TIMING_MODES = ["scheduled", "event_driven"] as const;
export type ChargeTimingMode = (typeof CHARGE_TIMING_MODES)[number];

export const CHARGE_TIMING_META_KEY = "charge_timing";
export const EVENT_TRIGGER_META_KEY = "event_trigger";

/** Scheduled frequencies (cadence_key). Per Session is scheduled, not an event trigger. */
export const SCHEDULED_FREQUENCY_OPTIONS: { key: string; label: string }[] = [
    { key: "", label: "One-time" },
    { key: "weekly", label: "Weekly" },
    { key: "biweekly", label: "Bi-weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "annual", label: "Annual" },
    { key: "daily", label: "Daily" },
    { key: "hourly", label: "Hourly" },
    { key: "per_session", label: "Per Session" },
];

/** Event-driven triggers stored in product metadata (not cadence_key). */
export const EVENT_TRIGGER_OPTIONS: { key: string; label: string }[] = [
    { key: "late_pickup", label: "Late Pickup" },
    { key: "returned_payment", label: "Returned Payment" },
    { key: "late_payment", label: "Late Payment" },
    { key: "attendance_exception", label: "Attendance Exception" },
    { key: "manual", label: "Manual" },
    { key: "workflow", label: "Workflow" },
];

export function isChargeTimingMode(v: unknown): v is ChargeTimingMode {
    return v === "scheduled" || v === "event_driven";
}

export function readChargeTiming(metadata: Record<string, unknown> | null | undefined): {
    mode: ChargeTimingMode;
    eventTrigger: string | null;
} {
    const meta = metadata ?? {};
    const rawMode = meta[CHARGE_TIMING_META_KEY];
    const eventTrigger =
        typeof meta[EVENT_TRIGGER_META_KEY] === "string" && String(meta[EVENT_TRIGGER_META_KEY]).trim()
            ? String(meta[EVENT_TRIGGER_META_KEY]).trim()
            : null;
    if (isChargeTimingMode(rawMode)) {
        return { mode: rawMode, eventTrigger: rawMode === "event_driven" ? eventTrigger : null };
    }
    // Legacy: presence of event_trigger implies event-driven.
    if (eventTrigger) return { mode: "event_driven", eventTrigger };
    return { mode: "scheduled", eventTrigger: null };
}

export function writeChargeTimingMetadata(
    metadata: Record<string, unknown>,
    input: { mode: ChargeTimingMode; eventTrigger?: string | null },
): Record<string, unknown> {
    const next: Record<string, unknown> = { ...metadata, [CHARGE_TIMING_META_KEY]: input.mode };
    if (input.mode === "event_driven") {
        const trigger = (input.eventTrigger ?? "").trim();
        if (trigger) next[EVENT_TRIGGER_META_KEY] = trigger;
        else delete next[EVENT_TRIGGER_META_KEY];
    } else {
        delete next[EVENT_TRIGGER_META_KEY];
    }
    return next;
}

export function eventTriggerLabel(key: string | null | undefined): string {
    if (!key) return "Event";
    return EVENT_TRIGGER_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function chargeTimingSummary(input: {
    mode: ChargeTimingMode;
    cadenceKey: string | null;
    eventTrigger: string | null;
    cadenceLabel?: string | null;
}): string {
    if (input.mode === "event_driven") {
        return `Event · ${eventTriggerLabel(input.eventTrigger)}`;
    }
    if (input.cadenceLabel) return `Scheduled · ${input.cadenceLabel}`;
    if (!input.cadenceKey) return "Scheduled · One-time";
    const opt = SCHEDULED_FREQUENCY_OPTIONS.find((o) => o.key === input.cadenceKey);
    return `Scheduled · ${opt?.label ?? input.cadenceKey}`;
}
