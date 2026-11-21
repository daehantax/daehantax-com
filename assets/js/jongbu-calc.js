/* =========================================================
   주택분 종합부동산세 간이 계산 (개인 · 2026년 귀속)
   - 화면(jongbu/index.html)과 분리된 "순수 계산" 파일입니다.
   - 세법이 바뀌면 아래 RULES 숫자만 고치면 됩니다.
   - 세부담 상한, 재산세 세부담 상한에 따른 공제 조정,
     법인은 계산하지 않습니다(간이 계산).
   - 합산배제·상속주택 등은 "요건을 갖췄다"고 고른 대로 계산합니다.
   ========================================================= */
(function (root) {
  var EOK = 100000000; // 1억원

  var RULES = {
    year: 2026,
    fairRatio: 0.60,            // 종부세 공정시장가액비율
    deductGeneral: 9 * EOK,     // 기본공제(일반)
    deductOneHouse: 12 * EOK,   // 기본공제(1세대 1주택자)
    propFairRatio: 0.60,        // 재산세 공정시장가액비율(주택)
    propTopRate: 0.004,         // 재산세 표준세율(최고구간) — 공제할 재산세액 계산용
    ruralRate: 0.20,            // 농어촌특별세 = 종부세의 20%
    creditCap: 0.80,            // 고령자 + 장기보유 공제 합계 한도
    // [과세표준 상한, 세율] — 2주택 이하
    brackets2: [[3 * EOK, 0.005], [6 * EOK, 0.007], [12 * EOK, 0.010], [25 * EOK, 0.013],
                [50 * EOK, 0.015], [94 * EOK, 0.020], [Infinity, 0.027]],
    // 3주택 이상 (과세표준 12억 초과분부터 세율이 더 높음)
    brackets3: [[3 * EOK, 0.005], [6 * EOK, 0.007], [12 * EOK, 0.010], [25 * EOK, 0.020],
                [50 * EOK, 0.030], [94 * EOK, 0.040], [Infinity, 0.050]],
    ageRates:  { under60: 0, a60: 0.20, a65: 0.30, a70: 0.40 },   // 만 나이(6월 1일 기준)
    holdRates: { under5: 0, h5: 0.20, h10: 0.40, h15: 0.50 }      // 보유기간
  };

  function progressive(base, brackets) {
    var tax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var cap = brackets[i][0], rate = brackets[i][1];
      if (base <= prev) break;
      tax += (Math.min(base, cap) - prev) * rate;
      prev = cap;
    }
    return tax;
  }

  /* 한 사람(납세의무자 1명)의 주택분 종부세
     o.pub      : 그 사람 몫의 공시가격 합계(원)
     o.deduct   : 기본공제(원)
     o.three    : 3주택 이상 세율표 적용 여부
     o.ageRate, o.holdRate : 1세대 1주택자 세액공제율(해당 없으면 0)
     o.creditShare : 세액공제를 적용할 산출세액 비율(기본 1).
                     상속주택 등 특례로 1주택자가 된 경우, 그 추가 주택분 세액은
                     고령·장기보유 공제 대상이 아니므로 본래 1주택 비율만 넣는다. */
  function personTax(o) {
    var base = Math.max(0, o.pub - o.deduct) * RULES.fairRatio;
    var gross = progressive(base, o.three ? RULES.brackets3 : RULES.brackets2);
    // 공제할 재산세액 = 과세표준 × 재산세 공정시장가액비율 × 재산세 표준세율
    var propCredit = Math.min(gross, base * RULES.propFairRatio * RULES.propTopRate);
    var afterProp = gross - propCredit;
    var creditRate = Math.min(RULES.creditCap, (o.ageRate || 0) + (o.holdRate || 0));
    var credit = afterProp * (o.creditShare == null ? 1 : o.creditShare) * creditRate;
    var jongbu = Math.floor(afterProp - credit);
    var rural = Math.floor(jongbu * RULES.ruralRate);
    return {
      pub: o.pub, deduct: o.deduct, base: base, gross: Math.floor(gross),
      propCredit: Math.floor(propCredit), afterProp: Math.floor(afterProp),
      creditRate: creditRate, credit: Math.floor(credit),
      jongbu: jongbu, rural: rural, total: jongbu + rural
    };
  }

  /* 입력
     mode: 'single' (단독명의 1세대 1주택)
           'couple' (부부 공동명의 1세대 1주택)
           'multi'  (2주택 이상 — 본인 명의 기준)
     price    : 이 집 전체 공시가격(원)
     share    : 이 집의 본인 지분(0~1) — couple, multi 에서 사용
     houses   : 다른 주택 목록 [{ price, share, kind, owner }] — multi, couple
                (owner 는 couple 에서만 사용: 'me' | 'spouse')
                kind = 'normal'  일반 주택
                       'excl'    합산배제(등록임대·사원용·미분양 등) → 과세 제외
                       'inherit' 상속주택 특례 → 과세표준에는 합산, 주택 수에서는 제외
                       'temp'    일시적 2주택의 새집 → 위와 같음
                       'rural'   지방 저가주택 → 위와 같음
     age, hold: RULES.ageRates / holdRates 의 키 */
  function compute(inp) {
    var ageRate = RULES.ageRates[inp.age] || 0;
    var holdRate = RULES.holdRates[inp.hold] || 0;
    var price = inp.price || 0;

    if (inp.mode === 'single') {
      return { mode: 'single', main: personTax({ pub: price, deduct: RULES.deductOneHouse, ageRate: ageRate, holdRate: holdRate }) };
    }

    if (inp.mode === 'couple') {
      /* 부부 공동명의 1주택 (+ 부부 각자 명의의 다른 집)
         houses[].owner = 'me' | 'spouse'
         · 합산배제 주택은 빠진다.
         · 일반 주택이 하나라도 있으면 공동명의 특례는 받을 수 없다.
         · 상속주택·이사용 새집·지방 저가주택(특례주택)은 "세금 낼 분(납세의무자)"이
           가진 경우에만 특례가 유지된다. 납세의무자의 배우자가 다른 주택을 가지면 불가.
           2026.2.27. 시행령 개정으로 지분과 관계없이 납세의무자를 고를 수 있으므로,
           특례주택을 가진 사람을 납세의무자로 정한 것으로 보고 계산한다.
         · 따라서 특례주택이 부부 양쪽에 나뉘어 있으면 특례를 받을 수 없다. */
      var share = inp.share == null ? 0.5 : inp.share;
      var own = { me: { pub: 0, counted: 1, sp: 0 }, spouse: { pub: 0, counted: 1, sp: 0 } };
      var anyNormal = false, exclN = 0, spN = 0;
      (inp.houses || []).forEach(function (h) {
        var o = own[h.owner === 'spouse' ? 'spouse' : 'me'];
        var v = (h.price || 0) * (h.share == null ? 1 : h.share);
        if (h.kind === 'excl') { exclN++; return; }
        o.pub += v;
        if (h.kind === 'inherit' || h.kind === 'temp' || h.kind === 'rural') { o.sp += v; spN++; }
        else { o.counted++; anyNormal = true; }
      });
      // ① 각자 계산: 각자 9억 공제, 자기 명의 집을 모두 더한다
      var me = personTax({ pub: price * share + own.me.pub, deduct: RULES.deductGeneral, three: own.me.counted >= 3 });
      var spouse = personTax({ pub: price * (1 - share) + own.spouse.pub, deduct: RULES.deductGeneral, three: own.spouse.counted >= 3 });
      var eachTotal = me.total + spouse.total;
      var split = own.me.sp > 0 && own.spouse.sp > 0;
      var res = { mode: 'couple', me: me, spouse: spouse, eachTotal: eachTotal,
                  eligible: !anyNormal && !split, reason: anyNormal ? 'normal' : (split ? 'split' : ''),
                  others: (inp.houses || []).length, excl: exclN, specialN: spN };
      if (!res.eligible) { res.better = 'each'; res.diff = 0; return res; }
      // ② 공동명의 특례: 세금 낼 분 한 사람이 이 집 전체 + 본인 명의 특례주택을 합산해
      //    12억 공제로 계산한다. 고령·장기보유 공제는 이 집 몫의 세액에만 적용.
      var payer = own.spouse.sp > 0 ? 'spouse' : 'me';
      var tPub = price + own[payer].sp;
      var taxpayer = personTax({ pub: tPub, deduct: RULES.deductOneHouse, ageRate: ageRate, holdRate: holdRate,
                                 creditShare: tPub ? price / tPub : 1 });
      res.special = { taxpayer: taxpayer, total: taxpayer.total, creditRate: taxpayer.creditRate, payer: payer };
      res.better = taxpayer.total < eachTotal ? 'special' : (taxpayer.total > eachTotal ? 'each' : 'same');
      res.diff = Math.abs(taxpayer.total - eachTotal);
      return res;
    }

    /* ---- 2주택 이상 ---- */
    var mainPub = price * (inp.share == null ? 1 : inp.share);
    var pub = mainPub, counted = 1, excl = 0, exclPub = 0, special = 0, normalOthers = 0;
    (inp.houses || []).forEach(function (h) {
      var v = (h.price || 0) * (h.share == null ? 1 : h.share);
      if (h.kind === 'excl') { excl++; exclPub += v; return; }   // 합산배제: 아예 빠진다
      pub += v;
      if (h.kind === 'inherit' || h.kind === 'temp' || h.kind === 'rural') special++;
      else { normalOthers++; counted++; }                         // 일반 주택만 주택 수에 센다
    });
    var three = counted >= 3;
    var normal = personTax({ pub: pub, deduct: RULES.deductGeneral, three: three });
    var out = {
      mode: 'multi', total: 1 + (inp.houses || []).length, counted: counted, excl: excl, exclPub: exclPub,
      special: special, three: three, main: normal, eligible: false
    };
    // 일반 주택이 이 집 하나뿐이면(나머지는 합산배제·상속·일시적 2주택·지방 저가주택)
    // 1세대 1주택자 방식(12억 공제 + 세액공제)을 신청할 수 있다.
    if (normalOthers === 0 && (excl + special) > 0) {
      out.eligible = true;
      out.oneHouse = personTax({
        pub: pub, deduct: RULES.deductOneHouse, ageRate: ageRate, holdRate: holdRate,
        creditShare: pub ? mainPub / pub : 1
      });
      out.diff = normal.total - out.oneHouse.total;
    }
    return out;
  }

  var api = { RULES: RULES, compute: compute, personTax: personTax, progressive: progressive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JongbuCalc = api;
})(typeof window !== 'undefined' ? window : this);
