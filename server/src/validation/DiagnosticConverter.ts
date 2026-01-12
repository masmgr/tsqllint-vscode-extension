import { Diagnostic } from "vscode-languageserver/node";
import { ITsqlLintError } from "../parseError";

export interface IDiagnosticConverter {
  toDiagnostics(errors: ITsqlLintError[]): Diagnostic[];
}

export class DiagnosticConverter implements IDiagnosticConverter {
  toDiagnostics(errors: ITsqlLintError[]): Diagnostic[] {
    return errors.map(error => ({
      severity: error.severity,
      range: error.range,
      message: error.message,
      source: `TSQLLint: ${error.rule}`,
    }));
  }
}
