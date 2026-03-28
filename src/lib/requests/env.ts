/**
 * Normalizes raw environment values by trimming and unquoting single token strings.
 */
export function normalizeEnvString(value: string | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim()
    return unquoted.length > 0 ? unquoted : undefined
  }

  return trimmed
}
