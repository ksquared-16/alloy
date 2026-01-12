#!/usr/bin/env python3
"""
Sync opportunities from GoHighLevel to Supabase.
This script is idempotent and safe to run multiple times.
"""
import logging
import sys
from typing import Dict, Optional
from .config import validate_config
from .ghl_client import fetch_all_opportunities
from .supabase_db import (
    find_external_mapping,
    upsert_opportunity,
    upsert_external_mapping,
    build_external_mapping_payload_generic,
    resolve_contact_id_from_ghl_contact_id,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def build_opportunity_payload(ghl_opportunity: Dict) -> Dict:
    """
    Build opportunity payload for Supabase opportunities table.
    Only includes keys that exist in the Supabase schema.
    
    Allowed keys: vertical_id, customer_id, primary_contact_id, location_id, name,
    pipeline_id, pipeline_stage_id, status, source, lost_reason, assigned_to,
    job_date, job_time_window, appointment_id, customer_notes, monetary_value_cents,
    estimated_price_cents, recurring_price_cents, price_breakdown, external_source,
    external_id, metadata, created_at, updated_at
    
    Args:
        ghl_opportunity: Raw GHL opportunity dictionary
    
    Returns:
        Opportunity payload dictionary matching opportunities table schema
    """
    opportunity_payload = {}
    
    # Map GHL name -> Supabase name
    ghl_name = ghl_opportunity.get("name")
    if ghl_name:
        opportunity_payload["name"] = ghl_name
    
    # Map status (allowed field)
    ghl_status = ghl_opportunity.get("status")
    if ghl_status:
        opportunity_payload["status"] = ghl_status
    
    # Map source (allowed field)
    ghl_source = ghl_opportunity.get("source")
    if ghl_source:
        opportunity_payload["source"] = ghl_source
    
    # Map monetaryValue -> monetary_value_cents (convert dollars to cents)
    ghl_value = ghl_opportunity.get("monetaryValue") or ghl_opportunity.get("value")
    if ghl_value is not None:
        try:
            # Convert to float, then to cents (multiply by 100)
            value_float = float(ghl_value)
            opportunity_payload["monetary_value_cents"] = int(value_float * 100)
        except (ValueError, TypeError):
            logger.debug(f"Could not convert monetaryValue to cents: {ghl_value}")
    
    # Resolve primary_contact_id from GHL contactId via external_mappings
    ghl_contact_id = ghl_opportunity.get("contactId") or ghl_opportunity.get("contact_id")
    if ghl_contact_id:
        internal_contact_id = resolve_contact_id_from_ghl_contact_id(ghl_contact_id)
        if internal_contact_id:
            opportunity_payload["primary_contact_id"] = internal_contact_id
        else:
            logger.debug(f"Could not resolve contact_id for GHL contact {ghl_contact_id}, leaving primary_contact_id NULL")
    
    # Store GHL pipeline/stage IDs in metadata (NOT in pipeline_id, pipeline_stage_id columns)
    metadata = {}
    ghl_pipeline_id = ghl_opportunity.get("pipelineId") or ghl_opportunity.get("pipeline_id")
    ghl_stage_id = ghl_opportunity.get("pipelineStageId") or ghl_opportunity.get("pipelineStage_id") or ghl_opportunity.get("stageId") or ghl_opportunity.get("stage_id")
    if ghl_pipeline_id:
        metadata["ghl_pipeline_id"] = ghl_pipeline_id
    if ghl_stage_id:
        metadata["ghl_stage_id"] = ghl_stage_id
    
    # Store other GHL-specific fields in metadata
    if ghl_opportunity.get("assignedTo"):
        metadata["ghl_assigned_to"] = ghl_opportunity.get("assignedTo")
    
    # Store locationId in metadata if present
    if ghl_opportunity.get("locationId"):
        metadata["ghl_location_id"] = ghl_opportunity.get("locationId")
    
    # Store customFields in metadata if present
    if ghl_opportunity.get("customFields"):
        metadata["ghl_custom_fields"] = ghl_opportunity.get("customFields")
    
    if metadata:
        opportunity_payload["metadata"] = metadata
    
    # Add timestamps if available
    if ghl_opportunity.get("createdAt") or ghl_opportunity.get("created_at"):
        opportunity_payload["created_at"] = ghl_opportunity.get("createdAt") or ghl_opportunity.get("created_at")
    if ghl_opportunity.get("updatedAt") or ghl_opportunity.get("updated_at"):
        opportunity_payload["updated_at"] = ghl_opportunity.get("updatedAt") or ghl_opportunity.get("updated_at")
    
    return opportunity_payload

def main():
    """Main sync function."""
    try:
        # Validate configuration
        logger.info("Validating configuration...")
        validate_config()
        logger.info("Configuration valid")
        
        # Fetch all opportunities from GHL
        logger.info("Fetching opportunities from GoHighLevel...")
        ghl_opportunities = fetch_all_opportunities()
        logger.info(f"Fetched {len(ghl_opportunities)} opportunities from GHL")
        
        if not ghl_opportunities:
            logger.warning("No opportunities found in GHL")
            return
        
        # Upsert opportunities into Supabase
        logger.info("Upserting opportunities into Supabase...")
        upserted_count = 0
        updated_count = 0
        created_count = 0
        errors = []
        
        for idx, ghl_opportunity in enumerate(ghl_opportunities, 1):
            try:
                ghl_opportunity_id = ghl_opportunity.get("id")
                if not ghl_opportunity_id:
                    logger.warning(f"Opportunity at index {idx} has no ID, skipping")
                    continue
                
                # Look up existing mapping
                mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
                existing_internal_id = mapping.get("internal_id") if mapping else None
                is_update = existing_internal_id is not None
                
                # Build opportunity payload
                opportunity_payload = build_opportunity_payload(ghl_opportunity)
                
                # Upsert opportunity (PATCH if exists, POST if new)
                opportunity_result = upsert_opportunity(opportunity_payload, existing_internal_id)
                opportunity_id = opportunity_result["id"]
                
                # Build and upsert external mapping
                mapping_payload = build_external_mapping_payload_generic(
                    ghl_opportunity_id,
                    opportunity_id,
                    "opportunity",
                    "opportunities",
                    ghl_opportunity
                )
                upsert_external_mapping(mapping_payload)
                
                if is_update:
                    updated_count += 1
                else:
                    created_count += 1
                upserted_count += 1
                
                if idx % 50 == 0:
                    logger.info(f"Processed {idx}/{len(ghl_opportunities)} opportunities...")
            
            except Exception as e:
                error_msg = f"Error processing opportunity {ghl_opportunity.get('id', 'unknown')}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                continue
        
        # Print summary
        logger.info("=" * 60)
        logger.info("SYNC SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total opportunities fetched from GHL: {len(ghl_opportunities)}")
        logger.info(f"Successfully upserted: {upserted_count}")
        logger.info(f"  - Created: {created_count}")
        logger.info(f"  - Updated: {updated_count}")
        logger.info(f"Errors: {len(errors)}")
        
        if errors:
            logger.warning("Errors encountered:")
            for error in errors[:10]:  # Show first 10 errors
                logger.warning(f"  - {error}")
            if len(errors) > 10:
                logger.warning(f"  ... and {len(errors) - 10} more errors")
        
        logger.info("=" * 60)
        logger.info("Sync completed successfully")
        
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        logger.error("Please check your .env file and ensure all required variables are set.")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

