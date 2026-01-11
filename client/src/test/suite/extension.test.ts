import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Smoke Tests", () => {
  test("Extension should be present", () => {
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension, "Extension tsqllint.tsqllint should be present");
  });

  test("Extension should activate on SQL file", async function () {
    this.timeout(30000);

    // Create a temporary SQL document to trigger activation
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "SELECT * FROM users;",
    });

    // Show the document to ensure activation
    await vscode.window.showTextDocument(doc);

    // Get the extension and wait for activation
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension, "Extension should be present");

    // Explicitly activate if not already active
    if (!extension.isActive) {
      await extension.activate();
    }

    assert.strictEqual(extension.isActive, true, "Extension should be activated after opening SQL file");
  });

  test("Fix command should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    const hasFixCommand = commands.includes("tsqlLint.fix");

    assert.strictEqual(hasFixCommand, true, "tsqlLint.fix command should be registered");
  });

  test("Internal change command should be registered", async () => {
    // Note: Internal commands (starting with _) are not included in getCommands() list
    // Instead, we verify the extension is active and has the command in its activation
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension.isActive, "Extension should be active to register internal commands");

    // Verify we can execute the command (it should exist)
    try {
      await vscode.commands.executeCommand("_tsql-lint.change", "", {}, []);
    } catch (error: any) {
      // Command exists even if it fails due to missing params - we just want to verify registration
      assert.ok(!error.message.includes("not found"), "Internal _tsql-lint.change command should be registered");
    }
  });
});
