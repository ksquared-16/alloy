"use client";

import { useEffect, useState } from "react";

import type { LifecycleBuilderProcessRecord, LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveBosProcessEffectiveCommandKeys } from "@/lib/bos/commandSession/slash/resolveBosProcessEffectiveCommandKeys";
import { pickActiveLifecycleProcess } from "@/lib/bos/commandSession/slash/bosProcessEffectiveCommandKeysFromMetadata";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/**
 * Load process-effective Command keys for the active workspace department.
 * Fail closed: keys stay null until a process is resolved.
 */
export function useBosProcessEffectiveCommandKeys(departmentId: string | null | undefined): {
    keys: ReadonlySet<string> | null;
    processName: string | null;
    loading: boolean;
} {
    const [keys, setKeys] = useState<ReadonlySet<string> | null>(null);
    const [processName, setProcessName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const dept = (departmentId ?? "").trim();
        if (!dept) {
            setKeys(null);
            setProcessName(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(dept)}/lifecycle-builder`,
                    workspaceDataFetchInit()
                );
                const j = (await res.json().catch(() => ({}))) as {
                    config?: LifecycleBuilderV1 | null;
                    active_process?: LifecycleBuilderProcessRecord | null;
                    error?: string;
                };
                if (!res.ok || cancelled) {
                    if (!cancelled) {
                        setKeys(null);
                        setProcessName(null);
                    }
                    return;
                }
                const process =
                    j.active_process ??
                    (j.config
                        ? pickActiveLifecycleProcess(j.config.processes, j.config.active_process_id)
                        : null);
                if (!process) {
                    setKeys(null);
                    setProcessName(null);
                    return;
                }
                setKeys(resolveBosProcessEffectiveCommandKeys({ process }));
                setProcessName(process.name);
            } catch {
                if (!cancelled) {
                    setKeys(null);
                    setProcessName(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    return { keys, processName, loading };
}
