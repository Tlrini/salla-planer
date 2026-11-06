import { describe, expect, it } from 'vitest';
import { foldText } from './CatalogSidebar';

describe('catalog search', () => {
  it('ignores case and Albanian accents', () => {
    expect(foldText('Pistë vallëzimi')).toBe('piste vallezimi');
    expect(foldText('Tavolinë e ÇIFTIT')).toBe('tavoline e ciftit');
    expect(foldText('Pistë').includes(foldText('pista'.slice(0, 4)))).toBe(true);
  });
});
