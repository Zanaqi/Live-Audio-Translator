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

  public async createRoom(roomData: Omit<IRoom, 'id' | 'code' | 'createdAt'>): Promise<IRoom> {
    await connectToDatabase();
    
    const roomId = uuidv4();
    const roomCode = this.generateRoomCode();
    
    // Update participants with the correct roomId
    const participants = roomData.participants.map(participant => ({
      ...participant,
      roomId: roomId
    }));
    
    const room = new Room({
      id: roomId,
      code: roomCode,
      name: roomData.name,
      guideId: roomData.guideId,
      active: true,
      participants: participants
    });
    
    await room.save();
    return room;
  }

  public async getRoom(id: string): Promise<IRoom | null> {
    await connectToDatabase();
    return Room.findOne({ id });
  }

  public async getRoomByCode(code: string): Promise<IRoom | null> {
    await connectToDatabase();
    return Room.findOne({ code, active: true });
  }

  public async getAllRooms(): Promise<IRoom[]> {
    await connectToDatabase();
    return Room.find({});
  }

  public async addParticipant(roomId: string, participant: IParticipant): Promise<boolean> {
    await connectToDatabase();
    const result = await Room.updateOne(
      { id: roomId },
      { $push: { participants: participant } }
    );
    
    return result.modifiedCount > 0;
  }

  public async updateRoomGuide(roomId: string, guideId: string): Promise<boolean> {
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
        name: 'Tour Guide'
      });
    }
    
    await room.save();
    
    return true;
  }

  public async removeParticipant(roomId: string, participantId: string): Promise<boolean> {
    await connectToDatabase();
    const result = await Room.updateOne(
      { id: roomId },
      { $pull: { participants: { id: participantId } } }
    );
    
    return result.modifiedCount > 0;
  }

  public async deactivateRoom(id: string): Promise<boolean> {
    await connectToDatabase();
    const result = await Room.updateOne(
      { id },
      { $set: { active: false } }
    );
    
    return result.modifiedCount > 0;
  }

  private generateRoomCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
  }
}

export const mongoRoomStore = MongoRoomStore.getInstance();