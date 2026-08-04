"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import type {
    ConfigurationPublicationStatus,
    OrganizationConfigurationDomain,
} from "@/lib/configRuntime/organizationRuntime";

function publicationTone(state: ConfigurationPublicationStatus): string {
    if (state === "live_on_save" || state === "published") {
        return "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-[#007d68]";
    }
    if (state === "publish_required" || state === "draft") {
        return "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue";
    }
    return "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/50";
}

function publicationLabel(state: ConfigurationPublicationStatus): string {
    if (state === "live_on_save") return "Live on save";
    if (state === "publish_required") return "Publish required";
    if (state === "published") return "Published";
    if (state === "draft") return "Draft";
    return "Not assessed";
}

/**
 * Compact landing summary for one Organization Configuration Domain.
 * Detailed ownership, inheritance, overrides, and health belong inside the
 * domain runtime; this object is optimized for scanning and navigation.
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
    const ownedConfiguration = domain.ownedConfiguration?.slice(0, 3) ?? [];
    const visibleConsumers = domain.consumers.slice(0, 2);
    const additionalConsumerCount = Math.max(0, domain.consumers.length - visibleConsumers.length);

    return (
        <article
            className="flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-testid={testId}
            data-config-object="domain"
        >
            <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
                <div className="flex items-start gap-2">
                    <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.09] text-[#007d68]"
                        aria-hidden
                    >
                        {icon}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="pt-0.5 text-[14px] font-semibold tracking-tight text-alloy-midnight">
                                {domain.label}
                            </h3>
                            <span
                                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${publicationTone(domain.publication.status)}`}
                            >
                                {publicationLabel(domain.publication.status)}
                            </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 min-h-7 text-[11px] leading-4 text-alloy-midnight/55">
                            {domain.description}
                        </p>
                    </div>
                </div>

                <div className="mt-1.5 border-t border-alloy-stone/20 pt-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                        Owns
                    </p>
                    <ul className="mt-0.5 min-h-[2.15rem] space-y-0 text-[10px] leading-[0.8rem] text-alloy-midnight/58">
                        {ownedConfiguration.map((item) => (
                            <li key={item} className="flex items-start gap-1.5">
                                <span className="mt-[0.3rem] h-1 w-1 shrink-0 rounded-full bg-alloy-bend-pine/65" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-auto flex min-w-0 items-baseline gap-1.5 border-t border-alloy-stone/20 pt-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/38">
                        Used by
                    </p>
                    <p
                        className="min-w-0 flex-1 truncate text-[10px] text-alloy-midnight/55"
                        title={domain.consumers.join(", ")}
                    >
                        {visibleConsumers.join(" · ")}
                        {additionalConsumerCount > 0 ? ` · +${additionalConsumerCount}` : ""}
                    </p>
                </div>
            </div>

            <AdminV2NavLink
                href={domain.href}
                className="block w-full border-t border-alloy-stone/25 bg-alloy-stone/[0.025] text-[11px] font-semibold text-[#007d68] transition-colors hover:bg-alloy-bend-pine/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
            >
                <span className="flex w-full items-center justify-between px-3 py-1.5">
                    Open {domain.label}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </span>
            </AdminV2NavLink>
        </article>
    );
}
