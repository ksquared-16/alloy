"use client";

import { useMemo, useState } from "react";
import type { ConfigApplyTarget } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Apply To… — reusable platform interaction for pushing configuration to selected targets.
 * Domains supply targets + onApply mutation; this primitive owns selection UX only.
 */
export function ConfigApplyToDialog({
    open,
    title = "Apply to…",
    description = "Choose where this configuration should apply.",
    targets,
    confirmLabel = "Apply",
    onClose,
    onApply,
    testId = "config-apply-to",
}: {
    open: boolean;
    title?: string;
    description?: string;
    targets: ConfigApplyTarget[];
    confirmLabel?: string;
    onClose: () => void;
    onApply: (targetIds: string[]) => Promise<void> | void;
    testId?: string;
}) {
    const selectable = useMemo(() => targets.filter((target) => !target.disabled), [targets]);
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const toggle = (id: string) => {
        setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    };

    const selectAll = () => setSelected(selectable.map((target) => target.id));
    const clearAll = () => setSelected([]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${testId}-title`}
            data-testid={testId}
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-forge/15 bg-white p-4 shadow-lg">
                <h2 id={`${testId}-title`} className="text-base font-semibold text-alloy-midnight">
                    {title}
                </h2>
                <p className="config-typo-sublabel mt-1">{description}</p>

                <div className="mt-3 flex gap-2 text-xs">
                    <button type="button" className="font-semibold text-[#007d68]" onClick={selectAll}>
                        Select all
                    </button>
                    <button type="button" className="font-semibold text-alloy-midnight/50" onClick={clearAll}>
                        Clear
                    </button>
                </div>

                <ul className="mt-2 max-h-64 divide-y divide-alloy-forge/10 overflow-y-auto rounded-lg border border-alloy-forge/10">
                    {targets.map((target) => (
                        <li key={target.id}>
                            <label
                                className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 ${
                                    target.disabled ? "cursor-not-allowed opacity-45" : "hover:bg-alloy-stone/10"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    disabled={target.disabled}
                                    checked={selected.includes(target.id)}
                                    onChange={() => toggle(target.id)}
                                    data-testid={`${testId}-target-${target.id}`}
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-alloy-midnight">
                                        {target.label}
                                    </span>
                                    {target.subtitle ?
                                        <span className="config-typo-sublabel block">{target.subtitle}</span>
                                    :   null}
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>

                {error ?
                    <p className="mt-2 text-sm text-red-700" role="alert">
                        {error}
                    </p>
                :   null}

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-[#00a283] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        disabled={busy || selected.length === 0}
                        data-testid={`${testId}-confirm`}
                        onClick={() => {
                            void (async () => {
                                setBusy(true);
                                setError(null);
                                try {
                                    await onApply(selected);
                                    setSelected([]);
                                    onClose();
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Apply failed");
                                } finally {
                                    setBusy(false);
                                }
                            })();
                        }}
                    >
                        {busy ? "Applying…" : `${confirmLabel} (${selected.length})`}
                    </button>
                </div>
            </div>
        </div>
    );
}
