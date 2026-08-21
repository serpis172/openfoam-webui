import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { Residuals } from '@/types/run'

interface ResidualsChartProps {
  residuals: Residuals
}

export function ResidualsChart({ residuals }: ResidualsChartProps) {
  const fields = Object.keys(residuals).filter(
    (key) => residuals[key as keyof Residuals]?.length > 0
  )

  if (fields.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Nessun dato residui disponibile
      </div>
    )
  }

  const series = fields.map((field) => ({
    name: field,
    type: 'line',
    data: residuals[field as keyof Residuals],
    smooth: true,
    showSymbol: false,
  }))

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    legend: {
      data: fields,
      textStyle: {
        color: '#9ca3af',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: '#374151',
        },
      },
      axisLabel: {
        color: '#9ca3af',
      },
    },
    yAxis: {
      type: 'log',
      axisLine: {
        lineStyle: {
          color: '#374151',
        },
      },
      axisLabel: {
        color: '#9ca3af',
      },
      splitLine: {
        lineStyle: {
          color: '#1f2937',
        },
      },
    },
    series,
  }

  return (
    <div className="h-64">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}