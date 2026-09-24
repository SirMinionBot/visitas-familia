#!/usr/bin/env python3
"""Genera dos PNGs placeholder (cuadrado azul sólido) como iconos PWA."""
import struct, zlib, os

def make_png(path: str, size: int) -> None:
    r, g, b = 0x1f, 0x6f, 0xeb  # azul #1f6feb
    raw = b''
    for _ in range(size):
        raw += b'\x00' + bytes([r, g, b]) * size
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    pub = os.path.join(here, '..', 'public')
    os.makedirs(pub, exist_ok=True)
    make_png(os.path.join(pub, 'pwa-192x192.png'), 192)
    make_png(os.path.join(pub, 'pwa-512x512.png'), 512)
    print('Generados:', os.listdir(pub))
