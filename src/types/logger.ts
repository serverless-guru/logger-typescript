import type { MetricUnitList } from "../constants.js";

type Level = "info" | "debug" | "warn" | "error";
type StringArray = Array<string>;
type MetricUnit = (typeof MetricUnitList)[keyof typeof MetricUnitList];
interface MetricMeta {
    name: string;
    unit?: MetricUnit;
    dimensions?: Array<Array<string>>;
    value?: number;
}
type JSONValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | JSONValue[]
    | {
          [key: string]: JSONValue;
      };
interface JSONObject {
    [k: string]: JSONValue;
}
interface PayloadToPrintResponse {
    gzip?: boolean;
    payload: JSONObject | string | undefined;
}

interface LogEntry {
    serviceName: string;
    correlationId: string;
    logMessage: string;
    context: JSONObject;
    payload: JSONObject | string | undefined;
}

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

export type {
    Level,
    StringArray,
    EmfOutput,
    PayloadToPrintResponse,
    MetricMeta,
    LogEntry,
    MetricDefinition,
    JSONObject,
};