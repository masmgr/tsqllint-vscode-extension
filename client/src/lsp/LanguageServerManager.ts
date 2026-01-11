import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

export interface ILanguageServerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendFixNotification(uri: string): Promise<void>;
  onReady(): Promise<void>;
  getClient(): LanguageClient;
}

export class VSCodeLanguageServerManager implements ILanguageServerManager {
  private client: LanguageClient;

  constructor(serverModule: string, clientOptions: LanguageClientOptions) {
    const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    const serverOptions: ServerOptions = {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: debugOptions,
      },
    };

    this.client = new LanguageClient("tsqlLint", "TSQL Lint", serverOptions, clientOptions);
  }

  async start(): Promise<void> {
    this.client.registerProposedFeatures();
    await this.client.start();
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
    }
  }

  async sendFixNotification(uri: string): Promise<void> {
    await this.client.sendNotification("fix", uri);
  }

  onReady(): Promise<void> {
    return this.client.onReady();
  }

  getClient(): LanguageClient {
    return this.client;
  }
}
