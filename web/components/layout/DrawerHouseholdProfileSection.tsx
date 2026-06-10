"use client";

import type { ReactNode } from "react";
import LeadHouseholdContactsWidget from "@/components/layout/lead/LeadHouseholdContactsWidget";
import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import DrawerRelationshipOverflowText from "@/components/layout/DrawerRelationshipOverflowText";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import PersonRelatedPeopleGroupsWidget from "@/components/layout/person/PersonRelatedPeopleGroupsWidget";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import {
    resolveLeadDrawerHouseholdProfile,
    resolvePersonDrawerHouseholdProfile,
} from "@/lib/layout/runtime/resolveDrawerHouseholdProfile";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE,
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";
import { Mail, MapPin, Phone } from "lucide-react";

type Props = {
    record: ProofRuntimeRecord;
    variant: "lead" | "person";
    onAdornmentAction?: AdornmentActionHandler;
    /** When true, household_contacts widget is configured in layout — render relationship list. */
    showContactsList?: boolean;
    canMutate?: boolean;
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
        <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-alloy-stone/10 bg-alloy-stone/[0.03] text-alloy-midnight/45">
                {icon}
            </span>
            {value ?
                <DrawerRelationshipOverflowText
                    value={value}
                    className={PRESENTATION_DATA_VALUE_COMPACT}
                />
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
        <li
            className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
            data-drawer-household-primary-contact="true"
        >
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
                                    className={`block text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                />
                            :   <DrawerRelationshipOverflowText
                                    value={name}
                                    as="p"
                                    className={PRESENTATION_DATA_VALUE_COMPACT}
                                />
                        :   null}
                        {role ?
                            <DrawerRelationshipOverflowText
                                value={role}
                                as="p"
                                className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}
                            />
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
        </li>
    );
}

function PersonHouseholdIdentityStrip({
    profile,
}: {
    profile: ReturnType<typeof resolvePersonDrawerHouseholdProfile>;
}) {
    const hasIdentity =
        profile.householdName
        || profile.location
        || profile.address
        || profile.relationshipLabel
        || profile.status;

    if (!hasIdentity) return null;

    return (
        <div
            className="space-y-2 border-b border-alloy-stone/10 px-3 py-2.5"
            data-drawer-household-identity-group="true"
        >
            {profile.householdName ?
                <div>
                    <p className={PRESENTATION_LABEL}>Household</p>
                    <DrawerRelationshipOverflowText
                        value={profile.householdName}
                        as="p"
                        className={`mt-0.5 ${PRESENTATION_DATA_VALUE_COMPACT}`}
                    />
                </div>
            :   null}
            {profile.location ?
                <div>
                    <p className={PRESENTATION_LABEL}>Location</p>
                    <p className={`mt-0.5 flex min-w-0 items-start gap-1 ${PRESENTATION_SUPPORTING}`}>
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-alloy-midnight/40" aria-hidden />
                        <DrawerRelationshipOverflowText value={profile.location} />
                    </p>
                </div>
            :   null}
            {profile.address ?
                <div>
                    <p className={PRESENTATION_LABEL}>Address</p>
                    <DrawerRelationshipOverflowText
                        value={profile.address}
                        as="p"
                        className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}
                    />
                </div>
            :   null}
            {profile.relationshipLabel ?
                <DrawerRelationshipOverflowText
                    value={profile.relationshipLabel}
                    as="p"
                    className={PRESENTATION_SUPPORTING}
                />
            :   null}
            {profile.status ?
                <div data-drawer-household-status-group="true">
                    <p className={PRESENTATION_LABEL}>Status</p>
                    <span className="mt-1 inline-flex items-center rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">
                        {profile.status}
                    </span>
                </div>
            :   null}
        </div>
    );
}

function LeadHouseholdIdentityStrip({
    profile,
}: {
    profile: ReturnType<typeof resolveLeadDrawerHouseholdProfile>;
}) {
    return (
        <div className="space-y-2 px-3 py-2.5" data-drawer-household-identity-group="true">
            {profile.householdName ?
                <div>
                    <p className={PRESENTATION_LABEL}>Household</p>
                    <p className={`mt-0.5 ${PRESENTATION_DATA_VALUE}`}>{profile.householdName}</p>
                </div>
            :   <p className={PRESENTATION_VALUE_PLACEHOLDER}>Household name unavailable</p>}
            {profile.location ?
                <div>
                    <p className={PRESENTATION_LABEL}>Location</p>
                    <p className={`mt-0.5 flex min-w-0 items-start gap-1 ${PRESENTATION_SUPPORTING}`}>
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-alloy-midnight/40" aria-hidden />
                        <DrawerRelationshipOverflowText value={profile.location} />
                    </p>
                </div>
            :   null}
            {profile.address ?
                <div>
                    <p className={PRESENTATION_LABEL}>Address</p>
                    <DrawerRelationshipOverflowText
                        value={profile.address}
                        as="p"
                        className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}
                    />
                </div>
            :   null}
        </div>
    );
}

/** Household overview profile card — Lead and Person drawer composition sections. */
export default function DrawerHouseholdProfileSection({
    record,
    variant,
    onAdornmentAction,
    showContactsList = false,
    canMutate = false,
}: Props) {
    const profile =
        variant === "lead" ? resolveLeadDrawerHouseholdProfile(record) : resolvePersonDrawerHouseholdProfile(record);

    const initials = personDrawerHouseholdInitials(profile.primaryName ?? profile.householdName ?? "Household");

    if (variant === "person") {
        return (
            <div className="min-w-0" data-drawer-household-profile-section="true" data-drawer-household-profile-variant="person">
                <PersonHouseholdIdentityStrip profile={profile} />
                <div className="flex flex-col gap-3 p-2" data-drawer-household-relationships-group="true">
                    <PersonRelatedPeopleGroupsWidget record={record} onAdornmentAction={onAdornmentAction} />
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0" data-drawer-household-profile-section="true" data-drawer-household-profile-variant="lead">
            <LeadHouseholdIdentityStrip profile={profile} />
            <div className="space-y-3 border-t border-alloy-stone/10 p-2" data-drawer-household-contacts-group="true">
                {!showContactsList ?
                    <ul className="flex flex-col gap-2">
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
                    </ul>
                :   null}
                {profile.secondaryName ?
                    <div className="rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.015] px-3 py-2">
                        <p className={PRESENTATION_LABEL}>Secondary contact</p>
                        <DrawerRelationshipOverflowText
                            value={profile.secondaryName}
                            as="p"
                            className={`mt-0.5 ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    </div>
                :   null}
                {showContactsList ?
                    <div className="space-y-1.5 px-1">
                        <p className={PRESENTATION_LABEL}>Household contacts</p>
                        <LeadHouseholdContactsWidget
                            record={record}
                            onAdornmentAction={onAdornmentAction}
                            canMutate={canMutate}
                        />
                    </div>
                :   null}
            </div>
        </div>
    );
}
