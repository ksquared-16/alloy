import { createAdminClient } from "@/lib/supabaseAdmin";
import DiscountsClient from "./DiscountsClient";

export default async function DiscountsPage() {
  const supabase = createAdminClient();

  const { data: discounts, error } = await supabase
    .from("discount_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching discounts:", error);
  }

  return (
    <DiscountsClient initialData={discounts || []} error={error?.message} />
  );
}

