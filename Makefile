CONTAINER ?= $(shell command -v podman >/dev/null 2>&1 && echo podman || echo docker)
IMAGEM_LT := docker.io/erikvl87/languagetool
NOME_LT := languagetool
PORTA_LT := 8010
ENDERECO_LT := http://localhost:$(PORTA_LT)

.PHONY: ajuda instalar languagetool languagetool-parar languagetool-status testes pacote

ajuda:
	@echo "make instalar             sobe o LanguageTool nesta máquina e mostra como carregar a extensão"
	@echo "make languagetool         sobe (ou religa) o LanguageTool em $(ENDERECO_LT)"
	@echo "make languagetool-parar   para o LanguageTool"
	@echo "make languagetool-status  confere se o LanguageTool responde"
	@echo "make testes               roda as suítes no Chrome sem janela"
	@echo "make pacote               gera dist/craseup-<versão>.zip"

instalar: languagetool languagetool-status
	@echo
	@echo "LanguageTool pronto em $(ENDERECO_LT). Falta carregar a extensão:"
	@echo "  1. Abra chrome://extensions e ligue o Modo do desenvolvedor."
	@echo "  2. Clique em Carregar sem compactação e escolha: $(CURDIR)"
	@echo "  3. Na tela que abre, cole a chave do OpenRouter e clique em Testar e salvar."
	@echo "Sem servidor configurado, a extensão usa $(ENDERECO_LT) sozinha."

languagetool:
	@command -v $(CONTAINER) >/dev/null 2>&1 || { echo "Instale podman ou docker antes."; exit 1; }
	@if $(CONTAINER) inspect $(NOME_LT) >/dev/null 2>&1; then \
		$(CONTAINER) start $(NOME_LT) >/dev/null; \
	else \
		$(CONTAINER) run -d --name $(NOME_LT) --restart unless-stopped -p 127.0.0.1:$(PORTA_LT):8010 $(IMAGEM_LT) >/dev/null; \
	fi
	@echo "LanguageTool subindo em $(ENDERECO_LT) ($(CONTAINER))."

languagetool-parar:
	@$(CONTAINER) stop $(NOME_LT) >/dev/null && echo "LanguageTool parado."

languagetool-status:
	@for i in $$(seq 1 60); do \
		if curl -sf -d 'language=pt-BR' --data-urlencode 'text=Vou a praia.' $(ENDERECO_LT)/v2/check | grep -q '"matches"'; then \
			echo "LanguageTool respondendo em $(ENDERECO_LT)."; exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "LanguageTool não respondeu em $(ENDERECO_LT) depois de 2 minutos."; exit 1

testes:
	bash tests/rodar.sh

pacote:
	bash tools/empacotar.sh
