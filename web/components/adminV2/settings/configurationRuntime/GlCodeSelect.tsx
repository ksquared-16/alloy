"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    activeGlCodeOptions,
    buildGlCodeOptions,
    fetchGlCodeOptionSources,
    type GlCodeOption,
} from "@/lib/financials/gl/glCodeOptions";
import { organizationFinancialsChapterHref } from "@/lib/commercial/commercialChapterRoutes";

/**
 * Shared GL Code selector for Tuition Plans and Catalog Items.
 * Persists revenue_category_id; displays GL code — name.
 */
export function GlCodeSelect({
    value,
    onChange,
    includeInactiveValue = true,
    disabled = false,
    testId = "gl-code-select",
    label = "Revenue GL Code",
}: {
    value: string | null;
    onChange: (revenueCategoryId: string | null) => void;
    includeInactiveValue?: boolean;
    disabled?: boolean;
    testId?: string;
    label?: string;
}) {
    const [options, setOptions] = useState<GlCodeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = async () => {
        setLoading(true);
        setError(null);
        try {
            const sources = await fetchGlCodeOptionSources();
            setOptions(
                buildGlCodeOptions({
                    accounts: sources.accounts,
                    revenueCategories: sources.revenueCategories,
                    includeInactive: true,
                }),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load GL Codes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
    }, []);

    const selectable = useMemo(() => {
        const active = activeGlCodeOptions(options);
        if (!includeInactiveValue || !value) return active;
        const current = options.find((row) => row.revenueCategoryId === value);
        if (current && !current.isActive && !active.some((row) => row.revenueCategoryId === value)) {
            return [current, ...active];
        }
        return active;
    }, [options, value, includeInactiveValue]);

    return (
        <div data-testid={testId}>
            <div className="flex items-center justify-between gap-2">
                <span className="config-typo-field-label">{label}</span>
                <button
                    type="button"
                    className="text-[11px] font-medium text-alloy-bend-pine hover:underline"
                    onClick={() => void reload()}
                    data-testid={`${testId}-refresh`}
                >
                    Refresh
                </button>
            </div>
            <select
                value={value ?? ""}
                disabled={disabled || loading}
                onChange={(event) => onChange(event.target.value || null)}
                className="config-runtime-select mt-1"
                data-testid={`${testId}-input`}
            >
                <option value="">{loading ? "Loading…" : "Not set"}</option>
                {selectable.map((row) => (
                    <option key={row.revenueCategoryId} value={row.revenueCategoryId}>
                        {row.label}
                        {!row.isActive ? " (inactive)" : ""}
                        {row.type ? ` · ${row.type}` : ""}
                    </option>
                ))}
            </select>
            {error ?
                <p className="mt-1 text-xs text-red-700">{error}</p>
            :   <p className="mt-1 text-xs text-alloy-midnight/45">
                    <Link
                        href={organizationFinancialsChapterHref("accounting")}
                        className="text-alloy-bend-pine hover:underline"
                    >
                        Manage GL Codes →
                    </Link>
                </p>
            }
        </div>
    );
}
