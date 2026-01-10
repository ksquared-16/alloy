"""
Supabase database client and upsert operations using direct PostgREST API.
Uses service role key to bypass RLS.
"""
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from .config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

def _get_base_url() -> str:
    """Get PostgREST base URL from SUPABASE_URL."""
    base_url = SUPABASE_URL.rstrip("/")
    return f"{base_url}/rest/v1"

def _get_headers() -> Dict[str, str]:
    """Get PostgREST request headers with service role key."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

def find_external_mapping(source: str, entity_type: str, external_id: str, internal_table: str = "contacts") -> Optional[Dict]:
    """
    Find external mapping from external_mappings table.
    
    Args:
        source: Source name (e.g., 'ghl')
        entity_type: Entity type (e.g., 'contact')
        external_id: External ID (GHL contact ID)
        internal_table: Internal table name (default: 'contacts')
    
    Returns:
        Mapping dict with 'internal_id' if found, None otherwise
    """
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    params = {
        "source": f"eq.{source}",
        "entity_type": f"eq.{entity_type}",
        "external_id": f"eq.{external_id}",
        "internal_table": f"eq.{internal_table}",
        "select": "internal_id",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if not response.ok:
            raise RuntimeError(f"PostgREST GET failed: {response.status_code} - {response.text[:200]}")
        
        data = response.json()
        if data and len(data) > 0:
            return data[0]
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error finding external mapping: {e}")
        return None
    except Exception as e:
        logger.error(f"Error finding external mapping: {e}")
        return None

def upsert_contact(contact_payload: Dict, internal_id: Optional[str] = None) -> Dict:
    """
    Upsert a contact into the contacts table.
    
    Args:
        contact_payload: Contact data dictionary (fields matching contacts table schema)
        internal_id: Optional existing contact UUID (if provided, performs PATCH update)
    
    Returns:
        Contact dict with 'id' field
    """
    base_url = _get_base_url()
    
    if internal_id:
        # Update existing contact (PATCH)
        url = f"{base_url}/contacts"
        params = {"id": f"eq.{internal_id}"}
        
        logger.debug(f"Updating existing contact: {internal_id}")
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=contact_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("PATCH returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating contact {internal_id}: {e}")
            raise RuntimeError(f"Failed to update contact: {e}")
    else:
        # Insert new contact (POST)
        url = f"{base_url}/contacts"
        
        logger.debug("Inserting new contact")
        try:
            response = requests.post(url, headers=_get_headers(), json=contact_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("POST returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error inserting contact: {e}")
            raise RuntimeError(f"Failed to insert contact: {e}")

def build_external_mapping_payload(ghl_contact_id: str, internal_contact_id: str, ghl_contact_raw: Dict[str, Any], sync_hash: Optional[str] = None) -> Dict:
    """
    Build payload for external_mappings table.
    
    Args:
        ghl_contact_id: GHL contact ID
        internal_contact_id: Internal contact UUID
        ghl_contact_raw: Full raw GHL contact JSON
        sync_hash: Optional sync hash (not used in current implementation)
    
    Returns:
        Mapping payload dictionary
    """
    payload = {
        "source": "ghl",
        "entity_type": "contact",
        "external_id": ghl_contact_id,
        "internal_table": "contacts",
        "internal_id": internal_contact_id,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "raw": ghl_contact_raw,
    }
    
    if sync_hash:
        payload["sync_hash"] = sync_hash
    
    return payload

def upsert_external_mapping(mapping_payload: Dict) -> Dict:
    """
    Upsert external mapping using PostgREST on_conflict.
    
    Args:
        mapping_payload: Mapping payload from build_external_mapping_payload()
    
    Returns:
        Mapping dict with 'id' field
    """
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    # Use on_conflict with merge-duplicates resolution
    headers = _get_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    
    # PostgREST on_conflict query parameter format
    params = {
        "on_conflict": "source,entity_type,external_id,internal_table"
    }
    
    try:
        response = requests.post(url, headers=headers, params=params, json=mapping_payload, timeout=30)
        if not response.ok:
            raise RuntimeError(f"PostgREST POST (upsert) failed: {response.status_code} - {response.text[:200]}")
        
        data = response.json()
        if not data or len(data) == 0:
            raise RuntimeError("POST upsert returned no data")
        
        logger.debug(f"Upserted external_mapping: ghl:contact:{mapping_payload.get('external_id')} -> {mapping_payload.get('internal_id')}")
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error upserting external_mapping: {e}")
        raise RuntimeError(f"Failed to upsert external mapping: {e}")
