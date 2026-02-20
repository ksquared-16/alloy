import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BACKEND_URL =
  process.env.BACKEND_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * POST /api/admin/payments/run
 * Proxy to backend POST /admin/payments/run.
 * All Stripe PaymentIntent logic runs in the Python backend (single runtime).
 * Body: { job_id: string, amount_cents?: number }
 */
export async function POST(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  let body: { job_id?: string; amount_cents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = body.job_id;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const payload: { job_id: string; amount_cents?: number } = { job_id: jobId };
  if (typeof body.amount_cents === "number") {
    payload.amount_cents = body.amount_cents;
  }

  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/admin/payments/run`;
  console.log("[PAYMENTS_RUN] env:", {
    VERCEL_ENV: process.env.VERCEL_ENV,
    BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    backendUrl,
  });
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log("[PAYMENTS_RUN] backend response status:", res.status, "text (truncated):", responseText.slice(0, 500));
  const data = responseText ? (() => { try { return JSON.parse(responseText); } catch { return {}; } })() : {};
  return NextResponse.json(data, { status: res.status });
}
