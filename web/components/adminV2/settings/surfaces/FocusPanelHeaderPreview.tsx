"use client";

import FocusPanelModeSwitch from "@/components/admin/focusPanel/FocusPanelModeSwitch";
import FocusPanelSubjectIdentityBlock from "@/components/admin/focusPanel/FocusPanelSubjectIdentityBlock";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelContextChip } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import { formatSurfaceHeaderSummaryLine } from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";
import type { SurfaceHeaderSummarySegment } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import { SURFACE_COMPOSER_CANVAS_ATTR } from "@/lib/adminV2/settings/surfaces/surfaceComposer";

type Props = {
    subjectTitle: string;
    identitySegments?: SurfaceHeaderSummarySegment[];
    contextChips?: FocusPanelContextChip[];
    activeMode?: FocusPanelMode;
    onModeChange?: (mode: FocusPanelMode) => void;
    onClickHeader?: () => void;
    selected?: boolean;
};

/** Runtime-shaped Focus Panel header preview for the Surface Composer canvas. */
export default function FocusPanelHeaderPreview({
    subjectTitle,
    identitySegments = [],
    contextChips = [],
    activeMode = "summary",
    onModeChange,
    onClickHeader,
    selected = false,
}: Props) {
    const summaryLine = formatSurfaceHeaderSummaryLine(identitySegments);

    return (
        <div
            className={[
                "alloy-os-fp-header-compact rounded-lg border bg-white",
                selected ? "border-alloy-pine/45 ring-1 ring-alloy-pine/25" : "border-alloy-stone/20",
            ].join(" ")}
            data-focus-panel-header-preview="true"
            data-alloy-os-focus-panel-header="true"
            {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: "header" }}
            onClick={onClickHeader}
            role={onClickHeader ? "button" : undefined}
        >
            <div className="alloy-os-fp-header-compact__band" data-focus-panel-tier="subject">
                <FocusPanelSubjectIdentityBlock
                    subjectTitle={subjectTitle}
                    identitySummaryLine={summaryLine}
                    contextChips={contextChips}
                />
            </div>
            <div className="alloy-os-fp-header-compact__mode" data-focus-panel-tier="mode">
                <FocusPanelModeSwitch
                    activeMode={activeMode}
                    onModeChange={onModeChange ?? (() => {})}
                />
            </div>
        </div>
    );
}
