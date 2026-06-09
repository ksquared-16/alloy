"use client";

/**
 * BOS signature contour — premium asymmetric intelligence frame.
 * Not a cloud, not a brain. A calm organic crest anchoring BOS surfaces.
 *
 * Usage: frame headers, finding cards, Command Center rail accent.
 */
export function BosContourMark({
    variant = "frame",
    className = "",
    accentGold = false,
}: {
    variant?: "frame" | "crest" | "badge";
    className?: string;
    /** Gold appears only as accent when true — never dominant */
    accentGold?: boolean;
}) {
    if (variant === "badge") {
        return (
            <svg
                viewBox="0 0 32 32"
                className={className}
                aria-hidden
                fill="none"
            >
                <path
                    d="M16 2C22 2 28 6 30 12C31 16 30 22 26 26C22 30 16 31 10 29C4 27 1 21 2 14C3 8 8 3 14 2C15 2 15 2 16 2Z"
                    fill="currentColor"
                    fillOpacity={0.12}
                />
                <path
                    d="M16 6C20 6 24 9 25 13C26 16 25 20 22 22C19 24 15 25 11 23C7 21 5 17 6 13C7 9 11 6 15 6H16Z"
                    stroke="currentColor"
                    strokeWidth={1.25}
                    strokeOpacity={0.55}
                />
                {accentGold ?
                    <circle cx={16} cy={14} r={2} fill="#d0ad50" fillOpacity={0.9} />
                :   <circle cx={16} cy={14} r={2} fill="currentColor" fillOpacity={0.65} />}
            </svg>
        );
    }

    if (variant === "crest") {
        return (
            <svg
                viewBox="0 0 200 48"
                className={className}
                aria-hidden
                preserveAspectRatio="none"
            >
                <path
                    d="M0 40V16C0 8 6 2 14 2H120C132 2 142 0 152 8C162 16 172 12 180 6C188 0 200 4 200 14V40C200 44 196 48 192 48H8C4 48 0 44 0 40Z"
                    fill="currentColor"
                    fillOpacity={0.08}
                />
                <path
                    d="M0 40V16C0 8 6 2 14 2H120C132 2 142 0 152 8C162 16 172 12 180 6C188 0 200 4 200 14"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeOpacity={0.28}
                    fill="none"
                />
                {accentGold ?
                    <path
                        d="M152 8C162 16 172 12 180 6"
                        stroke="#d0ad50"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        fill="none"
                    />
                :   null}
            </svg>
        );
    }

    return (
        <svg
            viewBox="0 0 400 280"
            className={className}
            aria-hidden
            preserveAspectRatio="none"
        >
            <path
                d="M16 0H360C376 0 388 12 388 28V252C388 268 376 280 360 280H40C24 280 12 268 12 252V72C12 56 0 48 0 32C0 18 8 6 22 2C30 0 38 0 46 4C54 8 58 16 54 24C50 32 40 36 32 32C24 28 20 20 24 12C28 4 36 0 44 0H16Z"
                fill="currentColor"
                fillOpacity={0.05}
            />
            <path
                d="M16 0H360C376 0 388 12 388 28V252C388 268 376 280 360 280H40C24 280 12 268 12 252V72C12 56 0 48 0 32C0 18 8 6 22 2C30 0 38 0 46 4C54 8 58 16 54 24C50 32 40 36 32 32C24 28 20 20 24 12C28 4 36 0 44 0"
                stroke="currentColor"
                strokeWidth={1.25}
                strokeOpacity={0.22}
                fill="none"
            />
            {accentGold ?
                <circle cx={22} cy={18} r={3} fill="#d0ad50" fillOpacity={0.75} />
            :   null}
        </svg>
    );
}
