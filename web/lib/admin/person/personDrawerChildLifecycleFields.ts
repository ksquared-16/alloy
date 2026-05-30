/** Child lifecycle date fields stored via field_definitions / field_values on person. */

export const PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY = "enrollment_date";
export const PERSON_DRAWER_CHILD_START_DATE_KEY = "start_date";

export function personDrawerChildDateIsoFromRecord(
    record: Record<string, unknown>,
    fieldKey: string
): string {
    const raw = record[fieldKey];
    if (raw == null || String(raw).trim() === "") return "";
    return String(raw).trim().slice(0, 10);
}
