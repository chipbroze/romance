import { EvilMap } from '../utils/map-utils.js';
import YAML from 'yaml';

type FileFormatArgs <T, TName> = {
  name: TName;
  format: (data: T) => string;
  parse: (str: string) => T;
  valid: (data: unknown) => boolean;
};

class FileFormat <T, TName extends string> {
  #args: FileFormatArgs<T, TName>;

  constructor (args: FileFormatArgs<T, TName>) {
    this.#args = { ...args };
  }
  get name () {
    return this.#args.name;
  }
  format (data: unknown): string {
    if (!this.valid(data)) {
      throw new Error(`Invalid data for format: ${this.name}`);
    }
    return this.#args.format(data);
  }
  parse (str: string): T {
    return this.#args.parse(str);
  }
  valid (data: unknown): data is T {
    return this.#args.valid(data);
  }
}

const formats_list = [
  new FileFormat({
    name: 'txt',
    format: (data: string) => data,
    parse: (data: string) => data,
    valid: (data: unknown) => typeof data === 'string'
  }),
  new FileFormat({
    name: 'json',
    format: (data: unknown) => JSON.stringify(data, null, 2),
    parse: (data: string) => JSON.parse(data),
    valid: () => true
  }),
  new FileFormat({
    name: 'yaml',
    format: (data: unknown) => YAML.stringify(
      JSON.parse(JSON.stringify(data)) // TODO: Annotate reason for clone
    ),
    parse: (data: string) => YAML.parse(data),
    valid: () => true
  })
];

type FileFormatName = (typeof formats_list)[number]['name'];

const file_formats = EvilMap.fromRecord(formats_list.reduce((obj, f) => {
  obj[f.name] = f;
  return obj;
}, {} as Record<FileFormatName, (typeof formats_list)[number]>));

function isValidFormat (format: string): format is FileFormatName {
  return file_formats.has(format);
}

export { file_formats, isValidFormat };
export type { FileFormatName };
