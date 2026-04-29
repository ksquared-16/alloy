"use client";

import { useMemo } from "react";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

export type OpportunityPersonRow = {
    id: string;
    person_id: string;
    role_type: string;
    name: string | null;
    phone: string | null;
    email: string | null;
};

export function FamilyContactsPanel(props: {
    opportunityId: string;
    record: Record<string, unknown>;
    canMutate: boolean;
    sectionKey: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    router: { push: (href: string) => void; refresh: () => void };
    openDrawer: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    onRegistryApplied: () => void;
    /** Bumps when the parent refetches opportunity payload after a successful add. */
    refreshKey: number;
}) {
    const {
        opportunityId,
        record,
        canMutate,
        sectionKey,
        departmentId,
        workUnitId,
        router,
        openDrawer,
        openForm,
        onRegistryApplied,
        refreshKey,
    } = props;

    const primaryPersonId = record.primary_person_id != null ? String(record.primary_person_id).trim() : "";
    const primaryName = record._primary_person_name != null ? String(record._primary_person_name).trim() : "";
    const primaryEmail = record._primary_person_email != null ? String(record._primary_person_email) : null;
    const primaryPhone = record._primary_person_phone != null ? String(record._primary_person_phone) : null;

    const rows = useMemo(() => {
        const raw = (record._opportunity_persons as unknown[]) ?? [];
        if (!Array.isArray(raw)) return [] as OpportunityPersonRow[];
        return raw
            .map((x) => {
                const r = x as Record<string, unknown>;
                return {
                    id: String(r.id ?? ""),
                    person_id: String(r.person_id ?? ""),
                    role_type: String(r.role_type ?? "—"),
                    name: r.name != null ? String(r.name) : null,
                    phone: r.phone != null ? String(r.phone) : null,
                    email: r.email != null ? String(r.email) : null,
                } satisfies OpportunityPersonRow;
            })
            .filter((r) => r.id && r.person_id);
    }, [record._opportunity_persons, refreshKey]);

    const sorted = useMemo(() => {
        const filtered = primaryPersonId
            ? rows.filter((r) => String(r.person_id).trim() !== primaryPersonId)
            : rows;
        return [...filtered].sort((a, b) => {
            const ra = String(a.role_type ?? "");
            const rb = String(b.role_type ?? "");
            if (ra !== rb) return ra.localeCompare(rb);
            return String(a.name ?? "").localeCompare(String(b.name ?? ""));
        });
    }, [rows, primaryPersonId]);

    const tinyLabel = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55";

    return (
        <div className="space-y-3" data-family-contacts-panel={sectionKey}>
            <div>
                <div className={tinyLabel}>Primary person</div>
                {primaryPersonId ? (
                    <div className="mt-1 rounded-lg border border-alloy-stone/15 bg-white/70 px-3 py-2 text-sm">
                        <button
                            type="button"
                            onClick={() => openDrawer({ type: "persons", id: primaryPersonId })}
                            className="font-medium text-alloy-blue hover:underline"
                        >
                            {primaryName && primaryName !== "—" ? primaryName : "View person"}
                        </button>
                        <div className="mt-0.5 text-xs text-alloy-forge/65">
                            {[primaryPhone, primaryEmail].filter(Boolean).join(" · ") || "—"}
                        </div>
                    </div>
                ) : (
                    <p className="mt-1 text-sm text-alloy-forge/60">No primary person on this opportunity.</p>
                )}
            </div>

            <div>
                <div className={tinyLabel}>Opportunity people</div>
                <p className="mt-0.5 text-xs text-alloy-forge/60">Linked on this inquiry only (opportunity_persons).</p>
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
                onApplied={onRegistryApplied}
            />

            {sorted.length === 0 ? (
                <div className="text-sm text-alloy-forge/60">No additional people linked yet.</div>
            ) : (
                <ul className="space-y-2 list-none">
                    {sorted.map((r) => (
                        <li key={r.id} className="rounded-lg border border-alloy-stone/15 bg-white/70 px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => openDrawer({ type: "persons", id: r.person_id })}
                                    className="text-left font-medium text-alloy-blue hover:underline text-sm"
                                >
                                    {r.name && r.name.trim() ? r.name : "View person"}
                                </button>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-alloy-forge/55 shrink-0">
                                    {r.role_type}
                                </span>
                            </div>
                            <div className="mt-0.5 text-xs text-alloy-forge/65">
                                {[r.phone, r.email].filter(Boolean).join(" · ") || "—"}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
