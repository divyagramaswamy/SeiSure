import { useState } from "react";
import { emptyProfile, isValidPhone, updatePatient } from "../profile";
import ActivityHistory from "../activity/ActivityHistory";

export default function PatientProfile({ patient, onSaved, onCreate }) {
  if (!patient) {
    return (
      <main className="pageNarrow">
        <div className="card callCard">
          <span className="eyebrow">PATIENT PROFILE</span>
          <h2>No patient selected</h2>
          <p>
            Choose a patient from the menu at the top, or create a new one.
          </p>

          <button type="button" className="button" onClick={onCreate}>
            New patient
          </button>
        </div>
      </main>
    );
  }

  // Keyed by id so the form resets when a different patient is selected
  return <ProfileForm key={patient.id} patient={patient} onSaved={onSaved} />;
}

function ProfileForm({ patient, onSaved }) {
  const [profile, setProfile] = useState({ ...emptyProfile, ...patient });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (e) => {
      setProfile({ ...profile, [field]: e.target.value });
      setStatus(null);
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isValidPhone(profile.caregiverPhone)) {
      setStatus({ error: true, text: "Enter a valid caregiver phone number." });
      return;
    }

    setSaving(true);
    try {
      onSaved(await updatePatient(patient.id, profile));
      setStatus({ error: false, text: "Profile saved." });
    } catch (err) {
      setStatus({ error: true, text: `Could not save: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pageNarrow">
      <form className="card profileForm" onSubmit={handleSubmit}>
        <h2>Patient Profile</h2>
        <p>
          Set the caregiver who is contacted when a possible seizure is
          detected.
        </p>

        <fieldset>
          <legend className="eyebrow">PATIENT</legend>

          <label>
            Patient name
            <input
              value={profile.patientName}
              onChange={update("patientName")}
              placeholder="Jordan Lee"
              required
            />
          </label>

          <label>
            Medical notes for caregiver
            <textarea
              value={profile.notes}
              onChange={update("notes")}
              placeholder="Seizure type, medications, rescue plan..."
              rows={3}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend className="eyebrow">EMERGENCY CAREGIVER</legend>

          <div className="formRow">
            <label>
              Caregiver name
              <input
                value={profile.caregiverName}
                onChange={update("caregiverName")}
                placeholder="Sam Lee"
                required
              />
            </label>

            <label>
              Relationship
              <input
                value={profile.relationship}
                onChange={update("relationship")}
                placeholder="Parent"
              />
            </label>
          </div>

          <label>
            Phone number
            <input
              type="tel"
              value={profile.caregiverPhone}
              onChange={update("caregiverPhone")}
              placeholder="+1 555 123 4567"
              required
            />
          </label>
        </fieldset>

        <div className="formActions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>

          {status && (
            <span className={status.error ? "formError" : "formSuccess"}>
              {status.text}
            </span>
          )}
        </div>
      </form>

      <ActivityHistory patientId={patient.id} />
    </main>
  );
}
