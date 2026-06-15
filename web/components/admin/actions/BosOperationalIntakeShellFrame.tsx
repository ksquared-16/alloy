"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
    BOS_OPERATIONAL_INTAKE_SHELL_STROKE,
    BOS_SHELL_OUTER_HAZE_STYLE,
    buildOperationalIntakeShellPath,
} from "@/lib/bos/bosOperationalIntakeShellPath";

type Props = {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** Dev-only — rectangular rounded panel for before/after comparisons. */
    variant?: "locked" | "legacy-rect";
};

/**
 * Production Operational Intake perimeter — SVG stadium + restrained top swell.
 * Interior children stay rectangular; no clip-path on inner columns or cards.
 */
export function BosOperationalIntakeShellFrame({
    children,
    className = "",
    style,
    variant = "locked",
}: Props) {
    const measureRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 1200, height: 760 });

    useLayoutEffect(() => {
        const node = measureRef.current;
        if (!node || variant !== "locked") return;

        const measure = () => {
            const rect = node.getBoundingClientRect();
            if (rect.width > 1 && rect.height > 1) {
                setSize({ width: rect.width, height: rect.height });
            }
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        window.addEventListener("resize", measure);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [variant]);

    const shellPath = useMemo(
        () => buildOperationalIntakeShellPath(size.width, size.height),
        [size.width, size.height],
    );

    if (variant === "legacy-rect") {
        return (
            <div
                ref={measureRef}
                className={`relative flex min-h-0 flex-col overflow-hidden bg-white ${className}`.trim()}
                style={style}
                data-bos-operational-intake-shell="legacy-rect"
            >
                {children}
            </div>
        );
    }

    return (
        <div
            ref={measureRef}
            className="relative h-full w-full min-h-0"
            data-bos-operational-intake-shell="locked"
        >
            <div
                className="pointer-events-none absolute -inset-3 -z-10"
                style={BOS_SHELL_OUTER_HAZE_STYLE}
                aria-hidden
                data-bos-shell-outer-haze="true"
            />

            <svg
                className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                width={size.width}
                height={size.height}
                viewBox={`0 0 ${size.width} ${size.height}`}
                preserveAspectRatio="none"
                aria-hidden
            >
                <path
                    d={shellPath}
                    fill="none"
                    stroke={BOS_OPERATIONAL_INTAKE_SHELL_STROKE}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>

            <div
                className={`relative z-10 flex min-h-0 flex-col overflow-hidden bg-white ${className}`.trim()}
                style={{
                    ...style,
                    clipPath: shellPath ? `path('${shellPath}')` : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
}
