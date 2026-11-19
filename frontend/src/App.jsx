import { useState } from "react";
import {
  LayoutDashboard, Users, BookOpen, Building2, CalendarDays, Clock, ShieldCheck, Menu, GraduationCap,
  ClipboardList, Play, AlertTriangle, LogOut, Table2
} from "lucide-react";
import "./App.css";
import "./dev.css";
import { ENTITIES, useStored, collectE1 } from "./store";
import { ROLES } from "./auth";
import { INITIAL, LABEL, fromResult } from "./workflow";
import Login from "./Login";
import EntityPage from "./EntityPage";
import GenerateTimetable from "./GenerateTimetable";
import E2 from "./pages/E2";
import Dashboard from "./pages/Dashboard";
import Conflicts from "./pages/Conflicts";
import TimetablePage from "./pages/TimetablePage";

const ENTITY_ICONS = { courses: BookOpen, faculty: Users, rooms: Building2, divisions: GraduationCap, slots: Clock, assignments: ClipboardList };
const NAV = {
  coordinator: [
    { section: "OVERVIEW" },
    { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
    { section: "E1 · ACADEMIC DATA" },
    ...Object.entries(ENTITIES).map(([key, e]) => ({ id: "entity:" + key, name: e.title, icon: ENTITY_ICONS[key] })),
    { section: "E2 · E3 · E4" },
    { id: "e2", name: "E2 · Validation Engine", icon: ShieldCheck },
    { id: "generate", name: "Generate Timetable", icon: Play },
    { id: "timetable", name: "Timetable", icon: Table2 },
    { id: "conflicts", name: "Conflict Reports", icon: AlertTriangle }
  ],
  faculty: [{ id: "dashboard", name: "Dashboard", icon: LayoutDashboard }, { id: "timetable", name: "My Timetable", icon: CalendarDays }],
  student: [{ id: "dashboard", name: "Dashboard", icon: LayoutDashboard }, { id: "timetable", name: "Timetable", icon: CalendarDays }]
};

function App() {
  const [user, setUser] = useState(() => {
    try { const u = JSON.parse(localStorage.getItem("tt2_user")); return u && ROLES[u.role] ? u : null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [e2, setE2] = useStored("e2", { payload: null, schedule: null, sent: false });
  const [wf, setWf] = useStored("wf", INITIAL);
  const stores = {
    courses: useStored("courses"),
    faculty: useStored("faculty"),
    rooms: useStored("rooms"),
    divisions: useStored("divisions"),
    slots: useStored("slots"),
    assignments: useStored("assignments")
  };

  const login = (u) => { try { localStorage.setItem("tt2_user", JSON.stringify(u)); } catch { /* storage unavailable */ } setUser(u); setPage("dashboard"); };
  const logout = () => { try { localStorage.removeItem("tt2_user"); } catch { /* storage unavailable */ } setUser(null); };

  if (!user) return <div className="dev"><Login onLogin={login} /></div>;

  const e1 = collectE1(stores);
  const setters = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, v[1]]));
  const counts = Object.fromEntries(Object.keys(ENTITIES).map((k) => [k, stores[k][0].length]));
  const nav = NAV[user.role];
  const current = nav.find((n) => n.id === page) || nav[1];

  let content;
  if (page.startsWith("entity:")) {
    const key = page.split(":")[1];
    content = <div className="dev"><EntityPage key={key} entity={ENTITIES[key]} rows={stores[key][0]} setRows={stores[key][1]} /></div>;
  } else if (page === "e2") content = <div className="dev"><E2 e2={e2} setE2={setE2} e1={e1} wf={wf} onGenerated={(result) => setWf(fromResult(result))} /></div>;
  else if (page === "generate") content = <GenerateTimetable e1={e1} setters={setters} wf={wf} setWf={setWf} go={setPage} />;
  else if (page === "timetable") content = <TimetablePage user={user} wf={wf} setWf={setWf} go={setPage} />;
  else if (page === "conflicts") content = <div className="dev"><Conflicts wf={wf} go={setPage} /></div>;
  else content = <div className="dev"><Dashboard user={user} counts={counts} go={setPage} wf={wf} /></div>;

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="brand">
          <div className="brand-icon"><CalendarDays size={24} /></div>
          {sidebarOpen && <div><h2>ClassSync</h2><span>Smart Academic Timetable</span></div>}
        </div>
        <nav>
          {nav.map((item) => {
            if (item.section) return sidebarOpen ? <p className="nav-label" key={item.section}>{item.section}</p> : null;
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} title={item.name}>
                <Icon size={19} />
                {sidebarOpen && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>
        <button className="sidebar-footer" onClick={logout} title="Sign out">
          <LogOut size={18} />
          {sidebarOpen && <span>Sign out</span>}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={22} /></button>
          <div className="topbar-right">
            <span className="status">{LABEL[wf.status]}</span>
            <div className="who">
              <strong>{user.name}</strong>
              <small>{ROLES[user.role].label}</small>
            </div>
            <div className="profile">{user.name.slice(0, 2).toUpperCase()}</div>
          </div>
        </header>
        <section className="content">
          {(page === "generate" || (page === "timetable" && wf.result?.success && (user.role === "coordinator" || wf.status === "approved"))) && (
            <div className="welcome">
              <div>
                <span className="eyebrow">{ROLES[user.role].label.toUpperCase()}</span>
                <h1>{current?.name || "ClassSync"}</h1>
              </div>
            </div>
          )}
          {content}
        </section>
      </main>
    </div>
  );
}

export default App;
