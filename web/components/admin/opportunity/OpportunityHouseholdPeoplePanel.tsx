"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

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
    router: { push: (href: string) => void; refresh: () => void };
    openDrawer: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    /** Increment to force refresh after an action. */
    refreshKey: number;
}) {
    const { opportunityId, customerId, canMutate, sectionKey, router, openDrawer, openForm, refreshKey } = props;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [people, setPeople] = useState<PersonRow[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/related/customer/${encodeURIComponent(customerId)}`, {
                credentials: "include",
            });
            const json = (await res.json().catch(() => ({}))) as { people?: PersonRow[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load household people");
            setPeople(Array.isArray(json.people) ? json.people : []);
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

    const tinyLabel = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55";

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
                <div className="text-sm text-alloy-forge/60">Loading…</div>
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
                                    {[r._person_email, r._person_phone].filter(Boolean).join(" · ")}
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

