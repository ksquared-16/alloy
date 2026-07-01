"use client";

import { CONFIGURATION_JOURNEY_STEPS } from "@/lib/adminV2/configurationWorkspaceDomains";
import SettingsIntentLink from "@/components/adminV2/settings/SettingsIntentLink";
import { ConfigRuntimeSectionHeader } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";

/** Contextual setup flow — guidance, not a wizard. */
export default function ConfigurationJourneyGuide() {
    return (
        <section
            className="config-runtime-operational-card px-5 py-4"
            data-testid="configuration-journey-guide"
        >
            <ConfigRuntimeSectionHeader>Configuration flow</ConfigRuntimeSectionHeader>
            <h2 className="mt-1 text-base font-semibold text-alloy-midnight">How configuration fits together</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-alloy-midnight/60">
                Processes is the operational spine — stages, Work Views, missions, and required info. Surfaces
                (Experience Builder) owns queue rows and Focus Panel presentation. Fields and Statuses are canonical
                catalogs configured in their own settings surfaces.
            </p>

            <div
                className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-alloy-pine/15 bg-alloy-pine/[0.04] px-4 py-3 text-xs font-semibold text-alloy-midnight/75"
                data-testid="configuration-journey-flow"
            >
                <span className="rounded-lg bg-white px-3 py-1.5 shadow-sm">Fields</span>
                <span className="text-alloy-midnight/30" aria-hidden>→</span>
                <span className="rounded-lg bg-white px-3 py-1.5 shadow-sm">Statuses</span>
                <span className="text-alloy-midnight/30" aria-hidden>→</span>
                <span className="rounded-lg bg-alloy-pine/12 px-3 py-1.5 text-alloy-pine">Processes</span>
                <span className="text-alloy-midnight/30" aria-hidden>→</span>
                <span className="rounded-lg bg-alloy-pine/12 px-3 py-1.5 text-alloy-pine">Surfaces</span>
                <span className="text-alloy-midnight/30" aria-hidden>→</span>
                <span className="rounded-lg bg-alloy-midnight/8 px-3 py-1.5">Runtime</span>
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                Recommended setup order
            </h3>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONFIGURATION_JOURNEY_STEPS.map((step) => (
                    <li key={step.step}>
                        <SettingsIntentLink
                            href={step.href}
                            className="flex gap-3 rounded-xl border border-alloy-forge/10 bg-white px-3 py-3 transition-colors hover:border-alloy-pine/25 hover:bg-alloy-pine/[0.03]"
                        >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-alloy-pine/12 text-xs font-bold text-alloy-pine">
                                {step.step}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-alloy-midnight">{step.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/55">
                                    {step.summary}
                                </span>
                            </span>
                        </SettingsIntentLink>
                    </li>
                ))}
            </ol>
        </section>
    );
}
