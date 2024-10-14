const randomUUID = require("node:crypto").randomUUID;
const gzipSync = require("node:zlib").gzipSync;
const Console = require("node:console").Console;

const LOG_EVENT = process.env.SG_LOGGER_LOG_EVENT?.toLowerCase() === "true";
const SKIP_MASK = process.env.SG_LOGGER_MASK?.toLowerCase() === "false";
const MAX_SIZE = parseInt(process.env.SG_LOGGER_MAX_SIZE || "60000") || 60000;
const COMPRESS_SIZE = parseInt(process.env.SG_LOGGER_COMPRESS_SIZE || "25000") || 25000;
const NO_COMPRESS = process.env.SG_LOGGER_NO_COMPRESS?.toLowerCase == "true";
const NO_SKIP = process.env.SG_LOGGER_NO_SKIP?.toLowerCase == "true";
const MAX_PAYLOAD_MESSAGE = "Log too large";

class Logger {
    static METRIC_UNITS = {
        Seconds: "Seconds",
        Microseconds: "Microseconds",
        Milliseconds: "Milliseconds",
        Bytes: "Bytes",
        Kilobytes: "Kilobytes",
        Megabytes: "Megabytes",
        Gigabytes: "Gigabytes",
        Terabytes: "Terabytes",
        Bits: "Bits",
        Kilobits: "Kilobits",
        Megabits: "Megabits",
        Gigabits: "Gigabits",
        Terabits: "Terabits",
        Percent: "Percent",
        Count: "Count",
        BytesPerSecond: "Bytes/Second",
        KilobytesPerSecond: "Kilobytes/Second",
        MegabytesPerSecond: "Megabytes/Second",
        GigabytesPerSecond: "Gigabytes/Second",
        TerabytesPerSecond: "Terabytes/Second",
        BitsPerSecond: "Bits/Second",
        KilobitsPerSecond: "Kilobits/Second",
        MegabitsPerSecond: "Megabits/Second",
        GigabitsPerSecond: "Gigabits/Second",
        TerabitsPerSecond: "Terabits/Second",
        CountPerSecond: "Count/Second",
    };

    constructor(serviceName, applicationName, correlationId = null) {
        this.serviceName = serviceName;
        this.correlationId = correlationId ? correlationId : randomUUID();
        this.applicationName = applicationName;
        this.persistentContext = {};
        this.console =
            process.env.AWS_LAMBDA_LOG_FORMAT === "JSON" ? new Console((process.stdout, process.stderr)) : console;
    }

    log(level, message = "", payload = {}, context = {}, sensitiveAttributes = []) {
        // Default sensitive attributes
        const defaultSensitiveAttributes = [
            "password",
            "userid",
            "token",
            "secret",
            "key",
            "x-api-key",
            "bearer",
            "authorization",
        ];

        const arrayToLowerCase = (array) => {
            if (Array.isArray(array)) {
                return array
                    .map((el) => {
                        if (typeof el === "string") {
                            return el.toLowerCase();
                        }
                        return undefined;
                    })
                    .filter((el) => el);
            }
            return [];
        };

        // Merge default sensitive attributes with custom ones
        const attributesToMask = new Set([...defaultSensitiveAttributes, ...arrayToLowerCase(sensitiveAttributes)]);

        // Mask sensitive attributes, remove null
        const maskSensitiveAttributes = (key, value) => {
            if (value === null) {
                return undefined;
            }
            if (SKIP_MASK) {
                return value;
            }
            if (attributesToMask.has(key.toLowerCase())) {
                return "****";
            }
            return value;
        };

        const getPayloadToPrint = (payload) => {
            if (level === "warn" && message === MAX_PAYLOAD_MESSAGE) {
                return {gzip: false, payload};
            }
            const stringifiedPayload = JSON.stringify(payload, maskSensitiveAttributes);
            if (stringifiedPayload.length > MAX_SIZE && !NO_SKIP) {
                this.warn(MAX_PAYLOAD_MESSAGE, {size: stringifiedPayload.length, MAX_SIZE: MAX_SIZE});
                return {gzip: false, payload: undefined};
            }
            if (stringifiedPayload.length > COMPRESS_SIZE && !NO_COMPRESS) {
                return {gzip: true, payload: gzipSync(stringifiedPayload).toString("base64")};
            }
            return {gzip: false, payload};
        };

        const payloadToPrint = getPayloadToPrint(payload);

        const logEntry = {
            service: this.serviceName,
            level: level.toUpperCase(),
            correlationId: this.correlationId,
            message,
            context: {
                ...this.persistentContext,
                ...(typeof context === "object" && context !== null && Object.keys(context).length ? context : {}),
                gzip: payloadToPrint.gzip === true ? true : undefined,
            },
            payload: payloadToPrint.payload,
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

    info(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
        this.log("info", message, payload, context, sensitiveAttributes);
    }

    debug(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
        this.log("debug", message, payload, context, sensitiveAttributes);
    }

    warn(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
        this.log("warn", message, payload, context, sensitiveAttributes);
    }

    error(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
        this.log("error", message, payload, context, sensitiveAttributes);
    }

    logInputEvent(event) {
        if (LOG_EVENT) {
            this.info("Input Event", event, {});
        }
    }

    getCorrelationId() {
        return this.correlationId;
    }

    setCorrelationId(correlationId) {
        if (correlationId) {
            this.correlationId = correlationId;
        }
    }

    addContextKey(contextObject) {
        if (typeof contextObject === "object" && contextObject !== null) {
            this.persistentContext = {
                ...this.persistentContext,
                ...contextObject,
            };
        }
    }

    clearLogContext() {
        this.persistentContext = {};
        this.correlationId = null;
        this.applicationName = null;
        this.serviceName = null;
    }

    metric(activity, meta) {
        if (!meta.name) {
            return;
        }
        const unit = meta.name === "Duration" ? Logger.METRIC_UNITS.Milliseconds : meta.unit || "Count";
        const dimensions = meta.dimensions || [];
        const emf = {
            service: this.serviceName,
            message: `[Embedded Metric] ${activity}`,
            correlationId: this.correlationId,
            [meta.name]: typeof meta.value === "number" ? meta.value : 1,
            ...dimensions.reduce((acc, curr) => {
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

module.exports = {Logger};
