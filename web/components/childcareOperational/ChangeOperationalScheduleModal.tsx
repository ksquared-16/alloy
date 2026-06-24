"use client";

import { useEffect, useMemo, useState } from "react";
import { computePriorRowCloseDate } from "@/lib/childcareOperational/effectiveDating";
import {
    OPERATIONAL_EDIT_FUTURE_DATED_NOTE,
    OPERATIONAL_EDIT_HISTORY_NOTE,
    OPERATIONAL_EDIT_NO_ACTIVE_PATTERNS_WARNING,
} from "@/lib/childcareOperational/operationalEnrollmentEditDoctrine";
import {
    fetchActiveSchedulePatternsForSite,
    formatOperationalEnrollmentDate,
    formatWeekdaySelection,
    type OperationalEnrollmentSummaryResponse,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { submitScheduleAssignment } from "@/lib/childcareOperational/fetchOperationalEnrollmentMutations";
import OperationalEnrollmentModalChrome from "@/components/childcareOperational/OperationalEnrollmentModalChrome";

type Props = {
    open: boolean;
    summary: OperationalEnrollmentSummaryResponse["summary"];
    onClose: () => void;
    onSuccess: () => void;
};

export default function ChangeOperationalScheduleModal({ open, summary, onClose, onSuccess }: Props) {
    const agreement = summary.agreement!;
    const assignment = summary.scheduleAssignment;
    const pattern = summary.schedulePattern;
    const labels = summary.labels;
    const siteLocationId = agreement.site_location_id;

    const [patterns, setPatterns] = useState<Awaited<ReturnType<typeof fetchActiveSchedulePatternsForSite>>>([]);
    const [patternsLoading, setPatternsLoading] = useState(false);
    const [patternId, setPatternId] = useState(assignment?.schedule_pattern_id ?? "");
    const [startDate, setStartDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setPatternId(assignment?.schedule_pattern_id ?? "");
        setStartDate("");
        setError(null);
        setBusy(false);
        setPatternsLoading(true);
        void fetchActiveSchedulePatternsForSite(siteLocationId)
            .then((rows) => setPatterns(rows))
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load patterns"))
            .finally(() => setPatternsLoading(false));
    }, [open, assignment?.schedule_pattern_id, siteLocationId]);

    const priorClosePreview = useMemo(() => {
        if (!startDate.trim() || !assignment) return null;
        try {
            return computePriorRowCloseDate(startDate.trim());
        } catch {
            return null;
        }
    }, [startDate, assignment]);

    const canSubmit =
        patternId.trim().length > 0
        && startDate.trim().length > 0
        && !busy
        && !patternsLoading
        && patterns.length > 0;

    async function handleSubmit() {
        setError(null);
        setBusy(true);
        try {
            await submitScheduleAssignment({
                enrollment_agreement_id: agreement.id,
                schedule_pattern_id: patternId.trim(),
                start_date: startDate.trim(),
                supersede: assignment != null,
                source_key: "operator_schedule_edit",
            });
            onSuccess();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update schedule");
        } finally {
            setBusy(false);
        }
    }

    const currentScheduleLabel = labels.schedule
        ?? (pattern ?
            `${pattern.label} (${formatWeekdaySelection(pattern.weekdays ?? [])})`
        :   null);

    return (
        <OperationalEnrollmentModalChrome
            open={open}
            title={assignment ? "Change schedule" : "Set schedule"}
            description="Update the committed schedule assignment on this agreement."
            busy={busy}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitLabel={assignment ? "Change schedule" : "Set schedule"}
            submitDisabled={!canSubmit}
            testId="change-operational-schedule-modal"
        >
            <p className="text-xs leading-relaxed text-alloy-midnight/65">{OPERATIONAL_EDIT_HISTORY_NOTE}</p>
            <p className="text-xs leading-relaxed text-alloy-midnight/55">{OPERATIONAL_EDIT_FUTURE_DATED_NOTE}</p>

            {patterns.length === 0 && !patternsLoading ?
                <p
                    className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900"
                    data-operational-no-active-patterns="true"
                >
                    {OPERATIONAL_EDIT_NO_ACTIVE_PATTERNS_WARNING}
                </p>
            :   null}

            {assignment ?
                <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/80">
                    <div>
                        <span className="font-semibold">Current schedule</span>
                        <span className="text-alloy-midnight/55">
                            {" "}
                            · effective {formatOperationalEnrollmentDate(assignment.start_date)}
                        </span>
                    </div>
                    <div className="mt-1">{currentScheduleLabel ?? "—"}</div>
                    {priorClosePreview ?
                        <div className="mt-1 text-alloy-midnight/60" data-prior-schedule-close-preview="true">
                            Prior schedule closes {formatOperationalEnrollmentDate(priorClosePreview)}
                        </div>
                    :   null}
                </div>
            :   null}

            <div className="space-y-3">
                <label className="block text-xs font-medium text-alloy-midnight">
                    Schedule pattern
                    <select
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                        value={patternId}
                        disabled={busy || patternsLoading || patterns.length === 0}
                        onChange={(e) => setPatternId(e.target.value)}
                    >
                        <option value="">Select schedule…</option>
                        {patterns.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label} ({formatWeekdaySelection(p.weekdays ?? [])})
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-xs font-medium text-alloy-midnight">
                    Effective start date
                    <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                        value={startDate}
                        disabled={busy}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </label>
            </div>

            {error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   null}
        </OperationalEnrollmentModalChrome>
    );
}
