(function () {
  const POLL_MS = 20000;
  const lastUpdatedEl = document.querySelector("[data-last-updated]");
  const errorEl = document.querySelector("[data-error-banner]");

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function refresh() {
    try {
      const res = await fetch("/api/scores", { headers: { Accept: "application/json" } });
      const data = await res.json();

      if (data.error) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = "Live scores are temporarily unavailable — showing last known scores.";
        }
      } else if (errorEl) {
        errorEl.hidden = true;
      }

      (data.matchups || []).forEach((m) => {
        [m.home, m.away].forEach((side) => {
          if (!side) return;
          const el = document.querySelector(`[data-score-for="${side.teamId}"]`);
          if (el) el.textContent = side.score.toFixed(1);
        });

        // Highlight whichever side currently has more points.
        if (m.home && m.away) {
          const homeEl = document.querySelector(`[data-score-for="${m.home.teamId}"]`);
          const awayEl = document.querySelector(`[data-score-for="${m.away.teamId}"]`);
          if (homeEl && awayEl) {
            homeEl.classList.toggle("leading", m.home.score > m.away.score);
            awayEl.classList.toggle("leading", m.away.score > m.home.score);
          }
        }
      });

      if (lastUpdatedEl) lastUpdatedEl.textContent = fmtTime(data.lastUpdated);
    } catch (e) {
      // Network hiccup — silently retry on the next tick.
    }
  }

  refresh();
  setInterval(refresh, POLL_MS);
})();
