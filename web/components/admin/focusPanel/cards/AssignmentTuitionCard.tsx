"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { loadFinancialConfig } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigResource";
import { readFinancialNestedSurfaceGroupsFromDoc } from "@/lib/adminV2/runtime/focusPanel/billingPreview/financialNestedSurfaceRuntime";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import type { FinancialConfigApiResponse } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import type { AssignmentTuitionView, TuitionOptionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * ASSIGNMENT → TUITION. What this child's assignment costs, why, and what was agreed.
 *
 * ── WHAT THIS CARD IS, AND WHAT IT REPLACED ──
 *
 * It was called "Billing Preview", and it showed nothing: it read `commercial_tuition_rates` through
 * columns `20260702000002_commercial_tuition_rates_v2` had dropped, so its route answered 500 and
 * the card could never display a figure at all. The name is the more interesting half of the
 * mistake. There is no Billing Card product and no Quote product: tuition is PROGRAM PRICING
 * resolved as ENROLLMENT PRICING, and the surface it belongs on is the assignment being priced.
 * The runtime key stays `billing_preview` for the same reason the Assignments card's key is still
 * `scheduling` — a key is history, a label is the product.
 *
 * ── THIS CARD DECIDES NOTHING ──
 *
 * Commercial Configuration authors the options. Commercial Execution resolves which apply and
 * recommends one, or says the configuration is ambiguous, or says nothing applies. This card
 * renders that answer and offers the two registered actions that record the operator's decision.
 * It computes no amount, ranks no option, and holds no authoritative price in React state: after a
 * commit it refetches, because a card that patched its own row would be a second answer to a
 * question the pricing terms already answer.
 *
 * Accepting creates no charge. An accepted term is a contract fact; turning it into money is a
 * later thread's job.
 */

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    composerPreview?: { perspective?: "expanded" };
};

const STATE_LABEL: Record<AssignmentTuitionView["state"], string> = {
    recommended: "Recommended",
    ambiguous: "Needs a choice",
    no_match: "No configured tuition",
};

function OptionRow({
    option,
    kind,
    onChoose,
    busy,
}: {
    option: TuitionOptionView;
    kind: "recommended" | "alternative" | "tied" | "accepted";
    onChoose?: (option: TuitionOptionView) => void;
    busy?: boolean;
}) {
    return (
        <li
            className="alloy-os-tuition__option"
            data-tuition-option={option.sourceId}
            data-tuition-option-kind={kind}
            data-tuition-option-amount={option.amountCents}
            data-tuition-option-cadence={option.cadenceKey}
        >
            <span className="alloy-os-tuition__amount" data-tuition-amount="true">
                {option.amountLabel}
            </span>
            <span className="alloy-os-tuition__variant">{option.variantLabel}</span>
            {option.scope === "location" ? (
                <span className="alloy-os-tuition__scope" data-tuition-scope="location">
                    Site rate
                </span>
            ) : null}
            {onChoose ? (
                <button
                    type="button"
                    className="alloy-os-tuition__choose"
                    data-tuition-choose={option.sourceId}
                    disabled={busy}
                    onClick={() => onChoose(option)}
                >
                    Choose
                </button>
            ) : null}
        </li>
    );
}

export default function AssignmentTuitionCard({
    model,
    context,
    receded = false,
    coordination,
    composerPreview,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        if (composerPreview?.perspective === "expanded") setExpanded(true);
    }, [composerPreview]);

    const opportunityId = context.subject.type === "opportunity" ? context.subject.id : null;
    const [data, setData] = useState<FinancialConfigApiResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    /** An operator-chosen alternative, awaiting its reason. Null while accepting the recommendation. */
    const [overriding, setOverriding] = useState<{ ocmId: string; option: TuitionOptionView } | null>(null);
    const [overrideReason, setOverrideReason] = useState("");
    const [commandError, setCommandError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!opportunityId) return;
        setLoading(true);
        setError(null);
        try {
            setData(await loadFinancialConfig(opportunityId));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Tuition could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load]);

    useReportPerspective(coordination, "billing_preview", expanded ? "focused" : "base");
    useDismissSignal(coordination, "billing_preview", () => setExpanded(false));

    const assignments = useMemo(() => data?.assignments ?? [], [data]);

    /*
     * PUBLISHED NESTED SURFACE GROUPS — a platform contract this card keeps.
     *
     * The Focus Panel composer lets an operator author extra field groups onto this card, published
     * as `metadata.nestedSurfaces["financial_configuration_surface"]`. Renaming the card's identity
     * from Billing Preview to Tuition changes what it is ABOUT; it does not entitle it to stop
     * honouring configuration somebody has already published against it.
     */
    const publishedDoc = usePublishedFocusPanelSummaryDoc(expanded);
    const nestedSurfaceGroups = useMemo(
        () =>
            expanded
                ? readFinancialNestedSurfaceGroupsFromDoc(publishedDoc, context, null)
                : null,
        [expanded, publishedDoc, context],
    );

    /**
     * THE COMMIT — through the registered action, never a direct write.
     *
     * The payload names the assignment, the resolution the operator was looking at, and the option
     * they chose. It carries no amount: the server re-reads and re-resolves, and takes the price
     * from the catalog. A stale resolution is refused there, and the refusal is shown here.
     */
    const commit = useCallback(
        async (
            actionKey: "enrollment.pricing.accept" | "enrollment.pricing.override",
            view: AssignmentTuitionView,
            option: TuitionOptionView,
            reason?: string,
        ) => {
            if (running) return;
            setRunning(true);
            setCommandError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: "opportunity_customer_member",
                        entity_id: view.opportunityCustomerMemberId,
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: {
                            opportunity_customer_member_id: view.opportunityCustomerMemberId,
                            resolution_key: view.resolutionKey,
                            selected_source_id: option.sourceId,
                            /*
                             * THE FACTS THIS RESOLUTION WAS COMPUTED FROM, ECHOED EXACTLY.
                             *
                             * Not the option's cadence: an unchosen billing frequency is a real
                             * input, and substituting the recommendation's own cadence for it makes
                             * the server re-resolve a DIFFERENT question and refuse the acceptance
                             * as stale. Found by driving the real card — the payload has to say what
                             * was asked, not what came back.
                             */
                            ...(view.facts.cadenceKey ? { cadence_key: view.facts.cadenceKey } : {}),
                            as_of: view.facts.asOf,
                            ...(reason ? { override_reason: reason } : {}),
                            // Replacing a live term on the same date is deliberate, never implicit.
                            ...(view.accepted ? { supersede: true } : {}),
                        },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                if (!json?.ok) {
                    const message = typeof json?.error === "string" ? json.error : json?.error?.message;
                    // The domain refusing is an answer — a stale resolution, a missing permission,
                    // an option that no longer applies. Surfaced verbatim, never swallowed.
                    setCommandError(message || "That could not be recorded.");
                    return;
                }
                setOverriding(null);
                setOverrideReason("");
            } catch {
                setCommandError("The request could not be sent.");
            } finally {
                setRunning(false);
                // Refetch rather than patch: the pricing terms are the answer, not this component.
                await load();
            }
        },
        [load, running],
    );

    const withTuition = assignments.filter((a) => a.recommended || a.accepted || a.state !== "no_match");
    const insight = loading
        ? "Resolving…"
        : assignments.length === 0
          ? "No assignment to price"
          : `${assignments.filter((a) => a.accepted).length} of ${assignments.length} agreed`;

    const body = (
        <div className="alloy-os-tuition" data-assignment-tuition="true" data-tuition-count={assignments.length}>
            {error ? (
                <p className="alloy-os-tuition__error" data-tuition-error="load">
                    {error}
                </p>
            ) : null}
            {commandError ? (
                <p className="alloy-os-tuition__error" data-tuition-error="command">
                    {commandError}
                </p>
            ) : null}
            {!loading && assignments.length === 0 ? (
                <p className="alloy-os-tuition__empty">No assignment on this record to price.</p>
            ) : null}

            {nestedSurfaceGroups?.map((group) => (
                <section
                    key={group.key}
                    className="alloy-os-tuition__nested"
                    data-financial-nested-group={group.key}
                >
                    <h4>{group.label}</h4>
                    <ul data-financial-nested-fields={group.key}>
                        {group.fields.map((field) => (
                            <li key={field.key} data-financial-nested-field={field.key}>
                                <span>{field.label}</span>
                                <span>{field.value}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {assignments.map((view) => {
                const accepted = view.accepted;
                const acceptedOption =
                    view.applicable.find((o) => o.sourceId === accepted?.source.id) ?? null;
                return (
                    <section
                        key={view.opportunityCustomerMemberId}
                        className="alloy-os-tuition__assignment"
                        data-tuition-assignment={view.opportunityCustomerMemberId}
                        data-tuition-member={view.customerMemberId}
                        data-tuition-state={view.state}
                        data-tuition-accepted={accepted ? accepted.state : "none"}
                        data-tuition-stale={view.acceptedIsStale ? "true" : "false"}
                        data-tuition-resolution={view.resolutionKey}
                        data-tuition-config-version={view.configVersion}
                    >
                        <h4 className="alloy-os-tuition__child">{view.childLabel}</h4>

                        {/* The facts this price was computed from, named by their owners. */}
                        <ul className="alloy-os-tuition__facts" data-tuition-facts="true">
                            <li data-tuition-fact="program">Program · {view.facts.programKey ?? "—"}</li>
                            <li data-tuition-fact="attendance">Attendance · {view.facts.attendanceType ?? "—"}</li>
                            <li data-tuition-fact="days">
                                Schedule · {view.facts.daysPerWeek ?? "—"} days a week
                            </li>
                            <li data-tuition-fact="as-of">Effective · {view.facts.asOf}</li>
                        </ul>

                        {accepted ? (
                            <div
                                className="alloy-os-tuition__accepted"
                                data-tuition-accepted-term={accepted.termId}
                                data-tuition-accepted-state={accepted.state}
                            >
                                <p className="alloy-os-tuition__accepted-line">
                                    <strong data-tuition-accepted-amount="true">
                                        {(accepted.amountCents / 100).toLocaleString(undefined, {
                                            style: "currency",
                                            currency: accepted.currencyCode || "USD",
                                        })}
                                        /{accepted.cadenceKey}
                                    </strong>{" "}
                                    {accepted.state === "overridden" ? "overridden" : "accepted"}, effective{" "}
                                    {accepted.effectiveStart}
                                </p>
                                {/*
                                 * BOTH HALVES OF AN OVERRIDE STAY VISIBLE. What was recommended is not
                                 * erased by the decision to depart from it — that is what makes the
                                 * departure explainable a year later.
                                 */}
                                {accepted.state === "overridden" ? (
                                    <p className="alloy-os-tuition__override" data-tuition-override="true">
                                        <span data-tuition-override-reason="true">{accepted.overrideReason}</span>
                                        {accepted.recommendedSourceId ? (
                                            <span data-tuition-override-recommended={accepted.recommendedSourceId}>
                                                {" "}
                                                · recommendation was another authored option
                                            </span>
                                        ) : null}
                                    </p>
                                ) : null}
                                {view.acceptedIsStale ? (
                                    <p className="alloy-os-tuition__stale" data-tuition-stale-notice="true">
                                        The assignment has changed since this was agreed. Re-resolve before
                                        accepting again.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        <p className="alloy-os-tuition__state" data-tuition-state-label="true">
                            {STATE_LABEL[view.state]}
                        </p>

                        {view.state === "recommended" && view.recommended ? (
                            <>
                                <ul className="alloy-os-tuition__options">
                                    <OptionRow option={view.recommended} kind="recommended" />
                                </ul>
                                <ul className="alloy-os-tuition__why" data-tuition-explanation="true">
                                    {view.recommended.matched.map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    className="alloy-os-tuition__accept"
                                    data-tuition-command="accept"
                                    data-tuition-accept-assignment={view.opportunityCustomerMemberId}
                                    disabled={running}
                                    onClick={() =>
                                        void commit("enrollment.pricing.accept", view, view.recommended!)
                                    }
                                >
                                    {running ? "Recording…" : "Accept tuition"}
                                </button>
                            </>
                        ) : null}

                        {view.state === "ambiguous" ? (
                            <>
                                {/*
                                 * NOTHING IS SELECTED HERE. The configuration has not said which of these
                                 * applies, so the operator settles it — and settling it is an override,
                                 * because it is a choice the catalog did not make.
                                 */}
                                <p className="alloy-os-tuition__ambiguous" data-tuition-ambiguous="true">
                                    {view.tied.length} configured options apply equally. Choosing one is an
                                    override, and needs a reason.
                                </p>
                                <ul className="alloy-os-tuition__options">
                                    {view.tied.map((option) => (
                                        <OptionRow
                                            key={option.sourceId}
                                            option={option}
                                            kind="tied"
                                            busy={running}
                                            onChoose={(o) =>
                                                setOverriding({ ocmId: view.opportunityCustomerMemberId, option: o })
                                            }
                                        />
                                    ))}
                                </ul>
                            </>
                        ) : null}

                        {view.state === "no_match" ? (
                            <p className="alloy-os-tuition__nomatch" data-tuition-no-match={view.noMatchReason ?? "unknown"}>
                                No configured tuition applies to this assignment
                                {view.rejected.length > 0 ? ` — ${view.rejected[0]!.detail}` : ""}.
                            </p>
                        ) : null}

                        {/* Other authored options that DO apply — an override chooses from these. */}
                        {view.state === "recommended" && view.applicable.length > 1 ? (
                            <>
                                <p className="alloy-os-tuition__alternatives-label">Other authored options</p>
                                <ul className="alloy-os-tuition__options" data-tuition-alternatives="true">
                                    {view.applicable
                                        .filter((o) => o.sourceId !== view.recommended?.sourceId)
                                        .map((option) => (
                                            <OptionRow
                                                key={option.sourceId}
                                                option={option}
                                                kind="alternative"
                                                busy={running}
                                                onChoose={(o) =>
                                                    setOverriding({
                                                        ocmId: view.opportunityCustomerMemberId,
                                                        option: o,
                                                    })
                                                }
                                            />
                                        ))}
                                </ul>
                            </>
                        ) : null}

                        {overriding?.ocmId === view.opportunityCustomerMemberId ? (
                            <div className="alloy-os-tuition__override-form" data-tuition-override-form="true">
                                <p>
                                    Override to{" "}
                                    <strong data-tuition-override-choice={overriding.option.sourceId}>
                                        {overriding.option.amountLabel}
                                    </strong>
                                </p>
                                <input
                                    type="text"
                                    className="alloy-os-tuition__reason"
                                    data-tuition-override-reason-input="true"
                                    placeholder="Why the recommended tuition does not apply"
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                />
                                <button
                                    type="button"
                                    data-tuition-command="override"
                                    disabled={running || overrideReason.trim().length === 0}
                                    onClick={() =>
                                        void commit(
                                            "enrollment.pricing.override",
                                            view,
                                            overriding.option,
                                            overrideReason.trim(),
                                        )
                                    }
                                >
                                    {running ? "Recording…" : "Record override"}
                                </button>
                                <button
                                    type="button"
                                    data-tuition-command="override-cancel"
                                    onClick={() => {
                                        setOverriding(null);
                                        setOverrideReason("");
                                        setCommandError(null);
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : null}

                        {acceptedOption && view.state !== "recommended" ? (
                            <ul className="alloy-os-tuition__options">
                                <OptionRow option={acceptedOption} kind="accepted" />
                            </ul>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );

    return (
        <UniversalCard
            title="Tuition"
            insight={insight}
            iconName="Receipt"
            tier="work"
            archetype="status"
            density={expanded ? "expanded" : "standard"}
            gridSpan={expanded ? "row" : undefined}
            modalClass={expanded ? "record" : undefined}
            receded={receded}
            data-universal-card-key="assignment_tuition"
            footerAction={
                withTuition.length > 0 ? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        data-tuition-action={expanded ? "collapse" : "expand"}
                        onClick={() => setExpanded((v) => !v)}
                    >
                        {expanded ? "← Back to panel" : "Details →"}
                    </button>
                ) : null
            }
        >
            {body}
        </UniversalCard>
    );
}
