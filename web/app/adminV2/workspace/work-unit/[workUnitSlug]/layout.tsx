import WorkUnitSlugRouteHost from "@/components/admin/workspace/WorkUnitSlugRouteHost";

type LayoutProps = {
    children: React.ReactNode;
    params: Promise<{ workUnitSlug: string }>;
};

/** Stable shell for `/workspace/work-unit/:slug` and optional `:recordId` child segment. */
export default async function OperatorWorkUnitSlugLayout({ params }: LayoutProps) {
    const { workUnitSlug } = await params;
    return <WorkUnitSlugRouteHost workUnitSlug={workUnitSlug} />;
}
