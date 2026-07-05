import type { MetricDefinition, OipMetricKey, MetricSourceMetadata } from "@/lib/metrics/types";

const DEFINITIONS: Record<OipMetricKey, MetricDefinition> = {
    "enrollment.time_to_schedule_tour": {
        key: "enrollment.time_to_schedule_tour",
        label: "Time to schedule tour",
        description:
            "Median hours from opportunity creation to first confirmed tour booking. " +
            "Authoritative source: tour_bookings (first non-superseded confirmed row) vs opportunities.created_at.",
        pack: "enrollment",
        computationKind: "event_window",
        format: "duration",
        defaultWindow: "rolling_30d",
        sources: ["opportunities", "tour_bookings"],
        supportsDimensions: ["lifecycle_stage", "status_key"],
    },
    "enrollment.tour_conversion_rate": {
        key: "enrollment.tour_conversion_rate",
        label: "Tour conversion rate",
        description:
            "Share of scheduled tours that completed. Numerator: tour_bookings.status_key = completed. " +
            "Denominator: confirmed/completed/no_show bookings in window, excluding superseded rescheduled rows.",
        pack: "enrollment",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["tour_bookings"],
    },
    "enrollment.lead_count": {
        key: "enrollment.lead_count",
        label: "Lead count",
        description:
            "DEPRECATED alias of enrollment.active_leads (participant count). Prefer enrollment.active_leads.",
        pack: "enrollment",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["process_instances", "opportunities", "customer_members"],
        snapshotSemantics: true,
    },
    "enrollment.active_leads": {
        key: "enrollment.active_leads",
        label: "Active leads",
        description:
            "ACTIVE enrollment participants (children): live, not enrolled/withdrawn/not_enrolling. " +
            "Counts participants, not households; scoped to the work unit in work-unit context.",
        pack: "enrollment",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["process_instances", "opportunities", "customer_members"],
        snapshotSemantics: true,
    },
    "enrollment.new_leads": {
        key: "enrollment.new_leads",
        label: "New leads",
        description:
            "Enrollment participants in the Lead stage and undispositioned. Effective stage = " +
            "process_instances.stage_key ?? opportunities.stage_key. Participants, not households.",
        pack: "enrollment",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["process_instances", "opportunities", "customer_members"],
        snapshotSemantics: true,
    },
    "enrollment.waitlisted": {
        key: "enrollment.waitlisted",
        label: "Waitlisted",
        description:
            "Enrollment participants in the Waitlist stage or the waitlisted state. Participants, not households.",
        pack: "enrollment",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["process_instances", "opportunities", "customer_members"],
        snapshotSemantics: true,
    },
    "enrollment.tour_completed_count": {
        key: "enrollment.tour_completed_count",
        label: "Completed tours",
        description: "Count of tour bookings completed in the rolling window.",
        pack: "enrollment",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["tour_bookings"],
    },
    "comms.delivery_rate": {
        key: "comms.delivery_rate",
        label: "Delivery rate",
        description:
            "Delivered outbound messages / sent outbound messages in window. " +
            "Uses communication_delivery_events (delivered) and communication_messages (sent_at).",
        pack: "communications",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["communication_messages", "communication_delivery_events"],
    },
    "comms.reply_rate": {
        key: "comms.reply_rate",
        label: "Reply rate",
        description:
            "Outbound messages with replied_at / outbound messages sent in window (communication_messages).",
        pack: "communications",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["communication_messages"],
    },
    "comms.failed_delivery_count": {
        key: "comms.failed_delivery_count",
        label: "Failed deliveries",
        description:
            "Count of communication_delivery_events with event_type failed or bounced in window.",
        pack: "communications",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["communication_delivery_events"],
    },
    "forms.completion_rate": {
        key: "forms.completion_rate",
        label: "Form completion rate",
        description: "Submitted form_submissions / form_submissions created in window (status = submitted).",
        pack: "forms",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["form_submissions"],
    },
    "forms.packet_completion_time": {
        key: "forms.packet_completion_time",
        label: "Packet completion time",
        description:
            "Median hours from form_packet_sessions.created_at to completed_at for sessions completed in window.",
        pack: "forms",
        computationKind: "event_window",
        format: "duration",
        defaultWindow: "rolling_30d",
        sources: ["form_packet_sessions"],
    },
    "ops.work_overdue_count": {
        key: "ops.work_overdue_count",
        label: "Overdue work",
        description: "Count of open operational_tasks where due_at is before now(). Point-in-time snapshot.",
        pack: "operational_health",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["operational_tasks", "opportunities"],
        snapshotSemantics: true,
    },
    "ops.workflow_failure_rate": {
        key: "ops.workflow_failure_rate",
        label: "Workflow failure rate",
        description: "Failed workflow_runs / completed workflow_runs (non-pending) in window.",
        pack: "operational_health",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["workflow_runs"],
    },
    "ops.needs_attention_count": {
        key: "ops.needs_attention_count",
        label: "Needs attention",
        description:
            "Bounded snapshot: opportunities evaluated with resolveOpportunityAttention (cap 2000). " +
            "NOT exhaustive org total — matches evaluator snapshot semantics.",
        pack: "operational_health",
        computationKind: "evaluator_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["opportunities", "opportunityAttentionResolver"],
        snapshotSemantics: true,
    },
    "ops.readiness_gap_count": {
        key: "ops.readiness_gap_count",
        label: "Readiness gaps",
        description:
            "Bounded snapshot: opportunities with ≥1 readiness gap (cap 500). " +
            "NOT exhaustive — evaluateOperationalReadiness on recent in-scope rows.",
        pack: "operational_health",
        computationKind: "evaluator_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["opportunities", "evaluateOperationalReadiness"],
        snapshotSemantics: true,
    },
};

const KEYS = new Set<string>(Object.keys(DEFINITIONS));

export function isKnownOipMetricKey(key: string): key is OipMetricKey {
    return KEYS.has(key);
}

export function getMetricDefinition(key: OipMetricKey): MetricDefinition {
    return DEFINITIONS[key];
}

export function listMetricDefinitions(): readonly MetricDefinition[] {
    return Object.freeze(Object.values(DEFINITIONS));
}

export function listMetricDefinitionsByPack(pack: string): readonly MetricDefinition[] {
    return Object.freeze(DEFINITIONS_LIST.filter((d) => d.pack === pack));
}

const DEFINITIONS_LIST = Object.values(DEFINITIONS);

export function getMetricSourceMetadata(key: OipMetricKey): MetricSourceMetadata {
    const d = DEFINITIONS[key];
    return {
        key: d.key,
        pack: d.pack,
        computation_kind: d.computationKind,
        sources: d.sources,
        ...(d.snapshotSemantics ? { snapshot_semantics: true } : {}),
        ...(d.supportsDimensions?.length ? { supports_dimensions: d.supportsDimensions } : {}),
    };
}

export function parseOipMetricKeys(raw: string | null | undefined): OipMetricKey[] {
    if (!raw?.trim()) return [];
    const out: OipMetricKey[] = [];
    for (const part of raw.split(",")) {
        const k = part.trim();
        if (k && isKnownOipMetricKey(k) && !out.includes(k)) out.push(k);
    }
    return out;
}

export function findUnknownMetricKeys(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    const unknown: string[] = [];
    for (const part of raw.split(",")) {
        const k = part.trim();
        if (k && !isKnownOipMetricKey(k)) unknown.push(k);
    }
    return unknown;
}
