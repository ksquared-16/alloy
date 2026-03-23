"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
    Briefcase,
    Calendar,
    ChevronDown,
    ChevronRight,
    DollarSign,
    FileText,
    GitBranch,
    LayoutGrid,
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
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { AdminPreviewProvider } from "@/contexts/AdminPreviewContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import RecordPreviewPanel from "@/components/admin/RecordPreviewPanel";
import { AdminVerticalProvider, useAdminVertical } from "@/contexts/AdminVerticalContext";
import {
    EntityLabelsProvider,
    useEntityLabels,
    getEntityLabel,
    type EntityLabelsMap,
} from "@/contexts/EntityLabelsContext";
import AlloyLogo from "@/components/admin/AlloyLogo";

const SIDEBAR_STORAGE_KEY = "admin_sidebar_collapsed";
const SIDEBAR_SCROLL_KEY = "adminSidebarScrollTop";

type NavLink = { href: string; label: string; entityType?: string };
type NavItem = NavLink | { label: string; subItems: NavLink[] };
function isNestedNavItem(item: NavItem): item is { label: string; subItems: NavLink[] } {
    return "subItems" in item && Array.isArray((item as { subItems: unknown }).subItems);
}

type IconComponent = React.ComponentType<{ className?: string }>;
const iconClassSidebar = "h-4 w-4 shrink-0 text-alloy-midnight/70";

const navGroups: { label: string; icon: IconComponent; items: NavItem[] }[] = [
    {
        label: "Directory",
        icon: Users,
        items: [
            { href: "/admin/people", label: "People", entityType: "persons" },
            { href: "/admin/customers", label: "Customers", entityType: "customers" },
            { href: "/admin/vendors", label: "Vendors", entityType: "vendors" },
        ],
    },
    {
        label: "Operations",
        icon: Briefcase,
        items: [
            { href: "/admin/opportunities", label: "Opportunities", entityType: "opportunities" },
            { href: "/admin/jobs", label: "Jobs", entityType: "jobs" },
            { href: "/admin/schedules", label: "Schedules", entityType: "schedules" },
            { href: "/admin/documents", label: "Documents", entityType: "documents" },
            { href: "/admin/locations", label: "Locations", entityType: "locations" },
            {
                label: "Workflows",
                subItems: [
                    { href: "/admin/workflows", label: "Builder" },
                    { href: "/admin/workflow-events", label: "Events" },
                    { href: "/admin/workflow-runs", label: "Runs" },
                ],
            },
            { href: "/admin/messaging", label: "Messages", entityType: "messages" },
            {
                label: "Settings",
                subItems: [{ href: "/admin/operations/recurrence", label: "Recurrence" }],
            },
        ],
    },
    {
        label: "Financials",
        icon: DollarSign,
        items: [
            { href: "/admin/financials/payments", label: "Payments", entityType: "payments" },
            { href: "/admin/financials/ledger", label: "Ledger" },
            { href: "/admin/financials/statements", label: "Statements" },
            { href: "/admin/discount-redemptions", label: "Discount Redemptions" },
            { href: "/admin/financials/pricing", label: "Pricing" },
        ],
    },
    {
        label: "System",
        icon: Settings,
        items: [
            { href: "/admin/system/access-control", label: "Access Control" },
            { href: "/admin/system/verticals-industries", label: "Verticals / Industries" },
            { href: "/admin/system/entity-labels", label: "Entity Labels" },
            { href: "/admin/system/statuses", label: "Statuses" },
            {
                label: "Directory Settings",
                subItems: [
                    { href: "/admin/system/customer-person-roles", label: "Person Roles" },
                    { href: "/admin/system/person-fields", label: "Person Fields" },
                    { href: "/admin/system/location-fields", label: "Location Fields" },
                    { href: "/admin/system/person-relationship-types", label: "Relationships" },
                    { href: "/admin/system/db-relationships", label: "DB Relationships" },
                    { href: "/admin/system/customer-fields", label: "Customer Fields" },
                    { href: "/admin/system/job-fields", label: "Job Fields" },
                    { href: "/admin/system/opportunity-fields", label: "Opportunity Fields" },
                    { href: "/admin/system/vendor-fields", label: "Vendor Fields" },
                    { href: "/admin/system/schedule-fields", label: "Schedule Fields" },
                    { href: "/admin/system/document-fields", label: "Document Fields" },
                ],
            },
            { href: "/admin/system/payouts", label: "Payouts" },
        ],
    },
];

function getLinkIcon(href: string, label: string, nestedLabel?: string): IconComponent | null {
    const map: Record<string, IconComponent> = {
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
        "/admin/financials/service-offerings": Tag,
        "/admin/financials/plan-templates": Tag,
        "/admin/financials/add-ons": Tag,
        "/admin/discount-redemptions": Tag,
        "/admin/operations/recurrence": Repeat,
        "/admin/system/access-control": Shield,
        "/admin/system/verticals-industries": LayoutGrid,
        "/admin/system/entity-labels": Tag,
        "/admin/system/statuses": Tag,
        "/admin/system/payouts": DollarSign,
        "/admin/people": Users,
        "/admin/contacts": Users,
        "/admin/customer-members": Users,
        "/admin/customers": Users,
        "/admin/vendors": Users,
    };
    if (map[href]) return map[href];
    if (nestedLabel === "Directory") return Users;
    if (nestedLabel === "Workflows") return GitBranch;
    if (nestedLabel === "Settings") return Settings;
    if (nestedLabel === "Directory Settings") return Tag;
    return null;
}

function getInitialCollapsed(): Record<string, boolean> {
    const defaults = { Directory: false, Operations: false, Financials: true, System: true };
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
    role: string;
    initialEntityLabels?: EntityLabelsMap;
}

function navLinkLabel(link: NavLink, labels: EntityLabelsMap, labelsLoading: boolean): string {
    if (link.entityType) {
        if (labelsLoading) return link.label;
        return getEntityLabel(labels, link.entityType, "plural");
    }
    return link.label;
}

function AdminLayoutInner({ children, userEmail, role }: Omit<AdminLayoutProps, "initialEntityLabels">) {
    const pathname = usePathname();
    const router = useRouter();
    const sidebarScrollRef = useRef<HTMLElement | null>(null);
    const { verticals, selectedVerticalId, setSelectedVerticalId, loading: verticalsLoading } = useAdminVertical();
    const { labels, loading: labelsLoading } = useEntityLabels();

    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getInitialCollapsed);
    const [nestedCollapsed, setNestedCollapsed] = useState<Record<string, boolean>>({ "Operations::Workflows": true, "Operations::Settings": true, "Financials::Settings": true });
    const [profileOpen, setProfileOpen] = useState(false);
    const [verticalOpen, setVerticalOpen] = useState(false);

    useEffect(() => {
        const group = navGroups.find((g) =>
            g.items.some((i) => {
                if (isNestedNavItem(i)) return i.subItems.some((s) => s.href === pathname);
                return (i as NavLink).href === pathname;
            })
        );
        if (group && collapsed[group.label]) {
            setCollapsed((prev) => ({ ...prev, [group.label]: false }));
        }
        const workflowPaths = ["/admin/workflows", "/admin/workflow-events", "/admin/workflow-runs"];
        if (workflowPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["Operations::Workflows"] === false ? prev : { ...prev, "Operations::Workflows": false }));
        }
        if (pathname === "/admin/operations/recurrence") {
            setNestedCollapsed((prev) => (prev["Operations::Settings"] === false ? prev : { ...prev, "Operations::Settings": false }));
        }
        const directorySettingsPaths = ["/admin/system/customer-person-roles", "/admin/system/person-relationship-types", "/admin/system/db-relationships"];
        if (directorySettingsPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev["System::Directory Settings"] === false ? prev : { ...prev, "System::Directory Settings": false }));
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

    useEffect(() => {
        console.log("[AdminLayout DEBUG]", {
            verticalsLoading,
            labelsLoading,
            contextBooting,
            verticalsCount: verticals.length,
            labelKeysCount: Object.keys(labels).length,
        });
    }, [verticalsLoading, labelsLoading, contextBooting, verticals.length, labels]);

    if (contextBooting) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-admin-page p-6 text-alloy-midnight">
                <div
                    className="w-full max-w-md rounded border border-amber-500/80 bg-amber-50 px-4 py-3 font-mono text-xs text-amber-950"
                    data-debug="admin-layout-loading"
                >
                    <div className="mb-1 font-semibold text-amber-900">AdminLayout loading debug (remove me)</div>
                    <div>verticalsLoading: {String(verticalsLoading)}</div>
                    <div>labelsLoading: {String(labelsLoading)}</div>
                    <div>contextBooting: {String(contextBooting)}</div>
                    <div className="mt-2 text-[11px] text-amber-800">
                        verticals: {verticals.length} · label keys: {Object.keys(labels).length}
                    </div>
                </div>
                <div>Loading context...</div>
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
                        {navGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isCollapsed = collapsed[group.label] ?? true;
                            return (
                                <div key={group.label} className="mb-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-alloy-midnight hover:bg-alloy-stone/50 rounded-md gap-2"
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
                                                const isActive = pathname === link.href;
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
                            <AdminPreviewProvider>
                                {children}
                                <RecordPreviewPanel />
                                <AdminEntityDrawer />
                            </AdminPreviewProvider>
                        </AdminDrawerProvider>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default function AdminLayout(props: AdminLayoutProps) {
    const { initialEntityLabels, userEmail, role, children } = props;
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    return (
        <AdminAuthProvider userEmail={safeEmail} role={safeRole}>
            <AdminVerticalProvider>
                <EntityLabelsProvider initialLabels={initialEntityLabels}>
                    <AdminLayoutInner userEmail={safeEmail} role={safeRole}>
                        {children}
                    </AdminLayoutInner>
                </EntityLabelsProvider>
            </AdminVerticalProvider>
        </AdminAuthProvider>
    );
}
