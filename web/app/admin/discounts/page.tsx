import { createAdminClient } from "@/lib/supabaseAdmin";
import { listDiscountProgramsAdmin } from "@/lib/admin/discountProgramAdmin";
import DiscountsClient from "./DiscountsClient";

export const dynamic = 'force-dynamic';

export default async function DiscountsPage() {
  const supabase = createAdminClient();
  const { data: discounts, error } = await listDiscountProgramsAdmin(supabase);

  if (error) {
    console.error("Error fetching discount programs:", error);
  }

  return (
    <DiscountsClient initialData={discounts || []} error={error?.message} />
  );
}
