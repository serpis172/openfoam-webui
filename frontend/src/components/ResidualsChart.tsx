import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Props {
  residuals: Record<string, number[]>
}

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#f97316', '#0891b2']

export default function ResidualsChart({ residuals }: Props) {
  const fields = Object.keys(residuals)

  if (fields.length === 0) {
    return (
      <div className="text-slate-500 text-sm">
        Nessun residuo disponibile. Avvia una simulazione.
      </div>
    )
  }

  const maxLength = Math.max(...fields.map(f => residuals[f].length))
  const data = Array.from({ length: maxLength }, (_, i) => {
    const point: Record<string, number> = { index: i }

    for (const field of fields) {
      point[field] = residuals[field][i] ?? NaN
    }

    return point
  })

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="index" />
          <YAxis scale="log" domain={['auto', 'auto']} />
          <Tooltip />
          <Legend />

          {fields.map((field, i) => (
            <Line
              key={field}
              type="monotone"
              dataKey={field}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}