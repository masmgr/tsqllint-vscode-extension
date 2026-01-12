"use strict";

import { ChildProcess } from "child_process";

import { spawn } from "child_process";
import * as fs from "fs";
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

const applicationRoot = path.parse(process.argv[1]);

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
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

documents.onDidChangeContent(async change => {
  await ValidateBuffer(change.document, null);
});

connection.onNotification("fix", async (uri: string) => {
  const textDocument = documents.get(uri);
  const edits = await getTextEdit(textDocument, true);
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

documents.onWillSaveWaitUntil(e => getTextEdit(e.document));

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

async function LintBuffer(fileUri: string, shouldFix: boolean): Promise<string[]> {
  const toolsPath = await toolsHelper.TSQLLintRuntime();

  const result: string[] = await new Promise((resolve, reject) => {
    let childProcess: ChildProcess;

    const args = [fileUri];
    if (shouldFix) {
      args.push("-x");
    }

    if (os.type() === "Darwin") {
      childProcess = spawn(`${toolsPath}/osx-x64/TSQLLint.Console`, args);
    } else if (os.type() === "Linux") {
      childProcess = spawn(`${toolsPath}/linux-x64/TSQLLint.Console`, args);
    } else if (os.type() === "Windows_NT") {
      if (os.type() === "Windows_NT") {
        if (process.arch === "ia32") {
          childProcess = spawn(`${toolsPath}/win-x86/TSQLLint.Console.exe`, args);
        } else if (process.arch === "x64") {
          childProcess = spawn(`${toolsPath}/win-x64/TSQLLint.Console.exe`, args);
        } else {
          throw new Error(`Invalid Platform: ${os.type()}, ${process.arch}`);
        }
      }
    } else {
      throw new Error(`Invalid Platform: ${os.type()}, ${process.arch}`);
    }

    let result: string;
    childProcess.stdout.on("data", (data: string) => {
      result += data;
    });

    childProcess.stderr.on("data", (data: string) => {
      console.log(`stderr: ${data}`);
    });

    childProcess.on("close", () => {
      const list: string[] = result.split("\n");
      const resultsArr: string[] = [];

      list.forEach(element => {
        const index = element.indexOf("(");
        if (index > 0) {
          resultsArr.push(element.substring(index, element.length - 1));
        }
      });

      resolve(resultsArr);
    });
  });

  return result;
}

function TempFilePath(textDocument: TextDocument) {
  const ext = path.extname(textDocument.uri) || ".sql";
  const name = uid.sync(18) + ext;
  return path.join(os.tmpdir(), name);
}

async function ValidateBuffer(textDocument: TextDocument, shouldFix: boolean): Promise<string> {
  const tempFilePath: string = TempFilePath(textDocument);
  fs.writeFileSync(tempFilePath, textDocument.getText());

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
    updated = fs.readFileSync(tempFilePath).toString();
  }

  fs.unlinkSync(tempFilePath);

  return updated;
}

connection.listen();
