/**
 * Communications V2 — telemetry scaffold.
 *
 * Typed event catalog for communication health + deliverability, plus a best-effort
 * emit shim over the canonical `emitEvent` layer (`web/lib/emitEvent.ts`). Telemetry is
 * non-critical: `emitCommsV2Event` NEVER throws in the request path — it swallows and logs
 * errors and returns null on failure. Server-side only (emitEvent uses the admin client).
 *
 * PKG-01 (Communications V2). No dashboards yet — this only standardizes event names + emit.
 */

import { emitEvent, type EmitEventInput } from "@/lib/emitEvent";

export const COMMS_V2_EVENTS = [
    "comm_health_computed",
    "delivery_event_recorded",
    "message_receipt_updated",
    "consent_changed",
    "conversation_assigned",
    "sla_state_changed",
    "template_rendered",
    "announcement_sent",
] as const;

export type CommsV2Event = (typeof COMMS_V2_EVENTS)[number];

/** Namespaced event_type written to workflow_events, e.g. "comms_v2.consent_changed". */
export function commsV2EventType(event: CommsV2Event): string {
    return `comms_v2.${event}`;
}

export type CommsV2TelemetryInput = {
    org_id: string | null;
    event: CommsV2Event;
    entity_type?: string | null;
    entity_id?: string | null;
    payload?: Record<string, unknown>;
};

/**
 * Best-effort telemetry emit for Communications V2. Wraps `emitEvent`; returns the event id
 * on success or null on failure. Intentionally never throws — telemetry must not break a send,
 * an assignment, or a consent change.
 */
export async function emitCommsV2Event(input: CommsV2TelemetryInput): Promise<string | null> {
    try {
        const evtInput: EmitEventInput = {
            org_id: input.org_id,
            event_type: commsV2EventType(input.event),
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            payload: input.payload ?? {},
        };
        return await emitEvent(evtInput);
    } catch (err) {
        // Best-effort: log and continue. Never propagate telemetry failures to callers.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`emitCommsV2Event: swallowed telemetry error for "${input.event}": ${message}`);
        return null;
    }
}
