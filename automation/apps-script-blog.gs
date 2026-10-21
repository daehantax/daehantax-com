/**
 * 블로그 글 하단 문의 → 「체납 자가진단 접수명단」 시트의 탭 「블로그 문의」
 * ------------------------------------------------------------------
 * 홈페이지(daehantax.com) 글마다 붙은 「문의 남기기」 폼이 보내는 접수(form: "blog")를
 * 별도 탭에 모읍니다. 이 코드를 붙이기 전에도 접수는 탭 「접수명단」 으로 들어오니
 * 급하지는 않습니다(체납세목 칸 = "블로그 문의", 현재상황 칸 = 문의 내용).
 *
 * [붙이는 방법 — 한 번만, 5분]
 *  1. 구글 시트 「체납 자가진단 접수명단」 → 확장 프로그램 → Apps Script
 *  2. doPost 함수 안, 아래 줄 바로 밑에 (시트에 v7 이 아직 배포 안 됐으면 이 줄이 없습니다 →
 *     그 위 줄 if (d.form === 'inherit-file') … 바로 밑에)
 *        if (d.form === 'inherit-review') return reviewSave(ss, d);
 *     이 한 줄을 추가합니다.
 *        if (d.form === 'blog') return blogIntake(ss, d);           // ── 홈페이지 블로그 글 문의
 *  3. 이 파일의 아래 코드(BLOG_SHEET 부터 끝까지)를 Code.gs 맨 아래에 붙여 넣고 저장
 *  4. 배포 → 배포 관리 → 연필(수정) → 버전 "새 버전" → 배포   (웹 앱 주소는 그대로)
 *  5. 편집기에서 testBlog 를 한 번 실행 → 탭 「블로그 문의」 가 생기면 완료 (시험 줄은 지우셔도 됩니다)
 *
 * (원본 Code.gs 는 daehantax/inherit 저장소 _dev/apps-script/Code.gs 에도 있습니다.
 *  거기에도 같은 두 군데를 반영해 두시면 다음에 전체 교체할 때 빠지지 않습니다.)
 */

const BLOG_SHEET = '블로그 문의';
const BLOG_NOTIFY = '';   // 접수 알림 메일 (비워 두면 안 보냄). 예: 'sjlee@taxdh.net'
const BLOG_HEADERS = ['접수일시', '이름', '휴대폰', '문의 내용', '글 제목', '분류', '글 주소', '유입경로', '연락여부', '메모'];

function blogIntake(ss, d) {
  const s = v => String(v == null ? '' : v).slice(0, 500).replace(/^[=+\-@]/, "'$&");   // 수식 주입 방지
  let sh = ss.getSheetByName(BLOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BLOG_SHEET);
    sh.appendRow(BLOG_HEADERS);
    sh.getRange(1, 1, 1, BLOG_HEADERS.length).setFontWeight('bold').setBackground('#e8ecf6');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150); sh.setColumnWidth(3, 120); sh.setColumnWidth(4, 420); sh.setColumnWidth(5, 280);
  }
  const url = String(d.url || '').replace(/"/g, '');
  sh.appendRow([new Date(), s(d.name), "'" + s(d.phone), s(d.question), s(d.post), s(d.category),
                /^https:\/\/(www\.)?daehantax\.com\//.test(url) ? '=HYPERLINK("' + url + '";"글 열기")' : s(url),
                s(d.source), '', '']);
  if (BLOG_NOTIFY) {
    MailApp.sendEmail(BLOG_NOTIFY, '[블로그 문의] ' + s(d.name) + ' - ' + s(d.post),
      '이름: ' + s(d.name) + '\n휴대폰: ' + s(d.phone) + '\n글: ' + s(d.post) + '\n' + url +
      '\n\n문의 내용:\n' + s(d.question));
  }
  return ContentService.createTextOutput('OK');
}

/** 편집기에서 한 번 실행 — 「블로그 문의」 탭 생성 확인용 */
function testBlog() {
  blogIntake(SpreadsheetApp.getActiveSpreadsheet(), {
    form: 'blog', name: '테스트', phone: '010-0000-0000', question: '시험 문의입니다',
    post: '시험 글', category: '영상해설', url: 'https://daehantax.com/post/test.html', source: '블로그 test'
  });
}
