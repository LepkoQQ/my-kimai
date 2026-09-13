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
    this.modal = kimai.getPlugin("modal");
    this.api = kimai.getPlugin("api");

    this.injectTimesheet();
    this.injectReportingUser();
    this.injectTimesheetEditForm();
  }

  injectTimesheet() {
    const regex = /\/[^\/]{2}\/timesheet\//;
    if (!window.location.pathname.match(regex)) {
      return;
    }

    this.addStyles();
    this.adjustSettings();

    const onTimer = () => {
      this.addActionButtons();
      this.addDateHeaders();
      this.addWeekHeaders();

      clearTimeout(this._injectTimesheetTimeout);
      this._injectTimesheetTimeout = setTimeout(() => {
        onTimer();
      }, 30000);
    };

    onTimer();
    document.addEventListener("kimai.reloadedContent", (event) => {
      onTimer();
    });
  }

  injectReportingUser() {
    const regex = /\/[^\/]{2}\/reporting\/user\/(week|month|year)/;
    if (!window.location.pathname.match(regex)) {
      return;
    }

    this.addStylesReporting();
    this.filterReportingTable();
  }

  async addStyles() {
    const styleSheet = new CSSStyleSheet();
    await styleSheet.replace(`
      :root {
        margin-left: 0;
      }
      table.dataTable tr {
        display: flex;
        flex-wrap: wrap;
      }
      table.dataTable tr > * {
        flex: 0 0 auto;
      }
      table.dataTable tr th.multiCheckbox {
        width: 44px; /* fix header checkbox */
      }
      table.dataTable .col_id {
        order: 0;
      }
      table.dataTable .col_date {
        width: 100px;
      }
      table.dataTable .col_starttime,
      table.dataTable .col_endtime,
      table.dataTable .col_duration {
        width: 60px;
        order: 3;
      }
      table.dataTable th.col_starttime,
      table.dataTable th.col_endtime,
      table.dataTable th.col_duration {
        font-size: 0px;
        text-align: right !important;
      }
      table.dataTable .col_duration .duration,
      table.dataTable tr.mykimai-day-summary th.mykimai-duration .duration,
      table.dataTable tr.mykimai-week-summary th.mykimai-duration .duration {
        display: inline-block;
        margin-block: -4px;
        font-weight: 700;
        font-size: 16px;
      }
      table.dataTable .col_project,
      table.dataTable .col_activity {
        width: 220px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        order: 2;
      }
      table.dataTable .col_activity {
        width: 150px;
      }
      table.dataTable .col_activity .label-activity {
        opacity: 0.5;
        font-size: 12px;

        .badge {
          display: none;
        }
      }
      table.dataTable .col_description {
        flex-grow: 1;
        order: 1;
      }
      table.dataTable .col_actions {
        display: flex !important;
        gap: 10px;
        width: 60px;
        order: 3;
      }
      table.dataTable tr.summary.info {
        display: none;
      }
      table.dataTable tr.mykimai-day-summary th,
      table.dataTable tr.mykimai-day-summary:hover th,
      table.dataTable tr.mykimai-week-summary th,
      table.dataTable tr.mykimai-week-summary:hover th {
        padding-block: 0.625rem 0.5rem;
        background: hsl(from var(--tblr-body-bg) h s calc(l + 2));
        box-shadow: none;
      }
      table.dataTable tr.mykimai-week-summary th,
      table.dataTable tr.mykimai-week-summary:hover th {
        background: hsl(from var(--tblr-body-bg) h s l);
      }
      table.dataTable tr.mykimai-day-summary th.mykimai-date,
      table.dataTable tr.mykimai-week-summary th.mykimai-week {
        flex: 1;
      }
    `);
    document.adoptedStyleSheets.push(styleSheet);
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

  _sumDurations(strs) {
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

  _getPrevDurationEl(prevTR) {
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

  _addIncompleteInfoButton(prevDurationEl) {
    const parentEl = prevDurationEl.parentElement;
    let infoButton = parentEl.querySelector(".fa-triangle-exclamation");
    if (!infoButton) {
      infoButton = document.createElement("i");
      infoButton.classList.add(
        "fas",
        "fa-triangle-exclamation",
        "small",
        "me-2",
        "text-warning",
      );
      infoButton.style.cursor = "pointer";
      infoButton.addEventListener("click", () => {
        this.warn(
          "Total could be incomplete as it only includes times visible on this page!",
        );
      });
      parentEl.insertBefore(infoButton, prevDurationEl);
    }
  }

  addDateHeaders() {
    if (!this.date) {
      return;
    }

    const lang = this.kimai.getConfiguration().get("language");

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

    const table = document.querySelector(".dataTable");

    const sortedFields = Array.from(
      table.querySelectorAll(
        "thead th.sortable:is(.sorting_desc, .sorting_asc)",
      ),
    ).map((col) => col.dataset.field);
    if (
      sortedFields.length !== 2 ||
      !sortedFields.includes("starttime") ||
      !sortedFields.includes("date")
    ) {
      return;
    }

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

          const displayDuration = this._sumDurations(durationStrs);
          const prevDurationEl = this._getPrevDurationEl(prevTR);
          prevDurationEl.textContent = displayDuration;

          durationStrs = newDurationStrs;
        }

        prevDate = date;
        prevTR = daySummaryTR;
      }
    }

    if (prevTR) {
      const displayDuration = this._sumDurations(durationStrs);
      const prevDurationEl = this._getPrevDurationEl(prevTR);
      prevDurationEl.textContent = displayDuration;
      this._addIncompleteInfoButton(prevDurationEl);
    }

    table.querySelectorAll(".col_date").forEach((col) => {
      col.style.display = "none";
    });
  }

  addWeekHeaders() {
    if (!this.date) {
      return;
    }

    const lang = this.kimai.getConfiguration().get("language");

    function formatWeekDisplay(week) {
      let weekLabel = new Intl.DisplayNames(lang, {
        type: "dateTimeField",
      }).of("weekOfYear");
      weekLabel = weekLabel[0].toUpperCase() + weekLabel.slice(1);
      return `${weekLabel} ${week}`;
    }

    function getWeekSummaryTR(tr, week) {
      let weekSummaryTR = tr.parentElement.querySelector(
        `.mykimai-week-summary[data-week="${week}"]`,
      );
      if (!weekSummaryTR) {
        weekSummaryTR = document.createElement("tr");
        weekSummaryTR.classList.add("mykimai-week-summary");
        weekSummaryTR.dataset.week = week;
        const displayWeek = formatWeekDisplay(week);
        weekSummaryTR.innerHTML = `<th class="mykimai-week">${displayWeek}</th>`;
      }
      if (
        tr.previousElementSibling &&
        tr.previousElementSibling.classList.contains("mykimai-day-summary")
      ) {
        tr = tr.previousElementSibling;
      }
      tr.parentElement.insertBefore(weekSummaryTR, tr);
      return weekSummaryTR;
    }

    const table = document.querySelector(".dataTable");
    const trs = table.querySelectorAll("tbody tr");

    let prevWeek = null;
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
      const week = date.weekOfYear;

      if (prevWeek !== week) {
        const weekSummaryTR = getWeekSummaryTR(tr, week);

        if (prevTR) {
          const newDurationStrs = [durationStrs.pop()];

          const displayDuration = this._sumDurations(durationStrs);
          const prevDurationEl = this._getPrevDurationEl(prevTR);
          prevDurationEl.textContent = displayDuration;

          durationStrs = newDurationStrs;
        }

        prevWeek = week;
        prevTR = weekSummaryTR;
      }
    }

    if (prevTR) {
      const displayDuration = this._sumDurations(durationStrs);
      const prevDurationEl = this._getPrevDurationEl(prevTR);
      prevDurationEl.textContent = displayDuration;
      this._addIncompleteInfoButton(prevDurationEl);
    }
  }

  addStylesReporting() {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(`
      table.dataTable .activity {
        --tblr-table-bg-state: hsl(from var(--tblr-bg-surface) h s calc(l - 2));

        td {
          padding-block: 8px;
          font-size: 12px;
          opacity: 0.75;

          .label-activity .badge {
            display: none;
          }
        }
      }
    `);
    document.adoptedStyleSheets.push(styleSheet);
  }

  filterReportingTable() {
    const table = document.querySelector(".dataTable");
    const trs = table.querySelectorAll("tbody tr");

    for (const tr of trs) {
      if (tr.classList.contains("activity")) {
        tr.style.display = "none";
      }
    }

    const btnList = document.querySelector(".form-reporting .btn-list");
    let hideActivityBtn = btnList.querySelector(".mykimai-hide-activity");
    if (!hideActivityBtn) {
      hideActivityBtn = document.createElement("button");
      hideActivityBtn.type = "button";
      hideActivityBtn.classList.add("mykimai-hide-activity", "btn");
      hideActivityBtn.innerHTML =
        '<i class="fas fa-eye-slash me-2"></i> Toggle activities';
      btnList.appendChild(hideActivityBtn);
    }

    hideActivityBtn.addEventListener("click", () => {
      for (const tr of trs) {
        if (tr.classList.contains("activity")) {
          tr.style.display = tr.style.display === "none" ? "" : "none";
        }
      }
    });
  }

  _watchForTimesheetEditForm() {
    const injectedForms = new WeakSet();

    const checkForForm = () => {
      const forms = document.querySelectorAll(
        'form[name="timesheet_edit_form"]',
      );
      for (const form of forms) {
        if (!injectedForms.has(form)) {
          injectedForms.add(form);

          this.addLastEndTimeButton(form);
          this.fixTimeFormatOnEnter(form);
        }
      }
    };

    const observer = new MutationObserver(checkForForm);
    observer.observe(document.body, { childList: true, subtree: true });

    checkForForm();
  }

  injectTimesheetEditForm() {
    this._watchForTimesheetEditForm();
  }

  addLastEndTimeButton(form) {
    if (!this.modal || !this.api) {
      return;
    }

    const onClick = (event) => {
      event.preventDefault();
      const linkTarget = event.currentTarget;
      const formElement = document.getElementById(linkTarget.dataset.target);
      if (!formElement.disabled) {
        this.api.get(
          "/api/timesheets",
          { active: 0, order: "DESC", orderBy: "begin" },
          (timesheets) => {
            let lastEndTime = timesheets[0].end;
            formElement.value = this.date.format(
              linkTarget.dataset.format,
              lastEndTime,
            );
            formElement.dispatchEvent(new Event("change", { bubbles: true }));
            formElement.dispatchEvent(new Event("keyup", { bubbles: true }));
          },
        );
      }
    };

    function addButton(input) {
      const nowLink = input.previousElementSibling;
      const linkClone = nowLink.cloneNode(true);
      linkClone.innerHTML = '<i class="fas fa-arrow-left-rotate"></i>';
      linkClone.dataset.formWidget = "date-last-end-time";
      nowLink.parentNode.insertBefore(linkClone, input);
      linkClone.addEventListener("click", onClick);
    }

    [
      "#timesheet_edit_form_begin_time",
      "#timesheet_edit_form_end_time",
    ].forEach((selector) => {
      const input = form.querySelector(selector);
      if (input) {
        addButton(input);
      }
    });
  }

  fixTimeFormatOnEnter(form) {
    if (!this.modal) {
      return;
    }

    const submitButton = form.querySelector("#form_modal_save");
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && document.activeElement) {
        document.activeElement.blur();
        if (submitButton) {
          submitButton.click();
        }
      }
    });
  }
}
