import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect to dashboard
  redirect("/admin/dashboard");
}

