import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { apiFetch } from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type User = { id: number; name: string; email: string; role?: string; phone?: string | null };

type Passenger = { title?: string; name?: string; gender?: string };

type FareBreakdown = {
  baseFare: number;
  taxes: number;
  discount: number;
  total: number;
  cabinClass?: string;
  promoCode?: string | null;
  paymentStatus?: string;
};

type CancellationPolicy = {
  eligible: boolean;
  reason: string;
  windowHours?: number;
  hoursUntilDeparture?: number;
};

type Booking = {
  id: number;
  pnr: string;
  travelDate: string;
  passengerName: string;
  passengerCount: number;
  seatNumbers: string[];
  totalPrice: number;
  status: string;
  cabinClass?: string;
  promoCode?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  flightNumber?: string;
  airline?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  arrivalTime?: string;
  createdAt?: string;
  cancelledAt?: string | null;
  cancellationPolicy?: CancellationPolicy | null;
};

type BookingDetail = Booking & {
  departureDate?: string;
  flightStatus?: string;
  terminal?: string | null;
  gate?: string | null;
  baggageBelt?: string | null;
  baggageAllowance?: string | null;
  aircraft?: string | null;
  passengers?: Passenger[] | null;
  fareBreakdown?: FareBreakdown;
  bookedByName?: string;
  bookedByEmail?: string;
  bookedByPhone?: string | null;
  cancelledBy?: string | null;
};

type FareWatch = {
  id: number;
  flightId: number;
  flightNumber?: string;
  airline?: string;
  routeOrigin?: string;
  routeDestination?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  currentPrice: number;
  previousPrice?: number | null;
  priceChange?: number | null;
  targetPrice?: number | null;
  trend?: string;
  alertTriggered?: number | boolean;
  isActive?: number | boolean;
  lastCheckedAt?: string | null;
  snapshots?: { price: number; observedAt: string }[];
};

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  read?: number | boolean;
  createdAt: string;
  link?: string | null;
};

type Overview = {
  stats: {
    totalBookings: number;
    confirmedBookings: number;
    pendingBookings: number;
    completedTrips: number;
    cancelledBookings: number;
    upcomingTrips: number;
    totalSpend: number;
    fareWatches: number;
    activeFareWatches: number;
    fareAlerts: number;
    notifications: number;
    unreadNotifications: number;
    profileCompletion: number;
  };
  upcomingTrips: {
    id: number; pnr: string; travelDate: string; passengerName: string; status: string;
    seatNumbers?: string; flightNumber?: string; airline?: string; origin?: string;
    destination?: string; departureTime?: string; arrivalTime?: string;
  }[];
  recentBookings: {
    id: number; pnr: string; travelDate: string; totalPrice: number; status: string;
    createdAt: string; flightNumber?: string; origin?: string; destination?: string;
  }[];
  recentNotifications: NotificationItem[];
};

type Tab = "overview" | "bookings" | "fares" | "notifications" | "profile";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "bookings", label: "My Bookings", icon: "✈" },
  { id: "fares", label: "Fare Watch", icon: "◎" },
  { id: "notifications", label: "Notifications", icon: "◔" },
  { id: "profile", label: "Profile & Security", icon: "◍" },
];

const PREFERENCES = [
  { value: "window", label: "Window seat" },
  { value: "aisle", label: "Aisle seat" },
  { value: "morning", label: "Morning departures" },
  { value: "evening", label: "Evening departures" },
  { value: "vegetarian", label: "Vegetarian meals" },
  { value: "assistance", label: "Special assistance" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function money(value: number | string | null | undefined) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const raw = String(value);
  // DATE-only values are calendar dates, not instants: never shift them by timezone.
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMonth(value?: string | null) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return "—";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1)
    .toLocaleDateString("en-IN", { month: "short" });
}

function formatDay(value?: string | null) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? String(Number(match[3])) : "—";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status?: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "CONFIRMED") return "ok";
  if (normalized === "PENDING") return "warn";
  if (normalized === "CANCELLED") return "danger";
  if (normalized === "COMPLETED") return "muted";
  return "muted";
}

function seatsOf(booking: { seatNumbers?: unknown }): string[] {
  if (Array.isArray(booking.seatNumbers)) return booking.seatNumbers.map(String);
  if (typeof booking.seatNumbers === "string") {
    try {
      const parsed = JSON.parse(booking.seatNumbers);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function initials(name?: string) {
  return String(name || "SkyBook User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="dash-alert error" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="dash-skeleton" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="dash-skeleton-row" key={index}>
          <span style={{ width: `${28 + (index % 3) * 8}%` }} />
          <span style={{ width: `${14 + (index % 2) * 10}%` }} />
          <span style={{ width: "12%" }} />
        </div>
      ))}
    </div>
  );
}

function PrintSheet({ booking }: { booking: BookingDetail }) {
  const seats = seatsOf(booking);
  const fare = booking.fareBreakdown;
  return (
    <div className="dash-print-sheet" aria-hidden="true">
      <header>
        <div className="print-brand">✈ SkyBook</div>
        <div>
          <strong>E-TICKET / ITINERARY</strong>
          <div>PNR {booking.pnr}</div>
        </div>
      </header>
      <section className="print-route">
        <div><strong>{booking.origin || "—"}</strong><span>{booking.departureTime || ""}</span></div>
        <div className="print-arrow">→</div>
        <div><strong>{booking.destination || "—"}</strong><span>{booking.arrivalTime || ""}</span></div>
      </section>
      <table>
        <tbody>
          <tr><th>Flight</th><td>{booking.flightNumber || "—"} · {booking.airline || ""}</td></tr>
          <tr><th>Travel date</th><td>{formatDate(booking.travelDate)}</td></tr>
          <tr><th>Passengers</th><td>{booking.passengerName} ({booking.passengerCount})</td></tr>
          <tr><th>Seats</th><td>{seats.length ? seats.join(", ") : "—"}</td></tr>
          <tr><th>Cabin</th><td>{booking.cabinClass || "Economy"}</td></tr>
          <tr><th>Contact</th><td>{booking.contactEmail || "—"} {booking.contactPhone ? `· ${booking.contactPhone}` : ""}</td></tr>
          <tr><th>Total</th><td>{money(booking.totalPrice)}</td></tr>
          <tr><th>Status</th><td>{booking.status}</td></tr>
        </tbody>
      </table>
      {fare && (
        <div className="print-fare">
          Base fare {money(fare.baseFare)} · Discount −{money(fare.discount)} · Taxes {money(fare.taxes)} · Total {money(fare.total)}
        </div>
      )}
      <p className="print-note">
        Sample itinerary generated by SkyBook. Fares are simulated and no payment was collected.
        Carry a government-issued photo ID and report to the airport at least 2 hours before departure.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerDashboard({
  token, currentUser, setCurrentUser, setToken, onNavigate,
}: {
  token: string | null;
  currentUser: User | null;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setToken: Dispatch<SetStateAction<string | null>>;
  onNavigate: (path: string) => void;
}) {
  const initialTab = (() => {
    const value = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return value && TABS.some(tab => tab.id === value) ? value : "overview";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingTotal, setBookingTotal] = useState(0);
  const [bookingPages, setBookingPages] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [appliedFilters, setAppliedFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [printBooking, setPrintBooking] = useState<BookingDetail | null>(null);

  const [watches, setWatches] = useState<FareWatch[]>([]);
  const [watchesLoading, setWatchesLoading] = useState(false);
  const [watchTargets, setWatchTargets] = useState<Record<number, string>>({});
  const [busyWatch, setBusyWatch] = useState<number | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const unread = overview?.stats.unreadNotifications ?? 0;

  const flash = useCallback((type: "success" | "error" | "info", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(current => (current?.text === text ? null : current)), 5000);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const data = await apiFetch("/api/dashboard/overview", {}, true);
      setOverview(data);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Unable to load your dashboard.");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadBookings = useCallback(async (page = 1) => {
    setBookingsLoading(true);
    setBookingsError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "8" });
      if (appliedFilters.search) params.set("search", appliedFilters.search);
      if (appliedFilters.status) params.set("status", appliedFilters.status);
      if (appliedFilters.from) params.set("from", appliedFilters.from);
      if (appliedFilters.to) params.set("to", appliedFilters.to);
      const data = await apiFetch(`/api/customer/bookings?${params.toString()}`, {}, true);
      setBookings(data.bookings || []);
      setBookingTotal(data.total || 0);
      setBookingPages(data.pages || 1);
      setBookingPage(data.page || page);
    } catch (error) {
      setBookingsError(error instanceof Error ? error.message : "Unable to load bookings.");
    } finally {
      setBookingsLoading(false);
    }
  }, [appliedFilters]);

  const loadWatches = useCallback(async () => {
    setWatchesLoading(true);
    try {
      const data = await apiFetch("/api/fare-watches", {}, true);
      const items: FareWatch[] = data.fareWatches || [];
      setWatches(items);
      setWatchTargets(Object.fromEntries(items.map(item => [item.id, item.targetPrice != null ? String(item.targetPrice) : ""])));
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to load fare watches.");
    } finally {
      setWatchesLoading(false);
    }
  }, [flash]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const data = await apiFetch("/api/notifications", {}, true);
      setNotifications(data.notifications || []);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }, [flash]);

  const loadProfile = useCallback(async () => {
    try {
      const [me, pref] = await Promise.all([
        apiFetch("/api/auth/profile", {}, true),
        apiFetch("/api/account/preferences", {}, true),
      ]);
      const user = me.user || currentUser;
      if (user) {
        setProfile({ name: user.name || "", email: user.email || "", phone: user.phone || "" });
      }
      setPreferences(pref.preferences || []);
    } catch {
      if (currentUser) setProfile({ name: currentUser.name, email: currentUser.email, phone: currentUser.phone || "" });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!token) return;
    // Defer to a task so loading state does not cascade the initial render.
    const timer = window.setTimeout(() => {
      void loadOverview();
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token, loadOverview, loadProfile]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      if (tab === "bookings") void loadBookings(1);
      if (tab === "fares") void loadWatches();
      if (tab === "notifications") void loadNotifications();
      if (tab === "profile") void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, token, loadBookings, loadWatches, loadNotifications, loadProfile]);

  useEffect(() => {
    if (!printBooking) return;
    const timer = window.setTimeout(() => window.print(), 120);
    const clear = () => setPrintBooking(null);
    window.addEventListener("afterprint", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printBooking]);

  const openBooking = async (booking: Booking) => {
    setDetailLoading(true);
    setDetail({ ...booking });
    try {
      const data = await apiFetch(`/api/bookings/${booking.id}`, {}, true);
      setDetail(data.booking);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to load booking details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const cancelBooking = async (booking: { id: number; pnr: string }) => {
    const confirmed = window.confirm(
      `Cancel booking ${booking.pnr}? Seats are released immediately. No payment was collected, so no refund is due.`
    );
    if (!confirmed) return;
    setCancellingId(booking.id);
    try {
      const data = await apiFetch(`/api/bookings/${booking.id}/cancel`, { method: "POST" }, true);
      flash("success", data.message || "Booking cancelled.");
      setDetail(null);
      await Promise.all([loadBookings(bookingPage), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to cancel booking.");
    } finally {
      setCancellingId(null);
    }
  };

  const updateWatch = async (watch: FareWatch, overrides: { targetPrice?: number | null; isActive?: boolean }) => {
    setBusyWatch(watch.id);
    try {
      const body: Record<string, unknown> = { ...overrides };
      if (overrides.targetPrice === undefined) {
        const raw = watchTargets[watch.id];
        body.targetPrice = raw === "" || raw == null ? null : Number(raw);
      }
      await apiFetch(`/api/fare-watches/${watch.id}`, { method: "PUT", body: JSON.stringify(body) }, true);
      flash("success", "Fare watch updated.");
      await Promise.all([loadWatches(), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update fare watch.");
    } finally {
      setBusyWatch(null);
    }
  };

  const recheckWatch = async (watch: FareWatch) => {
    setBusyWatch(watch.id);
    try {
      const data = await apiFetch(`/api/fare-watches/${watch.id}/check`, { method: "POST" }, true);
      flash("success", data.message || "Fare observation updated.");
      await Promise.all([loadWatches(), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to check fare.");
    } finally {
      setBusyWatch(null);
    }
  };

  const removeWatch = async (watch: FareWatch) => {
    if (!window.confirm(`Remove the fare watch for ${watch.flightNumber || "this flight"}?`)) return;
    setBusyWatch(watch.id);
    try {
      await apiFetch(`/api/fare-watches/${watch.id}`, { method: "DELETE" }, true);
      flash("success", "Fare watch removed.");
      await Promise.all([loadWatches(), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to remove fare watch.");
    } finally {
      setBusyWatch(null);
    }
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" }, true);
      setNotifications(items => items.map(item => (item.id === id ? { ...item, read: 1 } : item)));
      setOverview(current => current ? { ...current, stats: { ...current.stats, unreadNotifications: Math.max(0, current.stats.unreadNotifications - 1) } } : current);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to mark notification read.");
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/api/notifications/read-all", { method: "PUT" }, true);
      setNotifications(items => items.map(item => ({ ...item, read: 1 })));
      await loadOverview();
      flash("success", "All notifications marked as read.");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update notifications.");
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    try {
      const data = await apiFetch("/api/auth/profile", { method: "PUT", body: JSON.stringify(profile) }, true);
      const user: User = data.user;
      setCurrentUser(user);
      setProfile({ name: user.name, email: user.email, phone: user.phone || "" });
      flash("success", data.message || "Profile updated.");
      await loadOverview();
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      flash("error", "New passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const data = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      }, true);
      flash("success", data.message || "Password changed.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const togglePreference = async (value: string) => {
    const next = preferences.includes(value) ? preferences.filter(item => item !== value) : [...preferences, value];
    const previous = preferences;
    setPreferences(next);
    setPreferencesSaving(true);
    try {
      await apiFetch("/api/account/preferences", { method: "PUT", body: JSON.stringify({ preferences: next }) }, true);
      flash("success", "Travel preferences saved.");
      await loadOverview();
    } catch (error) {
      setPreferences(previous);
      flash("error", error instanceof Error ? error.message : "Unable to save preferences.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("skybook-token");
    setToken(null);
    setCurrentUser(null);
    onNavigate("/");
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (!token || !currentUser) {
    return (
      <div className="dash-root dash-root-guest">
        <div className="dash-guest-card">
          <div className="dash-guest-icon" aria-hidden="true">✈</div>
          <h1>Your travel dashboard</h1>
          <p>Sign in to view bookings, manage fare watches, download itineraries and update your profile.</p>
          <div className="dash-guest-actions">
            <button type="button" className="primary-btn" onClick={() => onNavigate("/login")}>Sign in</button>
            <button type="button" className="secondary-btn" onClick={() => onNavigate("/register")}>Create account</button>
          </div>
          <button type="button" className="text-btn" onClick={() => onNavigate("/")}>← Back to SkyBook</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-root">
      <aside className="dash-sidebar">
        <button type="button" className="dash-logo" onClick={() => onNavigate("/")}>
          <span aria-hidden="true">✈</span> Sky<strong>Book</strong>
        </button>
        <div className="dash-user-card">
          <div className="dash-avatar">{initials(currentUser.name)}</div>
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
        </div>
        <nav className="dash-nav" aria-label="Dashboard sections">
          {TABS.map(item => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => { setTab(item.id); setNotice(null); }}
            >
              <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.id === "notifications" && unread > 0 && <span className="dash-nav-badge">{unread}</span>}
            </button>
          ))}
        </nav>
        <div className="dash-sidebar-footer">
          <button type="button" className="dash-side-link" onClick={() => onNavigate("/")}>Back to site</button>
          <button type="button" className="dash-side-link danger" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <span className="dash-eyebrow">CUSTOMER DASHBOARD</span>
            <h1>{greeting}, {currentUser.name.split(" ")[0]}.</h1>
          </div>
          <div className="dash-topbar-actions">
            <button type="button" className="secondary-btn" onClick={() => onNavigate("/")}>Search flights</button>
            <button type="button" className="dash-icon-btn" aria-label="Notifications" onClick={() => setTab("notifications")}>
              ◔{unread > 0 && <span>{unread}</span>}
            </button>
          </div>
        </header>

        {notice && (
          <div className={`dash-alert ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
            <span aria-hidden="true">{notice.type === "success" ? "✓" : notice.type === "error" ? "⚠" : "ℹ"}</span>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {tab === "overview" && (
          <section className="dash-section" aria-label="Overview">
            {overviewError && <ErrorBox message={overviewError} />}
            {overviewLoading && !overview ? <SkeletonRows rows={6} /> : overview && (
              <>
                <div className="dash-stat-grid">
                  <article className="dash-stat accent">
                    <span>Upcoming trips</span>
                    <strong>{overview.stats.upcomingTrips}</strong>
                    <small>{overview.stats.confirmedBookings} confirmed booking(s)</small>
                  </article>
                  <article className="dash-stat">
                    <span>Total bookings</span>
                    <strong>{overview.stats.totalBookings}</strong>
                    <small>{overview.stats.completedTrips} completed · {overview.stats.cancelledBookings} cancelled</small>
                  </article>
                  <article className="dash-stat">
                    <span>Fare watches</span>
                    <strong>{overview.stats.activeFareWatches}<em>/{overview.stats.fareWatches}</em></strong>
                    <small>{overview.stats.fareAlerts} alert(s) triggered</small>
                  </article>
                  <article className="dash-stat">
                    <span>Recorded booking value</span>
                    <strong>{money(overview.stats.totalSpend)}</strong>
                    <small>No payment gateway · sample fares</small>
                  </article>
                </div>

                <div className="dash-profile-progress">
                  <div>
                    <strong>Profile completeness</strong>
                    <span>{overview.stats.profileCompletion}%</span>
                  </div>
                  <div className="dash-progress-track"><span style={{ width: `${overview.stats.profileCompletion}%` }} /></div>
                  {overview.stats.profileCompletion < 100 && (
                    <button type="button" className="text-btn" onClick={() => setTab("profile")}>Complete your profile →</button>
                  )}
                </div>

                <div className="dash-two-col">
                  <div className="dash-panel">
                    <div className="dash-panel-head">
                      <h2>Upcoming journeys</h2>
                      <button type="button" className="text-btn" onClick={() => setTab("bookings")}>All bookings →</button>
                    </div>
                    {overview.upcomingTrips.length === 0 ? (
                      <EmptyState
                        icon="🧳"
                        title="No upcoming trips"
                        text="Search our schedule and book your next journey — fares are sample data."
                        action={<button type="button" className="primary-btn" onClick={() => onNavigate("/")}>Find flights</button>}
                      />
                    ) : (
                      <div className="dash-trip-list">
                        {overview.upcomingTrips.map(trip => (
                          <button
                            key={trip.id}
                            type="button"
                            className="dash-trip"
                            onClick={() => {
                              setTab("bookings");
                              void openBooking({ ...trip, seatNumbers: [], passengerCount: 1, totalPrice: 0, status: trip.status });
                            }}
                          >
                            <div className="dash-trip-date">
                              <strong>{formatDay(trip.travelDate)}</strong>
                              <span>{formatMonth(trip.travelDate)}</span>
                            </div>
                            <div className="dash-trip-route">
                              <strong>{trip.origin} → {trip.destination}</strong>
                              <span>{trip.flightNumber} · {trip.departureTime} · {trip.pnr}</span>
                            </div>
                            <span className={`dash-status ${statusTone(trip.status)}`}>{trip.status}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="dash-panel">
                    <div className="dash-panel-head">
                      <h2>Recent activity</h2>
                      <button type="button" className="text-btn" onClick={() => setTab("notifications")}>View all →</button>
                    </div>
                    {overview.recentNotifications.length === 0 ? (
                      <EmptyState icon="🔔" title="Nothing new" text="Booking confirmations and fare alerts will appear here." />
                    ) : (
                      <ul className="dash-activity">
                        {overview.recentNotifications.map(item => (
                          <li key={item.id}>
                            <span className={`dash-activity-dot ${item.type}`} aria-hidden="true" />
                            <div>
                              <strong>{item.title}</strong>
                              <p>{item.message}</p>
                              <time>{formatDateTime(item.createdAt)}</time>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="dash-panel">
                  <div className="dash-panel-head">
                    <h2>Latest bookings</h2>
                    <button type="button" className="text-btn" onClick={() => setTab("bookings")}>Manage bookings →</button>
                  </div>
                  {overview.recentBookings.length === 0 ? (
                    <EmptyState icon="✈" title="No bookings yet" text="Your booking history will appear here after your first trip." />
                  ) : (
                    <div className="dash-table-wrap">
                      <table className="dash-table">
                        <thead><tr><th>PNR</th><th>Route</th><th>Travel date</th><th>Status</th><th className="right">Value</th></tr></thead>
                        <tbody>
                          {overview.recentBookings.map(booking => (
                            <tr key={booking.id}>
                              <td><strong>{booking.pnr}</strong></td>
                              <td>{booking.origin} → {booking.destination}</td>
                              <td>{formatDate(booking.travelDate)}</td>
                              <td><span className={`dash-status ${statusTone(booking.status)}`}>{booking.status}</span></td>
                              <td className="right">{money(booking.totalPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "bookings" && (
          <section className="dash-section" aria-label="My bookings">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>My bookings</h2>
                  <p>{bookingTotal} reservation(s) on your account.</p>
                </div>
                <button type="button" className="secondary-btn" onClick={() => { void loadBookings(1); void loadOverview(); }}>Refresh</button>
              </div>

              <form
                className="dash-filters"
                onSubmit={event => { event.preventDefault(); setAppliedFilters(filters); setBookingPage(1); void loadBookings(1); }}
              >
                <label>
                  <span>Search</span>
                  <input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="PNR, route or flight" />
                </label>
                <label>
                  <span>Status</span>
                  <select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
                    <option value="">All statuses</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="PENDING">Pending</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span>From</span>
                  <input type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} />
                </label>
                <div className="dash-filter-actions">
                  <button type="submit" className="primary-btn">Apply</button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => {
                      const cleared = { search: "", status: "", from: "", to: "" };
                      setFilters(cleared); setAppliedFilters(cleared); setBookingPage(1);
                      window.setTimeout(() => void loadBookings(1), 0);
                    }}
                  >Reset</button>
                </div>
              </form>

              {bookingsError && <ErrorBox message={bookingsError} />}
              {bookingsLoading ? <SkeletonRows rows={5} /> : bookings.length === 0 ? (
                <EmptyState
                  icon="🎫"
                  title="No bookings match"
                  text="Try clearing the filters, or search for a new flight."
                  action={<button type="button" className="primary-btn" onClick={() => onNavigate("/")}>Find flights</button>}
                />
              ) : (
                <>
                  <div className="dash-table-wrap">
                    <table className="dash-table bookings-table">
                      <thead>
                        <tr><th>PNR</th><th>Flight</th><th>Travel date</th><th>Passenger</th><th>Status</th><th className="right">Total</th><th className="right">Actions</th></tr>
                      </thead>
                      <tbody>
                        {bookings.map(booking => (
                          <tr key={booking.id}>
                            <td><strong>{booking.pnr}</strong><small>{booking.cabinClass || "Economy"}</small></td>
                            <td>
                              <strong>{booking.origin} → {booking.destination}</strong>
                              <small>{booking.flightNumber} · {booking.departureTime}</small>
                            </td>
                            <td>{formatDate(booking.travelDate)}</td>
                            <td>{booking.passengerName}<small>{booking.passengerCount} traveller(s) · {seatsOf(booking).join(", ") || "—"}</small></td>
                            <td><span className={`dash-status ${statusTone(booking.status)}`}>{booking.status}</span></td>
                            <td className="right">{money(booking.totalPrice)}</td>
                            <td className="right">
                              <div className="dash-row-actions">
                                <button type="button" className="dash-mini-btn" onClick={() => void openBooking(booking)}>View</button>
                                {booking.status === "CONFIRMED" && (
                                  <button type="button" className="dash-mini-btn danger" disabled={cancellingId === booking.id} onClick={() => void cancelBooking(booking)}>
                                    {cancellingId === booking.id ? "…" : "Cancel"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="dash-pagination">
                    <button type="button" className="secondary-btn" disabled={bookingPage <= 1} onClick={() => void loadBookings(bookingPage - 1)}>← Previous</button>
                    <span>Page {bookingPage} of {bookingPages}</span>
                    <button type="button" className="secondary-btn" disabled={bookingPage >= bookingPages} onClick={() => void loadBookings(bookingPage + 1)}>Next →</button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {tab === "fares" && (
          <section className="dash-section" aria-label="Fare watches">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Fare watches</h2>
                  <p>Prices are re-read from SkyBook’s sample fare table. Email/SMS alerts are not configured; alerts are in-app only.</p>
                </div>
                <button type="button" className="secondary-btn" onClick={() => onNavigate("/fare-watches")}>Add a watch</button>
              </div>
              {watchesLoading ? <SkeletonRows rows={4} /> : watches.length === 0 ? (
                <EmptyState
                  icon="◎"
                  title="No fare watches"
                  text="Pick a flight and set a target price. We re-check it on a schedule and record every observation."
                  action={<button type="button" className="primary-btn" onClick={() => onNavigate("/fare-watches")}>Browse flights to watch</button>}
                />
              ) : (
                <div className="dash-watch-grid">
                  {watches.map(watch => {
                    const active = Boolean(watch.isActive);
                    const triggered = Boolean(watch.alertTriggered);
                    return (
                      <article className={`dash-watch ${active ? "" : "paused"}`} key={watch.id}>
                        <header>
                          <div>
                            <strong>{watch.routeOrigin} → {watch.routeDestination}</strong>
                            <span>{watch.flightNumber} · {formatDate(watch.departureDate)}</span>
                          </div>
                          <span className={`dash-status ${triggered ? "ok" : active ? "warn" : "muted"}`}>
                            {triggered ? "Target reached" : active ? "Watching" : "Paused"}
                          </span>
                        </header>
                        <div className="dash-watch-price">
                          <div>
                            <span>Current fare</span>
                            <strong>{money(watch.currentPrice)}</strong>
                          </div>
                          <div>
                            <span>Target</span>
                            <strong>{watch.targetPrice == null ? "Any drop" : money(watch.targetPrice)}</strong>
                          </div>
                          <div>
                            <span>Trend</span>
                            <strong className={watch.trend === "up" ? "up" : watch.trend === "down" ? "down" : ""}>
                              {watch.trend === "up" ? "▲ Rising" : watch.trend === "down" ? "▼ Falling" : "● Stable"}
                            </strong>
                          </div>
                        </div>
                        <div className="dash-watch-controls">
                          <label>
                            <span>Target price (₹)</span>
                            <input
                              type="number"
                              min="1"
                              placeholder="e.g. 5000"
                              value={watchTargets[watch.id] ?? ""}
                              onChange={event => setWatchTargets(current => ({ ...current, [watch.id]: event.target.value }))}
                            />
                          </label>
                          <button type="button" className="primary-btn" disabled={busyWatch === watch.id} onClick={() => void updateWatch(watch, {})}>Save</button>
                        </div>
                        <footer>
                          <button type="button" className="dash-mini-btn" disabled={busyWatch === watch.id} onClick={() => void recheckWatch(watch)}>
                            {busyWatch === watch.id ? "Checking…" : "Check now"}
                          </button>
                          <button type="button" className="dash-mini-btn" disabled={busyWatch === watch.id} onClick={() => void updateWatch(watch, { isActive: !active })}>
                            {active ? "Pause" : "Resume"}
                          </button>
                          <button type="button" className="dash-mini-btn danger" disabled={busyWatch === watch.id} onClick={() => void removeWatch(watch)}>Remove</button>
                          <small>Last checked: {formatDateTime(watch.lastCheckedAt)}</small>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "notifications" && (
          <section className="dash-section" aria-label="Notifications">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Notifications</h2>
                  <p>{unread} unread · in-app delivery only (email/SMS not configured).</p>
                </div>
                <div className="dash-head-actions">
                  <button type="button" className="secondary-btn" onClick={() => void loadNotifications()}>Refresh</button>
                  <button type="button" className="secondary-btn" onClick={() => void markAllRead()} disabled={unread === 0}>Mark all read</button>
                </div>
              </div>
              {notificationsLoading ? <SkeletonRows rows={4} /> : notifications.length === 0 ? (
                <EmptyState icon="🔔" title="You're all caught up" text="Booking confirmations, cancellations and fare alerts will appear here." />
              ) : (
                <ul className="dash-notification-list">
                  {notifications.map(item => {
                    const isRead = Boolean(item.read);
                    return (
                      <li key={item.id} className={isRead ? "read" : "unread"}>
                        <span className={`dash-notification-icon ${item.type}`} aria-hidden="true">
                          {item.type === "fare" ? "◎" : item.type === "cancellation" ? "✕" : item.type === "booking" ? "✈" : "◔"}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                          <time>{formatDateTime(item.createdAt)}</time>
                        </div>
                        {!isRead && <button type="button" className="text-btn" onClick={() => void markRead(item.id)}>Mark read</button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {tab === "profile" && (
          <section className="dash-section dash-profile-grid" aria-label="Profile and security">
            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Profile details</h2></div>
              <form className="dash-form" onSubmit={saveProfile}>
                <label><span>Full name</span><input required minLength={2} value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} /></label>
                <label><span>Email address</span><input type="email" required value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} /></label>
                <label><span>Phone number</span><input value={profile.phone} onChange={event => setProfile(current => ({ ...current, phone: event.target.value }))} placeholder="+91 98765 43210" /></label>
                <button type="submit" className="primary-btn" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</button>
              </form>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Travel preferences</h2></div>
              <p className="dash-muted">Preferences are stored on your account and applied by the travel planner.</p>
              <div className="dash-preference-grid">
                {PREFERENCES.map(pref => (
                  <label key={pref.value} className={preferences.includes(pref.value) ? "checked" : ""}>
                    <input
                      type="checkbox"
                      checked={preferences.includes(pref.value)}
                      disabled={preferencesSaving}
                      onChange={() => void togglePreference(pref.value)}
                    />
                    {pref.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Password & security</h2></div>
              <form className="dash-form" onSubmit={changePassword}>
                <label><span>Current password</span><input type="password" required autoComplete="current-password" value={passwordForm.currentPassword} onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))} /></label>
                <label><span>New password</span><input type="password" required minLength={6} autoComplete="new-password" value={passwordForm.newPassword} onChange={event => setPasswordForm(current => ({ ...current, newPassword: event.target.value }))} /></label>
                <label><span>Confirm new password</span><input type="password" required minLength={6} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={event => setPasswordForm(current => ({ ...current, confirmPassword: event.target.value }))} /></label>
                <button type="submit" className="primary-btn" disabled={passwordSaving}>{passwordSaving ? "Updating…" : "Change password"}</button>
              </form>
              <p className="dash-fineprint">Sessions use signed JWTs. Changing your password does not revoke tokens already issued on other devices.</p>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Account</h2></div>
              <dl className="dash-account-list">
                <div><dt>Account ID</dt><dd>#{currentUser.id}</dd></div>
                <div><dt>Role</dt><dd>{currentUser.role === "ADMIN" ? "Administrator" : "Customer"}</dd></div>
                <div><dt>Email alerts</dt><dd>Not configured — in-app notifications only</dd></div>
                <div><dt>Payments</dt><dd>No payment gateway integrated</dd></div>
              </dl>
              <button type="button" className="secondary-btn" onClick={signOut}>Sign out</button>
            </div>
          </section>
        )}
      </main>

      {detail && (
        <div className="dash-modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <div className="dash-modal" role="dialog" aria-modal="true" aria-label={`Booking ${detail.pnr}`} onClick={event => event.stopPropagation()}>
            <header className="dash-modal-head">
              <div>
                <span className="dash-eyebrow">BOOKING {detail.pnr}</span>
                <h2>{detail.origin} → {detail.destination}</h2>
                <p>{detail.flightNumber} · {detail.airline} · {formatDate(detail.travelDate)}</p>
              </div>
              <button type="button" className="dash-modal-close" onClick={() => setDetail(null)} aria-label="Close">×</button>
            </header>

            {detailLoading ? <SkeletonRows rows={4} /> : (
              <>
                <div className="dash-detail-badges">
                  <span className={`dash-status ${statusTone(detail.status)}`}>{detail.status}</span>
                  <span className="dash-detail-chip">{detail.cabinClass || "Economy"}</span>
                  {detail.flightStatus && <span className="dash-detail-chip">Flight: {detail.flightStatus}</span>}
                </div>

                <div className="dash-detail-grid">
                  <div>
                    <h3>Journey</h3>
                    <dl>
                      <div><dt>Departure</dt><dd>{detail.departureTime || "—"} · {detail.origin || "—"}</dd></div>
                      <div><dt>Arrival</dt><dd>{detail.arrivalTime || "—"} · {detail.destination || "—"}</dd></div>
                      <div><dt>Travel date</dt><dd>{formatDate(detail.travelDate)}</dd></div>
                      <div><dt>Terminal / gate</dt><dd>{detail.terminal || "TBA"} / {detail.gate || "TBA"}</dd></div>
                      <div><dt>Baggage</dt><dd>{detail.baggageAllowance || "15kg check-in + 7kg cabin"}</dd></div>
                    </dl>
                  </div>
                  <div>
                    <h3>Travellers</h3>
                    <dl>
                      <div><dt>Lead passenger</dt><dd>{detail.passengerName}</dd></div>
                      <div><dt>Travellers</dt><dd>{detail.passengerCount}</dd></div>
                      <div><dt>Seats</dt><dd>{seatsOf(detail).join(", ") || "—"}</dd></div>
                      <div><dt>Contact</dt><dd>{detail.contactEmail || "—"}{detail.contactPhone ? ` · ${detail.contactPhone}` : ""}</dd></div>
                    </dl>
                  </div>
                </div>

                {Array.isArray(detail.passengers) && detail.passengers.length > 0 && (
                  <div className="dash-detail-passengers">
                    <h3>Passenger manifest</h3>
                    <ul>
                      {detail.passengers.map((passenger, index) => (
                        <li key={index}>{passenger.title ? `${passenger.title}. ` : ""}{passenger.name || "Traveller"}{passenger.gender ? ` · ${passenger.gender}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="dash-fare-box">
                  <h3>Fare breakdown</h3>
                  <div><span>Base fare</span><strong>{money(detail.fareBreakdown?.baseFare ?? detail.totalPrice)}</strong></div>
                  <div><span>Discount{detail.fareBreakdown?.promoCode ? ` (${detail.fareBreakdown.promoCode})` : ""}</span><strong>−{money(detail.fareBreakdown?.discount ?? 0)}</strong></div>
                  <div><span>Taxes & fees</span><strong>{money(detail.fareBreakdown?.taxes ?? 0)}</strong></div>
                  <div className="total"><span>Total</span><strong>{money(detail.fareBreakdown?.total ?? detail.totalPrice)}</strong></div>
                  <p className="dash-fineprint">Sample fare. No payment was collected and no refund is applicable.</p>
                </div>

                {detail.cancellationPolicy && (
                  <div className={`dash-policy ${detail.cancellationPolicy.eligible ? "ok" : "warn"}`}>
                    <strong>{detail.cancellationPolicy.eligible ? "Cancellation available" : "Cancellation unavailable"}</strong>
                    <p>{detail.cancellationPolicy.reason}</p>
                  </div>
                )}

                <footer className="dash-modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => setPrintBooking(detail)}>Print itinerary</button>
                  {detail.status === "CONFIRMED" && detail.cancellationPolicy?.eligible !== false && (
                    <button type="button" className="cancel-booking-btn" disabled={cancellingId === detail.id} onClick={() => void cancelBooking(detail)}>
                      {cancellingId === detail.id ? "Cancelling…" : "Cancel booking"}
                    </button>
                  )}
                  <button type="button" className="text-btn" onClick={() => setDetail(null)}>Close</button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}

      {printBooking && <PrintSheet booking={printBooking} />}
    </div>
  );
}
