// Draws items in random order without repeats until every item has been
// drawn, then reshuffles (avoiding an immediate repeat across the boundary).

export class Deck<T> {
  private pile: T[] = [];
  private last: T | undefined;

  constructor(private items: T[]) {}

  draw(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.pile.length === 0) {
      this.pile = shuffle(this.items);
      if (this.pile.length > 1 && this.pile[this.pile.length - 1] === this.last) {
        this.pile.unshift(this.pile.pop()!);
      }
    }
    this.last = this.pile.pop();
    return this.last;
  }

  /** Permanently drop an item (e.g. its preview disappeared). */
  remove(item: T): void {
    this.items = this.items.filter((x) => x !== item);
    this.pile = this.pile.filter((x) => x !== item);
  }

  get size(): number {
    return this.items.length;
  }

  /** How many are left before the deck reshuffles. */
  get remaining(): number {
    return this.pile.length;
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
