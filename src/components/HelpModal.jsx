import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function HelpModal({ onClose }) {
  const closeButtonRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;

      const focusable = Array.from(cardRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="help-overlay" onClick={onClose}>
      <div
        className="help-card"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-head">
          <h2>How to Play</h2>
          <button type="button" className="help-close" aria-label="Close help" ref={closeButtonRef} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="help-section">
          <h3>Game Flow</h3>
          <p>
            Every player writes their own questions, one per point value. Once everyone has submitted, the host
            starts team setup, players are grouped into teams, and the board is built from everyone's questions.
            Teams take turns picking a cell on the board, in order. A team keeps the pick only while it answers its
            own questions right; a steal never changes whose turn it is.
          </p>
        </div>

        <div className="help-section">
          <h3>Answering a Question</h3>
          <p>
            Teams answer out loud and the question's author says whether it was right. The host then taps the
            result:
          </p>
          <ul>
            <li>
              <strong>Team N correct:</strong> that team gets the points. If it was the team that picked, it
              picks again; if it stole the question, the pick still goes to the team after the picker. Points
              can be fixed afterwards with Edit Scores if the wrong button was tapped.
            </li>
            <li>
              <strong>All wrong:</strong> no one gets the points, the answer is revealed, and the pick goes to
              the next team in order.
            </li>
          </ul>
        </div>

        <div className="help-section">
          <h3>Daily Double</h3>
          <p>
            If enabled, one question on the board is a secret Daily Double. It is revealed when a team selects
            it, and the points it awards are doubled.
          </p>
        </div>

        <div className="help-section">
          <h3>Timer</h3>
          <p>
            The host can set an answer countdown (or leave it off). It is shown on the host screen and sounds a
            buzzer when it runs out; the host still decides who got it right.
          </p>
        </div>

        <div className="help-section">
          <h3>Host Powers</h3>
          <p>
            The host can edit settings mid-lobby, remove a player before the game starts, adjust final scores, and
            start a new game after results.
          </p>
        </div>
      </div>
    </div>
  );
}
