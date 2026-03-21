import { formatMoneyFromCents } from "@/lib/adminFormatters";

/** Parse proxy/backend JSON from POST /api/admin/payments/run for user-visible feedback. */
export function adminPaymentRunFeedback(json: Record<string, unknown>, httpOk: boolean): { ok: boolean; message: string } {
  const status = typeof json.status === "string" ? json.status : null;
  const amountCents = typeof json.amount_cents === "number" ? json.amount_cents : null;
  const amt = amountCents != null && Number.isFinite(amountCents) ? formatMoneyFromCents(amountCents) : null;
  const succeeded = httpOk && json.ok === true;
  if (succeeded) {
    const parts = ["Payment succeeded"];
    if (amt) parts.push(amt);
    if (status) parts.push(`Processor: ${status}`);
    return { ok: true, message: parts.join(" · ") };
  }
  const err =
    (typeof json.error === "string" && json.error.trim()) ||
    (typeof json.detail === "string" && json.detail.trim()) ||
    "Payment failed";
  const parts = [err];
  if (amt) parts.push(`Amount: ${amt}`);
  if (status) parts.push(`Processor: ${status}`);
  return { ok: false, message: parts.join(" · ") };
}
