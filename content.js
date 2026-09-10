function $ready(callback) {
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    callback();
  } else {
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") {
        callback();
      }
    });
  }
}

async function $waitForKimai() {
  return new Promise((resolve) => {
    if (typeof kimai !== "undefined") {
      resolve(kimai);
    } else {
      document.addEventListener("kimai.initialized", (event) => {
        resolve(event.detail.kimai);
      });
    }
  });
}

$ready(async () => {
  const kimai = await $waitForKimai();
  window.__myKimaiExt = new MyKimaiExt(kimai);
});

// ----------------

class MyKimaiExt {
  constructor(kimai) {
    this.kimai = kimai;
    this.alert = kimai.getPlugin("alert");
    this.dtcv = kimai.getPlugin("datatable-column-visibility");
    this.date = kimai.getPlugin("date");

    this.adjustSettings();

    this.addActionButtons();
    this.addDateHeaders();
    document.addEventListener("kimai.reloadedContent", (event) => {
      this.addActionButtons();
      this.addDateHeaders();
    });
  }

  warn(message) {
    const fullMessage = `[My Kimai] ${message}`;
    if (this.alert) {
      this.alert.warning(fullMessage);
    } else {
      alert(fullMessage);
    }
  }

  adjustSettings() {
    if (!this.alert) {
      this.warn("Plugin `alert` not found!");
    }

    if (this.dtcv) {
      this.dtcv._changeVisibility("starttime", true);
      this.dtcv._changeVisibility("endtime", true);
      this.dtcv._changeVisibility("duration", true);
      this.dtcv._changeVisibility("customer", false);
      this.dtcv._changeVisibility("project", true);
      this.dtcv._changeVisibility("activity", true);
      this.dtcv._changeVisibility("description", true);
      this.dtcv._changeVisibility("tags", false);
      this.dtcv._changeVisibility("billable", false);
      this.dtcv._changeVisibility("exported", false);
      this.dtcv._changeVisibility("actions", true);
    } else {
      this.warn("Plugin `datatable-column-visibility` not found!");
    }

    if (this.date) {
      if (this.date.timeFormat) {
        if (
          this.date.timeFormat.includes("a") ||
          this.date.timeFormat.includes("h")
        ) {
          this.warn(
            "Please go to preferences and select a time format that has a 24h clock!",
          );
        }
      } else {
        this.warn("Plugin `date` does not have `timeFormat` set!");
      }
    } else {
      this.warn("Plugin `date` not found!");
    }
  }

  addActionButtons() {
    const table = document.querySelector(".dataTable");
    const trs = table.querySelectorAll("tbody tr");

    for (const tr of trs) {
      const col = tr.querySelector(".col_actions");
      if (!col) {
        continue;
      }

      const repeatEl = col.querySelector(".dropdown-menu .dd-ts-repeat");
      if (repeatEl && !col.querySelector(".mykimai-repeat-button")) {
        const repeatClone = repeatEl.cloneNode(true);
        repeatClone.classList.remove("dropdown-item");
        repeatClone.classList.add("link-secondary", "mykimai-repeat-button");
        repeatClone.innerHTML = '<i class="fas fa-play"></i>';
        col.insertBefore(repeatClone, col.firstChild);
      } else {
        const stopEl = col.querySelector(".dropdown-menu .dd-ts-stop");
        if (stopEl && !col.querySelector(".mykimai-stop-button")) {
          const stopClone = stopEl.cloneNode(true);
          stopClone.classList.remove("dropdown-item");
          stopClone.classList.add("link-secondary", "mykimai-stop-button");
          stopClone.innerHTML = '<i class="fas fa-stop"></i>';
          col.insertBefore(stopClone, col.firstChild);
        }
      }
    }
  }

  addDateHeaders() {
    if (!this.date) {
      return;
    }

    const lang = this.kimai.getConfiguration().get("language");

    function sumDurations(strs) {
      const total = strs
        .map((d) => {
          const [h, m] = d.split(":").map((s) => Number.parseInt(s, 10));
          if (h < 0) {
            return Temporal.Duration.from({ minutes: 0 });
          }
          return Temporal.Duration.from({ hours: h, minutes: m });
        })
        .reduce((acc, curr) => {
          return acc.add(curr);
        }, new Temporal.Duration());
      return total
        .round({ smallestUnit: "minutes", largestUnit: "hours" })
        .toLocaleString("en-US", {
          style: "digital",
          hoursDisplay: "always",
          minutesDisplay: "always",
          secondsDisplay: "auto",
        });
    }

    function getDaySummaryTR(tr, date) {
      let daySummaryTR = tr.parentElement.querySelector(
        `.mykimai-day-summary[data-date="${date.toString()}"]`,
      );
      if (!daySummaryTR) {
        daySummaryTR = document.createElement("tr");
        daySummaryTR.classList.add("mykimai-day-summary");
        daySummaryTR.dataset.date = date.toString();
        const displayDate = date.toLocaleString(lang, { dateStyle: "full" });
        daySummaryTR.innerHTML = `<th class="mykimai-date">${displayDate}</th>`;
      }
      tr.parentElement.insertBefore(daySummaryTR, tr);
      return daySummaryTR;
    }

    function getPrevDurationEl(prevTR) {
      let prevDurationEl = prevTR.querySelector(".mykimai-duration .duration");
      if (!prevDurationEl) {
        const lastDurationTH = document.createElement("th");
        lastDurationTH.classList.add("mykimai-duration");
        prevTR.appendChild(lastDurationTH);
        prevDurationEl = document.createElement("span");
        prevDurationEl.classList.add("duration");
        lastDurationTH.appendChild(prevDurationEl);
      }
      return prevDurationEl;
    }

    const table = document.querySelector(".dataTable");
    const trs = table.querySelectorAll("tbody tr");

    let prevDate = null;
    let prevTR = null;
    let durationStrs = [];

    for (const tr of trs) {
      const dateCol = tr.querySelector(".col_date");
      const durationEl = tr.querySelector(".col_duration .duration");
      if (!dateCol || !durationEl) {
        continue;
      }

      const durationStr = durationEl.textContent;
      durationStrs.push(durationStr);

      const dateStr = dateCol.textContent.trim();
      const luxonDate = this.date.fromFormat(dateStr, this.date.dateFormat);
      const date = Temporal.PlainDate.from(luxonDate);

      if (!prevDate || !prevDate.equals(date)) {
        const daySummaryTR = getDaySummaryTR(tr, date);

        if (prevTR) {
          const newDurationStrs = [durationStrs.pop()];

          const displayDuration = sumDurations(durationStrs);
          const prevDurationEl = getPrevDurationEl(prevTR);
          prevDurationEl.textContent = displayDuration;

          durationStrs = newDurationStrs;
        }

        prevDate = date;
        prevTR = daySummaryTR;
      }
    }

    if (prevTR) {
      const displayDuration = sumDurations(durationStrs);
      const prevDurationEl = getPrevDurationEl(prevTR);
      prevDurationEl.textContent = displayDuration;
    }

    clearTimeout(this._addDateHeadersTimeout);
    this._addDateHeadersTimeout = setTimeout(() => {
      this.addDateHeaders();
    }, 30000);
  }
}
