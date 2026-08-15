"use client";

import clsx from "clsx";

import { formatFocusPanelChipLabelDisplay } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

import {
    durableRecordEntityType,
    durableSubjectTypeFor,
} from "@/lib/runtime/focus/durableRecordRoute";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";

import type {
    FocusPanelCardArchetype,
    FocusPanelCardPayload,
    FocusPanelProfileField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

const MISSING_VALUE = "—";

type Props = {
    archetype: FocusPanelCardArchetype;
    payload?: FocusPanelCardPayload;
    /** Fallback body for summary cards (e.g. secondary line). */
    fallbackBody?: React.ReactNode;
};

/** System 5A — archetype-specific card body composition. */
export default function ArchetypeCardBody({ archetype, payload, fallbackBody }: Props) {
    if (!payload) return fallbackBody ?? null;

    switch (archetype) {
        case "profile":
            if (!payload.profileFields?.length) return fallbackBody ?? null;
            return (
                <dl className="alloy-os-ucard__profile" data-card-archetype-body="profile">
                    {payload.profileFields.map((field) => (
                        <div key={field.label} className="alloy-os-ucard__profile-row">
                            <dt className="alloy-os-ucard__profile-label">{field.label}</dt>
                            <dd
                                className={clsx(
                                    "alloy-os-ucard__profile-value",
                                    !field.value?.trim() && "alloy-os-ucard__profile-value--missing",
                                )}
                            >
                                <ProfileFieldValue field={field} />
                            </dd>
                        </div>
                    ))}
                </dl>
            );

        case "collection":
            if (!payload.collectionItems?.length) return fallbackBody ?? null;
            return (
                <div className="alloy-os-ucard__collection" data-card-archetype-body="collection">
                    {payload.collectionItems.map((item) => (
                        <div key={item.label} className="alloy-os-ucard__collection-row">
                            <span className="alloy-os-ucard__collection-label">{item.label}</span>
                            {item.status ?
                                <span className="alloy-os-ucard__collection-status">
                                    {formatFocusPanelChipLabelDisplay(item.status)}
                                </span>
                            :   null}
                        </div>
                    ))}
                    {payload.overflowCount && payload.overflowCount > 0 ?
                        <div className="alloy-os-ucard__collection-overflow">
                            +{payload.overflowCount} more
                        </div>
                    :   null}
                </div>
            );

        case "status":
            if (!payload.statusIssues?.length) return fallbackBody ?? null;
            return (
                <ul className="alloy-os-ucard__status-issues" data-card-archetype-body="status">
                    {payload.statusIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                    ))}
                </ul>
            );

        case "timeline":
            if (!payload.timelineEvents?.length) return fallbackBody ?? null;
            return (
                <ol className="alloy-os-ucard__timeline" data-card-archetype-body="timeline">
                    {payload.timelineEvents.map((event) => (
                        <li key={`${event.when}-${event.label}`} className="alloy-os-ucard__timeline-row">
                            <span className="alloy-os-ucard__timeline-when">{event.when}</span>
                            <span className="alloy-os-ucard__timeline-label">{event.label}</span>
                        </li>
                    ))}
                </ol>
            );

        case "launcher":
            if (!payload.launcherRows?.length) return null;
            return (
                <div className="alloy-os-work-launcher-rows" data-card-archetype-body="launcher">
                    {payload.launcherRows.map((row) => (
                        <div key={row.key} className="alloy-os-work-launcher-row" data-work-launcher-key={row.key}>
                            <div className="alloy-os-work-launcher-row__main min-w-0">
                                <span className="alloy-os-work-launcher-row__label">{row.label}</span>
                                <span className="alloy-os-work-launcher-row__desc">{row.description}</span>
                            </div>
                            <span className="alloy-os-work-launcher-row__action">{row.actionLabel} →</span>
                        </div>
                    ))}
                </div>
            );

        default:
            return fallbackBody ?? null;
    }
}

/**
 * A profile value — plain text, or a gesture when the field names another RECORD.
 *
 * ── WHY THE GESTURE AND NOT A LINK ──
 *
 * `useOperatorRecordFocus` is THE adapter for "the operator pointed at a record, put it in front of
 * them", and it is the one that knows whether the caller is inside the kernel, above it, or outside
 * the workspace entirely. An `<a href>` here would be a second entry path — the exact shape that
 * doctrine names as broken, since a work-unit route is seed-only and a push renders nothing. So the
 * row states intent and the adapter owns the destination, like every other caller.
 *
 * ── AND WHY AN UNRECOGNISED GRAIN RENDERS AS TEXT ──
 *
 * `durableSubjectTypeFor` returns null for a grain this build has no composer for. Rendering a
 * button anyway would give the operator a control that silently does nothing, which is worse than
 * the plain string it replaced — the string at least never promised.
 */
function ProfileFieldValue({ field }: { field: FocusPanelProfileField }) {
    const focusRecord = useOperatorRecordFocus();
    const value = field.value?.trim() || MISSING_VALUE;

    const subjectId = (field.record?.subject_id ?? "").trim();
    const grain = field.record ? durableSubjectTypeFor(field.record.subject_type) : null;
    if (!grain || !subjectId || !field.value?.trim()) return <>{value}</>;

    return (
        <button
            type="button"
            className="alloy-os-ucard__profile-value-link"
            data-profile-field-record={grain}
            data-profile-field-record-id={subjectId}
            onClick={() => {
                void focusRecord({
                    entity_type: durableRecordEntityType(grain),
                    entity_id: subjectId,
                    intent: "durable_record",
                });
            }}
        >
            {value}
        </button>
    );
}
