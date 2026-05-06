import Link from "next/link";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import LayoutsSettingsClient from "./LayoutsSettingsClient";

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
                    <span className="font-medium text-alloy-midnight/70">Runtime drawer configuration</span> for admin record chrome. Preview
                    matches <code className="rounded bg-alloy-stone/10 px-1 text-[10px]">AdminEntityDrawer</code>. Safe section reordering for
                    opportunity <span className="font-mono text-[10px]">workflow_v1</span> is available below; field group labels live on{" "}
                    <Link href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                        Field grouping catalog
                    </Link>
                    .
                </p>
                <div className="mt-3 space-y-2 rounded-xl border border-alloy-forge/15 bg-white/70 p-3 text-xs leading-snug text-alloy-midnight/65">
                    <p>
                        <span className="font-semibold text-alloy-midnight/80">Runtime record drawer (including opportunity):</span>{" "}
                        Source of truth is <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">record_drawer_layouts</code>{" "}
                        (org override, surface <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">drawer</code>) resolving
                        to rows in <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">record_layouts</code>. The active
                        layout&apos;s <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">config_json</code> drives header,
                        sections, and field placement in the drawer.
                    </p>
                    <p>
                        <span className="font-semibold text-alloy-midnight/80">Workflow v1 inquiry drawer sections:</span> Come from that
                        effective <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">config_json</code> (org{" "}
                        <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">record_drawer_layouts</code> or global{" "}
                        <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">record_layouts</code>), including{" "}
                        <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">inquiry_workflow_sections</code> — not from the field grouping catalog alone.
                    </p>
                    <p>
                        <span className="font-semibold text-alloy-midnight/80">Field grouping catalog</span> (Settings → Field grouping catalog) only labels{" "}
                        <code className="rounded bg-alloy-stone/12 px-1 py-0.5 text-[10px]">field_definitions.section_key</code> — it does not define drawer section order or workflow virtuals.
                    </p>
                    <p className="text-[10px] text-alloy-midnight/45">
                        See <code className="rounded bg-alloy-stone/10 px-1">docs/execution/admin-settings-config-parity.md</code> in the repo.
                    </p>
                </div>
            </header>

            <LayoutsSettingsClient />

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Card href="/adminV2/settings/fields" title="Fields">
                    Field definitions by entity (keys, types, section_key). Feeds forms and many layout renderers.
                </Card>
                <Card href="/adminV2/settings/field-sections" title="Field grouping catalog">
                    section_key labels for fields — separate from runtime drawer layouts on this page.
                </Card>
                <Card href="/adminV2/settings/work-units" title="Work-unit queues">
                    Queue tabs and lane structure for workspace (separate from record_layouts).
                </Card>
                <Card href="/adminV2/settings/actions" title="Actions (placements)">
                    Registry placements (header / rail / section slots). Read-only inventory today.
                </Card>
            </div>
        </div>
    );
}
