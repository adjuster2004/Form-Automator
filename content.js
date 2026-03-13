// --- 1. СОЗДАНИЕ ИНТЕРФЕЙСА ---
const style = document.createElement('style');
style.textContent = `
  #fa-wrap { position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: Arial, sans-serif; }
  #fa-toggle { background: #007bff; color: white; border: none; border-radius: 50px; padding: 12px 20px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2); transition: transform 0.2s; }
  #fa-toggle:hover { transform: scale(1.05); }
  #fa-menu { display: none; background: white; border: 1px solid #ccc; border-radius: 8px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 220px; }
  #fa-menu.active { display: block; }
  #fa-menu button { width: 100%; padding: 8px; margin-bottom: 10px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #f8f9fa; }
  #fa-menu button:hover { background: #e2e6ea; }
  #fa-menu input { width: calc(100% - 18px); padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; }
  #fa-status { font-size: 12px; color: gray; text-align: center; margin-top: 5px; }
`;
document.head.appendChild(style);

const uiHtml = `
  <div id="fa-menu">
    <h4 style="margin: 0 0 10px 0; text-align: center;">Автоматизатор</h4>
    <button id="fa-recordBtn">🔴 Начать запись</button>
    <input type="number" id="fa-repeatCount" placeholder="Повторов" min="1" value="1">
    <button id="fa-playBtn">▶️ Начать повторы</button>
    <div id="fa-status">Готов к работе</div>
  </div>
  <button id="fa-toggle">🛠 Автоматизатор</button>
`;

const wrap = document.createElement('div');
wrap.id = 'fa-wrap';
wrap.innerHTML = uiHtml;
document.body.appendChild(wrap);

// --- ВИЗУАЛЬНЫЕ УВЕДОМЛЕНИЯ ПРИ ЗАПИСИ ---
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(40, 167, 69, 0.9); color:white; padding:8px 16px; border-radius:8px; z-index:9999999; font-size:14px; pointer-events:none; transition: opacity 0.5s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);";
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 800);
}

// --- 2. ЛОГИКА ИНТЕРФЕЙСА ---
const toggleBtn = document.getElementById('fa-toggle');
const menu = document.getElementById('fa-menu');
const recordBtn = document.getElementById('fa-recordBtn');
const playBtn = document.getElementById('fa-playBtn');
const repeatInput = document.getElementById('fa-repeatCount');
const statusDiv = document.getElementById('fa-status');

let isRecording = false;
let events = [];

toggleBtn.addEventListener('click', () => menu.classList.toggle('active'));

recordBtn.addEventListener('click', () => {
  isRecording = !isRecording;
  if (isRecording) {
    events = []; 
    recordBtn.textContent = '⏹ Остановить запись';
    statusDiv.textContent = 'Идет запись...';
  } else {
    recordBtn.textContent = '🔴 Начать запись';
    statusDiv.textContent = `Записано действий: ${events.length}`;
    chrome.storage.local.set({ recordedEvents: events });
  }
});

playBtn.addEventListener('click', () => {
  const count = parseInt(repeatInput.value, 10);
  if (isNaN(count) || count < 1) return (statusDiv.textContent = 'Введите число!');
  
  chrome.storage.local.get(['recordedEvents'], async (result) => {
    let savedEvents = result.recordedEvents || [];
    if (savedEvents.length === 0) return (statusDiv.textContent = 'Нет записи!');

    playBtn.disabled = true;

    for (let i = 0; i < count; i++) {
      statusDiv.textContent = `Цикл ${i + 1} из ${count}...`;
      await playEvents(savedEvents);
      await new Promise(r => setTimeout(r, 1500)); // Пауза перед новым циклом
    }
    
    statusDiv.textContent = 'Готово!';
    playBtn.disabled = false;
  });
});

// --- 3. УМНАЯ ЗАПИСЬ ДЕЙСТВИЙ ---
function getCssPath(el) {
  if (!(el instanceof Element)) return null;
  if (el.id && el.id.startsWith('fa-')) return null;

  let path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    
    // Уникальные маркеры
    if (el.dataset && el.dataset.testid) {
      selector += `[data-testid="${el.dataset.testid}"]`;
      path.unshift(selector); break; 
    }
    if (el.name) {
      selector += `[name="${el.name}"]`;
      path.unshift(selector); break;
    }
    // Поддержка редактора текста (Quill)
    if (el.classList && el.classList.contains('ql-editor')) {
      selector += '.ql-editor';
      path.unshift(selector); break;
    }
    if (el.id && !/\d/.test(el.id)) {
      selector += '#' + el.id;
      path.unshift(selector); break;
    } 
    
    let sib = el, nth = 1;
    while (sib = sib.previousElementSibling) {
      if (sib.nodeName.toLowerCase() == selector) nth++;
    }
    if (nth != 1) selector += ":nth-of-type("+nth+")";
    
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

let lastActionTime = 0;

// ЗАПИСЫВАЕМ ВВОД ТЕКСТА (МОМЕНТАЛЬНО)
document.addEventListener('input', (e) => {
  if (!isRecording) return;
  if (e.target.type === 'checkbox' || e.target.type === 'radio') return;

  const path = getCssPath(e.target);
  if (!path) return;

  // Если это редактор текста - берем HTML, иначе обычный value
  let val = e.target.isContentEditable ? e.target.innerHTML : e.target.value;
  
  // Оптимизация: если мы всё еще печатаем в то же поле, просто обновляем его значение,
  // чтобы не плодить 100 событий на каждую букву
  let lastEvent = events[events.length - 1];
  if (lastEvent && lastEvent.type === 'input' && lastEvent.selector === path) {
      lastEvent.value = val;
  } else {
      events.push({ 
        type: 'input', 
        selector: path, 
        value: val,
        isCE: e.target.isContentEditable
      });
      showToast('✍️ Поле захвачено');
  }
}, true);

// ЗАПИСЫВАЕМ КЛИКИ
document.addEventListener('click', (e) => {
  if (!isRecording) return;
  const path = getCssPath(e.target);
  if (!path) return; 

  const now = Date.now();
  if (now - lastActionTime < 50) return; // защита от фантомных двойных кликов
  lastActionTime = now;

  let labelFallback = null;
  let label = e.target.closest('label');
  if (label) labelFallback = label.textContent.trim();

  let text = "";
  let btn = e.target.closest('button, a');
  if (btn) {
      text = btn.textContent.trim();
  } else if (['span', 'p', 'div'].includes(e.target.tagName.toLowerCase())) {
      let elText = e.target.textContent.trim();
      if (elText.length > 0 && elText.length < 50) text = elText;
  }

  events.push({ 
    type: 'click', 
    selector: path,
    text: text,
    tagName: e.target.tagName.toLowerCase(),
    labelFallback: labelFallback
  });
  
  showToast('🖱 Клик записан');
}, true);

// --- 4. ВОСПРОИЗВЕДЕНИЕ ---
async function waitForElement(event, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      let el = document.querySelector(event.selector);
      if (el) return el;
    } catch(e) {}
    
    if (event.labelFallback) {
        let labels = Array.from(document.querySelectorAll('label'));
        let targetLabel = labels.find(l => l.textContent.trim() === event.labelFallback);
        if (targetLabel) return targetLabel;
    }
    
    if (event.text) {
        let elements = Array.from(document.querySelectorAll('button, a, span, p, div'));
        let match = elements.find(e => e.textContent.trim() === event.text);
        if (match) return match;
    }

    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

// "Пробиваем" защиту React и редакторов текста
function setReactValue(element, value, isContentEditable) {
  if (isContentEditable || element.isContentEditable || element.classList.contains('ql-editor')) {
      element.innerHTML = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return;
  }
  
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  
  if (nativeInputValueSetter && element.tagName.toLowerCase() === 'input') {
    nativeInputValueSetter.call(element, value);
  } else if (nativeTextAreaValueSetter && element.tagName.toLowerCase() === 'textarea') {
    nativeTextAreaValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Полная имитация движения и нажатия мыши
function simulateClick(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mouseover', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
}

async function playEvents(savedEvents) {
  for (let event of savedEvents) {
    let el = await waitForElement(event);
    
    if (!el) {
      console.warn("⚠️ Пропущен элемент:", JSON.stringify(event));
      continue;
    }

    if (event.type === 'input') {
      setReactValue(el, event.value, event.isCE);
    } 
    else if (event.type === 'click') {
      simulateClick(el);
    }
    
    await new Promise(r => setTimeout(r, 600)); // Ждем реакции интерфейса
  }
}