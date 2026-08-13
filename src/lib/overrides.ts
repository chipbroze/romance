// Where users can declare overrides or custom types
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UserOverrides {}

/* Example Usage 
declare module '../overrides.js' {
  interface UserOverrides {
    empty: typeof Empty;
    static: typeof Static;
    uint: typeof Uint;
    xint: typeof HexInt;
    fixed: typeof Fixed;
    bool: typeof Bool;
    enum: typeof Enum;
    tile: typeof Tile;
  }
}
*/
