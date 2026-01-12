/**
 * Supabase client for server-side operations.
 * Uses service role key for admin operations (bypasses RLS).
 */

const getSupabaseUrl = (): string => {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL environment variable is not set");
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
 * Create opportunity
 */
export async function createOpportunity(
  opportunityData: {
    vertical_id?: string;
    customer_id?: string;
    primary_contact_id: string;
    location_id?: string;
    name: string;
    status: string;
    source: string;
    monetary_value_cents?: number;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string }> {
  const url = `${getPostgrestUrl()}/opportunities`;
  const headers = getPostgrestHeaders();

  const response = await fetch(url, {
    headers,
    method: "POST",
    body: JSON.stringify(opportunityData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create opportunity: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error("Create returned no data");
  }

  return data[0];
}

