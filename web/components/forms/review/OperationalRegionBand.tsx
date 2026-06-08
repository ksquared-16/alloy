import clsx from "clsx";
import type { ReactNode } from "react";
import {
    opRegionBand,
    opSectionContentAfterLead,
    opSectionContentAfterTitle,
    opSectionSupport,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    id?: string;
    title: string;
    description?: string;
    className?: string;
    children?: ReactNode;
    "data-testid"?: string;
};

/**
 * Title-led region without card chrome — use inside IntakeCaseFileLayout canvas.
 */
export function OperationalRegionBand({
    id,
    title,
    description,
    className,
    children,
    "data-testid": dataTestId,
}: Props) {
    return (
        <section id={id} className={clsx(opRegionBand, className)} data-testid={dataTestId}>
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
