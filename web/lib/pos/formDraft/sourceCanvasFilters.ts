/**
 * The filter vocabulary of the source-fidelity canvas.
 *
 * A filter here changes EMPHASIS on the form, not what the form is. Picking "Needs mapping" must leave
 * every heading, every label and every control exactly where it was and simply push the settled ones
 * back, because the whole point of the canvas is that the operator is always looking at their own
 * document. A filter that replaced the page with a list of five matching questions would undo that in
 * one click — so the decision is a pure predicate, and the canvas dims rather than removes.
 */

import type { FormViewItem, FormViewSection, MappingState } from "./buildOperatorFormView";

export type CanvasFilter = "all" | "mapped" | "needs" | "suggested" | "form_only";

export const CANVAS_FILTERS: ReadonlyArray<{ readonly id: CanvasFilter; readonly label: string }> = [
    { id: "all", label: "All" },
    { id: "mapped", label: "Mapped" },
    { id: "needs", label: "Needs mapping" },
    { id: "suggested", label: "Suggested" },
    { id: "form_only", label: "Form only" },
];

/** True when the field is one of the filter's subject, i.e. drawn at full strength. */
export function matchesCanvasFilter(state: MappingState, filter: CanvasFilter): boolean {
    switch (filter) {
        case "all":
            return true;
        case "mapped":
            return state === "known";
        case "needs":
            return state === "needs_review";
        case "suggested":
            return state === "suggested";
        case "form_only":
            // Derived answers are also "not going to the family as a question with a destination".
            return state === "form_only" || state === "derived";
    }
}

export type CanvasFilterCounts = {
    readonly all: number;
    readonly mapped: number;
    readonly needs: number;
    readonly suggested: number;
    readonly form_only: number;
};

/** Counts for the filter chips, including questions nested inside conditions and repeatable groups. */
export function canvasFilterCounts(sections: readonly FormViewSection[]): CanvasFilterCounts {
    let all = 0;
    let mapped = 0;
    let needs = 0;
    let suggested = 0;
    let formOnly = 0;
    const walk = (items: readonly FormViewItem[]): void => {
        for (const item of items) {
            if (item.kind === "question" || item.kind === "address") {
                all += 1;
                if (item.mapping === "known") mapped += 1;
                else if (item.mapping === "needs_review") needs += 1;
                else if (item.mapping === "suggested") suggested += 1;
                else formOnly += 1;
            }
            if (item.kind === "question") walk(item.dependents);
            if (item.kind === "repeat_group") walk(item.questions);
        }
    };
    for (const section of sections) walk(section.items);
    return { all, mapped, needs, suggested, form_only: formOnly };
}
