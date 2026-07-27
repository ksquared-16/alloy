"use client";

/**
 * Reusable Assignment Timeline V1 — chronological commitments for one weekday.
 * Consumed by Assignment Detail; safe to embed later in Household / Workspace / Staff.
 */

import type { AssignmentTimelineModel } from "@/lib/operationalAssignments/assignmentTimeline";

const T = {
    pine: "#00A283",
    forge: "#273F52",
    muted: "#59678b",
    slate: "#4b5563",
    stone: "#F4F6F9",
    border: "#e5e9ef",
    gold: "#d0ad50",
    mid40: "rgba(39,63,82,.40)",
};

const TONE_BG: Record<string, string> = {
    neutral: "rgba(89,103,139,.10)",
    info: "rgba(0,69,140,.10)",
    success: "rgba(0,162,131,.10)",
    warning: "rgba(208,173,80,.14)",
    accent: "rgba(0,162,131,.14)",
};

export default function AssignmentTimeline({
    model,
    onSelectAssignment,
    selectedAssignmentId,
}: {
    model: AssignmentTimelineModel;
    onSelectAssignment?: (assignmentId: string) => void;
    selectedAssignmentId?: string | null;
}) {
    return (
        <div data-assignment-timeline="true" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        color: T.mid40,
                    }}
                >
                    Timeline · {model.weekdayLabel}
                </span>
                <span style={{ fontSize: 11, color: T.muted }}>{model.summary}</span>
            </div>

            {model.segments.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>
                    Nothing assigned on this day.
                </p>
            ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
                    {model.segments.map((seg, idx) => {
                        const selected = selectedAssignmentId === seg.assignmentId;
                        const clickable = Boolean(onSelectAssignment);
                        return (
                            <li key={seg.assignmentId} data-timeline-segment={seg.assignmentId}>
                                {idx > 0 ? (
                                    <div
                                        aria-hidden
                                        data-timeline-connector={
                                            seg.overlapsPrevious
                                                ? "overlap"
                                                : seg.gapAfterPreviousMinutes != null
                                                  ? "gap"
                                                  : "adjacent"
                                        }
                                        style={{
                                            marginLeft: 18,
                                            height: seg.gapAfterPreviousMinutes != null ? 18 : 12,
                                            borderLeft: `2px ${
                                                seg.overlapsPrevious
                                                    ? "solid"
                                                    : seg.gapAfterPreviousMinutes != null
                                                      ? "dashed"
                                                      : "solid"
                                            } ${seg.overlapsPrevious ? T.gold : T.border}`,
                                        }}
                                    />
                                ) : null}
                                <button
                                    type="button"
                                    disabled={!clickable}
                                    onClick={() => onSelectAssignment?.(seg.assignmentId)}
                                    style={{
                                        all: "unset",
                                        display: "grid",
                                        gridTemplateColumns: "56px 1fr",
                                        gap: 10,
                                        alignItems: "start",
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: selected
                                            ? TONE_BG.success
                                            : seg.isFuture
                                              ? "#fff"
                                              : T.stone,
                                        border: selected
                                            ? "1px solid rgba(0,162,131,.35)"
                                            : seg.isFuture
                                              ? `1px dashed ${T.border}`
                                              : `1px solid ${T.border}`,
                                        cursor: clickable ? "pointer" : "default",
                                        opacity: seg.isFuture && !selected ? 0.85 : 1,
                                    }}
                                >
                                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: T.forge }}>
                                            {seg.startLabel ?? "—"}
                                        </div>
                                        {seg.endLabel ? (
                                            <div style={{ fontSize: 10.5, color: T.muted }}>{seg.endLabel}</div>
                                        ) : null}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: T.forge }}>
                                                {seg.label}
                                            </span>
                                            {seg.isPrimary ? (
                                                <span
                                                    data-primary-badge="true"
                                                    style={{
                                                        fontSize: 9,
                                                        fontWeight: 700,
                                                        letterSpacing: ".04em",
                                                        textTransform: "uppercase",
                                                        color: T.pine,
                                                        background: "rgba(0,162,131,.12)",
                                                        padding: "2px 6px",
                                                        borderRadius: 999,
                                                    }}
                                                >
                                                    Primary
                                                </span>
                                            ) : null}
                                        </div>
                                        <div style={{ marginTop: 2, fontSize: 11.5, color: T.slate }}>
                                            {[seg.roomName, seg.patternLabel].filter(Boolean).join(" · ") || "—"}
                                        </div>
                                        {seg.note ? (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: 10.5,
                                                    color: seg.overlapsPrevious ? "#9a6700" : T.muted,
                                                    fontStyle: "italic",
                                                }}
                                            >
                                                {seg.note}
                                            </div>
                                        ) : null}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
