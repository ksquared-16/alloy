"use client";

import { useMemo, useState } from "react";

import { CommandSurfaceActionCardShell } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import {
    CONFIG_ASSIST_FIELD_TYPES,
    CONFIG_ASSIST_NEW_SECTION_VALUE,
    fieldTypeLabel,
    type ConfigAssistFieldType,
    type ConfigLayoutAssistFieldSetupDraftV1,
    type ConfigLayoutAssistSectionOptionV1,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import { brand, derived, neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export type ConfigLayoutAssistFieldSetupConfirmPayload = {
    field_type: ConfigAssistFieldType;
    required: boolean;
    section_key: string;
    new_section_label?: string;
};

export function ConfigLayoutAssistFieldSetupCard({
    draft,
    sectionOptions,
    busy,
    onConfirm,
}: {
    draft: ConfigLayoutAssistFieldSetupDraftV1;
    sectionOptions: ConfigLayoutAssistSectionOptionV1[];
    busy: boolean;
    onConfirm: (payload: ConfigLayoutAssistFieldSetupConfirmPayload) => void;
}) {
    const defaultSection =
        sectionOptions.find((s) => s.section_key === "custom")?.section_key ??
        sectionOptions[0]?.section_key ??
        "custom";

    const [fieldType, setFieldType] = useState<ConfigAssistFieldType>(draft.inferred_field_type);
    const [required, setRequired] = useState(draft.default_required);
    const [sectionKey, setSectionKey] = useState(defaultSection);
    const [newSectionLabel, setNewSectionLabel] = useState("");

    const isNewSection = sectionKey === CONFIG_ASSIST_NEW_SECTION_VALUE;
    const canSubmit = useMemo(() => {
        if (busy) return false;
        if (isNewSection && !newSectionLabel.trim()) return false;
        return true;
    }, [busy, isNewSection, newSectionLabel]);

    return (
        <CommandSurfaceActionCardShell data-command-surface-config-assist-field-setup="true">
            <p className="text-[13px] font-semibold" style={{ color: CMD.textBody }}>
                Add a field to {draft.entity_display_label}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: CMD.textSupporting }}>
                Field name: <span className="font-medium text-alloy-midnight">{draft.field_label}</span>
            </p>

            <div className="mt-3 space-y-3 text-[12px]">
                <label className="block">
                    <span className="text-[11px] font-medium" style={{ color: CMD.textLabel }}>
                        Field type
                    </span>
                    <select
                        className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-[12px]"
                        style={{ borderColor: derived.border, color: CMD.textBody }}
                        value={fieldType}
                        disabled={busy}
                        onChange={(e) => setFieldType(e.target.value as ConfigAssistFieldType)}
                    >
                        {CONFIG_ASSIST_FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {fieldTypeLabel(t)}
                            </option>
                        ))}
                    </select>
                </label>

                <fieldset>
                    <legend className="text-[11px] font-medium" style={{ color: CMD.textLabel }}>
                        Required
                    </legend>
                    <div className="mt-1 flex gap-2">
                        <ToggleChip
                            label="No"
                            active={!required}
                            disabled={busy}
                            onClick={() => setRequired(false)}
                        />
                        <ToggleChip
                            label="Yes"
                            active={required}
                            disabled={busy}
                            onClick={() => setRequired(true)}
                        />
                    </div>
                </fieldset>

                <label className="block">
                    <span className="text-[11px] font-medium" style={{ color: CMD.textLabel }}>
                        Where should it appear?
                    </span>
                    <select
                        className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-[12px]"
                        style={{ borderColor: derived.border, color: CMD.textBody }}
                        value={sectionKey}
                        disabled={busy}
                        onChange={(e) => setSectionKey(e.target.value)}
                    >
                        {sectionOptions.map((s) => (
                            <option key={s.section_key} value={s.section_key}>
                                {s.label}
                            </option>
                        ))}
                        <option value={CONFIG_ASSIST_NEW_SECTION_VALUE}>+ New section</option>
                    </select>
                </label>

                {isNewSection ? (
                    <label className="block">
                        <span className="text-[11px] font-medium" style={{ color: CMD.textLabel }}>
                            New section name
                        </span>
                        <input
                            type="text"
                            className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-[12px]"
                            style={{ borderColor: derived.border, color: CMD.textBody }}
                            value={newSectionLabel}
                            disabled={busy}
                            placeholder="e.g. Tour preferences"
                            onChange={(e) => setNewSectionLabel(e.target.value)}
                        />
                    </label>
                ) : null}
            </div>

            <p className="mt-3 text-[11px]" style={{ color: CMD.textSupporting }}>
                Please confirm the field type, whether it is required, and where it should appear.
            </p>

            <button
                type="button"
                disabled={!canSubmit}
                className="mt-3 w-full rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: brand.secondary }}
                data-command-surface-config-assist-confirm-setup="true"
                onClick={() =>
                    onConfirm({
                        field_type: fieldType,
                        required,
                        section_key: sectionKey,
                        ...(isNewSection ? { new_section_label: newSectionLabel.trim() } : {}),
                    })
                }
            >
                {busy ? "Saving…" : "Confirm setup"}
            </button>
        </CommandSurfaceActionCardShell>
    );
}

function ToggleChip({
    label,
    active,
    disabled,
    onClick,
}: {
    label: string;
    active: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                active ? "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-midnight" : "border-alloy-forge/15 bg-white/80 text-alloy-midnight/60"
            }`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}
