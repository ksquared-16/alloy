import { redirect } from "next/navigation";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ entity?: string | string[]; tab?: string | string[] }>;
};

/** Compatibility: `/settings/fields` → Data Model Fields category. */
export default async function AdminV2SettingsFieldsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const entity = Array.isArray(resolved.entity) ? resolved.entity[0] : resolved.entity;
    const tab = Array.isArray(resolved.tab) ? resolved.tab[0] : resolved.tab;
    redirect(
        dataModelSectionHref("fields", {
            entity: typeof entity === "string" ? entity : null,
            tab: typeof tab === "string" ? tab : null,
        }),
    );
}
