import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

/**
 * Tiny line chart — no axes, no grid, no tooltip. Colored green when
 * the last value is above the first, red when below, muted when flat.
 *
 * Reused in list rows, the position card, and anywhere a 24–48px
 * "trend" indicator is useful. Designed to render cleanly at widths
 * as small as 60px.
 */
export function MiniSparkline({
  data,
  height = 28,
  width = "100%",
}: {
  data: number[];
  height?: number;
  width?: number | string;
}) {
  if (!data || data.length < 2) {
    return <div style={{ height, width }} aria-hidden />;
  }

  const first = data[0];
  const last = data[data.length - 1];
  const delta = last - first;

  const color =
    delta > 0 ? "#10b981" : delta < 0 ? "#ef4444" : "var(--fg-muted)";

  const series = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ width, height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          {/* Fixed domain via hidden YAxis so the line doesn't clip when the
              series has tiny variance. */}
          <YAxis hide domain={["auto", "auto"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
