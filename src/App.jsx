import { useEffect, useState } from "react";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import PatientProfile from "./pages/PatientProfile";
import CallCaregiver from "./pages/CallCaregiver";

const pages = {
  "/": Dashboard,
  "/profile": PatientProfile,
  "/call": CallCaregiver,
};

function currentPath() {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return pages[path] ? path : "/";
}

export default function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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

        <div className="live">
          <span />
          LIVE MONITORING
        </div>
      </header>

      <Page />
    </div>
  );
}
