import { useState } from 'react';

// ─── HORIZONTAL BAR CHART ──────────────────────────────────────
// Perfect for comparing sections and simple scores.
export function HorizontalBarChart({ data = [], title, suffix = '%' }) {
  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.value)) : 100;
  
  return (
    <div className="space-y-4">
      {title && <h4 className="text-xs font-semibold uppercase tracking-wider text-dark-500">{title}</h4>}
      <div className="space-y-3">
        {data.map((item, idx) => {
          const percent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={idx} className="space-y-1 group">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-dark-300 group-hover:text-white transition-colors">{item.label}</span>
                <span className="text-white font-semibold">{item.value}{suffix}</span>
              </div>
              <div className="h-2.5 w-full bg-dark-900 border border-dark-800 rounded-full overflow-hidden relative">
                <div 
                  className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-brand-500 to-brand-400 group-hover:brightness-110 shadow-[0_0_8px_rgba(59,130,246,0.3)]" 
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VERTICAL BAR CHART ────────────────────────────────────────
// Perfect for test-wise averages or more complex datasets.
export function VerticalBarChart({ data = [], height = 180 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.value)) : 100;
  const paddingBottom = 25;
  const paddingTop = 15;
  const chartHeight = height - paddingBottom - paddingTop;
  
  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <div className="flex items-end justify-between h-full pb-[25px] pt-[15px] px-2 gap-2 border-b border-dark-700/50">
        {data.map((item, idx) => {
          const heightPercent = maxValue > 0 ? (item.value / maxValue) * 85 : 0; // max 85% height to leave room for labels
          return (
            <div 
              key={idx} 
              className="flex-1 flex flex-col items-center h-full justify-end group relative"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Value Label (Visible on hover) */}
              <div className={`absolute bottom-full mb-1 bg-dark-900 border border-dark-700 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg transition-opacity duration-200 ${
                hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}>
                {item.value}
              </div>
              
              {/* Bar */}
              <div 
                className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 hover:brightness-110 transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.2)]" 
                style={{ height: `${Math.max(4, heightPercent)}%` }}
              />
              
              {/* Label below axis */}
              <span className="absolute top-full mt-1.5 text-[9px] text-dark-500 font-medium group-hover:text-white truncate max-w-full text-center transition-colors">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── INTERACTIVE LINE CHART ────────────────────────────────────
// Render a beautiful, glassmorphic line trend chart using SVG bezier math.
export function InteractiveLineChart({ data = [], height = 180, suffix = '%' }) {
  const [hoveredDot, setHoveredDot] = useState(null);
  
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-dark-500 text-xs">No data available</div>;

  const width = 500;
  const paddingX = 40;
  const paddingY = 20;
  
  const values = data.map(d => d.value);
  const minVal = 0;
  const maxVal = Math.max(...values, 100);
  
  // Point generator
  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
    // In SVG, y=0 is top, so we subtract scaled value from height
    const y = height - paddingY - ((d.value - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
    return { x, y, label: d.label, value: d.value };
  });

  // Generate cubic bezier curve path
  let pathD = '';
  let areaD = '';
  
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 3;
      const cpY1 = curr.y;
      const cpX2 = curr.x + 2 * (next.x - curr.x) / 3;
      const cpY2 = next.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
    }
    
    // Close area for gradient fill
    areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  }

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          {/* Fill Gradient */}
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
          {/* Line Stroke Gradient */}
          <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>

        {/* Grid lines (3 horizontal helper lines) */}
        {[0, 0.5, 1].map((r, idx) => {
          const y = paddingY + r * (height - paddingY * 2);
          return (
            <line 
              key={idx} 
              x1={paddingX} 
              y1={y} 
              x2={width - paddingX} 
              y2={y} 
              stroke="var(--dark-700)" 
              strokeOpacity="0.25" 
              strokeDasharray="4 4" 
            />
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#area-grad)" />

        {/* Trend line */}
        <path d={pathD} fill="none" stroke="url(#line-grad)" strokeWidth="3" strokeLinecap="round" />

        {/* Interactive dots */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle 
              cx={p.x} 
              cy={p.y} 
              r={hoveredDot === idx ? 7 : 4} 
              fill="#ffffff" 
              stroke="#2563eb" 
              strokeWidth={hoveredDot === idx ? 3 : 2} 
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHoveredDot(idx)}
              onMouseLeave={() => setHoveredDot(null)}
            />
            {/* Axis Label */}
            <text 
              x={p.x} 
              y={height - 4} 
              fill="var(--dark-500)" 
              fontSize="9" 
              textAnchor="middle" 
              className="font-medium"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Floating HTML Tooltip */}
      {hoveredDot !== null && (
        <div 
          className="absolute bg-dark-900 border border-dark-700 text-white text-xs px-2 py-1 rounded shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full z-15 transition-all duration-150"
          style={{
            left: `${(points[hoveredDot].x / width) * 100}%`,
            top: `${(points[hoveredDot].y / height) * 100 - 5}%`
          }}
        >
          <div className="font-semibold text-center">{points[hoveredDot].value}{suffix}</div>
          <div className="text-[9px] text-dark-400 text-center">{points[hoveredDot].label}</div>
        </div>
      )}
    </div>
  );
}

// ─── INTERACTIVE DONUT CHART ───────────────────────────────────
// Mathematical Circular SVG Donut Chart with nice color segments.
export function InteractiveDonutChart({ data = [], size = 160, innerTextLabel = 'Total' }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  const radius = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  
  let currentOffset = 0;
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const arcLength = fraction * circumference;
    const offset = currentOffset;
    currentOffset -= arcLength; // Subtract because SVG offsets rotate counter-clockwise
    return {
      ...d,
      arcLength,
      offset,
      percentage: Math.round(fraction * 100)
    };
  });

  return (
    <div className="flex flex-col items-center justify-center sm:flex-row gap-6 p-2">
      {/* Donut Circle */}
      <div className="relative" style={{ width: `${size}px`, height: `${size}px` }}>
        <svg 
          width="100%" 
          height="100%" 
          viewBox="0 0 120 120" 
          className="transform -rotate-90 overflow-visible"
        >
          {/* Base Track */}
          <circle 
            cx="60" 
            cy="60" 
            r={radius} 
            fill="transparent" 
            stroke="var(--dark-800)" 
            strokeWidth={strokeWidth} 
          />

          {/* Segment Arcs */}
          {segments.map((seg, idx) => (
            <circle 
              key={idx}
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={hoveredIdx === idx ? strokeWidth + 2 : strokeWidth}
              strokeDasharray={`${seg.arcLength} ${circumference - seg.arcLength}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="round"
              className="cursor-pointer transition-all duration-200"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Center Text widget */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {hoveredIdx !== null ? (
            <>
              <span className="text-2xl font-bold text-white leading-none">
                {segments[hoveredIdx].percentage}%
              </span>
              <span className="text-[10px] text-dark-400 font-medium uppercase mt-0.5 max-w-[80px] truncate">
                {segments[hoveredIdx].label}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-white leading-none">
                {total}
              </span>
              <span className="text-[10px] text-dark-400 font-medium uppercase mt-0.5">
                {innerTextLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legends */}
      <div className="flex flex-col gap-2.5">
        {segments.map((seg, idx) => (
          <div 
            key={idx} 
            className={`flex items-center gap-2.5 px-2 py-1 rounded-lg transition-colors ${
              hoveredIdx === idx ? 'bg-dark-800/30' : ''
            }`}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white leading-tight">
                {seg.label}
              </p>
              <p className="text-[10px] text-dark-500">
                {seg.value} ({seg.percentage}%)
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
