"use client";

/**
 * Alloy OS — compressed queue row presenter.
 *
 * Fixed-height four-line, two-column selection card rendered ONLY in split mode.
 * Anatomy (config-ready — see `CompressedQueueRowLayout`):
 *
 *   [avatar col]  line 1 identity ·························  [status pill]
 *                 line 2 primary contact / age·household
 *                 line 3 children·ages / program·room
 *                 line 4 location · work cue ················ [count label]
 *
 * Avatar lives in a fixed 32px column — never overlaps text. Child count is shown as a
 * labeled right-column cue (not an absolute badge over the avatar). Whole row is one button.
 */

export type CompressedQueueRowGrain = "case" | "child" | "candidate";

export type CompressedQueueRowProps = {
    identity: string;
    statusLabel: string | null;
    line2: string | null;
    line3: string | null;
    line4: string | null;
    grain: CompressedQueueRowGrain | null;
    tier: "critical" | "warning" | "standard";
    attention: boolean;
    onOpen: () => void;
};

function grainGlyph(grain: CompressedQueueRowGrain | null): string {
    switch (grain) {
        case "child":
            return "C";
        case "candidate":
            return "W";
        case "case":
        default:
            return "•";
    }
}

function CompressedLine({
    text,
    variant,
    attention,
}: {
    text: string;
    variant: "secondary" | "tertiary" | "quaternary";
    attention?: boolean;
}) {
    return (
        <span className={`adminv2-os-crow__line adminv2-os-crow__line--${variant}`}>
            <span
                className="adminv2-os-crow__meta"
                data-attention={attention ? "true" : undefined}
            >
                {text}
            </span>
        </span>
    );
}

export function CompressedQueueRow({
    identity,
    statusLabel,
    line2,
    line3,
    line4,
    grain,
    tier,
    attention,
    onOpen,
}: CompressedQueueRowProps) {
    const initial = identity.trim().charAt(0).toUpperCase() || grainGlyph(grain);
    const tooltip = [identity, line2, line3, line4].filter(Boolean).join(" · ");

    return (
        <button
            type="button"
            className="adminv2-os-crow"
            data-alloy-os-compressed-row="true"
            data-ws-wu-urgency={tier}
            data-ws-needs-attention={attention ? "true" : undefined}
            onClick={onOpen}
            title={tooltip}
        >
            <span className="adminv2-os-crow__rail" aria-hidden />
            <span
                className="adminv2-os-crow__avatar"
                data-grain={grain ?? "case"}
                aria-hidden
            >
                {initial}
            </span>
            <span className="adminv2-os-crow__main">
                <span className="adminv2-os-crow__line adminv2-os-crow__line--primary">
                    <span className="adminv2-os-crow__identity">{identity}</span>
                </span>
                {line2 ? <CompressedLine text={line2} variant="secondary" /> : null}
                {line3 ? <CompressedLine text={line3} variant="tertiary" /> : null}
                {line4 ? (
                    <CompressedLine text={line4} variant="quaternary" attention={attention} />
                ) : null}
            </span>
            <span className="adminv2-os-crow__right">
                {statusLabel ? (
                    <span className="adminv2-os-crow__status" data-tier={tier}>
                        {statusLabel}
                    </span>
                ) : null}
            </span>
        </button>
    );
}
