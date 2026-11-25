/**
 * Low-saturation Morandi colors for the whole picture-book scene.
 * Dusty rose is the warm end of daytime. Sunset shifts toward gray-pink
 * and blue-violet — still dusty, never a saturated orange or red.
 */
export const palette = {
  hazeBlue: '#8FA3B8',
  mistGray: '#B8BEC6',
  offWhite: '#F2EFE9',
  mutedSage: '#A9B5A0',
  dustyRose: '#C9A9A6',
  /** Blue-violet haze for the sunset crown. */
  duskViolet: '#908CA3',
  /** Gray-lilac band between the crown and the warm horizon. */
  duskLilac: '#A89AAB',
  /** Warm gray-pink. The brightest sunset color, still dusty. */
  warmAsh: '#CDB6B1',
  /** Pale warm horizon, just off the daytime milk. */
  duskMilk: '#E6D9D4',
  /** Fog while the sun is low. */
  duskFog: '#C3B4B6',
  /** Mist gray dark enough to read on off-white. */
  ink: '#5C656E',
} as const
