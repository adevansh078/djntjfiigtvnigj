import { useId, useState } from 'react';
import { Info } from 'lucide-react';

export default function FormulaHint({children, formula}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="formula-hint" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="formula-trigger" aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={event => {if (event.key === 'Escape') setOpen(false);}}>{children}<Info size={12} aria-hidden="true"/></button>
    {open && <span id={id} role="tooltip" className="formula-tooltip">{formula}</span>}
  </span>;
}
