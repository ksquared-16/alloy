"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function SystemSettingsClient() {
    const { canMutate } = useAdminAuth();
    const [configLocked, setConfigLocked] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/org-config");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((data as { error?: string }).error ?? "Failed to load");
                setConfigLocked(false);
                return;
            }
            setConfigLocked(Boolean((data as { config_locked?: boolean }).config_locked));
        } catch (e) {
            setError((e as Error).message);
            setConfigLocked(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleToggleLock = async () => {
        if (!canMutate || configLocked === null) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/org-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config_locked: !configLocked }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((data as { error?: string }).error ?? "Failed to update");
                return;
            }
            setConfigLocked(Boolean((data as { config_locked?: boolean }).config_locked));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (!canMutate) {
        return (
            <div>
                <h1 className="text-3xl font-bold text-alloy-midnight mb-6">System Settings</h1>
                <p className="text-alloy-midnight/70">You do not have permission to change system settings.</p>
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">System Settings</h1>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : (
                <div className="rounded-lg border border-alloy-stone/20 bg-white p-6 max-w-lg">
                    <h2 className="text-lg font-semibold text-alloy-midnight mb-2">Configuration lock</h2>
                    <p className="text-sm text-alloy-midnight/70 mb-4">
                        When locked, entity labels, statuses, workflows, and org industry cannot be changed.
                    </p>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-alloy-midnight">
                            {configLocked ? "Locked" : "Unlocked"}
                        </span>
                        <button
                            type="button"
                            onClick={handleToggleLock}
                            disabled={saving}
                            className="rounded-md border border-alloy-stone/50 bg-white px-4 py-2 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20 disabled:opacity-50"
                        >
                            {saving ? "Updating…" : configLocked ? "Unlock" : "Lock"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
