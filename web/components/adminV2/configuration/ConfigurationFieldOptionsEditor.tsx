"use client";

import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";
import { newInlineOptionFromLabel } from "@/lib/fields/fieldDefinitionInlineOptions";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Props = {
    options: FieldOption[];
    defaultOptionValue: string;
    disabled?: boolean;
    onChange: (next: { options: FieldOption[]; defaultOptionValue: string }) => void;
};

export default function ConfigurationFieldOptionsEditor({
    options,
    defaultOptionValue,
    disabled = false,
    onChange,
}: Props) {
    const [newLabel, setNewLabel] = useState("");

    const existingValues = new Set(options.map((o) => o.value));

    const addOption = () => {
        const label = newLabel.trim();
        if (!label) return;
        const row = newInlineOptionFromLabel(label, existingValues);
        onChange({ options: [...options, row], defaultOptionValue });
        setNewLabel("");
    };

    const updateOption = (index: number, patch: Partial<FieldOption>) => {
        const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
        onChange({ options: next, defaultOptionValue });
    };

    const removeOption = (index: number) => {
        const removed = options[index];
        const next = options.filter((_, i) => i !== index);
        const nextDefault =
            removed && defaultOptionValue === removed.value ? "" : defaultOptionValue;
        onChange({ options: next, defaultOptionValue: nextDefault });
    };

    const moveOption = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= options.length) return;
        const next = [...options];
        const tmp = next[index]!;
        next[index] = next[target]!;
        next[target] = tmp;
        onChange({ options: next, defaultOptionValue });
    };

    return (
        <div className="space-y-2 rounded-md border border-alloy-forge/12 bg-alloy-stone/[0.15] p-2.5" data-testid="field-options-editor">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Choices
            </p>
            {options.length === 0 ? (
                <p className="text-[11px] text-alloy-midnight/45">Add at least one choice for this field.</p>
            ) : (
                <ul className="space-y-1.5">
                    {options.map((opt, index) => (
                        <li key={`${opt.value}-${index}`} className="flex flex-wrap items-center gap-1.5">
                            <label className="flex items-center gap-1 text-[10px] text-alloy-midnight/45">
                                <input
                                    type="radio"
                                    name="field-default-option"
                                    checked={defaultOptionValue === opt.value}
                                    disabled={disabled}
                                    onChange={() => onChange({ options, defaultOptionValue: opt.value })}
                                    title="Default choice"
                                />
                                Default
                            </label>
                            <input
                                value={opt.label}
                                disabled={disabled}
                                onChange={(e) => updateOption(index, { label: e.target.value })}
                                className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                                data-testid={`field-option-label-${index}`}
                                placeholder="Choice label"
                            />
                            <div className="flex shrink-0 gap-0.5">
                                <button
                                    type="button"
                                    disabled={disabled || index === 0}
                                    onClick={() => moveOption(index, -1)}
                                    className="rounded border border-alloy-forge/12 p-1 text-alloy-midnight/45 hover:bg-white disabled:opacity-30"
                                    aria-label="Move up"
                                >
                                    <ChevronUp size={12} />
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled || index === options.length - 1}
                                    onClick={() => moveOption(index, 1)}
                                    className="rounded border border-alloy-forge/12 p-1 text-alloy-midnight/45 hover:bg-white disabled:opacity-30"
                                    aria-label="Move down"
                                >
                                    <ChevronDown size={12} />
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => removeOption(index)}
                                    className="rounded border border-alloy-forge/12 p-1 text-red-600/80 hover:bg-white disabled:opacity-30"
                                    aria-label="Remove choice"
                                    data-testid={`field-option-remove-${index}`}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    value={newLabel}
                    disabled={disabled}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addOption();
                        }
                    }}
                    className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-sm"
                    placeholder="New choice label"
                    data-testid="field-option-new-label"
                />
                <button
                    type="button"
                    disabled={disabled || !newLabel.trim()}
                    onClick={addOption}
                    className="inline-flex items-center gap-1 rounded-md border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] px-2 py-1 text-[11px] font-medium text-alloy-bend-pine disabled:opacity-40"
                    data-testid="field-option-add"
                >
                    <Plus size={12} />
                    Add choice
                </button>
            </div>
            <p className="text-[10px] text-alloy-midnight/40">
                Forms, Processing, Surface Builder, and Business Processes consume this same choice list.
            </p>
        </div>
    );
}
