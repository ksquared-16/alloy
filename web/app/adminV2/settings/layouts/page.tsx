import Link from "next/link";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import LayoutsSettingsClient from "./LayoutsSettingsClient";

export const dynamic = "force-dynamic";

function RelatedLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className="block rounded-lg border border-alloy-forge/12 bg-white/50 px-3 py-2.5 text-sm shadow-sm hover:bg-white/75"
        >
            <div className="font-semibold text-alloy-midnight">{title}</div>
            <div className="mt-0.5 text-xs text-alloy-midnight/55">{children}</div>
        </Link>
    );
}

export default function AdminV2SettingsLayoutsPage() {
    return (
        <div className="w-full max-w-4xl space-y-5 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Record layouts</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    Configure how records appear in the drawer — section order, integrity checks, and previews. This is the primary
                    place to shape inquiry workflow sections; field labels and required rules live under{" "}
                    <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                        Fields
                    </Link>
                    .
                </p>
            </header>

            <LayoutsSettingsClient />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <RelatedLink href="/adminV2/settings/fields" title="Fields">
                    Labels, visibility, and required rules per record type.
                </RelatedLink>
                <RelatedLink href="/adminV2/settings/work-units" title="Work units & queues">
                    Queue tabs and lanes in the workspace.
                </RelatedLink>
            </div>

            <details className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] px-3 py-2 text-xs text-alloy-midnight/55">
                <summary className="cursor-pointer font-medium text-alloy-midnight/70">Advanced: section label catalog</summary>
                <p className="mt-2 leading-relaxed">
                    The{" "}
                    <Link href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                        section label catalog
                    </Link>{" "}
                    only names groups used on forms and some grids. It does not control drawer section order — use the editors above.
                </p>
            </details>
        </div>
    );
}
