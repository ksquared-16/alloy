"use client";

import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import type { LifecycleRuntimeIdentity } from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import { identityHasSyncDrift } from "@/lib/lifecycle/lifecycleRuntimeIdentity";

export default function LifecycleRuntimeIdentityDebug({
    identity,
    validationDepartmentId,
    workspaceApiContainsRuntime,
}: {
    identity: LifecycleRuntimeIdentity | null;
    validationDepartmentId: string | null;
    workspaceApiContainsRuntime: boolean | null;
}) {
    if (!isLifecycleDebugUiEnabled() || !identity) return null;

    const drift = identityHasSyncDrift(identity);
    const validationId = (validationDepartmentId ?? identity.runtimeDepartmentId).trim();

    return (
        <div
            className="rounded border border-alloy-forge/12 bg-alloy-stone/5 px-2 py-1.5 font-mono text-[10px] text-alloy-midnight/75"
            data-testid="lifecycle-runtime-identity-debug"
        >
            <div>
                <span className="text-alloy-midnight/45">Selected runtime department: </span>
                <span className="break-all">{identity.runtimeDepartmentId || "—"}</span>
            </div>
            <div>
                <span className="text-alloy-midnight/45">Catalog department: </span>
                <span className="break-all">{identity.catalogDepartmentId || "—"}</span>
            </div>
            <div>
                <span className="text-alloy-midnight/45">Validation department: </span>
                <span className="break-all">{validationId || "—"}</span>
            </div>
            <div>
                <span className="text-alloy-midnight/45">Workspace API contains selected runtime department: </span>
                <span
                    className={
                        workspaceApiContainsRuntime === true
                            ? "font-medium text-alloy-pine"
                            : workspaceApiContainsRuntime === false
                              ? "font-medium text-red-800"
                              : ""
                    }
                >
                    {workspaceApiContainsRuntime === null ? "—" : workspaceApiContainsRuntime ? "yes" : "no"}
                </span>
            </div>
            {drift ? (
                <p className="mt-1 font-sans font-medium text-amber-900" data-testid="lifecycle-identity-drift-debug">
                    Catalog and runtime department IDs differ.
                </p>
            ) : null}
        </div>
    );
}
