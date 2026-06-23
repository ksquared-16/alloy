"use client";

import { COMMS_FIELD_LABEL_CLASS, COMMS_SELECT_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";

export type AudienceSelectOption = { id: string; label: string };

type Props = {
    label: string;
    helper?: string;
    options: AudienceSelectOption[];
    selected: string[];
    onChange: (next: string[]) => void;
    emptyNote: string;
    "data-filter"?: string;
};

export default function CommsAudienceMultiSelect({
    label,
    helper,
    options,
    selected,
    onChange,
    emptyNote,
    "data-filter": dataFilter,
}: Props) {
    return (
        <div className="flex flex-col gap-1.5">
            {label ? <span className={COMMS_FIELD_LABEL_CLASS}>{label}</span> : null}
            {helper ? <span className="text-[9px] text-alloy-midnight/45">{helper}</span> : null}
            {options.length === 0 ? (
                <span className="text-[10px] text-alloy-midnight/35">{emptyNote}</span>
            ) : (
                <select
                    multiple
                    data-filter={dataFilter}
                    value={selected}
                    onChange={(e) => {
                        const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                        onChange(next);
                    }}
                    className={`${COMMS_SELECT_CLASS} min-h-[5.5rem]`}
                    size={Math.min(Math.max(options.length, 3), 6)}
                >
                    {options.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.label}
                        </option>
                    ))}
                </select>
            )}
            {selected.length > 0 ? (
                <span className="text-[9px] text-alloy-midnight/45">{selected.length} selected · Cmd/Ctrl+click to multi-select</span>
            ) : null}
        </div>
    );
}
