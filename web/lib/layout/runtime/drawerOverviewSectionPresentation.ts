/**
 * Drawer overview section chrome — icons and presentation helpers (Lead / Person / Child).
 *
 * Doctrine: `docs/system/typography-and-presentation-doctrine.md`
 */

import type { LucideIcon } from "lucide-react";
import {
    Activity,
    Baby,
    FileText,
    GraduationCap,
    Link2,
    MessageSquare,
    Users,
} from "lucide-react";
import {
    CHILD_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/childOverviewComposition";
import {
    LEAD_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    PERSON_COMPOSITION_SECTION_EYEBROWS,
} from "@/lib/layout/runtime/personOverviewComposition";

const SECTION_ICONS: Record<string, LucideIcon> = {
    household_contact: Users,
    household_relationships: Users,
    family_relationships: Users,
    children_enrollment: GraduationCap,
    connected_children: Baby,
    program_enrollment: GraduationCap,
    activity: Activity,
    recent_activity: Activity,
    notes_communication: MessageSquare,
    documents: FileText,
    lead_source: Link2,
    contact_information: Users,
    schedule_attendance: Activity,
};

const SECTION_EYEBROWS: Record<string, string> = {
    ...LEAD_COMPOSITION_SECTION_EYEBROWS,
    ...PERSON_COMPOSITION_SECTION_EYEBROWS,
    ...CHILD_COMPOSITION_SECTION_EYEBROWS,
};

export function resolveDrawerOverviewSectionIcon(sectionKey: string): LucideIcon {
    return SECTION_ICONS[sectionKey] ?? Activity;
}

export function resolveDrawerOverviewSectionEyebrow(sectionKey: string): string | null {
    return SECTION_EYEBROWS[sectionKey] ?? null;
}

export function drawerOverviewSectionIsCenterpiece(sectionKey: string): boolean {
    return (
        sectionKey === "children_enrollment"
        || sectionKey === "connected_children"
        || sectionKey === "program_enrollment"
    );
}
