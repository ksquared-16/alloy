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
    "enrollment.active_families": {
        key: "enrollment.active_families",
        label: "Active families",
        description:
            "Distinct live enrollment opportunities (cases/households) with at least one active-lead participant. " +
            "Same live predicate as enrollment.active_leads, counted at opportunity grain.",
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
    // ---- Trust: governed reasoning execution --------------------------------
    // Every definition below is org-scope only: no Trust table carries a site,
    // location or work-unit column, so a site figure cannot be computed and must
    // not be faked from the org figure.
    "trust.governed_decisions_created": {
        key: "trust.governed_decisions_created",
        label: "Governed decisions requested",
        description:
            "Decision Contracts submitted in the window. This is REQUESTED work, not completed work \u2014 " +
            "a contract exists from the moment a capability asks for a decision. " +
            "Authoritative source: trust_decision_contracts.created_at.",
        pack: "trust",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_contracts"],
        orgScopeOnly: true,
    },
    "trust.governed_decisions_completed": {
        key: "trust.governed_decisions_completed",
        label: "Governed decisions completed",
        description:
            "Decision Packages produced in the window. One completed contract produces exactly one package, " +
            "so this is completed work and is deliberately distinct from decisions requested. " +
            "Authoritative source: trust_decision_packages.created_at.",
        pack: "trust",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_packages"],
        orgScopeOnly: true,
    },
    "trust.recommendation_rate": {
        key: "trust.recommendation_rate",
        label: "Recommendation rate",
        description:
            "Share of completed decisions that produced a recommendation. " +
            "Numerator: packages with outcome = recommended. Denominator: all packages in window. " +
            "Null when no decision completed.",
        pack: "trust",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_packages"],
        orgScopeOnly: true,
    },
    "trust.governed_refusal_rate": {
        key: "trust.governed_refusal_rate",
        label: "Governed refusal rate",
        description:
            "Share of completed decisions the platform deliberately REFUSED \u2014 policy, permission, " +
            "unsupported class, insufficient information, privacy or budget. " +
            "Excludes failed_validation and failed_reasoning, which are failures rather than refusals. " +
            "Denominator: all packages in window.",
        pack: "trust",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_packages"],
        orgScopeOnly: true,
    },
    "trust.reasoning_failure_rate": {
        key: "trust.reasoning_failure_rate",
        label: "Reasoning failure rate",
        description:
            "Share of completed decisions that FAILED rather than refused: failed_validation or failed_reasoning. " +
            "Kept separate from the refusal rate because a deliberate refusal and a broken execution are " +
            "different operational events. Denominator: all packages in window.",
        pack: "trust",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_packages"],
        orgScopeOnly: true,
    },
    "trust.deterministic_resolution_rate": {
        key: "trust.deterministic_resolution_rate",
        label: "Deterministic resolution rate",
        description:
            "Share of governed decisions resolved without escalating beyond deterministic reasoning. " +
            "Numerator: usage rows with escalation_level = 0. Denominator: all usage rows in window. " +
            "Local-model execution is NOT distinguishable from deterministic in the current schema.",
        pack: "trust",
        computationKind: "event_window",
        format: "percent",
        defaultWindow: "rolling_30d",
        sources: ["trust_reasoning_usage"],
        orgScopeOnly: true,
    },
    "trust.escalated_decision_count": {
        key: "trust.escalated_decision_count",
        label: "Escalated decisions",
        description:
            "Governed decisions that escalated beyond deterministic reasoning (escalation_level > 0). " +
            "This counts escalation DEPTH, not provider usage \u2014 the schema records no provider identity. " +
            "Authoritative source: trust_reasoning_usage.escalation_level.",
        pack: "trust",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["trust_reasoning_usage"],
        orgScopeOnly: true,
    },
    "trust.reasoning_latency_p50": {
        key: "trust.reasoning_latency_p50",
        label: "Reasoning latency (median)",
        description:
            "Median end-to-end governed-decision latency, reported in hours to match the platform duration format. " +
            "Covers the whole runtime pass; validation latency is not persisted separately. " +
            "Authoritative source: trust_reasoning_usage.latency_ms.",
        pack: "trust",
        computationKind: "event_window",
        format: "duration",
        defaultWindow: "rolling_30d",
        sources: ["trust_reasoning_usage"],
        orgScopeOnly: true,
    },
    "trust.provider_cost_units": {
        key: "trust.provider_cost_units",
        label: "Provider cost units",
        description:
            "Total provider cost units consumed by governed reasoning in the window. " +
            "Read from the usage/economics record, never from a Decision Package (ADR-2). " +
            "Structurally zero until a provider-backed strategy runs. Decimal precision is preserved.",
        pack: "trust",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["trust_reasoning_usage"],
        orgScopeOnly: true,
    },
    "trust.executions_committed_count": {
        key: "trust.executions_committed_count",
        label: "Committed executions",
        description:
            "Decision Packages an execution authority committed, counted from append-only execution observations. " +
            "Accepted is NOT executed: only an `executed` observation counts. " +
            "Deduplicated by package, so a replayed observation cannot inflate the figure.",
        pack: "trust",
        computationKind: "event_window",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["trust_decision_observations"],
        orgScopeOnly: true,
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
