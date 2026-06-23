/**
 * Template category option helpers — derived from templates + in-session edits.
 * No separate category table; categories are strings on communication templates.
 */

export type TemplateCategoryCarrier = { category?: string | null };

/** Unique sorted categories from loaded templates. */
export function collectTemplateCategories(templates: ReadonlyArray<TemplateCategoryCarrier>): string[] {
    const set = new Set<string>();
    for (const t of templates) {
        const c = (t.category ?? "").trim();
        if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

/** Merge template-derived categories with session additions, minus session removals. */
export function mergeTemplateCategoryOptions(
    fromTemplates: ReadonlyArray<string>,
    extraCategories: ReadonlyArray<string>,
    removedCategories: ReadonlyArray<string> = []
): string[] {
    const removed = new Set(removedCategories.map((r) => r.trim()).filter(Boolean));
    const set = new Set<string>();
    for (const c of [...fromTemplates, ...extraCategories]) {
        const trimmed = c.trim();
        if (trimmed && !removed.has(trimmed)) set.add(trimmed);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

export function countTemplatesInCategory(
    templates: ReadonlyArray<TemplateCategoryCarrier>,
    category: string
): number {
    const key = category.trim();
    if (!key) return 0;
    return templates.filter((t) => (t.category ?? "").trim() === key).length;
}

export type TemplateCategoryRemoveCheck =
    | { ok: true }
    | { ok: false; reason: string };

/** Remove is allowed only when no saved template uses the category. */
export function canRemoveTemplateCategory(
    templates: ReadonlyArray<TemplateCategoryCarrier>,
    category: string
): TemplateCategoryRemoveCheck {
    const usage = countTemplatesInCategory(templates, category);
    if (usage > 0) {
        return {
            ok: false,
            reason: `Used by ${usage} template${usage === 1 ? "" : "s"}. Rename those templates first.`,
        };
    }
    return { ok: true };
}

/** Normalize a category label for create/rename commits. */
export function normalizeTemplateCategoryLabel(raw: string): string {
    return raw.trim().replace(/\s+/g, " ");
}
