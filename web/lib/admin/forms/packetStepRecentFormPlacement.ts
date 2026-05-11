export type StepDraftLike = { form_definition_id: string; step_label?: string; packet_item_id?: string };

/** Remove leading rows with no form selected; keep at least one row. */
export function trimLeadingEmptyStepRows<T extends StepDraftLike>(steps: readonly T[]): T[] {
    if (steps.length === 0) return [{ form_definition_id: "", step_label: "" } as T];
    const first = steps.findIndex((s) => s.form_definition_id.trim().length > 0);
    if (first === -1) return [{ form_definition_id: "", step_label: "" } as T];
    if (first === 0) return [...steps];
    return steps.slice(first).map((s) => ({ ...s, packet_item_id: undefined } as T));
}

/**
 * Recent-form chip: fill first empty row, else append. Clears leading blank rows after assign.
 */
export function applyRecentFormToSteps<T extends StepDraftLike>(steps: readonly T[], formId: string): T[] {
    const id = formId.trim();
    if (!id) return [...steps];
    const list = [...steps];
    const emptyIdx = list.findIndex((s) => !s.form_definition_id.trim());
    if (emptyIdx >= 0) {
        const cur = list[emptyIdx]!;
        list[emptyIdx] = { ...cur, form_definition_id: id, packet_item_id: undefined } as T;
    } else {
        list.push({ form_definition_id: id, step_label: "" } as T);
    }
    return trimLeadingEmptyStepRows(list);
}
