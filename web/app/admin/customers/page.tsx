import { createAdminClient } from "@/lib/supabaseAdmin";
import CustomersClient from "./CustomersClient";

type SearchParams = { status_key?: string };

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
    const supabase = createAdminClient();
    const statusKey = typeof searchParams?.status_key === "string" ? searchParams.status_key.trim() || null : null;

    let q = supabase
        .from("customers")
        .select(
            "id, created_at, name, status, status_key, stripe_customer_id, default_payment_method_id, vertical_id, external_id"
        )
        .order("created_at", { ascending: false })
        .limit(1000);
    if (statusKey) q = q.eq("status_key", statusKey);
    const { data: customers, error } = await q;

    if (error) {
        console.error("Error fetching customers:", error);
        return <CustomersClient initialData={[]} error={error?.message} />;
    }

    const list = customers ?? [];
    const verticalIds = [...new Set(list.map((c) => c.vertical_id).filter(Boolean))] as string[];
    const { data: verticals } = verticalIds.length ? await supabase.from("verticals").select("id, name, slug").in("id", verticalIds) : { data: [] };
    const verticalMap = new Map((verticals ?? []).map((v) => [v.id, v]));

    const rows = list.map((c) => {
        const vertical = c.vertical_id ? verticalMap.get(c.vertical_id) : undefined;
        return {
            ...c,
            _vertical_name: (vertical as { name?: string } | undefined)?.name ?? (vertical as { slug?: string } | undefined)?.slug ?? null,
        };
    });

    return (
        <CustomersClient initialData={rows} error={undefined} />
    );
}

