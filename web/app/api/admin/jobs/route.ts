import { NextRequest, NextResponse } from "next/server";
import { getPostgrestUrl, getPostgrestHeaders } from "@/lib/supabase";

/**
 * GET /api/admin/jobs
 * 
 * Fetch jobs from Supabase for admin portal.
 * Supports query parameters:
 * - status: Filter by job status (from metadata.schedule.status)
 * - opportunity_id: Filter by opportunity UUID
 * - limit: Limit results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const opportunityId = searchParams.get("opportunity_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const url = `${getPostgrestUrl()}/jobs`;
    const headers = getPostgrestHeaders();
    
    // Build query params
    const params = new URLSearchParams({
      select: "id,title,description,opportunity_id,created_at,updated_at,metadata",
      order: "created_at.desc",
      limit: limit.toString(),
      offset: offset.toString(),
    });

    // Filter by opportunity_id if provided
    if (opportunityId) {
      params.append("opportunity_id", `eq.${opportunityId}`);
    }

    const response = await fetch(`${url}?${params.toString()}`, {
      headers,
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch jobs: ${response.status} ${text}`);
    }

    let jobs = await response.json();

    // Filter by status if provided (status is in metadata.schedule.status)
    if (status) {
      jobs = jobs.filter((job: any) => {
        const scheduleStatus = job.metadata?.schedule?.status;
        return scheduleStatus === status;
      });
    }

    return NextResponse.json({
      ok: true,
      jobs,
      count: jobs.length,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[ADMIN_JOBS_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to fetch jobs",
      },
      { status: 500 }
    );
  }
}

