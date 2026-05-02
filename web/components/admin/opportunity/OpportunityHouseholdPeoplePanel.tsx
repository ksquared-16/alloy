"use client";

import { AdminV2DrawerLoadingState } from "@/components/admin/workspace/AdminV2DrawerLoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { formatPhoneUS } from "@/lib/adminFormatters";

type PersonRow = {
    id: string;
    person_id: string;
    role_type: string | null;
    role_label: string | null;
    _person_name: string | null;
    _person_email: string | null;
    _person_phone: string | null;
};

export function OpportunityHouseholdPeoplePanel(props: {
    opportunityId: string;
    customerId: string;
    canMutate: boolean;
    sectionKey: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    router: { push: (href: string) => void; refresh: () => void };
    openDrawer: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    /** Increment to force refresh after an action. */
    refreshKey: number;
    /** @deprecated Prefer opportunityFullHydratePending. */
    recordHydrationPending?: boolean;
    opportunityFullHydratePending?: boolean;
    opportunityFullHydrateApplied?: boolean;
    opportunityFullHydrateFailed?: boolean;
}) {
    const { opportunityId, customerId, canMutate, sectionKey, departmentId, workUnitId, router, openDrawer, openForm, refreshKey, recordHydrationPending, opportunityFullHydratePending, opportunityFullHydrateApplied, opportunityFullHydrateFailed = false } = props;

    const householdEmptyAwaitingFull =
        !opportunityFullHydrateFailed &&
        (opportunityFullHydratePending === true ||
            (opportunityFullHydratePending === undefined &&
                opportunityFullHydrateApplied !== true &&
                Boolean(recordHydrationPending)));

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [people, setPeople] = useState<PersonRow[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const timingEnabled = process.env.NODE_ENV !== "production";
            const t0 = timingEnabled ? performance.now() : 0;
            const res = await fetch(`/api/admin/related/customer/${encodeURIComponent(customerId)}`, {
                credentials: "include",
            });
            const json = (await res.json().catch(() => ({}))) as { people?: PersonRow[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load household people");
            setPeople(Array.isArray(json.people) ? json.people : []);
            if (timingEnabled) {
                console.info("[timing][drawer]", {
                    key: `opportunities:${opportunityId}`,
                    phase: "related_people_fetch",
                    url: `/api/admin/related/customer/${encodeURIComponent(customerId)}`,
                    ms: Math.round((performance.now() - t0) * 10) / 10,
                });
            }
        } catch (e) {
            setPeople([]);
            setError(e instanceof Error ? e.message : "Failed to load household people");
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const rows = useMemo(() => {
        return [...people].sort((a, b) => {
            const ra = String(a.role_label ?? a.role_type ?? "");
            const rb = String(b.role_label ?? b.role_type ?? "");
            if (ra !== rb) return ra.localeCompare(rb);
            return String(a._person_name ?? "").localeCompare(String(b._person_name ?? ""));
        });
    }, [people]);

    const tinyLabel = "text-[11px] font-semibold tracking-wide text-alloy-forge/55";

    return (
        <div className="space-y-2">
            <div>
                <div className={tinyLabel}>Household people</div>
                <div className="mt-1 text-xs text-alloy-forge/60">
                    People linked to this household (via customer_persons).
                </div>
            </div>

            <OpportunityRecordSectionRegistryActions
                opportunityId={opportunityId}
                sectionKey={sectionKey}
                departmentId={departmentId ?? null}
                workUnitId={workUnitId ?? null}
                canMutate={canMutate}
                router={router}
                openDrawer={openDrawer}
                openForm={openForm}
                onApplied={() => void load()}
            />

            {error ? (
                <div className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <AdminV2DrawerLoadingState
                    density="inline"
                    title="Loading household people"
                    description="Fetching people linked to this household."
                    className="border-0 bg-transparent px-0 py-2 shadow-none ring-0"
                />
            ) : rows.length === 0 && householdEmptyAwaitingFull ? (
                <AdminV2DrawerLoadingState
                    density="inline"
                    title="Loading household people"
                    description="Additional links may still be merging into the full record."
                    className="border-0 bg-transparent px-0 py-2 shadow-none ring-0"
                />
            ) : rows.length === 0 && opportunityFullHydrateFailed ? (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
                    Full record did not load. Household links may be incomplete — try refreshing the drawer.
                </div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-alloy-forge/60">No linked people yet.</div>
            ) : (
                <div className="space-y-2">
                    {rows.map((r) => (
                        <div
                            key={r.id}
                            className="rounded-lg border border-alloy-stone/15 bg-white/70 px-3 py-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => openDrawer({ type: "persons", id: r.person_id })}
                                    className="min-w-0 truncate text-left text-[13px] font-semibold text-alloy-blue hover:underline"
                                >
                                    {r._person_name?.trim() || "Person"}
                                </button>
                                {r.role_label || r.role_type ? (
                                    <span className="shrink-0 rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[11px] font-semibold text-alloy-midnight/70">
                                        {String(r.role_label ?? r.role_type)}
                                    </span>
                                ) : null}
                            </div>
                            {(r._person_email || r._person_phone) ? (
                                <div className="mt-1 text-[12px] text-alloy-midnight/65">
                                    {[r._person_email, r._person_phone ? formatPhoneUS(r._person_phone) : null].filter(Boolean).join(" · ")}
                                </div>
                            ) : (
                                <div className="mt-1 text-[12px] text-alloy-midnight/45">No contact info.</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

