import Link from "next/link";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

export const dynamic = "force-dynamic";

function Card({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className="block rounded-xl border border-alloy-forge/12 bg-white/60 px-4 py-3 shadow-sm hover:bg-white/80"
        >
            <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
            <div className="mt-1 text-xs text-alloy-midnight/60">{children}</div>
        </Link>
    );
}

export default function AdminV2SettingsLayoutsPage() {
    return (
        <div className="w-full max-w-4xl space-y-4 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Layouts</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Control plane for record layouts and drawer structure. Full editors come next.
                </p>
            </header>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Card href="/adminV2/settings/fields" title="Fields">
                    Field definitions by entity (drives drawer and forms).
                </Card>
                <Card href="/adminV2/settings/field-sections" title="Field sections">
                    Group/order fields; controls drawer sections.
                </Card>
                <Card href="/adminV2/settings/work-units" title="Work-unit queues">
                    Queue tabs/sections define work-unit lane structure.
                </Card>
                <Card href="/adminV2/settings/actions" title="Actions (placements)">
                    Header/section/rail placements determine where buttons render.
                </Card>
            </div>
        </div>
    );
}

