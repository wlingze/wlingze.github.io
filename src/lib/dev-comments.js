// Development-only review comments.
//
// Select text or click a block on the page, write what should change, and the
// note is stored in .hallmark/comments.json through the dev server. The source
// location is attached automatically so the note can be acted on without
// guessing which element was meant.
//
// Comments are global: the queue button counts every open note, the numbered
// dots mark the ones on the current page, and the queue list jumps across
// pages. Only inlined by Base.astro in dev; nothing ships in the build.
(() => {
  if (window.__devComments) return;
  window.__devComments = true;

  const JUMP_KEY = 'dev-comments-jump';
  const sources = new WeakMap();
  const annotated = [];
  for (const el of document.querySelectorAll('[data-astro-source-file]')) {
    const [line, col] = (el.getAttribute('data-astro-source-loc') || '').split(':');
    const source = { file: el.getAttribute('data-astro-source-file'), line: Number(line) || 1, col: Number(col) || 1 };
    sources.set(el, source);
    annotated.push({ el, ...source });
  }

  const locate = (start) => {
    for (let el = start; el && el.nodeType === 1; el = el.parentElement) {
      const own = sources.get(el);
      if (own) return { el, ...own };
      const file = el.getAttribute('data-dev-file');
      if (file) return { el, file, line: Number(el.getAttribute('data-dev-line')) || 1, col: 1 };
    }
    return { el: start, file: '', line: 0, col: 1 };
  };

  const selectorFor = (el) => {
    if (!(el instanceof Element) || el === document.body) return '';
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 6; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      const parent = node.parentElement;
      if (!parent) break;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
    }
    return parts.join(' > ');
  };

  const shortPath = (file) => file.replace(/^.*?\/(src|docs|scripts|tests)\//, '$1/');

  const style = document.createElement('style');
  style.setAttribute('data-dev-comments', '');
  style.textContent = `
    [data-dev-comments] { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .dev-comments__bar {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
      display: flex; align-items: center; gap: 6px;
    }
    .dev-comments__pill, .dev-comments__queue {
      display: inline-flex; align-items: center; gap: 6px;
      height: 28px; padding: 0 11px; border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, .22);
      background: rgba(24, 22, 28, .86); color: #f6f1e9;
      font: 500 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .02em; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .18), 0 6px 14px rgba(0, 0, 0, .16);
      backdrop-filter: blur(6px);
    }
    .dev-comments__pill:hover, .dev-comments__queue:hover { background: rgba(24, 22, 28, .96); }
    .dev-comments__pill[aria-pressed="true"] { background: #8c2f4a; border-color: #b8496a; }
    .dev-comments__pill:focus-visible, .dev-comments__queue:focus-visible { outline: 2px solid #b8496a; outline-offset: 2px; }
    .dev-comments__queue[hidden] { display: none; }
    .dev-comments__queue-count {
      min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
      background: #f6f1e9; color: #241f27; font-size: 10px; line-height: 16px; text-align: center;
    }
    .dev-comments__bubble {
      position: fixed; z-index: 2147483647; display: none;
      height: 26px; padding: 0 10px; border-radius: 999px; border: 0;
      background: #8c2f4a; color: #fff; font: 500 12px/26px ui-monospace, Menlo, monospace;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, .28);
    }
    .dev-comments__panel {
      position: fixed; z-index: 2147483647; display: none; width: 340px; max-width: calc(100vw - 24px);
      padding: 12px; border-radius: 10px; background: #fbf8f2; color: #241f27;
      border: 1px solid #d9d2c6; box-shadow: 0 18px 48px rgba(30, 22, 18, .28);
      font: 400 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dev-comments__quote {
      margin: 0 0 6px; padding-left: 8px; border-left: 2px solid #8c2f4a;
      color: #4a4248; max-height: 4.5em; overflow: hidden;
    }
    .dev-comments__source { margin: 0 0 8px; color: #7c7379; display: flex; gap: 8px; align-items: center; }
    .dev-comments__source button { border: 0; background: none; color: #8c2f4a; font: inherit; cursor: pointer; padding: 0; }
    .dev-comments__panel textarea {
      display: block; width: 100%; box-sizing: border-box; min-height: 76px; resize: vertical;
      padding: 8px; border-radius: 6px; border: 1px solid #cfc7ba; background: #fff;
      color: #241f27; font: 400 12px/1.5 ui-monospace, Menlo, monospace;
    }
    .dev-comments__panel textarea:focus-visible { outline: 2px solid #8c2f4a; outline-offset: 1px; }
    .dev-comments__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .dev-comments__actions button {
      height: 26px; padding: 0 10px; border-radius: 6px; cursor: pointer;
      border: 1px solid #cfc7ba; background: #fff; color: #241f27;
      font: 500 12px/1 ui-monospace, Menlo, monospace;
    }
    .dev-comments__actions .save { background: #8c2f4a; border-color: #8c2f4a; color: #fff; }
    .dev-comments__actions button:focus-visible { outline: 2px solid #8c2f4a; outline-offset: 1px; }
    .dev-comments__queue-panel {
      position: fixed; right: 16px; bottom: 54px; z-index: 2147483647; display: none;
      width: 360px; max-width: calc(100vw - 24px); max-height: 56vh; overflow: auto;
      padding: 8px; border-radius: 10px; background: #fbf8f2; color: #241f27;
      border: 1px solid #d9d2c6; box-shadow: 0 18px 48px rgba(30, 22, 18, .28);
      font: 400 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dev-comments__queue-head { margin: 2px 4px 8px; color: #7c7379; }
    .dev-comments__item {
      display: block; width: 100%; box-sizing: border-box; text-align: left; cursor: pointer;
      padding: 8px; border-radius: 8px; border: 1px solid transparent; background: none;
      font: inherit; color: inherit;
    }
    .dev-comments__item + .dev-comments__item { border-top: 1px solid #e6e0d4; }
    .dev-comments__item:hover { background: #f3ede1; }
    .dev-comments__item:focus-visible { outline: 2px solid #8c2f4a; outline-offset: -2px; }
    .dev-comments__item .where { color: #7c7379; font-size: 11px; }
    .dev-comments__item .quote { display: block; margin: 2px 0; color: #4a4248; }
    .dev-comments__item .text { display: block; color: #241f27; }
    .dev-comments__dots { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; }
    .dev-comments__dot {
      position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; padding: 0;
      border-radius: 999px; border: 1px solid #fff; background: #8c2f4a; color: #fff;
      font: 600 9px/12px ui-monospace, Menlo, monospace; text-align: center;
      pointer-events: auto; cursor: help; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
    }
    .dev-comments__flash { outline: 3px solid #8c2f4a !important; outline-offset: 3px !important; }
    .dev-comments__toast {
      position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
      max-width: min(72vw, 680px); padding: 8px 10px; border-radius: 6px;
      background: rgba(24, 22, 28, .94); color: #f6f1e9;
      font: 500 12px/1.4 ui-monospace, Menlo, monospace;
      box-shadow: 0 6px 18px rgba(0, 0, 0, .24); display: none;
      overflow-wrap: anywhere; user-select: text;
    }
    .dev-comments__toast[data-visible] { display: block; }
  `;

  const bar = document.createElement('div');
  bar.className = 'dev-comments__bar';
  bar.setAttribute('data-dev-comments', '');

  const queueButton = document.createElement('button');
  queueButton.type = 'button';
  queueButton.className = 'dev-comments__queue';
  queueButton.setAttribute('data-dev-comments', '');
  queueButton.title = '所有页面未处理的评论';
  queueButton.hidden = true;
  const queueCount = document.createElement('span');
  queueCount.className = 'dev-comments__queue-count';
  const queueLabel = document.createElement('span');
  queueLabel.textContent = '条评论';
  queueButton.append(queueCount, queueLabel);

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'dev-comments__pill';
  pill.setAttribute('data-dev-comments', '');
  pill.setAttribute('aria-pressed', 'false');
  pill.title = '选中文字或点击块，写一条修改意见（Esc 退出）';
  pill.textContent = '评论';
  bar.append(queueButton, pill);

  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'dev-comments__bubble';
  bubble.setAttribute('data-dev-comments', '');
  bubble.textContent = '评论';

  const panel = document.createElement('form');
  panel.className = 'dev-comments__panel';
  panel.setAttribute('data-dev-comments', '');
  panel.innerHTML = `
    <p class="dev-comments__quote"></p>
    <p class="dev-comments__source"><span></span><button type="button" class="copy">复制位置</button></p>
    <textarea required placeholder="要改什么？"></textarea>
    <div class="dev-comments__actions">
      <button type="button" class="cancel">取消</button>
      <button type="submit" class="save">保存 ⌘↵</button>
    </div>
  `;
  const quoteEl = panel.querySelector('.dev-comments__quote');
  const sourceEl = panel.querySelector('.dev-comments__source span');
  const copyEl = panel.querySelector('.copy');
  const textEl = panel.querySelector('textarea');

  const queuePanel = document.createElement('div');
  queuePanel.className = 'dev-comments__queue-panel';
  queuePanel.setAttribute('data-dev-comments', '');

  const dots = document.createElement('div');
  dots.className = 'dev-comments__dots';
  dots.setAttribute('data-dev-comments', '');
  dots.setAttribute('aria-hidden', 'true');

  const toast = document.createElement('div');
  toast.className = 'dev-comments__toast';
  toast.setAttribute('data-dev-comments', '');
  toast.setAttribute('role', 'status');

  const mount = () => document.body.append(dots, queuePanel, bubble, panel, toast, bar);
  document.head.append(style);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  let active = false;
  let pending = null;
  let lastPick = null;
  let comments = [];
  let rootPath = '';
  let toastTimer = 0;

  const pageKey = () => location.pathname;

  const say = (text) => {
    toast.textContent = text;
    toast.toggleAttribute('data-visible', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.removeAttribute('data-visible'), 5000);
  };

  const absolute = (comment) => (rootPath && comment.sourceFile ? `${rootPath}/${comment.sourceFile}` : comment.sourceFile);

  const elementFor = (comment) => {
    if (comment.selector) {
      const found = document.querySelector(comment.selector);
      if (found) return found;
    }
    const file = absolute(comment);
    if (!file) return null;
    return annotated.find((item) => item.file === file && item.line === comment.sourceLine)?.el
      ?? [...document.querySelectorAll('[data-dev-file]')].find((node) => node.getAttribute('data-dev-file') === file && Number(node.getAttribute('data-dev-line')) === comment.sourceLine)
      ?? null;
  };

  const flash = (comment) => {
    const el = elementFor(comment);
    if (!el) {
      say('这一页找不到评论对应的元素');
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('dev-comments__flash');
    setTimeout(() => el.classList.remove('dev-comments__flash'), 1600);
  };

  const drawDots = () => {
    dots.textContent = '';
    for (const comment of comments) {
      if (comment.page !== pageKey()) continue;
      const el = elementFor(comment);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dev-comments__dot';
      dot.setAttribute('data-dev-comments', '');
      dot.textContent = String(comment.id);
      dot.title = `#${comment.id} ${comment.quote ? `${comment.quote}\n\n` : ''}${comment.comment}`;
      dot.style.left = `${Math.min(rect.right, window.innerWidth - 8)}px`;
      dot.style.top = `${Math.max(rect.top, 8)}px`;
      dot.addEventListener('click', () => say(`#${comment.id} ${comment.comment}`));
      dots.append(dot);
    }
  };

  const renderQueue = () => {
    queuePanel.textContent = '';
    const head = document.createElement('p');
    head.className = 'dev-comments__queue-head';
    head.textContent = `未处理 ${comments.length} 条 · 点击跳到对应页面`;
    queuePanel.append(head);
    for (const comment of [...comments].sort((a, b) => a.id - b.id)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dev-comments__item';
      item.setAttribute('data-dev-comments', '');
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = `#${comment.id} ${comment.page} ${comment.sourceFile ? `${comment.sourceFile}${comment.sourceLine ? `:${comment.sourceLine}` : ''}` : ''}`;
      const quote = document.createElement('span');
      quote.className = 'quote';
      quote.textContent = comment.quote ? `“${comment.quote.slice(0, 60)}${comment.quote.length > 60 ? '…' : ''}”` : '';
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = comment.comment;
      item.append(where, quote, text);
      item.addEventListener('click', () => {
        toggleQueue(false);
        if (comment.page === pageKey()) flash(comment);
        else {
          sessionStorage.setItem(JUMP_KEY, String(comment.id));
          location.href = comment.page;
        }
      });
      queuePanel.append(item);
    }
  };

  const toggleQueue = (next) => {
    const show = next ?? queuePanel.style.display !== 'block';
    if (show) renderQueue();
    queuePanel.style.display = show ? 'block' : 'none';
  };

  const updateQueue = () => {
    queueCount.textContent = String(comments.length);
    queueButton.hidden = comments.length === 0;
    queueButton.setAttribute('aria-label', `查看 ${comments.length} 条未处理的评论`);
    if (queuePanel.style.display === 'block') renderQueue();
  };

  let jumped = Number(sessionStorage.getItem(JUMP_KEY)) || 0;
  if (jumped) sessionStorage.removeItem(JUMP_KEY);

  const refresh = async () => {
    try {
      const res = await fetch('/__dev-comments');
      const data = await res.json();
      rootPath = data.root || '';
      comments = Array.isArray(data.comments) ? data.comments : [];
    } catch {
      // Keep the previous list when the dev server is momentarily unavailable.
    }
    updateQueue();
    drawDots();
    if (jumped) {
      const comment = comments.find((item) => item.id === jumped);
      jumped = 0;
      if (comment) flash(comment);
    }
  };

  const closePanel = () => {
    panel.style.display = 'none';
    textEl.value = '';
    pending = null;
  };

  const setActive = (next) => {
    active = next;
    pill.setAttribute('aria-pressed', String(active));
    pill.textContent = active ? '评论中' : '评论';
    if (!active) {
      bubble.style.display = 'none';
      closePanel();
    }
  };

  const placePanel = (rect) => {
    const width = 340;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const below = rect.bottom + 8;
    const top = below + 180 > window.innerHeight ? Math.max(12, rect.top - 188) : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.display = 'block';
  };

  const openPanel = (target, rect) => {
    pending = target;
    quoteEl.textContent = target.quote ? `“${target.quote}”` : '（整块）';
    sourceEl.textContent = target.file ? `${shortPath(target.file)}:${target.line}` : '未定位到源文件';
    textEl.value = '';
    placePanel(rect);
    bubble.style.display = 'none';
    textEl.focus();
  };

  const fromSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const quote = selection.toString().trim();
    if (!quote) return null;
    const range = selection.getRangeAt(0);
    const el = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) || document.body;
    const hit = locate(el);
    return { quote: quote.slice(0, 400), selector: selectorFor(hit.el), file: hit.file, line: hit.line, rect: range.getBoundingClientRect() };
  };

  const fromElement = (el) => {
    const hit = locate(el);
    const quote = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return { quote, selector: selectorFor(hit.el), file: hit.file, line: hit.line, rect: el.getBoundingClientRect() };
  };

  pill.addEventListener('click', () => setActive(!active));
  queueButton.addEventListener('click', () => toggleQueue());

  bubble.addEventListener('mousedown', (event) => event.preventDefault());

  bubble.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = lastPick || fromSelection();
    if (target) openPanel(target, target.rect);
  });

  document.addEventListener('mouseup', (event) => {
    if (!active) return;
    if (event.target instanceof Element && event.target.closest('[data-dev-comments]')) return;
    setTimeout(() => {
      const target = fromSelection();
      if (!target) {
        bubble.style.display = 'none';
        return;
      }
      bubble.style.left = `${Math.min(Math.max(8, target.rect.left), window.innerWidth - 60)}px`;
      bubble.style.top = `${target.rect.bottom + 6}px`;
      bubble.style.display = 'block';
      lastPick = target;
    }, 0);
  });

  document.addEventListener(
    'click',
    (event) => {
      if (!active || !(event.target instanceof Element) || event.target.closest('[data-dev-comments]')) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openPanel(fromElement(event.target), event.target.getBoundingClientRect());
    },
    true,
  );

  panel.addEventListener('submit', async (event) => {
    event.preventDefault();
    const comment = textEl.value.trim();
    if (!comment || !pending) return;
    const save = panel.querySelector('.save');
    save.disabled = true;
    try {
      const res = await fetch('/__dev-comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: pageKey(), quote: pending.quote, comment, sourceFile: pending.file, sourceLine: pending.line, selector: pending.selector }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      closePanel();
      window.getSelection()?.removeAllRanges();
      await refresh();
      say(`已保存 #${data.comment.id}；说出「处理评论」我就会读取`);
    } catch (error) {
      say(`保存失败：${error.message}`);
    } finally {
      save.disabled = false;
    }
  });

  panel.querySelector('.cancel').addEventListener('click', closePanel);

  copyEl.addEventListener('click', () => {
    if (!pending?.file) return;
    const value = `${pending.file}:${pending.line}`;
    if (navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {});
    say(`已复制 ${shortPath(pending.file)}:${pending.line}`);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (panel.style.display === 'block') {
        closePanel();
        event.preventDefault();
      } else if (queuePanel.style.display === 'block') {
        toggleQueue(false);
        event.preventDefault();
      } else if (active) {
        setActive(false);
        event.preventDefault();
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && panel.style.display === 'block') {
      panel.requestSubmit();
      event.preventDefault();
    }
  });

  window.addEventListener('scroll', drawDots, { passive: true });
  window.addEventListener('resize', drawDots);

  refresh();
})();
