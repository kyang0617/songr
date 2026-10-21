import { useMemo, useState, type KeyboardEvent } from "react";
import { matchKey } from "../../shared/normalize";

export interface GuessOption {
  /** Identifies the song for guess checking (normalized title + artist). */
  key: string;
  /** "Title – Artist" as shown in the list. */
  label: string;
}

interface Props {
  options: GuessOption[];
  excludedKeys: Set<string>;
  skipLabel: string;
  onGuess: (option: GuessOption) => void;
  onSkip: () => void;
}

const MAX_SUGGESTIONS = 8;

export function GuessInput({ options, excludedKeys, skipLabel, onGuess, onSkip }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GuessOption | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);

  const searchable = useMemo(() => options.map((o) => ({ option: o, text: matchKey(o.label) })), [options]);

  const suggestions = useMemo(() => {
    const words = matchKey(query).split(" ").filter(Boolean);
    if (words.length === 0) return [];
    return searchable
      .filter(({ option, text }) => !excludedKeys.has(option.key) && words.every((w) => text.includes(w)))
      .slice(0, MAX_SUGGESTIONS)
      .map((s) => s.option);
  }, [query, searchable, excludedKeys]);

  const choose = (option: GuessOption) => {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
  };

  const submit = () => {
    if (!selected) return;
    onGuess(selected);
    setSelected(null);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const listVisible = open && suggestions.length > 0;
    if (e.key === "ArrowDown" && listVisible) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && listVisible) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (listVisible) choose(suggestions[highlight]);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="guess">
      <div className="guess-field">
        <input
          type="text"
          value={query}
          placeholder="Search for the song…"
          aria-label="Guess the song"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && suggestions.length > 0 && (
          <ul className="suggestions" role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.key}
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? "active" : ""}
                // mousedown fires before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {s.label}
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() && suggestions.length === 0 && (
          <div className="suggestions empty">No matching songs in this playlist</div>
        )}
      </div>
      <div className="guess-actions">
        <button className="btn ghost" onClick={onSkip}>
          {skipLabel}
        </button>
        <button className="btn primary" onClick={submit} disabled={!selected}>
          Guess
        </button>
      </div>
      {query && !selected && !open && <p className="hint">Pick a song from the list to guess.</p>}
    </div>
  );
}
