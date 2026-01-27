import { NextRequest, NextResponse } from "next/server";
import { getPostgrestUrl, getPostgrestHeaders } from "@/lib/supabase";

/**
 * GET /api/admin/schedules
 * 
 * Fetch schedules from Supabase (stored in jobs.metadata.schedule).
 * Supports query parameters:
 * - status: Filter by schedule status (scheduled, completed, cancelled)
 * - start_date: Filter by start_at >= start_date (ISO date string)
 * - end_date: Filter by start_at <= end_date (ISO date string)
 * - limit: Limit results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 * 
 * Returns jobs with schedule info extracted from metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
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

    const response = await fetch(`${url}?${params.toString()}`, {
      headers,
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch schedules: ${response.status} ${text}`);
    }

    let jobs = await response.json();

    // Extract schedule info from metadata and filter
    const schedules = jobs
      .map((job: any) => {
        const schedule = job.metadata?.schedule;
        if (!schedule) {
          return null; // Skip jobs without schedule info
        }

        return {
          job_id: job.id,
          job_title: job.title,
          job_description: job.description,
          opportunity_id: job.opportunity_id,
          start_at: schedule.start_at,
          end_at: schedule.end_at,
          timezone: schedule.timezone,
          status: schedule.status,
          created_at: job.created_at,
          updated_at: job.updated_at,
        };
      })
      .filter((s: any) => s !== null);

    // Filter by status if provided
    let filteredSchedules = schedules;
    if (status) {
      filteredSchedules = filteredSchedules.filter(
        (s: any) => s.status === status
      );
    }

    // Filter by start_date if provided
    if (startDate) {
      filteredSchedules = filteredSchedules.filter(
        (s: any) => s.start_at && s.start_at >= startDate
      );
    }

    // Filter by end_date if provided
    if (endDate) {
      filteredSchedules = filteredSchedules.filter(
        (s: any) => s.start_at && s.start_at <= endDate
      );
    }

    return NextResponse.json({
      ok: true,
      schedules: filteredSchedules,
      count: filteredSchedules.length,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[ADMIN_SCHEDULES_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to fetch schedules",
      },
      { status: 500 }
    );
  }
}

