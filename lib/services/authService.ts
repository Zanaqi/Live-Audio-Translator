// lib/services/authService.ts
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
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
      await connectToDatabase();
      const user = await User.findOne({ id: userId });
      return user?.rooms || [];
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
      await connectToDatabase();
      await User.updateOne(
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
      return true;
    } catch (error) {
      console.error('Error adding room to user:', error);
      return false;
    }
  }
}