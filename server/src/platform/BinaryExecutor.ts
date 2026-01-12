import { spawn, ChildProcess } from "child_process";

export interface IBinaryExecutor {
  execute(binaryPath: string, args: string[]): Promise<string[]>;
}

export class NodeBinaryExecutor implements IBinaryExecutor {
  async execute(binaryPath: string, args: string[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      let childProcess: ChildProcess;

      try {
        childProcess = spawn(binaryPath, args);
      } catch (error) {
        reject(error);
        return;
      }

      let result = "";

      childProcess.stdout?.on("data", (data: Buffer) => {
        result += data.toString();
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        console.log(`stderr: ${data.toString()}`);
      });

      childProcess.on("close", (code: number) => {
        if (code === 0) {
          const lines = result.split("\n");
          const resultsArr: string[] = [];

          lines.forEach(element => {
            const index = element.indexOf("(");
            if (index > 0) {
              resultsArr.push(element.substring(index, element.length - 1));
            }
          });

          resolve(resultsArr);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      childProcess.on("error", reject);
    });
  }
}
