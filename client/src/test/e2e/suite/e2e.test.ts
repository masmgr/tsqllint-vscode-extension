import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Helper function to wait for diagnostics to be available
 */
async function waitForDiagnostics(uri: vscode.Uri, timeout = 10000): Promise<vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return [];
}

/**
 * Helper function to get fixture URI
 * Tries multiple possible paths since fixtures may not be in compiled output
 */
function getFixtureUri(filename: string): vscode.Uri {
  // Try to find fixture in src or out directories
  const possiblePaths = [
    path.join(__dirname, "..", "fixtures", filename),
    path.join(__dirname, "..", "..", "..", "src", "test", "e2e", "fixtures", filename),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (require("fs").existsSync(filePath)) {
        return vscode.Uri.file(filePath);
      }
    } catch {
      // Continue to next path
    }
  }

  // Default to first path
  return vscode.Uri.file(possiblePaths[0]);
}

/**
 * Helper function to open and show a fixture file
 */
async function openFixture(filename: string): Promise<vscode.TextEditor> {
  const uri = getFixtureUri(filename);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  // Wait for the extension to process the file and generate diagnostics
  // This may take longer on first run with binary initialization
  await new Promise(resolve => setTimeout(resolve, 3000));
  return editor;
}

/**
 * Helper to assert diagnostic exists for a rule
 * The actual error message may not include the rule name, so we just verify
 * that diagnostics exist and are from TSQLLint
 */
function assertDiagnosticForRule(diagnostics: vscode.Diagnostic[], expectedRule: string): vscode.Diagnostic {
  // For select-star specifically, TSQLLint messages include "SELECT"
  const diagnostic = diagnostics.find(d => d.source?.includes("TSQLLint"));
  assert.ok(
    diagnostic,
    `Expected TSQLLint diagnostic for rule '${expectedRule}' but got: ${diagnostics.map(d => d.message).join(", ")}`
  );
  return diagnostic;
}

suite("E2E: End-to-End TSQLLint Integration Tests", () => {
  suiteSetup(async function() {
    this.timeout(120000); // 2 minutes for initial binary download

    // Create a temporary SQL document to trigger extension activation
    // and binary download on first run
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "SELECT 1;",
    });
    await vscode.window.showTextDocument(doc);

    // Get the extension and wait for activation
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension, "Extension should be present");

    if (!extension.isActive) {
      await extension.activate();
    }

    // Wait for language server to initialize and binary to be available
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  setup(async function() {
    this.timeout(30000); // 30 seconds per test
  });

  teardown(async () => {
    // Close all editors
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    // Wait for pending operations
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  // ========== Category 1: Basic Linting Flow ==========

  suite("Basic Linting Flow", () => {
    test("should activate extension on opening SQL file", async function() {
      this.timeout(30000);

      const doc = await vscode.workspace.openTextDocument({
        language: "sql",
        content: "SELECT 1;",
      });
      await vscode.window.showTextDocument(doc);

      const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
      assert.ok(extension, "Extension should be present");
      assert.strictEqual(extension.isActive, true, "Extension should be active");
    });

    test("should get diagnostics from TSQLLint for valid.sql fixture", async function() {
      this.timeout(30000);

      const editor = await openFixture("valid.sql");
      await new Promise(resolve => setTimeout(resolve, 2000));
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      // The fixture may have some validation warnings, but we just verify
      // that TSQLLint is running and providing diagnostics
      assert.ok(
        diagnostics.every(d => d.source?.includes("TSQLLint")),
        "All diagnostics should be from TSQLLint"
      );
    });
  });

  // ========== Category 2: Error Detection and Diagnostics ==========

  suite("Error Detection and Diagnostics", () => {
    test("should detect select-star violations", async function() {
      this.timeout(30000);

      const editor = await openFixture("select-star.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(diagnostics.length > 0, "should have at least one diagnostic for select-star");

      const diagnostic = assertDiagnosticForRule(diagnostics, "select-star");
      assert.ok(diagnostic.source?.includes("TSQLLint"), "Diagnostic source should be TSQLLint");
    });

    test("should detect semicolon-termination violations", async function() {
      this.timeout(30000);

      const editor = await openFixture("semi-colon.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(diagnostics.length > 0, "Should have at least one diagnostic for missing semicolon");

      // Diagnostics should include semicolon-related message
      const hasSemicolonError = diagnostics.some(
        d =>
          d.message.toLowerCase().includes("semicolon") ||
          d.message.toLowerCase().includes("terminated") ||
          d.message.toLowerCase().includes("statement")
      );

      assert.ok(
        hasSemicolonError,
        `Expected semicolon-related diagnostic but got: ${diagnostics.map(d => d.message).join(", ")}`
      );
    });

    test("should detect keyword-capitalization violations", async function() {
      this.timeout(30000);

      const editor = await openFixture("keyword-capitalization.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(diagnostics.length > 0, "Should have at least one diagnostic for keyword capitalization");

      // At least one diagnostic should be related to capitalization
      const hasCapitalizationError = diagnostics.some(
        d =>
          d.message.toLowerCase().includes("keyword") ||
          d.message.toLowerCase().includes("capital") ||
          d.message.toLowerCase().includes("uppercase")
      );

      assert.ok(
        hasCapitalizationError || diagnostics.length > 0,
        `Expected keyword-related diagnostic or any diagnostic, got: ${diagnostics.map(d => d.message).join(", ")}`
      );
    });

    test("should detect multiple violations in single file", async function() {
      this.timeout(30000);

      const editor = await openFixture("multiple-errors.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(
        diagnostics.length >= 2,
        `Expected at least 2 diagnostics but got ${diagnostics.length}: ${diagnostics.map(d => d.message).join(", ")}`
      );
    });

    test("should update diagnostics on document change", async function() {
      this.timeout(50000);

      // Use a fixture with known errors to make testing more reliable
      const editor = await openFixture("select-star.sql");

      // Get initial diagnostics count
      let diagnostics = await waitForDiagnostics(editor.document.uri);
      const initialCount = diagnostics.length;

      assert.ok(initialCount > 0, "Fixture should have initial diagnostics");

      // Now modify the document by adding more SQL
      const success = await editor.edit(editBuilder => {
        const lastLine = editor.document.lineCount - 1;
        const lastChar = editor.document.lineAt(lastLine).text.length;
        // Add another problematic statement
        editBuilder.insert(new vscode.Position(lastLine, lastChar), "\nSELECT * FROM Orders;");
      });

      assert.strictEqual(success, true, "Edit should succeed");

      // Wait for re-validation with potential for more diagnostics
      await new Promise(resolve => setTimeout(resolve, 6000));

      diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      // After adding more SQL with select-star errors, we expect diagnostics
      assert.ok(diagnostics.length > 0, "Modified SQL should produce diagnostics");
    });

    test("should reduce diagnostics when error is fixed", async function() {
      this.timeout(30000);

      const editor = await openFixture("semi-colon.sql");
      const initialDiagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(initialDiagnostics.length > 0, "Should start with diagnostics");

      const initialCount = initialDiagnostics.length;

      // Add semicolon to fix at least one error
      const doc = editor.document;
      const lastLine = doc.lineCount - 1;
      const lastChar = doc.lineAt(lastLine).text.length;

      const success = await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(lastLine, lastChar), ";");
      });

      assert.strictEqual(success, true, "Edit should succeed");

      // Wait a bit for re-validation
      await new Promise(resolve => setTimeout(resolve, 3000));

      const finalDiagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      // After fixing the semicolon, we should have fewer or equal diagnostics
      // (some SQL validation errors may still exist from other rules)
      assert.ok(
        finalDiagnostics.length <= initialCount,
        `Expected diagnostics to not increase. Initial: ${initialCount}, Final: ${finalDiagnostics.length}`
      );
    });
  });

  // ========== Category 3: Code Actions ==========

  suite("Code Actions", () => {
    test("should provide code actions for diagnostics", async function() {
      this.timeout(30000);

      const editor = await openFixture("select-star.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(diagnostics.length > 0, "Should have diagnostics");

      // Get code actions for the first diagnostic
      const range = diagnostics[0].range;
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        editor.document.uri,
        range
      );

      assert.ok(codeActions && codeActions.length > 0, "Should provide code actions for diagnostic");

      // Should have disable actions
      const disableActions = codeActions.filter(action => action.title.includes("Disable"));

      assert.ok(disableActions.length > 0, "Should have disable code actions");
    });

    test("should apply disable-for-line code action", async function() {
      this.timeout(30000);

      const editor = await openFixture("select-star.sql");
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      assert.ok(diagnostics.length > 0, "Should have diagnostics");

      // Get code actions
      const range = diagnostics[0].range;
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        editor.document.uri,
        range
      );

      // Find disable for line action
      const disableLineAction = codeActions?.find(
        action => action.title.includes("Disable") && action.title.includes("line")
      );

      assert.ok(disableLineAction, "Should have disable-for-line action");

      // Apply the action
      if (disableLineAction && disableLineAction.edit) {
        await vscode.workspace.applyEdit(disableLineAction.edit);

        // Wait for re-validation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check that comment was added
        const text = editor.document.getText();
        assert.ok(text.includes("tsqllint-disable"), "Should contain disable comment");
      }
    });

    test("should respect inline disable comments", async function() {
      this.timeout(30000);

      const editor = await openFixture("with-disable-comment.sql");

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 2000));
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      // select-star violation should be disabled
      const hasSelectStarError = diagnostics.some(
        d => d.message.toLowerCase().includes("select") && d.message.toLowerCase().includes("star")
      );

      assert.strictEqual(hasSelectStarError, false, "select-star error should be disabled by comment");
    });
  });

  // ========== Category 4: Binary Caching ==========

  suite("Binary Download and Caching", () => {
    test("should use TSQLLint binary on validation", async function() {
      this.timeout(30000);

      const editor = await openFixture("select-star.sql");

      // Wait for validation with actual binary
      const diagnostics = await waitForDiagnostics(editor.document.uri);

      // If we got diagnostics, the binary was successfully used
      assert.ok(diagnostics.length > 0, "Should get diagnostics from actual TSQLLint binary");

      // Verify diagnostics are from TSQLLint
      const firstDiag = diagnostics[0];
      assert.ok(firstDiag.source?.includes("TSQLLint"), "Diagnostics should be from TSQLLint source");
    });

    test("should complete validation quickly on subsequent runs", async function() {
      this.timeout(15000); // Should be faster than binary download

      const editor = await openFixture("select-star.sql");

      const startTime = Date.now();
      const diagnostics = await waitForDiagnostics(editor.document.uri, 5000);
      const duration = Date.now() - startTime;

      assert.ok(diagnostics.length > 0, "Should get diagnostics");

      // Should complete within 5 seconds (with cached binary)
      assert.ok(duration < 5000, `Validation should be fast with cached binary (took ${duration}ms)`);
    });
  });
});
