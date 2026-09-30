// Ambient declaration for bcryptjs (pure-JS bcrypt, no native binding).
// We declare it locally because @types/bcryptjs on DefinitelyTyped is an
// empty stub — it ships no index.d.ts, so TypeScript can't find anything.
// Loaded automatically via tsconfig "include": ["src/**/*"].

declare module 'bcryptjs' {
  export function genSaltSync(rounds?: number): string;
  export function genSalt(rounds?: number): Promise<string>;

  export function hashSync(data: string, saltOrRounds: string | number): string;
  export function hash(
    data: string,
    saltOrRounds: string | number,
  ): Promise<string>;

  export function compareSync(data: string, encrypted: string): boolean;
  export function compare(data: string, encrypted: string): Promise<boolean>;

  export function getRounds(encrypted: string): number;

  const bcrypt: {
    genSaltSync: typeof genSaltSync;
    genSalt: typeof genSalt;
    hashSync: typeof hashSync;
    hash: typeof hash;
    compareSync: typeof compareSync;
    compare: typeof compare;
    getRounds: typeof getRounds;
  };
  export default bcrypt;
}
