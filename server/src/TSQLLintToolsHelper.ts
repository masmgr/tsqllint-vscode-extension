"use strict";

import { NodePlatformAdapter } from "./platform/PlatformAdapter";
import { NodeFileSystemAdapter, IFileSystemAdapter } from "./platform/FileSystemAdapter";
// tslint:disable-next-line:no-var-requires
const https = require("follow-redirects").https;
// tslint:disable-next-line:no-var-requires
const decompress = require("decompress");
// tslint:disable-next-line:no-var-requires
const decompressTargz = require("decompress-targz");

export default class TSQLLintRuntimeHelper {
  private platformAdapter: NodePlatformAdapter = new NodePlatformAdapter();
  private fileSystemAdapter: IFileSystemAdapter = new NodeFileSystemAdapter();

  public DownloadRuntime(installDirectory: string): Promise<string> {
    const version = TSQLLintRuntimeHelper._tsqllintVersion;
    const platform = this.platformAdapter.getPlatform();
    const urlBase: string = `https://github.com/tsqllint/tsqllint/releases/download/${version}`;
    const downloadUrl: string = `${urlBase}/${platform}.tgz`;
    const downloadFilePath: string = `${installDirectory}/${platform}.tgz`;
    const downloadPath: string = `${installDirectory}/${platform}.tgz`;

    return new Promise((resolve, reject) => {
      console.log(`Installing TSQLLint Runtime: ${downloadUrl}`);
      this.fileSystemAdapter.createDirectory(installDirectory).then(() => {
        const file = this.fileSystemAdapter.createWriteStream(downloadFilePath);
        https
          .get(downloadUrl, (response: any) => {
            const length = Number(response.headers["content-length"]);
            response.pipe(file);
            process.stdout.write("Downloading...");

            if (!isNaN(length)) {
              process.stdout.write(" [");
              const max = 60;
              let char = 0;
              let bytes = 0;
              response.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                const fill = Math.ceil((bytes / length) * max);
                for (let i = char; i < fill; i++) {
                  process.stdout.write("=");
                }
                char = fill;
              });
              response.on("end", () => process.stdout.write("]\n"));
            }
            file.on("finish", () => {
              file.close();
              resolve(downloadPath);
            });
          })
          .on("response", (res: any) => {
            if (res.statusCode !== 200) {
              this.fileSystemAdapter.deleteFile(downloadPath).catch(() => {});
              return reject(
                new Error(`There was a problem downloading the TSQLLint Runtime. Reload VS Code to try again`)
              );
            }
          })
          .on("error", (err: Error) => {
            this.fileSystemAdapter.deleteFile(downloadPath).catch(() => {});
            reject(err);
          });
      }).catch(reject);
    });
  }

  private static _tsqllintVersion: string = "v1.16.0";
  private static _applicationRootDirectory: string;
  private static _tsqllintToolsPath: string;

  constructor(applicationRootDirectory: string) {
    TSQLLintRuntimeHelper._applicationRootDirectory = applicationRootDirectory;
  }

  public async TSQLLintRuntime(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (TSQLLintRuntimeHelper._tsqllintToolsPath) {
        return resolve(TSQLLintRuntimeHelper._tsqllintToolsPath);
      }

      const tsqllintInstallDirectory: string = `${TSQLLintRuntimeHelper._applicationRootDirectory}/tsqllint`;
      const platform = this.platformAdapter.getPlatform();
      this.fileSystemAdapter.exists(`${tsqllintInstallDirectory}/${platform}`).then(exists => {
        if (exists) {
          TSQLLintRuntimeHelper._tsqllintToolsPath = tsqllintInstallDirectory;
          return resolve(TSQLLintRuntimeHelper._tsqllintToolsPath);
        }

        const download: Promise<string> = this.DownloadRuntime(tsqllintInstallDirectory);

        download
          .then((path: string) => this.UnzipRuntime(path, tsqllintInstallDirectory))
          .then((installDir: string) => {
            console.log("Installation of TSQLLint Runtime Complete");
            return resolve(installDir);
          })
          .catch((error: Error) => reject(error));
      }).catch(reject);
    });
  }

  private UnzipRuntime(path: string, tsqllintInstallDirectory: string) {
    return new Promise((resolve, reject) => {
      decompress(path, `${tsqllintInstallDirectory}`, {
        plugins: [decompressTargz()],
      })
        .then(() => {
          TSQLLintRuntimeHelper._tsqllintToolsPath = tsqllintInstallDirectory;
          return resolve(tsqllintInstallDirectory);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }
}
