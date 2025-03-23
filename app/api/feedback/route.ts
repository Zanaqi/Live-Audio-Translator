import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/mongodb";
import Feedback from "@/lib/utils/FeedbackTranslationImprover";
import { getUserFromToken } from "@/lib/utils/authHelper";

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
      console.error("Invalid token or user data");
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get feedback data from request body
    const feedbackData = await req.json();

    // Validate required fields
    if (
      !feedbackData.originalText ||
      !feedbackData.selectedTranslation ||
      !feedbackData.rating
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Add user ID
    feedbackData.userId = tokenData.id;

    // Store feedback in database
    await connectToDatabase();
    const result = await new Feedback({
      ...feedbackData,
      timestamp: Date.now(),
    }).save();

    console.log(
      `Stored feedback for "${feedbackData.originalText}" by user ${tokenData.id}`
    );

    return NextResponse.json({
      success: true,
      message: "Feedback stored successfully",
      feedbackId: result.id,
    });
  } catch (error) {
    console.error("Error storing feedback:", error);
    return NextResponse.json(
      { error: "Failed to store feedback" },
      { status: 500 }
    );
  }
}

// GET - Retrieve feedback statistics
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

    // Check if user is admin/guide
    if (tokenData.role !== "guide") {
      return NextResponse.json(
        { error: "Not authorized to view feedback stats" },
        { status: 403 }
      );
    }

    // Get roomId from query params
    const roomId = req.nextUrl.searchParams.get("roomId");

    await connectToDatabase();

    // Get feedback statistics
    let stats;
    if (roomId) {
      // Get stats for specific room
      stats = await Feedback.aggregate([
        { $match: { roomId } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgRating: { $avg: "$rating" },
            baseSelected: {
              $sum: {
                $cond: [
                  { $eq: ["$selectedTranslation", "$baseTranslation"] },
                  1,
                  0,
                ],
              },
            },
            enhancedSelected: {
              $sum: {
                $cond: [
                  { $eq: ["$selectedTranslation", "$enhancedTranslation"] },
                  1,
                  0,
                ],
              },
            },
            customTranslations: {
              $sum: { $cond: [{ $ne: ["$corrections", null] }, 1, 0] },
            },
          },
        },
      ]);
    } else {
      // Get overall stats
      stats = await Feedback.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgRating: { $avg: "$rating" },
            baseSelected: {
              $sum: {
                $cond: [
                  { $eq: ["$selectedTranslation", "$baseTranslation"] },
                  1,
                  0,
                ],
              },
            },
            enhancedSelected: {
              $sum: {
                $cond: [
                  { $eq: ["$selectedTranslation", "$enhancedTranslation"] },
                  1,
                  0,
                ],
              },
            },
            customTranslations: {
              $sum: { $cond: [{ $ne: ["$corrections", null] }, 1, 0] },
            },
          },
        },
      ]);
    }

    // Get most recent feedback samples
    const recentFeedback = await Feedback.find(roomId ? { roomId } : {})
      .sort({ timestamp: -1 })
      .limit(10);

    return NextResponse.json({
      stats: stats[0] || {
        count: 0,
        avgRating: 0,
        baseSelected: 0,
        enhancedSelected: 0,
        customTranslations: 0,
      },
      recentFeedback: recentFeedback.map((f) => ({
        originalText: f.originalText,
        selectedTranslation: f.selectedTranslation,
        rating: f.rating,
        timestamp: f.timestamp,
      })),
    });
  } catch (error) {
    console.error("Error retrieving feedback:", error);
    return NextResponse.json(
      { error: "Failed to retrieve feedback" },
      { status: 500 }
    );
  }
}
