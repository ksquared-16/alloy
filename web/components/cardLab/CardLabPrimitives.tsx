"use client";

import type { ReactNode } from "react";

/**
 * Shared body primitives for the five specified cards.
 *
 * Deliberately thin: the platform's `UniversalCard` owns the shell, the header, the insight, the
 * status chip and the footer. These are only the small body idioms the five cards share —
 * a labelled group, a fact row, an absent/held note, and a handoff button.
 */

export function LabGroup({ title, count, children }: { title: string; count?: number | null; children: ReactNode }) {
    return (
        <section className="alloy-os-household__group" data-card-lab-group={title}>
            <div className="alloy-os-household__group-header">
                <span className="alloy-os-household__group-title">{title}</span>
                {count != null ? <span className="alloy-os-household__group-count">{count}</span> : null}
            </div>
            {children}
        </section>
    );
}

export function LabRow({
    name,
    detail,
    status,
    tone = "neutral",
}: {
    name: ReactNode;
    detail?: ReactNode;
    status?: ReactNode;
    tone?: "neutral" | "critical" | "muted";
}) {
    return (
        <div className="alloy-os-household__row" data-card-lab-row="true" data-tone={tone}>
            <div className="alloy-os-household__row-main">
                <span
                    className="alloy-os-household__row-name"
                    style={tone === "critical" ? { fontWeight: 700 } : undefined}
                >
                    {name}
                </span>
                {detail != null ? (
                    <span className="alloy-os-household__row-detail">{detail}</span>
                ) : null}
            </div>
            {status != null ? <span className="alloy-os-household__row-status">{status}</span> : null}
        </div>
    );
}

/**
 * The treatment for a fact with NO OWNER in the platform, and for a projection that has not
 * answered. It is a review affordance — production cards render nothing at all in these cases.
 * Showing it here is how the Director can see WHERE the honest silences fall.
 */
export function LabAbsent({ kind, children }: { kind: "absent" | "held" | "unresolved"; children: ReactNode }) {
    const palette = {
        absent: { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", tag: "NO OWNER" },
        held: { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", tag: "HELD" },
        unresolved: { bg: "#f8fafc", border: "#e2e8f0", fg: "#475569", tag: "UNRESOLVED" },
    }[kind];
    return (
        <p
            data-card-lab-absent={kind}
            style={{
                margin: "6px 0 0",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px dashed ${palette.border}`,
                background: palette.bg,
                color: palette.fg,
                fontSize: 10.5,
                lineHeight: 1.45,
            }}
        >
            <strong style={{ letterSpacing: 0.4 }}>{palette.tag}</strong> · {children}
        </p>
    );
}

export function LabHandoff({ label, to, disabled, reason }: { label: string; to: string; disabled?: boolean; reason?: string | null }) {
    return (
        <button
            type="button"
            disabled={disabled}
            title={disabled && reason ? reason : `Hands off to: ${to}`}
            data-card-lab-handoff={to}
            data-card-lab-disabled={disabled ? "true" : undefined}
            style={{
                appearance: "none",
                border: "1px solid var(--alloy-os-border, #e5e7eb)",
                borderRadius: 8,
                background: disabled ? "#f8fafc" : "#fff",
                color: disabled ? "#94a3b8" : "#0f172a",
                fontSize: 11.5,
                fontWeight: 600,
                padding: "5px 10px",
                cursor: disabled ? "not-allowed" : "pointer",
            }}
        >
            {label}
        </button>
    );
}

export function LabFooter({ children }: { children: ReactNode }) {
    return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>;
}
