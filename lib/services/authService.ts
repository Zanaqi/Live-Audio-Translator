// lib/services/authService.ts
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { jwtVerify } from 'jose';
import connectToDatabase from '../db/mongodb';
import User, { IUser } from '../db/models/User';
import { generateToken } from '../utils/authHelper';

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: Partial<IUser>;
}

export class AuthService {
    static async getUserFromToken(token: string) {
        try {
            const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');
            const { payload } = await jwtVerify(token, secret);
            
            if (!payload.id) {
            console.log('No user ID in token payload');
            return null;
            }
        
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
        name
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
        name: user.name
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
      
      console.log('User rooms:', user.rooms);
      return user.rooms || [];
    } catch (error) {
      console.error('Error getting user rooms:', error);
      return [];
    }
  }

  static async addRoomToUser(
    userId: string,
    roomId: string,
    roomName: string,
    role: 'guide' | 'tourist'
  ) {
    try {
      console.log('Adding room to user:', { userId, roomId, roomName, role });
      await connectToDatabase();
      
      const result = await User.updateOne(
        { id: userId },
        {
          $push: {
            rooms: {
              roomId,
              roomName,
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
}