import { useState } from "react";
import { isValidPhone, loadProfile, saveProfile } from "../profile";
import ActivityHistory from "../activity/ActivityHistory";

export default function PatientProfile() {
  const [profile, setProfile] = useState(loadProfile);
  const [status, setStatus] = useState(null);

  function update(field) {
    return (e) => {
      setProfile({ ...profile, [field]: e.target.value });
      setStatus(null);
    };
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!isValidPhone(profile.caregiverPhone)) {
      setStatus({ error: true, text: "Enter a valid caregiver phone number." });
      return;
    }

    if (saveProfile(profile)) {
      setStatus({ error: false, text: "Profile saved." });
    } else {
      setStatus({
        error: true,
        text: "Could not save. Browser storage may be disabled.",
      });
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
          <button type="submit" className="button">
            Save profile
          </button>

          {status && (
            <span className={status.error ? "formError" : "formSuccess"}>
              {status.text}
            </span>
          )}
        </div>
      </form>

      <ActivityHistory />
    </main>
  );
}
