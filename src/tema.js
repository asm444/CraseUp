(function (raiz) {
  const claroNoSistema = matchMedia('(prefers-color-scheme: light)');

  function temaEfetivo(tema) {
    if (tema === 'claro' || tema === 'escuro') return tema;
    return claroNoSistema.matches ? 'claro' : 'escuro';
  }

  function aplicar(tema) {
    const html = document.documentElement;
    if (tema === 'claro' || tema === 'escuro') html.dataset.tema = tema;
    else delete html.dataset.tema;
    html.dataset.efetivo = temaEfetivo(tema);
  }

  async function atual() {
    const { tema = 'auto' } = await chrome.storage.local.get('tema');
    return tema;
  }

  async function alternar() {
    const tema = await atual();
    await chrome.storage.local.set({ tema: temaEfetivo(tema) === 'claro' ? 'escuro' : 'claro' });
  }

  atual().then(aplicar);
  claroNoSistema.addEventListener('change', () => atual().then(aplicar));
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && mudancas.tema) aplicar(mudancas.tema.newValue);
  });

  raiz.RevisorTema = { atual, alternar };
})(globalThis);
