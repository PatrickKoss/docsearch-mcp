import { JsonFormatter } from './json-formatter.js';
import { TextFormatter } from './text-formatter.js';
import { YamlFormatter } from './yaml-formatter.js';

import type { OutputFormat, OutputFormatter } from '../../ports.js';

export class FormatterFactory {
  static createFormatter(format: OutputFormat): OutputFormatter {
    switch (format) {
      case 'text':
        return new TextFormatter();
      case 'json':
        return new JsonFormatter();
      case 'yaml':
        return new YamlFormatter();
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }
}
