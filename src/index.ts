import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Console } from "node:console";
import {
    MetricUnitList,
    MAX_PAYLOAD_SIZE,
    COMPRESS_PAYLOAD_SIZE,
    MAX_PAYLOAD_MESSAGE,
    LOG_LEVELS,
} from "./constants.js";
import env from "env-var";

import type {
    Level,
    StringArray,
    EmfOutput,
    PayloadToPrintResponse,
    MetricMeta,
    LogEntry,
    JSONObject,
    JSONValue,
    ErrorLogAttributes,
} from "./types";

interface LoggerOptions {
    correlationId?: string | null;
    additionalSensitiveAttributes?: StringArray;
    overrideSensitiveAttributes?: StringArray;
}

const LOG_EVENT = env.get("SG_LOGGER_LOG_EVENT").default("true").asBool();
const MASK_SECRETS = env.get("SG_LOGGER_MASK").default("true").asBool();
const MAX_SIZE = env.get("SG_LOGGER_MAX_SIZE").default(MAX_PAYLOAD_SIZE).asInt();
const COMPRESS_SIZE = env.get("SG_LOGGER_COMPRESS_SIZE").default(COMPRESS_PAYLOAD_SIZE).asInt();
const NO_COMPRESS = env.get("SG_LOGGER_NO_COMPRESS").default("false").asBool();
const NO_SKIP = env.get("SG_LOGGER_NO_SKIP").default("false").asBool();
const LOG_TS = env.get("SG_LOGGER_LOG_TS").default("false").asBool();
const LOG_LEVEL = env
    .get("SG_LOGGER_LOG_LEVEL")
    .default(env.get("AWS_LAMBDA_LOG_LEVEL").default("warn").asString().toLowerCase())
    .asEnum<Level>(LOG_LEVELS);

class Logger {
    static METRIC_UNITS = MetricUnitList;
    private static readonly DEFAULT_SENSITIVE_ATTRIBUTES: StringArray = [
        "password",
        "userid",
        "token",
        "secret",
        "key",
        "x-api-key",
        "bearer",
        "authorization",
    ];

    private serviceName: string;
    private correlationId: string;
    private resetCorrelationId: boolean;
    private applicationName: string;
    private persistentContext: JSONObject;
    private console: Console;
    private defaultSensitiveAttributes: StringArray;

    constructor(serviceName: string, applicationName: string, options: LoggerOptions = {}) {
        this.serviceName = serviceName;
        this.correlationId = options.correlationId ? options.correlationId : randomUUID();
        this.resetCorrelationId = options.correlationId ? false : true;
        this.applicationName = applicationName;
        this.persistentContext = {};
        this.console =
            env.get("AWS_LAMBDA_LOG_FORMAT").asString() === "JSON"
                ? new Console((process.stdout, process.stderr))
                : console;

        // Initialize default sensitive attributes
        this.defaultSensitiveAttributes = [...Logger.DEFAULT_SENSITIVE_ATTRIBUTES];

        // Handle custom sensitive attributes
        if (options.overrideSensitiveAttributes) {
            this.defaultSensitiveAttributes = options.overrideSensitiveAttributes;
        } else if (options.additionalSensitiveAttributes) {
            this.defaultSensitiveAttributes = [...this.defaultSensitiveAttributes, ...options.additionalSensitiveAttributes];
        }
    }

    getLogLevel(level: Level): number {
        const logLevels: Record<Level, number> = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };

        return logLevels[level] ?? -1;
    }

    log(
        level: Level,
        message: string = "",
        payload: JSONValue | Error = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ): void {
        if (this.getLogLevel(level) < this.getLogLevel(LOG_LEVEL)) {
            return;
        }

        try {
            const arrayToLowerCase = (array: StringArray): StringArray => {
                if (Array.isArray(array)) {
                    return array.filter((el) => typeof el === "string").map((el) => el.toLowerCase());
                }
                return [];
            };

            // Merge default sensitive attributes with custom ones
            const attributesToMask = new Set([...this.defaultSensitiveAttributes, ...arrayToLowerCase(sensitiveAttributes)]);

            // Mask sensitive attributes, remove null
            const maskSensitiveAttributes = (key: string, value: JSONValue): JSONValue | string | undefined => {
                if (value === null) {
                    return undefined;
                }
                if (typeof value === "object" && isEmptyObject(value)) {
                    return undefined;
                }
                if (MASK_SECRETS === false) {
                    return value;
                }
                if (this.isJSONString(value)) {
                    return JSON.stringify(JSON.parse(value as string), maskSensitiveAttributes);
                }
                if (attributesToMask.has(key.toLowerCase())) {
                    return "****";
                }
                return value;
            };

            const isEmptyObject = (value: JSONValue): boolean => {
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

            const isEmpty = (obj: JSONValue): boolean => {
                if (typeof obj !== "object") {
                    return false;
                }
                for (const prop in obj) {
                    if (Object.hasOwn(obj, prop)) {
                        return false;
                    }
                }
                return true;
            };

            const getPayloadToPrint = (payload: JSONValue | Error | undefined): PayloadToPrintResponse => {
                try {
                    if (payload instanceof Error) {
                        return { gzip: false, error: formatError(payload) };
                    }
                    if (level === "warn" && message === MAX_PAYLOAD_MESSAGE) {
                        return { gzip: false, payload };
                    }
                    const stringifiedPayload = JSON.stringify(payload, maskSensitiveAttributes);
                    if (stringifiedPayload?.length > MAX_SIZE && !NO_SKIP) {
                        this.warn(MAX_PAYLOAD_MESSAGE, { size: stringifiedPayload.length, MAX_SIZE });
                        return { gzip: false, payload: undefined };
                    }
                    if (stringifiedPayload?.length > COMPRESS_SIZE && !NO_COMPRESS) {
                        return { gzip: true, payload: gzipSync(stringifiedPayload).toString("base64") };
                    }
                    return { gzip: false, payload };
                } catch {
                    return {};
                }
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

            const getCodeLocation = (stack?: string): string => {
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

            const contextToLog: JSONObject = {
                ...this.persistentContext,
                ...(typeof context === "object" && context !== null && Object.keys(context).length ? context : {}),
            };
            if (payloadToPrint.gzip === true) {
                contextToLog["gzip"] = true;
            }

            const logEntry: LogEntry = {
                timestamp: getTimestamp(),
                level: level.toUpperCase(),
                service: this.serviceName,
                correlationId: this.correlationId,
                message,
                context: isEmptyObject(contextToLog) ? undefined : contextToLog,
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
        } catch { }
    }

    info(
        message: string = "",
        payload: JSONValue = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ): void {
        this.log("info", message, payload, context, sensitiveAttributes);
    }

    debug(
        message: string = "",
        payload: JSONValue = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ): void {
        this.log("debug", message, payload, context, sensitiveAttributes);
    }

    warn(
        message: string = "",
        payload: JSONValue = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ): void {
        this.log("warn", message, payload, context, sensitiveAttributes);
    }

    error(
        message: string = "",
        payload: JSONValue | Error = {},
        context: JSONObject = {},
        sensitiveAttributes: StringArray = []
    ): void {
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
            this.resetCorrelationId = true;
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
        if (this.resetCorrelationId) {
            this.correlationId = randomUUID();
        }
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

    isJSONString(str: unknown): str is string {
        try {
            if (typeof str !== "string") return false; // Not a string at all
            JSON.parse(str);
            return true;
        } catch {
            return false; // Parsing failed, so it's not JSON
        }
    }

    resetSensitiveAttributes(): void {
        this.defaultSensitiveAttributes = [...Logger.DEFAULT_SENSITIVE_ATTRIBUTES];
        // Clear any custom sensitive attributes that were added through log methods
        this.log("info", "Sensitive attributes have been reset to defaults", {}, {}, []);
    }
}

export { Logger };
