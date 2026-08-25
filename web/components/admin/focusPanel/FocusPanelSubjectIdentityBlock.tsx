"use client";

import { Users } from "lucide-react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { FocusPanelContextChip } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

export type FocusPanelSubjectIdentityBlockProps = {
    subjectTitle: string;
    contextChips: FocusPanelContextChip[];
    /** Optional identity summary line (header surface composer). */
    identitySummaryLine?: string | null;
    /**
     * Subject identity avatar. Generic on purpose: the shell knows the subject's name and, when
     * the subject is a PERSON, may know a profile image. It does not know or care whether that
     * person is a child, a contact or an employee.
     *
     * - `personSubjectName` present → render the identity avatar (image, else initials).
     * - absent → the household/case tile, which is what a family subject should show.
     *
     * There is ONE avatar model. This reuses `CardAvatar`, the same primitive the cards use, so a
     * second identity presentation cannot drift from the first.
     */
    personSubjectName?: string | null;
    personSubjectImageUrl?: string | null;
    personSubjectRecordId?: string | null;
};

/**
 * Branded subject identity — icon tile, title, and read-only context chips
 * (status / process / location). The header intentionally carries NO mission /
 * action cue: the operating cue lives in the Current Work card so the header does
 * not compete with the cards below.
 */
export default function FocusPanelSubjectIdentityBlock({
    subjectTitle,
    contextChips,
    identitySummaryLine,
    personSubjectName,
    personSubjectImageUrl,
    personSubjectRecordId,
}: FocusPanelSubjectIdentityBlockProps) {
    const personName = personSubjectName?.trim();
    return (
        <div
            className="alloy-os-fp-header-compact__subject-block"
            data-focus-panel-subject-identity="true"
        >
            {personName ?
                <div
                    className="alloy-os-fp-header-compact__subject-tile alloy-os-fp-header-compact__subject-tile--avatar"
                    data-focus-panel-subject-tile="avatar"
                >
                    <CardAvatar
                        name={personName}
                        imageUrl={personSubjectImageUrl ?? null}
                        size={34}
                        recordId={personSubjectRecordId ?? undefined}
                    />
                </div>
            :   <div
                    className="alloy-os-fp-header-compact__subject-tile"
                    data-focus-panel-subject-tile="true"
                    aria-hidden
                >
                    <Users
                        className="alloy-os-fp-header-compact__subject-tile-icon"
                        strokeWidth={1.75}
                    />
                </div>
            }
            <div className="alloy-os-fp-header-compact__identity min-w-0">
                <h2 id="admin-focus-panel-title" className="alloy-os-fp-header-compact__title">
                    {subjectTitle}
                </h2>
                {identitySummaryLine ?
                    <p className="alloy-os-fp-header-compact__summary-line text-sm text-alloy-midnight/65">
                        {identitySummaryLine}
                    </p>
                :   null}
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
            </div>
        </div>
    );
}
