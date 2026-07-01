"use client";

import type { ReactNode } from "react";
import PersonEmployeePlacementSection from "@/components/admin/entity/PersonEmployeePlacementSection";
import { PersonDrawerCustomerMemberships } from "@/components/admin/entity/PersonDrawerCustomerMemberships";
import { readPersonEmployeePlacementValues } from "@/lib/admin/personEmployeePlacementFields";

type Props = {
    personId: string;
    data: Record<string, unknown>;
    canMutate: boolean;
    relationshipsSlot?: ReactNode;
    onPersonUpdated?: (json: Record<string, unknown>) => void;
};

function readText(v: unknown): string {
    return typeof v === "string" && v.trim() ? v.trim() : "—";
}

/** Compact person profile drawer — name in header; contact + employee status above the fold. */
export default function PersonDrawerCompactOverview({
    personId,
    data,
    canMutate,
    relationshipsSlot,
    onPersonUpdated,
}: Props) {
    const email = readText(data.email);
    const phone = readText(data.phone);

    return (
        <div className="space-y-3" data-person-drawer-compact="true">
            <section className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Contact
                </h4>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/45">Email</dt>
                        <dd className="text-alloy-midnight/85">{email}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/45">Phone</dt>
                        <dd className="text-alloy-midnight/85">{phone}</dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Customer accounts
                </h4>
                <PersonDrawerCustomerMemberships record={data} />
            </section>

            <section className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Employee status
                </h4>
                <PersonEmployeePlacementSection
                    personId={personId}
                    initialValues={readPersonEmployeePlacementValues(data)}
                    canMutate={canMutate}
                    onPersonUpdated={onPersonUpdated}
                />
            </section>

            {relationshipsSlot ? (
                <section className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Relationships
                    </h4>
                    {relationshipsSlot}
                </section>
            ) : null}
        </div>
    );
}
