/**
 * The live search on `docs/food-search.html`.
 *
 * It calls the app's own `searchIndexRows`, bundled into this page by
 * `food-search-explainer.mjs`, so the ORDER on screen is the shipped ranking's
 * and not this file's opinion of it. What is computed here is the annotation
 * only: each row's key vector, re-scored with the same
 * `compileReferenceFoodQuery` and `readRowRank` the search used, so a reader can
 * see which column decided two rows. Nothing here can move a result.
 */
(function () {
  var api = window.FoodSearch;
  var raw = document.getElementById("corpus");
  if (!api || !raw) return;

  var index = JSON.parse(raw.textContent);
  var corpus = api.buildSearchCorpus(index);
  var CAP = api.SEARCH_RESULT_LIMIT;
  var byId = {};
  for (var i = 0; i < index.foods.length; i++)
    byId[index.foods[i].fdcId] = index.foods[i];

  var box = document.getElementById("q2");
  var line = document.getElementById("count2");
  var out = document.getElementById("hits");

  // `compareRelevance`'s order, for the annotation columns. Short labels because
  // twelve of them have to fit on a phone.
  var COLUMNS = [
    ["tier", "tier"],
    ["recent", "rec"],
    ["frequent", "freq"],
    ["raw", "raw"],
    ["head", "head"],
    ["accounted", "acct"],
    ["position", "pos"],
    ["plainSibling", "sib"],
    ["plain", "plain"],
    ["wholeness", "whole"],
    ["designated", "desig"],
  ];

  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * The key the search scored this row on, for THIS phrase.
   *
   * `bestNameKey`'s shape: the row's keys spread onto each name's key, the best
   * of them taken by `compareRelevance` rather than by tier alone. Taking the
   * best by tier would annotate a different name from the one that won whenever
   * an alias ties on tier and beats its row on a later key.
   */
  function keysFor(row, phrase) {
    var rank = api.compileReferenceFoodQuery(phrase);
    var rowRank = api.readRowRank(row);
    var names = [row.description].concat(row.also || []);
    var best = null;
    for (var n = 0; n < names.length; n++) {
      var key = rank(api.readReferenceFoodName(names[n]));
      for (var field in rowRank) key[field] = rowRank[field];
      if (!best || api.compareRelevance(key, best) < 0) best = key;
    }
    return best;
  }

  function render(query) {
    var trimmed = query.trim();
    if (!trimmed) {
      out.innerHTML = "";
      line.textContent = "Type something.";
      return;
    }

    var found = api.searchIndexRows(corpus, trimmed);
    var hits = found.hits;

    if (!hits.length) {
      out.innerHTML =
        '<p class="empty">No food found. The corpus holds ingredients as bought and not yet cooked, so a cooked dish, a brand or a packaged product will not be here &mdash; and neither will a word like <code>raw</code>, which no name carries any more.</p>';
      line.textContent = "0 rows";
      return;
    }

    // What the search RAN, which is the typed query unless it reached nothing
    // and the vocabulary offered other phrases (ADR-0049 §1).
    var rescued = hits.some(function (hit) {
      return hit.alias !== undefined;
    });
    line.textContent =
      hits.length +
      (hits.length === 1 ? " row" : " rows") +
      (hits.length >= CAP
        ? " \u2014 at the " +
          CAP +
          "-row cap, so there are more below it you cannot reach"
        : "") +
      (rescued
        ? " \u2014 the typed word reached nothing, so the vocabulary answered with: " +
          found.phrases.slice(1).join(", ")
        : "");

    out.innerHTML =
      hits
        .map(function (hit, at) {
          var row = byId[hit.row.fdcId] || hit.row;
          var phrase = hit.alias ? hit.alias : trimmed;
          var key = keysFor(
            row,
            found.phrases.length > 1 ? found.phrases[1] : trimmed
          );
          var kcal = row.macros && row.macros.calories;
          var columns = COLUMNS.map(function (pair) {
            var value = key[pair[0]];
            return (
              "<b><i>" +
              pair[1] +
              "</i> " +
              (value === undefined ? "\u2013" : Math.round(value * 100) / 100) +
              "</b>"
            );
          }).join("");
          return (
            '<div class="hit" data-rank="' +
            at +
            '">' +
            '<div class="hitname">' +
            esc(row.description) +
            "</div>" +
            '<div class="hitkcal">' +
            (kcal == null ? "\u2014" : Math.round(kcal) + " kcal") +
            "</div>" +
            (hit.alias
              ? '<div class="hitalias">reached as \u201c' +
                esc(hit.alias) +
                "\u201d</div>"
              : "") +
            '<div class="hitkeys">' +
            columns +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      (hits.length >= CAP
        ? '<p class="cutline">the page cap &mdash; everything below this is unreachable by typing this word</p>'
        : "");
  }

  box.addEventListener("input", function () {
    render(box.value);
  });
  Array.prototype.forEach.call(
    document.querySelectorAll("#presets button"),
    function (button) {
      button.addEventListener("click", function () {
        box.value = button.dataset.q;
        render(box.value);
        box.focus();
      });
    }
  );
  render(box.value);
})();
