import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { apiFetch } from "./api";
import { FeaturePage } from "./FeaturePages";

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

type Notice = {
  type: "success" | "error" | "info";
  text: string;
};

type SeatInfo = {
  seatNumber: string;
  status: string;
  row?: number;
  col?: string;
  isWindow?: boolean;
  isAisle?: boolean;
  cabinClass?: string;
};

type FlightDetails = {
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
  seats: SeatInfo[];
};

type FlightStatus = {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  status: string;
  statusSource: string;
  terminal: string | null;
  gate: string | null;
  baggageBelt: string | null;
};

type PassengerDetail = {
  title: string;
  name: string;
  gender: string;
};

type Booking = {
  id: number;
  pnr: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  seatNumbers: string[];
  passengerName: string;
  passengers?: PassengerDetail[];
  passengerCount: number;
  totalPrice: number;
  discount?: number;
  promoCode?: string | null;
  status: string;
  createdAt: string;
  flightId?: number;
};

type AdminBooking = {
  id: number;
  pnr: string;
  passengerName: string;
  origin?: string;
  destination?: string;
  totalPrice?: number;
  status?: string;
  bookedByName?: string;
  reason?: string;
};
type AdminDashboard = {
  stats: {
    totalUsers: number;
    totalFlights: number;
    activeFlights: number;
    totalBookings: number;
    totalCancellations: number;
    totalRevenue: number;
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

type ChatMessage = {
  sender: "user" | "bot";
  text: string;
  time: string;
};

function isAdminRole(role?: string | null) {
  return role?.toUpperCase() === "ADMIN";
}

const POPULAR_AIRPORTS = [
  { code: "BOM", name: "Mumbai (BOM)", city: "Mumbai" },
  { code: "DEL", name: "Delhi (DEL)", city: "Delhi" },
  { code: "GOI", name: "Goa (GOI)", city: "Goa" },
  { code: "DXB", name: "Dubai (DXB)", city: "Dubai" },
  { code: "BLR", name: "Bengaluru (BLR)", city: "Bengaluru" },
];

const initialDepartureDate = new Date().toISOString().slice(0, 10);
const initialReturnDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const initialAdminRangeEnd = new Date().toISOString().slice(0, 10);
const initialAdminRangeStart = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

function previewTotal(price: number, travelerCount: number, promoCode: string, flight?: Flight | null) {
  const basePrice = price * travelerCount;
  const code = promoCode.trim().toUpperCase();

  if (!code || !flight) {
    return { totalPrice: basePrice, discount: 0 };
  }

  const international =
    `${flight.origin} ${flight.destination}`.toUpperCase().includes("DXB") ||
    `${flight.origin} ${flight.destination}`.toUpperCase().includes("DUBAI");

  if (code === "FLYINDIA" && !international) {
    const discount = Math.round(basePrice * 0.3);
    return { totalPrice: Math.max(0, basePrice - discount), discount };
  }

  if (code === "WELCOME") {
    const discount = Math.min(1000, basePrice);
    return { totalPrice: Math.max(0, basePrice - discount), discount };
  }

  if (code === "WORLD20" && international) {
    const discount = Math.round(basePrice * 0.2);
    return { totalPrice: Math.max(0, basePrice - discount), discount };
  }

  return { totalPrice: basePrice, discount: 0 };
}

function updateBrowserRoute(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function AdminPanel({
  currentUser,
  token,
  setCurrentUser,
  setToken,
  route,
  navigateTo,
}: {
  currentUser: { id: number; name: string; email: string; role?: string } | null;
  token: string | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<{ id: number; name: string; email: string; role?: string } | null>>;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  route: string;
  navigateTo: (path: string) => void;
}) {
  const isAdminAuthenticated = isAdminRole(currentUser?.role);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardNotice, setDashboardNotice] = useState<Notice | null>(null);
  const [rangeEnd, setRangeEnd] = useState(initialAdminRangeEnd);
  const [rangeStart, setRangeStart] = useState(initialAdminRangeStart);
  const [adminForm, setAdminForm] = useState({ email: "", password: "" });
  const [adminNotice, setAdminNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flightForm, setFlightForm] = useState({
    flightNumber: "SK-901",
    airline: "SkyBook Airlines",
    origin: "Mumbai (BOM)",
    destination: "Delhi (DEL)",
    departureDate: new Date().toISOString().slice(0, 10),
    departureTime: "08:00 AM",
    arrivalTime: "10:15 AM",
    price: "4999",
    status: "On Time",
  });

  useEffect(() => {
    if (route === "/admin" && !token) {
      navigateTo("/admin/login");
      return;
    }

    if (route === "/admin" && token && currentUser && !isAdminRole(currentUser.role)) {
      navigateTo("/admin/login");
    }
  }, [route, token, currentUser, navigateTo]);

  const loadDashboard = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      const params = new URLSearchParams({ startDate: rangeStart, endDate: rangeEnd });
      const data = await apiFetch(`/api/admin/dashboard?${params.toString()}`, {}, true);
      setDashboard(data);
      setDashboardNotice(null);
    } catch (error) {
      setDashboardNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load admin dashboard.",
      });
    } finally {
      setLoadingDashboard(false);
    }
  }, [token, rangeStart, rangeEnd]);

  useEffect(() => {
    if (route !== "/admin" || !isAdminAuthenticated || !token) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ startDate: rangeStart, endDate: rangeEnd });
    void apiFetch(`/api/admin/dashboard?${params.toString()}`, { signal: controller.signal }, true)
      .then((data) => {
        setDashboard(data);
        setDashboardNotice(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDashboardNotice({
            type: "error",
            text: error instanceof Error ? error.message : "Unable to load admin dashboard.",
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDashboard(false);
      });
    return () => controller.abort();
  }, [route, isAdminAuthenticated, token, rangeStart, rangeEnd]);

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!adminForm.email || !adminForm.password) {
      setAdminNotice({ type: "error", text: "Please enter your admin email and password." });
      return;
    }

    try {
      setAdminNotice({ type: "info", text: "Signing in to the admin panel..." });
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: adminForm.email.trim(),
          password: adminForm.password,
        }),
      });

      if (!isAdminRole(data.user?.role)) {
        throw new Error("This account is not authorized for the admin panel.");
      }

      localStorage.setItem("skybook-token", data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setAdminNotice({ type: "success", text: "Admin login successful." });
      navigateTo("/admin");
    } catch (error) {
      setAdminNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to log in as admin.",
      });
    }
  };

  const handleCreateFlight = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setDashboardNotice({ type: "info", text: "Creating a new flight..." });
      await apiFetch("/api/admin/flights", {
        method: "POST",
        body: JSON.stringify({
          ...flightForm,
          price: Number(flightForm.price),
        }),
      }, true);

      setDashboardNotice({ type: "success", text: "Flight created successfully." });
      setFlightForm({
        flightNumber: "SK-901",
        airline: "SkyBook Airlines",
        origin: "Mumbai (BOM)",
        destination: "Delhi (DEL)",
        departureDate: new Date().toISOString().slice(0, 10),
        departureTime: "08:00 AM",
        arrivalTime: "10:15 AM",
        price: "4999",
        status: "On Time",
      });
      await loadDashboard();
    } catch (error) {
      setDashboardNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to create flight.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateFlight = async (flightId: number) => {
    try {
      setDashboardNotice({ type: "info", text: "Deactivating flight..." });
      await apiFetch(`/api/admin/flights/${flightId}`, { method: "DELETE" }, true);
      setDashboardNotice({ type: "success", text: "Flight deactivated successfully." });
      await loadDashboard();
    } catch (error) {
      setDashboardNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to deactivate flight.",
      });
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("skybook-token");
    setToken(null);
    setCurrentUser(null);
    navigateTo("/admin/login");
  };

  if (route === "/admin/login") {
    return (
      <div className="admin-shell">
        <div className="admin-login-card">
          <div className="admin-login-header">
            <span className="admin-badge">SkyBook Admin</span>
            <h2>Admin Panel Access</h2>
          </div>

          <form className="admin-login-form" onSubmit={handleAdminLogin}>
            <label>
              Admin Email
              <input
                type="email"
                placeholder="admin@skybook.com"
                value={adminForm.email}
                onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>

            <label>
              Password
              <input
                type="password"
                placeholder="Admin@123"
                value={adminForm.password}
                onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            {adminNotice && (
              <div className={`state-box ${adminNotice.type}`}>
                <span className="state-icon">
                  {adminNotice.type === "success" ? "✓" : adminNotice.type === "error" ? "⚠" : "ℹ"}
                </span>
                {adminNotice.text}
              </div>
            )}

            <button type="submit" className="primary-btn admin-login-btn">
              Sign In To Admin Panel
            </button>
          </form>

          <div className="admin-login-footer">
            <button type="button" className="text-btn" onClick={() => navigateTo("/")}>
              Back to SkyBook Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (route === "/admin" && !isAdminAuthenticated) {
    return null;
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div>
          <span className="admin-badge">SkyBook Admin</span>
          <h1>Operations Dashboard</h1>
        </div>

        <div className="admin-actions">
          <button type="button" className="secondary-btn" onClick={() => navigateTo("/")}>
            Public Website
          </button>
          <button type="button" className="register-btn" onClick={handleAdminLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-user-box">
            <span className="admin-user-avatar">{currentUser?.name?.[0] || "A"}</span>
            <div>
              <strong>{currentUser?.name || "Admin"}</strong>
              <small>{currentUser?.email}</small>
            </div>
          </div>

          <nav className="admin-nav">
            <button type="button" className="admin-nav-item active">Overview</button>
            <button type="button" className="admin-nav-item">Flights</button>
            <button type="button" className="admin-nav-item">Bookings</button>
            <button type="button" className="admin-nav-item">Cancellations</button>
          </nav>
        </aside>

        <main className="admin-content">
          {dashboardNotice && (
            <div className={`state-box ${dashboardNotice.type}`}>
              <span className="state-icon">
                {dashboardNotice.type === "success" ? "✓" : dashboardNotice.type === "error" ? "⚠" : "ℹ"}
              </span>
              {dashboardNotice.text}
            </div>
          )}

          {loadingDashboard ? (
            <div className="admin-empty-state">Loading dashboard...</div>
          ) : dashboard ? (
            <>
              <section className="admin-stats-grid">
                <div className="admin-stat-card">
                  <span>Total Users</span>
                  <strong>{dashboard.stats.totalUsers}</strong>
                </div>
                <div className="admin-stat-card">
                  <span>Total Flights</span>
                  <strong>{dashboard.stats.totalFlights}</strong>
                </div>
                <div className="admin-stat-card">
                  <span>Active Flights</span>
                  <strong>{dashboard.stats.activeFlights}</strong>
                </div>
                <div className="admin-stat-card">
                  <span>Bookings</span>
                  <strong>{dashboard.stats.totalBookings}</strong>
                </div>
                <div className="admin-stat-card">
                  <span>Confirmed booking value</span>
                  <strong>₹{Number(dashboard.stats.totalRevenue || 0).toLocaleString("en-IN")}</strong>
                </div>
                <div className="admin-stat-card">
                  <span>Cancellations</span>
                  <strong>{dashboard.stats.totalCancellations}</strong>
                </div>
              </section>

              <section className="admin-date-filter" aria-label="Analytics date range">
                <label>From<input type="date" value={rangeStart} max={rangeEnd} onChange={(event) => { setLoadingDashboard(true); setRangeStart(event.target.value); }} /></label>
                <label>Through<input type="date" value={rangeEnd} min={rangeStart} max={initialAdminRangeEnd} onChange={(event) => { setLoadingDashboard(true); setRangeEnd(event.target.value); }} /></label>
                <span>Confirmed booking value is based on booking records; payment collection is not integrated.</span>
              </section>

              <section className="admin-analytics-grid">
                <article className="admin-card admin-chart-card">
                  <div className="admin-card-header admin-chart-heading">
                    <h3>Booking and revenue trends</h3>
                  </div>
                  <div className="admin-trend-panels">
                    <div><h4>Bookings</h4><div className="admin-bar-chart">{dashboard.bookingTrend.map((point) => {
                      const values = dashboard.bookingTrend || [];
                      const maximum = Math.max(1, ...values.map((item) => Number(item.count || 0)));
                      return <div className="admin-chart-column" key={point.date} title={`${point.date}: ${point.count} bookings`}><span style={{ height: `${Math.max(4, Number(point.count) / maximum * 100)}%` }} /><small>{String(point.date).slice(5)}</small></div>;
                    })}</div></div>
                    <div><h4>Confirmed booking value</h4><div className="admin-bar-chart">{dashboard.revenueTrend.map((point) => {
                      const values = dashboard.revenueTrend || [];
                      const maximum = Math.max(1, ...values.map((item) => Number(item.revenue || 0)));
                      return <div className="admin-chart-column revenue" key={point.date} title={`${point.date}: ₹${Number(point.revenue || 0).toLocaleString("en-IN")}`}><span style={{ height: `${Math.max(4, Number(point.revenue) / maximum * 100)}%` }} /><small>{String(point.date).slice(5)}</small></div>;
                    })}</div></div>
                  </div>
                </article>
                <article className="admin-card admin-chart-card">
                  <div className="admin-card-header"><h3>Booking status</h3></div>
                  <div className="admin-status-list">{Object.entries(dashboard.stats.bookingStatusDistribution || {}).map(([status, count]) => (
                    <div className="admin-status-row" key={status}><span>{status}</span><strong>{String(count)}</strong></div>
                  ))}</div>
                </article>
                <article className="admin-card admin-chart-card">
                  <div className="admin-card-header"><h3>Popular destinations</h3></div>
                  {dashboard.popularDestinations.length === 0 ? <p className="admin-empty-state">No bookings yet.</p> : <div className="admin-destination-list">{dashboard.popularDestinations.map((item) => (
                    <div className="admin-destination-row" key={item.destination}><span>{item.destination}</span><strong>{item.bookingCount} bookings</strong></div>
                  ))}</div>}
                </article>
              </section>

              <section className="admin-card">
                <div className="admin-card-header">
                  <h3>Create Flight</h3>
                </div>

                <form onSubmit={handleCreateFlight} className="admin-flight-form">
                  <div className="admin-form-grid">
                    <input value={flightForm.flightNumber} onChange={(e) => setFlightForm((prev) => ({ ...prev, flightNumber: e.target.value }))} placeholder="Flight Number" />
                    <input value={flightForm.airline} onChange={(e) => setFlightForm((prev) => ({ ...prev, airline: e.target.value }))} placeholder="Airline" />
                    <input value={flightForm.origin} onChange={(e) => setFlightForm((prev) => ({ ...prev, origin: e.target.value }))} placeholder="Origin" />
                    <input value={flightForm.destination} onChange={(e) => setFlightForm((prev) => ({ ...prev, destination: e.target.value }))} placeholder="Destination" />
                    <input type="date" value={flightForm.departureDate} onChange={(e) => setFlightForm((prev) => ({ ...prev, departureDate: e.target.value }))} />
                    <input value={flightForm.departureTime} onChange={(e) => setFlightForm((prev) => ({ ...prev, departureTime: e.target.value }))} placeholder="Departure Time" />
                    <input value={flightForm.arrivalTime} onChange={(e) => setFlightForm((prev) => ({ ...prev, arrivalTime: e.target.value }))} placeholder="Arrival Time" />
                    <input type="number" value={flightForm.price} onChange={(e) => setFlightForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="Price" />
                    <input value={flightForm.status} onChange={(e) => setFlightForm((prev) => ({ ...prev, status: e.target.value }))} placeholder="Status" />
                  </div>

                  <button type="submit" className="primary-btn" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Flight"}
                  </button>
                </form>
              </section>

              <section className="admin-card">
                <div className="admin-card-header">
                  <h3>Flights</h3>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Flight</th>
                        <th>Route</th>
                        <th>Date</th>
                        <th>Seats</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.flights.map((flight) => (
                        <tr key={flight.id}>
                          <td>{flight.flightNumber}<br /><small>{flight.airline}</small></td>
                          <td>{flight.origin} → {flight.destination}</td>
                          <td>{flight.departureDate}<br /><small>{flight.departureTime}</small></td>
                          <td>{flight.availableSeats}</td>
                          <td>{flight.isActive ? flight.status : "Inactive"}</td>
                          <td>
                            <button type="button" className="cancel-booking-btn" onClick={() => handleDeactivateFlight(flight.id)}>
                              Deactivate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-card">
                <div className="admin-card-header">
                  <h3>Users</h3>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.users.map((user) => (
                        <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{user.email}</td>
                          <td>{user.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-card">
                <div className="admin-card-header">
                  <h3>Bookings</h3>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>PNR</th>
                        <th>Passenger</th>
                        <th>Route</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.bookings.map((booking) => (
                        <tr key={booking.id}>
                          <td>{booking.pnr}</td>
                          <td>{booking.passengerName}</td>
                          <td>{booking.origin} → {booking.destination}</td>
                          <td>₹{Number(booking.totalPrice || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-card">
                <div className="admin-card-header">
                  <h3>Cancellations</h3>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Booking</th>
                        <th>User</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.cancellations.map((item) => (
                        <tr key={item.id}>
                          <td>{item.pnr}</td>
                          <td>{item.bookedByName}</td>
                          <td>{item.reason || "No reason provided"}</td>
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

function App() {
  const [route, setRoute] = useState<string>(() => (typeof window !== "undefined" ? window.location.pathname : "/"));

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("skybook-theme");
    return savedTheme === "dark";
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [ticketModalBooking, setTicketModalBooking] = useState<Booking | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);

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
  const [passengerDetails, setPassengerDetails] = useState<PassengerDetail[]>([
    { title: "Mr", name: "", gender: "Adult" },
  ]);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: "bot",
      text: "Hi! I'm the SkyBook travel assistant. I can help with common booking and travel questions.",
      time: "Just now",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authNotice, setAuthNotice] = useState<Notice | null>(null);

  const [searchNotice, setSearchNotice] = useState<Notice | null>(null);
  const [bookingNotice, setBookingNotice] = useState<Notice | null>(null);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null);
  const [newsletterNotice, setNewsletterNotice] = useState<Notice | null>(null);

  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; email: string; role?: string } | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("skybook-token"));
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(() => Boolean(localStorage.getItem("skybook-token")));
  const [myBookingsError, setMyBookingsError] = useState<string | null>(null);
  const [bookingsReloadKey, setBookingsReloadKey] = useState(0);
  const [pendingBooking, setPendingBooking] = useState(false);

  const [statusInput, setStatusInput] = useState("SK-101");
  const [statusResult, setStatusResult] = useState<FlightStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");

  // JWT Demo Panel state (Experiment 06)
  const [jwtDemoForm, setJwtDemoForm] = useState({ name: "", email: "", password: "" });
  const [jwtDemoMode, setJwtDemoMode] = useState<"register" | "login">("register");
  const [jwtDemoNotice, setJwtDemoNotice] = useState<Notice | null>(null);
  const [jwtDemoToken, setJwtDemoToken] = useState<string | null>(null);
  const [jwtDemoBookings, setJwtDemoBookings] = useState<Booking[] | null>(null);
  const [jwtDemoLoading, setJwtDemoLoading] = useState(false);
  const [jwtDemoStep, setJwtDemoStep] = useState<"auth" | "token" | "bookings">("auth");
  const [legacyDemoEnabled] = useState(false);

  const adjustPassengerCount = (value: string) => {
    const count = Math.max(1, parseInt(value, 10) || 1);
    setPassengerDetails((previous) => {
      const next = [...previous];
      if (next.length < count) {
        while (next.length < count) next.push({ title: "Mr", name: "", gender: "Adult" });
      } else if (next.length > count) {
        next.splice(count);
      }
      return next;
    });
  };

  const handleTravelerCountChange = (value: string) => {
    setTravelers(value);
    adjustPassengerCount(value);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setCurrentUser(null);
      setMyBookings([]);
      setAuthMode("login");
      setAuthNotice({ type: "error", text: "Session expired or unauthorized. Please log in again." });
      updateBrowserRoute("/login");
    };
    window.addEventListener("skybook:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("skybook:unauthorized", handleUnauthorized);
  }, []);

  // Sync dark mode
  useEffect(() => {
    localStorage.setItem("skybook-theme", darkMode ? "dark" : "light");
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      setDarkMode(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("skybook:theme-change", handleThemeChange);
    return () => window.removeEventListener("skybook:theme-change", handleThemeChange);
  }, []);

  // Load current user
  useEffect(() => {
    if (!token) {
      return;
    }

    const loadCurrentUser = async () => {
      try {
        // Try Java JWT backend profile endpoint first
        const data = await apiFetch("/api/auth/profile", {}, true);
        setCurrentUser(data.user);
        if (data.user?.email) setContactEmail((current) => current || data.user.email);
      } catch {
        // Fallback: try Node.js /api/me for backward compatibility
        try {
          const data = await apiFetch("/api/me", {}, true);
          setCurrentUser(data.user);
          if (data.user?.email) setContactEmail((current) => current || data.user.email);
        } catch {
          localStorage.removeItem("skybook-token");
          setToken(null);
          setCurrentUser(null);
        }
      }
    };

    loadCurrentUser();
  }, [token]);

  // Load bookings and distinguish an API error from a genuinely empty account.
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    apiFetch("/api/bookings", { signal: controller.signal }, true)
      .then((data) => {
        setMyBookings(data.bookings || []);
        setMyBookingsError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMyBookings([]);
        setMyBookingsError(error instanceof Error ? error.message : "Unable to load your bookings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMyBookingsLoading(false);
      });
    return () => controller.abort();
  }, [token, bookingsReloadKey]);

  // Auto scroll chat
  useEffect(() => {
    if (chatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatOpen]);

  const travelerCount = Number(travelers) || 1;
  const { totalPrice: quotedTotal, discount: quotedDiscount } = previewTotal(
    selectedFlight?.price || 0,
    travelerCount,
    promoCode,
    selectedFlight
  );

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  const handleSearchFlights = async () => {
    if (!from.trim() || !to.trim()) {
      setSearchNotice({ type: "error", text: "Please enter both origin and destination." });
      return;
    }

    if (!departureDate) {
      setSearchNotice({ type: "error", text: "Please select a departure date." });
      return;
    }

    if (Number(travelers) < 1 || Number(travelers) > 9) {
      setSearchNotice({ type: "error", text: "Travelers must be between 1 and 9." });
      return;
    }

    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      setSearchNotice({ type: "error", text: "Origin and destination must be different." });
      return;
    }

    try {
      setIsSearching(true);
      setSearchNotice({ type: "info", text: "Searching SkyBook flights..." });

      const params = new URLSearchParams({
        from: from.trim(),
        to: to.trim(),
        departureDate,
      });

      const data = await apiFetch(`/api/flights/search?${params.toString()}`);
      const flights: Flight[] = data.flights || [];
      let inbound: Flight[] = [];

      if (tripType === "Round Trip") {
        if (!returnDate) {
          setSearchNotice({ type: "error", text: "Please select a return date." });
          setIsSearching(false);
          return;
        }

        if (returnDate < departureDate) {
          setSearchNotice({ type: "error", text: "Return date cannot be before departure date." });
          setIsSearching(false);
          return;
        }

        const returnParams = new URLSearchParams({
          from: to.trim(),
          to: from.trim(),
          departureDate: returnDate,
        });
        const returnData = await apiFetch(`/api/flights/search?${returnParams.toString()}`);
        inbound = returnData.flights || [];
      }

      setSearchResults(flights);
      setReturnResults(inbound);
      setSelectedFlight(null);
      setSelectedReturnFlight(null);
      setFlightDetails(null);
      setSelectedSeats([]);
      setBookingNotice(null);

      if (flights.length === 0) {
        setSearchNotice({
          type: "info",
          text: `No direct flights found between ${from} and ${to} on ${departureDate}. Try choosing another date or popular destination!`,
        });
        return;
      }

      setSearchNotice({
        type: "success",
        text: inbound.length
          ? `Found ${flights.length} outbound and ${inbound.length} return flight options. Select a flight to choose your seats!`
          : `Found ${flights.length} flight option(s). Select a flight to choose your seats!`,
      });

      // Smooth scroll down to available flights
      setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (error) {
      setSearchNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to search flights.",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectFlight = async (flight: Flight, isReturn = false) => {
    try {
      setIsLoadingDetails(true);
      if (isReturn) {
        setSelectedReturnFlight(flight);
      } else {
        setSelectedFlight(flight);
      }
      setSelectedSeats([]);
      setBookingNotice(null);

      const targetId = flight.id;
      const data = await apiFetch(`/api/flights/${targetId}`);
      setFlightDetails(data.flight);

      setTimeout(() => {
        document.getElementById("booking-panel")?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    } catch (error) {
      setBookingNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load flight details.",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSeatToggle = (seatNumber: string) => {
    if (!flightDetails) return;

    const seat = flightDetails.seats.find((item: SeatInfo) => item.seatNumber === seatNumber);
    if (!seat || seat.status !== "available") return;

    if (selectedSeats.includes(seatNumber)) {
      setSelectedSeats((current) => current.filter((item) => item !== seatNumber));
      return;
    }

    if (selectedSeats.length >= travelerCount) {
      setBookingNotice({
        type: "error",
        text: `You have selected ${selectedSeats.length} seat(s). Maximum allowed for ${travelerCount} traveler(s).`,
      });
      return;
    }

    setSelectedSeats((current) => [...current, seatNumber]);
    setBookingNotice(null);
  };

  const handlePassengerNameChange = (index: number, name: string) => {
    setPassengerDetails((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], name };
      }
      return copy;
    });
  };

  const handlePassengerTitleChange = (index: number, title: string) => {
    setPassengerDetails((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], title };
      }
      return copy;
    });
  };

  const submitBooking = async () => {
    if (!selectedFlight || !flightDetails) {
      setBookingNotice({ type: "error", text: "Please select a flight first." });
      return false;
    }

    const activeToken = token || localStorage.getItem("skybook-token");

    if (!activeToken) {
      setPendingBooking(true);
      setAuthMode("login");
      setAuthNotice({ type: "info", text: "Please log in or register to complete your booking." });
      updateBrowserRoute("/login");
      return false;
    }

    // Validate passenger names
    const emptyPassengerIndex = passengerDetails.findIndex((p) => !p.name.trim());
    if (emptyPassengerIndex !== -1) {
      setBookingNotice({
        type: "error",
        text: `Please enter the full name for Traveler #${emptyPassengerIndex + 1}.`,
      });
      return false;
    }

    if (selectedSeats.length !== travelerCount) {
      setBookingNotice({
        type: "error",
        text: `Please select exactly ${travelerCount} seat(s) on the aircraft seat map before proceeding.`,
      });
      return false;
    }

    try {
      setIsSubmittingBooking(true);
      setBookingNotice({ type: "info", text: "Securing your seats and generating your PNR..." });

      const data = await apiFetch(
        "/api/bookings",
        {
          method: "POST",
          body: JSON.stringify({
            flightId: selectedFlight.id,
            travelDate: selectedFlight.departureDate,
            passengerName: passengerDetails.map((p) => `${p.title} ${p.name}`.trim()).join(", "),
            passengers: JSON.stringify(passengerDetails),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim(),
            seatNumbers: selectedSeats,
            travelers: travelerCount,
            promoCode: promoCode.trim().toUpperCase() || undefined,
          }),
        },
        true
      );

      const confirmedBooking: Booking = data.booking;

      setBookingNotice({
        type: "success",
        text: `Booking confirmed! Reference: ${confirmedBooking.pnr}. No payment was collected because payment processing is not integrated.${
          confirmedBooking.promoCode ? ` • Promo ${confirmedBooking.promoCode} applied` : ""
        }`,
      });

      setMyBookings((current) => [confirmedBooking, ...current]);
      setTicketModalBooking(confirmedBooking);
      setPendingBooking(false);
      setIsSubmittingBooking(false);

      // Reset form
      setSelectedSeats([]);
      setPromoCode("");
      setSelectedFlight(null);
      setSelectedReturnFlight(null);
      setFlightDetails(null);

      // Refresh search results in background
      apiFetch(
        `/api/flights/search?${new URLSearchParams({
          from: from.trim(),
          to: to.trim(),
          departureDate,
        }).toString()}`
      )
        .then((refreshed) => setSearchResults(refreshed.flights || []))
        .catch(() => {});

      return true;
    } catch (error) {
      setPendingBooking(false);
      setBookingNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to complete booking.",
      });
      return false;
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleBookingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitBooking();
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const activeAuthMode = route === "/register" ? "register" : route === "/login" ? "login" : authMode;

    const payload =
      activeAuthMode === "register"
        ? {
            name: authForm.name.trim(),
            email: authForm.email.trim(),
            password: authForm.password,
          }
        : {
            email: authForm.email.trim(),
            password: authForm.password,
          };

    if (activeAuthMode === "register" && !payload.name) {
      setAuthNotice({ type: "error", text: "Please enter your full name." });
      return;
    }

    if (!payload.email || !payload.password) {
      setAuthNotice({ type: "error", text: "Email and password are required." });
      return;
    }

    try {
      setAuthNotice({
        type: "info",
        text: activeAuthMode === "login" ? "Authenticating via JWT backend..." : "Creating your SkyBook account...",
      });

      if (activeAuthMode === "register") {
        // POST /api/auth/register — Java JWT backend
        await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // After register, auto-login to get the token
        setAuthNotice({ type: "info", text: "Account created! Logging in..." });
      }

      // POST /api/auth/login — Java JWT backend, returns { ok, token }
      const loginData = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: payload.email, password: payload.password }),
      });

      const jwtToken: string = loginData.token;
      localStorage.setItem("skybook-token", jwtToken);
      setToken(jwtToken);

      // Fetch profile using Bearer token — GET /api/auth/profile
      try {
        const profileData = await apiFetch("/api/auth/profile", {}, true);
        setCurrentUser(profileData.user ?? { id: 0, name: payload.email.split("@")[0], email: payload.email });
        if (profileData.user?.email && !contactEmail) {
          setContactEmail(profileData.user.email);
        }
      } catch {
        // Fallback: set a basic user object from email so UI still works
        setCurrentUser({ id: 0, name: payload.email.split("@")[0], email: payload.email });
      }

      setAuthOpen(false);
      setAuthForm({ name: "", email: "", password: "" });
      setAuthNotice(null);
      updateBrowserRoute("/");

      if (pendingBooking) {
        await submitBooking();
      }
    } catch (error) {
      setAuthNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to authenticate.",
      });
    }
  };

  const handleFillDemoUser = () => {
    setAuthMode("login");
    setAuthForm({ name: "Demo Traveler", email: "demo@skybook.com", password: "password123" });
    setAuthNotice({ type: "info", text: "Demo credentials filled! Click Login to proceed." });
  };

  const handleStatusLookup = async (options?: { initialLoad?: boolean }) => {
    const trimmedFlightNumber = statusInput.trim();

    if (!trimmedFlightNumber) {
      setStatusNotice({ type: "error", text: "Please enter a flight number (e.g. SK-101)." });
      return;
    }

    try {
      setStatusLoading(true);
      if (!options?.initialLoad) {
        setStatusNotice({ type: "info", text: "Looking up the SkyBook flight schedule..." });
      }

      const data = await apiFetch(`/api/flights/status?flightNumber=${encodeURIComponent(trimmedFlightNumber)}`);
      setStatusResult(data.flight);
      setStatusNotice({ type: "success", text: `Flight ${data.flight.flightNumber} status: ${data.flight.status}` });
    } catch (error) {
      setStatusResult(null);
      setStatusNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to fetch flight status.",
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleNewsletterSubmit = async () => {
    if (!newsletterEmail.trim()) {
      setNewsletterNotice({ type: "error", text: "Please enter your email address." });
      return;
    }

    try {
      const data = await apiFetch("/api/newsletter", {
        method: "POST",
        body: JSON.stringify({ email: newsletterEmail.trim() }),
      });

      setNewsletterNotice({ type: "success", text: data.message || "Subscribed successfully!" });
      setNewsletterEmail("");
    } catch (error) {
      setNewsletterNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to subscribe.",
      });
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    try {
      await apiFetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" }, true);
      setMyBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? { ...booking, status: "CANCELLED" } : booking))
      );
      setCancelModalBooking(null);
      setBookingNotice({ type: "success", text: "Booking cancelled and seats have been released." });
    } catch (error) {
      setBookingNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to cancel booking.",
      });
    }
  };

  const handleDestinationSearch = (destination: string) => {
    setTo(destination);
    setTripType("One Way");
    setFrom("Mumbai (BOM)");
    window.setTimeout(() => {
      document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
      handleSearchFlights();
    }, 150);
  };

  // ── JWT Demo Handlers (Experiment 06) ──────────────────────────────────────
  const handleJwtDemoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!jwtDemoForm.email || !jwtDemoForm.password) {
      setJwtDemoNotice({ type: "error", text: "Email and password are required." });
      return;
    }
    if (jwtDemoMode === "register" && !jwtDemoForm.name.trim()) {
      setJwtDemoNotice({ type: "error", text: "Full name is required for registration." });
      return;
    }

    try {
      setJwtDemoLoading(true);
      setJwtDemoToken(null);
      setJwtDemoBookings(null);

      if (jwtDemoMode === "register") {
        setJwtDemoNotice({ type: "info", text: "📤 POST /api/auth/register → Registering user..." });
        await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name: jwtDemoForm.name.trim(), email: jwtDemoForm.email.trim(), password: jwtDemoForm.password }),
        });
        setJwtDemoNotice({ type: "success", text: "✓ Registration successful! Now logging in to get JWT token..." });
        await new Promise((r) => setTimeout(r, 600));
      }

      setJwtDemoNotice({ type: "info", text: "📤 POST /api/auth/login → Exchanging credentials for JWT..." });
      const loginData = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: jwtDemoForm.email.trim(), password: jwtDemoForm.password }),
      });

      const tok: string = loginData.token;
      setJwtDemoToken(tok);
      localStorage.setItem("skybook-token", tok);
      setToken(tok);

      // Also update main user state
      try {
        const profile = await apiFetch("/api/auth/profile", {}, true);
        setCurrentUser(profile.user ?? { id: 0, name: jwtDemoForm.email.split("@")[0], email: jwtDemoForm.email });
      } catch {
        setCurrentUser({ id: 0, name: jwtDemoForm.email.split("@")[0], email: jwtDemoForm.email });
      }

      setJwtDemoStep("token");
      setJwtDemoNotice({ type: "success", text: "🔑 JWT Token received! Now you can access the protected Bookings API." });
    } catch (error) {
      setJwtDemoNotice({ type: "error", text: error instanceof Error ? error.message : "Authentication failed." });
    } finally {
      setJwtDemoLoading(false);
    }
  };

  const handleJwtDemoFetchBookings = async () => {
    if (!jwtDemoToken) return;
    try {
      setJwtDemoLoading(true);
      setJwtDemoNotice({ type: "info", text: "📤 GET /api/bookings  →  Authorization: Bearer <token>..." });
      const data = await apiFetch("/api/bookings", {}, true);
      const bookings: Booking[] = Array.isArray(data) ? data : (data.bookings ?? []);
      setJwtDemoBookings(bookings);
      setMyBookings(bookings);
      setJwtDemoStep("bookings");
      setJwtDemoNotice({ type: "success", text: `✓ Protected API responded with ${bookings.length} booking(s).` });
    } catch (error) {
      setJwtDemoNotice({ type: "error", text: error instanceof Error ? error.message : "Failed to fetch bookings." });
    } finally {
      setJwtDemoLoading(false);
    }
  };

  const handleJwtDemoLogout = () => {
    localStorage.removeItem("skybook-token");
    setToken(null);
    setCurrentUser(null);
    setMyBookings([]);
    setJwtDemoToken(null);
    setJwtDemoBookings(null);
    setJwtDemoStep("auth");
    setJwtDemoForm({ name: "", email: "", password: "" });
    setJwtDemoMode("register");
    setJwtDemoNotice({ type: "info", text: "👋 Logged out. JWT token cleared from localStorage." });
  };
  // ──────────────────────────────────────────────────────────────────────────

  const handleApplyPromoFromCard = (code: string) => {
    setPromoCode(code);
    setBookingNotice({ type: "success", text: `Promo code ${code} applied!` });
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleChatPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || chatLoading) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatMessages((prev) => [...prev, { sender: "user", text: trimmed, time: timeStr }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const data = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: data.reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "I can help with flight bookings, seat maps, promo codes (FLYINDIA, WELCOME, WORLD20), baggage allowances, and live flight tracking!",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleChatPrompt(chatInput);
    }
  };

  const formatPrice = (value: number) => `₹${value.toLocaleString("en-IN")}`;

  const getAirportCode = (location: string) => {
    const match = location.match(/\(([^)]+)\)/);
    return match ? match[1] : location.slice(0, 3).toUpperCase();
  };

  const getCityName = (location: string) => {
    return location.replace(/\s*\([^)]*\)\s*/g, "").trim();
  };

  const isAdminRoute = route.startsWith("/admin");

  if (isAdminRoute) {
    return (
      <AdminPanel
        currentUser={currentUser}
        token={token}
        setCurrentUser={setCurrentUser}
        setToken={setToken}
        route={route}
        navigateTo={updateBrowserRoute}
      />
    );
  }

  if (route === "/login" || route === "/register") {
    const isRegisterRoute = route === "/register";
    return (
      <main className="auth-page">
        <section className="auth-page-panel">
          <button type="button" className="text-btn" onClick={() => updateBrowserRoute("/")}>← SkyBook home</button>
          <span className="admin-badge">SkyBook Account</span>
          <h1>{isRegisterRoute ? "Create your account" : "Welcome back"}</h1>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {isRegisterRoute && <label htmlFor="route-auth-name">Full name<input id="route-auth-name" className="booking-field" required autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} /></label>}
            <label htmlFor="route-auth-email">Email<input id="route-auth-email" className="booking-field" type="email" required autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label htmlFor="route-auth-password">Password<input id="route-auth-password" className="booking-field" type="password" required minLength={6} autoComplete={isRegisterRoute ? "new-password" : "current-password"} value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} /></label>
            {authNotice && <div className={`state-box ${authNotice.type}`}>{authNotice.text}</div>}
            <button className="primary-btn auth-submit" type="submit">{isRegisterRoute ? "Create account" : "Sign in"}</button>
          </form>
          <p className="auth-route-switch">{isRegisterRoute ? "Already have an account?" : "New to SkyBook?"} <button type="button" className="text-btn" onClick={() => updateBrowserRoute(isRegisterRoute ? "/login" : "/register")}>{isRegisterRoute ? "Sign in" : "Register"}</button></p>
        </section>
      </main>
    );
  }

  if (["/flight-status", "/dashboard", "/planner", "/fare-watches", "/notifications"].includes(route)) {
    return <FeaturePage route={route} token={token} onNavigate={updateBrowserRoute} onBookFlight={async (recommendation, travelerCount) => {
      const flight: Flight = {
        id: recommendation.flightId,
        flightNumber: recommendation.flightNumber,
        airline: recommendation.airline,
        origin: recommendation.origin,
        destination: recommendation.destination,
        departureDate: recommendation.departureDate,
        departureTime: recommendation.departureTime,
        arrivalTime: recommendation.arrivalTime,
        price: Number(recommendation.pricePerPerson),
        status: recommendation.status,
        availableSeats: recommendation.availableSeats,
      };
      setFrom(flight.origin);
      setTo(flight.destination);
      setDepartureDate(flight.departureDate);
      handleTravelerCountChange(String(travelerCount));
      setTripType("One Way");
      updateBrowserRoute("/");
      await handleSelectFlight(flight);
    }} />;
  }

  return (
    <div className={darkMode ? "app dark" : "app"}>
      {/* Navigation Bar */}
      <nav className="navbar">
        <a href="#home" className="logo" onClick={() => setMobileMenuOpen(false)}>
          <span className="logo-icon">✈</span> Sky<span>Book</span>
        </a>

        <div className={`nav-links ${mobileMenuOpen ? "open" : ""}`}>
          <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
          <a href="#search" onClick={() => setMobileMenuOpen(false)}>Flights</a>
          <a href="#offers" onClick={() => setMobileMenuOpen(false)}>Offers</a>
          <a href="#destinations" onClick={() => setMobileMenuOpen(false)}>Destinations</a>
          <a href="/flight-status" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/flight-status"); }}>Flight Status</a>
          {currentUser && (
            <a href="#bookings" onClick={() => setMobileMenuOpen(false)}>
              My Bookings
              {myBookings.length > 0 && <span className="badge-count">{myBookings.length}</span>}
            </a>
          )}
          {isAdminRole(currentUser?.role) && (
            <button
              type="button"
              className="nav-admin-link"
              onClick={() => {
                setMobileMenuOpen(false);
                updateBrowserRoute("/admin");
              }}
            >
              Admin Panel
            </button>
          )}
          {currentUser && <a href="/dashboard" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/dashboard"); }}>My Dashboard</a>}
          <a href="/planner" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/planner"); }}>Travel Planner</a>
          <a href="/fare-watches" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/fare-watches"); }}>Fare Watch</a>
          {currentUser && <a href="/notifications" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/notifications"); }}>Notifications</a>}
          {!currentUser && <>
            <a href="/login" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/login"); }}>Login</a>
            <a href="/register" onClick={(event) => { event.preventDefault(); setMobileMenuOpen(false); updateBrowserRoute("/register"); }}>Register</a>
          </>}
          <a href="#reviews" onClick={() => setMobileMenuOpen(false)}>Reviews</a>
        </div>

        <div className="nav-buttons">
          <button
            className="dark-btn"
            type="button"
            title={`Switch to ${darkMode ? "Light" : "Dark"} Mode`}
            onClick={() => setDarkMode((current) => !current)}
          >
            {darkMode ? "☀ Light" : "🌙 Dark"}
          </button>

          {currentUser ? (
            <div className="user-nav-dropdown">
              <a href="/dashboard" className="user-profile-btn" title="View your account dashboard" onClick={(event) => { event.preventDefault(); updateBrowserRoute("/dashboard"); }}>
                <span className="user-avatar">{currentUser.name[0]}</span>
                <span className="user-name">{currentUser.name.split(" ")[0]}</span>
              </a>
              <button
                className="register-btn logout-btn"
                type="button"
                onClick={() => {
                  localStorage.removeItem("skybook-token");
                  setToken(null);
                  setCurrentUser(null);
                  setMyBookings([]);
                  setPendingBooking(false);
                  setBookingNotice({ type: "info", text: "You have been logged out safely." });
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <>
              <button
                className="login-btn"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  updateBrowserRoute("/login");
                }}
              >
                Login
              </button>
              <button
                className="register-btn"
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  updateBrowserRoute("/register");
                }}
              >
                Register
              </button>
            </>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            className="hamburger-btn"
            type="button"
            aria-label="Toggle Navigation Menu"
            onClick={() => setMobileMenuOpen((curr) => !curr)}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero" id="home">
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge">
              <span className="badge-spark">✦</span> INDIA'S SMART FLIGHT BOOKING PLATFORM
            </div>

            <h1>
              Discover The World
              <br />
              <span>One Flight</span> At A Time.
            </h1>

            <p>
              Fly in comfort with SkyBook. Search available flights across India and international destinations,
              pick your favorite window or aisle seat on our interactive airliner map, and manage all your bookings with ease.
            </p>

            <div className="hero-buttons">
              <button
                className="primary-btn explore-btn"
                type="button"
                onClick={() => {
                  document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Explore Flights ✈
              </button>

              <button
                className="video-btn"
                type="button"
                onClick={() => setDemoModalOpen(true)}
              >
                ▶ Watch Feature Demo
              </button>
            </div>

            <div className="hero-stats">
              <div>
                <h2>Explore</h2>
                <p>Available routes</p>
              </div>

              <div>
                <h2>Compare</h2>
                <p>Fare and schedule</p>
              </div>

              <div>
                <h2>Manage</h2>
                <p>Your bookings</p>
              </div>
            </div>
          </div>

          <div className="hero-plane">
            <div className="radar-grid">
              <div className="orbit orbit1"></div>
              <div className="orbit orbit2"></div>
            </div>

            {/* Aircraft Display Graphic */}
            <div className="aircraft-display">
              <div className="jet-graphic">
                <span className="jet-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <path
                      d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <div className="contrail"></div>
              </div>
              <div className="jet-caption">Illustrative route preview · Mumbai to Delhi</div>
            </div>

            <div className="location-card card1">
              <div>
                <small>Origin</small>
                <strong>Mumbai (BOM)</strong>
              </div>
              <span>BOM</span>
            </div>

            <div className="location-card card2">
              <div>
                <small>Destination</small>
                <strong>Delhi (DEL)</strong>
              </div>
              <span>DEL</span>
            </div>

            <div className="floating-ticket">
              <small>EXAMPLE ROUTE</small>
              <h3>BOM ➔ DEL</h3>
              <p>Check current SkyBook fares</p>
              <button
                type="button"
                className="mini-book-btn"
                onClick={() => {
                  setFrom("Mumbai (BOM)");
                  setTo("Delhi (DEL)");
                  document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
                  handleSearchFlights();
                }}
              >
                Book This Route
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Flight Search Section */}
      <section className="search-section" id="search">
        <div className="search-container">
          <div className="search-top">
            <div className="trip-types">
              <button
                className={tripType === "Round Trip" ? "active-trip" : ""}
                type="button"
                onClick={() => setTripType("Round Trip")}
              >
                Round Trip
              </button>

              <button
                className={tripType === "One Way" ? "active-trip" : ""}
                type="button"
                onClick={() => setTripType("One Way")}
              >
                One Way
              </button>
            </div>

            {/* Quick Airport Selector Chips */}
            <div className="quick-airports">
              <span className="quick-label">Popular:</span>
              {POPULAR_AIRPORTS.map((apt) => (
                <button
                  key={apt.code}
                  type="button"
                  className="quick-chip"
                  onClick={() => {
                    if (from !== apt.name) {
                      setTo(apt.name);
                    } else {
                      setTo("Delhi (DEL)");
                    }
                  }}
                >
                  {apt.city} ({apt.code})
                </button>
              ))}
            </div>

            <span className="safe-text">Booking confirmation · Payments are not integrated</span>
          </div>

          <div className={`search-grid${tripType === "Round Trip" ? " round-trip" : ""}`}>
            <div className="input-box">
              <label htmlFor="origin-input">FROM (ORIGIN)</label>
              <input
                id="origin-input"
                list="origins-list"
                value={from}
                placeholder="e.g. Mumbai (BOM)"
                onChange={(event) => setFrom(event.target.value)}
              />
              <datalist id="origins-list">
                {POPULAR_AIRPORTS.map((apt) => (
                  <option key={`from-${apt.code}`} value={apt.name} />
                ))}
              </datalist>
            </div>

            <button
              className="swap-btn"
              type="button"
              title="Swap origin and destination"
              aria-label="Swap origin and destination"
              onClick={swapLocations}
            >
              ⇄
            </button>

            <div className="input-box">
              <label htmlFor="dest-input">TO (DESTINATION)</label>
              <input
                id="dest-input"
                list="dests-list"
                value={to}
                placeholder="e.g. Delhi (DEL)"
                onChange={(event) => setTo(event.target.value)}
              />
              <datalist id="dests-list">
                {POPULAR_AIRPORTS.map((apt) => (
                  <option key={`to-${apt.code}`} value={apt.name} />
                ))}
              </datalist>
            </div>

            <div className="input-box">
              <label htmlFor="departure-date">DEPARTURE</label>
              <input
                id="departure-date"
                type="date"
                min={initialDepartureDate}
                value={departureDate}
                onChange={(event) => setDepartureDate(event.target.value)}
              />
            </div>

            {tripType === "Round Trip" && (
              <div className="input-box">
                <label htmlFor="return-date">RETURN</label>
                <input
                  id="return-date"
                  type="date"
                  min={departureDate || initialDepartureDate}
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                />
              </div>
            )}

            <div className="input-box">
              <label htmlFor="travelers-select">TRAVELERS</label>
              <select
                id="travelers-select"
                value={travelers}
                onChange={(event) => handleTravelerCountChange(event.target.value)}
              >
                <option value="1">1 Passenger</option>
                <option value="2">2 Passengers</option>
                <option value="3">3 Passengers</option>
                <option value="4">4 Passengers</option>
              </select>
            </div>

            <button
              className="search-btn"
              type="button"
              disabled={isSearching}
              onClick={handleSearchFlights}
            >
              {isSearching ? "Searching..." : "Find Flights ✈"}
            </button>
          </div>
        </div>
      </section>

      {searchNotice && (
        <div className={`state-box ${searchNotice.type}`}>
          <span className="state-icon">
            {searchNotice.type === "success" ? "✓" : searchNotice.type === "error" ? "⚠" : "ℹ"}
          </span>
          {searchNotice.text}
        </div>
      )}

      {/* Outbound Flight Results */}
      {searchResults.length > 0 && (
        <section className="results-section" id="results">
          <div className="section-center">
            <span>AVAILABLE FLIGHTS</span>
            <h2>Outbound Options: {getCityName(from)} ➔ {getCityName(to)}</h2>
            <p>Showing direct flights departing on {departureDate}</p>
          </div>

          <div className="results-grid">
            {searchResults.map((flight) => {
              const isSelected = selectedFlight?.id === flight.id;
              return (
                <article
                  key={flight.id}
                  className={`result-card ${isSelected ? "selected-card" : ""}`}
                >
                  <div className="result-header">
                    <div>
                      <small>{flight.airline}</small>
                      <h3>{flight.flightNumber}</h3>
                    </div>
                    <span className="result-status">{flight.status}</span>
                  </div>

                  <div className="result-route">
                    <div className="route-terminal">
                      <div className="route-line-result">{getAirportCode(flight.origin)}</div>
                      <small>{getCityName(flight.origin)}</small>
                    </div>

                    <div className="route-graphic">
                      <span className="route-flight-time">2h 15m</span>
                      <div className="route-flight-line">
                        <span className="flight-arrow">✈</span>
                      </div>
                      <span className="route-type">Scheduled route</span>
                    </div>

                    <div className="route-terminal">
                      <div className="route-line-result">{getAirportCode(flight.destination)}</div>
                      <small>{getCityName(flight.destination)}</small>
                    </div>
                  </div>

                  <div className="result-meta">
                    <div>
                      <small>Date</small>
                      <p>{flight.departureDate}</p>
                    </div>
                    <div>
                      <small>Schedule</small>
                      <p>{flight.departureTime} – {flight.arrivalTime}</p>
                    </div>
                    <div>
                      <small>Seats Left</small>
                      <p className={flight.availableSeats < 10 ? "low-seats" : ""}>
                        {flight.availableSeats} Available
                      </p>
                    </div>
                    <div>
                      <small>Fare / Traveler</small>
                      <p className="fare-tag">{formatPrice(flight.price)}</p>
                    </div>
                  </div>

                  <button
                    className={`result-btn primary-btn ${isSelected ? "active-flight-btn" : ""}`}
                    type="button"
                    disabled={isLoadingDetails && isSelected}
                    onClick={() => handleSelectFlight(flight, false)}
                  >
                    {isLoadingDetails && isSelected
                      ? "Loading Seat Map..."
                      : isSelected
                      ? "✓ Flight Selected (Choose Seats Below)"
                      : "Select Outbound Flight"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Inbound / Return Flight Results */}
      {tripType === "Round Trip" && returnResults.length > 0 && (
        <section className="results-section return-results-section">
          <div className="section-center">
            <span>RETURN FLIGHTS</span>
            <h2>Inbound Options: {getCityName(to)} ➔ {getCityName(from)}</h2>
            <p>Showing direct flights returning on {returnDate}</p>
          </div>

          <div className="results-grid">
            {returnResults.map((flight) => {
              const isSelected = selectedReturnFlight?.id === flight.id;
              return (
                <article
                  key={`return-${flight.id}`}
                  className={`result-card ${isSelected ? "selected-card" : ""}`}
                >
                  <div className="result-header">
                    <div>
                      <small>{flight.airline}</small>
                      <h3>{flight.flightNumber}</h3>
                    </div>
                    <span className="result-status">{flight.status}</span>
                  </div>

                  <div className="result-route">
                    <div className="route-terminal">
                      <div className="route-line-result">{getAirportCode(flight.origin)}</div>
                      <small>{getCityName(flight.origin)}</small>
                    </div>

                    <div className="route-graphic">
                      <span className="route-flight-time">Direct</span>
                      <div className="route-flight-line">
                        <span className="flight-arrow">✈</span>
                      </div>
                      <span className="route-type">Scheduled route</span>
                    </div>

                    <div className="route-terminal">
                      <div className="route-line-result">{getAirportCode(flight.destination)}</div>
                      <small>{getCityName(flight.destination)}</small>
                    </div>
                  </div>

                  <div className="result-meta">
                    <div>
                      <small>Return Date</small>
                      <p>{flight.departureDate}</p>
                    </div>
                    <div>
                      <small>Schedule</small>
                      <p>{flight.departureTime} – {flight.arrivalTime}</p>
                    </div>
                    <div>
                      <small>Seats Left</small>
                      <p className={flight.availableSeats < 10 ? "low-seats" : ""}>
                        {flight.availableSeats} Available
                      </p>
                    </div>
                    <div>
                      <small>Fare / Traveler</small>
                      <p className="fare-tag">{formatPrice(flight.price)}</p>
                    </div>
                  </div>

                  <button
                    className={`result-btn primary-btn ${isSelected ? "active-flight-btn" : ""}`}
                    type="button"
                    onClick={() => handleSelectFlight(flight, true)}
                  >
                    {isSelected ? "✓ Return Flight Selected" : "Select Return Flight"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Booking, Aircraft Cabin Seat Map & Passenger Details */}
      {selectedFlight && flightDetails && (
        <section className="booking-panel" id="booking-panel">
          <div className="booking-summary">
            <div>
              <span className="booking-eyebrow">STEP 2 OF 2</span>
              <h2>Aircraft Seat Selection & Passenger Details</h2>
              <p>Choose your seats on the aircraft cabin below and enter passenger names</p>
            </div>

            <div className="summary-tags">
              <span className="tag-flight">Flight: {flightDetails.flightNumber}</span>
              <span className="tag-route">{flightDetails.origin} ➔ {flightDetails.destination}</span>
              <span className="tag-date">{flightDetails.departureDate}</span>
              <span className="tag-time">{flightDetails.departureTime}</span>
            </div>
          </div>

          <div className="booking-layout">
            {/* Realistic Aircraft Cabin Map */}
            <div className="seat-panel">
              <div className="seat-header">
                <div>
                  <h3>Airliner Cabin Map</h3>
                  <small>
                    {selectedSeats.length}/{travelerCount} seat(s) assigned
                  </small>
                </div>

                <div className="seat-legend">
                  <span>
                    <span className="seat-dot available"></span> Available
                  </span>
                  <span>
                    <span className="seat-dot selected"></span> Selected
                  </span>
                  <span>
                    <span className="seat-dot booked"></span> Booked
                  </span>
                </div>
              </div>

              {/* Aircraft Nose / Cockpit */}
              <div className="cabin-cockpit">
                <div className="cockpit-nose"></div>
                <span>COCKPIT / FRONT</span>
              </div>

              {/* Cabin Grid with Central Aisle */}
              <div className="cabin-container">
                <div className="cabin-aisle-headers">
                  <span className="col-label">A (Window)</span>
                  <span className="col-label">B (Aisle)</span>
                  <span className="aisle-spacer">WALKWAY</span>
                  <span className="col-label">C (Aisle)</span>
                  <span className="col-label">D (Window)</span>
                </div>

                <div className="cabin-rows">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((rowNum) => {
                    const rowSeats = flightDetails.seats.filter((s) => {
                      const num = parseInt(s.seatNumber.replace(/\D/g, ""), 10);
                      return num === rowNum;
                    });

                    const seatA = rowSeats.find((s) => s.seatNumber.startsWith("A"));
                    const seatB = rowSeats.find((s) => s.seatNumber.startsWith("B"));
                    const seatC = rowSeats.find((s) => s.seatNumber.startsWith("C"));
                    const seatD = rowSeats.find((s) => s.seatNumber.startsWith("D"));

                    const renderSeatBtn = (seat?: SeatInfo) => {
                      if (!seat) return <div className="seat-empty"></div>;
                      const isBooked = seat.status === "booked";
                      const isSelected = selectedSeats.includes(seat.seatNumber);
                      return (
                        <button
                          key={seat.seatNumber}
                          type="button"
                          className={`cabin-seat ${isBooked ? "booked" : ""} ${isSelected ? "selected" : ""}`}
                          disabled={isBooked}
                          aria-label={`${seat.seatNumber} • ${isBooked ? "Booked" : isSelected ? "Selected" : "Available"}`}
                          title={`${seat.seatNumber} • ${isBooked ? "Booked" : isSelected ? "Selected" : "Available"}`}
                          onClick={() => handleSeatToggle(seat.seatNumber)}
                        >
                          {isSelected && <span className="seat-check" aria-hidden="true">✓</span>}
                          {!isBooked && !isSelected && <span className="seat-visual" aria-hidden="true"></span>}
                          {isBooked && <span className="seat-booked-mark" aria-hidden="true"></span>}
                        </button>
                      );
                    };

                    const isBusiness = rowNum <= 2;

                    return (
                      <div key={`row-${rowNum}`} className={`cabin-row ${isBusiness ? "business-row" : ""}`}>
                        <div className="row-number-badge">
                          Row {rowNum}
                          {isBusiness && <small>Business</small>}
                        </div>

                        <div className="row-side left-side">
                          {renderSeatBtn(seatA)}
                          {renderSeatBtn(seatB)}
                        </div>

                        <div className="cabin-center-aisle" aria-hidden="true"></div>

                        <div className="row-side right-side">
                          {renderSeatBtn(seatC)}
                          {renderSeatBtn(seatD)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedSeats.length > 0 && (
                <div className="selected-seats-badge">
                  Selected Seats: <b>{selectedSeats.join(", ")}</b>
                </div>
              )}
            </div>

            {/* Passenger Information & Fare Breakdown Form */}
            <div className="booking-form-wrapper">
              <form className="booking-form" onSubmit={handleBookingSubmit}>
                <div className="form-heading">
                  <h3>Traveler Information</h3>
                  <p>Please enter passenger details matching government IDs</p>
                </div>

                {passengerDetails.map((passenger, index) => (
                  <div key={`passenger-field-${index}`} className="passenger-input-block">
                    <label className="passenger-label">
                      Passenger #{index + 1}
                      {selectedSeats[index] && (
                        <span className="assigned-seat-chip">Seat {selectedSeats[index]}</span>
                      )}
                    </label>

                    <div className="passenger-row-fields">
                      <select
                        className="title-select"
                        value={passenger.title}
                        onChange={(e) => handlePassengerTitleChange(index, e.target.value)}
                      >
                        <option value="Mr">Mr</option>
                        <option value="Ms">Ms</option>
                        <option value="Mrs">Mrs</option>
                        <option value="Dr">Dr</option>
                      </select>

                      <input
                        className="booking-field passenger-name-input"
                        type="text"
                        required
                        value={passenger.name}
                        placeholder="Full Legal Name"
                        onChange={(e) => handlePassengerNameChange(index, e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                <div className="contact-details-grid">
                  <div>
                    <label htmlFor="contact-email">Contact Email</label>
                    <input
                      id="contact-email"
                      className="booking-field"
                      type="email"
                      value={contactEmail}
                      placeholder="e.g. traveler@gmail.com"
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-phone">Mobile Phone</label>
                    <input
                      id="contact-phone"
                      className="booking-field"
                      type="tel"
                      value={contactPhone}
                      placeholder="e.g. +91 98765 43210"
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="booking-field-group">
                  <label htmlFor="promo-input">Promo Code</label>
                  <div className="promo-input-row">
                    <input
                      id="promo-input"
                      className="booking-field"
                      value={promoCode}
                      placeholder="e.g. FLYINDIA / WELCOME"
                      onChange={(event) => setPromoCode(event.target.value)}
                    />
                  </div>
                  <small className="promo-hint">
                    Domestic: <b>FLYINDIA</b> (30% off) | Any: <b>WELCOME</b> (₹1,000 off) | Intl: <b>WORLD20</b> (20% off)
                  </small>
                </div>

                {/* Fare Summary Breakdown */}
                <div className="fare-summary-card">
                  <div className="booking-total">
                    <span>Base Fare ({travelerCount} × {formatPrice(selectedFlight.price)})</span>
                    <span>{formatPrice(selectedFlight.price * travelerCount)}</span>
                  </div>

                  <div className="booking-total">
                    <span>Taxes & Airport User Development Fee</span>
                    <span>₹0 (Included)</span>
                  </div>

                  {quotedDiscount > 0 && (
                    <div className="booking-total discount-row">
                      <span>Promo Discount ({promoCode.toUpperCase()})</span>
                      <span className="discount-value">-{formatPrice(quotedDiscount)}</span>
                    </div>
                  )}

                  <div className="booking-total total-row">
                    <span>Total Amount Due</span>
                    <strong className="grand-total">{formatPrice(quotedTotal)}</strong>
                  </div>
                </div>

                <button
                  className="booking-btn primary-btn confirm-book-btn"
                  type="submit"
                  disabled={isSubmittingBooking}
                >
                  {isSubmittingBooking ? "Confirming Booking..." : `Confirm & Book Now • ${formatPrice(quotedTotal)}`}
                </button>

                {bookingNotice && (
                  <div className={`state-box ${bookingNotice.type}`}>
                    <span className="state-icon">
                      {bookingNotice.type === "success" ? "✓" : bookingNotice.type === "error" ? "⚠" : "ℹ"}
                    </span>
                    {bookingNotice.text}
                  </div>
                )}
              </form>
            </div>
          </div>
        </section>
      )}

      {/* ── Experiment 06: JWT Authentication Demo ─────────────────────────── */}
      {legacyDemoEnabled && <section className="jwt-demo-section" id="jwt-demo">
        <div className="jwt-demo-container">
          <div className="jwt-demo-header">
            <span className="jwt-demo-badge">EXPERIMENT 06</span>
            <h2>JWT Authentication Flow</h2>
            <p>
              Full end-to-end demo: <strong>Register → Login → Receive JWT → Authorization: Bearer &lt;token&gt; → Protected Booking API</strong>
            </p>
          </div>

          {/* Step Progress Bar */}
          <div className="jwt-steps-bar">
            <div className={`jwt-step-dot ${jwtDemoStep === "auth" || jwtDemoStep === "token" || jwtDemoStep === "bookings" ? "done" : ""}`}>
              <span>1</span>
              <small>{jwtDemoMode === "register" ? "Register / Login" : "Login"}</small>
            </div>
            <div className="jwt-step-line" />
            <div className={`jwt-step-dot ${jwtDemoStep === "token" || jwtDemoStep === "bookings" ? "done" : ""}`}>
              <span>2</span>
              <small>JWT Token</small>
            </div>
            <div className="jwt-step-line" />
            <div className={`jwt-step-dot ${jwtDemoStep === "bookings" ? "done" : ""}`}>
              <span>3</span>
              <small>Protected API</small>
            </div>
          </div>

          <div className="jwt-demo-body">
            {/* Left Panel — Auth Form */}
            <div className="jwt-panel jwt-panel-auth">
              <div className="jwt-panel-title">
                <span className="jwt-endpoint-badge">
                  {jwtDemoMode === "register" ? "POST /api/auth/register" : "POST /api/auth/login"}
                </span>
                <div className="jwt-mode-toggle">
                  <button
                    type="button"
                    className={jwtDemoMode === "register" ? "jwt-tab active" : "jwt-tab"}
                    onClick={() => { setJwtDemoMode("register"); setJwtDemoNotice(null); }}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    className={jwtDemoMode === "login" ? "jwt-tab active" : "jwt-tab"}
                    onClick={() => { setJwtDemoMode("login"); setJwtDemoNotice(null); }}
                  >
                    Login
                  </button>
                </div>
              </div>

              <form className="jwt-auth-form" onSubmit={handleJwtDemoSubmit}>
                {jwtDemoMode === "register" && (
                  <div className="jwt-field">
                    <label>Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={jwtDemoForm.name}
                      onChange={(e) => setJwtDemoForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                )}
                <div className="jwt-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. user@skybook.com"
                    value={jwtDemoForm.email}
                    onChange={(e) => setJwtDemoForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="jwt-field">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="Min. 6 characters"
                    value={jwtDemoForm.password}
                    onChange={(e) => setJwtDemoForm((p) => ({ ...p, password: e.target.value }))}
                  />
                </div>

                {jwtDemoNotice && (
                  <div className={`jwt-notice jwt-notice-${jwtDemoNotice!.type}`}>
                    {jwtDemoNotice!.text}
                  </div>
                )}

                <div className="jwt-form-actions">
                  <button type="submit" className="primary-btn jwt-auth-btn" disabled={jwtDemoLoading}>
                    {jwtDemoLoading ? "Processing..." : jwtDemoMode === "register" ? "Register & Get Token" : "Login & Get Token"}
                  </button>
                  {jwtDemoToken && (
                    <button type="button" className="jwt-logout-btn" onClick={handleJwtDemoLogout}>
                      🔓 Logout &amp; Reset
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Center Panel — JWT Token Display */}
            <div className="jwt-panel jwt-panel-token">
              <div className="jwt-panel-title">
                <span className="jwt-endpoint-badge jwt-badge-token">localStorage · skybook-token</span>
              </div>
              {jwtDemoToken ? (
                <div className="jwt-token-box">
                  <div className="jwt-token-label">🔑 Bearer Token (JWT)</div>
                  <div className="jwt-token-value">{jwtDemoToken!}</div>
                  <div className="jwt-token-parts">
                    {jwtDemoToken!.split(".").map((_part, i) => (
                      <span key={i} className={`jwt-part jwt-part-${i}`} title={["Header", "Payload", "Signature"][i]}>
                        {["Header", "Payload", "Signature"][i]}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary-btn jwt-fetch-btn"
                    onClick={handleJwtDemoFetchBookings}
                    disabled={jwtDemoLoading}
                  >
                    {jwtDemoLoading ? "Fetching..." : "🔐 GET /api/bookings with Bearer Token"}
                  </button>
                </div>
              ) : (
                <div className="jwt-token-placeholder">
                  <span className="jwt-lock-icon">🔒</span>
                  <p>JWT token will appear here after login</p>
                  <code>Authorization: Bearer &lt;token&gt;</code>
                </div>
              )}
            </div>

            {/* Right Panel — Protected Bookings */}
            <div className="jwt-panel jwt-panel-bookings">
              <div className="jwt-panel-title">
                <span className="jwt-endpoint-badge jwt-badge-protected">GET /api/bookings  🔐 Protected</span>
              </div>
              {jwtDemoBookings === null ? (
                <div className="jwt-token-placeholder">
                  <span className="jwt-lock-icon">🗂️</span>
                  <p>Protected booking data will be displayed here after authentication</p>
                  <small>Requires valid Bearer token in Authorization header</small>
                </div>
              ) : jwtDemoBookings!.length === 0 ? (
                <div className="jwt-token-placeholder">
                  <span className="jwt-lock-icon">📭</span>
                  <p>No bookings found. Make a booking above to see it here!</p>
                </div>
              ) : (
                <div className="jwt-bookings-list">
                  {jwtDemoBookings!.slice(0, 5).map((b, i) => (
                    <div key={b.id ?? i} className="jwt-booking-row">
                      <div className="jwt-booking-pnr">{b.pnr || `BK-${i + 1}`}</div>
                      <div className="jwt-booking-info">
                        <span>{b.passengerName || b.passengerName || "—"}</span>
                        <span>{b.origin ? `${b.origin} → ${b.destination}` : `Flight ${b.flightId || "—"}`}</span>
                        <span className={`jwt-booking-status ${String(b.status || "").toLowerCase()}`}>{b.status || "CONFIRMED"}</span>
                      </div>
                    </div>
                  ))}
                  {jwtDemoBookings!.length > 5 && (
                    <div className="jwt-more-label">+{jwtDemoBookings!.length - 5} more booking(s)</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* HTTP Request Trace */}
          {jwtDemoToken && (
            <div className="jwt-trace-box">
              <div className="jwt-trace-title">🌐 HTTP Request Trace</div>
              <pre className="jwt-trace-code">{`// Step 1 — Register (if new user)
POST http://localhost:8080/api/auth/register
Content-Type: application/json
{ "name": "${jwtDemoForm.name || "User"}", "email": "${jwtDemoForm.email || "..."}", "password": "••••••" }

// Step 2 — Login → receive JWT
POST http://localhost:8080/api/auth/login
Content-Type: application/json
{ "email": "${jwtDemoForm.email || "..."}", "password": "••••••" }
← 200 OK  { "ok": true, "token": "${jwtDemoToken!.substring(0, 40)}..." }

// Step 3 — Protected API call with Bearer token
GET http://localhost:8080/api/bookings
Authorization: Bearer ${jwtDemoToken!.substring(0, 40)}...
← 200 OK  { "ok": true, "bookings": [...] }

// Step 4 — Logout
localStorage.removeItem("skybook-token")  // Token cleared`}</pre>
            </div>
          )}
        </div>
      </section>}
      {/* ──────────────────────────────────────────────────────────────────── */}

      {/* My Bookings Section */}
      <section className="bookings-section" id="bookings">
        <div className="section-center bookings-header">
          <span>MANAGE RESERVATIONS</span>
          <h2>MyBookings</h2>
          <p>Review your booking references, flight details, seats, and reservation status.</p>
        </div>

        <div className="bookings-shell">
          {myBookingsLoading ? (
            <div className="empty-bookings-card" role="status">Loading your bookings...</div>
          ) : myBookingsError ? (
            <div className="empty-bookings-card" role="alert">
              <h3>Bookings could not be loaded</h3>
              <p>{myBookingsError}</p>
              <button type="button" className="primary-btn" onClick={() => {
                setMyBookingsLoading(true);
                setBookingsReloadKey((key) => key + 1);
              }}>
                Try again
              </button>
            </div>
          ) : myBookings.length === 0 ? (
            <div className="empty-bookings-card">
              <div className="empty-bookings-icon">🎫</div>
              <h3>No Active Bookings Found</h3>
              <p>
                {currentUser
                  ? "You have not made any flight bookings yet. Search for a destination above to book your next trip!"
                  : "Please log in to view your bookings and reservation references."}
              </p>
              {currentUser ? (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => document.getElementById("search")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Search Flights Now
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setAuthMode("login");
                    updateBrowserRoute("/login");
                  }}
                >
                  Log In To View Bookings
                </button>
              )}
            </div>
          ) : (
            <div className="bookings-list">
              {myBookings.map((booking) => (
                <article key={booking.id} className="booking-card">
                  <div className="booking-card-header">
                    <div>
                      <small>BOOKING REFERENCE (PNR)</small>
                      <h3 className="pnr-title">{booking.pnr}</h3>
                    </div>

                    <span className={`result-status ${booking.status === "CANCELLED" ? "status-cancelled" : "status-confirmed"}`}>
                      {booking.status}
                    </span>
                  </div>

                  <div className="booking-card-body">
                    <div>
                      <small>Flight / Carrier</small>
                      <p>{booking.flightNumber} • {booking.airline}</p>
                    </div>

                    <div>
                      <small>Route</small>
                      <p>{booking.origin} ➔ {booking.destination}</p>
                    </div>

                    <div>
                      <small>Departure Date & Time</small>
                      <p>{booking.departureDate} ({booking.departureTime})</p>
                    </div>

                    <div>
                      <small>Passenger(s)</small>
                      <p>{booking.passengerName}</p>
                    </div>

                    <div>
                      <small>Assigned Seats</small>
                      <p className="seat-tags-inline">
                        {booking.seatNumbers.map((s) => (
                          <span key={s} className="seat-badge-chip">{s}</span>
                        ))}
                      </p>
                    </div>

                    <div>
                      <small>Booking total · payment not collected</small>
                      <p className="fare-tag">{formatPrice(booking.totalPrice)}</p>
                    </div>
                  </div>

                  <div className="booking-actions-row">
                    <button
                      className="view-ticket-btn"
                      type="button"
                      onClick={() => setTicketModalBooking(booking)}
                    >
                      🎫 View Booking Details
                    </button>

                    {booking.status !== "CANCELLED" && (
                      <button
                        className="cancel-booking-btn"
                        type="button"
                        onClick={() => setCancelModalBooking(booking)}
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Special Offers Section */}
      <section className="offers" id="offers">
        <div className="section-heading">
          <div>
            <span>EXCLUSIVE DEALS</span>
            <h2>Special Offers For You</h2>
          </div>

          <button
            className="view-btn"
            type="button"
            onClick={() => document.getElementById("destinations")?.scrollIntoView({ behavior: "smooth" })}
          >
            Explore Destinations ➔
          </button>
        </div>

        <div className="offers-grid">
          <div
            className="offer-card offer1 clickable-offer"
            onClick={() => handleApplyPromoFromCard("FLYINDIA")}
            title="Click to apply FLYINDIA"
          >
            <div className="discount">30% OFF</div>
            <div className="offer-content">
              <p>DOMESTIC ROUTES</p>
              <h3>Explore India</h3>
              <span>Use Code: <b>FLYINDIA</b> (Click to Apply)</span>
            </div>
          </div>

          <div
            className="offer-card offer2 clickable-offer"
            onClick={() => handleApplyPromoFromCard("WELCOME")}
            title="Click to apply WELCOME"
          >
            <div className="discount">₹1,000 OFF</div>
            <div className="offer-content">
              <p>ANY FLIGHT</p>
              <h3>Welcome Aboard!</h3>
              <span>Use Code: <b>WELCOME</b> (Click to Apply)</span>
            </div>
          </div>

          <div
            className="offer-card offer3 clickable-offer"
            onClick={() => handleApplyPromoFromCard("WORLD20")}
            title="Click to apply WORLD20"
          >
            <div className="discount">20% OFF</div>
            <div className="offer-content">
              <p>INTERNATIONAL (DUBAI)</p>
              <h3>Fly International</h3>
              <span>Use Code: <b>WORLD20</b> (Click to Apply)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why SkyBook / Features Section */}
      <section className="features">
        <div className="section-center">
          <span>WHY SKYBOOK?</span>
          <h2>Everything You Need To Travel</h2>
          <p>A seamless, world-class flight reservation experience built for speed and clarity.</p>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <img src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80" alt="Airline flight search" />
            </div>
            <h3>Smart Search</h3>
            <p>Compare the fares currently available in the SkyBook flight catalog.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <img src="https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=900&q=80" alt="Airplane cabin seat selection" />
            </div>
            <h3>Cabin Seat Selection</h3>
            <p>Choose an available seat from the inventory supplied by the booking system.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <img src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=80" alt="Secure flight booking" />
            </div>
            <h3>Secure Bookings</h3>
            <p>Seat availability is checked during booking. Online payment processing is not integrated.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <img src="https://images.unsplash.com/photo-1529074963764-98f45c47344b?auto=format&fit=crop&w=900&q=80" alt="Digital boarding pass" />
            </div>
            <h3>Booking reference</h3>
            <p>Receive a booking reference and reservation details. This is not an airline boarding pass.</p>
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <section className="destinations" id="destinations">
        <div className="section-center">
          <span>POPULAR DESTINATIONS</span>
          <h2>Where Will You Go Next?</h2>
          <p>Click any destination to find available flights directly from Mumbai</p>
        </div>

        <div className="destination-grid">
          <button
            type="button"
            className="destination-card mumbai"
            onClick={() => handleDestinationSearch("Mumbai (BOM)")}
          >
            <div className="destination-overlay">
              <h3>Mumbai</h3>
              <p>Explore city routes</p>
              <span>Search Mumbai flights ➔</span>
            </div>
          </button>

          <button
            type="button"
            className="destination-card delhi"
            onClick={() => handleDestinationSearch("Delhi (DEL)")}
          >
            <div className="destination-overlay">
              <h3>Delhi</h3>
              <p>Explore city routes</p>
              <span>Search Delhi flights ➔</span>
            </div>
          </button>

          <button
            type="button"
            className="destination-card goa"
            onClick={() => handleDestinationSearch("Goa (GOI)")}
          >
            <div className="destination-overlay">
              <h3>Goa</h3>
              <p>Explore city routes</p>
              <span>Search Goa flights ➔</span>
            </div>
          </button>

          <button
            type="button"
            className="destination-card dubai"
            onClick={() => handleDestinationSearch("Dubai (DXB)")}
          >
            <div className="destination-overlay">
              <h3>Dubai</h3>
              <p>Explore international routes</p>
              <span>Search Dubai flights ➔</span>
            </div>
          </button>
        </div>
      </section>

      {/* Live Flight Status Panel */}
      <section className="flight-status" id="status">
        <div className="status-container">
          <div className="status-text">
            <span>FLIGHT SCHEDULE LOOKUP</span>
            <h2>Track Your Flight</h2>
            <p>Find schedule information held by SkyBook. Operational status is not verified against a live airline feed.</p>

            <div className="status-input">
              <input
                value={statusInput}
                placeholder="Enter Flight Number (e.g. SK-101)"
                onChange={(event) => setStatusInput(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleStatusLookup();
                  }
                }}
              />

              <button
                type="button"
                disabled={statusLoading}
                onClick={() => void handleStatusLookup()}
              >
                {statusLoading ? "Tracking..." : "Track Flight"}
              </button>
            </div>

            {statusNotice && (
              <div className={`state-box ${statusNotice.type}`}>
                <span className="state-icon">
                  {statusNotice.type === "success" ? "✓" : statusNotice.type === "error" ? "⚠" : "ℹ"}
                </span>
                {statusNotice.text}
              </div>
            )}
          </div>

          <div className="status-card">
            {statusResult ? <>
            <div className="status-header">
              <div>
                <small>{statusResult?.airline || "SKYBOOK AIRLINES"}</small>
                <h3>{statusResult ? statusResult.flightNumber : "SK-101"}</h3>
              </div>

              <span className="status-badge">
                {statusResult.status}
              </span>
            </div>

            <div className="flight-route">
              <div>
                <h2>{getAirportCode(statusResult.origin)}</h2>
                <p>{getCityName(statusResult.origin)}</p>
                <b>{statusResult.departureTime}</b>
              </div>

              <div className="flight-progress-indicator">
                <span className="plane-progress-icon">✈</span>
                <div className="progress-bar-line"></div>
                <small className="progress-status-label">{statusResult.departureDate}</small>
              </div>

              <div>
                <h2>{getAirportCode(statusResult.destination)}</h2>
                <p>{getCityName(statusResult.destination)}</p>
                <b>{statusResult.arrivalTime}</b>
              </div>
            </div>

            <div className="status-meta-pills">
              <span>Terminal: {statusResult.terminal || "Not provided"}</span>
              <span>Gate: {statusResult.gate || "Not provided"}</span>
              <span>Baggage belt: {statusResult.baggageBelt || "Not provided"}</span>
            </div>
            <p className="status-data-source">{statusResult.statusSource}</p>
            </> : <div className="status-empty-card">Search a flight number to view available SkyBook schedule details.</div>}
          </div>
        </div>
      </section>

      <section className="big-stats" aria-label="SkyBook features">
        <div><h2>Transparent</h2><p>Fare details before booking</p></div>
        <div><h2>Flexible</h2><p>Choose from available seats</p></div>
        <div><h2>Protected</h2><p>JWT-secured account services</p></div>
        <div><h2>Connected</h2><p>Manage bookings in one place</p></div>
      </section>

      {/* Customer Reviews Section */}
      <section className="reviews" id="reviews">
        <div className="section-center">
          <span>BUILT FOR TRAVELERS</span>
          <h2>Travel tools in one place</h2>
          <p>Plan, book, and manage trips using the SkyBook flight catalog.</p>
        </div>

        <div className="review-grid">
          <div className="review-card">
            <div className="stars" aria-hidden="true">01</div>
            <p>Compare available flights by route and date, then review the fare before selecting seats.</p>
            <div className="review-user">
              <div className="avatar">R</div>
              <div>
                <h4>Flight search</h4>
                <small>Schedules and catalog fares</small>
              </div>
            </div>
          </div>

          <div className="review-card">
            <div className="stars" aria-hidden="true">02</div>
            <p>Choose seats and enter passenger details in the booking flow. No online payment is collected.</p>
            <div className="review-user">
              <div className="avatar">P</div>
              <div>
                <h4>Seat selection</h4>
                <small>Subject to configured inventory</small>
              </div>
            </div>
          </div>

          <div className="review-card">
            <div className="stars" aria-hidden="true">03</div>
            <p>Track a flight using the SkyBook schedule, and view bookings and fare watches from your account.</p>
            <div className="review-user">
              <div className="avatar">A</div>
              <div>
                <h4>Trip management</h4>
                <small>Protected account features</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="newsletter">
        <div>
          <span>STAY INFORMED</span>
          <h2>Get Exclusive Flight Offers</h2>
          <p>Save your email to the SkyBook updates list. Email delivery is not configured.</p>
        </div>

        <div className="subscribe-box">
          <input
            type="email"
            value={newsletterEmail}
            placeholder="Enter your email address"
            onChange={(event) => setNewsletterEmail(event.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewsletterSubmit()}
          />

          <button type="button" onClick={handleNewsletterSubmit}>
            Subscribe
          </button>
        </div>
      </section>

      {newsletterNotice && (
        <div className={`state-box ${newsletterNotice.type}`}>
          <span className="state-icon">
            {newsletterNotice.type === "success" ? "✓" : newsletterNotice.type === "error" ? "⚠" : "ℹ"}
          </span>
          {newsletterNotice.text}
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-grid">
          <div>
            <div className="footer-logo">
              <span className="logo-icon">✈</span> Sky<span>Book</span>
            </div>
            <p>
              Making air travel simple, comfortable, and intelligent with seamless flight discovery,
              transparent fares, and instant cabin reservations.
            </p>
          </div>

          <div>
            <h3>Quick Links</h3>
            <p><a href="#home">Home</a></p>
            <p><a href="#search">Search Flights</a></p>
            <p><a href="#offers">Exclusive Offers</a></p>
            <p><a href="#destinations">Destinations</a></p>
            <p><a href="#status">Track Flight Status</a></p>
          </div>

          <div>
            <h3>Services</h3>
            <p><a href="#search">Seat Selection</a></p>
            <p><a href="#bookings">Booking reference</a></p>
            <p><a href="#bookings">Booking Cancellation</a></p>
            <p><a href="#offers">Promo Codes</a></p>
          </div>

          <div>
            <h3>Help & status</h3>
            <p><a href="/flight-status" onClick={(event) => { event.preventDefault(); updateBrowserRoute("/flight-status"); }}>Flight schedule lookup</a></p>
            <p><a href="/planner" onClick={(event) => { event.preventDefault(); updateBrowserRoute("/planner"); }}>Travel planner</a></p>
            <p>Online payment processing is not configured.</p>
          </div>
        </div>

        <div className="copyright">
          © 2026 SkyBook | Airline reservation and flight management platform.
        </div>
      </footer>

      {/* Rule-based SkyBook travel assistant */}
      {chatOpen && (
        <div className="chat-box" role="dialog" aria-label="SkyBook travel assistant">
          <div className="chat-header">
            <div className="chat-title">
              <span className="chat-bot-icon">🤖</span>
              <div>
                <strong>SkyBook Assistant</strong>
                <small>Automated, rule-based answers</small>
              </div>
            </div>
            <button
              type="button"
              className="chat-close-btn"
              aria-label="Close chat"
              onClick={() => setChatOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="chat-body">
            <div className="chat-messages-container">
              {chatMessages.map((msg, index) => (
                <div
                  key={`${msg.text}-${index}`}
                  className={`chat-bubble ${msg.sender === "user" ? "user-bubble" : "bot-bubble"}`}
                >
                  <p>{msg.text}</p>
                  <small className="chat-timestamp">{msg.time}</small>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble bot-bubble typing-bubble">
                  <span className="typing-dots">Checking the help topics...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Prompt Chips */}
            <div className="chat-quick-chips">
              <button type="button" onClick={() => handleChatPrompt("Find Flights")}>
                ✈ Find Flights
              </button>
              <button type="button" onClick={() => handleChatPrompt("Active Promo Codes")}>
                🏷 Promo Codes
              </button>
              <button type="button" onClick={() => handleChatPrompt("Baggage Allowance")}>
                🧳 Baggage Rules
              </button>
              <button type="button" onClick={() => handleChatPrompt("How to check flight status")}>
                📡 Flight Status
              </button>
            </div>

            <div className="chat-input-row">
              <input
                value={chatInput}
                placeholder="Ask a travel question..."
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKeyDown}
              />
              <button
                type="button"
                className="chat-send-btn"
                disabled={!chatInput.trim() || chatLoading}
                onClick={() => handleChatPrompt(chatInput)}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Trigger Button */}
      <button
        className="chat-button"
        type="button"
        aria-label="Open SkyBook travel assistant"
        title="Chat with the SkyBook assistant"
        onClick={() => setChatOpen((current) => !current)}
      >
        <span className="chat-btn-icon">💬</span>
        <span className="chat-btn-label">Travel help</span>
      </button>

      {/* Reservation summary */}
      {ticketModalBooking && (
        <div className="auth-overlay" onClick={() => setTicketModalBooking(null)}>
          <div className="boarding-pass-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-header-strip">
              <div className="ticket-logo">
                <span>✈</span> SkyBook Airlines
              </div>
              <div className="ticket-pnr-pill">
                PNR: <b>{ticketModalBooking.pnr}</b>
              </div>
              <button
                type="button"
                className="modal-close-cross"
                onClick={() => setTicketModalBooking(null)}
              >
                ✕
              </button>
            </div>

            <div className="boarding-pass-card" id="printable-ticket">
              <div className="bp-top-row">
                <div>
                  <small>FLIGHT</small>
                  <h3>{ticketModalBooking.flightNumber}</h3>
                </div>
                <div>
                  <small>DATE</small>
                  <h3>{ticketModalBooking.departureDate}</h3>
                </div>
                <div>
                  <small>DEPARTURE</small>
                  <h3>{ticketModalBooking.departureTime}</h3>
                </div>
                <div>
                  <small>TERMINAL / GATE</small>
                  <h3>Not provided</h3>
                </div>
              </div>

              <div className="bp-route-hero">
                <div className="bp-loc">
                  <h1>{getAirportCode(ticketModalBooking.origin)}</h1>
                  <p>{getCityName(ticketModalBooking.origin)}</p>
                </div>

                <div className="bp-flight-arrow">
                  <span>Scheduled route</span>
                  <div className="flight-arrow-line">✈</div>
                  <small>{ticketModalBooking.airline}</small>
                </div>

                <div className="bp-loc">
                  <h1>{getAirportCode(ticketModalBooking.destination)}</h1>
                  <p>{getCityName(ticketModalBooking.destination)}</p>
                </div>
              </div>

              <div className="bp-details-grid">
                <div>
                  <small>PASSENGER(S)</small>
                  <p className="bp-passenger-name">{ticketModalBooking.passengerName}</p>
                </div>

                <div>
                  <small>SEAT(S)</small>
                  <p className="bp-seat-numbers">
                    {ticketModalBooking.seatNumbers.join(", ")}
                  </p>
                </div>

                <div>
                  <small>TRAVELERS</small>
                  <p>{ticketModalBooking.passengerCount} Adult(s)</p>
                </div>

                <div>
                  <small>STATUS</small>
                  <p className="bp-status-tag">{ticketModalBooking.status}</p>
                </div>
              </div>

              <div className="bp-bottom-barcode-row">
                <div className="barcode-graphic">
                  <strong>BOOKING REFERENCE</strong>
                  <small>{ticketModalBooking.pnr}</small>
                </div>

                <div className="bp-fare-summary">
                  <small>BOOKING TOTAL · PAYMENT NOT COLLECTED</small>
                  <h2>{formatPrice(ticketModalBooking.totalPrice)}</h2>
                </div>
              </div>
            </div>

            <div className="ticket-modal-actions">
              <button
                type="button"
                className="print-btn primary-btn"
                onClick={() => window.print()}
              >
                🖨 Print booking details
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setTicketModalBooking(null);
                  document.getElementById("bookings")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                View In My Bookings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Confirmation Modal */}
      {cancelModalBooking && (
        <div className="auth-overlay" onClick={() => setCancelModalBooking(null)}>
          <div className="auth-modal cancel-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-header">
              <h3>Cancel Reservation</h3>
              <button type="button" onClick={() => setCancelModalBooking(null)}>✕</button>
            </div>

            <p className="cancel-warning-text">
              Are you sure you want to cancel booking <b>{cancelModalBooking.pnr}</b> ({cancelModalBooking.origin} ➔ {cancelModalBooking.destination})?
              Your seats ({cancelModalBooking.seatNumbers.join(", ")}) will be released immediately back to available inventory.
            </p>

            <div className="cancel-modal-buttons">
              <button
                type="button"
                className="cancel-booking-btn"
                onClick={() => handleCancelBooking(cancelModalBooking.id)}
              >
                Yes, Confirm Cancellation
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setCancelModalBooking(null)}
              >
                Keep My Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Watch Demo Guided Tour Modal */}
      {demoModalOpen && (
        <div className="auth-overlay" onClick={() => setDemoModalOpen(false)}>
          <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-header">
              <h3>SkyBook Experience Walkthrough</h3>
              <button type="button" onClick={() => setDemoModalOpen(false)}>✕</button>
            </div>

            <div className="demo-steps">
              <div className="demo-step">
                <span className="step-num">1</span>
                <div>
                  <h4>Search Available Routes</h4>
                  <p>Choose your origin, destination, and travel dates across Mumbai, Delhi, Goa, Dubai, and Bengaluru.</p>
                </div>
              </div>

              <div className="demo-step">
                <span className="step-num">2</span>
                <div>
                  <h4>Choose Available Seats</h4>
                  <p>Select seats based on inventory configured for the selected SkyBook flight.</p>
                </div>
              </div>

              <div className="demo-step">
                <span className="step-num">3</span>
                <div>
                  <h4>Apply Promo Codes & Get a Booking Reference</h4>
                  <p>Applicable codes such as <b>FLYINDIA</b> and <b>WELCOME</b> update the booking fare. SkyBook returns a reservation reference, not an airline boarding pass.</p>
                </div>
              </div>

              <div className="demo-step">
                <span className="step-num">4</span>
                <div>
                  <h4>Travel assistant</h4>
                  <p>Use the rule-based help assistant for common questions about bookings, routes, and SkyBook schedule lookup.</p>
                </div>
              </div>
            </div>

            <div className="demo-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setDemoModalOpen(false);
                  document.getElementById("search")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Start Booking Now ✈
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login & Registration Modal */}
      {legacyDemoEnabled && authOpen && (
        <div
          className="auth-overlay"
          onClick={() => {
            setAuthOpen(false);
            setPendingBooking(false);
          }}
        >
          <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-header">
              <h3>{authMode === "login" ? "Welcome Back to SkyBook" : "Create Your SkyBook Account"}</h3>
              <button
                type="button"
                onClick={() => {
                  setAuthOpen(false);
                  setPendingBooking(false);
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick 1-Click Demo Login Banner */}
            <div className="demo-account-hint">
              <span>Quick Test:</span>
              <button
                type="button"
                className="demo-autofill-btn"
                onClick={handleFillDemoUser}
              >
                Click to Auto-fill Demo Account (demo@skybook.com)
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div>
                  <label htmlFor="reg-name">Full Name</label>
                  <input
                    id="reg-name"
                    className="booking-field"
                    value={authForm.name}
                    placeholder="e.g. Rahul Sharma"
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email">Email Address</label>
                <input
                  id="auth-email"
                  className="booking-field"
                  type="email"
                  required
                  value={authForm.email}
                  placeholder="e.g. traveler@skybook.com"
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  className="booking-field"
                  type="password"
                  required
                  value={authForm.password}
                  placeholder="At least 6 characters"
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                />
              </div>

              {authNotice && (
                <div className={`state-box ${authNotice!.type}`}>
                  <span className="state-icon">
                    {authNotice!.type === "success" ? "✓" : authNotice!.type === "error" ? "⚠" : "ℹ"}
                  </span>
                  {authNotice!.text}
                </div>
              )}

              <button className="auth-submit primary-btn" type="submit">
                {authMode === "login" ? "Log In to SkyBook" : "Create Free Account"}
              </button>
            </form>

            <div className="auth-toggle">
              {authMode === "login" ? "New to SkyBook?" : "Already have an account?"}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setAuthMode((current) => (current === "login" ? "register" : "login"));
                  setAuthNotice(null);
                }}
              >
                {authMode === "login" ? "Register here" : "Log In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
