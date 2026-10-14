import { useEffect, useState } from 'react';

export function QuestionOverlay({
  activeQuestion,
  isDailyDouble,
  teams,
  teamMap,
  isHost,
  timerSeconds,
  deadline,
  onResolve,
  busy
}) {
  // Own the 100ms timer tick locally so a running countdown only re-renders this
  // overlay, not the whole app tree.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const timerTotalMs = timerSeconds * 1000;
  const timerRemainingMs = deadline ? Math.max(0, deadline - now) : 0;
  const timerPct = timerTotalMs ? (timerRemainingMs / timerTotalMs) * 100 : 0;
  const timerSecondsLeft = Math.ceil(timerRemainingMs / 1000);

  const pickedByTeamId = activeQuestion.selectedByTeamId;
  const promptSize = activeQuestion.prompt.length > 180 ? ' long' : activeQuestion.prompt.length > 90 ? ' medium' : '';

  return (
    <div className="question-overlay">
      <div className={`question-overlay-card${isDailyDouble ? ' daily-double' : ''}`}>
        {isDailyDouble && <div className="pill daily-double-pill">DAILY DOUBLE ×{activeQuestion.multiplier}</div>}
        <div className="active-meta">
          <span>
            {activeQuestion.ownerPlayerName} ·{' '}
            {isDailyDouble
              ? `$${activeQuestion.value} → $${activeQuestion.value * activeQuestion.multiplier}`
              : `$${activeQuestion.value}`}
          </span>
          <span>Picked by: {teamMap[pickedByTeamId]?.name || '-'}</span>
        </div>

        <h2 className={`question-prompt${promptSize}`}>{activeQuestion.prompt}</h2>

        {isHost && (
          <>
            {timerSeconds > 0 && deadline && (
              <div className="timer-block">
                <div className={`timer-track${timerPct < 20 ? ' danger' : timerPct < 50 ? ' warn' : ''}`}>
                  <div className="timer-bar" style={{ width: `${timerPct}%` }} />
                </div>
                <div className="timer-count">{timerSecondsLeft > 0 ? `${timerSecondsLeft}s` : "Time's up!"}</div>
              </div>
            )}

            <p className="judge-hint">Ask {activeQuestion.ownerPlayerName} who got it right:</p>
            <div className="judge-actions">
              {teams.map((team) => (
                <button
                  type="button"
                  key={team.id}
                  className={team.id === pickedByTeamId ? 'judge-picked' : undefined}
                  disabled={Boolean(busy)}
                  onClick={() => onResolve(team.id)}
                >
                  {team.name} correct
                </button>
              ))}
              <button type="button" className="danger" disabled={Boolean(busy)} onClick={() => onResolve(null)}>
                All wrong
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
