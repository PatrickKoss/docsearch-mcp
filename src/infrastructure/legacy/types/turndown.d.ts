// Type declaration for turndown module used in Confluence ingestion
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
