/**
 * Resolve identity field icons — explicit placement override → catalog → none.
 */

import type { NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

const CATALOG_ICON_BY_FIELD: Record<string, string> = {
    "person.phone": "phone",
    "person.email": "mail",
    "child.date_of_birth": "cake",
    "child.dob_age": "cake",
    "child.age": "cake",
    "inquiry_child.program": "graduation-cap",
    "child.room": "door-open",
    "inquiry_child.schedule_type": "calendar-clock",
    "child.start_date": "calendar-days",
    "employee.email": "mail",
    "employee.phone": "phone",
    "employee.title": "badge-check",
    "employee.department": "building",
};

export function resolveIdentityFieldIcon(args: {
    group: NestedSurfaceGroupConfig;
    fieldRef: string;
    catalogField?: AvailableField | null;
}): string | undefined {
    const explicit = args.group.fieldIcons?.[args.fieldRef]?.trim();
    if (explicit) return explicit;
    const placementIcon = args.group.fieldPlacements?.find((row) => row.fieldRef === args.fieldRef)?.icon?.trim();
    if (placementIcon) return placementIcon;
    return CATALOG_ICON_BY_FIELD[args.fieldRef];
}
