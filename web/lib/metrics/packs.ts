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
        description: "Check-in patterns and attendance compliance.",
        metricKeys: [],
        defaultSurfaceOrder: 60,
        domainStatus: "coming_soon",
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
        key: "billing",
        label: "Billing",
        description: "Collections, receivables, and billing cycle health.",
        metricKeys: [],
        defaultSurfaceOrder: 80,
        domainStatus: "coming_soon",
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
