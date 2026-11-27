(function (root) {
  'use strict';

  const SYNONYMS = {
    кошка: ['cat'], кот: ['cat'], собака: ['dog'], пёс: ['dog'],
    арт: ['artwork', 'illustration'], рисунок: ['drawing', 'illustration'],
    рисование: ['drawing'], иллюстрация: ['illustration'], картинка: ['artwork'],
    аниме: ['anime'], манга: ['manga'], фэнтези: ['fantasy'],
    киберпанк: ['cyberpunk'], пейзаж: ['landscape'], портрет: ['portrait'],
    город: ['city'], природа: ['nature'], цветы: ['flowers', 'flower'],
    девушка: ['girl'], парень: ['boy'], персонаж: ['character'],
    машина: ['car'], automobile: ['car'], дом: ['house'],
    дракон: ['dragon'], робот: ['robot'], космос: ['space']
  };

  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'ку', 'да', 'в', 'и', 'на', 'по',
    'art', 'image', 'photo', 'pinterest', 'site'
  ]);

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  }

  function parseQuery(raw) {
    const source = String(raw || '').trim();
    const phrases = [...source.matchAll(/"([^"]+)"/g)].map(m => m[1].toLowerCase().trim()).filter(Boolean);
    const plain = source.replace(/"[^"]+"/g, ' ');
    const include = [];
    const exclude = [];
    for (const token of plain.split(/\s+/).filter(Boolean)) {
      if (token.startsWith('-') && token.length > 1) exclude.push(token.slice(1).toLowerCase());
      else include.push(token.toLowerCase());
    }
    const expanded = [...new Set(include.flatMap(t => SYNONYMS[t] || [t]))];
    const remoteQuery = [...new Set([...expanded, ...phrases])].join(' ');
    return { source, include, exclude, phrases, expanded, remoteQuery };
  }

  function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = row;
    }
    return prev[b.length];
  }

  function fuzzyHit(word, term) {
    if (word === term || word.startsWith(term)) return true;
    return term.length >= 4 && Math.abs(word.length - term.length) <= 1 && editDistance(word, term) <= 1;
  }

  function matchesQuery(item, parsed) {
    if (!parsed || (!parsed.include.length && !parsed.phrases.length && !parsed.exclude.length)) return true;
    const hay = tokenize([item.title, item.source, (item.tags || []).join(' ')].join(' '));
    const terms = [...parsed.expanded, ...parsed.phrases.flatMap(tokenize)];
    const hasTerm = term => hay.some(word => fuzzyHit(word, term));
    if (parsed.exclude.some(hasTerm)) return false;
    return terms.every(hasTerm);
  }

  function extractTags(item) {
    return [...new Set([...(item.tags || []), ...tokenize(item.title)])].slice(0, 24);
  }

  function dedupeItems(items) {
    const seen = new Set();
    const titles = new Set();
    return items.filter(item => {
      const key = item.url;
      if (!key || seen.has(key)) return false;
      const title = titleKey(item);
      if (title.length >= 10 && titles.has(title)) return false;
      if (title.length >= 10) titles.add(title);
      seen.add(key);
      return true;
    });
  }

  function formatFromUrl(url) {
    const path = String(url || '').split(/[?#]/)[0];
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ? ext : '';
  }

  function filterItems(items, options) {
    const opts = options || {};
    const tags = opts.tags || [];
    return items.filter(item => {
      if (!matchesQuery(item, opts.parsed)) return false;
      const itemTags = extractTags(item);
      if (tags.some(t => !itemTags.includes(t))) return false;
      if (opts.minWidth && !(item.width >= opts.minWidth)) return false;
      if (opts.orientation && opts.orientation !== 'any') {
        const w = item.width || 0;
        const h = item.height || 0;
        if (!w || !h) return false;
        const ratio = w / h;
        if (opts.orientation === 'landscape' && ratio <= 1.05) return false;
        if (opts.orientation === 'portrait' && ratio >= 0.95) return false;
        if (opts.orientation === 'square' && (ratio <= 0.85 || ratio >= 1.15)) return false;
      }
      if (opts.format && opts.format !== 'any') {
        const ext = formatFromUrl(item.url);
        if (opts.format === 'photo' && ext === 'gif') return false;
        if (opts.format !== 'photo' && ext !== opts.format) return false;
      }
      return true;
    });
  }

  function relevanceScore(item, parsed) {
    const terms = [...(parsed?.expanded || []), ...(parsed?.phrases || []).flatMap(tokenize)];
    if (!terms.length) return 1;
    const hay = tokenize([item.title, (item.tags || []).join(' ')].join(' '));
    let score = 0;
    for (const term of terms) {
      if (hay.some(word => fuzzyHit(word, term))) score += 2;
      if (String(item.title || '').toLowerCase().includes(term)) score += 1;
    }
    return score;
  }

  function titleKey(item) {
    return String(item?.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  const JUNK_DOMAINS = [
    'tiktok.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'rutube.com',
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'reddit.com', 'soundcloud.com'
  ];
  const VIDEO_EXT = /\.(mp4|webm|mov|avi|m4v|mkv)(?:$|\?)/i;

  function domainOf(item) {
    for (const value of [item?.url, item?.page]) {
      try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* не ссылка */ }
    }
    return '';
  }

  const JUNK_TITLE = /трейлер|\btrailer\b|\bclip\b|\bmp4\b|обои|wallpaper|иконка|\bicon\b|логотип|\blogo\b|флаг|\bflag\b|скриншот|screenshot/i;

  function isJunk(item) {
    if (VIDEO_EXT.test(String(item?.url || ''))) return true;
    if (JUNK_TITLE.test(String(item?.title || ''))) return true;
    const link = `${item?.url || ''} ${item?.page || ''}`.toLowerCase();
    return JUNK_DOMAINS.some(domain => link.includes(domain));
  }

  function filterHidden(items, hidden) {
    const urls = new Set((hidden || []).map(h => h.url).filter(Boolean));
    const titles = new Set((hidden || []).map(h => h.title).filter(Boolean));
    const domains = new Set((hidden || []).map(h => h.domain).filter(Boolean));
    const blocked = host => domains.has(host) || [...domains].some(d => host.endsWith('.' + d));
    return items.filter(item =>
      !isJunk(item) &&
      !(item.width && item.height && (item.width < 180 || item.height < 180)) &&
      !urls.has(item.url) &&
      !(item.title && titles.has(titleKey(item))) &&
      !blocked(domainOf(item))
    );
  }

  function smartFilter(items, parsed, hidden, strict = true) {
    const clean = filterHidden(items, hidden);
    if (!strict) return clean;
    const terms = [...(parsed?.expanded || []), ...(parsed?.phrases || []).flatMap(tokenize)];
    if (terms.length < 2) return clean;
    const relevant = clean.filter(item => relevanceScore(item, parsed) > 0);
    const minimum = Math.min(20, Math.floor(clean.length * 0.2));
    return relevant.length >= minimum ? relevant : clean;
  }

  function sortItems(items, mode, parsed) {
    if (mode === 'size') return [...items].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    if (mode === 'source') return [...items].sort((a, b) => a.source.localeCompare(b.source));
    if (mode === 'relevance' && parsed) {
      return [...items].sort((a, b) => relevanceScore(b, parsed) - relevanceScore(a, parsed));
    }
    return items;
  }

  const api = {
    SYNONYMS, tokenize, parseQuery, matchesQuery, extractTags, dedupeItems,
    filterItems, sortItems, formatFromUrl, relevanceScore, titleKey, filterHidden, smartFilter, isJunk, domainOf, JUNK_DOMAINS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SearchUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
