import Link from "next/link";

type HubLink = { href: string; label: string };
type HubSection = { title: string; description?: string; links: HubLink[] };

const sections: HubSection[] = [
    {
        title: "Data model",
        description: "Field registry, option lists, statuses, and pipelines.",
        links: [
            { href: "/admin/system/option-sets", label: "Option sets" },
            { href: "/admin/system/field-sections", label: "Field sections" },
            { href: "/admin/system/person-fields", label: "Person fields" },
            { href: "/admin/system/location-fields", label: "Location fields" },
            { href: "/admin/system/customer-fields", label: "Customer fields" },
            { href: "/admin/system/job-fields", label: "Job fields" },
            { href: "/admin/system/opportunity-fields", label: "Opportunity fields" },
            { href: "/admin/system/vendor-fields", label: "Vendor fields" },
            { href: "/admin/system/schedule-fields", label: "Schedule fields" },
            { href: "/admin/system/document-fields", label: "Document fields" },
            { href: "/admin/system/statuses", label: "Statuses" },
            { href: "/admin/system/pipelines", label: "Pipelines & stages" },
            { href: "/admin/system/customer-person-roles", label: "Customer person roles" },
            { href: "/admin/system/person-relationship-types", label: "Person relationship types" },
            { href: "/admin/system/db-relationships", label: "DB relationships" },
        ],
    },
    {
        title: "Workspace",
        links: [{ href: "/admin/system/entity-labels", label: "Entity labels" }],
    },
    {
        title: "Organization",
        description: "Users, structure, verticals, and access.",
        links: [
            { href: "/admin/system/access-control", label: "Access control" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/system/roles", label: "Roles" },
            { href: "/admin/verticals", label: "Verticals" },
            { href: "/admin/system/verticals-industries", label: "Industries" },
            { href: "/admin/system/departments", label: "Departments" },
            { href: "/admin/system/work-units", label: "Work units" },
            { href: "/admin/operations/recurrence", label: "Recurrence" },
            { href: "/admin/system/payouts", label: "Vendor payout defaults" },
        ],
    },
    {
        title: "Additional record lists",
        description: "Not all are in the main sidebar; use from here or deep links.",
        links: [
            { href: "/admin/contacts", label: "Contacts" },
            { href: "/admin/customer-members", label: "Customer members" },
            { href: "/admin/contractors", label: "Contractors" },
        ],
    },
    {
        title: "Legacy shortcut",
        description: "Old URL redirects to pipelines.",
        links: [{ href: "/admin/settings", label: "/admin/settings → pipelines" }],
    },
];

export default function SystemHubPage() {
    return (
        <div className="max-w-4xl text-alloy-midnight">
            <h1 className="text-2xl font-semibold text-alloy-midnight">System overview</h1>
            <p className="mt-2 text-sm text-alloy-midnight/75">
                Hub for org configuration. Primary navigation is in the sidebar (Data model, Operations, Automation,
                Workspace, Organization).
            </p>
            <div className="mt-8 space-y-10">
                {sections.map((section) => (
                    <section key={section.title} className="border-b border-admin-border pb-8 last:border-0 last:pb-0">
                        <h2 className="text-sm font-semibold tracking-wide text-alloy-midnight/80">{section.title}</h2>
                        {section.description ? (
                            <p className="mt-1 text-sm text-alloy-midnight/65">{section.description}</p>
                        ) : null}
                        <ul className="mt-3 space-y-1.5">
                            {section.links.map((link) => (
                                <li key={link.href + link.label}>
                                    <Link
                                        href={link.href}
                                        className="text-sm font-medium text-alloy-pine hover:text-alloy-pine/90 underline-offset-2 hover:underline"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
