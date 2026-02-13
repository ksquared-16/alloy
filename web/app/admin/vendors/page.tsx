import { createAdminClient } from "@/lib/supabaseAdmin";
import VendorsClient from "./VendorsClient";

export default async function VendorsPage() {
    const supabase = createAdminClient();

    const { data: vendors, error: vendorsError } = await supabase
        .from("vendors")
        .select("id, created_at, submitted_at, name, email, phone, vendor_status_id, service_area_zip_codes, days_available")
        .order("created_at", { ascending: false })
        .limit(1000);

    let statusById: Record<string, { key: string; label: string }> = {};
    const statusRes = await supabase
        .from("vendor_statuses")
        .select("id, key, label");
    if (!statusRes.error && statusRes.data) {
        statusById = Object.fromEntries(
            statusRes.data.map((s) => [s.id, { key: s.key ?? "", label: s.label ?? "" }])
        );
    }

    const rows = (vendors || []).map((v) => {
        const status = v.vendor_status_id ? statusById[v.vendor_status_id] : null;
        return {
            ...v,
            _vendor_status_key: status?.key ?? "",
            _vendor_status_label: status?.label ?? "",
        };
    });

    if (vendorsError) {
        console.error("Error fetching vendors:", vendorsError);
    }

    return (
        <VendorsClient initialData={rows} error={vendorsError?.message} />
    );
}
