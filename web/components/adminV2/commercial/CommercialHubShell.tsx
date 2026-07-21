import Link from "next/link";
import { SETTINGS_PAGE_SHELL_CLASS, SETTINGS_PAGE_INTRO_CLASS } from "@/lib/adminV2/settingsPageLayout";

const HUB_CARDS = [
    {
        href: "/organization/programs",
        title: "Programs",
        description:
            "Define what programs your centers offer — Infant, Toddler, Preschool, and more. Configure which programs are available at each location.",
        badge: "Organization & Location",
        hint: "Set active programs and per-location availability.",
    },
    {
        href: "/settings/commercial/tuition",
        title: "Tuition",
        description:
            "Set tuition rates by program and schedule type across all billing periods. Org defaults inherit to all sites — override per location as needed.",
        badge: "Tuition Grid",
        hint: "Readiness score shown inside the grid.",
    },
] as const;

export default function CommercialHubShell() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <header className="rounded-xl border border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90 px-5 py-4 shadow-sm">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">
                    Programs & Tuition
                </h1>
                <p className={`mt-1 ${SETTINGS_PAGE_INTRO_CLASS}`}>
                    Configure the commercial structure of your business — what programs you offer and
                    what you charge for them.
                </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
                {HUB_CARDS.map((card) => (
                    <Link
                        key={card.href}
                        href={card.href}
                        className="group flex flex-col gap-3 rounded-xl border border-alloy-forge/12 bg-white/90 p-5 shadow-sm transition-all hover:border-alloy-pine/25 hover:shadow-md"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="text-base font-semibold tracking-tight text-alloy-midnight group-hover:text-alloy-pine">
                                {card.title}
                            </h2>
                            <span className="shrink-0 rounded-full border border-alloy-forge/10 bg-alloy-stone/20 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/50">
                                {card.badge}
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed text-alloy-midnight/60">
                            {card.description}
                        </p>
                        <p className="text-xs text-alloy-midnight/40 italic">{card.hint}</p>
                        <div className="mt-auto flex items-center gap-1 text-xs font-medium text-alloy-pine/70 group-hover:text-alloy-pine">
                            Configure
                            <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="rounded-lg border border-alloy-forge/8 bg-alloy-stone/10 px-4 py-3">
                <p className="text-xs text-alloy-midnight/50">
                    <span className="font-medium text-alloy-midnight/70">Coming soon:</span>{" "}
                    Funding Sources, Fees & Add-Ons, Billing Policies, Accounting, and Simulator.
                </p>
            </div>
        </div>
    );
}
