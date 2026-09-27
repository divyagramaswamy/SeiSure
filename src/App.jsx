import { useEffect, useState } from "react";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import PatientProfile from "./pages/PatientProfile";
import CallCaregiver from "./pages/CallCaregiver";
import {
  createPatient,
  listPatients,
  loadSelectedId,
  patientLabel,
  saveSelectedId,
} from "./profile";

const pages = {
  "/": Dashboard,
  "/profile": PatientProfile,
  "/call": CallCaregiver,
};

const NEW_PATIENT = "__new__";

function currentPath() {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return pages[path] ? path : "/";
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(loadSelectedId);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    listPatients()
      .then(setPatients)
      .catch((err) => setApiError(err.message));
  }, []);

  const patient = patients.find((p) => p.id === selectedId) ?? null;

  function selectPatient(id) {
    setSelectedId(id);
    saveSelectedId(id);
  }

  async function handleNewPatient() {
    try {
      const created = await createPatient();
      setPatients((list) => [...list, created]);
      selectPatient(created.id);
      window.location.hash = "/profile";
    } catch (err) {
      setApiError(err.message);
    }
  }

  function handlePatientChange(e) {
    if (e.target.value === NEW_PATIENT) handleNewPatient();
    else selectPatient(e.target.value);
  }

  function handleSaved(updated) {
    setPatients((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  const Page = pages[path];

  return (
    <div className="app">
      <header className="navbar">
        <div>
          <div className="brand">
            <div className="logo">N</div>
            <div>
              <h1>NeuroGuard</h1>
              <p>Multimodal seizure monitoring</p>
            </div>
          </div>
        </div>

        <nav className="navLinks">
          <a href="#/" className={path === "/" ? "current" : ""}>
            Monitor
          </a>
          <a href="#/profile" className={path === "/profile" ? "current" : ""}>
            Patient Profile
          </a>
        </nav>

        <div className="headerRight">
          <label className="patientPicker">
            <span>Patient</span>
            <select value={patient?.id ?? ""} onChange={handlePatientChange}>
              {!patient && (
                <option value="" disabled>
                  Select a patient
                </option>
              )}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {patientLabel(p)}
                </option>
              ))}
              <option value={NEW_PATIENT}>+ New patient</option>
            </select>
          </label>

          <div className="live">
            <span />
            LIVE MONITORING
          </div>
        </div>
      </header>

      {apiError && (
        <p className="apiError">
          Patient data is unavailable ({apiError}). It is stored by the dev
          server, so run the app with <code>npm run dev</code>.
        </p>
      )}

      <Page
        patient={patient}
        onSaved={handleSaved}
        onCreate={handleNewPatient}
      />
    </div>
  );
}
