/**
 * Identity-card Linked interaction contract — enrollment / operational fields that
 * navigate to the owning Focus Panel card instead of inline edit.
 *
 * Builder authors: Link to card · Open (base|detail) · Subject resolver.
 * Runtime resolves destination focus from the source item + subject key.
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

/**
 * The Children row that opens Health & Safety for THAT child.
 *
 * `child.medical_summary` is registered as a provider and resolves to null by
 * construction — there is no medical value on the child evidence model, and
 * there must not be one: Health & Safety owns that truth. What the Children card
 * can honestly offer is the same thing it already offers for Program and Room —
 * a LINK to the card that owns it, carrying this child as the subject.
 *
 * This is the Assignments interaction, not a second one: same allowlist, same
 * destination/open/subject authoring, same `navigateIdentityFieldLink` runtime,
 * same Back stack. Only the destination card differs.
 */
export const CHILD_HEALTH_LINK_FIELD_REF = "child.medical_summary" as const;

/** True when this ref is offered purely as a Health & Safety link, not as a value. PURE. */
export function childFieldRefOffersHealthLink(ref: string): boolean {
    return ref.trim() === CHILD_HEALTH_LINK_FIELD_REF;
}

/** Enrollment / schedule ownership — navigate to Assignments instead of inline edit. */
const LINKABLE_IDENTITY_FIELD_REFS = new Set<string>([
    CHILD_HEALTH_LINK_FIELD_REF,
    // Location is NOT linkable — siblings can differ and sites change over time;
    // child + lead each own an editable site select (child inherits lead when unset).
    "inquiry_child.program",
    "inquiry_child.program_category_id",
    "inquiry_child.program_room_cohort_key",
    "inquiry_child.schedule_type",
    "inquiry_child.desired_schedule_type",
    "inquiry_child.start_date",
    "child.program",
    "child.room",
    "child.schedule",
    "child.start_date",
    "child.desired_start_date",
]);

export type IdentityLinkDestinationOpen = "base" | "detail";
export type IdentityLinkDestinationSubject =
    | "this_child"
    | "selected_person"
    | "household"
    | "current_enrollment"
    | "current_schedule";

export type IdentityFieldLinkTarget = {
    toCard: FocusPanelCardKey;
    open: IdentityLinkDestinationOpen;
    subject: IdentityLinkDestinationSubject;
};

const DEFAULT_LINK_DESTINATIONS: Readonly<Record<string, FocusPanelCardKey>> = {
    "inquiry_child.program": "scheduling",
    "inquiry_child.program_category_id": "scheduling",
    "inquiry_child.program_room_cohort_key": "scheduling",
    "inquiry_child.schedule_type": "scheduling",
    "inquiry_child.desired_schedule_type": "scheduling",
    "inquiry_child.start_date": "scheduling",
    "child.program": "scheduling",
    "child.room": "scheduling",
    "child.schedule": "scheduling",
    "child.start_date": "scheduling",
    "child.desired_start_date": "scheduling",
    [CHILD_HEALTH_LINK_FIELD_REF]: "health_safety",
};

export const IDENTITY_LINK_CARD_OPTIONS: ReadonlyArray<{ value: FocusPanelCardKey; label: string }> = [
    { value: "scheduling", label: "Assignments" },
    { value: "health_safety", label: "Health & Safety" },
    { value: "children", label: "Children" },
    { value: "household", label: "Household" },
    { value: "current_work", label: "What's Next" },
    { value: "communications", label: "Contacts" },
    { value: "tour_summary", label: "Tour" },
    { value: "milestones", label: "Milestones" },
    { value: "billing_preview", label: "Billing Preview" },
];

/** Builder destination picker — Visible + Linked only (never Hidden). */
export function identityLinkDestinationOptions(
    visibilityByCardKey?: ReadonlyMap<FocusPanelCardKey, import("@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility").FocusPanelCardVisibility>,
): ReadonlyArray<{ value: FocusPanelCardKey; label: string }> {
    if (!visibilityByCardKey) return IDENTITY_LINK_CARD_OPTIONS;
    return IDENTITY_LINK_CARD_OPTIONS.filter((opt) => {
        const visibility = visibilityByCardKey.get(opt.value) ?? "visible";
        return visibility === "visible" || visibility === "linked";
    });
}

export const IDENTITY_LINK_OPEN_OPTIONS: ReadonlyArray<{ value: IdentityLinkDestinationOpen; label: string }> = [
    { value: "detail", label: "Detail" },
    { value: "base", label: "Summary" },
];

export const IDENTITY_LINK_SUBJECT_OPTIONS: ReadonlyArray<{
    value: IdentityLinkDestinationSubject;
    label: string;
}> = [
    { value: "this_child", label: "This child" },
    { value: "current_schedule", label: "Current schedule" },
    { value: "current_enrollment", label: "Current enrollment" },
    { value: "selected_person", label: "Selected person" },
    { value: "household", label: "Household" },
];

export type IdentityFieldLinkContract = {
    fieldRef: string;
    canOfferLinked: boolean;
    destinationCard: FocusPanelCardKey | null;
    linkLabel: string | null;
    defaultTarget: IdentityFieldLinkTarget | null;
};

function normalizeLinkFieldRef(fieldRef: string): string {
    return reconcileLegacyChildEnrollmentAlias(fieldRef.trim());
}

export function defaultIdentityFieldLinkTarget(fieldRef: string): IdentityFieldLinkTarget | null {
    const normalized = normalizeLinkFieldRef(fieldRef);
    if (!normalized || !LINKABLE_IDENTITY_FIELD_REFS.has(normalized)) return null;
    const toCard = DEFAULT_LINK_DESTINATIONS[normalized] ?? "scheduling";
    return {
        toCard,
        open: "detail",
        // Health is asked of a child, so the subject is the clicked child — with more
        // than one child in a family, anything else opens the wrong record.
        subject: toCard === "scheduling" ? "current_schedule" : "this_child",
    };
}

export function resolveIdentityFieldLinkContract(fieldRef: string): IdentityFieldLinkContract {
    const normalized = normalizeLinkFieldRef(fieldRef);
    const defaultTarget = defaultIdentityFieldLinkTarget(normalized);
    if (!defaultTarget) {
        return {
            fieldRef: normalized,
            canOfferLinked: false,
            destinationCard: null,
            linkLabel: null,
            defaultTarget: null,
        };
    }
    const dest = defaultTarget.toCard;
    const linkLabel =
        dest === "scheduling" ? "Assignments"
        : dest === "health_safety" ? "Health & Safety"
        : dest === "household" ? "Household"
        : dest === "children" ? "Children"
        : dest === "communications" ? "Contacts"
        : dest === "current_work" ? "What's Next"
        : "Open";
    return {
        fieldRef: normalized,
        canOfferLinked: true,
        destinationCard: dest,
        linkLabel,
        defaultTarget,
    };
}

/** True when Link to card / Open / Subject are all set to known options. */
export function isIdentityFieldLinkTargetComplete(
    target: IdentityFieldLinkTarget | null | undefined,
): boolean {
    if (!target?.toCard) return false;
    if (target.open !== "base" && target.open !== "detail") return false;
    return IDENTITY_LINK_SUBJECT_OPTIONS.some((opt) => opt.value === target.subject);
}

/** Compact operator summary after Linked is configured (collapsed authoring chrome). */
export function summarizeIdentityFieldLinkTarget(
    target: IdentityFieldLinkTarget | null | undefined,
): string | null {
    if (!isIdentityFieldLinkTargetComplete(target) || !target) return null;
    const card =
        IDENTITY_LINK_CARD_OPTIONS.find((opt) => opt.value === target.toCard)?.label ?? target.toCard;
    const open =
        IDENTITY_LINK_OPEN_OPTIONS.find((opt) => opt.value === target.open)?.label ?? target.open;
    const subject =
        IDENTITY_LINK_SUBJECT_OPTIONS.find((opt) => opt.value === target.subject)?.label
        ?? target.subject;
    // Operator-facing: describe the destination in plain language (Advanced may still show keys).
    if (target.toCard === "scheduling" && target.open === "detail") {
        return `Displays the child’s Primary Assignment summary`;
    }
    if (target.toCard === "health_safety") {
        return `Opens Health & Safety for this child`;
    }
    return `Opens ${card} · ${open} · ${subject}`;
}

export function normalizeIdentityFieldLinkTarget(
    value: Partial<IdentityFieldLinkTarget> | null | undefined,
    fieldRef: string,
): IdentityFieldLinkTarget | null {
    const fallback = defaultIdentityFieldLinkTarget(fieldRef);
    if (!fallback && !value?.toCard) return null;
    const toCard = value?.toCard ?? fallback?.toCard;
    if (!toCard) return null;
    return {
        toCard,
        open: value?.open === "base" || value?.open === "detail" ? value.open : fallback?.open ?? "detail",
        subject:
            value?.subject
            && IDENTITY_LINK_SUBJECT_OPTIONS.some((opt) => opt.value === value.subject)
                ? value.subject
                : fallback?.subject ?? "this_child",
    };
}

/** Resolve destination focus id from subject + source item context. */
export function resolveIdentityLinkDestinationFocus(args: {
    subject: IdentityLinkDestinationSubject;
    open: IdentityLinkDestinationOpen;
    sourceItemId?: string | null;
    personId?: string | null;
}): string | null {
    if (args.open === "base") return null;
    switch (args.subject) {
        case "this_child":
        case "current_schedule":
        case "current_enrollment":
            return args.sourceItemId?.trim() || null;
        case "selected_person":
            return args.personId?.trim() || args.sourceItemId?.trim() || null;
        case "household":
            return null;
        default:
            return args.sourceItemId?.trim() || null;
    }
}

export function resolveConfiguredOrDefaultIdentityFieldLink(args: {
    links: readonly FocusPanelCardLink[] | null | undefined;
    fromCard: FocusPanelCardKey;
    fieldRef: string;
    itemId?: string | null;
    authoredTarget?: IdentityFieldLinkTarget | null;
}): FocusPanelCardLink | null {
    const normalized = normalizeLinkFieldRef(args.fieldRef);
    const configured = resolveFocusPanelCardLinkForField(args.links, args.fromCard, normalized)
        ?? (args.itemId
            ? resolveFocusPanelCardLinkForField(args.links, args.fromCard, args.itemId.trim())
            : null);
    const authored = normalizeIdentityFieldLinkTarget(args.authoredTarget, normalized);
    if (configured) {
        return {
            ...configured,
            destinationOpen: configured.destinationOpen ?? authored?.open ?? "detail",
            destinationSubject:
                configured.destinationSubject ?? authored?.subject ?? "current_schedule",
        };
    }
    const contract = resolveIdentityFieldLinkContract(normalized);
    if (!contract.canOfferLinked || !contract.defaultTarget) return null;
    const target = authored ?? contract.defaultTarget;
    return {
        id: `default:${args.fromCard}:${normalized}`,
        fromCard: args.fromCard,
        toCard: target.toCard,
        fromFieldKey: normalized,
        label: contract.linkLabel,
        destinationOpen: target.open,
        destinationSubject: target.subject,
    };
}

/** Navigate to the linked destination card via Card Link history (records source for Back). */
export function navigateIdentityFieldLink(args: {
    coordination: FocusPanelCoordination | undefined;
    fromCard: FocusPanelCardKey;
    fieldRef: string;
    /** Source item id used when subject resolves to this child / schedule. */
    sourceItemId?: string | null;
    personId?: string | null;
    sourceFocus?: string | null;
    links?: readonly FocusPanelCardLink[] | null;
    authoredTarget?: IdentityFieldLinkTarget | null;
    nav?: FocusPanelCardLinkNavState;
    /** @deprecated Prefer sourceItemId — kept for call-site compatibility. */
    destinationFocus?: string | null;
    itemId?: string | null;
}): { ok: boolean; nav: FocusPanelCardLinkNavState; reason?: string } {
    const link = resolveConfiguredOrDefaultIdentityFieldLink({
        links: args.links,
        fromCard: args.fromCard,
        fieldRef: args.fieldRef,
        itemId: args.itemId ?? args.sourceItemId,
        authoredTarget: args.authoredTarget,
    });
    const nav = args.nav ?? createEmptyFocusPanelCardLinkNavState();
    if (!link) return { ok: false, nav, reason: "no_link" };

    if (args.coordination?.focusTargets && !args.coordination.focusTargets.has(link.toCard)) {
        return { ok: false, nav, reason: "destination_unavailable" };
    }

    const open = link.destinationOpen ?? "detail";
    const subject = (link.destinationSubject ?? "this_child") as IdentityLinkDestinationSubject;
    const destinationFocus =
        args.destinationFocus
        ?? resolveIdentityLinkDestinationFocus({
            subject,
            open,
            sourceItemId: args.sourceItemId ?? args.itemId,
            personId: args.personId,
        });

    return {
        ...navigateCardLinkWithHistory({
            coordination: args.coordination,
            link,
            destinationFocus,
            sourceFocus: args.sourceFocus ?? args.sourceItemId ?? null,
            nav,
        }),
    };
}
