const STORAGE_KEY = "neuroguard.patientProfile";

export const emptyProfile = {
  patientName: "",
  caregiverName: "",
  relationship: "",
  caregiverPhone: "",
  notes: "",
};

export function loadProfile() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...emptyProfile, ...JSON.parse(saved) } : emptyProfile;
  } catch {
    return emptyProfile;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

// Keeps a leading "+" and digits only, e.g. "(555) 123-4567" -> "5551234567"
export function cleanPhone(phone) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function isValidPhone(phone) {
  const digits = cleanPhone(phone).replace("+", "");
  return digits.length >= 7 && digits.length <= 15;
}
