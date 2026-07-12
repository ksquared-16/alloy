"use client";

import { nestedGroupLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

const EXPECTED_COMMIT = "243398855";

type Props = {
    composeCanvasMode: "configure" | "preview";
    activePurpose: IdentityConfigurationPurpose;
    surfaceId: string;
    selectedGroupKey?: string | null;
    config?: NestedSurfaceConfig | null;
    composeCanvasMounted?: boolean;
};

/** Temporary preview-only banner to prove deployment SHA and compose mode. */
export default function IdentityComposerDiagnosticBanner({
    composeCanvasMode,
    activePurpose,
    surfaceId,
    selectedGroupKey,
    config,
    composeCanvasMounted = false,
}: Props) {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview") return null;

    const deployedSha = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "unknown").slice(0, 7);
    const sectionLabel =
        selectedGroupKey && config
            ? nestedGroupLabel(config, selectedGroupKey) ?? selectedGroupKey
            : selectedGroupKey ?? "none";

    const purposeLabel =
        activePurpose === "summary" ? "Summary"
        : activePurpose === "context_facts" ? "Context Facts"
        : activePurpose === "details" ? "Details"
        : "Evidence";

    return (
        <div
            className="mb-3 rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-950"
            data-identity-composer-diagnostic="true"
        >
            <p className="font-bold uppercase tracking-wide">Identity Composer</p>
            <p>Commit: {deployedSha} {deployedSha === EXPECTED_COMMIT ? "(expected)" : `(expected ${EXPECTED_COMMIT})`}</p>
            <p>Mode: {composeCanvasMode === "configure" ? "Configure" : "Preview"}</p>
            <p>Purpose: {purposeLabel}</p>
            <p>Section: {sectionLabel}</p>
            <p>Surface: {surfaceId}</p>
            <p>Compose canvas mounted: {composeCanvasMounted ? "yes" : "no"}</p>
        </div>
    );
}
