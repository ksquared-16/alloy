import Link from "next/link";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import { ADMIN_FORMS_HREF } from "@/lib/admin/canonicalAdminRoutes";

const LINKS = [
    {
        href: `${adminSettingsSubpathHref("actions")}?entity_type=opportunity`,
        title: "Action Buttons",
        description: "Choose where enrollment buttons appear (drawer, queue, side panel).",
    },
    {
        href: adminSettingsSubpathHref("work-units"),
        title: "Work Units & Queues",
        description: "Pipeline lanes and waitlist queue layout.",
    },
    {
        href: adminSettingsSubpathHref("statuses"),
        title: "Statuses",
        description: "Display names and order for inquiry statuses.",
    },
    {
        href: adminSettingsSubpathHref("attention-sla-rules"),
        title: "Attention & SLA",
        description: "Needs-attention buckets and timing thresholds.",
    },
    {
        href: `${adminSettingsSubpathHref("layouts")}?entity=opportunity`,
        title: "Record Layouts",
        description: "Drawer sections and how fields appear.",
    },
    {
        href: adminSettingsSubpathHref("placement-priority"),
        title: "Waitlist Ranking Policy",
        description: "How waitlist priority is calculated and displayed.",
    },
    {
        href: ADMIN_FORMS_HREF,
        title: "Forms",
        description: "Intake forms, packets, and submission review.",
    },
] as const;

export default function LifecycleRelatedSettingsLinks() {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {LINKS.map((link) => (
                <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg border border-alloy-stone/25 bg-white p-4 shadow-sm transition hover:border-alloy-pine/40 hover:shadow-md"
                >
                    <div className="text-sm font-semibold text-alloy-midnight">{link.title}</div>
                    <p className="mt-1 text-xs text-alloy-midnight/70">{link.description}</p>
                </Link>
            ))}
        </div>
    );
}
