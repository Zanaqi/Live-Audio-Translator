import { NextRequest, NextResponse } from "next/server";
import { mongoRoomStore } from "@/lib/store/mongoRoomStore";
import { AuthService } from "@/lib/services/authService";

// GET - Fetch a specific room by ID
export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;
    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Verify auth
    const token = req.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get room details
    const room = await mongoRoomStore.getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // For security, verify that user has access to this room
    // If user is a guide, they should be the creator
    // If user is a tourist, they should be a participant
    const isGuide = user.role === "guide" && room.createdBy === user.id;
    const isTourist =
      user.role === "tourist" &&
      room.participants.some((p) => p.userId === user.id);

    if (!isGuide && !isTourist) {
      return NextResponse.json(
        { error: "Not authorized to access this room" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name,
      active: room.active,
      participants: room.participants,
      createdAt: room.createdAt,
    });
  } catch (error) {
    console.error("Error fetching room:", error);
    return NextResponse.json(
      { error: "Failed to fetch room" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a room (guide only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;
    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Verify auth
    const token = req.headers.get("Authorization")?.split(" ")[1];
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only guides can delete rooms
    if (user.role !== "guide") {
      return NextResponse.json(
        { error: "Only guides can delete rooms" },
        { status: 403 }
      );
    }

    // Get room details
    const room = await mongoRoomStore.getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Verify the guide is the room creator
    if (room.createdBy !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own rooms" },
        { status: 403 }
      );
    }

    // Delete the room
    const success = await mongoRoomStore.deleteRoom(roomId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete room" },
        { status: 500 }
      );
    }

    // Remove room from user history
    await AuthService.removeRoomFromUser(user.id, roomId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 }
    );
  }
}
