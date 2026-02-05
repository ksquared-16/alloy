import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ENTITY_TYPES = ["jobs", "opportunities", "contacts", "customers", "schedules"] as const;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const { type, id } = await params;
    if (!id || !ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();

        if (type === "jobs") {
            const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "opportunities") {
            const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "contacts") {
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "schedules") {
            const { data, error } = await supabase.from("schedules").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_ENTITY]", e);
        return NextResponse.json({ error: "Failed to fetch entity" }, { status: 500 });
    }
}
