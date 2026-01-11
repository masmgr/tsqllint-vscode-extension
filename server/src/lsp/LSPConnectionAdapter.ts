import {
  Connection,
  Diagnostic,
  TextEdit,
  WorkspaceEdit,
  TextDocumentEdit,
  InitializeParams,
  CodeActionParams,
  Command,
  InitializeResult,
} from "vscode-languageserver/node";

export interface ILSPConnection {
  sendDiagnostics(params: { uri: string; diagnostics: Diagnostic[] }): void;
  applyWorkspaceEdit(uri: string, version: number, edits: TextEdit[]): Promise<void>;
  onInitialize(handler: (params: InitializeParams) => InitializeResult): void;
  onDidChangeConfiguration(handler: (change: any) => void): void;
  onCodeAction(handler: (params: CodeActionParams) => Command[]): void;
  onNotification(method: string, handler: (...params: any[]) => void): void;
}

export class VSCodeLSPConnection implements ILSPConnection {
  constructor(private connection: Connection) {}

  sendDiagnostics(params: { uri: string; diagnostics: Diagnostic[] }): void {
    this.connection.sendDiagnostics(params);
  }

  async applyWorkspaceEdit(uri: string, version: number, edits: TextEdit[]): Promise<void> {
    const identifier = { uri, version };
    const textDocumentEdits = TextDocumentEdit.create(identifier, edits);
    const workspaceEdit: WorkspaceEdit = {
      documentChanges: [textDocumentEdits],
    };
    await this.connection.workspace.applyEdit(workspaceEdit);
  }

  onInitialize(handler: (params: InitializeParams) => InitializeResult): void {
    this.connection.onInitialize(handler);
  }

  onDidChangeConfiguration(handler: (change: any) => void): void {
    this.connection.onDidChangeConfiguration(handler);
  }

  onCodeAction(handler: (params: CodeActionParams) => Command[]): void {
    this.connection.onCodeAction(handler);
  }

  onNotification(method: string, handler: (...params: any[]) => void): void {
    this.connection.onNotification(method, handler);
  }

  getConnection(): Connection {
    return this.connection;
  }
}
