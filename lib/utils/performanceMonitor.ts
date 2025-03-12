interface PerformanceMetrics {
  latency: number[];
  audioQuality: number[];
  translationAccuracy: number[];
  concurrentUsers: number;
  cpuUsage: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
    latency: [],
    audioQuality: [],
    translationAccuracy: [],
    concurrentUsers: 0,
    cpuUsage: 0,
  };

  private readonly LATENCY_THRESHOLD = 2000; // 2 seconds max
  private readonly MOS_THRESHOLD = 4.0; // Mean Opinion Score threshold
  private readonly ACCURACY_THRESHOLD = 0.85; // 85% accuracy threshold
  private readonly MAX_CONCURRENT_USERS = 100;
  private readonly CPU_THRESHOLD = 80; // 80% CPU usage threshold
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      this.startMonitoring();
    }
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private startMonitoring(): void {
    // Monitor every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkPerformance();
    }, 5000);
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  public recordLatency(start: number, end: number): void {
    const latency = end - start;
    this.metrics.latency.push(latency);

    // Keep only last 100 measurements
    if (this.metrics.latency.length > 100) {
      this.metrics.latency.shift();
    }

    if (latency > this.LATENCY_THRESHOLD) {
      console.warn(`High latency detected: ${latency}ms`);
    }
  }

  public recordAudioQuality(mosScore: number): void {
    this.metrics.audioQuality.push(mosScore);

    if (this.metrics.audioQuality.length > 100) {
      this.metrics.audioQuality.shift();
    }

    if (mosScore < this.MOS_THRESHOLD) {
      console.warn(`Low audio quality detected: MOS ${mosScore}`);
    }
  }

  public recordTranslationAccuracy(score: number): void {
    this.metrics.translationAccuracy.push(score);

    if (this.metrics.translationAccuracy.length > 100) {
      this.metrics.translationAccuracy.shift();
    }

    if (score < this.ACCURACY_THRESHOLD) {
      console.warn(`Low translation accuracy detected: ${score}`);
    }
  }

  public updateConcurrentUsers(count: number): void {
    this.metrics.concurrentUsers = count;

    if (count > this.MAX_CONCURRENT_USERS) {
      console.warn(`High concurrent user count: ${count}`);
    }
  }

  private async getCPUUsage(): Promise<number> {
    try {
      const response = await fetch("/api/metrics/cpu");
      if (!response.ok) {
        throw new Error("Failed to get CPU metrics");
      }
      const data = await response.json();
      return data.cpuUsage;
    } catch (error) {
      console.error("Failed to get CPU usage:", error);
      return 0;
    }
  }

  private calculateAverage(array: number[]): number {
    if (array.length === 0) return 0;
    return array.reduce((a, b) => a + b, 0) / array.length;
  }

  private async checkPerformance(): Promise<void> {
    try {
      // Update CPU usage
      this.metrics.cpuUsage = await this.getCPUUsage();

      // Calculate averages
      const avgLatency = this.calculateAverage(this.metrics.latency);
      const avgMOS = this.calculateAverage(this.metrics.audioQuality);
      const avgAccuracy = this.calculateAverage(
        this.metrics.translationAccuracy
      );

      // Check against thresholds
      const issues = [];

      if (avgLatency > this.LATENCY_THRESHOLD) {
        issues.push(`High average latency: ${avgLatency}ms`);
      }

      if (avgMOS < this.MOS_THRESHOLD) {
        issues.push(`Low average audio quality: MOS ${avgMOS}`);
      }

      if (avgAccuracy < this.ACCURACY_THRESHOLD) {
        issues.push(`Low average translation accuracy: ${avgAccuracy}`);
      }

      if (this.metrics.cpuUsage > this.CPU_THRESHOLD) {
        issues.push(`High CPU usage: ${this.metrics.cpuUsage}%`);
      }

      if (this.metrics.concurrentUsers > this.MAX_CONCURRENT_USERS) {
        issues.push(
          `Too many concurrent users: ${this.metrics.concurrentUsers}`
        );
      }

      if (issues.length > 0) {
        console.warn("Performance issues detected:", issues);
      }
    } catch (error) {
      console.error("Error checking performance:", error);
    }
  }

  public getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      latency: [...this.metrics.latency],
      audioQuality: [...this.metrics.audioQuality],
      translationAccuracy: [...this.metrics.translationAccuracy],
    };
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
