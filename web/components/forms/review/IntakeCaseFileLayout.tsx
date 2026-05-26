import clsx from "clsx";
import type { ReactNode } from "react";
import {
    opCaseFileCanvas,
    opCaseFileCanvasCompact,
    opRegionSeparator,
    opStackPage,
    opStackRegionCompact,
} from "@/lib/operational/ui/operationalVisualTokens";

export type IntakeCaseFileLayoutProps = {
    compact?: boolean;
    header: ReactNode;
    intakeContext: ReactNode;
    bosSummary: ReactNode;
    whatChanged?: ReactNode | null;
    needsAttention?: ReactNode | null;
    submittedForms: ReactNode;
    documents: ReactNode;
    reviewActions?: ReactNode | null;
    technical?: ReactNode | null;
    after?: ReactNode | null;
};

type RegionSlot = { key: string; node: ReactNode | null | undefined };

function CaseFileRegion({ slot, separated }: { slot: RegionSlot; separated: boolean }) {
    if (slot.node == null) return null;
    return (
        <div
            key={slot.key}
            className={clsx(separated && opRegionSeparator)}
            data-case-file-region={slot.key}
        >
            {slot.node}
        </div>
    );
}

/**
 * Enforces UX-D case-file region order with PX-2 canvas + region rhythm.
 */
export function IntakeCaseFileLayout({
    compact = false,
    header,
    intakeContext,
    bosSummary,
    whatChanged,
    needsAttention,
    submittedForms,
    documents,
    reviewActions,
    technical,
    after,
}: IntakeCaseFileLayoutProps) {
    const slots: RegionSlot[] = [
        { key: "header", node: header },
        { key: "intake-context", node: intakeContext },
        { key: "bos-summary", node: bosSummary },
        { key: "what-changed", node: whatChanged },
        { key: "needs-attention", node: needsAttention },
        { key: "submitted-forms", node: submittedForms },
        { key: "documents", node: documents },
        { key: "review-actions", node: reviewActions },
        { key: "technical", node: technical },
        { key: "after", node: after },
    ];

    let seen = 0;

    return (
        <div
            className={clsx(
                compact ? opCaseFileCanvasCompact : opCaseFileCanvas,
                compact && "text-[13px]"
            )}
            data-testid="intake-case-file-layout"
            data-case-file-canvas={compact ? "compact" : "page"}
        >
            <div className={compact ? opStackRegionCompact : opStackPage}>
                {slots.map((slot) => {
                    if (slot.node == null) return null;
                    const separated = seen > 0;
                    seen += 1;
                    return <CaseFileRegion key={slot.key} slot={slot} separated={separated} />;
                })}
            </div>
        </div>
    );
}
