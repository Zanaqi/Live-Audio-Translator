// lib/store/roomStore.ts
export interface Room {
    id: string;
    code: string;
    name: string;
    guideId: string;
    createdAt: Date;
    active: boolean;
    participants: Participant[];
  }
  
  export interface Participant {
    id: string;
    roomId: string;
    role: 'guide' | 'tourist';
    preferredLanguage?: string;
    socketId?: string;
    name: string;
  }
  
  // Singleton pattern for shared room storage
  class RoomStore {
    private static instance: RoomStore;
    private rooms: Record<string, Room> = {};
  
    private constructor() {}
  
    public static getInstance(): RoomStore {
      if (!RoomStore.instance) {
        RoomStore.instance = new RoomStore();
      }
      return RoomStore.instance;
    }
  
    public createRoom(room: Room): void {
      this.rooms[room.id] = room;
      console.log(`Room created: ${room.code} (${room.id})`);
      console.log(`Active rooms: ${Object.keys(this.rooms).length}`);
    }
  
    public getRoom(id: string): Room | undefined {
      return this.rooms[id];
    }
  
    public getRoomByCode(code: string): Room | undefined {
      return Object.values(this.rooms).find(room => room.code === code && room.active);
    }
  
    public getAllRooms(): Room[] {
      return Object.values(this.rooms);
    }
  
    public addParticipant(roomId: string, participant: Participant): boolean {
      const room = this.rooms[roomId];
      if (!room) return false;
      
      room.participants.push(participant);
      return true;
    }
  
    public removeParticipant(roomId: string, participantId: string): boolean {
      const room = this.rooms[roomId];
      if (!room) return false;
      
      const index = room.participants.findIndex(p => p.id === participantId);
      if (index === -1) return false;
      
      room.participants.splice(index, 1);
      return true;
    }
  
    public deactivateRoom(id: string): boolean {
      const room = this.rooms[id];
      if (!room) return false;
      
      room.active = false;
      return true;
    }
  }
  
  // Export the singleton instance
  export const roomStore = RoomStore.getInstance();