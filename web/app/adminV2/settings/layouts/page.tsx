import LayoutsSettingsPageShell from "@/components/adminV2/settings/LayoutsSettingsPageShell";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

/**
 * AdminV2 Settings → Layouts.
 *
 * Primary surface: Layout Gallery (surface registry + entity_layouts).
 * Experience Builder studio opens full-screen when `?editor=1&layout={id}`.
 */
export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return <LayoutsSettingsPageShell initialEntityType={sp.entity} />;
}
