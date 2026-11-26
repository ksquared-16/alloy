"use client";

import Link from "next/link";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import { dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";

type RelatedLink = {
    key: string;
    href?: string;
    onClick?: () => void;
    title: string;
    description: string;
};

const LINKS: RelatedLink[] = [
    {
        key: "actions",
        href: `${adminSettingsSubpathHref("actions")}?entity_type=opportunity`,
        title: "Action Buttons",
        description: "Choose where enrollment buttons appear (drawer, queue, side panel).",
    },
    {
        key: "work-units",
        href: adminSettingsSubpathHref("work-units"),
        title: "Work Units & Queues",
        description: "Pipeline lanes and waitlist queue layout.",
    },
    {
        key: "statuses",
        href: adminSettingsSubpathHref("statuses"),
        title: "Statuses",
        description: "Display names and order for inquiry statuses.",
    },
    {
        key: "attention",
        href: adminSettingsSubpathHref("attention-sla-rules"),
        title: "Attention & SLA",
        description: "Needs-attention buckets and timing thresholds.",
    },
    {
        key: "layouts",
        href: `${adminSettingsSubpathHref("layouts")}?entity=opportunity`,
        title: "Record Layouts",
        description: "Drawer sections and how fields appear.",
    },
    {
        key: "placement-priority",
        href: adminSettingsSubpathHref("placement-priority"),
        title: "Waitlist Ranking Policy",
        description: "How waitlist priority is calculated and displayed.",
    },
    {
        key: "forms",
        // Forms now live in the Digital Mailroom Studio, not a standalone route.
        onClick: () => dispatchAdminV2OpenProcessingModal({ mode: "studio", studioTab: "forms" }),
        title: "Forms",
        description: "Intake forms, packets, and submission review.",
    },
];

const CARD_CLASS =
    "block rounded-lg border border-alloy-stone/25 bg-white p-4 shadow-sm transition hover:border-alloy-pine/40 hover:shadow-md";

export default function LifecycleRelatedSettingsLinks() {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {LINKS.map((link) =>
                link.href ? (
                    <Link key={link.key} href={link.href} className={CARD_CLASS}>
                        <div className="text-sm font-semibold text-alloy-midnight">{link.title}</div>
                        <p className="mt-1 text-xs text-alloy-midnight/70">{link.description}</p>
                    </Link>
                ) : (
                    <button
                        key={link.key}
                        type="button"
                        onClick={link.onClick}
                        className={`${CARD_CLASS} text-left`}
                    >
                        <div className="text-sm font-semibold text-alloy-midnight">{link.title}</div>
                        <p className="mt-1 text-xs text-alloy-midnight/70">{link.description}</p>
                    </button>
                ),
            )}
        </div>
    );
}
