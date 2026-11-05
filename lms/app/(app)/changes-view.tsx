export default function ChangesView({
  before,
  after,
  metadata,
}: {
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  metadata: Record<string, any> | null;
}) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="min-w-[220px] max-w-md space-y-1">
      {Array.from(keys).map((key) => {
        const oldValue = before?.[key];
        const newValue = after?.[key];

        if (
          before &&
          after &&
          JSON.stringify(oldValue) === JSON.stringify(newValue)
        ) return null;

        return (
          <div key={key} className="flex items-start gap-1 text-xs">
            <span className="font-medium text-gray-600 shrink-0">
              {key}:
            </span>

            {before && (
              <span className="text-red-600 line-through break-all">
                {formatValue(oldValue)}
              </span>
            )}

            {before && after && (
              <span className="text-gray-400">→</span>
            )}

            {after && (
              <span className="text-green-700 break-all">
                {formatValue(newValue)}
              </span>
            )}
          </div>
        );
      })}

      {metadata && (
        <details className="text-xs">
          <summary className="cursor-pointer text-blue-600">
            Metadata
          </summary>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </details>
      )}

      {!before && !after && !metadata && (
        <span className="text-gray-400">—</span>
      )}
    </div>
  );
}