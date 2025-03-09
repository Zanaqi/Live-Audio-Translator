import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { jwtVerify } from 'jose';
import connectToDatabase from '../db/mongodb';
import User, { IUser } from '../db/models/User';
import { generateToken } from '../utils/authHelper';
import { mongoRoomStore } from '../store/mongoRoomStore';

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: Partial<IUser>;
}

export class AuthService {
    static async getUserFromToken(token: string) {
        try {
            const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-fallback-secret-key-here');
            const { payload } = await jwtVerify(token, secret);
            
            if (!payload.id) {
                console.log('No user ID in token payload');
                return null;
            }
            
            try {
                await connectToDatabase();
                const user = await User.findOne({ id: payload.id });
                
                console.log('Database lookup result:', user ? 'User found' : 'User not found');
                
                if (!user) {
                    return null;
                }
                
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    preferredLanguage: user.preferredLanguage
                };
            } catch (dbError) {
                console.error('Database error:', dbError);
                // Return basic info from token for edge runtime
                return {
                    id: payload.id as string,
                    email: payload.email as string,
                    name: payload.name as string,
                    role: payload.role as string,
                    preferredLanguage: payload.preferredLanguage as string
                };
            }
        } catch (error) {
            console.error('Error getting user from token:', error);
            return null;
        }
    }

  static async register(
    email: string,
    password: string,
    name: string,
    role: 'guide' | 'tourist',
    preferredLanguage?: string
  ): Promise<AuthResponse> {
    try {
      await connectToDatabase();

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return { success: false, message: 'Email already registered' };
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const userId = uuidv4();
      const user = new User({
        id: userId,
        email,
        password: hashedPassword,
        name,
        role,
        preferredLanguage,
        rooms: []
      });

      await user.save();

      // Generate token
      const token = await generateToken({
        id: userId,
        email,
        role,
        name,
        preferredLanguage
      });

      // Return user data (excluding password)
      const userData = {
        id: userId,
        email,
        name,
        role,
        preferredLanguage
      };

      return { success: true, token, user: userData };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }

  static async login(email: string, password: string): Promise<AuthResponse> {
    try {
      await connectToDatabase();

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return { success: false, message: 'Invalid credentials' };
      }

      // Generate token
      const token = await generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        preferredLanguage: user.preferredLanguage
      });

      // Return user data (excluding password)
      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage
      };

      return { success: true, token, user: userData };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed' };
    }
  }

  static async getUserRooms(userId: string) {
    try {
      console.log('Getting rooms for user:', userId);
      await connectToDatabase();
      
      const user = await User.findOne({ id: userId });
      console.log('Found user:', user ? 'yes' : 'no');
      
      if (!user) {
        console.error('User not found:', userId);
        return [];
      }
      
      // If the user's rooms field doesn't already contain roomCode, we need to fetch it
      const userRooms = user.rooms || [];
      
      // If user rooms already have roomCode, just return them
      if (userRooms.length > 0 && userRooms[0].roomCode) {
        console.log('User rooms with codes already available:', userRooms);
        return userRooms;
      }
      
      // Otherwise, fetch the roomCode for each room
      const roomsWithCodes = await Promise.all(userRooms.map(async (room) => {
        try {
          // Fetch the room to get its code
          const fullRoom = await mongoRoomStore.getRoom(room.roomId);
          
          return {
            ...room,
            roomCode: fullRoom?.code || ''
          };
        } catch (error) {
          console.error('Error fetching room code:', error);
          return {
            ...room,
            roomCode: ''
          };
        }
      }));
      
      console.log('User rooms with codes:', roomsWithCodes);
      return roomsWithCodes;
    } catch (error) {
      console.error('Error getting user rooms:', error);
      return [];
    }
  }

  static async addRoomToUser(
    userId: string,
    roomId: string,
    roomName: string,
    role: 'guide' | 'tourist',
    roomCode?: string
  ) {
    try {
      console.log('Adding room to user:', { userId, roomId, roomName, role, roomCode });
      await connectToDatabase();
      
      // If roomCode wasn't provided, try to get it
      let code = roomCode;
      if (!code) {
        try {
          const room = await mongoRoomStore.getRoom(roomId);
          code = room?.code;
        } catch (error) {
          console.warn('Could not get room code:', error);
        }
      }
      
      const result = await User.updateOne(
        { id: userId },
        {
          $push: {
            rooms: {
              roomId,
              roomName,
              roomCode: code,
              role,
              joinedAt: new Date()
            }
          }
        }
      );
      
      console.log('Update result:', result);
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error adding room to user:', error);
      return false;
    }
  }
  
  static async removeRoomFromUser(userId: string, roomId: string): Promise<boolean> {
    try {
      console.log('Removing room from user:', { userId, roomId });
      await connectToDatabase();
      
      const result = await User.updateOne(
        { id: userId },
        { $pull: { rooms: { roomId: roomId } } }
      );
      
      console.log('Update result:', result);
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error removing room from user:', error);
      return false;
    }
  }
}