/* =========================================================
   종부세 계산기 — 지역 판정 · 집 종류별 요건 판정
   - 시·도 / 시·군·구만 고르면 수도권·광역시·인구감소지역 여부를 자동으로 본다.
   - 기준이 바뀌면 아래 LIMITS(금액·기간)와 목록만 고치면 된다.
   - 인구감소지역 89곳·인구감소관심지역 18곳은 행정안전부 2021.10. 지정 기준
     (군위군은 2023.7. 대구 편입 반영).
   ========================================================= */
(function (root) {
  var EOK = 100000000;

  var LIMITS = {
    ruralPrice: 4 * EOK,            // 지방 저가주택: 공시가격 4억 이하
    secondHomeDecline: 9 * EOK,     // 세컨드홈: 비수도권 인구감소지역 9억 이하
    secondHomeBorder: 4 * EOK,      // 세컨드홈: 수도권 접경 인구감소지역 4억 이하
    secondHomeWatch: 4 * EOK,       // 세컨드홈: 비수도권 인구감소관심지역 4억 이하
    secondHomeFrom: '2024.1.4.', secondHomeTo: '2026.12.31.',
    inheritYears: 5,                // 상속주택: 상속개시 후 5년
    inheritShare: 0.40,             // 상속주택: 지분 40% 이하
    inheritCapital: 6 * EOK,        // 상속주택: 지분 공시가격 수도권 6억 이하
    inheritLocal: 3 * EOK           // 상속주택: 지분 공시가격 수도권 밖 3억 이하
  };

  /* 시·도별 시·군·구 */
  var SIGUNGU = {
    '서울특별시': '종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구',
    '부산광역시': '중구 서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 강서구 연제구 수영구 사상구 기장군',
    '대구광역시': '중구 동구 서구 남구 북구 수성구 달서구 달성군 군위군',
    '인천광역시': '중구 동구 미추홀구 연수구 남동구 부평구 계양구 서구 강화군 옹진군',
    '광주광역시': '동구 서구 남구 북구 광산구',
    '대전광역시': '동구 중구 서구 유성구 대덕구',
    '울산광역시': '중구 남구 동구 북구 울주군',
    '세종특별자치시': '세종시(동 지역) 세종시(읍·면 지역)',
    '경기도': '수원시 성남시 의정부시 안양시 부천시 광명시 평택시 동두천시 안산시 고양시 과천시 구리시 남양주시 오산시 시흥시 군포시 의왕시 하남시 용인시 파주시 이천시 안성시 김포시 화성시 광주시 양주시 포천시 여주시 연천군 가평군 양평군',
    '강원특별자치도': '춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군',
    '충청북도': '청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군',
    '충청남도': '천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군 예산군 태안군',
    '전북특별자치도': '전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군 부안군',
    '전라남도': '목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군',
    '경상북도': '포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군',
    '경상남도': '창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 고성군 남해군 하동군 산청군 함양군 거창군 합천군',
    '제주특별자치도': '제주시 서귀포시'
  };
  Object.keys(SIGUNGU).forEach(function (k) { SIGUNGU[k] = SIGUNGU[k].split(' '); });

  /* 인구감소지역 89곳 */
  var DECLINE = {
    '부산광역시': '동구 서구 영도구',
    '대구광역시': '남구 서구 군위군',
    '인천광역시': '강화군 옹진군',
    '경기도': '가평군 연천군',
    '강원특별자치도': '고성군 삼척시 양구군 양양군 영월군 정선군 철원군 태백시 평창군 홍천군 화천군 횡성군',
    '충청북도': '괴산군 단양군 보은군 영동군 옥천군 제천시',
    '충청남도': '공주시 금산군 논산시 보령시 부여군 서천군 예산군 청양군 태안군',
    '전북특별자치도': '고창군 김제시 남원시 무주군 부안군 순창군 임실군 장수군 정읍시 진안군',
    '전라남도': '강진군 고흥군 곡성군 구례군 담양군 보성군 신안군 영광군 영암군 완도군 장성군 장흥군 진도군 함평군 해남군 화순군',
    '경상북도': '고령군 문경시 봉화군 상주시 성주군 안동시 영덕군 영양군 영주시 영천시 울릉군 울진군 의성군 청도군 청송군',
    '경상남도': '거창군 고성군 남해군 밀양시 산청군 의령군 창녕군 하동군 함안군 함양군 합천군'
  };
  /* 인구감소관심지역 18곳 */
  var WATCH = {
    '부산광역시': '금정구 중구', '인천광역시': '동구', '광주광역시': '동구', '대전광역시': '대덕구 동구 중구',
    '경기도': '동두천시 포천시', '강원특별자치도': '강릉시 동해시 속초시 인제군', '전북특별자치도': '익산시',
    '경상북도': '경주시 김천시', '경상남도': '사천시 통영시'
  };
  /* 수도권 안의 접경 인구감소지역 (지방 저가주택·세컨드홈에서 예외적으로 인정) */
  var BORDER = { '인천광역시': '강화군 옹진군', '경기도': '연천군' };

  function inList(map, sido, sgg) { return !!map[sido] && (' ' + map[sido] + ' ').indexOf(' ' + sgg + ' ') >= 0; }

  /* 시·도, 시·군·구 → 지역 성격 */
  function region(sido, sgg) {
    var capital = sido === '서울특별시' || sido === '인천광역시' || sido === '경기도';
    var metro = /광역시$/.test(sido);
    var sejong = sido === '세종특별자치시';
    return {
      sido: sido, sgg: sgg, known: !!(sido && sgg),
      capital: capital, metro: metro, sejong: sejong,
      gun: /군$/.test(sgg || ''),
      sejongRural: sejong && /읍·면/.test(sgg || ''),
      decline: inList(DECLINE, sido, sgg),
      watch: inList(WATCH, sido, sgg),
      border: inList(BORDER, sido, sgg)
    };
  }

  /* 지방 저가주택이 될 수 있는 지역인가 */
  function ruralArea(r) {
    if (r.border) return true;                       // 수도권 접경 인구감소지역
    if (r.capital) return false;                     // 그 밖의 수도권
    if (r.metro) return r.gun;                       // 광역시는 군 지역만
    if (r.sejong) return r.sejongRural;              // 세종시는 읍·면만
    return true;                                     // 그 밖의 지방
  }
  /* 세컨드홈(인구감소지역 주택) 가액 한도. 대상 지역이 아니면 0 */
  function secondHomeLimit(r) {
    if (r.decline && r.border) return LIMITS.secondHomeBorder;
    if (r.decline && !r.capital && (!r.metro || r.gun)) return LIMITS.secondHomeDecline;
    if (r.watch && !r.capital && !r.metro) return LIMITS.secondHomeWatch;
    return 0;
  }

  function won(n) {
    var e = Math.floor(n / EOK), m = Math.round((n % EOK) / 10000);
    return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원';
  }

  /* 집 한 채의 입력 → 계산에 쓸 종류로 판정
     h: { price, share, pick, sido, sgg, exclType, within5, after2024 }
        pick = 'normal' | 'excl' | 'inherit' | 'temp' | 'local'
     반환: { kind: 'normal'|'excl'|'inherit'|'temp'|'rural', ok, msg } */
  function classify(h) {
    var r = region(h.sido, h.sgg);
    var mine = (h.price || 0) * (h.share == null ? 1 : h.share);
    var where = r.known ? (r.sejong ? h.sgg : h.sido + ' ' + h.sgg) : '';

    if (h.pick === 'excl') {
      if (!h.exclType) return { kind: 'normal', ok: false, msg: '합산배제 주택 종류를 고르지 않아 일반 주택으로 계산합니다.' };
      return { kind: 'excl', ok: true, msg: '합산배제 주택 — 종부세 계산에서 빠집니다. (합산배제 신고를 한 경우)' };
    }
    if (h.pick === 'temp') {
      return { kind: 'temp', ok: true, msg: '이사용 새집 — 세금에는 더하고 주택 수에서는 뺍니다.' };
    }
    if (h.pick === 'inherit') {
      if (h.within5) return { kind: 'inherit', ok: true, msg: '상속주택 — 상속 후 5년 이내입니다.' };
      if ((h.share == null ? 1 : h.share) <= LIMITS.inheritShare) return { kind: 'inherit', ok: true, msg: '상속주택 — 지분이 40% 이하입니다. (기간 제한 없음)' };
      if (!r.known) return { kind: 'normal', ok: false, msg: '상속 5년이 지났고 지분이 40%를 넘습니다. 주소를 고르면 공시가격 기준(수도권 6억·그 밖 3억)을 확인해 드립니다. 지금은 일반 주택으로 계산합니다.' };
      var lim = r.capital ? LIMITS.inheritCapital : LIMITS.inheritLocal;
      if (mine <= lim) return { kind: 'inherit', ok: true, msg: '상속주택 — 지분 공시가격(' + won(mine) + ')이 ' + (r.capital ? '수도권 6억' : '수도권 밖 3억') + ' 이하입니다. (기간 제한 없음)' };
      return { kind: 'normal', ok: false, msg: '상속 5년이 지났고, 지분 40% 초과·지분 공시가격 한도(' + won(lim) + ') 초과라 상속주택 특례 대상이 아닙니다. 일반 주택으로 계산합니다.' };
    }
    if (h.pick === 'local') {
      if (!r.known) return { kind: 'normal', ok: false, msg: '주소(시·도, 시·군·구)를 고르면 자동으로 판정합니다. 지금은 일반 주택으로 계산합니다.' };
      if (ruralArea(r) && h.price <= LIMITS.ruralPrice) {
        return { kind: 'rural', ok: true, msg: '지방 저가주택 — ' + where + ', 공시가격 4억 이하입니다.' };
      }
      var sl = secondHomeLimit(r);
      if (sl && h.after2024 && h.price <= sl) {
        return { kind: 'rural', ok: true, msg: '인구감소' + (r.decline ? '' : '관심') + '지역 세컨드홈 — ' + where + ', 공시가격 한도(' + won(sl) + ') 이내, ' + LIMITS.secondHomeFrom + ' 이후 취득입니다.' };
      }
      var why;
      if (sl && !h.after2024 && h.price <= sl) why = where + ' — 인구감소' + (r.decline ? '' : '관심') + '지역이지만, ' + LIMITS.secondHomeFrom + ' 이후에 산 집만 세컨드홈 특례 대상입니다(공시가격 4억 초과).';
      else if (sl) why = where + ' — 인구감소' + (r.decline ? '' : '관심') + '지역이지만 공시가격이 한도(' + won(sl) + ')를 넘습니다.';
      else if (ruralArea(r)) why = where + ' — 대상 지역이지만 공시가격이 4억을 넘습니다.';
      else why = where + ' — 지방 저가주택·세컨드홈 대상 지역이 아닙니다(수도권, 광역시의 구, 세종시 동 지역은 제외).';
      return { kind: 'normal', ok: false, msg: why + ' 일반 주택으로 계산합니다.' };
    }
    return { kind: 'normal', ok: true, msg: '' };
  }

  var api = { LIMITS: LIMITS, SIGUNGU: SIGUNGU, DECLINE: DECLINE, WATCH: WATCH, region: region,
              ruralArea: ruralArea, secondHomeLimit: secondHomeLimit, classify: classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JongbuRegions = api;
})(typeof window !== 'undefined' ? window : this);
