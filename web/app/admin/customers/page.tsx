import { createAdminClient } from "@/lib/supabaseAdmin";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
    const supabase = createAdminClient();

    const { data: customers, error } = await supabase
        .from("customers")
        .select(
            "id, created_at, name, status, stripe_customer_id, default_payment_method_id, vertical_id, external_id"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching customers:", error);
    }

    return (
        <CustomersClient initialData={customers || []} error={error?.message} />
    );
}

