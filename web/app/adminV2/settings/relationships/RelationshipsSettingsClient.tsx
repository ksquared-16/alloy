"use client";

import Link from "next/link";
import CustomerPersonRolesClient from "@/app/admin/system/customer-person-roles/CustomerPersonRolesClient";
import PersonRelationshipTypesClient from "@/app/admin/system/person-relationship-types/PersonRelationshipTypesClient";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";

const RELATIONSHIPS_SUBTITLE =
    "Vocabulary for who belongs on a customer account (customer ↔ person) and how people relate to each other (person ↔ person). Industry defaults still apply when “show all” is off in each table.";

export default function RelationshipsSettingsClient() {
    return (
        <div className="w-full max-w-6xl space-y-8 pb-2">
            <SettingsPageHeader title="Relationships" subtitle={RELATIONSHIPS_SUBTITLE} />
            <CustomerPersonRolesClient adminV2Chrome omitOuterHeader />
            <PersonRelationshipTypesClient adminV2Chrome omitOuterHeader />
            <section className="rounded-xl border border-alloy-forge/12 border-l-[3px] border-l-alloy-forge/25 bg-white/65 px-5 py-4 text-xs leading-snug text-alloy-midnight/60 shadow-[0_2px_10px_rgba(39,63,82,0.06)] backdrop-blur-[2px]">
                <p className="font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">Live data</p>
                <p className="mt-1 max-w-3xl">
                    Inspect actual <code className="rounded bg-alloy-midnight/5 px-1 py-0.5 font-mono text-[11px]">customer_persons</code> and{" "}
                    <code className="rounded bg-alloy-midnight/5 px-1 py-0.5 font-mono text-[11px]">person_relationships</code> rows (drawer links require the
                    legacy admin shell).
                </p>
                <Link
                    href="/admin/system/db-relationships"
                    className="mt-2 inline-flex font-medium text-alloy-blue hover:underline"
                >
                    Open DB Relationships viewer →
                </Link>
            </section>
        </div>
    );
}
