import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CommercialConfigWorkspace } from "@/components/adminV2/commercial/CommercialConfigWorkspace";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import { isProgramsOwnedCommercialChapter } from "@/lib/commercial/commercialChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ chapter?: string | string[] }>;
};

export default async function SettingsCommercialPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.chapter;
    const chapter = Array.isArray(raw) ? raw[0] : raw;
    if (isProgramsOwnedCommercialChapter(chapter)) {
        redirect(organizationProgramsHref());
    }

    return (
        <Suspense
            fallback={
                <div className="flex h-64 items-center justify-center text-sm text-alloy-midnight/40">
                    Loading…
                </div>
            }
        >
            <CommercialConfigWorkspace />
        </Suspense>
    );
}
