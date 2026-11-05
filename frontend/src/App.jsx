import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  GraduationCap,
  LoaderCircle,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  X,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "https://zero5nov-workshop-h7bh.onrender.com").replace(/\/$/, "");
const DEMO_USER = {
  id: "demo-account",
  email: "demo@campusconnect.local",
  name: "CampusConnect Demo",
};
const artStyles = ["art-blue", "art-teal", "art-orange", "art-violet", "art-green", "art-rose"];

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(`Could not connect to the API at ${API_URL}. Check that the backend is running and VITE_API_URL is correct.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The API returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload?.error || `The request failed (${response.status}).`);
  return payload;
}

function formatDate(value) {
  if (!value) return "Date not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not provided";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [registrationEventId, setRegistrationEventId] = useState("");
  const [registrationStage, setRegistrationStage] = useState("");
  const [registrationEmail] = useState(DEMO_USER.email);
  const [registrationError, setRegistrationError] = useState("");
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [session] = useState({ user: DEMO_USER });
  const [registeredEventIds, setRegisteredEventIds] = useState(() => new Set());
  const [registrationCounts, setRegistrationCounts] = useState({});
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [eventMenuValue, setEventMenuValue] = useState("");
  const attemptedRegistrationRef = useRef("");

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError("");
    try {
      const data = await apiRequest("/api/events");
      if (!Array.isArray(data)) throw new Error("The events endpoint returned an unexpected response.");
      setEvents(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load events."));
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    let active = true;
    apiRequest("/api/demo/registrations")
      .then((registrations) => {
        if (!active || !Array.isArray(registrations)) return;
        const ids = registrations.map((registration) => registration.event_id);
        const counts = registrations.reduce((result, registration) => {
          result[registration.event_id] = (result[registration.event_id] || 0) + 1;
          return result;
        }, {});
        setRegisteredEventIds(new Set(ids));
        setRegistrationCounts(counts);
      })
      .catch(() => {
        // The demo table may not be installed yet; public event browsing still works.
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }
    let active = true;
    apiRequest("/api/me/registrations", { token: session.access_token })
      .then((registrations) => {
        if (active && Array.isArray(registrations)) {
          setRegisteredEventIds(new Set(registrations.map((registration) => registration.event_id)));
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError, "Could not load your registrations."));
        }
      });
    return () => {
      active = false;
    };
  }, [session]);

  const completeRegistration = useCallback(async (eventId, activeSession) => {
    if (!activeSession?.access_token) {
      try {
        await apiRequest("/api/demo/registrations", {
          method: "POST",
          body: JSON.stringify({ event_id: eventId }),
        });
        setRegisteredEventIds((current) => new Set(current).add(eventId));
        setRegistrationCounts((counts) => ({ ...counts, [eventId]: (counts[eventId] || 0) + 1 }));
        setRegistrationStage("done");
        return;
      } catch (requestError) {
        if (requestError instanceof Error && requestError.message.toLowerCase().includes("already registered")) {
          setRegisteredEventIds((current) => new Set(current).add(eventId));
          setRegistrationStage("done");
          return;
        }
        throw requestError;
      }
    }
    try {
      await apiRequest("/api/registrations", {
        method: "POST",
        token: activeSession.access_token,
        body: JSON.stringify({ event_id: eventId }),
      });
      setRegisteredEventIds((current) => new Set(current).add(eventId));
      setRegistrationStage("done");
      const url = new URL(window.location.href);
      url.searchParams.delete("register_event");
      window.history.replaceState({}, "", url);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message.toLowerCase().includes("already registered")) {
        setRegisteredEventIds((current) => new Set(current).add(eventId));
        setRegistrationStage("done");
        const url = new URL(window.location.href);
        url.searchParams.delete("register_event");
        window.history.replaceState({}, "", url);
        return;
      }
      throw requestError;
    }
  }, []);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events
      .filter((event) => (event.title || "").toLowerCase().includes(query))
      .sort((left, right) => {
        const leftDate = new Date(left.created_at || 0).getTime();
        const rightDate = new Date(right.created_at || 0).getTime();
        return sortOrder === "newest" ? rightDate - leftDate : leftDate - rightDate;
      });
  }, [events, search, sortOrder]);

  function chooseEvent(eventId) {
    setMobileMenuOpen(false);
    setEventMenuValue("");
    const event = events.find((item) => item.event_id === eventId);
    if (event) setSelectedEvent(event);
  }

  async function startRegistration(event) {
    setRegistrationError("");
    setRegistrationEventId(event.event_id);
    setRegistrationStage("registering");
    setRegistrationBusy(true);
    try {
      await completeRegistration(event.event_id, session);
    } catch (requestError) {
      setRegistrationError(getErrorMessage(requestError, "Registration could not be completed."));
      setRegistrationStage("error");
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function sendVerificationLink(event) {
    event.preventDefault();
    setRegistrationStage("registering");
  }

  function closeRegistrationDialog() {
    if (registrationStage === "registering" || registrationStage === "verifying" || registrationBusy) return;
    if (registrationStage !== "sent") {
      setRegistrationEventId("");
    }
    setRegistrationStage("");
    setRegistrationError("");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="brand-mark"><GraduationCap size={19} strokeWidth={2.5} /></span>
            <span>Campus<span>Connect</span></span>
          </a>
          <div className="header-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search events"
              placeholder="Search events, workshops..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="mobile-menu-button icon-button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`main-nav ${mobileMenuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
            <button
              className="nav-link active"
              onClick={() => {
                setMobileMenuOpen(false);
                document.getElementById("event-list")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Events Explorer
            </button>
          </nav>
          <label className="event-dropdown">
            <CalendarDays size={15} aria-hidden="true" />
            <select
              aria-label="Choose an event to view details"
              value={eventMenuValue}
              onChange={(event) => chooseEvent(event.target.value)}
              disabled={loadingEvents || events.length === 0}
            >
              <option value="">{loadingEvents ? "Loading events..." : "Choose an event"}</option>
              {events.map((event) => <option key={event.event_id} value={event.event_id}>{event.title}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </header>

      <main className="page-content">
        {error && (
          <div className="inline-alert error-alert" role="alert">
            <CircleHelp size={18} />
            <span>{error}</span>
            <button className="alert-action" onClick={() => void loadEvents()}>Try again</button>
            <button className="icon-button alert-close" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}

        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={14} /> YOUR CAMPUS, YOUR COMMUNITY</span>
            <h1>Find your next<br /><span>campus moment.</span></h1>
            <p>Discover events, meet your people, and make the most of every day on campus.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => document.getElementById("event-list")?.scrollIntoView({ behavior: "smooth" })}>
                Explore events <ArrowDownUp size={15} />
              </button>
              <button className="button button-outline" onClick={() => document.querySelector(".event-dropdown select")?.focus()}>
                Choose an event <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="hero-spark spark-one">✦</div>
            <div className="hero-spark spark-two">✳</div>
            <div className="hero-ticket"><Ticket size={33} /><span>YOUR<br />NEXT<br />STORY</span></div>
            <div className="hero-tag">Make it memorable <ArrowUpRight size={14} /></div>
          </div>
          <div className="hero-stats">
            <div><strong>{loadingEvents ? "—" : events.length}</strong><span>Campus events</span></div>
            <div><strong>{events.length ? "Open" : "—"}</strong><span>Public event details</span></div>
            <div><strong>01</strong><span>Community, together</span></div>
          </div>
        </section>

        <section className="events-section" id="event-list">
          <div className="section-heading">
            <div>
              <span className="section-kicker">DISCOVER</span>
              <h2>Events for you</h2>
              <p>Find something that sparks your interest.</p>
            </div>
            <label className="sort-control">
              <span><ArrowDownUp size={14} /> Sort</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort events">
                <option value="newest">Recently added</option>
                <option value="oldest">Oldest first</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          <div className="event-toolbar">
            <div className="result-label"><Compass size={15} /> {loadingEvents ? "Loading events..." : `${visibleEvents.length} ${visibleEvents.length === 1 ? "event" : "events"} found`}</div>
            <label className="toolbar-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by event title..." aria-label="Filter events by title" />
              {search && <button className="clear-search" aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}
            </label>
          </div>
          {loadingEvents ? (
            <div className="loading-grid" aria-label="Loading events">
              {[0, 1, 2].map((item) => <div className="skeleton-card" key={item}><div /><span /><span /></div>)}
            </div>
          ) : visibleEvents.length ? (
            <div className="event-grid">
              {visibleEvents.map((event, index) => (
                <article className="event-card" key={event.event_id}>
                  <div className={`event-art ${artStyles[index % artStyles.length]}`}>
                    <span className="art-label"><CalendarDays size={13} /> CAMPUS EVENT</span>
                    <span className="art-symbol">{index % 2 === 0 ? <Sparkles size={30} /> : <Users size={31} />}</span>
                    <span className="art-decoration decor-a" /><span className="art-decoration decor-b" />
                    <span className="art-index">0{(index % 9) + 1}</span>
                  </div>
                  <div className="event-card-content">
                    <div className="event-date"><CalendarDays size={14} /> Added {formatDate(event.created_at)}</div>
                    <h3>{event.title || "Untitled event"}</h3>
                    <p className="event-description">
                      {event.description || "Meet your campus community and take part in an event made for curious minds."}
                    </p>
                    <div className="event-meta-row">
                      <span className="capacity-meta"><Users size={14} /> {event.capacity} {Number(event.capacity) === 1 ? "place" : "places"}</span>
                      <span className="capacity-meta">Demo registrations: {registrationCounts[event.event_id] || 0}</span>
                      {registeredEventIds.has(event.event_id) && <span className="organizer-badge"><Check size={13} /> Registered</span>}
                    </div>
                    <div className="card-actions">
                      <button className="button button-outline card-details" onClick={() => setSelectedEvent(event)}>
                        View details
                      </button>
                      <button
                        className={registeredEventIds.has(event.event_id) ? "button button-registered card-register" : "button button-primary card-register"}
                        onClick={() => startRegistration(event)}
                        disabled={registeredEventIds.has(event.event_id) || (registrationBusy && registrationEventId === event.event_id)}
                      >
                        {registrationBusy && registrationEventId === event.event_id
                          ? <LoaderCircle className="spinner-icon" size={15} />
                          : registeredEventIds.has(event.event_id) ? <><Check size={15} /> Registered</> : <><Ticket size={15} /> Register</>}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Search size={24} /></div>
              <h3>{events.length ? "No events match that search" : "No events just yet"}</h3>
              <p>{events.length ? "Try another title or clear your search." : "Check back soon for something happening on campus."}</p>
              {events.length > 0 && <button className="button button-outline" onClick={() => setSearch("")}>Clear search</button>}
              {!events.length && <button className="button button-outline" onClick={() => void loadEvents()}>Refresh events</button>}
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="brand-mark"><GraduationCap size={17} /></span>Campus<span>Connect</span>
        </a>
        <span>Made for campus life.</span>
        <button className="footer-link" onClick={() => document.getElementById("event-list")?.scrollIntoView({ behavior: "smooth" })}>Explore events <ArrowUpRight size={13} /></button>
      </footer>

      {selectedEvent && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvent(null); }}>
          <section className="dialog event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
            <button className="icon-button dialog-close" aria-label="Close event details" onClick={() => setSelectedEvent(null)}><X size={19} /></button>
            <div className={`dialog-art ${artStyles[Math.max(0, events.findIndex((event) => event.event_id === selectedEvent.event_id)) % artStyles.length]}`}>
              <span className="art-label"><CalendarDays size={13} /> CAMPUS EVENT</span><Sparkles size={37} />
            </div>
            <div className="dialog-content">
              <span className="section-kicker">EVENT DETAILS</span>
              <h2 id="event-dialog-title">{selectedEvent.title || "Campus event"}</h2>
              <p>{selectedEvent.description || "Connect with your campus community and discover something new."}</p>
              <div className="dialog-facts">
                <span><CalendarDays size={16} /><span><b>Added</b>{formatDate(selectedEvent.created_at)}</span></span>
                <span><Users size={16} /><span><b>Capacity</b>{selectedEvent.capacity ?? "Not specified"}</span></span>
              </div>
              <div className="dialog-actions">
                <button className="button button-outline" onClick={() => setSelectedEvent(null)}>Close</button>
                <button
                  className={registeredEventIds.has(selectedEvent.event_id) ? "button button-registered" : "button button-primary"}
                  onClick={() => {
                    if (registeredEventIds.has(selectedEvent.event_id)) return;
                    const event = selectedEvent;
                    setSelectedEvent(null);
                    startRegistration(event);
                  }}
                  disabled={registeredEventIds.has(selectedEvent.event_id)}
                >
                  {registeredEventIds.has(selectedEvent.event_id) ? <><Check size={15} /> Registered</> : <><Ticket size={15} /> Register for event</>}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {registrationStage && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeRegistrationDialog();
        }}>
          <section className="dialog register-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-dialog-title">
            {registrationStage !== "registering" && registrationStage !== "verifying" && (
              <button className="icon-button dialog-close" aria-label="Close registration" onClick={closeRegistrationDialog}><X size={19} /></button>
            )}
            <div className={`register-status-icon ${registrationStage === "done" ? "complete" : ""}`}>
              {registrationStage === "done"
                ? <Check size={26} />
                : registrationStage === "registering" || registrationStage === "verifying"
                  ? <LoaderCircle className="spinner-icon" size={25} />
                  : <Ticket size={24} />}
            </div>
            <div className="register-dialog-content">
              <span className="section-kicker">{registrationStage === "done" ? "REGISTRATION CONFIRMED" : "QUICK EVENT REGISTRATION"}</span>
              <h2 id="registration-dialog-title">
                {registrationStage === "done"
                  ? "You’re registered!"
                  : registrationStage === "sent"
                    ? "Check your email"
                    : registrationStage === "registering"
                      ? "Finishing registration"
                      : registrationStage === "verifying"
                        ? "Verifying your email"
                        : `Register for ${events.find((event) => event.event_id === registrationEventId)?.title || "this event"}`}
              </h2>
              <p>
                {registrationStage === "done"
                    ? `${events.find((event) => event.event_id === registrationEventId)?.title || "Your event"} is confirmed for the demo account ${DEMO_USER.email}.`
                  : registrationStage === "sent"
                    ? `We sent a secure verification link to ${registrationEmail}. Open the link in this browser and we’ll complete your registration automatically.`
                    : registrationStage === "registering"
                      ? "Your demo account is being registered with the event. This should only take a moment."
                      : registrationStage === "verifying"
                        ? "Your email link is being verified. Keep this page open while we finish."
                        : "Enter your email and we’ll send a one-time verification link. No password or separate sign-in page needed."}
              </p>
              {registrationError && <div className="inline-alert error-alert register-error" role="alert">{registrationError}</div>}
              {(registrationStage === "email" || (registrationStage === "error" && !session)) && (
                <form className="registration-form" onSubmit={sendVerificationLink}>
                  <label htmlFor="registration-email">Email address</label>
                  <input
                    id="registration-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={registrationEmail}
                    onChange={(event) => setRegistrationEmail(event.target.value)}
                    required
                  />
                  <button className="button button-primary registration-submit" type="submit" disabled={registrationBusy}>
                    {registrationBusy ? <LoaderCircle className="spinner-icon" size={16} /> : <>Email me a verification link <ArrowRight size={15} /></>}
                  </button>
                </form>
              )}
              {registrationStage === "sent" && (
                <button className="button button-outline registration-submit" onClick={() => {
                  window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
                  setRegistrationError("");
                  setRegistrationStage("email");
                }}>
                  Use a different email
                </button>
              )}
              {registrationStage === "error" && session && (
                <button className="button button-primary registration-submit" onClick={() => setRegistrationStage("registering")}>
                  Try registration again <ArrowRight size={15} />
                </button>
              )}
              {registrationStage === "done" && (
                <>
                  <div className="registered-receipt"><ShieldCheck size={15} /> Demo account · Registration confirmed locally</div>
                  <button className="button button-primary registration-submit" onClick={closeRegistrationDialog}>Done</button>
                </>
              )}
              <div className="registration-security"><ShieldCheck size={14} /> Demo mode is active. No login or email verification is required.</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
