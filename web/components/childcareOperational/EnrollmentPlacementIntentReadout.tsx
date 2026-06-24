"use client";

import { isChildcareOperationalEnrollmentV1EnabledClient } from "@/lib/childcareOperational/featureFlag";
import {
    buildEnrollmentPlacementIntentFromRow,
    ENROLLMENT_SCHEDULE_INTENT_HEADING,
    ENROLLMENT_SCHEDULE_INTENT_NOTE,
    hasEnrollmentPlacementIntent,
    PROPOSED_PLACEMENT_LABEL,
    PROPOSED_SCHEDULE_LABEL,
    type EnrollmentPlacementIntentRow,
} from "@/lib/childcareOperational/enrollmentScheduleDoctrine";

type Props = {
    rows: EnrollmentPlacementIntentRow[];
};

function IntentLine({ label, value }: { label: string; value: string | null }) {
    if (!value) return null;
    return (
        <div className="text-[10px] text-alloy-midnight/70">
            <span className="text-alloy-midnight/50">{label}: </span>
            {value}
        </div>
    );
}

export default function EnrollmentPlacementIntentReadout({ rows }: Props) {
    const enabled = isChildcareOperationalEnrollmentV1EnabledClient();
    if (!enabled || rows.length === 0) return null;

    const children = rows.map((row) => {
        const intent = buildEnrollmentPlacementIntentFromRow(row);
        const childName = (row.display_name ?? "").trim() || "Child";
        return { id: row.id, childName, intent, visible: hasEnrollmentPlacementIntent(intent) };
    });

    const anyVisible = children.some((c) => c.visible);
    if (!anyVisible) return null;

    return (
        <section
            className="mb-3 rounded-lg border border-alloy-forge/12 bg-white/90 px-3 py-2.5 shadow-sm"
            data-enrollment-placement-intent-readout="true"
        >
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                {ENROLLMENT_SCHEDULE_INTENT_HEADING}
            </h4>
            <p className="mt-1 text-[10px] text-alloy-midnight/55">{ENROLLMENT_SCHEDULE_INTENT_NOTE}</p>
            <ul className="mt-2 space-y-2">
                {children
                    .filter((c) => c.visible)
                    .map((child) => (
                        <li
                            key={child.id}
                            className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.03] px-2.5 py-2"
                        >
                            <div className="text-[11px] font-medium text-alloy-midnight">
                                {child.childName}
                            </div>
                            <div className="mt-1 space-y-0.5">
                                <IntentLine label="Site" value={child.intent.site} />
                                <IntentLine label={PROPOSED_PLACEMENT_LABEL} value={child.intent.program} />
                                <IntentLine label="Room (proposed)" value={child.intent.room} />
                                <IntentLine
                                    label={PROPOSED_SCHEDULE_LABEL}
                                    value={child.intent.scheduleProposal}
                                />
                                <IntentLine label="Proposed start" value={child.intent.startDate} />
                            </div>
                        </li>
                    ))}
            </ul>
        </section>
    );
}
