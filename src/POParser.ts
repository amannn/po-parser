export type Entry = {
  msgctxt?: string;
  msgid: string;
  msgstr: string;
  references?: Array<{path: string; line?: number}>;
  extractedComments?: Array<string>;
  translatorComments?: Array<string>;
  flags?: Array<string>;
};

type Catalog = {
  meta?: Record<string, string>;
  messages?: Array<Entry>;
};

type State = 'entry' | 'meta';

type StringKeyword = 'msgctxt' | 'msgid' | 'msgstr';

export default class POParser {
  private static readonly KEYWORDS = {
    MSGID: 'msgid',
    MSGSTR: 'msgstr',
    MSGCTXT: 'msgctxt',
    MSGID_PLURAL: 'msgid_plural'
  } as const;

  private static readonly COMMENTS = {
    REFERENCE: '#:',
    EXTRACTED: '#.',
    TRANSLATOR: '#',
    FLAG: '#,',
    PREVIOUS: '#|'
  } as const;

  private static readonly QUOTE = '"';
  private static readonly NEWLINE = '\\n';
  private static readonly FILE_COLUMN_SEPARATOR = ':';
  private static readonly META_SEPARATOR = ':';
  private static readonly FLAG_SEPARATOR = ', ';
  private static readonly ESCAPE_LOOKUP: Record<string, string> = {
    '\\': '\\',
    '"': '"',
    '\n': 'n',
    '\r': 'r',
    '\t': 't'
  };
  private static readonly UNESCAPE_LOOKUP: Record<string, string> =
    Object.entries(POParser.ESCAPE_LOOKUP).reduce<Record<string, string>>(
      (acc, [char, code]) => {
        acc[code] = char;
        return acc;
      },
      {}
    );

  public static parse(content: string): Catalog {
    const lines = POParser.splitLines(content);
    const messages: Array<Entry> = [];
    const meta: Record<string, string> = {};

    let state: State = 'entry';
    let entry: Partial<Entry> | undefined;

    // The keyword that a subsequent quoted line continues
    let lastKeyword: StringKeyword | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // An empty line indicates the end of an entry
      if (!line) {
        if (state === 'entry' && entry) {
          messages.push(POParser.finishEntry(entry));
          entry = undefined;
        }
        state = 'entry';
        lastKeyword = undefined;
        continue;
      }

      if (state === 'meta') {
        if (line.startsWith(POParser.QUOTE)) {
          const rawMetaLine = POParser.extractQuotedString(line, state);
          const metaLine = POParser.unescape(rawMetaLine);
          const cleaned = metaLine.endsWith('\n')
            ? metaLine.slice(0, -1)
            : metaLine;

          const separatorIndex = cleaned.indexOf(POParser.META_SEPARATOR);
          if (separatorIndex > 0) {
            const key = cleaned.substring(0, separatorIndex).trim();
            const value = cleaned.substring(separatorIndex + 1).trim();
            meta[key] = value;
          }
        } else {
          POParser.throwWithLine(
            'Encountered unexpected non-quoted metadata line',
            line
          );
        }
      } else {
        // Translator comments
        if (
          line === POParser.COMMENTS.TRANSLATOR ||
          POParser.lineStartsWithPrefix(line, POParser.COMMENTS.TRANSLATOR)
        ) {
          entry = POParser.ensureEntry(entry);
          const comment = line
            .substring(POParser.COMMENTS.TRANSLATOR.length)
            .trim();
          entry.translatorComments ??= [];
          entry.translatorComments.push(comment);
          continue;
        }

        // Unsupported comment types
        if (POParser.lineStartsWithPrefix(line, POParser.COMMENTS.PREVIOUS)) {
          POParser.throwWithLine(
            'Previous string key comments (#|) are not supported',
            line
          );
        }

        // Flag comments
        if (POParser.lineStartsWithPrefix(line, POParser.COMMENTS.FLAG)) {
          entry = POParser.ensureEntry(entry);
          const flagsText = line
            .substring(POParser.COMMENTS.FLAG.length)
            .trim();
          entry.flags = flagsText
            .split(',')
            .map((flag) => flag.trim())
            .filter(Boolean);
          continue;
        }

        // Reference comments
        if (POParser.lineStartsWithPrefix(line, POParser.COMMENTS.REFERENCE)) {
          entry = POParser.ensureEntry(entry);
          const parts = line
            .substring(POParser.COMMENTS.REFERENCE.length)
            .trim()
            .split(POParser.FILE_COLUMN_SEPARATOR);
          
          const path = parts[0];
          let lineNumber: number | undefined;

          if (parts.length > 1) {
            const parsedLine = parseInt(parts[1]);
            if (!isNaN(parsedLine)) {
              lineNumber = parsedLine;
            }
          }

          entry.references ??= [];
          const reference: {path: string; line?: number} = {path};
          if (lineNumber) {
            reference.line = lineNumber;
          }
          entry.references.push(reference);
          continue;
        }

        // Extracted comments
        if (POParser.lineStartsWithPrefix(line, POParser.COMMENTS.EXTRACTED)) {
          entry = POParser.ensureEntry(entry);
          const comment = line
            .substring(POParser.COMMENTS.EXTRACTED.length)
            .trim();
          entry.extractedComments ??= [];
          entry.extractedComments.push(comment);
          continue;
        }

        // Check for unsupported features
        if (
          POParser.lineStartsWithPrefix(line, POParser.KEYWORDS.MSGID_PLURAL)
        ) {
          POParser.throwWithLine(
            'Plural forms (msgid_plural) are not supported, use ICU pluralization instead',
            line
          );
        }

        // msgctxt
        if (POParser.lineStartsWithPrefix(line, POParser.KEYWORDS.MSGCTXT)) {
          entry = POParser.ensureEntry(entry);
          entry.msgctxt = POParser.unescape(
            POParser.extractQuotedString(
              line.substring(POParser.KEYWORDS.MSGCTXT.length + 1),
              state
            )
          );
          lastKeyword = 'msgctxt';
          continue;
        }

        // msgid
        if (POParser.lineStartsWithPrefix(line, POParser.KEYWORDS.MSGID)) {
          entry = POParser.ensureEntry(entry);
          entry.msgid = POParser.unescape(
            POParser.extractQuotedString(
              line.substring(POParser.KEYWORDS.MSGID.length + 1),
              state
            )
          );
          lastKeyword = 'msgid';

          if (POParser.isMetaEntry(entry, messages)) {
            state = 'meta';
            entry = undefined;
            lastKeyword = undefined;
          }
          continue;
        }

        // msgstr
        if (POParser.lineStartsWithPrefix(line, POParser.KEYWORDS.MSGSTR)) {
          entry = POParser.ensureEntry(entry);
          entry.msgstr = POParser.unescape(
            POParser.extractQuotedString(
              line.substring(POParser.KEYWORDS.MSGSTR.length + 1),
              state
            )
          );
          lastKeyword = 'msgstr';

          if (POParser.isMetaEntry(entry, messages)) {
            state = 'meta';
            entry = undefined;
            lastKeyword = undefined;
          }
          continue;
        }

        // Multi-line string continuation
        if (line.startsWith(POParser.QUOTE)) {
          if (!entry || !lastKeyword || entry[lastKeyword] == null) {
            POParser.throwWithLine('Encountered unexpected quoted line', line);
          }
          entry[lastKeyword] += POParser.unescape(
            POParser.extractQuotedString(line, state)
          );
        }
      }
    }

    // Finish any remaining entry
    if (state === 'entry' && entry) {
      messages.push(POParser.finishEntry(entry));
    }

    return {
      meta: Object.keys(meta).length > 0 ? meta : undefined,
      messages: messages.length > 0 ? messages : undefined
    };
  }

  private static isMetaEntry(
    entry: Partial<Entry>,
    messages: Array<Entry>
  ): boolean {
    return messages.length === 0 && entry.msgid === '' && entry.msgstr === '';
  }

  public static serialize(catalog: Catalog): string {
    const lines: Array<string> = [];

    // Metadata
    if (catalog.meta) {
      lines.push(
        `${POParser.KEYWORDS.MSGID} ${POParser.QUOTE}${POParser.QUOTE}`
      );
      lines.push(
        `${POParser.KEYWORDS.MSGSTR} ${POParser.QUOTE}${POParser.QUOTE}`
      );
      for (const [key, value] of Object.entries(catalog.meta)) {
        lines.push(
          `${POParser.QUOTE}${key}${POParser.META_SEPARATOR} ${POParser.escape(
            value
          )}${POParser.NEWLINE}${POParser.QUOTE}`
        );
      }
      lines.push('');
    }

    // Messages
    if (catalog.messages) {
      for (const entry of catalog.messages) {
        if (entry.translatorComments && entry.translatorComments.length > 0) {
          for (const comment of entry.translatorComments) {
            lines.push(
              comment
                ? `${POParser.COMMENTS.TRANSLATOR} ${comment}`
                : POParser.COMMENTS.TRANSLATOR
            );
          }
        }

        if (entry.extractedComments && entry.extractedComments.length > 0) {
          for (const comment of entry.extractedComments) {
            lines.push(`${POParser.COMMENTS.EXTRACTED} ${comment}`);
          }
        }

        if (entry.references && entry.references.length > 0) {
          for (const ref of entry.references) {
            let refString = ref.path;
            if (ref.line) {
              refString += `${POParser.FILE_COLUMN_SEPARATOR}${ref.line}`;
            }
            lines.push(`${POParser.COMMENTS.REFERENCE} ${refString}`);
          }
        }

        if (entry.flags && entry.flags.length > 0) {
          lines.push(
            `${POParser.COMMENTS.FLAG} ${entry.flags.join(
              POParser.FLAG_SEPARATOR
            )}`
          );
        }

        if (entry.msgctxt) {
          lines.push(
            `${POParser.KEYWORDS.MSGCTXT} ${POParser.QUOTE}${POParser.escape(
              entry.msgctxt
            )}${POParser.QUOTE}`
          );
        }

        lines.push(
          `${POParser.KEYWORDS.MSGID} ${POParser.QUOTE}${POParser.escape(
            entry.msgid
          )}${POParser.QUOTE}`
        );
        lines.push(
          `${POParser.KEYWORDS.MSGSTR} ${POParser.QUOTE}${POParser.escape(
            entry.msgstr
          )}${POParser.QUOTE}`
        );
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private static lineStartsWithPrefix(line: string, prefix: string) {
    return line.startsWith(prefix + ' ');
  }

  private static throwWithLine(message: string, line: string): never {
    throw new Error(`${message}:\n> ${line}`);
  }

  private static splitLines(content: string): Array<string> {
    // Avoid overhead for Unix newlines only
    if (content.includes('\r')) {
      content = content.replace(/\r\n/g, '\n');
    }

    return content.split('\n');
  }

  private static ensureEntry(
    entry: Partial<Entry> | undefined
  ): Partial<Entry> {
    return entry || {};
  }

  private static finishEntry(entry: Partial<Entry>): Entry {
    if (entry.msgid == null || entry.msgstr == null) {
      throw new Error(
        'Incomplete message entry: both msgid and msgstr are required'
      );
    }

    return {
      msgctxt: entry.msgctxt,
      msgid: entry.msgid,
      msgstr: entry.msgstr,
      extractedComments: entry.extractedComments,
      translatorComments: entry.translatorComments,
      references: entry.references,
      flags: entry.flags
    };
  }

  private static extractQuotedString(line: string, state?: State): string {
    const trimmed = line.trim();

    if (!trimmed.startsWith(POParser.QUOTE)) {
      POParser.throwWithLine('Incomplete quoted string', line);
    }

    if (!trimmed.endsWith(POParser.QUOTE)) {
      if (state === 'meta') {
        return trimmed.substring(POParser.QUOTE.length);
      }
      POParser.throwWithLine('Incomplete quoted string', line);
    }

    const endIndex = trimmed.length - POParser.QUOTE.length;
    return trimmed.substring(POParser.QUOTE.length, endIndex);
  }

  private static escape(value: string): string {
    let result = '';
    for (const char of value) {
      const mapped = POParser.ESCAPE_LOOKUP[char];
      result += mapped != null ? `\\${mapped}` : char;
    }
    return result;
  }

  private static unescape(value: string): string {
    let result = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (char === '\\' && i + 1 < value.length) {
        const nextChar = value[i + 1];
        const mapped = POParser.UNESCAPE_LOOKUP[nextChar];
        if (mapped != null) {
          result += mapped;
          i++;
          continue;
        }
      }
      result += char;
    }
    return result;
  }
}
