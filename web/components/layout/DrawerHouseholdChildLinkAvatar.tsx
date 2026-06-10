"use client";

import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { isolateLayoutRuntimeLinkClick } from "@/lib/layout/runtime/isolateLayoutRuntimeLinkClick";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const CHILD_LINK_ITEM: LayoutItem = {
    id: "drawer-household-child-link-avatar",
    kind: "field",
    refKey: "child.name",
    adornment: {
        position: "left",
        icon: "child",
        action: { type: "open_drawer", entity: "child", idPath: "child.id" },
    },
};

type Props = {
    childId: string | null | undefined;
    displayName: string;
    initials: string;
    rowRecord?: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    componentName: string;
};

/** Child profile avatar affordance — opens Child drawer when child_id is linked. */
export default function DrawerHouseholdChildLinkAvatar({
    childId,
    displayName,
    initials,
    rowRecord,
    onAdornmentAction,
    componentName,
}: Props) {
    const resolvedChildId = String(childId ?? "").trim();
    const linkable = Boolean(resolvedChildId && onAdornmentAction);
    const avatar = (
        <PersonDrawerIdentityAvatar displayName={displayName} initials={initials} size="sm" />
    );

    if (!linkable) {
        return (
            <span
                className="shrink-0"
                data-drawer-household-child-link-avatar="static"
                {...(!resolvedChildId ? { "data-drawer-household-child-link-disabled": "true" } : {})}
            >
                {avatar}
            </span>
        );
    }

    const adornment = CHILD_LINK_ITEM.adornment as LayoutFieldAdornment;

    return (
        <button
            type="button"
            className="shrink-0 rounded-full border border-transparent p-0 transition hover:border-alloy-juniper/25 hover:ring-2 hover:ring-alloy-juniper/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper/40"
            title={`Open ${displayName}`}
            aria-label={`Open ${displayName}`}
            data-layout-runtime-child-link="true"
            data-layout-runtime-adornment-link="true"
            data-drawer-household-child-link-avatar="true"
            data-drawer-household-child-link-component={componentName}
            onPointerDown={isolateLayoutRuntimeLinkClick}
            onMouseDown={isolateLayoutRuntimeLinkClick}
            onClick={(e) => {
                isolateLayoutRuntimeLinkClick(e);
                onAdornmentAction!(CHILD_LINK_ITEM, adornment, rowRecord);
            }}
        >
            {avatar}
        </button>
    );
}
