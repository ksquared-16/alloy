"use client";

import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_SUPPORTING,
    PRESENTATION_SUPPORTING_COMPACT,
} from "@/lib/presentation/presentationTypography";
import type { DrawerHouseholdContactRow } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    contacts: DrawerHouseholdContactRow[];
    overflowCount?: number;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    emptyMessage?: string;
    highlightPersonId?: string | null;
    showPrimaryBadge?: boolean;
};

function metaLine(contact: DrawerHouseholdContactRow, showPrimaryBadge: boolean): string {
    const parts = [
        contact.role_label,
        showPrimaryBadge && contact.is_primary ? "Primary contact" : null,
    ].filter(Boolean);
    return [...new Set(parts)].join(" · ");
}

function HouseholdContactCard({
    contact,
    anchorRecord,
    onAdornmentAction,
    highlightPersonId,
    showPrimaryBadge,
}: {
    contact: DrawerHouseholdContactRow;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    highlightPersonId?: string | null;
    showPrimaryBadge: boolean;
}) {
    const rowRecord: ProofRuntimeRecord = {
        id: contact.person_id,
        person_id: contact.person_id,
        "person.id": contact.person_id,
        "person.primary_contact_name": contact.display_name,
        "person.primary_phone": contact.phone ?? "",
        "person.primary_email": contact.email ?? "",
    };
    const meta = metaLine(contact, showPrimaryBadge);
    const isHighlighted = highlightPersonId != null && contact.person_id === highlightPersonId;

    return (
        <li
            className={`rounded-lg border bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)] ${
                isHighlighted ?
                    "border-alloy-juniper/25 ring-1 ring-alloy-juniper/10"
                :   "border-alloy-stone/12"
            }`}
            data-drawer-household-contact-card="true"
            {...(isHighlighted ? { "data-drawer-household-contact-current": "true" } : {})}
        >
            <div className="flex items-start gap-2.5">
                <DrawerHouseholdPersonLinkAvatar
                    personId={contact.person_id}
                    displayName={contact.display_name}
                    initials={contact.initials}
                    rowRecord={rowRecord}
                    onAdornmentAction={onAdornmentAction}
                    componentName="DrawerHouseholdContactCardList"
                />
                <div className="min-w-0 flex-1">
                    {contact.person_id ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="DrawerHouseholdContactCardList"
                            surface="drawer"
                            item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                            personId={contact.person_id}
                            rowRecord={rowRecord}
                            anchorRecord={anchorRecord}
                            adornment={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM.adornment}
                            display={contact.display_name}
                            onAction={onAdornmentAction}
                            className={`block truncate text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                            {contact.display_name}
                        </p>
                    }
                    {meta ?
                        <p className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}>{meta}</p>
                    :   null}
                    {contact.phone || contact.email ?
                        <p className={`mt-0.5 truncate ${PRESENTATION_SUPPORTING_COMPACT}`}>
                            {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                        </p>
                    :   null}
                </div>
            </div>
        </li>
    );
}

/** Shared read-only household contact cards for Lead/Person drawer widgets. */
export default function DrawerHouseholdContactCardList({
    contacts,
    overflowCount = 0,
    anchorRecord,
    onAdornmentAction,
    emptyMessage = "No additional household contacts linked yet.",
    highlightPersonId = null,
    showPrimaryBadge = true,
}: Props) {
    if (contacts.length === 0) {
        return (
            <p className={PRESENTATION_EMPTY_STATE} data-drawer-household-contacts-empty="true">
                {emptyMessage}
            </p>
        );
    }

    return (
        <div className="space-y-2 px-2 pb-2" data-drawer-household-contact-list="true">
            <ul className="flex flex-col gap-2">
                {contacts.map((contact) => (
                    <HouseholdContactCard
                        key={contact.person_id || contact.display_name}
                        contact={contact}
                        anchorRecord={anchorRecord}
                        onAdornmentAction={onAdornmentAction}
                        highlightPersonId={highlightPersonId}
                        showPrimaryBadge={showPrimaryBadge}
                    />
                ))}
            </ul>
            {overflowCount > 0 ?
                <p className="text-[11px] font-medium text-alloy-midnight/45">+{overflowCount} more</p>
            :   null}
        </div>
    );
}
