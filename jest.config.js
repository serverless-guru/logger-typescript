/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
    testEnvironment: "node",
    transform: {
        "^.+.tsx?$": ["ts-jest", {}],
    },
    moduleNameMapper: {
        "(.+)\\.js": "$1",
    },
    extensionsToTreatAsEsm: [".ts"],
};
