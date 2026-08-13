# Romance

Romance is a declarative, bidirectional binary serialization framework designed for ROM hacking and complex binary data transformation workflows.

## The Problem
Standard ROM hacking tools are often brittle, hard-coded, and difficult to extend. They lack the ability to handle complex, nested binary structures symmetrically.

## The Solution: Romance
Romance introduces a schema-driven approach that separates binary definition from execution.
- **Bidirectional:** Transform binary data into human-readable formats and back again with guaranteed round-trip integrity.
- **Declarative:** Define structures using a modular, type-safe schema system.
- **Extensible:** Create custom types and hooks without modifying the core framework.
- **Architecture First:** Designed with distinct layers (CLI, API, Project, Engine) to separate concerns and ensure testability.

## Architecture
Romance is built on a clear separation of concerns:
- **CLI:** A robust command-line interface for common operations.
- **Romance API:** The primary entry point for programmatic usage.
- **Project:** Manages resources, schemas, and configurations.
- **Engine:** The execution core that handles schema compilation and traversal.
- **Type Graph:** The executable representation of binary structures.

## Status
Romance is currently under active development. The core engine is undergoing a TypeScript migration to improve type safety and maintainability.

## Documentation
See the [Documentation Guide](docs/README.md) for more details.
