import { redirect } from "next/navigation";
import { organizationProgramsChapterHref } from "@/lib/commercial/commercialChapterRoutes";

export const dynamic = "force-dynamic";

/** Compatibility — Tuition lives under Organization Programs. */
export default function SettingsCommercialTuitionPage() {
    redirect(organizationProgramsChapterHref("tuition"));
}
