"use client";

import type { LifecycleRuntimeIdentity } from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import { identityHasSyncDrift } from "@/lib/lifecycle/lifecycleRuntimeIdentity";

export default function LifecycleIdentitySyncBanner({
    identity,
    onUseRuntimeDepartment,
}: {
    identity: LifecycleRuntimeIdentity | null;
    onUseRuntimeDepartment: () => void;
}) {
    if (!identity || !identityHasSyncDrift(identity)) return null;

    return (
        <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="alert"
            data-testid="lifecycle-identity-sync-banner"
        >
            <p>
                Lifecycle catalog and runtime department are out of sync. Catalog{" "}
                <span className="font-mono">{identity.catalogDepartmentId}</span> vs runtime{" "}
                <span className="font-mono">{identity.runtimeDepartmentId}</span>.
            </p>
            <button
                type="button"
                className="shrink-0 rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white"
                onClick={onUseRuntimeDepartment}
                data-testid="lifecycle-use-runtime-department"
            >
                Use runtime department
            </button>
        </div>
    );
}
