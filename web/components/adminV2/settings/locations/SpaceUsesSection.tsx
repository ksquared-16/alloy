"use client";

/**
 * USES — what a space may be scheduled for (V7 S1/S2), chosen from the org's own assignment
 * categories by name. Shared by the Add Space and space detail editors.
 *
 * Which categories are offered follows the one rule in `lib/location/spaceUse.ts`: a classroom takes
 * any use, a shared space child uses only; a physical space takes none (its editors hide this).
 * `null` means "never configured" — a legacy classroom keeps its current scheduling until the
 * operator chooses, and says so rather than looking like "no uses".
 */
import { useEffect, useState } from "react";

import { ConfigEditorSection } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigEditorSection";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";

type CategoryOption = { id: string; label: string; subjectTypes: Array<"child" | "staff">; active: boolean };

let categoriesPromise: Promise<CategoryOption[]> | null = null;
function loadCategories(): Promise<CategoryOption[]> {
    categoriesPromise ??= fetch("/api/admin/assignment-types", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { types: [] }))
        .then((body) =>
            ((body?.types ?? []) as Array<Record<string, unknown>>).map((t) => ({
                id: String(t.id),
                label: String(t.label ?? t.key ?? "Untitled use"),
                subjectTypes: (Array.isArray(t.subjectTypes) ? t.subjectTypes : ["child"]) as Array<"child" | "staff">,
                active: t.isActive !== false && t.is_active !== false,
            })),
        )
        .catch(() => {
            categoriesPromise = null;
            return [];
        });
    return categoriesPromise;
}

export default function SpaceUsesSection({
    role,
    value,
    onChange,
    disabled = false,
    testId,
}: {
    role: CanonicalUnitRole;
    /** Configured category ids; `null` = never configured. */
    value: string[] | null;
    onChange: (next: string[]) => void;
    disabled?: boolean;
    testId: string;
}) {
    const [categories, setCategories] = useState<CategoryOption[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        void loadCategories().then((rows) => {
            if (!cancelled) setCategories(rows);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const selected = value ?? [];
    const offered = (categories ?? []).filter(
        (c) => (c.active || selected.includes(c.id)) && (role === "operational_group" || c.subjectTypes.includes("child")),
    );
    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]);

    return (
        <ConfigEditorSection
            title="Uses"
            description="What this space is used for. A schedule can only use this space for one of these."
            testId={testId}
        >
            {value == null && role === "operational_group" ?
                <p className="config-typo-sublabel" data-testid={`${testId}-unconfigured`}>
                    Not configured yet — this classroom keeps its current scheduling until you choose its uses.
                </p>
            :   null}
            {categories == null ?
                <p className="config-typo-sublabel">Loading uses…</p>
            : offered.length === 0 ?
                <p className="config-typo-sublabel">No assignment categories are configured for this kind of space.</p>
            :   <div className="space-y-2" data-testid={`${testId}-list`}>
                    {offered.map((category) => (
                        <label key={category.id} className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={selected.includes(category.id)}
                                disabled={disabled}
                                onChange={() => toggle(category.id)}
                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                data-testid={`${testId}-${category.id}`}
                                data-space-use-label={category.label}
                            />
                            <span className="text-sm text-alloy-midnight">{category.label}</span>
                        </label>
                    ))}
                </div>
            }
        </ConfigEditorSection>
    );
}

/** Display names for configured uses (the read-only "Uses" fact). */
export function useSpaceUseLabels(ids: readonly string[] | null): string[] | null {
    const [categories, setCategories] = useState<CategoryOption[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        void loadCategories().then((rows) => {
            if (!cancelled) setCategories(rows);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (ids == null) return null;
    const byId = new Map((categories ?? []).map((c) => [c.id, c.label]));
    return ids.map((id) => byId.get(id) ?? "…");
}
