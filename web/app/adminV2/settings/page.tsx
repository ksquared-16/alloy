import Link from "next/link";
import type { ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { settingsSurfacePrefix, type SettingsSurfaceMode } from "@/lib/adminV2/settingsSurfaceModes";

export const dynamic = "force-dynamic";

/** Shared tile height so every group row aligns visually. */
const TILE_MIN_H = "min-h-[5.5rem]";

type SettingsCardAccent = "organization" | "records" | "vocabulary";

function SettingsCard({
    href,
    title,
    children,
    accent = "vocabulary",
    surfaceMode,
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    accent?: SettingsCardAccent;
    /** When set, prefixes description with Editable / Read-only / Partial / Related hub. */
    surfaceMode?: SettingsSurfaceMode;
}) {
    const accentBorder =
        accent === "records"
            ? "border-l-alloy-pine/60"
            : accent === "organization"
              ? "border-l-slate-500/50"
              : "border-l-alloy-forge/25";
    const description = surfaceMode ? `${settingsSurfacePrefix(surfaceMode)}${children}` : children;
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className={[
                "group flex h-full min-h-0 flex-col justify-center rounded-lg border border-alloy-forge/12 bg-white/50 px-3 py-2.5 shadow-sm backdrop-blur-[1px] transition-colors hover:bg-white/75",
                TILE_MIN_H,
                "border-l-[3px]",
                accentBorder,
            ].join(" ")}
        >
            <div className="text-[length:var(--adminv2-settings-nav-card-title-size)] font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine">
                {title}
            </div>
            <div className="mt-0.5 line-clamp-3 text-[length:var(--adminv2-settings-nav-card-desc-size)] leading-snug text-alloy-midnight/55">
                {description}
            </div>
        </Link>
    );
}

/**
 * Desktop: always four equal columns so 2-card groups match Records tile width (no awkward stretch).
 * Mobile: two columns; placeholder cells are hidden.
 */
function SettingsTileGrid({ variant, children }: { variant: "four" | "two"; children: ReactNode }) {
    const placeholders =
        variant === "two" ? (
            <>
                <div className="hidden min-h-0 lg:block" aria-hidden />
                <div className="hidden min-h-0 lg:block" aria-hidden />
            </>
        ) : null;

    return (
        <div className="grid grid-cols-2 gap-2 lg:auto-rows-fr lg:grid-cols-4">
            {children}
            {placeholders}
        </div>
    );
}

function Group({
    label,
    accentClass,
    children,
}: {
    label: string;
    accentClass: string;
    children: React.ReactNode;
}) {
    return (
        <div className={`space-y-2 border-l-2 pl-3 ${accentClass}`}>
            <h3 className="text-[length:var(--adminv2-settings-section-eyebrow-size)] font-semibold tracking-[0.14em] text-alloy-midnight/50">
                {label}
            </h3>
            {children}
        </div>
    );
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className="w-full max-w-4xl space-y-5 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Tenant control plane for org configuration. Tiles are labeled{" "}
                    <span className="font-medium text-alloy-midnight/75">Editable</span>,{" "}
                    <span className="font-medium text-alloy-midnight/75">Partial</span>,{" "}
                    <span className="font-medium text-alloy-midnight/75">Read-only</span>, or{" "}
                    <span className="font-medium text-alloy-midnight/75">Related hub</span> so you know what you can change
                    here. Workspace execution stays on department surfaces — not in Settings.
                </p>
            </header>

            <div className="space-y-4">
                <Group label="Organization" accentClass="border-slate-400/40">
                    <SettingsTileGrid variant="four">
                        <SettingsCard
                            href="/adminV2/settings/communications"
                            title="Communications setup"
                            accent="organization"
                            surfaceMode="editable"
                        >
                            Provider bindings and safe label/status edits (no secrets in the UI).
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/departments"
                            title="Departments"
                            accent="organization"
                            surfaceMode="partial"
                        >
                            Department names and hierarchy; runtime metadata on each row is read-only in the editor.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/work-units"
                            title="Work units"
                            accent="organization"
                            surfaceMode="partial"
                        >
                            Edit validated queue lane JSON; work-unit metadata (attention, placement) is view-only in the modal.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/placement-priority"
                            title="Waitlist priority"
                            accent="organization"
                            surfaceMode="editable"
                        >
                            Opt-in placement priority presets on work units (waitlisted lanes).
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/kpis"
                            title="Workspace KPIs"
                            accent="organization"
                            surfaceMode="editable"
                        >
                            Visibility and order for registry metrics on AdminV2 workspace surfaces.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/users-roles"
                            title="Users & Roles"
                            accent="organization"
                            surfaceMode="editable"
                        >
                            Members, primary role, department/site data access, and permission grants.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Records" accentClass="border-alloy-pine/45">
                    <SettingsTileGrid variant="four">
                        <SettingsCard href="/adminV2/settings/fields" title="Fields" accent="records" surfaceMode="partial">
                            Field keys, types, visibility flags, and required flag — advanced requirement/editability policies
                            coming in a follow-up card.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/field-sections"
                            title="Field grouping catalog"
                            accent="records"
                            surfaceMode="editable"
                        >
                            Labels and order for field_definitions.section_key — not drawer section order (see Layouts).
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/statuses" title="Statuses" accent="records" surfaceMode="editable">
                            Status keys and labels per entity type.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/status-transition-rules"
                            title="Status transition rules"
                            accent="records"
                            surfaceMode="read_only"
                        >
                            Server guardrails for status changes — inventory only; changes via migrations/seeds today.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/attention-sla-rules"
                            title="Attention & SLA Rules"
                            accent="records"
                            surfaceMode="editable"
                        >
                            Needs Attention bucket lenses and threshold tuning on department metadata (resolver-backed at
                            runtime).
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/entity-labels"
                            title="Entity labels"
                            accent="records"
                            surfaceMode="editable"
                        >
                            Display names (Family, Inquiry, etc.).
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/tours/availability"
                            title="Tour availability"
                            accent="records"
                            surfaceMode="editable"
                        >
                            Recurring tour windows per location — powers drawer scheduling and public booking links.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Automation" accentClass="border-alloy-pine/35">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/workflows" title="Automations" accent="records" surfaceMode="editable">
                            Workflow definitions, runs, and steps — separate from the action button registry.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/actions" title="Actions" accent="records" surfaceMode="read_only">
                            Registry inventory (definitions + placements) — not a placement editor; some legacy buttons still
                            exist outside the registry.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Vocabulary & documents" accentClass="border-alloy-forge/25">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/settings/option-sets" title="Option sets" accent="vocabulary" surfaceMode="editable">
                            Select lists, booking, and pricing dimensions.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/documents/document-fields"
                            title="Document field definitions"
                            accent="vocabulary"
                            surfaceMode="editable"
                        >
                            Schema per document type.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Layouts & proposals" accentClass="border-alloy-pine/25">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/settings/layouts" title="Layouts" accent="records" surfaceMode="partial">
                            Drawer layout preview, layout integrity check, and opportunity workflow v1 section order — not a full
                            layout builder.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/config-proposals"
                            title="Config proposals"
                            accent="records"
                            surfaceMode="partial"
                        >
                            Review human-approved configuration proposals (limited apply catalog — not full config automation).
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Related product hubs" accentClass="border-alloy-forge/20">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/forms" title="Forms & packets" accent="records" surfaceMode="related_hub">
                            Form definitions, versions, public links, and enrollment packets — managed outside this Settings index.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/relationships" title="Relationships" accent="records" surfaceMode="editable">
                            Person and customer relationship types used across CRM surfaces.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>
            </div>

            <footer className="space-y-2 border-t border-alloy-forge/10 pt-2.5">
                <p className="text-[10px] leading-snug text-alloy-midnight/50">
                    Legacy admin URLs under <code className="rounded bg-alloy-stone/10 px-1">/admin/system/*</code> mirror many of
                    these editors. Prefer this Settings hub in AdminV2; legacy routes remain for compatibility.
                </p>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-alloy-midnight/35">Later (not in Settings)</p>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] text-alloy-midnight/40">
                    <span>Financial configuration</span>
                    <span>Full action placement editor</span>
                    <span>Drag-and-drop layout builder</span>
                </div>
            </footer>
        </div>
    );
}
