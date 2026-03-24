import Link from "next/link";

type HubLink = { href: string; label: string };
type HubSection = { title: string; description?: string; links: HubLink[] };

const sections: HubSection[] = [
    {
        title: "Organization",
        description: "Users and scheduling defaults.",
        links: [
            { href: "/admin/users", label: "Users" },
            { href: "/admin/operations/recurrence", label: "Recurrence (scheduling defaults)" },
        ],
    },
    {
        title: "Additional record types",
        description:
            "These lists are not in the main sidebar. Day-to-day work usually flows through People, Customers, and Vendors.",
        links: [
            { href: "/admin/contacts", label: "Contacts" },
            { href: "/admin/customer-members", label: "Customer members" },
            { href: "/admin/contractors", label: "Contractors" },
        ],
    },
    {
        title: "Hierarchy",
        description: "Departments and work units (org structure before job assignment).",
        links: [
            { href: "/admin/system/departments", label: "Departments" },
            { href: "/admin/system/work-units", label: "Work units" },
        ],
    },
    {
        title: "Industry / vertical",
        links: [{ href: "/admin/system/verticals-industries", label: "Verticals / industries" }],
    },
    {
        title: "Labels",
        links: [{ href: "/admin/system/entity-labels", label: "Entity labels" }],
    },
    {
        title: "Statuses",
        links: [{ href: "/admin/system/statuses", label: "Statuses" }],
    },
    {
        title: "Custom fields",
        description: "Field definitions by entity type.",
        links: [
            { href: "/admin/system/person-fields", label: "Person fields" },
            { href: "/admin/system/location-fields", label: "Location fields" },
            { href: "/admin/system/customer-fields", label: "Customer fields" },
            { href: "/admin/system/job-fields", label: "Job fields" },
            { href: "/admin/system/opportunity-fields", label: "Opportunity fields" },
            { href: "/admin/system/vendor-fields", label: "Vendor fields" },
            { href: "/admin/system/schedule-fields", label: "Schedule fields" },
            { href: "/admin/system/document-fields", label: "Document fields" },
        ],
    },
    {
        title: "Relationships",
        links: [
            { href: "/admin/system/customer-person-roles", label: "Customer person roles" },
            { href: "/admin/system/person-relationship-types", label: "Person relationship types" },
            { href: "/admin/system/db-relationships", label: "DB relationships" },
        ],
    },
    {
        title: "Document config",
        description: "Field definitions for documents; the document library is under Documents in the sidebar.",
        links: [{ href: "/admin/system/document-fields", label: "Document fields" }],
    },
    {
        title: "Permissions / roles",
        links: [
            { href: "/admin/system/access-control", label: "Access control" },
            { href: "/admin/system/roles", label: "Roles" },
        ],
    },
];

export default function SystemHubPage() {
    return (
        <div className="max-w-4xl text-alloy-midnight">
            <h1 className="text-2xl font-semibold text-alloy-midnight">System</h1>
            <p className="mt-2 text-sm text-alloy-midnight/75">
                Org-wide configuration and defaults. All links go to existing settings pages.
            </p>
            <div className="mt-8 space-y-10">
                {sections.map((section) => (
                    <section key={section.title} className="border-b border-admin-border pb-8 last:border-0 last:pb-0">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-alloy-midnight/80">{section.title}</h2>
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
