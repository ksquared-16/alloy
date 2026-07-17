import Link from "next/link";
import { Building2, CheckCircle2, CircleHelp, MapPin, Network } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigObjectHeader,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    organizationConfigurationDomains,
    type ConfigurationDistributionMode,
    type ConfigurationPublicationMode,
} from "@/lib/configRuntime/organizationRuntime";

export type OrganizationConfigurationLocation = {
    id: string;
    label: string;
    locality: string | null;
    isActive: boolean;
};

function publicationLabel(mode: ConfigurationPublicationMode): string {
    return mode === "explicit" ? "Published before use" : "Live after confirmed save";
}

function distributionLabel(mode: ConfigurationDistributionMode): string {
    if (mode === "inherit") return "Organization value reaches locations";
    if (mode === "assignment") return "Organization chooses locations";
    if (mode === "apply") return "Published pattern can be applied";
    return "Configured where the object is owned";
}

export default function OrganizationConfigurationPage({
    organization,
    locations,
}: {
    organization: { id: string; name: string; status: string };
    locations: OrganizationConfigurationLocation[];
}) {
    const domains = organizationConfigurationDomains();
    const activeLocations = locations.filter((location) => location.isActive);
    const locationAwareDomains = domains.filter((domain) => domain.inheritance.path.includes("location"));
    const explicitPublicationDomains = domains.filter((domain) => domain.publicationMode === "explicit");
    const applyDomains = domains.filter((domain) => Boolean(domain.applyProviderKey));

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="organization-configuration-page">
            <ConfigurationContext
                title="Organization"
                subtitle="Own shared configuration, understand what locations inherit, and govern where differences are allowed."
                titleIcon={<Building2 className="h-5 w-5" strokeWidth={2} />}
                testId="organization-configuration-context"
            />

            <ConfigurationShell testId="organization-configuration-shell">
                <main className="min-w-0 space-y-3" data-testid="organization-configuration-workspace">
                    <section
                        className="process-config-setup-card px-5 py-4"
                        data-testid="organization-object-header"
                    >
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
                                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                                        {activeLocations.length} active{" "}
                                        {activeLocations.length === 1 ? "location" : "locations"}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <Network className="h-3.5 w-3.5" aria-hidden />
                                        {locationAwareDomains.length} location-aware configuration areas
                                    </span>
                                </div>
                            }
                        />
                    </section>

                    <ConfigWorkspaceCard compact testId="organization-runtime-summary">
                        <div className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-alloy-stone/20">
                            <section className="sm:pr-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    Shared configuration
                                </p>
                                <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                                    {domains.length} areas
                                </p>
                                <p className="config-typo-sublabel mt-1">
                                    Each has one configuration owner and one runtime consumer.
                                </p>
                            </section>
                            <section className="sm:px-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    Publication
                                </p>
                                <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                                    {explicitPublicationDomains.length} published area
                                </p>
                                <p className="config-typo-sublabel mt-1">
                                    Other areas become live only after their own confirmed save.
                                </p>
                            </section>
                            <section className="sm:pl-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    Apply to locations
                                </p>
                                <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                                    {applyDomains.length > 0 ? `${applyDomains.length} available` : "Not available yet"}
                                </p>
                                <p className="config-typo-sublabel mt-1">
                                    The action appears only for a published pattern with confirmed delivery.
                                </p>
                            </section>
                        </div>
                    </ConfigWorkspaceCard>

                    <ConfigWorkspaceCard
                        title="Shared configuration"
                        description="Every area declares who owns it, how it reaches locations, and which runtime consumes it."
                        compact
                        testId="organization-shared-configuration"
                    >
                        <ul className="divide-y divide-alloy-forge/10">
                            {domains.map((domain) => (
                                <li key={domain.key} className="py-3 first:pt-0 last:pb-0">
                                    <div className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/[0.08] text-alloy-bend-pine">
                                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <Link
                                                        href={domain.href}
                                                        className="text-sm font-semibold text-alloy-midnight underline-offset-2 hover:text-alloy-bend-pine hover:underline"
                                                    >
                                                        {domain.label}
                                                    </Link>
                                                    <p className="mt-0.5 text-[12px] text-alloy-midnight/55">
                                                        {domain.description}
                                                    </p>
                                                </div>
                                                <span className="rounded-full border border-alloy-forge/10 bg-alloy-stone/[0.08] px-2 py-1 text-[10px] font-semibold text-alloy-midnight/55">
                                                    {distributionLabel(domain.distributionMode)}
                                                </span>
                                            </div>
                                            <dl className="mt-2 grid gap-1 text-[11px] text-alloy-midnight/50 sm:grid-cols-3 sm:gap-3">
                                                <div>
                                                    <dt className="font-semibold text-alloy-midnight/65">Managed in</dt>
                                                    <dd>{domain.configurationOwner}</dd>
                                                </div>
                                                <div>
                                                    <dt className="font-semibold text-alloy-midnight/65">Used by</dt>
                                                    <dd>{domain.runtimeOwner}</dd>
                                                </div>
                                                <div>
                                                    <dt className="font-semibold text-alloy-midnight/65">Change behavior</dt>
                                                    <dd>{publicationLabel(domain.publicationMode)}</dd>
                                                </div>
                                            </dl>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </ConfigWorkspaceCard>

                    <ConfigWorkspaceCard
                        title="Locations"
                        description="Organization configuration can reach locations, but Location-owned objects stay authoritative in Locations."
                        compact
                        testId="organization-location-governance"
                    >
                        {locations.length === 0 ?
                            <div className="flex items-start gap-2.5 py-1">
                                <CircleHelp className="mt-0.5 h-4 w-4 text-alloy-midnight/35" aria-hidden />
                                <div>
                                    <p className="text-sm font-medium text-alloy-midnight">No locations yet</p>
                                    <p className="config-typo-sublabel mt-0.5">
                                        Add a location before assigning or applying organization configuration.
                                    </p>
                                    <Link
                                        href="/settings/locations"
                                        className="mt-2 inline-block text-xs font-semibold text-alloy-bend-pine"
                                    >
                                        Open Locations →
                                    </Link>
                                </div>
                            </div>
                        :   <ul className="divide-y divide-alloy-forge/10">
                                {locations.map((location) => (
                                    <li
                                        key={location.id}
                                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <div className="min-w-0">
                                            <Link
                                                href={`/settings/locations?locationId=${encodeURIComponent(location.id)}`}
                                                className="text-sm font-semibold text-alloy-midnight underline-offset-2 hover:text-alloy-bend-pine hover:underline"
                                            >
                                                {location.label}
                                            </Link>
                                            <p className="config-typo-sublabel mt-0.5">
                                                {[location.locality, location.isActive ? "Active" : "Inactive"]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-alloy-midnight/45">
                                            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                                            Configuration posture not assessed
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        }
                    </ConfigWorkspaceCard>

                    <ConfigWorkspaceCard
                        title="Distribution guardrail"
                        description="Shared values flow by inheritance or assignment. Copying is a separate, explicit operation."
                        compact
                        testId="organization-distribution-guardrail"
                    >
                        <p className="text-sm leading-relaxed text-alloy-midnight/70">
                            Apply to locations stays hidden until an owning area publishes a reusable pattern and
                            can durably confirm every selected location. A retry uses the same delivery identity,
                            and success requires an authoritative result for every target.
                        </p>
                    </ConfigWorkspaceCard>
                </main>
            </ConfigurationShell>
        </div>
    );
}
