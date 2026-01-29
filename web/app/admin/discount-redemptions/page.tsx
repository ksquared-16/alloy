import { createAdminClient } from "@/lib/supabaseAdmin";
import DiscountRedemptionsClient from "./DiscountRedemptionsClient";

export default async function DiscountRedemptionsPage() {
  const supabase = createAdminClient();

  const { data: redemptions, error } = await supabase
    .from("discount_redemptions")
    .select(
      "id, created_at, discount_code, quote_subtotal, discount_amount, quote_total, contact_id, opportunity_id, job_id"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching discount redemptions:", error);
  }

  return (
    <DiscountRedemptionsClient
      initialData={redemptions || []}
      error={error?.message}
    />
  );
}

