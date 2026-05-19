declare module "culori" {
  export function converter(mode: string): (color: string) => unknown;
  export function formatHex(color: unknown): string;
}
