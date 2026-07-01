"use client";

import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { isolateLayoutRuntimeLinkClick } from "@/lib/layout/runtime/isolateLayoutRuntimeLinkClick";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const PERSON_LINK_ITEM: LayoutItem = {
    id: "drawer-household-person-link-avatar",
    kind: "field",
    refKey: "person.primary_contact_name",
    adornment: {
        position: "left",
        icon: "person",
        action: { type: "open_drawer", entity: "person", idPath: "person.id" },
    },
};

type Props = {
    personId: string | null | undefined;
    displayName: string;
    initials: string;
    photoUrl?: string | null;
    imageUrl?: string | null;
    rowRecord?: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    componentName: string;
};

/** Profile avatar affordance — opens Person drawer when person_id is linked. */
export default function DrawerHouseholdPersonLinkAvatar({
    personId,
    displayName,
    initials,
    photoUrl,
    imageUrl,
    rowRecord,
    onAdornmentAction,
    componentName,
}: Props) {
    const resolvedPersonId = String(personId ?? "").trim();
    const linkable = Boolean(resolvedPersonId && onAdornmentAction);
    const avatar = (
        <PersonDrawerIdentityAvatar
            displayName={displayName}
            initials={initials}
            photoUrl={photoUrl}
            imageUrl={imageUrl}
            size="sm"
        />
    );

    if (!linkable) {
        return (
            <span
                className="shrink-0"
                data-drawer-household-person-link-avatar="static"
                {...(!resolvedPersonId ? { "data-drawer-household-person-link-disabled": "true" } : {})}
            >
                {avatar}
            </span>
        );
    }

    const adornment = PERSON_LINK_ITEM.adornment as LayoutFieldAdornment;

    return (
        <button
            type="button"
            className="shrink-0 rounded-full border border-transparent p-0 transition hover:border-alloy-juniper/25 hover:ring-2 hover:ring-alloy-juniper/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper/40"
            title={`Open ${displayName}`}
            aria-label={`Open ${displayName}`}
            data-layout-runtime-person-link="true"
            data-layout-runtime-adornment-link="true"
            data-drawer-household-person-link-avatar="true"
            data-drawer-household-person-link-component={componentName}
            onPointerDown={isolateLayoutRuntimeLinkClick}
            onMouseDown={isolateLayoutRuntimeLinkClick}
            onClick={(e) => {
                isolateLayoutRuntimeLinkClick(e);
                onAdornmentAction!(PERSON_LINK_ITEM, adornment, rowRecord);
            }}
        >
            {avatar}
        </button>
    );
}

export { PERSON_LINK_ITEM as DRAWER_HOUSEHOLD_PERSON_LINK_ITEM };
