import { NextRequest, NextResponse } from "next/server";
import os from "os";

export async function GET(req: NextRequest) {
  try {
    // Calculate CPU usage
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idlePercent = totalIdle / totalTick;
    const cpuUsage = Math.round((1 - idlePercent) * 100);

    // Get memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = Math.round((usedMem / totalMem) * 100);

    // Get system load average
    const loadAvg = os.loadavg();

    return NextResponse.json({
      cpuUsage,
      memoryUsage,
      loadAverage: loadAvg[0], // 1 minute load average
      uptime: os.uptime(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error getting system metrics:", error);
    return NextResponse.json(
      { error: "Failed to get system metrics" },
      { status: 500 }
    );
  }
}

// Add route to collect translation metrics
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { type, value } = data;

    console.log(`Received ${type} metric:`, value);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error storing metrics:", error);
    return NextResponse.json(
      { error: "Failed to store metrics" },
      { status: 500 }
    );
  }
}
