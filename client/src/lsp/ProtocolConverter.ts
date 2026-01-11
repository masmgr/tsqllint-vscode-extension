import { Range } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

export interface IProtocolConverter {
  toVscodeRange(lspRange: any): Range;
}

export class VSCodeProtocolConverter implements IProtocolConverter {
  constructor(private client: LanguageClient) {}

  toVscodeRange(lspRange: any): Range {
    return this.client.protocol2CodeConverter.asRange(lspRange);
  }
}
