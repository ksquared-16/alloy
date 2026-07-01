/**
 * Template category inline-create helpers (Communications modal).
 */

/** Value to commit when operator confirms a new or first category. */
export function resolveTemplateCategoryCommitValue(args: {
    creating: boolean;
    draft: string;
    value: string;
}): string {
    return (args.creating ? args.draft : args.value).trim();
}
