# Logger

Logger is an opinionated logger utility for Javascript. Its aim is to simplify log analysis with [CloudWatchLogs Insight](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html).

## Key features

- Small footprint
- Enforces structured and consistent logs across all your Lambda functions
- Automatically masks sensible values
- Automatically compresses large payloads (>25Kb)
- Automatically ignores very large payloads (>60Kb)
- Supports CloudwatchLogs text and JSON format

### Environment variables

- `SG_LOGGER_LOG_EVENT`: Log event, _default: true_
- `SG_LOGGER_SKIP_MASK`: Skip masking of sensible values, _default: false_
- `SG_LOGGER_MAX_SIZE`: Skip logging payload bigger than size (in bytes), _default: 60000_
- `SG_LOGGER_NO_SKIP`: Don't skip payloads bigger than _SG_LOGGER_MAX_SIZE_, _default: false_
- `SG_LOGGER_COMPRESS_SIZE`: Compress (gzip) payload bigger than size (in bytes), _default: 25000_
- `SG_LOGGER_NO_COMPRESS`: Don't compress logs bigger than `SG_LOGGER_COMPRESS_SIZE`, _default: false_
- `SG_LOGGER_LOG_TS`: Add timestamp (in ms) to the output object (useful when not using Cloudwatch Logs), _default: false_
- `SG_LOGGER_LOG_LEVEL`: The minimum level to log. One of `debug`, `info`, `warn` or `error`, _default: same as `AWS_LAMBDA_LOG_LEVEL` or `warn`_

## Log schema

```json
{
    "timestamp": 1729066777619,
    "service": "myService",
    "level": "INFO",
    "correlationId": "092f5cf0-d1c8-4a71-a8a0-3c86aeb1c212",
    "message": "my message",
    "context": {
        "handlerNamespace": "multiply",
        "factor": 2
    },
    "payload": {
        "key1": "value1",
        "key2": 3,
        "key3": {
            "key31": "value31"
        }
    }
}
```

### Error schema

#### Without an Error object

`logger.error('global error', {key1: 'value1'})`

```json
{
    "timestamp": 1729066777619,
    "service": "myService",
    "level": "ERROR",
    "correlationId": "3bfd61c4-8934-4ae9-b646-d57144094986",
    "message": "invalid factor",
    "context": {
        "handlerNamespace": "multiply",
        "factor": 2
    },
    "payload": {
        "key1": "value1"
    }
}
```

#### With an Error object

```javascript
logger.error(
    "global error",
    new RangeError("invalid factor", {
        cause: {
            factor: event.factor,
            limit: 10,
            reason: "too big",
        },
    })
);
```

```json
{
    "timestamp": 1729066777619,
    "service": "myService",
    "level": "ERROR",
    "correlationId": "3bfd61c4-8934-4ae9-b646-d57144094986",
    "message": "global error",
    "context": {
        "handlerNamespace": "multiply",
        "factor": 2
    },
    "error": {
        "name": "RangeError",
        "location": "/path/to/file.js:341",
        "message": "invalid factor",
        "stack": "RangeError: invalid factor\n    at main (/path/to/file.js:341:15)\n    at /path/to/file2.js:953:30\n    at new Promise (<anonymous>)\n    at AwsInvokeLocal.invokeLocalNodeJs (/path/to/file3.js:906:12)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
        "cause": {
            "factor": 12,
            "limit": 10,
            "reason": "too big"
        }
    }
}
```

## Installation

```bash
npm i --save @serverless-guru/logger
```

## Usage

The `Logger` instance can be re-used across modules, allowing to keep globally defined context keys.

**helpers/logger.js**

```javascript
const { Logger } = require("@serverless-guru/logger");
const logger = new Logger("myService", "myFirstApplication");
const metricUnits = Logger.METRIC_UNITS;
module.exports = { logger, metricUnits };
```

**helpers/math.js**

```javascript
const { logger } = require("./logger");

export const multiply = async (n, factor) => {
    const sleepMs = Math.floor(Math.random() * 1000 * factor);

    await delay(sleepMs);

    const result = n * factor;

    logger.debug("Multiply", { n, duration: sleepMs, result });

    return result;
};

const delay = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
```

**handlers/multiply.js**

```javascript
const { logger, metricUnits } = require("../helpers/logger.js");
const LOG_FORMAT = process.env.AWS_LAMBDA_LOG_FORMAT || "Text";

const main = async (event, context) => {
    try {
        logger.setCorrelationId(context.awsRequestId);
        logger.addContextKey({
            handlerNamespace: "multiply",
            logFormat: LOG_FORMAT,
        });
        logger.logInputEvent({ event });

        if (event.factor) {
            logger.addContextKey({ factor: event.factor });
            if (event.factor > 10) {
                const cause = { factor: event.factor, limit: 10, reason: "too big" };
                logger.error("invalid factor", cause);
                throw new RangeError("invalid factor", { cause });
            }
        }

        const start = new Date().getTime();
        const promises = [1, 2, 3, 4, 5].map((n) => multiply(n, event.factor || 1));
        const result = await Promise.all(promises);
        const end = new Date().getTime();

        logger.info("Result", { result }, {}, ["factor"]);

        logger.metric("multiply", {
            name: "Duration",
            unit: metricUnits.Milliseconds,
            value: end - start,
            dimensions: [["LOG_FORMAT", LOG_FORMAT]],
        });
    } catch (error) {
        logger.error("global error", error);
    } finally {
        logger.clearLogContext();
    }
};

module.exports = { main };
```

## The importance of CorrelationId

Why define a _correlationId_ when we already have a _requestId_ provided by AWS?.

The _requestId_ is unique inside a single Lambda invocation. A correlationId can be passed to other services and allows to extract logs from multiple services invoked during a specific activity.

Let's consider the case of a Lambda behind an API Gateway. This function sends a message to SQS, which is then processed by another Lambda function invoking a remote API.

- The Web client generates a correlationId and passes it in the payload to API Gateway (API Gateway Logs are set to log Payloads in JSON)
- The first Lambda uses the `setCorrelationId` method to assign the `correlationId` from the payload to all log outputs
- The `correlationId` is part of the payload sent to SQS
- The second Lambda uses the `setCorrelationId` method to assign the `correlationId` from the SQS event to all log outputs
- The `correlationId` is added to the invocation payload of the remote API.

Using CloudWatchLogs insight, it is now possible to query simultaneously both Lambda LogGroups, API Gateway LogGroup with a single simple query:

```
fields @timestamp, @message
| filter correlationId="092f5cf0-d1c8-4a71-a8a0-3c86aeb1c212"
| limit 200
```

To get the logs of all events for the specific `correlationId` across multiple services.

## Class methods

### Constructor

```javascript
const logger = new Logger(serviceName, applicationName, correlationId);
```

- **serviceName** [string, mandatory]: Added to each log output
- **applicationName** [string, mandatory]: Defines the Namespace for metrics
- **correlationId** [string, optional]: A new UUIDv4 is generated when not defined. Added to each log output.

### setCorrelationId

Set a correlationId used across all log statements. Useful when the _correlationId_ is received as payload to the Lambda function.

```javascript
logger.setCorrelationId(correlationId);
```

- **correlationId** [string, mandatory]

### getCorrelationId

Retrieves the current _correlationId_. Useful when the correlationId needs to be passed to API calls or other service integrations.

```javascript
const correlationId = logger.getCorrelationId();
```

- **correlationId** [string, mandatory]

### logInputEvent

Logs the object passed as argument when the environment variable _LOG_EVENT_ is set to _"true"_. Generally used to conditionally log the incoming event, but it can be used for any other payload too.

The _message_ key will always be `Input Event`.

```javascript
logger.logInputEvent(payload);
```

- **payload** [object]

#### Example

To conditionally log the incoming event, the Lambda context and the environment variables:

```javascript
logger.logInputEvent({ event, context, env: process.env });
```

### addContextKey

Add keys to the context object. Keys added to the context are available in all log outputs under the top level `context` key.
useful to automatically add values to all future logs.

```javascript
logger.addContextKey(contextObject);
```

- **contextObject**: [object]

### clearLogContext

Clears the all context keys. This needs to be invoked at the end of each Lambda invocation to avoid re-using context keys across subsequent invocation.

```javascript
logger.clearLogContext();
```

### log

Prints a log message.

```javascript
logger.log(level, message, payload, context, sensitiveAttributes);
```

- **level** [string, mandatory]: one of `info`, `debug`, `warn`, `error`
- **message** [string, mandatory]: Assigned to the output `message`. It is good practice to keep it concise and describe the activity. Re-use the same message across multiple logs, identify the individual activities using context or payload values.
- **payload** [string, object]: The payload to log
- **context** [object]: Keys to add to the context of this log output
- **sensitiveAttributes** [array of string]: Additional attributes to mask in this log output

#### Shorthand

- logger.info(message, payload, context, sensitiveAttributes)
- logger.debug(message, payload, context, sensitiveAttributes)
- logger.warn(message, payload, context, sensitiveAttributes)
- logger.error(message, payload, context, sensitiveAttributes)

#### Default masked attributes

Any key, be it in the `payload` or the `context`, having one of this values will be masked in the output:

- password
- userid
- token
- secret
- key
- x-api-key
- bearer
- authorization

Masking can be disabled, by setting the environment variable `LOG_MASK="false"`.

### Max log level

When `SG_LOGGER_LOG_LEVEL` is set, only log levels equal or greater than the specified value will be logged. Log levels are in the following order of importance.

`debug` < `info` < `warn` < `error`

> Note
>
> When use with AWS Lambda, and when `AWS_LAMBDA_LOG_LEVEL` is set to a stricter level than `SG_LOGGER_LOG_LEVEL`, ALC will drop logs emitted by the logger that don't match `AWS_LAMBDA_LOG_LEVEL`.

### metric

This generates a log output in [EMF](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) format, creating a metric in [Cloudwatch Metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/working_with_metrics.html).
The metrics will be available under the namespace defined by `this.applicationName`.

```javascript
logger.metric(activity: string, meta: MetricMeta)
```

- **activity** [string, mandatory]: The default dimension
- **meta** [object]
    - **name** [string]: The name of the metric
    - **value** [number]: The value of the metric
    - **unit** [string]: The unit of the metric (see Logger.METRIC_UNITS)
    - **dimensions** [Array of String pairs]: Additional dimensions for the metric. `[[name1, value1], [name2, value2]]`

**Note**: To be able to use EMF, your log group needs to be sert to _standard_ (default) and not _infrequent access_.

## CloudWatchLogs logFormat

Lambda allows to use CloudWatchLogs Structured format (recommended), which not only stores the logs in JSON, but also allows to set the log level directly on the log group.

### Configure with [Serverless Framework](https://www.serverless.com)

#### Serverless v3

Serverless V3 doesn't allow to set the format directly from the function. You need to configure it via Cloudformation resources by extending the definition of the function generated by the framework.

The logical key for a function in Cloudformation is the logical key of the function with the suffix `LambaFunction`.

```yaml
service: myService
provider:
    name: aws
    runtime: nodejs20.x
    architecture: "arm64"
functions:
    Multiply:
        handler: src/handlers/multiply.handler
        name: multiply
        environment:
            LOG_EVENT: "true"
resources:
    resources:
        MultiplyLambdaFunction:
            Type: AWS::Lambda::Function
            Properties:
                LoggingConfig:
                    LogFormat: JSON
                    ApplicationLogLevel: WARN
                    SystemLogLevel: INFO
```

#### Serverless v4

With Serverless v4, the logFormat can be directly defined in the framework definition, either globally under `provider` or per function.

```yaml
service: myService
provider:
    name: aws
    runtime: nodejs20.x
    architecture: "arm64"
    logs:
        lambda:
            logFormat: JSON
            applicationLogLevel: WARN
            systemLogLevel: INFO
functions:
    Multiply:
        handler: src/handlers/multiply.handler
        name: multiply
        environment:
            LOG_EVENT: "true"
        logs:
            logFormat: JSON
            applicationLogLevel: WARN
            systemLogLevel: INFO
```
