import Link from "next/link";
import {
    ArrowDown,
    Banknote,
    BarChart3,
    Building2,
    Database,
    GitBranch,
    LibraryBig,
    MapPin,
    MessagesSquare,
    PanelsTopLeft,
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
    "programs-locations": LibraryBig,
    financials: Banknote,
    access: ShieldCheck,
    communications: MessagesSquare,
    "data-model": Database,
    "business-processes": Workflow,
    surfaces: PanelsTopLeft,
    automation: GitBranch,
    intelligence: BarChart3,
};

function displayStatus(status: string): string {
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

/**
 * **W49-F2.** `visibleDomainKeys` is required and has no default. A default of "every domain"
 * would restore the fail-open by omission: a caller that forgot to pass it would render the full
 * grid and nothing would report it. The list is decided at the route boundary by
 * `isOrganizationDomainVisible`, from the surface declaration — this component filters, it does
 * not judge, and the summary counts what it actually drew rather than what the org has.
 */
export default function OrganizationConfigurationPage({
    organization,
    locations,
    visibleDomainKeys,
}: {
    organization: { id: string; name: string; status: string };
    locations: OrganizationConfigurationLocation[];
    visibleDomainKeys: readonly string[];
}) {
    const domains = organizationConfigurationDomains().filter((domain) =>
        visibleDomainKeys.includes(domain.key),
    );
    const activeLocations = locations.filter((location) => location.isActive);
    const publishRequiredCount = domains.filter(
        (domain) => domain.publication.status === "publish_required",
    ).length;
    const hasAttention = domains.some((domain) => domain.health.state === "attention");
    const hasUnassessedHealth = domains.some((domain) => domain.health.state === "not_assessed");
    const healthLabel =
        hasAttention ? "Needs attention"
        : hasUnassessedHealth ? "Not assessed"
        : "Ready";

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-configuration-page">
            <ConfigurationContext
                title="Organization Configuration"
                subtitle={`${organization.name} • ${displayStatus(organization.status)}`}
                titleIcon={<Building2 className="h-5 w-5" strokeWidth={2} />}
                testId="organization-configuration-context"
            >
                <ul
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/52"
                    aria-label="Organization configuration summary"
                    data-testid="organization-configuration-summary"
                >
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{domains.length}</strong>{" "}
                        Configuration Domains
                    </li>
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{activeLocations.length}</strong>{" "}
                        Consuming Locations
                    </li>
                    <li>
                        <strong className="font-semibold text-alloy-midnight">{publishRequiredCount}</strong>{" "}
                        Publish Required
                    </li>
                    <li>
                        Health <strong className="font-semibold text-alloy-midnight">{healthLabel}</strong>
                    </li>
                </ul>
            </ConfigurationContext>

            <ConfigurationShell testId="organization-configuration-shell">
                <main
                    className="mx-auto min-w-0 max-w-[1480px] space-y-2.5 pb-3"
                    data-testid="organization-configuration-workspace"
                >
                    <section data-testid="organization-configuration-domains">
                        <h2 className="config-typo-workspace-title mb-1.5">Configuration Domains</h2>
                        <div className="grid auto-rows-fr items-stretch gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {domains.map((domain) => {
                                const Icon = DOMAIN_ICONS[domain.icon];
                                return (
                                    <ConfigDomainCard
                                        key={domain.key}
                                        domain={domain}
                                        icon={<Icon className="h-4 w-4" strokeWidth={1.9} />}
                                        testId={`organization-domain-${domain.key}`}
                                    />
                                );
                            })}
                        </div>
                    </section>

                    <div className="grid items-stretch gap-2.5 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
                        <ConfigWorkspaceCard
                            title="Consumers"
                            compact
                            className="h-full"
                            testId="organization-consumers"
                        >
                            {locations.length === 0 ?
                                <div className="py-1">
                                    <p className="text-sm font-semibold text-alloy-midnight">No Locations yet</p>
                                    <p className="mt-1 max-w-lg text-xs leading-5 text-alloy-midnight/55">
                                        Locations consume published Organization configuration. Add a Location before assigning Programs or other publishable configuration.
                                    </p>
                                    <Link
                                        href="/organization/locations"
                                        className="mt-1.5 inline-block text-[11px] font-semibold text-[#007d68]"
                                    >
                                        Open Locations →
                                    </Link>
                                </div>
                            :   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {locations.map((location) => (
                                        <article
                                            key={location.id}
                                            className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-2"
                                            data-config-object="consumer"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <Link
                                                    href={`/organization/locations?locationId=${encodeURIComponent(location.id)}`}
                                                    className="truncate text-[12px] font-semibold text-alloy-midnight underline-offset-2 hover:text-alloy-bend-pine hover:underline"
                                                >
                                                    {location.label}
                                                </Link>
                                                <span
                                                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                                                        location.isActive ?
                                                            "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-[#007d68]"
                                                        :   "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/45"
                                                    }`}
                                                >
                                                    {location.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                            <p className="mt-1 truncate text-[10px] text-alloy-midnight/48">
                                                {location.locality ? `${location.locality} · ` : ""}
                                                Consumption posture not assessed
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            }
                        </ConfigWorkspaceCard>

                        <ConfigWorkspaceCard
                            title="Distribution"
                            compact
                            className="h-full"
                            testId="organization-distribution"
                        >
                            <ol className="space-y-1 text-[11px]">
                                <li className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-1.5 font-semibold text-alloy-midnight">
                                    Organization
                                </li>
                                <li className="flex h-3 items-center pl-3 text-alloy-bend-pine" aria-hidden>
                                    <ArrowDown className="h-3 w-3" />
                                </li>
                                <li className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-1.5 font-semibold text-alloy-midnight">
                                    Locations
                                </li>
                                <li className="flex h-3 items-center pl-3 text-alloy-bend-pine" aria-hidden>
                                    <ArrowDown className="h-3 w-3" />
                                </li>
                                <li className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-1.5 font-semibold text-alloy-midnight">
                                    Resources &amp; Runtime
                                </li>
                            </ol>
                            <p className="mt-2 border-t border-alloy-stone/20 pt-2 text-[10px] text-alloy-midnight/45">
                                Apply appears only after authoritative publication and delivery.
                            </p>
                        </ConfigWorkspaceCard>
                    </div>
                </main>
            </ConfigurationShell>
        </div>
    );
}
