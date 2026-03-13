document.addEventListener('DOMContentLoaded', () => {
  const recordBtn = document.getElementById('recordBtn');
  const playBtn = document.getElementById('playBtn');
  const repeatCount = document.getElementById('repeatCount');
  const statusDiv = document.getElementById('status');

  let isRecording = false;

  recordBtn.addEventListener('click', () => {
    isRecording = !isRecording;
    
    if (isRecording) {
      recordBtn.textContent = '⏹ Остановить запись';
      statusDiv.textContent = 'Идет запись...';
      sendMessage({ action: "startRecording" });
    } else {
      recordBtn.textContent = '🔴 Начать запись';
      statusDiv.textContent = 'Запись сохранена';
      sendMessage({ action: "stopRecording" });
    }
  });

  playBtn.addEventListener('click', () => {
    const count = parseInt(repeatCount.value, 10);
    if (isNaN(count) || count < 1) {
      statusDiv.textContent = 'Введите корректное число';
      return;
    }
    
    statusDiv.textContent = `Повторяем ${count} раз...`;
    sendMessage({ action: "playRecording", count: count });
  });

  function sendMessage(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }
});