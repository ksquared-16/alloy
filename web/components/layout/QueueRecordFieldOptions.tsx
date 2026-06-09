"use client";

import { ADORNMENT_ICON_GLYPH } from "@/lib/layout/adornmentIcons";
import { LAYOUT_ADORNMENT_ICONS, type LayoutAdornmentIcon } from "@/lib/layout/layoutV2";
import {
    QUEUE_RECORD_FIELD_CONDITION_PRESETS,
    queueRecordFieldConditionKey,
} from "@/lib/layout/queueRecordLayoutFieldPresets";
import type {
    QueueRecordFieldConfig,
    QueueRecordFieldDisplay,
    QueueRecordFieldEmphasis,
    QueueRecordFieldLinkTarget,
} from "@/lib/layout/queueRecordLayoutV3";

const DISPLAY_OPTIONS: { key: QueueRecordFieldDisplay; label: string }[] = [
    { key: "text", label: "Text" },
    { key: "muted", label: "Muted" },
    { key: "pill", label: "Pill" },
    { key: "badge", label: "Badge" },
    { key: "link", label: "Link" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "date", label: "Date" },
    { key: "chip", label: "Chip" },
];

const LINK_TARGETS: { key: QueueRecordFieldLinkTarget; label: string }[] = [
    { key: "none", label: "No link" },
    { key: "opportunity_drawer", label: "Opportunity drawer" },
    { key: "person_drawer", label: "Person drawer" },
    { key: "child_drawer", label: "Child drawer" },
    { key: "related_record_drawer", label: "Related record drawer (same as child)" },
];

const EMPHASIS_OPTIONS: { key: QueueRecordFieldEmphasis; label: string }[] = [
    { key: "default", label: "Default" },
    { key: "title", label: "Title" },
];

type Props = {
    field: QueueRecordFieldConfig;
    editable: boolean;
    canInline: boolean;
    onPatch: (patch: Partial<QueueRecordFieldConfig>) => void;
};

export default function QueueRecordFieldOptions({ field, editable, canInline, onPatch }: Props) {
    return (
        <div className="mt-1 space-y-1 border-t border-[#eef0f4] pt-1.5">
            <label className="flex items-center gap-1 text-[10px] text-[#59678b]">
                <span className="w-12 shrink-0 text-[#9aa4bf]">Label</span>
                <input
                    disabled={!editable}
                    value={field.label ?? ""}
                    onChange={(e) => onPatch({ label: e.target.value })}
                    className="min-w-0 flex-1 rounded border border-[#e6e8ec] px-1 py-0.5 disabled:opacity-40"
                />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-[#59678b]">
                <input
                    type="checkbox"
                    disabled={!editable}
                    checked={field.showLabel === true}
                    onChange={(e) => onPatch({ showLabel: e.target.checked ? true : false })}
                />
                Show label in row
            </label>
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] text-[#9aa4bf]">display:</span>
                <select
                    disabled={!editable}
                    value={field.display}
                    onChange={(e) => onPatch({ display: e.target.value as QueueRecordFieldDisplay })}
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {DISPLAY_OPTIONS.map((m) => (
                        <option key={m.key} value={m.key}>
                            {m.label}
                        </option>
                    ))}
                </select>
                {canInline ?
                    <label className="flex items-center gap-1 text-[10px] text-[#59678b]">
                        <input
                            type="checkbox"
                            disabled={!editable}
                            checked={Boolean(field.inlineWithPrevious)}
                            onChange={(e) => onPatch({ inlineWithPrevious: e.target.checked })}
                        />
                        Inline with previous
                    </label>
                :   null}
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] text-[#9aa4bf]">show:</span>
                <select
                    disabled={!editable}
                    value={queueRecordFieldConditionKey(field.visibleWhen)}
                    onChange={(e) =>
                        onPatch({
                            visibleWhen: QUEUE_RECORD_FIELD_CONDITION_PRESETS.find((p) => p.key === e.target.value)?.cond,
                        })
                    }
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {QUEUE_RECORD_FIELD_CONDITION_PRESETS.map((p) => (
                        <option key={p.key || "always"} value={p.key}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] text-[#9aa4bf]">emphasis:</span>
                <select
                    disabled={!editable}
                    value={field.emphasis ?? "default"}
                    onChange={(e) =>
                        onPatch({
                            emphasis: e.target.value === "default" ? undefined : (e.target.value as QueueRecordFieldEmphasis),
                        })
                    }
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {EMPHASIS_OPTIONS.map((m) => (
                        <option key={m.key} value={m.key}>
                            {m.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] text-[#9aa4bf]">icon:</span>
                <select
                    disabled={!editable}
                    value={field.icon ?? ""}
                    onChange={(e) => onPatch({ icon: (e.target.value || undefined) as LayoutAdornmentIcon | undefined })}
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    <option value="">None</option>
                    {LAYOUT_ADORNMENT_ICONS.map((ic) => (
                        <option key={ic} value={ic}>
                            {ADORNMENT_ICON_GLYPH[ic]} {ic}
                        </option>
                    ))}
                </select>
                <span className="text-[9px] text-[#9aa4bf]">link:</span>
                <select
                    disabled={!editable}
                    value={field.link?.target ?? "none"}
                    onChange={(e) => {
                        const target = e.target.value as QueueRecordFieldLinkTarget;
                        if (target === "none") return onPatch({ link: undefined });
                        onPatch({
                            link: {
                                target,
                                idFieldKey:
                                    target === "child_drawer" ? "child.id"
                                    : target === "person_drawer" ? "opportunity.primary_person_id"
                                    : "opportunity.id",
                            },
                        });
                    }}
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {LINK_TARGETS.map((t) => (
                        <option key={t.key} value={t.key}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className="font-mono text-[9px] text-[#9aa4bf]">{field.fieldKey}</p>
        </div>
    );
}
