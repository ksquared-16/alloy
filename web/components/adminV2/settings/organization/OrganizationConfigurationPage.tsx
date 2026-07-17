import Link from "next/link";
import {
    BarChart3,
    Building2,
    Database,
    GitBranch,
    LibraryBig,
    MapPin,
    MessagesSquare,
    PanelsTopLeft,
    RadioTower,
    ShieldCheck,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigDomainCard,
    ConfigObjectHeader,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    organizationConfigurationDomains,
    type OrganizationConfigurationDomainIcon,
} from "@/lib/configRuntime/organizationRuntime";

export type OrganizationConfigurationLocation = {
    id: string;
    label: string;
    locality: string | null;
    isActive: boolean;
};

const DOMAIN_ICONS: Record<OrganizationConfigurationDomainIcon, LucideIcon> = {
    locations: MapPin,
    programs: LibraryBig,
    access: ShieldCheck,
    communications: MessagesSquare,
    "data-model": Database,
    "business-processes": Workflow,
    surfaces: PanelsTopLeft,
    automation: GitBranch,
    intelligence: BarChart3,
};

export default function OrganizationConfigurationPage({
    organization,
    locations,
}: {
    organization: { id: string; name: string; status: string };
    locations: OrganizationConfigurationLocation[];
}) {
    const domains = organizationConfigurationDomains();
    const activeLocations = locations.filter((location) => location.isActive);
    const unassessedDomains = domains.filter((domain) => domain.health.state === "not_assessed");
    const declaredPublicationDomains = domains.filter(
        (domain) => domain.publication.status !== "not_assessed",
    );
    const availableApplyDomains = domains.filter((domain) => Boolean(domain.applyProviderKey));

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-configuration-page">
            <ConfigurationContext
                title="Organization Configuration"
                subtitle="Publish reusable configuration once. Let Locations consume it with clear ownership, inheritance, and controlled differences."
                titleIcon={<Building2 className="h-5 w-5" strokeWidth={2} />}
                testId="organization-configuration-context"
            />

            <ConfigurationShell testId="organization-configuration-shell">
                <main
                    className="mx-auto min-w-0 max-w-[1480px] space-y-4 pb-6"
                    data-testid="organization-configuration-workspace"
                >
                    <section
                        className="overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
                        data-testid="organization-hero"
                    >
                        <div className="border-l-[3px] border-alloy-bend-pine px-5 py-4">
                            <ConfigObjectHeader
                                size="hero"
                                name={organization.name}
                                status={{
                                    label: organization.status === "active" ? "Active" : organization.status,
                                    tone: organization.status === "active" ? "active" : "inactive",
                                }}
                                breadcrumb={
                                    <nav
                                        className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/45"
                                        aria-label="Organization ownership"
                                    >
                                        <Link
                                            href="/settings"
                                            className="font-medium underline-offset-2 hover:text-alloy-midnight/70 hover:underline"
                                        >
                                            Settings
                                        </Link>
                                        <span aria-hidden="true">›</span>
                                        <span className="font-semibold text-alloy-midnight/65">Organization</span>
                                    </nav>
                                }
                                factsContent={
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-alloy-midnight/50">
                                        <span className="inline-flex items-center gap-1.5">
                                            <RadioTower className="h-3.5 w-3.5" aria-hidden />
                                            Publisher for {domains.length} configuration domains
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                                            {activeLocations.length} active{" "}
                                            {activeLocations.length === 1 ? "consumer" : "consumers"}
                                        </span>
                                    </div>
                                }
                            />
                        </div>
                    </section>

                    <ConfigWorkspaceCard
                        title="Configuration health"
                        description="One composed view of runtime ownership and domain-reported evidence."
                        compact
                        testId="organization-configuration-health"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.09] text-[#007d68]">
                                    <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-alloy-midnight">
                                        Runtime ownership is defined
                                    </p>
                                    <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-alloy-midnight/55">
                                        Every domain has one publisher, an operator home, named consumers, and an
                                        explicit distribution posture. Domain health is never inferred without
                                        authoritative evidence.
                                    </p>
                                </div>
                            </div>
                            <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 border-t border-alloy-stone/20 pt-3 text-[11px] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                                <div>
                                    <dt className="text-alloy-midnight/42">Publication contract</dt>
                                    <dd className="mt-0.5 font-semibold text-alloy-midnight">
                                        {declaredPublicationDomains.length} of {domains.length} defined
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-alloy-midnight/42">Not assessed</dt>
                                    <dd className="mt-0.5 font-semibold text-alloy-midnight">
                                        {unassessedDomains.length} domain health signals
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </ConfigWorkspaceCard>

                    <section data-testid="organization-configuration-domains">
                        <div className="mb-2.5">
                            <h2 className="config-typo-workspace-title">Configuration domains</h2>
                            <p className="config-typo-sublabel mt-0.5">
                                Organization-owned runtime objects—not a list of settings.
                            </p>
                        </div>
                        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {domains.map((domain) => {
                                const Icon = DOMAIN_ICONS[domain.icon];
                                return (
                                    <ConfigDomainCard
                                        key={domain.key}
                                        domain={domain}
                                        icon={<Icon className="h-4.5 w-4.5" strokeWidth={1.9} />}
                                        testId={`organization-domain-${domain.key}`}
                                    />
                                );
                            })}
                        </div>
                    </section>

                    <ConfigWorkspaceCard
                        title="Consumers"
                        description="Locations consume published organization configuration while retaining authority over local delivery."
                        compact
                        testId="organization-consumers"
                    >
                        {locations.length === 0 ?
                            <div className="py-2">
                                <p className="text-sm font-semibold text-alloy-midnight">No Locations yet</p>
                                <p className="config-typo-sublabel mt-1">
                                    Add a Location before assigning or applying organization configuration.
                                </p>
                                <Link
                                    href="/settings/locations"
                                    className="mt-2 inline-block text-xs font-semibold text-[#007d68]"
                                >
                                    Open Locations →
                                </Link>
                            </div>
                        :   <div className="grid items-start gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                                {locations.map((location) => (
                                    <article
                                        key={location.id}
                                        className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.025] p-3"
                                        data-config-object="consumer"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/[0.08] text-[#007d68]">
                                                <MapPin className="h-4 w-4" aria-hidden />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <Link
                                                        href={`/settings/locations?locationId=${encodeURIComponent(location.id)}`}
                                                        className="truncate text-sm font-semibold text-alloy-midnight underline-offset-2 hover:text-alloy-bend-pine hover:underline"
                                                    >
                                                        {location.label}
                                                    </Link>
                                                    <span
                                                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                                                            location.isActive ?
                                                                "bg-alloy-bend-pine"
                                                            :   "bg-alloy-midnight/25"
                                                        }`}
                                                        aria-label={location.isActive ? "Active" : "Inactive"}
                                                    />
                                                </div>
                                                <p className="config-typo-sublabel mt-0.5">
                                                    {location.locality ?? "Location consumer"}
                                                </p>
                                                <p className="mt-2 text-[11px] leading-snug text-alloy-midnight/55">
                                                    Consumes organization configuration. Local override posture is
                                                    not assessed until each domain reports evidence.
                                                </p>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        }
                    </ConfigWorkspaceCard>

                    <ConfigWorkspaceCard
                        title="Distribution"
                        description="Publishing, inheritance, assignment, and Apply are distinct runtime behaviors."
                        compact
                        testId="organization-distribution"
                    >
                        <ol className="grid gap-0 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
                            <li className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.025] p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/38">
                                    1 · Publish
                                </p>
                                <p className="mt-1 text-sm font-semibold text-alloy-midnight">Organization</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/52">
                                    Owns reusable identity, defaults, requirements, and published revisions.
                                </p>
                            </li>
                            <li className="flex items-center justify-center py-1 text-alloy-bend-pine md:px-2" aria-hidden>
                                <span className="rotate-90 md:rotate-0">→</span>
                            </li>
                            <li className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.025] p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/38">
                                    2 · Consume
                                </p>
                                <p className="mt-1 text-sm font-semibold text-alloy-midnight">Locations</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/52">
                                    Inherit shared values or choose availability without redefining the source object.
                                </p>
                            </li>
                            <li className="flex items-center justify-center py-1 text-alloy-bend-pine md:px-2" aria-hidden>
                                <span className="rotate-90 md:rotate-0">→</span>
                            </li>
                            <li className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.025] p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/38">
                                    3 · Deliver
                                </p>
                                <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                                    Resources and runtime
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/52">
                                    Rooms or other delivery resources own capacity. Runtime owns operational truth.
                                </p>
                            </li>
                        </ol>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-alloy-stone/20 pt-3">
                            <p className="text-[11px] text-alloy-midnight/52">
                                Apply to Locations appears only for a published pattern with authoritative,
                                auditable delivery.
                            </p>
                            <span className="rounded-full border border-alloy-forge/10 bg-alloy-stone/[0.08] px-2 py-1 text-[10px] font-semibold text-alloy-midnight/50">
                                {availableApplyDomains.length > 0 ?
                                    `${availableApplyDomains.length} Apply flows available`
                                :   "Apply not available yet"}
                            </span>
                        </div>
                    </ConfigWorkspaceCard>
                </main>
            </ConfigurationShell>
        </div>
    );
}
