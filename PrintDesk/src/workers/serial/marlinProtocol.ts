const RESEND_PATTERN = /(?:^|\s)(?:resend|rs)\s*:?\s*(?:N\s*)?(\d+)/i;

export function calculateMarlinChecksum(value: string): number {
  let checksum = 0;
  for (let index = 0; index < value.length; index += 1) {
    checksum ^= value.charCodeAt(index);
  }
  return checksum & 0xff;
}

export function frameMarlinCommand(lineNumber: number, command: string): string {
  const payload = `N${lineNumber} ${command}`;
  return `${payload}*${calculateMarlinChecksum(payload)}`;
}

export function parseMarlinResendRequest(line: string): number | null {
  const match = line.match(RESEND_PATTERN);
  if (!match) return null;
  const lineNumber = Number(match[1]);
  return Number.isSafeInteger(lineNumber) && lineNumber >= 0 ? lineNumber : null;
}
