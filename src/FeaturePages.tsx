import { useEffect, useState } from "react";
import { apiFetch } from "./api";

type Notice = { type: "success" | "error" | "info"; text: string };
type PlannerFlight = {
  flightId: number;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  pricePerPerson: number;
  totalCost: number;
  status: string;
  availableSeats: number;
};
type FlightOption = {
  id: number;
  active: boolean;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
};
type FareWatch = {
  id: number;
  flightId: number;
  flightNumber?: string;
  airline?: string;
  routeOrigin: string;
  routeDestination: string;
  departureDate: string;
  departureTime?: string;
  arrivalTime?: string;
  currentPrice: number;
  previousPrice: number | null;
  priceChange: number;
  targetPrice: number | null;
  alertTriggered: boolean;
  trend: "up" | "down" | "stable";
  updatedAt: string;
  snapshots: { price: number; observedAt: string }[];
};
type FlightStatusResult = {
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
type AccountBooking = {
  id: number;
  pnr: string;
  flightNumber?: string;
  airline?: string;
  origin?: string;
  destination?: string;
  travelDate?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  passengerName?: string;
  passengerCount?: number;
  seatNumbers?: string[];
  totalPrice?: number;
  status?: string;
  createdAt?: string;
};
type AccountProfile = { id: number; name: string; email: string; role: string };
type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
};

function PageFrame({ title, children, onNavigate }: { title: string; children: React.ReactNode; onNavigate: (path: string) => void }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("skybook-theme") === "dark");
  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    window.dispatchEvent(new CustomEvent("skybook:theme-change", { detail: next }));
  };
  return (
    <main className="feature-page">
      <header className="feature-page-header">
        <button type="button" className="text-btn" onClick={() => onNavigate("/")}>← SkyBook</button>
        <nav aria-label="Account features">
          <button type="button" onClick={() => onNavigate("/flight-status")}>Flight Status</button>
          <button type="button" onClick={() => onNavigate("/planner")}>Travel Planner</button>
          <button type="button" onClick={() => onNavigate("/fare-watches")}>Fare Watch</button>
          <button type="button" onClick={() => onNavigate("/dashboard")}>My Dashboard</button>
          <button type="button" onClick={() => onNavigate("/notifications")}>Notifications</button>
          <button type="button" className="feature-theme-toggle" aria-pressed={darkMode} onClick={toggleTheme}>{darkMode ? "Light mode" : "Dark mode"}</button>
        </nav>
      </header>
      <section className="feature-page-content">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

function SignInRequired({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <div className="feature-empty"><p>Sign in to access this part of your SkyBook account.</p><button type="button" className="primary-btn" onClick={() => onNavigate("/login")}>Sign in</button></div>;
}

function FlightStatusPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [flightNumber, setFlightNumber] = useState("SK-101");
  const [flight, setFlight] = useState<FlightStatusResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    setFlight(null);
    try {
      const data = await apiFetch(`/api/flights/status?flightNumber=${encodeURIComponent(flightNumber.trim())}`);
      setFlight(data.flight);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to look up this flight." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame title="Flight Status" onNavigate={onNavigate}>
      <p className="feature-intro">Look up a flight in the SkyBook schedule. Gate and baggage information appears only when supplied by the schedule.</p>
      <form className="feature-form status-search-form" onSubmit={lookup}>
        <label htmlFor="status-flight-number">Flight number<input id="status-flight-number" required maxLength={50} value={flightNumber} onChange={(event) => setFlightNumber(event.target.value)} placeholder="e.g. SK-101" /></label>
        <button className="primary-btn" type="submit" disabled={loading}>{loading ? "Looking up flight..." : "Track flight"}</button>
      </form>
      {notice && <div className={`state-box ${notice.type}`} role="status">{notice.text}</div>}
      {flight && (
        <section className="status-feature-card" aria-live="polite">
          <div className="status-feature-heading">
            <div><span>{flight.airline}</span><h2>{flight.flightNumber}</h2></div>
            <strong className="status-feature-badge">{flight.status}</strong>
          </div>
          <div className="status-feature-route">
            <div><span>From</span><strong>{flight.origin}</strong><small>{flight.departureDate} · {flight.departureTime}</small></div>
            <span className="status-route-arrow" aria-hidden="true">→</span>
            <div><span>To</span><strong>{flight.destination}</strong><small>{flight.departureDate} · {flight.arrivalTime}</small></div>
          </div>
          <dl className="status-feature-details">
            <div><dt>Terminal</dt><dd>{flight.terminal || "Not provided"}</dd></div>
            <div><dt>Gate</dt><dd>{flight.gate || "Not provided"}</dd></div>
            <div><dt>Baggage belt</dt><dd>{flight.baggageBelt || "Not provided"}</dd></div>
          </dl>
          <p className="feature-disclaimer">{flight.statusSource}</p>
        </section>
      )}
      {!flight && !notice && <p className="feature-empty">Enter a flight number to view its schedule and current SkyBook status.</p>}
    </PageFrame>
  );
}

function UserDashboard({ token, onNavigate }: { token: string | null; onNavigate: (path: string) => void }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [bookings, setBookings] = useState<AccountBooking[]>([]);
  const [watches, setWatches] = useState<FareWatch[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!token) return;
    const loadDashboard = async () => {
      setLoading(true);
      setNotice(null);
      try {
        const [profileData, bookingData, watchData, preferenceData] = await Promise.all([
          apiFetch("/api/auth/profile", {}, true),
          apiFetch("/api/bookings", {}, true),
          apiFetch("/api/fare-watches", {}, true),
          apiFetch("/api/account/preferences", {}, true),
        ]);
        setProfile(profileData.user);
        setBookings(bookingData.bookings || []);
        setWatches(watchData.fareWatches || []);
        setPreferences(preferenceData.preferences || []);
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load your account dashboard." });
      } finally {
        setLoading(false);
      }
    };
    void loadDashboard();
  }, [token]);

  if (!token) return <PageFrame title="My Dashboard" onNavigate={onNavigate}><SignInRequired onNavigate={onNavigate} /></PageFrame>;

  const togglePreference = async (preference: string) => {
    const next = preferences.includes(preference)
      ? preferences.filter((item) => item !== preference)
      : [...preferences, preference];
    setPreferences(next);
    setSavingPreferences(true);
    setNotice(null);
    try {
      await apiFetch("/api/account/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: next }),
      }, true);
      setNotice({ type: "success", text: "Your travel preferences have been saved." });
    } catch (error) {
      setPreferences(preferences);
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to save travel preferences." });
    } finally {
      setSavingPreferences(false);
    }
  };

  return (
    <PageFrame title="My SkyBook Dashboard" onNavigate={onNavigate}>
      {notice && <div className={`state-box ${notice.type}`} role="status">{notice.text}</div>}
      {loading ? <p className="feature-empty">Loading your bookings and account details...</p> : (
        <>
          <section className="account-profile-card">
            <div><span>Account profile</span><h2>{profile?.name || "Traveler"}</h2><p>{profile?.email}</p></div>
            <div><span>Account type</span><strong>{profile?.role || "USER"}</strong></div>
          </section>
          <section className="feature-results">
            <div className="feature-toolbar"><h2>My bookings</h2><span>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</span></div>
            {bookings.length === 0 ? <p className="feature-empty">You have no bookings yet. Search available flights to plan your next trip.</p> : bookings.map((booking) => (
              <article className="feature-result-row dashboard-booking-row" key={booking.id}>
                <div><strong>{booking.flightNumber || "Flight"} · {booking.pnr}</strong><span>{booking.origin || "Origin"} → {booking.destination || "Destination"}</span></div>
                <div><strong>{booking.travelDate || booking.departureDate || "Date unavailable"}</strong><span>{booking.departureTime || "Time unavailable"}{booking.arrivalTime ? ` – ${booking.arrivalTime}` : ""}</span></div>
                <div><strong>{booking.status || "Status unavailable"}</strong><span>{booking.passengerCount || 1} traveler(s) · {booking.seatNumbers?.join(", ") || "Seat details unavailable"}</span></div>
                <div><strong>₹{Number(booking.totalPrice || 0).toLocaleString("en-IN")}</strong><span>{booking.passengerName || "Passenger"}</span></div>
              </article>
            ))}
          </section>
          <section className="dashboard-columns">
            <article className="dashboard-panel">
              <div className="feature-toolbar"><h2>Saved fare watches</h2><button className="text-btn" type="button" onClick={() => onNavigate("/fare-watches")}>Manage</button></div>
              {watches.length === 0 ? <p className="feature-empty">No saved fares. Add a watch to track SkyBook schedule fares.</p> : watches.slice(0, 4).map((watch) => (
                <div className="dashboard-watch-row" key={watch.id}><strong>{watch.flightNumber || "Flight"} · ₹{Number(watch.currentPrice).toLocaleString("en-IN")}</strong><span>{watch.routeOrigin} → {watch.routeDestination} · {watch.alertTriggered ? "Target reached" : watch.trend}</span></div>
              ))}
            </article>
            <article className="dashboard-panel">
              <h2>Travel preferences</h2>
              <p className="feature-disclaimer">Used by the rule-based planner to filter SkyBook departures.</p>
              <div className="dashboard-preferences">
                {[["morning", "Morning departures"], ["evening", "Evening departures"]].map(([value, label]) => (
                  <label key={value}><input type="checkbox" checked={preferences.includes(value)} disabled={savingPreferences} onChange={() => void togglePreference(value)} />{label}</label>
                ))}
              </div>
              <button className="secondary-btn" type="button" onClick={() => onNavigate("/planner")}>Open travel planner</button>
            </article>
          </section>
        </>
      )}
    </PageFrame>
  );
}

function TravelPlanner({ token, onNavigate, onBookFlight }: { token: string | null; onNavigate: (path: string) => void; onBookFlight: (flight: PlannerFlight, travelers: number) => void }) {
  const [origins, setOrigins] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnDate, setReturnDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [budget, setBudget] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [results, setResults] = useState<PlannerFlight[]>([]);
  const [message, setMessage] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/planner/destinations").then((data) => {
      setOrigins(data.origins || []);
      setDestinations(data.destinations || []);
    }).catch((error) => setNotice({ type: "error", text: error.message }))
      .finally(() => setLoadingDestinations(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/account/preferences", {}, true)
      .then((data) => setPreferences(data.preferences || []))
      .catch((error) => setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load saved preferences." }));
  }, [token]);

  const togglePreference = (preference: string) => {
    setPreferences((current) => current.includes(preference)
      ? current.filter((item) => item !== preference)
      : [...current, preference]);
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const data = await apiFetch("/api/planner/recommend", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination,
          departureDate,
          returnDate: returnDate || undefined,
          travelers,
          budget: budget ? Number(budget) : undefined,
          preferences,
        }),
      });
      setResults(data.recommendations || []);
      setMessage(data.message || "");
      setDisclaimer(data.disclaimer || "");
    } catch (error) {
      setResults([]);
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to search recommendations." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame title="Smart Travel Planner" onNavigate={onNavigate}>
      <p className="feature-intro">Rule-based recommendations use available SkyBook flights and database fares. {token ? "Your saved departure preferences are applied." : "Sign in to use saved departure preferences."}</p>
      <form className="feature-form planner-form" onSubmit={search}>
        <label>Departure city<select required value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="">{loadingDestinations ? "Loading airports..." : "Choose origin"}</option>{origins.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Destination<select required value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">{loadingDestinations ? "Loading airports..." : "Choose destination"}</option>{destinations.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Travel date<input type="date" required min={new Date().toISOString().slice(0, 10)} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
        <label>End date (optional)<input type="date" min={departureDate} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label>
        <label>Travellers<input type="number" min="1" max="9" value={travelers} onChange={(event) => setTravelers(Number(event.target.value))} /></label>
        <label>Budget (total)<input type="number" min="1" value={budget} placeholder="No limit" onChange={(event) => setBudget(event.target.value)} /></label>
        <fieldset className="feature-preferences"><legend>Departure preference</legend>
          {[["morning", "Morning"], ["evening", "Evening"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={preferences.includes(value)} onChange={() => togglePreference(value)} /> {label}</label>)}
        </fieldset>
        <button className="primary-btn" type="submit" disabled={loading}>{loading ? "Finding flights..." : "Find recommendations"}</button>
      </form>
      {notice && <div className={`state-box ${notice.type}`}>{notice.text}</div>}
      {message && <section className="feature-results"><h2>{message}</h2>
        {results.length === 0 ? <p className="feature-empty">Try changing your date range, route, budget, or departure preference.</p> : results.map((flight) => (
          <article className="feature-result-row" key={flight.flightId}>
            <div><strong>{flight.flightNumber} · {flight.airline}</strong><span>{flight.origin} → {flight.destination}</span></div>
            <div><strong>{flight.departureDate}</strong><span>{flight.departureTime} – {flight.arrivalTime}</span></div>
            <div><strong>₹{Number(flight.pricePerPerson).toLocaleString("en-IN")}</strong><span>₹{Number(flight.totalCost).toLocaleString("en-IN")} total · {flight.availableSeats} seats</span></div>
            <button type="button" className="primary-btn" onClick={() => onBookFlight(flight, travelers)}>Continue to booking</button>
          </article>
        ))}
        {disclaimer && <p className="feature-disclaimer">{disclaimer}</p>}
      </section>}
    </PageFrame>
  );
}

function FareWatches({ token, onNavigate }: { token: string | null; onNavigate: (path: string) => void }) {
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [watches, setWatches] = useState<FareWatch[]>([]);
  const [selectedFlight, setSelectedFlight] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWatches = async () => {
    const data = await apiFetch("/api/fare-watches", {}, true);
    setWatches(data.fareWatches || []);
  };
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const [flightData, watchData] = await Promise.all([
          apiFetch("/api/flights/catalog"),
          apiFetch("/api/fare-watches", {}, true),
        ]);
        setFlights((flightData.flights || []).filter((flight: FlightOption) => flight.active));
        setWatches(watchData.fareWatches || []);
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load fare watches." });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  if (!token) return <PageFrame title="Fare Watch" onNavigate={onNavigate}><SignInRequired onNavigate={onNavigate} /></PageFrame>;

  const createWatch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await apiFetch("/api/fare-watches", { method: "POST", body: JSON.stringify({ flightId: Number(selectedFlight), targetPrice: targetPrice || undefined }) }, true);
      setTargetPrice("");
      setNotice({ type: "success", text: "Fare watch created." });
      await loadWatches();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to create fare watch." });
    } finally { setLoading(false); }
  };
  const checkFares = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/fare-watches/check", { method: "POST" }, true);
      setWatches(data.fareWatches || []);
      setNotice({ type: "success", text: data.message || "Fare observations refreshed from SkyBook flight fares." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to check fares." }); }
    finally { setLoading(false); }
  };
  const deleteWatch = async (id: number) => {
    try {
      await apiFetch(`/api/fare-watches/${id}`, { method: "DELETE" }, true);
      setWatches((current) => current.filter((watch) => watch.id !== id));
      setNotice({ type: "success", text: "Fare watch removed." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to remove fare watch." }); }
  };

  return (
    <PageFrame title="Fare Watch" onNavigate={onNavigate}>
      <p className="feature-intro">Tracks fares stored in SkyBook. This is not live external airline-market pricing.</p>
      <form className="feature-form fare-watch-form" onSubmit={createWatch}>
        <label>Available flight<select required value={selectedFlight} onChange={(event) => setSelectedFlight(event.target.value)}><option value="">Select flight</option>{flights.map((flight) => <option value={flight.id} key={flight.id}>{flight.flightNumber} · {flight.origin} → {flight.destination} · ₹{Number(flight.price).toLocaleString("en-IN")} · {flight.departureDate}</option>)}</select>{!loading && flights.length === 0 && <small>No active flights are available to watch.</small>}</label>
        <label>Target fare (optional)<input type="number" min="1" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="Alert at or below" /></label>
        <button className="primary-btn" type="submit" disabled={loading || !selectedFlight}>{loading ? "Working..." : "Add fare watch"}</button>
        <button className="secondary-btn" type="button" disabled={loading} onClick={checkFares}>Check fares</button>
      </form>
      {notice && <div className={`state-box ${notice.type}`}>{notice.text}</div>}
      <section className="feature-results"><h2>Watched flights</h2>
        {loading ? <p className="feature-empty">Loading your fare watches...</p> : watches.length === 0 ? <p className="feature-empty">No fare watches yet.</p> : watches.map((watch) => (
          <article className="feature-result-row" key={watch.id}>
            <div><strong>{watch.flightNumber} · {watch.airline}</strong><span>{watch.routeOrigin} → {watch.routeDestination} · {watch.departureDate}</span></div>
            <div><strong>₹{Number(watch.currentPrice).toLocaleString("en-IN")}</strong><span>{watch.previousPrice == null ? "First recorded fare" : `Previous ₹${Number(watch.previousPrice).toLocaleString("en-IN")}`} · {watch.trend}</span></div>
            <div><strong>{watch.targetPrice == null ? "No target" : `Alert at ₹${Number(watch.targetPrice).toLocaleString("en-IN")}`}</strong><span>{watch.alertTriggered ? "Target reached" : `Checked ${new Date(watch.updatedAt).toLocaleString()}`}</span></div>
            <button type="button" className="cancel-booking-btn" onClick={() => deleteWatch(watch.id)}>Remove</button>
            {watch.snapshots?.length > 0 && <div className="fare-snapshot-history"><strong>Recent fare observations</strong><span>{watch.snapshots.map((snapshot) => `₹${Number(snapshot.price).toLocaleString("en-IN")} · ${new Date(snapshot.observedAt).toLocaleString()}`).join("  |  ")}</span></div>}
          </article>
        ))}
      </section>
    </PageFrame>
  );
}

function Notifications({ token, onNavigate }: { token: string | null; onNavigate: (path: string) => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const data = await apiFetch("/api/notifications", {}, true);
    setItems(data.notifications || []);
  };
  useEffect(() => {
    if (!token) return;
    const loadNotifications = async () => {
      try {
        const data = await apiFetch("/api/notifications", {}, true);
        setItems(data.notifications || []);
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load notifications." });
      } finally {
        setLoading(false);
      }
    };
    void loadNotifications();
  }, [token]);
  if (!token) return <PageFrame title="Notifications" onNavigate={onNavigate}><SignInRequired onNavigate={onNavigate} /></PageFrame>;
  const markRead = async (id: number) => {
    try { await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" }, true); await load(); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to update notification." }); }
  };
  const markAllRead = async () => {
    setLoading(true);
    try { await apiFetch("/api/notifications/read-all", { method: "PUT" }, true); await load(); setNotice({ type: "success", text: "Notifications marked as read." }); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to update notifications." }); }
    finally { setLoading(false); }
  };
  return (
    <PageFrame title="Notifications" onNavigate={onNavigate}>
      <div className="feature-toolbar"><p className="feature-intro">Fare alerts and account updates.</p><button className="secondary-btn" type="button" disabled={loading} onClick={markAllRead}>Mark all read</button></div>
      {notice && <div className={`state-box ${notice.type}`}>{notice.text}</div>}
      {loading ? <p className="feature-empty">Loading notifications...</p> : items.length === 0 ? <p className="feature-empty">You have no notifications.</p> : <div className="notification-list">{items.map((item) => (
        <article className={`notification-row ${item.read ? "is-read" : ""}`} key={item.id}>
          <div><strong>{item.title}</strong><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div>
          {!item.read && <button className="text-btn" type="button" onClick={() => markRead(item.id)}>Mark read</button>}
        </article>
      ))}</div>}
    </PageFrame>
  );
}

export function FeaturePage({ route, token, onNavigate, onBookFlight }: {
  route: string;
  token: string | null;
  onNavigate: (path: string) => void;
  onBookFlight: (flight: PlannerFlight, travelers: number) => void;
}) {
  if (route === "/flight-status") return <FlightStatusPage onNavigate={onNavigate} />;
  if (route === "/dashboard") return <UserDashboard token={token} onNavigate={onNavigate} />;
  if (route === "/planner") return <TravelPlanner token={token} onNavigate={onNavigate} onBookFlight={onBookFlight} />;
  if (route === "/fare-watches") return <FareWatches token={token} onNavigate={onNavigate} />;
  return <Notifications token={token} onNavigate={onNavigate} />;
}
