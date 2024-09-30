const crypto = require("crypto");
const zlib = require("zlib");
const LOG_EVENT = process.env.LOG_EVENT === "true";

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
  }

  log(
    level,
    message = "",
    context = {},
    payload = {},
    sensitiveAttributes = []
  ) {
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
    const attributesToMask = new Set([
      ...defaultSensitiveAttributes,
      ...sensitiveAttributes,
    ]);

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
    if (stringifiedPayload.length > 25000) {
      processedPayload = zlib.gzipSync(stringifiedPayload).toString("base64");

      if (processedPayload.length > 60000)
        this.warn(
          "Payload too large. Please consider logging a smaller payload."
        );
    }
    const logEntry = {
      timestamp: new Date().toISOString(), // to be removed
      serviceName: this.serviceName,
      correlationId: this.correlationId,
      logMessage: message,
      context: {
        ...this.persistentContext,
        ...(typeof context === "object" && Object.keys(context).length
          ? context
          : {}),
      },
      payload:
        typeof payload === "object" &&
        (Object.keys(processedPayload).length || processedPayload.length > 0)
          ? processedPayload
          : null,
    };

    // Remove null values for cleanliness
    Object.keys(logEntry).forEach(
      (key) => logEntry[key] === null && delete logEntry[key]
    );

    switch (level) {
      case "info":
        console.info(JSON.stringify(logEntry, null, 2));
        break;
      case "debug":
        console.debug(JSON.stringify(logEntry, null, 2));
        break;
      case "warn":
        console.warn(JSON.stringify(logEntry, null, 2));
        break;
      case "error":
        console.error(JSON.stringify(logEntry, null, 2));
        break;
      default:
        break;
    }
  }

  info(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
    this.log("info", message, context, payload, sensitiveAttributes);
  }

  debug(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
    this.log("debug", message, context, payload, sensitiveAttributes);
  }

  warn(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
    this.log("warn", message, context, payload, sensitiveAttributes);
  }

  error(message = "", payload = {}, context = {}, sensitiveAttributes = []) {
    this.log("error", message, context, payload, sensitiveAttributes);
  }

  logInputEvent(event) {
    if (LOG_EVENT) {
      this.info("Input Event", {}, event);
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
    const unit =
      meta.name === "Duration"
        ? Logger.METRIC_UNITS.Milliseconds
        : meta.unit || "Count";
    const dimensions = meta.dimensions || [];
    const emf = {
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
    console.log(JSON.stringify(emf, null, 2));
  }
}

module.exports = { Logger };
