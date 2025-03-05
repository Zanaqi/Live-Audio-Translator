// lib/store/mongoRoomStore.ts
import connectToDatabase from '../db/mongodb';
import Room, { IRoom, IParticipant } from '../db/models/Room';
import { v4 as uuidv4 } from 'uuid';

export class MongoRoomStore {
  private static instance: MongoRoomStore;

  private constructor() {}

  public static getInstance(): MongoRoomStore {
    if (!MongoRoomStore.instance) {
      MongoRoomStore.instance = new MongoRoomStore();
    }
    return MongoRoomStore.instance;
  }

  public async createRoom(roomData: IRoom): Promise<IRoom> {
    try {
      await connectToDatabase();
      
      // Create new room instance
      const room = new Room(roomData);
      
      // Save to database
      await room.save();
      
      return room;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  public async getRoom(id: string): Promise<IRoom | null> {
    try {
      await connectToDatabase();
      return await Room.findOne({ id });
    } catch (error) {
      console.error('Error getting room:', error);
      return null;
    }
  }

  public async getRoomByCode(code: string): Promise<IRoom | null> {
    try {
      await connectToDatabase();
      return await Room.findOne({ code, active: true });
    } catch (error) {
      console.error('Error getting room by code:', error);
      return null;
    }
  }

  public async getAllRooms(): Promise<IRoom[]> {
    try {
      await connectToDatabase();
      return await Room.find({});
    } catch (error) {
      console.error('Error getting all rooms:', error);
      return [];
    }
  }

  public async addParticipant(roomId: string, participant: IParticipant): Promise<boolean> {
    try {
      await connectToDatabase();
      
      // Ensure this participant isn't already in the room
      const room = await Room.findOne({ id: roomId });
      if (!room) return false;
      
      const existingParticipant = room.participants.find(p => p.id === participant.id);
      if (existingParticipant) {
        // Update the existing participant
        const result = await Room.updateOne(
          { id: roomId, "participants.id": participant.id },
          { $set: { "participants.$": participant } }
        );
        return result.modifiedCount > 0;
      }
      
      // Add new participant
      const result = await Room.updateOne(
        { id: roomId },
        { $push: { participants: participant } }
      );
      
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error adding participant:', error);
      return false;
    }
  }

  public async updateRoomGuide(roomId: string, guideId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      
      // First, update the room's guideId field
      const roomResult = await Room.updateOne(
        { id: roomId },
        { $set: { guideId: guideId } }
      );
      
      // Then find any existing guide participant and update their ID
      // or add a new guide participant if none exists
      const room = await Room.findOne({ id: roomId });
      
      if (!room) return false;
      
      const existingGuideIndex = room.participants.findIndex(p => p.role === 'guide');
      
      if (existingGuideIndex >= 0) {
        // Update existing guide participant
        room.participants[existingGuideIndex].id = guideId;
      } else {
        // Add new guide participant
        room.participants.push({
          id: guideId,
          roomId: roomId,
          role: 'guide',
          name: 'Tour Guide',
          userId: guideId
        });
      }
      
      await room.save();
      
      return true;
    } catch (error) {
      console.error('Error updating room guide:', error);
      return false;
    }
  }

  public async removeParticipant(roomId: string, participantId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const result = await Room.updateOne(
        { id: roomId },
        { $pull: { participants: { id: participantId } } }
      );
      
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error removing participant:', error);
      return false;
    }
  }

  public async deactivateRoom(id: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const result = await Room.updateOne(
        { id },
        { $set: { active: false } }
      );
      
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error deactivating room:', error);
      return false;
    }
  }

  private generateRoomCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
  }
}

export const mongoRoomStore = MongoRoomStore.getInstance();