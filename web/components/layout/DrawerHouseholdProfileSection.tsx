"use client";

import type { ReactNode } from "react";
import DrawerHouseholdContactCardList from "@/components/layout/DrawerHouseholdContactCardList";
import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import PersonRelatedPeopleGroupsWidget from "@/components/layout/person/PersonRelatedPeopleGroupsWidget";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import {
    resolveLeadDrawerHouseholdProfile,
    resolvePersonDrawerHouseholdProfile,
} from "@/lib/layout/runtime/resolveDrawerHouseholdProfile";
import { resolveOpportunityDrawerHouseholdContacts } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE,
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";
import { Home, Mail, MapPin, Phone } from "lucide-react";

type Props = {
    record: ProofRuntimeRecord;
    variant: "lead" | "person";
    onAdornmentAction?: AdornmentActionHandler;
    /** When true, household_contacts widget is configured in layout — render relationship list. */
    showContactsList?: boolean;
};

function ContactChannelRow({
    icon,
    value,
    placeholder,
}: {
    icon: ReactNode;
    value: string | null;
    placeholder: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-alloy-stone/10 bg-alloy-stone/[0.03] text-alloy-midnight/45">
                {icon}
            </span>
            {value ?
                <span className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>{value}</span>
            :   <span className={PRESENTATION_VALUE_PLACEHOLDER}>{placeholder}</span>}
        </div>
    );
}

function PrimaryContactProfileCard({
    name,
    role,
    email,
    phone,
    initials,
    personId,
    anchorRecord,
    onAdornmentAction,
}: {
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    initials: string;
    personId: string | null;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    if (!name && !email && !phone) return null;

    const rowRecord: ProofRuntimeRecord = {
        id: personId ?? "",
        person_id: personId ?? "",
        "person.id": personId ?? "",
        "person.primary_contact_name": name ?? "",
        "person.primary_email": email ?? "",
        "person.primary_phone": phone ?? "",
    };

    return (
        <div
            className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
            data-drawer-household-primary-contact="true"
        >
            <p className={`mb-2 ${PRESENTATION_LABEL}`}>Primary contact</p>
            <div className="flex items-start gap-2.5">
                <DrawerHouseholdPersonLinkAvatar
                    personId={personId}
                    displayName={name ?? "Contact"}
                    initials={initials}
                    rowRecord={rowRecord}
                    onAdornmentAction={onAdornmentAction}
                    componentName="DrawerHouseholdProfileSection"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                        {name ?
                            personId && onAdornmentAction ?
                                <LayoutRuntimePersonLinkSurface
                                    componentName="DrawerHouseholdProfileSection"
                                    surface="drawer"
                                    item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                                    personId={personId}
                                    rowRecord={rowRecord}
                                    anchorRecord={anchorRecord}
                                    adornment={null}
                                    display={name}
                                    onAction={onAdornmentAction}
                                    className={`block truncate text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                />
                            :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>{name}</p>
                        :   null}
                        {role ?
                            <p className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}>{role}</p>
                        :   null}
                    </div>
                    <ContactChannelRow
                        icon={<Mail className="h-3 w-3" aria-hidden />}
                        value={email}
                        placeholder="No email"
                    />
                    <ContactChannelRow
                        icon={<Phone className="h-3 w-3" aria-hidden />}
                        value={phone}
                        placeholder="No phone"
                    />
                </div>
            </div>
        </div>
    );
}

/** Household overview profile card — Lead and Person drawer composition sections. */
export default function DrawerHouseholdProfileSection({
    record,
    variant,
    onAdornmentAction,
    showContactsList = false,
}: Props) {
    const profile =
        variant === "lead" ? resolveLeadDrawerHouseholdProfile(record) : resolvePersonDrawerHouseholdProfile(record);

    const leadContacts = variant === "lead" ? resolveOpportunityDrawerHouseholdContacts(record) : null;

    const initials = personDrawerHouseholdInitials(profile.primaryName ?? profile.householdName ?? "Household");

    return (
        <div className="space-y-4 p-3" data-drawer-household-profile-section="true" data-drawer-household-profile-variant={variant}>
            <div className="space-y-2.5" data-drawer-household-identity-group="true">
                <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/10 bg-alloy-juniper/[0.08] text-alloy-juniper/80">
                        <Home className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                        {profile.householdName ?
                            <p className={PRESENTATION_DATA_VALUE}>{profile.householdName}</p>
                        :   <p className={PRESENTATION_VALUE_PLACEHOLDER}>Household name unavailable</p>}
                        {profile.location ?
                            <div className="pt-0.5">
                                <p className={PRESENTATION_LABEL}>Location</p>
                                <p className={`mt-0.5 flex items-center gap-1 ${PRESENTATION_SUPPORTING}`}>
                                    <MapPin className="h-3 w-3 shrink-0 text-alloy-midnight/40" aria-hidden />
                                    <span className="truncate">{profile.location}</span>
                                </p>
                            </div>
                        :   null}
                        {profile.address ?
                            <div className="pt-0.5">
                                <p className={PRESENTATION_LABEL}>Address</p>
                                <p className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}>{profile.address}</p>
                            </div>
                        :   null}
                        {profile.relationshipLabel && variant === "person" ?
                            <p className={`pt-0.5 ${PRESENTATION_SUPPORTING}`}>{profile.relationshipLabel}</p>
                        :   null}
                    </div>
                </div>
                {profile.status ?
                    <div className="pl-9" data-drawer-household-status-group="true">
                        <p className={PRESENTATION_LABEL}>Status</p>
                        <span className="mt-1 inline-flex items-center rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">
                            {profile.status}
                        </span>
                    </div>
                :   null}
            </div>

            {variant === "lead" ?
                <div className="space-y-3 border-t border-alloy-stone/10 pt-3" data-drawer-household-contacts-group="true">
                    {!showContactsList ?
                        <PrimaryContactProfileCard
                            name={profile.primaryName}
                            role={profile.primaryRole}
                            email={profile.primaryEmail}
                            phone={profile.primaryPhone}
                            initials={initials}
                            personId={profile.primaryPersonId}
                            anchorRecord={record}
                            onAdornmentAction={onAdornmentAction}
                        />
                    :   null}
                    {profile.secondaryName ?
                        <div className="rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.015] px-3 py-2">
                            <p className={PRESENTATION_LABEL}>Secondary contact</p>
                            <p className={`mt-0.5 ${PRESENTATION_DATA_VALUE_COMPACT}`}>{profile.secondaryName}</p>
                        </div>
                    :   null}
                    {showContactsList && leadContacts ?
                        <div className="space-y-1.5">
                            <p className={PRESENTATION_LABEL}>Household contacts</p>
                            <DrawerHouseholdContactCardList
                                contacts={leadContacts.visible}
                                overflowCount={leadContacts.overflowCount}
                                anchorRecord={record}
                                onAdornmentAction={onAdornmentAction}
                                emptyMessage="No household contacts linked yet."
                                showPrimaryBadge
                            />
                        </div>
                    :   null}
                </div>
            :   <div className="border-t border-alloy-stone/10 pt-3" data-drawer-household-relationships-group="true">
                    <PersonRelatedPeopleGroupsWidget record={record} onAdornmentAction={onAdornmentAction} />
                </div>}
        </div>
    );
}
