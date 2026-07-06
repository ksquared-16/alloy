/**
 * Operational Calculation Registry — the canonical catalog of governed business facts.
 *
 * Each entry WRAPS an existing OIP `MetricDefinition` (the math), layering governance
 * metadata on top. Wrap-able fields (format, dimensions, sources, snapshot strategy,
 * business process) are sourced FROM the OIP definition via `defineCalculation` so they
 * cannot drift. Governance-only fields are declared per calculation.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import { getMetricDefinition } from "@/lib/metrics/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import {
    PACK_TO_BUSINESS_PROCESS,
    type OperationalCalculation,
    type OperationalCalculationGovernance,
} from "@/lib/analytics/calculations/types";

/**
 * Build a calculation descriptor by wrapping an OIP definition with a governance overlay.
 * Mirrored fields (format/dimensions/inputs/snapshot/business process) come from OIP.
 */
function defineCalculation(
    key: OipMetricKey,
    governance: OperationalCalculationGovernance,
): OperationalCalculation {
    const def = getMetricDefinition(key);
    return {
        ...governance,
        key,
        label: def.label,
        businessProcess: PACK_TO_BUSINESS_PROCESS[def.pack],
        format: def.format,
        snapshotStrategy: def.computationKind,
        bounded: def.snapshotSemantics ?? false,
        dimensions: def.supportsDimensions ?? [],
        requiredInputs: def.sources,
    };
}

const CALCULATIONS: Record<OipMetricKey, OperationalCalculation> = {
    "enrollment.time_to_schedule_tour": defineCalculation("enrollment.time_to_schedule_tour", {
        questionAnswered: "How long does it take to get a new family onto a confirmed tour?",
        grains: ["org", "site"],
        aggregation: "median",
        dependencies: [],
        logicOwner: "OIP / enrollment resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "workspace_header", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Snapshot parity vs evaluateMetricDefinition; fixture window cases.",
        status: "active",
        drillContractId: "enrollment.tours_stalled",
    }),
    "enrollment.tour_conversion_rate": defineCalculation("enrollment.tour_conversion_rate", {
        questionAnswered: "What share of scheduled tours actually completed?",
        grains: ["org", "site"],
        aggregation: "rate",
        dependencies: [],
        logicOwner: "OIP / enrollment resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "workspace_header", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Snapshot parity; superseded-reschedule exclusion fixture.",
        status: "active",
        drillContractId: "enrollment.tours",
    }),
    "enrollment.lead_count": defineCalculation("enrollment.lead_count", {
        questionAnswered: "How many enrollment opportunities were created this period?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / enrollment resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "work_unit_header", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Count parity vs evaluateMetricDefinition; stage/status dimension fixtures.",
        status: "active",
        drillContractId: "enrollment.leads",
    }),
    "enrollment.active_leads": defineCalculation("enrollment.active_leads", {
        questionAnswered: "How many active enrollment participants (children) are in this work unit?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "Enrollment Definition (projection + semantics)",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Participant count parity via enrollmentProjection + enrollmentSemantics.",
        status: "active",
        drillContractId: "enrollment.leads",
    }),
    "enrollment.new_leads": defineCalculation("enrollment.new_leads", {
        questionAnswered: "How many participants are in the Lead stage right now?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "Enrollment Definition (projection + semantics)",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Participant count parity; effective-stage coalesce fixtures.",
        status: "active",
        drillContractId: "enrollment.leads",
    }),
    "enrollment.waitlisted": defineCalculation("enrollment.waitlisted", {
        questionAnswered: "How many participants are waitlisted?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "Enrollment Definition (projection + semantics)",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Participant count parity; waitlist stage/state fixtures.",
        status: "active",
        drillContractId: "enrollment.leads",
    }),
    "enrollment.tour_completed_count": defineCalculation("enrollment.tour_completed_count", {
        questionAnswered: "How many tours were completed this period?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / enrollment resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "work_unit_header"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Count parity vs evaluateMetricDefinition.",
        status: "active",
        drillContractId: "enrollment.tours",
    }),
    "comms.delivery_rate": defineCalculation("comms.delivery_rate", {
        questionAnswered: "What share of outbound messages were delivered?",
        grains: ["org", "site"],
        aggregation: "rate",
        dependencies: [],
        logicOwner: "OIP / communications resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "workspace_header"],
        accessScope: "org",
        version: 1,
        testingStrategy: "Rate parity vs delivery events fixture.",
        status: "active",
        // No production communications queue drill yet (Phase 2).
        exploratoryOnly: true,
    }),
    "comms.reply_rate": defineCalculation("comms.reply_rate", {
        questionAnswered: "What share of outbound messages received a reply?",
        grains: ["org", "site"],
        aggregation: "rate",
        dependencies: [],
        logicOwner: "OIP / communications resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics"],
        accessScope: "org",
        version: 1,
        testingStrategy: "Rate parity vs replied_at fixture.",
        status: "active",
        exploratoryOnly: true,
    }),
    "comms.failed_delivery_count": defineCalculation("comms.failed_delivery_count", {
        questionAnswered: "How many outbound messages failed or bounced?",
        grains: ["org", "site"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / communications resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics"],
        accessScope: "org",
        version: 1,
        testingStrategy: "Count parity vs failed/bounced delivery events fixture.",
        status: "active",
        exploratoryOnly: true,
    }),
    "forms.completion_rate": defineCalculation("forms.completion_rate", {
        questionAnswered: "What share of started forms were submitted?",
        grains: ["org", "site"],
        aggregation: "rate",
        dependencies: [],
        logicOwner: "OIP / forms resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics", "work_unit_header", "workspace_header"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Rate parity vs form_submissions fixture.",
        status: "active",
        drillContractId: "forms.incomplete",
    }),
    "forms.packet_completion_time": defineCalculation("forms.packet_completion_time", {
        questionAnswered: "How long do families take to complete a document packet?",
        grains: ["org"],
        aggregation: "median",
        dependencies: [],
        logicOwner: "OIP / forms resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics"],
        accessScope: "org",
        version: 1,
        testingStrategy: "Median parity vs packet session fixture.",
        status: "active",
        exploratoryOnly: true,
    }),
    "ops.work_overdue_count": defineCalculation("ops.work_overdue_count", {
        questionAnswered: "How much open work is past its due date right now?",
        grains: ["org", "work_unit"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / operational health resolvers",
        refreshStrategy: "live",
        consumers: ["analytics", "work_unit_header", "workspace_header", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Point-in-time count parity; overdue boundary fixture.",
        status: "active",
        drillContractId: "ops.overdue",
    }),
    "ops.workflow_failure_rate": defineCalculation("ops.workflow_failure_rate", {
        questionAnswered: "What share of workflow runs failed?",
        grains: ["org"],
        aggregation: "rate",
        dependencies: [],
        logicOwner: "OIP / operational health resolvers",
        refreshStrategy: "snapshot",
        consumers: ["analytics"],
        accessScope: "org",
        version: 1,
        testingStrategy: "Rate parity vs workflow_runs fixture.",
        status: "active",
        exploratoryOnly: true,
    }),
    "ops.needs_attention_count": defineCalculation("ops.needs_attention_count", {
        questionAnswered: "How many opportunities currently need operator attention?",
        grains: ["org"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / operational health resolvers",
        refreshStrategy: "live",
        consumers: ["analytics", "work_unit_header", "workspace_header", "business_process_tile"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Bounded-scan parity vs resolveOpportunityAttention (cap 2000).",
        status: "active",
        drillContractId: "ops.needs_attention",
    }),
    "ops.readiness_gap_count": defineCalculation("ops.readiness_gap_count", {
        questionAnswered: "How many opportunities have at least one readiness gap?",
        grains: ["org"],
        aggregation: "count",
        dependencies: [],
        logicOwner: "OIP / operational health resolvers",
        refreshStrategy: "live",
        consumers: ["analytics"],
        accessScope: "department",
        version: 1,
        testingStrategy: "Bounded-scan parity vs evaluateOperationalReadiness (cap 500).",
        status: "active",
        drillContractId: "ops.readiness",
    }),
};

const CALCULATION_KEYS = new Set<string>(Object.keys(CALCULATIONS));

export function isKnownCalculationKey(key: string): key is OipMetricKey {
    return CALCULATION_KEYS.has(key);
}

export function getOperationalCalculation(key: OipMetricKey): OperationalCalculation {
    return CALCULATIONS[key];
}

export function findOperationalCalculation(key: string): OperationalCalculation | null {
    return isKnownCalculationKey(key) ? CALCULATIONS[key] : null;
}

export function listOperationalCalculations(): readonly OperationalCalculation[] {
    return CALCULATIONS_LIST;
}

const CALCULATIONS_LIST: readonly OperationalCalculation[] = Object.freeze(Object.values(CALCULATIONS));

export function listCalculationsByBusinessProcess(
    businessProcess: OperationalCalculation["businessProcess"],
): readonly OperationalCalculation[] {
    return Object.freeze(CALCULATIONS_LIST.filter((c) => c.businessProcess === businessProcess));
}

export function listCalculationsByConsumer(
    consumer: OperationalCalculation["consumers"][number],
): readonly OperationalCalculation[] {
    return Object.freeze(CALCULATIONS_LIST.filter((c) => c.consumers.includes(consumer)));
}
