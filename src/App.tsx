import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { apiFetch } from "./api";
import { FeaturePage } from "./FeaturePages";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type AuthMode = "login" | "register";

type Flight = {
  id: number;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  status: string;
  availableSeats: number;
};

type Notice = { type: "success" | "error" | "info"; text: string };

type SeatInfo = {
  seatNumber: string;
  status: string;
  row?: number;
  col?: string;
  isWindow?: boolean;
  isAisle?: boolean;
  cabinClass?: string;
};

type FlightDetails = Flight & { seats: SeatInfo[] };

type FlightStatus = {
  flightNumber: string; airline: string; origin: string; destination: string;
  departureDate: string; departureTime: string; arrivalTime: string;
  status: string; statusSource: string;
  terminal: string | null; gate: string | null; baggageBelt: string | null;
};

type PassengerDetail = { title: string; name: string; gender: string };

type Booking = {
  id: number; pnr: string; flightNumber: string; airline: string;
  origin: string; destination: string; departureDate: string;
  departureTime: string; arrivalTime: string; seatNumbers: string[];
  passengerName: string; passengers?: PassengerDetail[];
  passengerCount: number; totalPrice: number;
  discount?: number; promoCode?: string | null;
  status: string; createdAt: string; flightId?: number;
};

type AdminBooking = {
  id: number; pnr: string; passengerName: string;
  origin?: string; destination?: string; totalPrice?: number;
  status?: string; bookedByName?: string; reason?: string;
};

type AdminDashboard = {
  stats: {
    totalUsers: number; totalFlights: number; activeFlights: number;
    totalBookings: number; totalCancellations: number; totalRevenue: number;
    bookingStatusDistribution: Record<string, number>;
  };
  bookingTrend: { date: string; count: number }[];
  revenueTrend: { date: string; revenue: number }[];
  popularDestinations: { destination: string; bookingCount: number }[];
  flights: (Flight & { isActive: boolean })[];
  users: { id: number; name: string; email: string; role: string }[];
  bookings: AdminBooking[];
  cancellations: AdminBooking[];
};

type ChatMessage = { sender: "user" | "bot"; text: string; time: string };

type Destination = {
  code: string; city: string; name: string; airport: string;
  country: string; region: string; description: string; emoji: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isAdminRole(role?: string | null) { return role?.toUpperCase() === "ADMIN"; }

const ALL_AIRPORTS: Destination[] = [
  { code: "BOM", city: "Mumbai", name: "Mumbai (BOM)", airport: "Chhatrapati Shivaji Maharaj International Airport", country: "India", region: "domestic", description: "India's financial capital", emoji: "🌊" },
  { code: "DEL", city: "Delhi", name: "Delhi (DEL)", airport: "Indira Gandhi International Airport", country: "India", region: "domestic", description: "India's historic capital", emoji: "🏛️" },
  { code: "BLR", city: "Bengaluru", name: "Bengaluru (BLR)", airport: "Kempegowda International Airport", country: "India", region: "domestic", description: "Silicon Valley of India", emoji: "🌿" },
  { code: "HYD", city: "Hyderabad", name: "Hyderabad (HYD)", airport: "Rajiv Gandhi International Airport", country: "India", region: "domestic", description: "City of Nizams & tech", emoji: "🕌" },
  { code: "MAA", city: "Chennai", name: "Chennai (MAA)", airport: "Chennai International Airport", country: "India", region: "domestic", description: "Gateway to South India", emoji: "🏖️" },
  { code: "CCU", city: "Kolkata", name: "Kolkata (CCU)", airport: "Netaji Subhas Chandra Bose Int'l", country: "India", region: "domestic", description: "City of Joy", emoji: "🎭" },
  { code: "PNQ", city: "Pune", name: "Pune (PNQ)", airport: "Pune International Airport", country: "India", region: "domestic", description: "Oxford of the East", emoji: "📚" },
  { code: "GOI", city: "Goa", name: "Goa (GOI)", airport: "Dabolim Airport", country: "India", region: "domestic", description: "Beach paradise of India", emoji: "🌴" },
  { code: "COK", city: "Kochi", name: "Kochi (COK)", airport: "Cochin International Airport", country: "India", region: "domestic", description: "Queen of the Arabian Sea", emoji: "🚢" },
  { code: "AMD", city: "Ahmedabad", name: "Ahmedabad (AMD)", airport: "Sardar Vallabhbhai Patel Int'l", country: "India", region: "domestic", description: "Heritage city", emoji: "🏺" },
  { code: "JAI", city: "Jaipur", name: "Jaipur (JAI)", airport: "Jaipur International Airport", country: "India", region: "domestic", description: "Pink City of royals", emoji: "🏰" },
  { code: "LKO", city: "Lucknow", name: "Lucknow (LKO)", airport: "Chaudhary Charan Singh Int'l", country: "India", region: "domestic", description: "City of Nawabs", emoji: "🌹" },
  { code: "SXR", city: "Srinagar", name: "Srinagar (SXR)", airport: "Sheikh ul-Alam International Airport", country: "India", region: "domestic", description: "Paradise on Earth", emoji: "🏔️" },
  { code: "VNS", city: "Varanasi", name: "Varanasi (VNS)", airport: "Lal Bahadur Shastri Int'l", country: "India", region: "domestic", description: "Spiritual capital", emoji: "🕯️" },
  { code: "DXB", city: "Dubai", name: "Dubai (DXB)", airport: "Dubai International Airport", country: "UAE", region: "international", description: "City of the future", emoji: "🏙️" },
  { code: "SIN", city: "Singapore", name: "Singapore (SIN)", airport: "Changi Airport", country: "Singapore", region: "international", description: "Garden city & global hub", emoji: "✨" },
  { code: "BKK", city: "Bangkok", name: "Bangkok (BKK)", airport: "Suvarnabhumi Airport", country: "Thailand", region: "international", description: "City of Angels", emoji: "🛕" },
  { code: "LHR", city: "London", name: "London (LHR)", airport: "Heathrow Airport", country: "UK", region: "international", description: "Historic world capital", emoji: "💂" },
  { code: "CDG", city: "Paris", name: "Paris (CDG)", airport: "Charles de Gaulle Airport", country: "France", region: "international", description: "City of love & culture", emoji: "🗼" },
  { code: "KUL", city: "Kuala Lumpur", name: "Kuala Lumpur (KUL)", airport: "KLIA", country: "Malaysia", region: "international", description: "Twin Towers & culture", emoji: "🌆" },
  { code: "JFK", city: "New York", name: "New York (JFK)", airport: "JFK International Airport", country: "USA", region: "international", description: "The city that never sleeps", emoji: "🗽" },
];

const FEATURED_DESTINATIONS: Destination[] = [
  ALL_AIRPORTS.find(a => a.code === "GOI")!,
  ALL_AIRPORTS.find(a => a.code === "DXB")!,
  ALL_AIRPORTS.find(a => a.code === "BLR")!,
  ALL_AIRPORTS.find(a => a.code === "SXR")!,
  ALL_AIRPORTS.find(a => a.code === "SIN")!,
  ALL_AIRPORTS.find(a => a.code === "JAI")!,
  ALL_AIRPORTS.find(a => a.code === "BKK")!,
  ALL_AIRPORTS.find(a => a.code === "COK")!,
];

const DEST_IMAGES: Record<string, string> = {
  GOI: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80",
  DXB: "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80",
  BLR: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80",
  SXR: "https://images.unsplash.com/photo-1566837945700-30057527ade0?auto=format&fit=crop&w=800&q=80",
  SIN: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=800&q=80",
  JAI: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=800&q=80",
  BKK: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80",
  COK: "https://images.unsplash.com/photo-1609920658906-8223bd289001?auto=format&fit=crop&w=800&q=80",
  BOM: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=800&q=80",
  DEL: "https://images.unsplash.com/photo-1597534458220-9fb4969f2df5?auto=format&fit=crop&w=800&q=80",
  MAA: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=800&q=80",
  LHR: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80",
  CDG: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=800&q=80",
  JFK: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=800&q=80",
  HYD: "https://images.unsplash.com/photo-1572203611340-de23f90cf4ec?auto=format&fit=crop&w=800&q=80",
  CCU: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
};

const initialDepartureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const initialReturnDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const initialAdminRangeEnd = new Date().toISOString().slice(0, 10);
const initialAdminRangeStart = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

function previewTotal(price: number, count: number, promoCode: string, flight?: Flight | null) {
  const base = price * count;
  const code = promoCode.trim().toUpperCase();
  if (!code || !flight) return { totalPrice: base, discount: 0 };
  const intl = /DXB|SIN|BKK|LHR|CDG|KUL|JFK|DUBAI|SINGAPORE|LONDON|PARIS|KUALA|NEW YORK|BANGKOK/i.test(`${flight.origin} ${flight.destination}`);
  if (code === "FLYINDIA" && !intl) return { totalPrice: Math.max(0, base - Math.round(base * 0.3)), discount: Math.round(base * 0.3) };
  if (code === "WELCOME") { const d = Math.min(1000, base); return { totalPrice: Math.max(0, base - d), discount: d }; }
  if (code === "WORLD20" && intl) return { totalPrice: Math.max(0, base - Math.round(base * 0.2)), discount: Math.round(base * 0.2) };
  return { totalPrice: base, discount: 0 };
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatPrice(v: number) { return `₹${v.toLocaleString("en-IN")}`; }
function getCode(loc: string) { const m = loc.match(/\(([^)]+)\)/); return m ? m[1] : loc.slice(0, 3).toUpperCase(); }
function getCity(loc: string) { return loc.replace(/\s*\([^)]*\)\s*/g, "").trim(); }

function calcDuration(dep: string, arr: string): string {
  // Simple duration display
  const toMin = (t: string) => {
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + min;
  };
  let diff = toMin(arr) - toMin(dep);
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60), min = diff % 60;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

function AdminPanel({ currentUser, token, setCurrentUser, setToken, route }: {
  currentUser: { id: number; name: string; email: string; role?: string } | null;
  token: string | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<{ id: number; name: string; email: string; role?: string } | null>>;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  route: string;
}) {
  const isAuth = isAdminRole(currentUser?.role) && !!token;
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rangeStart, setRangeStart] = useState(initialAdminRangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialAdminRangeEnd);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginNotice, setLoginNotice] = useState<Notice | null>(null);
  const [flightForm, setFlightForm] = useState({
    flightNumber: "SK-999", airline: "SkyBook Airlines", origin: "Mumbai (BOM)", destination: "Delhi (DEL)",
    departureDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), departureTime: "08:00 AM", arrivalTime: "10:15 AM", price: "4999", status: "On Time",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (route === "/admin" && !token) navigate("/admin/login");
    if (route === "/admin" && token && currentUser && !isAdminRole(currentUser.role)) navigate("/admin/login");
  }, [route, token, currentUser]);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ startDate: rangeStart, endDate: rangeEnd });
      const data = await apiFetch(`/api/admin/dashboard?${params}`, {}, true);
      setDashboard(data);
      setNotice(null);
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to load dashboard." });
    } finally { setLoading(false); }
  }, [token, rangeStart, rangeEnd]);

  useEffect(() => {
    if (route === "/admin" && isAuth) { setLoading(true); loadDashboard(); }
  }, [route, isAuth, loadDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginNotice({ type: "info", text: "Signing in…" });
      const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(loginForm) });
      if (!isAdminRole(data.user?.role)) throw new Error("This account does not have admin access.");
      localStorage.setItem("skybook-token", data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setLoginNotice({ type: "success", text: "Admin login successful." });
      navigate("/admin");
    } catch (e) { setLoginNotice({ type: "error", text: e instanceof Error ? e.message : "Login failed." }); }
  };

  const handleCreateFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await apiFetch("/api/admin/flights", { method: "POST", body: JSON.stringify({ ...flightForm, price: Number(flightForm.price) }) }, true);
      setNotice({ type: "success", text: "Flight created successfully." });
      await loadDashboard();
    } catch (e) { setNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to create flight." }); }
    finally { setSubmitting(false); }
  };

  const handleDeactivate = async (id: number) => {
    try {
      await apiFetch(`/api/admin/flights/${id}`, { method: "DELETE" }, true);
      setNotice({ type: "success", text: "Flight deactivated." });
      await loadDashboard();
    } catch (e) { setNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to deactivate." }); }
  };

  if (route === "/admin/login") {
    return (
      <div className="admin-shell">
        <div className="admin-login-card">
          <div className="admin-login-logo"><span>✈</span>SkyBook</div>
          <div className="admin-login-header">
            <span className="admin-badge">ADMIN PORTAL</span>
            <h2>Secure Admin Access</h2>
            <p>Sign in with your administrator credentials to manage the SkyBook platform.</p>
          </div>
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label htmlFor="admin-email">Admin Email
              <input id="admin-email" type="email" placeholder="admin@skybook.com" value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} required />
            </label>
            <label htmlFor="admin-pwd">Password
              <input id="admin-pwd" type="password" placeholder="Enter password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} required />
            </label>
            {loginNotice && <div className={`state-box ${loginNotice.type}`}><span className="state-icon">{loginNotice.type === "success" ? "✓" : loginNotice.type === "error" ? "⚠" : "ℹ"}</span>{loginNotice.text}</div>}
            <button type="submit" className="primary-btn admin-login-btn">Sign In to Admin Panel</button>
          </form>
          <div className="admin-login-footer">
            <p className="admin-login-hint">Demo: <code>admin@skybook.com</code> / <code>password</code></p>
            <button type="button" className="text-btn" onClick={() => navigate("/")}>← Back to SkyBook</button>
          </div>
        </div>
      </div>
    );
  }

  if (route === "/admin" && !isAuth) return null;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-topbar-logo"><span>✈</span>SkyBook</div>
          <div>
            <span className="admin-badge">OPERATIONS DASHBOARD</span>
            <h1>Admin Panel</h1>
          </div>
        </div>
        <div className="admin-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate("/")}>← Public Site</button>
          <button type="button" className="cancel-booking-btn" onClick={() => { localStorage.removeItem("skybook-token"); setToken(null); setCurrentUser(null); navigate("/admin/login"); }}>Sign Out</button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-user-box">
            <div className="admin-user-avatar">{currentUser?.name?.[0] || "A"}</div>
            <div>
              <strong>{currentUser?.name || "Admin"}</strong>
              <small>{currentUser?.email}</small>
              <span className="admin-role-chip">ADMIN</span>
            </div>
          </div>
          <nav className="admin-nav">
            <button type="button" className="admin-nav-item active">📊 Overview</button>
            <button type="button" className="admin-nav-item" onClick={() => document.querySelector(".admin-flights-section")?.scrollIntoView({ behavior: "smooth" })}>✈ Flights</button>
            <button type="button" className="admin-nav-item" onClick={() => document.querySelector(".admin-bookings-section")?.scrollIntoView({ behavior: "smooth" })}>🎫 Bookings</button>
            <button type="button" className="admin-nav-item" onClick={() => document.querySelector(".admin-users-section")?.scrollIntoView({ behavior: "smooth" })}>👥 Users</button>
          </nav>
        </aside>

        <main className="admin-content">
          {notice && <div className={`state-box ${notice.type}`}><span className="state-icon">{notice.type === "success" ? "✓" : notice.type === "error" ? "⚠" : "ℹ"}</span>{notice.text}</div>}

          {loading ? (
            <div className="admin-loading"><div className="loading-spinner"></div><p>Loading dashboard…</p></div>
          ) : dashboard ? (
            <>
              {/* Stats Grid */}
              <section className="admin-stats-grid">
                {[
                  { label: "Total Users", value: dashboard.stats.totalUsers, icon: "👥" },
                  { label: "Active Flights", value: dashboard.stats.activeFlights, icon: "✈" },
                  { label: "Total Bookings", value: dashboard.stats.totalBookings, icon: "🎫" },
                  { label: "Cancellations", value: dashboard.stats.totalCancellations, icon: "❌" },
                  { label: "Booking Value", value: formatPrice(dashboard.stats.totalRevenue), icon: "₹" },
                  { label: "Total Flights", value: dashboard.stats.totalFlights, icon: "🛫" },
                ].map(s => (
                  <div className="admin-stat-card" key={s.label}>
                    <div className="admin-stat-icon">{s.icon}</div>
                    <div>
                      <span className="admin-stat-label">{s.label}</span>
                      <strong className="admin-stat-value">{s.value}</strong>
                    </div>
                  </div>
                ))}
              </section>

              {/* Date Range Filter */}
              <section className="admin-date-filter">
                <div className="admin-date-filter-inner">
                  <label>From <input type="date" value={rangeStart} max={rangeEnd} onChange={e => { setLoading(true); setRangeStart(e.target.value); }} /></label>
                  <label>Through <input type="date" value={rangeEnd} min={rangeStart} max={initialAdminRangeEnd} onChange={e => { setLoading(true); setRangeEnd(e.target.value); }} /></label>
                  <button type="button" className="secondary-btn" onClick={loadDashboard}>Refresh</button>
                </div>
                <p className="admin-disclaimer">Booking value reflects confirmed reservations. Payment collection is not integrated.</p>
              </section>

              {/* Charts */}
              <section className="admin-analytics-grid">
                <article className="admin-card admin-chart-card">
                  <div className="admin-card-header"><h3>📈 Booking Trend</h3></div>
                  <div className="admin-bar-chart">
                    {dashboard.bookingTrend.map(p => {
                      const max = Math.max(1, ...dashboard.bookingTrend.map(x => Number(x.count)));
                      return (
                        <div className="admin-chart-column" key={p.date} title={`${p.date}: ${p.count} bookings`}>
                          <span style={{ height: `${Math.max(4, (Number(p.count) / max) * 100)}%` }} />
                          <small>{String(p.date).slice(5)}</small>
                        </div>
                      );
                    })}
                  </div>
                </article>
                <article className="admin-card admin-chart-card">
                  <div className="admin-card-header"><h3>💰 Revenue Trend</h3></div>
                  <div className="admin-bar-chart">
                    {dashboard.revenueTrend.map(p => {
                      const max = Math.max(1, ...dashboard.revenueTrend.map(x => Number(x.revenue)));
                      return (
                        <div className="admin-chart-column revenue" key={p.date} title={`${p.date}: ${formatPrice(Number(p.revenue))}`}>
                          <span style={{ height: `${Math.max(4, (Number(p.revenue) / max) * 100)}%` }} />
                          <small>{String(p.date).slice(5)}</small>
                        </div>
                      );
                    })}
                  </div>
                </article>
                <article className="admin-card">
                  <div className="admin-card-header"><h3>🎯 Booking Status</h3></div>
                  <div className="admin-status-list">
                    {Object.entries(dashboard.stats.bookingStatusDistribution || {}).map(([s, c]) => (
                      <div className="admin-status-row" key={s}><span className={`admin-status-dot status-${s.toLowerCase()}`}></span><span>{s}</span><strong>{String(c)}</strong></div>
                    ))}
                  </div>
                </article>
                <article className="admin-card">
                  <div className="admin-card-header"><h3>🌍 Top Destinations</h3></div>
                  <div className="admin-destination-list">
                    {dashboard.popularDestinations.length === 0
                      ? <p className="admin-empty-state">No booking data yet.</p>
                      : dashboard.popularDestinations.map(d => (
                        <div className="admin-destination-row" key={d.destination}>
                          <span>{d.destination}</span>
                          <strong>{d.bookingCount} booking{d.bookingCount !== 1 ? "s" : ""}</strong>
                        </div>
                      ))}
                  </div>
                </article>
              </section>

              {/* Create Flight */}
              <section className="admin-card admin-flights-section">
                <div className="admin-card-header"><h3>✈ Create New Flight</h3></div>
                <form onSubmit={handleCreateFlight} className="admin-flight-form">
                  <div className="admin-form-grid">
                    <label>Flight No.<input value={flightForm.flightNumber} onChange={e => setFlightForm(p => ({ ...p, flightNumber: e.target.value }))} placeholder="SK-999" required /></label>
                    <label>Airline<input value={flightForm.airline} onChange={e => setFlightForm(p => ({ ...p, airline: e.target.value }))} placeholder="SkyBook Airlines" /></label>
                    <label>Origin<input value={flightForm.origin} onChange={e => setFlightForm(p => ({ ...p, origin: e.target.value }))} placeholder="Mumbai (BOM)" required /></label>
                    <label>Destination<input value={flightForm.destination} onChange={e => setFlightForm(p => ({ ...p, destination: e.target.value }))} placeholder="Delhi (DEL)" required /></label>
                    <label>Date<input type="date" value={flightForm.departureDate} onChange={e => setFlightForm(p => ({ ...p, departureDate: e.target.value }))} required /></label>
                    <label>Departure<input value={flightForm.departureTime} onChange={e => setFlightForm(p => ({ ...p, departureTime: e.target.value }))} placeholder="08:00 AM" /></label>
                    <label>Arrival<input value={flightForm.arrivalTime} onChange={e => setFlightForm(p => ({ ...p, arrivalTime: e.target.value }))} placeholder="10:15 AM" /></label>
                    <label>Price (₹)<input type="number" value={flightForm.price} onChange={e => setFlightForm(p => ({ ...p, price: e.target.value }))} placeholder="4999" /></label>
                  </div>
                  <button type="submit" className="primary-btn" disabled={submitting}>{submitting ? "Creating…" : "Create Flight"}</button>
                </form>
              </section>

              {/* Flights Table */}
              <section className="admin-card">
                <div className="admin-card-header"><h3>✈ All Flights</h3></div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Flight</th><th>Route</th><th>Date & Time</th><th>Price</th><th>Seats</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {dashboard.flights.map(f => (
                        <tr key={f.id} className={!f.isActive ? "row-inactive" : ""}>
                          <td><strong>{f.flightNumber}</strong><br /><small>{f.airline}</small></td>
                          <td>{f.origin}<br />→ {f.destination}</td>
                          <td>{f.departureDate}<br /><small>{f.departureTime}</small></td>
                          <td>{formatPrice(f.price)}</td>
                          <td>{f.availableSeats}</td>
                          <td><span className={`status-chip ${f.isActive ? "chip-active" : "chip-inactive"}`}>{f.isActive ? f.status : "Inactive"}</span></td>
                          <td>{f.isActive && <button type="button" className="cancel-booking-btn" onClick={() => handleDeactivate(f.id)}>Deactivate</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Users */}
              <section className="admin-card admin-users-section">
                <div className="admin-card-header"><h3>👥 Users</h3></div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {dashboard.users.map(u => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td><span className={`role-chip ${u.role === "ADMIN" ? "chip-admin" : "chip-user"}`}>{u.role}</span></td>
                          <td><small>{(u as Record<string, unknown>).createdAt ? String((u as Record<string, unknown>).createdAt).slice(0, 10) : "—"}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Bookings */}
              <section className="admin-card admin-bookings-section">
                <div className="admin-card-header"><h3>🎫 Bookings</h3></div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>PNR</th><th>Passenger</th><th>Route</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {dashboard.bookings.map(b => (
                        <tr key={b.id}>
                          <td><code>{b.pnr}</code></td>
                          <td>{b.passengerName}</td>
                          <td>{b.origin} → {b.destination}</td>
                          <td>{formatPrice(Number(b.totalPrice || 0))}</td>
                          <td><span className={`status-chip ${b.status === "CONFIRMED" ? "chip-confirmed" : "chip-cancelled"}`}>{b.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="admin-empty-state">No dashboard data available.</div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  // Routing
  const [route, setRoute] = useState<string>(() => window.location.pathname);
  useEffect(() => {
    const handler = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Theme
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem("skybook-theme") === "dark");
  useEffect(() => {
    localStorage.setItem("skybook-theme", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);
  useEffect(() => {
    const h = (e: Event) => setDarkMode(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("skybook:theme-change", h);
    return () => window.removeEventListener("skybook:theme-change", h);
  }, []);

  // UI State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [ticketModalBooking, setTicketModalBooking] = useState<Booking | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [destFilter, setDestFilter] = useState<"all" | "domestic" | "international">("all");

  // Search state
  const [tripType, setTripType] = useState<"Round Trip" | "One Way">("Round Trip");
  const [from, setFrom] = useState("Mumbai (BOM)");
  const [to, setTo] = useState("Delhi (DEL)");
  const [departureDate, setDepartureDate] = useState(initialDepartureDate);
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [travelers, setTravelers] = useState("1");
  const [searchResults, setSearchResults] = useState<Flight[]>([]);
  const [returnResults, setReturnResults] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedReturnFlight, setSelectedReturnFlight] = useState<Flight | null>(null);
  const [flightDetails, setFlightDetails] = useState<FlightDetails | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerDetails, setPassengerDetails] = useState<PassengerDetail[]>([{ title: "Mr", name: "", gender: "Adult" }]);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");

  // Loading state
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // Notices
  const [searchNotice, setSearchNotice] = useState<Notice | null>(null);
  const [bookingNotice, setBookingNotice] = useState<Notice | null>(null);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null);
  const [newsletterNotice, setNewsletterNotice] = useState<Notice | null>(null);

  // Auth
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authNotice, setAuthNotice] = useState<Notice | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; email: string; role?: string } | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("skybook-token"));
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(() => Boolean(localStorage.getItem("skybook-token")));
  const [myBookingsError, setMyBookingsError] = useState<string | null>(null);
  const [bookingsReloadKey, setBookingsReloadKey] = useState(0);
  const [pendingBooking, setPendingBooking] = useState(false);

  // Status
  const [statusInput, setStatusInput] = useState("SK-101");
  const [statusResult, setStatusResult] = useState<FlightStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Newsletter
  const [newsletterEmail, setNewsletterEmail] = useState("");

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: "bot", text: "Hi! I'm your SkyBook travel assistant. How can I help you today?", time: "Just now" },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Destination search / airport suggestions
  const [fromSuggestOpen, setFromSuggestOpen] = useState(false);
  const [toSuggestOpen, setToSuggestOpen] = useState(false);
  const [fromQuery, setFromQuery] = useState("Mumbai (BOM)");
  const [toQuery, setToQuery] = useState("Delhi (DEL)");
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  // Derived
  const travelerCount = Math.max(1, parseInt(travelers, 10) || 1);
  const { totalPrice: quotedTotal, discount: quotedDiscount } = previewTotal(selectedFlight?.price || 0, travelerCount, promoCode, selectedFlight);

  // ── Side effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    const h = () => { setToken(null); setCurrentUser(null); setMyBookings([]); setAuthMode("login"); setAuthNotice({ type: "error", text: "Session expired. Please log in again." }); navigate("/login"); };
    window.addEventListener("skybook:unauthorized", h);
    return () => window.removeEventListener("skybook:unauthorized", h);
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/auth/profile", {}, true)
      .then(d => { setCurrentUser(d.user); if (d.user?.email) setContactEmail(prev => prev || d.user.email); })
      .catch(() => { localStorage.removeItem("skybook-token"); setToken(null); setCurrentUser(null); });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const c = new AbortController();
    apiFetch("/api/bookings", { signal: c.signal }, true)
      .then(d => { setMyBookings(d.bookings || []); setMyBookingsError(null); })
      .catch(e => { if (!c.signal.aborted) { setMyBookings([]); setMyBookingsError(e instanceof Error ? e.message : "Unable to load bookings."); } })
      .finally(() => { if (!c.signal.aborted) setMyBookingsLoading(false); });
    return () => c.abort();
  }, [token, bookingsReloadKey]);

  useEffect(() => { if (chatOpen) chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!fromRef.current?.contains(e.target as Node)) setFromSuggestOpen(false);
      if (!toRef.current?.contains(e.target as Node)) setToSuggestOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const filteredFromAirports = ALL_AIRPORTS.filter(a =>
    fromQuery.length < 2 || a.name.toLowerCase().includes(fromQuery.toLowerCase()) || a.city.toLowerCase().includes(fromQuery.toLowerCase()) || a.code.toLowerCase().includes(fromQuery.toLowerCase())
  ).slice(0, 8);

  const filteredToAirports = ALL_AIRPORTS.filter(a =>
    (toQuery.length < 2 || a.name.toLowerCase().includes(toQuery.toLowerCase()) || a.city.toLowerCase().includes(toQuery.toLowerCase()) || a.code.toLowerCase().includes(toQuery.toLowerCase())) &&
    a.name !== from
  ).slice(0, 8);

  const selectFrom = (airport: Destination) => {
    setFrom(airport.name);
    setFromQuery(airport.name);
    setFromSuggestOpen(false);
    if (to === airport.name) { setTo(""); setToQuery(""); }
  };

  const selectTo = (airport: Destination) => {
    setTo(airport.name);
    setToQuery(airport.name);
    setToSuggestOpen(false);
  };

  const adjustPassengers = (val: string) => {
    const n = Math.max(1, Math.min(9, parseInt(val, 10) || 1));
    setTravelers(String(n));
    setPassengerDetails(prev => {
      const next = [...prev];
      while (next.length < n) next.push({ title: "Mr", name: "", gender: "Adult" });
      if (next.length > n) next.splice(n);
      return next;
    });
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!from.trim() || !to.trim()) { setSearchNotice({ type: "error", text: "Please select both origin and destination." }); return; }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) { setSearchNotice({ type: "error", text: "Origin and destination must be different cities." }); return; }
    if (!departureDate) { setSearchNotice({ type: "error", text: "Please select a departure date." }); return; }
    try {
      setIsSearching(true);
      setSearchNotice({ type: "info", text: "Searching available flights…" });
      const params = new URLSearchParams({ from: from.trim(), to: to.trim(), departureDate });
      const data = await apiFetch(`/api/flights/search?${params}`);
      const flights: Flight[] = data.flights || [];
      let inbound: Flight[] = [];
      if (tripType === "Round Trip") {
        if (!returnDate) { setSearchNotice({ type: "error", text: "Please select a return date." }); setIsSearching(false); return; }
        if (returnDate < departureDate) { setSearchNotice({ type: "error", text: "Return date cannot be before departure." }); setIsSearching(false); return; }
        const rp = new URLSearchParams({ from: to.trim(), to: from.trim(), departureDate: returnDate });
        const rd = await apiFetch(`/api/flights/search?${rp}`);
        inbound = rd.flights || [];
      }
      setSearchResults(flights);
      setReturnResults(inbound);
      setSelectedFlight(null);
      setSelectedReturnFlight(null);
      setFlightDetails(null);
      setSelectedSeats([]);
      setBookingNotice(null);
      if (flights.length === 0) {
        setSearchNotice({ type: "info", text: `No flights found from ${getCity(from)} to ${getCity(to)} on ${departureDate}. Try another date or destination.` });
      } else {
        setSearchNotice({ type: "success", text: inbound.length ? `Found ${flights.length} outbound and ${inbound.length} return flights.` : `Found ${flights.length} flight${flights.length !== 1 ? "s" : ""}.` });
        setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (e) {
      setSearchNotice({ type: "error", text: e instanceof Error ? e.message : "Search failed." });
    } finally { setIsSearching(false); }
  };

  const handleSelectFlight = async (flight: Flight, isReturn = false) => {
    try {
      setIsLoadingDetails(true);
      if (isReturn) setSelectedReturnFlight(flight); else setSelectedFlight(flight);
      setSelectedSeats([]);
      setBookingNotice(null);
      const data = await apiFetch(`/api/flights/${flight.id}`);
      setFlightDetails(data.flight);
      setTimeout(() => document.getElementById("booking-panel")?.scrollIntoView({ behavior: "smooth" }), 150);
    } catch (e) {
      setBookingNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to load flight details." });
    } finally { setIsLoadingDetails(false); }
  };

  const handleSeatToggle = (seatNumber: string) => {
    if (!flightDetails) return;
    const seat = flightDetails.seats.find(s => s.seatNumber === seatNumber);
    if (!seat || seat.status !== "available") return;
    if (selectedSeats.includes(seatNumber)) {
      setSelectedSeats(prev => prev.filter(s => s !== seatNumber));
      return;
    }
    if (selectedSeats.length >= travelerCount) {
      setBookingNotice({ type: "error", text: `You've selected ${selectedSeats.length} seat(s). Maximum for ${travelerCount} traveler(s).` });
      return;
    }
    setSelectedSeats(prev => [...prev, seatNumber]);
    setBookingNotice(null);
  };

  const submitBooking = async (): Promise<boolean> => {
    if (!selectedFlight || !flightDetails) { setBookingNotice({ type: "error", text: "Please select a flight first." }); return false; }
    const activeToken = token || localStorage.getItem("skybook-token");
    if (!activeToken) { setPendingBooking(true); navigate("/login"); return false; }
    const emptyIdx = passengerDetails.findIndex(p => !p.name.trim());
    if (emptyIdx !== -1) { setBookingNotice({ type: "error", text: `Please enter the full name for Traveler #${emptyIdx + 1}.` }); return false; }
    if (selectedSeats.length !== travelerCount) { setBookingNotice({ type: "error", text: `Please select exactly ${travelerCount} seat(s) on the cabin map.` }); return false; }
    try {
      setIsSubmittingBooking(true);
      setBookingNotice({ type: "info", text: "Securing your seats and generating PNR…" });
      const data = await apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          flightId: selectedFlight.id, travelDate: selectedFlight.departureDate,
          passengerName: passengerDetails.map(p => `${p.title} ${p.name}`.trim()).join(", "),
          passengers: JSON.stringify(passengerDetails),
          contactEmail: contactEmail.trim(), contactPhone: contactPhone.trim(),
          seatNumbers: selectedSeats, travelers: travelerCount,
          promoCode: promoCode.trim().toUpperCase() || undefined,
        }),
      }, true);
      const confirmed: Booking = data.booking;
      setBookingNotice({ type: "success", text: `Booking confirmed! PNR: ${confirmed.pnr}. No payment collected (demo).${confirmed.promoCode ? ` Promo ${confirmed.promoCode} applied.` : ""}` });
      setMyBookings(prev => [confirmed, ...prev]);
      setTicketModalBooking(confirmed);
      setPendingBooking(false);
      setSelectedSeats([]);
      setPromoCode("");
      setSelectedFlight(null);
      setSelectedReturnFlight(null);
      setFlightDetails(null);
      return true;
    } catch (e) {
      setPendingBooking(false);
      setBookingNotice({ type: "error", text: e instanceof Error ? e.message : "Booking failed." });
      return false;
    } finally { setIsSubmittingBooking(false); }
  };

  const handleBookingSubmit = async (e: React.FormEvent) => { e.preventDefault(); await submitBooking(); };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isReg = route === "/register" || authMode === "register";
    const payload = isReg ? { name: authForm.name.trim(), email: authForm.email.trim(), password: authForm.password } : { email: authForm.email.trim(), password: authForm.password };
    if (isReg && !(payload as typeof payload & { name: string }).name) { setAuthNotice({ type: "error", text: "Please enter your full name." }); return; }
    if (!payload.email || !payload.password) { setAuthNotice({ type: "error", text: "Email and password are required." }); return; }
    try {
      setAuthNotice({ type: "info", text: isReg ? "Creating your account…" : "Signing in…" });
      if (isReg) { await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }); }
      const loginData = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: payload.email, password: payload.password }) });
      localStorage.setItem("skybook-token", loginData.token);
      setToken(loginData.token);
      try {
        const profileData = await apiFetch("/api/auth/profile", {}, true);
        setCurrentUser(profileData.user ?? { id: 0, name: payload.email.split("@")[0], email: payload.email });
        if (profileData.user?.email && !contactEmail) setContactEmail(profileData.user.email);
      } catch {
        setCurrentUser({ id: 0, name: payload.email.split("@")[0], email: payload.email });
      }
      setAuthForm({ name: "", email: "", password: "" });
      setAuthNotice(null);
      navigate("/");
      if (pendingBooking) await submitBooking();
    } catch (e) { setAuthNotice({ type: "error", text: e instanceof Error ? e.message : "Authentication failed." }); }
  };

  const handleStatusLookup = async () => {
    if (!statusInput.trim()) { setStatusNotice({ type: "error", text: "Enter a flight number." }); return; }
    try {
      setStatusLoading(true);
      setStatusNotice({ type: "info", text: "Looking up flight…" });
      const data = await apiFetch(`/api/flights/status?flightNumber=${encodeURIComponent(statusInput.trim())}`);
      setStatusResult(data.flight);
      setStatusNotice({ type: "success", text: `Flight ${data.flight.flightNumber}: ${data.flight.status}` });
    } catch (e) {
      setStatusResult(null);
      setStatusNotice({ type: "error", text: e instanceof Error ? e.message : "Flight not found." });
    } finally { setStatusLoading(false); }
  };

  const handleNewsletterSubmit = async () => {
    if (!newsletterEmail.trim()) { setNewsletterNotice({ type: "error", text: "Enter your email." }); return; }
    try {
      const d = await apiFetch("/api/newsletter", { method: "POST", body: JSON.stringify({ email: newsletterEmail.trim() }) });
      setNewsletterNotice({ type: "success", text: d.message || "Subscribed!" });
      setNewsletterEmail("");
    } catch (e) { setNewsletterNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to subscribe." }); }
  };

  const handleCancelBooking = async (id: number) => {
    try {
      await apiFetch(`/api/bookings/${id}/cancel`, { method: "POST" }, true);
      setMyBookings(prev => prev.map(b => b.id === id ? { ...b, status: "CANCELLED" } : b));
      setCancelModalBooking(null);
      setBookingNotice({ type: "success", text: "Booking cancelled and seats released." });
    } catch (e) { setBookingNotice({ type: "error", text: e instanceof Error ? e.message : "Unable to cancel booking." }); }
  };

  const handleDestinationClick = (dest: Destination) => {
    setTo(dest.name);
    setToQuery(dest.name);
    setFrom("Mumbai (BOM)");
    setFromQuery("Mumbai (BOM)");
    setTripType("One Way");
    setTimeout(() => {
      document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
      handleSearch();
    }, 150);
  };

  const handleApplyPromo = (code: string) => {
    setPromoCode(code);
    setBookingNotice({ type: "success", text: `Promo code ${code} applied!` });
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleChat = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatMessages(prev => [...prev, { sender: "user", text: trimmed, time: timeStr }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await apiFetch("/api/chat", { method: "POST", body: JSON.stringify({ message: trimmed }) });
      setChatMessages(prev => [...prev, { sender: "bot", text: data.reply, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } catch {
      setChatMessages(prev => [...prev, { sender: "bot", text: "I can help with flights, promo codes (FLYINDIA, WELCOME, WORLD20), baggage, and more!", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } finally { setChatLoading(false); }
  };

  // ── Routing ───────────────────────────────────────────────────────────────

  if (route.startsWith("/admin")) {
    return <AdminPanel currentUser={currentUser} token={token} setCurrentUser={setCurrentUser} setToken={setToken} route={route} />;
  }

  if (route === "/login" || route === "/register") {
    const isReg = route === "/register";
    return (
      <main className={darkMode ? "auth-page dark" : "auth-page"}>
        <div className="auth-page-bg" aria-hidden="true">
          <div className="auth-bg-plane">✈</div>
        </div>
        <section className="auth-page-panel">
          <button type="button" className="text-btn auth-back-btn" onClick={() => navigate("/")} aria-label="Back to home">← SkyBook</button>
          <div className="auth-logo"><span className="logo-icon">✈</span> Sky<span>Book</span></div>
          <span className="admin-badge">SKYBOOK ACCOUNT</span>
          <h1>{isReg ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-sub">{isReg ? "Join thousands of travelers on SkyBook." : "Sign in to manage your bookings and fare watches."}</p>
          <form className="auth-form" onSubmit={handleAuthSubmit} noValidate>
            {isReg && (
              <label htmlFor="auth-name">Full name
                <input id="auth-name" className="booking-field" required autoComplete="name" placeholder="e.g. Rahul Sharma" value={authForm.name} onChange={e => setAuthForm(p => ({ ...p, name: e.target.value }))} />
              </label>
            )}
            <label htmlFor="auth-email">Email address
              <input id="auth-email" className="booking-field" type="email" required autoComplete="email" placeholder="e.g. traveler@gmail.com" value={authForm.email} onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} />
            </label>
            <label htmlFor="auth-password">Password
              <input id="auth-password" className="booking-field" type="password" required minLength={6} autoComplete={isReg ? "new-password" : "current-password"} placeholder="At least 6 characters" value={authForm.password} onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} />
            </label>
            {authNotice && <div className={`state-box ${authNotice.type}`}><span className="state-icon">{authNotice.type === "success" ? "✓" : authNotice.type === "error" ? "⚠" : "ℹ"}</span>{authNotice.text}</div>}
            <button className="primary-btn auth-submit" type="submit">{isReg ? "Create account" : "Sign in"}</button>
            {!isReg && (
              <button type="button" className="auth-demo-btn" onClick={() => setAuthForm({ name: "", email: "demo@skybook.com", password: "password" })}>
                Use demo account
              </button>
            )}
          </form>
          <p className="auth-route-switch">
            {isReg ? "Already have an account?" : "New to SkyBook?"}{" "}
            <button type="button" className="text-btn" onClick={() => navigate(isReg ? "/login" : "/register")}>{isReg ? "Sign in" : "Register free"}</button>
          </p>
        </section>
      </main>
    );
  }

  if (["/flight-status", "/dashboard", "/planner", "/fare-watches", "/notifications"].includes(route)) {
    return <FeaturePage route={route} token={token} onNavigate={navigate} onBookFlight={async (rec, tc) => {
      const f: Flight = { id: rec.flightId, flightNumber: rec.flightNumber, airline: rec.airline, origin: rec.origin, destination: rec.destination, departureDate: rec.departureDate, departureTime: rec.departureTime, arrivalTime: rec.arrivalTime, price: Number(rec.pricePerPerson), status: rec.status, availableSeats: rec.availableSeats };
      setFrom(f.origin); setFromQuery(f.origin);
      setTo(f.destination); setToQuery(f.destination);
      setDepartureDate(f.departureDate);
      adjustPassengers(String(tc));
      setTripType("One Way");
      navigate("/");
      await handleSelectFlight(f);
    }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN HOME PAGE
  // ─────────────────────────────────────────────────────────────────────────

  const filteredDests = FEATURED_DESTINATIONS.filter(d => destFilter === "all" || d.region === destFilter);

  return (
    <div className={darkMode ? "app dark" : "app"}>
      {/* ── NAVBAR ── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <a href="/" className="logo" onClick={e => { e.preventDefault(); navigate("/"); setMobileMenuOpen(false); }} aria-label="SkyBook Home">
          <span className="logo-icon" aria-hidden="true">✈</span> Sky<span>Book</span>
        </a>

        <div className={`nav-links ${mobileMenuOpen ? "open" : ""}`} role="menubar">
          <a href="/#home" role="menuitem" onClick={() => setMobileMenuOpen(false)}>Home</a>
          <a href="/#search" role="menuitem" onClick={() => setMobileMenuOpen(false)}>Flights</a>
          <a href="/#offers" role="menuitem" onClick={() => setMobileMenuOpen(false)}>Offers</a>
          <a href="/#destinations" role="menuitem" onClick={() => setMobileMenuOpen(false)}>Destinations</a>
          <a href="/flight-status" role="menuitem" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/flight-status"); }}>Flight Status</a>
          {currentUser && <a href="/#bookings" role="menuitem" onClick={() => setMobileMenuOpen(false)}>My Bookings{myBookings.length > 0 && <span className="badge-count">{myBookings.length}</span>}</a>}
          {isAdminRole(currentUser?.role) && <button type="button" className="nav-admin-link" role="menuitem" onClick={() => { setMobileMenuOpen(false); navigate("/admin"); }}>Admin</button>}
          {currentUser && <a href="/dashboard" role="menuitem" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/dashboard"); }}>My Dashboard</a>}
          <a href="/planner" role="menuitem" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/planner"); }}>Travel Planner</a>
          <a href="/fare-watches" role="menuitem" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/fare-watches"); }}>Fare Watch</a>
          {currentUser && <a href="/notifications" role="menuitem" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/notifications"); }}>Notifications</a>}
          {!currentUser && <>
            <a href="/login" role="menuitem" className="nav-auth-link" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/login"); }}>Login</a>
            <a href="/register" role="menuitem" className="nav-auth-link nav-register-link" onClick={e => { e.preventDefault(); setMobileMenuOpen(false); navigate("/register"); }}>Register</a>
          </>}
        </div>

        <div className="nav-buttons">
          <button className="dark-btn" type="button" title={`Switch to ${darkMode ? "Light" : "Dark"} Mode`} aria-pressed={darkMode} onClick={() => setDarkMode(m => !m)}>
            {darkMode ? "☀ Light" : "🌙 Dark"}
          </button>
          {currentUser ? (
            <div className="user-nav-dropdown">
              <button className="user-profile-btn" type="button" onClick={() => navigate("/dashboard")} aria-label="My account">
                <span className="user-avatar" aria-hidden="true">{currentUser.name[0]}</span>
                <span className="user-name">{currentUser.name.split(" ")[0]}</span>
              </button>
              <button className="register-btn logout-btn" type="button" onClick={() => { localStorage.removeItem("skybook-token"); setToken(null); setCurrentUser(null); setMyBookings([]); setPendingBooking(false); }}>
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <button className="login-btn" type="button" onClick={() => navigate("/login")}>Login</button>
              <button className="register-btn" type="button" onClick={() => navigate("/register")}>Register</button>
            </>
          )}
          <button className="hamburger-btn" type="button" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(m => !m)}>
            <span className={`hamburger-icon ${mobileMenuOpen ? "open" : ""}`}>
              <span></span><span></span><span></span>
            </span>
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero" id="home" aria-labelledby="hero-heading">
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge" aria-label="Platform tagline">
              <span className="badge-spark" aria-hidden="true">✦</span> INDIA'S SMART FLIGHT BOOKING PLATFORM
            </div>
            <h1 id="hero-heading">
              Explore the World,<br /><span>One Flight at a Time.</span>
            </h1>
            <p>
              Book flights across India and international destinations with SkyBook.
              Compare fares, choose your seat on an interactive cabin map, and manage all your reservations in one place.
            </p>
            <div className="hero-buttons">
              <button className="primary-btn explore-btn" type="button" onClick={() => document.getElementById("search")?.scrollIntoView({ behavior: "smooth" })}>
                Search Flights ✈
              </button>
              <button className="video-btn" type="button" onClick={() => setDemoModalOpen(true)} aria-label="Watch feature demo">
                <span className="play-icon" aria-hidden="true">▶</span> How It Works
              </button>
            </div>
            <div className="hero-stats" role="list">
              <div role="listitem"><h2>20+</h2><p>Destinations</p></div>
              <div role="listitem"><h2>50+</h2><p>Routes</p></div>
              <div role="listitem"><h2>100%</h2><p>Transparent fares</p></div>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-plane-graphic">
              <svg viewBox="0 0 200 200" className="hero-plane-svg" aria-hidden="true">
                <path className="contrail-path" d="M20 150 Q80 80 160 30" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="8 4" />
                <text x="100" y="110" fontSize="80" textAnchor="middle" fill="white" opacity="0.9">✈</text>
              </svg>
              <div className="hero-route-cards">
                <div className="hero-route-card origin"><span>From</span><strong>BOM</strong><small>Mumbai</small></div>
                <div className="hero-route-line">— — —</div>
                <div className="hero-route-card dest"><span>To</span><strong>DXB</strong><small>Dubai</small></div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-scroll-hint" aria-hidden="true">
          <div className="scroll-dot"></div>
        </div>
      </section>

      {/* ── FLIGHT SEARCH ── */}
      <section className="search-section" id="search" aria-labelledby="search-heading">
        <div className="search-container">
          <div className="search-heading-row">
            <h2 id="search-heading" className="search-section-title">Search Available Flights</h2>
            <span className="search-disclaimer">Sample data · Payment not integrated</span>
          </div>

          <div className="trip-types" role="group" aria-label="Trip type">
            {(["Round Trip", "One Way"] as const).map(t => (
              <button key={t} type="button" className={`trip-type-btn ${tripType === t ? "active-trip" : ""}`} onClick={() => setTripType(t)} aria-pressed={tripType === t}>{t}</button>
            ))}
          </div>

          <div className={`search-grid${tripType === "Round Trip" ? " round-trip" : ""}`}>
            {/* From */}
            <div className="input-box autocomplete-box" ref={fromRef}>
              <label htmlFor="from-input">FROM</label>
              <div className="autocomplete-input-wrap">
                <span className="input-icon" aria-hidden="true">🛫</span>
                <input
                  id="from-input"
                  className="search-input"
                  value={fromQuery}
                  placeholder="City or airport"
                  autoComplete="off"
                  onChange={e => { setFromQuery(e.target.value); setFrom(e.target.value); setFromSuggestOpen(true); }}
                  onFocus={() => setFromSuggestOpen(true)}
                  aria-autocomplete="list"
                  aria-expanded={fromSuggestOpen}
                />
              </div>
              {fromSuggestOpen && filteredFromAirports.length > 0 && (
                <ul className="autocomplete-dropdown" role="listbox" aria-label="Origin airports">
                  {filteredFromAirports.map(a => (
                    <li key={a.code} role="option" className="autocomplete-option" onMouseDown={() => selectFrom(a)}>
                      <span className="apt-code">{a.code}</span>
                      <div><strong>{a.city}</strong><small>{a.airport} · {a.country}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Swap */}
            <button className="swap-btn" type="button" title="Swap origin and destination" aria-label="Swap origin and destination" onClick={() => { const t = from; setFrom(to); setFromQuery(to); setTo(t); setToQuery(t); }}>
              ⇄
            </button>

            {/* To */}
            <div className="input-box autocomplete-box" ref={toRef}>
              <label htmlFor="to-input">TO</label>
              <div className="autocomplete-input-wrap">
                <span className="input-icon" aria-hidden="true">🛬</span>
                <input
                  id="to-input"
                  className="search-input"
                  value={toQuery}
                  placeholder="City or airport"
                  autoComplete="off"
                  onChange={e => { setToQuery(e.target.value); setTo(e.target.value); setToSuggestOpen(true); }}
                  onFocus={() => setToSuggestOpen(true)}
                  aria-autocomplete="list"
                  aria-expanded={toSuggestOpen}
                />
              </div>
              {toSuggestOpen && filteredToAirports.length > 0 && (
                <ul className="autocomplete-dropdown" role="listbox" aria-label="Destination airports">
                  {filteredToAirports.map(a => (
                    <li key={a.code} role="option" className="autocomplete-option" onMouseDown={() => selectTo(a)}>
                      <span className="apt-code">{a.code}</span>
                      <div><strong>{a.city}</strong><small>{a.airport} · {a.country}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Dates */}
            <div className="input-box">
              <label htmlFor="dep-date">DEPARTURE</label>
              <div className="autocomplete-input-wrap">
                <span className="input-icon" aria-hidden="true">📅</span>
                <input id="dep-date" type="date" className="search-input" min={new Date().toISOString().slice(0, 10)} value={departureDate} onChange={e => setDepartureDate(e.target.value)} />
              </div>
            </div>

            {tripType === "Round Trip" && (
              <div className="input-box">
                <label htmlFor="ret-date">RETURN</label>
                <div className="autocomplete-input-wrap">
                  <span className="input-icon" aria-hidden="true">📅</span>
                  <input id="ret-date" type="date" className="search-input" min={departureDate} value={returnDate} onChange={e => setReturnDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Travelers */}
            <div className="input-box">
              <label htmlFor="travelers-input">TRAVELERS</label>
              <div className="autocomplete-input-wrap">
                <span className="input-icon" aria-hidden="true">👥</span>
                <select id="travelers-input" className="search-input" value={travelers} onChange={e => adjustPassengers(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Passenger{n > 1 ? "s" : ""}</option>)}
                </select>
              </div>
            </div>

            <button className="search-btn" type="button" disabled={isSearching} onClick={handleSearch} aria-busy={isSearching}>
              {isSearching ? <><span className="btn-spinner" aria-hidden="true"></span> Searching…</> : <>Find Flights ✈</>}
            </button>
          </div>

          {/* Quick popular chips */}
          <div className="quick-airports" aria-label="Quick destination selection">
            <span className="quick-label">Popular:</span>
            {["Goa (GOI)", "Dubai (DXB)", "Bengaluru (BLR)", "Singapore (SIN)", "Srinagar (SXR)"].map(dest => (
              <button key={dest} type="button" className="quick-chip" onClick={() => { setTo(dest); setToQuery(dest); }}>
                {dest.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Search Notice */}
      {searchNotice && (
        <div className={`state-box ${searchNotice.type}`} role="status" aria-live="polite">
          <span className="state-icon" aria-hidden="true">{searchNotice.type === "success" ? "✓" : searchNotice.type === "error" ? "⚠" : "ℹ"}</span>
          {searchNotice.text}
        </div>
      )}

      {/* ── OUTBOUND RESULTS ── */}
      {searchResults.length > 0 && (
        <section className="results-section" id="results" aria-labelledby="results-heading">
          <div className="section-center">
            <span className="section-eyebrow">AVAILABLE FLIGHTS</span>
            <h2 id="results-heading">Outbound: {getCity(from)} → {getCity(to)}</h2>
            <p>Direct flights departing on {departureDate} · Simulated schedule data</p>
          </div>
          <div className="results-grid">
            {searchResults.map(f => {
              const sel = selectedFlight?.id === f.id;
              const dur = calcDuration(f.departureTime, f.arrivalTime);
              return (
                <article key={f.id} className={`result-card ${sel ? "selected-card" : ""}`} aria-selected={sel}>
                  <div className="result-airline-row">
                    <div className="result-airline-info">
                      <div className="airline-dot">{f.airline[0]}</div>
                      <div>
                        <small>{f.airline}</small>
                        <strong>{f.flightNumber}</strong>
                      </div>
                    </div>
                    <span className={`flight-status-badge status-${f.status.toLowerCase().replace(/\s/g, "-")}`}>{f.status}</span>
                  </div>

                  <div className="result-route">
                    <div className="route-terminal">
                      <strong className="iata-code">{getCode(f.origin)}</strong>
                      <small>{getCity(f.origin)}</small>
                      <span className="route-time">{f.departureTime}</span>
                    </div>
                    <div className="route-graphic">
                      <small className="route-duration">{dur}</small>
                      <div className="route-line-visual"><span className="route-plane" aria-hidden="true">✈</span></div>
                      <small className="route-type">Direct</small>
                    </div>
                    <div className="route-terminal">
                      <strong className="iata-code">{getCode(f.destination)}</strong>
                      <small>{getCity(f.destination)}</small>
                      <span className="route-time">{f.arrivalTime}</span>
                    </div>
                  </div>

                  <div className="result-meta-row">
                    <div className="result-meta-item">
                      <small>Date</small>
                      <span>{f.departureDate}</span>
                    </div>
                    <div className="result-meta-item">
                      <small>Seats Left</small>
                      <span className={f.availableSeats < 10 ? "low-seats" : ""}>{f.availableSeats}</span>
                    </div>
                    <div className="result-price">
                      <small>per person</small>
                      <strong className="fare-tag">{formatPrice(f.price)}</strong>
                    </div>
                  </div>

                  <button
                    className={`result-btn primary-btn ${sel ? "active-flight-btn" : ""}`}
                    type="button"
                    disabled={isLoadingDetails && sel}
                    onClick={() => handleSelectFlight(f, false)}
                    aria-pressed={sel}
                  >
                    {isLoadingDetails && sel ? "Loading seat map…" : sel ? "✓ Selected — Choose Seats Below" : "Select This Flight"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── RETURN RESULTS ── */}
      {tripType === "Round Trip" && returnResults.length > 0 && (
        <section className="results-section return-results-section" aria-labelledby="return-heading">
          <div className="section-center">
            <span className="section-eyebrow">RETURN FLIGHTS</span>
            <h2 id="return-heading">Return: {getCity(to)} → {getCity(from)}</h2>
            <p>Returning on {returnDate}</p>
          </div>
          <div className="results-grid">
            {returnResults.map(f => {
              const sel = selectedReturnFlight?.id === f.id;
              return (
                <article key={`ret-${f.id}`} className={`result-card ${sel ? "selected-card" : ""}`} aria-selected={sel}>
                  <div className="result-airline-row">
                    <div className="result-airline-info">
                      <div className="airline-dot">{f.airline[0]}</div>
                      <div><small>{f.airline}</small><strong>{f.flightNumber}</strong></div>
                    </div>
                    <span className={`flight-status-badge status-${f.status.toLowerCase().replace(/\s/g, "-")}`}>{f.status}</span>
                  </div>
                  <div className="result-route">
                    <div className="route-terminal"><strong className="iata-code">{getCode(f.origin)}</strong><small>{getCity(f.origin)}</small><span className="route-time">{f.departureTime}</span></div>
                    <div className="route-graphic"><small className="route-duration">{calcDuration(f.departureTime, f.arrivalTime)}</small><div className="route-line-visual"><span className="route-plane" aria-hidden="true">✈</span></div><small className="route-type">Direct</small></div>
                    <div className="route-terminal"><strong className="iata-code">{getCode(f.destination)}</strong><small>{getCity(f.destination)}</small><span className="route-time">{f.arrivalTime}</span></div>
                  </div>
                  <div className="result-meta-row">
                    <div className="result-meta-item"><small>Return Date</small><span>{f.departureDate}</span></div>
                    <div className="result-meta-item"><small>Seats</small><span className={f.availableSeats < 10 ? "low-seats" : ""}>{f.availableSeats}</span></div>
                    <div className="result-price"><small>per person</small><strong className="fare-tag">{formatPrice(f.price)}</strong></div>
                  </div>
                  <button className={`result-btn primary-btn ${sel ? "active-flight-btn" : ""}`} type="button" onClick={() => handleSelectFlight(f, true)} aria-pressed={sel}>
                    {sel ? "✓ Return Flight Selected" : "Select Return Flight"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── BOOKING PANEL ── */}
      {selectedFlight && flightDetails && (
        <section className="booking-panel" id="booking-panel" aria-labelledby="booking-heading">
          <div className="booking-summary">
            <div>
              <span className="booking-eyebrow">STEP 2 · SEAT SELECTION</span>
              <h2 id="booking-heading">Choose Seats &amp; Enter Passenger Details</h2>
              <p>Select your seat on the aircraft cabin map, then fill in passenger information.</p>
            </div>
            <div className="summary-tags" role="list">
              <span className="tag-pill tag-flight" role="listitem">✈ {flightDetails.flightNumber}</span>
              <span className="tag-pill tag-route" role="listitem">{flightDetails.origin} → {flightDetails.destination}</span>
              <span className="tag-pill tag-date" role="listitem">{flightDetails.departureDate}</span>
              <span className="tag-pill tag-time" role="listitem">{flightDetails.departureTime}</span>
            </div>
          </div>

          <div className="booking-layout">
            {/* Seat Map */}
            <div className="seat-panel">
              <div className="seat-header">
                <div>
                  <h3>Aircraft Cabin Map</h3>
                  <small>{selectedSeats.length}/{travelerCount} seat(s) selected</small>
                </div>
                <div className="seat-legend" role="list">
                  <span role="listitem"><span className="seat-dot available" aria-hidden="true"></span>Available</span>
                  <span role="listitem"><span className="seat-dot selected" aria-hidden="true"></span>Selected</span>
                  <span role="listitem"><span className="seat-dot booked" aria-hidden="true"></span>Booked</span>
                </div>
              </div>

              <div className="cabin-cockpit" aria-label="Aircraft front">
                <div className="cockpit-nose" aria-hidden="true"></div>
                <span>COCKPIT / FRONT</span>
              </div>

              <div className="cabin-container">
                <div className="cabin-aisle-headers" aria-hidden="true">
                  <span className="col-label">A</span>
                  <span className="col-label">B</span>
                  <span className="aisle-spacer">AISLE</span>
                  <span className="col-label">C</span>
                  <span className="col-label">D</span>
                </div>
                <div className="cabin-rows" role="grid" aria-label="Seat map">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(row => {
                    const rowSeats = flightDetails.seats.filter(s => parseInt(s.seatNumber.replace(/\D/g, ""), 10) === row);
                    const isBiz = row <= 2;
                    const renderSeat = (col: string) => {
                      const seat = rowSeats.find(s => s.seatNumber.startsWith(col));
                      if (!seat) return <div className="seat-empty" key={`${col}${row}-empty`} aria-hidden="true" />;
                      const booked = seat.status === "booked";
                      const sel = selectedSeats.includes(seat.seatNumber);
                      return (
                        <button
                          key={seat.seatNumber}
                          type="button"
                          role="gridcell"
                          className={`cabin-seat${booked ? " booked" : ""}${sel ? " selected" : ""}${isBiz ? " biz-seat" : ""}`}
                          disabled={booked}
                          aria-label={`Seat ${seat.seatNumber} — ${booked ? "Booked" : sel ? "Selected" : "Available"}${isBiz ? " (Business)" : ""}`}
                          onClick={() => handleSeatToggle(seat.seatNumber)}
                        >
                          <span className="seat-num">{seat.seatNumber}</span>
                          {sel && <span className="seat-check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    };
                    return (
                      <div key={`row-${row}`} className={`cabin-row${isBiz ? " business-row" : ""}`} role="row" aria-label={`Row ${row}${isBiz ? " (Business)" : ""}`}>
                        <div className="row-badge">Row {row}{isBiz && <span className="biz-badge">Biz</span>}</div>
                        <div className="row-side left-side">{renderSeat("A")}{renderSeat("B")}</div>
                        <div className="cabin-center-aisle" aria-hidden="true"></div>
                        <div className="row-side right-side">{renderSeat("C")}{renderSeat("D")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedSeats.length > 0 && (
                <div className="selected-seats-badge" role="status">
                  Selected: {selectedSeats.map(s => <span key={s} className="seat-badge-chip">{s}</span>)}
                </div>
              )}
            </div>

            {/* Booking Form */}
            <div className="booking-form-wrapper">
              <form className="booking-form" onSubmit={handleBookingSubmit} noValidate>
                <div className="form-heading">
                  <h3>Passenger Information</h3>
                  <p>Names must match government-issued ID</p>
                </div>

                {passengerDetails.map((p, i) => (
                  <div key={`pax-${i}`} className="passenger-input-block">
                    <label className="passenger-label">
                      Passenger {i + 1}
                      {selectedSeats[i] && <span className="assigned-seat-chip">Seat {selectedSeats[i]}</span>}
                    </label>
                    <div className="passenger-row-fields">
                      <select className="title-select" value={p.title} onChange={e => setPassengerDetails(prev => { const c = [...prev]; c[i] = { ...c[i], title: e.target.value }; return c; })} aria-label={`Title for passenger ${i + 1}`}>
                        {["Mr", "Ms", "Mrs", "Dr"].map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input
                        className="booking-field passenger-name-input"
                        type="text"
                        required
                        value={p.name}
                        placeholder="Full Legal Name"
                        aria-label={`Full name for passenger ${i + 1}`}
                        onChange={e => setPassengerDetails(prev => { const c = [...prev]; c[i] = { ...c[i], name: e.target.value }; return c; })}
                      />
                    </div>
                  </div>
                ))}

                <div className="contact-details-grid">
                  <div>
                    <label htmlFor="contact-email">Contact Email</label>
                    <input id="contact-email" className="booking-field" type="email" value={contactEmail} placeholder="traveler@gmail.com" onChange={e => setContactEmail(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="contact-phone">Mobile Phone</label>
                    <input id="contact-phone" className="booking-field" type="tel" value={contactPhone} placeholder="+91 98765 43210" onChange={e => setContactPhone(e.target.value)} />
                  </div>
                </div>

                <div className="booking-field-group">
                  <label htmlFor="promo-code">Promo Code</label>
                  <input id="promo-code" className="booking-field" value={promoCode} placeholder="FLYINDIA / WELCOME / WORLD20" onChange={e => setPromoCode(e.target.value)} />
                  <small className="promo-hint">Domestic: <b>FLYINDIA</b> (30% off) · Any: <b>WELCOME</b> (₹1,000 off) · Intl: <b>WORLD20</b> (20% off)</small>
                </div>

                <div className="fare-summary-card" role="region" aria-label="Fare breakdown">
                  <div className="fare-line"><span>Base fare ({travelerCount} × {formatPrice(selectedFlight.price)})</span><span>{formatPrice(selectedFlight.price * travelerCount)}</span></div>
                  <div className="fare-line"><span>Taxes & fees</span><span>₹0 (Included)</span></div>
                  {quotedDiscount > 0 && <div className="fare-line discount-row"><span>Promo discount ({promoCode.toUpperCase()})</span><span className="discount-value">−{formatPrice(quotedDiscount)}</span></div>}
                  <div className="fare-line total-row"><span>Total Amount Due</span><strong className="grand-total">{formatPrice(quotedTotal)}</strong></div>
                  <p className="fare-disclaimer">Payment processing is not integrated. No charge will be made.</p>
                </div>

                <button className="booking-btn primary-btn confirm-book-btn" type="submit" disabled={isSubmittingBooking} aria-busy={isSubmittingBooking}>
                  {isSubmittingBooking ? <><span className="btn-spinner" aria-hidden="true"></span> Confirming…</> : `Confirm Booking • ${formatPrice(quotedTotal)}`}
                </button>

                {bookingNotice && (
                  <div className={`state-box ${bookingNotice.type}`} role="alert">
                    <span className="state-icon" aria-hidden="true">{bookingNotice.type === "success" ? "✓" : bookingNotice.type === "error" ? "⚠" : "ℹ"}</span>
                    {bookingNotice.text}
                  </div>
                )}
              </form>
            </div>
          </div>
        </section>
      )}

      {/* ── MY BOOKINGS ── */}
      <section className="bookings-section" id="bookings" aria-labelledby="bookings-heading">
        <div className="section-center">
          <span className="section-eyebrow">MANAGE RESERVATIONS</span>
          <h2 id="bookings-heading">My Bookings</h2>
          <p>View, manage, and cancel your SkyBook reservations.</p>
        </div>

        <div className="bookings-shell">
          {myBookingsLoading ? (
            <div className="empty-bookings-card" role="status" aria-live="polite">
              <div className="loading-spinner" aria-hidden="true"></div>
              <p>Loading your bookings…</p>
            </div>
          ) : myBookingsError ? (
            <div className="empty-bookings-card" role="alert">
              <div className="empty-icon" aria-hidden="true">⚠</div>
              <h3>Bookings couldn't load</h3>
              <p>{myBookingsError}</p>
              <button type="button" className="primary-btn" onClick={() => { setMyBookingsLoading(true); setBookingsReloadKey(k => k + 1); }}>Try Again</button>
            </div>
          ) : myBookings.length === 0 ? (
            <div className="empty-bookings-card">
              <div className="empty-icon" aria-hidden="true">🎫</div>
              <h3>No Bookings Yet</h3>
              <p>{currentUser ? "Search for a flight above to make your first booking." : "Sign in to see your bookings."}</p>
              {currentUser
                ? <button type="button" className="primary-btn" onClick={() => document.getElementById("search")?.scrollIntoView({ behavior: "smooth" })}>Search Flights</button>
                : <button type="button" className="primary-btn" onClick={() => navigate("/login")}>Sign In</button>}
            </div>
          ) : (
            <div className="bookings-list">
              {myBookings.map(b => (
                <article key={b.id} className="booking-card" aria-label={`Booking ${b.pnr}`}>
                  <div className="booking-card-header">
                    <div>
                      <small>BOOKING REFERENCE (PNR)</small>
                      <h3 className="pnr-title">{b.pnr}</h3>
                    </div>
                    <span className={`booking-status-badge ${b.status === "CANCELLED" ? "badge-cancelled" : "badge-confirmed"}`}>{b.status}</span>
                  </div>
                  <div className="booking-card-body">
                    <div><small>Flight</small><p>{b.flightNumber} · {b.airline}</p></div>
                    <div><small>Route</small><p>{b.origin} → {b.destination}</p></div>
                    <div><small>Date & Time</small><p>{b.departureDate} · {b.departureTime}</p></div>
                    <div><small>Passenger(s)</small><p>{b.passengerName}</p></div>
                    <div><small>Seat(s)</small><p className="seat-tags-inline">{(b.seatNumbers || []).map(s => <span key={s} className="seat-badge-chip">{s}</span>)}</p></div>
                    <div><small>Booking Total</small><p className="fare-tag">{formatPrice(b.totalPrice)}</p></div>
                  </div>
                  <div className="booking-actions-row">
                    <button className="view-ticket-btn" type="button" onClick={() => setTicketModalBooking(b)}>🎫 View Details</button>
                    {b.status !== "CANCELLED" && <button className="cancel-booking-btn" type="button" onClick={() => setCancelModalBooking(b)}>Cancel Booking</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── OFFERS ── */}
      <section className="offers" id="offers" aria-labelledby="offers-heading">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">EXCLUSIVE DEALS</span>
            <h2 id="offers-heading">Special Offers</h2>
          </div>
          <button className="view-btn" type="button" onClick={() => document.getElementById("destinations")?.scrollIntoView({ behavior: "smooth" })}>Explore Destinations →</button>
        </div>

        <div className="offers-grid">
          {[
            { code: "FLYINDIA", pct: "30% OFF", title: "Explore India", sub: "All domestic routes", color: "offer1", bg: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=800&q=80" },
            { code: "WELCOME", pct: "₹1,000 OFF", title: "Welcome Aboard", sub: "Any SkyBook flight", color: "offer2", bg: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80" },
            { code: "WORLD20", pct: "20% OFF", title: "Fly International", sub: "Dubai, Singapore & more", color: "offer3", bg: "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80" },
          ].map(o => (
            <button key={o.code} type="button" className={`offer-card ${o.color} clickable-offer`} onClick={() => handleApplyPromo(o.code)} aria-label={`Apply promo code ${o.code}: ${o.title}`}>
              <div className="offer-bg" style={{ backgroundImage: `url(${o.bg})` }} aria-hidden="true"></div>
              <div className="offer-overlay" aria-hidden="true"></div>
              <div className="offer-content">
                <div className="discount-badge">{o.pct}</div>
                <small>{o.sub.toUpperCase()}</small>
                <h3>{o.title}</h3>
                <span className="offer-code">Code: <b>{o.code}</b> — Click to Apply</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" aria-labelledby="features-heading">
        <div className="section-center">
          <span className="section-eyebrow">WHY SKYBOOK?</span>
          <h2 id="features-heading">Everything You Need to Travel</h2>
          <p>A seamless reservation experience built for clarity, speed, and simplicity.</p>
        </div>
        <div className="feature-grid">
          {[
            { img: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80", alt: "Flight search interface", title: "Smart Flight Search", desc: "Compare routes and fares across 20+ destinations with simple filters." },
            { img: "https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=900&q=80", alt: "Airplane cabin seat", title: "Interactive Seat Map", desc: "Visualise and select available window, aisle, or business class seats." },
            { img: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=80", alt: "Secure booking", title: "Secure JWT Auth", desc: "JWT-protected accounts keep your bookings and fare watches private." },
            { img: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=900&q=80", alt: "Boarding pass", title: "Instant PNR Reference", desc: "Get a booking reference immediately. Manage and cancel with one click." },
          ].map(f => (
            <div className="feature-card" key={f.title}>
              <div className="feature-img-wrap">
                <img src={f.img} alt={f.alt} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DESTINATIONS ── */}
      <section className="destinations" id="destinations" aria-labelledby="dest-heading">
        <div className="section-center">
          <span className="section-eyebrow">POPULAR DESTINATIONS</span>
          <h2 id="dest-heading">Where Will You Go Next?</h2>
          <p>Click any destination to find available SkyBook flights.</p>
        </div>

        <div className="dest-filter-tabs" role="group" aria-label="Filter destinations">
          {(["all", "domestic", "international"] as const).map(f => (
            <button key={f} type="button" className={`dest-tab ${destFilter === f ? "active-tab" : ""}`} onClick={() => setDestFilter(f)} aria-pressed={destFilter === f}>
              {f === "all" ? "All Destinations" : f === "domestic" ? "🇮🇳 India" : "🌏 International"}
            </button>
          ))}
        </div>

        <div className="destination-grid">
          {filteredDests.map(dest => (
            <button key={dest.code} type="button" className="destination-card" onClick={() => handleDestinationClick(dest)} aria-label={`Search flights to ${dest.city}, ${dest.country}`}>
              <div
                className="dest-bg"
                style={{ backgroundImage: `url(${DEST_IMAGES[dest.code] || DEST_IMAGES.BOM})` }}
                aria-hidden="true"
                role="img"
              />
              <div className="destination-overlay" aria-hidden="true"></div>
              <div className="dest-info">
                <div className="dest-emoji" aria-hidden="true">{dest.emoji}</div>
                <h3>{dest.city}</h3>
                <small>{dest.country}</small>
                <p className="dest-desc">{dest.description}</p>
                <span className="dest-cta">Explore flights →</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── FLIGHT STATUS ── */}
      <section className="flight-status" id="status" aria-labelledby="status-heading">
        <div className="status-container">
          <div className="status-text">
            <span className="section-eyebrow">FLIGHT TRACKER</span>
            <h2 id="status-heading">Track Your Flight</h2>
            <p>Look up any SkyBook scheduled flight. Status shown is from the SkyBook database, not a live airline feed.</p>
            <div className="status-input-row">
              <label htmlFor="status-flight-input" className="sr-only">Flight number</label>
              <input
                id="status-flight-input"
                className="status-input"
                value={statusInput}
                placeholder="e.g. SK-101"
                onChange={e => setStatusInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && void handleStatusLookup()}
                aria-label="Enter flight number"
              />
              <button type="button" className="primary-btn status-track-btn" disabled={statusLoading} onClick={() => void handleStatusLookup()} aria-busy={statusLoading}>
                {statusLoading ? "Tracking…" : "Track Flight"}
              </button>
            </div>
            {statusNotice && <div className={`state-box ${statusNotice.type}`} role="status"><span className="state-icon" aria-hidden="true">{statusNotice.type === "success" ? "✓" : statusNotice.type === "error" ? "⚠" : "ℹ"}</span>{statusNotice.text}</div>}
          </div>

          <div className="status-card-wrap">
            {statusResult ? (
              <div className="status-result-card" aria-live="polite">
                <div className="status-card-header">
                  <div>
                    <small>{statusResult.airline}</small>
                    <h3>{statusResult.flightNumber}</h3>
                  </div>
                  <span className={`status-badge-large status-${statusResult.status.toLowerCase().replace(/\s/g, "-")}`}>{statusResult.status}</span>
                </div>
                <div className="status-route-display">
                  <div><strong className="iata-lg">{getCode(statusResult.origin)}</strong><small>{getCity(statusResult.origin)}</small><span>{statusResult.departureTime}</span></div>
                  <div className="status-route-arrow" aria-hidden="true"><span>✈</span><div></div></div>
                  <div><strong className="iata-lg">{getCode(statusResult.destination)}</strong><small>{getCity(statusResult.destination)}</small><span>{statusResult.arrivalTime}</span></div>
                </div>
                <div className="status-meta-pills">
                  <span>📅 {statusResult.departureDate}</span>
                  <span>🚪 Terminal: {statusResult.terminal || "N/A"}</span>
                  <span>Gate: {statusResult.gate || "N/A"}</span>
                  <span>🧳 Belt: {statusResult.baggageBelt || "N/A"}</span>
                </div>
                <p className="status-source-note">{statusResult.statusSource}</p>
              </div>
            ) : (
              <div className="status-empty-state">
                <span aria-hidden="true">✈</span>
                <p>Enter a flight number (e.g. SK-101) to view its schedule and status.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="big-stats" aria-label="SkyBook platform highlights">
        <div><h2>20+</h2><p>Destinations worldwide</p></div>
        <div><h2>50+</h2><p>Routes available</p></div>
        <div><h2>JWT</h2><p>Secure auth</p></div>
        <div><h2>Free</h2><p>Seat selection</p></div>
      </section>

      {/* ── NEWSLETTER ── */}
      <section className="newsletter" aria-labelledby="newsletter-heading">
        <div className="newsletter-inner">
          <div>
            <span className="section-eyebrow">STAY UPDATED</span>
            <h2 id="newsletter-heading">Get Exclusive Flight Offers</h2>
            <p>Subscribe to the SkyBook updates list. Email delivery is not configured in this demo.</p>
          </div>
          <div className="subscribe-box">
            <label htmlFor="newsletter-email" className="sr-only">Your email address</label>
            <input id="newsletter-email" type="email" value={newsletterEmail} placeholder="Enter your email address" onChange={e => setNewsletterEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && void handleNewsletterSubmit()} />
            <button type="button" onClick={() => void handleNewsletterSubmit()}>Subscribe</button>
          </div>
          {newsletterNotice && <div className={`state-box ${newsletterNotice.type}`} role="status"><span className="state-icon" aria-hidden="true">{newsletterNotice.type === "success" ? "✓" : "⚠"}</span>{newsletterNotice.text}</div>}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer aria-labelledby="footer-heading">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo"><span className="logo-icon" aria-hidden="true">✈</span> Sky<span>Book</span></div>
            <p>Making air travel transparent and simple with SkyBook — seamless flight discovery, clear fares, and instant reservations.</p>
            <p className="footer-disclaimer">SkyBook is a demonstration platform. Prices are sample data. Payment is not integrated.</p>
          </div>
          <div>
            <h3 id="footer-heading">Quick Links</h3>
            <ul>
              <li><a href="/#home">Home</a></li>
              <li><a href="/#search">Search Flights</a></li>
              <li><a href="/#offers">Offers</a></li>
              <li><a href="/#destinations">Destinations</a></li>
              <li><a href="/#status">Flight Status</a></li>
            </ul>
          </div>
          <div>
            <h3>Account</h3>
            <ul>
              <li><a href="/login" onClick={e => { e.preventDefault(); navigate("/login"); }}>Sign In</a></li>
              <li><a href="/register" onClick={e => { e.preventDefault(); navigate("/register"); }}>Register</a></li>
              <li><a href="/dashboard" onClick={e => { e.preventDefault(); navigate("/dashboard"); }}>My Dashboard</a></li>
              <li><a href="/fare-watches" onClick={e => { e.preventDefault(); navigate("/fare-watches"); }}>Fare Watch</a></li>
            </ul>
          </div>
          <div>
            <h3>Tools</h3>
            <ul>
              <li><a href="/flight-status" onClick={e => { e.preventDefault(); navigate("/flight-status"); }}>Flight Tracker</a></li>
              <li><a href="/planner" onClick={e => { e.preventDefault(); navigate("/planner"); }}>Travel Planner</a></li>
              <li><a href="/notifications" onClick={e => { e.preventDefault(); navigate("/notifications"); }}>Notifications</a></li>
              <li><a href="/admin" onClick={e => { e.preventDefault(); navigate("/admin/login"); }}>Admin Panel</a></li>
            </ul>
          </div>
        </div>
        <div className="copyright">© 2026 SkyBook · Airline reservation and flight management platform.</div>
      </footer>

      {/* ── CHAT ASSISTANT ── */}
      {chatOpen && (
        <div className="chat-box" role="dialog" aria-label="SkyBook travel assistant" aria-modal="true">
          <div className="chat-header">
            <div className="chat-title">
              <span className="chat-bot-avatar" aria-hidden="true">✈</span>
              <div><strong>SkyBook Assistant</strong><small>Rule-based travel help</small></div>
            </div>
            <button type="button" className="chat-close-btn" aria-label="Close chat" onClick={() => setChatOpen(false)}>✕</button>
          </div>
          <div className="chat-body">
            <div className="chat-messages-container" role="log" aria-label="Chat messages" aria-live="polite">
              {chatMessages.map((msg, i) => (
                <div key={`${msg.text}-${i}`} className={`chat-bubble ${msg.sender === "user" ? "user-bubble" : "bot-bubble"}`}>
                  <p>{msg.text}</p>
                  <small className="chat-ts">{msg.time}</small>
                </div>
              ))}
              {chatLoading && <div className="chat-bubble bot-bubble typing-bubble"><span className="typing-dots">●●●</span></div>}
              <div ref={chatBottomRef} aria-hidden="true" />
            </div>
            <div className="chat-quick-chips">
              {["✈ Search Flights", "🏷 Promo Codes", "🧳 Baggage Info", "📡 Flight Status"].map(q => (
                <button key={q} type="button" onClick={() => handleChat(q)} aria-label={`Ask: ${q}`}>{q}</button>
              ))}
            </div>
            <div className="chat-input-row">
              <label htmlFor="chat-input" className="sr-only">Type your question</label>
              <input id="chat-input" value={chatInput} placeholder="Ask a travel question…" onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleChat(chatInput); } }} />
              <button type="button" className="chat-send-btn" disabled={!chatInput.trim() || chatLoading} onClick={() => handleChat(chatInput)} aria-label="Send message">➤</button>
            </div>
          </div>
        </div>
      )}

      <button className="chat-button" type="button" aria-label={chatOpen ? "Close travel assistant" : "Open travel assistant"} aria-expanded={chatOpen} onClick={() => setChatOpen(o => !o)}>
        <span className="chat-btn-icon" aria-hidden="true">{chatOpen ? "✕" : "💬"}</span>
        {!chatOpen && <span className="chat-btn-label">Help</span>}
      </button>

      {/* ── TICKET MODAL ── */}
      {ticketModalBooking && (
        <div className="modal-overlay" onClick={() => setTicketModalBooking(null)} role="dialog" aria-label="Booking details" aria-modal="true">
          <div className="boarding-pass-modal" onClick={e => e.stopPropagation()} tabIndex={-1}>
            <div className="ticket-header-strip">
              <div className="ticket-logo"><span>✈</span> SkyBook</div>
              <div className="ticket-pnr-pill">PNR: <b>{ticketModalBooking.pnr}</b></div>
              <button type="button" className="modal-close-cross" onClick={() => setTicketModalBooking(null)} aria-label="Close booking details">✕</button>
            </div>
            <div className="boarding-pass-card">
              <div className="bp-top-row">
                <div><small>FLIGHT</small><h3>{ticketModalBooking.flightNumber}</h3></div>
                <div><small>DATE</small><h3>{ticketModalBooking.departureDate}</h3></div>
                <div><small>DEPARTS</small><h3>{ticketModalBooking.departureTime}</h3></div>
                <div><small>STATUS</small><h3 className={ticketModalBooking.status === "CONFIRMED" ? "text-success" : "text-error"}>{ticketModalBooking.status}</h3></div>
              </div>
              <div className="bp-route-hero">
                <div className="bp-loc"><h1>{getCode(ticketModalBooking.origin)}</h1><p>{getCity(ticketModalBooking.origin)}</p></div>
                <div className="bp-arrow"><span>✈</span><div className="bp-line"></div><small>{ticketModalBooking.airline}</small></div>
                <div className="bp-loc"><h1>{getCode(ticketModalBooking.destination)}</h1><p>{getCity(ticketModalBooking.destination)}</p></div>
              </div>
              <div className="bp-details-grid">
                <div><small>PASSENGER(S)</small><p className="bp-pax">{ticketModalBooking.passengerName}</p></div>
                <div><small>SEAT(S)</small><p>{ticketModalBooking.seatNumbers?.join(", ")}</p></div>
                <div><small>TRAVELERS</small><p>{ticketModalBooking.passengerCount} Adult(s)</p></div>
                <div><small>PROMO</small><p>{ticketModalBooking.promoCode || "None"}</p></div>
              </div>
              <div className="bp-bottom">
                <div className="barcode-graphic"><strong>BOOKING REFERENCE</strong><small>{ticketModalBooking.pnr}</small></div>
                <div className="bp-fare"><small>TOTAL · PAYMENT NOT COLLECTED</small><h2>{formatPrice(ticketModalBooking.totalPrice)}</h2></div>
              </div>
            </div>
            <div className="ticket-modal-actions">
              <button type="button" className="primary-btn" onClick={() => window.print()}>🖨 Print Details</button>
              <button type="button" className="secondary-btn" onClick={() => { setTicketModalBooking(null); document.getElementById("bookings")?.scrollIntoView({ behavior: "smooth" }); }}>View in My Bookings</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCEL MODAL ── */}
      {cancelModalBooking && (
        <div className="modal-overlay" onClick={() => setCancelModalBooking(null)} role="dialog" aria-label="Cancel booking confirmation" aria-modal="true">
          <div className="cancel-modal" onClick={e => e.stopPropagation()} tabIndex={-1}>
            <div className="cancel-modal-header">
              <h3>Cancel Booking</h3>
              <button type="button" className="modal-close-cross" onClick={() => setCancelModalBooking(null)} aria-label="Close">✕</button>
            </div>
            <div className="cancel-modal-body">
              <div className="cancel-warning-icon" aria-hidden="true">⚠</div>
              <p>Are you sure you want to cancel booking <b>{cancelModalBooking.pnr}</b>?</p>
              <p className="cancel-detail">{cancelModalBooking.origin} → {cancelModalBooking.destination} · Seats: {cancelModalBooking.seatNumbers?.join(", ")}</p>
              <p className="cancel-note">Seats will be released immediately back to available inventory.</p>
            </div>
            <div className="cancel-modal-actions">
              <button type="button" className="cancel-confirm-btn" onClick={() => handleCancelBooking(cancelModalBooking.id)}>Yes, Cancel Booking</button>
              <button type="button" className="secondary-btn" onClick={() => setCancelModalBooking(null)}>Keep My Booking</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEMO MODAL ── */}
      {demoModalOpen && (
        <div className="modal-overlay" onClick={() => setDemoModalOpen(false)} role="dialog" aria-label="SkyBook demo walkthrough" aria-modal="true">
          <div className="demo-modal" onClick={e => e.stopPropagation()} tabIndex={-1}>
            <div className="demo-modal-header">
              <h3>SkyBook — How It Works</h3>
              <button type="button" className="modal-close-cross" onClick={() => setDemoModalOpen(false)} aria-label="Close">✕</button>
            </div>
            <ol className="demo-steps">
              {[
                { title: "Search Flights", desc: "Enter origin, destination, dates, and traveler count. Browse results from 20+ destinations across India and internationally." },
                { title: "Select Your Seat", desc: "Choose window or aisle on our interactive aircraft cabin map. Business rows 1–2, economy rows 3–8." },
                { title: "Apply Promo & Confirm", desc: "Use FLYINDIA, WELCOME, or WORLD20 promo codes. Get an instant PNR booking reference." },
                { title: "Manage Bookings", desc: "View, print, or cancel reservations from My Bookings. Use Fare Watch to track price changes." },
              ].map((s, i) => (
                <li key={i} className="demo-step">
                  <span className="step-num" aria-hidden="true">{i + 1}</span>
                  <div><h4>{s.title}</h4><p>{s.desc}</p></div>
                </li>
              ))}
            </ol>
            <div className="demo-actions">
              <button type="button" className="primary-btn" onClick={() => { setDemoModalOpen(false); document.getElementById("search")?.scrollIntoView({ behavior: "smooth" }); }}>Start Booking Now ✈</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
