"use client";

import { useCallback, useEffect, useState } from "react";
import ConfigLockBanner from "@/components/admin/ConfigLockBanner";

export default function EntityLabelsConfigClient() {
    const [configLocked, setConfigLocked] = useState<boolean | null>(null);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/org-config");
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setConfigLocked(Boolean((data as { config_locked?: boolean }).config_locked));
            } else {
                setConfigLocked(false);
            }
        } catch {
            setConfigLocked(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const locked = configLocked === true;

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Entity Labels</h1>

            {configLocked === null ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : (
                <>
                    {locked && <ConfigLockBanner />}
                    <div className="rounded-lg border border-alloy-stone/20 bg-white p-6 max-w-lg">
                        <p className="text-sm text-alloy-midnight/70 mb-4">
                            Customize singular/plural labels for entity types (e.g. customer_members → &quot;Children&quot; for childcare).
                        </p>
                        <button
                            type="button"
                            disabled={locked}
                            className="rounded-md border border-alloy-stone/50 bg-white px-4 py-2 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save
                        </button>
                        {locked && (
                            <p className="mt-2 text-xs text-alloy-midnight/50">
                                Unlock in System Settings to save.
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
