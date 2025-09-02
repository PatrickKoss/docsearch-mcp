declare module 'better-sqlite3' {
  namespace Database {
    interface Database {
      prepare(source: string): Statement;
      exec(source: string): void;
      pragma(source: string): void;
      transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
      close(): void;
    }

    interface Statement {
      run(...params: any[]): RunResult;
      get(...params: any[]): any;
      all(...params: any[]): any[];
    }

    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface DatabaseOptions {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
    }
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Database.DatabaseOptions): Database.Database;
    prototype: Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}

declare module 'turndown' {
  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(input: string | HTMLElement): string;
  }

  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '*' | '+' | '-';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '**' | '__';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
  }

  export = TurndownService;
}