#!/usr/bin/env node

/* global console,process */

import * as path from "node:path";
import * as fs from "node:fs";
import { parseArgs } from 'node:util';
import { Romance } from './romance.js';
import { align } from './lib/log.js';

const CLI_NAME = 'romance';

type Dict <T = unknown> = Record<string, T>;
type FilePath = string & { readonly __brand: "FilePath" };
type RealPath = string & { readonly __brand: "RealPath" };
type ArgValue = string | boolean;
type CliInput = Dict<ArgValue | undefined>;

class Parser <T> {
  constructor (
    public readonly type: 'string' | 'boolean',
    public readonly parse: (value: ArgValue) => T,
  ) {}
}

const parsers = {
  string: new Parser('string', (value: ArgValue): string => {
    if (typeof value !== 'string') {
      throw new Error(`Value ${value} is not a string`);
    }
    return value;
  }),
  boolean: new Parser('boolean', (value: ArgValue): boolean => {
    if (typeof value !== 'boolean') {
      throw new Error(`Value ${value} is not a boolean`);
    }
    return value;
  }),
  file_path: new Parser('string', (value: ArgValue): FilePath => {
    const directory = path.dirname(String(value));
    const is_directory = fs.statSync(directory).isDirectory();
    if (!is_directory) {
      throw new Error(`String ${value} is not a valid FilePath`);
    }
    return value as FilePath;
  }),
  real_path: new Parser('string', (value: ArgValue): RealPath => {
    if (!fs.statSync(String(value)).isFile()) {
      throw new Error(`No file exists as path ${value}`);
    }
    return value as RealPath;
  })
};

class Option <T extends ArgValue = ArgValue> {
  readonly name: string;
  readonly description: string;
  readonly parser: Parser<T>;
  readonly letter: string;

  constructor (input: {
    name: string;
    description: string;
    parser: Parser<T>;
    letter: string;
  }) {
    this.name = input.name;
    this.description = input.description;
    this.parser = input.parser;
    this.letter = input.letter;
  }

  get type () {
    return this.parser.type;
  }

  toString () {
    return `[${this.constructor.name}: ${this.name}]`;
  }

  parse (input: CliInput, fallback: ArgValue | undefined): T | undefined {
    const value = input[this.name] ?? fallback ?? undefined;
    return value == null ? value : this.parser.parse(value);
  }

  format (value: T | undefined): string {
    return (value == null
      ? ''
      : (typeof value === 'boolean'
        ? `-${this.letter}`
        : `-${this.letter} ${value}`
      )
    );
  }
}

class OptionBinding <
  T extends ArgValue = ArgValue,
  R extends boolean = boolean
> {
  readonly option: Option<T>;
  readonly required: R | true;
  readonly fallback: ArgValue | undefined;

  constructor (input: {
    option: Option<T>;
    required?: R;
    fallback?: ArgValue;
  }) {
    this.option = input.option;
    this.required = input.required ?? true;
    this.fallback = input.fallback ?? undefined;
  }

  get meta () {
    return {
      name: this.option.name,
      type: this.option.type,
      short: this.option.letter,
      default: this.fallback
    };
  }

  get help (): [string, string] {
    const left_col = `-${this.option.letter}, --${this.option.name} <${this.option.type}>`;
    const mode = !this.required ? 'optional'
      : this.fallback != null ? `default: ${this.fallback}`
      : 'required';
    const right_col = `${this.option.description} [${mode}]`;
    return [left_col, right_col];
  }

  format (value: T | undefined): string {
    return this.option.format(value);
  }

  parse (input: CliInput) {
    const value = this.option.parse(input, this.fallback);

    if (value == null && this.required) {
      throw new Error(`${this.option} is required`);
    }

    return value as (R extends true ? T : T | undefined);
  }
}

const options = {
  manifest: new Option({
    name: 'manifest',
    description: 'Path to manifest file',
    parser: parsers.real_path,
    letter: 'm'
  }),
  rom: new Option({
    name: 'rom',
    description: 'Path to rom file',
    parser: parsers.real_path,
    letter: 'r'
  }),
  workspace: new Option({
    name: 'workspace',
    description: 'Path to workspace directory',
    parser: parsers.real_path,
    letter: 'w'
  }),
  profile: new Option({
    name: 'profile',
    description: 'Name of project profile to apply',
    parser: parsers.string,
    letter: 'p'
  }),
  validate: new Option({
    name: 'validate',
    description: 'Whether to verify consistent read/write',
    parser: parsers.boolean,
    letter: 'v'
  })
};

type Bindings = Dict<OptionBinding<ArgValue, boolean>>;
type CommandArgs <B extends Bindings> = {
  [K in keyof B]: ReturnType<B[K]["parse"]>;
};
type CommandInput <B extends Bindings> = {
  name: string;
  description: string;
  bindings: B;
  examples: Partial<CommandArgs<B>>[];
  execute: (input: CommandArgs<B>) => Promise<void>;
};

class Command <B extends Bindings> {
  readonly name: CommandInput<B>['name'];
  readonly description: CommandInput<B>['description'];
  readonly bindings: CommandInput<B>['bindings'];
  readonly examples: CommandInput<B>['examples'];
  readonly execute: CommandInput<B>['execute'];

  constructor (input: CommandInput<B>) {
    this.name = input.name;
    this.description = input.description;
    this.bindings = input.bindings;
    this.examples = input.examples;
    this.execute = input.execute;
  }

  toHelp (): string {
    return align`
      Usage: ${CLI_NAME} ${this.name} [options]

      ${this.description}

      Options:
        ${this.optionsHelp()}

      Examples:
        ${this.examplesHelp()}
    `;
  }

  examplesHelp (): string {
    return this.examples.map(example => {
      const option_args = (Object.entries(this.bindings)
        .map(([key, binding]) => binding.format(example[key] ?? undefined))
        .filter(Boolean)
      );

      return `${CLI_NAME} ${this.name} ${option_args.join(' ')}`;
    }).join('\n');
  }

  optionsHelp (): string {
    const bindings = Object.values(this.bindings);
    const help_rows: [string, string][] = bindings.map(binding => {
      return binding.help
    });

    const pad = Math.max(...help_rows.map(row => row[0].length));

    return help_rows.map(
      row => `${row[0].padEnd(pad)}  ${row[1]}`
    ).join('\n');
  }

  parseArgs (argv: string[]) {
    const { values } = parseArgs({
      strict: false,
      args: argv,
      options: Object.values(this.bindings).reduce((args, binding) => {
        const { name, ...meta } = binding.meta;
        (args as Dict)[name] = meta;
        return args;
      }, {})
    });

    return values;
  }

  parse (values: Dict<ArgValue | undefined>) {
    const args: Dict = {};
    const errors: Error[] = [];

    for (const [key, binding] of Object.entries(this.bindings)) {
      try {
        args[key] = binding.parse(values);
      } catch (e) {
        errors.push(e as Error);
      }
    }

    if (errors.length) {
      throw AggregateError(errors, 'Option validation failed');
    }

    return args as CommandArgs<B>;
  }
}

const bindings = {
  required_manifest: new OptionBinding({
    option: options.manifest,
    required: true,
    fallback: 'manifest.yaml'
  }),
  required_rom: new OptionBinding({
    option: options.rom,
    required: true
  }),
  required_workspace: new OptionBinding({
    option: options.workspace,
    required: true,
    fallback: 'workspace/'
  }),
  optional_profile: new OptionBinding({
    option: options.profile,
    required: false,
    fallback: 'default'
  }),
  optional_validate: new OptionBinding({
    option: options.validate,
    required: false
  })
};

const commands = {
  import: new Command({
    name: 'import',
    description: 'Imports data from files into the ROM.',
    execute: executeImport,
    bindings: {
      manifest_path: bindings.required_manifest,
      rom_path: bindings.required_rom,
      workspace_dir: bindings.required_workspace,
      profile: bindings.optional_profile,
      validate: bindings.optional_validate
    },
    examples: [{
      manifest_path: './romance_manifest.yaml' as RealPath,
      rom_path: './ff3.sfc' as RealPath,
      profile: 'basic'
    }, {
      rom_path: './ff4.sfc' as RealPath,
      validate: true
    }]
  }),
  dump: new Command({
    name: 'dump',
    description: 'Dumps data from the ROM to files.',
    execute: executeDump,
    bindings: {
      manifest_path: bindings.required_manifest,
      rom_path: bindings.required_rom,
      workspace_dir: bindings.required_workspace,
      profile: bindings.optional_profile,
      validate: bindings.optional_validate
    },
    examples: [{
      rom_path: './ff3.sfc' as RealPath,
      workspace_dir: 'dump/' as RealPath,
      validate: true
    }, {
      rom_path: './ff4.sfc' as RealPath
    }]
  })
};

type CommandName = keyof typeof commands;

function isCommand (name: unknown): name is CommandName {
  return (
    typeof name === 'string' &&
    Object.hasOwnProperty.call(commands, name)
  );
}

function buildFlags (validate: boolean | undefined) {
  return validate == null ? undefined : { validate };
}

async function executeImport (input: {
  manifest_path: string;
  profile: string | undefined;
  rom_path: string;
  workspace_dir: string;
  validate: boolean | undefined;
}): Promise<void> {
  const {
    manifest_path,
    profile,
    rom_path,
    workspace_dir,
    validate
  } = input;

  const romance = await Romance.fromManifestPath(manifest_path);
  const new_rom = await romance.import({
    profile: profile,
    workspace: await romance.loadWorkspace(workspace_dir),
    rom: await Romance.loadRom(rom_path),
    flags: buildFlags(validate)
  });

  return Romance.saveRom(rom_path, new_rom);
}

async function executeDump (input: {
  manifest_path: string;
  profile: string | undefined;
  rom_path: string;
  workspace_dir: string;
  validate: boolean | undefined;
}): Promise<void> {
  const {
    manifest_path,
    profile,
    rom_path,
    workspace_dir,
    validate,
  } = input;

  const romance = await Romance.fromManifestPath(manifest_path);
  const workspace = await romance.dump({
    profile: profile,
    rom: await Romance.loadRom(rom_path),
    flags: buildFlags(validate)
  });

  romance.saveWorkspace(workspace_dir, workspace);
}

function globalHelp (): string {
  return align`
    Usage: romance <action> [options]

    Available actions: ${Object.keys(commands).join(', ')}

    To get help for a specific action, run: romance help <action>
  `;
}

function inputErrorLog (error: Error | AggregateError): string {
  const msgs = [];

  if (error instanceof AggregateError) {
    for (const err of error.errors) {
      msgs.push(err.message);
    }
  } else if (error.cause instanceof Error) {
    msgs.push(error.cause.message);
  }

  return align`
    Error: ${error.message}
      - ${msgs.join('\n- ')}
  `.trim();
}

async function main () {
  const help = process.argv[2] === 'help';
  const [command_name, ...rest] = process.argv.slice(help ? 3 : 2);
  const command = isCommand(command_name) && commands[command_name];

  if (!command) {
    console.log(globalHelp());
    return;
  }
  if (help) {
    console.log(command.toHelp());
    return;
  }

  let values;

  try {
    const args = command.parseArgs(rest);
    values = command.parse(args);
  } catch (arg_error) {
    console.error(inputErrorLog(arg_error as Error));
    console.log(command.toHelp());
    process.exit(1);
  }

  return command.execute(values).then(
    () => console.log(`Finished ${command.name}`)
  );
}

main();
