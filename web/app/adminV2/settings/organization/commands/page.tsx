import { Suspense } from "react";
import CommandsConfigurationPage from "@/components/adminV2/settings/commands/CommandsConfigurationPage";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ commandKey?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0]?.trim() || null;
    return value?.trim() || null;
}

/** Canonical Organization Commands — `/organization/commands` (product: Commands). */
export default async function OrganizationCommandsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const initialCommandKey = firstParam(resolved.commandKey);
    return (
        <Suspense fallback={<p className="p-4 text-sm text-alloy-midnight/55">Loading Commands…</p>}>
            <CommandsConfigurationPage initialCommandKey={initialCommandKey} />
        </Suspense>
    );
}
