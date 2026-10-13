import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function SubmissionTrend({
  data,
}: {
  data: { day: string; submitted: number; graded: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{
          top: 12,
          right: 10,
          left: -22,
          bottom: 0,
        }}
      >
        <defs>
          <linearGradient id="submitted-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#37755b" stopOpacity={0.17} />
            <stop offset="100%" stopColor="#37755b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="#edf0ee"
          strokeDasharray="4 4"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#909792", fontSize: 11 }}
          dy={9}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#909792", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            border: "1px solid #e5e9e5",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="submitted"
          name="Submitted"
          stroke="#39745b"
          strokeWidth={2.5}
          fill="url(#submitted-fill)"
        />
        <Area
          type="monotone"
          dataKey="graded"
          name="Graded"
          stroke="#b5c8be"
          strokeDasharray="5 4"
          strokeWidth={2}
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
