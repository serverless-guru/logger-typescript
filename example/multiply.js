const { logger, metricUnits } = require("./services/logger.js");
const { multiply } = require("./helpers/maths.js");
const MAX_FACTOR = 10;
/**
 *
 * @typedef {Object} event
 * @property {number} factor -- multiplication factor (optional)
 * @property {string} correlationId -- An existing correlationId (optional)
 * @param {*} context -- Lambda context
 */
const main = async (event, context) => {
    try {
        /**
         * Set the correlation or create a new one
         */
        logger.setCorrelationId(event.correlationId);

        /**
         * Log event, context and environment variables
         */
        logger.logInputEvent({ event, context, env: process.env });

        /**
         * Set the handler name on all log outputs
         */
        logger.addContextKey({
            handlerNamespace: "multiply",
        });

        /**
         * Add the factor to all future log outputs
         */
        if (event.factor) {
            logger.addContextKey({ factor: event.factor });
            if (event.factor > MAX_FACTOR) {
                const cause = { factor: event.factor, limit: 10, reason: "too big" };
                /**
                 * Log the error with a payload
                 */
                logger.error("invalid factor", cause);
                throw new RangeError("invalid factor", { cause });
            }
        }

        const start = new Date().getTime();
        const promises = [1, 2, 3, 4, 5].map((n) => multiply(n, event.factor || 1));

        const result = await Promise.all(promises);
        const end = new Date().getTime();

        /**
         * Log with additional attribute to mask
         */
        logger.warn("result", { result }, {}, ["factor"]);

        /**
         * Create a metric for the duration per factor
         */
        logger.metric("multiply", {
            name: "Duration",
            unit: metricUnits.Milliseconds,
            value: end - start,
            dimensions: [["factor", (event.factor || "1").toString()]],
        });
    } catch (error) {
        /**
         * Log the error with an error object
         */

        logger.error("global error", error);
    } finally {
        logger.clearLogContext();
    }
};

module.exports = { main };
