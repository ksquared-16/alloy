"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
    Briefcase,
    Building2,
    Calendar,
    ChevronDown,
    ChevronRight,
    Database,
    DollarSign,
    FileText,
    GitBranch,
    LayoutDashboard,
    LayoutGrid,
    LayoutTemplate,
    Layers,
    Mail,
    MapPin,
    MessageSquare,
    Receipt,
    Repeat,
    Settings,
    Shield,
    Tag,
    Users,
} from "lucide-react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import {
    AdminOrgOperationalTimezoneProvider,
} from "@/contexts/AdminOrgOperationalTimezoneContext";
import { AdminViewerTimezoneProvider, type AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { AdminVerticalProvider, useAdminVertical } from "@/contexts/AdminVerticalContext";
import {
    EntityLabelsProvider,
    useEntityLabels,
    getEntityLabel,
    type EntityLabelsMap,
} from "@/contexts/EntityLabelsContext";
import AlloyLogo from "@/components/admin/AlloyLogo";
import { pathnameMatchesNavHref } from "@/lib/admin/adminNavMatch";

const SIDEBAR_STORAGE_KEY = "admin_sidebar_collapsed";
const SIDEBAR_SCROLL_KEY = "adminSidebarScrollTop";

type NavLink = { href: string; label: string; entityType?: string };
type NavItem = NavLink | { label: string; subItems: NavLink[] };
function isNestedNavItem(item: NavItem): item is { label: string; subItems: NavLink[] } {
    return "subItems" in item && Array.isArray((item as { subItems: unknown }).subItems);
}

type IconComponent = React.ComponentType<{ className?: string }>;
const iconClassSidebar = "h-4 w-4 shrink-0 text-alloy-midnight/70";

/** Configuration doctrine IA: Data model, Operations, Automation, Workspace, Organization (URLs preserved). */
const navGroups: { label: string; icon: IconComponent; items: NavItem[] }[] = [
    {
        label: "Data model",
        icon: Database,
        items: [
            { href: "/settings/option-sets", label: "Option sets" },
            { href: "/settings/field-sections", label: "Field sections" },
            { href: "/settings/surfaces", label: "Surfaces" },
            {
                label: "Fields",
                subItems: [
                    { href: "/settings/fields?entity=person", label: "Person fields" },
                    { href: "/settings/fields?entity=location", label: "Location fields" },
                    { href: "/settings/fields?entity=customer", label: "Customer fields" },
                    { href: "/settings/fields?entity=opportunity", label: "Lead fields" },
                    { href: "/settings/fields", label: "All fields" },
                    { href: "/settings/documents/document-fields", label: "Document fields" },
                ],
            },
            { href: "/settings/statuses", label: "Statuses" },
            { href: "/settings/processes", label: "Processes" },
            {
                label: "Relationships",
                subItems: [
                    { href: "/settings/relationships?tab=family-roles", label: "Family roles" },
                    { href: "/settings/relationships?tab=person-relationships", label: "Person relationships" },
                ],
            },
        ],
    },
    {
        label: "Operations",
        icon: Briefcase,
        items: [
            { href: "/legacy-admin/dashboard", label: "Dashboard" },
            { href: "/legacy-admin/opportunities", label: "Opportunities", entityType: "opportunities" },
            { href: "/legacy-admin/jobs", label: "Jobs", entityType: "jobs" },
            { href: "/legacy-admin/schedules", label: "Schedules", entityType: "schedules" },
            {
                label: "Messages",
                subItems: [
                    { href: "/legacy-admin/messaging", label: "Messages", entityType: "messages" },
                    { href: "/legacy-admin/messages-outbox", label: "Outbox" },
                ],
            },
            {
                label: "Records",
                subItems: [
                    { href: "/legacy-admin/people", label: "People", entityType: "persons" },
                    { href: "/legacy-admin/customers", label: "Customers", entityType: "customers" },
                    { href: "/legacy-admin/vendors", label: "Vendors", entityType: "vendors" },
                    { href: "/legacy-admin/locations", label: "Locations", entityType: "locations" },
                ],
            },
            { href: "/legacy-admin/documents", label: "Documents", entityType: "documents" },
            {
                label: "Money",
                subItems: [
                    { href: "/legacy-admin/financials/payments", label: "Payments", entityType: "payments" },
                    { href: "/legacy-admin/financials/ledger", label: "Ledger" },
                    { href: "/legacy-admin/financials/statements", label: "Statements" },
                ],
            },
        ],
    },
    {
        label: "Automation",
        icon: GitBranch,
        items: [
            { href: "/legacy-admin/workflows", label: "Builder" },
            { href: "/legacy-admin/workflow-events", label: "Events" },
            { href: "/legacy-admin/workflow-runs", label: "Runs" },
        ],
    },
    {
        label: "Workspace",
        icon: LayoutTemplate,
        items: [
            { href: "/workspace", label: "V2 workspace (cleaning slice)" },
            { href: "/settings/entities", label: "Entities" },
        ],
    },
    {
        label: "Organization",
        icon: Building2,
        items: [
            { href: "/settings", label: "Platform Configuration" },
            { href: "/settings/users-roles", label: "Users & Roles" },
            { href: "/legacy-admin/users", label: "Users" },
            { href: "/settings/departments", label: "Departments" },
            { href: "/settings/work-units", label: "Work units (diagnostic)" },
            { href: "/legacy-admin/verticals", label: "Verticals" },
            { href: "/legacy-admin/system/verticals-industries", label: "Industries (diagnostic)" },
            { href: "/legacy-admin/operations/recurrence", label: "Recurrence" },
            {
                label: "Commercial",
                subItems: [
                    { href: "/legacy-admin/financials/pricing", label: "Pricing" },
                    { href: "/legacy-admin/financials/service-offerings", label: "Service offerings" },
                    { href: "/legacy-admin/financials/plan-templates", label: "Plan templates" },
                    { href: "/legacy-admin/financials/add-ons", label: "Add-ons" },
                    { href: "/legacy-admin/financials/settings/subscription", label: "Subscription billing" },
                    { href: "/legacy-admin/financials/accounts", label: "Accounts" },
                    { href: "/legacy-admin/financials", label: "Financials overview" },
                    { href: "/legacy-admin/discounts", label: "Discount programs" },
                    { href: "/legacy-admin/discount-redemptions", label: "Redemptions" },
                    { href: "/legacy-admin/subscriptions", label: "Subscriptions" },
                    { href: "/legacy-admin/system/payouts", label: "Payouts" },
                ],
            },
        ],
    },
];

function getLinkIcon(href: string, _label: string, nestedLabel?: string): IconComponent | null {
    const map: Record<string, IconComponent> = {
        "/admin": LayoutDashboard,
        "/admin/dashboard": LayoutDashboard,
        "/admin/system": Settings,
        "/admin/system/option-sets": LayoutGrid,
        "/admin/system/field-sections": Layers,
        "/admin/system/pipelines": GitBranch,
        "/admin/opportunities": LayoutGrid,
        "/admin/jobs": Briefcase,
        "/admin/schedules": Calendar,
        "/admin/documents": FileText,
        "/admin/locations": MapPin,
        "/admin/messaging": MessageSquare,
        "/admin/messages-outbox": Mail,
        "/admin/financials/ledger": FileText,
        "/admin/financials/statements": Receipt,
        "/admin/financials/payments": DollarSign,
        "/admin/subscriptions": Receipt,
        "/admin/financials/pricing": Tag,
        "/admin/discounts": Tag,
        "/admin/financials/service-offerings": Tag,
        "/admin/financials/plan-templates": Tag,
        "/admin/financials/add-ons": Tag,
        "/admin/discount-redemptions": Tag,
        "/admin/financials/accounts": Building2,
        "/admin/operations/recurrence": Repeat,
        "/admin/system/access-control": Shield,
        "/admin/system/verticals-industries": LayoutGrid,
        "/admin/system/entity-labels": LayoutTemplate,
        "/admin/workspace": LayoutTemplate,
        "/admin/system/statuses": Tag,
        "/admin/system/departments": Layers,
        "/admin/system/work-units": Layers,
        "/admin/system/payouts": DollarSign,
        "/admin/people": Users,
        "/admin/contacts": Users,
        "/admin/customer-members": Users,
        "/admin/customers": Users,
        "/admin/vendors": Users,
        "/admin/verticals": LayoutGrid,
        "/admin/contractors": Briefcase,
        "/admin/users": Users,
        "/admin/system/roles": Shield,
        "/admin/workflows": GitBranch,
        "/admin/workflow-events": GitBranch,
        "/admin/workflow-runs": GitBranch,
    };
    if (map[href]) return map[href];
    if (nestedLabel === "Messages") return MessageSquare;
    if (nestedLabel === "Commercial") return DollarSign;
    if (nestedLabel === "Money") return DollarSign;
    if (nestedLabel === "Records") return Users;
    if (nestedLabel === "Fields") return LayoutGrid;
    if (nestedLabel === "Relationships") return Users;
    return null;
}

function getInitialCollapsed(): Record<string, boolean> {
    const defaults: Record<string, boolean> = {
        "Data model": false,
        Operations: false,
        Automation: false,
        Workspace: true,
        Organization: true,
    };
    if (typeof window === "undefined") {
        return defaults;
    }
    try {
        const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Record<string, boolean>;
            return { ...defaults, ...parsed };
        }
    } catch (_) {}
    return defaults;
}

function getInitials(email: string): string {
    const part = email.split("@")[0] || "";
    const segments = part.split(/[._-]/).filter(Boolean);
    if (segments.length >= 2) return (segments[0][0] + segments[1][0]).toUpperCase().slice(0, 2);
    return (part.slice(0, 2) || "?").toUpperCase();
}

interface AdminLayoutProps {
    children: ReactNode;
    userEmail: string;
    userId: string;
    orgId: string;
    role: string;
    roleKeys?: string[];
    initialEntityLabels?: EntityLabelsMap;
    initialViewerTimezone?: AdminViewerTimezoneValue;
    /** Org operational IANA for schedule/booking form defaults (not user display). */
    initialOperationalTimezoneIana?: string;
}

function navLinkLabel(link: NavLink, labels: EntityLabelsMap, labelsLoading: boolean): string {
    if (link.entityType) {
        if (labelsLoading) return link.label;
        return getEntityLabel(labels, link.entityType, "plural");
    }
    return link.label;
}

function AdminLayoutInner({ children, userEmail, role }: { children: ReactNode; userEmail: string; role: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const sidebarScrollRef = useRef<HTMLElement | null>(null);
    const { verticals, selectedVerticalId, setSelectedVerticalId, loading: verticalsLoading } = useAdminVertical();
    const { labels, loading: labelsLoading } = useEntityLabels();

    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getInitialCollapsed);
    const [nestedCollapsed, setNestedCollapsed] = useState<Record<string, boolean>>({
        "Operations::Messages": true,
        "Operations::Records": true,
        "Operations::Money": true,
        "Data model::Fields": true,
        "Data model::Relationships": true,
        "Organization::Commercial": true,
    });
    const [profileOpen, setProfileOpen] = useState(false);
    const [verticalOpen, setVerticalOpen] = useState(false);

    useEffect(() => {
        const group = navGroups.find((g) =>
            g.items.some((i) => {
                if (isNestedNavItem(i)) return i.subItems.some((s) => s.href === pathname);
                return pathnameMatchesNavHref((i as NavLink).href, pathname);
            })
        );
        if (group && collapsed[group.label]) {
            setCollapsed((prev) => ({ ...prev, [group.label]: false }));
        }
        const messagePaths = ["/admin/messaging", "/admin/messages-outbox"];
        if (messagePaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["Operations::Messages"] === false ? prev : { ...prev, "Operations::Messages": false }));
        }
        const customFieldPaths = [
            "/admin/system/person-fields",
            "/admin/system/location-fields",
            "/admin/system/customer-fields",
            "/admin/system/job-fields",
            "/admin/system/opportunity-fields",
            "/admin/system/vendor-fields",
            "/admin/system/schedule-fields",
            "/admin/system/document-fields",
        ];
        if (customFieldPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["Data model::Fields"] === false ? prev : { ...prev, "Data model::Fields": false }));
        }
        const relationshipPaths = [
            "/admin/system/customer-person-roles",
            "/admin/system/person-relationship-types",
            "/admin/system/db-relationships",
        ];
        if (relationshipPaths.includes(pathname)) {
            setNestedCollapsed((prev) =>
                prev["Data model::Relationships"] === false ? prev : { ...prev, "Data model::Relationships": false }
            );
        }
        const commercialPaths = [
            "/admin/financials/pricing",
            "/admin/financials/service-offerings",
            "/admin/financials/plan-templates",
            "/admin/financials/add-ons",
            "/admin/financials/settings/subscription",
            "/admin/financials/accounts",
            "/admin/financials",
            "/admin/discounts",
            "/admin/discount-redemptions",
            "/admin/subscriptions",
            "/admin/system/payouts",
        ];
        if (commercialPaths.includes(pathname)) {
            setNestedCollapsed((prev) =>
                prev["Organization::Commercial"] === false ? prev : { ...prev, "Organization::Commercial": false }
            );
        }
        const recordPaths = ["/admin/people", "/admin/customers", "/admin/vendors", "/admin/locations"];
        if (recordPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["Operations::Records"] === false ? prev : { ...prev, "Operations::Records": false }));
        }
        const moneyPaths = ["/admin/financials/payments", "/admin/financials/ledger", "/admin/financials/statements"];
        if (moneyPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["Operations::Money"] === false ? prev : { ...prev, "Operations::Money": false }));
        }
        const dataModelPaths = [
            "/admin/system/option-sets",
            "/admin/system/field-sections",
            "/admin/system/statuses",
            "/admin/system/pipelines",
            ...customFieldPaths,
            ...relationshipPaths,
        ];
        if (dataModelPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
            setCollapsed((prev) => (prev["Data model"] === false ? prev : { ...prev, "Data model": false }));
        }
        if (pathname === "/admin/system/entity-labels" || pathnameMatchesNavHref("/admin/workspace", pathname)) {
            setCollapsed((prev) => (prev.Workspace === false ? prev : { ...prev, Workspace: false }));
        } else if (
            pathname !== "/admin/system/entity-labels" &&
            pathname.startsWith("/admin/system/") &&
            !dataModelPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))
        ) {
            setCollapsed((prev) => (prev.Organization === false ? prev : { ...prev, Organization: false }));
        }
        if (pathname === "/admin/system" || pathname === "/admin/users" || pathname === "/admin/verticals" || pathname === "/admin/operations/recurrence") {
            setCollapsed((prev) => (prev.Organization === false ? prev : { ...prev, Organization: false }));
        }
    }, [pathname]);

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(collapsed));
        } catch (_) {}
    }, [collapsed]);

    useEffect(() => {
        const el = sidebarScrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            try {
                sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(el.scrollTop));
            } catch (_) {}
        };
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const el = sidebarScrollRef.current;
        if (!el || typeof sessionStorage === "undefined") return;
        const raw = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
        const scrollTop = raw ? parseInt(raw, 10) : 0;
        if (!Number.isFinite(scrollTop) || scrollTop <= 0) return;
        const raf = requestAnimationFrame(() => {
            el.scrollTop = scrollTop;
        });
        return () => cancelAnimationFrame(raf);
    }, [pathname]);

    const toggleGroup = useCallback((label: string) => {
        setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
    }, []);

    const toggleNested = useCallback((label: string) => {
        setNestedCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
    }, []);

    const handleSignOut = async () => {
        setProfileOpen(false);
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    const contextBooting = verticalsLoading && labelsLoading;

    if (contextBooting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-admin-page p-6 text-alloy-midnight">
                Loading context...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-admin-page flex flex-col">
            {/* Full-width Alloy Blue top bar: logo left, vertical + avatar right */}
            <header className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-3 bg-alloy-blue border-b border-[var(--color-admin-topbar-divider)]">
                <Link href="/admin" className="flex items-center gap-3 py-1" aria-label="Home">
                    <AlloyLogo variant="white" />
                    <span className="text-sm font-medium text-white/90">Admin</span>
                </Link>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => { setVerticalOpen((o) => !o); setProfileOpen(false); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/90 border border-white/20 rounded-md hover:bg-white/10"
                        >
                            Vertical: {selectedVerticalId ? verticals.find((v) => v.id === selectedVerticalId)?.name ?? selectedVerticalId.slice(0, 8) : "All"}
                        </button>
                        {verticalOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setVerticalOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 py-1 bg-admin-surface-card border border-admin-border rounded-md shadow-lg z-20 min-w-[180px]">
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedVerticalId(null); setVerticalOpen(false); }}
                                        className="block w-full text-left px-4 py-2 text-sm text-alloy-forge hover:bg-alloy-stone/50"
                                    >
                                        All
                                    </button>
                                    {verticals.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => { setSelectedVerticalId(v.id); setVerticalOpen(false); }}
                                            className="block w-full text-left px-4 py-2 text-sm text-alloy-forge hover:bg-alloy-stone/50"
                                        >
                                            {v.name ?? v.slug ?? v.id.slice(0, 8)}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <span className="h-6 w-px bg-white/20" aria-hidden />
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => { setProfileOpen((o) => !o); setVerticalOpen(false); }}
                            className="w-9 h-9 rounded-full bg-white/20 text-white text-sm font-medium flex items-center justify-center hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-alloy-blue"
                        >
                            {getInitials(userEmail)}
                        </button>
                        {profileOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 py-2 bg-admin-surface-card border border-admin-border rounded-md shadow-lg z-20 min-w-[220px]">
                                    <p className="px-4 py-2 text-sm text-alloy-forge/80 border-b border-admin-border">Signed in as {userEmail}</p>
                                    <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-alloy-forge hover:bg-alloy-stone/50">Sign out</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>
            <div className="flex flex-1 min-h-0">
                <aside className="w-64 flex-shrink-0 bg-[var(--color-admin-sidebar-bg)] border-r border-admin-border flex flex-col">
                    <nav
                        ref={sidebarScrollRef}
                        className="flex-1 overflow-y-auto overflow-x-hidden p-4"
                        aria-label="Admin navigation"
                    >
                        <div className="mb-3">
                            <Link
                                href="/admin/dashboard"
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                                    pathname === "/admin/dashboard"
                                        ? "bg-alloy-pine/8 text-alloy-pine border-l-2 border-alloy-pine"
                                        : "text-alloy-midnight hover:bg-alloy-pine/5"
                                }`}
                            >
                                <LayoutDashboard
                                    className={
                                        pathname === "/admin/dashboard" ? "h-4 w-4 shrink-0 text-alloy-pine" : iconClassSidebar
                                    }
                                />
                                Dashboard
                            </Link>
                        </div>
                        {navGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isCollapsed = collapsed[group.label] ?? true;
                            return (
                                <div key={group.label} className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold tracking-wider text-alloy-midnight hover:bg-alloy-stone/50 rounded-md gap-2"
                                    >
                                        <span className="flex items-center gap-2">
                                            {GroupIcon && <GroupIcon className={iconClassSidebar} />}
                                            {group.label}
                                        </span>
                                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-alloy-midnight/50" /> : <ChevronDown className="h-3.5 w-3.5 text-alloy-midnight/50" />}
                                    </button>
                                    {!isCollapsed && (
                                        <ul className="mt-1.5 space-y-0.5 pl-3">
                                            {group.items.map((item) => {
                                                if (isNestedNavItem(item)) {
                                                    const nestedKey = `${group.label}::${item.label}`;
                                                    const isNestedOpen = !(nestedCollapsed[nestedKey] ?? true);
                                                    const hasActiveChild = item.subItems.some((s) => s.href === pathname);
                                                    const NestedIcon = getLinkIcon("", item.label, item.label);
                                                    return (
                                                        <li key={nestedKey}>
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleNested(nestedKey)}
                                                                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left gap-2 ${hasActiveChild ? "bg-alloy-pine/8 text-alloy-pine border-l-2 border-alloy-pine" : "text-alloy-midnight hover:bg-alloy-pine/5"}`}
                                                            >
                                                                <span className="flex items-center gap-2 min-w-0">
                                                                    {NestedIcon && <NestedIcon className={iconClassSidebar} />}
                                                                    <span className="truncate">{item.label}</span>
                                                                </span>
                                                                {isNestedOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/50" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/50" />}
                                                            </button>
                                                            {isNestedOpen && (
                                                                <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-admin-border pl-2">
                                                                    {item.subItems.map((sub) => {
                                                                        const isActive = pathname === sub.href;
                                                                        const displayLabel = navLinkLabel(sub, labels, labelsLoading);
                                                                        return (
                                                                            <li key={sub.href}>
                                                                                <Link
                                                                                    href={sub.href}
                                                                                    className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-alloy-pine/8 text-alloy-pine border-l-2 border-alloy-pine" : "text-alloy-midnight hover:bg-alloy-pine/5"}`}
                                                                                >
                                                                                    {displayLabel}
                                                                                </Link>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            )}
                                                        </li>
                                                    );
                                                }
                                                const link = item as NavLink;
                                                const isActive = pathnameMatchesNavHref(link.href, pathname);
                                                const LinkIcon = getLinkIcon(link.href, link.label);
                                                const displayLabel = navLinkLabel(link, labels, labelsLoading);
                                                return (
                                                    <li key={link.href}>
                                                        <Link
                                                            href={link.href}
                                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-alloy-pine/8 text-alloy-pine border-l-2 border-alloy-pine" : "text-alloy-midnight hover:bg-alloy-pine/5"}`}
                                                        >
                                                            {LinkIcon && <LinkIcon className={isActive ? "h-4 w-4 shrink-0 text-alloy-pine" : iconClassSidebar} />}
                                                            <span className="truncate">{displayLabel}</span>
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </aside>
                <main className="flex-1 overflow-auto flex flex-col bg-admin-page">
                    <div className="p-8 flex-1">
                        <AdminDrawerProvider>
                            {children}
                        </AdminDrawerProvider>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default function AdminLayout(props: AdminLayoutProps) {
    const {
        initialEntityLabels,
        userEmail,
        userId,
        orgId,
        role,
        roleKeys,
        children,
        initialViewerTimezone,
        initialOperationalTimezoneIana,
    } = props;
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeUserId = typeof userId === "string" ? userId : "";
    const safeOrgId = typeof orgId === "string" ? orgId : "";
    const safeRole = typeof role === "string" ? role : "";
    const safeRoleKeys = Array.isArray(roleKeys) ? roleKeys : undefined;
    const tzValue: AdminViewerTimezoneValue = initialViewerTimezone ?? {
        iana: "UTC",
        source: "utc_fallback",
    };
    const operationalTz =
        typeof initialOperationalTimezoneIana === "string" && initialOperationalTimezoneIana.trim()
            ? initialOperationalTimezoneIana.trim()
            : "UTC";
    return (
        <AdminAuthProvider userEmail={safeEmail} userId={safeUserId} orgId={safeOrgId} role={safeRole} roleKeys={safeRoleKeys}>
            <AdminVerticalProvider>
                <EntityLabelsProvider initialLabels={initialEntityLabels}>
                    <AdminOrgOperationalTimezoneProvider iana={operationalTz}>
                        <AdminViewerTimezoneProvider value={tzValue}>
                            <AdminLayoutInner userEmail={safeEmail} role={safeRole}>
                                {children}
                            </AdminLayoutInner>
                        </AdminViewerTimezoneProvider>
                    </AdminOrgOperationalTimezoneProvider>
                </EntityLabelsProvider>
            </AdminVerticalProvider>
        </AdminAuthProvider>
    );
}
