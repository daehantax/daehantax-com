/* =========================================================
   주택분 종합부동산세 간이 계산 (개인 · 2026년 귀속)
   - 화면(jongbu/index.html)과 분리된 "순수 계산" 파일입니다.
   - 세법이 바뀌면 아래 RULES 숫자만 고치면 됩니다.
   - 세부담 상한, 재산세 세부담 상한에 따른 공제 조정,
     합산배제 임대주택, 법인은 계산하지 않습니다(간이 계산).
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
     o.ageRate, o.holdRate : 1세대 1주택자 세액공제율(해당 없으면 0) */
  function personTax(o) {
    var base = Math.max(0, o.pub - o.deduct) * RULES.fairRatio;
    var gross = progressive(base, o.three ? RULES.brackets3 : RULES.brackets2);
    // 공제할 재산세액 = 과세표준 × 재산세 공정시장가액비율 × 재산세 표준세율
    var propCredit = Math.min(gross, base * RULES.propFairRatio * RULES.propTopRate);
    var afterProp = gross - propCredit;
    var creditRate = Math.min(RULES.creditCap, (o.ageRate || 0) + (o.holdRate || 0));
    var credit = afterProp * creditRate;
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
           'multi'  (2주택 이상 등 — 본인 명의 기준)
     price    : 이 집 전체 공시가격(원)
     share    : 이 집의 본인 지분(0~1) — couple, multi 에서 사용
     other    : 본인 명의 다른 주택의 공시가격 합계(원) — multi
     three    : 본인 명의 주택이 3채 이상 — multi
     age, hold: RULES.ageRates / holdRates 의 키 */
  function compute(inp) {
    var ageRate = RULES.ageRates[inp.age] || 0;
    var holdRate = RULES.holdRates[inp.hold] || 0;
    var price = inp.price || 0;

    if (inp.mode === 'single') {
      return { mode: 'single', main: personTax({ pub: price, deduct: RULES.deductOneHouse, ageRate: ageRate, holdRate: holdRate }) };
    }

    if (inp.mode === 'couple') {
      var share = inp.share == null ? 0.5 : inp.share;
      var me = personTax({ pub: price * share, deduct: RULES.deductGeneral });
      var spouse = personTax({ pub: price * (1 - share), deduct: RULES.deductGeneral });
      var special = personTax({ pub: price, deduct: RULES.deductOneHouse, ageRate: ageRate, holdRate: holdRate });
      var eachTotal = me.total + spouse.total;
      return {
        mode: 'couple', me: me, spouse: spouse, eachTotal: eachTotal, special: special,
        better: special.total < eachTotal ? 'special' : (special.total > eachTotal ? 'each' : 'same'),
        diff: Math.abs(special.total - eachTotal)
      };
    }

    var s = inp.share == null ? 1 : inp.share;
    return { mode: 'multi', main: personTax({ pub: price * s + (inp.other || 0), deduct: RULES.deductGeneral, three: !!inp.three }) };
  }

  var api = { RULES: RULES, compute: compute, personTax: personTax, progressive: progressive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JongbuCalc = api;
})(typeof window !== 'undefined' ? window : this);
