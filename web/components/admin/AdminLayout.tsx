"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode } from "react";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";

interface AdminLayoutProps {
    children: ReactNode;
    userEmail: string;
}

const navGroups: { label: string; items: { href: string; label: string }[] }[] = [
    {
        label: "Core",
        items: [
            { href: "/admin/dashboard", label: "Dashboard" },
            { href: "/admin/opportunities", label: "Opportunities" },
            { href: "/admin/jobs", label: "Jobs" },
            { href: "/admin/schedules", label: "Schedules" },
        ],
    },
    {
        label: "People",
        items: [
            { href: "/admin/customers", label: "Customers" },
            { href: "/admin/contacts", label: "Contacts" },
            { href: "/admin/contractors", label: "Contractors" },
        ],
    },
    {
        label: "Billing & Pricing",
        items: [
            { href: "/admin/discounts", label: "Discounts" },
            { href: "/admin/discount-redemptions", label: "Discount Redemptions" },
            { href: "/admin/subscriptions", label: "Subscriptions" },
        ],
    },
    {
        label: "System",
        items: [
            { href: "/admin/verticals", label: "Verticals" },
            { href: "/admin/workflows", label: "Workflows" },
            { href: "/admin/messaging", label: "Messaging" },
            { href: "/admin/settings", label: "Settings" },
        ],
    },
];

export default function AdminLayout({ children, userEmail }: AdminLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    return (
        <div className="min-h-screen bg-alloy-stone flex">
            {/* Left Sidebar */}
            <aside className="w-64 bg-white border-r border-alloy-stone/30 flex flex-col">
                <div className="p-6 border-b border-alloy-stone/30">
                    <h1 className="text-xl font-bold text-alloy-midnight">Admin</h1>
                    <p className="text-xs text-alloy-midnight/60 mt-1">{userEmail}</p>
                </div>

                <nav className="flex-1 overflow-y-auto p-4">
                    {navGroups.map((group) => (
                        <div key={group.label} className="mb-6">
                            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-alloy-midnight/50">
                                {group.label}
                            </p>
                            <ul className="space-y-1">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                className={`
                                                    block px-4 py-2 rounded-md text-sm font-medium transition-colors
                                                    ${isActive
                                                        ? "bg-alloy-blue text-white"
                                                        : "text-alloy-midnight/70 hover:bg-alloy-stone hover:text-alloy-midnight"
                                                    }
                                                `}
                                            >
                                                {item.label}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-alloy-stone/30">
                    <button
                        onClick={handleSignOut}
                        className="w-full px-4 py-2 text-sm font-medium text-alloy-midnight/70 hover:bg-alloy-stone rounded-md transition-colors"
                    >
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="p-8">
                    <AdminDrawerProvider>
                        {children}
                        <AdminEntityDrawer />
                    </AdminDrawerProvider>
                </div>
            </main>
        </div>
    );
}
