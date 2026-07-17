import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, CircleHelp, RadioTower } from "lucide-react";
import type { ReactNode } from "react";
import type {
    ConfigurationHealthState,
    ConfigurationPublicationStatus,
    OrganizationConfigurationDomain,
} from "@/lib/configRuntime/organizationRuntime";

function stateTone(state: ConfigurationPublicationStatus | ConfigurationHealthState): string {
    if (state === "live_on_save" || state === "published" || state === "ready") {
        return "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-[#007d68]";
    }
    if (state === "attention") {
        return "border-alloy-ember/20 bg-alloy-ember/[0.06] text-alloy-ember";
    }
    if (state === "publish_required" || state === "draft") {
        return "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue";
    }
    return "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/50";
}

function HealthIcon({ state }: { state: ConfigurationHealthState }) {
    if (state === "ready") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />;
    if (state === "attention") return <CircleAlert className="h-3.5 w-3.5" aria-hidden />;
    return <CircleHelp className="h-3.5 w-3.5" aria-hidden />;
}

/**
 * Configuration Domain Card — an organization-owned runtime object.
 *
 * This is not a dashboard tile. It presents identity, authority, publication,
 * consumers, inheritance, overrides, and health as one navigable object.
 */
export function ConfigDomainCard({
    domain,
    icon,
    testId,
}: {
    domain: OrganizationConfigurationDomain;
    icon: ReactNode;
    testId?: string;
}) {
    return (
        <article
            className="self-start break-inside-avoid overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={testId}
            data-config-object="domain"
        >
            <div className="border-b border-alloy-stone/25 px-4 pb-3.5 pt-4">
                <div className="flex items-start gap-3">
                    <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.09] text-[#007d68]"
                        aria-hidden
                    >
                        {icon}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-alloy-midnight/38">
                                    Configuration domain
                                </p>
                                <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight text-alloy-midnight">
                                    {domain.label}
                                </h3>
                            </div>
                            <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${stateTone(domain.publication.status)}`}
                            >
                                {domain.publication.label}
                            </span>
                        </div>
                        <p className="mt-2 text-[12px] leading-relaxed text-alloy-midnight/58">
                            {domain.description}
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                    <RadioTower className="mt-0.5 h-3.5 w-3.5 shrink-0 text-alloy-bend-pine" aria-hidden />
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/38">
                            Publisher
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-alloy-midnight/75">
                            {domain.publisherLabel}
                        </p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/48">
                            Managed in {domain.configurationOwner}
                        </p>
                    </div>
                </div>

                {domain.ownedConfiguration?.length ?
                    <div className="border-t border-alloy-stone/20 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/38">
                            Owns
                        </p>
                        <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-alloy-midnight/58">
                            {domain.ownedConfiguration.map((item) => (
                                <li key={item} className="flex items-start gap-1.5">
                                    <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-alloy-bend-pine/65" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                :   null}

                <div className="border-t border-alloy-stone/20 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/38">
                        Consumers
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {domain.consumers.map((consumer) => (
                            <span
                                key={consumer}
                                className="rounded-full border border-alloy-forge/10 bg-alloy-stone/[0.06] px-2 py-1 text-[10px] font-medium text-alloy-midnight/55"
                            >
                                {consumer}
                            </span>
                        ))}
                    </div>
                </div>

                <dl className="border-t border-alloy-stone/20 pt-3 text-[11px]">
                    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1">
                        <dt className="font-semibold text-alloy-midnight/42">Inheritance</dt>
                        <dd className="text-alloy-midnight/62">{domain.inheritance.label}</dd>
                    </div>
                    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1">
                        <dt className="font-semibold text-alloy-midnight/42">Overrides</dt>
                        <dd className="text-alloy-midnight/62">{domain.override.label}</dd>
                    </div>
                    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1">
                        <dt className="font-semibold text-alloy-midnight/42">Health</dt>
                        <dd>
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateTone(domain.health.state)}`}
                                title={domain.health.detail}
                            >
                                <HealthIcon state={domain.health.state} />
                                {domain.health.label}
                            </span>
                        </dd>
                    </div>
                </dl>
            </div>

            <Link
                href={domain.href}
                className="flex items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-4 py-2.5 text-xs font-semibold text-[#007d68] transition-colors hover:bg-alloy-bend-pine/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
            >
                Open {domain.label}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
        </article>
    );
}
