import { DiagnosticSeverity, Range } from "vscode-languageserver/node";

export interface ITsqlLintError {
  range: Range;
  message: string;
  rule: string;
  severity: DiagnosticSeverity;
}

export function parseErrors(docText: string, errorStrings: string[]): ITsqlLintError[] {
  const lines = docText.split("\n");
  const lineStarts = lines.map(line => line.match(/^\s*/)?.[0]?.length ?? 0);

  return errorStrings.map(parseError).filter(isValidError);

  function parseError(errorString: string): ITsqlLintError {
    try {
      // Supported formats:
      // 1) (line,col): rule-name: message
      // 2) (line,col): error|warning rule-name: message
      const parts: string[] = errorString.split(":");

      const positionStr: string = (parts[0] ?? "").replace("(", "").replace(")", "");
      const positionArr: number[] = positionStr.split(",").map(v => Number(v.trim()));

      const rawLine = positionArr[0];
      const line = Number.isFinite(rawLine) ? Math.max(rawLine - 1, 0) : -1;
      const colStart = line >= 0 ? lineStarts[line] ?? 0 : 0;

      let colEnd = 0;
      if (line >= 0 && lines[line] !== undefined) {
        colEnd = lines[line].length;
      }

      const range: Range = {
        start: { line, character: colStart },
        end: { line, character: colEnd },
      };

      const middle = (parts[1] ?? "").trim();
      const middleTokens = middle.split(/\s+/).filter(Boolean);

      let severity: DiagnosticSeverity = DiagnosticSeverity.Error;
      let rule: string = middle;

      if (middleTokens.length > 0) {
        const first = middleTokens[0].toLowerCase();
        if (first === "warning" || first === "error") {
          severity = first === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
          rule = middleTokens.slice(1).join(" ");
        }
      }

      const messageParts = parts.slice(2);
      if (messageParts.length > 0 && messageParts[messageParts.length - 1].trim() === "") {
        messageParts.pop();
      }
      const message = messageParts.join(":").trim();

      return {
        range,
        message,
        rule,
        severity,
      };
    } catch {
      return {
        range: {
          start: { line: -1, character: 0 },
          end: { line: -1, character: 0 },
        },
        message: errorString,
        rule: "",
        severity: DiagnosticSeverity.Error,
      };
    }
  }
}

function isValidError(error: ITsqlLintError): boolean {
  return error.range.start.line >= 0;
}
