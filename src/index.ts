import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Console } from "node:console";
import { MetricUnitList, MAX_PAYLOAD_SIZE, COMPRESS_PAYLOAD_SIZE, MAX_PAYLOAD_MESSAGE } from "./constants";

import type {
    Level,
    StringArray,
    EmfOutput,
    PayloadToPrintResponse,
    MetricMeta,
    LogEntry,
    JSONObject,
    ErrorLogAttributes,
} from "./types";

const LOG_EVENT = process.env.SG_LOGGER_LOG_EVENT?.toLowerCase() === "true";
const SKIP_MASK = process.env.SG_LOGGER_MASK?.toLowerCase() === "false";
const MAX_SIZE = parseInt(process.env.SG_LOGGER_MAX_SIZE || `${MAX_PAYLOAD_SIZE}`) || MAX_PAYLOAD_SIZE;
const COMPRESS_SIZE =
    parseInt(process.env.SG_LOGGER_COMPRESS_SIZE || `${COMPRESS_PAYLOAD_SIZE}`) || COMPRESS_PAYLOAD_SIZE;
const NO_COMPRESS = process.env.SG_LOGGER_NO_COMPRESS?.toLowerCase() === "true";
const NO_SKIP = process.env.SG_LOGGER_NO_SKIP?.toLowerCase() === "true";
const LOG_TS = process.env.SG_LOGGER_LOG_TS?.toLowerCase() === "true";

class Logger {
    static METRIC_UNITS = MetricUnitList;

    private serviceName: string;
    private correlationId: string;
    private applicationName: string;
    private persistentContext: JSONObject;
    private console: Console;

    constructor(serviceName: string, applicationName: string, correlationId: string | null = null) {
        this.serviceName = serviceName;
        this.correlationId = correlationId ? correlationId : randomUUID();
        this.applicationName = applicationName;
        this.persistentContext = {};
        this.console =
            process.env.AWS_LAMBDA_LOG_FORMAT === "JSON" ? new Console((process.stdout, process.stderr)) : console;
    }

    log(
        level: Level,
        message: string = "",
        payload: JSONObject | Error = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ) {
        // Default sensitive attributes
        const defaultSensitiveAttributes: StringArray = [
            "password",
            "userid",
            "token",
            "secret",
            "key",
            "x-api-key",
            "bearer",
            "authorization",
        ];

        const arrayToLowerCase = (array: StringArray): StringArray => {
            if (Array.isArray(array)) {
                return array
                    .map((el) => {
                        if (typeof el === "string") {
                            return el.toLowerCase();
                        }
                        return undefined;
                    })
                    .filter((el) => typeof el !== "undefined");
            }
            return [];
        };

        // Merge default sensitive attributes with custom ones
        const attributesToMask = new Set([...defaultSensitiveAttributes, ...arrayToLowerCase(sensitiveAttributes)]);

        // Mask sensitive attributes, remove null
        const maskSensitiveAttributes = (key: string, value: JSONObject): JSONObject | string | undefined => {
            if (value === null) {
                return undefined;
            }
            if (typeof value === "object" && isEmptyObject(value)) {
                return undefined;
            }
            if (SKIP_MASK === true) {
                return value;
            }
            if (attributesToMask.has(key.toLowerCase())) {
                return "****";
            }
            return value;
        };

        const isEmptyObject = (value: JSONObject): boolean => {
            if (value == null) {
                return false;
            }
            if (typeof value !== "object") {
                return false;
            }
            const proto = Object.getPrototypeOf(value);
            if (proto !== null && proto !== Object.prototype) {
                return false;
            }
            return isEmpty(value);
        };

        const isEmpty = (obj: JSONObject): boolean => {
            for (const prop in obj) {
                if (Object.hasOwn(obj, prop)) {
                    return false;
                }
            }
            return true;
        };

        const getPayloadToPrint = (payload: JSONObject | Error): PayloadToPrintResponse => {
            if (payload instanceof Error) {
                return { gzip: false, error: formatError(payload) };
            }
            if (level === "warn" && message === MAX_PAYLOAD_MESSAGE) {
                return { gzip: false, payload };
            }
            const stringifiedPayload = JSON.stringify(payload, maskSensitiveAttributes);
            if (stringifiedPayload.length > MAX_SIZE && !NO_SKIP) {
                this.warn(MAX_PAYLOAD_MESSAGE, { size: stringifiedPayload.length, MAX_SIZE });
                return { gzip: false, payload: undefined };
            }
            if (stringifiedPayload.length > COMPRESS_SIZE && !NO_COMPRESS) {
                return { gzip: true, payload: gzipSync(stringifiedPayload).toString("base64") };
            }
            return { gzip: false, payload };
        };

        const formatError = (error: Error): ErrorLogAttributes => {
            return {
                name: error.name,
                location: getCodeLocation(error.stack),
                message: error.message,
                stack: error.stack,
                cause: error.cause instanceof Error ? formatError(error.cause) : error.cause,
            };
        };

        const getCodeLocation = (stack?: string) => {
            if (!stack) {
                return "";
            }

            const stackLines = stack.split("\n");
            const regex = /\(([^)]*?):(\d+?):(\d+?)\)\\?$/;

            for (const item of stackLines) {
                const match = regex.exec(item);

                if (Array.isArray(match)) {
                    return `${match[1]}:${Number(match[2])}`;
                }
            }

            return "";
        };

        const getTimestamp = (): number | undefined => {
            if (LOG_TS) {
                return new Date().getTime();
            }
            return undefined;
        };

        const payloadToPrint = getPayloadToPrint(payload);

        const logEntry: LogEntry = {
            timestamp: getTimestamp(),
            service: this.serviceName,
            correlationId: this.correlationId,
            message,
            context: {
                ...this.persistentContext,
                ...(typeof context === "object" && context !== null && Object.keys(context).length ? context : {}),
                gzip: payloadToPrint.gzip === true ? true : undefined,
            },
            payload: payloadToPrint.payload,
            error: payloadToPrint.error,
        };

        const stringifiedLogEntry = JSON.stringify(logEntry, maskSensitiveAttributes);
        switch (level) {
            case "info":
                this.console.info(stringifiedLogEntry);
                break;
            case "debug":
                this.console.debug(stringifiedLogEntry);
                break;
            case "warn":
                this.console.warn(stringifiedLogEntry);
                break;
            case "error":
                this.console.error(stringifiedLogEntry);
                break;
            default:
                break;
        }
    }

    info(
        message: string = "",
        payload: JSONObject = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ) {
        this.log("info", message, payload, context, sensitiveAttributes);
    }

    debug(
        message: string = "",
        payload: JSONObject = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ) {
        this.log("debug", message, payload, context, sensitiveAttributes);
    }

    warn(
        message: string = "",
        payload: JSONObject = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ) {
        this.log("warn", message, payload, context, sensitiveAttributes);
    }

    error(
        message: string = "",
        payload: JSONObject | Error = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ) {
        this.log("error", message, payload, context, sensitiveAttributes);
    }

    logInputEvent(event: JSONObject): void {
        if (LOG_EVENT) {
            this.info("Input Event", event, {});
        }
    }

    getCorrelationId(): string {
        return this.correlationId;
    }

    setCorrelationId(correlationId: string): void {
        if (correlationId) {
            this.correlationId = correlationId;
        }
    }

    addContextKey(contextObject: JSONObject): void {
        if (typeof contextObject === "object" && contextObject !== null) {
            this.persistentContext = {
                ...this.persistentContext,
                ...contextObject,
            };
        }
    }

    clearLogContext(): void {
        this.persistentContext = {};
        this.correlationId = "";
        this.applicationName = "";
        this.serviceName = "";
    }

    metric(activity: string, meta: MetricMeta): void {
        if (!meta.name) {
            return;
        }
        const unit = meta.name === "Duration" ? MetricUnitList.Milliseconds : meta.unit || MetricUnitList.Count;
        const dimensions = meta.dimensions || [];
        const emf: EmfOutput = {
            message: `[Embedded Metric] ${activity}`,
            service: this.serviceName,
            correlationId: this.correlationId,
            [meta.name]: typeof meta.value === "number" ? meta.value : 1,
            ...dimensions.reduce((acc: Record<string, string>, curr) => {
                acc[curr[0]] = curr[1];
                return acc;
            }, {}),
            Activity: activity,
            _aws: {
                Timestamp: Date.now(),
                CloudWatchMetrics: [
                    {
                        Namespace: this.applicationName,
                        Dimensions: [
                            ["Activity", ...dimensions.map((groupPair) => groupPair[0])],
                            ["Activity"],
                            ...dimensions.map((groupPair) => [groupPair[0]]),
                        ],
                        Metrics: [
                            {
                                Name: meta.name,
                                Unit: unit,
                            },
                        ],
                    },
                ],
            },
        };
        this.console.log(JSON.stringify(emf));
    }
}

export { Logger };
