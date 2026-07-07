"use client";

import type { QueueRowSubjectFocusUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import { SURFACE_FIELD_ROW_FOCUS_HELP } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

export type SurfaceRowFocusPickerProps = {
    value: QueueRowSubjectFocusUi;
    onChange: (value: QueueRowSubjectFocusUi) => void;
};

/** Operator row focus — library priority only, never layout. */
export default function SurfaceRowFocusPicker({ value, onChange }: SurfaceRowFocusPickerProps) {
    return (
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1" data-testid="surface-row-focus-picker">
            <span className="text-[11px] font-medium text-alloy-midnight/55">Row focus</span>
            <div className="flex gap-1.5">
                {(["family", "child"] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${
                            value === option ? "bg-alloy-pine text-white" : "bg-alloy-stone/10 text-alloy-midnight/65"
                        }`}
                        data-row-focus-option={option}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <p className="text-[10px] leading-snug text-alloy-midnight/45">{SURFACE_FIELD_ROW_FOCUS_HELP}</p>
        </div>
    );
}
