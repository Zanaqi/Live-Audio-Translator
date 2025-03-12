import { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-key-here";
const secret = new TextEncoder().encode(JWT_SECRET);

export async function verifyAuth(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error("Auth verification error:", error);
    return null;
  }
}

export async function generateToken(payload: any) {
  try {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    return await new SignJWT({
      ...payload,
      // Add required claims
      iat: now, // Issued at (now)
      nbf: now, // Not valid before (now)
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt() // This also sets the iat claim
      .sign(secret);
  } catch (error) {
    console.error("Error generating token:", error);
    throw new Error("Failed to generate token");
  }
}

export async function getUserFromToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error("Error getting user from token:", error);
    return null;
  }
}
