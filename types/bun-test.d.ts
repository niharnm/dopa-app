declare module "bun:test" {
  type TestFunction = () => void | Promise<void>;

  type Matchers = {
    rejects: Matchers;
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: object): void;
    toThrow(expected?: unknown): void;
  };

  export function afterEach(callback: TestFunction): void;
  export function describe(name: string, callback: TestFunction): void;
  export function expect(value: unknown): Matchers;
  export const mock: {
    module(name: string, factory: () => unknown): void;
  };
  export function test(name: string, callback: TestFunction): void;
}
