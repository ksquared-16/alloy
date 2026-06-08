"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type PreviewSection = {
    position: number;
    section_key: string;
    title: string;
    kind: string;
};

type PreviewPayload = {
    entity_type: string;
    workflow: {
        workflow_v1_configured: boolean;
    };
    sections: PreviewSection[];
    layout_resolution?: { source?: string };
};

function move<T>(arr: T[], index: number, delta: number): T[] {
    const next = index + delta;
    if (next < 0 || next >= arr.length) return arr;
    const copy = [...arr];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    return copy;
}

export default function OpportunityWorkflowV1DrawerOrderEditor({ onSaved }: { onSaved?: () => void }) {
    const { canMutate, role, roleKeys, userEmail, userId, orgId, roleKeysSource } = useAdminAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<PreviewPayload | null>(null);
    const [keys, setKeys] = useState<string[]>([]);
    const [titles, setTitles] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSaveOk(null);
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity");
            const json = (await res.json().catch(() => ({}))) as PreviewPayload & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load layout preview");
            setPreview(json);
            const ordered = (json.sections ?? []).map((s) => s.section_key);
            const titleMap: Record<string, string> = {};
            for (const s of json.sections ?? []) titleMap[s.section_key] = s.title;
            setKeys(ordered);
            setTitles(titleMap);
        } catch (e) {
            setError((e as Error).message);
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const eligible = preview?.workflow?.workflow_v1_configured === true && preview.entity_type === "opportunity";

    const dirty = useMemo(() => {
        if (!preview?.sections?.length) return false;
        const initial = preview.sections.map((s) => s.section_key).join("\0");
        return keys.join("\0") !== initial;
    }, [keys, preview]);

    const save = async () => {
        if (!canMutate || !eligible) return;
        setSaving(true);
        setSaveError(null);
        setSaveOk(null);
        try {
            const res = await fetch("/api/admin/record-drawer-layouts/opportunity-workflow-v1-order", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ overview_section_order: keys }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; created_org_override?: boolean };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            setSaveOk(json.created_org_override ? "Saved — created org drawer override from global template." : "Saved.");
            await load();
            onSaved?.();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        if (!preview?.sections) return;
        setKeys(preview.sections.map((s) => s.section_key));
        setSaveError(null);
    };

    if (loading) {
        return <p className="text-xs text-alloy-midnight/55">Loading drawer order editor…</p>;
    }
    if (error) {
        return <p className="text-xs text-red-600">{error}</p>;
    }
    if (!eligible) {
        return (
            <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/65">
                <span className="font-semibold text-alloy-midnight/80">Section order</span> — available when this organization uses the
                inquiry workflow drawer. If you expected to edit order here, your layout may still be on the classic inquiry mode.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-alloy-pine/25 bg-white/85 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Drawer section order</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Drag order with Up/Down, then save. Staff see this order in the inquiry record drawer.
                    </p>
                </div>
                {preview?.layout_resolution?.source === "global_template" ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
                        First save creates an org override
                    </span>
                ) : null}
            </div>

            {saveError ? <p className="mt-2 text-xs text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="mt-2 text-xs text-alloy-pine">{saveOk}</p> : null}

            <ol className="mt-3 space-y-1.5">
                {keys.map((key, i) => (
                    <li
                        key={key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-admin-border/60 bg-white px-2 py-1.5 text-xs"
                    >
                        <span className="w-6 text-[10px] text-alloy-midnight/45">{i + 1}</span>
                        <span className="min-w-0 flex-1 font-medium text-alloy-midnight">{titles[key] ?? key}</span>
                        {canMutate ? (
                            <span className="flex gap-1">
                                <button
                                    type="button"
                                    className="rounded border border-admin-border px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                    disabled={i === 0 || saving}
                                    onClick={() => setKeys((prev) => move(prev, i, -1))}
                                >
                                    Up
                                </button>
                                <button
                                    type="button"
                                    className="rounded border border-admin-border px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                    disabled={i >= keys.length - 1 || saving}
                                    onClick={() => setKeys((prev) => move(prev, i, 1))}
                                >
                                    Down
                                </button>
                            </span>
                        ) : null}
                    </li>
                ))}
            </ol>

            {canMutate ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!dirty || saving}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void save()}
                    >
                        {saving ? "Saving…" : "Save order"}
                    </button>
                    <button
                        type="button"
                        disabled={!dirty || saving}
                        className="rounded-lg border border-admin-border px-3 py-1.5 text-xs font-medium text-alloy-midnight disabled:opacity-45"
                        onClick={discard}
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        className="rounded-lg border border-transparent px-3 py-1.5 text-xs text-alloy-pine hover:underline"
                        onClick={() => void load()}
                    >
                        Reload from server
                    </button>
                </div>
            ) : (
                <div className="mt-3 space-y-1 rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 px-3 py-2 text-[11px] leading-snug text-alloy-midnight/65">
                    <p className="font-medium text-alloy-midnight/80">View only — cannot save drawer order</p>
                    <p className="text-alloy-midnight/55">
                        Org id:{" "}
                        <span className="font-mono text-[10px] text-alloy-midnight/75">{orgId || "—"}</span>
                        {" · "}
                        Auth user id: <span className="font-mono text-[10px] text-alloy-midnight/75">{userId || "—"}</span>
                        {userEmail ? (
                            <>
                                {" · "}
                                Email: <span className="font-mono text-[10px] text-alloy-midnight/75">{userEmail}</span>
                            </>
                        ) : null}
                    </p>
                    <p className="text-alloy-midnight/55">
                        Role keys source: <span className="text-alloy-midnight/70">{roleKeysSource}</span>
                    </p>
                    <p>
                        Resolved portal role: <span className="font-mono text-[10px]">{role || "—"}</span>
                        {roleKeys.length > 0 ? (
                            <>
                                {" "}
                                · Membership keys for this org:{" "}
                                <span className="font-mono text-[10px]">{roleKeys.join(", ")}</span>
                            </>
                        ) : (
                            <span className="text-alloy-midnight/50">
                                {" "}
                                (membership keys were not passed by this shell — using compat role string only.)
                            </span>
                        )}
                    </p>
                    <p>
                        Saving requires the <strong className="text-alloy-midnight/85">admin</strong> portal membership role for this org (
                        same check as <span className="font-mono text-[10px]">PATCH …/opportunity-workflow-v1-order</span>).{" "}
                        <strong className="text-alloy-midnight/85">Ops</strong> can preview but not persist layout order here.
                    </p>
                </div>
            )}
        </div>
    );
}
