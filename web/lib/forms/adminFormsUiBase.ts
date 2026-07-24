import { CANONICAL_ADMIN_BASE } from "@/lib/admin/canonicalAdminRoutes";

/**
 * Base path for intake/submission deep-links emitted by preserved intake presentation helpers
 * (opportunity intake source, command-center review, quick review, packet builder).
 *
 * Forms is no longer an operator destination — the standalone `/admin/forms` surface was retired in
 * favor of the Digital Mailroom, and forms submissions / packet-sessions all resolve into the
 * Mailroom **Work** queue. This base therefore points at the Work-queue surface (`/admin/processing`)
 * so no operator link ever targets `/admin/forms`. Record-scoped deep-links (`${base}/{id}/…`) land in
 * the Processing/Work family; pixel-exact Mailroom deep-linking to a specific submission/session is a
 * tracked follow-up, but nothing dead-ends at the removed Forms destination.
 */
export const ADMIN_FORMS_UI_BASE = `${CANONICAL_ADMIN_BASE}/processing`;
