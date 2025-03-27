import type { LOG_LEVELS, MetricUnitList } from "../constants.js";

type Level = (typeof LOG_LEVELS)[number];
type StringArray = Array<string>;
type MetricUnit = (typeof MetricUnitList)[keyof typeof MetricUnitList];
interface MetricMeta {
    name: string;
    unit?: MetricUnit;
    dimensions?: Array<Array<string>>;
    value?: number;
}
type JSONValue = string | number | boolean | null | undefined | JSONValue[] | JSONObject;

interface JSONObject {
    [k: string]: JSONValue;
}
interface PayloadToPrintResponse {
    gzip?: boolean;
    payload?: JSONValue | string | undefined;
    error?: ErrorLogAttributes;
}

interface LogEntry {
    timestamp?: number;
    level: string;
    service: string;
    correlationId: string;
    message: string;
    context?: JSONObject;
    payload?: JSONValue;
    error?: ErrorLogAttributes;
}

type ErrorLogAttributes = { [key: string]: unknown };

type EmfOutput = Readonly<{
    [key: string]: string | number | object;
    _aws: {
        Timestamp: number;
        CloudWatchMetrics: {
            Namespace: string;
            Dimensions: string[][];
            Metrics: MetricDefinition[];
        }[];
    };
}>;
type MetricDefinition = {
    Name: string;
    Unit: MetricUnit;
};

interface LogOptions {
    additionalSensitiveAttributes?: StringArray;
    overrideSensitiveAttributes?: StringArray;
}

interface LoggerOptions extends LogOptions {
    correlationId?: string | null;
}

export type {
    Level,
    StringArray,
    EmfOutput,
    PayloadToPrintResponse,
    MetricMeta,
    LogEntry,
    MetricDefinition,
    JSONObject,
    JSONValue,
    ErrorLogAttributes,
    LogOptions,
    LoggerOptions,
};
