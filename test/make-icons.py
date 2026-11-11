"""Generate original UltraFill PNGs using Python standard library only."""
from pathlib import Path
import struct
import zlib
root = Path(__file__).resolve().parent.parent / 'icons'
def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
for size in (16, 32, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            a, b = x / size, y / size
            border = .12 < a < .88 and .24 < b < .76 and not (.18 < a < .82 and .30 < b < .70)
            arrows = abs(b - .5) < .035 and .26 < a < .74 or abs(abs(a-.5)-.23) + abs(b-.5) < .13
            rows.extend((236, 245, 255, 255) if border or arrows else (35, 100, 225, 255))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')
    (root / f'{size}.png').write_bytes(png)
print('Generated 4 original PNG icons')
