/* ============================================================
   charts.js — SVG donut + bar chart, без зависимостей
   ============================================================ */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // segments: [{ value, color }]
  function renderDonut(svg, segments) {
    svg.innerHTML = '';
    const total = segments.reduce((s, x) => s + x.value, 0);
    const cx = 100, cy = 100, r = 78, sw = 26;
    const C = 2 * Math.PI * r;

    // фоновое кольцо
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'var(--surface-2)');
    bg.setAttribute('stroke-width', sw);
    svg.appendChild(bg);

    if (total <= 0) return;

    let offset = 0;
    segments.forEach(seg => {
      if (seg.value <= 0) return;
      const frac = seg.value / total;
      const len = frac * C;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', seg.color);
      circle.setAttribute('stroke-width', sw);
      circle.setAttribute('stroke-dasharray', `${len} ${C - len}`);
      circle.setAttribute('stroke-dashoffset', -offset);
      circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
      circle.setAttribute('stroke-linecap', frac < 0.98 ? 'butt' : 'round');
      svg.appendChild(circle);
      offset += len;
    });
  }

  // container: DOM element; data: [{ label, value, current }]
  function renderBars(container, data, fmt) {
    container.innerHTML = '';
    const max = Math.max(1, ...data.map(d => d.value));
    data.forEach(d => {
      const col = document.createElement('div');
      col.className = 'bar-col';
      const h = Math.round((d.value / max) * 100);
      const bar = document.createElement('div');
      bar.className = 'bar-col__bar' + (d.current ? ' current' : '');
      bar.style.height = (d.value > 0 ? Math.max(h, 4) : 2) + '%';
      if (d.value > 0) {
        const cap = document.createElement('span');
        cap.textContent = fmt(d.value);
        bar.appendChild(cap);
      }
      const label = document.createElement('div');
      label.className = 'bar-col__label';
      label.textContent = d.label;
      col.appendChild(bar);
      col.appendChild(label);
      container.appendChild(col);
    });
  }

  window.Charts = { renderDonut, renderBars };
})();
