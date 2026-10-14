// 1. Re-export everything from the official Valibot library
export * from 'valibot';

// 2. Import valibot locally so you can use its primitives in your helpers
import * as v from 'valibot';

// 3. Define and export your custom scalar/atomic helpers
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
