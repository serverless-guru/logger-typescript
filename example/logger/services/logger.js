const { Logger } = require("../../index");
const logger = new Logger("helloService", "testApp");
const metricUnits = Logger.METRIC_UNITS;
module.exports = { logger, metricUnits };
