import React, { useEffect, useRef } from 'react';

function isVisibleFocusTarget(node) {
  if (node.disabled || !node.getClientRects().length) return false;
  // WebKit can report rectangles for controls inside a closed disclosure.
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS' && !parent.open && parent.querySelector('summary') !== node) return false;
  }
  return true;
}

export default function Modal({ title, onClose, children, footer, wide = false, className = '' }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.getPropertyValue('overflow');
    const previousPriority = document.body.style.getPropertyPriority('overflow');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    panel.current?.querySelector('button[aria-label="关闭"]')?.focus({ preventScroll: true });
    const key = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const nodes = [...(panel.current?.querySelectorAll('button,input,select,textarea,a[href],summary') ?? [])].filter(isVisibleFocusTarget);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.setProperty('overflow', previousOverflow, previousPriority); previous?.focus?.({ preventScroll: true }); };
  }, []);
  return <div className="modal-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={panel} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}>×</button></header><div className="modal-content">{children}</div>{footer && <footer className="modal-footer">{footer}</footer>}</section></div>;
}
