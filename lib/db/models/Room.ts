import mongoose, { Schema, model, Model } from 'mongoose';

export interface IParticipant {
  id: string;
  roomId: string;
  role: 'guide' | 'tourist';
  preferredLanguage?: string;
  socketId?: string;
  name: string;
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
  createdBy: string;
}

const participantSchema = new Schema<IParticipant>({
    id: { type: String, required: true },
    roomId: { type: String, required: false },
    role: { type: String, required: true, enum: ['guide', 'tourist'] },
    preferredLanguage: { type: String },
    socketId: { type: String },
    name: { type: String, required: true },
    userId: { type: String, required: true } 
});

const roomSchema = new Schema<IRoom>({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  guideId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
  participants: [participantSchema],
  createdBy: { type: String, required: true }
});

// Safely define Room model
let Room: Model<IRoom>;

// Check if we're in a Node.js environment and if mongoose models is available
if (typeof mongoose !== 'undefined' && mongoose.models) {
  // First check if the model already exists to prevent model overwrite error
  if (mongoose.models.Room) {
    Room = mongoose.models.Room as Model<IRoom>;
  } else {
    // If model doesn't exist yet, create it
    try {
      Room = model<IRoom>('Room', roomSchema);
    } catch (error) {
      console.error('Error creating Room model:', error);
      // Create a mock model
      Room = {
        findOne: () => Promise.resolve(null),
        find: () => Promise.resolve([]),
        // Add other necessary methods
      } as unknown as Model<IRoom>;
    }
  }
} else {
  // In environments where mongoose is not fully available (like Edge Runtime)
  Room = {
    findOne: () => Promise.resolve(null),
    find: () => Promise.resolve([]),
    // Add other necessary methods
  } as unknown as Model<IRoom>;
}

export default Room;