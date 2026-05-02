/**
 * Supabase client for server-side operations.
 * Uses service role key for admin operations (bypasses RLS).
 */

const getSupabaseUrl = (): string => {
  const url =
    (process.env.SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) ??
    "";
  if (!url) {
    throw new Error(
      "Supabase URL is not set. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL."
    );
  }
  return url;
};

const getSupabaseServiceRoleKey = (): string => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  }
  return key;
};

/**
 * Get PostgREST base URL from Supabase URL
 */
export function getPostgrestUrl(): string {
  const baseUrl = getSupabaseUrl().replace(/\/+$/, "");
  return `${baseUrl}/rest/v1`;
}

/**
 * Get headers for PostgREST requests with service role key
 */
export function getPostgrestHeaders(): Record<string, string> {
  return {
    apikey: getSupabaseServiceRoleKey(),
    Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/**
 * Find contact by email (case-insensitive)
 */
export async function findContactByEmail(email: string): Promise<{ id: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();
  const emailLower = email.trim().toLowerCase();

  const params = new URLSearchParams({
    select: "id,first_name,last_name,phone,email",
    email: `ilike.${emailLower}`,
    limit: "1",
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers,
      method: "GET",
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return data[0];
      }
    }
  } catch (e) {
    console.error("Error searching contact by email:", e);
  }

  return null;
}

/**
 * Find contact by phone (exact match)
 */
export async function findContactByPhone(phone: string): Promise<{ id: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();
  const phoneClean = phone.trim();

  const params = new URLSearchParams({
    select: "id,first_name,last_name,phone,email",
    phone: `eq.${phoneClean}`,
    limit: "1",
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers,
      method: "GET",
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return data[0];
      }
    }
  } catch (e) {
    console.error("Error searching contact by phone:", e);
  }

  return null;
}

/**
 * Find contact by email (case-insensitive) or phone
 */
export async function findContactByEmailOrPhone(
  email?: string,
  phone?: string
): Promise<{ id: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null> {
  if (!email && !phone) {
    return null;
  }

  // Try email first (case-insensitive)
  if (email) {
    const found = await findContactByEmail(email);
    if (found) {
      return found;
    }
  }

  // Try phone if email didn't match
  if (phone) {
    const found = await findContactByPhone(phone);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Create contact
 */
export async function createContact(
  contactData: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    contact_type?: string;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string }> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();

  const response = await fetch(url, {
    headers,
    method: "POST",
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create contact: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error("Create returned no data");
  }

  return data[0];
}

/**
 * Update contact
 */
export async function updateContact(
  id: string,
  contactData: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    contact_type?: string;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string }> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();

  const params = new URLSearchParams({ id: `eq.${id}` });
  const response = await fetch(`${url}?${params.toString()}`, {
    headers,
    method: "PATCH",
    body: JSON.stringify(contactData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update contact: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error("Update returned no data");
  }

  return data[0];
}

/** Load contact row fields needed for person/contact dual-write (service role). */
export async function fetchContactIdentityById(
  contactId: string
): Promise<{ id: string; person_id: string | null } | null> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();
  const params = new URLSearchParams({
    select: "id,person_id",
    id: `eq.${contactId.trim()}`,
    limit: "1",
  });
  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers,
      method: "GET",
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.length === 0) return null;
    const row = data[0] as { id: string; person_id?: string | null };
    return { id: row.id, person_id: row.person_id ?? null };
  } catch {
    return null;
  }
}

/**
 * Get vertical ID by slug from verticals table
 */
export async function getVerticalIdBySlug(slug: string): Promise<string> {
  const url = `${getPostgrestUrl()}/verticals`;
  const headers = {
    apikey: getSupabaseServiceRoleKey(),
    Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Build query params exactly as specified: select=id&slug=eq.<slug>&limit=1
  // Encode the slug value for safety
  const encodedSlug = encodeURIComponent(slug);
  const queryString = `select=id&slug=eq.${encodedSlug}&limit=1`;

  try {
    const response = await fetch(`${url}?${queryString}`, {
      headers,
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to query verticals: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data || data.length === 0 || !data[0].id) {
      throw new Error(`Vertical with slug "${slug}" not found. Please add it to the verticals table.`);
    }

    return data[0].id;
  } catch (e: any) {
    if (e.message?.includes("not found")) {
      throw e;
    }
    // Include original error message for better debugging
    const errorMessage = e.message || String(e);
    throw new Error(`Failed to get vertical ID for slug "${slug}": ${errorMessage}`);
  }
}

/**
 * Create opportunity (person-first: `insertOpportunityWithPersonFirst` resolves or creates `primary_person_id`).
 * `primary_contact_id` is retained for legacy linkage.
 */
export async function createOpportunity(
  opportunityData: {
    vertical_id?: string;
    customer_id?: string;
    primary_contact_id: string;
    primary_person_id?: string | null;
    location_id?: string;
    name: string;
    status: string;
    source: string;
    monetary_value_cents?: number;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string; primary_person_id: string }> {
  const { createClient } = await import("@supabase/supabase-js");
  const { insertOpportunityWithPersonFirst } = await import("@/lib/opportunityIdentity");
  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
  const pc = typeof opportunityData.primary_contact_id === "string" ? opportunityData.primary_contact_id.trim() : "";
  if (!pc) {
    throw new Error("createOpportunity: primary_contact_id is required");
  }
  return insertOpportunityWithPersonFirst(
    supabase,
    {
      vertical_id: opportunityData.vertical_id,
      customer_id: opportunityData.customer_id,
      primary_contact_id: pc,
      primary_person_id: opportunityData.primary_person_id,
      location_id: opportunityData.location_id,
      name: opportunityData.name,
      status: opportunityData.status,
      source: opportunityData.source,
      monetary_value_cents: opportunityData.monetary_value_cents,
      metadata: opportunityData.metadata,
    },
    "lib/supabase.createOpportunity"
  );
}

