import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { AuthService } from "@/lib/services/authService";

const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-key-here";

export async function GET(req: NextRequest) {
  try {
    // Extract token from header
    const token = req.headers.get("Authorization")?.split(" ")[1];

    if (!token) {
      console.log("No token provided");
      return NextResponse.json({ error: "No token provided" }, { status: 401 });
    }

    // First verify token format without database access
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.id) {
        console.log("Invalid token payload (no id)");
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }

      // If token format is valid, try to get user from database
      try {
        const user = await AuthService.getUserFromToken(token);

        if (!user) {
          console.log("User not found in database");
          return NextResponse.json(
            { error: "User not found" },
            { status: 401 }
          );
        }

        return NextResponse.json({ valid: true, user });
      } catch (dbError) {
        console.error("Database error during token verification:", dbError);

        // In case of database error, return basic info from token
        // This acts as a fallback for environments where DB access might fail
        return NextResponse.json({
          valid: true,
          user: {
            id: payload.id,
            name: payload.name,
            email: payload.email,
            role: payload.role,
            preferredLanguage: payload.preferredLanguage,
          },
        });
      }
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch (error) {
    console.error("Token verification error:", error);
    return NextResponse.json(
      { error: "Token verification failed" },
      { status: 401 }
    );
  }
}
