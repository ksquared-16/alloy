"use client";

import PersonDrawerProfileBadges, {
    resolvePersonDrawerProfileFromRecord,
} from "@/components/admin/entity/PersonDrawerProfileBadges";
import RecordDrawerContextPanel from "@/components/admin/drawer/record/RecordDrawerContextPanel";
import RecordDrawerPremiumHeader from "@/components/admin/drawer/record/RecordDrawerPremiumHeader";
import {
    personDrawerAboveFoldShowsContact,
    personDrawerAboveFoldShowsDob,
} from "@/lib/admin/person/personDrawerPresentationProfile";
import { formatDate, formatPhoneUS } from "@/lib/adminFormatters";
import {
    oppInqContactRow,
    oppInqEyebrow,
    oppInqMutedEmpty,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

function personDisplayName(record: Record<string, unknown>): string {
    const fromJoin = String(record._person_name ?? "").trim();
    if (fromJoin) return fromJoin;
    const composed = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
    return composed || "Person";
}

function personInitials(record: Record<string, unknown>): string {
    const first = String(record.first_name ?? "").trim();
    const last = String(record.last_name ?? "").trim();
    if (first && last) return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
    const name = personDisplayName(record);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    return (name[0] ?? "P").toUpperCase();
}

function personDobIso(record: Record<string, unknown>): string | null {
    const raw = record.date_of_birth ?? record.dob;
    if (raw == null || String(raw).trim() === "") return null;
    return String(raw).slice(0, 10);
}

type BackLink = {
    label: string;
    onClick: () => void;
};

export default function PersonDrawerContextPanel({
    record,
    backLink = null,
}: {
    record: Record<string, unknown>;
    backLink?: BackLink | null;
}) {
    const name = personDisplayName(record);
    const email = String(record.email ?? "").trim();
    const phone = String(record.phone ?? "").trim();
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const showContact = personDrawerAboveFoldShowsContact(profile);
    const showDob = personDrawerAboveFoldShowsDob(profile);
    const dobIso = personDobIso(record);
    const age = String(record._age ?? record.age ?? "").trim();

    const contextRows = (
        <>
            {showDob && dobIso ? (
                <p className="text-xs text-alloy-midnight/70">
                    <span className={oppInqEyebrow}>DOB</span> {formatDate(dobIso)}
                    {age ? <span className="text-alloy-midnight/50"> · {age}</span> : null}
                </p>
            ) : null}
            {showContact ? (
                email || phone ? (
                    <div className={oppInqContactRow}>
                        {email ? <span>{email}</span> : null}
                        {email && phone ? <span className="text-alloy-midnight/30">·</span> : null}
                        {phone ? <span>{formatPhoneUS(phone)}</span> : null}
                    </div>
                ) : (
                    <p className={oppInqMutedEmpty}>No contact info on file.</p>
                )
            ) : null}
        </>
    );

    return (
        <RecordDrawerContextPanel data-record-drawer-context="person">
            <RecordDrawerPremiumHeader
                backLink={backLink}
                avatar={
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-alloy-stone/20 bg-alloy-stone/10 text-sm font-semibold text-alloy-midnight/70"
                        aria-hidden
                    >
                        {personInitials(record)}
                    </div>
                }
                title={name}
                badges={<PersonDrawerProfileBadges record={record} />}
                contextRows={contextRows}
            />
        </RecordDrawerContextPanel>
    );
}
