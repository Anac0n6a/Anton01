export function apiError(message: string, type: string) {
  return { error: { message, type, param: null, code: null } };
}
