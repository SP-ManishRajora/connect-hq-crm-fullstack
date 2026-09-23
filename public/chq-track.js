/*
 * ConnectHQ first-party tracker.
 *
 * Served from the CRM so there is one copy to update, and loaded by
 * connecthq.co.in with a single <script defer> tag. Posts to /api/track on the
 * CRM, which validates and stores each event as a WebEvent row.
 *
 * Deliberately small and dependency-free: it runs on every page of a marketing
 * site, so it must not block rendering, must not throw into a visitor's
 * console, and must not care which framework the page was built with. Every
 * entry point below is wrapped so a tracking failure can never break the page
 * it is measuring — nobody should lose an enquiry because analytics broke.
 *
 * Privacy: no cookies. Ids are random strings kept in the visitor's own
 * storage, meaningless on any other site. The server truncates IPs before
 * storing and never keeps the user-agent string.
 *
 * Configure by setting window.CHQ_TRACK_URL before this script loads — used on
 * a staging site so its traffic does not pollute live figures.
 */
(function () {
  "use strict";

  var ENDPOINT =
    (typeof window.CHQ_TRACK_URL === "string" && window.CHQ_TRACK_URL) ||
    "https://crm.connecthq.co.in/api/track";

  // Must match EVENT_NAMES in src/lib/analytics/events.ts — the server drops
  // anything else, so a name added here without adding it there vanishes.
  var SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity ends a session
  var VISITOR_KEY = "chq_vid";
  var SESSION_KEY = "chq_sid";
  var SESSION_AT_KEY = "chq_sat";
  var ATTR_KEY = "chq_attr";

  /* ---------------------------------------------------------------- storage */

  /*
   * Storage can throw, not just return null: Safari in private mode and a
   * browser with site data blocked both raise on access. Every read and write
   * goes through these, so the tracker degrades to per-pageview ids rather than
   * taking the page down with it.
   */
  function get(store, key) {
    try {
      return window[store].getItem(key);
    } catch (e) {
      return null;
    }
  }

  function set(store, key, value) {
    try {
      window[store].setItem(key, value);
    } catch (e) {
      /* storage unavailable — ids stay in memory for this page only */
    }
  }

  function rand() {
    // crypto.randomUUID is not available on older Safari, hence the fallback.
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (e) {
      /* fall through */
    }
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10)
    );
  }

  /* -------------------------------------------------------------- identity */

  function visitorId() {
    var id = get("localStorage", VISITOR_KEY);
    if (!id) {
      id = rand();
      set("localStorage", VISITOR_KEY, id);
    }
    return id;
  }

  /*
   * A session is a run of activity with no 30-minute gap. Kept in
   * sessionStorage plus a timestamp: sessionStorage alone would keep one tab
   * open all day counted as a single session, and localStorage alone would
   * never expire.
   */
  var isNewSession = false;

  function sessionId() {
    var now = Date.now();
    var id = get("sessionStorage", SESSION_KEY);
    var at = parseInt(get("sessionStorage", SESSION_AT_KEY) || "0", 10);

    if (!id || !at || now - at > SESSION_TTL_MS) {
      id = rand();
      isNewSession = true;
    }
    set("sessionStorage", SESSION_KEY, id);
    set("sessionStorage", SESSION_AT_KEY, String(now));
    return id;
  }

  /* ----------------------------------------------------------- attribution */

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  /*
   * Campaign attribution, captured once on first arrival and then reused.
   *
   * First-touch on purpose: a visitor who arrives from an ad, leaves, and comes
   * back directly a day later should still be credited to the ad that found
   * them. Overwriting on every visit would quietly reassign every lead to
   * "direct" and make paid search look worthless.
   *
   * A later visit carrying its own gclid/utm does overwrite — that is a genuine
   * new click on a new campaign, not a return visit.
   */
  function attribution() {
    var fresh = {
      gclid: param("gclid"),
      utmSource: param("utm_source"),
      utmMedium: param("utm_medium"),
      utmCampaign: param("utm_campaign"),
      utmTerm: param("utm_term"),
      utmContent: param("utm_content"),
    };

    var hasFresh = false;
    for (var k in fresh) if (fresh[k]) hasFresh = true;

    if (hasFresh) {
      set("localStorage", ATTR_KEY, JSON.stringify(fresh));
      return fresh;
    }

    try {
      var stored = get("localStorage", ATTR_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      /* corrupt blob — fall through to empty */
    }
    return {};
  }

  /* -------------------------------------------------------------- sending */

  var vid = visitorId();
  var sid = sessionId();
  var attr = attribution();

  function send(name, meta) {
    var payload = {
      name: name,
      visitorId: vid,
      sessionId: sid,
      path: window.location.pathname,
      url: window.location.href,
      title: document.title,
      referrer: document.referrer || null,
      gclid: attr.gclid || null,
      utmSource: attr.utmSource || null,
      utmMedium: attr.utmMedium || null,
      utmCampaign: attr.utmCampaign || null,
      utmTerm: attr.utmTerm || null,
      utmContent: attr.utmContent || null,
      websiteLeadId: window.CHQ_LEAD_ID || null,
      ts: Date.now(),
    };
    if (meta) payload.meta = meta;

    var body = JSON.stringify([payload]);

    /*
     * sendBeacon survives the page unloading, which fetch does not — a click on
     * an outbound link would otherwise be cancelled mid-flight and never
     * recorded. keepalive on the fetch fallback does the same job for browsers
     * without it.
     */
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch (e) {
      /* fall through to fetch */
    }

    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        mode: "cors",
      }).catch(function () {
        /* a dropped beacon is not worth a console error on a live site */
      });
    } catch (e) {
      /* nothing more to try */
    }
  }

  /* --------------------------------------------------------------- events */

  if (isNewSession) send("session_start");
  send("page_view");

  /*
   * One delegated listener rather than one per element: marketing pages inject
   * content after load (chat widgets, lazy sections), and per-element listeners
   * would miss all of it.
   */
  document.addEventListener(
    "click",
    function (e) {
      try {
        var el = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!el) return;
        var href = el.getAttribute("href") || "";

        if (/^tel:/i.test(href)) {
          send("phone_click", { href: href });
        } else if (/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) {
          send("whatsapp_click", { href: href });
        } else if (/^mailto:/i.test(href)) {
          send("outbound_click", { href: href });
        }
      } catch (err) {
        /* never let a tracking failure break a link the visitor clicked */
      }
    },
    true,
  );

  // Scroll depth, each threshold once per page.
  var marks = [25, 50, 75, 100];
  var hit = {};
  var ticking = false;

  function checkScroll() {
    ticking = false;
    try {
      var doc = document.documentElement;
      var height = doc.scrollHeight - window.innerHeight;
      if (height <= 0) return;
      var pct = ((window.pageYOffset || doc.scrollTop) / height) * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (!hit[m] && pct >= m) {
          hit[m] = true;
          send("scroll_depth", { depth: m });
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  window.addEventListener(
    "scroll",
    function () {
      // rAF-throttled: scroll fires far too often to send from directly.
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(checkScroll);
      }
    },
    { passive: true },
  );

  // First interaction with any form on the page — the top of the enquiry funnel.
  var formStarted = {};
  document.addEventListener(
    "focusin",
    function (e) {
      try {
        var t = e.target;
        if (!t || !t.form) return;
        var id = t.form.getAttribute("id") || t.form.getAttribute("name") || "form";
        if (formStarted[id]) return;
        formStarted[id] = true;
        send("form_start", { form: id });
      } catch (err) {
        /* ignore */
      }
    },
    true,
  );

  /*
   * Public hook for the enquiry form.
   *
   * connecthqEmail.php generates a CHQ-<ts>-<rand> reference per submission and
   * posts it to /api/leads/public. Calling this with the same reference is what
   * joins a WebEvent session to the Lead row it produced — the whole point of
   * storing these events rather than reading aggregates from Google.
   *
   *   window.chqTrack.leadSubmit('CHQ-1732...-ab12');
   */
  window.chqTrack = {
    leadSubmit: function (websiteLeadId, meta) {
      if (websiteLeadId) window.CHQ_LEAD_ID = String(websiteLeadId);
      send("lead_submit", meta || null);
    },
    event: function (name, meta) {
      send(name, meta || null);
    },
  };

  /*
   * Mirror the existing GTM dataLayer push, so a form that already reports to
   * Google reports here too without editing the form's own code.
   */
  try {
    var dl = window.dataLayer;
    if (dl && typeof dl.push === "function") {
      var origPush = dl.push.bind(dl);
      dl.push = function () {
        try {
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (a && a.event === "lead_submit") {
              window.chqTrack.leadSubmit(a.websiteLeadId || a.leadId || null, null);
            }
          }
        } catch (e) {
          /* never break GTM */
        }
        return origPush.apply(null, arguments);
      };
    }
  } catch (e) {
    /* no dataLayer — nothing to mirror */
  }
})();
