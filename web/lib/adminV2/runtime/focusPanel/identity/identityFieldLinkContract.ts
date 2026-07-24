/**
 * Identity-card Linked interaction contract — enrollment / operational fields that
 * navigate to the owning Focus Panel card instead of inline edit.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { reconcileLegacyChildEnrollmentAlias } from "@/lib/fields/canonicalFieldProjection";
import {
    resolveFocusPanelCardLinkForField,
    type FocusPanelCardLink,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    createEmptyFocusPanelCardLinkNavState,
    navigateCardLinkWithHistory,
    type FocusPanelCardLinkNavState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";

/** Enrollment / schedule ownership — inline edit is not offered on identity cards. */
const LINKABLE_IDENTITY_FIELD_REFS = new Set<string>([
    "inquiry_child.location_id",
    "inquiry_child.program",
    "inquiry_child.program_category_id",
    "inquiry_child.program_room_cohort_key",
    "inquiry_child.schedule_type",
    "inquiry_child.desired_schedule_type",
    "inquiry_child.start_date",
    "child.location",
    "child.program",
    "child.room",
    "child.schedule",
    "child.start_date",
    "child.desired_start_date",
]);

const DEFAULT_LINK_DESTINATIONS: Readonly<Record<string, FocusPanelCardKey>> = {
    "inquiry_child.location_id": "scheduling",
    "inquiry_child.program": "scheduling",
    "inquiry_child.program_category_id": "scheduling",
    "inquiry_child.program_room_cohort_key": "scheduling",
    "inquiry_child.schedule_type": "scheduling",
    "inquiry_child.desired_schedule_type": "scheduling",
    "inquiry_child.start_date": "scheduling",
    "child.location": "scheduling",
    "child.program": "scheduling",
    "child.room": "scheduling",
    "child.schedule": "scheduling",
    "child.start_date": "scheduling",
    "child.desired_start_date": "scheduling",
};

export type IdentityFieldLinkContract = {
    fieldRef: string;
    canOfferLinked: boolean;
    destinationCard: FocusPanelCardKey | null;
    linkLabel: string | null;
};

function normalizeLinkFieldRef(fieldRef: string): string {
    return reconcileLegacyChildEnrollmentAlias(fieldRef.trim());
}

export function resolveIdentityFieldLinkContract(fieldRef: string): IdentityFieldLinkContract {
    const normalized = normalizeLinkFieldRef(fieldRef);
    if (!normalized || !LINKABLE_IDENTITY_FIELD_REFS.has(normalized)) {
        return { fieldRef: normalized, canOfferLinked: false, destinationCard: null, linkLabel: null };
    }
    const destinationCard = DEFAULT_LINK_DESTINATIONS[normalized] ?? "scheduling";
    return {
        fieldRef: normalized,
        canOfferLinked: true,
        destinationCard,
        linkLabel: "Open",
    };
}

export function resolveConfiguredOrDefaultIdentityFieldLink(args: {
    links: readonly FocusPanelCardLink[] | null | undefined;
    fromCard: FocusPanelCardKey;
    fieldRef: string;
    itemId?: string | null;
}): Pick<FocusPanelCardLink, "id" | "fromCard" | "toCard" | "fromFieldKey" | "label"> | null {
    const normalized = normalizeLinkFieldRef(args.fieldRef);
    const configured = resolveFocusPanelCardLinkForField(args.links, args.fromCard, normalized)
        ?? (args.itemId
            ? resolveFocusPanelCardLinkForField(args.links, args.fromCard, args.itemId.trim())
            : null);
    if (configured) {
        return {
            id: configured.id,
            fromCard: configured.fromCard,
            toCard: configured.toCard,
            fromFieldKey: configured.fromFieldKey,
            label: configured.label,
        };
    }
    const contract = resolveIdentityFieldLinkContract(normalized);
    if (!contract.canOfferLinked || !contract.destinationCard) return null;
    return {
        id: `default:${args.fromCard}:${normalized}`,
        fromCard: args.fromCard,
        toCard: contract.destinationCard,
        fromFieldKey: normalized,
        label: contract.linkLabel,
    };
}

/** Navigate to the linked destination card via Card Link history (records source for Back). */
export function navigateIdentityFieldLink(args: {
    coordination: FocusPanelCoordination | undefined;
    fromCard: FocusPanelCardKey;
    fieldRef: string;
    destinationFocus: string | null;
    sourceFocus?: string | null;
    links?: readonly FocusPanelCardLink[] | null;
    itemId?: string | null;
    nav?: FocusPanelCardLinkNavState;
}): { ok: boolean; nav: FocusPanelCardLinkNavState } {
    const link = resolveConfiguredOrDefaultIdentityFieldLink({
        links: args.links,
        fromCard: args.fromCard,
        fieldRef: args.fieldRef,
        itemId: args.itemId,
    });
    const nav = args.nav ?? createEmptyFocusPanelCardLinkNavState();
    if (!link) return { ok: false, nav };
    return navigateCardLinkWithHistory({
        coordination: args.coordination,
        link,
        destinationFocus: args.destinationFocus,
        sourceFocus: args.sourceFocus ?? null,
        nav,
    });
}
