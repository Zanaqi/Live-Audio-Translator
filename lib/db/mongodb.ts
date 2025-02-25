// lib/db/mongodb.ts
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

console.log("MongoDB URI:", MONGODB_URI);

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

// Save our connection cache to the global object
global.mongooseConnection = cached;

async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;