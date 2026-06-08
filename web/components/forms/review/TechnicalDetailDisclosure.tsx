"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    opDisclosureInner,
    opMetadata,
    opTechnicalBlockSubtitle,
    opTechnicalBlockTitle,
    opTechnicalMono,
    opTechnicalJsonSurface,
    opTechnicalSummary,
    opTechnicalSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

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
            className={clsx(opTechnicalSurface, className)}
            open={controlled ? open : undefined}
            onToggle={
                controlled && onOpenChange ?
                    (e) => onOpenChange(e.currentTarget.open)
                :   undefined
            }
            data-testid={dataTestId ?? "forms-technical-detail-disclosure"}
        >
            <summary className={opTechnicalSummary}>{title}</summary>
            {helperText ?
                <p className={clsx("mt-1.5", opMetadata)}>{helperText}</p>
            : null}
            <div className={opDisclosureInner}>{children}</div>
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
        <div className={opTechnicalJsonSurface}>
            <p className={opTechnicalBlockTitle}>{title}</p>
            {subtitle ?
                <p className={opTechnicalBlockSubtitle}>{subtitle}</p>
            : null}
            <pre className={opTechnicalMono}>{JSON.stringify(value ?? {}, null, 2)}</pre>
        </div>
    );
}
