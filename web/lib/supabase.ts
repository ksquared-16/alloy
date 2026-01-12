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
 * Find contact by email (case-insensitive) or phone
 */
export async function findContactByEmailOrPhone(
  email?: string,
  phone?: string
): Promise<{ id: string } | null> {
  if (!email && !phone) {
    return null;
  }

  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();

  // Try email first (case-insensitive)
  if (email) {
    const emailLower = email.trim().toLowerCase();
    const params = new URLSearchParams({
      select: "id",
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
  }

  // Try phone if email didn't match
  if (phone) {
    const phoneClean = phone.trim();
    const params = new URLSearchParams({
      select: "id",
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
  }

  return null;
}

/**
 * Upsert contact (create or update)
 */
export async function upsertContact(
  contactData: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    contact_type?: string;
    metadata?: Record<string, any>;
  },
  existingId?: string
): Promise<{ id: string }> {
  const url = `${getPostgrestUrl()}/contacts`;
  const headers = getPostgrestHeaders();

  if (existingId) {
    // Update existing contact
    const params = new URLSearchParams({ id: `eq.${existingId}` });
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
  } else {
    // Create new contact
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
}

/**
 * Find or create vertical by key
 */
export async function findOrCreateVertical(
  key: string,
  name: string
): Promise<{ id: string }> {
  const url = `${getPostgrestUrl()}/verticals`;
  const headers = getPostgrestHeaders();

  // Try to find existing vertical
  const params = new URLSearchParams({
    select: "id",
    key: `eq.${key}`,
    limit: "1",
  });

  const findResponse = await fetch(`${url}?${params.toString()}`, {
    headers,
    method: "GET",
  });

  if (findResponse.ok) {
    const data = await findResponse.json();
    if (data && data.length > 0) {
      return data[0];
    }
  }

  // Create if not found
  const createResponse = await fetch(url, {
    headers,
    method: "POST",
    body: JSON.stringify({ key, name }),
  });

  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Failed to create vertical: ${createResponse.status} ${text}`);
  }

  const data = await createResponse.json();
  if (!data || data.length === 0) {
    throw new Error("Create returned no data");
  }

  return data[0];
}

/**
 * Ensure contact_verticals association exists
 */
export async function ensureContactVertical(
  contactId: string,
  verticalId: string
): Promise<void> {
  const url = `${getPostgrestUrl()}/contact_verticals`;
  const headers = {
    ...getPostgrestHeaders(),
    Prefer: "resolution=merge-duplicates,return=representation",
  };

  const params = new URLSearchParams({
    on_conflict: "contact_id,vertical_id",
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    headers,
    method: "POST",
    body: JSON.stringify({
      contact_id: contactId,
      vertical_id: verticalId,
    }),
  });

  if (!response.ok) {
    // If conflict, that's fine (association already exists)
    if (response.status === 409) {
      return;
    }
    const text = await response.text();
    throw new Error(`Failed to create contact_vertical: ${response.status} ${text}`);
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

