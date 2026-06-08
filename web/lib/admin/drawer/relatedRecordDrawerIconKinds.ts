import type { LucideIcon } from "lucide-react";
import { Baby, BadgeCheck, Bot, Briefcase, Building2, User } from "lucide-react";

/** Drawer target kinds — shared glyph family with distinct record-type glyphs. */
export type RelatedRecordDrawerKind =
    | "person"
    | "child"
    | "opportunity"
    | "customer"
    | "associate"
    | "agent";

export const RELATED_RECORD_DRAWER_KIND_ICONS: Record<RelatedRecordDrawerKind, LucideIcon> = {
    person: User,
    child: Baby,
    opportunity: Briefcase,
    customer: Building2,
    associate: BadgeCheck,
    agent: Bot,
};

export function resolveRelatedRecordDrawerIcon(kind: RelatedRecordDrawerKind): LucideIcon {
    return RELATED_RECORD_DRAWER_KIND_ICONS[kind] ?? User;
}

export function relatedRecordDrawerDefaultTestId(kind: RelatedRecordDrawerKind): string {
    if (kind === "child") return "view-child-drawer-open";
    if (kind === "opportunity") return "view-opportunity-drawer-open";
    if (kind === "customer") return "view-customer-drawer-open";
    if (kind === "associate") return "view-associate-drawer-open";
    if (kind === "agent") return "view-agent-drawer-open";
    return "view-person-drawer-open";
}

export function relatedRecordDrawerA11yCopy(
    kind: RelatedRecordDrawerKind,
    displayName: string
): { title: string; ariaLabel: string } {
    switch (kind) {
        case "child":
            return { title: "View child", ariaLabel: `View child ${displayName}` };
        case "opportunity":
            return { title: "View opportunity", ariaLabel: `View opportunity for ${displayName}` };
        case "customer":
            return { title: "View customer", ariaLabel: `View customer ${displayName}` };
        case "associate":
            return { title: "View associate", ariaLabel: `View associate ${displayName}` };
        case "agent":
            return { title: "View agent", ariaLabel: `View agent ${displayName}` };
        case "person":
        default:
            return { title: "View person", ariaLabel: `View person for ${displayName}` };
    }
}
