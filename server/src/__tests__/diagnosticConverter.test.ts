import * as assert from "assert";
import { DiagnosticConverter } from "../validation/DiagnosticConverter";
import { ITsqlLintError } from "../parseError";
import { DiagnosticSeverity } from "vscode-languageserver/node";

suite("DiagnosticConverter - toDiagnostics()", () => {
  let converter: DiagnosticConverter;

  setup(() => {
    converter = new DiagnosticConverter();
  });

  // ===== 正常系テスト =====

  test("should convert single error to diagnostic", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "semi-colon",
        message: "Expected semi-colon",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 20 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].message, "Expected semi-colon");
    assert.strictEqual(result[0].source, "TSQLLint: semi-colon");
    assert.strictEqual(result[0].severity, DiagnosticSeverity.Error);
    assert.deepStrictEqual(result[0].range, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 20 },
    });
  });

  test("should convert multiple errors to diagnostics", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "semi-colon",
        message: "Expected semi-colon",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 20 },
        },
      },
      {
        rule: "keyword-capitalization",
        message: "Expected keyword capitalization",
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].message, "Expected semi-colon");
    assert.strictEqual(result[0].source, "TSQLLint: semi-colon");
    assert.strictEqual(result[0].severity, DiagnosticSeverity.Error);
    assert.strictEqual(result[1].message, "Expected keyword capitalization");
    assert.strictEqual(result[1].source, "TSQLLint: keyword-capitalization");
    assert.strictEqual(result[1].severity, DiagnosticSeverity.Warning);
  });

  test("should preserve error severity levels", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "error-rule",
        message: "Error message",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
      {
        rule: "warning-rule",
        message: "Warning message",
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 10 },
        },
      },
      {
        rule: "info-rule",
        message: "Info message",
        severity: DiagnosticSeverity.Information,
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result[0].severity, DiagnosticSeverity.Error);
    assert.strictEqual(result[1].severity, DiagnosticSeverity.Warning);
    assert.strictEqual(result[2].severity, DiagnosticSeverity.Information);
  });

  test("should format source with rule name", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "my-custom-rule",
        message: "Custom message",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result[0].source, "TSQLLint: my-custom-rule");
  });

  test("should preserve range information", () => {
    const range = {
      start: { line: 5, character: 10 },
      end: { line: 5, character: 25 },
    };

    const errors: ITsqlLintError[] = [
      {
        rule: "rule",
        message: "message",
        severity: DiagnosticSeverity.Error,
        range,
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.deepStrictEqual(result[0].range, range);
  });

  // ===== 異常系テスト =====

  test("should return empty array for empty errors", () => {
    const errors: ITsqlLintError[] = [];

    const result = converter.toDiagnostics(errors);

    assert.deepStrictEqual(result, []);
  });

  test("should handle error with empty message", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "rule",
        message: "",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].message, "");
  });

  test("should handle error with special characters in rule name", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "rule-with-dash_underscore.dot",
        message: "message",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result[0].source, "TSQLLint: rule-with-dash_underscore.dot");
  });

  test("should handle error with special characters in message", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "rule",
        message: 'Expected "quoted" value with <special> & characters',
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result[0].message, 'Expected "quoted" value with <special> & characters');
  });

  test("should handle error with multiline range", () => {
    const errors: ITsqlLintError[] = [
      {
        rule: "rule",
        message: "message",
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 5 },
          end: { line: 10, character: 15 },
        },
      },
    ];

    const result = converter.toDiagnostics(errors);

    assert.strictEqual(result[0].range.start.line, 0);
    assert.strictEqual(result[0].range.start.character, 5);
    assert.strictEqual(result[0].range.end.line, 10);
    assert.strictEqual(result[0].range.end.character, 15);
  });
});
