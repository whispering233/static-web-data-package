export type StatusBarProps = {
  message: string | undefined;
  error: string | undefined;
};

export function StatusBar({ message, error }: StatusBarProps) {
  return (
    <div className="swd-dev-status" role="status">
      {message ? <span>{message}</span> : <span>Idle</span>}
      {error ? <strong>{error}</strong> : null}
    </div>
  );
}
