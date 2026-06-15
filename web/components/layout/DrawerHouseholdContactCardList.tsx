"use client";

import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import DrawerRelationshipOverflowText from "@/components/layout/DrawerRelationshipOverflowText";
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
    /** When set, non-primary adults show a make-primary action (lead drawer). */
    canMutatePrimaryContact?: boolean;
    onMakePrimaryContact?: (contact: DrawerHouseholdContactRow) => void;
    makePrimarySavingPersonId?: string | null;
};

function PrimaryContactBadge() {
    return (
        <span
            className="inline-flex shrink-0 items-center rounded-full border border-alloy-juniper/25 bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/75"
            data-drawer-household-primary-contact-badge="true"
        >
            Primary contact
        </span>
    );
}

function metaLine(contact: DrawerHouseholdContactRow): string {
    const parts = [contact.role_label].filter(Boolean);
    return [...new Set(parts)].join(" · ");
}

function HouseholdContactCard({
    contact,
    anchorRecord,
    onAdornmentAction,
    highlightPersonId,
    showPrimaryBadge,
    canMutatePrimaryContact,
    onMakePrimaryContact,
    makePrimarySavingPersonId,
}: {
    contact: DrawerHouseholdContactRow;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    highlightPersonId?: string | null;
    showPrimaryBadge: boolean;
    canMutatePrimaryContact: boolean;
    onMakePrimaryContact?: (contact: DrawerHouseholdContactRow) => void;
    makePrimarySavingPersonId?: string | null;
}) {
    const rowRecord: ProofRuntimeRecord = {
        id: contact.person_id,
        person_id: contact.person_id,
        "person.id": contact.person_id,
        "person.primary_contact_name": contact.display_name,
        "person.primary_phone": contact.phone ?? "",
        "person.primary_email": contact.email ?? "",
    };
    const meta = metaLine(contact);
    const isHighlighted = highlightPersonId != null && contact.person_id === highlightPersonId;
    const showMakePrimary =
        canMutatePrimaryContact
        && !contact.is_primary
        && Boolean(contact.person_id)
        && Boolean(onMakePrimaryContact);
    const isSavingPrimary = makePrimarySavingPersonId === contact.person_id;

    return (
        <li
            className={`rounded-lg border bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)] ${
                isHighlighted ?
                    "border-alloy-juniper/25 ring-1 ring-alloy-juniper/10"
                :   "border-alloy-stone/12"
            }`}
            data-drawer-household-contact-card="true"
            {...(contact.is_primary ? { "data-drawer-household-primary-contact": "true" } : {})}
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
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {contact.person_id ?
                            <LayoutRuntimePersonLinkSurface
                                componentName="DrawerHouseholdContactCardList"
                                surface="drawer"
                                item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                                personId={contact.person_id}
                                rowRecord={rowRecord}
                                anchorRecord={anchorRecord}
                                adornment={null}
                                display={contact.display_name}
                                onAction={onAdornmentAction}
                                className={`block text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                            />
                        :   <DrawerRelationshipOverflowText
                                value={contact.display_name}
                                as="p"
                                className={PRESENTATION_DATA_VALUE_COMPACT}
                            />
                        }
                        {showPrimaryBadge && contact.is_primary ?
                            <PrimaryContactBadge />
                        :   null}
                    </div>
                    {meta ?
                        <DrawerRelationshipOverflowText
                            value={meta}
                            as="p"
                            className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}
                        />
                    :   null}
                    {contact.phone || contact.email ?
                        <DrawerRelationshipOverflowText
                            value={[contact.phone, contact.email].filter(Boolean).join(" · ")}
                            as="p"
                            lineClamp={3}
                            className={`mt-0.5 ${PRESENTATION_SUPPORTING_COMPACT}`}
                        />
                    :   null}
                    {showMakePrimary ?
                        <button
                            type="button"
                            onClick={() => onMakePrimaryContact?.(contact)}
                            disabled={isSavingPrimary}
                            className="mt-1.5 text-left text-[11px] font-medium text-alloy-blue hover:underline disabled:opacity-50"
                            data-drawer-household-make-primary-contact="true"
                        >
                            {isSavingPrimary ? "Saving…" : "Make primary contact"}
                        </button>
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
    canMutatePrimaryContact = false,
    onMakePrimaryContact,
    makePrimarySavingPersonId = null,
}: Props) {
    if (contacts.length === 0) {
        return (
            <p className={PRESENTATION_EMPTY_STATE} data-drawer-household-contacts-empty="true">
                {emptyMessage}
            </p>
        );
    }

    return (
        <div className="min-w-0 space-y-2" data-drawer-household-contact-list="true">
            <ul className="flex flex-col gap-2">
                {contacts.map((contact) => (
                    <HouseholdContactCard
                        key={contact.person_id || contact.display_name}
                        contact={contact}
                        anchorRecord={anchorRecord}
                        onAdornmentAction={onAdornmentAction}
                        highlightPersonId={highlightPersonId}
                        showPrimaryBadge={showPrimaryBadge}
                        canMutatePrimaryContact={canMutatePrimaryContact}
                        onMakePrimaryContact={onMakePrimaryContact}
                        makePrimarySavingPersonId={makePrimarySavingPersonId}
                    />
                ))}
            </ul>
            {overflowCount > 0 ?
                <p className="text-[11px] font-medium text-alloy-midnight/45">+{overflowCount} more</p>
            :   null}
        </div>
    );
}
