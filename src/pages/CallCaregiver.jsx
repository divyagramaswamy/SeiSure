import { cleanPhone, isValidPhone, loadProfile } from "../profile";
import { addEvent } from "../activity/activityLog";

export default function CallCaregiver() {
  const profile = loadProfile();
  const hasCaregiver = isValidPhone(profile.caregiverPhone);

  if (!hasCaregiver) {
    return (
      <main className="pageNarrow">
        <div className="card callCard">
          <span className="eyebrow">CALL CAREGIVER</span>
          <h2>No caregiver set up</h2>
          <p>
            Add a caregiver's phone number in the patient profile so they can
            be called during an event.
          </p>

          <a href="#/profile" className="button">
            Set up patient profile
          </a>
        </div>
      </main>
    );
  }

  const phone = cleanPhone(profile.caregiverPhone);

  return (
    <main className="pageNarrow">
      <div className="card callCard emergency">
        <span className="eyebrow">CALL CAREGIVER</span>

        <h2>{profile.caregiverName}</h2>
        {profile.relationship && <p>{profile.relationship}</p>}
        <div className="callNumber">{profile.caregiverPhone}</div>

        <a
          href={`tel:${phone}`}
          className="button callButton"
          onClick={() => addEvent("call", `Called ${profile.caregiverName}`)}
        >
          Call now
        </a>

        {(profile.patientName || profile.notes) && (
          <div className="callNotes">
            {profile.patientName && (
              <>
                <span>Patient</span>
                <strong>{profile.patientName}</strong>
              </>
            )}
            {profile.notes && (
              <>
                <span>Medical notes</span>
                <strong>{profile.notes}</strong>
              </>
            )}
          </div>
        )}

        <div className="callLinks">
          <a href="#/">Back to monitoring</a>
          <a href="#/profile">Edit caregiver</a>
        </div>
      </div>
    </main>
  );
}
