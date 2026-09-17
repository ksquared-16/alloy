import clsx from "clsx";
import type { ReactNode } from "react";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import {
    opRegionBand,
    opSectionContentAfterLead,
    opSectionSupport,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    title: string;
    /**
     * The one-sentence explanation under the heading.
     *
     * Optional because a region whose own control already carries the sentence should not print it
     * twice — the Packet direct-send region did exactly that, a three-clause lead followed by the
     * same statement beside the Send button.
     */
    lead?: string;
    viewAllHref?: string;
    viewAllLabel?: string;
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
};

/** Operational lane on the intake workspace hub (OW-2). */
export function IntakeWorkspaceRegion({
    title,
    lead,
    viewAllHref,
    viewAllLabel = "View all",
    children,
    className,
    "data-testid": dataTestId,
}: Props) {
    return (
        <section className={clsx(opRegionBand, className)} data-testid={dataTestId}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className={opSectionTitle}>{title}</h2>
                    {lead ? <p className={opSectionSupport}>{lead}</p> : null}
                </div>
                {viewAllHref ?
                    <FormsOperationalLink href={viewAllHref} className="shrink-0">
                        {viewAllLabel}
                    </FormsOperationalLink>
                :   null}
            </div>
            <div className={opSectionContentAfterLead}>{children}</div>
        </section>
    );
}
