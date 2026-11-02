"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import { organizationFinancialsChapterHref } from "@/lib/commercial/commercialChapterRoutes";
import { catalogGlAccountOptions, type CatalogGlAccountCandidate } from "@/lib/financials/catalogCharges/catalogGlCodes";

/**
 * The organization's GL accounts, read once for the Catalog — a READ only: unlike the shared
 * `GlCodeSelect` loader, opening it never creates revenue categories. Saving an item is what
 * references or establishes its GL Code's posting setup (`catalogGlSelection.ts`).
 */
export function useCatalogGlAccounts(): { accounts: CatalogGlAccountCandidate[]; loading: boolean; error: string | null; reload: () => void } {
    const [accounts, setAccounts] = useState<CatalogGlAccountCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(() => {
        fetch("/api/admin/financials/accounts", { credentials: "include" })
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { data?: CatalogGlAccountCandidate[]; error?: string };
                if (!res.ok) throw new Error(json.error || "Could not load GL Codes.");
                setAccounts(Array.isArray(json.data) ? json.data : []);
                setError(null);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load GL Codes."))
            .finally(() => setLoading(false));
    }, []);
    const reload = useCallback(() => {
        setLoading(true);
        load();
    }, [load]);
    useEffect(() => load(), [load]);
    return { accounts, loading, error, reload };
}

/** A catalog item's GL Code: one of the organization's eligible GL codes, shown as `code · name`. */
export function CatalogGlCodeSelect({
    value,
    onChange,
    accounts,
    loading,
    error,
    onRefresh,
    testId = "catalog-dialog-gl-code",
}: {
    value: string | null;
    onChange: (glAccountId: string | null) => void;
    accounts: CatalogGlAccountCandidate[];
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    testId?: string;
}) {
    const options = useMemo(() => catalogGlAccountOptions(accounts, value), [accounts, value]);
    const current = options.find((o) => o.id === value) ?? null;
    return (
        <div data-testid={testId}>
            <div className="flex items-center justify-between gap-2">
                <span className="config-typo-field-label">GL Code</span>
                <button type="button" className="text-[11px] font-medium text-alloy-bend-pine hover:underline" onClick={onRefresh} data-testid={`${testId}-refresh`}>
                    Refresh
                </button>
            </div>
            <AlloySelect
                value={value ?? ""}
                onChange={(next) => onChange(next || null)}
                options={options.map((o) => ({ value: o.id, label: o.eligible ? o.label : `${o.label} (not eligible)` }))}
                disabled={loading}
                placeholder={loading ? "Loading…" : "Not set"}
                density="compact"
                aria-label="GL Code"
                className="mt-1"
                testId={`${testId}-input`}
            />
            {error ?
                <p className="mt-1 text-xs text-red-700">{error}</p>
            : current && !current.eligible ?
                <p className="mt-1 text-xs text-red-700" data-catalog-gl-ineligible="true">{current.ineligibleReason}</p>
            : !loading && options.length === 0 ?
                <p className="mt-1 text-xs text-alloy-midnight/60" data-catalog-gl-empty="true">
                    This organization has no active revenue GL accounts yet.{" "}
                    <Link href={organizationFinancialsChapterHref("accounting")} className="text-alloy-bend-pine hover:underline">Add one in Accounting →</Link>
                </p>
            :   <p className="mt-1 text-xs text-alloy-midnight/45">
                    Charges for this item post to the GL Code chosen here. Saving sets it up for posting.{" "}
                    <Link href={organizationFinancialsChapterHref("accounting")} className="text-alloy-bend-pine hover:underline">Manage GL Codes →</Link>
                </p>
            }
        </div>
    );
}
