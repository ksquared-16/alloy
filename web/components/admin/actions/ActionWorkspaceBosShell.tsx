"use client";

import { X } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { measureActionWorkspacePanelLayout } from "@/lib/bos/bosRailPresentationFlags";
import { useActionWorkspaceOpenDocumentFlag } from "@/lib/bos/useActionWorkspaceOpenDocumentFlag";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import { ACTION_WORKSPACE_LAYER_Z } from "@/lib/admin/actions/actionWorkspaceLayer";
import { ACTION_WORKSPACE_VIEWPORT_INSET } from "@/lib/admin/actions/actionWorkspaceBosTheme";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_CANVAS_CONTENT_MAX_WIDTH,
    BOS_CANVAS_CONTENT_PADDING_X,
    BOS_SHELL_HEADER_PADDING,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_SHELL_TERRITORY_TITLE,
    BOS_WORKSPACE_BAND_GUTTER,
    BOS_WORKSPACE_EMBEDDED_HEIGHT,
    BOS_WORKSPACE_PANEL_HEIGHT,
    BOS_WORKSPACE_PANEL_SHADOW,
    BOS_WORKSPACE_RADIUS,
    BOS_WORKSPACE_TOP_INSET,
    BOS_WORKSPACE_WIDTH,
} from "@/lib/admin/actions/bosWorkspaceShell";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";

type Props = {
    open: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    presentation?: "overlay" | "embedded";
    "data-testid"?: string;
};

/**
 * Production BOS Action Workspace — premium stable shell for Create Lead.
 * No cloud SVG or mint frame.
 */
export function ActionWorkspaceBosShell({
    open,
    onClose,
    title,
    description,
    step,
    children,
    footer,
    busy = false,
    presentation = "overlay",
    "data-testid": dataTestId = "action-workspace-bos",
}: Props) {
    const embedded = presentation === "embedded";
    useActionWorkspaceOpenDocumentFlag(open, presentation);

    const [panelLayout, setPanelLayout] = useState<{ left: number; width: number } | null>(null);
    const [revealComplete, setRevealComplete] = useState(false);

    useLayoutEffect(() => {
        if (open) setRevealComplete(presentation === "embedded");
    }, [open, presentation]);

    useLayoutEffect(() => {
        if (!open || embedded) {
            setPanelLayout(null);
            return;
        }

        const measure = () => {
            setPanelLayout(measureActionWorkspacePanelLayout(window.innerWidth));
        };

        measure();
        window.addEventListener("resize", measure);
        const t = window.setTimeout(measure, 0);

        return () => {
            window.removeEventListener("resize", measure);
            window.clearTimeout(t);
        };
    }, [open, embedded]);

    if (!open) return null;

    const tagline = description?.trim() || BOS_SHELL_TERRITORY_TAGLINE;

    const overlayClass = embedded ?
        "relative flex w-full items-center justify-center"
    :   "fixed inset-x-0 top-0 overflow-hidden";

    const overlayStyle = embedded ?
        undefined
    :   {
            zIndex: ACTION_WORKSPACE_LAYER_Z,
            top: BOS_WORKSPACE_TOP_INSET,
            bottom: ACTION_WORKSPACE_VIEWPORT_INSET,
            padding: BOS_WORKSPACE_BAND_GUTTER,
        };

    const contentWrapStyle = {
        maxWidth: BOS_CANVAS_CONTENT_MAX_WIDTH,
        width: "100%",
        margin: "0 auto",
        paddingLeft: BOS_CANVAS_CONTENT_PADDING_X,
        paddingRight: BOS_CANVAS_CONTENT_PADDING_X,
    };

    const panelHeight = embedded ? BOS_WORKSPACE_EMBEDDED_HEIGHT : BOS_WORKSPACE_PANEL_HEIGHT;

    const panelStyle = {
        width: "100%",
        height: panelHeight,
        maxHeight: "100%",
        borderRadius: BOS_WORKSPACE_RADIUS,
        ...BOS_WORKSPACE_PANEL_SHADOW,
    };

    const headerRadius = {
        borderTopLeftRadius: BOS_WORKSPACE_RADIUS,
        borderTopRightRadius: BOS_WORKSPACE_RADIUS,
    };

    return (
        <div
            className={overlayClass}
            style={overlayStyle}
            data-action-workspace-overlay="true"
            data-action-workspace-shell="bos"
            data-action-workspace-presentation={presentation}
            data-testid={dataTestId}
            onClick={() => {
                if (!busy && !embedded) onClose();
            }}
        >
            {!embedded ?
                <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            :   null}

            <div
                className="relative shrink-0"
                style={
                    embedded ?
                        { width: BOS_WORKSPACE_WIDTH, maxHeight: "100%" }
                    :   {
                            width: panelLayout ? `${panelLayout.width}px` : BOS_WORKSPACE_WIDTH,
                            maxWidth: panelLayout ? `${panelLayout.width}px` : BOS_WORKSPACE_WIDTH,
                            maxHeight: "100%",
                            ...(panelLayout ?
                                { marginLeft: `${panelLayout.left}px`, marginRight: "auto" }
                            :   {}),
                        }
                }
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="pointer-events-none absolute inset-0 -z-10 scale-105"
                    style={BOS_AMBIENT_GLOW_STYLE}
                    aria-hidden
                    data-bos-ambient-glow="true"
                />

                <div
                    role="dialog"
                    aria-modal={!embedded}
                    aria-label={title ? `${BOS_SHELL_TERRITORY_TITLE} — ${title}` : BOS_SHELL_TERRITORY_TITLE}
                    className="bos-workspace-shell relative z-10 flex min-h-0 flex-col overflow-hidden bg-white"
                    style={panelStyle}
                    data-action-workspace-panel="true"
                    data-action-workspace-bos-workspace="true"
                >
                    <div className="bos-workspace-shell__atmosphere" aria-hidden />
                    <div className="bos-workspace-shell__perimeter" aria-hidden />
                    <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                    {!revealComplete ?
                        <BosRevealSequence
                            mode="workspace"
                            autoPlay
                            fill
                            onComplete={() => setRevealComplete(true)}
                            data-testid="action-workspace-bos-reveal"
                        />
                    :   <>
                    <header
                        className="relative shrink-0 text-white"
                        style={{
                            padding: BOS_SHELL_HEADER_PADDING,
                            background: BOS_SHELL_MIDNIGHT_FORGE,
                            ...headerRadius,
                        }}
                        data-action-workspace-territory-header="true"
                    >
                        <div style={contentWrapStyle}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0" data-action-workspace-bos-brand="true">
                                    <BosHeader
                                        title={BOS_SHELL_TERRITORY_TITLE}
                                        subtitle={tagline}
                                        size="lg"
                                        onDark
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={onClose}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
                                    data-testid="action-workspace-close"
                                    aria-label="Close"
                                >
                                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                                </button>
                            </div>
                            <div className="mt-3.5">
                                <ActionWorkspaceStepRail activeStep={step} onDark />
                            </div>
                        </div>
                    </header>

                    <div
                        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
                        data-action-workspace-content="true"
                        data-action-workspace-step={step}
                    >
                        <div
                            className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-4"
                            style={contentWrapStyle}
                        >
                            {children}
                        </div>
                    </div>

                    {footer ?
                        <footer
                            className="shrink-0 border-t border-alloy-stone/10 bg-white px-8 py-3.5"
                            data-action-workspace-footer="true"
                        >
                            <div
                                className="flex items-center justify-end gap-3"
                                style={contentWrapStyle}
                            >
                                {footer}
                            </div>
                        </footer>
                    :   null}
                    </>}
                    </div>
                </div>
            </div>
        </div>
    );
}
