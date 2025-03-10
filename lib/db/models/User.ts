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
    roomCode?: string;
    role: 'guide' | 'tourist';
    joinedAt: Date;
  }[];
}


const roomEntrySchema = new Schema({
  roomId: { type: String, required: true },
  roomName: { type: String, required: true },
  roomCode: { type: String },
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

// Safely define User model
let User: Model<IUser>;

// Check if we're in a Node.js environment and if mongoose models is available
if (typeof mongoose !== 'undefined' && mongoose.models) {
  // First check if the model already exists to prevent model overwrite error
  if (mongoose.models.User) {
    User = mongoose.models.User as Model<IUser>;
  } else {
    // If model doesn't exist yet, create it
    try {
      User = model<IUser>('User', userSchema);
    } catch (error) {
      console.error('Error creating User model:', error);
      // Create a mock model
      User = {
        findOne: () => Promise.resolve(null),
        // Add other necessary methods
      } as unknown as Model<IUser>;
    }
  }
} else {
  // In environments where mongoose is not fully available (like Edge Runtime)
  User = {
    findOne: () => Promise.resolve(null),
    // Add other necessary methods
  } as unknown as Model<IUser>;
}

export default User;