import * as assert from "assert";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { NodeBinaryExecutor } from "../platform/BinaryExecutor";

suite("BinaryExecutor", () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("should execute binary and return parsed results", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const promise = executor.execute("/path/to/binary", ["arg1"]);

    // Emit close immediately to test without data
    process.nextTick(() => {
      mockChildProcess.emit("close");
    });

    const result = await promise;

    assert.strictEqual(result.length, 0);
  });

  test("should use default timeout of 30 seconds", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const clock = sandbox.useFakeTimers();

    const promise = executor.execute("/path/to/binary", ["arg1"]);

    // Fast-forward 30 seconds
    clock.tick(30000);

    try {
      await promise;
      assert.fail("Should have timed out");
    } catch (error: any) {
      assert.strictEqual(error.message, "Binary execution timed out after 30000ms");
    }
  });

  test("should use custom timeout when provided", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const clock = sandbox.useFakeTimers();

    const promise = executor.execute("/path/to/binary", ["arg1"], 5000);

    // Fast-forward 5 seconds
    clock.tick(5000);

    try {
      await promise;
      assert.fail("Should have timed out");
    } catch (error: any) {
      assert.strictEqual(error.message, "Binary execution timed out after 5000ms");
    }
  });

  test("should kill process on timeout", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const clock = sandbox.useFakeTimers();

    const promise = executor.execute("/path/to/binary", ["arg1"], 5000);

    // Fast-forward 5 seconds
    clock.tick(5000);

    try {
      await promise;
      assert.fail("Should have timed out");
    } catch (error: any) {
      assert(mockChildProcess.kill.called, "kill() should have been called");
    }
  });

  test("should reject on spawn error", async () => {
    const spawnError = new Error("Spawn failed");
    sandbox.stub(require("child_process"), "spawn").throws(spawnError);

    const executor = new NodeBinaryExecutor();

    try {
      await executor.execute("/path/to/binary", ["arg1"]);
      assert.fail("Should have thrown an error");
    } catch (error: any) {
      assert.strictEqual(error.message, "Spawn failed");
    }
  });

  test("should reject on process error", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const processError = new Error("Process error");

    const promise = executor.execute("/path/to/binary", ["arg1"]);

    setImmediate(() => {
      mockChildProcess.emit("error", processError);
    });

    try {
      await promise;
      assert.fail("Should have thrown an error");
    } catch (error: any) {
      assert.strictEqual(error.message, "Process error");
    }
  });

  test("should clear timeout on successful completion", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const clock = sandbox.useFakeTimers();

    const promise = executor.execute("/path/to/binary", ["arg1"], 5000);

    // Emit close event before timeout
    setImmediate(() => {
      mockChildProcess.emit("close");
    });

    clock.tick(0);

    await promise;
    assert(mockChildProcess.kill.notCalled, "kill() should not have been called");
  });

  test("should handle empty stdout", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const promise = executor.execute("/path/to/binary", ["arg1"]);

    // No stdout data
    setImmediate(() => {
      mockChildProcess.emit("close");
    });

    const result = await promise;

    assert.strictEqual(result.length, 0);
  });

  test("should handle process error after resolution", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = sandbox.stub();

    sandbox.stub(require("child_process"), "spawn").returns(mockChildProcess);

    const executor = new NodeBinaryExecutor();
    const promise = executor.execute("/path/to/binary", ["arg1"]);

    // Emit close first, then error (should not affect result)
    setImmediate(() => {
      mockChildProcess.emit("close");
      mockChildProcess.emit("error", new Error("Error after close"));
    });

    const result = await promise;

    assert.strictEqual(result.length, 0);
  });

});
