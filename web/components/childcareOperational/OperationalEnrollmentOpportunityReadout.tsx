"use client";

import { useEffect, useMemo, useState } from "react";
import { ENROLLED_STATUS_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import { isChildcareOperationalEnrollmentV1EnabledClient } from "@/lib/childcareOperational/featureFlag";
import {
    COMMITTED_OPERATIONAL_HEADING,
    COMMITTED_OPERATIONAL_NOTE,
    COMMITTED_SCHEDULE_LABEL,
} from "@/lib/childcareOperational/enrollmentScheduleDoctrine";
import {
    fetchChildEnrollmentAgreementsForOpportunity,
    fetchOperationalEnrollmentSummary,
    formatOperationalEnrollmentAgreementStatus,
    OPERATIONAL_ENROLLMENT_WARNING_LABELS,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { OperationalEnrollmentReadModel } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

type InquiryChildRow = {
    id: string;
    display_name?: string | null;
    customer_member_id?: string | null;
};

type ChildReadout = {
    ocmId: string;
    childName: string;
    agreementStatus: string;
    committedPlacement: string;
    committedSchedule: string;
    scheduleLabel: string | null;
    warnings: string[];
};

type Props = {
    opportunityId: string;
    opportunityStatusKey?: string | null;
    rows: InquiryChildRow[];
};

function summarizeCommitted(summary: OperationalEnrollmentReadModel | null): Omit<ChildReadout, "ocmId" | "childName"> {
    if (!summary?.agreement) {
        return {
            agreementStatus: "none",
            committedPlacement: "none",
            committedSchedule: "none",
            scheduleLabel: null,
            warnings: [],
        };
    }

    const warnings = summary.warnings.map(
        (code) => OPERATIONAL_ENROLLMENT_WARNING_LABELS[code] ?? code
    );

    return {
        agreementStatus: formatOperationalEnrollmentAgreementStatus(summary.agreement.status),
        committedPlacement: summary.placement ? "committed" : "missing",
        committedSchedule: summary.scheduleAssignment ? "committed" : "missing",
        scheduleLabel: summary.labels.schedule,
        warnings,
    };
}

/** Post-approval committed operational enrollment (agreement, placement, schedule assignment). */
export default function OperationalEnrollmentOpportunityReadout({
    opportunityId,
    opportunityStatusKey,
    rows,
}: Props) {
    const enabled = isChildcareOperationalEnrollmentV1EnabledClient();
    const [state, setState] = useState<{
        loading: boolean;
        error: string | null;
        children: ChildReadout[];
    }>({ loading: false, error: null, children: [] });

    const shouldLoad =
        enabled &&
        rows.length > 0 &&
        (opportunityStatusKey === ENROLLED_STATUS_KEY || opportunityStatusKey === "enrolled");

    useEffect(() => {
        if (!shouldLoad) {
            setState({ loading: false, error: null, children: [] });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        (async () => {
            try {
                const agreements = await fetchChildEnrollmentAgreementsForOpportunity(opportunityId);
                if (cancelled) return;

                if (agreements.length === 0) {
                    setState({ loading: false, error: null, children: [] });
                    return;
                }

                const byMember = new Map(agreements.map((a) => [a.customer_member_id, a]));

                const readouts: ChildReadout[] = [];
                for (const row of rows) {
                    const memberId = (row.customer_member_id ?? "").trim();
                    const agreement = memberId ? byMember.get(memberId) : undefined;
                    const childName = (row.display_name ?? "").trim() || "Child";
                    if (!agreement) continue;

                    const summary = await fetchOperationalEnrollmentSummary({
                        enrollmentAgreementId: agreement.id,
                    });
                    const partial = summarizeCommitted(summary.summary);
                    readouts.push({
                        ocmId: row.id,
                        childName,
                        ...partial,
                    });
                }

                if (!cancelled) setState({ loading: false, error: null, children: readouts });
            } catch (e) {
                if (!cancelled) {
                    setState({
                        loading: false,
                        error: e instanceof Error ? e.message : "Failed to load committed enrollment",
                        children: [],
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [shouldLoad, opportunityId, rows]);

    const hasVisibleChildren = useMemo(
        () => state.children.some((c) => c.agreementStatus !== "none"),
        [state.children]
    );

    if (!enabled || !shouldLoad) return null;
    if (!state.loading && !state.error && !hasVisibleChildren) return null;

    return (
        <section
            className="mb-3 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] px-3 py-2.5"
            data-operational-enrollment-opportunity-readout="true"
        >
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                {COMMITTED_OPERATIONAL_HEADING}
            </h4>
            <p className="mt-1 text-[10px] text-alloy-midnight/55">{COMMITTED_OPERATIONAL_NOTE}</p>
            {state.loading ?
                <p className="mt-1 text-[11px] text-alloy-midnight/55">Loading committed enrollment…</p>
            :   null}
            {state.error ?
                <p className="mt-1 text-[11px] text-red-700">{state.error}</p>
            :   null}
            {!state.loading && !state.error && state.children.length > 0 ?
                <ul className="mt-2 space-y-2">
                    {state.children.map((child) => (
                        <li
                            key={child.ocmId}
                            className="rounded-md border border-alloy-forge/10 bg-white/80 px-2.5 py-2"
                        >
                            <div className="text-[11px] font-medium text-alloy-midnight">{child.childName}</div>
                            <div className="mt-1 grid gap-0.5 text-[10px] text-alloy-midnight/70">
                                <span>Agreement: {child.agreementStatus}</span>
                                <span>Committed placement: {child.committedPlacement}</span>
                                <span>
                                    {COMMITTED_SCHEDULE_LABEL}: {child.committedSchedule}
                                    {child.scheduleLabel ? ` · ${child.scheduleLabel}` : ""}
                                </span>
                            </div>
                            {child.warnings.length > 0 ?
                                <ul className="mt-1 space-y-0.5">
                                    {child.warnings.map((warning) => (
                                        <li key={warning} className="text-[10px] text-amber-800">
                                            {warning}
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                        </li>
                    ))}
                </ul>
            :   null}
        </section>
    );
}
