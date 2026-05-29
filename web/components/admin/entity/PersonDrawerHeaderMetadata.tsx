"use client";

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
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";

export function formatPersonDrawerRecordNumber(record: Record<string, unknown>): string | null {
    const raw = record.person_number;
    if (raw == null || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return `#${n}`;
}

type BackLink = {
    label: string;
    onClick: () => void;
};

/** Compact contact/DOB metadata for person title rail (under role pills). */
export function PersonDrawerHeaderContactMeta({ record }: { record: Record<string, unknown> }) {
    const email = String(record.email ?? "").trim();
    const phone = String(record.phone ?? "").trim();
    const profile = resolvePersonDrawerProfileFromRecord(record);
    const showContact = personDrawerAboveFoldShowsContact(profile);
    const showDob = personDrawerAboveFoldShowsDob(profile);
    const dobRaw = record.date_of_birth ?? record.dob;
    const dobIso = dobRaw != null && String(dobRaw).trim() !== "" ? String(dobRaw).slice(0, 10) : null;
    const age = String(record._age ?? record.age ?? "").trim();

    if (showDob && dobIso) {
        return (
            <p className="text-right text-[11px] leading-snug text-alloy-midnight/70">
                <span className={oppInqEyebrow}>DOB</span> {formatDate(dobIso)}
                {age ? <span className="text-alloy-midnight/50"> · {age}</span> : null}
            </p>
        );
    }

    if (showContact) {
        if (email || phone) {
            return (
                <div className={[oppInqContactRow, "mt-0 justify-end text-[11px]"].join(" ")}>
                    {email ? <span>{email}</span> : null}
                    {email && phone ? <span className="text-alloy-midnight/30">·</span> : null}
                    {phone ? <span>{formatPhoneUS(phone)}</span> : null}
                </div>
            );
        }
        return <p className={[oppInqMutedEmpty, "text-right"].join(" ")}>No contact info on file.</p>;
    }

    return null;
}

/** Person drawer subtitle row — record # and back link only. */
export default function PersonDrawerHeaderMetadata({
    record,
    backLink = null,
}: {
    record: Record<string, unknown>;
    backLink?: BackLink | null;
}) {
    const recordNumber = formatPersonDrawerRecordNumber(record);

    return (
        <div className="mt-0.5" data-person-drawer-header-metadata="true">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-alloy-midnight/75">
                {recordNumber ? <span className="font-medium text-alloy-midnight/80">{recordNumber}</span> : null}
                {backLink ? (
                    <>
                        {recordNumber ? <span className="text-alloy-midnight/30">·</span> : null}
                        <button
                            type="button"
                            onClick={backLink.onClick}
                            className="text-[12px] font-medium text-alloy-blue hover:underline"
                            data-record-drawer-back-link="true"
                        >
                            {backLink.label}
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}
