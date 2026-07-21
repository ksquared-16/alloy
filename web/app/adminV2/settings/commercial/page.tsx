import { redirect } from "next/navigation";
import { commercialEntryToProgramsHref } from "@/lib/commercial/commercialChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ chapter?: string | string[] }>;
};

/**
 * Compatibility only — Commercial is no longer product IA.
 * Every entry soft-lands on Organization Programs (+ optional chapter).
 */
export default async function SettingsCommercialPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.chapter;
    const chapter = Array.isArray(raw) ? raw[0] : raw;
    redirect(commercialEntryToProgramsHref(chapter));
}
