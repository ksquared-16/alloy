"use client";

import { useCallback, useEffect } from "react";

import GlobalAssistantPanelRouter from "@/app/adminV2/components/globalAssistant/GlobalAssistantPanelRouter";
import { useGlobalAssistant } from "@/contexts/GlobalAssistantContext";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

const PANEL_Z = 70;
const BACKDROP_Z = 60;

export default function GlobalAssistantShell() {
    const { isOpen, currentContext, closeAssistant } = useGlobalAssistant();
    const enabled = isTaskAssistV1UiEnabled();

    const onBackdropClick = useCallback(() => {
        closeAssistant();
    }, [closeAssistant]);

    useEffect(() => {
        if (!enabled || !isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeAssistant();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [enabled, isOpen, closeAssistant]);

    if (!enabled || !isOpen) return null;

    const active = Boolean(currentContext?.entity_id);

    return (
        <>
            <button
                type="button"
                aria-label="Close assistant"
                className="fixed inset-0 bg-alloy-midnight/25 backdrop-blur-[1px]"
                style={{ zIndex: BACKDROP_Z }}
                onClick={onBackdropClick}
                data-global-assistant-backdrop="true"
            />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Task Assist"
                className="fixed top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-alloy-stone/20 bg-white shadow-2xl"
                style={{ zIndex: PANEL_Z }}
                data-global-assistant-shell="true"
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/15 px-4 py-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/50">Task Assist</p>
                        <h2 className="truncate text-sm font-semibold text-alloy-midnight/90">
                            {currentContext?.label ?? "Assistant"}
                        </h2>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                            Operator review required — distinct from layout assistant (bottom bar) and AI activity log.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={closeAssistant}
                        className="shrink-0 rounded-md border border-alloy-stone/25 px-2 py-1 text-[11px] font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5"
                        data-global-assistant-close="true"
                    >
                        Close
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {currentContext ? (
                        <GlobalAssistantPanelRouter context={currentContext} active={active} />
                    ) : (
                        <div className="rounded-lg border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.03] px-3 py-4 text-center" data-global-assistant-empty="true">
                            <p className="text-sm font-medium text-alloy-midnight/80">No record selected</p>
                            <p className="mt-1 text-[12px] text-alloy-midnight/60">
                                Open an opportunity and use &ldquo;Open assistant for this opportunity&rdquo;, or pick a record from the
                                workspace.
                            </p>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
