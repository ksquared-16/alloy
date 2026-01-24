#!/usr/bin/env python3
"""
Sync jobs (custom object records) from GoHighLevel to Supabase.
This script is idempotent and safe to run multiple times.
"""
import logging
import sys
from typing import Dict, Optional
from .config import validate_config
from .ghl_client import fetch_all_jobs
from .supabase_db import (
    find_external_mapping,
    upsert_job,
    upsert_external_mapping,
    build_external_mapping_payload_generic,
    resolve_opportunity_id_from_ghl_opportunity_id,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def build_job_payload(ghl_job: Dict) -> Dict:
    """
    Build job payload for Supabase jobs table.
    
    Args:
        ghl_job: Raw GHL job record dictionary
    
    Returns:
        Job payload dictionary matching jobs table schema
    """
    # Extract properties from GHL job record (custom object records have properties nested)
    properties = ghl_job.get("properties", {})
    
    # Build basic job payload
    job_payload = {
        "title": properties.get("title") or ghl_job.get("title") or None,
        "description": properties.get("description") or ghl_job.get("description") or None,
    }
    
    # Resolve opportunity_id from GHL opportunityId via external_mappings
    ghl_opportunity_id = (
        properties.get("opportunity_id") or 
        properties.get("opportunityId") or 
        properties.get("Opportunity ID") or
        ghl_job.get("opportunity_id") or
        ghl_job.get("opportunityId")
    )
    if ghl_opportunity_id:
        internal_opportunity_id = resolve_opportunity_id_from_ghl_opportunity_id(ghl_opportunity_id)
        if internal_opportunity_id:
            job_payload["opportunity_id"] = internal_opportunity_id
        else:
            logger.debug(f"Could not resolve opportunity_id for GHL opportunity {ghl_opportunity_id}, leaving opportunity_id NULL")
    
    # Store GHL status in metadata (leave job_status_id NULL for now)
    metadata = {}
    ghl_status = properties.get("status") or ghl_job.get("status")
    if ghl_status:
        metadata["ghl_status"] = ghl_status
    
    # Store other GHL-specific fields in metadata
    if properties.get("external_job_id"):
        metadata["ghl_external_job_id"] = properties.get("external_job_id")
    if properties.get("offer_code"):
        metadata["ghl_offer_code"] = properties.get("offer_code")
    if properties.get("contractor_pay_amount"):
        metadata["ghl_contractor_pay_amount"] = properties.get("contractor_pay_amount")
    if properties.get("recurring_contractor_pay_amount"):
        metadata["ghl_recurring_contractor_pay_amount"] = properties.get("recurring_contractor_pay_amount")
    
    # Store all properties in metadata for reference
    if properties:
        metadata["ghl_properties"] = properties
    
    if metadata:
        job_payload["metadata"] = metadata
    
    # Add timestamps if available
    if ghl_job.get("createdAt") or ghl_job.get("created_at"):
        job_payload["created_at"] = ghl_job.get("createdAt") or ghl_job.get("created_at")
    if ghl_job.get("updatedAt") or ghl_job.get("updated_at"):
        job_payload["updated_at"] = ghl_job.get("updatedAt") or ghl_job.get("updated_at")
    
    return job_payload

def main():
    """Main sync function."""
    try:
        # Validate configuration
        logger.info("Validating configuration...")
        validate_config()
        logger.info("Configuration valid")
        
        # Fetch all jobs from GHL
        logger.info("Fetching jobs from GoHighLevel...")
        ghl_jobs = fetch_all_jobs()
        logger.info(f"Fetched {len(ghl_jobs)} jobs from GHL")
        
        if not ghl_jobs:
            logger.warning("No jobs found in GHL")
            return
        
        # Upsert jobs into Supabase
        logger.info("Upserting jobs into Supabase...")
        upserted_count = 0
        updated_count = 0
        created_count = 0
        errors = []
        
        for idx, ghl_job in enumerate(ghl_jobs, 1):
            try:
                # GHL job records use "id" field for the record ID
                ghl_job_id = ghl_job.get("id")
                if not ghl_job_id:
                    logger.warning(f"Job at index {idx} has no ID, skipping")
                    continue
                
                # Look up existing mapping
                mapping = find_external_mapping("ghl", "job", ghl_job_id, "jobs")
                existing_internal_id = mapping.get("internal_id") if mapping else None
                is_update = existing_internal_id is not None
                
                # Build job payload
                job_payload = build_job_payload(ghl_job)
                
                # Upsert job (PATCH if exists, POST if new)
                job_result = upsert_job(job_payload, existing_internal_id)
                job_id = job_result["id"]
                
                # Build and upsert external mapping
                mapping_payload = build_external_mapping_payload_generic(
                    ghl_job_id,
                    job_id,
                    "job",
                    "jobs",
                    ghl_job
                )
                upsert_external_mapping(mapping_payload)
                
                if is_update:
                    updated_count += 1
                else:
                    created_count += 1
                upserted_count += 1
                
                if idx % 50 == 0:
                    logger.info(f"Processed {idx}/{len(ghl_jobs)} jobs...")
            
            except Exception as e:
                error_msg = f"Error processing job {ghl_job.get('id', 'unknown')}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                continue
        
        # Print summary
        logger.info("=" * 60)
        logger.info("SYNC SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total jobs fetched from GHL: {len(ghl_jobs)}")
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

