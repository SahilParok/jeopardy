import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Multi-user smoke test: drives a real server + real Chromium contexts (host
// + 2 players) through a full game — lobby, questions, teams, a full board
// (daily double, a steal, an "All wrong"), results, and restart — asserting
// state stays in sync across every context. Judging is by the host's buttons
// ("Team N correct" / "All wrong"), exactly as it is in a live game.
//
// Runs the production server (dist + Socket.IO) on port 3001, matching the
// VITE_SERVER_URL baked into the build by the local .env, with CLIENT_URL
// set to the same origin so the server's CORS allowlist admits it.
// Usage: npm run build && node e2e/smoke.js

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const TIMER_SECONDS = 30;

const log = (msg) => console.log(`[e2e] ${msg}`);

async function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok && (await res.json()).ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server never became healthy at ${url}`);
}

async function main() {
  log('starting server on :5173');
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), CLIENT_URL: BASE_URL },
    stdio: 'inherit'
  });
  server.on('error', (error) => {
    throw error;
  });

  let browser;
  try {
    await waitForHealth(BASE_URL);
    log('server healthy');

    browser = await chromium.launch();
    const hostCtx = await browser.newContext();
    const p2Ctx = await browser.newContext();
    const p3Ctx = await browser.newContext();
    const host = await hostCtx.newPage();
    const p2 = await p2Ctx.newPage();
    const p3 = await p3Ctx.newPage();
    const players = [host, p2, p3];

    await Promise.all(players.map((page) => page.goto(BASE_URL)));

    // --- create room (host) ---
    log('host creating room');
    const createCard = host.locator('.home-card').filter({ hasText: 'Create a Game' });
    await createCard.getByLabel('Your name').fill('Host');
    await createCard.getByLabel('Questions per player').fill('2');
    await createCard.getByLabel('Answer timer').selectOption(String(TIMER_SECONDS));
    const dailyDoubleBox = createCard.getByLabel('Enable Daily Double');
    if (!(await dailyDoubleBox.isChecked())) await dailyDoubleBox.check();
    await createCard.getByRole('button', { name: 'Create Game' }).click();
    await host.locator('.room-code').waitFor();
    const roomCode = (await host.locator('.room-code').textContent()).trim();
    assert.match(roomCode, /^[A-Z0-9]{4,8}$/, `room code looks wrong: "${roomCode}"`);
    log(`room created: ${roomCode}`);

    // --- join (2 players) ---
    for (const [page, name] of [[p2, 'Player Two'], [p3, 'Player Three']]) {
      const joinCard = page.locator('.home-card').filter({ hasText: 'Join a Game' });
      await joinCard.getByLabel('Room code').fill(roomCode);
      await joinCard.getByLabel('Your name').fill(name);
      await joinCard.getByRole('button', { name: 'Join Game' }).click();
    }
    await Promise.all(players.map((page) => page.locator('.room-code').waitFor()));
    log('both players joined, room state in sync');

    // --- submit questions (all three write their own board column) ---
    const submitQuestions = async (page, name) => {
      const cards = page.locator('.question-card');
      const count = await cards.count();
      for (let i = 0; i < count; i += 1) {
        const card = cards.nth(i);
        const value = await card.locator('select').inputValue();
        await card.locator('textarea').fill(`${name}'s clue for $${value}`);
        await card.locator('input').fill(`${name}-answer-${value}`);
      }
      await page.getByRole('button', { name: 'Submit My Questions' }).click();
    };
    await submitQuestions(host, 'Host');
    await submitQuestions(p2, 'Player Two');
    await submitQuestions(p3, 'Player Three');
    log('all questions submitted');

    // --- advance to team setup (host) ---
    const continueBtn = host.getByRole('button', { name: 'Continue to Team Setup' });
    await continueBtn.waitFor({ state: 'visible' });
    assert.equal(await continueBtn.isDisabled(), false, 'continue-to-team-setup should be enabled once everyone submitted');
    await continueBtn.click();
    await Promise.all(players.map((page) => page.getByRole('heading', { name: 'Team Setup' }).waitFor()));
    log('advanced to team setup, in sync across contexts');

    // --- shuffle teams (randomizer feature) + start ---
    await host.getByRole('button', { name: 'Shuffle Teams' }).click();
    const startBtn = host.getByRole('button', { name: 'Start Game' });
    await startBtn.waitFor();
    await startBtn.click();
    await Promise.all(players.map((page) => page.locator('.board-grid').waitFor()));
    log('game started, board visible in all contexts');

    const teamNames = await host.locator('.score-card .label').allTextContents();
    log(`teams: ${teamNames.join(', ')}`);

    const scoreOf = async (page, teamName) =>
      Number(
        (await page.locator('.score-card').filter({ hasText: teamName }).locator('.score-value').textContent()).replace('$', '')
      );

    const pickedBy = async (page) => {
      const text = await page.locator('.active-meta').locator('span').nth(1).textContent();
      return text.replace('Picked by:', '').trim();
    };

    const judge = (label) => host.getByRole('button', { name: label, exact: true });

    // a flash banner appears after every attempt outcome and overlays the
    // board, blocking the next cell click — dismiss it explicitly rather
    // than guess at its auto-fade timing
    const dismissFlash = async (page) => {
      // the app shows one banner at a time and only promotes the next queued
      // event once the current one is dismissed, so a single dismiss can
      // immediately reveal another (e.g. the steal cell's incorrect-then-
      // correct pair) — keep dismissing until none appear.
      const flash = page.locator('.result-flash').first();
      while (await flash.waitFor({ timeout: 1000 }).then(() => true).catch(() => false)) {
        await page.getByRole('button', { name: 'Dismiss' }).click();
        await flash.waitFor({ state: 'hidden' }).catch(() => {});
      }
    };

    // --- play every cell on the board ---
    const columns = host.locator('.board-column');
    const columnCount = await columns.count();
    let cellIndex = 0;
    let dailyDoubleSeen = false;

    for (let c = 0; c < columnCount; c += 1) {
      const column = columns.nth(c);
      const cellCount = await column.locator('.board-cell').count();

      for (let v = 0; v < cellCount; v += 1) {
        const cell = column.locator('.board-cell').nth(v);
        const value = (await cell.textContent()).replace('$', '').trim();
        const isLastCellOverall = c === columnCount - 1 && v === cellCount - 1;
        const isFirstCellOverall = cellIndex === 0;

        await cell.click();
        await Promise.all(players.map((page) => page.locator('.question-overlay').waitFor()));

        const isDailyDouble = await host.locator('.daily-double-pill').isVisible();
        if (isDailyDouble) dailyDoubleSeen = true;
        const multiplier = isDailyDouble ? 2 : 1;
        const picker = await pickedBy(host);

        if (isFirstCellOverall) {
          // Only the host judges: players see the question but never the buttons.
          for (const page of [p2, p3]) {
            assert.equal(await page.getByRole('button', { name: 'All wrong' }).count(), 0, 'a player can see the judge buttons');
          }
          // The other team gets it right: a steal, and it earns them the next pick.
          const thief = teamNames.find((name) => name !== picker);
          const scoreBefore = await scoreOf(host, thief);
          await judge(`${thief} correct`).click();
          await host.locator('.question-overlay').waitFor({ state: 'hidden' });
          assert.equal(
            (await scoreOf(host, thief)) - scoreBefore,
            Number(value) * multiplier,
            'the team marked correct did not receive the points'
          );
          // every context (not just the host) sees the scoring team take over the pick
          await Promise.all(
            players.map((page) => page.locator('.turn-indicator').filter({ hasText: thief }).waitFor({ timeout: 5000 }))
          );
          log(`steal confirmed: ${picker} picked, ${thief} got the points and the next pick`);
        } else if (cellIndex === 1) {
          // "All wrong": nobody scores, the answer is revealed, the pick moves to the next team.
          const scoresBefore = await Promise.all(teamNames.map((name) => scoreOf(host, name)));
          await judge('All wrong').click();
          await host.locator('.question-overlay').waitFor({ state: 'hidden' });
          const scoresAfter = await Promise.all(teamNames.map((name) => scoreOf(host, name)));
          assert.deepEqual(scoresAfter, scoresBefore, 'All wrong must not award any points');
          const headline = await host.locator('.result-flash-headline').textContent();
          assert.match(headline, /UNANSWERED/, `unexpected banner after All wrong: "${headline}"`);
          const nextPicker = teamNames.find((name) => name !== picker);
          const turn = await host.locator('.turn-indicator').textContent();
          assert.ok(turn.includes(nextPicker), `turn should move to ${nextPicker}, got "${turn}"`);
          log(`all wrong confirmed: no points, pick moved ${picker} -> ${nextPicker}`);
        } else {
          if (isLastCellOverall) {
            // The countdown is shown to the host (it only buzzes at zero, it never auto-judges).
            const countdown = await host.locator('.timer-count').textContent();
            assert.match(countdown, /^\d+s$|Time's up/, `unexpected timer text: "${countdown}"`);
          }
          await judge(`${picker} correct`).click();
          await host.locator('.question-overlay').waitFor({ state: 'hidden' });
        }

        await dismissFlash(host);
        cellIndex += 1;
      }
    }

    log(dailyDoubleSeen ? 'daily double was landed on and played' : 'daily double was not landed on this run (random placement)');

    // --- results, in sync across contexts ---
    await Promise.all(players.map((page) => page.locator('.results-screen').waitFor()));
    const heroTexts = await Promise.all(players.map((page) => page.locator('.results-hero h1').textContent()));
    assert.equal(heroTexts[0], heroTexts[1], 'results hero text differs between host and player 2');
    assert.equal(heroTexts[0], heroTexts[2], 'results hero text differs between host and player 3');
    log(`game over: ${heroTexts[0]}`);

    // --- restart (host, two-click confirm) ---
    await host.getByRole('button', { name: 'Play Again' }).click();
    await host.getByRole('button', { name: 'Confirm New Game' }).click();
    await Promise.all(players.map((page) => page.getByRole('heading', { name: 'Question Submission' }).waitFor()));
    const newRoomCode = (await host.locator('.room-code').textContent()).trim();
    assert.notEqual(newRoomCode, roomCode, 'restart should issue a new room code');
    log(`restart confirmed: new room ${newRoomCode}, all contexts back at lobby`);

    log('SMOKE TEST PASSED');
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error('[e2e] SMOKE TEST FAILED');
  console.error(error);
  process.exitCode = 1;
});
