// Icon drawings used in more than one place (24×24 viewBox). Each caller
// keeps its own <svg> around them (size, stroke): only the drawing is shared.

export function LockShape() {
  return (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" fill="none" />
    </>
  );
}

export function MessageBubbleShape() {
  return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
}
