import { NextRequest, NextResponse } from "next/server";
import { isHttpError, requireAuth } from "@/lib/middleware";
import { repositoryService } from "@/lib/services/repositoryService";
import { analysisJobService } from "@/lib/services/analysisJobService";
import prisma from "@/lib/prisma";
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    const id = parseInt(params.id);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid repository ID" },
        { status: 400 }
      );
    }

    // Verify ownership
    const repository = await repositoryService.getRepository(id, user.userId);

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }
    const maxConcurrentJobs = Number(
  process.env.MAX_CONCURRENT_ANALYSIS_PER_USER || 3
);

const activeJobsCount = await prisma.analysisJob.count({
  where: {
    userId: user.userId,
    status: {
      in: ["QUEUED", "PROCESSING"],
    },
  },
});

if (activeJobsCount >= maxConcurrentJobs) {
  return NextResponse.json(
    {
      error:
        "Too many sync/analyze jobs running. Please wait before retrying.",
      retryAfter: 60,
    },
    { status: 429 }
  );
}

    const job = await analysisJobService.createRepositoryAnalysisJob({
      repositoryId: id,
      userId: user.userId,
    });

    return NextResponse.json(
      { message: "Job queued", jobId: job.id, status: job.status },
      { status: 202 }
    );
  } catch (error: any) {
    console.error("Analyze repository error:", error);
    if (isHttpError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 }
    );
  }
}
