/* =========================================================
   메인 안내 팝업
   - END_DATE 가 지나면 자동으로 안 뜬다 (날짜만 바꾸면 재사용 가능)
   - "오늘 하루 보지 않기" 체크 후 닫으면 그날은 안 뜬다
   ========================================================= */
(function () {
  var END_DATE = new Date('2026-12-01T00:00:00+09:00'); // 11월 30일까지 노출
  var KEY = 'npop-gaepo-hide-until';

  var pop = document.getElementById('notice-popup');
  if (!pop || new Date() >= END_DATE) return;

  try {
    var until = Number(localStorage.getItem(KEY) || 0);
    if (until && Date.now() < until) return;
  } catch (e) { /* 저장소를 못 쓰면 그냥 띄운다 */ }

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
