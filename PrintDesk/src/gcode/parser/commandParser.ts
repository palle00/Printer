import type {
  CommandParameters,
  ParsedCommand,
} from "./parserTypes";

export function parseCommand(
  commandText: string,
): ParsedCommand | null {
  if (!commandText || commandText === "%") {
    return null;
  }

  const commandMatch =
    commandText.match(
      /^([GMT])(\d+(?:\.\d+)?)/i,
    );

  if (!commandMatch) {
    return null;
  }

  const command = `${
    commandMatch[1].toUpperCase()
  }${Number(commandMatch[2])}`;
  const parameters:
    CommandParameters = {};
  const parameterRegex =
    /([A-Z])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi;
  let match: RegExpExecArray | null;

  while (
    (match =
      parameterRegex.exec(
        commandText,
      )) !== null
  ) {
    const value = Number(match[2]);

    switch (
      match[1].toUpperCase()
    ) {
      case "X":
        parameters.x = value;
        break;
      case "Y":
        parameters.y = value;
        break;
      case "Z":
        parameters.z = value;
        break;
      case "E":
        parameters.e = value;
        break;
      case "I":
        parameters.i = value;
        break;
      case "J":
        parameters.j = value;
        break;
      case "R":
        parameters.r = value;
        break;
      case "F":
        parameters.f = value;
        break;
      case "S":
        parameters.s = value;
        break;
      case "P":
        parameters.p = value;
        break;
      case "T":
        parameters.t = value;
        break;
    }
  }

  return {
    command,
    parameters,
  };
}
