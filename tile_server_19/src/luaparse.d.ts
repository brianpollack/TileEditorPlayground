declare module "luaparse" {
  export interface LuaParseOptions {
    comments?: boolean;
    locations?: boolean;
    luaVersion?: "5.1" | "5.2" | "5.3" | "LuaJIT";
    ranges?: boolean;
    scope?: boolean;
  }

  export function parse(input: string, options?: LuaParseOptions): unknown;
}
