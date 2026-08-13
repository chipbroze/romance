import { EvilMap } from './map-utils.js';
import YAML from 'yaml';

interface Formatter <datatype> {
  format: (data: datatype) => string;
  parse: (string: string) => datatype;
  valid: ([unknown] extends [datatype]
    ? (data: unknown) => boolean
    : (data: unknown) => data is datatype
  );
}

const file_formats = EvilMap.fromRecord({
  txt: {
    format: (data: string) => data,
    parse: data => data,
    valid: data => typeof data === 'string'
  } satisfies Formatter<string>,
  json: {
    format: data => JSON.stringify(addIDs(data), null, 2),
    parse: data => removeIDs(JSON.parse(data)),
    valid: () => true
  } satisfies Formatter<unknown>,
  yaml: {
    format: (data) => YAML.stringify(addIDs(JSON.parse(JSON.stringify(data)))),
    parse: (data) => removeIDs(YAML.parse(data)),
    valid: () => true
  } satisfies Formatter<unknown>
});

function idKey (i: number): string {
  return `----------------------------------------- ${i}`;
}

function addIDs (data: unknown): unknown {
  return Array.isArray(data) ? data.map((item, i) => {
    return { [idKey(i)]: item };
  }) : data;
}

function removeIDs (data: unknown): unknown {
  return Array.isArray(data) ? data.map((item, i) => {
    const key = idKey(i);
    return (key in item) ? item[key] : item;
  }) : data;
}

export { file_formats };
