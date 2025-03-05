// lib/db/mongodb.ts
import mongoose from 'mongoose';

// Get MongoDB URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/audio-translation';

// Define interface for the cached mongoose connection
interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Define the global type for TypeScript
declare global {
  // eslint-disable-next-line no-var
  var mongooseConnection: CachedConnection | undefined;
}

// Initialize cached connection
let cached: CachedConnection = global.mongooseConnection ?? {
  conn: null,
  promise: null,
};

// Only save connection to global if we're in a Node.js environment
if (typeof global !== 'undefined') {
  global.mongooseConnection = cached;
}

async function connectToDatabase(): Promise<typeof mongoose> {
  // If connection is already established, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If connection is being established, wait for it
  if (cached.promise) {
    return await cached.promise;
  }

  try {
    // Check if we're in a browser/edge environment where mongoose might not work fully
    if (typeof window !== 'undefined' || !mongoose.connect) {
      console.warn('Running in browser or edge environment - MongoDB connections may not work');
      return mongoose;
    }

    // Store the connection promise
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });

    // Wait for connection
    cached.conn = await cached.promise;
    
    console.log('Successfully connected to MongoDB');
    return cached.conn;
  } catch (e) {
    console.error('Failed to connect to MongoDB:', e);
    cached.promise = null;
    throw e;
  }
}

export default connectToDatabase;