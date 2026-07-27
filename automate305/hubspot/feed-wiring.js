/**
 * Automate305 prospect feed wiring.
 *
 * Injected into automate305_hvac_prospect_feed_v2.html by patch-feed.mjs.
 * Talks to the local bridge (automate305/hubspot/bridge.mjs) on 127.0.0.1:4305.
 * No API keys live in this file or anywhere else in the HTML.
 */
(function () {
  'use strict';

  var BRIDGE = 'http://127.0.0.1:4305';
  var GREEN = '#16a34a';
  var AMBER = '#f59e0b';
  var RED = '#dc2626';

  // -------------------------------------------------------------- utilities

  function post(path, body) {
    return fetch(BRIDGE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  }

  function get(path) {
    return fetch(BRIDGE + path).then(function (r) { return r.json(); });
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, HEAD: 1 };

  /**
   * Finds the smallest element whose text matches, so we recolor the status pill
   * rather than its container. Script and style elements are skipped: this very
   * file contains the indicator strings as literals and would otherwise match itself.
   */
  function findIndicator(pattern) {
    var nodes = document.querySelectorAll('body *');
    var best = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (SKIP_TAGS[el.tagName]) continue;
      if (el.closest && el.closest('script, style, template')) continue;
      var text = el.textContent || '';
      if (text.length > 200) continue; // a wrapper, not the pill itself
      if (!pattern.test(text)) continue;
      if (!best || text.length < (best.textContent || '').length) best = el;
    }
    return best;
  }

  function setIndicator(el, text, color) {
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
    el.style.borderColor = color;
    el.setAttribute('data-a305-state', color === GREEN ? 'connected' : 'pending');

    // Recolor an adjacent status dot: an element sibling with no text of its own.
    var dot = el.previousElementSibling;
    if (dot && !(dot.textContent || '').trim() && !dot.querySelector('*')) {
      dot.style.background = color;
      dot.style.backgroundColor = color;
    }
  }

  var indicators = {
    hubspot: findIndicator(/HubSpot:/i),
    dbpr: findIndicator(/DBPR weekly feed:/i),
    clay: findIndicator(/Clay enrichment:/i),
  };

  // ---------------------------------------------------- prospect extraction

  /**
   * Reads prospects from window.PROSPECTS if the feed defines it, otherwise
   * scrapes the rendered table using its header labels.
   */
  function readProspects(onlySelected) {
    if (Array.isArray(window.PROSPECTS) && window.PROSPECTS.length) {
      return window.PROSPECTS.filter(function (p) {
        return !onlySelected || String(p.priority || '').toUpperCase() === 'HOT';
      });
    }

    var table = document.querySelector('table');
    if (!table) return [];

    var headers = [].map.call(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'), function (th) {
      return (th.textContent || '').trim().toLowerCase();
    });

    function col(row, names) {
      for (var n = 0; n < names.length; n++) {
        var idx = headers.findIndex(function (h) { return h.indexOf(names[n]) !== -1; });
        if (idx !== -1 && row.cells[idx]) return (row.cells[idx].textContent || '').trim();
      }
      return '';
    }

    var rows = [].slice.call(table.querySelectorAll('tbody tr'));
    if (!rows.length) rows = [].slice.call(table.querySelectorAll('tr')).slice(1);

    return rows
      .map(function (row, i) {
        var checkbox = row.querySelector('input[type="checkbox"]');
        var p = {
          _rowIndex: i,
          _row: row,
          _selected: checkbox ? checkbox.checked : false,
          company_name: col(row, ['company', 'business', 'name']),
          owner_name: col(row, ['owner', 'contact']),
          phone: col(row, ['phone', 'tel']),
          email: col(row, ['email']),
          area: col(row, ['area', 'city', 'location']),
          vertical: col(row, ['vertical', 'type']),
          priority: col(row, ['priority', 'temp']).toUpperCase(),
          rating: col(row, ['rating', 'stars', 'google']).replace(/[^0-9.]/g, ''),
          notes: col(row, ['note', 'comment']),
          status: col(row, ['status', 'outcome']),
        };
        return p;
      })
      .filter(function (p) {
        if (!p.company_name && !p.owner_name) return false;
        if (!onlySelected) return true;
        return p._selected || String(p.priority).toUpperCase() === 'HOT';
      });
  }

  function strip(list) {
    return list.map(function (p) {
      var out = {};
      for (var k in p) if (k.charAt(0) !== '_') out[k] = p[k];
      return out;
    });
  }

  // ----------------------------------------------------------------- status

  function setRowStatus(row, text, color) {
    if (!row) return;
    var cell = row.querySelector('[data-a305-enrich]');
    if (!cell) {
      cell = document.createElement('td');
      cell.setAttribute('data-a305-enrich', '1');
      row.appendChild(cell);
    }
    cell.textContent = text;
    cell.style.color = color;
    cell.style.fontWeight = '600';
  }

  // ------------------------------------------------------------- push flow

  var counter = null;

  function ensureCounter(button) {
    if (counter) return counter;
    counter = document.createElement('span');
    counter.id = 'a305-push-counter';
    counter.style.marginLeft = '10px';
    counter.style.fontSize = '13px';
    counter.style.fontWeight = '600';
    if (button && button.parentNode) button.parentNode.insertBefore(counter, button.nextSibling);
    else document.body.appendChild(counter);
    return counter;
  }

  function pushToHubSpot(button) {
    var prospects = strip(readProspects(false));
    var c = ensureCounter(button);

    if (!prospects.length) {
      c.textContent = 'No prospects found on the page.';
      c.style.color = RED;
      return;
    }

    c.textContent = 'Pushing ' + prospects.length + ' to HubSpot…';
    c.style.color = AMBER;
    if (button) button.disabled = true;

    post('/push', { prospects: prospects })
      .then(function (res) {
        if (button) button.disabled = false;
        if (!res.summary) {
          c.textContent = 'Push failed: ' + (res.error || 'unknown error');
          c.style.color = RED;
          return;
        }
        var s = res.summary;
        c.textContent =
          s.contactsCreated + ' created / ' + s.contactsUpdated + ' updated · ' +
          (s.companiesCreated + s.companiesUpdated) + ' companies · ' +
          s.notesCreated + ' notes' + (s.failed ? ' · ' + s.failed + ' failed' : '');
        c.style.color = s.failed ? AMBER : GREEN;
        if (s.errors && s.errors.length) console.warn('[automate305] push errors', s.errors);
      })
      .catch(function (err) {
        if (button) button.disabled = false;
        c.textContent = 'Bridge unreachable — is bridge.mjs running?';
        c.style.color = RED;
        console.error('[automate305]', err);
      });
  }

  // ---------------------------------------------------------- clay enrich

  function enrichSelected(button) {
    var hot = readProspects(true).filter(function (p) { return !p.email; });
    var c = ensureCounter(button);

    if (!hot.length) {
      c.textContent = 'No HOT leads missing an email.';
      c.style.color = AMBER;
      return;
    }

    hot.forEach(function (p) { setRowStatus(p._row, 'Pending', AMBER); });
    c.textContent = 'Queued ' + hot.length + ' for Clay…';
    c.style.color = AMBER;

    post('/enrich-queue', { prospects: strip(hot) })
      .then(function () { return get('/enriched'); })
      .then(function (res) {
        var emails = (res && res.emails) || {};
        var hits = 0;
        hot.forEach(function (p) {
          var key = (p.company_name + '|' + p.owner_name).toLowerCase();
          var email = emails[key] || emails[(p.owner_name || '').toLowerCase()];
          if (email) {
            hits++;
            setRowStatus(p._row, 'Enriched', GREEN);
            p.email = email;
          } else {
            setRowStatus(p._row, 'Not Found', AMBER);
          }
        });
        c.textContent = hits + ' of ' + hot.length + ' enriched. Run clay/enrich.mjs to process the rest.';
        c.style.color = hits ? GREEN : AMBER;
      })
      .catch(function () {
        c.textContent = 'Bridge unreachable — is bridge.mjs running?';
        c.style.color = RED;
      });
  }

  // ------------------------------------------------------------- bootstrap

  function findButton(pattern) {
    var candidates = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
    for (var i = 0; i < candidates.length; i++) {
      var label = candidates[i].textContent || candidates[i].value || '';
      if (pattern.test(label)) return candidates[i];
    }
    return null;
  }

  function addEnrichButton(anchor) {
    if (document.getElementById('a305-enrich-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'a305-enrich-btn';
    btn.type = 'button';
    btn.textContent = 'Enrich Selected';
    btn.style.cssText =
      'margin-left:8px;padding:8px 14px;border-radius:8px;border:1px solid ' + GREEN +
      ';background:' + GREEN + ';color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', function () { enrichSelected(btn); });
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else document.body.insertBefore(btn, document.body.firstChild);
  }

  function boot() {
    var exportBtn = findButton(/export.*hubspot|hubspot.*csv/i);
    if (exportBtn) {
      exportBtn.textContent = 'Push to HubSpot';
      var fresh = exportBtn.cloneNode(true); // drops the old CSV download handler
      exportBtn.parentNode.replaceChild(fresh, exportBtn);
      fresh.addEventListener('click', function (e) {
        e.preventDefault();
        pushToHubSpot(fresh);
      });
      exportBtn = fresh;
    }
    addEnrichButton(exportBtn);

    // Live health check drives the three indicators.
    get('/health')
      .then(function (res) {
        if (res.ok) {
          setIndicator(indicators.hubspot, 'HubSpot: connected', GREEN);
          setIndicator(indicators.clay, 'Clay enrichment: connected', GREEN);
        } else {
          setIndicator(indicators.hubspot, 'HubSpot: ' + (res.message || 'not connected'), AMBER);
        }
      })
      .catch(function () {
        setIndicator(indicators.hubspot, 'HubSpot: bridge offline — run bridge.mjs', AMBER);
      });

    // DBPR freshness comes from the launchd job's stamp file, served by the bridge.
    get('/dbpr-status')
      .then(function (res) {
        if (res.ok && res.lastRun) {
          setIndicator(
            indicators.dbpr,
            'DBPR weekly feed: connected — last updated ' + res.lastRun +
              (res.rows ? ' (' + res.rows + ' leads)' : ''),
            GREEN,
          );
        } else if (res.error) {
          setIndicator(indicators.dbpr, 'DBPR weekly feed: last run failed — ' + res.error, AMBER);
        } else {
          setIndicator(indicators.dbpr, 'DBPR weekly feed: scheduled, awaiting first run', AMBER);
        }
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
