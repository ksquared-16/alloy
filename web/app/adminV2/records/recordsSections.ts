/**
 * Records workspace product structure.
 *
 * Records is the DURABLE record-management home: who the people are, independent of whether any
 * queue is currently working them. It is a peer of Processing / Assignments / Roster, not a chapter
 * of Organization — Organization configures the business; Records is where you find a human.
 *
 *   Staff      people who work here      (Person + Employment)
 *   Children   children in the org       (the household member row)
 *
 * There is deliberately no People layer above these two. "People" would be a level that answers no
 * question an operator asks: a director looks for a teacher or for a child, never for "a person".
 *
 * There is no Guardians section yet, and no Studio. Records V1 only runs; it configures nothing, so
 * a Work | Studio switch with one mode in it would be furniture.
 */

export type RecordsSection = "staff" | "children";

export const RECORDS_SECTION_TABS: { key: RecordsSection; label: string }[] = [
    { key: "staff", label: "Staff" },
    { key: "children", label: "Children" },
];

/** Resolve a section from a deep link. Unknown values yield null rather than a default. */
export function resolveRecordsSection(raw: string | null | undefined): RecordsSection | null {
    if (!raw) return null;
    if (raw === "staff" || raw === "children") return raw;
    return null;
}
