# 매월 자동 세법 리서치 루틴 — 설정 스펙

이 파일은 `daehantax-monthly-tax-update` 예약 작업(Claude Code Scheduled Task)의 원본 설정입니다.

**중요한 구조**: 각 PC에 실제로 등록되는 예약 작업의 프롬프트는 짧은 "래퍼(wrapper)"이고,
그 래퍼가 실행될 때마다 이 문서 전체를 GitHub에서 다시 읽어와서 그 안의 "리서치 지침" 섹션을
그대로 따르는 방식입니다. 즉 **이 문서를 고쳐서 커밋·푸시하기만 하면, 다음 실행부터 모든 PC에
자동으로 반영됩니다** — 각 PC에서 따로 손볼 필요 없습니다.

## 등록 정보

- **taskId**: `daehantax-monthly-tax-update`
- **description**: 매월 1일, 국세청·법령정보센터 등 공식 소스로 세법 변경사항을 리서치해 대한세무법인 사이트 콘텐츠 PR 생성
- **cronExpression**: `0 9 1 * *` (매월 1일 오전 9시, 로컬 시간 기준)

## 새 PC에 등록할 때 그대로 붙여넣을 요청 문구

새 PC(회사 PC 등)에서 Claude Code로 이 저장소를 열고, 아래 문구를 그대로 붙여넣어 요청하세요:

```
daehantax/daehantax-com 저장소의 automation/monthly-tax-update-routine.md 파일을 읽어줘.
그 문서의 "등록 정보"(taskId, description, cronExpression)로 예약 작업을 하나 만들어줘.
단, 예약 작업의 prompt는 문서 안의 "리서치 지침" 내용을 그대로 박아넣지 말고, 아래의
"예약 작업에 실제로 등록할 짧은 프롬프트" 섹션에 있는 내용을 그대로 사용해줘 — 그래야
실행될 때마다 이 문서의 최신 버전을 다시 읽어오는 방식으로 동작해.
```

이렇게 요청하면 Claude가 아래 "예약 작업에 실제로 등록할 짧은 프롬프트"를 그대로
`create_scheduled_task`에 사용해서 등록합니다.

## 예약 작업에 실제로 등록할 짧은 프롬프트 (각 PC의 로컬 SKILL.md에 저장되는 내용)

```
You are updating the content for a Korean tax accounting firm's website (대한세무법인, daehantax.com).

## Step 1 — always do this first
Get the repo `daehantax/daehantax-com` to the latest `master` state: if a local clone already exists
on this machine, `git checkout master && git pull origin master`; otherwise clone it fresh
(`git clone https://github.com/daehantax/daehantax-com.git`).

## Step 2 — read the authoritative instructions
Read `automation/monthly-tax-update-routine.md` from that freshly-updated repo. That file contains
the full, current instructions for this routine — what to research, source discipline rules, the
JSON schema to follow, branch/PR conventions, everything (see its "리서치 지침" section). It may have
been edited since this task was originally set up, so always treat whatever is currently in that file
as authoritative, not any prior memory of it.

## Step 3 — execute
Follow the instructions in that file's 리서치 지침 section exactly, start to finish. Do not push
directly to master and do not merge any PR yourself.

## Output
End with the short summary format specified in that file (either "변경사항 없음, PR 생성 안 함", or
the PR URL plus a one-line list of what was added).

If `automation/monthly-tax-update-routine.md` is missing from the repo for some reason, stop and
report that clearly instead of guessing at what to do.
```

## 중요 — 기기마다 따로 등록해야 하는 이유

Claude Code의 예약 작업은 **각 PC의 로컬 폴더**(`~/.claude/scheduled-tasks/`)에 저장되고,
**해당 PC에서 Claude Code 앱이 열려 있을 때만** 실행됩니다. 한 PC에 등록했다고 다른 PC에서
자동으로 실행되지 않으므로, 집 PC·회사 PC 양쪽에서 각각 이 루틴을 등록해야 양쪽 다 커버됩니다.
(두 PC 모두 등록해두면, 둘 중 아무 PC나 그 시각에 켜져 있으면 실행됩니다. 드물게 두 PC가 동시에
켜져 있으면 같은 내용으로 중복 PR이 생길 수 있는데, 그러면 하나만 병합하면 됩니다.)

## 리서치 지침 (실행될 때마다 이 섹션을 다시 읽어와 그대로 따름)

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

위의 "새 PC에 등록할 때 그대로 붙여넣을 요청 문구" 참고. (한 번만 하면 됨 — PC마다 1회 등록)

## 설정을 바꾸고 싶을 때 (등록 이후에는 이것만 하면 됨)

조사 범위·톤·PR 규칙 등을 바꾸고 싶으면, **이 문서의 "리서치 지침" 섹션만 수정해서 커밋·
푸시**하면 됩니다. 각 PC의 예약 작업은 실행될 때마다 이 문서를 다시 읽어오므로, 별도로
`update_scheduled_task`를 호출하거나 각 PC를 따로 손볼 필요가 없습니다.

(단, 실행 주기 자체(cronExpression, 예: "매월 1일" → "매주 월요일")를 바꾸고 싶을 때는
이 문서 수정만으로는 반영되지 않습니다 — 그건 각 PC에서 `update_scheduled_task`로 직접
바꿔야 합니다. 이 문서가 자동으로 다시 읽어오는 건 "무엇을, 어떻게" 부분이고, "언제"는
예약 작업 자체의 스케줄 설정이라 별개입니다.)
