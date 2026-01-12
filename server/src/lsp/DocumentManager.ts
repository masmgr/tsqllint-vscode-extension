import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, TextEdit } from "vscode-languageserver/node";

export interface ITextDocument {
  uri: string;
  version: number;
  getText(): string;
  languageId: string;
}

export interface IDocumentManager {
  getDocument(uri: string): ITextDocument | undefined;
  onDidChangeContent(handler: (doc: ITextDocument) => void): void;
  onWillSaveWaitUntil(handler: (doc: ITextDocument) => Promise<TextEdit[]>): void;
}

export class VSCodeDocumentManager implements IDocumentManager {
  constructor(private documents: TextDocuments<TextDocument>) {}

  getDocument(uri: string): ITextDocument | undefined {
    return this.documents.get(uri);
  }

  onDidChangeContent(handler: (doc: ITextDocument) => void): void {
    this.documents.onDidChangeContent(change => {
      handler(change.document);
    });
  }

  onWillSaveWaitUntil(handler: (doc: ITextDocument) => Promise<TextEdit[]>): void {
    this.documents.onWillSaveWaitUntil(e => handler(e.document));
  }
}
