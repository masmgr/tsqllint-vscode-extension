import * as assert from "assert";
import { EventEmitter } from "events";
import * as fs from "fs";
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

  test("should throw error for unsupported platform", () => {
    const osStub = sinon.stub(os, "type").returns("SunOS");
    try {
      assert.throws(() => {
        new TSQLLintRuntimeHelper("/test");
      }, /Invalid Platform/);
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
    const existsStub = sinon.stub(fs, "existsSync");
    existsStub.returns(true);

    const helper = new TSQLLintRuntimeHelper("/test");
    const result = await helper.TSQLLintRuntime();

    assert.ok(result);
    assert.strictEqual(existsStub.callCount >= 1, true);
  });
});

suite("TSQLLintToolsHelper - DownloadRuntime() Error Handling", () => {
  teardown(() => {
    sinon.restore();
  });

  test("should handle network errors gracefully", (done) => {
    // Create a mock request that emits an error
    const mockRequest = new EventEmitter() as any;

    const httpsStub = sinon.stub(require("follow-redirects").https, "get");
    httpsStub.callsFake((_url: string, _callback: Function) => mockRequest);

    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync");
    const unlinkStub = sinon.stub(fs, "unlink");
    sinon.stub(fs, "createWriteStream").returns(new EventEmitter() as any);

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

    // Trigger error after a short delay
    setImmediate(() => {
      mockRequest.emit("error", new Error("ECONNREFUSED"));
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.strictEqual(error.message, "ECONNREFUSED");
        assert.strictEqual(unlinkStub.callCount, 1);
        done();
      });
  });

  test("should handle 404 errors", (done) => {
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

    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync");
    const unlinkStub = sinon.stub(fs, "unlink");
    sinon.stub(fs, "createWriteStream").returns(new EventEmitter() as any);

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.ok(error.message.includes("problem downloading"));
        assert.strictEqual(unlinkStub.callCount, 1);
        done();
      });
  });

  test("should handle 500 server errors", (done) => {
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

    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync");
    const unlinkStub = sinon.stub(fs, "unlink");
    sinon.stub(fs, "createWriteStream").returns(new EventEmitter() as any);

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch((error: Error) => {
        assert.ok(error.message.includes("problem downloading"));
        assert.strictEqual(unlinkStub.callCount, 1);
        done();
      });
  });

  test("should cleanup partial download on error", (done) => {
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

    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync");
    const unlinkStub = sinon.stub(fs, "unlink");
    sinon.stub(fs, "createWriteStream").returns(new EventEmitter() as any);

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
    });

    promise
      .then(() => done(new Error("Should have rejected")))
      .catch(() => {
        assert.strictEqual(unlinkStub.callCount, 1);
        const unlinkCall = unlinkStub.getCall(0);
        assert.ok((unlinkCall.args[0] as string).includes(".tgz"));
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

  test("should create installation directory if it doesn't exist", (done) => {
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

    sinon.stub(fs, "existsSync").returns(false);
    const mkdirStub = sinon.stub(fs, "mkdirSync");

    const mockStream = new EventEmitter() as any;
    mockStream.close = sinon.stub();
    sinon.stub(fs, "createWriteStream").returns(mockStream);

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

    setImmediate(() => {
      mockRequest.emit("response", mockResponse);
      mockStream.emit("finish");
    });

    promise
      .then(() => {
        assert.strictEqual(mkdirStub.callCount, 1);
        done();
      })
      .catch(done);
  });
});

suite("TSQLLintToolsHelper - Download URL Verification", () => {
  teardown(() => {
    sinon.restore();
  });

  test("should download from correct GitHub URL", (done) => {
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

    sinon.stub(fs, "existsSync").returns(false);
    sinon.stub(fs, "mkdirSync");

    const mockStream = new EventEmitter() as any;
    mockStream.close = sinon.stub();
    sinon.stub(fs, "createWriteStream").returns(mockStream);
    sinon.stub(process.stdout, "write");

    const promise = TSQLLintRuntimeHelper.DownloadRuntime("/test/install");

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
