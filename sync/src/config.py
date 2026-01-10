"""
Configuration loader for sync worker.
Loads environment variables from .env file.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from sync/ directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# GHL Configuration
GHL_API_KEY = os.getenv("GHL_API_KEY", "").strip()
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "").strip()
GHL_BASE_URL = os.getenv("GHL_BASE_URL", "https://services.leadconnectorhq.com").strip()

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# Validate required config
def validate_config():
    """Validate that all required environment variables are set."""
    missing = []
    if not GHL_API_KEY:
        missing.append("GHL_API_KEY")
    if not GHL_LOCATION_ID:
        missing.append("GHL_LOCATION_ID")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
    
    return True



