// Patients are stored in data/patients.json by the dev server (see
// server/patientApi.js). The selected patient is remembered per browser.

const SELECTED_KEY = "neuroguard.selectedPatient";

export const emptyProfile = {
  patientName: "",
  caregiverName: "",
  relationship: "",
  caregiverPhone: "",
  notes: "",
};

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/patients${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function listPatients() {
  return api("");
}

export function createPatient(profile = emptyProfile) {
  return api("", { method: "POST", body: profile });
}

export function updatePatient(id, profile) {
  return api(`/${id}`, { method: "PUT", body: profile });
}

export function loadSelectedId() {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedId(id) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // Not remembered across reloads, but still selected for this session
  }
}

export function patientLabel(patient) {
  return patient.patientName.trim() || "Unnamed patient";
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
