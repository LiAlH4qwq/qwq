import js from "@eslint/js"
import functional from "eslint-plugin-functional"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "result/**", "docs/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx", "test/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      functional,
    },
    rules: {
      "functional/no-let": "error",
      "functional/no-loop-statements": "error",
      "functional/immutable-data": "error",
      "functional/prefer-readonly-type": "error",
      "functional/no-throw-statements": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclaration[kind='var']",
          message: "var is forbidden; use const.",
        },
        {
          selector: "VariableDeclaration[kind='let']",
          message: "let is forbidden; use const.",
        },
        {
          selector: "VariableDeclaration[kind='using']",
          message: "using is forbidden.",
        },
        {
          selector: "VariableDeclaration[kind='await using']",
          message: "await using is forbidden.",
        },
        { selector: "WhileStatement", message: "Loops are forbidden." },
        { selector: "DoWhileStatement", message: "Loops are forbidden." },
        { selector: "ForStatement", message: "Loops are forbidden." },
        { selector: "ForInStatement", message: "Loops are forbidden." },
        { selector: "ForOfStatement", message: "Loops are forbidden." },
        {
          selector: "TryStatement",
          message: "try/catch is forbidden; use Effect.try.",
        },
        {
          selector: "ThrowStatement",
          message: "throw is forbidden; fail with a typed error instead.",
        },
        {
          selector: "AwaitExpression",
          message: "await is forbidden; use Effect.gen + yield*.",
        },
        {
          selector: "FunctionDeclaration[async=true]",
          message: "async functions are forbidden; use Effect.gen / Effect.fn.",
        },
        {
          selector: "FunctionExpression[async=true]",
          message: "async functions are forbidden; use Effect.gen / Effect.fn.",
        },
        {
          selector: "ArrowFunctionExpression[async=true]",
          message: "async functions are forbidden; use Effect.gen / Effect.fn.",
        },
        {
          selector: "CallExpression[callee.property.name='then']",
          message: "Promise.then is forbidden; convert to Effect at the boundary.",
        },
        {
          selector: "CallExpression[callee.property.name='finally']",
          message:
            "Promise.finally is forbidden; convert to Effect at the boundary.",
        },
        {
          selector: "UpdateExpression",
          message: "++/-- are forbidden.",
        },
        {
          selector: "UnaryExpression[operator='delete']",
          message: "delete is forbidden.",
        },
        {
          selector: "CallExpression[callee.property.name='forEach']",
          message: "forEach is forbidden; use map / Effect.all.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/]",
          message: "Array mutation is forbidden.",
        },
        {
          selector: "AssignmentExpression[left.type='MemberExpression']",
          message: "Mutation of object members is forbidden.",
        },
        {
          selector: "ChainExpression",
          message:
            "optional chaining (?.) is forbidden; model absence with Option.",
        },
        {
          selector: "LogicalExpression[operator='??']",
          message:
            "nullish coalescing (??) is forbidden; model fallback with Option / Either.",
        },
        {
          selector: "Identifier[name='undefined']",
          message:
            "`undefined` is forbidden; model absence with Option / Either.",
        },
        {
          selector: "TSNonNullExpression",
          message:
            "non-null assertions (!) are forbidden; decode the value instead.",
        },
      ],
    },
  },
  {
    files: ["**/*.config.ts", "eslint.config.js"],
    rules: {
      "functional/immutable-data": "off",
    },
  },
)
