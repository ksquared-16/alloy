import { CONFIGURATION_JOURNEY_STEPS } from "@/lib/adminV2/configurationWorkspaceDomains";
import SettingsIntentLink from "@/components/adminV2/settings/SettingsIntentLink";

/** Contextual setup flow — guidance, not a wizard. */
export default function ConfigurationJourneyGuide() {
    return (
        <section
            className="rounded-xl border border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90 px-4 py-3 shadow-sm"
            data-testid="configuration-journey-guide"
        >
            <h2 className="text-sm font-semibold text-alloy-midnight">How configuration fits together</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-alloy-midnight/55">
                Business Processes is the operational spine — stages, perspectives, missions, and required
                info. Layouts (Experience Builder) owns queue rows and Focus Panel presentation. Fields and
                Statuses are canonical catalogs configured in their own settings surfaces.
            </p>

            <div
                className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2.5 text-[11px] font-medium text-alloy-midnight/70"
                data-testid="configuration-journey-flow"
            >
                <span className="rounded-md bg-alloy-pine/10 px-2 py-1 text-alloy-pine">Fields</span>
                <span className="text-alloy-midnight/35" aria-hidden>
                    →
                </span>
                <span className="rounded-md bg-white px-2 py-1 shadow-sm">Statuses</span>
                <span className="text-alloy-midnight/35" aria-hidden>
                    →
                </span>
                <span className="rounded-md bg-alloy-pine/10 px-2 py-1 text-alloy-pine">Business Processes</span>
                <span className="text-alloy-midnight/35" aria-hidden>
                    →
                </span>
                <span className="rounded-md bg-white px-2 py-1 shadow-sm">Layouts</span>
                <span className="text-alloy-midnight/35" aria-hidden>
                    →
                </span>
                <span className="rounded-md bg-alloy-midnight/8 px-2 py-1 text-alloy-midnight">Runtime</span>
            </div>

            <h3 className="mt-4 text-xs font-semibold text-alloy-midnight/70">Recommended setup order</h3>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2">
                {CONFIGURATION_JOURNEY_STEPS.map((step) => (
                    <li key={step.step}>
                        <SettingsIntentLink
                            href={step.href}
                            className="flex gap-2.5 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2 transition-colors hover:border-alloy-pine/25 hover:bg-alloy-pine/[0.04]"
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alloy-pine/10 text-[11px] font-bold text-alloy-pine">
                                {step.step}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold text-alloy-midnight">
                                    {step.label}
                                </span>
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
