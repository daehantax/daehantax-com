/* =========================================================
   메인 안내 팝업 — 공지 여러 개를 탭으로 보여준다
   - 공지(패널)마다 data-npop-end 날짜가 지나면 그 공지만 자동으로 빠진다
     (날짜만 바꾸면 재사용 가능)
   - 남은 공지가 하나면 탭 줄을 숨기고, 하나도 없으면 팝업을 띄우지 않는다
   - "오늘 하루 보지 않기" 체크 후 닫으면 그날은 안 뜬다
   ========================================================= */
(function () {
  var KEY = 'npop-gaepo-hide-until';

  var pop = document.getElementById('notice-popup');
  if (!pop) return;

  // 노출 기간이 끝난 공지는 탭과 함께 지운다
  var now = new Date();
  var panels = [];
  pop.querySelectorAll('[data-npop-panel]').forEach(function (panel) {
    var end = new Date(panel.getAttribute('data-npop-end'));
    var tab = pop.querySelector('[data-npop-tab="' + panel.getAttribute('data-npop-panel') + '"]');
    if (now >= end) {
      panel.remove();
      if (tab) tab.remove();
    } else {
      panels.push({ panel: panel, tab: tab });
    }
  });
  if (!panels.length) return;

  try {
    var until = Number(localStorage.getItem(KEY) || 0);
    if (until && Date.now() < until) return;
  } catch (e) { /* 저장소를 못 쓰면 그냥 띄운다 */ }

  function show(target) {
    panels.forEach(function (p) {
      var on = p === target;
      p.panel.hidden = !on;
      if (p.tab) {
        p.tab.classList.toggle('is-on', on);
        p.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    });
  }
  panels.forEach(function (p) {
    if (p.tab) p.tab.addEventListener('click', function () { show(p); });
  });
  var tabs = pop.querySelector('.npop__tabs');
  if (tabs && panels.length < 2) tabs.hidden = true;
  show(panels[0]);

  function close() {
    var today = document.getElementById('npop-today');
    if (today && today.checked) {
      var t = new Date(); t.setHours(24, 0, 0, 0); // 오늘 자정까지
      try { localStorage.setItem(KEY, String(t.getTime())); } catch (e) {}
    }
    pop.hidden = true;
    document.body.classList.remove('npop-open');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  pop.querySelectorAll('[data-npop-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', onKey);

  pop.hidden = false;
  document.body.classList.add('npop-open');
  pop.querySelector('.npop__close').focus();
})();
