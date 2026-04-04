export interface EpubChapter {
  readonly title: string;
  readonly text: string;
}

export interface EpubParseResult {
  readonly chapters: EpubChapter[];
  readonly metadata: {
    readonly format: 'epub';
    readonly title?: string;
    readonly author?: string;
    readonly language?: string;
    readonly chapterCount: number;
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseEpub(filePath: string): Promise<EpubParseResult> {
  const epubModule = await import('epub2');
  const EPub = epubModule.EPub || epubModule.default;
  const epub = await EPub.createAsync(filePath);

  const metadata = {
    format: 'epub' as const,
    title: epub.metadata?.title || undefined,
    author: epub.metadata?.creator || undefined,
    language: epub.metadata?.language || undefined,
    chapterCount: 0,
  };

  const chapters: EpubChapter[] = [];
  const flow = (epub.flow || []) as Array<{ id?: string; title?: string }>;

  for (const chapter of flow) {
    try {
      const chapterId = chapter.id;
      if (!chapterId) {
        continue;
      }

      let html: string;
      if (typeof epub.getChapterAsync === 'function') {
        html = await epub.getChapterAsync(chapterId);
      } else {
        html = await new Promise<string>((resolve, reject) => {
          epub.getChapter(chapterId, (err: Error | null, text: string) => {
            if (err) {
              reject(err);
            } else {
              resolve(text || '');
            }
          });
        });
      }

      const text = stripHtml(html);
      if (!text.trim()) {
        continue;
      }

      const title = chapter.title || `Chapter ${chapters.length + 1}`;
      chapters.push({ title, text });
    } catch {
      // Skip chapters that can't be parsed
    }
  }

  metadata.chapterCount = chapters.length;

  return { chapters, metadata };
}
