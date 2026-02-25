"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ReactNode } from "react";

interface AdminLayoutProps {
    children: ReactNode;
    userEmail: string;
}

const navItems = [
    { href: "/admin/opportunities", label: "Opportunities" },
    { href: "/admin/jobs", label: "Jobs" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/customer-members", label: "Members" },
    { href: "/admin/contacts", label: "Contacts" },
    { href: "/admin/discounts", label: "Discounts" },
    { href: "/admin/discount-redemptions", label: "Discount Redemptions" },
    { href: "/admin/verticals", label: "Verticals" },
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

                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        {navItems.map((item) => {
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
    );
}

