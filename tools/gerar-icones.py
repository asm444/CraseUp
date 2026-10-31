import math
import struct
import sys
import zlib
from pathlib import Path

FUNDO = (0x1F, 0x1D, 0x24)
ONDA = (0xE2, 0x6D, 0x7C)
LETRA = (0xED, 0xE6, 0xDA)
AMOSTRAS = 4


def dentro_do_quadrado(x, y, raio):
    cx = min(max(x, raio), 1 - raio)
    cy = min(max(y, raio), 1 - raio)
    return (x - cx) ** 2 + (y - cy) ** 2 <= raio ** 2


def na_letra(x, y):
    espessura = 0.11
    haste = 0.30 <= x <= 0.30 + espessura and 0.20 <= y <= 0.62
    raio_ext, raio_int = 0.20, 0.20 - espessura
    cx, cy = 0.41, 0.36
    d = math.hypot(x - cx, y - cy)
    arco = raio_int <= d <= raio_ext and x >= cx and y <= cy + 0.03
    topo = 0.30 <= x <= cx and 0.16 <= y <= 0.16 + espessura
    return haste or arco or topo


def na_onda(x, y):
    centro = 0.77 + 0.045 * math.sin((x - 0.18) * 2 * math.pi * 2.2)
    return 0.18 <= x <= 0.82 and abs(y - centro) <= 0.045


def cor(x, y):
    if not dentro_do_quadrado(x, y, 0.22):
        return None
    if na_onda(x, y):
        return ONDA
    if na_letra(x, y):
        return LETRA
    return FUNDO


def png(tamanho):
    linhas = bytearray()
    for py in range(tamanho):
        linhas.append(0)
        for px in range(tamanho):
            soma = [0, 0, 0]
            cobertura = 0
            for sy in range(AMOSTRAS):
                for sx in range(AMOSTRAS):
                    c = cor((px + (sx + 0.5) / AMOSTRAS) / tamanho, (py + (sy + 0.5) / AMOSTRAS) / tamanho)
                    if c:
                        cobertura += 1
                        soma = [a + b for a, b in zip(soma, c)]
            if cobertura:
                linhas.extend(round(v / cobertura) for v in soma)
                linhas.append(round(255 * cobertura / AMOSTRAS ** 2))
            else:
                linhas.extend((0, 0, 0, 0))

    def bloco(tipo, dados):
        return struct.pack('>I', len(dados)) + tipo + dados + struct.pack('>I', zlib.crc32(tipo + dados))

    cabecalho = struct.pack('>IIBBBBB', tamanho, tamanho, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', cabecalho) + bloco(b'IDAT', zlib.compress(bytes(linhas), 9)) + bloco(b'IEND', b'')


destino = Path(sys.argv[1])
for tamanho in (16, 32, 48, 128):
    (destino / f'icone-{tamanho}.png').write_bytes(png(tamanho))
    print(f'icone-{tamanho}.png')
