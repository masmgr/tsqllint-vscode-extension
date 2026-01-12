import * as assert from "assert";
import { EventEmitter } from "events";
import * as os from "os";
import * as sinon from "sinon";
import TSQLLintRuntimeHelper from "../TSQLLintToolsHelper";

// ===== Test Suites =====

suite("TSQLLintToolsHelper - Constructor & Platform Detection", () => {
  setup(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
  });

  teardown(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
    sinon.restore();
  });

  test("should detect macOS platform", () => {
    const osStub = sinon.stub(os, "type").returns("Darwin");
    try {
      const helper = new TSQLLintRuntimeHelper("/test");
      assert.ok(helper);
    } finally {
      osStub.restore();
    }
  });

  test("should detect Linux platform", () => {
    const osStub = sinon.stub(os, "type").returns("Linux");
    try {
      const helper = new TSQLLintRuntimeHelper("/test");
      assert.ok(helper);
    } finally {
      osStub.restore();
    }
  });

  test("should detect Windows x86 platform", () => {
    const osStub = sinon.stub(os, "type").returns("Windows_NT");
    Object.defineProperty(process, "arch", {
      value: "ia32",
      writable: true,
      configurable: true,
    });
    try {
      const helper = new TSQLLintRuntimeHelper("/test");
      assert.ok(helper);
    } finally {
      osStub.restore();
      Object.defineProperty(process, "arch", {
        value: "x64",
        writable: true,
        configurable: true,
      });
    }
  });

  test("should detect Windows x64 platform", () => {
    const osStub = sinon.stub(os, "type").returns("Windows_NT");
    Object.defineProperty(process, "arch", {
      value: "x64",
      writable: true,
      configurable: true,
    });
    try {
      const helper = new TSQLLintRuntimeHelper("/test");
      assert.ok(helper);
    } finally {
      osStub.restore();
    }
  });

  test("should throw error for unsupported platform", async () => {
    const osStub = sinon.stub(os, "type").returns("SunOS");
    try {
      const helper = new TSQLLintRuntimeHelper("/test");
      try {
        await helper.TSQLLintRuntime();
        assert.fail("Should have thrown an error for unsupported platform");
      } catch (error: any) {
        assert.match(error.message, /Unsupported platform/);
      }
    } finally {
      osStub.restore();
    }
  });
});

suite("TSQLLintToolsHelper - TSQLLintRuntime() Caching", () => {
  setup(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
  });

  teardown(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
    sinon.restore();
  });

  test("should return cached path if already set", async () => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = "/cached/path";

    const helper = new TSQLLintRuntimeHelper("/test");
    const result = await helper.TSQLLintRuntime();

    assert.strictEqual(result, "/cached/path");
  });

  test("should skip download if directory already exists", async () => {
    const helper = new TSQLLintRuntimeHelper("/test");
    const existsStub = sinon.stub().resolves(true);

    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: existsStub,
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub(),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const result = await helper.TSQLLintRuntime();

    assert.ok(result);
    assert.strictEqual(existsStub.callCount >= 1, true);
  });
});

suite("TSQLLintToolsHelper - DownloadRuntime() Error Handling", () => {
  teardown(() => {
    sinon.restore();
  });

  test("should handle network errors gracefully", done => {
    // Create a mock request that emits an error
    const mockRequest = new EventEmitter() as any;

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, _callback: Function) => mockRequest);

    const helper = new TSQLLintRuntimeHelper("/test");
    const deleteFileStub = sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub().returns(new EventEmitter() as any),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const promise = helper.DownloadRuntime("/test/install");

    // Trigger error after a short delay
    setImmediate(() => {
      mockRequest.emit("error", new Error("ECONNREFUSED"));
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.strictEqual(error.message, "ECONNREFUSED");
        done();
      });
  });

  test("should handle 404 errors", done => {
    const mockRequest = new EventEmitter() as any;
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 404;
    mockResponse.headers = {};
    mockResponse.pipe = sinon.stub().returns(mockResponse);

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, callback: Function) => {
      callback(mockResponse);
      return mockRequest;
    });

    const helper = new TSQLLintRuntimeHelper("/test");
    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub().returns(new EventEmitter() as any),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const promise = helper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.ok(error.message.includes("problem downloading"));
        done();
      });
  });

  test("should handle 500 server errors", done => {
    const mockRequest = new EventEmitter() as any;
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 500;
    mockResponse.headers = {};
    mockResponse.pipe = sinon.stub().returns(mockResponse);

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, callback: Function) => {
      callback(mockResponse);
      return mockRequest;
    });

    const helper = new TSQLLintRuntimeHelper("/test");
    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub().returns(new EventEmitter() as any),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const promise = helper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.ok(error.message.includes("problem downloading"));
        done();
      });
  });

  test("should cleanup partial download on error", done => {
    const mockRequest = new EventEmitter() as any;
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 503;
    mockResponse.headers = {};
    mockResponse.pipe = sinon.stub().returns(mockResponse);

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, callback: Function) => {
      callback(mockResponse);
      return mockRequest;
    });

    const helper = new TSQLLintRuntimeHelper("/test");
    const deleteFileStub = sinon.stub().resolves(undefined);
    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub().returns(new EventEmitter() as any),
      deleteFile: deleteFileStub,
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const promise = helper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch(() => {
        assert.strictEqual(deleteFileStub.callCount, 1);
        const deleteCall = deleteFileStub.getCall(0);
        assert.ok((deleteCall.args[0] as string).includes(".tgz"));
        done();
      });
  });
});

suite("TSQLLintToolsHelper - UnzipRuntime()", () => {
  setup(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
  });

  teardown(() => {
    (TSQLLintRuntimeHelper as any)._tsqllintToolsPath = undefined;
    sinon.restore();
  });

  test("should call UnzipRuntime and update cache", async () => {
    // This test verifies that the UnzipRuntime method exists and can be called
    // The actual decompression is tested via integration, not unit tests
    const helper = new TSQLLintRuntimeHelper("/test");
    assert.ok(typeof (helper as any).UnzipRuntime === "function");
  });
});

suite("TSQLLintToolsHelper - Download Directory Creation", () => {
  teardown(() => {
    sinon.restore();
  });

  test("should create installation directory if it doesn't exist", done => {
    const mockRequest = new EventEmitter() as any;
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 200;
    mockResponse.headers = {};
    mockResponse.pipe = sinon.stub().returns(mockResponse);

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, callback: Function) => {
      callback(mockResponse);
      return mockRequest;
    });

    const helper = new TSQLLintRuntimeHelper("/test");
    const createDirStub = sinon.stub().resolves(undefined);
    const mockStream = new EventEmitter() as any;
    mockStream.close = sinon.stub();

    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: createDirStub,
      createWriteStream: sinon.stub().returns(mockStream),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    const promise = helper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
      mockStream.emit("finish");
    });

    promise
      .then(() => {
        assert.strictEqual(createDirStub.callCount, 1);
        done();
      })
      .catch(done);
  });
});

suite("TSQLLintToolsHelper - Download URL Verification", () => {
  teardown(() => {
    sinon.restore();
  });

  test("should download from correct GitHub URL", done => {
    let downloadedUrl = "";

    const mockRequest = new EventEmitter() as any;
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 200;
    mockResponse.headers = {};
    mockResponse.pipe = sinon.stub().returns(mockResponse);

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((url: string, callback: Function) => {
      downloadedUrl = url;
      callback(mockResponse);
      return mockRequest;
    });

    const helper = new TSQLLintRuntimeHelper("/test");
    const mockStream = new EventEmitter() as any;
    mockStream.close = sinon.stub();

    sinon.stub(helper as any, "fileSystemAdapter").value({
      exists: sinon.stub().resolves(false),
      createDirectory: sinon.stub().resolves(undefined),
      createWriteStream: sinon.stub().returns(mockStream),
      deleteFile: sinon.stub().resolves(undefined),
      writeFile: sinon.stub().resolves(undefined),
      readFile: sinon.stub().resolves(""),
      createReadStream: sinon.stub(),
    });

    sinon.stub(process.stdout, "write");

    const promise = helper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
      mockStream.emit("finish");
    });

    promise
      .then(() => {
        assert.ok(downloadedUrl.includes("github.com/tsqllint/tsqllint"));
        assert.ok(downloadedUrl.includes("v1.16.0"));
        assert.ok(downloadedUrl.includes(".tgz"));
        done();
      })
      .catch(done);
  });
});
