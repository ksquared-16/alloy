"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import { AdminVerticalProvider, useAdminVertical } from "@/contexts/AdminVerticalContext";

const SIDEBAR_STORAGE_KEY = "admin_sidebar_collapsed";

const navGroups: { label: string; items: { href: string; label: string }[] }[] = [
    { label: "Core", items: [{ href: "/admin/dashboard", label: "Dashboard" }, { href: "/admin/opportunities", label: "Opportunities" }, { href: "/admin/jobs", label: "Jobs" }, { href: "/admin/schedules", label: "Schedules" }] },
    { label: "People", items: [{ href: "/admin/customers", label: "Customers" }, { href: "/admin/contacts", label: "Contacts" }, { href: "/admin/vendors", label: "Vendors" }] },
    { label: "Billing & Pricing", items: [{ href: "/admin/discounts", label: "Discounts" }, { href: "/admin/discount-redemptions", label: "Discount Redemptions" }, { href: "/admin/subscriptions", label: "Subscriptions" }] },
    { label: "System", items: [{ href: "/admin/verticals", label: "Verticals" }, { href: "/admin/workflows", label: "Workflows" }, { href: "/admin/messaging", label: "Messaging" }, { href: "/admin/messages-outbox", label: "Messages outbox" }, { href: "/admin/settings", label: "Settings" }] },
];

function getInitialCollapsed(): Record<string, boolean> {
    if (typeof window === "undefined") {
        return { Core: false, People: true, "Billing & Pricing": true, System: true };
    }
    try {
        const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Record<string, boolean>;
            return { ...{ Core: false, People: true, "Billing & Pricing": true, System: true }, ...parsed };
        }
    } catch (_) {}
    return { Core: false, People: true, "Billing & Pricing": true, System: true };
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

function AdminLayoutInner({ children, userEmail, role }: AdminLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { verticals, selectedVerticalId, setSelectedVerticalId, loading: verticalsLoading } = useAdminVertical();
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getInitialCollapsed);
    const [profileOpen, setProfileOpen] = useState(false);
    const [verticalOpen, setVerticalOpen] = useState(false);

    useEffect(() => {
        const group = navGroups.find((g) => g.items.some((i) => i.href === pathname));
        if (group && collapsed[group.label]) {
            setCollapsed((prev) => ({ ...prev, [group.label]: false }));
        }
    }, [pathname]);

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(collapsed));
        } catch (_) {}
    }, [collapsed]);

    const toggleGroup = useCallback((label: string) => {
        setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
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
                <div className="p-4 border-b border-alloy-stone/30">
                    <h1 className="text-xl font-bold text-alloy-midnight">Admin</h1>
                </div>
                <nav className="flex-1 overflow-y-auto p-4">
                    {navGroups.map((group) => {
                        const isCollapsed = collapsed[group.label] ?? true;
                        return (
                            <div key={group.label} className="mb-4">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.label)}
                                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-alloy-midnight/50 hover:bg-alloy-stone/50 rounded"
                                >
                                    <span>{group.label}</span>
                                    <span className="text-alloy-midnight/40">{isCollapsed ? "▶" : "▼"}</span>
                                </button>
                                {!isCollapsed && (
                                    <ul className="space-y-1 mt-1">
                                        {group.items.map((item) => {
                                            const isActive = pathname === item.href;
                                            return (
                                                <li key={item.href}>
                                                    <Link
                                                        href={item.href}
                                                        className={`block px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-alloy-blue text-white" : "text-alloy-midnight/70 hover:bg-alloy-stone hover:text-alloy-midnight"}`}
                                                    >
                                                        {item.label}
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
                <AdminLayoutInner {...props} />
            </AdminVerticalProvider>
        </AdminAuthProvider>
    );
}
