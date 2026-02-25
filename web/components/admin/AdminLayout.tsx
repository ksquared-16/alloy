"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode } from "react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { EntityLabelsProvider, useEntityLabels } from "@/contexts/EntityLabelsContext";

interface AdminLayoutProps {
    children: ReactNode;
    userEmail: string;
    role: string;
}

const PEOPLE_ENTITY_TYPES = [
    { href: "/admin/customers", label: "Customers", entityType: null as string | null },
    { href: "/admin/contacts", label: "Contacts", entityType: null as string | null },
    { href: "/admin/customer-members", entityType: "customer_members" as const },
] as const;

const OTHER_NAV_ITEMS = [
    { href: "/admin/opportunities", label: "Opportunities" },
    { href: "/admin/jobs", label: "Jobs" },
    { href: "/admin/discounts", label: "Discounts" },
    { href: "/admin/discount-redemptions", label: "Discount Redemptions" },
    { href: "/admin/verticals", label: "Verticals" },
    { href: "/admin/entity-labels", label: "Entity Labels" },
    { href: "/admin/system/settings", label: "System Settings" },
];

function NavContent() {
    const pathname = usePathname();
    const { getLabel } = useEntityLabels();
    const customerMembersPlural = getLabel("customer_members", "plural");

    return (
        <ul className="space-y-1">
            <li className="pt-2 pb-1">
                <span className="px-4 text-xs font-semibold text-alloy-midnight/50 uppercase tracking-wider">
                    People
                </span>
            </li>
            {PEOPLE_ENTITY_TYPES.map((item) => {
                const label =
                    item.entityType === "customer_members"
                        ? customerMembersPlural
                        : (item as { label: string }).label;
                const href = item.href;
                const isActive = pathname === href;
                return (
                    <li key={href}>
                        <Link
                            href={href}
                            className={`
                                block px-4 py-2 rounded-md text-sm font-medium transition-colors
                                ${isActive
                                    ? "bg-alloy-blue text-white"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone hover:text-alloy-midnight"}
                            `}
                        >
                            {label}
                        </Link>
                    </li>
                );
            })}
            <li className="pt-2 pb-1">
                <span className="px-4 text-xs font-semibold text-alloy-midnight/50 uppercase tracking-wider">
                    Other
                </span>
            </li>
            {OTHER_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            className={`
                                block px-4 py-2 rounded-md text-sm font-medium transition-colors
                                ${isActive
                                    ? "bg-alloy-blue text-white"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone hover:text-alloy-midnight"}
                            `}
                        >
                            {item.label}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

export default function AdminLayout({ children, userEmail, role }: AdminLayoutProps) {
    const router = useRouter();

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    return (
        <AdminAuthProvider role={role}>
            <EntityLabelsProvider>
                <div className="min-h-screen bg-alloy-stone flex">
                    {/* Left Sidebar */}
                    <aside className="w-64 bg-white border-r border-alloy-stone/30 flex flex-col">
                        <div className="p-6 border-b border-alloy-stone/30">
                            <h1 className="text-xl font-bold text-alloy-midnight">Admin</h1>
                            <p className="text-xs text-alloy-midnight/60 mt-1">{userEmail}</p>
                        </div>

                        <nav className="flex-1 p-4">
                            <NavContent />
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
                        <div className="p-8">{children}</div>
                    </main>
                </div>
            </EntityLabelsProvider>
        </AdminAuthProvider>
    );
}

