import * as os from "os";

export type SupportedPlatform = "osx-x64" | "linux-x64" | "win-x86" | "win-x64";

export interface IPlatformAdapter {
  getPlatform(): SupportedPlatform;
  getBinaryPath(baseDirectory: string): string;
  getTempDirectory(): string;
}

export class NodePlatformAdapter implements IPlatformAdapter {
  getPlatform(): SupportedPlatform {
    const osType = os.type();

    if (osType === "Darwin") {
      return "osx-x64";
    }

    if (osType === "Linux") {
      return "linux-x64";
    }

    if (osType === "Windows_NT") {
      return process.arch === "ia32" ? "win-x86" : "win-x64";
    }

    throw new Error(`Unsupported platform: ${osType}, ${process.arch}`);
  }

  getBinaryPath(baseDirectory: string): string {
    const platform = this.getPlatform();
    const binaryName = platform.startsWith("win") ? "TSQLLint.Console.exe" : "TSQLLint.Console";
    return `${baseDirectory}/${platform}/${binaryName}`;
  }

  getTempDirectory(): string {
    return os.tmpdir();
  }
}
