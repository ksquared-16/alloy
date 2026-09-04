"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProgressionBand from "@/components/operationalCards/ProgressionBand";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { Action, ActionRow, FooterAction } from "@/components/cardLab/CardLabKit";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { currentWorkActivityRowKey } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActivityRowKey";
import type { ProcessEvidence, RailParticipant } from "@/lib/cardLab/cardLabTypes";

/**
 * Business Process — Journey and What's Next, composed into ONE card.
 *
 *   the band     where this record has been and where it is now   (Business Process / Stage)
 *   the work     what to do about it right now                    (Operational Work + Readiness)
 *   the actions  the registered actions for that work
 *
 * ── DATA OWNERSHIP IS NOT MERGED ──
 *
 * Stage truth stays with the Business Process, work and actions stay with Current Work, and
 * missing information stays with Readiness. This card COMPOSES three existing owners; it derives
 * nothing and it owns nothing.
 *
 * ── NOTHING IS SAID TWICE ──
 *
 * Journey and What's Next both stated the current stage, and What's Next also stated the status.
 * Here the band's current column IS the stage, so the work band names it once as a micro-label and
 * never repeats it. Recent Activity is deliberately absent: activity has its own canonical mode,
 * and reproducing it here would make this a third Activity surface.
 *
 * ── NO PROCESS BRANCHING ──
 *
 * Stages, labels, work and actions all arrive as configuration. There is no Enrollment special
 * case in this component, which is what makes the Assignment and Billing specimens render through
 * the same code.
 *
 * ── NO LENS CHIP ──
 *
 * The originating Work View is NOT rendered. The surrounding workspace already tells the operator
 * which lens they are in, and repeating it consumed card space to restate navigation context. It
 * would earn its place only if the lens materially changed the work or the recommendation — which,
 * per the rule below, it cannot.
 *
 * ── WORK VIEW NEVER DECIDES THE STAGE ──
 *
 * `sourceWorkView` renders as a lens chip and nothing else. It is structurally impossible for it
 * to reach the stage: `buildOperationalContext` resolves `businessProcess.stageKey` from
 * `subjectVm.workspace.lifecycle_rail.current_stage_key ?? stage_context.stage_key` and contains
 * NO reference to a work unit or work view. The only seam a lens can touch is the stage *label*
 * fallback (`stage_label ?? statusLabel`) — never the key.
 *
 * ── THE RAIL CARRIES BOTH GRAINS ──
 *
 *   1  case journey        the configured stage spine, WITH participants projected onto the
 *                          stage each is actually at
 *   2  current case work   and the actions whose SUBJECT is the case
 *   3  selected participant — a row ONLY when a scoped child has its own action
 *   4  recent activity      — bounded, canonical, and omitted when empty
 *
 * ── NO EXPANDED REPRESENTATION ──
 *
 * There is no `View process →` and no Process detail. The summary carries progression, current
 * case state, participant divergence, current work, what is still needed, and the registered
 * actions — which is what operating the process requires. `View all activity →` switches the Focus
 * Panel to its EXISTING Activity mode rather than opening a surface of this card's own.
 *
 * A participant marker never moves the case marker. Avery sits under Waitlist while the case
 * marker stays on Tour, so both grains are legible in one glance — and the generic children list
 * that used to sit beneath the card is gone, because it repeated the name, the stage and the date
 * the rail already shows.
 *
 * The case stage and a child's stage are both authoritative and may legitimately differ. A
 * waitlisted Avery never rewrites a case at Tour, and Riley never inherits Avery's state.
 *
 * `operational-grain-doctrine.md` §2.4: the Focus Panel always opens on an Opportunity, and a
 * child selection is a scope HINT — "it does not change the Focus Panel's grain. The panel is
 * still case-grain." So a scoped child is ORDERED FIRST and emphasised; it never becomes the
 * subject.
 *
 * When every child matches the case, the region collapses to one line: the divergence is the
 * signal, so alignment should cost nothing.
 */
export default function ProcessCard({
    evidence,
    onViewAllActivity,
    receded = false,
    fallbackTitle,
}: {
    evidence: ProcessEvidence;
    /** Production dims non-focused cards; the lab never does. Presentation only. */
    receded?: boolean;
    /**
     * Used only when the process has no name yet. The lab's specimens always name their process;
     * a production context whose canonical process name has not been resolved falls back rather
     * than rendering an empty title.
     */
    fallbackTitle?: string;
    /**
     * Switches the Focus Panel to its existing ACTIVITY mode —
     * `coordination.openFocusPanelMode("activity")`. Not a Process detail surface: the Process
     * card has no expanded representation, because the summary already carries everything needed
     * to operate the process.
     */
    onViewAllActivity?: () => void;
}) {
    const current = evidence.stages.find((s) => s.state === "current");
    // Collapse participant noise when every child matches the case — the divergence IS the signal.
    const aligned =
        evidence.childStates.length > 0 &&
        evidence.childStates.every((c) => c.stageKey === evidence.currentStageLabel);
    // Project each participant onto the stage they are ACTUALLY at. The case marker never moves.
    const participantsByStep: Record<string, RailParticipant[]> = {};
    if (evidence.participantsLabel && !aligned) {
        for (const c of evidence.childStates) {
            // stageKey is explicit. "Waitlisted" and "Waitlist" are different vocabularies, and
            // inferring one from the other would silently drop a marker.
            if (!evidence.stages.some((st) => st.label === c.stageKey)) continue;
            (participantsByStep[c.stageKey] ??= []).push({
                name: c.name,
                shortName: c.name.split(" ")[0]!,
                imageUrl: c.imageUrl,
                scoped: c.scoped,
            });
        }
    }
    // Only a SCOPED child with its own action still earns a row — the rail says everything else.
    const scopedChild = evidence.childStates.find((c) => c.scoped && c.actions.length);

    return (
        <div className="alloy-os-process" data-process-card="true">
            <UniversalCard
                title={evidence.processLabel || fallbackTitle || ""}
                insight=""
                iconName="GitBranch"
                tier="work"
                archetype="action"
                density="compact"
                gridSpan="row"
                receded={receded}
                data-universal-card-key="business_process"
                footerAction={null}
            >
                <ProgressionBand
                    steps={evidence.stages.map((s) => ({
                        state: s.state,
                        value: s.label,
                        // Two configured slots. The platform caps it here — never a third line.
                        detail: s.primarySupport,
                        note: s.secondarySupport,
                    }))}
                    dataName="process"
                    compact
                    participantsByStep={participantsByStep}
                />

                {/* 2 · CURRENT CASE WORK — and the actions whose SUBJECT is the case. */}
                <div className="alloy-os-process__work">
                    <div className="alloy-os-process__work-main">
                        <p className="alloy-os-process__work-label">Case · {evidence.currentStageLabel}</p>
                        <p className="alloy-os-process__work-line">
                            {evidence.workLine}
                            {evidence.dueLine ? (
                                <span className="alloy-os-process__due"> · {evidence.dueLine}</span>
                            ) : null}
                        </p>
                        {evidence.stillNeeded.length ? (
                            <p className="alloy-os-process__needed">
                                <span className="alloy-os-process__needed-label">Still needed</span>
                                {evidence.stillNeeded.join(" · ")}
                            </p>
                        ) : null}
                    </div>
                    <div className="alloy-os-process__work-actions">
                        <ActionRow>
                            {/* CONFIGURATION DECIDES THE SET AND THE ORDER; the platform decides
                                whether each one can run. The card renders both verdicts and owns
                                neither — there is no filtering, no re-ordering and no emphasis
                                rule here. */}
                            {evidence.actions.map((a) =>
                                a.menu?.length ? (
                                    /* ONE OPERATIONAL CONCEPT, ONE CONTROL. The runtime decided
                                       these belong together and what this control is called; the
                                       card only draws it. Secondary operations execute exactly as
                                       top-level ones do. */
                                    <DropdownMenu key={a.key ?? a.label}>
                                        <DropdownMenuTrigger asChild>
                                            <Action
                                                primary={a.primary}
                                                disabled={a.disabled}
                                                title={a.disabledReason ?? undefined}
                                                data-process-action-group={a.key ?? undefined}
                                                onMouseEnter={a.onIntent}
                                                onFocus={a.onIntent}
                                            >
                                                {a.label} ▾
                                            </Action>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                            {a.menu.map((m) => (
                                                <DropdownMenuItem
                                                    key={m.key ?? m.label}
                                                    disabled={m.disabled}
                                                    title={m.disabledReason ?? undefined}
                                                    onSelect={() => m.onInvoke?.()}
                                                    onMouseEnter={m.onIntent}
                                                    onFocus={m.onIntent}
                                                    data-process-action={m.key ?? undefined}
                                                >
                                                    {m.label}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <Action
                                        key={a.key ?? a.label}
                                        primary={a.primary}
                                        disabled={a.disabled}
                                        title={a.disabledReason ?? undefined}
                                        onClick={a.onInvoke}
                                        onMouseEnter={a.onIntent}
                                        onFocus={a.onIntent}
                                        data-process-action={a.key ?? undefined}
                                    >
                                        {a.label}
                                    </Action>
                                ),
                            )}
                        </ActionRow>
                    </div>
                </div>

                {/* 3 · ONE FOOT ROW — participants left, activity right.
                    Two bands became one. The rail already says who is where, so the left half
                    carries only what the rail cannot: a scoped child with its own action, or the
                    fact that everyone is together. The right half spends NO height on activity —
                    the list is revealed on demand, never printed onto the card face. */}
                {scopedChild || (aligned && evidence.participantsLabel) || evidence.activity.length ? (
                    <div className="alloy-os-process__foot">
                        <div className="alloy-os-process__foot-left">
                            {scopedChild ? (
                                <div className="alloy-os-process__scoped">
                                    <CardAvatar
                                        name={scopedChild.name}
                                        imageUrl={scopedChild.imageUrl ?? null}
                                        size={22}
                                        role="child"
                                    />
                                    <span className="alloy-os-process__scoped-name">{scopedChild.name}</span>
                                    <span className="alloy-os-process__participant-stage">{scopedChild.stage}</span>
                                    {scopedChild.since ? (
                                        <span className="alloy-os-process__participant-since">
                                            {scopedChild.since}
                                        </span>
                                    ) : null}
                                    {/* Subject is stated, never inferred from proximity. */}
                                    <span className="alloy-os-process__participant-actions">
                                        {scopedChild.actions.map((a) => (
                                            <FooterAction key={a.label}>{a.label} →</FooterAction>
                                        ))}
                                    </span>
                                </div>
                            ) : aligned && evidence.participantsLabel ? (
                                <p className="alloy-os-process__aligned">
                                    <span className="alloy-os-process__needed-label">
                                        {evidence.childStates.length}{" "}
                                        {evidence.childStates.length === 1
                                            ? evidence.participantsLabel
                                                  .toLowerCase()
                                                  .replace(/ren$/, "")
                                                  .replace(/s$/, "")
                                            : evidence.participantsLabel.toLowerCase()}
                                    </span>{" "}
                                    all at {evidence.currentStageLabel}
                                </p>
                            ) : null}
                        </div>

                        {/* 4 · ACTIVITY ON DEMAND — zero rows on the card face. Omitted entirely when
                            there is none: a trigger that opens an empty menu is a broken promise. */}
                        <div className="alloy-os-process__foot-right">
                            {evidence.activity.length ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="alloy-os-process__activity-trigger"
                                            data-process-activity-trigger="true"
                                        >
                                            Recent activity
                                            <span className="alloy-os-process__activity-count">
                                                {evidence.activity.length}
                                            </span>
                                            <span aria-hidden="true">▾</span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        sideOffset={4}
                                        data-process-activity-menu="true"
                                        className="alloy-os-currentwork__tour-menu alloy-os-process__activity-menu"
                                    >
                                        {evidence.activity.map((a, i) => (
                                            <DropdownMenuItem
                                                // THE canonical owner of an activity row's render
                                                // identity. Keying on `${a.label}-${a.when}` is the
                                                // exact defect it was created to eliminate.
                                                key={currentWorkActivityRowKey(a, i)}
                                                className="alloy-os-currentwork__tour-menu-item alloy-os-process__activity-item"
                                            >
                                                <span className="alloy-os-currentwork__recent-activity-label">
                                                    {a.label}
                                                </span>
                                                <span className="alloy-os-currentwork__recent-activity-when">
                                                    {a.when}
                                                </span>
                                            </DropdownMenuItem>
                                        ))}
                                        {/* The canonical Activity mode stays reachable — the menu is a
                                            convenience over the same truth, never a replacement for it. */}
                                        <DropdownMenuItem
                                            className="alloy-os-currentwork__tour-menu-item alloy-os-process__activity-all"
                                            onSelect={() => onViewAllActivity?.()}
                                        >
                                            View all activity →
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <span className={clsx("alloy-os-process__anchor")} data-current-stage={current?.label} />
            </UniversalCard>
        </div>
    );
}

/** The card is orientation plus current work; activity supports, never dominates. */
