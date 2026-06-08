/** Unlinked household child row — no canonical `customer_members.person_id`. */
export const PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP =
    "Unlinked child record — link to a person profile to open.";

export const PERSON_DRAWER_UNLINKED_CHILD_LABEL = "Unlinked";

/**
 * Fix path: set `customer_members.person_id` to the existing person row for this child.
 * Do not create a duplicate person record.
 */
export const PERSON_DRAWER_UNLINKED_CHILD_FIX_HINT =
    "Link this customer member to an existing person record (customer_members.person_id).";
