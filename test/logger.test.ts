/* eslint-disable @typescript-eslint/no-require-imports */
import { Logger } from "../src/index";
import { describe, test, expect } from "@jest/globals";
import { gunzipSync } from "node:zlib";

describe("Log Outputs", () => {
    const originalConsole = {
        log: console.log,
        info: console.info,
        debug: console.debug,
        warn: console.warn,
        error: console.error,
    };
    const logger = new Logger("testService", "testApp", "testId");
    const originalEnv = process.env;
    const lipsum =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam vitae aliquet arcu. Nullam fermentum sem vel tincidunt tempor. Suspendisse mattis felis et dolor interdum laoreet. Proin ac mi sit cras.";

    afterEach(() => {
        logger.clearLogContext();
        process.env = originalEnv;
    });
    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            SG_LOGGER_LOG_LEVEL: "debug",
        };

        console.log = jest.fn();
        console.info = jest.fn();
        console.debug = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });
    afterAll(() => {
        console.log = originalConsole.log;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    });

    test("Message only", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Message");
        logger.debug("Message");
        logger.warn("Message");
        logger.error("Message");

        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.debug).toHaveBeenCalledWith(
            '{"level":"DEBUG","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.warn).toHaveBeenCalledWith(
            '{"level":"WARN","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.error).toHaveBeenCalledWith(
            '{"level":"ERROR","service":"testService","correlationId":"testId","message":"Message"}'
        );
    });

    test("String Payload", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Message", "stringPayload");
        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Message","payload":"stringPayload"}'
        );
    });

    test("Error", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        const error = new RangeError("too big", { cause: { i: 10, limit: 1 } });
        logger.error("Message", error);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"level":"ERROR"'));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"error":'));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"name":"RangeError"'));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"message":"too big"'));
        expect(console.error).toHaveBeenCalledWith(expect.not.stringContaining('"payload":'));
    });

    test("Log Input Event", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.logInputEvent({ jest: "jest" });
        expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"payload":{"jest":"jest"'));
    });

    test("Set and Get correlationId", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp");
        const correlationId = logger.getCorrelationId();
        expect(correlationId).toMatch(/\w+/);
        logger.setCorrelationId("testId");
        const newCorrelationId = logger.getCorrelationId();
        expect(newCorrelationId).toBe("testId");
    });

    test("Masking", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info(
            "Simple",
            { a: 1, b: "string", c: { c1: 1, c2: "string", cz: "private", userid: "private" } },
            { d: 1, e: "string", f: { f1: 1, f2: "string", fz: "private", userid: "private" } },
            ["cz", "fz"]
        );
        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Simple","context":{"d":1,"e":"string","f":{"f1":1,"f2":"string","fz":"****","userid":"****"}},"payload":{"a":1,"b":"string","c":{"c1":1,"c2":"string","cz":"****","userid":"****"}}}'
        );
    });

    test("Global Context", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.addContextKey({ handler: "Jest" });
        logger.info("Simple");
        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Simple","context":{"handler":"Jest"}}'
        );
        logger.addContextKey({ step: 2 });
        logger.info("Simple");
        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Simple","context":{"handler":"Jest","step":2}}'
        );
        logger.clearLogContext();
        logger.info("Simple");
        expect(console.info).toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Simple"}'
        );
    });

    test("Global Context Reset", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp");
        logger.clearLogContext();
        logger.info("Simple");
        expect(console.info).toHaveBeenCalledWith(
            expect.stringMatching(
                /{"level":"INFO","service":"testService","correlationId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}","message":"Simple"}/
            )
        );
    });

    test("Metric", () => {
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.addContextKey({ handler: "Jest" });
        logger.metric("testRun", { name: "" });
        expect(console.log).not.toHaveBeenCalled();

        const metricData = {
            name: "testCase",
            unit: Logger.METRIC_UNITS.Count,
            dimensions: [
                ["A1", "B1"],
                ["A2", "B2"],
            ],
            value: 1,
        };

        logger.metric("testRun", metricData);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"message":"[Embedded Metric] testRun"'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"Namespace":"testApp"'));
    });

    test("Skip Log Input Event", () => {
        process.env.SG_LOGGER_LOG_EVENT = "false";
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");

        logger.logInputEvent({ jest: "jest" });
        expect(console.info).not.toHaveBeenCalled();
    });

    test("Add Timestamp", () => {
        process.env.SG_LOGGER_LOG_TS = "true";

        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Simple");
        expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/"timestamp":\d+,/));
    });

    test("Skip Masking", () => {
        process.env.SG_LOGGER_MASK = "false";

        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Simple", { userId: "Jest" });
        expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"userId":"Jest"'));
    });

    test("Max Size", () => {
        process.env.SG_LOGGER_MAX_SIZE = "100";

        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Long", {
            lipsum,
        });
        expect(console.info).toHaveBeenCalledWith(expect.not.stringContaining('"payload"'));
        expect(console.warn).toHaveBeenCalledWith(
            '{"level":"WARN","service":"testService","correlationId":"testId","message":"Log too large","payload":{"size":213,"MAX_SIZE":100}}'
        );
    });

    test("No skip", () => {
        process.env.SG_LOGGER_MAX_SIZE = "100";
        process.env.SG_LOGGER_NO_SKIP = "true";

        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Long", {
            lipsum,
        });
        expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`"payload":{"lipsum":"${lipsum}"}`));
        expect(console.warn).not.toHaveBeenCalled();
    });

    test("Compress Size", () => {
        process.env.SG_LOGGER_COMPRESS_SIZE = "100";

        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Long", {
            lipsum,
        });
        const logMessage = (console.info as jest.Mock).mock.calls[0][0];
        expect(JSON.parse(logMessage)).toMatchObject({ context: { gzip: true } });
        const uncompressedPayload = gunzipSync(Buffer.from(JSON.parse(logMessage).payload, "base64")).toString();
        const uncompressedObject = JSON.parse(uncompressedPayload);
        expect(uncompressedObject).toEqual({ lipsum });
    });

    test("Log level", () => {
        process.env.SG_LOGGER_LOG_LEVEL = "warn";
        const { Logger } = require("../src/index");
        const logger = new Logger("testService", "testApp", "testId");
        logger.info("Message");
        logger.debug("Message");
        logger.warn("Message");
        logger.error("Message");

        expect(console.info).not.toHaveBeenCalledWith(
            '{"level":"INFO","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.debug).not.toHaveBeenCalledWith(
            '{"level":"DEBUG","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.warn).toHaveBeenCalledWith(
            '{"level":"WARN","service":"testService","correlationId":"testId","message":"Message"}'
        );
        expect(console.error).toHaveBeenCalledWith(
            '{"level":"ERROR","service":"testService","correlationId":"testId","message":"Message"}'
        );
    });
});
