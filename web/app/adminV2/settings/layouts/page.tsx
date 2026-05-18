import Link from "next/link";
import LayoutsSettingsHubClient from "./LayoutsSettingsHubClient";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return (
        <div className="w-full max-w-6xl space-y-4 pb-2">
            <header className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Drawer composition</p>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Record layouts</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    Choose a record type, then reorder drawer sections, show or hide sections, and rename workflow section
                    titles. Field labels and required rules are on{" "}
                    <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                        Fields
                    </Link>
                    ; catalog group names are on{" "}
                    <Link href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                        Field grouping
                    </Link>
                    .
                </p>
            </header>
            <LayoutsSettingsHubClient initialEntity={sp.entity} />
        </div>
    );
}
