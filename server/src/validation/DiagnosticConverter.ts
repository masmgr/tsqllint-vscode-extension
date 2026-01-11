import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import { ITsqlLintError } from "../parseError";

export interface IDiagnosticConverter {
  toDiagnostics(errors: ITsqlLintError[]): Diagnostic[];
}

export class DiagnosticConverter implements IDiagnosticConverter {
  toDiagnostics(errors: ITsqlLintError[]): Diagnostic[] {
    return errors.map((error) => ({
      severity: DiagnosticSeverity.Information,
      range: error.range,
      message: `${error.rule}: ${error.message}`,
      source: "tsqllint",
    }));
  }
}
