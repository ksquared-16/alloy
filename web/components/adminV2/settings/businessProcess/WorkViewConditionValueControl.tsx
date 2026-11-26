"use client";

import {
    WORK_VIEW_DATE_PRESET_OPTIONS,
    WORK_VIEW_DATE_RELATIVE_DIRECTION_OPTIONS,
    WORK_VIEW_DATE_RELATIVE_UNIT_OPTIONS,
    WORK_VIEW_BOOLEAN_OPTIONS,
    datePresetSelectValue,
    isCustomDateFilterValue,
    mergeLocationFilterOptions,
    readRelativeDateControlState,
    resolveWorkViewFilterValueControlKind,
    serializeRelativeDateToken,
    type WorkViewFilterOption,
} from "@/lib/lifecycle/workViewFilterValueControls";
import type { WorkViewFilterOperatorV1 } from "@/lib/lifecycle/workViewsConfigV1";

export default function WorkViewConditionValueControl({
    fieldKey,
    operator,
    value,
    options,
    onChange,
    testId,
}: {
    fieldKey: string;
    operator: WorkViewFilterOperatorV1;
    value: unknown;
    /** Option list for the current field, resolved by the editor from the field's typed option source. */
    options: readonly WorkViewFilterOption[];
    onChange: (value: unknown) => void;
    testId?: string;
}) {
    const kind = resolveWorkViewFilterValueControlKind(fieldKey, operator);
    if (kind === "none") {
        return (
            <span className="config-runtime-muted px-1" data-testid={testId}>
                No value needed
            </span>
        );
    }

    if (kind === "date_preset") {
        const preset = datePresetSelectValue(value);
        const custom = isCustomDateFilterValue(value);
        const customIso = custom ? String(value).trim().slice(0, 10) : "";
        const relative = readRelativeDateControlState(value);
        const showRelative = preset === "__relative__";

        return (
            <div className="space-y-2" data-testid={testId ?? "work-view-condition-value-date"}>
                <select
                    value={preset}
                    onChange={(e) => {
                        const next = e.target.value;
                        if (next === "__custom__") {
                            onChange(customIso || new Date().toISOString().slice(0, 10));
                        } else if (next === "__relative__") {
                            onChange(serializeRelativeDateToken(relative.direction, relative.amount, relative.unit));
                        } else {
                            onChange(next);
                        }
                    }}
                    className="config-runtime-select"
                    data-testid={testId ? `${testId}-preset` : "work-view-condition-date-preset"}
                >
                    {WORK_VIEW_DATE_PRESET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                {showRelative ?
                    <div
                        className="config-runtime-condition-row !grid-cols-1 sm:!grid-cols-[auto_4rem_auto]"
                        data-testid={testId ? `${testId}-relative` : "work-view-condition-date-relative"}
                    >
                        <select
                            value={relative.direction}
                            onChange={(e) =>
                                onChange(
                                    serializeRelativeDateToken(
                                        e.target.value as "next" | "prev",
                                        relative.amount,
                                        relative.unit,
                                    ),
                                )
                            }
                            className="config-runtime-select"
                        >
                            {WORK_VIEW_DATE_RELATIVE_DIRECTION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min={1}
                            value={relative.amount}
                            onChange={(e) =>
                                onChange(
                                    serializeRelativeDateToken(
                                        relative.direction,
                                        Math.max(1, Number(e.target.value) || 1),
                                        relative.unit,
                                    ),
                                )
                            }
                            className="config-runtime-input"
                        />
                        <select
                            value={relative.unit}
                            onChange={(e) =>
                                onChange(
                                    serializeRelativeDateToken(
                                        relative.direction,
                                        relative.amount,
                                        e.target.value as "days" | "weeks" | "months",
                                    ),
                                )
                            }
                            className="config-runtime-select"
                        >
                            {WORK_VIEW_DATE_RELATIVE_UNIT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                :   null}
                {preset === "__custom__" || custom ?
                    <input
                        type="date"
                        value={customIso}
                        onChange={(e) => onChange(e.target.value)}
                        className="config-runtime-input"
                        data-testid={testId ? `${testId}-custom` : "work-view-condition-date-custom"}
                    />
                :   null}
            </div>
        );
    }

    if (kind === "status_select" || kind === "stage_select" || kind === "program_select" || kind === "room_select" || kind === "choice_select") {
        const placeholder =
            kind === "stage_select" ? "Select stage…"
            : kind === "program_select" ? "Select program…"
            : kind === "room_select" ? "Select room…"
            : kind === "choice_select" ? "Select option…"
            : "Select status…";
        return (
            <select
                value={String(value ?? "")}
                onChange={(e) => onChange(e.target.value)}
                className="config-runtime-select"
                data-testid={testId ?? `work-view-condition-value-${kind}`}
            >
                <option value="">{placeholder}</option>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    if (kind === "location_select") {
        const merged = mergeLocationFilterOptions(options);
        return (
            <select
                value={String(value ?? "current_site")}
                onChange={(e) => onChange(e.target.value)}
                className="config-runtime-select"
                data-testid={testId ?? "work-view-condition-value-location"}
            >
                {merged.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    if (kind === "boolean") {
        return (
            <select
                value={String(value ?? "true")}
                onChange={(e) => onChange(e.target.value)}
                className="config-runtime-select"
                data-testid={testId ?? "work-view-condition-value-boolean"}
            >
                {WORK_VIEW_BOOLEAN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter value"
            className="config-runtime-input"
            data-testid={testId ?? "work-view-condition-value-text"}
        />
    );
}
