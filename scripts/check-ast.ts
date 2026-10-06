import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import * as ts from "typescript"

interface Violation {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly rule: string
  readonly snippet: string
}

const roots = ["packages", "test", "scripts"]

const ignoredDirectories = new Set(["vendor"])

const collectTypeScriptFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : collectTypeScriptFiles(full)
    }
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : []
  })

const prohibitedMethods = new Set([
  "forEach",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
])

const prohibitedStatics = new Set([
  "Object.assign",
  "Object.defineProperty",
  "Object.defineProperties",
  "Object.setPrototypeOf",
  "Reflect.set",
  "Reflect.deleteProperty",
  "Reflect.defineProperty",
  "Reflect.setPrototypeOf",
])

const loadProgram = (files: ReadonlyArray<string>): ts.Program => {
  const loaded = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, ".")
  return ts.createProgram(files, parsed.options)
}

const location = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { readonly line: number; readonly column: number } => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  )
  return { line: line + 1, column: character + 1 }
}

const violation = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  rule: string,
): Violation => ({
  file: sourceFile.fileName,
  ...location(sourceFile, node),
  rule,
  snippet: node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 100),
})

const isPropertyName = (node: ts.Node): boolean => {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.name === node
  }
  if (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) {
    return parent.name === node
  }
  return false
}

const isLogicalBinary = (node: ts.Node): node is ts.BinaryExpression => {
  if (!ts.isBinaryExpression(node)) {
    return false
  }
  const kind = node.operatorToken.kind
  return (
    kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    kind === ts.SyntaxKind.BarBarToken
  )
}

const isBooleanContext = (node: ts.Node): boolean => {
  const parent = node.parent
  if (ts.isParenthesizedExpression(parent)) {
    return isBooleanContext(parent)
  }
  if (ts.isIfStatement(parent)) {
    return parent.expression === node
  }
  if (ts.isConditionalExpression(parent)) {
    return parent.condition === node
  }
  if (ts.isWhileStatement(parent) || ts.isDoStatement(parent)) {
    return parent.expression === node
  }
  if (ts.isForStatement(parent)) {
    return parent.condition === node
  }
  if (
    ts.isPrefixUnaryExpression(parent) &&
    parent.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return true
  }
  if (ts.isCallExpression(parent) && parent.expression.getText() === "Boolean") {
    return true
  }
  return isLogicalBinary(parent) ? isBooleanContext(parent) : false
}

const isBooleanLike = (checker: ts.TypeChecker, node: ts.Node): boolean => {
  const type = checker.getTypeAtLocation(node)
  const flags = type.flags
  if ((flags & ts.TypeFlags.BooleanLike) !== 0) {
    return true
  }
  return type.isUnion()
    ? type.types.every((part) => (part.flags & ts.TypeFlags.BooleanLike) !== 0)
    : false
}

const hasQuestionDot = (node: ts.Node): boolean =>
  (ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)) &&
  typeof node.questionDotToken !== "undefined"

const ruleFor = (
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): string | null => {
  switch (node.kind) {
    case ts.SyntaxKind.VariableDeclarationList:
      return ((node as ts.VariableDeclarationList).flags & ts.NodeFlags.Const) !==
        0
        ? null
        : "no var / let / using declarations"
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.LabeledStatement:
      return "no loop / label statements"
    case ts.SyntaxKind.BreakStatement:
    case ts.SyntaxKind.ContinueStatement:
      return "no break / continue statements"
    case ts.SyntaxKind.TryStatement:
      return "no try / catch statements"
    case ts.SyntaxKind.ThrowStatement:
      return "no throw statements"
    case ts.SyntaxKind.AsyncKeyword:
      return "no async functions; use Effect.gen / Effect.fn"
    case ts.SyntaxKind.AwaitExpression:
      return "no await; use Effect.gen + yield*"
    case ts.SyntaxKind.PrefixUnaryExpression:
    case ts.SyntaxKind.PostfixUnaryExpression: {
      const unary = node as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression
      return unary.operator === ts.SyntaxKind.PlusPlusToken ||
        unary.operator === ts.SyntaxKind.MinusMinusToken
        ? "no ++ / -- update expressions"
        : null
    }
    case ts.SyntaxKind.DeleteExpression:
      return "no delete expressions"
    case ts.SyntaxKind.AnyKeyword:
      return "no `any`; it bypasses the type system"
    case ts.SyntaxKind.NonNullExpression:
      return "no non-null assertion (!); decode the value instead"
    case ts.SyntaxKind.AsExpression:
      return (node as ts.AsExpression).expression.kind ===
        ts.SyntaxKind.AsExpression
        ? "no `as unknown as` double type assertions"
        : null
    case ts.SyntaxKind.Identifier:
      return (node as ts.Identifier).text === "undefined" &&
        !isPropertyName(node)
        ? "no `undefined`; model absence with Option / Either"
        : null
    case ts.SyntaxKind.BinaryExpression: {
      const binary = node as ts.BinaryExpression
      if (binary.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        return "no nullish coalescing (??); model fallback with Option / Either"
      }
      if (binary.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return ts.isPropertyAccessExpression(binary.left) ||
          ts.isElementAccessExpression(binary.left)
          ? "no mutation of object / array members"
          : null
      }
      if (!isLogicalBinary(binary)) {
        return null
      }
      return isBooleanContext(binary) || isBooleanLike(checker, binary)
        ? null
        : "no short-circuit value fallback (x && y / x || y); use Option / Either / Effect"
    }
    case ts.SyntaxKind.CallExpression: {
      if (hasQuestionDot(node)) {
        return "no optional chaining (?.); model absence with Option"
      }
      const call = node as ts.CallExpression
      const callee = call.expression
      if (!ts.isPropertyAccessExpression(callee)) {
        return null
      }
      const receiver = callee.expression.getText(sourceFile)
      const name = callee.name.text
      if (name === "then" || name === "finally") {
        return `no Promise.${name}(); convert the Promise to Effect at the boundary`
      }
      if (prohibitedMethods.has(name)) {
        return `no .${name}() (use map / filter / reduce / flatMap / Effect.all)`
      }
      return prohibitedStatics.has(`${receiver}.${name}`)
        ? `no ${receiver}.${name}() mutation`
        : null
    }
    default:
      return hasQuestionDot(node)
        ? "no optional chaining (?.); model absence with Option"
        : null
  }
}

const visit = (
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): ReadonlyArray<Violation> => {
  const current = ruleFor(checker, sourceFile, node)
  const children = node
    .getChildren(sourceFile)
    .flatMap((child) => visit(checker, sourceFile, child))
  return current === null
    ? children
    : [violation(sourceFile, node, current), ...children]
}

const checkFile = (
  program: ts.Program,
  checker: ts.TypeChecker,
  file: string,
): ReadonlyArray<Violation> => {
  const node = program.getSourceFile(file)
  return typeof node === "undefined"
    ? []
    : visit(checker, node, node)
}

const files = roots.flatMap(collectTypeScriptFiles)
const program = loadProgram(files)
const checker = program.getTypeChecker()

const violations = files.flatMap((file) => checkFile(program, checker, file))

if (violations.length > 0) {
  const report = violations
    .map(
      (item) =>
        `${item.file}:${item.line}:${item.column}  ${item.rule}\n    ${item.snippet}`,
    )
    .join("\n")
  process.stderr.write(
    `check-ast: found ${violations.length} forbidden imperative construct(s):\n${report}\n`,
  )
  process.exit(1)
}

process.stdout.write("check-ast: no forbidden imperative constructs\n")
