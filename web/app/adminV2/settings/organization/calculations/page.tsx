import { redirect } from "next/navigation";
import { organizationCalculationLibraryHref } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string | undefined {
    const v = sp[key];
    if (Array.isArray(v)) return v[0];
    return v;
}

/**
 * Compatibility: `/organization/calculations` → Operational Intelligence Calculation Library.
 * Preserves definition id and library view/step query params.
 */
export default async function OrganizationCalculationsRedirectPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;
    const id = first(sp, "calculationId") || first(sp, "id") || null;
    const legacyView = first(sp, "view");
    const libraryView =
        legacyView === "new"
        || legacyView === "archived"
        || legacyView === "collection"
        || legacyView === "home"
        || legacyView === "browse" ?
            legacyView
        :   null;
    const step = first(sp, "step") ?? null;

    redirect(
        organizationCalculationLibraryHref({
            calculationId: id,
            libraryView,
            step,
        }),
    );
}
