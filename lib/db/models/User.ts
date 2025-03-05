// lib/db/models/User.ts
import mongoose, { Schema, model, Model } from 'mongoose';

export interface IUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'guide' | 'tourist';
  preferredLanguage?: string;
  createdAt: Date;
  rooms: {
    roomId: string;
    roomName: string;
    role: 'guide' | 'tourist';
    joinedAt: Date;
  }[];
}

const roomEntrySchema = new Schema({
  roomId: { type: String, required: true },
  roomName: { type: String, required: true },
  role: { type: String, required: true, enum: ['guide', 'tourist'] },
  joinedAt: { type: Date, default: Date.now }
});

const userSchema = new Schema<IUser>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['guide', 'tourist'] },
  preferredLanguage: { type: String },
  createdAt: { type: Date, default: Date.now },
  rooms: [roomEntrySchema]
});

// Check if the model exists first
const User = mongoose.models.User || model<IUser>('User', userSchema);

export default User;