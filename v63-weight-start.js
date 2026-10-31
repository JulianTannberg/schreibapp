/* Essen Tracker v63 – Startmessung im Gesamtverlauf
   - Erste vorhandene Gewichtsmessung zählt als Startwert, auch wenn sie nicht morgens war.
   - Danach bleibt die bisherige Logik: pro Tag die erste Morgenmessung vor 12:00 Uhr.
   - Korrigiert den bekannten ersten Eintrag 13.09.2026 / 101,9 kg von 17:26 auf 13:15 Uhr.
*/
(function(){
  "use strict";

  const START_DATE = "2026-09-13";
  const START_WEIGHT = 101.9;
  const OLD_START_TIME = "17:26";
  const CORRECT_START_TIME = "13:15";

  function isSameEntry(a,b){
    if(!a || !b) return false;
    if(a.id && b.id) return a.id === b.id;
    return a.date === b.date && a.time === b.time && Number(a.weightKg) === Number(b.weightKg);
  }

  // Gesamtverlauf: allererste vorhandene Messung als Startwert + danach Morgenmessungen.
  allWeightEntriesForChart = function(){
    const all = weightEntriesSorted();
    if(!all.length) return [];

    const morning = chartWeightEntries(all);
    const first = all[0];

    if(morning.some(e => isSameEntry(e, first))) return morning;
    return [first, ...morning.filter(e => !isSameEntry(e, first))];
  };

  // Zusammenfassung für Monat / Seit Beginn.
  renderWeightChart = function(){
    const isAll = weightChartRange === "all",
      pts = isAll ? allWeightEntriesForChart() : monthWeightEntries(),
      summary = document.querySelector("#weightMonthSummary");

    document.querySelectorAll("[data-weight-range]").forEach(b =>
      b.classList.toggle("active", b.dataset.weightRange === weightChartRange)
    );

    if(!pts.length){
      summary.textContent = isAll
        ? "Noch keine Gewichtsmessungen aufgezeichnet."
        : "Noch keine Morgenmessungen (vor 12:00 Uhr) in diesem Monat.";
    }else{
      const vals = pts.map(p => Number(p.weightKg)),
        delta = vals[vals.length - 1] - vals[0],
        firstDate = parseDate(pts[0].date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}),
        lastDate = parseDate(pts[pts.length - 1].date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});

      if(isAll){
        const morningCount = pts.filter(e => e.time < "12:00").length;
        summary.textContent = `${firstDate} – ${lastDate} · ${pts.length} Messung${pts.length===1?"":"en"} · davon ${morningCount} Morgenmessung${morningCount===1?"":"en"} · Veränderung: ${formatWeightDelta(delta)}`;
      }else{
        summary.textContent = `${pts.length} Morgenmessung${pts.length===1?"":"en"} · erste → letzte: ${formatWeightDelta(delta)}`;
      }
    }

    drawWeightChart(document.querySelector("#weightChart"), pts, 175);
  };

  // Bekannten falschen Zeitstempel der ersten Messung einmalig berichtigen.
  let changed = false;
  const firstKnown = state.entries.find(e =>
    e.type === "weight" &&
    e.date === START_DATE &&
    Number(e.weightKg) === START_WEIGHT &&
    e.time === OLD_START_TIME
  );

  if(firstKnown){
    firstKnown.time = CORRECT_START_TIME;
    changed = true;
  }

  if(changed){
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  // Aktuelle Ansicht sofort mit der neuen Logik zeichnen.
  try{ renderAll(); }catch(_){ }
})();
