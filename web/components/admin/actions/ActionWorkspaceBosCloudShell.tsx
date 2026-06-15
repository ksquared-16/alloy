"use client";

import { X } from "lucide-react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import type { ReactNode } from "react";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import { ACTION_WORKSPACE_LAYER_Z } from "@/lib/admin/actions/actionWorkspaceLayer";
import { ACTION_WORKSPACE_VIEWPORT_INSET } from "@/lib/admin/actions/actionWorkspaceBosTheme";
import {
    BOS_BACKDROP_STYLE,
    BOS_CANVAS_CONTENT_MAX_WIDTH,
    BOS_CANVAS_CONTENT_PADDING_X,
    BOS_CANVAS_TOP_OFFSET,
    BOS_SHELL_HEADER_PADDING,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_SHELL_TERRITORY_TITLE,
    BOS_WORKSPACE_RADIUS,
} from "@/lib/admin/actions/bosCloudTerritoryPath";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";
import { BosTerritoryShell } from "@/components/admin/actions/BosTerritoryShell";

type Props = {
    open: boolean;
    onClose: () => void;
    /** Step-level heading — used for accessibility; shown in content sections, not territory header. */
    title?: string;
    /** Optional override for BOS tagline under territory title */
    description?: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    presentation?: "overlay" | "embedded";
    "data-testid"?: string;
};

/**
 * Dev/exploration only — cloud territory shell. Production Create Lead uses ActionWorkspaceBosShell.
 * @see /dev/action-workspace-bos-cloud
 */
export function ActionWorkspaceBosCloudShell({
    open,
    onClose,
    title,
    description,
    step,
    children,
    footer,
    busy = false,
    presentation = "overlay",
    "data-testid": dataTestId = "action-workspace-bos-cloud",
}: Props) {
    if (!open) return null;

    const embedded = presentation === "embedded";
    const tagline = description?.trim() || BOS_SHELL_TERRITORY_TAGLINE;

    const overlayClass = embedded ?
        "relative flex w-full items-start justify-center"
    :   "fixed inset-0 flex items-start justify-center";

    const overlayStyle = embedded ?
        undefined
    :   {
            zIndex: ACTION_WORKSPACE_LAYER_Z,
            paddingTop: BOS_CANVAS_TOP_OFFSET,
            paddingBottom: ACTION_WORKSPACE_VIEWPORT_INSET,
        };

    const contentWrapStyle = {
        maxWidth: BOS_CANVAS_CONTENT_MAX_WIDTH,
        width: "100%",
        margin: "0 auto",
        paddingLeft: BOS_CANVAS_CONTENT_PADDING_X,
        paddingRight: BOS_CANVAS_CONTENT_PADDING_X,
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
            data-action-workspace-shell="bos-cloud"
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
                role="dialog"
                aria-modal={!embedded}
                aria-label={title ? `${BOS_SHELL_TERRITORY_TITLE} — ${title}` : BOS_SHELL_TERRITORY_TITLE}
                className="relative"
                onClick={(e) => e.stopPropagation()}
            >
                <BosTerritoryShell>
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
                            className="flex min-h-0 flex-1 flex-col pt-3 pb-4"
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
                </BosTerritoryShell>
            </div>
        </div>
    );
}
