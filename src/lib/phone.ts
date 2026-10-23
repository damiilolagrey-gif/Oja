/**
 * Normalises a Nigerian mobile number to WhatsApp's format: country code + number, digits only
 * (e.g. "0803 123 4567" -> "2348031234567"). Returns null when it isn't a Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national: string;
  if (/^0[789][01]\d{8}$/.test(digits)) national = digits.slice(1);
  else if (/^234[789][01]\d{8}$/.test(digits)) national = digits.slice(3);
  else if (/^[789][01]\d{8}$/.test(digits)) national = digits;
  else return null;
  return "234" + national;
}

export function displayPhone(e164: string): string {
  const n = e164.startsWith("234") ? "0" + e164.slice(3) : e164;
  return n.replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");
}
