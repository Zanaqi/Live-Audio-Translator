// lib/db/models/Room.ts
import mongoose, { Schema, model, Model } from 'mongoose';

export interface IParticipant {
  id: string;
  roomId: string;
  role: 'guide' | 'tourist';
  preferredLanguage?: string;
  socketId?: string;
  name: string;
  // Add user reference
  userId: string;
}

export interface IRoom {
  id: string;
  code: string;
  name: string;
  guideId: string;
  createdAt: Date;
  active: boolean;
  participants: IParticipant[];
  // Add user reference
  createdBy: string;
}

const participantSchema = new Schema<IParticipant>({
    id: { type: String, required: true },
    roomId: { type: String, required: false },
    role: { type: String, required: true, enum: ['guide', 'tourist'] },
    preferredLanguage: { type: String },
    socketId: { type: String },
    name: { type: String, required: true },
    userId: { type: String, required: true } // Add user reference
});

const roomSchema = new Schema<IRoom>({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  guideId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
  participants: [participantSchema],
  createdBy: { type: String, required: true } // Add user reference
});

// Prevent model overwrite error in development
const Room = mongoose.models.Room || model<IRoom>('Room', roomSchema);

export default Room as Model<IRoom>;