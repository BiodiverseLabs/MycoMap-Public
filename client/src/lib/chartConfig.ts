export const chartColors = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--secondary))',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  indigo: '#6366f1',
  teal: '#14b8a6',
};

export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: 'hsl(var(--foreground))',
        usePointStyle: true,
        padding: 20,
      }
    }
  },
  scales: {
    x: {
      grid: {
        color: 'hsl(var(--border))',
      },
      ticks: {
        color: 'hsl(var(--muted-foreground))',
      }
    },
    y: {
      grid: {
        color: 'hsl(var(--border))',
      },
      ticks: {
        color: 'hsl(var(--muted-foreground))',
      }
    }
  }
};
