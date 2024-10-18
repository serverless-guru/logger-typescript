const { logger } = require("../services/logger");
const { delay } = require("../services/helper");

const multiply = async (n, factor) => {
    const sleepMs = Math.floor(Math.random() * 1000 * factor);

    await delay(sleepMs);

    const result = n * factor;

    /**
     * Log a single multiplication result with an additional userid value
     */
    logger.debug("Multiply", { n, duration: sleepMs, result, userid: "mySecretUser" });

    return result;
};

module.exports = { multiply };
