const { Logger } = require("../../lib/cjs/index");
const logger = new Logger("myService", "myApp");
const metricUnits = Logger.METRIC_UNITS;
module.exports = { logger, metricUnits };
