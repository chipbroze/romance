
const TABSIZE = 2;
const tabCount = charCounter('\t');

function width (str: string, start: number = 0): number {
  return (str.length - start) + tabCount(str, start) * (TABSIZE - 1);
}

function charCounter (char: string) {
  const code = char.charCodeAt(0);
  return function charCount (str: string, start: number = 0): number {
    let count = 0;
    for (let i = start; i < str.length; i++) {
      if (str.charCodeAt(i) === code) {
        count++;
      }
    }
    return count;
  };
}

/**
 * Removes the common leading indentation from a multi-line string.
 * Relative indentation between lines is preserved.
 */
function deindent (str: string): string {
  const lines = str.split('\n');
  const count = Math.min(...lines.map(line => {
    const indent = line.search(/[^ \t]/);
    return indent === -1 ? Infinity : indent;
  }));

  return (Number.isInteger(count) && count > 0
    ? lines.map(line => line.slice(count)).join('\n')
    : lines.join('\n')
  );
}

/**
 * Formats multiline template literals.
 * Full text block is deindented
 * Inserted text blocks preserve indentation
 */
function align (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const chunks: string[] = [];
  let column = 0;

  for (let i = 0; i < strings.length; ++i) {
    const str = strings[i]!;
    let val = String(values[i] ?? '');
    const str_line_i = str.lastIndexOf('\n') + 1;
    const val_line_i = val.lastIndexOf('\n') + 1;
    const str_width = width(str, str_line_i);
    const val_width = width(val, val_line_i);

    if (str_line_i) {
      column = 0;
    }

    column += str_width;

    // Indent value lines based on first line position
    if (val_line_i) {
      const indent = ' '.repeat(column);
      val = (val
        .split('\n')
        .map((line, i) => i ? indent + line : line)
        .join('\n')
      );
    }

    column += val_width;
    chunks.push(str, val);
  }

  return deindent(chunks.join(''));
}

export { align };
