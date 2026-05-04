/**
 * Unit tests for the optional FTS5 tokenizer extension loader
 * (QMD_FTS_EXTENSIONS).
 */

import { describe, test, expect } from "vitest";
import { loadFtsExtensions } from "../src/db";

const ENV_KEY = "QMD_FTS_EXTENSIONS";

function withEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env[ENV_KEY];
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = prev;
    }
  }
}

type FakeDb = {
  loaded: string[];
  loadExtension: (path: string) => void;
};

function makeDb(opts?: { failOn?: string }): FakeDb {
  const loaded: string[] = [];
  return {
    loaded,
    loadExtension(path: string) {
      if (opts?.failOn === path) {
        throw new Error(`dlopen failed for ${path}`);
      }
      loaded.push(path);
    },
  };
}

describe("loadFtsExtensions", () => {
  test("is a no-op when the env var is unset", () => {
    withEnv(undefined, () => {
      const db = makeDb();
      expect(() => loadFtsExtensions(db as any)).not.toThrow();
      expect(db.loaded).toEqual([]);
    });
  });

  test("is a no-op when the env var is whitespace-only", () => {
    withEnv("   ", () => {
      const db = makeDb();
      loadFtsExtensions(db as any);
      expect(db.loaded).toEqual([]);
    });
  });

  test("loads a single path", () => {
    withEnv("/path/to/vaporetto.dylib", () => {
      const db = makeDb();
      loadFtsExtensions(db as any);
      expect(db.loaded).toEqual(["/path/to/vaporetto.dylib"]);
    });
  });

  test("loads each path from a comma-separated list in order", () => {
    withEnv("/a.so, /b.so ,/c.so", () => {
      const db = makeDb();
      loadFtsExtensions(db as any);
      expect(db.loaded).toEqual(["/a.so", "/b.so", "/c.so"]);
    });
  });

  test("drops empty segments from the list", () => {
    withEnv("/a.so,,, /b.so ,,", () => {
      const db = makeDb();
      loadFtsExtensions(db as any);
      expect(db.loaded).toEqual(["/a.so", "/b.so"]);
    });
  });

  test("rethrows underlying loader errors with a descriptive message", () => {
    withEnv("/missing.dylib", () => {
      const db = makeDb({ failOn: "/missing.dylib" });
      expect(() => loadFtsExtensions(db as any)).toThrow(
        /Failed to load FTS extension "\/missing\.dylib".*dlopen failed/
      );
    });
  });

  test("stops at the first failing extension and propagates", () => {
    withEnv("/ok.so,/broken.so,/never.so", () => {
      const db = makeDb({ failOn: "/broken.so" });
      expect(() => loadFtsExtensions(db as any)).toThrow(/broken\.so/);
      expect(db.loaded).toEqual(["/ok.so"]);
    });
  });
});
