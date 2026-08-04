"use client";

/**
 * Assignments card — collection of independent service offers (proposed / committed /
 * interested) with per-entry readiness. Presentational only.
 */

import { useState, type CSSProperties } from "react";
import type {
    AssignmentCardEntry,
    AssignmentCardField,
    AssignmentCardModel,
} from "@/lib/enrollment/buildAssignmentCardModel";

const T = {
    forge: "#273F52",
    slate: "#4b5563",
    muted: "#59678b",
    pine: "#00A283",
    ember: "#b4532a",
    gold: "#d0ad50",
    border: "#e5e9ef",
    stone: "#F4F6F9",
};

type Props = {
    model: AssignmentCardModel;
    childId?: string | null;
    childName?: string | null;
    compact?: boolean;
    style?: CSSProperties;
    onContinueSetup?: (entryId: string) => void;
    onBuildOffer?: (entryId: string) => void;
};

function OfferRow({
    field,
    childId,
    compact,
}: {
    field: AssignmentCardField;
    childId?: string | null;
    compact?: boolean;
}) {
    const display = field.missing
        ? field.required
            ? "Required"
            : "—"
        : field.present
          ? field.value
          : field.required
            ? "Required"
            : "Optional";
    const tone = field.missing
        ? T.ember
        : field.present
          ? T.forge
          : T.muted;

    return (
        <div
            data-assignment-field={field.key}
            data-assignment-field-missing={field.missing ? "true" : "false"}
            data-assignment-field-required={field.required ? "true" : "false"}
            data-assignment-child={childId ?? undefined}
            style={{
                display: "grid",
                gridTemplateColumns: compact ? "96px 1fr" : "120px 1fr",
                gap: 8,
                alignItems: "baseline",
                padding: "4px 0",
            }}
        >
            <div style={{ fontSize: 11.5, fontWeight: 600, color: T.slate }}>{field.label}</div>
            <div style={{ fontSize: 13, color: tone, fontWeight: field.missing ? 650 : 500 }}>
                {display}
            </div>
        </div>
    );
}

function stateTone(state: AssignmentCardEntry["state"]): string {
    if (state === "committed") return T.forge;
    if (state === "proposed") return T.gold;
    return T.muted;
}

function EntryCard({
    entry,
    childId,
    compact,
    defaultExpanded,
    onContinueSetup,
    onBuildOffer,
}: {
    entry: AssignmentCardEntry;
    childId?: string | null;
    compact?: boolean;
    defaultExpanded: boolean;
    onContinueSetup?: (entryId: string) => void;
    onBuildOffer?: (entryId: string) => void;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const collapsedBits = [
        entry.siteSummary,
        entry.scheduleSummary,
        entry.startDate ? `Starts ${entry.startDate}` : null,
        entry.estimatedTuition,
    ].filter(Boolean);

    return (
        <div
            data-assignment-entry="true"
            data-assignment-entry-id={entry.id}
            data-assignment-entry-state={entry.state}
            data-assignment-entry-ready={entry.readinessReady ? "true" : "false"}
            data-assignment-child={childId ?? undefined}
            style={{
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: compact ? "8px 10px" : "10px 12px",
                background: "#fff",
                display: "grid",
                gap: 8,
            }}
        >
            <button
                type="button"
                data-assignment-entry-toggle="true"
                onClick={() => setExpanded((v) => !v)}
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "baseline",
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                }}
            >
                <div>
                    <div style={{ fontSize: 14, fontWeight: 650, color: T.forge }}>{entry.title}</div>
                    <div style={{ fontSize: 12, fontWeight: 650, color: stateTone(entry.state), marginTop: 2 }}>
                        {entry.stateLabel}
                    </div>
                    {!expanded && collapsedBits.length > 0 ? (
                        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                            {collapsedBits.join(" · ")}
                        </div>
                    ) : null}
                </div>
                <div style={{ fontSize: 11, color: T.muted }}>{expanded ? "Hide" : "Details"}</div>
            </button>

            {expanded && !entry.interestOnly ? (
                <div data-assignment-offer-fields="true">
                    {entry.fields.map((f) => (
                        <OfferRow key={f.key} field={f} childId={childId} compact={compact} />
                    ))}
                </div>
            ) : null}

            {entry.state === "proposed" ? (
                <div
                    data-assignment-readiness-summary="true"
                    data-assignment-entry-readiness={entry.id}
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: entry.readinessReady ? T.pine : T.ember,
                    }}
                >
                    {entry.readinessSummary}
                </div>
            ) : null}

            {entry.state === "proposed" && !entry.readinessReady && onContinueSetup ? (
                <button
                    type="button"
                    data-assignment-continue-setup={entry.id}
                    onClick={() => onContinueSetup(entry.id)}
                    style={{
                        justifySelf: "start",
                        fontSize: 12,
                        fontWeight: 650,
                        color: T.pine,
                        background: "transparent",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                    }}
                >
                    Continue setup
                </button>
            ) : null}

            {entry.interestOnly && onBuildOffer ? (
                <button
                    type="button"
                    data-assignment-build-offer={entry.id}
                    onClick={() => onBuildOffer(entry.id)}
                    style={{
                        justifySelf: "start",
                        fontSize: 12,
                        fontWeight: 650,
                        color: T.pine,
                        background: "transparent",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                    }}
                >
                    Build offer
                </button>
            ) : null}
        </div>
    );
}

export default function AssignmentCardSections({
    model,
    childId,
    childName,
    compact,
    style,
    onContinueSetup,
    onBuildOffer,
}: Props) {
    return (
        <div
            data-assignment-card-sections="true"
            data-assignment-offer="true"
            data-assignment-collection="true"
            data-assignment-entry-count={String(model.entries.length)}
            data-assignment-state={model.state}
            data-assignment-ready={model.readinessReady ? "true" : "false"}
            data-assignment-child={childId ?? undefined}
            style={{ display: "grid", gap: compact ? 8 : 10, ...style }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: 0.06,
                            textTransform: "uppercase",
                            color: T.muted,
                        }}
                    >
                        Assignments
                    </div>
                    {childName ? (
                        <div style={{ fontSize: 14, fontWeight: 650, color: T.forge, marginTop: 2 }}>
                            {childName}
                        </div>
                    ) : null}
                </div>
                <div
                    data-assignment-state-label="true"
                    style={{
                        fontSize: 12,
                        fontWeight: 650,
                        color: model.state === "committed" ? T.forge : model.state === "proposed" ? T.gold : T.muted,
                    }}
                >
                    {model.summaryLine}
                </div>
            </div>

            {model.enrollmentStartDate ? (
                <div
                    data-assignment-enrollment-start="true"
                    style={{ fontSize: 12, color: T.slate }}
                >
                    Enrollment Start · {formatDisplay(model.enrollmentStartDate)}
                </div>
            ) : null}

            {model.entries.length === 0 ? (
                <div
                    data-assignment-empty="true"
                    style={{
                        fontSize: 12.5,
                        color: T.muted,
                        padding: "8px 0",
                    }}
                >
                    No assignments yet. Add a service offer for this child.
                </div>
            ) : (
                model.entries.map((entry, index) => (
                    <EntryCard
                        key={entry.id}
                        entry={entry}
                        childId={childId}
                        compact={compact}
                        defaultExpanded={model.entries.length === 1 || index === 0}
                        onContinueSetup={onContinueSetup}
                        onBuildOffer={onBuildOffer}
                    />
                ))
            )}

            <div
                data-assignment-readiness-summary="true"
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: model.readinessReady ? T.pine : T.ember,
                }}
            >
                {model.readinessSummary}
            </div>
        </div>
    );
}

function formatDisplay(ymd: string): string {
    try {
        const d = new Date(`${ymd}T12:00:00`);
        if (Number.isNaN(d.getTime())) return ymd;
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return ymd;
    }
}
