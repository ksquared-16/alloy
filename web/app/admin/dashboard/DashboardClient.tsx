"use client";

import Link from "next/link";
import { useEntityLabels, getEntityLabel } from "@/contexts/EntityLabelsContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import KpiCard from "@/components/admin/KpiCard";
import SectionCard from "@/components/admin/SectionCard";
import EmptyState from "@/components/admin/EmptyState";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import type { FinancialSnapshot } from "@/lib/financials";

export interface DashboardData {
    jobs: { total: number; withDefaultVendor: number };
    opportunities: { total: number; booked: number; notBooked: number; byStage: Record<string, number> };
    schedules: { upcoming: number; unassigned: number; offered: number; accepted: number; canceled: number };
    vendors: { pending: number; approved: number; suspended: number };
    attention: { unassignedSchedules: number; offeredNotAccepted: number; failedWorkflowRuns: number; messageOutboxFailures: number };
    upcomingSchedules: { id: string; start_at: string; end_at: string; _job_title: string | null; _customer_name: string | null; _assignment_status: string | null }[];
    financialSnapshot: FinancialSnapshot | null;
}

interface DashboardClientProps {
    data: DashboardData;
}

export default function DashboardClient({ data }: DashboardClientProps) {
    const { jobs, opportunities, schedules, vendors, attention, upcomingSchedules, financialSnapshot } = data;
    const { labels } = useEntityLabels();
    const jobPlural = getEntityLabel(labels, "jobs", "plural");
    const vendorSingular = getEntityLabel(labels, "vendors", "singular");
    const vendorPlural = getEntityLabel(labels, "vendors", "plural");
    const schedulePlural = getEntityLabel(labels, "schedules", "plural");
    const opportunityPlural = getEntityLabel(labels, "opportunities", "plural");

    return (
        <div className="space-y-8">
            <AdminPageHeader
                title="Alloy Admin"
                subtitle={`Overview of ${jobPlural.toLowerCase()}, opportunities, ${schedulePlural.toLowerCase()}, and ${vendorPlural.toLowerCase()}.`}
            />

            {/* KPI row */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard value={jobs.total} label={jobPlural} href="/admin/jobs" accent="navy" />
                <KpiCard value={jobs.withDefaultVendor} label={`${jobPlural} with default ${vendorSingular.toLowerCase()}`} href="/admin/jobs" accent="gold" />
                <KpiCard value={opportunities.total} label={opportunityPlural} href="/admin/opportunities" accent="slate" />
                <KpiCard value={opportunities.booked} label={`${opportunityPlural} booked`} href="/admin/opportunities" accent="juniper" />
            </section>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard value={schedules.upcoming} label="Upcoming schedules" href="/admin/schedules" accent="navy" />
                <KpiCard value={schedules.unassigned} label="Unassigned" href="/admin/schedules" />
                <KpiCard value={schedules.offered} label="Offered" href="/admin/schedules" accent="gold" />
                <KpiCard value={schedules.accepted} label="Accepted" href="/admin/schedules" accent="juniper" />
                <KpiCard value={schedules.canceled} label="Canceled" href="/admin/schedules" />
            </section>

            {/* Financial Snapshot (GL-derived) */}
            {financialSnapshot && (
                <SectionCard title="Financial snapshot">
                    <p className="text-xs text-[#59678b] mb-3">Month-to-date and current balances from the general ledger.</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">MTD Revenue</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.mtd_revenue_cents)}</p></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">MTD Contractor COGS</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.mtd_contractor_cogs_cents)}</p></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">MTD Stripe Fees</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.mtd_stripe_fees_cents)}</p></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">MTD Discounts</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.mtd_discounts_cents)}</p></div>
                        <div className="rounded-lg bg-[#e6d3a0]/30 px-3 py-2 border border-[#DBC078]/50"><span className="text-xs text-[#59678b]">MTD Net Income</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.mtd_net_income_cents)}</p></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">Stripe Clearing (1000)</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.stripe_clearing_cents)}</p></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-3 py-2"><span className="text-xs text-[#59678b]">Contractor Payable (2000)</span><p className="font-semibold text-[#31394d]">{formatMoneyFromCents(financialSnapshot.contractor_payable_cents)}</p></div>
                    </div>
                    <Link href="/admin/financials/ledger" className="inline-block mt-3 text-sm text-[#00458C] hover:underline">View Ledger</Link>
                </SectionCard>
            )}

            {/* Pipeline / funnel tiles */}
            <section className="grid gap-4 sm:grid-cols-2">
                <SectionCard title={`${vendorSingular} funnel`}>
                    <div className="flex flex-wrap gap-4">
                        <div className="rounded-lg bg-[#F4F6F9] px-4 py-2"><span className="text-xs text-[#59678b]">Pending</span><span className="ml-2 font-semibold text-[#31394d]">{vendors.pending}</span></div>
                        <div className="rounded-lg bg-[#e6d3a0]/30 px-4 py-2 border border-[#DBC078]/50"><span className="text-xs text-[#59678b]">Approved</span><span className="ml-2 font-semibold text-[#31394d]">{vendors.approved}</span></div>
                        <div className="rounded-lg bg-[#F4F6F9] px-4 py-2"><span className="text-xs text-[#59678b]">Suspended</span><span className="ml-2 font-semibold text-[#31394d]">{vendors.suspended}</span></div>
                    </div>
                </SectionCard>
                <SectionCard title="Opportunity pipeline">
                    <div className="flex flex-wrap gap-4">
                        {Object.entries(opportunities.byStage).map(([stage, count]) => (
                            <div key={stage} className="rounded-lg bg-[#F4F6F9] px-4 py-2">
                                <span className="text-xs text-[#59678b] capitalize">{stage}</span>
                                <span className="ml-2 font-semibold text-[#31394d]">{count}</span>
                            </div>
                        ))}
                        {Object.keys(opportunities.byStage).length === 0 && <p className="text-sm text-[#59678b]">No stage breakdown</p>}
                    </div>
                </SectionCard>
            </section>

            {/* Two-column: Upcoming schedules table | Attention + Quick Actions */}
            <section className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <SectionCard title="Upcoming schedules (next 7 days)">
                        {upcomingSchedules.length === 0 ? (
                            <EmptyState title="No upcoming schedules" description="Schedules in the next 7 days will appear here." action={<Link href="/admin/schedules" className="text-sm font-medium text-[#00458C] hover:underline">View all schedules</Link>} />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e6e8ec]">
                                            <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Start</th>
                                            <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Job</th>
                                            <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Customer</th>
                                            <th className="pb-2 text-left font-semibold text-[#59678b]">Assignment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {upcomingSchedules.slice(0, 10).map((s) => (
                                            <tr key={s.id} className="hover:bg-[#F4F6F9]/50">
                                                <td className="py-2.5 pr-4 text-[#31394d]">{formatDateTime(s.start_at)}</td>
                                                <td className="py-2.5 pr-4 text-[#31394d]">{s._job_title ?? "—"}</td>
                                                <td className="py-2.5 pr-4 text-[#59678b]">{s._customer_name ?? "—"}</td>
                                                <td className="py-2.5 text-[#59678b]">{s._assignment_status ?? "Unassigned"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {upcomingSchedules.length > 10 && <p className="mt-2 text-xs text-[#59678b]">Showing 10 of {upcomingSchedules.length}</p>}
                            </div>
                        )}
                    </SectionCard>
                </div>
                <div className="space-y-6">
                    <SectionCard title="Attention needed">
                        <ul className="space-y-2 text-sm">
                            {attention.unassignedSchedules > 0 && <li><Link href="/admin/schedules" className="text-[#00458C] hover:underline">Unassigned schedules: {attention.unassignedSchedules}</Link></li>}
                            {attention.offeredNotAccepted > 0 && <li><Link href="/admin/schedules" className="text-[#00458C] hover:underline">Offered (not accepted): {attention.offeredNotAccepted}</Link></li>}
                            {attention.failedWorkflowRuns > 0 && <li><Link href="/admin/workflows" className="text-[#BC4300] hover:underline">Failed workflow runs: {attention.failedWorkflowRuns}</Link></li>}
                            {attention.messageOutboxFailures > 0 && <li><Link href="/admin/messages-outbox" className="text-[#BC4300] hover:underline">Message outbox failures: {attention.messageOutboxFailures}</Link></li>}
                            {attention.unassignedSchedules === 0 && attention.offeredNotAccepted === 0 && attention.failedWorkflowRuns === 0 && attention.messageOutboxFailures === 0 && <li className="text-[#59678b]">Nothing needs attention right now.</li>}
                        </ul>
                    </SectionCard>
                    <SectionCard title="Quick actions">
                        <div className="flex flex-col gap-2">
                            <Link href="/admin/schedules" className="text-sm text-[#00458C] hover:underline">View Schedules</Link>
                            <Link href="/admin/vendors" className="text-sm text-[#00458C] hover:underline">View {vendorPlural}</Link>
                            <Link href="/admin/messages-outbox" className="text-sm text-[#00458C] hover:underline">View Messages Outbox</Link>
                            <Link href="/admin/opportunities" className="text-sm text-[#00458C] hover:underline">View Opportunities</Link>
                            <Link href="/admin/jobs" className="text-sm text-[#00458C] hover:underline">View Jobs</Link>
                        </div>
                    </SectionCard>
                </div>
            </section>
        </div>
    );
}
