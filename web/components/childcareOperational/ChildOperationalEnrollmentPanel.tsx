"use client";

import { useCallback, useEffect, useState } from "react";
import { isChildcareOperationalEnrollmentV1EnabledClient } from "@/lib/childcareOperational/featureFlag";
import {
    COMMITTED_OPERATIONAL_NOTE,
    COMMITTED_SCHEDULE_LABEL,
    ENROLLMENT_SCHEDULE_INTENT_HEADING,
    ENROLLMENT_SCHEDULE_INTENT_NOTE,
    hasEnrollmentPlacementIntent,
    PROPOSED_PLACEMENT_LABEL,
    PROPOSED_SCHEDULE_LABEL,
    resolveEnrollmentPlacementIntentFromRecord,
} from "@/lib/childcareOperational/enrollmentScheduleDoctrine";
import { OPERATIONAL_EDIT_HISTORY_TIMELINE_NOTE } from "@/lib/childcareOperational/operationalEnrollmentEditDoctrine";
import {
    fetchOperationalEnrollmentSummary,
    formatOperationalEnrollmentAgreementStatus,
    formatOperationalEnrollmentDate,
    OPERATIONAL_ENROLLMENT_WARNING_LABELS,
    resolveOperationalEnrollmentFetchParams,
    type OperationalEnrollmentSummaryResponse,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import OperationalEnrollmentEditActions from "@/components/childcareOperational/OperationalEnrollmentEditActions";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    compact?: boolean;
};

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className={PRESENTATION_SUPPORTING}>{label}</dt>
            <dd className={`mt-0.5 ${PRESENTATION_DATA_VALUE_COMPACT}`}>{value}</dd>
        </div>
    );
}

function EnrollmentIntentBlock({ record }: { record: ProofRuntimeRecord }) {
    const intent = resolveEnrollmentPlacementIntentFromRecord(record);
    if (!hasEnrollmentPlacementIntent(intent)) {
        return <p className={`mt-2 ${PRESENTATION_EMPTY_STATE}`}>No enrollment schedule or placement proposal yet.</p>;
    }

    return (
        <div data-child-enrollment-intent="true">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                {ENROLLMENT_SCHEDULE_INTENT_HEADING}
            </p>
            <p className="mt-1 text-[10px] text-alloy-midnight/55">{ENROLLMENT_SCHEDULE_INTENT_NOTE}</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <DetailRow label="Site (proposed)" value={intent.site ?? "—"} />
                <DetailRow label={PROPOSED_PLACEMENT_LABEL} value={intent.program ?? "—"} />
                <DetailRow label="Room (proposed)" value={intent.room ?? "—"} />
                <DetailRow label={PROPOSED_SCHEDULE_LABEL} value={intent.scheduleProposal ?? "—"} />
                <DetailRow label="Proposed start" value={intent.startDate ?? "—"} />
            </dl>
        </div>
    );
}

export default function ChildOperationalEnrollmentPanel({
    record,
    title = "Enrollment & operational schedule",
    compact,
}: Props) {
    const enabled = isChildcareOperationalEnrollmentV1EnabledClient();
    const { customerMemberId, siteLocationId } = resolveOperationalEnrollmentFetchParams(record);
    const [refreshKey, setRefreshKey] = useState(0);
    const [state, setState] = useState<{
        loading: boolean;
        error: string | null;
        data: OperationalEnrollmentSummaryResponse | null;
    }>({ loading: false, error: null, data: null });

    const reloadSummary = useCallback(() => {
        setRefreshKey((k) => k + 1);
    }, []);

    useEffect(() => {
        if (!enabled || !customerMemberId) return;
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        fetchOperationalEnrollmentSummary({ customerMemberId, siteLocationId })
            .then((data) => {
                if (!cancelled) setState({ loading: false, error: null, data });
            })
            .catch((e) => {
                if (!cancelled) {
                    setState({
                        loading: false,
                        error: e instanceof Error ? e.message : "Failed to load",
                        data: null,
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [enabled, customerMemberId, siteLocationId, refreshKey]);

    if (!enabled) return null;

    const shellClass = compact
        ? "rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5"
        : "rounded-xl border border-alloy-forge/12 bg-white/90 px-4 py-3.5 shadow-sm";

    if (!customerMemberId) {
        return (
            <div className={shellClass} data-child-operational-enrollment-panel="true">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                <EnrollmentIntentBlock record={record} />
            </div>
        );
    }

    if (state.loading && !state.data) {
        return (
            <div className={shellClass} data-child-operational-enrollment-panel="true">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                <p className={`mt-2 ${PRESENTATION_SUPPORTING}`}>Loading enrollment data…</p>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className={shellClass} data-child-operational-enrollment-panel="true">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                <p className="mt-2 text-[11px] text-red-700">{state.error}</p>
            </div>
        );
    }

    const summary = state.data?.summary;
    const agreement = summary?.agreement;

    if (!agreement) {
        return (
            <div className={shellClass} data-child-operational-enrollment-panel="true">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                <EnrollmentIntentBlock record={record} />
            </div>
        );
    }

    const warnings = summary?.warnings ?? [];
    const labels = summary?.labels ?? { site: null, program: null, room: null, schedule: null };

    return (
        <div className={shellClass} data-child-operational-enrollment-panel="true">
            <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
            <p className="mt-1 text-[10px] text-alloy-midnight/55">{COMMITTED_OPERATIONAL_NOTE}</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <DetailRow
                    label="Agreement status"
                    value={formatOperationalEnrollmentAgreementStatus(agreement.status)}
                />
                <DetailRow label="Start date" value={formatOperationalEnrollmentDate(agreement.start_date)} />
                <DetailRow label="End date" value={formatOperationalEnrollmentDate(agreement.end_date)} />
                <DetailRow label="Site" value={labels.site ?? "—"} />
                <DetailRow label="Committed program" value={labels.program ?? "—"} />
                <DetailRow label="Committed room" value={labels.room ?? "—"} />
                <DetailRow label={COMMITTED_SCHEDULE_LABEL} value={labels.schedule ?? "—"} />
            </dl>
            {warnings.length > 0 ?
                <ul className="mt-2 space-y-1" data-operational-enrollment-warnings="true">
                    {warnings.map((code) => (
                        <li
                            key={code}
                            className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900"
                        >
                            {OPERATIONAL_ENROLLMENT_WARNING_LABELS[code] ?? code}
                        </li>
                    ))}
                </ul>
            :   null}
            {summary ?
                <OperationalEnrollmentEditActions summary={summary} onRefresh={reloadSummary} />
            :   null}
            <p className="mt-2 text-[10px] leading-relaxed text-alloy-midnight/55">
                {OPERATIONAL_EDIT_HISTORY_TIMELINE_NOTE}
            </p>
            {state.loading ?
                <p className={`mt-2 ${PRESENTATION_SUPPORTING}`}>Refreshing…</p>
            :   null}
        </div>
    );
}

export function ChildOperationalEnrollmentPanelShell({
    record,
    title = "Enrollment & operational schedule",
}: {
    record: ProofRuntimeRecord;
    title?: string;
}) {
    return <ChildOperationalEnrollmentPanel record={record} title={title} compact />;
}
