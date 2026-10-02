/**
 * The one shared shape between "what an operator chose" and "what gets saved".
 *
 * It lives in its own module so the create-field translator does not have to import the save-payload
 * builder — a type-only dependency in one direction, which keeps a client component from pulling the
 * whole save path into its bundle.
 */
export type MappingChoice = {
    readonly id: string;
    readonly label: string;
    /** Absent means "keep it with the form" — collected as evidence, no canonical destination. */
    readonly destination: { readonly entity_type: string; readonly field_key: string } | null;
};
