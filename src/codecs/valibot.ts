import * as v from 'valibot';
import { Rom } from '../core/rom.js';
import { CodecNode, codec_kinds } from '../core/codec-types.js';

export * from 'valibot';

export const uint = () => v.pipe(
  v.number(), v.integer(), v.minValue(0)
);
export const uint8 = () => v.pipe(
  v.number(), v.integer(), v.minValue(0), v.maxValue(255)
);
export const uint16 = () => v.pipe(
  v.number(), v.integer(), v.minValue(0), v.maxValue(65535)
);

type BaseValue = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

export const dict = <
  T extends BaseValue = v.UnknownSchema
> (value_schema: T = v.unknown() as T) => v.record(
  v.string(),
  value_schema
);

export const num_dict = <
  T extends BaseValue = v.UnknownSchema
> (value_schema: T = v.unknown() as T) => v.record(
  v.pipe(v.string(), v.digits()),
  value_schema
);

export const datasize = () => v.picklist(Rom.datasizes);
export const kind = () => v.picklist(codec_kinds);
export const node = () => v.custom<CodecNode>(
  (input): input is CodecNode => input instanceof CodecNode,
  "Expected an instance of CodecNode"
);
