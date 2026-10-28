import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { apiFetch } from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type User = { id: number; name: string; email: string; role?: string; phone?: string | null };

type AdminOverview = {
  range: { startDate: string; endDate: string };
  stats: {
    totalUsers: number; activeUsers: number; totalFlights: number; activeFlights: number;
    upcomingFlights: number; totalBookings: number; confirmedBookings: number;
    pendingBookings: number; completedBookings: number; cancelledBookings: number;
    totalRevenue: number; averageBookingValue: number; periodBookings: number;
    periodRevenue: number; periodCancellations: number; totalAirports: number;
    activeAirports: number; totalFareWatches: number; activeFareWatches: number;
    triggeredFareWatches: number; notifications: number; unreadNotifications: number;
    bookingStatusDistribution: Record<string, number>;
  };
  bookingTrend: { date: string; count: number }[];
  revenueTrend: { date: string; revenue: number }[];
  popularRoutes: { route: string; bookings: number; revenue: number; travellers: number }[];
  popularDestinations: { destination: string; bookingCount: number }[];
  recentBookings: {
    id: number; pnr: string; passengerName: string; passengerCount: number; totalPrice: number;
    status: string; createdAt: string; travelDate: string; bookedByName?: string;
    flightNumber?: string; origin?: string; destination?: string;
  }[];
  recentUsers: { id: number; name: string; email: string; isActive: number; createdAt: string }[];
  notes: string[];
};

type Flight = {
  id: number; flightNumber: string; airline: string; origin: string; destination: string;
  departureDate: string; departureTime: string; arrivalTime: string; price: number;
  status: string; availableSeats: number; isActive: number; durationMinutes?: number | null;
  stops?: number; aircraft?: string | null; cabinClasses?: string; baggageAllowance?: string;
  terminal?: string | null; gate?: string | null; baggageBelt?: string | null;
  activeBookings?: number; bookingCount?: number; seatCapacity?: number;
};

type AdminBooking = {
  id: number; pnr: string; passengerName: string; passengerCount: number; seatNumbers: string[];
  totalPrice: number; status: string; cabinClass?: string; promoCode?: string | null;
  createdAt: string; travelDate: string; contactEmail?: string | null; contactPhone?: string | null;
  bookedByName?: string; bookedByEmail?: string; flightNumber?: string; airline?: string;
  origin?: string; destination?: string; departureTime?: string; arrivalTime?: string;
};

type AdminBookingDetail = AdminBooking & {
  fareBreakdown?: { baseFare: number; taxes: number; discount: number; total: number; cabinClass?: string };
  cancellationPolicy?: { eligible: boolean; reason: string };
  passengers?: { title?: string; name?: string; gender?: string }[] | null;
  terminal?: string | null; gate?: string | null; baggageBelt?: string | null;
  bookedByPhone?: string | null; cancelledAt?: string | null; cancelledBy?: string | null;
};

type AdminUser = {
  id: number; name: string; email: string; phone?: string | null; isActive: number;
  createdAt: string; lastLogin?: string | null; role: string; isAdmin: boolean;
  bookingCount: number; totalSpend: number;
};

type Airport = {
  id: number; code: string; city: string; airportName: string; country: string;
  timezone: string; region: string; description?: string | null; emoji?: string | null;
  isActive: number; activeFlights?: number;
};

type AdminWatch = {
  id: number; userId: number; flightId: number; userName?: string; userEmail?: string;
  flightNumber?: string; airline?: string; origin?: string; destination?: string;
  departureDate?: string; departureTime?: string; currentPrice: number; previousPrice?: number | null;
  targetPrice?: number | null; trend?: string; alertTriggered?: number; isActive?: number;
  createdAt?: string; lastCheckedAt?: string | null; latestFlightPrice?: number;
};

type AuditEntry = {
  id: number; adminName?: string; adminEmail?: string; action: string; entityType: string;
  entityId?: string | null; details?: unknown; ipAddress?: string | null; createdAt: string;
};

type ReportData = {
  type: string; range: { startDate: string; endDate: string };
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  generatedAt: string;
};

type Tab = "overview" | "flights" | "bookings" | "users" | "airports" | "fares" | "reports" | "settings" | "audit";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Dashboard", icon: "◫" },
  { id: "flights", label: "Flights", icon: "✈" },
  { id: "airports", label: "Airports", icon: "🛫" },
  { id: "bookings", label: "Bookings", icon: "🎫" },
  { id: "users", label: "Users", icon: "◍" },
  { id: "fares", label: "Fare Watches", icon: "◎" },
  { id: "reports", label: "Analytics", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "audit", label: "Audit Log", icon: "⧉" },
];

const FLIGHT_STATUSES = ["On Time", "Boarding", "Delayed", "Departed", "Cancelled"];
const REPORT_TYPES = [
  { value: "bookings", label: "Bookings" },
  { value: "routes", label: "Routes" },
  { value: "users", label: "Users" },
  { value: "revenue", label: "Recorded revenue" },
  { value: "cancellations", label: "Cancellations" },
  { value: "fare-watches", label: "Fare watches" },
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
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dateInput(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}
function statusTone(status?: string) {
  const s = String(status || "").toUpperCase();
  if (["CONFIRMED", "ON TIME", "BOARDING", "ACTIVE"].includes(s)) return "ok";
  if (["PENDING", "DELAYED"].includes(s)) return "warn";
  if (["CANCELLED"].includes(s)) return "danger";
  return "muted";
}
function initials(name?: string) {
  return String(name || "AD").split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
}
function csvFromRows(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map(row => headers.map(header => escape(row[header])).join(","))].join("\r\n");
}

function ErrorBox({ message }: { message: string }) {
  return <div className="admin-alert error" role="alert"><span aria-hidden="true">⚠</span>{message}</div>;
}
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="admin-empty"><div aria-hidden="true">{icon}</div><h3>{title}</h3><p>{text}</p></div>;
}
function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="admin-skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index}><span style={{ width: `${30 + (index % 3) * 12}%` }} /><span style={{ width: `${12 + (index % 2) * 8}%` }} /></div>
      ))}
    </div>
  );
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return (
    <div className="admin-pagination">
      <button type="button" className="secondary-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" className="secondary-btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard({
  token, currentUser, setCurrentUser, setToken, onNavigate,
}: {
  token: string | null;
  currentUser: User | null;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setToken: Dispatch<SetStateAction<string | null>>;
  onNavigate: (path: string) => void;
}) {
  const isAdmin = Boolean(token && currentUser?.role === "ADMIN");
  const requestSeq = useRef<Record<string, number>>({});
  const beginRequest = (key: string) => {
    const next = (requestSeq.current[key] || 0) + 1;
    requestSeq.current[key] = next;
    return () => requestSeq.current[key] === next;
  };
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const [login, setLogin] = useState({ email: "", password: "" });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [range, setRange] = useState(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  });

  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightTotal, setFlightTotal] = useState(0);
  const [flightPages, setFlightPages] = useState(1);
  const [flightPage, setFlightPage] = useState(1);
  const [flightBusy, setFlightBusy] = useState(false);
  const [flightError, setFlightError] = useState("");
  const [flightFilters, setFlightFilters] = useState({ search: "", status: "", active: "all", from: "", to: "" });
  const [flightDraftFilters, setFlightDraftFilters] = useState(flightFilters);

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [bookingTotal, setBookingTotal] = useState(0);
  const [bookingPages, setBookingPages] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingFilters, setBookingFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [bookingDraftFilters, setBookingDraftFilters] = useState(bookingFilters);
  const [bookingDetail, setBookingDetail] = useState<AdminBookingDetail | null>(null);
  const [bookingDetailBusy, setBookingDetailBusy] = useState(false);
  const [bookingRevenue, setBookingRevenue] = useState(0);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPages, setUserPages] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [userBusy, setUserBusy] = useState(false);
  const [userError, setUserError] = useState("");
  const [userFilters, setUserFilters] = useState({ search: "", role: "", active: "all" });
  const [userDraftFilters, setUserDraftFilters] = useState(userFilters);
  const [activeAdminCount, setActiveAdminCount] = useState(0);

  const [airports, setAirports] = useState<Airport[]>([]);
  const [airportBusy, setAirportBusy] = useState(false);
  const [airportError, setAirportError] = useState("");
  const [airportSearch, setAirportSearch] = useState("");
  const [airportRegion, setAirportRegion] = useState("");
  const [airportModal, setAirportModal] = useState<Airport | null>(null);
  const [airportSaving, setAirportSaving] = useState(false);

  const [watches, setWatches] = useState<AdminWatch[]>([]);
  const [watchTotal, setWatchTotal] = useState(0);
  const [watchPages, setWatchPages] = useState(1);
  const [watchPage, setWatchPage] = useState(1);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchError, setWatchError] = useState("");
  const [watchStats, setWatchStats] = useState({ total: 0, active: 0, triggered: 0 });
  const [watchDelivery, setWatchDelivery] = useState("");
  const [watchFilter, setWatchFilter] = useState({ search: "", active: "all" });
  const [watchDraftFilter, setWatchDraftFilter] = useState(watchFilter);
  const [busyWatchId, setBusyWatchId] = useState<number | null>(null);

  const [reportType, setReportType] = useState("bookings");
  const [reportRange, setReportRange] = useState(range);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSearchDraft, setAuditSearchDraft] = useState("");

  const [flightModal, setFlightModal] = useState<{
    mode: "create" | "edit";
    originalId?: number;
    originalCapacity?: number;
    form: Record<string, string>;
  } | null>(null);
  const [flightSaving, setFlightSaving] = useState(false);
  const [flightModalError, setFlightModalError] = useState("");

  const flash = useCallback((type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(current => (current?.text === text ? null : current)), 5200);
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const data = await apiFetch("/api/admin/login", { method: "POST", body: JSON.stringify(login) }, false);
      if (data.user?.role !== "ADMIN") {
        setLoginError("This account does not have administrator access.");
        return;
      }
      localStorage.setItem("skybook-token", data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setLogin({ email: "", password: "" });
      onNavigate("/admin");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Admin sign-in failed.");
    } finally {
      setLoginBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("skybook-token");
    setToken(null);
    setCurrentUser(null);
    onNavigate("/");
  };

  // ── loaders ────────────────────────────────────────────────────────────────
  const loadOverview = useCallback(async (nextRange = range) => {
    setOverviewBusy(true);
    setOverviewError("");
    try {
      const data = await apiFetch(`/api/admin/overview?startDate=${nextRange.startDate}&endDate=${nextRange.endDate}`, {}, true);
      setOverview(data);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Unable to load overview.");
    } finally {
      setOverviewBusy(false);
    }
  }, [range]);

  const loadFlights = async (page = 1, filters = flightFilters) => {
    const isCurrent = beginRequest("flights");
    setFlightBusy(true);
    setFlightError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sort: "date", dir: "desc" });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.active !== "all") params.set("active", filters.active);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const data = await apiFetch(`/api/admin/flights?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setFlights(data.flights || []);
      setFlightTotal(data.total || 0);
      setFlightPages(data.pages || 1);
      setFlightPage(data.page || page);
    } catch (error) {
      if (!isCurrent()) return;
      setFlightError(error instanceof Error ? error.message : "Unable to load flights.");
    } finally {
      if (isCurrent()) setFlightBusy(false);
    }
  };

  const loadBookings = async (page = 1, filters = bookingFilters) => {
    const isCurrent = beginRequest("bookings");
    setBookingBusy(true);
    setBookingError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const data = await apiFetch(`/api/admin/bookings?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setBookings(data.bookings || []);
      setBookingTotal(data.total || 0);
      setBookingPages(data.pages || 1);
      setBookingPage(data.page || page);
      setBookingRevenue(data.revenue || 0);
    } catch (error) {
      if (!isCurrent()) return;
      setBookingError(error instanceof Error ? error.message : "Unable to load bookings.");
    } finally {
      if (isCurrent()) setBookingBusy(false);
    }
  };

  const loadUsers = async (page = 1, filters = userFilters) => {
    const isCurrent = beginRequest("users");
    setUserBusy(true);
    setUserError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all") params.set(key, value); });
      const data = await apiFetch(`/api/admin/users?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setUsers(data.users || []);
      setUserTotal(data.total || 0);
      setUserPages(data.pages || 1);
      setUserPage(data.page || page);
      setActiveAdminCount(data.activeAdminCount || 0);
    } catch (error) {
      if (!isCurrent()) return;
      setUserError(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      if (isCurrent()) setUserBusy(false);
    }
  };

  const loadAirports = async (search = airportSearch, region = airportRegion) => {
    const isCurrent = beginRequest("airports");
    setAirportBusy(true);
    setAirportError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (region) params.set("region", region);
      const data = await apiFetch(`/api/admin/airports?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setAirports(data.airports || []);
    } catch (error) {
      if (!isCurrent()) return;
      setAirportError(error instanceof Error ? error.message : "Unable to load airports.");
    } finally {
      if (isCurrent()) setAirportBusy(false);
    }
  };

  const loadWatches = async (page = 1, filters = watchFilter) => {
    const isCurrent = beginRequest("watches");
    setWatchBusy(true);
    setWatchError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filters.search) params.set("search", filters.search);
      if (filters.active !== "all") params.set("active", filters.active);
      const data = await apiFetch(`/api/admin/fare-watches?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setWatches(data.watches || []);
      setWatchTotal(data.total || 0);
      setWatchPages(data.pages || 1);
      setWatchPage(data.page || page);
      setWatchStats(data.stats || { total: 0, active: 0, triggered: 0 });
      setWatchDelivery(data.delivery || "");
    } catch (error) {
      if (!isCurrent()) return;
      setWatchError(error instanceof Error ? error.message : "Unable to load fare watches.");
    } finally {
      if (isCurrent()) setWatchBusy(false);
    }
  };

  const loadReport = async () => {
    setReportBusy(true);
    setReportError("");
    try {
      const params = new URLSearchParams({ startDate: reportRange.startDate, endDate: reportRange.endDate });
      const data = await apiFetch(`/api/admin/reports/${reportType}?${params.toString()}`, {}, true);
      setReport(data);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to run report.");
    } finally {
      setReportBusy(false);
    }
  };

  const loadSettings = async () => {
    setSettingsBusy(true);
    setSettingsError("");
    try {
      const data = await apiFetch("/api/admin/settings", {}, true);
      setSettings(data.settings || {});
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Unable to load settings.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const loadAudit = async (page = 1, search = auditSearch) => {
    const isCurrent = beginRequest("audit");
    setAuditBusy(true);
    setAuditError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) params.set("search", search);
      const data = await apiFetch(`/api/admin/audit-log?${params.toString()}`, {}, true);
      if (!isCurrent()) return;
      setAudit(data.entries || []);
      setAuditTotal(data.total || 0);
      setAuditPages(data.pages || 1);
      setAuditPage(data.page || page);
    } catch (error) {
      if (!isCurrent()) return;
      setAuditError(error instanceof Error ? error.message : "Unable to load audit log.");
    } finally {
      if (isCurrent()) setAuditBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    // Defer to a task so the initial render is not cascaded by loader state updates.
    const timer = window.setTimeout(() => {
      void loadOverview();
      // Seed the airport datalist and the active-admin count immediately.
      void loadAirports();
      void loadUsers(1);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => {
      const loaders: Record<Tab, (() => void) | undefined> = {
        overview: () => { void loadOverview(); },
        flights: () => { void loadFlights(1); },
        bookings: () => { void loadBookings(1); },
        users: () => { void loadUsers(1); },
        airports: () => { void loadAirports(); },
        fares: () => { void loadWatches(1); },
        reports: () => { void loadReport(); },
        settings: () => { void loadSettings(); },
        audit: () => { void loadAudit(1); },
      };
      loaders[tab]?.();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  // ── flight actions ─────────────────────────────────────────────────────────
  const openCreateFlight = () => {
    setFlightModalError("");
    setFlightModal({
      mode: "create",
      form: {
        flightNumber: "SK-",
        airline: "SkyBook Airlines",
        origin: "",
        destination: "",
        departureDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        departureTime: "08:00 AM",
        arrivalTime: "10:00 AM",
        price: "4999",
        capacity: "180",
        status: "On Time",
        aircraft: "Airbus A320neo",
        stops: "0",
        cabinClasses: "Economy,Business",
        baggageAllowance: "15kg check-in + 7kg cabin",
        terminal: "",
        gate: "",
        baggageBelt: "",
      },
    });
  };

  const openEditFlight = (flight: Flight) => {
    setFlightModalError("");
    setFlightModal({
      mode: "edit",
      originalId: flight.id,
      originalCapacity: Number(flight.seatCapacity || flight.availableSeats || 180),
      form: {
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        origin: flight.origin,
        destination: flight.destination,
        departureDate: dateInput(flight.departureDate),
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        price: String(flight.price),
        capacity: String(flight.seatCapacity || flight.availableSeats || 180),
        status: flight.status,
        aircraft: flight.aircraft || "",
        stops: String(flight.stops || 0),
        cabinClasses: flight.cabinClasses || "Economy,Business",
        baggageAllowance: flight.baggageAllowance || "15kg check-in + 7kg cabin",
        terminal: flight.terminal || "",
        gate: flight.gate || "",
        baggageBelt: flight.baggageBelt || "",
      },
    });
  };

  const saveFlight = async (event: FormEvent) => {
    event.preventDefault();
    if (!flightModal) return;
    setFlightSaving(true);
    setFlightModalError("");
    try {
      const form = flightModal.form;
      const payload: Record<string, unknown> = {
        flightNumber: form.flightNumber,
        airline: form.airline,
        origin: form.origin,
        destination: form.destination,
        departureDate: form.departureDate,
        departureTime: form.departureTime,
        arrivalTime: form.arrivalTime,
        price: Number(form.price),
        status: form.status,
        aircraft: form.aircraft,
        stops: Number(form.stops || 0),
        cabinClasses: form.cabinClasses,
        baggageAllowance: form.baggageAllowance,
        terminal: form.terminal,
        gate: form.gate,
        baggageBelt: form.baggageBelt,
      };
      const capacity = Number(form.capacity);
      if (flightModal.mode === "create") {
        payload.capacity = capacity;
        await apiFetch("/api/admin/flights", { method: "POST", body: JSON.stringify(payload) }, true);
        flash("success", "Flight created with seat inventory.");
      } else {
        if (capacity !== flightModal.originalCapacity) payload.capacity = capacity;
        await apiFetch(`/api/admin/flights/${flightModal.originalId}`, { method: "PUT", body: JSON.stringify(payload) }, true);
        flash("success", "Flight updated.");
      }
      setFlightModal(null);
      await loadFlights(flightPage);
    } catch (error) {
      setFlightModalError(error instanceof Error ? error.message : "Unable to save flight.");
    } finally {
      setFlightSaving(false);
    }
  };

  const toggleFlightActive = async (flight: Flight) => {
    const next = !flight.isActive;
    if (!window.confirm(`${next ? "Activate" : "Archive"} flight ${flight.flightNumber}?${next ? "" : " It will be hidden from customer search but existing bookings are preserved."}`)) return;
    try {
      await apiFetch(`/api/admin/flights/${flight.id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: next }) }, true);
      flash("success", next ? "Flight activated." : "Flight archived.");
      await loadFlights(flightPage);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to change flight status.");
    }
  };

  const deleteFlightPermanently = async (flight: Flight) => {
    if (!window.confirm(`Permanently delete ${flight.flightNumber}? This cannot be undone and is only allowed for archived flights with no booking history.`)) return;
    try {
      await apiFetch(`/api/admin/flights/${flight.id}/permanent`, { method: "DELETE" }, true);
      flash("success", "Flight permanently deleted.");
      await loadFlights(flightPage);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to delete flight.");
    }
  };

  // ── booking actions ────────────────────────────────────────────────────────
  const openBookingDetail = async (booking: AdminBooking) => {
    setBookingDetail({ ...booking });
    setBookingDetailBusy(true);
    try {
      const data = await apiFetch(`/api/admin/bookings/${booking.id}`, {}, true);
      setBookingDetail(data.booking);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to load booking.");
    } finally {
      setBookingDetailBusy(false);
    }
  };

  const changeBookingStatus = async (booking: AdminBooking, status: string) => {
    const verb = status === "CANCELLED" ? "Cancel" : status === "COMPLETED" ? "Complete" : "Confirm";
    if (!window.confirm(`${verb} booking ${booking.pnr}?${status === "CANCELLED" ? " Seats will be released." : ""}`)) return;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, true);
      flash("success", `Booking ${booking.pnr} is now ${status}.`);
      setBookingDetail(null);
      await Promise.all([loadBookings(bookingPage), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update booking.");
    }
  };

  // ── user actions ───────────────────────────────────────────────────────────
  const changeUserRole = async (user: AdminUser) => {
    const nextRole = user.isAdmin ? "USER" : "ADMIN";
    if (!window.confirm(`${nextRole === "ADMIN" ? "Grant administrator access to" : "Remove administrator access from"} ${user.email}?`)) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) }, true);
      flash("success", `Role updated to ${nextRole}.`);
      await Promise.all([loadUsers(userPage), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update role.");
    }
  };

  const toggleUserActive = async (user: AdminUser) => {
    const next = !user.isActive;
    if (!window.confirm(`${next ? "Activate" : "Deactivate"} ${user.email}?${next ? "" : " They will be unable to sign in."}`)) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: next }) }, true);
      flash("success", next ? "Account activated." : "Account deactivated.");
      await Promise.all([loadUsers(userPage), loadOverview()]);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update account.");
    }
  };

  // ── airport / fare watch / settings ───────────────────────────────────────
  const saveAirport = async (event: FormEvent) => {
    event.preventDefault();
    if (!airportModal) return;
    setAirportSaving(true);
    try {
      await apiFetch(`/api/admin/airports/${airportModal.id}`, { method: "PATCH", body: JSON.stringify(airportModal) }, true);
      flash("success", `${airportModal.code} updated.`);
      setAirportModal(null);
      await loadAirports();
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to update airport.");
    } finally {
      setAirportSaving(false);
    }
  };

  const recheckWatch = async (watch: AdminWatch) => {
    setBusyWatchId(watch.id);
    try {
      const data = await apiFetch(`/api/admin/fare-watches/${watch.id}/recheck`, { method: "POST" }, true);
      flash("success", data.newlyTriggered ? "Target reached — in-app alert created." : "Fare watch rechecked.");
      await loadWatches(watchPage);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to recheck fare watch.");
    } finally {
      setBusyWatchId(null);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsError("");
    try {
      const data = await apiFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) }, true);
      setSettings(data.settings || settings);
      flash("success", "Settings saved.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const downloadReport = async () => {
    if (!report) return;
    try {
      const params = new URLSearchParams({
        startDate: report.range.startDate, endDate: report.range.endDate, format: "csv",
      });
      const response = await fetch(`/api/admin/reports/${report.type}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to download CSV.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `skybook-${report.type}-${report.range.startDate}-to-${report.range.endDate}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      flash("success", "CSV downloaded.");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Unable to download CSV.");
    }
  };

  const downloadClientCsv = () => {
    if (!report) return;
    const blob = new Blob([csvFromRows(report.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `skybook-${report.type}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const maxTrend = useMemo(() => Math.max(1, ...(overview?.bookingTrend || []).map(point => point.count)), [overview]);

  // ── Login screen ───────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <button type="button" className="text-btn" onClick={() => onNavigate("/")}>← Back to SkyBook</button>
          <div className="admin-login-brand"><span aria-hidden="true">✈</span> Sky<strong>Book</strong> <em>ADMIN</em></div>
          <h1>Administrator sign-in</h1>
          <p>This area is restricted to accounts with the administrator role. Customer accounts cannot open it.</p>
          {loginError && <ErrorBox message={loginError} />}
          {token && currentUser && currentUser.role !== "ADMIN" && (
            <div className="admin-alert info"><span aria-hidden="true">ℹ</span>Signed in as {currentUser.email}, which is not an administrator.</div>
          )}
          <form onSubmit={submitLogin} className="admin-login-form">
            <label>Email address<input type="email" required autoComplete="username" value={login.email} onChange={event => setLogin(current => ({ ...current, email: event.target.value }))} /></label>
            <label>Password<input type="password" required autoComplete="current-password" value={login.password} onChange={event => setLogin(current => ({ ...current, password: event.target.value }))} /></label>
            <button type="submit" className="primary-btn" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in to admin"}</button>
          </form>
          <p className="admin-fineprint">Admin credentials are provisioned in the database. Default passwords are never hardcoded here.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-root">
      <aside className="admin-sidebar">
        <button type="button" className="admin-logo" onClick={() => onNavigate("/")}><span aria-hidden="true">✈</span> Sky<strong>Book</strong><em>ADMIN</em></button>
        <div className="admin-identity">
          <div className="admin-avatar">{initials(currentUser?.name)}</div>
          <div><strong>{currentUser?.name}</strong><span>{currentUser?.email}</span></div>
        </div>
        <nav className="admin-nav" aria-label="Administration sections">
          {TABS.map(item => (
            <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setToast(null); }}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button type="button" onClick={() => onNavigate("/")}>Public site</button>
          <button type="button" className="danger" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-eyebrow">ADMINISTRATION · LIVE DATABASE</span>
            <h1>{TABS.find(item => item.id === tab)?.label}</h1>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-session-chip">{activeAdminCount} active admin{activeAdminCount === 1 ? "" : "s"}</span>
            <button type="button" className="secondary-btn" onClick={() => { if (tab === "overview") void loadOverview(); if (tab === "flights") void loadFlights(flightPage); }}>Refresh</button>
          </div>
        </header>

        {toast && (
          <div className={`admin-alert ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
            <span aria-hidden="true">{toast.type === "success" ? "✓" : toast.type === "error" ? "⚠" : "ℹ"}</span>
            <span>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <section className="admin-section">
            <div className="admin-toolbar">
              <div className="admin-range">
                <label>From<input type="date" value={range.startDate} onChange={event => setRange(current => ({ ...current, startDate: event.target.value }))} /></label>
                <label>To<input type="date" value={range.endDate} onChange={event => setRange(current => ({ ...current, endDate: event.target.value }))} /></label>
                <button type="button" className="primary-btn" onClick={() => void loadOverview(range)}>Apply range</button>
              </div>
              <span className="admin-muted">Revenue figures are recorded booking value — no payment gateway is integrated.</span>
            </div>
            {overviewError && <ErrorBox message={overviewError} />}
            {overviewBusy && !overview ? <Skeleton rows={6} /> : overview && (
              <>
                <div className="admin-stat-grid">
                  <article><span>Recorded revenue</span><strong>{money(overview.stats.totalRevenue)}</strong><small>All confirmed bookings</small></article>
                  <article><span>Bookings</span><strong>{overview.stats.totalBookings}</strong><small>{overview.stats.confirmedBookings} confirmed · {overview.stats.cancelledBookings} cancelled</small></article>
                  <article><span>Users</span><strong>{overview.stats.totalUsers}</strong><small>{overview.stats.activeUsers} active</small></article>
                  <article><span>Flights</span><strong>{overview.stats.totalFlights}</strong><small>{overview.stats.upcomingFlights} upcoming · {overview.stats.activeFlights} active</small></article>
                  <article><span>Airports</span><strong>{overview.stats.totalAirports}</strong><small>{overview.stats.activeAirports} active in catalogue</small></article>
                  <article><span>Fare watches</span><strong>{overview.stats.activeFareWatches}</strong><small>{overview.stats.triggeredFareWatches} target(s) reached</small></article>
                </div>

                <div className="admin-grid-2">
                  <div className="admin-panel">
                    <div className="admin-panel-head"><h2>Bookings in range</h2><span>{overview.stats.periodBookings} bookings · {money(overview.stats.periodRevenue)}</span></div>
                    <div className="admin-bars" aria-label="Bookings per day">
                      {overview.bookingTrend.length === 0 ? <p className="admin-muted">No bookings in this range.</p> : overview.bookingTrend.map(point => (
                        <div key={point.date} className="admin-bar" title={`${point.date}: ${point.count}`}>
                          <span style={{ height: `${Math.max(4, (point.count / maxTrend) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="admin-panel-foot"><span>{overview.range.startDate}</span><span>{overview.range.endDate}</span></div>
                  </div>
                  <div className="admin-panel">
                    <div className="admin-panel-head"><h2>Status distribution</h2></div>
                    <div className="admin-status-list">
                      {Object.entries(overview.stats.bookingStatusDistribution).map(([status, count]) => (
                        <div key={status}><span className={`admin-status ${statusTone(status)}`}>{status}</span><strong>{count}</strong></div>
                      ))}
                      {Object.keys(overview.stats.bookingStatusDistribution).length === 0 && <p className="admin-muted">No bookings yet.</p>}
                    </div>
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-head"><h2>Top routes by confirmed bookings</h2></div>
                  {overview.popularRoutes.length === 0 ? <Empty icon="🛫" title="No route data yet" text="Route performance appears after confirmed bookings are recorded." /> : (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead><tr><th>Route</th><th className="right">Bookings</th><th className="right">Travellers</th><th className="right">Recorded value</th></tr></thead>
                        <tbody>{overview.popularRoutes.map(route => (
                          <tr key={route.route}><td>{route.route}</td><td className="right">{route.bookings}</td><td className="right">{route.travellers}</td><td className="right">{money(route.revenue)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="admin-grid-2">
                  <div className="admin-panel">
                    <div className="admin-panel-head"><h2>Recent bookings</h2><button type="button" className="text-btn" onClick={() => setTab("bookings")}>Manage →</button></div>
                    {overview.recentBookings.length === 0 ? <Empty icon="🎫" title="No bookings" text="New reservations will appear here." /> : (
                      <div className="admin-table-wrap">
                        <table className="admin-table compact">
                          <thead><tr><th>PNR</th><th>Passenger</th><th>Flight</th><th>Status</th></tr></thead>
                          <tbody>{overview.recentBookings.map(booking => (
                            <tr key={booking.id}><td><strong>{booking.pnr}</strong></td><td>{booking.passengerName}</td><td>{booking.flightNumber}<small>{booking.origin} → {booking.destination}</small></td><td><span className={`admin-status ${statusTone(booking.status)}`}>{booking.status}</span></td></tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="admin-panel">
                    <div className="admin-panel-head"><h2>Newest accounts</h2><button type="button" className="text-btn" onClick={() => setTab("users")}>Manage →</button></div>
                    <ul className="admin-user-list">
                      {overview.recentUsers.map(user => (
                        <li key={user.id}><div className="admin-avatar small">{initials(user.name)}</div><div><strong>{user.name}</strong><span>{user.email}</span></div><span className={`admin-status ${user.isActive ? "ok" : "danger"}`}>{user.isActive ? "Active" : "Disabled"}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="admin-notes">
                  {overview.notes.map(note => <p key={note}>ℹ {note}</p>)}
                </div>
              </>
            )}
          </section>
        )}

        {/* ── FLIGHTS ── */}
        {tab === "flights" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>Flight inventory</h2><p>{flightTotal} flight(s) · schedules and fares are sample data.</p></div>
                <button type="button" className="primary-btn" onClick={openCreateFlight}>+ Create flight</button>
              </div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); const next = flightDraftFilters; setFlightFilters(next); window.setTimeout(() => void loadFlights(1, next), 0); }}>
                <label><span>Search</span><input value={flightDraftFilters.search} onChange={event => setFlightDraftFilters(current => ({ ...current, search: event.target.value }))} placeholder="Number, route or airline" /></label>
                <label><span>Status</span><select value={flightDraftFilters.status} onChange={event => setFlightDraftFilters(current => ({ ...current, status: event.target.value }))}><option value="">All</option>{FLIGHT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
                <label><span>Availability</span><select value={flightDraftFilters.active} onChange={event => setFlightDraftFilters(current => ({ ...current, active: event.target.value }))}><option value="all">All</option><option value="1">Active only</option><option value="0">Archived only</option></select></label>
                <label><span>From date</span><input type="date" value={flightDraftFilters.from} onChange={event => setFlightDraftFilters(current => ({ ...current, from: event.target.value }))} /></label>
                <label><span>To date</span><input type="date" value={flightDraftFilters.to} onChange={event => setFlightDraftFilters(current => ({ ...current, to: event.target.value }))} /></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button><button type="button" className="text-btn" onClick={() => { const cleared = { search: "", status: "", active: "all", from: "", to: "" }; setFlightDraftFilters(cleared); setFlightFilters(cleared); window.setTimeout(() => void loadFlights(1, cleared), 0); }}>Reset</button></div>
              </form>
              {flightError && <ErrorBox message={flightError} />}
              {flightBusy ? <Skeleton rows={6} /> : flights.length === 0 ? <Empty icon="✈" title="No flights found" text="Adjust the filters or create a new flight." /> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Flight</th><th>Route</th><th>Date / time</th><th className="right">Fare</th><th className="right">Seats</th><th>Status</th><th>Visibility</th><th className="right">Actions</th></tr></thead>
                      <tbody>{flights.map(flight => (
                        <tr key={flight.id}>
                          <td><strong>{flight.flightNumber}</strong><small>{flight.airline} · {flight.aircraft || "—"}</small></td>
                          <td>{flight.origin}<small>→ {flight.destination}</small></td>
                          <td>{formatDate(flight.departureDate)}<small>{flight.departureTime} → {flight.arrivalTime}</small></td>
                          <td className="right">{money(flight.price)}</td>
                          <td className="right">{flight.availableSeats}<small>of {flight.seatCapacity || "—"} · {Number(flight.bookingCount || 0)} booking(s)</small></td>
                          <td><span className={`admin-status ${statusTone(flight.status)}`}>{flight.status}</span></td>
                          <td><span className={`admin-status ${flight.isActive ? "ok" : "muted"}`}>{flight.isActive ? "Active" : "Archived"}</span></td>
                          <td className="right"><div className="admin-row-actions"><button type="button" className="admin-mini-btn" onClick={() => openEditFlight(flight)}>Edit</button><button type="button" className={`admin-mini-btn ${flight.isActive ? "danger" : ""}`} onClick={() => void toggleFlightActive(flight)}>{flight.isActive ? "Archive" : "Activate"}</button>{!flight.isActive && Number(flight.bookingCount || 0) === 0 && <button type="button" className="admin-mini-btn danger" onClick={() => void deleteFlightPermanently(flight)}>Delete</button>}</div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pagination page={flightPage} pages={flightPages} onChange={page => void loadFlights(page)} />
                </>
              )}
            </div>
          </section>
        )}

        {/* ── BOOKINGS ── */}
        {tab === "bookings" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>Reservations</h2><p>{bookingTotal} booking(s) · recorded value {money(bookingRevenue)}</p></div>
                <button type="button" className="secondary-btn" onClick={() => void loadBookings(bookingPage)}>Refresh</button>
              </div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); const next = bookingDraftFilters; setBookingFilters(next); window.setTimeout(() => void loadBookings(1, next), 0); }}>
                <label><span>Search</span><input value={bookingDraftFilters.search} onChange={event => setBookingDraftFilters(current => ({ ...current, search: event.target.value }))} placeholder="PNR, passenger, email, route" /></label>
                <label><span>Status</span><select value={bookingDraftFilters.status} onChange={event => setBookingDraftFilters(current => ({ ...current, status: event.target.value }))}><option value="">All</option><option value="CONFIRMED">Confirmed</option><option value="PENDING">Pending</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
                <label><span>Travel from</span><input type="date" value={bookingDraftFilters.from} onChange={event => setBookingDraftFilters(current => ({ ...current, from: event.target.value }))} /></label>
                <label><span>Travel to</span><input type="date" value={bookingDraftFilters.to} onChange={event => setBookingDraftFilters(current => ({ ...current, to: event.target.value }))} /></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button><button type="button" className="text-btn" onClick={() => { const cleared = { search: "", status: "", from: "", to: "" }; setBookingDraftFilters(cleared); setBookingFilters(cleared); window.setTimeout(() => void loadBookings(1, cleared), 0); }}>Reset</button></div>
              </form>
              {bookingError && <ErrorBox message={bookingError} />}
              {bookingBusy ? <Skeleton rows={6} /> : bookings.length === 0 ? <Empty icon="🎫" title="No bookings found" text="Reservations created by customers will appear here." /> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>PNR</th><th>Passenger</th><th>Flight</th><th>Travel</th><th className="right">Value</th><th>Status</th><th className="right">Actions</th></tr></thead>
                      <tbody>{bookings.map(booking => (
                        <tr key={booking.id}>
                          <td><strong>{booking.pnr}</strong><small>{booking.cabinClass || "Economy"}</small></td>
                          <td>{booking.passengerName}<small>{booking.passengerCount} traveller(s)</small></td>
                          <td>{booking.flightNumber}<small>{booking.origin} → {booking.destination}</small></td>
                          <td>{formatDate(booking.travelDate)}<small>{booking.departureTime}</small></td>
                          <td className="right">{money(booking.totalPrice)}</td>
                          <td><span className={`admin-status ${statusTone(booking.status)}`}>{booking.status}</span></td>
                          <td className="right"><div className="admin-row-actions"><button type="button" className="admin-mini-btn" onClick={() => void openBookingDetail(booking)}>View</button>{booking.status === "PENDING" && <button type="button" className="admin-mini-btn" onClick={() => void changeBookingStatus(booking, "CONFIRMED")}>Confirm</button>}{booking.status === "CONFIRMED" && <button type="button" className="admin-mini-btn" onClick={() => void changeBookingStatus(booking, "COMPLETED")}>Complete</button>}{["CONFIRMED", "PENDING"].includes(booking.status) && <button type="button" className="admin-mini-btn danger" onClick={() => void changeBookingStatus(booking, "CANCELLED")}>Cancel</button>}</div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pagination page={bookingPage} pages={bookingPages} onChange={page => void loadBookings(page)} />
                </>
              )}
            </div>
          </section>
        )}

        {/* ── USERS ── */}
        {tab === "users" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>Users & roles</h2><p>{userTotal} account(s) · {activeAdminCount} active administrator(s). The last active admin cannot be demoted or disabled.</p></div>
                <button type="button" className="secondary-btn" onClick={() => void loadUsers(userPage)}>Refresh</button>
              </div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); const next = userDraftFilters; setUserFilters(next); window.setTimeout(() => void loadUsers(1, next), 0); }}>
                <label><span>Search</span><input value={userDraftFilters.search} onChange={event => setUserDraftFilters(current => ({ ...current, search: event.target.value }))} placeholder="Name, email or phone" /></label>
                <label><span>Role</span><select value={userDraftFilters.role} onChange={event => setUserDraftFilters(current => ({ ...current, role: event.target.value }))}><option value="">All roles</option><option value="ADMIN">Administrators</option><option value="USER">Customers</option></select></label>
                <label><span>Status</span><select value={userDraftFilters.active} onChange={event => setUserDraftFilters(current => ({ ...current, active: event.target.value }))}><option value="all">All</option><option value="1">Active</option><option value="0">Disabled</option></select></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button></div>
              </form>
              {userError && <ErrorBox message={userError} />}
              {userBusy ? <Skeleton rows={6} /> : users.length === 0 ? <Empty icon="◍" title="No accounts found" text="Try a different search." /> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Account</th><th>Role</th><th>Status</th><th className="right">Bookings</th><th className="right">Recorded value</th><th>Last login</th><th className="right">Actions</th></tr></thead>
                      <tbody>{users.map(user => (
                        <tr key={user.id}>
                          <td><strong>{user.name}</strong><small>{user.email}{user.phone ? ` · ${user.phone}` : ""}</small></td>
                          <td><span className={`admin-status ${user.isAdmin ? "accent" : "muted"}`}>{user.isAdmin ? "ADMIN" : "CUSTOMER"}</span></td>
                          <td><span className={`admin-status ${user.isActive ? "ok" : "danger"}`}>{user.isActive ? "Active" : "Disabled"}</span></td>
                          <td className="right">{user.bookingCount}</td>
                          <td className="right">{money(user.totalSpend)}</td>
                          <td>{user.lastLogin ? formatDateTime(user.lastLogin) : "Never"}</td>
                          <td className="right"><div className="admin-row-actions"><button type="button" className="admin-mini-btn" onClick={() => void changeUserRole(user)}>{user.isAdmin ? "Remove admin" : "Make admin"}</button><button type="button" className={`admin-mini-btn ${user.isActive ? "danger" : ""}`} onClick={() => void toggleUserActive(user)}>{user.isActive ? "Deactivate" : "Activate"}</button></div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pagination page={userPage} pages={userPages} onChange={page => void loadUsers(page)} />
                </>
              )}
            </div>
          </section>
        )}

        {/* ── AIRPORTS ── */}
        {tab === "airports" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>Shared airport catalogue</h2><p>{airports.length} airport(s) loaded · this catalogue powers search, seat maps, the rule-based planner and fare watch.</p></div>
                <button type="button" className="secondary-btn" onClick={() => void loadAirports()}>Refresh</button>
              </div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); void loadAirports(airportSearch, airportRegion); }}>
                <label><span>Search</span><input value={airportSearch} onChange={event => setAirportSearch(event.target.value)} placeholder="Code, city, airport or country" /></label>
                <label><span>Region</span><select value={airportRegion} onChange={event => setAirportRegion(event.target.value)}><option value="">All regions</option><option value="domestic">Domestic</option><option value="international">International</option></select></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button></div>
              </form>
              {airportError && <ErrorBox message={airportError} />}
              {airportBusy ? <Skeleton rows={6} /> : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Code</th><th>City / airport</th><th>Country</th><th>Region</th><th className="right">Active flights</th><th>Status</th><th className="right">Actions</th></tr></thead>
                    <tbody>{airports.map(airport => (
                      <tr key={airport.id}>
                        <td><strong>{airport.code}</strong><small>{airport.emoji || "✈"}</small></td>
                        <td>{airport.city}<small>{airport.airportName}</small></td>
                        <td>{airport.country}<small>{airport.timezone}</small></td>
                        <td><span className={`admin-status ${airport.region === "domestic" ? "muted" : "accent"}`}>{airport.region}</span></td>
                        <td className="right">{airport.activeFlights ?? 0}</td>
                        <td><span className={`admin-status ${airport.isActive ? "ok" : "danger"}`}>{airport.isActive ? "Active" : "Hidden"}</span></td>
                        <td className="right"><button type="button" className="admin-mini-btn" onClick={() => setAirportModal({ ...airport })}>Edit</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── FARE WATCHES ── */}
        {tab === "fares" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>Fare watch activity</h2><p>{watchTotal} watch(es) · {watchStats.active} active · {watchStats.triggered} target(s) reached. {watchDelivery}</p></div>
                <button type="button" className="secondary-btn" onClick={() => void loadWatches(watchPage)}>Refresh</button>
              </div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); const next = watchDraftFilter; setWatchFilter(next); window.setTimeout(() => void loadWatches(1, next), 0); }}>
                <label><span>Search</span><input value={watchDraftFilter.search} onChange={event => setWatchDraftFilter(current => ({ ...current, search: event.target.value }))} placeholder="User, email or flight" /></label>
                <label><span>State</span><select value={watchDraftFilter.active} onChange={event => setWatchDraftFilter(current => ({ ...current, active: event.target.value }))}><option value="all">All</option><option value="1">Active</option><option value="0">Paused</option></select></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button></div>
              </form>
              {watchError && <ErrorBox message={watchError} />}
              {watchBusy ? <Skeleton rows={5} /> : watches.length === 0 ? <Empty icon="◎" title="No fare watches" text="Customer fare watches and alert history will appear here." /> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Customer</th><th>Flight</th><th className="right">Current fare</th><th className="right">Target</th><th>Trend</th><th>State</th><th>Last checked</th><th className="right">Actions</th></tr></thead>
                      <tbody>{watches.map(watch => (
                        <tr key={watch.id}>
                          <td><strong>{watch.userName}</strong><small>{watch.userEmail}</small></td>
                          <td>{watch.flightNumber}<small>{watch.origin} → {watch.destination} · {formatDate(watch.departureDate)}</small></td>
                          <td className="right">{money(watch.currentPrice)}</td>
                          <td className="right">{watch.targetPrice == null ? "—" : money(watch.targetPrice)}</td>
                          <td><span className={`admin-status ${watch.trend === "up" ? "danger" : watch.trend === "down" ? "ok" : "muted"}`}>{watch.trend || "stable"}</span></td>
                          <td><span className={`admin-status ${watch.alertTriggered ? "ok" : watch.isActive ? "warn" : "muted"}`}>{watch.alertTriggered ? "Target reached" : watch.isActive ? "Active" : "Paused"}</span></td>
                          <td>{watch.lastCheckedAt ? formatDateTime(watch.lastCheckedAt) : "Never"}</td>
                          <td className="right"><button type="button" className="admin-mini-btn" disabled={busyWatchId === watch.id} onClick={() => void recheckWatch(watch)}>{busyWatchId === watch.id ? "Checking…" : "Recheck"}</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pagination page={watchPage} pages={watchPages} onChange={page => void loadWatches(page)} />
                </>
              )}
            </div>
          </section>
        )}

        {/* ── REPORTS ── */}
        {tab === "reports" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head"><div><h2>Analytics &amp; reports</h2><p>Generated from the live database. Revenue is recorded booking value, not settled payments.</p></div></div>
              <div className="admin-filters">
                <label><span>Report</span><select value={reportType} onChange={event => setReportType(event.target.value)}>{REPORT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label><span>From</span><input type="date" value={reportRange.startDate} onChange={event => setReportRange(current => ({ ...current, startDate: event.target.value }))} /></label>
                <label><span>To</span><input type="date" value={reportRange.endDate} onChange={event => setReportRange(current => ({ ...current, endDate: event.target.value }))} /></label>
                <div className="admin-filter-actions"><button type="button" className="primary-btn" onClick={() => void loadReport()} disabled={reportBusy}>{reportBusy ? "Running…" : "Run report"}</button>{report && <button type="button" className="secondary-btn" onClick={() => void downloadReport()}>Download CSV</button>}{report && <button type="button" className="text-btn" onClick={downloadClientCsv}>Download visible rows</button>}</div>
              </div>
              {reportError && <ErrorBox message={reportError} />}
              {!report ? <Empty icon="▤" title="Choose a report" text="Select a report type and date range, then run it. CSV export uses the server-generated file." /> : (
                <>
                  <div className="admin-summary">
                    <div><span>Report</span><strong>{report.type}</strong></div>
                    <div><span>Range</span><strong>{report.range.startDate} → {report.range.endDate}</strong></div>
                    <div><span>Rows</span><strong>{report.rows.length}</strong></div>
                    <div><span>Generated</span><strong>{formatDateTime(report.generatedAt)}</strong></div>
                  </div>
                  <div className="admin-report-summary">
                    {Object.entries(report.summary).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{typeof value === "number" ? value.toLocaleString("en-IN") : String(value)}</strong></div>)}
                  </div>
                  {report.rows.length === 0 ? <Empty icon="▤" title="No rows" text="There is no data for this report in the selected range." /> : (
                    <div className="admin-table-wrap scroll">
                      <table className="admin-table compact">
                        <thead><tr>{Object.keys(report.rows[0]).map(key => <th key={key}>{key}</th>)}</tr></thead>
                        <tbody>{report.rows.slice(0, 100).map((row, index) => <tr key={index}>{Object.keys(report.rows[0]).map(key => <td key={key}>{row[key] == null ? "—" : String(row[key])}</td>)}</tr>)}</tbody>
                      </table>
                      {report.rows.length > 100 && <p className="admin-muted">Showing the first 100 of {report.rows.length} rows. Download the CSV for the complete report.</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head"><div><h2>Application settings</h2><p>Public branding and booking policy. Secrets and credentials are never stored here.</p></div></div>
              {settingsError && <ErrorBox message={settingsError} />}
              {settingsBusy ? <Skeleton rows={5} /> : (
                <form className="admin-form" onSubmit={saveSettings}>
                  <div className="admin-form-grid">
                    <label><span>Brand name</span><input value={settings.brand_name || ""} onChange={event => setSettings(current => ({ ...current, brand_name: event.target.value }))} required /></label>
                    <label><span>Brand tagline</span><input value={settings.brand_tagline || ""} onChange={event => setSettings(current => ({ ...current, brand_tagline: event.target.value }))} /></label>
                    <label><span>Support email</span><input type="email" value={settings.support_email || ""} onChange={event => setSettings(current => ({ ...current, support_email: event.target.value }))} /></label>
                    <label><span>Support phone</span><input value={settings.support_phone || ""} onChange={event => setSettings(current => ({ ...current, support_phone: event.target.value }))} /></label>
                    <label><span>Currency</span><select value={settings.currency || "INR"} onChange={event => setSettings(current => ({ ...current, currency: event.target.value }))}><option value="INR">INR (₹)</option></select></label>
                    <label><span>Cancellation window (hours)</span><input type="number" min="0" max="72" value={settings.cancellation_window_hours || "2"} onChange={event => setSettings(current => ({ ...current, cancellation_window_hours: event.target.value }))} /></label>
                    <label><span>Max travellers per booking</span><input type="number" min="1" max="9" value={settings.max_travelers || "9"} onChange={event => setSettings(current => ({ ...current, max_travelers: event.target.value }))} /></label>
                    <label><span>Fare-watch interval (minutes, 0 disables)</span><input type="number" min="0" max="1440" value={settings.fare_alert_interval_minutes || "30"} onChange={event => setSettings(current => ({ ...current, fare_alert_interval_minutes: event.target.value }))} /></label>
                  </div>
                  <label className="full"><span>Maintenance notice (shown to customers when non-empty)</span><textarea rows={3} value={settings.maintenance_notice || ""} onChange={event => setSettings(current => ({ ...current, maintenance_notice: event.target.value }))} /></label>
                  <div className="admin-form-actions"><button type="submit" className="primary-btn" disabled={settingsSaving}>{settingsSaving ? "Saving…" : "Save settings"}</button><button type="button" className="text-btn" onClick={() => void loadSettings()}>Reload</button></div>
                </form>
              )}
              <div className="admin-callout">
                <strong>Configuration reality</strong>
                <ul>
                  <li>Email/SMS delivery is not configured. Password-reset links are shown only in non-production builds.</li>
                  <li>No payment gateway is integrated: bookings record amounts but never charge or refund money.</li>
                  <li>Flight schedules and fares come from the database seed and are simulated, not a live airline feed.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ── AUDIT ── */}
        {tab === "audit" && (
          <section className="admin-section">
            <div className="admin-panel">
              <div className="admin-panel-head"><div><h2>Audit log</h2><p>{auditTotal} recorded administrative action(s), newest first.</p></div><button type="button" className="secondary-btn" onClick={() => void loadAudit(auditPage)}>Refresh</button></div>
              <form className="admin-filters" onSubmit={event => { event.preventDefault(); const next = auditSearchDraft; setAuditSearch(next); window.setTimeout(() => void loadAudit(1, next), 0); }}>
                <label><span>Search</span><input value={auditSearchDraft} onChange={event => setAuditSearchDraft(event.target.value)} placeholder="Action, entity or admin email" /></label>
                <div className="admin-filter-actions"><button type="submit" className="primary-btn">Apply</button></div>
              </form>
              {auditError && <ErrorBox message={auditError} />}
              {auditBusy ? <Skeleton rows={6} /> : audit.length === 0 ? <Empty icon="⧉" title="No audit entries" text="Administrative changes will be recorded here automatically." /> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
                      <tbody>{audit.map(entry => (
                        <tr key={entry.id}>
                          <td>{formatDateTime(entry.createdAt)}</td>
                          <td>{entry.adminName}<small>{entry.adminEmail}</small></td>
                          <td><code>{entry.action}</code></td>
                          <td>{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</td>
                          <td className="wrap"><small>{entry.details ? JSON.stringify(entry.details) : "—"}</small></td>
                          <td><small>{entry.ipAddress || "—"}</small></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pagination page={auditPage} pages={auditPages} onChange={page => void loadAudit(page)} />
                </>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Flight editor */}
      {flightModal && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setFlightModal(null)}>
          <div className="admin-modal wide" role="dialog" aria-modal="true" aria-label={flightModal.mode === "create" ? "Create flight" : "Edit flight"} onClick={event => event.stopPropagation()}>
            <header className="admin-modal-head"><div><span className="admin-eyebrow">{flightModal.mode === "create" ? "NEW FLIGHT" : `EDIT ${flightModal.form.flightNumber}`}</span><h2>{flightModal.mode === "create" ? "Create flight" : "Edit flight"}</h2></div><button type="button" className="admin-modal-close" onClick={() => setFlightModal(null)} aria-label="Close">×</button></header>
            {flightModalError && <ErrorBox message={flightModalError} />}
            <form className="admin-form" onSubmit={saveFlight}>
              <div className="admin-form-grid">
                <label><span>Flight number</span><input required value={flightModal.form.flightNumber} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, flightNumber: event.target.value } } : current)} /></label>
                <label><span>Airline</span><input required value={flightModal.form.airline} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, airline: event.target.value } } : current)} /></label>
                <label><span>Origin (city or code)</span><input required list="admin-airports" value={flightModal.form.origin} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, origin: event.target.value } } : current)} placeholder="Mumbai (BOM)" /></label>
                <label><span>Destination (city or code)</span><input required list="admin-airports" value={flightModal.form.destination} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, destination: event.target.value } } : current)} placeholder="Delhi (DEL)" /></label>
                <label><span>Departure date</span><input type="date" required value={flightModal.form.departureDate} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, departureDate: event.target.value } } : current)} /></label>
                <label><span>Departure time</span><input required value={flightModal.form.departureTime} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, departureTime: event.target.value } } : current)} placeholder="08:00 AM" /></label>
                <label><span>Arrival time</span><input required value={flightModal.form.arrivalTime} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, arrivalTime: event.target.value } } : current)} placeholder="10:15 AM" /></label>
                <label><span>Fare (₹, Economy)</span><input type="number" min="1" required value={flightModal.form.price} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, price: event.target.value } } : current)} /></label>
                <label><span>Seat capacity</span><input type="number" min="1" max="400" value={flightModal.form.capacity} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, capacity: event.target.value } } : current)} /></label>
                <label><span>Operational status</span><select value={flightModal.form.status} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, status: event.target.value } } : current)}>{FLIGHT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
                <label><span>Aircraft</span><input value={flightModal.form.aircraft} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, aircraft: event.target.value } } : current)} /></label>
                <label><span>Stops</span><input type="number" min="0" max="5" value={flightModal.form.stops} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, stops: event.target.value } } : current)} /></label>
                <label><span>Cabin classes</span><input value={flightModal.form.cabinClasses} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, cabinClasses: event.target.value } } : current)} /></label>
                <label><span>Baggage allowance</span><input value={flightModal.form.baggageAllowance} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, baggageAllowance: event.target.value } } : current)} /></label>
                <label><span>Terminal (optional)</span><input value={flightModal.form.terminal} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, terminal: event.target.value } } : current)} /></label>
                <label><span>Gate (optional)</span><input value={flightModal.form.gate} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, gate: event.target.value } } : current)} /></label>
                <label><span>Baggage belt (optional)</span><input value={flightModal.form.baggageBelt} onChange={event => setFlightModal(current => current ? { ...current, form: { ...current.form, baggageBelt: event.target.value } } : current)} /></label>
              </div>
              <p className="admin-fineprint">Changing the date or seat capacity is blocked while the flight has active bookings. Archive instead of deleting to preserve history.</p>
              <div className="admin-form-actions"><button type="submit" className="primary-btn" disabled={flightSaving}>{flightSaving ? "Saving…" : flightModal.mode === "create" ? "Create flight" : "Save changes"}</button><button type="button" className="text-btn" onClick={() => setFlightModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Booking detail */}
      {bookingDetail && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setBookingDetail(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label={`Booking ${bookingDetail.pnr}`} onClick={event => event.stopPropagation()}>
            <header className="admin-modal-head"><div><span className="admin-eyebrow">BOOKING {bookingDetail.pnr}</span><h2>{bookingDetail.origin} → {bookingDetail.destination}</h2><p>{bookingDetail.flightNumber} · {formatDate(bookingDetail.travelDate)}</p></div><button type="button" className="admin-modal-close" onClick={() => setBookingDetail(null)} aria-label="Close">×</button></header>
            {bookingDetailBusy ? <Skeleton rows={4} /> : (
              <>
                <div className="admin-detail-badges"><span className={`admin-status ${statusTone(bookingDetail.status)}`}>{bookingDetail.status}</span><span className="admin-status muted">{bookingDetail.cabinClass || "Economy"}</span>{bookingDetail.cancelledBy && <span className="admin-status danger">Cancelled by {bookingDetail.cancelledBy}</span>}</div>
                <div className="admin-detail-grid">
                  <div><h3>Customer</h3><dl><div><dt>Name</dt><dd>{bookingDetail.bookedByName || bookingDetail.passengerName}</dd></div><div><dt>Email</dt><dd>{bookingDetail.bookedByEmail || bookingDetail.contactEmail || "—"}</dd></div><div><dt>Phone</dt><dd>{bookingDetail.bookedByPhone || bookingDetail.contactPhone || "—"}</dd></div></dl></div>
                  <div><h3>Travel</h3><dl><div><dt>Passengers</dt><dd>{bookingDetail.passengerCount}</dd></div><div><dt>Seats</dt><dd>{Array.isArray(bookingDetail.seatNumbers) ? bookingDetail.seatNumbers.join(", ") : "—"}</dd></div><div><dt>Terminal / gate</dt><dd>{bookingDetail.terminal || "TBA"} / {bookingDetail.gate || "TBA"}</dd></div></dl></div>
                </div>
                <div className="admin-fare-box">
                  <h3>Fare breakdown</h3>
                  <div><span>Base fare</span><strong>{money(bookingDetail.fareBreakdown?.baseFare ?? bookingDetail.totalPrice)}</strong></div>
                  <div><span>Discount</span><strong>−{money(bookingDetail.fareBreakdown?.discount ?? 0)}</strong></div>
                  <div><span>Taxes</span><strong>{money(bookingDetail.fareBreakdown?.taxes ?? 0)}</strong></div>
                  <div className="total"><span>Total</span><strong>{money(bookingDetail.fareBreakdown?.total ?? bookingDetail.totalPrice)}</strong></div>
                  <p className="admin-fineprint">No payment collected.</p>
                </div>
                {bookingDetail.cancellationPolicy && <div className={`admin-callout ${bookingDetail.cancellationPolicy.eligible ? "" : "warn"}`}><strong>{bookingDetail.cancellationPolicy.eligible ? "Customer can self-cancel" : "Cancellation unavailable"}</strong><p>{bookingDetail.cancellationPolicy.reason}</p></div>}
                <footer className="admin-modal-actions">
                  {bookingDetail.status === "PENDING" && <button type="button" className="primary-btn" onClick={() => void changeBookingStatus(bookingDetail, "CONFIRMED")}>Confirm booking</button>}
                  {bookingDetail.status === "CONFIRMED" && <button type="button" className="secondary-btn" onClick={() => void changeBookingStatus(bookingDetail, "COMPLETED")}>Mark completed</button>}
                  {["CONFIRMED", "PENDING"].includes(bookingDetail.status) && <button type="button" className="cancel-booking-btn" onClick={() => void changeBookingStatus(bookingDetail, "CANCELLED")}>Cancel booking</button>}
                  <button type="button" className="text-btn" onClick={() => setBookingDetail(null)}>Close</button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}

      {/* Airport editor */}
      {airportModal && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setAirportModal(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label={`Edit ${airportModal.code}`} onClick={event => event.stopPropagation()}>
            <header className="admin-modal-head"><div><span className="admin-eyebrow">AIRPORT {airportModal.code}</span><h2>{airportModal.city}</h2></div><button type="button" className="admin-modal-close" onClick={() => setAirportModal(null)} aria-label="Close">×</button></header>
            <form className="admin-form" onSubmit={saveAirport}>
              <div className="admin-form-grid">
                <label><span>City</span><input required value={airportModal.city} onChange={event => setAirportModal(current => current ? { ...current, city: event.target.value } : current)} /></label>
                <label><span>Airport name</span><input required value={airportModal.airportName} onChange={event => setAirportModal(current => current ? { ...current, airportName: event.target.value } : current)} /></label>
                <label><span>Country</span><input required value={airportModal.country} onChange={event => setAirportModal(current => current ? { ...current, country: event.target.value } : current)} /></label>
                <label><span>Timezone</span><input value={airportModal.timezone} onChange={event => setAirportModal(current => current ? { ...current, timezone: event.target.value } : current)} /></label>
                <label><span>Region</span><select value={airportModal.region} onChange={event => setAirportModal(current => current ? { ...current, region: event.target.value } : current)}><option value="domestic">Domestic</option><option value="international">International</option></select></label>
                <label><span>Emoji</span><input value={airportModal.emoji || ""} onChange={event => setAirportModal(current => current ? { ...current, emoji: event.target.value } : current)} /></label>
              </div>
              <label className="full"><span>Description</span><textarea rows={2} value={airportModal.description || ""} onChange={event => setAirportModal(current => current ? { ...current, description: event.target.value } : current)} /></label>
              <label className="admin-check"><input type="checkbox" checked={Boolean(airportModal.isActive)} onChange={event => setAirportModal(current => current ? { ...current, isActive: event.target.checked ? 1 : 0 } : current)} />Visible in customer search and destination catalogue</label>
              <div className="admin-form-actions"><button type="submit" className="primary-btn" disabled={airportSaving}>{airportSaving ? "Saving…" : "Save airport"}</button><button type="button" className="text-btn" onClick={() => setAirportModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      <datalist id="admin-airports">
        {airports.map(airport => <option key={airport.code} value={`${airport.city} (${airport.code})`} />)}
      </datalist>
    </div>
  );
}
