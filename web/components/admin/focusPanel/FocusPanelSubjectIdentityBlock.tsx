"use client";

import { Users } from "lucide-react";

import type {
    FocusPanelContextChip,
    FocusPanelMissionDisplay,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

export type FocusPanelSubjectIdentityBlockProps = {
    subjectTitle: string;
    contextChips: FocusPanelContextChip[];
    mission?: FocusPanelMissionDisplay | null;
};

/**
 * Branded subject identity — icon tile, title, context chips, structured mission.
 * Connects to System 5 card chip language below.
 */
export default function FocusPanelSubjectIdentityBlock({
    subjectTitle,
    contextChips,
    mission,
}: FocusPanelSubjectIdentityBlockProps) {
    return (
        <div
            className="alloy-os-fp-header-compact__subject-block"
            data-focus-panel-subject-identity="true"
        >
            <div
                className="alloy-os-fp-header-compact__subject-tile"
                data-focus-panel-subject-tile="true"
                aria-hidden
            >
                <Users className="alloy-os-fp-header-compact__subject-tile-icon" strokeWidth={1.75} />
            </div>
            <div className="alloy-os-fp-header-compact__identity min-w-0">
                <h2 id="admin-focus-panel-title" className="alloy-os-fp-header-compact__title">
                    {subjectTitle}
                </h2>
                {contextChips.length > 0 ?
                    <div
                        className="alloy-os-fp-header-compact__context-row"
                        data-focus-panel-context="true"
                    >
                        {contextChips.map((chip) => (
                            <span
                                key={`${chip.kind}-${chip.label}`}
                                className={[
                                    "alloy-os-fp-header-compact__context-chip",
                                    `alloy-os-fp-header-compact__context-chip--${chip.kind}`,
                                    chip.kind === "status" && chip.tone ?
                                        `alloy-os-fp-header-compact__context-chip--tone-${chip.tone}`
                                    :   null,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                data-focus-panel-chip-kind={chip.kind}
                                data-focus-panel-chip-tone={chip.tone ?? undefined}
                                data-focus-panel-status-readonly={
                                    chip.kind === "status" ? "true" : undefined
                                }
                                role={chip.kind === "status" ? "status" : undefined}
                            >
                                {chip.label}
                            </span>
                        ))}
                    </div>
                :   null}
                {mission?.value ?
                    <div
                        className="alloy-os-fp-header-compact__mission-row"
                        data-focus-panel-mission="true"
                    >
                        <span className="alloy-os-fp-header-compact__mission-label">Mission</span>
                        <span className="alloy-os-fp-header-compact__mission-value">{mission.value}</span>
                        {mission.supporting?.trim() ?
                            <span className="alloy-os-fp-header-compact__mission-support">
                                {mission.supporting.trim()}
                            </span>
                        :   null}
                    </div>
                :   null}
            </div>
        </div>
    );
}
