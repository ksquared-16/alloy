"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { LAYOUT_MUTATION_CLASS } from "@/lib/adminV2/layouts/layoutMutationClasses";
import type { LayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";

type SectionRow = {
    id: string;
    section_key: string;
    label: string;
    is_archived?: boolean;
};

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

/** Retire/restore only — primary section management lives in the Sections list. */
export default function LayoutCatalogSectionsPanel({
    entityType,
    capabilities,
    onChanged,
    advancedOnly = true,
}: {
    entityType: string;
    capabilities: LayoutCompositionCapabilities;
    onChanged?: () => void;
    advancedOnly?: boolean;
}) {
    const { canMutate } = useAdminAuth();
    const [rows, setRows] = useState<SectionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const canEdit = canMutate && capabilities.supportsSectionArchive && !capabilities.isReadOnly;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/field-sections?entity_type=${encodeURIComponent(entityType)}`, {
                cache: "no-store",
            });
            const json = (await res.json().catch(() => ({}))) as { sections?: SectionRow[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load sections");
            setRows(json.sections ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [entityType]);

    useEffect(() => {
        void load();
    }, [load]);

    const archivedRows = rows.filter((r) => r.is_archived);

    const setArchived = async (id: string, is_archived: boolean) => {
        if (!canEdit) return;
        try {
            const res = await fetch(`/api/admin/field-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_archived }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            await load();
            onChanged?.();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    if (
        !capabilities.allowedMutationClasses.includes(LAYOUT_MUTATION_CLASS.C_CATALOG_SECTION) &&
        capabilities.isReadOnly
    ) {
        return null;
    }

    if (!advancedOnly) {
        return null;
    }

    if (archivedRows.length === 0 && !loading) {
        return null;
    }

    return (
        <details className="rounded-lg border border-dashed border-alloy-forge/15 bg-alloy-stone/[0.02] px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-alloy-midnight/65">Advanced: retired sections</summary>
            <p className="mt-2 text-[10px] leading-snug text-alloy-midnight/55">
                Retiring hides a section from field assignment. Move fields out before retiring. Add and rename sections in
                the main list.
            </p>
            {loading ? <p className="mt-2 text-alloy-midnight/55">Loading…</p> : null}
            {error ? <p className="mt-2 text-red-600">{error}</p> : null}
            {archivedRows.length > 0 ? (
                <ul className="mt-2 space-y-1">
                    {archivedRows.map((r) => (
                        <li key={r.id} className="flex items-center gap-2">
                            <span>
                                {r.label}{" "}
                                <span className="font-mono text-[10px] text-alloy-midnight/40">{r.section_key}</span>
                            </span>
                            {canEdit ? (
                                <button
                                    type="button"
                                    className="text-alloy-pine hover:underline"
                                    onClick={() => void setArchived(r.id, false)}
                                >
                                    Restore catalog
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-2 text-alloy-midnight/50">No retired sections.</p>
            )}
        </details>
    );
}
