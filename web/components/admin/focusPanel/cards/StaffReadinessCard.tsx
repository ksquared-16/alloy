"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    READINESS_LEVEL_GROUP_COPY,
    groupReadinessGapsByLevel,
    readinessDisplayReadyMessage,
} from "@/lib/completion/readinessDisplayPresentation";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
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

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type CardState = {
    readiness: ReadinessResult;
    work_context: { asOf: string; siteLabel: string | null };
    employment: { status: string | null; end_date: string | null };
};

/** Operator words for the derived state. Never the raw enum. */
const STATE_COPY: Record<string, { chip: string; line: string }> = {
    ready: { chip: "Ready", line: readinessDisplayReadyMessage() },
    needs_information: { chip: "Needs information", line: "Something is missing before this is complete." },
    expired: { chip: "Expired", line: "Something that was in place has lapsed." },
    warning: { chip: "Attention", line: "Worth a look." },
    blocked: { chip: "Blocked", line: "A gated action cannot run." },
};

/**
 * Staff Readiness card — "is this Staff member ready, and what needs attention?"
 *
 * ── IT OWNS NOTHING ──
 *
 * Every line here is derived from facts other cards own: employment, qualifications
 * and the requirements configured against them. There is no readiness record to
 * edit, and the card offers no way to change the verdict — only pointers to the
 * cards that own the inputs. That is what keeps one readiness answer in the system.
 *
 * ── IT DOES NOT SAY "BLOCKED" HERE ──
 *
 * The read uses the `record_view` trigger, which the engine does not treat as a
 * blocking trigger, so an enforced requirement surfaces as expired or needs
 * information. Showing "blocked from work" while viewing a record would assert a
 * consequence this slice deliberately does not implement — and an operator would
 * believe it.
 */
export default function StaffReadinessCard({ model, context, receded = false, coordination }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [state, setState] = useState<CardState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useReportPerspective(coordination, "staff_readiness", expanded ? "focused" : "base");
    useDismissSignal(coordination, "staff_readiness", () => setExpanded(false));

    const signal = context.employment ?? NULL_EMPLOYMENT_SIGNAL;
    const person = signal.primary ?? signal.people[0] ?? null;
    // Readiness is about an employment. An ended one still evaluates — it reports
    // that it ended — so this uses the current period when there is one and the
    // most recent otherwise.
    const employmentId = person?.employment.current?.id ?? person?.employment.periods[0]?.id ?? null;

    const load = useCallback(async () => {
        if (!employmentId) { setState(null); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/staff-readiness?employment_id=${encodeURIComponent(employmentId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as Partial<CardState> & { error?: string };
            if (!res.ok || !json.readiness) {
                setError(json?.error || "Readiness could not be evaluated.");
                setState(null);
                return;
            }
            setState(json as CardState);
        } catch {
            setError("Readiness could not be evaluated.");
            setState(null);
        } finally {
            setLoading(false);
        }
    }, [employmentId]);

    useEffect(() => {
        // Clear FIRST: one person's verdict must not linger over another's.
        setState(null);
        void load();
    }, [load]);

    if (!model.visible || !person || !employmentId) return null;

    const readiness = state?.readiness;
    const copy = readiness ? STATE_COPY[readiness.primary_state] : null;
    const groups = readiness ? groupReadinessGapsByLevel(readiness) : [];

    const insight = !state
        ? (loading ? "Evaluating readiness…" : (error ?? "Readiness unavailable"))
        : (copy?.line ?? "Readiness evaluated.");

    const statusTone =
        readiness?.primary_state === "ready" ? "ready"
        : readiness?.primary_state === "expired" ? "at-risk"
        : readiness?.primary_state === "blocked" ? "blocked"
        : readiness && readiness.gaps.length > 0 ? "due"
        : "neutral";

    return (
        <div
            className="alloy-os-staff-readiness"
            data-staff-readiness-card="true"
            data-staff-readiness-state={readiness?.primary_state ?? ""}
            data-staff-readiness-as-of={state?.work_context?.asOf ?? ""}
            data-staff-readiness-blocking={readiness ? String(readiness.counts.blocking) : ""}
        >
            <UniversalCard
                title={model.title}
                insight={insight}
                supportingInsight={
                    expanded || !readiness ? null
                        : `${readiness.counts.satisfied} of ${readiness.counts.configured} requirements met`
                }
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={copy?.chip ?? null}
                statusTone={statusTone}
                density={expanded ? "expanded" : (model.density ?? "compact")}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setExpanded((v) => !v)}
                        data-staff-readiness-action={expanded ? "collapse" : "expand"}
                    >
                        {expanded ? "← Back to panel" : "View readiness"}
                    </button>
                }
            >
                {expanded && readiness ? (
                    <div className="alloy-os-staff-readiness__expanded" data-staff-readiness-expanded="true">
                        {error ? <p data-staff-readiness-error="true">{error}</p> : null}

                        {readiness.gaps.length === 0 ? (
                            <p data-staff-readiness-empty="true">{readinessDisplayReadyMessage()}</p>
                        ) : (
                            // Grouped by the platform's own level grammar, so a Staff
                            // verdict reads like every other readiness answer.
                            groups.map((group) => (
                                <section key={group.level} data-staff-readiness-group={group.level}>
                                    <h4>{READINESS_LEVEL_GROUP_COPY[group.level].heading}</h4>
                                    <p data-staff-readiness-group-helper="true">
                                        {READINESS_LEVEL_GROUP_COPY[group.level].helper}
                                    </p>
                                    <ul>
                                        {group.gaps.map((gap) => (
                                            <li
                                                key={gap.requirement_id}
                                                data-staff-readiness-gap={gap.requirement_id}
                                                data-staff-readiness-gap-kind={gap.failure_kind}
                                                data-staff-readiness-gap-scope={gap.scope_type}
                                                data-staff-readiness-gap-blocking={gap.blocking ? "true" : "false"}
                                            >
                                                <span data-staff-readiness-gap-label="true">{gap.label}</span>
                                                {/* The WHY, in the operator's words — never a rule key. */}
                                                <span data-staff-readiness-gap-reason="true">{gap.missing_reason}</span>
                                                {gap.resolution?.type === "action" ? (
                                                    <span data-staff-readiness-gap-resolution={gap.resolution.action_key}>
                                                        {gap.failure_kind === "expired"
                                                            ? "Renew this qualification on the Qualifications card."
                                                            : gap.failure_kind === "incomplete"
                                                              ? "Attach evidence on the Qualifications card."
                                                              : "Record this qualification on the Qualifications card."}
                                                    </span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))
                        )}
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}
