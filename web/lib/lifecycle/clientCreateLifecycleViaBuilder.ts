/**
 * Same HTTP sequence as LifecycleCreateForm (activationMode) — used by UI and dev verify.
 */

import type { LifecyclePrimaryEntityKey } from "@/lib/lifecycle/lifecycleConfiguration";
import { lifecycleWorkspaceTileDescription, slugifyLifecycleKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { newBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type CreateLifecycleViaBuilderResult = {
    runtimeDepartmentId: string;
    processId: string;
    lifecycleName: string;
};

export async function createLifecycleViaBuilderPath(params: {
    lifecycleName: string;
    lifecycleDescription?: string;
    primaryEntity: LifecyclePrimaryEntityKey;
    createdByUserId: string;
}): Promise<CreateLifecycleViaBuilderResult> {
    const trimmed = params.lifecycleName.trim();
    if (!trimmed) throw new Error("Lifecycle name is required");
    const tileDescription = lifecycleWorkspaceTileDescription(params.lifecycleDescription, trimmed);

    const deptKey = slugifyLifecycleKey(trimmed);
    const deptRes = await fetch("/api/admin/departments", {
        ...workspaceDataFetchInit(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            key: deptKey,
            name: trimmed,
            description: tileDescription,
            metadata: newBuilderOwnedDepartmentMetadata(params.createdByUserId),
        }),
    });
    const deptJ = (await deptRes.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!deptRes.ok || !deptJ.id) {
        throw new Error(deptJ.error ?? "Failed to create workspace department");
    }
    const runtimeDepartmentId = deptJ.id;

    const procRes = await fetch(
        `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
        {
            ...workspaceDataFetchInit(),
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "create_process",
                name: trimmed,
                description: params.lifecycleDescription?.trim() || undefined,
                primary_entity: params.primaryEntity,
            }),
        }
    );
    const procJ = (await procRes.json().catch(() => ({}))) as {
        active_process?: { id: string; name: string };
        error?: string;
    };
    if (!procRes.ok || !procJ.active_process?.id) {
        throw new Error(procJ.error ?? "Failed to create lifecycle process");
    }

    return {
        runtimeDepartmentId,
        processId: procJ.active_process.id,
        lifecycleName: procJ.active_process.name,
    };
}
