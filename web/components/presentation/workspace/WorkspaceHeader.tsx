/**
 * Presentation Runtime V2 — WS.HEADER.
 *
 * Org name as the surface title with a quiet "Workspace" eyebrow. Pure presentation:
 * receives the resolved header model from WorkspaceSurface, never fetches.
 */

import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function WorkspaceHeader({ orgName }: { orgName: string | null }) {
    return (
        <header
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceHeader)}
            data-alloy-section="WS.HEADER"
        >
            {orgName ? (
                <>
                    <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                        Workspace
                    </p>
                    <h1 className="mt-0.5 text-xl font-semibold leading-snug text-alloy-midnight">
                        {orgName}
                    </h1>
                </>
            ) : (
                <h1 className="text-xl font-semibold leading-snug text-alloy-midnight">Workspace</h1>
            )}
        </header>
    );
}
