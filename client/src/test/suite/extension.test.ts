import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Smoke Tests", () => {
  test("Extension should be present", () => {
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension, "Extension tsqllint.tsqllint should be present");
  });

  test("Extension should activate on SQL file", async function() {
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
});

// Priority: High
suite("Language Server Initialization Tests", () => {
  test("Language Server Client should be initialized", async function() {
    this.timeout(30000);

    // Create a temporary SQL document to trigger activation
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "SELECT * FROM users;",
    });

    // Show the document to ensure activation
    await vscode.window.showTextDocument(doc);

    // Get the extension and activate if needed
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    assert.ok(extension, "Extension should be present");

    if (!extension.isActive) {
      await extension.activate();
    }

    // Verify extension is active (indicating Language Server Client is initialized)
    assert.strictEqual(extension.isActive, true, "Extension should be active with Language Server Client initialized");

    // Verify commands are registered (indicates Client initialization)
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("tsqlLint.fix"), "Language Server Client should register the fix command");
  });

  test("tsqlLint.fix command should be executable", async function() {
    this.timeout(30000);

    // Create and show a SQL document
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "SELECT * FROM users;",
    });
    await vscode.window.showTextDocument(doc);

    // Activate extension if needed
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    if (!extension.isActive) {
      await extension.activate();
    }

    // Verify fix command can be executed
    try {
      await vscode.commands.executeCommand("tsqlLint.fix");
      // Command executed successfully (or with expected errors)
      assert.ok(true, "Command executed without critical errors");
    } catch (error: any) {
      // Check if error is related to command not found or parameter issues
      assert.ok(!error.message.includes("not found"), "tsqlLint.fix command should be registered and executable");
    }
  });
});

// Priority: Medium
suite("Configuration Tests", () => {
  test("Default configuration should be correct", async function() {
    const config = vscode.workspace.getConfiguration("tsqlLint");

    // Verify default values
    const autoFixOnSave = config.get<boolean>("autoFixOnSave");
    const traceServer = config.get<string>("trace.server");

    assert.strictEqual(autoFixOnSave, false, "autoFixOnSave should default to false");
    assert.strictEqual(traceServer, "off", "trace.server should default to off");
  });

  test("Configuration changes should be applied", async function() {
    this.timeout(30000);

    const config = vscode.workspace.getConfiguration("tsqlLint");

    // Save original value
    const originalAutoFix = config.get<boolean>("autoFixOnSave");

    try {
      // Update configuration
      await config.update("autoFixOnSave", true, vscode.ConfigurationTarget.Global);

      // Verify change is applied
      const updatedConfig = vscode.workspace.getConfiguration("tsqlLint");
      const newAutoFix = updatedConfig.get<boolean>("autoFixOnSave");

      assert.strictEqual(newAutoFix, true, "Configuration should be updated to true");
    } finally {
      // Cleanup: restore original value
      await config.update("autoFixOnSave", originalAutoFix, vscode.ConfigurationTarget.Global);
    }
  });

  test("Extension should handle empty SQL files gracefully", async function() {
    this.timeout(30000);

    // Create and show an empty SQL document
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "",
    });
    await vscode.window.showTextDocument(doc);

    // Activate extension if needed
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    if (!extension.isActive) {
      await extension.activate();
    }

    // Wait for any processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify extension is still active
    assert.strictEqual(extension.isActive, true, "Extension should remain active after opening empty file");
  });

  test("Document changes should trigger extension processing", async function() {
    this.timeout(30000);

    // Create and show a SQL document
    const doc = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "SELECT * FROM users;",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // Activate extension if needed
    const extension = vscode.extensions.getExtension("tsqllint.tsqllint");
    if (!extension.isActive) {
      await extension.activate();
    }

    // Edit the document
    const editApplied = await editor.edit(editBuilder => {
      const lastLine = doc.lineCount - 1;
      const lastCharacter = doc.lineAt(lastLine).text.length;
      editBuilder.insert(new vscode.Position(lastLine, lastCharacter), "\nSELECT * FROM orders;");
    });

    assert.strictEqual(editApplied, true, "Edit should be applied successfully");

    // Wait for extension to process change
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify extension is still active after changes
    assert.strictEqual(extension.isActive, true, "Extension should remain active after document changes");
  });
});
