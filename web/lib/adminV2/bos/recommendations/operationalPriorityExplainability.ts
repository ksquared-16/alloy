import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";

export type OperationalPriorityExplainability = {
    chipLabel: string | null;
    /** Screen-reader and hover title — no raw scores or resolver codes. */
    ariaLabel: string | null;
    /** Short supporting line for drawer trust area (optional). */
    compactReason: string | null;
};

function slaBasisPhrase(slaTier: string | null | undefined): string | null {
    const sla = slaTier?.trim().toLowerCase();
    if (sla === "breached") return "response window exceeded";
    if (sla === "approaching") return "first-response window due soon";
    return null;
}

function intakeAgeDaysFromReason(urgencyReason: string): number | null {
    const m = urgencyReason.match(/(\d+)\s+days?\s+since\s+(?:the\s+)?inquiry\s+was\s+created/i);
    if (!m?.[1]) return null;
    const days = Number(m[1]);
    return Number.isFinite(days) && days >= 1 ? days : null;
}

/**
 * Plain-language urgency explanation for operators (no scores, codes, or resolver jargon).
 */
function formatPlainUrgencyExplanation(args: {
    chipLabel: string;
    urgencyReason?: string | null;
    slaTier?: string | null;
    primaryReasonLabel?: string | null;
}): string | null {
    const chip = args.chipLabel.trim();
    const reason = args.urgencyReason?.trim() || "";
    const labelBlob = `${reason} ${args.primaryReasonLabel ?? ""}`.toLowerCase();
    const intakeDays = reason ? intakeAgeDaysFromReason(reason) : null;

    if (intakeDays != null && /response window|stale new|new inquiry|first response/i.test(labelBlob)) {
        return `${chip} because this inquiry has had no first response for ${intakeDays} day${intakeDays === 1 ? "" : "s"}.`;
    }

    if (intakeDays != null) {
        return `${chip} because ${intakeDays} day${intakeDays === 1 ? "" : "s"} since the inquiry was created.`;
    }

    if (/response window exceeded/i.test(reason)) {
        return `${chip} because the first-response window was exceeded.`;
    }

    if (/follow-up|commitment/i.test(labelBlob)) {
        return `${chip} because a follow-up commitment is overdue.`;
    }

    if (/tour/i.test(labelBlob)) {
        return `${chip} because post-tour follow-up is due.`;
    }

    if (reason.length > 0 && reason.length <= 120) {
        return `${chip} — ${reason}`;
    }

    const sla = slaBasisPhrase(args.slaTier);
    if (sla === "response window exceeded") {
        return `${chip} because the first-response window was exceeded.`;
    }
    if (sla === "first-response window due soon") {
        return `${chip} because the first-response window is due soon.`;
    }

    if (args.primaryReasonLabel?.trim()) {
        return `${chip} — ${args.primaryReasonLabel.trim()}`;
    }

    return null;
}

/**
 * User-facing priority explanation from grounded resolver fields only.
 * Does not expose priority_score, resolver version, or internal codes.
 */
export function buildOperationalPriorityExplainability(args: {
    urgencyBand?: UrgencyBandV1 | null;
    chipLabel?: string | null;
    slaTier?: string | null;
    severity?: string | null;
    urgencyReason?: string | null;
    primaryReasonLabel?: string | null;
}): OperationalPriorityExplainability {
    const chipLabel = args.chipLabel?.trim() || null;
    if (!chipLabel) {
        return { chipLabel: null, ariaLabel: null, compactReason: null };
    }

    const plain = formatPlainUrgencyExplanation({
        chipLabel,
        urgencyReason: args.urgencyReason,
        slaTier: args.slaTier,
        primaryReasonLabel: args.primaryReasonLabel,
    });

    const urgencyReason = args.urgencyReason?.trim() || null;
    const slaBasis = slaBasisPhrase(args.slaTier);
    const sev = args.severity?.trim().toLowerCase();

    let compactReason = plain;
    if (!compactReason) {
        compactReason = urgencyReason;
    }
    if (!compactReason && slaBasis) {
        compactReason =
            slaBasis === "response window exceeded"
                ? "Response window exceeded"
                : "First-response window due soon";
    }
    if (!compactReason && (sev === "critical" || sev === "high")) {
        compactReason = "Needs timely staff action";
    }
    if (!compactReason && args.primaryReasonLabel?.trim()) {
        compactReason = args.primaryReasonLabel.trim();
    }

    const ariaLabel = compactReason
        ? `Priority: ${chipLabel} — ${compactReason}`
        : `Priority: ${chipLabel}`;

    return { chipLabel, ariaLabel, compactReason };
}
