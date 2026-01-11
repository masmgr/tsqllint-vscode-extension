"use strict";

import * as path from "path";
import { workspace, ExtensionContext, commands } from "vscode";
import { LanguageClientOptions } from "vscode-languageclient/node";
import { ILanguageServerManager, VSCodeLanguageServerManager } from "./lsp/LanguageServerManager";
import { IEditorService, VSCodeEditorService } from "./vscode/EditorService";

let serverManager: ILanguageServerManager;
const editorService: IEditorService = new VSCodeEditorService();

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "sql" }],
    synchronize: {
      configurationSection: "tsqlLint",
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  serverManager = new VSCodeLanguageServerManager(serverModule, clientOptions);

  async function fix() {
    const editor = editorService.getActiveEditor();
    if (!editor) {
      editorService.showInformationMessage("No active editor");
      return;
    }
    await serverManager.sendFixNotification(editor.document.uri.toString());
  }

  context.subscriptions.push(commands.registerCommand("tsqlLint.fix", fix));

  serverManager.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!serverManager) {
    return undefined;
  }
  return serverManager.stop();
}
