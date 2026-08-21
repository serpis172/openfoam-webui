import { CheckCircle, Circle, Loader } from 'lucide-react'

interface Props {
  steps: string[]
  current: number
}

export default function ProgressSteps({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-4 overflow-x-auto pb-2">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current

        return (
          <div key={step} className="flex items-center gap-2">
            {done && <CheckCircle className="w-5 h-5 text-green-600" />}
            {active && <Loader className="w-5 h-5 text-blue-600 animate-spin" />}
            {!done && !active && <Circle className="w-5 h-5 text-slate-300" />}

            <span
              className={`text-sm whitespace-nowrap ${
                active ? 'font-semibold text-blue-700' : done ? 'text-green-700' : 'text-slate-500'
              }`}
            >
              {step}
            </span>
          </div>
        )
      })}
    </div>
  )
}