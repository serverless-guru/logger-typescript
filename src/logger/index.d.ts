interface METRIC_UNITS {
    Seconds: "Seconds";
    Microseconds: "Microseconds";
    Milliseconds: "Milliseconds";
    Bytes: "Bytes";
    Kilobytes: "Kilobytes";
    Megabytes: "Megabytes";
    Gigabytes: "Gigabytes";
    Terabytes: "Terabytes";
    Bits: "Bits";
    Kilobits: "Kilobits";
    Megabits: "Megabits";
    Gigabits: "Gigabits";
    Terabits: "Terabits";
    Percent: "Percent";
    Count: "Count";
    BytesPerSecond: "Bytes/Second";
    KilobytesPerSecond: "Kilobytes/Second";
    MegabytesPerSecond: "Megabytes/Second";
    GigabytesPerSecond: "Gigabytes/Second";
    TerabytesPerSecond: "Terabytes/Second";
    BitsPerSecond: "Bits/Second";
    KilobitsPerSecond: "Kilobits/Second";
    MegabitsPerSecond: "Megabits/Second";
    GigabitsPerSecond: "Gigabits/Second";
    TerabitsPerSecond: "Terabits/Second";
    CountPerSecond: "Count/Second";
}
type Level = "info" | "debug" | "warn" | "error";
interface MetricMeta {
    name: string;
    value?: number;
    unit?: METRIC_UNITS[keyof METRIC_UNITS];
    dimensions?: Array<Array<string>>;
}

export class Logger {
    constructor(serviceName: string, applicationName: string, correlationId?: string | null);
    static METRIC_UNITS: METRIC_UNITS;
    log(
        level: Level,
        message: string,
        payload?: Record<string, any>,
        context?: Record<string, any>,
        sensitiveAttributes?: Array<string>
    ): void;
    info(
        message: string,
        payload?: Record<string, any>,
        context?: Record<string, any>,
        sensitiveAttributes?: Array<string>
    ): void;
    debug(
        message: string,
        payload?: Record<string, any>,
        context?: Record<string, any>,
        sensitiveAttributes?: Array<string>
    ): void;
    warn(
        message: string,
        payload?: Record<string, any>,
        context?: Record<string, any>,
        sensitiveAttributes?: Array<string>
    ): void;
    error(
        message: string,
        payload?: Record<string, any>,
        context?: Record<string, any>,
        sensitiveAttributes?: Array<string>
    ): void;
    logInputEvent(event: any): void;
    getCorrelationId(): void;
    addContextKey(contextObject: Record<string, any>): void;
    metric(activity: string, meta: MetricMeta): void;
    clearLogContext(): void;
}
