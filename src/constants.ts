enum MetricUnitList {
    Seconds = "Seconds",
    Microseconds = "Microseconds",
    Milliseconds = "Milliseconds",
    Bytes = "Bytes",
    Kilobytes = "Kilobytes",
    Megabytes = "Megabytes",
    Gigabytes = "Gigabytes",
    Terabytes = "Terabytes",
    Bits = "Bits",
    Kilobits = "Kilobits",
    Megabits = "Megabits",
    Gigabits = "Gigabits",
    Terabits = "Terabits",
    Percent = "Percent",
    Count = "Count",
    BytesPerSecond = "Bytes/Second",
    KilobytesPerSecond = "Kilobytes/Second",
    MegabytesPerSecond = "Megabytes/Second",
    GigabytesPerSecond = "Gigabytes/Second",
    TerabytesPerSecond = "Terabytes/Second",
    BitsPerSecond = "Bits/Second",
    KilobitsPerSecond = "Kilobits/Second",
    MegabitsPerSecond = "Megabits/Second",
    GigabitsPerSecond = "Gigabits/Second",
    TerabitsPerSecond = "Terabits/Second",
    CountPerSecond = "Count/Second",
    NoUnit = "None",
}

const MAX_PAYLOAD_SIZE = 60000;
const COMPRESS_PAYLOAD_SIZE = 25000;
const MAX_PAYLOAD_MESSAGE = "Log too large";

export { MetricUnitList, MAX_PAYLOAD_SIZE, COMPRESS_PAYLOAD_SIZE, MAX_PAYLOAD_MESSAGE };
