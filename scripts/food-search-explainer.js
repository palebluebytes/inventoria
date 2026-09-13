/**
 * The drop browser on `docs/food-search.html`.
 *
 * Inlined into the generated page by `food-search-explainer.mjs`, because the
 * page is a single file somebody opens from disk or from a review link — there
 * is nothing to fetch from.
 *
 * It renders a window rather than every row at once: a filter that redraws five
 * thousand nodes on every keystroke is unusable on a phone. The count line
 * always states the true total, so the window never hides how much matched —
 * the rule this repo learned from a search list that quietly cut its own tail.
 */
(function () {
  var DATA = JSON.parse(document.getElementById("drops").textContent);
  var PAGE = 60;

  var q = document.getElementById("q");
  var ruleSel = document.getElementById("rule");
  var catSel = document.getElementById("cat");
  var sortSel = document.getElementById("sort");
  var list = document.getElementById("list");
  var countLine = document.getElementById("count");
  var moreBtn = document.getElementById("more");

  DATA.categories.forEach(function (name, at) {
    var option = document.createElement("option");
    option.value = String(at);
    option.textContent = name === "" ? "(no category)" : name;
    catSel.appendChild(option);
  });

  var shown = PAGE;
  var matches = [];

  function ruleLabel(at) {
    var raw = DATA.rules[at] || "";
    return raw.replace(/_/g, " ");
  }

  function esc(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * The terms the rule fired on, marked inside the name the reader is reading.
   *
   * Match positions are found on the RAW text and each piece is escaped as it is
   * appended, rather than marking up text that has already been escaped — a term
   * matching inside an entity a previous pass introduced is how that goes wrong.
   */
  function markup(text, terms) {
    var words = terms.filter(function (t) {
      return t.indexOf("category: ") !== 0;
    });
    if (!words.length) return esc(text);
    // Longest first, so "whole milk" wins over "milk" where both are terms.
    var pattern = words
      .slice()
      .sort(function (a, b) {
        return b.length - a.length;
      })
      .map(function (word) {
        return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("|");
    var re = new RegExp("\\b(" + pattern + ")\\b", "gi");
    var out = "";
    var last = 0;
    var hit;
    while ((hit = re.exec(text)) !== null) {
      if (hit[0] === "") {
        re.lastIndex++;
        continue;
      }
      out +=
        esc(text.slice(last, hit.index)) + "<mark>" + esc(hit[0]) + "</mark>";
      last = hit.index + hit[0].length;
    }
    return out + esc(text.slice(last));
  }

  function matching() {
    var text = q.value.trim().toLowerCase();
    var rule = ruleSel.value === "" ? -1 : DATA.rules.indexOf(ruleSel.value);
    var cat = catSel.value === "" ? -1 : Number(catSel.value);

    var out = DATA.drops.filter(function (row) {
      if (rule !== -1 && row.r !== rule) return false;
      if (cat !== -1 && row.c !== cat) return false;
      if (text && row.d.toLowerCase().indexOf(text) === -1) return false;
      return true;
    });

    if (sortSel.value === "cal")
      out.sort(function (a, b) {
        return (b.k == null ? -1 : b.k) - (a.k == null ? -1 : a.k);
      });
    else if (sortSel.value === "panel")
      out.sort(function (a, b) {
        return b.n - a.n;
      });
    else
      out.sort(function (a, b) {
        return a.d.localeCompare(b.d);
      });

    return out;
  }

  function render() {
    var slice = matches.slice(0, shown);
    if (!slice.length) {
      list.innerHTML =
        '<p class="empty">Nothing discarded matches that. Try a shorter word &mdash; or it may be a food USDA never published.</p>';
      moreBtn.hidden = true;
      return;
    }

    list.innerHTML = slice
      .map(function (row) {
        var cat = DATA.categories[row.c];
        var cause = row.b.length
          ? row.b
              .map(function (t) {
                return t.indexOf("category: ") === 0
                  ? "filed as " + t.slice(10)
                  : "“" + t + "”";
              })
              .join(" + ")
          : "no term — the rule reads the corpus, not the name";
        return (
          '<div class="drop">' +
          '<div class="dname">' +
          markup(row.d, row.b) +
          "</div>" +
          '<div class="drule">' +
          ruleLabel(row.r) +
          "</div>" +
          '<div class="dnums">' +
          (row.k == null ? "—" : Math.round(row.k) + " kcal") +
          "<br>" +
          row.n +
          " nutrients</div>" +
          '<div class="dmeta"><span>fdc:' +
          row.i +
          "</span>" +
          (cat ? "<span>" + cat + "</span>" : "") +
          "<span>removed on " +
          cause +
          "</span></div>" +
          "</div>"
        );
      })
      .join("");

    moreBtn.hidden = matches.length <= shown;
    moreBtn.textContent =
      "Show " +
      Math.min(PAGE, matches.length - shown).toLocaleString("en-GB") +
      " more";
  }

  function refresh(resetWindow) {
    if (resetWindow) shown = PAGE;
    matches = matching();
    var total = matches.length.toLocaleString("en-GB");
    countLine.textContent =
      matches.length === DATA.drops.length
        ? "All " + total + " discarded foods"
        : total +
          (matches.length === 1 ? " discarded food" : " discarded foods") +
          " of " +
          DATA.drops.length.toLocaleString("en-GB");
    render();
  }

  [q, ruleSel, catSel, sortSel].forEach(function (control) {
    control.addEventListener("input", function () {
      refresh(true);
    });
  });

  moreBtn.addEventListener("click", function () {
    shown += PAGE;
    render();
    moreBtn.hidden = matches.length <= shown;
  });

  // "Review all N" on a rule card sets the filter and scrolls, so the card and
  // the browser are one surface rather than two lists of the same thing.
  Array.prototype.forEach.call(
    document.querySelectorAll(".reviewjump"),
    function (button) {
      button.addEventListener("click", function () {
        ruleSel.value = button.dataset.rule;
        q.value = "";
        catSel.value = "";
        refresh(true);
        document
          .getElementById("review")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  );

  refresh(true);
})();
