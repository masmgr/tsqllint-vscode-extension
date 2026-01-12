"use strict";

import * as os from "os";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  Diagnostic,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  TextDocumentEdit,
  WorkspaceEdit,
  InitializeParams,
} from "vscode-languageserver/node";
import * as uid from "uid-safe";
import TSQLLintRuntimeHelper from "./TSQLLintToolsHelper";
import { ITsqlLintError, parseErrors } from "./parseError";
import { getCommands, registerFileErrors } from "./commands";
import { NodeFileSystemAdapter } from "./platform/FileSystemAdapter";
import { NodePlatformAdapter } from "./platform/PlatformAdapter";
import { NodeBinaryExecutor } from "./platform/BinaryExecutor";
import { VSCodeDocumentManager, IDocumentManager } from "./lsp/DocumentManager";

const applicationRoot = path.parse(process.argv[1]);

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const documentManager: IDocumentManager = new VSCodeDocumentManager(documents);

interface TsqlLintSettings {
  autoFixOnSave: boolean;
}

const defaultSettings: TsqlLintSettings = { autoFixOnSave: false };
let globalSettings: TsqlLintSettings = defaultSettings;

connection.onDidChangeConfiguration(change => {
  globalSettings = (change.settings.tsqlLint || defaultSettings) as TsqlLintSettings;
});

documents.listen(connection);

connection.onInitialize((params: InitializeParams) => ({
  capabilities: {
    textDocumentSync: {
      openClose: true,
      save: true,
      willSaveWaitUntil: true,
      willSave: true,
      change: TextDocumentSyncKind.Incremental,
    },
    codeActionProvider: true,
  },
}));

connection.onCodeAction(getCommands);

documentManager.onDidChangeContent(async document => {
  await ValidateBuffer(document as TextDocument, null);
});

connection.onNotification("fix", async (uri: string) => {
  const textDocument = documentManager.getDocument(uri);
  const edits = await getTextEdit(textDocument as TextDocument, true);
  // The fuckery that I wasted 6 hours on...
  // IMPORTANT! It's syntactially correct to pass textDocument to TextDocumentEdit.create, but it won't work.
  // You'll get a very vauge error like:
  // ResponseError: Request workspace/applyEdit failed with message: Unknown workspace edit change received:
  // Shoutout to finally finding this issues and looking to see how he fixed it.
  // https://github.com/stylelint/vscode-stylelint/issues/329
  // https://github.com/stylelint/vscode-stylelint/compare/v1.2.0..v1.2.1
  const identifier = { uri: textDocument.uri, version: textDocument.version };
  const textDocumentEdits = TextDocumentEdit.create(identifier, edits);
  const workspaceEdit: WorkspaceEdit = { documentChanges: [textDocumentEdits] };
  await connection.workspace.applyEdit(workspaceEdit);
});

documentManager.onWillSaveWaitUntil(document => getTextEdit(document as TextDocument));

async function getTextEdit(d: TextDocument, force: boolean = false): Promise<TextEdit[]> {
  if (!force && !globalSettings.autoFixOnSave) {
    return [];
  }

  const test = await ValidateBuffer(d, true);

  return [
    {
      range: {
        start: {
          line: 0,
          character: 0,
        },
        end: {
          line: 10000,
          character: 0,
        },
      },
      newText: test,
    },
  ];
}

const toolsHelper: TSQLLintRuntimeHelper = new TSQLLintRuntimeHelper(applicationRoot.dir);
const fileSystemAdapter = new NodeFileSystemAdapter();
const platformAdapter = new NodePlatformAdapter();
const binaryExecutor = new NodeBinaryExecutor();

async function LintBuffer(fileUri: string, shouldFix: boolean): Promise<string[]> {
  const toolsPath = await toolsHelper.TSQLLintRuntime();

  const args = [fileUri];
  if (shouldFix) {
    args.push("-x");
  }

  const binaryPath = platformAdapter.getBinaryPath(toolsPath);
  const result = await binaryExecutor.execute(binaryPath, args);

  return result;
}

function TempFilePath(textDocument: TextDocument) {
  const ext = path.extname(textDocument.uri) || ".sql";
  const name = uid.sync(18) + ext;
  return path.join(os.tmpdir(), name);
}

async function ValidateBuffer(textDocument: TextDocument, shouldFix: boolean): Promise<string> {
  const tempFilePath: string = TempFilePath(textDocument);
  await fileSystemAdapter.writeFile(tempFilePath, textDocument.getText());

  let lintErrorStrings;

  try {
    lintErrorStrings = await LintBuffer(tempFilePath, shouldFix);
  } catch (error) {
    registerFileErrors(textDocument, []);
    throw error;
  }

  const errors = parseErrors(textDocument.getText(), lintErrorStrings);
  registerFileErrors(textDocument, errors);
  const diagnostics = errors.map(toDiagnostic);

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  function toDiagnostic(lintError: ITsqlLintError): Diagnostic {
    return {
      severity: lintError.severity,
      range: lintError.range,
      message: lintError.message,
      source: `TSQLLint: ${lintError.rule}`,
    };
  }

  let updated = null;

  if (shouldFix) {
    updated = await fileSystemAdapter.readFile(tempFilePath);
  }

  await fileSystemAdapter.deleteFile(tempFilePath);

  return updated;
}

connection.listen();
