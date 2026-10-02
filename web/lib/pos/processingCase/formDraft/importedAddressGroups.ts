/**
 * Five postal lines are ONE address, and each line still has its own destination.
 *
 * A source prints "Address Line 1 / Address Line 2 / City / State / ZIP" as five separate rules on the
 * page, because that is how paper works. Shipping them as five independent top-level questions makes the
 * operator recognise an address from five unrelated rows, and makes the household's address five
 * unrelated facts. Collapsing them into a single text box would be worse: the components are exactly
 * what the canonical address record stores.
 *
 * So the group is the concept and the children are the components. `address_binding` on the group says
 * whose address it is; each child keeps its own `field_source`, so "City" maps to city and nothing maps
 * twice. Nothing is invented — a source with no Address Line 2 gets a group with no Address Line 2.
 */

import type { FormField, FormFieldSource } from "@/lib/forms/schema";

/** The postal components, in the order a person writes them. */
const COMPONENT_ORDER = ["address_line1", "address_line2", "city", "state", "postal_code"] as const;
type AddressComponent = (typeof COMPONENT_ORDER)[number];

const COMPONENT_SET = new Set<string>(COMPONENT_ORDER);

/**
 * Sensible widths so the rendered form reads the way an address is written — city wide, state and
 * postal code narrow beside it. The operator can change any of them in the shared inspector.
 */
const COMPONENT_WIDTH: Record<AddressComponent, "full" | "half" | "third" | "quarter"> = {
    address_line1: "full",
    address_line2: "full",
    city: "half",
    state: "quarter",
    postal_code: "quarter",
};

export function addressComponentOf(source: FormFieldSource | undefined): AddressComponent | null {
    const key = typeof source?.field_key === "string" ? source.field_key.trim().toLowerCase() : "";
    return key && COMPONENT_SET.has(key) ? (key as AddressComponent) : null;
}

/**
 * The operator's name for the whole thing, taken from the first line's own wording.
 *
 * "Home address line 1" becomes "Home address"; a bare "Address Line 1" becomes "Address". The label is
 * derived from the document rather than invented, so the group is still recognisably the operator's.
 */
const LABEL_TAIL = /\s*(address\s*)?(line\s*[12]|street.*|city|state|province|zip.*|postal.*)\s*$/i;

export function addressGroupLabel(firstLineLabel: string): string {
    const stripped = firstLineLabel.replace(LABEL_TAIL, "").trim();
    if (!stripped) return "Address";
    return /address$/i.test(stripped) ? stripped : `${stripped} address`;
}

/** Whose address it is, in the schema's own vocabulary. Absent when the lines disagree. */
function subjectOf(fields: readonly FormField[]): string | null {
    const subjects = new Set(
        fields.map((f) => (f.field_source?.entity_type ?? "").trim().toLowerCase()).filter(Boolean),
    );
    return subjects.size === 1 ? [...subjects][0]! : null;
}

export type AddressRun = {
    /** Indices into the section's field list that this address consumed, in order. */
    readonly indices: readonly number[];
    readonly group: FormField;
};

/**
 * Collapse a consecutive run of postal components into one address-bound group.
 *
 * Consecutive matters: two addresses on one page (home then mailing) are separated by a repeat of a
 * component, which starts the SECOND address rather than extending the first. A run of one is not an
 * address — a lone "City" is a question — so it is left exactly as it was.
 */
export function collapseAddressRun(fields: readonly FormField[], start: number): AddressRun | null {
    const run: FormField[] = [];
    const indices: number[] = [];
    const seen = new Set<AddressComponent>();

    for (let i = start; i < fields.length; i += 1) {
        const field = fields[i]!;
        const component = addressComponentOf(field.field_source);
        if (!component || seen.has(component)) break;
        seen.add(component);
        run.push(field);
        indices.push(i);
    }
    if (run.length < 2) return null;

    const first = run[0]!;
    const subject = subjectOf(run);
    const ordered = [...run].sort(
        (a, b) =>
            COMPONENT_ORDER.indexOf(addressComponentOf(a.field_source)!) -
            COMPONENT_ORDER.indexOf(addressComponentOf(b.field_source)!),
    );

    const group: FormField = {
        id: `address_${first.id}`,
        type: "group",
        label: addressGroupLabel(first.label),
        // One line required makes the address required: a street with an optional city is still an address.
        required: run.some((f) => Boolean(f.required)),
        fields: ordered.map((f) => {
            const component = addressComponentOf(f.field_source)!;
            const width = COMPONENT_WIDTH[component];
            return {
                ...f,
                ...(width !== "full" ? { layout_width: width } : {}),
            } as FormField;
        }),
        ...(subject ? { address_binding: { subject, role: "home" } } : {}),
    } as FormField;

    return { indices, group };
}
