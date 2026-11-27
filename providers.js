'use strict';

const { dedupeItems, extractTags, isJunk } = require('./search-utils');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT = 25000;
const vqdCache = new Map();

const SOURCE_NAMES = {
  pinterest: 'Pinterest',
  yandex: 'Яндекс',
  ddg: 'DuckDuckGo',
  bing: 'Bing',
  deviantart: 'DeviantArt',
  artstation: 'ArtStation',
  openverse: 'Openverse',
  commons: 'Wikimedia'
};

async function httpGet(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(text) {
  let out = String(text);
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    if (next === out) break;
    out = next;
  }
  return out;
}

function parseBing(html) {
  const items = [];
  for (const match of html.matchAll(/\bm="([^"]*)"/g)) {
    try {
      const a = JSON.parse(decodeEntities(match[1]));
      if (!a.murl) continue;
      items.push({
        id: 'b_' + (a.cid || a.mid || a.murl),
        title: a.t || a.desc || '',
        url: a.murl,
        thumb: a.turl || a.murl,
        page: a.purl || '',
        width: null,
        height: null,
        tags: []
      });
    } catch { /* битая карточка — пропускаем */ }
  }
  return items;
}

async function searchPinterest(query, page) {
  const first = (page - 1) * 35 + 1;
  const url = 'https://www.bing.com/images/async?q=' + encodeURIComponent(`site:pinterest.com ${query}`)
    + `&first=${first}&count=35&relp=35&scenario=ImageBasicHover`;
  const html = await httpGet(url, { Referer: 'https://www.bing.com/images/' });
  return parseBing(html)
    .filter(item => /pinimg\.com/.test(item.url))
    .map(item => ({ ...item, source: 'pinterest', tags: extractTags(item) }));
}

async function getVqd(query) {
  const cached = vqdCache.get(query);
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.value;
  const html = await httpGet('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images');
  const match = html.match(/vqd=["']?([\d-]+)/);
  if (!match) throw new Error('DuckDuckGo: не удалось получить vqd');
  vqdCache.set(query, { value: match[1], time: Date.now() });
  return match[1];
}

async function searchDdg(query, page) {
  const vqd = await getVqd(query);
  const offset = (page - 1) * 100;
  const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1&s=${offset}`;
  const data = JSON.parse(await httpGet(url, { Referer: 'https://duckduckgo.com/', Accept: 'application/json' }));
  return (data.results || []).map(r => ({
    id: 'd_' + (r.image_token || r.image),
    title: r.title || '',
    url: r.image,
    thumb: r.thumbnail || r.image,
    page: r.url || '',
    width: r.width || null,
    height: r.height || null,
    source: 'ddg',
    tags: extractTags({ title: r.title })
  }));
}

async function searchBing(query, page) {
  const first = (page - 1) * 35 + 1;
  const url = 'https://www.bing.com/images/async?q=' + encodeURIComponent(query)
    + `&first=${first}&count=35&relp=35&scenario=ImageBasicHover`;
  const html = await httpGet(url, { Referer: 'https://www.bing.com/images/' });
  return parseBing(html).map(item => ({
    ...item,
    source: 'bing',
    tags: extractTags(item)
  }));
}

async function yandexSearch(query, page, prefix, source) {
  const text = prefix ? `${prefix} ${query}` : query;
  const url = 'https://yandex.com/images/search?text=' + encodeURIComponent(text) + `&pos=${(page - 1) * 30}`;
  const html = await httpGet(url);
  const urls = [...html.matchAll(/&quot;origUrl&quot;:&quot;([^&]+)/g)].map(m => decodeEntities(m[1]));
  const titles = [...html.matchAll(/&quot;snippet&quot;:\{&quot;title&quot;:&quot;([^&]+)/g)].map(m => decodeEntities(m[1]));
  const previews = [...html.matchAll(/&quot;preview&quot;:\[\{&quot;url&quot;:&quot;([^&]+)/g)].map(m => decodeEntities(m[1]));
  const widths = [...html.matchAll(/&quot;origWidth&quot;:(\d+)/g)].map(m => Number(m[1]));
  const heights = [...html.matchAll(/&quot;origHeight&quot;:(\d+)/g)].map(m => Number(m[1]));
  return urls.map((image, i) => {
    const thumb = previews[i] || image;
    return {
      id: 'y_' + image,
      title: titles[i] || '',
      url: image,
      thumb: thumb.startsWith('//') ? 'https:' + thumb : thumb,
      page: '',
      width: widths[i] || null,
      height: heights[i] || null,
      source,
      tags: extractTags({ title: titles[i] })
    };
  });
}

const searchYandex = (query, page) => yandexSearch(query, page, '', 'yandex');
const searchDeviantart = (query, page) => yandexSearch(query, page, 'site:deviantart.com', 'deviantart');
const searchArtstation = (query, page) => yandexSearch(query, page, 'site:artstation.com', 'artstation');

async function searchCommons(query, page) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}`
    + `&gsrnamespace=6&gsrlimit=20&gsroffset=${(page - 1) * 20}&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=400&format=json`;
  const data = JSON.parse(await httpGet(url));
  return Object.values(data.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(p => {
      const info = p.imageinfo?.[0];
      if (!info?.url) return null;
      return {
        id: 'c_' + p.pageid,
        title: p.title.replace(/^File:/, ''),
        url: info.url,
        thumb: info.thumburl || info.url,
        page: info.descriptionurl || '',
        width: info.width || null,
        height: info.height || null,
        source: 'commons',
        tags: extractTags({ title: p.title })
      };
    })
    .filter(Boolean);
}

async function searchOpenverse(query, page) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=20&page=${page}`;
  const data = JSON.parse(await httpGet(url));
  return (data.results || []).map(r => ({
    id: 'o_' + r.id,
    title: r.title || '',
    url: r.url,
    thumb: r.thumbnail || r.url,
    page: r.foreign_landing_url || '',
    width: r.width || null,
    height: r.height || null,
    license: r.license || '',
    source: 'openverse',
    tags: extractTags({ title: r.title, tags: [...(r.tags || []), r.license] })
  }));
}

const PROVIDERS = {
  pinterest: searchPinterest,
  yandex: searchYandex,
  ddg: searchDdg,
  bing: searchBing,
  deviantart: searchDeviantart,
  artstation: searchArtstation,
  openverse: searchOpenverse,
  commons: searchCommons
};

async function searchAll(query, sources, page) {
  const enabled = (sources || Object.keys(PROVIDERS)).filter(s => PROVIDERS[s]);
  if (!enabled.length) return { items: [], errors: ['Не выбрано ни одного источника'] };
  const settled = await Promise.allSettled(enabled.map(s => PROVIDERS[s](query, page)));
  const items = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else errors.push(`${SOURCE_NAMES[enabled[index]]}: ${result.reason?.message || 'ошибка'}`);
  });
  return { items: dedupeItems(items.filter(item => !isJunk(item))), errors };
}

module.exports = { searchAll, SOURCE_NAMES, PROVIDERS };
