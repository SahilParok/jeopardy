export function FlashBanner({ flash, onDismiss }) {
  if (!flash) return null;

  return (
    <div
      className={`result-flash ${flash.tone}${flash.visible ? '' : ' leaving'}${flash.compact ? ' compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="result-flash-text">
        {flash.closable && (
          <button type="button" className="result-flash-close" aria-label="Dismiss" onClick={onDismiss}>
            ×
          </button>
        )}
        <div className="result-flash-headline">{flash.headline}</div>
        {flash.detail && <div className="result-flash-detail">{flash.detail}</div>}
        {flash.answer && (
          <div className={`result-flash-answer${flash.answer.length > 70 ? ' long' : ''}`}>
            <span className="result-flash-answer-label">Answer</span>
            <span className="result-flash-answer-text">{flash.answer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
