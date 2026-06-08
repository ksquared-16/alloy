"use client";

/**
 * LayoutRuntimeDrawerBody — the LayoutDoc-driven body region of a runtime drawer.
 *
 * Renders a resolved drawer LayoutDoc against an adapter-built record (VALUES only;
 * structure/sections/fields/widgets come from the doc; missing values render `—`).
 * Read-only display parity. A render-phase failure falls back to `fallback` (the
 * capability fallback) without disturbing the surrounding shell/chrome.
 */

import type { ReactNode } from "react";
import LayoutRuntimeBodyErrorBoundary from "@/components/layout/LayoutRuntimeBodyErrorBoundary";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { LayoutFieldCommitHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimeDrawerBodyProps = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    /** Resolution source (org/default/registry/builtin) for telemetry markers. */
    layoutSource?: string | null;
    /** Surface key for diagnostics, e.g. "opportunity_drawer_overview". */
    surface: string;
    /** Rendered if the runtime body throws — the host's VM/capability fallback. */
    fallback: ReactNode;
    onRenderError?: (error: Error) => void;
    /** When set, editable fields commit through here (host persists via VM/PATCH). */
    onFieldCommit?: LayoutFieldCommitHandler;
    /** Entity namespace whose fields are writable (defaults to the doc anchor). */
    editableEntity?: string;
};

export default function LayoutRuntimeDrawerBody({
    doc,
    record,
    layoutSource,
    surface,
    fallback,
    onRenderError,
    onFieldCommit,
    editableEntity,
}: LayoutRuntimeDrawerBodyProps) {
    return (
        <LayoutRuntimeBodyErrorBoundary fallback={fallback} onError={onRenderError}>
            <div
                className="space-y-4"
                data-layout-runtime-drawer-body="true"
                data-drawer-layout-runtime-overview="true"
                data-layout-runtime-surface={surface}
                data-layout-runtime-source={layoutSource ?? ""}
                data-layout-runtime-readonly={onFieldCommit ? undefined : "true"}
                data-layout-runtime-editable={onFieldCommit ? "true" : undefined}
            >
                <LayoutRuntimeDrawerBodyView
                    doc={doc}
                    record={record}
                    onFieldCommit={onFieldCommit}
                    editableEntity={editableEntity}
                />
            </div>
        </LayoutRuntimeBodyErrorBoundary>
    );
}
