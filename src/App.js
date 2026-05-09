import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, onSnapshot,
  doc, setDoc, deleteDoc, getDocs
} from "firebase/firestore";

// ─── Firebase Config ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBbB5MxmJGWYYOEtJJ71YrhLRItdxf83tM",
  authDomain: "sum-cavour-3304.firebaseapp.com",
  projectId: "sum-cavour-3304",
  storageBucket: "sum-cavour-3304.firebasestorage.app",
  messagingSenderId: "612140563394",
  appId: "1:612140563394:web:251db5859858488233b45b",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── Default Users ────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { id: "admin",  username: "admin",  password: "admin123", name: "Administrador",    unit: "Admin",    role: "admin" },
  { id: "apt101", username: "apt101", password: "pass101",  name: "García, María",    unit: "Apto 101", role: "owner" },
  { id: "apt102", username: "apt102", password: "pass102",  name: "López, Carlos",    unit: "Apto 102", role: "owner" },
  { id: "apt201", username: "apt201", password: "pass201",  name: "Martínez, Ana",    unit: "Apto 201", role: "owner" },
  { id: "apt202", username: "apt202", password: "pass202",  name: "Rodríguez, Juan",  unit: "Apto 202", role: "owner" },
  { id: "apt301", username: "apt301", password: "pass301",  name: "Fernández, Laura", unit: "Apto 301", role: "owner" },
];

const HOURS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00",
               "15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"];
const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                     "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAY_NAMES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function today() { const d = new Date(); return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser]     = useState(null);
  const [reservations, setReservations]   = useState([]);
  const [users, setUsers]                 = useState(DEFAULT_USERS);
  const [view, setView]                   = useState("calendar");
  const [selectedDate, setSelectedDate]   = useState(null);
  const [calendarDate, setCalendarDate]   = useState(new Date());
  const [modal, setModal]                 = useState(null);
  const [loginError, setLoginError]       = useState("");
  const [loginForm, setLoginForm]         = useState({ username: "", password: "" });
  const [notification, setNotification]   = useState(null);
  const [reserveForm, setReserveForm]     = useState({ from: "09:00", to: "12:00", purpose: "", notes: "" });
  const [loading, setLoading]             = useState(true);

  // ── Seed default users if Firestore users collection is empty ──────────────
  useEffect(() => {
    const seedUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      if (snap.empty) {
        for (const u of DEFAULT_USERS) {
          await setDoc(doc(db, "users", u.id), u);
        }
      }
    };
    seedUsers();
  }, []);

  // ── Real-time listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, "reservations"), (snap) => {
      setReservations(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      if (!snap.empty) setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return () => { unsubRes(); unsubUsers(); };
  }, []);

  // ── Save helpers ───────────────────────────────────────────────────────────
  const saveReservation = useCallback(async (res) => {
    await setDoc(doc(db, "reservations", String(res.id)), res);
  }, []);

  const deleteReservation = useCallback(async (id) => {
    await deleteDoc(doc(db, "reservations", String(id)));
  }, []);

  const saveUser = useCallback(async (user) => {
    await setDoc(doc(db, "users", String(user.id)), user);
  }, []);

  const deleteUser = useCallback(async (id) => {
    await deleteDoc(doc(db, "users", String(id)));
  }, []);

  // ── Notifications ──────────────────────────────────────────────────────────
  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    const user = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
    if (user) { setCurrentUser(user); setLoginError(""); }
    else setLoginError("Usuario o contraseña incorrectos.");
  };

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const getDateReservations = (dateStr) => reservations.filter(r => r.date === dateStr);

  const dateStatus = (dateStr) => {
    const res = getDateReservations(dateStr);
    if (res.length === 0) return "free";
    if (res.some(r => r.userId === currentUser?.id)) return "mine";
    return "taken";
  };

  const handleDayClick = (dateStr) => {
    if (dateStr < today()) return;
    setSelectedDate(dateStr);
    const res = getDateReservations(dateStr);
    if (res.length > 0) setModal("detail");
    else { setModal("reserve"); setReserveForm({ from: "09:00", to: "12:00", purpose: "", notes: "" }); }
  };

  // ── Reserve ────────────────────────────────────────────────────────────────
  const handleReserve = async () => {
    if (!reserveForm.purpose.trim()) { notify("Por favor indicá el motivo del evento.", "error"); return; }
    if (reserveForm.from >= reserveForm.to) { notify("El horario de fin debe ser posterior al inicio.", "error"); return; }
    const existing = getDateReservations(selectedDate);
    const overlap = existing.some(r => !(reserveForm.to <= r.from || reserveForm.from >= r.to));
    if (overlap) { notify("Ya hay una reserva en ese horario.", "error"); return; }
    const newRes = {
      id: String(Date.now()),
      date: selectedDate,
      from: reserveForm.from,
      to: reserveForm.to,
      purpose: reserveForm.purpose,
      notes: reserveForm.notes,
      userId: currentUser.id,
      userName: currentUser.name,
      unit: currentUser.unit,
      createdAt: new Date().toISOString(),
      paid: false,
    };
    await saveReservation(newRes);
    setModal(null);
    notify("✓ Reserva realizada correctamente.");
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancelReservation = async (resId) => {
    const res = reservations.find(r => r.id === resId);
    if (!res) return;
    if (res.userId !== currentUser.id && currentUser.role !== "admin") { notify("No podés cancelar esta reserva.", "error"); return; }
    await deleteReservation(resId);
    setModal(null);
    notify("Reserva cancelada.");
  };

  // ── Toggle paid ────────────────────────────────────────────────────────────
  const handleTogglePaid = async (resId) => {
    const res = reservations.find(r => r.id === resId);
    if (!res) return;
    await saveReservation({ ...res, paid: !res.paid });
    notify("Estado de pago actualizado.");
  };

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // ════════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (!currentUser) {
    return (
      <div style={styles.loginBg}>
        <div style={styles.loginCard}>
          <div style={styles.loginLogo}>
            <span style={styles.loginIcon}>🏢</span>
            <h1 style={styles.loginTitle}>SUM</h1>
            <p style={styles.loginSubtitle}>Gestión de Reservas · Cavour 3304</p>
          </div>
          <div style={styles.loginForm}>
            <label style={styles.label}>Usuario</label>
            <input
              style={styles.input}
              placeholder="ej: apt101"
              value={loginForm.username}
              onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <label style={styles.label}>Contraseña</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={loginForm.password}
              onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            {loginError && <p style={styles.errorText}>{loginError}</p>}
            <button style={styles.btnPrimary} onClick={handleLogin}>Ingresar</button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ════════════════════════════════════════════════════════════════════════════
  const todayRes = reservations.filter(r => r.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const myRes    = todayRes.filter(r => r.userId === currentUser.id);

  return (
    <div style={styles.appBg}>
      {notification && (
        <div style={{ ...styles.notification, background: notification.type === "error" ? "#ef4444" : "#10b981" }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ fontSize: 22 }}>🏢</span>
          <span style={styles.headerTitle}>SUM</span>
          <span style={styles.headerSub}>Salón de Usos Múltiples</span>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.userBadge}>
            <span style={styles.userDot} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</span>
            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>{currentUser.unit}</span>
          </div>
          {currentUser.role === "admin" && (
            <button
              style={view === "admin" ? styles.tabActive : styles.tab}
              onClick={() => setView(view === "admin" ? "calendar" : "admin")}
            >
              {view === "admin" ? "📅 Calendario" : "⚙️ Admin"}
            </button>
          )}
          <button style={styles.btnLogout} onClick={() => setCurrentUser(null)}>Salir</button>
        </div>
      </header>

      <main style={styles.main}>
        {loading && <p style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Cargando datos...</p>}

        {!loading && view === "calendar" && (
          <div style={styles.layout}>
            {/* ── Calendar ── */}
            <div style={styles.calendarCard}>
              <div style={styles.calNav}>
                <button style={styles.navBtn} onClick={() => setCalendarDate(new Date(year, month - 1, 1))}>‹</button>
                <h2 style={styles.calTitle}>{MONTH_NAMES[month]} {year}</h2>
                <button style={styles.navBtn} onClick={() => setCalendarDate(new Date(year, month + 1, 1))}>›</button>
              </div>
              <div style={styles.legend}>
                <span style={styles.legendItem}><span style={{ ...styles.dot, background: "#10b981" }} />Libre</span>
                <span style={styles.legendItem}><span style={{ ...styles.dot, background: "#f59e0b" }} />Tu reserva</span>
                <span style={styles.legendItem}><span style={{ ...styles.dot, background: "#ef4444" }} />Ocupado</span>
                <span style={styles.legendItem}><span style={{ ...styles.dot, background: "#cbd5e1" }} />Pasado</span>
              </div>
              <div style={styles.grid}>
                {DAY_NAMES.map(d => <div key={d} style={styles.dayLabel}>{d}</div>)}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e-${i}`} />;
                  const ds = dateKey(year, month, d);
                  const isPast  = ds < today();
                  const isToday = ds === today();
                  const status  = dateStatus(ds);
                  const res     = getDateReservations(ds);
                  let bg     = isPast ? "#f1f5f9" : "#f0fdf4";
                  let color  = isPast ? "#94a3b8" : "#166534";
                  let border = "1.5px solid #e2e8f0";
                  if (!isPast && status === "taken") { bg = "#fef2f2"; color = "#991b1b"; border = "1.5px solid #fca5a5"; }
                  if (!isPast && status === "mine")  { bg = "#fffbeb"; color = "#92400e"; border = "1.5px solid #fcd34d"; }
                  if (isToday) border = "2px solid #6366f1";
                  return (
                    <div
                      key={ds}
                      onClick={() => !isPast && handleDayClick(ds)}
                      style={{ ...styles.dayCell, background: bg, color, border, cursor: isPast ? "default" : "pointer", opacity: isPast ? 0.6 : 1 }}
                    >
                      <span style={{ fontWeight: isToday ? 800 : 500, fontSize: 14 }}>{d}</span>
                      {res.length > 0 && <span style={styles.resDot}>{res.length}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Sidebar ── */}
            <div style={styles.sidebar}>
              <div style={styles.sideCard}>
                <h3 style={styles.sideTitle}>📋 Mis Próximas Reservas</h3>
                {myRes.length === 0
                  ? <p style={styles.emptyText}>No tenés reservas próximas.</p>
                  : myRes.map(r => (
                    <div key={r.id} style={styles.resItem}>
                      <div style={styles.resItemHeader}>
                        <span style={styles.resDate}>{r.date}</span>
                        <span style={{ ...styles.paidBadge, background: r.paid ? "#d1fae5" : "#fef9c3", color: r.paid ? "#065f46" : "#713f12" }}>
                          {r.paid ? "✓ Pagado" : "⏳ Pendiente"}
                        </span>
                      </div>
                      <div style={styles.resTime}>🕐 {r.from} – {r.to}</div>
                      <div style={styles.resPurpose}>{r.purpose}</div>
                    </div>
                  ))}
              </div>

              <div style={styles.sideCard}>
                <h3 style={styles.sideTitle}>🗓️ Todas las Reservas</h3>
                {todayRes.length === 0
                  ? <p style={styles.emptyText}>No hay reservas próximas.</p>
                  : todayRes.slice(0, 6).map(r => (
                    <div key={r.id} style={{ ...styles.resItem, borderLeft: "3px solid " + (r.userId === currentUser.id ? "#f59e0b" : "#6366f1") }}>
                      <div style={styles.resItemHeader}>
                        <span style={styles.resDate}>{r.date}</span>
                        <span style={{ ...styles.paidBadge, background: r.paid ? "#d1fae5" : "#fef9c3", color: r.paid ? "#065f46" : "#713f12" }}>
                          {r.paid ? "✓" : "⏳"}
                        </span>
                      </div>
                      <div style={styles.resTime}>🕐 {r.from} – {r.to}</div>
                      <div style={styles.resPurpose}>{r.unit} · {r.purpose}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Admin Panel ── */}
        {!loading && view === "admin" && currentUser.role === "admin" && (
          <AdminView
            reservations={reservations}
            users={users}
            handleTogglePaid={handleTogglePaid}
            handleCancelReservation={handleCancelReservation}
            saveUser={saveUser}
            deleteUser={deleteUser}
            notify={notify}
          />
        )}
      </main>

      {/* ── Modal: Reserve ── */}
      {modal === "reserve" && (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Nueva Reserva</h2>
            <p style={styles.modalDate}>📅 {selectedDate}</p>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Desde</label>
                <select style={styles.input} value={reserveForm.from} onChange={e => setReserveForm(f => ({ ...f, from: e.target.value }))}>
                  {HOURS.map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Hasta</label>
                <select style={styles.input} value={reserveForm.to} onChange={e => setReserveForm(f => ({ ...f, to: e.target.value }))}>
                  {HOURS.map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <label style={styles.label}>Motivo / Evento *</label>
            <input style={styles.input} placeholder="Ej: Cumpleaños, Reunión..." value={reserveForm.purpose} onChange={e => setReserveForm(f => ({ ...f, purpose: e.target.value }))} />
            <label style={styles.label}>Notas adicionales</label>
            <textarea style={{ ...styles.input, height: 70, resize: "none" }} placeholder="Opcional..." value={reserveForm.notes} onChange={e => setReserveForm(f => ({ ...f, notes: e.target.value }))} />
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Reservante: <strong>{currentUser.name}</strong> · {currentUser.unit}
            </p>
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setModal(null)}>Cancelar</button>
              <button style={styles.btnPrimary} onClick={handleReserve}>Confirmar Reserva</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detail ── */}
      {modal === "detail" && selectedDate && (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Reservas del día</h2>
            <p style={styles.modalDate}>📅 {selectedDate}</p>
            {getDateReservations(selectedDate).map(r => (
              <div key={r.id} style={styles.detailItem}>
                <div style={styles.detailHeader}>
                  <span style={{ fontWeight: 700, color: "#1e293b" }}>{r.unit}</span>
                  <span style={{ ...styles.paidBadge, background: r.paid ? "#d1fae5" : "#fef9c3", color: r.paid ? "#065f46" : "#713f12" }}>
                    {r.paid ? "✓ Pagado" : "⏳ Pendiente"}
                  </span>
                </div>
                <p style={{ margin: "4px 0", fontSize: 13 }}>👤 {r.userName}</p>
                <p style={{ margin: "4px 0", fontSize: 13 }}>🕐 {r.from} – {r.to}</p>
                <p style={{ margin: "4px 0", fontSize: 13 }}>📌 {r.purpose}</p>
                {r.notes && <p style={{ margin: "4px 0", fontSize: 12, color: "#6b7280" }}>📝 {r.notes}</p>}
                <p style={{ margin: "4px 0", fontSize: 11, color: "#9ca3af" }}>
                  Solicitado: {new Date(r.createdAt).toLocaleString("es-AR")}
                </p>
                {(r.userId === currentUser.id || currentUser.role === "admin") && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {currentUser.role === "admin" && (
                      <button style={styles.btnSmallGreen} onClick={() => handleTogglePaid(r.id)}>
                        {r.paid ? "Marcar impago" : "Marcar pagado"}
                      </button>
                    )}
                    <button style={styles.btnSmallRed} onClick={() => handleCancelReservation(r.id)}>
                      Cancelar reserva
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button style={styles.btnSecondary} onClick={() => { setModal("reserve"); setReserveForm({ from: "09:00", to: "12:00", purpose: "", notes: "" }); }}>
                + Agregar otra reserva
              </button>
              <button style={styles.btnSecondary} onClick={() => setModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin View ───────────────────────────────────────────────────────────────
function AdminView({ reservations, users, handleTogglePaid, handleCancelReservation, saveUser, deleteUser, notify }) {
  const [tab, setTab]       = useState("reservations");
  const [newUser, setNewUser] = useState({ username: "", password: "", name: "", unit: "" });

  const allRes  = [...reservations].sort((a, b) => a.date.localeCompare(b.date));
  const unpaid  = allRes.filter(r => !r.paid && r.date >= today());

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.name || !newUser.unit) { notify("Completá todos los campos.", "error"); return; }
    if (users.find(u => u.username === newUser.username)) { notify("El usuario ya existe.", "error"); return; }
    const user = { ...newUser, id: newUser.username, role: "owner" };
    await saveUser(user);
    setNewUser({ username: "", password: "", name: "", unit: "" });
    notify("Propietario creado correctamente.");
  };

  const handleDeleteUser = async (id) => {
    await deleteUser(id);
    notify("Propietario eliminado.");
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={styles.adminTabs}>
        {["reservations", "unpaid", "users"].map(t => (
          <button key={t} style={tab === t ? styles.tabActive : styles.tab} onClick={() => setTab(t)}>
            {t === "reservations" ? "📋 Todas las reservas" : t === "unpaid" ? "⏳ Pagos pendientes" : "👥 Propietarios"}
          </button>
        ))}
      </div>

      {tab === "reservations" && (
        <div style={styles.sideCard}>
          <h3 style={styles.sideTitle}>Todas las Reservas</h3>
          {allRes.length === 0
            ? <p style={styles.emptyText}>Sin reservas registradas.</p>
            : (
              <table style={styles.table}>
                <thead>
                  <tr>{["Fecha","Horario","Unidad","Propietario","Motivo","Estado","Pagado","Acciones"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {allRes.map(r => (
                    <tr key={r.id} style={{ background: r.date < today() ? "#f8fafc" : "white" }}>
                      <td style={styles.td}>{r.date}</td>
                      <td style={styles.td}>{r.from}–{r.to}</td>
                      <td style={styles.td}>{r.unit}</td>
                      <td style={styles.td}>{r.userName}</td>
                      <td style={styles.td}>{r.purpose}</td>
                      <td style={styles.td}><span style={{ color: r.date < today() ? "#94a3b8" : "#10b981", fontWeight: 600 }}>{r.date < today() ? "Pasada" : "Próxima"}</span></td>
                      <td style={styles.td}>
                        <button style={{ ...styles.paidBadge, cursor: "pointer", border: "none", background: r.paid ? "#d1fae5" : "#fef9c3", color: r.paid ? "#065f46" : "#713f12" }} onClick={() => handleTogglePaid(r.id)}>
                          {r.paid ? "✓ Pagado" : "⏳ Pendiente"}
                        </button>
                      </td>
                      <td style={styles.td}><button style={styles.btnSmallRed} onClick={() => handleCancelReservation(r.id)}>Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {tab === "unpaid" && (
        <div style={styles.sideCard}>
          <h3 style={styles.sideTitle}>Pagos Pendientes</h3>
          {unpaid.length === 0
            ? <p style={styles.emptyText}>✓ Todos los pagos al día.</p>
            : unpaid.map(r => (
              <div key={r.id} style={{ ...styles.detailItem, borderLeft: "3px solid #f59e0b" }}>
                <div style={styles.detailHeader}>
                  <span style={{ fontWeight: 700 }}>{r.unit} — {r.userName}</span>
                  <button style={styles.btnSmallGreen} onClick={() => handleTogglePaid(r.id)}>Marcar pagado</button>
                </div>
                <p style={{ margin: "4px 0", fontSize: 13 }}>📅 {r.date} · 🕐 {r.from}–{r.to} · 📌 {r.purpose}</p>
                <p style={{ margin: "4px 0", fontSize: 11, color: "#9ca3af" }}>Solicitado: {new Date(r.createdAt).toLocaleString("es-AR")}</p>
              </div>
            ))}
        </div>
      )}

      {tab === "users" && (
        <div style={styles.sideCard}>
          <h3 style={styles.sideTitle}>Propietarios Registrados</h3>
          <table style={styles.table}>
            <thead><tr>{["Unidad","Nombre","Usuario","Contraseña","Rol","Acciones"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.unit}</td>
                  <td style={styles.td}>{u.name}</td>
                  <td style={styles.td}><code>{u.username}</code></td>
                  <td style={styles.td}><code>{u.password}</code></td>
                  <td style={styles.td}>{u.role === "admin" ? "🔑 Admin" : "👤 Propietario"}</td>
                  <td style={styles.td}>{u.role !== "admin" && <button style={styles.btnSmallRed} onClick={() => handleDeleteUser(u.id)}>Eliminar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ ...styles.sideTitle, marginTop: 20 }}>+ Agregar Propietario</h3>
          <div style={styles.formRow}>
            <input style={{ ...styles.input, flex: 1 }} placeholder="Unidad (ej: Apto 303)" value={newUser.unit} onChange={e => setNewUser(f => ({ ...f, unit: e.target.value }))} />
            <input style={{ ...styles.input, flex: 1 }} placeholder="Nombre y apellido" value={newUser.name} onChange={e => setNewUser(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={styles.formRow}>
            <input style={{ ...styles.input, flex: 1 }} placeholder="Usuario (ej: apt303)" value={newUser.username} onChange={e => setNewUser(f => ({ ...f, username: e.target.value }))} />
            <input style={{ ...styles.input, flex: 1 }} placeholder="Contraseña" value={newUser.password} onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} />
          </div>
          <button style={styles.btnPrimary} onClick={handleAddUser}>Crear Propietario</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  appBg:        { minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  loginBg:      { minHeight: "100vh", background: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e3a5f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  loginCard:    { background: "white", borderRadius: 20, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" },
  loginLogo:    { textAlign: "center", marginBottom: 28 },
  loginIcon:    { fontSize: 48 },
  loginTitle:   { margin: "8px 0 4px", fontSize: 32, fontWeight: 900, color: "#1e293b", letterSpacing: -1 },
  loginSubtitle:{ margin: 0, color: "#64748b", fontSize: 14 },
  loginForm:    { display: "flex", flexDirection: "column", gap: 8 },
  header:       { background: "white", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  headerLeft:   { display: "flex", alignItems: "center", gap: 10 },
  headerTitle:  { fontSize: 20, fontWeight: 900, color: "#1e293b", letterSpacing: -0.5 },
  headerSub:    { fontSize: 13, color: "#64748b", marginLeft: 4 },
  headerRight:  { display: "flex", alignItems: "center", gap: 10 },
  userBadge:    { display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, padding: "4px 12px" },
  userDot:      { width: 8, height: 8, borderRadius: "50%", background: "#10b981" },
  main:         { padding: 20 },
  layout:       { display: "flex", gap: 20, maxWidth: 1100, margin: "0 auto", flexWrap: "wrap" },
  calendarCard: { background: "white", borderRadius: 16, padding: 24, flex: "1 1 480px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  sidebar:      { flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 16 },
  sideCard:     { background: "white", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  sideTitle:    { margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 },
  calNav:       { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  calTitle:     { margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" },
  navBtn:       { background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: "pointer", color: "#374151" },
  legend:       { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  legendItem:   { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" },
  dot:          { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  grid:         { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },
  dayLabel:     { textAlign: "center", fontSize: 11, fontWeight: 700, color: "#94a3b8", padding: "4px 0", textTransform: "uppercase" },
  dayCell:      { borderRadius: 10, padding: "8px 4px", textAlign: "center", minHeight: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "all 0.15s" },
  resDot:       { fontSize: 10, background: "#6366f1", color: "white", borderRadius: 10, padding: "1px 5px", marginTop: 2 },
  resItem:      { borderLeft: "3px solid #e2e8f0", paddingLeft: 10, marginBottom: 10 },
  resItemHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center" },
  resDate:      { fontSize: 13, fontWeight: 700, color: "#1e293b" },
  resTime:      { fontSize: 12, color: "#6b7280" },
  resPurpose:   { fontSize: 12, color: "#374151", marginTop: 2 },
  paidBadge:    { fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "2px 8px" },
  emptyText:    { color: "#94a3b8", fontSize: 13, margin: 0 },
  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 },
  modalCard:    { background: "white", borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 25px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" },
  modalTitle:   { margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#1e293b" },
  modalDate:    { color: "#6366f1", fontWeight: 600, fontSize: 14, margin: "0 0 16px" },
  modalActions: { display: "flex", gap: 10, marginTop: 12 },
  formRow:      { display: "flex", gap: 10, marginBottom: 8 },
  formGroup:    { flex: 1 },
  label:        { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input:        { width: "100%", boxSizing: "border-box", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", color: "#1e293b", background: "#f8fafc" },
  errorText:    { color: "#ef4444", fontSize: 13, margin: "4px 0" },
  btnPrimary:   { width: "100%", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  btnSecondary: { background: "#f1f5f9", color: "#374151", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnLogout:    { background: "transparent", color: "#ef4444", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tab:          { background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" },
  tabActive:    { background: "#6366f1", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 },
  detailItem:   { background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 10, borderLeft: "3px solid #6366f1" },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  btnSmallRed:  { fontSize: 12, background: "#fef2f2", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600 },
  btnSmallGreen:{ fontSize: 12, background: "#f0fdf4", color: "#10b981", border: "1px solid #6ee7b7", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600 },
  notification: { position: "fixed", top: 16, right: 16, zIndex: 999, color: "white", padding: "12px 20px", borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  adminTabs:    { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { background: "#f8fafc", color: "#374151", fontWeight: 700, padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontSize: 12, textTransform: "uppercase" },
  td:           { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", color: "#1e293b" },
};
