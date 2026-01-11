# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that integrates TSQLLint (a T-SQL linter) into VS Code. The extension uses the Language Server Protocol (LSP) with a client-server architecture.

## Build and Development Commands

```bash
# Install dependencies for all packages
npm run postinstall

# Compile both client and server
npm run compile

# Compile individual components
npm run compile:client
npm run compile:server

# Watch mode for development
npm run watch:client
npm run watch:server

# Lint the codebase
npm run lint

# Build for VS Code marketplace
npm run vscode:prepublish
```

## Architecture

### Client-Server Architecture with Boundary Modules

This extension follows the Language Server Protocol pattern with abstraction layers that isolate framework dependencies. This architecture enables safe upgrades of vscode-languageclient and VS Code API without requiring changes to business logic.

```
┌─────────────────────────────────────────┐
│  VS Code API (window, workspace, etc)  │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────▼────────────┐
         │ EditorService        │
         │ ProtocolConverter    │
         │ (Boundary Layer)     │
         └──────────┬───────────┘
                    │
      ┌─────────────▼────────────┐
      │  extension.ts (40 lines) │
      │  Business Logic          │
      └──────────────┬───────────┘
                     │
      ┌──────────────▼───────────────┐
      │ LanguageServerManager        │
      │ (vscode-languageclient wrap) │
      └──────────────┬───────────────┘
                     │
              [IPC Communication]
                     │
      ┌──────────────▼────────────┐
      │ LSP Connection & LSP Types│
      │ (Server-Side)            │
      └────────────────────────────┘
```

**Client** ([client/src/extension.ts](client/src/extension.ts))
- Entry point: `activate()` function (40 lines vs previous 69)
- Initializes Language Server via `LanguageServerManager` (boundary module)
- Registers command: `tsqlLint.fix` (auto-fix command)
- Uses `EditorService` for all VS Code API interactions
- No direct dependencies on vscode-languageclient internals

**Client Boundary Modules:**
- [client/src/lsp/LanguageServerManager.ts](client/src/lsp/LanguageServerManager.ts) - Wraps vscode-languageclient lifecycle
- [client/src/vscode/EditorService.ts](client/src/vscode/EditorService.ts) - Abstracts VS Code window/workspace APIs
- [client/src/lsp/ProtocolConverter.ts](client/src/lsp/ProtocolConverter.ts) - Isolates protocol conversion (protocol2CodeConverter usage)

**Server** ([server/src/server.ts](server/src/server.ts))
- Runs as a separate process communicating via IPC
- Handles document validation by spawning TSQLLint.Console
- Manages diagnostics and code actions
- Processes fix requests (`fix` notification)
- Implements auto-fix on save when `tsqlLint.autoFixOnSave` is enabled

**Server Boundary Modules:**
- [server/src/lsp/LSPConnectionAdapter.ts](server/src/lsp/LSPConnectionAdapter.ts) - Wraps vscode-languageserver connection (encapsulates WorkspaceEdit quirks)
- [server/src/lsp/DocumentManager.ts](server/src/lsp/DocumentManager.ts) - Manages document lifecycle
- [server/src/validation/DiagnosticConverter.ts](server/src/validation/DiagnosticConverter.ts) - Converts errors to diagnostics

**Platform Abstraction Layer:**
- [server/src/platform/PlatformAdapter.ts](server/src/platform/PlatformAdapter.ts) - Detects OS and architecture (osx-x64, linux-x64, win-x86, win-x64)
- [server/src/platform/FileSystemAdapter.ts](server/src/platform/FileSystemAdapter.ts) - Async file operations (replaces sync calls)
- [server/src/platform/BinaryExecutor.ts](server/src/platform/BinaryExecutor.ts) - Spawns TSQLLint.Console binary

### Key Server Components

**TSQLLintToolsHelper** ([server/src/TSQLLintToolsHelper.ts](server/src/TSQLLintToolsHelper.ts))
- Downloads and manages the TSQLLint runtime binaries (v1.11.0)
- Uses `PlatformAdapter` for OS detection
- Uses `FileSystemAdapter` for file operations
- Uses `BinaryExecutor` for spawning processes
- Caches binaries in `<extension-root>/tsqllint/`

**Validation Flow** ([server/src/server.ts](server/src/server.ts))
1. Document change triggers validation via `DocumentManager`
2. Creates temporary file using `FileSystemAdapter`
3. Spawns TSQLLint.Console via `BinaryExecutor` with platform detection by `PlatformAdapter`
4. Parses stdout for error messages (`parseErrors()` from [server/src/parseError.ts](server/src/parseError.ts))
5. Converts errors to diagnostics via `DiagnosticConverter`
6. Sends diagnostics to client via `LSPConnectionAdapter`
7. Cleans up temporary file via `FileSystemAdapter`

**Commands** ([server/src/commands.ts](server/src/commands.ts))
- Generates code actions for each diagnostic
- Creates "Disable rule for this line" actions (wraps with `/* tsqllint-disable rulename */`)
- Creates "Disable rule for this file" actions (adds comment at top of file)
- Code actions are triggered when user clicks on diagnostics

**Error Parsing** ([server/src/parseError.ts](server/src/parseError.ts))
- Parses TSQLLint output format: `(line,col): rule: message`
- Converts to LSP Range objects
- Highlights entire line from first non-whitespace to end

### Boundary Module Benefits

The boundary module architecture provides:

1. **Framework Isolation**: Changes to vscode-languageclient or VS Code APIs are contained to boundary modules
2. **Testability**: Business logic can be tested independently without framework dependencies
3. **Portability**: Potential support for other editors (Theia, VS Code Web) by implementing alternative adapters
4. **Maintainability**: Clear separation of concerns reduces cognitive load
5. **Future-Proof**: Safe version upgrades without rewriting core logic

**Example**: Upgrading vscode-languageclient from v7 to v9 would only require changes to:
- `LanguageServerManager.ts`
- `LSPConnectionAdapter.ts`
- (Remaining ~200 lines of code unchanged)

### Configuration

Extension contributes two settings:
- `tsqlLint.trace.server`: Debug LSP communication (off/messages/verbose)
- `tsqlLint.autoFixOnSave`: Auto-fix errors on save (default: false)

Command: `tsqlLint.fix` - Manually trigger auto-fix
- Keybinding: Ctrl+Alt+F (Windows/Linux), Shift+Cmd+F (macOS)

### Build Output

TypeScript compiles to:
- `client/out/` - Client code
- `server/out/` - Server code (specifically `server/out/server.js` is the entry point)

Both use ES2020 target with CommonJS modules.

## Important Implementation Details

### Text Edits (LSPConnectionAdapter.ts:36-46)

When applying workspace edits, use `{ uri, version }` identifier format instead of passing the full TextDocument object to `TextDocumentEdit.create()`. Passing TextDocument will cause vague "Unknown workspace edit change received" errors. This quirk is now encapsulated in `LSPConnectionAdapter.applyWorkspaceEdit()` to prevent future developers from encountering the same issue.

### Platform-Specific Binary Spawning

The server spawns different TSQLLint.Console binaries based on platform detection in `BinaryExecutor.execute()`. Platform detection is abstracted via `PlatformAdapter.getPlatform()`:
- **macOS**: `osx-x64/TSQLLint.Console`
- **Linux**: `linux-x64/TSQLLint.Console`
- **Windows x86**: `win-x86/TSQLLint.Console.exe`
- **Windows x64**: `win-x64/TSQLLint.Console.exe`

### Auto-Fix Flow

When fix is requested (manual or on save):
1. `LintBuffer()` is called with `-x` flag
2. TSQLLint modifies the temporary file in-place
3. Server reads the fixed content from temp file
4. Returns entire document replacement as TextEdit (lines 0-10000)
5. Applied via workspace edit or willSaveWaitUntil

### Code Style

- ESLint configured with TypeScript ESLint plugin
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Prefer arrow functions
- Max line length: 120 characters

## Testing

### Test Categories

#### Unit Tests (`npm run test:unit`)
- **Location:** `server/src/__tests__/*.test.ts`
- **Framework:** Mocha (TDD interface)
- **Characteristics:**
  - Fast, isolated tests with mocking (Sinon)
  - No external dependencies or binary downloads
  - Runs in < 10 seconds
  - No VS Code environment required
- **Test Files:**
  - `parseError.test.ts` - Error parsing logic (T-SQL output format parsing)
  - `commands.test.ts` - Code action generation (disable rules, edit formatting)
  - `TSQLLintToolsHelper.test.ts` - Platform detection and download logic (all network calls mocked)
  - `smoke.test.ts` - Basic sanity checks

#### Integration Tests (`npm run test:integration`)
- **Location:** `client/src/test/suite/*.test.ts`
- **Framework:** Mocha with VS Code Test API
- **Characteristics:**
  - Tests VS Code extension infrastructure
  - Requires VS Code test environment (vscode-test)
  - No TSQLLint binary required
  - Uses xvfb on Linux/CI environments
- **Test Files:**
  - `extension.test.ts` - Extension activation, command registration, configuration handling

#### CI Tests (`npm run test:ci`)
- Runs both unit and integration tests
- All tests complete in < 30 seconds
- No binary downloads required
- Runs in CI/CD pipeline (GitHub Actions)

### Running Tests

```bash
# Run all CI tests (unit + integration)
npm test
npm run test:ci

# Run only unit tests (fast, no VS Code)
npm run test:unit
npm run test:unit:watch       # Watch mode for development

# Run only integration tests (VS Code environment)
npm run test:integration

# Legacy aliases (backwards compatible)
npm run test:server           # Alias for test:unit
npm run test:server:watch     # Alias for test:unit:watch
npm run test:smoke            # Alias for test:integration
npm run test:all              # Alias for test:ci
```

### Test Configuration

**Server Tests** ([server/.mocharc.js](server/.mocharc.js))
- Uses Mocha with TDD interface (suite/test)
- Timeout: 10 seconds
- Reporter: spec (verbose output)
- Test discovery: `out/__tests__/*.test.js` (compiled from TypeScript)

**Client Tests** ([.vscode-test.js](.vscode-test.js))
- Uses VS Code Test CLI with Mocha
- Timeout: 20 seconds
- Launches VS Code with disabled extensions
- Test discovery: `client/out/test/**/*.test.js` (compiled from TypeScript)

### Test Dependencies

- **Mocha:** Test framework (10.8.2)
- **Sinon:** Mocking and stubbing (19.0.2)
- **VS Code Test CLI:** Client test runner (0.0.10)
- **VS Code Test Electron:** VS Code test environment (2.4.1)

### Adding New Tests

1. **Unit Tests:** Create `.test.ts` file in `server/src/__tests__/` directory
   - Use Mocha TDD interface (`suite()`, `test()`, `setup()`, `teardown()`)
   - Use Sinon for mocking external dependencies
   - Keep tests fast and isolated

2. **Integration Tests:** Create `.test.ts` file in `client/src/test/suite/` directory
   - Use VS Code API for testing extension behavior
   - Use Mocha TDD interface
   - Keep timeout reasonable (20-30 seconds max per test)

3. **E2E Tests:** Create `.test.ts` file in `client/src/test/e2e/suite/` directory
   - Use VS Code Test API (like integration tests)
   - Use Mocha TDD interface
   - Allows actual TSQLLint binary download and execution
   - First run includes binary download (~2 minutes)
   - Subsequent runs use cached binary (~30 seconds)
   - Local execution only, not included in CI

### E2E Tests Details

**Location:** `client/src/test/e2e/suite/e2e.test.ts`

**Characteristics:**
- Downloads actual TSQLLint v1.11.0 binary on first run
- Tests complete validation flow end-to-end
- Uses SQL fixture files with known linting errors
- Tests are run locally only (development/pre-release verification)
- First run: ~2 minutes (includes binary download from GitHub)
- Subsequent runs: ~30 seconds (binary cached in `server/out/tsqllint/`)

**Test Fixtures:** `client/src/test/e2e/fixtures/*.sql`
- `valid.sql` - Clean SQL with no errors
- `select-star.sql` - SELECT * rule violation
- `semi-colon.sql` - Missing semicolon
- `keyword-capitalization.sql` - Lowercase keywords
- `multiple-errors.sql` - Multiple rule violations
- `with-disable-comment.sql` - Inline disable comments

**Test Coverage:**
- Binary download and caching mechanisms
- Extension activation on SQL file opening
- Basic linting flow and validation
- Error detection for common TSQLLint rules
- Diagnostic generation and display
- Document change handling and re-validation
- Code actions (disable rules)
- Inline disable comments

**Running E2E Tests:**
```bash
npm run test:e2e         # Standard execution
npm run test:e2e:verbose # Verbose output with all test names
```

**Helper Functions:**
- `waitForDiagnostics()` - Wait for diagnostics with timeout
- `waitForNoDiagnostics()` - Wait for diagnostics to clear
- `getFixtureUri()` - Get URI for fixture SQL file
- `openFixture()` - Open fixture file and wait for validation
- `assertDiagnosticForRule()` - Assert diagnostic exists for specific rule

### Notes on Test Design

- **No TSQLLint binary downloads in CI:** All download/network operations are mocked using Sinon
- **No platform-specific CI tests:** Server tests mock platform detection to be OS-independent
- **Full coverage without external dependencies:** Tests focus on logic and integration patterns, not on external tool functionality
- **E2E tests are local-only:** E2E tests require actual binary download and are not run in CI pipeline to maintain fast feedback loops
