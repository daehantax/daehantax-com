# 매월 자동 세법 리서치 루틴 — 설정 스펙

이 파일은 `daehantax-monthly-tax-update` 예약 작업(Claude Code Scheduled Task)의 원본 설정입니다.
새 PC(회사 PC 등)에서 동일한 루틴을 등록하려면, 이 문서를 Claude Code에게 보여주고
"이 문서 내용대로 예약 작업을 만들어줘"라고 요청하면 됩니다.

## 등록 정보

- **taskId**: `daehantax-monthly-tax-update`
- **description**: 매월 1일, 국세청·법령정보센터 등 공식 소스로 세법 변경사항을 리서치해 대한세무법인 사이트 콘텐츠 PR 생성
- **cronExpression**: `0 9 1 * *` (매월 1일 오전 9시, 로컬 시간 기준)

## 중요 — 기기마다 따로 등록해야 하는 이유

Claude Code의 예약 작업은 **각 PC의 로컬 폴더**(`~/.claude/scheduled-tasks/`)에 저장되고,
**해당 PC에서 Claude Code 앱이 열려 있을 때만** 실행됩니다. 한 PC에 등록했다고 다른 PC에서
자동으로 실행되지 않으므로, 집 PC·회사 PC 양쪽에서 각각 이 루틴을 등록해야 양쪽 다 커버됩니다.
(두 PC 모두 등록해두면, 둘 중 아무 PC나 그 시각에 켜져 있으면 실행됩니다. 드물게 두 PC가 동시에
켜져 있으면 같은 내용으로 중복 PR이 생길 수 있는데, 그러면 하나만 병합하면 됩니다.)

## 프롬프트 (예약 작업 실행 시마다 그대로 수행할 내용)

```
You are updating the content for a Korean tax accounting firm's website (대한세무법인, daehantax.com).

Repo: GitHub `daehantax/daehantax-com`, default branch `master`. If a local clone doesn't already
exist on this machine, clone it first (e.g. `git clone https://github.com/daehantax/daehantax-com.git`
into a working directory) — otherwise use the existing local clone and run
`git checkout master && git pull origin master` to get the latest state. GitHub CLI (`gh`) must be
authenticated on this machine (an owner of the `daehantax` org) so PR creation against this org repo
works. If `gh` is not on PATH in a fresh shell, locate the installed binary (e.g. under
"Program Files\GitHub CLI\gh.exe" on Windows) or install it if missing.

## Objective
Research recent official Korean tax law changes and update two JSON content files with new/changed
factual items, then open a Pull Request for human review. Do NOT push directly to master and do NOT
merge anything yourself.

## Steps

1. Get the repo to the latest `master` state (clone or pull, as above).
2. Read `assets/data/tax-tips.json` and `assets/data/law-updates.json`. Note the most recent
   `verifiedDate` values already present — you're looking for what's changed or been newly announced
   since then.
3. Research using WebSearch/WebFetch. Cover these topic areas at minimum: 부가가치세(간이과세 기준·
   배제고시), 종합소득세·성실신고확인 기준, 상속·증여세(공제 한도, 유산취득세 개편 진행상황 — check
   https://www.moleg.go.kr and news for whether it has passed the National Assembly), 노란우산공제
   변경사항, 연말정산·소득공제 항목 변경, 그리고 그 해의 정부 세제개편안 발표/입법예고/국회 심의
   진행 상황 (기획재정부 통상 7월 말 발표, 12월 국회 확정 패턴을 참고해 현재 어느 단계인지 확인).
4. **Source discipline (critical):** treat ONLY these domains as authoritative for any specific
   number, threshold, date, or legal status: `nts.go.kr` (국세청), `law.go.kr` (국가법령정보센터),
   `moef.go.kr` / `mofe.go.kr` (기획재정부), `moleg.go.kr` (법제처). You may use news articles or
   blogs to discover that something changed, but before writing any specific figure or date into the
   site content, confirm it via WebFetch on one of the domains above. If you cannot confirm a figure
   against an official source, do not include that specific figure — describe the topic more
   generally and note that confirmation is pending.
5. For each genuinely new or materially changed fact, add a new JSON entry (do not
   duplicate/replace existing historical entries) to the appropriate file —
   `assets/data/tax-tips.json` for practical taxpayer-facing savings tips (category `"절세정보"`),
   `assets/data/law-updates.json` for legislative/regulatory changes and schedules (category
   `"세법개정"`). Match this exact schema per entry:
   ```json
   {
     "title": "...",
     "date": "YYYY-MM-DD",
     "category": "절세정보" | "세법개정",
     "summary": "1-2 sentence summary, plain language",
     "body": "2-3 paragraph explanation, \n\n between paragraphs",
     "source": [{ "label": "기관명 — 페이지 설명", "url": "https://..." }],
     "verifiedDate": "today's date, YYYY-MM-DD",
     "verificationNote": "optional — only include if something wasn't directly confirmed via a .go.kr fetch, or is not yet finalized law"
   }
   ```
   Match the tone of existing entries: plain, reassuring, never alarmist, never fabricate precise
   figures, explicitly say "확정된 내용이 아닙니다" / "상담을 통해 확인하세요" for anything not
   finalized or that depends on the client's specific situation. Look at the existing entries in both
   files first to match voice and formatting exactly.
6. If, after genuine research, nothing new or materially changed is found since the last
   `verifiedDate`, stop here — do not create a branch or PR. This is a normal, expected outcome most
   months; do not force content just to have something to show.
7. If there is new content: create a new branch named `tax-update-YYYY-MM` (using the current
   year-month), commit the JSON changes to it with a clear commit message, and push the branch:
   `git push -u origin tax-update-YYYY-MM`.
8. Open a Pull Request against `daehantax/daehantax-com` `master` using
   `gh pr create --repo daehantax/daehantax-com --base master --head tax-update-YYYY-MM`. Write the
   PR title and body in Korean. The body must list, for each new entry: what it says, why it was
   added, and the exact source URL(s) used to confirm it — so the site owner (이석제 대표세무사 /
   임성진 세무사 / ghlee) can review the actual figures before merging. Explicitly state in the PR
   body that this was generated by automated research and needs human fact-check before merging.
9. Do not merge the PR. Do not push anything further to `master`. Your job ends once the PR is
   opened (or once you've determined no update is needed).

## Output
End your run with a short summary: either "변경사항 없음, PR 생성 안 함" or the PR URL plus a
one-line list of what was added.
```

## 다른 PC에 등록하는 방법

1. 그 PC에서 Claude Code로 이 저장소(`daehantax/daehantax-com`)를 열거나 클론한다.
2. Claude에게 다음과 같이 요청한다: "automation/monthly-tax-update-routine.md 파일 읽고,
   여기 적힌 대로 동일한 예약 작업(taskId, description, cron, prompt 그대로)을 만들어줘."
3. Claude가 이 문서의 taskId·description·cronExpression·prompt를 그대로 사용해
   `create_scheduled_task`를 호출하면 끝.

## 설정을 바꾸고 싶을 때

주기나 조사 범위를 바꾸고 싶으면, 이 문서를 먼저 수정해서 커밋·푸시한 뒤, 각 PC에서
`update_scheduled_task`로 반영하는 것을 권장합니다 (이 문서가 항상 최신 기준이 되도록).
