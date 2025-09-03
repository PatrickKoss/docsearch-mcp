import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

export interface FileInfo {
  readonly path: string;
  readonly absolutePath: string;
  readonly modifiedTime: number;
  readonly size: number;
}

export interface FileSystemAdapter {
  findFiles(
    roots: readonly string[],
    includeGlobs: readonly string[],
    excludeGlobs: readonly string[],
  ): Promise<readonly FileInfo[]>;
  readFileContent(filePath: string): Promise<string>;
  getFileInfo(filePath: string): Promise<FileInfo>;
  fileExists(filePath: string): boolean;
}

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async findFiles(
    roots: readonly string[],
    includeGlobs: readonly string[],
    excludeGlobs: readonly string[],
  ): Promise<readonly FileInfo[]> {
    const allFiles: FileInfo[] = [];

    for (const root of roots) {
      if (!existsSync(root)) {
        console.warn(`Root path does not exist: ${root}`);
        continue;
      }

      const files = await fg([...includeGlobs], {
        cwd: root,
        ignore: [...excludeGlobs],
        dot: false,
        absolute: false,
        onlyFiles: true,
      });

      for (const file of files) {
        try {
          const absolutePath = path.resolve(root, file);
          const stats = await fs.stat(absolutePath);

          allFiles.push({
            path: file,
            absolutePath,
            modifiedTime: stats.mtimeMs,
            size: stats.size,
          });
        } catch (error) {
          console.warn(`Error reading file stats for ${file}:`, error);
        }
      }
    }

    return allFiles;
  }

  async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);

      return {
        path: path.basename(filePath),
        absolutePath: path.resolve(filePath),
        modifiedTime: stats.mtimeMs,
        size: stats.size,
      };
    } catch (error) {
      throw new Error(`Failed to get file info for ${filePath}: ${error}`);
    }
  }

  fileExists(filePath: string): boolean {
    return existsSync(filePath);
  }
}
