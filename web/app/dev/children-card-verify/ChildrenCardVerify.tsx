"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";

import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * Dev harness (no auth) rendering the REAL ChildrenCard so the Universal Card
 * Lifecycle (Summary → Focus → Edit preview → Expanded) is screenshot-able. Drive the
 * states by clicking the card's own footer actions (View children → focus a child →
 * History / Edit schedule).
 */

const SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

const CONTEXT: OperationalContext = {
    grain: "case",
    subject: { type: "opportunity", id: "opp-1", label: "Johnson Household" },
    businessProcess: { key: null, label: null, stageKey: null },
    perspective: null,
    truth: {
        id: "opp-1",
        _inquiry_children: [
            {
                id: "c1",
                display_name: "Emma Johnson",
                dob: "2018-08-14",
                age: "6 years old",
                desired_program_label: "Preschool",
                program_room_cohort_label: "Butterflies Room",
                desired_schedule_label: "M–F · 8:30a – 2:30p",
                start_date: "Aug 20, 2024",
                outcome_status_label: "Enrolled",
                outcome_status_key: "enrolled",
            },
            {
                id: "c2",
                display_name: "Liam Johnson",
                dob: "2020-04-02",
                age: "4 years old",
                outcome_status_key: "in_progress",
            },
        ],
    },
    signals: SIGNALS,
    capabilities: { canMutate: true, maskedChannels: false },
    status: "ready",
};

const MODEL: FocusPanelCardModel = {
    key: "children",
    archetype: "collection",
    title: "Children",
    insight: "—",
    tier: "context",
    span: 1,
    density: "standard",
    visible: true,
    iconName: "users",
};

export default function ChildrenCardVerify() {
    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 24 }}>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
                Dev harness — ChildrenCard lifecycle (Summary → Focus → Edit preview → Expanded). Click the card footer to drive states.
            </p>
            <div style={{ width: 420, maxWidth: "100%" }}>
                <ChildrenCard model={MODEL} context={CONTEXT} />
            </div>
        </div>
    );
}
