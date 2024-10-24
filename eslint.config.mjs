import globals from "globals";
import ts from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
export default [
    eslintConfigPrettier,
    {
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false,
            },
            globals: {
                ...globals.node,
            },
        },
        files: ["src/**/*.ts", "test/**/*.ts"],
        plugins: {
            "@typescript-eslint": ts,
        },
        rules: {
            "linebreak-style": ["error", "unix"],

            "no-case-declarations": "off",
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: "interface",
                    format: ["PascalCase"],
                },
                {
                    selector: "function",
                    format: ["camelCase"],
                    leadingUnderscore: "allow",
                },
            ],
            "@typescript-eslint/no-inferrable-types": [
                "warn",
                {
                    ignoreParameters: true,
                },
            ],
            "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
        },
    },
    {
        ignores: ["coverage/**/*", "examples/**/*", "lib/**/*"],
    },
];
