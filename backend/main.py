"""
Alloy Dispatcher API

This is the core dispatcher/API for Alloy, a marketplace connecting homeowners
with trusted local service professionals (starting with home cleaning in Bend, Oregon).

The dispatcher integrates with:
- GoHighLevel (GHL): For contact management, custom objects (Jobs), and SMS conversations
- Twilio: For SMS flows (via GHL's Conversations API)

Main workflows:
1. Job Dispatch: When a customer books a cleaning appointment via GHL, the /dispatch
   webhook is triggered. The dispatcher:
   - Builds a job summary from the appointment data
   - Fetches eligible contractors (tagged with contractor_cleaning + job-pending-assignment)
   - Sends SMS notifications to all eligible contractors

2. Contractor Reply: When a contractor replies "YES <job_id>" (or just "YES" for the latest job),
   the /contractor-reply webhook processes the acceptance:
   - Assigns the job to that contractor
   - Sends confirmation SMS to the contractor (with access details)
   - Notifies other contractors the job is claimed
   - Notifies the customer their job is assigned
   - Updates the GHL Jobs custom object with assignment details

3. Lead Submission: The /leads/cleaning endpoint accepts cleaning lead submissions
   from the frontend website and creates/updates contacts in GHL.

Environment Variables Required:
- GHL_API_KEY: GoHighLevel API key (Bearer token)
- GHL_LOCATION_ID: GoHighLevel location ID for this Alloy instance

This file now serves as the entry point for uvicorn. The actual application
is defined in app/server.py.
"""

# Import the FastAPI app from the app module
from app.server import app

# Export app for uvicorn: uvicorn backend.main:app
__all__ = ["app"]
