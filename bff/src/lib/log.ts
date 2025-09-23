export type LogFields = Record<string, unknown>;

function hasFields(fields?: LogFields): fields is LogFields {
  return !!fields && Object.keys(fields).length > 0;
}

export function logInfo(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  if (hasFields(fields)) {
    console.info(`[bff] [${scope}] ${message}`, fields);
    return;
  }
  console.info(`[bff] [${scope}] ${message}`);
}

export function logError(
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  if (hasFields(fields)) {
    console.error(`[bff] [${scope}] ${message}`, fields);
    return;
  }
  console.error(`[bff] [${scope}] ${message}`);
}
