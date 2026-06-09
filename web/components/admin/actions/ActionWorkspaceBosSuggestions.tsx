"use client";

import type { ActionWorkspaceBosSuggestion } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    BOS_CONFIDENCE_STYLES,
    missingPlatformKeysFromSuggestions,
} from "@/lib/admin/actions/actionWorkspaceBosTheme";
import { ActionWorkspaceBosBanner } from "@/components/admin/actions/ActionWorkspaceBosBanner";

type Props = {
    suggestions: ActionWorkspaceBosSuggestion[];
    onToggle: (id: string) => void;
    onToggleAll: (selected: boolean) => void;
    onApply: () => void;
    onDismiss: () => void;
    onSuggestionValueChange: (id: string, value: string) => void;
    busy?: boolean;
};

export function ActionWorkspaceBosSuggestions({
    suggestions,
    onToggle,
    onToggleAll,
    onApply,
    onDismiss,
    onSuggestionValueChange,
    busy = false,
}: Props) {
    if (suggestions.length === 0) return null;

    const selectedCount = suggestions.filter((s) => s.selected).length;
    const allSelected = selectedCount === suggestions.length;
    const missing = missingPlatformKeysFromSuggestions(suggestions, true);

    return (
        <section className="flex h-full min-h-0 flex-col gap-3" data-testid="action-workspace-bos-suggestions">
            <ActionWorkspaceBosBanner title="BOS Suggestions" compact>
                Edit values inline, then apply. Form fields stay hidden until you confirm.
            </ActionWorkspaceBosBanner>

            {missing.length > 0 ?
                <div
                    className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
                    data-testid="action-workspace-bos-missing-hints"
                >
                    <span className="font-semibold">Still needed after apply: </span>
                    {missing.join(" · ")}
                </div>
            :   null}

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-alloy-stone/12 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Extracted fields
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-alloy-midnight/65">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={busy}
                            onChange={(e) => onToggleAll(e.target.checked)}
                            data-testid="action-workspace-bos-select-all"
                        />
                        Select all
                    </label>
                </div>

                <ul
                    className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-2"
                    data-testid="action-workspace-bos-suggestion-list"
                >
                    {suggestions.map((s) => {
                        const style = BOS_CONFIDENCE_STYLES[s.confidence];
                        return (
                            <li
                                key={s.id}
                                className={`flex items-start gap-2 rounded-xl border border-alloy-stone/12 border-l-[3px] bg-alloy-stone/[0.02] px-2.5 py-2 ${style.border}`}
                                data-testid={`action-workspace-bos-suggestion-${s.payload_key}`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-2 shrink-0"
                                    checked={s.selected}
                                    disabled={busy}
                                    onChange={() => onToggle(s.id)}
                                    aria-label={`Apply ${s.field_label}`}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-alloy-midnight/45">
                                            {s.field_label}
                                        </span>
                                        <span
                                            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}
                                        >
                                            {style.label}
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={s.suggested_value}
                                        disabled={busy}
                                        onChange={(e) => onSuggestionValueChange(s.id, e.target.value)}
                                        className="mt-1 w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-sm font-medium text-alloy-midnight focus:border-alloy-gold-dark/45 focus:outline-none focus:ring-2 focus:ring-alloy-gold/15"
                                        data-testid={`action-workspace-bos-edit-${s.payload_key}`}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>

                <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t border-alloy-stone/10 pt-3">
                    <button
                        type="button"
                        disabled={busy || selectedCount === 0}
                        onClick={onApply}
                        className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        data-testid="action-workspace-bos-apply-button"
                    >
                        Apply {selectedCount} suggestion{selectedCount === 1 ? "" : "s"}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onDismiss}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/5 disabled:opacity-50"
                        data-testid="action-workspace-bos-dismiss-button"
                    >
                        Back to paste
                    </button>
                </div>
            </div>
        </section>
    );
}
