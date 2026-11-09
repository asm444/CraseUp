globalThis.RevisorCoresClarasDaCamada = `
  --fundo: #F7F4EE;
  --fundo-elevado: #FFFFFF;
  --borda: #E2DCD0;
  --texto: #1C1E27;
  --texto-suave: #646A79;
  --gramatica: #D6404E;
  --clareza: #0E9F86;
  --palavra: #B87A00;
  --tom: #6B57E8;
  --sobre-acento: #FFFFFF;
  --sombra: rgba(40, 32, 20, 0.16);
`;

globalThis.RevisorEstiloDaCamada = `:host {
  --fundo: #12141B;
  --fundo-elevado: #1A1D27;
  --borda: #282C3A;
  --texto: #EEEAE3;
  --texto-suave: #9BA1B2;
  --gramatica: #F2707A;
  --clareza: #3DD6B5;
  --palavra: #F5B83D;
  --tom: #A594FF;
  --sobre-acento: #0D0F15;
  --sombra: rgba(4, 5, 10, 0.55);
}

.espelho {
  position: absolute;
  margin: 0;
  overflow: hidden;
  color: transparent;
  background: transparent;
  border-style: solid;
  border-color: transparent;
  pointer-events: none;
  scrollbar-width: none;
}
.espelho::-webkit-scrollbar { display: none; }

.marca {
  color: transparent;
  text-decoration-line: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  text-decoration-skip-ink: none;
}
.traco { position: absolute; height: 4px; pointer-events: none; box-sizing: border-box; }
.traco-gramatica { background: radial-gradient(circle at 50% 0, transparent 2px, var(--gramatica) 2px 3.2px, transparent 3.2px) 0 0 / 6px 4px repeat-x; }
.traco-clareza { border-bottom: 2px solid var(--clareza); }
.traco-palavra { border-bottom: 2px dotted var(--palavra); }
.traco-tom { border-bottom: 2px dashed var(--tom); }
.marca-gramatica { text-decoration-style: wavy; text-decoration-color: var(--gramatica); }
.marca-clareza { text-decoration-style: solid; text-decoration-color: var(--clareza); }
.marca-palavra { text-decoration-style: dotted; text-decoration-color: var(--palavra); }
.marca-tom { text-decoration-style: dashed; text-decoration-color: var(--tom); }

.cartao {
  --cor: var(--gramatica);
  position: absolute;
  width: max-content;
  max-width: min(360px, calc(100vw - 16px));
  min-width: 240px;
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--fundo);
  color: var(--texto);
  border: 1px solid var(--borda);
  border-top: 3px solid var(--cor);
  border-radius: 14px;
  box-shadow: 0 12px 32px var(--sombra);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto;
  animation: surgir 120ms ease-out;
}
.cartao .origem { margin: 0 0 8px; font-size: 11px; color: var(--texto-suave); }
.cartao-clareza { --cor: var(--clareza); }
.cartao-palavra { --cor: var(--palavra); }
.cartao-tom { --cor: var(--tom); }

@keyframes surgir {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

.cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.navegacao { display: flex; align-items: center; gap: 2px; }
.pagina { font-size: 12px; color: var(--texto-suave); padding: 0 4px; }

.tipo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--texto-suave);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tipo::before {
  content: "";
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cor);
}

.previa {
  margin: 0 0 6px;
  max-height: 7.5em;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.de {
  color: var(--texto-suave);
  text-decoration: line-through;
  text-decoration-color: var(--cor-da-troca, var(--cor));
}
.para {
  padding: 0 3px;
  margin-left: 2px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--cor-da-troca, var(--cor)) 22%, transparent);
  color: var(--texto);
  font-weight: 600;
}
.de-gramatica, .para-gramatica, .motivo-gramatica { --cor-da-troca: var(--gramatica); }
.de-clareza, .para-clareza, .motivo-clareza { --cor-da-troca: var(--clareza); }
.de-palavra, .para-palavra, .motivo-palavra { --cor-da-troca: var(--palavra); }
.de-tom, .para-tom, .motivo-tom { --cor-da-troca: var(--tom); }

.motivos {
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
  max-height: 4.2em;
  overflow-y: auto;
  color: var(--texto-suave);
  font-size: 12px;
}
.motivo { display: flex; gap: 6px; align-items: baseline; }
.motivo::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cor-da-troca);
  transform: translateY(-1px);
}

.tons {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--texto-suave);
  font-size: 12px;
}
.escolha-tom {
  font: inherit;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid var(--borda);
  background: var(--fundo-elevado);
  color: var(--texto);
  cursor: pointer;
}
.escolha-tom:focus-visible { outline: 2px solid var(--tom); outline-offset: 1px; }

.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
button {
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  border-radius: 999px;
  padding: 4px 12px;
  border: 1px solid var(--borda);
  background: var(--fundo-elevado);
  color: var(--texto);
  transition: background 120ms, border-color 120ms;
}
button:hover { border-color: var(--cor); }
button:focus-visible { outline: 2px solid var(--cor); outline-offset: 2px; }
button.aplicar {
  background: var(--cor);
  border-color: var(--cor);
  color: var(--sobre-acento);
  font-weight: 600;
}
button.aplicar:hover { filter: brightness(1.08); }
button.seta, button.fechar {
  padding: 0 7px;
  border-color: transparent;
  background: transparent;
  color: var(--texto-suave);
  font-size: 15px;
  line-height: 22px;
}
button.seta:hover, button.fechar:hover { color: var(--texto); border-color: var(--borda); }
`;
