import type { FieldDef } from "@/app/api/admin/field-definitions/route";

/** Stable admin list order: section_key, then sort_order, then field_key. */
export function sortFieldDefinitionsForAdminList(items: FieldDef[]): FieldDef[] {
    return [...items].sort((a, b) => {
        const skA = (a.section_key ?? "").toLowerCase();
        const skB = (b.section_key ?? "").toLowerCase();
        if (skA !== skB) return skA.localeCompare(skB);
        const oa = a.sort_order ?? 0;
        const ob = b.sort_order ?? 0;
        if (oa !== ob) return oa - ob;
        return a.field_key.localeCompare(b.field_key);
    });
}
