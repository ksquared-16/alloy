"use client";

import CurrentWorkRuntimeCard from "@/components/workIntent/CurrentWorkRuntimeCard";
import LayoutRuntimeFollowUpsWidget from "@/components/layout/LayoutRuntimeFollowUpsWidget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

function readStageWorkRuntime(record: ProofRuntimeRecord): StageWorkRuntimeProjection | null {
    const raw = record._stage_work_runtime;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as StageWorkRuntimeProjection;
}

type Props = {
    record: ProofRuntimeRecord;
    opportunityId: string;
    title?: string;
    compact?: boolean;
    chromeless?: boolean;
    canMutate?: boolean;
};

/** Layout runtime Current Work widget — stage operating plan work items. */
export default function LayoutRuntimeCurrentWorkWidget({
    record,
    opportunityId,
    title = "Current Work",
    compact = false,
    chromeless = false,
    canMutate = true,
}: Props) {
    const runtime = readStageWorkRuntime(record);
    const followUpsHidden = compact || chromeless;

    if (!runtime) {
        return (
            <div
                className={chromeless ? LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY : LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE}
                data-layout-runtime-current-work-widget="true"
            >
                {!chromeless ?
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</p>
                :   null}
                <p className="mt-1 text-[12px] text-alloy-midnight/55">
                    No current work configured/open for this stage.
                </p>
            </div>
        );
    }

    return (
        <div
            className={chromeless ? "flex min-h-0 flex-col gap-2" : LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE}
            data-layout-runtime-current-work-widget="true"
        >
            {!chromeless ?
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</p>
            :   null}
            <CurrentWorkRuntimeCard
                opportunityId={opportunityId}
                runtime={runtime}
                canMutate={canMutate}
                chromeless={chromeless || compact}
            />
            {!followUpsHidden ?
                <LayoutRuntimeFollowUpsWidget record={record} compact chromeless />
            :   null}
        </div>
    );
}
