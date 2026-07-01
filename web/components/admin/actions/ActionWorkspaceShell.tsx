"use client";

import type { ReactNode } from "react";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import { ACTION_WORKSPACE_LAYER_Z } from "@/lib/admin/actions/actionWorkspaceLayer";
import { ACTION_WORKSPACE_VIEWPORT_INSET } from "@/lib/admin/actions/actionWorkspaceBosTheme";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    /** overlay = production fixed modal; embedded = dev gallery / screenshot frame */
    presentation?: "overlay" | "embedded";
    "data-testid"?: string;
};

/**
 * Canonical Alloy Action Workspace — large centered overlay for operator + BOS workflows.
 * Fits within viewport; clears BOS Command Center; no workspace scroll.
 */
export function ActionWorkspaceShell({
    open,
    onClose,
    title,
    description,
    step,
    children,
    footer,
    busy = false,
    presentation = "overlay",
    "data-testid": dataTestId = "action-workspace",
}: Props) {
    if (!open) return null;

    const embedded = presentation === "embedded";
    const panelHeight = embedded ? "min(80vh, 760px)" : `min(calc(100vh - ${ACTION_WORKSPACE_VIEWPORT_INSET}), 820px)`;

    const overlayClass = embedded ?
        "relative flex h-[min(80vh,760px)] w-full items-center justify-center rounded-2xl bg-alloy-midnight/20 p-3 backdrop-blur-[3px]"
    :   "fixed inset-x-0 top-0 flex items-start justify-center bg-alloy-midnight/18 px-4 pt-4 backdrop-blur-[3px] transition-opacity duration-300";
    const overlayStyle = embedded ?
        undefined
    :   {
            zIndex: ACTION_WORKSPACE_LAYER_Z,
            bottom: ACTION_WORKSPACE_VIEWPORT_INSET,
            paddingBottom: "0.75rem",
        };
    const panelClass =
        "flex w-[min(80vw,1400px)] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-alloy-stone/15 bg-[linear-gradient(180deg,#fff_0%,#fafbfc_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.16)] transition-all duration-300 ease-out";

    return (
        <div
            className={overlayClass}
            style={overlayStyle}
            data-action-workspace-overlay="true"
            data-action-workspace-presentation={presentation}
            data-testid={dataTestId}
            onClick={() => {
                if (!busy && !embedded) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={panelClass}
                style={{ height: panelHeight }}
                data-action-workspace-panel="true"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="shrink-0 border-b border-alloy-stone/12 bg-white/90 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{title}</h2>
                            {description ?
                                <p className="mt-0.5 max-w-3xl text-[13px] leading-snug text-alloy-midnight/60">
                                    {description}
                                </p>
                            :   null}
                        </div>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onClose}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-alloy-midnight/55 hover:bg-alloy-stone/10 hover:text-alloy-midnight disabled:opacity-50"
                            data-testid="action-workspace-close"
                        >
                            Close
                        </button>
                    </div>
                    <div className="mt-3">
                        <ActionWorkspaceStepRail activeStep={step} />
                    </div>
                </header>

                <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4"
                    data-action-workspace-content="true"
                    data-action-workspace-step={step}
                >
                    {children}
                </div>

                {footer ?
                    <footer
                        className="flex shrink-0 items-center justify-end gap-2 border-t border-alloy-stone/12 bg-white/95 px-5 py-3"
                        data-action-workspace-footer="true"
                    >
                        {footer}
                    </footer>
                :   null}
            </div>
        </div>
    );
}
