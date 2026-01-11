import * as fs from "fs";
import * as path from "path";

export interface IFileSystemAdapter {
  exists(filePath: string): Promise<boolean>;
  createDirectory(dirPath: string): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  deleteFile(filePath: string): Promise<void>;
  createWriteStream(filePath: string): fs.WriteStream;
  createReadStream(filePath: string): fs.ReadStream;
}

export class NodeFileSystemAdapter implements IFileSystemAdapter {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, "utf-8");
  }

  async readFile(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString("utf-8");
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
  }

  createWriteStream(filePath: string): fs.WriteStream {
    return fs.createWriteStream(filePath);
  }

  createReadStream(filePath: string): fs.ReadStream {
    return fs.createReadStream(filePath);
  }
}
