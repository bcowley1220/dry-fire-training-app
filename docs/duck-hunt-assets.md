# Duck Hunt asset provenance

- Background: `static/duck-hunt/marsh.png`, generated originally for this project with OpenAI image generation on 2026-10-27. Source preserved unchanged; neutral grayscale conversion happens on loading, before rendering.
- Duck: original code-drawn seven-frame, transparent `64×40` sprite cells in `src/lib/games/duck-hunt/art.js`. Four flap poses, hit pose and two fall poses; flipped independently by Phaser.
- Dog: original code-drawn shaggy marsh companion with floppy ears, pale brow and square muzzle; waiting/wagging, retrieval and miss poses in the same module.
- Reeds/water: original code-drawn environmental overlay.
- HUD alphabet: reuses the project's original bitmap alphabet, extended with `%`.
- Sounds: original Web Audio triangle tones. No samples, Nintendo sprites, sound effects, level artwork or other third-party game assets.

Background generation prompt:

> Create an ORIGINAL 16-bit pixel-art background layer for a grayscale marshland duck-hunting arcade game titled Duck Hunt Arcade. This must NOT copy Nintendo Duck Hunt or any existing game layout or sprites. Wide landscape 16:9. Detailed quiet dusk wetland in NEUTRAL GRAYSCALE ONLY. Deliberately limited medium-dark palette: black, #181818, #303030, #555555, #777777, #999999, small #bbbbbb highlights. No blue/brown/sepia/green, every visible pixel should have equal RGB. Open moderately dark cloudy sky occupying the upper 65 percent of image, distant misty hills and irregular treeline at lower horizon, layered lake/marsh water in lower third, reeds and sedges framing bottom and side edges, weathered small hunting blind far right, several cloud silhouettes. Pixel art coarse enough to read well on an inexpensive projector, crisp dithering, atmospheric depth, subtle water reflections, restrained brightness. Main middle sky remains clear for separately animated birds flying left/right. Foreground reeds form a separate-looking near layer at bottom edge. No ducks, no birds, no dog, no people, no guns, no text, no logo, no HUD, no menus, no reticles, no bright flashes. Produce only a replaceable background asset. Original art with a calm moonlit marsh identity, coherent SNES era pixel aesthetic.
