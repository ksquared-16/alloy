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
    MessageSquare,
    Receipt,
    Settings,
    Shield,
    Tag,
    Users,
} from "lucide-react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import { AdminVerticalProvider, useAdminVertical } from "@/contexts/AdminVerticalContext";
import { EntityLabelsProvider, useEntityLabels } from "@/contexts/EntityLabelsContext";
import AlloyLogo from "@/components/admin/AlloyLogo";

const SIDEBAR_STORAGE_KEY = "admin_sidebar_collapsed";
const SIDEBAR_SCROLL_KEY = "adminSidebarScrollTop";

type NavLink = { href: string; label: string; entityType?: string };
type NavItem = NavLink | { label: string; subItems: NavLink[] };
function isNestedNavItem(item: NavItem): item is { label: string; subItems: NavLink[] } {
    return "subItems" in item && Array.isArray((item as { subItems: unknown }).subItems);
}

type IconComponent = React.ComponentType<{ className?: string }>;
const iconClass = "h-4 w-4 shrink-0 text-[#59678b]/80";

const navGroups: { label: string; icon: IconComponent; items: NavItem[] }[] = [
    {
        label: "Operations",
        icon: Briefcase,
        items: [
            { href: "/admin/opportunities", label: "Opportunities", entityType: "opportunities" },
            { href: "/admin/jobs", label: "Jobs", entityType: "jobs" },
            { href: "/admin/schedules", label: "Schedules", entityType: "schedules" },
            {
                label: "People",
                subItems: [
                    { href: "/admin/customers", label: "Customers", entityType: "customers" },
                    { href: "/admin/contacts", label: "Contacts", entityType: "contacts" },
                    { href: "/admin/customer-members", label: "Members", entityType: "customer_members" },
                    { href: "/admin/vendors", label: "Vendors", entityType: "vendors" },
                ],
            },
            {
                label: "Workflows",
                subItems: [
                    { href: "/admin/workflows", label: "Builder" },
                    { href: "/admin/workflow-events", label: "Events" },
                    { href: "/admin/workflow-runs", label: "Runs" },
                ],
            },
            { href: "/admin/messaging", label: "Messaging", entityType: "messages" },
            { href: "/admin/messages-outbox", label: "Outbox" },
        ],
    },
    {
        label: "Financials",
        icon: DollarSign,
        items: [
            { href: "/admin/financials/ledger", label: "Ledger" },
            { href: "/admin/financials/statements", label: "Statements" },
            { href: "/admin/financials/payments", label: "Payments", entityType: "payments" },
            { href: "/admin/subscriptions", label: "Subscriptions", entityType: "subscriptions" },
            { href: "/admin/financials/pricing", label: "Pricing" },
            { href: "/admin/discount-redemptions", label: "Discount Redemptions" },
            {
                label: "Settings",
                subItems: [
                    { href: "/admin/discounts", label: "Discounts" },
                    { href: "/admin/financials/accounts", label: "GL Account Setup" },
                    { href: "/admin/financials/settings/subscription", label: "Subscription Setup" },
                    { href: "/admin/financials/pricing", label: "Pricing setup" },
                ],
            },
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
            { href: "/admin/system/db-relationships", label: "DB Relationships" },
        ],
    },
];

function getLinkIcon(href: string, label: string, nestedLabel?: string): IconComponent | null {
    const map: Record<string, IconComponent> = {
        "/admin/opportunities": LayoutGrid,
        "/admin/jobs": Briefcase,
        "/admin/schedules": Calendar,
        "/admin/messaging": MessageSquare,
        "/admin/messages-outbox": Mail,
        "/admin/financials/ledger": FileText,
        "/admin/financials/statements": Receipt,
        "/admin/financials/payments": DollarSign,
        "/admin/subscriptions": Receipt,
        "/admin/financials/pricing": Tag,
        "/admin/discount-redemptions": Tag,
        "/admin/system/access-control": Shield,
        "/admin/system/verticals-industries": LayoutGrid,
        "/admin/system/entity-labels": Tag,
        "/admin/system/statuses": Tag,
        "/admin/system/db-relationships": GitBranch,
    };
    if (map[href]) return map[href];
    if (nestedLabel === "People") return Users;
    if (nestedLabel === "Workflows") return GitBranch;
    if (nestedLabel === "Settings") return Settings;
    return null;
}

function getInitialCollapsed(): Record<string, boolean> {
    const defaults = { Operations: false, Financials: true, System: true };
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
}

function navLinkLabel(link: NavLink, labels: Record<string, { singular: string | null; plural: string | null }>): string {
    if (link.entityType && labels[link.entityType]?.plural) return labels[link.entityType].plural!;
    return link.label;
}

function AdminLayoutInner({ children, userEmail, role }: AdminLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const sidebarScrollRef = useRef<HTMLElement | null>(null);
    const { verticals, selectedVerticalId, setSelectedVerticalId, loading: verticalsLoading } = useAdminVertical();
    const { labels } = useEntityLabels();
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getInitialCollapsed);
    const [nestedCollapsed, setNestedCollapsed] = useState<Record<string, boolean>>({ People: true, Workflows: true, Settings: true });
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
        const peoplePaths = ["/admin/customers", "/admin/contacts", "/admin/customer-members", "/admin/vendors"];
        const workflowPaths = ["/admin/workflows", "/admin/workflow-events", "/admin/workflow-runs"];
        const financialsSettingsPaths = ["/admin/financials/pricing", "/admin/discounts", "/admin/financials/accounts", "/admin/financials/settings/subscription"];
        if (peoplePaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev.People === false ? prev : { ...prev, People: false }));
        }
        if (workflowPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev.Workflows === false ? prev : { ...prev, Workflows: false }));
        }
        if (financialsSettingsPaths.includes(pathname)) {
            setNestedCollapsed((prev) => (prev.Settings === false ? prev : { ...prev, Settings: false }));
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

    return (
        <div className="min-h-screen bg-alloy-stone flex">
            <aside className="w-64 bg-white border-r border-alloy-stone/30 flex flex-col">
                <div className="p-5 border-b border-[#e6e8ec]">
                    <Link href="/admin" className="block" aria-label="Home">
                        <AlloyLogo />
                    </Link>
                    <p className="mt-2 text-xs text-[#59678b]">Admin</p>
                </div>
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
                                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#59678b] hover:bg-[#F4F6F9] rounded-md gap-2"
                                >
                                    <span className="flex items-center gap-2">
                                        {GroupIcon && <GroupIcon className={iconClass} />}
                                        {group.label}
                                    </span>
                                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-[#59678b]/70" /> : <ChevronDown className="h-3.5 w-3.5 text-[#59678b]/70" />}
                                </button>
                                {!isCollapsed && (
                                    <ul className="mt-1.5 space-y-0.5">
                                        {group.items.map((item) => {
                                            if (isNestedNavItem(item)) {
                                                const isNestedOpen = !(nestedCollapsed[item.label] ?? true);
                                                const hasActiveChild = item.subItems.some((s) => s.href === pathname);
                                                const NestedIcon = getLinkIcon("", item.label, item.label);
                                                return (
                                                    <li key={item.label}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleNested(item.label)}
                                                            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-md text-sm font-medium transition-colors text-left gap-2 ${hasActiveChild ? "bg-[#31394d] text-white border-l-2 border-[#DBC078]" : "text-[#45506c] hover:bg-[#F4F6F9] hover:text-[#31394d]"}`}
                                                        >
                                                            <span className="flex items-center gap-2 min-w-0">
                                                                {NestedIcon && <NestedIcon className={`${iconClass} ${hasActiveChild ? "text-white/80" : ""}`} />}
                                                                <span className="truncate">{item.label}</span>
                                                            </span>
                                                            {isNestedOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                                                        </button>
                                                        {isNestedOpen && (
                                                            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-[#e6e8ec] pl-2">
                                                                {item.subItems.map((sub) => {
                                                                    const isActive = pathname === sub.href;
                                                                    const displayLabel = navLinkLabel(sub, labels);
                                                                    return (
                                                                        <li key={sub.href}>
                                                                            <Link
                                                                                href={sub.href}
                                                                                className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-[#31394d] text-white border-l-2 border-[#DBC078]" : "text-[#45506c] hover:bg-[#F4F6F9] hover:text-[#31394d]"}`}
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
                                            const displayLabel = navLinkLabel(link, labels);
                                            return (
                                                <li key={link.href}>
                                                    <Link
                                                        href={link.href}
                                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-[#31394d] text-white border-l-2 border-[#DBC078]" : "text-[#45506c] hover:bg-[#F4F6F9] hover:text-[#31394d]"}`}
                                                    >
                                                        {LinkIcon && <LinkIcon className={`${iconClass} ${isActive ? "text-white/80" : ""}`} />}
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
            <main className="flex-1 overflow-auto flex flex-col">
                <header className="flex-shrink-0 flex items-center justify-end gap-4 px-6 py-3 bg-white border-b border-alloy-stone/30">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => { setVerticalOpen((o) => !o); setProfileOpen(false); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-alloy-midnight/80 border border-alloy-stone/40 rounded-md hover:bg-alloy-stone/30"
                        >
                            Vertical: {selectedVerticalId ? verticals.find((v) => v.id === selectedVerticalId)?.name ?? selectedVerticalId.slice(0, 8) : "All"}
                        </button>
                        {verticalOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setVerticalOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-alloy-stone/30 rounded-md shadow-lg z-20 min-w-[180px]">
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedVerticalId(null); setVerticalOpen(false); }}
                                        className="block w-full text-left px-4 py-2 text-sm hover:bg-alloy-stone/30"
                                    >
                                        All
                                    </button>
                                    {verticals.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => { setSelectedVerticalId(v.id); setVerticalOpen(false); }}
                                            className="block w-full text-left px-4 py-2 text-sm hover:bg-alloy-stone/30"
                                        >
                                            {v.name ?? v.slug ?? v.id.slice(0, 8)}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => { setProfileOpen((o) => !o); setVerticalOpen(false); }}
                            className="w-9 h-9 rounded-full bg-alloy-blue text-white text-sm font-medium flex items-center justify-center"
                        >
                            {getInitials(userEmail)}
                        </button>
                        {profileOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 py-2 bg-white border border-alloy-stone/30 rounded-md shadow-lg z-20 min-w-[220px]">
                                    <p className="px-4 py-2 text-sm text-alloy-midnight/70 border-b border-alloy-stone/20">Signed in as {userEmail}</p>
                                    <button type="button" onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-alloy-midnight hover:bg-alloy-stone/30">Sign out</button>
                                </div>
                            </>
                        )}
                    </div>
                </header>
                <div className="p-8 flex-1">
                    <AdminDrawerProvider>
                        {children}
                        <AdminEntityDrawer />
                    </AdminDrawerProvider>
                </div>
            </main>
        </div>
    );
}

export default function AdminLayout(props: AdminLayoutProps) {
    return (
        <AdminAuthProvider userEmail={props.userEmail} role={props.role}>
            <AdminVerticalProvider>
                <EntityLabelsProvider>
                    <AdminLayoutInner {...props} />
                </EntityLabelsProvider>
            </AdminVerticalProvider>
        </AdminAuthProvider>
    );
}
