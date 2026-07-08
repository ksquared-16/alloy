/**
 * Lucide icon language for Settings → Data Model workspace.
 * Matches Configuration Mode stroke weight (1.75) and Bend Pine accents.
 */

import type { LucideIcon } from "lucide-react";
import {
    Baby,
    Building2,
    Calendar,
    CalendarClock,
    CaseSensitive,
    CheckSquare,
    ClipboardList,
    FileText,
    Focus,
    FormInput,
    GitBranch,
    Hash,
    LayoutGrid,
    LayoutTemplate,
    ListChecks,
    ListFilter,
    Mail,
    MapPin,
    Phone,
    Sigma,
    ToggleLeft,
    Type,
    Users,
    UserRound,
    Workflow,
    Layers,
    Link2,
    Sparkles,
} from "lucide-react";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export const DATA_MODEL_ICON_STROKE = 1.75;

export const DATA_MODEL_ENTITY_ICONS: Readonly<Record<SettingsHubEntityKey, LucideIcon>> = {
    person: UserRound,
    customer: Users,
    inquiry_child: Baby,
    opportunity: ClipboardList,
    location: MapPin,
};

export type DataModelUsageSurfaceId =
    | "forms"
    | "drawers"
    | "focus_panel"
    | "queue_row"
    | "business_process"
    | "documents";

export const DATA_MODEL_USAGE_ICONS: Readonly<Record<DataModelUsageSurfaceId, LucideIcon>> = {
    forms: FormInput,
    drawers: Layers,
    focus_panel: Focus,
    queue_row: LayoutTemplate,
    business_process: Workflow,
    documents: FileText,
};

export type DataModelBuilderId =
    | "surface_builder"
    | "forms_builder"
    | "business_process_builder"
    | "documents_packets"
    | "reports";

export const DATA_MODEL_BUILDER_ICONS: Readonly<Record<DataModelBuilderId, LucideIcon>> = {
    surface_builder: LayoutGrid,
    forms_builder: FormInput,
    business_process_builder: Workflow,
    documents_packets: FileText,
    reports: Building2,
};

export const DATA_MODEL_SECTION_ICONS = {
    relationships: Link2,
    fields: FormInput,
    computed: Sigma,
    usage: Sparkles,
    available: GitBranch,
} as const;

/** Shared field-type icon language for compact Data Model rows. */
export const DATA_MODEL_FIELD_TYPE_ICONS: Readonly<Record<string, LucideIcon>> = {
    text: Type,
    email: Mail,
    phone: Phone,
    number: Hash,
    date: Calendar,
    datetime: CalendarClock,
    boolean: ToggleLeft,
    select: ListFilter,
    multiselect: ListChecks,
    computed: Sigma,
    checkbox: CheckSquare,
    string: CaseSensitive,
};
