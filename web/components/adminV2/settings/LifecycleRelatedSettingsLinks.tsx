import Link from "next/link";

const LINKS = [
    {
        href: "/adminV2/settings/actions?entity_type=opportunity",
        title: "Action Buttons",
        description: "Choose where enrollment buttons appear (drawer, queue, side panel).",
    },
    {
        href: "/adminV2/settings/work-units",
        title: "Work Units & Queues",
        description: "Pipeline lanes and waitlist queue layout.",
    },
    {
        href: "/adminV2/settings/statuses",
        title: "Statuses",
        description: "Display names and order for inquiry statuses.",
    },
    {
        href: "/adminV2/settings/attention-sla-rules",
        title: "Attention & SLA",
        description: "Needs-attention buckets and timing thresholds.",
    },
    {
        href: "/adminV2/settings/layouts?entity=opportunity",
        title: "Record Layouts",
        description: "Drawer sections and how fields appear.",
    },
    {
        href: "/adminV2/settings/placement-priority",
        title: "Waitlist ranking",
        description: "Priority factors for waitlisted children.",
    },
] as const;

export default function LifecycleRelatedSettingsLinks() {
    return (
        <section
            className="rounded-xl border border-alloy-forge/12 bg-white/70 p-4 shadow-sm"
            data-testid="lifecycle-related-settings-links"
        >
            <h2 className="text-sm font-semibold text-alloy-midnight">Related settings</h2>
            <p className="mt-1 text-xs text-alloy-midnight/60">
                Configure visibility, queues, and labels that work together with lifecycle stages.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {LINKS.map((item) => (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            className="block rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2 transition-colors hover:border-alloy-pine/25 hover:bg-alloy-pine/[0.04]"
                        >
                            <span className="text-xs font-medium text-alloy-pine">{item.title}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/55">
                                {item.description}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
