import Link from "next/link";
import { createAdminClient } from "@/lib/supabaseAdmin";

async function getCounts() {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const [jobsRes, opportunitiesRes, customersRes, schedulesRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("opportunities").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("schedules").select("id", { count: "exact", head: true }).gte("start_at", now),
    ]);

    return {
        jobs: jobsRes.count ?? 0,
        opportunities: opportunitiesRes.count ?? 0,
        customers: customersRes.count ?? 0,
        upcomingSchedules: schedulesRes.count ?? 0,
    };
}

export default async function AdminDashboardPage() {
    let counts = { jobs: 0, opportunities: 0, customers: 0, upcomingSchedules: 0 };
    try {
        counts = await getCounts();
    } catch (e) {
        console.error("Admin dashboard counts:", e);
    }

    const cards = [
        { label: "Jobs", value: counts.jobs, href: "/admin/jobs" },
        { label: "Opportunities", value: counts.opportunities, href: "/admin/opportunities" },
        { label: "Customers", value: counts.customers, href: "/admin/customers" },
        { label: "Upcoming Schedules", value: counts.upcomingSchedules, href: "/admin/schedules" },
    ];

    return (
        <div className="space-y-8">
            <h1 className="text-2xl font-bold text-alloy-midnight">Admin Dashboard</h1>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                    <Link
                        key={card.label}
                        href={card.href}
                        className="rounded-xl border border-alloy-stone/30 bg-white p-6 shadow-sm transition-colors hover:border-alloy-blue/30 hover:shadow-md"
                    >
                        <p className="text-sm font-medium text-alloy-midnight/60">{card.label}</p>
                        <p className="mt-2 text-3xl font-bold text-alloy-midnight">{card.value}</p>
                    </Link>
                ))}
            </section>
        </div>
    );
}
