import type {
    MetricDefinition,
    MetricSnapshotPolicy,
    MetricSourceMetadata,
    OipMetricKey,
} from "@/lib/metrics/types";

const DEFINITIONS: Record<OipMetricKey, MetricDefinition> = {
    "attendance.occupancy_count": {
        key: "attendance.occupancy_count",
        label: "Children on site now",
        description:
            "How many children are physically present across the readable sites at this instant. " +
            "Authoritative source: occupancyAt, the certified point-in-time whereabouts fold. " +
            "NOT a daily summary - summarizeAttendanceByDay returns the SET of rooms a child " +
            "appeared in, so a child who moved twice would be counted three times. Movement " +
            "changes this value and never changes placement. A per-location breakdown rides in " +
            "meta because the platform dimension vocabulary has no location member yet.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "locations"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.expected_count": {
        key: "attendance.expected_count",
        label: "Expected today",
        description:
            "How many children are expected at the site today, after known operational intent is applied. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.here_now_count": {
        key: "attendance.here_now_count",
        label: "Here now",
        description:
            "How many children are physically in the building right now, including any who attended despite a plan. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.not_arrived_count": {
        key: "attendance.not_arrived_count",
        label: "Not arrived (unexplained)",
        description:
            "How many expected children have not arrived and have no explanation. Known-away, closed and attended-despite-plan children are explained and excluded. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.checked_out_count": {
        key: "attendance.checked_out_count",
        label: "Checked out",
        description:
            "How many children have been collected and are no longer on site today. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.known_away_count": {
        key: "attendance.known_away_count",
        label: "Known away",
        description:
            "How many children are away today for a recorded reason - sickness, holiday, or any authored absence. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
    "attendance.unknown_state_count": {
        key: "attendance.unknown_state_count",
        label: "Unresolved service day",
        description:
            "How many children whose service day could not be resolved. A data-integrity signal, not a missing child. " +
            "Authoritative source: buildCombinedRoster, which applies interpretServiceDay and " +
            "applyObservedPresence - the Thread 3/4 owners. This metric counts their answer and " +
            "does not classify service-day state itself.",
        pack: "attendance",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_24h",
        sources: ["child_attendance_events", "operational_expectations", "child_enrollment_agreements"],
        snapshotSemantics: true,
        snapshotPolicy: "live_only",
    },
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
            "Counts participants across the Enrollment process footprint (department), including Waitlist; " +
            "not limited to opportunities parked on a single work unit.",
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
            "Local-model execution is now distinguishable: `trust_reasoning_usage.execution_location` records it when an adapter asserts it.",
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
            "This counts escalation DEPTH, not provider usage; provider identity is recorded separately in `provider_key`. " +
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

    /*
     * ── FINANCIALS ────────────────────────────────────────────────────────────────────────
     *
     * Seven, because there are seven distinct questions with a canonical owner — not because
     * a landing page has room for a grid. Each one names the thread it quotes in its
     * description, so a figure that later disagrees with a family's card can be traced to a
     * reading rather than argued about.
     *
     * TWO WORDS DO NOT APPEAR HERE, DELIBERATELY.
     *
     * "Accounts Receivable" — there is no receivables accounting behind these numbers, only
     * Thread 8's outstanding predicate. Calling a scoped sum of it A/R would promise ageing
     * buckets, allowances and a subledger that do not exist.
     *
     * "Revenue" — posted charges are billed amounts. Recognised revenue needs a
     * revenue-recognition policy, deferral and a chart of accounts, and the childcare spine
     * has none of the three (the platform's `gl_*` tables belong to the job vertical and are
     * dormant). So the metric is `gross_charges_posted_amount` and says what it is.
     *
     * All seven carry `snapshotSemantics` because the underlying projections scan a capped
     * cohort and report when the cap was hit. A capped total that presents itself as org
     * truth is the specific way a money figure lies.
     */
    "financials.outstanding_amount": {
        key: "financials.outstanding_amount",
        label: "Outstanding",
        description:
            "What posted childcare charges still owe, in scope. Thread 8's predicate — posted charge "
            + "less active applications of posted payments — summed over the scoped cohort by "
            + "resolveFinancialPositionCohort. NOT Accounts Receivable: no receivables accounting, "
            + "ageing or allowance exists behind it. Never derived from journal rows.",
        pack: "financials",
        computationKind: "entity_snapshot",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["charges", "payment_allocations", "payments", "financial_reduction_applications"],
        snapshotSemantics: true,
    },
    "financials.currently_collectible_amount": {
        key: "financials.currently_collectible_amount",
        label: "Collectible now",
        description:
            "Outstanding less governed submitted-claim suppression (Thread 9, Director decision B): "
            + "what may actually be collected from families right now. A submitted subsidy claim "
            + "suppresses collection for what it attributed, so families are not chased for money an "
            + "agency has been asked for. Subsidy is not a discount and is not netted into a balance.",
        pack: "financials",
        computationKind: "entity_snapshot",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["charges", "payment_allocations", "payments", "financial_subsidy_claims", "financial_subsidy_claim_lines"],
        snapshotSemantics: true,
    },
    "financials.gross_charges_posted_amount": {
        key: "financials.gross_charges_posted_amount",
        label: "Gross charges posted",
        description:
            "Thread 1's gross on childcare charges POSTED inside the window — what was billed, by the "
            + "moment it became owed rather than by when care happened. This is a billed amount, not "
            + "recognised revenue: the platform has no revenue-recognition model. Reductions are "
            + "reported separately and are not netted in.",
        pack: "financials",
        computationKind: "event_window",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["charges", "financial_reduction_applications"],
        snapshotSemantics: true,
    },
    "financials.payments_received_amount": {
        key: "financials.payments_received_amount",
        label: "Payments received",
        description:
            "Posted, inbound childcare payments that ARRIVED inside the window (Thread 8). Pending "
            + "payments have not arrived; refunds are outbound and are reported beside this, never as "
            + "a negative receipt.",
        pack: "financials",
        computationKind: "event_window",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["payments", "payment_allocations"],
        snapshotSemantics: true,
    },
    "financials.unapplied_payments_amount": {
        key: "financials.unapplied_payments_amount",
        label: "Unapplied payments",
        description:
            "Money that arrived and is not settling anything: posted inbound payment amount less its "
            + "ACTIVE allocations, the same definition the account card renders. Deliberately not "
            + "windowed — a receipt unapplied since last month is the one that most needs finding.",
        pack: "financials",
        computationKind: "entity_snapshot",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["payments", "payment_allocations"],
        snapshotSemantics: true,
    },
    "financials.unresolved_subsidy_variance_amount": {
        key: "financials.unresolved_subsidy_variance_amount",
        label: "Unresolved subsidy variance",
        description:
            "Signed difference between what was claimed and what an agency paid, on variances nobody "
            + "has decided about yet (Thread 9). Negative is short-paid or denied. Reported BESIDE "
            + "collectible and never folded into it: a shortfall is a decision somebody owes, not a "
            + "bill a family silently inherits.",
        pack: "financials",
        computationKind: "entity_snapshot",
        format: "currency",
        defaultWindow: "rolling_30d",
        sources: ["financial_subsidy_variances", "financial_subsidy_claim_lines"],
        snapshotSemantics: true,
    },
    "financials.charges_awaiting_post_count": {
        key: "financials.charges_awaiting_post_count",
        label: "Charges awaiting posting",
        description:
            "Draft childcare charges an operator could post, in scope — the same cohort the Financials "
            + "work queue lists, counted from the same projection so the tile and the list cannot "
            + "disagree. `charge.post` owns the eligibility; this restates no rule of its own.",
        pack: "financials",
        computationKind: "entity_snapshot",
        format: "count",
        defaultWindow: "rolling_30d",
        sources: ["charges", "child_enrollment_agreements"],
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

/**
 * May a stored snapshot stand in for this metric?
 *
 * One reader for the whole platform, so the engine and the writer cannot drift
 * into disagreeing about which metrics are current-state.
 */
export function metricSnapshotPolicy(key: OipMetricKey): MetricSnapshotPolicy {
    return getMetricDefinition(key).snapshotPolicy ?? "eligible";
}

/** True when a stored historical value must never substitute for this metric. */
export function isLiveOnlyMetric(key: OipMetricKey): boolean {
    return metricSnapshotPolicy(key) === "live_only";
}

/** Every live-only metric, for the lock test that makes the set deliberate. */
export function listLiveOnlyMetricKeys(): OipMetricKey[] {
    return listMetricDefinitions()
        .filter((d) => (d.snapshotPolicy ?? "eligible") === "live_only")
        .map((d) => d.key);
}

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
