import clsx from "clsx";
import type { ReactNode } from "react";
import {
    formsCaseFileRegionDescription,
    formsCaseFileRegionTitle,
} from "@/lib/forms/review/formsReviewClassTokens";

export type CaseFileSectionVariant = "default" | "attention" | "context" | "subtle";

const VARIANT_SURFACE: Record<CaseFileSectionVariant, string> = {
    default: "border-admin-border bg-white",
    attention: "border-alloy-ember/30 bg-alloy-ember/8",
    context: "border-alloy-blue/25 bg-alloy-blue/5",
    subtle: "border-admin-border bg-alloy-stone/15",
};

type Props = {
    id?: string;
    title: string;
    description?: string;
    variant?: CaseFileSectionVariant;
    /** When true, omit outer border (for nested groups) */
    unstyled?: boolean;
    className?: string;
    children?: ReactNode;
};

/**
 * Case-file region shell — consistent title, spacing, and surface tone.
 * Use for Needs attention, Submitted forms, Documents, etc. (UX-D will reorder).
 */
export function CaseFileSection({
    id,
    title,
    description,
    variant = "default",
    unstyled = false,
    className,
    children,
}: Props) {
    return (
        <section
            id={id}
            className={clsx(
                !unstyled && "rounded-lg border px-4 py-3",
                !unstyled && VARIANT_SURFACE[variant],
                className
            )}
        >
            <h2 className={formsCaseFileRegionTitle}>{title}</h2>
            {description ?
                <p className={formsCaseFileRegionDescription}>{description}</p>
            : null}
            {children ?
                <div className={description ? "mt-3" : "mt-2"}>{children}</div>
            : null}
        </section>
    );
}
