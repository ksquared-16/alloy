"use client";

import { useMemo } from "react";
import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import {
    buildQueueRecordLayoutPreviewVm,
    buildQueueRecordPreviewRecord,
    editorConfigToRuntimeConfig,
    PREVIEW_ROW_ACTIONS,
} from "@/lib/layout/queueRecordLayoutEditorModel";
import type { QueueRecordLayoutEditorConfig } from "@/lib/layout/queueRecordLayoutV3";

type Props = {
    config: QueueRecordLayoutEditorConfig;
};

export default function QueueRecordLayoutPreview({ config }: Props) {
    const runtimeConfig = useMemo(() => editorConfigToRuntimeConfig(config), [config]);
    const vm = useMemo(() => buildQueueRecordLayoutPreviewVm(), []);
    const record = useMemo(() => buildQueueRecordPreviewRecord(), []);

    return (
        <div
            className="queue-record-layout-preview rounded-lg border border-[#d5dbe8] bg-[#f8f9fb] p-3"
            data-queue-record-layout-preview="true"
        >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a8bbf]">Live Preview</p>
            <div
                className="queue-record-layout-preview__row rounded-md border border-[#e6e8ec] bg-white p-1"
                data-ws-surface="work_unit"
            >
                <OperationalQueueRecordRow
                    vm={vm}
                    record={record}
                    config={runtimeConfig}
                    rowActions={PREVIEW_ROW_ACTIONS}
                    onRowAction={() => {}}
                    onOpen={() => {}}
                />
            </div>
            {config.fixedControls.actionsMenu || config.fixedControls.workWithBos ?
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#9aa4bf]">
                    <span className="font-semibold uppercase tracking-wide">Fixed controls shown in preview →</span>
                    {config.fixedControls.workWithBos ?
                        <span className="rounded border border-[#b8d4f0] bg-[#f5f8ff] px-2 py-0.5 font-medium text-[#00458c]">
                            Work with BOS
                        </span>
                    :   null}
                    {config.fixedControls.actionsMenu ?
                        <span className="rounded border border-[#e6e8ec] bg-white px-2 py-0.5 font-medium text-[#31394d]">
                            Actions ▾
                        </span>
                    :   null}
                </div>
            :   null}
        </div>
    );
}
