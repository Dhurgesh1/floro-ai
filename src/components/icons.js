export function Icon({ name, size = 18, stroke = 'currentColor' }) {
  const icons = {
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    search: '<circle cx="11" cy="11" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    library: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v14H6.5A2.5 2.5 0 0 0 4 20.5v-14Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h7M8 12h7M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    spark: '<path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    settings: '<circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M19.4 15a7.7 7.7 0 0 0 .1-1l2-1.5-2-3.4-2.3 1a7.2 7.2 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.2 7.2 0 0 0-1.7 1l-2.3-1-2 3.4L4.5 14a7.9 7.9 0 0 0 .1 1L2.6 16.5l2 3.4 2.3-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.3 1 2-3.4L19.4 15Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    send: '<path d="M4 12l16-8-4 16-3.5-7L4 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M20 4L10 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    mic: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    attach: '<path d="M9.5 13.5l7-7a3 3 0 0 1 4.2 4.2l-9.1 9.1a5 5 0 0 1-7.1-7.1l9.1-9.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    pin: '<path d="M14 4l6 6-3 3-2 6-6-2-3-3 6-6 3-4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 18l6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 3v7m6-7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    chevron: '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = icons[name] || icons.spark;
  return svg;
}

export function iconButton(label, iconName, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(Icon({ name: iconName, size: 16 }));
  btn.addEventListener('click', onClick);
  return btn;
}
