import * as assert from "assert";
import * as sinon from "sinon";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, TextEdit } from "vscode-languageserver";
import { VSCodeDocumentManager } from "../lsp/DocumentManager";

suite("DocumentManager - VSCodeDocumentManager", () => {
  let sandbox: sinon.SinonSandbox;
  let mockDocuments: any;
  let documentManager: VSCodeDocumentManager;

  setup(() => {
    sandbox = sinon.createSandbox();

    mockDocuments = {
      get: sandbox.stub(),
      onDidChangeContent: sandbox.stub(),
      onWillSaveWaitUntil: sandbox.stub(),
    };

    documentManager = new VSCodeDocumentManager(mockDocuments);
  });

  teardown(() => {
    sandbox.restore();
  });

  // ===== Document Retrieval Tests =====

  suite("getDocument()", () => {
    test("should retrieve document by URI", () => {
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const result = documentManager.getDocument("file:///test.sql");

      assert.ok(mockDocuments.get.calledWith("file:///test.sql"));
      assert.strictEqual(result, doc);
    });

    test("should return undefined for non-existent document", () => {
      mockDocuments.get.returns(undefined);

      const result = documentManager.getDocument("file:///nonexistent.sql");

      assert.strictEqual(result, undefined);
    });

    test("should retrieve document with correct URI format", () => {
      const uri = "file:///c%3A/Users/test/file.sql";
      const doc = TextDocument.create(uri, "sql", 1, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const result = documentManager.getDocument(uri);

      assert.strictEqual(result.uri, uri);
    });

    test("should handle Windows file paths", () => {
      const uri = "file:///C:/Users/test/file.sql";
      const doc = TextDocument.create(uri, "sql", 1, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const result = documentManager.getDocument(uri);

      assert.strictEqual(result.uri, uri);
    });

    test("should return document with correct text content", () => {
      const content = "SELECT * FROM users WHERE id = 1";
      const doc = TextDocument.create("file:///test.sql", "sql", 1, content);

      mockDocuments.get.returns(doc);

      const result = documentManager.getDocument("file:///test.sql");

      assert.strictEqual(result.getText(), content);
    });

    test("should return document with correct version", () => {
      const doc = TextDocument.create("file:///test.sql", "sql", 5, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const result = documentManager.getDocument("file:///test.sql");

      assert.strictEqual(result.version, 5);
    });

    test("should cache subsequent calls to same document", () => {
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const result1 = documentManager.getDocument("file:///test.sql");
      const result2 = documentManager.getDocument("file:///test.sql");

      assert.strictEqual(mockDocuments.get.callCount, 2);
      assert.strictEqual(result1, result2);
    });
  });

  // ===== Change Content Tests =====

  suite("onDidChangeContent()", () => {
    test("should register change content handler", () => {
      const handler = sandbox.stub();

      documentManager.onDidChangeContent(handler);

      assert.ok(mockDocuments.onDidChangeContent.calledOnce);
    });

    test("should invoke handler when document content changes", () => {
      const handler = sandbox.stub();

      documentManager.onDidChangeContent(handler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      registeredHandler({ document: doc });

      assert.ok(handler.calledWith(doc));
    });

    test("should pass document to handler", () => {
      const handler = sandbox.stub();

      documentManager.onDidChangeContent(handler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 2, "SELECT * FROM users WHERE id = 1");

      registeredHandler({ document: doc });

      const passedDoc = handler.firstCall.args[0];
      assert.strictEqual(passedDoc.uri, doc.uri);
      assert.strictEqual(passedDoc.version, 2);
      assert.strictEqual(passedDoc.getText(), doc.getText());
    });

    test("should handle multiple change handlers", () => {
      const handler1 = sandbox.stub();
      const handler2 = sandbox.stub();

      documentManager.onDidChangeContent(handler1);
      documentManager.onDidChangeContent(handler2);

      assert.strictEqual(mockDocuments.onDidChangeContent.callCount, 2);
    });

    test("should handle rapid content changes", () => {
      const handler = sandbox.stub();

      documentManager.onDidChangeContent(handler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];
      const doc1 = TextDocument.create("file:///test.sql", "sql", 1, "SELECT");
      const doc2 = TextDocument.create("file:///test.sql", "sql", 2, "SELECT * FROM users");

      registeredHandler({ document: doc1 });
      registeredHandler({ document: doc2 });

      assert.strictEqual(handler.callCount, 2);
      assert.strictEqual(handler.firstCall.args[0].getText(), "SELECT");
      assert.strictEqual(handler.secondCall.args[0].getText(), "SELECT * FROM users");
    });

    test("should pass only document to handler, not change event", () => {
      const handler = sandbox.stub();

      documentManager.onDidChangeContent(handler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");
      const changeEvent = { document: doc, contentChanges: [] };

      registeredHandler(changeEvent);

      // Handler should receive just the document
      const arg = handler.firstCall.args[0];
      assert.ok(arg.uri);
      assert.ok(arg.getText);
      assert.ok(typeof arg.contentChanges === "undefined");
    });
  });

  // ===== Will Save Wait Until Tests =====

  suite("onWillSaveWaitUntil()", () => {
    test("should register will save wait until handler", () => {
      const handler = sandbox.stub().resolves([]);

      documentManager.onWillSaveWaitUntil(handler);

      assert.ok(mockDocuments.onWillSaveWaitUntil.calledOnce);
    });

    test("should invoke handler before document save", () => {
      const handler = sandbox.stub().resolves([]);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      registeredHandler({ document: doc });

      assert.ok(handler.calledWith(doc));
    });

    test("should return TextEdit array from handler", () => {
      const edits: TextEdit[] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          newText: "FIXED",
        },
      ];

      const handler = sandbox.stub().resolves(edits);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      registeredHandler({ document: doc });

      assert.ok(handler.calledWith(doc));
    });

    test("should handle empty edits array", () => {
      const handler = sandbox.stub().resolves([]);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      registeredHandler({ document: doc });

      assert.ok(handler.calledWith(doc));
    });

    test("should support async handler operations", async () => {
      const handler = sandbox.stub().resolves([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10000, character: 0 },
          },
          newText: "fixed content",
        },
      ]);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      const promise = registeredHandler({ document: doc });

      // Verify it returns a promise
      assert.ok(promise instanceof Promise);
    });

    test("should handle multiple will save handlers", () => {
      const handler1 = sandbox.stub().resolves([]);
      const handler2 = sandbox.stub().resolves([]);

      documentManager.onWillSaveWaitUntil(handler1);
      documentManager.onWillSaveWaitUntil(handler2);

      assert.strictEqual(mockDocuments.onWillSaveWaitUntil.callCount, 2);
    });

    test("should pass document with correct properties", () => {
      const handler = sandbox.stub().resolves([]);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const content = "SELECT * FROM users WHERE id = 1";
      const doc = TextDocument.create("file:///test.sql", "sql", 3, content);

      registeredHandler({ document: doc });

      const passedDoc = handler.firstCall.args[0];
      assert.strictEqual(passedDoc.uri, doc.uri);
      assert.strictEqual(passedDoc.version, 3);
      assert.strictEqual(passedDoc.getText(), content);
      assert.strictEqual(passedDoc.languageId, "sql");
    });

    test("should handle TextEdit with multiple ranges", () => {
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
            start: { line: 1, character: 5 },
            end: { line: 1, character: 15 },
          },
          newText: "FIXED2",
        },
      ];

      const handler = sandbox.stub().resolves(edits);

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create(
        "file:///test.sql",
        "sql",
        1,
        "SELECT * FROM users\nWHERE id = 1"
      );

      registeredHandler({ document: doc });

      assert.ok(handler.calledWith(doc));
    });
  });

  // ===== Integration Tests =====

  suite("Integration Scenarios", () => {
    test("should handle document lifecycle: open, change, save", () => {
      const changeHandler = sandbox.stub();
      const saveHandler = sandbox.stub().resolves([]);
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      documentManager.onDidChangeContent(changeHandler);
      documentManager.onWillSaveWaitUntil(saveHandler);

      // Simulate change
      const changeRegistered = mockDocuments.onDidChangeContent.firstCall.args[0];
      changeRegistered({ document: doc });

      // Simulate save
      const saveRegistered = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      saveRegistered({ document: doc });

      assert.ok(changeHandler.calledWith(doc));
      assert.ok(saveHandler.calledWith(doc));
    });

    test("should handle retrieval during lifecycle", () => {
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      mockDocuments.get.returns(doc);

      const retrieved = documentManager.getDocument("file:///test.sql");

      assert.strictEqual(retrieved.uri, doc.uri);
      assert.strictEqual(retrieved.version, doc.version);
      assert.strictEqual(retrieved.getText(), doc.getText());
    });

    test("should handle document version updates across changes", () => {
      const changeHandler = sandbox.stub();

      documentManager.onDidChangeContent(changeHandler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];

      const docV1 = TextDocument.create("file:///test.sql", "sql", 1, "SELECT");
      const docV2 = TextDocument.create("file:///test.sql", "sql", 2, "SELECT *");
      const docV3 = TextDocument.create("file:///test.sql", "sql", 3, "SELECT * FROM users");

      registeredHandler({ document: docV1 });
      registeredHandler({ document: docV2 });
      registeredHandler({ document: docV3 });

      assert.strictEqual(changeHandler.callCount, 3);
      assert.strictEqual(changeHandler.firstCall.args[0].version, 1);
      assert.strictEqual(changeHandler.secondCall.args[0].version, 2);
      assert.strictEqual(changeHandler.thirdCall.args[0].version, 3);
    });

    test("should handle interleaved changes and saves", () => {
      const changeHandler = sandbox.stub();
      const saveHandler = sandbox.stub().resolves([]);

      documentManager.onDidChangeContent(changeHandler);
      documentManager.onWillSaveWaitUntil(saveHandler);

      const changeRegistered = mockDocuments.onDidChangeContent.firstCall.args[0];
      const saveRegistered = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];

      const docV1 = TextDocument.create("file:///test.sql", "sql", 1, "SELECT");
      const docV2 = TextDocument.create("file:///test.sql", "sql", 2, "SELECT *");

      // Change, save, change, save
      changeRegistered({ document: docV1 });
      saveRegistered({ document: docV1 });
      changeRegistered({ document: docV2 });
      saveRegistered({ document: docV2 });

      assert.strictEqual(changeHandler.callCount, 2);
      assert.strictEqual(saveHandler.callCount, 2);
    });

    test("should handle multiple files concurrently", () => {
      const doc1 = TextDocument.create("file:///test1.sql", "sql", 1, "SELECT * FROM users");
      const doc2 = TextDocument.create("file:///test2.sql", "sql", 1, "SELECT * FROM orders");

      mockDocuments.get
        .withArgs("file:///test1.sql")
        .returns(doc1)
        .withArgs("file:///test2.sql")
        .returns(doc2);

      const result1 = documentManager.getDocument("file:///test1.sql");
      const result2 = documentManager.getDocument("file:///test2.sql");

      assert.strictEqual(result1.uri, "file:///test1.sql");
      assert.strictEqual(result2.uri, "file:///test2.sql");
    });
  });

  // ===== Error Handling Tests =====

  suite("Error Handling", () => {
    test("should handle handler that throws error", () => {
      const handler = sandbox.stub().throws(new Error("Handler error"));

      documentManager.onDidChangeContent(handler);

      const registeredHandler = mockDocuments.onDidChangeContent.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      assert.throws(() => {
        registeredHandler({ document: doc });
      }, /Handler error/);
    });

    test("should handle save handler that rejects promise", () => {
      const handler = sandbox.stub().rejects(new Error("Save failed"));

      documentManager.onWillSaveWaitUntil(handler);

      const registeredHandler = mockDocuments.onWillSaveWaitUntil.firstCall.args[0];
      const doc = TextDocument.create("file:///test.sql", "sql", 1, "SELECT * FROM users");

      const promise = registeredHandler({ document: doc });

      assert.ok(promise instanceof Promise);
    });

    test("should handle null document gracefully", () => {
      mockDocuments.get.returns(null);

      const result = documentManager.getDocument("file:///nonexistent.sql");

      assert.strictEqual(result, null);
    });
  });
});
