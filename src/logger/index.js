const crypto = require("node:crypto");
const zlib = require("node:zlib");
const console = require("node:console");

const LOG_EVENT = process.env.LOG_EVENT === "true";
const MAX_PAYLOAD_SIZE = 60000;
const COMPRESS_PAYLOAD_SIZE = 25000;

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
        this.correlationId = correlationId ? correlationId : crypto.randomUUID();
        this.applicationName = applicationName;
        this.persistentContext = {};
        this.console =
            process.env.AWS_LAMBDA_LOG_FORMAT === "JSON"
                ? new console.Console((process.stdout, process.stderr))
                : console;
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
            "Bearer",
            "Authorization",
        ];

        // Merge default sensitive attributes with custom ones
        const attributesToMask = new Set([...defaultSensitiveAttributes, ...sensitiveAttributes]);

        // Mask sensitive attributes
        const maskSensitiveAttributes = (obj, attributes) => {
            for (const key in obj) {
                if (attributes.has(key)) {
                    obj[key] = "****";
                } else if (typeof obj[key] === "object" && obj[key] !== null) {
                    maskSensitiveAttributes(obj[key], attributes);
                }
            }
        };
        let processedPayload = payload;
        maskSensitiveAttributes(processedPayload, attributesToMask);
        const stringifiedPayload = JSON.stringify(payload);

        // compress if payload is large
        if (stringifiedPayload.length > COMPRESS_PAYLOAD_SIZE) {
            processedPayload = zlib.gzipSync(stringifiedPayload).toString("base64");

            if (processedPayload.length > MAX_PAYLOAD_SIZE)
                this.warn("Payload too large. Please consider logging a smaller payload.");
        }
        const logEntry = {
            timestamp: new Date().toISOString(), // to be removed
            serviceName: this.serviceName,
            correlationId: this.correlationId,
            logMessage: message,
            context: {
                ...this.persistentContext,
                ...(typeof context === "object" && Object.keys(context).length ? context : {}),
            },
            payload:
                typeof payload === "object" && (Object.keys(processedPayload).length || processedPayload.length > 0)
                    ? processedPayload
                    : null,
        };

        // Remove null values for cleanliness
        Object.keys(logEntry).forEach(
            (key) => (logEntry[key] === null || logEntry[key] === undefined) && delete logEntry[key]
        );

        switch (level) {
            case "info":
                this.console.info(JSON.stringify(logEntry));
                break;
            case "debug":
                this.console.debug(JSON.stringify(logEntry));
                break;
            case "warn":
                this.console.warn(JSON.stringify(logEntry));
                break;
            case "error":
                this.console.error(JSON.stringify(logEntry));
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

    addContextKey(contextObject) {
        if (typeof contextObject === "object" || contextObject !== null) {
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
            logMessage: `[Embedded Metric] ${activity}`,
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
