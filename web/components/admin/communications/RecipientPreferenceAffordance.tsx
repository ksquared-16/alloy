"use client";

/**
 * A recipient's name, and what they have agreed to — on the name itself.
 *
 * WHAT THIS REPLACES. Communication preferences occupied a permanent block in the
 * conversation, above the messages. It was always open, it was the same four rows
 * whether or not anyone was looking at them, and — the part that made it wrong
 * rather than merely large — it showed ONE profile for the whole household while
 * sitting beside several people's names. Preferences are Person-owned. Kelly may
 * have stopped texts while Kristi has not, and a single block cannot say that.
 *
 * So the affordance is attached to the RECIPIENT, and it names them. There is no
 * household-level answer here, because there is no household-level fact.
 *
 * It reuses the canonical authority throughout: `PREFERENCE_FIELD_DEFS` for which
 * preferences exist and what they are called, `operatorStatusLabel` for the state
 * wording, and the caller's existing write path for edits. No second preference
 * model, no second vocabulary.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
    PREFERENCE_FIELD_DEFS,
    operatorStatusLabel,
    type PreferenceFieldKey,
} from "@/lib/communications/v2/communicationPreferenceLabels";
import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import { summarizeRecipientPreferences } from "@/lib/communications/v2/recipientPreferenceSummary";

type Props = {
    personId: string;
    displayName: string;
    /** THIS person's profile. Null when none is on file — never another's. */
    profile: PersonPreferenceProfile | null;
    canEdit?: boolean;
    saving?: boolean;
    onChange?: (personId: string, field: PreferenceFieldKey, status: "Allowed" | "Blocked") => void;
};

/**
 * Anything blocked is worth showing without a click. Silence is not consent.
 *
 * Counted from the CHANNEL SUMMARY rather than from the rows, because a row saying
 * `opted_out` does not always mean anything is blocked — essential categories are exempt,
 * and counting them lit the badge for a state the platform ignores. See
 * `recipientPreferenceSummary.ts`.
 */
function blockedCount(profile: PersonPreferenceProfile | null): number {
    if (!profile) return 0;
    return summarizeRecipientPreferences(profile).blockedChannelCount;
}

export default function RecipientPreferenceAffordance({
    personId,
    displayName,
    profile,
    canEdit = false,
    saving = false,
    onChange,
}: Props) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDocPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", onDocPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDocPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const blocked = blockedCount(profile);
    // The evaluator's own consequence, in one sentence per channel. An operator should be
    // able to read WHY a channel will refuse without opening a management panel — the count
    // alone told them something was wrong and nothing about what.
    const summary = summarizeRecipientPreferences(profile);

    return (
        <div className="relative inline-flex" ref={rootRef} data-cc-recipient-preferences={personId}>
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="dialog"
                data-cc-recipient-preference-trigger={personId}
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition ${
                    blocked > 0
                        ? "bg-alloy-ember/10 text-alloy-ember ring-alloy-ember/40"
                        : "bg-alloy-juniper/10 text-alloy-juniper ring-alloy-juniper/40"
                }`}
            >
                <span className="max-w-[12rem] truncate">{displayName}</span>
                {/* The one fact worth surfacing before a click: something is
                    blocked. An operator who cannot see that will write a message
                    that never arrives. */}
                {blocked > 0 ? <span className="font-semibold">· {blocked} blocked</span> : null}
                <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
            </button>

            {open ? (
                <div
                    role="dialog"
                    aria-label={`Communication preferences for ${displayName}`}
                    data-cc-recipient-preference-panel={personId}
                    className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-alloy-stone/25 bg-white p-2.5 shadow-lg"
                >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/45">
                        Communication preferences
                    </div>
                    {/* Named, always. This panel states one Person's answer and
                        must never read as the household's. */}
                    <div className="mt-0.5 truncate text-[11px] font-medium text-alloy-midnight">{displayName}</div>

                    {/* WHY, before WHAT. The evaluator already produces an operator-safe
                        consequence; repeating a row's raw state here would be the same
                        untruth the old "Email messages" control encoded. */}
                    <ul className="mt-2 space-y-1" data-cc-preference-reasons={personId}>
                        {[summary.email, summary.sms].map((c) => (
                            <li
                                key={c.channel}
                                data-cc-preference-reason={`${personId}:${c.channel}`}
                                className={`text-[11px] leading-snug ${
                                    c.state === "blocked" ? "text-alloy-ember"
                                    : c.state === "restricted" ? "text-alloy-midnight/60"
                                    : "text-alloy-juniper"
                                }`}
                            >
                                {c.reason}
                            </li>
                        ))}
                    </ul>

                    {profile ? (
                        <ul className="mt-2 space-y-1">
                            {PREFERENCE_FIELD_DEFS.map((field) => {
                                const status = operatorStatusLabel(profile[field.key]);
                                // A category the platform exempts gets no switch. Rendering
                                // one that cannot take effect is exactly the defect this
                                // pass closes — see EDITABLE_PREFERENCE_FIELDS.
                                const editable = field.control !== "always_allowed";
                                return (
                                    <li key={field.key} className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-alloy-midnight/70" title={field.description}>
                                            {field.label}
                                        </span>
                                        {!editable ? (
                                            <span
                                                data-cc-preference-always-allowed={`${personId}:${field.key}`}
                                                className="rounded-full bg-alloy-stone/15 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/55"
                                            >
                                                Always allowed
                                            </span>
                                        ) : canEdit && status !== "Unknown" ? (
                                            <button
                                                type="button"
                                                disabled={saving}
                                                data-cc-preference-toggle={`${personId}:${field.key}`}
                                                onClick={() =>
                                                    onChange?.(
                                                        personId,
                                                        field.key,
                                                        status === "Allowed" ? "Blocked" : "Allowed"
                                                    )
                                                }
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-40 ${
                                                    status === "Allowed"
                                                        ? "bg-alloy-juniper/10 text-alloy-juniper"
                                                        : "bg-alloy-ember/10 text-alloy-ember"
                                                }`}
                                            >
                                                {status}
                                            </button>
                                        ) : (
                                            <span
                                                data-cc-preference-state={`${personId}:${field.key}`}
                                                className={`text-[10px] font-semibold ${
                                                    status === "Allowed"
                                                        ? "text-alloy-juniper"
                                                        : status === "Blocked"
                                                          ? "text-alloy-ember"
                                                          : "text-alloy-midnight/45"
                                                }`}
                                            >
                                                {status}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        // NOT the household's profile as a stand-in. Showing
                        // someone else's answer under this person's name is the
                        // exact untruth this component exists to remove.
                        <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/45">
                            No preferences recorded for {displayName} yet.
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}
