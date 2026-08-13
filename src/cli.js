#!/usr/bin/env node

/* global console,process */

import { parseArgs } from 'node:util';
import { Romance } from './romance.js';
import { deindent, indent } from './lib/log.js';

const CLI_NAME = 'romance';

class Option {
  constructor (input) {
    this.name = input.name;
    this.description = input.description;
    this.type = input.type;
    this.letter = input.letter;
    this.fallback = input.fallback;
    this.required = input.required ?? false;
  }

  validate (value) {
    if (this.required && value == null) {
      return new Error(`Option ${this.name} is required`);
    }

    if (typeof value !== this.kind) {
      return new Error(`Option ${this.name} must be type: ${this.type}`);
    }

    return null;
  }

  example (value) {
    const bool = this.type === 'bool';
    // NOTE: This assumes no "false" boolean examples
    return bool ? `-${this.letter}` : `-${this.letter} ${value}`;
  }
  get kind () {
    return Option.kinds[this.type];
  }
  static kinds = {
    filepath: 'string',
    string: 'string',
    bool: 'boolean'
  }
}

class Command {
  constructor (input) {
    this.name = input.name;
    this.description = input.description;
    this.options = input.options;
    this.examples = input.examples;
  }

  toHelp () {
    return deindent(6, `
      Usage: ${CLI_NAME} ${this.name} [options]

      ${this.description}

      Options: ${indent(8, this.optionsHelp())}

      Examples: ${indent(8, this.examplesHelp())}
    `);
  }

  examplesHelp () {
    return this.examples.map(example => {
      const option_args = (this.options
        .filter(option => example[option.name] != null)
        .map(option => option.example(example[option.name]))
        .join(' ')
      );

      return `${CLI_NAME} ${this.name} ${option_args}`;
    }).join('\n');
  }

  optionsHelp () {
     const help_rows = this.options.map(option => {
      const left_col = `-${option.letter}, --${option.name} <${option.type}>`;
      const mode = !option.required ? 'optional'
        : option.fallback ? `default: ${option.fallback}`
        : 'required';
      const right_col = `${option.description} [${mode}]`;
      return [left_col, right_col];
    });

    const pad = Math.max(...help_rows.map(row => row[0].length));

    return help_rows.map(
      row => `${row[0].padEnd(pad)}  ${row[1]}`
    ).join('\n');
  }

  optionsArgs () {
    return this.options.reduce((args, option) => {
      args[option.name] = {
        type: option.kind,
        short: option.letter,
        default: option.fallback
      };
      return args;
    }, {});
  }

  parse (argv) {
    const { values } = parseArgs({
      allowPositionals: true,
      options: this.optionsArgs(),
      args: argv
    });

    for (const option of this.options) {
      // TODO: Improve this mapping
      if (option.key) {
        values[option.key] = values[option.name];
        delete option.name;
      }
    }
    return values;
  }

  validate (values) {
    const msg = 'Option validation failed';
    const errors = this.options.map(
      option => option.validate(values[option.name])
    ).filter(Boolean);

    switch (errors.length) {
      case 0: return null;
      case 1: return new Error(msg, { cause: errors[0] });
      default: return new AggregateError(errors, msg);
    }
  }
}

const options = new Map([{
  name: 'manifest',
  key: 'manifest_path',
  description: 'Path to manifest file',
  type: 'filepath',
  letter: 'm',
  required: true,
  fallback: 'manifest.yaml'
}, {
  name: 'rom',
  key: 'rom_path',
  description: 'Path to rom file',
  type: 'filepath',
  letter: 'r',
  required: true
}, {
  name: 'workspace',
  key: 'workspace_dir',
  description: 'Path to workspace directory',
  type: 'filepath',
  letter: 'w',
  required: true,
  fallback: 'workspace/'
}, {
  name: 'profile',
  description: 'Name of project profile to apply',
  type: 'string',
  letter: 'p',
  required: false,
  fallback: 'default'
}, {
  name: 'validate',
  description: 'Whether to verify consistent read/write',
  type: 'bool',
  letter: 'v',
  fallback: false
}].map(option => [option.name, new Option(option)]));

const commands = new Map([{
  name: 'import',
  description: 'Imports data from files into the ROM.',
  execute: executeImport,
  options: ['manifest', 'rom', 'workspace', 'profile', 'validate'],
  examples: [
    { manifest: './romance_manifest.yaml', rom: './ff3.sfc', profile: 'basic' },
    { rom: './ff4.sfc', validate: true }
  ]
}, {
  name: 'dump',
  description: 'Dumps data from the ROM to files.',
  execute: executeDump,
  options: ['manifest', 'rom', 'workspace', 'profile', 'validate'],
  examples: [
    { rom: './ff3.sfc', workspace: 'dump/', validate: true },
    { rom: './ff4.sfc' }
  ]
}].map(command => [command.name, new Command({
  ...command,
  options: command.options.map(option => options.get(option))
})]));

async function executeImport (input) {
  const {
    manifest_path,
    profile,
    rom_path,
    workspace_dir,
    validate
  } = input;

  const romance = await Romance.fromManifestPath(manifest_path);
  const new_rom = romance.import({
    profile,
    workspace: await romance.loadWorkspace(workspace_dir),
    rom: await Romance.loadRom(rom_path),
    flags: { validate },
  });

  return Romance.saveRom(rom_path, new_rom);
}

async function executeDump (input) {
  const {
    manifest_path,
    profile,
    rom_path,
    workspace_dir,
    validate
  } = input;

  const romance = await Romance.fromManifestPath(manifest_path);
  const workspace = await romance.dump({
    profile,
    rom: await Romance.loadRom(rom_path),
    flags: { validate }
  });

  return romance.saveWorkspace(workspace_dir, workspace);
}

function globalHelp() {
  return deindent(4, `
    Usage: romance <action> [options]

    Available actions: ${[...commands.keys()].join(', ')}

    To get help for a specific action, run: romance help <action>
  `);
}

function inputErrorLog (error) {
  const lines = [`Error: ${error.message}`];

  if (error.errors) {
    for (const error of error.errors) {
      lines.push(`  - ${error.message}`);
    }
  } else if (error.cause) {
    lines.push(`  - ${error.cause.message}`);
  }

  return lines.join('\n');
}

function main () {
  const help = process.argv[2] === 'help';
  const [command_name, ...rest] = process.argv.slice(help ? 3 : 2);
  const command = commands.get(command_name);

  if (!command) {
    console.log(globalHelp());
    return;
  }
  if (help) {
    console.log(command.toHelp());
    return;
  }

  const values = command.parse(rest);
  const arg_error = command.validate(values);

  if (arg_error) {
    console.error(inputErrorLog(arg_error));
    console.log(command.toHelp());
    process.exit(1);
  }

  return command.execute(values).then(
    () => console.log(`Finished ${command.name}`)
  );
}

main();
