"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CustomerPersonRolesClient from "@/app/legacy-admin/system/customer-person-roles/CustomerPersonRolesClient";
import PersonRelationshipTypesClient from "@/app/legacy-admin/system/person-relationship-types/PersonRelationshipTypesClient";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";

const RELATIONSHIPS_SUBTITLE =
    "Vocabulary for who belongs on a customer account (customer ↔ person) and how people relate to each other (person ↔ person). Industry defaults still apply when “show all” is off in each table.";

const TAB_FAMILY = "family-roles" as const;
const TAB_PERSON = "person-relationships" as const;

type RelationshipsTab = typeof TAB_FAMILY | typeof TAB_PERSON;

function tabFromSearchParam(raw: string | null): RelationshipsTab {
    if (raw === TAB_PERSON) return TAB_PERSON;
    return TAB_FAMILY;
}

export default function RelationshipsSettingsClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const activeTab = useMemo(() => tabFromSearchParam(searchParams.get("tab")), [searchParams]);

    const setActiveTab = useCallback(
        (key: RelationshipsTab) => {
            const params = new URLSearchParams(searchParams.toString());
            if (key === TAB_FAMILY) {
                params.delete("tab");
            } else {
                params.set("tab", TAB_PERSON);
            }
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    const tabs = useMemo(
        () =>
            [
                { key: TAB_FAMILY, label: "Family roles" },
                { key: TAB_PERSON, label: "Person relationships" },
            ] as const,
        []
    );

    return (
        <div className="w-full min-w-0 space-y-5 pb-2">
            <SettingsPageHeader title="Relationships" subtitle={RELATIONSHIPS_SUBTITLE} />
            <SettingsEntityTabBar<RelationshipsTab>
                aria-label="Relationship vocabulary"
                tabs={[...tabs]}
                activeKey={activeTab}
                onSelect={setActiveTab}
            />
            <div role="tabpanel" aria-label={activeTab === TAB_FAMILY ? "Family roles" : "Person relationships"}>
                {activeTab === TAB_FAMILY ? (
                    <CustomerPersonRolesClient adminV2Chrome omitOuterHeader hideEyebrowTitle />
                ) : (
                    <PersonRelationshipTypesClient adminV2Chrome omitOuterHeader hideEyebrowTitle />
                )}
            </div>
            <section className="rounded-xl border border-alloy-forge/12 border-l-[3px] border-l-alloy-forge/25 bg-white/65 px-5 py-4 text-xs leading-snug text-alloy-midnight/60 shadow-[0_2px_10px_rgba(39,63,82,0.06)] backdrop-blur-[2px]">
                <p className="font-semibold tracking-[0.12em] text-alloy-midnight/45">Live data</p>
                <p className="mt-1 max-w-3xl">
                    Inspect actual <code className="rounded bg-alloy-midnight/5 px-1 py-0.5 font-mono text-[11px]">customer_persons</code> and{" "}
                    <code className="rounded bg-alloy-midnight/5 px-1 py-0.5 font-mono text-[11px]">person_relationships</code> rows (viewer coming next in
                    AdminV2).
                </p>
            </section>
        </div>
    );
}
