import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/mongodb";
import Feedback from "@/lib/utils/FeedbackTranslationImprover";
import { getUserFromToken } from "@/lib/utils/authHelper";

export async function GET(req: NextRequest) {
  try {
    // Extract token from request
    const token =
      req.headers.get("Authorization")?.split(" ")[1] ||
      req.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify user from token
    const tokenData = await getUserFromToken(token);
    if (!tokenData || !tokenData.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Check if user is guide
    if (tokenData.role !== "guide") {
      return NextResponse.json(
        { error: "Not authorized to view evaluation data" },
        { status: 403 }
      );
    }

    await connectToDatabase();

    // Get timeframe parameter
    const timeframe = req.nextUrl.searchParams.get("timeframe") || "all";
    const roomId = req.nextUrl.searchParams.get("roomId");
    const language = req.nextUrl.searchParams.get("language");

    // Build query
    let query: any = {};

    if (roomId) {
      query.roomId = roomId;
    }

    if (language) {
      query.targetLanguage = language;
    }

    // Add time constraint if needed
    if (timeframe !== "all") {
      const now = Date.now();
      let timeConstraint: number;

      switch (timeframe) {
        case "day":
          timeConstraint = now - 24 * 60 * 60 * 1000;
          break;
        case "week":
          timeConstraint = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case "month":
          timeConstraint = now - 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          timeConstraint = 0;
      }

      if (timeConstraint > 0) {
        query.timestamp = { $gte: timeConstraint };
      }
    }

    // Calculate key metrics
    const results = await runEvaluation(query);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error generating evaluation:", error);
    return NextResponse.json(
      { error: "Failed to generate evaluation" },
      { status: 500 }
    );
  }
}

// Helper function to run evaluation
async function runEvaluation(query: any) {
  // Get total feedback count
  const totalCount = await Feedback.countDocuments(query);

  // Get average rating over time
  const ratingTrend = await Feedback.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $toDate: "$timestamp" },
          },
        },
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Calculate improvement metrics
  const selectionStats = await Feedback.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        baseCount: {
          $sum: {
            $cond: [
              { $eq: ["$selectedTranslation", "$baseTranslation"] },
              1,
              0,
            ],
          },
        },
        enhancedCount: {
          $sum: {
            $cond: [
              { $eq: ["$selectedTranslation", "$enhancedTranslation"] },
              1,
              0,
            ],
          },
        },
        customCount: {
          $sum: {
            $cond: [
              { $ne: ["$selectedTranslation", "$baseTranslation"] },
              1,
              0,
            ],
          },
        },
        totalCount: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
  ]);

  // Get language breakdown
  const languageBreakdown = await Feedback.aggregate([
    { $match: query },
    {
      $group: {
        _id: "$targetLanguage",
        count: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Get top-rated translations
  const topRatedTranslations = await Feedback.find({
    ...query,
    rating: { $gt: 4 },
  })
    .sort({ rating: -1, timestamp: -1 })
    .limit(10)
    .lean();

  // Calculate improvement metrics
  const stats = selectionStats[0] || {
    baseCount: 0,
    enhancedCount: 0,
    customCount: 0,
    totalCount: 0,
    avgRating: 0,
  };

  const improvementMetrics = {
    enhancedSelectionRate:
      stats.totalCount > 0 ? stats.enhancedCount / stats.totalCount : 0,
    customCorrectionRate:
      stats.totalCount > 0 ? stats.customCount / stats.totalCount : 0,
    averageRating: stats.avgRating || 0,
    // Simulate BLEU and ROUGE scores - in a real system these would be calculated
    estimatedBleuImprovement:
      stats.enhancedCount > stats.baseCount ? 0.08 : 0.02,
    estimatedRougeImprovement:
      stats.enhancedCount > stats.baseCount ? 0.12 : 0.03,
  };

  // Generate simulated performance data (typically these would be stored metrics)
  const simulatedPerformance = simulatePerformanceData(ratingTrend.length);

  return {
    totalFeedbackCount: totalCount,
    ratingTrend,
    languageBreakdown,
    improvementMetrics,
    performance: simulatedPerformance,
    topRatedTranslations: topRatedTranslations.map((t) => ({
      originalText: t.originalText,
      translation: t.selectedTranslation,
      language: t.targetLanguage,
      rating: t.rating,
    })),
  };
}

// Helper function to simulate performance data
function simulatePerformanceData(dataPoints: number) {
  const performanceData = [];
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < Math.max(dataPoints, 14); i++) {
    const date = new Date(now - i * dayInMs);
    const dateStr = date.toISOString().split("T")[0];

    // Simulated metrics - in a real system these would be actual measured values
    const baseAccuracy = 70 + Math.random() * 5;
    const contextAccuracy = baseAccuracy + 5 + Math.random() * 5;
    const feedbackAccuracy =
      baseAccuracy + (i / dataPoints) * 10 + Math.random() * 5;
    const hybridAccuracy =
      Math.max(contextAccuracy, feedbackAccuracy) + Math.random() * 2;

    performanceData.push({
      date: dateStr,
      baselineAccuracy: baseAccuracy,
      contextAccuracy: contextAccuracy,
      feedbackAccuracy: feedbackAccuracy,
      hybridAccuracy: hybridAccuracy,
      avgLatency: 500 + Math.random() * 200,
    });
  }

  return performanceData.reverse();
}

// POST endpoint for manually running an evaluation simulation
export async function POST(req: NextRequest) {
  try {
    // Extract token from request
    const token =
      req.headers.get("Authorization")?.split(" ")[1] ||
      req.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify user from token
    const tokenData = await getUserFromToken(token);
    if (!tokenData || !tokenData.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Only allow guides or admins to run simulations
    if (tokenData.role !== "guide") {
      return NextResponse.json(
        { error: "Not authorized to run simulations" },
        { status: 403 }
      );
    }

    const { action } = await req.json();

    if (action === "simulate") {
      // This would normally call your simulation script
      return NextResponse.json({
        message: "Simulation started in the background",
        status: "running",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error with evaluation action:", error);
    return NextResponse.json(
      { error: "Failed to process evaluation action" },
      { status: 500 }
    );
  }
}
