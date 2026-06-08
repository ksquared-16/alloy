import clsx from "clsx";
import type { ReactNode } from "react";
import {
    opCaseFileSectionShell,
    opCaseFileSectionSurface,
    opCaseFileSectionTint,
    opRegionBand,
    opSectionContentAfterLead,
    opSectionContentAfterTitle,
    opSectionSupport,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

export type CaseFileSectionVariant = "default" | "attention" | "context" | "subtle";

export type CaseFileSectionLayout = "band" | "card";

type Props = {
    id?: string;
    title: string;
    description?: string;
    variant?: CaseFileSectionVariant;
    /** PX-2: `band` = tonal region (default); `card` = legacy bordered shell */
    layout?: CaseFileSectionLayout;
    /** When true, omit outer chrome (for nested groups) */
    unstyled?: boolean;
    className?: string;
    children?: ReactNode;
};

/**
 * Case-file region — band layout by default (PX-2); card layout for legacy paths.
 */
export function CaseFileSection({
    id,
    title,
    description,
    variant = "default",
    layout = "band",
    unstyled = false,
    className,
    children,
}: Props) {
    const useCard = layout === "card" && !unstyled;

    return (
        <section
            id={id}
            className={clsx(
                !unstyled && layout === "band" && opRegionBand,
                !unstyled && layout === "band" && opCaseFileSectionTint[variant],
                useCard && opCaseFileSectionShell,
                useCard && opCaseFileSectionSurface[variant],
                className
            )}
            data-case-file-layout={layout}
        >
            <h2 className={opSectionTitle}>{title}</h2>
            {description ?
                <p className={opSectionSupport}>{description}</p>
            : null}
            {children ?
                <div className={description ? opSectionContentAfterLead : opSectionContentAfterTitle}>
                    {children}
                </div>
            : null}
        </section>
    );
}
