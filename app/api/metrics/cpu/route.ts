import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  try {
    // Calculate CPU usage
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idlePercent = totalIdle / totalTick;
    const cpuUsage = Math.round((1 - idlePercent) * 100);

    return NextResponse.json({
      cpuUsage,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting CPU metrics:', error);
    return NextResponse.json(
      { error: 'Failed to get CPU metrics' },
      { status: 500 }
    );
  }
}