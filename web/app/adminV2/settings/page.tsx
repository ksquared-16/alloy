import Link from "next/link";
import type { ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

export const dynamic = "force-dynamic";

/** Shared tile height so every group row aligns visually. */
const TILE_MIN_H = "min-h-[5.5rem]";

type SettingsCardAccent = "organization" | "records" | "vocabulary";

function SettingsCard({
    href,
    title,
    children,
    accent = "vocabulary",
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    accent?: SettingsCardAccent;
}) {
    const accentBorder =
        accent === "records"
            ? "border-l-alloy-pine/60"
            : accent === "organization"
              ? "border-l-slate-500/50"
              : "border-l-alloy-forge/25";
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
            <div
                className="text-[length:var(--adminv2-settings-nav-card-title-size)] font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine"
            >
                {title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[length:var(--adminv2-settings-nav-card-desc-size)] leading-snug text-alloy-midnight/55">
                {children}
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
                    Tenant control plane — workspace links here; editors stay in Settings, not on department surfaces.
                </p>
            </header>

            <div className="space-y-4">
                <Group label="Organization" accentClass="border-slate-400/40">
                    <SettingsTileGrid variant="four">
                        <SettingsCard href="/adminV2/settings/communications" title="Communications setup" accent="organization">
                            Email/SMS bindings, outbound readiness, and safe label/status edits (no secrets).
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/departments" title="Departments" accent="organization">
                            Departments and workspace hierarchy.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/work-units" title="Work units" accent="organization">
                            Queues and work-unit definitions.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/kpis" title="Workspace KPIs" accent="organization">
                            Visibility and order for registry metrics on AdminV2 workspace surfaces.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/user-access" title="User access scope" accent="organization">
                            Per-user department and site visibility (CRM), plus role key assignment.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Records" accentClass="border-alloy-pine/45">
                    <SettingsTileGrid variant="four">
                        <SettingsCard href="/adminV2/settings/fields" title="Fields" accent="records">
                            Field definitions by entity for forms and drawers.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/field-sections" title="Field sections" accent="records">
                            Group and order fields on layouts.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/statuses" title="Statuses" accent="records">
                            Status keys and labels per entity type.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/status-transition-rules" title="Status transition rules" accent="records">
                            Guardrails that block invalid status changes (server-enforced).
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/attention-sla-rules" title="Attention & SLA Rules" accent="records">
                            Coming next — define deadlines/SLA rules that feed Needs Attention.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/entity-labels" title="Entity labels" accent="records">
                            Display names (Family, Inquiry, etc.).
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/relationships" title="Relationships" accent="records">
                            Customer ↔ person roles and person ↔ person relationship types.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Automation" accentClass="border-alloy-pine/35">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/workflows" title="Automations" accent="records">
                            Review runs, triggers, and steps — AdminV2 control panel.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/actions" title="Actions" accent="records">
                            Registry-backed buttons: definitions, placements, conditions, and “coming next” placeholders.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Vocabulary & documents" accentClass="border-alloy-forge/25">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/settings/option-sets" title="Option sets" accent="vocabulary">
                            Select lists, booking, and pricing dimensions.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/documents/document-fields"
                            title="Document field definitions"
                            accent="vocabulary"
                        >
                            Schema per document type.
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>

                <Group label="Layouts" accentClass="border-alloy-pine/25">
                    <SettingsTileGrid variant="two">
                        <SettingsCard href="/adminV2/settings/layouts" title="Layouts" accent="records">
                            Record layouts, drawer sections, and header/section action placement surfaces (read-only for now).
                        </SettingsCard>
                    </SettingsTileGrid>
                </Group>
            </div>

            <footer className="border-t border-alloy-forge/10 pt-2.5">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-alloy-midnight/35">Later</p>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] text-alloy-midnight/40">
                    <span>Automation</span>
                    <span>Financial configuration</span>
                </div>
            </footer>
        </div>
    );
}
