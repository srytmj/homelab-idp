import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, Shield } from 'lucide-react';

interface PasswordGeneratorProps {
  onSelectPassword: (pass: string) => void;
}

export const PasswordGenerator: React.FC<PasswordGeneratorProps> = ({ onSelectPassword }) => {
  const [length, setLength] = useState(20);
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeLower, setIncludeLower] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [generated, setGenerated] = useState('');

  const generate = () => {
    let chars = '';
    if (includeLower) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) chars += '0123456789';
    if (includeSymbols) chars += '!@#$%^&*()_+~`|}{[]:;?><,./-=';

    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';

    let result = '';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    setGenerated(result);
  };

  useEffect(() => {
    generate();
  }, [length, includeUpper, includeLower, includeNumbers, includeSymbols]);

  const calculateStrength = (pass: string): { label: string; score: number } => {
    if (!pass) return { label: 'None', score: 0 };
    let score = 0;
    if (pass.length >= 12) score += 25;
    if (pass.length >= 16) score += 25;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 20;
    if (/[0-9]/.test(pass)) score += 15;
    if (/[^A-Za-z0-9]/.test(pass)) score += 15;

    if (score >= 85) return { label: 'High Entropy', score };
    if (score >= 60) return { label: 'Strong', score };
    if (score >= 40) return { label: 'Moderate', score };
    return { label: 'Weak', score };
  };

  const strength = calculateStrength(generated);

  return (
    <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
        <span className="flex items-center gap-1.5 font-medium text-zinc-200">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          Entropy Generator
        </span>
        <span className="text-[11px] text-zinc-400">{strength.label}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-100 truncate select-all">
          {generated}
        </div>
        <button
          type="button"
          onClick={generate}
          className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          title="Regenerate"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSelectPassword(generated)}
          className="px-2.5 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          Use
        </button>
      </div>

      {/* Monochrome Progress Bar */}
      <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-300 transition-all duration-200"
          style={{ width: `${strength.score}%` }}
        />
      </div>

      {/* Controls */}
      <div className="space-y-2 pt-1 text-xs text-zinc-400 font-mono">
        <div className="flex items-center justify-between">
          <span>Length: {length}</span>
          <input
            type="range"
            min="8"
            max="32"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-28 accent-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={includeUpper}
              onChange={(e) => setIncludeUpper(e.target.checked)}
              className="accent-white rounded"
            />
            Uppercase (A-Z)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={includeNumbers}
              onChange={(e) => setIncludeNumbers(e.target.checked)}
              className="accent-white rounded"
            />
            Numbers (0-9)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={includeLower}
              onChange={(e) => setIncludeLower(e.target.checked)}
              className="accent-white rounded"
            />
            Lowercase (a-z)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
            <input
              type="checkbox"
              checked={includeSymbols}
              onChange={(e) => setIncludeSymbols(e.target.checked)}
              className="accent-white rounded"
            />
            Symbols (!@#$)
          </label>
        </div>
      </div>
    </div>
  );
};
