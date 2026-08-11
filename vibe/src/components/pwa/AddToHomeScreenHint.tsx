// vibe/src/components/pwa/AddToHomeScreenHint.tsx
// Only shown on iOS Safari (not standalone)

const AddToHomeScreenHint = ({ onDismiss }: { onDismiss: () => void }) => (
  <div className="aths-hint" data-testid="aths-hint">
    <button className="aths-hint__close" onClick={onDismiss} aria-label="Close add to home screen hint">×</button>
    <div className="aths-hint__content">
      <p className="aths-hint__title">Add Zippo to your Home Screen</p>
      <p className="aths-hint__steps">
        Tap <strong>Share</strong> <span className="aths-hint__share-icon">⬆️</span> then
        <strong> "Add to Home Screen"</strong> to get message notifications.
      </p>
      <div className="aths-hint__arrow" />  {/* pointing down toward Safari nav */}
    </div>
  </div>
);

export default AddToHomeScreenHint;
