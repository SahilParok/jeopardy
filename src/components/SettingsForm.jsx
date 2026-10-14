import { TIMER_OPTIONS } from '../constants.js';

// Shared control set for game settings, used both on the create-room form and
// the host's mid-lobby settings editor.
export function SettingsForm({
  questionsPerPlayer,
  onQuestionsPerPlayerChange,
  timerSeconds,
  onTimerSecondsChange,
  dailyDouble,
  onDailyDoubleChange
}) {
  return (
    <div className="inline-controls">
      <div className="control-field">
        <label htmlFor="questions-per-player">Questions per player</label>
        <input
          id="questions-per-player"
          type="number"
          min="1"
          max="10"
          value={questionsPerPlayer}
          onChange={(event) => onQuestionsPerPlayerChange(event.target.value)}
        />
      </div>

      <div className="control-field">
        <label htmlFor="answer-timer">Answer timer</label>
        <select id="answer-timer" value={timerSeconds} onChange={(event) => onTimerSecondsChange(event.target.value)}>
          {TIMER_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? 'Off' : `${seconds}s`}
            </option>
          ))}
        </select>
      </div>

      <div className="control-field checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={dailyDouble}
            onChange={(event) => onDailyDoubleChange(event.target.checked)}
          />
          Enable Daily Double
        </label>
      </div>
    </div>
  );
}
