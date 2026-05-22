"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import { formsCaseFileMetaText } from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    title?: string;
    helperText?: string;
    /** Controlled open state (optional; default uncontrolled collapsed) */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
    "data-testid"?: string;
    children: ReactNode;
};

const SUMMARY_CLASS =
    "cursor-pointer list-none text-xs font-semibold text-alloy-midnight/70 marker:text-alloy-midnight/40 [&::-webkit-details-marker]:text-alloy-midnight/40";

/**
 * Progressive disclosure for linkage internals, IDs, JSON, intake debug.
 * Defaults collapsed — must not dominate case-file hierarchy.
 */
export function TechnicalDetailDisclosure({
    title = "Technical details",
    helperText = "Launch metadata, snapshots, and identifiers for support — not required for routine review.",
    open,
    onOpenChange,
    className,
    "data-testid": dataTestId,
    children,
}: Props) {
    const controlled = open !== undefined;

    return (
        <details
            id={FORMS_CASE_FILE_SECTION.technical}
            className={clsx(
                "rounded-lg border border-admin-border bg-alloy-stone/20 px-3 py-2",
                className
            )}
            open={controlled ? open : undefined}
            onToggle={
                controlled && onOpenChange ?
                    (e) => onOpenChange(e.currentTarget.open)
                :   undefined
            }
            data-testid={dataTestId ?? "forms-technical-detail-disclosure"}
        >
            <summary className={SUMMARY_CLASS}>{title}</summary>
            {helperText ?
                <p className={clsx("mt-1.5", formsCaseFileMetaText)}>{helperText}</p>
            : null}
            <div className="mt-3 space-y-3 border-t border-admin-border/80 pt-3">{children}</div>
        </details>
    );
}

type JsonBlockProps = {
    title: string;
    subtitle?: string;
    value: unknown;
};

/** JSON block intended inside TechnicalDetailDisclosure only. */
export function TechnicalDetailJsonBlock({ title, subtitle, value }: JsonBlockProps) {
    return (
        <div className="rounded-md border border-admin-border bg-white/80 p-3">
            <p className="text-xs font-medium text-alloy-midnight">{title}</p>
            {subtitle ?
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/60">{subtitle}</p>
            : null}
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-alloy-midnight/85">
                {JSON.stringify(value ?? {}, null, 2)}
            </pre>
        </div>
    );
}
