/**
 * Administrator-facing measurement copy. Business language only — never adapters,
 * overlays, registries, or snapshot internals.
 */

import type { OipKpiKey } from "@/lib/metrics/types";

export type OiMeasurementCopy = {
    whatItMeasures: string;
    whyItMatters: string;
    requiredData: string;
};

const COPY: Record<OipKpiKey, OiMeasurementCopy> = {
    "enrollment.time_to_schedule_tour": {
        whatItMeasures: "How long it typically takes to get a tour on the calendar after a family starts.",
        whyItMatters: "Slow scheduling loses interested families before they ever visit.",
        requiredData: "Enrollment opportunities and confirmed tour bookings.",
    },
    "enrollment.tour_conversion_rate": {
        whatItMeasures: "The share of scheduled tours that are completed.",
        whyItMatters: "Shows whether tour interest is turning into real visits.",
        requiredData: "Tour booking outcomes in the selected time window.",
    },
    "comms.delivery_rate": {
        whatItMeasures: "The share of outbound messages that successfully deliver.",
        whyItMatters: "Families cannot respond to messages they never receive.",
        requiredData: "Outbound communication delivery results.",
    },
    "forms.completion_rate": {
        whatItMeasures: "The share of required forms that families finish.",
        whyItMatters: "Incomplete packets stall enrollment and slow start dates.",
        requiredData: "Form submissions and completion status.",
    },
    "ops.work_overdue_count": {
        whatItMeasures: "How many open work items are past their due time.",
        whyItMatters: "Overdue work is a direct signal that operations need attention.",
        requiredData: "Open operational tasks with due dates.",
    },
    "ops.needs_attention_count": {
        whatItMeasures: "How many items currently need operator attention.",
        whyItMatters: "Keeps the team focused on the work that is blocking progress.",
        requiredData: "Live operational attention signals.",
    },
};

export function getOiMeasurementCopy(kpiKey: OipKpiKey): OiMeasurementCopy {
    return (
        COPY[kpiKey] ?? {
            whatItMeasures: "A platform measurement available for this organization.",
            whyItMatters: "Helps the organization track operational performance against goals.",
            requiredData: "Operational records that power this measurement.",
        }
    );
}
