import Link from "next/link";

export const dynamic = "force-dynamic";

function Card({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="block rounded-xl border border-alloy-forge/12 bg-white/60 px-4 py-3 shadow-sm hover:bg-white/80"
        >
            <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
            <div className="mt-1 text-xs text-alloy-midnight/60">{children}</div>
        </Link>
    );
}

export default function AdminV2SettingsActionsPage() {
    return (
        <div className="w-full max-w-4xl space-y-4 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Actions</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Registry-driven actions (definitions + placements). Editors come next; for now this page is a control-plane index.
                </p>
            </header>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Card href="/adminV2/workflows" title="Automations">
                    Review workflow runs and triggers (often the destination for action-driven workflows).
                </Card>
                <Card href="/adminV2/settings/work-units" title="Work units">
                    Enrollment action placements are often scoped by work unit (right rail, queue row).
                </Card>
                <Card href="/adminV2/settings/statuses" title="Statuses">
                    Status dropdown options are driven by status definitions (used by action forms like “Update status”).
                </Card>
                <Card href="/adminV2/settings" title="Coming next">
                    Action definition + placement editors (labels, surfaces/slots, conditions).
                </Card>
            </div>

            <section className="rounded-xl border border-alloy-stone/15 bg-white/60 px-4 py-3 text-xs text-alloy-midnight/60">
                <div className="font-semibold text-alloy-midnight/70">Inventory</div>
                <div className="mt-1">
                    Use the inventory script for now:
                    <code className="ml-2 rounded bg-alloy-stone/10 px-2 py-1 text-[11px]">
                        npx tsx web/scripts/reportActionInventory.ts --org &lt;ORG_ID&gt;
                    </code>
                </div>
            </section>
        </div>
    );
}

