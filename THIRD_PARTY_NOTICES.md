# Third-party notices

## Koffi

- Source: https://github.com/Koromix/koffi
- Use: calls public Win32 display, window and GDI capture APIs from the isolated child process.
- License: MIT

## pngjs

- Source: https://github.com/pngjs/pngjs
- Use: encodes in-memory RGBA pixels as PNG before sending them to the configured vision endpoint.
- License: MIT

## Architectural reference

The child-process isolation, display-layout validation and privacy boundaries were informed by the public documentation and source layout of Pal-AI-Lab/Coopanion. Coopanion is AGPL-3.0-or-later. This extension does not include or copy Coopanion source code; its Windows implementation is an independent implementation over documented Win32 APIs.
