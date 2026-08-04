"use client";

/**
 * Assignments card section chrome — Family request / Proposed / Commercial /
 * Committed / Readiness gaps. Presentational only; observes AssignmentCardModel.
 */

import type { CSSProperties } from "react";
import type { AssignmentCardModel, AssignmentCardSection } from "@/lib/enrollment/buildAssignmentCardModel";

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

const sectionAccent: Record<string, string> = {
    family_request: T.slate,
    proposed_assignment: T.gold,
    commercial_estimate: T.pine,
    committed_assignment: T.forge,
    readiness_gaps: T.ember,
};

type Props = {
    model: AssignmentCardModel;
    /** When set, scopes test ids to a child for multi-child isolation. */
    childId?: string | null;
    childName?: string | null;
    compact?: boolean;
    style?: CSSProperties;
};

function SectionBlock({
    section,
    childId,
    compact,
}: {
    section: AssignmentCardSection;
    childId?: string | null;
    compact?: boolean;
}) {
    const accent = sectionAccent[section.key] ?? T.muted;
    if (section.empty && section.key !== "readiness_gaps") {
        return (
            <div
                data-assignment-section={section.key}
                data-assignment-section-empty="true"
                data-assignment-child={childId ?? undefined}
                style={{
                    borderLeft: `3px solid ${accent}`,
                    padding: compact ? "6px 10px" : "8px 12px",
                    background: T.stone,
                    borderRadius: 6,
                }}
            >
                <div style={{ fontSize: 11, fontWeight: 650, color: accent, letterSpacing: 0.02 }}>
                    {section.title}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                    {section.key === "family_request"
                        ? "No family request recorded yet"
                        : section.key === "proposed_assignment"
                          ? "No proposed assignment yet"
                          : section.key === "commercial_estimate"
                            ? "No estimate generated"
                            : "No committed assignment yet"}
                </div>
            </div>
        );
    }

    if (section.key === "readiness_gaps") {
        if (section.gaps.length === 0) {
            return (
                <div
                    data-assignment-section="readiness_gaps"
                    data-assignment-ready="true"
                    data-assignment-child={childId ?? undefined}
                    style={{
                        borderLeft: `3px solid ${T.pine}`,
                        padding: compact ? "6px 10px" : "8px 12px",
                        background: "rgba(0,162,131,0.06)",
                        borderRadius: 6,
                    }}
                >
                    <div style={{ fontSize: 11, fontWeight: 650, color: T.pine }}>Readiness</div>
                    <div style={{ fontSize: 12.5, color: T.forge, marginTop: 2 }}>Ready for configured Enrollment outcomes</div>
                </div>
            );
        }
        return (
            <div
                data-assignment-section="readiness_gaps"
                data-assignment-ready="false"
                data-assignment-gap-count={section.gaps.length}
                data-assignment-child={childId ?? undefined}
                style={{
                    borderLeft: `3px solid ${T.ember}`,
                    padding: compact ? "6px 10px" : "8px 12px",
                    background: "rgba(180,83,42,0.06)",
                    borderRadius: 6,
                }}
            >
                <div style={{ fontSize: 11, fontWeight: 650, color: T.ember }}>{section.title}</div>
                <ul style={{ margin: "6px 0 0", padding: "0 0 0 16px", display: "grid", gap: 4 }}>
                    {section.gaps.map((gap) => (
                        <li
                            key={gap.factor}
                            data-assignment-gap={gap.factor}
                            style={{ fontSize: 12.5, color: T.forge }}
                        >
                            {gap.label}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <div
            data-assignment-section={section.key}
            data-assignment-section-empty="false"
            data-assignment-child={childId ?? undefined}
            style={{
                borderLeft: `3px solid ${accent}`,
                padding: compact ? "6px 10px" : "8px 12px",
                background: "#fff",
                border: `1px solid ${T.border}`,
                borderLeftWidth: 3,
                borderLeftColor: accent,
                borderRadius: 6,
            }}
        >
            <div style={{ fontSize: 11, fontWeight: 650, color: accent, marginBottom: 6 }}>{section.title}</div>
            <dl style={{ margin: 0, display: "grid", gap: 4 }}>
                {section.fields.map((f) => (
                    <div
                        key={f.key}
                        data-assignment-field={f.key}
                        data-assignment-field-present={f.present ? "true" : "false"}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(100px, 38%) 1fr",
                            gap: 8,
                            fontSize: 12.5,
                        }}
                    >
                        <dt style={{ color: T.muted, fontWeight: 500 }}>{f.label}</dt>
                        <dd style={{ margin: 0, color: f.present ? T.forge : T.muted, fontWeight: f.present ? 550 : 400 }}>
                            {f.present ? f.value : "—"}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

export default function AssignmentCardSections({ model, childId, childName, compact, style }: Props) {
    return (
        <div
            data-assignment-card-sections="true"
            data-assignment-child={childId ?? undefined}
            data-assignment-ready={model.readinessReady ? "true" : "false"}
            style={{ display: "grid", gap: compact ? 6 : 8, ...style }}
        >
            {childName ? (
                <div
                    data-assignment-child-label="true"
                    style={{ fontSize: 12, fontWeight: 650, color: T.forge }}
                >
                    {childName}
                </div>
            ) : null}
            {!compact && model.summaryLine ? (
                <p
                    data-assignment-summary-line="true"
                    style={{ margin: 0, fontSize: 12.5, color: T.slate }}
                >
                    {model.summaryLine}
                </p>
            ) : null}
            {model.sections.map((section) => (
                <SectionBlock key={section.key} section={section} childId={childId} compact={compact} />
            ))}
        </div>
    );
}
