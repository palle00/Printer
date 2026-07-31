export function stripGcodeLine(
  rawLine: string,
): string {
  const semicolonIndex =
    rawLine.indexOf(";");
  const withoutComment =
    semicolonIndex >= 0
      ? rawLine.slice(0, semicolonIndex)
      : rawLine;
  const checksumIndex =
    withoutComment.indexOf("*");
  const withoutChecksum =
    checksumIndex >= 0
      ? withoutComment.slice(0, checksumIndex)
      : withoutComment;

  return withoutChecksum
    .replace(/\([^)]*\)/g, "")
    .replace(
      /^\s*N\d+\s+/i,
      "",
    )
    .trim();
}
