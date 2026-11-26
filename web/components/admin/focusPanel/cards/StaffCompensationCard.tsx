"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import {
    NULL_EMPLOYMENT_SIGNAL,
    type OperationalContext,
} from "@/lib/adminV2/runtime/operationalContext/types";
import {
    formatCompensationRate,
    payBasisLabel,
    type CompensationTerm,
} from "@/lib/employmentCompensation/employmentCompensationModel";

/**
 * COMPENSATION — "what are this employee's terms, and since when?"
 *
 * Its own card, per the Slice 7 decision, and the only restricted one in the Staff
 * family. Pay does not belong on the Employment card: that card is opened all day
 * for a badge number or a start date, and gating it would either hide those from
 * people who need them or render it differently per viewer, which leaves an
 * operator unsure what they are not being shown.
 *
 * ── IT RENDERS NOTHING WHEN THE OPERATOR MAY NOT SEE PAY ──
 *
 * Normally this card is never reached at all: `buildSubjectCompensationContext`
 * withholds the context from a caller without `staff.compensation.read`, so there
 * is no chip to click. This handles 403 anyway and renders nothing, because a card
 * that depended on the chooser having been correct would be one refactor away from
 * showing a rate to somebody who was never granted it.
 *
 * ── HISTORY, SHOWN AS HISTORY ──
 *
 * The current term leads. A recorded future rate is labelled as future rather than
 * mixed in, and prior terms are kept visible: "what were they earning in March" is
 * the question the authority exists to answer, and a card that showed only today
 * would make the history unreachable in the product that owns it.
 */

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type CardState = {
    asOf: string;
    current: CompensationTerm | null;
    future: CompensationTerm[];
    history: CompensationTerm[];
};

function line(term: CompensationTerm): string {
    return `${formatCompensationRate(term)} · ${payBasisLabel(term.payBasis)}`;
}

export default function StaffCompensationCard({ model, context, receded = false, coordination }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [state, setState] = useState<CardState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** 403 is not an error to show — it is a reason to render nothing at all. */
    const [forbidden, setForbidden] = useState(false);

    useReportPerspective(coordination, "staff_compensation", expanded ? "focused" : "base");
    useDismissSignal(coordination, "staff_compensation", () => setExpanded(false));

    const signal = context.employment ?? NULL_EMPLOYMENT_SIGNAL;
    const person = signal.primary ?? signal.people[0] ?? null;
    const employmentId = person?.employment.current?.id ?? person?.employment.periods[0]?.id ?? null;

    const load = useCallback(async () => {
        if (!employmentId) { setState(null); return; }
        setLoading(true);
        setError(null);
        setForbidden(false);
        try {
            const res = await fetch(
                `/api/admin/staff-compensation?employment_id=${encodeURIComponent(employmentId)}`,
                { credentials: "include" },
            );
            if (res.status === 403) { setForbidden(true); setState(null); return; }
            const json = (await res.json()) as Partial<CardState> & { error?: string };
            if (!res.ok) {
                setError(json?.error || "Compensation could not be read.");
                setState(null);
                return;
            }
            setState({
                asOf: json.asOf ?? "",
                current: json.current ?? null,
                future: json.future ?? [],
                history: json.history ?? [],
            });
        } catch {
            setError("Compensation could not be read.");
            setState(null);
        } finally {
            setLoading(false);
        }
    }, [employmentId]);

    useEffect(() => {
        // Clear FIRST: one employee's pay must never linger over another's.
        setState(null);
        void load();
    }, [load]);

    if (!model.visible || !person || !employmentId) return null;
    if (forbidden) return null;

    const current = state?.current ?? null;
    const insight = !state
        ? (loading ? "Reading compensation…" : (error ?? "Compensation unavailable"))
        : current
          ? line(current)
          // Null is not zero. Nobody is paid nothing; the term has simply not been recorded.
          : "No compensation terms recorded.";

    return (
        <div
            className="alloy-os-staff-compensation"
            data-staff-compensation-card="true"
            data-staff-compensation-basis={current?.payBasis ?? ""}
            data-staff-compensation-history={state ? String(state.history.length) : ""}
            data-staff-compensation-future={state ? String(state.future.length) : ""}
        >
            <UniversalCard
                title={model.title}
                insight={insight}
                supportingInsight={
                    expanded || !current ? null : `Effective ${current.effectiveStart}`
                }
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={current ? payBasisLabel(current.payBasis) : null}
                statusTone={current ? "ready" : "neutral"}
                density={expanded ? "expanded" : (model.density ?? "compact")}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setExpanded((v) => !v)}
                        data-staff-compensation-action={expanded ? "collapse" : "expand"}
                    >
                        {expanded ? "← Back to panel" : "View compensation"}
                    </button>
                }
            >
                {expanded ? (
                    <div className="alloy-os-staff-compensation__expanded" data-staff-compensation-expanded="true">
                        {error ? <p data-staff-compensation-error="true">{error}</p> : null}

                        {current ? (
                            <section data-staff-compensation-current="true">
                                <p data-staff-compensation-rate="true">{line(current)}</p>
                                <p data-staff-compensation-effective="true">
                                    Effective {current.effectiveStart}
                                    {current.effectiveEnd ? ` until ${current.effectiveEnd}` : ""}
                                </p>
                            </section>
                        ) : (
                            <p data-staff-compensation-empty="true">No compensation terms recorded.</p>
                        )}

                        {(state?.future ?? []).length > 0 ? (
                            <section data-staff-compensation-future-section="true">
                                <p>Scheduled</p>
                                {state!.future.map((t) => (
                                    <p key={t.id} data-staff-compensation-future-term={t.id}>
                                        {line(t)} from {t.effectiveStart}
                                    </p>
                                ))}
                            </section>
                        ) : null}

                        {(state?.history ?? []).length > 0 ? (
                            <section data-staff-compensation-history-section="true">
                                <p>Previous</p>
                                {state!.history.map((t) => (
                                    <p key={t.id} data-staff-compensation-history-term={t.id}>
                                        {line(t)} · {t.effectiveStart} to {t.effectiveEnd ?? "—"}
                                    </p>
                                ))}
                            </section>
                        ) : null}
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}
