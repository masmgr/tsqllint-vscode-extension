import * as assert from "assert";
import * as sinon from "sinon";
import {
  Diagnostic,
  DiagnosticSeverity,
  TextEdit,
  InitializeParams,
  CodeActionParams,
  Command,
} from "vscode-languageserver";
import { VSCodeLSPConnection } from "../lsp/LSPConnectionAdapter";

suite("LSPConnectionAdapter - VSCodeLSPConnection", () => {
  let sandbox: sinon.SinonSandbox;
  let mockConnection: any;
  let adapter: VSCodeLSPConnection;

  setup(() => {
    sandbox = sinon.createSandbox();

    mockConnection = {
      sendDiagnostics: sandbox.stub(),
      onInitialize: sandbox.stub(),
      onDidChangeConfiguration: sandbox.stub(),
      onCodeAction: sandbox.stub(),
      onNotification: sandbox.stub(),
      workspace: {
        applyEdit: sandbox.stub().resolves(true),
      },
    };

    adapter = new VSCodeLSPConnection(mockConnection);
  });

  teardown(() => {
    sandbox.restore();
  });

  // ===== Initialization Tests =====

  suite("onInitialize()", () => {
    test("should register initialize handler with connection", () => {
      const handler = (params: InitializeParams) => {
        return {
          capabilities: {
            textDocumentSync: { openClose: true, change: 1, willSave: true, willSaveWaitUntil: true, save: true },
            codeActionProvider: true,
          },
        } as any;
      };

      adapter.onInitialize(handler);

      assert.ok(mockConnection.onInitialize.calledWith(handler));
    });

    test("should call handler when initialize event fires", () => {
      const handler = sandbox.stub().returns({
        capabilities: {
          textDocumentSync: { openClose: true },
          codeActionProvider: true,
        },
      });

      adapter.onInitialize(handler);

      const registeredHandler = mockConnection.onInitialize.firstCall.args[0];
      const result = registeredHandler({});

      assert.ok(handler.calledOnce);
      assert.ok(result.capabilities);
    });
  });

  // ===== Configuration Tests =====

  suite("onDidChangeConfiguration()", () => {
    test("should register configuration change handler", () => {
      const handler = sandbox.stub();

      adapter.onDidChangeConfiguration(handler);

      assert.ok(mockConnection.onDidChangeConfiguration.calledWith(handler));
    });

    test("should receive configuration change with tsqlLint settings", () => {
      const handler = sandbox.stub();

      adapter.onDidChangeConfiguration(handler);

      const registeredHandler = mockConnection.onDidChangeConfiguration.firstCall.args[0];
      const change = {
        settings: {
          tsqlLint: { autoFixOnSave: true },
        },
      };

      registeredHandler(change);

      assert.ok(handler.calledWith(change));
    });

    test("should handle empty settings object", () => {
      const handler = sandbox.stub();

      adapter.onDidChangeConfiguration(handler);

      const registeredHandler = mockConnection.onDidChangeConfiguration.firstCall.args[0];
      const change = { settings: {} };

      registeredHandler(change);

      assert.ok(handler.calledWith(change));
    });
  });

  // ===== Diagnostics Tests =====

  suite("sendDiagnostics()", () => {
    test("should send diagnostics to connection", () => {
      const diagnostics: Diagnostic[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          message: "Expected semi-colon",
          severity: DiagnosticSeverity.Error,
          source: "TSQLLint: semi-colon",
        },
      ];

      adapter.sendDiagnostics({
        uri: "file:///test.sql",
        diagnostics,
      });

      assert.ok(
        mockConnection.sendDiagnostics.calledWith({
          uri: "file:///test.sql",
          diagnostics,
        })
      );
    });

    test("should send empty diagnostics array", () => {
      adapter.sendDiagnostics({
        uri: "file:///test.sql",
        diagnostics: [],
      });

      assert.ok(
        mockConnection.sendDiagnostics.calledWith({
          uri: "file:///test.sql",
          diagnostics: [],
        })
      );
    });

    test("should send multiple diagnostics", () => {
      const diagnostics: Diagnostic[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          message: "Error 1",
          severity: DiagnosticSeverity.Error,
          source: "TSQLLint: rule1",
        },
        {
          range: {
            start: { line: 1, character: 5 },
            end: { line: 1, character: 15 },
          },
          message: "Warning 1",
          severity: DiagnosticSeverity.Warning,
          source: "TSQLLint: rule2",
        },
      ];

      adapter.sendDiagnostics({
        uri: "file:///test.sql",
        diagnostics,
      });

      const call = mockConnection.sendDiagnostics.firstCall;
      assert.strictEqual(call.args[0].diagnostics.length, 2);
    });

    test("should preserve diagnostic severity levels", () => {
      const diagnostics: Diagnostic[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          message: "Error",
          severity: DiagnosticSeverity.Error,
          source: "TSQLLint: rule1",
        },
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 10 },
          },
          message: "Warning",
          severity: DiagnosticSeverity.Warning,
          source: "TSQLLint: rule2",
        },
      ];

      adapter.sendDiagnostics({
        uri: "file:///test.sql",
        diagnostics,
      });

      const call = mockConnection.sendDiagnostics.firstCall;
      assert.strictEqual(call.args[0].diagnostics[0].severity, DiagnosticSeverity.Error);
      assert.strictEqual(call.args[0].diagnostics[1].severity, DiagnosticSeverity.Warning);
    });
  });

  // ===== Workspace Edit Tests =====

  suite("applyWorkspaceEdit()", () => {
    test("should apply workspace edit with text edits", async () => {
      const edits: TextEdit[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          newText: "FIXED",
        },
      ];

      await adapter.applyWorkspaceEdit("file:///test.sql", 1, edits);

      assert.ok(mockConnection.workspace.applyEdit.calledOnce);
    });

    test("should use document uri and version as identifier", async () => {
      const edits: TextEdit[] = [];

      mockConnection.workspace.applyEdit.resolves(true);

      await adapter.applyWorkspaceEdit("file:///test.sql", 5, edits);

      const call = mockConnection.workspace.applyEdit.firstCall;
      const workspaceEdit = call.args[0];

      // Verify documentChanges structure
      assert.ok(workspaceEdit.documentChanges);
      assert.strictEqual(workspaceEdit.documentChanges.length, 1);

      const docEdit = workspaceEdit.documentChanges[0];
      assert.strictEqual(docEdit.textDocument.uri, "file:///test.sql");
      assert.strictEqual(docEdit.textDocument.version, 5);
    });

    test("should pass edits to TextDocumentEdit", async () => {
      const edits: TextEdit[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 20 },
          },
          newText: "fixed content",
        },
      ];

      mockConnection.workspace.applyEdit.resolves(true);

      await adapter.applyWorkspaceEdit("file:///test.sql", 1, edits);

      const call = mockConnection.workspace.applyEdit.firstCall;
      const workspaceEdit = call.args[0];
      const docEdit = workspaceEdit.documentChanges[0];

      assert.strictEqual(docEdit.edits.length, 1);
      assert.strictEqual(docEdit.edits[0].newText, "fixed content");
    });

    test("should handle multiple text edits", async () => {
      const edits: TextEdit[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          newText: "FIXED1",
        },
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 10 },
          },
          newText: "FIXED2",
        },
      ];

      mockConnection.workspace.applyEdit.resolves(true);

      await adapter.applyWorkspaceEdit("file:///test.sql", 1, edits);

      const call = mockConnection.workspace.applyEdit.firstCall;
      const workspaceEdit = call.args[0];
      const docEdit = workspaceEdit.documentChanges[0];

      assert.strictEqual(docEdit.edits.length, 2);
    });

    test("should handle empty edits array", async () => {
      mockConnection.workspace.applyEdit.resolves(true);

      await adapter.applyWorkspaceEdit("file:///test.sql", 1, []);

      const call = mockConnection.workspace.applyEdit.firstCall;
      const workspaceEdit = call.args[0];
      const docEdit = workspaceEdit.documentChanges[0];

      assert.strictEqual(docEdit.edits.length, 0);
    });

    test("should await workspace edit completion", async () => {
      mockConnection.workspace.applyEdit.resolves(true);

      const result = await adapter.applyWorkspaceEdit("file:///test.sql", 1, []);

      assert.ok(mockConnection.workspace.applyEdit.calledOnce);
    });

    test("should propagate workspace edit errors", async () => {
      const error = new Error("Edit failed");
      mockConnection.workspace.applyEdit.rejects(error);

      try {
        await adapter.applyWorkspaceEdit("file:///test.sql", 1, []);
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.strictEqual(err.message, "Edit failed");
      }
    });
  });

  // ===== Code Action Tests =====

  suite("onCodeAction()", () => {
    test("should register code action handler", () => {
      const handler = sandbox.stub().returns([]);

      adapter.onCodeAction(handler);

      assert.ok(mockConnection.onCodeAction.calledWith(handler));
    });

    test("should handle code action request", () => {
      const handler = sandbox.stub().returns([
        {
          title: "Disable: test-rule for this line",
          command: "_tsql-lint.change",
          arguments: ["file:///test.sql", 0, []],
        },
      ]);

      adapter.onCodeAction(handler);

      const registeredHandler = mockConnection.onCodeAction.firstCall.args[0];
      const params: CodeActionParams = {
        textDocument: { uri: "file:///test.sql" },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        context: { diagnostics: [] },
      };

      const result = registeredHandler(params);

      assert.ok(handler.calledWith(params));
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].title.includes("test-rule"));
    });
  });

  // ===== Notification Tests =====

  suite("onNotification()", () => {
    test("should register notification handler for fix command", () => {
      const handler = sandbox.stub();

      adapter.onNotification("fix", handler);

      assert.ok(mockConnection.onNotification.calledWith("fix"));
    });

    test("should handle fix notification with document uri", () => {
      const handler = sandbox.stub();

      adapter.onNotification("fix", handler);

      const registeredHandler = mockConnection.onNotification.firstCall.args[1];
      registeredHandler("file:///test.sql");

      assert.ok(handler.calledWith("file:///test.sql"));
    });

    test("should register multiple different notification handlers", () => {
      const fixHandler = sandbox.stub();
      const otherHandler = sandbox.stub();

      adapter.onNotification("fix", fixHandler);
      adapter.onNotification("other", otherHandler);

      assert.ok(mockConnection.onNotification.calledWith("fix"));
      assert.ok(mockConnection.onNotification.calledWith("other"));
    });
  });

  // ===== Connection Access Tests =====

  suite("getConnection()", () => {
    test("should return underlying connection", () => {
      const connection = adapter.getConnection();

      assert.strictEqual(connection, mockConnection);
    });

    test("should allow direct connection access for advanced use", () => {
      const connection = adapter.getConnection();

      assert.ok(connection.workspace);
      assert.ok(connection.workspace.applyEdit);
    });
  });

  // ===== Integration Tests =====

  suite("Integration Scenarios", () => {
    test("should handle full validation and fix workflow", async () => {
      const diagnostics: Diagnostic[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 20 },
          },
          message: "Expected semi-colon",
          severity: DiagnosticSeverity.Error,
          source: "TSQLLint: semi-colon",
        },
      ];

      // Send diagnostics
      adapter.sendDiagnostics({
        uri: "file:///test.sql",
        diagnostics,
      });

      // Apply fix
      const edits: TextEdit[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10000, character: 0 },
          },
          newText: "SELECT * FROM users;",
        },
      ];

      mockConnection.workspace.applyEdit.resolves(true);
      await adapter.applyWorkspaceEdit("file:///test.sql", 1, edits);

      assert.ok(mockConnection.sendDiagnostics.calledOnce);
      assert.ok(mockConnection.workspace.applyEdit.calledOnce);
    });

    test("should handle configuration change and update behavior", () => {
      let settings = { autoFixOnSave: false };

      const handler = (change: any) => {
        settings = change.settings.tsqlLint || settings;
      };

      adapter.onDidChangeConfiguration(handler);

      const registeredHandler = mockConnection.onDidChangeConfiguration.firstCall.args[0];
      registeredHandler({
        settings: {
          tsqlLint: { autoFixOnSave: true },
        },
      });

      assert.strictEqual(settings.autoFixOnSave, true);
    });
  });
});
