"use client";

import { useCallback, useState } from "react";
import {
    BUSINESS_PROCESS_CREATE_DESCRIPTION_LABEL,
    BUSINESS_PROCESS_CREATE_NAME_LABEL,
    BUSINESS_PROCESS_CREATE_NAME_REQUIRED,
    BUSINESS_PROCESS_CREATE_SUBMIT,
    BUSINESS_PROCESS_CREATE_SUBTITLE,
    BUSINESS_PROCESS_CREATE_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { LIFECYCLE_PRIMARY_ENTITIES } from "@/lib/lifecycle/lifecycleConfiguration";
import type { LifecyclePrimaryEntityKey } from "@/lib/lifecycle/lifecycleConfiguration";
import { createLifecycleViaBuilderPath } from "@/lib/lifecycle/clientCreateLifecycleViaBuilder";
import { LIFECYCLE_DESCRIPTION_MAX_CHARS } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function LifecycleCreateForm({
    departmentId,
    activationMode,
    createdByUserId,
    onCreated,
    onCancel,
    showCancel,
    onPersistenceAudit,
}: {
    departmentId: string;
    /** Creates builder-owned department + lifecycle (visible on /workspace). */
    activationMode?: boolean;
    createdByUserId?: string;
    onCreated: (result?: {
        departmentId: string;
        processId?: string;
        lifecycleName?: string;
    }) => void | Promise<void>;
    onCancel?: () => void;
    showCancel?: boolean;
    onPersistenceAudit?: (audit: unknown) => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [primaryEntity, setPrimaryEntity] = useState<LifecyclePrimaryEntityKey>("opportunity");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const descLen = description.length;

    const submit = useCallback(async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError(BUSINESS_PROCESS_CREATE_NAME_REQUIRED);
            return;
        }
        if (description.length > LIFECYCLE_DESCRIPTION_MAX_CHARS) {
            setError(`Description must be ${LIFECYCLE_DESCRIPTION_MAX_CHARS} characters or fewer`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            let targetDeptId = departmentId;
            let processId: string | undefined;
            if (activationMode) {
                const userId = createdByUserId?.trim();
                if (!userId) throw new Error("Signed-in user id is required to create a lifecycle department.");
                const created = await createLifecycleViaBuilderPath({
                    lifecycleName: trimmed,
                    lifecycleDescription: description.trim() || undefined,
                    primaryEntity,
                    createdByUserId: userId,
                });
                targetDeptId = created.runtimeDepartmentId;
                processId = created.processId;
                if (isLifecycleDebugUiEnabled()) {
                    const auditRes = await fetch(
                        `/api/admin/departments/${encodeURIComponent(targetDeptId)}/persistence-audit?process_id=${encodeURIComponent(processId)}`,
                        workspaceDataFetchInit()
                    );
                    const auditJ = (await auditRes.json().catch(() => ({}))) as { audit?: unknown };
                    if (auditRes.ok && auditJ.audit) {
                        console.info("[lifecycle-create] persistence audit", auditJ.audit);
                        onPersistenceAudit?.(auditJ.audit);
                    }
                }
            } else {
                if (!targetDeptId) throw new Error("Department is required");
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(targetDeptId)}/lifecycle-builder`,
                    {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "create_process",
                            name: trimmed,
                            description: description.trim() || undefined,
                            primary_entity: primaryEntity,
                        }),
                    }
                );
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to create lifecycle");
            }
            await onCreated(
                activationMode
                    ? { departmentId: targetDeptId, processId, lifecycleName: trimmed }
                    : undefined
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create lifecycle");
        } finally {
            setBusy(false);
        }
    }, [departmentId, name, description, primaryEntity, activationMode, createdByUserId, onCreated, onPersistenceAudit]);

    return (
        <section
            className="mx-auto max-w-lg rounded-xl border border-alloy-forge/12 bg-white/90 p-6 shadow-sm"
            data-testid="lifecycle-create-form"
        >
            <h2 className="text-base font-semibold text-alloy-midnight">{BUSINESS_PROCESS_CREATE_TITLE}</h2>
            <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/60">{BUSINESS_PROCESS_CREATE_SUBTITLE}</p>

            {error ? (
                <p className="mt-3 text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    {BUSINESS_PROCESS_CREATE_NAME_LABEL}
                    <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 bg-white px-3 py-2 text-sm"
                        placeholder="Enrollment, Billing, Scheduling, Incident Management"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="lifecycle-create-name-input"
                    />
                </label>
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    {BUSINESS_PROCESS_CREATE_DESCRIPTION_LABEL}
                    <textarea
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 bg-white px-3 py-2 text-sm"
                        rows={2}
                        maxLength={LIFECYCLE_DESCRIPTION_MAX_CHARS}
                        placeholder="Short summary for operators"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        data-testid="lifecycle-create-description-input"
                    />
                    <span className="mt-1 block text-[11px] text-alloy-midnight/50">
                        Shown on the workspace tile. {descLen}/{LIFECYCLE_DESCRIPTION_MAX_CHARS}
                    </span>
                </label>
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    Primary record type
                    <select
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 bg-white px-3 py-2 text-sm"
                        value={primaryEntity}
                        onChange={(e) => setPrimaryEntity(e.target.value as LifecyclePrimaryEntityKey)}
                        data-testid="lifecycle-create-primary-entity"
                    >
                        {LIFECYCLE_PRIMARY_ENTITIES.map((e) => (
                            <option key={e.key} value={e.key}>
                                {e.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={busy || !name.trim()}
                    onClick={() => void submit()}
                    data-testid="lifecycle-create-lifecycle"
                >
                    {busy ? "Creating…" : BUSINESS_PROCESS_CREATE_SUBMIT}
                </button>
                {showCancel && onCancel ? (
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/20 px-4 py-2 text-sm text-alloy-midnight/70"
                        onClick={onCancel}
                        data-testid="lifecycle-create-cancel"
                    >
                        Cancel
                    </button>
                ) : null}
            </div>
        </section>
    );
}
