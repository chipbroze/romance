function deindent (count: number, str: string): string {
  return str.split('\n').map(line => line.slice(count)).join('\n');
}

function indent (count: number, str: string): string {
  const indentLine = (line: string) => line.padStart(line.length + count);
  return `\n${str.split('\n').map(indentLine).join('\n')}`;
}

export {
  deindent,
  indent
};
