import type { OipMetricKey } from "@/lib/metrics/types";
import { listMetricDefinitions } from "@/lib/metrics/registry";

export type MetricPackDomainStatus = "available" | "coming_soon";

export type MetricPackDefinition = {
    key: string;
    label: string;
    description: string;
    metricKeys: readonly OipMetricKey[];
    defaultSurfaceOrder: number;
    domainStatus: MetricPackDomainStatus;
};

const PACKS: readonly MetricPackDefinition[] = [
    {
        key: "operational_health",
        label: "Operational Health",
        description: "Workflow reliability, overdue work, and operator attention signals.",
        metricKeys: [
            "ops.work_overdue_count",
            "ops.workflow_failure_rate",
            "ops.needs_attention_count",
            "ops.readiness_gap_count",
        ],
        defaultSurfaceOrder: 10,
        domainStatus: "available",
    },
    {
        key: "enrollment",
        label: "Enrollment",
        description: "Tour scheduling speed and conversion through enrollment pipeline.",
        metricKeys: ["enrollment.time_to_schedule_tour", "enrollment.tour_conversion_rate"],
        defaultSurfaceOrder: 20,
        domainStatus: "available",
    },
    {
        key: "communications",
        label: "Communications",
        description: "Outbound delivery, reply engagement, and failed delivery volume.",
        metricKeys: ["comms.delivery_rate", "comms.reply_rate", "comms.failed_delivery_count"],
        defaultSurfaceOrder: 30,
        domainStatus: "available",
    },
    {
        key: "forms",
        label: "Forms",
        description: "Packet completion rate and time to finish required forms.",
        metricKeys: ["forms.completion_rate", "forms.packet_completion_time"],
        defaultSurfaceOrder: 40,
        domainStatus: "available",
    },
    {
        key: "trust",
        label: "Trust",
        description:
            "Governed reasoning: decision volume, outcome mix, deterministic resolution, latency and cost. " +
            "Organization-wide only \u2014 Trust records carry no site linkage.",
        metricKeys: [
            "trust.governed_decisions_created",
            "trust.governed_decisions_completed",
            "trust.recommendation_rate",
            "trust.governed_refusal_rate",
            "trust.reasoning_failure_rate",
            "trust.deterministic_resolution_rate",
            "trust.escalated_decision_count",
            "trust.reasoning_latency_p50",
            "trust.provider_cost_units",
            "trust.executions_committed_count",
        ],
        defaultSurfaceOrder: 45,
        domainStatus: "available",
    },
    {
        key: "capacity",
        label: "Capacity",
        description: "Room and program capacity utilization.",
        metricKeys: [],
        defaultSurfaceOrder: 50,
        domainStatus: "coming_soon",
    },
    {
        key: "attendance",
        label: "Attendance",
        description:
            "Who is expected, who is here, and who is unaccounted for \u2014 read from the same " +
            "service-day interpretation the Attendance workspace uses.",
        metricKeys: [
            "attendance.expected_count",
            "attendance.here_now_count",
            "attendance.not_arrived_count",
            "attendance.checked_out_count",
            "attendance.known_away_count",
            "attendance.unknown_state_count",
        ],
        defaultSurfaceOrder: 60,
        domainStatus: "available",
    },
    {
        key: "staffing",
        label: "Staffing",
        description: "Staff coverage and scheduling gaps.",
        metricKeys: [],
        defaultSurfaceOrder: 70,
        domainStatus: "coming_soon",
    },
    {
        /*
         * This entry was `billing`, empty, and promising "receivables" — a placeholder that
         * named a concept the platform did not own. It is now the Financials pack, and the
         * description says only what the seven metrics actually answer.
         */
        key: "financials",
        label: "Financials",
        description:
            "Money owed, collectible now, billed, received, unapplied, and subsidy variance \u2014 each "
            + "quoted from the Financials thread that owns it. Not receivables accounting and not "
            + "recognised revenue: neither model exists in the platform.",
        metricKeys: [
            "financials.outstanding_amount",
            "financials.currently_collectible_amount",
            "financials.gross_charges_posted_amount",
            "financials.payments_received_amount",
            "financials.unapplied_payments_amount",
            "financials.unresolved_subsidy_variance_amount",
            "financials.charges_awaiting_post_count",
        ],
        defaultSurfaceOrder: 80,
        domainStatus: "available",
    },
] as const;

export function listMetricPacks(): readonly MetricPackDefinition[] {
    return PACKS;
}

export function listAvailableMetricPacks(): readonly MetricPackDefinition[] {
    return PACKS.filter((p) => p.domainStatus === "available" && p.metricKeys.length > 0);
}

export function getMetricPack(key: string): MetricPackDefinition | undefined {
    return PACKS.find((p) => p.key === key);
}

/** All metric keys referenced by available packs — deduped, registry-validated. */
export function listAvailablePackMetricKeys(): OipMetricKey[] {
    const known = new Set(listMetricDefinitions().map((d) => d.key));
    const out: OipMetricKey[] = [];
    for (const pack of listAvailableMetricPacks()) {
        for (const key of pack.metricKeys) {
            if (known.has(key) && !out.includes(key)) out.push(key);
        }
    }
    return out;
}

/** Validates every pack metric key exists in the metric registry. */
export function validateMetricPackRegistry(): string[] {
    const known = new Set(listMetricDefinitions().map((d) => d.key));
    const errors: string[] = [];
    for (const pack of PACKS) {
        for (const key of pack.metricKeys) {
            if (!known.has(key)) {
                errors.push(`pack ${pack.key} references unknown metric ${key}`);
            }
        }
    }
    return errors;
}
