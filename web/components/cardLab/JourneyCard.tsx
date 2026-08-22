"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { LabAbsent, LabFooter, LabHandoff } from "@/components/cardLab/CardLabPrimitives";
import type { JourneyCardEvidence, JourneyStage } from "@/lib/cardLab/journeyCardEvidence";

/**
 * Journey card — the stage rail, ordered by the GOVERNING business-process revision.
 *
 * The rail is the whole design. A stage row states its position, its anchored facts, and its
 * outcome. Everything else — the work, the free activity — is a handoff, because
 * `current_work` owns work completion and `timeline` owns activity.
 *
 * Two renderings exist only because the platform's honesty limits demand them:
 *   - a `skipped` status derived from "passed with no anchored fact" is labelled INFERRED
 *   - a past stage shows NO entry date, because none was ever stored (GAP-4)
 */

const STATUS_MARK: Record<JourneyStage["status"], { glyph: string; color: string; weight: number }> = {
    completed: { glyph: "✓", color: "#16a34a", weight: 700 },
    current: { glyph: "●", color: "#2563eb", weight: 700 },
    future: { glyph: "○", color: "#cbd5e1", weight: 400 },
    skipped: { glyph: "—", color: "#f59e0b", weight: 600 },
    reopened: { glyph: "↺", color: "#7c3aed", weight: 700 },
};

function formatWhen(at: string | null): string | null {
    if (!at) return null;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function JourneyCard({
    evidence,
    expanded = false,
}: {
    evidence: JourneyCardEvidence;
    expanded?: boolean;
}) {
    // A provider-unavailable / unresolved card renders NOTHING to operators in production.
    // The lab shows the hold explicitly so the Director can see where it falls.
    if (evidence.resolution === "unresolved") {
        return (
            <UniversalCard title="Journey" insight="" tier="context" archetype="timeline" iconName="route" density="compact">
                <LabAbsent kind="unresolved">
                    No governing business-process revision resolved. The card HOLDS — it must not
                    conclude &ldquo;no journey&rdquo;. In production it occupies no slot.
                </LabAbsent>
            </UniversalCard>
        );
    }

    /*
     * SUMMARY DENSITY. The Focus Panel holds several cards at once, so the card face shows a
     * WINDOW on the rail — the current stage, at most two stages behind it, and the one ahead —
     * and collapses anything earlier into a count. The full rail is the expanded view. A five-stage
     * process barely notices; a twelve-stage one would otherwise dominate the panel.
     */
    const SUMMARY_LOOKBACK = 2;
    const currentIdx = evidence.currentStageIndex != null ? evidence.currentStageIndex - 1 : 0;
    const windowStart = expanded ? 0 : Math.max(0, currentIdx - SUMMARY_LOOKBACK);
    const windowEnd = expanded ? evidence.stages.length : Math.min(evidence.stages.length, currentIdx + 2);
    const visible = evidence.stages.slice(windowStart, windowEnd);
    const earlierCount = windowStart;

    return (
        <UniversalCard
            title="Journey"
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            tier="context"
            archetype="timeline"
            iconName="route"
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={expanded ? "expanded" : "compact"}
            data-universal-card-key="process_journey"
            footerAction={
                <LabFooter>
                    {evidence.openWorkCount > 0 ? (
                        <LabHandoff
                            label={`${evidence.openWorkCount} open item${evidence.openWorkCount === 1 ? "" : "s"}`}
                            to="current_work"
                        />
                    ) : null}
                    <LabHandoff label="View journey" to="process_journey (expanded)" />
                </LabFooter>
            }
        >
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }} data-journey-rail="true">
                {earlierCount > 0 ? (
                    <li
                        data-journey-earlier={earlierCount}
                        style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0 2px 20px" }}
                    >
                        +{earlierCount} earlier stage{earlierCount === 1 ? "" : "s"}
                    </li>
                ) : null}
                {visible.map((stage) => {
                    const mark = STATUS_MARK[stage.status];
                    return (
                        <li key={stage.key} data-journey-stage={stage.key} data-journey-status={stage.status}>
                            <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
                                <span
                                    aria-hidden
                                    style={{ color: mark.color, fontWeight: mark.weight, width: 12, textAlign: "center", fontSize: 12 }}
                                >
                                    {mark.glyph}
                                </span>
                                <span
                                    style={{
                                        fontSize: 12.5,
                                        fontWeight: stage.status === "current" ? 700 : 600,
                                        color: stage.status === "future" ? "#94a3b8" : "#0f172a",
                                    }}
                                >
                                    {stage.label}
                                </span>
                                {stage.status === "current" ? (
                                    <span style={{ fontSize: 10, color: "#2563eb", fontWeight: 700, letterSpacing: 0.3 }}>CURRENT</span>
                                ) : null}
                                {stage.enteredAt ? (
                                    <span style={{ fontSize: 10.5, color: "#94a3b8", marginLeft: "auto" }}>
                                        Entered {formatWhen(stage.enteredAt)}
                                    </span>
                                ) : null}
                            </div>

                            {stage.facts.length > 0 ? (
                                <div style={{ paddingLeft: 20, display: "grid", gap: 1 }}>
                                    {(expanded ? stage.facts : stage.facts.slice(0, 2)).map((fact) => (
                                        <div
                                            key={fact.id}
                                            data-journey-fact={fact.typeKey}
                                            style={{ display: "flex", gap: 6, alignItems: "baseline" }}
                                        >
                                            <span style={{ fontSize: 11.5, color: "#334155" }}>{fact.label}</span>
                                            {formatWhen(fact.at) ? (
                                                <span style={{ fontSize: 10.5, color: "#94a3b8" }}>{formatWhen(fact.at)}</span>
                                            ) : null}
                                        </div>
                                    ))}
                                    {!expanded && stage.facts.length > 2 ? (
                                        <span style={{ fontSize: 10.5, color: "#94a3b8" }}>+{stage.facts.length - 2} more</span>
                                    ) : null}
                                </div>
                            ) : null}

                            {stage.outcomeLabel ? (
                                <div style={{ paddingLeft: 20, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                                    Outcome: {stage.outcomeLabel}
                                </div>
                            ) : null}

                            {stage.requirementsTotal != null && stage.requirementsSatisfied != null ? (
                                <div style={{ paddingLeft: 20, fontSize: 11.5, color: "#475569" }}>
                                    {stage.requirementsSatisfied} of {stage.requirementsTotal} required items complete
                                </div>
                            ) : null}

                            {stage.statusIsInferred ? (
                                <div style={{ paddingLeft: 20 }}>
                                    <LabAbsent kind="held">
                                        Status <em>inferred</em>: this stage was passed with no anchored fact. Alloy
                                        stores no stage history (GAP-4), so &ldquo;skipped&rdquo; is a reading, not a
                                        recorded event.
                                    </LabAbsent>
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ol>

            {expanded ? (
                <LabAbsent kind="absent">
                    Past-stage entry dates, waitlist <em>position at entry</em>, and waitlist offer/expiry are
                    rendered nowhere: no store, no ranking snapshot, and no offer entity exist (GAP-4, GAP-7).
                </LabAbsent>
            ) : null}
        </UniversalCard>
    );
}
