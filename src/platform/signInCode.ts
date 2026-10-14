/** Accepts what people paste from the sign-in email: spaces and dashes are dropped; 6 to 10 digits remain. */
export function cleanCode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
