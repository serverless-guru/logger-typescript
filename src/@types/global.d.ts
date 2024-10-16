declare namespace NodeJS {
    export interface ProcessEnv {
        SG_LOGGER_LOG_EVENT?: string;
        SG_LOGGER_MASK?: string;
        SG_LOGGER_MAX_SIZE?: string;
        SG_LOGGER_COMPRESS_SIZE?: string;
        SG_LOGGER_NO_COMPRESS?: string;
        SG_LOGGER_NO_SKIP?: string;
        SG_LOGGER_LOG_TS?: string;
    }
}
