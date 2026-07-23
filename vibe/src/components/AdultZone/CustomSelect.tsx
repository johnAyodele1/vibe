import React, { useState, useEffect, useRef } from 'react';

interface SelectOption {
  value: string;
  label: string;
  extra?: any;
}

interface CustomSelectProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  onSelect: (value: string, label: string, extra?: any) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  searchPlaceholder?: string;
  onSearchChange?: (query: string) => void;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Select option...',
  disabled = false,
  loading = false,
  icon,
  searchPlaceholder = 'Search...',
  onSearchChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (onSearchChange) {
      onSearchChange(searchQuery);
    }
  }, [searchQuery, onSearchChange]);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = onSearchChange
    ? options
    : options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const handleSelect = (opt: SelectOption) => {
    onSelect(opt.value, opt.label, opt.extra);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full">
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--az-text-muted)] mb-2.5">
        {label}
      </label>

      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen(true)}
        className={`w-full h-11 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 text-left text-white flex items-center justify-between transition-all duration-150 outline-none
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-neutral-700 active:scale-[0.99]'}
          ${isOpen ? 'border-[var(--az-accent-crimson)] ring-1 ring-[var(--az-accent-crimson)]' : ''}
        `}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {icon && <span className="text-sm shrink-0">{icon}</span>}
          {loading ? (
            <span className="text-sm text-[var(--az-text-muted)] italic animate-pulse">
              Loading {label.toLowerCase()}...
            </span>
          ) : selectedOption ? (
            <span className="text-sm font-medium text-white truncate">
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-sm text-[var(--az-text-muted)] truncate">
              {placeholder}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--az-text-muted)] ml-2 shrink-0">▼</span>
      </button>

      {/* Sheet / Modal overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
          {/* Back click overlay */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

          <div className="relative w-full max-w-md bg-[var(--az-bg-secondary)] border-t sm:border border-[var(--az-border)] rounded-t-[24px] sm:rounded-2xl p-6 h-[80vh] sm:h-[500px] flex flex-col animate-slide-up z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <h3 className="text-lg font-serif italic text-white flex items-center gap-2">
                {icon && <span>{icon}</span>} Select {label}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] flex items-center justify-center text-sm text-[var(--az-text-secondary)] hover:text-white hover:border-neutral-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4 shrink-0">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl pl-4 pr-10 text-sm text-white focus:border-[var(--az-accent-crimson)] outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--az-text-muted)] hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
              {filteredOptions && filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left py-3 px-4 rounded-xl text-sm transition-all duration-150 flex items-center justify-between
                      ${opt.value === value
                        ? 'bg-[rgba(200,16,46,0.12)] text-[var(--az-accent-crimson)] border border-[var(--az-accent-crimson)]/30'
                        : 'bg-transparent text-white hover:bg-[var(--az-bg-tertiary)] border border-transparent'
                      }
                    `}
                  >
                    <span>{opt.label}</span>
                    {opt.value === value && (
                      <span className="text-xs text-[var(--az-accent-crimson)] font-bold">✓</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="text-center py-10 text-xs text-[var(--az-text-muted)] italic">
                  {options.length === 0 ? `No ${label.toLowerCase()} available` : 'No matches found'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
