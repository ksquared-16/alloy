"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/admin/Drawer";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <strong className="text-alloy-midnight/70">{label}:</strong> {value ?? "-"}
        </div>
    );
}

function DrawerLink({ label, id, type }: { label: string; id: string | null; type: "contacts" | "customers" | "opportunities" | "jobs" }) {
    const { openDrawer } = useAdminDrawer();
    if (!id) return <Field label={label} value="-" />;
    return (
        <div>
            <strong className="text-alloy-midnight/70">{label}:</strong>{" "}
            <button
                type="button"
                onClick={() => openDrawer({ type, id })}
                className="text-alloy-blue hover:underline"
            >
                {id.slice(0, 8)}…
            </button>
        </div>
    );
}

export default function AdminEntityDrawer() {
    const { drawer, closeDrawer } = useAdminDrawer();
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!drawer.type || !drawer.id) {
            setData(null);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`/api/admin/entity/${drawer.type}/${drawer.id}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                return res.json();
            })
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [drawer.type, drawer.id]);

    if (!drawer.type || !drawer.id) return null;

    const title = data
        ? drawer.type === "contacts"
            ? `Contact: ${[data.first_name, data.last_name].filter(Boolean).join(" ") || drawer.id}`
            : drawer.type === "customers"
              ? `Customer: ${(data.name as string) || drawer.id}`
              : drawer.type === "opportunities"
                ? `Opportunity: ${(data.name as string) || drawer.id}`
                : drawer.type === "jobs"
                  ? `Job: ${(data.title as string) || drawer.id}`
                  : `Schedule: ${drawer.id}`
        : loading
          ? "Loading…"
          : "Details";

    return (
        <Drawer
            isOpen
            onClose={closeDrawer}
            title={title}
            zIndexBackdrop={60}
            zIndexPanel={70}
        >
            {loading && <p className="text-alloy-midnight/60">Loading…</p>}
            {error && <p className="text-red-600">Error: {error}</p>}
            {data && !loading && (
                <div className="space-y-4">
                    {drawer.type === "contacts" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={data.created_at ? new Date(data.created_at as string).toLocaleString() : null} />
                            <Field label="First Name" value={data.first_name as string} />
                            <Field label="Last Name" value={data.last_name as string} />
                            <Field label="Email" value={data.email as string} />
                            <Field label="Phone" value={data.phone as string} />
                            <Field label="Status" value={data.status as string} />
                            <DrawerLink label="Customer" id={(data.customer_id as string) ?? null} type="customers" />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "customers" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={data.created_at ? new Date(data.created_at as string).toLocaleString() : null} />
                            <Field label="Name" value={data.name as string} />
                            <Field label="Status" value={data.status as string} />
                            <Field label="Stripe Customer ID" value={data.stripe_customer_id as string} />
                            <Field label="Payment Method ID" value={data.default_payment_method_id as string} />
                            <Field label="Vertical ID" value={data.vertical_id as string} />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "opportunities" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={data.created_at ? new Date(data.created_at as string).toLocaleString() : null} />
                            <Field label="Name" value={data.name as string} />
                            <Field label="Status" value={data.status as string} />
                            <Field label="Job Date" value={data.job_date as string} />
                            <Field label="Time Window" value={data.job_time_window as string} />
                            <Field label="Quote Total" value={data.quote_total != null ? `$${((data.quote_total as number) / 100).toFixed(2)}` : null} />
                            <DrawerLink label="Customer" id={(data.customer_id as string) ?? null} type="customers" />
                            <DrawerLink label="Primary Contact" id={(data.primary_contact_id as string) ?? null} type="contacts" />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "jobs" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={data.created_at ? new Date(data.created_at as string).toLocaleString() : null} />
                            <Field label="Title" value={data.title as string} />
                            <Field label="Recurring" value={data.is_recurring ? "Yes" : "No"} />
                            <Field label="Scheduled" value={data.scheduled_at ? new Date(data.scheduled_at as string).toLocaleString() : null} />
                            <Field label="Status ID" value={data.job_status_id as string} />
                            <Field label="Gross Price" value={data.gross_price_cents != null ? `$${((data.gross_price_cents as number) / 100).toFixed(2)}` : null} />
                            <Field label="Payout" value={data.contractor_payout_cents != null ? `$${((data.contractor_payout_cents as number) / 100).toFixed(2)}` : null} />
                            <DrawerLink label="Opportunity" id={(data.opportunity_id as string) ?? null} type="opportunities" />
                            <DrawerLink label="Primary Contact" id={(data.primary_contact_id as string) ?? null} type="contacts" />
                            <DrawerLink label="Customer" id={(data.customer_id as string) ?? null} type="customers" />
                            <Field label="Offer Code" value={data.offer_code as string} />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "schedules" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Job ID" value={data.job_id as string} />
                            <Field label="Start" value={data.start_at ? new Date(data.start_at as string).toLocaleString() : null} />
                            <Field label="End" value={data.end_at ? new Date(data.end_at as string).toLocaleString() : null} />
                            <Field label="Timezone" value={data.timezone as string} />
                        </>
                    )}
                </div>
            )}
        </Drawer>
    );
}
