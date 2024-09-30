const { logger, metricUnits } = require("./services/logger.js");

const main = async (event, context) => {
  try {
    logger.logInputEvent({ event });

    logger.addContextKey({ foo: "bar" });
    if (event.name === "test") {
      logger.addContextKey({ name: "test" });
    }
    const double = [1, 2, 3, 4, 5].map((id) => times2(id));
    logger.info("Hello World", double);
    logger.metric("dynamodb-query", {
      name: "Duration",
      unit: metricUnits.Milliseconds,
      value: 156,
      dimensions: [["Table", "my-dynamodb-table"]],
    });
  } finally {
    logger.clearLogContext();
  }
};

const times2 = (i) => {
  logger.info("value", { i });
  return i * 2;
};

module.exports = { main };
main({ name: "test" }, { awsRequestId: "1234" });
